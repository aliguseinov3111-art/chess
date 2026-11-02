import { S } from './store.js';

let ctx;
export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* без звука */ }
}

function tone(f, t0, dur, type = 'sine', vol = 0.12) {
  if (!ctx || !S.set.sound) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  const t = ctx.currentTime + t0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  move() { tone(330, 0, 0.05, 'triangle', 0.1); },
  good() { tone(523, 0, 0.1); tone(659, 0.09, 0.14); },
  bad() { tone(160, 0, 0.18, 'sawtooth', 0.07); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.16)); },
  level() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.22, 'triangle', 0.14)); },
};
