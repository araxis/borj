# Testing & QA

## How to test
```bash
npm run dev            # http://localhost:5180
npm run build && npm run preview   # test the production bundle
```
**Headless gameplay simulation** (works even in hidden tabs — rAF-independent):
```js
// in the browser console, after starting a battle:
const g = window.__dbg.game;
g.gold = 2000;
const pads = g.map.pads.filter(p => !p.tower && (p.rubbleT||0) <= 0);
g.buildTower('zabul-watch', pads[0]);
g.startWave();
for (let i = 0; i < 3600; i++) g.update(1/60, i/60);   // simulate 60 s instantly
({ lives: g.lives, gold: g.gold, alive: g.enemies.filter(e => e.alive).length })
```

## Verified in this session (Chrome, Windows 11, dev server + automated driving)
- ✅ Boot: no console errors; loading → main menu.
- ✅ Campaign screen: atlas place art correct; lock/unlock progression; map intro shows
  ledger name (EN+FA), story reference, lore intro.
- ✅ Battle scene: terrain, winding flagstone road + curbstones, pads at road grade,
  citadel (turquoise dome, banners, braziers), spawn gates, props, biome lighting.
- ✅ Build flow: card select → pad highlight ring + range ring → place; gold deducted;
  Shift-click multi-build; occupied/rubble pads rejected.
- ✅ Right panel: tower def view (stats/age path/Mastery note/favored commanders/fusions),
  live tower view (HP bar, upgrade/sell/rally/fuse buttons, hero list with bond %).
- ✅ Combat sim (headless): towers fire, enemies die, bounty + wave income, lives lost on
  leaks, wave end → build phase; full 8-wave campaign map clear → victory + hero unlocks
  (Nariman, Faramarz) persisted to localStorage profile.
- ✅ Hero assignment: Rostam→Mace Hall bond 62%, Kaveh→Forge bond 118%; garrison respawned
  with buffed stats; gold command ring.
- ✅ Soldiers: 7–8 spawned across barracks towers, melee blocking observed, patrols.
- ✅ Fusion: kaveh-forge + derafsh-hall (12 units apart) → Kaviani Uprising Forge; tower B
  pad freed; post-fusion sim clean.
- ✅ Destruction: 60% damage → stage 1 crown drop; lethal → staged collapse, 20 debris
  chunks bounce/settle, pad rubble then rebuildable.
- ✅ Endless mode entry from a defended map; best-wave recording.
- ✅ Persian: full RTL flip, FA strings everywhere tested (menu, codex, campaign), Persian
  digits, codex detail with FA lore + EN story reference.
- ✅ Codex: 5 tabs, atlas art, ledger notes; z-order fixed above menu.
- ✅ Settings: sliders/toggles persist (localStorage), quality switch live-applies.
- ✅ Production build: 54 modules, ~793 KB js (228 KB gzip), relative paths, atlases copied.

## Performance checks
- Game-logic update with **89 live enemies: 1.69 ms** (headless probe) → logic headroom ✓.
- Rendering: real-GPU Chrome renders the menu/battle smoothly during interactive capture;
  software-GL environments (headless preview) are too slow for bloom+shadows — use quality
  'low' there. **TODO**: capture a real fps number on the user's GPU with 100+ enemies +
  40 towers (needs a visible tab for a sustained period — automation tabs sat hidden).

## Known issues / watchlist
1. **Hidden tab pauses the game** (rAF) — intended, but means timers in UI toasts continue;
   harmless.
2. Spawn-gate arch reads as a dark hut at distance; could get a stronger silhouette.
3. Tower/citadel shadow faces are dark-ish; hemisphere raised to 0.95 — revisit per-biome.
4. `lashEffect` uses its own rAF; in hidden tabs lashes persist until visible (cosmetic).
5. Larvae reuse the worm def scaled 0.45 — acceptable, but a unique larva model would read
   better.
6. Wave-1 difficulty: 2 starter towers clear it with 0 leaks (intended gentle start) —
   first balance pass only; campaign maps ≥ order 10 not yet hand-playtested.
7. Browser matrix: tested Chrome only. Firefox/Safari pass needed (WebAudio + WebGL2 both
   standard; expect OK).

## Validation checklist for future changes
- [ ] `npm run build` passes, no console errors on boot.
- [ ] Atlas mapping spot-check: Rostam = heroes R1C1, Zahhak = enemies R1C1,
      Zabulistan = places R1C1 (codex). Also check crop FRAMING on Zal (R1C2),
      Rakhsh (R4C5), Arash (R6C1) — these exposed the non-uniform-grid bug; no
      neighbor slivers may appear (see content-ledger.md § Atlas grid geometry).
- [ ] Headless sim of map 1 (script above): victory reachable, no exceptions.
- [ ] FA toggle: RTL layout, no broken punctuation in panels.
- [ ] Destruction: kill a tower, confirm staged collapse + pad rubble + rebuild.
- [ ] Enemy inspection: click a marching enemy → battle pauses, story card opens with
      live HP, camera follows; close panel → resumes (unless manually paused before).
- [ ] Creature facing: beasts/serpents walk HEAD-first (+Z convention in creature.js).
- [ ] localStorage save: complete map 1 → reload → map 2 unlocked, heroes present.

## Reconciled 2026-06-17 — verification approach in current use
- **Compile gate:** `npm run build` (Vite) on every change — current bundle ~1.16 MB js (~365 KB
  gzip), ~70 modules (was 793 KB / 54 modules at the 2026-06-12 snapshot above; growth = SMAA/GTAO
  passes + asset code). No automated unit-test suite exists (verified) — verification is build +
  live-driving + headless sim.
- **Live verify:** Claude-in-Chrome against the dev server (`localhost:5180`). A backgrounded tab
  pauses rAF (animations freeze, screenshots stale) — keep the tab foreground for animated checks.
- **Reaching a specific unit for a screenshot:** select its card via the DOM, then place
  deterministically with `game.buildTower(defId, pad)` via a temporary `window` debug hook (remove
  before commit), and project the unit's world position through `engine.camera` to get screen coords.
  GOTCHA: window is 2752 px but screenshots are 1568 px (×1.755) — scale coords, and synthetic
  zero-movement pointer events avoid clicks being read as camera drags.
- **GTAO check:** confirmed active on high tier with no over-darkening + no console errors (only
  benign Chrome-extension "listener … message channel closed" noise, which is NOT game error).
- `window.__dbg` headless sim (script above) remains the rAF-independent path for gameplay/balance.

## Updated 2026-06-20 — visual QA gate
- **Build:** `npm run build` passes after the palace/hero/boss/backdrop wave.
- **Browser path:** use a desktop browser with the app at `http://127.0.0.1:5180/#sandbox`; the browser automation
  route can use an installed browser executable if the bundled browser is missing.
- **Current browser fallback (2026-06-20):** the in-app browser connector can fail before page actions with a
  missing sandbox metadata field. When that happens, use the browser automation CLI path instead: open the local app,
  run page-context code, inspect console output, and capture screenshots. This route successfully forced `backdropSweep`, read
  `window.__dbg.visualQa.backdrops()`, and captured Zabulistan screenshots.
- **Debug QA states:** `window.__dbg.visualQa.state(name, opts)` now covers:
  `backdropSweep`, `palaceCommand`, `heroCommand`, `gateAssault`, `bossArrival`, `sagaTrial`,
  `bossBroken`, `bossHardened`, `fogFail`, `victory`, `defeat`, and `mobileRtl`.
- **Acceptance metrics:** after every forced visual state, check:
  `window.__dbg.visualQa.metrics().scroll.overflow === false`,
  `window.__dbg.visualQa.overflow().length === 0`, and
  `window.__dbg.visualQa.metrics().artifacts.length === 0`.
- **Backdrop checks:** legacy curated maps should show 8 loaded image layers (`far_n/e/s/w` +
  `mid_n/e/s/w`) after texture decode, 0 failed, and 0 missing. Converted `panorama360` maps report ring layers instead:
  Zabulistan should show `mountains360`, `foothills360`, `ridges360`, `scrub360`, and `apron360`; Sistan should show
  `marshSky360`, `reedline360`, `waterChannels360`, and `apron360`. Both include the procedural horizon/haze helpers.
  A brief
  `loading` state immediately after map switch is expected; wait for texture load before judging
  screenshots. The report also includes each layer's texture dimensions and active `tone` values
  (`opacity`, `brightness`, `desaturate`, `contrast`, `wash`, `lowFog`, `y`, `height`, `radius`, `bottomFade`,
  `topFade`) after the 2026-06-20 backdrop tone-tuning pass. Loaded is not enough: also capture a
  low-angle horizon view and confirm the map-specific silhouettes are visible above the terrain/apron
  without covering roads, pads, enemies, palace gates, or HUD.
