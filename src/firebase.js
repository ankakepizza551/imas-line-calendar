import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// TODO: さきほどコピーした firebaseConfig の中身をここに貼り付けます！
const firebaseConfig = {
 apiKey: "AIzaSyC0tQBgypo8n1XCwVh7UGIxEM3QGfy9mGQ",
  authDomain: "imas-line--calendar.firebaseapp.com",
  projectId: "imas-line--calendar",
  storageBucket: "imas-line--calendar.firebasestorage.app",
  messagingSenderId: "439874093522",
  appId: "1:439874093522:web:08a25e7ac5bba42e59880b",
  measurementId: "G-N7GNMJJZ1S"
};

// Firebaseを初期化
const app = initializeApp(firebaseConfig);

// データベース（Firestore）を使うための準備をしてエクスポート
export const db = getFirestore(app);
export const auth = getAuth(app);
