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
  hide: new THREE.MeshStandardMaterial({ name: 'azhdaha_warm_umber_hide', color: 0x7b4731, roughness: 0.88, metalness: 0.02 }),
  belly: new THREE.MeshStandardMaterial({ name: 'azhdaha_ochre_belly_scutes', color: 0xb98f5d, roughness: 0.9 }),
  ridge: new THREE.MeshStandardMaterial({ name: 'azhdaha_dark_dorsal_ridge', color: 0x3f2a24, roughness: 0.94 }),
  horn: new THREE.MeshStandardMaterial({ name: 'azhdaha_bone_horns', color: 0xd1bd91, roughness: 0.72 }),
  wing: new THREE.MeshStandardMaterial({ name: 'azhdaha_folded_sienna_wing_membrane', color: 0x93533b, roughness: 0.86, side: THREE.DoubleSide }),
  claw: new THREE.MeshStandardMaterial({ name: 'azhdaha_dark_claws', color: 0x211815, roughness: 0.82 }),
  ember: new THREE.MeshStandardMaterial({ name: 'azhdaha_low_ember_eye', color: 0xf0a13a, emissive: 0x7a2f12, emissiveIntensity: 0.45, roughness: 0.6 }),
  shadow: new THREE.MeshStandardMaterial({ name: 'azhdaha_soft_ground_shadow', color: 0x221915, transparent: true, opacity: 0.28, roughness: 1 }),
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

