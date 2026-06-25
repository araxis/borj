// Game orchestrator — one battle on one map: economy, waves, entities, auras,
// win/lose, endless scaling. Emits events the UI listens to.
import * as THREE from 'three';
import { GameMap } from '../world/map.js';
import { pointAt } from '../world/road.js';
import { Enemy } from '../entities/enemy.js';
import { lashEffect } from '../entities/projectile.js';
import { Tower, heroBond } from '../entities/tower.js';
import { ParticleSystem, FXC } from '../fx/particles.js';
import { DebrisSystem } from '../physics/debris.js';
import { makeWave } from './waves.js';
import { ENEMIES_BY_ID } from '../data/enemies.js';
import { TOWERS_BY_ID } from '../data/towers.js';
import { HEROES, HERO_RANKS } from '../data/heroes.js';
import { findFusion } from '../data/fusions.js';
import { animateBanner } from '../models/towerkit.js';
import { animIdle } from '../models/humanoid.js';
import { CitadelGuard, buildLandCitadel } from '../world/citadels.js';
import { Ambient } from '../world/ambient.js';
import { Squad } from '../entities/soldier.js';
import { SOLDIERS_BY_ID } from '../data/soldiers.js';
import { palaceDef } from '../data/palaces.js';
import { bossChallengeDef } from '../data/bosschallenges.js';
import { hasPalace, loadPalace } from '../core/assets.js';
import { makeRng } from '../world/noise.js';
import { audio } from '../core/audio.js';
import { loadProfile, markMapCompleted, unlockHero, recordEndless, getHeroRank, setHeroRank, recordBossSaga } from '../core/save.js';
import { saveBattle, clearBattle } from '../core/battlesave.js';
import { updateFire } from '../fx/fire.js';
import { OathField } from '../fx/oathfield.js';
import { BossOmenField } from '../fx/bossomens.js';
import { PalaceBoonField } from '../fx/palaceboons.js';
import { HeroCommandField } from '../fx/herocommands.js';
import { PalaceGateStage } from '../fx/palacestage.js';

const _firePos = new THREE.Vector3(); // scratch for ember emission from flame world positions
import { diffMods } from '../core/difficulty.js';

const HERO_ACTIVE_HEAL = new Set(['featherCall', 'simurghAegis', 'secretProvision', 'simurghBirthright', 'steadfastPrayer', 'royalContinuity', 'courtGrace']);
const HERO_ACTIVE_FIRE = new Set(['sadehFlame', 'fireJudgment']);
const HERO_ACTIVE_VISION = new Set(['worldCup', 'longSearch', 'borderArrow', 'twinArrow', 'keepsakeToken', 'heirsVolley']);
const HERO_ACTIVE_BIND = new Set(['oxheadJudgment', 'divBind', 'dragonbane', 'boarHunt', 'gateWard', 'pahlavanChallenge', 'maceShockwave', 'ancestralBlow', 'brazenBody', 'counterCharge']);
const FARR_MAX = 100;
const OATH_DUR = 14;
const FX_PREVIEW_COMMANDS = [
  { heroId: 'arash', heroKind: 'vision', heroKey: 'borderArrow', palaceType: 'rangeVision' },
  { heroId: 'siyavash', heroKind: 'fire', heroKey: 'fireJudgment', palaceType: 'burnRing' },
  { heroId: 'fereydun', heroKind: 'bind', heroKey: 'oxheadJudgment', palaceType: 'bindChains' },
  { heroId: 'zal', heroKind: 'heal', heroKey: 'featherCall', palaceType: 'heal' },
  { heroId: 'kaveh', heroKind: 'rally', heroKey: 'derafshRally', palaceType: 'rallyDamage' },
];

