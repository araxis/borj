// Ambient world life — the land breathes: rivers with animated water and stone
// bridges, distant mountain ranges, drifting clouds, circling birds, gazelles that
// graze and flee, ground mist. Pure spectacle; never blocks gameplay.
import * as THREE from 'three';
import { MATS } from '../models/materials.js';
import { colorMat, buildHumanoid, animIdle, animWalk } from '../models/humanoid.js';
import { buildQuad, animQuad } from '../models/creature.js';
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
import { samplePath } from './road.js';
import { settings } from '../core/settings.js';

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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  for (let x = -78; x <= 78; x += 12) {
    pts.push([x, best + Math.sin(x * 0.06 + rng() * 6) * 9 + (rng() - 0.5) * 5]);
  }
  const sampled = samplePath(pts, baseHeight, 1.2);
  return sampled;
}

export const RIVER_WIDTH = 4.6;

export function buildRiverMesh(river, group) {
  const { samples } = river;
  const half = RIVER_WIDTH / 2;
  const verts = [], uvs = [], idx = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
    const y = s.pos.y - 0.32; // water sits in the carved bed
    verts.push(s.pos.x + side.x * half, y, s.pos.z + side.z * half,
      s.pos.x - side.x * half, y, s.pos.z - side.z * half);
    const v = s.dist / 7;
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
  const mat = new THREE.MeshStandardMaterial({
    map: waterTexture(), transparent: true, opacity: 0.85,
    roughness: 0.25, metalness: 0.15, color: 0xbfe8ef,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  group.add(mesh);
  return mat; // caller scrolls map.offset for flow
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

// ---------- ambient life system ----------
// ---- villager accessories: Persian commoner head coverings + carried market goods ----
const SCARF_COL = [0x9a3b3b, 0x39568a, 0x6a4a7a, 0x7a6a2a, 0x8a4a2a];
const WRAP_COL = [0xe8e2d2, 0xd8c8a8, 0xc8b890, 0x8a7048, 0x6a6258];

function makeHeadwear(rng, female) {
  const g = new THREE.Group();
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
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.5, depthWrite: false }));
      sp.scale.set(26 + rng() * 22, 11 + rng() * 8, 1);
      sp.position.set((rng() - 0.5) * 180, 40 + rng() * 14, (rng() - 0.5) * 180);
      this.group.add(sp);
      this.clouds.push({ sp, vx: 0.6 + rng() * 0.7 });
    }

    // ground mist for moody lands
    if (['forest', 'snowpeak', 'wetland', 'mountain'].includes(biomeId)) {
      const mistTex = softBlobTexture(biomeId === 'forest' ? '190,220,200' : '225,235,245');
      for (let i = 0; i < 10; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.22, depthWrite: false }));
        sp.scale.set(20 + rng() * 14, 5 + rng() * 3, 1);
        const x = (rng() - 0.5) * 120, z = (rng() - 0.5) * 120;
        sp.position.set(x, map.heightAt(x, z) + 1.6, z);
        this.group.add(sp);
        this.mist.push({ sp, vx: 0.3 + rng() * 0.4 });
      }
    }

    // circling birds above the citadel
    const nBirds = 6;
    for (let i = 0; i < nBirds; i++) {
      const bird = new THREE.Group();
      const wingMat = colorMat(biomeId === 'snowpeak' ? 0xe8eef2 : 0x2e2a26, 0.9);
      const wL = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.22), wingMat);
      wL.material.side = THREE.DoubleSide;
      wL.position.x = -0.33;
      const wR = wL.clone(); wR.position.x = 0.33;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), wingMat);
      body.scale.set(1, 0.8, 1.8);
      bird.add(wL, wR, body);
      this.group.add(bird);
      this.birds.push({
        g: bird, wL, wR,
        phase: rng() * Math.PI * 2,
        r: 7 + rng() * 8,
        h: (map.citadel?.height || 10) + 5 + rng() * 6,
        speed: 0.25 + rng() * 0.2,
      });
    }

    // fireflies (moody lands) / butterflies (bright lands) — wandering points of color
    this.flutterers = [];
    {
      const glow = ['forest', 'wetland', 'river'].includes(biomeId);
      const colors = glow ? [0xffe066] : [0xfff4f4, 0xffb347, 0xff6b6b];
      const matCache = colors.map((c) => new THREE.SpriteMaterial({
        color: c, transparent: true, opacity: glow ? 0.9 : 0.85, depthWrite: false,
        blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      }));
      for (let i = 0; i < 12; i++) {
        const sp = new THREE.Sprite(matCache[i % matCache.length]);
        sp.scale.setScalar(glow ? 0.16 : 0.22);
        const x = (rng() - 0.5) * 100, z = (rng() - 0.5) * 100;
        sp.position.set(x, map.heightAt(x, z) + 0.8 + rng() * 1.2, z);
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

    // idle civilian villagers at the settlement/bazaar spots — procedural robed commoners
    // (buildHumanoid with no armor/helmet/weapon; texture-free). They just stand and breathe.
    this.villagers = [];
    const CLOTHS = [0x7a5c3e, 0x8a6d3a, 0x6b5536, 0x9a7b46, 0x55614e, 0x46566a, 0x8a4a3a, 0xa8925e, 0x6a4a5a];
    for (const [x, y, z, ry] of (map.villagerSpots || []).slice(0, 6)) {
      const female = rng() < 0.4;
      const v = buildHumanoid({
        armor: 'none', helmet: 'none', weapon: 'none', shield: false, hairStyle: 'none', // covered below
        clothColor: CLOTHS[(rng() * CLOTHS.length) | 0],
        beard: !female && rng() < 0.5 ? 'full' : 'none',
        cloak: rng() < 0.45, cloakColor: CLOTHS[(rng() * CLOTHS.length) | 0],
        female, scale: female ? 0.94 : 1.0,
      });
      v.rig.head.add(makeHeadwear(rng, female)); // turban / skullcap / headscarf
      if (rng() < 0.5) { const it = makeCarry(rng); it.position.set(0, -0.6, 0.06); v.rig.armL.add(it); } // basket/jug in hand
      // ambient background figures skip the shadow pass (~30 meshes each) — keep it for gameplay
      // objects (towers/enemies/citadel/trees). They still RECEIVE shadows cast onto them.
      v.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      v.group.position.set(x, y, z);
      v.group.rotation.y = ry;
      this.group.add(v.group);
      this.villagers.push({ rig: v.rig, group: v.group, phase: rng() * 6.28318, state: 'idle', t: 0, home: { x, z }, homeRy: ry });
    }
  }

  update(dt, time, game) {
    if (settings.get('reducedMotion')) dt *= 0.3;
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
      const flap = Math.sin(time * 9 + b.phase * 7) * 0.7;
      b.wL.rotation.z = flap; b.wR.rotation.z = -flap;
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
      if (this._threatT <= 0 && game && v.state !== 'flee') {
        for (const e of game.enemies) {
          if (e.alive && e.group.position.distanceToSquared(pos) < 121) { // ~11u panic radius
            v.state = 'flee'; v.t = 1.4 + Math.random() * 1.4;
            const d = pos.clone().sub(e.group.position).setY(0).normalize();
            v.group.rotation.y = Math.atan2(d.x, d.z); // face away
            break;
          }
        }
      }
      if (v.state === 'flee') {
        const dir = new THREE.Vector3(Math.sin(v.group.rotation.y), 0, Math.cos(v.group.rotation.y));
        pos.addScaledVector(dir, 4.4 * dt);
        pos.x = THREE.MathUtils.clamp(pos.x, -72, 72); pos.z = THREE.MathUtils.clamp(pos.z, -72, 72);
        pos.y = this.map.heightAt(pos.x, pos.z);
        animWalk(v.rig, time, 1.7); // running cycle
        if (v.t <= 0) v.state = 'return';
      } else if (v.state === 'return') {
        const dx = v.home.x - pos.x, dz = v.home.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 0.35) {
          v.group.rotation.y = Math.atan2(dx, dz);
          pos.x += (dx / d) * 1.7 * dt; pos.z += (dz / d) * 1.7 * dt;
          pos.y = this.map.heightAt(pos.x, pos.z);
          animWalk(v.rig, time, 0.85);
        } else { v.group.rotation.y = v.homeRy; v.state = 'idle'; }
      } else { // idle: breathe + slow look around
        animIdle(v.rig, time + v.phase);
        if (v.rig.head) v.rig.head.rotation.y = Math.sin((time + v.phase) * 0.5) * 0.25;
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
    fp.position.set(x, map.heightAt(x, z), z);
    fp.rotation.y = a + Math.PI / 2; // tangent to the ring
    amb.group.add(fp);
  }
}
