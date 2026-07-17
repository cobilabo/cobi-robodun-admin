import { useEffect, useState } from 'react';
import { api, currentMode } from '../lib/api';

export function OpsPage() {
  const mode = currentMode();
  const [version, setVersion] = useState<string | null>(null);
  const [gameRoot, setGameRoot] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportZip = async () => {
    setBusy(true);
    setMsg('エクスポート準備中…');
    try {
      const blob = await api.exportGameZip((m) => setMsg(m));
      const name = `robodun-content-${new Date().toISOString().slice(0, 10)}.zip`;
      downloadBlob(blob, name);
      setMsg(
        `ダウンロード完了: ${name} — 展開して data/ と assets/ をゲームリポ直下へ上書きコピーしてください`,
      );
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const exportJson = async () => {
    try {
      const blob = await api.exportBundle();
      downloadBlob(
        blob,
        `robodun-catalogs-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setMsg('カタログ JSON のみダウンロードしました（アセット含まず）');
    } catch (e) {
      setMsg(String((e as Error).message || e));
    }
  };

  const syncSteps = (
    <ol className="list-decimal list-inside text-sm space-y-2 text-[var(--muted)]">
      <li>Admin でカタログ・画像・音声を編集して保存</li>
      <li>
        下記の <strong className="text-[var(--ink)] font-medium">ゲーム反映用 ZIP</strong>{' '}
        をダウンロード
      </li>
      <li>ZIP を展開する（中に <code className="text-xs">data/</code> と{' '}
        <code className="text-xs">assets/</code> が入っています）</li>
      <li>
        展開した <code className="text-xs">data/</code> と{' '}
        <code className="text-xs">assets/</code> を、ゲームリポ（cobi-robodun）の
        <strong className="text-[var(--ink)] font-medium"> ルート</strong>
        に丸ごと上書きコピー
      </li>
      <li>
        Desktop で確認:
        <pre className="mt-1 text-xs bg-[var(--input-bg)] p-2 rounded overflow-auto text-[var(--ink)]">
          {`cd ${gameRoot || '<cobi-robodun>'}\ndotnet run --project src/Robodun.Desktop`}
        </pre>
      </li>
      <li>問題なければ git commit。Android 配布前に ContentVersion をバンプ</li>
    </ol>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">運用</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          モード: <span className="font-mono text-[var(--ink)]">{mode}</span>
        </p>
      </header>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
        <h3 className="font-medium">ゲームへの反映手順</h3>
        {syncSteps}
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
        <h3 className="font-medium">エクスポート</h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportZip()}
          className="px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm disabled:opacity-40"
        >
          {busy ? '作成中…' : 'ゲーム反映用 ZIP をダウンロード'}
        </button>
        <p className="text-xs text-[var(--muted)]">
          ZIP 直下は <code>data/*.json</code> + <code>assets/**</code>（画像・音声）。
          ゲームリポ直下へコピーするだけで同期できます。ライブラリ画像は含みません。
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportJson()}
          className="px-3 py-2 rounded border border-[var(--line)] text-sm bg-[var(--input-bg)] disabled:opacity-40"
        >
          カタログ JSON のみ（上級者向け）
        </button>
      </section>

      {mode === 'local' && (
        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
          <h3 className="font-medium">Android ContentVersion</h3>
          <p className="text-sm text-[var(--muted)]">
            現在:{' '}
            <span className="font-mono text-[var(--ink)]">{version ?? '—'}</span>
          </p>
          <p className="text-xs text-[var(--muted)]">
            ローカルモードでは GAME_ROOT を直接編集しているため、ZIP
            なしでも Desktop 確認できます。配布前にバンプしてください。
          </p>
          <button
            type="button"
            onClick={bump}
            className="px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm"
          >
            +1 バンプ
          </button>
        </section>
      )}

      {mode === 'cloud' && (
        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-2 text-sm text-[var(--muted)]">
          <h3 className="font-medium text-[var(--ink)]">クラウド時の注意</h3>
          <p>
            Admin 上の編集は Firebase が正本です。ゲームに載せるには必ず ZIP
            反映（または同等の同期）が必要です。ContentVersion バンプはゲームリポ側で行ってください。
          </p>
        </section>
      )}

      {msg && <p className="text-sm text-[var(--muted)]">{msg}</p>}

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-2 text-sm text-[var(--muted)]">
        <h3 className="font-medium text-[var(--ink)]">命名ガイド</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>
            管理番号 <code className="text-xs">id</code>: chr_ / enm_ / bos_ / skl_ /
            eq_ / fx_ / beh_ / aud_
          </li>
          <li>
            通称 <code className="text-xs">code</code>: 旧名称（iron_sword, act_normal
            など）。参照フィールドは必ず id
          </li>
          <li>
            HUD: <code className="text-xs">data/hud.json</code> の
            equipmentSlots はカタログ（HUD）で編集
          </li>
          <li>画像パス: UI/カテゴリ/ファイル.png（assets 基準）</li>
          <li>音声パス: audio/bgm|se|ui/....ogg</li>
        </ul>
      </section>
    </div>
  );
}
