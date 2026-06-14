// Settings store — persisted to localStorage, observable.
const DEFAULTS = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  muted: false,
  reducedAudio: false,
  quality: 'high', // low | medium | high
  shadows: true,
  bloom: true,
  reducedMotion: false,
  screenShake: true,
  uiScale: 1.0,
  difficulty: 'normal', // easy | normal | hard
};

const KEY = 'std.settings.v1';
let state = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
} catch { /* corrupted settings fall back to defaults */ }

const listeners = new Set();

export const settings = {
  get(k) { return state[k]; },
  all() { return { ...state }; },
  set(k, v) {
    if (state[k] === v) return;
    state[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked */ }
    listeners.forEach((fn) => fn(k, v));
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
