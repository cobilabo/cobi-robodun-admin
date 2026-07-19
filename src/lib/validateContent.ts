import type { Issue } from './apiTypes';
import { CATALOG_IDS } from './catalogRegistry';

export { CATALOG_IDS };

function assetExists(paths: Set<string>, rel?: unknown): boolean {
  if (typeof rel !== 'string' || !rel.trim()) return false;
  return paths.has(rel.replace(/\\/g, '/'));
}

function asRows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/** Shared validation for local and cloud catalogs. */
export function validateCatalogBundle(
  catalogs: Record<string, unknown>,
  assetPaths: string[],
): Issue[] {
  const issues: Issue[] = [];
  const pathSet = new Set(assetPaths.map((p) => p.replace(/\\/g, '/')));

  const characters = asRows(catalogs.characters);
  const skills = asRows(catalogs.skills);
  const effects = asRows(catalogs.effects);
  const equipment = asRows(catalogs.equipment);
  const enemies = asRows(catalogs.enemies);
  const bosses = asRows(catalogs.bosses);
  const behaviors = asRows(catalogs.behaviors);
  const audioRaw = catalogs.audio as { cues?: Record<string, unknown>[] } | undefined;
  const audioCues = Array.isArray(audioRaw?.cues) ? audioRaw!.cues! : [];
  const hudRaw = catalogs.hud as
    | { appVersion?: unknown; assetSlots?: Record<string, unknown>[] }
    | undefined;

  const skillIds = new Set(skills.map((x) => String(x.id ?? '')));
  const effectIds = new Set(effects.map((x) => String(x.id ?? '')));
  const equipIds = new Set(equipment.map((x) => String(x.id ?? '')));
  const behaviorIds = new Set(behaviors.map((x) => String(x.id ?? '')));

  const checkDup = (rows: Record<string, unknown>[], catalog: string) => {
    const seenId = new Set<string>();
    for (const row of rows) {
      const id = String(row.id ?? '');
      if (!id) {
        issues.push({ level: 'error', catalog, message: 'id が空の行があります' });
        continue;
      }
      if (seenId.has(id)) {
        issues.push({ level: 'error', catalog, id, message: 'id が重複しています' });
      }
      seenId.add(id);
    }
  };

  checkDup(characters, 'characters');
  checkDup(skills, 'skills');
  checkDup(effects, 'effects');
  checkDup(equipment, 'equipment');
  checkDup(enemies, 'enemies');
  checkDup(bosses, 'bosses');
  checkDup(behaviors, 'behaviors');
  checkDup(audioCues, 'audio');

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
    if (c.portrait && !assetExists(pathSet, c.portrait)) {
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
    if (s.icon && !assetExists(pathSet, s.icon)) {
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
    if (e.icon && !assetExists(pathSet, e.icon)) {
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
    if (e.icon && !assetExists(pathSet, e.icon)) {
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

  for (const cue of audioCues) {
    const id = String(cue.id ?? '');
    const file = typeof cue.file === 'string' ? cue.file.trim() : '';
    if (file && !assetExists(pathSet, file)) {
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

  if (hudRaw == null) {
    issues.push({
      level: 'warning',
      catalog: 'hud',
      message: 'hud.json が未設定です',
    });
  } else {
    const ver = String(hudRaw.appVersion ?? '').trim();
    if (!ver) {
      issues.push({
        level: 'error',
        catalog: 'hud',
        message: 'appVersion が空です',
      });
    }
    const assets = Array.isArray(hudRaw.assetSlots) ? hudRaw.assetSlots : [];
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
      const label = String(slot.labelJa ?? '').trim();
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
          message: `key が重複しています: ${key}`,
        });
      } else {
        seenKeys.add(key);
      }
      if (!label) {
        issues.push({
          level: 'warning',
          catalog: 'hud',
          id: key || `asset[${i}]`,
          message: 'labelJa が未設定です',
        });
      }
      if (icon && !assetExists(pathSet, icon)) {
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
