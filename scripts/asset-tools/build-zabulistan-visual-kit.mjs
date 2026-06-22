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
  sandstone: new THREE.MeshStandardMaterial({ name: 'sandstone_warm', color: 0xb99b61, roughness: 0.92, metalness: 0.02 }),
  sandstoneDark: new THREE.MeshStandardMaterial({ name: 'sandstone_shadow', color: 0x756147, roughness: 0.96 }),
  dust: new THREE.MeshStandardMaterial({ name: 'packed_earth', color: 0x9c8051, roughness: 1 }),
  relief: new THREE.MeshStandardMaterial({ name: 'carved_relief', color: 0xd0b978, roughness: 0.86 }),
  wood: new THREE.MeshStandardMaterial({ name: 'oiled_wood', color: 0x5a3820, roughness: 0.8 }),
  woodDark: new THREE.MeshStandardMaterial({ name: 'dark_wood', color: 0x2f2016, roughness: 0.9 }),
  bronze: new THREE.MeshStandardMaterial({ name: 'aged_bronze', color: 0x8d6430, roughness: 0.52, metalness: 0.42 }),
  gold: new THREE.MeshStandardMaterial({ name: 'dulled_gold', color: 0xceaa4e, roughness: 0.38, metalness: 0.55 }),
  leather: new THREE.MeshStandardMaterial({ name: 'dark_leather', color: 0x3a2118, roughness: 0.86 }),
  clothRed: new THREE.MeshStandardMaterial({ name: 'red_wool', color: 0x8f2530, roughness: 0.9 }),
  clothGold: new THREE.MeshStandardMaterial({ name: 'ochre_wool', color: 0xb68b35, roughness: 0.9 }),
  rope: new THREE.MeshStandardMaterial({ name: 'braided_rope', color: 0x8a7045, roughness: 0.95 }),
};

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

function sphere(r, material, name, opts = {}) {
  return mesh(new THREE.SphereGeometry(r, 16, 10), material, name, opts);
}

function dodeca(r, material, name, opts = {}) {
  return mesh(new THREE.DodecahedronGeometry(r, 0), material, name, opts);
}

function wedge(width, height, depth, material, name) {
  const w = width / 2;
  const d = depth / 2;
  const verts = new Float32Array([
    -w, 0, -d, w, 0, -d, w, 0, d, -w, 0, d,
    -w, height, d, w, height, d,
  ]);
  const idx = [
    0, 1, 2, 0, 2, 3,
    3, 2, 5, 3, 5, 4,
    0, 3, 4, 0, 4, 1,
    1, 4, 5, 1, 5, 2,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mesh(geo, material, name);
}

function addStoneRing(group, radius, count, y = 0.24) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = radius + (i % 3 - 1) * 0.08;
    const stone = dodeca(0.2 + (i % 4) * 0.025, i % 2 ? mats.sandstone : mats.sandstoneDark, `edge_stone_${i}`, {
      x: Math.cos(a) * r,
      y,
      z: Math.sin(a) * r,
      ry: -a + (i % 5) * 0.08,
      rx: 0.16 + (i % 3) * 0.05,
      sx: 1.45,
      sy: 0.42,
      sz: 0.82,
    });
    group.add(stone);
  }
}

function standardFrame() {
  const g = new THREE.Group();
  g.name = 'zv_standard_frame';
  g.add(cyl(0.09, 0.12, 0.28, 12, mats.sandstoneDark, 'stone_socket', { y: 0.14 }));
  g.add(cyl(0.048, 0.06, 2.92, 10, mats.wood, 'standard_pole', { y: 1.58 }));
  g.add(cyl(0.035, 0.035, 1.02, 8, mats.woodDark, 'banner_crossbar', { y: 2.76, rz: Math.PI / 2 }));
  g.add(cyl(0.052, 0.052, 0.18, 10, mats.bronze, 'lower_ring', { y: 1.04 }));
  g.add(cyl(0.058, 0.058, 0.16, 10, mats.bronze, 'upper_ring', { y: 2.62 }));
  g.add(sphere(0.13, mats.gold, 'sun_finial', { y: 3.14, sy: 0.72 }));
  g.add(cone(0.08, 0.22, 12, mats.gold, 'spear_finial', { y: 3.33 }));
  for (let i = 0; i < 5; i++) {
    const x = -0.36 + i * 0.18;
    g.add(cyl(0.012, 0.012, 0.34 - i * 0.025, 5, mats.gold, `small_tassel_${i}`, { x, y: 2.48 - i * 0.018 }));
    g.add(sphere(0.035, mats.gold, `tassel_weight_${i}`, { x, y: 2.28 - i * 0.04 }));
  }
  return g;
}

