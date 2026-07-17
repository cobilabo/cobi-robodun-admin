# cobi-robodun-admin

Robodun の `data/`・`assets/`・`scenes/` を編集するローカル管理画面です。

## 必要環境

- Node.js 20+
- 隣（または任意パス）に [cobi-robodun](https://github.com/cobilabo/cobi-robodun) のクローン

## セットアップ

```bash
cp .env.example .env
# GAME_ROOT をゲームリポジトリの絶対パスに設定
npm install
npm run dev
```

- UI: http://127.0.0.1:5173
- API: http://127.0.0.1:5174

## できること

| 画面 | 内容 |
|------|------|
| ダッシュボード | 件数・検証エラー・次の一手 |
| カタログ | 3ペインで characters / enemies / skills 等を編集 |
| アセット | プロジェクト＋外部ライブラリ、透過トリム、取込 |
| 音声 | `data/audio.json` への BGM/SE 割当（再生はゲーム側段階実装） |
| 運用 | Desktop 確認手順、Android ContentVersion バンプ |

保存時は `GAME_ROOT/.admin-backup/` に JSON を退避します。

## ゲームへの取り込み

正本はゲームリポジトリです。Admin は `GAME_ROOT` を直接書き換えます。

1. Admin で保存
2. `dotnet run --project src/Robodun.Desktop` で確認
3. 問題なければゲーム側で commit
4. Android 配布前に運用画面または `npm run bump-content-version`

検証のみ:

```bash
npm run sync-check
```
