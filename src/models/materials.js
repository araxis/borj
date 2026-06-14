// Shared material palette — all procedural (canvas textures), all reused across the
// scene so draw-call state changes stay low. Persian palette: warm stone, mudbrick,
// turquoise/lapis tile, bronze/gold metal, cedar wood, banner cloth.
import * as THREE from 'three';

function noiseTexture(base, vary, scale = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = scale;
  const g = c.getContext('2d');
  const b = new THREE.Color(base);
  for (let y = 0; y < scale; y++) {
    for (let x = 0; x < scale; x++) {
      const v = (Math.random() - 0.5) * vary;
      g.fillStyle = `rgb(${Math.round((b.r + v) * 255)},${Math.round((b.g + v) * 255)},${Math.round((b.b + v) * 255)})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function brickTexture(mortar, brick, rows = 8, cols = 6) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = mortar; g.fillRect(0, 0, 128, 128);
  const bh = 128 / rows, bw = 128 / cols;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let col = -1; col < cols; col++) {
      const v = (Math.random() - 0.5) * 18;
      const bc = new THREE.Color(brick);
      g.fillStyle = `rgb(${Math.min(255, bc.r * 255 + v)},${Math.min(255, bc.g * 255 + v)},${Math.min(255, bc.b * 255 + v)})`;
      g.fillRect(off + col * bw + 1, r * bh + 1, bw - 2, bh - 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Persian geometric relief band (eslimi-inspired zigzag + rosettes), used as emissive trim
function reliefTexture(fg, bg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = fg; g.fillStyle = fg; g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x <= 256; x += 16) {
    g.lineTo(x, x % 32 === 0 ? 14 : 50);
  }
  g.stroke();
  for (let x = 8; x < 256; x += 32) {
    g.beginPath(); g.arc(x, 32, 6, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let cache = null;
export function MATS() {
  if (cache) return cache;
  const std = (p) => new THREE.MeshStandardMaterial(p);
  cache = {
    stone: std({ map: noiseTexture(0x9a8d77, 0.06), roughness: 0.95 }),
    stoneDark: std({ map: noiseTexture(0x6e6354, 0.05), roughness: 0.95 }),
    stoneWhite: std({ map: noiseTexture(0xcfc8b8, 0.05), roughness: 0.9 }),
    mudbrick: std({ map: brickTexture('#8a7355', '#a98e63'), roughness: 1.0 }),
    brickRed: std({ map: brickTexture('#7d5a41', '#9c6b46'), roughness: 1.0 }),
    plaster: std({ map: noiseTexture(0xd8c9a8, 0.04), roughness: 0.9 }),
    wood: std({ map: noiseTexture(0x6b4a2c, 0.07), roughness: 0.85 }),
    woodDark: std({ map: noiseTexture(0x4a3320, 0.06), roughness: 0.85 }),
    bronze: std({ color: 0xb0793a, metalness: 0.85, roughness: 0.35 }),
    gold: std({ color: 0xe0b13e, metalness: 0.9, roughness: 0.25 }),
    iron: std({ color: 0x787d85, metalness: 0.9, roughness: 0.4 }),
    steel: std({ color: 0xaab2bd, metalness: 0.95, roughness: 0.3 }),
    turquoise: std({ color: 0x2fa7a0, roughness: 0.3, metalness: 0.1 }),
    lapis: std({ color: 0x2a4a9e, roughness: 0.35, metalness: 0.1 }),
    clothRed: std({ color: 0x9e2b25, roughness: 0.8, side: THREE.DoubleSide }),
    clothPurple: std({ color: 0x5b3a78, roughness: 0.8, side: THREE.DoubleSide }),
    clothTeal: std({ color: 0x1f6f6a, roughness: 0.8, side: THREE.DoubleSide }),
    clothGold: std({ color: 0xc8962e, roughness: 0.75, side: THREE.DoubleSide }),
    clothWhite: std({ color: 0xd9d2c0, roughness: 0.85, side: THREE.DoubleSide }),
    clothBlack: std({ color: 0x26222b, roughness: 0.85, side: THREE.DoubleSide }),
    relief: std({ map: reliefTexture('#caa84f', '#6e6354'), roughness: 0.8 }),
    reliefGlow: std({ map: reliefTexture('#ffd97a', '#4a4338'), emissive: 0xc89030, emissiveIntensity: 0.25, roughness: 0.7 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffae3c, transparent: true, opacity: 0.9, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.95, depthWrite: false }),
    sacredGlow: new THREE.MeshBasicMaterial({ color: 0x7fe7ff, transparent: true, opacity: 0.6, depthWrite: false }),
    featherGlow: new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.7, depthWrite: false }),
    skin: std({ color: 0xc69a72, roughness: 0.8 }),
    skinDark: std({ color: 0x9a7150, roughness: 0.8 }),
    hairBlack: std({ color: 0x1d1a16, roughness: 0.9 }),
    hairWhite: std({ color: 0xe8e4da, roughness: 0.9 }),
    hairGrey: std({ color: 0x9b948a, roughness: 0.9 }),
    divHide: std({ color: 0x6f7d6a, roughness: 1.0 }),
    divHideWhite: std({ color: 0xd9dcd2, roughness: 0.95 }),
    divHideDark: std({ color: 0x4c4356, roughness: 1.0 }),
    scale: std({ color: 0x4f6b3f, roughness: 0.6, metalness: 0.3 }),
    scaleDark: std({ color: 0x39472f, roughness: 0.6, metalness: 0.3 }),
    wormFlesh: std({ color: 0xb9a08a, roughness: 0.9 }),
    lionFur: std({ map: noiseTexture(0xc2934d, 0.05), roughness: 1.0 }),
    // Shahnameh "Lion & Sun" heraldic mane — warm bronze→amber→gold sunburst, gold-tipped with a regal sheen.
    lionManeOuter: std({ map: noiseTexture(0x6b3f17, 0.05), roughness: 1.0 }),
    lionManeMid: std({ map: noiseTexture(0x935a23, 0.05), roughness: 0.92 }),
    lionManeInner: std({ map: noiseTexture(0xbe8133, 0.05), roughness: 0.82 }),
    lionManeGold: std({ color: 0xe2b24c, roughness: 0.4, metalness: 0.34 }),
    elephantHide: std({ color: 0xcfcac0, roughness: 1.0 }),
    horseBlack: std({ color: 0x211d1c, roughness: 0.9 }),
    horseBrown: std({ color: 0x5d4030, roughness: 0.9 }),
    venom: new THREE.MeshBasicMaterial({ color: 0x88e04a, transparent: true, opacity: 0.8, depthWrite: false }),
    shadowVeil: new THREE.MeshBasicMaterial({ color: 0x2a1f3a, transparent: true, opacity: 0.45, depthWrite: false }),
  };
  return cache;
}

// ---- progressive PBR upgrade: ambientCG (CC0) photo textures replace the canvas
// noise on the SHARED cached materials, instantly re-skinning the whole scene.
// If files are missing the procedural canvases simply remain — never a breakage.
export function enhanceMaterials() {
  const mats = MATS();
  const tl = new THREE.TextureLoader();
  const apply = (matKey, base, tint, repeat = 1.5, normalScale = 0.8) => {
    const m = mats[matKey];
    if (!m) return;
    tl.load(`assets/textures/${base}-color.jpg`, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.colorSpace = THREE.SRGBColorSpace;
      m.map = tex;
      m.color = new THREE.Color(tint);
      m.needsUpdate = true;
    });
    tl.load(`assets/textures/${base}-normal.jpg`, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      m.normalMap = tex;
      m.normalScale = new THREE.Vector2(normalScale, normalScale);
      m.needsUpdate = true;
    });
  };
  apply('plaster', 'plaster', 0xeadfc2, 1.6);
  apply('brickRed', 'bricks', 0xd09a78, 1.3);
  apply('mudbrick', 'bricks', 0xc09a66, 1.3);
  // the rock photo is dark — pair light stones with the bright plaster texture
  // and keep rock only for the dark accent stone (brightened)
  apply('stone', 'plaster', 0xcfc4a8, 1.5);
  apply('stoneDark', 'rock', 0xd8cfc0, 1.4);
  apply('stoneWhite', 'plaster', 0xffffff, 1.5);
}

// Build-bucket helper: collect geometries per material, merge each bucket into one mesh.
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class MeshBuilder {
  constructor() { this.buckets = new Map(); }
  add(geo, matKey, matrix) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!this.buckets.has(matKey)) this.buckets.set(matKey, []);
    this.buckets.get(matKey).push(g);
    geo.dispose?.();
    return this;
  }
  box(w, h, d, matKey, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
    m.setPosition(x, y, z);
    return this.add(new THREE.BoxGeometry(w, h, d), matKey, m);
  }
  cyl(rt, rb, h, seg, matKey, x = 0, y = 0, z = 0, rx = 0, rz = 0) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz));
    m.setPosition(x, y, z);
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), matKey, m);
  }
  sphere(r, ws, hs, matKey, x = 0, y = 0, z = 0, sy = 1, phiLen = Math.PI * 2, thetaLen = Math.PI) {
    const g = new THREE.SphereGeometry(r, ws, hs, 0, phiLen, 0, thetaLen);
    const m = new THREE.Matrix4().makeScale(1, sy, 1);
    m.setPosition(x, y, z);
    return this.add(g, matKey, m);
  }
  cone(r, h, seg, matKey, x = 0, y = 0, z = 0) {
    const m = new THREE.Matrix4();
    m.setPosition(x, y, z);
    return this.add(new THREE.ConeGeometry(r, h, seg), matKey, m);
  }
  build(castShadow = true, receiveShadow = true) {
    const mats = MATS();
    const group = new THREE.Group();
    for (const [key, geos] of this.buckets) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mats[key]);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}
