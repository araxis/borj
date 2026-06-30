// Creature + enemy model recipes. Every ledger enemy maps to a distinct, detailed
// silhouette: humans stay human (armor, banners, cultural identity); divs are massive
// and horned; beasts are muscular jointed quadrupeds; serpents/worms are ridged crawlers.
// CONVENTION: models FACE +Z (enemy.update rotates +Z along the road tangent).
// Returns { group, rig, animType: 'biped'|'quad'|'serpent'|'fly', headH }
import * as THREE from 'three';
import { MATS, MeshBuilder } from './materials.js';
import { buildHumanoid, colorMat, makeWeapon } from './humanoid.js';
import { spawnAsset, rotFix, cloneAssetScene } from '../core/assets.js';

// Per-weapon normalization for the STATIC weapon GLBs (modeled vertical, centered at origin):
// scale to game size + offset so the GRIP (not the mesh center) sits at the hand attach point.
// Tuned by eye; the hand-scale-compensation + Mixamo 180°-X flip in assetCharacter still apply on top,
// exactly as for procedural makeWeapon groups. Falls through to makeWeapon when no GLB is loaded.
// Per-weapon idle CARRY. Each weapon hangs differently — a sword rests tip-down, a spear stands
// tip-up — so these are tuned per kind. rotX/Y/Z (radians) were computed by aiming the weapon's
// long axis at a target WORLD direction in the idle pose (weapontest3 __aim) — needed because the
// rotated Mixamo hand bone cones a single tilt; y seats the grip at the hand.
const D = Math.PI / 180;
const WEAPON_FIX = {
  sword: { scale: 0.40, rotX: 162 * D, y: 0 },                          // shamshir: hangs tip-DOWN, slight angle, grip at hip
  mace:  { scale: 0.40, rotX: -50 * D, y: 0.15 },                       // gorz: carried forward / in front
  spear: { scale: 0.85, rotX: 0.5 * D, rotY: 0.1 * D, rotZ: 24.2 * D, y: 0 }, // neyzeh: DEAD vertical, tip-UP, tall (tip above head, butt near ground)
  staff: { scale: 0.42, rotX: 19.5 * D, rotY: 1 * D, rotZ: 5.7 * D, y: 0 },  // scepter: vertical, tip-UP
  bow:   { scale: 0.42, rotX: 16.1 * D, rotY: 1.3 * D, rotZ: 9 * D, y: 0 },  // kaman: vertical at the side
  axe:   { scale: 0.40, rotX: 47.9 * D, rotY: 3.9 * D, rotZ: 8.7 * D, y: 0.05 }, // tabarzin: head up-forward
  // new weapons — initial angles seeded from the closest existing weapon; calibrated below
  lance:   { scale: 0.90, rotX: 0.5 * D, rotY: 0.1 * D, rotZ: 24.2 * D, y: 0 },  // like spear: dead vertical, tip-UP, long
  halberd: { scale: 0.85, rotX: 0.5 * D, rotY: 0.1 * D, rotZ: 24.2 * D, y: 0 },  // like spear: vertical, tip-UP
  hammer:  { scale: 0.42, rotX: 180 * D, rotZ: 25 * D, y: 0.05 },                // q_knight hand (no flip): head-UP, slight cant
  dagger:  { scale: 0.38, rotX: 162 * D, y: 0 },                                 // like sword: hangs tip-DOWN at hip
  banner:  { scale: 0.90, rotX: 0.5 * D, rotY: 0.1 * D, rotZ: 24.2 * D, y: 0 },  // like spear: dead vertical, tip-UP
  lantern: { scale: 0.40, rotX: 0.5 * D, rotY: 0.1 * D, rotZ: 24.2 * D, y: 0 },  // vertical, upright glowing at the side
};
function weaponModel(kind) {
  const scene = cloneAssetScene('a_wpn_' + kind);
  if (!scene) return makeWeapon(kind);
  const f = WEAPON_FIX[kind] || { scale: 0.5, y: 0 };
  scene.scale.setScalar(f.scale);
  scene.rotation.set(f.rotX || 0, f.rotY || 0, f.rotZ || 0);
  scene.position.y = f.y || 0;
  const g = new THREE.Group();
  g.add(scene);
  return g;
}

// GLTF character upgrade: spawn a skeletally-animated character (CC0) and put one
// of our Persian weapons in its hand bone. Returns null when the asset isn't
// loaded → callers fall back to the procedural humanoid.
function assetCharacter(assetKey, { tint = null, height = 1.7, weapon = null, weaponScale = 1.1, walkStride = null } = {}) {
  const inst = spawnAsset(assetKey, { height, tint, walkStride });
  if (!inst) return null;
  const group = new THREE.Group();
  inst.group.rotation.y = rotFix(assetKey); // normalize to our +Z-forward convention
  group.add(inst.group);
  if (weapon) {
    let hand = null;
    inst.group.traverse((o) => {
      if (!hand && o.isBone && /hand/i.test(o.name) && /(_r|\.r|r$|right)/i.test(o.name)) hand = o;
    });
    if (hand) {
      const w = weaponModel(weapon); // GLB weapon if available, else procedural makeWeapon
      // compensate the FULL world scale of the hand bone (armature exports often
      // carry large compensating scales on the skeleton, not just the root)
      group.updateMatrixWorld(true);
      const ws = hand.getWorldScale(new THREE.Vector3());
      w.scale.setScalar(weaponScale / Math.max(0.0001, ws.y));
      // Mixamo-style hand bones point +Y DOWN the fingers (q_knight's point +Y up out of the
      // fist), so a handle-along-+Y weapon attaches pointing at the ground — flip 180° about X
      // to carry it upright. Scoped by the Mixamo "RightHand"/"LeftHand" name so q_knight is unaffected.
      if (/^(left|right)hand$/i.test(hand.name)) w.rotation.x = Math.PI;
      hand.add(w); // hand bones hold handles along their +Y, same as our weapons
    }
  }
  inst.play('idle');
  return {
    group,
    rig: {},
    anim: inst,
    animType: 'gltf',
    headH: height,
    assetKey,
    visualSource: `asset:${assetKey}`,
    actionNames: Object.keys(inst.actions || {}),
  };
}

// dev-only: build a rigged soldier holding any weapon kind, for hand-angle calibration.
// Returns null if the GLB asset isn't loaded (so callers can detect preload state).
export function buildWeaponTestModel(weapon, asset = 'a_soldier_heavy', height = 1.8) {
  return assetCharacter(asset, { weapon, height });
}

// rigged hero commander that stands on the tower it leads (idle clip + bone-attached signature weapon).
// Returns null when the hero GLB isn't loaded (caller skips the figure — ring-only, as before).
const HERO_HEIGHT = { rostam: 1.95, sohrab: 1.78, gordafarid: 1.68, tahmineh: 1.7, zal: 1.82, simurgh: 1.9 };
export function heroModel(heroDef) {
  if (!heroDef) return null;
  const key = 'Hero_' + heroDef.id.replace(/-/g, '_');
  const noAttach = !heroDef.weapon || heroDef.weapon === 'talon' || heroDef.weapon === 'token';
  return assetCharacter(key, { height: HERO_HEIGHT[heroDef.id] || 1.78, weapon: noAttach ? null : heroDef.weapon });
}

function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; }

function mountedTackGroup(kind = 'scout') {
  const mats = MATS();
  const heroic = kind === 'rakhsh';
  const group = new THREE.Group();
  const cloth = heroic ? mats.clothRed : mats.clothGold;
  const trim = heroic ? mats.gold : mats.bronze;
  const leather = mats.woodDark || mats.wood;

  const pad = mesh(new THREE.BoxGeometry(0.62, 0.05, 0.78), cloth);
  pad.position.set(0, 1.17, -0.08);
  group.add(pad);
  for (const z of [-0.46, 0.3]) {
    const band = mesh(new THREE.BoxGeometry(0.66, 0.06, 0.035), trim);
    band.position.set(0, 1.2, z);
    group.add(band);
  }
  for (const side of [-1, 1]) {
    const girth = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 6), leather);
    girth.position.set(side * 0.31, 0.96, -0.08);
    girth.rotation.x = 0.12;
    group.add(girth);
    for (const z of [-0.28, 0.12]) {
      const boss = mesh(new THREE.SphereGeometry(heroic ? 0.055 : 0.045, 8, 6), trim);
      boss.scale.set(1, 0.52, 1);
      boss.position.set(side * 0.34, 1.16, z);
      group.add(boss);
    }
    if (heroic) {
      const staff = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 6), mats.woodDark);
      staff.position.set(side * 0.42, 1.42, -0.4);
      group.add(staff);
      const drafsh = mesh(new THREE.PlaneGeometry(0.26, 0.18), mats.clothRed);
      drafsh.position.set(side * 0.42, 1.55, -0.4);
      drafsh.rotation.y = side * Math.PI / 2;
      group.add(drafsh);
      const edge = mesh(new THREE.BoxGeometry(0.016, 0.19, 0.018), mats.gold);
      edge.position.set(side * 0.42, 1.55, -0.27);
      group.add(edge);
    }
  }
  return group;
}

