/**
 * Firestore の hud カタログを、DEFAULT 枠とマージして更新する。
 * 既存の icon / note 等はキー単位で保持。不足キーだけ追加。
 *
 *   GAME_ROOT=../cobi-robodun node scripts/merge-hud-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  applicationDefault,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const root =
  process.env.GAME_ROOT || path.resolve(__dirname, '../../cobi-robodun');
const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'cobi-robodun-admin';

const DEFAULT_ASSET_SLOTS = [
  {
    key: 'ui.button',
    labelJa: 'ボタン',
    icon: '',
    noteJa:
      'コンティニュー／ニューゲーム／リーダーズボード／オプション／戻る／中断／閉じる',
  },
  { key: 'ui.panel', labelJa: 'パネル', icon: '', noteJa: 'ステータスチップ・枠パネル' },
  {
    key: 'ui.panelTop',
    labelJa: 'パネル上部あしらい',
    icon: '',
    noteJa: 'HUD／モーダルパネルの上端装飾',
  },
  {
    key: 'ui.panelBottom',
    labelJa: 'パネル下部あしらい',
    icon: '',
    noteJa: 'HUD／モーダルパネルの下端装飾',
  },
  {
    key: 'ui.selectBackground',
    labelJa: '選択背景',
    icon: '',
    noteJa: 'キャラ／ステータス／スキル／装備の選択肢行背景',
  },
  {
    key: 'ui.slotEmpty',
    labelJa: '空スロット',
    icon: '',
    noteJa: '武器・防具・コア・未取得スキル枠の共通デフォルト',
  },
  { key: 'ui.icon.hp', labelJa: 'HPアイコン', icon: '', noteJa: 'ステータス選択・表示用' },
  {
    key: 'ui.icon.atk',
    labelJa: 'STRアイコン',
    icon: '',
    noteJa: 'ATK／STR。ステータス選択・表示用',
  },
  { key: 'ui.icon.dex', labelJa: 'DEXアイコン', icon: '', noteJa: 'ステータス選択・表示用' },
  {
    key: 'ui.homeBackground',
    labelJa: 'ホーム背景',
    icon: '',
    noteJa: 'タイトル／ホーム画面の背景。未設定時は単色',
  },
  {
    key: 'ui.background',
    labelJa: 'プレイ背景',
    icon: '',
    noteJa: '未設定時は既存 backgrounds',
  },
  {
    key: 'tile.sword',
    labelJa: '弾薬タイル',
    icon: '',
    useEquippedWeapon: true,
    noteJa: '装備中武器アイコン優先',
  },
  { key: 'tile.shield', labelJa: '電力タイル', icon: '', noteJa: 'フォースシールド回復' },
  { key: 'tile.potion', labelJa: '食料タイル', icon: '', noteJa: '体力回復' },
  { key: 'tile.coin', labelJa: '廃品タイル', icon: '', noteJa: '貯まると開発へ' },
];

const DEFAULT_EQUIPMENT = [
  { slot: 'Weapon', labelJa: '武器', icon: '' },
  { slot: 'Armor', labelJa: '防具', icon: '' },
  { slot: 'Core', labelJa: 'コア', icon: '' },
];

function mergeAssetSlots(existing) {
  const byKey = new Map();
  for (const s of existing || []) {
    const key = String(s?.key ?? '').trim();
    if (key) byKey.set(key, { ...s });
  }

  const merged = [];
  for (const def of DEFAULT_ASSET_SLOTS) {
    const cur = byKey.get(def.key);
    if (cur) {
      merged.push({
        ...def,
        ...cur,
        key: def.key,
        labelJa: cur.labelJa || def.labelJa,
        noteJa: cur.noteJa || def.noteJa,
        // icon はクラウド既存を優先（空文字も既存として残す）
        icon: cur.icon ?? def.icon ?? '',
      });
      byKey.delete(def.key);
    } else {
      merged.push({ ...def });
    }
  }
  for (const leftover of byKey.values()) merged.push(leftover);
  return merged;
}

function mergeEquipmentSlots(existing, assetSlots) {
  const bySlot = new Map();
  for (const s of existing || []) {
    const slot = String(s?.slot ?? '').trim();
    if (slot) bySlot.set(slot, { ...s });
  }

  // 3スロットが同一アイコンなら ui.slotEmpty へ集約（未設定時のみ）
  const icons = [...bySlot.values()].map((s) => String(s.icon ?? '').trim()).filter(Boolean);
  const allSame = icons.length >= 2 && icons.every((i) => i === icons[0]);
  if (allSame) {
    const empty = assetSlots.find((a) => a.key === 'ui.slotEmpty');
    if (empty && !String(empty.icon ?? '').trim()) {
      empty.icon = icons[0];
      console.log('  moved shared equip icon → ui.slotEmpty:', icons[0]);
    }
  }

  const merged = [];
  for (const def of DEFAULT_EQUIPMENT) {
    const cur = bySlot.get(def.slot);
    if (cur) {
      const icon = allSame ? '' : String(cur.icon ?? '');
      merged.push({
        slot: def.slot,
        labelJa: cur.labelJa || def.labelJa,
        icon,
      });
      bySlot.delete(def.slot);
    } else {
      merged.push({ ...def });
    }
  }
  for (const leftover of bySlot.values()) merged.push(leftover);
  return merged;
}

async function main() {
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId });
  }
  const db = getFirestore();
  const ref = db.collection('catalogs').doc('hud');
  const snap = await ref.get();

  const localPath = path.join(root, 'data/hud.json');
  const local = fs.existsSync(localPath)
    ? JSON.parse(fs.readFileSync(localPath, 'utf8').replace(/^\uFEFF/, ''))
    : null;

  const cloud = snap.exists ? snap.data()?.data ?? {} : {};
  console.log('merge hud', {
    projectId,
    cloudExists: snap.exists,
    cloudAssets: Array.isArray(cloud.assetSlots) ? cloud.assetSlots.length : 0,
    localAssets: Array.isArray(local?.assetSlots) ? local.assetSlots.length : 0,
  });

  // クラウド優先でマージ（無ければローカル）
  const baseAssets = Array.isArray(cloud.assetSlots)
    ? cloud.assetSlots
    : Array.isArray(local?.assetSlots)
      ? local.assetSlots
      : [];
  const baseEquip = Array.isArray(cloud.equipmentSlots)
    ? cloud.equipmentSlots
    : Array.isArray(local?.equipmentSlots)
      ? local.equipmentSlots
      : [];

  const assetSlots = mergeAssetSlots(baseAssets);
  const equipmentSlots = mergeEquipmentSlots(baseEquip, assetSlots);

  // ローカルにだけある icon（タイル等）でクラウドが空なら補完
  if (local?.assetSlots) {
    const localByKey = new Map(
      local.assetSlots.map((s) => [String(s.key ?? ''), s]),
    );
    for (const slot of assetSlots) {
      if (String(slot.icon ?? '').trim()) continue;
      const loc = localByKey.get(slot.key);
      if (loc && String(loc.icon ?? '').trim()) {
        slot.icon = loc.icon;
        console.log('  filled empty from local:', slot.key, '→', loc.icon);
      }
    }
  }

  const data = {
    appVersion: String(cloud.appVersion || local?.appVersion || '1.0.0'),
    assetSlots,
    equipmentSlots,
  };

  await ref.set(
    {
      data,
      updatedAt: new Date(),
      updatedBy: 'merge-hud-catalog',
    },
    { merge: true },
  );

  console.log('wrote hud assetSlots:', data.assetSlots.map((s) => s.key).join(', '));
  console.log('equipment:', data.equipmentSlots.map((s) => `${s.slot}:${s.icon || '(empty)'}`).join(' | '));
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
