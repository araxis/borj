// Application entry — boots the engine, menus, and battle lifecycle, and owns
// pointer interaction (build/assign/rally/fuse modes, selection raycasts).
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { RTSCamera } from './core/camera.js';
import { initLangDOM, onLangChange, t } from './core/i18n.js';
import { settings } from './core/settings.js';
import { audio } from './core/audio.js';
import { Game } from './game/game.js';
import { hasPalace, loadPalace, palaceStatus, preloadAssets } from './core/assets.js';
import { loadAllProps } from './core/props3d.js';
import { auditVisualArtifacts, sanitizeVisualArtifacts } from './core/visualguards.js';
import { backdropManifestReport, backdropSceneReport } from './world/backdrop.js';
import { applyBattleSnapshot, saveBattle, clearBattle } from './core/battlesave.js';
import { MAPS, MAPS_BY_ID } from './data/campaign.js';
import { TOWERS_BY_ID } from './data/towers.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { Codex } from './ui/codex.js';
import { SettingsUI } from './ui/settingsui.js';
import { $ } from './ui/dom.js';

initLangDOM();
document.documentElement.style.fontSize = `${15 * settings.get('uiScale')}px`;

const canvas = document.getElementById('scene');
const engine = new Engine(canvas);
const rts = new RTSCamera(engine.camera, canvas);
engine.rtsCamera = rts;
rts.groundPointAt = (x, y) => pickGround(x, y); // enables zoom-toward-cursor
engine.onUpdate((dt, raw) => rts.update(raw));
engine.setMood({});
engine.start();

const codex = new Codex();
const settingsUI = new SettingsUI();

let game = null;
let hud = null;
let gameUpdateOff = null;
let paused = false;

