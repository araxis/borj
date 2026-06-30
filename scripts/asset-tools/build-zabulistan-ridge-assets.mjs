import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      const bytes = Buffer.from(buffer);
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const outDir = path.join(process.cwd(), 'public', 'assets', 'scenery', 'zabulistan');

const mats = {
  cliffFace: new THREE.MeshStandardMaterial({ name: 'sunworn_highland_cliff', color: 0x9b8766, roughness: 0.96, emissive: 0x342819, emissiveIntensity: 0.08 }),
  cliffWarm: new THREE.MeshStandardMaterial({ name: 'warm_highland_edge', color: 0xb99b70, roughness: 0.93, emissive: 0x3a2c1a, emissiveIntensity: 0.08 }),
  cliffShadow: new THREE.MeshStandardMaterial({ name: 'highland_crevice_shadow', color: 0x746853, roughness: 1, emissive: 0x2e261a, emissiveIntensity: 0.1 }),
  cliffOchre: new THREE.MeshStandardMaterial({ name: 'ochre_strata_face', color: 0x9f8057, roughness: 0.98, emissive: 0x332416, emissiveIntensity: 0.06 }),
  dust: new THREE.MeshStandardMaterial({
    name: 'settled_highland_dust',
    color: 0xb39a70,
    roughness: 1,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    emissive: 0x2e2518,
    emissiveIntensity: 0.035,
  }),
  wood: new THREE.MeshStandardMaterial({ name: 'sun_dried_siege_wood', color: 0x765033, roughness: 0.88, emissive: 0x26170d, emissiveIntensity: 0.05 }),
  woodDark: new THREE.MeshStandardMaterial({ name: 'dark_siege_wood', color: 0x604029, roughness: 0.92, emissive: 0x22140c, emissiveIntensity: 0.07 }),
  bronze: new THREE.MeshStandardMaterial({ name: 'dull_siege_bronze', color: 0x987444, roughness: 0.58, metalness: 0.28, emissive: 0x24170a, emissiveIntensity: 0.04 }),
  clothRed: new THREE.MeshStandardMaterial({ name: 'dusty_red_standard', color: 0x933337, roughness: 0.95, emissive: 0x2a0909, emissiveIntensity: 0.04 }),
  clothGold: new THREE.MeshStandardMaterial({ name: 'dusty_ochre_standard', color: 0xb38c3f, roughness: 0.95, emissive: 0x2c2008, emissiveIntensity: 0.04 }),
  rope: new THREE.MeshStandardMaterial({ name: 'weathered_rope', color: 0x8a7049, roughness: 0.98, emissive: 0x241a0f, emissiveIntensity: 0.04 }),
};

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function mesh(geometry, material, name, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, material, name, opts = {}) {
  return mesh(new THREE.BoxGeometry(w, h, d), material, name, opts);
}

function cyl(r1, r2, h, seg, material, name, opts = {}) {
  return mesh(new THREE.CylinderGeometry(r1, r2, h, seg), material, name, opts);
}

function cone(r, h, seg, material, name, opts = {}) {
  return mesh(new THREE.ConeGeometry(r, h, seg), material, name, opts);
}

function torus(major, minor, material, name, opts = {}) {
  return mesh(new THREE.TorusGeometry(major, minor, 8, 28), material, name, opts);
}

function irregularPlate(name, points, height, material, y = 0, bevel = 0) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, y + height / 2, 0);
  geo.computeVertexNormals();
  const plate = mesh(geo, material, name);
  plate.castShadow = false;
  plate.receiveShadow = false;
  return plate;
}

function facetedRock(name, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seed = 1, material = mats.cliffFace, leanX = 0, leanZ = 0, ry = 0, rx = 0, rz = 0 } = {}) {
  const rng = mulberry32(seed);
  const sides = 8 + (seed % 3);
  const levels = [
    { y: 0, r: 0.78 },
    { y: 0.32, r: 1.04 },
    { y: 0.68, r: 0.9 },
    { y: 1, r: 0.42 },
  ];
  const verts = [];
  for (const level of levels) {
    const phase = rng() * 0.5;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + phase;
      const radius = level.r * (0.76 + rng() * 0.38);
      const lx = Math.cos(a) * radius + leanX * level.y;
      const lz = Math.sin(a) * radius + leanZ * level.y;
      verts.push(lx, level.y, lz);
    }
  }
  const idx = [];
  for (let ring = 0; ring < levels.length - 1; ring++) {
    const a = ring * sides;
    const b = (ring + 1) * sides;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      idx.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  }
  for (let i = 1; i < sides - 1; i++) idx.push(0, i, i + 1);
  const top = (levels.length - 1) * sides;
  for (let i = 1; i < sides - 1; i++) idx.push(top, top + i + 1, top + i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mesh(geo, material, name, { x, y, z, sx, sy, sz, ry, rx, rz });
}

