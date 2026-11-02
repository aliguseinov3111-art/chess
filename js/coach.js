// Тренер: оценка ходов и объяснения по-русски. Чистая логика без DOM (chess.js + оценки Stockfish).
import { Chess } from '../lib/chess.js';
import { VAL, plural } from './util.js';

const other = c => (c === 'w' ? 'b' : 'w');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const uciMove = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

// ───── Названия фигур по падежам ─────
const W = {
  nom: { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' },
  acc: { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' },
  gen: { p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя', k: 'короля' },
};
const MY = { nom: ['ваш', 'ваша'], acc: ['вашего', 'вашу'], gen: ['вашего', 'вашей'] };
const FEM = { p: 1, r: 1 };
// «ваш конь f3» / «конь соперника f3»; owner — цвет фигуры, user — цвет пользователя
function P(type, sq, owner, user, c = 'nom') {
  const t = owner === user ? `${MY[c][FEM[type] ? 1 : 0]} ${W[c][type]}` : `${W[c][type]} соперника`;
  return sq ? `${t} ${sq}` : t;
}

// ───── Материал, обмены, угрозы ─────
export function material(ch, color) {
  let s = 0;
  for (const row of ch.board()) for (const c of row) if (c && c.type !== 'k') s += (c.color === color ? 1 : -1) * VAL[c.type];
  return s;
}

// Выигрыш стороны `by` при размене на поле sq (бьёт стоящую там фигуру), по очереди самыми дешёвыми фигурами
export function see(ch, sq, by) {
  const t = ch.get(sq);
  if (!t) return 0;
  const val = s => VAL[ch.get(s).type];
  const A = ch.attackers(sq, by).map(val).sort((a, b) => a - b);
  const D = ch.attackers(sq, other(by)).map(val).sort((a, b) => a - b);
  if (!A.length) return 0;
  const gain = [VAL[t.type]];
  let on = A.shift(), d = 0, defTurn = true;
  for (;;) {
    d++;
    gain[d] = on - gain[d - 1];
    const list = defTurn ? D : A;
    if (!list.length) break;
    on = list.shift();
    defTurn = !defTurn;
  }
  while (--d > 0) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
  return gain[0];
}

// Фигуры стороны victim, которые соперник может выиграть
export function threatsOn(ch, victim) {
  const enemy = other(victim), out = [];
  for (const row of ch.board()) {
    for (const c of row) {
      if (!c || c.color !== victim || c.type === 'k') continue;
      const g = see(ch, c.square, enemy);
      if (g > 0) out.push({ sq: c.square, type: c.type, gain: g, by: ch.attackers(c.square, enemy) });
    }
  }
  return out.sort((a, b) => b.gain - a.gain);
}

const kingSq = (ch, color) => {
  for (const row of ch.board()) for (const c of row) if (c && c.type === 'k' && c.color === color) return c.square;
  return null;
};

const CENTER = new Set(['e4', 'd4', 'e5', 'd5']);

// ───── Описание хода (для любой стороны) ─────
export function describe(fen, uci, user) {
  const before = new Chess(fen), after = new Chess(fen);
  const mv = after.move(uciMove(uci));
  const me = mv.color, opp = other(me);
  const o = (type, sq, owner, c) => P(type, sq, owner, user, c);
  const mover = o(mv.piece, mv.to, me, 'nom');
  if (after.isCheckmate()) return { san: mv.san, text: 'Мат! Король остался без защиты и без ходов.', mate: true };

  const parts = [];
  const captured = mv.captured ? o(mv.captured, mv.to, opp, 'acc') : null;
  if (mv.flags.includes('k') || mv.flags.includes('q')) {
    parts.push('рокировка: король уходит в безопасное место, а ладья включается в игру');
  } else if (captured) {
    if (after.inCheck()) parts.push('шах');
    const recap = after.attackers(mv.to, opp).length > 0;
    const back = recap ? see(after, mv.to, opp) : 0;
    if (!recap) parts.push(`берёт ${captured} — ответного взятия нет, это выигрыш материала`);
    else if (back <= 0) parts.push(`берёт ${captured}: ответное взятие невыгодно, материал выигран`);
    else if (VAL[mv.captured] > VAL[mv.piece]) parts.push(`берёт ${captured} — выгодный размен, даже если соперник возьмёт в ответ`);
    else if (VAL[mv.captured] === VAL[mv.piece]) parts.push(`размен: берёт ${captured}, но соперник может взять в ответ`);
    else parts.push(`берёт ${captured}, но ${mover} оказывается под боем — размен невыгоден`);
  }
  if (mv.promotion) parts.push(`превращает пешку в ${W.acc[mv.promotion]}`);
  if (after.inCheck() && !captured) parts.push('объявляет шах');

  // вилка и новые угрозы
  const hit = [];
  for (const row of after.board()) {
    for (const c of row) {
      if (!c || c.color !== opp || c.type === 'k') continue;
      if (after.attackers(c.square, me).includes(mv.to)) hit.push({ sq: c.square, type: c.type, gain: see(after, c.square, me) });
    }
  }
  const kingHit = after.inCheck() && after.attackers(kingSq(after, opp), me).includes(mv.to);
  const targets = hit.filter(t => t.gain > 0);
  const known = new Set(threatsOn(before, opp).map(t => t.sq));
  const fresh = threatsOn(after, opp).filter(t => !known.has(t.sq) && !(mv.captured && t.sq === mv.to));
  if (!mv.captured && targets.length + (kingHit ? 1 : 0) >= 2) {
    const names = targets.map(t => o(t.type, t.sq, opp, 'acc'));
    if (kingHit) names.unshift('короля');
    parts.push(`вилка: ${W.nom[mv.piece]} нападает сразу на ${names.slice(0, 3).join(' и ')}`);
  } else {
    for (const t of fresh.slice(0, 2)) parts.push(`угрожает взять ${o(t.type, t.sq, opp, 'acc')}`);
  }

  // защита собственных фигур
  const ownAfter = threatsOn(after, me);
  for (const t of threatsOn(before, me)) {
    if (t.sq === mv.from) {
      if (!ownAfter.some(x => x.sq === mv.to)) parts.push(`уводит ${o(t.type, null, me, 'acc')} из-под боя`);
    } else if (!ownAfter.some(x => x.sq === t.sq)) {
      parts.push(`снимает угрозу для ${o(t.type, t.sq, me, 'gen')}`);
    }
  }

  // развитие и «спокойные» ходы
  const home = me === 'w' ? '1' : '8';
  if (!captured && !mv.flags.includes('k') && !mv.flags.includes('q')) {
    if ((mv.piece === 'n' || mv.piece === 'b') && mv.from[1] === home) parts.unshift(`развивает ${W.acc[mv.piece]}`);
    else if (mv.piece === 'p' && CENTER.has(mv.to)) parts.unshift('занимает центр пешкой');
  }
  if (!parts.length) {
    if (mv.piece === 'p' && (mv.to === 'c4' || mv.to === 'c5')) parts.push('борется за центр');
    else if (mv.piece === 'k') parts.push('ход королём (рокировка после этого невозможна)');
    else parts.push(`${mv.piece === 'p' ? 'продвигает пешку' : `перемещает ${W.acc[mv.piece]}`} на ${mv.to}`);
    const atk = hit.filter(t => t.type !== 'p' && !fresh.some(f => f.sq === t.sq)).slice(0, 2);
    if (atk.length) parts.push(`нападает на ${atk.map(t => o(t.type, t.sq, opp, 'acc')).join(' и ')} (они защищены)`);
  }
  return { san: mv.san, text: cap(parts.join(', ')) + '.' };
}

// Что под боем у каждой из сторон (для подсказки и предупреждений)
export function dangers(fen, user) {
  const ch = new Chess(fen);
  const mine = threatsOn(ch, user).map(t => P(t.type, t.sq, user, user, 'nom'));
  const theirs = threatsOn(ch, other(user)).map(t => P(t.type, t.sq, other(user), user, 'nom'));
  return { mine, theirs };
}

export function hintText(fen, user) {
  const d = dangers(fen, user);
  const out = [];
  if (d.mine.length) out.push(`Под боем: ${d.mine.join(', ')}. Позаботьтесь о защите или уведите фигуру.`);
  if (d.theirs.length) out.push(`Можно выиграть: ${d.theirs.join(', ')}.`);
  if (!out.length) out.push('Явных угроз нет ни у вас, ни у соперника. Развивайте фигуры, боритесь за центр, позаботьтесь о короле.');
  return out.join(' ');
}

// ───── Оценка ─────
export const score = l => (l.mate !== null && l.mate !== undefined ? (l.mate > 0 ? 1 : -1) * (10000 - Math.abs(l.mate) * 10) : l.cp);
const clamp = x => Math.max(-1500, Math.min(1500, x));

export const CLS = {
  best: { ico: '★', name: 'Лучший ход', tone: 'ok' },
  good: { ico: '✓', name: 'Хороший ход', tone: 'ok' },
  ok: { ico: '·', name: 'Нормальный ход', tone: '' },
  inacc: { ico: '?!', name: 'Неточность', tone: 'warn' },
  mistake: { ico: '?', name: 'Ошибка', tone: 'bad' },
  blunder: { ico: '??', name: 'Грубая ошибка', tone: 'bad' },
};

// a0 — анализ позиции до хода (сторона пользователя ходит), a1 — анализ после хода (ходит соперник),
// over — 'mate' | 'draw' | null: чем закончилась партия этим ходом
export function judge({ a0, uci, a1, over }) {
  const best = a0[0];
  const cp0 = clamp(score(best));
  const line = a0.find(l => l.uci === uci);
  let cpU;
  if (line) cpU = clamp(score(line));
  else if (over === 'mate') cpU = 1500;
  else if (over === 'draw' || !a1 || !a1.length) cpU = 0;
  else cpU = clamp(-score(a1[0]));
  const isBest = best.uci === uci || cpU >= cp0;
  const loss = Math.max(0, cp0 - cpU);
  let cls;
  if (isBest) cls = 'best';
  else if (cp0 >= 600 && cpU >= 400) cls = 'good';        // выигрыш сохранён
  else if (cp0 <= -600) cls = 'ok';                        // позиция и так проиграна — не придираемся
  else if (loss <= 15) cls = 'good';
  else if (loss <= 50) cls = 'ok';
  else if (loss <= 110) cls = 'inacc';
  else if (loss <= 250) cls = 'mistake';
  else cls = 'blunder';
  return { cp0, cpU, loss, cls };
}

export const isBad = cls => cls === 'inacc' || cls === 'mistake' || cls === 'blunder';

export function evalText(cp) {
  if (Math.abs(cp) >= 1500) return cp > 0 ? 'выигрыш' : 'проигрыш';
  const v = (cp / 100).toFixed(1);
  return (cp > 0 ? '+' : '') + v;
}

// Точность по формуле Lichess (по выигрышным шансам)
const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(cp))) - 1);
export function moveAccuracy(cp0, cpU) {
  const d = Math.max(0, winPct(cp0) - winPct(cpU));
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * d) - 3.1669));
}