// selection visuals
function ringLine(radius = 1, segments = 96) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function makeOverlayRing(color, opacity, radius = 1, segments = 96) {
  const ring = new THREE.LineLoop(
    ringLine(radius, segments),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.frustumCulled = false;
  ring.renderOrder = 30;
  ring.visible = false;
  return ring;
}

const padRing = makeOverlayRing(0xf4cd6e, 0.92, 2.1, 32);
const rangeRing = makeOverlayRing(0x2fa7a0, 0.82, 1, 128);

// tight pulsing ring hugging the selected tower's footprint — disambiguates which tower is selected in a cluster
const selRing = makeOverlayRing(0xffe9a8, 0.85, 1, 48);
let selectedTower = null;

const SELECTED_TARGET_THREAD_TTL = 1.55;
const selectedTargetLinePos = new Float32Array(9);
const selectedTargetLineGeom = new THREE.BufferGeometry();
selectedTargetLineGeom.setAttribute('position', new THREE.BufferAttribute(selectedTargetLinePos, 3));
selectedTargetLineGeom.setDrawRange(0, 3);
const selectedTargetLine = new THREE.Line(
  selectedTargetLineGeom,
  new THREE.LineBasicMaterial({
    color: 0xf1c06e,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  }),
);
selectedTargetLine.name = 'zabulistan-selected-target-line';
selectedTargetLine.frustumCulled = false;
selectedTargetLine.renderOrder = 29;
const selectedTargetReticleGeom = new THREE.RingGeometry(0.36, 0.47, 32);
selectedTargetReticleGeom.rotateX(-Math.PI / 2);
const selectedTargetReticle = new THREE.Mesh(
  selectedTargetReticleGeom,
  new THREE.MeshBasicMaterial({
    color: 0xffdda0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  }),
);
selectedTargetReticle.name = 'zabulistan-selected-target-reticle';
selectedTargetReticle.renderOrder = 29;
const selectedTargetThread = new THREE.Group();
selectedTargetThread.name = 'zabulistan-selected-target-thread';
selectedTargetThread.visible = false;
selectedTargetThread.userData.visualQaIgnore = true;
selectedTargetThread.add(selectedTargetLine, selectedTargetReticle);

function padAffordanceGeometry(size = 4.8, corner = 1.05, stroke = 0.12) {
  const h = size * 0.5;
  const inner = h - corner;
  const verts = [];
  const addRect = (x1, z1, x2, z2) => {
    verts.push(
      x1, 0, z1,
      x2, 0, z1,
      x2, 0, z2,
      x1, 0, z1,
      x2, 0, z2,
      x1, 0, z2,
    );
  };
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const xEdgeA = sx > 0 ? inner : -h;
      const xEdgeB = sx > 0 ? h : -inner;
      const zOuterA = sz > 0 ? h - stroke : -h;
      const zOuterB = sz > 0 ? h : -h + stroke;
      addRect(Math.min(xEdgeA, xEdgeB), zOuterA, Math.max(xEdgeA, xEdgeB), zOuterB);
      const xOuterA = sx > 0 ? h - stroke : -h;
      const xOuterB = sx > 0 ? h : -h + stroke;
      const zEdgeA = sz > 0 ? inner : -h;
      const zEdgeB = sz > 0 ? h : -inner;
      addRect(xOuterA, Math.min(zEdgeA, zEdgeB), xOuterB, Math.max(zEdgeA, zEdgeB));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeBoundingSphere();
  return geo;
}

const padHintGeom = padAffordanceGeometry();
const buildPadHints = new THREE.Group();
buildPadHints.name = 'build-pad-affordance';
buildPadHints.visible = false;
buildPadHints.userData.visualQaIgnore = true;
let buildPadHintKey = '';
let hoveredBuildPad = null;

const ROAD_PRESSURE_CUE_MAX = 12;
const roadPressureRingGeom = new THREE.RingGeometry(0.46, 0.82, 36);
roadPressureRingGeom.rotateX(-Math.PI / 2);
const roadPressureDashGeom = new THREE.PlaneGeometry(0.18, 1.18);
roadPressureDashGeom.rotateX(-Math.PI / 2);
const roadPressureCues = new THREE.Group();
roadPressureCues.name = 'zabulistan-road-pressure-cues';
roadPressureCues.visible = false;
roadPressureCues.userData.visualQaIgnore = true;

function makeRoadPressureCue() {
  const cue = new THREE.Group();
  cue.name = 'zabulistan-road-pressure-cue';
  cue.visible = false;
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf0b65a,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(roadPressureRingGeom, mat);
  ring.name = 'zabulistan-road-pressure-ring';
  ring.renderOrder = 21;
  const dash = new THREE.Mesh(roadPressureDashGeom, mat.clone());
  dash.name = 'zabulistan-road-pressure-dash';
  dash.position.z = -0.98;
  dash.renderOrder = 21;
  cue.add(ring, dash);
  return cue;
}

for (let i = 0; i < ROAD_PRESSURE_CUE_MAX; i++) roadPressureCues.add(makeRoadPressureCue());

const CONTACT_CUE_MAX = 10;
const contactRingGeom = new THREE.RingGeometry(0.72, 0.9, 44);
contactRingGeom.rotateX(-Math.PI / 2);
const contactHealthBackGeom = new THREE.PlaneGeometry(1.16, 0.11);
const contactHealthFillGeom = new THREE.PlaneGeometry(1.08, 0.07);
const contactSlashGeom = new THREE.PlaneGeometry(0.16, 1.04);
const contactConfirmGeom = new THREE.RingGeometry(0.26, 0.54, 4);
contactConfirmGeom.rotateX(-Math.PI / 2);
const enemyContactFeedback = new THREE.Group();
enemyContactFeedback.name = 'zabulistan-contact-feedback-cues';
enemyContactFeedback.visible = false;
enemyContactFeedback.userData.visualQaIgnore = true;
const enemyContactState = new Map();

function makeEnemyContactCue() {
  const cue = new THREE.Group();
  cue.name = 'zabulistan-contact-feedback-cue';
  cue.visible = false;
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf0bf6a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(contactRingGeom, ringMat);
  ring.name = 'zabulistan-contact-ground-ring';
  ring.renderOrder = 23;
  const barBack = new THREE.Mesh(
    contactHealthBackGeom,
    new THREE.MeshBasicMaterial({
      color: 0x1d130a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }),
  );
  barBack.name = 'zabulistan-contact-health-back';
  barBack.renderOrder = 34;
  const barFill = new THREE.Mesh(
    contactHealthFillGeom,
    new THREE.MeshBasicMaterial({
      color: 0xe9b45f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }),
  );
  barFill.name = 'zabulistan-contact-health-fill';
  barFill.renderOrder = 35;
  const slash = new THREE.Mesh(
    contactSlashGeom,
    new THREE.MeshBasicMaterial({
      color: 0xffe2a2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  slash.name = 'zabulistan-contact-impact-slash';
  slash.renderOrder = 36;
  const confirm = new THREE.Mesh(
    contactConfirmGeom,
    new THREE.MeshBasicMaterial({
      color: 0xffd978,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    }),
  );
  confirm.name = 'zabulistan-contact-confirm';
  confirm.renderOrder = 37;
  confirm.position.y = 0.065;
  cue.add(ring, barBack, barFill, slash, confirm);
  return cue;
}

for (let i = 0; i < CONTACT_CUE_MAX; i++) enemyContactFeedback.add(makeEnemyContactCue());

const PALACE_COMMAND_CUE_MAX = 6;
const palaceCommandRingGeom = new THREE.RingGeometry(1.08, 1.34, 56);
palaceCommandRingGeom.rotateX(-Math.PI / 2);
const palaceCommandStandardGeom = new THREE.RingGeometry(0.32, 0.58, 4);
palaceCommandStandardGeom.rotateX(-Math.PI / 2);
const palaceCommandDirectionGeom = new THREE.PlaneGeometry(0.22, 3.2);
palaceCommandDirectionGeom.rotateX(-Math.PI / 2);
const palaceCommandAnchorGeom = new THREE.CircleGeometry(0.2, 24);
palaceCommandAnchorGeom.rotateX(-Math.PI / 2);
const palaceCommandFeedback = new THREE.Group();
palaceCommandFeedback.name = 'zabulistan-palace-command-feedback-cues';
palaceCommandFeedback.visible = false;
palaceCommandFeedback.userData.visualQaIgnore = true;
let palaceCommandCueCursor = 0;

function palaceCommandFeedbackColor({ kind = 'boon', type = '' } = {}) {
  if (kind === 'gate') return 0xffe0a3;
  if (kind === 'muster' || kind === 'rally') return 0xf4cd6e;
  if (type === 'heal' || type === 'repairFortifications') return 0x9fe0dc;
  if (type === 'rangeVision' || type === 'stunPulse') return 0xa9ebff;
  if (type === 'burnRing') return 0xffb06b;
  if (type === 'bindChains') return 0xd9dfe8;
  return 0xf4cd6e;
}

function makeZabulistanPalaceCommandCue() {
  const cue = new THREE.Group();
  cue.name = 'zabulistan-palace-command-cue';
  cue.visible = false;
  cue.userData.active = false;
  const matBase = {
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  };
  const ring = new THREE.Mesh(
    palaceCommandRingGeom,
    new THREE.MeshBasicMaterial({ ...matBase, color: 0xf4cd6e }),
  );
  ring.name = 'zabulistan-palace-command-ring';
  ring.renderOrder = 29;
  const standard = new THREE.Mesh(
    palaceCommandStandardGeom,
    new THREE.MeshBasicMaterial({ ...matBase, color: 0xffe0a3 }),
  );
  standard.name = 'zabulistan-palace-command-standard';
  standard.position.y = 0.045;
  standard.renderOrder = 30;
  const direction = new THREE.Mesh(
    palaceCommandDirectionGeom,
    new THREE.MeshBasicMaterial({
      ...matBase,
      color: 0xffd978,
      blending: THREE.AdditiveBlending,
    }),
  );
  direction.name = 'zabulistan-palace-command-direction';
  direction.position.y = 0.05;
  direction.renderOrder = 31;
  const anchor = new THREE.Mesh(
    palaceCommandAnchorGeom,
    new THREE.MeshBasicMaterial({ ...matBase, color: 0xffe0a3 }),
  );
  anchor.name = 'zabulistan-palace-command-anchor';
  anchor.position.y = 0.06;
  anchor.renderOrder = 32;
  const threadPositions = new Float32Array(6);
  const threadGeom = new THREE.BufferGeometry();
  threadGeom.setAttribute('position', new THREE.BufferAttribute(threadPositions, 3));
  const thread = new THREE.Line(
    threadGeom,
    new THREE.LineBasicMaterial({
      color: 0xf4cd6e,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    }),
  );
  thread.name = 'zabulistan-palace-command-thread';
  thread.frustumCulled = false;
  thread.renderOrder = 33;
  cue.userData.threadPositions = threadPositions;
  cue.add(ring, standard, direction, anchor, thread);
  return cue;
}

for (let i = 0; i < PALACE_COMMAND_CUE_MAX; i++) palaceCommandFeedback.add(makeZabulistanPalaceCommandCue());

const gateHoldRingGeom = new THREE.RingGeometry(3.7, 4.05, 64);
gateHoldRingGeom.rotateX(-Math.PI / 2);
const gateHoldBandGeom = new THREE.PlaneGeometry(13.5, 1.15);
gateHoldBandGeom.rotateX(-Math.PI / 2);
const gateHoldBraceGeom = new THREE.PlaneGeometry(8.4, 0.22);
gateHoldBraceGeom.rotateX(-Math.PI / 2);
const gateHoldTickGeom = new THREE.RingGeometry(0.18, 0.3, 4);
gateHoldTickGeom.rotateX(-Math.PI / 2);
const gateHoldFeedback = new THREE.Group();
gateHoldFeedback.name = 'zabulistan-gate-hold-cue';
gateHoldFeedback.visible = false;
gateHoldFeedback.userData.visualQaIgnore = true;

function makeGateHoldMesh(name, geom, color, opacity = 0) {
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = name;
  mesh.renderOrder = 28;
  mesh.userData.visualQaIgnore = true;
  return mesh;
}

const gateHoldThreshold = makeGateHoldMesh('zabulistan-gate-hold-threshold', gateHoldBandGeom, 0xf4cd6e);
const gateHoldRing = makeGateHoldMesh('zabulistan-gate-hold-ring', gateHoldRingGeom, 0xf4cd6e);
const gateHoldBrace = makeGateHoldMesh('zabulistan-gate-hold-brace', gateHoldBraceGeom, 0xf4cd6e);
const gateHoldTicks = [-1, 0, 1].map((slot) => {
  const tick = makeGateHoldMesh('zabulistan-gate-hold-pressure-tick', gateHoldTickGeom, 0xf4cd6e);
  tick.position.set(slot * 2.2, 0.06, 1.35);
  tick.renderOrder = 29;
  gateHoldFeedback.add(tick);
  return tick;
});
gateHoldThreshold.position.y = 0.045;
gateHoldRing.position.y = 0.05;
gateHoldBrace.position.set(0, 0.07, -1.15);
gateHoldBrace.renderOrder = 29;
gateHoldFeedback.add(gateHoldThreshold, gateHoldRing, gateHoldBrace);

function activeZabulistanEnemies() {
  if (!game || game.mapDef?.id !== 'zabulistan' || !game.waveActive || game.phase !== 'combat') return [];
  return game.enemies
    .filter((enemy) => enemy?.alive && !enemy.flying && enemy.group?.position && Number.isFinite(enemy.dist) && Number.isFinite(enemy.path?.length))
    .sort((a, b) => {
      const ap = a.dist / Math.max(1, a.path.length);
      const bp = b.dist / Math.max(1, b.path.length);
      return bp - ap || (b.def?.bounty || 0) - (a.def?.bounty || 0);
    });
}

function enemyUrgency(enemy) {
  if (!enemy?.path?.length) return 0;
  const pathLeft = enemy.path.length - (enemy.dist || 0);
  const gatePressure = Math.max(0, Math.min(1, 1 - pathLeft / 72));
  const weight = enemy.boss ? 0.24 : (enemy.def?.bounty || 0) >= 80 ? 0.12 : 0;
  return Math.max(0, Math.min(1, gatePressure + weight));
}

function zabulistanPadPressure(pos, enemies = activeZabulistanEnemies()) {
  if (!pos || !enemies.length) return 0;
  let pressure = 0;
  for (const enemy of enemies) {
    const p = enemy.group.position;
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d > 15.5) continue;
    const proximity = Math.max(0, 1 - d / 15.5);
    pressure = Math.max(pressure, proximity * 0.64 + enemyUrgency(enemy) * 0.36);
  }
  return Math.max(0, Math.min(1, pressure));
}

function isZabulistanOpeningBuild() {
  return game?.mapDef?.id === 'zabulistan'
    && game.phase === 'build'
    && !game.waveActive
    && (game.waveIdx || 0) === 0
    && hud?.mode?.kind === 'build';
}

function isZabulistanActiveBuild() {
  return game?.mapDef?.id === 'zabulistan'
    && game.phase === 'combat'
    && game.waveActive
    && hud?.mode?.kind === 'build';
}

function pathSampleNearDistance(path, dist) {
  const samples = path?.samples || [];
  if (!samples.length) return null;
  const target = Math.max(0, Math.min(path.length || dist || 0, dist || 0));
  let best = samples[0];
  let bestD = Infinity;
  for (const sample of samples) {
    const d = Math.abs((sample.dist || 0) - target);
    if (d < bestD) {
      bestD = d;
      best = sample;
    }
  }
  return best;
}

function zabulistanOpeningPadScores(pads, towerDef) {
  const path = game?.map?.paths?.[0];
  const samples = path?.samples || [];
  if (!isZabulistanOpeningBuild() || !samples.length || !pads.length) return null;

  const towerRange = Math.max(6, Number(towerDef?.range) || 10);
  const scoreRange = towerRange + 1.35;
  const stride = Math.max(1, Math.floor(samples.length / 88));
  const entries = pads.map((pad, index) => {
    if (!pad || pad.tower || (pad.rubbleT || 0) > 0) return { index, score: 0, rank: null, pick: false };
    let raw = 0;
    let covered = 0;
    let first = 1;
    let last = 0;
    let bestReach = 0;

    for (let si = 0; si < samples.length; si += stride) {
      const sample = samples[si];
      const progress = path.length > 0 ? (sample.dist || 0) / path.length : si / Math.max(1, samples.length - 1);
      const dist = Math.hypot(sample.pos.x - pad.pos.x, sample.pos.z - pad.pos.z);
      const reach = Math.max(0, 1 - dist / scoreRange);
      if (reach <= 0) continue;

      const earlyRoad = Math.max(0, 1 - Math.abs(progress - 0.34) / 0.36);
      const gateApproach = Math.max(0, 1 - Math.abs(progress - 0.64) / 0.28) * 0.42;
      const pathWeight = 0.22 + Math.max(earlyRoad, gateApproach);
      raw += reach * reach * pathWeight;
      covered++;
      first = Math.min(first, progress);
      last = Math.max(last, progress);
      bestReach = Math.max(bestReach, reach);
    }

    if (covered > 0) {
      raw += Math.max(0, 1 - first / 0.52) * 0.5;
      raw += Math.min(0.6, Math.max(0, last - first) * 1.1);
      raw += bestReach * 0.28;
    }
    return { index, raw, score: raw, rank: null, pick: false };
  });

  const ranked = entries.filter((entry) => entry.raw > 0).sort((a, b) => b.raw - a.raw || a.index - b.index);
  const bestRaw = ranked[0]?.raw || 0;
  if (bestRaw <= 0) return { mode: true, entries, picks: 0, bestScore: 0, top: [] };
  ranked.forEach((entry, rank) => {
    entry.score = Math.max(0, Math.min(1, entry.raw / bestRaw));
    entry.rank = rank + 1;
    entry.pick = rank < 3 && entry.score >= 0.38;
  });
  const top = ranked
    .filter((entry) => entry.pick)
    .map((entry) => ({ index: entry.index, rank: entry.rank, score: Number(entry.score.toFixed(2)) }));
  return { mode: true, entries, picks: top.length, bestScore: Number((ranked[0].score || 0).toFixed(2)), top };
}

function zabulistanActivePadScores(pads, towerDef, enemies = activeZabulistanEnemies()) {
  if (!isZabulistanActiveBuild() || !enemies.length || !pads.length) return null;

  const towerRange = Math.max(6, Number(towerDef?.range) || 10);
  const scoreRange = towerRange + 1.65;
  const enemyWindow = enemies.slice(0, 8);
  const entries = pads.map((pad, index) => {
    if (!pad || pad.tower || (pad.rubbleT || 0) > 0) return { index, score: 0, rank: null, pick: false };
    let raw = 0;
    let urgent = 0;
    let contacts = 0;

    for (const enemy of enemyWindow) {
      const eUrgency = enemyUrgency(enemy);
      const threat = 0.36 + eUrgency * 0.78 + (enemy.boss ? 0.38 : 0);
      const leadPoints = [
        { dist: enemy.dist || 0, weight: 0.62 },
        { dist: (enemy.dist || 0) + towerRange * 0.55, weight: 0.34 },
        { dist: (enemy.dist || 0) + towerRange * 1.15, weight: 0.2 },
      ];

      for (const lead of leadPoints) {
        const sample = pathSampleNearDistance(enemy.path, lead.dist);
        const p = sample?.pos || enemy.group?.position;
        if (!p) continue;
        const d = Math.hypot(p.x - pad.pos.x, p.z - pad.pos.z);
        const reach = Math.max(0, 1 - d / scoreRange);
        if (reach <= 0) continue;
        raw += reach * reach * lead.weight * threat;
        urgent = Math.max(urgent, eUrgency * reach);
        contacts++;
      }
    }

    if (contacts > 0) raw += Math.min(0.42, contacts * 0.045) + urgent * 0.28;
    return { index, raw, score: raw, rank: null, pick: false, urgent };
  });

  const ranked = entries.filter((entry) => entry.raw > 0).sort((a, b) => b.raw - a.raw || a.index - b.index);
  const bestRaw = ranked[0]?.raw || 0;
  if (bestRaw <= 0) return { mode: true, entries, picks: 0, bestScore: 0, top: [] };
  ranked.forEach((entry, rank) => {
    entry.score = Math.max(0, Math.min(1, entry.raw / bestRaw));
    entry.rank = rank + 1;
    entry.pick = rank < 3 && entry.score >= 0.22;
  });
  const top = ranked
    .filter((entry) => entry.pick)
    .map((entry) => ({
      index: entry.index,
      rank: entry.rank,
      score: Number(entry.score.toFixed(2)),
      urgent: Number((entry.urgent || 0).toFixed(2)),
    }));
  return { mode: true, entries, picks: top.length, bestScore: Number((ranked[0].score || 0).toFixed(2)), top };
}

function syncRoadPressureCues() {
  const enemies = activeZabulistanEnemies().slice(0, ROAD_PRESSURE_CUE_MAX);
  if (!enemies.length) {
    roadPressureCues.visible = false;
    roadPressureCues.userData.visibleCount = 0;
    roadPressureCues.userData.leadPathLeft = null;
    for (const cue of roadPressureCues.children) cue.visible = false;
    return { active: false, visible: 0 };
  }
  const reduced = settings.get('reducedMotion');
  let visible = 0;
  enemies.forEach((enemy, i) => {
    const cue = roadPressureCues.children[i];
    if (!cue) return;
    const urgency = enemyUrgency(enemy);
    const pathLeft = Math.max(0, (enemy.path?.length || 0) - (enemy.dist || 0));
    const p = enemy.group.position;
    cue.position.set(p.x, game.map.heightAt(p.x, p.z) + 0.24, p.z);
    cue.rotation.y = enemy.group.rotation?.y || 0;
    const pulse = reduced ? 0 : Math.sin(engine.elapsed * 3.8 + i * 0.72) * 0.035;
    const scale = (enemy.boss ? 1.16 : 0.82) + urgency * 0.34 + pulse;
    cue.scale.setScalar(scale);
    const color = enemy.boss || urgency > 0.72 ? 0xe47d52 : urgency > 0.42 ? 0xe6a44f : 0xd6bb72;
    const opacity = reduced ? 0.42 + urgency * 0.12 : 0.38 + urgency * 0.16 + Math.max(0, pulse) * 0.55;
    for (const child of cue.children) {
      child.material.color.setHex(color);
      child.material.opacity = child.name.endsWith('dash') ? opacity * 0.72 : opacity;
    }
    cue.userData.pathLeft = Number(pathLeft.toFixed(1));
    cue.visible = true;
    visible++;
  });
  for (let i = enemies.length; i < roadPressureCues.children.length; i++) roadPressureCues.children[i].visible = false;
  roadPressureCues.visible = visible > 0;
  roadPressureCues.userData.visibleCount = visible;
  roadPressureCues.userData.leadPathLeft = Number(Math.max(0, (enemies[0].path?.length || 0) - (enemies[0].dist || 0)).toFixed(1));
  return { active: true, visible, leadPathLeft: roadPressureCues.userData.leadPathLeft };
}

function resetEnemyContactFeedback() {
  enemyContactFeedback.visible = false;
  enemyContactFeedback.userData.visibleCount = 0;
  enemyContactFeedback.userData.recentHits = 0;
  enemyContactFeedback.userData.recentKills = 0;
  enemyContactFeedback.userData.recentHeavyHits = 0;
  enemyContactFeedback.userData.killConfirms = 0;
  enemyContactState.clear();
  for (const cue of enemyContactFeedback.children) cue.visible = false;
}

function resetZabulistanPalaceCommandFeedback() {
  palaceCommandFeedback.visible = false;
  palaceCommandFeedback.userData.visibleCount = 0;
  palaceCommandFeedback.userData.recentKind = null;
  palaceCommandFeedback.userData.recentType = null;
  palaceCommandFeedback.userData.recentAge = null;
  for (const cue of palaceCommandFeedback.children) {
    cue.visible = false;
    cue.userData.active = false;
  }
}

function zabulistanPalaceCommandFeedbackSummary() {
  return {
    active: palaceCommandFeedback.visible,
    visible: palaceCommandFeedback.userData.visibleCount || 0,
    recentKind: palaceCommandFeedback.userData.recentKind || null,
    recentType: palaceCommandFeedback.userData.recentType || null,
    recentAge: palaceCommandFeedback.userData.recentAge ?? null,
  };
}

function zabulistanPalaceFront(cit) {
  const front = game?._palaceFront?.(cit);
  if (front?.clone) return front.clone();
  const exit = game?.map?.exitPos;
  if (exit?.clone) return exit.clone();
  return cit?.group?.position?.clone?.() || null;
}

function resetZabulistanGateHoldFeedback() {
  gateHoldFeedback.visible = false;
  gateHoldFeedback.userData.state = null;
  gateHoldFeedback.userData.pressure = 0;
  gateHoldFeedback.userData.defenders = 0;
  gateHoldFeedback.userData.enemies = 0;
  gateHoldFeedback.userData.near = 0;
  gateHoldFeedback.userData.activeDefenders = 0;
  for (const child of gateHoldFeedback.children) {
    child.visible = false;
    if (child.material) child.material.opacity = 0;
  }
}

function zabulistanGateHoldFeedbackSummary() {
  return {
    active: gateHoldFeedback.visible,
    state: gateHoldFeedback.userData.state || null,
    pressure: gateHoldFeedback.userData.pressure || 0,
    defenders: gateHoldFeedback.userData.defenders || 0,
    activeDefenders: gateHoldFeedback.userData.activeDefenders || 0,
    enemies: gateHoldFeedback.userData.enemies || 0,
    near: gateHoldFeedback.userData.near || 0,
  };
}

function zabulistanGateHoldState() {
  if (!game || game.mapDef?.id !== 'zabulistan') return null;
  const cit = game.map?.citadel;
  const keep = cit?.group?.position;
  const front = zabulistanPalaceFront(cit);
  if (!cit?.isPalace || !keep || !front) return null;
  if (game.phase === 'won' || game.phase === 'lost') return null;

  const pressureInfo = game.palaceGateCommandPressure?.(cit) || { pressure: 0, count: 0, near: 0, peak: false, ready: false };
  const assault = game.palaceAssaultStatus || null;
  let defenders = Math.max(0, assault?.defenders || 0, assault?.gateGuard || 0);
  let activeDefenders = defenders;
  for (const sq of game.palaceSquads || []) {
    const members = sq.members || [];
    const alive = members.filter((m) => m.alive).length;
    if (!alive) continue;
    defenders += alive;
    const bracing = (sq.gateLineT || 0) > 0.05 || (sq.royalGateGuardT || 0) > 0.05 || !!sq.gateLineAnchor || !!sq.palaceStandAnchor;
    const nearFront = members.some((m) => m.alive && m.group?.position && m.group.position.distanceTo(front) <= 34);
    if (bracing || nearFront) activeDefenders += alive;
  }

  const enemies = Math.max(0, pressureInfo.count || 0, assault?.count || 0);
  const near = Math.max(0, pressureInfo.near || 0);
  const pressure = Math.max(
    0,
    Math.min(1, pressureInfo.pressure || 0, 1),
    Math.min(1, assault?.pressure || 0),
    Math.min(1, assault?.assaultPressure || 0),
    Math.min(1, enemies * 0.055),
  );
  const active = (assault?.t || assault?.assaultT || 0) > 0.05
    || pressure > 0.08
    || pressureInfo.ready
    || pressureInfo.peak
    || activeDefenders > 0;
  if (!active) return null;

  const state = pressureInfo.peak || pressure >= 0.72
    ? 'peak'
    : pressureInfo.ready || pressure >= 0.42
      ? 'ready'
      : activeDefenders > 0
        ? 'held'
        : 'watch';
  return {
    cit,
    keep,
    front,
    pressure: Number(pressure.toFixed(3)),
    defenders,
    activeDefenders,
    enemies,
    near,
    peak: !!pressureInfo.peak || pressure >= 0.72,
    ready: !!pressureInfo.ready || pressure >= 0.42,
    state,
  };
}

function syncZabulistanGateHoldFeedback() {
  const hold = zabulistanGateHoldState();
  if (!hold) {
    resetZabulistanGateHoldFeedback();
    return zabulistanGateHoldFeedbackSummary();
  }

  const reduced = settings.get('reducedMotion');
  const color = hold.state === 'peak' ? 0xe47d52 : hold.state === 'ready' ? 0xe9b45f : 0xd6bb72;
  const dir = hold.front.clone().sub(hold.keep);
  dir.y = 0;
  if (dir.lengthSq() < 0.001) dir.set(0, 0, -1); else dir.normalize();
  const groundY = game.map?.heightAt ? game.map.heightAt(hold.front.x, hold.front.z) + 0.22 : hold.front.y + 0.22;
  const pressure = Math.max(0, Math.min(1, hold.pressure || 0));
  const defenderK = Math.max(0, Math.min(1, (hold.activeDefenders || hold.defenders || 0) / 8));
  const pulse = reduced ? 0 : Math.sin(engine.elapsed * 4.2) * 0.035;

  gateHoldFeedback.position.set(hold.front.x, groundY, hold.front.z);
  gateHoldFeedback.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
  gateHoldFeedback.scale.setScalar(1 + Math.max(0, pulse) * 0.38);
  gateHoldFeedback.visible = true;

  for (const child of [gateHoldThreshold, gateHoldRing, gateHoldBrace, ...gateHoldTicks]) {
    child.visible = true;
    child.material.color.setHex(color);
  }
  gateHoldThreshold.scale.set(0.92 + pressure * 0.18, 1, 1 + pressure * 0.08);
  gateHoldThreshold.material.opacity = (0.14 + pressure * 0.26 + defenderK * 0.08) * (reduced ? 0.78 : 1);
  gateHoldRing.scale.setScalar(0.86 + pressure * 0.24 + defenderK * 0.08 + Math.max(0, pulse));
  gateHoldRing.material.opacity = (0.12 + pressure * 0.24 + defenderK * 0.08) * (reduced ? 0.72 : 1);
  gateHoldBrace.position.z = -1.15 - pressure * 0.55;
  gateHoldBrace.scale.set(0.72 + defenderK * 0.42, 1, 1);
  gateHoldBrace.material.opacity = (0.14 + defenderK * 0.34 + pressure * 0.08) * (reduced ? 0.75 : 1);

  const tickThresholds = [0.22, 0.5, 0.72];
  gateHoldTicks.forEach((tick, i) => {
    const lit = pressure >= tickThresholds[i] || (i === 0 && hold.activeDefenders > 0);
    tick.visible = lit;
    tick.rotation.y = Math.PI * 0.25 + (reduced ? 0 : engine.elapsed * (0.28 + i * 0.08));
    tick.material.opacity = lit ? (0.2 + pressure * 0.35 + i * 0.04) * (reduced ? 0.7 : 1) : 0;
    tick.scale.setScalar(0.82 + pressure * 0.34 + (lit && !reduced ? Math.max(0, pulse) * 2.1 : 0));
  });

  gateHoldFeedback.userData.state = hold.state;
  gateHoldFeedback.userData.pressure = Number(pressure.toFixed(2));
  gateHoldFeedback.userData.defenders = hold.defenders;
  gateHoldFeedback.userData.activeDefenders = hold.activeDefenders;
  gateHoldFeedback.userData.enemies = hold.enemies;
  gateHoldFeedback.userData.near = hold.near;
  return zabulistanGateHoldFeedbackSummary();
}

function triggerZabulistanPalaceCommandFeedback(payload = {}) {
  if (!game || game.mapDef?.id !== 'zabulistan') return { active: false, visible: 0 };
  const cit = payload.palace || game.map?.citadel;
  const keep = cit?.group?.position;
  const front = payload.front?.clone?.() || zabulistanPalaceFront(cit);
  if (!cit?.isPalace || !keep || !front) return zabulistanPalaceCommandFeedbackSummary();
  const cue = palaceCommandFeedback.children[palaceCommandCueCursor % palaceCommandFeedback.children.length];
  palaceCommandCueCursor++;
  const color = palaceCommandFeedbackColor(payload);
  const groundY = game.map?.heightAt ? game.map.heightAt(front.x, front.z) + 0.34 : front.y + 0.34;
  const dir = front.clone().sub(keep);
  dir.y = 0;
  if (dir.lengthSq() < 0.001) dir.set(0, 0, -1); else dir.normalize();
  const targetCount = Math.max(0, payload.targetCount || payload.count || 0);
  const pressure = Math.max(0, Math.min(1.4, payload.pressure || targetCount * 0.035 || 0.62));
  const power = Math.max(0.62, Math.min(1.38, 0.68 + pressure * 0.24 + Math.min(0.24, targetCount * 0.02) + (payload.kind === 'gate' ? 0.18 : 0)));
  const dur = payload.kind === 'gate' ? 2.7 : payload.kind === 'muster' ? 2.45 : 2.25;
  cue.position.set(front.x, groundY, front.z);
  cue.scale.setScalar(1);
  cue.visible = true;
  cue.userData.active = true;
  cue.userData.start = engine.elapsed;
  cue.userData.dur = dur;
  cue.userData.kind = payload.kind || 'boon';
  cue.userData.type = payload.type || null;
  cue.userData.power = power;
  cue.userData.color = color;
  cue.userData.targetCount = targetCount;
  const [ring, standard, direction, anchor, thread] = cue.children;
  for (const child of [ring, standard, direction, anchor]) {
    child.material.color.setHex(color);
    child.material.opacity = 0;
  }
  thread.material.color.setHex(color);
  thread.material.opacity = 0;
  direction.position.set(-dir.x * 1.08, 0.05, -dir.z * 1.08);
  direction.rotation.y = Math.atan2(dir.x, dir.z);
  const localKeep = keep.clone().sub(front);
  localKeep.y = 0.08;
  const positions = cue.userData.threadPositions;
  positions[0] = localKeep.x;
  positions[1] = 0.08;
  positions[2] = localKeep.z;
  positions[3] = 0;
  positions[4] = 0.08;
  positions[5] = 0;
  thread.geometry.attributes.position.needsUpdate = true;
  palaceCommandFeedback.visible = true;
  palaceCommandFeedback.userData.recentKind = cue.userData.kind;
  palaceCommandFeedback.userData.recentType = cue.userData.type;
  palaceCommandFeedback.userData.recentAge = 0;
  return syncZabulistanPalaceCommandFeedback();
}

function syncZabulistanPalaceCommandFeedback() {
  if (!game || game.mapDef?.id !== 'zabulistan') {
    resetZabulistanPalaceCommandFeedback();
    return { active: false, visible: 0 };
  }
  const now = engine.elapsed;
  const reduced = settings.get('reducedMotion');
  let visible = 0;
  let recentAge = null;
  for (let i = 0; i < palaceCommandFeedback.children.length; i++) {
    const cue = palaceCommandFeedback.children[i];
    if (!cue.userData.active) {
      cue.visible = false;
      continue;
    }
    const age = Math.max(0, now - (cue.userData.start || now));
    const dur = Math.max(0.1, cue.userData.dur || 2.2);
    if (age > dur) {
      cue.visible = false;
      cue.userData.active = false;
      continue;
    }
    const life = Math.max(0, 1 - age / dur);
    const out = 1 - life;
    const power = cue.userData.power || 1;
    const [ring, standard, direction, anchor, thread] = cue.children;
    const pulse = reduced ? 0 : Math.sin(now * 5.2 + i * 0.63) * 0.025;
    ring.scale.setScalar((reduced ? 1.08 : 0.88 + out * 0.72 + pulse) * power);
    ring.material.opacity = (0.1 + life * 0.36) * (reduced ? 0.72 : 1);
    standard.scale.setScalar((reduced ? 0.9 : 0.72 + out * 0.46) * power);
    standard.rotation.y = reduced ? 0.76 : 0.76 + age * 1.7;
    standard.material.opacity = (0.15 + life * 0.44) * (reduced ? 0.66 : 1);
    direction.scale.set(1, (reduced ? 0.9 : 0.84 + out * 0.5) * power, 1);
    direction.material.opacity = (0.12 + life * 0.36) * (reduced ? 0.58 : 1);
    anchor.scale.setScalar((reduced ? 1.0 : 0.92 + Math.max(0, pulse) * 2.5) * power);
    anchor.material.opacity = (0.16 + life * 0.42) * (reduced ? 0.65 : 1);
    thread.material.opacity = (0.08 + life * 0.34) * (reduced ? 0.52 : 1);
    cue.visible = true;
    cue.userData.age = Number(age.toFixed(2));
    visible++;
    if (recentAge == null || age < recentAge) recentAge = age;
  }
  palaceCommandFeedback.visible = visible > 0;
  palaceCommandFeedback.userData.visibleCount = visible;
  palaceCommandFeedback.userData.recentAge = recentAge == null ? null : Number(recentAge.toFixed(2));
  return zabulistanPalaceCommandFeedbackSummary();
}

function primeEnemyContactCue(enemy, power = 0.5) {
  if (!enemy?.group?.position || !Number.isFinite(enemy.maxHp)) return false;
  const hp = Math.max(0, enemy.hp || 0);
  const state = enemyContactState.get(enemy.id) || { maxHp: Math.max(1, enemy.maxHp || 1) };
  state.hp = hp;
  state.maxHp = Math.max(1, enemy.maxHp || state.maxHp || 1);
  state.alive = !!enemy.alive;
  state.lastHitT = engine.elapsed;
  state.hitPower = Math.max(state.hitPower || 0, Math.max(0.18, Math.min(1, power)));
  enemyContactState.set(enemy.id, state);
  return true;
}

function contactColor(enemy, kind = 'hit') {
  if (kind === 'kill') return 0xffd978;
  if (enemy?.boss) return 0xe47d52;
  if (enemy?.def?.class === 'div') return 0xa990d6;
  if (enemy?.def?.class === 'serpent') return 0x9fc96b;
  return 0xe9b45f;
}

function syncEnemyContactFeedback() {
  if (!game || game.mapDef?.id !== 'zabulistan' || !game.waveActive || game.phase !== 'combat') {
    resetEnemyContactFeedback();
    return { active: false, visible: 0 };
  }
  const now = engine.elapsed;
  const currentIds = new Set();
  const candidates = [];
  for (const enemy of game.enemies || []) {
    if (!enemy?.group?.position || !Number.isFinite(enemy.maxHp)) continue;
    currentIds.add(enemy.id);
    const maxHp = Math.max(1, enemy.maxHp || 1);
    const hp = Math.max(0, enemy.hp || 0);
    let state = enemyContactState.get(enemy.id);
    if (!state) {
      state = { hp, maxHp, alive: !!enemy.alive, lastHitT: -99, killT: -99, hitPower: 0 };
      enemyContactState.set(enemy.id, state);
    }
    const delta = Math.max(0, (state.hp ?? hp) - hp);
    if (delta > Math.max(0.35, maxHp * 0.004)) {
      state.lastHitT = now;
      state.hitPower = Math.max(state.hitPower || 0, Math.min(1, 0.2 + Math.sqrt(delta / maxHp) * 2.1));
    }
    if (state.alive && !enemy.alive) {
      state.killT = now;
      state.hitPower = 1;
    }
    state.hp = hp;
    state.maxHp = maxHp;
    state.alive = !!enemy.alive;

    const hitAge = now - state.lastHitT;
    const killAge = now - state.killT;
    const hpFrac = Math.max(0, Math.min(1, hp / maxHp));
    const hitK = hitAge < 1.05 ? (1 - hitAge / 1.05) * (0.32 + (state.hitPower || 0) * 0.68) : 0;
    const killK = killAge < 0.78 ? (1 - killAge / 0.78) : 0;
    const heavyK = hitAge < 0.82 && (state.hitPower || 0) >= 0.64
      ? (1 - hitAge / 0.82) * Math.min(1, ((state.hitPower || 0) - 0.48) / 0.52)
      : 0;
    const lowK = enemy.alive && hpFrac < 0.42 && hitAge < 2.4 ? (0.42 - hpFrac) / 0.42 * 0.42 : 0;
    const intensity = Math.max(hitK, killK, heavyK * 0.86, lowK);
    if (intensity > 0.055) candidates.push({ enemy, state, hpFrac, hitK, killK, heavyK, lowK, intensity });
  }
  for (const [id, state] of enemyContactState) {
    if (!currentIds.has(id) || (now - state.lastHitT > 5 && now - state.killT > 2)) enemyContactState.delete(id);
  }

  candidates.sort((a, b) =>
    b.killK - a.killK
    || b.intensity - a.intensity
    || (b.enemy?.dist || 0) - (a.enemy?.dist || 0));

  const reduced = settings.get('reducedMotion');
  let visible = 0;
  let recentHits = 0;
  let recentKills = 0;
  let recentHeavyHits = 0;
  let killConfirms = 0;
  for (let i = 0; i < enemyContactFeedback.children.length; i++) {
    const cue = enemyContactFeedback.children[i];
    const item = candidates[i];
    if (!item) {
      cue.visible = false;
      continue;
    }
    const { enemy, hpFrac, hitK, killK, heavyK, lowK, intensity } = item;
    const p = enemy.group.position;
    const head = enemy.model?.headH || 1.7;
    const groundY = game.map.heightAt(p.x, p.z) + 0.28;
    cue.position.set(p.x, groundY, p.z);
    const color = contactColor(enemy, killK > 0.05 ? 'kill' : 'hit');
    const pulse = reduced ? 0 : Math.sin(now * 9.5 + i * 0.74) * 0.035;
    const ring = cue.children[0];
    const back = cue.children[1];
    const fill = cue.children[2];
    const slash = cue.children[3];
    const confirm = cue.children[4];
    const scale = (enemy.boss ? 1.18 : 0.88) + intensity * 0.42 + Math.max(0, pulse);
    ring.scale.setScalar(scale);
    ring.material.color.setHex(color);
    ring.material.opacity = (0.16 + intensity * 0.38 + lowK * 0.18) * (reduced ? 0.78 : 1);

    const barY = Math.max(1.3, head + 0.62);
    back.position.set(0, barY, 0);
    fill.position.set(-(1 - hpFrac) * 0.54, barY, 0.012);
    back.quaternion.copy(engine.camera.quaternion);
    fill.quaternion.copy(engine.camera.quaternion);
    fill.scale.set(Math.max(0.02, hpFrac), 1, 1);
    const barOpacity = Math.max(0.18, Math.min(0.78, 0.22 + intensity * 0.72));
    back.material.opacity = barOpacity * 0.56;
    fill.material.color.setHex(hpFrac < 0.28 || killK > 0 ? 0xe47d52 : color);
    fill.material.opacity = barOpacity;

    slash.position.set(0, Math.max(1.0, head * 0.58), 0.03);
    slash.quaternion.copy(engine.camera.quaternion);
    slash.rotation.z += (i % 2 ? -0.38 : 0.38);
    slash.scale.set(0.72 + intensity * 0.52, 0.82 + intensity * 0.64, 1);
    slash.material.color.setHex(color);
    slash.material.opacity = Math.max(0, (hitK + killK * 0.7) * (reduced ? 0.24 : 0.48));

    const confirmK = Math.max(killK, heavyK * 0.78);
    const confirmOpacity = Math.max(0, confirmK > 0.04 ? 0.16 + confirmK * (killK > 0.04 ? 0.52 : 0.34) : 0);
    confirm.visible = confirmOpacity > 0.012;
    confirm.rotation.set(0, reduced ? (i % 4) * Math.PI * 0.25 : now * 1.6 + i * 0.44, 0);
    confirm.scale.setScalar((enemy.boss ? 1.34 : 0.98) + confirmK * (reduced ? 0.16 : 0.78));
    confirm.material.color.setHex(killK > 0.04 ? 0xffd978 : color);
    confirm.material.opacity = confirmOpacity * (reduced ? 0.72 : 1);

    cue.userData.hpFrac = Number(hpFrac.toFixed(2));
    cue.userData.intensity = Number(intensity.toFixed(2));
    cue.userData.kill = killK > 0.05;
    cue.userData.heavy = heavyK > 0.05;
    cue.userData.confirm = Number(confirmK.toFixed(2));
    cue.visible = true;
    visible++;
    if (hitK > 0.05) recentHits++;
    if (killK > 0.05) recentKills++;
    if (heavyK > 0.05) recentHeavyHits++;
    if (killK > 0.05) killConfirms++;
  }
  enemyContactFeedback.visible = visible > 0;
  enemyContactFeedback.userData.visibleCount = visible;
  enemyContactFeedback.userData.recentHits = recentHits;
  enemyContactFeedback.userData.recentKills = recentKills;
  enemyContactFeedback.userData.recentHeavyHits = recentHeavyHits;
  enemyContactFeedback.userData.killConfirms = killConfirms;
  return { active: true, visible, recentHits, recentKills, recentHeavyHits, killConfirms };
}

function resetSelectedTargetThread(reason = 'inactive') {
  selectedTargetThread.visible = false;
  selectedTargetThread.userData.visible = false;
  selectedTargetThread.userData.reason = reason;
  selectedTargetLine.material.opacity = 0;
  selectedTargetReticle.material.opacity = 0;
  return { active: false, visible: false, reason };
}

function syncSelectedTargetThread() {
  if (!game || game.mapDef?.id !== 'zabulistan' || !game.waveActive || game.phase !== 'combat') {
    return resetSelectedTargetThread('inactive-combat');
  }
  const tower = selectedTower;
  const target = tower?.lastTarget;
  if (!tower?.alive || !target?.alive || !target.group?.position) {
    return resetSelectedTargetThread('missing-target');
  }
  const now = game._time || engine.elapsed || 0;
  const age = Math.max(0, now - (tower.lastTargetT || -99));
  if (age > SELECTED_TARGET_THREAD_TTL) return resetSelectedTargetThread('stale-target');

  const reduced = settings.get('reducedMotion');
  const from = tower._muzzlePos ? tower._muzzlePos() : tower.pos.clone().setY((tower.pos.y || 0) + 1.6);
  const targetPos = target.group.position;
  const head = Math.max(1.1, target.model?.headH || 1.7);
  const to = targetPos.clone().setY(targetPos.y + head * 0.72);
  const mid = from.clone().lerp(to, 0.58);
  mid.y += reduced ? 0.18 : 0.44 + Math.sin(engine.elapsed * 5.5 + tower.id) * 0.08;
  selectedTargetLinePos.set([
    from.x, from.y, from.z,
    mid.x, mid.y, mid.z,
    to.x, to.y, to.z,
  ]);
  selectedTargetLineGeom.attributes.position.needsUpdate = true;

  const fade = Math.max(0, 1 - age / SELECTED_TARGET_THREAD_TTL);
  const urgency = enemyUrgency(target);
  const shimmer = reduced ? 0 : Math.sin(engine.elapsed * 8 + tower.id * 0.37) * 0.045;
  const opacity = Math.max(0.18, Math.min(0.56, 0.2 + fade * 0.3 + urgency * 0.08 + shimmer));
  const color = urgency > 0.52 ? 0xf09b52 : 0xf1c06e;
  selectedTargetLine.material.color.setHex(color);
  selectedTargetLine.material.opacity = opacity;

  const groundY = game.map?.heightAt ? game.map.heightAt(targetPos.x, targetPos.z) : targetPos.y;
  selectedTargetReticle.position.set(targetPos.x, groundY + 0.28, targetPos.z);
  selectedTargetReticle.material.color.setHex(urgency > 0.52 ? 0xffb46e : 0xffdda0);
  selectedTargetReticle.material.opacity = Math.min(0.68, opacity + 0.08);
  const pulse = reduced ? 0 : Math.sin(engine.elapsed * 6.2 + tower.id) * 0.035;
  selectedTargetReticle.scale.setScalar((target.boss ? 1.38 : 1) + urgency * 0.2 + pulse);

  selectedTargetThread.visible = true;
  selectedTargetThread.userData.visible = true;
  selectedTargetThread.userData.reason = null;
  selectedTargetThread.userData.towerId = tower.id;
  selectedTargetThread.userData.targetId = target.id;
  selectedTargetThread.userData.age = Number(age.toFixed(2));
  selectedTargetThread.userData.kind = tower.lastTargetKind || tower.def?.role || null;
  return {
    active: true,
    visible: true,
    age: selectedTargetThread.userData.age,
    towerId: tower.id,
    targetId: target.id,
    kind: selectedTargetThread.userData.kind,
  };
}

function setRangeRingDefaultStyle() {
  rangeRing.material.depthTest = false;
  rangeRing.material.depthWrite = false;
  rangeRing.material.blending = THREE.AdditiveBlending;
  rangeRing.material.opacity = 0.82;
  rangeRing.renderOrder = 30;
  rangeRing.material.needsUpdate = true;
}

function setRangeRingBuildStyle() {
  rangeRing.material.depthTest = true;
  rangeRing.material.depthWrite = false;
  rangeRing.material.blending = THREE.NormalBlending;
  rangeRing.material.opacity = 0.38;
  rangeRing.renderOrder = 22;
  rangeRing.material.needsUpdate = true;
}

function rebuildBuildPadHints() {
  for (const child of buildPadHints.children) {
    if (child.material) child.material.dispose();
  }
  buildPadHints.clear();
  for (const pad of game?.map?.pads || []) {
    const line = new THREE.Mesh(
      padHintGeom,
      new THREE.MeshBasicMaterial({
        color: 0xf0c46a,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
      }),
    );
    line.name = 'build-pad-affordance-pad';
    line.frustumCulled = false;
    line.renderOrder = 22;
    line.userData.visualQaIgnore = true;
    buildPadHints.add(line);
  }
  buildPadHintKey = `${game?.mapDef?.id || ''}:${game?.map?.pads?.length || 0}`;
}

function syncBuildPadHints(force = false) {
  const active = game && hud && hud.mode?.kind === 'build';
  if (!active) {
    buildPadHints.visible = false;
    hoveredBuildPad = null;
    return { active: false, visible: 0, total: 0 };
  }
  const pads = game.map?.pads || [];
  const key = `${game.mapDef?.id || ''}:${pads.length}`;
  if (force || key !== buildPadHintKey || buildPadHints.children.length !== pads.length) rebuildBuildPadHints();
  const affordable = (hud.mode.def?.cost || 0) <= (game.gold || 0);
  const pressureEnemies = game.mapDef?.id === 'zabulistan' && game.waveActive ? activeZabulistanEnemies() : [];
  const opening = zabulistanOpeningPadScores(pads, hud.mode.def);
  const activePlacement = zabulistanActivePadScores(pads, hud.mode.def, pressureEnemies);
  let visible = 0;
  pads.forEach((pad, i) => {
    const line = buildPadHints.children[i];
    if (!line) return;
    const available = !pad.tower && (pad.rubbleT || 0) <= 0;
    line.visible = available;
    if (!available) return;
    visible++;
    const hover = pad === hoveredBuildPad;
    line.position.set(pad.pos.x, pad.pos.y + 0.33, pad.pos.z);
    line.rotation.y = pad.rot || 0;
    const pulse = settings.get('reducedMotion') ? 0 : Math.sin(engine.elapsed * 3.2 + i * 0.55) * 0.035;
    const pressure = zabulistanPadPressure(pad.pos, pressureEnemies);
    const openingEntry = opening?.entries?.[i];
    const openingPick = !!openingEntry?.pick;
    const openingLift = openingPick ? 0.08 + Math.max(0, 3 - openingEntry.rank) * 0.026 : 0;
    const openingColor = openingEntry?.rank === 1 ? 0xffdf9a : 0xf2ad55;
    const activeEntry = activePlacement?.entries?.[i];
    const activePick = !!activeEntry?.pick;
    const activeLift = activePick ? 0.09 + Math.max(0, 3 - activeEntry.rank) * 0.026 : 0;
    const activeColor = (activeEntry?.urgent || 0) > 0.46 || pressure > 0.52
      ? 0xf08b54
      : activeEntry?.rank === 1
        ? 0xffcb7b
        : 0xf3a95a;
    line.scale.setScalar((hover ? 1.08 : 1) + pulse + openingLift + activeLift);
    line.material.color.setHex(!affordable
      ? 0xa66d4b
      : activePick
        ? activeColor
        : pressure > 0.48
          ? 0xe89a56
          : openingPick
            ? openingColor
            : hover
              ? 0xffe0a0
              : 0xf0c46a);
    line.material.opacity = !affordable
      ? 0.28
      : hover
        ? 0.8
        : activePick
          ? Math.min(0.92, 0.68 + Math.max(0, 3 - activeEntry.rank) * 0.055 + pressure * 0.14 + Math.max(0, pulse) * 0.7)
          : openingPick
            ? Math.min(0.9, 0.72 + Math.max(0, 3 - openingEntry.rank) * 0.055 + Math.max(0, pulse) * 0.8)
            : opening
              ? 0.34 + Math.max(0, pulse) * 0.3
              : activePlacement
                ? Math.max(0.32, 0.42 + pressure * 0.22 + Math.max(0, pulse) * 0.4)
                : 0.5 + pulse * 1.2 + pressure * 0.12;
    line.userData.pressure = Number(pressure.toFixed(2));
    line.userData.openingScore = Number((openingEntry?.score || 0).toFixed(2));
    line.userData.openingRank = openingPick ? openingEntry.rank : null;
    line.userData.activeScore = Number((activeEntry?.score || 0).toFixed(2));
    line.userData.activeRank = activePick ? activeEntry.rank : null;
    line.userData.activeUrgent = Number((activeEntry?.urgent || 0).toFixed(2));
  });
  buildPadHints.visible = visible > 0;
  buildPadHints.userData.visibleCount = visible;
  buildPadHints.userData.totalCount = pads.length;
  buildPadHints.userData.affordable = affordable;
  buildPadHints.userData.pressurePads = pressureEnemies.length
    ? buildPadHints.children.filter((line) => line.visible && (line.userData.pressure || 0) > 0.2).length
    : 0;
  buildPadHints.userData.openingMode = !!opening;
  buildPadHints.userData.openingPicks = opening?.picks || 0;
  buildPadHints.userData.openingBestScore = opening?.bestScore || 0;
  buildPadHints.userData.activePlacementMode = !!activePlacement;
  buildPadHints.userData.activePlacementPicks = activePlacement?.picks || 0;
  buildPadHints.userData.activePlacementBestScore = activePlacement?.bestScore || 0;
  return {
    active: true,
    visible,
    total: pads.length,
    affordable,
    openingMode: !!opening,
    openingPicks: opening?.picks || 0,
    openingBestScore: opening?.bestScore || 0,
    openingTop: opening?.top || [],
    activePlacementMode: !!activePlacement,
    activePlacementPicks: activePlacement?.picks || 0,
    activePlacementBestScore: activePlacement?.bestScore || 0,
    activePlacementTop: activePlacement?.top || [],
  };
}

// faint threads from a selected buff/aura tower to the towers it is currently boosting
const AURA_LINE_MAX = 48;
const auraLinePos = new Float32Array(AURA_LINE_MAX * 2 * 3);
const auraLineGeom = new THREE.BufferGeometry();
auraLineGeom.setAttribute('position', new THREE.BufferAttribute(auraLinePos, 3));
const auraLines = new THREE.LineSegments(
  auraLineGeom,
  new THREE.LineBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.55, depthWrite: false }),
);
auraLines.frustumCulled = false;
auraLines.visible = false;

engine.scene.add(padRing, rangeRing, selRing, auraLines, selectedTargetThread, buildPadHints, roadPressureCues, enemyContactFeedback, palaceCommandFeedback, gateHoldFeedback);
// gentle opacity pulse on the active selection ring
engine.onUpdate(() => {
  if (!selRing.visible) return;
  const base = selRing.userData.pulseBase ?? 0.65;
  const amp = selRing.userData.pulseAmp ?? 0.2;
  selRing.material.opacity = base + Math.sin(engine.elapsed * 5) * amp;
});
engine.onUpdate(() => syncBuildPadHints());
engine.onUpdate(() => syncRoadPressureCues());
engine.onUpdate(() => syncEnemyContactFeedback());
engine.onUpdate(() => syncSelectedTargetThread());
engine.onUpdate(() => syncZabulistanPalaceCommandFeedback());
engine.onUpdate(() => syncZabulistanGateHoldFeedback());

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const screenPoint = new THREE.Vector3();

function pick(clientX, clientY, targets) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, engine.camera);
  return raycaster.intersectObjects(targets, true);
}

