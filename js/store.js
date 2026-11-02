// Состояние, XP/уровни/серия, интервальные повторения, достижения. Всё хранится в localStorage на телефоне.
import { dayNum } from './util.js';

const KEY = 'chesstrainer.v1';

const DEF = () => ({
  v: 1, xp: 0,
  streak: 0, best: 0, last: -1, freeze: 0,   // серия дней; last = номер дня последнего засчитанного
  days: {},                                    // дневные счётчики и квесты
  rating: 900, rn: 0, rhist: [],               // рейтинг тактики
  puz: {}, lines: {}, end: {},                 // SRS: {b: корзина, d: день повтора, n: попыток}
  th: {},                                      // статистика по темам: {имя: {n, ok}}
  thr: { ok: 0, n: 0 },
  stats: { puz: 0, clean: 0, combo: 0, bestCombo: 0, lines: 0, linesClean: 0, end: 0 },
  ach: {},
  set: { sound: true },
});

function merge(a, b) {
  for (const k in b) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}

function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) return merge(DEF(), JSON.parse(r));
  } catch (e) { /* поврежденные данные — начнем заново */ }
  return DEF();
}

export const S = load();

const subs = [];
export const onEvent = fn => subs.push(fn);
const emit = e => subs.forEach(f => f(e));

export function save() {
  const keep = dayNum() - 120;
  for (const k of Object.keys(S.days)) if (+k < keep) delete S.days[k];
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* переполнение — игнорируем */ }
}

export function replaceAll(obj) {
  const n = merge(DEF(), obj);
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, n);
  save();
}

export function exportJson() { return JSON.stringify(S); }

// ───── День и задания ─────
export const QUESTS = [
  { id: 'puz', n: 5, xp: 30, icon: '🧩', text: 'Реши 5 тактических задач' },
  { id: 'open', n: 1, xp: 30, icon: '📖', text: 'Пройди 1 дебютную линию' },
  { id: 'thr', n: 3, xp: 20, icon: '👁', text: '3 раза: что под боем?' },
  { id: 'end', n: 1, xp: 30, icon: '🏁', text: 'Реши 1 эндшпиль' },
];

export function today() {
  const k = String(dayNum());
  return S.days[k] || (S.days[k] = { xp: 0, q: { puz: 0, open: 0, thr: 0, end: 0 }, counted: false, bonus: false });
}

export const questsDone = () => QUESTS.filter(q => today().q[q.id] >= q.n).length;

// ───── Уровни ─────
export const lvlAt = xp => Math.floor((1 + Math.sqrt(1 + 4 * xp / 50)) / 2);
export const lvlStart = L => 50 * L * (L - 1);
const RANKS = [
  { l: 1, n: 'Пешка', i: '♙' }, { l: 3, n: 'Конь', i: '♘' }, { l: 6, n: 'Слон', i: '♗' },
  { l: 9, n: 'Ладья', i: '♖' }, { l: 13, n: 'Ферзь', i: '♕' }, { l: 18, n: 'Король', i: '♔' }, { l: 25, n: 'Мастер', i: '🏆' },
];
export function levelInfo(xp = S.xp) {
  const L = lvlAt(xp), a = lvlStart(L), b = lvlStart(L + 1);
  const rank = [...RANKS].reverse().find(r => L >= r.l);
  const next = RANKS.find(r => r.l > L);
  return { L, cur: xp - a, need: b - a, pct: (xp - a) / (b - a), rank, next };
}

export function addXP(n, why = '') {
  if (n <= 0) return;
  const before = lvlAt(S.xp);
  S.xp += n;
  today().xp += n;
  const after = lvlAt(S.xp);
  emit({ t: 'xp', n, why });
  if (after > before) emit({ t: 'level', L: after, info: levelInfo() });
  save();
}

// ───── Серия дней ─────
function countDay() {
  const d = today();
  if (d.counted) return;
  d.counted = true;
  const t = dayNum();
  if (S.last === t - 1) S.streak++;
  else if (S.last === t - 2 && S.freeze > 0) { S.freeze--; S.streak++; emit({ t: 'freeze' }); }
  else S.streak = 1;
  S.last = t;
  if (S.streak > S.best) S.best = S.streak;
  if (S.streak % 7 === 0 && S.freeze < 2) { S.freeze++; emit({ t: 'freezeGain' }); }
  emit({ t: 'streak', n: S.streak });
}

export function effectiveStreak() {
  const t = dayNum();
  if (S.last === t || S.last === t - 1) return S.streak;
  if (S.last === t - 2 && S.freeze > 0) return S.streak;
  return 0;
}

export function quest(id, k = 1) {
  const d = today(), q = QUESTS.find(x => x.id === id);
  const before = d.q[id];
  d.q[id] = before + k;
  if (before < q.n && d.q[id] >= q.n) {
    addXP(q.xp, 'quest');
    emit({ t: 'quest', q });
    if (questsDone() >= 2) countDay();
    if (questsDone() === QUESTS.length && !d.bonus) {
      d.bonus = true;
      addXP(50, 'all');
      emit({ t: 'allQuests' });
    }
  }
  save();
  checkAch();
}