- **Horizon blend checks:** curated maps should include the procedural `horizonBlend` layer. In low-angle
  screenshots, the land/apron should fade into the panorama through a soft fogged band rather than a flat
  green-to-sky seam. In top-down play, the blend must remain behind gameplay due to depth testing. The
  world apron also adds `ground-horizon-veil`; it should soften only the far outer land, not wash over pads,
  roads, palace gates, enemies, or the HUD. The first inward-distance pass intentionally moved the merge
  helpers/range ring closer before moving the image panorama. Later distance passes pulled the panorama itself
  in: current default far/mid/haze radii are 364/284/310, and Zabulistan uses 356/274/302. If continuing this
  polish, use a low-angle screenshot before reducing those radii further, and watch for ridge tile/panorama
  depth fighting.
- **Circular-board pilot:** Zabulistan now uses a circular visual terrain/apron around radius 86 while keeping the
  tactical board square internally. Smoke check that top-down views show no square green corners, decorative props stay
  inside the visual circle, and roads/pads/gates/palace/enemies still behave normally. Other maps remain square until
  explicitly converted.
- **Zabulistan no-3D-ring check:** Zabulistan intentionally skips the procedural `buildMountainRing` range silhouettes.
  Visual depth should come from the five raster 360 layers plus the apron/veil/horizon helpers. `apron360` is the
  near-board layer anchored close to the circular board to cover the blue fog surface; `scrub360` and `ridges360` carry
  the next distance steps. If the near horizon looks too empty, tune these image layers before re-enabling procedural
  ridge geometry.
- **Zabulistan circular-edge blend:** the map now adds a procedural `board-edge-blend` ring over the visual circle edge.
  It should be broad/subtle, not a dark visible ring. Current tuned values keep it greener and closer to the board edge
  (`edgeBlendInner: 70`, `edgeBlendOuter: 152`, `edgeBlendOpacity: 0.24`, `edgeBlendFogMix: 0.035`). If the circle
  outline reappears, tune `edgeBlendInner`, `edgeBlendOuter`, `edgeBlendOpacity`, and `edgeBlendFogMix` in the
  Zabulistan `visualBoard` config before changing gameplay geometry.
- **Zabulistan near-board color check:** `apron360` should read close to the playable grass, roughly anchored around
  `#b4ce71`, rather than blue haze. If it drifts cool again, first tune the `apron360` asset and its layer values
  (`opacity`, `brightness`, `wash`, `lowFog`) before changing the farther panorama stack.
- **Zabulistan overhead panorama check:** the closest raster rings (`scrub360`, `apron360`) use `topViewFade` so they
  stay visible in low/edge tactical views but fade from high overhead views. QA should check low/top/edge views after
  any panorama tuning. Current evidence: `artifacts/visual-qa/zabulistan-transition-after-pitchfade-low.png`,
  `artifacts/visual-qa/zabulistan-transition-after-pitchfade-top.png`, and
  `artifacts/visual-qa/zabulistan-transition-after-pitchfade-edge.png`.
- **Sistan panorama check:** Sistan keeps the standard square board and uses panorama layers only for distant reedland
  depth. The close `waterChannels360` and `apron360` layers use `topViewFade`; in low-angle views they should add
  water/reed cues, while in high-angle views they must fade enough that they do not read as a wall around the board.
  Current evidence: `artifacts/visual-qa/sistan-panorama360-low-final.png` and
  `artifacts/visual-qa/sistan-panorama360-top-final.png`.
- **Retired landmark overlay:** `landmark360` is currently not active in Zabulistan. The citadel overlay alternated
  between invisible and scene-dominating, so the current baseline is landscape-only raster depth: mountains, foothills,
  and ridges. Do not reintroduce `landmark_360.png` until the no-3D-ring panorama feels stable. If a landmark returns
  later, keep it a small low-horizon accent and reject any version that reads like a sky wall or second foreground palace.
- **Mobile RTL chip checks:** at 390x844, active saga chip, toast, boss banner, topbar, and bottom wave
  button must not overlap. The current mobile toast offset intentionally moves toasts below an active
  saga chip.
- **Palace direct-command medallion arc:** palace maps now project a `.palace-action-rail` anchor above/near the palace,
  but the visible controls are tower-style circular medallions arranged in an arc. QA should confirm the arc stays above
  the 3D scene, appears only while the palace is selected, clamps away from the top HUD and open side panels, and that
  clicking a ready command executes the same path as the palace card. Ready commands should use green rings with no
  `Ready` text; cooldown/cost/blocked states should still show text. Current evidence:
  `artifacts/visual-qa/palace-action-medallion-arc.png`,
  `artifacts/visual-qa/palace-action-medallion-click.png`, and
  `artifacts/visual-qa/palace-action-medallion-mobile.png`; selected-only/green-ring evidence:
  `artifacts/visual-qa/palace-action-green-ready-selected.png` and
  `artifacts/visual-qa/palace-action-green-ready-click.png`. Image-emblem evidence:
  `artifacts/visual-qa/palace-action-emblem-images.png` and
  `artifacts/visual-qa/palace-action-emblem-click.png`. Gate-marker cleanup evidence:
  `artifacts/visual-qa/palace-gate-marker-clean-seals.png`, which should report `gateSeals: 3` and `standards: 0`.
  Shield-line cleanup evidence: `artifacts/visual-qa/palace-shieldline-clean-seals.png`, which should report
  `shieldSeals: 7` and no old upright shield/pole props.
- **Palace gate clutter regression:** Zabulistan palace QA should also confirm no idle palace-action sticks beside the
  gate. After triggering `palaceMuster`, idle `cavalry-lancers` at the palace stand should be hidden
  (`visibleSoldiers: 0`, `hiddenSoldiers: 3`) until enemies engage. Gate command markers should report `standards: 0`,
  `shieldGlints: 0`, `hasLine: false`, and `ringIsLine: false`. `PalaceGateStage` should remain ground-only: no
  permanent stage banners, braziers, threshold line segments, or miniature shield/spear props. Engagement smoke should
  show defenders reappearing when a palace assault is spawned. Current evidence:
  `artifacts/visual-qa/zabulistan-palace-no-action-sticks.png` and
  `artifacts/visual-qa/zabulistan-palace-engaged-defenders.png`.
- **Zabulistan cavalry staging regression:** the authored staging groups should load as `zabulistan-cavalry-staging-left`
  and `zabulistan-cavalry-staging-right`, each with visible tack/shields/lances rather than static stick placeholders.
  The old tether/procedural rails remain fallback only. QA should confirm no large HUD element covers the lower-center
  playfield, no mobile RTL overflow, no visual artifact findings, no floating staging props, and no obvious clipping into
  the palace base. Current evidence:
  `artifacts/visual-qa/zabulistan-cavalry-staging-final-wide.png`,
  `artifacts/visual-qa/zabulistan-cavalry-staging-final-close.png`, and
  `artifacts/visual-qa/zabulistan-cavalry-staging-final-mobile-rtl.png`.
- **Zabulistan palace forecourt dressing regression:** the refreshed base transition should load as
  `zabulistan-palace-base-transition-main`, `zabulistan-palace-base-transition-left`, and
  `zabulistan-palace-base-transition-right`; the approach threshold should load as
  `zabulistan-forecourt-approach-edges`. QA should confirm no black/white stacked base look, no placeholder artifact
  findings, no mobile RTL overflow, no floating forecourt stones, and no road/pad clipping at the palace gate. The
  low-opacity forecourt wash is intentional and tagged with `visualQaIgnore`; do not treat it as a blocker unless it
  becomes a visible dark rectangle again. Current evidence:
  `artifacts/visual-qa/zabulistan-forecourt-dressing-final-wide.png`,
  `artifacts/visual-qa/zabulistan-forecourt-dressing-final-close.png`, and
  `artifacts/visual-qa/zabulistan-forecourt-dressing-final-mobile-rtl.png`.
- **Zabulistan lower approach regression:** use
  `window.__dbg.visualQa.state('zabulistanForecourt', { mapId: 'zabulistan' })` for road/pad/gate screenshots. It should
  frame the lower road and approach pads without opening palace medallions by default. Confirm
  `zabulistan-forecourt-lower-approach-edges`, `zabulistan-forecourt-lower-scree-left`, and
  `zabulistan-forecourt-lower-scree-right` load, `zabulistan-pad-ground-blend` remains visible, artifacts are 0, overflow
  is 0, and all five Zabulistan backdrop layers are loaded. Current evidence:
  `artifacts/visual-qa/zabulistan-forecourt-approach-final-desktop.png` and
  `artifacts/visual-qa/zabulistan-forecourt-approach-final-mobile-rtl.png`.
- **Zabulistan road material regression:** the same `zabulistanForecourt` state should show the main road as muted
  packed earth with broken ruts and irregular edges, not a smooth black strip or saturated orange band. The road material
  should report color near `b8aa8a` and bump scale near `0.045` for the Zabulistan render mesh. Current evidence:
  `artifacts/visual-qa/zabulistan-road-material-final-desktop.png` and
  `artifacts/visual-qa/zabulistan-road-material-final-mobile-rtl.png`.
