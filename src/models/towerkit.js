// Procedural Persian architecture kit. Towers are layered real buildings — platforms,
// tapered walls, buttresses, crenellations, iwans (arched portals), columns with
// Persepolis-style capitals, turquoise domes, badgirs (wind-catchers), banners, torches,
// relief bands, spear racks, shields — never toy cones.
//
// buildTower(modelKey, ageIdx) -> { group, layers: {base, mid, crown}, animated: {banners, flames, spinners}, height, radius }
// layers enable staged destruction: crown falls first, then mid, then base ruins.
import * as THREE from 'three';
import { MeshBuilder, MATS } from './materials.js';
import { cloneAssetScene } from '../core/assets.js';
import { fireMaterial } from '../fx/fire.js';

// ---------- low-level parts (operate on a MeshBuilder) ----------

function platform(b, r, h, mat = 'stoneDark', y = 0, topMat = 'stone') {
  b.box(r * 2.3, h, r * 2.3, mat, 0, y + h / 2, 0);
  b.box(r * 2.0, h, r * 2.0, topMat, 0, y + h + 0.06, 0); // top slab lip
  return y + h + 0.12;
}

function stairs(b, r, y, mat = 'stone') {
  for (let i = 0; i < 4; i++) {
    b.box(1.6, 0.22, 0.5, mat, 0, y - i * 0.22 - 0.11, r * 1.15 + i * 0.45);
  }
}

function taperedWall(b, r0, r1, h, y, mat, sides = 4) {
  if (sides === 4) {
    // 4-sided tapered tower: use cylinder with 4 segments rotated 45deg for square footprint
    const g = new THREE.CylinderGeometry(r1 * 1.32, r0 * 1.32, h, 4, 1);
    const m = new THREE.Matrix4().makeRotationY(Math.PI / 4);
    m.setPosition(0, y + h / 2, 0);
    b.add(g, mat, m);
  } else {
    b.cyl(r1, r0, h, sides, mat, 0, y + h / 2, 0);
  }
  return y + h;
}

function buttresses(b, r, h, y, mat = 'stoneDark') {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * r * 1.18, z = Math.sin(a) * r * 1.18;
    b.box(0.6, h, 0.6, mat, x, y + h / 2, z, a);
  }
}

function crenellations(b, r, y, mat = 'stone', square = true, count = 0) {
  // walkway rim
  b.box(r * 2.55, 0.28, r * 2.55, mat, 0, y + 0.14, 0);
  const n = count || (square ? 12 : 10);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = square ? r * 1.24 * Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) ** -0 : r * 1.18;
    const x = Math.cos(a) * (square ? r * 1.2 : r * 1.12);
    const z = Math.sin(a) * (square ? r * 1.2 : r * 1.12);
    // stepped Persian merlon (kongere): wide base + narrow cap
    b.box(0.5, 0.42, 0.32, mat, x, y + 0.45, z, -a);
    b.box(0.3, 0.26, 0.24, mat, x, y + 0.78, z, -a);
  }
  return y + 0.95;
}

function reliefBand(b, r, y, glow = false) {
  b.cyl(r * 1.06, r * 1.06, 0.5, 12, glow ? 'reliefGlow' : 'relief', 0, y, 0);
}

function iwan(b, r, y, h, mat = 'plaster', faceZ = 1) {
  // arched portal: frame + dark inset + arch ring
  const z = r * 1.02 * faceZ;
  b.box(1.9, h, 0.35, mat, 0, y + h / 2, z);
  b.box(1.2, h * 0.72, 0.42, 'woodDark', 0, y + h * 0.36, z);
  const arch = new THREE.TorusGeometry(0.6, 0.14, 6, 10, Math.PI);
  const m = new THREE.Matrix4();
  m.setPosition(0, y + h * 0.7, z + 0.22 * faceZ);
  b.add(arch, 'turquoise', m);
}

function column(b, x, z, h, y, mat = 'stoneWhite') {
  b.cyl(0.16, 0.2, h, 12, mat, x, y + h / 2, z);
  b.box(0.5, 0.16, 0.5, mat, x, y + h + 0.08, z);
  b.box(0.62, 0.14, 0.3, 'relief', x, y + h + 0.23, z); // twin-capital hint
}

function dome(b, r, y, mat = 'turquoise', finial = true) {
  b.sphere(r, 20, 14, mat, 0, y, 0, 1.15, Math.PI * 2, Math.PI / 2);
  b.cyl(r * 0.92, r * 1.02, 0.3, 18, 'relief', 0, y + 0.05, 0);
  if (finial) {
    b.cyl(0.05, 0.05, r * 0.55, 6, 'gold', 0, y + r * 1.15 + r * 0.2, 0);
    b.sphere(0.12, 8, 6, 'gold', 0, y + r * 1.15 + r * 0.5, 0);
  }
  return y + r * 1.2;
}

function badgir(b, y, h, mat = 'mudbrick') {
  // wind-catcher: square shaft with vertical vents
  b.box(1.1, h, 1.1, mat, 0, y + h / 2, 0);
  for (let i = 0; i < 3; i++) {
    b.box(1.2, h * 0.7, 0.08, 'woodDark', 0, y + h * 0.55, -0.4 + i * 0.4);
    b.box(0.08, h * 0.7, 1.2, 'woodDark', -0.4 + i * 0.4, y + h * 0.55, 0);
  }
  b.box(1.4, 0.18, 1.4, 'stone', 0, y + h + 0.09, 0);
  return y + h + 0.18;
}

function shieldRow(b, r, y, n = 4, mat = 'bronze') {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const x = Math.cos(a) * r * 1.27, z = Math.sin(a) * r * 1.27;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2, 0, -a + Math.PI / 2));
    m.setPosition(x, y, z);
    b.add(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10), mat, m);
  }
}

