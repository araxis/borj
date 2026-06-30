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
  stone: new THREE.MeshStandardMaterial({ name: 'warm_gate_stone', color: 0x8d7551, roughness: 0.94 }),
  stoneLight: new THREE.MeshStandardMaterial({ name: 'sunworn_gate_stone', color: 0xb09263, roughness: 0.9 }),
  stoneDark: new THREE.MeshStandardMaterial({ name: 'aged_gate_shadow_stone', color: 0x66533a, roughness: 0.98 }),
  recess: new THREE.MeshStandardMaterial({ name: 'warm_gate_recess', color: 0x4d3824, roughness: 1 }),
  dust: new THREE.MeshStandardMaterial({ name: 'settled_gate_dust', color: 0x7b6546, roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ name: 'dark_oiled_gate_wood', color: 0x52311c, roughness: 0.84 }),
  woodLight: new THREE.MeshStandardMaterial({ name: 'rubbed_gate_wood_edge', color: 0x6c4328, roughness: 0.8 }),
  bronze: new THREE.MeshStandardMaterial({ name: 'aged_gate_bronze', color: 0x886237, roughness: 0.5, metalness: 0.32 }),
  turquoise: new THREE.MeshStandardMaterial({ name: 'aged_gate_glaze', color: 0x2e776f, roughness: 0.8, metalness: 0.04 }),
  clothRed: new THREE.MeshStandardMaterial({ name: 'worn_gate_red_wool', color: 0x7f2429, roughness: 0.95 }),
  clothGold: new THREE.MeshStandardMaterial({ name: 'worn_gate_ochre_wool', color: 0xa77f30, roughness: 0.95 }),
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

function dodeca(r, material, name, opts = {}) {
  return mesh(new THREE.DodecahedronGeometry(r, 0), material, name, opts);
}

