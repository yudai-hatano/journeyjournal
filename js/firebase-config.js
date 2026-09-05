// ============================================================================
// Firebase 設定
// ----------------------------------------------------------------------------
// プロジェクト: shopping-list-f4b82
// 注意: databaseURL(Realtime Database)は未設定です。Firebaseコンソールで
// 「Realtime Database」を作成すると発行されるURLを追記すると、
// お知らせ機能(Realtime Database)が有効になります。それまではお知らせ機能は
// 安全にスキップされ、index.htmlに書かれたサンプルのお知らせが表示され続けます。
// コラム機能(Firestore)・管理画面ログイン(Authentication)は下記の設定で動作します。
// 手順は README.md の「Firebase設定手順」を参照してください。
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB0zDdBhNQckdtP7WniF8u-fG80LkIowXY",
  authDomain: "shopping-list-f4b82.firebaseapp.com",
  // databaseURL: "https://shopping-list-f4b82-default-rtdb.<region>.firebasedatabase.app", // TODO: Realtime Database作成後に追記
  projectId: "shopping-list-f4b82",
  storageBucket: "shopping-list-f4b82.firebasestorage.app",
  messagingSenderId: "65221722585",
  appId: "1:65221722585:web:228e98535af12aa9cd99c8",
  measurementId: "G-LTWY6VWY01"
};

// プレースホルダーのままかどうかを判定(未設定時はFirebase機能を呼び出さないようにするため)
export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

let app = null;
let db = null;
let auth = null;
let firestore = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = getFirestore(app); // コラム機能用

  try {
    db = getDatabase(app); // お知らせ機能用。databaseURL未設定の場合は失敗するためnullのまま安全にスキップ
  } catch (err) {
    console.warn("Realtime Databaseの初期化に失敗しました(databaseURLが未設定の可能性があります):", err);
  }
}

export { app, db, auth, firestore };
