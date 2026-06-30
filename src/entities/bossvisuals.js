import * as THREE from 'three';
import { MATS } from '../models/materials.js';
import { settings } from '../core/settings.js';
import { cloneAssetScene } from '../core/assets.js';

const TAU = Math.PI * 2;

function stdMat(color, { roughness = 0.76, metalness = 0.12, opacity = 1, side = THREE.FrontSide } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    transparent: opacity < 1,
    opacity,
    side,
  });
  material.userData.bossVisualLocal = true;
  return material;
}

function glowMat(color, opacity = 0.45) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  material.userData.bossVisualLocal = true;
  return material;
}

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !mat.transparent;
  m.receiveShadow = !mat.transparent;
  return m;
}

function bossPalette(def = {}) {
  if (def.id === 'zahhak' || def.tyrant) return { cloth: 0x3c2137, accent: 0xd2aa4f, metal: 0x9a7a40, glow: 0x78d25c, shadow: 0x21121b };
  if (def.class === 'div') return { cloth: 0xd7d4c5, accent: 0xe8ddc4, metal: 0xa98a55, glow: 0xb6e8ff, shadow: 0x2e3034 };
  if (def.class === 'beast' || def.class === 'serpent') return { cloth: 0x5a3c2a, accent: 0xd8b45a, metal: 0x806647, glow: 0xff8a3a, shadow: 0x20150f };
  if (def.id === 'houman' || def.id === 'biderafsh' || def.id === 'kamus') return { cloth: 0x8e3428, accent: 0xe0b13e, metal: 0xae8445, glow: 0xf4cd6e, shadow: 0x241811 };
  return { cloth: 0x4b335e, accent: 0xe0b13e, metal: 0xb08a4a, glow: 0xf4cd6e, shadow: 0x1e1622 };
}

function addAuthoredDetail(group, key, name, height, baseHeight, animated, scaleMul = 1) {
  const asset = cloneAssetScene(key);
  if (!asset) return false;
  asset.name = name;
  asset.userData.visualLayer = 'boss-detail';
  asset.scale.setScalar(Math.max(0.42, (height / baseHeight) * scaleMul));
  asset.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.frustumCulled = false;
    const lowered = String(node.name || '').toLowerCase();
    if (lowered.includes('flag') || lowered.includes('cloth') || lowered.includes('mantle')) {
      animated.push({
        kind: lowered.includes('mantle') ? 'cloth' : 'standard',
        obj: node,
        phase: animated.length * 0.47,
        baseRotX: node.rotation.x,
        baseRotY: node.rotation.y,
      });
    } else if (lowered.includes('glow') && node.material) {
      animated.push({ kind: 'glow', obj: node, base: node.material.opacity ?? 0.48, phase: animated.length * 0.61 });
    }
  });
  group.add(asset);
  return true;
}

