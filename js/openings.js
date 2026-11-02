// Дебюты: репертуар (итальянка за белых, Каро-Канн за чёрных), режимы «Учить» и «Повторить».
import { Chess } from '../lib/chess.js';
import { Board } from './board.js';
import { S, grade, addXP, quest, IV } from './store.js';
import { $, esc, sleep, dayNum, dataUrl } from './util.js';
import { sfx } from './sound.js';

let DB = null;
async function load() {
  if (!DB) DB = await (await fetch(dataUrl('openings.json'))).json();
  return DB;
}

const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
function status(l) {
  const e = S.lines[l.id];
  if (!e) return { txt: 'новая', cls: 'new' };
  if (e.d <= dayNum()) return { txt: 'пора повторить', cls: 'due' };
  return { txt: e.b >= 3 ? 'выучена' : 'в процессе', cls: e.b >= 3 ? 'done' : 'mid' };
}
const meter = l => { const b = S.lines[l.id] ? S.lines[l.id].b : 0; return `<span class="meter">${'●'.repeat(Math.min(b, 5))}${'○'.repeat(5 - Math.min(b, 5))}</span>`; };

// Следующая рекомендованная линия: сначала просроченные, потом новые по порядку
export async function nextLine() {
  const db = await load();
  const all = db.reps.flatMap(r => r.lines.map(l => ({ rep: r, line: l })));
  const due = all.filter(x => S.lines[x.line.id] && S.lines[x.line.id].d <= dayNum()).sort((a, b) => S.lines[a.line.id].d - S.lines[b.line.id].d);
  if (due.length) return { ...due[0], mode: 'repeat' };
  const fresh = all.filter(x => !S.lines[x.line.id]).sort((a, b) => a.line.level - b.line.level);
  if (fresh.length) return { ...fresh[0], mode: 'learn' };
  const worst = all.sort((a, b) => S.lines[a.line.id].d - S.lines[b.line.id].d)[0];
  return { ...worst, mode: 'repeat' };
}

export async function dueLines() {
  const db = await load();
  return db.reps.flatMap(r => r.lines).filter(l => S.lines[l.id] && S.lines[l.id].d <= dayNum()).length;
}

// ───── Список репертуара ─────
export async function openingsScreen(root, ctx, { rep: repId = null } = {}) {
  const db = await load();
  if (!repId) {
    root.innerHTML = `<div class="pad"><h1>Дебюты</h1>${db.reps.map(r => {
      const learned = r.lines.filter(l => S.lines[l.id] && S.lines[l.id].b >= 3).length;
      const due = r.lines.filter(l => S.lines[l.id] && S.lines[l.id].d <= dayNum()).length;
      return `<button class="card rep" data-rep="${r.id}">
        <div class="rep-ico">${r.side === 'w' ? '♔' : '♚'}</div>
        <div class="grow"><div class="rep-t">${esc(r.title)}</div><div class="mut small">${esc(r.blurb)}</div>
        <div class="small">Линий: ${r.lines.length} · выучено: ${learned}${due ? ` · <b class="warn">повторить: ${due}</b>` : ''}</div></div></button>`;
    }).join('')}
    <p class="mut small">Остальные дебюты добавим позже: структура уже готова под новые линии.</p></div>`;
    root.querySelectorAll('.rep').forEach(b => { b.onclick = () => ctx.go('openings', { rep: b.dataset.rep }); });
    return;
  }
  const rep = db.reps.find(r => r.id === repId);
  root.innerHTML = `<div class="pad">
    <button class="back inline" id="back">‹ Дебюты</button>
    <h1>${esc(rep.title)}</h1>
    <div class="card"><b>Идеи</b><ul class="plans">${rep.plans.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
    ${rep.lines.map(l => {
      const st = status(l);
      return `<div class="card line">
        <div class="row between"><b>${esc(l.title)}</b><span class="tag ${st.cls}">${st.txt}</span></div>
        <div class="mut small">${esc(l.idea)}</div>
        <div class="row between small"><span class="lvl">${stars(l.level)}</span>${meter(l)}</div>
        <div class="row gap"><button class="btn" data-m="learn" data-l="${l.id}">Учить</button><button class="btn primary" data-m="repeat" data-l="${l.id}">Повторить</button></div>
      </div>`;
    }).join('')}</div>`;
  $('#back').onclick = () => ctx.go('openings', {});
  root.querySelectorAll('button[data-l]').forEach(b => {
    b.onclick = () => ctx.go('line', { rep: repId, line: b.dataset.l, mode: b.dataset.m });
  });
}