// ───── Рейтинг тактики ─────
export function rate(pr, score) {
  const K = S.rn < 30 ? 40 : 20;
  const e = 1 / (1 + Math.pow(10, (pr - S.rating) / 400));
  const d = Math.round(K * (score - e));
  S.rating = Math.max(400, S.rating + d);
  S.rn++;
  S.rhist.push(S.rating);
  if (S.rhist.length > 80) S.rhist.shift();
  return d;
}

// ───── Интервальные повторения (коробки Лейтнера) ─────
export const IV = [0, 1, 2, 4, 8, 16, 32, 64];
export function grade(map, id, ok) {
  const e = map[id] || (map[id] = { b: 0, d: 0, n: 0 });
  e.n++;
  e.b = ok ? Math.min(e.b + 1, IV.length - 1) : (e.b >= 3 ? e.b - 2 : 0);
  e.d = dayNum() + IV[e.b];
  return e;
}
export const dueCount = map => Object.values(map).filter(e => e.d <= dayNum()).length;

// ───── Достижения ─────
const cnt = (m, f) => Object.values(m).filter(f).length;
export const ACH = [
  { id: 'p1', icon: '🎯', name: 'Первая задача', desc: 'Реши 1 задачу', xp: 10, ok: () => S.stats.puz >= 1 },
  { id: 'p25', icon: '🧩', name: '25 задач', desc: 'Реши 25 задач', xp: 25, ok: () => S.stats.puz >= 25 },
  { id: 'p100', icon: '💯', name: 'Сотня', desc: 'Реши 100 задач', xp: 60, ok: () => S.stats.puz >= 100 },
  { id: 'p500', icon: '🏔', name: 'Пятьсот', desc: 'Реши 500 задач', xp: 200, ok: () => S.stats.puz >= 500 },
  { id: 'c5', icon: '🔥', name: 'Серия 5', desc: '5 задач подряд без ошибок', xp: 30, ok: () => S.stats.bestCombo >= 5 },
  { id: 'c10', icon: '⚡', name: 'Серия 10', desc: '10 задач подряд без ошибок', xp: 80, ok: () => S.stats.bestCombo >= 10 },
  { id: 's3', icon: '📅', name: '3 дня подряд', desc: 'Серия 3 дня', xp: 30, ok: () => S.best >= 3 },
  { id: 's7', icon: '🗓', name: 'Неделя', desc: 'Серия 7 дней', xp: 100, ok: () => S.best >= 7 },
  { id: 's30', icon: '🏅', name: 'Месяц', desc: 'Серия 30 дней', xp: 400, ok: () => S.best >= 30 },
  { id: 'l1', icon: '📖', name: 'Дебютант', desc: 'Пройди первую линию', xp: 15, ok: () => S.stats.lines >= 1 },
  { id: 'l5', icon: '📚', name: 'Репертуар', desc: '5 линий выучено (корзина 3+)', xp: 80, ok: () => cnt(S.lines, e => e.b >= 3) >= 5 },
  { id: 't25', icon: '👁', name: 'Зоркий глаз', desc: '25 верных «что под боем?»', xp: 40, ok: () => S.thr.ok >= 25 },
  { id: 't100', icon: '🦅', name: 'Орлиный взгляд', desc: '100 верных «что под боем?»', xp: 120, ok: () => S.thr.ok >= 100 },
  { id: 'e1', icon: '🏁', name: 'Первый эндшпиль', desc: 'Реши эндшпиль', xp: 20, ok: () => S.stats.end >= 1 },
  { id: 'e5', icon: '👑', name: 'Эндшпильщик', desc: 'Освой 5 эндшпилей (корзина 2+)', xp: 100, ok: () => cnt(S.end, e => e.b >= 2) >= 5 },
  { id: 'r1000', icon: '📈', name: 'Рейтинг 1000', desc: 'Рейтинг тактики 1000', xp: 50, ok: () => S.rating >= 1000 },
  { id: 'r1200', icon: '🚀', name: 'Рейтинг 1200', desc: 'Рейтинг тактики 1200', xp: 100, ok: () => S.rating >= 1200 },
  { id: 'r1400', icon: '🌟', name: 'Рейтинг 1400', desc: 'Рейтинг тактики 1400', xp: 200, ok: () => S.rating >= 1400 },
  { id: 'v5', icon: '⭐', name: 'Уровень 5', desc: 'Достигни 5 уровня', xp: 50, ok: () => lvlAt(S.xp) >= 5 },
  { id: 'v10', icon: '💫', name: 'Уровень 10', desc: 'Достигни 10 уровня', xp: 150, ok: () => lvlAt(S.xp) >= 10 },
];

export function checkAch() {
  let again = false;
  for (const a of ACH) {
    if (!S.ach[a.id] && a.ok()) {
      S.ach[a.id] = dayNum();
      emit({ t: 'ach', a });
      addXP(a.xp, 'ach');
      again = true;
    }
  }
  save();
  if (again) checkAch();
}