function addGroundOmen(group, height, palette, animated) {
  const ring = mesh(new THREE.RingGeometry(1.08, 1.2, 96), glowMat(palette.glow, 0.24));
  ring.name = 'boss-ground-omen-ring';
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.055;
  ring.scale.setScalar(Math.max(1.02, height * 0.48));
  ring.renderOrder = 38;
  group.add(ring);

  const inner = mesh(new THREE.RingGeometry(0.58, 0.63, 72), glowMat(palette.accent, 0.12));
  inner.name = 'boss-ground-omen-inner';
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.06;
  inner.scale.copy(ring.scale);
  inner.renderOrder = 38;
  group.add(inner);

  const tickMat = stdMat(palette.metal, { metalness: 0.42, roughness: 0.5 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const tick = mesh(new THREE.BoxGeometry(0.045, 0.032, 0.28), tickMat);
    tick.name = 'boss-ground-omen-tick';
    tick.position.set(Math.cos(a) * height * 0.58, 0.075, Math.sin(a) * height * 0.58);
    tick.rotation.y = -a;
    group.add(tick);
  }

  animated.push({ kind: 'ring', obj: ring, base: 0.24, phase: 0 });
  animated.push({ kind: 'ring', obj: inner, base: 0.12, phase: Math.PI * 0.6 });
}

function addHumanBossKit(group, height, palette, animated) {
  const mats = MATS();
  const s = Math.max(0.82, height / 2.2);
  const cloth = stdMat(palette.cloth, { roughness: 0.82, side: THREE.DoubleSide });
  const trim = stdMat(palette.accent, { metalness: 0.65, roughness: 0.38 });
  const metal = stdMat(palette.metal, { metalness: 0.82, roughness: 0.32 });
  const shadow = stdMat(palette.shadow, { roughness: 0.9, side: THREE.DoubleSide });

  const mantle = mesh(new THREE.PlaneGeometry(0.72 * s, 0.98 * s, 2, 4), cloth);
  mantle.name = 'boss-mantle-panel';
  mantle.position.set(0, height * 0.46, -0.22 * s);
  mantle.rotation.x = 0.12;
  group.add(mantle);
  animated.push({ kind: 'cloth', obj: mantle, phase: 0.8, baseRotX: mantle.rotation.x });

  const halo = mesh(new THREE.TorusGeometry(0.38 * s, 0.018 * s, 8, 56), trim);
  halo.name = 'boss-back-halo';
  halo.position.set(0, height * 0.78, -0.16 * s);
  halo.scale.y = 1.22;
  group.add(halo);

  const breast = mesh(new THREE.SphereGeometry(0.28 * s, 16, 10), metal);
  breast.name = 'boss-cuirass-relief';
  breast.position.set(0, height * 0.48, 0.12 * s);
  breast.scale.set(0.9, 1.2, 0.34);
  group.add(breast);

  for (const side of [-1, 1]) {
    const pauldron = mesh(new THREE.SphereGeometry(0.18 * s, 12, 8), metal);
    pauldron.name = 'boss-shoulder-plate';
    pauldron.position.set(side * 0.36 * s, height * 0.62, 0.02);
    pauldron.scale.set(1.12, 0.7, 0.9);
    group.add(pauldron);

    const pole = mesh(new THREE.CylinderGeometry(0.018 * s, 0.024 * s, height * 0.86, 8), mats.woodDark);
    pole.name = 'boss-standard-pole';
    pole.position.set(side * 0.46 * s, height * 0.52, -0.42 * s);
    group.add(pole);

    const finial = mesh(new THREE.ConeGeometry(0.075 * s, 0.2 * s, 6), trim);
    finial.name = 'boss-standard-finial';
    finial.position.set(side * 0.46 * s, height * 0.98, -0.42 * s);
    group.add(finial);

    const flag = mesh(new THREE.PlaneGeometry(0.3 * s, 0.44 * s, 2, 3), side < 0 ? cloth : shadow);
    flag.name = 'boss-war-standard';
    flag.position.set(side * 0.58 * s, height * 0.82, -0.42 * s);
    flag.rotation.y = side * 0.08;
    group.add(flag);
    animated.push({ kind: 'standard', obj: flag, phase: side > 0 ? 0.2 : 1.7, baseRotY: flag.rotation.y });

    const tassel = mesh(new THREE.ConeGeometry(0.045 * s, 0.24 * s, 6), trim);
    tassel.name = 'boss-standard-tassel';
    tassel.position.set(side * 0.5 * s, height * 0.58, -0.42 * s);
    tassel.rotation.z = Math.PI;
    group.add(tassel);
  }
}

function addCrawlerBossKit(group, height, palette, animated, { assetBacked = false } = {}) {
  const spineMat = stdMat(palette.accent, { metalness: 0.38, roughness: 0.48 });
  const glow = glowMat(palette.glow, 0.38);
  const shadow = stdMat(palette.shadow, { roughness: 0.92 });
  const s = Math.max(0.85, height / 2.4);
  const spineCount = assetBacked ? 5 : 9;
  for (let i = 0; i < spineCount; i++) {
    const t = spineCount <= 1 ? 0 : i / (spineCount - 1);
    const z = 0.6 * s - t * 3.2 * s;
    const r = (assetBacked ? 0.08 : 0.16) * (1 - t * 0.32) * s;
    const plate = mesh(new THREE.ConeGeometry(Math.max(0.045, r), (assetBacked ? 0.18 : 0.34) * s, 5), spineMat);
    plate.name = assetBacked ? 'boss-crawler-scale-ridge' : 'boss-dorsal-spine';
    plate.position.set(0, assetBacked ? 0.16 : height * (0.32 + (1 - t) * 0.04), z);
    plate.rotation.x = assetBacked ? -Math.PI / 2 : -0.38;
    group.add(plate);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const claw = mesh(new THREE.ConeGeometry((assetBacked ? 0.045 : 0.065) * s, (assetBacked ? 0.18 : 0.26) * s, 5), shadow);
      claw.name = 'boss-crawler-ground-claw';
      claw.position.set(side * (0.52 + t * 0.18) * s, 0.08, (0.44 - t * 0.9) * s);
      claw.rotation.z = -side * Math.PI / 2;
      claw.rotation.x = 0.2;
      group.add(claw);
    }
    if (!assetBacked) {
      const eye = mesh(new THREE.SphereGeometry(0.1 * s, 12, 8), glow);
      eye.name = 'boss-creature-eye-glow';
      eye.position.set(side * 0.32 * s, height * 0.54, 0.82 * s);
      group.add(eye);
      animated.push({ kind: 'glow', obj: eye, base: 0.38, phase: side > 0 ? 0 : 1.1 });
    }
  }
}

