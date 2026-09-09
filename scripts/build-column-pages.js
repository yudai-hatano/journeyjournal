#!/usr/bin/env node
// ============================================================================
// build-column-pages.js
// ----------------------------------------------------------------------------
// Firestore の columns コレクションから「公開中(status: "published")」の記事を
// 読み取り、記事ごとの静的HTMLファイル(/column/<slug>.html)と、
// コラム一覧ページ(/column/index.html)、sitemap.xml を生成します。
//
// これにより、コラム本文・<title>・<meta description>・OGP・<h1> が
// HTMLソースに直接埋め込まれ、検索エンジンが JavaScript 実行なしで
// 記事内容を取得できるようになります。
//
// 記事の下書き・編集・公開操作そのものは、これまで通り admin.html
// (Firestore 経由)で行います。admin.html で「公開する」を押したあと、
// ローカルで本スクリプトを実行し、生成物を commit & push してください。
//
// 【使い方】
//   npm run build-columns
//   もしくは
//   node scripts/build-column-pages.js
//
// 【オプション】
//   --key ./path/to/key.json   サービスアカウントキーのパス
//                              (省略時はリポジトリ直下の serviceAccountKey.json)
//   --base https://example.com/foo  公開サイトのベースURL
//                              (省略時は SITE_BASE 環境変数、次に既定値)
//   --dry-run                  ファイルを書き込まず、生成・削除の予定だけ表示する
// ============================================================================

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const ROOT = path.resolve(__dirname, "..");
const COLUMN_DIR = path.join(ROOT, "column");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");

const DEFAULT_BASE = "https://yudai-hatano.github.io/journeyjournal";

// column/ 配下で「自動生成の記事ページ」ではないファイル(削除対象から除外する)
const NON_ARTICLE_FILES = new Set(["index.html", "post.html"]);

// 過去に公開していた旧slug → 現在のslug。
// 旧URL(/column/<旧slug>.html、および post.html?slug=<旧slug> 経由)を
// 新しい記事ページへ 0秒リダイレクトする noindex ページを生成する。
// slug を再度変更したときは、ここに「旧 → 新」を追記する。
const REDIRECTS = {
  yorusyoku: "yofuku-ishou", // 旧: 「その衣装代…」。同一slugが重複していたため分離
  yorrusyoku: "taxi-douhan", // 旧: タイポ(r が重複)
  kisothishiki: "shinkoku-bareru" // 旧: タイポ
};

// 本文で許可するタグ。js/column-post.js の SAFE_HTML_CONFIG と同等。
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "u", "em", "i", "span", "h2", "h3", "ul", "ol", "li"
]);
// style 属性で許可する宣言(Quill の文字色・寄せのみ)
const ALLOWED_STYLE_PROPS = new Set(["color", "text-align"]);

// ---------------------------------------------------------------------------
// 引数・認証
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function fail(message) {
  console.error(`エラー: ${message}`);
  process.exit(1);
}