function spearRack(b, x, z, y, ry = 0) {
  b.box(0.9, 0.1, 0.25, 'wood', x, y + 0.05, z, ry);
  for (let i = 0; i < 4; i++) {
    const off = -0.3 + i * 0.2;
    b.cyl(0.025, 0.025, 1.6, 5, 'wood', x + Math.cos(ry) * off, y + 0.85, z - Math.sin(ry) * off, 0.16, 0.1);
    b.cone(0.05, 0.18, 6, 'iron', x + Math.cos(ry) * off + 0.13, y + 1.72, z - Math.sin(ry) * off);
  }
}

// ---------- dynamic parts (returned separately, animated per-frame) ----------

function makeBanner(color = 'clothRed', w = 0.9, h = 1.4, poleH = 3.2) {
  const g = new THREE.Group();
  const mats = MATS();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, poleH, 6), mats.wood);
  pole.position.y = poleH / 2;
  pole.castShadow = true;
  g.add(pole);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, w + 0.15, 5), mats.woodDark);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = poleH - 0.08;
  g.add(bar);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mats.gold);
  finial.position.y = poleH + 0.06;
  g.add(finial);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 5, 4), mats[color]);
  cloth.position.set(0, poleH - 0.12 - h / 2, 0);
  cloth.castShadow = true;
  g.add(cloth);
  g.userData.cloth = cloth;
  g.userData.base = cloth.geometry.attributes.position.array.slice();
  return g;
}

export function animateBanner(banner, time, strength = 1) {
  const cloth = banner.userData.cloth;
  const pos = cloth.geometry.attributes.position;
  const base = banner.userData.base;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const hang = (0.7 - y) * 0.5 + 0.5;
    pos.array[i * 3 + 2] = Math.sin(time * 2.6 + x * 2.2 + y * 1.3) * 0.12 * hang * strength;
    pos.array[i * 3] = x + Math.sin(time * 1.4 + y * 2.0) * 0.05 * hang * strength;
  }
  pos.needsUpdate = true;
}

function makeFlame(scale = 1) {
  const g = new THREE.Group();
  const mat = fireMaterial(); // shared procedural-fire shader (animated, flickering, bloom-lit)
  const geo = new THREE.PlaneGeometry(0.85 * scale, 1.5 * scale);
  const q1 = new THREE.Mesh(geo, mat);
  const q2 = new THREE.Mesh(geo, mat); q2.rotation.y = Math.PI / 2; // crossed quads → volume from any angle
  q1.position.y = q2.position.y = 0.62 * scale; // base sits at ~y0, tip rises
  q1.renderOrder = q2.renderOrder = 4;
  q1.frustumCulled = q2.frustumCulled = false;
  g.add(q1, q2);
  g.userData.scale = scale;
  g.userData.flame = true;
  return g;
}

function makeTorch(x, y, z, scale = 0.8) {
  const g = new THREE.Group();
  const mats = MATS();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), mats.wood);
  pole.position.y = 0.45;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.08, 0.18, 8), mats.bronze);
  cup.position.y = 0.95;
  g.add(pole, cup);
  const flame = makeFlame(scale * 0.7);
  flame.position.y = 1.05;
  g.add(flame);
  g.position.set(x, y, z);
  return { group: g, flame };
}

// ---------- tower recipes ----------
// Each recipe builds three layer groups (base, mid, crown) + dynamic parts.
// cfg: ageIdx 0..4 — grows height, adds trim/banners/gold.

const BANNER_COLORS = ['clothRed', 'clothTeal', 'clothPurple', 'clothGold', 'clothWhite'];

