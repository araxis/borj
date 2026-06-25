// Tower entity — building identity, age upgrades, hero command bonds, garrison,
// auras, attacks, and staged physical destruction (crack → crown collapse → ruin).
import * as THREE from 'three';
import { buildTower, animateBanner } from '../models/towerkit.js';
import { AGES } from '../data/towers.js';
import { HERO_RANKS } from '../data/heroes.js';
import { getHeroRank } from '../core/save.js';
import { SOLDIERS_BY_ID } from '../data/soldiers.js';
import { Squad } from './soldier.js';
import { Projectile, lashEffect } from './projectile.js';
import { FXC } from '../fx/particles.js';
import { MATS } from '../models/materials.js';
import { colorMat } from '../models/humanoid.js';
import { heroModel } from '../models/creature.js';
import { settings } from '../core/settings.js';

// hero.command style -> tower roles it amplifies
const ROLE_ALIGN = {
  frontline: ['barracks', 'siege'], support: ['support'], sovereign: ['economy', 'aura'],
  sentinel: ['archer'], marshal: ['barracks', 'aura'], striker: ['archer', 'siege', 'trap'],
  bulwark: ['barracks', 'archer'], judgment: ['fire', 'magic'], binder: ['magic'],
  mythic: ['support', 'magic'], logistics: ['economy', 'barracks'], founder: ['fire', 'economy'],
  pathfinder: ['archer', 'support'], outrider: ['barracks'], steward: ['economy', 'support'],
};
const WEAPON_FIT = {
  archer: ['bow'], siege: ['mace', 'hammer', 'stone'], fire: ['stone', 'sword'],
  magic: ['scepter', 'staff', 'crown', 'token'], support: ['talon', 'lantern', 'crown'],
  aura: ['crown', 'scepter', 'shield'], economy: ['crown', 'scepter'],
  barracks: ['spear', 'sword', 'lance', 'hooves', 'axe', 'shield', 'hammer'], trap: ['bow', 'sword'],
};

const HERO_COMMAND_COLORS = {
  heal: 0x7fe7c1,
  fire: 0xff7a24,
  vision: 0x7fe7ff,
  bind: 0xb8bdc8,
  rally: 0xf4cd6e,
  default: 0xf4cd6e,
};

// The clear, documented bond formula (also rendered in the UI):
// bond = 0.12·affinityMatches + 0.25·storyTie + 0.15·weaponFit + 0.10·roleFit + 0.08·ageFit
export function heroBond(heroDef, towerDef, ageIdx) {
  if (!heroDef) return 0;
  const matches = heroDef.affinity.filter((a) => towerDef.affinity.includes(a)).length;
  let bond = 0.12 * matches;
  if (towerDef.compatHeroes?.includes(heroDef.id)) bond += 0.25;
  if ((WEAPON_FIT[towerDef.role] || []).includes(heroDef.weapon)) bond += 0.15;
  if ((ROLE_ALIGN[heroDef.command] || []).includes(towerDef.role)) bond += 0.10;
  if (heroDef.ageTier === AGES[ageIdx].id) bond += 0.08;
  return bond;
}

let towerId = 1;

export class Tower {
  constructor(game, def, pad) {
    this.id = towerId++;
    this.game = game;
    this.def = def;
    this.pad = pad;
    this.ageIdx = 0;
    this.hero = null;          // HeroDef
    this.alive = true;
    this.pos = pad.pos.clone();
    this.attackCd = 0;
    this.shotCount = 0;
    this.lastTarget = null;
    this.lastTargetT = -99;
    this.lastTargetKind = null;
    this.silencedT = 0;
    this.disabledT = 0;
    this.garrisonDisabledT = 0;
    this.smokeT = 0;
    this.collapseStage = 0;     // 0 intact, 1 crown dropped, 2 destroyed
    this.borderArrowUsed = false;
    this.brazenUsed = false;
    this.rebuildUsed = false;
    this.heroActiveCd = 0;
    this.palaceDamageT = 0;
    this.palaceDamageBonus = 0;
    this.palaceRangeT = 0;
    this.palaceRangeBonus = 0;
    this.palaceSynergyT = 0;
    this.palaceSynergyDamage = 0;
    this.palaceSynergyRange = 0;
    this.palaceSynergyRate = 0;
    this._palacePulseT = 0;
    this._palacePulseDur = 0;
    this._palacePulsePower = 0;
    this.invested = def.cost;
    this.squads = [];
    this.auraCache = {};
    this.healPulseT = 0;
    this._heroCommandT = 0;

    this._buildModel();
    this.maxHp = this._computeMaxHp();
    this.hp = this.maxHp;
    this._spawnGarrison();
  }

  _computeMaxHp() {
    const base = 380 * (this.def.hpBonus || 1) * AGES[this.ageIdx].mult;
    const stats = this.getStats();
    return Math.round(base * (1 + (stats.hpMod || 0)));
  }

