// Stockfish (WASM, один поток) в Web Worker. Работает полностью офлайн.
let w = null, ready = null, busy = Promise.resolve();

export function initEngine() {
  if (ready) return ready;
  w = new Worker(new URL('../lib/sf/stockfish-19-lite-single.js', import.meta.url));
  ready = new Promise((res, rej) => {
    const on = e => {
      const l = typeof e.data === 'string' ? e.data : '';
      if (l === 'uciok') w.postMessage('isready');
      if (l === 'readyok') { w.removeEventListener('message', on); res(); }
    };
    w.addEventListener('message', on);
    w.onerror = err => rej(err);
    w.postMessage('uci');
  });
  return ready;
}

// Лучший ход по FEN. Возвращает uci-строку или null (нет ходов).
export function bestMove(fen, { depth = 10, movetime = 0 } = {}) {
  const run = async () => {
    await initEngine();
    return new Promise(res => {
      const on = e => {
        const l = typeof e.data === 'string' ? e.data : '';
        if (l.startsWith('bestmove')) {
          w.removeEventListener('message', on);
          const m = l.split(' ')[1];
          res(!m || m === '(none)' ? null : m);
        }
      };
      w.addEventListener('message', on);
      w.postMessage('position fen ' + fen);
      w.postMessage(movetime ? `go movetime ${movetime}` : `go depth ${depth}`);
    });
  };
  busy = busy.then(run, run);
  return busy;
}
