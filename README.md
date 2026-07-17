# cobi-robodun-admin

Robodun のゲームデータ（カタログ JSON / アセット）を編集する管理画面です。

## 2 つのモード

| モード | 用途 | データ保存先 |
|--------|------|----------------|
| **local**（既定） | 個人のローカル調整 | `GAME_ROOT`（cobi-robodun）を Express 経由で直書き |
| **cloud** | 複数人でのバランス調整 | Firebase Auth + Firestore + Storage（Hosting で公開） |

詳細は [docs/HOSTING.md](docs/HOSTING.md)。

## ローカル開発

```bash
cp .env.example .env
# VITE_DATA_MODE=local と GAME_ROOT を設定
npm install
npm run dev
```

- UI: http://localhost:5173
- API: http://127.0.0.1:5174

## クラウド（Firebase Hosting）

```bash
# .env
VITE_DATA_MODE=cloud
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

cp .firebaserc.example .firebaserc   # project id を編集
npm run build
npx firebase deploy --only firestore:rules,storage,hosting
```

初回データ投入:

```bash
npm i -D firebase-admin
# GOOGLE_APPLICATION_CREDENTIALS と .env（GAME_ROOT / LIBRARY_ROOT / bucket）を設定
npm run seed:firebase
# ライブラリだけ: SEED_SCOPE=library npm run seed:firebase
```

Storage 配置: `project/assets/**`（正本）と `library/**`（外部素材）。

Auth で Email/Password ユーザーを作成し、Hosting URL をメンバーに共有します。

## 画面

| 画面 | 内容 |
|------|------|
| ダッシュボード | 件数・検証 |
| カタログ | 3ペイン編集 |
| アセット | 取込・透過可視化・複数トリム |
| 音声 | audio.json 割当 |
| 運用 | ローカル: ContentVersion / クラウド: カタログエクスポート |

## ゲームへの取り込み

- **local**: 保存即 `GAME_ROOT` 反映 → Desktop で確認（ZIP エクスポートも可）
- **cloud**: 運用画面の **ゲーム反映用 ZIP** を展開し、`data/` + `assets/` をゲームリポ直下へ上書きコピー
