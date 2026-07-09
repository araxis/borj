// Ambient world life — the land breathes: rivers with animated water and stone
// bridges, distant mountain ranges, drifting clouds, circling birds, gazelles that
// graze and flee, ground mist. Pure spectacle; never blocks gameplay.
import * as THREE from 'three';
import { MATS } from '../models/materials.js';
import { colorMat, buildHumanoid, animIdle, animWalk } from '../models/humanoid.js';
import { assetCharacter, buildQuad, animQuad } from '../models/creature.js';
import { spawnAsset, rotFix } from '../core/assets.js';
import { getProp, propReady, propBase, KIT_UNIT } from '../core/props3d.js';

// which animated wildlife roams each biome (Quaternius Animals pack, CC0).
// Cattle (cow/bull) are NOT here — a fleeing/galloping bovine reads wrong; they
// live in the slow livestock cluster instead. Alpaca/Shiba/Husky omitted for
// cultural fidelity (no authentic Shahnameh basis as roaming wildlife).
const WILDLIFE = {
  forest: ['a_fox', 'a_wolf', 'a_deer', 'a_stag'],
  valley: ['a_deer', 'a_stag', 'a_fox'],
  plains: ['a_deer', 'a_stag', 'a_horse_white'],
  steppe: ['a_horse', 'a_horse_white', 'a_stag', 'a_deer'],
  highland: ['a_stag', 'a_deer', 'a_wolf'],
  river: ['a_deer', 'a_stag'],
  wetland: ['a_deer'],
  mountain: ['a_stag', 'a_wolf'],
  desert: ['a_donkey', 'a_fox'], // Makran/Estakhr — caravan donkeys + desert fox
};
const WILD_HEIGHT = {
  a_fox: 0.55, a_wolf: 0.9, a_deer: 1.2, a_stag: 1.5,
  a_horse: 1.7, a_horse_white: 1.7, a_donkey: 1.3,
  a_cow: 1.5, a_bull: 1.6, a_husky: 0.7,
};
const TOWNSFOLK_HEIGHT = {
  tf_water_carrier: 1.72,
  tf_bread_seller: 1.7,
  tf_potter: 1.72,
  tf_porter: 1.78,
  tf_elder: 1.66,
  tf_woman_basket: 1.6,
  tf_shepherd: 1.74,
  tf_mobed: 1.74,
  tf_farmer: 1.74,
  tf_spice_seller: 1.72,
  tf_woman_dress: 1.62,
};
const COMMON_TOWNSFOLK = [
  ['tf_water_carrier', 2.2],
  ['tf_bread_seller', 2.0],
  ['tf_spice_seller', 1.4],
  ['tf_potter', 1.1],
  ['tf_porter', 1.1],
  ['tf_elder', 1.0],
  ['tf_shepherd', 0.9],
  ['tf_farmer', 0.9],
];
import { samplePath } from './road.js';
import { settings } from '../core/settings.js';

function weightedTownsperson(rng, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = rng() * total;
  for (const [key, weight] of entries) {
    pick -= weight;
    if (pick <= 0) return key;
  }
  return entries[entries.length - 1]?.[0] || 'tf_water_carrier';
}

function chooseTownspersonKey({ mobed, female, rng }) {
  if (mobed) return 'tf_mobed';
  if (female) return rng() < 0.55 ? 'tf_woman_basket' : 'tf_woman_dress';
  return weightedTownsperson(rng, COMMON_TOWNSFOLK);
}

function animateTownsperson(v, action, dt, timeScale = 1) {
  if (!v.anim) return false;
  const hasAction = (name) => !!v.anim.actions?.[name];
  const clip = action === 'run' && !hasAction('run') ? 'walk' : action;
  if (!hasAction(clip)) return false;
  v.anim.play(clip, { timeScale });
  v.anim.mixer.update(dt);
  return true;
}

