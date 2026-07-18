/** Derive display category from a relative asset path (matches server/cloudApi). */
export function categoryOfPath(
  relativePath: string,
  source: 'project' | 'library',
): string {
  const parts = relativePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
  if (source === 'library') return parts[0] || 'root';
  if (parts[0] === 'UI' && parts.length >= 2) return parts[1]!;
  if (parts[0] === 'audio' && parts.length >= 2) return `audio/${parts[1]}`;
  if (parts[0] === 'fonts') return 'fonts';
  return parts[0] || 'root';
}

/** Placeholder file that keeps an otherwise-empty category folder visible. */
export const CATEGORY_KEEP_NAME = '.keep';

export function fileNameOf(relativePath: string): string {
  const rel = relativePath.replace(/\\/g, '/');
  const i = rel.lastIndexOf('/');
  return i >= 0 ? rel.slice(i + 1) : rel;
}

export function isCategoryKeepPath(relativePath: string): boolean {
  return fileNameOf(relativePath) === CATEGORY_KEEP_NAME;
}

export function normalizeCategoryName(raw: string): string {
  const cat = raw
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
  if (
    !cat ||
    cat.includes('..') ||
    cat.split('/').some((p) => !p || p === '.')
  ) {
    throw new Error('カテゴリ名が不正です');
  }
  return cat;
}

/** Storage / disk prefix for a category (trailing slash). */
export function categoryStoragePrefix(
  category: string,
  source: 'project' | 'library',
): string {
  const cat = normalizeCategoryName(category);
  if (source === 'library') return `${cat}/`;
  if (cat.startsWith('audio/')) return `${cat}/`;
  if (cat === 'fonts') return 'fonts/';
  return `UI/${cat}/`;
}

export function categoryKeepPath(
  category: string,
  source: 'project' | 'library',
): string {
  return `${categoryStoragePrefix(category, source)}${CATEGORY_KEEP_NAME}`;
}

/**
 * Rewrite a relative path from one category folder into another,
 * keeping the trailing path after the category prefix.
 */
export function rewritePathCategory(
  relativePath: string,
  fromCategory: string,
  toCategory: string,
  source: 'project' | 'library',
): string {
  const rel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const fromPrefix = categoryStoragePrefix(fromCategory, source);
  const toPrefix = categoryStoragePrefix(toCategory, source);
  if (rel === fromPrefix.replace(/\/$/, '')) {
    return toPrefix.replace(/\/$/, '');
  }
  if (!rel.startsWith(fromPrefix)) {
    throw new Error(`パスがカテゴリ「${fromCategory}」配下ではありません: ${rel}`);
  }
  return `${toPrefix}${rel.slice(fromPrefix.length)}`;
}

/**
 * Rebuild path under a new category. Keeps trailing path segments when possible.
 * Catalog JSON paths are NOT updated by callers of this helper.
 */
export function pathWithCategory(
  relativePath: string,
  newCategory: string,
  source: 'project' | 'library',
): string {
  const rel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = rel.split('/').filter(Boolean);
  const fileName = parts[parts.length - 1] || 'file';
  const cat = normalizeCategoryName(newCategory);

  if (source === 'library') {
    if (parts.length <= 1) return `${cat}/${fileName}`;
    return [cat, ...parts.slice(1)].join('/');
  }

  if (cat.startsWith('audio/')) {
    const sub = cat.slice('audio/'.length).replace(/^\/+|\/+$/g, '');
    if (!sub) throw new Error('audio カテゴリが不正です');
    return `audio/${sub}/${fileName}`;
  }
  if (cat === 'fonts') {
    return `fonts/${fileName}`;
  }
  if (parts[0] === 'UI' && parts.length >= 2) {
    return ['UI', cat, ...parts.slice(2)].join('/');
  }
  return `UI/${cat}/${fileName}`;
}

export function defaultAiDestPath(referencePath: string): string {
  const rel = referencePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const i = rel.lastIndexOf('/');
  const dir = i >= 0 ? rel.slice(0, i + 1) : '';
  return `${dir}${defaultAiFileName()}`;
}

export function defaultAiFileName(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '')
    .replace('T', '_');
  return `ai_${stamp}.webp`;
}

/** Build library/project relative path from category + file name. */
export function pathInCategory(
  category: string,
  fileName: string,
  source: 'project' | 'library',
): string {
  const prefix = categoryStoragePrefix(category, source);
  const name = fileName
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.trim();
  if (!name || name === '.' || name === '..' || name.includes('..')) {
    throw new Error('ファイル名が不正です');
  }
  return `${prefix}${name}`;
}

export function defaultCopyFileName(relativePath: string): string {
  const name = fileNameOf(relativePath);
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  return `${base}_copy${ext}`;
}

/** Same directory, new file name (basename only). */
export function pathWithFileName(
  relativePath: string,
  newFileName: string,
): string {
  const rel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const name = newFileName
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.trim();
  if (!name || name === '.' || name === '..' || name.includes('..')) {
    throw new Error('ファイル名が不正です');
  }
  const i = rel.lastIndexOf('/');
  const dir = i >= 0 ? rel.slice(0, i + 1) : '';
  return `${dir}${name}`;
}

/**
 * ライブラリ相対パス → プロジェクト（ゲーム assets）相対パス。
 * 例: enemies/slime.webp → UI/enemies/slime.webp
 * 既に UI/ / audio/ ならそのまま。
 */
export function libraryPathToProjectPath(libraryPath: string): string {
  const rel = libraryPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel) throw new Error('ライブラリパスが空です');
  if (rel.startsWith('UI/') || rel.startsWith('audio/') || rel.startsWith('fonts/')) {
    return rel;
  }
  return `UI/${rel}`;
}

/** プロジェクトパスから対応しうるライブラリパス（UI/ を剥がす）。 */
export function projectPathToLibraryPath(projectPath: string): string | null {
  const rel = projectPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel) return null;
  if (rel.startsWith('UI/')) return rel.slice(3) || null;
  return null;
}

