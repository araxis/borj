# Resume Guide — continue this project safely

## Read first, in this order
1. `memory/project-overview.md` — vision, naming status, constraints.
2. `memory/content-ledger.md` — the **binding** atlas/ledger rules.
3. `memory/architecture.md` — file map and data flow.
4. `memory/gameplay-systems.md` — mechanics + balancing knobs.
5. `memory/testing.md` — how to verify anything you change (headless sim!).
6. Root ledgers `heroes-atlas.md`, `enemies-atlas.md`, `places-atlas.md` when touching content.

## Run it
```bash
npm install
npm run dev        # http://localhost:5180  (port set in vite.config.js)
npm run build      # → dist/ (GitHub Pages-ready, relative paths)
```
`.claude/launch.json` exists for the preview tool (`shahnameh-td-dev`). Note: headless/
software-GL preview browsers render this too slowly for screenshots — verify in a real
GPU browser; **and remember a hidden tab pauses the rAF game loop**, so drive gameplay
tests through `window.__dbg.game.update(...)` loops (see testing.md).

## What NOT to break
- **Ledger fidelity**: `src/data/{heroes,enemies,places}.js` must keep cell positions,
  names, sourceRefs, and descriptions matching the root Markdown ledgers exactly.
  `ledgerNote` honesty fields must remain displayed.
- **Cultural rules** in `memory/art-direction.md` (Rostam/Zal/Simurgh/Rakhsh/women warriors/
  human enemies stay human/no guns/Modern Mastery meaning).
- **Relative paths** (`base: './'`) and zero runtime network calls (offline requirement).
- **Naming**: final game name not chosen. Title lives ONLY in `lang/*.js app.title`,
  `index.html <title>`, `package.json`. Don't scatter it.
- `window.__dbg` QA handle in main.js — automated tests rely on it.
- localStorage keys: `std.settings.v1`, `std.profile.v1`, `std.lang` — bump the suffix if
  you change shapes; `save.js` merges defaults defensively.

## Where to do common things
- New tower → `src/data/towers.js` (+ model recipe in `src/models/towerkit.js` RECIPES,
  + vfx kind mapping in `entities/tower.js kindMap` if new projectile look).
- New enemy ability → `entities/enemy.js _tickAbilities` (timer pattern) or takeDamage/melee.
- New hero special → stats path in `entities/tower.js getStats`, or runtime hooks in
  tower.update/_fire/game._recomputeAuras (search existing `special.key` strings).
- Balance → `HP_SCALE`/`BOSS_HP_SCALE` (enemy.js), wave budget/growth (waves.js),
  AGES multipliers (towers.js).
- New campaign map → `src/data/campaign.js` (paths are [x,z] control points within ±60;
  LAST point is the citadel; all lanes must share that final point) + intro keys in both
  `lang/en.js` and `lang/fa.js`; pick the place's biome in places.js.
- UI text → both `lang/en.js` AND `lang/fa.js` (keys must mirror). Per-id translations
  (special./ability./sability./ledgernote./storyref./tag./mod.) live ONLY in fa.js and are
  resolved via `tOpt(key, englishFallbackFromData)` — when adding a hero/enemy/soldier/
  tower/fusion, add its fa.js keys too. FA style: fluent modern Persian, no archaic words.
- Deployment → see `memory/architecture.md` § Build & GitHub Pages.

## Current state (reconciled 2026-06-17)
Playable end-to-end: menu → campaign (20 maps) → battle (build/upgrade/fuse/heroes/soldiers/
rally/destruction/bosses) → victory/defeat → unlocks persisted → endless mode; EN/FA RTL UI;
codex; settings. Since the 2026-06-12 baseline, SHIPPED + merged to main: 20 giant palaces (PR #4),
living-world systems — 3D horizon ranges, procedural fire shader, mid-wave save/resume, hero
medallions, backdrops (PR #5), a deep quality pass — eased animation + elbow joint, combat
hit-stop/shake/muzzle-flash/recoil, SMAA + GTAO + cinematic grade, UI entrance animations, slow-mo
epic moments (PRs #6/#7), and GLB cavalry mounts (PR #8). Audio is procedural synth SFX + 3 bundled
CC-BY music mp3s (still offline). Latest commit `fc8e600`.
**Open work** (mostly assets) is tracked in the AUTO-memory notes `wow-improvement-plan` + `wow-asset-gaps`
(per-biome PBR/LUTs, 3 audio swells, desert/steppe horizon tiles, remaining heroes, war-horse GLB).
Verify-live path this session: Claude-in-Chrome against `localhost:5180` (a hidden tab pauses rAF);
`npm run build` for compile validation; `window.__dbg` for headless sim. NOTE the screenshot↔window
scale mismatch (window 2752 vs screenshot 1568 px) when scripting canvas clicks.

## Current state (updated 2026-06-20)
The current working tree adds the next-layer systems on top of the PR #8 baseline:
- All 20 campaign maps now have palace command/boon data, command visuals, and localized panel copy.
- Assigned heroes now have contextual active commands in tower panels; heroes remain commanders, not walking units.
- Boss Saga is present: data records, profile-only saga records, campaign/intro/chip/banner/codex UI, and
  debug forcing for active/broken/hardened states.
- DistantBackdrop is live: manifest in `src/data/backdrops.js`, runtime in `src/world/backdrop.js`, 20 map
  WebP layer folders in `public/assets/backdrops/`, procedural haze, safe no-shadow curved panorama bands,
  and cleanup/disposal.
- Visual QA helpers are under `window.__dbg.visualQa`: `state(name, opts)`, `metrics()`, `overflow()`,
  `auditArtifacts()`, and `backdrops()`.

Use these QA states when resuming:
```js
window.__dbg.visualQa.state('backdropSweep', { mapId: 'zabulistan' })
window.__dbg.visualQa.state('sagaTrial', { mapId: 'mazandaran', defId: 'div-e-sepid' })
window.__dbg.visualQa.state('bossHardened', { mapId: 'turan', defId: 'tur-salm' })
window.__dbg.visualQa.state('bossBroken', { mapId: 'gang-dez', defId: 'afrasiab' })
window.__dbg.visualQa.state('palaceCommand', { mapId: 'arash-watch' })
window.__dbg.visualQa.state('heroCommand', { mapId: 'arash-watch' })
```

Important current guardrails:
- Do not reintroduce flat shadow-receiving helper planes; black rectangle artifacts came from flat/alpha/depth/shadow
  combinations and GTAO/depth prepass interactions.
- Backdrop meshes must remain non-gameplay scenery: no castShadow/receiveShadow, depthWrite false, low contrast,
  tagged `visualLayer: "backdrop"`, and never intersecting road/pads/gates/palaces.
- `artifacts/visual-qa/` is local generated evidence, not source content.
