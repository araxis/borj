const DEFAULT_CHALLENGE = {
  dur: 22,
  hpFrac: 0.25,
  rewardFarr: 16,
  rewardGold: 70,
  failSpeed: 1.08,
  failDamage: 1.12,
  failType: 'surge',
  successType: 'mark',
};

const SAGA_DEFAULTS = {
  trialType: 'woundOmen',
  tone: 'banner',
  sealIcon: '◆',
};

const TRIAL_SAGA = {
  woundOmen: { tone: 'banner', sealIcon: '◆' },
  bindTyrant: { tone: 'chains', sealIcon: '⛓' },
  clearFog: { tone: 'fog', sealIcon: '◌' },
  breakBanner: { tone: 'banner', sealIcon: '⚑' },
  silenceSiege: { tone: 'horn', sealIcon: '◈' },
  cutBrood: { tone: 'worm', sealIcon: '◎' },
  splitFeud: { tone: 'diadem', sealIcon: '♕' },
};

function saga(trialType, overrides = {}) {
  const base = TRIAL_SAGA[trialType] || TRIAL_SAGA.woundOmen;
  const tone = overrides.tone || base.tone || SAGA_DEFAULTS.tone;
  return {
    ...SAGA_DEFAULTS,
    ...base,
    ...overrides,
    trialType,
    tone,
    arrivalKey: overrides.arrivalKey || `bossSaga.arrival.${trialType}`,
    trialKey: overrides.trialKey || `bossSaga.trial.${trialType}`,
    successKey: overrides.successKey || `bossSaga.success.${trialType}`,
    failKey: overrides.failKey || `bossSaga.fail.${trialType}`,
    trophyKey: overrides.trophyKey,
    sealIcon: overrides.sealIcon || base.sealIcon || SAGA_DEFAULTS.sealIcon,
  };
}

export const BOSS_CHALLENGES = {
  houman: { dur: 21, hpFrac: 0.26, rewardFarr: 14, rewardGold: 65, failType: 'visehGuard', successType: 'breakGuard', saga: saga('breakBanner', { trophyKey: 'bossSaga.trophy.houman' }) },
  biderafsh: { dur: 22, hpFrac: 0.26, rewardFarr: 15, rewardGold: 70, failSpeed: 1.1, failType: 'bannerAdvance', successType: 'breakBanner', saga: saga('breakBanner', { trophyKey: 'bossSaga.trophy.biderafsh' }) },
  'div-e-sepid': { dur: 24, hpFrac: 0.24, rewardFarr: 18, rewardGold: 90, failDamage: 1.14, failType: 'whiteFog', successType: 'clearFog', saga: saga('clearFog', { trophyKey: 'bossSaga.trophy.div-e-sepid' }) },
  azhdaha: { dur: 22, hpFrac: 0.24, rewardFarr: 18, rewardGold: 90, failSpeed: 1.12, failType: 'dragonBurrow', successType: 'rakhshWarning', saga: saga('woundOmen', { tone: 'flame', sealIcon: '▲', trophyKey: 'bossSaga.trophy.azhdaha' }) },
  zahhak: { dur: 25, hpFrac: 0.22, rewardFarr: 20, rewardGold: 100, failDamage: 1.16, failType: 'serpentFeed', successType: 'antiTyrantChains', saga: saga('bindTyrant', { trophyKey: 'bossSaga.trophy.zahhak' }) },
  garsivaz: { dur: 20, hpFrac: 0.28, rewardFarr: 15, rewardGold: 75, failSpeed: 1.12, failType: 'falseCounsel', successType: 'unmaskCounsel', saga: saga('woundOmen', { tone: 'diadem', sealIcon: '◉', trophyKey: 'bossSaga.trophy.garsivaz' }) },
  shideh: { dur: 21, hpFrac: 0.28, rewardFarr: 16, rewardGold: 80, failSpeed: 1.12, failType: 'princelyWrath', successType: 'coolWrath', saga: saga('woundOmen', { tone: 'diadem', sealIcon: '♕', trophyKey: 'bossSaga.trophy.shideh' }) },
  arjasp: { dur: 23, hpFrac: 0.25, rewardFarr: 18, rewardGold: 90, failDamage: 1.16, failType: 'siegeHorns', successType: 'silenceSiege', saga: saga('silenceSiege', { trophyKey: 'bossSaga.trophy.arjasp' }) },
  puladwand: { dur: 24, hpFrac: 0.22, rewardFarr: 17, rewardGold: 95, failDamage: 1.15, failType: 'ironHide', successType: 'crackIron', saga: saga('woundOmen', { tone: 'iron', sealIcon: '▰', trophyKey: 'bossSaga.trophy.puladwand' }) },
  gorgin: { dur: 20, hpFrac: 0.3, rewardFarr: 15, rewardGold: 75, failSpeed: 1.13, failType: 'falseTrail', successType: 'unmaskTrail', saga: saga('woundOmen', { tone: 'banner', sealIcon: '◇', trophyKey: 'bossSaga.trophy.gorgin' }) },
  'haftvad-worm': { dur: 25, hpFrac: 0.23, rewardFarr: 19, rewardGold: 95, failSpeed: 1.08, failDamage: 1.15, failType: 'wormBrood', successType: 'cutBrood', saga: saga('cutBrood', { trophyKey: 'bossSaga.trophy.haftvad-worm' }) },
  kamus: { dur: 23, hpFrac: 0.25, rewardFarr: 18, rewardGold: 90, failSpeed: 1.1, failType: 'cavalryOath', successType: 'breakCavalry', saga: saga('breakBanner', { tone: 'cavalry', sealIcon: '♞', trophyKey: 'bossSaga.trophy.kamus' }) },
  tur: { dur: 23, hpFrac: 0.25, rewardFarr: 18, rewardGold: 95, failSpeed: 1.1, failDamage: 1.15, failType: 'bloodFeud', successType: 'settleFeud', saga: saga('splitFeud', { trophyKey: 'bossSaga.trophy.tur' }) },
  salm: { dur: 23, hpFrac: 0.25, rewardFarr: 18, rewardGold: 95, failSpeed: 1.1, failDamage: 1.15, failType: 'jealousVeil', successType: 'pierceJealousy', saga: saga('splitFeud', { trophyKey: 'bossSaga.trophy.salm' }) },
  afrasiab: { dur: 26, hpFrac: 0.22, rewardFarr: 22, rewardGold: 120, failSpeed: 1.08, failDamage: 1.18, failType: 'royalGuard', successType: 'breakRoyalGuard', saga: saga('breakBanner', { tone: 'diadem', sealIcon: '♕', trophyKey: 'bossSaga.trophy.afrasiab' }) },
};

export function bossChallengeDef(enemyId) {
  const cfg = BOSS_CHALLENGES[enemyId] || {};
  const sagaCfg = cfg.saga || saga('woundOmen', { trophyKey: `bossSaga.trophy.${enemyId}` });
  return {
    ...DEFAULT_CHALLENGE,
    ...cfg,
    saga: sagaCfg,
    enemyId,
    titleKey: `bossChallenge.${enemyId}.title`,
    loreKey: `bossChallenge.${enemyId}.lore`,
  };
}
