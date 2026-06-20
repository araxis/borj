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
- **Browser path:** use Chrome with the app at `http://127.0.0.1:5180/#sandbox`; Playwright can use an
  installed Chrome executable if the bundled Playwright browser is missing.
- **Debug QA states:** `window.__dbg.visualQa.state(name, opts)` now covers:
  `backdropSweep`, `palaceCommand`, `heroCommand`, `gateAssault`, `bossArrival`, `sagaTrial`,
  `bossBroken`, `bossHardened`, `fogFail`, `victory`, `defeat`, and `mobileRtl`.
- **Acceptance metrics:** after every forced visual state, check:
  `window.__dbg.visualQa.metrics().scroll.overflow === false`,
  `window.__dbg.visualQa.overflow().length === 0`, and
  `window.__dbg.visualQa.metrics().artifacts.length === 0`.
- **Backdrop checks:** `window.__dbg.visualQa.backdrops()` must show 8 loaded image layers for curated
  maps after texture decode, 0 failed, and 0 missing. A brief `loading` state immediately after map
  switch is expected; wait for texture load before judging screenshots.
- **Mobile RTL chip checks:** at 390x844, active saga chip, toast, boss banner, topbar, and bottom wave
  button must not overlap. The current mobile toast offset intentionally moves toasts below an active
  saga chip.
- **Generated evidence:** screenshots under `artifacts/visual-qa/` are local QA evidence and should not
  be committed unless explicitly requested.
