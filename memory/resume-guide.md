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
- Current Zabulistan gate threshold baseline: `zv_gate_threshold_transition` is exported by
  `scripts/asset-tools/build-zabulistan-stage-assets.py` to
  `public/assets/scenery/zabulistan/gate-threshold-transition.glb`, registered as a neutral Zabulistan prop, and placed
  by `src/world/zabulistanVisualKit.js` in the normal forecourt path. Expected QA is
  `zabulistan-gate-threshold-transition` present, `zabulistan-forecourt-threshold` absent,
  `zabulistan-gate-contact-grit` absent, fallback false, artifacts 0, overflow false, and no broad authored
  causeway/threshold ground plates at the lower gate. The old forecourt threshold and contact grit are fallback-only.
  Current local evidence:
  `output/playwright/zabulistan-gate-threshold-transition-desktop-final-v2.png` and
  `output/playwright/zabulistan-gate-threshold-transition-mobile-rtl-final.png`.
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
- Current Zabulistan palace foreground terrace-wall baseline: `zv_palace_foreground_terrace_wall` is exported by
  `scripts/asset-tools/build-zabulistan-stage-assets.py` to
  `public/assets/scenery/zabulistan/palace-foreground-terrace-wall.glb`, registered as a neutral Zabulistan prop, and
  placed only by `src/world/zabulistanVisualKit.js` after `buildForecourt()` and before the palace cliff/gate-depth
  dressing. Expected QA is one `zabulistan-palace-foreground-terrace-wall-main` object, no
  `zabulistan-palace-foreground-terrace-wall-fallback`, four `zabulistan-gate-cliff-siege-*` objects, artifacts 0,
  overflow 0, and no broad pale ground-plate slabs around the lower gate. Current local evidence:
  `output/playwright/zabulistan-palace-foreground-terrace-desktop-final-v2.png` and
  `output/playwright/zabulistan-palace-foreground-terrace-mobile-rtl.png`.
- Current Zabulistan staging cleanup baseline: `zv_cavalry_staging_set` and `zv_gate_cliff_siege_set` should not contain
  the old broad plate meshes named `cavalry_staging_dust_wash`, `cavalry_staging_packed_earth`,
  `cavalry_staging_trodden_center`, `gate_depth_shadow_wash`, or `gate_depth_trampled_shelf`. The expected scene names
  in `zabulistanForecourt` are `zabulistan-cavalry-staging-left`, `zabulistan-cavalry-staging-right`,
  `zabulistan-camp-ground-props-left`, `zabulistan-camp-ground-props-right`,
  `zabulistan-palace-foreground-terrace-wall-main`, and four `zabulistan-gate-cliff-siege-*` objects. Current browser
  QA baseline is fallback false, artifacts 0, overflow false, and no old broad plate mesh names in desktop or mobile RTL.
- Current Zabulistan palace slope terrace baseline: `zv_palace_slope_terrace_set` is exported by
  `scripts/asset-tools/build-zabulistan-stage-assets.py` to
  `public/assets/scenery/zabulistan/palace-slope-terrace-set.glb`, registered as a neutral Zabulistan prop, and placed
  only by `src/world/zabulistanVisualKit.js` as four authored slope terrace clusters around the palace foreground.
  Expected QA is four `zabulistan-palace-slope-terrace-*` objects, no
  `zabulistan-palace-slope-terrace-fallback`, no `zabulistan-palace-foreground-terrace-wall-fallback`,
  `zabulistan-gate-threshold-transition` present, artifacts 0, and overflow 0. Current local evidence:
  `output/playwright/zabulistan-palace-slope-terrace-desktop.png` and
  `output/playwright/zabulistan-palace-slope-terrace-mobile-rtl.png`.
- Next Zabulistan visual target: the close lower forecourt approach edge still reads too dark in mobile framing. Solve it
  in the lower approach dressing (`zv_forecourt_approach_edges` placement/asset or equivalent), not by further changing
  the palace slope terrace rocks. The Zabulistan road ribbon is intentionally trimmed away from the palace forecourt.