function loadServiceAccount(args) {
  const keyPath = args.key
    ? path.resolve(String(args.key))
    : path.resolve(ROOT, "serviceAccountKey.json");

  if (!fs.existsSync(keyPath)) {
    fail(
      `サービスアカウントキーが見つかりません: ${keyPath}\n` +
        "README.md の手順に従って取得し、リポジトリ直下に serviceAccountKey.json として保存するか、" +
        "--key で別のパスを指定してください。"
    );
  }
  try {
    return JSON.parse(fs.readFileSync(keyPath, "utf8"));
  } catch (err) {
    fail(`サービスアカウントキーの読み込みに失敗しました: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// テキスト整形
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeHtml(str) {
  return /<[a-z!/][\s\S]*>/i.test(str);
}

// 本文HTMLをタグ許可リストで無害化する(ビルド時サニタイズ)。
// admin は単独運用かつ Quill のツールバーで入力が制限されているが、
// 念のため許可タグ以外は除去し、属性は色・寄せの style のみ残す。
function sanitizeStyleAttr(attrs) {
  const m = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
  if (!m) return "";
  const raw = m[2] != null ? m[2] : m[3] || "";
  const decls = raw
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => {
      const prop = d.split(":")[0].trim().toLowerCase();
      return ALLOWED_STYLE_PROPS.has(prop);
    })
    .filter((d) => !/url\s*\(|expression|javascript:/i.test(d));
  return decls.length ? ` style="${escapeHtml(decls.join("; "))}"` : "";
}

function sanitizeHtmlAllowlist(html) {
  let s = String(html);
  // コメント・危険な要素は中身ごと除去
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(
    /<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi,
    ""
  );
  s = s.replace(/<(script|style|iframe|object|embed|link|meta|base|svg|math)\b[^>]*>/gi, "");
  // 残りのタグを許可リストで処理
  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, slash, name, attrs) => {
    const tag = name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (slash) return `</${tag}>`;
    if (tag === "br") return "<br>";
    return `<${tag}${sanitizeStyleAttr(attrs)}>`;
  });
  return s.trim();
}

// 本文を表示用HTMLに変換する。旧・プレーンテキスト記事はエスケープのみ
// (CSS の white-space: pre-line で改行が保持される)。
function renderBody(raw) {
  const s = String(raw || "");
  if (!s) return "";
  return looksLikeHtml(s) ? sanitizeHtmlAllowlist(s) : escapeHtml(s);
}

// 本文からプレーンテキストを取り出す(description / 抜粋用)
function stripHtml(raw) {
  return String(raw || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text, max) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).replace(/-/g, ".");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

// ---------------------------------------------------------------------------
// 共通パーツ(column/index.html・post.html のヘッダー/フッターと一致させる)
// ---------------------------------------------------------------------------
const HEAD_COMMON = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">`;

const HEAD_ASSETS = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='46' fill='%2312203a'/%3E%3Ccircle cx='50' cy='50' r='46' fill='none' stroke='%23d9ab5c' stroke-width='3'/%3E%3Cpolygon points='50,20 58,50 50,80 42,50' fill='%23d9ab5c'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">`;

const HEADER_HTML = `<!-- ==================== ヘッダー ==================== -->
<header class="site-header">
  <div class="site-header__inner">
    <a href="../index.html#top" class="brand">
      <svg class="brand__mark" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="46" stroke="currentColor" stroke-width="4"/><polygon points="50,18 60,50 50,82 40,50" fill="currentColor"/><circle cx="50" cy="50" r="4" fill="#fbf7ee"/></svg>
      <span>
        JourneyJournal
        <span class="brand__sub">経理代行・記帳代行</span>
      </span>
    </a>
    <nav class="nav" id="siteNav">
      <ul class="nav__list">
        <li><a href="../index.html#concept">コンセプト</a></li>
        <li><a href="../index.html#profile">代表者紹介</a></li>
        <li><a href="../index.html#service">サービス・料金</a></li>
        <li><a href="../index.html#software">対応ソフト</a></li>
        <li><a href="../index.html#flow">ご依頼の流れ</a></li>
        <li><a href="../index.html#news">お知らせ</a></li>
        <li><a href="index.html">コラム</a></li>
        <li><a href="../index.html#faq">よくある質問</a></li>
        <li><a href="../index.html#notice">ご依頼にあたって</a></li>
      </ul>
      <div class="nav__cta">
        <a href="../index.html#contact" class="btn btn--outline btn--block">お問い合わせ</a>
      </div>
    </nav>
    <button class="nav-toggle" id="navToggle" aria-label="メニューを開く" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>`;

const FOOTER_HTML = `<!-- ==================== フッター ==================== -->
<footer class="site-footer">
  <div class="container site-footer__inner">
    <a href="../index.html#top" class="brand">JourneyJournal</a>
    <div class="site-footer__links">
      <a href="../index.html#service">サービス・料金</a>
      <a href="index.html">コラム</a>
      <a href="../index.html#faq">よくある質問</a>
      <a href="../index.html#notice">ご依頼にあたって</a>
      <a href="../index.html#contact">お問い合わせ</a>
      <a href="../tokushoho.html">特定商取引法に基づく表記</a>
    </div>
    <span>&copy; 2026 JourneyJournal</span>
  </div>
</footer>`;

const GENERATED_BANNER = `<!-- ============================================================
  このファイルは scripts/build-column-pages.js による自動生成物です。
  直接編集しないでください(次回ビルドで上書きされます)。
  記事の編集は admin.html(Firestore)から行い、公開後に
  npm run build-columns を実行して生成し直してください。
============================================================ -->`;

// ---------------------------------------------------------------------------
// ページ生成
// ---------------------------------------------------------------------------
function articlePage(art, base) {
  const url = `${base}/column/${art.slug}.html`;
  const ogImage = `${base}/assets/ogp.svg`;
  const fullTitle = `${art.title} | JourneyJournal コラム`;
  const desc = art.description;
  const bodyHtml = art.bodyHtml;
  const dateDisplay = formatDate(art.publishDate);

  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: art.title,
      description: desc,
      articleSection: art.category,
      datePublished: art.publishDate || undefined,
      dateModified: art.publishDate || undefined,
      inLanguage: "ja",
      image: ogImage,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      author: { "@type": "Organization", name: "JourneyJournal", url: `${base}/` },
      publisher: { "@type": "Organization", name: "JourneyJournal", url: `${base}/` }
    },
    null,
    2
  );

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${GENERATED_BANNER}
${HEAD_COMMON}
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="article">
<meta property="og:site_name" content="JourneyJournal">
<meta property="og:locale" content="ja_JP">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(fullTitle)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
${HEAD_ASSETS}
<script type="application/ld+json">
${jsonLd}
</script>
</head>
<body>

${HEADER_HTML}

<div class="container">
  <article class="column-article">
    <span class="column-article__tag">${escapeHtml(art.category)}</span>
    <h1 class="column-article__title">${escapeHtml(art.title)}</h1>
    <span class="column-article__date">${escapeHtml(dateDisplay)}</span>
    <div class="column-article__body">${bodyHtml}</div>
    <div class="column-article__cta">
      <a href="../index.html#contact" class="btn btn--primary">お問い合わせはこちら</a>
      <a href="index.html" class="btn btn--outline">コラム一覧へ</a>
    </div>
  </article>
</div>

${FOOTER_HTML}

<script src="../js/main.js"></script>
</body>
</html>
`;
}

function listPage(articles, base) {
  const url = `${base}/column/`;
  const cards = articles
    .map(
      (art) => `    <a class="column-card" href="${escapeHtml(art.slug)}.html">
      <span class="column-card__tag">${escapeHtml(art.category)}</span>
      <h2 class="column-card__title">${escapeHtml(art.title)}</h2>
      <p class="column-card__excerpt">${escapeHtml(art.excerpt)}</p>
      <span class="column-card__date">${escapeHtml(formatDate(art.publishDate))}</span>
    </a>`
    )
    .join("\n");

  const grid = articles.length
    ? cards
    : `    <p class="column-empty">ただいまコラムを準備中です。公開まで今しばらくお待ちください。</p>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${GENERATED_BANNER}
${HEAD_COMMON}
<title>コラム | JourneyJournal</title>
<meta name="description" content="経理・確定申告の基礎知識や、夜職(キャバクラ・ホスト)の方向けの経費の考え方などをお届けするJourneyJournalのコラムです。">
<link rel="canonical" href="${escapeHtml(url)}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="JourneyJournal">
<meta property="og:locale" content="ja_JP">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:title" content="コラム | JourneyJournal">
<meta property="og:description" content="経理・確定申告の基礎知識や、夜職の方向けの経費の考え方などをお届けするJourneyJournalのコラムです。">
<meta property="og:image" content="${escapeHtml(base)}/assets/ogp.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="コラム | JourneyJournal">
<meta name="twitter:image" content="${escapeHtml(base)}/assets/ogp.svg">
${HEAD_ASSETS}
</head>
<body>

${HEADER_HTML}

<div class="column-head">
  <span class="section-eyebrow">COLUMN</span>
  <h1 class="section-title">コラム</h1>
  <p class="section-lead">経理・確定申告の基礎知識や、夜職(キャバクラ・ホスト)の方向けの経費の考え方などをお届けします。</p>
</div>

<div class="container">
  <div class="column-grid">
${grid}
  </div>
</div>

${FOOTER_HTML}

<script src="../js/main.js"></script>
</body>
</html>
`;
}

function redirectPage(fromSlug, toSlug, base) {
  const target = `./${toSlug}.html`;
  const canonical = `${base}/column/${toSlug}.html`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
${GENERATED_BANNER}
${HEAD_COMMON}
<meta name="robots" content="noindex, follow">
<title>移動しました | JourneyJournal コラム</title>
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
<script>window.location.replace(${JSON.stringify(target)});</script>
<link rel="stylesheet" href="../css/style.css">
</head>
<body>
<div class="container" style="padding: 140px 24px; text-align: center;">
  <p>この記事のURLは移動しました。</p>
  <p><a class="btn btn--outline" href="${escapeHtml(target)}">記事を開く</a></p>
</div>
</body>
</html>
`;
}

function sitemapXml(articles, base) {
  const today = new Date().toISOString().slice(0, 10);
  const staticUrls = [
    { loc: `${base}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${base}/column/`, changefreq: "weekly", priority: "0.7" }
  ];
  const articleUrls = articles.map((art) => ({
    loc: `${base}/column/${art.slug}.html`,
    lastmod: art.publishDate || today,
    changefreq: "monthly",
    priority: "0.6"
  }));
  const tailUrls = [
    { loc: `${base}/tokushoho.html`, changefreq: "yearly", priority: "0.3" }
  ];

  const render = (u) =>
    [
      "  <url>",
      `    <loc>${escapeHtml(u.loc)}</loc>`,
      u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
      `    <changefreq>${u.changefreq}</changefreq>`,
      `    <priority>${u.priority}</priority>`,
      "  </url>"
    ]
      .filter(Boolean)
      .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- このファイルは scripts/build-column-pages.js により自動生成されます。直接編集しないでください。 -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...articleUrls, ...tailUrls].map(render).join("\n")}