function makeGateBannerTexture(label = 'Gate Line', sublabel = '') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(15, 10, 6, 0.72)';
  g.strokeStyle = 'rgba(255, 210, 106, 0.88)';
  g.lineWidth = 5;
  const x = 22, y = 22, w = 468, h = 116, r = 24;
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
  g.fill();
  g.stroke();
  const grad = g.createLinearGradient(0, 0, c.width, 0);
  grad.addColorStop(0, 'rgba(255, 210, 106, 0)');
  grad.addColorStop(0.5, 'rgba(255, 240, 189, 0.42)');
  grad.addColorStop(1, 'rgba(255, 210, 106, 0)');
  g.fillStyle = grad;
  g.fillRect(56, 42, 400, 4);
  g.fillRect(56, 116, 400, 3);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff0bd';
  g.font = '700 34px "Segoe UI", Arial, sans-serif';
  g.fillText(String(label).slice(0, 32), 256, sublabel ? 72 : 82, 404);
  if (sublabel) {
    g.fillStyle = '#d8a93e';
    g.font = '600 21px "Segoe UI", Arial, sans-serif';
    g.fillText(String(sublabel).slice(0, 42), 256, 106, 408);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Game {
  constructor(engine, mapDef, { endless = false, sandbox = false } = {}) {
    this.engine = engine;
    this.scene = engine.scene;
    this.audio = audio;
    this.mapDef = mapDef;
    this.endlessMode = endless;
    // sandbox/test mode: unlimited gold + no life loss + every hero unlocked,
    // so all upgrades, ages, fusions and hero bonds can be tried freely.
    this.sandbox = sandbox;
    this.map = new GameMap(mapDef, this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.oathField = new OathField(this.scene, this.map);
    this.bossOmen = new BossOmenField(this.scene, this.map);
    this.palaceBoonField = new PalaceBoonField(this.scene, this.map);
    this.heroCommandField = new HeroCommandField(this.scene, this.map);
    this.palaceStage = new PalaceGateStage(this.scene, this.map);
    this.debris = new DebrisSystem(this.scene, (x, z) => this.map.heightAt(x, z));
    this.ambient = new Ambient(this.scene, this.map, makeRng('amb:' + mapDef.id));
    this.citadelGuard = new CitadelGuard(this, this.map.citadel);
    // palaces lazy-load per map; if the GLB wasn't ready at map-build the procedural citadel showed —
    // load it and swap it in (rebinding the guard) when it arrives.
    if (hasPalace(mapDef.id) && !this.map.citadel.isCustomPalace) loadPalace(mapDef.id, () => this._swapToPalace());
    this.debris.onBounce = (pos) => this.particles.burst(pos, 3, { speed: 1, life: 0.4, size: 0.35, color: [0.5, 0.45, 0.38], grav: 3 });

    // difficulty: 'normal' is ×1 everywhere (tuned baseline); easy/hard scale gold, lives, enemy HP.
    const dm = diffMods();
    this.diffHpMult = dm.hp; // read by Enemy() to scale spawn HP
    this.gold = sandbox ? 999999 : Math.round((mapDef.startGold + (endless ? 200 : 0)) * dm.gold);
    this.lives = sandbox ? mapDef.lives : Math.max(1, Math.round(mapDef.lives * dm.lives));
    this.waveIdx = 0;
    this.waveActive = false;
    this.phase = 'build'; // build | combat | won | lost
    this.towers = [];
    this.palaceSquads = []; // squads summoned by the palace's Muster action
    this.palaceAssaultStatus = null;
    this.gateMarkers = [];
    this._gatePressureOmen = { t: 0, lastState: '' };
    this.palaceCommandPreview = null;
    this.enemies = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.waveT = 0;
    this.waveHpMult = 1;
    this.waveMod = null;
    this.bossChallenge = null;
    this.farrMax = FARR_MAX;
    this.farr = sandbox ? FARR_MAX : 0;
    this.oathT = 0;
    this._oathFxT = 0;
    this._palaceDanger = { pulseT: 0, fxT: 0, hornT: -99, markerT: -99, pressure: 0 };
    // auto-wave countdown: the next wave launches on its own; calling it early pays a
    // gold bonus scaled by the time you saved (classic TD early-call reward).
    this.prepTime = 16;        // seconds between waves
    this.prepTimeFirst = 25;   // longer grace to build before wave 1
    this.earlyGoldPerSec = 4 + (mapDef.order || 1);
    this.waveCountdown = this.prepTimeFirst;
    this._tickAcc = 0;
    this._saveAcc = 0; // periodic mid-wave autosave accumulator
    this._waveStartLives = this.lives;
    this.auraT = 0;
    this.siegeHornsActive = false;
    this._dreadSources = [];
    this._poisonSources = [];
    this._listeners = {};

    // hero roster: start-unlocked + campaign unlocks from profile (ALL in sandbox)
    const profile = loadProfile();
    this.heroRoster = sandbox ? [...HEROES] : HEROES.filter((h) =>
      h.unlock.type === 'start'
      || profile.unlockedHeroes.includes(h.id)
      || profile.completedMaps.includes(h.unlock.map));
    this.assignedHeroes = new Map(); // heroId -> tower

    // camera home
    const exit = this.map.exitPos;
    if (mapDef.id === 'zabulistan') {
      engine.rtsCamera?.setHome(exit.x * 0.42, exit.z * 0.42, 64, -Math.PI / 4, 0.78);
    } else {
      engine.rtsCamera?.setHome(exit.x * 0.4, exit.z * 0.4, 72);
    }
    engine.setMood(this.map.biome.mood);
    this._rebuildPalaceStage();
  }

  on(ev, fn) { (this._listeners[ev] ||= []).push(fn); }
  emit(ev, data) { for (const fn of this._listeners[ev] || []) fn(data); }

  enemyDefById(id) { return ENEMIES_BY_ID[id]; }

  // ---------- player actions ----------
  canAfford(cost) { return this.gold >= cost; }

  buildTower(towerDefId, pad) {
    const def = TOWERS_BY_ID[towerDefId];
    if (!def || pad.tower || (pad.rubbleT || 0) > 0) return null;
    if (!this.canAfford(def.cost)) { this.emit('toast', 'hud.notEnoughGold'); return null; }
    this.gold -= def.cost;
    const tower = new Tower(this, def, pad);
    pad.tower = tower;
    this.towers.push(tower);
    this.emit('goldChanged', this.gold);
    this.emit('towersChanged');
    this.audio.forgeHammer();
    this.particles.burst(pad.pos.clone().setY(pad.pos.y + 1), 16, { speed: 2, life: 0.7, size: 0.5, color: [0.7, 0.65, 0.5], grav: 3 });
    return tower;
  }

  // ---------- battle-snapshot restore (called by applyBattleSnapshot, not gameplay) ----------
  // rebuild one tower at its saved age/hp/hero without charging gold or playing forge FX.
  _restoreTower(def, pad, ts, HERODEFS) {
    this._restoring = true; // suppress build particles/audio during the bulk restore
    const tower = new Tower(this, def, pad);
    while (tower.ageIdx < (ts.ageIdx || 0) && tower.canUpgrade()) tower.upgrade();
    if (ts.heroId) { const h = HERODEFS.find((x) => x.id === ts.heroId); if (h) this.assignHero(h, tower); }
    tower.invested = ts.invested ?? tower.invested;
    tower.hp = Math.min(tower.maxHp, ts.hp ?? tower.maxHp);
    tower.heroActiveCd = ts.heroActiveCd || 0;
    tower.palaceDamageT = ts.palaceDamageT || 0;
    tower.palaceDamageBonus = ts.palaceDamageBonus || 0;
    tower.palaceRangeT = ts.palaceRangeT || 0;
    tower.palaceRangeBonus = ts.palaceRangeBonus || 0;
    this._restoring = false;
    return tower;
  }

  // respawn one live enemy at its saved path distance / hp / status effects.
  _restoreEnemy(def, es) {
    const e = new Enemy(this, def, es.pathIndex || 0, this.waveHpMult, es.isLarva, { forceBoss: !!es.boss });
    e.dist = es.dist || 0;
    e.hp = Math.min(e.maxHp, es.hp ?? e.maxHp);
    e.slows = (es.slows || []).map((s) => ({ ...s }));
    e.burns = (es.burns || []).map((b) => ({ ...b }));
    e.stunT = es.stunT || 0; e.bindT = es.bindT || 0; e.markT = es.markT || 0; e.markBonus = es.markBonus || 0;
    e.fogBrokenT = es.fogBrokenT || 0;
    e.siegeSilencedT = es.siegeSilencedT || 0;
    e.broodSilencedT = es.broodSilencedT || 0;
    e.counselBrokenT = es.counselBrokenT || 0;
    e.feudBrokenT = es.feudBrokenT || 0;
    e.guardBrokenT = es.guardBrokenT || 0;
    this.enemies.push(e);
    return e;
  }

  _restoreBossChallenge(saved) {
    if (!saved?.defId) return;
    const enemy = this.enemies.find((e) => e.alive && e.def.id === saved.defId && e.boss);
    if (!enemy) return;
    const cfg = bossChallengeDef(saved.defId);
    this.bossChallenge = {
      ...cfg,
      defId: saved.defId,
      enemyId: enemy.id,
      dur: saved.dur ?? cfg.dur,
      t: Math.max(0, saved.t ?? cfg.dur),
      startHp: saved.startHp ?? enemy.hp,
      targetHp: Math.max(1, saved.targetHp ?? enemy.hp * (1 - cfg.hpFrac)),
      hpFrac: saved.hpFrac ?? cfg.hpFrac,
      rewardFarr: saved.rewardFarr ?? cfg.rewardFarr,
      rewardGold: saved.rewardGold ?? cfg.rewardGold,
      failSpeed: saved.failSpeed ?? cfg.failSpeed,
      failDamage: saved.failDamage ?? cfg.failDamage,
      failType: saved.failType ?? cfg.failType,
      successType: saved.successType ?? cfg.successType,
      emitT: 0,
    };
    this.bossOmen.start(enemy, this.bossChallenge);
  }

  upgradeTower(tower) {
    const cost = tower.upgradeCost();
    if (!tower.canUpgrade() || !this.canAfford(cost)) { this.emit('toast', 'hud.notEnoughGold'); return false; }
    this.gold -= cost;
    tower.upgrade();
    this.emit('goldChanged', this.gold);
    this.emit('towersChanged');
    return true;
  }

  sellTower(tower) {
    this.gold += tower.sellRefund();
    tower.pad.tower = null;
    tower.alive = false;
    tower.destroy();
    this.towers = this.towers.filter((t) => t !== tower);
    if (tower.hero) this.assignedHeroes.delete(tower.hero.id);
    this.emit('goldChanged', this.gold);
    this.emit('towersChanged');
  }

  assignHero(heroDef, tower) {
    // recall from previous tower if assigned
    const prev = this.assignedHeroes.get(heroDef.id);
    if (prev && prev !== tower) prev.unassignHero();
    if (tower.hero && tower.hero !== heroDef) this.assignedHeroes.delete(tower.hero.id);
    tower.assignHero(heroDef);
    this.assignedHeroes.set(heroDef.id, tower);
    this.emit('towersChanged');
  }

  unassignHero(tower) {
    if (tower.hero) this.assignedHeroes.delete(tower.hero.id);
    tower.unassignHero();
    this.emit('towersChanged');
  }

  addFarr(amount, reason = '') {
    if (!amount || this.phase === 'lost' || this.phase === 'won') return;
    const prev = this.farr || 0;
    this.farr = Math.max(0, Math.min(this.farrMax, Math.round(prev + amount)));
    if (this.farr === prev) return;
    const ready = prev < this.farrMax && this.farr >= this.farrMax;
    this.emit('farrChanged', { farr: this.farr, max: this.farrMax, ready, reason });
    if (ready) this.emit('toast', 'oath.ready');
  }

  canUseOath() {
    return (this.farr || 0) >= this.farrMax && this.phase !== 'lost' && this.phase !== 'won';
  }

  triggerOath(cit = this.map.citadel) {
    if (!this.canUseOath()) { this.emit('toast', 'oath.need'); return false; }
    const placeId = cit?.placeId || this.mapDef.id;
    this.farr = 0;
    this.oathT = Math.max(this.oathT || 0, OATH_DUR);
    this._oathFxT = 0;
    this.emit('farrChanged', { farr: this.farr, max: this.farrMax, ready: false, reason: 'spent' });

    for (const tw of this.towers) {
      if (!tw.alive) continue;
      tw.palaceDamageT = Math.max(tw.palaceDamageT || 0, OATH_DUR);
      tw.palaceDamageBonus = Math.max(tw.palaceDamageBonus || 0, 0.28);
      tw.palaceRangeT = Math.max(tw.palaceRangeT || 0, OATH_DUR);
      tw.palaceRangeBonus = Math.max(tw.palaceRangeBonus || 0, 0.16);
      tw.attackCd = Math.min(tw.attackCd, 0.04);
      tw.hp = Math.min(tw.maxHp, tw.hp + tw.maxHp * 0.18);
    }
    for (const sq of this._allDefenderSquads()) {
      for (const m of sq.members) {
        if (!m.alive) continue;
        m.stunT = 0; m.fearT = 0;
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.28);
      }
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.applyMark(0.25, OATH_DUR);
      e.applySlow(0.72, Math.min(6, OATH_DUR * 0.45));
      e.takeDamage(e.boss ? 28 : 12, 'true');
    }

    this.audio.farrOath?.();
    this.engine.slowMo(0.34, 1.35);
    this.engine.bloomPulse(1.25);
    this.engine.addShake(0.95);
    this._cameraFocusBeat(cit?.group?.position || this.map.exitPos, { dur: 1.15, strength: 0.28, dist: 54, pitch: 0.84, yawOffset: -0.04 });
    this.oathField.trigger(cit, this.towers, this.map.paths);
    this._oathVisualPulse(cit, true);
    this.emit('oathTriggered', { placeId, dur: OATH_DUR });
    this.emit('towersChanged');
    saveBattle(this);
    return true;
  }

  _oathVisualPulse(cit = this.map.citadel, strong = false) {
    const keep = cit?.group?.position || this.map.exitPos;
    const high = keep.clone().setY(keep.y + (cit?.height || 18) * 0.65);
    this.particles.burst(high, strong ? 90 : 18, {
      speed: strong ? 5.5 : 2.4, up: strong ? 4.2 : 2.0, life: strong ? 1.7 : 0.9,
      size: strong ? 0.95 : 0.5, color: FXC.gold, grav: strong ? -0.9 : -0.4, spread: strong ? 7 : 3, drag: 0.4,
    });
    const towers = strong ? this.towers : this.towers.filter(() => Math.random() < 0.4);
    for (const tw of towers) {
      if (!tw.alive) continue;
      this.particles.burst(tw.pos.clone().setY(tw.pos.y + 3.6), strong ? 14 : 4, {
        speed: strong ? 2.8 : 1.2, up: 1.4, life: 0.8, size: 0.45, color: FXC.sacred, grav: -0.25, spread: 1.8,
      });
    }
    if (strong) {
      for (const path of this.map.paths || []) {
        const samples = path.samples || [];
        for (let i = 8; i < samples.length; i += 24) {
          const p = samples[i].pos.clone().setY(samples[i].pos.y + 0.7);
          this.particles.burst(p, 3, { speed: 1.1, up: 1.2, life: 1.0, size: 0.42, color: FXC.gold, grav: -0.4, spread: 2.2 });
        }
      }
    }
  }

  _cameraFocusBeat(anchor, opts = {}) {
    this.engine.rtsCamera?.focusBeat?.(anchor, opts);
  }

  _heroCommandBeat(kind, rank = 0, targetCount = 0) {
    const weight = Math.min(1.35, 0.72 + rank * 0.1 + Math.min(6, targetCount) * 0.035);
    const beat = {
      heal: { stop: 0.025, slow: 0.72, dur: 0.32, bloom: 0.62, shake: 0.03 },
      fire: { stop: 0.045, slow: 0.58, dur: 0.46, bloom: 0.86, shake: 0.18 },
      vision: { stop: 0.035, slow: 0.62, dur: 0.4, bloom: 0.74, shake: 0.08 },
      bind: { stop: 0.055, slow: 0.5, dur: 0.52, bloom: 0.78, shake: 0.26 },
      rally: { stop: 0.035, slow: 0.64, dur: 0.42, bloom: 0.72, shake: 0.12 },
    }[kind] || { stop: 0.035, slow: 0.65, dur: 0.38, bloom: 0.7, shake: 0.1 };
    this.engine.hitStop?.(beat.stop * weight);
    this.engine.slowMo?.(beat.slow, beat.dur * weight);
    this.engine.bloomPulse?.(beat.bloom + rank * 0.06);
    this.engine.addShake?.(beat.shake * weight);
  }

  gateClashBeat(anchor, enemy = null, power = 1) {
    const now = this._time || 0;
    const force = Math.max(0.25, Math.min(1.8, power));
    if (now - (this._lastGateClashShake || -99) > 0.22) {
      this._lastGateClashShake = now;
      this.engine.addShake?.((enemy?.boss ? 0.16 : 0.075) * force);
      this.engine.bloomPulse?.((enemy?.boss ? 0.34 : 0.18) * force);
    }
    if (anchor && now - (this._lastGateClashPulse || -99) > 0.34) {
      this._lastGateClashPulse = now;
      this._showGateClashPulse(anchor, enemy, force);
      this._showDefenderClashLine(anchor, enemy, force);
    }
    if (anchor && enemy?.group?.position && now - (this._lastGateShockLine || -99) > 0.22) {
      this._lastGateShockLine = now;
      this._showGateShockLine(anchor, enemy, force);
    }
    if (anchor && (enemy?.boss || now - (this._lastGateClashFocus || -99) > 3.8)) {
      this._lastGateClashFocus = now;
      this._cameraFocusBeat(anchor, {
        dur: enemy?.boss ? 0.92 : 0.62,
        strength: enemy?.boss ? 0.24 : 0.14,
        dist: enemy?.boss ? 48 : 58,
        pitch: 0.78,
        yawOffset: enemy?.boss ? 0.08 : -0.04,
      });
    }
  }

  defenderLineFlash(anchor, enemy = null, power = 1) {
    const now = this._time || 0;
    if (!anchor || now - (this._lastDefenderLineFlash || -99) < 0.18) return;
    this._lastDefenderLineFlash = now;
    this._showDefenderClashLine(anchor, enemy, power);
  }

  palaceThreatCue(anchor, enemies = []) {
    const now = this._time || 0;
    if (!anchor || now - (this._lastPalaceThreatCue || -99) < 0.48) return;
    const targets = enemies.filter((e) => e?.alive).slice(0, 3);
    if (!targets.length) return;
    this._lastPalaceThreatCue = now;
    targets.forEach((enemy, i) => {
      enemy.applyMark?.(0.06, 0.9);
      this._showPalaceThreatCue(anchor, enemy, i);
    });
  }

  _previewFxAnchors(count = 9) {
    const path = this.map.paths?.[0];
    const samples = path?.samples || [];
    if (samples.length) {
      const start = Math.max(4, Math.floor(samples.length * 0.12));
      const end = Math.max(start + 1, Math.floor(samples.length * 0.58));
      const step = Math.max(1, Math.floor((end - start) / count));
      return samples.slice(start, end).filter((_, i) => i % step === 0).slice(0, count).map((s) => {
        const p = s.pos.clone();
        p.y = this.map.heightAt(p.x, p.z) + 0.9;
        return p;
      });
    }

    const front = this._palaceFront(this.map.citadel || { group: { position: this.map.exitPos || new THREE.Vector3() }, footprint: 12 });
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 8 + (i % 3) * 4;
      const x = front.x + Math.cos(a) * r;
      const z = front.z + Math.sin(a) * r;
      out.push(new THREE.Vector3(x, this.map.heightAt(x, z) + 0.9, z));
    }
    return out;
  }

  _previewFxOrigin() {
    const liveTower = this.towers.find((t) => t.alive);
    if (liveTower) return liveTower.pos.clone();
    const pad = this.map.pads?.find((p) => !p.tower) || this.map.pads?.[0];
    if (pad?.pos) return pad.pos.clone();
    const anchor = this._previewFxAnchors(1)[0] || new THREE.Vector3();
    anchor.y = this.map.heightAt(anchor.x, anchor.z);
    return anchor;
  }

  previewCommandFx(options = {}) {
    if (!this.sandbox) return false;
    let {
      heroId = 'arash',
      heroKind = 'vision',
      heroKey = 'borderArrow',
      palaceType = 'rangeVision',
    } = options;
    if (!options.heroKind && !options.heroKey && !options.palaceType && !options.heroId) {
      const preview = FX_PREVIEW_COMMANDS[this._previewCommandIdx || 0];
      this._previewCommandIdx = ((this._previewCommandIdx || 0) + 1) % FX_PREVIEW_COMMANDS.length;
      ({ heroId, heroKind, heroKey, palaceType } = preview);
    }
    const origin = this._previewFxOrigin();
    const targetPositions = this._previewFxAnchors(10);
    const fakeTargets = targetPositions.map((position) => ({ alive: true, group: { position } }));
    const fakeTower = { alive: true, pos: origin, hero: { id: heroId, special: { key: heroKey } }, def: { name: 'Preview Command' } };
    const cit = this.map.citadel || { group: { position: this.map.exitPos || origin }, footprint: 14, height: 18, placeId: this.mapDef.id };
    const keep = cit.group?.position || origin;
    const front = this._palaceFront(cit);
    const range = 34;

    this.heroCommandField.trigger(fakeTower, { key: heroKey, kind: heroKind, rank: 2, range, targets: fakeTargets });
    this.palaceBoonField.trigger(cit, { type: palaceType, radius: range, dur: 6, amount: 0.2 }, {
      front,
      keep,
      radius: range,
      enemies: fakeTargets,
      towers: this.towers.filter((t) => t.alive),
    });
    this._heroCommandBeat(heroKind, 2, fakeTargets.length);
    this.particles.burst(origin.clone().setY(origin.y + 3.2), 26, {
      speed: 2.8, life: 0.8, size: 0.52, color: FXC.sacred, grav: -0.25, spread: 4.2,
    });
    this.audio.palaceCommand?.(palaceType);
    return { targets: fakeTargets.length, heroId, heroKind, heroKey, palaceType };
  }

  sandboxPalaceAssault(options = {}) {
    if (!this.sandbox) return false;
    const cit = this.map.citadel;
    let gateGuard = 0;
    if (!this.palaceSquads.some((sq) => sq.members.some((m) => m.alive))) {
      cit.musterCd = 0;
      this.palaceMuster(cit, { quiet: true });
      const sq = this.palaceSquads[this.palaceSquads.length - 1];
      gateGuard = sq?.members?.filter((m) => m.alive).length || 0;
    }
    const front = this._palaceFront(cit);
    let pathIndex = 0;
    let path = this.map.paths?.[0];
    let near = null;
    let bestD = Infinity;
    for (let pi = 0; pi < (this.map.paths?.length || 0); pi++) {
      for (const s of this.map.paths[pi].samples || []) {
        const d = Math.hypot(front.x - s.pos.x, front.z - s.pos.z);
        if (d < bestD) { bestD = d; pathIndex = pi; path = this.map.paths[pi]; near = s; }
      }
    }
    if (!path || !near) return false;
    const presets = [
      { mode: 'probe', ids: ['barman', 'barman', 'arzhang-div', 'garsivaz'], count: 7, hpMult: 0.46, gap: 1.75, back: 9, fullFx: false },
      { mode: 'breach', ids: ['barman', 'garsivaz', 'arzhang-div', 'tur', 'salm'], count: 11, hpMult: 0.58, gap: 1.52, back: 11, fullFx: true },
      { mode: 'royal', ids: ['tur', 'salm', 'garsivaz', 'arzhang-div', 'barman'], count: 14, hpMult: 0.72, gap: 1.32, back: 13, fullFx: true },
    ];
    const preset = options.mode
      ? (presets.find((p) => p.mode === options.mode) || presets[0])
      : presets[this._palaceAssaultIdx || 0];
    if (!options.mode) this._palaceAssaultIdx = ((this._palaceAssaultIdx || 0) + 1) % presets.length;
    const ids = options.ids || preset.ids;
    const count = Math.max(1, Math.min(18, options.count || preset.count));
    const gap = Math.max(0.8, Math.min(2.4, options.gap || preset.gap));
    const hpMult = Math.max(0.25, Math.min(1.3, options.hpMult ?? preset.hpMult));
    const baseDist = Math.max(2, Math.min(path.length - 4, near.dist - (options.back ?? preset.back)));
    const spawned = [];
    for (let i = 0; i < count; i++) {
      const defId = ids[i % ids.length];
      const def = ENEMIES_BY_ID[defId] || ENEMIES_BY_ID.barman;
      if (!def) continue;
      const bossish = preset.mode === 'royal' && i < 2;
      const e = new Enemy(this, def, pathIndex, hpMult * (bossish ? 1.28 : 1), false, { forceBoss: !!options.bosses && !!def.boss });
      const row = Math.floor(i / 5);
      const col = i % 5;
      e.dist = Math.max(0, Math.min(path.length - 2, baseDist - row * 5.0 - col * gap));
      e.laneOffset += (col - 2) * 0.72 + (row % 2 ? 0.32 : 0);
      const pt = pointAt(path, e.dist);
      e.group.position.set(pt.x, pt.y, pt.z);
      e.applySlow(e.boss ? 0.78 : 0.62, 1.35 + row * 0.18);
      if (preset.mode === 'royal' && i < 3) e.applyMark(0.08, 6);
      this.enemies.push(e);
      spawned.push(e);
    }
    this.phase = 'combat';
    this.waveActive = true;
    const dir = near?.tangent?.clone?.() || new THREE.Vector3(0, 0, -1);
    const pressure = preset.mode === 'royal' ? 1.0 : preset.mode === 'breach' ? 0.82 : 0.64;
    const holdDur = preset.mode === 'royal' ? 10.5 : preset.mode === 'breach' ? 8.6 : 6.8;
    const holdRadius = preset.mode === 'royal' ? 14.5 : preset.mode === 'breach' ? 12.5 : 10.0;
    const braceResult = this._bracePalaceDefenders(front, dir, pressure, holdDur, spawned[0]);
    this._showAssaultColumn(path, baseDist, count, dir, 5.8 + pressure * 1.2);
    this._showGateMarker(front, dir, holdRadius, 5.2 + pressure * 1.4);
    this._showPalaceShieldLine(front, dir, { width: 10.5 + pressure * 3.2, pressure: 0.9 + pressure * 0.16, dur: 5.0 + pressure * 1.7 });
    this._showGateBanner(front, dir, {
      label: options.label || (preset.mode === 'royal' ? 'Royal Gate Line' : 'Gate Line'),
      sublabel: options.subLabel || `${spawned.length} attackers`,
      pressure,
      dur: Math.min(holdDur, 5.0 + pressure * 1.6),
    });
    if (preset.mode === 'royal' || options.fullFx) {
      this._showRoyalGateImpact(front, dir, spawned, { pressure, dur: 2.35 + pressure * 0.7 });
    }
    const mountedDefenders = this.palaceSquads
      .flatMap((sq) => sq.members || [])
      .filter((m) => m?.alive && m.model?.mounted && m.group?.position && m.group.position.distanceTo(front) <= 42);
    this._showCavalryCloseCombatBeat(front, dir, mountedDefenders, spawned, {
      pressure,
      dur: Math.min(holdDur, 4.8 + pressure * 1.4),
    });
    this.palaceStage?.signalAlarm?.({ front, keep: cit.group.position, dir, pressure: 0.58 + pressure * 0.28, dur: 4.0 + pressure * 1.4 });
    const fxRadius = 30 + pressure * 8;
    if (options.fullFx ?? preset.fullFx) {
      this.palaceBoonField.trigger(cit, {
        type: preset.mode === 'royal' ? 'stunPulse' : 'rallyDamage',
        radius: fxRadius,
        visualRadius: preset.mode === 'royal' ? Math.min(9.5, fxRadius * 0.24) : Math.min(22, fxRadius * 0.58),
        visualIntensity: preset.mode === 'royal' ? 0.16 : 0.56,
        commandIntensity: preset.mode === 'royal' ? 0.18 : undefined,
        threadIntensity: preset.mode === 'royal' ? 0.14 : undefined,
        rayIntensity: preset.mode === 'royal' ? 0.055 : undefined,
        groundWaveIntensity: preset.mode === 'royal' ? 0 : 0.2,
        targetVisualLimit: preset.mode === 'royal' ? 2 : 6,
        anchorVisualLimit: preset.mode === 'royal' ? 1 : 6,
        dur: 2.8 + pressure,
      }, {
        front,
        keep: cit.group.position,
        radius: fxRadius,
        enemies: spawned,
        towers: this.towers.filter((t) => t.alive),
      });
    } else {
      this.particles.burst(front.clone().setY(front.y + 1.1), 14, {
        speed: 2.0, up: 1.0, life: 0.7, size: 0.42, color: FXC.gold, grav: 0.9, spread: 2.2, drag: 0.6,
      });
    }
    const timing = preset.mode === 'royal' ? 'peak' : preset.mode === 'breach' ? 'ready' : 'wait';
    const countercharge = timing === 'peak'
      ? this._peakGateCountercharge(cit, front, cit.group.position, {
        radius: fxRadius,
        power: pressure * 1.36,
        dur: 2.7,
      })
      : 0;
    if (this.audio.palaceAlarm) this.audio.palaceAlarm();
    else this.audio.hornCall?.();
    this.engine.bloomPulse?.(0.24);
    this.engine.addShake?.(0.22 + pressure * 0.12);
    if (preset.mode === 'royal') {
      this.engine.hitStop?.(0.035);
      this.engine.slowMo?.(0.58, 0.58);
      this.engine.bloomPulse?.(0.72);
      this.engine.addShake?.(0.22);
    }
    this._cameraFocusBeat(front, { dur: 1.05 + pressure * 0.22, strength: 0.24 + pressure * 0.08, dist: 52, pitch: 0.8, yawOffset: -0.08 });
    this.palaceAssaultStatus = {
      mode: preset.mode,
      count: spawned.length,
      pressure,
      timing,
      countercharge,
      t: holdDur,
      dur: holdDur,
    };
    if (options.commandFx !== false) {
      this.emit('palaceCommandFx', {
        kind: 'gate',
        palace: cit,
        type: 'gatePressure',
        count: spawned.length,
        targetCount: spawned.length,
        pressure,
        timing,
        mode: preset.mode,
        countercharge,
      });
    }
    return {
      count: spawned.length,
      ids: spawned.map((e) => e.def.id),
      mode: preset.mode,
      defenders: braceResult.defenders || 0,
      gateGuard,
      braced: braceResult.squads || 0,
      staggered: spawned.length,
      timing,
      peak: timing === 'peak',
      countercharge,
    };
  }

  sandboxBossSaga(options = {}) {
    if (!this.sandbox) return false;
    const requestedDefId = options.defId === 'tur-salm' ? 'tur' : options.defId;
    const defId = requestedDefId || this.mapDef.boss || 'houman';
    const def = ENEMIES_BY_ID[defId] || ENEMIES_BY_ID.houman;
    const pathIndex = Math.max(0, Math.min((this.map.paths?.length || 1) - 1, options.pathIndex ?? 0));
    const path = this.map.paths?.[pathIndex];
    if (!def || !path?.samples?.length) return false;
    this._clearBossChallenge();
    const e = new Enemy(this, def, pathIndex, options.hpMult ?? this.waveHpMult ?? 1, false, { forceBoss: true });
    const dist = Math.max(5, Math.min(path.length - 8, options.dist ?? path.length * 0.28));
    e.dist = dist;
    const pt = pointAt(path, dist);
    e.group.position.set(pt.x, pt.y, pt.z);
    this.enemies.push(e);
    this.phase = 'combat';
    this.waveActive = true;
    if (!options.skipArrival) {
      this.bossOmen.arrival?.(e);
      this.emit('bossSpawned', def);
    }
    this._startBossChallenge(e);
    this.audio.roar?.();
    this.audio.bossSwell?.();
    this.engine.slowMo?.(options.skipArrival ? 0.72 : 0.42, options.skipArrival ? 0.45 : 1.1);
    this.engine.bloomPulse?.(options.skipArrival ? 0.58 : 0.95);
    this.engine.addShake?.(options.skipArrival ? 0.28 : 0.8);
    this._cameraFocusBeat(e.group.position, { dur: 1.1, strength: 0.34, dist: 50, pitch: 0.76, yawOffset: 0.08 });
    const result = options.result || 'active';
    const settle = (fn) => { if (e.alive && this.bossChallenge?.enemyId === e.id) fn.call(this, e); };
    if (result === 'broken') {
      const delay = options.resultDelay ?? 900;
      if (delay <= 0) settle(this._completeBossChallenge);
      else setTimeout(() => settle(this._completeBossChallenge), delay);
    }
    if (result === 'hardened') {
      const delay = options.resultDelay ?? 900;
      if (delay <= 0) settle(this._failBossChallenge);
      else setTimeout(() => settle(this._failBossChallenge), delay);
    }
    return { ok: true, defId: def.id, enemyId: e.id, result };
  }

  _heroMuzzle(tower) {
    return tower?._muzzlePos?.() || tower.pos.clone().setY(tower.pos.y + (tower.model?.height || 3.2));
  }

  _heroLineTargets(tower, range, width = 4.5) {
    const alive = this.enemies.filter((e) => e.alive);
    if (!alive.length) return [];
    const origin = tower.pos;
    const focus = alive
      .slice()
      .sort((a, b) => (b.dist || 0) - (a.dist || 0) || b.hp - a.hp)[0];
    const dir = focus.group.position.clone().sub(origin).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1); else dir.normalize();
    return alive.filter((e) => {
      const off = e.group.position.clone().sub(origin).setY(0);
      const along = off.dot(dir);
      if (along < -3 || along > range) return false;
      const lateral = off.clone().addScaledVector(dir, -along).length();
      return lateral <= width || e === focus;
    });
  }

  _applyHeroTowerSurge(towers, dur, damageBonus, rangeBonus = 0) {
    for (const t of towers) {
      if (!t.alive) continue;
      t.palaceDamageT = Math.max(t.palaceDamageT || 0, dur);
      t.palaceDamageBonus = Math.max(t.palaceDamageBonus || 0, damageBonus);
      if (rangeBonus > 0) {
        t.palaceRangeT = Math.max(t.palaceRangeT || 0, dur);
        t.palaceRangeBonus = Math.max(t.palaceRangeBonus || 0, rangeBonus);
      }
      t.attackCd = Math.min(t.attackCd, 0.05);
    }
  }

  _applyHeroSoldierSurge(center, range, dur, mult = 1.22) {
    let count = 0;
    for (const sq of this._allDefenderSquads()) {
      const near = sq.members.filter((m) => m.alive && m.group.position.distanceTo(center) <= range);
      if (!near.length) continue;
      sq.gateLineT = Math.max(sq.gateLineT || 0, dur);
      sq.gateLineDur = Math.max(sq.gateLineDur || 0, dur);
      sq.gateLineAnchor = center.clone();
      sq.gateLineRadius = Math.max(sq.gateLineRadius || 0, Math.min(11, Math.max(7, range * 0.24)));
      sq.gateLineWidth = Math.max(sq.gateLineWidth || 0, Math.max(6, sq.gateLineRadius * 1.1));
      sq.gateLineMult = Math.max(sq.gateLineMult || 1, mult);
      for (const m of near) {
        m.stunT = 0;
        m.fearT = 0;
        m.sortieT = Math.max(m.sortieT || 0, m.model?.mounted ? 2.0 : 1.45);
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08);
        count++;
      }
    }
    return count;
  }

  _heroCommandPlan(tower) {
    if (!tower?.alive || !tower.hero) return null;
    const stats = tower.getStats();
    const key = tower.hero.special?.key || 'default';
    const rank = this.heroRank(tower.hero.id);
    const range = Math.max(12, (stats.range || tower.def.range || 10) * 1.15);
    const center = tower.pos;
    const enemies = this.enemies.filter((e) => e.alive && e.group.position.distanceTo(center) <= range);
    const allTargets = key === 'worldCup' || key === 'borderArrow' ? this.enemies.filter((e) => e.alive) : enemies;
    const ready = (tower.heroActiveCd || 0) <= 0.05;

    if (key === 'borderArrow') {
      const lineRange = Math.max(92, range * 4.2);
      return { key, kind: 'vision', rank, range: lineRange, targets: this._heroLineTargets(tower, lineRange, 5.0 + rank * 0.55), ready };
    }
    if (key === 'maceShockwave' || key === 'ancestralBlow' || key === 'youngLion') {
      const radius = range * (key === 'youngLion' ? 1.05 : 0.9);
      return { key, kind: 'bind', rank, range: radius, targets: this.enemies.filter((e) => e.alive && e.group.position.distanceTo(center) <= radius), ready };
    }
    if (key === 'gateWard') {
      const road = this.map._nearRoad(center.x, center.z, range) || { pos: center };
      const gate = new THREE.Vector3(road.pos.x, this.map.heightAt(road.pos.x, road.pos.z), road.pos.z);
      const radius = 8.5 + rank * 0.7;
      return { key, kind: 'bind', rank, range: radius * 1.65, targets: this.enemies.filter((e) => e.alive && e.group.position.distanceTo(gate) <= radius * 1.55), ready };
    }
    if (key === 'derafshRally' || key === 'warHorn' || key === 'wardenGallop' || key === 'mountedPursuit') {
      return { key, kind: 'rally', rank, range: range * 1.45, targets: this.towers.filter((t) => t.alive && t.pos.distanceTo(center) <= range * 1.42), ready };
    }
    if (key === 'worldCup' || key === 'longSearch' || key === 'keepsakeToken' || key === 'heirsVolley' || key === 'twinArrow') {
      const all = this.enemies.filter((e) => e.alive);
      const targets = (key === 'worldCup' || key === 'longSearch')
        ? all
        : all.slice().sort((a, b) => b.hp - a.hp || (b.dist || 0) - (a.dist || 0)).slice(0, 5 + rank * 2);
      return { key, kind: 'vision', rank, range: Math.max(range * 1.4, 34), targets, ready };
    }
    if (key === 'pahlavanChallenge') {
      return {
        key,
        kind: 'bind',
        rank,
        range: range * 1.3,
        targets: this.enemies
          .filter((e) => e.alive && e.group.position.distanceTo(center) <= range * 1.3)
          .sort((a, b) => b.hp - a.hp)
          .slice(0, 1 + Math.min(2, rank)),
        ready,
      };
    }
    if (HERO_ACTIVE_HEAL.has(key)) {
      return { key, kind: 'heal', rank, range: range * 1.25, targets: this.towers.filter((t) => t.alive && t.pos.distanceTo(center) <= range * 1.25), ready };
    }
    if (HERO_ACTIVE_FIRE.has(key)) {
      return { key, kind: 'fire', rank, range, targets: allTargets, ready };
    }
    if (HERO_ACTIVE_VISION.has(key)) {
      return { key, kind: 'vision', rank, range: range * 1.2, targets: allTargets, ready };
    }
    if (HERO_ACTIVE_BIND.has(key)) {
      const hit = allTargets.length ? allTargets : enemies;
      return { key, kind: 'bind', rank, range, targets: hit, ready };
    }
    return { key, kind: 'rally', rank, range: range * 1.35, targets: this.towers.filter((t) => t.alive && t.pos.distanceTo(center) <= range * 1.35), ready };
  }

  previewHeroCommand(tower) {
    const plan = this._heroCommandPlan(tower);
    if (!plan) return false;
    this.heroCommandField.preview(tower, plan);
    return true;
  }

  clearHeroCommandPreview() {
    this.heroCommandField.clearPreview();
  }

  previewPalaceCommand(cit, kind = 'muster') {
    if (!cit?.group) return false;
    this.clearPalaceCommandPreview();
    const cfg = palaceDef(cit.placeId || this.mapDef.id);
    const musterDef = SOLDIERS_BY_ID[cfg?.muster?.unit];
    const front = this._palaceFront(cit);
    const keep = cit.group.position || this.map.exitPos || front;
    const dir = front.clone().sub(keep);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const isMuster = kind === 'muster';
    const isBoon = kind === 'boon';
    const boon = cfg?.boon || {};
    const boonType = boon.type || 'rallyDamage';
    const boonColor = {
      heal: 0x7fe7c1,
      rallyDamage: 0xf4cd6e,
      stunPulse: 0xfff3c8,
      burnRing: 0xff7a24,
      bindChains: 0xd2d8e2,
      goldProvision: 0xf4cd6e,
      rangeVision: 0x7fe7ff,
      repairFortifications: 0xd6c2a0,
    }[boonType] || 0xf4cd6e;
    const radius = isBoon
      ? Math.max(10, Math.min(48, boon.radius || (boonType === 'rangeVision' ? 36 : 26)))
      : isMuster ? (musterDef?.mounted ? 12.5 : 10.25) : 8.75;
    const width = isBoon ? Math.max(10, Math.min(18, radius * 0.42)) : isMuster ? Math.max(8.5, Math.min(13.5, radius * 1.1)) : 10.5;
    const group = new THREE.Group();
    group.position.copy(front).setY(front.y + 0.18);
    group.renderOrder = 54;

    const mats = [];
    const geos = [];
    const makeLine = (points, color, opacity, dashed = false) => {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, dashSize: 0.85, gapSize: 0.45 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      const line = new THREE.Line(geo, mat);
      if (dashed) line.computeLineDistances();
      geos.push(geo);
      mats.push(mat);
      group.add(line);
      return line;
    };

    const ringPts = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a) * radius, 0.02, Math.sin(a) * radius));
    }
    makeLine(ringPts, isBoon ? boonColor : isMuster ? 0xffd36a : 0x7be0d6, isMuster ? 0.72 : 0.62, !isMuster);
    makeLine([
      side.clone().multiplyScalar(-width * 0.5),
      side.clone().multiplyScalar(width * 0.5),
    ], isBoon ? boonColor : 0xfff0ad, isBoon ? 0.68 : 0.82);

    for (const sign of [-1, 0, 1]) {
      const base = side.clone().multiplyScalar(sign * width * 0.32).addScaledVector(dir, isMuster ? 1.8 : 1.1);
      makeLine([
        base.clone().addScaledVector(dir, -1.2).addScaledVector(side, -0.75),
        base,
        base.clone().addScaledVector(dir, -1.2).addScaledVector(side, 0.75),
      ], isBoon ? boonColor : isMuster ? 0xffc34f : 0x76fff0, sign === 0 ? 0.78 : 0.48);
    }

    const discGeo = new THREE.CircleGeometry(radius, 80);
    const discMat = new THREE.MeshBasicMaterial({
      color: isBoon ? boonColor : isMuster ? 0xffb84d : 0x56d8cf,
      transparent: true,
      opacity: isBoon ? 0.055 : isMuster ? 0.095 : 0.075,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    discGeo.rotateX(-Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = 0.01;
    group.add(disc);
    geos.push(discGeo);
    mats.push(discMat);

    const slotCount = isBoon ? 4 : isMuster ? 7 : 5;
    for (let i = 0; i < slotCount; i++) {
      const slot = -width * 0.5 + (width / Math.max(1, slotCount - 1)) * i;
      const p = side.clone().multiplyScalar(slot).addScaledVector(dir, -0.35 + (i % 2) * 0.55);
      const geo = new THREE.CylinderGeometry(0.18, 0.24, 0.16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: isBoon ? boonColor : isMuster ? 0xffd978 : 0x8bfff5, transparent: true, opacity: 0.68, depthWrite: false, depthTest: false });
      const marker = new THREE.Mesh(geo, mat);
      marker.position.copy(p).setY(0.18);
      group.add(marker);
      geos.push(geo);
      mats.push(mat);
    }

    if (isBoon) {
      const standardGeo = new THREE.PlaneGeometry(2.8, 5.2);
      const standardMat = new THREE.MeshBasicMaterial({
        color: boonColor,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const standard = new THREE.Mesh(standardGeo, standardMat);
      standard.position.copy(dir.clone().multiplyScalar(2.2)).setY(3.0);
      standard.rotation.y = Math.atan2(dir.x, dir.z);
      group.add(standard);
      geos.push(standardGeo);
      mats.push(standardMat);

      if (boonType === 'bindChains' || boonType === 'burnRing' || boonType === 'rangeVision') {
        const inner = [];
        const scaleX = boonType === 'rangeVision' ? radius * 0.82 : radius * 0.55;
        const scaleZ = boonType === 'rangeVision' ? radius * 0.22 : radius * 0.55;
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * Math.PI * 2;
          inner.push(new THREE.Vector3(Math.cos(a) * scaleX, 0.05, Math.sin(a) * scaleZ));
        }
        const line = makeLine(inner, boonColor, 0.72, boonType === 'bindChains');
        line.rotation.y = boonType === 'rangeVision' ? Math.atan2(dir.x, dir.z) : 0;
      }
    }

    this.scene.add(group);
    this.palaceCommandPreview = { group, mats, geos };
    return true;
  }

  clearPalaceCommandPreview() {
    const preview = this.palaceCommandPreview;
    if (!preview) return;
    this.scene.remove(preview.group);
    for (const geo of preview.geos || []) geo.dispose();
    for (const mat of preview.mats || []) mat.dispose();
    this.palaceCommandPreview = null;
  }

  _heroActiveSpecific(tower, { key, rank, power, range, stats, center }) {
    if (key === 'borderArrow') {
      const lineRange = Math.max(92, range * 4.2);
      const hit = this._heroLineTargets(tower, lineRange, 5.0 + rank * 0.55);
      const from = this._heroMuzzle(tower);
      const dmg = (stats.damage || 34) * (2.0 + rank * 0.45) * power;
      this.heroCommandField.trigger(tower, { key, kind: 'vision', rank, range: lineRange, targets: hit });
      this._heroCommandBeat('vision', rank, hit.length);
      for (const e of hit) {
        const p = e.group.position.clone().setY(e.group.position.y + 1.1);
        lashEffect(this, from, p, 0xffd97a, 0.55);
        e.takeDamage(dmg, 'true', { command: true, impact: 0.7 });
        e.applyMark(0.26 + rank * 0.05, 9 + rank);
        e.applySlow(0.72, 2.6 + rank * 0.25);
      }
      this.particles.burst(from, 34, { speed: 4.2, up: 1.0, life: 0.85, size: 0.5, color: FXC.gold, grav: 0.4, spread: 3.4 });
      this.audio.longArrow();
      return { kind: 'vision', targetCount: hit.length };
    }

    if (key === 'maceShockwave' || key === 'ancestralBlow' || key === 'youngLion') {
      const radius = range * (key === 'youngLion' ? 1.05 : 0.9);
      const hit = this.enemies.filter((e) => e.alive && e.group.position.distanceTo(center) <= radius);
      const dmg = (stats.damage || 38) * (key === 'youngLion' ? 0.95 : 1.25) * power;
      this.heroCommandField.trigger(tower, { key, kind: 'bind', rank, range: radius, targets: hit });
      this._heroCommandBeat('bind', rank, hit.length);
      for (const e of hit) {
        e.takeDamage(dmg, 'impact', { command: true, impact: 0.9 });
        e.applySlow(e.boss ? 0.72 : 0.52, 2.4 + rank * 0.25);
        e.stunT = Math.max(e.stunT, e.boss ? 0.45 : 1.0 + rank * 0.16);
        e.dist = Math.max(0, e.dist - (e.boss ? 1.1 : 3.2 + rank * 0.45));
      }
      this.engine.addShake?.(key === 'youngLion' ? 0.45 : 0.65);
      this.particles.burst(center.clone().setY(center.y + 1.3), 42, { speed: 4.0, up: 1.4, life: 0.85, size: 0.62, color: FXC.gold, grav: 1.4, spread: 4.2 });
      this.audio.mace?.();
      return { kind: 'bind', targetCount: hit.length };
    }

    if (key === 'gateWard') {
      const road = this.map._nearRoad(center.x, center.z, range) || { pos: center, tangent: new THREE.Vector3(0, 0, 1) };
      const gate = new THREE.Vector3(road.pos.x, this.map.heightAt(road.pos.x, road.pos.z), road.pos.z);
      const dir = new THREE.Vector3(road.tangent?.x || 0, 0, road.tangent?.z || 1);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1); else dir.normalize();
      const dur = 6.5 + rank * 0.8;
      const radius = 8.5 + rank * 0.7;
      const hit = this.enemies.filter((e) => e.alive && e.group.position.distanceTo(gate) <= radius * 1.55);
      this._showGateMarker(gate, dir, radius, dur);
      this.heroCommandField.trigger(tower, { key, kind: 'bind', rank, range: radius * 1.65, targets: hit });
      this._heroCommandBeat('bind', rank, hit.length);
      for (const e of hit) {
        e.applyBind(e.boss ? dur * 0.22 : dur * 0.45);
        e.applySlow(0.5, dur);
        e.stunT = Math.max(e.stunT, e.boss ? 0.35 : 0.9);
        e.takeDamage((stats.damage || 30) * 0.55 * power, 'impact', { command: true, impact: 0.7 });
      }
      this._applyHeroSoldierSurge(gate, radius * 1.8, dur, 1.24 + rank * 0.04);
      this.audio.chain();
      return { kind: 'bind', targetCount: hit.length };
    }

    if (key === 'derafshRally' || key === 'warHorn' || key === 'wardenGallop' || key === 'mountedPursuit') {
      const dur = 8 + rank * 1.7;
      const affected = this.towers.filter((t) => t.alive && t.pos.distanceTo(center) <= range * 1.42);
      const soldierCount = this._applyHeroSoldierSurge(center, range * 1.55, dur, 1.26 + rank * 0.04);
      this._applyHeroTowerSurge(affected, dur, 0.2 + rank * 0.05, key === 'mountedPursuit' || key === 'wardenGallop' ? 0.12 : 0);
      this.heroCommandField.trigger(tower, { key, kind: 'rally', rank, range: range * 1.45, targets: affected });
      this._heroCommandBeat('rally', rank, affected.length + Math.min(8, soldierCount));
      this.particles.burst(center.clone().setY(center.y + 3.0), 36, { speed: 3.0, up: 1.1, life: 0.9, size: 0.55, color: FXC.gold, grav: 0.2, spread: 4 });
      this.audio.hornCall();
      return { kind: 'rally', targetCount: affected.length + soldierCount };
    }

    if (key === 'worldCup' || key === 'longSearch' || key === 'keepsakeToken' || key === 'heirsVolley' || key === 'twinArrow') {
      const all = this.enemies.filter((e) => e.alive);
      const targets = (key === 'worldCup' || key === 'longSearch')
        ? all
        : all.slice().sort((a, b) => b.hp - a.hp || (b.dist || 0) - (a.dist || 0)).slice(0, 5 + rank * 2);
      const mark = 0.22 + rank * 0.05;
      this.heroCommandField.trigger(tower, { key, kind: 'vision', rank, range: Math.max(range * 1.4, 34), targets });
      this._heroCommandBeat('vision', rank, targets.length);
      for (const e of targets) {
        e.untargetableT = 0;
        e.applyMark(mark, 8 + rank * 1.4);
        if (key === 'heirsVolley' || key === 'twinArrow') e.takeDamage((stats.damage || 30) * 0.7 * power, 'arrow', { armorShred: 0.25, command: true, impact: 0.45 });
      }
      tower.palaceRangeT = Math.max(tower.palaceRangeT || 0, 10 + rank * 2);
      tower.palaceRangeBonus = Math.max(tower.palaceRangeBonus || 0, 0.28 + rank * 0.04);
      tower.attackCd = 0.02;
      this.audio.longArrow();
      return { kind: 'vision', targetCount: targets.length };
    }

    if (key === 'pahlavanChallenge') {
      const hit = this.enemies
        .filter((e) => e.alive && e.group.position.distanceTo(center) <= range * 1.3)
        .sort((a, b) => b.hp - a.hp)
        .slice(0, 1 + Math.min(2, rank));
      this.heroCommandField.trigger(tower, { key, kind: 'bind', rank, range: range * 1.3, targets: hit });
      this._heroCommandBeat('bind', rank, hit.length);
      for (const e of hit) {
        e.applyMark(0.34 + rank * 0.04, 10);
        e.applyBind(e.boss ? 1.1 + rank * 0.2 : 2.2 + rank * 0.35);
        e.applySlow(0.48, 5.2 + rank * 0.4);
        e.takeDamage((stats.damage || 36) * (1.05 + rank * 0.18) * power, 'impact', { command: true, impact: 0.85 });
      }
      this.engine.addShake?.(0.38);
      this.audio.clank();
      return { kind: 'bind', targetCount: hit.length };
    }

    return null;
  }

  heroActive(tower) {
    if (!tower?.alive || !tower.hero) return false;
    if ((tower.heroActiveCd || 0) > 0) return false;
    const stats = tower.getStats();
    const key = tower.hero.special?.key || 'default';
    const rank = this.heroRank(tower.hero.id);
    const power = 1 + (stats.bond || 0) + rank * 0.18;
    const cd = Math.max(24, 42 - rank * 4);
    const range = Math.max(12, (stats.range || tower.def.range || 10) * 1.15);
    const center = tower.pos;
    const enemies = this.enemies.filter((e) => e.alive && e.group.position.distanceTo(center) <= range);
    const allTargets = key === 'worldCup' || key === 'borderArrow' ? this.enemies.filter((e) => e.alive) : enemies;
    tower.heroActiveCd = cd;
    let commandKind = 'rally';
    let commandTargets = 0;
    const specific = this._heroActiveSpecific(tower, { key, rank, power, range, stats, center });

    if (specific) {
      commandKind = specific.kind;
      commandTargets = specific.targetCount;
    } else if (HERO_ACTIVE_HEAL.has(key)) {
      const amt = 0.22 + rank * 0.04;
      const affected = this.towers.filter((t) => t.alive && t.pos.distanceTo(center) <= range * 1.25);
      commandKind = 'heal';
      commandTargets = affected.length;
      this.heroCommandField.trigger(tower, { key, kind: 'heal', rank, range: range * 1.25, targets: affected });
      this._heroCommandBeat('heal', rank, affected.length);
      for (const t of this.towers) {
        if (t.alive && t.pos.distanceTo(center) <= range * 1.25) t.hp = Math.min(t.maxHp, t.hp + t.maxHp * amt);
      }
      for (const s of this.soldiersNear(center, range * 1.25)) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * (amt + 0.08));
      this.particles.burst(center.clone().setY(center.y + 3), 28, { speed: 2, life: 1.0, size: 0.55, color: FXC.heal, grav: -0.7, spread: 3 });
      this.audio.shimmer();
    } else if (HERO_ACTIVE_FIRE.has(key)) {
      const dps = Math.max(9, (stats.damage || 35) * 0.18) * power;
      commandKind = 'fire';
      commandTargets = allTargets.length;
      this.heroCommandField.trigger(tower, { key, kind: 'fire', rank, range, targets: allTargets });
      this._heroCommandBeat('fire', rank, allTargets.length);
      for (const e of allTargets) {
        e.takeDamage((stats.damage || 35) * 0.55 * power, 'true', { command: true, impact: 0.55 });
        e.applyBurn(dps, 3.2 + rank * 0.4);
      }
      this.particles.burst(center.clone().setY(center.y + 2), 34, { speed: 3.5, life: 0.9, size: 0.6, color: FXC.ember, grav: -0.3, spread: range * 0.2 });
      this.audio.fire();
    } else if (HERO_ACTIVE_VISION.has(key)) {
      const bonus = 0.18 + rank * 0.04;
      commandKind = 'vision';
      commandTargets = allTargets.length;
      this.heroCommandField.trigger(tower, { key, kind: 'vision', rank, range: range * 1.2, targets: allTargets });
      this._heroCommandBeat('vision', rank, allTargets.length);
      for (const e of allTargets) {
        e.applyMark(bonus, 7 + rank);
        e.takeDamage((stats.damage || 28) * 0.45 * power, 'true', { command: true, impact: 0.45 });
      }
      tower.palaceRangeT = Math.max(tower.palaceRangeT || 0, 10 + rank * 2);
      tower.palaceRangeBonus = Math.max(tower.palaceRangeBonus || 0, 0.25 + rank * 0.04);
      tower.attackCd = 0.02;
      this.particles.burst(center.clone().setY(center.y + 4), 24, { speed: 4, life: 0.8, size: 0.5, color: FXC.sacred, grav: -0.2, spread: 4 });
      this.audio.longArrow();
    } else if (HERO_ACTIVE_BIND.has(key)) {
      const hit = allTargets.length ? allTargets : enemies;
      commandKind = 'bind';
      commandTargets = hit.length;
      this.heroCommandField.trigger(tower, { key, kind: 'bind', rank, range, targets: hit });
      this._heroCommandBeat('bind', rank, hit.length);
      for (const e of hit) {
        e.takeDamage((stats.damage || 38) * 0.75 * power, key === 'dragonbane' ? 'impact' : 'magic', { command: true, impact: 0.65 });
        if (!e.boss) e.stunT = Math.max(e.stunT, 0.9 + rank * 0.15);
        e.applyBind(1.2 + rank * 0.25);
        if (key === 'dragonbane' && (e.def.class === 'beast' || e.def.class === 'serpent')) e.takeDamage((stats.damage || 38) * power, 'true', { command: true, impact: 0.8 });
      }
      this.particles.burst(center.clone().setY(center.y + 2.4), 32, { speed: 3, life: 0.9, size: 0.6, color: FXC.chain, grav: 0.4, spread: 3.5 });
      this.audio.chain();
    } else {
      const dur = 8 + rank * 2;
      const bonus = 0.22 + rank * 0.05;
      const affected = this.towers.filter((t) => t.alive && t.pos.distanceTo(center) <= range * 1.35);
      commandKind = 'rally';
      commandTargets = affected.length;
      this.heroCommandField.trigger(tower, { key, kind: 'rally', rank, range: range * 1.35, targets: affected });
      this._heroCommandBeat('rally', rank, affected.length);
      for (const t of this.towers) {
        if (!t.alive || t.pos.distanceTo(center) > range * 1.35) continue;
        t.palaceDamageT = Math.max(t.palaceDamageT || 0, dur);
        t.palaceDamageBonus = Math.max(t.palaceDamageBonus || 0, bonus);
        t.attackCd = Math.min(t.attackCd, 0.05);
      }
      for (const s of this.soldiersNear(center, range * 1.35)) s.stunT = 0;
      this.particles.burst(center.clone().setY(center.y + 3.2), 30, { speed: 2.6, life: 1.0, size: 0.55, color: FXC.gold, grav: -0.3, spread: 3.5 });
      this.audio.hornCall();
    }

    this.emit('towersChanged');
    tower.commandFlash?.(commandKind, rank);
    this.emit('heroCommand', { tower, hero: tower.hero, key, kind: commandKind, targetCount: commandTargets, rank });
    return true;
  }

  // ---------- palace command actions ----------
  // Defensive point on the actual road just before the palace gate.
  _palaceFront(cit) {
    const keep = cit?.group?.position || this.map.exitPos || new THREE.Vector3();
    const gateBack = Math.max(10, Math.min(30, (cit?.footprint || 15) + 4));
    let best = null;
    let bestD = Infinity;
    for (const path of this.map.paths || []) {
      if (!path?.samples?.length) continue;
      const p = pointAt(path, Math.max(0, path.length - gateBack));
      const pos = new THREE.Vector3(p.x, this.map.heightAt(p.x, p.z), p.z);
      const d = pos.distanceTo(keep);
      if (d < bestD) { best = pos; bestD = d; }
    }
    if (best) return best;
    const dir = new THREE.Vector3(-keep.x, 0, -keep.z);
    if (dir.lengthSq() > 0.01) dir.normalize(); else dir.set(0, 0, -1);
    const x = keep.x + dir.x * gateBack, z = keep.z + dir.z * gateBack;
    return new THREE.Vector3(x, this.map.heightAt(x, z), z);
  }

  _palaceSortieOrigin(cit, gate) {
    const keep = cit?.group?.position || this.map.exitPos || gate;
    const toKeep = keep.clone().sub(gate);
    if (toKeep.lengthSq() < 0.01) return gate.clone();
    const d = Math.min(8, Math.max(3.5, toKeep.length() * 0.42));
    toKeep.normalize();
    const x = gate.x + toKeep.x * d;
    const z = gate.z + toKeep.z * d;
    return new THREE.Vector3(x, this.map.heightAt(x, z), z);
  }

  _showGateMarker(gate, sortieDir, radius = 8, dur = 7) {
    if (!gate || !sortieDir) return;
    const dir = sortieDir.clone();
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const group = new THREE.Group();
    group.position.copy(gate).setY(gate.y + 0.16);
    group.renderOrder = 48;

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf0b64a,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const gateWidth = Math.max(5.5, Math.min(10, radius * 1.15));
    const holdRingGeo = new THREE.RingGeometry(Math.max(0.1, radius - 0.12), radius + 0.12, 96);
    holdRingGeo.rotateX(-Math.PI / 2);
    const holdRing = new THREE.Mesh(holdRingGeo, ringMat);
    holdRing.position.y = 0.01;
    group.add(holdRing);

    const sealMat = new THREE.MeshBasicMaterial({
      color: 0xffdf83,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const sealCoreMat = new THREE.MeshBasicMaterial({
      color: 0x7adf8b,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const sealGeo = new THREE.RingGeometry(0.32, 0.55, 28);
    sealGeo.rotateX(-Math.PI / 2);
    const sealCoreGeo = new THREE.CircleGeometry(0.18, 20);
    sealCoreGeo.rotateX(-Math.PI / 2);
    const gateSeals = [];
    for (const u of [-0.5, 0, 0.5]) {
      const p = side.clone().multiplyScalar(u * gateWidth).addScaledVector(dir, -0.22 - Math.abs(u) * 0.16);
      const seal = new THREE.Mesh(sealGeo, sealMat.clone());
      seal.position.copy(p).setY(0.085);
      const core = new THREE.Mesh(sealCoreGeo, sealCoreMat.clone());
      core.position.copy(p).setY(0.09);
      const scale = u === 0 ? 1.08 : 0.86;
      seal.scale.setScalar(scale);
      core.scale.setScalar(scale);
      group.add(seal, core);
      gateSeals.push({ seal, core, base: scale, phase: Math.random() * Math.PI * 2 });
    }

    for (const s of [-1, 1]) {
      const p = gate.clone().addScaledVector(side, s * gateWidth * 0.5).setY(gate.y + 0.8);
      this.particles.burst(p, 7, { speed: 1.2, up: 1.2, life: 0.55, size: 0.35, color: FXC.gold, grav: -0.2, spread: 0.65 });
    }

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats: [
        ringMat,
        holdRing.material,
        ...gateSeals.flatMap((s) => [s.seal.material, s.core.material]),
      ],
      geos: [
        holdRingGeo,
        sealGeo,
        sealCoreGeo,
      ],
      t: dur,
      dur,
      ring: holdRing,
      gateSeals,
      gateFront: true,
    });
  }

  _showPalaceShieldLine(gate, sortieDir, { width = 9, pressure = 0.7, dur = 4.5 } = {}) {
    if (!gate || !sortieDir) return;
    const dir = sortieDir.clone();
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const group = new THREE.Group();
    group.position.copy(gate).addScaledVector(dir, -0.35).setY(gate.y + 0.1);
    group.renderOrder = 42;

    const sealMat = new THREE.MeshBasicMaterial({
      color: 0xffd26a,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x7adf8b,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const sealGeo = new THREE.RingGeometry(0.22, 0.38, 24);
    sealGeo.rotateX(-Math.PI / 2);
    const coreGeo = new THREE.CircleGeometry(0.12, 18);
    coreGeo.rotateX(-Math.PI / 2);
    const shieldSeals = [];
    const count = Math.max(5, Math.min(7, Math.round(width / 1.9)));
    const step = width / Math.max(1, count - 1);
    for (let i = 0; i < count; i++) {
      const offset = -width * 0.5 + i * step;
      const row = i % 2 ? -0.08 : 0.08;
      const p = side.clone().multiplyScalar(offset).addScaledVector(dir, row);
      const seal = new THREE.Mesh(sealGeo, sealMat.clone());
      seal.position.copy(p).setY(0.04);
      const core = new THREE.Mesh(coreGeo, coreMat.clone());
      core.position.copy(p).setY(0.045);
      const base = 0.74 + pressure * 0.12 + (i === Math.floor(count / 2) ? 0.12 : 0);
      seal.scale.setScalar(base);
      core.scale.setScalar(base);
      group.add(seal, core);
      shieldSeals.push({ seal, core, base, phase: i * 1.7 });
    }

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats: shieldSeals.flatMap((s) => [s.seal.material, s.core.material]),
      geos: [sealGeo, coreGeo],
      t: dur,
      dur,
      shieldLine: true,
      shieldSeals,
    });
  }

  _showRoyalGateImpact(gate, sortieDir, enemies = [], { pressure = 1, dur = 2.8 } = {}) {
    if (!gate || !sortieDir) return;
    const dir = sortieDir.clone();
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const force = Math.max(0.65, Math.min(1.35, pressure || 1));
    const group = new THREE.Group();
    group.position.copy(gate).addScaledVector(dir, -0.55).setY(gate.y + 0.22);
    group.renderOrder = 56;

    const innerGeo = new THREE.RingGeometry(0.92, 1.18, 56);
    const outerGeo = new THREE.RingGeometry(1.86, 2.08, 72);
    const plateGeo = new THREE.CircleGeometry(0.82, 48);
    const rayGeo = new THREE.BufferGeometry();
    const rayPts = [];
    const rayCount = 8;
    for (let i = 0; i < rayCount; i++) {
      const u = i / Math.max(1, rayCount - 1) - 0.5;
      const a = u * Math.PI * 0.86;
      const localDir = dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).normalize();
      rayPts.push(localDir.clone().multiplyScalar(0.82), localDir.clone().multiplyScalar(3.25 + Math.abs(u) * 1.05));
    }
    rayGeo.setFromPoints(rayPts);

    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffd26a,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x9fe0dc,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const plateMat = new THREE.MeshBasicMaterial({
      color: 0xfff0bd,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const rayMat = new THREE.LineBasicMaterial({
      color: 0xffe09a,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    const inner = new THREE.Mesh(innerGeo, innerMat);
    const outer = new THREE.Mesh(outerGeo, outerMat);
    const plate = new THREE.Mesh(plateGeo, plateMat);
    const rays = new THREE.LineSegments(rayGeo, rayMat);
    for (const obj of [inner, outer, plate]) obj.rotation.x = -Math.PI / 2;
    group.add(plate, inner, outer, rays);

    const extraMats = [];
    const extraGeos = [];
    const first = enemies.find((e) => e?.alive && e.group?.position);
    if (first) {
      const target = first.group.position.clone();
      target.y = this.map.heightAt(target.x, target.z) + (first.boss ? 1.35 : 0.85);
      const start = gate.clone().setY(gate.y + 0.85);
      const mid = start.clone().lerp(target, 0.56);
      mid.y += 0.7;
      const lashGeo = new THREE.BufferGeometry().setFromPoints([start, mid, target]);
      const lashMat = new THREE.LineBasicMaterial({
        color: 0xff715c,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      });
      group.add(new THREE.Line(lashGeo, lashMat));
      extraMats.push(lashMat);
      extraGeos.push(lashGeo);
    }

    this.particles.burst(gate.clone().setY(gate.y + 1.15), 16, {
      speed: 2.55 + force * 0.35,
      up: 1.55,
      life: 0.58,
      size: 0.34,
      color: FXC.gold,
      grav: 1.0,
      spread: 2.15 + force * 0.55,
      drag: 0.42,
    });
    for (const enemy of enemies.slice(0, 4)) {
      if (!enemy?.alive || !enemy.group?.position) continue;
      const p = enemy.group.position.clone();
      p.y = this.map.heightAt(p.x, p.z) + 0.72;
      this.particles.burst(p, 5, {
        speed: 2.15,
        up: 0.85,
        life: 0.32,
        size: 0.28,
        color: FXC.sacred,
        grav: 1.5,
        spread: 0.9,
        drag: 0.65,
      });
    }

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats: [innerMat, outerMat, plateMat, rayMat, ...extraMats],
      geos: [innerGeo, outerGeo, plateGeo, rayGeo, ...extraGeos],
      t: dur,
      dur,
      royalGateImpact: true,
      inner,
      outer,
      plate,
      rays,
      force,
      baseY: group.position.y,
    });
  }

  _showGateBanner(gate, sortieDir, { label = 'Gate Line', sublabel = '', pressure = 0.8, dur = 5.5 } = {}) {
    if (!gate || !sortieDir) return;
    const dir = sortieDir.clone();
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const group = new THREE.Group();
    group.position.copy(gate).addScaledVector(dir, -1.45).addScaledVector(side, -0.85).setY(gate.y + 4.55);
    group.rotation.y = Math.atan2(dir.x, dir.z);
    group.renderOrder = 58;

    const tex = makeGateBannerTexture(label, sublabel);
    const bannerMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    const banner = new THREE.Sprite(bannerMat);
    banner.scale.set(5.55, 1.75, 1);
    group.add(banner);

    const poleGeo = new THREE.CylinderGeometry(0.035, 0.045, 2.65, 6);
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x4a2d18, transparent: true, opacity: 0.86 });
    const capGeo = new THREE.SphereGeometry(0.13, 12, 8);
    const capMat = new THREE.MeshBasicMaterial({ color: 0xffd26a, transparent: true, opacity: 0.88 });
    const geos = [poleGeo, capGeo];
    const mats = [bannerMat, poleMat, capMat];
    for (const sign of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.copy(side.clone().multiplyScalar(sign * 3.05)).setY(-0.1);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.copy(pole.position).setY(1.28);
      group.add(pole, cap);
    }
    const railGeo = new THREE.BufferGeometry().setFromPoints([
      side.clone().multiplyScalar(-3.2).setY(-1.0),
      side.clone().multiplyScalar(3.2).setY(-1.0),
    ]);
    const railMat = new THREE.LineBasicMaterial({
      color: 0xffd26a,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Line(railGeo, railMat));
    geos.push(railGeo);
    mats.push(railMat);

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats,
      geos,
      textures: [tex],
      t: dur,
      dur,
      gateBanner: true,
      banner,
      baseY: group.position.y,
      pressure,
    });
  }

  _showGatePressureOmen(gate, sortieDir, { pressure = 0.5, peak = false, dur = 1.35 } = {}) {
    if (!gate || !sortieDir) return;
    const dir = sortieDir.clone();
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const group = new THREE.Group();
    group.position.copy(gate).addScaledVector(dir, -1.9).setY(gate.y + 0.16);
    group.renderOrder = 57;

    const force = Math.max(0.35, Math.min(1, pressure || 0));
    const color = peak ? 0xfff3c8 : 0x9fe0dc;
    const ringGeo = new THREE.RingGeometry(3.2 + force * 2.2, 3.34 + force * 2.26, 88);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: peak ? 0.28 : 0.2,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    const rayMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: peak ? 0.2 : 0.14,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const geos = [ringGeo];
    const rays = [];
    const width = 5.6 + force * 3.4;
    for (const sign of [-1, 1]) {
      const root = side.clone().multiplyScalar(sign * width * 0.18).addScaledVector(dir, -0.25).setY(0.08);
      const tip = side.clone().multiplyScalar(sign * width * 0.56).addScaledVector(dir, -1.45 - force * 0.9).setY(0.1);
      const geo = new THREE.BufferGeometry().setFromPoints([root, tip]);
      const ray = new THREE.Line(geo, rayMat.clone());
      group.add(ray);
      geos.push(geo);
      rays.push(ray);
    }

    const crownGeo = new THREE.ConeGeometry(0.26 + force * 0.08, 0.82 + force * 0.24, 5);
    const crownMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: peak ? 0.5 : 0.34,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.copy(dir.clone().multiplyScalar(-0.6)).setY(1.15 + force * 0.24);
    crown.rotation.y = Math.atan2(dir.x, dir.z);
    group.add(crown);

    if (peak) {
      this.particles.burst(gate.clone().addScaledVector(dir, -1.6).setY(gate.y + 0.8), 12, {
        speed: 1.8, up: 1.2, life: 0.56, size: 0.34, color: FXC.sacred, grav: -0.1, spread: 1.8, drag: 0.55,
      });
    }

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats: [ringMat, rayMat, ...rays.map((r) => r.material), crownMat],
      geos: [crownGeo, ...geos],
      t: dur,
      dur,
      gatePressureOmen: true,
      ring,
      crown,
      rays,
      force,
      peak,
      baseY: group.position.y,
    });
  }

  _showRoyalGateGuardFade(gate, sortieDir, { count = 0, ending = false, dur = 1.45 } = {}) {
    if (!gate) return;
    const dir = sortieDir?.clone?.() || new THREE.Vector3(0, 0, -1);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const group = new THREE.Group();
    group.position.copy(gate).addScaledVector(dir, -0.55).setY(gate.y + 0.13);
    group.renderOrder = 57;

    const color = ending ? 0xfff3c8 : 0x9fe0dc;
    const ringGeo = new THREE.RingGeometry(2.05, 2.2, 72);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: ending ? 0.34 : 0.24,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const wardRing = new THREE.Mesh(ringGeo, ringMat);
    group.add(wardRing);

    const wispMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: ending ? 0.5 : 0.36,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const geos = [ringGeo];
    const wisps = [];
    const n = Math.max(3, Math.min(5, count || 3));
    for (let i = 0; i < n; i++) {
      const lane = (i - (n - 1) * 0.5) * 0.92;
      const root = side.clone().multiplyScalar(lane).addScaledVector(dir, 0.35 + (i % 2) * 0.18).setY(0.08);
      const tip = root.clone().addScaledVector(dir, 0.32).setY(ending ? 1.28 : 0.96);
      const geo = new THREE.BufferGeometry().setFromPoints([root, tip]);
      const line = new THREE.Line(geo, wispMat);
      group.add(line);
      geos.push(geo);
      wisps.push(line);
    }

    this.scene.add(group);
    this.particles.burst(gate.clone().setY(gate.y + 0.62), ending ? 16 : 9, {
      speed: ending ? 1.85 : 1.2,
      up: ending ? 1.35 : 0.9,
      life: ending ? 0.72 : 0.55,
      size: ending ? 0.32 : 0.24,
      color: ending ? FXC.sacred : FXC.gold,
      grav: -0.2,
      spread: ending ? 1.8 : 1.25,
      drag: 0.58,
    });
    this.gateMarkers.push({
      group,
      mats: [ringMat, wispMat],
      geos,
      t: dur,
      dur,
      royalGateGuardFade: true,
      wardRing,
      wisps,
      ending,
      baseY: group.position.y,
    });
  }

  _showDefenderHoldFormation(front, dir, members = [], { pressure = 0.8, dur = 2.8 } = {}) {
    const alive = members.filter((m) => m?.alive && m.group?.position).slice(0, 18);
    if (!front || !dir || !alive.length) return;
    const forward = dir.clone();
    if (forward.lengthSq() < 0.01) forward.set(0, 0, -1); else forward.normalize();
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const group = new THREE.Group();
    group.renderOrder = 55;

    const force = Math.max(0.5, Math.min(1.25, pressure || 0.8));
    const footGeo = new THREE.RingGeometry(0.34, 0.46, 24);
    const footMat = new THREE.MeshBasicMaterial({
      color: 0xffd26a,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    const spearMat = new THREE.LineBasicMaterial({
      color: 0xd8b66e,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const geos = [footGeo];
    const mats = [footMat, spearMat];
    const slots = [];

    alive.forEach((m, i) => {
      const source = m.squad?.slotFor?.(m) || m.group.position;
      const p = source.clone();
      p.y = this.map.heightAt(p.x, p.z) + 0.08;
      slots.push(p);
      const ring = new THREE.Mesh(footGeo, footMat);
      ring.position.copy(p);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(m.model?.mounted ? 1.24 : 1.0);
      group.add(ring);

      if (i % 2 === 0) {
        const a = p.clone().addScaledVector(side, -0.34).setY(p.y + 0.82);
        const b = p.clone().addScaledVector(side, 0.34).addScaledVector(forward, 1.25 + force * 0.55).setY(p.y + 1.08);
        const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
        geos.push(geo);
        group.add(new THREE.Line(geo, spearMat));
      }
    });

    if (slots.length >= 2) {
      slots.sort((a, b) => {
        const ao = a.clone().sub(front);
        const bo = b.clone().sub(front);
        return (ao.x * side.x + ao.z * side.z) - (bo.x * side.x + bo.z * side.z);
      });
      const left = slots[0].clone().addScaledVector(side, -0.7).setY(front.y + 0.24);
      const right = slots[slots.length - 1].clone().addScaledVector(side, 0.7).setY(front.y + 0.24);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([left, right]);
      geos.push(lineGeo);
      group.add(new THREE.Line(lineGeo, spearMat));
    }

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats,
      geos,
      t: dur,
      dur,
      defenderHoldFormation: true,
      baseScale: 1,
      pressure: force,
    });
  }

  _showCavalryCloseCombatBeat(front, dir, defenders = [], enemies = [], { pressure = 1, dur = 4.8 } = {}) {
    if (!front || !dir) return;
    const mounted = defenders
      .filter((m) => m?.alive && m.model?.mounted && m.group?.position)
      .slice(0, 6);
    const targets = enemies
      .filter((e) => e?.alive && e.group?.position && !e.flying)
      .sort((a, b) => a.group.position.distanceTo(front) - b.group.position.distanceTo(front))
      .slice(0, 7);
    if (!mounted.length && !targets.length) return;

    const forward = dir.clone();
    if (forward.lengthSq() < 0.01) forward.set(0, 0, -1); else forward.normalize();
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const force = Math.max(0.55, Math.min(1.25, pressure || 1));
    const center = front.clone().addScaledVector(forward, 1.6);
    center.y = this.map.heightAt(center.x, center.z) + 0.2;
    const local = (p, y = 0.12) => new THREE.Vector3(
      p.x - center.x,
      this.map.heightAt(p.x, p.z) + y - center.y,
      p.z - center.z,
    );

    const group = new THREE.Group();
    group.name = 'zabulistan-cavalry-close-combat-fx';
    group.position.copy(center);
    group.renderOrder = 57;

    const laneMat = new THREE.LineBasicMaterial({
      color: 0xffd26a,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const lanceMat = new THREE.LineBasicMaterial({
      color: 0xd8b66e,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const hoofMat = new THREE.MeshBasicMaterial({
      color: 0xffd26a,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const enemyMat = new THREE.MeshBasicMaterial({
      color: 0xff715c,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x1b130c,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const crestMat = new THREE.LineBasicMaterial({
      color: 0xffd26a,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const hoofGeo = new THREE.RingGeometry(0.34, 0.46, 32);
    const enemyGeo = new THREE.RingGeometry(0.45, 0.6, 36);
    const shadowGeo = new THREE.CircleGeometry(0.72, 28);
    const geos = [hoofGeo, enemyGeo, shadowGeo];
    const mats = [laneMat, lanceMat, hoofMat, enemyMat, shadowMat, crestMat];
    const hoofRings = [];
    const enemyMarks = [];
    const defenderShadows = [];
    const crestLines = [];
    const lanePts = [];

    for (let i = -1; i <= 1; i++) {
      const base = side.clone().multiplyScalar(i * 2.25);
      lanePts.push(
        base.clone().addScaledVector(forward, -4.4).setY(0.08),
        base.clone().addScaledVector(forward, 5.2 + force * 0.45).setY(0.08),
      );
    }
    const laneGeo = new THREE.BufferGeometry().setFromPoints(lanePts);
    geos.push(laneGeo);
    group.add(new THREE.LineSegments(laneGeo, laneMat));

    mounted.forEach((m, i) => {
      const p = local(m.group.position, 0.13);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.position.copy(p).setY(p.y - 0.035);
      shadow.rotation.x = -Math.PI / 2;
      shadow.rotation.z = Math.atan2(forward.x, forward.z) + i * 0.08;
      shadow.scale.set(1.38, 0.58, 1);
      group.add(shadow);
      defenderShadows.push({ shadow, phase: i * 1.1, baseX: 1.38, baseY: 0.58 });

      const ring = new THREE.Mesh(hoofGeo, hoofMat);
      ring.position.copy(p).setY(p.y + 0.018);
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = i * 0.48;
      ring.scale.set(1.08, 0.68, 1);
      group.add(ring);
      hoofRings.push({ ring, phase: i * 1.4 });

      const crestBase = p.clone().addScaledVector(side, (i % 2 ? -1 : 1) * 0.16).setY(p.y + 0.35);
      const crestTip = crestBase.clone().setY(p.y + 1.85);
      const crestGeo = new THREE.BufferGeometry().setFromPoints([crestBase, crestTip]);
      geos.push(crestGeo);
      const crest = new THREE.Line(crestGeo, crestMat);
      group.add(crest);
      crestLines.push({ crest, phase: i * 0.8 });

      const target = targets[i % Math.max(1, targets.length)];
      const end = target?.group?.position
        ? local(target.group.position, target.boss ? 1.28 : 0.9)
        : p.clone().addScaledVector(forward, 4.1).setY(p.y + 0.65);
      if (i < 4) {
        const start = p.clone().setY(p.y + 1.2);
        const mid = start.clone().lerp(end, 0.55).addScaledVector(side, (i % 2 ? -1 : 1) * 0.18);
        mid.y += 0.18;
        const lanceGeo = new THREE.BufferGeometry().setFromPoints([start, mid, end]);
        geos.push(lanceGeo);
        group.add(new THREE.Line(lanceGeo, lanceMat));
      }
    });

    targets.forEach((e, i) => {
      const p = local(e.group.position, 0.16);
      const mark = new THREE.Mesh(enemyGeo, enemyMat);
      mark.position.copy(p);
      mark.rotation.x = -Math.PI / 2;
      mark.scale.setScalar(e.boss ? 1.4 : 1.0);
      mark.rotation.z = i * 0.32;
      group.add(mark);
      enemyMarks.push({ mark, phase: i * 1.1 });
    });

    this.scene.add(group);
    this._lastCavalryCloseCombat = {
      t: this._time || 0,
      defenders: mounted.length,
      enemies: targets.length,
    };
    this.gateMarkers.push({
      group,
      mats,
      geos,
      t: dur,
      dur,
      cavalryCloseCombat: true,
      hoofRings,
      enemyMarks,
      defenderShadows,
      crestLines,
      baseY: group.position.y,
      force,
    });
  }

  cavalryLanceBeat(soldier, target, power = 1) {
    if (!soldier?.alive || !soldier.model?.mounted || !soldier.group?.position || !target?.group?.position) return;
    const now = this._time || 0;
    if (now - (soldier._lastCavalryLanceBeat || -99) < 0.46) return;
    soldier._lastCavalryLanceBeat = now;

    const start = soldier.group.position.clone();
    const end = target.group.position.clone();
    const flat = end.clone().sub(start).setY(0);
    if (flat.lengthSq() < 0.01) flat.set(0, 0, 1); else flat.normalize();
    const side = new THREE.Vector3(-flat.z, 0, flat.x);
    const force = Math.max(0.55, Math.min(1.75, power || 1));
    start.y = this.map.heightAt(start.x, start.z) + 1.18;
    end.y = this.map.heightAt(end.x, end.z) + (target.boss ? 1.25 : 0.86);
    const mid = start.clone().lerp(end, 0.58).addScaledVector(side, soldier.id % 2 ? 0.24 : -0.24);
    mid.y += 0.24;

    const group = new THREE.Group();
    group.name = 'zabulistan-cavalry-lance-contact-fx';
    group.renderOrder = 47;
    const lanceMat = new THREE.LineBasicMaterial({
      color: 0xfff0bd,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const sparkMat = new THREE.LineBasicMaterial({
      color: target.boss ? 0xff715c : 0xffd26a,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const mainGeo = new THREE.BufferGeometry().setFromPoints([start, mid, end]);
    group.add(new THREE.Line(mainGeo, lanceMat));
    const geos = [mainGeo];
    for (const sign of [soldier.id % 2 ? -1 : 1]) {
      const a = end.clone().addScaledVector(side, sign * 0.42).addScaledVector(flat, -0.36);
      const b = end.clone().addScaledVector(side, -sign * 0.32).addScaledVector(flat, 0.42);
      a.y += 0.16;
      b.y -= 0.08;
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      geos.push(geo);
      group.add(new THREE.Line(geo, sparkMat));
    }
    this.scene.add(group);
    this.particles.burst(end, target.boss ? 5 : 3, {
      speed: 1.45 + force * 0.32,
      up: 0.95,
      life: 0.24,
      size: 0.2,
      color: FXC.gold,
      grav: 1.8,
      spread: 0.48,
      drag: 0.9,
    });
    this.gateMarkers.push({
      group,
      mats: [lanceMat, sparkMat],
      geos,
      t: 0.22,
      dur: 0.22,
      cavalryLanceBeat: true,
      force,
    });
  }

  _showGateClashPulse(anchor, enemy = null, power = 1) {
    if (!anchor) return;
    const group = new THREE.Group();
    const p = anchor.clone();
    const ep = enemy?.group?.position;
    if (ep) p.lerp(ep, enemy.boss ? 0.34 : 0.46);
    p.y = this.map.heightAt(p.x, p.z) + 0.24;
    group.position.copy(p);
    group.renderOrder = 49;

    const force = Math.max(0.45, Math.min(1.8, power || 1));
    const ringGeo = new THREE.RingGeometry(0.72, 1.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: enemy?.boss ? 0xd8462f : 0xffd26a,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.scale.setScalar(0.85 + force * 0.18);
    group.add(ring);

    const discGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.08, 16);
    discGeo.rotateX(Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({
      color: enemy?.boss ? 0x9f2f24 : 0xd8a93e,
      roughness: 0.48,
      metalness: 0.32,
      transparent: true,
      opacity: 0.92,
    });
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(discGeo, discMat);
      const a = -0.55 + i * 0.55;
      d.position.set(Math.sin(a) * (0.48 + force * 0.08), 0.55 + i * 0.12, Math.cos(a) * 0.22);
      d.rotation.y = a;
      group.add(d);
    }

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats: [ringMat, discMat],
      geos: [ringGeo, discGeo],
      t: 0.82,
      dur: 0.82,
      clashPulse: true,
      baseY: group.position.y,
    });
  }

  _showDefenderClashLine(anchor, enemy = null, power = 1) {
    if (!anchor || !enemy?.group?.position) return;
    const start = anchor.clone();
    const end = enemy.group.position.clone();
    start.y = this.map.heightAt(start.x, start.z) + 0.78;
    end.y = this.map.heightAt(end.x, end.z) + (enemy.boss ? 1.55 : 0.95);
    const dir = end.clone().sub(start).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const mid = start.clone().lerp(end, 0.55).setY(Math.max(start.y, end.y) + 0.28);
    const force = Math.max(0.45, Math.min(1.8, power || 1));
    const group = new THREE.Group();
    group.renderOrder = 46;

    const lineMat = new THREE.LineBasicMaterial({
      color: enemy.boss ? 0xff715c : 0xffe09a,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const spearMat = new THREE.LineBasicMaterial({
      color: 0x9fe0dc,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const mainGeo = new THREE.BufferGeometry().setFromPoints([start, mid, end]);
    const main = new THREE.Line(mainGeo, lineMat);
    group.add(main);

    const spearGeos = [];
    for (const sign of [enemy.id % 2 ? -1 : 1]) {
      const a = mid.clone().addScaledVector(side, sign * (0.65 + force * 0.16)).addScaledVector(dir, -0.55);
      const b = mid.clone().addScaledVector(side, -sign * (0.38 + force * 0.12)).addScaledVector(dir, 0.82);
      a.y += 0.18;
      b.y += 0.06;
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      spearGeos.push(geo);
      group.add(new THREE.Line(geo, spearMat));
    }

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats: [lineMat, spearMat],
      geos: [mainGeo, ...spearGeos],
      t: 0.24,
      dur: 0.24,
      defenderClashLine: true,
    });
  }

  _showGateShockLine(anchor, enemy = null, power = 1) {
    if (!anchor || !enemy?.group?.position) return;
    const start = anchor.clone();
    const end = enemy.group.position.clone();
    start.y = this.map.heightAt(start.x, start.z) + 0.42;
    end.y = this.map.heightAt(end.x, end.z) + (enemy.boss ? 1.18 : 0.68);
    const mid = start.clone().lerp(end, 0.62);
    mid.y = Math.max(start.y, end.y) + 0.18;
    const flat = end.clone().sub(start).setY(0);
    if (flat.lengthSq() < 0.01) flat.set(0, 0, -1); else flat.normalize();
    const side = new THREE.Vector3(-flat.z, 0, flat.x);
    const force = Math.max(0.45, Math.min(1.8, power || 1));
    const group = new THREE.Group();
    group.renderOrder = 47;

    const shockMat = new THREE.LineBasicMaterial({
      color: enemy.boss ? 0xff715c : 0xffd26a,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const sparkMat = new THREE.LineBasicMaterial({
      color: 0xfff0bd,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const mainGeo = new THREE.BufferGeometry().setFromPoints([start, mid, end]);
    const main = new THREE.Line(mainGeo, shockMat);
    group.add(main);

    const sparkGeos = [];
    for (const sign of [enemy.id % 2 ? -1 : 1]) {
      const a = mid.clone().addScaledVector(side, sign * (0.38 + force * 0.16)).addScaledVector(flat, -0.42);
      const b = mid.clone().addScaledVector(side, -sign * (0.42 + force * 0.18)).addScaledVector(flat, 0.46);
      a.y += 0.1 + force * 0.04;
      b.y -= 0.06;
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      sparkGeos.push(geo);
      group.add(new THREE.Line(geo, sparkMat));
    }

    this.particles.burst(mid.clone(), enemy.boss ? 8 : 4, {
      speed: enemy.boss ? 2.6 : 1.8,
      up: enemy.boss ? 1.35 : 1.05,
      life: 0.26,
      size: enemy.boss ? 0.32 : 0.22,
      color: FXC.gold,
      grav: 2.2,
      spread: enemy.boss ? 1.05 : 0.62,
      drag: 1.1,
    });

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats: [shockMat, sparkMat],
      geos: [mainGeo, ...sparkGeos],
      t: 0.2,
      dur: 0.2,
      gateShockLine: true,
    });
  }

  _showPalaceThreatCue(anchor, enemy, rank = 0) {
    if (!anchor || !enemy?.group?.position) return;
    const group = new THREE.Group();
    const pos = enemy.group.position.clone();
    pos.y = this.map.heightAt(pos.x, pos.z) + (enemy.boss ? 1.95 : 1.25);
    group.position.copy(pos);
    group.renderOrder = 48;

    const ringGeo = new THREE.RingGeometry(0.62 + rank * 0.06, 0.78 + rank * 0.06, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: enemy.boss ? 0xff715c : 0xffd26a,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x9fe0dc,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const dir = enemy.group.position.clone().sub(anchor).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const geos = [ringGeo];
    for (const s of [-1, 1]) {
      const a = side.clone().multiplyScalar(s * 0.42).addScaledVector(dir, -0.28).setY(0.34);
      const b = side.clone().multiplyScalar(s * 0.18).addScaledVector(dir, 0.34).setY(0.14);
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      geos.push(geo);
      group.add(new THREE.Line(geo, lineMat));
    }

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats: [ringMat, lineMat],
      geos,
      t: 0.72,
      dur: 0.72,
      threatCue: true,
      enemy,
      baseY: pos.y,
    });
  }

  _showRallyRoute(from, to, dur = 4.2) {
    if (!from || !to) return;
    const start = from.clone().setY(from.y + 0.45);
    const end = to.clone().setY(to.y + 0.5);
    const mid = start.clone().lerp(end, 0.5).setY(Math.max(start.y, end.y) + 1.2);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const pts = curve.getPoints(18);
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffd26a,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 41;
    this.scene.add(line);
    const objects = [line];
    const geos = [geom];
    const mats = [mat];
    const dir = end.clone().sub(start);
    if (dir.lengthSq() > 0.01) {
      dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const p = curve.getPoint(0.58);
      const arrowPts = [
        p.clone().addScaledVector(dir, 0.34),
        p.clone().addScaledVector(dir, -0.32).addScaledVector(side, 0.2),
        p.clone().addScaledVector(dir, -0.32).addScaledVector(side, -0.2),
        p.clone().addScaledVector(dir, 0.34),
      ];
      const arrowGeom = new THREE.BufferGeometry().setFromPoints(arrowPts);
      const arrowMat = mat.clone();
      arrowMat.opacity = 0.18;
      const arrow = new THREE.Line(arrowGeom, arrowMat);
      arrow.renderOrder = 42;
      this.scene.add(arrow);
      objects.push(arrow);
      geos.push(arrowGeom);
      mats.push(arrowMat);
    }
    this.gateMarkers.push({ group: null, objects, mats, geos, t: dur, dur, line, route: true, routeAlpha: 0.24 });
  }

  _showAssaultColumn(path, baseDist, count = 4, dir = null, dur = 4.8) {
    if (!path?.samples?.length || !Number.isFinite(baseDist)) return;
    const leadDir = dir?.clone?.() || new THREE.Vector3(0, 0, 1);
    if (leadDir.lengthSq() < 0.01) leadDir.set(0, 0, 1); else leadDir.normalize();
    const side = new THREE.Vector3(-leadDir.z, 0, leadDir.x);
    const firstDist = Math.max(0, baseDist - Math.max(8, count * 2.7 + 3));
    const lastDist = Math.max(0, Math.min(path.length - 1, baseDist + 2.2));
    const group = new THREE.Group();
    group.renderOrder = 40;

    const pts = [];
    const segments = 9;
    for (let i = 0; i <= segments; i++) {
      const d = firstDist + (lastDist - firstDist) * (i / segments);
      const p = pointAt(path, d);
      pts.push(new THREE.Vector3(p.x, p.y + 0.08, p.z));
    }
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xa92f24,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    line.renderOrder = 40;
    group.add(line);

    const geos = [line.geometry];
    const mats = [lineMat];
    const standards = [];
    const stdCount = Math.min(4, Math.max(2, Math.ceil(count * 0.55)));
    for (let i = 0; i < stdCount; i++) {
      const d = firstDist + (lastDist - firstDist) * ((i + 0.35) / (stdCount + 0.25));
      const p = pointAt(path, d);
      const offset = (i % 2 ? -1 : 1) * (0.95 + i * 0.12);
      const base = new THREE.Vector3(p.x, this.map.heightAt(p.x, p.z), p.z).addScaledVector(side, offset);
      const std = new THREE.Group();
      std.position.copy(base);
      std.rotation.y = Math.atan2(leadDir.x, leadDir.z);

      const poleGeo = new THREE.CylinderGeometry(0.032, 0.042, 2.5, 5);
      const poleMat = new THREE.MeshBasicMaterial({ color: 0x3b2517, transparent: true, opacity: 0.8 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 1.25;
      std.add(pole);

      const clothGeo = new THREE.PlaneGeometry(0.9, 1.35, 1, 3);
      const clothMat = new THREE.MeshBasicMaterial({
        color: i % 3 === 1 ? 0xd4a037 : 0x8f241f,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      const cloth = new THREE.Mesh(clothGeo, clothMat);
      cloth.position.set(0.44, 1.9, 0.04);
      cloth.renderOrder = 42;
      std.add(cloth);

      group.add(std);
      geos.push(poleGeo, clothGeo);
      mats.push(poleMat, clothMat);
      standards.push({ group: std, cloth, baseY: std.position.y, phase: i * 1.8 });
    }

    for (let i = 1; i < pts.length - 1; i += 3) {
      const p = pts[i].clone().addScaledVector(side, (i % 2 ? -1 : 1) * 0.75);
      this.particles.burst(p.setY(this.map.heightAt(p.x, p.z) + 0.35), 4, {
        speed: 0.9,
        up: 0.5,
        life: 0.58,
        size: 0.35,
        color: FXC.dust,
        grav: 1.4,
        spread: 0.9,
        drag: 0.7,
      });
    }

    this.scene.add(group);
    this.gateMarkers.push({
      group,
      mats,
      geos,
      t: dur,
      dur,
      line,
      route: true,
      column: true,
      standards,
      points: pts,
      side,
      fxT: 0,
      routeAlpha: 0.2,
    });
  }

  _updateGateMarkers(dt, time) {
    for (let i = this.gateMarkers.length - 1; i >= 0; i--) {
      const m = this.gateMarkers[i];
      m.t -= dt;
      const k = Math.max(0, Math.min(1, m.t / Math.max(0.001, m.dur)));
      const pulse = 0.75 + Math.sin(time * 7) * 0.25;
      if (m.line?.material) {
        const baseAlpha = Number.isFinite(m.lineAlpha) ? m.lineAlpha
          : Number.isFinite(m.routeAlpha) ? m.routeAlpha
          : m.route ? 0.76 : 0.95;
        m.line.material.opacity = baseAlpha * k * pulse;
      }
      if (m.shieldLine) {
        for (const s of m.shieldSeals || []) {
          const sealPulse = 0.9 + Math.sin(time * 5.2 + s.phase) * 0.1;
          const scale = (s.base || 1) * sealPulse;
          s.seal.scale.setScalar(scale);
          s.core.scale.setScalar(scale * 0.72);
        }
      }
      if (m.clashPulse) {
        m.group.position.y = m.baseY + (1 - k) * 1.15;
        m.group.scale.setScalar(0.85 + (1 - k) * 0.52);
      }
      if (m.defenderClashLine) {
        const flare = 1 + Math.sin((1 - k) * Math.PI) * 0.22;
        m.group.scale.setScalar(flare);
      }
      if (m.gateShockLine) {
        const flare = 1 + Math.sin((1 - k) * Math.PI) * 0.42;
        m.group.scale.setScalar(flare);
      }
      if (m.royalGateImpact) {
        const rise = 1 - k;
        const flare = Math.sin(rise * Math.PI);
        m.group.position.y = m.baseY + rise * 0.48;
        m.group.scale.setScalar(0.9 + rise * (0.58 + m.force * 0.1));
        if (m.inner) {
          m.inner.rotation.z += dt * (2.2 + m.force);
          m.inner.material.opacity = 0.48 * k * (0.72 + flare * 0.32);
        }
        if (m.outer) {
          m.outer.rotation.z -= dt * (1.35 + m.force * 0.6);
          m.outer.material.opacity = 0.22 * k * (0.58 + flare * 0.36);
        }
        if (m.plate) m.plate.material.opacity = 0.1 * k * (0.5 + flare * 0.62);
        if (m.rays) {
          m.rays.scale.setScalar(0.82 + rise * 0.34);
          m.rays.material.opacity = 0.32 * k * (0.48 + flare * 0.42);
        }
      }
      if (m.cavalryCloseCombat) {
        const rise = 1 - k;
        const flare = Math.sin(rise * Math.PI);
        m.group.position.y = m.baseY + flare * 0.08;
        m.group.scale.setScalar(0.96 + flare * 0.08 + (m.force || 0) * 0.02);
        for (const s of m.defenderShadows || []) {
          const shadowPulse = 0.92 + Math.sin(time * 4.2 + s.phase) * 0.08 + flare * 0.08;
          s.shadow.scale.set((s.baseX || 1.3) * shadowPulse, (s.baseY || 0.58) * (0.95 + flare * 0.08), 1);
          s.shadow.material.opacity = 0.24 * k * (0.72 + flare * 0.32);
        }
        for (const c of m.crestLines || []) {
          c.crest.material.opacity = 0.12 * k * (0.72 + Math.sin(time * 5.4 + c.phase) * 0.12 + flare * 0.28);
        }
        for (const h of m.hoofRings || []) {
          h.ring.rotation.z += dt * (1.6 + (m.force || 0) * 0.4);
          h.ring.scale.set(1.04 + flare * 0.12, 0.66 + flare * 0.06, 1);
          h.ring.material.opacity = 0.22 * k * (0.68 + flare * 0.38);
        }
        for (const e of m.enemyMarks || []) {
          e.mark.rotation.z -= dt * 1.2;
          e.mark.scale.setScalar(0.84 + flare * 0.1);
          e.mark.material.opacity = 0.2 * k * (0.64 + flare * 0.42);
        }
      }
      if (m.cavalryLanceBeat) {
        const flare = Math.sin((1 - k) * Math.PI);
        m.group.scale.setScalar(0.94 + flare * (0.22 + (m.force || 0) * 0.05));
      }
      if (m.gateBanner) {
        const rise = 1 - k;
        const bob = Math.sin(time * 3.4) * 0.08;
        m.group.position.y = m.baseY + bob + Math.sin(Math.min(1, rise * 1.4) * Math.PI) * 0.22;
        m.group.scale.setScalar(0.92 + Math.sin(Math.min(1, rise * 1.8) * Math.PI) * 0.08);
        if (m.banner?.material) m.banner.material.opacity = Math.min(0.78, k * 1.05);
      }
      if (m.gatePressureOmen) {
        const rise = 1 - k;
        const flare = Math.sin(rise * Math.PI);
        m.group.position.y = m.baseY + Math.sin(time * 5.2) * 0.035 + flare * 0.12;
        m.group.scale.setScalar(0.88 + flare * (m.peak ? 0.18 : 0.1) + (m.force || 0) * 0.08);
        if (m.ring?.material) {
          m.ring.rotation.z += dt * (m.peak ? 1.4 : 0.8);
          m.ring.material.opacity = (m.peak ? 0.28 : 0.2) * k * (0.72 + flare * 0.42);
        }
        if (m.crown?.material) {
          m.crown.position.y = 1.15 + (m.force || 0) * 0.24 + Math.sin(time * 7) * 0.055;
          m.crown.material.opacity = (m.peak ? 0.5 : 0.34) * k;
        }
        for (const ray of m.rays || []) if (ray.material) ray.material.opacity = (m.peak ? 0.2 : 0.14) * k * (0.6 + flare * 0.5);
      }
      if (m.royalGateGuardFade) {
        const rise = 1 - k;
        const flare = Math.sin(rise * Math.PI);
        m.group.position.y = m.baseY + rise * (m.ending ? 0.55 : 0.28);
        m.group.scale.setScalar(0.92 + flare * (m.ending ? 0.16 : 0.1));
        if (m.wardRing?.material) {
          m.wardRing.rotation.z += dt * (m.ending ? 1.4 : 0.85);
          m.wardRing.material.opacity = (m.ending ? 0.34 : 0.24) * k * (0.72 + flare * 0.58);
        }
        for (const wisp of m.wisps || []) {
          if (!wisp.material) continue;
          wisp.scale.y = 1 + rise * (m.ending ? 0.7 : 0.42);
          wisp.material.opacity = (m.ending ? 0.5 : 0.36) * k * (0.55 + flare * 0.55);
        }
      }
      if (m.defenderHoldFormation) {
        const flare = Math.sin((1 - k) * Math.PI);
        m.group.scale.setScalar(1 + flare * 0.05 + (m.pressure || 0) * 0.025);
      }
      if (m.gateFront) {
        for (const s of m.gateSeals || []) {
          const pulse = 0.92 + Math.sin(time * 4.8 + s.phase) * 0.08;
          const scale = (s.base || 1) * pulse;
          s.seal.scale.setScalar(scale);
          s.core.scale.setScalar(scale * 0.78);
        }
        for (const s of m.shieldGlints || []) {
          const glint = 0.78 + Math.sin(time * 6.2 + s.phase) * 0.22;
          s.shield.scale.setScalar(glint);
        }
      }
      if (m.threatCue) {
        if (!m.enemy?.alive) {
          m.t = 0;
        } else {
          const p = m.enemy.group.position;
          m.group.position.set(p.x, this.map.heightAt(p.x, p.z) + (m.enemy.boss ? 1.95 : 1.25), p.z);
          m.group.rotation.y = time * 1.8;
          m.group.scale.setScalar(0.92 + (1 - k) * 0.22);
        }
      }
      if (m.column) {
        for (const s of m.standards || []) {
          s.group.position.y = s.baseY + Math.sin(time * 3.2 + s.phase) * 0.08;
          s.cloth.scale.x = 1 + Math.sin(time * 5.8 + s.phase) * 0.12;
        }
        m.fxT = (m.fxT || 0) - dt;
        if (m.fxT <= 0 && this.particles && (m.points?.length || 0) > 2) {
          m.fxT = 0.22;
          const p = m.points[Math.floor(1 + Math.random() * (m.points.length - 2))].clone();
          p.addScaledVector(m.side || new THREE.Vector3(1, 0, 0), (Math.random() - 0.5) * 2.2);
          p.y = this.map.heightAt(p.x, p.z) + 0.28;
          this.particles.spawn(
            p.x, p.y, p.z,
            (Math.random() - 0.5) * 0.4,
            0.6 + Math.random() * 0.45,
            (Math.random() - 0.5) * 0.4,
            0.55, 0.16,
            0.72, 0.36, 0.28,
            0.8, 0.65,
          );
        }
      }
      if (m.ring) {
        m.ring.material.opacity = 0.07 * k * (0.78 + Math.sin(time * 4) * 0.18);
        m.ring.scale.setScalar(1 + (1 - k) * 0.08);
      }
      for (const mat of m.mats) mat.opacity = Math.min(mat.opacity, Math.max(0, k));
      if (m.t > 0) continue;
      if (m.group) this.scene.remove(m.group);
      else for (const obj of m.objects || []) this.scene.remove(obj);
      for (const geo of m.geos) geo.dispose();
      for (const tex of m.textures || []) tex.dispose();
      for (const mat of m.mats) mat.dispose();
      this.gateMarkers.splice(i, 1);
    }
  }

  _clearGateMarkers() {
    for (const m of this.gateMarkers) {
      if (m.group) this.scene.remove(m.group);
      else for (const obj of m.objects || []) this.scene.remove(obj);
      for (const geo of m.geos) geo.dispose();
      for (const tex of m.textures || []) tex.dispose();
      for (const mat of m.mats) mat.dispose();
    }
    this.gateMarkers.length = 0;
  }

  _palaceCommandCommitBeat(cit, front, dir, {
    type = 'rallyDamage',
    kind = 'boon',
    radius = 28,
    targetCount = 0,
    pressure = 0.8,
    dur = 4.2,
  } = {}) {
    if (!front) return;
    const keep = cit?.group?.position || this.map.exitPos || front;
    const d = dir?.clone?.() || front.clone().sub(keep);
    if (d.lengthSq() < 0.01) d.set(0, 0, -1); else d.normalize();
    const boonColor = {
      heal: FXC.heal,
      rallyDamage: FXC.gold,
      stunPulse: FXC.sacred,
      burnRing: FXC.ember,
      bindChains: FXC.chain,
      goldProvision: FXC.gold,
      rangeVision: FXC.sacred,
      repairFortifications: FXC.dust,
    }[type] || FXC.gold;
    const heavy = kind === 'muster' || type === 'burnRing' || type === 'stunPulse' || targetCount >= 8;
    const weight = Math.max(0.55, Math.min(1.45, pressure + Math.min(0.45, targetCount * 0.035)));

    this.audio.palaceCommand?.(type);
    if (kind !== 'boon') setTimeout(() => this.audio.hornCall?.(), heavy ? 130 : 90);
    this.engine.hitStop?.(heavy ? 0.04 : 0.025);
    this.engine.slowMo?.(heavy ? 0.56 : 0.66, (heavy ? 0.72 : 0.5) * weight);
    this.engine.bloomPulse?.((heavy ? 0.98 : 0.78) * weight);
    this.engine.addShake?.((heavy ? 0.2 : 0.1) * weight);
    this._cameraFocusBeat(front, {
      dur: heavy ? 0.86 : 0.62,
      strength: heavy ? 0.2 : 0.12,
      dist: heavy ? 52 : 60,
      pitch: 0.78,
      yawOffset: kind === 'rally' ? 0.06 : -0.06,
    });
    this._showGateMarker(front, d, Math.max(7.5, Math.min(18, radius * 0.34)), Math.min(6.5, dur));
    this._showPalaceShieldLine(front, d, { width: Math.max(8.2, Math.min(14, radius * 0.34)), pressure: Math.min(1, pressure + 0.12), dur: Math.min(5.2, dur) });
    this.palaceStage?.signalAlarm?.({ front, keep, dir: d, pressure: Math.min(1, pressure), dur: Math.min(4.4, dur) });
    this.particles?.burst?.(keep.clone().setY(keep.y + (cit?.height || 16) * 0.56), heavy ? 44 : 30, {
      speed: heavy ? 3.6 : 2.8,
      up: heavy ? 1.7 : 1.25,
      life: heavy ? 1.18 : 0.95,
      size: heavy ? 0.76 : 0.62,
      color: boonColor,
      grav: -0.55,
      spread: Math.min(6.5, 3.2 + radius * 0.08),
      drag: 0.45,
    });
    this.particles?.burst?.(front.clone().setY(front.y + 1.35), 22 + Math.min(24, targetCount * 2), {
      speed: heavy ? 3.0 : 2.25,
      up: 1.05,
      life: 0.82,
      size: 0.48,
      color: boonColor,
      grav: 0.08,
      spread: Math.min(5.8, 2.5 + radius * 0.1),
      drag: 0.56,
    });
    const synergyCount = this._palaceHeroSynergy(cit, front, {
      type,
      kind,
      radius: Math.max(radius, kind === 'boon' ? radius : 28),
      dur: Math.max(5.5, Math.min(10, dur + 2.2)),
      color: boonColor,
    });
    return synergyCount;
  }

  _palaceHeroSynergy(cit, front, { type = 'rallyDamage', kind = 'boon', radius = 32, dur = 7, color = FXC.gold } = {}) {
    const keep = cit?.group?.position || this.map.exitPos || front;
    const reach = Math.max(24, Math.min(58, radius + 10));
    const affected = this.towers.filter((t) => t.alive && t.hero && (
      t.pos.distanceTo(front) <= reach || t.pos.distanceTo(keep) <= reach
    ));
    if (!affected.length) return 0;
    const commandKind = type === 'heal' || type === 'repairFortifications'
      ? 'heal'
      : type === 'burnRing'
        ? 'fire'
        : type === 'bindChains' || type === 'stunPulse'
          ? 'bind'
          : type === 'rangeVision'
            ? 'vision'
            : 'rally';
    for (const tower of affected) {
      const rank = this.heroRank(tower.hero.id);
      const bond = heroBond(tower.hero, tower.def, tower.ageIdx);
      const strength = (0.06 + rank * 0.018 + Math.min(0.08, bond * 0.08)) * (kind === 'muster' ? 1.15 : 1);
      tower.palaceSynergyT = Math.max(tower.palaceSynergyT || 0, dur);
      tower.palaceSynergyDamage = Math.max(tower.palaceSynergyDamage || 0, commandKind === 'vision' ? strength * 0.55 : strength);
      tower.palaceSynergyRange = Math.max(tower.palaceSynergyRange || 0, commandKind === 'vision' ? strength * 1.2 : strength * 0.35);
      tower.palaceSynergyRate = Math.max(tower.palaceSynergyRate || 0, commandKind === 'rally' ? strength * 1.4 : strength * 0.55);
      tower.attackCd = Math.min(tower.attackCd, 0.05);
      tower.commandFlash?.(commandKind, rank);
      this.particles?.burst?.(tower.pos.clone().setY(tower.pos.y + (tower.model?.height || 5) * 0.72), 8 + rank * 3, {
        speed: 1.6 + rank * 0.25,
        up: 1.35,
        life: 0.78,
        size: 0.42,
        color,
        grav: -0.2,
        spread: 1.5 + rank * 0.25,
        drag: 0.5,
      });
    }
    this.emit('palaceHeroSynergy', { type, kind, count: affected.length });
    return affected.length;
  }

  _royalGuardDeployBeat(cit, front, dir, { width = 9, radius = 9, dur = 5.5, pressure = 0.85, count = 0, kind = 'muster' } = {}) {
    if (!front || !dir) return;
    const keep = cit?.group?.position || this.map.exitPos || front;
    const d = dir.clone();
    if (d.lengthSq() < 0.01) d.set(0, 0, -1); else d.normalize();
    const heavy = kind === 'muster';
    const synergyCount = this._palaceCommandCommitBeat(cit, front, d, { type: 'rallyDamage', kind, radius, targetCount: count, pressure, dur });
    this._showGateMarker(front, d, radius, dur);
    this._showPalaceShieldLine(front, d, { width, pressure, dur: Math.min(6.4, dur) });
    this.palaceStage?.signalAlarm?.({ front, keep, dir: d, pressure, dur: heavy ? 3.8 : 2.7 });
    this._cameraFocusBeat(front, { dur: heavy ? 0.82 : 0.58, strength: heavy ? 0.18 : 0.11, dist: heavy ? 54 : 60, pitch: 0.78, yawOffset: -0.06 });
    this.particles.burst(keep.clone().setY(keep.y + (cit?.height || 16) * 0.48), heavy ? 30 : 20, {
      speed: heavy ? 2.7 : 2.1,
      up: 1.2,
      life: 0.95,
      size: heavy ? 0.56 : 0.46,
      color: FXC.gold,
      grav: -0.25,
      spread: heavy ? 4.2 : 3.2,
      drag: 0.45,
    });
    this.particles.burst(front.clone().setY(front.y + 1.25), 18 + Math.min(18, count * 2), {
      speed: heavy ? 2.6 : 2.1,
      up: 1.05,
      life: 0.82,
      size: 0.46,
      color: FXC.sacred,
      grav: 0.15,
      spread: Math.max(2.1, radius * 0.35),
      drag: 0.58,
    });
    return synergyCount || 0;
  }

  // Rally to the Keep: pull every tower's garrison to defend in front of the palace.
  palaceRally(cit) {
    const pt = this._palaceFront(cit);
    const keep = cit?.group?.position || this.map.exitPos || pt;
    const standDir = pt.clone().sub(keep);
    if (standDir.lengthSq() < 0.01) standDir.set(0, 0, -1); else standDir.normalize();
    let n = 0;
    for (const tw of this.towers) {
      if (!tw.alive) continue;
      for (const sq of tw.squads) {
        const alive = sq.members.filter((m) => m.alive);
        const from = alive.length
          ? alive.reduce((acc, m) => acc.add(m.group.position), new THREE.Vector3()).multiplyScalar(1 / alive.length)
          : (sq.anchor || tw.pos).clone();
        this._showRallyRoute(from, pt, 4.5);
        sq.setRally(pt.clone(), { silent: true });
        sq.setPalaceStand?.(pt.clone(), standDir.clone(), { rank: n, radius: 16, width: 10.5, depth: 0.65, spread: 1.05 });
        sq.markPalaceRally?.(pt.clone(), { dur: 18, gateDur: 8.5, radius: 11.5, mult: 1.34, dir: standDir.clone() });
        for (const m of alive) m.sortieT = Math.max(m.sortieT || 0, m.model?.mounted ? 1.7 : 1.25);
        n++;
      }
    }
    if (!n) this.emit('toast', 'palace.noGarrison');
    else {
      const synergyCount = this._royalGuardDeployBeat(cit, pt, standDir, { width: 12.5, radius: 11.5, dur: 8.5, pressure: 0.78, count: n, kind: 'rally' });
      this.palaceBoonField.trigger(cit, { type: 'rallyDamage', radius: 34 }, {
        front: pt,
        keep: cit.group.position,
        radius: 34,
        towers: this.towers.filter((t) => t.alive),
      });
      this.emit('palaceCommand', { kind: 'rally', palace: cit, count: n, synergyCount });
    }
    return n;
  }

  // Muster: summon a defensive squad at the palace (gold + cooldown), capped at 2 standing squads.
  palaceMuster(cit, { quiet = false } = {}) {
    const cfg = palaceDef(cit.placeId || this.mapDef.id).muster;
    if ((cit.musterCd || 0) > 0) return false;
    if (!this.canAfford(cfg.cost)) { this.emit('toast', 'hud.notEnoughGold'); return false; }
    const sDef = SOLDIERS_BY_ID[cfg.unit];
    if (!sDef) return false;
    this.gold -= cfg.cost;
    cit.musterCd = cfg.cd;
    const gate = this._palaceFront(cit);
    const origin = this._palaceSortieOrigin(cit, gate);
    const sortieDir = gate.clone().sub(origin);
    if (sortieDir.lengthSq() > 0.01) sortieDir.normalize(); else sortieDir.set(0, 0, -1);
    const side = new THREE.Vector3(-sortieDir.z, 0, sortieDir.x);
    const owner = { pos: gate.clone(), alive: true, isPalaceMuster: true };
    const sq = new Squad(this, owner, sDef, cfg.count);
    sq.homeAnchor.copy(gate);
    sq.anchor.copy(gate);
    sq.rallyOverride = gate.clone();
    sq.setPalaceStand?.(gate.clone(), sortieDir.clone(), {
      rank: this.palaceSquads.length,
      radius: sDef.mounted ? 30 : 26,
      width: sDef.mounted ? 17 : 14,
      depth: sDef.mounted ? 1.05 : 0.8,
      spread: sDef.mounted ? 1.12 : 1.04,
    });
    sq.gateLineT = sDef.mounted ? 13.5 : 12.0;
    sq.gateLineDur = sq.gateLineT;
    sq.gateLineAnchor = gate.clone();
    sq.gateLineDir = sortieDir.clone();
    sq.gateLineRadius = sDef.mounted ? 15.0 : 12.5;
    sq.gateLineWidth = Math.max(9.5, Math.min(16, sq.gateLineRadius * 1.16));
    sq.gateLineMult = sDef.mounted ? 1.58 : 1.44;
    sq.members.forEach((m, i) => {
      const lane = (i % 2 === 0 ? -1 : 1) * (0.55 + (i % 3) * 0.18);
      const row = Math.floor(i / 2) * 0.75;
      const slot = sq.slotFor(m);
      const entry = origin.clone().addScaledVector(side, lane * 0.65).addScaledVector(sortieDir, -row * 0.32);
      m.group.position.copy(quiet ? slot : entry);
      m.group.position.y = this.map.heightAt(m.group.position.x, m.group.position.z);
      m.group.rotation.y = Math.atan2(sortieDir.x, sortieDir.z);
      m.sortieT = sDef.mounted ? 2.4 : 1.8;
      if (quiet) m.gateReadT = Math.max(m.gateReadT || 0, m.model?.mounted ? 0.82 : 0.95);
    });
    this.palaceSquads.push(sq);
    while (this.palaceSquads.length > 3) {
      const old = this.palaceSquads.shift();
      old?.destroy?.();
    }
    if (!quiet) {
      this.particles.burst(origin.clone().setY(origin.y + 0.5), 20, { speed: 3.0, up: 0.6, life: 0.65, size: 0.58, color: FXC.dust, grav: 3, spread: 2.6, drag: 0.4 });
      const synergyCount = this._royalGuardDeployBeat(cit, gate, sortieDir, {
        width: sq.gateLineWidth,
        radius: sq.gateLineRadius,
        dur: sq.gateLineT,
        pressure: 0.92,
        count: cfg.count,
        kind: 'muster',
      });
      this.palaceBoonField.trigger(cit, { type: 'rallyDamage', radius: 30 }, {
        front: gate,
        keep: cit.group.position,
        radius: 30,
        towers: this.towers.filter((t) => t.alive),
      });
      this.emit('palaceCommand', { kind: 'muster', palace: cit, unit: sDef, count: cfg.count, synergyCount });
    }
    this.emit('goldChanged', this.gold);
    return true;
  }

  _ensureRoyalGateGuard(cit, front, dir, { pressure = 0.75, dur = 12 } = {}) {
    const alivePalaceDefenders = this.palaceSquads
      .flatMap((sq) => sq.members || [])
      .filter((m) => m?.alive && m.group?.position && m.group.position.distanceTo(front) <= 34);
    if (alivePalaceDefenders.length) return { added: 0, members: alivePalaceDefenders };

    const palaceCfg = palaceDef(cit.placeId || this.mapDef.id);
    const preferred = SOLDIERS_BY_ID[palaceCfg?.muster?.unit];
    const guardDef = preferred && preferred.behavior !== 'support'
      ? preferred
      : SOLDIERS_BY_ID['spear-levy'];
    if (!guardDef) return { added: 0, members: [] };

    const sortieDir = dir?.clone?.() || new THREE.Vector3(0, 0, -1);
    if (sortieDir.lengthSq() < 0.01) sortieDir.set(0, 0, -1); else sortieDir.normalize();
    const origin = this._palaceSortieOrigin(cit, front);
    const side = new THREE.Vector3(-sortieDir.z, 0, sortieDir.x);
    const count = Math.max(3, Math.min(4, palaceCfg?.muster?.count || guardDef.squad || 3));
    const owner = { pos: front.clone(), alive: true, isPalaceMuster: true, isRoyalGateGuard: true };
    const sq = new Squad(this, owner, guardDef, count);
    sq.powerMult = Math.max(sq.powerMult || 1, 0.88 + pressure * 0.14);
    sq.royalGateGuardT = Math.min(12.5, Math.max(8.5, dur * 0.92));
    sq.homeAnchor.copy(front);
    sq.anchor.copy(front);
    sq.rallyOverride = front.clone();
    sq.setPalaceStand?.(front.clone(), sortieDir.clone(), {
      rank: 0,
      radius: guardDef.mounted ? 28 : 24,
      width: guardDef.mounted ? 15 : 12,
      depth: guardDef.mounted ? 0.85 : 0.55,
      spread: guardDef.mounted ? 1.08 : 1.0,
    });
    sq.gateLineT = Math.max(dur, guardDef.mounted ? 11.5 : 10.0);
    sq.gateLineDur = sq.gateLineT;
    sq.gateLineAnchor = front.clone();
    sq.gateLineDir = sortieDir.clone();
    sq.gateLineRadius = guardDef.mounted ? 13.8 : 11.4;
    sq.gateLineWidth = guardDef.mounted ? 14.2 : 10.8;
    sq.gateLineMult = guardDef.mounted ? 1.42 : 1.3;

    sq.members.forEach((m, i) => {
      const hpFrac = m.maxHp > 0 ? m.hp / m.maxHp : 1;
      m.maxHp = guardDef.hp * sq.powerMult;
      m.hp = m.maxHp * Math.max(0.2, Math.min(1, hpFrac));
      m.damage = guardDef.damage * sq.powerMult;
      const lane = (i - (sq.members.length - 1) * 0.5) * (guardDef.mounted ? 1.35 : 0.95);
      const row = Math.floor(i / 3) * 0.55;
      const entry = origin.clone().addScaledVector(side, lane * 0.42).addScaledVector(sortieDir, -row * 0.28);
      m.group.position.copy(entry);
      m.group.position.y = this.map.heightAt(m.group.position.x, m.group.position.z);
      m.group.rotation.y = Math.atan2(sortieDir.x, sortieDir.z);
      m.sortieT = guardDef.mounted ? 2.05 : 1.48;
      m.gateReadT = guardDef.mounted ? 0.82 : 0.95;
    });

    this.palaceSquads.push(sq);
    while (this.palaceSquads.length > 4) {
      const old = this.palaceSquads.find((s) => s.royalGateGuardT > 0) || this.palaceSquads[0];
      const idx = this.palaceSquads.indexOf(old);
      if (idx >= 0) this.palaceSquads.splice(idx, 1);
      old?.destroy?.();
    }
    this.particles.burst(origin.clone().setY(origin.y + 0.75), 18, {
      speed: 2.6,
      up: 0.9,
      life: 0.62,
      size: 0.44,
      color: FXC.gold,
      grav: 1.5,
      spread: 2.2,
      drag: 0.48,
    });
    return { added: count, members: sq.members.filter((m) => m.alive) };
  }

  _peakGateCountercharge(cit, front, keep, { radius = 38, power = 1, dur = 2.5 } = {}) {
    if (!cit?.isPalace) return 0;
    const reach = Math.max(30, Math.min(62, radius + 11));
    const towerScore = (tower) => Math.min(
      tower.pos.distanceTo(front),
      tower.pos.distanceTo(keep),
    );
    const towers = this.towers
      .filter((tower) => tower?.alive && tower.pos && (
        tower.pos.distanceTo(front) <= reach || tower.pos.distanceTo(keep) <= reach + 8
      ))
      .sort((a, b) => towerScore(a) - towerScore(b))
      .slice(0, 10);
    if (!towers.length) return 0;

    const rate = Math.max(0.24, Math.min(0.46, 0.22 + power * 0.16));
    const flashRank = Math.max(1, Math.min(3, Math.round(1 + power)));
    for (const tower of towers) {
      tower.palaceSynergyT = Math.max(tower.palaceSynergyT || 0, dur);
      tower.palaceSynergyRate = Math.max(tower.palaceSynergyRate || 0, rate);
      tower.attackCd = Math.min(tower.attackCd || 0, 0.035);
      tower.palaceCounterchargeFlash?.(power, dur);
      tower.commandFlash?.('rally', flashRank);
      const p = tower.pos.clone().setY(tower.pos.y + (tower.model?.height || 5) * 0.72);
      this.particles?.burst?.(p, 8, {
        speed: 1.9,
        up: 1.2,
        life: 0.62,
        size: 0.36,
        color: FXC.gold,
        grav: -0.1,
        spread: 1.45,
        drag: 0.52,
      });
    }
    return towers.length;
  }

  palaceGateCommandPressure(cit) {
    if (!cit?.isPalace) return { pressure: 0, count: 0, near: 0, peak: false, ready: false };
    const front = this._palaceFront(cit);
    const keep = cit.group.position;
    let count = 0;
    let near = 0;
    let weight = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dFront = e.group.position.distanceTo(front);
      const dKeep = e.group.position.distanceTo(keep);
      const pathLeft = Number.isFinite(e.path?.length) ? e.path.length - (e.dist || 0) : Infinity;
      const inGate = dFront <= 46 || dKeep <= 60 || pathLeft <= 62;
      if (!inGate) continue;
      count++;
      if (dFront <= 24 || dKeep <= 34 || pathLeft <= 32) near++;
      const proximity = Math.max(0, 1 - Math.min(dFront / 46, dKeep / 60, pathLeft / 62));
      const threat = this._palaceThreatWeight?.(e, front, keep) || (e.boss ? 2.8 : 1);
      weight += threat * (0.45 + proximity * 0.9);
    }
    const pressure = Math.max(0, Math.min(1, (this.waveActive ? 0.14 : 0) + count * 0.035 + near * 0.055 + weight * 0.07));
    return {
      pressure,
      count,
      near,
      peak: pressure >= 0.72 || near >= 6,
      ready: pressure >= 0.42 || near >= 3,
    };
  }

  _updateGatePressureOmen(dt) {
    const cit = this.map?.citadel;
    if (!cit?.isPalace || this.phase === 'won' || this.phase === 'lost') return;
    if (!this.waveActive && !this.sandbox) return;
    const omen = this._gatePressureOmen || (this._gatePressureOmen = { t: 0, lastState: '' });
    omen.t = Math.max(0, (omen.t || 0) - dt);
    const info = this.palaceGateCommandPressure(cit);
    if (!info.ready && !info.peak) {
      omen.lastState = '';
      return;
    }
    const state = info.peak ? 'peak' : 'ready';
    const cadence = info.peak ? 0.95 : 1.65;
    if (omen.t > 0 && omen.lastState === state) return;
    omen.t = cadence;
    omen.lastState = state;
    const front = this._palaceFront(cit);
    const origin = this._palaceSortieOrigin(cit, front);
    const dir = front.clone().sub(origin);
    if (dir.lengthSq() > 0.01) dir.normalize(); else dir.set(0, 0, -1);
    this._showGatePressureOmen(front, dir, {
      pressure: info.pressure,
      peak: info.peak,
      dur: info.peak ? 1.28 : 1.05,
    });
  }

  palaceGateCommand(cit, { free = false, forceFx = false, label = 'Royal Gate Command', subLabel = 'Palace defenders hold the threshold' } = {}) {
    const cfg = { cost: 135, cd: 52, radius: 38, dur: 8.5 };
    if (!cit?.isPalace) return false;
    if (!free && (cit.gateCommandCd || 0) > 0) return false;
    if (!free && !this.canAfford(cfg.cost)) { this.emit('toast', 'hud.notEnoughGold'); return false; }
    if (!free) {
      this.gold -= cfg.cost;
      cit.gateCommandCd = cfg.cd;
      this.emit('goldChanged', this.gold);
    }

    const front = this._palaceFront(cit);
    const origin = this._palaceSortieOrigin(cit, front);
    const dir = front.clone().sub(origin);
    if (dir.lengthSq() > 0.01) dir.normalize(); else dir.set(0, 0, -1);
    const keep = cit.group.position;
    const timing = this.palaceGateCommandPressure(cit);
    const timingState = timing.peak ? 'peak' : timing.ready ? 'ready' : 'wait';
    const timingBand = {
      wait: { floor: 0.28, power: 0.68, durMult: 0.72, guardMult: 0.74, radiusBonus: -7, fx: 0.72 },
      ready: { floor: 0.46, power: 1.0, durMult: 1.0, guardMult: 1.0, radiusBonus: 0, fx: 1.0 },
      peak: { floor: 0.72, power: 1.36, durMult: 0.78, guardMult: 0.86, radiusBonus: 5, fx: 1.14 },
    }[timingState];
    const pressure = Math.max(timingBand.floor, timing.pressure);
    const commandPower = pressure * timingBand.power;
    const radius = Math.max(24, cfg.radius + pressure * 7 + timingBand.radiusBonus);
    const dur = Math.max(5.2, (cfg.dur + pressure * 2.1) * timingBand.durMult);
    const enemies = this.enemies
      .filter((e) => e.alive && (e.group.position.distanceTo(front) <= radius || e.group.position.distanceTo(keep) <= radius + 14))
      .sort((a, b) => a.group.position.distanceTo(front) - b.group.position.distanceTo(front))
      .slice(0, 18);
    const gateGuard = this._ensureRoyalGateGuard(cit, front, dir, {
      pressure: Math.min(1.05, commandPower),
      dur: dur * timingBand.guardMult,
    });
    const braceResult = this._bracePalaceDefenders(front, dir, commandPower, dur, enemies[0]);
    let staggered = 0;
    for (const e of enemies) {
      const slowMult = timingState === 'peak'
        ? (e.boss ? 0.68 : 0.44)
        : timingState === 'wait'
          ? (e.boss ? 0.88 : 0.72)
          : (e.boss ? 0.76 : 0.54);
      const slowDur = Math.max(0.72, (1.7 + pressure * 0.95) * (timingState === 'peak' ? 0.84 : timingBand.durMult));
      e.reactGateLine?.(front, dir, 1.04 + commandPower * 0.42);
      e.applySlow?.(slowMult, slowDur);
      if (!e.boss) e.stunT = Math.max(e.stunT || 0, Math.max(0.12, (0.2 + pressure * 0.18) * timingBand.power));
      e.takeDamage?.((8 + pressure * 9) * timingBand.power, 'impact', { command: true, impact: 0.54 + commandPower * 0.16 });
      staggered++;
    }

    this._showGateMarker(front, dir, 10 + commandPower * 3.4 + (timing.peak ? 1.5 : 0), Math.max(3.6, (5.2 + pressure) * timingBand.durMult));
    this._showPalaceShieldLine(front, dir, {
      width: 10.2 + commandPower * 2.5 + (timing.peak ? 1.4 : 0),
      pressure: 0.72 + commandPower * 0.18,
      dur: Math.max(3.8, (5.4 + pressure) * timingBand.durMult),
    });
    this._showGateBanner(front, dir, {
      label,
      sublabel: subLabel || `${staggered} attackers staggered`,
      pressure,
      dur: Math.max(3.6, (5.2 + pressure) * timingBand.durMult),
    });
    this._showRoyalGateImpact(front, dir, enemies, { pressure: Math.min(1.25, commandPower * timingBand.fx), dur: Math.max(1.65, (2.3 + pressure * 0.42) * timingBand.durMult) });
    this.palaceStage?.signalAlarm?.({ front, keep, dir, pressure: 0.5 + commandPower * 0.24, dur: Math.max(3.2, (4.3 + pressure) * timingBand.durMult) });
    this.palaceBoonField.trigger(cit, {
      type: 'stunPulse',
      radius,
      visualRadius: Math.min(14, radius * 0.36),
      visualIntensity: 0.34,
      groundWaveIntensity: 0,
      targetVisualLimit: 4,
      anchorVisualLimit: 4,
      dur: Math.max(1.5, (2.5 + pressure) * timingBand.durMult),
    }, {
      front,
      keep,
      radius,
      enemies,
      towers: this.towers.filter((t) => t.alive && (t.pos.distanceTo(front) <= radius + 8 || t.pos.distanceTo(keep) <= radius + 8)),
    });
    const countercharge = timingState === 'peak'
      ? this._peakGateCountercharge(cit, front, keep, {
        radius,
        power: commandPower,
        dur: Math.max(2.1, Math.min(3.2, dur * 0.34)),
      })
      : 0;
    if (this.audio.palaceAlarm) this.audio.palaceAlarm();
    else this.audio.hornCall?.();
    this.engine.bloomPulse?.((forceFx ? 0.58 : 0.38) + commandPower * 0.14);
    this.engine.addShake?.(0.12 + commandPower * 0.14);
    if (forceFx) {
      this.engine.hitStop?.(timingState === 'peak' ? 0.045 : 0.024);
      this.engine.slowMo?.(timingState === 'peak' ? 0.58 : 0.7, timingState === 'peak' ? 0.34 : 0.28);
    }
    this._cameraFocusBeat(front, { dur: 0.76 + pressure * 0.15, strength: 0.12 + commandPower * 0.08, dist: 50, pitch: 0.8, yawOffset: -0.06 });
    this.palaceAssaultStatus = {
      mode: 'royal',
      count: enemies.length,
      defenders: braceResult.defenders,
      gateGuard: gateGuard.added,
      braced: braceResult.squads,
      staggered,
      pressure,
      timing: timingState,
      timingPower: commandPower,
      countercharge,
      t: dur,
      dur,
      assaultT: Math.max(3.2, (4.5 + pressure) * timingBand.durMult),
      assaultPressure: Math.min(1, commandPower),
      timingPeak: timing.peak,
    };
    this.emit('palaceCommandFx', {
      kind: 'gate',
      palace: cit,
      type: 'gateCommand',
      count: enemies.length,
      targetCount: enemies.length,
      defenders: braceResult.defenders,
      gateGuard: gateGuard.added,
      staggered,
      pressure,
      timing: timingState,
      mode: 'royal',
      countercharge,
    });
    return { count: enemies.length, mode: 'royal', defenders: braceResult.defenders, gateGuard: gateGuard.added, braced: braceResult.squads, staggered, pressure, timing: timingState, peak: timing.peak, countercharge };
  }

  _palaceTargets(cit, cfg) {
    const front = this._palaceFront(cit);
    const keep = cit.group.position;
    const radius = cfg.radius || 32;
    return {
      front,
      keep,
      radius,
      enemies: this.enemies.filter((e) => e.alive && (e.group.position.distanceTo(front) <= radius || e.group.position.distanceTo(keep) <= radius)),
      towers: this.towers.filter((t) => t.alive && (t.pos.distanceTo(front) <= radius || t.pos.distanceTo(keep) <= radius)),
    };
  }

  _allDefenderSquads() {
    return [...this.towers.flatMap((t) => t.squads), ...this.palaceSquads];
  }

  _healAllDefenders(amount) {
    for (const tw of this.towers) if (tw.alive) tw.hp = Math.min(tw.maxHp, tw.hp + tw.maxHp * amount);
    for (const sq of this._allDefenderSquads()) {
      for (const m of sq.members) if (m.alive) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * amount);
    }
  }

  // King's Boon: one stage-themed palace ability, backed by a fixed set of effect types.
  palaceBoon(cit) {
    const cfg = palaceDef(cit.placeId || this.mapDef.id).boon;
    if ((cit.boonCd || 0) > 0) return false;
    if (!this.canAfford(cfg.cost)) { this.emit('toast', 'hud.notEnoughGold'); return false; }
    this.gold -= cfg.cost;
    cit.boonCd = cfg.cd;
    const { front, keep, radius, enemies, towers } = this._palaceTargets(cit, cfg);
    const affectedTowers = towers.length ? towers : this.towers.filter((t) => t.alive);
    this.palaceBoonField.trigger(cit, cfg, { front, keep, radius, enemies, towers: affectedTowers });
    if (cfg.type === 'heal') {
      this._healAllDefenders(cfg.amount || 0.4);
      this.audio.shimmer();
    } else if (cfg.type === 'rallyDamage') {
      const dur = cfg.dur || 10;
      const bonus = cfg.amount || 0.25;
      for (const tw of affectedTowers) {
        tw.palaceDamageT = Math.max(tw.palaceDamageT || 0, dur);
        tw.palaceDamageBonus = Math.max(tw.palaceDamageBonus || 0, bonus);
        tw.attackCd = Math.min(tw.attackCd, 0.05);
      }
      for (const sq of this._allDefenderSquads()) for (const m of sq.members) if (m.alive) m.stunT = 0;
      this.audio.hornCall();
    } else if (cfg.type === 'stunPulse') {
      const dur = cfg.dur || cfg.amount || 1.2;
      for (const e of enemies) {
        e.takeDamage(16 + dur * 7, cfg.damageType || 'impact', { command: true, impact: 0.7 });
        if (!e.boss) e.stunT = Math.max(e.stunT, dur);
        else e.stunT = Math.max(e.stunT, dur * 0.4);
      }
      this.audio.mace();
      this.engine.addShake(0.25);
    } else if (cfg.type === 'burnRing') {
      const dps = cfg.amount || 10;
      const dur = cfg.dur || 4;
      for (const e of enemies) {
        e.takeDamage(dps * 0.8, cfg.damageType || 'fire', { command: true, impact: 0.45 });
        e.applyBurn(dps, dur);
      }
      this.audio.fire();
    } else if (cfg.type === 'bindChains') {
      const dur = cfg.dur || cfg.amount || 1.8;
      for (const e of enemies) {
        e.takeDamage(14 + dur * 5, cfg.damageType || 'magic', { command: true, impact: 0.55 });
        e.applyBind(dur);
        e.applyMark(0.15, dur + 3);
      }
      this.audio.chain();
    } else if (cfg.type === 'goldProvision') {
      this.gold += cfg.amount || 100;
      this.audio.coin();
    } else if (cfg.type === 'rangeVision') {
      const dur = cfg.dur || 11;
      const bonus = cfg.amount || 0.22;
      for (const tw of affectedTowers) {
        tw.palaceRangeT = Math.max(tw.palaceRangeT || 0, dur);
        tw.palaceRangeBonus = Math.max(tw.palaceRangeBonus || 0, bonus);
        tw.attackCd = Math.min(tw.attackCd, 0.05);
      }
      for (const e of this.enemies) if (e.alive && e.group.position.distanceTo(front) <= radius * 1.4) e.applyMark(0.18, dur);
      this.audio.longArrow();
    } else if (cfg.type === 'repairFortifications') {
      const amt = cfg.amount || 0.4;
      for (const tw of affectedTowers) tw.hp = Math.min(tw.maxHp, tw.hp + tw.maxHp * amt);
      for (const pad of this.map.pads) {
        if ((pad.rubbleT || 0) > 0 && (pad.pos.distanceTo(front) <= radius || pad.pos.distanceTo(keep) <= radius)) pad.rubbleT = 0;
      }
      this.audio.forgeHammer();
    }
    const synergyCount = this._palaceCommandCommitBeat(cit, front, front.clone().sub(keep), {
      type: cfg.type,
      kind: 'boon',
      radius,
      targetCount: (enemies?.length || 0) + (affectedTowers?.length || 0),
      pressure: cfg.type === 'burnRing' || cfg.type === 'stunPulse' || cfg.type === 'bindChains' ? 0.96 : 0.78,
      dur: Math.max(3.8, Math.min(6.2, cfg.dur || 4.8)),
    });
    this.emit('palaceCommand', {
      kind: 'boon',
      palace: cit,
      type: cfg.type,
      targetCount: (enemies?.length || 0) + (affectedTowers?.length || 0),
      amount: cfg.amount || 0,
      synergyCount,
    });
    this.emit('goldChanged', this.gold);
    return true;
  }

  // swap the procedural citadel for the now-loaded palace GLB, preserving placement + guard wiring
  _swapToPalace() {
    const m = this.map;
    if (!m || !m.citadel || m.citadel.isCustomPalace) return;
    const cit = buildLandCitadel(this.mapDef.id);
    if (!cit.isCustomPalace) return; // still not ready — keep the procedural citadel
    const prev = m.citadel;
    cit.musterCd = prev.musterCd || 0;
    cit.boonCd = prev.boonCd || 0;
    m.group.remove(m.citadel.group);
    cit.group.position.copy(m.exitPos);
    const s = m.paths[0].samples;
    const inDir = s[s.length - 8] || s[0];
    cit.group.rotation.y = Math.atan2(inDir.pos.x - m.exitPos.x, inDir.pos.z - m.exitPos.z);
    m.group.add(cit.group);
    m.citadel = cit;
    this.citadelGuard = new CitadelGuard(this, cit);
    this._rebuildPalaceStage();
  }

  // ---------- hero upgrade tree (persistent across battles) ----------
  heroRank(heroId) { return getHeroRank(heroId); }

  heroRankUpCost(heroId) {
    const rank = getHeroRank(heroId);
    return rank >= HERO_RANKS.length - 1 ? null : HERO_RANKS[rank + 1].cost;
  }

  upgradeHeroRank(heroDef) {
    const cost = this.heroRankUpCost(heroDef.id);
    if (cost == null) return false;
    if (!this.canAfford(cost)) { this.emit('toast', 'hud.notEnoughGold'); return false; }
    this.gold -= cost;
    setHeroRank(heroDef.id, getHeroRank(heroDef.id) + 1);
    // refresh the commanded tower so stats + garrison absorb the new rank
    const tower = this.assignedHeroes.get(heroDef.id);
    if (tower?.alive) tower.assignHero(heroDef);
    this.particles.burst(
      (tower?.pos ?? this.map.exitPos).clone().setY((tower?.pos.y ?? this.map.exitPos.y) + 3),
      24, { speed: 2.5, life: 1.0, size: 0.55, color: [1, 0.85, 0.3], grav: -0.5 },
    );
    this.audio.victory();
    this.emit('goldChanged', this.gold);
    this.emit('towersChanged');
    return true;
  }

  fuseTowers(towerA, towerB) {
    const recipe = findFusion(towerA.def.id, towerB.def.id);
    if (!recipe) return false;
    if (towerA.pos.distanceTo(towerB.pos) > recipe.maxDist) { this.emit('toast', 'hud.fuseHint'); return false; }
    if (!this.canAfford(recipe.cost)) { this.emit('toast', 'hud.notEnoughGold'); return false; }
    this.gold -= recipe.cost;
    // fused def: based on tower A's def with inherited powers
    const base = towerA.def;
    const inh = recipe.inherit;
    const fusedDef = {
      ...base,
      id: recipe.id,
      name: recipe.name, faName: recipe.faName,
      sourceRef: `${towerA.def.sourceRef ?? ''} + ${towerB.def.sourceRef ?? ''}`,
      lore: recipe.loreReason, loreFa: recipe.loreReasonFa,
      cost: towerA.invested + towerB.invested,
      damage: (base.damage || towerB.def.damage || 0) * (inh.damage || 1),
      range: (base.range || towerB.def.range || 9) * (inh.range || 1),
      rate: base.rate || towerB.def.rate || 0.8,
      splash: inh.splash ?? Math.max(base.splash || 0, towerB.def.splash || 0),
      vsBoss: inh.vsBoss ?? Math.max(base.vsBoss || 1, towerB.def.vsBoss || 1),
      vsDiv: inh.vsDiv ?? Math.max(base.vsDiv || 1, towerB.def.vsDiv || 1),
      vsFlying: inh.vsFlying ?? Math.max(base.vsFlying || 1, towerB.def.vsFlying || 1),
      pierce: inh.pierce ?? Math.max(base.pierce || 0, towerB.def.pierce || 0),
      burn: inh.burn || base.burn || towerB.def.burn,
      slow: base.slow || towerB.def.slow,
      chainSlow: inh.chainSlow || base.chainSlow || towerB.def.chainSlow,
      bind: inh.bind || base.bind || towerB.def.bind,
      heal: inh.heal || base.heal || towerB.def.heal,
      repair: base.repair || towerB.def.repair,
      income: inh.income ?? ((base.income || 0) + (towerB.def.income || 0)),
      aura: inh.aura || base.aura || towerB.def.aura,
      reveal: inh.reveal || base.reveal || towerB.def.reveal,
      garrison: inh.garrison || base.garrison || towerB.def.garrison,
      hpBonus: inh.hpBonus ?? Math.max(base.hpBonus || 1, towerB.def.hpBonus || 1),
      stunChance: inh.stunChance ?? base.stunChance,
      rolling: inh.rolling || base.rolling,
      cone: inh.cone || base.cone,
      affinity: [...new Set([...base.affinity, ...towerB.def.affinity])],
      compatHeroes: [...new Set([...(base.compatHeroes || []), ...(towerB.def.compatHeroes || [])])],
      fused: true, fusedFrom: [towerA.def.id, towerB.def.id],
    };
    const ageIdx = Math.max(towerA.ageIdx, towerB.ageIdx);
    const pad = towerA.pad;
    const heroA = towerA.hero; const heroB = towerB.hero;
    this.sellRefundless(towerA);
    this.sellRefundless(towerB);
    const fused = new Tower(this, fusedDef, pad);
    fused.ageIdx = ageIdx;
    fused._buildModel();
    fused.maxHp = fused._computeMaxHp();
    fused.hp = fused.maxHp;
    fused._spawnGarrison();
    pad.tower = fused;
    this.towers.push(fused);
    if (heroA) this.assignHero(heroA, fused);
    else if (heroB) this.assignHero(heroB, fused);
    this.particles.burst(pad.pos.clone().setY(pad.pos.y + 2), 36, { speed: 3.5, life: 1.2, size: 0.6, color: [1, 0.85, 0.3], grav: 1 });
    this.audio.victory();
    this.engine.addShake(0.2);
    this.emit('goldChanged', this.gold);
    this.emit('towersChanged');
    return true;
  }

  sellRefundless(tower) {
    tower.pad.tower = null;
    tower.alive = false;
    tower.destroy();
    this.towers = this.towers.filter((t) => t !== tower);
    if (tower.hero) this.assignedHeroes.delete(tower.hero.id);
  }

  _bossChallengeEnemy(ch = this.bossChallenge) {
    return ch ? this.enemies.find((e) => e.id === ch.enemyId) : null;
  }

  _isEliteEnemy(enemy) {
    if (!enemy?.alive || enemy.boss || enemy.isLarva) return false;
    if ((enemy.def?.bounty || 0) >= 80) return true;
    const eliteAbilities = new Set([
      'divRally',
      'rampage',
      'dynasticBanner',
      'duelistParry',
      'banneredAdvance',
      'princelyWrath',
      'ironSkin',
      'jealousVeil',
      'feudFury',
    ]);
    return (enemy.def?.abilities || []).some((ability) => eliteAbilities.has(ability));
  }

  _palaceApproach(cit = this.map.citadel) {
    const front = this._palaceFront(cit);
    const keep = cit?.group?.position || this.map.exitPos || front;
    const dir = front.clone().sub(keep);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    return { cit, front, keep, dir };
  }

  _rebuildPalaceStage() {
    if (!this.palaceStage || !this.map?.citadel) return;
    this.palaceStage.rebuild(this._palaceApproach(this.map.citadel));
  }

  _palaceThreatWeight(enemy, front, keep) {
    if (!enemy?.alive || enemy.isLarva) return 0;
    const elite = enemy.boss || this._isEliteEnemy(enemy);
    if (!elite) return 0;
    const p = enemy.group.position;
    const dFront = p.distanceTo(front);
    const dKeep = p.distanceTo(keep);
    const pathLeft = Number.isFinite(enemy.path?.length) ? enemy.path.length - (enemy.dist || 0) : Infinity;
    const inApproach = dFront <= 34 || dKeep <= 46 || pathLeft <= 48;
    if (!inApproach) return 0;
    let base = enemy.boss ? 3.0 : 1.15 + Math.min(1.1, (enemy.def?.bounty || 0) / 150);
    const ab = enemy.def?.abilities || [];
    if (ab.includes('siegeHorns') || ab.includes('rampage') || ab.includes('ironSkin')) base += 0.35;
    if (ab.includes('banneredAdvance') || ab.includes('dynasticBanner') || ab.includes('princelyWrath')) base += 0.25;
    const proximity = Math.max(
      0,
      1 - Math.min(dFront / 34, dKeep / 46, pathLeft / 48),
    );
    return base * (0.55 + proximity * 0.75);
  }

  _bracePalaceDefenders(front, dir, pressure, dur = 1.15, focus = null) {
    const radius = 8.2 + pressure * 3.2;
    const mult = 1.12 + pressure * 0.24;
    let braced = 0;
    const bracedMembers = [];
    for (const sq of this._allDefenderSquads()) {
      const alive = sq.members.filter((m) => m.alive);
      if (!alive.length) continue;
      const nearFront = alive.some((m) => m.group.position.distanceTo(front) <= 30);
      const palaceSquad = sq.tower?.isPalaceMuster || sq.palaceStandAnchor;
      const towerNear = sq.tower?.pos?.distanceTo?.(front) <= 42;
      if (!palaceSquad && !nearFront && !towerNear) continue;
      sq.gateLineT = Math.max(sq.gateLineT || 0, dur);
      sq.gateLineDur = Math.max(sq.gateLineDur || 0, dur);
      sq.gateLineAnchor = front.clone();
      sq.gateLineDir = dir.clone();
      sq.gateLineRadius = Math.max(sq.gateLineRadius || 0, radius);
      sq.gateLineWidth = Math.max(sq.gateLineWidth || 0, Math.max(6, radius * 1.18));
      sq.gateLineMult = Math.max(sq.gateLineMult || 1, mult);
      sq.triggerGateBrace?.(front, { dur: Math.min(0.95, Math.max(0.58, dur * 0.16)), power: 0.85 + pressure * 0.38 });
      if (sq.palaceStandAnchor) {
        sq.palaceStandDepth = Math.max(sq.palaceStandDepth || 0, 0.55 + pressure * 0.62);
        sq.palaceStandSpread = Math.max(sq.palaceStandSpread || 1, 1.02 + pressure * 0.12);
        sq.palaceStandWidth = Math.max(sq.palaceStandWidth || 0, 10 + pressure * 4.2);
        if (focus?.alive) {
          sq.palaceEngageT = Math.max(sq.palaceEngageT || 0, Math.min(1.1, dur));
          sq.palaceEngageDur = Math.max(sq.palaceEngageDur || 0, sq.palaceEngageT);
          sq.palaceEngagePower = Math.max(sq.palaceEngagePower || 0, 0.92 + pressure * 0.18);
          sq.palaceEngagePoint = focus.group.position.clone();
        }
      }
      for (const m of alive) {
        m.fearT = Math.min(m.fearT || 0, 0.2);
        if (m.group.position.distanceTo(front) <= 34) {
          m.sortieT = Math.max(m.sortieT || 0, m.model?.mounted ? 1.4 : 1.05);
          m.gateReadT = Math.max(m.gateReadT || 0, m.model?.mounted ? 0.82 : 0.95);
        }
        if (focus?.alive && m.group.position.distanceTo(focus.group.position) <= 18) m.target = focus;
      }
      bracedMembers.push(...alive);
      braced++;
    }
    const now = this._time || 0;
    if (bracedMembers.length && now - (this._lastDefenderHoldFormation || -99) > 0.48) {
      this._lastDefenderHoldFormation = now;
      this._showDefenderHoldFormation(front, dir, bracedMembers, {
        pressure,
        dur: Math.min(4.4, Math.max(1.8, dur * 0.42)),
      });
    }
    return { squads: braced, defenders: bracedMembers.length };
  }

  _palaceDangerAlarm(enemy, approach, weight, time) {
    if (enemy._palaceDangerSeen) return;
    enemy._palaceDangerSeen = true;
    const pressure = Math.max(0.35, Math.min(1, weight / 3.2));
    const { cit, front, keep, dir } = approach;
    const now = this._time || time || 0;
    const radius = 8.5 + pressure * 4.5;
    this._bracePalaceDefenders(front, dir, pressure, 4.2 + pressure * 1.6, enemy);
    const showDangerBeat = enemy.boss || now - (this._lastPalaceDangerBeatFx || -99) > 1.35;
    if (showDangerBeat) {
      this._lastPalaceDangerBeatFx = now;
      this._showAssaultColumn(enemy.path, enemy.dist || 0, enemy.boss ? 5 : 3, dir, 3.4 + pressure * 1.2);
      this._showGateMarker(front, dir, radius, 4.6);
      this._showPalaceShieldLine(front, dir, { width: Math.max(8.2, radius * 1.05), pressure, dur: 4.2 });
      this.palaceStage?.signalAlarm?.({ front, keep, dir, pressure: pressure * 0.72, dur: 3.2 + pressure * 0.9 });
    }
    const fieldCadence = enemy.boss ? 0.35 : 0.85;
    if (now - (this._lastPalaceDangerFieldFx || -99) > fieldCadence) {
      this._lastPalaceDangerFieldFx = now;
      const fxRadius = 30 + pressure * 12;
      this.palaceBoonField.trigger(cit, {
        type: 'rallyDamage',
        radius: fxRadius,
        visualRadius: Math.min(10, 6 + pressure * 3.5),
        visualIntensity: 0.16,
        commandIntensity: 0.14,
        threadIntensity: 0.1,
        rayIntensity: 0.06,
        groundWaveIntensity: 0,
        targetVisualLimit: 1,
        anchorVisualLimit: 1,
        dur: 4,
      }, {
        front,
        keep,
        radius: fxRadius,
        enemies: [enemy],
        towers: this.towers.filter((t) => t.alive && t.pos.distanceTo(front) <= 42),
      });
    }
    enemy.applyMark(0.12 + pressure * 0.08, 4.5);
    if (showDangerBeat) {
      this.particles.burst(front.clone().setY(front.y + 1.5), 12 + Math.round(pressure * 10), {
        speed: 2.1 + pressure * 0.7,
        up: 1.1,
        life: 0.62,
        size: 0.38,
        color: enemy.boss ? FXC.blood : FXC.gold,
        grav: 0.5,
        spread: 2.6,
        drag: 0.45,
      });
      this.engine.addShake?.(enemy.boss ? 0.34 : 0.12 + pressure * 0.08);
      this.engine.bloomPulse?.(0.18 + pressure * 0.14);
    }
    if (time - (this._palaceDanger.hornT || -99) > 2.0) {
      this._palaceDanger.hornT = time;
      if (this.audio.palaceAlarm) this.audio.palaceAlarm();
      else this.audio.hornCall();
    }
    this.emit('palaceDanger', { enemy, pressure, front });
  }

  _updatePalaceDanger(dt, time) {
    const cit = this.map.citadel;
    if (!cit || this.phase !== 'combat' || !this.waveActive) {
      if (this._palaceDanger) this._palaceDanger.pressure = 0;
      return;
    }
    const approach = this._palaceApproach(cit);
    const threats = [];
    let pressureSum = 0;
    for (const enemy of this.enemies) {
      const weight = this._palaceThreatWeight(enemy, approach.front, approach.keep);
      if (weight <= 0) continue;
      pressureSum += weight;
      threats.push({ enemy, weight });
      this._palaceDangerAlarm(enemy, approach, weight, time);
    }
    if (!threats.length) {
      this._palaceDanger.pressure = Math.max(0, (this._palaceDanger.pressure || 0) - dt * 1.5);
      this._palaceDanger.pulseT = 0;
      return;
    }
    threats.sort((a, b) => b.weight - a.weight);
    const pressure = Math.max(0.25, Math.min(1, pressureSum / 5.2));
    this._palaceDanger.pressure = pressure;
    this._bracePalaceDefenders(approach.front, approach.dir, pressure, 1.0 + pressure * 0.6, threats[0].enemy);
    this._palaceDanger.pulseT -= dt;
    this._palaceDanger.fxT -= dt;
    if (this._palaceDanger.pulseT <= 0) {
      this._palaceDanger.pulseT = Math.max(0.72, 1.75 - pressure * 0.8);
      this.particles.burst(approach.front.clone().setY(approach.front.y + 1.2), 8 + Math.round(pressure * 10), {
        speed: 1.8 + pressure * 1.4,
        up: 1.1,
        life: 0.66,
        size: 0.42,
        color: FXC.gold,
        grav: 0.35,
        spread: 2.6 + pressure * 1.4,
        drag: 0.5,
      });
      this.engine.addShake?.(0.035 + pressure * 0.08);
      if (time - (this._palaceDanger.markerT || -99) > 2.6) {
        this._palaceDanger.markerT = time;
        this._showGateMarker(approach.front, approach.dir, 7.5 + pressure * 3.8, 1.45);
      }
    }
    if (this._palaceDanger.fxT <= 0) {
      this._palaceDanger.fxT = 3.2;
      const fxRadius = 26 + pressure * 14;
      this.palaceBoonField.trigger(approach.cit, {
        type: 'repairFortifications',
        radius: fxRadius,
        visualRadius: Math.min(11, 7 + pressure * 3),
        visualIntensity: 0.18,
        commandIntensity: 0.16,
        threadIntensity: 0.1,
        rayIntensity: 0.06,
        groundWaveIntensity: 0,
        targetVisualLimit: 1,
        anchorVisualLimit: 1,
        dur: 2.4,
      }, {
        front: approach.front,
        keep: approach.keep,
        radius: fxRadius,
        enemies: threats.map((t) => t.enemy).slice(0, 4),
        towers: this.towers.filter((t) => t.alive && t.pos.distanceTo(approach.front) <= 44),
      });
      if (time - (this._palaceDanger.hornT || -99) > 4.0) {
        this._palaceDanger.hornT = time;
        this.audio.hornCall();
      }
    }
  }

  _bossChallengeView(ch = this.bossChallenge) {
    if (!ch) return null;
    const enemy = this._bossChallengeEnemy(ch);
    const def = enemy?.def || ENEMIES_BY_ID[ch.defId];
    const needed = Math.max(1, ch.startHp - ch.targetHp);
    const progress = enemy ? Math.max(0, Math.min(1, (ch.startHp - enemy.hp) / needed)) : 1;
    return {
      def,
      defId: ch.defId,
      titleKey: ch.titleKey,
      loreKey: ch.loreKey,
      t: Math.max(0, ch.t),
      dur: ch.dur,
      progress,
      hpFrac: ch.hpFrac,
      rewardFarr: ch.rewardFarr,
      rewardGold: ch.rewardGold,
      failType: ch.failType,
      successType: ch.successType,
      saga: ch.saga,
    };
  }

  _bossChallengePressure(ch = this.bossChallenge) {
    if (!ch) return 0;
    const enemy = this._bossChallengeEnemy(ch);
    if (!enemy?.alive) return 0;
    const needed = Math.max(1, ch.startHp - ch.targetHp);
    const progress = Math.max(0, Math.min(1, (ch.startHp - enemy.hp) / needed));
    const timePressure = 1 - Math.max(0, Math.min(1, (ch.t || 0) / Math.max(1, ch.dur || 1)));
    const unbroken = 1 - progress;
    const bossWeight = enemy.boss ? 0.18 : 0.1;
    return Math.max(0, Math.min(0.88, bossWeight + timePressure * 0.42 + unbroken * 0.2));
  }

  _bossHpBucket(enemy) {
    const hpFrac = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
    if (hpFrac <= 0.15) return 0;
    if (hpFrac <= 0.33) return 1;
    if (hpFrac <= 0.66) return 2;
    return 3;
  }

  _updateBossPhaseReactions() {
    for (const enemy of this.enemies) {
      if (!enemy?.alive || !enemy.boss) continue;
      const bucket = this._bossHpBucket(enemy);
      if (enemy._bossHpBucket == null) {
        enemy._bossHpBucket = bucket;
        continue;
      }
      if (bucket >= enemy._bossHpBucket) continue;
      enemy._bossHpBucket = bucket;
      const hpFrac = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
      this.bossOmen.phase?.(enemy, bucket, hpFrac);
      this.engine.bloomPulse?.(bucket <= 0 ? 1.0 : bucket === 1 ? 0.82 : 0.62);
      this.engine.addShake?.(bucket <= 0 ? 0.65 : bucket === 1 ? 0.45 : 0.28);
      this.engine.hitStop?.(bucket <= 1 ? 0.04 : 0.025);
      if (bucket <= 1) {
        this.audio.roar?.();
        this._cameraFocusBeat(enemy.group.position, { dur: bucket <= 0 ? 1.15 : 0.9, strength: bucket <= 0 ? 0.36 : 0.28, dist: bucket <= 0 ? 45 : 52, pitch: 0.76, yawOffset: 0.08 });
      }
    }
  }

  _startBossChallenge(enemy) {
    if (!enemy?.alive || this.bossChallenge) return;
    const cfg = bossChallengeDef(enemy.def.id);
    this.bossChallenge = {
      ...cfg,
      defId: enemy.def.id,
      enemyId: enemy.id,
      t: cfg.dur,
      startHp: enemy.hp,
      targetHp: Math.max(1, enemy.hp * (1 - cfg.hpFrac)),
      emitT: 0,
    };
    this.bossOmen.start(enemy, this.bossChallenge);
    this.emit('bossChallengeStarted', this._bossChallengeView());
  }

  _completeBossChallenge(enemy = this._bossChallengeEnemy()) {
    const ch = this.bossChallenge;
    if (!ch) return;
    const view = this._bossChallengeView(ch);
    this.bossChallenge = null;
    this.gold += ch.rewardGold || 0;
    this.emit('goldChanged', this.gold);
    this.addFarr(ch.rewardFarr || 0, 'bossChallenge');
    recordBossSaga(ch.defId, this.mapDef.id, 'broken');
    if (enemy?.alive) {
      this.bossOmen.success(enemy, ch.successType);
      enemy.applyMark(0.28, 8);
      enemy.applySlow(0.68, 4.5);
      this._applyBossChallengeSuccess(enemy, ch);
      enemy.takeDamage(Math.min(160, enemy.maxHp * 0.035), 'true');
      this._cameraFocusBeat(enemy.group.position, { dur: 0.95, strength: 0.25, dist: 55, pitch: 0.82, yawOffset: -0.05 });
      this.particles.burst(enemy.group.position.clone().setY(enemy.group.position.y + 2), 28, {
        speed: 3.2, up: 2.2, life: 0.9, size: 0.55, color: FXC.gold, grav: 1.2, spread: 2.6,
      });
    } else {
      this.bossOmen.clear();
    }
    this.engine.bloomPulse(0.55);
    this.audio.shimmer();
    this.emit('bossChallengeCompleted', view);
    saveBattle(this);
  }

  _failBossChallenge(enemy = this._bossChallengeEnemy()) {
    const ch = this.bossChallenge;
    if (!ch) return;
    const view = this._bossChallengeView(ch);
    this.bossChallenge = null;
    recordBossSaga(ch.defId, this.mapDef.id, 'hardened');
    if (enemy?.alive) {
      this.bossOmen.failure(enemy, ch.failType);
      enemy.buffSpeed *= ch.failSpeed || 1.08;
      enemy.buffDamage *= ch.failDamage || 1.12;
      enemy.applySlow(0.88, 1.2);
      this._applyBossChallengeFailure(enemy, ch);
      this.particles.burst(enemy.group.position.clone().setY(enemy.group.position.y + 2), 22, {
        speed: 2.8, up: 1.8, life: 0.8, size: 0.5, color: FXC.shadow, grav: 0.9, spread: 2.4,
      });
      this._cameraFocusBeat(enemy.group.position, { dur: 1.05, strength: 0.34, dist: 48, pitch: 0.76, yawOffset: 0.08 });
      this.engine.addShake(0.35);
      this.audio.roar();
    } else {
      this.bossOmen.clear();
    }
    this.emit('bossChallengeFailed', view);
    saveBattle(this);
  }

  _applyBossChallengeSuccess(enemy, ch) {
    const type = ch.successType || 'mark';
    const p = enemy.group.position;
    const near = this._bossFailureFront(enemy, 18);
    if (type === 'antiTyrantChains') {
      enemy.fogBrokenT = Math.max(enemy.fogBrokenT, 10);
      enemy.applyBind(4.2);
      enemy.applyMark(0.36, 10);
      for (const e of this.enemies) if (e.alive && e.def.id === 'zahhak-serpents') { e.stunT = Math.max(e.stunT, 1.4); e.applySlow(0.55, 6); }
      this.audio.chain();
      this.particles.burst(p, 24, { speed: 2.8, up: 2.0, life: 1.0, size: 0.55, color: FXC.chain, grav: 0.4, spread: 3.2 });
    } else if (type === 'clearFog') {
      enemy.fogBrokenT = Math.max(enemy.fogBrokenT, 11);
      enemy.stunT = Math.max(enemy.stunT, 0.9);
      for (const t of near.towers.length ? near.towers : this.towers) {
        if (!t.alive) continue;
        t.palaceRangeT = Math.max(t.palaceRangeT || 0, 8);
        t.palaceRangeBonus = Math.max(t.palaceRangeBonus || 0, 0.14);
      }
      this.particles.burst(p, 28, { speed: 2.2, up: 2.0, life: 1.1, size: 0.6, color: FXC.sacred, grav: -0.4, spread: 4.5 });
    } else if (type === 'rakhshWarning') {
      enemy.untargetableT = 0;
      enemy.applySlow(0.55, 6);
      enemy.applyMark(0.32, 9);
      enemy.dist = Math.max(0, enemy.dist - 2.5);
      this.particles.burst(p, 22, { speed: 3.2, up: 1.7, life: 0.9, size: 0.55, color: FXC.gold, grav: 0.5, spread: 3.5 });
    } else if (type === 'silenceSiege') {
      enemy.siegeSilencedT = Math.max(enemy.siegeSilencedT, 12);
      enemy.stunT = Math.max(enemy.stunT, 1.0);
      for (const t of near.towers) t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.08);
      this.particles.burst(p, 22, { speed: 2.6, up: 1.6, life: 0.9, size: 0.5, color: FXC.gold, grav: 0.6, spread: 3 });
    } else if (type === 'crackIron') {
      enemy.armor = Math.max(0, enemy.armor - 0.16);
      enemy.shieldNext = 0;
      enemy.applyMark(0.32, 9);
      this.particles.burst(p, 26, { speed: 3.0, up: 1.3, life: 0.8, size: 0.55, color: FXC.spark, grav: 1.4, spread: 3 });
    } else if (type === 'cutBrood') {
      enemy.broodSilencedT = Math.max(enemy.broodSilencedT, 13);
      for (const e of this.enemies) if (e.alive && e.isLarva && e.def.id === enemy.def.id) e.takeDamage(e.maxHp, 'true');
      enemy.applySlow(0.62, 6);
      this.particles.burst(p, 22, { speed: 2.8, up: 1.4, life: 0.9, size: 0.55, color: FXC.venom, grav: 1.0, spread: 3.5 });
    } else if (type === 'unmaskCounsel' || type === 'unmaskTrail') {
      enemy.counselBrokenT = Math.max(enemy.counselBrokenT, 12);
      for (const s of near.soldiers) s.fearT = 0;
      for (const t of near.towers) { t.silencedT = 0; t.garrisonDisabledT = Math.min(t.garrisonDisabledT, 0.5); }
      enemy.applyMark(0.34, 9);
      this.particles.burst(p, 22, { speed: 2.4, up: 1.8, life: 0.9, size: 0.5, color: FXC.sacred, grav: 0.2, spread: 3 });
    } else if (type === 'breakGuard' || type === 'breakBanner' || type === 'breakCavalry' || type === 'breakRoyalGuard') {
      enemy.guardBrokenT = Math.max(enemy.guardBrokenT, type === 'breakRoyalGuard' ? 12 : 9);
      for (const e of near.enemies) {
        if (e.def.class !== 'human') continue;
        e.applySlow(0.72, 5);
        e.takeDamage(22, 'true');
      }
      enemy.applySlow(0.66, 5.5);
      this.particles.burst(p, 24, { speed: 2.8, up: 1.8, life: 0.9, size: 0.52, color: FXC.gold, grav: 0.5, spread: 3.2 });
    } else if (type === 'coolWrath') {
      enemy.wrathStacks = 0;
      enemy.buffSpeed = Math.min(enemy.buffSpeed, 1.08);
      enemy.buffDamage = Math.min(enemy.buffDamage, 1.08);
      enemy.applySlow(0.62, 6);
      this.particles.burst(p, 20, { speed: 2.3, up: 1.8, life: 0.9, size: 0.5, color: FXC.sacred, grav: 0.2, spread: 3 });
    } else if (type === 'settleFeud' || type === 'pierceJealousy') {
      const siblingId = enemy.def.id === 'tur' ? 'salm' : 'tur';
      const sibling = this.enemies.find((e) => e.alive && e.def.id === siblingId);
      enemy.feudBrokenT = Math.max(enemy.feudBrokenT, 12);
      if (sibling) sibling.feudBrokenT = Math.max(sibling.feudBrokenT, 12);
      if (type === 'pierceJealousy') enemy.armor = Math.max(0, enemy.armor - 0.08);
      enemy.applyMark(0.32, 9);
      this.particles.burst(p, 22, { speed: 2.5, up: 1.7, life: 0.9, size: 0.52, color: FXC.gold, grav: 0.4, spread: 3 });
    }
  }

  _spawnEnemyNear(defId, anchor, count = 1, { isLarva = false, boss = false, gap = 1.2 } = {}) {
    const def = ENEMIES_BY_ID[defId];
    if (!def || !anchor || this.enemies.length > 86) return [];
    const out = [];
    for (let i = 0; i < count && this.enemies.length < 90; i++) {
      const e = new Enemy(this, def, anchor.pathIndex || 0, this.waveHpMult, isLarva, { forceBoss: boss });
      e.dist = Math.max(0, anchor.dist - gap * (i + 1));
      e.laneOffset += (i - (count - 1) / 2) * 0.85;
      this.enemies.push(e);
      out.push(e);
    }
    return out;
  }

  _bossFailureFront(enemy, radius = 15) {
    const p = enemy.group.position;
    return {
      towers: this.towers.filter((t) => t.alive && t.pos.distanceTo(p) <= radius),
      soldiers: this.allSoldiers().filter((s) => s.alive && s.group.position.distanceTo(p) <= radius),
      enemies: this.enemies.filter((e) => e.alive && e !== enemy && e.group.position.distanceTo(p) <= radius),
    };
  }

  _applyBossChallengeFailure(enemy, ch) {
    const p = enemy.group.position;
    const near = this._bossFailureFront(enemy, 16);
    const type = ch.failType || 'surge';
    if (type === 'serpentFeed') {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * 0.1);
      this._spawnEnemyNear('zahhak-serpents', enemy, 2, { gap: 1.4 });
      this.particles.burst(p, 18, { speed: 2, up: 1.4, life: 0.9, size: 0.5, color: FXC.venom, grav: 0.5, spread: 2.5 });
    } else if (type === 'whiteFog') {
      for (const t of near.towers) t.silencedT = Math.max(t.silencedT, 2.8);
      for (const s of near.soldiers) s.fearT = Math.max(s.fearT, 2.0);
      this.particles.burst(p, 30, { speed: 2.4, up: 1.2, life: 1.2, size: 0.75, color: FXC.snow, grav: -0.2, spread: 5 });
    } else if (type === 'dragonBurrow') {
      enemy.untargetableT = Math.max(enemy.untargetableT, 1.2);
      enemy.dist = Math.min(enemy.path.length - 2, enemy.dist + 5);
      for (const s of near.soldiers) s.takeDamage(18, 'fire');
      this.particles.burst(p, 22, { speed: 4, up: 1.0, life: 0.8, size: 0.7, color: FXC.ember, grav: 2, spread: 4 });
    } else if (type === 'visehGuard' || type === 'royalGuard') {
      this._spawnEnemyNear('barman', enemy, type === 'royalGuard' ? 3 : 2, { gap: 1.1 });
      for (const e of near.enemies) if (e.def.class === 'human') e.buffSpeed = Math.max(e.buffSpeed, 1.18);
      this.particles.burst(p, 18, { speed: 2.4, up: 1.8, life: 0.8, size: 0.5, color: FXC.gold, grav: 0.4, spread: 3 });
      if (type === 'royalGuard') enemy.untargetableT = Math.max(enemy.untargetableT, 0.7);
    } else if (type === 'bannerAdvance') {
      for (const e of near.enemies) {
        if (e.dist <= enemy.dist) {
          e.buffSpeed = Math.max(e.buffSpeed, 1.28);
          e.roadShield = Math.max(e.roadShield || 0, 0.45);
        }
      }
      this.particles.burst(p, 16, { speed: 2.6, up: 2.0, life: 0.8, size: 0.45, color: FXC.gold, grav: 0.2, spread: 2.8 });
    } else if (type === 'falseCounsel' || type === 'falseTrail') {
      for (const s of near.soldiers) s.fearT = Math.max(s.fearT, type === 'falseTrail' ? 3.0 : 2.2);
      for (const t of near.towers.filter((tw) => tw.hero)) t.silencedT = Math.max(t.silencedT, 2.0);
      if (type === 'falseTrail') {
        for (const t of near.towers.filter((tw) => tw.squads.length)) t.garrisonDisabledT = Math.max(t.garrisonDisabledT, 3.0);
      }
      this.particles.burst(p, 18, { speed: 2.2, up: 1.3, life: 0.9, size: 0.5, color: FXC.shadow, grav: 0.3, spread: 3 });
    } else if (type === 'princelyWrath') {
      enemy.wrathStacks = (enemy.wrathStacks || 0) + 3;
      enemy.buffSpeed = Math.max(enemy.buffSpeed, 1.45);
      enemy.buffDamage = Math.max(enemy.buffDamage, 1.45);
      for (const e of near.enemies) if (e.def.class === 'human') e.buffDamage = Math.max(e.buffDamage, 1.2);
      this.particles.burst(p, 18, { speed: 3.2, up: 1.8, life: 0.8, size: 0.55, color: FXC.blood, grav: 0.6, spread: 3 });
    } else if (type === 'siegeHorns') {
      for (const t of near.towers) {
        t.takeDamage(28);
        t.disabledT = Math.max(t.disabledT, 1.4);
      }
      this.engine.addShake(0.45);
      this.particles.burst(p, 20, { speed: 2.8, up: 1.3, life: 0.8, size: 0.55, color: FXC.dust, grav: 1, spread: 3.5 });
    } else if (type === 'ironHide') {
      enemy.armor = Math.min(0.95, enemy.armor + 0.12);
      enemy.shieldNext = Math.max(enemy.shieldNext || 0, 2);
      this.particles.burst(p, 20, { speed: 2.2, up: 1.3, life: 0.9, size: 0.5, color: FXC.chain, grav: 0.5, spread: 2.5 });
    } else if (type === 'wormBrood') {
      enemy.maxHp *= 1.04;
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * 0.08);
      this._spawnEnemyNear(enemy.def.id, enemy, 3, { isLarva: true, gap: 1.0 });
      this.particles.burst(p, 20, { speed: 2.5, up: 1.2, life: 0.9, size: 0.55, color: FXC.venom, grav: 1, spread: 3 });
    } else if (type === 'cavalryOath') {
      this._spawnEnemyNear('barman', enemy, 3, { gap: 1.0 });
      for (const e of near.enemies) if (e.def.class === 'human') e.buffSpeed = Math.max(e.buffSpeed, 1.24);
      this.particles.burst(p, 20, { speed: 3.0, up: 1.6, life: 0.8, size: 0.5, color: FXC.dust, grav: 1, spread: 3.5 });
    } else if (type === 'bloodFeud' || type === 'jealousVeil') {
      const siblingId = enemy.def.id === 'tur' ? 'salm' : 'tur';
      const sibling = this.enemies.find((e) => e.alive && e.def.id === siblingId);
      const target = sibling || enemy;
      target.buffSpeed = Math.max(target.buffSpeed, 1.35);
      target.buffDamage = Math.max(target.buffDamage, 1.45);
      if (type === 'jealousVeil') target.armor = Math.min(0.9, target.armor + 0.08);
      this.particles.burst(target.group.position, 18, { speed: 2.8, up: 1.8, life: 0.8, size: 0.52, color: FXC.blood, grav: 0.5, spread: 2.8 });
    }
  }

  _clearBossChallenge() {
    if (!this.bossChallenge) return;
    this.bossChallenge = null;
    this.bossOmen.clear();
    this.emit('bossChallengeCleared');
  }

  _updateBossChallenge(dt) {
    const ch = this.bossChallenge;
    if (!ch) return;
    const enemy = this._bossChallengeEnemy(ch);
    if (!enemy || !enemy.alive) { this._completeBossChallenge(enemy); return; }
    if (enemy.hp <= ch.targetHp) { this._completeBossChallenge(enemy); return; }
    ch.t -= dt;
    if (ch.t <= 0) { this._failBossChallenge(enemy); return; }
    ch.emitT = (ch.emitT || 0) - dt;
    if (ch.emitT <= 0) {
      ch.emitT = 0.12;
      this.emit('bossChallengeUpdated', this._bossChallengeView(ch));
    }
  }

  // ---------- waves ----------
  earlyBonus() { return Math.max(0, Math.round(this.waveCountdown)) * this.earlyGoldPerSec; }

  startWave(manual = false) {
    if (this.waveActive || this.phase === 'won' || this.phase === 'lost') return;
    // early-call reward: clicking before the auto-timer expires pays a bonus
    if (manual && this.waveCountdown > 0.1) {
      const bonus = this.earlyBonus();
      if (bonus > 0) {
        this.gold += bonus;
        this.emit('goldChanged', this.gold);
        this.emit('earlyBonus', bonus);
        this.addFarr(Math.min(12, Math.max(2, Math.round(bonus / 20))), 'early');
        this.particles.burst(this.map.exitPos.clone().setY(this.map.exitPos.y + 3), 18, { speed: 2, life: 0.9, size: 0.5, color: [1, 0.85, 0.3], grav: -0.5 });
        this.audio.coin();
      }
    }
    this.waveCountdown = 0;
    this.waveIdx++;
    const wave = makeWave(this.mapDef, this.waveIdx, this.endlessMode || this.waveIdx > this.mapDef.waves);
    this.waveHpMult = wave.hpMult;
    this.waveMod = wave.modifier; // null, or { id, icon, speedMult?, armorAdd?, bountyMult?, ... }
    this.spawnQueue = wave.entries.map((e) => ({ ...e }));
    this.waveT = 0;
    this.waveActive = true;
    this.phase = 'combat';
    this._waveStartLives = this.lives;
    for (const t of this.towers) { t.borderArrowUsed = false; t.brazenUsed = false; t.rebuildUsed = false; }
    this.emit('waveStarted', { wave: this.waveIdx, boss: wave.isBossWave, mod: wave.modifier });
    if (wave.isBossWave) { this.audio.bossCue(); this.audio.bossSwell?.(); this.emit('toast', 'hud.bossIncoming'); }
    this.audio.setIntensity(wave.isBossWave ? 1 : Math.min(0.85, 0.3 + this.waveIdx * 0.05));
    saveBattle(this); // checkpoint the start of the wave
  }

  onEnemyKilled(enemy) {
    let bounty = enemy.isLarva ? 4 : enemy.def.bounty;
    // royalFarr: Jamshid's towers enrich nearby kills
    for (const t of this.towers) {
      if (t.alive && t.hero?.special.key === 'royalFarr' && t.pos.distanceTo(enemy.group.position) < t.getStats().range * 1.4) {
        bounty = Math.round(bounty * 1.3);
        break;
      }
    }
    if (this.waveMod?.bountyMult) bounty = Math.round(bounty * this.waveMod.bountyMult);
    this.gold += bounty;
    this.audio.coin();
    this.emit('goldChanged', this.gold);
    this.emit('enemyKilled', enemy);
    this.addFarr(enemy.boss ? 22 : enemy.def.bounty >= 55 ? 3 : 1, enemy.boss ? 'bossKill' : 'kill');
    if (this.bossChallenge?.enemyId === enemy.id) this._completeBossChallenge(enemy);
    if (enemy.boss) recordBossSaga(enemy.def.id, this.mapDef.id, 'defeated');
  }

  onEnemyReachedEnd(enemy) {
    if (this.bossChallenge?.enemyId === enemy.id) this._failBossChallenge(enemy);
    if (this.sandbox) { this.engine.addShake(0.15); return; } // invulnerable while testing
    this.lives -= enemy.boss ? 3 : 1;
    this.engine.addShake(0.3);
    this.audio.defeat();
    this.emit('livesChanged', this.lives);
    if (this.lives <= 0 && this.phase !== 'lost') {
      this.phase = 'lost';
      this.audio.setIntensity(0);
      this.audio.defeatSwell?.();
      this.bossOmen.finale?.('defeat', enemy.group.position);
      // defeat lands hard: time crawls, the screen heaves, the bloom flares
      this.engine.slowMo(0.25, 1.8);
      this.engine.addShake(1.6);
      this.engine.bloomPulse(0.9);
      this._cameraFocusBeat(enemy.group.position, { dur: 1.75, strength: 0.5, dist: 44, pitch: 0.72, yawOffset: 0.12 });
      clearBattle(); // defeat — no resume; retry starts fresh
      this.emit('defeat');
    }
  }

  toggleSandbox() {
    this.sandbox = !this.sandbox;
    if (this.sandbox) {
      this.gold = 999999;
      // unlock the whole hero roster on the fly
      for (const h of HEROES) if (!this.heroRoster.includes(h)) this.heroRoster.push(h);
      this.emit('goldChanged', this.gold);
      this.emit('towersChanged'); // refresh hero cards
    }
    return this.sandbox;
  }

  onTowerDestroyed(tower) {
    if (tower.hero) this.assignedHeroes.delete(tower.hero.id);
    this.towers = this.towers.filter((t) => t !== tower);
    this.emit('towersChanged');
  }

  onSoldierDied(soldier) {
    // innocentBlood: Iraj — defenders gain fury when soldiers fall
    for (const t of this.towers) {
      if (t.alive && t.hero?.special.key === 'innocentBlood' && t.pos.distanceTo(soldier.group.position) < 14) {
        t.attackCd = Math.min(t.attackCd, 0.05);
      }
    }
  }

  _endWave() {
    this.waveActive = false;
    this.phase = 'build';
    this._clearBossChallenge();
    // income from economy towers + base wave reward
    let income = 25 + this.waveIdx * 4;
    for (const t of this.towers) if (t.alive) income += Math.round(t.getStats().income || 0);
    this.gold += income;
    this.audio.coin();
    this.audio.setIntensity(0.15);
    this.emit('goldChanged', this.gold);
    this.emit('waveEnded', { wave: this.waveIdx, income });
    if (this.lives >= (this._waveStartLives ?? this.lives)) this.addFarr(10 + (this.waveMod ? 3 : 0), 'perfectWave');

    const isLastCampaignWave = !this.endlessMode && this.waveIdx >= this.mapDef.waves;
    if (isLastCampaignWave && this.phase !== 'lost') {
      this.phase = 'won';
      markMapCompleted(this.mapDef.id);
      const newHeroes = HEROES.filter((h) => h.unlock.type === 'campaign' && h.unlock.map === this.mapDef.id);
      for (const h of newHeroes) unlockHero(h.id);
      this.audio.victory();
      this.audio.victorySwell?.();
      this.bossOmen.finale?.('victory', this.map.citadel?.group?.position || this.map.exitPos);
      // victory swells: a triumphant slow-mo and a bloom bloom as the last foe falls
      this.engine.slowMo(0.45, 1.5);
      this.engine.bloomPulse(1.1);
      this.engine.addShake(0.7);
      this._cameraFocusBeat(this.map.citadel?.group?.position || this.map.exitPos, { dur: 1.85, strength: 0.46, dist: 50, pitch: 0.8, yawOffset: -0.08 });
      this.emit('victory', { unlockedHeroes: newHeroes });
    }
    if (this.endlessMode) recordEndless(this.mapDef.id, this.waveIdx);

    // start the countdown to the next wave (unless the map is won/lost)
    if (this.phase === 'build') {
      this.waveCountdown = this.prepTime;
      this._tickAcc = 0;
      this.emit('countdownTick', { remaining: this.waveCountdown, bonus: this.earlyBonus() });
      saveBattle(this); // checkpoint the build phase (the safest resume point)
    } else if (this.phase === 'won') {
      clearBattle(); // campaign cleared — nothing to resume
    }
  }

  // ---------- aura/query helpers ----------
  allSoldiers() {
    const out = [];
    for (const t of this.towers) for (const sq of t.squads) for (const m of sq.members) if (m.alive) out.push(m);
    for (const sq of this.palaceSquads) for (const m of sq.members) if (m.alive) out.push(m);
    return out;
  }

  soldiersNear(pos, r) {
    return this.allSoldiers().filter((s) => s.group.position.distanceTo(pos) < r);
  }

  nearestSoldier(pos, r) {
    let best = null, bd = r;
    for (const s of this.allSoldiers()) {
      const d = s.group.position.distanceTo(pos);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // melee clash feedback — sparks + steel ring (throttled so big brawls don't spam)
  meleeClash(pos, heavy = false) {
    this._clashT = this._clashT || 0;
    const now = performance.now();
    this.particles.burst(pos, heavy ? 7 : 4, { speed: 2.2, up: 1.2, life: 0.35, size: 0.32, color: [1, 0.85, 0.5], grav: 5, spread: 0.4 });
    if (now - this._clashT > 90) {
      this._clashT = now;
      this.audio.clank();
    }
  }

  rhythmBonusAt(pos) {
    let bonus = 1;
    for (const sq of this._allDefenderSquads()) {
      if (sq.def.ability?.key === 'warRhythm' || sq.def.ability?.key === 'standardAura') {
        for (const m of sq.members) {
          if (m.alive && m.group.position.distanceTo(pos) < 8) { bonus = Math.max(bonus, 1.2); break; }
        }
      }
    }
    return bonus;
  }

  dreadAt(pos) {
    return this._dreadSources.some((p) => p.distanceTo(pos) < 13);
  }

  poisonCounselAt(pos) {
    return this._poisonSources.some((p) => p.distanceTo(pos) < 11);
  }

  courtGraceAt(pos) {
    return this.towers.some((t) => t.alive && t.hero?.special.key === 'courtGrace' && t.pos.distanceTo(pos) < 14);
  }

  hasAura(kind, pos) {
    if (kind === 'dynasticBanner') {
      return this.enemies.some((e) => e.alive && e.def.abilities?.includes('dynasticBanner') && e.group.position.distanceTo(pos) < 10);
    }
    return false;
  }

  _recomputeAuras() {
    // tower-to-tower auras
    for (const t of this.towers) t.auraCache = {};
    for (const src of this.towers) {
      if (!src.alive) continue;
      const stats0 = src.def.aura;
      const heroAura = src.hero ? src.getStats().aura : stats0;
      const aura = heroAura || stats0;
      if (!aura) continue;
      const range = (src.def.range || 11) * 1.1;
      for (const dst of this.towers) {
        if (dst === src || !dst.alive || dst.pos.distanceTo(src.pos) > range) continue;
        const c = dst.auraCache;
        if (aura.damageBonus) c.damageBonus = Math.max(c.damageBonus || 0, aura.damageBonus);
        if (aura.rangeBonus) c.rangeBonus = Math.max(c.rangeBonus || 0, aura.rangeBonus);
        if (aura.markDamage) c.markDamage = Math.max(c.markDamage || 0, aura.markDamage);
        if (aura.armorBonus) c.armorBonus = Math.max(c.armorBonus || 0, aura.armorBonus);
        if (aura.towerHpBonus) c.towerHpBonus = Math.max(c.towerHpBonus || 0, aura.towerHpBonus);
      }
      // elderCounsel: Goodarz aura — attack speed for towers in range
      if (src.hero?.special.key === 'elderCounsel') {
        for (const dst of this.towers) {
          if (dst !== src && dst.alive && dst.pos.distanceTo(src.pos) < range) {
            dst.auraCache.attackSpeedBonus = Math.max(dst.auraCache.attackSpeedBonus || 0, 0.15);
          }
        }
      }
      // lineageWeight: Nariman — adjacent towers gain damage
      if (src.hero?.special.key === 'lineageWeight') {
        for (const dst of this.towers) {
          if (dst !== src && dst.alive && dst.pos.distanceTo(src.pos) < 12) {
            dst.auraCache.damageBonus = Math.max(dst.auraCache.damageBonus || 0, 0.12);
          }
        }
      }
    }
    // enemy auras
    this._dreadSources = [];
    this._poisonSources = [];
    this.siegeHornsActive = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ab = e.def.abilities || [];
      if ((ab.includes('tyrantDread') || ab.includes('blindingFog')) && (e.fogBrokenT || 0) <= 0) this._dreadSources.push(e.group.position);
      if (ab.includes('poisonCounsel') && (e.counselBrokenT || 0) <= 0) this._poisonSources.push(e.group.position);
      if (ab.includes('siegeHorns') && (e.siegeSilencedT || 0) <= 0) this.siegeHornsActive = true;
    }
    // wiseTruce: Piran — human enemies slowed near his tower
    for (const t of this.towers) {
      if (t.alive && (t.hero?.special.key === 'wiseTruce' || t.def.humanSlow)) {
        const factor = t.def.humanSlow?.factor ?? 0.7;
        for (const e of this.enemies) {
          if (e.alive && e.def.class === 'human' && e.group.position.distanceTo(t.pos) < (t.def.range || 11)) {
            e.applySlow(factor, 0.6);
          }
        }
      }
      // keepsakeToken: Tahmineh — mark the strongest enemy in range
      if (t.alive && t.hero?.special.key === 'keepsakeToken') {
        let best = null;
        for (const e of this.enemies) {
          if (e.alive && e.group.position.distanceTo(t.pos) < (t.def.range || 11) * 1.3 && (!best || e.maxHp > best.maxHp)) best = e;
        }
        if (best) best.applyMark(0.2, 1.2);
      }
      // pahlavanChallenge: Banu Goshasp — taunt the strongest enemy to strike the tower
      if (t.alive && t.hero?.special.key === 'pahlavanChallenge') {
        for (const e of this.enemies) {
          if (e.alive && !e.flying && e.group.position.distanceTo(t.pos) < 7) { e.siegeCd = Math.min(e.siegeCd, 0.4); break; }
        }
      }
    }
  }

  // ---------- main loop ----------
  update(dt, time) {
    this._time = time;
    if (this.phase === 'lost') dt *= 0.25; // slow-motion fall

    // sandbox: keep the treasury topped up so every upgrade/fusion stays affordable
    if (this.sandbox && this.gold < 500000) { this.gold = 999999; this.emit('goldChanged', this.gold); }
    this.map.updateCameraVisuals?.(this.engine.rtsCamera);

    // periodic mid-wave autosave so a reload/close mid-combat resumes near the live moment
    if (this.waveActive && this.phase === 'combat') {
      this._saveAcc += dt;
      if (this._saveAcc >= 5) { this._saveAcc = 0; saveBattle(this); }
    }

    // auto-wave countdown (build phase only; frozen while paused since dt is 0)
    if (this.phase === 'build' && !this.waveActive && this.waveCountdown > 0) {
      this.waveCountdown -= dt;
      this._tickAcc += dt;
      if (this._tickAcc >= 0.2 || this.waveCountdown <= 0) {
        this._tickAcc = 0;
        this.emit('countdownTick', { remaining: Math.max(0, this.waveCountdown), bonus: this.earlyBonus() });
      }
      if (this.waveCountdown <= 0) { this.waveCountdown = 0; this.startWave(false); }
    }

    if (this.oathT > 0) {
      this.oathT -= dt;
      this._oathFxT -= dt;
      if (this._oathFxT <= 0) {
        this._oathFxT = 0.45;
        this.oathField.pulse(this.map.citadel, this.towers);
        this._oathVisualPulse(this.map.citadel, false);
      }
    }
    this.oathField.update(dt, this.engine.camera, time);
    this.bossOmen.update(dt, this.engine.camera, time);
    this.palaceBoonField.update(dt, this.engine.camera, time);
    this.heroCommandField.update(dt, this.engine.camera, time);
    this._updateGateMarkers(dt, time);
    this._updateGatePressureOmen(dt);

    // pad rubble timers
    for (const pad of this.map.pads) if (pad.rubbleT > 0) pad.rubbleT -= dt;

    // spawn queue
    if (this.waveActive) {
      this.waveT += dt;
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        if (this.spawnQueue[i].delay <= this.waveT) {
          const entry = this.spawnQueue.splice(i, 1)[0];
          const def = ENEMIES_BY_ID[entry.defId];
          const e = new Enemy(this, def, entry.pathIndex, this.waveHpMult, false, { forceBoss: !!entry.boss });
          this.enemies.push(e);
          if (entry.boss) {
            this.bossOmen.arrival?.(e);
            this.emit('bossSpawned', def);
            this._startBossChallenge(e);
            this.audio.roar();
            this.audio.bossSwell?.();
            // epic arrival beat: time dilates, the bloom swells, the ground quakes
            this.engine.slowMo(0.4, 1.3);
            this.engine.bloomPulse(1.0);
            this.engine.addShake(1.0);
            this._cameraFocusBeat(e.group.position, { dur: 1.35, strength: 0.42, dist: 48, pitch: 0.74, yawOffset: 0.1 });
          } else if (this._isEliteEnemy(e)) {
            this.bossOmen.elite?.(e);
          }
        }
      }
      if (this.spawnQueue.length === 0 && !this.enemies.some((e) => e.alive)) this._endWave();
    }

    this.auraT -= dt;
    if (this.auraT <= 0) { this.auraT = 0.4; this._recomputeAuras(); }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].update(dt, time)) {
        this.enemies[i].destroy();
        this.enemies.splice(i, 1);
      }
    }
    this._updateBossPhaseReactions();
    this._updatePalaceDanger(dt, time);
    this._updateBossChallenge(dt);
    const stagePressure = Math.max(this._palaceDanger?.pressure || 0, this._bossChallengePressure());
    this.palaceStage?.setPressure(stagePressure);
    this.palaceStage?.update(dt, time, this.particles);
    for (const t of this.towers) t.update(dt, time);
    for (let i = this.palaceSquads.length - 1; i >= 0; i--) {
      const sq = this.palaceSquads[i];
      if (sq.royalGateGuardT > 0) {
        sq.royalGateGuardT = Math.max(0, sq.royalGateGuardT - dt);
        if (sq.royalGateGuardT <= 2.1 && !sq.royalGateGuardEnding) {
          sq.royalGateGuardEnding = true;
          const anchor = sq.gateLineAnchor || sq.palaceStandAnchor || sq.anchor;
          const dir = sq.gateLineDir || sq.palaceStandDir || null;
          const alive = sq.members.filter((m) => m.alive);
          for (const m of alive) m.gateReadT = Math.max(m.gateReadT || 0, 1.25);
          this._showRoyalGateGuardFade(anchor, dir, { count: alive.length, dur: 1.9 });
        }
        if (sq.royalGateGuardT <= 0) {
          const anchor = sq.gateLineAnchor || sq.palaceStandAnchor || sq.anchor;
          const dir = sq.gateLineDir || sq.palaceStandDir || null;
          this._showRoyalGateGuardFade(anchor, dir, { count: sq.members.filter((m) => m.alive).length, ending: true, dur: 1.25 });
          sq.destroy();
          this.palaceSquads.splice(i, 1);
          continue;
        }
      }
      sq.update(dt, time);
    }
    if (this.palaceAssaultStatus) {
      this.palaceAssaultStatus.t = Math.max(0, (this.palaceAssaultStatus.t || 0) - dt);
      if (this.palaceAssaultStatus.t <= 0) this.palaceAssaultStatus = null;
    }
    const _pal = this.map.citadel;
    if (_pal && _pal.isPalace) {
      if (_pal.musterCd > 0) _pal.musterCd -= dt;
      if (_pal.boonCd > 0) _pal.boonCd -= dt;
      if (_pal.gateCommandCd > 0) _pal.gateCommandCd -= dt;
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].update(dt);
      if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
    }
    this.particles.update(dt);
    this.debris.update(dt);

    // citadel life: banners, sacred flames, gleaming discs/feathers, halo pulses,
    // and the land's own defense mechanism
    updateFire(dt); // advance the shared procedural-fire shader (animates EVERY flame in the scene)
    const anim = this.map.citadel.animated;
    for (const b of anim.banners) animateBanner(b, time);
    for (const f of anim.flames) {
      // the shader flickers the flame; the sacred fire also throws rising embers
      if (Math.random() < dt * 7) {
        f.getWorldPosition(_firePos);
        const s = f.userData.scale || 1;
        this.particles.spawn(
          _firePos.x + (Math.random() - 0.5) * 0.35 * s, _firePos.y + 0.6 * s, _firePos.z + (Math.random() - 0.5) * 0.35 * s,
          (Math.random() - 0.5) * 0.3, 1.3 + Math.random() * 0.9, (Math.random() - 0.5) * 0.3,
          1.0 + Math.random() * 0.7, 0.11 * s, 1.0, 0.72, 0.32, -0.9, 0.6);
      }
    }
    for (const sp of anim.spinners || []) sp.rotation.y += dt * 0.5;
    for (const gd of anim.guards || []) {
      if (gd.model.anim) { gd.model.anim.mixer.update(dt); gd.model.anim.play('idle'); }
      else if (gd.model.rig?.legL) animIdle(gd.model.rig, time + gd.phase);
    }
    for (const gl of anim.glows || []) {
      const s = 1 + Math.sin(time * 1.8) * 0.12;
      gl.scale.set(s, s, s);
      if (gl.material) gl.material.opacity = 0.45 + Math.sin(time * 1.8) * 0.25;
    }
    this.citadelGuard.update(dt);

    // land life: windmill sails, roadside banners, camp flames + smoke
    for (const rotor of this.map.windmills || []) rotor.rotation.y += dt * 1.1;
    for (const b of this.map.propBanners || []) animateBanner(b, time + b.position.x);
    for (const f of this.map.propFlames || []) {
      // shader-animated now; occasional ember from roadside/torch flames
      if (Math.random() < dt * 3) {
        f.getWorldPosition(_firePos);
        const s = f.userData.scale || 1;
        this.particles.spawn(_firePos.x, _firePos.y + 0.5 * s, _firePos.z,
          (Math.random() - 0.5) * 0.25, 1.2 + Math.random() * 0.7, (Math.random() - 0.5) * 0.25,
          0.9 + Math.random() * 0.6, 0.09 * s, 1.0, 0.66, 0.28, -0.8, 0.6);
      }
    }
    for (const c of this.map.campfires || []) {
      if (Math.random() < dt * 2.2) {
        this.particles.spawn(c.x + (Math.random() - 0.5) * 0.4, c.y, c.z + (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.3, 1.1, (Math.random() - 0.5) * 0.3, 2.2, 0.85, 0.45, 0.42, 0.4, -0.25, 0.4);
      }
    }

    // flowing rivers + ambient wildlife/clouds/birds/mist
    for (const m of this.map.waterMats || []) if (m.map) m.map.offset.y -= dt * 0.22;
    this.ambient.update(dt, time, this);

    // audio intensity follows combat pressure
    if (this.waveActive) {
      const aliveCount = this.enemies.filter((e) => e.alive).length;
      const hasBoss = this.enemies.some((e) => e.alive && e.boss);
      this.audio.setIntensity(hasBoss ? 1 : Math.min(0.9, 0.25 + aliveCount * 0.03));
    }
  }

  dispose() {
    for (const t of this.towers) t.destroy();
    for (const sq of this.palaceSquads) sq.destroy();
    this.palaceSquads.length = 0;
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.alive && p._die();
    this.debris.clear();
    this.scene.remove(this.particles.points);
    this.oathField.dispose();
    this.bossOmen.dispose();
    this.palaceBoonField.dispose();
    this.heroCommandField.dispose();
    this.palaceStage.dispose();
    this.clearPalaceCommandPreview();
    this._clearGateMarkers();
    this.ambient.dispose();
    this.scene.remove(this.ambient.group);
    this.map.dispose();
  }
}

export { heroBond };