function addStrata(group, prefix, x, y, z, width, count, seed, side = 1) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const layerY = y + 0.28 + i * 0.32 + rng() * 0.08;
    const w = width * (0.42 + rng() * 0.34);
    group.add(box(w, 0.045 + rng() * 0.025, 0.08, i % 2 ? mats.cliffWarm : mats.cliffOchre, `${prefix}_strata_${i}`, {
      x: x + (rng() - 0.5) * width * 0.28,
      y: layerY,
      z: z + side * (0.42 + rng() * 0.12),
      rz: (rng() - 0.5) * 0.16,
      ry: (rng() - 0.5) * 0.12,
    }));
  }
}

function addScree(group, prefix, count, spreadX, spreadZ, seed, y = 0.1) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * spreadX;
    const z = (rng() - 0.5) * spreadZ;
    const s = 0.16 + rng() * 0.22;
    group.add(facetedRock(`${prefix}_scree_${i}`, {
      x,
      y: y + rng() * 0.08,
      z,
      sx: s * (1.2 + rng() * 0.9),
      sy: s * (0.34 + rng() * 0.24),
      sz: s * (0.72 + rng() * 0.7),
      seed: seed + i * 19,
      material: i % 4 === 0 ? mats.cliffShadow : i % 3 === 0 ? mats.cliffWarm : mats.cliffFace,
      ry: rng() * Math.PI * 2,
      rx: (rng() - 0.5) * 0.28,
      rz: (rng() - 0.5) * 0.22,
    }));
  }
}

function cliffShoulderSet() {
  const g = new THREE.Group();
  g.name = 'zv_cliff_shoulder_set';
  const shadow = [
    [-2.9, -1.15], [-1.7, -1.42], [-0.15, -1.32], [1.45, -1.2],
    [2.85, -0.72], [2.48, 0.72], [1.04, 1.18], [-0.85, 1.08],
    [-2.44, 0.58],
  ];
  g.add(irregularPlate('cliff_shoulder_settled_shadow', shadow, 0.06, mats.dust, 0, 0.01));
  const placements = [
    [-2.18, -0.16, 0.62, 0.9, 1.25, 1.15, 4001, mats.cliffShadow, -0.2],
    [-1.12, 0.12, 0.72, 0.78, 1.65, 1.28, 4002, mats.cliffFace, 0.1],
    [0.06, -0.02, 0.82, 0.94, 1.92, 1.14, 4003, mats.cliffWarm, -0.05],
    [1.22, 0.18, 0.66, 0.82, 1.45, 1.18, 4004, mats.cliffFace, 0.16],
    [2.16, -0.02, 0.52, 0.7, 1.1, 0.98, 4005, mats.cliffShadow, -0.12],
  ];
  for (const [x, z, y, sx, sy, sz, seed, material, lean] of placements) {
    g.add(facetedRock(`cliff_shoulder_mass_${seed}`, { x, y: 0.06, z, sx, sy, sz, seed, material, leanX: lean, leanZ: -0.08, ry: (seed % 5) * 0.14, rz: (seed % 3 - 1) * 0.08 }));
    addStrata(g, `cliff_shoulder_mass_${seed}`, x, 0.08, z, sx * 1.55, 3, seed + 33, z >= 0 ? 1 : -1);
  }
  addScree(g, 'cliff_shoulder', 26, 5.8, 2.4, 4100, 0.06);
  return g;
}

