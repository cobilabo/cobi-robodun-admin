import { Navigate } from 'react-router-dom';

/** @deprecated Use Catalog → HUD (`/catalog?c=hud`). Kept for old bookmarks. */
export function HudPage() {
  return <Navigate to="/catalog?c=hud" replace />;
}
