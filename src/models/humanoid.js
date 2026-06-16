// Procedural humanoid builder — soldiers, human enemy champions, hero statues.
// Distinct silhouettes via armor/helmet/hair/weapon/cloak/proportion params.
// Returns a rigged group: pivots for arms/legs/torso/head enable procedural
// walk/attack/hit/death animation without skeletal meshes (fast, instancing-friendly).
import * as THREE from 'three';
import { MATS } from './materials.js';
import { easeInQuad, easeOutCubic, easeOutBack } from '../fx/ease.js';

const colorMatCache = new Map();
export function colorMat(hex, rough = 0.8, metal = 0) {
  const key = `${hex}|${rough}|${metal}`;
  if (!colorMatCache.has(key)) {
    colorMatCache.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
  }
  return colorMatCache.get(key);
}

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

export function makeWeapon(kind, mats = MATS()) {
  const g = new THREE.Group();
  switch (kind) {
    case 'sword': {
      // curved Persian SHAMSHIR: a segmented blade arcing in the Y–Z plane, tapering to a point,
      // with cross-quillons, a gold inscription band, a leather grip and a pommel.
      const N = 10, segLen = 0.085, dCurve = 0.084;
      let py = 0.18, pz = 0, ang = 0;
      for (let i = 0; i < N; i++) {
        const breadth = 0.125 * (1 - i * 0.062);
        const seg = mesh(new THREE.BoxGeometry(0.044, segLen * 1.55, breadth), mats.steel); // overlap hides the steps
        seg.position.set(0, py, pz); seg.rotation.x = -ang; g.add(seg);
        py += Math.cos(ang) * segLen; pz += Math.sin(ang) * segLen; ang += dCurve;
      }
      const tip = mesh(new THREE.ConeGeometry(0.05, 0.17, 4), mats.steel);
      tip.position.set(0, py, pz); tip.rotation.x = -ang; g.add(tip);
      const guard = mesh(new THREE.BoxGeometry(0.26, 0.045, 0.06), mats.gold); guard.position.y = 0.14; g.add(guard);
      const band = mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.05, 8), mats.gold); band.position.y = 0.2; g.add(band);
      const grip = mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.17, 6), mats.woodDark); grip.position.y = 0.05; g.add(grip);
      const pommel = mesh(new THREE.SphereGeometry(0.035, 6, 5), mats.gold); pommel.position.y = -0.04; g.add(pommel);
      break;
    }
    case 'spear': case 'lance': {
      // NEYZEH: a socketed leaf-shaped head on a long shaft.
      const L = kind === 'lance' ? 2.2 : 1.8;
      const headY = kind === 'lance' ? 1.85 : 1.65;
      const shaft = mesh(new THREE.CylinderGeometry(0.028, 0.034, L, 6), mats.wood); shaft.position.y = 0.6; g.add(shaft);
      const socket = mesh(new THREE.CylinderGeometry(0.038, 0.046, 0.12, 6), mats.bronze); socket.position.y = headY - 0.16; g.add(socket);
      const leaf = mesh(new THREE.OctahedronGeometry(0.13), mats.steel); leaf.scale.set(0.62, 1.6, 0.2); leaf.position.y = headY + 0.05; g.add(leaf);
      break;
    }
    case 'bow': {
      // KAMAN: a deep belly arc with a leather grip wrap and a drawn string.
      const arc = Math.PI * 1.1;
      const limb = mesh(new THREE.TorusGeometry(0.46, 0.024, 6, 20, arc), mats.woodDark);
      limb.rotation.z = -Math.PI / 2 - arc / 2; g.add(limb);
      const grip = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 6), mats.bronze); grip.position.x = 0.46; g.add(grip);
      const str = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.84, 3), colorMat(0xd8d0c0, 0.9)); str.position.x = 0.12; g.add(str);
      break;
    }
    case 'mace': {
      // GORZ: a flanged Persian war-mace — six radial fins around an iron core.
      const shaft = mesh(new THREE.CylinderGeometry(0.036, 0.046, 0.85, 6), mats.wood); shaft.position.y = 0.35; g.add(shaft);
      const core = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.17, 8), mats.iron); core.position.y = 0.86; g.add(core);
      const F = 6;
      for (let i = 0; i < F; i++) {
        const a = (i / F) * Math.PI * 2;
        const fin = mesh(new THREE.BoxGeometry(0.17, 0.14, 0.03), mats.iron);
        fin.position.set(Math.cos(a) * 0.1, 0.86, Math.sin(a) * 0.1); fin.rotation.y = -a; g.add(fin);
      }
      const knob = mesh(new THREE.SphereGeometry(0.05, 6, 5), mats.iron); knob.position.y = 0.97; g.add(knob);
      const pommel = mesh(new THREE.SphereGeometry(0.04, 6, 5), mats.gold); pommel.position.y = -0.07; g.add(pommel);
      break;
    }
    case 'axe': case 'halberd': {
      // TABARZIN: a crescent axe head (flattened arc) with a back spike.
      const len = kind === 'halberd' ? 1.7 : 0.9;
      const shaft = mesh(new THREE.CylinderGeometry(0.032, 0.04, len, 6), mats.wood); shaft.position.y = len * 0.35; g.add(shaft);
      const by = len * 0.78;
      const crescent = mesh(new THREE.TorusGeometry(0.16, 0.05, 4, 14, Math.PI * 0.9), mats.steel);
      crescent.scale.z = 0.3; crescent.position.set(0.05, by, 0); crescent.rotation.z = Math.PI * 0.55; g.add(crescent);
      const spike = mesh(new THREE.ConeGeometry(0.028, 0.14, 4), mats.steel); spike.position.set(-0.07, by, 0); spike.rotation.z = Math.PI / 2; g.add(spike);
      break;
    }
    case 'hammer': {
      const shaft = mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.8, 6), mats.wood);
      shaft.position.y = 0.3; g.add(shaft);
      const head = mesh(new THREE.BoxGeometry(0.3, 0.18, 0.18), mats.iron);
      head.position.y = 0.72; g.add(head);
      break;
    }
    case 'staff': {
      const shaft = mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.5, 6), mats.woodDark);
      shaft.position.y = 0.55; g.add(shaft);
      const orb = mesh(new THREE.SphereGeometry(0.09, 8, 6), mats.turquoise);
      orb.position.y = 1.35; g.add(orb);
      break;
    }
    case 'dagger': {
      const blade = mesh(new THREE.BoxGeometry(0.04, 0.4, 0.08), mats.steel);
      blade.position.y = 0.28; g.add(blade);
      break;
    }
    case 'banner': {
      const pole = mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.2, 6), mats.wood);
      pole.position.y = 0.8; g.add(pole);
      const cloth = mesh(new THREE.PlaneGeometry(0.6, 0.85), mats.clothGold);
      cloth.position.set(0.32, 1.5, 0); g.add(cloth);
      break;
    }
    case 'lantern': {
      const handle = mesh(new THREE.TorusGeometry(0.08, 0.015, 4, 8), mats.bronze);
      handle.position.y = 0.35; g.add(handle);
      const body = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 6), mats.bronze);
      body.position.y = 0.2; g.add(body);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mats.flameCore);
      glow.position.y = 0.2; g.add(glow);
      break;
    }
    default: break;
  }
  return g;
}