// ---------- jointed quadruped ----------
// Two-mass body (chest + hindquarters), two-segment legs with knees and paws,
// detailed head (skull, muzzle, jaw, ears, eyes), segmented tail.
function quadLeg(mat, x, y, z, legH, legR, pawMat) {
  const hip = new THREE.Group();
  hip.position.set(x, y, z);
  const uLen = legH * 0.55;
  const upper = mesh(new THREE.CylinderGeometry(legR * 1.3, legR, uLen, 7), mat);
  upper.position.y = -uLen / 2;
  hip.add(upper);
  const knee = new THREE.Group();
  knee.position.y = -uLen;
  hip.add(knee);
  const lLen = legH * 0.52;
  const lower = mesh(new THREE.CylinderGeometry(legR * 0.85, legR * 0.65, lLen, 6), mat);
  lower.position.y = -lLen / 2;
  knee.add(lower);
  const paw = mesh(new THREE.SphereGeometry(legR * 1.5, 8, 6), pawMat || mat);
  paw.scale.set(1, 0.55, 1.6);
  paw.position.set(0, -lLen, legR * 0.6);
  knee.add(paw);
  return { hip, knee, paw };
}

export function buildQuad(opts) {
  const {
    bodyMat, bellyMat = bodyMat, bodyLen = 1.5, bodyR = 0.32, legH = 0.75, legR = 0.07,
    neckLen = 0.45, neckUp = 0.55, headR = 0.18, scale = 1, pawMat = null,
    earSize = 0.07, muzzleLen = 0.2, gait = { hip: 0.55, knee: 0.85, rate: 8 },
    spineMat = null, fangs = false,
  } = opts;
  const group = new THREE.Group();
  const rig = { legs: [], gait };

  const bodyY = legH + bodyR * 0.36; // grounded stance, not balloon-on-stilts
  const body = new THREE.Group();
  body.position.y = bodyY;
  group.add(body);
  rig.body = body;
  rig.bodyY = bodyY;

  // chest + hindquarters masses heavily overlapped into one muscular body
  const chest = mesh(new THREE.SphereGeometry(bodyR * 1.18, 11, 9), bodyMat);
  chest.position.z = bodyLen * 0.2;
  chest.scale.set(1, 0.94, 1.45);
  body.add(chest);
  const hind = mesh(new THREE.SphereGeometry(bodyR * 1.1, 11, 9), bodyMat);
  hind.position.z = -bodyLen * 0.24;
  hind.scale.set(0.94, 0.9, 1.35);
  body.add(hind);
  const belly = mesh(new THREE.CylinderGeometry(bodyR * 0.78, bodyR * 0.85, bodyLen * 0.6, 9), bellyMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.y = -bodyR * 0.22;
  belly.scale.y = 0.82; // tucked waist
  body.add(belly);
  // darker dorsal stripe along the spine (kills the uniform-plastic look)
  if (spineMat) {
    const stripe = mesh(new THREE.CylinderGeometry(bodyR * 0.5, bodyR * 0.55, bodyLen * 0.85, 8), spineMat);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = bodyR * 0.62;
    stripe.scale.y = 0.5;
    body.add(stripe);
  }

  // legs (front pair under chest, rear pair under hind) with a natural outward splay
  for (const fz of [bodyLen * 0.3, -bodyLen * 0.32]) {
    for (const fx of [-1, 1]) {
      const leg = quadLeg(bodyMat, fx * bodyR * 0.66, -bodyR * 0.35, fz, legH, legR, pawMat);
      leg.hip.rotation.z = -fx * 0.06;
      body.add(leg.hip);
      rig.legs.push(leg);
    }
  }

  // neck + head at +Z (FRONT)
  const neck = new THREE.Group();
  neck.position.set(0, bodyR * 0.5, bodyLen * 0.42);
  body.add(neck);
  rig.neck = neck;
  const neckMesh = mesh(new THREE.CylinderGeometry(bodyR * 0.42, bodyR * 0.62, neckLen, 8), bodyMat);
  neckMesh.position.set(0, neckLen * neckUp * 0.5, neckLen * 0.35);
  neckMesh.rotation.x = -0.9 + neckUp;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.set(0, neckLen * neckUp, neckLen * 0.72);
  neck.add(head);
  rig.head = head;
  const skull = mesh(new THREE.SphereGeometry(headR, 9, 7), bodyMat);
  skull.scale.set(0.85, 0.82, 1.0);
  head.add(skull);
  const muzzle = mesh(new THREE.BoxGeometry(headR * 0.9, headR * 0.62, muzzleLen), bodyMat);
  muzzle.position.set(0, -headR * 0.15, headR * 0.7 + muzzleLen * 0.4);
  head.add(muzzle);
  rig.muzzle = muzzle;
  const nose = mesh(new THREE.BoxGeometry(headR * 0.4, headR * 0.22, 0.03), colorMat(0x241a14, 0.9));
  nose.position.set(0, 0, headR * 0.7 + muzzleLen * 0.92);
  head.add(nose);
  const jaw = mesh(new THREE.BoxGeometry(headR * 0.7, headR * 0.22, muzzleLen * 0.85), bodyMat);
  jaw.position.set(0, -headR * 0.48, headR * 0.6 + muzzleLen * 0.35);
  head.add(jaw);
  rig.jaw = jaw;
  // brow ridge + cheeks ground the face; optional fangs + tongue for predators
  const browR = mesh(new THREE.BoxGeometry(headR * 1.05, headR * 0.22, headR * 0.4), bodyMat);
  browR.position.set(0, headR * 0.42, headR * 0.45);
  head.add(browR);
  if (fangs) {
    const mats2 = MATS();
    for (const side of [-0.6, -0.2, 0.2, 0.6]) {
      const tooth = mesh(new THREE.ConeGeometry(headR * 0.07, headR * 0.22, 4), mats2.stoneWhite);
      tooth.position.set(side * headR * 0.4, -headR * 0.3, headR * 0.7 + muzzleLen * 0.5);
      tooth.rotation.x = Math.PI;
      head.add(tooth);
    }
    const tongue = mesh(new THREE.BoxGeometry(headR * 0.3, headR * 0.08, muzzleLen * 0.6), colorMat(0xa03030, 0.7));
    tongue.position.set(0, -headR * 0.4, headR * 0.55 + muzzleLen * 0.3);
    head.add(tongue);
  }
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(earSize, earSize * 1.8, 6), bodyMat);
    ear.position.set(side * headR * 0.6, headR * 0.75, -headR * 0.1);
    ear.rotation.z = -side * 0.35;
    head.add(ear);
    const cheek = mesh(new THREE.SphereGeometry(headR * 0.32, 8, 6), bodyMat);
    cheek.position.set(side * headR * 0.5, -headR * 0.12, headR * 0.4);
    head.add(cheek);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.12, 7, 6), colorMat(0x14100c, 0.35));
    eye.position.set(side * headR * 0.42, headR * 0.2, headR * 0.66);
    head.add(eye);
  }

  // segmented drooping tail at -Z (REAR)
  const tailSegs = [];
  let parent = body;
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? bodyR * 0.45 : 0, i === 0 ? -bodyLen * 0.52 : -bodyLen * 0.15);
    seg.rotation.x = i === 0 ? 0.55 : 0.3; // natural droop
    const tm = mesh(new THREE.CylinderGeometry(0.032 - i * 0.007, 0.025 - i * 0.007, bodyLen * 0.16, 5), bodyMat);
    tm.rotation.x = Math.PI / 2;
    tm.position.z = -bodyLen * 0.075;
    seg.add(tm);
    parent.add(seg);
    tailSegs.push(seg);
    parent = seg;
  }
  rig.tailSegs = tailSegs;
  rig.tailTip = parent;

  group.scale.setScalar(scale);
  return { group, rig };
}

// Smooth heraldic mane ruff (no spiky cones): layered rounded shells for the mass
// plus soft elongated lobes around the rim. Built at origin facing +Z, merged to
// ~6 draw calls. Sized for a head of radius ~0.24.
function lionManeGroup() {
  const B = new MeshBuilder();
  const shell = (r, sx, sy, sz, z, key) => B.add(new THREE.SphereGeometry(r, 22, 16), key,
    new THREE.Matrix4().compose(new THREE.Vector3(0, -0.02, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
  shell(0.46, 1.16, 1.18, 0.92, -0.1, 'lionManeOuter'); // outer mass (fuller depth, not a flat disc)
  shell(0.4, 1.12, 1.12, 0.85, -0.04, 'lionManeMid');   // amber mid
  shell(0.33, 1.08, 1.05, 0.78, 0.02, 'lionManeInner'); // warm ring near the face
  // soft rounded lobes around the silhouette (a tufted edge, not spikes)
  const LOBE = new THREE.SphereGeometry(1, 9, 7);
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / 2;
    const gold = i % 5 === 0;
    const key = gold ? 'lionManeGold' : (i % 2 ? 'lionManeMid' : 'lionManeInner');
    const w = 0.1 + (i % 2) * 0.015;
    B.add(LOBE, key, new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * 0.49, -0.02 + Math.sin(a) * 0.49, -0.1),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)),
      new THREE.Vector3(w * 1.15, w * 1.35, w))); // rounded lobe radiating outward
  }
  return B.build(true, false);
}

