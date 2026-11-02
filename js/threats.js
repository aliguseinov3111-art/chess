// «Что под боем?» — тренажер внимания против главной ошибки новичков: пропуск угроз и висящих фигур.
import { Chess } from '../lib/chess.js';
import { Board } from './board.js';
import { S, addXP, quest } from './store.js';
import { $, esc, sleep, rnd, NAME, VAL } from './util.js';
import { loadDB } from './tactics.js';
import { sfx } from './sound.js';

// Фигуры стороны victim, которым что-то угрожает: под боем и (не защищены или бьёт более слабая фигура)
function hanging(ch, victim) {
  const enemy = victim === 'w' ? 'b' : 'w', out = [];
  for (const row of ch.board()) {
    for (const c of row) {
      if (!c || c.color !== victim || c.type === 'k') continue;
      const atk = ch.attackers(c.square, enemy);
      if (!atk.length) continue;
      const def = ch.attackers(c.square, victim);
      const minA = atk.map(s => ch.get(s)).sort((a, b) => VAL[a.type] - VAL[b.type])[0];
      const from = atk.find(s => ch.get(s).type === minA.type);
      const by = `${NAME[minA.type].toLowerCase()} ${from}`;
      if (!def.length) out.push({ sq: c.square, type: c.type, why: `${NAME[c.type]} ${c.square}: бьёт ${by}, защитников нет` });
      else if (VAL[minA.type] < VAL[c.type]) out.push({ sq: c.square, type: c.type, why: `${NAME[c.type]} ${c.square}: бьёт более слабая фигура (${by})` });
    }
  }
  return out;
}

async function makeQuestion() {
  const db = await loadDB();
  for (let k = 0; k < 200; k++) {
    const p = db.p[rnd(db.p.length)];
    if (p.r > S.rating + 300) continue;
    const ch = new Chess(p.fen);
    const m = p.mv[0];
    ch.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    if (ch.inCheck() || ch.isGameOver()) continue;
    const me = ch.turn(), enemy = me === 'w' ? 'b' : 'w';
    const mine = rnd(2) === 0;                       // true: «ваши фигуры под угрозой», false: «что можно выиграть у соперника»
    const list = hanging(ch, mine ? me : enemy);
    const wantEmpty = rnd(5) === 0;
    if (wantEmpty ? list.length !== 0 : (list.length < 1 || list.length > 3)) continue;
    return { fen: ch.fen(), me, mine, list, orient: me === 'w' ? 'white' : 'black' };
  }
  return null;
}

export async function threatsScreen(root, ctx) {
  root.innerHTML = `<div class="sess">
    <div class="sess-head"><button class="back" id="back">‹</button><div class="sess-title">Что под боем?</div><div class="sess-right" id="sr"></div></div>
    <div class="q" id="q"></div>
    <div class="boardwrap"><div class="board" id="board"></div></div>
    <div class="status" id="status"></div>
    <div class="panel" id="panel"></div>
  </div>`;
  const board = new Board($('#board'));
  let token = 0, Q = null, sel = new Set(), done = false;

  const draw = (extra = []) => {
    board.setShapes([...[...sel].map(s => ({ orig: s, brush: 'blue' })), ...extra]);
  };
  board.onTap(sq => {
    if (done) return;
    const p = board.chess.get(sq);
    if (!p) return;
    if (sel.has(sq)) sel.delete(sq); else sel.add(sq);
    sfx.move();
    draw();
  });
  $('#sr').innerHTML = `<span class="rt">👁 ${S.thr.ok}/${S.thr.n}</span>`;

  async function next() {
    const myToken = ++token;
    done = false; sel = new Set();
    $('#panel').innerHTML = '<div class="mut center">Готовлю позицию…</div>';
    Q = await makeQuestion();
    if (myToken !== token) return;
    if (!Q) { $('#panel').innerHTML = '<div class="mut center">Не удалось подобрать позицию</div>'; return; }
    board.load(Q.fen, Q.orient);
    board.cg.set({ viewOnly: true });
    $('#q').innerHTML = Q.mine
      ? `Вы играете <b>${Q.me === 'w' ? 'белыми' : 'чёрными'}</b>. Отметьте <b>ваши</b> фигуры, которым угрожает опасность.`
      : `Вы играете <b>${Q.me === 'w' ? 'белыми' : 'чёрными'}</b>. Отметьте фигуры <b>соперника</b>, которые можно выиграть.`;
    $('#status').textContent = 'Нажимайте на фигуры. Если опасности нет — выберите «Всё безопасно».';
    $('#status').className = 'status';
    $('#panel').innerHTML = `<div class="row gap"><button class="btn primary" id="b-ok">Проверить</button><button class="btn" id="b-none">Всё безопасно</button></div>
      <p class="mut small">Угроза: фигура под боем и не защищена, либо её бьёт более слабая фигура.</p>`;
    $('#b-ok').onclick = () => check();
    $('#b-none').onclick = () => { sel = new Set(); check(); };
  }

  function check() {
    if (done) return;
    done = true;
    const right = new Set(Q.list.map(x => x.sq));
    const hit = [...sel].filter(s => right.has(s));
    const wrong = [...sel].filter(s => !right.has(s));
    const miss = [...right].filter(s => !sel.has(s));
    const perfect = !wrong.length && !miss.length;
    S.thr.n++;
    if (perfect) { S.thr.ok++; sfx.good(); addXP(5, 'thr'); } else sfx.bad();
    quest('thr');
    $('#sr').innerHTML = `<span class="rt">👁 ${S.thr.ok}/${S.thr.n}</span>`;
    draw([...hit.map(s => ({ orig: s, brush: 'green' })), ...wrong.map(s => ({ orig: s, brush: 'red' })), ...miss.map(s => ({ orig: s, brush: 'yellow' }))]);
    const expl = Q.list.length ? Q.list.map(x => `<li>${esc(x.why)}</li>`).join('') : '<li>Здесь ничего не висит — всё защищено или не атаковано.</li>';
    $('#status').textContent = perfect ? 'Верно! +5 XP' : 'Не совсем. Зелёное — верно, красное — лишнее, жёлтое — пропущено.';
    $('#status').className = 'status ' + (perfect ? 'ok' : 'bad');
    $('#panel').innerHTML = `<div class="res"><ul class="expl">${expl}</ul><button class="btn primary wide" id="b-next">Дальше ▶</button></div>`;
    $('#b-next').onclick = next;
  }

  $('#back').onclick = () => ctx.go('tactics');
  next();
  return () => { token++; board.destroy(); };
}
