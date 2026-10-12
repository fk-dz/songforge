/* =====================================================================
   SONGFORGE  ·  Text → Song studio
   Developer : FATYAK
   100% in-browser · Web Audio API (procedural music) + Web Speech API (vocals)
   No external API · No server · No account
   ===================================================================== */
'use strict';

/* ===================== 0 · tiny helpers ===================== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const fmt = s => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

const NOTE_MAP = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
function noteMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) return 57;
  return (NOTE_MAP[m[1] + m[2]] ?? NOTE_MAP[m[1]]) + (parseInt(m[3], 10) + 1) * 12;
}

const SCALES = {
  min:      [0, 2, 3, 5, 7, 8, 10],
  nat:      [0, 2, 3, 5, 7, 8, 10],
  dor:      [0, 2, 3, 5, 7, 9, 10],
  phry:     [0, 1, 3, 5, 7, 8, 10],
  hmin:     [0, 2, 3, 5, 7, 8, 11],
  hijaz:    [0, 1, 4, 5, 7, 8, 10],
  kurd:     [0, 1, 3, 5, 7, 8, 10],
  nahawand: [0, 2, 3, 5, 7, 9, 10],
  maj:      [0, 2, 4, 5, 7, 9, 11],
  mixo:     [0, 2, 4, 5, 7, 9, 10],
  pent:     [0, 3, 5, 7, 10],
  blues:    [0, 3, 5, 6, 7, 10]
};
const deg = (root, scale, i) => root + scale[((i % scale.length) + scale.length) % scale.length] + 12 * Math.floor(i / scale.length);

/* ===================== 1 · noise + fx ===================== */
const noiseCache = new WeakMap();
function getNoise(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buf);
  return buf;
}
function noiseSrc(ctx) { const s = ctx.createBufferSource(); s.buffer = getNoise(ctx); s.loop = true; return s; }

function makeIR(ctx, secs = 2.4, decay = 3.1) {
  const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * secs));
  const ir = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.15);
    }
  }
  return ir;
}
function makeReverb(ctx, { time = 2.4, decay = 3.1, wet = 0.3, lp = 5200 } = {}) {
  const conv = ctx.createConvolver(); conv.buffer = makeIR(ctx, time, decay);
  const input = ctx.createGain(), pre = ctx.createGain(), out = ctx.createGain();
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = lp;
  pre.gain.value = wet;
  input.connect(pre); pre.connect(filt); filt.connect(conv); conv.connect(out);
  return { input, output: out, setWet(v) { pre.gain.value = v; } };
}
function makeEcho(ctx, { time = 0.34, fb = 0.34, wet = 0.3 } = {}) {
  const input = ctx.createGain(), pre = ctx.createGain(), out = ctx.createGain();
  const dl = ctx.createDelay(2), fbd = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2600;
  dl.delayTime.value = time; fbd.gain.value = fb;
  pre.gain.value = wet;
  input.connect(pre); pre.connect(dl); dl.connect(lp); lp.connect(fbd); fbd.connect(dl); lp.connect(out);
  return { input, output: out, setWet(v) { pre.gain.value = v; } };
}

/* ===================== 2 · master chain ===================== */
function buildChain(ctx, dest) {
  const master = ctx.createGain(); master.gain.value = 0.9;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 26;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -17; comp.knee.value = 24; comp.ratio.value = 4.2;
  comp.attack.value = 0.005; comp.release.value = 0.22;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -1.6; lim.knee.value = 0; lim.ratio.value = 20;
  lim.attack.value = 0.002; lim.release.value = 0.09;
  const verb = makeReverb(ctx, { time: 2.5, decay: 3.0, wet: 0.3 });
  const echo = makeEcho(ctx, { time: 0.33, fb: 0.33, wet: 0.28 });

  hp.connect(comp); comp.connect(lim); lim.connect(master); master.connect(dest);
  verb.output.connect(master); echo.output.connect(master);
  return { dry: hp, verb, echo, master, setVol(v) { master.gain.value = v; } };
}