function sandstonePad() {
  const g = new THREE.Group();
  g.name = 'zv_sandstone_pad';
  g.add(cyl(2.76, 2.94, 0.18, 24, mats.sandstoneDark, 'embedded_lower_foundation', { y: 0.09 }));
  g.add(cyl(2.26, 2.48, 0.18, 24, mats.sandstone, 'worn_upper_foundation', { y: 0.27 }));
  g.add(cyl(1.64, 1.82, 0.07, 20, mats.relief, 'center_relief_disc', { y: 0.405 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(box(1.26, 0.055, 0.2, i % 2 ? mats.relief : mats.sandstoneDark, `radial_inlay_${i}`, {
      x: Math.cos(a) * 1.2,
      y: 0.47,
      z: Math.sin(a) * 1.2,
      ry: -a,
    }));
  }
  addStoneRing(g, 2.46, 16, 0.46);
  return g;
}

function forecourtThreshold() {
  const g = new THREE.Group();
  g.name = 'zv_forecourt_threshold';
  g.add(wedge(7.6, 0.22, 1.15, mats.dust, 'packed_ramp'));
  g.add(box(8.2, 0.16, 0.34, mats.sandstoneDark, 'gate_sill_back', { y: 0.18, z: -0.52 }));
  g.add(box(7.2, 0.1, 0.26, mats.relief, 'carved_sill_front', { y: 0.32, z: -0.88 }));
  for (let i = 0; i < 7; i++) {
    g.add(box(0.07, 0.05, 0.3, mats.sandstoneDark, `sill_joint_${i}`, { x: -3 + i, y: 0.39, z: -0.88, ry: 0.12 * (i % 2 ? 1 : -1) }));
  }
  g.add(dodeca(0.46, mats.sandstoneDark, 'left_anchor_block', { x: -4.18, y: 0.31, z: -0.52, sx: 1.6, sy: 0.42, sz: 0.78 }));
  g.add(dodeca(0.46, mats.sandstoneDark, 'right_anchor_block', { x: 4.18, y: 0.31, z: -0.52, sx: 1.6, sy: 0.42, sz: 0.78 }));
  return g;
}

function cavalryTether() {
  const g = new THREE.Group();
  g.name = 'zv_cavalry_tether';
  for (const x of [-1.55, 1.55]) {
    g.add(cyl(0.08, 0.11, 0.96, 8, mats.woodDark, `post_${x < 0 ? 'left' : 'right'}`, { x, y: 0.48 }));
    g.add(cone(0.13, 0.18, 8, mats.bronze, `post_cap_${x < 0 ? 'left' : 'right'}`, { x, y: 1.05 }));
  }
  g.add(cyl(0.045, 0.045, 3.42, 8, mats.wood, 'tie_rail', { y: 0.76, rz: Math.PI / 2 }));
  g.add(box(0.76, 0.16, 0.56, mats.clothRed, 'folded_saddle_blanket', { y: 0.91, ry: 0.12 }));
  g.add(box(0.82, 0.08, 0.48, mats.leather, 'saddle_leather', { y: 1.04, z: 0.04, ry: -0.08 }));
  g.add(mesh(new THREE.TorusGeometry(0.26, 0.026, 8, 24), mats.rope, 'rope_coil', { x: -0.62, y: 0.99, z: -0.32, rx: Math.PI / 2 }));
  g.add(box(1.06, 0.28, 0.42, mats.woodDark, 'feed_trough', { x: 0.78, y: 0.17, z: -0.56 }));
  for (let i = 0; i < 3; i++) {
    const lance = cyl(0.018, 0.022, 1.9, 6, mats.wood, `resting_lance_${i}`, { x: 1.12 + i * 0.12, y: 0.98, z: 0.34, rz: 0.48 + i * 0.04 });
    g.add(lance);
    g.add(cone(0.045, 0.16, 6, mats.bronze, `resting_lance_tip_${i}`, { x: 1.48 + i * 0.12, y: 1.8 + i * 0.04, z: 0.34 }));
  }
  return g;
}

function maceMarker() {
  const g = new THREE.Group();
  g.name = 'zv_mace_marker';
  g.add(cyl(0.055, 0.07, 1.48, 8, mats.woodDark, 'marker_shaft', { x: -0.03, y: 0.74, rz: 0.12 }));
  g.add(sphere(0.23, mats.bronze, 'mace_head', { x: 0.13, y: 1.48 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(cone(0.044, 0.19, 6, mats.gold, `mace_spike_${i}`, {
      x: 0.13 + Math.cos(a) * 0.26,
      y: 1.48,
      z: Math.sin(a) * 0.26,
      ry: -a,
      rz: Math.PI / 2,
    }));
  }
  g.add(cyl(0.34, 0.4, 0.1, 12, mats.sandstoneDark, 'marker_socket', { y: 0.05 }));
  return g;
}

function roadEdgeStones() {
  const g = new THREE.Group();
  g.name = 'zv_road_edge_stones';
  const positions = [
    [-0.46, 0.08, -0.12, 0.42, 1.3, 0.34, 0.82],
    [0.08, 0.1, 0.1, -0.24, 0.92, 0.42, 1.2],
    [0.58, 0.07, -0.02, 0.1, 1.08, 0.28, 0.68],
  ];
  positions.forEach(([x, y, z, ry, sx, sy, sz], i) => {
    g.add(dodeca(0.42 - i * 0.04, i % 2 ? mats.sandstone : mats.sandstoneDark, `road_stone_${i}`, {
      x, y, z, ry, rx: 0.18 + i * 0.09, sx, sy, sz,
    }));
  });
  return g;
}

async function exportGlb(name, root) {
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const buffer = await exporter.parseAsync(root, { binary: true, trs: true, onlyVisible: true });
  writeFileSync(path.join(outDir, name), Buffer.from(buffer));
}

mkdirSync(outDir, { recursive: true });

await exportGlb('standard-frame.glb', standardFrame());
await exportGlb('sandstone-pad.glb', sandstonePad());
await exportGlb('forecourt-threshold.glb', forecourtThreshold());
await exportGlb('cavalry-tether.glb', cavalryTether());
await exportGlb('mace-marker.glb', maceMarker());
await exportGlb('road-edge-stones.glb', roadEdgeStones());

console.log(`Wrote Zabulistan visual kit assets to ${outDir}`);
