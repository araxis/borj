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
engine.scene.add(padRing, rangeRing);

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
  // nearest hit wins between towers and enemy pick-proxies
  const towerGroups = game.towers.filter((t) => t.alive).map((t) => t.group);
  const towerHits = pick(x, y, towerGroups);
  const proxies = game.enemies.filter((e) => e.alive).map((e) => e.pickProxy);
  const enemyHits = pick(x, y, proxies);
  const tDist = towerHits.length ? towerHits[0].distance : Infinity;
  const eDist = enemyHits.length ? enemyHits[0].distance : Infinity;
  if (eDist < tDist) {
    const en = enemyHits[0].object.userData.enemy;
    if (en?.alive) return { kind: 'enemy', entity: en };
  }
  if (towerHits.length) {
    const tw = game.towers.find((t) => isDescendant(t.group, towerHits[0].object));
    if (tw) return { kind: 'tower', entity: tw };
  }
  return null;
}

function pickGround(x, y) {
  if (!game) return null;
  const hits = pick(x, y, [game.map.terrain]);
  return hits.length ? hits[0].point : null;
}

function showRangeFor(def, pos, heroOrTower) {
  const range = heroOrTower?.getStats ? heroOrTower.getStats().range : def?.range;
  if (!range) { rangeRing.visible = false; return; }
  rangeRing.scale.setScalar(range);
  rangeRing.position.set(pos.x, pos.y + 0.25, pos.z);
  rangeRing.visible = true;
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
    } else { padRing.visible = false; if (!hud.selectedEntity) rangeRing.visible = false; }
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
        if (!e.shiftKey) { hud.setMode({ kind: 'none' }); padRing.visible = false; rangeRing.visible = false; }
        return;
      }
      return;
    }
    // clicked elsewhere: exit build mode
    hud.setMode({ kind: 'none' });
    padRing.visible = false; rangeRing.visible = false;
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
    showRangeFor(null, picked.entity.pos, picked.entity);
    rts.followEntity(null);
  } else if (picked?.kind === 'enemy') {
    // tactical inspection: pause the battle, focus the enemy, open its story card
    if (!paused) { inspectPaused = true; setPaused(true); }
    hud.showEnemy(picked.entity);
    rts.followEntity(picked.entity);
  } else {
    clearInspectPause();
    hud.closePanel();
    rangeRing.visible = false;
    rts.follow = null;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space' && game) { e.preventDefault(); togglePause(); }
  if (e.code === 'Escape' && hud) { hud.setMode({ kind: 'none' }); hud.closePanel(); padRing.visible = false; rangeRing.visible = false; }
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
    onSelectionCleared: () => { rangeRing.visible = false; clearInspectPause(); },
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
  rangeRing.visible = false;
  engine.speed = 1;
  paused = false;
}

onLangChange(() => { /* HUD and menus re-render via their own subscriptions */ });

// boot
preloadAssets(); // GLTF characters/animals load in the background; procedural fallback until ready
loadAllProps(); // static building kit (curtain walls, village, docks…) warm before first map build
import('./models/materials.js').then((m) => m.enhanceMaterials());
$('#loading').classList.add('hidden');
menus.showMain();

// debug/QA handle (harmless in production; used by automated browser tests)
window.__dbg = { engine, get game() { return game; }, get hud() { return hud; }, startMap: startBattle };

// first user gesture unlocks audio (browser policy)
window.addEventListener('pointerdown', function unlockOnce() {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockOnce);
}, { once: true });