- Current Zabulistan lower forecourt/base cleanup baseline: `forecourt-approach-edges.glb` no longer contains the old
  `forecourt_approach_packed_core`, `forecourt_approach_left_shelf`, or `forecourt_approach_right_shelf` plates. The
  Zabulistan forecourt now has a low warm palace base terrace/lip, a warm foreground apron, five shallow warm sill bands,
  lighter causeway/retaining/scree tints, and a cleaned source palette for the Zabulistan palace GLB. Expected QA is
  artifacts 0, overflow false/0, warm apron/sill/threshold-cover scene objects present, and no old approach plate names.
  Current evidence:
  `output/playwright/zabulistan-forecourt-final-close-desktop.png` and
  `output/playwright/zabulistan-forecourt-final-mobile-rtl.png`.
- Current Zabulistan palace source cleanup baseline: `scripts/asset-tools/clean-zabulistan-palace.py` regenerates
  `public/assets/palaces/ZabulistanKeepPolished.glb` from a baseline source, warms the base-color palette, disables
  active emission color, exports browser-ready textures, and is repeat-safe through the cleaned image marker. Runtime
  no longer rewrites the palace texture map on load; `src/core/assets.js` keeps only the light warm tint and emission
  suppression. Current evidence:
  `output/playwright/zabulistan-palace-source-cleanup-desktop-final.png` and
  `output/playwright/zabulistan-palace-source-cleanup-mobile-rtl-final.png`.
- Current Zabulistan palace command rail baseline: selected citadel uses a smaller depth-tested low-intensity footprint
  ring while towers keep the brighter readability ring. The low-chrome palace quick action rail is compact on mobile RTL,
  the context chip stays separated from the rail, and enabled quick actions preview the existing command footprint on
  hover/focus before clearing it on leave/blur. Expected QA is all five Zabulistan backdrop layers loaded, artifacts 0,
  overflow 0/false, compact palace rail/chip visible, and command preview create/clear working.
- Current Zabulistan palace contact terrain baseline: `zv_palace_contact_terrain_set` is exported by
  `scripts/asset-tools/build-zabulistan-stage-assets.py` to
  `public/assets/scenery/zabulistan/palace-contact-terrain-set.glb`, registered as a neutral Zabulistan prop, and placed
  in `src/world/zabulistanVisualKit.js` with a named fallback. The same pass adds
  `zabulistan-palace-contact-threshold-mask` and `zabulistan-palace-contact-threshold-stones`, breaks the old long sill
  bars into short staggered stones, and shortens the compact mobile palace chip name. Expected QA is contact terrain
  present, fallback absent, threshold mask/stones present, terrace wall and gate threshold present, artifacts 0, overflow
  0/false, all five Zabulistan backdrop layers loaded, and mobile RTL `visualQa.overflow()` empty. Current local
  evidence: `output/playwright/zabulistan-palace-contact-terrain-desktop-final.png` and
  `output/playwright/zabulistan-palace-contact-terrain-mobile-rtl-final.png`.
- Current Zabulistan cavalry close-combat baseline:
  `window.__dbg.visualQa.state('zabulistanCavalryCloseCombat', { mode: 'royal' })` starts a royal sandbox assault, keeps
  the palace drawer closed, and frames mounted defenders at the gate. Expected QA is Zabulistan props ready, horse ready,
  3 mounted GLB defenders, one `zabulistan-cavalry-close-combat-fx` group, artifacts 0, overflow 0, no page errors, and
  no sandbox helper chrome/toast covering the playfield. The accepted low-chrome gate combat pass adds defender ground
  shadows/crest cues, smaller hoof/enemy marks, a smaller lifted gate banner, dimmer hit-line feedback, debounced palace
  danger markers, and low-intensity palace command rays. Current accepted sample reduced command-field rays from 23 to 9
  and duplicate gate marker/shield-line counts to about 3/2 after a short combat window. Current local evidence:
  `output/playwright/zabulistan-cavalry-close-combat-desktop-lowray.png` and
  `output/playwright/zabulistan-cavalry-close-combat-mobile-rtl-reduced-lowray.png`.