function genericTower(opts) {
  const {
    age = 0, wallMat = 'stone', baseMat = 'stoneDark', r = 1.5,
    floors: baseFloors = 2, crown = 'crenel', domeMat = 'turquoise', sides = 4,
    bannerColor = 'clothRed', torches = 2, shields = false, glowRelief = false, crownMat = 'stone',
    platformTopMat = 'stone', stairMat = 'stone',
  } = opts;
  // ages REBUILD the tower: Kayanian/Sasanian add whole floors, Mastery adds two —
  // an upgraded tower must read as a different building at a glance
  const floors = baseFloors + [0, 0, 1, 1, 2][age];
  const layers = { base: null, mid: null, crown: null };
  const animated = { banners: [], flames: [], spinners: [], glows: [] };

  // base layer
  let b = new MeshBuilder();
  let y = platform(b, r, 0.7, baseMat, 0, platformTopMat);
  stairs(b, r, 0.7, stairMat);
  const wallH = 2.2 + age * 0.55;
  y = taperedWall(b, r, r * 0.88, wallH, y, wallMat, sides);
  iwan(b, r * 0.95, 0.85, 1.9, 'plaster', 1);
  if (age >= 1) reliefBand(b, r * 0.94, y - 0.3, glowRelief);
  layers.base = b.build();

  // mid layer
  b = new MeshBuilder();
  let y2 = y;
  for (let f = 1; f < floors; f++) {
    const rr = Math.max(r * 0.36, r * (0.88 - f * 0.13));
    b.box(rr * 2.7, 0.3, rr * 2.7, baseMat, 0, y2 + 0.15, 0);
    y2 = taperedWall(b, rr, rr * 0.9, 1.7 + age * 0.3, y2 + 0.3, wallMat, sides);
    if (age >= 2 && f === floors - 1) reliefBand(b, rr * 0.95, y2 - 0.25, glowRelief);
    if (age >= 3) {
      // sasanian+: arrow-slit windows
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.box(0.16, 0.6, 0.1, 'woodDark', Math.cos(a) * rr * 1.0, y2 - 0.9, Math.sin(a) * rr * 1.0, -a);
      }
    }
  }
  layers.mid = b.build();

  // crown layer
  b = new MeshBuilder();
  const rc = Math.max(r * 0.36, r * (0.88 - (floors - 1) * 0.13));
  let topY = y2;
  if (crown === 'crenel') {
    topY = crenellations(b, rc, y2, wallMat === 'stoneWhite' ? 'stoneWhite' : crownMat, sides === 4);
  } else if (crown === 'dome') {
    topY = crenellations(b, rc, y2, 'stone', sides === 4);
    topY = dome(b, rc * 0.95, topY, age >= 4 ? 'gold' : domeMat) + 0.2;
  } else if (crown === 'badgir') {
    topY = crenellations(b, rc, y2, 'stone', true);
    topY = badgir(b, topY, 1.6 + age * 0.3);
  } else if (crown === 'platform') {
    b.box(rc * 3.0, 0.3, rc * 3.0, 'wood', 0, y2 + 0.15, 0);
    topY = y2 + 0.3;
  }
  if (shields || age >= 2) shieldRow(b, rc, y2 - 0.6, 4, age >= 4 ? 'gold' : 'bronze');

  // ---- age signatures: each great upgrade visibly transforms the building ----
  if (age >= 2) {
    // Kayanian: four corner turrets with turquoise caps
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const tx = Math.cos(a) * rc * 1.22, tz = Math.sin(a) * rc * 1.22;
      b.cyl(0.18, 0.22, 1.1, 8, wallMat, tx, y2 + 0.55, tz);
      b.cone(0.26, 0.5, 8, age >= 4 ? 'gold' : 'turquoise', tx, y2 + 1.35, tz);
    }
  }
  if (age >= 3) {
    // Sasanian: arched gallery ring + brick accent band below the crown
    b.cyl(rc * 1.12, rc * 1.12, 0.35, 14, 'brickRed', 0, y2 - 0.15, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const arch = new THREE.TorusGeometry(0.22, 0.05, 5, 8, Math.PI);
      const m = new THREE.Matrix4().makeRotationY(-a + Math.PI / 2);
      m.setPosition(Math.cos(a) * rc * 1.1, y2 - 0.55, Math.sin(a) * rc * 1.1);
      b.add(arch, 'stoneWhite', m);
    }
  }
  if (age >= 4) {
    // Modern Mastery: golden finial spires + glowing master-craft ring
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const sx = Math.cos(a) * rc * 0.95, sz = Math.sin(a) * rc * 0.95;
      b.cyl(0.035, 0.05, 1.5, 6, 'gold', sx, topY + 0.75, sz);
      b.sphere(0.09, 8, 6, 'gold', sx, topY + 1.55, sz);
    }
    b.cyl(rc * 1.05, rc * 1.05, 0.32, 16, 'reliefGlow', 0, y2 + 0.05, 0);
  }
  layers.crown = b.build();

  // dynamic
  const group = new THREE.Group();
  group.add(layers.base, layers.mid, layers.crown);
  if (age >= 4) {
    // mastery beacon: a softly pulsing light above the crown
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 9), MATS().featherGlow);
    beacon.position.y = topY + 2.1;
    group.add(beacon);
    animated.glows.push(beacon);
  }
  // a grand building grows with its age, beyond the extra floors
  group.scale.setScalar(1 + age * 0.05);
  const nBanners = age >= 3 ? 2 : 1;
  for (let i = 0; i < nBanners; i++) {
    const banner = makeBanner(age >= 4 ? 'clothGold' : bannerColor, 0.8, 1.3, 2.6 + age * 0.2);
    const a = Math.PI / 4 + i * Math.PI;
    banner.position.set(Math.cos(a) * rc * 1.05, topY - 0.8, Math.sin(a) * rc * 1.05);
    group.add(banner);
    animated.banners.push(banner);
  }
  for (let i = 0; i < torches; i++) {
    const a = -Math.PI / 4 + i * Math.PI;
    const t = makeTorch(Math.cos(a) * r * 1.35, 1.1, Math.sin(a) * r * 1.35, 0.8);
    group.add(t.group);
    animated.flames.push(t.flame);
  }
  return { group, layers, animated, height: topY, radius: r * 1.4 };
}

// Signature add-ons reuse the generic core then attach identity pieces.