const PATS = {
  kick: {
    tribal:   [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    cinematic:[1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    rock:     [1,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0],
    metal:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
    trap:     [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    phonk:    [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0],
    lofi:     [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    pop:      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    edm:      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    house:    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    darbuka:  [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,0,0],
    boom:     [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0]
  },
  snare: {
    tribal:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    cinematic:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    rock:     [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    metal:    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    trap:     [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    phonk:    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    lofi:     [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    pop:      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    edm:      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    house:    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    darbuka:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
    boom:     [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]
  },
  hat: {
    tribal:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
    cinematic:[0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    rock:     [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    metal:    [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    trap:     [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,1],
    phonk:    [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,1],
    lofi:     [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,0,0],
    pop:      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
    edm:      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1],
    house:    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    darbuka:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    boom:     [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,0]
  }
};

/* ===================== 3b · JS DSP bar-stem engine ===================== */
const TAU = Math.PI * 2;
const lpc = (fc, sr) => 1 - Math.exp(-TAU * fc / sr);
function newStereo(len) { return [new Float32Array(len), new Float32Array(len)]; }

/* all instruments below write directly into [L,R] Float32Arrays */
function jsKick(A, sr, off, o) {
  const { f0 = 140, f1 = 45, dur = 0.4, gain = 1, click = 0.4 } = o;
  const n0 = Math.floor(off * sr), n1 = Math.min(A[0].length, n0 + Math.floor(dur * sr) + 2);
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / sr;
    const f = f1 + (f0 - f0 * 0.32 - f1 + f0 * 0.32) * 0; // placeholder no-op
    const fr = f1 + (f0 - f1) * Math.exp(-t * 14);
    ph += TAU * fr / sr;
    const env = gain * Math.exp(-t * (7 / dur));
    const s = Math.sin(ph) * env;
    const c = click * (Math.random() * 2 - 1) * Math.exp(-t * 120);
    A[0][i] += s + c; A[1][i] += s + c;
  }
}
function jsNoiseHit(A, sr, off, o) {
  const { dur = 0.1, gain = 0.3, fc = 8000, type = 'hp', q = 0 } = o;
  const n0 = Math.floor(off * sr), n1 = Math.min(A[0].length, n0 + Math.floor(dur * sr) + 2);
  let y = 0, y2 = 0;
  const c = lpc(fc, sr), c2 = lpc(Math.min(16000, fc * (type === 'bp' ? 4 : 1.6)), sr);
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / sr;
    let x = Math.random() * 2 - 1;
    if (type === 'hp') { y += c * (x - y); x = x - y; }
    else if (type === 'bp') { y += c * (x - y); let h = x - y; y2 += c2 * (h - y2); x = y2; }
    else { y += c * (x - y); x = y; }
    const env = gain * Math.exp(-t * (6 / dur));
    A[0][i] += x * env; A[1][i] += x * env * 0.95;
  }
}
function jsTone(A, sr, off, o) {
  const { f = 440, f1 = 0, dur = 0.2, gain = 0.4, wave = 'sine', vib = 0, vibHz = 5 } = o;
  const n0 = Math.floor(off * sr), n1 = Math.min(A[0].length, n0 + Math.floor(dur * sr) + 2);
  let ph = 0, vp = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / sr;
    const fr = f1 ? f + (f1 - f) * Math.exp(-t * 12) : f;
    vp += TAU * vibHz / sr;
    ph += TAU * (fr * (1 + vib * Math.sin(vp))) / sr;
    const p = ph % TAU;
    let s = wave === 'sine' ? Math.sin(ph)
      : wave === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph))
      : wave === 'square' ? (p < Math.PI ? 1 : -1) * 0.6
      : (p / Math.PI - 1); // saw
    const env = gain * Math.min(1, t * 300) * Math.exp(-t * (6 / dur));
    A[0][i] += s * env; A[1][i] += s * env;
  }
}
function jsSust(A, sr, off, o) {
  /* sustained filtered multi-osc voice: strings/choir/pads/lead/guitar/bass */
  const { notes = [], dur = 1, gain = 0.1, wave = 'sawtooth', fc = 2400, fcEnd = 0, attack = 0.01,
          release = 0.15, det = 7, vib = 0, vibHz = 5, drive = 0, sub = false, glide = 0,
          trem = 0, tremHz = 5, det2 = 0 } = o;
  const n0 = Math.floor(off * sr), n1 = Math.min(A[0].length, n0 + Math.ceil((dur + release) * sr));
  const rel0 = Math.floor((dur) * sr);
  const c0 = lpc(fc, sr);
  const cEnd = lpc(fcEnd || fc, sr);
  const phs = notes.map((f, k) => ({ f, p: Math.random() * TAU, p2: Math.random() * TAU, p3: Math.random() * TAU }));
  let y = 0, vp = 0;
  for (let i = n0; i < n1; i++) {
    const ii = i - n0, t = ii / sr;
    let env;
    if (t < attack) env = t / attack;
    else if (ii < rel0) env = 1;
    else env = Math.max(0, 1 - (ii - rel0) / (release * sr));
    env = env * env * gain;
    if (trem) { vp += TAU * tremHz / sr; env *= 1 - trem + trem * Math.sin(vp); }
    let x = 0;
    for (const v of phs) {
      const g = glide ? Math.pow(2, glide * Math.max(0, 1 - t / 0.1) / 12) : 1;
      v.p += TAU * v.f * g / sr;
      const s1 = wave === 'sine' ? Math.sin(v.p)
        : wave === 'triangle' ? (2 / Math.PI) * Math.asin(Math.sin(v.p))
        : wave === 'square' ? ((v.p % TAU) < Math.PI ? 0.7 : -0.7)
        : ((v.p % TAU) / Math.PI - 1);
      x += s1;
      if (det) { v.p2 += TAU * v.f * Math.pow(2, det / 1200) / sr;
        x += wave === 'sawtooth' ? ((v.p2 % TAU) / Math.PI - 1) : Math.sin(v.p2) * 0.8; }
      if (det2) { v.p3 += TAU * v.f * Math.pow(2, -det2 / 1200) / sr;
        x += wave === 'sawtooth' ? ((v.p3 % TAU) / Math.PI - 1) : Math.sin(v.p3) * 0.8; }
    }
    if (sub) x += Math.sin(phs[0].p / 2) * 0.9;
    if (drive) x = Math.tanh(x * drive / 8) * 2.2;
    const cc = fcEnd ? c0 + (cEnd - c0) * Math.min(1, t / Math.max(0.2, dur)) : c0;
    y += cc * (x - y);
    const out = fcEnd || wave !== 'sawtooth' || wave !== 'sine' ? y : y;
    A[0][i] += out * env; A[1][i] += out * env * 0.97;
  }
}
function jsVinyl(A, sr, off, dur) {
  const n0 = Math.floor(off * sr), n1 = Math.min(A[0].length, n0 + Math.floor(dur * sr));
  let y = 0; const c = lpc(2400, sr);
  for (let i = n0; i < n1; i++) {
    let x = (Math.random() * 2 - 1) * 0.02;
    if (Math.random() < 0.0004) x += (Math.random() * 2 - 1) * 0.25;
    y += c * (x - y);
    A[0][i] += x - y * 0.4; A[1][i] += (x - y * 0.4) * 0.9;
  }
}

/* ===================== 3c · bar orchestrator ===================== */
function jsRiser(A, sr, off, dur, gain) {
  gain = gain || 0.14;
  const n0 = Math.floor(off * sr), n1 = Math.min(A[0].length, n0 + Math.floor((dur + 0.15) * sr));
  let y1 = 0, y2 = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / sr;
    const fc = 400 * Math.pow(7000 / 400, Math.min(1, t / dur));
    const c = lpc(fc, sr), c2 = lpc(Math.min(15000, fc * 3), sr);
    let x = Math.random() * 2 - 1;
    y1 += c * (x - y1); const h = x - y1;
    y2 += c2 * (h - y2);
    const env = gain * Math.min(1, t / (dur * 0.92)) * (t > dur ? Math.exp(-(t - dur) * 30) : 1);
    A[0][i] += y2 * env; A[1][i] += y2 * env;
  }
}
function jsImpact(A, sr, off, gain) {
  jsKick(A, sr, off, { f0: 90, f1: 30, dur: 0.9, gain: gain, click: 0.25 });
  const n0 = Math.floor(off * sr), n1 = Math.min(A[0].length, n0 + Math.floor(1.4 * sr));
  let y = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / sr;
    const fc = 3000 * Math.pow(180 / 3000, Math.min(1, t / 1.1));
    const c = lpc(fc, sr);
    const x = Math.random() * 2 - 1;
    y += c * (x - y);
    const env = gain * 0.5 * Math.exp(-t * 4);
    A[0][i] += y * env; A[1][i] += y * env;
  }
}
function synthBarStem(sr, o) {
  const { spb, p, chords, root, scale, energy, secKind, isLast, nextIsChorus } = o;
  const barDur = spb * 4;
  const len = Math.ceil((barDur + 0.5) * sr);
  const A = newStereo(len);
  const sw = p.drums.swing || 0;
  const kp = PATS.kick[p.drums.pat] || PATS.kick.pop;
  const sp2 = PATS.snare[p.drums.pat] || PATS.snare.pop;
  const hp2 = PATS.hat[p.drums.pat] || PATS.hat.pop;
  const fOf = (d, oct) => midi(deg(root, scale, d) + 12 * oct);

  /* ---- drums ---- */
  if (!(secKind === 'inst' && p.drums.pat === 'cinematic')) {
    for (let s = 0; s < 16; s++) {
      const st = s * spb / 4 + (s % 2 ? sw * spb / 4 : 0);
      if (kp[s]) jsKick(A, sr, st, { f0: p.id === 'metal' ? 165 : 140, f1: (p.id === 'trap' || p.id === 'phonk') ? 38 : 46, dur: (p.drums.pat === 'edm' || p.drums.pat === 'house') ? 0.34 : 0.42, gain: 0.95 * energy });
      if (sp2[s] && secKind !== 'inst') {
        jsNoiseHit(A, sr, st, { dur: 0.2, gain: 0.42 * energy, fc: p.id === 'lofi' ? 1000 : 1400, type: 'hp' });
        jsTone(A, sr, st, { f: p.id === 'lofi' ? 165 : 195, f1: (p.id === 'lofi' ? 165 : 195) * 0.62, dur: 0.18, gain: 0.45 * 0.45 * energy, wave: 'tri' });
      }
      if (hp2[s]) jsNoiseHit(A, sr, st, { dur: (p.drums.pat === 'trap' && s === 14) ? 0.32 : 0.05, gain: (s % 4 === 2 ? 0.22 : 0.14) * energy, fc: 8200, type: 'hp' });
      if (p.drums.pat === 'trap' && (s === 7 || s === 11)) {
        jsNoiseHit(A, sr, st + spb / 16, { dur: 0.04, gain: 0.09, fc: 8200, type: 'hp' });
        jsNoiseHit(A, sr, st + spb / 8, { dur: 0.04, gain: 0.07, fc: 8200, type: 'hp' });
      }
    }
    if (p.drums.pat === 'darbuka') {
      const dp = [1,0,1,1, 0,1,1,0, 1,0,1,1, 0,1,0,1];
      for (let s = 0; s < 16; s++) if (dp[s]) {
        const high = s % 4 === 2;
        jsTone(A, sr, s * spb / 4, { f: high ? 430 : 175, f1: (high ? 430 : 175) * 0.6, dur: high ? 0.09 : 0.16, gain: 0.34 * energy, wave: 'tri' });
        jsNoiseHit(A, sr, s * spb / 4, { dur: 0.06, gain: 0.14 * energy, fc: high ? 3200 : 1500, type: 'bp' });
      }
    }
    if (p.drums.pat === 'rock' || p.drums.pat === 'metal') for (let s = 0; s < 4; s += 2) jsNoiseHit(A, sr, s * spb, { dur: 0.6, gain: 0.1 * energy, fc: 5400, type: 'bp' });
    if (p.crash && secKind !== 'inst') jsNoiseHit(A, sr, 0, { dur: 1.6, gain: 0.26, fc: 4000, type: 'hp' });
    if (p.fill && isLast && secKind !== 'inst') {
      for (let i = 0; i < 6; i++) jsNoiseHit(A, sr, barDur - (6 - i) * spb / 8, { dur: 0.1, gain: 0.16 + i * 0.05, fc: 1400, type: 'hp' });
      jsTone(A, sr, barDur - spb / 4, { f: 120, f1: 60, dur: 0.32, gain: 0.4, wave: 'sine' });
    }
  }

  /* ---- bass ---- */
  if (p.bass) {
    const bn = deg(root, scale, chords[0][0]) - 12;
    const bp = p.bass.pat;
    const B = p.bass;
    const bOpt = { wave: B.wave, fc: B.lp, gain: B.gain, sub: !!B.sub, drive: 0 };
    if (bp === '808') {
      jsSust(A, sr, 0, { notes: [midi(bn - 12)], dur: barDur * 0.9, gain: B.gain, wave: 'sine', fc: 900, attack: 0.018, release: 0.05, glide: B.glide ? 7 : 0, drive: 3 });
      if (chords[1] && chords[1][0] !== chords[0][0])
        jsSust(A, sr, barDur * 0.5, { notes: [midi(deg(root, scale, chords[1][0]) - 24)], dur: barDur * 0.4, gain: B.gain * 0.7, wave: 'sine', fc: 900, attack: 0.018, release: 0.05, drive: 3 });
    } else if (bp === 'offbeat') {
      for (let s = 0; s < 4; s++) jsSust(A, sr, s * spb + spb / 2, { notes: [midi(bn)], dur: spb * 0.42, gain: B.gain, wave: B.wave, fc: B.lp, attack: 0.012, release: 0.03, sub: !!B.sub });
    } else if (bp === 'root16') {
      for (let s = 0; s < 16; s++) jsSust(A, sr, s * spb / 4, { notes: [midi(bn)], dur: spb / 4 * 0.9, gain: B.gain * (s % 4 === 0 ? 1 : 0.7), wave: B.wave, fc: B.lp, attack: 0.008, release: 0.02, sub: !!B.sub });
    } else if (bp === 'root8') {
      for (let s = 0; s < 8; s++) jsSust(A, sr, s * spb / 2, { notes: [midi(s % 4 === 3 ? bn + 7 : bn)], dur: spb / 2 * 0.92, gain: B.gain, wave: B.wave, fc: B.lp, attack: 0.012, release: 0.03, sub: !!B.sub });
    } else if (bp === 'root4') {
      for (let s = 0; s < 4; s++) jsSust(A, sr, s * spb, { notes: [midi(bn)], dur: spb * 0.8, gain: B.gain, wave: B.wave, fc: B.lp, attack: 0.012, release: 0.04, sub: !!B.sub });
    } else {
      jsSust(A, sr, 0, { notes: [midi(bn)], dur: barDur * 0.92, gain: B.gain, wave: B.wave, fc: B.lp, attack: 0.012, release: 0.05, sub: !!B.sub });
    }
  }

  /* ---- pads ---- */
  if (p.strings && p.strings.on) {
    const notes = chords.map((c, i) => fOf(c[0], 1) + (i === 2 ? 12 : 0));
    jsSust(A, sr, 0, { notes, dur: barDur * 1.02, gain: p.strings.gain * (energy * 0.7 + 0.3), wave: 'sawtooth', fc: p.strings.lp, attack: p.strings.attack, release: 0.25, det: 6, vib: 0.0015, vibHz: 4.8 });
  }
  if (p.choir && p.choir.on && (secKind === 'chorus' || p.id === 'cine')) {
    const notes = chords.map(c => fOf(c[0], 2));
    jsSust(A, sr, 0, { notes, dur: barDur * 1.02, gain: p.choir.gain, wave: 'triangle', fc: 3200, attack: barDur * 0.35, release: 0.3, det: 0, det2: 9, trem: 0.28, tremHz: 5.2 });
  }
  if (p.drone && p.drone.on) {
    jsSust(A, sr, 0, { notes: [midi(deg(root, scale, chords[0][0]) - 24)], dur: barDur * 2, gain: p.drone.gain, wave: 'sawtooth', fc: 240, attack: barDur * 0.3, release: 0.4, det: 0 });
  }

  /* ---- guitar ---- */
  if (p.guitar && p.guitar.on) {
    const notes = chords.map((c, i) => fOf(c[0], i === 0 ? 0 : 1));
    if (p.id === 'metal') {
      for (let s = 0; s < 8; s++) jsSust(A, sr, s * spb / 2, { notes, dur: spb / 2 * 0.8, gain: p.guitar.gain * (s % 2 ? 0.7 : 1), wave: 'sawtooth', fc: 3300, attack: 0.006, release: 0.03, det: 7, det2: 7, drive: p.guitar.drive });
    } else {
      jsSust(A, sr, 0, { notes, dur: barDur * 0.95, gain: p.guitar.gain, wave: 'sawtooth', fc: 3300, attack: 0.006, release: 0.06, det: 7, det2: 7, drive: p.guitar.drive });
      jsSust(A, sr, barDur * 0.5 + spb / 8, { notes, dur: barDur * 0.4, gain: p.guitar.gain * 0.55, wave: 'sawtooth', fc: 3300, attack: 0.006, release: 0.05, det: 7, det2: 7, drive: p.guitar.drive });
    }
  }

  /* ---- pluck / arp ---- */
  if (p.pluck && p.pluck.on) {
    const seq = [0, 2, 1, 2, 3, 2, 1, 0];
    for (let s = 0; s < 8; s++) {
      const d = chords[seq[s] % chords.length][0];
      jsSust(A, sr, s * spb / 2, { notes: [fOf(d, 2)], dur: spb / 2 * 0.9, gain: p.pluck.gain * (s % 2 ? 0.7 : 1), wave: p.pluck.wave, fc: p.pluck.lp, fcEnd: 420, attack: 0.004, release: 0.02, det: 0 });
    }
  }
  if (p.arp && p.arp.on) {
    const n = p.arp.div || 4;
    for (let s = 0; s < n; s++) {
      const d = chords[s % chords.length][0];
      jsSust(A, sr, s * (barDur / n), { notes: [fOf(d, (p.arp.oct || 1) + 1)], dur: barDur / n * 0.85, gain: p.arp.gain, wave: p.arp.wave, fc: p.arp.lp, fcEnd: 500, attack: 0.004, release: 0.02, det: 0 });
    }
  }

  /* ---- lead ---- */
  if (p.lead && p.lead.on) {
    const Lp = p.lead;
    if (Lp.style === 'arp') {
      const seq = [0, 1, 2, 1, 2, 3, 2, 1];
      for (let s = 0; s < 8; s++) jsSust(A, sr, s * spb / 2, { notes: [fOf(chords[seq[s] % chords.length][0], 2)], dur: spb / 2 * 0.88, gain: Lp.gain, wave: Lp.wave, fc: Lp.lp, attack: 0.02, release: 0.03, det: (Lp.det || 11) / 2, vib: 0.002, vibHz: Lp.vib || 5.4 });
    } else if (Lp.style === 'oriental') {
      const seq = [0, 1, 2, 1, 3, 2, 1, 0, 2, 3, 4, 3];
      for (let s = 0; s < 12; s++) if (s % 3 !== 2 || Math.random() > 0.4)
        jsSust(A, sr, s * spb / 3, { notes: [fOf(seq[s % seq.length], 1)], dur: spb / 3 * 0.95, gain: Lp.gain, wave: Lp.wave, fc: Lp.lp, attack: 0.01, release: 0.03, det: 0, vib: 0.003, vibHz: 6 });
    } else if (Lp.style === 'solo') {
      const sc = SCALES[p.scale];
      let step = rndi(0, 4);
      const n = rndi(3, 6);
      for (let s = 0; s < n; s++) {
        step += pick([-2, -1, 1, 1, 2]);
        jsSust(A, sr, s * (barDur / n), { notes: [midi(deg(root, sc, step) + 24)], dur: barDur / n * 0.92, gain: Lp.gain, wave: Lp.wave, fc: Lp.lp, attack: 0.015, release: 0.04, det: 5, vib: 0.0025, vibHz: 5.6 });
      }
    } else if (Lp.style === 'bell') {
      [0, 2, 4].forEach((d, i) => {
        const f = fOf(chords[d % chords.length][0], 2);
        jsTone(A, sr, i * spb, { f, dur: spb * 1.6, gain: Lp.gain, wave: 'sine' });
        jsTone(A, sr, i * spb, { f: f * 2.01, dur: spb * 0.9, gain: Lp.gain * 0.4, wave: 'sine' });
      });
    } else { /* theme */
      const seq = [0, 2, 4, 2];
      for (let s = 0; s < 4; s++) jsSust(A, sr, s * spb, { notes: [fOf(chords[seq[s] % chords.length][0], 2)], dur: spb * 0.92, gain: Lp.gain, wave: Lp.wave, fc: Lp.lp, attack: 0.025, release: 0.05, det: 5, vib: 0.002, vibHz: 5.4 });
    }
  }

  /* ---- brass ---- */
  if (p.brass && p.brass.on && o.brassOn) {
    // stabs on beat 2 of every bar (extra on chorus)
    const notes = chords.map(c => fOf(c[0], 1));
    const doStab = (t, g) => jsSust(A, sr, t, { notes, dur: spb * 0.9, gain: g, wave: 'sawtooth', fc: 700, fcEnd: 2400, attack: 0.05, release: 0.08, det: 4 });
    if (secKind === 'chorus') { doStab(spb * 0.5, p.brass.gain * energy); doStab(spb * 2.5, p.brass.gain * 0.8 * energy); }
    else doStab(spb * 0.5, p.brass.gain * energy * 0.8);
  }

  /* ---- fx ---- */
  if (p.fx === 'vinyl') jsVinyl(A, sr, 0, barDur);
  if (p.fx === 'impact' && o.impactOn) jsImpact(A, sr, 0, 0.45);
  if (p.fx === 'riser' && isLast && nextIsChorus) jsRiser(A, sr, barDur - spb * 2, spb * 2);
  return A;
}

/* ===================== 4 · genre presets ===================== */
const G = {
  epic: {
    id:'epic', name:'ملحمي / فايكنغ', icon:'⚔️', en:'EPIC VIKING', bpm:92, key:'D3', scale:'min',
    prog:[[[0,0],[0,0]],[[5,0],[5,0]],[[3,0],[3,0]],[[7,-1],[7,-1]]],
    drums:{ pat:'tribal', swing:0 },
    bass:{ pat:'root8', wave:'sawtooth', lp:260, gain:.42, sub:true },
    strings:{ on:true, gain:.11, lp:2300, attack:.5, verb:.6 },
    drone:{ on:true, gain:.2 }, choir:{ on:true, gain:.06 },
    arp:{ on:false }, lead:{ on:true, style:'theme', wave:'sawtooth', gain:.14, lp:2600, echo:.3 },
    brass:{ on:true, gain:.1 }, fx:'impact', fill:true, crash:true
  },
  cine: {
    id:'cine', name:'سينمائي', icon:'🎬', en:'CINEMATIC', bpm:84, key:'A2', scale:'min',
    prog:[[[0,0],[0,0]],[[3,0],[3,0]],[[5,0],[5,0]],[[7,0],[7,0]]],
    drums:{ pat:'cinematic', swing:0 },
    bass:{ pat:'root2', wave:'triangle', lp:200, gain:.5, sub:true },
    strings:{ on:true, gain:.13, lp:2100, attack:.75, verb:.65 },
    drone:{ on:true, gain:.16 }, choir:{ on:true, gain:.055 },
    arp:{ on:true, style:'pulse', oct:1, div:4, gain:.09, wave:'triangle', lp:2000 },
    lead:{ on:true, style:'theme', wave:'triangle', gain:.11, lp:2200, echo:.35 },
    brass:{ on:false }, fx:'impact', fill:false, crash:true
  },
  rock: {
    id:'rock', name:'هارد روك', icon:'🎸', en:'HARD ROCK', bpm:142, key:'E2', scale:'min',
    prog:[[[0,0],[0,0]],[[7,0],[7,0]],[[5,0],[5,0]],[[3,0],[3,0]]],
    drums:{ pat:'rock', swing:0 },
    bass:{ pat:'root8', wave:'square', lp:340, gain:.44 },
    guitar:{ on:true, gain:.15, drive:55 },
    lead:{ on:true, style:'solo', wave:'square', gain:.15, lp:3400, echo:.22 },
    strings:{ on:false }, drone:{ on:false }, choir:{ on:false }, arp:{ on:false }, brass:{ on:false },
    fx:'crash', fill:true, crash:true
  },
  metal: {
    id:'metal', name:'ميتال', icon:'🤘', en:'HEAVY METAL', bpm:170, key:'E2', scale:'hmin',
    prog:[[[0,0],[0,0]],[[1,0],[1,0]],[[6,0],[6,0]],[[5,0],[5,0]]],
    drums:{ pat:'metal', swing:0 },
    bass:{ pat:'root16', wave:'sawtooth', lp:280, gain:.46 },
    guitar:{ on:true, gain:.17, drive:110 },
    lead:{ on:true, style:'solo', wave:'sawtooth', gain:.14, lp:4200, echo:.2 },
    strings:{ on:false }, drone:{ on:false }, choir:{ on:false }, arp:{ on:false }, brass:{ on:false },
    fx:'crash', fill:true, crash:true
  },
  trap: {
    id:'trap', name:'تراب', icon:'💎', en:'TRAP', bpm:142, key:'A2', scale:'min',
    prog:[[[0,0],[0,0]],[[0,0],[5,0]],[[3,0],[3,0]],[[7,0],[7,0]]],
    drums:{ pat:'trap', swing:0 },
    bass:{ pat:'808', wave:'sine', lp:160, gain:.9, sub:false, glide:.07 },
    pluck:{ on:true, gain:.13, wave:'triangle', lp:2600, echo:.3 },
    lead:{ on:true, style:'bell', wave:'triangle', gain:.1, lp:3000, echo:.4 },
    strings:{ on:false }, drone:{ on:false }, choir:{ on:false }, guitar:{ on:false }, brass:{ on:false },
    fx:'riser', fill:true, crash:false
  },
  phonk: {
    id:'phonk', name:'فونك', icon:'🚗', en:'PHONK DRIFT', bpm:158, key:'C3', scale:'phry',
    prog:[[[0,0],[0,0]],[[0,0],[0,0]],[[1,0],[1,0]],[[0,0],[6,0]]],
    drums:{ pat:'phonk', swing:0 },
    bass:{ pat:'808', wave:'sine', lp:150, gain:1.0, sub:false, glide:.09 },
    pluck:{ on:true, gain:.16, wave:'sawtooth', lp:1800, echo:.35 },
    lead:{ on:false }, strings:{ on:false }, drone:{ on:false }, choir:{ on:false }, guitar:{ on:false }, brass:{ on:false },
    fx:'riser', fill:true, crash:false
  },
  lofi: {
    id:'lofi', name:'لوفي', icon:'🌙', en:'LO-FI CHILL', bpm:82, key:'F3', scale:'dor',
    prog:[[[0,0],[3,0]],[[5,0],[1,0]],[[3,0],[6,0]],[[1,0],[4,0]]],
    drums:{ pat:'lofi', swing:.14 },
    bass:{ pat:'root2', wave:'triangle', lp:420, gain:.4 },
    pluck:{ on:true, gain:.14, wave:'triangle', lp:1800, echo:.2 },
    lead:{ on:true, style:'solo', wave:'sine', gain:.1, lp:1600, echo:.3 },
    strings:{ on:false }, drone:{ on:false }, choir:{ on:false }, guitar:{ on:false }, brass:{ on:false },
    fx:'vinyl', fill:false, crash:false
  },
  pop: {
    id:'pop', name:'بوب', icon:'✨', en:'POP', bpm:118, key:'C3', scale:'maj',
    prog:[[[0,0],[0,0]],[[5,0],[5,0]],[[3,0],[3,0]],[[4,0],[4,0]]],
    drums:{ pat:'pop', swing:0 },
    bass:{ pat:'root8', wave:'sawtooth', lp:520, gain:.38 },
    pluck:{ on:true, gain:.15, wave:'sawtooth', lp:3000, echo:.22 },
    lead:{ on:true, style:'theme', wave:'square', gain:.12, lp:3600, echo:.25 },
    strings:{ on:false }, drone:{ on:false }, choir:{ on:false }, guitar:{ on:false }, brass:{ on:false },
    fx:'riser', fill:true, crash:true
  },
  edm: {
    id:'edm', name:'EDM', icon:'⚡', en:'BIG ROOM EDM', bpm:128, key:'A2', scale:'min',
    prog:[[[0,0],[0,0]],[[5,0],[5,0]],[[3,0],[3,0]],[[7,0],[7,0]]],
    drums:{ pat:'edm', swing:0 },
    bass:{ pat:'offbeat', wave:'sawtooth', lp:600, gain:.42 },
    lead:{ on:true, style:'arp', wave:'sawtooth', gain:.14, lp:4200, echo:.28, det:16 },
    pluck:{ on:false }, strings:{ on:false }, drone:{ on:false }, choir:{ on:false }, guitar:{ on:false }, brass:{ on:false },
    fx:'riser', fill:true, crash:true
  },
  house: {
    id:'house', name:'هاوس', icon:'🪩', en:'DEEP HOUSE', bpm:124, key:'G2', scale:'dor',
    prog:[[[0,0],[3,0]],[[5,0],[1,0]],[[0,0],[0,0]],[[7,0],[3,0]]],
    drums:{ pat:'house', swing:0 },
    bass:{ pat:'offbeat', wave:'square', lp:520, gain:.36 },
    pluck:{ on:true, gain:.13, wave:'sawtooth', lp:2600, echo:.3 },
    lead:{ on:false }, strings:{ on:false }, drone:{ on:false }, choir:{ on:false }, guitar:{ on:false }, brass:{ on:false },
    fx:'riser', fill:false, crash:true
  },
  oriental: {
    id:'oriental', name:'شرقي', icon:'🪕', en:'ORIENTAL', bpm:104, key:'D3', scale:'hijaz',
    prog:[[[0,0],[0,0]],[[1,0],[1,0]],[[4,0],[4,0]],[[0,0],[5,0]]],
    drums:{ pat:'darbuka', swing:0 },
    bass:{ pat:'root4', wave:'triangle', lp:300, gain:.42 },
    lead:{ on:true, style:'oriental', wave:'sawtooth', gain:.16, lp:3200, echo:.32 },
    pluck:{ on:true, gain:.11, wave:'triangle', lp:2800, echo:.25 },
    strings:{ on:true, gain:.07, lp:2600, attack:.5, verb:.5 },
    drone:{ on:true, gain:.13 }, choir:{ on:false }, guitar:{ on:false }, brass:{ on:false },
    fx:'crash', fill:true, crash:true
  },
  rap: {
    id:'rap', name:'راب قديم', icon:'🎤', en:'BOOM BAP', bpm:92, key:'A2', scale:'min',
    prog:[[[0,0],[0,0]],[[3,0],[3,0]],[[5,0],[5,0]],[[0,0],[7,0]]],
    drums:{ pat:'boom', swing:.08 },
    bass:{ pat:'root8', wave:'sine', lp:240, gain:.6, sub:true },
    pluck:{ on:true, gain:.11, wave:'square', lp:1500, echo:.18 },
    lead:{ on:false }, strings:{ on:false }, drone:{ on:false }, choir:{ on:false }, guitar:{ on:false }, brass:{ on:false },
    fx:'vinyl', fill:true, crash:false
  }
};
const GENRES = Object.values(G);
/* ===================== 5 · lyrics processing ===================== */
const AR_DIAC = /[\u064B-\u0652\u0670\u0640]/g;
function cleanLine(s) { return s.replace(AR_DIAC, '').replace(/\s+/g, ' ').trim(); }
function splitLines(txt) {
  return txt.split(/\r?\n/).map(cleanLine).map(s => s.replace(/[،؛,;]+$/g, '').trim()).filter(Boolean);
}
function chunkLine(line, max) {
  max = max || 34;
  if (line.length <= max) return [line];
  const words = line.split(' '), out = [];
  let cur = '';
  for (const w of words) {
    if (!cur.length) { cur = w; continue; }
    if ((cur + ' ' + w).length > max) { out.push(cur); cur = w; }
    else cur += ' ' + w;
  }
  if (cur) out.push(cur);
  return out;
}
function syllables(line) {
  const raw = line.replace(/[^\u0600-\u06FF\u064B-\u0652a-zA-Z' ]/g, ' ');
  const marks = (raw.match(/[\u064E\u064F\u0650\u064E\u0651\u064B\u064C\u064D\u0627\u0648\u064A\u0649aeiouyAEIOUY]/g) || []).length;
  return Math.max(2, marks);
}
function guessLang(line) { return /[\u0600-\u06FF]/.test(line) ? 'ar' : 'en'; }
function makeChorus(lines, mode) {
  if (mode === 'none') return [];
  if (!lines.length) return ['يا ليل يا ليل', 'غنّي معي'];
  if (mode === 'first') return [lines[0]];
  const scored = lines.map(l => ({ l, s: Math.abs(l.length - 24) + (l.split(' ').length > 6 ? 4 : 0) }));
  scored.sort((a, b) => a.s - b.s);
  const hook = scored[0].l;
  const second = scored[1] && scored[1].l !== hook ? scored[1].l : hook;
  return [hook, second];
}

/* ===================== 6 · song structure ===================== */
function buildStructure(lines, chorus, mode, barsPerLine) {
  const secs = [];
  const verses = [];
  for (let i = 0; i < lines.length; i += 4) verses.push(lines.slice(i, i + 4));
  if (!verses.length) verses.push(['…']);
  const addV = v => secs.push({ kind:'verse', lines:v });
  const addC = () => { if (chorus.length) secs.push({ kind:'chorus', lines:chorus }); };
  const addI = (n, lbl) => secs.push({ kind:'inst', lines:[], bars:n, label:lbl });

  if (mode === 'loop') { addI(2, 'مقدمة'); addV(verses[0]); addC(); addI(2, 'خاتمة'); }
  else if (mode === 'simple') { addI(2, 'مقدمة'); addV(verses[0]); addC(); if (verses[1]) addV(verses[1]); addC(); addI(2, 'خاتمة'); }
  else {
    addI(2, 'مقدمة');
    addV(verses[0]);
    addC();
    if (verses[1]) { addV(verses[1]); addC(); }
    addI(4, 'صولو');
    if (verses[2]) { addV(verses[2]); addC(); }
    else addC();
    addI(2, 'خاتمة');
  }
  let bar = 0;
  secs.forEach(s => {
    s.startBar = bar;
    s.bars = s.kind === 'inst' ? s.bars : Math.max(2, s.lines.length * barsPerLine);
    bar += s.bars;
  });
  const totalBars = bar + 1;
  return { secs, totalBars };
}

/* ===================== 7 · render (works for live + offline) ===================== */
function chordNotes(root, scale, chord, oct) {
  const list = [0, 2, 4];
  if (chord && chord.length > 2) list.push(chord[2][0]);
  return list.map((d, i) => deg(root, scale, (chord ? chord[i][0] : d) + (i === 3 ? 0 : 0)) + 12 * oct);
}
async function renderSong(ctx, F, cfg, onBar) {
  const p = G[cfg.genre];
  const spb = 60 / cfg.tempo, bar = spb * 4;
  const root = noteMidi(p.key);
  const scale = SCALES[p.scale] || SCALES.min;
  const { secs, totalBars } = cfg.structure;
  const events = [];
  let barsDone = 0;

  const pushVocal = (secIdx, lineIdx, text, t, dur) => events.push({ kind:'vocal', sec:secIdx, line:lineIdx, text, t, dur });
  const pushInst  = (secIdx, label, t, dur) => events.push({ kind:'inst', sec:secIdx, label, text:label, t, dur });

  for (let si = 0; si < secs.length; si++) {
    const sec = secs[si];
    const t0 = sec.startBar * bar;
    const energy = sec.kind === 'chorus' ? 1 : sec.kind === 'inst' ? .85 : .7;
    const chords = [];
    for (let b = 0; b < sec.bars; b++) {
      const pc = p.prog[b % p.prog.length];
      chords.push(pc.map(c => [c[0], c[1]]));
    }

    /* ---- map vocal lines to bars ---- */
    let cursor = 1;
    if (sec.kind !== 'inst') {
      sec.map = [];
      sec.lines.forEach((ln, li) => {
        const chunks = cfg.instOnly ? [ln] : chunkLine(ln, Math.max(18, Math.round(24 * cfg.bars)));
        const firstBar = cursor;
        chunks.forEach((c, ci) => {
          const t = t0 + cursor * bar + spb * 0.5;
          const dur = cfg.bars * bar - spb * 0.5;
          sec.map.push({ li, ci, text:c, t, dur, full:ln });
          pushVocal(si, li, c, t, dur);
          cursor += cfg.bars;
        });
        if (chunks.length > 1) sec.map[sec.map.length - chunks.length].multi = chunks.length;
        void firstBar;
      });
      if (cursor > sec.bars) { /* overflow: extend nothing, events still scheduled */ }
    } else {
      pushInst(si, sec.label || 'موسيقى', t0, sec.bars * bar);
    }

    /* ---- bars ---- */
    for (let b = 0; b < sec.bars; b++) {
      if ((barsDone++ % 4) === 0) { if (onBar) onBar(barsDone); await new Promise(r => setTimeout(r, 0)); }
      const bt = t0 + b * bar;
      const chord = chords[b];
      const isLast = b === sec.bars - 1;
      const nextIsChorus = secs[si + 1] && secs[si + 1].kind === 'chorus';
      const stem = synthBarStem(ctx.sampleRate, {
        spb, p, chords: chord, root, scale, energy,
        secKind: sec.kind, isLast, nextIsChorus,
        brassOn: (b % 2 === 0 || sec.kind === 'chorus'),
        impactOn: (b === 0 && (si === 0 || !nextIsChorus)),
        firstBar: b === 0
      });
      const sbuf = ctx.createBuffer(2, stem[0].length, ctx.sampleRate);
      sbuf.copyToChannel(stem[0], 0); sbuf.copyToChannel(stem[1], 1);
      const src = ctx.createBufferSource(); src.buffer = sbuf;
      src.connect(F.dry);
      const vsg = ctx.createGain(); vsg.gain.value = 0.22; src.connect(vsg); vsg.connect(F.verb.input);
      const esg = ctx.createGain(); esg.gain.value = 0.12; src.connect(esg); esg.connect(F.echo.input);
      src.start(bt);
    }
  }

  /* outro chord + tail */
  const endT = totalBars * bar;
  const lastChord = p.prog[0];
  {
    const sr2 = ctx.sampleRate;
    const olen = Math.ceil((bar * 2.6 + 0.6) * sr2);
    const A = newStereo(olen);
    const notes = lastChord.map(c => deg(root, scale, c[0]) + 12);
    jsSust(A, sr2, 0, { notes, dur: bar * 2.6, gain: 0.1, wave: 'sawtooth', fc: 2600, attack: 0.3, release: 0.5, det: 6 });
    if (p.id === 'epic' || p.id === 'cine') jsImpact(A, sr2, 0, 0.5);
    const obuf = ctx.createBuffer(2, olen, sr2);
    obuf.copyToChannel(A[0], 0); obuf.copyToChannel(A[1], 1);
    const osrc = ctx.createBufferSource(); osrc.buffer = obuf;
    osrc.connect(F.dry); osrc.connect(F.verb.input);
    osrc.start(endT - bar);
  }
  events.sort((a, b) => a.t - b.t);
  return { events, duration: endT + 2.4, spb, bar };
}

/* ===================== 8 · WAV export ===================== */
function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, len = buffer.length, sr = buffer.sampleRate;
  const bytes = 44 + len * ch * 2;
  const ab = new ArrayBuffer(bytes), dv = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, len * ch * 2, true);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      let s = clamp(chans[c][i], -1, 1);
      dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
async function renderToWav(cfg, onProgress) {
  const sr = 44100;
  const pre = { ...cfg, structure: cfg.structure };
  const tmp = new OfflineAudioContext(2, 1200, sr);
  const probe = await renderSong(tmp, buildChain(tmp, tmp.destination), pre);
  const total = Math.ceil(probe.duration * sr) + sr;
  const oc = new OfflineAudioContext(2, total, sr);
  const F = buildChain(oc, oc.destination);
  F.setVol(cfg.volume);
  F.verb.setWet(cfg.reverb ? 0.3 : 0);
  F.echo.setWet(cfg.echo ? 0.28 : 0);
  const r = await renderSong(oc, F, pre, n => { if (onProgress) onProgress(clamp(n / 240, 0, 0.8)); });
  if (onProgress) onProgress(0.85);
  const buf = await oc.startRendering();
  if (onProgress) onProgress(0.97);
  return { blob: encodeWav(buf), events: r.events, duration: r.duration };
}

/* ===================== 9 · vocals (Web Speech) ===================== */
const VPROFILES = {
  man:    { name:'رجل فايكنغي', icon:'🛡️', members:['man'], pitch:.18, rate:.86, power:'عميق · ضخم · بطيء' },
  woman:  { name:'امرأة',      icon:'👩', members:['woman'], pitch:1.35, rate:1.0, power:'واضح · دافئ' },
  kid:    { name:'طفل',        icon:'🧒', members:['kid'], pitch:1.85, rate:1.14, power:'عالي · مرح' },
  mw:     { name:'رجل + امرأة', icon:'👫', members:['man','woman'], pitch:0, rate:0, power:'ثنائي بالتناوب' },
  mk:     { name:'رجل + طفل',  icon:'🛡️🧒', members:['man','kid'], pitch:0, rate:0, power:'أب و ابن' },
  wk:     { name:'امرأة + طفل', icon:'👩🧒', members:['woman','kid'], pitch:0, rate:0, power:'أم و طفل' },
  all:    { name:'الجميع (كورال)', icon:'👨‍👩‍👧', members:['man','woman','kid'], pitch:0, rate:0, power:'ثلاثي + ردّ جماعي' }
};
const MEMBER_P = { man:{ pitch:.18, rate:.86 }, woman:{ pitch:1.35, rate:1.0 }, kid:{ pitch:1.85, rate:1.14 } };

const TTS = {
  ready:false, list:[], byRole:{ man:null, woman:null, kid:null },
  load() {
    if (!('speechSynthesis' in window)) { this.ready = false; this.paint('لا يوجد محرّك نطق في هذا المتصفح — استخدم وضع «موسيقى فقط».'); return; }
    const fill = () => {
      this.list = speechSynthesis.getVoices() || [];
      if (!this.list.length) return;
      this.ready = true;
      const score = v => {
        let s = 0; const n = (v.name || '').toLowerCase(), lg = (v.lang || '').toLowerCase();
        if (lg.startsWith('ar')) s += 100;
        else if (lg.startsWith('en')) s += 20;
        else s += 5;
        if (v.localService) s += 8;
        if (v.default) s += 3;
        if (/male|رجل|hamed|majed|tarik|omar|naayf|tarik|adam|male\b/.test(n) && !/female/.test(n)) s += 6;
        if (/female|woman|نس|salma|hoda|laila|amira|zeina|samar|female\b/.test(n)) s += 6;
        return s;
      };
      const pool = [...this.list].sort((a, b) => score(b) - score(a));
      const maleNames = /male|رجل|hamed|majed|tarik|omar|naayf|adam|david|mark|guy|james|diego/i;
      const femNames  = /female|woman|نس|salma|hoda|laila|amira|zeina|samar|susan|zira|aria|jenny/i;
      const kidNames  = /child|kid|child|طفل|sam|kids/i;
      const find = (re, anti) => pool.find(v => re.test(v.name || '') && !(anti && anti.test(v.name || ''))) || null;
      this.byRole.man   = find(maleNames, femNames) || pool[0] || null;
      this.byRole.woman = find(femNames, maleNames) || pool[1] || pool[0] || null;
      this.byRole.kid   = find(kidNames) || this.byRole.woman || pool[0] || null;
      this.paint();
    };
    fill();
    speechSynthesis.onvoiceschanged = fill;
    setTimeout(fill, 400); setTimeout(fill, 1500);
  },
  paint(msg) {
    const box = $('#voiceList');
    if (!box) return;
    if (msg) { box.innerHTML = '<div>' + msg + '</div>'; return; }
    if (!this.list.length) { box.innerHTML = '<div>لم يُعثر على أصوات بعد…</div>'; return; }
    box.innerHTML = this.list.slice(0, 60).map(v => {
      const hit = Object.values(this.byRole).some(x => x && x.name === v.name);
      return '<div class="' + (hit ? 'hit' : '') + '">' + (hit ? '★ ' : '· ') + (v.name || '?') + ' — ' + (v.lang || '') + (v.localService ? ' · محلي' : ' · شبكة') + '</div>';
    }).join('');
  },
  voiceFor(role) { return this.byRole[role] || this.list[0] || null; }
};

function speakAt(text, role, t, dur, lang, harmony) {
  if (!TTS.ready) return;
  try {
    const prof = MEMBER_P[role] || MEMBER_P.man;
    const syl = syllables(text);
    let rate = clamp(syl / Math.max(0.6, dur) * 0.62, 0.55, 1.7) * prof.rate;
    rate = clamp(rate, 0.5, 2);
    const fire = (r, extraPitch, gainVol) => {
      const u = new SpeechSynthesisUtterance(text);
      const v = TTS.voiceFor(r);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
      u.pitch = clamp(prof.pitch + extraPitch, 0, 2);
      u.rate = rate;
      u.volume = clamp(gainVol, 0, 1);
      speechSynthesis.speak(u);
    };
    fire(role, 0, 1);
    if (harmony) setTimeout(() => { try { fire(role, role === 'man' ? .25 : -.3, .45); } catch (e) {} }, 90);
  } catch (e) { logMsg('speech error: ' + e.message); }
}
function voiceForEvent(role, idx, profile) {
  const m = VPROFILES[profile].members;
  if (m.length === 1) return m[0];
  if (profile === 'all') return idx % 2 === 0 ? m[idx % 3] : m[(idx + 1) % 3];
  return m[idx % m.length];
}

/* ===================== 10 · UI state ===================== */
const DEMOS = {
  epic: `قوموا يا أبطال الشمال\nالريح تنادي و السيف لمّا ينام\nنمشي على الجليد و لا نهاب الردى\nو المجد يكتب أسماءنا بالنار\nيا جبال اشهدي\nيا بحار اهدري\nنحن أبناء العاصفة`,
  rock: `صوت الجيتار يكسر السكوت\nو الحلم في القلب ما يموت\nارفع صوتك و غنّيها\nهذي الدنيا لنا و ليست لهم\nنار في العروق\nحرية و طموح`,
  love: `يا ساكن في القلب من زمان\nكل ما غابت شمس تذكرتك\nأكتب اسمك على كل الجدران\nو أنت بعيد و أنا مشتاق\nارجع لي\nقلبي ما نسي`,
  rap: `أبدأ من الصفر و ما نوقف\nكل يوم معركة و كل ليلة درس\nالكلمة سلاحي و القلم سيفي\nو النجاح جاي لا محالة\nاسمعني زين\nهادي قصتي`,
  kids: `طلع القمر و نامت النجوم\nو الطيور غنّت للحمام\nنلعب و نضحك كل يوم\nو الشمس تضحك لنا\nيا أطفال\nغنّوا معي`
};

const S = {
  genre:'epic', voice:'man', tempo:0, bars:2, vol:85, structure:'song', chorus:'auto',
  echo:true, reverb:true, inst:false, harmony:false,
  song:null, wav:null, playing:false, startCtxT:0, offset:0, timers:[], raf:0
};

let ACTX = null, FCHAIN = null, ANALYSER = null, SRCNODE = null;
if (typeof window !== 'undefined') {
  window.S = S; window.G = G; window.renderSong = renderSong; window.buildChain = buildChain;
  window.buildStructure = buildStructure; window.makeChorus = makeChorus; window.splitLines = splitLines;
  window.chunkLine = chunkLine; window.syllables = syllables; window.VPROFILES = VPROFILES;
  window.pos = pos; window.encodeWav = encodeWav;
}

function logMsg(m) {
  const el = $('#log');
  if (!el) return;
  el.textContent = (el.textContent + '\n' + m).split('\n').slice(-40).join('\n');
  el.scrollTop = el.scrollHeight;
}
function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3200);
}
function savePrefs() {
  try { localStorage.setItem('songforge', JSON.stringify({ g:S.genre, v:S.voice, t:S.tempo, b:S.bars, vol:S.vol, st:S.structure, ch:S.chorus, fx:[S.echo,S.reverb,S.inst,S.harmony], lyrics:$('#lyrics').value })); } catch (e) {}
}
function loadPrefs() {
  try {
    const d = JSON.parse(localStorage.getItem('songforge') || 'null');
    if (!d) return;
    S.genre = d.g || S.genre; S.voice = d.v || S.voice; S.tempo = d.t || 0;
    S.bars = d.b || 2; S.vol = d.vol ?? 85; S.structure = d.st || 'song'; S.chorus = d.ch || 'auto';
    if (d.fx) { S.echo = d.fx[0]; S.reverb = d.fx[1]; S.inst = d.fx[2]; S.harmony = d.fx[3]; }
    if (d.lyrics) $('#lyrics').value = d.lyrics;
  } catch (e) {}
}

/* ---------- build option UI ---------- */
function buildUI() {
  const gbox = $('#genres');
  gbox.innerHTML = GENRES.map(g => `<button class="g${g.id === S.genre ? ' on' : ''}" data-g="${g.id}"><i>${g.icon}</i>${g.name}<small>${g.en} · ${g.bpm}</small></button>`).join('');
  gbox.addEventListener('click', e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    S.genre = b.dataset.g; S.tempo = 0; syncTempo();
    $$('#genres .g').forEach(x => x.classList.toggle('on', x === b));
    savePrefs(); logMsg('genre → ' + G[S.genre].en);
  });

  const vbox = $('#voices');
  vbox.innerHTML = Object.entries(VPROFILES).map(([k, v]) => `<button class="v${k === S.voice ? ' on' : ''}" data-v="${k}"><i>${v.icon}</i>${v.name}<small>${v.power}</small></button>`).join('');
  vbox.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    S.voice = b.dataset.v;
    $$('#voices .v').forEach(x => x.classList.toggle('on', x === b));
    savePrefs(); logMsg('voice → ' + VPROFILES[S.voice].name);
  });

  $$('.tg').forEach(b => {
    const k = b.dataset.t;
    b.classList.toggle('on', !!S[k]);
    b.addEventListener('click', () => { S[k] = !S[k]; b.classList.toggle('on', S[k]); savePrefs(); logMsg(k + ' → ' + S[k]); });
  });

  $('#structure').value = S.structure;
  $('#chorus').value = S.chorus;
  $('#bars').value = S.bars;
  $('#vol').value = S.vol;
  $('#structure').addEventListener('change', e => { S.structure = e.target.value; savePrefs(); });
  $('#chorus').addEventListener('change', e => { S.chorus = e.target.value; savePrefs(); });
  $('#bars').addEventListener('input', e => { S.bars = +e.target.value; $('#barsV').textContent = ['', 'سطر واحد', 'مقطعان', '3 مقاطع', '4 مقاطع'][S.bars] || ''; savePrefs(); });
  $('#vol').addEventListener('input', e => { S.vol = +e.target.value; $('#volV').textContent = S.vol + '%'; if (FCHAIN) FCHAIN.setVol(S.vol / 100); savePrefs(); });
  $('#tempo').addEventListener('input', e => { S.tempo = +e.target.value; syncTempo(); savePrefs(); });

  $$('.chip').forEach(c => c.addEventListener('click', () => {
    const k = c.dataset.demo;
    if (k === 'clear') { $('#lyrics').value = ''; toast('تم تفريغ الكلمات'); }
    else { $('#lyrics').value = DEMOS[k]; toast('تم تحميل كلمات جاهزة'); }
    savePrefs();
  }));

  $('#barsV').textContent = ['', 'سطر واحد', 'مقطعان', '3 مقاطع', '4 مقاطع'][S.bars];
  $('#volV').textContent = S.vol + '%';
  syncTempo();
}
function syncTempo() {
  const base = G[S.genre].bpm;
  const t = $('#tempo');
  if (!S.tempo) { t.value = base; $('#tempoV').textContent = base + ' BPM'; }
  else { t.value = S.tempo; $('#tempoV').textContent = S.tempo + ' BPM'; }
}
function effTempo() { return S.tempo || G[S.genre].bpm; }