// The lion of the Shahnameh — a bespoke, smooth-formed beast: muscular tapered
// torso, four jointed legs, a rounded lion HEAD (broad muzzle, full cheeks, round
// ears — no boxes), almond amber eyes, a warm heraldic mane, and a tufted tail.
// Fully animQuad-compatible (rig.legs/body/neck/head/jaw/tailSegs).
function buildLion(scale = 1.2) {
  const fur = MATS().lionFur;
  const belly = colorMat(0xddc190, 0.95);
  const pawMat = colorMat(0x9a763f, 0.95);
  const dark = colorMat(0x161009, 0.5);
  const group = new THREE.Group();
  const rig = { legs: [], gait: { hip: 0.55, knee: 0.95, rate: 8.5 } };

  const legH = 0.9, legR = 0.112, bodyR = 0.35, bodyLen = 1.92; // compact athletic torso
  const bodyY = legH + bodyR * 0.3 + 0.1; // lift so stance paws plant on the ground, not sink through it
  const body = new THREE.Group(); body.position.y = bodyY; group.add(body);
  rig.body = body; rig.bodyY = bodyY;

  // ---- smooth muscular torso: deep chest, lean waist, strong haunches ----
  const blob = (r, x, y, z, sx, sy, sz, m = fur) => {
    const o = mesh(new THREE.SphereGeometry(r, 16, 12), m);
    o.position.set(x, y, z); o.scale.set(sx, sy, sz); body.add(o); return o;
  };
  // Two big elongated ellipsoids (front + rear) overlapping deeply in the middle →
  // ONE smooth continuous torso, slightly deeper at chest & haunch. + hump + belly.
  blob(bodyR * 1.14, 0, 0.1, bodyLen * 0.16, 1.0, 1.12, 1.66);  // front half (chest + shoulders)
  blob(bodyR * 1.12, 0, 0.1, -bodyLen * 0.2, 1.0, 1.15, 1.62);  // rear half (loin + haunches)
  blob(bodyR * 0.66, 0, bodyR * 0.5, bodyLen * 0.16, 0.96, 0.72, 0.9); // shoulder hump (withers)
  blob(bodyR * 0.7, 0, -bodyR * 0.34, bodyLen * 0.04, 0.78, 0.5, 1.6, belly); // tucked belly underline

  // ---- four jointed legs (animQuad drives hip/knee each frame) ----
  const mkLeg = (fx, fz) => {
    const leg = quadLeg(fur, fx * bodyR * 0.72, -bodyR * 0.3, fz, legH, legR, pawMat);
    leg.hip.rotation.z = -fx * 0.04;
    body.add(leg.hip); rig.legs.push(leg);
  };
  mkLeg(-1, bodyLen * 0.3); mkLeg(1, bodyLen * 0.3);
  mkLeg(-1, -bodyLen * 0.32); mkLeg(1, -bodyLen * 0.32);

  // ---- neck (smooth, thick, arched) ----
  const neck = new THREE.Group();
  neck.position.set(0, bodyR * 0.62, bodyLen * 0.44);
  body.add(neck); rig.neck = neck;
  const neckMesh = mesh(new THREE.CylinderGeometry(bodyR * 0.66, bodyR * 0.88, 0.5, 14), fur);
  neckMesh.position.set(0, 0.15, 0.12); neckMesh.rotation.x = -0.52;
  neck.add(neckMesh);

  // ---- rounded LION HEAD ----
  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.36);
  neck.add(head); rig.head = head;
  const hR = 0.265; // larger face so it reads clearly in front of the mane
  const part = (r, x, y, z, sx, sy, sz, m = fur, sm = 14) => {
    const o = mesh(new THREE.SphereGeometry(r, sm, Math.round(sm * 0.72)), m);
    o.position.set(x, y, z); o.scale.set(sx, sy, sz); head.add(o); return o;
  };
  part(hR, 0, 0, 0, 1.0, 0.98, 1.05);                       // cranium
  part(hR * 0.78, 0, hR * 0.44, hR * 0.42, 1.0, 0.4, 0.5);  // brow ridge (higher, less overhang → less frown)
  for (const s of [-1, 1]) part(hR * 0.44, s * hR * 0.5, -hR * 0.15, hR * 0.55, 0.82, 1.0, 1.0); // cheeks
  part(hR * 0.52, 0, -hR * 0.22, hR * 1.05, 0.78, 0.8, 1.45); // muzzle (longer, narrower snout)
  part(hR * 0.31, 0, -hR * 0.3, hR * 1.5, 0.92, 0.72, 0.86, belly); // snout pad
  part(hR * 0.15, 0, -hR * 0.2, hR * 1.66, 1.1, 0.85, 0.8, dark, 10); // nose at the snout tip
  // lower jaw (rounded, hinged for the occasional snarl via rig.jaw)
  const jaw = new THREE.Group(); jaw.position.set(0, -hR * 0.46, hR * 0.5); head.add(jaw); rig.jaw = jaw;
  const jawMesh = mesh(new THREE.SphereGeometry(hR * 0.46, 14, 10), fur);
  jawMesh.scale.set(0.86, 0.6, 1.12); jawMesh.position.z = hR * 0.22; jaw.add(jawMesh);
  // almond amber eyes (socket + bright iris + pupil) with a lion "tear-line" marking
  for (const s of [-1, 1]) {
    part(hR * 0.21, s * hR * 0.49, hR * 0.12, hR * 0.78, 1.0, 0.68, 0.5, colorMat(0x3a2710, 0.7), 10); // socket
    const eye = new THREE.Mesh(new THREE.SphereGeometry(hR * 0.17, 14, 10), colorMat(0xe7af26, 0.3, 0.18));
    eye.position.set(s * hR * 0.49, hR * 0.13, hR * 0.86); eye.scale.set(1.0, 0.8, 0.66); head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(hR * 0.05, 8, 6), dark);
    pupil.position.set(s * hR * 0.49, hR * 0.12, hR * 0.96); head.add(pupil);
    // dark tear-line from the inner eye down toward the muzzle (classic lion marking)
    const line = mesh(new THREE.CylinderGeometry(hR * 0.02, hR * 0.006, hR * 0.32, 6), colorMat(0x4a3622, 0.8));
    line.position.set(s * hR * 0.42, -hR * 0.04, hR * 1.02); line.rotation.set(0.5, 0, s * 0.28); head.add(line);
  }
  // rounded ears (not pointy)
  for (const s of [-1, 1]) {
    part(hR * 0.26, s * hR * 0.62, hR * 0.6, -hR * 0.02, 0.92, 1.0, 0.46);
    part(hR * 0.15, s * hR * 0.62, hR * 0.6, hR * 0.08, 0.68, 0.88, 0.4, colorMat(0x8a6a3e, 0.85), 9);
  }
  // mane ruff, set back so the larger face & muzzle read clearly in front
  const mane = lionManeGroup();
  mane.position.set(0, -0.02, -0.26);
  head.add(mane);

  // ---- segmented tail with a tuft ----
  let parent = body; const tailSegs = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group();
    t.position.set(0, i === 0 ? bodyR * 0.5 : 0, i === 0 ? -bodyLen * 0.5 : -bodyLen * 0.13);
    t.rotation.x = i === 0 ? 0.62 : 0.34;
    const tm = mesh(new THREE.CylinderGeometry(0.05 - i * 0.008, 0.042 - i * 0.008, bodyLen * 0.15, 8), fur);
    tm.rotation.x = Math.PI / 2; tm.position.z = -bodyLen * 0.07; t.add(tm);
    parent.add(t); tailSegs.push(t); parent = t;
  }
  rig.tailSegs = tailSegs;
  const tuft = mesh(new THREE.SphereGeometry(0.1, 12, 9), colorMat(0x5e3613, 1));
  tuft.scale.set(1, 1, 1.5); tuft.position.z = -0.14; parent.add(tuft);

  group.scale.setScalar(scale);
  return { group, rig, animType: 'quad', headH: 1.55 * scale };
}

