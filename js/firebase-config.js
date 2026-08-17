// ============================================================================
// Firebase 設定(プレースホルダー)
// ----------------------------------------------------------------------------
// 実際にお知らせ機能を動かすには、Firebaseコンソールでプロジェクトを作成し、
// 下記の値をご自身のプロジェクトの設定値に書き換えてください。
// 手順は README.md の「Firebase設定手順」を参照してください。
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// TODO: Firebaseコンソール > プロジェクトの設定 > マイアプリ から取得した値に置き換えてください
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// プレースホルダーのままかどうかを判定(未設定時はFirebase機能を呼び出さないようにするため)
export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

let app = null;
let db = null;
let auth = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);
}

export { app, db, auth };
