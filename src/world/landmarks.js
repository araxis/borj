// Signature Shahnameh story landmarks — one unmissable monument per stage, placed as a
// silhouette with a story rather than clutter. Data-driven: LANDMARK_PLANS maps
// mapDef.id → builders + placement rules; buildStoryLandmarks() resolves placement
// against the live map (roads, clearance, heights) with the map's deterministic rng.
import * as THREE from 'three';
import { MATS, MeshBuilder } from '../models/materials.js';
import { makeFlame } from '../models/towerkit.js';

// --- Zabulistan: Rostam's tiger-banner obelisk (the Babr-e Bayan standard of Sistan) ---
function tigerBannerObelisk() {
  const b = new MeshBuilder();
  b.box(3.4, 0.5, 3.4, 'stone', 0, 0.25, 0);
  b.box(2.6, 0.5, 2.6, 'stoneDark', 0, 0.75, 0);
  // tapered obelisk shaft
  b.cyl(0.85, 1.15, 7.2, 4, 'stone', 0, 4.6, 0);
  b.box(1.2, 0.3, 1.2, 'relief', 0, 8.3, 0);
  b.sphere(0.34, 8, 6, 'bronze', 0, 8.75, 0);
  const g = b.build();
  // twin tiger-stripe banners on bronze cross-arms (cloned mats — never mutate shared MATS)
  const cloth = MATS().clothGold.clone();
  cloth.side = THREE.DoubleSide;
  const stripe = MATS().woodDark.clone();
  stripe.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 5), MATS().bronze);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(side * 0.8, 7.9, 0);
    g.add(arm);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.6), cloth);
    banner.position.set(side * 1.35, 6.6, 0);
    g.add(banner);
    for (let s = 0; s < 4; s++) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.14), stripe);
      st.position.set(side * 1.35, 7.5 - s * 0.6, 0.012);
      g.add(st);
    }
  }
  return { g };
}

// --- Damavand: a colossal chain anchor — Zahhak's bindings sink into the mountain ---
function chainAnchor() {
  const b = new MeshBuilder();
  // rock boss the anchor is bolted into
  b.sphere(2.2, 7, 5, 'stoneDark', 0, 0.6, 0, 1.15);
  b.sphere(1.5, 7, 5, 'stone', 1.6, 0.4, 0.8, 1.1);
  b.sphere(1.2, 6, 5, 'stoneDark', -1.5, 0.35, -0.7, 1.05);
  const g = b.build();
  const iron = MATS().iron ?? MATS().steel ?? MATS().stoneDark;
  // the great ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.3, 8, 14), iron);
  ring.position.set(0, 2.2, 0);
  ring.rotation.x = 0.35;
  g.add(ring);
  // chain links climbing away toward the peak, each alternating orientation
  let px = 0.6, py = 3.4, pz = 0.4;
  for (let i = 0; i < 6; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.17, 7, 12), iron);
    link.position.set(px, py, pz);
    link.rotation.set(0.4 + (i % 2) * Math.PI / 2, 0.35, 0.55);
    g.add(link);
    px += 0.72; py += 1.05; pz += 0.5;
  }
  return { g };
}

// --- Arash's Watch: the frontier arrow — a giant shaft sunk in a carved plinth ---
function giantArrow() {
  const b = new MeshBuilder();
  b.box(4.4, 0.55, 4.4, 'stone', 0, 0.27, 0);
  b.box(3.2, 0.55, 3.2, 'stoneDark', 0, 0.82, 0);
  b.box(3.4, 0.12, 0.5, 'relief', 0, 1.05, 1.55);
  const g = b.build();
  // the arrow, tilted skyward toward the horizon it once crossed
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 11, 7), MATS().woodDark);
  shaft.position.y = 5.5;
  arrow.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.3, 6), MATS().gold);
  head.position.y = 11.4;
  arrow.add(head);
  for (const ry of [0, Math.PI / 2]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.5), MATS().clothRed);
    f.material = f.material.clone();
    f.material.side = THREE.DoubleSide;
    f.position.y = 1.1;
    f.rotation.y = ry;
    arrow.add(f);
  }
  arrow.rotation.z = -0.62; // launched stance, aimed over the rim
  arrow.position.y = 0.9;
  g.add(arrow);
  return { g };
}