function addDivBossKit(group, height, palette, animated) {
  const bone = stdMat(0xe4dcc7, { roughness: 0.65 });
  const iron = stdMat(0x9aa0a4, { metalness: 0.7, roughness: 0.38 });
  const s = Math.max(0.92, height / 3.2);
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.09 * s, 0.42 * s, 7), bone);
    horn.name = 'boss-div-crown-horn';
    horn.position.set(side * 0.2 * s, height * 0.88, -0.02);
    horn.rotation.z = -side * 0.62;
    group.add(horn);

    const shoulder = mesh(new THREE.SphereGeometry(0.24 * s, 12, 8), iron);
    shoulder.name = 'boss-div-iron-shoulder';
    shoulder.position.set(side * 0.46 * s, height * 0.58, 0);
    shoulder.scale.set(1, 0.62, 0.86);
    group.add(shoulder);
  }
  const smoke = mesh(new THREE.SphereGeometry(0.72 * s, 24, 12), glowMat(palette.glow, 0.18));
  smoke.name = 'boss-div-breath-veil';
  smoke.position.set(0, height * 0.58, 0);
  smoke.scale.set(1.0, 0.72, 0.82);
  group.add(smoke);
  animated.push({ kind: 'glow', obj: smoke, base: 0.18, phase: 2.1 });
}

export function createBossVisualKit(def, model) {
  if (!def || !model?.group) return null;
  const group = new THREE.Group();
  group.name = 'boss-visual-kit';
  group.userData.visualLayer = 'boss-detail';
  const animated = [];
  const height = Math.max(1.8, model.headH || 2.2);
  const palette = bossPalette(def);

  addGroundOmen(group, height, palette, animated);
  if (def.class === 'beast' || def.class === 'serpent') {
    addCrawlerBossKit(group, height, palette, animated, { assetBacked: !!model.anim?.isAsset });
  } else if (def.class === 'div') {
    if (!addAuthoredDetail(group, 'boss_div_crown', 'boss-div-crown-detail', height, 3.2, animated, 1.1)) {
      addDivBossKit(group, height, palette, animated);
    }
  } else if (!addAuthoredDetail(group, 'boss_human_regalia', 'boss-human-regalia-detail', height, 2.2, animated, 1.28)) {
    addHumanBossKit(group, height, palette, animated);
  }

  return {
    group,
    headH: def.class === 'beast' || def.class === 'serpent' ? height + 0.35 : height + 0.22,
    update(time, dt, enemy) {
      const reduced = settings.get('reducedMotion');
      const t = reduced ? 0 : time;
      const hurt = Math.max(0, Math.min(1, enemy?.dmgFlash || 0));
      for (const item of animated) {
        if (item.kind === 'standard') item.obj.rotation.y = item.baseRotY + (reduced ? 0 : Math.sin(t * 2.1 + item.phase) * 0.08);
        else if (item.kind === 'cloth') item.obj.rotation.x = item.baseRotX + (reduced ? 0 : Math.sin(t * 1.55 + item.phase) * 0.035);
        else if (item.kind === 'ring' && item.obj.material) item.obj.material.opacity = item.base + (reduced ? 0 : Math.sin(t * 2.0 + item.phase) * 0.045) + hurt * 0.18;
        else if (item.kind === 'glow' && item.obj.material) item.obj.material.opacity = item.base + (reduced ? 0 : Math.sin(t * 2.4 + item.phase) * 0.08) + hurt * 0.2;
      }
      group.rotation.y = reduced ? 0 : Math.sin(t * 0.8) * 0.018;
      group.position.y = reduced ? 0 : Math.sin(t * 1.7) * 0.018;
    },
    dispose() {
      group.traverse((node) => {
        node.geometry?.dispose?.();
        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        for (const material of materials) if (material.userData?.bossVisualLocal) material.dispose?.();
      });
    },
  };
}
