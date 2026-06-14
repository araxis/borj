import { EN } from '../data/lang/en.js';
import { FA } from '../data/lang/fa.js';

const LANGS = { en: EN, fa: FA };
let current = localStorage.getItem('std.lang') || 'en';
const listeners = new Set();

export function getLang() { return current; }
export function isRTL() { return current === 'fa'; }

export function setLang(lang) {
  if (!LANGS[lang] || lang === current) return;
  current = lang;
  localStorage.setItem('std.lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isRTL());
  listeners.forEach((fn) => fn(lang));
}

export function toggleLang() { setLang(current === 'en' ? 'fa' : 'en'); }

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function t(key, params) {
  let s = LANGS[current][key] ?? EN[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

// Optional lookup: returns the translation if the key exists for the current language,
// otherwise the provided fallback (used for per-id strings like special.rostam,
// ability.zahhak — English lives in the data files, Persian in fa.js).
export function tOpt(key, fallback) {
  const s = LANGS[current][key];
  return s ?? fallback ?? '';
}

// Localized field access for data entries: name/faName, short/shortFa, detail/detailFa, lore/loreFa
export function tf(obj, base) {
  if (!obj) return '';
  if (current === 'fa') {
    const fa = obj[base + 'Fa'] ?? obj['fa' + base.charAt(0).toUpperCase() + base.slice(1)];
    if (fa) return fa;
  }
  return obj[base] ?? '';
}

export function tName(obj) {
  if (!obj) return '';
  return current === 'fa' && obj.faName ? obj.faName : obj.name;
}

// The SECONDARY (opposite-script) name shown under the primary one: in fa mode
// the Latin name, otherwise the Persian. Driven by the same `current` as tName
// (NOT the document.body 'rtl' class, which can desync from the i18n state during
// HMR / before initLangDOM), and guaranteed to return a non-empty string — never
// null/undefined — so it can never stringify to the literal text "null".
export function tNameAlt(obj) {
  if (!obj) return '';
  return (current === 'fa' ? obj.name : obj.faName) ?? obj.name ?? obj.faName ?? '';
}

// Persian-digit formatting for FA mode
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export function tNum(n) {
  const s = String(n);
  if (current !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

export function initLangDOM() {
  document.documentElement.lang = current;
  document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isRTL());
}
