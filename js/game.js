// Партия с тренером: играете против Stockfish, тренер объясняет каждый ход и разбирает ошибки.
import { Chess } from '../lib/chess.js';
import { Board } from './board.js';
import { S, addXP, save, checkAch } from './store.js';
import { $, esc, sleep, dataUrl } from './util.js';
import { initEngine, analyze } from './engine.js';
import { sfx } from './sound.js';
import {
  LEVELS, CLS, judge, isBad, describe, explainBad, dangers, hintText, evalText,
  moveAccuracy, bookIndex, bookKey, chooseBot,
} from './coach.js';

const START = new Chess().fen();
const uciMove = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const sanOf = (fen, u) => new Chess(fen).move(uciMove(u)).san;

// ───── Экран выбора: цвет и сложность ─────
export async function coachScreen(root, ctx) {
  initEngine().catch(() => {});                       // прогрев движка, пока вы выбираете
  const cfg = Object.assign({ side: 'w', level: 'mid' }, S.set.coach);
  const g = S.game;
  const st = S.stats;
  const draw = () => {
    root.innerHTML = `<div class="pad">
      <h1>Партия с тренером</h1>
      <p class="mut small">Играйте обычную партию против Stockfish. После каждого хода тренер объясняет, что вы сделали и что ответил соперник. Если ход слабый — скажет почему, покажет лучший и даст его переиграть.</p>
      ${g ? `<div class="card"><b>Есть незаконченная партия</b>
        <div class="mut small">${g.side === 'w' ? 'Белыми' : 'Чёрными'} · ${esc((LEVELS.find(l => l.id === g.level) || LEVELS[1]).name)} · сыграно ходов: ${g.moves.length}</div>
        <button class="btn primary wide" id="resume">▶ Продолжить</button></div>` : ''}
      <h3>Ваш цвет</h3>
      <div class="row gap">${[['w', '⚪ Белыми'], ['b', '⚫ Чёрными'], ['r', '🎲 Случайно']].map(([k, t]) => `<button class="btn opt${cfg.side === k ? ' on' : ''}" data-side="${k}">${t}</button>`).join('')}</div>
      <h3>Соперник</h3>
      ${LEVELS.map(l => `<button class="card opt lvl${cfg.level === l.id ? ' on' : ''}" data-lv="${l.id}">
        <div class="row between"><b>${l.icon} ${l.name}</b>${l.xp !== 1 ? `<span class="tag">XP ×${l.xp}</span>` : ''}</div>
        <div class="mut small">${l.desc}</div></button>`).join('')}
      <button class="btn primary wide big" id="start">▶ Начать партию</button>
      <p class="mut small center">Сыграно партий: ${st.games} · побед: ${st.wins}${st.bestAcc ? ` · лучшая точность: ${st.bestAcc}%` : ''}</p>
    </div>`;
    root.querySelectorAll('[data-side]').forEach(b => { b.onclick = () => { cfg.side = b.dataset.side; draw(); }; });
    root.querySelectorAll('[data-lv]').forEach(b => { b.onclick = () => { cfg.level = b.dataset.lv; draw(); }; });
    if (g) $('#resume').onclick = () => ctx.go('game');
    $('#start').onclick = () => {
      if (S.game && !confirm('Текущая незаконченная партия будет потеряна. Начать новую?')) return;
      S.set.coach = { side: cfg.side, level: cfg.level };
      const side = cfg.side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : cfg.side;
      S.game = { side, level: cfg.level, fen: START, moves: [], hints: 0, back: 0 };
      save();
      ctx.go('game');
    };
  };
  draw();
}