// spec: see callers. Height unit ~1.7 world units for a standard human.
export function buildHumanoid(spec = {}) {
  const {
    skin = 'skin', hair = 'hairBlack', hairStyle = 'short', beard = 'none',
    helmet = 'none', armor = 'leather', clothColor = 0x7a5c3e, armorColor = null,
    weapon = 'sword', shield = false, cloak = false, cloakColor = 0x5b2e2a,
    skirt = true, female = false, scale = 1, crown = false, feather = false,
  } = spec;
  const mats = MATS();
  const cMat = colorMat(clothColor);
  const aMat = armorColor != null
    ? colorMat(armorColor, armor === 'plate' ? 0.35 : 0.6, armor === 'plate' || armor === 'lamellar' ? 0.7 : 0.1)
    : armor === 'plate' ? mats.steel : armor === 'lamellar' ? mats.bronze : cMat;

  const group = new THREE.Group();
  const rig = {};
  const sw = female ? 0.86 : 1;

  // legs — TWO segments (thigh + shin) hinged at a real KNEE joint, so the gait can flex the
  // knee through the swing phase to clear the foot. A single rigid pendulum reads as robotic.
  // Same overall length and standing pose as before (hip 0.9 → foot −0.84).
  const thighGeo = new THREE.CylinderGeometry(0.075, 0.066, 0.42, 8);
  const shinGeo = new THREE.CylinderGeometry(0.064, 0.06, 0.42, 8);
  const heavy = armor === 'plate' || armor === 'lamellar' || armor === 'royal';
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.125 * side * sw, 0.9, 0);
    const thigh = mesh(thighGeo, cMat); thigh.position.y = -0.21; hip.add(thigh);
    const kneePivot = new THREE.Group(); kneePivot.position.y = -0.42; hip.add(kneePivot);
    const knee = mesh(new THREE.SphereGeometry(0.065, 8, 6), heavy ? aMat : cMat); kneePivot.add(knee);
    const shin = mesh(shinGeo, cMat); shin.position.y = -0.21; kneePivot.add(shin);
    if (heavy) {
      const greave = mesh(new THREE.CylinderGeometry(0.07, 0.062, 0.3, 8), aMat);
      greave.position.y = -0.24; kneePivot.add(greave);
    }
    const foot = mesh(new THREE.SphereGeometry(0.09, 8, 6), mats.woodDark);
    foot.scale.set(1, 0.55, 1.7);
    foot.position.set(0, -0.42, 0.05); kneePivot.add(foot);
    group.add(hip);
    rig[side === -1 ? 'legL' : 'legR'] = hip;
    rig[side === -1 ? 'shinL' : 'shinR'] = kneePivot;
  }

  // torso pivot — raised with the longer legs
  const torso = new THREE.Group();
  torso.position.y = 0.9;
  group.add(torso);
  rig.torso = torso;
  rig.tY = 0.9;

  if (skirt) {
    const sk = mesh(new THREE.CylinderGeometry(0.22 * sw, 0.3 * sw, 0.34, 8), cMat);
    sk.position.y = 0.08;
    torso.add(sk);
    // hanging cloth panels (front/back) that sway while walking
    for (const dir of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.02, dir * 0.16 * sw);
      const panel = mesh(new THREE.BoxGeometry(0.24 * sw, 0.3, 0.03), cMat);
      panel.position.y = -0.15;
      pivot.add(panel);
      torso.add(pivot);
      rig[dir === 1 ? 'skirtF' : 'skirtB'] = pivot;
    }
  }
  const chest = mesh(new THREE.CylinderGeometry(0.215 * sw, 0.155 * sw, 0.55, 10), aMat);
  chest.position.y = 0.45;
  torso.add(chest);
  // layered cuirass + waist tassets for armored troops
  if (heavy) {
    const plate = mesh(new THREE.SphereGeometry(0.19 * sw, 10, 8), aMat);
    plate.scale.set(1.06, 1.3, 0.62);
    plate.position.set(0, 0.5, 0.07);
    torso.add(plate);
    for (let i = -1; i <= 1; i++) {
      const tasset = mesh(new THREE.BoxGeometry(0.11 * sw, 0.16, 0.03), aMat);
      tasset.position.set(i * 0.13 * sw, 0.13, 0.18 * sw);
      tasset.rotation.x = 0.18;
      torso.add(tasset);
    }
  }
  // neck
  const neck = mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 8), mats[skin]);
  neck.position.y = 0.77;
  torso.add(neck);
  // belt with buckle
  const belt = mesh(new THREE.CylinderGeometry(0.205 * sw, 0.205 * sw, 0.07, 8), mats.woodDark);
  belt.position.y = 0.22;
  torso.add(belt);
  const buckle = mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), mats.gold);
  buckle.position.set(0, 0.22, 0.2 * sw);
  torso.add(buckle);
  // side gear: scabbard for swordsmen, quiver for archers
  if (weapon === 'sword' || weapon === 'dagger') {
    const scab = mesh(new THREE.BoxGeometry(0.05, 0.42, 0.08), mats.woodDark);
    scab.position.set(-0.22 * sw, 0.06, 0.02);
    scab.rotation.z = 0.18;
    torso.add(scab);
  } else if (weapon === 'bow') {
    const quiver = mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.4, 6), mats.wood);
    quiver.position.set(0.16 * sw, 0.45, -0.18);
    quiver.rotation.x = 0.35; quiver.rotation.z = -0.3;
    torso.add(quiver);
    for (let i = 0; i < 3; i++) {
      const shaft = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 3), mats.woodDark);
      shaft.position.set(0.14 * sw + i * 0.025, 0.68, -0.24);
      shaft.rotation.x = 0.35; shaft.rotation.z = -0.3;
      torso.add(shaft);
    }
  }
  if (armor === 'lamellar' || armor === 'plate' || armor === 'royal') {
    const band = mesh(new THREE.CylinderGeometry(0.225 * sw, 0.225 * sw, 0.1, 8), armor === 'royal' ? mats.gold : mats.relief);
    band.position.y = 0.32;
    torso.add(band);
    for (const side of [-1, 1]) {
      const pad = mesh(new THREE.SphereGeometry(0.125, 9, 7), aMat);
      pad.scale.set(1, 0.8, 1);
      pad.position.set(0.26 * side * sw, 0.68, 0);
      torso.add(pad);
    }
  }
  if (cloak) {
    const ck = mesh(new THREE.PlaneGeometry(0.5, 0.95, 1, 3), colorMat(cloakColor, 0.85));
    ck.material.side = THREE.DoubleSide;
    ck.position.set(0, 0.25, -0.24);
    ck.rotation.x = 0.12;
    torso.add(ck);
    rig.cloak = ck;
  }

  // head
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.82;
  torso.add(headPivot);
  rig.head = headPivot;
  const head = mesh(new THREE.SphereGeometry(0.16, 10, 8), mats[skin]);
  head.position.y = 0.12;
  headPivot.add(head);
  // face: nose, eyes, brows — readable identity when zoomed in
  const nose = mesh(new THREE.ConeGeometry(0.03, 0.07, 4), mats[skin]);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.12, 0.16);
  headPivot.add(nose);
  const eyeMat = colorMat(0x1c140e, 0.4);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), eyeMat);
    eye.position.set(side * 0.055, 0.145, 0.135);
    headPivot.add(eye);
    const brow = mesh(new THREE.BoxGeometry(0.05, 0.014, 0.02), mats[hair] || eyeMat);
    brow.position.set(side * 0.055, 0.175, 0.14);
    headPivot.add(brow);
  }

  if (hairStyle === 'long') {
    const h = mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.5, 8), mats[hair]);
    h.position.set(0, -0.08, -0.08);
    headPivot.add(h);
    const cap = mesh(new THREE.SphereGeometry(0.165, 8, 6), mats[hair]);
    cap.position.y = 0.16; cap.scale.set(1, 0.8, 1);
    headPivot.add(cap);
  } else if (hairStyle === 'short') {
    const cap = mesh(new THREE.SphereGeometry(0.165, 8, 6), mats[hair]);
    cap.position.y = 0.17; cap.scale.set(1, 0.7, 1);
    headPivot.add(cap);
  }
  if (beard === 'full' || beard === 'white' || beard === 'twobranch') {
    const bm = beard === 'white' ? mats.hairWhite : mats[hair];
    if (beard === 'twobranch') {
      // Rostam's famous forked beard
      for (const side of [-1, 1]) {
        const b = mesh(new THREE.ConeGeometry(0.05, 0.26, 5), bm);
        b.position.set(0.05 * side, -0.05, 0.12);
        b.rotation.x = Math.PI; b.rotation.z = side * 0.22;
        headPivot.add(b);
      }
    } else {
      const b = mesh(new THREE.ConeGeometry(0.09, 0.24, 6), bm);
      b.position.set(0, -0.03, 0.1);
      b.rotation.x = Math.PI;
      headPivot.add(b);
    }
  }
  if (helmet === 'spangenhelm' || helmet === 'crest') {
    const hm = mesh(new THREE.SphereGeometry(0.175, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), mats.iron);
    hm.position.y = 0.16;
    headPivot.add(hm);
    const spike = mesh(new THREE.ConeGeometry(0.03, 0.12, 5), mats.iron);
    spike.position.y = 0.34;
    headPivot.add(spike);
    // cheek guards + neck guard
    for (const side of [-1, 1]) {
      const cheek = mesh(new THREE.BoxGeometry(0.035, 0.12, 0.09), mats.iron);
      cheek.position.set(side * 0.145, 0.06, 0.06);
      headPivot.add(cheek);
    }
    const nape = mesh(new THREE.BoxGeometry(0.2, 0.09, 0.04), mats.iron);
    nape.position.set(0, 0.05, -0.14);
    nape.rotation.x = -0.3;
    headPivot.add(nape);
    if (helmet === 'crest') {
      const crest = mesh(new THREE.BoxGeometry(0.03, 0.12, 0.26), mats.clothRed);
      crest.position.y = 0.34;
      headPivot.add(crest);
    }
  } else if (helmet === 'cap') {
    const hm = mesh(new THREE.ConeGeometry(0.16, 0.22, 8), cMat);
    hm.position.y = 0.26;
    headPivot.add(hm);
  }
  if (crown) {
    const cr = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 8), mats.gold);
    cr.position.y = 0.27;
    headPivot.add(cr);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pt = mesh(new THREE.ConeGeometry(0.03, 0.1, 4), mats.gold);
      pt.position.set(Math.cos(a) * 0.15, 0.36, Math.sin(a) * 0.15);
      headPivot.add(pt);
    }
  }
  if (feather) {
    const f = mesh(new THREE.PlaneGeometry(0.1, 0.4), mats.featherGlow);
    f.position.set(0.08, 0.45, -0.05);
    f.rotation.z = -0.3;
    headPivot.add(f);
  }

  // arms: shoulder pivot → upper arm → ELBOW pivot → forearm/wrap/hand. The elbow lets the
  // forearm flex independently so arms bend through a swing instead of staying ramrod-straight
  // (a single rigid cylinder is the classic "stiff puppet" tell). Rest geometry is unchanged:
  // with both pivots at angle 0 every piece sits exactly where the old one-piece arm did.
  const upperGeo = new THREE.CylinderGeometry(0.058, 0.052, 0.34, 8);
  const foreGeo = new THREE.CylinderGeometry(0.052, 0.05, 0.34, 8);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.28 * side * sw, 0.64, 0);
    const upper = mesh(upperGeo, side === 1 ? aMat : cMat);
    upper.position.y = -0.17;
    pivot.add(upper);
    const fore = new THREE.Group();   // elbow
    fore.position.y = -0.34;
    pivot.add(fore);
    const foreArm = mesh(foreGeo, side === 1 ? aMat : cMat);
    foreArm.position.y = -0.17;
    fore.add(foreArm);
    const wrap = mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.17, 8), mats.woodDark);
    wrap.position.y = -0.16;
    fore.add(wrap);
    const hand = mesh(new THREE.SphereGeometry(0.052, 8, 6), mats[skin]);
    hand.position.y = -0.28;
    fore.add(hand);
    torso.add(pivot);
    rig[side === -1 ? 'armL' : 'armR'] = pivot;
    rig[side === -1 ? 'foreL' : 'foreR'] = fore;
  }
  // weapon in right hand (mounted on the forearm so it tracks the elbow)
  if (weapon && weapon !== 'none') {
    const w = makeWeapon(weapon);
    w.position.set(0, -0.26, 0.05);
    if (weapon === 'bow') w.rotation.z = 0.2;
    rig.foreR.add(w);
    rig.weapon = w;
  }
  if (shield) {
    const sh = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 14), mats.bronze);
    sh.rotation.z = Math.PI / 2;
    sh.position.set(-0.08, -0.1, 0.1);
    rig.foreL.add(sh);
    const boss = mesh(new THREE.SphereGeometry(0.065, 8, 6), mats.gold);
    boss.position.set(-0.135, -0.1, 0.1);
    rig.foreL.add(boss);
    // rim ring
    const rim = mesh(new THREE.TorusGeometry(0.27, 0.018, 6, 18), mats.gold);
    rim.rotation.y = Math.PI / 2;
    rim.position.set(-0.105, -0.1, 0.1);
    rig.foreL.add(rim);
  }

  group.scale.setScalar(scale);
  group.userData.rig = rig;
  return { group, rig };
}