/* ===================== 11 · generation ===================== */
function currentCfg() {
  const raw = splitLines($('#lyrics').value);
  const lines = raw.length ? raw : ['اكتب كلماتك أولًا', 'ثم اضغط اصنع الأغنية'];
  const chorus = makeChorus(raw, S.chorus);
  const structure = buildStructure(lines, chorus, S.structure, S.bars);
  return {
    genre: S.genre, tempo: effTempo(), bars: S.bars, volume: S.vol / 100,
    echo: S.echo, reverb: S.reverb, instOnly: S.inst, harmony: S.harmony,
    voice: S.voice, structure, lines, chorus,
    title: (raw[0] || 'أغنية بلا عنوان').slice(0, 40)
  };
}
async function makeSong() {
  const btn = $('#make');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> جارٍ التصنيع…';
  logMsg('building song · ' + G[S.genre].en + ' · ' + effTempo() + 'bpm · ' + VPROFILES[S.voice].name);
  try {
    const cfg = currentCfg();
    stopPlayback(true);
    const r = await renderToWav(cfg, p => { btn.innerHTML = '<span class="spin"></span> تصنيع الموسيقى ' + Math.round(p * 100) + '%'; });
    S.song = { cfg, events: r.events, duration: r.duration };
    S.wav = r.blob;
    paintLyrics();
    $('#tDur').textContent = fmt(r.duration);
    $('#songMeta').textContent = `${G[cfg.genre].icon} ${G[cfg.genre].name} · ${cfg.tempo} BPM · ${VPROFILES[cfg.voice].name} · ${fmt(r.duration)} · ${(r.blob.size / 1048576).toFixed(1)} MB`;
    ['#play', '#stop', '#dl', '#dlLy', '#dlHtml', '#copy'].forEach(s => $(s).disabled = false);
    logMsg('done · ' + r.events.length + ' events · ' + fmt(r.duration));
    toast('تم صنع الأغنية ✅ اضغط تشغيل');
  } catch (e) {
    console.error(e);
    logMsg('ERROR: ' + e.message);
    toast('حدث خطأ: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🎵</span> اصنع الأغنية';
  }
}

/* ---------- lyrics panel ---------- */
function paintLyrics() {
  const box = $('#lyricsBox');
  const { cfg, events } = S.song;
  let n = 0;
  box.innerHTML = cfg.structure.secs.map((sec, si) => {
    if (sec.kind === 'inst') return `<div class="ly" data-sec="${si}" data-line="-1"><s>${fmt(sec.startBar * (240 / cfg.tempo))}</s>🎻 ${sec.label || 'موسيقى'}</div>`;
    const head = `<div class="ly" style="color:#ff8a00;font-weight:800;font-size:11px;letter-spacing:.12em">${sec.kind === 'chorus' ? '★ لازمة' : 'مقطع ' + (si)}</div>`;
    const body = sec.lines.map((l, li) => {
      const ev = events.find(e => e.kind === 'vocal' && e.sec === si && e.line === li);
      n++;
      return `<div class="ly" data-sec="${si}" data-line="${li}"><s>${ev ? fmt(ev.t) : '--:--'}</s>${l}</div>`;
    }).join('');
    return head + body;
  }).join('');
  void n;
}

/* ===================== 12 · playback ===================== */
function ensureCtx() {
  if (!ACTX) {
    ACTX = new (window.AudioContext || window.webkitAudioContext)();
    FCHAIN = buildChain(ACTX, ACTX.destination);
    ANALYSER = ACTX.createAnalyser(); ANALYSER.fftSize = 1024; ANALYSER.smoothingTimeConstant = .8;
    FCHAIN.master.connect(ANALYSER);
  }
  if (ACTX.state === 'suspended') ACTX.resume();
  return ACTX;
}
function stopPlayback(silent) {
  S.timers.forEach(clearTimeout); S.timers = [];
  if (SRCNODE) { try { SRCNODE.stop(); } catch (e) {} SRCNODE.disconnect(); SRCNODE = null; }
  if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} }
  S.playing = false;
  cancelAnimationFrame(S.raf);
  $('#playIco').textContent = '▶'; $('#playTxt').textContent = 'تشغيل';
  $$('#lyricsBox .ly').forEach(x => x.classList.remove('on'));
  $('#nowLine').textContent = '—';
  $('#seekFill').style.width = '0%';
  $('#tCur').textContent = '00:00';
  if (!silent) S.offset = 0;
}
async function startPlayback(fromOffset) {
  if (!S.song || !S.wav) return;
  ensureCtx();
  const buf = await S.wav.arrayBuffer();
  const abuf = await ACTX.decodeAudioData(buf);
  stopPlayback(true);
  S.playing = true;
  S.offset = fromOffset || 0;
  const src = ACTX.createBufferSource();
  src.buffer = abuf; src.connect(FCHAIN.dry);
  FCHAIN.setVol(S.vol / 100);
  FCHAIN.verb.setWet(S.reverb ? .3 : 0);
  FCHAIN.echo.setWet(S.echo ? .28 : 0);
  S.startCtxT = ACTX.currentTime + 0.08;
  S.offset = fromOffset || 0;
  src.start(S.startCtxT, S.offset);
  SRCNODE = src;
  src.onended = () => { if (S.playing && ACTX.currentTime >= S.startCtxT + abuf.duration - S.offset - 0.15) stopPlayback(); };

  /* schedule vocals */
  if (!S.song.cfg.instOnly) {
    if (!('speechSynthesis' in window) || !TTS.ready) { logMsg('vocals skipped: no speech engine'); }
    else {
      const vs = S.song.events.filter(e => e.kind === 'vocal' && e.t >= S.offset - 0.05);
      vs.forEach((e, i) => {
        const delay = (e.t - S.offset - S.startCtxT + ACTX.currentTime) * 1000;
        if (delay < 0) return;
        S.timers.push(setTimeout(() => {
          if (!S.playing) return;
          try { speechSynthesis.cancel(); } catch (x) {}
          const role = voiceForEvent(null, i, S.song.cfg.voice);
          speakAt(e.text, role, e.t, e.dur, guessLang(e.text), S.song.cfg.harmony);
        }, Math.max(0, delay)));
      });
      logMsg('vocals scheduled: ' + vs.length);
    }
  }
  $('#playIco').textContent = '❚❚'; $('#playTxt').textContent = 'إيقاف مؤقت';
  tick();
}
function togglePlay() {
  if (!S.song) return;
  if (S.playing) { S.pausedAt = pos(); stopPlayback(); S.offset = S.pausedAt; $('#playIco').textContent = '▶'; $('#playTxt').textContent = 'متابعة'; }
  else startPlayback(S.offset);
}
function pos() { return S.playing ? clamp(ACTX.currentTime - S.startCtxT + S.offset, 0, S.song.duration) : S.offset; }