function softBlobTexture(rgb = '255,255,255') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const x = 40 + Math.random() * 176, y = 40 + Math.random() * 48, r = 26 + Math.random() * 34;
    const grad = g.createRadialGradient(x, y, 4, x, y, r);
    grad.addColorStop(0, `rgba(${rgb},0.8)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
  }
  // Hard sprite edges read as rectangular fog cards from the tactical camera.
  // Mask every procedural cloud/mist texture down to zero alpha before upload.
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createRadialGradient(128, 64, 26, 128, 64, 126);
  edge.addColorStop(0, 'rgba(255,255,255,1)');
  edge.addColorStop(0.62, 'rgba(255,255,255,0.9)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 256, 128);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.premultiplyAlpha = true;
  return t;
}

function softSpriteMaterial({ map = null, color = 0xffffff, opacity = 0.35, blending = THREE.NormalBlending } = {}) {
  return new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    alphaTest: map ? 0.035 : 0,
    blending,
    toneMapped: false,
    fog: false,
  });
}

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2e6f86';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 220; i++) {
    const v = Math.random();
    g.strokeStyle = v > 0.6 ? 'rgba(180,220,230,0.30)' : 'rgba(30,80,100,0.35)';
    g.lineWidth = 1 + Math.random() * 2;
    const x = Math.random() * 128, y = Math.random() * 256;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y + 10, x + 4, y + 26); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- river planning (called by GameMap BEFORE terrain build) ----------
export function planRiver(biomeId, baseHeight, roadPaths, rng) {
  if (!['river', 'wetland', 'valley', 'forest'].includes(biomeId)) return null;
  // pick the lane (base z) farthest from the roads
  const roadZs = [];
  for (const p of roadPaths) for (let i = 0; i < p.samples.length; i += 6) roadZs.push(p.samples[i].pos);
  let best = null, bestScore = -1;
  for (const baseZ of [-48, -34, 0, 34, 48]) {
    let minD = Infinity;
    for (const rp of roadZs) minD = Math.min(minD, Math.abs(rp.z - baseZ));
    if (minD > bestScore) { bestScore = minD; best = baseZ; }
  }
  const pts = [];
  // span the round-2 expanded circular board (r≈112): the river must reach the fogged rim
  // on both sides or it reads as a truncated stub ending mid-meadow. Amplitude/jitter kept
  // gentle: bends tighter than the ribbon+bank width fold the strips over themselves.
  for (let x = -106; x <= 106; x += 14) {
    pts.push([x, best + Math.sin(x * 0.05 + rng() * 6) * 6.5 + (rng() - 0.5) * 3]);
  }
  const sampled = samplePath(pts, baseHeight, 1.2);
  return sampled;
}

export const RIVER_WIDTH = 4.6;

export function buildRiverMesh(river, group) {
  const { samples } = river;
  const half = RIVER_WIDTH / 2;
  // ribbon builder at a given width fraction + vertical drop
  const ribbon = (wFrac, dy, vScale = 7) => {
    const verts = [], uvs = [], idx = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
      const y = s.pos.y - 0.32 + dy;
      const w = half * wFrac;
      verts.push(s.pos.x + side.x * w, y, s.pos.z + side.z * w,
        s.pos.x - side.x * w, y, s.pos.z - side.z * w);
      const v = s.dist / vScale;
      uvs.push(0, v, 1, v);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  // Rivers 3.0 (round 3, L2): three living layers —
  // 1. the deep channel: a dark opaque bed ribbon that grades the middle deeper
  const deep = new THREE.Mesh(ribbon(0.62, -0.05), new THREE.MeshStandardMaterial({
    color: 0x14424e, roughness: 0.6, metalness: 0.05,
  }));
  deep.receiveShadow = false;
  group.add(deep);
  // 2. the water sheet (scrolled by the game loop)
  const mat = new THREE.MeshStandardMaterial({
    map: waterTexture(), transparent: true, opacity: 0.82,
    roughness: 0.18, metalness: 0.2, color: 0xbfe8ef,
  });
  const mesh = new THREE.Mesh(ribbon(1, 0), mat);
  mesh.receiveShadow = false;
  group.add(mesh);
  // 3. a tighter ripple sheet riding above at double repeat — scrolled by the same
  // loop, the doubled texture density reads as a faster current down the center
  const rippleTex = waterTexture();
  rippleTex.repeat.set(2, 2.6);
  const rippleMat = new THREE.MeshBasicMaterial({
    map: rippleTex, transparent: true, opacity: 0.22, depthWrite: false, color: 0xdff6fa,
  });
  const ripple = new THREE.Mesh(ribbon(0.72, 0.045, 4), rippleMat);
  ripple.renderOrder = 1;
  group.add(ripple);
  return [mat, rippleMat]; // caller scrolls every returned mat's map.offset for flow
}

// Round-2 sky-life: a proper bird — two-segment wings on pivots (inner + outer with a
// dihedral break) so flapping bends the wing instead of see-sawing a flat plank.
function makeBird(scale = 1, color = 0x2e2a26) {
  const mat = colorMat(color, 0.9);
  mat.side = THREE.DoubleSide;
  const g = new THREE.Group();
  const mkWing = (side) => {
    const pivotI = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), mat);
    inner.position.x = side * 0.21;
    const pivotO = new THREE.Group();
    pivotO.position.x = side * 0.42;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.19), mat);
    outer.position.x = side * 0.26;
    pivotO.add(outer);
    pivotI.add(inner, pivotO);
    g.add(pivotI);
    return { pivotI, pivotO, side };
  };
  const wl = mkWing(-1), wr = mkWing(1);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), mat);
  body.scale.set(1, 0.75, 2.0);
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.24), mat);
  tail.position.z = -0.24;
  tail.rotation.x = 0.3;
  g.add(body, tail);
  g.scale.setScalar(scale);
  return { g, wl, wr };
}

// flap with glide phases: birds beat their wings in bursts, then lock into a shallow
// V-glide — the alternation is what makes them read as alive rather than metronomes
function flapBird(bird, time, rate = 9) {
  const glide = Math.sin(time * 0.21 + (bird.phase || 0) * 1.7);
  const amp = 0.42 - 0.34 * Math.tanh((glide - 0.2) * 3.5); // ~0.76 flapping → ~0.1 gliding
  const f = Math.sin(time * rate + (bird.phase || 0) * 7) * amp + 0.14;
  bird.wl.pivotI.rotation.z = f;
  bird.wl.pivotO.rotation.z = f * 0.85;
  bird.wr.pivotI.rotation.z = -f;
  bird.wr.pivotO.rotation.z = -f * 0.85;
}

// a white wading crane for the river banks: thin legs, egg body, S-neck, dark crest
function makeCrane() {
  const white = colorMat(0xeceae2, 0.85);
  const dark = colorMat(0x3a3632, 0.9);
  const g = new THREE.Group();
  for (const lx of [-0.09, 0.09]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 4), dark);
    leg.position.set(lx, 0.28, 0);
    g.add(leg);
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), white);
  body.scale.set(0.85, 0.8, 1.35);
  body.position.y = 0.68;
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.78, 0.22);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 5), white);
  neck.position.y = 0.24;
  neck.rotation.x = 0.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), white);
  head.position.set(0, 0.5, 0.14);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.22, 4), dark);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.5, 0.3);
  neckPivot.add(neck, head, beak);
  const tailPlume = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), dark);
  tailPlume.rotation.x = -Math.PI / 2.4;
  tailPlume.position.set(0, 0.72, -0.32);
  g.add(body, neckPivot, tailPlume);
  return { g, neckPivot };
}

// Round 4 C4: a Bactrian caravan camel — tall legs, twin humps, an S-neck, a laden
// pannier. Legs animate from stored refs; the head bobs as it plods.
function makeCamel(rng = Math.random) {
  const coat = colorMat(0xbf9c66 + ((rng() * 0x101010) | 0) * 0, 0.95);
  const coatDk = colorMat(0x9a7a48, 0.95);
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.66, 1.5), coat);
  body.position.y = 1.35; body.scale.set(1, 1, 1);
  g.add(body);
  for (const hz of [-0.28, 0.32]) { // twin humps
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), coat);
    hump.position.set(0, 1.72, hz); hump.scale.set(0.85, 0.9, 0.8);
    g.add(hump);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.95, 6), coat);
  neck.position.set(0, 1.75, 0.85); neck.rotation.x = -0.7;
  g.add(neck);
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 2.15, 1.15);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.44), coat);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.2), coatDk);
  muzzle.position.set(0, -0.03, 0.3);
  headPivot.add(head, muzzle);
  g.add(headPivot);
  // laden panniers
  for (const sx of [-0.42, 0.42]) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.8), sx > 0 ? coatDk : colorMat(0x8a4a3a, 0.95));
    bag.position.set(sx, 1.2, 0);
    g.add(bag);
  }
  const legs = [];
  for (const lx of [-0.22, 0.22]) for (const lz of [-0.5, 0.55]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.35, 5), coatDk);
    leg.geometry.translate(0, -0.675, 0);
    leg.position.set(lx, 1.35, lz);
    g.add(leg); legs.push(leg);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(0.92);
  return { g, legs, headPivot };
}

// Round-2 rivers: foam edges, wet banks, stones and reeds. The foam strips are the
// strongest "this water FLOWS" cue — thin scrolling white streaks hugging both shores;
// the wet strip darkens the bank so the water sits IN the land instead of on it.
function foamTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 90; i++) {
    const a = 0.16 + Math.random() * 0.4;
    g.fillStyle = `rgba(235,248,250,${a})`;
    const x = Math.random() * 64, y = Math.random() * 256;
    const len = 6 + Math.random() * 22;
    g.fillRect(x, y, 1.2 + Math.random() * 1.8, len);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// builds one side-offset ribbon along the river samples; yFn(sample, outerX, outerZ, side) -> [yIn, yOut]
function riverRibbon(samples, offIn, offOut, yFn, side) {
  const verts = [], uvs = [], idx = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const sx = -s.tangent.z * side, sz = s.tangent.x * side;
    const n = Math.hypot(sx, sz) || 1;
    const nx = sx / n, nz = sz / n;
    const xi = s.pos.x + nx * offIn, zi = s.pos.z + nz * offIn;
    const xo = s.pos.x + nx * offOut, zo = s.pos.z + nz * offOut;
    const [yi, yo] = yFn(s, xo, zo);
    verts.push(xi, yi, zi, xo, yo, zo);
    const v = s.dist / 6;
    uvs.push(0, v, 1, v);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function buildRiverDressing(river, group, heightAt, { reeds = true, rng = Math.random } = {}) {
  const { samples } = river;
  const half = RIVER_WIDTH / 2;
  const scrollMats = [];
  for (const side of [-1, 1]) {
    // scrolling foam hugging the shoreline
    const foamGeo = riverRibbon(samples, half - 0.38, half + 0.24, (s) => [s.pos.y - 0.30, s.pos.y - 0.26], side);
    const foamMat = new THREE.MeshBasicMaterial({
      map: foamTexture(), transparent: true, opacity: 0.6, depthWrite: false, color: 0xeaf6f8,
    });
    const foam = new THREE.Mesh(foamGeo, foamMat);
    foam.renderOrder = 2;
    group.add(foam);
    scrollMats.push(foamMat);
    // wet darkened bank following the carved slope up to dry land
    const wetGeo = riverRibbon(samples, half + 0.16, half + 1.4,
      (s, xo, zo) => [s.pos.y - 0.24, (heightAt ? heightAt(xo, zo) : s.pos.y) + 0.05], side);
    const wetMat = new THREE.MeshStandardMaterial({
      color: 0x453e2e, transparent: true, opacity: 0.5, depthWrite: false, roughness: 1,
    });
    const wet = new THREE.Mesh(wetGeo, wetMat);
    wet.renderOrder = 1;
    group.add(wet);
  }
  // bank stones + reed tufts, alternating sides, skipping nothing fancy — sparse and cheap
  const stoneM = [], reedM = [];
  const m4b = (x, y, z, ry, s) => new THREE.Matrix4().makeRotationY(ry).scale(new THREE.Vector3(s, s, s)).setPosition(x, y, z);
  for (let i = 3; i < samples.length - 3; i += 4) {
    const s = samples[i];
    const side = (i % 8 < 4) ? 1 : -1;
    const nx = -s.tangent.z * side, nz = s.tangent.x * side;
    const off = half + 0.9 + rng() * 1.3;
    const x = s.pos.x + nx * off, z = s.pos.z + nz * off;
    const y = heightAt ? heightAt(x, z) : s.pos.y;
    if (rng() < 0.55) stoneM.push(m4b(x, y - 0.12, z, rng() * 6.28, 0.5 + rng() * 0.9));
    else if (reeds) for (let k = 0; k < 3; k++) reedM.push(m4b(x + (rng() - 0.5) * 0.8, y, z + (rng() - 0.5) * 0.8, rng() * 6.28, 0.8 + rng() * 0.7));
  }
  const inst = (geo, mat, mats4) => {
    const im = new THREE.InstancedMesh(geo, mat, mats4.length);
    mats4.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = true;
    return im;
  };
  if (stoneM.length) group.add(inst(new THREE.DodecahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: 0x8b8474, roughness: 0.95 }), stoneM));
  if (reedM.length) group.add(inst(new THREE.ConeGeometry(0.055, 1.35, 5).translate(0, 0.62, 0), new THREE.MeshStandardMaterial({ color: 0x6d7c3f, roughness: 0.9 }), reedM));
  return scrollMats; // caller scrolls map.offset for flow, same as the water sheet
}

// stone bridge where a road crosses the river
export function buildBridge(group, pos, tangent, heightAt) {
  const mats = MATS();
  const g = new THREE.Group();
  const ry = Math.atan2(tangent.x, tangent.z);
  g.position.set(pos.x, pos.y, pos.z);
  g.rotation.y = ry;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 8.6), mats.stone);
  deck.position.y = 0.45;
  g.add(deck);
  // gentle arch belly
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 5.0, 18, 1, true, 0, Math.PI), mats.stoneDark);
  arch.rotation.z = Math.PI / 2;
  arch.rotation.y = Math.PI / 2;
  arch.position.y = 1.3;
  arch.scale.y = 0.55;
  g.add(arch);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 8.6), mats.stoneWhite);
    rail.position.set(side * 2.55, 0.95, 0);
    g.add(rail);
    for (const ez of [-3.9, 3.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.4, 8), mats.stoneDark);
      post.position.set(side * 2.55, 1.1, ez);
      g.add(post);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mats.gold);
      orb.position.set(side * 2.55, 1.9, ez);
      g.add(orb);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(g);
}

// ---------- distant mountain ranges ----------
export function buildDistantPeaks(group, biome, rng) {
  const snowy = !!biome.props.snow || biome.hills > 5;
  // hazy atmospheric tint so ranges read as distance, never as black silhouettes
  const haze = new THREE.Color(biome.mood?.fogColor ?? 0xb3c4d8);
  const rockTint = new THREE.Color(0x6e7480).lerp(haze, 0.45);
  const peakMat = new THREE.MeshStandardMaterial({ color: rockTint, roughness: 1 });
  const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xf0f4f8).lerp(haze, 0.2), roughness: 0.9 });
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3;
    const r = 96 + rng() * 22;
    const h = 16 + rng() * 26;
    const w = 12 + rng() * 14;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(w, h, 8 + Math.floor(rng() * 3)), peakMat);
    peak.position.set(Math.cos(a) * r, h * 0.32, Math.sin(a) * r);
    peak.rotation.y = rng() * Math.PI;
    group.add(peak);
    if (snowy || h > 30) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.42, h * 0.34, 8), capMat);
      cap.position.set(peak.position.x, h * 0.32 + h * 0.34, peak.position.z);
      group.add(cap);
    }
  }
}

// A vast surrounding landscape so the playable board never reads as a slab floating in the sky:
// a square ground apron that sinks out of sight UNDER the board, then beyond the board edge rises
// into distant hills/mountains and recedes toward the fog horizon, hazed toward the fog colour so
// it melts seamlessly into the skydome. One static mesh per map, biome-coloured.
export function buildWorldApron(group, biome, heightAt, opts = {}) {
  const fog = new THREE.Color(biome.mood?.fogColor ?? 0xb3c4d8);
  const ground = new THREE.Color(opts.apronGroundColor ?? biome.ground?.[1] ?? biome.ground?.[0] ?? 0x6f8050)
    .lerp(fog, opts.apronGroundFogMix ?? 0.12);
  const near = new THREE.Color(opts.apronNearColor ?? biome.rock ?? 0x6e7480)
    .lerp(fog, opts.apronNearFogMix ?? 0.32);
  const far = new THREE.Color(opts.apronFarColor ?? biome.high ?? 0x9aa3ad)
    .lerp(fog, opts.apronFarFogMix ?? 0.5);
  const circular = opts.shape === 'circle';
  const SIZE = 680;
  const BOARD = opts.boardRadius ?? 75;
  const FARV = opts.farRadius ?? 300;
  const fogStart = opts.apronFogStart ?? 0.08;
  const fogEnd = opts.apronFogEnd ?? 0.88;
  const fogMax = opts.apronFogMax ?? 0.92;
  const fogLinear = opts.apronFogLinear ?? 0.18;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 100, 100);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const edge = circular ? Math.hypot(x, z) : Math.max(Math.abs(x), Math.abs(z));
    const t = Math.max(0, Math.min(1, (edge - BOARD) / (FARV - BOARD))); // 0 at board edge → 1 at horizon
    const noise = Math.sin(x * 0.07 + z * 0.041) + Math.sin(x * 0.026 - z * 0.083) * 0.7 + Math.cos(x * 0.12 + z * 0.017) * 0.5;
    let h;
    if (edge < BOARD) h = (heightAt ? heightAt(x, z) : 0) - 1.0; // mirror the board surface just below it — no moat, no drop
    else h = (noise + 0.2) * 1.6;                                // flat ground level with the board edge — no hills
    pos.setY(i, h);
    const fogLift = Math.min(1, smoothstepLike(t, fogStart, fogEnd) * fogMax + t * fogLinear);
    c.copy(ground).lerp(near, Math.min(1, t * 2.1)).lerp(far, Math.max(0, t - 0.42) * 1.15).lerp(fog, fogLift);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // Keep the apron opaque. Transparent depth-off ground sorted against the board/backdrop as
  // camera-sized dark rectangles on some angles; fog-colored vertex bands give the same dissolve.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -4;
  group.add(mesh);
  if (circular && opts.edgeBlend !== false) buildBoardEdgeBlend(group, biome, heightAt, opts);
  buildGroundHorizonVeil(group, biome, opts);
}

function smoothstepLike(value, edge0, edge1) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const EDGE_BLEND_VERT = `
  attribute vec3 color;
  attribute float edgeAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    vColor = color;
    vAlpha = edgeAlpha;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const EDGE_BLEND_FRAG = `
  uniform float opacity;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    float ripple = 0.92 + 0.08 * sin(vUv.x * 64.0 + sin(vUv.y * 18.0) * 1.4);
    gl_FragColor = vec4(vColor, vAlpha * ripple * opacity);
  }`;

function apronHeight(x, z) {
  const noise = Math.sin(x * 0.07 + z * 0.041)
    + Math.sin(x * 0.026 - z * 0.083) * 0.7
    + Math.cos(x * 0.12 + z * 0.017) * 0.5;
  return (noise + 0.2) * 1.6 - 1;
}

function buildBoardEdgeBlend(group, biome, heightAt, opts = {}) {
  const board = opts.boardRadius ?? 86;
  const inner = opts.edgeBlendInnerRadius ?? board - 12;
  const outer = opts.edgeBlendOuterRadius ?? board + 34;
  const segments = opts.edgeBlendSegments ?? 256;
  const rings = opts.edgeBlendRings ?? 12;
  const positions = [];
  const uvs = [];
  const colors = [];
  const alphas = [];
  const indices = [];
  const groundA = new THREE.Color(opts.edgeBlendGroundColor ?? biome.ground?.[0] ?? 0x7cab4c);
  const groundB = new THREE.Color(opts.edgeBlendMidColor ?? biome.ground?.[1] ?? biome.ground?.[0] ?? 0x93b95a);
  const outerBase = new THREE.Color(opts.edgeBlendOuterColor ?? opts.edgeBlendMidColor ?? biome.ground?.[1] ?? biome.ground?.[0] ?? 0x93b95a);
  const fog = new THREE.Color(biome.mood?.fogColor ?? 0xb3c4d8);
  const outerTint = outerBase.clone().lerp(fog, opts.edgeBlendFogMix ?? 0.18);
  const fogStart = opts.edgeBlendFogStart ?? 0.42;
  const fogEnd = opts.edgeBlendFogEnd ?? 1.0;
  const groundMix = opts.edgeBlendGroundMix ?? 0.62;
  const groundMixRange = opts.edgeBlendGroundMixRange ?? 0.18;
  const c = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const radius = inner + (outer - inner) * t;
    const fade = smoothstepLike(t, 0.0, 0.18) * (1 - smoothstepLike(t, 0.82, 1.0));
    for (let s = 0; s < segments; s++) {
      const u = s / segments;
      const a = u * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const apronT = smoothstepLike((radius - board) / Math.max(1, outer - board), 0, 1);
      const terrainY = (heightAt ? heightAt(x, z) : 0) + 0.035;
      const lowY = apronHeight(x, z) + 0.12;
      const y = terrainY * (1 - apronT) + lowY * apronT;
      positions.push(x, y, z);
      uvs.push(u, t);
      const mottled = 0.97 + 0.04 * Math.sin(u * Math.PI * 18 + t * 7.0) + 0.02 * Math.sin(u * Math.PI * 43);
      c.copy(groundA)
        .lerp(groundB, Math.min(1, groundMix + t * groundMixRange))
        .lerp(outerTint, smoothstepLike(t, fogStart, fogEnd));
      c.multiplyScalar(mottled);
      colors.push(c.r, c.g, c.b);
      alphas.push(fade);
    }
  }
  for (let r = 0; r < rings; r++) {
    const row = r * segments;
    const nextRow = (r + 1) * segments;
    for (let s = 0; s < segments; s++) {
      const n = (s + 1) % segments;
      const a = row + s;
      const b = row + n;
      const cidx = nextRow + s;
      const d = nextRow + n;
      indices.push(a, cidx, b, b, cidx, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('edgeAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    name: 'board-edge-blend',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      opacity: { value: opts.edgeBlendOpacity ?? 0.42 },
    },
    vertexShader: EDGE_BLEND_VERT,
    fragmentShader: EDGE_BLEND_FRAG,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.name = 'board-edge-blend';
  ring.castShadow = false;
  ring.receiveShadow = false;
  ring.renderOrder = opts.edgeBlendRenderOrder ?? -3.82;
  ring.userData.visualLayer = 'backdrop';
  group.add(ring);
}

const GROUND_VEIL_VERT = `
  varying float vR;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vR = length(position.xz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const GROUND_VEIL_FRAG = `
  uniform vec3 fogTint;
  uniform vec3 groundTint;
  uniform float opacity;
  uniform float innerRadius;
  uniform float outerRadius;
  varying float vR;
  varying vec2 vUv;
  void main() {
    float t = clamp((vR - innerRadius) / max(1.0, outerRadius - innerRadius), 0.0, 1.0);
    float fadeIn = smoothstep(0.0, 0.24, t);
    float fadeOut = 1.0 - smoothstep(0.82, 1.0, t);
    float ripple = 0.84 + 0.16 * sin(vUv.x * 58.0 + sin(vUv.y * 21.0) * 0.7);
    vec3 rgb = mix(groundTint, fogTint, smoothstep(0.12, 0.9, t));
    gl_FragColor = vec4(rgb, fadeIn * fadeOut * ripple * opacity);
  }`;

function buildGroundHorizonVeil(group, biome, opts = {}) {
  const circular = opts.shape === 'circle';
  const inner = opts.veilInnerRadius ?? (circular ? (opts.boardRadius ?? 86) : 78);
  const outer = opts.veilOuterRadius ?? (circular ? 258 : 268);
  const fog = new THREE.Color(biome.mood?.fogColor ?? 0xb3c4d8);
  const ground = new THREE.Color(opts.veilGroundColor ?? biome.ground?.[1] ?? biome.ground?.[0] ?? 0x8aae52)
    .lerp(fog, opts.veilGroundFogMix ?? 0.34);
  const geo = new THREE.RingGeometry(inner, outer, 192, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    name: 'ground-horizon-veil',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    uniforms: {
      fogTint: { value: fog },
      groundTint: { value: ground },
      opacity: { value: opts.veilOpacity ?? (circular ? 0.22 : 0.2) },
      innerRadius: { value: inner },
      outerRadius: { value: outer },
    },
    vertexShader: GROUND_VEIL_VERT,
    fragmentShader: GROUND_VEIL_FRAG,
  });
  const veil = new THREE.Mesh(geo, mat);
  veil.name = 'ground-horizon-veil';
  veil.position.y = 1.35;
  veil.castShadow = false;
  veil.receiveShadow = false;
  veil.renderOrder = -3.85;
  veil.userData.visualLayer = 'backdrop';
  group.add(veil);
}

// ---------- ambient life system ----------
// ---- villager accessories: Persian commoner head coverings + carried market goods ----
const SCARF_COL = [0x9a3b3b, 0x39568a, 0x6a4a7a, 0x7a6a2a, 0x8a4a2a];
const WRAP_COL = [0xe8e2d2, 0xd8c8a8, 0xc8b890, 0x8a7048, 0x6a6258];

function makeHeadwear(rng, female, white = false) {
  const g = new THREE.Group();
  if (white) {
    // mobed's white priest turban — full wraps, no color variance
    const m = colorMat(0xf0ead8, 0.97);
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.155 - i * 0.012, 0.05, 6, 14), m);
      t.rotation.x = Math.PI / 2; t.rotation.z = rng() * 0.6;
      t.position.y = 0.19 + i * 0.045;
      g.add(t);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), m);
    top.position.y = 0.33; g.add(top);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  if (female) {
    // draped headscarf — hood over the crown + a short fall down the back
    const m = colorMat(SCARF_COL[(rng() * SCARF_COL.length) | 0], 0.96);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.185, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), m);
    hood.position.y = 0.13; hood.scale.set(1.08, 1.15, 1.12);
    g.add(hood);
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.34, 10, 1, true), m);
    drape.material.side = THREE.DoubleSide;
    drape.position.set(0, -0.03, -0.05); drape.scale.set(1, 1, 0.7);
    g.add(drape);
  } else if (rng() < 0.55) {
    // turban — stacked wraps + a small crown
    const m = colorMat(WRAP_COL[(rng() * WRAP_COL.length) | 0], 0.95);
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.155 - i * 0.012, 0.05, 6, 14), m);
      t.rotation.x = Math.PI / 2; t.rotation.z = rng() * 0.6;
      t.position.y = 0.19 + i * 0.045;
      g.add(t);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), m);
    top.position.y = 0.33; g.add(top);
  } else {
    // felt skullcap (brimless dome)
    const m = colorMat(WRAP_COL[(rng() * WRAP_COL.length) | 0], 0.9);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62), m);
    cap.position.y = 0.16; cap.scale.set(1, 0.95, 1);
    g.add(cap);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeCarry(rng) {
  if (rng() < 0.5) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.13, 12), colorMat(0x9a7038, 0.92));
    b.castShadow = true;
    return b; // woven basket
  }
  const g = new THREE.Group(); // clay jug
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), colorMat(0xa9663a, 0.86));
  body.scale.set(1, 1.15, 1); g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.07, 8), colorMat(0xa9663a, 0.86));
  neck.position.y = 0.1; g.add(neck);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Ambient {
  constructor(scene, map, rng) {
    this.map = map;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.clouds = [];
    this.birds = [];
    this.mist = [];
    this.animals = [];
    this._threatT = 0;
    const biomeId = map.place?.biome || 'plains';
    const mats = MATS();

    // drifting clouds (sprites always face camera)
    const cloudTex = softBlobTexture('255,255,255');
    const nClouds = 8;
    for (let i = 0; i < nClouds; i++) {
      const sp = new THREE.Sprite(softSpriteMaterial({ map: cloudTex, opacity: 0.24 }));
      sp.scale.set(26 + rng() * 22, 11 + rng() * 8, 1);
      sp.position.set((rng() - 0.5) * 180, 40 + rng() * 14, (rng() - 0.5) * 180);
      sp.renderOrder = -2;
      this.group.add(sp);
      this.clouds.push({ sp, vx: 0.6 + rng() * 0.7 });
    }

    // ground mist for moody lands
    if (['forest', 'snowpeak', 'wetland', 'mountain'].includes(biomeId)) {
      const mistTex = softBlobTexture(biomeId === 'forest' ? '190,220,200' : '225,235,245');
      const nMist = biomeId === 'forest' ? 20 : 10; // Mazandaran is the fog-haunted land — thicker ground mist
      for (let i = 0; i < nMist; i++) {
        const sp = new THREE.Sprite(softSpriteMaterial({ map: mistTex, opacity: biomeId === 'forest' ? 0.14 : 0.1 }));
        sp.scale.set(13 + rng() * 10, 3.2 + rng() * 2.4, 1);
        const x = (rng() - 0.5) * 120, z = (rng() - 0.5) * 120;
        sp.position.set(x, map.heightAt(x, z) + 1.6, z);
        sp.renderOrder = -1;
        this.group.add(sp);
        this.mist.push({ sp, vx: 0.3 + rng() * 0.4 });
      }
    }

    // circling birds above the citadel — 2-segment wings with flap/glide phases
    const birdColor = biomeId === 'snowpeak' ? 0xe8eef2 : 0x2e2a26;
    const nBirds = 4;
    for (let i = 0; i < nBirds; i++) {
      const bird = makeBird(1, birdColor);
      this.group.add(bird.g);
      this.birds.push({
        ...bird,
        phase: rng() * Math.PI * 2,
        r: 7 + rng() * 8,
        h: (map.citadel?.height || 10) + 5 + rng() * 6,
        speed: 0.25 + rng() * 0.2,
      });
    }

    // crossing flock: a V-formation sweeps the whole expanded board every so often
    this.flock = { birds: [], t: 8 + rng() * 14, active: false, dir: new THREE.Vector3(), pos: new THREE.Vector3(), speed: 9 };
    for (let i = 0; i < 7; i++) {
      const b = makeBird(0.85, birdColor);
      b.g.visible = false;
      this.group.add(b.g);
      // V offsets: leader at 0, wings staggered back-and-out
      const row = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? -1 : 1);
      this.flock.birds.push({ ...b, off: new THREE.Vector3(side * row * 1.7, (rng() - 0.5) * 0.8, -row * 2.1), phase: rng() * 6.28 });
    }

    // river cranes: white waders standing at the banks; they flee when enemies come near
    this.cranes = [];
    if (map.river) {
      const S = map.river.samples;
      for (const f of [0.22, 0.52, 0.8]) {
        const s = S[Math.floor(S.length * f)];
        if (!s) continue;
        const side = f > 0.5 ? 1 : -1;
        const nx = -s.tangent.z * side, nz = s.tangent.x * side;
        const x = s.pos.x + nx * (RIVER_WIDTH / 2 + 1.1), z = s.pos.z + nz * (RIVER_WIDTH / 2 + 1.1);
        const crane = makeCrane();
        crane.g.position.set(x, map.heightAt(x, z), z);
        crane.g.rotation.y = rng() * 6.28;
        this.group.add(crane.g);
        this.cranes.push({ ...crane, state: 'idle', seed: rng() * 10, home: new THREE.Vector3(x, map.heightAt(x, z), z) });
      }
    }

    // carrion crows clustered near the first spawn gate — battle-aftermath tension.
    // They peck at the scorched ground, burst skyward when a wave marches past, and
    // drift back once the road is quiet again.
    this.crows = [];
    const cgate = map.gates?.[0];
    if (cgate) {
      const a0 = rng() * 6.28318, rr0 = 5 + rng() * 4;
      const ccx = cgate.position.x + Math.cos(a0) * rr0, ccz = cgate.position.z + Math.sin(a0) * rr0;
      for (let i = 0; i < 5; i++) {
        const crow = makeBird(0.55, 0x151312);
        const x = ccx + (rng() - 0.5) * 3.2, z = ccz + (rng() - 0.5) * 3.2;
        crow.g.position.set(x, map.heightAt(x, z) + 0.1, z);
        crow.g.rotation.y = rng() * 6.28318;
        // wings tucked while grounded
        crow.wl.pivotI.rotation.z = 1.05; crow.wl.pivotO.rotation.z = -2.0;
        crow.wr.pivotI.rotation.z = -1.05; crow.wr.pivotO.rotation.z = 2.0;
        this.group.add(crow.g);
        this.crows.push({ ...crow, state: 'ground', seed: rng() * 10, home: crow.g.position.clone(), t: 0, phase: rng() * 6.28 });
      }
    }

    // the Simurgh: a rare, huge, distant silhouette crossing high over the mountain lands
    this.simurgh = null;
    if (['mountain', 'snowpeak'].includes(biomeId) || map.def?.id === 'alborz') {
      const b = makeBird(6.5, 0x43324e);
      // long gold-tinged tail streamers — the Simurgh's signature
      const streamMat = colorMat(0xb98a4e, 0.85);
      streamMat.side = THREE.DoubleSide;
      const streamers = [];
      for (const sx of [-0.12, 0.12]) {
        const st = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 2.6, 1, 6), streamMat);
        st.position.set(sx, 0, -1.5);
        st.rotation.x = Math.PI / 2;
        b.g.add(st);
        streamers.push(st);
      }
      b.g.visible = false;
      this.group.add(b.g);
      this.simurgh = { ...b, streamers, t: 45 + rng() * 60, active: false, dir: new THREE.Vector3(), pos: new THREE.Vector3() };
    }

    // Round 4 C4: a trade caravan crosses the board to the town and back on the silk road
    this.caravan = null;
    if (['desert', 'steppe', 'plains', 'valley', 'river'].includes(biomeId) && map.def?.id !== 'zabulistan') {
      const camels = [];
      const n = 3 + ((rng() * 3) | 0);
      for (let i = 0; i < n; i++) {
        // laden Bactrian GLB (rigged amble walk + idle); procedural boxes stay the fallback
        const glb = assetCharacter('a_camel', { height: 2.0 });
        const c = glb ? { g: glb.group, anim: glb.anim, legs: null, headPivot: null, ts: 0.95 + rng() * 0.2 } : makeCamel(rng);
        c.g.visible = false; this.group.add(c.g); camels.push(c);
      }
      // cross perpendicular to the incoming road so the train never walks the battle lane
      const path0 = map.paths?.[0];
      const inS = path0 ? (path0.samples[path0.samples.length - 8] || path0.samples[0]) : null;
      const roadAng = inS ? Math.atan2(inS.pos.x - map.exitPos.x, inS.pos.z - map.exitPos.z) : rng() * 6.28318;
      const a = roadAng + Math.PI / 2 + (rng() - 0.5) * 0.5;
      const dir = { x: Math.sin(a), z: Math.cos(a) };
      const edge = { x: dir.x * 112, z: dir.z * 112 };   // beyond the visible board
      const dest = { x: dir.x * 30, z: dir.z * 30 };       // a market halt near the town
      this.caravan = { camels, state: 'away', t: 8 + rng() * 12, dir, edge, dest, s: 0, gap: 3.0, speed: 3.0 };
    }

    // Round 4 D2: a flock of town pigeons roosting on a rooftop — they peck and strut,
    // burst into a wheeling flight now and then (or when a wave marches past), then resettle
    this.pigeons = null;
    if (map.chimneys && map.chimneys.length) {
      const roost = map.chimneys[(rng() * map.chimneys.length) | 0];
      const center = new THREE.Vector3(roost[0], roost[1] - 0.3, roost[2]);
      const birds = [];
      for (let i = 0; i < 7; i++) {
        const b = makeBird(0.4, i % 3 === 0 ? 0xe8e4dc : 0x9a96a0);
        const home = center.clone().add(new THREE.Vector3((rng() - 0.5) * 2.4, 0, (rng() - 0.5) * 2.4));
        b.g.position.copy(home);
        // folded wings while perched
        b.wl.pivotI.rotation.z = 1.0; b.wl.pivotO.rotation.z = -1.9;
        b.wr.pivotI.rotation.z = -1.0; b.wr.pivotO.rotation.z = 1.9;
        this.group.add(b.g);
        // GLB pecking pigeon while roosted (ground clips only — no fly clip exists), the
        // procedural wing bird still flies the wheeling burst; visibility-swapped on scare
        const glb = assetCharacter(i % 3 === 0 ? 'a_pigeon_white' : 'a_pigeon', { height: 0.24 });
        if (glb) {
          glb.group.position.copy(home);
          glb.group.rotation.y = rng() * 6.28318;
          glb.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
          this.group.add(glb.group);
          b.g.visible = false;
        }
        birds.push({ ...b, glb: glb || null, home, seed: rng() * 10, phase: rng() * 6.28 });
      }
      this.pigeons = { birds, center, state: 'roost', t: 8 + rng() * 12, flyT: 0 };
    }

    // fireflies (moody lands) / butterflies (bright lands) — wandering points of color
    this.flutterers = [];
    {
      const glow = ['forest', 'wetland', 'river'].includes(biomeId);
      // forest = div-haunted: more motes + an eerie gold/fae-cyan mix; each gets its OWN material so
      // they pulse independently (a shared material would make them blink in unison).
      const colors = !glow ? [0xfff4f4, 0xffb347, 0xff6b6b]
        : biomeId === 'forest' ? [0xffe066, 0xffe066, 0x7fe6c0, 0x9fd8ff]
          : [0xffe066];
      const n = (glow && biomeId === 'forest') ? 28 : 12;
      for (let i = 0; i < n; i++) {
        const mat = softSpriteMaterial({
          color: colors[(rng() * colors.length) | 0],
          opacity: glow ? 0.9 : 0.85,
          blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        const sp = new THREE.Sprite(mat);
        sp.scale.setScalar(glow ? 0.13 + rng() * 0.12 : 0.22);
        const x = (rng() - 0.5) * 110, z = (rng() - 0.5) * 110;
        sp.position.set(x, map.heightAt(x, z) + 0.7 + rng() * 1.8, z);
        this.group.add(sp);
        this.flutterers.push({ sp, seed: rng() * 100, glow });
      }
    }

    // sheep flock with a drifting herd center
    this.sheep = [];
    this.livestock = []; // cattle + guard dog (animated GLTF), share the flock ground
    if (['plains', 'steppe', 'highland', 'valley'].includes(biomeId)) {
      let hx = 0, hz = 0, tries = 30;
      while (tries-- > 0) {
        hx = (rng() - 0.5) * 100; hz = (rng() - 0.5) * 100;
        if (!map._nearRoad(hx, hz, 10)) break;
      }
      this.herd = new THREE.Vector3(hx, 0, hz);
      this.herdDir = rng() * Math.PI * 2;
      buildPastureFence(this, map, hx, hz, rng); // open paddock around the flock (gated)
      const wool = colorMat(0xe8e2d2, 1);
      const dark = colorMat(0x2b2722, 0.9);
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 9, 7), wool);
        body.scale.set(1, 0.85, 1.3);
        body.position.y = 0.48;
        body.castShadow = true;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), dark);
        head.position.set(0, 0.5, 0.46);
        head.scale.set(0.9, 0.9, 1.2);
        for (const [lx, lz] of [[-0.15, 0.18], [0.15, 0.18], [-0.15, -0.18], [0.15, -0.18]]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.3, 5), dark);
          leg.position.set(lx, 0.15, lz);
          s.add(leg);
        }
        s.add(body, head);
        const a = rng() * Math.PI * 2, r = 1 + rng() * 3;
        s.position.set(hx + Math.cos(a) * r, map.heightAt(hx, hz), hz + Math.sin(a) * r);
        this.group.add(s);
        this.sheep.push({ g: s, phase: rng() * 6 });
      }
      // pastoral livestock + one shepherd dog grazing with the flock (never flee)
      for (const [key, count, tint] of [['a_cow', 2, null], ['a_bull', 1, null], ['a_husky', 1, 0x9a8c72]]) {
        for (let i = 0; i < count; i++) {
          const inst = spawnAsset(key, { height: WILD_HEIGHT[key] || 1.4, tint });
          if (!inst) continue; // not loaded yet → flock still has sheep (never-break)
          const wrap = new THREE.Group();
          inst.group.rotation.y = rotFix(key);
          wrap.add(inst.group);
          const a = rng() * Math.PI * 2, r = (key === 'a_husky' ? 4 : 2) + rng() * 3;
          wrap.position.set(hx + Math.cos(a) * r, map.heightAt(hx, hz), hz + Math.sin(a) * r);
          inst.play('idle');
          this.group.add(wrap);
          this.livestock.push({ inst, g: wrap, dog: key === 'a_husky' });
        }
      }
    }

    // grazing gazelles / deer (skip harsh peaks)
    if (!['snowpeak'].includes(biomeId)) {
      const n = ['forest', 'valley', 'plains', 'steppe'].includes(biomeId) ? 6 : 4;
      const coat = biomeId === 'forest' ? 0x6e4f33 : 0xc9a368;
      // real animated wildlife per biome (procedural quad fallback below)
      const wildKeys = WILDLIFE[biomeId] || [];
      for (let i = 0; i < n; i++) {
        if (wildKeys.length) {
          const key = wildKeys[Math.floor(rng() * wildKeys.length)];
          const beast = spawnAsset(key, { height: WILD_HEIGHT[key] || 1.0 });
          if (beast) {
            const wrap = new THREE.Group();
            beast.group.rotation.y = rotFix(key); // normalize forward axis
            wrap.add(beast.group);
            let fx = 0, fz = 0, ftries = 20;
            while (ftries-- > 0) {
              fx = (rng() - 0.5) * 110; fz = (rng() - 0.5) * 110;
              if (!map._nearRoad(fx, fz, 8)) break;
            }
            wrap.position.set(fx, map.heightAt(fx, fz), fz);
            wrap.rotation.y = rng() * Math.PI * 2;
            beast.play('idle');
            this.group.add(wrap);
            this.animals.push({ fox: beast, g: wrap, state: 'graze', t: rng() * 4, speed: 0 });
            continue;
          }
        }
        const q = buildQuad({
          bodyMat: colorMat(coat, 0.95), bellyMat: colorMat(0xe2cfa8, 0.95),
          bodyLen: 0.95, bodyR: 0.17, legH: 0.55, legR: 0.032,
          neckLen: 0.38, neckUp: 0.95, headR: 0.085, muzzleLen: 0.12,
          gait: { hip: 0.8, knee: 1.0, rate: 12 },
        });
        // lyre horns
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.22, 5), colorMat(0x4a3826, 0.8));
          horn.position.set(side * 0.05, 0.14, -0.02);
          horn.rotation.z = -side * 0.45;
          q.rig.head.add(horn);
        }
        let x = 0, z = 0, tries = 20;
        while (tries-- > 0) {
          x = (rng() - 0.5) * 110; z = (rng() - 0.5) * 110;
          if (!map._nearRoad(x, z, 8)) break;
        }
        q.group.position.set(x, map.heightAt(x, z), z);
        q.group.rotation.y = rng() * Math.PI * 2;
        this.group.add(q.group);
        this.animals.push({ q, state: 'graze', t: rng() * 4, speed: 0 });
      }
    }

    // Idle civilian villagers at settlement/bazaar spots. Future tf_* assets are optional:
    // if a key is not registered/loaded, the procedural commoner remains the live fallback.
    this.villagers = [];
    const CLOTHS = [0x7a5c3e, 0x8a6d3a, 0x6b5536, 0x9a7b46, 0x55614e, 0x46566a, 0x8a4a3a, 0xa8925e, 0x6a4a5a];
    // mobed fire-priests (tagged spots at the chahar-taq) always spawn; commoners fill the rest
    const allSpots = map.villagerSpots || [];
    // more life in a living city — the quarter fills its lane and plaza (cap raised
    // from 6 so the town reads as populated, not a ghost settlement)
    const lifeSpots = [...allSpots.filter((s) => s[4] === 'mobed'), ...allSpots.filter((s) => s[4] !== 'mobed').slice(0, 14)];
    for (const [x, y, z, ry, kind] of lifeSpots) {
      const mobed = kind === 'mobed';
      const female = !mobed && rng() < 0.4;
      const assetKey = chooseTownspersonKey({ mobed, female, rng });
      let v = assetCharacter(assetKey, { height: TOWNSFOLK_HEIGHT[assetKey] || 1.7 });
      const assetSource = !!v;
      if (!v) {
        v = buildHumanoid({
          armor: 'none', helmet: 'none', weapon: 'none', shield: false, hairStyle: 'none', // covered below
          clothColor: mobed ? 0xece4d0 : CLOTHS[(rng() * CLOTHS.length) | 0],
          beard: mobed || (!female && rng() < 0.5) ? 'full' : 'none',
          cloak: mobed || rng() < 0.45, cloakColor: mobed ? 0xdcd2b8 : CLOTHS[(rng() * CLOTHS.length) | 0],
          female, scale: female ? 0.94 : 1.0,
        });
        v.rig.head.add(makeHeadwear(rng, female, mobed)); // turban / skullcap / headscarf (white for mobeds)
        // basket/jug in hand — attach to the forearm so it tracks the elbow (arms now bend)
        if (!mobed && rng() < 0.5) { const it = makeCarry(rng); const h = v.rig.foreL || v.rig.armL; it.position.set(0, v.rig.foreL ? -0.26 : -0.6, 0.06); h.add(it); }
      }
      // ambient background figures skip the shadow pass (~30 meshes each) — keep it for gameplay
      // objects (towers/enemies/citadel/trees). They still RECEIVE shadows cast onto them.
      v.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      v.group.position.set(x, y, z);
      v.group.rotation.y = ry;
      this.group.add(v.group);
      // roughly half the townsfolk stroll their neighborhood (mobeds tend the fire and stay put)
      this.villagers.push({ rig: v.rig, anim: v.anim || null, assetKey: assetSource ? assetKey : null, group: v.group, phase: rng() * 6.28318, state: 'idle', t: 0, home: { x, z }, homeRy: ry, canStroll: !mobed && rng() < 0.5, strollT: 2 + rng() * 7, strollTarget: null });
    }
  }

  update(dt, time, game) {
    if (settings.get('reducedMotion')) dt *= 0.3;
    // round 4 B2: the town reacts to the battle — detect the wave-horn rising edge
    const waveNow = !!game?.waveActive;
    const waveStarted = waveNow && !this._waveWas;
    const waveEnded = !waveNow && this._waveWas; // the road is clear — the town breathes out
    this._waveWas = waveNow;
    const camFocus = game?.engine?.rtsCamera?.target || null;
    const animFar = (p) => camFocus ? ((p.x - camFocus.x) ** 2 + (p.z - camFocus.z) ** 2) > 3600 : false;
    for (const c of this.clouds) {
      c.sp.position.x += c.vx * dt;
      if (c.sp.position.x > 100) c.sp.position.x = -100;
    }
    for (const m of this.mist) {
      m.sp.position.x += m.vx * dt;
      m.sp.material.opacity = 0.16 + Math.sin(time * 0.4 + m.sp.position.z) * 0.07;
      if (m.sp.position.x > 70) m.sp.position.x = -70;
    }
    const cit = this.map.exitPos;
    for (const b of this.birds) {
      b.phase += b.speed * dt;
      const x = cit.x + Math.cos(b.phase) * b.r;
      const z = cit.z + Math.sin(b.phase) * b.r;
      b.g.position.set(x, cit.y + b.h + Math.sin(time * 1.3 + b.phase) * 0.8, z);
      b.g.rotation.y = -b.phase;
      flapBird(b, time);
    }

    // crossing flock: V-formation sweeps the board, then rests until the next pass
    if (this.flock) {
      const F = this.flock;
      if (!F.active) {
        F.t -= dt;
        if (F.t <= 0) {
          const a = Math.random() * Math.PI * 2;
          F.pos.set(Math.cos(a) * 170, 30 + Math.random() * 16, Math.sin(a) * 170);
          F.dir.set(-Math.cos(a + (Math.random() - 0.5) * 0.6), 0, -Math.sin(a + (Math.random() - 0.5) * 0.6)).normalize();
          F.active = true;
          for (const b of F.birds) b.g.visible = true;
        }
      } else {
        F.pos.addScaledVector(F.dir, F.speed * dt);
        const yaw = Math.atan2(F.dir.x, F.dir.z);
        for (const b of F.birds) {
          const ox = b.off.x * Math.cos(yaw) + b.off.z * Math.sin(yaw);
          const oz = -b.off.x * Math.sin(yaw) + b.off.z * Math.cos(yaw);
          b.g.position.set(F.pos.x + ox, F.pos.y + b.off.y + Math.sin(time * 1.1 + b.phase) * 0.5, F.pos.z + oz);
          b.g.rotation.y = yaw;
          flapBird(b, time, 8);
        }
        if (Math.hypot(F.pos.x, F.pos.z) > 200) {
          F.active = false;
          F.t = 22 + Math.random() * 26;
          for (const b of F.birds) b.g.visible = false;
        }
      }
    }

    // cranes: head-bob while wading; when a wave presses close they take wing and are gone
    for (const c of this.cranes || []) {
      if (c.state === 'idle') {
        c.neckPivot.rotation.x = Math.sin(time * 0.7 + c.seed) * 0.28 + (Math.sin(time * 0.13 + c.seed) > 0.6 ? 0.5 : 0);
        if (game?.enemies) {
          for (const e of game.enemies) {
            if (e.alive && e.group.position.distanceToSquared(c.g.position) < 144) { c.state = 'fly'; c.vel = new THREE.Vector3((Math.random() - 0.5), 1.4, (Math.random() - 0.5)).normalize(); break; }
          }
        }
      } else if (c.state === 'fly') {
        c.g.position.addScaledVector(c.vel, dt * 7);
        c.g.rotation.y = Math.atan2(c.vel.x, c.vel.z);
        c.neckPivot.rotation.x = -0.5; // neck stretched in flight
        if (c.g.position.y > 40) { c.g.visible = false; c.state = 'gone'; }
      }
    }

    // crows: peck and shuffle at the spawn field; scatter from marching waves; return
    for (const cr of this.crows || []) {
      if (cr.state === 'ground') {
        cr.g.position.y = cr.home.y + Math.max(0, Math.sin(time * 3.1 + cr.seed * 7)) * 0.09; // pecking hop
        cr.g.rotation.y += Math.sin(time * 0.9 + cr.seed) * dt * 0.7;
        if (game?.enemies) {
          for (const e of game.enemies) {
            if (e.alive && e.group.position.distanceToSquared(cr.g.position) < 100) {
              cr.state = 'fly';
              cr.vel = new THREE.Vector3(cr.g.position.x - e.group.position.x, 0, cr.g.position.z - e.group.position.z).normalize();
              cr.vel.y = 1.15;
              cr.vel.normalize();
              break;
            }
          }
        }
      } else if (cr.state === 'fly') {
        cr.g.position.addScaledVector(cr.vel, dt * 8.5);
        cr.g.rotation.y = Math.atan2(cr.vel.x, cr.vel.z);
        flapBird(cr, time, 4);
        if (cr.g.position.y > 32) { cr.g.visible = false; cr.state = 'gone'; cr.t = 16 + Math.random() * 14; }
      } else if (cr.state === 'gone') {
        cr.t -= dt;
        if (cr.t <= 0) {
          let quiet = true;
          if (game?.enemies) {
            for (const e of game.enemies) {
              if (e.alive && e.group.position.distanceToSquared(cr.home) < 225) { quiet = false; break; }
            }
          }
          if (quiet) {
            cr.g.position.copy(cr.home);
            cr.g.visible = true;
            cr.state = 'ground';
            cr.wl.pivotI.rotation.z = 1.05; cr.wl.pivotO.rotation.z = -2.0;
            cr.wr.pivotI.rotation.z = -1.05; cr.wr.pivotO.rotation.z = 2.0;
          } else cr.t = 6;
        }
      }
    }

    // the Simurgh crosses high and slow, streamers rippling — blink and you miss her
    if (this.simurgh) {
      const S = this.simurgh;
      if (!S.active) {
        S.t -= dt;
        if (S.t <= 0) {
          const a = Math.random() * Math.PI * 2;
          S.pos.set(Math.cos(a) * 190, 55 + Math.random() * 12, Math.sin(a) * 190);
          S.dir.set(-Math.cos(a), 0, -Math.sin(a)).normalize();
          S.active = true;
          S.g.visible = true;
        }
      } else {
        S.pos.addScaledVector(S.dir, 5.5 * dt);
        S.g.position.copy(S.pos);
        S.g.rotation.y = Math.atan2(S.dir.x, S.dir.z);
        flapBird(S, time, 2.2); // vast slow wingbeats
        for (let i = 0; i < S.streamers.length; i++) {
          S.streamers[i].rotation.z = Math.sin(time * 1.6 + i * 2.1) * 0.35;
        }
        if (Math.hypot(S.pos.x, S.pos.z) > 220) {
          S.active = false;
          S.t = 90 + Math.random() * 90;
          S.g.visible = false;
        }
      }
    }

    // the trade caravan: waits off-board, plods in to the market halt, rests, departs
    if (this.caravan) {
      const C = this.caravan;
      const map = this.map;
      const pathLen = Math.hypot(C.dest.x - C.edge.x, C.dest.z - C.edge.z) || 1;
      const placeTrain = (headS, facingIn, moving = true) => {
        for (let i = 0; i < C.camels.length; i++) {
          const cs = Math.max(0, Math.min(1, headS - (i * C.gap) / pathLen));
          const x = C.edge.x + (C.dest.x - C.edge.x) * cs;
          const z = C.edge.z + (C.dest.z - C.edge.z) * cs;
          const cam = C.camels[i];
          cam.g.position.set(x, map.heightAt(x, z), z);
          cam.g.rotation.y = facingIn ? Math.atan2(C.dest.x - C.edge.x, C.dest.z - C.edge.z) : Math.atan2(C.edge.x - C.dest.x, C.edge.z - C.dest.z);
          if (cam.anim) {
            cam.anim.play(moving ? 'walk' : 'idle', { timeScale: cam.ts });
            cam.anim.mixer.update(dt);
          } else {
            for (let l = 0; l < cam.legs.length; l++) cam.legs[l].rotation.x = moving ? Math.sin(time * 4 + l * 1.6 + i) * 0.32 : 0;
            cam.headPivot.rotation.x = Math.sin(time * 2 + i) * 0.12;
          }
        }
      };
      if (C.state === 'away') {
        C.t -= dt;
        if (C.t <= 0) { C.state = 'arriving'; C.s = 0; for (const c of C.camels) c.g.visible = true; }
      } else if (C.state === 'arriving') {
        C.s += (dt * C.speed) / pathLen;
        placeTrain(C.s, true);
        if (C.s >= 1) { C.state = 'resting'; C.t = 10 + Math.random() * 8; }
      } else if (C.state === 'resting') {
        placeTrain(1, true, false);
        C.t -= dt;
        if (C.t <= 0) { C.state = 'leaving'; C.s = 1; }
      } else if (C.state === 'leaving') {
        C.s -= (dt * C.speed) / pathLen;
        // walking out: the head is now the last camel, so offset the other way
        for (let i = 0; i < C.camels.length; i++) {
          const cs = Math.max(0, Math.min(1, C.s + (i * C.gap) / pathLen));
          const x = C.edge.x + (C.dest.x - C.edge.x) * cs;
          const z = C.edge.z + (C.dest.z - C.edge.z) * cs;
          const cam = C.camels[i];
          cam.g.position.set(x, map.heightAt(x, z), z);
          cam.g.rotation.y = Math.atan2(C.edge.x - C.dest.x, C.edge.z - C.dest.z);
          if (cam.anim) { cam.anim.play('walk', { timeScale: cam.ts }); cam.anim.mixer.update(dt); }
          else for (let l = 0; l < cam.legs.length; l++) cam.legs[l].rotation.x = Math.sin(time * 4 + l * 1.6 + i) * 0.32;
        }
        if (C.s <= 0) { C.state = 'away'; C.t = 30 + Math.random() * 30; for (const c of C.camels) c.g.visible = false; }
      }
    }

    // town pigeons: peck the rooftop, then burst into a wheeling flight and resettle
    if (this.pigeons) {
      const F = this.pigeons;
      if (F.state === 'roost') {
        for (const b of F.birds) {
          if (b.glb) { // GLB pigeon: pecking comes from the clip, not a position bob
            b.glb.group.rotation.y += Math.sin(time * 0.8 + b.seed) * dt * 0.6;
            b.glb.anim.play(Math.sin(time * 0.35 + b.seed * 2.1) > 0.15 ? 'eat' : 'idle');
            b.glb.anim.mixer.update(dt);
          } else {
            b.g.position.y = b.home.y + Math.max(0, Math.sin(time * 4 + b.seed * 6)) * 0.06; // peck-hop
            b.g.rotation.y += Math.sin(time * 0.8 + b.seed) * dt * 0.6;
          }
        }
        F.t -= dt;
        let scare = F.t <= 0 || waveStarted; // the wave-horn startles the whole flock aloft
        if (!scare && game?.enemies) {
          for (const e of game.enemies) {
            if (e.alive && e.group.position.distanceToSquared(F.center) < 225) { scare = true; break; }
          }
        }
        if (scare) {
          F.state = 'fly'; F.flyT = 4 + Math.random() * 3; F.t = 18 + Math.random() * 22;
          for (const b of F.birds) if (b.glb) { b.glb.group.visible = false; b.g.visible = true; }
        }
      } else { // fly: wheel around the roost, wings flapping
        F.flyT -= dt;
        for (let i = 0; i < F.birds.length; i++) {
          const b = F.birds[i];
          b.phase += dt * (1.7 + i * 0.06);
          const r = 3.5 + i * 0.45;
          b.g.position.set(F.center.x + Math.cos(b.phase) * r, F.center.y + 3.2 + Math.sin(time * 1.4 + b.seed) * 0.6, F.center.z + Math.sin(b.phase) * r);
          b.g.rotation.y = -b.phase;
          flapBird(b, time, 9);
        }
        if (F.flyT <= 0) {
          F.state = 'roost';
          for (const b of F.birds) {
            b.g.position.copy(b.home);
            b.wl.pivotI.rotation.z = 1.0; b.wl.pivotO.rotation.z = -1.9;
            b.wr.pivotI.rotation.z = -1.0; b.wr.pivotO.rotation.z = 1.9;
            if (b.glb) { b.glb.group.visible = true; b.g.visible = false; }
          }
        }
      }
    }

    // flutterers: wandering sin-walk with bobbing; fireflies pulse
    for (const f of this.flutterers) {
      const t2 = time * 0.6 + f.seed;
      f.sp.position.x += Math.sin(t2 * 1.7) * dt * 1.4;
      f.sp.position.z += Math.cos(t2 * 1.3) * dt * 1.4;
      f.sp.position.y += Math.sin(t2 * 3.1) * dt * 0.6;
      if (f.glow) f.sp.material.opacity = 0.4 + Math.abs(Math.sin(t2 * 2.6)) * 0.6;
    }

    // sheep drift with the herd, nibble, bob when stepping
    if (this.sheep.length) {
      this.herdDir += (Math.random() - 0.5) * dt * 0.4;
      this.herd.x += Math.sin(this.herdDir) * dt * 0.35;
      this.herd.z += Math.cos(this.herdDir) * dt * 0.35;
      this.herd.x = THREE.MathUtils.clamp(this.herd.x, -65, 65);
      this.herd.z = THREE.MathUtils.clamp(this.herd.z, -65, 65);
      for (const s of this.sheep) {
        const pos = s.g.position;
        const dx = this.herd.x - pos.x, dz = this.herd.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.6) {
          pos.x += (dx / d) * dt * 0.9;
          pos.z += (dz / d) * dt * 0.9;
          s.g.rotation.y = Math.atan2(dx, dz);
          s.g.position.y = this.map.heightAt(pos.x, pos.z) + Math.abs(Math.sin(time * 6 + s.phase)) * 0.04;
        } else {
          s.g.position.y = this.map.heightAt(pos.x, pos.z);
          s.g.rotation.y += Math.sin(time * 0.5 + s.phase) * dt * 0.2; // idle nibble turn
        }
      }
      // animated cattle + dog graze with the flock, never flee
      for (const L of this.livestock) {
        L.inst.mixer.update(dt);
        const pos = L.g.position;
        const dx = this.herd.x - pos.x, dz = this.herd.z - pos.z;
        const d = Math.hypot(dx, dz);
        const follow = L.dog ? 3.5 : 2.6;
        if (d > follow) {
          const sp = L.dog ? 1.7 : 0.7;
          pos.x += (dx / d) * dt * sp;
          pos.z += (dz / d) * dt * sp;
          pos.y = this.map.heightAt(pos.x, pos.z);
          L.g.rotation.y = Math.atan2(dx, dz);
          L.inst.play(L.dog ? 'run' : 'walk');
        } else {
          pos.y = this.map.heightAt(pos.x, pos.z);
          L.inst.play(L.inst.actions.eat ? 'eat' : 'idle');
        }
      }
    }

    // villagers: stand idle at their settlement spot; PANIC and run when enemies get close,
    // then walk back home and resume idle once the land is safe again. Shares _threatT throttle.
    this._threatT -= dt;
    for (const v of this.villagers) {
      v.t -= dt;
      const pos = v.group.position;
      const far = animFar(pos);
      // wave cleared: most visible GLB villagers cheer with their authored Wave clip,
      // staggered so the town erupts rather than saluting in lockstep
      if (waveEnded && v.anim?.actions?.wave && v.group.visible && Math.random() < 0.75) {
        v.cheerT = 0.15 + Math.random() * 1.1;
      }
      if (v.cheerT != null && (v.cheerT -= dt) <= 0) {
        v.cheerT = null;
        if (!far) v.anim?.gesture?.('wave');
      }
      if (this._threatT <= 0 && game && v.state !== 'flee' && v.state !== 'fleeIn' && v.state !== 'inside') {
        for (const e of game.enemies) {
          if (e.alive && e.group.position.distanceToSquared(pos) < 121) { // ~11u panic radius
            // bolt for the nearest compound door when one is close — the village
            // empties INDOORS under attack; open-field villagers just run
            let refuge = null, bd = 26 * 26;
            for (const [rx, rz] of this.map.refugePoints || []) {
              const dd = (rx - pos.x) * (rx - pos.x) + (rz - pos.z) * (rz - pos.z);
              if (dd < bd) { bd = dd; refuge = [rx, rz]; }
            }
            if (refuge) {
              v.state = 'fleeIn'; v.refuge = refuge;
            } else {
              v.state = 'flee'; v.t = 1.4 + Math.random() * 1.4;
              const d = pos.clone().sub(e.group.position).setY(0).normalize();
              v.group.rotation.y = Math.atan2(d.x, d.z); // face away
            }
            break;
          }
        }
      }
      if (v.state === 'fleeIn') {
        const [rx, rz] = v.refuge;
        const dx = rx - pos.x, dz = rz - pos.z, d = Math.hypot(dx, dz);
        if (d > 1.6) {
          v.group.rotation.y = Math.atan2(dx, dz);
          pos.x += (dx / d) * 4.4 * dt; pos.z += (dz / d) * 4.4 * dt;
          pos.y = this.map.heightAt(pos.x, pos.z);
          if (!far && !animateTownsperson(v, 'run', dt, 1.25)) animWalk(v.rig, time, 1.7); // running for the door
        } else {
          v.group.visible = false; // slipped inside
          v.state = 'inside';
          v.t = 6 + Math.random() * 6;
        }
      } else if (v.state === 'inside') {
        if (v.t <= 0) {
          let danger = false;
          if (game?.enemies) {
            for (const e of game.enemies) {
              if (e.alive && e.group.position.distanceToSquared(pos) < 324) { danger = true; break; } // ~18u
            }
          }
          if (danger) v.t = 4; // peek out later
          else { v.group.visible = true; v.state = 'return'; }
        }
      } else if (v.state === 'flee') {
        const dir = new THREE.Vector3(Math.sin(v.group.rotation.y), 0, Math.cos(v.group.rotation.y));
        pos.addScaledVector(dir, 4.4 * dt);
        pos.x = THREE.MathUtils.clamp(pos.x, -72, 72); pos.z = THREE.MathUtils.clamp(pos.z, -72, 72);
        pos.y = this.map.heightAt(pos.x, pos.z);
        if (!far && !animateTownsperson(v, 'run', dt, 1.25)) animWalk(v.rig, time, 1.7); // running cycle
        if (v.t <= 0) v.state = 'return';
      } else if (v.state === 'return') {
        const dx = v.home.x - pos.x, dz = v.home.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 0.35) {
          v.group.rotation.y = Math.atan2(dx, dz);
          pos.x += (dx / d) * 1.7 * dt; pos.z += (dz / d) * 1.7 * dt;
          pos.y = this.map.heightAt(pos.x, pos.z);
          if (!far && !animateTownsperson(v, 'walk', dt, 0.95)) animWalk(v.rig, time, 0.85);
        } else { v.group.rotation.y = v.homeRy; v.state = 'idle'; }
      } else if (v.state === 'stroll') {
        // amble to the chosen spot in the neighborhood, then loiter (back to idle)
        const dx = v.strollTarget.x - pos.x, dz = v.strollTarget.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 0.4) {
          v.group.rotation.y = Math.atan2(dx, dz);
          pos.x += (dx / d) * 1.3 * dt; pos.z += (dz / d) * 1.3 * dt;
          pos.y = this.map.heightAt(pos.x, pos.z);
          if (!far && !animateTownsperson(v, 'walk', dt, 0.75)) animWalk(v.rig, time, 1.0);
        } else { v.state = 'idle'; v.strollT = 5 + Math.random() * 7; }
      } else { // idle: breathe + slow look around, and townsfolk occasionally wander off
        if (!far && !animateTownsperson(v, 'idle', dt, 1)) {
          animIdle(v.rig, time + v.phase);
          if (v.rig.head) v.rig.head.rotation.y = Math.sin((time + v.phase) * 0.5) * 0.25;
        }
        // townsfolk don't run errands during a wave — they stay close, watching the road
        if (v.canStroll && !waveNow && (v.strollT -= dt) <= 0) {
          const a = Math.random() * 6.28318, rr = 2 + Math.random() * 6;
          v.strollTarget = { x: v.home.x + Math.cos(a) * rr, z: v.home.z + Math.sin(a) * rr };
          v.state = 'stroll';
        }
      }
    }

    // wildlife: graze, wander, flee from nearby fighters (procedural quads + GLTF foxes)
    for (const a of this.animals) {
      a.t -= dt;
      const body = a.g || a.q.group;
      const pos = body.position;
      if (a.fox) a.fox.mixer.update(dt);
      if (this._threatT <= 0 && game) {
        let threat = null;
        for (const e of game.enemies) {
          if (e.alive && e.group.position.distanceToSquared(pos) < 90) { threat = e.group.position; break; }
        }
        if (threat) {
          a.state = 'flee';
          a.t = 2.2;
          const dir = pos.clone().sub(threat).setY(0).normalize();
          body.rotation.y = Math.atan2(dir.x, dir.z);
        }
      }
      if (a.state === 'flee') {
        a.speed = 6;
        if (a.t <= 0) { a.state = 'graze'; a.t = 2 + Math.random() * 3; }
      } else if (a.state === 'walk') {
        a.speed = 1.2;
        if (a.t <= 0) { a.state = 'graze'; a.t = 2.5 + Math.random() * 3; }
      } else { // graze
        a.speed = 0;
        if (a.q) a.q.rig.neck.rotation.x = 0.85 + Math.sin(time * 1.7) * 0.08; // head down, nibbling
        else a.fox.play(a.fox.actions.eat ? 'eat' : 'idle'); // real Eating clip when present
        if (a.t <= 0) {
          a.state = 'walk';
          a.t = 1.5 + Math.random() * 2;
          body.rotation.y += (Math.random() - 0.5) * 1.6;
        }
      }
      if (a.speed > 0) {
        if (a.q) a.q.rig.neck.rotation.x = 0;
        const dir = new THREE.Vector3(Math.sin(body.rotation.y), 0, Math.cos(body.rotation.y));
        pos.addScaledVector(dir, a.speed * dt);
        pos.x = THREE.MathUtils.clamp(pos.x, -70, 70);
        pos.z = THREE.MathUtils.clamp(pos.z, -70, 70);
        pos.y = this.map.heightAt(pos.x, pos.z);
        if (a.q) animQuad(a.q.rig, time, a.speed > 3 ? 1.6 : 0.7);
        else a.fox.play(a.speed > 3 ? 'run' : 'walk');
      }
    }
    if (this._threatT <= 0) this._threatT = 0.3;
  }

  // Free this map's ambient life without touching SHARED resources. Procedural geometries
  // (villagers/sheep/birds) are unique per map → dispose. The cloud/mist SPRITES own a unique
  // SpriteMaterial + canvas texture → dispose those. But mesh MATERIALS are the shared MATS/
  // colorMat singletons (e.g. humanoid feet use mats.woodDark) — disposing them would break/
  // churn every other user, so leave them. SkinnedMesh gltf is cache-shared → only stop mixers.
  dispose() {
    this.group.traverse((o) => {
      if (o.isSkinnedMesh) return;
      if (o.isSprite) { // per-map sprite: free its material + canvas texture (NOT the shared sprite geometry)
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        return;
      }
      if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
      // mesh materials are shared (MATS/colorMat) — do NOT dispose
    });
    for (const a of this.animals) { const mx = a.fox?.mixer; if (mx) mx.stopAllAction(); }
    for (const v of this.villagers) { const mx = v.anim?.mixer; if (mx) mx.stopAllAction(); }
    this.villagers.length = 0;
    this.animals.length = 0;
  }
}

// Static open paddock of fence around the flock's spawn center (3 sides, wide gap so the
// drifting herd walks out freely). Gated on the kit asset; null => no fence, never breaks.
function buildPastureFence(amb, map, hx, hz, rng) {
  if (!propReady('fence')) return;
  const segW = (propBase('fence')?.baseW || 1) * KIT_UNIT;
  const R = 8;
  const gapStart = rng() * Math.PI * 2, gapWidth = Math.PI * 0.6; // open side
  const circ = Math.PI * 2 * R;
  const steps = Math.max(8, Math.round(circ / segW));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    let da = (a - gapStart) % (Math.PI * 2); if (da < 0) da += Math.PI * 2;
    if (da < gapWidth) continue; // leave the gate gap open
    const x = hx + Math.cos(a) * R, z = hz + Math.sin(a) * R;
    if (map._nearRoad(x, z, 2)) continue;
    const fp = getProp('fence');
    if (!fp) continue;
    fp.position.set(x, map.heightAt(x, z) - 0.06, z);
    fp.rotation.y = a + Math.PI / 2; // tangent to the ring
    fp.scale.z *= 2.4; // the kit panel is paper-thin — beef the rails/posts so they read at gameplay zoom
    fp.rotation.z = (rng() - 0.5) * 0.06; // weathered lean
    amb.group.add(fp);
  }
}
