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
const padRing = new THREE.Mesh(
  new THREE.RingGeometry(1.9, 2.3, 24),
  new THREE.MeshBasicMaterial({ color: 0xf4cd6e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
);
padRing.rotation.x = -Math.PI / 2;
padRing.visible = false;
const rangeRing = new THREE.Mesh(
  new THREE.RingGeometry(0.97, 1.0, 64),
  new THREE.MeshBasicMaterial({ color: 0x2fa7a0, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
);
rangeRing.rotation.x = -Math.PI / 2;
rangeRing.visible = false;

// tight pulsing ring hugging the selected tower's footprint — disambiguates which tower is selected in a cluster
const selRing = new THREE.Mesh(
  new THREE.RingGeometry(0.84, 1.0, 40),
  new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
);
selRing.rotation.x = -Math.PI / 2;
selRing.visible = false;

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

function pick(clientX, clientY, targets) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, engine.camera);
  return raycaster.intersectObjects(targets, true);
}

function pickPad(x, y) {
  if (!game) return null;
  const hits = pick(x, y, game.map.pads.map((p) => p.mesh).filter(Boolean));
  if (!hits.length) return null;
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
  if (m === Infinity) return null;
  if (eDist === m) {
    const en = enemyHits[0].object.userData.enemy;
    if (en?.alive) return { kind: 'enemy', entity: en };
  }
  if (tDist === m) {
    const tw = game.towers.find((t) => isDescendant(t.group, towerHits[0].object));
    if (tw) return { kind: 'tower', entity: tw };
  }
  if (pDist === m && palaceHits.length) return { kind: 'palace', entity: cit };
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
    // clicked elsewhere: exit build mode
    hud.setMode({ kind: 'none' });
    padRing.visible = false; hideSelection();
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
    hud.setMode({ kind: 'none' });
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
  // G = toggle sandbox/test mode (unlimited gold, no life loss, all heroes)
  if (e.code === 'KeyG' && game && hud) {
    const on = game.toggleSandbox();
    hud.renderCards();
    hud.toast(on ? '🛠 Sandbox ON — unlimited gold, no life loss, all heroes' : 'Sandbox OFF');
  }
});

let currentSpeed = 1;
let inspectPaused = false; // auto-paused because the player is inspecting an enemy

function setPaused(v) {
  paused = v;
  engine.speed = paused ? 0 : currentSpeed;
  $('#pauseBtn') && ($('#pauseBtn').textContent = paused ? '▶' : '⏸');
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
  onStartMap: startBattle,
  onCodex: () => codex.show(),
  onSettings: () => settingsUI.show(),
});

function startBattle(mapDef, endless, sandbox = false) {
  cleanupBattle();
  // #sandbox in the URL starts any map in test mode (also toggle in-battle with G)
  if (location.hash.toLowerCase().includes('sandbox')) sandbox = true;
  game = new Game(engine, mapDef, { endless, sandbox });
  hud = new HUD(game, {
    onExit: () => { cleanupBattle(); menus.showMain(); },
    onTogglePause: togglePause,
    onSpeed: (s, btn) => {
      currentSpeed = s;
      if (!paused) engine.speed = s;
      for (const b of document.querySelectorAll('#speedBtns .iconbtn')) b.classList.toggle('active', b === btn);
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
      onRetry: () => { startBattle(mapDef, endless); },
      onExit: () => { cleanupBattle(); menus.showCampaign(false); },
    }), 1600);
  });

  gameUpdateOff = engine.onUpdate((dt) => { if (game) game.update(dt, engine.elapsed); });
  audio.unlock();
  audio.setScene('battle');
  audio.setIntensity(0.12);

  // cinematic fly-in: sweep from the enemy gate to the citadel
  const s0 = game.map.paths[0].samples[0].pos;
  rts.flyIn(new THREE.Vector3(s0.x, s0.y, s0.z), 4.2);

  if (game.sandbox) hud.toast('🛠 Sandbox ON — unlimited gold, no life loss, all heroes (press G to toggle)');
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

// boot
preloadAssets(); // GLTF characters/animals load in the background; procedural fallback until ready
loadAllProps(); // static building kit (curtain walls, village, docks…) warm before first map build
import('./models/materials.js').then((m) => m.enhanceMaterials());
menus.showMain(); // ready behind the splash
// the hero backdrop is painted at parse-time via the inline <style> in index.html + the
// preload link, so it appears with the splash instead of after the JS bundle loads.
// hold the splash for the intro animation, then fade to the menu (skip on reduced-motion)
const _splashHold = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 400 : 2400;
setTimeout(() => $('#loading').classList.add('hidden'), _splashHold);

// debug/QA handle (harmless in production; used by automated browser tests)
import { buildWeaponTestModel, buildEnemyModel, heroModel } from './models/creature.js';
const __clearTest = () => {
  for (let i = engine.scene.children.length - 1; i >= 0; i--)
    if (engine.scene.children[i].userData.__wt) engine.scene.children[i].removeFromParent();
};
window.__dbg = {
  engine, rts, get game() { return game; }, get hud() { return hud; }, startMap: startBattle,
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
