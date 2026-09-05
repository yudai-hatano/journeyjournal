// ============================================================================
// コラム一覧(/column/index.html)公開側スクリプト
// Firestore の columns コレクションから公開日順に取得し、カード一覧を表示します。
// Firebase未設定・データ0件の間は、準備中メッセージをそのまま表示します。
// ============================================================================

import { firestore, isFirebaseConfigured } from "./firebase-config.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const grid = document.getElementById("columnGrid");
const emptyEl = document.getElementById("columnEmpty");

if (isFirebaseConfigured && firestore && grid) {
  const columnsRef = query(collection(firestore, "columns"), orderBy("publishDate", "desc"));

  onSnapshot(columnsRef, (snapshot) => {
    grid.querySelectorAll(".column-card").forEach((el) => el.remove());

    if (snapshot.empty) {
      if (emptyEl) emptyEl.classList.remove("is-hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("is-hidden");

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      const card = document.createElement("a");
      card.className = "column-card";
      card.href = `post.html?slug=${encodeURIComponent(item.slug || docSnap.id)}`;

      const tag = document.createElement("span");
      tag.className = "column-card__tag";
      tag.textContent = item.category || "コラム";

      const title = document.createElement("h2");
      title.className = "column-card__title";
      title.textContent = item.title || "";

      const excerpt = document.createElement("p");
      excerpt.className = "column-card__excerpt";
      excerpt.textContent = makeExcerpt(item.body);

      const date = document.createElement("span");
      date.className = "column-card__date";
      date.textContent = formatDate(item.publishDate);

      card.append(tag, title, excerpt, date);
      grid.appendChild(card);
    });
  }, (error) => {
    console.error("コラムの取得に失敗しました:", error);
  });
}

function makeExcerpt(body) {
  if (!body) return "";
  const text = stripHtml(body);
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 70 ? flat.slice(0, 70) + "…" : flat;
}

function stripHtml(html) {
  const div = document.createElement("div");
  // 一覧のカードにはテキストのみを抜粋表示するため、装飾タグを除去する(表示はtextContent経由のみ)
  div.innerHTML = window.DOMPurify
    ? window.DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    : "";
  return div.textContent || html;
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
