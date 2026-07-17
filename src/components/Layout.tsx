import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  Images,
  Music2,
  Wrench,
} from 'lucide-react';

const links = [
  { to: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { to: '/catalog', label: 'カタログ', icon: Database },
  { to: '/assets', label: 'アセット', icon: Images },
  { to: '/audio', label: '音声', icon: Music2 },
  { to: '/ops', label: '運用', icon: Wrench },
];

export function Layout() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur p-4 flex flex-col gap-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            cobi
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Robodun Admin</h1>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                    : 'text-[var(--muted)] hover:bg-black/5 hover:text-[var(--ink)]'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto text-xs text-[var(--muted)] leading-relaxed">
          GAME_ROOT の data / assets を直接編集します。保存後に Desktop で確認してください。
        </p>
      </aside>
      <main className="flex-1 min-w-0 p-6">
        <Outlet />
      </main>
    </div>
  );
}
