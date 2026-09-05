// ============================================================================
// 管理画面(/admin.html)スクリプト
// Firebase Authentication でログインした管理者のみ、お知らせの追加・編集・削除が可能です。
// ============================================================================

import { db, auth, firestore, isFirebaseConfigured } from "./firebase-config.js";
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
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query as fsQuery,
  orderBy as fsOrderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const columnForm = document.getElementById("columnForm");
const columnFormTitle = document.getElementById("columnFormTitle");
const columnIdInput = document.getElementById("columnId");
const columnTitleInput = document.getElementById("columnTitleInput");
const columnBodyInput = document.getElementById("columnBodyInput");
const columnCategoryInput = document.getElementById("columnCategoryInput");
const columnPublishDateInput = document.getElementById("columnPublishDateInput");
const columnSlugInput = document.getElementById("columnSlugInput");
const columnOrderInput = document.getElementById("columnOrderInput");
const resetColumnFormBtn = document.getElementById("resetColumnFormBtn");
const adminColumnList = document.getElementById("adminColumnList");
const columnFormError = document.getElementById("columnFormError");
const columnBodyEditorEl = document.getElementById("columnBodyEditor");

// 本文リッチテキストエディタ(Quill)。太字・下線・文字色・見出し(大/中)・箇条書きのみに限定
let columnQuill = null;
if (columnBodyEditorEl && window.Quill) {
  columnQuill = new Quill(columnBodyEditorEl, {
    theme: "snow",
    placeholder: "本文を入力してください…",
    modules: {
      toolbar: [
        ["bold", "underline"],
        [{ color: ["#232733", "#c0392b", "#2266aa", "#767b8a"] }],
        [{ header: [2, 3, false] }],
        [{ list: "bullet" }]
      ]
    }
  });

  columnQuill.on("text-change", () => {
    columnBodyInput.value = columnQuill.getText().trim() === "" ? "" : columnQuill.root.innerHTML;
  });
}

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
      watchColumns();
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

  columnForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    columnFormError.textContent = "";

    const slug = columnSlugInput.value.trim();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      columnFormError.textContent = "スラッグは半角英小文字・数字・ハイフンのみ使用できます。";
      return;
    }

    if (columnQuill && columnQuill.getText().trim() === "") {
      columnFormError.textContent = "本文を入力してください。";
      return;
    }

    const payload = {
      title: columnTitleInput.value.trim(),
      body: columnBodyInput.value.trim(),
      category: columnCategoryInput.value.trim(),
      publishDate: columnPublishDateInput.value || new Date().toISOString().slice(0, 10),
      slug,
      order: columnOrderInput.value === "" ? 0 : Number(columnOrderInput.value),
      updatedAt: Date.now()
    };

    const editingId = columnIdInput.value;

    try {
      if (editingId) {
        await updateDoc(doc(firestore, "columns", editingId), payload);
      } else {
        payload.createdAt = Date.now();
        await addDoc(collection(firestore, "columns"), payload);
      }
      resetColumnForm();
    } catch (err) {
      columnFormError.textContent = "保存に失敗しました: " + err.message;
    }
  });

  resetColumnFormBtn.addEventListener("click", resetColumnForm);
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

function resetColumnForm() {
  columnIdInput.value = "";
  columnForm.reset();
  if (columnQuill) columnQuill.setText("");
  columnPublishDateInput.value = new Date().toISOString().slice(0, 10);
  columnFormTitle.textContent = "コラムを新規追加";
  resetColumnFormBtn.classList.add("is-hidden");
  columnFormError.textContent = "";
}

// 装飾タグを含まない旧・プレーンテキスト記事かどうかの判定(改行を<br>に変換してエディタへ読み込むため)
function looksLikeHtml(str) {
  return /<[a-z][\s\S]*>/i.test(str);
}

function watchColumns() {
  const columnsRef = fsQuery(collection(firestore, "columns"), fsOrderBy("publishDate", "desc"));

  onSnapshot(columnsRef, (snapshot) => {
    adminColumnList.innerHTML = "";

    if (snapshot.empty) {
      adminColumnList.innerHTML = '<li class="admin-news-empty">まだコラムがありません。</li>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const item = { id: docSnap.id, ...docSnap.data() };
      const li = document.createElement("li");
      li.className = "admin-news-item";
      li.innerHTML = `
        <div class="admin-news-item__main">
          <span class="admin-news-item__date">${escapeHtml(item.publishDate || "")}</span>
          <span class="admin-news-item__tag">${escapeHtml(item.category || "")}</span>
          <span class="admin-news-item__title">${escapeHtml(item.title || "")}</span>
        </div>
        <div class="admin-news-item__actions">
          <button type="button" class="btn-mini" data-action="edit">編集</button>
          <button type="button" class="btn-mini btn-mini--danger" data-action="delete">削除</button>
        </div>
      `;

      li.querySelector('[data-action="edit"]').addEventListener("click", () => {
        columnIdInput.value = item.id;
        columnTitleInput.value = item.title || "";
        const body = item.body || "";
        columnBodyInput.value = body;
        if (columnQuill) {
          // 旧・プレーンテキスト記事は改行を<br>に変換してから読み込み、見た目の改行を保持する
          const html = looksLikeHtml(body) ? body : body.replace(/\n/g, "<br>");
          columnQuill.setText("");
          columnQuill.clipboard.dangerouslyPasteHTML(html);
        }
        columnCategoryInput.value = item.category || "";
        columnPublishDateInput.value = item.publishDate || "";
        columnSlugInput.value = item.slug || "";
        columnOrderInput.value = item.order ?? "";
        columnFormTitle.textContent = "コラムを編集";
        resetColumnFormBtn.classList.remove("is-hidden");
        columnForm.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      li.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        if (!confirm("このコラムを削除しますか?")) return;
        try {
          await deleteDoc(doc(firestore, "columns", item.id));
        } catch (err) {
          alert("削除に失敗しました: " + err.message);
        }
      });

      adminColumnList.appendChild(li);
    });
  }, (error) => {
    console.error("コラムの取得に失敗しました:", error);
  });
}

// 初期状態:日付欄に今日の日付をセット
document.addEventListener("DOMContentLoaded", () => {
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  if (columnPublishDateInput) columnPublishDateInput.value = new Date().toISOString().slice(0, 10);
});