// ---------- procedural animation helpers ----------
export function animWalk(rig, t, speed = 1, stride = 0.55) {
  const f = t * 7 * speed;                       // one full stride per 2π
  const lift = Math.min(1.6, stride * 2.6);      // knee-flex amplitude
  // Hip swings the thigh forward/back (−x = forward); the KNEE flexes through the swing phase
  // (when the leg is lifting/passing) so the foot clears the ground — the key to a natural gait.
  rig.legL.rotation.x = -stride * Math.cos(f);
  rig.legR.rotation.x = -stride * Math.cos(f + Math.PI);
  if (rig.shinL) rig.shinL.rotation.x = lift * Math.max(0, Math.sin(f - Math.PI));
  if (rig.shinR) rig.shinR.rotation.x = lift * Math.max(0, Math.sin(f));
  // arms swing opposite the same-side leg, but TRAIL the legs slightly (phase lag) so the
  // motion reads as loose limbs dragged by the body rather than rigid clockwork.
  rig.armL.rotation.x = stride * 0.58 * Math.cos(f - 0.5);
  if (!rig._attacking) rig.armR.rotation.x = stride * 0.58 * Math.cos(f + Math.PI - 0.5);
  if (rig.foreL) rig.foreL.rotation.x = 0.25 + Math.max(0, Math.sin(f)) * 0.3;       // elbows held, swing a touch
  if (rig.foreR && !rig._attacking) rig.foreR.rotation.x = 0.25 + Math.max(0, Math.sin(f + Math.PI)) * 0.3;
  // body bob (one dip per step = 2× leg freq) + counter-rotation + WEIGHT TRANSFER roll onto
  // the planted foot (z-roll synced to the stride) + forward lean that scales with pace.
  rig.torso.position.y = (rig.tY || 0.78) + Math.abs(Math.sin(f)) * 0.035;
  rig.torso.rotation.y = Math.sin(f) * 0.06;
  rig.torso.rotation.z = Math.sin(f) * 0.05;            // hips/shoulders rock side to side
  rig.torso.rotation.x = 0.05 * Math.min(1.4, speed);
  if (rig.head) {
    rig.head.rotation.y = Math.sin(t * 0.7) * 0.16;     // glances around
    rig.head.rotation.z = -Math.sin(f) * 0.03;          // head stays level against the body roll
    rig.head.position.y = 0.82 + Math.abs(Math.sin(f)) * 0.008;
  }
  if (rig.skirtF) { rig.skirtF.rotation.x = -stride * 0.4 * Math.cos(f - 0.6); rig.skirtB.rotation.x = -stride * 0.4 * Math.cos(f + Math.PI - 0.6); }
  if (rig.cloak) { rig.cloak.rotation.x = 0.12 + Math.abs(Math.sin(f)) * 0.16 * speed; rig.cloak.rotation.z = Math.sin(f - 0.7) * 0.06; }
}