const RECIPES = {
  watchtower: (age) => genericTower({ age, wallMat: 'stone', floors: 2, crown: 'crenel', bannerColor: 'clothRed' }),
  zabulWatchtower: (age) => {
    const t = genericTower({
      age,
      wallMat: 'brickRed',
      baseMat: 'zabulEarth',
      platformTopMat: 'zabulStone',
      stairMat: 'zabulStoneLight',
      floors: 2,
      crown: 'crenel',
      crownMat: 'mudbrick',
      bannerColor: 'clothRed',
      torches: 2,
      shields: true,
      glowRelief: age >= 2,
    });
    let b = new MeshBuilder();
    // Warm highland footings: low embedded stone, broken curbs, and cedar braces.
    b.box(4.2, 0.16, 4.2, 'zabulEarth', 0, 0.11, 0, Math.PI / 4);
    b.box(3.62, 0.18, 3.62, 'zabulStoneDark', 0, 0.32, 0, Math.PI / 4);
    b.box(2.92, 0.14, 2.92, 'zabulStone', 0, 0.53, 0, Math.PI / 4);
    const flagstone = (x, z, sx, sz, ry, mat = 'zabulStoneLight', seg = 6) => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, 0.08, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(sx, 1, sz),
      );
      b.add(new THREE.CylinderGeometry(1, 1, 0.08, seg), mat, m);
    };
    [
      [-1.65, 1.55, 0.48, 0.3, 0.32, 'zabulStoneLight', 5],
      [-0.9, 1.82, 0.36, 0.24, -0.2, 'zabulStone', 6],
      [-0.18, 1.64, 0.5, 0.25, 0.18, 'zabulStoneLight', 7],
      [0.62, 1.8, 0.42, 0.27, -0.36, 'zabulStone', 5],
      [1.45, 1.58, 0.5, 0.3, 0.22, 'zabulStoneDark', 6],
      [-1.85, -1.28, 0.42, 0.28, -0.34, 'zabulStoneDark', 5],
      [-0.98, -1.72, 0.48, 0.26, 0.24, 'zabulStone', 6],
      [0.04, -1.88, 0.38, 0.24, -0.12, 'zabulStoneLight', 7],
      [0.92, -1.7, 0.46, 0.27, 0.4, 'zabulStone', 5],
      [1.78, -1.28, 0.42, 0.29, -0.28, 'zabulStoneDark', 6],
    ].forEach(([x, z, sx, sz, ry, mat, seg]) => flagstone(x, z, sx, sz, ry, mat, seg));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (i % 2 ? 0.08 : -0.05);
      const x = Math.cos(a) * 2.08;
      const z = Math.sin(a) * 2.08;
      b.box(0.58 + (i % 3) * 0.08, 0.2, 0.34 + (i % 2) * 0.08, i % 2 ? 'zabulStone' : 'zabulStoneDark', x, 0.34, z, -a + 0.18);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(0.24, 2.7 + age * 0.2, 0.24, 'woodDark', Math.cos(a) * 1.85, 2.25, Math.sin(a) * 1.85, a);
      b.box(0.18, 2.6, 0.18, 'wood', Math.cos(a) * 1.48, 2.7, Math.sin(a) * 1.48, a, 0, 0.38);
    }
    b.cyl(1.72, 1.82, 0.34, 12, 'relief', 0, 4.0 + age * 0.25, 0);
    t.layers.base.add(b.build());

    b = new MeshBuilder();
    const deckY = t.height + 0.18;
    b.box(3.25, 0.22, 0.24, 'wood', 0, deckY, 1.26);
    b.box(3.25, 0.22, 0.24, 'wood', 0, deckY, -1.26);
    b.box(0.24, 0.22, 3.25, 'wood', 1.26, deckY, 0);
    b.box(0.24, 0.22, 3.25, 'wood', -1.26, deckY, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.box(0.28, 0.42, 0.16, i % 2 ? 'mudbrick' : 'stone', Math.cos(a) * 1.34, deckY + 0.35, Math.sin(a) * 1.34, -a);
    }
    spearRack(b, 1.38, 0.58, deckY + 0.05, Math.PI / 2);
    spearRack(b, -1.38, -0.58, deckY + 0.05, -Math.PI / 2);
    t.layers.crown.add(b.build());

    const standard = makeBanner(age >= 3 ? 'clothGold' : 'clothRed', 1.0, 1.65, 3.0 + age * 0.18);
    standard.position.set(0, Math.max(1.2, t.height - 1.0), -1.42);
    standard.rotation.y = Math.PI;
    t.group.add(standard);
    t.animated.banners.push(standard);
    return t;
  },
  reedOutpost: (age) => {
    const t = genericTower({ age, wallMat: 'mudbrick', baseMat: 'wood', floors: 1, crown: 'platform', torches: 1, bannerColor: 'clothTeal' });
    const b = new MeshBuilder();
    // reed bundles around base + stilt poles
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.cyl(0.16, 0.2, 1.6, 5, 'wood', Math.cos(a) * 1.9, 0.8, Math.sin(a) * 1.9, 0.06);
    }
    b.cone(1.9, 1.3, 8, 'wood', 0, t.height + 0.6, 0); // thatched cap
    t.layers.crown.add(b.build());
    return t;
  },
  palaceBalcony: (age) => {
    const t = genericTower({ age, wallMat: 'plaster', floors: 2, crown: 'dome', domeMat: 'lapis', bannerColor: 'clothPurple' });
    const b = new MeshBuilder();
    column(b, 1.2, 1.2, 2.0, 0.8); column(b, -1.2, 1.2, 2.0, 0.8);
    b.box(3.0, 0.2, 1.2, 'stoneWhite', 0, 2.9, 1.2); // balcony slab
    b.box(3.0, 0.5, 0.12, 'relief', 0, 3.2, 1.75);
    t.layers.mid.add(b.build());
    return t;
  },
  horizonWatch: (age) => {
    const t = genericTower({ age, wallMat: 'stoneDark', floors: 3, crown: 'platform', bannerColor: 'clothWhite', torches: 2 });
    const b = new MeshBuilder();
    // great bow platform: giant recurve bow silhouette
    b.box(0.2, 0.7, 0.2, 'woodDark', 0, t.height + 0.35, 0);
    const arc = new THREE.TorusGeometry(1.3, 0.07, 6, 14, Math.PI * 0.8);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, 0, Math.PI * 0.1));
    m.setPosition(0, t.height + 1.0, 0);
    b.add(arc, 'woodDark', m);
    t.layers.crown.add(b.build());
    return t;
  },
  brazenBastion: (age) => {
    const t = genericTower({ age, wallMat: 'stoneDark', floors: 2, crown: 'crenel', shields: true, bannerColor: 'clothGold' });
    const b = new MeshBuilder();
    // bronze plating bands + rivets
    for (let i = 0; i < 3; i++) b.cyl(1.62 - i * 0.16, 1.66 - i * 0.16, 0.32, 12, 'bronze', 0, 1.6 + i * 1.1, 0);
    t.layers.base.add(b.build());
    return t;
  },
  aerie: (age) => {
    const t = genericTower({ age, wallMat: 'stone', floors: 3, crown: 'platform', bannerColor: 'clothWhite', torches: 0 });
    const b = new MeshBuilder();
    // nest ring of woven beams + feathers
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      b.cyl(0.07, 0.07, 1.5, 5, 'wood', Math.cos(a) * 1.0, t.height + 0.4, Math.sin(a) * 1.0, Math.PI / 3, a);
    }
    b.cyl(1.15, 0.9, 0.5, 10, 'woodDark', 0, t.height + 0.3, 0);
    t.layers.crown.add(b.build());
    return t;
  },
  maceHall: (age) => {
    const t = genericTower({ age, wallMat: 'stoneDark', floors: 1, crown: 'crenel', shields: true, bannerColor: 'clothGold', glowRelief: true });
    const b = new MeshBuilder();
    // great ox-headed mace standing over the hall
    b.cyl(0.12, 0.16, 3.2, 8, 'wood', 0, t.height + 1.6, 0);
    b.box(0.85, 0.7, 0.7, 'gold', 0, t.height + 3.4, 0);
    b.cone(0.2, 0.5, 6, 'gold', 0.45, t.height + 3.75, 0); // horn
    b.cone(0.2, 0.5, 6, 'gold', -0.45, t.height + 3.75, 0);
    t.layers.crown.add(b.build());
    return t;
  },
  ironKeep: (age) => {
    const t = genericTower({ age, wallMat: 'stoneDark', floors: 2, crown: 'crenel', shields: true, bannerColor: 'clothBlack' });
    const b = new MeshBuilder();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(0.5, 3.4, 0.18, 'iron', Math.cos(a) * 1.55, 2.2, Math.sin(a) * 1.55, -a); // iron braces
    }
    // ballista arms on top
    b.box(2.4, 0.18, 0.3, 'woodDark', 0, t.height + 0.5, 0);
    b.box(0.3, 0.18, 1.8, 'woodDark', 0, t.height + 0.5, 0);
    t.layers.crown.add(b.build());
    return t;
  },
  catapult: (age) => {
    const t = genericTower({ age, wallMat: 'stone', floors: 1, crown: 'platform', bannerColor: 'clothTeal' });
    const b = new MeshBuilder();
    b.box(0.3, 2.6, 0.3, 'woodDark', -0.8, t.height + 1.3, 0, 0, 0, -0.4);
    b.box(0.3, 2.6, 0.3, 'woodDark', 0.8, t.height + 1.3, 0, 0, 0, 0.4);
    b.box(0.25, 0.25, 3.4, 'wood', 0, t.height + 1.9, 0, 0, 0.5);
    b.box(0.7, 0.5, 0.7, 'stoneDark', 0, t.height + 0.4, 1.0); // counterweight
    t.layers.crown.add(b.build());
    return t;
  },
  stoneTerrace: (age) => {
    const t = genericTower({ age, wallMat: 'stoneWhite', floors: 1, crown: 'platform', bannerColor: 'clothWhite' });
    const b = new MeshBuilder();
    column(b, 1.3, -1.3, 2.4, 1.0); column(b, -1.3, -1.3, 2.4, 1.0);
    column(b, 1.3, 1.3, 2.4, 1.0); column(b, -1.3, 1.3, 2.4, 1.0);
    b.box(3.4, 0.25, 3.4, 'stoneWhite', 0, 3.6, 0);
    for (let i = 0; i < 3; i++) b.cyl(0.45, 0.45, 0.3, 12, 'stone', -1 + i, t.height + 0.4, 0, Math.PI / 2); // stone discs
    t.layers.crown.add(b.build());
    return t;
  },
  fireAltar: (age) => {
    const t = genericTower({ age, wallMat: 'brickRed', floors: 1, crown: 'platform', torches: 4, bannerColor: 'clothGold', glowRelief: true });
    const b = new MeshBuilder();
    // chahar-taq style fire altar: 4 piers + central brazier
    b.cyl(0.7, 0.9, 0.8, 8, 'stoneDark', 0, t.height + 0.4, 0);
    b.cyl(0.95, 0.7, 0.35, 8, 'bronze', 0, t.height + 0.95, 0);
    t.layers.crown.add(b.build());
    const flame = makeFlame(1.8);
    flame.position.y = t.height + 1.1;
    t.group.add(flame);
    t.animated.flames.push(flame);
    return t;
  },
  trialGate: (age) => {
    const t = genericTower({ age, wallMat: 'stoneWhite', floors: 1, crown: 'crenel', torches: 2, bannerColor: 'clothWhite', glowRelief: true });
    const b = new MeshBuilder();
    // twin fire pylons framing a gate
    b.box(0.7, 3.6, 0.7, 'stoneWhite', -1.5, 1.8, 1.4);
    b.box(0.7, 3.6, 0.7, 'stoneWhite', 1.5, 1.8, 1.4);
    const arch = new THREE.TorusGeometry(1.5, 0.18, 8, 14, Math.PI);
    const m = new THREE.Matrix4();
    m.setPosition(0, 3.6, 1.4);
    b.add(arch, 'reliefGlow', m);
    t.layers.mid.add(b.build());
    const f1 = makeFlame(1.1); f1.position.set(-1.5, 3.8, 1.4);
    const f2 = makeFlame(1.1); f2.position.set(1.5, 3.8, 1.4);
    t.group.add(f1, f2);
    t.animated.flames.push(f1, f2);
    return t;
  },
  sealTower: (age) => {
    const t = genericTower({ age, wallMat: 'plaster', floors: 2, crown: 'dome', domeMat: 'lapis', glowRelief: true, bannerColor: 'clothPurple' });
    const b = new MeshBuilder();
    // floating script ring (relief band held by posts)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.cyl(0.05, 0.05, 1.2, 5, 'bronze', Math.cos(a) * 1.4, t.height - 0.4, Math.sin(a) * 1.4);
    }
    b.cyl(1.5, 1.5, 0.4, 16, 'reliefGlow', 0, t.height + 0.2, 0);
    t.layers.crown.add(b.build());
    return t;
  },
  chainBastion: (age) => {
    const t = genericTower({ age, wallMat: 'stoneWhite', baseMat: 'stoneDark', floors: 2, crown: 'crenel', bannerColor: 'clothWhite' });
    const b = new MeshBuilder();
    // great chains draped from the crown
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI * 2 + 0.5;
      for (let i = 0; i < 5; i++) {
        b.cyl(0.05, 0.05, 0.3, 5, 'iron',
          Math.cos(a) * (1.45 - i * 0.04), t.height - 0.3 - i * 0.45, Math.sin(a) * (1.45 - i * 0.04),
          Math.PI / 2.4, a + (i % 2) * Math.PI / 2);
      }
    }
    b.cone(1.3, 1.6, 4, 'stoneWhite', 0, t.height + 0.8, 0); // snowy peak cap
    t.layers.crown.add(b.build());
    return t;
  },
  nestTower: (age) => {
    const t = genericTower({ age, wallMat: 'stone', floors: 2, crown: 'platform', torches: 0, bannerColor: 'clothGold', glowRelief: true });
    const b = new MeshBuilder();
    // woven nest + glowing feather plumes
    b.cyl(1.5, 1.0, 0.8, 12, 'woodDark', 0, t.height + 0.4, 0);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.cyl(0.05, 0.05, 1.3, 4, 'wood', Math.cos(a) * 1.35, t.height + 0.7, Math.sin(a) * 1.35, Math.PI / 4, a);
    }
    t.layers.crown.add(b.build());
    const mats = MATS();
    for (let i = 0; i < 3; i++) {
      const feather = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.4), mats.featherGlow);
      const a = (i / 3) * Math.PI * 2;
      feather.position.set(Math.cos(a) * 0.6, t.height + 1.4, Math.sin(a) * 0.6);
      feather.rotation.y = a;
      feather.rotation.z = 0.3;
      t.group.add(feather);
      t.animated.spinners.push(feather);
    }
    return t;
  },
  commandHall: (age) => {
    const t = genericTower({ age, wallMat: 'plaster', floors: 1, crown: 'dome', domeMat: 'turquoise', bannerColor: 'clothTeal', glowRelief: true });
    const b = new MeshBuilder();
    column(b, 1.5, 1.1, 2.2, 0.8); column(b, -1.5, 1.1, 2.2, 0.8);
    b.box(3.8, 0.3, 1.4, 'stoneWhite', 0, 3.1, 1.1);
    t.layers.mid.add(b.build());
    return t;
  },
  radianceCourt: (age) => {
    const t = genericTower({ age, wallMat: 'plaster', floors: 1, crown: 'dome', domeMat: 'gold', bannerColor: 'clothGold', glowRelief: true, torches: 4 });
    return t;
  },
  grandArch: (age) => {
    const t = genericTower({ age, wallMat: 'brickRed', floors: 1, crown: 'crenel', bannerColor: 'clothPurple', glowRelief: true });
    const b = new MeshBuilder();
    // Taq Kasra-style great arch
    b.box(0.9, 4.6, 1.6, 'brickRed', -1.9, 2.3, 0);
    b.box(0.9, 4.6, 1.6, 'brickRed', 1.9, 2.3, 0);
    const arch = new THREE.TorusGeometry(1.9, 0.45, 8, 16, Math.PI);
    const m = new THREE.Matrix4();
    m.setPosition(0, 4.6, 0);
    b.add(arch, 'brickRed', m);
    t.layers.mid.add(b.build());
    return t;
  },
  caravanserai: (age) => {
    const t = genericTower({ age, wallMat: 'mudbrick', floors: 1, crown: 'badgir', bannerColor: 'clothTeal', torches: 2 });
    const b = new MeshBuilder();
    iwan(b, 1.5, 0.8, 1.8, 'mudbrick', -1);
    b.box(3.6, 0.8, 0.3, 'mudbrick', 0, 1.1, -2.0); // courtyard wall hint
    t.layers.base.add(b.build());
    return t;
  },
  rebellionForge: (age) => {
    const t = genericTower({ age, wallMat: 'stoneDark', floors: 1, crown: 'platform', bannerColor: 'clothRed', torches: 2, glowRelief: true });
    const b = new MeshBuilder();
    b.box(1.0, 0.7, 0.7, 'iron', 0.7, t.height + 0.35, 0); // anvil block
    b.box(0.5, 0.2, 0.4, 'steel', 0.7, t.height + 0.78, 0);
    b.cyl(0.55, 0.7, 1.0, 8, 'brickRed', -0.8, t.height + 0.5, 0); // furnace
    t.layers.crown.add(b.build());
    const flame = makeFlame(1.0);
    flame.position.set(-0.8, t.height + 1.1, 0);
    t.group.add(flame);
    t.animated.flames.push(flame);
    return t;
  },
  standardHall: (age) => {
    const t = genericTower({ age, wallMat: 'plaster', floors: 1, crown: 'crenel', bannerColor: 'clothGold', glowRelief: true });
    // the Derafsh: one giant banner
    const big = makeBanner('clothGold', 1.6, 2.4, 5.2);
    big.position.set(0, t.height - 0.4, 0);
    t.group.add(big);
    t.animated.banners.push(big);
    return t;
  },
  whiteFortress: (age) => {
    const t = genericTower({ age, wallMat: 'stoneWhite', baseMat: 'stoneWhite', floors: 2, crown: 'crenel', bannerColor: 'clothWhite', shields: true });
    const b = new MeshBuilder();
    b.box(2.4, 2.6, 0.4, 'stoneWhite', 0, 1.3, 1.7); // gatehouse front
    b.box(1.2, 1.9, 0.5, 'woodDark', 0, 0.95, 1.75);
    t.layers.base.add(b.build());
    return t;
  },
  spearFort: (age) => {
    const t = genericTower({ age, wallMat: 'stoneWhite', floors: 1, crown: 'crenel', bannerColor: 'clothTeal' });
    const b = new MeshBuilder();
    spearRack(b, 1.6, 1.2, 0.8, 0.4);
    spearRack(b, -1.6, 1.2, 0.8, -0.4);
    t.layers.base.add(b.build());
    return t;
  },
  stableFort: (age) => {
    const t = genericTower({ age, wallMat: 'mudbrick', floors: 1, crown: 'platform', bannerColor: 'clothBlack', torches: 2 });
    const b = new MeshBuilder();
    // stable wing with stalls
    b.box(3.6, 1.4, 1.8, 'mudbrick', 0, 0.7 + 0.7, -2.4);
    b.box(3.8, 0.3, 2.0, 'woodDark', 0, 2.25, -2.4);
    for (let i = 0; i < 3; i++) b.box(0.12, 1.0, 1.6, 'wood', -1.2 + i * 1.2, 1.4, -2.4);
    t.layers.base.add(b.build());
    return t;
  },
  barracksHall: (age) => {
    const t = genericTower({ age, wallMat: 'stone', floors: 1, crown: 'crenel', bannerColor: 'clothRed', shields: true });
    const b = new MeshBuilder();
    b.box(3.2, 1.6, 1.6, 'stone', 0, 1.5, -2.2);
    b.cone(1.4, 0.9, 4, 'wood', 0, 2.8, -2.2);
    spearRack(b, 1.8, -0.8, 0.8, 1.2);
    t.layers.base.add(b.build());
    return t;
  },
  royalGate: (age) => {
    const t = genericTower({ age, wallMat: 'brickRed', floors: 2, crown: 'crenel', bannerColor: 'clothPurple', glowRelief: true });
    const b = new MeshBuilder();
    b.box(0.8, 3.4, 0.8, 'brickRed', -1.7, 1.7, 1.3);
    b.box(0.8, 3.4, 0.8, 'brickRed', 1.7, 1.7, 1.3);
    const arch = new THREE.TorusGeometry(1.6, 0.3, 8, 14, Math.PI);
    const m = new THREE.Matrix4(); m.setPosition(0, 3.4, 1.3);
    b.add(arch, 'turquoise', m);
    b.box(2.6, 2.8, 0.25, 'woodDark', 0, 1.4, 1.3);
    t.layers.mid.add(b.build());
    return t;
  },
  warCamp: (age) => {
    const t = genericTower({ age, wallMat: 'wood', baseMat: 'wood', floors: 1, crown: 'platform', bannerColor: 'clothRed', torches: 2 });
    const b = new MeshBuilder();
    // command tent
    b.cone(1.9, 1.7, 8, 'clothRed', 0, t.height + 0.85, 0);
    b.cyl(0.06, 0.06, 2.6, 5, 'wood', 0, t.height + 1.3, 0);
    // war drums
    b.cyl(0.45, 0.45, 0.5, 10, 'clothGold', 1.6, 1.0, 1.4, Math.PI / 2);
    b.cyl(0.45, 0.45, 0.5, 10, 'clothGold', -1.6, 1.0, 1.4, Math.PI / 2);
    t.layers.crown.add(b.build());
    return t;
  },
  armorWard: (age) => {
    const t = genericTower({ age, wallMat: 'stoneDark', floors: 1, crown: 'dome', domeMat: 'bronze', bannerColor: 'clothGold', shields: true, glowRelief: true });
    const b = new MeshBuilder();
    // armor stand display: cuirass + helm on a post
    b.cyl(0.08, 0.08, 1.6, 5, 'wood', 0, t.height + 0.8, 0);
    b.box(0.8, 0.9, 0.45, 'bronze', 0, t.height + 1.3, 0);
    b.sphere(0.26, 8, 6, 'bronze', 0, t.height + 2.0, 0);
    t.layers.crown.add(b.build());
    return t;
  },
  nightGarden: (age) => {
    const t = genericTower({ age, wallMat: 'plaster', floors: 1, crown: 'platform', bannerColor: 'clothPurple', torches: 3 });
    const b = new MeshBuilder();
    // garden wall + cypress trees + pool
    b.box(3.8, 0.7, 0.25, 'plaster', 0, 1.05, 2.0);
    b.box(0.25, 0.7, 3.8, 'plaster', 2.0, 1.05, 0);
    b.cone(0.45, 1.8, 6, 'scaleDark', 1.4, 1.6 + 0.7, 1.4);
    b.cone(0.4, 1.5, 6, 'scaleDark', -1.5, 1.45 + 0.7, 1.3);
    b.cyl(0.8, 0.8, 0.15, 10, 'lapis', 0, t.height + 0.08, 0.6); // reflecting pool
    t.layers.base.add(b.build());
    return t;
  },
  courtHall: (age) => {
    const t = genericTower({ age, wallMat: 'plaster', floors: 1, crown: 'dome', domeMat: 'turquoise', bannerColor: 'clothTeal', glowRelief: true });
    const b = new MeshBuilder();
    column(b, 1.3, 1.3, 2.0, 0.8); column(b, -1.3, 1.3, 2.0, 0.8);
    b.box(0.9, 0.5, 0.9, 'clothRed', 0, 1.05, 0.9); // carpeted court seat
    t.layers.base.add(b.build());
    return t;
  },
  pitWard: (age) => {
    const t = genericTower({ age, wallMat: 'wood', baseMat: 'stoneDark', floors: 1, crown: 'platform', bannerColor: 'clothTeal', torches: 1 });
    const b = new MeshBuilder();
    // hunting hide + boar-spears + covered pit
    b.cone(1.5, 1.2, 6, 'wood', 0, t.height + 0.6, 0);
    spearRack(b, 1.5, 0.4, 0.8, 0.9);
    b.cyl(0.9, 0.9, 0.12, 10, 'woodDark', -1.6, 0.78, 1.6);
    t.layers.base.add(b.build());
    return t;
  },
  coldKeep: (age) => {
    const t = genericTower({ age, wallMat: 'stoneWhite', baseMat: 'stoneDark', floors: 2, crown: 'crenel', bannerColor: 'clothWhite' });
    const b = new MeshBuilder();
    b.cone(1.25, 1.5, 4, 'stoneWhite', 0, t.height + 0.75, 0); // snow-capped roof
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.box(0.4, 0.12, 0.6, 'stoneWhite', Math.cos(a) * 1.35, t.height + 0.1, Math.sin(a) * 1.35, -a); // snow ledges
    }
    t.layers.crown.add(b.build());
    return t;
  },
};

