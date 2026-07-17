/** local = Express+GAME_ROOT / cloud = Firebase Hosting+Firestore+Storage */
export type DataMode = 'local' | 'cloud';

export function getDataMode(): DataMode {
  const raw = (import.meta.env.VITE_DATA_MODE || 'local').toLowerCase();
  return raw === 'cloud' ? 'cloud' : 'local';
}

export function isCloudMode(): boolean {
  return getDataMode() === 'cloud';
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  );
}