function makeDragon() {
  const root = new THREE.Group();
  root.name = 'azhdaha_dragon_actor_root';

  const shadow = mesh('azhdaha_ground_shadow', new THREE.SphereGeometry(1, 18, 8), mats.shadow, [0, 0.035, -0.1], [1.05, 0.035, 2.45]);
  root.add(shadow);

  const segmentGeo = new THREE.SphereGeometry(0.5, 18, 10);
  const bellyGeo = new THREE.SphereGeometry(0.5, 10, 6);
  const body = [];
  const belly = [];
  const ridge = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const z = -1.55 + t * 2.85;
    const width = 0.28 + Math.sin(t * Math.PI) * 0.34;
    const height = 0.26 + Math.sin(t * Math.PI) * 0.18;
    const depth = 0.33 + Math.sin(t * Math.PI) * 0.12;
    const seg = mesh(`azhdaha_body_segment_${String(i).padStart(2, '0')}`, segmentGeo, mats.hide, [0, 0.38 + height * 0.32, z], [width, height, depth]);
    root.add(seg);
    body.push(seg);

    if (i > 1 && i < count - 1) {
      const plate = mesh(`azhdaha_belly_scute_${String(i).padStart(2, '0')}`, bellyGeo, mats.belly, [0, 0.19, z + 0.03], [width * 0.7, 0.055, depth * 0.82]);
      root.add(plate);
      belly.push(plate);
    }

    if (i > 0 && i < count - 1) {
      const spike = cone(`azhdaha_dorsal_spike_${String(i).padStart(2, '0')}`, 0.085 + Math.sin(t * Math.PI) * 0.035, 0.3, [0, 0.68 + height * 0.5, z - 0.03], [Math.PI, 0, 0], mats.ridge);
      root.add(spike);
      ridge.push(spike);
    }
  }

  const head = mesh('azhdaha_head_broad_muzzle', segmentGeo, mats.hide, [0, 0.68, 1.68], [0.48, 0.34, 0.42]);
  const brow = mesh('azhdaha_brow_plate', new THREE.BoxGeometry(0.74, 0.16, 0.24), mats.ridge, [0, 0.84, 1.89], [1, 1, 1]);
  const jaw = mesh('azhdaha_lower_jaw', new THREE.BoxGeometry(0.58, 0.12, 0.36), mats.belly, [0, 0.54, 1.94], [1, 1, 1]);
  root.add(head, brow, jaw);

  const horns = [
    cone('azhdaha_horn_left', 0.055, 0.52, [-0.25, 0.95, 1.75], [2.55, 0.18, -0.32], mats.horn),
    cone('azhdaha_horn_right', 0.055, 0.52, [0.25, 0.95, 1.75], [2.55, -0.18, 0.32], mats.horn),
  ];
  const eyes = [
    mesh('azhdaha_eye_left', new THREE.SphereGeometry(0.035, 8, 6), mats.ember, [-0.23, 0.72, 2.05], [1, 0.75, 1]),
    mesh('azhdaha_eye_right', new THREE.SphereGeometry(0.035, 8, 6), mats.ember, [0.23, 0.72, 2.05], [1, 0.75, 1]),
  ];
  root.add(...horns, ...eyes);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.85, 0.2);
  wingShape.lineTo(0.52, -0.38);
  wingShape.lineTo(0.12, -0.18);
  wingShape.lineTo(0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape);
  const wings = [
    mesh('azhdaha_folded_wing_left', wingGeo, mats.wing, [-0.34, 0.74, 0.3], [1, 1, 1]),
    mesh('azhdaha_folded_wing_right', wingGeo, mats.wing, [0.34, 0.74, 0.3], [-1, 1, 1]),
  ];
  wings[0].rotation.set(-0.38, -0.28, -0.38);
  wings[1].rotation.set(-0.38, 0.28, 0.38);
  root.add(...wings);

  const legs = [];
  const legPositions = [
    [-0.42, 0.2, 0.68], [0.42, 0.2, 0.68], [-0.42, 0.2, -0.62], [0.42, 0.2, -0.62],
  ];
  legPositions.forEach((pos, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const leg = mesh(`azhdaha_leg_${String(i).padStart(2, '0')}`, new THREE.BoxGeometry(0.18, 0.42, 0.16), mats.hide, pos, [1, 1, 1]);
    leg.rotation.z = side * 0.16;
    const claw = cone(`azhdaha_claw_${String(i).padStart(2, '0')}`, 0.045, 0.18, [pos[0] + side * 0.03, 0.035, pos[2] + 0.11], [Math.PI / 2, 0, 0], mats.claw);
    root.add(leg, claw);
    legs.push(leg, claw);
  });

  const tail = [];
  for (let i = 0; i < 4; i++) {
    const z = -1.82 - i * 0.25;
    const seg = mesh(`azhdaha_tail_segment_${String(i).padStart(2, '0')}`, segmentGeo, mats.hide, [0, 0.32 - i * 0.025, z], [0.26 - i * 0.035, 0.2 - i * 0.018, 0.27]);
    root.add(seg);
    tail.push(seg);
  }

  return { root, body, belly, ridge, head, brow, jaw, horns, eyes, wings, legs, tail };
}

function vectorTrack(object, property, duration, frameCount, fn) {
  const times = [];
  const values = [];
  const base = object[property].clone();
  for (let i = 0; i < frameCount; i++) {
    const t = (duration * i) / (frameCount - 1);
    const v = fn(t, base.clone());
    times.push(t);
    values.push(v.x, v.y, v.z);
  }
  return new THREE.VectorKeyframeTrack(`${object.name}.${property}`, times, values);
}

const positionTrack = (object, duration, frameCount, fn) => vectorTrack(object, 'position', duration, frameCount, fn);
const scaleTrack = (object, duration, frameCount, fn) => vectorTrack(object, 'scale', duration, frameCount, fn);