function outerRidgeWallSet() {
  const g = new THREE.Group();
  g.name = 'zv_outer_ridge_wall_set';
  const base = [
    [-4.55, -1.12], [-3.18, -1.58], [-1.3, -1.42], [0.55, -1.55],
    [2.35, -1.2], [4.35, -0.62], [4.12, 0.92], [2.36, 1.45],
    [0.18, 1.22], [-2.05, 1.4], [-4.25, 0.62],
  ];
  g.add(irregularPlate('outer_ridge_settled_shadow', base, 0.08, mats.dust, 0, 0.012));
  const masses = [
    [-3.65, -0.25, 0.9, 0.8, 2.25, 1.22, 5201, mats.cliffShadow],
    [-2.45, 0.12, 1.05, 0.88, 3.1, 1.34, 5202, mats.cliffFace],
    [-1.12, -0.1, 1.0, 0.98, 2.65, 1.2, 5203, mats.cliffWarm],
    [0.22, 0.06, 1.16, 0.92, 3.55, 1.32, 5204, mats.cliffShadow],
    [1.52, -0.16, 1.02, 0.86, 2.85, 1.18, 5205, mats.cliffFace],
    [2.78, 0.1, 1.08, 0.96, 3.28, 1.3, 5206, mats.cliffWarm],
    [3.82, -0.02, 0.78, 0.72, 2.1, 1.02, 5207, mats.cliffShadow],
  ];
  for (const [x, z, y, sx, sy, sz, seed, material] of masses) {
    const lean = (x < 0 ? -0.12 : 0.12) + (seed % 2 ? 0.06 : -0.04);
    g.add(facetedRock(`outer_ridge_mass_${seed}`, { x, y: 0.04, z, sx, sy, sz, seed, material, leanX: lean, leanZ: 0.08, ry: (seed % 7) * 0.09, rz: (seed % 5 - 2) * 0.04 }));
    addStrata(g, `outer_ridge_mass_${seed}`, x, 0.1, z, sx * 1.62, 3, seed + 80, z >= 0 ? 1 : -1);
  }
  for (const [i, x] of [-3.1, -1.72, 0.72, 2.28, 3.42].entries()) {
    g.add(facetedRock(`outer_ridge_broken_spire_${i}`, {
      x,
      y: 0.18,
      z: 0.42 + (i % 2) * 0.2,
      sx: 0.34 + (i % 2) * 0.08,
      sy: 2.2 + (i % 3) * 0.45,
      sz: 0.48,
      seed: 5400 + i,
      material: i % 2 ? mats.cliffFace : mats.cliffShadow,
      leanX: (i - 2) * 0.08,
      leanZ: -0.2,
      rz: -0.16 + i * 0.08,
    }));
  }
  addScree(g, 'outer_ridge', 34, 8.4, 2.6, 5500, 0.06);
  return g;
}

function siegeFrame(group, prefix, x, z, scale, side = 1) {
  const s = scale;
  group.add(box(1.76 * s, 0.22 * s, 0.5 * s, mats.woodDark, `${prefix}_sill`, { x, y: 0.36 * s, z, rz: side * 0.08 }));
  for (const dx of [-0.62, 0.62]) {
    group.add(cyl(0.055 * s, 0.065 * s, 1.9 * s, 7, mats.wood, `${prefix}_upright_${dx}`, { x: x + dx * s, y: 1.18 * s, z: z - 0.18 * s, rz: side * (dx < 0 ? -0.18 : 0.18), rx: 0.08 }));
  }
  group.add(cyl(0.04 * s, 0.045 * s, 1.64 * s, 7, mats.woodDark, `${prefix}_cross_a`, { x, y: 1.5 * s, z: z - 0.14 * s, rz: side * 0.22, ry: Math.PI / 2 }));
  group.add(cyl(0.035 * s, 0.04 * s, 1.42 * s, 7, mats.woodDark, `${prefix}_cross_b`, { x, y: 2.02 * s, z: z - 0.08 * s, rz: side * -0.16, ry: Math.PI / 2 }));
  for (const dx of [-0.66, 0.66]) {
    group.add(cyl(0.2 * s, 0.2 * s, 0.11 * s, 16, mats.wood, `${prefix}_wheel_${dx}`, { x: x + dx * s, y: 0.18 * s, z: z + 0.33 * s, rx: Math.PI / 2 }));
  }
}

function palisade(group, prefix, x, z, side, count = 5) {
  for (let i = 0; i < count; i++) {
    const dz = -1.34 + i * 0.56;
    const px = x + side * ((i % 2) * 0.18);
    group.add(cyl(0.05, 0.06, 1.6 + (i % 3) * 0.16, 6, i % 2 ? mats.woodDark : mats.wood, `${prefix}_post_${i}`, {
      x: px,
      y: 0.78,
      z: z + dz,
      rz: side * 0.08,
      rx: 0.08 * side,
    }));
    group.add(cone(0.1, 0.3, 6, mats.wood, `${prefix}_tip_${i}`, { x: px, y: 1.68 + (i % 3) * 0.16, z: z + dz, rz: side * 0.08 }));
  }
  group.add(cyl(0.032, 0.032, 2.7, 7, mats.rope, `${prefix}_low_lash`, { x: x + side * 0.08, y: 0.88, z, rx: Math.PI / 2, rz: side * 0.08 }));
  group.add(cyl(0.034, 0.034, 2.38, 7, mats.woodDark, `${prefix}_upper_lash`, { x: x + side * 0.12, y: 1.32, z, rx: Math.PI / 2, rz: side * 0.06 }));
}