// Idle is where lifelessness shows most — a frozen statue breaks immersion. Layer several slow,
// out-of-phase oscillators (breath, weight-shift, look-around, micro-fidget) so the figure never
// holds a pose and never visibly loops.
export function animIdle(rig, t) {
  rig.legL.rotation.x = 0; rig.legR.rotation.x = 0;
  if (rig.shinL) rig.shinL.rotation.x = 0;
  if (rig.shinR) rig.shinR.rotation.x = 0;
  const breath = Math.sin(t * 1.5);                      // chest rise/fall
  const shift = Math.sin(t * 0.42);                      // slow weight-shift between feet (~15s cycle)
  if (!rig._attacking) rig.armR.rotation.x = breath * 0.05 + 0.03 + Math.sin(t * 0.9 + 2) * 0.02;
  rig.armL.rotation.x = breath * 0.05 + 0.03 + Math.sin(t * 0.9) * 0.02;
  if (rig.foreL) rig.foreL.rotation.x = 0.2 + breath * 0.03;
  if (rig.foreR && !rig._attacking) rig.foreR.rotation.x = 0.2 + breath * 0.03;
  rig.torso.position.y = (rig.tY || 0.78) + breath * 0.012;
  rig.torso.rotation.z = shift * 0.045;                  // sway weight onto one hip, then the other
  rig.torso.rotation.y = Math.sin(t * 0.31) * 0.05;
  rig.torso.rotation.x = 0;
  if (rig.head) {
    // mostly still, with slow look-arounds layered from a few primes so it doesn't obviously repeat
    rig.head.rotation.y = Math.sin(t * 0.37) * 0.17 + Math.sin(t * 0.11) * 0.1;
    rig.head.rotation.x = Math.sin(t * 0.53) * 0.04 - 0.02;
    rig.head.rotation.z = -shift * 0.03;
  }
  if (rig.cloak) rig.cloak.rotation.x = 0.12 + Math.sin(t * 0.8) * 0.025;
}