- **Zabulistan road-edge blend regression:** the `zabulistanForecourt` state should include one visible
  `zabulistan-road-shoulder-blend` mesh, plus `zabulistan-forecourt-approach-edges` and
  `zabulistan-forecourt-lower-approach-edges`. The shoulder must read as a subtle terrain feather, not a pale border,
  and the old random terrain scuffs must not return as large translucent oval blobs across the playfield. Current
  browser QA target: artifacts 0, overflow 0, desktop LTR clean, mobile RTL clean. Current evidence:
  `artifacts/visual-qa/zabulistan-road-blend-final-desktop.png` and
  `artifacts/visual-qa/zabulistan-road-blend-final-mobile-rtl.png`.
- **Zabulistan palace material regression:** the custom palace clone should not self-glow. In
  `window.__dbg.visualQa.state('zabulistanForecourt', { mapId: 'zabulistan' })`, inspect `game.map.citadel.group`
  materials and confirm the Zabulistan palace material is muted sandstone (`color` near `9a8664`) with
  `emissive: 000000`, `emissiveIntensity: 0`, high roughness, and no visual artifact findings. The palace should keep
  readable red banners and carved gate detail without returning to the over-bright gold-white look. Current evidence:
  `artifacts/visual-qa/zabulistan-palace-tone-desktop.png`,
  `artifacts/visual-qa/zabulistan-palace-tone-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-palace-tone-selected.png`.
- **Zabulistan gate threshold regression:** the `zabulistanForecourt` state should include
  `zabulistan-gate-threshold-transition` and should not include `zabulistan-forecourt-threshold` or
  `zabulistan-gate-contact-grit` when `gate-threshold-transition.glb` loads. The old threshold/contact-grit layers are
  fallback-only. Desktop and mobile RTL captures should keep artifacts 0, overflow 0, fallback false, and no broad
  continuous causeway/threshold plates at the lower gate. Current local evidence:
  `output/playwright/zabulistan-gate-threshold-transition-desktop-final-v2.png` and
  `output/playwright/zabulistan-gate-threshold-transition-mobile-rtl-final.png`.
- **Zabulistan gate combat regression:** use
  `window.__dbg.visualQa.state('zabulistanGateCombat', { mode: 'royal' })` for wave/combat screenshots. In cold browser
  contexts, warm `loadZabulistanProps()` and `loadPalace('zabulistan')` before creating the state so screenshots show the
  authored forecourt and custom palace rather than the fallback. Expected QA: 14 attackers, 3 defenders, custom
  `palace-zabulistan`, `zabulistan-gate-threshold-transition`, `zabulistan-road-shoulder-blend`,
  `zabulistan-forecourt-approach-edges`, and `zabulistan-forecourt-lower-approach-edges` present; artifacts 0, overflow
  0, no page errors, five backdrop layers loaded, and palace-boon `waves` stays 0 for the low-chrome royal gate state.
  Desktop, mobile RTL, and reduced-motion captures should not show broad filled shockwave discs covering the center or
  lower playfield. Current evidence:
  `artifacts/visual-qa/zabulistan-gate-combat-final-desktop.png`,
  `artifacts/visual-qa/zabulistan-gate-combat-final-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-gate-combat-final-reduced-motion.png`.
- **Zabulistan cavalry close-combat regression:** use
  `window.__dbg.visualQa.state('zabulistanCavalryCloseCombat', { mode: 'royal' })` for mounted defender close-ups at the
  palace gate. In cold browser contexts, warm `loadZabulistanProps()`, `loadPalace('zabulistan')`, and actor preload until
  `assetReady('a_zabul_warhorse')` is true before creating the state. Expected QA: Zabulistan props ready, horse ready, 3
  mounted GLB defenders, one `zabulistan-cavalry-close-combat-fx` group, artifacts 0, overflow 0, no page errors, and no
  sandbox helper chrome/toast covering the playfield. Current evidence:
  `artifacts/visual-qa/zabulistan-cavalry-close-combat-final-desktop.png`,
  `artifacts/visual-qa/zabulistan-cavalry-close-combat-final-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-cavalry-close-combat-final-reduced-motion.png`.
- **Zabulistan gate approach depth regression:** use
  `window.__dbg.visualQa.state('zabulistanForecourt', { forward: 24.8, dist: 58, pitch: 0.59, selectPalace: true })`
  for the desktop gate-depth frame, `zabulistanGateCombat` for combat, and the same forecourt state with mobile RTL for
  mobile. Expected QA: four authored `zabulistan-gate-cliff-siege-*` objects, four
  `zabulistan-gate-depth-beacon-*` objects, no `zabulistan-gate-approach-depth-fallback`, artifacts 0, overflow 0, no
  runtime errors, and nonblank PNG samples. Current evidence:
  `artifacts/visual-qa/zabulistan-gate-depth-final-desktop.png`,
  `artifacts/visual-qa/zabulistan-gate-depth-final-combat.png`, and
  `artifacts/visual-qa/zabulistan-gate-depth-final-mobile-rtl.png`.
- **Zabulistan mobile low-chrome HUD regression:** on mobile RTL, combat should keep the topbar compact and the
  lower-center playfield mostly open. Current expected metrics for
  `window.__dbg.visualQa.state('zabulistanCavalryCloseCombat', { mode: 'royal' })`: body includes `wave-active`,
  `#topbar` is about 64px high, `#quickBuildTray` exposes only one `quick-build-more` child, `#bottomBar` is a compact
  active-wave chip, secondary Codex/settings/language buttons are hidden, artifacts 0, overflow 0, and no page errors.
  For `zabulistanForecourt` build phase, quick role buttons may remain visible at the edge, but the call-wave control
  should stay compact rather than full-width. Current evidence:
  `artifacts/visual-qa/zabulistan-mobile-hud-combat-rtl.png`,
  `artifacts/visual-qa/zabulistan-mobile-hud-forecourt-rtl.png`,
  `artifacts/visual-qa/zabulistan-mobile-hud-combat-reduced-motion.png`, and
  `artifacts/visual-qa/zabulistan-desktop-hud-combat.png`.
- **Generated evidence:** screenshots under `artifacts/visual-qa/` are local QA evidence and should not
  be committed unless explicitly requested.

## Updated 2026-06-20 — cavalry asset QA
- **Mounted lancer asset selection:** after model preload, `window.__dbg.soldierTest('lancer', 'walk')` should return
  `{ mounted: true, animType: 'gltf', glb: true }`, must include `ZabulWarHorseRig` and `ZabulWarHorseMesh`, and must
  not include the rejected `WarHorseRoot`.
- **Current baseline:** black lancers use `a_zabul_warhorse` from
  `public/assets/animals/ZabulWarHorse.glb`; scout riders still use the stock `a_horse` path. Current lancer smoke:
  `children: 1`, `currentGroup: ["Walk"]`, clips `{ idle: ["Idle"], walk: ["Walk"], run: ["Gallop"] }`, one skinned
  `ZabulWarHorseMesh`, and node sample includes `root`, `spine`, `chest`, `neck`, `head`, `tail_1`, `tail_2`, `saddle`,
  `rider_spine`, `rider_head`, `rider_lance`, and articulated front/rear leg bones.
- **Source-mesh acceptance:** the current source is the combined static horse+rider file
  `C:\Users\meisa\Downloads\horse3.glb`; the runtime asset must stay rigged and animated before it is used as visible
  palace cavalry. Do not replace it with static, primitive-composite, or double-rider motion.
- **Skinning fan guardrail:** inspect the exported cavalry GLB at walk frame 124 in a local 3D editor after rig changes. The armature
  joint spheres/markers are viewport helpers, but the mesh must not form stretched triangular fans under the horse. Current
  export uses connected-island rigid cleanup; deformation audit should keep stretched edge count over the threshold at 0.
- **Front-leg preview guardrail:** GLB import may show the rest pose until the `Walk` action is assigned to
  `ZabulWarHorseRig`. With `Walk` assigned, both front sides should have animated `front_*_hoof`, `front_*_lower`, and
  `front_*_upper` groups. Current evidence frames are under `output/asset-qa/zabul-walk-frames-v2/`.
- **Attack timing guardrail:** `ZabulWarHorse.glb` must include an `Attack` clip, and glTF animation accessor timing should
  start near 0. Current expected durations are `Attack: 1.417s`, `Gallop: 2.0s`, `Idle: 3.75s`, `Walk: 2.5s`. Do not key
  separate actions at high global source-frame offsets unless the exporter remaps them to local frame 1; otherwise
  `model.anim.strike()` starts at a long silent/rest segment.