function buildElephant(scale = 1.5) {
  const mats = MATS();
  const hide = mats.elephantHide;
  const q = buildQuad({
    bodyMat: hide, bodyLen: 2.1, bodyR: 0.58, legH: 1.05, legR: 0.16,
    neckLen: 0.34, neckUp: 0.35, headR: 0.38, muzzleLen: 0.12,
    earSize: 0.05, scale,
    gait: { hip: 0.3, knee: 0.3, rate: 5 },
  });
  const head = q.rig.head;
  // great ears (flattened discs)
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.34, 8, 6), hide);
    ear.position.set(side * 0.4, 0.12, -0.04);
    ear.scale.set(0.18, 1.05, 0.8);
    ear.rotation.z = side * 0.25;
    head.add(ear);
  }
  // up-curved tusks (two segments each)
  for (const side of [-1, 1]) {
    const t1 = mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.42, 6), mats.stoneWhite);
    t1.position.set(side * 0.16, -0.3, 0.34);
    t1.rotation.x = 1.25;
    head.add(t1);
    const t2 = mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.3, 6), mats.stoneWhite);
    t2.position.set(side * 0.16, -0.36, 0.62);
    t2.rotation.x = 0.7;
    head.add(t2);
  }
  // curling trunk
  const trunkSegs = [];
  let parent = head;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? -0.12 : -0.2, i === 0 ? 0.42 : 0.03);
    const tm = mesh(new THREE.CylinderGeometry(0.1 - i * 0.014, 0.085 - i * 0.014, 0.22, 7), hide);
    tm.position.y = -0.1;
    seg.add(tm);
    parent.add(seg);
    trunkSegs.push(seg);
    parent = seg;
  }
  q.rig.trunk = trunkSegs;
  // forehead dome + headdress band
  const dome = mesh(new THREE.SphereGeometry(0.22, 8, 6), hide);
  dome.position.set(0, 0.26, 0.1);
  head.add(dome);
  const band = mesh(new THREE.BoxGeometry(0.5, 0.07, 0.34), mats.clothRed);
  band.position.set(0, 0.3, 0.12);
  head.add(band);
  // wrinkle rings on legs + toenails
  for (const leg of q.rig.legs) {
    const ring = mesh(new THREE.TorusGeometry(0.155, 0.018, 5, 10), colorMat(0xb9b4aa, 1));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.3;
    leg.hip.add(ring);
    for (let i = -1; i <= 1; i++) {
      const nail = mesh(new THREE.BoxGeometry(0.07, 0.06, 0.04), mats.stoneWhite);
      nail.position.set(i * 0.1, -0.52, 0.26);
      leg.knee.add(nail);
    }
  }
  // war saddle with rails and tassels
  const saddle = mesh(new THREE.BoxGeometry(0.74, 0.16, 1.0), mats.clothRed);
  saddle.position.y = 0.62;
  q.rig.body.add(saddle);
  const rail = mesh(new THREE.BoxGeometry(0.8, 0.16, 0.06), mats.wood);
  rail.position.set(0, 0.76, 0.5);
  q.rig.body.add(rail);
  const rail2 = rail.clone(); rail2.position.z = -0.5;
  q.rig.body.add(rail2);
  for (const side of [-1, 1]) {
    const tassel = mesh(new THREE.ConeGeometry(0.05, 0.18, 5), mats.clothGold);
    tassel.position.set(side * 0.4, 0.5, 0);
    tassel.rotation.z = Math.PI;
    q.rig.body.add(tassel);
  }
  return { ...q, animType: 'quad', headH: 2.5 * scale };
}

const _horseTone = {};
export function buildHorse({ coat = 'horseBrown', scale = 1, armored = false } = {}) {
  const mats = MATS();
  const coatMat = mats[coat];
  const darkMat = colorMat(0x171411, 0.95);
  // a sun-catching topline + a shadowed belly give the body real 3D form, so even a dark
  // coat reads as a muscled horse instead of a flat silhouette. Cached per coat.
  let tone = _horseTone[coat];
  if (!tone) {
    const lift = (f) => { const m = coatMat.clone(); m.color = coatMat.color.clone().multiplyScalar(f); return m; };
    tone = _horseTone[coat] = { belly: lift(0.7), spine: lift(1.4) };
  }
  const q = buildQuad({
    bodyMat: coatMat, bellyMat: tone.belly, spineMat: tone.spine,
    bodyLen: 1.6, bodyR: 0.3, legH: 0.92, legR: 0.055,
    neckLen: 0.6, neckUp: 0.85, headR: 0.15, muzzleLen: 0.24,
    pawMat: darkMat, scale,
    gait: { hip: 0.7, knee: 0.95, rate: 10 },
  });
  // mane ridge along the neck + forelock
  for (let i = 0; i < 4; i++) {
    const tuftM = mesh(new THREE.BoxGeometry(0.05, 0.16 - i * 0.02, 0.14), darkMat);
    tuftM.position.set(0, 0.24 + i * 0.1, 0.3 - i * 0.02 + i * 0.1);
    q.rig.neck.add(tuftM);
  }
  const forelock = mesh(new THREE.BoxGeometry(0.05, 0.1, 0.12), darkMat);
  forelock.position.set(0, 0.14, 0.05);
  q.rig.head.add(forelock);
  // tail hair
  const tailHair = mesh(new THREE.ConeGeometry(0.07, 0.5, 6), darkMat);
  tailHair.position.set(0, -0.18, -0.1);
  tailHair.rotation.x = Math.PI;
  q.rig.tailSegs[0].add(tailHair);
  if (armored) {
    const barding = mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.95, 9), mats.bronze);
    barding.rotation.x = Math.PI / 2;
    barding.position.y = 0.06;
    q.rig.body.add(barding);
    const chanfron = mesh(new THREE.BoxGeometry(0.18, 0.26, 0.1), mats.bronze);
    chanfron.position.set(0, 0.08, 0.2);
    q.rig.head.add(chanfron);
  }
  return { ...q, animType: 'quad', headH: 1.7 * scale };
}

// ---------- segmented crawlers (head leads at +Z, body trails to -Z) ----------
function buildSerpentBody({ mat, ridgeMat = null, segs = 8, r0 = 0.22, len = 2.6, headScale = 1.4, scale = 1, plates = false }) {
  const mats = MATS();
  const group = new THREE.Group();
  const rig = { segments: [] };
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const r = r0 * (1 - t * 0.55);
    const seg = mesh(new THREE.SphereGeometry(r, 9, 7), mat);
    seg.position.set(0, r0 * 0.9, -t * len);
    seg.scale.set(1, 0.9, 1.5);
    group.add(seg);
    rig.segments.push(seg);
    // dorsal ridge
    const ridge = mesh(new THREE.ConeGeometry(r * (plates ? 0.5 : 0.28), r * (plates ? 1.2 : 0.7), 4), ridgeMat || mat);
    ridge.position.y = r * 0.85;
    ridge.rotation.y = Math.PI / 4;
    seg.add(ridge);
    // belly plate
    const plate = mesh(new THREE.BoxGeometry(r * 1.3, r * 0.25, r * 1.6), colorMat(0xb9a878, 0.8));
    plate.position.y = -r * 0.75;
    seg.add(plate);
  }
  // head group at the FRONT (+Z)
  const head = new THREE.Group();
  head.position.set(0, r0 * 1.35, 0.45);
  group.add(head);
  rig.head = head;
  const skull = mesh(new THREE.SphereGeometry(r0 * headScale * 0.8, 9, 7), mat);
  skull.scale.set(1, 0.8, 1.35);
  head.add(skull);
  // brow scales
  for (const side of [-1, 1]) {
    const brow = mesh(new THREE.BoxGeometry(r0 * 0.5, r0 * 0.16, r0 * 0.6), ridgeMat || mat);
    brow.position.set(side * r0 * 0.42, r0 * 0.5, r0 * 0.3);
    brow.rotation.z = -side * 0.2;
    head.add(brow);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038 * headScale, 6, 5), mats.flame);
    eye.position.set(side * r0 * 0.45, r0 * 0.3, r0 * 0.55);
    head.add(eye);
    const fang = mesh(new THREE.ConeGeometry(0.022 * headScale, 0.1 * headScale, 4), mats.stoneWhite);
    fang.position.set(side * r0 * 0.3, -r0 * 0.25, r0 * 0.85);
    fang.rotation.x = Math.PI;
    head.add(fang);
  }
  // flicking tongue
  const tongue = mesh(new THREE.BoxGeometry(0.02, 0.012, r0 * 1.2), colorMat(0xa02828, 0.7));
  tongue.position.set(0, -r0 * 0.1, r0 * 1.5);
  head.add(tongue);
  rig.tongue = tongue;
  group.scale.setScalar(scale);
  return { group, rig };
}

