// ============================================================================
// 管理画面(/admin.html)スクリプト
// Firebase Authentication でログインした管理者のみ、お知らせの追加・編集・削除が可能です。
// ============================================================================

import { db, auth, isFirebaseConfigured } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref,
  push,
  update,
  remove,
  query,
  orderByChild,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const userEmailEl = document.getElementById("userEmail");

const newsForm = document.getElementById("newsForm");
const newsFormTitle = document.getElementById("newsFormTitle");
const newsIdInput = document.getElementById("newsId");
const titleInput = document.getElementById("titleInput");
const bodyInput = document.getElementById("bodyInput");
const dateInput = document.getElementById("dateInput");
const categoryInput = document.getElementById("categoryInput");
const resetFormBtn = document.getElementById("resetFormBtn");
const adminNewsList = document.getElementById("adminNewsList");
const configWarning = document.getElementById("configWarning");

if (!isFirebaseConfigured) {
  configWarning.classList.add("is-visible");
  loginForm.querySelector("button[type=submit]").disabled = true;
} else {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginSection.classList.add("is-hidden");
      adminSection.classList.remove("is-hidden");
      userEmailEl.textContent = user.email;
      watchNews();
    } else {
      loginSection.classList.remove("is-hidden");
      adminSection.classList.add("is-hidden");
    }
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      loginError.textContent = "ログインに失敗しました。メールアドレスとパスワードをご確認ください。";
    }
  });

  logoutBtn.addEventListener("click", () => signOut(auth));

  newsForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      title: titleInput.value.trim(),
      body: bodyInput.value.trim(),
      date: dateInput.value || new Date().toISOString().slice(0, 10),
      category: categoryInput.value,
      updatedAt: Date.now()
    };

    const editingId = newsIdInput.value;

    try {
      if (editingId) {
        await update(ref(db, `news/${editingId}`), payload);
      } else {
        payload.createdAt = Date.now();
        await push(ref(db, "news"), payload);
      }
      resetForm();
    } catch (err) {
      alert("保存に失敗しました: " + err.message);
    }
  });

  resetFormBtn.addEventListener("click", resetForm);
}

function resetForm() {
  newsIdInput.value = "";
  newsForm.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  newsFormTitle.textContent = "お知らせを新規追加";
  resetFormBtn.classList.add("is-hidden");
}

function watchNews() {
  const newsRef = query(ref(db, "news"), orderByChild("date"));

  onValue(newsRef, (snapshot) => {
    adminNewsList.innerHTML = "";

    if (!snapshot.exists()) {
      adminNewsList.innerHTML = '<li class="admin-news-empty">まだお知らせがありません。</li>';
      return;
    }

    const items = [];
    snapshot.forEach((child) => items.push({ id: child.key, ...child.val() }));
    items.reverse();

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "admin-news-item";
      li.innerHTML = `
        <div class="admin-news-item__main">
          <span class="admin-news-item__date">${escapeHtml(item.date || "")}</span>
          <span class="admin-news-item__tag">${escapeHtml(item.category || "")}</span>
          <span class="admin-news-item__title">${escapeHtml(item.title || "")}</span>
        </div>
        <div class="admin-news-item__actions">
          <button type="button" class="btn-mini" data-action="edit">編集</button>
          <button type="button" class="btn-mini btn-mini--danger" data-action="delete">削除</button>
        </div>
      `;

      li.querySelector('[data-action="edit"]').addEventListener("click", () => {
        newsIdInput.value = item.id;
        titleInput.value = item.title || "";
        bodyInput.value = item.body || "";
        dateInput.value = item.date || "";
        categoryInput.value = item.category || "お知らせ";
        newsFormTitle.textContent = "お知らせを編集";
        resetFormBtn.classList.remove("is-hidden");
        newsForm.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      li.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        if (!confirm("このお知らせを削除しますか?")) return;
        try {
          await remove(ref(db, `news/${item.id}`));
        } catch (err) {
          alert("削除に失敗しました: " + err.message);
        }
      });

      adminNewsList.appendChild(li);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// 初期状態:日付欄に今日の日付をセット
document.addEventListener("DOMContentLoaded", () => {
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
});