- Current Zabulistan projectile/overlay readability baseline: route and assault-column helper lines now keep low
  `routeAlpha` values instead of being reset to the old bright route opacity; low-intensity palace command fields create
  one low-profile, depth-tested command thread and 9 subtle rays; defender hold, cavalry close-combat, and gate-pressure
  omen line families are lower opacity/normal-blended where possible. Expected QA is artifacts 0, overflow 0/false, no
  page errors, low-profile command thread count 1, subtle command rays 9, and no long white scratch fan across the
  lower-left fight. Current evidence:
  `output/playwright/zabulistan-cavalry-close-combat-desktop-overlay-tuned.png` and
  `output/playwright/zabulistan-cavalry-close-combat-mobile-rtl-reduced-overlay-tuned.png`.
- Current Zabulistan palace facade/body baseline: `zv_palace_facade_dressing` is exported by
  `scripts/asset-tools/build-zabulistan-stage-assets.py` to
  `public/assets/scenery/zabulistan/palace-facade-dressing.glb`, registered as a neutral Zabulistan prop, and placed by
  `src/world/zabulistanVisualKit.js` at the visible gate surface rather than near the palace center. Accepted source
  placement is 11.5 units along the approach from `map.exitPos`, `targetW: 13.45`, `yOffset: 0.12`, with the named
  `zabulistan-palace-facade-fallback` reserved for missing GLB cases. Expected close-combat QA is authored facade count
  1, fallback count 0, combat active, overflow 0/false, and no return to the old white cylinder plus oversized black
  gate rectangle. Current evidence:
  `output/playwright/zabulistan-palace-facade-final-desktop.png` and
  `output/playwright/zabulistan-palace-facade-final-mobile-rtl-reduced.png`.
- Current Zabulistan build-pad affordance baseline: `src/main.js` owns a build-mode layer named
  `build-pad-affordance` with one warm ground-painted `build-pad-affordance-pad` mesh per available pad. The layer hides
  outside build mode, skips occupied/rubble pads, refreshes after shift-build placement, and uses reduced-motion-safe
  static scale/opacity when `reducedMotion` is enabled. Direct QA routes are `?qa=build-pad-affordance` and
  `?qa=build-pad-affordance-rtl`; accepted QA is one affordance group, 16 visible pad markers, artifacts 0, overflow 0,
  all five Zabulistan backdrop layers loaded, and stable reduced-motion marker samples at scale `1`/opacity `0.5`.
  Current evidence:
  `output/playwright/zabulistan-build-pad-affordance-url-desktop-final.png` and
  `output/playwright/zabulistan-build-pad-affordance-url-mobile-rtl-final.png`.
- Current Zabulistan active road pressure baseline: `src/main.js` owns a Zabulistan-only combat layer named
  `zabulistan-road-pressure-cues`. It pools 12 road-pressure cue groups and shows the leading live road enemies during
  active combat, with urgency based on remaining path distance. Build-pad strips also receive a subtle warm pressure tint
  when active enemies are close. Direct QA routes are `?qa=active-road-pressure` and `?qa=active-road-pressure-rtl`;
  accepted QA is one pressure-cue pool, 12 pooled cues/rings/dashes, 6-7 visible pressure cues in the current sandbox
  gate sample, 16 build-pad markers, artifacts 0, overflow 0, all five Zabulistan backdrop layers loaded, and isolated
  route smoke with 0 console errors. Current evidence:
  `output/playwright/zabulistan-active-road-pressure-desktop.png` and
  `output/playwright/zabulistan-active-road-pressure-mobile-rtl.png`.
- Current Zabulistan real-wave contact baseline: `src/main.js` owns a Zabulistan-only contact layer named
  `zabulistan-contact-feedback-cues`. It pools 10 cue groups and passively watches live enemy HP changes during active
  Zabulistan combat, showing small ground rings, billboard health ticks, and short impact slashes for recent hits,
  low-health pressure, and kills. Direct QA routes are `?qa=real-wave-contact` and `?qa=real-wave-contact-rtl`; they
  build existing Zabulistan Watchtowers in sandbox, start the real wave roster, position spawned wave enemies near the
  contact camera, fast-forward normal combat, and write `qa-state-json`. Route timing is now hardened at 58 settle
  frames with a visual-only cue prime if the real contact beat falls between report samples. Build, asset audit, syntax
  check, and `git diff --check` pass. Browser screenshot/JSON verification is still pending because the Playwright
  browser runtime was missing, install timed out, and installed Chrome/Edge launch hung in the implementation session.
