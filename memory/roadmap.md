# Borj v-Next — "The Living Host"

Make every player-facing unit feel hand-crafted and every battle feel alive. Generated from a
5-dimension code audit (2026-06-14). Three pillars:
1. **Visual assets**, in the user's order: **soldiers → towers → buildings** — move from one tinted
   `q_knight` clone + procedural shells to distinct, animated silhouettes.
2. **Alive in combat** — towers/garrisons/FX and hero/soldier *active* powers that react in real time.
3. **Access & depth** — cheap accessibility/UX wins + difficulty modes, wave modifiers, tower synergy.

Front-load cheap accessibility + the multi-clip animation unlock, then run the soldier→tower→building
asset escalation as the spine.

## Ground truth (what's already good — don't redo)
- Soldiers: **12/17 are GLTF** (q_knight base, tinted per role, Persian weapons, Walk/Idle/Attack/Death clips).
  5 stay procedural by design (spear-maidens, cavalry, drummers, banner-bearers, acolytes — identity/animation).
- Heroes: **100% procedural** (36 lore-grounded specs in creature.js) — the visual-polish ceiling.
- Lion + Elephant: done via Meshy (walk only so far).
- Towers: 32 towers, mostly procedural shells (every archer = a cylinder); per-age = subtle scale only.
- World: hand-authored citadels are good; village fabric is **KayKit European** (cultural clash).

## Milestones

| Milestone | Goal | Steps |
|---|---|---|
| **M0 — Polish & Access** | Cheap, asset-independent wins; ship while Meshy assets generate | 1,2,8,9,10 |
| **M1 — Soldiers Alive** ⭐#1 | 3–5 rigged archetypes replace the q_knight clone; armor layering; animated cavalry; free lion/elephant multi-clip | 3,4,5,6,7 |
| **M2 — Towers Alive** ⭐#2 | Fire columns, aura/range rings, role icons, garrison visibility; then bespoke per-tower (+per-age) GLBs; animated gates/traps | 11,12,13,16,17,18 |
| **M3 — Deeper Battles** | Tower adjacency synergies; player-triggered hero/soldier actives | 14,15 |
| **M4 — Legends & Bosses** | Meshy bosses; 6–8 iconic hero humanoids; hero-branded garrison guards | 19,20,21 |
| **M5 — Persian World & Hardening** ⭐#3 | Bespoke Persian village/caravanserai kit; weather/atmosphere; perf fix; cross-browser + late-map QA | 22,23,24,25 |

## Sequenced steps
1. **Accessibility & toast-leak fix** (ux, low/high, me) — toast auto-dismiss+fade; ARIA roles; Esc-closes-modal + focus trap.
2. **Keyboard shortcuts + onboarding splash** (ux, low/high, me) — T/H/S/R/F/Esc; 3–4 bullet welcome (EN/FA).
3. **Generate 3–5 soldier archetypes in Meshy** (assets, high/high, user) — heavy / light-archer / female (+robed/mounted), multi-clip.
4. **Wire archetypes through ASSET_SOLDIERS + calibrate walkStride** (assets, med/high, me).
5. **Lion & Elephant multi-clip re-export** (assets, low/high, user) — idle/run/attack/death; zero code.
6. **Diversify soldier armor via procedural layering** (assets, med/med, me).
7. **Animate mounted cavalry (rider+horse sync)** (assets, med/med, both).
8. **Difficulty modes Easy/Normal/Hard** (gameplay, low/high, me).
9. **Random wave modifiers** (gameplay, low/med, me).
10. **Prestige: campaign→endless continuity** (gameplay, low/med, me).
11. **Fire-tower particle columns** (world, med/med, me).
12. **Aura/range rings + role icons on towers** (world, med/med, me).
13. **Garrison-unit visibility on barracks towers** (world, med/med, me).
14. **Tower synergy system (adjacency auras)** (gameplay, med/high, me).
15. **Hero & soldier active powers** (gameplay, med/high, me).
16. **Generate 32 bespoke tower GLBs + assetTower()** (assets, high/high, both) — static props, not rigged.
17. **Per-age tower model variants** (assets, high/med, both) — only after 16 proves value.
18. **Animated tower state: gates, traps, beacons** (world, med/med, me).
19. **Generate 3–4 Meshy boss enemies** (assets, med/med, both) — Afrasiyab, Azi Dahaka, Ahriman.
20. **Upgrade 6–8 unique hero GLTF humanoids** (assets, high/high, both) — Rostam, Zal, Fereydun, Kaveh, Simurgh, Zahhak…
21. **Hero-bind garrison guard identity** (world, med/med, me).
22. **BUILDINGS: bespoke Persian village/caravanserai kit** (assets, high/med, both).
23. **Ambient weather & atmosphere** (world, med/med, me).
24. **Texture re-upload forensics** (tech, med/med, me).
25. **Cross-browser + late-map balance QA** (tech, high/high, me).
26. **DONE — Persian weapon silhouettes in `makeWeapon()`** (visual-assets/cross-cut, low/med, me) — now the **FALLBACK**.
    Rewrote `src/models/humanoid.js`: curved shamshir, flanged gorz, crescent tabarzin, socketed neyzeh, kaman bow.
    Stays as the guaranteed fallback for any unit without a GLB weapon (heroes, enemy humans, q_knight laborers).