function buildDragon(scale = 1.7) {
  const mats = MATS();
  const s = buildSerpentBody({ mat: mats.scale, ridgeMat: mats.scaleDark, segs: 9, r0: 0.3, len: 3.4, headScale: 1.7, scale, plates: true });
  s.group.userData.actorProfile = 'procedural-dragon';
  // horns
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.05, 0.34, 5), mats.stoneWhite);
    horn.position.set(side * 0.18, 0.3, -0.05);
    horn.rotation.x = -0.5;
    horn.rotation.z = -side * 0.3;
    s.rig.head.add(horn);
  }
  // nostril glow
  for (const side of [-1, 1]) {
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), mats.flame);
    glow.position.set(side * 0.09, -0.02, 0.62);
    s.rig.head.add(glow);
  }
  // clawed legs under segments 1 and 4
  for (const zi of [1, 4]) {
    const seg = s.rig.segments[zi];
    for (const side of [-1, 1]) {
      const leg = mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.5, 6), mats.scaleDark);
      leg.position.set(side * 0.32, -0.45, 0);
      seg.add(leg);
      const foot = mesh(new THREE.BoxGeometry(0.16, 0.07, 0.2), mats.scaleDark);
      foot.position.set(side * 0.32, -0.7, 0.05);
      seg.add(foot);
      for (let c = -1; c <= 1; c++) {
        const claw = mesh(new THREE.ConeGeometry(0.022, 0.09, 4), mats.stoneWhite);
        claw.position.set(side * 0.32 + c * 0.05, -0.7, 0.17);
        claw.rotation.x = Math.PI / 2;
        seg.add(claw);
      }
    }
  }
  // Azhdaha reads better as a grounded serpent-dragon at tower-defense scale:
  // small folded side fins, whiskers and ridge detail instead of broad blocky wings.
  const finMat = colorMat(0x344226, 0.9);
  const finGeo = new THREE.PlaneGeometry(0.46, 0.3, 2, 1);
  for (const idx of [1, 3, 5]) {
    const seg = s.rig.segments[idx];
    const k = 1 - idx * 0.08;
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.material.side = THREE.DoubleSide;
      fin.name = 'dragon-folded-side-fin';
      fin.position.set(side * (0.34 + idx * 0.018), 0.24, 0.02);
      fin.rotation.z = side * 0.72;
      fin.rotation.y = side * 0.3;
      fin.scale.setScalar(k);
      seg.add(fin);
    }
  }
  for (const side of [-1, 1]) {
    const whisker = mesh(new THREE.CylinderGeometry(0.01, 0.006, 0.72, 5), mats.scaleDark);
    whisker.name = 'dragon-head-whisker';
    whisker.position.set(side * 0.22, 0.08, 0.56);
    whisker.rotation.z = side * 1.12;
    whisker.rotation.x = 1.2;
    s.rig.head.add(whisker);
    const jawPlate = mesh(new THREE.BoxGeometry(0.16, 0.035, 0.2), mats.scaleDark);
    jawPlate.name = 'dragon-jaw-plate';
    jawPlate.position.set(side * 0.22, -0.2, 0.38);
    jawPlate.rotation.z = -side * 0.18;
    s.rig.head.add(jawPlate);
  }
  return { ...s, animType: 'serpent', headH: 1.3 * scale, visualSource: 'procedural:dragon' };
}

function buildWorm(scale = 2.0) {
  const mats = MATS();
  const s = buildSerpentBody({ mat: mats.wormFlesh, ridgeMat: colorMat(0x97816c, 0.95), segs: 10, r0: 0.4, len: 3.8, headScale: 1.1, scale });
  s.group.userData.actorProfile = 'procedural-worm';
  const bandMat = colorMat(0x7d6654, 0.96);
  const wetDark = colorMat(0x3d241d, 0.95);
  const mandibleMat = colorMat(0x71523e, 0.9);
  // segment rings (annelid look)
  s.rig.segments.forEach((seg, i) => {
    const taper = 1 - i / Math.max(14, s.rig.segments.length + 4);
    if (i % 2 === 0) {
      const ring = mesh(new THREE.TorusGeometry(0.36 * taper, 0.045, 6, 12), colorMat(0x9c8872, 0.95));
      ring.rotation.x = 0;
      seg.add(ring);
    }
    if (i > 0 && i < s.rig.segments.length - 1) {
      const saddle = mesh(new THREE.BoxGeometry(0.36 * taper, 0.055, 0.18), bandMat);
      saddle.name = 'worm-dorsal-saddle-plate';
      saddle.position.set(0, 0.32 * taper, -0.02);
      saddle.rotation.x = -0.12;
      seg.add(saddle);
    }
    if (i % 2 === 1 && i < s.rig.segments.length - 2) {
      for (const side of [-1, 1]) {
        const spur = mesh(new THREE.ConeGeometry(0.045 * taper, 0.26 * taper, 5), mandibleMat);
        spur.name = 'worm-side-grasping-spur';
        spur.position.set(side * 0.34 * taper, 0.08, 0.02);
        spur.rotation.z = -side * Math.PI / 2;
        spur.rotation.x = 0.32;
        seg.add(spur);
      }
    }
  });
  // ringed maw with teeth + inner glow at the FRONT
  const maw = mesh(new THREE.TorusGeometry(0.3, 0.1, 7, 12), colorMat(0x6e4338, 0.9));
  maw.position.set(0, 0, 0.5);
  s.rig.head.add(maw);
  const innerMaw = mesh(new THREE.TorusGeometry(0.19, 0.035, 7, 12), wetDark);
  innerMaw.name = 'worm-inner-maw-ring';
  innerMaw.position.set(0, 0, 0.565);
  s.rig.head.add(innerMaw);
  const gullet = new THREE.Mesh(new THREE.CircleGeometry(0.26, 10), colorMat(0x33150f, 1));
  gullet.position.set(0, 0, 0.52);
  s.rig.head.add(gullet);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tooth = mesh(new THREE.ConeGeometry(0.045, 0.16, 4), mats.stoneWhite);
    tooth.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0.56);
    tooth.rotation.z = a + Math.PI / 2;
    tooth.rotation.x = Math.PI / 2.4;
    s.rig.head.add(tooth);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const tooth = mesh(new THREE.ConeGeometry(0.026, 0.12, 4), mats.stoneWhite);
    tooth.name = 'worm-inner-maw-tooth';
    tooth.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.61);
    tooth.rotation.z = a + Math.PI / 2;
    tooth.rotation.x = Math.PI / 2.2;
    s.rig.head.add(tooth);
  }
  // mandibles
  for (const side of [-1, 1]) {
    const mand = mesh(new THREE.ConeGeometry(0.06, 0.34, 5), colorMat(0x7a5a44, 0.85));
    mand.position.set(side * 0.34, -0.08, 0.48);
    mand.rotation.z = side * 1.9;
    s.rig.head.add(mand);
    const feeler = mesh(new THREE.CylinderGeometry(0.016, 0.01, 0.54, 5), mandibleMat);
    feeler.name = 'worm-front-feeler';
    feeler.position.set(side * 0.24, 0.16, 0.5);
    feeler.rotation.z = side * 0.95;
    feeler.rotation.x = 1.08;
    s.rig.head.add(feeler);
  }
  return { ...s, animType: 'serpent', headH: 1.5 * scale, visualSource: 'procedural:worm' };
}

// ---- div: oversized humanoid + horns, tusks, hide, war-trophies ----
function buildDiv({ hide = 'divHide', scale = 1.6, horns = 2, club = true, hunch = 0.25, spikes = false } = {}) {
  const mats = MATS();
  const { group, rig } = buildHumanoid({
    skin: hide, hair: hide, hairStyle: 'none', armor: 'cloth',
    clothColor: 0x4a4338, weapon: club ? 'mace' : 'none', skirt: true, scale,
  });
  const hideMat = mats[hide];
  // bulkier chest + gut
  const chestExtra = mesh(new THREE.SphereGeometry(0.27, 9, 7), hideMat);
  chestExtra.position.y = 0.5;
  chestExtra.scale.set(1.2, 0.95, 0.95);
  rig.torso.add(chestExtra);
  const gut = mesh(new THREE.SphereGeometry(0.2, 8, 6), hideMat);
  gut.position.set(0, 0.18, 0.06);
  rig.torso.add(gut);
  rig.torso.rotation.x = hunch;
  // shoulder fur tufts
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const tuft = mesh(new THREE.ConeGeometry(0.045, 0.16, 4), hideMat);
      tuft.position.set(side * (0.2 + i * 0.05), 0.72 + (i % 2) * 0.05, -0.02);
      tuft.rotation.z = -side * (0.4 + i * 0.25);
      rig.torso.add(tuft);
    }
  }
  // horns + tusks + glowing eyes
  for (let i = 0; i < horns; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const row = Math.floor(i / 2);
    const h = mesh(new THREE.ConeGeometry(0.05 - row * 0.012, 0.3 - row * 0.08, 5), mats.stoneWhite);
    h.position.set(0.1 * side, 0.28 + row * 0.06, -0.04 + row * 0.08);
    h.rotation.z = -side * (0.6 + row * 0.3);
    rig.head.add(h);
  }
  for (const side of [-1, 1]) {
    const tusk = mesh(new THREE.ConeGeometry(0.032, 0.14, 4), mats.stoneWhite);
    tusk.position.set(0.07 * side, 0.0, 0.13);
    rig.head.add(tusk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), mats.flame);
    eye.position.set(0.06 * side, 0.15, 0.14);
    rig.head.add(eye);
    // wrist bands
    const band = mesh(new THREE.TorusGeometry(0.075, 0.02, 5, 10), mats.bronze);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.45;
    (side === -1 ? rig.armL : rig.armR).add(band);
  }
  // heavy brow
  const brow = mesh(new THREE.BoxGeometry(0.22, 0.05, 0.08), hideMat);
  brow.position.set(0, 0.2, 0.12);
  rig.head.add(brow);
  if (spikes) {
    for (let i = 0; i < 3; i++) {
      const spk = mesh(new THREE.ConeGeometry(0.04, 0.18, 4), mats.stoneWhite);
      spk.position.set(0, 0.55 - i * 0.16, -0.16);
      spk.rotation.x = -2.4;
      rig.torso.add(spk);
    }
  }
  return { group, rig, animType: 'biped', headH: 1.7 * scale };
}

