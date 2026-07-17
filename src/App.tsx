import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { CatalogEditor } from './pages/CatalogEditor';
import { AssetsPage } from './pages/AssetsPage';
import { AudioPage } from './pages/AudioPage';
import { OpsPage } from './pages/OpsPage';

export default function App() {
  return (
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
  );
}
