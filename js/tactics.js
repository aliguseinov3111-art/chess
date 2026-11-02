// Тактика: база задач, подбор по рейтингу + повторение ошибок, экран темы и сессия решения.
import { Chess } from '../lib/chess.js';
import { Board } from './board.js';
import { S, grade, rate, addXP, quest, dueCount } from './store.js';
import { $, esc, sleep, rnd, dayNum, dataUrl, spark } from './util.js';
import { sfx } from './sound.js';
import { thName, thDesc } from './themes.js';

let DB = null;
export async function loadDB() {
  if (DB) return DB;
  const j = await (await fetch(dataUrl('puzzles.json'))).json();
  const p = j.p.map(a => ({ id: a[0], fen: a[1], mv: a[2].split(' '), r: a[3], th: a[4] }));
  DB = { themes: j.themes, p, byId: new Map(p.map(x => [x.id, x])) };
  return DB;
}

const lowerBound = r => {
  let a = 0, b = DB.p.length;
  while (a < b) { const m = (a + b) >> 1; if (DB.p[m].r < r) a = m + 1; else b = m; }
  return a;
};

function choose(theme, seen) {
  const t = dayNum();
  const ti = theme ? DB.themes.indexOf(theme) : -1;
  const ok = p => !seen.has(p.id) && (ti < 0 || p.th.includes(ti));
  let best = null;
  for (const id in S.puz) {
    const e = S.puz[id];
    if (e.d <= t) {
      const p = DB.byId.get(id);
      if (p && ok(p) && (!best || e.d < best.e.d)) best = { p, e };
    }
  }
  if (best) return { p: best.p, isNew: false };
  for (let w = 0; w < 6; w++) {
    const a = lowerBound(S.rating - 150 - w * 150), b = lowerBound(S.rating + 200 + w * 200);
    for (let k = 0; k < 120 && b > a; k++) {
      const p = DB.p[a + rnd(b - a)];
      if (ok(p) && !S.puz[p.id]) return { p, isNew: true };
    }
  }
  for (let k = 0; k < 500; k++) {
    const p = DB.p[rnd(DB.p.length)];
    if (ok(p)) return { p, isNew: !S.puz[p.id] };
  }
  return { p: DB.p[rnd(DB.p.length)], isNew: false };
}

export function themeStats() {
  return DB.themes.map(name => ({ name, st: S.th[name] || { n: 0, ok: 0 } }));
}

const uci = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

// ───── Экран «Тактика» ─────
export async function tacticsScreen(root, ctx) {
  await loadDB();
  const due = dueCount(S.puz);
  const chips = themeStats()
    .sort((a, b) => b.st.n - a.st.n || a.name.localeCompare(b.name))
    .map(({ name, st }) => `<button class="chip" data-th="${name}">${esc(thName(name))}${st.n ? ` <i>${Math.round(st.ok / st.n * 100)}%</i>` : ''}</button>`)
    .join('');
  root.innerHTML = `<div class="pad">
    <h1>Тактика</h1>
    <div class="card row between">
      <div><div class="mut">Рейтинг тактики</div><div class="big2">${S.rating}</div></div>
      <div class="spark">${spark(S.rhist)}</div>
    </div>
    <button class="btn primary wide" id="go-rec">▶ Решать задачи${due ? ` · на повтор: ${due}` : ''}</button>
    <button class="btn wide" id="go-thr">👁 Что под боем? Тренажёр внимания</button>
    <h3>Тренировка по теме</h3>
    <div class="chips">${chips}</div>
    <p class="mut small">Задачи подбираются по вашему рейтингу; ошибки возвращаются через 1, 2, 4… дней.</p>
  </div>`;
  $('#go-rec').onclick = () => ctx.go('puzzles', {});
  $('#go-thr').onclick = () => ctx.go('threats');
  root.querySelectorAll('.chip').forEach(b => { b.onclick = () => ctx.go('puzzles', { theme: b.dataset.th }); });
}