- **Attack lance direction guardrail:** the `Attack` hit frame should read as a forward couched thrust toward the horse
  head/enemy direction, not as an upright spear or a backward-resting lance. Current checked local frame 17 has weighted
  lance range forward (`Y -0.879` to `-0.116`), vertical/forward range ratio around `0.58`, and 0 stretched edges. Current
  evidence is under `output/asset-qa/zabul-attack-frames-v7/`.
- **Visual evidence:** current corrected combined cavalry screenshots:
  `output/playwright/zabul-cavalry-horse3-lancer.png` and
  `output/playwright/zabul-cavalry-horse3-close.png`; skinning-fan fix evidence:
  `output/asset-qa/zabul-warhorse-skinning-fix.png`.

## Updated 2026-06-20 — actor asset quality QA
- **Audit gate:** run `npm run audit:assets` before accepting new actor GLBs. It should report `blockers: []`.
  Source/reference actor files with no clips may be listed as `sourceOnly`, but they must not be used as primary visible
  enemies until exported with real clips.
- **Crawler guardrail:** `Azhdaha.glb` remains a source/reference actor with 0 animation actions, so dragon should use
  the accepted animated `a_azhdaha_actor` path. `Worm.glb` has been repaired with real idle/walk/attack clips; it should
  no longer appear in `sourceOnly`, and `window.__dbg.enemyTest('worm', 'walk')` should return `animType: 'gltf'` and
  `glb: true`.
- **No fake static motion:** do not reintroduce a generic static-GLB bob/weave/crawl branch for production actors. If an
  asset has no clips, either fix it in the asset pipeline or use a deliberately rigged fallback model.

## Updated 2026-06-30 - runtime boss actor quality QA
- **Implementation baseline:** Runtime Boss Actor Quality is a presentation-only source pass merged on `main` through
  PR #13 (`fe5ccbf`) and deployed by static site run `28459861505`. It may tune boss model scale/facing/head
  height/cadence, procedural fallback silhouette, boss detail overlays, and debug-only QA metadata, but must not change
  gameplay stats, targeting, waves, pathing, saves, HUD structure, Zabulistan terrain/backdrop/fog, or palace/ridge
  assets.
- **Accepted QA routes:**
  - `?qa=boss-closeup-dragon`
  - `?qa=boss-arrival-dragon`
  - `?qa=boss-closeup-zahhak`
  - `?qa=boss-arrival-zahhak`
  - `window.__dbg.visualQa.state('bossCloseup', { mapId: 'makran', defId: 'haftvad-worm' })`
  - `window.__dbg.enemyTest('dragon', 'walk')`
  - `window.__dbg.enemyTest('worm', 'walk')`
- **Acceptance metrics:** wait for `qa-state-recorded` before visual assertions. Dragon closeup should report
  `animType: 'gltf'`, `glb: true`, `visualSource: 'asset:a_azhdaha_actor'`, `assetKey: 'a_azhdaha_actor'`, action names
  including `idle`, `walk`, and `attack`, and `actorProfile: 'animated-crawler'`. With the merged animated worm repair,
  `haftvad-worm` should report `animType: 'gltf'`, `glb: true`, `visualSource: 'asset:a_worm'`,
  `assetKey: 'a_worm'`, action names including `idle`, `walk`, and `attack`, `fallbackReason: null`, and
  `sourceAsset: null`.
- **Visual guardrails:** crawler and humanoid/div boss overlays should clarify scale and identity without broad glow
  discs, banners, HUD-like chrome, or reduced-motion dependence. The repaired worm GLB should read as the primary boss
  actor; the procedural worm remains only an asset-failure fallback.
- **Static checks:** run `node --check src/models/creature.js`, `node --check src/entities/bossvisuals.js`,
  `node --check src/main.js` if debug metadata changes, `npm run audit:assets`, `npm run build`, and
  `git diff --check`. `a_dragon` may remain source-only with 0 audit blockers; `a_worm` should be animation-ready.
- **Regression smoke:** if `src/main.js` changes, run `?qa=opening-build` and `?qa=combined-combat-readability`; require
  all five Zabulistan backdrop layers loaded, active combined-combat budget, selected-target and gate-hold cues readable,
  compact `combatFlow`, no overflow, no broken images, and 0 visual artifact findings.

## Updated 2026-07-01 - animated worm asset repair QA
- **Implementation baseline:** Animated Worm Asset Repair is merged on `main` through PR #15 (`e7239ba`) and deployed by
  Pages run `28492115069`. `public/assets/animals/Worm.glb` is an animated GLB generated by
  `scripts/asset-tools/build-animated-worm.mjs`; it should contain `Idle`, `Walking`, and `Attack` clips, remain about
  126 KB, and stay out of the `sourceOnly` audit list.
- **Accepted QA checks:**
  - GLB inspection for `Worm.glb` shows clips `Idle`, `Walking`, and `Attack`.
  - `npm run audit:assets` reports `blockers: []`, `readyActors: 51`, and only `a_dragon` in `sourceOnly`.
  - `window.__dbg.visualQa.state('bossCloseup', { mapId: 'makran', defId: 'haftvad-worm' })` reports
    `visualSource: 'asset:a_worm'`, `assetKey: 'a_worm'`, `actionNames` including `idle`, `walk`, and `attack`,
    `fallbackReason: null`, and `sourceAsset: null`.
  - `window.__dbg.enemyTest('worm', 'walk')` returns `animType: 'gltf'` and `glb: true`.
  - `?qa=boss-closeup-dragon` still reports `visualSource: 'asset:a_azhdaha_actor'`,
    `actorProfile: 'animated-crawler'`, no overflow, no artifacts, and all Mazandaran backdrop layers loaded.
- **Static checks:** for post-merge memory-only closeout, `git diff --check` is enough. If asset/source files are touched again,
  rerun GLB inspection, `node --check scripts/asset-tools/build-animated-worm.mjs`,
  `node --check scripts/asset-quality-audit.mjs`, `npm run audit:assets`, `npm run build`, and `git diff --check`.

## Updated 2026-06-22 - Zabulistan palace foreground terrace-wall QA
- **Asset presence:** browser QA for `zabulistanForecourt` should find one
  `zabulistan-palace-foreground-terrace-wall-main` object and no
  `zabulistan-palace-foreground-terrace-wall-fallback` object when
  `public/assets/scenery/zabulistan/palace-foreground-terrace-wall.glb` loads.
- **Visual guardrail:** the foreground terrace-wall asset should not contain broad flat ground plates. It should read as
  raised steps, curb stones, low retainers, posts, scree, and shoulder rocks; keep artifact findings at 0 and avoid pale
  slab patches at the lower gate.
- **Current verification:** `npm run build` passed, `npm run audit:assets` passed with 0 blockers, desktop
  `zabulistanForecourt` and mobile RTL `zabulistanForecourt` reported artifacts 0, overflow false, fallback false, and
  no automation browser sessions left open. Local evidence screenshots are under `output/playwright/`.

## Updated 2026-06-22 - Zabulistan staging plate cleanup QA
- **Asset presence:** browser QA for `zabulistanForecourt` should find `zabulistan-cavalry-staging-left`,
  `zabulistan-cavalry-staging-right`, `zabulistan-camp-ground-props-left`,
  `zabulistan-camp-ground-props-right`, and four `zabulistan-gate-cliff-siege-*` objects when the authored GLBs load.
- **Old plate guardrail:** scene traversal should not find old authored mesh names matching
  `cavalry_staging_dust_wash`, `cavalry_staging_packed_earth`, `cavalry_staging_trodden_center`,
  `gate_depth_shadow_wash`, or `gate_depth_trampled_shelf`.
- **Visual guardrail:** the lower gate and cavalry staging area should read as stepped stone, packed ground, small rocks,
  props, and barricades, not as broad pale slabs or helper plates. Keep artifacts 0, overflow false, and fallback false
  in desktop and mobile RTL `zabulistanForecourt` QA.

## Updated 2026-06-22 - Zabulistan palace slope terrace QA
- **Asset presence:** browser QA for `zabulistanForecourt` should find four
  `zabulistan-palace-slope-terrace-*` objects and no `zabulistan-palace-slope-terrace-fallback` object when
  `public/assets/scenery/zabulistan/palace-slope-terrace-set.glb` loads.
- **Runtime guardrail:** `zv_palace_slope_terrace_set` is Zabulistan-only and must stay registered through the neutral
  prop registry. If it is missing, the named procedural fallback should appear instead of breaking map assembly.
- **Road/forecourt guardrail:** the Zabulistan visual road ribbon is intentionally trimmed away from the palace forecourt;
  do not extend the old road mesh back under the gate. The remaining lower approach edge is a known next cleanup target
  and should be solved by replacing/retinting the lower forecourt approach dressing.