// progress 0..1 — a real swing arc: slow anticipatory wind-up (ease-in), a fast strike that
// drives PAST neutral into follow-through (ease-out), then a small recoil that settles the pose.
// The torso coils with the arm and uncoils into the blow so the whole body commits to the hit.
export function animAttack(rig, progress) {
  rig._attacking = progress < 1;
  const p = Math.min(1, Math.max(0, progress));
  let armX, coil, lean;
  if (p < 0.42) {
    const k = easeInQuad(p / 0.42);          // wind up: slow, gathering — the anticipation beat
    armX = 1.5 * k;                          // arm rotates up/back
    coil = 0.22 * k;                         // shoulders rotate away to load the swing
    lean = -0.05 * k;                        // weight shifts back
  } else {
    const k = (p - 0.42) / 0.58;
    const strike = easeOutCubic(k);          // fast down-snap that decelerates into follow-through
    armX = 1.5 - 2.6 * strike;               // through neutral to a committed −1.1 follow-through
    coil = 0.22 - 0.36 * strike;             // uncoil past neutral, shoulders drive forward
    lean = -0.05 + 0.14 * strike;            // weight pitches forward into the blow
    if (k > 0.82) armX += (easeOutBack((k - 0.82) / 0.18) - 1) * 0.4; // brief recoil settle
  }
  rig.armR.rotation.x = armX;
  if (rig.foreR) rig.foreR.rotation.x = 0.2 + Math.max(0, armX) * 0.4; // forearm cocks with the raise
  if (rig.torso) { rig.torso.rotation.y = coil; rig.torso.rotation.x = lean; }
  if (rig.head) rig.head.rotation.x = lean * 0.6;
  if (p >= 1) rig._attacking = false;
}

export function animHit(group, intensity = 0.12) {
  group.position.x += (Math.random() - 0.5) * intensity;
  group.position.z += (Math.random() - 0.5) * intensity;
}