// --- Siyavash's Trial Gate: the twin fire walls of the ordeal, flanking the road ---
function fireWall() {
  const b = new MeshBuilder();
  b.box(7.5, 1.1, 1.1, 'stoneDark', 0, 0.55, 0);
  b.box(7.8, 0.25, 1.3, 'stone', 0, 1.2, 0);
  const g = b.build();
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const fl = makeFlame(0.9);
    fl.position.set(-3 + i * 1.5, 1.35, 0);
    g.add(fl);
    flames.push(fl);
  }
  return { g, flames };
}

// --- Mazandaran: div bone-totems — horned warning stakes of the demon marches ---
function boneTotems() {
  const g = new THREE.Group();
  const bone = MATS().stoneWhite ?? MATS().stone;
  const wood = MATS().woodDark;
  for (let i = 0; i < 3; i++) {
    const stake = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.2 + i * 0.4, 5), wood);
    pole.position.y = 1.6;
    stake.add(pole);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), bone);
    skull.scale.set(1, 0.85, 1.1);
    skull.position.y = 3.2 + i * 0.4;
    stake.add(skull);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.85, 5), bone);
      horn.position.set(side * 0.38, 3.5 + i * 0.4, 0);
      horn.rotation.z = side * -0.9;
      stake.add(horn);
    }
    stake.position.set((i - 1) * 1.7, 0, (i % 2) * 1.4 - 0.7);
    stake.rotation.y = i * 1.9;
    stake.rotation.z = (i - 1) * 0.08; // uneasy lean
    g.add(stake);
  }
  return { g };
}

const LANDMARK_PLANS = {
  zabulistan: [{ build: tigerBannerObelisk, place: 'roadside', f: 0.34, off: 9 }],
  damavand: [{ build: chainAnchor, place: 'clear', band: [30, 55] }],
  'arash-watch': [{ build: giantArrow, place: 'clear', band: [26, 48] }],
  'siyavash-gate': [{ build: fireWall, place: 'flankRoad', f: 0.5, off: 7 }],
  mazandaran: [
    { build: boneTotems, place: 'clear', band: [26, 46] },
    { build: boneTotems, place: 'clear', band: [32, 55] },
  ],
};

export function buildStoryLandmarks(map, rng) {
  const plans = LANDMARK_PLANS[map.def?.id];
  if (!plans?.length) return null;
  const group = new THREE.Group();
  group.name = 'story-landmarks';
  const path = map.paths?.[0];
  // monuments must not spear through scattered foliage — _isClear doesn't track trees,
  // but the map exposes every cypress/tree/palm center as [x, z, keepout]
  const clearOfTrees = (x, z, r = 5) =>
    !(map._foliageSpots || []).some(([fx, fz, fr]) => Math.hypot(x - fx, z - fz) < r + (fr || 3));
  const placeAt = (obj, x, z, ry = 0) => {
    obj.position.set(x, map.heightAt(x, z), z);
    obj.rotation.y = ry;
    group.add(obj);
  };
  for (const plan of plans) {
    if (plan.place === 'roadside' && path) {
      const s = path.samples[Math.floor(path.samples.length * plan.f)];
      for (const side of rng() < 0.5 ? [1, -1] : [-1, 1]) {
        const x = s.pos.x - s.tangent.z * side * plan.off;
        const z = s.pos.z + s.tangent.x * side * plan.off;
        if (!map._isClear(x, z, 4) || !clearOfTrees(x, z, 4)) continue;
        const built = plan.build();
        placeAt(built.g, x, z, Math.atan2(s.pos.x - x, s.pos.z - z));
        if (built.flames) map.propFlames.push(...built.flames);
        break;
      }
    } else if (plan.place === 'flankRoad' && path) {
      const s = path.samples[Math.floor(path.samples.length * plan.f)];
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      for (const side of [-1, 1]) {
        const x = s.pos.x - s.tangent.z * side * plan.off;
        const z = s.pos.z + s.tangent.x * side * plan.off;
        const built = plan.build();
        placeAt(built.g, x, z, yaw); // walls run parallel to the road
        if (built.flames) map.propFlames.push(...built.flames);
      }
    } else {
      // 'clear': a clear spot in the radius band, biased away from the citadel
      let placed = false;
      for (let tries = 0; tries < 40 && !placed; tries++) {
        const a = rng() * Math.PI * 2;
        const r = plan.band[0] + rng() * (plan.band[1] - plan.band[0]);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!map._isClear(x, z, 5) || !clearOfTrees(x, z, 5)) continue;
        const built = plan.build();
        placeAt(built.g, x, z, rng() * Math.PI * 2);
        if (built.flames) map.propFlames.push(...built.flames);
        placed = true;
      }
    }
  }
  map.group.add(group);
  return group;
}
