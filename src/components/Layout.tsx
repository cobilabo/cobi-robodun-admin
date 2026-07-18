import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  Images,
  Music2,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { UiButton } from './ui';

const links = [
  { to: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { to: '/catalog', label: 'カタログ', icon: Database },
  { to: '/assets', label: 'アセット', icon: Images },
  { to: '/audio', label: '音声', icon: Music2 },
  { to: '/ops', label: '運用', icon: Wrench },
];

export function Layout() {
  const { currentUser, logout, requiresAuth } = useAuth();

  return (
    <div className="h-svh flex overflow-hidden">
      <aside className="w-48 shrink-0 h-full overflow-y-auto border-r border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur p-3 flex flex-col gap-4 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            cobi
          </div>
          <h1 className="text-base font-semibold tracking-tight">Robodun Admin</h1>
        </div>
        <nav className="flex flex-col gap-0.5">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] transition ${
                  isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                    : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'
                }`
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>
        {requiresAuth && currentUser && (
          <div className="mt-auto space-y-2">
            <p className="text-[10px] text-[var(--muted)] break-all text-center">
              {currentUser.email}
            </p>
            <UiButton className="w-full" onClick={() => void logout()}>
              ログアウト
            </UiButton>
          </div>
        )}
      </aside>
      <main className="flex-1 min-w-0 min-h-0 overflow-auto p-4 text-xs">
        <Outlet />
      </main>
    </div>
  );
}
