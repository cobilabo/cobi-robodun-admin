import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { CatalogEditor } from './pages/CatalogEditor';
import { AssetsPage } from './pages/AssetsPage';
import { AudioPage } from './pages/AudioPage';
import { OpsPage } from './pages/OpsPage';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './hooks/useAuth';

function Protected({ children }: { children: React.ReactNode }) {
  const { requiresAuth, currentUser, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">
        読み込み中...
      </div>
    );
  }
  if (requiresAuth && !currentUser) return <Login />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Protected>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="catalog" element={<CatalogEditor />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="audio" element={<AudioPage />} />
            <Route path="ops" element={<OpsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Protected>
    </AuthProvider>
  );
}