// Crown FX the engine attaches to a bare tower GLB (the GLBs are modeled with empty
// braziers / bare poles / flat crowns on purpose — flame + banner MOTION is engine-provided).
const GLB_FX = {
  fireAltar: { flame: 1.35, fy: 0.86 },       // flame in the empty brazier dish
  jamshidCourt: { flame: 1.15, fy: 0.88 },
  trialGate: { flame: 1.2, fy: 0.9 },         // Siyavash fire-ordeal gate (pylon flame)
  rebellionForge: { flame: 1.3, fy: 0.6 },    // Kaveh's forge furnace
  standardHall: { bannerBig: true },          // the Derafsh on the bare pole
  derafshHall: { bannerBig: true },
  radianceCourt: { torches: 4 },              // corner sconces
  nestTower: { feathers: 3 },                 // glow-quills on the nest rim
  catapult: { none: true }, maceHall: { none: true }, horizonWatch: { none: true }, // weapon is the crown
  grandArch: { none: true },                  // the bare arch is the hero element
};

// Build a tower from a GLB body + engine FX, in the buildTower-compatible shape. The GLB
// lives under the `crown` layer so the entity's staged destruction topples it. Returns null if
// the asset isn't loaded → buildTower falls back to the procedural recipe. Never-break.
export function assetTower(modelKey, ageIdx = 0) {
  const scene = cloneAssetScene('a_twr_' + modelKey);
  if (!scene) return null;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const targetH = 4.2 + ageIdx * 0.5;          // grows with age, ~matches the procedural towers
  const s = targetH / (size.y || 1);
  scene.scale.setScalar(s);
  scene.position.y = -box.min.y * s;           // sit flat on the pad
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const crown = new THREE.Group();
  crown.add(scene);
  const group = new THREE.Group();
  group.add(crown);
  const radius = Math.max(size.x, size.z) * s * 0.5;
  const animated = { banners: [], flames: [], spinners: [], glows: [] };
  const fx = GLB_FX[modelKey] || {};

  if (fx.flame) {
    const f = makeFlame(fx.flame + ageIdx * 0.12);
    f.position.set(0, targetH * (fx.fy || 0.85), 0);
    crown.add(f); animated.flames.push(f);
  }
  if (fx.bannerBig) {
    const b = makeBanner(ageIdx >= 4 ? 'clothGold' : 'clothRed', 1.1, 1.7, targetH * 0.5);
    b.position.set(0, targetH * 0.9, 0);
    crown.add(b); animated.banners.push(b);
  }
  if (fx.torches) {
    for (let i = 0; i < fx.torches; i++) {
      const a = (i / fx.torches) * Math.PI * 2 + Math.PI / 4;
      const t = makeTorch(Math.cos(a) * radius * 0.78, targetH * 0.9, Math.sin(a) * radius * 0.78, 0.8);
      crown.add(t.group); animated.flames.push(t.flame);
    }
  }
  if (fx.feathers) {
    for (let i = 0; i < fx.feathers; i++) {
      const a = (i / fx.feathers) * Math.PI * 2;
      const q = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7, 5), MATS().gold);
      q.position.set(Math.cos(a) * radius * 0.45, targetH * 1.02, Math.sin(a) * radius * 0.45);
      crown.add(q); animated.glows.push(q);
    }
  }
  if (!fx.none && !fx.flame && !fx.bannerBig && !fx.torches && !fx.feathers) {
    const b = makeBanner('clothRed', 0.7, 1.1, 1.5 + ageIdx * 0.12); // default rim banner
    b.position.set(radius * 0.55, targetH * 0.94, 0);
    crown.add(b); animated.banners.push(b);
  }
  return { group, layers: { base: new THREE.Group(), mid: new THREE.Group(), crown }, animated, height: targetH, radius };
}

export function buildTower(modelKey, ageIdx = 0) {
  const a = assetTower(modelKey, ageIdx);           // GLB body if loaded, else procedural
  if (a) { a.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return a; }
  const recipe = RECIPES[modelKey] || RECIPES.watchtower;
  const t = recipe(ageIdx);
  t.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return t;
}

export { makeBanner, makeFlame, makeTorch };
