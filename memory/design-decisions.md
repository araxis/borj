# Design Decisions

## D1 — Three.js over Babylon.js
Smaller bundle, mature post-processing examples, fine-grained control for procedural
geometry merging. Babylon's built-ins (GUI/physics) were not needed since UI is DOM and
physics is bespoke. *Alternative*: Babylon — rejected for bundle size and lock-in.

## D2 — Plain JS (no TypeScript)
One-session buildout favored zero type-friction; data-driven defs are self-documenting.
*Risk accepted*: refactors need care. JSDoc can be added incrementally.

## D3 — Custom debris physics instead of a physics engine (Rapier/cannon-es)
Destruction needs are: chunks fall, bounce, settle, vanish — gameplay never depends on
precise collision. A 100-line simulator (gravity + heightAt ground + restitution + sleep)
is faster, deterministic-enough, and zero-dependency. *Alternative*: Rapier WASM — rejected:
+1 MB, async init, overkill.

## D4 — WebAudio synthesis instead of audio files
Hard requirement: offline + no runtime downloads. Synthesized daf/ney/santur-like layers on
a Shur-like scale (neutral seconds ≈ dastgah quarter-tones) + all SFX. *Trade-off*: less
rich than samples; intensity-driven layering compensates.

## D5 — DOM UI instead of in-canvas UI
Persian RTL text, bidi punctuation, and accessibility are free in DOM; canvas text is not.
Cards/codex/panels are content-heavy → DOM wins. Game world stays canvas.

## D6 — Ledger-exact data layer with `ledgerNote` honesty fields
The ledgers mark allusive/late-tradition figures; we surface those notes in the UI rather
than flattening everything into "full Ferdowsi episodes" — cultural honesty requirement.

## D7 — Tower destruction via pre-organized layers, not runtime mesh fracture
Towers are built in three layer groups (base/mid/crown). Stage 1 drops the crown rigidly;
stage 2 topples mid + bursts base into pooled chunk meshes. Reads as "staged collapse of an
important building" (requirement) at a fraction of the cost of CSG fracturing.

## D8 — Deterministic world gen per map id
Seeded RNG + value noise; same map every session → fair, debuggable, save-friendly.
Authored road control points; pads auto-placed deterministically along roads.

## D9 — Heroes as commanders (assignment), never walking units
Matches the brief. The bond formula is intentionally transparent
(0.12·affinity + 0.25·story + 0.15·weapon + 0.10·role + 0.08·age) and rendered in the UI,
so players learn the lore by optimizing it.

## D10 — Enemy hp values as weight classes + runtime HP_SCALE
Ledger-derived hp (320–9000) expresses narrative weight; combat scale is applied at spawn
(0.26 / 0.38 boss). Verified via headless sim. Keeps codex numbers impressive while combat
stays Kingdom-Rush-paced. (First playtest had zero kills — this fixed it.)

## D11 — Background tab = auto-pause
rAF-driven loop stops in hidden tabs. Accepted as desirable for a game. Discovered during
automated testing (tab-hidden broke wait-based verification → switched to headless
simulation via `window.__dbg`).

## D12 — Tower cards reuse place atlas art
No tower atlas exists; lore-linked places provide authentic art for 26/32 towers; the rest
use role emblems. Revisit if a towers atlas is produced.

## D13 — 20 campaign maps (> the 15 required)
Every `campaign: true` place gets a map so every hero unlock has a home. Wave/path authoring
is data-only, so the extra maps were cheap.

## D15 — Stay on Three.js; quality comes from assets, not engine swap
User proposed migrating to Babylon.js for "more power". Rejected: both wrap the same GPU
APIs with equal rendering capability; our ceiling was procedural-primitive models and
lighting, not the library. The ~2-week port would deliver zero visual gain. Instead:
GLTF asset pipeline (CC0 skeletal characters), PBR photo textures, real music — all with
procedural fallback so offline/no-asset builds still run. See progress.md asset-pipeline
entry and CREDITS.md.

## D14 — Vite `base: './'`
Relative URLs make the same build work on GitHub Pages project sites, user sites, and
file-less static hosts without configuration.