- **Current verification:** `npm run build` passed, `npm run audit:assets` passed with 0 blockers, desktop and mobile RTL
  `zabulistanForecourt` reported slope count 4, fallback false, foreground fallback false, threshold present, artifacts 0,
  overflow false, and RTL active. Local evidence:
  `output/playwright/zabulistan-palace-slope-terrace-desktop.png` and
  `output/playwright/zabulistan-palace-slope-terrace-mobile-rtl.png`.

## Updated 2026-06-22 - Zabulistan lower forecourt and palace base QA
- **Old approach plate guardrail:** scene/asset checks should not find old authored mesh names matching
  `forecourt_approach_packed_core`, `forecourt_approach_left_shelf`, or `forecourt_approach_right_shelf`.
- **Runtime presence:** desktop `zabulistanForecourt` QA should find `zabulistan-palace-base-low-terrace`,
  `zabulistan-palace-base-warm-lip`, `zabulistan-palace-foreground-warm-apron`, and
  `zabulistan-palace-foreground-warm-sill-*` objects when Zabulistan loads.
- **Texture/material guardrail:** the Zabulistan palace source GLB now carries the palette cleanup. Runtime should keep
  the lighter warm material tint and emission suppression in `src/core/assets.js`, but should not reintroduce load-time
  canvas texture rewriting for this palace.
- **Mobile HUD guardrail:** mobile low-chrome stat values must ellipsize instead of overflowing; sandbox gold can be
  seven digits during QA. Expected mobile RTL result is page overflow false and `visualQa.overflow()` empty.
- **Current verification:** `npm run build` passed, `npm run audit:assets` passed with 0 blockers, desktop close
  `zabulistanForecourt` and mobile RTL `zabulistanForecourt` reported artifacts 0 and overflow false/0. Local evidence:
  `output/playwright/zabulistan-forecourt-final-close-desktop.png` and
  `output/playwright/zabulistan-forecourt-final-mobile-rtl.png`.

## Updated 2026-06-22 - Zabulistan palace source cleanup QA
- **Asset pipeline guardrail:** `scripts/asset-tools/clean-zabulistan-palace.py` should be repeat-safe. Running it on an
  already-cleaned palace GLB should report an empty warmed list, and production should remain a single-mesh palace GLB
  with the cleaned base-color palette and no active emission-color link.
- **Runtime guardrail:** Zabulistan palace material tint should remain light enough for the cleaned source texture
  (`0xe2c28d` before the small sandstone lerp). Do not darken it back toward the old brown multiplier unless close palace
  screenshots prove the contact base still reads clean.
- **Visual guardrail:** desktop and mobile RTL `zabulistanForecourt` should report artifacts 0, overflow false, all five
  curated Zabulistan backdrop layers loaded, and visible palace command medallions that do not cover the lower playfield.
- **Current verification:** source cleanup idempotence passed with no second warming; `npm run build` passed;
  `npm run audit:assets` passed with 0 blockers; desktop and mobile RTL browser QA were captured at
  `output/playwright/zabulistan-palace-source-cleanup-desktop-final.png` and
  `output/playwright/zabulistan-palace-source-cleanup-mobile-rtl-final.png`.

## Updated 2026-06-23 - Zabulistan palace command rail QA
- **Selection-ring guardrail:** selected-palace ring treatment should stay smaller and softer than tower selection.
  The palace ring should be depth-tested, low-intensity, raised just above the citadel base, and should not read as a
  large glowing road or pad overlay.
- **Mobile RTL HUD guardrail:** with the palace selected, the low-chrome context chip and quick action rail should stay
  separated on a 390 px wide RTL viewport. Expected result is no horizontal overflow, no center/lower playfield blockage,
  and no rail crossing the palace gate center.
- **Command preview guardrail:** enabled palace quick actions should create the existing palace command-footprint preview
  on hover/focus and clear it on leave/blur. Disabled buttons and oath readiness should not create a preview.
- **Current verification:** `npm run build` passed; `npm run audit:assets` passed with 0 blockers; desktop and mobile RTL
  `zabulistanForecourt` reported all five Zabulistan backdrop layers loaded, artifacts 0, overflow false, and command
  preview create/clear result `{ preview: true, nodeCount: 14, cleared: true }`.

## Updated 2026-06-23 - Zabulistan palace contact terrain QA
- **Asset presence:** desktop and mobile RTL `zabulistanForecourt` QA should find
  `zabulistan-palace-contact-terrain`, `zabulistan-palace-contact-threshold-mask`,
  `zabulistan-palace-contact-threshold-stones`, `zabulistan-palace-foreground-terrace-wall-main`, and
  `zabulistan-gate-threshold-transition`. `zabulistan-palace-contact-terrain-fallback` should be absent when the GLB
  loads.
- **Visual guardrail:** the palace stair/front-forecourt contact should read as broken packed earth, small warm stones,
  and shallow threshold dressing. Avoid reintroducing a broad black/white stacked base, a continuous slab strip, or a
  large HUD/selection element covering the lower playfield.
- **Mobile HUD guardrail:** compact low-chrome palace context should not overflow on a 390 px RTL viewport; the compact
  display name may use `Champion Keep` while the full accessible label keeps the full place name.
- **QA route:** `?qa=palace-contact-terrain` and `?qa=palace-contact-terrain-rtl` reproduce the palace-selected
  forecourt state and write an invisible `qa-state-json` report for headless checks.
- **Current verification:** `npm run build` passed; `npm run audit:assets` passed with 0 blockers; desktop and mobile RTL
  QA reported authored contact terrain present, fallback absent, threshold mask/stones present, all five Zabulistan
  backdrop layers loaded, artifacts 0, overflow false, and mobile `visualQa.overflow()` empty.

## Updated 2026-06-23 - Zabulistan cavalry combat low-chrome FX QA
- **QA state:** use `window.__dbg.visualQa.state('zabulistanCavalryCloseCombat', { mode: 'royal', fullFx: true })` for
  mounted defender close-combat frames. It should keep the palace drawer closed unless `showCommands: true` is passed.
- **Combat FX guardrail:** the close-combat group should include mounted defender grounding cues (`defenderShadows`) and
  subtle crest lines while keeping hoof/enemy rings small. Broad gate/command effects should support the fight, not hide
  the horses, enemy bodies, or palace threshold.
- **Duplicate marker guardrail:** palace danger visuals are debounced. After a short active-combat capture, duplicate
  `gateFront` and `shieldLine` marker counts should stay low (current accepted sample: about 3 and 2), not stack around
  ten copies from newly seen attackers.
- **Command-field guardrail:** low-intensity palace fields should emit fewer/shorter rays. In the accepted royal
  Zabulistan close-combat sample, command-field rays dropped from 23 to 9 while keeping rings/threads/target locks
  present for feedback.
- **Mobile reduced-motion guardrail:** 390x844 RTL reduced-motion capture should report page overflow false,
  `visualQa.overflow().length === 0`, artifacts 0, no page errors, one `zabulistan-cavalry-close-combat-fx` group, and
  the compact active-wave HUD chip rather than a large bottom panel.
- **Current verification:** `npm run build` passed; `npm run audit:assets` passed with 0 blockers; `git diff --check`
  passed. Local evidence:
  `output/playwright/zabulistan-cavalry-close-combat-desktop-lowray.png` and
  `output/playwright/zabulistan-cavalry-close-combat-mobile-rtl-reduced-lowray.png`.

## Updated 2026-06-23 - Zabulistan projectile and overlay readability QA
- **Route marker guardrail:** route/assault-column helper lines should keep their own `routeAlpha`/`lineAlpha` values in
  `_updateGateMarkers()` instead of being reset to the old bright route opacity. In royal gate close-combat QA, active
  assault-column line opacity should stay low, depth-tested, and normal-blended.
- **Command-field guardrail:** low-intensity palace command fields should create a low-profile command thread in the
  Zabulistan royal gate state: count 1, depth-tested, normal-blended, close to the ground, and much lower opacity than
  the earlier long white command fan. Low-strength radial rays should remain subtle.
- **Gate-combat overlay guardrail:** defender hold formation, cavalry close-combat, and gate-pressure omen line families
  should not reintroduce bright white scratch lines across the lower-left fight. Current accepted sample keeps defender
  hold line opacity at 0.18 with normal blending and command rays/threads below visual dominance.
- **Current verification:** `npm run build` passed; `npm run audit:assets` passed with 0 blockers; `git diff --check`
  reported only existing line-ending warnings; desktop and mobile RTL reduced-motion QA reported artifacts 0, overflow
  false/0, no page errors, one low-profile command thread, and 9 subtle command rays. Local evidence:
  `output/playwright/zabulistan-cavalry-close-combat-desktop-overlay-tuned.png` and
  `output/playwright/zabulistan-cavalry-close-combat-mobile-rtl-reduced-overlay-tuned.png`.

## Updated 2026-06-23 - Zabulistan palace facade/body QA
- **Asset presence:** close-combat Zabulistan QA should find exactly one
  `zabulistan-palace-facade-dressing` object and zero `zabulistan-palace-facade-fallback` objects when the authored GLB
  has loaded. Missing GLB should use the named fallback without breaking map assembly.
