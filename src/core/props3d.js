// Static 3D building-prop pipeline — KayKit Medieval Builder pack (CC0), used as the
// NEUTRAL STONE FABRIC (fortified Persian caravanserai / citadel-town) AROUND the custom
// Persian citadels, never replacing them. Deliberately separate from assets.js/spawnAsset
// (which is skinned-character only): these are static, share an external texture atlas,
// and need instancing for the repeated wall segments.
//
// CULTURAL GATE: only neutral stone/wood pieces are whitelisted here — every half-timber
// 'wall-pane*' and every pitched-gable 'roof*' is excluded from PROP_FILES entirely, per
// the Persian flat-parapet / dome vocabulary in memory/art-direction.md.
//
// HARD RULE: never-break. A missing/unloaded piece => null => the caller falls back to the
// existing procedural builders; the map can never break.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Dedupe shared asset fetches across the ~150 gltf we load at boot. Many props share trim
// textures + .bin buffers (the Quaternius things kit reuses 4 trim-sheets across dozens of
// pieces); without this each gltf re-fetches them, flooding the dev server's connection pool
// and dropping a load (an ORM map intermittently 404'd). Cache makes each URL fetch once.
THREE.Cache.enabled = true;

export const KIT_UNIT = 2.2;   // world-units per 1 kit-unit (pieces are a 1×1×1 grid)
export const KIT_TINT = 0xc9b48a; // warm sandstone, between MATS stone & plaster

const DIR = 'assets/buildings/b1/'; // relative (base:'./' + GitHub Pages subpath safe)
const NAMES = [
  'wall', 'wall-half', 'wall-low', 'wall-detail', 'wall-window', 'wall-door', 'wall-gate', 'wall-gate-half', 'wall-flat-gate',
  'wall-fortified', 'wall-fortified-half', 'wall-fortified-door', 'wall-fortified-window', 'wall-fortified-gate', 'wall-fortified-gate-half',
  'tower', 'tower-base', 'tower-edge', 'tower-top',
  'battlement', 'battlement-half', 'battlement-corner-inner', 'battlement-corner-outer',
  'column', 'column-damaged', 'stairs-stone', 'stairs-corner', 'floor', 'floor-flat', 'bricks',
  'barrels', 'detail-barrel', 'detail-crate', 'detail-crate-small', 'detail-crate-ropes', 'ladder',
  'fence', 'fence-wood', 'fence-top', 'dock-side', 'dock-corner', 'overhang', 'overhang-fence',
];
const PROP_FILES = Object.fromEntries(NAMES.map((n) => [n, DIR + n + '.glb']));

// Persian village kit (CC-BY) — bespoke adobe buildings that upgrade the KayKit village
// fabric. Whole-building props at native scale → place with a per-building `unit` (targetW/baseW)
// and tint:null to keep the authored adobe/turquoise palette. Gated on propReady → never-break.
const PERSIAN_DIR = 'assets/buildings/persian/';
const PERSIAN_NAMES = ['MudbrickHouse', 'BadgirHouse', 'Caravanserai', 'ChaharTaq', 'MarketStall'];
const PERSIAN_FILES = Object.fromEntries(PERSIAN_NAMES.map((n) => [n, PERSIAN_DIR + n + '.glb']));

// Quaternius Ultimate Stylized Nature pack (CC0) — 68 static .gltf foliage props.
// Loaded into the SAME cache as the building kit; callers use unit≈1.0 and tint:null to
// keep natural bark/leaf colors. NATURE_UNIT is the default nature scale.
export const NATURE_UNIT = 1.0;
const NDIR = 'assets/nature/n1/';
const NATURE_NAMES = [
  ...[1, 2, 3, 4, 5].flatMap((i) => [`CommonTree_${i}`, `Pine_${i}`, `DeadTree_${i}`, `TwistedTree_${i}`]),
  'Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Plant_1', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big',
  'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall',
  'Clover_1', 'Clover_2', 'Mushroom_Common', 'Mushroom_Laetiporus',
  'Flower_3_Group', 'Flower_3_Single', 'Flower_4_Group', 'Flower_4_Single',
  ...[1, 2, 3, 4, 5].map((i) => `Petal_${i}`),
  ...[1, 2, 3].map((i) => `Rock_Medium_${i}`),
  ...[1, 2, 3, 4, 5].map((i) => `Pebble_Round_${i}`),
  ...[1, 2, 3, 4, 5, 6].map((i) => `Pebble_Square_${i}`),
];
const NATURE_FILES = Object.fromEntries(NATURE_NAMES.map((n) => [n, NDIR + n + '.gltf']));

