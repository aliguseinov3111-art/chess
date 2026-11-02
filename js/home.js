import { S, QUESTS, today, levelInfo, effectiveStreak, dueCount, questsDone } from './store.js';
import { $, esc, plural } from './util.js';
import { nextLine, dueLines } from './openings.js';
import { nextEndgame } from './endgames.js';

async function startQuest(id, ctx) {
  if (id === 'puz') return ctx.go('puzzles', {});
  if (id === 'thr') return ctx.go('threats');
  if (id === 'open') {
    const n = await nextLine();
    return ctx.go('line', { rep: n.rep.id, line: n.line.id, mode: n.mode });
  }
  if (id === 'end') {
    const e = await nextEndgame();
    return ctx.go('endgame', { id: e.id });
  }
}

export async function homeScreen(root, ctx) {
  const li = levelInfo(), d = today(), st = effectiveStreak();
  const lines = await dueLines();
  const due = dueCount(S.puz), dueEnd = dueCount(S.end);
  const next = QUESTS.find(q => d.q[q.id] < q.n);
  const done = questsDone();
  root.innerHTML = `<div class="pad">
    <div class="hero card">
      <div class="rank">${li.rank.i}</div>
      <div class="grow">
        <div class="rank-n">Уровень ${li.L} · ${li.rank.n}</div>
        <div class="bar"><i style="width:${Math.round(li.pct * 100)}%"></i></div>
        <div class="mut small">${li.cur} / ${li.need} XP до уровня ${li.L + 1}${li.next ? ` · «${li.next.n}» с ${li.next.l}-го` : ''}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><b>🔥 ${st}</b><span>${plural(st, 'день', 'дня', 'дней')} подряд</span></div>
      <div class="stat"><b>🧊 ${S.freeze}</b><span>заморозки</span></div>
      <div class="stat"><b>★ ${S.rating}</b><span>тактика</span></div>
      <div class="stat"><b>⚡ ${d.xp}</b><span>XP сегодня</span></div>
    </div>
    <h3>Задания на сегодня <span class="mut small">${done}/${QUESTS.length}</span></h3>
    <div class="quests">${QUESTS.map(q => {
      const c = Math.min(d.q[q.id], q.n), ok = c >= q.n;
      return `<button class="quest${ok ? ' ok' : ''}" data-q="${q.id}">
        <span class="qi">${ok ? '✅' : q.icon}</span>
        <span class="grow"><span class="qt">${esc(q.text)}</span><span class="bar sm"><i style="width:${c / q.n * 100}%"></i></span></span>
        <span class="qx">${c}/${q.n}<br><small>+${q.xp} XP</small></span></button>`;
    }).join('')}</div>
    <button class="btn primary wide big" id="go">${next ? '▶ Продолжить тренировку' : '🎉 Всё выполнено · ещё задачи'}</button>
    <button class="btn wide" id="go-coach">🎓 Сыграть партию с тренером</button>
    ${(due || lines || dueEnd) ? `<div class="card small">На повторение: ${[due ? `задач — ${due}` : '', lines ? `дебютных линий — ${lines}` : '', dueEnd ? `эндшпилей — ${dueEnd}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
    <p class="mut small center">Серия дней засчитывается, если выполнено 2 задания из 4. За 7 дней серии дарим «заморозку» — она спасает серию при пропуске.</p>
  </div>`;
  root.querySelectorAll('.quest').forEach(b => { b.onclick = () => startQuest(b.dataset.q, ctx); });
  $('#go-coach').onclick = () => ctx.go('coach');
  $('#go').onclick = () => (next ? startQuest(next.id, ctx) : ctx.go('puzzles', {}));
}
