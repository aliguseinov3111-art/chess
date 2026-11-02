import { $, esc } from './util.js';
import { onEvent } from './store.js';
import { sfx } from './sound.js';

export function toast(html, kind = '') {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = html;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2400);
}

const modalQueue = [];
let modalOpen = false;
export function modal(html, { btn = 'Отлично', sound = 'level' } = {}) {
  modalQueue.push({ html, btn, sound });
  if (!modalOpen) nextModal();
}
function nextModal() {
  const m = modalQueue.shift();
  if (!m) { modalOpen = false; $('#modal').innerHTML = ''; return; }
  modalOpen = true;
  if (m.sound && sfx[m.sound]) sfx[m.sound]();
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal-card">${m.html}<button class="btn primary" id="modal-ok">${esc(m.btn)}</button></div></div>`;
  $('#modal-ok').onclick = nextModal;
}

export function bindEvents() {
  onEvent(e => {
    if (e.t === 'xp' && e.why !== 'ach') toast(`+${e.n} XP`, 'xp');
    if (e.t === 'level') {
      modal(`<div class="big">${e.info.rank.i}</div><h2>Уровень ${e.L}!</h2><p>Звание: <b>${e.info.rank.n}</b></p>`);
    }
    if (e.t === 'quest') toast(`✅ Задание выполнено: ${esc(e.q.text)} (+${e.q.xp})`, 'ok');
    if (e.t === 'allQuests') modal('<div class="big">🎉</div><h2>Все задания дня!</h2><p>Бонус +50 XP</p>', { sound: 'win' });
    if (e.t === 'streak') toast(`🔥 Серия: ${e.n}`, 'ok');
    if (e.t === 'freeze') toast('🧊 Заморозка спасла серию', 'ok');
    if (e.t === 'freezeGain') toast('🧊 Получена заморозка серии', 'ok');
    if (e.t === 'ach') modal(`<div class="big">${e.a.icon}</div><h2>${esc(e.a.name)}</h2><p>${esc(e.a.desc)}</p><p class="mut">+${e.a.xp} XP</p>`, { sound: 'win' });
  });
}
