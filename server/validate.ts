import fs from 'node:fs';
import path from 'node:path';
import { assetsDir, dataDir } from './paths.js';

export type Issue = {
  level: 'error' | 'warning';
  catalog?: string;
  id?: string;
  message: string;
};

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function readJsonArray(filePath: string): Record<string, unknown>[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(readText(filePath));
  return Array.isArray(raw) ? raw : [];
}

function assetExists(root: string, rel?: unknown): boolean {
  if (typeof rel !== 'string' || !rel.trim()) return false;
  const full = path.join(assetsDir(root), rel.replace(/\//g, path.sep));
  return fs.existsSync(full);
}

export function validateGameContent(root: string): Issue[] {
  const issues: Issue[] = [];
  const d = dataDir(root);
  const characters = readJsonArray(path.join(d, 'characters.json'));
  const skills = readJsonArray(path.join(d, 'skills.json'));
  const effects = readJsonArray(path.join(d, 'effects.json'));
  const equipment = readJsonArray(path.join(d, 'equipment.json'));
  const enemies = readJsonArray(path.join(d, 'enemies.json'));
  const bosses = readJsonArray(path.join(d, 'bosses.json'));
  const behaviors = readJsonArray(path.join(d, 'behaviors.json'));
  const audio = (() => {
    const p = path.join(d, 'audio.json');
    if (!fs.existsSync(p)) return { cues: [] as Record<string, unknown>[] };
    const raw = JSON.parse(readText(p));
    return {
      cues: Array.isArray(raw?.cues) ? (raw.cues as Record<string, unknown>[]) : [],
    };
  })();

  const skillIds = new Set(skills.map((x) => String(x.id ?? '')));
  const effectIds = new Set(effects.map((x) => String(x.id ?? '')));
  const equipIds = new Set(equipment.map((x) => String(x.id ?? '')));
  const behaviorIds = new Set(behaviors.map((x) => String(x.id ?? '')));

  const checkDup = (rows: Record<string, unknown>[], catalog: string) => {
    const seen = new Set<string>();
    for (const row of rows) {
      const id = String(row.id ?? '');
      if (!id) {
        issues.push({ level: 'error', catalog, message: 'id が空の行があります' });
        continue;
      }
      if (seen.has(id)) {
        issues.push({ level: 'error', catalog, id, message: 'id が重複しています' });
      }
      seen.add(id);
    }
  };

  checkDup(characters, 'characters');
  checkDup(skills, 'skills');
  checkDup(effects, 'effects');
  checkDup(equipment, 'equipment');
  checkDup(enemies, 'enemies');
  checkDup(bosses, 'bosses');
  checkDup(behaviors, 'behaviors');

  for (const c of characters) {
    const id = String(c.id ?? '');
    for (const sid of (c.exclusiveSkillIds as string[]) ?? []) {
      if (!skillIds.has(sid)) {
        issues.push({
          level: 'error',
          catalog: 'characters',
          id,
          message: `存在しない skill: ${sid}`,
        });
      }
    }
    for (const eid of (c.starterEquipmentIds as string[]) ?? []) {
      if (!equipIds.has(eid)) {
        issues.push({
          level: 'error',
          catalog: 'characters',
          id,
          message: `存在しない equipment: ${eid}`,
        });
      }
    }
    if (c.portrait && !assetExists(root, c.portrait)) {
      issues.push({
        level: 'error',
        catalog: 'characters',
        id,
        message: `portrait ファイル無し: ${c.portrait}`,
      });
    }
    if (!c.portrait) {
      issues.push({
        level: 'warning',
        catalog: 'characters',
        id,
        message: 'portrait 未割当',
      });
    }
  }

  for (const s of skills) {
    const id = String(s.id ?? '');
    for (const fx of (s.effectIds as string[]) ?? []) {
      if (!effectIds.has(fx)) {
        issues.push({
          level: 'error',
          catalog: 'skills',
          id,
          message: `存在しない effect: ${fx}`,
        });
      }
    }
    if (s.icon && !assetExists(root, s.icon)) {
      issues.push({
        level: 'error',
        catalog: 'skills',
        id,
        message: `icon ファイル無し: ${s.icon}`,
      });
    }
    if (!s.icon) {
      issues.push({
        level: 'warning',
        catalog: 'skills',
        id,
        message: 'icon 未割当',
      });
    }
  }

  for (const e of [...enemies, ...bosses]) {
    const id = String(e.id ?? '');
    const catalog = bosses.includes(e) ? 'bosses' : 'enemies';
    const bid = String(e.behaviorId ?? '');
    if (bid && behaviorIds.size > 0 && !behaviorIds.has(bid)) {
      issues.push({
        level: 'warning',
        catalog,
        id,
        message: `behaviors.json に無い behaviorId: ${bid}`,
      });
    }
    if (e.icon && !assetExists(root, e.icon)) {
      issues.push({
        level: 'error',
        catalog,
        id,
        message: `icon ファイル無し: ${e.icon}`,
      });
    }
    if (!e.icon) {
      issues.push({
        level: 'warning',
        catalog,
        id,
        message: 'icon 未割当',
      });
    }
  }

  for (const e of equipment) {
    const id = String(e.id ?? '');
    if (e.icon && !assetExists(root, e.icon)) {
      issues.push({
        level: 'error',
        catalog: 'equipment',
        id,
        message: `icon ファイル無し: ${e.icon}`,
      });
    }
    if (!e.icon) {
      issues.push({
        level: 'warning',
        catalog: 'equipment',
        id,
        message: 'icon 未割当',
      });
    }
  }

  for (const cue of audio.cues) {
    const id = String(cue.id ?? '');
    const file = typeof cue.file === 'string' ? cue.file.trim() : '';
    if (file && !assetExists(root, file)) {
      issues.push({
        level: 'error',
        catalog: 'audio',
        id,
        message: `音声ファイル無し: ${file}`,
      });
    }
    if (!file) {
      issues.push({
        level: 'warning',
        catalog: 'audio',
        id,
        message: 'file 未割当',
      });
    }
  }

  const hudPath = path.join(d, 'hud.json');
  if (!fs.existsSync(hudPath)) {
    issues.push({
      level: 'warning',
      catalog: 'hud',
      message: 'hud.json がありません',
    });
  } else {
    const hud = JSON.parse(readText(hudPath)) as {
      appVersion?: unknown;
      assetSlots?: Record<string, unknown>[];
    };
    if (!String(hud.appVersion ?? '').trim()) {
      issues.push({
        level: 'error',
        catalog: 'hud',
        message: 'appVersion が空です',
      });
    }
    const assets = Array.isArray(hud.assetSlots) ? hud.assetSlots : [];
    if (assets.length === 0) {
      issues.push({
        level: 'warning',
        catalog: 'hud',
        message: 'assetSlots が空です',
      });
    }
    const seenKeys = new Set<string>();
    for (const [i, slot] of assets.entries()) {
      const key = String(slot.key ?? '').trim();
      const icon = String(slot.icon ?? '').trim();
      if (!key) {
        issues.push({
          level: 'error',
          catalog: 'hud',
          id: `asset[${i}]`,
          message: 'key が空です',
        });
      } else if (seenKeys.has(key)) {
        issues.push({
          level: 'error',
          catalog: 'hud',
          id: key,
          message: `key が重複: ${key}`,
        });
      } else {
        seenKeys.add(key);
      }
      if (icon && !assetExists(root, icon)) {
        issues.push({
          level: 'error',
          catalog: 'hud',
          id: key || `asset[${i}]`,
          message: `icon ファイル無し: ${icon}`,
        });
      }
    }
  }

  return issues;
}