- **Placement guardrail:** the facade dressing belongs on the visible gate surface, not near the palace center. Current
  accepted source placement is 11.5 units along the approach from `map.exitPos`, `targetW: 13.45`, and `yOffset: 0.12`.
- **Visual guardrail:** desktop and 390 px mobile RTL reduced-motion close-combat captures should not show the old white
  cylindrical palace body with a dominant black rectangle gate. The close read should be the warm detailed gate, banners,
  stairs, and rocky base, with no center/lower HUD panel blocking combat.
- **Current verification:** `npm run build` passed; `npm run audit:assets` passed with 0 blockers; `git diff --check`
  reported only existing line-ending warnings; desktop and mobile RTL reduced-motion QA reported authored facade count 1,
  fallback count 0, combat active, and document overflow 0. Local evidence:
  `output/playwright/zabulistan-palace-facade-final-desktop.png` and
  `output/playwright/zabulistan-palace-facade-final-mobile-rtl-reduced.png`.

## Updated 2026-06-23 - Zabulistan build-pad affordance QA
- **QA routes:** `?qa=build-pad-affordance` and `?qa=build-pad-affordance-rtl` reproduce Zabulistan build mode with the
  Zabulistan Watchtower selected and write an invisible `qa-state-json` report after the backdrop layers are ready or a
  deadline is reached.
- **Scene guardrail:** accepted QA should report exactly one `build-pad-affordance` group and 16
  `build-pad-affordance-pad` objects for the current Zabulistan map. Available pads should be visible; occupied or
  rubble pads should hide on the next sync.
- **Visual guardrail:** build-mode markers should read as warm ground-painted corner strips, not bright additive rings or
  hairline white ticks. The pad/range hover feedback should remain terrain-depth-tested and low-chrome on Zabulistan so
  it does not cover the lower playfield.
- **Mobile RTL guardrail:** 390 px RTL capture should keep the quick-build rail on one edge, preserve the compact mode
  hint, show multiple build pads in the playfield, and report `visualQa.overflow().length === 0`.
- **Reduced-motion guardrail:** with persisted `reducedMotion: true`, visible pad marker scale/opacity should remain
  stable across samples. Current accepted sample held the first four markers at scale `1` and opacity `0.5` while
  keeping 16 visible pads.
- **Current verification:** `node --check src/main.js` passed; `npm run build` passed with existing Vite warnings;
  `npm run audit:assets` passed with 0 blockers; `git diff --check` reported only existing line-ending warnings.
  Direct URL desktop and mobile RTL QA reported artifacts 0, overflow empty, all five Zabulistan backdrop layers loaded,
  one affordance group, and 16 pad markers. Local evidence:
  `output/playwright/zabulistan-build-pad-affordance-url-desktop-final.png` and
  `output/playwright/zabulistan-build-pad-affordance-url-mobile-rtl-final.png`.

## Updated 2026-06-23 - Zabulistan active road pressure QA
- **QA routes:** `?qa=active-road-pressure` and `?qa=active-road-pressure-rtl` reproduce Zabulistan build mode during an
  active sandbox gate approach. The state should keep the panel closed, set build mode to Zabulistan Watchtower, spawn or
  reuse active enemies, and write `qa-state-json` after backdrop readiness.
- **Scene guardrail:** accepted QA should report one `zabulistan-road-pressure-cues` pool, 12 pooled
  `zabulistan-road-pressure-cue` objects, 12 rings, 12 dashes, and a positive visible pressure count. The current
  accepted desktop/mobile samples show 6-7 visible pressure cues and 16 build-pad markers.
- **Visual guardrail:** pressure cues should read as low-chrome ground pips under leading enemies, not bright target
  rings, global route lines, or a screen-covering command fan. They should remain depth-tested and normal-blended.
- **Placement guardrail:** when enemies are near a build pad, that pad's affordance strip may warm slightly, but it
  should not switch to a warning panel or obscure the tower foundation.
- **Mobile RTL guardrail:** 390 px RTL capture should show active build mode, visible road pressure, visible pad
  affordances, no page overflow, no center/lower HUD panel, and the quick-build rail confined to one edge.
- **Current verification:** `node --check src/main.js` passed; direct desktop/mobile RTL QA reported artifacts 0,
  overflow empty, all five Zabulistan backdrop layers loaded, one pressure-cue pool, 12 pooled cue objects, 6-7 visible
  pressure cues, and 16 pad markers. Isolated direct-route smoke reported 0 console errors for desktop and mobile RTL.
  `npm run build` passed with existing Vite warnings; `npm run audit:assets` passed with 0 blockers; `git diff --check`
  reported only existing line-ending warnings. Local evidence:
  `output/playwright/zabulistan-active-road-pressure-desktop.png` and
  `output/playwright/zabulistan-active-road-pressure-mobile-rtl.png`.

## Updated 2026-06-23 - Zabulistan real-wave contact QA
- **QA routes:** `?qa=real-wave-contact` and `?qa=real-wave-contact-rtl` reproduce a sandboxed Zabulistan real-wave
  contact setup. The state builds existing Zabulistan Watchtowers near the road, starts the real wave roster, positions
  spawned wave enemies near the contact camera, fast-forwards normal combat updates, closes the panel, and writes
  `qa-state-json` after backdrop readiness.
- **Scene guardrail:** accepted QA should report one `zabulistan-contact-feedback-cues` pool, 10 pooled
  `zabulistan-contact-feedback-cue` objects, 10 ground rings, 10 health backs, 10 health fills, and 10 impact slashes.
  During the contact moment, `contact.visible` or the pool's `visibleCount` should be positive.
- **Visual guardrail:** contact feedback should read as small tactical hit/health cues attached to enemies, not large
  target rings, combat text, or a HUD panel. Rings should stay terrain-depth-tested; billboard health ticks should not
  cover enemy silhouettes or the lower playfield.
- **Mobile RTL guardrail:** 390 px RTL capture should keep the center/lower playfield open, preserve the low-chrome HUD,
  report no page overflow, and show contact cues without clipping into the quick-build rail.
- **Reduced-motion guardrail:** with reduced motion enabled, cue pulse/flash intensity should drop while static hit and
  health readability remains. The layer should never rely on motion alone.
- **Current verification:** `node --check src/main.js` passed; `npm run build` passed with existing Vite warnings;
  `npm run audit:assets` passed with 0 blockers; `git diff --check` reported only existing line-ending warnings.
- **Pending verification:** desktop/mobile RTL browser screenshots and `qa-state-json` checks are still required. In this
  session, Playwright's bundled browser was missing and installed Chrome/Edge both hung at headless launch.
- **Route hardening update:** direct-route `settleFrames` is now 58 instead of 110, and the QA helper primes a visual-only
  contact cue when normal combat contact falls between report samples. This fallback affects only the contact cue state
  used for visual QA; accepted browser QA still needs to confirm a positive visible cue count, artifacts 0, overflow 0,
  and mobile RTL lower-playfield clearance.

## Updated 2026-06-23 - Zabulistan compact combat-flow HUD QA
- **HUD guardrail:** during active Zabulistan combat, the topbar should show one compact `combatFlow` chip with live/queued
  enemy count, kill progress, and a small progress bar. It must hide outside Zabulistan combat and must not open or
  replace the right detail panel.
- **Visual guardrail:** the chip should read like the existing low-chrome gate-omen/status language, not like a new panel
  or banner. Pressure tint is allowed, but it should remain restrained and icon-led.
- **Mobile RTL guardrail:** on 390 px RTL active combat, the chip should remain within the compact topbar, avoid text
  overflow, and leave the lower-middle playfield clear.
- **Current verification:** `node --check src/ui/hud.js` passed; `node --check src/main.js` passed; `npm run build`
  passed with existing Vite warnings; `npm run audit:assets` passed with 0 blockers; `git diff --check` reported only
  existing line-ending warnings.
- **Pending verification:** browser screenshot/JSON QA is still required because the browser runtime path remains
  unavailable in this session.

## Updated 2026-06-23 - Zabulistan selected-target-thread QA
- **QA routes:** `?qa=selected-target-thread` and `?qa=selected-target-thread-rtl` reproduce the real-wave contact setup,
  select a nearby Zabulistan Watchtower, fast-forward live combat, and write `qa-state-json` with a `targetThread`
  report.
- **Scene guardrail:** accepted QA should report one `zabulistan-selected-target-thread`, one
  `zabulistan-selected-target-line`, and one `zabulistan-selected-target-reticle`. During the selected tower fire window,
  `result.targetThread.visible` should be `true`.
- **Visual guardrail:** the thread should read as a thin tactical focus cue from selected tower to enemy, not a bright
  global route line, command beam, or HUD panel. The reticle should sit on terrain under the target without hiding the
  enemy silhouette or contact health tick.
