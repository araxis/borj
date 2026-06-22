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
- Asset/model polish → use the local 3D editing workflow when a task needs mesh inspection,
  GLB cleanup/export, pivot/orientation fixes, material passes, or animation repair. Keep
  +Z forward/Y-up conventions, optimize for web delivery, and preserve procedural fallbacks.

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
- If the in-app browser connector fails before page actions, use the browser automation CLI fallback: open the local
  app, then run page-context code to force `window.__dbg.visualQa.state(...)`, inspect browser messages, and capture
  screenshots for evidence.
- Lancer mount correction is live: the rejected primitive-composite `WarHorse.glb` is not registered. Black lancers use
  the source-mesh `a_zabul_warhorse` path; scout riders remain on the stock `a_horse` path.
- Palace commands now have a direct projected DOM medallion arc anchored by `.palace-action-rail` near the palace. It
  exposes Farr/oath, muster, palace boon, rally, and gate command as tower-style circular click actions using the same
  command methods as the palace card. It only appears while the palace is selected; ready commands show green rings
  without `Ready` text, while cooldown/cost/blocked states still show short labels. The visible command centers are SVG
  images in `public/assets/ui/palace-actions/`. It is intentionally separate from the full palace card so the card can be
  redesigned later without changing command behavior.
- Palace/gate command effects no longer spawn tiny upright pole flags or line-based ring strokes at the gate line.
  `_showGateMarker()` now uses low pulsing `gateSeals` plus flat mesh hold rings; preserve `standards: 0`,
  `shieldGlints: 0`, `hasLine: false`, and `ringIsLine: false` for gate-front markers unless intentionally
  reintroducing larger, readable standards.
- The related `_showPalaceShieldLine()` effect is also ground-only now. It uses flat pulsing `shieldSeals` instead of the
  old miniature shield-and-pole row that looked like stray clutter beside the palace.
- The palace gate stage is also ground-only now: no permanent stage banners, braziers, threshold line segments, or
  miniature shield/spear props. Zabulistan palace muster cavalry hides while idle at the palace stand and reappears when
  enemies engage; do not solve future palace clutter by reintroducing idle pole/shield miniatures near the palace edge.
- Zabulistan is the first layered panorama/circular-board pilot: it uses
  `public/assets/backdrops/zabulistan/panorama_360.webp` (`mountains360`) plus
  `public/assets/backdrops/zabulistan/foothills_360.webp` (`foothills360`) plus
  `public/assets/backdrops/zabulistan/ridges_360.webp` (`ridges360`) plus
  `public/assets/backdrops/zabulistan/scrub_360.webp` (`scrub360`) plus
  `public/assets/backdrops/zabulistan/apron_360.webp` (`apron360`) with manifest mode `panorama360`, rendered as ordered
  inward-facing cylinders. `apron360` sits close to the visual board edge to cover the blue fog surface around the
  circle and is color-matched toward the board grass (`#b4ce71`) with reduced `lowFog`/wash so it does not cool back
  toward the distant haze. The closest raster layers (`scrub360`, `apron360`) now use camera-pitch `topViewFade`: they
  remain visible in low tactical views but fade in high overhead views so they do not read as panorama walls. The blue
  ground veil is delayed outward for this map, and a green/low-opacity procedural `board-edge-blend` ring hides the hard circular terrain/apron boundary. Its terrain/apron read as a circle around radius 86, but gameplay pathing, pads,
  gates, palace, enemies, tower placement rules, and internal coordinates remain square-compatible. Zabulistan also skips
  the procedural 3D mountain/ridge ring; other maps still use the legacy quadrant backdrop layers and procedural ring
  until their own panorama assets are generated. The transparent landmark/citadel overlay experiment is retired from the
  active manifest until the base landscape-only panorama is approved.
- Sistan is now the second `panorama360` map and the first non-circular square-board conversion. It uses
  `public/assets/backdrops/sistan/panorama_360.webp` (`marshSky360`),
  `public/assets/backdrops/sistan/reedline_360.webp` (`reedline360`),
  `public/assets/backdrops/sistan/water_360.webp` (`waterChannels360`), and
  `public/assets/backdrops/sistan/apron_360.webp` (`apron360`). The close water/apron bands use camera-pitch
  `topViewFade`; low-angle views should show soft reedland/water depth, while high-angle tactical views should not show
  a panorama wall. Sistan keeps the normal square tactical board and does not use the Zabulistan circular visual-board
  mask. The deterministic builder is `scripts/build_sistan_panorama360.py`.

