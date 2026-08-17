# JourneyJournal ホームページ

記帳代行サービス「JourneyJournal」の公開用静的サイトです。HTML / CSS / JavaScript のみで構成されており、GitHub Pages でそのまま公開できます。お知らせ機能のみ Firebase(Realtime Database + Authentication)と連携します。

## ファイル構成

```
journeyjournal/
├── index.html          トップページ(全セクション)
├── admin.html          お知らせ管理画面(管理者ログイン後のみ操作可)
├── css/style.css        全体スタイル
├── js/main.js            ナビゲーション・スクロールアニメーション・お問い合わせフォーム送信
├── js/news.js            トップページのお知らせをFirebaseから取得表示
├── js/admin.js           管理画面のログイン・お知らせCRUD処理
└── js/firebase-config.js Firebase設定(要:ご自身の値に置き換え)
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
3. 「Realtime Database」を作成します(リージョンは任意)。
4. 「プロジェクトの設定」→「マイアプリ」で ウェブアプリを追加し、表示された `firebaseConfig` の値を `js/firebase-config.js` にコピーします。

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

6. `admin.html` にアクセスし、作成した管理者アカウントでログインすると、お知らせの追加・編集・削除ができます。トップページの「お知らせ」セクションにリアルタイムで反映されます。

   > 管理者は1名を想定した設計です。複数人での運用が必要になった場合は、Realtime Databaseのルールをユーザーごとに調整してください。

## GitHub Pages での公開

1. このフォルダの中身をGitHubリポジトリにpushします。
2. リポジトリの Settings → Pages で、公開ブランチ(例: `main`)とルートディレクトリを指定します。
3. 数分後、`https://ユーザー名.github.io/リポジトリ名/` で公開されます。

`admin.html` は `<meta name="robots" content="noindex, nofollow">` により検索エンジンにはインデックスされませんが、URLを知っていれば誰でもアクセスできます(ログインしない限り操作はできません)。より厳重に隠したい場合は、別途Basic認証やアクセス制限が可能なホスティングへの移行をご検討ください。

## コンテンツ更新時の注意

- 料金・サービス内容は `index.html` の `id="service"` セクション内を直接編集してください。
- コピーライティング上、以下の表現は使用しないよう統一しています(税理士の独占業務との誤解防止のため)。
  - 「税務調査対策」「無申告解決」などの断定的な表現
  - 「申告補助」以外の箇所での申告書作成・税務相談を示唆する表現
  - 「申告補助」については、e-Taxの操作サポートに限定し、税務相談を行わない旨を必ず併記
- これらの方針を変更する際は、必ず税理士法等の関連法令をご確認ください(本サイトの文言は法的助言ではありません)。
