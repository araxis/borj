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

// --- Sistan: the Simurgh feather shrine — Zal's token, a giant feather over a cairn ---
function featherShrine() {
  const b = new MeshBuilder();
  b.sphere(1.1, 6, 5, 'stone', 0, 0.3, 0, 0.8);
  b.sphere(0.8, 6, 5, 'stoneDark', 0.9, 0.25, 0.4, 0.85);
  b.sphere(0.7, 6, 5, 'stone', -0.8, 0.2, -0.4, 0.8);
  b.box(1.2, 0.35, 1.2, 'relief', 0, 1.0, 0);
  const g = b.build();
  const feather = new THREE.Group();
  const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 3.6, 5), MATS().bronze);
  quill.position.y = 1.8;
  feather.add(quill);
  const vane = MATS().gold.clone();
  vane.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 3.0), vane);
    v.position.set(side * 0.28, 2.1, 0);
    v.rotation.y = side * 0.22;
    feather.add(v);
  }
  feather.position.y = 1.1;
  feather.rotation.z = 0.16;
  g.add(feather);
  return { g };
}

// --- Kabul: Rudabeh's tower — the garden tower of the long-haired princess ---
function rudabehTower() {
  const b = new MeshBuilder();
  b.box(2.6, 0.5, 2.6, 'stone', 0, 0.25, 0);
  b.cyl(0.95, 1.15, 6.4, 8, 'plaster', 0, 3.7, 0);
  b.cyl(1.25, 1.25, 0.5, 8, 'stone', 0, 7.15, 0);
  b.cyl(0.0, 1.2, 1.5, 8, 'turquoise', 0, 8.15, 0);
  b.box(0.55, 0.9, 0.15, 'woodDark', 0, 6.3, 1.0); // her window
  const g = b.build();
  // the famous tresses: a dark cascade from the window (cloth ribbon)
  const hair = MATS().woodDark.clone();
  hair.side = THREE.DoubleSide;
  const tress = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 4.6, 1, 5), hair);
  tress.position.set(0, 4.0, 1.12);
  tress.rotation.x = 0.06;
  g.add(tress);
  return { g };
}

// --- carved tale-stele: a stone slab with relief bands (Samangan: Tahmineh's story) ---
function taleStele() {
  const b = new MeshBuilder();
  b.box(3.0, 0.5, 2.0, 'stone', 0, 0.25, 0);
  b.box(2.2, 3.6, 0.7, 'stoneDark', 0, 2.3, 0);
  for (let i = 0; i < 3; i++) b.box(2.0, 0.5, 0.76, 'relief', 0, 1.3 + i * 1.05, 0);
  b.box(2.5, 0.4, 0.9, 'stone', 0, 4.3, 0);
  return { g: b.build() };
}

// --- siege trophy: captured shields and spears raised on a frame (Dez-i Sepid, Gang-Dez) ---
function siegeTrophy() {
  const b = new MeshBuilder();
  b.box(3.4, 0.4, 1.2, 'stone', 0, 0.2, 0);
  b.cyl(0.09, 0.11, 3.4, 6, 'woodDark', -1.1, 2.0, 0);
  b.cyl(0.09, 0.11, 3.4, 6, 'woodDark', 1.1, 2.0, 0);
  b.box(2.7, 0.16, 0.16, 'wood', 0, 3.5, 0);
  const g = b.build();
  for (let i = 0; i < 3; i++) {
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.09, 10), i === 1 ? MATS().bronze : MATS().iron);
    shield.rotation.x = Math.PI / 2;
    shield.position.set(-0.9 + i * 0.9, 2.6, 0.1);
    g.add(shield);
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.8, 5), MATS().wood);
    spear.position.set(-0.9 + i * 0.9, 2.0, -0.18);
    spear.rotation.z = (i - 1) * 0.18;
    g.add(spear);
  }
  return { g };
}

