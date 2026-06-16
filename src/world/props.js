// Environment props — cypress, plane trees, palms, reeds, rocks, spawn gates, citadel.
// Instanced where possible. The citadel is the defended structure at the road's end,
// built from the same architecture language as the towers.
import * as THREE from 'three';
import { MATS, MeshBuilder } from '../models/materials.js';
import { makeBanner, makeFlame } from '../models/towerkit.js';
import { colorMat } from '../models/humanoid.js';
import { instanceProp, propReady, propBase, FOREST_TREE_NAMES, forestEnrichReady } from '../core/props3d.js';

export { makeBanner }; // re-export for map-level roadside banners

// ---- Quaternius Ultimate Stylized Nature pack (CC0) variant pools ----
// Each entry is a list of interchangeable .gltf names registered in props3d.js. placeKit
// buckets random points by chosen variant, so N points collapse to ≤ variants.length
// InstancedMesh draw-calls. unit:1 + uniform per-instance scale (baked via m4 = T·R·S(s))
// + tint:null keep the kit's own normal-mapped bark/leaf materials. The Persian-iconic
// sarv cypress / date palm / reeds / pomegranate / red poppy stay PROCEDURAL (no pack
// equivalent + load-bearing color beats), so only the generic broadleaf/bush/boulder/
// cone-grass get replaced here. Mazandaran(forest)=Twisted+Dead+Common; Alborz/Damavand
// (mountain/snowpeak)=Pine; the dry steppe/desert never get pines.
const NV = {
  commonTree: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'],
  pine: ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'],
  deadTree: ['DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5'],
  twisted: ['TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3', 'TwistedTree_4', 'TwistedTree_5'],
  // green undergrowth for ALL biomes. NOTE: Bush_Common/Bush_Common_Flowers are deliberately
  // EXCLUDED here — they reuse the pack's RED Leaves_TwistedTree texture (autumn/cursed), which
  // looks wrong scattered through a green valley. They live in bushForest instead.
  bush: ['Plant_1', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big', 'Fern_1'],
  // Mazandaran(forest) cursed-marsh undergrowth — adds the RED autumn bushes as companions to
  // the crimson TwistedTree canopy (matches the div-haunted forest's blood-red signature).
  bushForest: ['Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Plant_1_Big', 'Plant_7_Big'],
  grass: ['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short'],
  dryGrass: ['Grass_Wispy_Short', 'Grass_Wispy_Tall'],
  rock: ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'],
  pebbleRound: ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Round_4', 'Pebble_Round_5'],
  pebbleSquare: ['Pebble_Square_1', 'Pebble_Square_2', 'Pebble_Square_3', 'Pebble_Square_4', 'Pebble_Square_5', 'Pebble_Square_6'],
  flower: ['Flower_3_Group', 'Flower_4_Group'],
  mushroom: ['Mushroom_Common', 'Mushroom_Laetiporus'],
  // ---- stylized nature pack #2 (n2_ prefixed; same instanced placeKit path) ----
  birch: ['n2_BirchTree_1', 'n2_BirchTree_2', 'n2_BirchTree_3', 'n2_BirchTree_4', 'n2_BirchTree_5'],
  maple: ['n2_MapleTree_1', 'n2_MapleTree_2', 'n2_MapleTree_3', 'n2_MapleTree_4', 'n2_MapleTree_5'], // AUTUMN red — forest only
  deadTree2: ['n2_DeadTree_1', 'n2_DeadTree_2', 'n2_DeadTree_3', 'n2_DeadTree_4', 'n2_DeadTree_5', 'n2_DeadTree_6', 'n2_DeadTree_7', 'n2_DeadTree_8', 'n2_DeadTree_9', 'n2_DeadTree_10'],
  bushGreen2: ['n2_Bush', 'n2_Bush_Small', 'n2_Bush_Large'],
  bushFlower2: ['n2_Bush_Flowers', 'n2_Bush_Small_Flowers', 'n2_Bush_Large_Flowers'],
  flowerClump2: ['n2_Flower_1_Clump', 'n2_Flower_2_Clump', 'n2_Flower_3_Clump', 'n2_Flower_4_Clump', 'n2_Flower_5_Clump'],
  tallGrass2: ['n2_Grass_Large', 'n2_Grass_Large_Extruded'],
};

// per-biome tree composition (variant pool, count, uniform-scale lo/hi, min-clearance).
// counts intentionally override the terrain budget for mountain/snowpeak/desert (pine bump,
// bare treeline snags) per the nature-pack art spec; everything else tracks the budget.
// n2 segments are APPENDED (never prepended): plan[0] must stay an n1 pool because the tree
// block gates the whole pass on kitOn(plan[0].pool); appended n2 segments no-op (placeKit→0)
// until n2 loads. Birch (green) enriches temperate biomes; Maple (autumn red) is forest-ONLY
// (the red-foliage=Mazandaran binding rule); deadTree2 adds bare snags everywhere (zero clash).
const TREE_PLAN = {
  highland: [{ pool: 'commonTree', count: 8, lo: 0.9, hi: 1.2, minR: 6 }, { pool: 'birch', count: 6, lo: 0.9, hi: 1.2, minR: 6 }],
  wetland: [{ pool: 'commonTree', count: 6, lo: 0.85, hi: 1.0, minR: 6 }, { pool: 'birch', count: 4, lo: 0.85, hi: 1.1, minR: 6 }],
  valley: [{ pool: 'commonTree', count: 12, lo: 0.9, hi: 1.2, minR: 6 }, { pool: 'birch', count: 8, lo: 0.9, hi: 1.2, minR: 6 }],
  plains: [{ pool: 'commonTree', count: 14, lo: 0.9, hi: 1.2, minR: 6 }, { pool: 'birch', count: 6, lo: 0.9, hi: 1.2, minR: 6 }],
  forest: [
    { pool: 'twisted', count: 8, lo: 0.85, hi: 1.15, minR: 10 }, // sparse hero gnarled giants — never shrink
    { pool: 'deadTree', count: 16, lo: 0.8, hi: 1.1, minR: 6 },  // bare understory
    { pool: 'commonTree', count: 34, lo: 0.7, hi: 0.9, minR: 5 }, // dim wet-jungle canopy mass
    { pool: 'maple', count: 8, lo: 0.85, hi: 1.15, minR: 7 },    // autumn-red companions to the crimson twisted signature
    { pool: 'deadTree2', count: 10, lo: 0.8, hi: 1.1, minR: 6 }, // more bare snags
  ],
  mountain: [
    { pool: 'pine', count: 12, lo: 0.8, hi: 1.1, minR: 7 },      // pine-clad Alborz (bumped past budget)
    { pool: 'deadTree', count: 6, lo: 0.8, hi: 1.1, minR: 7 },   // treeline snags
    { pool: 'deadTree2', count: 6, lo: 0.8, hi: 1.1, minR: 7 },
  ],
  snowpeak: [
    { pool: 'deadTree', count: 4, lo: 0.7, hi: 0.9, minR: 10 },  // bare wind-killed treeline only
    { pool: 'deadTree2', count: 4, lo: 0.7, hi: 0.9, minR: 10 },
  ],
  steppe: [
    { pool: 'commonTree', count: 3, lo: 0.85, hi: 1.05, minR: 9 }, // lonely steppe trees — NO pine
    { pool: 'deadTree', count: 3, lo: 0.8, hi: 1.0, minR: 9 },
    { pool: 'deadTree2', count: 4, lo: 0.8, hi: 1.0, minR: 9 },
  ],
  desert: [
    { pool: 'deadTree', count: 4, lo: 0.7, hi: 0.9, minR: 10 }, // sun-bleached snags
    { pool: 'deadTree2', count: 4, lo: 0.7, hi: 0.9, minR: 10 },
  ],
  river: [{ pool: 'commonTree', count: 10, lo: 0.85, hi: 1.05, minR: 6 }, { pool: 'birch', count: 6, lo: 0.85, hi: 1.1, minR: 6 }],
};

const kitOn = (pool) => propReady(NV[pool][0]); // representative readiness probe for a pool

// Bucket random ground points by random kit variant → one InstancedMesh per variant.
// scaleFn(rng)→uniform scale (folds NATURE_UNIT=1.0 in, so it IS the final world scale —
// unit:1 below makes the baked scale the only scale, provably non-shearing for uniform s).
// Returns the count actually placed (0 ⇒ kit unloaded/failed ⇒ caller runs procedural).
function placeKit(group, pts, rng, variants, scaleFn, opts) {
  const buckets = new Map();
  for (const [x, y, z] of pts) {
    const name = variants[(rng() * variants.length) | 0];
    const s = scaleFn(rng);
    const w = m4(x, y, z, rng() * 6.28318, s);
    let a = buckets.get(name);
    if (!a) { a = []; buckets.set(name, a); }
    a.push(w);
  }
  let placed = 0;
  for (const [name, mats] of buckets) {
    const g = instanceProp(name, mats, { unit: 1, tint: null, ...opts });
    if (g) { group.add(g); placed += mats.length; }
  }
  return placed;
}

function instanced(geo, mat, mats4) {
  const m = new THREE.InstancedMesh(geo, mat, mats4.length);
  mats4.forEach((mm, i) => m.setMatrixAt(i, mm));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const m4 = (x, y, z, ry = 0, s = 1) => {
  const m = new THREE.Matrix4().makeRotationY(ry);
  m.scale(new THREE.Vector3(s, s, s));
  m.setPosition(x, y, z);
  return m;
};

// Mazandaran's dense Hyrcanian forest: realistic Meshy tree GLBs (sloppy-decimated to ~22k tris,
// instanced) replace the toy kit trees. Each tree's bbox is normalized via propBase so it sits
// base-on-ground at a target height; per-type multipliers tune the few that read short. Buckets
// by tree name → one instanceProp per type (≤11 InstancedMesh groups for the whole forest).
// Gated on the WHOLE set being ready so the look is consistent; returns count placed (0 ⇒ caller
// falls back to the kit/procedural trees → never-break).
const TREE_N1_H = { n1_07: 0.82, n1_08: 0.72 }; // the smaller-read trees stay shorter
// n1_06 is dropped from placement (oversaturated lime + cartoon trunk + a baked ground disc — it
// breaks the deep-green Hyrcanian palette); it still loads so the readiness gate stays simple.
const TREE_N1_SKIP = new Set(['n1_06']);
// Visually-cataloged clean broad canopies (no facet-blobbing, no ground disc) — the LARGEST
// instances are drawn from these so the prominent foreground trees always read crisp; the sloppy-
// decimated ones (faceted up close) only take the smaller scales.
const TREE_N1_BIG = new Set(['n1_01', 'n1_02', 'n1_04', 'n1_09']);
const TREE_BIG_THRESHOLD = 9.5; // u — at/above this target height, prefer the clean broad trees
function placeForestTrees(group, pts, rng, foliageSpots) {
  const ready = FOREST_TREE_NAMES.filter((n) => propReady(n) && !TREE_N1_SKIP.has(n));
  if (ready.length < 6) return 0; // not enough of the set loaded yet → caller falls back to kit trees
  const bigReady = ready.filter((n) => TREE_N1_BIG.has(n));
  const buckets = new Map();
  for (const [x, y, z] of pts) {
    const baseTargetH = 7 + rng() * 4; // ~7–11 u — capped below tower height so foreground isn't chunky
    // the tallest instances come from the clean broad set; everything else from the full pool
    const pool = (baseTargetH >= TREE_BIG_THRESHOLD && bigReady.length) ? bigReady : ready;
    const name = pool[(rng() * pool.length) | 0];
    const base = propBase(name);
    if (!base) continue;
    const targetH = baseTargetH * (TREE_N1_H[name] || 1);
    const s = targetH / base.baseH;
    const m = new THREE.Matrix4().makeRotationY(rng() * 6.28318);
    m.scale(new THREE.Vector3(s, s, s));
    // lift so the lowest vertex rests on the ground, then SINK ~0.6 u to bury Meshy's flat
    // ground-plane disc baked at each tree's base (it can't be stripped — single-mesh GLB).
    m.setPosition(x, y - base.baseY * s - 0.6, z);
    let a = buckets.get(name); if (!a) { a = []; buckets.set(name, a); }
    a.push(m);
    foliageSpots.push([x, z, 2.6]);
  }
  let placed = 0;
  for (const [name, mats] of buckets) {
    const g = instanceProp(name, mats, { unit: 1, tint: null });
    if (g) { group.add(g); placed += mats.length; }
  }
  return placed;
}

// Replace the kit-tree fallback in a forest map's tree sub-group with the realistic GLB trees once
// they've loaded (called by map.js from loadForestTrees's onReady). Reuses the SAME ground points so
// trees keep their positions — only the form swaps in. Disposes the old InstancedMesh instance
// buffers (shared geometry/materials are left intact). No-op if already GLB or nothing loaded.
export function swapForestTrees(swap) {
  if (!swap || swap.placed) return false;
  // Build the GLB trees into a temp group FIRST: only tear down the kit fallback once we know the
  // replacement actually placed (a partial tree load must not leave an empty forest).
  const fresh = new THREE.Group();
  if (!placeForestTrees(fresh, swap.pts, Math.random, [])) return false;
  for (let i = swap.group.children.length - 1; i >= 0; i--) {
    const c = swap.group.children[i];
    c.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    swap.group.remove(c);
  }
  while (fresh.children.length) swap.group.add(fresh.children[0]);
  swap.placed = true;
  return true;
}

// ---- forest-floor enrichment: realistic Meshy flowers / mushrooms / boulders + a few extra canopy
// trees (n2 set). Instanced per type from pre-generated ground points; each normalized base-on-ground
// at a target height with a sink to bury Meshy's baked ground disc. Mirrors the tree load+swap. ----
const ENRICH_FLOWERS = ['mf01', 'mf02', 'mf03', 'mf04', 'mf05', 'mf06', 'mf07', 'mf08', 'mf09', 'mf10', 'mf11', 'mf12'];
const ENRICH_MUSH = ['mm01', 'mm02', 'mm03', 'mm04', 'mm05', 'mm06', 'mm07'];
const ENRICH_ROCKS = ['mr01', 'mr02', 'mr03', 'mr04', 'mr05', 'mr07', 'mr08'];
const ENRICH_TREES = ['mt02', 'mt03']; // mt01 is a horizontal LOG, not an upright tree — height-normalizing it made a giant log; excluded
const ENRICH_GLOW = new Set(['mm03', 'mm04']); // the blue "Enchanted Glow" fae mushrooms — emissive so they glow (bloom picks it up)

// place one instanced enrichment category from points; returns count placed.
function placeEnrichCat(group, pool, pts, rng, hLo, hHi, sink, castShadow) {
  const ready = pool.filter((n) => propReady(n));
  if (!ready.length || !pts.length) return 0;
  const buckets = new Map();
  for (const [x, y, z] of pts) {
    const name = ready[(rng() * ready.length) | 0];
    const base = propBase(name);
    if (!base) continue;
    const s = (hLo + rng() * (hHi - hLo)) / base.baseH;
    const m = new THREE.Matrix4().makeRotationY(rng() * 6.28318);
    m.scale(new THREE.Vector3(s, s, s));
    m.setPosition(x, y - base.baseY * s - sink, z);
    let a = buckets.get(name); if (!a) { a = []; buckets.set(name, a); }
    a.push(m);
  }
  let placed = 0;
  for (const [name, mats] of buckets) {
    const g = instanceProp(name, mats, { unit: 1, tint: null, castShadow });
    if (g) {
      // fae mushrooms glow: clone the material PER instanced-mesh (never the shared cache) + add emissive
      if (ENRICH_GLOW.has(name)) g.traverse((o) => { if (o.isInstancedMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x2fb6d6); o.material.emissiveIntensity = 0.85; } });
      group.add(g); placed += mats.length;
    }
  }
  return placed;
}

// Deliberate one-off landmarks (curated, well-spaced — NOT scattered): each placed at points
// pre-generated in scatterProps and carried in data.landmarks. h = target height; face=true aims
// the piece's opening toward the map centre (the arch reads as a gateway).
const LANDMARK_PLAN = [
  { name: 'ms01', count: 1, minR: 10, h: 7.5, sink: 0.5, face: true }, // ivy stone arch — forest gateway
  { name: 'mt06', count: 1, minR: 9, h: 5.5, sink: 0.4 },             // giant ancient stump — clearing centerpiece
  { name: 'ms02', count: 1, minR: 9, h: 4.5, sink: 0.4 },             // ancient ruins
  { name: 'ms04', count: 1, minR: 11, h: 17, sink: 0.7 },            // haunted spire — tall landmark
  { name: 'mt05', count: 2, minR: 6, h: 2.6, sink: 0.25 },           // mossy fallen log
  { name: 'mt01', count: 2, minR: 6, h: 2.4, sink: 0.3 },            // fallen log (mt01 is a log, not a canopy tree — sized as one here)
  { name: 'mr06', count: 2, minR: 7, h: 6, sink: 0.5 },              // standing stones / menhirs
  { name: 'mx01', count: 3, minR: 6, h: 11, sink: 0.5 },             // tall dead snags
  { name: 'mx02', count: 3, minR: 6, h: 11, sink: 0.5 },
];

function placeForestLandmarks(group, landmarks, rng) {
  let n = 0;
  for (const lm of landmarks) {
    if (!propReady(lm.name) || !lm.pts.length) continue;
    const base = propBase(lm.name);
    if (!base) continue;
    const mats = [];
    for (const [x, y, z] of lm.pts) {
      const s = lm.h / base.baseH;
      const ry = lm.face ? Math.atan2(-x, -z) : rng() * 6.28318;
      const m = new THREE.Matrix4().makeRotationY(ry);
      m.scale(new THREE.Vector3(s, s, s));
      m.setPosition(x, y - base.baseY * s - lm.sink, z);
      mats.push(m);
    }
    const g = instanceProp(lm.name, mats, { unit: 1, tint: null });
    if (g) { group.add(g); n += mats.length; }
  }
  return n;
}

function placeForestEnrich(group, data, rng) {
  let n = 0;
  n += placeEnrichCat(group, ENRICH_TREES, data.trees, rng, 7.5, 11, 0.6, true);    // extra canopy trees (matched to the n1 trees)
  n += placeEnrichCat(group, ENRICH_ROCKS, data.rocks, rng, 1.4, 3.4, 0.3, true);  // mossy boulders
  n += placeEnrichCat(group, ENRICH_FLOWERS, data.flowers, rng, 0.8, 1.7, 0.12, false); // flower clumps
  n += placeEnrichCat(group, ENRICH_MUSH, data.mush, rng, 0.6, 1.4, 0.18, false);  // mushroom clusters
  n += placeForestLandmarks(group, data.landmarks || [], rng);                     // curated landmarks
  return n;
}

// Populate the forest enrichment sub-group once the n2 set has loaded (additive — no kit fallback to
// tear down). Math.random for variation; positions come from the build-time `data` point sets.
export function swapForestEnrich(e) {
  if (!e || e.placed) return false;
  const fresh = new THREE.Group();
  if (!placeForestEnrich(fresh, e.data, Math.random)) return false;
  for (let i = e.group.children.length - 1; i >= 0; i--) {
    const c = e.group.children[i];
    c.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    e.group.remove(c);
  }
  while (fresh.children.length) e.group.add(fresh.children[0]);
  e.placed = true;
  return true;
}

export function scatterProps(rng, heightAt, isClear, biomeProps, group, biomeId = 'plains') {
  const anim = { windmills: [], campfires: [], flames: [] };
  // centers [x, z, keepoutRadius] of the big stylized foliage (cypress / canopy trees / palm) so
  // realistic Poly Haven hero props can be kept clear of them (the binding art-clash rule).
  const foliageSpots = [];
  const place = (count, minR = 8) => {
    const out = [];
    let guard = count * 14;
    while (out.length < count && guard-- > 0) {
      const x = (rng() - 0.5) * 136;
      const z = (rng() - 0.5) * 136;
      if (!isClear(x, z, minR)) continue;
      out.push([x, heightAt(x, z), z]);
    }
    return out;
  };

  // cypress — the iconic Persian sarv, smooth teardrop silhouette
  if (biomeProps.cypress) {
    const pts = place(biomeProps.cypress, 5);
    for (const p of pts) foliageSpots.push([p[0], p[2], 3]);
    const trunkM = [], folM = [];
    for (const [x, y, z] of pts) {
      const s = 0.8 + rng() * 0.8;
      trunkM.push(m4(x, y, z, rng() * 6.28, s));
      folM.push(m4(x, y, z, rng() * 6.28, s));
    }
    const profile = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      profile.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.75)) * 0.62, 0.9 + t * 3.2));
    }
    group.add(instanced(new THREE.CylinderGeometry(0.09, 0.15, 1.0, 7).translate(0, 0.5, 0), MATS().woodDark, trunkM));
    group.add(instanced(new THREE.LatheGeometry(profile, 10), colorMat(0x2e4a2c, 0.95), folM));
  }
  // trees — Quaternius kit foliage routed by biome (forest=twisted+dead+common, mountain=
  // pine+dead, steppe/desert=dead, the rest=common). Falls back to the procedural broadleaf
  // (3 spheres on a trunk) only if the kit isn't loaded yet (never-break).
  {
    const plan = TREE_PLAN[biomeId];
    let placed = 0;
    // Mazandaran (forest): dense realistic Meshy tree GLBs replace the kit trees. All forest trees
    // (GLB, or the kit/procedural fallback) go into a dedicated sub-group so map.js can swap JUST the
    // trees for the GLBs once the dedicated loader finishes (without re-running the whole scatter).
    let treeTarget = group;
    if (biomeId === 'forest') {
      const forestGroup = new THREE.Group();
      group.add(forestGroup);
      treeTarget = forestGroup;
      const forestPts = place(108, 3.5);
      placed = placeForestTrees(forestGroup, forestPts, rng, foliageSpots);
      anim.forestSwap = { group: forestGroup, pts: forestPts, placed: placed > 0 };
    }
    if (!placed && plan && kitOn(plan[0].pool)) {
      for (const seg of plan) {
        const pts = place(seg.count, seg.minR);
        for (const p of pts) foliageSpots.push([p[0], p[2], 3.5]);
        placed += placeKit(treeTarget, pts, rng, NV[seg.pool], (r) => seg.lo + r() * (seg.hi - seg.lo));
      }
    }
    if (!placed && biomeProps.tree) {
      const pts = place(biomeProps.tree, 6);
      const trunkM = [], folM = [], folM2 = [], folM3 = [];
      for (const [x, y, z] of pts) {
        const s = 0.9 + rng() * 0.7;
        const ry = rng() * 6.28;
        trunkM.push(m4(x, y, z, ry, s));
        folM.push(m4(x, y, z, ry, s));
        folM2.push(m4(x + 0.7 * s, y - 0.35 * s, z + 0.3 * s, ry, s * 0.72));
        folM3.push(m4(x - 0.6 * s, y - 0.3 * s, z - 0.4 * s, ry, s * 0.66));
      }
      const leaf = colorMat(0x4a6e35, 0.95);
      const leaf2 = colorMat(0x547a3a, 0.95);
      treeTarget.add(instanced(new THREE.CylinderGeometry(0.14, 0.24, 1.7, 8).translate(0, 0.8, 0), MATS().wood, trunkM));
      treeTarget.add(instanced(new THREE.SphereGeometry(1.3, 12, 9).translate(0, 2.7, 0), leaf, folM));
      treeTarget.add(instanced(new THREE.SphereGeometry(1.0, 11, 8).translate(0, 2.5, 0), leaf2, folM2));
      treeTarget.add(instanced(new THREE.SphereGeometry(0.85, 10, 8).translate(0, 2.3, 0), leaf, folM3));
    }
  }
  // forest-floor enrichment (Mazandaran + Manijeh Garden): realistic flowers / mushrooms / boulders +
  // extra canopy trees. Loads on the dedicated forest path; if not ready at build, map.js swaps it in.
  if (biomeId === 'forest') {
    const enrichGroup = new THREE.Group();
    group.add(enrichGroup);
    const enrichData = {
      trees: place(20, 7),    // extra big canopy accents, mixed in with the n1 trees
      rocks: place(13, 3),    // realistic mossy boulders
      flowers: place(58, 2),  // dense flower clumps in the clearings
      mush: place(32, 2.4),   // mushroom clusters
      // curated landmarks — one/few each, well-spaced (large minR) so they read as deliberate features
      landmarks: LANDMARK_PLAN.map((l) => ({ name: l.name, h: l.h, sink: l.sink, face: l.face, pts: place(l.count, l.minR) })),
    };
    const ePlaced = forestEnrichReady() ? placeForestEnrich(enrichGroup, enrichData, rng) : 0;
    anim.forestEnrich = { group: enrichGroup, data: enrichData, placed: ePlaced > 0 };
  }
  // date palms with arching fronds
  if (biomeProps.palm) {
    const pts = place(biomeProps.palm, 6);
    for (const p of pts) foliageSpots.push([p[0], p[2], 3.5]);
    const trunkM = [], folM = [];
    for (const [x, y, z] of pts) {
      const s = 0.9 + rng() * 0.6;
      trunkM.push(m4(x, y, z, rng() * 6.28, s));
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2 + rng();
        const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.85, a, 0, 'YXZ'));
        m.scale(new THREE.Vector3(s, s, s));
        m.setPosition(x, y + 3.25 * s, z);
        folM.push(m);
      }
    }
    group.add(instanced(new THREE.CylinderGeometry(0.12, 0.22, 3.2, 8).translate(0, 1.6, 0), MATS().wood, trunkM));
    const frond = new THREE.ConeGeometry(0.22, 1.9, 6).translate(0, 0.95, 0);
    group.add(instanced(frond, colorMat(0x5a7a30, 0.9), folM));
  }
  // reeds
  if (biomeProps.reeds) {
    const pts = place(biomeProps.reeds, 3);
    const ms = pts.map(([x, y, z]) => m4(x, y, z, rng() * 6.28, 0.7 + rng() * 0.7));
    group.add(instanced(new THREE.ConeGeometry(0.16, 1.7, 6).translate(0, 0.85, 0), colorMat(0x7a8a4a, 0.95), ms));
  }
  // low bushes / undergrowth — kit shrubs (Plant/Fern, +red autumn bushes in forest);
  // procedural sphere fallback
  if (biomeProps.bush) {
    const greenBiome = ['valley', 'plains', 'river', 'highland', 'wetland'].includes(biomeId);
    const bushPool = biomeId === 'forest' ? NV.bushForest
      : (greenBiome && propReady(NV.bushGreen2[0])) ? NV.bushGreen2 // n2 leafy green bushes
        : NV.bush;
    const pts = place(biomeProps.bush, 3);
    let placed = 0;
    if (propReady(bushPool[0])) placed = placeKit(group, pts, rng, bushPool, (r) => 0.6 + r() * 0.6);
    if (!placed) {
      const ms = pts.map(([x, y, z]) => {
        const m = new THREE.Matrix4().makeRotationY(rng() * 6.28);
        const s = 0.5 + rng() * 0.8;
        m.scale(new THREE.Vector3(s, s * 0.62, s));
        m.setPosition(x, y + 0.18 * s, z);
        return m;
      });
      group.add(instanced(new THREE.SphereGeometry(0.8, 9, 7), colorMat(0x3f5e30, 0.95), ms));
    }
  }
  // rocks — kit boulders (Rock_Medium) + a pebble scatter; procedural icosahedron fallback
  if (biomeProps.rock) {
    const pts = place(biomeProps.rock, 4);
    let placed = 0;
    if (kitOn('rock')) placed = placeKit(group, pts, rng, NV.rock, (r) => 0.7 + r() * 0.7);
    if (!placed) {
      const ms = pts.map(([x, y, z]) => {
        const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rng() * 0.6, rng() * 6.28, rng() * 0.6));
        const s = 0.5 + rng() * 1.6;
        m.scale(new THREE.Vector3(s, s * (0.6 + rng() * 0.5), s * (0.8 + rng() * 0.4)));
        m.setPosition(x, y, z);
        return m;
      });
      group.add(instanced(new THREE.IcosahedronGeometry(0.8, 1), colorMat(0x8b8276, 0.95), ms));
    }
    // pebble dressing — round on green/wet biomes, square scree on dry/high; no shadow, no cull
    const pebPool = ['desert', 'steppe', 'mountain', 'snowpeak'].includes(biomeId) ? 'pebbleSquare' : 'pebbleRound';
    if (kitOn(pebPool)) {
      const ppts = place(biomeProps.rock * 2, 2);
      placeKit(group, ppts, rng, NV[pebPool], (r) => 0.5 + r() * 0.5, { castShadow: false, frustumCulled: false });
    }
  }

  // ---- ground cover: grass ----
  // kit blades (Grass_Common/_Wispy; dry biomes use wispy-only) bucketed to ≤3 InstancedMeshes,
  // shadow OFF + frustum OFF (a field of spread instances would pop on the origin bounding-
  // sphere). Falls back to the procedural color-varied cone tufts if the kit isn't loaded.
  if (biomeProps.grass) {
    const n = biomeProps.grass;
    const dry = !!biomeProps.dryGrass;
    const gpts = [];
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * 138, z = (rng() - 0.5) * 138;
      if (!isClear(x, z, 0.5)) continue;
      gpts.push([x, heightAt(x, z), z]);
    }
    const gPool = dry ? 'dryGrass' : 'grass';
    let placed = 0;
    if (kitOn(gPool)) {
      placed = placeKit(group, gpts, rng, NV[gPool], (r) => 0.7 + r() * 0.5,
        { castShadow: false, receiveShadow: true, frustumCulled: false });
      // sparse n2 tall-grass overlay (~1/6 of points) for silhouette/height variety in green biomes
      if (placed && !dry && propReady(NV.tallGrass2[0])) {
        placeKit(group, gpts.filter((_, i) => i % 6 === 0), rng, NV.tallGrass2,
          (r) => 0.7 + r() * 0.5, { castShadow: false, frustumCulled: false });
      }
    }
    if (!placed) {
      const geo = new THREE.ConeGeometry(0.13, 0.42, 5);
      geo.translate(0, 0.2, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
      const inst = new THREE.InstancedMesh(geo, mat, gpts.length * 2 || 1);
      const base = new THREE.Color(dry ? 0xb0a04e : 0x4f8a30);
      const vary = new THREE.Color();
      const m = new THREE.Matrix4();
      const e = new THREE.Euler();
      let k = 0;
      for (const [x, y, z] of gpts) {
        const cluster = 1 + (rng() < 0.5 ? 1 : 0);
        for (let cIdx = 0; cIdx < cluster && k < gpts.length * 2; cIdx++) {
          const s = 0.7 + rng() * 1.0;
          e.set((rng() - 0.5) * 0.35, rng() * Math.PI, (rng() - 0.5) * 0.35);
          m.makeRotationFromEuler(e);
          m.scale(new THREE.Vector3(s, s * (0.8 + rng() * 0.6), s));
          m.setPosition(x + (rng() - 0.5) * 0.5, y + 0.02, z + (rng() - 0.5) * 0.5);
          inst.setMatrixAt(k, m);
          vary.copy(base).offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.12);
          inst.setColorAt(k, vary);
          k++;
        }
      }
      inst.count = k;
      inst.receiveShadow = true;
      group.add(inst);
    }
  }

  // forest-floor mushrooms — Mazandaran only, tiny, no shadow
  if (biomeId === 'forest' && kitOn('mushroom')) {
    placeKit(group, place(24, 3), rng, NV.mushroom, (r) => 0.5 + r() * 0.5, { castShadow: false, frustumCulled: false });
  }
  // kit flower clumps — lush-meadow accents only (the red poppy field below stays procedural)
  if (biomeProps.grass && !biomeProps.dryGrass
      && ['valley', 'highland', 'river', 'wetland', 'plains'].includes(biomeId) && kitOn('flower')) {
    placeKit(group, place(12, 4), rng, NV.flower, (r) => 0.8 + r() * 0.4, { castShadow: false, frustumCulled: false });
  }
  // n2 flower clumps + a few flowering bushes — extra meadow color in green biomes
  if (biomeProps.grass && !biomeProps.dryGrass
      && ['valley', 'highland', 'river', 'wetland', 'plains'].includes(biomeId)) {
    if (propReady(NV.flowerClump2[0])) {
      placeKit(group, place(10, 4), rng, NV.flowerClump2, (r) => 0.7 + r() * 0.4, { castShadow: false, frustumCulled: false });
    }
    if (propReady(NV.bushFlower2[0])) {
      placeKit(group, place(5, 4), rng, NV.bushFlower2, (r) => 0.6 + r() * 0.5);
    }
  }

  // ---- story props borrowed from the world of the poem ----
  const mats = MATS();

  // pomegranate orchard — the fruit of Persian gardens (sharp red against green)
  if (['valley', 'plains', 'highland', 'river', 'wetland'].includes(biomeId)) {
    const pts = place(7, 5);
    const trunkM = [], folM = [], fruitM = [];
    for (const [x, y, z] of pts) {
      const s = 0.7 + rng() * 0.4;
      trunkM.push(m4(x, y, z, rng() * 6.28, s));
      folM.push(m4(x, y, z, rng() * 6.28, s));
      for (let f = 0; f < 7; f++) {
        const a = rng() * Math.PI * 2, rr = 0.5 + rng() * 0.55;
        fruitM.push(m4(x + Math.cos(a) * rr * s, y + (1.5 + rng() * 0.8) * s, z + Math.sin(a) * rr * s, 0, s));
      }
    }
    group.add(instanced(new THREE.CylinderGeometry(0.09, 0.16, 1.1, 7).translate(0, 0.55, 0), mats.woodDark, trunkM));
    group.add(instanced(new THREE.SphereGeometry(1.05, 11, 8).translate(0, 1.9, 0), colorMat(0x3e7032, 0.95), folM));
    group.add(instanced(new THREE.SphereGeometry(0.085, 7, 6), colorMat(0xc42a20, 0.55), fruitM));
  }

  // poppy field patches — Persian meadow color
  if (biomeProps.grass && !biomeProps.dryGrass) {
    const patches = place(7, 4);
    const stemM = [], headM = [];
    for (const [px, , pz] of patches) {
      for (let i = 0; i < 44; i++) {
        const x = px + (rng() - 0.5) * 7, z = pz + (rng() - 0.5) * 7;
        if (!isClear(x, z, 0.3)) continue;
        const y = heightAt(x, z);
        stemM.push(m4(x, y, z, 0, 0.8 + rng() * 0.5));
        headM.push(m4(x, y + 0.34 * (0.8 + rng() * 0.5), z, rng() * 6.28, 0.8 + rng() * 0.5));
      }
    }
    group.add(instanced(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 4).translate(0, 0.17, 0), colorMat(0x4a7a30, 0.95), stemM));
    group.add(instanced(new THREE.SphereGeometry(0.07, 7, 5), colorMat(0xd62828, 0.5), headM));
  }

  // carved standing stones — steles of remembered deeds
  if (['highland', 'steppe', 'mountain', 'desert', 'plains'].includes(biomeId)) {
    const pts = place(4, 7);
    for (const [x, y, z] of pts) {
      const b = new MeshBuilder();
      const h = 2.2 + rng() * 1.6;
      b.box(1.1, h, 0.45, 'stone', 0, h / 2, 0, rng() * 0.2 - 0.1);
      b.box(1.2, h * 0.42, 0.5, 'reliefGlow', 0, h * 0.55, 0);
      b.box(1.3, 0.25, 0.6, 'stoneDark', 0, h + 0.12, 0);
      const stele = b.build();
      stele.position.set(x, y, z);
      stele.rotation.y = rng() * Math.PI * 2;
      group.add(stele);
    }
  }

  // ruined column clusters — the old empires beneath the epic
  if (['desert', 'steppe', 'highland', 'plains', 'river'].includes(biomeId)) {
    const pts = place(3, 8);
    for (const [x, y, z] of pts) {
      const b = new MeshBuilder();
      const h1 = 1.6 + rng() * 2.2;
      b.cyl(0.28, 0.34, h1, 12, 'stoneWhite', 0, h1 / 2, 0, 0, rng() * 0.14);
      b.cyl(0.34, 0.4, 0.3, 12, 'stone', 0, 0.15, 0);
      const h2 = 0.8 + rng() * 1.2;
      b.cyl(0.26, 0.3, h2, 12, 'stoneWhite', 1.7, h2 / 2, 0.6, 0, -rng() * 0.2);
      // fallen drums
      b.cyl(0.28, 0.28, 0.9, 12, 'stoneWhite', -1.3, 0.3, 1.2, Math.PI / 2, rng());
      b.cyl(0.26, 0.26, 0.7, 12, 'stoneWhite', 0.4, 0.28, 2.1, Math.PI / 2, rng() * 2);
      const ruin = b.build();
      ruin.position.set(x, y, z);
      ruin.rotation.y = rng() * Math.PI * 2;
      group.add(ruin);
    }
  }

  // nomad camp — black tents, a campfire, a tethering post
  if (['steppe', 'desert', 'plains', 'highland'].includes(biomeId)) {
    const pts = place(1, 12);
    for (const [x, y, z] of pts) {
      const camp = new THREE.Group();
      camp.position.set(x, y, z);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rng();
        const tx = Math.cos(a) * 3.4, tz = Math.sin(a) * 3.4;
        const tent = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.5, 9), colorMat(0x2b2520, 0.95));
        tent.position.set(tx, 0.75, tz);
        camp.add(tent);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.06), colorMat(0x4a3c2e, 0.95));
        flap.position.set(tx + Math.cos(a) * 1.1, 0.4, tz + Math.sin(a) * 1.1);
        flap.rotation.y = -a;
        camp.add(flap);
      }
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 6), MATS().wood);
      post.position.set(1.2, 0.65, -1.4);
      camp.add(post);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 6, 12), MATS().stoneDark);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      camp.add(ring);
      const fire = makeFlame(1.0);
      fire.position.y = 0.25;
      camp.add(fire);
      camp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(camp);
      anim.flames.push(fire);
      anim.campfires.push(new THREE.Vector3(x, y + 0.6, z));
    }
  }

  // Nashtifan-style vertical windmills — Persian invention, sails turning in the wind
  if (['steppe', 'desert', 'plains', 'highland'].includes(biomeId)) {
    const pts = place(2, 10);
    for (const [x, y, z] of pts) {
      const mill = new THREE.Group();
      mill.position.set(x, y, z);
      const b = new MeshBuilder();
      b.box(1.4, 3.2, 2.6, 'mudbrick', -1.45, 1.6, 0);
      b.box(1.4, 3.2, 2.6, 'mudbrick', 1.45, 1.6, 0);
      b.box(4.3, 0.5, 2.8, 'mudbrick', 0, 3.45, 0);
      mill.add(b.build());
      const rotor = new THREE.Group();
      rotor.position.y = 2.1;
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 8), MATS().woodDark);
      rotor.add(axle);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.6), colorMat(0xc9b896, 0.9));
        sail.material.side = THREE.DoubleSide;
        sail.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
        sail.rotation.y = -a;
        rotor.add(sail);
      }
      mill.add(rotor);
      mill.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(mill);
      anim.windmills.push(rotor);
    }
  }

  anim.foliageSpots = foliageSpots;
  return anim;
}

