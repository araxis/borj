// Main menu, campaign selection, map intro, and victory/defeat screens.
import { el, $, clear, backMedallion, wireAction } from './dom.js';
import { t, tf, tName, tNameAlt, tNum, tOpt, toggleLang, onLangChange } from '../core/i18n.js';
import { applyAtlasCell } from '../core/atlas.js';
import { MAPS } from '../data/campaign.js';
import { PLACES_BY_ID, PLACE_ATLAS } from '../data/places.js';
import { HEROES, HERO_ATLAS } from '../data/heroes.js';
import { ENEMIES_BY_ID } from '../data/enemies.js';
import { bossChallengeDef } from '../data/bosschallenges.js';
import { loadProfile, takeSessionKherad, kheradBalance, hasResearch, unlockResearch, getMapStars } from '../core/save.js';
import { RESEARCH, RESEARCH_DISCIPLINES, RESEARCH_BY_ID } from '../data/research.js';
import { palaceThumb, generateThumbs } from './palaceThumbs.js';
import { audio } from '../core/audio.js';
import { hasPalace, loadPalace } from '../core/assets.js';
import { loadForestTrees, loadForestEnrich, loadRanges } from '../core/props3d.js';
import { loadBattle, clearBattle } from '../core/battlesave.js';
import { currentDifficulty, setDifficulty, DIFFICULTY_ORDER } from '../core/difficulty.js';

const ENDLESS_SEALS = [
  { id: 'bronze', min: 10, glyph: '◆' },
  { id: 'silver', min: 20, glyph: '✦' },
  { id: 'gold', min: 30, glyph: '✪' },
  { id: 'legend', min: 40, glyph: '✹' },
];

function endlessSealFor(bestWave = 0) {
  let current = null;
  for (const seal of ENDLESS_SEALS) if (bestWave >= seal.min) current = seal;
  return current;
}

function nextEndlessSealTarget(bestWave = 0) {
  return ENDLESS_SEALS.find((seal) => bestWave < seal.min) || null;
}

function endlessBestFor(mapDef, profile) {
  return Math.max(0, Number(profile?.bestEndless?.[mapDef?.id] || 0));
}

export class Menus {
  constructor(callbacks) {
    this.cb = callbacks; // { onStartMap(mapDef, endless), onCodex, onSettings }
    this._build();
    onLangChange(() => this._retext());
  }

