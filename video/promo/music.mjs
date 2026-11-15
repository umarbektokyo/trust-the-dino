// An original minimal synth score, 100 BPM, rendered in code to music.wav (44.1 kHz, 16-bit stereo).
//   node video/promo/music.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100, BEAT = 0.6, DUR = 70.2;
const N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function add(t0, len, fn, pan = 0, gain = 1) {
  const a = Math.floor(t0 * SR), n = Math.floor(len * SR);
  const gl = Math.cos((pan + 1) * Math.PI / 4) * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = 0; i < n && a + i < N; i++) { const v = fn(i / SR); L[a + i] += v * gl; R[a + i] += v * gr; }
}
// soft pluck: two detuned triangles-ish with fast decay
const pluck = (f, dec = 6) => (t) => {
  const e = Math.min(1, t * 400) * Math.exp(-t * dec);
  return e * (Math.sin(2 * Math.PI * f * t) * 0.7 + Math.sin(2 * Math.PI * f * 2.003 * t) * 0.18 * Math.exp(-t * 10));
};
// pad: several detuned sines, slow attack/release
const pad = (fs, len) => (t) => {
  const e = Math.min(1, t / 0.8) * Math.min(1, (len - t) / 0.9);
  let v = 0; for (const f of fs) v += Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.004 * t + 1) * 0.6;
  return e * v / fs.length;
};
const kick = (t) => Math.exp(-t * 9) * Math.sin(2 * Math.PI * (48 + 90 * Math.exp(-t * 30)) * t);
const tick = (t) => (rnd() * 2 - 1) * Math.exp(-t * 70);
const sub = (f, len) => (t) => Math.min(1, t / 0.02) * Math.min(1, (len - t) / 0.1) * Math.sin(2 * Math.PI * f * t);

// progression, two bars (8 beats) each: Fmaj9, Am7, Dm9, Bbmaj7(#11)
const CH = [[53, 57, 60, 64, 67], [57, 60, 64, 67, 71], [50, 57, 60, 64, 65], [46, 53, 57, 62, 64]];
const BASS = [41, 45, 38, 46];
const bar8 = BEAT * 8;
const chordAt = (t) => CH[Math.floor(t / bar8) % 4];

// pads from 3 s, thinned out in the collapse at 15 s
for (let t = 0; t < DUR; t += bar8) {
  const c = chordAt(t), len = Math.min(bar8 + 0.6, DUR - t);
  add(t, len, pad(c.map(hz), len), 0, t < 3 ? 0.035 : 0.06);
}
// plucked arpeggio on eighths; density rises through the "eras" section
const ARP = [0, 2, 4, 3, 1, 4, 2, 3];
for (let i = 0, t = 3.0; t < 68; i++, t += BEAT / 2) {
  if (t >= 14.4 && t < 15.6) continue;                       // the breath before "3 lines"
  if (t < 9 && i % 2) continue;                               // quarters first, eighths after
  const c = chordAt(t); const m = c[ARP[i % 8]] + 12;
  add(t, 1.2, pluck(hz(m), t > 49 && t < 57 ? 3.5 : 6), (i % 2 ? 0.35 : -0.35), 0.16);
}
// sixteenth ticks racing in the eras section
for (let t = 6; t < 14.4; t += BEAT / 4) add(t, 0.08, tick, 0.2, 0.03 + 0.04 * (t - 6) / 8.4);
// kick + bass from the dino's entrance
for (let t = 15.6; t < 66; t += BEAT) {
  const b = Math.round((t - 15.6) / BEAT);
  if (t > 49.2 && t < 57 && b % 2) continue;                 // night: half-time
  add(t, 0.5, kick, 0, 0.32);
  if (b % 2 === 0) add(t, BEAT * 1.9, sub(hz(BASS[Math.floor(t / bar8) % 4]), BEAT * 1.9), 0, 0.12);
  add(t + BEAT / 2, 0.06, tick, -0.25, 0.035);
}
// accents on scene cuts
for (const t of [3, 15.6, 19.2, 24, 31.2, 41.4, 49.2, 57, 63]) add(t, 2.5, pluck(hz(chordAt(t)[4] + 24), 2.2), 0, 0.1);

// simple stereo delay, then fade out and normalise
const D = Math.floor(SR * BEAT * 0.75);
for (let i = D; i < N; i++) { L[i] += R[i - D] * 0.22; R[i] += L[i - D] * 0.22; }
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, f = Math.min(1, t / 0.3) * Math.min(1, Math.max(0, (DUR - t) / 4));
  L[i] *= f; R[i] *= f; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
const g = 0.85 / peak;
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "music.wav"), buf);
console.log("music.wav", DUR, "s");