// --- Alborz: the Simurgh's nest — a rock spire crowned with a great nest of boughs ---
function simurghNest() {
  const b = new MeshBuilder();
  b.cyl(1.2, 2.6, 7.5, 7, 'stoneDark', 0, 3.75, 0);
  b.cyl(0.9, 1.3, 2.5, 6, 'stone', 0, 8.7, 0);
  const g = b.build();
  const wood = MATS().woodDark;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.2, 4), wood);
    bough.position.set(Math.cos(a) * 1.1, 10.1, Math.sin(a) * 1.1);
    bough.rotation.set(Math.PI / 2.4, 0, a + Math.PI / 2);
    g.add(bough);
  }
  const feather = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.6), MATS().gold.clone());
  feather.material.side = THREE.DoubleSide;
  feather.position.set(0.8, 10.9, 0);
  feather.rotation.z = 0.5;
  g.add(feather);
  return { g };
}

// --- Turan: the war-drums of Afrasiab — a dark platform with great kettledrums ---
function warDrums() {
  const b = new MeshBuilder();
  b.box(4.2, 0.6, 3.0, 'stoneDark', 0, 0.3, 0);
  b.cyl(0.9, 1.1, 1.3, 9, 'wood', -1.2, 1.25, 0);
  b.cyl(0.9, 1.1, 1.3, 9, 'wood', 1.2, 1.25, 0);
  b.cyl(0.92, 0.92, 0.08, 9, 'plaster', -1.2, 1.95, 0);
  b.cyl(0.92, 0.92, 0.08, 9, 'plaster', 1.2, 1.95, 0);
  b.cyl(0.05, 0.05, 2.8, 5, 'woodDark', 0, 1.7, -1.2, 0.4);
  const g = b.build();
  const cloth = MATS().clothRed.clone();
  cloth.side = THREE.DoubleSide;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), cloth);
  banner.position.set(0, 2.6, -1.35);
  g.add(banner);
  return { g };
}

// --- Balkh: the eternal flame — a fire altar of the old faith, never extinguished ---
function eternalFlame() {
  const b = new MeshBuilder();
  b.box(2.6, 0.5, 2.6, 'stone', 0, 0.25, 0);
  b.cyl(0.55, 0.8, 2.6, 7, 'stoneDark', 0, 1.8, 0);
  b.cyl(1.0, 0.7, 0.55, 8, 'bronze', 0, 3.35, 0);
  const g = b.build();
  const fl = makeFlame(1.5);
  fl.position.set(0, 3.6, 0);
  g.add(fl);
  return { g, flames: [fl] };
}

// --- Dez-i Roein: the brazen disc — a vast bronze shield-face of the Brazen Hold ---
function brazenDisc() {
  const b = new MeshBuilder();
  b.box(3.2, 0.5, 1.6, 'stone', 0, 0.25, 0);
  b.box(0.5, 3.6, 0.5, 'stoneDark', 0, 2.0, 0);
  const g = b.build();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.2, 14), MATS().bronze);
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 3.4;
  g.add(disc);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), MATS().gold);
  boss.position.set(0, 3.4, 0.15);
  g.add(boss);
  return { g };
}

// --- Manijeh's Garden: Bijan's pit — the stone of Akvan over the lightless hole ---
function bijansPit() {
  const b = new MeshBuilder();
  b.cyl(1.6, 1.8, 0.5, 10, 'stoneDark', 0, 0.25, 0);
  b.sphere(1.5, 7, 5, 'stone', 2.3, 1.1, 0.4, 0.9); // the great boulder rolled beside it
  const g = b.build();
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.1, 10),
    new THREE.MeshBasicMaterial({ color: 0x0a0806 }),
  );
  hole.position.y = 0.52;
  g.add(hole);
  const iron = MATS().iron;
  for (let i = 0; i < 4; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 10), iron);
    link.position.set(1.2 + i * 0.35, 0.55 + i * 0.12, 0.3);
    link.rotation.set(0.3 + (i % 2) * 1.4, 0.4, 0);
    g.add(link);
  }
  return { g };
}

// --- Estakhr: the broken colonnade — Persepolis columns against the sky ---
function persepolisColumns() {
  const b = new MeshBuilder();
  b.box(6.5, 0.6, 3.0, 'stone', 0, 0.3, 0);
  const heights = [6.5, 4.2, 6.5, 2.4];
  for (let i = 0; i < heights.length; i++) {
    const x = -2.4 + i * 1.6;
    b.cyl(0.32, 0.4, heights[i], 9, 'plaster', x, 0.6 + heights[i] / 2, 0);
    if (heights[i] > 5) {
      b.box(0.9, 0.4, 0.9, 'stone', x, 0.6 + heights[i] + 0.2, 0);
      b.box(1.2, 0.35, 0.5, 'relief', x, 0.6 + heights[i] + 0.55, 0);
    }
  }
  return { g: b.build() };
}

