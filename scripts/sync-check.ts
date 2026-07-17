import dotenv from 'dotenv';
import { gameRoot, isProjectRoot } from '../server/paths.js';
import { validateGameContent } from '../server/validate.js';

dotenv.config();

const root = gameRoot();
if (!root || !isProjectRoot(root)) {
  console.error('GAME_ROOT invalid:', process.env.GAME_ROOT);
  process.exit(1);
}
const issues = validateGameContent(root);
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');
console.log(`OK root=${root}`);
console.log(`errors=${errors.length} warnings=${warnings.length}`);
for (const i of issues.slice(0, 50)) {
  console.log(`[${i.level}] ${i.catalog ?? ''}${i.id ? '/' + i.id : ''}: ${i.message}`);
}
process.exit(errors.length ? 1 : 0);
