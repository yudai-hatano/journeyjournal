# JourneyJournal ホームページ

記帳代行サービス「JourneyJournal」の公開用静的サイトです。HTML / CSS / JavaScript のみで構成されており、GitHub Pages でそのまま公開できます。お知らせ機能は Firebase Realtime Database と連携します(Authentication で管理者ログイン)。

コラムは Firestore で下書き・編集・公開を管理し、**公開後に `npm run build-columns` を実行して記事ごとの静的HTML(`/column/<slug>.html`)・一覧ページ・`sitemap.xml` を生成**します。生成された静的ページには本文・`<title>`・`<meta description>`・`<link rel="canonical">`・OGPタグ・`<h1>` がHTMLソースに直接埋め込まれるため、検索エンジンが JavaScript 実行なしで記事内容を取得できます。公開側ページ(一覧・記事)は Firestore を読み込みません。

## ファイル構成

```
journeyjournal/
├── index.html                    トップページ(全セクション)
├── admin.html                    管理画面(お知らせ・コラム。管理者ログイン後のみ操作可)
├── column/index.html             コラム一覧ページ ★自動生成(build-column-pages.js)。直接編集しない
├── column/<slug>.html            コラム記事の静的ページ ★自動生成。1記事につき1ファイル
├── column/post.html              旧URL(?slug=xxx)を新しい静的ページへ転送する互換用ページ
├── css/style.css                 全体スタイル
├── js/main.js                    ナビゲーション・スクロールアニメーション・お問い合わせフォーム送信
├── js/news.js                    トップページのお知らせをFirebase(Realtime Database)から取得表示
├── js/admin.js                   管理画面のログイン・お知らせ/コラムCRUD処理・下書き公開処理
├── js/firebase-config.js         Firebase設定(要:ご自身の値に置き換え)
├── firestore.rules               Firestoreセキュリティルール(コンソールに設定する内容と同一)
├── scripts/upload-draft.js       FirestoreにコラムのDraftを直接アップロードするNode.jsスクリプト
├── scripts/build-column-pages.js Firestoreの公開記事から静的HTML・一覧・sitemapを生成するNode.jsスクリプト
├── sitemap.xml                   ★自動生成(build-column-pages.js)。直接編集しない
├── package.json                  スクリプト用の依存関係(firebase-admin)
└── serviceAccountKey.json        (要:各自取得して配置。.gitignore対象・リポジトリには含まれません)
```

## 公開前に必ず行う設定

### 1. お問い合わせフォーム(Formspree)の設定

1. https://formspree.io で無料アカウントを作成し、フォームを1つ作成します。
2. 発行された Form ID(例: `xlandabc`)を控えます。
3. `index.html` 内の以下の箇所を書き換えます。

   ```html
   <form class="contact-form reveal" id="contactForm" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
   ```

   `YOUR_FORM_ID` を実際のIDに置き換えてください。これだけでフォーム送信が有効になります(`js/main.js` が自動でAjax送信します)。

### 2. お知らせ機能(Firebase)の設定

現在 `js/firebase-config.js` はプレースホルダーの設定値になっており、実際には接続されません(その間、トップページには `index.html` に書かれたサンプルのお知らせがそのまま表示されます)。

1. https://console.firebase.google.com でプロジェクトを新規作成します。
2. 「Authentication」→「Sign-in method」で **メール/パスワード** を有効化し、「Users」タブから管理者用のアカウント(メール・パスワード)を1つ作成します。
3. 「Realtime Database」を作成します(リージョンは任意)。お知らせ機能で使用します。
3-2. 「Firestore Database」も作成します(リージョンは任意)。コラム機能で使用します。
4. 「プロジェクトの設定」→「マイアプリ」で ウェブアプリを追加し、表示された `firebaseConfig` の値を `js/firebase-config.js` にコピーします(Realtime DatabaseとFirestoreは同じ設定値で両方使えます)。

   ```js
   const firebaseConfig = {
     apiKey: "実際の値",
     authDomain: "実際の値",
     databaseURL: "実際の値",
     projectId: "実際の値",
     storageBucket: "実際の値",
     messagingSenderId: "実際の値",
     appId: "実際の値"
   };
   ```

5. Realtime Database の「ルール」タブで、以下のようなルールを設定します(誰でも閲覧可・書き込みはログインした管理者のみ)。

   ```json
   {
     "rules": {
       "news": {
         ".read": true,
         ".write": "auth != null"
       }
     }
   }
   ```

