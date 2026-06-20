// Per-stage palace command config. Each campaign palace has one Muster squad and
// one Shahnameh-grounded royal boon. Boon types are handled in game.js.
export const DEFAULT_PALACE = {
  muster: { unit: 'spear-levy', count: 4, cost: 70, cd: 18 },
  boon: { type: 'heal', amount: 0.35, cost: 90, cd: 30, radius: 28, dur: 4 },
  loreKey: 'palace.lore.default',
};

export const PALACE_DEFS = {
  zabulistan: {
    muster: { unit: 'cavalry-lancers', count: 3, cost: 85, cd: 20 },
    boon: { type: 'rallyDamage', amount: 0.28, cost: 105, cd: 34, radius: 34, dur: 10 },
    loreKey: 'palace.lore.zabulistan',
  },
  sistan: {
    muster: { unit: 'spear-levy', count: 5, cost: 70, cd: 17 },
    boon: { type: 'goldProvision', amount: 120, cost: 55, cd: 32, radius: 26, dur: 6 },
    loreKey: 'palace.lore.sistan',
  },
  kabul: {
    muster: { unit: 'healer-acolytes', count: 3, cost: 80, cd: 22 },
    boon: { type: 'heal', amount: 0.45, cost: 95, cd: 30, radius: 30, dur: 5 },
    loreKey: 'palace.lore.kabul',
  },
  samangan: {
    muster: { unit: 'scout-riders', count: 3, cost: 85, cd: 22 },
    boon: { type: 'goldProvision', amount: 150, cost: 70, cd: 36, radius: 28, dur: 6 },
    loreKey: 'palace.lore.samangan',
  },
  'dez-sepid': {
    muster: { unit: 'spear-maidens', count: 4, cost: 85, cd: 20 },
    boon: { type: 'stunPulse', amount: 1.3, cost: 100, cd: 34, radius: 30, dur: 1.3, damageType: 'impact' },
    loreKey: 'palace.lore.dez-sepid',
  },
  mazandaran: {
    muster: { unit: 'mountain-hunters', count: 4, cost: 90, cd: 20 },
    boon: { type: 'bindChains', amount: 1.9, cost: 110, cd: 36, radius: 32, dur: 1.9, damageType: 'magic' },
    loreKey: 'palace.lore.mazandaran',
  },
  alborz: {
    muster: { unit: 'healer-acolytes', count: 4, cost: 80, cd: 20 },
    boon: { type: 'heal', amount: 0.55, cost: 95, cd: 28, radius: 34, dur: 5 },
    loreKey: 'palace.lore.alborz',
  },
  damavand: {
    muster: { unit: 'chain-binders', count: 4, cost: 95, cd: 22 },
    boon: { type: 'bindChains', amount: 2.5, cost: 125, cd: 38, radius: 36, dur: 2.5, damageType: 'magic' },
    loreKey: 'palace.lore.damavand',
  },
  'siyavash-gate': {
    muster: { unit: 'fire-keepers', count: 4, cost: 90, cd: 20 },
    boon: { type: 'burnRing', amount: 13, cost: 110, cd: 34, radius: 34, dur: 4, damageType: 'fire' },
    loreKey: 'palace.lore.siyavash-gate',
  },
  turan: {
    muster: { unit: 'cavalry-lancers', count: 3, cost: 95, cd: 24 },
    boon: { type: 'rallyDamage', amount: 0.22, cost: 100, cd: 34, radius: 36, dur: 10 },
    loreKey: 'palace.lore.turan',
  },
  balkh: {
    muster: { unit: 'halberdiers', count: 4, cost: 95, cd: 22 },
    boon: { type: 'rallyDamage', amount: 0.24, cost: 105, cd: 34, radius: 34, dur: 11 },
    loreKey: 'palace.lore.balkh',
  },
  'dez-roein': {
    muster: { unit: 'forge-workers', count: 4, cost: 85, cd: 20 },
    boon: { type: 'repairFortifications', amount: 0.42, cost: 115, cd: 34, radius: 36, dur: 5 },
    loreKey: 'palace.lore.dez-roein',
  },
  'manijeh-garden': {
    muster: { unit: 'night-wardens', count: 4, cost: 85, cd: 20 },
    boon: { type: 'rangeVision', amount: 0.22, cost: 100, cd: 32, radius: 34, dur: 12 },
    loreKey: 'palace.lore.manijeh-garden',
  },
  makran: {
    muster: { unit: 'caravan-guards', count: 4, cost: 85, cd: 20 },
    boon: { type: 'burnRing', amount: 10, cost: 105, cd: 34, radius: 34, dur: 4, damageType: 'fire' },
    loreKey: 'palace.lore.makran',
  },
  estakhr: {
    muster: { unit: 'stone-masons', count: 4, cost: 85, cd: 20 },
    boon: { type: 'repairFortifications', amount: 0.5, cost: 120, cd: 34, radius: 38, dur: 5 },
    loreKey: 'palace.lore.estakhr',
  },
  'gordafarid-fort': {
    muster: { unit: 'spear-maidens', count: 5, cost: 90, cd: 20 },
    boon: { type: 'stunPulse', amount: 1.5, cost: 110, cd: 34, radius: 32, dur: 1.5, damageType: 'impact' },
    loreKey: 'palace.lore.gordafarid-fort',
  },
  madayen: {
    muster: { unit: 'veteran-guard', count: 4, cost: 100, cd: 22 },
    boon: { type: 'repairFortifications', amount: 0.38, cost: 110, cd: 32, radius: 38, dur: 5 },
    loreKey: 'palace.lore.madayen',
  },
  'arash-watch': {
    muster: { unit: 'scout-riders', count: 4, cost: 90, cd: 20 },
    boon: { type: 'rangeVision', amount: 0.32, cost: 110, cd: 34, radius: 44, dur: 12 },
    loreKey: 'palace.lore.arash-watch',
  },
  'dez-bahman': {
    muster: { unit: 'mountain-hunters', count: 4, cost: 95, cd: 22 },
    boon: { type: 'bindChains', amount: 1.8, cost: 115, cd: 36, radius: 34, dur: 1.8, damageType: 'magic' },
    loreKey: 'palace.lore.dez-bahman',
  },
  'gang-dez': {
    muster: { unit: 'banner-bearers', count: 5, cost: 115, cd: 24 },
    boon: { type: 'rallyDamage', amount: 0.35, cost: 135, cd: 40, radius: 42, dur: 12 },
    loreKey: 'palace.lore.gang-dez',
  },
};

export const palaceDef = (placeId) => PALACE_DEFS[placeId] || DEFAULT_PALACE;
