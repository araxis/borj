// Land citadels — every campaign map's heart is a FAMOUS, fully-detailed building
// drawn from the Shahnameh world, with its own defense mechanism and idle life:
//   apadana          — Persepolis / Takht-e Jamshid style columned terrace (Estakhr, Madayen)
//   zabul-keep       — mountain keep of the Sistani champions, ox-head mace monument
//   white-citadel    — Dez-i Sepid: white twin-tower gatehouse, wall ring, ballista
//   fire-temple      — chahar-taq sacred fire temple (Siyavash's trial flame)
//   simurgh-spire    — Alborz nest-spire of the Simurgh
//   damavand-bastion — chained crag bastion over Zahhak's prison
//   royal-court      — domed palace court (Balkh, Samangan, Kabul, Turan…)
//   arash-bow        — frontier watch crowned by Arash's colossal bow
import * as THREE from 'three';
import { MATS, MeshBuilder } from '../models/materials.js';
import { makeBanner, makeFlame } from '../models/towerkit.js';
import { colorMat } from '../models/humanoid.js';
import { buildSoldierModel } from '../models/creature.js';
import { Projectile, lashEffect } from '../entities/projectile.js';
import { FXC } from '../fx/particles.js';

// landmarks are monumental: everything in a style is authored small, then the whole
// architecture is scaled up; garrison guards are added AFTER scaling at human size
export const CITADEL_SCALE = 1.6;

function grandStairs(b, w, h, z, steps = 7, mat = 'stoneWhite') {
  for (let i = 0; i < steps; i++) {
    b.box(w - i * 0.18, h / steps, 0.6, mat, 0, (i + 0.5) * (h / steps), z + i * 0.5);
  }
}

// Persepolis-style column: stepped base, tall fluted shaft, double-bull capital.
// The hall is ROOFLESS — the iconic Takht-e Jamshid silhouette of freestanding
// columns against the sky (and it keeps the terrace sunlit and readable).
function apadanaColumn(b, x, z, h, matShaft = 'stoneWhite') {
  b.cyl(0.55, 0.66, 0.35, 14, 'stone', x, 0.18, z);
  b.cyl(0.4, 0.55, 0.35, 14, matShaft, x, 0.52, z);
  b.cyl(0.3, 0.36, h, 16, matShaft, x, 0.7 + h / 2, z);
  b.cyl(0.4, 0.3, 0.35, 14, matShaft, x, 0.78 + h, z);
  // double-bull capital: two facing heads on a saddle
  b.box(1.5, 0.4, 0.55, 'relief', x, 1.15 + h, z);
  for (const side of [-1, 1]) {
    b.sphere(0.24, 10, 8, 'stoneWhite', x + side * 0.62, 1.2 + h, z, 0.9);
    b.box(0.26, 0.18, 0.32, 'stoneWhite', x + side * 0.8, 1.1 + h, z);
    b.cone(0.06, 0.22, 6, 'stoneWhite', x + side * 0.55, 1.48 + h, z);
    b.cone(0.06, 0.22, 6, 'stoneWhite', x + side * 0.72, 1.48 + h, z);
  }
}

// guardian lamassu: winged bull with crowned, bearded head
function lamassu(b, x, z, ry, scale = 1) {
  const m = (gx, gy, gz) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    return [x + gx * c + gz * s, gy, z - gx * s + gz * c];
  };
  let p;
  p = m(0, 1.0 * scale, 0); b.sphere(0.55 * scale, 11, 9, 'stoneWhite', p[0], p[1], p[2], 0.8);
  p = m(0, 1.0 * scale, -0.5 * scale); b.sphere(0.48 * scale, 10, 8, 'stoneWhite', p[0], p[1], p[2], 0.85);
  for (const fz of [0.35, -0.7]) {
    for (const fx of [-0.3, 0.3]) {
      p = m(fx * scale, 0.35 * scale, fz * scale);
      b.cyl(0.09 * scale, 0.11 * scale, 0.7 * scale, 8, 'stoneWhite', p[0], p[1], p[2]);
    }
  }
  // swept wing
  p = m(0, 1.35 * scale, -0.45 * scale);
  const wing = new THREE.ConeGeometry(0.5 * scale, 1.5 * scale, 5);
  const mat4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-1.1, ry, 0));
  mat4.setPosition(p[0], p[1], p[2]);
  b.add(wing, 'stoneWhite', mat4);
  // bearded head with tiara
  p = m(0, 1.62 * scale, 0.45 * scale); b.sphere(0.24 * scale, 10, 8, 'stoneWhite', p[0], p[1], p[2]);
  p = m(0, 1.42 * scale, 0.5 * scale); b.cone(0.14 * scale, 0.3 * scale, 8, 'stoneWhite', p[0], p[1], p[2]);
  p = m(0, 1.84 * scale, 0.43 * scale); b.cyl(0.16 * scale, 0.19 * scale, 0.14 * scale, 10, 'gold', p[0], p[1], p[2]);
}