function rotationTrack(object, duration, frameCount, fn) {
  const times = [];
  const values = [];
  const base = object.rotation.clone();
  for (let i = 0; i < frameCount; i++) {
    const t = (duration * i) / (frameCount - 1);
    const euler = fn(t, base.clone());
    const q = new THREE.Quaternion().setFromEuler(euler);
    times.push(t);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${object.name}.quaternion`, times, values);
}

function makeClips(parts) {
  const idleTracks = [];
  const walkTracks = [];
  const attackTracks = [];

  [...parts.body, ...parts.tail].forEach((seg, i) => {
    idleTracks.push(positionTrack(seg, 2.5, 17, (t, p) => {
      const wave = Math.sin(t * Math.PI * 2 + i * 0.42);
      p.x += wave * 0.018;
      p.y += Math.cos(t * Math.PI * 2 + i * 0.36) * 0.01;
      return p;
    }));
    walkTracks.push(positionTrack(seg, 1.2, 17, (t, p) => {
      const wave = Math.sin(t * Math.PI * 2 + i * 0.72);
      p.x += wave * (0.04 + i * 0.002);
      p.y += Math.cos(t * Math.PI * 2 + i * 0.72) * 0.018;
      p.z += wave * 0.026;
      return p;
    }));
    attackTracks.push(positionTrack(seg, 0.95, 13, (t, p) => {
      const snap = Math.sin(Math.min(1, t / 0.42) * Math.PI);
      p.x += Math.sin(t * Math.PI * 2 + i * 0.38) * 0.016;
      p.z += snap * Math.max(0, i - 4) * 0.022;
      return p;
    }));
  });

  [parts.head, parts.brow, parts.jaw].forEach((piece, i) => {
    idleTracks.push(positionTrack(piece, 2.5, 17, (t, p) => {
      p.y += Math.sin(t * Math.PI * 2 + i * 0.2) * 0.014;
      return p;
    }));
    walkTracks.push(positionTrack(piece, 1.2, 17, (t, p) => {
      p.x += Math.sin(t * Math.PI * 2 + i * 0.3) * 0.025;
      p.y += Math.cos(t * Math.PI * 2 + i * 0.3) * 0.02;
      return p;
    }));
    attackTracks.push(positionTrack(piece, 0.95, 13, (t, p) => {
      const lunge = Math.sin(Math.min(1, t / 0.38) * Math.PI);
      p.z += lunge * 0.2;
      p.y += lunge * (i === 2 ? -0.03 : 0.04);
      return p;
    }));
  });

  parts.wings.forEach((wing, i) => {
    idleTracks.push(rotationTrack(wing, 2.5, 17, (t, r) => {
      r.z += Math.sin(t * Math.PI * 2) * (i === 0 ? -0.035 : 0.035);
      return r;
    }));
    walkTracks.push(rotationTrack(wing, 1.2, 17, (t, r) => {
      r.z += Math.sin(t * Math.PI * 2) * (i === 0 ? -0.07 : 0.07);
      return r;
    }));
    attackTracks.push(rotationTrack(wing, 0.95, 13, (t, r) => {
      const flare = Math.sin(Math.min(1, t / 0.45) * Math.PI);
      r.y += flare * (i === 0 ? -0.32 : 0.32);
      r.z += flare * (i === 0 ? -0.2 : 0.2);
      return r;
    }));
  });

  parts.legs.forEach((leg, i) => {
    walkTracks.push(rotationTrack(leg, 1.2, 17, (t, r) => {
      r.x += Math.sin(t * Math.PI * 2 + i * Math.PI * 0.5) * 0.18;
      return r;
    }));
  });

  attackTracks.push(scaleTrack(parts.jaw, 0.95, 13, (t, s) => {
    const open = Math.sin(Math.min(1, t / 0.36) * Math.PI);
    s.y *= 1 + open * 0.28;
    s.z *= 1 + open * 0.22;
    return s;
  }));

  parts.horns.forEach((horn, i) => {
    attackTracks.push(rotationTrack(horn, 0.95, 13, (t, r) => {
      const recoil = Math.sin(t * Math.PI * 2) * 0.05;
      r.z += i === 0 ? -recoil : recoil;
      return r;
    }));
  });

  return [
    new THREE.AnimationClip('Idle', 2.5, idleTracks),
    new THREE.AnimationClip('Walking', 1.2, walkTracks),
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

const parts = makeDragon();
parts.root.updateMatrixWorld(true);
await exportGlb(parts.root, makeClips(parts), 'Azhdaha.glb');
console.log(`Wrote ${path.join(outDir, 'Azhdaha.glb')}`);
