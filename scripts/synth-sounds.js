// Synthesizes Timber's reward sounds as 16-bit mono WAVs.
const fs = require('fs');
const path = require('path');
const SR = 44100;
const out = process.argv[2];

function render(len, notes, { reverb = 0.25, gain = 0.9, lowpass = 0 } = {}) {
  const buf = new Float32Array(Math.floor(len * SR));
  for (const n of notes) {
    const start = Math.floor(n.t * SR);
    const dur = Math.min(buf.length - start, Math.floor(n.decay * 6 * SR));
    for (let i = 0; i < dur; i++) {
      const t = i / SR;
      const attack = Math.min(1, t / (n.attack ?? 0.004));
      // Optional glide: frequency moves from f to f * glide over `glideTime` seconds.
      const g = n.glide ? Math.pow(n.glide, Math.min(1, t / (n.glideTime ?? 0.08))) : 1;
      n.phase = (n.phase ?? 0) + (2 * Math.PI * n.f * g) / SR;
      let s = 0;
      for (const [ratio, amp, dMul = 1] of n.partials) {
        s += amp * Math.sin(n.phase * ratio) * Math.exp(-t / (n.decay * dMul));
      }
      buf[start + i] += s * attack * (n.v ?? 1);
    }
  }
  // Two-tap feedback delay for a little air.
  for (const [ms, fb] of [
    [37, reverb],
    [83, reverb * 0.7],
  ]) {
    const d = Math.floor((ms / 1000) * SR);
    for (let i = d; i < buf.length; i++) buf[i] += buf[i - d] * fb;
  }
  // One-pole low-pass (Hz) rounds off the attack so nothing sounds sharp.
  if (lowpass) {
    const a = Math.exp((-2 * Math.PI * lowpass) / SR);
    for (let pass = 0; pass < 2; pass++) {
      let y = 0;
      for (let i = 0; i < buf.length; i++) buf[i] = y = (1 - a) * buf[i] + a * y;
    }
  }
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  // Fade the tail to avoid clicks.
  const fade = Math.floor(0.05 * SR);
  for (let i = 0; i < fade; i++) buf[buf.length - 1 - i] *= i / fade;
  return buf.map((v) => (v / peak) * gain);
}

function wav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2)
  );
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(out, name), Buffer.concat([h, data]));
}

const hz = (semis) => 440 * Math.pow(2, semis / 12); // semitones from A4
const C5 = hz(3),
  E5 = hz(7),
  G5 = hz(10),
  A5 = hz(12),
  C6 = hz(15),
  E6 = hz(19),
  G4 = hz(-2),
  C4 = hz(-9);
// Kalimba-like: nearly pure tone with soft, quickly-fading overtones. No inharmonic bell partials.
const kalimba = [
  [1, 1],
  [2, 0.12, 0.35],
  [3, 0.04, 0.25],
];
const warm = [
  [1, 1],
  [2, 0.3, 0.7],
  [3, 0.1, 0.5],
];

// tick: a soft wooden "tok" for a partial check-in.
wav(
  'tick.wav',
  render(0.3, [{ t: 0, f: A5, decay: 0.045, partials: kalimba, attack: 0.003 }], {
    reverb: 0.12,
    gain: 0.45,
    lowpass: 3500,
  })
);

// Completion chimes (user-selectable in Settings). All gentle, all under ~1.2s.
// kalimba (default): a gentle rising major third.
wav(
  'chime-kalimba.wav',
  render(
    1.1,
    [
      { t: 0, f: C5, decay: 0.28, partials: kalimba, attack: 0.008, v: 0.85 },
      { t: 0.11, f: E5, decay: 0.34, partials: kalimba, attack: 0.008 },
      { t: 0.11, f: C4, decay: 0.3, partials: kalimba, attack: 0.02, v: 0.25 },
    ],
    { reverb: 0.22, gain: 0.55, lowpass: 2800 }
  )
);

// perfect: a warm, unhurried arpeggio when every habit is done today.
wav(
  'perfect.wav',
  render(
    1.8,
    [
      { t: 0.0, f: C5, decay: 0.3, partials: kalimba, attack: 0.01, v: 0.8 },
      { t: 0.1, f: E5, decay: 0.3, partials: kalimba, attack: 0.01, v: 0.85 },
      { t: 0.2, f: G5, decay: 0.32, partials: kalimba, attack: 0.01, v: 0.9 },
      { t: 0.32, f: C6, decay: 0.5, partials: kalimba, attack: 0.01 },
      { t: 0.32, f: C4, decay: 0.5, partials: warm, attack: 0.03, v: 0.3 },
    ],
    { reverb: 0.28, gain: 0.6, lowpass: 3000 }
  )
);