function projectedScreenPoint(pos, lift = 0) {
  const rect = canvas.getBoundingClientRect();
  screenPoint.set(pos.x, pos.y + lift, pos.z).project(engine.camera);
  if (screenPoint.z < -1 || screenPoint.z > 1) return null;
  return {
    x: (screenPoint.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-screenPoint.y * 0.5 + 0.5) * rect.height + rect.top,
  };
}

function forgivingPickRadius(basePx) {
  const rect = canvas.getBoundingClientRect();
  return Math.min(rect.width, rect.height) < 620 ? basePx + 10 : basePx;
}

function nearestScreenItem(items, clientX, clientY, maxPx, liftFor) {
  let best = null;
  let bestD = maxPx;
  for (const item of items) {
    const pos = item.pos || item.group?.position;
    if (!pos) continue;
    const lift = typeof liftFor === 'function' ? liftFor(item) : liftFor;
    const sp = projectedScreenPoint(pos, lift || 0);
    if (!sp) continue;
    const d = Math.hypot(sp.x - clientX, sp.y - clientY);
    if (d <= bestD) { best = item; bestD = d; }
  }
  return best;
}

function pickNearestPad(x, y) {
  if (!game) return null;
  return nearestScreenItem(game.map.pads || [], x, y, forgivingPickRadius(48), 0.6);
}