  _build() {
    this.mainMenu = el('div', { class: 'overlay', id: 'mainMenu' },
      el('div', { class: 'dialog frame', style: { textAlign: 'center', minWidth: 'min(480px, 90vw)' } },
        el('div', { class: 'ember-veil', 'aria-hidden': 'true' }), // slow farr embers over the plate
        el('div', { class: 'title-illum', id: 'mmTitle' }, t('app.title')),
        el('div', { class: 'title-rule' }),
        el('div', { class: 'subtitle', id: 'mmSub' }, t('app.subtitle')),
        el('div', { class: 'menu-actions' },
          el('button', { class: 'gbtn primary', id: 'mmCampaign' }, t('menu.newCampaign')),
          el('button', { class: 'gbtn', id: 'mmEndless' }, t('menu.endless')),
          el('button', { class: 'gbtn', id: 'mmResearch' }, t('menu.research')),
          el('button', { class: 'gbtn', id: 'mmCodex' }, t('menu.codex')),
          el('button', { class: 'gbtn', id: 'mmSettings' }, t('menu.settings')),
          el('button', { class: 'gbtn', id: 'mmLang' }, t('menu.language')),
        ),
        el('div', { class: 'credit', id: 'mmCredit' }, t('menu.credit')),
      ),
    );
    this.campaignMenu = el('div', { class: 'overlay', id: 'campaignMenu' },
      el('div', { class: 'dialog frame' },
        backMedallion({ id: 'cmBack', 'aria-label': t('settings.back') }),
        el('h2', { class: 'ornament-title', id: 'cmTitle' }, t('campaign.title')),
        el('p', { class: 'subtitle', id: 'cmHint' }, t('campaign.endlessHint')),
        el('div', { id: 'campaignGrid' }),
      ),
    );
    this.mapIntro = el('div', { class: 'overlay', id: 'mapIntro' },
      el('div', { class: 'dialog frame mapintro', style: { textAlign: 'center', maxWidth: '640px' } },
        backMedallion({ id: 'miBack', 'aria-label': t('settings.back') }),
        el('div', { class: 'rp-portrait', id: 'miImg', style: { maxWidth: '420px', margin: '0 auto' } }),
        el('div', { class: 'rp-name', id: 'miName' }),
        el('div', { class: 'rp-faname', id: 'miFa' }),
        el('p', { class: 'storyref', id: 'miRef', style: { color: '#a8c4c0', fontStyle: 'italic', margin: '6px 0' } }),
        el('div', { class: 'introtext', id: 'miText' }),
        el('div', { class: 'introtext', id: 'miText2', style: { fontSize: '0.9rem', color: '#bfae88', fontStyle: 'italic' } }),
        el('div', { class: 'boss-saga-intro', id: 'miBossSaga', hidden: true }),
        el('div', { class: 'endless-intro-seal', id: 'miEndlessSeal', hidden: true }),
        el('div', { class: 'intro-flourish', 'aria-hidden': 'true' }),
        el('div', { class: 'diffpick', id: 'miDiff' }),
        el('div', { class: 'intro-prepare', id: 'miPreparing', 'aria-live': 'polite' }),
        el('div', { class: 'intro-launch' },
          el('button', { class: 'gbtn primary launch', id: 'miStart' }, t('campaign.start')),
        ),
      ),
    );
    // the Ganj-e Danesh: spend banked Kherad on persistent research
    this.researchMenu = el('div', { class: 'overlay', id: 'researchMenu' },
      el('div', { class: 'dialog frame' },
        backMedallion({ id: 'rsBack', 'aria-label': t('settings.back') }),
        el('h2', { class: 'ornament-title', id: 'rsTitle' }, t('research.title')),
        el('p', { class: 'subtitle', id: 'rsSub' }, t('research.subtitle')),
        el('div', { class: 'research-balance', id: 'rsBalance' }),
        el('div', { id: 'researchBody' }),
      ),
    );
    this.endScreen = el('div', { class: 'overlay', id: 'endScreen' },
      el('div', { class: 'dialog frame', style: { textAlign: 'center', minWidth: 'min(560px, 90vw)' } },
        el('div', { class: 'endtitle', id: 'endTitle' }),
        el('div', { class: 'end-stars', id: 'endStars', hidden: true }),
        el('p', { class: 'subtitle', id: 'endSub' }),
        el('div', { class: 'end-kherad', id: 'endKherad', hidden: true }),
        el('div', { class: 'endless-end-seal', id: 'endEndlessSeal', hidden: true }),
        el('div', { class: 'unlocks', id: 'endUnlocks' }),
        el('div', { class: 'end-actions', id: 'endActions' }),
      ),
    );
    document.body.append(this.mainMenu, this.campaignMenu, this.mapIntro, this.researchMenu, this.endScreen);

    $('#mmCampaign').onclick = () => { audio.unlock(); audio.ui(); this.showCampaign(false); };
    $('#mmEndless').onclick = () => { audio.unlock(); audio.ui(); this.showCampaign(true); };
    $('#mmResearch').onclick = () => { audio.unlock(); audio.ui(); this.showResearch(); };
    $('#rsBack').onclick = () => { audio.ui(); this.showMain(); };
    $('#mmCodex').onclick = () => { audio.unlock(); this.cb.onCodex(); };
    $('#mmSettings').onclick = () => { audio.unlock(); this.cb.onSettings(); };
    $('#mmLang').onclick = () => { toggleLang(); };
    $('#cmBack').onclick = () => { this.hideAll(); this.showMain(); };
  }

  _retext() {
    $('#mmTitle').textContent = t('app.title');
    $('#mmSub').textContent = t('app.subtitle');
    $('#mmCampaign').textContent = t('menu.newCampaign');
    $('#mmEndless').textContent = t('menu.endless');
    $('#mmCodex').textContent = t('menu.codex');
    $('#mmSettings').textContent = t('menu.settings');
    $('#mmLang').textContent = t('menu.language');
    $('#mmCredit').textContent = t('menu.credit');
    $('#cmTitle').textContent = t('campaign.title');
    $('#cmHint').textContent = t('campaign.endlessHint');
    $('#mmResearch').textContent = t('menu.research');
    $('#rsTitle').textContent = t('research.title');
    $('#rsSub').textContent = t('research.subtitle');
    if (this.campaignMenu.classList.contains('visible')) this.showCampaign(this._endlessPick);
    if (this.researchMenu.classList.contains('visible')) this.showResearch();
  }

  // ---- the Ganj-e Danesh: spend banked Kherad on persistent research ----
  showResearch() {
    this.hideAll();
    this.researchMenu.classList.add('visible');
    const balance = kheradBalance();
    $('#rsBalance').textContent = `📖 ${t('kherad.total', { n: tNum(balance) })}`;
    const body = clear($('#researchBody'));
    for (const disc of RESEARCH_DISCIPLINES) {
      const nodes = RESEARCH.filter((r) => r.disc === disc.id);
      if (!nodes.length) continue;
      const grid = el('div', { class: 'research-grid' });
      for (const node of nodes) {
        const owned = hasResearch(node.id);
        const reqMet = !node.requires || hasResearch(node.requires);
        const affordable = balance >= node.cost;
        const state = owned ? 'owned' : !reqMet ? 'sealed' : affordable ? 'ready' : 'costly';
        const card = el('button', { class: `research-node ${state}` },
          el('span', { class: 'rn-glyph' }, owned ? '✪' : !reqMet ? '🔒' : disc.icon),
          el('b', { class: 'rn-name' }, tName(node)),
          el('span', { class: 'rn-desc' }, tf(node, 'desc')),
          el('span', { class: 'rn-foot' },
            owned ? t('research.owned')
              : !reqMet ? t('research.requires', { name: tName(RESEARCH_BY_ID[node.requires]) })
                : `📖 ${tNum(node.cost)}`),
        );
        if (state === 'ready') {
          card.onclick = () => {
            if (unlockResearch(node.id, node.cost)) { audio.codex(); this.showResearch(); }
          };
        } else card.setAttribute('aria-disabled', 'true');
        grid.append(card);
      }
      body.append(
        el('h3', { class: 'research-disc' }, `${disc.icon} ${t('research.disc.' + disc.id)}`),
        grid,
      );
    }
  }

