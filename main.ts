// Solmar Bay 3D — entry program (Node 22, standard library only).
//
// Hands the game in: copies this repository's game/ and screenshots/ into the
// output directory and writes dossier.json with the kit's vendored library.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The game itself is plain static files under game/ (index.html plus its ES
// modules and a vendored three.min.js), so the browser loads it with no
// network request at all.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Directory this program lives in (the repository root).
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// The grader writes to /output; a local run uses MAKEFUN_OUTPUT_DIR.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Caps from the competition's own gate (reference/gate.json): the text cap
// shapes the dossier's bytes, the rest refuse an entry the scorer would
// refuse outright (too many screenshots, a screenshot over 256 KiB, game/
// over 993 files or 48 MiB, a game/ path over 1000 bytes).
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outputDir, { recursive: true });
if (!existsSync(join(repoRoot, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — the entry is not playable');
}
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), {
    recursive: true,
  });
}

writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, dossierCaps),
);
