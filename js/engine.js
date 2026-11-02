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

// Анализ позиции: до `multipv` лучших линий. Оценка — с точки зрения стороны, чей ход (cp или mate).
// Возвращает [{uci, pv:[uci…], cp|null, mate|null, depth}] по убыванию качества; пусто, если ходов нет.
export function analyze(fen, { depth = 12, multipv = 1, movetime = 0 } = {}) {
  const run = async () => {
    await initEngine();
    return new Promise(res => {
      const lines = new Map();
      const on = e => {
        const l = typeof e.data === 'string' ? e.data : '';
        if (l.startsWith('info') && l.includes(' pv ') && !/ (lowerbound|upperbound)/.test(l)) {
          const sc = / score (cp|mate) (-?\d+)/.exec(l);
          if (!sc) return;
          const k = +((/ multipv (\d+)/.exec(l) || [0, 1])[1]);
          const pv = l.split(' pv ')[1].trim().split(/\s+/);
          lines.set(k, {
            uci: pv[0], pv, depth: +((/ depth (\d+)/.exec(l) || [0, 0])[1]),
            cp: sc[1] === 'cp' ? +sc[2] : null, mate: sc[1] === 'mate' ? +sc[2] : null,
          });
        }
        if (l.startsWith('bestmove')) {
          w.removeEventListener('message', on);
          w.postMessage('setoption name MultiPV value 1');
          res([...lines.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]));
        }
      };
      w.addEventListener('message', on);
      w.postMessage('setoption name MultiPV value ' + multipv);
      w.postMessage('position fen ' + fen);
      w.postMessage(`go depth ${depth}` + (movetime ? ` movetime ${movetime}` : ''));
    });
  };
  busy = busy.then(run, run);
  return busy;
}
