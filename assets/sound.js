/* Sound for the scroll scene (Robin, 2026-10-28: "Rain, thunder, the breathing globe, scrolling, the 2 cores, passing
   through the portals and the final scene as well as the final transition"; then "minecraft bgm inspired sounds. These
   are a little jarring"). An original, generative score in that spirit: a slow, sparse felt piano wandering over a
   gentle C-major progression (Fmaj7, C/E, Am7, G6) under a soft pad and a long reverb, never the same twice; the scene
   sounds sit quietly under it and every event answers in piano notes rather than bursts. Everything is synthesised
   with the Web Audio API: no audio files, nothing fetched, nothing sent. Browsers allow sound only after a click or a
   key press, so it starts off; the Sound button turns it on, and the choice is remembered on this device (the next
   visit starts it at the first click or key press). app.js calls update() every frame and the one-shots on events. */
const KEY = 'skullshock3r-sound';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const RINGS = [0.39, 0.48, 0.56];   // toEnd at which each ring of the gate sweeps past the edges (ringgate.js timing)
// the progression (MIDI): bass root, pad voicing, melody chord tones; four bars of about 2.6 s each
const CHORDS = [
  { root: 41, pad: [53, 57, 60, 64], tones: [65, 69, 72, 76] },   // Fmaj7
  { root: 40, pad: [52, 55, 60, 64], tones: [64, 67, 72, 76] },   // C/E
  { root: 45, pad: [52, 55, 57, 60], tones: [64, 67, 69, 72] },   // Am7
  { root: 43, pad: [50, 55, 59, 64], tones: [62, 67, 71, 74] }    // G6
];
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];            // C major pentatonic, two octaves
const BAR = 2.6;