// abstract winged sun disc (royal farr emblem)
function wingedDisc(group, y, scale = 1) {
  const mats = MATS();
  const disc = new THREE.Mesh(new THREE.TorusGeometry(0.4 * scale, 0.1 * scale, 10, 22), mats.gold);
  disc.position.y = y;
  group.add(disc);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 12, 10), mats.gold);
  core.position.y = y;
  group.add(core);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3 * scale, 0.1 * scale, 0.04), mats.gold);
    wing.position.set(side * 0.95 * scale, y + 0.08 * scale, 0);
    wing.rotation.z = side * 0.22;
    group.add(wing);
    const wing2 = new THREE.Mesh(new THREE.BoxGeometry(0.9 * scale, 0.08 * scale, 0.04), mats.bronze);
    wing2.position.set(side * 0.8 * scale, y - 0.06 * scale, 0);
    wing2.rotation.z = side * 0.12;
    group.add(wing2);
  }
  return disc;
}

// festive pennant garland strung between two points with a catenary sag
function pennantLine(group, from, to, n = 9) {
  const mats = MATS();
  const cols = [mats.clothRed, mats.clothTeal, mats.clothGold, mats.clothPurple, mats.clothWhite];
  const line = new THREE.Group();
  const dir = to.clone().sub(from);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = from.clone().addScaledVector(dir, t);
    p.y -= Math.sin(t * Math.PI) * dir.length() * 0.07; // sag
    if (i < n) {
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 4), cols[i % cols.length]);
      flag.position.copy(p);
      flag.position.y -= 0.25;
      flag.rotation.x = Math.PI;
      line.add(flag);
    }
  }
  // the rope
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, dir.length(), 4), mats.woodDark);
  rope.position.copy(from).addScaledVector(dir, 0.5);
  rope.lookAt(to);
  rope.rotateX(Math.PI / 2);
  line.add(rope);
  group.add(line);
}

function walledRing(b, r, h, mat = 'stone', merlons = 22) {
  b.cyl(r, r * 1.04, h, 24, mat, 0, h / 2, 0);
  b.cyl(r * 1.08, r * 1.08, 0.3, 24, 'stoneDark', 0, h + 0.15, 0);
  for (let i = 0; i < merlons; i++) {
    const a = (i / merlons) * Math.PI * 2;
    b.box(0.55, 0.5, 0.3, mat, Math.cos(a) * r, h + 0.55, Math.sin(a) * r, -a);
  }
}

