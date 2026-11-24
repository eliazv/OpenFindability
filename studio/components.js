import { esc, rich } from './helpers.js';
const components = {
  phone(el, t) {
    const statusbar = el.statusbar === false ? '' :
      `<div class="statusbar"><span>9:41</span><span>●●● ▮</span></div>`;
    return `<div class="phone" style="--screen-bg:${esc(el.screenBg ?? '#f6f6f4')}">
      <div class="screen"><div class="island"></div>${statusbar}
      <img src="${esc(t(el.src))}" alt=""></div></div>`;
  },
  panel(el, t) {
    return `<div class="panel"><img src="${esc(t(el.src))}" alt=""></div>`;
  },
  image(el, t) {
    return `<img src="${esc(t(el.src))}" alt="" style="width:100%">`;
  },
  review(el, t) {
    return `<div class="review${el.placeholder ? ' placeholder' : ''}"><div class="stars">★★★★★</div>
      <blockquote>${esc(t(el.text))}</blockquote><cite>${esc(t(el.author))}</cite></div>`;
  },
  widget(el, t) {
    return `<div class="review"><strong>${esc(t(el.title))}</strong><p>${rich(t(el.text))}</p></div>`;
  },
  stat(el, t) {
    return `<div class="stat"><b>${esc(t(el.value))}</b><span>${esc(t(el.label))}</span></div>`;
  },
  text(el, t) {
    return rich(t(el.text));
  },

};
export default Object.fromEntries(Object.entries(components).map(([key, render]) => [key, (el, ctx) => render(el, ctx.t)]));
export const frame = (src, ctx) => components.phone({ src }, ctx.t);