// ───── Почему ход плохой ─────
function openingAdvice(before, mv) {
  if (before.history().length > 16) return '';
  if (mv.piece === 'q') return 'Ранний выход ферзя: его легко атаковать, и вы потеряете время. Сначала развивайте коней и слонов.';
  if (mv.piece === 'k' && !mv.flags.includes('k') && !mv.flags.includes('q')) return 'Король вышел из укрытия и потерял право на рокировку. Лучше рокироваться.';
  if (mv.piece === 'p' && 'abgh'.includes(mv.from[0]) && !mv.captured) return 'Фланговая пешка не помогает ни центру, ни развитию. В дебюте важнее центр и развитие фигур.';
  if (mv.piece === 'p' && mv.from[0] === 'f' && before.history().length <= 8) return 'Ход f-пешкой ослабляет позицию короля.';
  const prev = before.history({ verbose: true }).filter(m => m.color === mv.color).pop();
  if (prev && prev.to === mv.from && prev.piece !== 'p' && !mv.captured) return 'Одной и той же фигурой во второй раз подряд — в дебюте лучше развивать новые фигуры.';
  return 'Ход не улучшает позицию. В дебюте: развивайте фигуры, боритесь за центр, рокируйтесь.';
}

export function explainBad({ fen0, uci, user, a1 }) {
  const before = new Chess(fen0), after = new Chess(fen0);
  const mv = after.move(uciMove(uci));
  const opp = other(user);
  const me = o => P(o.type, o.sq, user, user, 'nom');
  const out = [];
  const r = a1 && a1[0];
  let pvLine = '';
  if (r) {
    const sim = new Chess(after.fen());
    const sans = [];
    let rm = null;
    for (const u of r.pv.slice(0, 6)) {
      try { const m = sim.move(uciMove(u)); sans.push(m.san); if (!rm) rm = m; } catch (e) { break; }
    }
    pvLine = sans.slice(0, 4).join(' ');
    if (r.mate > 0) {
      out.push(`после этого у соперника мат в ${r.mate} ${plural(r.mate, 'ход', 'хода', 'ходов')} (начиная с ${sans[0]})`);
    } else if (rm && rm.captured && see(after, rm.to, opp) > 0) {
      const cs = rm.to, ct = rm.captured;
      if (cs === mv.to) {
        const who = cap(me({ type: ct, sq: cs }));
        if (!after.attackers(cs, user).length) out.push(`${who} остаётся без защиты — соперник забирает ${W.acc[ct]} ходом ${rm.san}`);
        else out.push(`${who} под ударом более дешёвой фигуры — после ${rm.san} вы проигрываете обмен`);
      } else if (threatsOn(before, user).some(t => t.sq === cs)) {
        out.push(`вы не заметили угрозу: ${me({ type: ct, sq: cs })} находится под боем, а вы не защитили и не увели ${W.acc[ct]} — соперник берёт ходом ${rm.san}`);
      } else if (before.attackers(cs, user).includes(mv.from) && !after.attackers(cs, user).length) {
        out.push(`ход убрал защиту: ${me({ type: ct, sq: cs })} остаётся без прикрытия — соперник берёт ходом ${rm.san}`);
      } else if (after.attackers(cs, opp).some(s => !before.attackers(cs, opp).includes(s))) {
        out.push(`ход открыл линию атаки: ${me({ type: ct, sq: cs })} теперь под боем (${rm.san})`);
      } else {
        out.push(`${cap(me({ type: ct, sq: cs }))} теряется после ${rm.san}`);
      }
    } else {
      let k = sans.length;
      if (k > 1 && k % 2 === 1) k--;
      const sim2 = new Chess(after.fen());
      r.pv.slice(0, k).forEach(u => { try { sim2.move(uciMove(u)); } catch (e) { /* конец линии */ } });
      const lost = material(after, user) - material(sim2, user);
      if (lost >= 2) out.push(`в ближайших ходах вы теряете материал (около ${lost} ${plural(lost, 'очко', 'очка', 'очков')}): ${pvLine}`);
    }
  }
  if (!out.length) out.push(openingAdvice(before, mv));
  return { reasons: out, line: pvLine };
}

