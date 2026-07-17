import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import {
  listAssets,
  listExternalLibrary,
  importLibraryFile,
  resolveAssetFile,
} from './assets.js';
import { backupDataFile } from './backup.js';
import {
  CATALOG_FILES,
  dataDir,
  gameRoot,
  isProjectRoot,
  libraryRoot,
} from './paths.js';
import { trimTransparentPng } from './trim.js';
import { validateGameContent } from './validate.js';

const app = express();
const port = Number(process.env.PORT || 5174);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '20mb' }));

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function requireGame(res: express.Response): string | null {
  const root = gameRoot();
  if (!root) {
    res.status(503).json({
      ok: false,
      error: 'GAME_ROOT が未設定、または存在しません。.env を確認してください。',
    });
    return null;
  }
  if (!isProjectRoot(root)) {
    res.status(503).json({
      ok: false,
      error: `GAME_ROOT がプロジェクトルートではありません: ${root}`,
    });
    return null;
  }
  return root;
}

app.get('/api/health', (_req, res) => {
  const root = gameRoot();
  res.json({
    ok: true,
    gameRoot: root,
    libraryRoot: libraryRoot(),
    projectOk: root ? isProjectRoot(root) : false,
  });
});

app.get('/api/dashboard', (_req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const counts: Record<string, number> = {};
  for (const file of CATALOG_FILES) {
    const p = path.join(dataDir(root), file);
    if (!fs.existsSync(p)) {
      counts[file] = 0;
      continue;
    }
    const raw = readJsonFile(p) as { cues?: unknown[] } | unknown[];
    if (file === 'audio.json') {
      const doc = raw as { cues?: unknown[] };
      counts[file] = Array.isArray(doc?.cues) ? doc.cues.length : 0;
    } else {
      counts[file] = Array.isArray(raw) ? raw.length : 0;
    }
  }
  const issues = validateGameContent(root);
  res.json({
    ok: true,
    gameRoot: root,
    counts,
    issues,
    contentVersion: readContentVersion(root),
  });
});

function readContentVersion(root: string): string | null {
  const p = path.join(
    root,
    'src',
    'Robodun.Android',
    'GameContentInstaller.cs',
  );
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  const m = text.match(/ContentVersion\s*=\s*"(\d+)"/);
  return m?.[1] ?? null;
}

app.get('/api/catalogs', (_req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const catalogs = CATALOG_FILES.map((file) => {
    const p = path.join(dataDir(root), file);
    const exists = fs.existsSync(p);
    let count = 0;
    if (exists) {
      const raw = readJsonFile(p) as { cues?: unknown[] } | unknown[];
      count =
        file === 'audio.json'
          ? Array.isArray((raw as { cues?: unknown[] })?.cues)
            ? ((raw as { cues: unknown[] }).cues.length)
            : 0
          : Array.isArray(raw)
            ? raw.length
            : 0;
    }
    return { id: file.replace(/\.json$/, ''), file, exists, count };
  });
  res.json({ ok: true, catalogs });
});

app.get('/api/catalogs/:name', (req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const file = `${req.params.name}.json`;
  if (!(CATALOG_FILES as readonly string[]).includes(file)) {
    res.status(404).json({ ok: false, error: 'Unknown catalog' });
    return;
  }
  const p = path.join(dataDir(root), file);
  if (!fs.existsSync(p)) {
    if (file === 'audio.json') {
      res.json({ ok: true, file, data: { version: 1, cues: [] } });
      return;
    }
    res.json({ ok: true, file, data: [] });
    return;
  }
  const data = readJsonFile(p);
  res.json({ ok: true, file, data });
});