// ───── Партия ─────
export async function gameScreen(root, ctx) {
  const rec = S.game;
  if (!rec) { ctx.go('coach'); return; }
  const lv = LEVELS.find(l => l.id === rec.level) || LEVELS[1];
  const user = rec.side;
  let book = new Map();
  try { book = bookIndex(await (await fetch(dataUrl('openings.json'))).json()); } catch (e) { /* без теории */ }

  root.innerHTML = `<div class="sess">
    <div class="sess-head"><button class="back" id="back">‹</button><div class="sess-title">Партия · ${esc(lv.name)}</div><div class="sess-right"><button class="back" id="resign" title="Сдаться">🏳</button></div></div>
    <div class="boardwrap"><div class="board" id="board"></div></div>
    <div class="status" id="status"></div>
    <div class="panel" id="panel"></div>
    <div class="coach" id="coach"></div>
    <details class="hist" id="hist"><summary>Все ходы и пояснения</summary><div class="moves" id="moves"></div></details>
  </div>`;
  const board = new Board($('#board'));
  board.load(rec.fen, user === 'w' ? 'white' : 'black');
  for (const m of rec.moves) board.play(m.u);

  let tok = 0, over = false, pre = null, fen0 = '', hintStep = 0;
  const status = (t, k = '') => { const s = $('#status'); s.textContent = t; s.className = 'status ' + k; };

  const fenParts = rec.fen.split(' ');
  const startPly = (parseInt(fenParts[5] || '1', 10) - 1) * 2 + (fenParts[1] === 'b' ? 1 : 0);
  const plyNo = i => { const p = startPly + i; return p % 2 === 0 ? `${p / 2 + 1}.` : `${(p - 1) / 2 + 1}…`; };

  const bookNote = () => {
    if (rec.fen !== START) return null;
    return book.get(bookKey(board.chess.history())) || null;
  };

  // ── оформление пояснений ──
  const userHtml = e => {
    const c = CLS[e.cls];
    let h = `<div class="cm ${c.tone}"><span class="bd">${c.ico}</span><div><b>Ваш ход ${esc(e.san)} · ${c.name}</b><p>${esc(e.text)}</p>`;
    if (e.book) h += `<p class="bk">📖 Теория (${esc(e.book.title)}): ${esc(e.book.note)}</p>`;
    if (e.why) {
      h += e.why.map(w => `<p class="why">⚠ ${esc(cap(w))}.</p>`).join('');
      if (e.line && !e.why.some(w => w.includes(e.line))) h += `<p class="mut small">Вероятное продолжение: ${esc(e.line)}</p>`;
      h += `<p class="best">✅ Лучше было <b>${esc(e.best.san)}</b>: ${esc(e.best.text)}</p>`;
      h += `<p class="mut small">Оценка позиции: было ${evalText(e.cp0)}, стало ${evalText(e.cpU)} (в вашу пользу «+»).</p>`;
    } else if (e.cls === 'ok' && e.best && e.best.u !== e.u && e.loss > 20) {
      h += `<p class="mut small">Чуть сильнее было ${esc(e.best.san)}.</p>`;
    }
    return h + '</div></div>';
  };
  const botHtml = e => {
    let h = `<div class="cm bot"><span class="bd">🤖</span><div><b>Соперник сыграл ${esc(e.san)}</b><p>${esc(e.text)}</p>`;
    if (e.book) h += `<p class="bk">📖 Теория (${esc(e.book.title)}): ${esc(e.book.note)}</p>`;
    if (e.warn && e.warn.length) h += `<p class="why">⚠ Под боем: ${esc(e.warn.join(', '))}.</p>`;
    return h + '</div></div>';
  };
  const renderCoach = () => {
    const ms = rec.moves;
    let ui = -1;
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].who === 'u') { ui = i; break; }
    let html = '';
    if (ui >= 0) html += userHtml(ms[ui]);
    const bi = ms.findIndex((m, i) => m.who === 'b' && i > ui);
    if (bi >= 0 && ms[bi]) html += botHtml(ms[bi]);
    if (!html) html = '<div class="mut small center">Делайте ход — тренер прокомментирует.</div>';
    $('#coach').innerHTML = html;
  };
  const renderLog = () => {
    $('#moves').innerHTML = rec.moves.map((e, i) => {
      const t = e.who === 'u' ? `${CLS[e.cls].ico} ${e.text}${e.why ? ' ' + e.why.map(cap).join('. ') + '.' : ''}` : e.text;
      return `<div class="mv${e.who === 'u' ? ' mine' : ''}"><b>${plyNo(i)} ${esc(e.san)}${e.who === 'u' && isBad(e.cls) ? ' ' + CLS[e.cls].ico : ''}</b> — ${esc(t)}</div>`;
    }).join('');
    const m = $('#moves'); m.scrollTop = m.scrollHeight;
  };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  const panelPlay = () => {
    $('#panel').innerHTML = `<div class="row gap"><button class="btn" id="b-hint">💡 Подсказка</button></div>`;
    $('#b-hint').onclick = hint;
  };
  const panelNone = () => { $('#panel').innerHTML = ''; };

  // ── ход игры ──
  function result() {
    const ch = board.chess;
    if (ch.isCheckmate()) return ch.turn() === user ? 'loss' : 'win';
    if (ch.isGameOver()) return 'draw';
    return null;
  }
  async function next() {
    if (over) return;
    const r = result();
    if (r) return finish(r);
    if (board.chess.turn() === user) return userTurn();
    return botTurn();
  }

  function userTurn() {
    fen0 = board.chess.fen();
    hintStep = 0;
    if (!pre) pre = analyze(fen0, { depth: 12, multipv: 3, movetime: 2500 });
    board.clearShapes();
    status(board.chess.inCheck() ? 'Вам шах! Ваш ход.' : 'Ваш ход.');
    panelPlay();
    board.unlock(onUser);
  }

  async function hint() {
    if (over) return;
    hintStep++; rec.hints++; save();
    if (hintStep === 1) {
      status('💡 ' + hintText(fen0, user));
      $('#b-hint').textContent = '💡 Показать ход';
      return;
    }
    const a0 = await pre;
    if (!a0 || !a0.length) return;
    const b = a0[0];
    board.clearShapes();
    board.arrow(b.uci.slice(0, 2), b.uci.slice(2, 4), 'green');
    status(`💡 Лучший ход: ${sanOf(fen0, b.uci)}. ${describe(fen0, b.uci, user).text}`);
  }

  function onUser(mv) {
    if (over) return false;
    sfx.move();
    board.clearShapes();
    panelNone();
    evalUser(mv, mv.from + mv.to + (mv.promotion || ''), fen0).catch(err => { console.error(err); status('Тренер не смог оценить ход. Играем дальше.'); pre = null; setTimeout(next, 600); });
    return true;
  }

  async function evalUser(mv, uci, f0) {
    const my = tok;
    status('Тренер оценивает ваш ход…');
    const ch = board.chess;
    const ov = ch.isCheckmate() ? 'mate' : ch.isGameOver() ? 'draw' : null;
    const [a0, a1] = await Promise.all([pre, ov ? [] : analyze(ch.fen(), { depth: 12, movetime: 2500 })]);
    if (my !== tok) return;
    const d = describe(f0, uci, user);
    const e = { u: uci, san: mv.san, who: 'u', text: d.text, cls: 'ok', loss: 0, cp0: 0, cpU: 0 };
    const bk = bookNote();
    if (bk) e.book = bk;
    if (a0 && a0.length) {
      const v = judge({ a0, uci, a1, over: ov });
      Object.assign(e, v);
      const b = a0[0];
      e.best = { u: b.uci, san: sanOf(f0, b.uci), text: describe(f0, b.uci, user).text };
      if (isBad(v.cls)) {
        const ex = explainBad({ fen0: f0, uci, user, a1 });
        e.why = ex.reasons.filter(Boolean);
        e.line = ex.line;
      }
    }
    rec.moves.push(e);
    save();
    renderCoach(); renderLog();
    if (e.why && e.why.length && !ov) {
      sfx.bad();
      status(`${CLS[e.cls].ico} ${CLS[e.cls].name}. Прочитайте разбор ниже.`, e.cls === 'inacc' ? '' : 'bad');
      $('#panel').innerHTML = `<div class="row gap"><button class="btn" id="b-undo">↩ Вернуть ход</button><button class="btn" id="b-show">👁 Лучший</button><button class="btn primary" id="b-go">▶ Дальше</button></div>`;
      $('#b-undo').onclick = undo;
      $('#b-show').onclick = () => { board.clearShapes(); board.arrow(e.best.u.slice(0, 2), e.best.u.slice(2, 4), 'green'); };
      $('#b-go').onclick = () => { pre = null; board.clearShapes(); next(); };
      return;
    }
    if (e.cls === 'best' || e.cls === 'good') { sfx.good(); status(`${CLS[e.cls].ico} ${CLS[e.cls].name}.`, 'ok'); }
    else status('Ход принят.');
    pre = null;
    await sleep(700);
    if (my !== tok) return;
    next();
  }

  function undo() {
    rec.moves.pop(); rec.back++;
    board.chess.undo(); board.hist.pop(); board.sync(); board.clearShapes();
    save(); renderCoach(); renderLog();
    userTurn();                                          // анализ позиции сохранён в pre
  }

  async function botTurn() {
    const my = tok;
    board.lock();
    panelNone();
    status('Соперник думает…');
    const fen = board.chess.fen();
    let uci;
    try {
      if (!rec.moves.length && rec.fen === START) {
        const r = Math.random();
        uci = r < 0.5 ? 'e2e4' : r < 0.75 ? 'd2d4' : r < 0.9 ? 'g1f3' : 'c2c4';
      } else {
        uci = chooseBot(await analyze(fen, { depth: lv.depth, multipv: lv.mpv }), lv);
      }
    } catch (err) { console.error(err); status('Не удалось запустить движок.', 'bad'); return; }
    if (my !== tok) return;
    if (!uci) return next();
    await sleep(350);
    if (my !== tok) return;
    const d = describe(fen, uci, user);
    const mv = board.play(uci);
    sfx.move();
    const e = { u: uci, san: mv.san, who: 'b', text: d.text };
    const bk = bookNote();
    if (bk) e.book = bk;
    const dg = dangers(board.chess.fen(), user).mine;
    if (dg.length) e.warn = dg;
    rec.moves.push(e);
    save();
    renderCoach(); renderLog();
    next();
  }

  // ── конец партии ──
  function finish(res, how = '') {
    over = true; tok++;
    board.lock(); board.clearShapes(); panelNone();
    const us = rec.moves.filter(m => m.who === 'u');
    const n = us.length;
    const cnt = { best: 0, good: 0, ok: 0, inacc: 0, mistake: 0, blunder: 0 };
    us.forEach(m => { cnt[m.cls]++; });
    const acc = n ? Math.round(us.reduce((s, m) => s + moveAccuracy(m.cp0, m.cpU), 0) / n) : 0;
    const clean = n >= 10 && !cnt.mistake && !cnt.blunder;
    const counted = n >= 6;
    let xp = 0;
    if (counted) {
      const base = n < 8 ? 5 : res === 'win' ? 40 : res === 'draw' ? 25 : 15;
      xp = Math.round((base + (clean ? 20 : 0)) * lv.xp);
      S.stats.games++;
      if (res === 'win') { S.stats.wins++; if (lv.id === 'strong') S.stats.wonStrong++; }
      if (res === 'draw') S.stats.draws++;
      if (clean) S.stats.gclean++;
      if (n >= 10) S.stats.bestAcc = Math.max(S.stats.bestAcc, acc);
    }
    const keys = us.filter(m => m.why && m.why.length).sort((a, b) => b.loss - a.loss).slice(0, 3);
    S.game = null;
    save();
    if (xp) addXP(xp, 'game');
    checkAch();
    sfx[res === 'win' ? 'win' : 'good']();
    const title = res === 'win' ? '🏆 Победа!' : res === 'draw' ? '🤝 Ничья' : how === 'resign' ? '🏳 Вы сдались' : 'Поражение';
    status(title, res === 'win' ? 'ok' : '');
    $('#coach').innerHTML = `<div class="res">
      <h2>${title}</h2>
      <div class="grid2"><div class="stat"><b>${n ? acc + '%' : '—'}</b><span>точность</span></div><div class="stat"><b>${n}</b><span>ваших ходов</span></div></div>
      <div class="small center">★ ${cnt.best} · ✓ ${cnt.good} · ?! ${cnt.inacc} · ? ${cnt.mistake} · ?? ${cnt.blunder}${rec.back ? ` · возвратов хода: ${rec.back}` : ''}${rec.hints ? ` · подсказок: ${rec.hints}` : ''}</div>
      ${keys.length ? `<h3>Главные уроки</h3>${keys.map(m => `<div class="lesson"><b>${esc(m.san)} ${CLS[m.cls].ico}</b> — ${esc(m.why.map(cap).join('. '))}. Лучше: <b>${esc(m.best.san)}</b>.</div>`).join('')}` : (n >= 6 ? '<p class="small">Серьёзных ошибок тренер не нашёл. Отличная партия!</p>' : '')}
      <p class="mut small">${counted ? (xp ? `Награда: +${xp} XP${clean ? ' (чистая партия без ошибок: бонус)' : ''}.` : '') : 'Слишком короткая партия — не засчитана.'}</p>
      <div class="row gap"><button class="btn primary" id="b-new">Новая партия</button><button class="btn" id="b-menu">Меню</button></div>
    </div>`;
    renderLog();
    $('#b-new').onclick = () => ctx.go('coach');
    $('#b-menu').onclick = () => ctx.go('home');
  }

  window.__dbg = Object.assign(window.__dbg || {}, { game: () => ({ fen: board.chess.fen(), n: rec.moves.length, over }) });
  $('#back').onclick = () => ctx.go('coach');
  $('#resign').onclick = () => { if (!over && confirm('Сдаться и закончить партию?')) finish('loss', 'resign'); };
  renderCoach(); renderLog();
  next();
  return () => { tok++; over = true; board.destroy(); };
}
