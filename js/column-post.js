// ============================================================================
// コラム記事詳細(/column/post.html)公開側スクリプト
// URLパラメータ ?slug=xxx を使って、Firestore の columns コレクションから
// 該当する記事を1件取得して表示します。該当がない場合は「記事が見つかりません」と表示します。
// ============================================================================

import { firestore, isFirebaseConfigured } from "./firebase-config.js";
import { collection, query, where, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const articleEl = document.getElementById("columnArticle");

// 本文はリッチテキストエディタ経由のHTMLを許容しつつ、この範囲のタグ・属性のみに限定してサニタイズする
const SAFE_HTML_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "u", "em", "i", "span", "h2", "h3", "ul", "ol", "li"],
  ALLOWED_ATTR: ["style"]
};

async function init() {
  if (!articleEl) return;

  const slug = new URLSearchParams(window.location.search).get("slug");

  if (!slug || !isFirebaseConfigured || !firestore) {
    renderNotFound();
    return;
  }

  try {
    const q = query(collection(firestore, "columns"), where("slug", "==", slug), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      renderNotFound();
      return;
    }

    render(snapshot.docs[0].data());
  } catch (err) {
    console.error("コラムの取得に失敗しました:", err);
    renderNotFound();
  }
}

function render(item) {
  document.title = `${item.title || "コラム"} | JourneyJournal`;
  const descEl = document.getElementById("pageDescription");
  if (descEl && item.body) descEl.setAttribute("content", makeExcerpt(stripHtml(item.body)));

  const safeBody = window.DOMPurify
    ? window.DOMPurify.sanitize(item.body || "", SAFE_HTML_CONFIG)
    : escapeHtml(item.body || ""); // DOMPurifyが読み込めない場合はプレーンテキストとしてエスケープ表示

  articleEl.innerHTML = `
    <span class="column-article__tag">${escapeHtml(item.category || "コラム")}</span>
    <h1 class="column-article__title">${escapeHtml(item.title || "")}</h1>
    <span class="column-article__date">${escapeHtml(formatDate(item.publishDate))}</span>
    <div class="column-article__body">${safeBody}</div>
    <div class="column-article__cta">
      <a href="../index.html#contact" class="btn btn--primary">お問い合わせはこちら</a>
    </div>
  `;
}

function renderNotFound() {
  articleEl.innerHTML = `
    <p class="column-not-found">記事が見つかりません。</p>
    <div class="column-article__cta">
      <a href="index.html" class="btn btn--outline">コラム一覧へ戻る</a>
    </div>
  `;
}

function makeExcerpt(body) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 100 ? flat.slice(0, 100) + "…" : flat;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(html, SAFE_HTML_CONFIG) : html;
  return div.textContent || "";
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

document.addEventListener("DOMContentLoaded", init);