app.put('/api/catalogs/:name', (req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const file = `${req.params.name}.json`;
  if (!(CATALOG_FILES as readonly string[]).includes(file)) {
    res.status(404).json({ ok: false, error: 'Unknown catalog' });
    return;
  }
  const data = req.body?.data;
  if (data === undefined) {
    res.status(400).json({ ok: false, error: 'body.data required' });
    return;
  }
  if (file !== 'audio.json' && !Array.isArray(data)) {
    res.status(400).json({ ok: false, error: 'data must be an array' });
    return;
  }
  try {
    const backupPath = fs.existsSync(path.join(dataDir(root), file))
      ? backupDataFile(root, file)
      : null;
    const p = path.join(dataDir(root), file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
    const issues = validateGameContent(root);
    res.json({ ok: true, backupPath, issues });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/api/validate', (_req, res) => {
  const root = requireGame(res);
  if (!root) return;
  res.json({ ok: true, issues: validateGameContent(root) });
});

app.get('/api/assets', (req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const sub = typeof req.query.sub === 'string' ? req.query.sub : '';
  res.json({ ok: true, assets: listAssets(root, sub) });
});

app.get('/api/library', (_req, res) => {
  const lib = libraryRoot();
  if (!lib) {
    res.json({ ok: true, libraryRoot: null, assets: [] });
    return;
  }
  res.json({ ok: true, libraryRoot: lib, assets: listExternalLibrary(lib) });
});

app.get('/api/asset-file', (req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const rel = String(req.query.path || '');
  try {
    const full = resolveAssetFile(root, rel);
    res.sendFile(full);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

app.get('/api/library-file', (req, res) => {
  const lib = libraryRoot();
  if (!lib) {
    res.status(404).end();
    return;
  }
  const rel = String(req.query.path || '');
  const full = path.resolve(lib, rel.replace(/\//g, path.sep));
  if (!full.startsWith(path.resolve(lib) + path.sep) && full !== path.resolve(lib)) {
    res.status(400).json({ ok: false, error: 'Path escapes library' });
    return;
  }
  if (!fs.existsSync(full)) {
    res.status(404).end();
    return;
  }
  res.sendFile(full);
});

app.post('/api/assets/import', (req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const lib = libraryRoot();
  if (!lib) {
    res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
    return;
  }
  const { libraryPath, destPath } = req.body ?? {};
  if (!libraryPath || !destPath) {
    res.status(400).json({ ok: false, error: 'libraryPath and destPath required' });
    return;
  }
  try {
    const written = importLibraryFile(lib, libraryPath, root, destPath);
    res.json({ ok: true, path: written });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/assets/trim', async (req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const { path: rel, source } = req.body ?? {};
  if (!rel) {
    res.status(400).json({ ok: false, error: 'path required' });
    return;
  }
  try {
    let full: string;
    if (source === 'library') {
      const lib = libraryRoot();
      if (!lib) throw new Error('LIBRARY_ROOT 未設定');
      full = path.resolve(lib, String(rel).replace(/\//g, path.sep));
      if (!full.startsWith(path.resolve(lib) + path.sep)) throw new Error('Path escapes');
    } else {
      full = resolveAssetFile(root, String(rel));
    }
    const result = await trimTransparentPng(full);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/assets/upload', upload.single('file'), (req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const destPath = String(req.body?.destPath || '');
  if (!req.file || !destPath) {
    res.status(400).json({ ok: false, error: 'file and destPath required' });
    return;
  }
  try {
    const full = resolveAssetFile(root, destPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, req.file.buffer);
    res.json({ ok: true, path: destPath.replace(/\\/g, '/') });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/ops/bump-content-version', (_req, res) => {
  const root = requireGame(res);
  if (!root) return;
  const p = path.join(root, 'src', 'Robodun.Android', 'GameContentInstaller.cs');
  if (!fs.existsSync(p)) {
    res.status(404).json({ ok: false, error: 'GameContentInstaller.cs が見つかりません' });
    return;
  }
  const text = fs.readFileSync(p, 'utf8');
  const m = text.match(/ContentVersion\s*=\s*"(\d+)"/);
  if (!m) {
    res.status(400).json({ ok: false, error: 'ContentVersion が見つかりません' });
    return;
  }
  const next = String(Number(m[1]) + 1);
  const updated = text.replace(
    /ContentVersion\s*=\s*"\d+"/,
    `ContentVersion = "${next}"`,
  );
  fs.writeFileSync(p, updated, 'utf8');
  res.json({ ok: true, from: m[1], to: next });
});

app.listen(port, () => {
  console.log(`[robodun-admin] API http://127.0.0.1:${port}`);
  console.log(`[robodun-admin] GAME_ROOT=${gameRoot() ?? '(unset)'}`);
});