27. **Meshy Persian weapon GLB SET — PRIMARY weapon path** (visual-assets, med/high, both) — **M1-adjacent (now)**, NOT
    deferred. The detailed Meshy soldier bodies make the procedural weapons look too simple, so weapons go Meshy too.
    Generate the common Persian weapons as STATIC GLB props (skip Meshy's rig/animate): **shamshir, neyzeh, kaman, gorz,
    tabarzin, staff** first (the ones soldiers visibly hold), then halberd/axe/hammer/lantern/dagger/banner/lance, then
    hero signatures (Rostam's gorz-e-gāvsar, Kaviani standard). Optimize via @gltf-transform (webp/1024, no Draco; a
    static weapon can be <100 KB). I add a **`weaponModel(kind)` helper**: returns a cloned GLB when `a_wpn_<kind>` is
    loaded, else falls through to `makeWeapon(kind)` — so `assetCharacter`'s hand-bone attach + Mixamo flip + scale-comp
    are reused verbatim and the procedural fallback (step 26) stays intact. Validate ONE (shamshir) end-to-end before batching.

### Weapons — Meshy primary, procedural fallback (cross-cutting layer)
Weapons ride ON soldiers/heroes, so they don't disturb the soldiers→towers→buildings spine. **Decision (user, after seeing
the Meshy soldiers): weapons go Meshy too** — a detailed warrior holding a 5-primitive blade is a mismatch. So step 27
(Meshy weapon GLB set) is the PRIMARY path and moves to **now/M1-adjacent**, not M4. Step 26's procedural rewrite is NOT
wasted — it's the permanent FALLBACK (fallback discipline) for every unit that never gets a GLB weapon. Skip CC0 weapon
packs (European fantasy, no shamshir/gorz/tabarzin). Validate the shamshir first (most-used weapon), then batch the set.
(NOTE: `makeWeapon` is in `humanoid.js`; the attach/flip/scale-comp + the new `weaponModel` helper live in `creature.js:14-41`.)

## Quick wins (start anytime, no assets)
Toast fix · ARIA/Esc/focus-trap · keyboard shortcuts · onboarding splash · difficulty modes · wave modifiers ·
prestige button · lion/elephant multi-clip re-export · fire-tower particle columns · **Persian weapon silhouettes
(curved shamshir, flanged gorz) in makeWeapon — zero deploy, lifts every weapon-bearer**.

## Risks / guardrails
- **Humanoid rig ≠ quadruped.** Validate ONE soldier archetype end-to-end (faces +Z via ROT_FIX, not headless,
  no T-pose upperarm fix needed, optimizes <0.8 MB) BEFORE the user batches the rest.
- **Per-archetype walkStride** must be calibrated (lion 0.96 / elephant 2.6) or foot-skate returns.
- **Asset-count explosion:** 32 towers × 5 ages = up to 160 GLBs — do 32 bases first, prove value before per-age.
- **Deploy size:** all static/bundled — hold @gltf-transform budgets (webp/1024, no Draco); audit total after each milestone.
- **Towers/buildings are STATIC props** — liveliness = in-engine banner/flame/gate motion, not skeletal clips.
- **Fallback discipline:** keep `assetCharacter(...) || procedural` on every swap; do NOT delete procedural fallbacks.
- **Balance:** new difficulty/modifier/synergy/active systems touch combat math; gate v-Next on step-25 late-map QA.

## Reconciled 2026-06-17 — current state
The whole **visual-asset spine is DONE and shipped**: weapons (step 27), soldier archetypes + animated/GLB-mounted cavalry (steps 3–7), towers + FX + garrison visibility (steps 11–13,16–18), bosses + hero GLBs (steps 19–21), buildings (step 22). M0 polish (difficulty modes, wave modifiers) shipped; verify accessibility/shortcuts/prestige against the code before calling those individually closed.
Work then went BEYOND this roadmap into a deep quality pass (auto-memory `wow-improvement-plan`): eased procedural animation + a real elbow joint, combat hit-stop/shake/muzzle-flash/recoil, AAA render (SMAA + GTAO contact AO + per-biome cinematic grade), cinematic UI entrances, and slow-mo epic moments — PRs #6/#7 — plus the cavalry GLB-mount overhaul (PR #8).
**Still genuinely OPEN (now tracked in auto-memory `wow-asset-gaps`):** per-biome ground PBR + rough/AO, per-biome LUTs, 3 cinematic audio swells, desert/steppe horizon-range tiles, the remaining ~26 hero GLBs, a caparisoned Persian war-horse, tower-destruction rubble kit. The full original 25-step list lives above as the historical plan.

## Updated 2026-06-20 — current next-layer state
The roadmap has moved from asset acquisition into systems + visual clarity:
- **Closed in this wave:** palace boons/muster on all 20 maps, hero command actives, Boss Saga records/UI,
  compact mobile HUD and language/speed controls, artifact guards, DistantBackdrop runtime + all 20 manifest
  entries/assets, mobile RTL no-horizontal-scroll work, debug QA hooks for forced visual states.
- **Verification gate now in use:** `npm run build`, `window.__dbg.visualQa.metrics()`,
  `window.__dbg.visualQa.overflow()`, artifact audit, forced backdrop/boss/palace/hero/victory/defeat states,
  and mobile 390x844 RTL screenshots.
- **Next roadmap item:** art-direct and tune the backdrop image sets per biome. The runtime is in place; the
  quality ceiling is now image composition, palette, contrast, and ensuring backdrops stay below gameplay
  contrast.
- **Still open after that:** real gameplay sims for boss saga success/fail paths, cinematic audio swells,
  remaining optional hero GLBs/war-horse/rubble assets, and a final cross-browser/performance pass.
