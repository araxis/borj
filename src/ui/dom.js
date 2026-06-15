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

// Ornate corner "back" control shared by every overlay dialog. Wrapped in a sticky,
// zero-height dock so it stays pinned to the dialog's top corner while the panel scrolls.
const BACK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.5 8 12l7 7.5"/></svg>';
export function backMedallion(attrs = {}) {
  return el('div', { class: 'backdock' },
    el('button', { class: 'iconback', html: BACK_SVG, ...attrs }),
  );
}
