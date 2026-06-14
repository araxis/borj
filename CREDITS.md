# Asset Credits

All third-party assets are free-licensed and bundled locally (no runtime downloads).

## 3D Models
- **KayKit Character Pack: Adventurers** (Knight, Barbarian, Mage, Rogue, Rogue Hooded)
  by Kay Lousberg — kaylousberg.com — **CC0 1.0**.
  License copy: `public/assets/models/KAYKIT-LICENSE.txt`
- **Fox** (animated low-poly) by PixelMannen — via Khronos glTF-Sample-Assets — **CC0 1.0**.
- **Horse** (animated) from the three.js examples (originally from the ro.me project,
  mirada/"The Wilderness Downtown") — **MIT** (three.js repository).

- **Quaternius** (quaternius.com) — **CC0 1.0** — Knight character (single knight pack),
  Snake/Snake_angry (easy enemies pack), Wolf/Stag/Deer/Horse/Horse White/Bull (animals
  pack), Modular Men/Women (King, Witch, Adventurer — currently unused/static).
  Files prefixed `q_` in `public/assets/models/`.
- **Quaternius Animals pack** (quaternius.com) — **CC0 1.0** — Alpaca, Bull, Cow, Deer,
  Donkey, Fox, Horse, Horse_White, Husky, ShibaInu, Stag, Wolf (animated). In
  `public/assets/animals/`, registered as `a_*` keys. Alpaca/ShibaInu unused by design.
- **Quaternius Ultimate Stylized Nature pack** (quaternius.com) — **CC0 1.0** — trees
  (Common/Pine/Dead/Twisted), bushes, ferns, plants, grass, clover, mushrooms, flowers,
  rocks and pebbles (static). In `public/assets/nature/n1/`, instanced per-biome by
  `world/props.js` (TwistedTree's red autumn foliage is used as Mazandaran's cursed-forest
  signature only).
- **Quaternius Fantasy Props MegaKit** (free version) (quaternius.com) — **CC0 1.0** —
  forge tools (anvil/workbench/whetstone/weapon-stand/bronze tools), caravanserai/bazaar
  clutter (stalls, carts, barrels, crates, farm-crates, vases, sacks, rope, buckets),
  treasury (coin piles, chest), lighting (torch, lantern), scrolls and static heraldry.
  A culturally-curated ~40-piece subset in `public/assets/things/t1/`, instanced as town
  set-dressing by `world/map.js`. European-tavern/interior pieces excluded by the cultural gate.
- **Quaternius stylized nature pack #2** (quaternius.com) — **CC0 1.0** — Birch & Maple
  (autumn) trees, extra dead trees, bushes, flower clumps, tall grass. In
  `public/assets/nature/n2/` (keys `n2_`-prefixed), instanced per-biome by `world/props.js`
  (Birch in green biomes, Maple autumn-red in Mazandaran only, dead trees everywhere).
  Textures pre-downscaled by `scripts/downscale_assets.py`.
- **Poly Haven** (polyhaven.com) — **CC0 1.0** — photo-scanned realistic props: boulders
  (namaqualand_boulder_02, boulder_01), dead tree trunks, tree stump, pine roots, and dry
  shrubs/weed/dandelion. A curated 10-model weathered/rock/deadwood set in
  `public/assets/rocks/` and `public/assets/trees/`, placed as low-count hero/detail clones
  in gritty biomes by `world/map.js`. 4K textures downscaled to 512–1024
  (`scripts/downscale_assets.py`); the huge photoreal leafy trees were dropped (style clash + size).
- **Quaternius Modular Characters** (quaternius.com) — **CC0 1.0** — Male/Female Peasant &
  Ranger outfits. EVALUATED AND NOT SHIPPED (kept only in `atlases/people/p1/`, not bundled).
  Blockers: the free pack's Peasant outfits are headless (no head mesh/part), the bound T-pose
  needs reposing, and the 2048² textures are ~5 MB each (~60 MB for 4 figures — ~doubles the
  offline deploy). Not worth it for background NPCs; the town's life comes from the existing
  animated `q_knight` guards/soldiers and ambient wildlife instead.

- **Meshy.ai** (meshy.ai) — **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/),
  attribution required and given here. Rigged, walk-animated 3D models: the **lion** and **white
  war-elephant / پیل سپید** enemies (`public/assets/animals/`); four **Persian soldier archetypes** —
  heavy infantry, scout-archer, woman warrior (Gordāfarid), robed mobed (`public/assets/models/Soldier_*.glb`);
  and the **Persian weapon props** — shamshir, gorz (ox-headed gorz-e-gāvsar), neyzeh, kaman, tabarzin,
  scepter (`public/assets/weapons/`). Modified for web delivery: textures resized to 1024 and re-encoded
  as WebP (geometry left uncompressed).

- **KayKit Medieval Builder Pack** by Kay Lousberg (kaylousberg.com) — **CC0 1.0** —
  modular building pieces (walls, fortified walls, towers, battlements, columns, gates,
  stairs, floors, fences, docks, barrels/crates) in `public/assets/buildings/b1/` with a
  shared texture atlas in `b1/Textures/`. Used as the fortified Persian town fabric around
  the citadels. Half-timber and pitched-gable pieces are excluded for cultural fidelity.

## Textures
- **ambientCG** (ambientcg.com) — Plaster001, Bricks090, Rock035, Ground037 (1K) — **CC0 1.0**.

## Music
- **Kevin MacLeod** (incompetech.com) — **CC BY 4.0** (attribution required, given here and in-game):
  - "Ibn Al-Noor" → `calm.mp3`
  - "Tabuk" → `battle.mp3`
  - "Desert City" → `menu.mp3`
  Licensed under Creative Commons: By Attribution 4.0 — http://creativecommons.org/licenses/by/4.0/

## Everything else
All other models, textures, sound effects and UI art are generated procedurally in-code
(this repository's license applies). Atlas paintings in `atlases/` are project-owned assets.
