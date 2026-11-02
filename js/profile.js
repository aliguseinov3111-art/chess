import { S, ACH, levelInfo, save, exportJson, replaceAll } from './store.js';
import { $, esc, spark } from './util.js';
import { thName } from './themes.js';
import { toast } from './ui.js';
import { unlock } from './sound.js';

export const VERSION = '1.1';

export async function profileScreen(root, ctx) {
  const li = levelInfo(), st = S.stats;
  const pct = st.puz ? Math.round(st.clean / st.puz * 100) : 0;
  const themes = Object.entries(S.th).filter(([, v]) => v.n >= 3).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
  root.innerHTML = `<div class="pad">
    <h1>Профиль</h1>
    <div class="hero card"><div class="rank">${li.rank.i}</div><div class="grow">
      <div class="rank-n">Уровень ${li.L} · ${li.rank.n}</div>
      <div class="bar"><i style="width:${Math.round(li.pct * 100)}%"></i></div>
      <div class="mut small">Всего ${S.xp} XP</div></div></div>
    <div class="card row between"><div><div class="mut">Рейтинг тактики</div><div class="big2">${S.rating}</div></div><div class="spark">${spark(S.rhist, 140, 40)}</div></div>
    <div class="grid2">
      <div class="stat"><b>${st.puz}</b><span>задач решено</span></div>
      <div class="stat"><b>${pct}%</b><span>без ошибок</span></div>
      <div class="stat"><b>${st.bestCombo}</b><span>лучшая серия задач</span></div>
      <div class="stat"><b>${S.best}</b><span>лучшая серия дней</span></div>
      <div class="stat"><b>${st.lines}</b><span>дебютных линий</span></div>
      <div class="stat"><b>${st.end}</b><span>эндшпилей решено</span></div>
      <div class="stat"><b>${S.thr.ok}/${S.thr.n}</b><span>что под боем?</span></div>
      <div class="stat"><b>${st.games}</b><span>партий с тренером</span></div>
      <div class="stat"><b>${st.wins}</b><span>побед над тренером</span></div>
      <div class="stat"><b>${Object.values(S.lines).filter(e => e.b >= 3).length}</b><span>линий выучено</span></div>
    </div>
    ${themes.length ? `<h3>Слабые темы</h3><div class="card">${themes.slice(0, 5).map(([k, v]) => {
      const p = Math.round(v.ok / v.n * 100);
      return `<div class="throw"><span>${esc(thName(k))}</span><span class="bar sm"><i style="width:${p}%"></i></span><span class="small">${p}%</span></div>`;
    }).join('')}</div>` : ''}
    <h3>Достижения <span class="mut small">${Object.keys(S.ach).length}/${ACH.length}</span></h3>
    <div class="ach">${ACH.map(a => `<div class="a${S.ach[a.id] ? ' on' : ''}" title="${esc(a.desc)}"><div class="ai">${a.icon}</div><div class="an">${esc(a.name)}</div><div class="ad">${esc(a.desc)}</div></div>`).join('')}</div>
    <h3>Настройки</h3>
    <label class="card row between"><span>Звук</span><input type="checkbox" id="snd" ${S.set.sound ? 'checked' : ''}></label>
    <h3>Резервная копия</h3>
    <div class="card">
      <p class="small mut">Прогресс хранится только на этом телефоне. Время от времени копируйте его в заметки.</p>
      <div class="row gap"><button class="btn" id="exp">Скопировать</button><button class="btn" id="imp">Восстановить</button></div>
      <textarea id="bk" rows="3" placeholder="Сюда вставьте копию для восстановления"></textarea>
    </div>
    <div class="card"><button class="btn danger wide" id="reset">Сбросить весь прогресс</button></div>
    <p class="mut small center">Шахматный тренер v${VERSION} · база задач Lichess (CC0), движок Stockfish (GPLv3)</p>
  </div>`;
  $('#snd').onchange = e => { S.set.sound = e.target.checked; save(); unlock(); };
  $('#exp').onclick = async () => {
    const t = exportJson();
    $('#bk').value = t;
    try { await navigator.clipboard.writeText(t); toast('Скопировано в буфер', 'ok'); } catch (e) { $('#bk').select(); toast('Выделите текст и скопируйте вручную'); }
  };
  $('#imp').onclick = () => {
    try {
      const o = JSON.parse($('#bk').value);
      if (typeof o.xp !== 'number') throw new Error('bad');
      replaceAll(o); toast('Восстановлено', 'ok'); ctx.go('profile');
    } catch (e) { toast('Не удалось прочитать копию', 'bad'); }
  };
  $('#reset').onclick = () => {
    if (confirm('Удалить весь прогресс? Это нельзя отменить.')) { replaceAll({}); ctx.go('home'); }
  };
}
