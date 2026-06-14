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
    this.silencedT = 0;
    this.disabledT = 0;
    this.garrisonDisabledT = 0;
    this.smokeT = 0;
    this.collapseStage = 0;     // 0 intact, 1 crown dropped, 2 destroyed
    this.borderArrowUsed = false;
    this.brazenUsed = false;
    this.rebuildUsed = false;
    this.invested = def.cost;
    this.squads = [];
    this.auraCache = {};
    this.healPulseT = 0;

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
    if (this.model) this.group?.removeFromParent();
    this.model = buildTower(this.def.model, this.ageIdx);
    this.group = this.model.group;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.pad.rot + Math.PI; // iwan faces the road
    this.game.scene.add(this.group);
    // hero standard: colored glow band when commanded
    if (this.hero) this._addHeroStandard();
  }

  _addHeroStandard() {
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
    // hero special: youngLion — fury below half HP
    if (this.hero?.special.key === 'youngLion' && this.hp < this.maxHp * 0.5) s.attackSpeedMod += 0.6;
    s.rate *= 1 + s.attackSpeedMod;
    // dread auras (Zahhak) slow tower attacks
    if (this.game.dreadAt(this.pos)) s.rate *= 0.7;
    return s;
  }

  assignHero(heroDef) {
    this.hero = heroDef;
    if (this._heroRing) this._heroRing.removeFromParent();
    this._addHeroStandard();
    const keepHpFrac = this.hp / this.maxHp;
    this.maxHp = this._computeMaxHp();
    this.hp = this.maxHp * keepHpFrac;
    this._spawnGarrison();
    this.game.audio.hornCall();
  }

  unassignHero() {
    this.hero = null;
    if (this._heroRing) { this._heroRing.removeFromParent(); this._heroRing = null; }
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
    this.game.particles.burst(this.pos.clone().setY(this.pos.y + 2), 24, { speed: 2.5, life: 0.9, size: 0.5, color: FXC.gold, grav: 2 });
    this.game.audio.forgeHammer();
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
    if (stats.trueDamagePortion > 0 && stats.trueDamagePortion < 1) {
      enemy.takeDamage(dmg * (1 - stats.trueDamagePortion), dmgType === 'true' ? 'magic' : dmgType, { armorShred: stats.armorShred });
      enemy.takeDamage(dmg * stats.trueDamagePortion, 'true');
    } else {
      enemy.takeDamage(dmg, dmgType, { armorShred: stats.armorShred });
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
        e.takeDamage(dmg, this.def.dmgType === 'arrow' ? 'impact' : this.def.dmgType);
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
    // hero signature: Rostam's mace shockwave every 6th shot
    if (this.hero?.special.key === 'maceShockwave' && this.shotCount % 6 === 0) {
      this.game.particles.burst(this.pos, 22, { speed: 5, up: 0.5, life: 0.6, size: 0.6, color: FXC.gold, grav: 2, spread: 3 });
      this.game.audio.mace();
      this.game.engine.addShake(0.15);
      for (const e of this.game.enemies) {
        if (e.alive && e.group.position.distanceTo(this.pos) < stats.range * 0.6) {
          e.takeDamage(stats.damage * 1.2, 'impact');
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
    this.silencedT -= dt; this.disabledT -= dt; this.garrisonDisabledT -= dt;
    if (this._brazenT > 0) this._brazenT -= dt;

    // banner + flame idle animation
    const reduced = settings.get('reducedMotion');
    for (const b of this.model.animated.banners) animateBanner(b, time + this.id, reduced ? 0.3 : 1);
    for (const f of this.model.animated.flames) {
      const s = 1 + Math.sin(time * 9 + this.id) * 0.18 + Math.random() * 0.06;
      f.scale.set(s, s * (1 + Math.sin(time * 13) * 0.1), s);
    }
    for (const sp of this.model.animated.spinners) sp.rotation.y += dt * 0.8;
    for (const gl of this.model.animated.glows || []) {
      const s = 1 + Math.sin(time * 2.2 + this.id) * 0.25;
      gl.scale.set(s, s, s);
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

  destroy() {
    for (const s of this.squads) s.destroy();
    this.group.removeFromParent();
  }
}
