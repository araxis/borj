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

const outDir = path.join(process.cwd(), 'public', 'assets', 'animals');

const mats = {
  body: new THREE.MeshStandardMaterial({ name: 'worm_sickly_ochre_hide', color: 0x9a7651, roughness: 0.92, metalness: 0.02 }),
  belly: new THREE.MeshStandardMaterial({ name: 'worm_warm_grey_belly', color: 0xb18c74, roughness: 0.96 }),
  groove: new THREE.MeshStandardMaterial({ name: 'worm_deep_ring_grooves', color: 0x5a3d32, roughness: 1 }),
  maw: new THREE.MeshStandardMaterial({ name: 'worm_dark_gullet', color: 0x241816, roughness: 1 }),
  tooth: new THREE.MeshStandardMaterial({ name: 'worm_dull_teeth', color: 0xd6c2a3, roughness: 0.72 }),
  mandible: new THREE.MeshStandardMaterial({ name: 'worm_brown_chitin_mandibles', color: 0x5e3c25, roughness: 0.88 }),
  ridge: new THREE.MeshStandardMaterial({ name: 'worm_bruised_dorsal_ridge', color: 0x745044, roughness: 0.94 }),
  shadow: new THREE.MeshStandardMaterial({ name: 'worm_soft_ground_shadow', color: 0x231b16, roughness: 1, transparent: true, opacity: 0.26 }),
};

function mesh(name, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.position.set(...position);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cone(name, radius, height, position, rotation, material) {
  const c = mesh(name, new THREE.ConeGeometry(radius, height, 6, 1), material, position);
  c.rotation.set(...rotation);
  return c;
}

function makeWorm() {
  const root = new THREE.Group();
  root.name = 'haftvad_worm_actor_root';

  const shadow = mesh(
    'haftvad_worm_ground_shadow',
    new THREE.SphereGeometry(1, 14, 8),
    mats.shadow,
    [0, 0.035, 0],
    [0.72, 0.035, 1.95],
  );
  root.add(shadow);

  const segmentGeo = new THREE.SphereGeometry(0.5, 12, 8);
  const ringGeo = new THREE.TorusGeometry(0.46, 0.025, 5, 16);
  const ridgeGeo = new THREE.ConeGeometry(0.105, 0.26, 5, 1);
  const segments = [];
  const count = 10;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const z = -1.35 + t * 2.55;
    const width = 0.36 + Math.sin(t * Math.PI) * 0.18 + (i === count - 1 ? 0.12 : 0);
    const height = 0.26 + Math.sin(t * Math.PI) * 0.08 + (i === count - 1 ? 0.09 : 0);
    const depth = 0.38 - t * 0.02;
    const seg = mesh(`haftvad_worm_segment_${String(i).padStart(2, '0')}`, segmentGeo, mats.body, [0, 0.26 + height * 0.28, z], [width, height, depth]);
    root.add(seg);
    segments.push(seg);

    const ring = mesh(`haftvad_worm_ring_${String(i).padStart(2, '0')}`, ringGeo, mats.groove, [0, 0.26 + height * 0.28, z + depth * 0.34], [width * 1.14, height * 0.82, 1]);
    root.add(ring);

    if (i > 1 && i < count - 1) {
      const ridge = cone(`haftvad_worm_dorsal_ridge_${String(i).padStart(2, '0')}`, 0.095, 0.22, [0, 0.55 + height * 0.3, z - 0.03], [Math.PI, 0, 0], mats.ridge);
      root.add(ridge);
    }

    if (i > 0 && i < count - 2) {
      const belly = mesh(`haftvad_worm_belly_plate_${String(i).padStart(2, '0')}`, new THREE.SphereGeometry(0.5, 8, 6), mats.belly, [0, 0.1, z + 0.04], [width * 0.78, 0.055, depth * 0.82]);
      root.add(belly);
    }
  }

  const head = mesh('haftvad_worm_head_maw_mass', segmentGeo, mats.body, [0, 0.42, 1.55], [0.64, 0.42, 0.52]);
  root.add(head);
  segments.push(head);

  const mawRing = mesh('haftvad_worm_maw_outer_ring', new THREE.TorusGeometry(0.29, 0.052, 7, 22), mats.groove, [0, 0.42, 1.94], [1.05, 0.78, 1]);
  root.add(mawRing);
  const maw = mesh('haftvad_worm_dark_open_maw', new THREE.CircleGeometry(0.25, 22), mats.maw, [0, 0.42, 1.945], [1.05, 0.78, 1]);
  root.add(maw);

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * 0.25;
    const y = 0.42 + Math.sin(a) * 0.18;
    const tooth = cone(`haftvad_worm_tooth_${String(i).padStart(2, '0')}`, 0.025, 0.14, [x, y, 1.985], [Math.PI / 2, 0, -a], mats.tooth);
    root.add(tooth);
  }

  const mandibleLeft = cone('haftvad_worm_mandible_left', 0.06, 0.55, [-0.38, 0.36, 1.82], [Math.PI / 2.5, 0.42, 0.25], mats.mandible);
  const mandibleRight = cone('haftvad_worm_mandible_right', 0.06, 0.55, [0.38, 0.36, 1.82], [Math.PI / 2.5, -0.42, -0.25], mats.mandible);
  root.add(mandibleLeft, mandibleRight);

  return { root, segments, mandibles: [mandibleLeft, mandibleRight], head, mawRing };
}

