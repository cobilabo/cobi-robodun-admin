import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { zipSync, strToU8 } from 'fflate';
import {
  listAssets,
  listExternalLibrary,
  importLibraryFile,
  resolveAssetFile,
} from './assets.js';
import { backupDataFile } from './backup.js';
import {
  CATALOG_FILES,
  OBJECT_CATALOG_FILES,
  assetsDir,
  dataDir,
  ensureWithin,
  gameRoot,
  isProjectRoot,
  libraryRoot,
} from './paths.js';
import { trimTransparentPng } from './trim.js';
import { orderCatalogData, stringifyCatalog } from '../src/lib/catalogOrder.ts';
import {
  categoryKeepPath,
  categoryStoragePrefix,
  isCategoryKeepPath,
  normalizeCategoryName,
} from '../src/lib/assetCategory.ts';
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
    const raw = readJsonFile(p) as
      | { cues?: unknown[]; equipmentSlots?: unknown[] }
      | unknown[];
    if (file === 'audio.json') {
      const doc = raw as { cues?: unknown[] };
      counts[file] = Array.isArray(doc?.cues) ? doc.cues.length : 0;
    } else if (file === 'hud.json') {
      const doc = raw as { assetSlots?: unknown[] };
      counts[file] = Array.isArray(doc?.assetSlots) ? doc.assetSlots.length : 0;
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
      const raw = readJsonFile(p) as
        | { cues?: unknown[]; equipmentSlots?: unknown[] }
        | unknown[];
      if (file === 'audio.json') {
        const cues = (raw as { cues?: unknown[] })?.cues;
        count = Array.isArray(cues) ? cues.length : 0;
      } else if (file === 'hud.json') {
        const slots = (raw as { assetSlots?: unknown[] })?.assetSlots;
        count = Array.isArray(slots) ? slots.length : 0;
      } else {
        count = Array.isArray(raw) ? raw.length : 0;
      }
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
    if (file === 'hud.json') {
      res.json({
        ok: true,
        file,
        data: orderCatalogData('hud', {
          appVersion: '1.0.0',
          assetSlots: [],
        }),
      });
      return;
    }
    res.json({ ok: true, file, data: [] });
    return;
  }
  const catalogId = req.params.name;
  const data = orderCatalogData(catalogId, readJsonFile(p));
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
  const allowObject = (OBJECT_CATALOG_FILES as readonly string[]).includes(file);
  if (!allowObject && !Array.isArray(data)) {
    res.status(400).json({ ok: false, error: 'data must be an array' });
    return;
  }
  if (allowObject && (data === null || typeof data !== 'object' || Array.isArray(data))) {
    res.status(400).json({ ok: false, error: 'data must be an object' });
    return;
  }
  try {
    const backupPath = fs.existsSync(path.join(dataDir(root), file))
      ? backupDataFile(root, file)
      : null;
    const catalogId = req.params.name;
    const ordered = orderCatalogData(catalogId, data);
    const p = path.join(dataDir(root), file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, stringifyCatalog(catalogId, ordered), 'utf8');
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
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(full);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

app.post('/api/library/upload', upload.single('file'), (req, res) => {
  const lib = libraryRoot();
  if (!lib) {
    res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
    return;
  }
  const destPath = String(req.body?.destPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!req.file || !destPath || destPath.includes('..')) {
    res.status(400).json({ ok: false, error: 'file and destPath required' });
    return;
  }
  try {
    const full = ensureWithin(lib, path.join(lib, destPath));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, req.file.buffer);
    res.json({ ok: true, path: destPath });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
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
  res.setHeader('Cache-Control', 'no-store');
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

function resolveTrimTarget(
  root: string,
  rel: string,
  source: 'project' | 'library',
): string {
  if (source === 'library') {
    const lib = libraryRoot();
    if (!lib) throw new Error('LIBRARY_ROOT 未設定');
    const full = path.resolve(lib, String(rel).replace(/\//g, path.sep));
    if (!full.startsWith(path.resolve(lib) + path.sep) && full !== path.resolve(lib)) {
      throw new Error('Path escapes');
    }
    return full;
  }
  return resolveAssetFile(root, String(rel));
}

app.post('/api/assets/trim', async (req, res) => {
  const { path: rel, source: srcRaw } = req.body ?? {};
  const source = srcRaw === 'library' ? 'library' : 'project';
  if (!rel) {
    res.status(400).json({ ok: false, error: 'path required' });
    return;
  }
  const root =
    source === 'library' ? gameRoot() || '' : requireGame(res);
  if (source === 'project' && !root) return;
  if (source === 'library' && !libraryRoot()) {
    res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
    return;
  }
  try {
    const full = resolveTrimTarget(root, String(rel), source);
    const result = await trimTransparentPng(full);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/assets/trim-batch', async (req, res) => {
  const paths = req.body?.paths;
  const source = req.body?.source === 'library' ? 'library' : 'project';
  const root =
    source === 'library' ? gameRoot() || '' : requireGame(res);
  if (source === 'project' && !root) return;
  if (source === 'library' && !libraryRoot()) {
    res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
    return;
  }
  if (!Array.isArray(paths) || paths.length === 0) {
    res.status(400).json({ ok: false, error: 'paths[] required' });
    return;
  }
  if (paths.length > 500) {
    res.status(400).json({ ok: false, error: '一度に 500 件まで' });
    return;
  }

  const results: {
    path: string;
    ok: boolean;
    trimmed?: boolean;
    before?: { width: number; height: number };
    after?: { width: number; height: number };
    error?: string;
  }[] = [];

  for (const rel of paths) {
    try {
      const full = resolveTrimTarget(root, String(rel), source);
      const result = await trimTransparentPng(full);
      results.push({
        path: String(rel),
        ok: true,
        trimmed: result.trimmed,
        before: result.before,
        after: result.after,
      });
    } catch (e) {
      results.push({ path: String(rel), ok: false, error: String(e) });
    }
  }

  res.json({
    ok: true,
    trimmedCount: results.filter((r) => r.ok && r.trimmed).length,
    unchangedCount: results.filter((r) => r.ok && !r.trimmed).length,
    failedCount: results.filter((r) => !r.ok).length,
    results,
  });
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

app.post('/api/library/copy', (req, res) => {
  const lib = libraryRoot();
  if (!lib) {
    res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
    return;
  }
  const srcRel = String(req.body?.srcPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const destRel = String(req.body?.destPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!srcRel || !destRel) {
    res.status(400).json({ ok: false, error: 'srcPath and destPath required' });
    return;
  }
  if (srcRel === destRel) {
    res.status(400).json({ ok: false, error: '複製先が複製元と同じです' });
    return;
  }
  try {
    const src = ensureWithin(lib, path.join(lib, srcRel.replace(/\//g, path.sep)));
    const dest = ensureWithin(
      lib,
      path.join(lib, destRel.replace(/\//g, path.sep)),
    );
    if (!fs.existsSync(src)) {
      res.status(404).json({ ok: false, error: '複製元が見つかりません' });
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    res.json({ ok: true, path: destRel });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/assets/move', (req, res) => {
  const srcRel = String(req.body?.srcPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const destRel = String(req.body?.destPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const source = req.body?.source === 'library' ? 'library' : 'project';
  if (!srcRel || !destRel) {
    res.status(400).json({ ok: false, error: 'srcPath and destPath required' });
    return;
  }
  if (srcRel === destRel) {
    res.json({ ok: true, path: destRel });
    return;
  }
  try {
    let src: string;
    let dest: string;
    if (source === 'library') {
      const lib = libraryRoot();
      if (!lib) {
        res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
        return;
      }
      src = ensureWithin(lib, path.join(lib, srcRel.replace(/\//g, path.sep)));
      dest = ensureWithin(lib, path.join(lib, destRel.replace(/\//g, path.sep)));
    } else {
      const root = requireGame(res);
      if (!root) return;
      src = resolveAssetFile(root, srcRel);
      dest = resolveAssetFile(root, destRel);
    }
    if (!fs.existsSync(src)) {
      res.status(404).json({ ok: false, error: '移動元が見つかりません' });
      return;
    }
    if (fs.existsSync(dest)) {
      res.status(409).json({ ok: false, error: '移動先に同名ファイルがあります' });
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
    res.json({ ok: true, path: destRel });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/library/generate', (_req, res) => {
  res.status(501).json({
    ok: false,
    error:
      'ローカルモードの AI 生成は未対応です。クラウド（Hosting）で利用してください。',
  });
});

app.post('/api/audio/generate', (_req, res) => {
  res.status(501).json({
    ok: false,
    error:
      'ローカルモードの音声 AI 生成は未対応です。クラウド（Hosting）で利用してください。',
  });
});

app.post('/api/audio/translate-prompt', (_req, res) => {
  res.status(501).json({
    ok: false,
    error:
      'ローカルモードのプロンプト翻訳は未対応です。クラウド（Hosting）で利用してください。',
  });
});

app.post('/api/audio/normalize', (_req, res) => {
  res.status(501).json({
    ok: false,
    error:
      'ローカルモードの音声正規化は未対応です。クラウド（Hosting）で利用してください。',
  });
});

app.post('/api/categories/create', (req, res) => {
  const source = req.body?.source === 'library' ? 'library' : 'project';
  try {
    const cat = normalizeCategoryName(String(req.body?.category || ''));
    const keepRel = categoryKeepPath(cat, source);
    if (source === 'library') {
      const lib = libraryRoot();
      if (!lib) {
        res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
        return;
      }
      const full = ensureWithin(
        lib,
        path.join(lib, keepRel.replace(/\//g, path.sep)),
      );
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (!fs.existsSync(full)) fs.writeFileSync(full, '');
    } else {
      const root = requireGame(res);
      if (!root) return;
      const full = resolveAssetFile(root, keepRel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (!fs.existsSync(full)) fs.writeFileSync(full, '');
    }
    res.json({ ok: true, category: cat, path: keepRel });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

app.post('/api/categories/delete', (req, res) => {
  const source = req.body?.source === 'library' ? 'library' : 'project';
  try {
    const cat = normalizeCategoryName(String(req.body?.category || ''));
    const prefix = categoryStoragePrefix(cat, source);
    let baseRoot: string;
    let entries: { rel: string; full: string }[] = [];

    if (source === 'library') {
      const lib = libraryRoot();
      if (!lib) {
        res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
        return;
      }
      baseRoot = lib;
      const dir = ensureWithin(lib, path.join(lib, prefix.replace(/\/$/, '').replace(/\//g, path.sep)));
      const walk = (d: string) => {
        if (!fs.existsSync(d)) return;
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, ent.name);
          if (ent.isDirectory()) walk(full);
          else {
            const rel = path.relative(lib, full).replace(/\\/g, '/');
            entries.push({ rel, full });
          }
        }
      };
      walk(dir);
    } else {
      const root = requireGame(res);
      if (!root) return;
      baseRoot = assetsDir(root);
      const dir = ensureWithin(
        baseRoot,
        path.join(baseRoot, prefix.replace(/\/$/, '').replace(/\//g, path.sep)),
      );
      const walk = (d: string) => {
        if (!fs.existsSync(d)) return;
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, ent.name);
          if (ent.isDirectory()) walk(full);
          else {
            const rel = path.relative(baseRoot, full).replace(/\\/g, '/');
            entries.push({ rel, full });
          }
        }
      };
      walk(dir);
    }

    const images = entries.filter(
      (e) =>
        !isCategoryKeepPath(e.rel) &&
        ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(
          path.extname(e.rel).toLowerCase(),
        ),
    );
    if (images.length > 0) {
      res.status(400).json({
        ok: false,
        error: `カテゴリ「${cat}」には画像が ${images.length} 件あるため削除できません`,
      });
      return;
    }
    if (entries.length === 0) {
      res.status(404).json({ ok: false, error: `カテゴリ「${cat}」が見つかりません` });
      return;
    }
    for (const e of entries) fs.unlinkSync(e.full);
    // remove empty dirs bottom-up
    const dirPath = path.join(
      baseRoot,
      prefix.replace(/\/$/, '').replace(/\//g, path.sep),
    );
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    res.json({ ok: true, category: cat, deleted: entries.length });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

app.post('/api/categories/rename', (req, res) => {
  const source = req.body?.source === 'library' ? 'library' : 'project';
  try {
    const from = normalizeCategoryName(String(req.body?.fromCategory || ''));
    const to = normalizeCategoryName(String(req.body?.toCategory || ''));
    if (from === to) {
      res.json({ ok: true, from, to, moved: 0 });
      return;
    }
    const fromPrefix = categoryStoragePrefix(from, source);
    const toPrefix = categoryStoragePrefix(to, source);

    let baseRoot: string;
    if (source === 'library') {
      const lib = libraryRoot();
      if (!lib) {
        res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
        return;
      }
      baseRoot = lib;
    } else {
      const root = requireGame(res);
      if (!root) return;
      baseRoot = assetsDir(root);
    }

    const fromDir = ensureWithin(
      baseRoot,
      path.join(baseRoot, fromPrefix.replace(/\/$/, '').replace(/\//g, path.sep)),
    );
    const toDir = ensureWithin(
      baseRoot,
      path.join(baseRoot, toPrefix.replace(/\/$/, '').replace(/\//g, path.sep)),
    );
    if (!fs.existsSync(fromDir)) {
      res.status(404).json({ ok: false, error: `カテゴリ「${from}」が見つかりません` });
      return;
    }
    if (fs.existsSync(toDir)) {
      res.status(409).json({
        ok: false,
        error: `移動先カテゴリ「${to}」は既に存在します`,
      });
      return;
    }
    fs.mkdirSync(path.dirname(toDir), { recursive: true });
    fs.renameSync(fromDir, toDir);
    let moved = 0;
    const walk = (d: string) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, ent.name);
        if (ent.isDirectory()) walk(full);
        else moved++;
      }
    };
    walk(toDir);
    res.json({ ok: true, from, to, moved });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

app.post('/api/assets/delete', (req, res) => {
  const rel = String(req.body?.path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!rel) {
    res.status(400).json({ ok: false, error: 'path required' });
    return;
  }
  const source = req.body?.source === 'library' ? 'library' : 'project';
  try {
    let full: string;
    if (source === 'library') {
      const lib = libraryRoot();
      if (!lib) {
        res.status(400).json({ ok: false, error: 'LIBRARY_ROOT 未設定' });
        return;
      }
      full = ensureWithin(lib, path.join(lib, rel.replace(/\//g, path.sep)));
    } else {
      const root = requireGame(res);
      if (!root) return;
      full = resolveAssetFile(root, rel);
    }
    if (!fs.existsSync(full)) {
      res.status(404).json({ ok: false, error: 'ファイルが見つかりません' });
      return;
    }
    fs.unlinkSync(full);
    res.json({ ok: true, path: rel });
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

app.get('/api/ops/export-game-zip', (_req, res) => {
  const root = requireGame(res);
  if (!root) return;
  try {
    const files: Record<string, Uint8Array> = {};
    const data = dataDir(root);
    for (const name of CATALOG_FILES) {
      const p = path.join(data, name);
      if (!fs.existsSync(p)) continue;
      files[`data/${name}`] = new Uint8Array(fs.readFileSync(p));
    }
    const assets = assetsDir(root);
    const walk = (dir: string, base: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, base);
        else {
          const rel = path.relative(base, full).replace(/\\/g, '/');
          files[`assets/${rel}`] = new Uint8Array(fs.readFileSync(full));
        }
      }
    };
    if (fs.existsSync(assets)) walk(assets, assets);
    files['IMPORT.txt'] = strToU8(
      [
        'Robodun content export (local)',
        '',
        '展開後、data/ と assets/ を cobi-robodun ルートに上書きコピーしてください。',
        '',
      ].join('\n'),
    );
    const zipped = zipSync(files, { level: 6 });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="robodun-content-${new Date().toISOString().slice(0, 10)}.zip"`,
    );
    res.send(Buffer.from(zipped));
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(port, () => {
  console.log(`[robodun-admin] API http://127.0.0.1:${port}`);
  console.log(`[robodun-admin] GAME_ROOT=${gameRoot() ?? '(unset)'}`);
});
