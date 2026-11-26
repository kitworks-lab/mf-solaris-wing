// SOLARIS WING hands in a deterministic dossier: game/ and screenshots/ are copied fresh into the output
// directory on every run, so the same inputs always produce the same dossier.json bytes.
// The game is entered through game/index.html, which must exist before buildDossier reads the output tree.
import { existsSync } from 'node:fs';
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

if (!existsSync(join(out, 'game', 'index.html'))) {
  throw new Error('SOLARIS WING: missing game/index.html under ' + join(out, 'game') + '; the game entry point is required before building dossier.json');
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
if (!existsSync(join(out, 'dossier.json'))) {
  throw new Error('SOLARIS WING: dossier.json was not written to ' + join(out, 'dossier.json'));
}
if ((await import('node:fs')).statSync(join(out, 'dossier.json')).size === 0) {
  throw new Error('SOLARIS WING: dossier.json is zero bytes at ' + join(out, 'dossier.json'));
}