  showMain() { this.hideAll(); this.mainMenu.classList.add('visible'); }

  showCampaign(endlessPick) {
    this.hideAll();
    this._endlessPick = endlessPick;
    this.campaignMenu.classList.add('visible');
    const grid = clear($('#campaignGrid'));
    const profile = loadProfile();
    const sorted = [...MAPS].sort((a, b) => a.order - b.order);
    const sandboxPick = location.hash.toLowerCase().includes('sandbox');
    for (const m of sorted) {
      const place = PLACES_BY_ID[m.id];
      const prev = sorted.find((x) => x.order === m.order - 1);
      const unlocked = m.order === 1 || (prev && profile.completedMaps.includes(prev.id));
      const done = profile.completedMaps.includes(m.id);
      const available = sandboxPick || (endlessPick ? done : unlocked);
      const img = el('div', { class: 'mapimg' });
      applyAtlasCell(img, PLACE_ATLAS, place.atlas);
      const bossSaga = this._renderCampaignBossSaga(m, profile);
      const bestEndless = endlessBestFor(m, profile);
      const endlessSeal = endlessPick && done ? this._renderEndlessSeal(bestEndless, 'card') : null;
      const card = el('div', {
        class: 'mapcard' + (available ? '' : ' locked'),
        'aria-label': `${tName(place)}. ${t('campaign.waves')}: ${tNum(m.waves)}`,
      },
        img,
        el('div', { class: 'mapname' }, tName(place)),
        el('div', { class: 'mapsub' },
          endlessPick && done
            ? t('endless.best', { wave: bestEndless ? tNum(bestEndless) : t('endless.none') })
            : `${t('campaign.waves')}: ${tNum(m.waves)}`),
        endlessSeal,
        bossSaga,
        el('div', { class: 'ordern' }, tNum(m.order)),
        done ? el('div', { class: 'done' }, '✓ ' + t('campaign.completed')) : null,
      );
      wireAction(card, () => { audio.ui(); this.showMapIntro(m, endlessPick); }, { disabled: !available });
      grid.append(card);
    }

    // C3: the Map of Iran — a parchment journey with stage nodes at their storied
    // places. The card grid above stays in the DOM as the narrow-screen fallback;
    // CSS decides which of the two is visible.
    const oldMap = $('#campaignMap');
    if (oldMap) oldMap.remove();
    grid.parentNode.insertBefore(this._buildIranMap(sorted, profile, endlessPick, sandboxPick), grid);
  }

  // stage positions on the stylized Iran/Turan parchment (viewBox 100×56, y down).
  // Loyal to the epic's geography: Sistan/Zabulistan SE, Mazandaran on the Caspian,
  // Turan beyond the Oxus NE, Madayen W, Persepolis SW.
  // (tuned 2026-07-03 to the delivered painting assets/ui/map-iran.jpg: Alborz crest
  // and Damavand sit higher in the art, Kabul's highland knot further right, the
  // Mesopotamian plain hugs the west edge)
  static MAP_POS = {
    'zabulistan': [66, 44], 'sistan': [61, 47], 'kabul': [75, 33], 'samangan': [78, 24],
    'dez-sepid': [58, 27], 'mazandaran': [48, 14], 'alborz': [34, 13], 'damavand': [40, 15],
    'siyavash-gate': [62, 17], 'turan': [78, 11], 'balkh': [70, 19], 'dez-roein': [88, 14],
    'manijeh-garden': [85, 7], 'makran': [56, 50], 'estakhr': [34, 46], 'gordafarid-fort': [52, 24],
    'madayen': [14, 34], 'arash-watch': [52, 13], 'dez-bahman': [28, 16], 'gang-dez': [93, 6],
  };

