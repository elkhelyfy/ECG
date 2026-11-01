/* Moteur de synthèse ECG.
   Modèle dipolaire : l'activité électrique du cœur est une suite de vecteurs (x = gauche,
   y = bas, z = avant). Chaque dérivation est un axe ; le signal = projection du vecteur sur cet axe. */
(function (root) {
  'use strict';

  const FS = 500;
  const D2R = Math.PI / 180;
  const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const LIMB = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];
  const PRECORD = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const FRONTAL_ANGLE = { I: 0, II: 60, III: 120, aVR: -150, aVL: -30, aVF: 90 };
  const HORIZ_ANGLE = { V1: 115, V2: 95, V3: 75, V4: 55, V5: 30, V6: 5 };
  const PRE_GAIN = { V1: 1.0, V2: 1.5, V3: 1.6, V4: 1.5, V5: 1.2, V6: 0.95 };
  const PRE_Y = { V1: 0, V2: 0, V3: 0.05, V4: 0.12, V5: 0.18, V6: 0.22 };

  const LV = {};
  LIMB.forEach(l => {
    const m = l[0] === 'a' ? 0.866 : 1, a = FRONTAL_ANGLE[l] * D2R;
    LV[l] = [Math.cos(a) * m, Math.sin(a) * m, 0];
  });
  PRECORD.forEach(l => {
    const a = HORIZ_ANGLE[l] * D2R, g = PRE_GAIN[l];
    LV[l] = [Math.cos(a) * g, PRE_Y[l] * g, Math.sin(a) * g];
  });
  LV.X = [1, 0, 0]; LV.Y = [0, 1, 0]; LV.Z = [0, 0, 1];

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randn(r) {
    let u = 0; while (!u) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }

  /* ---------- Morphologies ---------- */
  // composante : centre t (s), largeur w avant / w2 après le pic, vecteur v (mV)
  const C = (t, w, v, w2) => ({ t, w, w2: w2 || w, v });
  const SEPT = C(0.012, 0.006, [-0.12, 0.05, 0.2]);
  const M1 = C(0.034, 0.0095, [0.5, 0.6, 0.45]);
  const M2 = C(0.05, 0.0105, [0.65, 0.45, -0.55]);
  const TERM = C(0.072, 0.008, [-0.25, -0.2, -0.25]);
  const P_NORMAL = { comps: [C(0.035, 0.016, [0.05, 0.13, 0.07]), C(0.07, 0.016, [0.12, 0.08, -0.045])], dur: 0.11 };

  const BASE = {
    p: P_NORMAL,
    qrs: { comps: [SEPT, M1, M2, TERM], dur: 0.09 },
    t: { comps: [C(0, 0.05, [0.22, 0.25, 0.22], 0.032)] },
    u: null, qtc: 0.40, tEnd: 0.075, injury: null, stShape: 'convex', extras: null, spike: false
  };
  const morph = o => Object.assign({}, BASE, o);
  const scaleV = (c, k) => C(c.t, c.w, c.v.map(x => x * k), c.w2);

  const MORPHS = {
    normal: BASE,
    ectopicP: morph({ p: { comps: [C(0.03, 0.016, [0.08, -0.07, 0.05]), C(0.062, 0.016, [0.08, -0.05, -0.03])], dur: 0.1 } }),
    retro: morph({ p: { comps: [C(0.02, 0.012, [-0.03, -0.13, 0.06])], dur: 0.05 } }),
    // P rétrograde lente et profonde (voie accessoire décrémentielle, PJRT)
    retroDeep: morph({ p: { comps: [C(0.035, 0.019, [-0.05, -0.17, 0.06])], dur: 0.09 } }),
    // P d'un foyer atrial bas : négative en inférieur, positive en DI
    atrialP: morph({ p: { comps: [C(0.03, 0.016, [0.07, -0.12, 0.05]), C(0.065, 0.016, [0.06, -0.08, -0.02])], dur: 0.1 } }),
    // 4e morphologie de P (tachycardie atriale multifocale) : étroite et pointue
    mat3: morph({ p: { comps: [C(0.035, 0.013, [0.0, 0.2, 0.12])], dur: 0.08 } }),
    // QRS entièrement pré-excité (TRAV antidromique, FA pré-excitée) : delta maximale
    preex: morph({
      qrs: { comps: [C(0.05, 0.022, [0.25, 0.45, 0.7], 0.03), C(0.105, 0.02, [0.35, 0.3, 0.25]), C(0.14, 0.01, [-0.1, -0.08, -0.1])], dur: 0.16 },
      t: { comps: [C(0, 0.06, [-0.15, -0.3, -0.3], 0.045)] }, qtc: 0.44
    }),
    pvc: morph({
      qrs: { comps: [C(0.04, 0.022, [0.25, 0.55, -0.7]), C(0.095, 0.022, [0.55, 0.35, -0.3])], dur: 0.15 },
      t: { comps: [C(0, 0.06, [-0.3, -0.35, 0.3], 0.045)] }, qtc: 0.44
    }),
    vt: morph({
      qrs: { comps: [C(0.045, 0.024, [0.55, -0.55, 0.6]), C(0.105, 0.022, [0.35, -0.6, 0.3])], dur: 0.16 },
      t: { comps: [C(0, 0.05, [-0.3, 0.35, -0.3], 0.04)] }, qtc: 0.42
    }),
    escape: morph({
      qrs: { comps: [C(0.04, 0.024, [0.5, 0.3, -0.5]), C(0.1, 0.024, [0.45, 0.25, -0.45])], dur: 0.15 },
      t: { comps: [C(0, 0.06, [-0.25, -0.15, 0.3], 0.045)] }, qtc: 0.44
    }),
    bbd: morph({
      qrs: { comps: [SEPT, M1, scaleV(M2, 0.9), C(0.105, 0.018, [-0.45, 0.05, 0.55])], dur: 0.135 },
      t: { comps: [C(0, 0.05, [0.25, 0.25, -0.12], 0.032)] }
    }),
    bbg: morph({
      qrs: { comps: [C(0.02, 0.014, [0.45, 0.1, -0.35]), C(0.055, 0.018, [0.75, 0.3, -0.55]), C(0.115, 0.018, [0.85, 0.15, -0.5])], dur: 0.15 },
      t: { comps: [C(0, 0.06, [-0.3, -0.1, 0.42], 0.042)] },
      injury: [-0.1, -0.03, 0.13], qtc: 0.44
    }),
    hbag: morph({
      qrs: { comps: [C(0.015, 0.008, [-0.08, 0.22, 0.15]), C(0.04, 0.012, [0.45, -0.7, 0.3]), C(0.062, 0.012, [0.5, -0.6, -0.5]), C(0.08, 0.008, [-0.1, -0.1, -0.15])], dur: 0.1 },
      t: { comps: [C(0, 0.05, [0.25, 0.05, 0.2], 0.032)] }
    }),
    hvg: morph({
      qrs: { comps: [SEPT, C(0.036, 0.011, [0.75, 0.75, 0.6]), C(0.056, 0.012, [1.55, 0.55, -1.35]), TERM], dur: 0.1 },
      t: { comps: [C(0, 0.055, [-0.22, -0.02, 0.2], 0.035)] },
      injury: [-0.09, -0.01, 0.06], stShape: 'ramp'
    }),
    wpw: morph({
      qrs: { comps: [C(0.03, 0.024, [0.3, 0.25, 0.65]), C(0.06, 0.0095, [0.5, 0.6, 0.45]), C(0.076, 0.0105, [0.65, 0.45, -0.45]), C(0.096, 0.008, [-0.25, -0.2, -0.25])], dur: 0.125 },
      t: { comps: [C(0, 0.05, [0.05, 0.15, -0.12], 0.035)] }
    }),
    stemiAnt: morph({
      qrs: { comps: [C(0.012, 0.006, [-0.12, 0.05, 0.05]), C(0.034, 0.0095, [0.5, 0.6, 0.2]), M2, TERM], dur: 0.09 },
      t: { comps: [C(0, 0.045, [0.22, 0.18, 0.45], 0.035)] },
      injury: [0.15, -0.1, 0.35]
    }),
    stemiInf: morph({
      t: { comps: [C(0, 0.045, [0.15, 0.45, 0.05], 0.035)] },
      injury: [-0.1, 0.3, -0.08]
    }),
    scaMoins: morph({
      t: { comps: [C(0, 0.05, [0.1, 0.12, 0.12], 0.032)] },
      injury: [-0.12, -0.12, 0], stShape: 'flat'
    }),
    wellens: morph({ t: { comps: [C(0, 0.045, [0.2, 0.2, -0.35], 0.045)] } }),
    necInf: morph({
      qrs: { comps: [C(0.02, 0.013, [0.1, -0.4, 0.15]), C(0.045, 0.011, [0.55, 0.15, 0.3]), C(0.062, 0.011, [0.6, 0.25, -0.55]), TERM], dur: 0.1 },
      t: { comps: [C(0, 0.05, [0.3, -0.12, 0.2], 0.04)] }
    }),
    peri: morph({ injury: [0.15, 0.2, 0.12], stShape: 'concave' }),
    periP: morph({ p: { comps: P_NORMAL.comps, dur: 0.11, ta: [-0.03, -0.06, -0.02] } }),
    hyperk: morph({
      qrs: { comps: [SEPT, M1, M2, TERM].map(c => C(c.t * 1.18, c.w * 1.25, c.v, c.w2 * 1.25)), dur: 0.11 },
      t: { comps: [C(0, 0.03, [0.42, 0.5, 0.6], 0.028)] }, qtc: 0.38, tEnd: 0.06
    }),
    hyperkP: morph({ p: { comps: P_NORMAL.comps.map(c => C(c.t * 1.2, 0.022, c.v.map(x => x * 0.45))), dur: 0.13 } }),
    hypok: morph({
      t: { comps: [C(0, 0.06, [0.06, 0.07, 0.06], 0.04)] },
      u: { comps: [C(0.17, 0.04, [0.07, 0.09, 0.12], 0.045)] },
      injury: [-0.04, -0.05, -0.05], stShape: 'flat', qtc: 0.42
    }),
    longqt: morph({ t: { comps: [C(0, 0.07, [0.2, 0.25, 0.2], 0.05)] }, qtc: 0.56, tEnd: 0.1 }),
    ep: morph({
      qrs: { comps: [C(0.012, 0.007, [0.2, -0.15, 0.15]), C(0.034, 0.0095, [0.4, 0.7, 0.35]), C(0.05, 0.0105, [0.5, 0.5, -0.4]), C(0.078, 0.011, [-0.4, 0.05, 0.25])], dur: 0.1 },
      t: { comps: [C(0, 0.05, [0.3, -0.05, -0.15], 0.032)] }
    }),
    brugada: morph({
      qrs: { comps: [SEPT, M1, M2, C(0.074, 0.009, [-0.3, 0, 0.3])], dur: 0.1 },
      extras: {
        V1: [{ ref: 'qrs', t: 0.095, a: 0.3, w: 0.008, w2: 0.1 }, { ref: 'tpeak', t: 0, a: -0.32, w: 0.05, w2: 0.035 }],
        V2: [{ ref: 'qrs', t: 0.095, a: 0.42, w: 0.008, w2: 0.11 }, { ref: 'tpeak', t: 0, a: -0.55, w: 0.05, w2: 0.035 }]
      }
    }),
    osborn: morph({
      qrs: { comps: [SEPT, M1, M2, TERM, C(0.1, 0.016, [0.28, 0.32, 0.12])], dur: 0.12 },
      qtc: 0.48
    }),
    paced: morph({
      qrs: { comps: [C(0.05, 0.026, [0.35, -0.6, -0.6]), C(0.11, 0.024, [0.5, -0.4, -0.45])], dur: 0.16 },
      t: { comps: [C(0, 0.06, [-0.3, 0.35, 0.4], 0.045)] }, qtc: 0.44, spike: true
    })
  };

  /* ---------- Rythmes : renvoient une liste d'événements {type:'P'|'QRS', t, m} ---------- */
  const RHYTHMS = {
    sinus(o = {}) {
      return (r, D) => {
        const hr = o.hr || 75, pr = o.pr || 0.16, jit = o.jitter ?? 0.015, ev = [];
        let t = -60 / hr + 0.15 + r() * 0.3, i = 0;
        while (t < D + 0.5) {
          const rrNow = 60 / (o.resp ? hr * (1 + o.resp * Math.sin(2 * Math.PI * t / 4.6)) : hr);
          ev.push({ type: 'P', t, m: o.pm || o.m || 'normal', qrsT: t + pr });
          ev.push({ type: 'QRS', t: t + pr, m: o.m || 'normal' });
          t += rrNow * (1 + jit * randn(r)); i++;
        }
        return ev;
      };
    }
  };

  /* ---------- Activités de fond (FA, flutter, FV, torsades, bruit) ---------- */
  const BG = {
    af(b, arr, L, r, N) {
      const k = b.amp || 1, ph = [r() * 6, r() * 6, r() * 6, r() * 6];
      const va = [0.03, 0.05, 0.09], vb = [0.02, 0.04, -0.06];
      const A = L.map(l => dot(l, va) * k), B = L.map(l => dot(l, vb) * k);
      for (let i = 0; i < N; i++) {
        const t = i / FS;
        const env = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.4 * t + ph[3]);
        const s1 = env * (Math.sin(2 * Math.PI * 6.1 * t + ph[0] + 0.8 * Math.sin(1.3 * t)) + 0.5 * Math.sin(2 * Math.PI * 8.3 * t + ph[1]));
        const s2 = env * Math.sin(2 * Math.PI * 5.2 * t + ph[2] + 0.6 * Math.sin(0.9 * t));
        for (let j = 0; j < L.length; j++) arr[j][i] += A[j] * s1 + B[j] * s2;
      }
    },
    flutter(b, arr, L) {
      const per = b.period || 0.2, off = b.offset || 0, v = [0.0, 0.24, -0.11];
      const A = L.map(l => dot(l, v));
      for (let i = 0; i < arr[0].length; i++) {
        const t = i / FS, ph = (((t - off) / per) % 1 + 1) % 1;
        const s = ph < 0.78 ? 0.45 - 1.45 * Math.pow(ph / 0.78, 1.4) : -1 + 1.45 * smooth((ph - 0.78) / 0.22);
        for (let j = 0; j < L.length; j++) arr[j][i] += A[j] * s;
      }
    },
    // macro-réentrée atriale atypique : ondulation continue, sans ligne isoélectrique, positive en inférieur
    flutterAtyp(b, arr, L) {
      const per = b.period || 0.24, off = b.offset || 0, v = b.v || [0.05, 0.16, 0.1];
      const A = L.map(l => dot(l, v));
      for (let i = 0; i < arr[0].length; i++) {
        const ph = 2 * Math.PI * (i / FS - off) / per;
        const s = 0.8 * Math.sin(ph) + 0.25 * Math.sin(2 * ph + 0.6);
        for (let j = 0; j < L.length; j++) arr[j][i] += A[j] * s;
      }
    },
    vf(b, arr, L, r) {
      const ph = Array.from({ length: 6 }, () => r() * 6.28), k = b.amp || 1;
      for (let i = 0; i < arr[0].length; i++) {
        const t = i / FS;
        const v = [Math.sin(0.7 * t + ph[0]), Math.cos(0.5 * t + ph[1]), Math.sin(0.9 * t + ph[2])];
        const env = 0.55 + 0.35 * Math.sin(2 * Math.PI * 0.3 * t + ph[3]);
        const s = env * (Math.sin(2 * Math.PI * 4.6 * t + 1.2 * Math.sin(1.7 * t + ph[4])) + 0.45 * Math.sin(2 * Math.PI * 6.9 * t + ph[5]));
        for (let j = 0; j < L.length; j++) arr[j][i] += dot(L[j], v) * s * 0.42 * k;
      }
    },
    tdp(b, arr, L) {
      const t0 = b.t0, t1 = b.t1;
      for (let i = Math.max(0, Math.floor(t0 * FS)); i < Math.min(arr[0].length, t1 * FS); i++) {
        const t = i / FS, u = t - t0;
        const fade = smooth(u / 0.25) * smooth((t1 - t) / 0.3);
        const a = 2 * Math.PI * u / 4.4;
        const v = [Math.cos(a), Math.sin(a), 0.5 * Math.sin(a + 1)];
        const env = 0.35 + 0.85 * Math.abs(Math.sin(Math.PI * u / 2.2));
        const s = Math.sin(2 * Math.PI * 4.1 * u) * env * fade * 0.9;
        for (let j = 0; j < L.length; j++) arr[j][i] += dot(L[j], v) * s;
      }
    },
    tremor(b, arr, L, r) {
      const k = b.amp || 0.04;
      for (let j = 0; j < L.length; j++) {
        let y = 0, z = 0; const limb = j < 6 ? 1 : 0.5;
        for (let i = 0; i < arr[j].length; i++) {
          y = 0.6 * y + randn(r); z = 0.6 * z + y;
          arr[j][i] += z * 0.12 * k * limb * (0.6 + 0.4 * Math.sin(i / FS * 1.7 + j));
        }
      }
    },
    mains(b, arr) {
      const k = b.amp || 0.05;
      for (let j = 0; j < arr.length; j++)
        for (let i = 0; i < arr[j].length; i++) arr[j][i] += k * Math.sin(2 * Math.PI * 50 * i / FS + j * 0.7);
    },
    wander(b, arr, L, r) {
      const k = b.amp || 0.15;
      for (let j = 0; j < arr.length; j++) {
        const p1 = r() * 6.28, p2 = r() * 6.28;
        for (let i = 0; i < arr[j].length; i++) {
          const t = i / FS;
          arr[j][i] += k * (Math.sin(2 * Math.PI * 0.22 * t + p1) + 0.5 * Math.sin(2 * Math.PI * 0.53 * t + p2));
        }
      }
    }
  };

  /* ---------- Rendu ---------- */
  function render(spec) {
    const D = spec.duration || 10, N = Math.round(D * FS);
    const names = spec.xyz ? LEADS.concat(['X', 'Y', 'Z']) : LEADS.slice();
    const L = names.map(n => LV[n]);
    const arr = names.map(() => new Float32Array(N));
    const r = rng(spec.seed || 7);
    const custom = spec.morphs || {};
    const getM = k => (typeof k === 'object' ? k : custom[k] || MORPHS[k] || BASE);
    const events = (spec.rhythm ? spec.rhythm(r, D) : []).sort((a, b) => a.t - b.t);

    let prev = null;
    events.forEach(e => { if (e.type === 'QRS') { e.rr = prev ? e.t - prev.t : (e.rr || 0.8); prev = e; } });

    function addComp(t0, c, k, only) {
      const ctr = t0 + c.t, w = c.w, w2 = c.w2 || w;
      const i0 = Math.max(0, Math.floor((ctr - 4 * w) * FS)), i1 = Math.min(N - 1, Math.ceil((ctr + 4 * w2) * FS));
      if (i1 < i0) return;
      const a = only != null ? null : L.map(l => dot(l, c.v) * k);
      for (let i = i0; i <= i1; i++) {
        const dt = i / FS - ctr, s = dt < 0 ? w : w2, g = Math.exp(-dt * dt / (2 * s * s));
        if (only != null) arr[only][i] += c.a * k * g;
        else for (let j = 0; j < a.length; j++) arr[j][i] += a[j] * g;
      }
    }
    function addPlateau(v, tA, tB, shape, k, fallW) {
      const rise = shape === 'concave' ? 0.03 : 0.012;
      const i0 = Math.max(0, Math.floor((tA - rise) * FS)), i1 = Math.min(N - 1, Math.ceil((tB + 3.5 * fallW) * FS));
      const a = L.map(l => dot(l, v) * k);
      for (let i = i0; i <= i1; i++) {
        const t = i / FS, u = clamp((t - tA) / Math.max(0.01, tB - tA), 0, 1);
        let s = 1;
        if (shape === 'concave') s = 0.45 + 0.55 * u * u;
        else if (shape === 'ramp') s = 0.15 + 0.85 * u;
        const g = smooth((t - tA + rise) / rise) * s * (t > tB ? Math.exp(-(t - tB) * (t - tB) / (2 * fallW * fallW)) : 1);
        for (let j = 0; j < a.length; j++) arr[j][i] += a[j] * g;
      }
    }
    const idx = n => names.indexOf(n);

    events.forEach(e => {
      const m = getM(e.m), k = e.k || 1;
      e.morph = m;
      if (e.type === 'P') {
        m.p.comps.forEach(c => addComp(e.t, c, k));
        e.dur = m.p.dur;
        if (m.p.ta) addPlateau(m.p.ta, e.t + m.p.dur, (e.qrsT || e.t + 0.16) - 0.005, 'flat', k, 0.008);
      } else if (e.type === 'QRS') {
        m.qrs.comps.forEach(c => addComp(e.t, c, k));
        const rr = clamp(e.rr, 0.3, 2.2);
        const qt = m.qtc * Math.cbrt(rr);
        e.dur = m.qrs.dur; e.qt = qt; e.tPeak = e.t + qt - m.tEnd;
        m.t.comps.forEach(c => addComp(e.tPeak, c, k));
        if (m.u) m.u.comps.forEach(c => addComp(e.tPeak, c, k));
        if (m.injury) addPlateau(m.injury, e.t + m.qrs.dur, e.tPeak, m.stShape, k, 0.05);
        if (m.spike) { e.spike = e.t - 0.006; addComp(e.spike, C(0, 0.0018, [0.9, -1.3, 0.8]), k); }
        if (m.extras) Object.keys(m.extras).forEach(lead => {
          const j = idx(lead); if (j < 0) return;
          m.extras[lead].forEach(x => addComp(x.ref === 'tpeak' ? e.tPeak : e.t, { t: x.t, w: x.w, w2: x.w2, a: x.a }, k, j));
        });
      }
    });

    (spec.bg || []).forEach(b => BG[b.kind] && BG[b.kind](b, arr, L, r, N));
    if (spec.noise !== 0) {
      const k = spec.noise ?? 0.008;
      for (let j = 0; j < arr.length; j++) {
        const p = r() * 6.28;
        for (let i = 0; i < N; i++) arr[j][i] += k * randn(r) + 0.02 * Math.sin(2 * Math.PI * 0.18 * i / FS + p);
      }
    }

    const leads = {};
    names.forEach((n, j) => leads[n] = arr[j]);
    if (spec.armSwap) {
      const I = leads.I.map(v => -v), II = leads.III, III = leads.II, aVR = leads.aVL, aVL = leads.aVR;
      Object.assign(leads, { I, II, III, aVR, aVL });
    }
    return { fs: FS, duration: D, N, leads, events };
  }

  /* Un battement unique (pour les mini-complexes et l'animation du cœur) */
  function beat(m, o = {}) {
    const pT = o.pT ?? 0.1, pr = o.pr ?? 0.16;
    return render({
      duration: o.duration || 0.9, noise: 0, xyz: o.xyz,
      morphs: { x: m },
      rhythm: () => [{ type: 'P', t: pT, m: 'x', qrsT: pT + pr }, { type: 'QRS', t: pT + pr, m: 'x', rr: o.rr || 0.8 }]
    });
  }

  root.ECG = { FS, LEADS, LIMB, PRECORD, LV, FRONTAL_ANGLE, HORIZ_ANGLE, MORPHS, RHYTHMS, BG, C, morph, render, beat, rng, randn, dot };
  if (typeof module !== 'undefined') module.exports = root.ECG;
})(typeof window !== 'undefined' ? window : globalThis);