function pickNearestTower(x, y) {
  if (!game) return null;
  return nearestScreenItem(game.towers.filter((t) => t.alive), x, y, forgivingPickRadius(56), (tower) => {
    const radius = tower.model?.radius || 1.2;
    return Math.max(1.4, radius * 1.2);
  });
}

function pickPad(x, y) {
  if (!game) return null;
  const hits = pick(x, y, game.map.pads.map((p) => p.mesh).filter(Boolean));
  if (!hits.length) return pickNearestPad(x, y);
  let obj = hits[0].object;
  return game.map.pads.find((p) => p.mesh === obj || p.mesh.children.includes(obj) || isDescendant(p.mesh, obj)) || null;
}

function isDescendant(parent, child) {
  let n = child;
  while (n) { if (n === parent) return true; n = n.parent; }
  return false;
}

function pickEntity(x, y) {
  if (!game) return null;
  // nearest hit wins between towers, enemy pick-proxies, and the central palace landmark
  const towerHits = pick(x, y, game.towers.filter((t) => t.alive).map((t) => t.group));
  const proxies = game.enemies.filter((e) => e.alive).map((e) => e.pickProxy);
  const enemyHits = pick(x, y, proxies);
  const cit = game.map.citadel;
  const palaceHits = cit && cit.isPalace ? pick(x, y, [cit.group]) : [];
  const tDist = towerHits.length ? towerHits[0].distance : Infinity;
  const eDist = enemyHits.length ? enemyHits[0].distance : Infinity;
  const pDist = palaceHits.length ? palaceHits[0].distance : Infinity;
  const m = Math.min(tDist, eDist, pDist);
  if (m === Infinity) {
    const nearTower = pickNearestTower(x, y);
    return nearTower ? { kind: 'tower', entity: nearTower } : null;
  }
  if (eDist === m) {
    const en = enemyHits[0].object.userData.enemy;
    if (en?.alive) return { kind: 'enemy', entity: en };
  }
  if (tDist === m) {
    const tw = game.towers.find((t) => isDescendant(t.group, towerHits[0].object));
    if (tw) return { kind: 'tower', entity: tw };
  }
  if (pDist === m && palaceHits.length) return { kind: 'palace', entity: cit };
  const nearTower = pickNearestTower(x, y);
  if (nearTower) return { kind: 'tower', entity: nearTower };
  return null;
}