// --- Madayen: the fallen arch — a broken sweep of Taq Kasra brickwork ---
function fallenArch() {
  const b = new MeshBuilder();
  b.box(2.2, 5.2, 1.6, 'stone', -2.8, 2.6, 0);
  b.box(2.2, 3.0, 1.6, 'stone', 2.8, 1.5, 0);
  const g = b.build();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.55, 7, 14, Math.PI * 0.62), MATS().stone);
  arc.position.set(-1.05, 4.4, 0);
  arc.rotation.z = 0.1;
  g.add(arc);
  // rubble from the fallen half
  const rubbleMat = MATS().stoneDark;
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + (i % 2) * 0.3, 0), rubbleMat);
    r.position.set(1.4 + i * 0.7, 0.35, (i % 2) * 0.9 - 0.4);
    g.add(r);
  }
  return { g };
}

// --- Gordafarid's fort: her planted lance and shield — the woman-warrior's challenge ---
function heroLance() {
  const b = new MeshBuilder();
  b.box(2.0, 0.4, 2.0, 'stone', 0, 0.2, 0);
  const g = b.build();
  const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 5.6, 6), MATS().wood);
  lance.position.y = 3.0;
  lance.rotation.z = 0.08;
  g.add(lance);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 6), MATS().iron);
  tip.position.set(0.44, 5.9, 0);
  tip.rotation.z = 0.08;
  g.add(tip);
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 10), MATS().bronze);
  shield.rotation.x = Math.PI / 2.4;
  shield.position.set(-0.5, 0.75, 0.4);
  g.add(shield);
  const cloth = MATS().clothGold.clone();
  cloth.side = THREE.DoubleSide;
  const pennant = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), cloth);
  pennant.position.set(0.75, 5.1, 0);
  g.add(pennant);
  return { g };
}

// --- Makran: the caravan milestone — a waymarker on the long southern road ---
function milestone() {
  const b = new MeshBuilder();
  b.box(1.8, 0.4, 1.8, 'stone', 0, 0.2, 0);
  b.cyl(0.5, 0.65, 3.2, 7, 'stone', 0, 2.0, 0);
  b.box(0.8, 0.5, 0.12, 'bronze', 0, 2.6, 0.62);
  b.cyl(0.62, 0.62, 0.3, 7, 'stoneDark', 0, 3.75, 0);
  return { g: b.build() };
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
  sistan: [{ build: featherShrine, place: 'clear', band: [24, 44] }],
  kabul: [{ build: rudabehTower, place: 'roadside', f: 0.42, off: 11 }],
  samangan: [{ build: taleStele, place: 'roadside', f: 0.3, off: 9 }],
  'dez-sepid': [{ build: siegeTrophy, place: 'roadside', f: 0.55, off: 10 }],
  alborz: [{ build: simurghNest, place: 'clear', band: [30, 55] }],
  turan: [{ build: warDrums, place: 'clear', band: [24, 45] }],
  balkh: [{ build: eternalFlame, place: 'roadside', f: 0.45, off: 9 }],
  'dez-roein': [{ build: brazenDisc, place: 'clear', band: [24, 45] }],
  'manijeh-garden': [{ build: bijansPit, place: 'clear', band: [24, 42] }],
  estakhr: [{ build: persepolisColumns, place: 'clear', band: [26, 48] }],
  madayen: [{ build: fallenArch, place: 'clear', band: [26, 48] }],
  'dez-bahman': [{ build: taleStele, place: 'clear', band: [24, 44] }],
  'gang-dez': [{ build: siegeTrophy, place: 'clear', band: [24, 45] }],
  'gordafarid-fort': [{ build: heroLance, place: 'roadside', f: 0.5, off: 9 }],
  makran: [{ build: milestone, place: 'roadside', f: 0.38, off: 8 }],
};

// ---- B2: the Derafsh-e Kaviani and enemy faction war-banners -----------------------

