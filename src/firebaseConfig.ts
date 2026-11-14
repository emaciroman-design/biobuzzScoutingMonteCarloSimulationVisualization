import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDfprUN0BquHz2-jOTkdg4ZYBO5bQOwhFM",
  authDomain: "biobuzz-scouting.firebaseapp.com",
  projectId: "biobuzz-scouting",
  storageBucket: "biobuzz-scouting.firebasestorage.app",
  messagingSenderId: "848050115756",
  appId: "1:848050115756:web:bc497c9b93434a5348fb09"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
