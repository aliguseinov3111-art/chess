import { $, $$, esc } from './util.js';
import { bindEvents, toast } from './ui.js';
import { unlock } from './sound.js';
import { checkAch } from './store.js';
import { homeScreen } from './home.js';
import { tacticsScreen, puzzleSession } from './tactics.js';
import { threatsScreen } from './threats.js';
import { openingsScreen, lineScreen } from './openings.js';
import { endgamesScreen, endgameSession } from './endgames.js';
import { profileScreen } from './profile.js';
import { coachScreen, gameScreen } from './game.js';

const routes = {
  home: homeScreen, tactics: tacticsScreen, puzzles: puzzleSession, threats: threatsScreen,
  openings: openingsScreen, line: lineScreen, endgames: endgamesScreen, endgame: endgameSession, coach: coachScreen, game: gameScreen, profile: profileScreen,
};
const tabOf = {
  home: 'home', tactics: 'tactics', puzzles: 'tactics', threats: 'tactics', openings: 'openings', line: 'openings',
  endgames: 'endgames', endgame: 'endgames', coach: 'coach', game: 'coach', profile: 'profile',
};
const SESSION = new Set(['puzzles', 'threats', 'line', 'endgame', 'game']);

let cleanup = null, navId = 0;

export async function go(name, params = {}) {
  const my = ++navId;
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  const root = $('#screen');
  root.scrollTop = 0;
  root.innerHTML = '<div class="pad mut center">Загрузка…</div>';
  document.body.classList.toggle('in-session', SESSION.has(name));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tabOf[name]));
  try {
    const r = await routes[name](root, { go }, params);
    if (my !== navId) { if (typeof r === 'function') r(); return; }
    if (typeof r === 'function') cleanup = r;
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="pad"><h2>Что-то пошло не так</h2><p class="mut small">${esc(e && e.message || e)}</p><button class="btn" id="e-home">На главную</button></div>`;
    $('#e-home').onclick = () => go('home');
  }
}

bindEvents();
$$('#tabs button').forEach(b => { b.onclick = () => go(b.dataset.tab); });
window.addEventListener('pointerdown', unlock, { once: true });
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Вышло обновление — перезапустите приложение');
      });
    });
  }).catch(() => {});
}

checkAch();
go('home');
