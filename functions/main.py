import random
import math
from firebase_functions import firestore_fn
from firebase_admin import initialize_app, firestore, get_app

try:
    get_app()
except ValueError:
    initialize_app()


def compute_score(entry: dict) -> float:
    score = 0.0
    if entry.get("leaveAuto"):
        score += 3
    if entry.get("parkAuto"):
        score += 5
    score += entry.get("tipsAuto", 0) * 20
    score += entry.get("tipsTeleop", 0) * 20
    score += entry.get("autoShotsSucc", 0) * 2
    score += entry.get("teleopShotsSucc", 0) * 2
    score += entry.get("pollenFlowers", 0) * 2
    score += entry.get("nectarFlowers", 0) * 2
    if entry.get("endgamePark"):
        score += 5
    return score


@firestore_fn.on_document_created(document="rawEntries/{docId}")
def run_simulation(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    db = firestore.client()

    data = event.data.to_dict()
    team_number = data.get("teamNumber")
    if not team_number:
        return

    team_number = str(team_number)

    entries_ref = db.collection("rawEntries")
    docs = list(entries_ref.where("teamNumber", "==", int(team_number)).stream())
    if not docs:
        docs = list(entries_ref.where("teamNumber", "==", team_number).stream())
    if not docs:
        return

    match_scores = [compute_score(d.to_dict()) for d in docs]
    n = len(match_scores)
    avg = sum(match_scores) / n
    std_dev = math.sqrt(sum((s - avg) ** 2 for s in match_scores) / max(n - 1, 1)) if n > 1 else 10.0

    NUM_SIMULATIONS = 10_000
    wins = 0
    sim_scores = []

    for _ in range(NUM_SIMULATIONS):
        sim_score = max(0.0, random.gauss(avg, std_dev))
        opp_score = max(0.0, random.gauss(60, 25))
        sim_scores.append(sim_score)
        if sim_score > opp_score:
            wins += 1

    sim_scores.sort()

    result = {
        "teamNumber": team_number,
        "matchesAnalyzed": n,
        "observedAvg": round(avg, 2),
        "observedStdDev": round(std_dev, 2),
        "observedMin": round(min(match_scores), 2),
        "observedMax": round(max(match_scores), 2),
        "winProbability": round(wins / NUM_SIMULATIONS, 4),
        "simAvg": round(sum(sim_scores) / NUM_SIMULATIONS, 2),
        "simMin": round(sim_scores[0], 2),
        "simMax": round(sim_scores[-1], 2),
        "p10": round(sim_scores[int(0.10 * NUM_SIMULATIONS)], 2),
        "p25": round(sim_scores[int(0.25 * NUM_SIMULATIONS)], 2),
        "p50": round(sim_scores[int(0.50 * NUM_SIMULATIONS)], 2),
        "p75": round(sim_scores[int(0.75 * NUM_SIMULATIONS)], 2),
        "p90": round(sim_scores[int(0.90 * NUM_SIMULATIONS)], 2),
        "numSimulations": NUM_SIMULATIONS,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }

    db.collection("simulationResults").document(team_number).set(result)
    print(f"Team {team_number}: winProb={wins/NUM_SIMULATIONS:.3f}, avg={avg:.1f}, n={n}")