function pickGround(x, y) {
  if (!game) return null;
  const hits = pick(x, y, [game.map.terrain]);
  return hits.length ? hits[0].point : null;
}

// range-ring colour by role / damage type, so selection reads the tower's nature at a glance
const RING_COLORS = {
  archer: 0x2fa7a0,   // teal — arrows
  siege: 0xd08a3a,    // amber — impact
  fire: 0xff6a1f,     // ember
  magic: 0x9a6cff,    // violet
  trap: 0x86d83f,     // venom
  support: 0x4fd07a,  // green
  aura: 0xffc23a,     // gold
  economy: 0xffc23a,  // gold
  barracks: 0x6f9fd0, // steel
};
const BUFF_RING = 0x4fd07a; // effect radius of pure aura / heal towers

function ringFor(def, stats) {
  if (!def) return null;
  const range = (stats?.range ?? def.range) || 0;
  const damage = (stats?.damage ?? def.damage) || 0;
  const aura = stats?.aura ?? def.aura;
  const heal = stats?.heal ?? def.heal;
  const repair = stats?.repair ?? def.repair;
  // effect radius for buff/support towers (mirrors _recomputeAuras: (range||11)*1.1)
  let effectR = 0;
  if (aura) effectR = Math.max(effectR, (def.range || 11) * 1.1);
  if (heal) effectR = Math.max(effectR, heal.radius);
  if (repair) effectR = Math.max(effectR, repair.radius);
  // pure buff/heal towers don't attack — show their effect radius, not a zero attack ring
  if (damage <= 0 && effectR > 0) return { radius: effectR, color: BUFF_RING };
  if (range > 0) {
    const color = def.dmgType === 'true' ? 0xffe08a : (RING_COLORS[def.role] || 0x2fa7a0);
    return { radius: range, color };
  }
  if (effectR > 0) return { radius: effectR, color: BUFF_RING };
  return null;
}

function showRangeFor(def, pos, heroOrTower) {
  const stats = heroOrTower?.getStats ? heroOrTower.getStats() : null;
  const info = ringFor(def || heroOrTower?.def, stats);
  if (!info) { rangeRing.visible = false; return; }
  rangeRing.material.color.setHex(info.color);
  rangeRing.scale.setScalar(info.radius);
  rangeRing.position.set(pos.x, pos.y + 0.25, pos.z);
  rangeRing.visible = true;
}

// faint threads from a selected buff/aura tower to the towers it is currently boosting
function showAuraLinks(tower, color) {
  auraLines.visible = false;
  if (!tower?.alive || !game) return;
  const def = tower.def;
  const stats = tower.getStats ? tower.getStats() : null;
  const aura = stats?.aura ?? def.aura;
  const repair = stats?.repair ?? def.repair;
  let radius = 0;
  if (aura) radius = Math.max(radius, (def.range || 11) * 1.1); // matches _recomputeAuras reach
  if (repair) radius = Math.max(radius, repair.radius);
  if (!radius) return; // not a tower-to-tower aura source
  auraLines.material.color.setHex(color);
  const sx = tower.pos.x, sy = tower.pos.y + 1.3, sz = tower.pos.z;
  let n = 0;
  for (const o of game.towers) {
    if (o === tower || !o.alive) continue;
    if (o.pos.distanceTo(tower.pos) > radius) continue;
    if (n >= AURA_LINE_MAX) break;
    const i = n * 6;
    auraLinePos[i] = sx; auraLinePos[i + 1] = sy; auraLinePos[i + 2] = sz;
    auraLinePos[i + 3] = o.pos.x; auraLinePos[i + 4] = o.pos.y + 1.3; auraLinePos[i + 5] = o.pos.z;
    n++;
  }
  if (!n) return;
  auraLineGeom.setDrawRange(0, n * 2);
  auraLineGeom.attributes.position.needsUpdate = true;
  auraLines.visible = true;
}

// full visual selection set: range ring + footprint highlight + aura links
function showSelection(tower) {
  selectedTower = tower;
  showRangeFor(null, tower.pos, tower);
  setRangeRingDefaultStyle();
  selRing.material.color.setHex(0xffe9a8);
  selRing.material.depthTest = false;
  selRing.userData.pulseBase = 0.65;
  selRing.userData.pulseAmp = 0.2;
  selRing.scale.setScalar((tower.model?.radius || 1.1) * 1.35);
  selRing.position.set(tower.pos.x, tower.pos.y + 0.12, tower.pos.z);
  selRing.visible = true;
  const info = ringFor(tower.def, tower.getStats ? tower.getStats() : null);
  showAuraLinks(tower, info ? info.color : 0xffc23a);
}

function hideSelection() {
  selectedTower = null;
  resetSelectedTargetThread('selection-hidden');
  setRangeRingDefaultStyle();
  rangeRing.visible = false;
  selRing.visible = false;
  auraLines.visible = false;
}

// selection visual for the central palace — a wide gold footprint ring, no range/aura links
function showSelectionPalace(cit) {
  selectedTower = null;
  resetSelectedTargetThread('palace-selected');
  rangeRing.visible = false;
  auraLines.visible = false;
  selRing.material.color.setHex(0xffd26a);
  selRing.material.depthTest = true;
  selRing.userData.pulseBase = 0.26;
  selRing.userData.pulseAmp = 0.06;
  selRing.scale.setScalar(Math.max(10, Math.min(18, (cit.footprint || 15) * 0.62)));
  selRing.position.set(cit.group.position.x, cit.group.position.y + 0.28, cit.group.position.z);
  selRing.visible = true;
}

// pointer interactions
let downPos = null;
canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) downPos = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => {
  if (!game || !hud) return;
  if (hud.mode.kind === 'build') {
    const pad = pickPad(e.clientX, e.clientY);
    const zabulistan = game.mapDef?.id === 'zabulistan';
    const affordable = (hud.mode.def?.cost || 0) <= (game.gold || 0);
    hoveredBuildPad = pad && !pad.tower && (pad.rubbleT || 0) <= 0 ? pad : null;
    syncBuildPadHints();
    if (pad && !pad.tower && (pad.rubbleT || 0) <= 0) {
      padRing.position.set(pad.pos.x, pad.pos.y + 0.35, pad.pos.z);
      padRing.material.color.setHex(affordable ? 0xf4cd6e : 0xa66d4b);
      padRing.material.depthTest = !!zabulistan;
      padRing.material.blending = zabulistan ? THREE.NormalBlending : THREE.AdditiveBlending;
      padRing.material.opacity = zabulistan ? (affordable ? 0.68 : 0.34) : (affordable ? 0.92 : 0.44);
      padRing.material.needsUpdate = true;
      padRing.visible = true;
      showRangeFor(hud.mode.def, pad.pos);
      if (zabulistan) setRangeRingBuildStyle();
      else setRangeRingDefaultStyle();
    } else { padRing.visible = false; if (!hud.selectedEntity) hideSelection(); }
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !downPos || !game || !hud) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return; // was a drag
  audio.unlock();

  const mode = hud.mode;
  if (mode.kind === 'build') {
    const pad = pickPad(e.clientX, e.clientY);
    if (pad) {
      if (pad.tower) { hud.toast(t('hud.padOccupied')); return; }
      const tower = game.buildTower(mode.def.id, pad);
      if (tower) {
        hoveredBuildPad = null;
        syncBuildPadHints(true);
        if (!e.shiftKey) { hud.setMode({ kind: 'none' }); padRing.visible = false; hideSelection(); }
        return;
      }
      return;
    }
    hud.toast(t('hud.chooseFoundation'));
    return;
  }
  if (mode.kind === 'assign') {
    const picked = pickEntity(e.clientX, e.clientY);
    if (picked?.kind === 'tower') {
      game.assignHero(mode.hero, picked.entity);
      hud.toast(t('hud.heroAssigned', { hero: mode.hero.name, tower: picked.entity.def.name }));
      hud.setMode({ kind: 'none' });
      hud.showTower(picked.entity);
      hud.renderCards();
      return;
    }
    hud.toast(t('hud.chooseCommanderTower'));
    return;
  }
  if (mode.kind === 'rally') {
    const pt = pickGround(e.clientX, e.clientY);
    if (pt && mode.tower) {
      for (const sq of mode.tower.squads) sq.setRally(new THREE.Vector3(pt.x, game.map.heightAt(pt.x, pt.z), pt.z));
      hud.setMode({ kind: 'none' });
    }
    return;
  }
  // selection
  const picked = pickEntity(e.clientX, e.clientY);
  if (picked?.kind === 'tower') {
    clearInspectPause();
    hud.showTower(picked.entity);
    showSelection(picked.entity);
    rts.followEntity(null);
  } else if (picked?.kind === 'palace') {
    clearInspectPause();
    hud.showPalace(picked.entity);
    showSelectionPalace(picked.entity);
    rts.followEntity(null);
  } else if (picked?.kind === 'enemy') {
    // tactical inspection: pause the battle, focus the enemy, open its story card
    if (!paused) { inspectPaused = true; setPaused(true); }
    hideSelection();
    hud.showEnemy(picked.entity);
    rts.followEntity(picked.entity);
  } else {
    clearInspectPause();
    hud.closePanel();
    hideSelection();
    rts.follow = null;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space' && game) { e.preventDefault(); togglePause(); }
  if (e.code === 'Escape' && hud) { hud.setMode({ kind: 'none' }); hud.closePanel(); padRing.visible = false; buildPadHints.visible = false; hideSelection(); }
  if (e.code === 'KeyR' && !e.ctrlKey) rts.reset();
  // G inspects the gate sequence in sandbox; Ctrl+G toggles sandbox/test mode.
  if (e.code === 'KeyG' && game && hud) {
    e.preventDefault();
    if (game.sandbox && !e.ctrlKey) {
      hud._runSandboxInspect?.();
    } else {
      const on = game.toggleSandbox();
      hud.renderCards();
      hud.toast(on ? t('hud.sandboxOn') : t('hud.sandboxOff'));
    }
  }
  if (e.code === 'KeyF' && !e.ctrlKey && game?.sandbox && hud) {
    e.preventDefault();
    if (game.previewCommandFx()) hud.toast(t('hud.fxPreview'));
  }
  if (e.code === 'KeyH' && !e.ctrlKey && game?.sandbox && hud) {
    e.preventDefault();
    document.body.classList.add('panel-hidden');
    hud._syncToggle?.();
    const result = game.sandboxPalaceAssault(e.shiftKey ? { mode: 'royal', fullFx: true } : {});
    if (result) hud.toast(t('hud.gateAssaultMode', { n: result.count, mode: tOpt('hud.gateAssault.' + result.mode, result.mode) }));
  }
});

let currentSpeed = 1;
let inspectPaused = false; // auto-paused because the player is inspecting an enemy

function setPaused(v) {
  paused = v;
  engine.speed = paused ? 0 : currentSpeed;
  const pauseBtn = $('#pauseBtn');
  if (pauseBtn) {
    pauseBtn.textContent = paused ? '▶' : '⏸';
    pauseBtn.setAttribute('aria-label', paused ? t('hud.resume') : t('hud.pause'));
    pauseBtn.title = paused ? t('hud.resume') : t('hud.pause');
  }
}

function togglePause() {
  inspectPaused = false; // manual control overrides inspection pause
  setPaused(!paused);
}

function clearInspectPause() {
  if (inspectPaused) { inspectPaused = false; setPaused(false); }
}

// ---------- battle lifecycle ----------
const menus = new Menus({
  onStartMap: (mapDef, endless, snapshot) => startBattle(mapDef, endless, false, snapshot),
  onCodex: () => codex.show(),
  onSettings: () => settingsUI.show(),
});

function startBattle(mapDef, endless, sandbox = false, snapshot = null) {
  cleanupBattle();
  // #sandbox in the URL starts any map in test mode (also toggle in-battle with G)
  if (location.hash.toLowerCase().includes('sandbox')) sandbox = true;
  game = new Game(engine, mapDef, { endless, sandbox });
  // resume a saved mid-battle state (towers, economy, wave, live enemies) before the first frame
  if (snapshot) { try { applyBattleSnapshot(game, snapshot); } catch (e) { console.warn('battle restore failed', e); } }
  hud = new HUD(game, {
    onExit: () => { saveBattle(game); cleanupBattle(); menus.showMain(); }, // keep progress to resume later
    onTogglePause: togglePause,
    onSpeed: (s, btn) => {
      currentSpeed = s;
      if (!paused) engine.speed = s;
      for (const b of document.querySelectorAll('#speedBtns .iconbtn')) {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    },
    onCodex: () => codex.show(),
    onSettings: () => settingsUI.show(),
    onSelectionCleared: () => { hideSelection(); clearInspectPause(); },
  });
  paused = false;
  currentSpeed = 1;
  engine.speed = 1;
  game.debris.setHeightFn((x, z) => game.map.heightAt(x, z));

  game.on('victory', ({ unlockedHeroes }) => {
    if (game?._qaSuppressEndScreen) return;
    setTimeout(() => menus.showEnd({
      victory: true, unlockedHeroes, mapDef,
      endless: false, wave: game.waveIdx,
      onContinueEndless: () => { game.endlessMode = true; game.phase = 'build'; menus.hideAll(); },
      onExit: () => { cleanupBattle(); menus.showCampaign(false); },
    }), 1400);
  });
  game.on('defeat', () => {
    if (game?._qaSuppressEndScreen) return;
    setTimeout(() => menus.showEnd({
      victory: false, mapDef, endless: game.endlessMode, wave: game.waveIdx,
      onRetry: () => { clearBattle(); startBattle(mapDef, endless); },
      onExit: () => { cleanupBattle(); menus.showCampaign(false); },
    }), 1600);
  });
  game.on('palaceCommand', (payload) => triggerZabulistanPalaceCommandFeedback(payload));
  game.on('palaceCommandFx', (payload) => triggerZabulistanPalaceCommandFeedback(payload));

  gameUpdateOff = engine.onUpdate((dt) => { if (game) game.update(dt, engine.elapsed); });
  audio.unlock();
  audio.setScene('battle');
  audio.setIntensity(0.12);

  // cinematic fly-in: sweep from the enemy gate to the citadel (skip it when resuming a saved battle)
  if (!snapshot) {
    const s0 = game.map.paths[0].samples[0].pos;
    rts.flyIn(new THREE.Vector3(s0.x, s0.y, s0.z), 4.2);
    const startedGame = game;
    setTimeout(() => {
      if (game === startedGame && !startedGame._qaSuppressBattleStartBanner) startedGame.emit('battleStarted', { mapDef });
    }, 520);
  }

  if (game.sandbox) hud.toast(t('hud.sandboxOn'));
}

function cleanupBattle() {
  audio.setScene('menu');
  if (gameUpdateOff) { gameUpdateOff(); gameUpdateOff = null; }
  if (hud) { hud.destroy(); hud = null; }
  if (game) { game.dispose(); game = null; }
  padRing.visible = false;
  buildPadHints.visible = false;
  roadPressureCues.visible = false;
  roadPressureCues.userData.visibleCount = 0;
  resetEnemyContactFeedback();
  resetZabulistanPalaceCommandFeedback();
  resetZabulistanGateHoldFeedback();
  buildPadHintKey = '';
  hoveredBuildPad = null;
  hideSelection();
  engine.speed = 1;
  paused = false;
}

onLangChange(() => { /* HUD and menus re-render via their own subscriptions */ });

// last-chance autosave when the tab is hidden or the window closes mid-battle (covers reload/close)
window.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.sandbox) saveBattle(game); });
window.addEventListener('beforeunload', () => { if (game && !game.sandbox) saveBattle(game); });

