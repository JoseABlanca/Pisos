import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBMYKistylAHfjnqDzLBvHI4_beDGzsatM",
  authDomain: "antigravity-finance-95cb5.firebaseapp.com",
  projectId: "antigravity-finance-95cb5",
  storageBucket: "antigravity-finance-95cb5.firebasestorage.app",
  messagingSenderId: "638353309064",
  appId: "1:638353309064:web:9d8e5539853067721a4e3d",
  measurementId: "G-ZN49BWNETJ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});
export const functions = getFunctions(app);
export const storage = getStorage(app);
