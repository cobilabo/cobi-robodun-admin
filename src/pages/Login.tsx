import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isFirebaseConfigured } from '../lib/mode';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(String((err as Error).message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 space-y-4"
      >
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            cobi
          </div>
          <h1 className="text-xl font-semibold">Robodun Admin</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            クラウドモード — ログインして共有データを編集
          </p>
        </div>

        {!isFirebaseConfigured() && (
          <p className="text-sm text-[var(--danger)]">
            VITE_FIREBASE_* が未設定です。.env を確認してください。
          </p>
        )}

        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            type="email"
            required
            className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 bg-[var(--input-bg)]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Password</span>
          <input
            type="password"
            required
            className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 bg-[var(--input-bg)]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <button
          type="submit"
          disabled={busy || !isFirebaseConfigured()}
          className="w-full px-3 py-2 rounded bg-[var(--accent)] text-[var(--bg)] text-sm disabled:opacity-40"
        >
          {busy ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  );
}
