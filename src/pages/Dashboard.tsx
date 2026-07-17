import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Issue } from '../lib/api';

export function Dashboard() {
  const [gameRoot, setGameRoot] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .dashboard()
      .then((r) => {
        setGameRoot(r.gameRoot);
        setCounts(r.counts);
        setIssues(r.issues);
        setVersion(r.contentVersion);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">ダッシュボード</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          ゲーム制作の現在地を一覧します。
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-[var(--danger)]">
          {error}
          <div className="mt-2 text-[var(--muted)]">
            `.env` の `GAME_ROOT` を cobi-robodun のルートに設定し、API を再起動してください。
          </div>
        </div>
      )}

      {!error && (
        <>
          <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="text-xs text-[var(--muted)]">GAME_ROOT</div>
            <div className="font-mono text-sm break-all">{gameRoot}</div>
            <div className="mt-2 text-sm text-[var(--muted)]">
              Android ContentVersion:{' '}
              <span className="font-medium text-[var(--ink)]">
                {version ?? '—'}
              </span>
            </div>
          </section>

          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(counts).map(([file, n]) => (
              <div
                key={file}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3"
              >
                <div className="text-xs text-[var(--muted)]">{file}</div>
                <div className="text-2xl font-semibold tabular-nums">{n}</div>
              </div>
            ))}
          </section>

          <section className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
              <h3 className="font-medium mb-2">検証</h3>
              <p className="text-sm mb-3">
                エラー <strong className="text-[var(--danger)]">{errors.length}</strong>
                {' / '}
                警告 <strong className="text-[var(--warn)]">{warnings.length}</strong>
              </p>
              <ul className="space-y-1 max-h-64 overflow-auto text-sm">
                {issues.slice(0, 40).map((i, idx) => (
                  <li
                    key={idx}
                    className={
                      i.level === 'error'
                        ? 'text-[var(--danger)]'
                        : 'text-[var(--warn)]'
                    }
                  >
                    [{i.level}] {i.catalog}
                    {i.id ? `/${i.id}` : ''}: {i.message}
                  </li>
                ))}
                {issues.length === 0 && (
                  <li className="text-[var(--accent)]">問題は検出されていません</li>
                )}
              </ul>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
              <h3 className="font-medium">次の一手</h3>
              <ol className="list-decimal list-inside text-sm space-y-2 text-[var(--muted)]">
                <li>
                  <Link className="text-[var(--accent)] underline" to="/catalog">
                    カタログ
                  </Link>
                  で数値・アイコンを編集
                </li>
                <li>
                  <Link className="text-[var(--accent)] underline" to="/assets">
                    アセット
                  </Link>
                  で素材取込・透過トリム
                </li>
                <li>
                  Desktop で確認:{' '}
                  <code className="text-xs bg-black/5 px-1 rounded">
                    dotnet run --project src/Robodun.Desktop
                  </code>
                </li>
                <li>
                  Android 配布前に{' '}
                  <Link className="text-[var(--accent)] underline" to="/ops">
                    運用
                  </Link>
                  で ContentVersion をバンプ
                </li>
              </ol>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