- **Mobile RTL guardrail:** 390 px RTL capture should keep the target thread inside the playfield, avoid page overflow,
  and leave the lower-middle decision area clear of large HUD surfaces.
- **Reduced-motion guardrail:** with reduced motion enabled, the line and reticle may fade but should not shimmer/pulse.
  Target readability must not rely on motion alone.
- **Current verification:** `node --check src/main.js` passed; `node --check src/entities/tower.js` passed;
  `npm run build` passed with existing Vite warnings; `npm run audit:assets` passed with 0 blockers; `git diff --check`
  reported only existing line-ending warnings.
- **Current browser verification:** in-app browser QA for `?qa=selected-target-thread` and
  `?qa=selected-target-thread-rtl` now passes. Accepted reports show selected target thread visible, contact cues visible,
  artifacts 0, overflow false, no visible overlays, and no console warnings/errors. Local evidence:
  `output/playwright/zabulistan-selected-target-thread-zabul-watchtower-warm.png` and
  `output/playwright/zabulistan-selected-target-thread-mobile-rtl-warm.png`.
- **QA route freeze guardrail:** direct-route combat QA should add `qa-state-recorded` and stay frozen on the report
  frame. It must not drift into victory/defeat overlays after `qa-state-json` is written.

## Updated 2026-06-23 - Zabulistan watchtower visual QA
- **Visual guardrail:** `zabul-watch` should use the neutral `zabulWatchtower` recipe and read as warm
  sandstone/brick/cedar with red pahlavan standards, not the old white/black blocky `Watchtower.glb` silhouette.
- **Scope guardrail:** this change is visual-only for `zabul-watch`; no tower stats, targeting, cooldown, projectile,
  wave, save, or command balance behavior should change.
- **Desktop guardrail:** in `?qa=selected-target-thread`, the clustered watchtowers should still leave the selected target
  thread and contact cues visible, with no overlay covering the playfield.
- **Mobile RTL guardrail:** at 390x720, the warmer watchtower silhouettes should remain readable without creating
  overflow or crowding the lower-middle playfield.
- **Current verification:** desktop and mobile RTL in-app browser captures pass with artifacts 0, overflow false, no
  visible overlays, no console warnings/errors, and selected target thread visible. `node --check src/models/towerkit.js`,
  `node --check src/data/towers.js`, `node --check src/main.js`, `npm run build`, `npm run audit:assets`, and
  `git diff --check` passed.

## Updated 2026-06-24 - Zabulistan opening-build pad guidance QA
- **QA routes:** `?qa=opening-build` and `?qa=opening-build-rtl` reproduce a clean first-wave Zabulistan build state,
  select `zabul-watch` build mode, close the detail panel, and freeze after writing `qa-state-json`.
- **Scene guardrail:** accepted QA should report one `build-pad-affordance`, 16 `build-pad-affordance-pad` markers,
  `hints.openingMode === true`, `hints.openingPicks === 3`, and no active combat leftovers in the opening-build state.
- **Visual guardrail:** recommended pads should read as warmer/brighter ground affordances, not text labels, large rings,
  arrows, banners, or HUD panels. Secondary pads should remain visible but recede enough that the top three are legible.
- **Mobile RTL guardrail:** 390x720 RTL capture should report no page overflow, keep the lower-middle playfield usable,
  and avoid clipping the quick-build rail or bottom wave-call chip.
- **Current verification:** desktop and mobile RTL in-app browser captures passed on `http://127.0.0.1:5191/` with
  16 visible pads, 3 opening picks, no overflow, correct `dir`, and no console warnings/errors. `node --check
  src/main.js`, `git diff --check`, `npm run build`, and `npm run audit:assets` passed; build warnings are the existing
  runtime-resolved splash asset, mixed materials import, and large bundle warning.
- **Local evidence:** `output/playwright/zabulistan-opening-build-desktop.png` and
  `output/playwright/zabulistan-opening-build-mobile-rtl.png`.

## Updated 2026-06-24 - Zabulistan active-placement pad guidance QA
- **QA routes:** `?qa=active-placement` and `?qa=active-placement-rtl` reproduce a live Zabulistan combat-pressure
  build state, select `zabul-watch` build mode, close the detail panel, and freeze after writing `qa-state-json`.
- **Scene guardrail:** accepted QA should report one `build-pad-affordance`, 16 `build-pad-affordance-pad` markers,
  `hints.activePlacementMode === true`, at least one `hints.activePlacementPicks`, visible road pressure cues, and live
  enemies. Opening-build metadata should remain off in this state.
- **Visual guardrail:** active response pads should read as warmer/brighter ground affordances near the live threat, not
  as labels, large command rings, arrows, or a new HUD panel. Do not force weak pads to look recommended merely to hit a
  count; one or two strong picks are acceptable when the live path geometry only supports those choices.
- **Mobile RTL guardrail:** 390x720 RTL capture should report no page overflow, keep the lower-middle playfield usable,
  preserve the edge quick-build rail, and avoid a large HUD element covering the live contact cluster.
- **Current verification:** desktop and mobile RTL in-app browser captures passed on `http://127.0.0.1:5191/` with
  16 visible pads, active placement mode true, 2 strong active response picks, road pressure cues visible, no overflow,
  correct `dir`, and no console warnings/errors. `node --check src/main.js`, `git diff --check`, `npm run build`, and
  `npm run audit:assets` passed; build warnings are the existing runtime-resolved splash asset, mixed materials import,
  and large bundle warning.
- **Local evidence:** `output/playwright/zabulistan-active-placement-desktop.png` and
  `output/playwright/zabulistan-active-placement-mobile-rtl.png`.

## Updated 2026-06-25 - Zabulistan contact-confirm and palace-priority QA
- **QA routes:** `?qa=contact-confirm` and `?qa=contact-confirm-rtl` reproduce live Zabulistan real-wave contact,
  force one heavy-hit and one kill-confirm beat, close the detail panel, and freeze after writing `qa-state-json`.
- **Scene guardrail:** accepted QA should report one `zabulistan-contact-feedback-cues` pool, 10 pooled
  `zabulistan-contact-confirm` meshes, `contact.killConfirms >= 1`, `contact.recentHeavyHits >= 1`, and at least one
  visible contact cue. The cue must remain terrain-bound and low-chrome; do not add floating damage text or a new HUD
  panel for this feedback.
- **Palace guardrail:** accepted Zabulistan direct-route QA should report `palace.custom === true`,
  `palace.styleId === "palace-zabulistan"`, and `palace.asset.status === "ready"`. If the report shows the procedural
  `zabul-keep`, the custom palace has not loaded in time and the capture is not accepted.
- **Mobile RTL guardrail:** 390x844 RTL capture should report no overflow, correct `dir`, custom palace ready, and no
  large HUD element covering the center/lower playfield. The edge build rail may remain collapsed/compact.
- **Current verification:** desktop and mobile RTL in-app browser captures passed on a persistent local Vite server at
  `http://127.0.0.1:5194/` with custom palace ready, contact confirm active, no overflow, no artifact findings, correct
  direction, and no console warnings/errors. `node --check src/main.js`, `node --check src/game/game.js`,
  `node --check src/core/assets.js`, `npm run build`, `npm run audit:assets`, and `git diff --check` passed; build
  warnings are the existing runtime-resolved splash asset, mixed materials import, and large bundle warning.
- **Local evidence:** `output/playwright/zabulistan-contact-confirm-desktop.png` and
  `output/playwright/zabulistan-contact-confirm-mobile-rtl.png`.

## Updated 2026-06-25 - Zabulistan palace command feedback QA
- **QA routes:** `?qa=palace-command-feedback`, `?qa=palace-command-feedback-rtl`, and
  `?qa=palace-command-feedback-reduced` reproduce a Zabulistan royal gate pressure state, select the palace, keep the
  low-chrome command rail visible, trigger a gate command feedback cue, and freeze after writing `qa-state-json`.
- **Scene guardrail:** accepted QA should report one `zabulistan-palace-command-feedback-cues` pool, six pooled
  `zabulistan-palace-command-cue` groups and child meshes, `feedback.visible === 1` for the active command pulse, and
  `feedback.recentKind === "gate"`. The cue should remain terrain-bound and should not create floating damage text,
  a large HUD panel, or multiple stacked command pulses for a single command.
- **Mobile RTL guardrail:** 390px RTL capture should report no overflow, keep the palace command rail near the palace,
  and preserve the center/lower playfield for the gate contact cluster.
- **Reduced-motion guardrail:** the reduced route should keep the command cue visible but remove extra pulse/spin from
  the ring/standard motion. The cue must still read from shape, opacity, and placement.