// ───── Прохождение линии ─────
export async function lineScreen(root, ctx, { rep: repId, line: lineId, mode }) {
  const db = await load();
  const rep = db.reps.find(r => r.id === repId), line = rep.lines.find(l => l.id === lineId);
  const mine = rep.side;                                     // 'w' | 'b'
  const learn = mode === 'learn';
  root.innerHTML = `<div class="sess">
    <div class="sess-head"><button class="back" id="back">‹</button><div class="sess-title">${esc(line.title)}</div><div class="sess-right"><span class="rt">${learn ? 'Учим' : 'Повторяем'}</span></div></div>
    <div class="boardwrap"><div class="board" id="board"></div></div>
    <div class="status" id="status"></div>
    <div class="panel" id="panel"></div>
    <div class="moves" id="moves"></div>
  </div>`;
  const board = new Board($('#board'));
  board.load(new Chess().fen(), mine === 'w' ? 'white' : 'black');
  let token = 0, i = 0, mistakes = 0, over = false, tries = 0, exp = null;   // exp — ожидаемый ход пользователя
  const log = [];

  const status = (t, k = '') => { const s = $('#status'); s.textContent = t; s.className = 'status ' + k; };
  const moveNo = n => (n % 2 === 0 ? `${n / 2 + 1}.` : `${(n + 1) / 2}…`);
  const renderLog = () => {
    $('#moves').innerHTML = log.map(x => `<div class="mv${x.mine ? ' mine' : ''}"><b>${x.no} ${esc(x.san)}</b>${x.note ? ` — ${esc(x.note)}` : ''}</div>`).join('');
    const m = $('#moves'); m.scrollTop = m.scrollHeight;
  };
  const expectedMove = () => {
    const t = new Chess(board.chess.fen());
    return t.move(line.moves[i].san);
  };

  async function step() {
    const myToken = token;
    while (i < line.moves.length && (i % 2 === 0 ? 'w' : 'b') !== mine) {
      await sleep(550);
      if (myToken !== token) return;
      const m = line.moves[i];
      const mv = board.play(m.san); sfx.move();
      log.push({ no: moveNo(i), san: mv.san, note: m.note, mine: false });
      i++; renderLog();
    }
    if (i >= line.moves.length) return finish();
    tries = 0;
    exp = expectedMove();
    board.clearShapes();
    if (learn) {
      board.arrow(exp.from, exp.to, 'green');
      status(`Ваш ход: ${line.moves[i].san}. ${line.moves[i].note || ''}`);
    } else status('Ваш ход — сыграйте по памяти.');
    $('#panel').innerHTML = learn ? '' : `<button class="btn" id="b-hint">💡 Подсказка</button>`;
    if (!learn) $('#b-hint').onclick = hint;
    board.unlock(onUser);
  }

  function hint() {
    const e = exp;
    mistakes++;
    board.clearShapes();
    board.circle(e.from, 'yellow');
    if (tries >= 1) board.arrow(e.from, e.to, 'green');
    tries++;
  }

  async function onUser(mv) {
    if (over) return false;
    const e = exp;
    const same = mv.from === e.from && mv.to === e.to && (mv.promotion || '') === (e.promotion || '');
    if (!same) {
      const m = line.moves[i];
      const trap = m.trap && Object.entries(m.trap).find(([san]) => san.replace(/[+#]/g, '') === mv.san.replace(/[+#]/g, ''));
      if (!learn) mistakes++;
      tries++;
      sfx.bad();
      board.clearShapes();
      if (trap) status(trap[1], 'bad');
      else status(learn ? 'Это не по теории. Следуйте зелёной стрелке.' : (tries >= 2 ? 'Не тот ход. Нажмите 💡 — покажу.' : 'Не тот ход — подумайте ещё.'), 'bad');
      if (learn) board.arrow(e.from, e.to, 'green');
      else if (tries >= 3) board.arrow(e.from, e.to, 'green');
      return false;
    }
    sfx.move();
    const m = line.moves[i];
    log.push({ no: moveNo(i), san: mv.san, note: m.note, mine: true });
    i++; renderLog();
    board.clearShapes();
    if (i >= line.moves.length) { finish(); return true; }
    status('Верно.', 'ok');
    token++;
    step();
    return true;
  }

  function finish() {
    over = true; board.lock(); board.clearShapes();
    const clean = mistakes === 0;
    const first = !S.lines[line.id];
    let xp;
    if (learn) { xp = first ? 15 : 5; grade(S.lines, line.id, true); }
    else { xp = clean ? 25 : 8; grade(S.lines, line.id, clean); }
    S.stats.lines++;
    if (!learn && clean) S.stats.linesClean++;
    addXP(xp, 'open');
    quest('open');
    sfx.win();
    const e = S.lines[line.id];
    status(learn ? 'Линия пройдена!' : clean ? 'Линия сыграна без ошибок!' : `Линия пройдена, ошибок/подсказок: ${mistakes}.`, clean || learn ? 'ok' : '');
    $('#panel').innerHTML = `<div class="res">
      <div class="small mut">Следующее повторение: через ${IV[e.b] || 0} ${IV[e.b] === 1 ? 'день' : 'дн.'} (уровень освоения ${e.b})</div>
      <div class="row gap"><button class="btn" id="b-again">Ещё раз</button><button class="btn primary" id="b-list">К списку</button></div></div>`;
    $('#b-again').onclick = () => ctx.go('line', { rep: repId, line: lineId, mode: 'repeat' });
    $('#b-list').onclick = () => ctx.go('openings', { rep: repId });
  }

  $('#back').onclick = () => ctx.go('openings', { rep: repId });
  step();
  return () => { token++; over = true; board.destroy(); };
}
