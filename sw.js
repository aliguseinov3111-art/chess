// Сгенерировано tools/build_app.py — не править вручную.
const CACHE = 'chess-fbdde1f6ae';
const FILES = ['./', 'data/endgames.json', 'data/openings.json', 'data/puzzles.json', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'index.html', 'js/board.js', 'js/endgames.js', 'js/engine.js', 'js/home.js', 'js/main.js', 'js/openings.js', 'js/profile.js', 'js/sound.js', 'js/store.js', 'js/tactics.js', 'js/themes.js', 'js/threats.js', 'js/ui.js', 'js/util.js', 'lib/chess.js', 'lib/chessground.base.css', 'lib/chessground.brown.css', 'lib/chessground.cburnett.css', 'lib/chessground.min.js', 'lib/sf/LICENSE-stockfish-GPLv3.txt', 'lib/sf/stockfish-19-lite-single.js', 'lib/sf/stockfish-19-lite-single.wasm', 'manifest.webmanifest', 'style.css'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
