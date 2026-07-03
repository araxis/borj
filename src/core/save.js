// Profile save/load — campaign progress, unlocks, codex reveals. localStorage only.
const KEY = 'std.profile.v1';

const DEFAULT_PROFILE = {
  completedMaps: [],        // map ids defended
  unlockedHeroes: [],       // hero ids beyond 'start' unlocks
  codexSeen: [],            // entry ids viewed at least once
  bestEndless: {},          // mapId -> best wave reached
  heroRanks: {},            // heroId -> 0..3 (persistent hero upgrade tree)
  bossSagas: {},            // bossId -> presentation-only saga record
  kheradEarned: 0,          // lifetime wisdom (Kherad) gathered — round-3 meta currency
  kheradSpent: 0,           // wisdom invested in the Ganj-e Danesh research tree
  research: [],             // unlocked research node ids
  heroMastery: {},          // heroId -> mastery node ids (Kherad-bought, persistent)
};

let profile = null;

export function loadProfile() {
  if (profile) return profile;
  try {
    const raw = localStorage.getItem(KEY);
    profile = raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
  } catch {
    profile = { ...DEFAULT_PROFILE };
  }
  // pre-Kherad saves lack these fields: the spread would alias DEFAULT_PROFILE's
  // array/object, and mutating it would corrupt the defaults — always own the copy
  profile.research = [...(profile.research || [])];
  profile.heroMastery = { ...(profile.heroMastery || {}) };
  return profile;
}

export function saveProfile() {
  if (!profile) return;
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

export function resetProfile() {
  profile = { ...DEFAULT_PROFILE, completedMaps: [], unlockedHeroes: [], codexSeen: [], bestEndless: {}, heroRanks: {}, bossSagas: {}, kheradEarned: 0, kheradSpent: 0, research: [], heroMastery: {} };
  saveProfile();
}

// ---- Kherad (خرد, wisdom) — the persistent meta currency of round 3 ----
// Baseline milestones award it from events that already fire below; the knowledge
// buildings (Library/Academy, phase K2) bank their per-wave harvest via addKherad too.
export const KHERAD_REWARDS = {
  mapFirstClear: 25,
  bossBroken: 8,
  bossDefeated: 15,
  codexEntry: 1,
  endlessBest10: 5, // per 10-wave best-milestone crossed
};

let kheradSession = 0; // gathered since the last takeSessionKherad() — end-screen tally

export function addKherad(n) {
  if (!(n > 0)) return 0;
  const p = loadProfile();
  p.kheradEarned = (p.kheradEarned || 0) + n;
  kheradSession += n;
  saveProfile();
  return n;
}

export function kheradBalance() {
  const p = loadProfile();
  return Math.max(0, (p.kheradEarned || 0) - (p.kheradSpent || 0));
}

export function spendKherad(n) {
  if (!(n > 0)) return true;
  if (kheradBalance() < n) return false;
  const p = loadProfile();
  p.kheradSpent = (p.kheradSpent || 0) + n;
  saveProfile();
  return true;
}

export function hasResearch(id) {
  return loadProfile().research.includes(id);
}

export function unlockResearch(id, cost = 0) {
  const p = loadProfile();
  if (p.research.includes(id)) return false;
  if (!spendKherad(cost)) return false;
  p.research.push(id);
  saveProfile();
  return true;
}

export function getHeroMastery(heroId) {
  return loadProfile().heroMastery[heroId] || [];
}

export function unlockHeroMastery(heroId, nodeId, cost = 0) {
  const p = loadProfile();
  const arr = (p.heroMastery[heroId] ||= []);
  if (arr.includes(nodeId)) return false;
  if (!spendKherad(cost)) return false;
  arr.push(nodeId);
  saveProfile();
  return true;
}

// drain the session tally (the end screen shows "wisdom gathered this battle")
export function takeSessionKherad() {
  const n = kheradSession;
  kheradSession = 0;
  return n;
}

export function markMapCompleted(mapId) {
  const p = loadProfile();
  if (!p.completedMaps.includes(mapId)) {
    p.completedMaps.push(mapId);
    addKherad(KHERAD_REWARDS.mapFirstClear);
    saveProfile();
  }
}

export function unlockHero(heroId) {
  const p = loadProfile();
  if (!p.unlockedHeroes.includes(heroId)) { p.unlockedHeroes.push(heroId); saveProfile(); return true; }
  return false;
}

export function markCodexSeen(id) {
  const p = loadProfile();
  if (!p.codexSeen.includes(id)) {
    p.codexSeen.push(id);
    addKherad(KHERAD_REWARDS.codexEntry); // every chronicled entry is wisdom gathered
    saveProfile();
  }
}

export function recordEndless(mapId, wave) {
  const p = loadProfile();
  const prev = p.bestEndless[mapId] || 0;
  if (wave > prev) {
    // each 10-wave best-milestone crossed banks wisdom
    const crossed = Math.floor(wave / 10) - Math.floor(prev / 10);
    if (crossed > 0) addKherad(crossed * KHERAD_REWARDS.endlessBest10);
    p.bestEndless[mapId] = wave;
    saveProfile();
  }
}

export function getHeroRank(heroId) {
  return loadProfile().heroRanks[heroId] || 0;
}

export function setHeroRank(heroId, rank) {
  const p = loadProfile();
  p.heroRanks[heroId] = Math.max(0, Math.min(3, rank));
  saveProfile();
}

export function getBossSagaRecord(bossId) {
  return loadProfile().bossSagas?.[bossId] || null;
}

export function recordBossSaga(bossId, mapId, result) {
  if (!bossId) return null;
  const p = loadProfile();
  p.bossSagas ||= {};
  const rec = p.bossSagas[bossId] || {
    defeated: false,
    broken: 0,
    hardened: 0,
    best: null,
    maps: [],
  };
  if (result === 'broken') {
    if (!rec.broken) addKherad(KHERAD_REWARDS.bossBroken); // first break of this saga
    rec.broken = (rec.broken || 0) + 1;
    rec.best = 'broken';
  } else if (result === 'hardened') {
    rec.hardened = (rec.hardened || 0) + 1;
    if (rec.best !== 'broken') rec.best = 'hardened';
  } else if (result === 'defeated') {
    if (!rec.defeated) addKherad(KHERAD_REWARDS.bossDefeated); // first trophy
    rec.defeated = true;
  }
  if (mapId && !rec.maps.includes(mapId)) rec.maps.push(mapId);
  p.bossSagas[bossId] = rec;
  saveProfile();
  return rec;
}
