// Profile save/load — campaign progress, unlocks, codex reveals. localStorage only.
const KEY = 'std.profile.v1';

const DEFAULT_PROFILE = {
  completedMaps: [],        // map ids defended
  unlockedHeroes: [],       // hero ids beyond 'start' unlocks
  codexSeen: [],            // entry ids viewed at least once
  bestEndless: {},          // mapId -> best wave reached
  heroRanks: {},            // heroId -> 0..3 (persistent hero upgrade tree)
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
  return profile;
}

export function saveProfile() {
  if (!profile) return;
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

export function resetProfile() {
  profile = { ...DEFAULT_PROFILE, completedMaps: [], unlockedHeroes: [], codexSeen: [], bestEndless: {} };
  saveProfile();
}

export function markMapCompleted(mapId) {
  const p = loadProfile();
  if (!p.completedMaps.includes(mapId)) { p.completedMaps.push(mapId); saveProfile(); }
}

export function unlockHero(heroId) {
  const p = loadProfile();
  if (!p.unlockedHeroes.includes(heroId)) { p.unlockedHeroes.push(heroId); saveProfile(); return true; }
  return false;
}

export function markCodexSeen(id) {
  const p = loadProfile();
  if (!p.codexSeen.includes(id)) { p.codexSeen.push(id); saveProfile(); }
}

export function recordEndless(mapId, wave) {
  const p = loadProfile();
  if (!p.bestEndless[mapId] || wave > p.bestEndless[mapId]) { p.bestEndless[mapId] = wave; saveProfile(); }
}

export function getHeroRank(heroId) {
  return loadProfile().heroRanks[heroId] || 0;
}

export function setHeroRank(heroId, rank) {
  const p = loadProfile();
  p.heroRanks[heroId] = Math.max(0, Math.min(3, rank));
  saveProfile();
}