// ---------------- styles ----------------
const STYLES = {
  apadana: {
    footprint: 14,
    defense: { kind: 'volley', range: 20, rate: 0.7, damage: 18, shots: 6 },
    build() {
      const g = new THREE.Group();
      const animated = { banners: [], flames: [], spinners: [], glows: [] };
      let b = new MeshBuilder();
      // buried foundation skirt so the terrace never overhangs a slope
      b.box(22.6, 5, 18.6, 'stoneDark', 0, -2.3, 0);
      // three-tier terrace with relief friezes
      b.box(22, 1.4, 18, 'stoneWhite', 0, 0.7, 0);
      b.box(20.4, 0.5, 16.4, 'relief', 0, 1.55, 0);
      b.box(19, 1.4, 15, 'stoneWhite', 0, 2.4, 0);
      b.box(17.6, 0.5, 13.6, 'reliefGlow', 0, 3.3, 0);
      b.box(16, 1.0, 12, 'stoneWhite', 0, 4.0, 0);
      // grand double stairway
      grandStairs(b, 7, 4.4, 9.2, 9);
      b.box(1.2, 4.6, 4.8, 'stoneWhite', -4.2, 2.3, 10.4);
      b.box(1.2, 4.6, 4.8, 'stoneWhite', 4.2, 2.3, 10.4);
      // roofless hall of columns 4×3 (Takht-e Jamshid ruins silhouette)
      for (let cx = -1.5; cx <= 1.5; cx++) {
        for (let cz = -1; cz <= 1; cz++) {
          apadanaColumn(b, cx * 3.8, cz * 3.5 - 0.5, 7.4);
        }
      }
      // corner guard towers
      for (const cx of [-9.5, 9.5]) {
        for (const cz of [-7.5, 7.5]) {
          b.cyl(1.0, 1.2, 5.4, 12, 'stoneWhite', cx, 4.2 + 2.7, cz);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            b.box(0.34, 0.4, 0.22, 'stoneWhite', cx + Math.cos(a) * 1.0, 10.1, cz + Math.sin(a) * 1.0, -a);
          }
        }
      }
      // guardian lamassu flanking the stair + a procession of small ones on the parapet
      lamassu(b, -3.1, 8.6, Math.PI, 1.25);
      lamassu(b, 3.1, 8.6, Math.PI, 1.25);
      for (const px of [-7.5, -5.5, 5.5, 7.5]) lamassu(b, px, 6.6, Math.PI, 0.5);
      // relief procession panels along the second tier (tribute bearers motif)
      for (let i = -3; i <= 3; i++) {
        b.box(1.6, 0.9, 0.18, 'reliefGlow', i * 2.3, 3.0, 7.6);
      }
      g.add(b.build());
      // pennant garlands between the front corner towers and the hall
      pennantLine(g, new THREE.Vector3(-9.5, 9.6, 7.5), new THREE.Vector3(-3.5, 12.2, -0.5), 10);
      pennantLine(g, new THREE.Vector3(9.5, 9.6, 7.5), new THREE.Vector3(3.5, 12.2, -0.5), 10);
      // torch row along the terrace edge
      for (const tx of [-8, -4, 4, 8]) {
        const tf = makeFlame(0.9);
        tf.position.set(tx, 5.1, 6.6);
        g.add(tf);
        animated.flames.push(tf);
      }
      // winged farr disc hovering above the hall — slowly gleaming
      const disc = wingedDisc(g, 14.2, 1.6);
      animated.spinners.push(disc);
      // braziers + banners
      for (const cx of [-6, 6]) {
        const fl = makeFlame(1.6);
        fl.position.set(cx, 5.2, 8.2);
        g.add(fl);
        animated.flames.push(fl);
        const bn = makeBanner(cx < 0 ? 'clothTeal' : 'clothGold', 1.2, 2.0, 4.6);
        bn.position.set(cx * 1.55, 9.4 - 4.6 + 0.4, -7.4);
        g.add(bn);
        animated.banners.push(bn);
      }
      return { group: g, animated, muzzles: [new THREE.Vector3(-9.5, 11, 7.5), new THREE.Vector3(9.5, 11, 7.5)], guardPosts: [[-9.5, 9.9, 7.5], [9.5, 9.9, 7.5], [-6, 4.7, 7.8], [6, 4.7, 7.8], [0, 4.7, 5.4]], height: 13 };
    },
  },

  'zabul-keep': {
    footprint: 11,
    defense: { kind: 'maceShock', range: 9.5, rate: 0.28, damage: 60 },
    build() {
      const g = new THREE.Group();
      const animated = { banners: [], flames: [], spinners: [], glows: [] };
      const b = new MeshBuilder();
      b.cyl(7.2, 8.4, 2.0, 18, 'stoneDark', 0, 1.0, 0);
      b.cyl(5.2, 6.4, 4.2, 16, 'stone', 0, 2 + 2.1, 0);
      walledRing(b, 5.6, 0.8, 'stone', 18);
      b.cyl(3.4, 4.4, 4.6, 14, 'mudbrick', 0, 6.2 + 2.3, 0);
      b.cyl(3.9, 3.9, 0.5, 14, 'reliefGlow', 0, 8.4, 0);
      grandStairs(b, 4, 2.0, 7.4, 5, 'stone');
      // gate
      b.box(2.6, 3.0, 0.8, 'woodDark', 0, 3.5, 6.3);
      const arch = new THREE.TorusGeometry(1.3, 0.3, 8, 14, Math.PI);
      const m4 = new THREE.Matrix4(); m4.setPosition(0, 5.0, 6.3);
      b.add(arch, 'turquoise', m4);
      // colossal ox-head mace monument
      b.cyl(0.3, 0.4, 7.0, 12, 'wood', 0, 10.8 + 3.5, 0);
      b.box(2.4, 1.9, 1.9, 'gold', 0, 18.6, 0);
      b.cone(0.5, 1.3, 8, 'gold', 1.25, 19.6, 0);
      b.cone(0.5, 1.3, 8, 'gold', -1.25, 19.6, 0);
      b.sphere(0.55, 12, 10, 'gold', 0, 17.3, 0);
      g.add(b.build());
      for (let i = 0; i < 3; i++) {
        const bn = makeBanner(['clothRed', 'clothGold', 'clothTeal'][i], 1.1, 1.9, 4.2);
        const a = (i / 3) * Math.PI * 2 + 0.6;
        bn.position.set(Math.cos(a) * 5.4, 6.6 - 3.4, Math.sin(a) * 5.4);
        g.add(bn);
        animated.banners.push(bn);
      }
      const fl = makeFlame(1.4); fl.position.set(0, 9.0, 3.4); g.add(fl); animated.flames.push(fl);
      return { group: g, animated, muzzles: [new THREE.Vector3(0, 12, 0)], guardPosts: [[4.6, 4.5, 2.2], [-4.6, 4.5, 2.2], [0, 4.5, -5.3], [1.7, 8.9, 1.7]], height: 19 };
    },
  },

  'white-citadel': {
    footprint: 12,
    defense: { kind: 'ballista', range: 23, rate: 0.4, damage: 90 },
    build() {
      const g = new THREE.Group();
      const animated = { banners: [], flames: [], spinners: [], glows: [] };
      const b = new MeshBuilder();
      b.cyl(8.0, 9.0, 1.4, 20, 'stoneWhite', 0, 0.7, 0);
      walledRing(b, 7.2, 3.4, 'stoneWhite', 26);
      // twin gate towers
      for (const side of [-1, 1]) {
        b.cyl(1.6, 1.9, 8.4, 14, 'stoneWhite', side * 2.6, 1.4 + 4.2, 6.0);
        b.cone(1.8, 1.6, 12, 'turquoise', side * 2.6, 10.6, 6.0);
        b.sphere(0.16, 8, 6, 'gold', side * 2.6, 11.6, 6.0);
      }
      b.box(3.4, 4.2, 1.0, 'woodDark', 0, 2.9, 6.4);
      const arch = new THREE.TorusGeometry(1.7, 0.34, 8, 16, Math.PI);
      const m4 = new THREE.Matrix4(); m4.setPosition(0, 5.0, 6.4);
      b.add(arch, 'stoneWhite', m4);
      // central keep with ballista deck
      b.cyl(3.2, 4.0, 6.4, 14, 'stoneWhite', 0, 1.4 + 3.2, -1.5);
      b.cyl(3.6, 3.6, 0.4, 14, 'relief', 0, 8.2, -1.5);
      b.box(3.4, 0.3, 0.5, 'woodDark', 0, 8.9, -1.5);
      b.box(0.5, 0.3, 2.6, 'woodDark', 0, 8.9, -1.5);
      g.add(b.build());
      for (const side of [-1, 1]) {
        const bn = makeBanner('clothWhite', 1.0, 1.7, 3.8);
        bn.position.set(side * 5.2, 4.4 - 1.4, -3.5);
        g.add(bn);
        animated.banners.push(bn);
      }
      // garland across the twin gate towers
      pennantLine(g, new THREE.Vector3(-2.6, 9.8, 6.0), new THREE.Vector3(2.6, 9.8, 6.0), 7);
      return { group: g, animated, muzzles: [new THREE.Vector3(0, 9.4, -1.5)], guardPosts: [[-2.6, 10.0, 6.0], [2.6, 10.0, 6.0], [-6.2, 4.4, -2], [6.2, 4.4, -2], [1.5, 9.3, -1.5]], height: 11 };
    },
  },

  'fire-temple': {
    footprint: 11,
    defense: { kind: 'fireNova', range: 11, rate: 0.33, damage: 30 },
    build() {
      const g = new THREE.Group();
      const animated = { banners: [], flames: [], spinners: [], glows: [] };
      const b = new MeshBuilder();
      b.cyl(7.0, 8.0, 1.2, 18, 'stone', 0, 0.6, 0);
      b.cyl(6.2, 6.2, 0.4, 18, 'reliefGlow', 0, 1.4, 0);
      // chahar-taq: four piers + four arches + dome
      for (const cx of [-2.6, 2.6]) {
        for (const cz of [-2.6, 2.6]) {
          b.box(1.4, 5.2, 1.4, 'brickRed', cx, 1.6 + 2.6, cz);
        }
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const arch = new THREE.TorusGeometry(2.4, 0.42, 9, 16, Math.PI);
        const m4 = new THREE.Matrix4().makeRotationY(a + Math.PI / 2);
        m4.setPosition(Math.cos(a) * 2.6, 6.8, Math.sin(a) * 2.6);
        b.add(arch, 'brickRed', m4);
      }
      b.sphere(3.4, 20, 14, 'turquoise', 0, 7.6, 0, 1.05, Math.PI * 2, Math.PI / 2);
      b.cyl(0.07, 0.07, 1.6, 8, 'gold', 0, 12.2, 0);
      b.sphere(0.2, 10, 8, 'gold', 0, 13.1, 0);
      // eternal-flame altar
      b.cyl(1.0, 1.3, 1.6, 12, 'stoneDark', 0, 1.6 + 0.8, 0);
      b.cyl(1.35, 1.0, 0.5, 12, 'bronze', 0, 3.0, 0);
      grandStairs(b, 4.4, 1.5, 6.4, 4, 'stone');
      g.add(b.build());
      const eternal = makeFlame(2.6);
      eternal.position.set(0, 3.4, 0);
      g.add(eternal);
      animated.flames.push(eternal);
      for (const a of [0.8, 2.4, 4.0, 5.5]) {
        const fl = makeFlame(1.0);
        fl.position.set(Math.cos(a) * 5.6, 2.0, Math.sin(a) * 5.6);
        g.add(fl);
        animated.flames.push(fl);
      }
      return { group: g, animated, muzzles: [new THREE.Vector3(0, 4, 0)], guardPosts: [[4.5, 1.7, 4.5], [-4.5, 1.7, 4.5], [-4.5, 1.7, -4.5], [4.5, 1.7, -4.5]], height: 13 };
    },
  },

  'simurgh-spire': {
    footprint: 11,
    defense: { kind: 'feathers', range: 17, rate: 0.8, damage: 14, heals: true },
    build() {
      const g = new THREE.Group();
      const animated = { banners: [], flames: [], spinners: [], glows: [] };
      const b = new MeshBuilder();
      // craggy spire (stacked tapered rocks)
      let y = 0;
      const rs = [5.2, 4.2, 3.3, 2.5, 1.9];
      for (let i = 0; i < rs.length; i++) {
        b.cyl(rs[i] * 0.82, rs[i], 2.6, 9 + (i % 2), 'stoneDark', (Math.sin(i * 2.3)) * 0.5, y + 1.3, (Math.cos(i * 1.7)) * 0.5);
        y += 2.3;
      }
      // shrine ledge + nest
      b.cyl(2.6, 2.2, 0.6, 12, 'stone', 0, y + 0.3, 0);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        b.cyl(0.08, 0.08, 2.0, 5, 'wood', Math.cos(a) * 1.9, y + 1.0, Math.sin(a) * 1.9, Math.PI / 3.2, a);
      }
      b.cyl(1.7, 1.4, 0.7, 12, 'woodDark', 0, y + 0.9, 0);
      g.add(b.build());
      const mats = MATS();
      // hovering glow feathers
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.8), mats.featherGlow);
        const a = (i / 5) * Math.PI * 2;
        f.position.set(Math.cos(a) * 1.6, y + 2.4, Math.sin(a) * 1.6);
        f.rotation.y = a;
        f.rotation.z = 0.35;
        g.add(f);
        animated.spinners.push(f);
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.07, 8, 26), mats.featherGlow);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = y + 2.2;
      g.add(halo);
      animated.glows.push(halo);
      return { group: g, animated, muzzles: [new THREE.Vector3(0, y + 2, 0)], guardPosts: [[1.5, y + 0.7, 0.6], [-1.5, y + 0.7, -0.6], [3.6, 0.1, 3.6], [-3.6, 0.1, 3.6]], height: y + 3 };
    },
  },

  'damavand-bastion': {
    footprint: 12,
    defense: { kind: 'chains', range: 15, rate: 0.5, damage: 26 },
    build() {
      const g = new THREE.Group();
      const animated = { banners: [], flames: [], spinners: [], glows: [] };
      const b = new MeshBuilder();
      b.cyl(7.6, 8.6, 1.6, 16, 'stoneDark', 0, 0.8, 0);
      walledRing(b, 6.6, 2.8, 'stoneDark', 20);
      // crag peak with snow cap
      b.cyl(2.8, 5.2, 7.5, 10, 'stoneDark', 0, 1.6 + 3.75, 0);
      b.cone(2.9, 3.4, 10, 'stoneWhite', 0, 10.6, 0);
      // colossal chains wrapping the peak
      for (let s = 0; s < 4; s++) {
        const a0 = s * 1.6;
        for (let i = 0; i < 7; i++) {
          const t = i / 7;
          const a = a0 + t * 2.2;
          const r = 4.6 - t * 2.2;
          b.cyl(0.13, 0.13, 0.6, 6, 'iron', Math.cos(a) * r, 2.6 + t * 7.2, Math.sin(a) * r, Math.PI / 2.3, a + (i % 2) * Math.PI / 2);
        }
      }
      // chained gate
      b.box(3.0, 3.4, 0.9, 'woodDark', 0, 2.4, 6.2);
      b.cyl(0.1, 0.1, 3.4, 6, 'iron', -1.0, 2.4, 6.7, 0, 0.5);
      b.cyl(0.1, 0.1, 3.4, 6, 'iron', 1.0, 2.4, 6.7, 0, -0.5);
      g.add(b.build());
      const fl = makeFlame(1.2); fl.position.set(-4.4, 4.6, 4.4); g.add(fl); animated.flames.push(fl);
      const fl2 = makeFlame(1.2); fl2.position.set(4.4, 4.6, 4.4); g.add(fl2); animated.flames.push(fl2);
      return { group: g, animated, muzzles: [new THREE.Vector3(0, 9, 0)], guardPosts: [[5.4, 4.5, 2.6], [-5.4, 4.5, 2.6], [0, 4.5, -5.7], [1.9, 1.7, 6.2], [-1.9, 1.7, 6.2]], height: 12.5 };
    },
  },

  'royal-court': {
    footprint: 12,
    defense: { kind: 'royalArchers', range: 17, rate: 0.7, damage: 15, shots: 2 },
    build() {
      const g = new THREE.Group();
      const animated = { banners: [], flames: [], spinners: [], glows: [] };
      const b = new MeshBuilder();
      b.box(16, 1.2, 13, 'stone', 0, 0.6, 0);
      b.box(14.8, 0.4, 11.8, 'relief', 0, 1.4, 0);
      // palace block + grand iwan
      b.box(10, 5.0, 7.5, 'plaster', 0, 1.6 + 2.5, -1.5);
      b.box(4.6, 6.2, 1.2, 'plaster', 0, 1.6 + 3.1, 2.6);
      b.box(2.8, 4.4, 1.4, 'woodDark', 0, 1.6 + 2.2, 2.7);
      const arch = new THREE.TorusGeometry(1.45, 0.32, 9, 16, Math.PI);
      const m4 = new THREE.Matrix4(); m4.setPosition(0, 5.9, 3.1);
      b.add(arch, 'turquoise', m4);
      b.box(5.2, 0.5, 1.4, 'reliefGlow', 0, 8.2, 2.7);
      // great turquoise dome + drum
      b.cyl(2.9, 3.1, 1.6, 16, 'relief', 0, 6.6 + 0.8, -1.5);
      b.sphere(3.0, 22, 16, 'turquoise', 0, 8.4, -1.5, 1.12, Math.PI * 2, Math.PI / 2);
      b.cyl(0.07, 0.07, 1.5, 8, 'gold', 0, 12.4, -1.5);
      b.sphere(0.18, 10, 8, 'gold', 0, 13.2, -1.5);
      // twin slender towers
      for (const side of [-1, 1]) {
        b.cyl(0.65, 0.85, 8.0, 12, 'plaster', side * 6.4, 1.6 + 4.0, 2.2);
        b.cyl(0.95, 0.95, 0.5, 12, 'turquoise', side * 6.4, 9.9, 2.2);
        b.cone(0.8, 1.3, 12, 'gold', side * 6.4, 10.8, 2.2);
      }
      // garden pool with fountain
      b.box(4.6, 0.35, 2.6, 'lapis', 0, 1.75, 4.9);
      b.cyl(0.16, 0.2, 0.8, 8, 'stoneWhite', 0, 2.2, 4.9);
      grandStairs(b, 5, 1.4, 6.6, 4, 'stone');
      g.add(b.build());
      for (const side of [-1, 1]) {
        const bn = makeBanner(side < 0 ? 'clothPurple' : 'clothTeal', 1.1, 1.9, 4.4);
        bn.position.set(side * 7.4, 1.6, -4.5);
        g.add(bn);
        animated.banners.push(bn);
      }
      // garland between the minarets, over the iwan
      pennantLine(g, new THREE.Vector3(-6.4, 10.6, 2.2), new THREE.Vector3(6.4, 10.6, 2.2), 12);
      const fl = makeFlame(1.1); fl.position.set(-2.6, 2.6, 4.9); g.add(fl); animated.flames.push(fl);
      const fl2 = makeFlame(1.1); fl2.position.set(2.6, 2.6, 4.9); g.add(fl2); animated.flames.push(fl2);
      return { group: g, animated, muzzles: [new THREE.Vector3(-6.4, 10.4, 2.2), new THREE.Vector3(6.4, 10.4, 2.2)], guardPosts: [[-6.8, 1.9, 4.6], [6.8, 1.9, 4.6], [-3.2, 1.9, 5.8], [3.2, 1.9, 5.8], [0, 8.6, 2.4]], height: 13 };
    },
  },

  'arash-bow': {
    footprint: 11,
    defense: { kind: 'borderShot', range: 32, rate: 0.16, damage: 110 },
    build() {
      const g = new THREE.Group();
      const animated = { banners: [], flames: [], spinners: [], glows: [] };
      const b = new MeshBuilder();
      b.cyl(6.6, 7.6, 1.6, 14, 'stoneDark', 0, 0.8, 0);
      walledRing(b, 5.8, 2.4, 'stone', 18);
      b.cyl(2.6, 3.6, 7.4, 12, 'stone', 0, 1.6 + 3.7, 0);
      b.cyl(3.1, 3.1, 0.5, 12, 'reliefGlow', 0, 9.2, 0);
      b.box(6.4, 0.4, 6.4, 'wood', 0, 9.7, 0);
      // colossal recurve bow monument
      const bow = new THREE.TorusGeometry(3.0, 0.18, 8, 22, Math.PI * 0.92);
      const m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, 0, Math.PI * 0.04));
      m4.setPosition(0, 12.6, 0);
      b.add(bow, 'woodDark', m4);
      b.cyl(0.035, 0.035, 5.6, 4, 'stoneWhite', 0, 12.4, 0, 0, Math.PI / 2);
      // the legendary arrow, nocked skyward
      b.cyl(0.07, 0.07, 4.4, 6, 'wood', 0, 13.4, 0, 0.5, 0);
      b.cone(0.16, 0.5, 6, 'gold', 0, 15.6, 1.05);
      g.add(b.build());
      const bn = makeBanner('clothWhite', 1.2, 2.0, 4.6);
      bn.position.set(-4.6, 4.0 - 2.2, 3.2);
      g.add(bn);
      animated.banners.push(bn);
      const fl = makeFlame(1.4); fl.position.set(4.4, 4.4, 3.2); g.add(fl); animated.flames.push(fl);
      return { group: g, animated, muzzles: [new THREE.Vector3(0, 12.5, 0)], guardPosts: [[2.5, 10.1, 2.5], [-2.5, 10.1, 2.5], [-2.5, 10.1, -2.5], [2.5, 10.1, -2.5]], height: 16 };
    },
  },
};