- Current Zabulistan compact combat-flow HUD baseline: `src/ui/hud.js` adds a low-chrome `combatFlow` chip that appears
  only during active Zabulistan combat. It shows live/queued enemy count, kills versus wave total, and a small progress
  bar, with pressure tone derived from enemy path progress/boss/elite weight. `src/ui/style.css` keeps it in the same
  visual family as the gate omen chip, with mobile wave-active size limits and reduced-motion-safe progress changes.
  Build, asset audit, syntax checks, and `git diff --check` pass.
- Current Zabulistan selected target-thread baseline: `src/entities/tower.js` records each tower's most recent fired-at
  target as presentation metadata, and `src/main.js` renders one pooled `zabulistan-selected-target-thread` only while a
  tower is selected during active Zabulistan combat. The layer draws a thin tower-to-enemy line and small ground reticle,
  fades quickly, resets on selection/palace/combat cleanup, and removes shimmer/pulse for reduced motion. Direct QA
  routes are `?qa=selected-target-thread` and `?qa=selected-target-thread-rtl`; desktop and 390x720 mobile RTL browser
  QA now pass with target thread visible, contact cues visible, artifacts 0, overflow false, no visible overlays, and no
  console warnings/errors. Current evidence:
  `output/playwright/zabulistan-selected-target-thread-zabul-watchtower-warm.png` and
  `output/playwright/zabulistan-selected-target-thread-mobile-rtl-warm.png`.
- Current Zabulistan direct-route QA freeze baseline: `src/main.js` suppresses delayed victory/defeat end screens for
  sandbox visual QA and pauses the engine immediately after non-end direct-route `qa-state-json` is written. Accepted
  combat QA routes should add `qa-state-recorded` and stay on the combat evidence frame, not drift into end overlays.
- Current Zabulistan watchtower baseline: `src/data/towers.js` points `zabul-watch` at the neutral procedural
  `zabulWatchtower` recipe in `src/models/towerkit.js`. It replaces the old white/black blocky Watchtower silhouette
  with warm brick/sandstone/cedar, roof staging, spear racks, and pahlavan standards. This is visual-only; no tower
  stats, costs, target choice, projectile behavior, wave timing, saves, or balance changed.
- Current Zabulistan opening-build baseline: `src/main.js` scores available pads only during first-wave Zabulistan build
  mode and uses the existing `build-pad-affordance` markers to make the top three `zabul-watch` opening pads warmer and
  brighter while secondary pads recede. Direct QA routes are `?qa=opening-build` and `?qa=opening-build-rtl`; accepted
  reports show 16 visible pads, 3 opening picks, no overflow, correct LTR/RTL direction, and no console warnings/errors.
  Current evidence:
  `output/playwright/zabulistan-opening-build-desktop.png` and
  `output/playwright/zabulistan-opening-build-mobile-rtl.png`.
- Current Zabulistan active-placement baseline: `src/main.js` scores available pads only during live Zabulistan combat
  build mode, using current enemies plus short path-ahead samples and selected tower range. Strong response pads reuse
  the existing `build-pad-affordance` markers with warmer/brighter styling; no labels, arrows, new HUD panels, build
  automation, or balance changes are involved. Direct QA routes are `?qa=active-placement` and
  `?qa=active-placement-rtl`; accepted reports show 16 visible pads, active placement mode true, 2 strong response picks
  for the current pressure setup, visible road pressure cues, no overflow, correct LTR/RTL direction, and no console
  warnings/errors. Current evidence:
  `output/playwright/zabulistan-active-placement-desktop.png` and
  `output/playwright/zabulistan-active-placement-mobile-rtl.png`.
