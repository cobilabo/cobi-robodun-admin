# Firebase ホスティング対応メモ

## なぜローカルだけでは足りないか

| 依存 | 問題（複数人リモート） |
|------|------------------------|
| Express + `GAME_ROOT` 直書き | Hosting は静的配信のみ。各人のディスクは共有できない |
| `LIBRARY_ROOT` 絶対パス | メンバー PC ごとに違う |
| `sharp` サーバトリム | Node サーバが無いと動かない |
| ContentVersion ファイル編集 | ゲームリポへの書込権限が各人に必要 |
| 認証なし | 公開 URL だと誰でも JSON を書き換えられる |

## 採用アーキテクチャ

```
[ブラウザ Admin]
    │  Auth
    ├─ Firestore  catalogs/{name}     ← JSON 正本（クラウド）
    └─ Storage
         ├─ project/assets/**         ← 画像・音声正本
         └─ library/**                ← 外部素材ライブラリ（取込元）
         │
         ▼ 運用画面からエクスポート / 手動同期
[cobi-robodun data/ + assets/]  ← ゲーム実行用正本
```

- **ローカルモード** (`VITE_DATA_MODE=local`): 従来どおり Express + GAME_ROOT（個人開発）
- **クラウドモード** (`VITE_DATA_MODE=cloud`): Firebase のみ。Hosting に静的ビルドを載せる

## デプロイ手順

1. Firebase プロジェクト作成（Auth Email/Password 有効化）
2. `.env` に `VITE_DATA_MODE=cloud` と `VITE_FIREBASE_*` を設定
3. `.firebaserc.example` を `.firebaserc` にコピーして project id を入れる
4. ルール適用・初期データ投入

```bash
npm i -D firebase-admin
# サービスアカウントで Application Default Credentials を用意
# .env に GAME_ROOT / LIBRARY_ROOT / FIREBASE_STORAGE_BUCKET を設定

# 全部（カタログ + project/assets + library）
npm run seed:firebase

# ライブラリのみ再投入（既存ファイルは SKIP_EXISTING=1 でスキップ）
SEED_SCOPE=library npm run seed:firebase

npx firebase deploy --only firestore:rules,storage
# AI 生成用 Secret（未作成なら secrets:set）
# - OPEN_AI_API_KEY … 画像生成
# - STABILITY_API_KEY … BGM/ambience（Stable Audio）
# - ELEVENLABS_API_KEY … SE/UI（ElevenLabs Sound Effects）
cd functions && npm install && cd ..
npm run build
npx firebase deploy --only functions,hosting
```

Callable（`asia-northeast1`）:

- `generateLibraryImage` … ライブラリ向け画像 AI 生成
- `generateProjectAudio` … プロジェクト音声 AI 生成（Stable Audio / ElevenLabs）→ `project/assets/audio/...`

音声画面では、AI 生成に加えて Google Flow Music 等の手動書き出しファイルを「このキューへ手動UP」で割当できます。

5. Authentication でメンバー用ユーザーを作成
6. Hosting URL を共有

## ゲームへの取り込み

クラウドの正本 ≠ ゲームリポ。**運用 →「ゲーム反映用 ZIP をダウンロード」** を使う。

ZIP の中身（ルート直下）:

```
data/*.json          ← カタログ（audio.json / hud.json 含む）
assets/**            ← 画像・音声（project/assets 相当）
IMPORT.txt           ← 手順メモ
```

手順:

1. ZIP を展開
2. 展開した `data/` と `assets/` を `cobi-robodun` リポジトリ直下へ上書きコピー
3. `dotnet run --project src/Robodun.Desktop` で確認
4. 問題なければ commit。Android 配布前に ContentVersion をバンプ

ライブラリ（`library/`）は取込元ストックのため ZIP には含まれません。

## 今後の拡張候補

- GitHub Actions で `cobi-robodun` へ自動 PR
- ロール（閲覧のみ / 編集）を Custom Claims で分離