// ---- named enemy recipes (model key -> builder) ----
const HUMAN_SPECS = {
  turanianKing: { armor: 'royal', clothColor: 0x5b3a78, crown: true, cloak: true, cloakColor: 0x3a2450, weapon: 'sword', beard: 'full', scale: 1.25 },
  courtier: { armor: 'cloth', clothColor: 0x6e4a6e, cloak: true, cloakColor: 0x402a40, weapon: 'dagger', beard: 'full', scale: 1.0 },
  warKing: { armor: 'plate', clothColor: 0x70402e, crown: true, weapon: 'axe', beard: 'full', shield: true, scale: 1.2 },
  elderKing: { armor: 'royal', clothColor: 0x4a3a6e, crown: true, beard: 'white', hair: 'hairWhite', weapon: 'staff', scale: 1.1 },
  nobleElder: { armor: 'lamellar', clothColor: 0x52465e, beard: 'white', hair: 'hairGrey', weapon: 'sword', cloak: true, scale: 1.05 },
  turanianChampion: { armor: 'lamellar', clothColor: 0x9e4a2a, helmet: 'spangenhelm', weapon: 'sword', shield: true, scale: 1.12 },
  turanianWarrior: { armor: 'leather', clothColor: 0x7a4a3a, helmet: 'cap', weapon: 'spear', shield: true, scale: 1.0 },
  turanianPrince: { armor: 'lamellar', clothColor: 0x3a6e8e, helmet: 'crest', weapon: 'sword', scale: 1.0 },
  turanianPrince2: { armor: 'royal', clothColor: 0x8e3a5e, helmet: 'crest', weapon: 'sword', cloak: true, scale: 1.12 },
  darkChampion: { armor: 'plate', clothColor: 0x2a2a35, helmet: 'spangenhelm', weapon: 'banner', shield: true, scale: 1.15 },
  warlord: { armor: 'plate', clothColor: 0x5e2a2a, helmet: 'crest', weapon: 'lance', cloak: true, cloakColor: 0x5e2a2a, scale: 1.2, mounted: true },
  steelChampion: { armor: 'plate', clothColor: 0x4a4f5a, helmet: 'spangenhelm', weapon: 'mace', shield: true, scale: 1.22 },
  turanianRaider: { armor: 'leather', clothColor: 0x6e5a2a, helmet: 'cap', weapon: 'sword', scale: 0.98 },
  turanianRaider2: { armor: 'leather', clothColor: 0x5a6e2a, helmet: 'cap', weapon: 'spear', shield: true, scale: 0.98 },
  shadowedIranian: { armor: 'leather', clothColor: 0x3e4a52, weapon: 'bow', cloak: true, cloakColor: 0x26303a, beard: 'full', scale: 1.0 },
  traitor: { armor: 'cloth', clothColor: 0x4a4036, weapon: 'dagger', cloak: true, cloakColor: 0x2e2820, beard: 'full', scale: 1.0 },
  westernPrince: { armor: 'royal', clothColor: 0x8e6e2a, crown: true, weapon: 'sword', cloak: true, scale: 1.1 },
  turPrince: { armor: 'royal', clothColor: 0xa04a2a, crown: true, weapon: 'axe', cloak: true, scale: 1.12 },
};

// GLTF upgrades for human foes — realistic-proportioned Quaternius knight base,
// differentiated by tint, height and our Persian weapons. (Kings/princes keep
// their crowned procedural identity; the sorceress keeps her veiled one.)
const ASSET_ENEMIES = {
  // boss-tier antagonists — unique GLBs, no tint (keep their own palette), tried before the procedural branch
  turanianKing: { asset: 'a_afrasiab', weapon: 'sword', height: 2.0 },  // Afrāsiyāb
  warKing: { asset: 'a_arjasp', weapon: 'axe', height: 1.95 },          // Arjāsp
  turanianWarrior: { asset: 'q_knight', tint: 0xc09060, weapon: 'spear', height: 1.78 },
  turanianRaider: { asset: 'q_knight', tint: 0xb89a50, weapon: 'sword', height: 1.72 },
  turanianRaider2: { asset: 'q_knight', tint: 0x96a85e, weapon: 'spear', height: 1.72 },
  turanianChampion: { asset: 'q_knight', tint: 0xc4683c, weapon: 'sword', height: 1.88 },
  turanianPrince: { asset: 'q_knight', tint: 0x5a8ab0, weapon: 'sword', height: 1.8 },
  darkChampion: { asset: 'q_knight', tint: 0x52525e, weapon: 'banner', height: 1.92 },
  steelChampion: { asset: 'q_knight', tint: 0xaab2c0, weapon: 'mace', height: 1.98 },
  warlord: { asset: 'a_kamus', weapon: 'lance', height: 1.95 }, // Kāmus-e Kushāni (dismounted GLB)
  courtier: { asset: 'q_knight', tint: 0x9a6e9a, weapon: 'dagger', height: 1.72 },
  traitor: { asset: 'q_knight', tint: 0x6e6354, weapon: 'dagger', height: 1.72 },
  shadowedIranian: { asset: 'q_knight', tint: 0x5e7282, weapon: 'bow', height: 1.74 },
  nobleElder: { asset: 'q_knight', tint: 0x7a708e, weapon: 'sword', height: 1.76 },
  // Zahhak's living curse — a real serpent
  serpent: { asset: 'q_snake_angry', tint: 0x4a5a36, weapon: null, height: 0.85 },
};

const BOSS_ASSET_ENEMIES = {
  turanianKing: { asset: 'a_afrasiab', weapon: 'sword', height: 2.34, weaponScale: 1.2 },
  warKing: { asset: 'a_arjasp', weapon: 'axe', height: 2.28, weaponScale: 1.22 },
  warlord: { asset: 'a_kamus', weapon: 'lance', height: 2.32, weaponScale: 1.22 },
  turanianChampion: { asset: 'a_soldier_heavy', tint: 0xc4683c, weapon: 'sword', height: 2.12, weaponScale: 1.22 },
  darkChampion: { asset: 'a_soldier_heavy', tint: 0x6a5668, weapon: 'banner', height: 2.16, weaponScale: 1.28 },
  steelChampion: { asset: 'a_soldier_heavy', tint: 0xb6bec8, weapon: 'mace', height: 2.18, weaponScale: 1.2 },
  turanianPrince2: { asset: 'a_soldier_heavy', tint: 0xa84a6a, weapon: 'sword', height: 2.08, weaponScale: 1.18 },
  turPrince: { asset: 'a_soldier_heavy', tint: 0xb45a34, weapon: 'axe', height: 2.1, weaponScale: 1.2 },
  westernPrince: { asset: 'a_soldier_heavy', tint: 0xb8943d, weapon: 'sword', height: 2.08, weaponScale: 1.18 },
  shadowedIranian: { asset: 'a_soldier_heavy', tint: 0x607b8c, weapon: 'bow', height: 2.02, weaponScale: 1.16 },
  traitor: { asset: 'a_soldier_heavy', tint: 0x766a58, weapon: 'dagger', height: 2.0, weaponScale: 1.12 },
  courtier: { asset: 'a_soldier_heavy', tint: 0x9a6e9a, weapon: 'dagger', height: 2.0, weaponScale: 1.12 },
};

