// ============================================================================
// サイト共通スクリプト(ナビゲーション / スクロールアニメーション / フォーム送信)
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  initNavToggle();
  initScrollReveal();
  initContactForm();
});

function initNavToggle() {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.classList.toggle("is-active", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.classList.remove("is-active");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

function initScrollReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -60px 0px" });

  targets.forEach((el) => observer.observe(el));
}

function initContactForm() {
  const form = document.getElementById("contactForm");
  const status = document.getElementById("contactStatus");
  const submitBtn = document.getElementById("contactSubmit");
  if (!form || !status || !submitBtn) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (form.action.includes("YOUR_FORM_ID")) {
      status.textContent = "現在フォームの準備中です。恐れ入りますが、しばらくお待ちください。";
      status.classList.add("is-visible");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "送信中...";

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      });

      if (response.ok) {
        status.textContent = "お問い合わせを受け付けました。ご連絡いただきありがとうございます。";
        form.reset();
      } else {
        status.textContent = "送信に失敗しました。お手数ですが時間をおいて再度お試しください。";
      }
    } catch (err) {
      status.textContent = "送信に失敗しました。通信環境をご確認のうえ、再度お試しください。";
    } finally {
      status.classList.add("is-visible");
      submitBtn.disabled = false;
      submitBtn.textContent = "送信する";
    }
  });
}