// boot
const bootQaPreset = new URLSearchParams(window.location.search).get('qa') || '';
if (bootQaPreset) loadPalace('zabulistan');
preloadAssets(); // GLTF characters/animals load in the background; procedural fallback until ready
loadAllProps(); // static building kit (curtain walls, village, docks…) warm before first map build
import('./models/materials.js').then((m) => m.enhanceMaterials());
menus.showMain(); // ready behind the splash
// the hero backdrop is painted at parse-time via the inline <style> in index.html + the
// preload link, so it appears with the splash instead of after the JS bundle loads.
// hold the splash for the intro animation, then fade to the menu (skip on reduced-motion)
const _splashHold = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 400 : 2400;
setTimeout(() => {
  const loading = $('#loading');
  if (!loading) return;
  loading.classList.add('hidden');
  loading.setAttribute('aria-hidden', 'true');
  loading.inert = true;
  setTimeout(() => { if (loading.classList.contains('hidden')) loading.remove(); }, 760);
}, _splashHold);

// debug/QA handle (harmless in production; used by automated browser tests)
import { buildWeaponTestModel, buildEnemyModel, heroModel, buildSoldierModel } from './models/creature.js';
const __clearTest = () => {
  for (let i = engine.scene.children.length - 1; i >= 0; i--)
    if (engine.scene.children[i].userData.__wt) engine.scene.children[i].removeFromParent();
};
const __defaultQaMap = () => MAPS_BY_ID.kabul || MAPS.find((m) => m.boss) || MAPS[0];
const __ensureQaBattle = (mapId = null, sandbox = true) => {
  const target = MAPS_BY_ID[mapId] || __defaultQaMap();
  if (!game || (mapId && game.mapDef.id !== target.id)) startBattle(target, false, sandbox);
  if (game && sandbox) {
    game._qaSuppressBattleStartBanner = true;
    game._qaSuppressEndScreen = true;
  }
  document.querySelectorAll('.overlay.visible').forEach((node) => node.classList.remove('visible'));
  const loading = $('#loading');
  if (loading) {
    loading.classList.add('hidden');
    loading.setAttribute('aria-hidden', 'true');
    loading.inert = true;
  }
  if (sandbox && game && !game.sandbox) game.toggleSandbox?.();
  return game;
};
const __resetQaOpeningBuild = (g) => {
  if (!g) return;
  for (const enemy of [...(g.enemies || [])]) enemy.destroy?.();
  if (Array.isArray(g.enemies)) g.enemies.length = 0;
  if (Array.isArray(g.spawnQueue)) g.spawnQueue.length = 0;
  for (const projectile of [...(g.projectiles || [])]) {
    if (projectile.destroy) projectile.destroy();
    else projectile.group?.removeFromParent?.();
  }
  if (Array.isArray(g.projectiles)) g.projectiles.length = 0;
  for (const squad of [...(g.palaceSquads || [])]) squad.destroy?.();
  if (Array.isArray(g.palaceSquads)) g.palaceSquads.length = 0;
  for (const marker of [...(g.gateMarkers || [])]) marker.group?.removeFromParent?.();
  if (Array.isArray(g.gateMarkers)) g.gateMarkers.length = 0;
  for (const tower of [...(g.towers || [])]) {
    if (tower.pad) {
      tower.pad.tower = null;
      tower.pad.rubbleT = 0;
    }
    tower.destroy?.();
  }
  if (Array.isArray(g.towers)) g.towers.length = 0;
  for (const pad of g.map?.pads || []) {
    pad.tower = null;
    pad.rubbleT = 0;
  }
  g.waveActive = false;
  g.phase = 'build';
  g.waveIdx = 0;
  g.waveCountdown = g.prepTimeFirst || 25;
  g.__qaContactSeeded = false;
  g.palaceAssaultStatus = null;
  enemyContactState.clear();
  resetEnemyContactFeedback();
  resetZabulistanGateHoldFeedback();
  roadPressureCues.visible = false;
  selectedTargetThread.visible = false;
  hideSelection();
  hud?.refreshAll?.();
};
const __isOverflowQaVisible = (node) => {
  const loading = node.closest?.('#loading');
  if (loading) return false;
  for (let cur = node; cur && cur !== document.body; cur = cur.parentElement) {
    const style = getComputedStyle(cur);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
  }
  return true;
};
const __overflowReport = () => Array.from(document.querySelectorAll('body *'))
  .map((node) => ({
    node,
    extra: Math.round((node.scrollWidth || 0) - (node.clientWidth || 0)),
    tag: node.tagName?.toLowerCase(),
    id: node.id || '',
    cls: String(node.className || '').slice(0, 120),
  }))
  .filter((x) => x.extra > 1 && __isOverflowQaVisible(x.node) && !(x.id === 'ui' && document.documentElement.scrollWidth <= window.innerWidth))
  .sort((a, b) => b.extra - a.extra)
  .slice(0, 20)
  .map(({ node, ...x }) => ({ ...x, text: (node.textContent || '').trim().slice(0, 90) }));
