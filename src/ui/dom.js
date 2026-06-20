// Tiny DOM helpers
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

export const $ = (sel) => document.querySelector(sel);

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function wireAction(node, handler, { disabled = false } = {}) {
  if (!node || !handler) return node;
  if (!node.hasAttribute('role')) node.setAttribute('role', 'button');
  if (!node.hasAttribute('tabindex')) node.tabIndex = disabled ? -1 : 0;
  node.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  const run = (ev) => {
    if (node.getAttribute('aria-disabled') === 'true') return;
    handler(ev);
  };
  node.addEventListener('click', run);
  node.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    run(ev);
  });
  return node;
}

// Ornate corner "back" control shared by every overlay dialog. Wrapped in a sticky,
// zero-height dock so it stays pinned to the dialog's top corner while the panel scrolls.
const BACK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.5 8 12l7 7.5"/></svg>';
export function backMedallion(attrs = {}) {
  return el('div', { class: 'backdock' },
    el('button', { class: 'iconback', html: BACK_SVG, ...attrs }),
  );
}
