// Settings overlay — audio, graphics, accessibility, language, save reset.
import { el, $, clear } from './dom.js';
import { t, getLang, setLang } from '../core/i18n.js';
import { settings } from '../core/settings.js';
import { resetProfile } from '../core/save.js';
import { audio } from '../core/audio.js';

export class SettingsUI {
  constructor() {
    this.overlay = el('div', { class: 'overlay', id: 'settingsOverlay' },
      el('div', { class: 'dialog frame', style: { width: 'min(520px, 92vw)' } },
        el('h2', { class: 'ornament-title', id: 'setTitle' }, t('settings.title')),
        el('div', { id: 'setBody' }),
        el('div', { style: { textAlign: 'center', marginTop: '18px' } },
          el('button', { class: 'gbtn', id: 'setClose' }, t('settings.back')),
        ),
      ),
    );
    document.body.append(this.overlay);
    $('#setClose').onclick = () => this.hide();
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.hide(); });
  }

  show() { this.overlay.classList.add('visible'); this._render(); }
  hide() { this.overlay.classList.remove('visible'); }

  _slider(key, label) {
    const input = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.get(key)) });
    input.oninput = () => { settings.set(key, parseFloat(input.value)); };
    return el('div', { class: 'setrow' }, el('label', {}, label), input);
  }

  _toggle(key, label) {
    const sw = el('div', { class: 'switch' + (settings.get(key) ? ' on' : '') });
    sw.onclick = () => { settings.set(key, !settings.get(key)); sw.classList.toggle('on'); audio.ui(); };
    return el('div', { class: 'setrow' }, el('label', {}, label), sw);
  }

  _render() {
    $('#setTitle').textContent = t('settings.title');
    $('#setClose').textContent = t('settings.back');
    const b = clear($('#setBody'));

    const qualSel = el('select', {},
      ...['low', 'medium', 'high'].map((q) =>
        el('option', { value: q, ...(settings.get('quality') === q ? { selected: '' } : {}) }, t('settings.quality.' + q))),
    );
    qualSel.onchange = () => settings.set('quality', qualSel.value);

    const langSel = el('select', {},
      el('option', { value: 'en', ...(getLang() === 'en' ? { selected: '' } : {}) }, 'English'),
      el('option', { value: 'fa', ...(getLang() === 'fa' ? { selected: '' } : {}) }, 'فارسی'),
    );
    langSel.onchange = () => { setLang(langSel.value); this._render(); };

    const uiScale = el('input', { type: 'range', min: '0.8', max: '1.3', step: '0.05', value: String(settings.get('uiScale')) });
    uiScale.oninput = () => {
      settings.set('uiScale', parseFloat(uiScale.value));
      document.documentElement.style.fontSize = `${15 * parseFloat(uiScale.value)}px`;
    };

    const reset = el('button', { class: 'gbtn danger' }, t('settings.resetSave'));
    reset.onclick = () => {
      if (confirm(t('settings.resetConfirm'))) { resetProfile(); location.reload(); }
    };

    b.append(
      el('h4', { style: { color: 'var(--gold)', margin: '10px 0 4px' } }, t('settings.audio')),
      this._slider('masterVolume', t('settings.master')),
      this._slider('musicVolume', t('settings.music')),
      this._slider('sfxVolume', t('settings.sfx')),
      this._toggle('muted', t('settings.mute')),
      this._toggle('reducedAudio', t('settings.reducedAudio')),
      el('h4', { style: { color: 'var(--gold)', margin: '14px 0 4px' } }, t('settings.graphics')),
      el('div', { class: 'setrow' }, el('label', {}, t('settings.quality')), qualSel),
      this._toggle('shadows', t('settings.shadows')),
      this._toggle('bloom', t('settings.bloom')),
      el('h4', { style: { color: 'var(--gold)', margin: '14px 0 4px' } }, t('settings.accessibility')),
      this._toggle('reducedMotion', t('settings.reducedMotion')),
      this._toggle('screenShake', t('settings.screenShake')),
      el('div', { class: 'setrow' }, el('label', {}, t('settings.uiScale')), uiScale),
      el('div', { class: 'setrow' }, el('label', {}, t('settings.language')), langSel),
      el('div', { style: { marginTop: '16px', textAlign: 'center' } }, reset),
    );
  }
}