---
## Reconciled 2026-06-17 — decisions added this arc

## D16 — GLB horse mounts, NOT a combined horse+rider GLB
Mounted soldiers ride the existing `a_horse` GLB with the procedural rider seated on top
(`spawnAsset` in creature.js `buildSoldierModel`; the `gltf` soldier path drives the gallop).
A combined horse+rider GLB was rejected — the rider varies per unit type/assigned commander, so
baking them together throws away the modular rider + the procedural animation system. Procedural
`buildHorse` stays as a never-break fallback.

## D17 — GTAO contact AO high-tier only; per-biome procedural grade now, LUTs later
Ground-contact ambient occlusion (GTAOPass) adds a depth/normal prepass, so it's gated to the
high quality tier. Per-biome color grading is done with a procedural shader (contrast/saturation/
shadow-lift/vignette/chromatic-aberration) now; baked `.cube`/strip LUTs are a later asset upgrade
(the GradePass already has the plumbing).

## D18 — Eased procedural animation + a real elbow joint over raw sin/linear
Procedural humanoid animation was raw sin/linear (lifeless). Added `src/fx/ease.js` (easing +
frame-rate-independent damp) and split the arm into upper+forearm pivots (`rig.foreL/foreR`) so
arms bend through a swing. Attack now has anticipation→strike→follow-through+recoil; idle breathes
and shifts weight. The bar is "smooth and natural", explicitly per user feedback.

## D19 — Combat juice as engine primitives (hit-stop / bloom-pulse / slow-mo)
`engine.hitStop(d)` freezes the sim while rendering continues (the biggest source of "weight");
`bloomPulse(s)` flashes then eases to the per-biome baseline; `slowMo(scale,dur)` is the cinematic
ramp for epic moments (boss arrival, victory, defeat). Screen shake amplitude raised (max 3.0).
These are reusable engine methods, not per-call-site hacks.

## D20 — Commit hygiene (BINDING, user rule)
Published repo carries NO AI wording anywhere; commits must NOT include the default
`Co-Authored-By: Claude` trailer; author = Meisam Alifallhi. PRs are squash-merged. The one allowed
external-credit exception is Meshy.ai CC-BY in CREDITS.md.

## D4 amended (2026-06-17) — music is now sample-based
D4 ("WebAudio synthesis instead of audio files") still holds for ALL SFX, but PR #5 added 3 bundled
**CC-BY music mp3s** (Kevin MacLeod, menu/calm/battle) crossfaded by scene+intensity, with the synth
director as a never-silent fallback. Still fully offline (mp3s are bundled, not runtime downloads).
The 3 cinematic audio swells the slow-mo beats want (boss/victory/defeat) are still unbuilt — they
can be synthesized in audio.js (no files) or sourced CC0; see auto-memory `wow-asset-gaps`.

## D21 — Image backdrops use curved panorama bands, not flat planes
The 2026-06-20 depth layer revived painted backdrops but rejected flat rectangular scenery planes.
Large flat planes and alpha/depth/shadow combinations were the root of the black-rectangle artifact
class. The live `DistantBackdrop` uses inward-facing curved quadrant bands (`far` and `mid`) plus haze,
with no shadows, no depth writes, low opacity, and explicit `visualLayer: "backdrop"` tagging. The
procedural apron and 3D range ring remain as fallback/foreground depth.

## D22 — Boss Saga rewards are presentation/profile records, not permanent balance boons
Boss Saga adds trial variants, banners, compact HUD chips, codex records, and profile-only
broken/hardened/defeated state. It deliberately does not add permanent combat rewards in this slice:
the layer gives narrative memory and moment-to-moment pressure without destabilizing tower economy,
palace boons, or hero command balance.

## D23 — Debug visual states must be deterministic and screenshot-safe
QA states under `window.__dbg.visualQa` may bypass arrival delays, suppress battle-start banners, and
force boss results synchronously. That is intentional and sandbox-only: visual tests need the requested
state to be present now, without racing delayed banners, texture decode, or combat timers. Player flow
keeps the normal staged arrival/trial/result timing.
