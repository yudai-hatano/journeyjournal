#!/usr/bin/env node
// ============================================================================
// upload-draft.js
// ----------------------------------------------------------------------------
// Claude Code(またはローカル環境)から、Firestore の columns コレクションに
// 「下書き(status: "draft")」としてコラム記事を直接アップロードするための
// Node.js スクリプトです。Firebase Admin SDK とサービスアカウントキーを使用します。
//
// 使い方は README.md の「Claude Codeからの下書きアップロード」を参照してください。
//
// 【CLIオプションで指定する場合】
//   node scripts/upload-draft.js \
//     --title "経費って、そもそも何?" \
//     --category "基礎知識" \
//     --slug "keihi-kihon" \
//     --body "本文本文…"
//
// 【JSONファイルで指定する場合(改行を含む長文の本文はこちらが便利です)】
//   node scripts/upload-draft.js --file ./draft.json
//   draft.json の中身: { "title": "...", "category": "...", "slug": "...", "body": "..." }
//
// 【共通オプション】
//   --publishDate YYYY-MM-DD   省略時は実行日
//   --order 数値                省略時は0
//   --key ./path/to/key.json   省略時はリポジトリ直下の serviceAccountKey.json
//   --force                    同じslugの記事が既に存在する場合、上書き更新する
//                              (省略時は同じslugが既にあるとエラーで中断します)
// ============================================================================

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

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

function printUsageAndExit(message) {
  if (message) console.error(`エラー: ${message}\n`);
  console.error(
    [
      "使い方:",
      '  node scripts/upload-draft.js --title "タイトル" --category "カテゴリ" --slug "url-slug" --body "本文"',
      "  node scripts/upload-draft.js --file ./draft.json",
      "",
      "オプション: --publishDate YYYY-MM-DD, --order 数値, --key ./key.json, --force",
      "詳しくは README.md の「Claude Codeからの下書きアップロード」を参照してください。"
    ].join("\n")
  );
  process.exit(1);
}

function loadData(args) {
  let data;

  if (args.file) {
    const filePath = path.resolve(String(args.file));
    if (!fs.existsSync(filePath)) {
      printUsageAndExit(`指定されたファイルが見つかりません: ${filePath}`);
    }
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      printUsageAndExit(`JSONファイルの読み込みに失敗しました: ${err.message}`);
    }
  } else {
    data = {
      title: args.title,
      body: args.body,
      category: args.category,
      slug: args.slug,
      publishDate: args.publishDate,
      order: args.order
    };
  }

  const missing = ["title", "body", "category", "slug"].filter(
    (key) => typeof data[key] !== "string" || data[key].trim() === ""
  );
  if (missing.length) {
    printUsageAndExit(`必須項目が不足しています: ${missing.join(", ")}`);
  }

  const slug = String(data.slug).trim();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    printUsageAndExit("スラッグは半角英小文字・数字・ハイフンのみ使用できます。");
  }

  return {
    title: String(data.title).trim(),
    body: String(data.body).trim(),
    category: String(data.category).trim(),
    slug,
    publishDate: data.publishDate ? String(data.publishDate).trim() : new Date().toISOString().slice(0, 10),
    order: data.order !== undefined && data.order !== "" ? Number(data.order) : 0
  };
}

function loadServiceAccount(args) {
  const keyPath = args.key
    ? path.resolve(String(args.key))
    : path.resolve(__dirname, "..", "serviceAccountKey.json");

  if (!fs.existsSync(keyPath)) {
    printUsageAndExit(
      `サービスアカウントキーが見つかりません: ${keyPath}\n` +
        "README.md の手順に従って取得し、リポジトリ直下に serviceAccountKey.json として保存するか、" +
        "--key で別のパスを指定してください。"
    );
  }

  try {
    return JSON.parse(fs.readFileSync(keyPath, "utf8"));
  } catch (err) {
    printUsageAndExit(`サービスアカウントキーの読み込みに失敗しました: ${err.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const record = loadData(args);
  const serviceAccount = loadServiceAccount(args);

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const columns = db.collection("columns");

  const existing = await columns.where("slug", "==", record.slug).limit(1).get();

  if (!existing.empty && !args.force) {
    const doc = existing.docs[0];
    printUsageAndExit(
      `スラッグ "${record.slug}" の記事は既に存在します(id: ${doc.id}, タイトル: 「${doc.data().title}」)。\n` +
        "上書きする場合は --force を付けて実行してください(status は draft に戻ります)。"
    );
  }

  const now = Date.now();
  const payload = {
    title: record.title,
    body: record.body,
    category: record.category,
    slug: record.slug,
    publishDate: record.publishDate,
    order: record.order,
    status: "draft",
    updatedAt: now
  };

  if (!existing.empty) {
    const doc = existing.docs[0];
    await columns.doc(doc.id).update(payload);
    console.log(`下書きを更新しました(id: ${doc.id}, slug: ${record.slug})`);
  } else {
    payload.createdAt = now;
    const ref = await columns.add(payload);
    console.log(`下書きをアップロードしました(id: ${ref.id}, slug: ${record.slug})`);
  }

  console.log("admin.html にログインし、内容を確認のうえ「公開する」ボタンで公開してください。");
  process.exit(0);
}

main().catch((err) => {
  console.error("予期しないエラーが発生しました:", err);
  process.exit(1);
});