5-2. Firestore Database の「ルール」タブで、以下のルールを設定します(下書き(`status: "draft"`)は未ログインの一般公開ページから読めないよう制限し、`status` フィールドが無い旧データは互換性のため公開扱いとします。書き込みはログインした管理者のみ)。内容は `firestore.rules` にも同じものを置いているので、そのままコピーして貼り付けられます。

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /columns/{document} {
         allow read: if !("status" in resource.data)
                     || resource.data.status == "published"
                     || request.auth != null;
         allow write: if request.auth != null;
       }
     }
   }
   ```

5-3. コラムの公開側ページ(一覧・記事)は静的HTMLとして生成されるため、Firestoreの複合インデックスは不要です(公開側は Firestore を一切読み込みません)。`build-column-pages.js` は `columns` コレクション全体を1回取得し、スクリプト内で公開判定・並び替えを行います。

6. `admin.html` にアクセスし、作成した管理者アカウントでログインすると、お知らせ・コラムそれぞれの追加・編集・削除ができます。お知らせはトップページの「お知らせ」セクションに、コラムは `/column/index.html` にリアルタイムで反映されます。

   > 管理者は1名を想定した設計です。複数人での運用が必要になった場合は、Realtime Database・Firestoreのルールをユーザーごとに調整してください。

7. コラムの本文はリッチテキストエディタ([Quill](https://quilljs.com/) をCDN経由で読み込み)で入力し、HTML形式で保存されます。対応する装飾は太字・下線・文字色(4色)・見出し(大/中)・箇条書きです。静的HTML生成時に `build-column-pages.js` が許可タグ(`p, br, strong, b, u, em, i, span, h2, h3, ul, ol, li` と色/寄せの `style` のみ)以外を除去します。プレーンテキストのまま登録した記事もそのまま表示できます。

8. コラムには「下書き(`status: "draft"`)」と「公開中(`status: "published"`)」の状態があります。管理画面の「投稿済みのコラム」は下書き・公開中を分けて一覧表示し、下書きには「公開する」ボタンが表示されます。押すと `status` が `"published"` に変わります。**公開・編集・削除・非公開化を行ったら、ローカルで `npm run build-columns` を実行し、生成された `column/` 配下のHTMLと `sitemap.xml` を commit & push してください**(手順は「4. コラム静的ページの生成」を参照)。管理画面のフォームから新規作成した記事は、初期状態では公開扱いです(下書きは主に下記の `upload-draft.js` 経由での投稿を想定しています)。

### 3. Claude Codeからの下書きアップロード(upload-draft.js)

Claude Code(またはその他のローカル環境)から、管理画面にログインせずにコラムの下書きをFirestoreへ直接アップロードできるNode.jsスクリプトです。アップロードされた記事は必ず `status: "draft"` として保存されるため、一般公開ページには表示されません。内容を確認し、`admin.html` の「公開する」ボタンを押して初めて公開されます。

**サービスアカウントキーの取得手順**

1. https://console.firebase.google.com で対象プロジェクトを開く
2. 左上の歯車アイコン →「プロジェクトの設定」を開く
3. 上部タブの「サービス アカウント」を選択
4. 「新しい秘密鍵の生成」ボタンをクリックし、確認ダイアログで生成を実行
5. ダウンロードされたJSONファイルを、リポジトリ直下に `serviceAccountKey.json` という名前で保存する

   > ⚠️ このファイルはFirestoreへの読み書きを含む強い権限を持つ機密情報です。`.gitignore` に登録済みで誤ってコミットされない設定になっていますが、他人と共有したり、公開の場所に置いたりしないでください。漏洩した場合はFirebaseコンソールの「サービス アカウント」タブから該当キーを無効化してください。

**セットアップ**

```bash
npm install
```

**使い方**

```bash
# CLIオプションで指定する場合
node scripts/upload-draft.js \
  --title "経費って、そもそも何?" \
  --category "基礎知識" \
  --slug "keihi-kihon" \
  --body "本文本文…"

