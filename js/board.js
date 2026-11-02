// Обертка над chessground + chess.js: доска, ходы пользователя, ходы программы, превращение пешки.
import { Chess } from '../lib/chess.js';
import { Chessground } from '../lib/chessground.min.js';

const GLYPH = { w: { q: '♕', r: '♖', b: '♗', n: '♘' }, b: { q: '♛', r: '♜', b: '♝', n: '♞' } };
export const colorName = c => (c === 'w' ? 'white' : 'black');
const FILES = 'abcdefgh';

export class Board {
  constructor(el) {
    this.el = el;
    this.wrap = el.parentElement;
    this.chess = new Chess();
    this.hist = [];
    this.handler = null;
    this.cg = Chessground(el, {
      fen: this.chess.fen(),
      coordinates: true,
      animation: { enabled: true, duration: 220 },
      movable: { free: false, color: undefined, showDests: true, events: { after: (o, d) => this._after(o, d) } },
      draggable: { enabled: true, showGhost: true },
      premovable: { enabled: false },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: true, visible: true },
    });
  }

  load(fen, orientation = 'white') {
    this.chess.load(fen);
    this.hist = [];
    this.handler = null;
    this.cg.set({
      fen: this.chess.fen(), orientation,
      turnColor: colorName(this.chess.turn()), check: this.chess.inCheck(),
      lastMove: undefined, viewOnly: false,
      movable: { color: undefined, dests: new Map() },
    });
    this.clearShapes();
  }

  dests() {
    const m = new Map();
    for (const mv of this.chess.moves({ verbose: true })) {
      if (!m.has(mv.from)) m.set(mv.from, []);
      m.get(mv.from).push(mv.to);
    }
    return m;
  }

  sync() {
    const last = this.hist.length ? this.hist[this.hist.length - 1] : undefined;
    this.cg.set({
      fen: this.chess.fen(),
      turnColor: colorName(this.chess.turn()),
      check: this.chess.inCheck(),
      lastMove: last,
    });
  }

  unlock(handler) {
    if (handler) this.handler = handler;
    this.cg.set({
      turnColor: colorName(this.chess.turn()),
      movable: { color: colorName(this.chess.turn()), dests: this.dests() },
    });
  }

  lock() {
    this.cg.set({ movable: { color: undefined, dests: new Map() } });
  }

  async _after(orig, dest) {
    const h = this.handler;
    if (!h) return;
    this.lock();
    const piece = this.chess.get(orig);
    let promo;
    if (piece && piece.type === 'p' && (dest[1] === '8' || dest[1] === '1')) promo = await this.pickPromotion(piece.color);
    let mv;
    try {
      mv = this.chess.move({ from: orig, to: dest, promotion: promo });
    } catch (e) {
      this.sync(); this.unlock(); return;
    }
    this.hist.push([mv.from, mv.to]);
    this.sync();
    const ok = await h(mv);
    if (!ok) {
      this.chess.undo();
      this.hist.pop();
      this.sync();
      this.unlock();
    }
  }

  // Ход программы (по uci или san). Возвращает объект хода chess.js.
  play(m) {
    const mv = typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)
      ? this.chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })
      : this.chess.move(m);
    this.hist.push([mv.from, mv.to]);
    this.sync();
    return mv;
  }

  pickPromotion(color) {
    return new Promise(res => {
      const box = document.createElement('div');
      box.className = 'promo';
      for (const t of ['q', 'r', 'b', 'n']) {
        const b = document.createElement('button');
        b.textContent = GLYPH[color][t];
        b.onclick = () => { box.remove(); res(t); };
        box.appendChild(b);
      }
      this.wrap.appendChild(box);
    });
  }

  // Рисование
  arrow(from, to, brush = 'green') { this.shapes = [...(this.shapes || []), { orig: from, dest: to, brush }]; this.cg.setShapes(this.shapes); }
  circle(sq, brush = 'green') { this.shapes = [...(this.shapes || []), { orig: sq, brush }]; this.cg.setShapes(this.shapes); }
  clearShapes() { this.shapes = []; this.cg.setShapes([]); }
  setShapes(s) { this.shapes = s; this.cg.setShapes(s); }

  // Тап по полю (для режима «что под боем?»)
  onTap(cb) {
    this.cg.set({ viewOnly: true });
    this.el.onpointerdown = ev => {
      const r = this.el.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      if (x < 0 || x >= 1 || y < 0 || y >= 1) return;
      let f = Math.floor(x * 8), rk = 7 - Math.floor(y * 8);
      if (this.cg.state.orientation === 'black') { f = 7 - f; rk = 7 - rk; }
      cb(FILES[f] + (rk + 1));
    };
  }

  destroy() { try { this.cg.destroy(); } catch (e) { /* уже уничтожена */ } }
}