</urlset>
`;
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args["dry-run"]);
  const base = String(args.base || process.env.SITE_BASE || DEFAULT_BASE).replace(/\/+$/, "");
  const serviceAccount = loadServiceAccount(args);

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const snapshot = await db.collection("columns").get();

  const articles = [];
  const skipped = [];
  snapshot.forEach((docSnap) => {
    const d = docSnap.data() || {};
    // status フィールドが無い旧データは公開扱い(firestore.rules と同じ方針)
    const status = d.status === "draft" ? "draft" : "published";
    if (status !== "published") return;

    const slug = typeof d.slug === "string" ? d.slug.trim() : "";
    if (!/^[a-z0-9-]+$/.test(slug)) {
      skipped.push({ id: docSnap.id, reason: `slug が不正 (${JSON.stringify(d.slug)})` });
      return;
    }
    if (NON_ARTICLE_FILES.has(`${slug}.html`)) {
      skipped.push({ id: docSnap.id, reason: `slug "${slug}" は予約名のため使用不可` });
      return;
    }

    const rawBody = String(d.body || "");
    const bodyText = stripHtml(rawBody);
    articles.push({
      id: docSnap.id,
      title: String(d.title || "").trim(),
      category: String(d.category || "コラム").trim(),
      slug,
      publishDate: d.publishDate ? String(d.publishDate).trim() : "",
      order: typeof d.order === "number" ? d.order : Number(d.order) || 0,
      bodyHtml: renderBody(rawBody),
      description: clip(bodyText, 120),
      excerpt: clip(bodyText, 70)
    });
  });

  // 公開日の新しい順 → order 昇順 → タイトル順
  articles.sort((a, b) => {
    if (a.publishDate !== b.publishDate) return a.publishDate < b.publishDate ? 1 : -1;
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title, "ja");
  });

  // 同一 slug の重複チェック
  const seen = new Map();
  for (const art of articles) {
    if (seen.has(art.slug)) {
      fail(
        `slug "${art.slug}" が重複しています(id: ${seen.get(art.slug)} と ${art.id})。` +
          "admin.html でどちらかの slug を修正してください。"
      );
    }
    seen.set(art.slug, art.id);
  }

  const publishedSlugs = new Set(articles.map((a) => a.slug));

  const outputs = [];
  for (const art of articles) {
    outputs.push({ file: path.join(COLUMN_DIR, `${art.slug}.html`), content: articlePage(art, base) });
  }

  // 旧slug → 新slug のリダイレクトページ
  const redirectFiles = [];
  for (const [fromSlug, toSlug] of Object.entries(REDIRECTS)) {
    if (publishedSlugs.has(fromSlug)) {
      // 旧slugが現役の記事slugとして復活している場合はリダイレクトを作らない
      continue;
    }
    if (!publishedSlugs.has(toSlug)) {
      console.warn(`リダイレクト元 "${fromSlug}" の転送先 "${toSlug}" が公開記事に存在しません。スキップします。`);
      continue;
    }
    const fileName = `${fromSlug}.html`;
    redirectFiles.push(fileName);
    outputs.push({ file: path.join(COLUMN_DIR, fileName), content: redirectPage(fromSlug, toSlug, base) });
  }

  outputs.push({ file: path.join(COLUMN_DIR, "index.html"), content: listPage(articles, base) });
  outputs.push({ file: SITEMAP_PATH, content: sitemapXml(articles, base) });

  // 非公開化・削除された記事の古い静的ページを掃除する
  const keep = new Set([...articles.map((a) => `${a.slug}.html`), ...redirectFiles]);
  const stale = fs
    .readdirSync(COLUMN_DIR)
    .filter((f) => f.toLowerCase().endsWith(".html") && !NON_ARTICLE_FILES.has(f) && !keep.has(f));

  console.log(`ベースURL: ${base}`);
  if (skipped.length) {
    console.log("スキップした記事:");
    skipped.forEach((s) => console.log(`  - id ${s.id}: ${s.reason}`));
  }

  if (dryRun) {
    console.log("\n[dry-run] 書き込み予定:");
    outputs.forEach((o) => console.log(`  ${path.relative(ROOT, o.file).replace(/\\/g, "/")}`));
    stale.forEach((f) => console.log(`  削除予定: column/${f}`));
    console.log(`\n公開記事 ${articles.length} 件:`);
    articles.forEach((a) => console.log(`  ${a.slug}  「${a.title}」  ${a.publishDate || "(日付なし)"}`));
    process.exit(0);
  }

  outputs.forEach((o) => fs.writeFileSync(o.file, o.content, "utf8"));
  stale.forEach((f) => fs.unlinkSync(path.join(COLUMN_DIR, f)));

  console.log(`\n公開記事 ${articles.length} 件を生成しました:`);
  articles.forEach((a) =>
    console.log(`  column/${a.slug}.html  「${a.title}」  ${a.publishDate || "(日付なし)"}`)
  );
  if (redirectFiles.length) {
    console.log("\n旧slugリダイレクトページ:");
    redirectFiles.forEach((f) => console.log(`  column/${f}  ->  column/${REDIRECTS[f.replace(/\.html$/, "")]}.html`));
  }
  if (stale.length) {
    console.log("\n非公開化・削除により除去した記事ページ:");
    stale.forEach((f) => console.log(`  column/${f}`));
  }
  console.log("\n更新: column/index.html, sitemap.xml");
  console.log("次のコマンドで公開できます:");
  console.log("  git add -A && git commit -m \"コラム静的ページを再生成\" && git push origin main");
  process.exit(0);
}

main().catch((err) => {
  console.error("予期しないエラーが発生しました:", err);
  process.exit(1);
});