function trapezoidPrism(bottomW, topW, h, d, material, name, opts = {}) {
  const bw = bottomW / 2;
  const tw = topW / 2;
  const hh = h / 2;
  const dd = d / 2;
  const verts = new Float32Array([
    -bw, -hh, -dd, bw, -hh, -dd, bw, -hh, dd, -bw, -hh, dd,
    -tw, hh, -dd, tw, hh, -dd, tw, hh, dd, -tw, hh, dd,
  ]);
  const idx = [
    0, 1, 2, 0, 2, 3,
    4, 7, 6, 4, 6, 5,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mesh(geo, material, name, opts);
}

function archWallGeometry(width, height, depth, openingW, springY, bottomY) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.lineTo(-width / 2, 0);

  const hole = new THREE.Path();
  hole.moveTo(-openingW / 2, bottomY);
  hole.lineTo(-openingW / 2, springY);
  hole.absarc(0, springY, openingW / 2, Math.PI, 0, false);
  hole.lineTo(openingW / 2, bottomY);
  hole.lineTo(-openingW / 2, bottomY);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

function archPanelGeometry(width, springY, bottomY, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, bottomY);
  shape.lineTo(-width / 2, springY);
  shape.absarc(0, springY, width / 2, Math.PI, 0, false);
  shape.lineTo(width / 2, bottomY);
  shape.lineTo(-width / 2, bottomY);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

function palaceFacadeDressing() {
  const g = new THREE.Group();
  g.name = 'zv_palace_facade_dressing';

  const wall = mesh(
    archWallGeometry(6.6, 5.75, 0.42, 1.92, 2.88, 0.34),
    mats.stone,
    'gate_iwan_wall',
    { z: -0.02 },
  );
  g.add(wall);

  g.add(mesh(archPanelGeometry(1.98, 2.88, 0.36, 0.16), mats.recess, 'gate_warm_recess', { z: -0.32 }));

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'left' : 'right';
    g.add(trapezoidPrism(0.84, 0.64, 4.8, 0.78, side < 0 ? mats.stoneLight : mats.stone, `gate_battered_jamb_${label}`, {
      x: side * 1.54,
      y: 2.45,
      z: 0.08,
      rz: side * -0.015,
    }));
    g.add(trapezoidPrism(0.96, 0.62, 4.0, 0.92, side < 0 ? mats.stone : mats.stoneLight, `gate_outer_buttress_${label}`, {
      x: side * 2.88,
      y: 2.16,
      z: 0.0,
      rz: side * -0.04,
    }));
    g.add(box(1.72, 0.44, 0.92, mats.stoneDark, `gate_footing_${label}`, {
      x: side * 2.18,
      y: 0.25,
      z: 0.14,
      rz: side * -0.035,
    }));
  }

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'left' : 'right';
    g.add(box(0.78, 2.42, 0.14, mats.wood, `gate_door_leaf_${label}`, {
      x: side * 0.41,
      y: 1.52,
      z: 0.26,
      rz: side * 0.008,
    }));
    g.add(box(0.64, 2.1, 0.035, mats.woodLight, `gate_door_inner_wear_${label}`, {
      x: side * 0.41,
      y: 1.58,
      z: 0.345,
      rz: side * 0.008,
    }));
    for (const [i, y] of [0.76, 1.48, 2.2].entries()) {
      g.add(box(0.72, 0.085, 0.075, mats.bronze, `gate_door_band_${label}_${i}`, {
        x: side * 0.41,
        y,
        z: 0.43,
      }));
    }
  }
  g.add(box(0.075, 2.44, 0.08, mats.bronze, 'gate_center_spine', { y: 1.52, z: 0.44 }));
  g.add(box(1.78, 0.12, 0.08, mats.turquoise, 'gate_glazed_spring_line', { y: 2.92, z: 0.46 }));

  for (let i = 0; i < 13; i++) {
    const a = Math.PI * (i / 12);
    const x = Math.cos(a) * 1.32;
    const y = 2.95 + Math.sin(a) * 1.2;
    g.add(box(0.4, 0.26, 0.52, i % 3 === 1 ? mats.stoneLight : mats.stone, `gate_arch_stone_${i}`, {
      x,
      y,
      z: 0.32,
      rz: Math.PI / 2 - a,
    }));
  }

  for (const [i, y] of [4.35, 4.92, 5.48].entries()) {
    g.add(box(5.96 - i * 0.42, 0.13, 0.5, i === 1 ? mats.stoneLight : mats.stoneDark, `gate_weathered_course_${i}`, {
      y,
      z: 0.23,
      rz: (i - 1) * 0.008,
    }));
  }

  for (const [i, x] of [-2.75, -1.85, -0.92, 0.92, 1.85, 2.75].entries()) {
    g.add(box(0.52, 0.42, 0.54, i % 2 ? mats.stoneLight : mats.stone, `gate_low_parapet_chip_${i}`, {
      x,
      y: 5.95 + (i % 2) * 0.05,
      z: 0.08,
      rz: (i - 2) * 0.012,
    }));
  }

  for (const [i, x] of [-2.18, -1.18, 1.18, 2.18].entries()) {
    g.add(mesh(archPanelGeometry(0.32, 4.88 + (i % 2) * 0.2, 4.44 + (i % 2) * 0.2, 0.065), mats.recess, `gate_upper_shadow_slot_${i}`, {
      x,
      z: 0.34,
    }));
    g.add(box(0.52, 0.07, 0.08, mats.bronze, `gate_upper_slot_lintel_${i}`, {
      x,
      y: 5.08 + (i % 2) * 0.2,
      z: 0.43,
    }));
  }

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'left' : 'right';
    g.add(cyl(0.045, 0.055, 1.86, 8, mats.wood, `gate_standard_pole_${label}`, {
      x: side * 2.5,
      y: 3.55,
      z: 0.48,
      rz: side * 0.035,
    }));
    g.add(cone(0.075, 0.18, 8, mats.bronze, `gate_standard_finial_${label}`, {
      x: side * 2.5,
      y: 4.53,
      z: 0.48,
      rz: side * 0.035,
    }));
    g.add(box(0.48, 1.22, 0.055, side < 0 ? mats.clothRed : mats.clothGold, `gate_standard_cloth_${label}`, {
      x: side * 2.76,
      y: 3.34,
      z: 0.52,
      rz: side * 0.055,
    }));
  }

  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? -1 : 1;
    const row = Math.floor(i / 2);
    const x = side * (1.0 + (row % 4) * 0.58 + (i % 3) * 0.08);
    const z = 0.62 + (i % 3) * 0.08;
    g.add(dodeca(0.22 + (i % 4) * 0.025, i % 2 ? mats.stoneLight : mats.stoneDark, `gate_foot_stone_${i}`, {
      x,
      y: 0.2 + (i % 3) * 0.035,
      z,
      rx: 0.12 + i * 0.01,
      ry: i * 0.4,
      sx: 1.45,
      sy: 0.44,
      sz: 0.72,
    }));
  }

  g.add(box(6.9, 0.08, 1.42, mats.dust, 'gate_settled_threshold_shadow', { y: 0.04, z: 0.62 }));

  return g;
}

async function exportGlb(name, root) {
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const buffer = await exporter.parseAsync(root, { binary: true, trs: true, onlyVisible: true });
  writeFileSync(path.join(outDir, name), Buffer.from(buffer));
}

mkdirSync(outDir, { recursive: true });
await exportGlb('palace-facade-dressing.glb', palaceFacadeDressing());
console.log(`Wrote Zabulistan palace facade asset to ${outDir}`);