// the royal standard: violet field, gold sunburst, jeweled border, tasseled fringe —
// all painted into the cloth texture so it deforms with the banner wave
function derafshTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#3b2a63';
  g.fillRect(0, 0, 256, 168);
  g.strokeStyle = '#d8a93e'; g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 158);
  // sunburst
  g.fillStyle = '#e9c46a';
  g.beginPath(); g.arc(128, 84, 30, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e9c46a'; g.lineWidth = 7;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 38, 84 + Math.sin(a) * 38);
    g.lineTo(128 + Math.cos(a) * 62, 84 + Math.sin(a) * 62);
    g.stroke();
  }
  // corner gems
  g.fillStyle = '#c23b2a';
  for (const [x, y] of [[24, 24], [232, 24], [24, 144], [232, 144]]) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); }
  // tasseled fringe
  for (let i = 0; i < 16; i++) {
    g.fillStyle = ['#c23b2a', '#e9c46a', '#3b2a63'][i % 3];
    g.fillRect(i * 16 + 3, 168, 10, 24);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeDerafshKaviani() {
  const g = new THREE.Group();
  const mats = MATS();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 10.5, 7), mats.gold);
  pole.position.y = 5.25;
  g.add(pole);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5), mats.bronze);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 10.1;
  g.add(bar);
  // crescent-and-orb finial
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mats.gold);
  orb.position.y = 10.75;
  g.add(orb);
  const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 12, Math.PI), mats.gold);
  crescent.position.y = 11.0;
  g.add(crescent);
  const clothMat = new THREE.MeshStandardMaterial({
    map: derafshTexture(), roughness: 0.85, side: THREE.DoubleSide,
  });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4, 8, 6), clothMat);
  cloth.position.y = 10.0 - 1.25;
  g.add(cloth);
  g.userData.cloth = cloth;
  g.userData.base = cloth.geometry.attributes.position.array.slice();
  return g;
}

// torn faction war-banner: dark field + crude sigil per adversary family, tilted stake
function factionTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 192;
  const g = c.getContext('2d');
  const field = { div: '#241b30', zahhak: '#1c2a1c', turan: '#191919', raider: '#4a1713' }[kind] || '#4a1713';
  g.fillStyle = field;
  g.fillRect(0, 0, 128, 192);
  // ragged bottom edge
  g.clearRect(0, 176, 128, 16);
  g.fillStyle = field;
  for (let i = 0; i < 8; i++) g.fillRect(i * 16, 176, 10, 8 + (i % 3) * 6);
  g.strokeStyle = kind === 'zahhak' ? '#9de35b' : kind === 'div' ? '#cfc4a8' : '#b83a2a';
  g.lineWidth = 7;
  if (kind === 'div') { // horns
    g.beginPath(); g.moveTo(40, 120); g.quadraticCurveTo(28, 60, 52, 40); g.stroke();
    g.beginPath(); g.moveTo(88, 120); g.quadraticCurveTo(100, 60, 76, 40); g.stroke();
  } else if (kind === 'zahhak') { // twin serpents
    g.beginPath(); g.moveTo(48, 150); g.bezierCurveTo(20, 110, 76, 90, 48, 46); g.stroke();
    g.beginPath(); g.moveTo(80, 150); g.bezierCurveTo(108, 110, 52, 90, 80, 46); g.stroke();
  } else if (kind === 'turan') { // crescent over a slash
    g.beginPath(); g.arc(64, 74, 26, Math.PI * 0.15, Math.PI * 0.85, false); g.stroke();
    g.beginPath(); g.moveTo(34, 140); g.lineTo(94, 100); g.stroke();
  } else { // raider: jagged cross
    g.beginPath(); g.moveTo(38, 50); g.lineTo(90, 130); g.moveTo(90, 50); g.lineTo(38, 130); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FACTION_BY_STAGE = {
  mazandaran: 'div', alborz: 'div',
  damavand: 'zahhak',
  turan: 'turan', 'gang-dez': 'turan', samangan: 'turan', 'dez-sepid': 'turan', makran: 'turan',
};

function makeWarBanner(kind) {
  const g = new THREE.Group();
  const mats = MATS();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4.6, 5), mats.woodDark);
  pole.position.y = 2.3;
  g.add(pole);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5), mats.iron);
  tip.position.y = 4.75;
  g.add(tip);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.35, 4), mats.woodDark);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 4.35;
  g.add(bar);
  const clothMat = new THREE.MeshStandardMaterial({
    map: factionTexture(kind), roughness: 0.95, side: THREE.DoubleSide, transparent: true, alphaTest: 0.4,
  });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.9, 6, 6), clothMat);
  cloth.position.y = 4.3 - 1.0;
  g.add(cloth);
  g.userData.cloth = cloth;
  g.userData.base = cloth.geometry.attributes.position.array.slice();
  return g;
}