export function buildEnemyModel(modelKey, options = {}) {
  const upgrade = (options.boss && BOSS_ASSET_ENEMIES[modelKey]) || ASSET_ENEMIES[modelKey];
  if (upgrade) {
    const m = assetCharacter(upgrade.asset, upgrade);
    if (m) return m;
  }
  const mats = MATS();
  switch (modelKey) {
    case 'zahhak': {
      const height = options.boss ? 2.68 : 2.3;
      const za = assetCharacter('a_zahhak', { height, weapon: 'sword', weaponScale: options.boss ? 1.18 : 1.1 });
      if (za) return { ...za, headH: height }; // GLB has the shoulder serpents baked into the mesh
      const h = buildHumanoid({ armor: 'royal', clothColor: 0x2a1f3a, crown: true, cloak: true, cloakColor: 0x1c1428, weapon: 'sword', beard: 'full', scale: options.boss ? 1.58 : 1.35 });
      const serpents = [];
      for (const side of [-1, 1]) {
        const sg = new THREE.Group();
        const segList = [];
        for (let i = 0; i < 5; i++) {
          const seg = mesh(new THREE.SphereGeometry(0.07 - i * 0.007, 7, 5), mats.scaleDark);
          seg.position.y = i * 0.15;
          sg.add(seg);
          segList.push(seg);
        }
        const sHead = mesh(new THREE.SphereGeometry(0.075, 7, 5), mats.scaleDark);
        sHead.scale.set(1, 0.8, 1.3);
        sHead.position.y = 0.74;
        sg.add(sHead);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), mats.flame);
        eye.position.set(0.035, 0.76, 0.05);
        sg.add(eye);
        const eye2 = eye.clone(); eye2.position.x = -0.035;
        sg.add(eye2);
        const fang = mesh(new THREE.ConeGeometry(0.012, 0.05, 4), mats.stoneWhite);
        fang.position.set(0, 0.7, 0.07);
        fang.rotation.x = Math.PI;
        sg.add(fang);
        sg.position.set(0.24 * side, 0.72, -0.05);
        sg.rotation.z = -side * 0.5;
        h.rig.torso.add(sg);
        serpents.push({ group: sg, segs: segList, side });
      }
      h.rig.shoulderSerpents = serpents;
      return { ...h, animType: 'biped', headH: 2.3 };
    }
    case 'serpent': return { ...buildSerpentBody({ mat: mats.scaleDark, ridgeMat: colorMat(0x2a3324, 0.7), segs: 7, r0: 0.18, len: 2.0, scale: 1 }), animType: 'serpent', headH: 0.6 };
    case 'divSepid': return assetCharacter('a_divsepid', { height: options.boss ? 3.85 : 3.4 }) || buildDiv({ hide: 'divHideWhite', scale: options.boss ? 2.38 : 2.1, horns: 4, hunch: 0.3, spikes: true });
    case 'divCommander': {
      const arz = assetCharacter('a_arzhang', { height: 2.6, weapon: 'banner' });
      if (arz) return arz;
      const d = buildDiv({ hide: 'divHide', scale: 1.7, horns: 2 });
      const w = makeWeapon('banner');
      w.position.set(0, -0.5, 0);
      d.rig.armL.add(w);
      return d;
    }
    case 'akvan': {
      const ak = assetCharacter('a_akvan', { height: 2.2 });
      if (ak) return { ...ak, animType: 'fly' }; // GLB has the swirling wind baked in
      const d = buildDiv({ hide: 'divHideDark', scale: 1.5, horns: 2, club: false, hunch: 0.1 });
      const veil = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), mats.shadowVeil);
      veil.position.y = 0.9;
      d.group.add(veil);
      d.rig.veil = veil;
      return { ...d, animType: 'fly' };
    }
    case 'divBrute': return assetCharacter('a_kharvazan', { height: 3.0 }) || buildDiv({ hide: 'divHide', scale: 1.85, horns: 2, hunch: 0.4, spikes: true });
    case 'divScout': return assetCharacter('a_olad', { height: 2.0 }) || buildDiv({ hide: 'divHideDark', scale: 1.25, horns: 1, club: false, hunch: 0.35 });
    case 'dragon': {
      const actor = assetCharacter('a_azhdaha_actor', { height: options.boss ? 1.62 : 1.34, walkStride: 1.55 });
      if (actor?.anim?.actions && Object.keys(actor.anim.actions).length > 0) {
        return { ...actor, visualSource: 'asset:a_azhdaha_actor', actorProfile: 'animated-crawler' };
      }
      const d = assetCharacter('a_dragon', { height: options.boss ? 1.85 : 1.5, walkStride: 1.0 });
      if (!d) return { ...buildDragon(options.boss ? 2.05 : 1.7), fallbackReason: 'asset-not-ready', sourceAsset: 'a_dragon' };
      const hasClips = d.anim?.actions && Object.keys(d.anim.actions).length > 0;
      return hasClips ? d : { ...buildDragon(options.boss ? 2.05 : 1.7), fallbackReason: 'source-only-no-clips', sourceAsset: 'a_dragon' };
    }
    case 'worm': {
      const w = assetCharacter('a_worm', { height: options.boss ? 1.82 : 1.5, walkStride: 0.9 });
      if (!w) return { ...buildWorm(options.boss ? 2.2 : 2.0), fallbackReason: 'asset-not-ready', sourceAsset: 'a_worm' };
      const hasClips = w.anim?.actions && Object.keys(w.anim.actions).length > 0;
      return hasClips ? w : { ...buildWorm(options.boss ? 2.2 : 2.0), fallbackReason: 'source-only-no-clips', sourceAsset: 'a_worm' };
    }
    // White War Elephant (پیل سپید). walkStride 2.6 calibrated by min planted-paw
    // drift at speed 1.0 (slow ponderous plod ~0.38 cycles/s); faces +Z, no rotFix.
    case 'elephant': return assetCharacter('a_elephant', { height: 3.75, walkStride: 2.6 }) || buildElephant(1.5);
    // walkStride calibrated by minimizing the planted-paw world drift across a speed=3 sim
    // (front/back foot slip ~0 at 0.96 → timeScale ≈ 3.1, a natural trot — not the frantic
    // 5.4 a naive peak-to-peak stride would give). enemy.js plants the paws at the lion's speed.
    case 'lion': return assetCharacter('a_lion', { height: 1.86, walkStride: 0.96 }) || buildLion(1.2);
    case 'sorceress': {
      const sor = assetCharacter('a_sorceress', { height: 1.7, weapon: 'staff' });
      if (sor) return sor;
      const h = buildHumanoid({ female: true, armor: 'cloth', clothColor: 0x6e2a4a, hairStyle: 'long', hair: 'hairBlack', weapon: 'staff', cloak: true, cloakColor: 0x44183a, scale: 1.0 });
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mats.shadowVeil);
      glow.position.y = 1.0;
      h.group.add(glow);
      return { ...h, animType: 'biped', headH: 1.7 };
    }
    default: {
      const spec = HUMAN_SPECS[modelKey] || HUMAN_SPECS.turanianWarrior;
      const h = buildHumanoid({ ...spec, scale: (spec.scale || 1) * (options.boss ? 1.18 : 1) });
      if (spec.mounted) {
        const horse = buildHorse({ coat: 'horseBrown', scale: 1.0, armored: true });
        h.group.position.y = 1.2;
        h.rig.legL.rotation.x = -0.9; h.rig.legR.rotation.x = -0.9;
        const combined = new THREE.Group();
        combined.add(horse.group, h.group);
        return { group: combined, rig: { ...h.rig, mount: horse.rig }, animType: 'quad', headH: 2.5 };
      }
      return { ...h, animType: 'biped', headH: 1.7 * (spec.scale || 1) };
    }
  }
}

// ---- soldier model recipes ----
const SOLDIER_SPECS = {
  spearman: { armor: 'leather', clothColor: 0x7a6a4a, helmet: 'cap', weapon: 'spear', shield: true },
  spearMaiden: { female: true, armor: 'lamellar', clothColor: 0x3a7a8e, helmet: 'crest', weapon: 'spear', shield: true, hairStyle: 'long' },
  lancer: { armor: 'lamellar', clothColor: 0x33302c, helmet: 'spangenhelm', weapon: 'lance', mounted: true, coat: 'horseBlack' },
  scoutRider: { armor: 'leather', clothColor: 0x8e7a4a, helmet: 'cap', weapon: 'spear', mounted: true, coat: 'horseBrown' },
  shieldGuard: { armor: 'plate', clothColor: 0x5e3a2a, helmet: 'spangenhelm', weapon: 'sword', shield: true },
  veteran: { armor: 'plate', clothColor: 0x4a3a5e, helmet: 'crest', weapon: 'sword', shield: true, beard: 'full' },
  halberdier: { armor: 'lamellar', clothColor: 0x6e2a5e, helmet: 'spangenhelm', weapon: 'halberd' },
  drummer: { armor: 'cloth', clothColor: 0x9e6e2a, weapon: 'none' },
  shockInfantry: { armor: 'plate', clothColor: 0x8e3a2a, helmet: 'crest', weapon: 'axe', shield: true },
  forgeWorker: { armor: 'leather', clothColor: 0x4a4036, weapon: 'hammer' },
  bannerBearer: { armor: 'lamellar', clothColor: 0xc8962e, weapon: 'banner' },
  fireKeeper: { armor: 'cloth', clothColor: 0x9e4a1f, helmet: 'cap', weapon: 'staff' },
  acolyte: { female: true, armor: 'cloth', clothColor: 0xd9cba8, hairStyle: 'long', weapon: 'none', feather: true },
  chainBinder: { armor: 'lamellar', clothColor: 0x4a5a6e, helmet: 'spangenhelm', weapon: 'mace' },
  hunter: { armor: 'leather', clothColor: 0x5a6e3a, weapon: 'bow', cloak: true, cloakColor: 0x3a4a26 },
  caravanGuard: { armor: 'leather', clothColor: 0xa8702a, helmet: 'cap', weapon: 'spear', shield: true },
  nightWarden: { female: true, armor: 'leather', clothColor: 0x3a3a52, hairStyle: 'long', weapon: 'lantern', cloak: true, cloakColor: 0x26263a },
  mason: { armor: 'cloth', clothColor: 0x8a8a7a, weapon: 'hammer' },
};