// fanfare: a rise into a held, soft major chord for a finished challenge.
wav(
  'fanfare.wav',
  render(
    3.0,
    [
      { t: 0.0, f: G4, decay: 0.2, partials: warm, v: 0.6, attack: 0.015 },
      { t: 0.14, f: C5, decay: 0.2, partials: warm, v: 0.65, attack: 0.015 },
      { t: 0.28, f: E5, decay: 0.2, partials: warm, v: 0.7, attack: 0.015 },
      { t: 0.46, f: C4, decay: 0.8, partials: warm, v: 0.45, attack: 0.03 },
      { t: 0.46, f: C5, decay: 0.8, partials: warm, v: 0.6, attack: 0.03 },
      { t: 0.46, f: E5, decay: 0.8, partials: warm, v: 0.5, attack: 0.03 },
      { t: 0.46, f: G5, decay: 0.8, partials: warm, v: 0.5, attack: 0.03 },
      { t: 0.56, f: C6, decay: 0.6, partials: kalimba, v: 0.4, attack: 0.01 },
      { t: 0.7, f: E6, decay: 0.5, partials: kalimba, v: 0.25, attack: 0.01 },
    ],
    { gain: 0.65, reverb: 0.3, lowpass: 3200 }
  )
);

const G6 = hz(22),
  B6 = hz(26),
  E7 = hz(31);
const wood = [
  [1, 1],
  [4, 0.28, 0.2],
  [9.8, 0.05, 0.1],
];
const pureBell = [
  [1, 1],
  [2, 0.3, 0.6],
  [3, 0.08, 0.4],
];
const glassy = [
  [1, 1],
  [2.01, 0.2, 0.5],
  [4.02, 0.06, 0.3],
];

// marimba: two warm wooden taps.
wav(
  'chime-marimba.wav',
  render(
    0.9,
    [
      { t: 0, f: G5, decay: 0.12, partials: wood, attack: 0.002, v: 0.85 },
      { t: 0.1, f: C6, decay: 0.16, partials: wood, attack: 0.002 },
    ],
    { reverb: 0.2, gain: 0.55, lowpass: 3200 }
  )
);

// bell: one soft, round bell with a fifth underneath.
wav(
  'chime-bell.wav',
  render(
    1.4,
    [
      { t: 0, f: G5, decay: 0.38, partials: pureBell, attack: 0.006 },
      { t: 0, f: C5, decay: 0.34, partials: pureBell, attack: 0.01, v: 0.35 },
    ],
    { reverb: 0.25, gain: 0.5, lowpass: 2600 }
  )
);

// bubble: two playful rising pops.
wav(
  'chime-bubble.wav',
  render(
    0.6,
    [
      { t: 0, f: 380, glide: 2.1, glideTime: 0.07, decay: 0.05, partials: [[1, 1]], attack: 0.002 },
      {
        t: 0.11,
        f: 520,
        glide: 2.1,
        glideTime: 0.07,
        decay: 0.06,
        partials: [[1, 1]],
        attack: 0.002,
      },
    ],
    { reverb: 0.15, gain: 0.5, lowpass: 3000 }
  )
);

// harp: a quick upward glissando (unlocks at level 5).
wav(
  'chime-harp.wav',
  render(
    1.3,
    [C5, E5, G5, C6, E6].map((f, i) => ({
      t: i * 0.055,
      f,
      decay: 0.28,
      partials: kalimba,
      attack: 0.004,
      v: 0.7 + i * 0.07,
    })),
    { reverb: 0.28, gain: 0.55, lowpass: 3200 }
  )
);

// crystal: a shimmering high triad (unlocks at level 12).
wav(
  'chime-crystal.wav',
  render(
    1.5,
    [
      { t: 0, f: E6, decay: 0.4, partials: glassy, attack: 0.008, v: 0.7 },
      { t: 0.07, f: G6, decay: 0.42, partials: glassy, attack: 0.008, v: 0.6 },
      { t: 0.14, f: B6, decay: 0.45, partials: glassy, attack: 0.008, v: 0.55 },
      { t: 0.14, f: E7, decay: 0.3, partials: [[1, 1]], attack: 0.01, v: 0.18 },
    ],
    { reverb: 0.3, gain: 0.45, lowpass: 3600 }
  )
);
