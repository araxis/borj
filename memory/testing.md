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
- **Zabulistan gate contact regression:** the `zabulistanForecourt` state should include a visible
  `zabulistan-gate-contact-grit` group with 2 children and 46 instanced stone crumbs. It should read as localized broken
  ground at the gate threshold, not a broad transparent shadow or oval stain, and QA should keep artifacts 0 and overflow
  0 on desktop, palace-selected, and mobile RTL captures. Current evidence:
  `artifacts/visual-qa/zabulistan-gate-contact-desktop.png`,
  `artifacts/visual-qa/zabulistan-gate-contact-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-gate-contact-selected.png`.
- **Zabulistan gate combat regression:** use
  `window.__dbg.visualQa.state('zabulistanGateCombat', { mode: 'royal' })` for wave/combat screenshots. In cold browser
  contexts, warm `loadZabulistanProps()` and `loadPalace('zabulistan')` before creating the state so screenshots show the
  authored forecourt and custom palace rather than the fallback. Expected QA: 14 attackers, 3 defenders, custom
  `palace-zabulistan`, `zabulistan-gate-contact-grit`, `zabulistan-road-shoulder-blend`,
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
- **Crawler guardrail:** `Azhdaha.glb` and `Worm.glb` currently have skins/armatures but 0 animation actions. Until they
  are re-exported with real idle/walk/attack/death or equivalent clips, `window.__dbg.enemyTest('dragon', 'walk')` and
  `window.__dbg.enemyTest('worm', 'walk')` should return `animType: 'serpent'` and `glb: false`.
- **No fake static motion:** do not reintroduce a generic static-GLB bob/weave/crawl branch for production actors. If an
  asset has no clips, either fix it in the asset pipeline or use a deliberately rigged fallback model.
