// ============================================================================
// お知らせ(News)公開側スクリプト
// Firebase Realtime Database から新着順に取得し、リアルタイム表示します。
// Firebase未設定の間は、index.html に書かれたサンプルのお知らせをそのまま表示します。
// ============================================================================

import { db, isFirebaseConfigured } from "./firebase-config.js";
import { ref, query, orderByChild, limitToLast, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const newsList = document.getElementById("newsList");

if (isFirebaseConfigured && db && newsList) {
  const newsRef = query(ref(db, "news"), orderByChild("date"), limitToLast(30));

  onValue(newsRef, (snapshot) => {
    if (!snapshot.exists()) {
      // データが1件も無い場合は、既存のサンプル表示をそのまま残す
      return;
    }

    const items = [];
    snapshot.forEach((child) => {
      items.push({ id: child.key, ...child.val() });
    });
    items.reverse(); // 新着順(日付降順)

    newsList.innerHTML = "";

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "news-item";

      const date = document.createElement("span");
      date.className = "news-item__date";
      date.textContent = formatDate(item.date);

      const tag = document.createElement("span");
      tag.className = "news-item__tag";
      tag.dataset.cat = item.category || "お知らせ";
      tag.textContent = item.category || "お知らせ";

      const title = document.createElement("span");
      title.className = "news-item__title";
      title.textContent = item.title || "";

      li.append(date, tag, title);
      newsList.appendChild(li);
    });
  }, (error) => {
    console.error("お知らせの取得に失敗しました:", error);
  });
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).replaceAll("-", ".");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}