/* ---------- visualizer ---------- */
function tick() {
  if (!S.playing) return;
  const t = pos();
  $('#tCur').textContent = fmt(t);
  $('#seekFill').style.width = (t / S.song.duration * 100).toFixed(2) + '%';
  /* highlight */
  let cur = null;
  for (const e of S.song.events) { if (e.t <= t) cur = e; else break; }
  if (cur) {
    $('#nowLine').textContent = cur.kind === 'inst' ? '🎻 ' + cur.label : cur.text;
    $$('#lyricsBox .ly').forEach(x => {
      const on = x.dataset.sec == cur.sec && (cur.kind === 'inst' ? x.dataset.line == -1 : x.dataset.line == (S.song.events.filter(z => z.kind === 'vocal' && z.sec == cur.sec && z.t <= cur.t).pop()?.line));
      x.classList.toggle('on', !!on);
    });
    const el = $('#lyricsBox .ly.on');
    if (el && el.scrollIntoView) el.scrollIntoView({ block:'nearest', behavior:'smooth' });
  }
  drawViz();
  S.raf = requestAnimationFrame(tick);
}
function drawViz() {
  const c = $('#viz'); if (!c || !ANALYSER) return;
  const ctx2 = c.getContext('2d');
  const W = c.width, H = c.height;
  const n = ANALYSER.frequencyBinCount;
  const arr = new Uint8Array(n);
  ANALYSER.getByteFrequencyData(arr);
  ctx2.clearRect(0, 0, W, H);
  const bars = 72;
  const bw = W / bars;
  const grad = ctx2.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#ff8a00'); grad.addColorStop(.5, '#ff2d6f'); grad.addColorStop(1, '#a855ff');
  ctx2.fillStyle = grad;
  for (let i = 0; i < bars; i++) {
    const idx = Math.floor(Math.pow(i / bars, 1.7) * n * 0.72);
    const v = arr[idx] / 255;
    const h = Math.max(3, v * H * 0.92);
    ctx2.globalAlpha = .35 + v * .65;
    ctx2.beginPath();
    const x = i * bw + bw * .18, w = bw * .64;
    ctx2.roundRect ? ctx2.roundRect(x, H - h, w, h, 4) : ctx2.rect(x, H - h, w, h);
    ctx2.fill();
  }
  ctx2.globalAlpha = 1;
  /* meter */
  const m = $('#meter');
  if (m && !m.children.length) m.innerHTML = '<s></s>'.repeat(18);
  if (m) [...m.children].forEach((el, i) => {
    const idx = Math.floor(Math.pow(i / 18, 1.6) * n * .7);
    el.style.height = Math.max(4, arr[idx] / 255 * 26) + 'px';
    el.style.background = arr[idx] > 180 ? '#ff2d6f' : arr[idx] > 90 ? '#ff8a00' : '#3a2a5e';
  });
}