// ───── Сессия решения задач ─────
export async function puzzleSession(root, ctx, { theme = null } = {}) {
  await loadDB();
  root.innerHTML = `<div class="sess">
    <div class="sess-head"><button class="back" id="back">‹</button><div class="sess-title">${theme ? esc(thName(theme)) : 'Тактика'}</div><div class="sess-right" id="sr"></div></div>
    <div class="boardwrap"><div class="board" id="board"></div></div>
    <div class="status" id="status"></div>
    <div class="panel" id="panel"></div>
  </div>`;
  const board = new Board($('#board'));
  const seen = new Set();
  let token = 0, cur = null, isNew = false, idx = 0, mistakes = 0, hints = 0, hintLvl = 0, over = true;
  window.__dbg = { puz: () => ({ cur, idx, over }) };   // для автотеста tools/test_app.py

  const status = (txt, kind = '') => { const s = $('#status'); s.textContent = txt; s.className = 'status ' + kind; };
  const head = () => {
    const c = S.stats.combo;
    $('#sr').innerHTML = `${c >= 2 ? `<span class="combo">🔥${c}</span>` : ''}<span class="rt">★ ${S.rating}</span>`;
  };
  const panel = html => { $('#panel').innerHTML = html; };
  const controls = () => {
    panel(`<div class="row gap"><button class="btn" id="b-hint">💡 Подсказка</button><button class="btn" id="b-sol">Показать решение</button></div>`);
    $('#b-hint').onclick = hint;
    $('#b-sol').onclick = showSolution;
  };

  async function next() {
    const sel = choose(theme, seen);
    cur = sel.p; isNew = sel.isNew; seen.add(cur.id);
    const myToken = ++token;
    idx = 0; mistakes = 0; hints = 0; hintLvl = 0; over = false;
    const ch = new Chess(cur.fen);
    ch.move(uci(cur.mv[0]));
    const color = ch.turn();
    board.load(cur.fen, color === 'w' ? 'white' : 'black');
    head();
    status('Соперник делает ход…');
    panel('');
    await sleep(500);
    if (myToken !== token) return;
    board.play(cur.mv[0]); idx = 1; sfx.move();
    status(`Ваш ход — ${color === 'w' ? 'белые' : 'чёрные'}. Найдите лучший ход.`);
    controls();
    board.unlock(onUser);
  }

  async function onUser(mv) {
    if (over) return false;
    const myToken = token;
    board.clearShapes();
    const exp = cur.mv[idx];
    const u = mv.from + mv.to + (mv.promotion || '');
    if (u !== exp && !board.chess.isCheckmate()) {
      mistakes++; S.stats.combo = 0; head(); sfx.bad();
      status(mistakes >= 2 ? 'Не то. Нужна подсказка? Нажмите 💡' : 'Не то — попробуйте другой ход', 'bad');
      return false;
    }
    sfx.move(); idx++;
    if (board.chess.isCheckmate() || idx >= cur.mv.length) { finish(true); return true; }
    board.lock();
    status('Верно! Соперник отвечает…', 'ok');
    await sleep(450);
    if (myToken !== token) return true;
    board.play(cur.mv[idx]); idx++; sfx.move();
    if (idx >= cur.mv.length) { finish(true); return true; }
    status('Верно! Продолжайте.', 'ok');
    board.unlock();
    return true;
  }

  function hint() {
    if (over) return;
    hints++;
    const e = cur.mv[idx];
    board.clearShapes();
    if (hintLvl === 0) board.circle(e.slice(0, 2), 'yellow');
    else board.arrow(e.slice(0, 2), e.slice(2, 4), 'green');
    hintLvl++;
    status(hintLvl === 1 ? 'Подсказка: этой фигурой нужно ходить' : 'Подсказка: вот ход', '');
  }

  async function showSolution() {
    if (over) return;
    over = true; board.lock(); board.clearShapes();
    const myToken = token;
    status('Решение:');
    for (let i = idx; i < cur.mv.length; i++) {
      await sleep(700);
      if (myToken !== token) return;
      board.play(cur.mv[i]); sfx.move();
    }
    finish(false, true);
  }

  function finish(solved, gaveUp = false) {
    over = true; board.lock();
    const clean = solved && !gaveUp && mistakes === 0 && hints === 0;
    const first = isNew;
    grade(S.puz, cur.id, clean);
    const dr = first ? rate(cur.r, clean ? 1 : 0) : 0;
    for (const t of cur.th) {
      const nm = DB.themes[t];
      const e = S.th[nm] || (S.th[nm] = { n: 0, ok: 0 });
      e.n++; if (clean) e.ok++;
    }
    let xp = 0;
    if (solved && !gaveUp) {
      S.stats.puz++;
      if (clean) {
        S.stats.clean++; S.stats.combo++;
        if (S.stats.combo > S.stats.bestCombo) S.stats.bestCombo = S.stats.combo;
        xp = 10 + Math.min(S.stats.combo - 1, 5) * 2;
      } else { S.stats.combo = 0; xp = 3; }
    } else S.stats.combo = 0;
    if (xp) addXP(xp, 'puz');
    if (solved && !gaveUp) quest('puz');
    head();
    if (clean) { sfx.good(); status('Отлично! Задача решена без ошибок.', 'ok'); }
    else if (solved) { sfx.good(); status('Решено, но с ошибками/подсказками. Эта задача вернётся на повтор.', ''); }
    else status('Эта задача вернётся на повтор — разберитесь, почему именно этот ход.', 'bad');
    const tags = cur.th.map(t => DB.themes[t]);
    const info = tags.slice(0, 2).map(t => `<div class="theme-note"><b>${esc(thName(t))}.</b> ${esc(thDesc(t))}</div>`).join('');
    panel(`<div class="res">
      <div class="row between"><span>Рейтинг задачи: <b>${cur.r}</b></span>${first ? `<span class="${dr >= 0 ? 'up' : 'down'}">${dr >= 0 ? '+' : ''}${dr}</span>` : '<span class="mut">повтор</span>'}</div>
      ${info}
      <button class="btn primary wide" id="b-next">Следующая ▶</button>
    </div>`);
    $('#b-next').onclick = next;
  }

  $('#back').onclick = () => ctx.go('tactics');
  next();
  return () => { token++; board.destroy(); };
}
