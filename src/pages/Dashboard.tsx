import { useEffect, useState } from 'react';
import { api, currentMode, type Issue } from '../lib/api';

export function Dashboard() {
  const mode = currentMode();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .dashboard()
      .then((r) => {
        setCounts(r.counts);
        setIssues(r.issues);
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
        <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--panel)] p-4 text-sm text-[var(--danger)]">
          {error}
          <div className="mt-2 text-[var(--muted)]">
            {mode === 'cloud'
              ? 'ログイン状態と Firestore / Storage の権限を確認してください。再デプロイ直後ならハードリロードも試してください。'
              : '`.env` の `GAME_ROOT` を cobi-robodun のルートに設定し、API を再起動してください。'}
          </div>
        </div>
      )}

      {!error && (
        <>
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

          <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
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
          </section>
        </>
      )}
    </div>
  );
}
