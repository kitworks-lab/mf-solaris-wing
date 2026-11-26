import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

for (const dir of ['game', 'screenshots']) {
  rmSync(join(out, dir), { recursive: true, force: true });
  mkdirSync(join(out, dir), { recursive: true });
  cpSync(join(here, dir), join(out, dir), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