// every map: the royal standard beside the citadel + faction war-banners at each spawn
function buildFactionStandards(map, rng, group) {
  // Derafsh-e Kaviani — planted on the last defensible stretch of the incoming road.
  // The citadel's own keep-out rejects anything too close to the exit, so walk back
  // along the path until a flank point clears.
  const path = map.paths?.[0];
  if (path) {
    let planted = false;
    for (const back of [14, 20, 26, 34, 42]) {
      const s = path.samples[Math.max(0, path.samples.length - back)];
      for (const side of [1, -1]) {
        for (const off of [5.5, 7.5]) {
          const x = s.pos.x - s.tangent.z * side * off;
          const z = s.pos.z + s.tangent.x * side * off;
          if (!map._isClear(x, z, 2)) continue;
          const d = makeDerafshKaviani();
          d.position.set(x, map.heightAt(x, z), z);
          d.rotation.y = Math.atan2(s.tangent.x, s.tangent.z) + Math.PI / 2;
          group.add(d);
          map.propBanners?.push(d);
          planted = true;
          break;
        }
        if (planted) break;
      }
      if (planted) break;
    }
  }
  // enemy war-banners crowd each spawn gate — the invader's claim on the road's far end
  const kind = FACTION_BY_STAGE[map.def?.id] || 'raider';
  for (const gate of map.gates || []) {
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      const r = 3.5 + rng() * 3;
      const x = gate.position.x + Math.cos(a) * r;
      const z = gate.position.z + Math.sin(a) * r;
      if (!map._isClear(x, z, 1.2)) continue;
      const wb = makeWarBanner(kind);
      wb.position.set(x, map.heightAt(x, z), z);
      wb.rotation.y = rng() * Math.PI * 2;
      wb.rotation.z = (rng() - 0.5) * 0.16; // battle-worn lean
      group.add(wb);
      map.propBanners?.push(wb);
    }
  }
}

export function buildStoryLandmarks(map, rng) {
  const plans = LANDMARK_PLANS[map.def?.id];
  const group = new THREE.Group();
  group.name = 'story-landmarks';
  buildFactionStandards(map, rng, group);
  if (!plans?.length) {
    map.group.add(group);
    return group;
  }
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
  const clearBandPlace = (plan) => {
    for (let tries = 0; tries < 40; tries++) {
      const a = rng() * Math.PI * 2;
      const band = plan.band || [24, 48];
      const r = band[0] + rng() * (band[1] - band[0]);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!map._isClear(x, z, 5) || !clearOfTrees(x, z, 5)) continue;
      const built = plan.build();
      placeAt(built.g, x, z, rng() * Math.PI * 2);
      if (built.flames) map.propFlames.push(...built.flames);
      return true;
    }
    return false;
  };
  for (const plan of plans) {
    if (plan.place === 'roadside' && path) {
      // try several points along the road (f ± jitter) × both sides; a single blocked
      // point must not silently drop a stage's signature monument
      let placed = false;
      for (const df of [0, 0.06, -0.06, 0.12, -0.12] ) {
        const f = Math.min(0.92, Math.max(0.08, plan.f + df));
        const s = path.samples[Math.floor(path.samples.length * f)];
        for (const side of rng() < 0.5 ? [1, -1] : [-1, 1]) {
          const x = s.pos.x - s.tangent.z * side * plan.off;
          const z = s.pos.z + s.tangent.x * side * plan.off;
          if (!map._isClear(x, z, 4) || !clearOfTrees(x, z, 4)) continue;
          const built = plan.build();
          placeAt(built.g, x, z, Math.atan2(s.pos.x - x, s.pos.z - z));
          if (built.flames) map.propFlames.push(...built.flames);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) clearBandPlace(plan); // last resort: anywhere clear on the board
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
      clearBandPlace(plan);
    }
  }
  map.group.add(group);
  return group;
}