export function createSound(button) {
  let ac = null, on = false, want = false, lastSet = 0, rainAcc = 0;
  try { want = localStorage.getItem(KEY) === 'on'; } catch (e) { /* storage blocked: start off */ }
  const S = {};
  const prev = { flash: 0, collapse: 0, toEnd: 0, coreReveal: 0 };
  let arrivedAtAc = -10;   // audio-clock time of the cores' arrival chime
  const music = { next: 0, chordAt: 0, chord: 0, note: 67, lift: 0 };

  /* ---- building blocks ---- */
  const gain = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, q) => { const n = ac.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q; return n; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
  const gainTo = (v, into) => { const g = gain(v); g.connect(into); return g; };
  function noiseBuffer(sec) {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function impulse(sec, decay) {   // a soft, wide synthetic hall
    const len = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.35; d[i] = lp * Math.pow(1 - i / len, decay); }
    }
    return b;
  }
  function loopNoise() {
    const s = ac.createBufferSource();
    s.buffer = S.noise; s.loop = true; s.start(0, Math.random() * 2);
    return s;
  }
  function osc(type, f, level, into) {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
    const g = gain(level); o.connect(g); g.connect(into); o.start();
    return o;
  }
  function pan(p, into) { const n = ac.createStereoPanner ? ac.createStereoPanner() : null; if (!n) return into; n.pan.value = p; n.connect(into); return n; }
  function set(param, v, tc) { param.setTargetAtTime(v, ac.currentTime, tc || 0.12); }

  /* a felt piano note: a few soft partials, the upper ones dying first, through a dark filter into the hall */
  function piano(m, when, vel, p) {
    const t = Math.max(when, ac.currentTime), f = hz(m), v = vel * (m > 84 ? 0.6 : 1);
    const out = filt('lowpass', 1400 + 1800 * vel, 0.5);
    chain(out, pan(p || 0, S.music));
    [[1, 1, 4.2], [2, 0.32, 2.4], [3, 0.1, 1.4], [4, 0.05, 0.9]].forEach(([k, a, dec]) => {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f * k * (1 + (k > 1 ? 0.0008 * k : 0));
      const g = gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * a, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec * (m < 50 ? 1.4 : 1));
      chain(o, g, out);
      o.start(t); o.stop(t + dec * 1.4 + 0.1);
    });
  }
  function arpeggio(notes, when, gap, vel) { notes.forEach((m, i) => piano(m, when + i * gap, vel, (i / Math.max(1, notes.length - 1) - 0.5) * 0.6)); }
  // a soft swell of filtered noise (the rings, the loop): no bursts
  function swell(o) {
    const t = ac.currentTime + (o.delay || 0), dur = o.dur;
    const s = ac.createBufferSource(); s.buffer = S.noise;
    const f = filt('lowpass', o.f, 0.5);
    if (o.fTo) { f.frequency.setValueAtTime(o.f, t); f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur * 0.7); }
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.peak, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t + dur);
    chain(s, f, g, pan(o.pan || 0, S.bus));
    g.connect(gainTo(0.5, S.verbIn));
    s.start(t, Math.random() * 2, dur + 0.05);
  }

  /* ---- the graph ---- */
  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
    comp.connect(ac.destination);
    S.master = gain(0); S.master.connect(comp);
    S.bus = gain(1); S.bus.connect(S.master);
    S.verb = ac.createConvolver(); S.verb.buffer = impulse(4.5, 2.2);
    S.verbIn = gain(1); chain(S.verbIn, S.verb, gain(0.7), S.master);
    S.noise = noiseBuffer(3);
    // the score: piano and pad share a bus with a generous send to the hall
    S.music = gain(0.55); S.music.connect(S.bus); S.music.connect(gainTo(0.75, S.verbIn));
    S.padF = filt('lowpass', 500, 0.4); S.pad = gain(0);
    S.padV = [0, 1, 2, 3].map((i) => {
      const a = ac.createOscillator(), b = ac.createOscillator();
      a.type = 'sine'; b.type = 'triangle';
      a.frequency.value = b.frequency.value = hz(CHORDS[0].pad[i]);
      b.detune.value = i % 2 ? 6 : -6;
      a.connect(gainTo(0.5, S.padF)); b.connect(gainTo(0.12, S.padF)); a.start(); b.start();
      return [a, b];
    });
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07; lfo.connect(gainTo(120, S.padF.frequency)); lfo.start();
    chain(S.padF, S.pad, S.music);

    // rain: a soft, dark hiss and a few quiet drops
    S.rain = gain(0); chain(loopNoise(), filt('highpass', 300), filt('lowpass', 3200), S.rain, S.bus);
    // scroll: a low, airy breeze
    S.windF = filt('lowpass', 300, 0.3); S.wind = gain(0); chain(loopNoise(), S.windF, S.wind, S.bus);
    // the globe's breath: a hushed air that swells with its light (it also opens the pad)
    S.breathF = filt('bandpass', 500, 0.8); S.breath = gain(0); chain(loopNoise(), S.breathF, S.breath, S.bus);
    S.breath.connect(gainTo(0.5, S.verbIn));
    // and its voice (Robin, 2026-10-28: "I cant seem to hear the globe breathing ... something that musically fits
    // into the score"): a soft "oo" on the current chord's upper two notes that swells in as the shell opens and sighs
    // away as it closes, every 4.5 s, following the chords
    S.voiceF = filt('bandpass', 700, 0.9); S.voice = gain(0);
    const vib = ac.createOscillator(); vib.frequency.value = 4.6; vib.start();
    S.voiceV = [2, 3].map((k, i) => {
      const o = ac.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = hz(CHORDS[0].pad[k] + 12);
      vib.connect(gainTo(3, o.detune));   // a gentle vibrato, about 3 cents
      o.connect(gainTo(i ? 0.5 : 0.35, S.voiceF)); o.start();
      return { o, k };
    });
    chain(S.voiceF, S.voice, S.music);
    // the two cores: a quiet sine glow each, J.A.R.V.I.S. on G (left), E.V. on C (right)
    S.core = [[55, 67], [60, 72]].map((ms, i) => {
      const g = gain(0), trem = gain(0.8);
      ms.forEach((m, k) => osc('sine', hz(m) * (1 + (i ? 0.0015 : -0.0015)), k ? 0.35 : 0.6, trem));
      const l = ac.createOscillator(); l.frequency.value = i ? 0.23 : 0.17; l.connect(gainTo(0.2, trem.gain)); l.start();
      chain(trem, g, pan(i ? 0.4 : -0.4, S.bus));
      g.connect(gainTo(0.4, S.verbIn));
      return { g, hot: false };
    });
    // the ring gate: a slow, dark rush under the dive
    S.riseF = filt('lowpass', 300, 0.5); S.rise = gain(0); chain(loopNoise(), S.riseF, S.rise, S.bus);
    S.rise.connect(gainTo(0.5, S.verbIn));
    // the chamber: the grains as a faint shimmer
    S.grains = gain(0); chain(loopNoise(), filt('bandpass', 6000, 0.6), S.grains, S.bus);
    music.next = ac.currentTime + 0.6; music.chordAt = ac.currentTime;
  }

  /* ---- the score ---- */
  function nextChord() {
    music.chord = (music.chord + 1) % CHORDS.length;
    const c = CHORDS[music.chord];
    S.padV.forEach(([a, b], i) => { set(a.frequency, hz(c.pad[i]), 0.5); set(b.frequency, hz(c.pad[i]), 0.5); });
    S.voiceV.forEach((v) => set(v.o.frequency, hz(c.pad[v.k] + 12), 0.4));
    if (Math.random() < 0.8) piano(c.root - 12 * (Math.random() < 0.5 ? 0 : 1) + 12, music.chordAt, 0.22, -0.15);   // a soft low root
  }
  function melody(at, density, lift) {
    const c = CHORDS[music.chord];
    // mostly chord tones, sometimes a neighbour in the scale; small steps, now and then a leap
    const pool = Math.random() < 0.7 ? c.tones.map((m) => m + lift) : SCALE.map((m) => m + lift);
    const near = pool.slice().sort((a, b) => Math.abs(a - music.note) - Math.abs(b - music.note));
    let m = Math.random() < 0.8 ? near[Math.floor(Math.random() * Math.min(3, near.length))] : pool[Math.floor(Math.random() * pool.length)];
    if (m === music.note && Math.random() < 0.6) m = near[1] || m;
    music.note = clamp(m, 57 + lift, 86);
    piano(music.note, at, 0.18 + Math.random() * 0.12, (Math.random() - 0.5) * 0.5);
    if (Math.random() < 0.18) piano(music.note - (Math.random() < 0.5 ? 5 : 3), at + 0.02, 0.1, 0.2);   // a quiet dyad
    // unhurried: long gaps and rests, a little busier where the scene invites it
    const gaps = [0.65, 1.3, 1.3, 1.95, 2.6];
    return gaps[Math.floor(Math.random() * gaps.length)] / density + (Math.random() < 0.22 ? BAR : 0);
  }
  function score(s) {
    const now = ac.currentTime;
    while (music.chordAt + BAR * 2 <= now + 0.1) { music.chordAt += BAR * 2; nextChord(); }
    if (now + 0.15 >= music.next) {
      const density = 0.9 + 0.4 * s.end + 0.2 * s.coreReveal;
      music.next = Math.max(music.next, now) + melody(Math.max(music.next, now + 0.02), density, s.end > 0.5 ? 12 : 0);
    }
  }

  /* ---- events ---- */
  function thunder(strength, delay) {
    // far off: only the roll, low and slow, never a crack
    const k = clamp(strength, 0.2, 1);
    for (let i = 0; i < 3; i++) swell({ f: 90 + i * 15, fTo: 50, dur: 3 + Math.random() * 2, peak: (0.3 - i * 0.06) * k, delay: delay + i * (0.4 + Math.random() * 0.5), pan: (Math.random() - 0.5) * 0.6 });
  }
  function drop() {
    const t = ac.currentTime + Math.random() * 0.05;
    const s = ac.createBufferSource(); s.buffer = S.noise;
    const f = filt('bandpass', 900 + Math.random() * 2200, 2), g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.015 + Math.random() * 0.03, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    chain(s, f, g, pan((Math.random() - 0.5) * 1.4, S.bus));
    s.start(t, Math.random() * 2, 0.08);
  }
  const corePitch = [[67, 74, 79], [72, 76, 79]];   // G and C, as their glows
  function chime(i, soft, delay) {
    const now = ac.currentTime + (delay || 0);
    if (soft) piano(corePitch[i][0] + 12, now, 0.14, i ? 0.4 : -0.4);
    else arpeggio(corePitch[i], now, 0.16, 0.2);
  }
  // each ring that sweeps past breathes a low, warm swell of the current chord, a step higher for each ring, like the
  // pad leaning in (Robin, 2026-10-28: "Remove the ping ping ping as we pass through the portals")
  function ringPass(i, dir) {
    const t = ac.currentTime, c = CHORDS[music.chord], step = dir > 0 ? i : 2 - i;
    const notes = [c.pad[0] + 12 * Math.floor(step / 2), c.pad[1 + step % 2], c.pad[3]].map((m) => hz(m));
    const f = filt('lowpass', 300, 0.5), g = gain(0);
    f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1100 + 250 * step, t + 0.8); f.frequency.linearRampToValueAtTime(400, t + 2.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.7); g.gain.linearRampToValueAtTime(0, t + 2.4);
    notes.forEach((fr, k) => [['sine', 0.5], ['triangle', 0.15]].forEach(([ty, l]) => {
      const o = ac.createOscillator(); o.type = ty; o.frequency.value = fr; o.detune.value = (k - 1) * 4;
      o.connect(gainTo(l, f)); o.start(t); o.stop(t + 2.5);
    }));
    chain(f, g, pan((i % 2 ? 1 : -1) * 0.3, S.music));
    swell({ f: 250, fTo: 800, dur: 1.6, peak: 0.04, pan: (i % 2 ? 1 : -1) * 0.4 });
  }
  function settle() {   // the globe collapsing into the cores
    piano(36, ac.currentTime, 0.3, 0); piano(43, ac.currentTime + 0.05, 0.18, 0.1);
  }
  function shapeNotes() {
    const c = CHORDS[music.chord];
    arpeggio(c.tones.map((m) => m + 12), ac.currentTime, 0.12, 0.13);
  }

  /* ---- on and off ---- */
  function label() {
    button.textContent = on ? 'Sound on' : 'Sound off';
    button.classList.toggle('on', on);   // the label says the state; no aria-pressed, so it never reads "Sound on, pressed"
  }
  function setOn(v) {
    on = v; want = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) { /* not remembered: fine */ }
    if (v) {
      if (!ac) build();
      ac.resume();
      music.next = Math.max(music.next, ac.currentTime + 0.5);
      set(S.master.gain, 0.9, 0.8);
    } else if (ac) {
      set(S.master.gain, 0, 0.15);
      setTimeout(() => { if (!on && ac) ac.suspend(); }, 900);
    }
    label();
  }
  button.addEventListener('click', () => setOn(!on));
  // remembered as on: the first click or key press anywhere else starts it
  function wake(e) {
    if (e.target === button) return;
    removeEventListener('pointerdown', wake); removeEventListener('keydown', wake);
    if (want && !on) setOn(true);
  }
  if (want) { addEventListener('pointerdown', wake); addEventListener('keydown', wake); }
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else if (on) ac.resume();
  });
  button.hidden = false;
  label();

  /* ---- every frame ----
     s: t (timeline 0..4), dt, time, vel (timeline speed), flash and flashScale (lightning), globeLight, globeShown,
     collapse, toEnd, coreReveal, end (the chamber's presence), loopWhite */
  function update(s) {
    if (!on || !ac) { prev.coreReveal = s.coreReveal; return; }   // so turning sound on at the cores does not chime
    score(s);
    const rain = (1 - 0.35 * smooth(0.5, 1.5, s.t)) * (1 - smooth(3.3, 3.6, s.t)) * (1 - s.loopWhite);
    // lightning: a distant roll follows the flash
    if (prev.flash < 0.25 && s.flash >= 0.25 && rain > 0.1) thunder(s.flashScale * rain, 0.6 + Math.random() * 1.4);
    prev.flash = s.flash;
    // a few drops landing nearby, about 14 a second in full rain
    rainAcc += 14 * rain * s.dt;
    let n = 0;
    while (rainAcc >= 1 && n++ < 3) { drop(); rainAcc -= 1; }
    if (rainAcc > 3) rainAcc = 0;
    if (prev.collapse < 0.6 && s.collapse >= 0.6) settle();
    prev.collapse = s.collapse;
    // the cores answer as the scroll arrives at them, J.A.R.V.I.S. then E.V. (Robin, 2026-10-28: silent on his phone):
    // on a computer it came only from the resting mouse passing over a core, and a phone has no hover, so the arrival
    // itself now plays it on every device
    if (prev.coreReveal < 0.8 && s.coreReveal >= 0.8) { chime(0, false); chime(1, false, 0.55); arrivedAtAc = ac.currentTime; }
    prev.coreReveal = s.coreReveal;
    RINGS.forEach((r, i) => { if ((prev.toEnd - r) * (s.toEnd - r) < 0) ringPass(i, s.toEnd > prev.toEnd ? 1 : -1); });
    prev.toEnd = s.toEnd;

    // the beds change gently, about 30 times a second
    if (s.time - lastSet < 0.033) return;
    lastSet = s.time;
    const speed = clamp(Math.abs(s.vel) * 0.55, 0, 1);
    set(S.rain.gain, 0.05 * rain, 0.4);
    set(S.wind.gain, 0.09 * speed, 0.25);
    set(S.windF.frequency, 220 + 700 * speed, 0.25);
    const L = clamp(s.globeLight, 0, 1.5), g = s.globeShown ? 1 - smooth(0.5, 0.95, s.collapse) : 0;
    set(S.breath.gain, g * 0.03 * L, 0.3);
    set(S.breathF.frequency, 380 + 400 * L, 0.3);
    // the voice breathes with the globe; once it parts and holds its light open, it settles to a quiet held note
    const held = smooth(1.05, 1.4, s.t);
    set(S.voice.gain, g * Math.pow(Math.min(L, 1), 1.5) * 0.11 * (1 - 0.6 * held), 0.35);
    set(S.voiceF.frequency, 550 + 450 * L, 0.35);
    // the pad: always there, a touch warmer as the globe shines and in the chamber
    set(S.pad.gain, 0.05 + 0.03 * g * L + 0.02 * s.end, 0.6);
    set(S.padF.frequency, 420 + 500 * g * L + 400 * s.end, 0.6);
    S.core.forEach((c) => set(c.g.gain, s.coreReveal * (c.hot ? 0.05 : 0.022), 0.3));
    const gate = s.toEnd > 0.12 && s.toEnd < 0.64 ? Math.sin(Math.PI * (s.toEnd - 0.12) / 0.52) : 0;
    set(S.rise.gain, 0.06 * gate * (0.4 + 0.6 * speed), 0.25);
    set(S.riseF.frequency, 250 + 900 * clamp((s.toEnd - 0.12) / 0.52, 0, 1), 0.25);
    set(S.grains.gain, s.end * (1 - s.loopWhite) * (0.004 + 0.012 * speed), 0.3);
  }

  return {
    update,
    // (no hover note within 2 s of the arrival chime, so a mouse resting where a core lands does not double it)
    hover(i) { if (on && ac && S.core[i] && !S.core[i].hot && ac.currentTime - arrivedAtAc > 2) chime(i, true); if (ac) S.core[i].hot = true; },
    unhover(i) { if (ac && S.core[i]) S.core[i].hot = false; },
    sheet(open, key) {
      if (!on || !ac) return;
      if (open) chime(key === 'ev' ? 1 : 0, false);
      else piano(60, ac.currentTime, 0.1, 0);
    },
    shape() { if (on && ac) shapeNotes(); },
    // the loop back round: a slow breath of air into the whiteout, then a rising arpeggio as the opening returns
    loop() {
      if (!on || !ac) return;
      swell({ f: 300, fTo: 1400, dur: 1.4, peak: 0.08 });
      arpeggio([48, 55, 60, 64, 67, 72], ac.currentTime + 0.5, 0.18, 0.18);
    }
  };
}