// place id -> citadel style
const STYLE_BY_PLACE = {
  estakhr: 'apadana', madayen: 'apadana',
  zabulistan: 'zabul-keep', sistan: 'zabul-keep', mazandaran: 'zabul-keep',
  'dez-sepid': 'white-citadel', 'gordafarid-fort': 'white-citadel', 'dez-roein': 'white-citadel',
  'siyavash-gate': 'fire-temple',
  alborz: 'simurgh-spire',
  damavand: 'damavand-bastion', 'dez-bahman': 'damavand-bastion',
  'arash-watch': 'arash-bow',
  balkh: 'royal-court', samangan: 'royal-court', kabul: 'royal-court',
  turan: 'royal-court', 'gang-dez': 'royal-court', makran: 'royal-court', 'manijeh-garden': 'royal-court',
};

export function citadelStyleFor(placeId) { return STYLE_BY_PLACE[placeId] || 'royal-court'; }
export function citadelFootprint(placeId) { return STYLES[citadelStyleFor(placeId)].footprint * CITADEL_SCALE; }

export function buildLandCitadel(placeId) {
  const styleId = citadelStyleFor(placeId);
  const style = STYLES[styleId];
  const built = style.build();
  // universal buried foundation so no style ever overhangs sloping ground
  const mats = MATS();
  const foundation = new THREE.Mesh(
    new THREE.CylinderGeometry(style.footprint * 0.62, style.footprint * 0.78, 7, 20),
    mats.stoneDark,
  );
  foundation.position.y = -3.2;
  built.group.add(foundation);

  // MONUMENTAL: scale the architecture up, then post human-scale garrison guards
  // on its terraces, towers and gates (different floors of the landmark).
  const inner = built.group;
  inner.scale.setScalar(CITADEL_SCALE);
  const outer = new THREE.Group();
  outer.add(inner);
  built.group = outer;
  built.muzzles = built.muzzles.map((m) => m.clone().multiplyScalar(CITADEL_SCALE));
  built.height = (built.height || 12) * CITADEL_SCALE;
  built.footprint = style.footprint * CITADEL_SCALE;
  built.animated.guards = [];
  const guardKinds = ['spearman', 'shieldGuard', 'halberdier', 'spearMaiden'];
  (built.guardPosts || []).forEach((p, i) => {
    const guard = buildSoldierModel(guardKinds[i % guardKinds.length]);
    guard.group.position.set(p[0] * CITADEL_SCALE, p[1] * CITADEL_SCALE, p[2] * CITADEL_SCALE);
    guard.group.rotation.y = Math.atan2(p[0], p[2]) + (i % 2 ? 0.4 : -0.3); // watch outward
    outer.add(guard.group);
    built.animated.guards.push({ model: guard, phase: i * 1.7 });
  });

  built.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  built.styleId = styleId;
  built.defense = { ...style.defense };
  return built;
}