// Spawn gate: dark arch where enemy waves enter
export function buildSpawnGate() {
  const b = new MeshBuilder();
  b.box(0.8, 3.2, 0.8, 'stoneDark', -1.6, 1.6, 0);
  b.box(0.8, 3.2, 0.8, 'stoneDark', 1.6, 1.6, 0);
  const arch = new THREE.TorusGeometry(1.6, 0.32, 8, 14, Math.PI);
  const m = new THREE.Matrix4();
  m.setPosition(0, 3.2, 0);
  b.add(arch, 'stoneDark', m);
  b.box(3.2, 0.4, 1.2, 'stone', 0, 0.2, 0);
  const g = b.build();
  // dark veil inside the arch
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.0), MATS().shadowVeil);
  veil.position.y = 1.6;
  g.add(veil);
  return g;
}

// Citadel: the defended heart — walled platform, central keep, banners, braziers.
export function buildCitadel() {
  const group = new THREE.Group();
  const b = new MeshBuilder();
  // platform + walls
  b.box(9, 1.2, 9, 'stoneDark', 0, 0.6, 0);
  b.box(8.2, 0.4, 8.2, 'stone', 0, 1.4, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 5.0, z = Math.sin(a) * 5.0;
    b.cyl(0.9, 1.05, 3.4, 8, 'stone', x, 1.7 + 1.7, z);
    b.cyl(1.1, 1.1, 0.4, 8, 'stoneDark', x, 5.2, z);
    for (let j = 0; j < 6; j++) {
      const aa = (j / 6) * Math.PI * 2;
      b.box(0.3, 0.35, 0.2, 'stone', x + Math.cos(aa) * 0.95, 5.6, z + Math.sin(aa) * 0.95, -aa);
    }
  }
  // central keep
  b.box(4.2, 3.2, 4.2, 'plaster', 0, 1.6 + 1.4, 0);
  b.box(4.6, 0.4, 4.6, 'stoneDark', 0, 4.6, 0);
  b.cyl(1.9, 2.1, 1.4, 10, 'stone', 0, 5.5, 0);
  // iwan entry
  b.box(2.0, 2.4, 0.4, 'plaster', 0, 2.6, 2.2);
  b.box(1.2, 1.8, 0.5, 'woodDark', 0, 2.3, 2.25);
  const arch = new THREE.TorusGeometry(0.62, 0.16, 6, 12, Math.PI);
  const m = new THREE.Matrix4(); m.setPosition(0, 3.2, 2.42);
  b.add(arch, 'turquoise', m);
  b.cyl(2.2, 2.2, 0.5, 12, 'reliefGlow', 0, 4.3, 0);
  const built = b.build();
  group.add(built);
  // turquoise dome + gold finial
  const b2 = new MeshBuilder();
  b2.sphere(2.1, 16, 12, 'turquoise', 0, 6.1, 0, 1.2, Math.PI * 2, Math.PI / 2);
  b2.cyl(0.06, 0.06, 1.1, 6, 'gold', 0, 8.9, 0);
  b2.sphere(0.16, 8, 6, 'gold', 0, 9.5, 0);
  group.add(b2.build());
  // banners + braziers (animated)
  const animated = { banners: [], flames: [] };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const banner = makeBanner(i % 2 ? 'clothTeal' : 'clothGold', 1.0, 1.6, 3.4);
    banner.position.set(Math.cos(a) * 5.0, 5.4, Math.sin(a) * 5.0);
    group.add(banner);
    animated.banners.push(banner);
  }
  for (const side of [-1, 1]) {
    const flame = makeFlame(1.2);
    flame.position.set(side * 1.6, 2.4, 2.8);
    group.add(flame);
    animated.flames.push(flame);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, animated };
}

// Tower pad: carved stone foundation players build on
export function buildPad() {
  const b = new MeshBuilder();
  b.box(3.4, 0.5, 3.4, 'stoneDark', 0, 0.25, 0);
  b.box(3.0, 0.22, 3.0, 'stone', 0, 0.58, 0);
  b.box(3.2, 0.1, 0.4, 'relief', 0, 0.62, 1.45);
  b.box(3.2, 0.1, 0.4, 'relief', 0, 0.62, -1.45);
  const g = b.build();
  return g;
}
