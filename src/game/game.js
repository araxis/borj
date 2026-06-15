// Game orchestrator — one battle on one map: economy, waves, entities, auras,
// win/lose, endless scaling. Emits events the UI listens to.
import * as THREE from 'three';
import { GameMap } from '../world/map.js';
import { Enemy } from '../entities/enemy.js';
import { Tower, heroBond } from '../entities/tower.js';
import { ParticleSystem } from '../fx/particles.js';
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
import { hasPalace, loadPalace } from '../core/assets.js';
import { makeRng } from '../world/noise.js';
import { audio } from '../core/audio.js';
import { loadProfile, markMapCompleted, unlockHero, recordEndless, getHeroRank, setHeroRank } from '../core/save.js';
import { diffMods } from '../core/difficulty.js';

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
    this.debris = new DebrisSystem(this.scene, (x, z) => this.map.heightAt(x, z));
    this.ambient = new Ambient(this.scene, this.map, makeRng('amb:' + mapDef.id));
    this.citadelGuard = new CitadelGuard(this, this.map.citadel);
    // palaces lazy-load per map; if the GLB wasn't ready at map-build the procedural citadel showed —
    // load it and swap it in (rebinding the guard) when it arrives.
    if (hasPalace(mapDef.id) && !this.map.citadel.isPalace) loadPalace(mapDef.id, () => this._swapToPalace());
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
    this.enemies = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.waveT = 0;
    this.waveHpMult = 1;
    this.waveMod = null;
    // auto-wave countdown: the next wave launches on its own; calling it early pays a
    // gold bonus scaled by the time you saved (classic TD early-call reward).
    this.prepTime = 16;        // seconds between waves
    this.prepTimeFirst = 25;   // longer grace to build before wave 1
    this.earlyGoldPerSec = 4 + (mapDef.order || 1);
    this.waveCountdown = this.prepTimeFirst;
    this._tickAcc = 0;
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
    engine.rtsCamera?.setHome(exit.x * 0.4, exit.z * 0.4, 72);
    engine.setMood(this.map.biome.mood);
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

  // ---------- palace command actions ----------
  // a defensive point just in front of the palace, toward the incoming lanes
  _palaceFront(cit) {
    const p = cit.group.position;
    const dir = new THREE.Vector3(-p.x, 0, -p.z);
    if (dir.lengthSq() > 0.01) dir.normalize(); else dir.set(0, 0, -1);
    const rad = (cit.footprint || 15) + 3;
    const x = p.x + dir.x * rad, z = p.z + dir.z * rad;
    return new THREE.Vector3(x, this.map.heightAt(x, z), z);
  }

  // Rally to the Keep: pull every tower's garrison to defend in front of the palace.
  palaceRally(cit) {
    const pt = this._palaceFront(cit);
    let n = 0;
    for (const tw of this.towers) {
      if (!tw.alive) continue;
      for (const sq of tw.squads) { sq.setRally(pt.clone()); n++; }
    }
    if (!n) this.emit('toast', 'palace.noGarrison');
    return n;
  }

  // Muster: summon a defensive squad at the palace (gold + cooldown), capped at 2 standing squads.
  palaceMuster(cit) {
    const cfg = palaceDef(cit.placeId).muster;
    if ((cit.musterCd || 0) > 0) return false;
    if (!this.canAfford(cfg.cost)) { this.emit('toast', 'hud.notEnoughGold'); return false; }
    const sDef = SOLDIERS_BY_ID[cfg.unit];
    if (!sDef) return false;
    this.gold -= cfg.cost;
    cit.musterCd = cfg.cd;
    const owner = { pos: cit.group.position.clone(), alive: true };
    const sq = new Squad(this, owner, sDef, cfg.count);
    sq.setRally(this._palaceFront(cit));
    this.palaceSquads.push(sq);
    while (this.palaceSquads.length > 2) {
      const old = this.palaceSquads.shift();
      for (const m of old.members) m.destroy();
    }
    this.emit('goldChanged', this.gold);
    return true;
  }

  // King's Boon: a stage-themed ability. Alborz/Simurgh → restore HP to towers + soldiers.
  palaceBoon(cit) {
    const cfg = palaceDef(cit.placeId).boon;
    if ((cit.boonCd || 0) > 0) return false;
    if (!this.canAfford(cfg.cost)) { this.emit('toast', 'hud.notEnoughGold'); return false; }
    this.gold -= cfg.cost;
    cit.boonCd = cfg.cd;
    if (cfg.type === 'heal') {
      const amt = cfg.amount || 0.45;
      for (const tw of this.towers) if (tw.alive) tw.hp = Math.min(tw.maxHp, tw.hp + tw.maxHp * amt);
      for (const sq of [...this.towers.flatMap((t) => t.squads), ...this.palaceSquads]) {
        for (const m of sq.members) if (m.alive) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * amt);
      }
    }
    const p = cit.group.position;
    this.particles?.burst?.(p.clone().setY(p.y + (cit.height || 16) * 0.5), 32, { speed: 3, life: 1.2, size: 0.7, color: [1, 0.86, 0.46], grav: -1 });
    this.audio?.victory?.();
    this.emit('goldChanged', this.gold);
    return true;
  }

  // swap the procedural citadel for the now-loaded palace GLB, preserving placement + guard wiring
  _swapToPalace() {
    const m = this.map;
    if (!m || !m.citadel || m.citadel.isPalace) return;
    const cit = buildLandCitadel(this.mapDef.id);
    if (!cit.isPalace) return; // still not ready — keep the procedural citadel
    m.group.remove(m.citadel.group);
    cit.group.position.copy(m.exitPos);
    const s = m.paths[0].samples;
    const inDir = s[s.length - 8] || s[0];
    cit.group.rotation.y = Math.atan2(inDir.pos.x - m.exitPos.x, inDir.pos.z - m.exitPos.z);
    m.group.add(cit.group);
    m.citadel = cit;
    this.citadelGuard = new CitadelGuard(this, cit);
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
    for (const t of this.towers) { t.borderArrowUsed = false; t.brazenUsed = false; t.rebuildUsed = false; }
    this.emit('waveStarted', { wave: this.waveIdx, boss: wave.isBossWave, mod: wave.modifier });
    if (wave.isBossWave) { this.audio.bossCue(); this.emit('toast', 'hud.bossIncoming'); }
    this.audio.setIntensity(wave.isBossWave ? 1 : Math.min(0.85, 0.3 + this.waveIdx * 0.05));
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
  }

  onEnemyReachedEnd(enemy) {
    if (this.sandbox) { this.engine.addShake(0.15); return; } // invulnerable while testing
    this.lives -= enemy.boss ? 3 : 1;
    this.engine.addShake(0.3);
    this.audio.defeat();
    this.emit('livesChanged', this.lives);
    if (this.lives <= 0 && this.phase !== 'lost') {
      this.phase = 'lost';
      this.audio.setIntensity(0);
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
    // income from economy towers + base wave reward
    let income = 25 + this.waveIdx * 4;
    for (const t of this.towers) if (t.alive) income += Math.round(t.getStats().income || 0);
    this.gold += income;
    this.audio.coin();
    this.audio.setIntensity(0.15);
    this.emit('goldChanged', this.gold);
    this.emit('waveEnded', { wave: this.waveIdx, income });

    const isLastCampaignWave = !this.endlessMode && this.waveIdx >= this.mapDef.waves;
    if (isLastCampaignWave && this.phase !== 'lost') {
      this.phase = 'won';
      markMapCompleted(this.mapDef.id);
      const newHeroes = HEROES.filter((h) => h.unlock.type === 'campaign' && h.unlock.map === this.mapDef.id);
      for (const h of newHeroes) unlockHero(h.id);
      this.audio.victory();
      this.emit('victory', { unlockedHeroes: newHeroes });
    }
    if (this.endlessMode) recordEndless(this.mapDef.id, this.waveIdx);

    // start the countdown to the next wave (unless the map is won/lost)
    if (this.phase === 'build') {
      this.waveCountdown = this.prepTime;
      this._tickAcc = 0;
      this.emit('countdownTick', { remaining: this.waveCountdown, bonus: this.earlyBonus() });
    }
  }

  // ---------- aura/query helpers ----------
  allSoldiers() {
    const out = [];
    for (const t of this.towers) for (const sq of t.squads) for (const m of sq.members) if (m.alive) out.push(m);
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
    for (const t of this.towers) {
      for (const sq of t.squads) {
        if (sq.def.ability?.key === 'warRhythm' || sq.def.ability?.key === 'standardAura') {
          for (const m of sq.members) {
            if (m.alive && m.group.position.distanceTo(pos) < 8) { bonus = Math.max(bonus, 1.2); break; }
          }
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
      if (ab.includes('tyrantDread') || ab.includes('blindingFog')) this._dreadSources.push(e.group.position);
      if (ab.includes('poisonCounsel')) this._poisonSources.push(e.group.position);
      if (ab.includes('siegeHorns')) this.siegeHornsActive = true;
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
    if (this.phase === 'lost') dt *= 0.25; // slow-motion fall

    // sandbox: keep the treasury topped up so every upgrade/fusion stays affordable
    if (this.sandbox && this.gold < 500000) { this.gold = 999999; this.emit('goldChanged', this.gold); }

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

    // pad rubble timers
    for (const pad of this.map.pads) if (pad.rubbleT > 0) pad.rubbleT -= dt;

    // spawn queue
    if (this.waveActive) {
      this.waveT += dt;
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        if (this.spawnQueue[i].delay <= this.waveT) {
          const entry = this.spawnQueue.splice(i, 1)[0];
          const def = ENEMIES_BY_ID[entry.defId];
          const e = new Enemy(this, def, entry.pathIndex, this.waveHpMult);
          this.enemies.push(e);
          if (entry.boss) { this.emit('bossSpawned', def); this.audio.roar(); }
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
    for (const t of this.towers) t.update(dt, time);
    for (const sq of this.palaceSquads) sq.update(dt, time);
    const _pal = this.map.citadel;
    if (_pal && _pal.isPalace) {
      if (_pal.musterCd > 0) _pal.musterCd -= dt;
      if (_pal.boonCd > 0) _pal.boonCd -= dt;
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].update(dt);
      if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
    }
    this.particles.update(dt);
    this.debris.update(dt);

    // citadel life: banners, sacred flames, gleaming discs/feathers, halo pulses,
    // and the land's own defense mechanism
    const anim = this.map.citadel.animated;
    for (const b of anim.banners) animateBanner(b, time);
    for (const f of anim.flames) {
      const s = 1 + Math.sin(time * 8) * 0.15;
      f.scale.set(s, s, s);
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
      const s = 1 + Math.sin(time * 9 + f.position.x) * 0.18;
      f.scale.set(s, s, s);
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
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.alive && p._die();
    this.debris.clear();
    this.scene.remove(this.particles.points);
    this.ambient.dispose();
    this.scene.remove(this.ambient.group);
    this.map.dispose();
  }
}

export { heroBond };