  _buildIranMap(sorted, profile, endlessPick, sandboxPick) {
    const POS = Menus.MAP_POS;
    const pane = el('div', { id: 'campaignMap' });
    // painted-map artwork: when the authored painting exists it becomes the terrain
    // (public/assets/ui/map-iran.jpg, 100:56 — brief in memory/map-art-prompt.md) and
    // the procedural inked doodles hide; a missing file falls back to the CSS parchment
    const art = el('img', { class: 'map-art', src: 'assets/ui/map-iran.jpg', alt: '', draggable: 'false' });
    art.onload = () => pane.classList.add('has-art');
    art.onerror = () => art.remove();
    pane.append(art);
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs = {}, text = null) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      return n;
    };
    const svg = mk('svg', { viewBox: '0 0 100 56', preserveAspectRatio: 'none', 'aria-hidden': 'true' });

    // ---- illustrated terrain (its own group so the pointer parallax can drift it) ----
    const terrain = mk('g', { class: 'map-terrain' });
    // seas: the Hyrcanian Sea (Caspian) up north, the Sea of Pars (Gulf) at the south-west
    terrain.append(mk('path', { class: 'map-sea', d: 'M33 3 Q40 1 47 3.5 Q52 5.5 50 8.6 Q44 10.6 37.5 8.8 Q32.5 7 33 3 Z' }));
    terrain.append(mk('path', { class: 'map-sea', d: 'M4 49 Q13 45.5 23 48.5 Q30 50.6 35 55.5 L4 55.5 Z' }));
    for (const wd of ['M36 5 q2 -0.8 4 0', 'M40 7 q2 -0.8 4 0', 'M11 51 q2 -0.8 4 0', 'M18 52.5 q2 -0.8 4 0', 'M26 51.5 q2 -0.8 4 0']) {
      terrain.append(mk('path', { class: 'map-wave', d: wd }));
    }
    // rivers: the Oxus dividing Iran from Turan, the Helmand feeding Sistan
    terrain.append(mk('path', { class: 'map-river', d: 'M60 2.5 Q68 7 73 11.5 Q77 15.5 84 17.5' }));
    terrain.append(mk('path', { class: 'map-river', d: 'M70 40 Q66 44 62.5 46.5' }));
    // mountain chains: the Alborz wall across the north, the Zagros diagonal, Kabul heights
    const ridge = (x0, y0, n, dx, s = 1) => {
      let d = '';
      for (let i = 0; i < n; i++) {
        const x = x0 + i * dx, y = y0 + Math.sin(i * 2.1) * 0.7;
        d += `M${x.toFixed(1)} ${y.toFixed(1)} l${1.1 * s} ${-2.1 * s} l${1.1 * s} ${2.1 * s}`;
      }
      return d;
    };
    terrain.append(mk('path', { class: 'map-ridge', d: ridge(30, 14, 9, 2.6) }));
    terrain.append(mk('path', { class: 'map-ridge faint', d: ridge(32, 16.5, 7, 2.6, 0.6) }));
    terrain.append(mk('path', { class: 'map-ridge', d: ridge(21, 24, 8, 2.2, 0.8) + ridge(26, 31, 6, 2.2, 0.8) + ridge(30, 38, 5, 2.2, 0.8) }));
    terrain.append(mk('path', { class: 'map-ridge', d: ridge(70, 30, 5, 2.4, 0.9) }));
    // the central deserts: a stipple of dunes
    for (let i = 0; i < 16; i++) {
      const dx2 = 42 + (i % 5) * 4.4 + ((i * 7) % 3), dy2 = 28 + Math.floor(i / 5) * 3.4 + (i % 2) * 1.4;
      terrain.append(mk('path', { class: 'map-dune', d: `M${dx2} ${dy2} q1.5 -1 3 0` }));
    }
    // region calligraphy + a compass rose
    terrain.append(mk('text', { class: 'map-region', x: 38, y: 36, 'text-anchor': 'middle' }, t('map.iran')));
    terrain.append(mk('text', { class: 'map-region', x: 82, y: 6, 'text-anchor': 'middle' }, t('map.turan')));
    terrain.append(mk('text', { class: 'map-region small', x: 42.5, y: 4.2, 'text-anchor': 'middle' }, t('map.caspian')));
    terrain.append(mk('text', { class: 'map-region small', x: 16, y: 53.5, 'text-anchor': 'middle' }, t('map.gulf')));
    const rose = mk('g', { class: 'map-rose', transform: 'translate(8.5 9)' });
    rose.append(mk('path', { d: 'M0 -3.4 L0.8 -0.8 L3.4 0 L0.8 0.8 L0 3.4 L-0.8 0.8 L-3.4 0 L-0.8 -0.8 Z' }));
    rose.append(mk('circle', { r: 0.55 }));
    terrain.append(rose);
    svg.append(terrain);

    // ---- the campaign road: a smooth caravan route, not a surveyor's zigzag ----
    const smooth = (pts) => {
      if (pts.length < 2) return '';
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)} ` +
          `${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)} ${p2[0]} ${p2[1]}`;
      }
      return d;
    };
    const all = sorted.map((m) => POS[m.id] || [50, 28]);
    let doneCount = 0;
    for (const m of sorted) { if (profile.completedMaps.includes(m.id)) doneCount++; else break; }
    const donePts = all.slice(0, Math.min(doneCount + 1, all.length));
    // the road ahead is the faintest sketch; the conquered stretch is an inked gold road
    svg.append(mk('path', { class: 'journey-line', d: smooth(all.slice(Math.max(0, donePts.length - 1))) }));
    if (donePts.length >= 2) {
      svg.append(mk('path', { class: 'journey-line done', id: 'journeyDone', d: smooth(donePts) }));
      // the banner-bearer rides the conquered road, endlessly retelling the campaign
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const rider = mk('text', { class: 'map-traveler', 'font-size': '3.2', y: '-1' }, '⚑');
        const motion = mk('animateMotion', { dur: `${Math.max(8, donePts.length * 4)}s`, repeatCount: 'indefinite', rotate: '0' });
        const mp = mk('mpath', {});
        mp.setAttribute('href', '#journeyDone');
        motion.append(mp);
        rider.append(motion);
        svg.append(rider);
      }
    }
    pane.append(svg);

    // ---- hover tooltip: the stage's chronicle card ----
    const tip = el('div', { class: 'map-tooltip' });
    pane.append(tip);
    const showTip = (m, place, x, y, available, done) => {
      clear(tip);
      tip.append(el('b', {}, tName(place)));
      tip.append(el('span', { class: 'tip-sub' }, tNameAlt(place)));
      tip.append(el('span', {}, `${t('campaign.waves')}: ${tNum(m.waves)}`));
      if (m.boss) {
        const ch = bossChallengeDef(m.boss);
        tip.append(el('span', { class: 'tip-saga' }, `◆ ${tOpt(ch.titleKey, t('bossSaga.campaign'))}`));
      }
      if (endlessPick && done) {
        const bestEndless = endlessBestFor(m, profile);
        const seal = endlessSealFor(bestEndless);
        const next = nextEndlessSealTarget(bestEndless);
        tip.append(el('span', { class: 'tip-endless' }, t('endless.best', { wave: bestEndless ? tNum(bestEndless) : t('endless.none') })));
        tip.append(el('span', { class: 'tip-endless' }, `${seal?.glyph || '∞'} ${this._endlessSealLabel(seal)}`));
        tip.append(el('span', { class: 'tip-endless' }, next
          ? t('endless.next', { seal: this._endlessSealLabel(next), wave: tNum(next.min) })
          : t('endless.legendHeld')));
      }
      if (!available) tip.append(el('span', { class: 'tip-locked' }, t('map.locked')));
      else if (done) tip.append(el('span', { class: 'tip-done' }, '✓ ' + t('campaign.completed')));
      tip.style.left = x + '%';
      tip.style.top = (y / 56) * 100 + '%';
      tip.classList.add('show');
    };
    const hideTip = () => tip.classList.remove('show');

    for (const m of sorted) {
      const place = PLACES_BY_ID[m.id];
      const [x, y] = POS[m.id] || [50, 28];
      const prev = sorted.find((s) => s.order === m.order - 1);
      const unlocked = m.order === 1 || (prev && profile.completedMaps.includes(prev.id));
      const done = profile.completedMaps.includes(m.id);
      const available = sandboxPick || (endlessPick ? done : unlocked);
      const frontier = available && !done;
      const state = done ? 'done' : frontier ? 'frontier' : available ? 'done' : 'locked';
      const bestEndless = endlessBestFor(m, profile);
      const endlessSeal = endlessSealFor(bestEndless);
      // the stage's real palace, rendered as a 3D portrait miniature (falls back to
      // the glyph medallion until its portrait has been generated once)
      const thumb = palaceThumb(m.id);
      const medallion = el('span', { class: 'map-node-medallion' },
        thumb ? el('img', { class: 'node-palace', src: thumb, alt: '', draggable: 'false' })
          : (done ? '✪' : frontier ? '✦' : tNum(m.order)),
        el('span', { class: 'node-badge' }, done ? '✪' : frontier ? '✦' : tNum(m.order)),
      );
      const node = el('button', {
        class: `map-node ${state}${thumb ? ' has-palace' : ''}`,
        style: { left: x + '%', top: (y / 56) * 100 + '%' },
        'aria-label': `${tName(place)}. ${t('campaign.waves')}: ${tNum(m.waves)}`,
        'data-place': m.id,
      },
        medallion,
        m.boss ? el('span', { class: 'map-node-wax', 'aria-hidden': 'true' }) : null,
        el('span', { class: 'map-node-name' }, tName(place)),
        // Farr seals: best defense rating (lives kept) under the stage name
        done && !endlessPick ? el('span', { class: 'map-node-stars', 'aria-hidden': 'true' },
          ...[1, 2, 3].map((i) => el('span', { class: 'seal' + (i <= getMapStars(m.id) ? ' lit' : '') }, '✦'))) : null,
        endlessPick && done ? el('span', {
          class: `map-node-endless ${endlessSeal?.id || 'none'}`,
          'aria-label': `${t('endless.best', { wave: bestEndless ? tNum(bestEndless) : t('endless.none') })}. ${this._endlessSealLabel(endlessSeal)}`,
        }, endlessSeal?.glyph || '∞') : null,
      );
      // locked nodes stay hoverable (a disabled button swallows mouse events),
      // they just refuse the click
      if (available) node.onclick = () => { audio.ui(); hideTip(); this.showMapIntro(m, endlessPick); };
      else node.setAttribute('aria-disabled', 'true');
      for (const [evIn, evOut] of [['mouseenter', 'mouseleave'], ['focus', 'blur']]) {
        node.addEventListener(evIn, () => showTip(m, place, x, y, available, done));
        node.addEventListener(evOut, hideTip);
      }
      pane.append(node);
    }

    // ---- 3D palace portraits: generate any missing ones progressively and swap them
    // in live (first visit only — afterwards they come straight from localStorage) ----
    generateThumbs(sorted.map((m) => m.id), (id, url) => {
      const node = pane.querySelector(`.map-node[data-place="${id}"]`);
      if (!node) return;
      const med = node.querySelector('.map-node-medallion');
      const badge = med.querySelector('.node-badge');
      med.textContent = '';
      med.append(el('img', { class: 'node-palace', src: url, alt: '', draggable: 'false' }));
      if (badge) med.append(badge);
      node.classList.add('has-palace');
    });

    // ---- pointer parallax: the terrain drifts under the nodes, the map feels deep ----
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pane.addEventListener('mousemove', (e) => {
        const r = pane.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        terrain.style.transform = `translate(${(-nx * 1.4).toFixed(2)}px, ${(-ny * 1).toFixed(2)}px)`;
        // the painting drifts too (pre-scaled ~3% in CSS so edges never peek in)
        art.style.transform = `scale(1.035) translate(${(-nx * 8).toFixed(1)}px, ${(-ny * 5).toFixed(1)}px)`;
      });
      pane.addEventListener('mouseleave', () => { terrain.style.transform = ''; art.style.transform = ''; });
    }
    return pane;
  }

  showMapIntro(mapDef, endless) {
    this.hideAll();
    this.mapIntro.classList.add('visible');
    const place = PLACES_BY_ID[mapDef.id];
    this._prepareField(mapDef, place);
    applyAtlasCell($('#miImg'), PLACE_ATLAS, place.atlas);
    $('#miName').textContent = tName(place);
    $('#miFa').textContent = tNameAlt(place);
    $('#miRef').textContent = tOpt('storyref.' + place.id, place.sourceRef);
    $('#miText').textContent = t(mapDef.introKey);
    const deep = t('intro2.' + mapDef.id);
    $('#miText2').textContent = deep !== 'intro2.' + mapDef.id ? deep : '';
    this._renderIntroBossSaga(mapDef);
    this._renderIntroEndlessSeal(mapDef, endless);
    const unlockHeroes = HEROES.filter((h) => h.unlock.type === 'campaign' && h.unlock.map === mapDef.id);
    // resume a saved mid-battle for this stage, if one exists (else a normal fresh start)
    const startBtn = $('#miStart');
    const prevResume = document.getElementById('miResume'); if (prevResume) prevResume.remove();
    const snap = loadBattle(mapDef.id);
    if (snap) {
      const resume = el('button', {}, t('mapintro.resume', { wave: tNum(snap.waveIdx || 0) }));
      resume.id = 'miResume'; resume.className = startBtn.className;
      resume.onclick = () => { audio.unlock(); audio.hornCall(); this.hideAll(); this.cb.onStartMap(mapDef, endless, snap); };
      startBtn.parentNode.insertBefore(resume, startBtn);
      startBtn.textContent = t('mapintro.newGame') + (endless ? ' ∞' : '');
      startBtn.onclick = () => { audio.unlock(); audio.hornCall(); clearBattle(); this.hideAll(); this.cb.onStartMap(mapDef, endless, null); };
    } else {
      startBtn.textContent = t('campaign.start') + (endless ? ' ∞' : '');
      startBtn.onclick = () => { audio.unlock(); audio.hornCall(); this.hideAll(); this.cb.onStartMap(mapDef, endless); };
    }
    $('#miBack').onclick = () => this.showCampaign(endless);
    this._renderDiff();
  }

  _prepareField(mapDef, place) {
    const box = $('#miPreparing');
    const startBtn = $('#miStart');
    const seq = (this._prepareSeq || 0) + 1;
    this._prepareSeq = seq;
    clearTimeout(this._prepareTimer);
    clearTimeout(this._prepareReadyTimer);
    startBtn?.classList.remove('field-ready');
    if (box) {
      box.className = 'intro-prepare loading';
      box.textContent = t('mapintro.preparing');
    }

    const tasks = [
      (done) => { if (hasPalace(mapDef.id)) loadPalace(mapDef.id, done); else done(); },
      (done) => loadRanges(done),
    ];
    if (place?.biome === 'forest') {
      tasks.push((done) => loadForestTrees(done));
      tasks.push((done) => loadForestEnrich(done));
    }

    let done = 0;
    let ready = false;
    const minReadyAt = performance.now() + 1200;
    const markReady = () => {
      if (ready || this._prepareSeq !== seq) return;
      const wait = minReadyAt - performance.now();
      if (wait > 0) {
        this._prepareReadyTimer = setTimeout(markReady, wait);
        return;
      }
      ready = true;
      clearTimeout(this._prepareTimer);
      clearTimeout(this._prepareReadyTimer);
      if (box) {
        box.className = 'intro-prepare ready';
        box.textContent = `✦ ${t('mapintro.ready')}`;
      }
      startBtn?.classList.add('field-ready');
    };
    const tick = () => {
      if (ready || this._prepareSeq !== seq) return;
      done += 1;
      if (done >= tasks.length) markReady();
    };
    for (const run of tasks) {
      try { run(tick); } catch { tick(); }
    }
    this._prepareTimer = setTimeout(markReady, 9000);
  }

  // pre-map difficulty picker (Easy/Normal/Hard) — global, persisted via settings
  _renderDiff() {
    const box = $('#miDiff');
    if (!box) return;
    clear(box);
    box.append(el('div', { class: 'diff-cap' }, t('difficulty.label')));
    const seg = el('div', { class: 'diff-seg' });
    const cur = currentDifficulty();
    for (const d of DIFFICULTY_ORDER) {
      const b = el('button', { class: 'diff-opt' + (d === cur ? ' active' : '') }, t('difficulty.' + d));
      b.onclick = () => { audio.ui(); setDifficulty(d); this._renderDiff(); };
      seg.append(b);
    }
    box.append(seg);
  }

  _bossSagaState(profile, bossId) {
    const rec = profile?.bossSagas?.[bossId] || null;
    if (!rec) return { rec, label: t('bossSaga.unclaimed'), cls: 'unclaimed' };
    if (rec.defeated) return { rec, label: t('bossSaga.defeated'), cls: 'defeated' };
    if (rec.best === 'broken') return { rec, label: t('bossSaga.broken'), cls: 'broken' };
    return { rec, label: t('bossSaga.hardened'), cls: 'hardened' };
  }

  _endlessSealLabel(seal) {
    return seal ? t('endless.seal.' + seal.id) : t('endless.seal.none');
  }

  _renderEndlessSeal(bestWave, variant = 'card') {
    const seal = endlessSealFor(bestWave);
    const next = nextEndlessSealTarget(bestWave);
    return el('div', { class: `endless-seal ${variant} ${seal?.id || 'none'}` },
      el('span', { class: 'endless-seal-glyph', 'aria-hidden': 'true' }, seal?.glyph || '∞'),
      el('span', { class: 'endless-seal-copy' },
        el('b', {}, this._endlessSealLabel(seal)),
        el('small', {}, next
          ? t('endless.nextShort', { wave: tNum(next.min), seal: this._endlessSealLabel(next) })
          : t('endless.legendHeld')),
      ),
    );
  }

  _renderIntroEndlessSeal(mapDef, endless) {
    const box = $('#miEndlessSeal');
    if (!box) return;
    clear(box);
    box.hidden = !endless;
    if (!endless) return;
    const bestWave = endlessBestFor(mapDef, loadProfile());
    const seal = endlessSealFor(bestWave);
    const next = nextEndlessSealTarget(bestWave);
    box.append(
      el('span', { class: `endless-seal-glyph ${seal?.id || 'none'}`, 'aria-hidden': 'true' }, seal?.glyph || '∞'),
      el('span', { class: 'endless-intro-copy' },
        el('b', {}, t('endless.bestHeld')),
        el('small', {}, bestWave ? t('endless.wave', { wave: tNum(bestWave) }) : t('endless.none')),
      ),
      el('span', { class: 'endless-intro-copy' },
        el('b', {}, this._endlessSealLabel(seal)),
        el('small', {}, next
          ? t('endless.next', { seal: this._endlessSealLabel(next), wave: tNum(next.min) })
          : t('endless.legendHeld')),
      ),
    );
  }

  _renderEndlessEndSeal(mapDef, endless, victory) {
    const box = $('#endEndlessSeal');
    if (!box) return;
    clear(box);
    const show = endless && !victory && mapDef;
    box.hidden = !show;
    if (!show) return;
    const bestWave = endlessBestFor(mapDef, loadProfile());
    const seal = endlessSealFor(bestWave);
    const next = nextEndlessSealTarget(bestWave);
    box.append(
      el('span', { class: `endless-seal-glyph ${seal?.id || 'none'}`, 'aria-hidden': 'true' }, seal?.glyph || '∞'),
      el('span', { class: 'endless-end-copy' },
        el('b', {}, t('endless.endTitle')),
        el('small', {}, bestWave
          ? t('endless.endBest', { wave: tNum(bestWave), seal: this._endlessSealLabel(seal) })
          : t('endless.endNone')),
      ),
      el('span', { class: 'endless-end-next' }, next
        ? t('endless.next', { seal: this._endlessSealLabel(next), wave: tNum(next.min) })
        : t('endless.legendHeld')),
    );
  }

  _renderCampaignBossSaga(mapDef, profile = loadProfile()) {
    if (!mapDef.boss) return null;
    const boss = ENEMIES_BY_ID[mapDef.boss];
    const ch = bossChallengeDef(mapDef.boss);
    const saga = ch.saga || {};
    const state = this._bossSagaState(profile, mapDef.boss);
    const twin = mapDef.twinBoss ? bossChallengeDef(mapDef.twinBoss) : null;
    return el('div', { class: `mapboss-saga ${state.cls}` },
      el('span', { class: `boss-saga-seal tone-${saga.tone || 'banner'}`, 'aria-hidden': 'true' }, saga.sealIcon || '◆'),
      el('span', { class: 'mapboss-copy' },
        el('b', {}, t('bossSaga.campaign')),
        el('small', {}, `${tOpt(ch.titleKey, t('bossChallenge.default.title'))}${twin ? ` · ${tOpt(twin.titleKey, '')}` : ''}`),
      ),
      el('span', { class: 'mapboss-state' }, `${state.rec?.best === 'broken' || state.rec?.defeated ? '✓ ' : ''}${state.label}`),
      boss ? el('span', { class: 'sr-only' }, tName(boss)) : null,
    );
  }

  _renderIntroBossSaga(mapDef) {
    const box = clear($('#miBossSaga'));
    if (!box || !mapDef.boss) {
      if (box) box.hidden = true;
      return;
    }
    const profile = loadProfile();
    const ch = bossChallengeDef(mapDef.boss);
    const saga = ch.saga || {};
    const boss = ENEMIES_BY_ID[mapDef.boss];
    const state = this._bossSagaState(profile, mapDef.boss);
    const twin = mapDef.twinBoss ? bossChallengeDef(mapDef.twinBoss) : null;
    box.hidden = false;
    box.className = `boss-saga-intro ${state.cls}`;
    box.append(
      el('div', { class: `boss-saga-seal big tone-${saga.tone || 'banner'}`, 'aria-hidden': 'true' }, saga.sealIcon || '◆'),
      el('div', { class: 'boss-saga-intro-copy' },
        el('div', { class: 'boss-saga-kicker' }, t('bossSaga.kicker')),
        el('b', {}, tOpt(ch.titleKey, t('bossChallenge.default.title'))),
        el('p', {}, tOpt(saga.arrivalKey, tOpt(ch.loreKey, ''))),
        twin ? el('p', { class: 'boss-saga-twin' }, t('bossSaga.twin', { name: tOpt(twin.titleKey, '') })) : null,
      ),
      el('div', { class: 'boss-saga-intro-state' },
        el('span', {}, boss ? tName(boss) : t('bossSaga.enemy')),
        el('strong', {}, state.label),
      ),
    );
  }

  showEnd({ victory, unlockedHeroes = [], wave, endless, mapDef, stars = 0, starImproved = false, onRetry, onContinueEndless, onExit }) {
    this.hideAll();
    this.endScreen.classList.add('visible');
    $('#endTitle').textContent = victory ? t('hud.victory') : t('hud.defeat');
    $('#endTitle').className = 'endtitle ' + (victory ? 'win' : 'lose');
    // Farr seals earned this defense (lives kept); pulse when it's a new best
    const starsEl = $('#endStars');
    starsEl.hidden = !(victory && !endless && stars > 0);
    if (!starsEl.hidden) {
      clear(starsEl);
      for (let i = 1; i <= 3; i++) starsEl.append(el('span', { class: 'seal' + (i <= stars ? ' lit' : '') }, '✦'));
      starsEl.classList.toggle('improved', starImproved);
    }
    // wisdom gathered this battle (milestones + knowledge buildings) → treasury tally
    const kherad = takeSessionKherad();
    const kEl = $('#endKherad');
    kEl.hidden = !kherad;
    if (kherad) kEl.textContent = `📖 ${t('kherad.gained', { n: tNum(kherad) })} · ${t('kherad.total', { n: tNum(kheradBalance()) })}`;
    $('#endSub').textContent = endless ? t('hud.endlessWave', { n: tNum(wave) }) : '';
    this._renderEndlessEndSeal(mapDef, endless, victory);
    const unl = clear($('#endUnlocks'));
    for (const h of unlockedHeroes) {
      const img = el('div', { class: 'uimg' });
      applyAtlasCell(img, HERO_ATLAS, h.atlas);
      unl.append(el('div', { class: 'ucard' }, img, el('div', { class: 'uname' }, tName(h))));
      audio.victory();
    }
    const actions = clear($('#endActions'));
    if (victory && !endless && onContinueEndless) {
      const b = el('button', { class: 'gbtn' }, t('hud.continueEndless'));
      b.onclick = () => { this.hideAll(); onContinueEndless(); };
      actions.append(b);
    }
    if (!victory && onRetry) {
      const b = el('button', { class: 'gbtn primary' }, t('hud.retry'));
      b.onclick = () => { this.hideAll(); onRetry(); };
      actions.append(b);
    }
    const exit = el('button', { class: 'gbtn' }, t('hud.returnCampaign'));
    exit.onclick = () => { this.hideAll(); onExit(); };
    actions.append(exit);
  }

  hideAll() {
    for (const o of [this.mainMenu, this.campaignMenu, this.mapIntro, this.researchMenu, this.endScreen]) o.classList.remove('visible');
  }
}