- Current Zabulistan contact-confirm baseline: `src/main.js` adds a pooled `zabulistan-contact-confirm` terrain mark
  inside the existing `zabulistan-contact-feedback-cues` pool for confirmed kills and heavy hits. Direct QA routes are
  `?qa=contact-confirm` and `?qa=contact-confirm-rtl`; accepted reports show custom palace ready
  (`styleId: palace-zabulistan`), 10 pooled confirm meshes, `killConfirms >= 1`, `recentHeavyHits >= 1`, no overflow,
  artifacts 0, correct LTR/RTL direction, and no console warnings/errors. Current evidence:
  `output/playwright/zabulistan-contact-confirm-desktop.png` and
  `output/playwright/zabulistan-contact-confirm-mobile-rtl.png`.
- Current Zabulistan palace-load baseline: direct-route QA now prioritizes loading the Zabulistan palace before broad
  actor preloads, exposes neutral palace loader status through QA metadata, and `_swapToPalace()` only accepts true
  custom palaces. Accepted Zabulistan captures must not freeze on procedural `zabul-keep` unless explicitly testing
  fallback behavior.
- Current Zabulistan palace command-feedback baseline: `src/main.js` owns a pooled
  `zabulistan-palace-command-feedback-cues` layer for transient terrain-bound palace command pulses. It is wired to
  existing `palaceCommand` events plus a neutral `palaceCommandFx` visual event from gate-command pressure paths in
  `src/game/game.js`. Direct QA routes are `?qa=palace-command-feedback`, `?qa=palace-command-feedback-rtl`, and
  `?qa=palace-command-feedback-reduced`; accepted cue reports show `feedback.visible === 1`, `recentKind: "gate"`,
  no overflow, artifacts 0, and no console warnings/errors. In-app browser JSON can keep stale palace/backdrop loading
  metadata on this heavy route even when the screenshot has rendered the polished palace, so use screenshots as the
  palace visual source of truth. Current evidence:
  `output/playwright/zabulistan-palace-command-feedback-desktop.png`,
  `output/playwright/zabulistan-palace-command-feedback-mobile-rtl.png`, and
  `output/playwright/zabulistan-palace-command-feedback-reduced.png`.
- Current Zabulistan palace gate-hold baseline: `src/main.js` owns a pooled
  `zabulistan-gate-hold-cue` terrain layer at the palace threshold. It derives hold/ready/peak state from existing
  `palaceGateCommandPressure`, `palaceAssaultStatus`, and palace defender squad metadata, then renders a low-chrome
  threshold band, hold ring, brace line, and three pressure ticks without adding a HUD panel or changing balance.
  Direct QA routes are `?qa=gate-hold-state`, `?qa=gate-hold-state-rtl`, and `?qa=gate-hold-state-reduced`; these now
  default to a breach-pressure sandbox assault with full FX and command pulse disabled so the cue can be judged cleanly.
  The QA route also suppresses the floating gate text banner, leaving the terrain cue readable without text boxes over
  the melee cluster. Build, asset audit, syntax check, and `git diff --check` pass. Accepted browser evidence:
  `output/playwright/zabulistan-gate-hold-state-desktop-no-banner.png`.
- Current Zabulistan combined-combat readability baseline: enemy pressure, tower selection, palace command feedback, and
  palace gate hold now read together through `src/main.js` presentation-layer budgeting. Selected-target and gate-hold
  cues stay primary when stacked; road pressure, contact, and command cues are capped/subdued instead of brightened.
  Direct QA routes are `?qa=combined-combat-readability`, `?qa=combined-combat-readability-rtl`, and
  `?qa=combined-combat-readability-reduced`. Accepted combined metrics include active budget, visible selected target
  thread, active gate-hold metadata, capped road/contact cues, one subdued palace command cue, compact `combatFlow`, no
  overflow, no broken images, artifacts 0, and Harmony backdrop/facade regression checks passing.
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

## Updated 2026-06-29 - Current Zabulistan stage-one resume point

- **Current local head:** `3a97e1d Improve Zabulistan ridge assets`. The work is committed locally only. Do not merge or
  push unless the user explicitly asks.