/* ===================== 13 · exports ===================== */
function dl(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function safeName(s) { return (s || 'song').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'song'; }
function lyricsText() {
  const { cfg } = S.song;
  let out = 'SONGFORGE · by FATYAK\n' + '='.repeat(34) + '\n';
  out += 'العنوان : ' + cfg.title + '\n';
  out += 'النوع   : ' + G[cfg.genre].name + ' (' + G[cfg.genre].en + ')\n';
  out += 'السرعة  : ' + cfg.tempo + ' BPM\n';
  out += 'الصوت   : ' + VPROFILES[cfg.voice].name + '\n';
  out += 'المدة   : ' + fmt(S.song.duration) + '\n' + '='.repeat(34) + '\n\n';
  cfg.structure.secs.forEach((sec, i) => {
    if (sec.kind === 'inst') { out += '[' + (sec.label || 'موسيقى') + ']\n\n'; return; }
    out += (sec.kind === 'chorus' ? '[لازمة]\n' : '[مقطع ' + i + ']\n');
    sec.lines.forEach(l => out += l + '\n');
    out += '\n';
  });
  return out;
}
function htmlExport() {
  const { cfg } = S.song;
  const secs = cfg.structure.secs.map((s, i) => s.kind === 'inst'
    ? `<div class="sec inst">🎻 ${s.label || 'موسيقى'}</div>`
    : `<div class="sec"><h3>${s.kind === 'chorus' ? '★ لازمة' : 'مقطع ' + i}</h3>${s.lines.map(l => '<p>' + l.replace(/</g, '&lt;') + '</p>').join('')}</div>`).join('');
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.title} — SONGFORGE by FATYAK</title>
<style>body{font-family:'Segoe UI',Tahoma,sans-serif;background:#07040e;color:#f4eefc;margin:0;padding:40px 20px}
.box{max-width:680px;margin:auto;background:#120b26;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:30px}
h1{background:linear-gradient(100deg,#ffb020,#ff2d6f,#7b2cff);-webkit-background-clip:text;color:transparent;margin:0 0 6px}
.meta{color:#a99cc4;font-size:13px;line-height:2;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:14px;margin-bottom:18px}
.sec{margin:18px 0}.sec h3{color:#ff8a00;font-size:14px}.sec p{font-size:17px;line-height:2;margin:4px 0}
.inst{color:#7b6f96;font-size:13px}audio{width:100%;margin-top:16px}
.f{text-align:center;color:#7b6f96;font-size:12px;margin-top:26px}b{color:#ffb020}</style></head>
<body><div class="box"><h1>${cfg.title}</h1>
<div class="meta">${G[cfg.genre].icon} ${G[cfg.genre].name} · ${cfg.tempo} BPM · ${VPROFILES[cfg.voice].name} · ${fmt(S.song.duration)}</div>
${secs}
<div class="f">صُنعت بواسطة <b>SONGFORGE</b> · تطوير <b>FATYAK</b></div></div></body></html>`;
}

/* ===================== 14 · boot ===================== */
function boot() {
  buildUI();
  loadPrefs();
  buildUI();
  TTS.load();
  if (!$('#lyrics').value) $('#lyrics').value = DEMOS.epic;
  $('#lyrics').addEventListener('input', savePrefs);

  $('#make').addEventListener('click', makeSong);
  $('#play').addEventListener('click', togglePlay);
  $('#stop').addEventListener('click', () => { stopPlayback(); toast('تم الإيقاف'); });
  $('#seek').addEventListener('click', e => {
    if (!S.song) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - r.left) / r.width, 0, 1);
    const wasPlaying = S.playing;
    stopPlayback();
    S.offset = ratio * S.song.duration;
    $('#seekFill').style.width = (ratio * 100) + '%';
    if (wasPlaying) startPlayback(S.offset);
  });
  $('#dl').addEventListener('click', () => { if (S.wav) { dl(S.wav, safeName(S.song.cfg.title) + '_' + G[S.song.cfg.genre].en + '_FATYAK.wav'); toast('جارٍ تحميل WAV'); } });
  $('#dlLy').addEventListener('click', () => { dl(new Blob([lyricsText()], { type:'text/plain;charset=utf-8' }), safeName(S.song.cfg.title) + '_lyrics.txt'); });
  $('#dlHtml').addEventListener('click', () => { dl(new Blob([htmlExport()], { type:'text/html;charset=utf-8' }), safeName(S.song.cfg.title) + '.html'); });
  $('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(lyricsText()); toast('تم نسخ الكلمات 📋'); }
    catch (e) { toast('النسخ غير متاح في هذا السياق'); }
  });
  $('#drumTest').addEventListener('click', () => {
    ensureCtx();
    const p = G[S.genre], spb = 60 / effTempo();
    const root = noteMidi(p.key), scale = SCALES[p.scale] || SCALES.min;
    FCHAIN.setVol(S.vol / 100);
    for (let b = 0; b < 2; b++) {
      const stem = synthBarStem(ACTX.sampleRate, {
        spb, p, chords: p.prog[b % p.prog.length], root, scale, energy: 1,
        secKind: 'verse', isLast: false, nextIsChorus: false,
        brassOn: b % 2 === 0, impactOn: b === 0, firstBar: b === 0
      });
      const bb = ACTX.createBuffer(2, stem[0].length, ACTX.sampleRate);
      bb.copyToChannel(stem[0], 0); bb.copyToChannel(stem[1], 1);
      const ss = ACTX.createBufferSource(); ss.buffer = bb; ss.connect(FCHAIN.dry);
      ss.start(ACTX.currentTime + 0.06 + b * spb * 4);
    }
    drawVizIdle();
    toast('تجربة إيقاع ' + p.name);    drawVizIdle();
    toast('تجربة إيقاع ' + p.name);
  });
  $('#voiceTest').addEventListener('click', () => {
    if (!('speechSynthesis' in window) || !TTS.ready) { toast('لا يوجد محرّك نطق في هذا المتصفح'); return; }
    const txt = guessLang(($('#lyrics').value.split('\n')[0] || '')) === 'ar'
      ? (splitLines($('#lyrics').value)[0] || 'هذا هو صوتي في الأغنية')
      : (splitLines($('#lyrics').value)[0] || 'This is my voice in the song');
    try { speechSynthesis.cancel(); } catch (e) {}
    const role = VPROFILES[S.voice].members[0];
    speakAt(txt, role, 0, 3.2, guessLang(txt), S.harmony);
    toast('تجربة صوت: ' + VPROFILES[S.voice].name);
  });
  document.addEventListener('pointerdown', () => { ensureCtx(); }, { once:true });
  drawVizIdle();
  logMsg('engine booted · ' + GENRES.length + ' genres · ' + Object.keys(VPROFILES).length + ' voices');
  if (!('speechSynthesis' in window)) logMsg('WARN: speechSynthesis unavailable');
}
function drawVizIdle() {
  const c = $('#viz'); if (!c) return;
  const x = c.getContext('2d');
  const W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  const g = x.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, '#ff8a00'); g.addColorStop(.5, '#ff2d6f'); g.addColorStop(1, '#a855ff');
  x.fillStyle = g; x.globalAlpha = .28;
  const bars = 72, bw = W / bars;
  for (let i = 0; i < bars; i++) {
    const h = 6 + Math.abs(Math.sin(i * .42)) * H * .22;
    x.fillRect(i * bw + bw * .18, H - h, bw * .64, h);
  }
  x.globalAlpha = 1;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
