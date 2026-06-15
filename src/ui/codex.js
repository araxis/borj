// Codex — browsable encyclopedia of heroes, adversaries, places, towers, soldiers.
// Every entry shows ledger-exact name, story reference, and descriptions in EN/FA.
import { el, $, clear, backMedallion } from './dom.js';
import { t, tf, tName, tNameAlt, tOpt, toggleLang } from '../core/i18n.js';
import { applyAtlasCell } from '../core/atlas.js';
import { HEROES, HERO_ATLAS } from '../data/heroes.js';
import { ENEMIES, ENEMY_ATLAS } from '../data/enemies.js';
import { PLACES, PLACE_ATLAS, PLACES_BY_ID } from '../data/places.js';
import { TOWERS } from '../data/towers.js';
import { SOLDIERS } from '../data/soldiers.js';
import { loadProfile, markCodexSeen } from '../core/save.js';
import { audio } from '../core/audio.js';

const ROLE_ICONS = { archer: '🏹', siege: '🪨', fire: '🔥', magic: '📜', support: '🪶', aura: '🚩', economy: '🪙', barracks: '🛡️', trap: '🕳️' };

export class Codex {
  constructor() {
    this.overlay = el('div', { class: 'overlay', id: 'codexOverlay' },
      el('div', { class: 'dialog frame', style: { width: 'min(960px, 92vw)' } },
        backMedallion({ id: 'codexClose', 'aria-label': t('settings.back') }),
        el('h2', { class: 'ornament-title', id: 'codexTitle' }, t('codex.title')),
        el('div', { id: 'codexTabs' }),
        el('div', { id: 'codexGrid' }),
        el('div', { id: 'codexDetail' }),
      ),
    );
    document.body.append(this.overlay);
    this.tab = 'heroes';
    $('#codexClose').onclick = () => this.hide();
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.hide(); });
  }

  show() {
    this.overlay.classList.add('visible');
    this._renderTabs();
    this._renderGrid();
  }

  hide() { this.overlay.classList.remove('visible'); }

  _renderTabs() {
    const tabs = clear($('#codexTabs'));
    $('#codexTitle').textContent = t('codex.title');
    const defs = [
      ['heroes', t('codex.heroes')], ['enemies', t('codex.enemies')], ['places', t('codex.places')],
      ['towers', t('codex.towers')], ['soldiers', t('codex.soldiers')],
    ];
    for (const [id, label] of defs) {
      const b = el('button', { class: 'tabbtn' + (this.tab === id ? ' active' : '') }, label);
      b.onclick = () => { this.tab = id; audio.ui(); this._renderTabs(); this._renderGrid(); };
      tabs.append(b);
    }
  }

  _renderGrid() {
    const grid = clear($('#codexGrid'));
    $('#codexDetail').classList.remove('visible');
    grid.style.display = 'grid';
    const profile = loadProfile();
    const items = this.tab === 'heroes' ? HEROES
      : this.tab === 'enemies' ? ENEMIES
        : this.tab === 'places' ? PLACES
          : this.tab === 'towers' ? TOWERS : SOLDIERS;
    for (const item of items) {
      const img = el('div', { class: 'cimg' });
      if (this.tab === 'heroes') applyAtlasCell(img, HERO_ATLAS, item.atlas);
      else if (this.tab === 'enemies') applyAtlasCell(img, ENEMY_ATLAS, item.atlas);
      else if (this.tab === 'places') applyAtlasCell(img, PLACE_ATLAS, item.atlas);
      else if (this.tab === 'towers') {
        const place = item.placeRef ? PLACES_BY_ID[item.placeRef] : null;
        if (place) applyAtlasCell(img, PLACE_ATLAS, place.atlas);
        else img.textContent = ROLE_ICONS[item.role] || '🏛️';
      } else img.textContent = '🛡️';
      const card = el('div', { class: 'codexcard' }, img, el('div', { class: 'cname' }, tName(item)));
      card.onclick = () => { audio.codex(); this._renderDetail(item); };
      grid.append(card);
    }
  }

  _renderDetail(item) {
    markCodexSeen(`${this.tab}:${item.id}`);
    $('#codexGrid').style.display = 'none';
    const d = clear($('#codexDetail'));
    d.classList.add('visible');
    const img = el('div', { class: 'rp-portrait' });
    if (this.tab === 'heroes') applyAtlasCell(img, HERO_ATLAS, item.atlas);
    else if (this.tab === 'enemies') applyAtlasCell(img, ENEMY_ATLAS, item.atlas);
    else if (this.tab === 'places') applyAtlasCell(img, PLACE_ATLAS, item.atlas);
    else {
      const place = item.placeRef ? PLACES_BY_ID[item.placeRef] : null;
      if (place) applyAtlasCell(img, PLACE_ATLAS, place.atlas);
      else img.append(el('div', { class: 'emblem' }, ROLE_ICONS[item.role] || '🛡️'));
    }
    const back = el('button', { class: 'gbtn back' }, '← ' + t('codex.title'));
    back.onclick = () => { this._renderGrid(); };
    const langToggle = el('button', { class: 'gbtn', style: { marginInlineStart: '8px' } }, t('lore.toggle'));
    langToggle.onclick = () => { toggleLang(); this._renderDetail(item); };
    d.append(
      el('div', {}, back, langToggle),
      el('div', { class: 'codex-flex', style: { marginTop: '12px' } },
        img,
        el('div', { class: 'codex-body' },
          el('div', { class: 'rp-name' }, tName(item)),
          el('div', { class: 'rp-faname' }, tNameAlt(item)),
          el('div', { class: 'rp-section' },
            el('h4', {}, t('panel.storyRef')),
            el('p', { class: 'storyref' }, item.sourceRef ? tOpt('storyref.' + item.id, item.sourceRef) : '—'),
          ),
          el('div', { class: 'rp-section' },
            el('h4', {}, t('panel.lore')),
            el('p', {}, tf(item, 'short')),
            el('p', { style: { marginTop: '8px' } }, tf(item, 'detail') || tf(item, 'lore')),
            item.ledgerNote ? el('p', { class: 'ledgernote' }, `${t('panel.ledgerNote')}: ${tOpt('ledgernote.' + item.id, item.ledgerNote)}`) : null,
          ),
          item.abilityDesc ? el('div', { class: 'rp-section' }, el('h4', {}, t('panel.abilities')), el('p', {}, tOpt('ability.' + item.id, item.abilityDesc))) : null,
          item.special ? el('div', { class: 'rp-section' }, el('h4', {}, t('panel.special')), el('p', {}, tOpt('special.' + item.id, item.special.desc))) : null,
          item.ability?.desc ? el('div', { class: 'rp-section' }, el('h4', {}, t('panel.abilities')), el('p', {}, tOpt('sability.' + item.id, item.ability.desc))) : null,
          this.tab === 'places' && item.campaign ? el('div', { class: 'rp-section' },
            el('h4', {}, t('panel.campaignContext')),
            el('p', {}, t('intro.' + item.id) !== 'intro.' + item.id ? t('intro.' + item.id) : '—'),
            t('intro2.' + item.id) !== 'intro2.' + item.id ? el('p', { style: { marginTop: '8px', fontStyle: 'italic', color: '#bfae88' } }, t('intro2.' + item.id)) : null,
          ) : null,
        ),
      ),
    );
  }
}
