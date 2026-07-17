import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function OpsPage() {
  const [version, setVersion] = useState<string | null>(null);
  const [gameRoot, setGameRoot] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api
      .dashboard()
      .then((r) => {
        setVersion(r.contentVersion);
        setGameRoot(r.gameRoot);
      })
      .catch((e) => setMsg(String(e.message || e)));
  }, []);

  const bump = async () => {
    try {
      const r = await api.bumpContentVersion();
      setVersion(r.to);
      setMsg(`ContentVersion ${r.from} → ${r.to}`);
    } catch (e) {
      setMsg(String((e as Error).message || e));
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">運用</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          ゲームへの取り込みチェックリストと Android 版数管理。
        </p>
      </header>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-2">
        <h3 className="font-medium">プレイ確認</h3>
        <ol className="list-decimal list-inside text-sm space-y-2 text-[var(--muted)]">
          <li>Admin で JSON / アセットを保存（自動で .admin-backup に退避）</li>
          <li>
            ゲームルートで Desktop 起動:
            <pre className="mt-1 text-xs bg-black/5 p-2 rounded overflow-auto">
              cd {gameRoot || 'GAME_ROOT'}
              {'\n'}dotnet run --project src/Robodun.Desktop
            </pre>
          </li>
          <li>問題なければゲームリポで git commit</li>
          <li>Android 実機/エミュへ入れる前に ContentVersion をバンプ</li>
        </ol>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
        <h3 className="font-medium">Android ContentVersion</h3>
        <p className="text-sm text-[var(--muted)]">
          現在:{' '}
          <span className="font-mono text-[var(--ink)]">{version ?? '—'}</span>
        </p>
        <button
          type="button"
          onClick={bump}
          className="px-3 py-2 rounded bg-[var(--accent)] text-white text-sm"
        >
          +1 バンプ
        </button>
        {msg && <p className="text-sm text-[var(--muted)]">{msg}</p>}
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-2 text-sm text-[var(--muted)]">
        <h3 className="font-medium text-[var(--ink)]">命名ガイド</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>キャラ: char_*</li>
          <li>スキル: sk_*</li>
          <li>効果: fx_*</li>
          <li>行動: act_*</li>
          <li>ボス: boss_*</li>
          <li>画像パス: UI/カテゴリ/ファイル.png（assets 基準）</li>
          <li>音声パス: audio/bgm|se/....ogg</li>
        </ul>
      </section>
    </div>
  );
}