  _buildModel() {
    if (this.model) {
      this._removePalacePulseFx();
      this.group?.removeFromParent();
    }
    this.model = buildTower(this.def.model, this.ageIdx);
    this.group = this.model.group;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.pad.rot + Math.PI; // iwan faces the road
    this.game.scene.add(this.group);
    // hero standard: colored glow band when commanded
    if (this.hero) this._addHeroStandard();
  }

  _addHeroStandard() {
    this._removeHeroStandard();
    // ring color follows the hero's rank: bronze → silver → gold → glowing gold
    const rank = getHeroRank(this.hero?.id);
    const colors = [0xb0793a, 0xc8ccd4, 0xe0b13e, 0xffd97a];
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(this.model.radius * 1.15, 0.08 + rank * 0.015, 6, 24),
      new THREE.MeshBasicMaterial({ color: colors[rank] || colors[0], transparent: true, opacity: 0.7 + rank * 0.08 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.9;
    this.group.add(ring);
    this._heroRing = ring;

    const ready = new THREE.Mesh(
      new THREE.RingGeometry(this.model.radius * 1.23, this.model.radius * 1.38, 80),
      new THREE.MeshBasicMaterial({
        color: colors[rank] || colors[0],
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    ready.rotation.x = -Math.PI / 2;
    ready.position.y = 0.22;
    ready.renderOrder = 28;
    this.group.add(ready);
    this._heroReadyHalo = ready;

    const flash = new THREE.Mesh(
      new THREE.RingGeometry(this.model.radius * 1.46, this.model.radius * 1.62, 96),
      new THREE.MeshBasicMaterial({
        color: colors[rank] || colors[0],
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.y = 0.34;
    flash.renderOrder = 29;
    this.group.add(flash);
    this._heroFlashHalo = flash;
    this._addHeroFigure();
  }

  _disposeHeroMesh(mesh) {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry?.dispose?.();
    mesh.material?.dispose?.();
  }

  _removeHeroStandard() {
    this._disposeHeroMesh(this._heroRing);
    this._disposeHeroMesh(this._heroReadyHalo);
    this._disposeHeroMesh(this._heroFlashHalo);
    this._heroRing = null;
    this._heroReadyHalo = null;
    this._heroFlashHalo = null;
  }

  commandFlash(kind = 'default', rank = 0) {
    if (!this.hero || !this._heroRing) return;
    const color = HERO_COMMAND_COLORS[kind] || HERO_COMMAND_COLORS.default;
    this._heroCommandT = Math.max(this._heroCommandT || 0, 1.05 + rank * 0.08);
    this._heroRing.material?.color?.setHex(color);
    this._heroReadyHalo?.material?.color?.setHex(color);
    this._heroFlashHalo?.material?.color?.setHex(color);
    if (this._heroModel?.group) {
      this._heroModel.group.position.y = Math.max(this._heroModel.group.position.y, 0.18 + rank * 0.03);
    }
  }

  _ensurePalacePulseFx() {
    if (this._palacePulseHalo) return;
    const radius = Math.max(1.15, this.model?.radius || 1.5);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffd36a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const crownMat = haloMat.clone();
    const beamMat = haloMat.clone();
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.34, radius * 1.82, 112),
      haloMat,
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.18;
    halo.renderOrder = 34;
    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.62, 0.055, 8, 44),
      crownMat,
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.y = Math.max(2.2, (this.model?.height || 4) * 0.72);
    crown.renderOrder = 35;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.12, radius * 0.32, Math.max(1.8, (this.model?.height || 4) * 0.66), 20, 1, true),
      beamMat,
    );
    beam.position.y = Math.max(1.4, (this.model?.height || 4) * 0.42);
    beam.renderOrder = 33;
    this.group.add(halo, crown, beam);
    this._palacePulseHalo = halo;
    this._palacePulseCrown = crown;
    this._palacePulseBeam = beam;
  }

  _removePalacePulseFx() {
    this._disposeHeroMesh(this._palacePulseHalo);
    this._disposeHeroMesh(this._palacePulseCrown);
    this._disposeHeroMesh(this._palacePulseBeam);
    this._palacePulseHalo = null;
    this._palacePulseCrown = null;
    this._palacePulseBeam = null;
  }

  palaceCounterchargeFlash(power = 1, dur = 2.5) {
    this._ensurePalacePulseFx();
    const pulseDur = Math.max(1.2, Math.min(3.6, dur || 2.5));
    this._palacePulseT = Math.max(this._palacePulseT || 0, pulseDur);
    this._palacePulseDur = Math.max(this._palacePulseDur || 0, pulseDur);
    this._palacePulsePower = Math.max(this._palacePulsePower || 0, Math.max(0.75, Math.min(1.35, power || 1)));
  }

  // the hero stands on the platform of the tower they command (idle clip + signature weapon)
  _addHeroFigure() {
    this._removeHeroFigure();
    const m = heroModel(this.hero);
    if (!m) return; // GLB not loaded → ring-only (graceful)
    const r = this.model.radius || 1;
    const ox = r * 0.82, oz = r * 0.18;
    m.group.position.set(ox, 0.05, oz);              // on the platform, off to one side
    m.group.rotation.y = Math.atan2(ox, oz);         // face outward, away from the tower body
    this.group.add(m.group);
    this._heroModel = m;
  }

  _removeHeroFigure() {
    if (this._heroModel) { this._heroModel.group.removeFromParent(); this._heroModel = null; }
  }

  _spawnGarrison() {
    for (const s of this.squads) s.destroy();
    this.squads.length = 0;
    const g = this.def.garrison;
    if (!g) return;
    const stats = this.getStats();
    const mk = (soldierId, count) => {
      const def = SOLDIERS_BY_ID[soldierId];
      if (!def) return;
      const squad = new Squad(this.game, this, def, count + (this.ageIdx >= 3 ? 1 : 0));
      squad.powerMult = 1 + (stats.soldierPower || 0);
      squad.speedMult = 1 + (stats.soldierSpeed || 0);
      squad.rateMult = 1 + (stats.attackSpeedMod || 0) * 0.5;
      squad.trampleBonus = stats.trample || 0;
      this.squads.push(squad);
    };
    mk(g.soldier, g.count);
    if (g.extra) mk(g.extra.soldier, g.extra.count);
  }

  // ---- stats with age + hero bond + auras ----
  getStats() {
    const d = this.def;
    const age = AGES[this.ageIdx].mult;
    const s = {
      damage: (d.damage || 0) * age,
      range: d.range || 0,
      rate: d.rate || 0,
      splash: d.splash || 0,
      income: (d.income || 0) * (1 + this.ageIdx * 0.35),
      heal: d.heal ? { hps: d.heal.hps * age, radius: d.heal.radius } : null,
      repair: d.repair ? { hps: d.repair.hps * age, radius: d.repair.radius } : null,
      vsBoss: d.vsBoss || 1, vsDiv: d.vsDiv || 1, vsBeast: d.vsBeast || 1, vsFlying: d.vsFlying || 1,
      stunChance: d.stunChance || 0,
      pierce: d.pierce || 0,
      armorShred: d.armorShred || 0,
      burn: d.burn ? { ...d.burn } : null,
      slow: d.slow ? { ...d.slow } : null,
      chainSlow: d.chainSlow ? { ...d.chainSlow } : null,
      bind: d.bind ? { ...d.bind } : null,
      trapPin: d.trapPin ? { ...d.trapPin } : null,
      reveal: !!d.reveal,
      trueDamagePortion: d.dmgType === 'true' ? 1 : 0,
      hpMod: 0, soldierPower: 0, soldierSpeed: 0, trample: 0, attackSpeedMod: 0,
      damageReduction: 0,
      aura: d.aura ? { ...d.aura } : null,
      bond: 0,
    };
    if (this.hero) {
      const bond = heroBond(this.hero, d, this.ageIdx);
      s.bond = bond;
      s.heroRank = getHeroRank(this.hero.id);
      // rank ladder multiplies how strongly the commander's gifts apply
      const k = (0.6 + bond) * HERO_RANKS[s.heroRank].mult;
      const m = this.hero.mods;
      if (m.damage) s.damage *= 1 + m.damage * k;
      if (m.range) s.range *= 1 + m.range * k;
      if (m.attackSpeed) s.attackSpeedMod += m.attackSpeed * k;
      if (m.splash) s.splash *= 1 + m.splash * k;
      if (m.hp) s.hpMod += m.hp * k;
      if (m.armor) s.damageReduction += Math.min(0.5, m.armor * k * 0.6);
      if (m.healing && s.heal) s.heal.hps *= 1 + m.healing * k;
      if (m.healing && !s.heal) s.heal = { hps: 4 * m.healing * k * 3, radius: 9 };
      if (m.vision) { s.range *= 1 + m.vision * k * 0.3; s.reveal = true; }
      if (m.bossDamage) s.vsBoss *= 1 + m.bossDamage * k;
      if (m.divDamage) s.vsDiv *= 1 + m.divDamage * k;
      if (m.beastDamage) s.vsBeast *= 1 + m.beastDamage * k;
      if (m.burn && s.burn) { s.burn.dps *= 1 + m.burn * k; s.burn.dur += 0.5; }
      if (m.burn && !s.burn) s.burn = { dps: 6 * m.burn * k * 2, dur: 1.5 };
      if (m.stun) s.stunChance += m.stun * k * 0.5;
      if (m.economy) s.income *= 1 + m.economy * k;
      if (m.trueDamage) s.trueDamagePortion = Math.min(1, s.trueDamagePortion + m.trueDamage * k);
      if (m.soldierPower) s.soldierPower += m.soldierPower * k;
      if (m.soldierSpeed) s.soldierSpeed += m.soldierSpeed * k;
      if (m.trample) s.trample += m.trample * k;
      if (m.production) { s.soldierPower += m.production * k * 0.5; if (s.repair) s.repair.hps *= 1 + m.production * k; }
      if (m.repair && s.repair) s.repair.hps *= 1 + m.repair * k;
      if (m.morale || m.command) {
        s.aura = s.aura || {};
        s.aura.damageBonus = (s.aura.damageBonus || 0) + (m.morale || 0) * k * 0.3 + (m.command || 0) * k * 0.3;
      }
      if (m.rate) s.attackSpeedMod += m.rate * k;
      if (m.trap && s.trapPin) s.trapPin.dur *= 1 + m.trap * k;
      if (m.counter) s.soldierPower += m.counter * k * 0.5;
      if (m.radiance) s.damage *= 1 + m.radiance * k * 0.4;
    }
    // external auras from other towers
    const a = this.auraCache;
    if (a.damageBonus) s.damage *= 1 + a.damageBonus;
    if (a.rangeBonus) s.range *= 1 + a.rangeBonus;
    if (a.markDamage) s.markOnHit = a.markDamage;
    if (a.towerHpBonus) s.hpMod += a.towerHpBonus;
    if (a.attackSpeedBonus) s.attackSpeedMod += a.attackSpeedBonus;
    if (this.palaceDamageT > 0) s.damage *= 1 + (this.palaceDamageBonus || 0);
    if (this.palaceRangeT > 0) {
      s.range *= 1 + (this.palaceRangeBonus || 0);
      s.reveal = true;
    }
    if (this.palaceSynergyT > 0) {
      s.damage *= 1 + (this.palaceSynergyDamage || 0);
      s.range *= 1 + (this.palaceSynergyRange || 0);
      s.attackSpeedMod += this.palaceSynergyRate || 0;
      if (this.palaceSynergyRange > 0) s.reveal = true;
    }
    // hero special: youngLion — fury below half HP
    if (this.hero?.special.key === 'youngLion' && this.hp < this.maxHp * 0.5) s.attackSpeedMod += 0.6;
    s.rate *= 1 + s.attackSpeedMod;
    // dread auras (Zahhak) slow tower attacks
    if (this.game.dreadAt(this.pos)) s.rate *= 0.7;
    return s;
  }

  assignHero(heroDef) {
    this.hero = heroDef;
    this._addHeroStandard();
    const keepHpFrac = this.hp / this.maxHp;
    this.maxHp = this._computeMaxHp();
    this.hp = this.maxHp * keepHpFrac;
    this._spawnGarrison();
    this.game.audio.hornCall();
  }

  unassignHero() {
    this.hero = null;
    this._removeHeroStandard();
    this._removeHeroFigure();
    const keepHpFrac = this.hp / this.maxHp;
    this.maxHp = this._computeMaxHp();
    this.hp = this.maxHp * keepHpFrac;
    this._spawnGarrison();
  }

  canUpgrade() { return this.ageIdx < AGES.length - 1; }
  upgradeCost() {
    let c = Math.round(this.def.cost * AGES[Math.min(this.ageIdx + 1, AGES.length - 1)].costMult);
    if (this.game.courtGraceAt(this.pos)) c = Math.round(c * 0.85);
    return c;
  }

  upgrade() {
    if (!this.canUpgrade()) return false;
    this.ageIdx++;
    this.invested += this.upgradeCost();
    const frac = this.hp / this.maxHp;
    this._buildModel();
    this.maxHp = this._computeMaxHp();
    this.hp = this.maxHp * Math.max(frac, 0.8); // upgrading repairs
    this.collapseStage = 0;
    this._spawnGarrison();
    if (!this.game._restoring) { // silent + FX-free when rebuilding from a save snapshot
      this.game.particles.burst(this.pos.clone().setY(this.pos.y + 2), 24, { speed: 2.5, life: 0.9, size: 0.5, color: FXC.gold, grav: 2 });
      this.game.audio.forgeHammer();
    }
    return true;
  }

  sellRefund() { return Math.round(this.invested * 0.6); }

  takeDamage(amount) {
    if (!this.alive) return;
    const stats = this.getStats();
    let dmg = amount * (1 - Math.min(0.6, stats.damageReduction));
    // brazenBody: near-invulnerable moment when first struck each wave
    if (this.hero?.special.key === 'brazenBody' && !this.brazenUsed) {
      this.brazenUsed = true;
      this._brazenT = 3;
    }
    if (this._brazenT > 0) dmg *= 0.1;
    this.hp -= dmg;
    this.smokeT = 1.5;
    const frac = this.hp / this.maxHp;
    // staged physical damage
    if (frac < 0.45 && this.collapseStage === 0) {
      this.collapseStage = 1;
      this.game.debris.dropLayer(this.model.layers.crown, this.pos, 0.9);
      this.game.debris.explode(this.pos.clone().setY(this.pos.y + this.model.height * 0.7), this._debrisMats(), 8, 0.9);
      this.game.audio.stoneBreak();
      this.game.engine.addShake(0.2);
    } else if (Math.random() < 0.4) {
      this.game.particles.burst(this.pos.clone().setY(this.pos.y + 1.5), 5, { speed: 1.5, life: 0.6, size: 0.4, color: FXC.stone, grav: 4 });
    }
    if (this.hp <= 0) this._collapse();
  }

  _debrisMats() {
    const mats = MATS();
    return [mats.stone, mats.stoneDark, mats.plaster, mats.wood];
  }

  _collapse() {
    // royalContinuity: Farangis rebuilds the tower once per wave
    if (this.hero?.special.key === 'royalContinuity' && !this.rebuildUsed) {
      this.rebuildUsed = true;
      this.hp = this.maxHp * 0.4;
      this.collapseStage = 0;
      this._buildModel();
      this.game.particles.burst(this.pos.clone().setY(this.pos.y + 2), 20, { speed: 2, life: 1, size: 0.5, color: FXC.heal, grav: -0.5 });
      return;
    }
    this.alive = false;
    this.collapseStage = 2;
    // staged collapse: mid layer topples, base bursts into chunks
    this.game.debris.dropLayer(this.model.layers.mid, this.pos, 1.2);
    setTimeout(() => {
      if (this.model.layers.base.parent) {
        this.game.debris.explode(this.pos.clone().setY(this.pos.y + 0.8), this._debrisMats(), 16, 1.3);
        this.model.layers.base.removeFromParent();
      }
    }, 420);
    this.game.debris.explode(this.pos.clone().setY(this.pos.y + 1.5), this._debrisMats(), 10, 1.0);
    this.game.particles.burst(this.pos, 30, { speed: 3.5, life: 1.4, size: 0.7, color: FXC.dust, grav: 2, spread: 2 });
    this.game.audio.bigCollapse();
    this.game.engine.addShake(0.6);
    for (const s of this.squads) s.destroy();
    this.squads.length = 0;
    this.pad.tower = null;
    this.pad.rubbleT = 5; // pad unusable while rubble settles
    this.game.onTowerDestroyed(this);
    // remove remaining dynamic parts shortly after
    setTimeout(() => this.group.removeFromParent(), 600);
  }

  // ---- targeting & attacks ----
  _acquireTarget(stats) {
    let best = null, bestDist = -1;
    const r2 = stats.range * stats.range;
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      if (e.untargetableT > 0 && !stats.reveal) continue;
      if (e.flying && this.def.role === 'trap') continue;
      const d2 = e.group.position.distanceToSquared(this.pos);
      if (d2 > r2) continue;
      if (this.def.minRange && d2 < this.def.minRange * this.def.minRange) continue;
      if (e.dist > bestDist) { bestDist = e.dist; best = e; }
    }
    return best;
  }

  _dealDamage(enemy, stats, mult = 1, splashPos = null) {
    if (!enemy && splashPos && stats.splash > 0) {
      this._splash(splashPos, stats, mult);
      return;
    }
    if (!enemy?.alive) return;
    let dmg = stats.damage * mult;
    if (enemy.boss) dmg *= stats.vsBoss;
    if (enemy.def.class === 'div') dmg *= stats.vsDiv;
    if (enemy.def.class === 'beast' || enemy.def.class === 'serpent') dmg *= stats.vsBeast;
    if (enemy.flying) dmg *= stats.vsFlying;
    if (enemy.roadShield) dmg *= 1 - enemy.roadShield;
    // garsivaz curse: hero bond weakened nearby
    if (this.hero && this.game.poisonCounselAt(this.pos)) dmg /= 1 + stats.bond * 0.5;
    const dmgType = stats.trueDamagePortion >= 1 ? 'true' : this.def.dmgType;
    const hitImpact = (stats.splash > 0 || this.def.role === 'siege' || this.def.vfx === 'chainLash') ? 0.34 : this.hero ? 0.12 : 0;
    if (stats.trueDamagePortion > 0 && stats.trueDamagePortion < 1) {
      enemy.takeDamage(dmg * (1 - stats.trueDamagePortion), dmgType === 'true' ? 'magic' : dmgType, { armorShred: stats.armorShred, impact: hitImpact });
      enemy.takeDamage(dmg * stats.trueDamagePortion, 'true', { impact: hitImpact * 0.7 });
    } else {
      enemy.takeDamage(dmg, dmgType, { armorShred: stats.armorShred, impact: hitImpact });
    }
    if (stats.burn) enemy.applyBurn(stats.burn.dps, stats.burn.dur);
    if (stats.slow) enemy.applySlow(stats.slow.factor, stats.slow.dur);
    if (stats.chainSlow) { enemy.applySlow(stats.chainSlow.factor, stats.chainSlow.dur); this.game.audio.chain(); }
    if (stats.stunChance && Math.random() < stats.stunChance) enemy.stunT = Math.max(enemy.stunT, enemy.boss ? 0.4 : 0.9);
    if (stats.markOnHit) enemy.applyMark(stats.markOnHit, 3);
    if (stats.trapPin && !enemy.boss) enemy.bindT = Math.max(enemy.bindT, stats.trapPin.dur);
    // oxheadJudgment: chains bosses
    if (this.hero?.special.key === 'oxheadJudgment' && enemy.boss) enemy.applySlow(0.6, 1.2);
    if (stats.splash > 0) this._splash(enemy.group.position, stats, mult * 0.55, enemy);
  }

  _splash(pos, stats, mult, except = null) {
    for (const e of this.game.enemies) {
      if (!e.alive || e === except) continue;
      if (e.group.position.distanceTo(pos) < stats.splash) {
        let dmg = stats.damage * mult;
        if (e.boss) dmg *= stats.vsBoss;
        e.takeDamage(dmg, this.def.dmgType === 'arrow' ? 'impact' : this.def.dmgType, { impact: 0.34 });
        if (stats.burn) e.applyBurn(stats.burn.dps * 0.6, stats.burn.dur * 0.7);
        if (stats.slow) e.applySlow(stats.slow.factor, stats.slow.dur * 0.8);
      }
    }
  }

  _muzzlePos() {
    return this.pos.clone().setY(this.pos.y + this.model.height * 0.85);
  }

  _fire(target, stats) {
    this.shotCount++;
    const from = this._muzzlePos();
    const role = this.def.role;
    const vfx = this.def.vfx;
    this.lastTarget = target;
    this.lastTargetT = this.game?._time || 0;
    this.lastTargetKind = vfx || role || this.def.id || null;
    // hero signature: Rostam's mace shockwave every 6th shot
    if (this.hero?.special.key === 'maceShockwave' && this.shotCount % 6 === 0) {
      this.game.particles.burst(this.pos, 22, { speed: 5, up: 0.5, life: 0.6, size: 0.6, color: FXC.gold, grav: 2, spread: 3 });
      this.game.audio.mace();
      this.game.engine.addShake(0.15);
      for (const e of this.game.enemies) {
        if (e.alive && e.group.position.distanceTo(this.pos) < stats.range * 0.6) {
          e.takeDamage(stats.damage * 1.2, 'impact', { command: true, impact: 0.65 });
          if (!e.boss) e.stunT = Math.max(e.stunT, 0.8);
        }
      }
      return;
    }
    // twinArrow: every 5th arrow strikes two enemies in a line
    const pierce = stats.pierce + (this.hero?.special.key === 'twinArrow' && this.shotCount % 5 === 0 ? 2 : 0);

    if (role === 'fire') {
      // cone spray
      this.game.audio.fire();
      const dir = target.group.position.clone().sub(this.pos).setY(0).normalize();
      for (let i = 0; i < 7; i++) {
        const p = from.clone().add(dir.clone().multiplyScalar(1 + i * 0.4));
        this.game.particles.spawn(p.x, p.y - 1 + i * 0.1, p.z, dir.x * 6 + (Math.random() - 0.5) * 2, 0.5, dir.z * 6 + (Math.random() - 0.5) * 2, 0.45, 0.7, 1, 0.55, 0.18, -0.5, 1.5);
      }
      for (const e of this.game.enemies) {
        if (!e.alive) continue;
        const to = e.group.position.clone().sub(this.pos).setY(0);
        if (to.length() < stats.range && to.normalize().dot(dir) > (1 - (this.def.cone || 0.6))) {
          this._dealDamage(e, stats, 1);
        }
      }
      return;
    }
    if (role === 'magic' && this.def.vfx === 'chainLash') {
      lashEffect(this.game, from, target.group.position.clone().setY(target.group.position.y + 1), 0xaab2bd);
      this._dealDamage(target, stats);
      return;
    }
    if (this.def.vfx === 'snowGust') {
      this.game.particles.burst(target.group.position, 14, { speed: 2, life: 0.8, size: 0.5, color: FXC.snow, grav: 1, spread: stats.splash });
      this._dealDamage(target, stats);
      return;
    }
    // projectile kinds by vfx
    const kindMap = {
      arrow: 'arrow', longArrow: 'arrow', boltArrow: 'bolt', featherDart: 'feather',
      ballistaBolt: 'bolt', maceShock: 'stone', lobStone: 'stone', rollingDisc: 'disc',
      sacredFlame: 'firepot', flameCone: 'firepot', scriptWard: 'ward', gloryBeam: 'ward',
      moltenSplash: 'firepot', spearThrow: 'arrow',
    };
    const kind = kindMap[vfx] || 'arrow';
    const arc = kind === 'stone' || kind === 'disc' ? (kind === 'disc' ? 1 : 5) : 0;
    const trail = vfx === 'sacredFlame' || vfx === 'moltenSplash' ? FXC.ember
      : vfx === 'scriptWard' || vfx === 'gloryBeam' ? FXC.sacred
        : vfx === 'featherDart' ? FXC.feather
          : vfx === 'longArrow' ? FXC.gold : null;
    // muzzle flash — a bright puff at the firing point gives the shot a visible origin
    const mdir = target.group.position.clone().sub(from).normalize();
    this.game.particles.burst(from.clone().addScaledVector(mdir, 0.4), 5, {
      speed: 3, up: 0.4, life: 0.18, size: 0.42, color: trail || FXC.spark, grav: 0, spread: 0.5, drag: 4,
    });
    // recoil kick back along the firing axis (heavier ordnance kicks harder)
    this._recoilDir = mdir.clone().setY(0).normalize().negate();
    this._recoil = kind === 'stone' || kind === 'bolt' || kind === 'disc' ? 0.18 : 0.09;
    this.game.projectiles.push(new Projectile(this.game, {
      kind, from, target, arc,
      speed: kind === 'stone' ? 14 : kind === 'disc' ? 10 : 28,
      pierce,
      trail,
      onHit: (e, p) => this._dealDamage(e, stats, 1, p),
    }));
    if (vfx === 'longArrow') this.game.audio.longArrow();
    else if (kind === 'stone') this.game.audio.mace();
    else this.game.audio.arrow();
  }

  update(dt, time) {
    if (!this.alive) return;
    if (this._heroModel?.anim) this._heroModel.anim.mixer.update(dt); // hero idle clip
    this.silencedT -= dt; this.disabledT -= dt; this.garrisonDisabledT -= dt;
    this.heroActiveCd -= dt;
    this.palaceDamageT -= dt;
    this.palaceRangeT -= dt;
    this.palaceSynergyT -= dt;
    if (this._brazenT > 0) this._brazenT -= dt;

    // banner + flame idle animation
    const reduced = settings.get('reducedMotion');
    for (const b of this.model.animated.banners) animateBanner(b, time + this.id, reduced ? 0.3 : 1);
    // flames now flicker entirely inside the procedural fire shader (updateFire) — the old
    // per-frame scale-pulse here just fought it, so it's gone.
    // tower recoil: the model kicks back along the firing axis on each shot, then eases home.
    if (this._recoil > 0) {
      this._recoil = Math.max(0, this._recoil * Math.pow(0.0009, dt) - dt * 0.03);
      this.group.position.copy(this.pos).addScaledVector(this._recoilDir, this._recoil);
      if (this._recoil <= 0) this.group.position.copy(this.pos);
    }
    for (const sp of this.model.animated.spinners) sp.rotation.y += dt * 0.8;
    for (const gl of this.model.animated.glows || []) {
      const s = 1 + Math.sin(time * 2.2 + this.id) * 0.25;
      gl.scale.set(s, s, s);
    }
    this._updateHeroCommandStandard(dt, time, reduced);
    this._updatePalacePulseFx(dt, time, reduced);

    // ambient flame column — fire altars/gates burn perpetually, not only when firing
    if (this.def.role === 'fire' && !reduced && Math.random() < dt * 34) {
      const p = this.pos, h = this.model.height;
      const n = 1 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.32;
        const hot = Math.random();
        const c = hot > 0.62 ? FXC.flameCore : hot > 0.32 ? FXC.ember : FXC.spark;
        this.game.particles.spawn(
          p.x + Math.cos(a) * r, p.y + h * 0.5 + Math.random() * 0.35, p.z + Math.sin(a) * r,
          (Math.random() - 0.5) * 0.4, 2.3 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4,
          0.7 + Math.random() * 0.5, 0.3 + Math.random() * 0.22,
          c[0], c[1], c[2], -1.1, 0.5,
        );
      }
    }

    // damaged smoke
    if (this.hp < this.maxHp * 0.7 && Math.random() < dt * 4) {
      const p = this.pos;
      this.game.particles.spawn(p.x + (Math.random() - 0.5), p.y + this.model.height * 0.6, p.z + (Math.random() - 0.5), 0, 1.2, 0, 1.4, 0.8, 0.25, 0.22, 0.2, -0.3, 0.5);
    }
    // featherCall: Zal regenerates a wounded tower
    if (this.hero?.special.key === 'featherCall' && this.hp < this.maxHp * 0.6) {
      this.hp = Math.min(this.maxHp, this.hp + 8 * dt);
      if (Math.random() < dt * 2) this.game.particles.burst(this.pos.clone().setY(this.pos.y + 2), 3, { speed: 0.8, life: 0.9, size: 0.4, color: FXC.feather, grav: -0.8 });
    }

    if (this.silencedT > 0 || this.disabledT > 0) return;

    const stats = this.getStats();

    // healing / repair pulses
    if (stats.heal || stats.repair) {
      this.healPulseT -= dt;
      if (this.healPulseT <= 0) {
        this.healPulseT = 1.0;
        if (stats.heal) {
          for (const s of this.game.soldiersNear(this.pos, stats.heal.radius)) {
            if (s.hp < s.maxHp) {
              s.hp = Math.min(s.maxHp, s.hp + stats.heal.hps);
              this.game.particles.burst(s.group.position, 2, { speed: 0.6, life: 0.7, size: 0.35, color: FXC.heal, grav: -1 });
            }
          }
          this.game.audio.shimmer();
        }
        const rep = stats.repair || (this.hero?.special.key === 'simurghAegis' ? { hps: 10, radius: 12 } : null);
        if (rep) {
          for (const t of this.game.towers) {
            if (t.alive && t !== this && t.hp < t.maxHp && t.pos.distanceTo(this.pos) < rep.radius) {
              t.hp = Math.min(t.maxHp, t.hp + rep.hps);
            }
          }
        }
      }
    }

    // attacks
    if (stats.damage > 0 && stats.rate > 0) {
      this.attackCd -= dt;
      if (this.attackCd <= 0) {
        const target = this._acquireTarget(stats);
        if (target) {
          this.attackCd = 1 / stats.rate;
          this._fire(target, stats);
        } else {
          this.attackCd = 0.1;
        }
      }
    }

    // borderArrow: Arash — once per wave, a map-crossing shot
    if (this.hero?.special.key === 'borderArrow' && !this.borderArrowUsed && this.game.waveActive) {
      const big = this.game.enemies.filter((e) => e.alive);
      if (big.length >= 6) {
        this.borderArrowUsed = true;
        this.game.audio.longArrow();
        const from = this._muzzlePos();
        for (const e of big) {
          e.takeDamage(stats.damage * 3, 'true');
          lashEffect(this.game, from, e.group.position.clone().setY(e.group.position.y + 1), 0xffd97a, 0.5);
        }
        this.game.engine.addShake(0.3);
      }
    }

    // garrison upkeep
    if (this.garrisonDisabledT <= 0) {
      for (const s of this.squads) s.update(dt, time);
    }
  }

  _updateHeroCommandStandard(dt, time, reduced) {
    if (!this.hero || !this._heroRing) return;
    const rank = getHeroRank(this.hero.id);
    const ready = Math.max(0, this.heroActiveCd || 0) <= 0.05;
    const pulse = 0.5 + Math.sin(time * (ready ? 3.6 : 1.6) + this.id) * 0.5;
    const commandT = Math.max(0, this._heroCommandT || 0);
    if (commandT > 0) this._heroCommandT = Math.max(0, commandT - dt);
    const commandK = Math.min(1, commandT / 1.05);
    const cooldown = ready ? 0 : Math.max(0, Math.min(1, (this.heroActiveCd || 0) / Math.max(1, 42 - rank * 4)));

    if (this._heroRing) {
      this._heroRing.rotation.z += dt * (ready ? 0.75 + rank * 0.12 : 0.22);
      this._heroRing.scale.setScalar(1 + (ready ? pulse * 0.035 : 0) + commandK * 0.18);
      this._heroRing.material.opacity = ready ? 0.58 + pulse * 0.2 + rank * 0.04 : 0.18 + (1 - cooldown) * 0.18;
    }
    if (this._heroReadyHalo) {
      this._heroReadyHalo.rotation.z -= dt * (ready ? 0.9 : 0.25);
      this._heroReadyHalo.scale.setScalar(1 + pulse * (ready ? 0.14 : 0.04) + commandK * 0.5);
      this._heroReadyHalo.material.opacity = ready
        ? 0.14 + pulse * 0.2 + rank * 0.025
        : 0.04 + (1 - cooldown) * 0.08;
    }
    if (this._heroFlashHalo) {
      this._heroFlashHalo.rotation.z += dt * 1.9;
      this._heroFlashHalo.scale.setScalar(0.75 + commandK * 1.35);
      this._heroFlashHalo.material.opacity = commandK * (reduced ? 0.28 : 0.62);
    }
    if (this._heroModel?.group) {
      const targetY = 0.05 + commandK * 0.18;
      this._heroModel.group.position.y += (targetY - this._heroModel.group.position.y) * Math.min(1, dt * 8);
      this._heroModel.group.rotation.y += commandK * dt * 0.55;
    }
  }

  _updatePalacePulseFx(dt, time, reduced) {
    if (!this._palacePulseHalo || (this._palacePulseT || 0) <= 0) return;
    this._palacePulseT = Math.max(0, this._palacePulseT - dt);
    const dur = Math.max(0.001, this._palacePulseDur || 1);
    const k = Math.max(0, Math.min(1, this._palacePulseT / dur));
    const out = 1 - k;
    const power = this._palacePulsePower || 1;
    const wave = reduced ? 0.55 : 0.62 + Math.sin(time * 9.5 + this.id) * 0.18;
    const flare = Math.sin(Math.min(1, out * 1.7) * Math.PI);
    const baseOpacity = (0.14 + flare * 0.26) * k * power;

    this._palacePulseHalo.rotation.z += dt * (1.25 + power * 0.5);
    this._palacePulseHalo.scale.setScalar(0.82 + out * (1.35 + power * 0.18));
    this._palacePulseHalo.material.opacity = reduced ? baseOpacity * 0.55 : baseOpacity;

    if (this._palacePulseCrown) {
      this._palacePulseCrown.rotation.z -= dt * (2.2 + power);
      this._palacePulseCrown.scale.setScalar(0.8 + flare * 0.42 + out * 0.18);
      this._palacePulseCrown.material.opacity = (reduced ? 0.28 : 0.52) * k * wave * power;
    }
    if (this._palacePulseBeam) {
      this._palacePulseBeam.rotation.y += dt * 1.6;
      this._palacePulseBeam.scale.setScalar(0.72 + flare * 0.32);
      this._palacePulseBeam.material.opacity = (reduced ? 0.06 : 0.14) * k * wave * power;
    }

    if (this._palacePulseT <= 0) {
      this._palacePulsePower = 0;
      this._palacePulseDur = 0;
      this._palacePulseHalo.material.opacity = 0;
      if (this._palacePulseCrown) this._palacePulseCrown.material.opacity = 0;
      if (this._palacePulseBeam) this._palacePulseBeam.material.opacity = 0;
    }
  }

  destroy() {
    for (const s of this.squads) s.destroy();
    this._removePalacePulseFx();
    this.group.removeFromParent();
  }
}
