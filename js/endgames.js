// Эндшпили против Stockfish: вы играете за сильную сторону и доводите позицию до победы.
import { Chess } from '../lib/chess.js';
import { Board } from './board.js';
import { S, grade, addXP, quest } from './store.js';
import { $, esc, sleep, dayNum, dataUrl } from './util.js';
import { bestMove } from './engine.js';
import { sfx } from './sound.js';

let DB = null;
async function load() {
  if (!DB) DB = (await (await fetch(dataUrl('endgames.json'))).json()).list;
  return DB;
}

export async function nextEndgame() {
  const list = await load();
  const t = dayNum();
  const due = list.filter(e => S.end[e.id] && S.end[e.id].d <= t).sort((a, b) => S.end[a.id].d - S.end[b.id].d);
  if (due.length) return due[0];
  const fresh = list.find(e => !S.end[e.id]);
  return fresh || list.slice().sort((a, b) => S.end[a.id].d - S.end[b.id].d)[0];
}

const goalTxt = g => (g === 'mate' ? 'Поставьте мат' : 'Проведите пешку в ферзи');
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);

export async function endgamesScreen(root, ctx) {
  const list = await load();
  const t = dayNum();
  root.innerHTML = `<div class="pad"><h1>Эндшпиль</h1>
    <p class="mut small">Вы играете за белых против Stockfish. Победа — без ошибок и подсказок ведёт к повышению освоения.</p>
    ${list.map(e => {
      const s = S.end[e.id];
      const st = !s ? ['новая', 'new'] : s.d <= t ? ['повторить', 'due'] : s.b >= 2 ? ['освоена', 'done'] : ['в процессе', 'mid'];
      return `<button class="card endg" data-id="${e.id}">
        <div class="grow"><div class="row between"><b>${esc(e.title)}</b><span class="tag ${st[1]}">${st[0]}</span></div>
        <div class="mut small">${goalTxt(e.goal)} · ${stars(e.level)}</div></div></button>`;
    }).join('')}</div>`;
  root.querySelectorAll('.endg').forEach(b => { b.onclick = () => ctx.go('endgame', { id: b.dataset.id }); });
}

export async function endgameSession(root, ctx, { id }) {
  const list = await load();
  const eg = list.find(e => e.id === id);
  root.innerHTML = `<div class="sess">
    <div class="sess-head"><button class="back" id="back">‹</button><div class="sess-title">${esc(eg.title)}</div><div class="sess-right"><span class="rt" id="mv">Ход 0</span></div></div>
    <div class="q">${esc(goalTxt(eg.goal))}. <span class="mut">${esc(eg.idea)}</span></div>
    <div class="boardwrap"><div class="board" id="board"></div></div>
    <div class="status" id="status"></div>
    <div class="panel" id="panel"></div>
  </div>`;
  const board = new Board($('#board'));
  let token = 0, hints = 0, over = false, moves = 0;

  const status = (t, k = '') => { const s = $('#status'); s.textContent = t; s.className = 'status ' + k; };
  const controls = () => {
    $('#panel').innerHTML = `<div class="row gap"><button class="btn" id="b-hint">💡 Подсказка</button><button class="btn" id="b-restart">↺ Заново</button></div>`;
    $('#b-hint').onclick = hint;
    $('#b-restart').onclick = start;
  };

  function start() {
    token++; over = false; hints = 0; moves = 0;
    board.load(eg.fen, 'white');
    $('#mv').textContent = 'Ход 0';
    status(`${goalTxt(eg.goal)}. Ваш ход.`);
    controls();
    board.unlock(onUser);
  }

  async function hint() {
    if (over) return;
    hints++;
    status('Думаю…');
    const b = await bestMove(board.chess.fen(), { depth: 14 });
    if (!b) return;
    board.clearShapes();
    board.arrow(b.slice(0, 2), b.slice(2, 4), 'green');
    status('Подсказка: движок советует этот ход.');
  }

  async function onUser(mv) {
    if (over) return false;
    const myToken = token;
    board.clearShapes();
    moves++; $('#mv').textContent = `Ход ${moves}`;
    sfx.move();
    const ch = board.chess;
    if (ch.isCheckmate()) { end(true); return true; }
    if (ch.isStalemate() || ch.isInsufficientMaterial() || ch.isDraw()) { end(false, ch.isStalemate() ? 'Пат! Это ничья — будьте осторожнее с последним ходом.' : 'Ничья.'); return true; }
    if (eg.goal === 'promote' && mv.promotion) {
      // превращение: проверим, не берется ли новая фигура сразу
      const loses = ch.moves({ verbose: true }).some(m => m.to === mv.to);
      if (!loses) { end(true); return true; }
    }
    board.lock();
    status('Соперник думает…');
    const reply = await bestMove(ch.fen(), { depth: 10 });
    if (myToken !== token) return true;
    if (!reply) { end(false, 'Нет ходов у соперника.'); return true; }
    await sleep(250);
    if (myToken !== token) return true;
    const rm = board.play(reply); sfx.move();
    if (ch.isCheckmate()) { end(false, 'Вам поставили мат.'); return true; }
    if (rm.captured && eg.goal === 'promote' && rm.captured === 'p') { end(false, 'Пешка потеряна.'); return true; }
    if (ch.isDraw() || ch.isStalemate() || ch.isInsufficientMaterial()) { end(false, 'Ничья.'); return true; }
    if (moves >= 60) { end(false, 'Слишком долго — 50-ходовое правило близко.'); return true; }
    status(`${goalTxt(eg.goal)}. Ваш ход.`);
    board.unlock();
    return true;
  }

  function end(win, why = '') {
    over = true; board.lock(); board.clearShapes();
    const clean = win && hints === 0;
    grade(S.end, eg.id, clean);
    if (win) {
      S.stats.end++;
      addXP(clean ? 30 : 15, 'end');
      quest('end');
      sfx.win();
      status(clean ? 'Победа без подсказок!' : 'Победа! (с подсказками)', 'ok');
    } else {
      sfx.bad();
      status(why || 'Не получилось.', 'bad');
    }
    $('#panel').innerHTML = `<div class="res"><div class="row gap"><button class="btn" id="b-again">↺ Ещё раз</button><button class="btn primary" id="b-list">К списку</button></div></div>`;
    $('#b-again').onclick = start;
    $('#b-list').onclick = () => ctx.go('endgames');
  }

  $('#back').onclick = () => ctx.go('endgames');
  start();
  return () => { token++; over = true; board.destroy(); };
}
