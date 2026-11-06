// Procedural Web Audio (template section 3) + new space SFX and a tiny
// synthwave sequencer. No audio files.
import { Settings } from "./settings";

type ToneOpts = {
  freq?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  attack?: number;
  release?: number;
  slide?: number;
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let started = false;
const lastPlay: Record<string, number> = {};

function applyVolume() {
  const s = Settings.get();
  if (master) master.gain.value = s.muted ? 0 : s.volume;
  if (musicBus) musicBus.gain.value = s.music ? 0.32 : 0;
}

function init() {
  if (started || typeof window === "undefined") return;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  started = true;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.connect(master);
  applyVolume();
  Settings.subscribe(applyVolume);
}

function ready() {
  if (!started || !ctx || !sfxBus) return false;
  if (Settings.get().muted) return false;
  if (ctx.state === "suspended") void ctx.resume();
  return true;
}

function tone(o: ToneOpts, bus?: GainNode | null, when = 0) {
  if (!ready() || !ctx) return;
  const out = bus ?? sfxBus!;
  const {
    freq = 440,
    dur = 0.1,
    type = "square",
    vol = 0.2,
    attack = 0.005,
    release = 0.05,
    slide = 0,
  } = o;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.linearRampToValueAtTime(0, t0 + dur + release);
  osc.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + release + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise({ dur = 0.1, vol = 0.2, freq = 200, type = "lowpass" as BiquadFilterType, q = 2 }) {
  if (!ready() || !ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  s.connect(f).connect(g).connect(sfxBus!);
  s.start(0, Math.random() * 0.5);
  s.stop(ctx.currentTime + dur);
}

/** Rate-limit very frequent sounds so 300 enemies don't saturate the mixer */
function throttle(key: string, ms: number) {
  const now = performance.now();
  if ((lastPlay[key] ?? 0) + ms > now) return false;
  lastPlay[key] = now;
  return true;
}

export const SFX = {
  laser: () =>
    throttle("laser", 45) &&
    tone({ freq: 1200, dur: 0.05, type: "square", vol: 0.05, slide: -700 }),
  spread: () =>
    throttle("spread", 60) &&
    tone({ freq: 700, dur: 0.06, type: "sawtooth", vol: 0.05, slide: -300 }),
  missile: () =>
    throttle("missile", 70) && noise({ dur: 0.18, vol: 0.08, freq: 1400, type: "bandpass", q: 1 }),
  plasma: () =>
    throttle("plasma", 90) && tone({ freq: 220, dur: 0.22, type: "sine", vol: 0.14, slide: 420 }),
  zap: () =>
    throttle("zap", 70) &&
    tone({ freq: 1800, dur: 0.05, type: "sawtooth", vol: 0.05, slide: -1200 }),
  drone: () =>
    throttle("drone", 70) &&
    tone({ freq: 1600, dur: 0.03, type: "triangle", vol: 0.04, slide: -400 }),
  hit: () =>
    throttle("hit", 35) && tone({ freq: 240, dur: 0.04, type: "square", vol: 0.04, slide: -100 }),
  shieldHit: () =>
    throttle("shieldHit", 80) &&
    tone({ freq: 520, dur: 0.12, type: "sine", vol: 0.12, slide: 300 }),
  enemyDie: () => throttle("die", 40) && noise({ dur: 0.14, vol: 0.12, freq: 700 }),
  explode: () => {
    if (!throttle("explode", 70)) return;
    noise({ dur: 0.35, vol: 0.22, freq: 260, q: 3 });
    tone({ freq: 70, dur: 0.25, type: "sawtooth", vol: 0.14, slide: -40 });
  },
  bigExplode: () => {
    noise({ dur: 0.9, vol: 0.32, freq: 180, q: 2 });
    tone({ freq: 55, dur: 0.7, type: "sawtooth", vol: 0.22, slide: -30 });
  },
  pickup: () =>
    throttle("pickup", 30) &&
    tone({ freq: 1320, dur: 0.05, type: "triangle", vol: 0.07, slide: 600 }),
  power: () => {
    tone({ freq: 520, dur: 0.08, type: "square", vol: 0.12 });
    tone({ freq: 1040, dur: 0.12, type: "square", vol: 0.1 }, null, 0.08);
  },
  levelUp: () => {
    tone({ freq: 660, dur: 0.08, type: "square", vol: 0.12 });
    tone({ freq: 990, dur: 0.1, type: "square", vol: 0.12 }, null, 0.08);
    tone({ freq: 1320, dur: 0.14, type: "square", vol: 0.12 }, null, 0.18);
  },
  hurt: () => {
    if (!throttle("hurt", 90)) return;
    tone({ freq: 160, dur: 0.18, type: "sawtooth", vol: 0.18, slide: -80 });
    noise({ dur: 0.15, vol: 0.1, freq: 400 });
  },
  boost: () => {
    noise({ dur: 0.3, vol: 0.12, freq: 2200, type: "highpass", q: 0.7 });
    tone({ freq: 300, dur: 0.25, type: "sawtooth", vol: 0.06, slide: 600 });
  },
  die: () => tone({ freq: 220, dur: 0.6, type: "sawtooth", vol: 0.22, slide: -170 }),
  alarm: () => {
    for (let i = 0; i < 3; i++) {
      tone({ freq: 880, dur: 0.18, type: "square", vol: 0.12 }, null, i * 0.42);
      tone({ freq: 620, dur: 0.18, type: "square", vol: 0.12 }, null, i * 0.42 + 0.2);
    }
  },
  boss: () => {
    noise({ dur: 0.6, vol: 0.22, freq: 120, q: 5 });
    tone({ freq: 60, dur: 0.6, type: "sawtooth", vol: 0.2 });
  },
  bossShot: () =>
    throttle("bossShot", 90) &&
    tone({ freq: 380, dur: 0.08, type: "square", vol: 0.06, slide: -200 }),
  warn: () => throttle("warn", 250) && tone({ freq: 1000, dur: 0.06, type: "square", vol: 0.05 }),
  upgrade: () => {
    tone({ freq: 880, dur: 0.06, type: "triangle", vol: 0.12 });
    tone({ freq: 1320, dur: 0.1, type: "triangle", vol: 0.12 }, null, 0.06);
  },
  evolve: () => {
    [523, 784, 1047, 1568].forEach((f, i) =>
      tone({ freq: f, dur: 0.14, type: "square", vol: 0.12 }, null, i * 0.08),
    );
  },
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone({ freq: f, dur: 0.2, type: "square", vol: 0.14 }, null, i * 0.13),
    );
  },
  click: () => tone({ freq: 660, dur: 0.03, type: "square", vol: 0.08 }),
  coin: () => {
    tone({ freq: 988, dur: 0.05, type: "square", vol: 0.1 });
    tone({ freq: 1319, dur: 0.12, type: "square", vol: 0.1 }, null, 0.05);
  },
  error: () => tone({ freq: 140, dur: 0.12, type: "square", vol: 0.1 }),
};

/* ---------------- Music: minimal synthwave sequencer ---------------- */
const SCALE = [0, 3, 5, 7, 10, 12, 15];
let musicTimer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextTime = 0;
let intensity = 0; // 0 menu, 1 combat, 2 boss
const ROOTS = [45, 41, 43, 40]; // A, F, G, E (midi)
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function scheduleStep(t: number) {
  if (!ctx || !musicBus) return;
  const bar = Math.floor(step / 16) % ROOTS.length;
  const root = ROOTS[bar]!;
  const s = step % 16;
  const when = t - ctx.currentTime;
  // bass
  if (s % 2 === 0) {
    tone(
      {
        freq: midi(root - 12 + (s % 8 === 6 ? 12 : 0)),
        dur: 0.12,
        type: "sawtooth",
        vol: 0.18,
        release: 0.04,
      },
      musicBus,
      when,
    );
  }
  // arpeggio
  if (intensity >= 1 || s % 4 === 0) {
    const n = root + 12 + SCALE[(s * 3 + bar) % SCALE.length]!;
    tone({ freq: midi(n), dur: 0.07, type: "square", vol: 0.05, release: 0.05 }, musicBus, when);
  }
  // kick / hat via noise
  if (intensity >= 1 && s % 4 === 0) {
    tone({ freq: 120, dur: 0.08, type: "sine", vol: 0.35, slide: -80 }, musicBus, when);
  }
  if (intensity >= 2 && s % 2 === 1) {
    tone({ freq: midi(root + 24), dur: 0.04, type: "triangle", vol: 0.04 }, musicBus, when);
  }
  step++;
}

function musicTick() {
  if (!ctx) return;
  const bpm = intensity === 2 ? 150 : intensity === 1 ? 132 : 100;
  const stepDur = 60 / bpm / 4;
  while (nextTime < ctx.currentTime + 0.12) {
    scheduleStep(nextTime);
    nextTime += stepDur;
  }
}

export const Audio = {
  init,
  SFX,
  setMusic(level: 0 | 1 | 2) {
    intensity = level;
    if (!started || !ctx) return;
    if (!musicTimer) {
      nextTime = ctx.currentTime + 0.05;
      musicTimer = setInterval(musicTick, 40);
    }
  },
  stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  },
};