# 改行を含む長文はJSONファイルにまとめる方が簡単です
node scripts/upload-draft.js --file ./draft.json
```

`draft.json` の例:

```json
{
  "title": "経費って、そもそも何?",
  "category": "基礎知識",
  "slug": "keihi-kihon",
  "body": "「これって経費になりますか?」\n記帳の相談で、一番よく聞かれる質問です。\n\n…"
}
```

主なオプション:

| オプション | 説明 |
|---|---|
| `--publishDate` | 公開日(`YYYY-MM-DD`)。省略時は実行日 |
| `--order` | 表示順の数値。省略時は`0` |
| `--key` | サービスアカウントキーのパス。省略時はリポジトリ直下の `serviceAccountKey.json` |
| `--force` | 同じ`slug`の記事が既に存在する場合に上書き更新する(省略時はエラーで中断) |

npm scriptとして `npm run upload-draft -- --title "..." ...` の形でも実行できます。

### 4. コラム静的ページの生成(build-column-pages.js)

`admin.html` でコラムを公開・編集・削除・非公開化したあとに実行します。Firestore の `columns` から公開中(`status: "published"`。`status` フィールドが無い旧データも公開扱い)の記事を読み取り、以下を再生成します。

- `column/<slug>.html` … 記事ごとの静的ページ。`<title>`・`<meta description>`(本文冒頭120字)・`<link rel="canonical">`・OGP/Twitterタグ・`<h1>`・`Article` の JSON-LD を記事ごとに個別設定し、本文HTMLを直接埋め込みます。
- `column/index.html` … 記事カード一覧(公開日の新しい順)。JavaScript での Firestore 読み込みはありません。
- `sitemap.xml` … トップ・コラム一覧・公開中の全記事URL・特商法ページを反映。
- 旧slugのリダイレクトページ … スクリプト冒頭の `REDIRECTS`(旧slug → 新slug)に沿って、`column/<旧slug>.html` を新URLへ 0 秒転送する `noindex` ページを生成します。slug を変更したときは `REDIRECTS` に「旧 → 新」を追記してください。
- 公開が取り消された(または削除された)記事の古い `column/*.html` は自動削除されます(`index.html` / `post.html` / リダイレクトページは対象外)。

```bash
npm run build-columns
# もしくは
node scripts/build-column-pages.js

# 生成・削除の予定だけ確認(書き込みなし)
node scripts/build-column-pages.js --dry-run
```

主なオプション:

| オプション | 説明 |
|---|---|
| `--key` | サービスアカウントキーのパス。省略時はリポジトリ直下の `serviceAccountKey.json` |
| `--base` | 公開サイトのベースURL。省略時は環境変数 `SITE_BASE`、次に既定値 `https://yudai-hatano.github.io/journeyjournal` |
| `--dry-run` | ファイルを書き込まず、生成・削除の予定だけ表示する |

生成後、`git add -A && git commit && git push origin main` で公開します(GitHub Pages が数分で反映)。

> ⚠️ 同じ `slug` が複数の公開記事に設定されているとスクリプトはエラーで中断します。`admin.html` でいずれかの `slug` を修正してから再実行してください。

## GitHub Pages での公開

1. このフォルダの中身をGitHubリポジトリにpushします。
2. リポジトリの Settings → Pages で、公開ブランチ(例: `main`)とルートディレクトリを指定します。
3. 数分後、`https://ユーザー名.github.io/リポジトリ名/` で公開されます。

`admin.html` は `<meta name="robots" content="noindex, nofollow">` により検索エンジンにはインデックスされませんが、URLを知っていれば誰でもアクセスできます(ログインしない限り操作はできません)。より厳重に隠したい場合は、別途Basic認証やアクセス制限が可能なホスティングへの移行をご検討ください。

## コンテンツ更新時の注意

- 料金・サービス内容は `index.html` の `id="service"` セクション内を直接編集してください。
- `column/index.html`・`column/<slug>.html`・`sitemap.xml` は `build-column-pages.js` の自動生成物です。直接編集せず、記事は `admin.html`(Firestore)で編集してから `npm run build-columns` を実行してください。
- `column/` のヘッダー/フッターなど共通レイアウトを変更する場合は、`scripts/build-column-pages.js` 内の `HEADER_HTML` / `FOOTER_HTML` / `HEAD_ASSETS` を編集し、再生成してください。
- コピーライティング上、以下の表現は使用しないよう統一しています(税理士の独占業務との誤解防止のため)。
  - 「税務調査対策」「無申告解決」などの断定的な表現
  - 「申告補助」以外の箇所での申告書作成・税務相談を示唆する表現
  - 「申告補助」については、e-Taxの操作サポートに限定し、税務相談を行わない旨を必ず併記
- これらの方針を変更する際は、必ず税理士法等の関連法令をご確認ください(本サイトの文言は法的助言ではありません)。