// ───── Книга дебютов: «это теория» ─────
const norm = s => s.replace(/[+#]/g, '');
export function bookIndex(db) {
  const m = new Map();
  for (const rep of db.reps) {
    for (const l of rep.lines) {
      l.moves.forEach((mv, i) => {
        const key = l.moves.slice(0, i + 1).map(x => norm(x.san)).join(' ');
        if (!m.has(key) && mv.note) m.set(key, { note: mv.note, title: l.title });
      });
    }
  }
  return m;
}
export const bookKey = sans => sans.map(norm).join(' ');

// ───── Уровни соперника ─────
export const LEVELS = [
  { id: 'easy', name: 'Новичок', icon: '🐣', desc: 'Часто ошибается и зевает фигуры — удобно, чтобы набить руку на выигрыше материала.', depth: 2, mpv: 5, pBlunder: 0.3, spread: 350, xp: 0.6 },
  { id: 'mid', name: 'Любитель', icon: '🙂', desc: 'Играет разумно, но временами пропускает тактику.', depth: 4, mpv: 4, pBlunder: 0.18, spread: 200, xp: 1 },
  { id: 'club', name: 'Клубный игрок', icon: '😎', desc: 'Редко ошибается: придётся играть аккуратно.', depth: 7, mpv: 3, pBlunder: 0.08, spread: 100, xp: 1.3 },
  { id: 'strong', name: 'Сильный', icon: '🔥', desc: 'Почти без ошибок. Выиграть трудно — зато учит больше всего.', depth: 12, mpv: 1, pBlunder: 0, spread: 0, xp: 1.6 },
];

export function chooseBot(lines, lv, rnd01 = Math.random) {
  if (!lines.length) return null;
  const best = lines[0];
  if (lv.pBlunder && lines.length > 1 && !(best.mate > 0) && rnd01() < lv.pBlunder) {
    const b = clamp(score(best));
    const alt = lines.slice(1).filter(l => b - clamp(score(l)) <= lv.spread);
    if (alt.length) return alt[Math.floor(rnd01() * alt.length)].uci;
  }
  return best.uci;
}