- **Recent local visual baseline:** keep commits `c7a10bf`, `618a955`, `468bed1`, `094543e`, and `3a97e1d` as the
  active Zabulistan visual direction. These cover foreground dressing, softer gate dressing, palace texture retune,
  authored palace facade dressing, and warmer ridge/siege assets.
- **Do not revert:** the authored `zv_palace_facade_dressing` path in `src/world/zabulistanVisualKit.js`. It is now the
  preferred palace gate/front facade; the procedural fallback is still present for asset failure.
- **Do not re-grey:** `zv_cliff_shoulder_set`, `zv_outer_ridge_wall_set`, and `zv_gate_cliff_siege_set`. They are now
  placed with `tint: null` so their local warm material palette survives. Reintroducing the old grey tints makes the
  environment read as blocky placeholder stone again.
- **Current authored asset scripts:**
  - `scripts/asset-tools/build-zabulistan-palace-facade.mjs` rebuilds `palace-facade-dressing.glb`.
  - `scripts/asset-tools/build-zabulistan-ridge-assets.mjs` rebuilds `cliff-shoulder-set.glb`,
    `outer-ridge-wall-set.glb`, and `gate-cliff-siege-set.glb`.
- **Current accepted visual QA evidence:**
  - `output/visual-qa/zabulistan-palace-facade-asset/`
  - `output/visual-qa/zabulistan-ridge-assets-final/`
- **Latest verification:** `npm run build` and `npm run audit:assets` pass. Browser QA for opening build, palace
  selected, gate hold/combat, and mobile RTL reported no overflow and no broken images. Automated audio autoplay
  warnings are expected.
- **Current harmony baseline:** the Zabulistan board/backdrop/lighting pass is now implemented locally. The map-specific
  biome and mood values live in `src/data/zabulistanVisualProfile.js` under `biome`, and `src/world/map.js` consumes that
  profile instead of keeping a hardcoded Zabulistan override. Preserve this shape for future Zabulistan tuning.
- **Harmony visual state:** terrain, apron, fog, and panorama tones now read as one warmer dry highland fortress scene.
  The board/apron colors are closer, the circular edge blend is wider and softer, and the distant highlands are more
  visible with reduced wash while still staying below roads, pads, enemies, palace gate, and HUD contrast.
- **Harmony QA baseline:** accepted checks are `?qa=opening-build`, `?qa=palace-contact-terrain`,
  `?qa=gate-hold-state`, `?qa=palace-contact-terrain-rtl`, and
  `window.__dbg.visualQa.state('backdropSweep', { mapId: 'zabulistan' })`. Wait for `qa-state-recorded`; require all
  five Zabulistan backdrop image layers loaded, no missing/failed layers, no overflow, no broken images, no artifact
  findings, authored facade present, fallback absent, and readable mobile RTL palace/forecourt.
- **Current combined-combat baseline:** the Zabulistan real-wave playability/readability pass is implemented locally.
  `src/main.js` keeps selected-target and palace gate-hold cues as the dominant read under stacked combat, while capping
  road pressure, contact, and palace command feedback. The accepted routes are `?qa=combined-combat-readability`,
  `?qa=combined-combat-readability-rtl`, and `?qa=combined-combat-readability-reduced`; wait for `qa-state-recorded` and
  require active budget, visible selected-target thread, active gate-hold state/pressure/defender metadata, subdued
  road/contact/command cues, compact `combatFlow`, no overflow, no broken images, artifacts 0, five backdrop layers,
  authored facade present, and fallback absent.
- **Known local noise:** `memory/`, `output/`, `.playwright-cli/`, and `scripts/asset-tools/__pycache__/` may be dirty or
  untracked. Keep those out of code commits unless the user specifically asks to update memory.
- **Recommended next implementation step:** package or commit the combined-combat readability pass only if requested.
  Otherwise treat Harmony plus combined-combat readability as the active Zabulistan baseline. The next separate
  implementation frontier is boss actor quality only if the user explicitly shifts focus there; do not retune stage
  harmony, HUD chrome, combat balance, or generated assets as part of this packaging state.
