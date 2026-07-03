// Crafted gold-line SVG icon set for HUD/codex surfaces. Emoji stay as the never-break
// fallback (img onerror swaps the glyph back in) — they render inconsistently across
// platforms and clash with the theme, so every surface prefers the SVGs.
import { el } from './dom.js';

export const ROLE_ICONS = {
  archer: '🏹', siege: '🪨', fire: '🔥', magic: '📜', support: '🪶',
  aura: '🚩', economy: '🪙', barracks: '🛡️', trap: '🕳️', wisdom: '📖',
};
export const ROLE_ICON_SRC = {
  archer: 'assets/ui/role-icons/archer.svg', siege: 'assets/ui/role-icons/siege.svg',
  fire: 'assets/ui/role-icons/fire.svg', magic: 'assets/ui/role-icons/magic.svg',
  support: 'assets/ui/role-icons/support.svg', aura: 'assets/ui/role-icons/aura.svg',
  economy: 'assets/ui/role-icons/economy.svg', barracks: 'assets/ui/role-icons/barracks.svg',
  trap: 'assets/ui/role-icons/trap.svg',
};
export const HERO_ICONS = {
  champion: '⚔️', sage: '🪶', guardian: '🕊️', forgemaster: '🔨', king: '👑',
  strategist: '📜', defender: '🛡️', protector: '🏮', matriarch: '👸', ancestor: '🗿',
  monsterSlayer: '🗡️', stateswoman: '🏛️', companion: '🐎', counselor: '💬', marshal: '🎺',
  archer: '🏹', gatekeeper: '🚪', rider: '🏇', martyr: '🕯️', prince: '🤴', striker: '🥊',
};
// hero-role icons: 17 crafted + 4 shared with the tower set (archer/sage/strategist/defender)
export const HERO_ICON_SRC = {
  champion: 'assets/ui/hero-icons/champion.svg', guardian: 'assets/ui/hero-icons/guardian.svg',
  forgemaster: 'assets/ui/hero-icons/forgemaster.svg', king: 'assets/ui/hero-icons/king.svg',
  protector: 'assets/ui/hero-icons/protector.svg', matriarch: 'assets/ui/hero-icons/matriarch.svg',
  ancestor: 'assets/ui/hero-icons/ancestor.svg', monsterSlayer: 'assets/ui/hero-icons/monsterSlayer.svg',
  stateswoman: 'assets/ui/hero-icons/stateswoman.svg', companion: 'assets/ui/hero-icons/companion.svg',
  counselor: 'assets/ui/hero-icons/counselor.svg', marshal: 'assets/ui/hero-icons/marshal.svg',
  gatekeeper: 'assets/ui/hero-icons/gatekeeper.svg', rider: 'assets/ui/hero-icons/rider.svg',
  martyr: 'assets/ui/hero-icons/martyr.svg', prince: 'assets/ui/hero-icons/prince.svg',
  striker: 'assets/ui/hero-icons/striker.svg',
  sage: 'assets/ui/role-icons/support.svg', strategist: 'assets/ui/role-icons/magic.svg',
  defender: 'assets/ui/role-icons/barracks.svg', archer: 'assets/ui/role-icons/archer.svg',
};

function iconImg(src, fallback, cls) {
  const img = el('img', { class: cls, src, alt: '', draggable: 'false' });
  img.onerror = () => img.replaceWith(document.createTextNode(fallback));
  return img;
}

export function roleIconEl(role, cls = 'role-icon-img') {
  const src = ROLE_ICON_SRC[role];
  if (!src) return document.createTextNode(ROLE_ICONS[role] || '▣');
  return iconImg(src, ROLE_ICONS[role] || '▣', cls);
}

export function heroIconEl(role, cls = 'role-icon-img') {
  const src = HERO_ICON_SRC[role];
  if (!src) return document.createTextNode(HERO_ICONS[role] || '⚔️');
  return iconImg(src, HERO_ICONS[role] || '⚔️', cls);
}

// top-bar stat chips share the same crafted-icon treatment (emoji as fallback)
export function statIconEl(name, fallback) {
  return iconImg(`assets/ui/stat-icons/${name}.svg`, fallback, 'role-icon-img stat-icon-img');
}
