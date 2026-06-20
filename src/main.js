// Application entry — boots the engine, menus, and battle lifecycle, and owns
// pointer interaction (build/assign/rally/fuse modes, selection raycasts).
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { RTSCamera } from './core/camera.js';
import { initLangDOM, onLangChange, t } from './core/i18n.js';
import { settings } from './core/settings.js';
import { audio } from './core/audio.js';
import { Game } from './game/game.js';
import { preloadAssets } from './core/assets.js';
import { loadAllProps } from './core/props3d.js';
import { auditVisualArtifacts, sanitizeVisualArtifacts } from './core/visualguards.js';
import { backdropManifestReport, backdropSceneReport } from './world/backdrop.js';
import { applyBattleSnapshot, saveBattle, clearBattle } from './core/battlesave.js';
import { MAPS, MAPS_BY_ID } from './data/campaign.js';
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

engine.scene.add(padRing, rangeRing, selRing, auraLines);
// gentle opacity pulse on the active selection ring
engine.onUpdate(() => { if (selRing.visible) selRing.material.opacity = 0.65 + Math.sin(engine.elapsed * 5) * 0.2; });

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
  showRangeFor(null, tower.pos, tower);
  selRing.scale.setScalar((tower.model?.radius || 1.1) * 1.35);
  selRing.position.set(tower.pos.x, tower.pos.y + 0.12, tower.pos.z);
  selRing.visible = true;
  const info = ringFor(tower.def, tower.getStats ? tower.getStats() : null);
  showAuraLinks(tower, info ? info.color : 0xffc23a);
}

function hideSelection() {
  rangeRing.visible = false;
  selRing.visible = false;
  auraLines.visible = false;
}

// selection visual for the central palace — a wide gold footprint ring, no range/aura links
function showSelectionPalace(cit) {
  rangeRing.visible = false;
  auraLines.visible = false;
  selRing.scale.setScalar((cit.footprint || 15) * 1.12);
  selRing.position.set(cit.group.position.x, cit.group.position.y + 0.15, cit.group.position.z);
  selRing.visible = true;
}

// pointer interactions
let downPos = null;
canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) downPos = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => {
  if (!game || !hud) return;
  if (hud.mode.kind === 'build') {
    const pad = pickPad(e.clientX, e.clientY);
    if (pad && !pad.tower && (pad.rubbleT || 0) <= 0) {
      padRing.position.set(pad.pos.x, pad.pos.y + 0.35, pad.pos.z);
      padRing.visible = true;
      showRangeFor(hud.mode.def, pad.pos);
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
  if (e.code === 'Escape' && hud) { hud.setMode({ kind: 'none' }); hud.closePanel(); padRing.visible = false; hideSelection(); }
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
    setTimeout(() => menus.showEnd({
      victory: true, unlockedHeroes, mapDef,
      endless: false, wave: game.waveIdx,
      onContinueEndless: () => { game.endlessMode = true; game.phase = 'build'; menus.hideAll(); },
      onExit: () => { cleanupBattle(); menus.showCampaign(false); },
    }), 1400);
  });
  game.on('defeat', () => {
    setTimeout(() => menus.showEnd({
      victory: false, mapDef, endless: game.endlessMode, wave: game.waveIdx,
      onRetry: () => { clearBattle(); startBattle(mapDef, endless); },
      onExit: () => { cleanupBattle(); menus.showCampaign(false); },
    }), 1600);
  });

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
  hideSelection();
  engine.speed = 1;
  paused = false;
}

onLangChange(() => { /* HUD and menus re-render via their own subscriptions */ });

// last-chance autosave when the tab is hidden or the window closes mid-battle (covers reload/close)
window.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.sandbox) saveBattle(game); });
window.addEventListener('beforeunload', () => { if (game && !game.sandbox) saveBattle(game); });

// boot
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
  if (game && sandbox) game._qaSuppressBattleStartBanner = true;
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
window.__dbg = {
  engine, rts, get game() { return game; }, get hud() { return hud; }, startMap: startBattle,
  fxPreview: (options) => game?.previewCommandFx(options),
  palaceAssault: (options) => game?.sandboxPalaceAssault(options),
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
      const mapByState = state.includes('fog') ? 'mazandaran'
        : state.includes('twin') ? 'arash-watch'
        : state.includes('final') ? 'gang-dez'
        : state.toLowerCase().includes('backdrop') ? (opts.mapId || 'zabulistan')
        : opts.mapId;
      const g = __ensureQaBattle(mapByState, true);
      if (!g) return { ok: false };
      if (state === 'mobileRtl' || opts.rtl) document.body.classList.add('rtl');
      if (opts.ltr) document.body.classList.remove('rtl');
      if (state === 'backdrop' || state === 'backdropSweep') {
        __qaBackdropView(opts);
        return { ok: true, state, game: g.mapDef.id, backdrops: backdropSceneReport(engine.scene), metrics: window.__dbg.visualQa.metrics() };
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

// first user gesture unlocks audio (browser policy)
window.addEventListener('pointerdown', function unlockOnce() {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockOnce);
}, { once: true });