const __qaBackdropView = (opts = {}) => {
  rts.followEntity(null);
  rts._fly = null;
  const yaw = Number.isFinite(opts.yaw) ? opts.yaw : -Math.PI / 4 + (Number(opts.step || 0) * Math.PI / 3);
  const pitch = Number.isFinite(opts.pitch) ? opts.pitch : 0.72;
  const dist = Number.isFinite(opts.dist) ? opts.dist : 104;
  rts.target.set(0, 0, 0);
  rts.targetGoal.set(0, 0, 0);
  rts.yaw = rts.yawGoal = yaw;
  rts.pitch = rts.pitchGoal = pitch;
  rts.dist = rts.distGoal = dist;
  rts.update(0.016);
};
const __qaZabulistanForecourtView = (opts = {}) => {
  const map = game?.map;
  if (!map) return null;
  rts.followEntity(null);
  rts._fly = null;
  const samples = map.paths?.[0]?.samples || [];
  const exit = map.exitPos;
  const s = samples[Math.max(0, samples.length - 8)] || samples[0];
  const fwd = new THREE.Vector3((s?.pos.x || 0) - exit.x, 0, (s?.pos.z || 0) - exit.z);
  if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, 1);
  fwd.normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const mobile = window.innerWidth < 700;
  const target = exit.clone()
    .addScaledVector(fwd, Number.isFinite(opts.forward) ? opts.forward : mobile ? 28 : 26)
    .addScaledVector(side, Number.isFinite(opts.side) ? opts.side : 0);
  const yaw = Math.atan2(fwd.x, fwd.z) + (Number.isFinite(opts.yawOffset) ? opts.yawOffset : 0.02);
  const pitch = Number.isFinite(opts.pitch) ? opts.pitch : mobile ? 0.66 : 0.64;
  const dist = Number.isFinite(opts.dist) ? opts.dist : mobile ? 66 : 62;
  rts.target.set(target.x, 0, target.z);
  rts.targetGoal.copy(rts.target);
  rts.yaw = rts.yawGoal = yaw;
  rts.pitch = rts.pitchGoal = pitch;
  rts.dist = rts.distGoal = dist;
  rts.update(0.016);
  return {
    target: { x: Number(target.x.toFixed(2)), z: Number(target.z.toFixed(2)) },
    yaw: Number(yaw.toFixed(3)),
    pitch: Number(pitch.toFixed(3)),
    dist: Number(dist.toFixed(1)),
  };
};
const __qaPathSampleAt = (path, dist) => {
  const samples = path?.samples || [];
  if (!samples.length) return null;
  let best = samples[0];
  let bestD = Infinity;
  for (const sample of samples) {
    const d = Math.abs((sample.dist || 0) - dist);
    if (d < bestD) { bestD = d; best = sample; }
  }
  return best;
};
const __qaZabulistanRealWaveContact = (opts = {}) => {
  const g = game;
  const path = g?.map?.paths?.[0];
  const samples = path?.samples || [];
  if (!g || !path || !samples.length) return { ok: false, reason: 'missing-path' };
  const contactDist = Math.max(8, Math.min(path.length - 8, Number.isFinite(opts.pathDist) ? opts.pathDist : path.length - 34));
  const anchor = __qaPathSampleAt(path, contactDist)?.pos || samples[Math.max(0, samples.length - 10)]?.pos || g.map.exitPos;
  const targetTowerCount = Math.max(1, Math.min(6, opts.towers || 4));
  const towerDef = TOWERS_BY_ID[opts.towerId || 'zabul-watch'] || Object.values(TOWERS_BY_ID)[0];
  const existing = g.towers.filter((tower) => tower.alive && tower.def?.id === towerDef?.id);
  if (towerDef && existing.length < targetTowerCount) {
    const pads = (g.map.pads || [])
      .filter((pad) => !pad.tower && (pad.rubbleT || 0) <= 0)
      .map((pad) => ({ pad, d: Math.hypot(pad.pos.x - anchor.x, pad.pos.z - anchor.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, targetTowerCount - existing.length);
    for (const { pad } of pads) {
      const tower = g.buildTower(towerDef.id, pad);
      if (tower) {
        while (tower.ageIdx < 1 && tower.canUpgrade()) g.upgradeTower(tower);
        tower.attackCd = 0;
      }
    }
  }
  let selectedThreadTower = null;
  if (opts.selectTower) {
    selectedThreadTower = g.towers
      .filter((tower) => tower.alive && (!towerDef || tower.def?.id === towerDef.id))
      .map((tower) => ({ tower, d: tower.pos.distanceTo(anchor) }))
      .sort((a, b) => a.d - b.d)[0]?.tower || g.towers.find((tower) => tower.alive);
    if (selectedThreadTower) {
      selectedThreadTower.attackCd = 0;
      showSelection(selectedThreadTower);
    }
  }

  const seeded = !!g.__qaContactSeeded && g.waveActive && g.enemies.some((enemy) => enemy.alive);
  if (!seeded) {
    g.__qaContactSeeded = true;
    if (!g.waveActive) {
      g.waveCountdown = 0;
      g.startWave(true);
    }
    (g.spawnQueue || []).forEach((entry, i) => { entry.delay = Math.min(entry.delay || 0, 0.05 + i * 0.035); });
    enemyContactState.clear();
  }

  const spawnFrames = seeded ? 8 : 46;
  for (let i = 0; i < spawnFrames; i++) {
    g.update(1 / 30, engine.elapsed + i / 30);
  }
  const alive = g.enemies.filter((enemy) => enemy.alive && !enemy.flying).slice(0, 10);
  if (!seeded) {
    alive.forEach((enemy, i) => {
      const d = Math.max(4, Math.min(enemy.path.length - 4, contactDist - i * 1.75));
      enemy.dist = d;
      const s = __qaPathSampleAt(enemy.path, d);
      if (s?.pos) enemy.group.position.set(s.pos.x, s.pos.y, s.pos.z);
      enemy.applySlow?.(enemy.boss ? 0.78 : 0.64, 1.0 + i * 0.04);
    });
  }
  for (const tower of g.towers) if (tower.alive && tower.pos.distanceTo(anchor) < 32) tower.attackCd = Math.min(tower.attackCd, 0.02);
  const settleFrames = Math.max(0, Math.min(120, opts.settleFrames ?? (seeded ? 20 : 58)));
  let contact = { active: false, visible: 0 };
  for (let i = 0; i < settleFrames; i++) {
    g.update(1 / 30, engine.elapsed + (spawnFrames + i) / 30);
    contact = syncEnemyContactFeedback();
    if (opts.selectTower) syncSelectedTargetThread();
  }
  if ((contact.visible || 0) <= 0) {
    const cueTargets = g.enemies
      .filter((enemy) => enemy.alive && enemy.group?.position)
      .sort((a, b) => (b.dist || 0) - (a.dist || 0))
      .slice(0, 3);
    cueTargets.forEach((enemy, i) => primeEnemyContactCue(enemy, 0.42 + i * 0.08));
    contact = syncEnemyContactFeedback();
  }
  let forcedConfirm = null;
  if (opts.forceContactConfirm) {
    const cueTargets = g.enemies
      .filter((enemy) => enemy.group?.position && Number.isFinite(enemy.maxHp))
      .sort((a, b) => (b.dist || 0) - (a.dist || 0));
    const heavyTarget = cueTargets.find((enemy) => enemy.alive);
    if (heavyTarget) {
      const maxHp = Math.max(1, heavyTarget.maxHp || 1);
      const hp = Math.max(1, heavyTarget.hp || maxHp);
      enemyContactState.set(heavyTarget.id, {
        hp,
        maxHp,
        alive: true,
        lastHitT: engine.elapsed - 0.03,
        killT: -99,
        hitPower: 0.72,
      });
      heavyTarget.hp = Math.max(1, hp - Math.max(2, maxHp * 0.34));
    }
    const killTarget = cueTargets.find((enemy) => enemy.alive && enemy.id !== heavyTarget?.id) || heavyTarget;
    if (killTarget) {
      const maxHp = Math.max(1, killTarget.maxHp || 1);
      enemyContactState.set(killTarget.id, {
        hp: Math.max(1, killTarget.hp || maxHp),
        maxHp,
        alive: true,
        lastHitT: engine.elapsed - 0.02,
        killT: -99,
        hitPower: 1,
      });
      if (killTarget.alive && typeof killTarget.takeDamage === 'function') {
        killTarget.takeDamage(Math.max(killTarget.hp || maxHp, maxHp) + 999, 'true', { command: true, impact: 0.9 });
      } else {
        killTarget.hp = 0;
        killTarget.alive = false;
        killTarget.deadT = Math.max(killTarget.deadT || 0, 1.2);
      }
      forcedConfirm = { enemyId: killTarget.id, heavyId: heavyTarget?.id || null };
    }
    contact = syncEnemyContactFeedback();
  }
  let targetThread = opts.selectTower ? syncSelectedTargetThread() : { active: false, visible: false, reason: 'not-selected' };
  if (opts.selectTower && selectedThreadTower && !targetThread.visible) {
    const target = g.enemies
      .filter((enemy) => enemy.alive && enemy.group?.position)
      .map((enemy) => ({ enemy, d: selectedThreadTower.pos.distanceTo(enemy.group.position) }))
      .sort((a, b) => a.d - b.d)[0]?.enemy;
    if (target) {
      selectedThreadTower.lastTarget = target;
      selectedThreadTower.lastTargetT = g._time || engine.elapsed || 0;
      selectedThreadTower.lastTargetKind = selectedThreadTower.def?.vfx || selectedThreadTower.def?.role || null;
      showSelection(selectedThreadTower);
      targetThread = syncSelectedTargetThread();
    }
  }
  hud?.refreshAll?.();
  return {
    ok: true,
    wave: g.waveIdx,
    waveActive: g.waveActive,
    towers: g.towers.filter((tower) => tower.alive).length,
    enemies: g.enemies.filter((enemy) => enemy.alive).length,
    contact,
    forcedConfirm,
    targetThread,
    anchor: { x: Number(anchor.x.toFixed(2)), z: Number(anchor.z.toFixed(2)), dist: Number(contactDist.toFixed(1)) },
  };
};
window.__dbg = {
  engine, rts, settings, get game() { return game; }, get hud() { return hud; }, startMap: startBattle,
  fxPreview: (options) => game?.previewCommandFx(options),
  palaceAssault: (options) => game?.sandboxPalaceAssault(options),
  palaceCommandFeedback: (payload) => triggerZabulistanPalaceCommandFeedback(payload),
  gateHoldFeedback: () => syncZabulistanGateHoldFeedback(),
  visualQa: {
    metrics: () => ({
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scroll: { width: document.documentElement.scrollWidth, inner: window.innerWidth, overflow: document.documentElement.scrollWidth > window.innerWidth },
      artifacts: auditVisualArtifacts(engine.scene, { scope: 'qa' }).slice(0, 24),
      backdrops: backdropSceneReport(engine.scene),
      renderer: { calls: engine.renderer.info.render.calls, triangles: engine.renderer.info.render.triangles },
    }),
    auditArtifacts: (opts = {}) => {
      const findings = auditVisualArtifacts(engine.scene, { scope: opts.scope || 'qa' });
      const sanitized = opts.hide ? sanitizeVisualArtifacts(engine.scene, { scope: opts.scope || 'qa', hide: true }) : null;
      return { count: findings.length, findings: findings.slice(0, 30), sanitized };
    },
    overflow: __overflowReport,
    backdrops: () => ({
      manifest: backdropManifestReport(),
      scene: backdropSceneReport(engine.scene),
    }),
    state: (name = 'normal', opts = {}) => {
      const state = String(name || 'normal');
      document.body.classList.toggle('visual-qa-capture', state !== 'normal');
      const mapByState = state.includes('fog') ? 'mazandaran'
        : state.includes('twin') ? 'arash-watch'
        : state.includes('final') ? 'gang-dez'
        : state.toLowerCase().includes('zabulistan') ? 'zabulistan'
        : state.toLowerCase().includes('backdrop') ? (opts.mapId || 'zabulistan')
        : opts.mapId;
      const g = __ensureQaBattle(mapByState, true);
      if (!g) return { ok: false };
      if (g.mapDef?.id === 'zabulistan' && hasPalace(g.mapDef.id) && !g.map?.citadel?.isCustomPalace) {
        loadPalace(g.mapDef.id, () => g._swapToPalace?.());
        g._swapToPalace?.();
      }
      if (state === 'mobileRtl' || opts.rtl) {
        document.body.classList.add('rtl');
        document.documentElement.dir = 'rtl';
      }
      if (opts.ltr) {
        document.body.classList.remove('rtl');
        document.documentElement.dir = 'ltr';
      }
      if (Object.prototype.hasOwnProperty.call(opts, 'reducedMotion')) {
        settings.set('reducedMotion', !!opts.reducedMotion);
      }
      if (state === 'backdrop' || state === 'backdropSweep') {
        __qaBackdropView(opts);
        return { ok: true, state, game: g.mapDef.id, backdrops: backdropSceneReport(engine.scene), metrics: window.__dbg.visualQa.metrics() };
      }
      if (state === 'zabulistanForecourt' || state === 'forecourtApproach') {
        const view = __qaZabulistanForecourtView(opts);
        if (opts.selectPalace === true) hud?.showPalace?.(g.map.citadel);
        else hud?.closePanel?.();
        return { ok: true, state, game: g.mapDef.id, view, metrics: window.__dbg.visualQa.metrics() };
      }
      if (state === 'zabulistanBuildPads' || state === 'zabulistanOpeningBuild') {
        if (state === 'zabulistanOpeningBuild') __resetQaOpeningBuild(g);
        const view = __qaZabulistanForecourtView({
          ...opts,
          forward: Number.isFinite(opts.forward) ? opts.forward : window.innerWidth < 700 ? 24 : 21,
          side: Number.isFinite(opts.side) ? opts.side : window.innerWidth < 700 ? 20 : 4,
          dist: Number.isFinite(opts.dist) ? opts.dist : window.innerWidth < 700 ? 128 : 72,
          pitch: Number.isFinite(opts.pitch) ? opts.pitch : window.innerWidth < 700 ? 0.68 : 0.62,
          yawOffset: Number.isFinite(opts.yawOffset) ? opts.yawOffset : window.innerWidth < 700 ? 0.06 : 0.02,
        });
        hud?.closePanel?.();
        document.body.classList.add('panel-hidden');
        hud?._syncToggle?.();
        const def = TOWERS_BY_ID[opts.towerId || 'zabul-watch'] || Object.values(TOWERS_BY_ID)[0];
        if (def) hud?.setMode?.({ kind: 'build', def });
        hoveredBuildPad = null;
        const hints = syncBuildPadHints(true);
        return { ok: true, state, game: g.mapDef.id, view, towerId: def?.id || null, hints, metrics: window.__dbg.visualQa.metrics() };
      }
      if (state === 'zabulistanActiveBuildPressure') {
        const alive = g.enemies.filter((enemy) => enemy.alive);
        const assault = alive.length
          ? { reused: true, count: alive.length }
          : g.sandboxPalaceAssault?.({ mode: opts.mode || 'probe', fullFx: opts.fullFx === true, count: opts.count });
        const view = __qaZabulistanForecourtView({
          ...opts,
          forward: Number.isFinite(opts.forward) ? opts.forward : window.innerWidth < 700 ? 24 : 22,
          side: Number.isFinite(opts.side) ? opts.side : window.innerWidth < 700 ? 20 : 4,
          dist: Number.isFinite(opts.dist) ? opts.dist : window.innerWidth < 700 ? 128 : 76,
          pitch: Number.isFinite(opts.pitch) ? opts.pitch : window.innerWidth < 700 ? 0.68 : 0.62,
          yawOffset: Number.isFinite(opts.yawOffset) ? opts.yawOffset : window.innerWidth < 700 ? 0.06 : 0.02,
        });
        hud?.closePanel?.();
        document.body.classList.add('panel-hidden');
        hud?._syncToggle?.();
        const def = TOWERS_BY_ID[opts.towerId || 'zabul-watch'] || Object.values(TOWERS_BY_ID)[0];
        if (def) hud?.setMode?.({ kind: 'build', def });
        hoveredBuildPad = null;
        const hints = syncBuildPadHints(true);
        const pressure = syncRoadPressureCues();
        return {
          ok: true,
          state,
          game: g.mapDef.id,
          view,
          towerId: def?.id || null,
          assault,
          hints,
          pressure,
          enemies: g.enemies.filter((enemy) => enemy.alive).length,
          metrics: window.__dbg.visualQa.metrics(),
        };
      }
      if (state === 'zabulistanRealWaveContact') {
        const setup = __qaZabulistanRealWaveContact(opts);
        const view = __qaZabulistanForecourtView({
          ...opts,
          forward: Number.isFinite(opts.forward) ? opts.forward : window.innerWidth < 700 ? 25 : 23,
          side: Number.isFinite(opts.side) ? opts.side : window.innerWidth < 700 ? 16 : 2,
          dist: Number.isFinite(opts.dist) ? opts.dist : window.innerWidth < 700 ? 112 : 70,
          pitch: Number.isFinite(opts.pitch) ? opts.pitch : window.innerWidth < 700 ? 0.67 : 0.61,
          yawOffset: Number.isFinite(opts.yawOffset) ? opts.yawOffset : window.innerWidth < 700 ? 0.05 : 0.02,
        });
        hud?.closePanel?.();
        document.body.classList.add('panel-hidden', 'wave-active');
        hud?._syncToggle?.();
        const contact = syncEnemyContactFeedback();
        return {
          ok: true,
          state,
          game: g.mapDef.id,
          setup,
          view,
          palace: {
            custom: !!g.map?.citadel?.isCustomPalace,
            styleId: g.map?.citadel?.styleId || null,
            asset: palaceStatus(g.mapDef.id),
          },
          contact,
          pressure: syncRoadPressureCues(),
          metrics: window.__dbg.visualQa.metrics(),
        };
      }
      if (state === 'zabulistanPalaceCommandFeedback') {
        const cit = g.map?.citadel;
        if (!cit?.isPalace) return { ok: false, state, reason: 'missing-palace' };
        g.gold = Math.max(g.gold || 0, 9999);
        cit.musterCd = 0;
        cit.boonCd = 0;
        cit.gateCommandCd = 0;
        const view = __qaZabulistanForecourtView({
          ...opts,
          forward: Number.isFinite(opts.forward) ? opts.forward : window.innerWidth < 700 ? 27 : 25,
          side: Number.isFinite(opts.side) ? opts.side : window.innerWidth < 700 ? 14 : 2,
          dist: Number.isFinite(opts.dist) ? opts.dist : window.innerWidth < 700 ? 104 : 64,
          pitch: Number.isFinite(opts.pitch) ? opts.pitch : window.innerWidth < 700 ? 0.67 : 0.62,
          yawOffset: Number.isFinite(opts.yawOffset) ? opts.yawOffset : window.innerWidth < 700 ? 0.05 : 0.02,
        });
        hud?.showPalace?.(cit);
        showSelectionPalace(cit);
        document.body.classList.add('panel-hidden', 'wave-active');
        hud?._syncToggle?.();
        resetZabulistanPalaceCommandFeedback();
        const command = opts.command || 'gate';
        const assault = opts.assault === false
          ? null
          : g.sandboxPalaceAssault?.({ mode: opts.mode || 'royal', fullFx: true, commandFx: false });
        let result = null;
        if (command === 'muster') result = g.palaceMuster?.(cit);
        else if (command === 'boon') result = g.palaceBoon?.(cit);
        else if (command === 'rally') result = g.palaceRally?.(cit);
        else if (command === 'gate') result = g.palaceGateCommand?.(cit, { free: true, forceFx: true });
        if (!result) {
          triggerZabulistanPalaceCommandFeedback({
            kind: command === 'gate' ? 'gate' : command,
            type: command === 'gate' ? 'gateCommand' : command,
            palace: cit,
            count: assault?.count || 0,
            targetCount: assault?.count || 0,
            pressure: assault?.pressure || 0.8,
          });
        }
        let feedback = zabulistanPalaceCommandFeedbackSummary();
        for (let i = 0; i < 18; i++) {
          g.update(1 / 30, engine.elapsed + i / 30);
          feedback = syncZabulistanPalaceCommandFeedback();
        }
        if (g.mapDef?.id === 'zabulistan' && hasPalace(g.mapDef.id) && !g.map?.citadel?.isCustomPalace) {
          g._swapToPalace?.();
        }
        hud?.refreshAll?.();
        hud?.updatePalaceQuickActions?.();
        const reportPalace = g.map?.citadel;
        return {
          ok: true,
          state,
          game: g.mapDef.id,
          view,
          command,
          assault,
          result,
          feedback,
          palace: {
            custom: !!reportPalace?.isCustomPalace,
            styleId: reportPalace?.styleId || null,
            asset: palaceStatus(g.mapDef.id),
          },
          metrics: window.__dbg.visualQa.metrics(),
        };
      }
      if (state === 'zabulistanGateCombat') {
        const view = __qaZabulistanForecourtView({
          ...opts,
          forward: Number.isFinite(opts.forward) ? opts.forward : window.innerWidth < 700 ? 27 : 25,
          dist: Number.isFinite(opts.dist) ? opts.dist : window.innerWidth < 700 ? 64 : 60,
          pitch: Number.isFinite(opts.pitch) ? opts.pitch : window.innerWidth < 700 ? 0.64 : 0.62,
        });
        hud?.showPalace?.(g.map.citadel);
        const result = g.sandboxPalaceAssault?.({ mode: opts.mode || 'royal', fullFx: true });
        return { ok: true, state, game: g.mapDef.id, view, result, metrics: window.__dbg.visualQa.metrics() };
      }
      if (state === 'zabulistanGateHoldState') {
        const cit = g.map?.citadel;
        if (!cit?.isPalace) return { ok: false, state, reason: 'missing-palace' };
        const view = __qaZabulistanForecourtView({
          ...opts,
          forward: Number.isFinite(opts.forward) ? opts.forward : window.innerWidth < 700 ? 28 : 25,
          side: Number.isFinite(opts.side) ? opts.side : window.innerWidth < 700 ? 14 : 2,
          dist: Number.isFinite(opts.dist) ? opts.dist : window.innerWidth < 700 ? 100 : 62,
          pitch: Number.isFinite(opts.pitch) ? opts.pitch : window.innerWidth < 700 ? 0.67 : 0.62,
          yawOffset: Number.isFinite(opts.yawOffset) ? opts.yawOffset : window.innerWidth < 700 ? 0.05 : 0.02,
        });
        hud?.closePanel?.();
        document.body.classList.add('panel-hidden', 'wave-active');
        hud?._syncToggle?.();
        resetZabulistanGateHoldFeedback();
        const result = g.sandboxPalaceAssault?.({
          mode: opts.mode || 'breach',
          fullFx: opts.fullFx === true,
          commandFx: false,
          banner: false,
        });
        let feedback = syncZabulistanGateHoldFeedback();
        for (let i = 0; i < 18; i++) {
          g.update(1 / 30, engine.elapsed + i / 30);
          feedback = syncZabulistanGateHoldFeedback();
        }
        return {
          ok: true,
          state,
          game: g.mapDef.id,
          view,
          result,
          feedback,
          pressure: g.palaceGateCommandPressure?.(cit),
          metrics: window.__dbg.visualQa.metrics(),
        };
      }
      if (state === 'zabulistanCavalryCloseCombat') {
        const result = g.sandboxPalaceAssault?.({ mode: opts.mode || 'royal', fullFx: opts.fullFx === true });
        hud?.refreshAll?.();
        const view = __qaZabulistanForecourtView({
          ...opts,
          forward: Number.isFinite(opts.forward) ? opts.forward : window.innerWidth < 700 ? 32 : 31,
          side: Number.isFinite(opts.side) ? opts.side : window.innerWidth < 700 ? -1.2 : -2.2,
          dist: Number.isFinite(opts.dist) ? opts.dist : window.innerWidth < 700 ? 46 : 42,
          pitch: Number.isFinite(opts.pitch) ? opts.pitch : window.innerWidth < 700 ? 0.56 : 0.54,
          yawOffset: Number.isFinite(opts.yawOffset) ? opts.yawOffset : -0.04,
        });
        if (opts.showCommands === true) hud?.showPalace?.(g.map.citadel);
        else hud?.closePanel?.();
        return { ok: true, state, game: g.mapDef.id, view, result, metrics: window.__dbg.visualQa.metrics() };
      }
      if (state === 'palaceCommand') return { ok: true, state, result: g.palaceBoon?.(g.map.citadel) };
      if (state === 'heroCommand') return { ok: true, state, result: g.previewCommandFx?.(opts) };
      if (state === 'gateAssault') return { ok: true, state, result: g.sandboxPalaceAssault?.({ mode: opts.mode || 'royal', fullFx: true }) };
      if (state === 'bossArrival') return { ok: true, state, result: g.sandboxBossSaga?.({ defId: opts.defId || g.mapDef.boss || 'houman', result: 'active' }) };
      if (state === 'sagaTrial') return { ok: true, state, result: g.sandboxBossSaga?.({ defId: opts.defId || g.mapDef.boss || 'houman', result: 'active', skipArrival: true }) };
      if (state === 'bossBroken') return { ok: true, state, result: g.sandboxBossSaga?.({ defId: opts.defId || g.mapDef.boss || 'houman', result: 'broken', resultDelay: opts.resultDelay ?? 0, skipArrival: true }) };
      if (state === 'bossHardened' || state === 'fogFail') return { ok: true, state, result: g.sandboxBossSaga?.({ defId: opts.defId || g.mapDef.boss || 'div-e-sepid', result: 'hardened', resultDelay: opts.resultDelay ?? 0, skipArrival: true }) };
      if (state === 'victory' || state === 'defeat') {
        const banner = $('#bossBanner');
        if (banner) {
          banner.classList.remove('show', 'stage', 'arrival', 'challenge', 'victory', 'defeat');
          banner.textContent = '';
        }
        g.bossOmen.finale?.(state, g.map.citadel?.group?.position || g.map.exitPos);
        engine.bloomPulse?.(state === 'victory' ? 0.75 : 0.9);
        engine.addShake?.(state === 'victory' ? 0.35 : 0.65);
        menus.showEnd({
          victory: state === 'victory',
          mapDef: g.mapDef,
          endless: g.endlessMode,
          wave: g.waveIdx,
          unlockedHeroes: [],
          onRetry: () => {},
          onContinueEndless: () => {},
          onExit: () => {},
        });
        return { ok: true, state };
      }
      return { ok: true, state: 'normal', game: g.mapDef.id, metrics: window.__dbg.visualQa.metrics() };
    },
  },
  // weapon hand-angle calibration: spawn a rigged soldier holding any kind at world origin
  weaponTest: (weapon, asset = 'a_soldier_heavy') => {
    __clearTest();
    const m = buildWeaponTestModel(weapon, asset, 1.8);
    if (!m) return { fallback: true, note: 'GLB not loaded → would use procedural makeWeapon' };
    m.group.userData.__wt = true;
    engine.scene.add(m.group);
    window.__wt = m; // ref for posing (m.anim.mixer.update) + inspection
    return { ok: true, weapon, asset };
  },
  // enemy/boss model preview: build a buildEnemyModel branch + play a clip
  enemyTest: (modelKey, clip = 'idle') => {
    __clearTest();
    const m = buildEnemyModel(modelKey);
    if (!m) return { fallback: true };
    m.group.userData.__wt = true;
    engine.scene.add(m.group);
    window.__wt = m;
    if (m.anim?.play) m.anim.play(clip);
    return { ok: true, modelKey, animType: m.animType, headH: m.headH, glb: m.animType === 'gltf' };
  },
  // garrison soldier preview: useful for cavalry, muster units, and barracks fusions
  soldierTest: (modelKey = 'lancer', clip = 'walk') => {
    __clearTest();
    const m = buildSoldierModel(modelKey);
    if (!m) return { fallback: true };
    m.group.userData.__wt = true;
    engine.scene.add(m.group);
    window.__wt = m;
    if (m.anim?.play) m.anim.play(clip);
    return { ok: true, modelKey, mounted: !!m.mounted, animType: m.animType, glb: m.animType === 'gltf', children: m.group.children.length };
  },
  // hero figure preview: build a hero commander model with its signature weapon
  heroTest: (id, weapon) => {
    __clearTest();
    const m = heroModel({ id, weapon });
    if (!m) return { fallback: true, note: 'Hero GLB not loaded' };
    m.group.userData.__wt = true;
    engine.scene.add(m.group);
    window.__wt = m;
    return { ok: true, id, hasAnim: !!m.anim, clips: m.anim?.actions ? Object.keys(m.anim.actions) : null };
  },
};

const __qaUrlPresets = {
  'palace-contact-terrain': {
    state: 'zabulistanForecourt',
    opts: { selectPalace: true, ltr: true, forward: 31, side: -1.6, dist: 42, pitch: 0.54, yawOffset: -0.04 },
  },
  'palace-contact-terrain-rtl': {
    state: 'zabulistanForecourt',
    opts: { selectPalace: true, rtl: true, forward: 32, side: -1.2, dist: 46, pitch: 0.56, yawOffset: -0.04 },
  },
  'build-pad-affordance': {
    state: 'zabulistanBuildPads',
    opts: { ltr: true, towerId: 'zabul-watch', forward: 21, side: 4, dist: 72, pitch: 0.62, yawOffset: 0.02 },
  },
  'build-pad-affordance-rtl': {
    state: 'zabulistanBuildPads',
    opts: { rtl: true, towerId: 'zabul-watch', forward: 24, side: 20, dist: 128, pitch: 0.68, yawOffset: 0.06 },
  },
  'opening-build': {
    state: 'zabulistanOpeningBuild',
    opts: { ltr: true, towerId: 'zabul-watch', forward: 22, side: 4, dist: 76, pitch: 0.62, yawOffset: 0.02 },
  },
  'opening-build-rtl': {
    state: 'zabulistanOpeningBuild',
    opts: { rtl: true, towerId: 'zabul-watch', forward: 24, side: 20, dist: 128, pitch: 0.68, yawOffset: 0.06 },
  },
  'active-road-pressure': {
    state: 'zabulistanActiveBuildPressure',
    opts: { ltr: true, towerId: 'zabul-watch', mode: 'probe', forward: 22, side: 4, dist: 76, pitch: 0.62, yawOffset: 0.02 },
  },
  'active-road-pressure-rtl': {
    state: 'zabulistanActiveBuildPressure',
    opts: { rtl: true, towerId: 'zabul-watch', mode: 'probe', forward: 24, side: 20, dist: 128, pitch: 0.68, yawOffset: 0.06 },
  },
  'active-placement': {
    state: 'zabulistanActiveBuildPressure',
    opts: { ltr: true, towerId: 'zabul-watch', mode: 'probe', forward: 22, side: 4, dist: 76, pitch: 0.62, yawOffset: 0.02 },
  },
  'active-placement-rtl': {
    state: 'zabulistanActiveBuildPressure',
    opts: { rtl: true, towerId: 'zabul-watch', mode: 'probe', forward: 24, side: 20, dist: 128, pitch: 0.68, yawOffset: 0.06 },
  },
  'real-wave-contact': {
    state: 'zabulistanRealWaveContact',
    opts: { ltr: true, towerId: 'zabul-watch', towers: 4, settleFrames: 58, forward: 23, side: 2, dist: 70, pitch: 0.61, yawOffset: 0.02 },
  },
  'real-wave-contact-rtl': {
    state: 'zabulistanRealWaveContact',
    opts: { rtl: true, towerId: 'zabul-watch', towers: 4, settleFrames: 58, forward: 25, side: 16, dist: 112, pitch: 0.67, yawOffset: 0.05 },
  },
  'contact-confirm': {
    state: 'zabulistanRealWaveContact',
    opts: { ltr: true, towerId: 'zabul-watch', towers: 4, settleFrames: 58, forceContactConfirm: true, forward: 23, side: 2, dist: 70, pitch: 0.61, yawOffset: 0.02 },
  },
  'contact-confirm-rtl': {
    state: 'zabulistanRealWaveContact',
    opts: { rtl: true, towerId: 'zabul-watch', towers: 4, settleFrames: 58, forceContactConfirm: true, forward: 25, side: 16, dist: 112, pitch: 0.67, yawOffset: 0.05 },
  },
  'selected-target-thread': {
    state: 'zabulistanRealWaveContact',
    opts: { ltr: true, selectTower: true, towerId: 'zabul-watch', towers: 4, settleFrames: 58, forward: 23, side: 2, dist: 70, pitch: 0.61, yawOffset: 0.02 },
  },
  'selected-target-thread-rtl': {
    state: 'zabulistanRealWaveContact',
    opts: { rtl: true, selectTower: true, towerId: 'zabul-watch', towers: 4, settleFrames: 58, forward: 25, side: 16, dist: 112, pitch: 0.67, yawOffset: 0.05 },
  },
  'palace-command-feedback': {
    state: 'zabulistanPalaceCommandFeedback',
    opts: { ltr: true, reducedMotion: false, command: 'gate', mode: 'royal', forward: 25, side: 2, dist: 64, pitch: 0.62, yawOffset: 0.02 },
  },
  'palace-command-feedback-rtl': {
    state: 'zabulistanPalaceCommandFeedback',
    opts: { rtl: true, reducedMotion: false, command: 'gate', mode: 'royal', forward: 27, side: 14, dist: 104, pitch: 0.67, yawOffset: 0.05 },
  },
  'palace-command-feedback-reduced': {
    state: 'zabulistanPalaceCommandFeedback',
    opts: { ltr: true, reducedMotion: true, command: 'gate', mode: 'royal', forward: 25, side: 2, dist: 64, pitch: 0.62, yawOffset: 0.02 },
  },
  'gate-hold-state': {
    state: 'zabulistanGateHoldState',
    opts: { ltr: true, reducedMotion: false, mode: 'breach', forward: 25, side: 2, dist: 62, pitch: 0.62, yawOffset: 0.02 },
  },
  'gate-hold-state-rtl': {
    state: 'zabulistanGateHoldState',
    opts: { rtl: true, reducedMotion: false, mode: 'breach', forward: 28, side: 14, dist: 100, pitch: 0.67, yawOffset: 0.05 },
  },
  'gate-hold-state-reduced': {
    state: 'zabulistanGateHoldState',
    opts: { ltr: true, reducedMotion: true, mode: 'breach', forward: 25, side: 2, dist: 62, pitch: 0.62, yawOffset: 0.02 },
  },
};

function __recordQaUrlResult(qa, result) {
  const names = [
    'zabulistan-palace-contact-terrain',
    'zabulistan-palace-contact-terrain-fallback',
    'zabulistan-palace-contact-soft-blend',
    'zabulistan-palace-facade-dressing',
    'zabulistan-palace-facade-fallback',
    'zabulistan-palace-foreground-terrace-wall-main',
    'zabulistan-gate-threshold-transition',
    'build-pad-affordance',
    'build-pad-affordance-pad',
    'zabulistan-road-pressure-cues',
    'zabulistan-road-pressure-cue',
    'zabulistan-road-pressure-ring',
    'zabulistan-road-pressure-dash',
    'zabulistan-contact-feedback-cues',
    'zabulistan-contact-feedback-cue',
    'zabulistan-contact-ground-ring',
    'zabulistan-contact-health-back',
    'zabulistan-contact-health-fill',
    'zabulistan-contact-impact-slash',
    'zabulistan-contact-confirm',
    'zabulistan-selected-target-thread',
    'zabulistan-selected-target-line',
    'zabulistan-selected-target-reticle',
    'zabulistan-palace-command-feedback-cues',
    'zabulistan-palace-command-cue',
    'zabulistan-palace-command-ring',
    'zabulistan-palace-command-standard',
    'zabulistan-palace-command-direction',
    'zabulistan-palace-command-anchor',
    'zabulistan-palace-command-thread',
    'zabulistan-gate-hold-cue',
    'zabulistan-gate-hold-threshold',
    'zabulistan-gate-hold-ring',
    'zabulistan-gate-hold-brace',
    'zabulistan-gate-hold-pressure-tick',
  ];
  const sceneObjects = Object.fromEntries(names.map((name) => [name, 0]));
  engine.scene.traverse((node) => {
    if (Object.prototype.hasOwnProperty.call(sceneObjects, node.name)) sceneObjects[node.name]++;
  });
  const report = {
    qa,
    result,
    sceneObjects,
    metrics: window.__dbg.visualQa.metrics(),
    overflow: window.__dbg.visualQa.overflow(),
    dir: document.documentElement.dir || 'ltr',
  };
  let node = document.getElementById('qa-state-json');
  if (!node) {
    node = document.createElement('script');
    node.id = 'qa-state-json';
    node.type = 'application/json';
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(report);
  if (result?.state && result.state !== 'victory' && result.state !== 'defeat') {
    inspectPaused = false;
    setPaused(true);
    document.body.classList.add('qa-state-recorded');
  }
}

function __runQaUrlPreset() {
  const qa = new URLSearchParams(window.location.search).get('qa');
  const preset = __qaUrlPresets[qa];
  if (!preset) return;
  const run = () => window.__dbg.visualQa.state(preset.state, preset.opts);
  const recordWhenReady = (deadline) => {
    const result = run();
    const zabulistanBackdrop = backdropSceneReport(engine.scene).find((entry) => entry.placeId === 'zabulistan');
    const backdropReady = (zabulistanBackdrop?.loaded || 0) >= 5;
    const needsPalaceSwap = result?.game === 'zabulistan'
      && hasPalace(game?.mapDef?.id)
      && !game?.map?.citadel?.isCustomPalace;
    if ((backdropReady && !needsPalaceSwap) || performance.now() >= deadline) {
      __recordQaUrlResult(qa, backdropReady && !needsPalaceSwap ? run() : result);
      return;
    }
    setTimeout(() => recordWhenReady(deadline), 500);
  };
  run();
  setTimeout(run, 900);
  setTimeout(run, 1800);
  setTimeout(() => recordWhenReady(performance.now() + 12000), 3200);
}

setTimeout(__runQaUrlPreset, 0);

// first user gesture unlocks audio (browser policy)
window.addEventListener('pointerdown', function unlockOnce() {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockOnce);
}, { once: true });
