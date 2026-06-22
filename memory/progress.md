# Progress Log (chronological)

## 2026-06-12 — Session 1: full prototype buildout

### Setup
- Read the three root atlas ledgers (source of truth) and measured atlas PNGs
  (heroes 1254×1254 6×6; enemies 929×1693 5×6; places 914×1720 5×6).
- Scaffolded Vite + Three.js project (`base:'./'`, port 5180), copied atlases to
  `public/atlases/`, created `memory/` docs.

### Data layer (src/data/)
- Transcribed all 36 heroes, 30 enemies, 30 places from the ledgers exactly
  (positions, EN/FA names, sourceRefs, short+detailed descriptions, ledgerNote honesty
  fields) + added gameplay fields and Persian short summaries (`shortFa`/`detailFa`).
- Designed 32 tower lines, 5 ages (Ancient→Modern Mastery), 18 soldier types,
  12 lore-grounded fusion recipes, 20 campaign maps with authored road control points,
  full EN+FA language resources incl. 20 campaign intros.

### Engine & world
- Engine (renderer/shadows/ACES/bloom/mood/loop/shake), RTS camera (pan/orbit/zoom/
  follow/reset/eased), settings + save stores, i18n with RTL + Persian digits,
  procedural WebAudio engine (Shur-like music director + ~20 synth SFX).
- Seeded noise, 10 biomes, vertex-colored terrain, Catmull-Rom road ribbons with
  flagstone/earth canvas textures + instanced curbstones, props (cypress/palms/reeds/
  rocks instanced), spawn gates, domed citadel, pad placement, GameMap assembly.

### Models
- materials.js: shared canvas-texture materials + per-material MeshBuilder merging.
- towerkit.js: Persian architecture parts + 32 recipes with age growth and
  base/mid/crown destruction layers; animated banners (CPU cloth sway), flames, spinners.
- humanoid.js: rigged parametric humanoid (armor/helmet/hair/beard/weapon/shield/cloak/
  female/crown/feather) incl. Rostam's two-branched beard; walk/idle/attack anims.
