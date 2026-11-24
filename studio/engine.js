import { esc, rich, icon } from './helpers.js';
import generic, { frame } from './components.js';
import { validateSet } from './contract.mjs';
let registry = { ...generic };
let app = {};
export let COMPONENT_TYPES = Object.keys(registry);
export function configure(components, metadata) { registry = { ...generic, ...components }; app = metadata; COMPONENT_TYPES = Object.keys(registry); }
export function localized(value, locale) {
  if (value == null) return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value[locale] ?? value.it ?? Object.values(value)[0] ?? '';
  }
  return value;
}

/** Element with its per-platform overrides applied. */
export function resolved(el, platform) {
  return { ...el, ...(el.over?.[platform] ?? {}) };
}

export function buildPanorama(set, { platform, locale }) {
  validateSet(set);
  const { w: W, h: H } = set.platforms[platform];
  const t = (v) => typeof v === 'object' && v !== null ? (v[locale] ?? v.it ?? '') : (v ?? '');
  const root = document.createElement('div');
  root.className = `pano campaign campaign-${set.variant} platform-${platform}`;
  root.style.cssText = `width:${W * set.slides.length}px;height:${H}px;--u:${W / 100}px`;
  // One canvas-wide shape: every exported slice shares the same curve.
  const n = set.slides.length;
  const extra = ['S6650 470 7000 400', 'S7650 520 8000 640', 'S8650 820 9000 700', 'S9650 430 10000 400'].slice(0, Math.max(0, n - 6)).join(' ');
  const end = n > 6 ? ` ${extra} L${n * 1000 + 60} ${[690, 400, 640, 700, 400][Math.min(n - 6, 4)]}` : '';
  root.innerHTML = `<svg class="campaign-backdrop" viewBox="0 0 ${n * 1000} 1000" preserveAspectRatio="none" aria-hidden="true"><path d="M-60 470 C300 160 610 190 1000 230 S1550 430 2000 570 S2600 880 3000 780 S3650 480 4000 390 S4700 460 5000 610 S5650 890 ${n > 6 ? '6000 690' : '6060 690'}${end} L${n * 1000 + 60} 1060 L-60 1060Z"/></svg>`;
  set.slides.forEach((slide, i) => {
    const section = document.createElement('section');
    section.className = `slide campaign-slide${slide.bottomTitle ? ' bottom-title' : ''}`;
    section.style.cssText = `width:${W}px;height:${H}px`;
    section.dataset.index = String(i + 1);
    section.innerHTML = `<div class="headline"><h1>${rich(t(slide.headline))}</h1></div>`;
    root.appendChild(section);
  });
  for (const raw of set.elements) {
    const el = { ...raw, ...(raw.over?.[platform] ?? {}) };
    if (el.hidden || (el.locales && !el.locales.includes(locale))) continue;
    const node = document.createElement('div');
    node.className = 'el campaign-content';
    node.dataset.id = raw.id;
    node.style.cssText = `left:${(el.x - el.w / 2) * W}px;top:${el.y * H}px;width:${el.w * W}px;${el.h == null ? '' : `height:${el.h * H}px;`}transform:rotate(${el.rot ?? 0}deg);z-index:${el.z ?? 10}`;
    // Blue keeps the iOS proportions on Android: same content, only the camera differs.
    const variantPlatform = platform === 'android' && set.variant === 'blue' ? 'ios' : platform;
    const render = registry[el.kind ?? el.type];
    if (!render) throw new Error(`Componente sconosciuto: ${el.kind ?? el.type}`);
    node.innerHTML = render(el, { esc, rich, icon, t, frame, platform: variantPlatform, locale, app });
    const appFrame = node.querySelector('.c-app');
    if (appFrame && set.variant === 'blue') {
      const time = appFrame.classList.contains('c-lock') ? '' : '<b>9:41</b>';
      appFrame.insertAdjacentHTML('afterbegin', `<div class="c-status">${time}<span>${icon('signal')}${icon('wifi')}<i class="c-battery"></i></span></div>`);
    }
    root.appendChild(node);
  }
  return { root, slideW: W, slideH: H, count: set.slides.length };
}

export function checkLayout(root, set, platform) {
  const base = root.getBoundingClientRect();
  const W = parseFloat(root.style.width) / set.slides.length;
  const H = parseFloat(root.style.height);
  const margin = H * 0.012;
  const byId = Object.fromEntries(set.elements.map((e) => [e.id, resolved(e, platform)]));
  const box = (node) => {
    const r = node.getBoundingClientRect();
    return { l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top };
  };
  const items = [...root.querySelectorAll('.el')].map((n) => ({ id: n.dataset.id, el: byId[n.dataset.id], ...box(n) }));
  const heads = [...root.querySelectorAll('.headline')].map((n, i) => ({ id: `headline-${i + 1}`, el: {}, ...box(n.firstElementChild ?? n) }));
  const issues = [];
  if (set.layout === 'campaign') {
    for (const node of root.querySelectorAll('.campaign-content > *')) {
      if (node.scrollHeight > node.clientHeight + 3) {
        issues.push({ type: 'overflow', id: node.parentElement.dataset.id, detail: `${node.scrollHeight} / ${node.clientHeight}px` });
      }
    }
  }
  for (const it of items) {
    if (!it.el.bleed && (it.t < margin || it.b > H - margin || it.l < 0 || it.r > W * set.slides.length)) {
      issues.push({ type: 'cut', id: it.id, detail: `bottom ${Math.round(it.b)} / ${H}` });
    }
    const first = Math.floor((it.l + 2) / W);
    const last = Math.floor((it.r - 2) / W);
    if (first !== last && !it.el.cross) issues.push({ type: 'border', id: it.id, detail: `slide ${first + 1}â†’${last + 1}` });
  }
  const all = [...items, ...heads];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.el.overlap || b.el.overlap) continue;
      const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (w > 4 && h > 4) issues.push({ type: 'overlap', id: `${a.id} Ã— ${b.id}`, detail: `${Math.round(w)}Ã—${Math.round(h)}px` });
    }
  }
  return issues;
}

/** Resolves once fonts and images are ready (used before export). */
export async function whenReady(root) {
  await document.fonts.ready;
  await Promise.all([...root.querySelectorAll('img')].map((img) =>
    img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
}
