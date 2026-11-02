export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const rnd = n => Math.floor(Math.random() * n);
export const pick = a => a[rnd(a.length)];
export const dayNum = () => {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
};
export const plural = (n, a, b, c) => {
  const m = Math.abs(n) % 100, k = m % 10;
  return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c;
};
export function spark(a, w = 120, h = 36) {
  if (a.length < 2) return '';
  const mn = Math.min(...a), mx = Math.max(...a), r = (mx - mn) || 1;
  const pts = a.map((v, i) => `${(i / (a.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" points="${pts}"/></svg>`;
}
export const dataUrl =p => new URL('../data/' + p, import.meta.url);
export const NAME = { p: 'Пешка', n: 'Конь', b: 'Слон', r: 'Ладья', q: 'Ферзь', k: 'Король' };
export const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