function positionTrack(object, duration, frameCount, fn) {
  const times = [];
  const values = [];
  const base = object.position.clone();
  for (let i = 0; i < frameCount; i++) {
    const t = (duration * i) / (frameCount - 1);
    const p = fn(t, base.clone());
    times.push(t);
    values.push(p.x, p.y, p.z);
  }
  return new THREE.VectorKeyframeTrack(`${object.name}.position`, times, values);
}

function scaleTrack(object, duration, frameCount, fn) {
  const times = [];
  const values = [];
  const base = object.scale.clone();
  for (let i = 0; i < frameCount; i++) {
    const t = (duration * i) / (frameCount - 1);
    const s = fn(t, base.clone());
    times.push(t);
    values.push(s.x, s.y, s.z);
  }
  return new THREE.VectorKeyframeTrack(`${object.name}.scale`, times, values);
}

function makeClips(parts) {
  const idleTracks = [];
  const walkTracks = [];
  const attackTracks = [];

  parts.segments.forEach((seg, i) => {
    idleTracks.push(positionTrack(seg, 2.4, 17, (t, p) => {
      const wave = Math.sin(t * Math.PI * 2 + i * 0.45);
      p.x += wave * 0.018;
      p.y += wave * 0.012;
      return p;
    }));
    walkTracks.push(positionTrack(seg, 1.15, 17, (t, p) => {
      const wave = Math.sin(t * Math.PI * 2 + i * 0.78);
      p.x += wave * (0.045 + i * 0.002);
      p.y += Math.cos(t * Math.PI * 2 + i * 0.78) * 0.025;
      p.z += wave * 0.035;
      return p;
    }));
    attackTracks.push(positionTrack(seg, 0.95, 13, (t, p) => {
      const lunge = Math.sin(Math.min(1, t / 0.45) * Math.PI) * Math.max(0, i - 5) * 0.035;
      const recoil = Math.sin(t * Math.PI * 2 + i * 0.55) * 0.02;
      p.x += recoil;
      p.z += lunge;
      return p;
    }));
  });

  parts.mandibles.forEach((mandible, i) => {
    attackTracks.push(scaleTrack(mandible, 0.95, 13, (t, s) => {
      const snap = Math.sin(Math.min(1, t / 0.36) * Math.PI);
      s.x *= 1 + snap * 0.22;
      s.y *= 1 + snap * 0.08;
      s.z *= 1 + snap * 0.22;
      if (i === 1) s.x *= 0.98;
      return s;
    }));
  });

  attackTracks.push(scaleTrack(parts.head, 0.95, 13, (t, s) => {
    const swell = Math.sin(Math.min(1, t / 0.42) * Math.PI);
    s.x *= 1 + swell * 0.14;
    s.y *= 1 + swell * 0.08;
    s.z *= 1 + swell * 0.18;
    return s;
  }));
  attackTracks.push(scaleTrack(parts.mawRing, 0.95, 13, (t, s) => {
    const open = Math.sin(Math.min(1, t / 0.38) * Math.PI);
    s.x *= 1 + open * 0.18;
    s.y *= 1 + open * 0.18;
    return s;
  }));

  return [
    new THREE.AnimationClip('Idle', 2.4, idleTracks),
    new THREE.AnimationClip('Walking', 1.15, walkTracks),
    new THREE.AnimationClip('Attack', 0.95, attackTracks),
  ];
}

async function exportGlb(object, animations, fileName) {
  mkdirSync(outDir, { recursive: true });
  const exporter = new GLTFExporter();
  const result = await new Promise((resolve, reject) => {
    exporter.parse(object, resolve, reject, {
      binary: true,
      animations,
      trs: true,
      onlyVisible: true,
    });
  });
  writeFileSync(path.join(outDir, fileName), Buffer.from(result));
}

const parts = makeWorm();
parts.root.updateMatrixWorld(true);
await exportGlb(parts.root, makeClips(parts), 'Worm.glb');
console.log(`Wrote ${path.join(outDir, 'Worm.glb')}`);