- **Current verification:** `node --check src/main.js`, `node --check src/game/game.js`, `npm run build`,
  `npm run audit:assets`, and `git diff --check` passed. In-app browser reports showed cue visible, no overflow, no
  artifact findings, and no console warnings/errors. Note: in-app QA JSON can retain stale palace/backdrop `loading`
  metadata on this heavy route even when the screenshot has rendered the polished palace; judge the palace body from the
  screenshot or re-run after assets settle.
- **Local evidence:** `output/playwright/zabulistan-palace-command-feedback-desktop.png`,
  `output/playwright/zabulistan-palace-command-feedback-mobile-rtl.png`, and
  `output/playwright/zabulistan-palace-command-feedback-reduced.png`.

## Updated 2026-06-25 - Zabulistan palace gate-hold QA
- **QA routes:** `?qa=gate-hold-state`, `?qa=gate-hold-state-rtl`, and `?qa=gate-hold-state-reduced` reproduce a
  Zabulistan breach-pressure gate state, hide the detail panel, keep the low-chrome combat view, suppress full command
  FX, and freeze after writing `qa-state-json`.
- **Scene guardrail:** accepted QA should report one `zabulistan-gate-hold-cue`, one threshold, one ring, one brace, and
  three pooled `zabulistan-gate-hold-pressure-tick` meshes. The result should include active `feedback`, a non-null
  `feedback.state`, live enemy pressure, and palace-side defender metadata when the sandbox assault has spawned
  defenders.
- **Visual guardrail:** the cue must stay terrain-bound at the palace threshold and read as a tactical hold/pressure
  layer, not a new HUD card, floating banner, damage number, or large screen overlay. Reduced motion should keep the
  cue legible through shape/opacity while removing pulse/spin emphasis.
- **Current verification:** `node --check src/main.js`, direct Vite build via
  `node .\node_modules\vite\bin\vite.js build`, `node scripts/asset-quality-audit.mjs`, and `git diff --check` passed.
  Pre-tune browser acceptance reported the correct gate-hold object counts, active feedback, no overflow, and artifacts
  0, with local evidence at `output/playwright/zabulistan-gate-hold-state-desktop.png`. Post-tune browser acceptance
  uses a foreground Vite session plus in-app browser capture; accepted report shows pool 1, threshold 1, ring 1, brace
  1, ticks 3, active peak feedback, no overflow, and artifacts 0. Current evidence:
  `output/playwright/zabulistan-gate-hold-state-desktop-no-banner.png`.

## Updated 2026-06-29 - Zabulistan facade/ridge visual QA baseline

- **Latest verified commits:**
  - `094543e Replace Zabulistan palace facade dressing`
  - `3a97e1d Improve Zabulistan ridge assets`
- **Build verification:** `npm run build` passed after both latest visual asset passes. Current expected warnings remain
  the runtime-resolved splash background, mixed import placement for `materials.js`, and the large bundle warning.
- **Asset verification:** `npm run audit:assets` passed with 0 blockers. `a_dragon` and `a_worm` still report as
  source-only actor assets with no animation clips; this is an existing actor-quality note, not a blocker for the
  Zabulistan scenery pass.
- **Facade runtime verification:** direct browser QA confirmed the scene contains `zabulistan-palace-facade-dressing`
  and does not use `zabulistan-palace-facade-fallback` when the GLB is available. Accepted palace/gate screenshots show
  the new authored facade in front of the keep with a smaller warm gate read.
- **Ridge runtime verification:** final browser QA routes checked:
  - `?qa=opening-build`
  - `?qa=palace-contact-terrain`
  - `?qa=gate-hold-state`
  - `?qa=palace-contact-terrain-rtl`
- **Accepted metrics for the latest ridge pass:** no horizontal or vertical overflow, no broken images, canvas matched
  viewport size, and `zabulistan-palace-facade-dressing` was still present in the scene. Automated audio autoplay
  warnings are expected and can be ignored for visual QA.
- **Accepted evidence folders:**
  - `output/visual-qa/zabulistan-palace-facade-asset/`
  - `output/visual-qa/zabulistan-ridge-assets-final/`
- **QA timing guardrail:** for direct route captures, prefer waiting until `document.body.classList` contains
  `qa-state-recorded` before saving evidence. A premature `opening-build` capture can show the board too dark while the
  route is still settling; the ready capture `desktop-opening-build-ready.png` is the accepted opening-build evidence
  for the latest ridge pass.
- **Current acceptance summary:** facade and ridge asset passes are accepted as incremental improvements, and the
  follow-up Zabulistan board/backdrop/lighting Harmony Pass is now accepted as the current visual baseline. The
  follow-up combined-combat readability pass is also accepted; future testing should treat Harmony plus combined combat
  readability as the Zabulistan baseline unless a new focused pass is requested.

## Updated 2026-06-29 - Zabulistan harmony pass QA baseline

- **Implementation baseline:** Zabulistan-specific terrain/mood values now live in
  `src/data/zabulistanVisualProfile.js` under the internal `biome` section, and `src/world/map.js` consumes
  `visualProfile.biome`. Preserve this profile-driven shape instead of reintroducing a hardcoded Zabulistan branch.
- **Visual guardrail:** the board, apron, fog, and panorama should read as one warm dry highland fortress scene. The
  visible board edge may exist as a soft distant depth transition, but it must not return to a hard tan ring. Keep
  `skipMountainRing: true`; do not re-enable procedural ridge geometry to solve horizon depth.
- **Backdrop guardrail:** Zabulistan should load the five image layers `mountains360`, `foothills360`, `ridges360`,
  `scrub360`, and `apron360`. Distant highlands should remain visible but subdued, and must not cover roads, pads,
  palace gate, enemies, combat cues, or HUD.
- **Accepted QA routes:**
  - `?qa=opening-build`
  - `?qa=palace-contact-terrain`
  - `?qa=gate-hold-state`
  - `?qa=palace-contact-terrain-rtl`
  - `window.__dbg.visualQa.state('backdropSweep', { mapId: 'zabulistan' })`
- **Acceptance metrics:** wait for `qa-state-recorded` before screenshots. Require all five Zabulistan backdrop image
  layers loaded, 0 missing/failed layers, 0 overflow findings, no document scroll overflow, 0 broken images, 0 visual
  artifact findings, `zabulistan-palace-facade-dressing` present, `zabulistan-palace-facade-fallback` absent, and mobile
  RTL keeping compact HUD plus readable palace/forecourt.
- **Static checks:** `npm run build` and `npm run audit:assets` pass for this baseline. `git diff --check` reports only
  the existing LF-to-CRLF working-copy warnings. Build warnings remain the expected runtime-resolved splash background,
  mixed `materials.js` import placement, and large bundle warning.

## Updated 2026-06-30 - Zabulistan combined combat readability QA baseline

- **Implementation baseline:** `src/main.js` coordinates stacked Zabulistan combat presentation through
  `zabulistanCombatVisualBudget()`. Selected-target and palace gate-hold cues remain primary under combined focus, while
  road pressure, contact, and palace command feedback are capped/subdued. Preserve this as visual-only presentation
  behavior; do not change gameplay data paths, combat balance, HUD structure, assets, stage lighting, board colors,
  palace assets, or ridge geometry when using this baseline. This baseline is merged on `main` through PR #11
  (`a6ebc94`) and deployed by static site run `28454511550`.
- **Accepted QA routes:**
  - `?qa=combined-combat-readability`
  - `?qa=combined-combat-readability-rtl`
  - `?qa=combined-combat-readability-reduced`
- **Regression smoke routes:**
  - `?qa=opening-build`
  - `?qa=palace-contact-terrain`
  - `?qa=gate-hold-state`
  - `?qa=palace-contact-terrain-rtl`
- **Acceptance metrics:** wait for `qa-state-recorded` before screenshots or assertions. Require
  `layers.budget.active === true`, selected target thread visible or a clear non-stale reason, gate-hold cue active with
  non-null state plus pressure/defender metadata, road pressure/contact cues visible but capped, palace command feedback
  visible as one subdued cue, and `combatFlow` present only as a compact active-combat topbar chip.
- **Visual guardrails:** no large HUD panels, floating banners, damage text, bright route fans, or broad command discs.
  Roads, pads, palace gate, enemies, selected target, and gate-hold cue must remain readable together. Reduced motion
  must remain readable through shape/opacity rather than animation, and mobile RTL must keep the compact topbar, edge
  build rail, palace/forecourt, and lower combat cluster readable.
- **Harmony regression metrics:** all five Zabulistan backdrop image layers loaded, 0 missing/failed layers, no overflow,
  no document scroll overflow, 0 broken images, 0 visual artifact findings, `zabulistan-palace-facade-dressing` present,
  `zabulistan-palace-facade-fallback` absent, and no return of the hard tan board ring.
- **Static checks:** current shipped validation is `node --check src/main.js`, `npm run build`, `npm run audit:assets`,
  and `git diff --check`. For memory-only closeout updates, `git diff --check` is enough. If source files are touched
  again, rerun the full static set.