// GLTF upgrades for foot soldiers — same realistic knight base, Persian-tinted.
// Identity-critical types (spear-maidens, banner bearers, drummers, mounted riders)
// stay procedural on purpose.
const ASSET_SOLDIERS = {
  // heavy/medium MELEE → Persian heavy-warrior archetype (a_soldier_heavy); tint + weapon differentiate types.
  // Lighter tint (0.45 lerp in spawnAsset) gently recolors the Persian armor while keeping its lamellar identity.
  spearman: { asset: 'a_soldier_heavy', tint: 0xc9b482, weapon: 'spear', height: 1.7 },
  shieldGuard: { asset: 'a_soldier_heavy', tint: 0xa86e46, weapon: 'sword', height: 1.74 },
  veteran: { asset: 'a_soldier_heavy', tint: 0x8a76a8, weapon: 'sword', height: 1.76 },
  halberdier: { asset: 'a_soldier_heavy', tint: 0xa85a92, weapon: 'halberd', height: 1.74 },
  caravanGuard: { asset: 'a_soldier_heavy', tint: 0xcc9c52, weapon: 'spear', height: 1.7 },
  shockInfantry: { asset: 'a_soldier_heavy', tint: 0xb05a3e, weapon: 'axe', height: 1.76 },
  chainBinder: { asset: 'a_soldier_heavy', tint: 0x6e88a0, weapon: 'mace', height: 1.72 },
  // scout-archer → a_soldier_light (Archery_Shot attack clip)
  hunter: { asset: 'a_soldier_light', tint: 0x86a060, weapon: 'bow', height: 1.7 },
  // robed mobed / fire-keeper → a_soldier_robed
  fireKeeper: { asset: 'a_soldier_robed', tint: 0xcc7e3e, weapon: 'staff', height: 1.7 },
  // women warriors → a_soldier_female (spearMaiden was procedural-only; nightWarden was wrongly q_knight = male)
  spearMaiden: { asset: 'a_soldier_female', tint: 0x3a7a8e, weapon: 'spear', height: 1.66 },
  nightWarden: { asset: 'a_soldier_female', tint: 0x6e76a0, weapon: 'lantern', height: 1.66 },
  // laborers (no archetype fits a hammer-craftsman) → keep the q_knight base
  forgeWorker: { asset: 'q_knight', tint: 0x8a7a64, weapon: 'hammer', height: 1.66 },
  mason: { asset: 'q_knight', tint: 0xa29c8c, weapon: 'hammer', height: 1.64 },
};

export function buildSoldierModel(modelKey) {
  const upgrade = ASSET_SOLDIERS[modelKey];
  if (upgrade) {
    const m = assetCharacter(upgrade.asset, upgrade);
    if (m) return { ...m, mounted: false };
  }
  const spec = SOLDIER_SPECS[modelKey] || SOLDIER_SPECS.spearman;
  const h = buildHumanoid({ ...spec, scale: spec.scale || 0.92 });
  if (spec.mounted) {
    // seat the rider astride (thighs forward, feet back) — shared by both mount paths
    h.group.position.y = 1.15;
    h.rig.legL.rotation.x = -0.9; h.rig.legR.rotation.x = -0.9;
    const tackKind = spec.coat === 'horseBlack' ? 'rakhsh' : 'scout';
    const preferredHorseKey = tackKind === 'rakhsh' ? 'a_zabul_warhorse' : 'a_horse';
    let glbKey = preferredHorseKey;
    let glb = spawnAsset(glbKey, { height: glbKey === 'a_zabul_warhorse' ? 2.35 : 1.9, tint: glbKey === 'a_zabul_warhorse' ? null : (spec.coat === 'horseBlack' ? 0x201b17 : null) });
    if (!glb && glbKey !== 'a_horse') {
      glbKey = 'a_horse';
      glb = spawnAsset(glbKey, { height: 1.9, tint: spec.coat === 'horseBlack' ? 0x201b17 : null });
    }
    if (glb) {
      glb.group.rotation.y = rotFix(glbKey);
      glb.play('walk');
      const combined = new THREE.Group();
      combined.add(glb.group);
      if (glbKey === 'a_zabul_warhorse') {
        return { group: combined, rig: {}, anim: glb, animType: 'gltf', headH: 2.55, mounted: true };
      }
      combined.add(mountedTackGroup(tackKind));
      combined.add(h.group);
      return { group: combined, rig: h.rig, anim: glb, animType: 'gltf', headH: 2.5, mounted: true };
    }
    const horse = buildHorse({ coat: spec.coat || 'horseBrown', scale: 0.95 });
    const combined = new THREE.Group();
    combined.add(horse.group, mountedTackGroup(tackKind), h.group);
    return { group: combined, rig: { ...h.rig, mount: horse.rig }, animType: 'quad', headH: 2.4, mounted: true };
  }
  return { ...h, animType: 'biped', headH: 1.6, mounted: false };
}

// ---- creature/quad/serpent animation ----
// 4-beat diagonal gait with knee flexion, body bob, head/neck motion, tail sway.
export function animQuad(rig, t, speed = 1) {
  const g = rig.gait || { hip: 0.55, knee: 0.85, rate: 8 };
  const f = t * g.rate * speed;
  const phases = [0, Math.PI, Math.PI, 0]; // FL, FR, RL, RR — diagonal pairs
  rig.legs.forEach((leg, i) => {
    const p = f + phases[i];
    leg.hip.rotation.x = Math.sin(p) * g.hip * Math.min(1, speed + 0.2);
    leg.knee.rotation.x = Math.max(0, Math.sin(p - 1.1)) * g.knee * Math.min(1, speed + 0.2);
  });
  if (rig.body) {
    rig.body.position.y = rig.bodyY + Math.abs(Math.sin(f)) * 0.05 * Math.min(1, speed);
    rig.body.rotation.z = Math.sin(f) * 0.02;
  }
  if (rig.neck) rig.neck.rotation.x = Math.sin(f * 0.5) * 0.06;
  if (rig.head) {
    rig.head.rotation.x = Math.sin(f) * 0.05;
    rig.head.rotation.y = Math.sin(t * 0.9) * 0.12; // looks around
  }
  if (rig.jaw) rig.jaw.rotation.x = Math.max(0, Math.sin(t * 1.3)) * 0.18; // occasional snarl
  if (rig.tailSegs) rig.tailSegs.forEach((s, i) => { s.rotation.y = Math.sin(t * 3 + i * 0.9) * 0.28; });
  if (rig.trunk) rig.trunk.forEach((seg, i) => { seg.rotation.x = Math.sin(t * 2.2 + i * 0.7) * 0.14 + 0.08; });
}

export function animSerpent(rig, t, speed = 1) {
  rig.segments.forEach((seg, i) => {
    seg.position.x = Math.sin(t * 5 * speed - i * 0.9) * 0.18 * (i / rig.segments.length + 0.3);
    seg.rotation.y = Math.cos(t * 5 * speed - i * 0.9) * 0.18;
  });
  if (rig.head) {
    rig.head.position.x = Math.sin(t * 5 * speed + 0.5) * 0.06;
    rig.head.position.y += Math.sin(t * 2.5) * 0.0015;
    rig.head.rotation.y = Math.sin(t * 1.6) * 0.15;
  }
  if (rig.tongue) rig.tongue.scale.z = 0.4 + Math.max(0, Math.sin(t * 7)) * 0.8; // flicking
  if (rig.wingL) {
    rig.wingL.rotation.z = -0.45 - Math.sin(t * 6) * 0.5;
    rig.wingR.rotation.z = 0.45 + Math.sin(t * 6) * 0.5;
  }
}

export function animShoulderSerpents(rig, t) {
  if (!rig || !rig.shoulderSerpents) return;
  for (const s of rig.shoulderSerpents) {
    s.group.rotation.z = -s.side * 0.5 + Math.sin(t * 3.2 + s.side) * 0.28;
    s.group.rotation.x = Math.sin(t * 2.1 + s.side * 2) * 0.2;
    s.segs.forEach((seg, i) => { seg.position.x = Math.sin(t * 4 + i * 1.2 + s.side * 2) * 0.045 * i; });
  }
}
