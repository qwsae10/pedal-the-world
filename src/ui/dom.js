// Tiny DOM helpers.

/**
 * el('button', {class: 'btn', onclick: fn, 'aria-label': 'x'}, 'text', childEl)
 * Props starting with "on" are event listeners; false/null/undefined are skipped.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const clear = (node) => node.replaceChildren();

/** Big friendly button. */
export function button(label, onclick, { cls = '', aria } = {}) {
  return el('button', { type: 'button', class: `btn ${cls}`.trim(), onclick, 'aria-label': aria }, label);
}