- creature.js: div/dragon/serpent/worm/lion/elephant/horse + 30 enemy and 18 soldier
  model recipes (Zahhak's animated shoulder serpents).

### Gameplay
- Tower entity (ages, hero bond formula, role attacks, garrison, staged destruction),
  Enemy entity (path follow, damage model, statuses, melee vs blockers, siege strikes,
  ~30 ability keys, bosses), Squad/Soldier (block/patrol/skirmish/support, rally,
  respawn, 16 squad abilities), projectiles (6 kinds + lash), particle system,
  debris physics, wave director, Game orchestrator (economy/auras/win-lose/endless).

### UI
- Persian-epic stylesheet (carved frames, gold/turquoise, RTL mirror rules),
  HUD (top bar, 2-col card grid with Towers/Heroes tabs, right detail panel with
  bond preview list, wave/speed/pause controls, toasts, boss banner),
  codex (5 tabs, atlas art, EN/FA), settings overlay, menus (main/campaign/intro/end).

### Fixes found via browser verification (Chrome automation)
1. **Road ribbon invisible** — triangle winding faced down → rewound indices (road.js).
2. Three stray non-ASCII characters in hex literals/CSS (creature.js ×2, terrain.js,
   road.js, style.css) — fixed.
3. **Codex opened behind main menu** — z-index 45 for codex/settings overlays.
4. **Game appeared frozen during waves** — diagnosis: hidden automation tab stops rAF
   (auto-pause). Not a bug; switched QA to headless `game.update` simulation via
   `window.__dbg` (added to main.js).
5. **Balance: zero kills wave 1** — ledger hp values too heavy vs tower DPS → added
   `HP_SCALE 0.26` / `BOSS_HP_SCALE 0.38` (enemy.js), rescaled wave costs, early-cheap
   wave bias. Re-sim: map 1 cleared with ~2 lives lost. 
6. Raised default hemisphere light 0.75→0.95 for model readability.

### Verified end-to-end (see testing.md for the full matrix)
Boot ✓ campaign ✓ map intro ✓ build/upgrade/sell ✓ waves/combat/bounty/lives ✓
hero bonds (Rostam 62%, Kaveh 118%) ✓ soldiers+blocking ✓ fusion (Kaviani Uprising
Forge) ✓ staged destruction + debris ✓ victory + unlocks + profile save ✓ endless ✓
FA RTL + codex ✓ settings ✓ production build (228 KB gzip) ✓ logic perf 1.7 ms @ 89
enemies ✓.

### Atlas crop fix (user-reported)
- User screenshots showed hero card crops bleeding into neighboring cells (Zal showed
  Simurgh's wing; Rakhsh showed the next row). Root cause: the painted atlases have
  **non-uniform grids** — uniform `(col-1)/cols` math was wrong.
- Measured true separator lines per atlas via low-variance row/column scans
  (PowerShell + System.Drawing), stored them as `grid {w,h,xs,ys}` on each `*_ATLAS`
  descriptor, and rewrote `core/atlas.js` to exact fractional-rect CSS positioning with
  a 4 px inset. Details + measured values: content-ledger.md § Atlas grid geometry.
- Verified in codex across all three tabs (Zal/Rostam/Rakhsh zoomed, enemies, places):
  every cell now framed cleanly. Rebuilt dist.

### Persian localization pass (user-requested)
- Rewrote `lang/fa.js` in fluent modern Persian (e.g. طلا نه زر، توقف نه درنگ، هزینه نه بها،
  ادغام نه هم‌آمیزی، گرافیک نه نگاره) — style guide noted at the top of the file.
- Achieved FULL FA coverage via per-id keys in fa.js looked up with the new `tOpt(key,
  fallback)` helper (English canon stays in the data files):
  `tag.*` (~58 affinity tags), `mod.*` (26 hero modifier labels), `special.*` (36 hero
  signature abilities), `ability.*` (30 enemy abilities), `sability.*` (16 squad abilities),
  `ledgernote.*` (~26 source notes), `storyref.*` (~140 story references for heroes,
  enemies, places, towers, soldiers, fusions). en.js gained tag.*/mod.* display names.
- UI wiring: hud.js/codex.js/menus.js now localize special/ability/tag/mod/ledgerNote/
  sourceRef through tOpt; zero-value hero mods hidden.
- Buttons (.gbtn/.tabbtn/.iconbtn) now center their labels horizontally AND vertically
  (inline-flex) — fixes Persian glyph baseline offset; letter-spacing reset in RTL.
- Verified in browser (FA): main menu, codex (Rostam special, Zahhak abilities + story
  refs in Persian), battle HUD with Persian digits, hero panel tags/mods, mode hints.

### Enemy detail + inspection pass (user-reported: "what is this?" lion blob)
- **Facing bug fixed**: quadrupeds and serpents were built with heads at -Z while enemies
  move along +Z — all beasts/serpents walked backwards. Models now face +Z (convention
  documented at the top of creature.js).
- **Quadruped overhaul** (lion/horse/elephant): two overlapping muscle masses + belly,
  two-segment legs with knees and paws (quadLeg), detailed heads (skull, muzzle, dark
  nose, jaw, ears, eyes, fangs), drooping segmented tails. Lion: layered mane ringing the
  head + 8 mane spikes + chin ruff + tail tuft. Elephant: disc ears, two-segment curved
  tusks, 5-segment curling trunk, forehead dome, headdress band, leg wrinkle rings,
  toenails, war saddle with rails/tassels. Horse: mane ridge, forelock, tail hair, hooves,
  chanfron when armored.
- **Serpent family**: heads now LEAD; dorsal ridges, belly plates, brow scales, flicking
  tongues. Dragon: horns, nostril glow, clawed feet, boned wings. Worm: annelid rings,
  toothed ringed maw with gullet, mandibles.
- **Divs**: shoulder fur tufts, wrist bands, heavy brow, gut, back spikes (Sepid/brute),
  5-segment shoulder serpents with eyes/fangs on Zahhak.
- **Humanoids**: hands + forearm wraps, faces (eyes/brows), belts with gold buckles,
  scabbards (sword/dagger) and quivers with arrows (bow), swaying skirt panels.
- **Animation**: 4-beat diagonal gait with knee flexion + body bob/roll, head looks
  around, jaw snarls, tails sway, trunks curl, tongues flick, wings beat; biped walk adds
  march lean, head glance/bob, skirt + cloak sway; death now topples with a small bounce.
- **Enemy inspection**: every enemy has a generous invisible pick-proxy (colorWrite:false
  cylinder); clicking an enemy auto-pauses the battle (tactical inspect), opens its story
  card (with live HP bar) and follows it with the camera; closing the panel / clicking
  empty ground / selecting a tower resumes. Manual pause is respected (no auto-resume).
- Verified: all 48 enemy+soldier models build without errors; click→pause→card flow
  tested via synthetic pointer events; close-up screenshots of lion + Lahhak approved.
- NOTE (perf watchlist): detailed models are ~35-50 meshes each; if fps suffers at 80+
  enemies, merge static decorations per animated group (BufferGeometryUtils) at build time.

### "Higher level" world upgrade (land citadels, living environments, de-blockify)
- **Famous land citadels** (`src/world/citadels.js`): every campaign map's heart is now a
  large Shahnameh-grounded landmark with its OWN defense mechanism (CitadelGuard):
  apadana (Persepolis/Takht-e Jamshid roofless column terrace with double-bull capitals,
  lamassu guardians, winged farr disc — Estakhr/Madayen; Immortal arrow volleys),
  zabul-keep (ox-head mace monument; mace shock AoE), white-citadel (Dez-i Sepid twin
  gatehouse; ballista), fire-temple (chahar-taq + eternal flame; fire nova), simurgh-spire
  (nest crag + glow feathers/halo; feather darts + heals), damavand-bastion (chained snow
  crag; chain lash + slow), royal-court (turquoise dome palace + iwan + pool; twin archer
  volleys), arash-bow (colossal bow monument; rare piercing border shot). Style map in
  STYLE_BY_PLACE; guard damage scales with map order. Footprint drives pad/prop/flatten
  exclusion in map.js.
- **Living environments** (`src/world/ambient.js` + map.js): meandering rivers with
  animated flowing water carved into terrain (biomes river/wetland/valley/forest), stone
  arch bridges auto-placed where roads cross, hazy distant mountain ranges ringing every
  land, drifting cloud sprites, ground mist (forest/snow/wetland/mountain), six birds
  circling the citadel with flapping wings, gazelles/deer that graze, wander, and FLEE
  from approaching enemies. Mazandaran forest densified (58 trees + 34 bushes = jungle).
- **Lighting overhaul**: scene.environment via PMREM RoomEnvironment (gold/bronze finally
  gleam; shadow sides no longer black), hemisphere 1.3 default with warm ground bounce,
  per-biome overrides retuned. This fixed the "black citadel" problem — big architecture
  needs IBL fill.
- **De-blockify pass**: lathe-profile cypress, 3-blob broadleaf canopies, arched palm
  fronds, icosahedron boulders, low bushes, rounded feet/paws (humans + beasts), smoother
  domes/columns (12-20 segments).
- **Camera feel**: zoom-toward-cursor wheel, velocity/inertia keyboard pan with glide
  stop, cinematic 4.2 s fly-in from the enemy gate to the citadel at battle start
  (skipped under reduced motion), `_apply()` refactor.
- **Deeper lore**: `intro2.*` per-land Shahnameh context (EN+FA, all 20 maps) shown under
  the map intro and in codex place pages.
- Verified: apadana + zabul-keep screenshots approved; river+bridges+birds+gazelles
  spawn on Madayen; citadel guard kills pinned target (volley buffed 4→6 shots); full
  wave sim clean (0 leaks, no errors); production build passes.

### "Real modern 3D" pass (sky, color, dense Shahnameh-flavored worlds)
- **Skydome shader** (engine.js): gradient zenith→horizon derived per-mood + real sun
  disc with halo; rides the camera, fog-immune. Exposure 1.12.
- **Sharper color**: all biome ground palettes re-saturated (vivid greens, golden steppe,
  warm desert); terrain gets a tiled high-frequency soil **detail texture** multiplied
  under vertex colors.
- **Ground cover**: instanced grass CLUMPS (cones — planes read as confetti from above;
  lesson learned), 350–1300 per biome, color-varied, dry-gold on steppe/desert.
- **Shahnameh land props** (props.js, per-biome gating): pomegranate orchards with red
  fruit, poppy field patches, carved relief steles, ruined column clusters with fallen
  drums, nomad camps (black tents, tether post, campfire ring with animated flame +
  smoke from game loop), **Nashtifan-style vertical-axis windmills with turning sails**,
  roadside derafsh banner waypoints (animated cloth, 10/map).
- **Ambient life additions**: sheep flocks (7, drifting herd center, step-bob),
  fireflies (additive pulse — forest/wetland/river) / butterflies (bright lands).
- **Citadel ornament pass**: pennant garlands (catenary flag lines) on apadana/royal-
  court/white-citadel; apadana gains parapet lamassu procession, glowing tribute-relief
  panels, terrace torch row; universal buried foundation under every citadel style
  (no slope overhang).
- **Fixes**: instanced boulders went black with the canvas-noise material → plain stone
  colorMat; soldier double-hit crash when first hit kills (die() nulls target) →
  local capture + alive guards.
- Verified: Madayen apadana vista (sky/sun/garlands/river), Zabulistan living meadow
  (poppies, windmill, steles, banners, ruins, grass), 3-wave regression 0 leaks 0 errors,
  production build 257 KB gzip.

### Melee combat + character/landmark rework (user: "they pass through soldiers / dolls / toys / landmarks small")
- **Real melee engagement**: ground enemies now STOP at contact — every 0.12 s they scan
  for any living soldier within 2.0 units and lock into a duel (no more walking through
  lines). Duelists square up (facing preserved over road tangent), several enemies can
  pile onto one soldier, soldiers gang up on engaged enemies when no free target exists,
  and a dying soldier releases ALL enemies locked on them.
- **Fight feel**: melee lunge animation (model pushes toward the foe and back on every
  swing, both sides), spark bursts at the clash midpoint, new `audio.clank()` steel ring
  (throttled 90 ms via game.meleeClash).
- **De-dolled humans** (humanoid.js): longer legs (hips 0.9), knees + greaves on armored
  troops, layered cuirass + waist tassets, neck, broader shoulders with shaped pauldrons,
  longer arms, shield rim ring, spangenhelm cheek + nape guards; anim baselines now use
  rig.tY.
- **De-toyed beasts** (creature.js buildQuad): grounded stance, tucked waist, dorsal
  stripe two-toning, leg splay, brow ridge + cheeks, optional fang rows + tongue, bigger
  paws. Lion: leaner/longer body, shoulder hump, two-tone double-layer mane with two
  spike rows, elbow tufts, longer tail.
- **Monumental citadels**: CITADEL_SCALE = 1.6 — architecture authored small then scaled;
  human-scale **garrison guards posted on multiple floors** (guardPosts per style:
  tower tops, terrace edges, gates, halls — 4-5 per landmark, idle-animated in the game
  loop). citadelFootprint() includes the scale so pads/props/flatten adapt.
- Verified: lion-vs-spear-maiden duel screenshot (engaged, facing, shield up), monumental
  Estakhr apadana with guards on three different floors, 3-wave regression with duels
  active (no errors; lives 16/20 — melee soaks but towers still matter). NOTE for tuning:
  citadel guard damage vs lions etc unchanged; melee balance may need a pass after
  playtesting (enemies now spend time fighting instead of leaking instantly).

### Sandbox / test mode (for trying every upgrade)
- `Game({sandbox})`: unlimited gold (tops up to 999,999 each frame below 500k), no life
  loss (onEnemyReachedEnd early-returns), entire 36-hero roster unlocked.
- Enter via URL `#sandbox` (auto-detected in startBattle) OR press **G** in-battle to
  toggle (game.toggleSandbox() — re-renders hero cards, shows toast). Verified: tower
  upgraded 0→4 (Modern Mastery), campaign-locked hero (Fereydun) assignable, gold refills
  after draining, lives stay 20 through a full leaking wave, no errors.

### Hero rank tree + visible upgrade trees + dramatic age transformations
- **Hero upgrade tree (persistent)**: 4-rank ladder Warrior→Veteran→Champion→Legend
  (HERO_RANKS in heroes.js; mults ×1/1.3/1.65/2.1; costs 300/700/1400 gold). Rank
  multiplies how strongly the hero's mods apply in tower.getStats; saved per-hero in the
  profile (save.js heroRanks, getHeroRank/setHeroRank) so promotion persists across
  battles. game.upgradeHeroRank() pays gold, refreshes the commanded tower + garrison,
  bursts gold VFX. Hero standard ring colors by rank (bronze/silver/gold/glow); hero
  cards show ★ stars.
- **Upgrade tree UI** (hud.js _ageTree/_rankTree + .utree CSS): vertical node tree with
  done/current/next/locked states, glowing current node, costs + ×mults per node,
  per-age visual descriptions (agefx.*), fusion recipes drawn as dashed side-branches off
  the current age, and inline Buy buttons (next age on built towers / next rank on
  heroes). Shown in tower def panel, built-tower panel, and hero panel. EN+FA.
- **Ages now REBUILD the model** (towerkit genericTower): Kayanian +1 floor + four
  turquoise-capped corner turrets; Sasanian +1 more floor + arched gallery ring + brick
  band; Mastery +2 floors total extra, golden dome/finial spires, glowing master-craft
  ring, pulsing beacon light (animated.glows, pulsed in tower.update), gold banners,
  whole-tower scale 1+age·0.05. Verified: age-0 watchtower h=6.0 vs age-4 h=15.8 —
  unmistakably different buildings side by side.
- **Bug fixed**: native DOM append(null) stringifies to a literal "null" — all four
  detail-panel builders now use a null-safe put() helper (the el() helper already
  skipped nulls; direct c.append calls did not).
- Verified in sandbox: ages 0/2/4 towers side by side, Rostam promoted to Champion
  (tower damage 89→109 from rank alone, persisted across reload), tower tree shows
  5 nodes + fusion branch with no stray text, hero tree shows current rank glowing
  with promote button. Build clean.

### Asset pipeline upgrade (real models, textures, music — decision D15: stay on Three.js)
- **Pipeline** (`src/core/assets.js`): GLTFLoader + SkeletonUtils.clone with module cache;
  `preloadAssets()` at boot; `spawnAsset(key,{height,tint})` → {group, mixer, actions,
  play(), strike()}; clip discovery by regex prefs (Idle/Walking_A/Running_A/
  Melee_Attack/Death_A + Fox Survey/Walk/Run; single-clip fallback for the Horse).
  HARD RULE: missing/failed file → return null → procedural builder fallback. Never breaks.
- **Sources** (all bundled in public/assets/, no runtime network; see CREDITS.md):
  KayKit Character Pack Adventurers (knight/barbarian/mage/rogue/rogue_hooded, CC0,
  via GitHub codeload), Khronos Fox (CC0), three.js Horse (MIT), ambientCG Plaster001/
  Bricks090/Rock035/Ground037 1K color+normal (CC0), Kevin MacLeod music CC-BY 4.0
  (Ibn Al-Noor→calm, Tabuk→battle, Desert City→menu; attribution in menu credit + CREDITS.md).
- **Characters**: ASSET_ENEMIES/ASSET_SOLDIERS maps in creature.js upgrade common humans
  to skeletal GLTF (tinted per type, our Persian weapons attached to the right-hand bone).
  Identity-critical types stay procedural BY DESIGN: kings/princes (crowns), spear-maidens,
  banner bearers, drummers, mounted riders, Zahhak. KayKit faces -Z → inst rotated π.
  Citadel guards now GLTF with idle clips (game loop crash fixed: guards carry .model).
- **Entities**: Enemy/Soldier drive mixers (walk timeScale by speed, idle in duels,
  strike() one-shot on attack, Death_A clip replaces topple when present).
- **Wildlife**: forest gazelles replaced by animated Khronos foxes (+X forward → wrapped).
- **Textures**: enhanceMaterials() progressively re-skins shared cached materials
  (plaster/bricks/rock color+normal, tinted); terrain gets ground photo-texture+normal
  (repeat 26) replacing canvas detail.
- **Music**: audio.js MediaElement tracks (menu/calm/battle) through musicBus with
  setScene()+intensity crossfade (setTargetAtTime); synth director auto-silences when
  tracks alive and TAKES BACK OVER if they die; all synth SFX retained.
- Verified: 7 models + 6 textures auto-load at boot, all soldiers/human-grunts GLTF with
  correct road-facing (0° error check), textured towers/road, music fetch on unlock,
  2-wave regression clean. dist = ~59 MB (music 18 MB, models 18 MB, atlases 9 MB) — fine
  for GitHub Pages. Fixed: hidden-tab interval throttling invalidates polling QA (use
  sync checks); stale page after server restart (hard reload before verifying).
- KNOWN GAP (honest): sound EFFECTS still synthesized (good quality, offline). No
  scriptable CC0 SFX source landed this round — candidates: Kenney Impact/RPG audio
  packs (manual download) or OpenGameArt direct files. Mounted riders + bosses still
  procedural; horse.glb reserved for a future rider integration.

### Realistic character upgrade (user: KayKit chibi "not acceptable")
- **Source**: trebeljahr/quaternius-showcase GitHub repo mirrors 1,545 Quaternius CC0
  GLBs with raw-URL access. Downloaded 16: single_knight_pack KnightCharacter
  (ANIMATED: Walking/Run/Idle/Run_swordAttack/Death — realistic adult proportions),
  easy_enemies Snake/Snake_angry (animated), animals Wolf/Stag/Deer/Horse/Horse_White/
  Bull (full Idle/Walk/Gallop/Attack/Death sets), modular men/women incl. King/Witch —
  the modular characters turned out to be STATIC (no clips) so they are unused.
- **q_knight is now the universal human body** for soldiers + human enemies (ASSET maps
  in creature.js), differentiated by lerp-tint (0.45 toward faction hue — full color
  replacement makes clay statues), height (1.64–1.98) and our Persian weapons in the
  hand bone. Kings/princes/sorceress/spear-maidens/banner/drummers/mounted stay
  procedural for identity. zahhak-serpents → q_snake_angry. Ambient wildlife table
  (WILDLIFE in ambient.js): wolves+foxes+deer in forests, stag/deer meadows, horse
  herds on the steppe.
- **Hard-won pipeline fixes**:
  1. Skinned GLBs can carry their true size in BONE transforms with ~zero-size bind
     geometry → height normalization now measures skeleton world bone-span (×1.15)
     instead of mesh Box3 (the knight first spawned ~30 units tall as a dark monolith).
  2. Hand-bone weapon attachment must compensate the bone's FULL WORLD scale
     (armature exports carry compensating scales) — a wooden spear once rendered as a
     screen-filling obelisk on the road.
  3. Tints lerp 0.45, never replace (preserves armor/cloth/skin part contrast).
  4. Texture remap: Rock035 photo is dark → light stones now use the plaster texture
     (pads had turned into black slabs); stoneDark brightened (tint 0xd8cfc0).
  5. ROT_FIX table per asset key (KayKit π, fox -π/2, Quaternius 0).
- Verified: silver Puladwand + copper Houman marching with real walk cycles and swords,
  pads cream again, 2-wave regression with melee duels clean. Remaining honest gap:
  one body mesh for all humans (variety = tint/height/weapon only) — knight-pack helmet
  props (Helmet1-3.glb in the same repo) are the next variety lever; modular King/Witch
  could be animated later via clip retargeting (same Quaternius rig family).

### Quaternius Animals pack integration (user-supplied 12 gltf in atlases/animals/)
- Designed via a 4-agent Workflow (culture / systems / technical → adversarial synthesis);
  spec caught three real traps the solo path would've hit.
- **12 self-contained animated gltf** (Idle/Walk/Gallop/Attack/Death/Eating/HitReact),
  copied atlases/animals/*.gltf → public/assets/animals/ (served at assets/animals/, NOT
  models/ — the wrong-folder→404→silent-downgrade trap). Registered as a_* keys in
  assets.js MODEL_FILES; preloadAssets auto-loads them.
- **CLIP_PREFS**: added `eat: [/^Eating$/i...]` (the headline win — grazers now use the
  real Eating clip), broadened attack (Attack_Headbutt/^Attack$), death (^Death$),
  hit (HitReact). spawnAsset auto-builds actions.{idle,walk,run,attack,death,hit,eat}.
- **ambient.js WILDLIFE** repointed to a_* + **added the missing `desert` biome**
  (Estakhr/Makran were getting zero wildlife). WILD_HEIGHT gives realistic per-species
  sizes (fox 0.55 … horse 1.7) so bone-span normalization yields correct relative scale.
  Graze branch now plays `eat`.
- **Livestock cluster** (new): on plains/steppe/highland/valley the sheep flock gains
  2 cows + 1 bull + 1 tinted herding **husky**, sharing this.herd drift, grazing with the
  `eat` clip, **never fleeing** (a galloping bovine reads wrong — kept out of the WILDLIFE
  roam pool). Uses Cow/Bull/Husky authentically as pastoral life.
- **Cultural fidelity**: Alpaca + ShibaInu registered but used NOWHERE (no Shahnameh/
  Iranian basis); Husky only as a distant tinted guard dog. Deer/Stag herds = Bahram-Gur
  hunt backdrop; donkeys+fox on desert caravan routes; horses on the steppe.
- **ROT_FIX**: none added (Quaternius AnimalArmature faces +Z = engine convention).
  VERIFIED LIVE (the +Z trap that bit us twice): fox flees nose-first (camera-behind shot
  shows its back/ears), drift err 0°; correct relative scale on steppe; no console 404s.
- **DEFERRED (adversarial finding, separate commit)**: real animated horse MOUNTS for
  cavalry. Risk: rig-contract change + enemy.js does NOT mirror soldier.js (enemy.js
  line ~441 keys off rig.legs which the mounted humanoid rig lacks → warlord's procedural
  horse is already un-animated; a blind "mirror soldier.js" edit is wrong). Mounts left
  procedural this pass (never-break). Rakhsh = black-tint a_horse on the existing
  lancer coat:'horseBlack' spec when done — no data edits needed. Barmayeh (Fereydun's
  cow) lore-placement also deferred (needs a snowpeak placement exception).
- Verified: 2-wave regression clean, mounted cavalry still builds, build passes.
  Note: ~35 MB of gltf added to deploy (lazy, non-blocking; optional glb conversion
  later trims ~1/3). q_*/fox/horse keys kept as deep fallbacks (q_bull now dead — safe
  to delete after sign-off).

### KayKit Medieval Builder kit → fortified Persian town fabric (user-supplied, 105 glb)
- Designed via a 4-agent Workflow (cultural triage / placement systems / technical loader
  → adversarial synthesis). The crux was cultural fidelity (medieval-European kit in a
  Persian game) — synthesis FORBADE every half-timber `wall-pane*` and pitched-gable
  `roof*` from the loader's whitelist entirely (not just unused), reframing the kit as a
  "fortified Persian caravanserai/citadel-town", never a European castle.
- **NEW static loader `src/core/props3d.js`** (separate from skinned spawnAsset):
  PROP_FILES (43 curated stone/wood pieces, relative `assets/buildings/b1/<name>.glb`),
  loadAllProps() at boot, propReady/propBase, getProp (one-off clone), **instanceProp**
  (one InstancedMesh per sub-mesh — the perf lever), KIT_UNIT=2.2, KIT_TINT=0xc9b48a
  sandstone, per-family tint lerp (stone 0.58 / wood 0.32 — bumped from 0.45 after a
  close-up showed grey). Tinted-material cache keyed by source-material UUID.
- **5 generators** (all gated on propReady → procedural fallback, all reuse map.js
  clearance closures `_isClear`/`_nearRoad`/`_footprint`, never block roads/pads/citadel):
  buildCurtainWall (instanced fortified-wall arc + battlements around the citadel at
  R=footprint+6, road-crossing segment becomes a gate, end/mid towers), buildVillage
  (1-3 walled caravanserai compounds off-road with gate/tower/crates), buildDocks (river
  banks, skip bridges, barrels+ladder), buildRuinedColumns (instanced column-damaged
  Persepolis ruins augmenting props.js), buildPastureFence (open paddock around the sheep
  flock in ambient.js).
- **The custom Persian citadels (citadels.js) are 100% untouched** — the kit only ever
  surrounds them.
- Verified live: all 43 glb + 83 atlas textures load 200 (no leading-slash/public-prefix
  404s); Samangan shows sandstone curtain wall + gate + towers + village + ruins + fenced
  flock around the turquoise-dome citadel with the road passing through; 36 kit meshes but
  11 instanced (≈few draw calls); Madayen apadana+river+docks builds (37 kit children);
  2-wave combat regression clean; build passes. Pitfall avoided per spec: filenames are
  the on-disk basenames (e.g. wall-flat-gate, not the prose "wall-paint-flat-gate").
- Open polish: gate/door ROT_FIX may need per-piece Math.PI (looked fine so far);
  pitched-roof'd Persian-styled houses would need bespoke models (kit roofs are forbidden).

### Quaternius Ultimate Stylized Nature pack → instanced biome foliage (user-supplied, 68 gltf)
- Designed via a 4-agent Workflow (culture-biome / systems-rewire / technical-loader →
  adversarial synthesis). 68 self-contained static gltf copied atlases/nature/n1/ →
  `public/assets/nature/n1/` (served `assets/nature/n1/<Name>.gltf`, base:'./'+Pages safe).
- **Loader** (`core/props3d.js`): NATURE_FILES registry (48 names used — trees×4 ×5,
  plants, grass, clover, mushroom, flower, petal, rock, pebble; RockPath tiles omitted)
  folded into the SAME cache/loadAllProps as the building kit. `instanceProp` extended
  with `castShadow/receiveShadow/frustumCulled` opts (backward-compatible defaults; the
  building callers are unaffected).
- **Scatter rewire** (`world/props.js`): the procedural broadleaf-tree / sphere-bush /
  icosahedron-boulder / cone-grass blocks now route through kit foliage via a `placeKit`
  bucketer (random variant + uniform per-instance scale baked into the EXISTING
  `m4`=T·R·S(s), passed to `instanceProp` with **`{unit:1, tint:null}`** — verified
  non-shearing: world·S(1)·local = T·R·S(s)·local; tint:null keeps the kit's own
  normal-mapped bark/leaf materials). N points collapse to ≤variants InstancedMeshes.
  Two-layer never-break: `propReady`-gate + placeKit-count-gate → original procedural
  body verbatim if the kit is unloaded. Added pebble scatter (round on green/wet, square
  scree on dry/high — shadow+frustum OFF), forest-only mushrooms, lush-meadow kit-flower
  accents.
- **Biome routing** (`TREE_PLAN`): forest(Mazandaran)=TwistedTree×8+DeadTree×16+
  CommonTree×34, mountain(Alborz)=Pine×12+DeadTree×6 (pine BUMPED past the tree4 budget),
  snowpeak(Damavand)=DeadTree×4 only (floor stays bare, snow:true), steppe/desert=
  Dead/Common (NO pines on the dry steppe), the rest=CommonTree. Grass: 3-variant lush /
  2-variant wispy dryGrass, ≤3 InstancedMeshes, shadow+frustum OFF.
- **KEPT PROCEDURAL** (Persian-iconic, no pack equivalent): sarv cypress (Lathe teardrop),
  date palm, reeds, pomegranate orchard (red-on-green garden beat), red poppy meadow
  (load-bearing meadow red), steles/ruins/camp/windmills/banners. `return anim` shape
  ({windmills,campfires,flames}) untouched → map.js call-site unchanged.
- **RED-FOLIAGE TRAP (caught live)**: the pack's `Leaves_TwistedTree_C.png` is deep RED
  (autumn/cursed), and `Bush_Common`/`Bush_Common_Flowers` REUSE that red texture — so the
  spec's bush lists were scattering red shrubs through green valleys (a top-down debug cam
  also made clustered red TwistedTrees look like one "blocky red blob"). RESOLUTION: red
  foliage is now **Mazandaran-only** — `NV.bush` (all green biomes) is Plant/Fern only;
  `NV.bushForest` adds the red autumn bushes as deliberate companions to the crimson
  TwistedTree canopy (the div-haunted forest's blood-red signature). `Plant_*`/`Fern_1`
  sample the green fern regions of the shared `Leaves.png` atlas (verified green).
- Verified live (browser, per biome via `__dbg.startMap` + propsGroup probes + screenshots):
  forest = green canopy + bare snags + crimson cursed giants (TwistedTree at near-full
  ~17–19u, NOT shrunk) + red marsh bushes; valley = lush green, twisted-count 0, exactly
  12 CommonTree, kit-flower accents, no off-color shrubs; snowpeak = bare (0 grass/pine/
  twisted, 4 dead snags, pebble scree); mountain = 12 pines + 6 dead + alpine grass.
  Ground cover correctly shadow-OFF + frustum-OFF; trees/rocks shadowed. No console errors;
  module boots clean. (instanceProp scale math + never-break fallback both proven.)

### Quaternius Fantasy Props MegaKit (things/t1, CC0) → inhabited-town set-dressing + people pack triage
- Designed via a 4-agent Workflow (cultural triage / placement systems / technical loader →
  adversarial synthesis). The synthesis corrected 3 analyst errors against live source:
  Banner pivot is ymin −1.549/−1.234 (not −0.804); the culture analyst's "homes" (kaveh-forge,
  jamshid-court…) are TOWER ids built per-pad at runtime, NOT citadel styles, so props go in
  villages/bazaar near roads/pads, never bolted onto the (hot-rebuilt) tower models; and the
  file is `Bag`, not `Sack`.
- **Loader** (`core/props3d.js`): `THINGS_FILES` registry (curated ~41 of 94, `assets/things/t1/`,
  `THINGS_UNIT=1.0`, `tint:null`) folded into `loadAllProps`. Cache now also stores `baseY`
  (Box3 min.y) so callers auto-lift by `-baseY*unit` — off-pivot props (Banner −1.55, Torch
  −0.28) sit on the ground (verified: whole-clone box min ≈ ground).
- **Placement** (`world/map.js`): `placeThing`/`instanceThings` helpers (clone for one-offs,
  InstancedMesh for repeats; all gated `propReady` → never-break). buildVillage gains a Kaveh
  **smith-quarter** (anvil/workbench/whetstone/weapon-stand/bronze tools) in the first compound
  + instanced caravanserai clutter (barrels/crates/vases/bags/produce) across all compounds.
  buildDocks gains crates/barrels/rope/buckets. New **dressMarket** generator: a roadside
  bazaar of instanced Stalls/Carts/Barrels/Crates/Vases/Coins/Chests + Scrolls, ≤8 `Torch_Metal`
  each paired with a `makeFlame` pushed into `map.propFlames` (game.js pulses them), + static
  gltf heraldry (Banner_1/2 — RIGID, NOT pushed into propBanners; the procedural makeBanner
  stays the animated hero). Verified Samangan/Balkh: 41 instanced groups + 8 flames, all 8
  thing materials render, 0 console errors, bounded draw-calls (4 shared trim-sheets).
- **Cultural gate** (BINDING, see art-direction.md): excluded all interior furniture (beds/
  cabinets/shelves/tables/chairs), bound books + bookcases (European wizard-library read — use
  Scrolls instead), potions/bottles/mug (tavern/apothecary), chandelier/candles. Kept forge,
  bazaar, pottery, scrolls, coins, lighting, heraldry.
- **PEOPLE PACK (people/p1) — EVALUATED AND REJECTED** (two passes). The 4 modular outfits are
  SKINNED with ZERO clips on a 70-bone Unreal-mannequin skeleton that doesn't match q_knight.
  Pass 1 deferred them as T-pose. Pass 2 (user asked to attempt the pose) SOLVED the repose —
  `rotateOnWorldAxis(new Vector3(1,0,0), -90°)` on the shared `upperarm_l`/`upperarm_r` bones
  swings the bound T-pose arms down to the hips (verified by hand-bone world Y: 1.34→0.95,
  symmetric L/R; the 10 modular sub-meshes share ONE bone hierarchy so a single rotation drives
  all). BUT three hard blockers killed it: (1) the free pack's **PEASANT outfits are HEADLESS** —
  the assembled mesh is only Arms/Body/Feet/Legs, no head mesh, and there's no peasant head part
  in the pack (only Rangers carry a Head_Hood); (2) textures are **~5 MB each (2048²)** → ~60 MB
  for 4 figures, ~doubling the offline deploy for a few background NPCs; (3) the preview
  screenshot tool returned stale frames, blocking visual confirmation of the Ranger pose.
  Decision: fully REVERTED — removed the v_* MODEL_FILES keys, deleted `spawnStaticVillager`,
  and DELETED the staged `public/assets/people/p1/` copies (originals kept in atlases/). The
  town's "life" already comes from animated q_knight guards/soldiers + ambient wildlife. If a
  living-villager pass is ever wanted, reuse the WORKING q_knight pipeline (animated, headed,
  rigged) with a civilian tint — not this pack. The repose recipe above is recorded for any
  future single-skeleton, fully-meshed character pack.
- **Loader concurrency fix** (`props3d.js`): firing all ~120 gltf at once made dozens
  simultaneously re-request the same 3 MB shared trim ORM, flooding the dev server and
  intermittently dropping the load (`Couldn't load texture T_Trim_Props_ORM.png`). Fixed with
  a small worker pool (`LIMIT=8` in `loadAllProps`) + `THREE.Cache.enabled=true`. Verified: all
  props ready promptly, 0 texture errors. Helps GitHub Pages too.

### Stylized n2 nature pack + Poly Haven realistic hero props (user-supplied, ~1.3 GB raw)
- Designed via a 4-agent Workflow (art-style-blend / placement-biome / technical-loader →
  adversarial synthesis). User dropped atlases/{nature/n2, nature/n3, rocks/r1-r2, trees/t1-t12}
  (~1.3 GB of mostly 4K Poly Haven photoscans) and said "use them, you decide".
- **Texture downscale pipeline** (`scripts/downscale_assets.py`, PIL): copies + shrinks only the
  curated keepers. n2 bark normals 2048→512 PNG (lossless, no gltf uri edit), bark diffuse→1024
  JPG, leaf/flower alpha PNGs kept; Poly Haven 4K→1024 (rock/deadwood) / 512 (small dry), arm 512.
  **1.3 GB → ~29 MB added** (n2 5.5 + rocks 6.6 + trees 17). Copies referenced textures only →
  auto-drops n2's unreferenced PalmTree/PineTree/Rocks/Leaves_BW.
- **n2 (stylized Quaternius, CC0)**: registered in props3d.js as NATURE2_FILES with an `n2_`
  PREFIX (MANDATORY — n2 also has DeadTree_1..10 and would overwrite n1's DeadTree_1..5 cache).
  New NV pools (birch/maple/deadTree2/bushGreen2/bushFlower2/flowerClump2/tallGrass2) + TREE_PLAN
  segments APPENDED (plan[0] stays an n1 pool so the block's kitOn gate never depends on n2).
  Routing: **Birch** (golden) → green biomes (highland/valley/plains/river/wetland); **Maple**
  (autumn red-orange, verified RGB 204,87,62) → **forest/Mazandaran ONLY** (companions the crimson
  twisted signature, honours the red=Mazandaran rule); **deadTree2** → every bare-tree biome;
  n2 green bushes → green biomes; flower clumps + flowering bushes + tall-grass overlay → green
  meadows. All instanced via the existing placeKit (unit:1, tint:null).
- **Poly Haven realistic (CC0)**: KEEP 10 weathered/rock/deadwood/dry models (2 boulders, 2 dead
  trunks, stump, pine_roots, 2 shrubs, weed, dandelion) — the least style-sensitive class.
  Registered as REALISTIC_FILES (REALISTIC_UNIT=1.0, real-metre scale). Placed as LOW-COUNT
  high-poly **getProp clones with tint:null** (NEVER instanced — ~80-160k tris each would balloon
  a field into millions; NEVER tinted — the tintFactor stone fall-through would crush the PBR to
  sandstone) via a new `scatterHeroProps(map,rng)` generator + `placeHeroProp`/`heroYOff` helpers
  (mirroring placeThing). Biome-routed (boulders→mountain/snowpeak/desert; pine_roots→mountain/
  snowpeak cap 2; deadwood→forest; dry shrubs/weed→steppe/desert; dandelion→plains/highland),
  hard cap 12/map, + buildRuinedColumns drops boulder/stump/log beside the fallen columns (the
  best photoreal home). All gated on propReady (never-break), confined to gritty biomes, kept
  clear of stylized cypress/palm via _isClear.
- **DROPPED**: the 3 huge photoreal LEAFY trees (t1/t2 tree_small_02 dupe 90 MB, t3 island_tree
  38 MB, t12 pine_sapling 251 MB / 6M tris) — max style clash + size; n3 FlowerArrangement (no
  license, 47 MB .blend). n2 covers all canopy needs.
- **Loader**: REALISTIC_FILES queued LAST in loadAllProps so the heavy hero gltf warm after
  foliage; the LIMIT=8 throttle + THREE.Cache handle the ~46 new gltf. tintFactor 0.58 unknown-
  name fall-through documented as a latent bug, AVOIDED (never tint the new props) not fixed.
- Verified: all 46 assets load (propReady), 0 console errors, 0 404s; hero props sit on ground
  (minY≈ground); bounded tris (forest 4 hero clones = 328k); InstancedMesh count up (valley 57,
  forest 70 vs ~51 baseline) = n2 placing; maple autumn / birch golden / bushes green confirmed
  by texture sampling; build passes; dist +29 MB, dropped assets absent. NOTE: final per-biome
  SCREENSHOTS were blocked by the preview-capture tool degrading late in the long session (it
  timed out even on the menu/light scenes); verification fell back to geometry + texture + console
  checks. A fresh-session visual pass per biome is the remaining confirmation.

### Living villagers — idle civilian NPCs in the settlements (replaces the rejected people pack)
- The people/p1 modular pack was rejected (headless peasants + T-pose + 60 MB). Instead reused
  the PROCEDURAL humanoid (`models/humanoid.js buildHumanoid`) — texture-free, already the
  soldier/hero body, and configurable as an unarmored ROBED COMMONER (better civilian look than
  the armored q_knight).
- **Placement** (`world/map.js`): `map.villagerSpots[]` (init before the generators) collected
  during buildVillage (2 clear points near each compound) + dressMarket (every 3rd bazaar stall,
  facing it), via `_isClear` so never on roads/pads. Only the inhabited biomes (plains/steppe/
  valley/river/desert) get them.
- **Spawn + anim** (`world/ambient.js`): the per-map Ambient manager spawns ≤6 commoners at those
  spots — `buildHumanoid({armor:'none',helmet:'none',weapon:'none',shield:false, clothColor:varied
  earthy, beard/cloak/female varied})`, added to Ambient's group, idle-animated each frame via
  `animIdle(rig, time+phase)` in `Ambient.update` (the same proven idle the citadel guards use).
  No textures, no mixer. Cap 6 (procedural humanoid ≈ 30 draw-calls each; perf-bounded).
- **Polish pass** (ambient.js makeHeadwear/makeCarry): every villager wears a Persian head
  covering — **turban** (stacked wraps + crown) / **felt skullcap** for men, **draped headscarf**
  for women (so `hairStyle:'none'` under it); ~half carry a **woven basket or clay jug** in hand;
  all do a slow **head-glance** (look around the market) on top of the idle breathing. Beard fixed
  to 'full' (the earlier 'short' was silently ignored — only full/white/twobranch render).
- **Reactive behavior** (ambient.js update, mirrors the wildlife flee + shares `_threatT`): each
  villager runs an idle → **flee** → **return** state machine. When an enemy comes within ~11u they
  PANIC (face away, run ~4.4 u/s with the walk cycle); when the land is safe they walk back to
  their home spot and resume idle. The town scatters when divs approach and REFORMS once defended.
  Verified: flee triggers, villager runs 7.8u out, then returns to within 0.34u of home and goes
  idle; stays grounded; no error.
- Verified: 6 villagers spawn at the 7 settlement spots on Samangan, all GROUNDED (footY≈ground),
  CIVILIAN (no weapon), human-scale (~1.9 u), idle ticks over multiple frames with no error;
  build passes; 0 console errors. (Visual screenshot still blocked by the preview-capture tool on
  the heavy scene — verified by geometry instead; look live in the sandbox at any village map.)

### Performance audit + shadow-caster trim
- Measured full-scene cost (aerial frustum, manual render → renderer.info) across maps: forest/
  Mazandaran 386 draw-calls / 1.16M tris / 3.24 ms update; village maps (Kabul/Samangan) 739–775
  draw-calls / ~1.1M tris / 1.8–3.2 ms. Healthy. Engine already quality-scales: low = shadows OFF
  + 1× pixel-ratio, medium = 1024 shadow map + 1.5×, high = 2048 + 2× (engine.js applyQuality).
- One disproportionate cost: the 6 procedural villagers = ~177 shadow-casting meshes (~24% of all
  meshes on village maps). Set ambient villagers to **castShadow=false** (they still RECEIVE
  shadows) → shadow casters Kabul 561→396 (−29%), Samangan 619→460 (−26%); effective GPU draw
  calls on the heaviest map ~1300→~1135. Negligible visual cost (tiny background figures).

### Adversarial code review of the session’s changes → 4 fixes
- 5-agent Workflow (correctness / lifecycle / never-break / art-fidelity → adversarial synthesis)
  over this session’s changes. Correctly DE-ESCALATED a false "critical": map.dispose() disposing
  cache-shared geometry does NOT black-screen the next map (three r166 BufferGeometry.dispose
  self-heals — it re-uploads from the retained CPU array), it just churns. Many areas verified
  clean (villager state machine, flee NaN-safety, _threatT throttle, TREE_PLAN n2 gating, multi-
  material n2 instancing, downscale integrity, REALISTIC_FILES paths).
- **Fix #1 (high) — Ambient leak**: Ambient had NO dispose(); game.dispose() only scene.remove’d
  its group, so every battle leaked the freshly-built villagers/sheep/birds/cloud+mist sprites +
  GLTF mixers. Added `Ambient.dispose()` (traverse-dispose geometry+materials+maps, skip cache-
  shared SkinnedMesh, stop fox mixers) and called it from game.dispose(). Verified: map switch
  works, no broken props.
- **Fix #2 (med) — cache re-upload churn**: getProp clones / instanceProp share the boot cache
  geometry by reference; map.dispose()’s blanket geometry.dispose() silently re-uploaded ALL
  building/nature/things/hero geometry each map transition. Now loadAllProps tags cached geometry
  (`geo.userData.cached=true`) and map.dispose() skips tagged geometry. Verified: 151 cached
  (skipped) / 305 procedural (disposed); kit walls + hero clones tagged.
- **Fix #3 (med) — unenforced art rule**: the "hero props never inside a cypress/palm/tree" rule
  was only a (false) comment — _isClear checks roads/pads only. Now scatterProps records big-
  foliage centers (cypress/canopy-trees/palm) → `map._foliageSpots`; `map._clearOfFoliage(x,z,r)`
  gates scatterHeroProps + buildRuinedColumns hero drops. Verified: 92 foliage spots, every hero
  clone ≥2u beyond the keepout (no photoreal prop inside a sarv).
- **Fix #4 (low) — pool stall**: wrapped the loadAllProps success callback in try/finally so a
  malformed gltf can’t skip pump() and permanently kill a worker-pool slot.
- Skipped #5 (dormant tintFactor 0.58 fall-through — all current callers pass tint:null; the
  suggested fix risks the building-kit stone tint). Build passes, 0 console errors.

### Memory-leak audit across the map lifecycle (partial — 2 fixed, 1 open)
- Method: cycle maps build→dispose and watch `renderer.info.memory` + instrument `gl.createTexture`/
  `deleteTexture`. **Geometries are CLEAN** — bounded, each map returns to ~its value (the cached-
  geometry-skip + procedural dispose work). **Textures LEAK** ~72/map (73 created / 1 deleted per
  build, monotonic, unbounded → GPU pressure on long marathon sessions; fine for normal play).
- **Fixed — my own `ambient.dispose()` bug**: it disposed materials/textures of villager/wildlife
  meshes, but those reference SHARED `MATS`/`colorMat` singletons (humanoid feet use `mats.woodDark`)
  → disposing shared singletons churns/breaks them. Corrected to free only per-map resources
  (procedural geometry + the cloud/mist SpriteMaterial+canvas texture), never shared materials.
- **Fixed — terrain ground photos**: `buildTerrain` did `new THREE.TextureLoader().load(ground-
  color/normal.jpg)` FRESH every map (2 textures/map leaked). Memoized into shared `_groundColor`/
  `_groundNormal` (the photos are identical for all maps). Baseline texture count 377→301.
- **OPEN — residual ~72 textures/map**: extensively diagnosed but source NOT pinned. Ruled OUT:
  foliage materials, building-kit tinted materials, hero clones (ALL verified to keep STABLE texture
  uuids across rebuilds = shared), shadows (count identical on/off), HUD (DOM atlas cells, not WebGL),
  towerkit/citadel/road (no per-map textures; road memoized). Paradox: 73 GPU textures allocated per
  build with only 1 delete and only ~5 NEW texture OBJECTS in the scene census — i.e. shared texture
  objects appear to get fresh GPU allocations without a matching deleteTexture. Needs three.js-internals
  access (enumerate WebGLTextures / hook setTexture2D with the Texture object) to resolve — deferred
  to a focused follow-up rather than thrash further. No console errors; both fixes build clean.
- **Deeper finding** (hooking texStorage2D/texImage2D): the ~72/map is ~100 PROP textures (1024/2048
  sRGB color + RGBA8 normal — the nature/things/hero/building gltf maps) RE-UPLOADED every map via
  fresh GL allocations, even though their Texture OBJECTS are shared (stable uuids). So the shared
  textures' GPU resources are invalidated per map and reallocated with the old not freed. Ruled out
  every app-side trigger (setMood only sets colors/fog/uniforms; applyQuality is not per-map; nothing
  bumps prop-texture .needsUpdate/version; tintCache persists). Most likely three.js r166's immutable-
  texture (texStorage2D) reallocation interacting with the cached gltf ImageBitmap Source. Follow-up
  path: hook WebGLTextures.uploadTexture to capture WHY each prop texture re-uploads (version vs source
  vs cache-miss); candidate fixes: disable texStorage, or pin/cache the gltf texture Sources.
- **Also fixed (one-time hygiene)**: engine.js never disposed its PMREMGenerator after fromScene →
  added pmrem.dispose() (frees the generator's internal render targets; result env texture retained).

### Natural walk cycle for procedural humanoids (user: "walking far from natural")
- Root cause: `humanoid.js` legs were a SINGLE rigid segment (hip pivot → straight cylinder, knee
  was just a decorative sphere) — `animWalk` swung the whole leg as a stiff pendulum with the foot
  arcing/dragging, which reads as robotic.
- Fix: split each leg into **thigh + shin hinged at a real KNEE joint** (`rig.shinL`/`shinR` knee
  pivots; identical standing geometry — hip 0.9 → foot −0.84). Rewrote `animWalk` to a proper gait:
  hip swings the thigh (`-stride·cos`), and the **knee flexes through the swing phase**
  (`lift·max(0, sin(phase-π))`, peak ~82° mid-swing) so the foot LIFTS to clear the ground, then
  extends for heel-strike. `animIdle` straightens the knees. All callers unchanged (they drive
  `rig.legL/legR`); mounted-rider pose (creature.js) and citadel-guard idle still valid.
- Verified mechanically (drive animWalk over one stride): stance = knee straight + foot low
  (0.06–0.21); swing = knee flex to 1.43 rad + **foot lift range 0.33** + extends to heel-strike;
  idle resets knees. Build clean. Drives all procedural humanoids (identity-type soldiers/enemies +
  villagers); skeletal q_knight enemies/soldiers already scale walk `timeScale` by speed.
  (Visual screenshot still blocked by the heavy-scene capture tool — verified by gait geometry.)

### Open items
Resolve the residual ~72-texture/map leak (see audit above); Real-GPU fps benchmark with max load
(now incl. ≤6 procedural villagers/settlement map);
playtest maps 10–20; Firefox/Safari pass; spawn-gate silhouette polish; unique larva model;
villager polish (head coverings / a slow idle-wander / carried baskets). (testing.md → Known issues.)

## 2026-06-13 — Session 2: HUD/UX bug-fix pass (user bug report w/ 2 screenshots)

User reported 5 issues on the build/tower panels. Root cause of #1 + #2 was one bug.

### Card collapse (fixes #1 image scale + #2 names invisible)
- `#cardGrid` is a 2-col grid with a DEFINITE height (flex:1 in #leftPanel) and was using
  `grid-auto-rows: auto` → grid distributed its height across the 16 rows, squashing all 32 cards
  to ~39px strips. Portraits (92px) overflowed and names clipped.
- Fix (style.css): `grid-auto-rows: 150px; align-content: start;` → cards size to content (92px
  portrait + name/fa/hint), list scrolls. Portrait height 104→92. Card now 150px; name renders.

### Atlas cell distortion (fixes #1 image scale — stretch)
- `applyAtlasCell` set `background-size` to per-axis % → the cell was stretched to the host box's
  aspect (e.g. cell aspect 0.65 forced into a 1.43 box = ~55% horizontal stretch).
- Fix (atlas.js): rewrote `applyAtlasCell` to draw the cell at native resolution onto a `<canvas>`
  child and let `object-fit: cover` (CSS `.cellimg`) crop it uniformly — element-size independent,
  works for cards, right-panel portraits, hero-assign minis, and campaign mapcards alike. One shared
  cached `Image` per atlas URL; canvas inserted as first child so the absolute badges paint on top.
  CSS: `.cellimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}` +
  `position:relative;overflow:hidden` on `.portrait/.rp-portrait/.mini/.mapimg`.
- Verified: card cell native aspect 0.650 → canvas 182×280 → cover-cropped into 132×92 (uniform).

### Panel hidable (#3)
- `#rpClose` already existed + wired; made it a prominent 30×30 round gold ✕ (z-index:3). Verified
  clicking it sets the right panel to display:none.

### Promote commander from tower panel (#4)
- `showTower` (built-tower panel) now shows a **★ Promote** button when the tower has an assigned
  hero below max rank (next rank label + cost) → `game.upgradeHeroRank(tower.hero)`; max-rank shows
  a note. New i18n keys hud.promote / hud.maxRank (en+fa).

### Merge discoverability (#5)
- `showTower` always lists every fusion recipe under a `⚭ Fusions` subhead: an active **Merge**
  button when a partner tower is already built within `maxDist`, else explicit guidance
  ("build <other> within <N>"). `fuseTowers` sets `pad.tower=fused`, returns true; panel refreshes to
  the fused tower (`tower.pad.tower`). New i18n keys hud.mergeInto/mergeNeed/mergeWithin (en+fa).
  CSS: `.gbtn.fuse` (teal), `.rp-subhead`, `.rp-note`.

Build clean (62 modules). Verified via DOM/computed-style probes (screenshot capture still blocked
on the heavy 3D scene).

### "null" under hero names — dual source-of-truth desync (user screenshot)
- Symptom: hero cards (fa/RTL) showed Latin primary name + literal "null" + Persian hint. NOT reproducible
  from current code (3-agent sweep: data 100% clean — 36 heroes/32 towers/30 enemies/30 places/18 soldiers
  all have name+faName; `el()` drops null children). It was a STALE HMR render from before the el null-guard /
  field standardization converged.
- Root cause (latent fragility): the secondary-name line read `document.body.classList.contains('rtl')` while
  `tName`/`tf` read the i18n module `current` (localStorage 'std.lang'). The body class is only synced to
  `current` inside setLang/initLangDOM, so an HMR reload or a render before initLangDOM could desync the two →
  primary (Persian) and secondary disagree, and a prior unguarded append printed the null verbatim.
- Fix: added null-safe `tNameAlt(obj)` in i18n.js driven by the SAME `current` as tName
  (`(current==='fa'?obj.name:obj.faName) ?? obj.name ?? obj.faName ?? ''`). Replaced all 8 sites that used the
  `body.classList.contains('rtl') ? X.name : X.faName` pattern: hud.js cardfa ×2 (203/228) + rp-faname ×4
  (363/484/521/554), codex.js:106, menus.js:126 (miFa). Now the secondary line can never disagree with the
  primary and can never stringify to "null"/"undefined".
- Defense-in-depth (sweep medium-risk): guarded `tower.hero.special?.desc` (hud.js — a fused tower may hold a
  hero without `special`) and `${...sourceRef ?? ''}` in the fused-tower builder (game.js:177).
- Verified adversarially: forced current=fa + removed body.rtl class + re-rendered → names stayed correct,
  zero literal null/undefined. Build clean (62 modules).

### Card text squish + left-panel collapse (user: "title/subtitle overlap, panel not hideable")
- "null" recurrence was a STALE browser tab (no service worker in project — confirmed; the dev server already
  serves the tNameAlt fix; tName_zal='زال', tNameAlt_zal='Zal'). Hard reload resolves it.
- Overlap root cause: card content (~156px incl. portrait 92 + name + faname + 2-line hint) exceeded the fixed
  150px grid row, so flex-shrink crushed `.cardname` to 6px → Persian glyphs clipped and visually collided with
  the subtitle. Probe confirmed cardname height 6px.
- Fix: `.cardname/.cardfa/.cardhint { flex: 0 0 auto }` (never shrink) + `#cardGrid grid-auto-rows 150→166px`.
  Moved hero rank stars from a conditional flow row to a `.rankbadge` portrait overlay so every card has the
  SAME fixed content height (promoted heroes no longer overflow). cardfa now nowrap+ellipsis too. Verified:
  cardname 22px, no clip/overlap, scrollH 164 ≤ 166, both tabs, both languages.
- "Panel not hideable" = the LEFT card panel (not the right detail panel fixed earlier). Added a `.panel-toggle`
  chevron handle clinging to the panel's inner edge; click toggles `body.panel-hidden` which slides #leftPanel
  off-screen (transform translateX ±360, opacity 0, pointer-events none) and the handle slides to the screen
  edge so it stays clickable to reopen. RTL-aware (panel on right → slides right, handle on right edge); chevron
  glyph + tooltip (hud.togglePanel/hidePanel/showPanel, en+fa) flip with state via `_syncToggle()` (called on
  toggle + onLangChange). Verified hide/reopen round-trip in both LTR and RTL. Build clean.

### Group filter for the card panel (user: "filter based on group for towers and heroes")
- Added an adaptive filter-chip bar (#cardFilter) between #leftTabs and #cardGrid in hud.js.
  - Towers filter by `role` (9: archer/siege/fire/magic/support/aura/economy/barracks/trap) — icon-only
    chips (label in tooltip via t('role.'+id)) since there are many; icons match the on-card role icons.
  - Heroes filter by `ageTier` era (4: ancient/heroic/kayanian/sasanian) — icon+label chips (AGE_ICONS +
    t('age.'+id)). (Hero `role` has 20 values — too granular for chips; era is the clean lore grouping.)
  - `showLabel = groups.length <= 5` toggles icon+label vs icon-only automatically.
- State: `this.filter = { towers:null, heroes:null }` (null = All), independent per tab and persisted across
  tab switches. `_renderFilterBar()` rebuilds chips for the active tab each renderCards(); clicking a chip sets
  the filter (re-click clears to All), clicking همه/All clears. renderCards filters TOWERS by role / HEROES by
  ageTier before building cards. Chips relabel on language change (refreshAll→renderCards).
- New constants TOWER_ROLE_ORDER, HERO_AGE_ORDER, AGE_ICONS; i18n key hud.filterAll (همه/All). CSS .filterchip
  (rounded pills, active = gold). Filter bar ~55px (wraps to 2 rows for towers); grid still scrolls.
- Verified: fire→2 towers, heroic→9 heroes, toggle-clear back to 32/36, per-tab filters independent. Build clean.

### Filter bar polish (user: "not nice — one row or 2 balanced rows")
- Replaced the flex-wrap pill bar (ragged 7+3) with a uniform CSS grid. _renderFilterBar sets
  gridTemplateColumns inline to balance: `perRow = items.length<=6 ? items.length : ceil(items.length/2)`
  → towers (All+9=10) render 5+5 in two even rows; heroes (All+4=5) render one row of 5. All chips icon-only
  equal cells (height 30px, border-radius 8px, 1fr columns) → identical 54px width, tidy aligned grid.
  Verified: towers 2 rows ×5 uniform (barH 65), heroes 1 row ×5 (barH 30). Build clean.
- NOTE for future: the preview screenshot tool captures only the WebGL canvas, not the DOM #ui HUD overlay
  (topbar sometimes shows, side panels don't) — verify HUD layout via getBoundingClientRect geometry, not screenshots.

### Filter by role for BOTH tabs, complete lists (user: "role list for heroes not complete")
- Heroes now filter by `role` (was ageTier/era). Role lists for both tabs are DERIVED FROM THE DATA at render
  time (`[...new Set(source.map(x=>x.role))]`) so they are always complete: towers 9 roles, heroes all 20
  (champion, sage, guardian, forgemaster, king, strategist, defender, protector, matriarch, ancestor,
  monsterSlayer, stateswoman, companion, counselor, marshal, archer, gatekeeper, rider, martyr, prince).
  TOWER_ROLE_ORDER only curates tower order; any uncurated role is appended (never dropped). Removed
  AGE_ICONS/HERO_AGE_ORDER. Labels via tOpt('role.'+id) (all exist in en.js+fa.js already).
- Grid balancing capped at maxCols=7 so cells stay tappable: towers 10→5+5, heroes 21→7+7+7.
- De-duplicated HERO_ICONS (several roles shared 👑/⚔️/📜) → all 20 unique: matriarch 👸, stateswoman 🏛️,
  counselor 💬, rider 🏇, martyr 🕯️, prince 🤴, striker 🥊 (also improves on-card role icons).
- Verified: towers 9 unique icons 5+5; heroes 20 unique icons 7+7+7, barH 100; clicking guardian → 1 card. Build clean.

### Shahnameh lion redesign (user: "lions really bad design — Lion from Shahnameh, not a normal lion")
- Rebuilt buildLion (creature.js) as a heraldic "Lion & Sun" (شیر و خورشید) beast — the right read of
  "Shahnameh lion" is STYLIZED/heraldic, not a realistic safari lion (which would clash with the procedural
  low-poly art and isn't what the symbol means). Kept it procedural (offline/static, matches art style).
- Old mane was a blobby sphere + ring of thin cone "spikes" = spiky sea-urchin look. New mane = a warm,
  flattened SUNBURST DISC ruff (3 layered ellipsoids bronze→amber→inner-gold) whose silhouette is a dense
  flat flame-fringe (22 wide 6-sided petals) with gold "sun-ray" accents; the muzzle + amber almond eyes poke
  out the front. Added chin beard, ear tufts, flame tail tuft, prouder neck (neckUp .82), longer legs, bigger
  chest hump, gold-sheen metalness on the rim.
- Performance: the whole mane is built with MeshBuilder and MERGED per material (head ruff ~4 draw calls, tail
  ~2) instead of ~50 separate cone meshes — lions spawn in packs. New MATS: lionManeOuter/Mid/Inner/Gold
  (warm noise-textured, gold has metalness). lionFur given a subtle noise map.
- Iterated visually via preview screenshots by injecting buildEnemyModel('lion') into engine.scene at origin
  and framing engine.rtsCamera (set target/dist/pitch/yaw then call rc._apply() — the loop's auto-update was
  overridden by the intro fly-in; set rc._fly=null). NOTE: 3D scene DOES screenshot (WebGL canvas); only the
  DOM HUD overlay is flaky. window.__dbg = {engine, game, hud, startMap} is the debug handle.
- Verified at gameplay scale: warm disc mane framing the golden face, good proportions, flame tail. Build clean.

### Lion → GLTF-bodied (user: "looks like toys; smooth body/legs/animations like the deer")
- Root realization: the deer the user admired is Deer.gltf from the bundled Quaternius Animated Animals pack
  (assets/animals/, CC0) — a RIGGED, smoothly-animated model. The lion was the only beast still PROCEDURAL
  (buildLion via buildQuad) → looked like a toy next to it. The pack has 12 animals but NO lion.
- Solution (reskin a ready asset, per the user's earlier suggestion): base the lion on the rigged Quaternius
  WOLF (a_wolf) — a predator quadruped with the same smooth body, correct leg length and baked walk/idle/run/
  death/eat clips as the deer — recoloured to a golden coat and with our heraldic "Lion & Sun" mane mounted on
  its head. Reads as a lion, animates like the deer. A real CC0 lion GLTF would clash with the Quaternius style;
  reskinning the wolf keeps the exact art language the user pointed at.
- Code (creature.js): extracted the mane into `lionManeGroup()` (shared, ~6 merged draw calls); added
  `buildLionAsset(scale)` = spawnAsset('a_wolf', {height:1.6·s}) → clone+golden-tint materials (lerp .72 to
  0xc8954e) → mount lionManeGroup at the Head bone's rest position (group frame faces +Z, same as the wolf and
  the mane — verified the wolf faces +Z: head z+1.21 vs tail z-0.52), nudged toward the snout; returns
  {group, anim, animType:'gltf', headH}. `buildEnemyModel('lion')` = `buildLionAsset() || buildLion()` so it
  falls back to the procedural lion until the asset loads. enemy.js already drives model.anim (mixer + play
  walk/idle/death), so no entity changes needed.
- VERIFIED structurally (2 children: skinned wolf+51 bones, separate 4-mesh mane group; mane world-pos adjacent
  to head bone) and rendered (golden body + brown head-mane visible). Could NOT finish pixel-level mane tuning:
  the preview screenshot tool degraded to timeouts / partial / black / CACHED-stale frames this session
  (camera moves but capture returns identical frames). Mane scale/offset are best-guess defaults — may need a
  small visual nudge once the tool recovers or the user confirms. Build clean.

### FIX: GLTF lion froze the game (user: "game freezes, camera not smooth")
- Cause: `buildLionAsset` returned NO `rig` (returned {group, anim, animType:'gltf', headH}). enemy.js reads
  `const rig = this.model.rig` every frame and calls `animShoulderSerpents(rig, t)` UNCONDITIONALLY (line 444),
  which did `if (!rig.shoulderSerpents) return` → throws "Cannot read properties of undefined" when rig is
  undefined. The exception aborted the rAF game-loop callback → it stopped re-scheduling → hard freeze + frozen/
  choppy camera. Map 1's FIRST wave is lions, so it froze almost immediately. (The existing GLTF path,
  assetCharacter for q_knight, returns `rig: {}` — that's why knights never crashed; I'd omitted it.)
- Fix: buildLionAsset now returns `rig: {}` (matches assetCharacter); also hardened `animShoulderSerpents`
  to `if (!rig || !rig.shoulderSerpents) return` so a missing rig can never freeze the loop again.
- Verified LIVE: map-1 first wave = 3 lions, all animType 'gltf' + rigType 'object'; manually ran
  enemy.update(0.016) → no throw; engine._ticks advanced 5447→6477 between calls and gold kept changing →
  loop running, not frozen. Build clean. (Note: rAF is throttled in the backgrounded preview tab, so
  engine.elapsed deltas during an eval await are NOT a reliable freeze signal — use _ticks across real calls.)

### Lion v3: bespoke smooth procedural rebuild (user chose "rebuild in-engine", rejected wolf-hack)
- Asset search (5-agent workflow) verified NO freely-licensed ANIMATED lion is directly downloadable: Quaternius
  has none; the good animated ones are Sketchfab CC-BY (login-gated, can't fetch); the only auto-downloadable
  animated lion is Kenney Cube Pets (CC0) but blocky-voxel. User picked: rebuild procedurally in-engine.
- Scrapped buildLionAsset (wolf-reskin) entirely; 'lion' case → buildLion(1.2). Rewrote buildLion BESPOKE (not
  via the generic buildQuad, whose BOX muzzle/jaw were the "toy" look): smooth muscular torso (deep chest, lean
  waist, strong haunches, belly, shoulder blobs — rounded spheres), 4 jointed quadLeg legs (rounded paws),
  arched neck, and a ROUNDED LION HEAD with NO boxes — cranium, brow ridge, full cheeks, smooth tapered muzzle +
  pale snout pad + dark rounded nose, hinged jaw (rig.jaw), almond amber eyes (socket+iris+pupil), ROUNDED ears
  (not pointy). Rewrote lionManeGroup to be SMOOTH (layered rounded shells + soft elongated lobes, no spiky
  cones), set back so the face reads in front. Tufted segmented tail. Fully animQuad-compatible rig
  (legs/body/neck/head/jaw/tailSegs/gait) → smooth sinusoidal walk (hip swing + knee flex + body bob + head sway).
- Verified: build clean; real map-1 lion wave = 3 enemies, animType 'quad', rig.legs=4, enemy.update() throws
  nothing (no freeze). Partial screenshots this turn confirmed smooth rounded body, jointed legs+paws, tufted
  tail, rounded mane. COULD NOT capture a full front/face view — the preview screenshot tool went fully stuck
  this session (every capture times out regardless of content; page itself alive, ticks advancing). Front face
  + mane-vs-head proportion still need a visual pass once the tool recovers / per user feedback.

### Lion v3 polish pass (blind — preview tab hidden, screenshots/loop suspended)
- Could not visually verify: the preview browser tab is visibilityState:'hidden' → browser suspends rAF, so the
  game loop never auto-ticks (engine.elapsed stays 0) AND preview_screenshot hangs/timeouts (even after manual
  engine.composer.render()). NOT an app bug — app loads, navigates menu→campaign→battle, HUD shows gold/lives/32
  cards; earlier in the session the same build rendered + ran fine. User must view at localhost:5180 (focused
  window) to see it.
- Confident low-risk polish to the face/mane balance (most-visible at gameplay): head hR 0.24→0.265 (bigger face
  reads in front of the mane), eyes larger+brighter amber (0xe7af26, hR*0.15) + added dark "tear-line" markings
  (classic lion face detail), trimmed mane shells (~6%) + pulled back (z -0.2→-0.26) so the larger head dominates
  the silhouette instead of a ball. Verified: builds clean, buildEnemyModel('lion') → quad, 4 legs, 21 head parts,
  jaw+tail rigged, animQuad runs no-error, 48 meshes. Still needs the user's eyes for final proportion tuning.

### Lion v3 grounding fix (verifiable without screenshots)
- Measured paw world-Y across the gait cycle (animQuad over a few strides): stance paws were SINKING — lowest
  paw center at -0.076, and the paw bottom sits ~0.09 below center → feet buried ~0.17 below ground while walking.
- Fix: raised bodyY by 0.1 model units (legH + bodyR*0.3 + 0.1). Re-measured: lowest paw center now +0.044
  (bottom -0.047, slightly embedded = natural grounded look), feet still lift to +0.51 during swing
  (liftRange 0.47). Proper grounded walk, no sinking. Build clean.
- This + the polish pass (bigger face, brighter eyes + tear-lines, trimmed mane) are the confident, math/structure-
  verifiable improvements possible while the preview tab stays hidden (no screenshots). Visual proportion tuning
  still awaits the user viewing localhost:5180 in a focused window.

### Lion v3 — VISUALLY ITERATED (capture workaround beat the hidden-tab block)
- BREAKTHROUGH for verification: the preview screenshot tool + game loop are dead because the preview tab is
  hidden with a 0×0 viewport. Workaround: in an eval, engine.renderer.setSize(W,H,false) + composer.setSize +
  cam.aspect, render manually (engine.composer.render()), drawImage the WebGL canvas into a 2D canvas,
  toDataURL JPEG, then fetch POST it to a NEW dev-only Vite middleware (vite.config.js `capturePlugin`, route
  /__cap) that writes capture.jpg — which I then Read. This finally let me SEE and iterate the model. (Endpoint
  is dev-only via configureServer, never in the production build; capture.jpg is a stray debug artifact.)
- Iterated the bespoke lion to a genuinely good result (verified by capture each step): thick substantial legs
  (legR 0.092→0.112, was spindly), thicker tail+tuft, narrower/longer snout + narrower cheeks (was a chubby
  blob), visible amber almond eyes (bigger iris, small pupil), softened brow + subtler tear-lines (was grumpy),
  rounder mane lobes forming a clean scalloped SUNBURST ruff (Lion & Sun). Grounded walk (feet plant, verified
  earlier). Result: smooth muscular golden body, substantial legs, distinctive sunburst mane, defined lion face
  w/ amber eyes + fangs, tufted tail — a decisive win over spiky/boxy/wolf versions. Build clean; real lion
  enemy builds quad/4-legs/48-meshes, animQuad no-error, no freeze.
- TODO if revisited: optionally remove the dev capturePlugin from vite.config.js + delete capture.jpg.

### Lion v3 — full visual redesign to acceptable quality (deer as the bar)
- Captured the bundled Quaternius DEER (a_deer, the user's quality bar) via the capture loop to study proportions:
  slender, smooth, naturally-angled legs, tapered body. Lion is stockier (predator) but matched the QUALITY bar.
- Reshaped the bespoke lion across many capture-verified iterations:
  * Body: replaced "two balls + pinched waist" then "lumpy caterpillar chain" with TWO big elongated ellipsoids
    (front + rear) overlapping deeply → one smooth continuous athletic torso; + shoulder hump (withers) + tucked
    belly. bodyLen 2.05→1.92 (compact).
  * Legs: legR 0.092→0.112 (substantial, not spindly, not clubby); grounded (feet plant, verified by paw-height math).
  * Head/face: longer narrower snout (was a broad "pug" blob), bigger amber almond eyes + small pupils, softened
    brow + subtle tear-lines (was grumpy), narrower cheeks.
  * Mane: full scalloped SUNBURST ruff with depth (shell sz 0.72→0.92, not a flat disc) + rounded lobes (Lion & Sun).
  * Thicker tail + tuft.
- Result (shown to user via show_widget data-URL render): smooth golden athletic body, substantial jointed legs,
  defined lion face, distinctive sunburst mane, tufted tail, grounded smooth diagonal walk. A genuine, recognizable
  lion matching the game's stylized art. Build clean; quad/4-legs/48-meshes, animQuad no-error, no freeze.
- Dev capture pipeline (vite.config.js capturePlugin + /__cap + capture.jpg) still in place for iteration; remove when done.

### Lion v4 — REAL rigged+animated GLB via Meshy.ai (the accepted solution) — 2026-06-14
- Procedural lions hit a hard quality ceiling ("dolls/toys/wolf-body"); user OK'd buying a Meshy.ai sub and
  driving the site. Generated a "Stylized Low-Poly Male Lion" (Stylized Realism), auto-rigged ("Quadruped Dog",
  27 bones: Hips/tail×5/backlegs/chest/head/ears/frontlegs), applied the "Walking" clip, exported GLB.
- Download arrived as a ZIP (despite "single file"): inside = *_Character_output.glb (rig, no anim) and
  *_Animation_Walking_withSkin.glb (rig+skin+walk) — used the latter. Raw was 26.7 MB, ~26 MB of it ONE 4K PNG.
- OPTIMIZED with @gltf-transform optimize --compress false --texture-compress webp --texture-size 1024
  → 27.97 MB → 0.6 MB. Geometry left UNCOMPRESSED on purpose (game's GLTFLoader has no DRACOLoader). Kept
  EXT_texture_webp + KHR_materials_ior/specular (all supported by three r166). → public/assets/animals/Lion.glb.
- Integration (reused the EXISTING proven GLTF enemy path, like q_knight):
  * assets.js MODEL_FILES: a_lion: 'assets/animals/Lion.glb'. No ROT_FIX entry (faces +Z natively).
  * creature.js case 'lion': assetCharacter('a_lion',{height:1.86}) || buildLion(1.2)  (procedural = load/offline fallback).
  * assetCharacter returns {group, rig:{}, anim:inst, animType:'gltf', headH}; enemy.js update loop's
    `this.model.anim` branch already drives a.play('walk'/'idle') + mixer.update — zero new enemy code.
  * Single clip "Armature|Unreal Take|baselayer" doesn't match walk regex, but spawnAsset's single-clip fallback
    maps it to walk+run+idle. Verified actions: {walk,run,idle}.
- VERIFIED via the REAL pipeline (rewrote liontest.html to call preloadAssets+spawnAsset, screenshotted in real Chrome):
  faces +Z (head bone z=+0.95 vs Hips z=-0.92), GROUNDED (feet min.y=0.035), size 1.33 tall × 2.12 long,
  walk animation cycles (leg pose changes between frames), beautiful maned Shahnameh lion. No console errors; menu boots.
- CLEANUP DONE: removed dev capturePlugin from vite.config.js + deleted capture.jpg (preview screenshot tool works
  again now); deleted liontest.html + lion_raw/opt.glb scratch; CREDITS.md credits Meshy.ai CC-BY 4.0.
- Pattern for future creatures: Meshy generate → Animate(rig+walk) → export GLB → gltf-transform optimize
  (webp 1024, no draco) → drop in public/assets/animals → register a_* + route case in buildEnemyModel via assetCharacter.

### Lion v4.1 — walk animation tuning: fixed foot-skate (timeScale calibration) — 2026-06-14
- User: "the generated animation is not good need more careful tune." Ran a 4-agent diagnose workflow
  (clip-data forensics + playback math + options research + synthesis).
- ROOT CAUSE (not root-motion — the clip is a clean IN-PLACE walk, Hips net displacement ~0): FOOT-SKATE
  from an uncalibrated walk timeScale. enemy.js played walk at timeScale=max(0.5, speed/baseSpeed)=1.0 for the
  lion, but the lion's WORLD speed is 3.0 while the clip's foot-plant speed at timeScale 1 is far slower →
  the paws ice-skated forward (~+0.44 world-units drift per planted-foot contact, measured).
- FIX: tie the walk timeScale to world speed so feet plant: timeScale = (speed / walkStride) * walkDuration.
  * src/core/assets.js spawnAsset: new opt `walkStride`; exposes `walkStride` + `walkDuration` (walk clip dur)
    on the returned anim object. null => legacy formula (all other GLTF enemies UNCHANGED).
  * src/models/creature.js assetCharacter: threads `walkStride` through to spawnAsset; case 'lion' passes
    walkStride: 0.96.
  * src/entities/enemy.js (~428): if (a.walkStride) timeScale = clamp((speed/walkStride)*walkDuration, 0.2, 6);
    else legacy max(0.5, animSpeed). Scoped so only the lion (and future opt-in assets) use it. Also removes the
    0.5 floor problem for slowed lions (legs now slow in lockstep with the body).
- CALIBRATION METHOD (key learning): naive paw peak-to-peak stride (0.56) UNDER-measures the effective stride
  and gives a frantic ~5.4 timeScale. The accurate method: simulate body advancing at speed=3 while the clip
  plays at timeScale T, measure the planted paw's world-drift during ground contact, sweep stride to minimize
  it. Optimum stride ≈ 0.96 → timeScale ≈ 3.13 (front slip -0.008, back -0.001 ≈ planted) AND a natural ~3.1 Hz
  trot, not frantic. Verified the full game path: buildEnemyModel('lion').anim.walkStride===0.96, computed ts 3.13.
- VERIFICATION CAVEAT: the Claude_Preview pane tab BACKGROUNDS and suspends requestAnimationFrame, so animated
  content freezes and preview_screenshot times out. Reliable path for ANIMATED 3D: open the localhost preview in
  the user's REAL foreground Chrome (Claude-in-Chrome new tab → navigate localhost:5180 → computer screenshot).
  Static scenes still screenshot fine from the preview pane; numerical checks via preview_eval work regardless
  (eval runs in a suspended tab; rAF does not).
- TODO/offered: the lion still has ONLY the walk clip (idle/run/attack/death all fall back to it). Highest-value
  follow-up = Meshy Animate "Download → Animation → All Added → Single File" to bake idle+attack+hit+death into
  one GLB; assets.js CLIP_PREFS + enemy.js already auto-map those by clip name (zero code). Optionally re-audition
  a heavier/longer-stride run take. Manage expectations: Meshy's library is humanoid-authored.

### White Elephant (پیل سپید) — Meshy GLB replaces procedural buildElephant — 2026-06-14
- First component done under the new handoff process ([[meshy-handoff-process]]): I gave a spec card (Shahnameh
  white-war-elephant Meshy prompt, designed via a 4-agent prompt panel), user generated+rigged+walk-animated in
  Meshy and downloaded the zip; I optimized + integrated.
- Same pipeline as the lion: zip had *_Character_output.glb + *_Animation_Walking_withSkin.glb (Quadruped Dog rig,
  27 bones identical to lion, 1 walk clip "Armature|Unreal Take|baselayer"). Raw 31 MB (≈29 MB PNG).
- gltf-transform optimize --compress false --texture-compress webp --texture-size 1024 → 31 MB → 0.72 MB.
  public/assets/animals/Elephant.glb. assets.js: a_elephant. creature.js case 'elephant':
  assetCharacter('a_elephant',{height:3.75, walkStride:2.6}) || buildElephant(1.5).
- Calibration: speed 1.0 (slow tanky beast, def 'white-elephant' enemies.js:129, hp 2400). Stride sweep (min
  planted-paw drift) → walkStride 2.6 → timeScale 0.385 (≈0.38 Hz ponderous plod, foot-planted). Faces +Z
  (head z 2.27 > hips 0), no rotFix. Verified full path: buildEnemyModel('elephant').anim.walkStride===2.6.
- Visual (real Chrome, elephant vs lion vs 1.8m post): monumental white war-elephant, big ivory tusks, hanging
  trunk, turquoise+bronze scaled battle caparison; bone-span H 3.26 vs lion 1.62 (~2×, correctly monumental),
  grounded, +Z. User verdict on the raw model: "not perfect but not bad". Only walk clip (idle/run fall back to it).
- GOTCHA: in a preview_eval you CANNOT `import('three')` (bare specifier unresolved at runtime) and a skinned
  Meshy mesh's geometry bbox is near-zero (size lives in bones) so localToWorld-bbox gives garbage size — use
  bone world-position span for size/grounding, or verify visually in real Chrome.
- CREDITS.md updated (Meshy CC-BY now lists lion + elephant). Cleaned scratch (elephtest.html, eleph_raw/opt.glb).

### Lion v5 — improved model swapped in (fuller mane) — 2026-06-14
- User regenerated the lion in Meshy (better/fuller mane) and re-downloaded. Same rig + single Walking clip.
- Optimized (27.97 MB → 0.62 MB webp/1024) and overwrote public/assets/animals/Lion.glb. Confirmed it's a
  genuinely different mesh (distinct hash) and visibly better (side-by-side new vs old: fuller, more layered,
  more majestic mane). Faces +Z, walk/run/idle, no console errors.
- Re-ran the stride sweep on the new mesh: walkStride 0.96 still optimal (front -0.008/back -0.001 at speed 3) —
  rig/walk/proportions unchanged, so NO code change needed (creature.js already passes 0.96).

### v-Next M0 — Difficulty modes (Easy/Normal/Hard) — 2026-06-14
- First v-Next code win (roadmap step 8). New src/core/difficulty.js: presets
  easy{gold×1.4,hp×0.8,lives×1.5} / normal{×1,×1,×1} / hard{gold×0.85,hp×1.25,lives×0.7}, persisted via settings.js
  ('difficulty' added to DEFAULTS). Normal = exact tuned baseline (×1), so existing balance unchanged unless opted in.
- Hooks: game.js constructor scales startGold + lives by the preset and sets this.diffHpMult; enemy.js maxHp
  multiplies by (game.diffHpMult||1). Pre-map picker added to menus.js map-intro (#miDiff, _renderDiff) — 3 gbtn
  buttons, active-highlight, EN/FA i18n keys (difficulty.label/easy/normal/hard), .diffrow/.gbtn.small/.active CSS.
- Verified end-to-end: clicking Hard persists settings.difficulty='hard'; for map zabulistan (320g/20 lives) →
  gold 272 / lives 14 / enemy HP ×1.25; Normal stays 320/20/×1. Picker renders correctly in FA/RTL (real-Chrome
  screenshot), Normal default highlighted. No console errors.
- NOTE: the audit's "toast DOM leak" was OVERSTATED — hud.js toast() already self-removes after 3.3s (setTimeout
  remove). Not a leak; only a fade-out polish is missing. Adjusted M0 priorities accordingly.
- Remaining M0 (next): keyboard shortcuts + onboarding splash (step 2), wave modifiers (9), prestige (10),
  accessibility pass (ARIA/Esc/focus, step 1). Soldier archetype-A Meshy card handed to user (parallel track).

### v-Next M1 — Soldier archetype A (Heavy Persian Warrior) validated + wired — 2026-06-14
- FIRST Meshy HUMANOID (biped). Validated the humanoid pipeline end-to-end (de-risks the whole soldier/hero track):
  zip had Character_output + Merged_Animations GLB with NINE clips (Attack, Dead, Idle_3, Running, Run_03, Walking,
  Double/Triple_Combo_Attack, Fall_Dead...). Standard Mixamo-style rig (Hips/Spine/Head/Left+RightHand/UpLeg/Leg/Foot).
- Optimized 30.6 MB → 1.0 MB (webp/1024). public/assets/models/Soldier_Heavy.glb, key a_soldier_heavy (in MODEL_FILES).
- assets.js CLIP_PREFS.death: added /dead/i + /^die/i so Meshy "Dead" maps (was only /death/i). Now all 5 map:
  idle=Idle_3, walk=Walking, run=Run_03, attack=Attack, death=Dead.
- VALIDATION (real Chrome, real path buildSoldierModel('veteran')): NOT headless (Head bone+mesh), faces +Z (no
  ROT_FIX), grounded (feetY 0), natural idle/walk poses (not T-posed — the arms-out frame is just LoopOnce attack
  clamping with no base under it, a harness artifact; in combat attack is a strike() one-shot over the base).
  Weapon ATTACHES at correct scale: 3 sword meshes parented to RightHand via assetCharacter (Mixamo bone matched
  by the /hand/i + /right/i regex). buildSoldierModel returns animType 'gltf'. Looks like an excellent Sassanid
  Persian heavy infantryman (conical helmet+nasal+mail drape, lamellar cuirass, crimson/bronze, beard).
- WIRED: 7 heavy/melee ASSET_SOLDIERS types (spearman/shieldGuard/veteran/halberdier/caravanGuard/shockInfantry/
  chainBinder) → a_soldier_heavy (tint+weapon still differentiate). Light/ranged/robed/worker (fireKeeper/hunter/
  nightWarden/forgeWorker/mason) stay q_knight until the light-archer / robed archetypes arrive. No console errors.
- KNOWN FOLLOW-UPS: (1) weapon RESTS POINTING DOWN — Mixamo RightHand +Y axis differs from q_knight's; needs a
  small per-archetype weapon-rotation fix in assetCharacter for Mixamo-rigged assets. (2) soldier.js:242 plays walk
  at timeScale max(0.6,speedMult) (NOT stride-calibrated like enemy.js) — parity with q_knight; if the heavy
  soldiers foot-skate while marching, add walkStride handling there + calibrate a_soldier_heavy's stride.

### v-Next M1 — Soldier archetypes B/C/D wired (4-archetype army) + Mixamo weapon fix — 2026-06-14
- User batched the remaining 3 humanoids. All Mixamo bipeds, rich multi-clip (incl. Archery_* for the archer):
  * B scout-archer -> public/assets/models/Soldier_Light.glb (a_soldier_light), 1.3 MB. Clips incl Archery_Aim/Shot.
  * C woman warrior -> Soldier_Female.glb (a_soldier_female), 1.4 MB (file was generic "Meshy_AI_biped.zip"; visually
    confirmed female). Attack/Idle/Walk/Run/Dead.
  * D robed mobed/fire-keeper -> Soldier_Robed.glb (a_soldier_robed), 1.7 MB.
- assets.js: registered the 3 keys; CLIP_PREFS.attack += /Archery_Shot/i,/archery/i so the archer maps attack=Archery_Shot.
- ASSET_SOLDIERS wiring (creature.js): hunter->a_soldier_light(bow); fireKeeper->a_soldier_robed(staff);
  spearMaiden->a_soldier_female(spear, was procedural-only); nightWarden->a_soldier_female(lantern, FIXED a latent bug
  where this female unit used the MALE q_knight). forgeWorker/mason stay q_knight (no archetype fits a hammer-laborer);
  acolyte stays procedural (Simorgh-feather identity).
- WEAPON ORIENTATION FIX (assetCharacter): Mixamo/Meshy hand bones point +Y down the fingers, so handle-along-+Y weapons
  attached pointing into the ground. Added `if (/^(left|right)hand$/i.test(hand.name)) w.rotation.x = Math.PI;` — scoped
  to Mixamo "RightHand"/"LeftHand" so q_knight is unaffected. Verified (4-up real-Chrome, walk clip): all carry weapons
  upright (sword/bow/spear/staff). Distinct identities confirmed; no console errors.
- STILL OPEN: (1) soldier.js:242 walk timeScale not stride-calibrated — watch for foot-skate while marching, add
  per-archetype walkStride if needed. (2) sizes 1.3-1.7 MB each (heavier than the 0.8 target) — could re-optimize textures
  to 512 if deploy budget tightens (~5 MB for 4 soldier archetypes). (3) bow attaches to right hand (minor).

### v-Next step 26 (started) — Persian weapon silhouettes in makeWeapon() — 2026-06-14
- Rewrote the 5 main combat weapons in src/models/humanoid.js makeWeapon() with authentic Persian shapes (procedural,
  zero deploy, lifts ALL soldiers+enemies+heroes at once since they share makeWeapon):
  * sword -> SHAMSHIR: curved segmented blade (10 overlapping box segs arcing in Y-Z, tapering) + gold cross-quillons +
    inscription band + leather grip + pommel. (Was a straight box blade = European broadsword.)
  * mace -> GORZ: 6 radial iron flanges around a core + knob + pommel (was box head + 2 cones).
  * axe/halberd -> TABARZIN: flattened partial-torus crescent blade + back spike (was a flat triangular disc).
  * spear/lance -> NEYZEH: socketed leaf head (scaled octahedron) on a shaft (was a plain cone).
  * bow -> KAMAN: deeper belly arc + leather grip wrap + string.
- Verified in real Chrome (weapon row + a veteran holding the shamshir): curves read, shamshir held curves up naturally
  after the Mixamo 180-X flip; smoothed the blade with overlapping segments (N=10, seg×1.55) to hide the steps. No console errors.
- STILL OPEN on step 26: hammer/staff/dagger/banner/lantern kept as-is (fine); hero weapon keys
  (scepter/stone/crown/talon — currently render nothing in makeWeapon) not yet added; could refine the tabarzin crescent
  orientation and the neyzeh leaf. Step 27 (Meshy hero/signature-weapon GLBs) deferred to M4.

### v-Next step 27 (started) — Meshy STATIC weapon GLBs (shamshir + gorz) — 2026-06-14
- PIVOT (user): detailed Meshy soldiers made the procedural weapons look too simple → weapons go Meshy too. Procedural
  makeWeapon (step 26) stays as the fallback.
- First 2 static weapons: Persian Curved Saber -> Shamshir.glb (a_wpn_sword), ox-headed gorz-e-gavsar -> Gorz.glb
  (a_wpn_mace). Both static text-to-3D (1 mesh, no rig), modeled vertical/centered. Optimized 11-15 MB -> 0.4-0.5 MB
  (webp 512). public/assets/weapons/.
- INFRA: assets.js cloneAssetScene(key) (deep-clone a loaded static scene, castShadow/no-cull). creature.js
  weaponModel(kind): returns cloned a_wpn_<kind> with a per-kind WEAPON_FIX (scale/rotX/y to seat the GRIP at the hand),
  else makeWeapon(kind). assetCharacter now calls weaponModel(weapon) instead of makeWeapon (scoped to the GLTF
  soldiers; the hand-scale-comp + Mixamo 180-X flip still apply on top). Registered a_wpn_sword/mace in MODEL_FILES.
- CALIBRATED on a soldier (veteran=shamshir, chainBinder=gorz): WEAPON_FIX sword{scale .40,y .18} mace{scale .34,y .17}
  — gripped at the hand, blade/head UP, proportional, matching the soldier quality. Verified walk clip in real Chrome. No console errors.
- NEXT: user batches the rest (neyzeh/spear, kaman/bow, tabarzin/axe, staff -> a_wpn_spear/bow/axe/staff), then the
  remaining (halberd/hammer/lantern/dagger/banner/lance) + hero signatures. Each: same static pipeline + a WEAPON_FIX entry.
  Procedural humanoids (heroes, non-GLTF enemies) still use the improved makeWeapon (step 26).

### v-Next step 27 — weapon ANGLE fix (forward carry) — 2026-06-14
- User: weapons sat behind the soldier and vertical; wanted them in FRONT at an angle. Added a forward tilt to
  WEAPON_FIX: rotX = -50° (radians) for sword+mace; y 0.15, scale 0.40. Tuned live on a soldier (forward arrow = +Z;
  the local X-rotation sweeps up-back→up→forward-down, so -50 lands "forward, slightly down, in front"). Verified
  walk clip from the gameplay 3/4 angle — both shamshir + gorz carried forward/angled. Baked + no console errors.
- The -50 forward tilt is the shared default for future weapon GLBs (same Mixamo rig). CAVEAT: long weapons
  (neyzeh/staff) may want a gentler tilt — calibrate per-weapon when they land.

### v-Next step 27 — per-weapon idle carry angles — 2026-06-14
- User (fa): sword should hang tip-DOWN at a slight angle (grip at the hip); spear should stand VERTICAL tip-UP.
  So WEAPON_FIX.rotX is now PER-WEAPON (not a shared forward tilt). Tuned live on a marching soldier with a +Z
  forward-arrow marker.
- sword (shamshir): rotX 162° → blade hangs tip-down, slight forward angle, grip at the hip. y 0. (verified walk clip)
- mace (gorz): kept rotX -50° (forward/in-front) — user only re-specified sword+spear; left the mace as-is.
- spear (neyzeh): added a placeholder rotX -49° (vertical tip-up) in WEAPON_FIX — used only once the a_wpn_spear GLB
  exists (weaponModel falls through to makeWeapon until then). Will fine-tune to true-vertical when it lands.
- NOTE on the rig: the weapon's local-X rotation sweeps a CONE in world space (the Mixamo hand bone is rotated), so
  "true vertical/straight-down" isn't a clean single value — tune each weapon's rotX by eye against the forward arrow.

### v-Next step 27 — 4 more weapons (neyzeh/kaman/tabarzin/scepter) + an aim helper — 2026-06-14
- User generated spear/bow/axe/scepter as static GLBs. Optimized 11-14 MB → 256-413 KB (webp 512). public/assets/weapons/
  Neyzeh/Kaman/Tabarzin/Staff.glb; registered a_wpn_spear/bow/axe/staff. weaponModel clones them per kind, else makeWeapon.
- ANGLE solution: the rotated Mixamo hand bone CONES a single tilt, so "true vertical" isn't reachable with one rotX.
  Built an __aim(dir) helper that computes the full Euler (rotX/Y/Z) to point a weapon's +Y at any WORLD direction in
  the idle pose (inverse hand quaternion ∘ the 180-X flip ∘ setFromUnitVectors). WEAPON_FIX now stores rotX/Y/Z + scale.
- Aimed: spear & scepter & bow → vertical tip-UP; tabarzin → head up-forward; (sword tip-down, gorz forward kept). Verified
  in the WALK clip (the common moving state): spear tip-up, bow vertical at side, axe head-up, scepter upright — all natural.
- Pose caveat: weapons rigidly follow the hand, so gesturing IDLE clips (the robed mobed) swing the weapon; it reads fine
  in walk and for arms-down idles. CREDITS updated; no console errors.

### v-Next step 27 — weapon idle pose corrected to the user's reference guide — 2026-06-14
- User sent a "Weapon Idle Pose Guide" image: sword hilt at the waist, blade tip-DOWN at a slight angle; spear DEAD
  vertical, tip-UP, tall (tip above head, butt near ground). Verified in a paused neutral-idle front view (bg matched
  the reference, with a green vertical guide line).
- Sword (162°) already matched. Spear corrected: re-aimed to true vertical at the NEUTRAL idle pose (key: pause the idle
  at a representative frame before __aim, so it's vertical in idle not just at a random frame) and enlarged — spear:
  { scale 0.85, rotX 0.5°, rotY 0.1°, rotZ 24.2° } → dead vertical, tip above head, butt near ground, gripped mid-shaft.
- LESSON: aim weapons against a PAUSED neutral idle frame (the pose the user judges), not a live random frame.

### v-Next M0 — Random Wave Modifiers (step 9) — 2026-06-14
- "you decide" → picked the highest-value asset-independent M0 win. New src/game/wavemods.js: 5 modifiers, each a
  TRADEOFF — haste(⚡ +35% speed/-15% hp), fortified(🛡 +0.25 armor/-12% speed), swarm(👥 +45% count/-38% hp),
  dread(💀 +20% hp/+10% speed/+30% bounty), reinforced(🏰 +30% hp/+0.15 armor/+50% bounty). pickWaveMod(mapId,waveIdx):
  30% chance, deterministic per (map,wave) like makeWave; never on boss waves.
- Wiring: waves.js applies countMult→budget + hpFactor→hpMult and returns `modifier`. game.js stores this.waveMod,
  applies bountyMult in onEnemyKilled, emits mod in 'waveStarted'. enemy.js ctor applies armorAdd + speedMult from
  game.waveMod (null-safe → unmodified waves unaffected). hud.js: a #waveMod top-bar badge (_setWaveMod) + a toast on
  wave start, cleared on wave end; EN/FA i18n (wavemod.*); .statchip.wavemod gold pulse CSS.
- Verified: pickWaveMod across maps (zabulistan w4=fortified, kabul gets 4 different mods, etc.); makeWave returns +
  applies the modifier; in real Chrome the badge "⚡ تندتاز" renders in the top bar and a wave spawns fine; no console
  errors. M0 progress: difficulty modes + wave modifiers done; remaining M0 = keyboard shortcuts, onboarding splash, prestige, accessibility.

### Published to GitHub + GitHub Pages — 2026-06-14
- Public repo: https://github.com/araxis/borj  ·  Live: https://araxis.github.io/borj/ (verified loads).
- AI-wording scrub: removed "Meshy"/"AI-painted" from src/ comments (atlas.js, creature.js, assets.js); reworded the
  CREDITS Meshy entry to a MINIMAL CC-BY attribution (free-plan = attribution legally required — the one kept exception);
  rewrote README (dropped memory/ refs); cleaned "Prototype/temporary internal title" from index.html title, app.title
  (EN+FA), package.json. NO Co-Authored-By/Claude trailer on the commit (user requirement overrides the default).
- .gitignore excludes: node_modules/, dist/, memory/ (dev logs), .claude/ (tooling), /atlases/ (1.9 GB raw source —
  game ships the optimized copies in public/), ref_*.jpg/thumb_*/decode_anim.cjs (scratch). Repo = 235 MB, 1825 files,
  largest file 8.4 MB (under GitHub's 100 MB cap).
- Commit authored "Meisam Alifallhi <1418779+araxis@users.noreply.github.com>" (links to the account, privacy noreply).
- Pages enabled via gh api (build_type=workflow). Pipeline .github/workflows/deploy.yml (checkout→setup-node 20→npm ci→
  vite build→upload-pages-artifact→deploy-pages). First run SUCCEEDED. Minor: Node-20 action deprecation warning (forced
  to Node 24 from Jun 16 2026; @v4 actions handle it — no action needed now).
- NOTE: memory/ is now gitignored — these dev logs stay LOCAL only, never published.

## 2026-06-14 — Session 3: asset-prompt guide + tower-readability VFX

### Asset-prompt guide (user generates in parallel)
- Ran a 6-agent parallel workflow (one per category, grounded in towers.js/heroes.js/enemies.js/creature.js) →
  compiled `memory/asset-prompts.md`: 66 Meshy spec cards. Counts: 6 weapons (static) · 13 bosses/divs (rigged) ·
  10 heroes (rigged, Simorgh=bird) · 5 buildings (static) · 32 towers (static). Recommended order weapons→bosses→
  heroes→buildings→towers; towers/bosses flagged do-not-generate-all-at-once with HIGH starter subsets.
- Verified the 6 weapon kinds (lance/halberd/hammer/dagger/banner/lantern) are real makeWeapon cases already
  requested by units (lance currently shares spear model, halberd shares axe → dedicated GLBs differentiate them).
- Auto-memory pointer: `asset-worklist.md` + MEMORY.md index line.

### Tower-readability VFX (asset-independent, all 4 verified)
- Fire-altar ember column (tower.js:472): role:'fire' towers emit a perpetual buoyant flame-core/ember/spark column
  (not only on-attack). Respects reducedMotion.
- Range-ring colour by role/dmgType + buff-radius rings (main.js ringFor): fire=ember, magic=violet, true=pale-gold,
  aura/heal=green, etc. Pure buff/heal towers (damage 0) now show their EFFECT radius ((range||11)*1.1 for aura,
  heal/repair .radius) in green instead of a misleading teal attack ring at the wrong radius.
- Aura connection lines (main.js showAuraLinks): selecting a buff/aura/repair tower draws faint LineSegments to the
  towers inside its reach (mirrors _recomputeAuras radius). Colour matches the tower's ring.
- Selection footprint ring (main.js selRing): tight gold pulsing ring hugging the selected tower's model.radius*1.35,
  disambiguates which tower is selected in a cluster. Pulse via engine.onUpdate. Wired hide() into every deselect
  point (build place/exit, escape, enemy-select, onSelectionCleared, cleanupBattle).
- Found prestige already covered by "Continue Endless" (main.js:254) — redirected effort to the above.
- VERIFY METHOD (reusable): the preview pane suspends rAF (no render loop), but selection visuals are set
  synchronously by the pointer handler. So: dynamic-import campaign.js + __dbg.startMap(map,false,true) sandbox →
  game.buildTower a cluster → dispatch synthetic PointerEvents at the tower's projected screen pos → read back
  scene.children ring/line state (colours/scale/drawRange) for exact functional proof. For a screenshot, hide
  '.overlay.visible' (startMap via __dbg bypasses menus.hideAll), manually set engine.camera, call
  renderer.render(scene,camera) once, then preview_screenshot. Confirmed: aura ring green 4fd07a r14.3, 2 links;
  fire ring ember ff6a1f r8.05 (=7×1.15, picking up the neighbour aura's rangeBonus — live stats); selRing ffe9a8.

### Weapons batch 2 — the remaining 6 GLB weapons (lance/halberd/hammer/dagger/banner/lantern)
- User generated all 6 in Meshy (Crimson_Banner_Spear→Lance, Crescent_Moon_Halberd→Halberd, Gilded_Stonehammer→Hammer,
  Emberblade→Khanjar, Radiant_Sun_Banner→Drafsh, Amber_Lattice_Lantern→Fanus). Optimized via gltf-transform
  (webp/512). HEAVY ones needed a 2nd aggressive `simplify` pass — Fanus was 803K verts/25.7MB → ratio 0.04 → 2.4MB;
  Drafsh/Hammer/Khanjar 120-127K verts → ratio 0.18-0.22 → <1MB. (optimize's default simplifier is too timid.)
- Registered a_wpn_lance/halberd/hammer/dagger/banner/lantern in MODEL_FILES; added WEAPON_FIX entries.
- CALIBRATION harness (reusable): added `buildWeaponTestModel(weapon, asset)` export (creature.js) + `__dbg.weaponTest`
  (main.js). In the preview: weaponTest(kind[,asset]) builds a rigged soldier holding any kind → `engine.stop()` to
  freeze the loop (else rts/composer repaint over the forced frame with the far camera) → set engine.camera → 
  renderer.render → screenshot. For fast angle search, stash the weapon node (`__wsc = handGroup.children[0]`) and
  tweak `__wsc.rotation` LIVE + re-render, then bake the winning Euler into WEAPON_FIX. NOTE: dynamic-import of a
  stateful module (assets.js) gives a SEPARATE instance w/ empty cache — always verify via the app's real __dbg.
- Hand conventions differ: Mixamo soldiers (a_soldier_heavy/female) flip the weapon 180°X; q_knight does NOT. So the
  SAME kind needs different angles per rig. lance/halberd/banner/dagger seeded from spear/sword worked first try;
  lantern needed spear-vertical (was horizontal from the mace seed); hammer on q_knight needed rotX:180° (head-up;
  axe-seed gave head-down because q_knight skips the flip).
- RENDERING REACH: GLB weapons attach only on assetCharacter units (creature.js:62); procedural buildHumanoid uses
  makeWeapon (humanoid.js:372). So of the 6, ONLY halberd (halberdier→a_soldier_heavy), lantern (nightWarden→
  a_soldier_female), hammer (forgeWorker/mason→q_knight) render on CURRENT units. lance/banner/dagger sit on
  procedural units (lancer is mounted, bannerBearer deliberately procedural, courtier/traitor are enemies) → they're
  calibrated + ready but only light up once a GLB hero/unit wields them (heroes use lance/dagger).

### Bosses batch A — 4 humanoid tyrant/div bosses (all verified)
- User generated all 4 (Emperor_of_the_Twin_S→Zahhāk, The_Arcane_King_of_th→Afrāsiyāb, Horned_Warlord_of_the→Arjāsp,
  Iron_Lion_Warlord→Kāmus). Each zip has a Character_output.glb (rig) + a *_Merged_Animations.glb (~16.7MB, rig+clips)
  — use the MERGED one. Optimized webp/1024 → ~1.8MB each.
- Registered a_zahhak/a_afrasiab/a_arjasp/a_kamus in MODEL_FILES (assets/models/). Wiring in creature.js:
  - Afrāsiyāb + Arjāsp added to ASSET_ENEMIES (turanianKing→a_afrasiab sword 2.0; warKing→a_arjasp axe 1.95), NO tint
    (keep native palette). Tried before the procedural HUMAN_SPECS branch.
  - Kāmus: changed ASSET_ENEMIES.warlord asset q_knight→a_kamus (lance, 1.95). Renders DISMOUNTED (the ASSET_ENEMIES
    path never added the horse anyway; the mounted HUMAN_SPECS.warlord is only the fallback).
  - Zahhāk: prepended `assetCharacter('a_zahhak',{height:2.3,weapon:'sword'})` to the special 'zahhak' case; the GLB has
    the shoulder serpents baked into the mesh so we skip the procedural serpent-building.
- Verified via __dbg.enemyTest (new debug helper in main.js, like weaponTest but uses buildEnemyModel): all 4 load as
  animType 'gltf' (not procedural fallback), all 5 CLIP_PREFS states map (idle/walk/run/attack/death — Meshy names like
  Walking/Idle_02/Running/Axe_Spin_Attack/Dead all match the regex), RightHand bone present, weapon mesh attached.
  Visual: Zahhāk (serpent on shoulder + crown + robe + shamshir), Afrāsiyāb (crown-helm + violet coat + shamshir),
  Arjāsp (horned helm + scaled plate + tabarzin), Kāmus (crested helm + crimson lamellar + vertical lance) — all great.
- TODO (deferred): walkStride not calibrated for bosses (default timeScale 1.0, like the soldiers). Watch for foot-slide
  in-game on the taller models (height 2.0-2.3) and calibrate if visible. Next: Batch B (monstrous-biped divs).

### Bosses batch B — 6 divs + the sorceress (all verified)
- User generated 6; Meshy NAMES were misleading (all "Brute/Warlord/Behemoth"), so I optimized to TEMP descriptor keys
  (a_b_ashen etc.), rendered each via __dbg.weaponTest(null, key), and mapped by APPEARANCE — the reliable method.
  RESULT (name → boss): Ashen_Warlord→AKVĀN (whirlwind lower body!), Violet_Veil_Empress→SORCERESS, Dreadmaw_Warlord→
  ARZHANG (green hide + banner-sash), Stonebound_Brute→DIV-E SEPID (chalk-white, 4 horns, shoulder fur), Stonejaw_
  Behemoth→KHARVAZĀN (pot-belly behemoth), Stonebound_Warlord→OLĀD (slim, single horn, rope-bound). LESSON: never trust
  Meshy auto-names; render + map.
- Optimized webp/1024 → ~1.7-2.0MB. Final files: animals/DivSepid.glb, ArzhangDiv.glb, AkvanDiv.glb, KharvazanDiv.glb,
  OladDiv.glb, models/Sorceress.glb. Keys a_divsepid/a_arzhang/a_akvan/a_kharvazan/a_olad/a_sorceress.
- Wired buildEnemyModel: divSepid/divBrute/divScout = `assetCharacter(...,{height}) || buildDiv(...)`. divCommander =
  `assetCharacter('a_arzhang',{height:2.6,weapon:'banner'})` (banner attaches to RightHand — looks great with the sash).
  akvan = `assetCharacter('a_akvan',{height:2.2})` then `{...ak, animType:'fly'}` (skip the procedural veil sphere; GLB
  has its own wind). sorceress = `assetCharacter('a_sorceress',{height:1.7,weapon:'staff'})` (skip glow sphere; GLB has
  the chest gem). Heights: divSepid 3.4, kharvazan 3.0, arzhang 2.6, akvan 2.2, olad 2.0, sorceress 1.7.
- Verified: all 6 load as GLB (akvan's animType is 'fly' so check m.anim.actions not animType==='gltf'), all 5 clips map,
  banner + staff attach (wpnMeshes 1). Minor: Akvān has a small gold pedestal disc baked at the base of its whirlwind
  (only div with a base — it floats, so acceptable). walkStride still deferred. Next: Batch C (Azhdahā dragon, Haftvād worm).

### Bosses batch C — Azhdahā dragon + Haftvād worm (STATIC, Meshy can't rig these yet)
- User generated 2 STATIC meshes (Meshy_AI_Azhdaha_output.glb / Worm_output.glb — single _output.glb, NO rig/clips, the
  user noted Meshy animation isn't supported for these shapes yet). Optimized webp/1024 → Azhdaha 1.32MB, Worm 1.5MB
  (optimize's simplify was enough, no 2nd pass). Files animals/Azhdaha.glb + Worm.glb; keys a_dragon + a_worm.
- NEW 'crawl' animType (enemy.js, after the 'fly' handler): for a rigless static GLB it fakes life with a slither weave —
  body roll (rotation.z), head weave (rotation.y), subtle undulation (position.y), all sine-based on this.model.group,
  damped when blockedBy. (The procedural buildDragon/buildWorm use rig-based animSerpent; the GLB has no rig so we sway
  the whole group.)
- Wiring (creature.js cases 'dragon'/'worm'): `assetCharacter('a_dragon',{height:1.5,walkStride:1.0}) || buildDragon`;
  then FORWARD-COMPATIBLE — if the GLB ever has clips (re-export when Meshy supports it) use the full gltf path, ELSE
  return {group, rig:{}, animType:'crawl'} for the static sway. (`hasClips = d.anim?.actions && Object.keys(...).length`.)
- FACING: crawlers must lead head/maw at +Z. Worm already faces +Z (rotFix 0). Dragon head faced -X natively → added
  ROT_FIX.a_dragon = +Math.PI/2 (verified by live-rotating the inner group + viewing from +Z). The crawl weave writes the
  OUTER group's rotation.y so it must NOT clash with the facing fix → facing goes on the INNER group via rotFix. ✓
- Verified visually: dragon (plated green/bronze scales, bat wings, spiny back, faces +Z) + worm (ringed grub, circular
  toothed maw + mandibles, maw leads +Z) both load as animType 'crawl', look great. The in-MOTION sway is best confirmed
  in real gameplay (the test harness doesn't run enemy.update). SECTION 2 (all bosses A/B/C) COMPLETE. Next: heroes.

## Heroes — NEW hero-figure system + 8 of 10 integrated (2026-06-14)
- KEY DISCOVERY: there was NO hero 3D system at all — heroes were only HUD portraits + stat bonuses. Built the feature:
  when a hero commands a tower, a rigged hero figure now STANDS ON the tower platform (idle clip + bone-attached signature
  weapon), beside the existing gold hero-rank ring.
- NEW `heroModel(heroDef)` (creature.js): `assetCharacter('Hero_'+id.replace(/-/g,'_'), {height, weapon})`; weapon=null
  for 'talon'/'token' (Simurgh/Tahmineh). HERO_HEIGHT map for per-hero scale (rostam 1.95 tallest).
- tower.js wiring: `_addHeroFigure()`/`_removeHeroFigure()` called from `_addHeroStandard()` (so it spawns on assign +
  on age-up rebuild) and torn down in `unassignHero`. Mixer ticked in `update()` (`this._heroModel.anim.mixer.update(dt)`).
  Placement: on the platform at (r*0.82, 0.05, r*0.18), facing OUTWARD via `rotation.y = atan2(ox,oz)` (the offset dir =
  world outward because the group rotation applies to both offset + facing). Validated by live-tweaking then baking.
- VALIDATED ROSTAM FIRST (per guide): standalone (tiger-pelt Babr-e-Bayān + iron helm + Gorz mace, all 5 clips, RightHand
  weapon attach) AND on a real tower (correct scale, faces the field, idle plays). Then batched the other 7.
- 8 heroes integrated + verified (all load, 5 clips, correct weapon attach; Tahmineh correctly weaponless=token):
  Hero_rostam(mace) Hero_zal(bow) Hero_kaveh(hammer) Hero_kay_khosrow(sword) Hero_tahmineh(token) Hero_gordafarid(spear)
  Hero_sohrab(sword) Hero_esfandiyar(spear). Optimized webp/1024 → 1.7-2.0MB each. Visually confirmed Rostam/Zal/Gordāfarid.
  Debug: __dbg.heroTest(id, weapon) added.
- GAP: user said "10 ready" but only 8 are 3D. **Simurgh + Fereydun are PNG images only** (Downloads: simourgh.png,
  Fereydun.png) — NOT generated as 3D yet. Simurgh is the BIRD exception (no weapon, avian rig). Also a mystery
  `Meshy_AI_Character_output.glb` (20:30, STATIC/0-anim) — unidentified, possibly Fereydun-as-static; not integrated.
  NEXT: get 3D for Simurgh (bird) + Fereydun, then Section 4 (buildings) or towers.
- UPDATE (2026-06-14): Fereydun (Hero_fereydun, biped, mace - crowned purple/gold king) + Simurgh (Hero_simurgh, STATIC
  bird, 0 clips, no weapon - gold body, jewel wings, peacock tail) integrated + verified. **ALL 10 HEROES DONE.** Simurgh
  is static (perches, no idle), faces +Z natively. heroModel maps weapon 'talon'/'token' -> null.

## Buildings (Section 4) - Persian village kit, 4 of 5 (2026-06-14)
- User generated 4 (village_house->MudbrickHouse, caravanserai->Caravanserai, bazaar_market_stall->MarketStall,
  chahar_taq->ChaharTaq). **BadgirHouse (5th windcatcher house) NOT generated** - code references it but fails propReady
  -> gracefully skipped (~35% of house slots empty until generated).
- Meshy buildings were HUGELY geometry-bloated (ChaharTaq 817K verts/26MB). optimize webp/1024 + aggressive simplify
  (ratio 0.03-0.08) -> 0.7-2.0MB each. Saved to public/assets/buildings/persian/.
- props3d.js: added PERSIAN_DIR/PERSIAN_NAMES/PERSIAN_FILES + into loadAllProps entries. Prop name = filename.
- map.js: new placeBuilding(map,name,x,z,ry,targetW) - sizes via unit=targetW/base.baseW (handles arbitrary native
  scale), sits on ground via -baseY*unit, tint:null keeps adobe/turquoise palette. All gated on propReady (never-break).
  Wired: buildVillage places 2-3 MudbrickHouses(+BadgirHouse) per compound + a Caravanserai outside the first compound
  + 1 ChaharTaq landmark; dressMarket swaps Stall_Empty->MarketStall.
- VERIFIED in-game (kabul): caravanserai w/ turquoise iwan+dome, flat-roof adobe houses, striped-awning stall, chahar-taq
  - all correct scale, sit flat, keep palette. Looks great. NEXT: BadgirHouse (gen) + towers (the big 32-prop batch).
- UPDATE: BadgirHouse generated + integrated (badgir_..texture.glb, static, 22MB -> simplify ratio 0.04 -> 1.6MB). No
  code change needed (already wired/registered); verified the domed windcatcher house renders correctly. Bumped the
  house mix to ~45% badgir for silhouette variety. **ALL 5 BUILDINGS DONE. Section 4 complete.** Only TOWERS left.

## Towers (Section 5) — 11 HIGH + COMMIT/PR/MERGE (2026-06-14)
- User generated the 11 HIGH towers (Ringed_Dome_Citadel = palaceBalcony by elimination). Optimized webp/1024 +
  simplify ratio 0.1 (less aggressive than buildings — towers are foreground) -> 1.5-4MB each, ~26MB total.
- NEW `assetTower(modelKey, ageIdx)` in towerkit.js: cloneAssetScene -> scale to tower height (4.2 + ageIdx*0.5),
  sit on ground, wrap under a `crown` layer (so the entity's staged destruction topples it). Re-attaches engine FX via
  the exported makeFlame/makeBanner/makeTorch per a GLB_FX map (fireAltar->flame, standardHall->big Derafsh banner,
  radianceCourt->4 corner torches, nestTower->glow-feathers, catapult/maceHall/horizonWatch/grandArch->none since the
  weapon/arch is the crown, default->small rim banner). buildTower tries assetTower first, falls back to procedural.
  Keys a_twr_<def.model> in MODEL_FILES. Verified 6 build as GLB w/ correct FX; grand arch + radiance dome look great.
  Minor: standardHall double-poles (GLB pole + banner pole), fire flame is a flat billboard in static render (animates
  in-game, same makeFlame the procedural towers use). MED/LOW towers untouched (assetTower null -> procedural).
- SCRUBBED all 8 "Meshy" mentions from src/ comments (no-AI-wording constraint; CREDITS.md keeps the legal CC-BY).
- COMMITTED + PR'd + MERGED: branch persian-3d-assets -> PR #1 -> squash-merged to main (commit 4b1e6c8, author Meisam,
  NO Claude/Anthropic trailer — only a redundant self "Co-authored-by: Meisam"). Production build passed. Merge to main
  triggered the Pages deploy (run 27510543811) -> live at araxis.github.io/borj/. **THE ENTIRE asset-prompts.md worklist
  is now integrated (weapons + bosses + heroes + buildings + 11 HIGH towers). Remaining: optional MED/LOW towers.**

### Towers MED/LOW — 21 more, ALL TOWERS DONE (2026-06-15)
- User generated the remaining 16 MED + 5 LOW. Same assetTower path (already handles any a_twr_<model>). Registered 21
  keys; added GLB_FX flame for trialGate (fire ordeal) + rebellionForge (furnace); rest use the default rim banner.
- PIPELINE GOTCHA (cost ~5 retries): in the optimize+simplify loop, the simplify tmp MUST end in .glb (gltf-transform
  infers format from extension). I used "$out.tmp" (.tmp ext) -> it wrote a GLTF with EXTERNAL .glb.bin + generic .webp
  textures + then failed -> empty .glb. Fix: tmp="${g%.glb}.simp.glb". Also npx-in-a-loop is flaky under rapid calls ->
  resolved the cached binary (AppData/Local/npm-cache/_npx/<hash>/.../cli/bin/cli.js) and ran `node $CLI` directly.
  Cleaned 21 stray .glb.bin + 4 .webp before commit (verified each final .glb is SELF-CONTAINED via inspect). 1.8-5MB ea.
- Verified 8 representative MED/LOW build as GLB w/ correct FX (preview screenshot timed out on the fresh server but the
  game/console are clean + functional eval conclusive; same path as the visually-confirmed HIGH towers).
- COMMITTED + MERGED: branch med-low-towers -> PR #2 -> squash to main (commit d9a3908, author Meisam, no AI trailer).
  Build passed; Pages deploy run 27562415117 SUCCESS -> live. **ALL 32 TOWERS now have bespoke GLBs. THE ENTIRE
  asset-prompts.md WORKLIST IS COMPLETE: 6 weapons + 11 bosses + 10 heroes + 5 buildings + 32 towers, all shipped.**

## Splash screen + themed scrollbars (2026-06-15, UNCOMMITTED — waiting on bg image)
- Upgraded the basic #loading (gold spinner) into an animated Persian splash: rotating conic-gradient sunburst (farr) +
  glowing pulsing orb, gradient-shimmer برج logo + "Shahnameh Tower Defense" subtitle, themed loading bar, 9 rising
  embers, dark radial vignette. Staggered entrance, holds 2400ms (400ms on reduced-motion), then fades to menu. All in
  index.html (#loading markup) + src/ui/style.css (.splash* + @keyframes splash*). main.js: menus.showMain() behind the
  splash, then setTimeout hide. Respects prefers-reduced-motion.
- Themed scrollbars: global ::-webkit-scrollbar (bronze->gold gradient thumb, carved border, dark track) + scrollbar-color
  for Firefox, in style.css.
- PRE-WIRED gated hero background: <div class="splash-bg"> in #loading + main.js Image() loader for 'assets/ui/splash-bg.jpg'
  -> on load sets a dimmed linear-gradient + the image and reveals it (opacity 1); absent = silent 404, CSS splash shows.
  User chose to GENERATE the bg image first (prompt given: dark Shahnameh dusk vista, empty center). NEXT: user drops
  public/assets/ui/splash-bg.jpg -> verify -> commit splash+scrollbars+bg together (branch splash-ui -> PR -> merge).
- NOTE: preview_screenshot is BROKEN this whole session (times out 30s even with canvas hidden); verified via computed
  styles + build instead. Production build passes (CSS 20.8->25.9kB).
- BUG CAUGHT BY ACTUALLY RUNNING IT (via Claude-in-Chrome foreground browser, which works where the preview pane fails):
  the splash برج title was rendering as DISCONNECTED isolated Persian letters — the `-webkit-background-clip: text` gradient
  shimmer technique breaks Arabic/Persian letter-joining. FIXED: .splash-fa now solid gold (#f4cd6e) + a splashGlow
  text-shadow pulse (no clip). Verified live — برج now joins correctly. LESSON: never use background-clip:text on
  Persian/Arabic text. reducedMotion confirmed OFF on this machine (full animation shows). Scrollbars verified live too
  (gold/bronze themed thumb visible in the codex). Still UNCOMMITTED, still waiting on the user's re-saved splash-bg image.

## 2026-06-15 → 06-17 — Sessions 4–8 CATCH-UP (reconciled 2026-06-17; this log had stopped at Session 3)
The log went dark after Session 3; here is the merged history since, all squash-merged to `main`
(author Meisam, no AI trailer). Detail lives in the auto-memory notes named below.

### PR #3 — splash + scrollbars (the entry above SHIPPED)
The "UNCOMMITTED" splash/scrollbars/bg above was committed and merged as PR #3 once the bg image landed.

### PR #4 (e075c9d) — giant per-stage palaces + enriched world
All 20 stage palaces generated/optimized (gltf-transform, ~6–22 MB each), lazy per-map loaded and
swapped over the procedural citadel, selectable with Muster/Rally/King's-Boon. Stationary
palace-soldiers removed per user feedback (summon in front instead). See auto-memory `palace-system`.

### PR #5 (226b751) — living world
3D horizon mountain-range tiles ringing the board (`backdrop.js buildMountainRing`, range_snow/
range_forest decimated GLBs); forest atmosphere + a landmarks pass (ms01/ms02/ms04/mt05/mt06);
procedural animated **fire shader** (`fx/fire.js`, replaced flame scale-pulse); **mid-wave battle
save/resume** (`core/battlesave.js`, localStorage `std.battle.v1`); **hero medallion markers** on
commanded towers (hud.js); per-stage backdrops wired; Persian palace-panel localization fix.

### PR #6 (3852a3c) — deep quality pass + epic moments
Animation: `fx/ease.js` (easing + frame-rate-independent damp); a **real elbow joint** on the
humanoid rig (arm split into upper+forearm pivot `rig.foreL/foreR`; weapons/shields on the forearm);
rewritten walk (weight transfer + secondary motion), idle (breathing/weight-shift/look-around),
attack (anticipation→strike→follow-through+recoil). Combat juice: `engine.hitStop/bloomPulse`,
stronger shake, muzzle flash + tower recoil, dense glowing trails, impact bursts, accelerating death
topple, boss-death cinematic. Render: post chain now RenderPass→Bloom→Output→**SMAA**→**GradePass**
(vignette + subtle chromatic aberration + per-biome contrast/saturation/lift). Seam: terrain edge
dissolve widened. UI: overlay/dialog/card cascade entrances + panel slide-in. Epic moments:
`engine.slowMo` on boss arrival/victory/defeat. See auto-memory `wow-improvement-plan`.

### PR #7 (0afbc81) — deferred polish
**GTAO** contact ambient occlusion (high tier only); horizon ring densified N 12→20 + per-tile
jitter; map-intro line-by-line reveal; cinematic end-screen entrance. Verified live in Chrome
(no over-darkening, no game console errors).

### PR #8 (fc8e600) — cavalry overhaul
Mounted soldiers now ride the real `a_horse` GLB (rider seated astride; the `gltf` soldier path
drives the gallop; idle eases to timeScale 0.18) instead of the black-blob procedural horse;
procedural `buildHorse` kept as never-break fallback with a lifted/form-shaded coat. Verified live
by placing a Rakhsh Stable fort + inspecting the deployed lancers. Decision: NOT a combined
horse+rider GLB (keeps modular riders). See auto-memory `wow-asset-gaps` (cavalry section + war-horse
prompt card).

### Memory reconciliation (2026-06-17)
Updated all AUTO-memory notes (.claude) + reconciled these PROJECT-memory archives against the
codebase: status banners on the prompt archives (this worklist 100% done; palaces shipped; 2D
backdrop dormant→3D ranges); fixed `MODEL_FILES` (not "ASSETS"); appended current-state blocks to
overview/roadmap/resume/content-ledger/architecture/gameplay/art-direction/testing/design-decisions.
**Open work** (assets) lives in auto-memory `wow-asset-gaps`: per-biome PBR/LUTs, 3 audio swells,
desert/steppe horizon tiles, the remaining ~26 hero GLBs, a caparisoned war-horse, rubble kit.

## 2026-06-20 — Next-layer gameplay + visual-depth upgrade

This session completed the large "fix then deepen" wave after the PR #8 baseline. The upgrade stayed
evolutionary: Three.js/Vite, DOM HUD, existing GLB assets, current campaign data, offline fallbacks,
and Shahnameh-only language.

### Stability and HUD fixes
- Fixed the stale HUD language listener path by cleaning HUD teardown state.
- Reworked the mobile battle HUD into a compact, readable surface: stable topbar controls, 1x/2x/3x/4x
  speed buttons, bottom wave call button, responsive right/left panels, and no horizontal page overflow.
- Fixed Persian difficulty segment vertical alignment and the topbar language pill wrapping (`EN / fa`
  stays one line on desktop and mobile).
- After splash fade, `#loading` is hidden/aria-hidden/inert and then removed, preventing false QA overflow.
- Converted selection/range rings and palace/hero visual helpers away from shadow-receiving flat planes
  that produced black rectangles. Dynamic shadows/GTAO were disabled where alpha foliage made depth
  passes generate dark slab artifacts.

### Shahnameh palace and command layer
- Expanded palace gameplay into all campaign maps with lore-specific muster/boon behavior, localized panel
  text, cooldowns, and defensive defaults for older saves.
- Added palace boon command effects (`src/fx/palaceboons.js`) and gate/royal command effects that visibly
  originate from the palace gate/front line instead of being abstract HUD-only actions.
- Added hero command actives for assigned commanders (`src/fx/herocommands.js`), surfaced contextually in
  the tower panel only when a commander is assigned. Heroes remain commanders, not roaming units.

### Boss Saga layer
- Added `src/data/bosschallenges.js` with saga records: trial type, tone, arrival/trial/result/trophy keys,
  seal icon, reward/risk, and curated Shahnameh variants (Zahhak chains, Div-e Sepid fog, Azhdaha warning,
  Tur/Salm feud, Afrasiab royal guard, etc.).
- Added profile-only boss saga records in save data: defeated/broken/hardened/best/maps. No permanent combat
  boons were added.
- Upgraded campaign cards, intro warnings, active Saga Trial chip, boss banners, result banners, and codex
  enemy detail with saga record presentation.
- QA fix: sandbox boss saga forcing now supports `skipArrival`, synchronous broken/hardened result states,
  and `tur-salm` resolves to the real Tur record instead of falling back to Houman.

### Backdrop depth and visual clarity
- Rebuilt the dormant backdrop idea into a manifest-backed `DistantBackdrop` system:
  `src/data/backdrops.js` + `src/world/backdrop.js`.
- Backdrops use inward-facing curved quadrant bands (`far` + `mid`) plus procedural haze, not large flat
  planes. All backdrop meshes are no-shadow/depth-write-off, tagged `userData.visualLayer = "backdrop"`,
  and disposed safely on map unload.
- Added all 20 map backdrop manifests and bundled WebP layer sets under `public/assets/backdrops/<map>/`.
- Kept procedural mountain/range rings as fallback/foreground silhouette.
- Added `src/core/visualguards.js` and `window.__dbg.visualQa` hooks for artifact audits, overflow reports,
  forced visual states, backdrop reports, boss states, mobile RTL states, victory/defeat overlays, palace
  command, hero command, and gate assault.

### Verification performed
- `npm run build` passes after the full wave.
- Desktop and mobile QA screenshots saved under `artifacts/visual-qa/` locally, but those screenshots are
  generated evidence and should not be committed.
- Focused QA states checked: pilot backdrops (Zabulistan, Kabul, Mazandaran, Damavand, Arash Watch,
  Gang-Dez), active saga trial, broken/hardened result banners, mobile RTL saga chip, palace command,
  hero command, victory/defeat overlays.
- Measured acceptance: no horizontal overflow, no visual artifact audit hits, backdrop layers load, mobile
  saga chip no longer overlaps sandbox/toast messages, Tur/Salm hardened result shows Tur's feud banner.

### Current open work after this wave
- Art direction pass for backdrop images: make Zabulistan/Kabul/Mazandaran and the other map panoramas more
  dramatic while keeping paths, pads, enemies, palace gates, and HUD readable.
- Continue boss saga gameplay sims on real wave paths, not only debug forcing.
- Add/verify the remaining cinematic audio swells and any future generated hero/war-horse/rubble assets.

## 2026-06-20 — Backdrop tone-tuning pass

- Added data-driven per-map backdrop tone controls in `src/data/backdrops.js`: layer contrast, distance wash,
  and extra desaturation where the shipped WebP sets were too saturated/dark for gameplay readability.
- Wired the controls into `src/world/backdrop.js` so the existing curved panorama shader applies fog wash and
  contrast before the established edge/top/bottom fades. No source images were rewritten.
- Extended backdrop QA reporting: each loaded layer now reports texture dimensions and the active tone settings,
  making future visual passes inspectable through `window.__dbg.visualQa.backdrops()`.
- Verification: `npm run build` passed. Browser-driven forced `backdropSweep` checks passed for all 20 campaign
  maps: each reported 8/8 layers loaded, 0 failed, 0 missing, 0 artifact audit hits, and 0 overflow reports.
  Representative screenshots and contact sheets were generated under local ignored `artifacts/visual-qa/`.

## 2026-06-20 — Backdrop visibility fix

- User-visible issue: Zabulistan backdrops were technically wired but still too hard to see in normal play.
- Root cause: the mountain/city silhouettes live in the lower part of the panorama images; the previous cylinder
  height and bottom fade let terrain/apron depth hide much of the actual silhouette while haze washed out the rest.
- Fix: raised the far/mid panorama layers, reduced low-fog wash, strengthened panorama opacity/contrast, reduced the
  procedural haze band, and kept the lower fade small enough that the artwork survives above the horizon.
- QA notes: `npm run build` passes. The in-app browser was reloaded and re-entered into the Zabulistan battle HUD after
  the patch; screenshot capture was intermittently timing out, so future visual QA should explicitly verify both loaded
  layer counts and horizon readability from a low-angle camera.

## 2026-06-20 — Horizon blend pass

- User-visible issue: after the backdrop became readable, the transition from playable land/apron into the panorama
  still had a hard, flat band.
- Fix: added a procedural `horizonBlend` cylinder in `src/world/backdrop.js` and default config in
  `src/data/backdrops.js`. It is depth-tested, no-shadow scenery, and uses a vertical ground-to-fog gradient so it
  covers the join without drawing over foreground gameplay.
- Also softened the land side of the join: terrain edge tint now moves toward fog earlier/stronger, and the world apron
  lifts into fog with a smoother curve before it reaches the panorama.
- Follow-up: added a shallow `ground-horizon-veil` annulus in `src/world/ambient.js` outside the playable board. It sits
  just above far terrain/apron with depth testing enabled, so it softens the distant green field before the vertical
  panorama while staying behind foreground objects.
- Inward-distance pass: pulled the merge helpers closer to the board (`horizonBlend` radius and `ground-horizon-veil`
  outer radius) and moved the procedural range ring inward with narrower/more numerous tiles. The main image panorama
  remains farther out to avoid clipping and bad flat-image parallax.
- Second distance pass: pulled the image panorama in carefully after the merge helpers. Defaults now use far/mid/haze
  radii of 374/292/320, with Zabulistan at 372/286/318. The procedural range ring's rear layer and jitter were tightened
  so ridge tiles stay in front of the nearer mid panorama instead of depth-fighting it.
- Third distance pass: after user inspection, pulled the panorama in again. Defaults now use far/mid/haze radii of
  364/284/310, with Zabulistan at 356/274/302. The procedural range ring rear-layer spacing and radius jitter were
  tightened again to keep the ridge band visually between the playable land and nearer panorama.
- Board-shape decision: do not convert the actual tactical board to a circle as a quick backdrop fix. The map logic,
  paths, foundations, palace/gate layout, camera bounds, and QA states assume a square tactical coordinate area. If the
  square-to-cylinder transition still reads awkwardly, the safer next step is a circular visual apron/mask around the
  square gameplay area, not a gameplay-board rewrite.
- Verification: `npm run build` passes. The in-app browser was re-entered into Zabulistan and a top-down battle
  screenshot captured successfully with no browser warnings after the distance passes; low-angle horizon inspection
  remains the acceptance view for this specific polish.

## 2026-06-20 — Local model-editing workflow added to the plan

- Confirmed the local 3D editing connection is reachable from the session with the default scene loaded.
- Confirmed the texture-library integration is enabled; external model/generation integrations are disabled in the
  current local setup.
- Updated `memory/roadmap.md` and `memory/resume-guide.md` so future asset work should use local 3D inspection,
  mesh cleanup, pivot/orientation fixes, animation repair, material passes, and GLB export when that is more appropriate
  than runtime workarounds.
- No source assets were edited in this note-only update.

## 2026-06-20 — Caparisoned war-horse GLB integrated

- Added `public/assets/animals/WarHorse.glb`: a small self-contained cavalry mount with charcoal coat, red caparison,
  gold trim, saddle/tack, +Z-forward orientation, and merged `Idle`, `Walk`, and `Gallop` animation clips.
- Registered the asset as `a_warhorse` in `src/core/assets.js`.
- Updated mounted soldier construction in `src/models/creature.js`: black lancers prefer `a_warhorse`, do not stack the
  procedural tack overlay on top of it, and still fall back to `a_horse` and then the procedural horse. Scout riders stay
  on the stock horse path.
- Verification: `npm run build` passed. GLB inspection showed 53 nodes, 51 meshes, 10 materials, and 3 merged clips
  (`Idle`, `Walk`, `Gallop`) in a 131 KB file. Runtime smoke checks showed `soldierTest('lancer')` using the GLB path
  with 2 top-level children and `WarHorseRoot` nodes present; `soldierTest('scoutRider')` stayed on the stock horse path
  with no `WarHorseRoot`. A framed local viewer screenshot and WebGL pixel sample were saved under
  `artifacts/visual-qa/` as generated evidence.

## 2026-06-20 — Zabulistan 360 panorama + circular visual board pilot

- Generated a new Zabulistan distant-landscape source from the approved Sistani/Zabulistan 360 prompt, then processed it
  into `public/assets/backdrops/zabulistan/panorama_360.webp` as an 8192x1536 seamless WebP runtime strip.
- Added a manifest/runtime `panorama360` mode: maps can now use one inward-facing image cylinder while non-converted
  maps keep the legacy `far_n/e/s/w` + `mid_n/e/s/w` quadrant support.
- Converted only Zabulistan to `panorama360` for the pilot. The shader keeps the same opacity, tint, fog wash, top/bottom
  fade, no-shadow, depth-test, and depth-write-off behavior as the existing backdrop layers.
- Made Zabulistan read as a circular playfield without rewriting gameplay: terrain now supports a circular render
  geometry, the apron/ground veil can use radial distance, and decorative prop placement respects the visual circle.
  Paths, pads, gates, palace, enemies, tower placement rules, and internal square coordinates remain unchanged.
- Tuned the circular edge around radius 86 with the existing `horizonBlend`, `ground-horizon-veil`, and ridge ring so the
  edge fades into the backdrop instead of showing square green corners.
- Verification: `npm run build` passed. In-app browser smoke reached Zabulistan with no warning/error console output.
  A zoomed-out visual pass confirmed a circular land edge and no square terrain corners. The browser's restricted
  page-scope sandbox did not expose `window.__dbg`, so the scripted `visualQa.state('backdropSweep')` report could not be
  read through that route in this session.

## 2026-06-20 — Zabulistan closer foothills panorama layer

- Added a second Zabulistan 360 image layer for deeper scenery:
  `public/assets/backdrops/zabulistan/foothills_360.webp` (8192x1024, ~191 KB). It was generated as a closer Sistani
  foothill band, then softened/desaturated and mirror-wrapped for a seamless runtime strip.
- Generalized `panorama360` config/runtime support from one image cylinder to an ordered list of named cylinders.
  Zabulistan now reports `mountains360` at the far radius and `foothills360` as the closer/lower band; other maps still
  use legacy quadrant layers.
- Layer intent: the far `mountains360` image carries sky and distant highland scale; the closer `foothills360` layer adds
  shorter low ridges and atmospheric parallax behind the circular board edge and procedural ridge ring.
- Verification: `npm run build` passed. Dev-server HEAD checks returned 200 for both Zabulistan WebP files, and
  `backdropManifestReport()` reports mode `panorama360` with layers `mountains360` and `foothills360`. In-app browser
  automation was unavailable during this pass because the browser control endpoint returned a sandbox metadata error
  before executing page actions, so final visual judgment should be done from the open browser.

## 2026-06-20 — Zabulistan image-only ridge pilot

- Added a third, nearest raster 360 backdrop layer:
  `public/assets/backdrops/zabulistan/ridges_360.webp` (8192x768, ~67 KB). It is a very low, soft ridge skirt intended
  to replace the remaining procedural 3D range silhouettes for Zabulistan.
- Zabulistan now has three ordered panorama cylinders: `mountains360` (far/high), `foothills360` (middle/low), and
  `ridges360` (near/very low). The shader/reporting path already handles named layered cylinders.
- Disabled the procedural `buildMountainRing` only for Zabulistan via the visual-board config. Other maps still keep
  their procedural ring while they remain on legacy quadrant images.
- Verification: `npm run build` passed; the dev server returns 200 for `ridges_360.webp`; `backdropManifestReport()`
  reports the three Zabulistan layers. Browser automation remained unavailable due to the same sandbox metadata error,
  so the open browser is the acceptance path for visual tuning.

## 2026-06-20 — Zabulistan transparent landmark panorama layer

- Added a fourth Zabulistan 360 layer as a transparent PNG overlay:
  `public/assets/backdrops/zabulistan/landmark_360.png` (8192x1024, palette-compressed alpha PNG).
- Generated the landmark source on a flat magenta chroma key, removed the key locally, padded transparent seam margins,
  and scaled the Persian/Sistani citadel complex down so it reads as a far-away Shahnameh landmark rather than a second
  foreground palace.
- Wired the layer as `landmark360` between the far mountains and closer ridge/foothill layers. It uses low opacity,
  desaturation, and fog wash in the existing panorama shader.
- Verification: `npm run build` passed; the dev server returns 200 for `landmark_360.png`; `backdropManifestReport()`
  now reports Zabulistan layers `mountains360`, `foothills360`, `landmark360`, and `ridges360`.

## 2026-06-20 — Landmark visibility fix

- User could not see the distant landmark in normal play. Likely causes: the original layer was too subtle
  (`opacity: 0.2`, heavy wash/desaturation) and the transparent PNG only occupied one part of the 360 strip.
- Rebuilt `landmark_360.png` from the keyed source with a broad primary citadel and a dim wrapped seam copy so a normal
  camera angle is not pointed at an empty transparent segment. Current file is ~1.1 MB with transparent corners.
- Retuned `landmark360`: radius 302, height 126, y 46, opacity 0.46, lighter wash/desaturation, and later render order
  so the foothill/ridge bands do not bury it.
- Verification: `npm run build` passed; dev-server HEAD check for `landmark_360.png` returned 200; manifest still reports
  all four Zabulistan layers.

## 2026-06-20 — Landmark scale correction

- User screenshot showed the visibility fix made `landmark360` read as a giant pale wall across the sky.
- Rebuilt `public/assets/backdrops/zabulistan/landmark_360.png` as a lower, smaller transparent horizon accent
  (8192x1024, ~370 KB, alpha mainly in the lower strip instead of nearly the full image height).
- Retuned `landmark360` as distant scenery: radius 338, height 74, y 28, opacity 0.16, more desaturation/fog wash,
  and render order before the nearer foothill/ridge layers.
- Verification: `npm run build` passed; dev-server HEAD check for `landmark_360.png` returned 200; manifest still reports
  `mountains360`, `foothills360`, `landmark360`, and `ridges360`.

## 2026-06-20 — Retired Zabulistan landmark overlay

- User still could not read the corrected landmark in normal play and asked to follow the prior no-rig direction first.
- Removed `landmark360` from the active Zabulistan panorama manifest and deleted the unused public
  `landmark_360.png` runtime asset.
- Strengthened the landscape-only raster stack instead: `foothills360` is closer/taller/more opaque with less wash, and
  `ridges360` is closer/taller/more opaque so long horizon detail carries the scene without a 3D mountain rig.
- Verification: `npm run build` passed; dev-server HEAD checks returned 200 for `panorama_360.webp`,
  `foothills_360.webp`, and `ridges_360.webp`; `backdropManifestReport()` now reports Zabulistan layers
  `mountains360`, `foothills360`, and `ridges360`.

## 2026-06-20 — Zabulistan near scrub panorama + browser QA fallback

- Established a working browser QA route after the in-app browser connector failed before page actions: use
  the browser automation CLI to open the local app, force debug states, inspect console output, and capture screenshots.
  This successfully drove `window.__dbg.visualQa.state('backdropSweep', { mapId: 'zabulistan' })`.
- Added `public/assets/backdrops/zabulistan/scrub_360.webp` (8192x512, ~169 KB), a low transparent panorama band derived
  from the existing Zabulistan landscape images with subtle scrub/foothill texture for the terrain-to-horizon transition.
- Wired `scrub360` as the nearest raster panorama cylinder and retuned Zabulistan haze/horizon blend down so the new
  image detail is visible without reintroducing the procedural 3D mountain ring.
- Verification: `npm run build` passed. Dev-server HEAD checks returned 200 for all four Zabulistan panorama images.
  Browser QA reported 4 loaded image layers, 0 failed, 0 missing, no overflow, and no visual artifact findings.
  Evidence screenshots:
  `artifacts/visual-qa/zabulistan-transition-before.png`,
  `artifacts/visual-qa/zabulistan-transition-after-scrub.png`, and
  `artifacts/visual-qa/zabulistan-transition-after-scrub-tuned.png`.

## 2026-06-20 — Zabulistan near-board apron panorama

- User asked for one more panorama "stuck" to the game board to remove the blue surface around the circular playfield.
- Added `public/assets/backdrops/zabulistan/apron_360.webp` (8192x384, ~200 KB), a low green/dry scrub strip with
  transparent top fade and no landmarks/buildings.
- Wired it as `apron360` at radius 104, just outside the radius-86 circular visual board, so the nearest board edge has
  image detail before the farther `scrub360`/`ridges360` bands.
- Delayed the Zabulistan `ground-horizon-veil` inward edge to radius 132 and lowered its opacity to 0.12 so the blue fog
  wash no longer starts immediately at the playable circle.
- Verification: `npm run build` passed. Dev-server HEAD checks returned 200 for all five Zabulistan panorama images.
  Browser QA with a named `borj` session reported 5 loaded image layers, 0 failed, 0 missing, no overflow, and no
  visual artifact findings. Evidence screenshot:
  `artifacts/visual-qa/zabulistan-transition-after-apron-loaded.png`.

## 2026-06-20 — Zabulistan circular border smoothing

- User liked the near-board panorama but still saw the circular playfield border.
- Added a procedural `board-edge-blend` ring in `src/world/ambient.js`. It samples the same `heightAt` terrain function,
  fades across both sides of the radius-86 visual board edge, and uses depth testing/no depth write so roads, pads, palace
  elements, and units remain in front.
- Retuned Zabulistan's `visualBoard`: edge tint starts earlier, the ground veil starts farther out, and the edge blend is
  broad/low-opacity (`edgeBlendInner: 58`, `edgeBlendOuter: 156`, `edgeBlendOpacity: 0.3`, `edgeBlendFogMix: 0.28`).
- Verification: `npm run build` passed. Browser QA reported `board-edge-blend` present, 5 loaded panorama layers,
  0 failed, 0 missing, no overflow, and no visual artifact findings. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-edge-before-soft-ring.png`,
  `artifacts/visual-qa/zabulistan-edge-after-soft-ring.png`, and
  `artifacts/visual-qa/zabulistan-edge-after-soft-ring-tuned.png`.

## 2026-06-20 — Zabulistan apron color match

- User wanted the closest panorama color to read nearer to the playable board grass instead of the cooler distant haze.
- Recolored `public/assets/backdrops/zabulistan/apron_360.webp` toward the board sample (`#b4ce71`) while preserving dry scrub variation and the transparent upper fade.
- Added per-layer `lowFog` control to the panorama shader reporting path, then tuned `apron360` to low fog/wash (`lowFog: 0.045`, `wash: 0`) with slightly brighter, fully saturated color.
- Verification: `npm run build` passed. Browser QA in the named `borj` session reported 5 loaded Zabulistan panorama layers, 0 failed, 0 missing, no overflow, and no visual artifact findings. Evidence screenshot:
  `artifacts/visual-qa/zabulistan-apron-boardcolor-tuned.png`.

## 2026-06-20 — Zabulistan near-panorama overhead fade

- User wanted another smoothing pass so the first panorama color stayed close to the playable board while hiding the
  circular border. A/B screenshots showed `ground-horizon-veil` was not the main issue; the pale wash came from the
  edge blend, and the overhead ring came from the close `scrub360`/`apron360` panorama cylinders.
- Added optional per-layer `topViewFade` support in `src/world/backdrop.js`, updated once per frame from the RTS camera
  pitch via `GameMap.updateCameraVisuals()`. Low and edge camera angles keep the close layers at full opacity, while
  overhead views fade only the near raster layers.
- Retuned Zabulistan's edge/apron values: `board-edge-blend` is greener, lower opacity, and limited closer to the
  radius-86 board edge; `apron360` is wider, shorter, softer, and less opaque so it supports low-angle terrain
  continuity without reading like a wall from above.
- Verification: `npm run build` passed. Browser QA reported 5 loaded Zabulistan backdrop layers, 0 failed, no
  overflow, and no visual artifact findings. Effective opacity check: low/edge keep `scrub360: 0.68` and
  `apron360: 0.52`; top-down fades them to about `0.12` and `0.04`. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-transition-after-pitchfade-low.png`,
  `artifacts/visual-qa/zabulistan-transition-after-pitchfade-top.png`, and
  `artifacts/visual-qa/zabulistan-transition-after-pitchfade-edge.png`.

## 2026-06-20 — Direct palace command medallion arc

- User found palace commands too buried: select palace, scroll the card, then execute. Added a projected DOM
  `palace-action-rail` near the palace, separate from hero markers, with direct click actions for Farr/oath, muster,
  palace boon, rally, and gate command.
- User rejected the first rectangular button rail as ugly, so the visible UI is now an arc of tower-style medallions:
  circular command coins with cooldown rings and small state pills. The invisible rail only anchors/clamps the arc away
  from the top HUD and open side panels.
- Follow-up tuning: the arc is now contextual and only appears while the palace itself is selected. Ready commands no
  longer show repeated `Ready` pills; readiness is communicated by a green ring, while cooldown/cost/blocked states still
  show text when that information matters.
- Follow-up visual pass: replaced the text glyphs inside the five medallions with small SVG emblem images under
  `public/assets/ui/palace-actions/`: Farr oath star, crossed muster lances, royal boon banner, rally horn/standard, and
  gate command arch/seal.
- Gate-marker cleanup: removed the tiny upright pole flags spawned by `_showGateMarker()` after palace/gate commands.
  The effect now uses a low gold gate line with three pulsing ground seal points (`gateSeals`) and keeps the shield
  glints, so it reads as a tactical defended-line marker instead of random pennant clutter near the palace wall.
- Follow-up cleanup: the remaining visible clutter was `_showPalaceShieldLine()`, which still spawned a row of tiny
  shield-and-pole props. That effect is now flattened into a subtle ground line with pulsing `shieldSeals`; it no longer
  creates shield cylinders, bosses, or poles.
- The medallions call the same existing command methods as the palace card, so cooldowns, cost checks, command banners,
  toasts, and effects stay consistent.
- Verification: `npm run build` passed. Browser QA confirmed desktop and mobile medallion placement, no overflow
  or visual artifact hits, and direct muster click sets cooldown and shows the existing command banner. Evidence
  screenshots: `artifacts/visual-qa/palace-action-medallion-arc.png`,
  `artifacts/visual-qa/palace-action-medallion-click.png`, and
  `artifacts/visual-qa/palace-action-medallion-mobile.png`.
- Follow-up evidence: `artifacts/visual-qa/palace-action-green-ready-selected.png` and
  `artifacts/visual-qa/palace-action-green-ready-click.png` confirm selected-only display, no ready text, green ready
  rings, and cooldown text after click.
- Emblem evidence: `artifacts/visual-qa/palace-action-emblem-images.png` confirms all five SVG images load and fit the
  medallions; `artifacts/visual-qa/palace-action-emblem-click.png` confirms image medallions remain clickable.
- Gate-marker evidence: `artifacts/visual-qa/palace-gate-marker-clean-seals.png` confirms the command effect now reports
  `gateSeals: 3`, `standards: 0`, keeps command click/cooldown behavior, and has no overflow/artifact hits.
- Shield-line evidence: `artifacts/visual-qa/palace-shieldline-clean-seals.png` confirms the remaining shield-line
  marker now reports `shieldSeals: 7`, no old `baseY` bounce state, keeps command click/cooldown behavior, and has no
  overflow/artifact hits.

## 2026-06-20 — Palace gate clutter removal follow-up

- User still saw stray pole/oval shapes beside the Zabulistan palace after the first marker cleanup.
- Browser object inspection showed three overlapping sources: idle palace muster `cavalry-lancers`, `PalaceGateStage`
  permanent spear/shield/banners/threshold lines, and `_showGateMarker()` line-based hold rings.
- Added palace-stand visibility gating in `src/entities/soldier.js`: palace stand soldiers hide their full miniatures
  while idle at the palace gate, but reappear when actively engaging or bracing against enemies. Gameplay soldiers,
  targeting, damage, rally logic, and normal non-palace tower soldiers are unchanged.
- Flattened the palace gate stage in `src/fx/palacestage.js`: removed permanent stage banners, braziers, straight
  threshold lines, and miniature shield/spear props; the stage now uses ground-only ring/seal treatment.
- Simplified `src/game/game.js` gate markers again: removed straight gate marker strokes/glints and converted hold rings
  from `THREE.Line` to flat mesh bands, so camera angles no longer turn circular rings into black stick-like marks.
- Verification: `npm run build` passed. Browser QA confirmed idle Zabulistan palace lancers report
  `visibleSoldiers: 0`, `hiddenSoldiers: 3`; command markers report `standards: 0`, `shieldGlints: 0`,
  `hasLine: false`, and `ringIsLine: false`; visual artifact audit is empty. Assault QA confirmed hidden defenders
  reappear when under threat (`visibleAfter: 2`, `targetedAfter: 2`).
- Evidence screenshots:
  `artifacts/visual-qa/zabulistan-palace-no-action-sticks.png` and
  `artifacts/visual-qa/zabulistan-palace-engaged-defenders.png`.

## 2026-06-20 — Actor asset quality gate

- User set a new standard: visible models and animations should move toward production tower-defense quality; no static
  actor GLB should be used as a fake-animated primary model.
- Added `npm run audit:assets`, a dependency-free glTF/GLB audit that reads `src/core/assets.js`, parses runtime model
  files, and flags production actor assets with no animation clips. Current result: 98 assets audited, 49 ready actors,
  0 blockers. `Azhdaha.glb` and `Worm.glb` are now reported as source-only because GLB inspection confirmed they
  have skins/armatures but 0 animation actions.
- Runtime cleanup: dragon and worm enemies now reject those unanimated crawler GLBs and fall back to the segmented
  animated creature builders unless the GLBs are later re-exported with real clips. Removed the old `animType: 'crawl'`
  shim that rotated/bobbed static GLBs to fake motion.
- The generated `WarHorse.glb` later failed visual review: although it had clips, the mesh read as joined primitive
  shapes rather than a real horse. It is no longer an acceptable pattern or lancer runtime path.
- Verification: `npm run audit:assets` passed, `npm run build` passed, and browser smoke reported
  `enemyTest('dragon').animType === 'serpent'`, `enemyTest('worm').animType === 'serpent'`, and
  `soldierTest('lancer')` still mounted on a GLB. Evidence screenshot:
  `artifacts/visual-qa/asset-quality-crawler-gate-smoke.png`.

## 2026-06-20 — Zabulistan cavalry correction after rejected horse prototype

- Source pass on the Zabulistan article established the next art targets: eastern Shahnameh frontier identity, Sistan /
  Zabulistan overlap around Hamun water and pasturage, old Ghazni / southern Hindu Kush highland scale, and the
  Garshasp-Sam-Zal-Rostam champion lineage. Zabulistan should therefore read less like generic green fantasy land and
  more like a Sistani highland frontier with dry ridges, scrub, water-fed pasture cues, champion banners, and cavalry.
- Rejected and removed the generated primitive/object-rig war-horse prototype. It animated, but it did not read as a
  horse in 3D review or user screenshot, so it must not be reused as a production mount.
- Removed the `a_warhorse` runtime registration and switched black lancers back to the existing real horse-shaped
  animated `a_horse` GLB path with dark tint plus external tack. The next custom war-horse must start from a proper
  horse mesh, even if the source has no animations yet.
- Runtime fix: asset actions can now be clip groups. This matters for generated object-rig GLBs where a single logical
  walk/gallop is exported as separate body, leg, neck, head, cloth, and tail clips. `spawnAsset()` now plays all matching
  clips together while preserving existing single-clip fallback behavior.
- Follow-up asset rule: if the user supplies an unanimated horse GLB, import it through the asset pipeline, clean scale /
  pivot / orientation, then rig/animate it before using it as the lancer mount. Do not ship static or primitive-composite
  horses as visible palace cavalry.
- Verification after correction: `npm run audit:assets` passed with 97 audited assets and 0 blockers, `npm run build`
  passed, and browser QA reported `soldierTest('lancer', 'walk')` as mounted GLB with `children: 3`, `currentClip:
  "Walk"`, `hasWarHorseRoot: false`, no failed requests, no console warnings/errors, no overflow, and no visual artifact
  findings. Evidence screenshot: `output/playwright/zabul-lancer-stock-horse-fix.png`.

## 2026-06-20 — Zabulistan source-mesh war-horse rig

- User supplied `C:\Users\meisa\Downloads\horse.glb`, an unanimated but recognizably horse-shaped source mesh
  (single mesh, 5,416 vertices / 6,580 faces, one material, embedded 2048 textures, no armature/actions).
- Added `scripts/asset-tools/rig-zabul-warhorse.py`: imports the supplied source GLB, normalizes it to head-forward
  convention, creates a real armature (`ZabulWarHorseRig`) with spine/chest/neck/head/tail and four articulated legs,
  assigns spatial vertex groups to the single mesh, and exports runtime `public/assets/animals/ZabulWarHorse.glb`.
- Registered the exported GLB as `a_zabul_warhorse`; black lancers prefer it and fall back to stock `a_horse` if it is
  missing/not preloaded. Scout riders still use the stock horse path for comparison.
- Current file is about 10.4 MB because it preserves the supplied 2048 textures. Defer texture downscaling until the
  user accepts the look/animation; optimization should not change the rigging contract.
- Verification: GLB re-import reports `Idle`, `Walk`, and `Gallop`, one armature, and the expected bones. Browser QA
  reported `ZabulWarHorseRig`, `ZabulWarHorseMesh`, `currentClip: "Walk"`, `hasOldWarHorseRoot: false`, no failed
  requests, no console warnings/errors, no overflow, and no visual artifact findings. Evidence screenshot:
  `output/playwright/zabul-source-warhorse-lancer.png`.

## 2026-06-20 — Zabulistan combined horse+rider cavalry source

- User supplied two combined horse+rider GLBs, `C:\Users\meisa\Downloads\horse2.glb` and
  `C:\Users\meisa\Downloads\horse3.glb`. GLB inspection showed both are static, high-poly sources with no
  armature/actions; `horse3.glb` was selected because its lamellar rider, red patterned horse cloth, and lower source
  weight fit Zabulistan better than the more western/plate-styled `horse2.glb`.
- Updated `scripts/asset-tools/rig-zabul-warhorse.py` to default to `horse3.glb`, keep only the largest real model mesh,
  purge the helper sphere, decimate from 601,834 faces to 110,000 faces, normalize orientation/grounding, add a 23-bone
  armature with horse body/legs/tail plus saddle/rider/lance bones, and export `Idle`, `Walk`, and `Gallop` clips to
  `public/assets/animals/ZabulWarHorse.glb`.
- Runtime change: black lancers still prefer `a_zabul_warhorse`, but that key is now treated as a self-contained
  cavalry model. The builder no longer adds the old procedural rider or external tack overlay on top of this GLB.
  Fallback stock horses still use the old rider/tack path, and scout riders remain on `a_horse`.
- Current runtime file is ~15.5 MB and preserves source textures. Defer texture downscaling until the user accepts the
  in-game read; the rig/export contract is now one skinned mesh, one skin, and three clips.
- Verification: local export report removed `Icosphere`, produced one mesh/one armature, and JSON disk parse confirmed
  nodes `ZabulWarHorseRig` / `ZabulWarHorseMesh`, one skin, and clips `Gallop`, `Idle`, `Walk`. `npm run audit:assets`
  passed with 98 audited assets, 49 ready actors, and 0 blockers. `npm run build` passed. Browser smoke reported
  `soldierTest('lancer', 'walk')` as `{ mounted: true, animType: 'gltf', glb: true, children: 1 }`, with one skinned
  `ZabulWarHorseMesh`, active `Walk`, and clip map `{ idle: ["Idle"], walk: ["Walk"], run: ["Gallop"] }`.
- Evidence screenshots:
  `output/asset-qa/zabul-warhorse-final-full.png`,
  `output/playwright/zabul-cavalry-horse3-lancer.png`, and
  `output/playwright/zabul-cavalry-horse3-close.png`.

## 2026-06-20 — Zabulistan cavalry skinning fan fix

- User spotted a bad 3D deformation under the combined horse+rider model: round joint markers were normal armature
  helpers, but the large triangular sheet under the horse was not acceptable. Deformation audit at walk frame
  124 showed the worst vertices were part of small disconnected cloth/decorative islands with mixed `spine` and
  `front_R_hoof` weights, causing panels to stretch when the hoof moved.
- Updated `scripts/asset-tools/rig-zabul-warhorse.py` with a connected-island cleanup pass after spatial weighting.
  Small disconnected islands are now pinned rigidly to their dominant bone instead of leaving mixed body/hoof weights
  across one panel. This preserves the GLB contract while preventing cloth/armor islands from tearing into fans.
- Regenerated `public/assets/animals/ZabulWarHorse.glb`. The export still has one mesh, one skin, and clips `Gallop`,
  `Idle`, `Walk`. Deformation audit now reports no stretched edges over the checked threshold; the largest movement is a
  rigid lower-leg displacement rather than cloth stretch.
- Verification: `npm run audit:assets` passed with 0 blockers, `npm run build` passed, and GLB JSON parse confirmed
  `ZabulWarHorseMeshData`, one skin, and the expected clips/nodes. Grey 3D QA render:
  `output/asset-qa/zabul-warhorse-skinning-fix.png`.

## 2026-06-20 — Zabulistan cavalry front-leg walk fix

- User reported the combined cavalry walk still looked wrong and the two front legs appeared unanimated in the 3D editor.
  Inspection showed two separate issues: GLB import does not automatically assign the `Walk` action to the armature
  for viewport preview, and the rig had weak front lower/hoof coverage after the anti-fan cleanup.
- Updated `scripts/asset-tools/rig-zabul-warhorse.py`: moved the front leg bone pivots from y `-0.43` to y `-0.27`,
  closer to the source model's front feet, widened low-front-leg detection for hoof/lower islands, and added a
  `leg_like_island_pin()` override so slender foot/lower-leg islands animate while broad cloth panels remain body-pinned.
  Walk leg amplitudes were reduced slightly to avoid bringing back the cloth fan.
- Regenerated `public/assets/animals/ZabulWarHorse.glb`. GLB audit with `Walk` explicitly assigned now reports front
  `hoof`, `lower`, and `upper` groups for both sides, with visible movement across frames 100/124/148 and stretched-edge
  count remaining 0 for checked walk frames.
- Verification: `npm run audit:assets` passed, `npm run build` passed, and GLB JSON parse confirms one mesh, one skin,
  clips `Gallop` / `Idle` / `Walk`, and all six front leg bones. Evidence frames:
  `output/asset-qa/zabul-walk-frames-v2/walk_100.png`,
  `output/asset-qa/zabul-walk-frames-v2/walk_124.png`, and
  `output/asset-qa/zabul-walk-frames-v2/walk_148.png`.

## 2026-06-20 — Zabulistan cavalry attack clip fix

- User reported no visible lancer attack animation. Root cause: `ZabulWarHorse.glb` had no `Attack` clip, so the runtime
  `model.anim.strike()` call had nothing to play. A first pass added `Attack`, but the action was keyed on global source
  frames 300-334; browser smoke showed runtime `Attack` duration as 13.917 seconds, meaning the visible strike was delayed
  by about 12.5 seconds after `strike()`.
- Updated `scripts/asset-tools/rig-zabul-warhorse.py` so `make_action()` remaps each source action to local frame 1 while
  preserving the source pose sampling. Current durations from GLB animation accessors: `Attack` 1.417s, `Gallop` 2.0s,
  `Idle` 3.75s, `Walk` 2.5s.
- Added a mounted lance `Attack` action with horse brace, rider lean, head/neck dip, and a more readable lance movement.
  Expanded lance island weighting so lower shaft pieces are pinned to `rider_lance`, while broad cloth/armor panels stay
  body-pinned to avoid fan deformation.
- Regenerated `public/assets/animals/ZabulWarHorse.glb`. It now exports one mesh, one skin, and clips `Attack`, `Gallop`,
  `Idle`, and `Walk`. Attack-frame stretch audit stayed at 0 across checked local frames 1/9/17/25/35.
- Verification: `npm run audit:assets` passed with 0 blockers, `npm run build` passed. Evidence frames:
  `output/asset-qa/zabul-attack-frames-v3/attack_1.png`,
  `output/asset-qa/zabul-attack-frames-v3/attack_17.png`, and
  `output/asset-qa/zabul-attack-frames-v3/attack_35.png`.

## 2026-06-20 — Zabulistan cavalry forward lance retune

- User reported the mounted attack lance still felt too vertical. A first angle pass flattened the lance but the side
  preview exposed the real problem: the rotation sign made the couched weapon point backward behind the rider.
- Updated `scripts/asset-tools/rig-zabul-warhorse.py` so the `Attack` hit pose pitches `rider_lance` forward toward the
  horse head/enemy direction, pushes it farther forward, and offsets it to the rider side so the cue reads at game scale.
  The final checked hit frame keeps the weighted lance range forward (`Y -0.879` to `-0.116`) with vertical/forward range
  ratio `0.579`; stretched-edge count stayed 0 across local frames 1/9/17/25/35.
- Regenerated `public/assets/animals/ZabulWarHorse.glb`. It still exports one mesh, one skin, and clips `Attack`,
  `Gallop`, `Idle`, and `Walk`; current durations remain `Attack` 1.417s, `Gallop` 2.0s, `Idle` 3.75s, `Walk` 2.5s.
- Verification: `npm run audit:assets` passed with 0 blockers, and `npm run build` passed with only the existing
  splash-background/chunk-size warnings. Evidence frames:
  `output/asset-qa/zabul-attack-frames-v7/attack_17_game.png`,
  `output/asset-qa/zabul-attack-frames-v7/attack_17_side.png`, and
  `output/asset-qa/zabul-attack-frames-v7/attack_17_front.png`.

## 2026-06-21 — Sistan panorama360 conversion

- Continued the backdrop art-direction plan after Zabulistan by converting the next campaign map, Sistan, from legacy
  quadrant-only backdrops to a layered `panorama360` set.
- Added `scripts/build_sistan_panorama360.py`, a deterministic local image builder that derives
  `panorama_360.webp`, `reedline_360.webp`, `water_360.webp`, and `apron_360.webp` from the existing curated Sistan
  quadrant art plus a procedural low marsh/reed band. The source quadrants remain in place for fallback/reference.
- Updated `src/data/backdrops.js`: Sistan now uses four ordered panorama layers (`marshSky360`, `reedline360`,
  `waterChannels360`, `apron360`) with tuned opacity, reduced wash/haze, and top-view fade on the closest water/apron
  bands. Zabulistan remains the only circular visual-board pilot; Sistan keeps the normal square tactical board.
- Verification: `npm run build` passed with only the existing splash-background/chunk-size warnings. Browser QA against
  `window.__dbg.visualQa.state('backdropSweep', { mapId: 'sistan' })` reported 4 loaded image layers, 0 failed, 0
  missing, no overflow, no visual artifact findings, and no console warnings/errors. Evidence screenshots:
  `artifacts/visual-qa/sistan-panorama360-low-final.png` and
  `artifacts/visual-qa/sistan-panorama360-top-final.png`.

## 2026-06-21 — Zabulistan cavalry staging prop pass

- Added a Zabulistan-only authored cavalry staging family, registered as `zv_cavalry_staging_set`, with a neutral runtime
  file at `public/assets/scenery/zabulistan/cavalry-staging-set.glb`.
- Updated `scripts/asset-tools/build-zabulistan-stage-assets.py` so the staging set has a darker trampled-earth base,
  hitching rail, tack and saddle props, shields, rope, feed details, upright lances, and small pennants. Export was run in
  a separate background 3D process, leaving the open scene unchanged at 473 objects.
- Updated `src/world/zabulistanVisualKit.js` to place the staging set from the isolated Zabulistan visual-kit pass after
  forecourt props, with animated standards and existing tether/procedural fallback preserved if the GLB is unavailable.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, the live Zabulistan scene reported
  two staging groups with 74 children each, no visual artifact findings, no desktop/mobile overflow, and five loaded
  panorama layers. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-cavalry-staging-final-wide.png`,
  `artifacts/visual-qa/zabulistan-cavalry-staging-final-close.png`, and
  `artifacts/visual-qa/zabulistan-cavalry-staging-final-mobile-rtl.png`.

## 2026-06-21 — Zabulistan palace forecourt dressing pass

- Added a Zabulistan-only authored forecourt approach family, registered as `zv_forecourt_approach_edges`, with a neutral
  runtime file at `public/assets/scenery/zabulistan/forecourt-approach-edges.glb`.
- Rebuilt `public/assets/scenery/zabulistan/palace-base-transition.glb` with a warmer ground bed, compacted earth plate,
  gate tread, curbs, threshold stones, scree rocks, and worn step slabs so the palace base reads as embedded terrain
  rather than stacked block clutter.
- Updated `src/world/zabulistanVisualKit.js` so the refreshed palace base transition has stable QA scene names, the new
  approach-edge asset dresses the visible gate threshold, and the intentional low-opacity forecourt wash is marked as
  visual-QA ignored instead of being flagged as a placeholder artifact.
- Export was run in a separate background 3D process, leaving the open scene unchanged at 473 objects.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, the live Zabulistan scene reported
  the base transition and approach-edge groups loaded, no visual artifact findings, no desktop/mobile overflow, and five
  loaded panorama layers. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-forecourt-dressing-final-wide.png`,
  `artifacts/visual-qa/zabulistan-forecourt-dressing-final-close.png`, and
  `artifacts/visual-qa/zabulistan-forecourt-dressing-final-mobile-rtl.png`.

## 2026-06-21 — Zabulistan lower approach and pad refinement pass

- Added a repeatable lower-approach QA state, `window.__dbg.visualQa.state('zabulistanForecourt', { mapId:
  'zabulistan' })`, with desktop and mobile-aware camera defaults that frame the road, approach pads, gate, and palace
  context without opening the palace command medallions by default.
- Updated `src/world/zabulistanVisualKit.js` to place a second authored `zv_forecourt_approach_edges` instance farther
  down the gate road as `zabulistan-forecourt-lower-approach-edges`, plus left/right `zv_road_scree_bank` shoulders as
  `zabulistan-forecourt-lower-scree-left` and `zabulistan-forecourt-lower-scree-right`.
- Refined `scripts/asset-tools/build-zabulistan-stage-assets.py` so `embedded-pad-set.glb` uses irregular polygon
  flagstones and broken wedges instead of rectangular cube tiles. Rebuilt the Zabulistan stage GLBs through the background
  asset export path.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, browser QA reported the lower
  approach groups, pad blend, and palace base transition loaded; artifacts 0, overflow 0, five backdrop layers loaded, and
  no browser errors in the final capture. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-forecourt-approach-final-desktop.png` and
  `artifacts/visual-qa/zabulistan-forecourt-approach-final-mobile-rtl.png`.

## 2026-06-21 — Zabulistan packed-road material pass

- Updated `src/world/road.js` for the Zabulistan road style only: the canvas road texture now uses muted packed-earth
  color, deterministic gravel noise, broken wheel-rut patches, short cross-wear strokes, and softer center dust instead
  of the previous smooth dark strip.
- Added small deterministic edge wobble to the Zabulistan render ribbon so road borders read less mechanically straight.
  Gameplay pathing, `ROAD_WIDTH`, path samples, flattening, pad placement, and enemy movement were left unchanged.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, browser QA reported artifacts 0,
  overflow 0, five Zabulistan backdrop layers loaded, and no browser errors in the final capture. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-road-material-final-desktop.png` and
  `artifacts/visual-qa/zabulistan-road-material-final-mobile-rtl.png`.

## 2026-06-21 — Zabulistan road-edge blend and terrain scuff pass

- Added a Zabulistan-only road shoulder mesh in `src/world/road.js`, named `zabulistan-road-shoulder-blend`, using
  opaque vertex-colored strips that follow the existing sampled road edge. Gameplay pathing, `ROAD_WIDTH`, road samples,
  pad placement, and enemy movement were left unchanged.
- Tightened the shoulder width and darkened the palette after visual comparison so it reads as a terrain feather rather
  than a pale border along the lane.
- Reduced the old random terrain stain layer in `src/world/zabulistanVisualKit.js`: fewer instances, smaller irregular
  scuffs, lower opacity, and lower placement so the playfield no longer shows large translucent oval blobs.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, browser QA in
  `zabulistanForecourt` reported `zabulistan-road-shoulder-blend`, `zabulistan-forecourt-approach-edges`, and
  `zabulistan-forecourt-lower-approach-edges` loaded; artifacts 0, overflow 0, 20 backdrop manifest layers, and no browser
  errors. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-road-blend-final-desktop.png` and
  `artifacts/visual-qa/zabulistan-road-blend-final-mobile-rtl.png`.

## 2026-06-21 — Zabulistan palace material tone pass

- Added a Zabulistan-only material profile in `src/core/assets.js` for cloned palace scenes. The raw palace asset remains
  unchanged, but runtime clones now remove the source material's full-white emissive factor, cap metalness, raise
  roughness, and multiply the texture by a muted sandstone tone.
- This addresses the prior bright/gold-heavy palace read while preserving carved detail, red banners, gate contrast, and
  the existing fallback path if the GLB is unavailable. No gameplay, pathing, palace command, or HUD behavior changed.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, browser QA reported the Zabulistan
  custom palace material as `color: 9a8664`, `emissive: 000000`, `emissiveIntensity: 0`, artifacts 0, overflow 0, road
  shoulder still loaded, and no browser errors. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-palace-tone-desktop.png`,
  `artifacts/visual-qa/zabulistan-palace-tone-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-palace-tone-selected.png`.

## 2026-06-21 — Zabulistan gate contact grit pass

- Added a Zabulistan-only `zabulistan-gate-contact-grit` group in `src/world/zabulistanVisualKit.js` around the palace
  gate threshold. It uses opaque vertex-colored broken ground polygons plus small instanced stone crumbs so the gate
  sits into the forecourt without transparent stain artifacts.
- The pass is scoped to visual grounding only. Gameplay pathing, tower pads, palace commands, HUD behavior, and fallback
  assets were left unchanged.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, browser QA reported the gate
  contact group visible with 2 children, 46 instanced crumbs, artifacts 0, overflow 0, mobile RTL clean, and no browser
  errors. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-gate-contact-desktop.png`,
  `artifacts/visual-qa/zabulistan-gate-contact-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-gate-contact-selected.png`.

## 2026-06-21 - Zabulistan gate combat readability pass

- Added repeatable Zabulistan combat QA via `window.__dbg.visualQa.state('zabulistanGateCombat', { mode: 'royal' })`.
  The state frames the palace forecourt, opens the compact palace command rail, spawns a royal gate assault, and keeps
  the map scoped to Zabulistan.
- Tightened `src/fx/palaceboons.js` with visual-only controls for `visualRadius`, `visualIntensity`,
  `targetVisualLimit`, `anchorVisualLimit`, and `groundWaveIntensity`. Gameplay radius and target selection remain
  unchanged.
- Tuned the royal gate combat callers in `src/game/game.js` so broad filled ground waves are suppressed for the
  low-chrome gate state, repeated danger pulses are compact/throttled, and the command effect no longer washes over the
  center/lower playfield.
- Browser QA note: in cold browser contexts, warm `loadZabulistanProps()` and `loadPalace('zabulistan')` before creating
  the Zabulistan QA state; otherwise the never-break fallback can appear in screenshots before authored GLBs finish.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, browser QA reported no page
  errors, artifacts 0, overflow 0, 14 attackers, 3 defenders, custom Zabulistan palace loaded, gate-contact/road
  shoulder/approach-edge groups loaded, five backdrop layers loaded, and palace-boon ground waves at 0. Evidence
  screenshots:
  `artifacts/visual-qa/zabulistan-gate-combat-final-desktop.png`,
  `artifacts/visual-qa/zabulistan-gate-combat-final-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-gate-combat-final-reduced-motion.png`.

## 2026-06-21 - Zabulistan cavalry close-combat readability pass

- Added a repeatable `window.__dbg.visualQa.state('zabulistanCavalryCloseCombat', { mode: 'royal' })` state for
  mounted defender close-ups at the palace gate. The state warms into Zabulistan, starts a royal sandbox assault, then
  frames the mounted contact zone without opening the palace drawer.
- Added visual-only cavalry contact markers in `src/game/game.js`: lane glints, hoof/readiness rings, enemy pressure
  marks, and short lance contact flashes from mounted palace defenders. The effect uses existing gate marker cleanup and
  does not change damage, range, target choice, or balance.
- Hooked mounted melee attacks in `src/entities/soldier.js` into the lance-contact beat when cavalry are fighting on the
  palace stand/gate line.
- Tightened low-chrome HUD behavior for active-wave captures: the wave call button becomes a compact active status chip,
  and automated visual-QA states hide sandbox helper chrome/toasts without changing normal sandbox tooling.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, browser QA reported no page
  errors, artifacts 0, overflow 0, Zabulistan props ready, Zabulistan horse ready, 3 mounted GLB defenders, and 1
  cavalry close-combat FX group in desktop, mobile RTL, and reduced-motion captures. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-cavalry-close-combat-final-desktop.png`,
  `artifacts/visual-qa/zabulistan-cavalry-close-combat-final-mobile-rtl.png`, and
  `artifacts/visual-qa/zabulistan-cavalry-close-combat-final-reduced-motion.png`.

## 2026-06-21 - Zabulistan mobile low-chrome HUD pass

- Added explicit HUD chip classes and a `wave-active` body state so Zabulistan mobile combat can prioritize gold, lives,
  wave, speed, Farr, and gate pressure while hiding secondary Codex/settings/language buttons behind the remaining menu
  path.
- Collapsed the mobile quick-build rail during active combat to a single edge build-catalog button. Build phase still
  keeps the role buttons available at the edge, but combat no longer carries a full vertical button strip over the
  playfield.
- Tightened the mobile low-chrome wave control: active combat uses the compact status chip, and build phase uses a
  smaller centered call button instead of a full-width footer.
- Verification: `npm run build` passed, `npm run audit:assets` passed with 0 blockers, browser QA reported no page
  errors, artifacts 0, overflow 0, mobile combat topbar 64px high, combat quick-build count 1, build-phase call control
  214px wide, and reduced-motion combat matching the same HUD footprint. Evidence screenshots:
  `artifacts/visual-qa/zabulistan-mobile-hud-combat-rtl.png`,
  `artifacts/visual-qa/zabulistan-mobile-hud-forecourt-rtl.png`,
  `artifacts/visual-qa/zabulistan-mobile-hud-combat-reduced-motion.png`, and
  `artifacts/visual-qa/zabulistan-desktop-hud-combat.png`.

## 2026-06-22 - Zabulistan gate approach depth pass

- Added an authored Zabulistan-only `zv_gate_cliff_siege_set` prop family exported to
  `public/assets/scenery/zabulistan/gate-cliff-siege-set.glb` from
  `scripts/asset-tools/build-zabulistan-stage-assets.py`.
- Registered the new neutral prop in `src/core/props3d.js` and placed four scoped gate-approach clusters in
  `src/world/zabulistanVisualKit.js`: left/right upper shoulders plus left/right lower shoulders. The pass preserves
  authored material colors, adds four animated beacon towers around the approach, and keeps a procedural rock/siege
  fallback if the GLB is unavailable.
- No gameplay pathing, pad placement, palace commands, balance, or enemy behavior changed.
- Verification: GLB export passed for `gate-cliff-siege-set.glb` (about 348 KB), `npm run build` passed,
  `npm run audit:assets` passed with 0 blockers, browser QA reported four authored
  `zabulistan-gate-cliff-siege-*` scene objects, four `zabulistan-gate-depth-beacon-*` objects, fallback false,
  artifacts 0, overflow 0, five backdrop layers loaded, no runtime errors, and nonblank final screenshots. Evidence:
  `artifacts/visual-qa/zabulistan-gate-depth-final-desktop.png`,
  `artifacts/visual-qa/zabulistan-gate-depth-final-combat.png`, and
  `artifacts/visual-qa/zabulistan-gate-depth-final-mobile-rtl.png`.