// The citadel's own defense mechanism — the land fights back.
export class CitadelGuard {
  constructor(game, citadel) {
    this.game = game;
    this.citadel = citadel;
    this.def = citadel.defense;
    this.cd = 2;
    this.pos = citadel.group.position;
    // scale with campaign depth so it stays a meaningful last line
    const order = game.mapDef.order || 1;
    this.damage = this.def.damage * (1 + order * 0.08);
  }

  _muzzleWorld(i = 0) {
    const local = this.citadel.muzzles[i % this.citadel.muzzles.length].clone();
    return this.citadel.group.localToWorld(local);
  }

  update(dt) {
    this.cd -= dt;
    if (this.cd > 0) return;
    const g = this.game;
    const d = this.def;
    const inRange = g.enemies.filter((e) => e.alive && e.untargetableT <= 0 && e.group.position.distanceTo(this.pos) < d.range);
    if (!inRange.length) { this.cd = 0.3; return; }
    this.cd = 1 / d.rate;
    inRange.sort((a, b) => b.dist - a.dist);
    switch (d.kind) {
      case 'volley':
      case 'royalArchers': {
        const shots = Math.min(d.shots || 2, inRange.length * 2);
        for (let i = 0; i < shots; i++) {
          const target = inRange[i % inRange.length];
          g.projectiles.push(new Projectile(g, {
            kind: 'arrow', from: this._muzzleWorld(i), target, arc: 3.5, speed: 22,
            trail: FXC.gold,
            onHit: (e2) => e2?.takeDamage(this.damage, 'arrow'),
          }));
        }
        g.audio.arrow();
        break;
      }
      case 'ballista': {
        g.projectiles.push(new Projectile(g, {
          kind: 'bolt', from: this._muzzleWorld(), target: inRange[0], speed: 30, pierce: 2,
          onHit: (e2) => e2?.takeDamage(this.damage, 'impact'),
        }));
        g.audio.longArrow();
        break;
      }
      case 'maceShock': {
        const p = this.pos;
        g.particles.burst(p.clone().setY(p.y + 2), 26, { speed: 6, up: 0.6, life: 0.7, size: 0.7, color: FXC.gold, grav: 3, spread: 4 });
        g.audio.mace();
        g.engine.addShake(0.18);
        for (const e of inRange) {
          e.takeDamage(this.damage, 'impact');
          if (!e.boss) e.stunT = Math.max(e.stunT, 0.7);
        }
        break;
      }
      case 'fireNova': {
        const p = this.pos;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          g.particles.spawn(p.x + Math.cos(a) * 2, p.y + 1.5, p.z + Math.sin(a) * 2,
            Math.cos(a) * 9, 1.2, Math.sin(a) * 9, 0.7, 0.8, 1, 0.5, 0.15, -0.5, 1.2);
        }
        g.audio.fire();
        for (const e of inRange) { e.takeDamage(this.damage, 'fire'); e.applyBurn(8, 2.0); }
        break;
      }
      case 'feathers': {
        for (let i = 0; i < 3 && i < inRange.length; i++) {
          g.projectiles.push(new Projectile(g, {
            kind: 'feather', from: this._muzzleWorld(), target: inRange[i], speed: 20,
            trail: FXC.feather,
            onHit: (e2) => e2?.takeDamage(this.damage, 'magic'),
          }));
        }
        if (this.def.heals) {
          for (const s of g.soldiersNear(this.pos, d.range)) {
            s.hp = Math.min(s.maxHp, s.hp + 6);
          }
        }
        g.audio.shimmer();
        break;
      }
      case 'chains': {
        const target = inRange[0];
        lashEffect(g, this._muzzleWorld(), target.group.position.clone().setY(target.group.position.y + 1), 0xaab2bd, 0.35);
        g.audio.chain();
        target.takeDamage(this.damage, 'impact');
        target.applySlow(0.4, 2.2);
        break;
      }
      case 'borderShot': {
        // Arash's bow: one tremendous shot down the road, piercing the column
        const target = inRange[0];
        g.audio.longArrow();
        g.engine.addShake(0.2);
        const from = this._muzzleWorld();
        for (const e of inRange) {
          lashEffect(g, from, e.group.position.clone().setY(e.group.position.y + 1), 0xffd97a, 0.4);
          e.takeDamage(this.damage * (e === target ? 1 : 0.5), 'true');
        }
        break;
      }
      default: break;
    }
  }
}