// Quaternius Fantasy Props MegaKit (CC0) — curated set-dressing for the inhabited town:
// forge tools (Kaveh the smith), caravanserai/bazaar clutter, treasury glint, Persian
// pottery, scrolls, lighting, static heraldry. ~1 unit/metre scale (THINGS_UNIT≈1.0),
// tint:null to keep the hand-painted trim-sheet PBR. Excluded by cultural gate: all
// interior furniture, bound books/bookcases, potions/bottles, mug, chandelier/candles,
// cooking pots — the European-tavern/wizard-library reads (see memory/art-direction.md).
export const THINGS_UNIT = 1.0;
const TDIR = 'assets/things/t1/';
const THINGS_NAMES = [
  // forge (smith-quarter)
  'Anvil', 'Anvil_Log', 'Workbench', 'Whetstone', 'WeaponStand', 'Sword_Bronze', 'Axe_Bronze', 'Pickaxe_Bronze', 'Shield_Wooden', 'Chain_Coil', 'Bucket_Metal',
  // market / caravanserai / docks
  'Stall_Empty', 'Stall_Cart_Empty', 'Barrel', 'Barrel_Apples', 'Barrel_Holder', 'Crate_Wooden', 'Crate_Metal', 'FarmCrate_Apple', 'FarmCrate_Carrot', 'FarmCrate_Empty', 'Bag', 'Pouch_Large', 'Vase_2', 'Vase_4', 'Rope_1', 'Rope_2', 'Rope_3', 'Bucket_Wooden_1',
  // treasury (near economy pads / tolls)
  'Coin', 'Coin_Pile', 'Coin_Pile_2', 'Chest_Wood',
  // lighting
  'Torch_Metal', 'Lantern_Wall',
  // static heraldry
  'Banner_1', 'Banner_2',
  // scribe accents
  'Scroll_1', 'Scroll_2',
  // optional dressing
  'Cage_Small', 'Dummy',
];
const THINGS_FILES = Object.fromEntries(THINGS_NAMES.map((n) => [n, TDIR + n + '.gltf']));