Use these QA states when resuming:
```js
window.__dbg.visualQa.state('backdropSweep', { mapId: 'zabulistan' })
window.__dbg.visualQa.state('backdropSweep', { mapId: 'sistan' })
window.__dbg.visualQa.state('zabulistanForecourt', { mapId: 'zabulistan' })
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
- Backdrop regression guardrail: loaded textures can still look absent if the panorama layer is too low, bottom fade is
  too aggressive, or haze wash is too high. Verify a low-angle horizon screenshot, not only layer counts.
- Horizon-fuse guardrail: the `horizonBlend` procedural ring is part of curated backdrops. Keep it depth-tested and
  no-shadow, and tune opacity/height with low-angle screenshots so it hides the terrain/apron seam without washing out
  roads, pads, palace gates, or enemies. The world apron also adds a subtle `ground-horizon-veil` outside the playable
  board; keep it low-opacity and depth-tested so it softens distant land only. The current sequence has already moved
  the merge helpers/range ring inward and then pulled the panorama closer (default far/mid/haze radii 364/284/310;
  Zabulistan 356/274/302). Before any further radius reduction, capture a low-angle horizon screenshot and check for
  ridge tile/panorama depth fighting.
- Board-shape guardrail: keep the actual tactical board square unless intentionally redesigning campaign maps. The
  current Zabulistan pilot is only a circular visual terrain/apron/mask around square gameplay. If expanding it to more
  maps, preserve pathing/foundations/palace/gate/camera assumptions unless the campaign map data is redesigned too.
- Panorama guardrail: for each new converted map, add a proper seamless far `panorama_360.webp`; optionally add closer
  named bands like `foothills_360.webp` and `ridges_360.webp` when additional distance layers improve depth. Transparent
  landmark overlays like `landmark_360.png` can add far cities/fortresses, but keep them culturally specific, low opacity,
  low on the horizon strip, and padded or repeated enough that normal camera angles do not land on a fully transparent
  part of the strip. Do not solve visibility by making the overlay occupy most of the panorama height; that creates a
  wall-like sky wash. Enable
  `panorama360` in the manifest config as ordered named layers, then verify the legacy quadrant fallback still works on
  unconverted maps. If a converted map has enough raster depth, consider skipping its procedural mountain ring. Watch for
  visible wrap seams, overly strong image contrast, depth fighting with any remaining procedural ridge ring, and panoramas
  covering gameplay silhouettes.
- `artifacts/visual-qa/` is local generated evidence, not source content.
- The local 3D editing connection is available for future asset and animation passes. Prefer it for inspecting or
  improving GLBs before writing runtime workarounds, but keep all shipped files local/offline and optimized.
- Current cavalry smoke check: `window.__dbg.soldierTest('lancer', 'walk')` should use one self-contained GLB child with
  `ZabulWarHorseRig` / `ZabulWarHorseMesh`, clips `Idle` / `Walk` / `Gallop` / `Attack`, and no rejected `WarHorseRoot`.
  Expected current smoke includes `children: 1`, one skinned `ZabulWarHorseMesh`, `currentGroup: ["Walk"]`, and an
  `Attack` duration near 1.417s. Scout riders remain on the stock `a_horse` path.
- Current mounted attack baseline: the lance is couched forward in the `Attack` hit pose, not vertical and not backward.
  If it regresses, inspect `output/asset-qa/zabul-attack-frames-v7/attack_17_side.png`; local frame 17 should keep the
  weighted lance forward of the rider/horse center with 0 stretched edges.
- Current Zabulistan cavalry staging baseline: `zv_cavalry_staging_set` is the authored palace-forecourt staging prop,
  exported by `scripts/asset-tools/build-zabulistan-stage-assets.py` to
  `public/assets/scenery/zabulistan/cavalry-staging-set.glb` and placed only by the Zabulistan visual kit. It should show
  trampled ground, hitch rails, tack, shields, ropes, feed props, upright lances, and small pennants. The prior tether rail
  stays as fallback only. Current evidence:
  `artifacts/visual-qa/zabulistan-cavalry-staging-final-wide.png`,
  `artifacts/visual-qa/zabulistan-cavalry-staging-final-close.png`, and
  `artifacts/visual-qa/zabulistan-cavalry-staging-final-mobile-rtl.png`.
- Current Zabulistan forecourt dressing baseline: `zv_palace_base_transition` and `zv_forecourt_approach_edges` are the
  authored palace-base and gate-approach props, exported by `scripts/asset-tools/build-zabulistan-stage-assets.py` to
  `public/assets/scenery/zabulistan/palace-base-transition.glb` and
  `public/assets/scenery/zabulistan/forecourt-approach-edges.glb`. They are placed only by the Zabulistan visual kit and
  should replace the old stacked-base read with embedded ground, threshold stones, curbs, scree, and worn approach edges.
  Stable QA scene names are `zabulistan-palace-base-transition-main`, `zabulistan-palace-base-transition-left`,
  `zabulistan-palace-base-transition-right`, and `zabulistan-forecourt-approach-edges`. Current evidence:
  `artifacts/visual-qa/zabulistan-forecourt-dressing-final-wide.png`,
  `artifacts/visual-qa/zabulistan-forecourt-dressing-final-close.png`, and
  `artifacts/visual-qa/zabulistan-forecourt-dressing-final-mobile-rtl.png`.
- Current lower approach baseline: the Zabulistan visual kit places a second `zv_forecourt_approach_edges` instance as
  `zabulistan-forecourt-lower-approach-edges`, with `zabulistan-forecourt-lower-scree-left/right` shoulders. The
  `embedded-pad-set.glb` export now uses irregular polygon flagstones and broken wedges rather than cube tile tops. Use
  `window.__dbg.visualQa.state('zabulistanForecourt', { mapId: 'zabulistan' })` for the repeatable lower road/pad view.
  Current evidence:
  `artifacts/visual-qa/zabulistan-forecourt-approach-final-desktop.png` and
  `artifacts/visual-qa/zabulistan-forecourt-approach-final-mobile-rtl.png`.
- Current Zabulistan road material baseline: `src/world/road.js` keeps gameplay pathing unchanged but renders the
  Zabulistan road with muted packed-earth canvas texture, deterministic gravel, broken ruts, short cross-wear strokes,
  and small deterministic render-edge wobble. The accepted road material screenshot set is:
  `artifacts/visual-qa/zabulistan-road-material-final-desktop.png` and
  `artifacts/visual-qa/zabulistan-road-material-final-mobile-rtl.png`.
- Current Zabulistan road-edge blend baseline: `src/world/road.js` adds one visible
  `zabulistan-road-shoulder-blend` mesh for the Zabulistan style only. It is an opaque, vertex-colored terrain feather
  following the render ribbon and must stay subtle; do not widen or brighten it into a pale road border. The old broad
  random ground stains in `src/world/zabulistanVisualKit.js` are reduced to small low-opacity scuffs, so future passes
  should not bring back large translucent oval blobs. Current evidence:
  `artifacts/visual-qa/zabulistan-road-blend-final-desktop.png` and
  `artifacts/visual-qa/zabulistan-road-blend-final-mobile-rtl.png`.
- Current Zabulistan palace tone baseline: `src/core/assets.js` applies a Zabulistan-only material profile to cloned
  palace scenes. The custom palace material should be non-emissive (`emissive: 000000`, `emissiveIntensity: 0`), high
  roughness, low metalness, and muted sandstone color near `9a8664`. Do not remove that profile unless the source GLB is
  re-authored with sane material values. Current evidence:
  `artifacts/visual-qa/zabulistan-palace-tone-desktop.png`,
  `artifacts/visual-qa/zabulistan-palace-tone-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-palace-tone-selected.png`.
- Current Zabulistan gate contact baseline: `src/world/zabulistanVisualKit.js` adds
  `zabulistan-gate-contact-grit` inside the Zabulistan-only forecourt pass. It should stay opaque, local to the palace
  threshold, and small enough to ground the gate without returning to broad transparent blobs. Current evidence:
  `artifacts/visual-qa/zabulistan-gate-contact-desktop.png`,
  `artifacts/visual-qa/zabulistan-gate-contact-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-gate-contact-selected.png`.
- Current Zabulistan gate combat baseline: `window.__dbg.visualQa.state('zabulistanGateCombat', { mode: 'royal' })`
  frames the palace forecourt, opens the compact command rail, and spawns a royal gate assault. The accepted state keeps
  gameplay radius unchanged but uses compact visual radius/intensity and `groundWaveIntensity: 0` so broad filled
  shockwave discs do not cover the road, gate, or lower playfield. In cold browser QA, warm `loadZabulistanProps()` and
  `loadPalace('zabulistan')` before creating the state. Current evidence:
  `artifacts/visual-qa/zabulistan-gate-combat-final-desktop.png`,
  `artifacts/visual-qa/zabulistan-gate-combat-final-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-gate-combat-final-reduced-motion.png`.
- Current Zabulistan gate approach depth baseline: `zv_gate_cliff_siege_set` is exported by
  `scripts/asset-tools/build-zabulistan-stage-assets.py` to
  `public/assets/scenery/zabulistan/gate-cliff-siege-set.glb`, registered as a neutral Zabulistan prop, and placed only by
  `src/world/zabulistanVisualKit.js`. Expected QA scene objects are four
  `zabulistan-gate-cliff-siege-*` authored placements plus four `zabulistan-gate-depth-beacon-*` animated beacon towers,
  with `zabulistan-gate-approach-depth-fallback` absent when the GLB loads. Current evidence:
  `artifacts/visual-qa/zabulistan-gate-depth-final-desktop.png`,
  `artifacts/visual-qa/zabulistan-gate-depth-final-combat.png`, and
  `artifacts/visual-qa/zabulistan-gate-depth-final-mobile-rtl.png`.
- Current Zabulistan cavalry close-combat baseline:
  `window.__dbg.visualQa.state('zabulistanCavalryCloseCombat', { mode: 'royal' })` starts a royal sandbox assault, keeps
  the palace drawer closed, and frames mounted defenders at the gate. Expected QA is Zabulistan props ready, horse ready,
  3 mounted GLB defenders, one `zabulistan-cavalry-close-combat-fx` group, artifacts 0, overflow 0, no page errors, and
  no sandbox helper chrome/toast covering the playfield. The low-chrome active-wave button now collapses to a compact
  status chip during combat. Current evidence:
  `artifacts/visual-qa/zabulistan-cavalry-close-combat-final-desktop.png`,
  `artifacts/visual-qa/zabulistan-cavalry-close-combat-final-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-cavalry-close-combat-final-reduced-motion.png`.
- Current Zabulistan mobile HUD baseline: mobile low-chrome hides secondary Codex/settings/language controls from the
  topbar, uses `wave-active` to compact combat HUD, collapses the combat quick-build rail to one edge catalog button,
  and keeps the build-phase wave call button compact instead of full-width. Current accepted metrics are about 64px
  mobile combat topbar height, one visible quick-build child during combat, no overflow, and artifacts 0. Current
  evidence:
  `artifacts/visual-qa/zabulistan-mobile-hud-combat-rtl.png`,
  `artifacts/visual-qa/zabulistan-mobile-hud-forecourt-rtl.png`,
  `artifacts/visual-qa/zabulistan-mobile-hud-combat-reduced-motion.png`, and
  `artifacts/visual-qa/zabulistan-desktop-hud-combat.png`.
- The source-mesh rig script is `scripts/asset-tools/rig-zabul-warhorse.py`; by default it reads the user-supplied
  combined cavalry source `C:\Users\meisa\Downloads\horse3.glb`, removes the helper sphere, decimates to the runtime
  face budget, adds horse/rider/lance bones, runs connected-island rigid cleanup to prevent cloth/armor fan deformation,
  keeps slender front hoof/lower-leg islands animated, and exports `public/assets/animals/ZabulWarHorse.glb`. If the
  source file moves, set `ZABUL_HORSE_SOURCE_GLB` before running the script.
- Actor quality gate: run `npm run audit:assets` before accepting new visible actor GLBs. Production actor assets should
  have real clips; zero-clip actor GLBs are source/reference only unless explicitly static scenery. `Azhdaha.glb` and
  `Worm.glb` are currently source-only, so dragon/worm enemies intentionally use the segmented animated fallback until
  those assets are repaired with real clips. Do not add static-GLB bob/weave animation branches for primary actors.