function standard(group, prefix, x, z, material, side) {
  group.add(cyl(0.035, 0.04, 1.98, 7, mats.woodDark, `${prefix}_pole`, { x, y: 1.06, z }));
  group.add(box(0.42, 0.62, 0.055, material, `${prefix}_cloth`, { x: x + side * 0.2, y: 1.55, z: z + 0.04, rz: side * 0.08 }));
  group.add(cone(0.075, 0.19, 8, mats.bronze, `${prefix}_finial`, { x, y: 2.1, z }));
}

function gateCliffSiegeSet() {
  const g = new THREE.Group();
  g.name = 'zv_gate_cliff_siege_set';
  const shadow = [
    [-4.4, -3.0], [-2.2, -3.46], [0, -3.28], [2.3, -3.25],
    [4.36, -2.45], [4.15, 1.96], [2.35, 3.95], [0.3, 4.36],
    [-2.28, 3.76], [-4.12, 1.7],
  ];
  g.add(irregularPlate('gate_depth_settled_shadow', shadow, 0.07, mats.dust, 0, 0.012));

  const masses = [
    [-3.6, -2.24, 0.65, 1.24, 1.82, 1.12, 6201, mats.cliffShadow],
    [-3.74, 0.58, 0.78, 1.34, 2.2, 1.2, 6202, mats.cliffFace],
    [-2.38, 2.78, 0.54, 1.05, 1.48, 0.96, 6203, mats.cliffWarm],
    [3.4, -1.92, 0.64, 1.22, 1.72, 1.1, 6204, mats.cliffFace],
    [3.62, 0.82, 0.72, 1.42, 2.05, 1.24, 6205, mats.cliffShadow],
    [2.14, 3.04, 0.52, 1.02, 1.36, 0.9, 6206, mats.cliffWarm],
    [-0.52, 3.82, 0.38, 1.5, 0.92, 0.72, 6207, mats.cliffFace],
    [0.48, -3.86, 0.36, 1.58, 0.86, 0.66, 6208, mats.cliffWarm],
  ];
  for (const [x, z, y, sx, sy, sz, seed, material] of masses) {
    g.add(facetedRock(`gate_depth_cliff_mass_${seed}`, {
      x,
      y: 0.06,
      z,
      sx,
      sy,
      sz,
      seed,
      material,
      leanX: x * 0.035,
      leanZ: z * 0.035,
      ry: (seed % 9) * 0.08,
      rz: (seed % 5 - 2) * 0.05,
    }));
    addStrata(g, `gate_depth_cliff_mass_${seed}`, x, 0.08, z, sx * 1.48, 2, seed + 45, z >= 0 ? 1 : -1);
  }

  for (const [i, spec] of [
    [-3.0, -0.84, 1.52, 0.92, 1.0, -0.06],
    [3.0, -0.46, 1.42, 0.96, 0.92, 0.08],
    [-2.16, 2.16, 1.24, 0.82, 0.82, 0.14],
    [2.02, 2.36, 1.14, 0.78, 0.76, -0.12],
  ].entries()) {
    const [x, z, w, d, y, rz] = spec;
    g.add(box(w, 0.13, d, i % 2 ? mats.cliffWarm : mats.cliffFace, `gate_depth_cut_terrace_${i}`, { x, y, z, rz, rx: 0.03 }));
  }

  palisade(g, 'gate_depth_left_palisade', -2.6, -1.05, -1, 5);
  palisade(g, 'gate_depth_right_palisade', 2.6, -1.05, 1, 5);
  siegeFrame(g, 'gate_depth_left_siege', -1.38, 1.42, 0.96, -1);
  siegeFrame(g, 'gate_depth_right_siege', 1.42, 1.56, 0.92, 1);
  standard(g, 'gate_depth_red_standard', -2.58, 1.9, mats.clothRed, -1);
  standard(g, 'gate_depth_gold_standard', 2.5, 2.0, mats.clothGold, 1);
  g.add(torus(0.22, 0.022, mats.rope, 'gate_depth_rope_coil', { x: -0.82, y: 0.18, z: 1.12, rx: Math.PI / 2 }));
  addScree(g, 'gate_depth', 34, 8.3, 6.8, 6400, 0.04);
  return g;
}

async function exportGlb(name, root) {
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const buffer = await exporter.parseAsync(root, { binary: true, trs: true, onlyVisible: true });
  writeFileSync(path.join(outDir, name), Buffer.from(buffer));
}

mkdirSync(outDir, { recursive: true });
await exportGlb('cliff-shoulder-set.glb', cliffShoulderSet());
await exportGlb('outer-ridge-wall-set.glb', outerRidgeWallSet());
await exportGlb('gate-cliff-siege-set.glb', gateCliffSiegeSet());
console.log(`Wrote Zabulistan ridge assets to ${outDir}`);