// Quaternius stylized nature pack #2 (CC0) — adds species n1 lacks: BIRCH, MAPLE (autumn),
// more dead trees, bush/flower/grass variety. Keys are n2_-PREFIXED to avoid colliding with
// n1's DeadTree_1..5 cache entries (n2 also has DeadTree_1..10). Same stylized family as n1
// → instanced via placeKit at unit:1, tint:null. Textures pre-downscaled (scripts/downscale_assets.py).
export const NATURE2_UNIT = 1.0;
const N2DIR = 'assets/nature/n2/';
const NATURE2_NAMES = [
  ...[1, 2, 3, 4, 5].map((i) => `BirchTree_${i}`),
  ...[1, 2, 3, 4, 5].map((i) => `MapleTree_${i}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `DeadTree_${i}`),
  'Bush', 'Bush_Small', 'Bush_Large', 'Bush_Flowers', 'Bush_Small_Flowers', 'Bush_Large_Flowers',
  'Flower_1', 'Flower_2', 'Flower_1_Clump', 'Flower_2_Clump', 'Flower_3_Clump', 'Flower_4_Clump', 'Flower_5_Clump',
  'Grass_Small', 'Grass_Large', 'Grass_Large_Extruded',
];
const NATURE2_FILES = Object.fromEntries(NATURE2_NAMES.map((n) => [`n2_${n}`, N2DIR + n + '.gltf']));

// Poly Haven photo-scanned realistic props (CC0) — a CURATED weathered/rock/deadwood/dry set
// (the least style-sensitive class; leafy photoreal trees were dropped for clash + size). Real-
// metre scale → REALISTIC_UNIT=1.0. HIGH-POLY: placed as low-count getProp CLONES with tint:null
// (NEVER instanced/tinted — the tintFactor fall-through would crush their PBR to sandstone).
export const REALISTIC_UNIT = 1.0;
const REALISTIC_FILES = {
  namaqualand_boulder_02: 'assets/rocks/r1/namaqualand_boulder_02_4k.gltf',
  boulder_01: 'assets/rocks/r2/boulder_01_4k.gltf',
  dead_tree_trunk: 'assets/trees/t9/dead_tree_trunk_4k.gltf',
  dead_tree_trunk_02: 'assets/trees/t8/dead_tree_trunk_02_4k.gltf',
  pine_roots: 'assets/trees/t10/pine_roots_4k.gltf',
  tree_stump_01: 'assets/trees/t11/tree_stump_01_4k.gltf',
  shrub_03: 'assets/trees/t6/shrub_03_4k.gltf',
  shrub_04: 'assets/trees/t7/shrub_04_4k.gltf',
  weed_plant_02: 'assets/trees/t4/weed_plant_02_4k.gltf',
  dandelion_01: 'assets/trees/t5/dandelion_01_4k.gltf',
};

// already-brown wood/clutter warms only slightly; grey stone gets the full sandstone lerp
const WOOD = new Set(['fence', 'fence-wood', 'fence-top', 'barrels', 'detail-barrel', 'detail-crate', 'detail-crate-small', 'detail-crate-ropes', 'ladder', 'overhang', 'overhang-fence']);
// stone lerps hard toward sandstone (kills the grey cobblestone cast even at close range);
// already-brown wood/clutter warms only a little
const tintFactor = (name) => (WOOD.has(name) ? 0.32 : 0.58);

// kit fronts face +Z (engine convention). Per-piece overrides go here after a live look.
const ROT_FIX = {};
export function propRotFix(name) { return ROT_FIX[name] ?? 0; }

const loader = new GLTFLoader();
const cache = new Map();      // name -> { scene, baseW, baseH, baseD } | 'failed'
const tintCache = new Map();  // `${matUUID}|${tintHex}|${factor}` -> Material
let started = false;

export function loadAllProps() {
  if (started) return;
  started = true;
  const entries = Object.entries({ ...PROP_FILES, ...PERSIAN_FILES, ...NATURE_FILES, ...NATURE2_FILES, ...THINGS_FILES, ...REALISTIC_FILES });
  // Bound concurrent fetches with a small worker pool. Firing all ~120 gltf at once made
  // dozens simultaneously re-request the same shared trim textures (a 3 MB ORM), flooding
  // the server's connection pool and intermittently dropping a texture load. ≤8 in flight
  // keeps every asset loading promptly (non-blocking) without the flood. Never-break.
  const LIMIT = 8;
  let i = 0;
  const pump = () => {
    if (i >= entries.length) return;
    const [name, url] = entries[i++];
    loader.load(url, (gltf) => {
      // try/finally so a malformed gltf can't skip pump() and permanently kill a pool slot
      try {
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        // tag cached geometry so map.dispose() skips it (clones/instances share these by
        // reference; disposing them would force a full GPU re-upload every map transition).
        gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.geometry) o.geometry.userData.cached = true; } });
        // baseY = lowest point; callers lift by -baseY*unit so off-pivot props (banners,
        // torches) sit on the ground instead of floating/sinking. Additive — never-break.
        cache.set(name, { scene: gltf.scene, baseW: size.x || 1, baseH: size.y || 1, baseD: size.z || 1, baseY: box.min.y || 0 });
      } finally { pump(); }
    }, undefined, () => { cache.set(name, 'failed'); pump(); });
  };
  for (let k = 0; k < Math.min(LIMIT, entries.length); k++) pump();
}

export function propReady(name) { const c = cache.get(name); return !!c && c !== 'failed'; }
export function propBase(name) { const c = cache.get(name); return (c && c !== 'failed') ? c : null; }

function tintedMaterial(srcMat, tint, factor) {
  const key = `${srcMat.uuid}|${tint}|${factor}`;
  let m = tintCache.get(key);
  if (!m) {
    m = srcMat.clone();
    const base = m.color ? m.color.clone() : new THREE.Color(0xffffff);
    m.color = base.lerp(new THREE.Color(tint), factor);
    tintCache.set(key, m);
  }
  return m;
}

function applyTint(root, name, tint) {
  const factor = tintFactor(name);
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = Array.isArray(o.material)
        ? o.material.map((mm) => tintedMaterial(mm, tint, factor))
        : tintedMaterial(o.material, tint, factor);
    }
  });
}

// single placeable clone (gates, towers, one-offs). null if not loaded.
export function getProp(name, { unit = KIT_UNIT, tint = KIT_TINT } = {}) {
  const c = cache.get(name);
  if (!c || c === 'failed') return null;
  const g = c.scene.clone(true);
  g.scale.setScalar(unit);
  if (tint != null) applyTint(g, name, tint);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; } });
  return g;
}

// PERF LEVER for repeated pieces (walls, battlements, fences, column fields):
// one InstancedMesh per sub-mesh, sharing geometry + one tinted material.
// mats4 = array of world-space THREE.Matrix4 placements (translation+rotation; the piece's
// own `unit` scale and each sub-mesh's local transform are composed in here).
export function instanceProp(name, mats4, { unit = KIT_UNIT, tint = KIT_TINT, castShadow = true, receiveShadow = true, frustumCulled = true } = {}) {
  const c = cache.get(name);
  if (!c || c === 'failed' || !mats4.length) return null;
  const group = new THREE.Group();
  const scaleM = new THREE.Matrix4().makeScale(unit, unit, unit);
  const factor = tintFactor(name);
  c.scene.updateMatrixWorld(true);
  const tmp = new THREE.Matrix4();
  c.scene.traverse((o) => {
    if (!o.isMesh) return;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const mat = tint != null ? tintedMaterial(src, tint, factor) : src;
    const inst = new THREE.InstancedMesh(o.geometry, mat, mats4.length);
    inst.castShadow = castShadow; inst.receiveShadow = receiveShadow; inst.frustumCulled = frustumCulled;
    const local = o.matrixWorld; // mesh placement within the piece (scene root at identity)
    mats4.forEach((world, i) => {
      tmp.copy(world).multiply(scaleM).multiply(local);
      inst.setMatrixAt(i, tmp);
    });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });
  return group;
}

// helper: a world matrix from position + Y-rotation (kit pieces snap to 90° steps)
export function placeM4(x, y, z, ry = 0) {
  return new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
}
