/* Atelier 2 : du cœur au tracé (conduction animée, vecteur instantané) + laboratoire des vecteurs. */
(function (root) {
  'use strict';
  const E = root.ECG, css = root.cssVar;
  const label = l => (l === 'I' || l === 'II' || l === 'III') ? 'D' + l : l;
  const BEAT = 0.82, QRS0 = 0.18;

  const PHASES = [
    { id: 'sa', a: 0, b: 0.02, name: 'Nœud sinusal', wave: '—', text: 'Le nœud sinusal, dans la paroi de l’oreillette droite, se dépolarise spontanément 60 à 100 fois par minute. Sa masse est minuscule : aucune onde n’est visible sur l’ECG.', rule: 'Pas de masse, pas d’onde.' },
    { id: 'p', a: 0.02, b: 0.13, name: 'Onde P', wave: 'P', text: 'L’onde de dépolarisation envahit l’oreillette droite puis la gauche. Le vecteur auriculaire pointe vers le bas et la gauche (≈ +60°) : DII le voit arriver, onde P positive ; aVR le voit partir, P négative.', rule: 'P < 120 ms et < 2,5 mm.' },
    { id: 'pr', a: 0.13, b: 0.18, name: 'Segment PR', wave: 'PR', text: 'L’anneau fibreux isole les oreillettes des ventricules : seul passage, le nœud auriculo-ventriculaire. Il ralentit l’influx (le temps que les oreillettes se vident), puis le faisceau de His le conduit. Aucune grosse masse ne change d’état : ligne plate.', rule: 'PR = 120 à 200 ms.' },
    { id: 'q', a: 0.18, b: 0.198, name: 'Onde Q (septum)', wave: 'Q', text: 'Le septum se dépolarise en premier, de gauche à droite. Ce petit vecteur part vers la droite et l’avant : petite onde q en DI, aVL, V5, V6 et petite r en V1.', rule: 'q septale fine < 40 ms : normale.' },
    { id: 'r', a: 0.198, b: 0.232, name: 'Onde R', wave: 'R', text: 'Le réseau de Purkinje active la masse ventriculaire de l’endocarde vers l’épicarde, en partant de la pointe. Le ventricule gauche domine : grand vecteur vers la gauche, le bas et l’arrière. DII et V5 le voient arriver, grande onde R.', rule: 'QRS < 120 ms.' },
    { id: 's', a: 0.232, b: 0.27, name: 'Onde S', wave: 'S', text: 'Les dernières zones activées sont les bases des ventricules, en haut. Le petit vecteur terminal remonte vers la droite : onde S en DI, DII et V6, onde terminale positive en aVR.', rule: 'Fin du QRS = point J.' },
    { id: 'st', a: 0.27, b: 0.40, name: 'Segment ST', wave: 'ST', text: 'Toutes les cellules ventriculaires sont en plateau, au même potentiel : aucune différence de potentiel, donc aucun vecteur. Le segment ST est plat. Si une zone est lésée, elle ne suit pas : un courant de lésion apparaît et décale le ST.', rule: 'ST isoélectrique, comme le PR.' },
    { id: 't', a: 0.40, b: 0.56, name: 'Onde T', wave: 'T', text: 'Les ventricules se repolarisent, de l’épicarde vers l’endocarde (en sens inverse de la dépolarisation). Inverser à la fois le sens du trajet et la charge donne une onde de même signe que le QRS : la T est positive là où le QRS l’est.', rule: 'T concordante, asymétrique.' },
    { id: 'tp', a: 0.56, b: BEAT, name: 'Diastole (TP)', wave: 'TP', text: 'Tout le cœur est au repos, les ventricules se remplissent. La repolarisation des oreillettes est passée inaperçue, cachée dans le QRS. Le segment TP sert de ligne de référence.', rule: 'Référence pour mesurer le ST.' }
  ];

  const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const onOff = (t, a1, b1, a2, b2) => ramp(t, a1, b1) * (1 - ramp(t, a2, b2));
  const pulse = (t, a, b) => (t >= a && t <= b) ? Math.sin(Math.PI * (t - a) / (b - a)) : 0;

  let st = { t: 0.0, play: true, speed: 0.25, lead: 'II' }, beat = null, els = {}, last = 0, len = {};

  function heartSVG() {
    return `
    <defs><marker id="arrowHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="vec-head"/></marker></defs>
    <g class="vessel"><rect x="138" y="8" width="34" height="80" rx="8"/><path d="M236 122 C232 60 252 26 292 26 C334 26 350 54 350 92" class="aorta"/></g>
    <path d="M70 205 C60 140 90 80 150 75 C185 72 205 95 208 130 L208 205 Z" class="wall"/>
    <path d="M70 205 C60 140 90 80 150 75 C185 72 205 95 208 130 L208 205 Z" class="act" id="hRA"/>
    <path d="M212 205 L212 125 C215 95 245 78 290 80 C335 82 360 115 355 160 C352 185 345 200 340 205 Z" class="wall"/>
    <path d="M212 205 L212 125 C215 95 245 78 290 80 C335 82 360 115 355 160 C352 185 345 200 340 205 Z" class="act" id="hLA"/>
    <path d="M70 212 L200 212 L250 395 C190 385 110 330 80 270 C72 250 68 230 70 212 Z" class="wall"/>
    <path d="M70 212 L200 212 L250 395 C190 385 110 330 80 270 C72 250 68 230 70 212 Z" class="act" id="hRV"/>
    <path d="M222 212 L360 212 C368 290 330 370 268 422 Z" class="wall"/>
    <path d="M222 212 L360 212 C368 290 330 370 268 422 Z" class="act" id="hLV"/>
    <path d="M200 212 L222 212 L268 420 L250 395 Z" class="wall"/>
    <path d="M200 212 L222 212 L268 420 L250 395 Z" class="act" id="hSep"/>
    <path d="M88 200 C82 145 105 98 150 95 C175 94 190 110 192 135 L192 200 Z" class="cav"/>
    <path d="M228 200 L228 130 C232 105 255 98 288 98 C322 100 338 125 335 160 C333 180 328 195 324 200 Z" class="cav"/>
    <path d="M90 222 L190 222 L234 372 C185 362 118 318 96 268 C88 250 86 235 90 222 Z" class="cav"/>
    <path d="M240 224 L338 224 C340 285 312 345 274 385 Z" class="cav"/>
    <path d="M64 208 L366 208" class="ring"/>
    <g class="cond">
      <path d="M158 90 C168 130 186 165 200 198" id="cInt"/>
      <path d="M162 88 C205 86 250 92 300 108" id="cBach"/>
      <path d="M202 200 L212 236" id="cHis"/>
      <path d="M210 236 L236 340 C205 352 150 335 110 296" id="cRbb"/>
      <path d="M214 236 L254 336 C276 352 315 318 340 262" id="cLbb"/>
      <path d="M222 262 C260 250 300 240 336 226" id="cLaf"/>
      <path d="M236 340 L246 372 M254 336 L262 382 M236 340 L208 362 M254 336 L292 362 M110 296 L96 268 M340 262 L352 238 M150 330 L140 352 M315 318 L326 340" id="cPk"/>
    </g>
    <g class="cond-live">
      <path d="M158 90 C168 130 186 165 200 198" id="lInt"/>
      <path d="M162 88 C205 86 250 92 300 108" id="lBach"/>
      <path d="M202 200 L212 236" id="lHis"/>
      <path d="M210 236 L236 340 C205 352 150 335 110 296" id="lRbb"/>
      <path d="M214 236 L254 336 C276 352 315 318 340 262" id="lLbb"/>
      <path d="M222 262 C260 250 300 240 336 226" id="lLaf"/>
    </g>
    <circle cx="158" cy="90" r="7" class="node" id="hSA"/>
    <circle cx="202" cy="200" r="7" class="node" id="hAV"/>
    <g class="hlab">
      <path d="M150 90 L40 90"/><text x="-90" y="94">Nœud sinusal</text>
      <path d="M194 200 L62 200"/><text x="-90" y="204">Nœud AV</text>
      <path d="M207 222 L90 246"/><text x="-90" y="250">Faisceau de His</text>
      <path d="M150 333 L40 360"/><text x="-90" y="364">Branche droite</text>
      <path d="M300 340 L380 360"/><text x="384" y="364">Branche gauche</text>
      <path d="M262 382 L380 404"/><text x="384" y="408">Purkinje</text>
      <path d="M362 208 L380 208"/><text x="384" y="212">Anneau fibreux</text>
      <text x="118" y="150" class="ch">OD</text><text x="276" y="150" class="ch">OG</text>
      <text x="140" y="276" class="ch">VD</text><text x="290" y="290" class="ch">VG</text>
    </g>
    <g id="hAxis" class="axis"></g>
    <g id="hVec"></g>`;
  }

  function setupDash() {
    ['lInt', 'lBach', 'lHis', 'lRbb', 'lLbb', 'lLaf'].forEach(id => {
      const p = document.getElementById(id), L = p.getTotalLength();
      len[id] = L; p.style.strokeDasharray = `${L} ${L}`; p.style.strokeDashoffset = L;
    });
  }
  function front(id, t, a, b, off) {
    const p = document.getElementById(id), L = len[id];
    const k = ramp(t, a, b) * (1 - ramp(t, off, off + 0.08));
    p.style.strokeDashoffset = L * (1 - ramp(t, a, b));
    p.style.opacity = k > 0 ? 1 : 0;
  }

  function frame(t) {
    const set = (id, v) => { document.getElementById(id).style.opacity = v.toFixed(3); };
    set('hRA', onOff(t, 0.02, 0.085, 0.22, 0.30));
    set('hLA', onOff(t, 0.05, 0.125, 0.24, 0.32));
    set('hSep', onOff(t, 0.18, 0.2, 0.40, 0.54));
    set('hRV', onOff(t, 0.195, 0.228, 0.41, 0.55));
    set('hLV', onOff(t, 0.198, 0.248, 0.40, 0.56));
    document.getElementById('hSA').style.setProperty('--glow', pulse(t, 0, 0.05).toFixed(3));
    document.getElementById('hAV').style.setProperty('--glow', Math.max(pulse(t, 0.1, 0.19), 0).toFixed(3));
    front('lInt', t, 0.02, 0.1, 0.2);
    front('lBach', t, 0.02, 0.08, 0.2);
    front('lHis', t, 0.15, 0.18, 0.26);
    front('lRbb', t, 0.175, 0.2, 0.26);
    front('lLbb', t, 0.175, 0.2, 0.26);
    front('lLaf', t, 0.178, 0.198, 0.26);
    // vecteur instantané (plan frontal)
    const i = Math.min(beat.N - 1, Math.round(t * beat.fs));
    const X = beat.leads.X[i], Y = beat.leads.Y[i];
    const m = Math.hypot(X, Y), cx = 215, cy = 262;
    const sc = m > 1e-3 ? 150 * Math.sqrt(m / 1.4) / m : 0;
    const ang = E.FRONTAL_ANGLE[st.lead] * Math.PI / 180, u = [Math.cos(ang), Math.sin(ang)];
    const pr = (X * u[0] + Y * u[1]) * sc;
    let h = '';
    if (m > 0.012) {
      h += `<line x1="${cx}" y1="${cy}" x2="${cx + u[0] * pr}" y2="${cy + u[1] * pr}" class="proj ${pr >= 0 ? 'pos' : 'neg'}"/>`;
      h += `<line x1="${cx + X * sc}" y1="${cy + Y * sc}" x2="${cx + u[0] * pr}" y2="${cy + u[1] * pr}" class="drop"/>`;
      h += `<line x1="${cx}" y1="${cy}" x2="${cx + X * sc}" y2="${cy + Y * sc}" class="vec" marker-end="url(#arrowHead)"/>`;
    }
    h += `<circle cx="${cx}" cy="${cy}" r="4" class="vec-o"/>`;
    document.getElementById('hVec').innerHTML = h;
    // phase courante
    const ph = PHASES.find(p => t >= p.a && t < p.b) || PHASES[PHASES.length - 1];
    if (els.cur !== ph.id) {
      els.cur = ph.id;
      els.phases.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', b.dataset.id === ph.id ? 'step' : 'false'));
      els.card.innerHTML = `<p class="eyebrow">${ph.wave}</p><h3>${ph.name}</h3><p>${ph.text}</p><p class="rule">${ph.rule}</p>`;
    }
    els.scrub.value = Math.round(t * 1000);
    els.time.textContent = `${Math.round(t * 1000)} ms`;
    drawTrace(t);
  }
  function drawAxis() {
    const ang = E.FRONTAL_ANGLE[st.lead] * Math.PI / 180, cx = 215, cy = 262, R = 168;
    const ex = cx + Math.cos(ang) * R, ey = cy + Math.sin(ang) * R;
    document.getElementById('hAxis').innerHTML =
      `<line x1="${cx - Math.cos(ang) * R}" y1="${cy - Math.sin(ang) * R}" x2="${ex}" y2="${ey}"/>
       <circle cx="${ex}" cy="${ey}" r="15" class="eye"/><text x="${ex}" y="${ey + 1}" text-anchor="middle" dominant-baseline="central" class="eye-lab">${label(st.lead)}</text>
       <text x="${cx - Math.cos(ang) * (R - 8)}" y="${cy - Math.sin(ang) * (R - 8)}" text-anchor="middle" dominant-baseline="central" class="minus">−</text>`;
  }
  function drawTrace(t) {
    const cv = els.trace, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = W / (BEAT * 25 * 1.0); // px par mm (beat entier à 25 mm/s)
    x.fillStyle = css('--paper'); x.fillRect(0, 0, W, H);
    for (let m = 0; m * k <= W; m++) { x.strokeStyle = m % 5 ? css('--grid-minor') : css('--grid-major'); x.lineWidth = m % 5 ? 0.5 : 1; x.beginPath(); x.moveTo(m * k, 0); x.lineTo(m * k, H); x.stroke(); }
    for (let m = 0; m * k <= H; m++) { x.strokeStyle = m % 5 ? css('--grid-minor') : css('--grid-major'); x.lineWidth = m % 5 ? 0.5 : 1; x.beginPath(); x.moveTo(0, m * k); x.lineTo(W, m * k); x.stroke(); }
    const mid = H * 0.6, gain = 10 * k;
    // bandes de phases
    const ph = PHASES.find(p => t >= p.a && t < p.b);
    if (ph) { x.fillStyle = css('--accent-wash'); x.fillRect(ph.a * 25 * k, 0, (ph.b - ph.a) * 25 * k, H); }
    x.font = `600 11px ${css('--font-data')}`; x.fillStyle = css('--ink-soft');
    PHASES.forEach(p => { if (p.id !== 'sa') x.fillText(p.wave, ((p.a + p.b) / 2) * 25 * k - 6, H - 6); });
    const sig = beat.leads[st.lead];
    x.strokeStyle = css('--trace'); x.lineWidth = 2; x.lineJoin = 'round'; x.beginPath();
    const n = Math.min(beat.N - 1, Math.round(t * beat.fs));
    for (let i = 0; i <= n; i++) { const px = i / beat.fs * 25 * k, py = mid - sig[i] * gain; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
    x.fillStyle = css('--accent'); x.beginPath(); x.arc(n / beat.fs * 25 * k, mid - sig[n] * gain, 4.5, 0, 7); x.fill();
    x.fillStyle = css('--trace'); x.font = `700 13px ${css('--font-data')}`; x.fillText(label(st.lead), 8, 18);
  }
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (!els.view.hidden) {
      if (st.play) { st.t += dt * st.speed; if (st.t >= BEAT) st.t = 0; }
      frame(st.t);
    }
    requestAnimationFrame(loop);
  }

  /* ---------- Laboratoire des vecteurs ---------- */
  const lab = { mode: 'axe', v: [0.5, 0.82, -0.28] };
  const AXE_PRESETS = [
    { n: 'Normal (+60°)', v: [0.5, 0.82, -0.28] }, { n: 'HBAG (−60°)', v: [0.48, -0.8, -0.3] },
    { n: 'Droit (+120°)', v: [-0.48, 0.8, 0.3] }, { n: 'Hyperdroit (−150°)', v: [-0.8, -0.46, 0.3] }
  ];
  const LES_PRESETS = [
    { n: 'Antérieur (IVA)', v: [0.36, -0.24, 0.9] }, { n: 'Inférieur (CD)', v: [-0.3, 0.92, -0.24] },
    { n: 'Latéral (Cx)', v: [0.9, -0.36, -0.15] }, { n: 'Sous-endocardique', v: [-0.7, -0.7, 0] }
  ];
  const TERR = [
    { n: 'inférieur', l: ['II', 'III', 'aVF'] }, { n: 'latéral haut', l: ['I', 'aVL'] },
    { n: 'septal', l: ['V1', 'V2'] }, { n: 'antérieur', l: ['V3', 'V4'] }, { n: 'latéral bas', l: ['V5', 'V6'] }
  ];
  const norm = v => { const m = Math.hypot(...v) || 1; return v.map(x => x / m); };

  function labMorph() {
    const v = lab.v;
    if (lab.mode === 'axe') {
      return E.morph({
        qrs: { comps: [E.C(0.012, 0.006, [-0.12, 0.05, 0.2]), E.C(0.04, 0.013, v.map(x => x * 1.25)), E.C(0.07, 0.008, v.map(x => -x * 0.15))], dur: 0.09 },
        t: { comps: [E.C(0, 0.05, v.map(x => x * 0.3), 0.032)] }
      });
    }
    return E.morph({ injury: v.map(x => x * 0.32) });
  }
  function wheel(svg, plane) {
    const isF = plane === 'f';
    const leads = isF ? E.LIMB : E.PRECORD;
    let h = `<circle r="104" class="w-ring"/><circle r="52" class="w-ring faint"/>`;
    leads.forEach(l => {
      const a = (isF ? E.FRONTAL_ANGLE[l] : -E.HORIZ_ANGLE[l]) * Math.PI / 180;
      const c = Math.cos(a), s = Math.sin(a);
      h += `<line x1="${isF ? -c * 104 : 0}" y1="${isF ? -s * 104 : 0}" x2="${c * 104}" y2="${s * 104}" class="w-axis"/>`;
      h += `<text x="${c * 120}" y="${s * 120}" class="w-lab" text-anchor="middle" dominant-baseline="central" data-lead="${l}">${label(l)}</text>`;
    });
    if (isF) [['0°', 0], ['+90°', 90], ['±180°', 180], ['−90°', -90]].forEach(([t, d]) => {
      const a = d * Math.PI / 180; h += `<text x="${Math.cos(a) * 90}" y="${Math.sin(a) * 90 + (d === 0 || d === 180 ? -8 : 0)}" class="w-deg" text-anchor="middle">${t}</text>`;
    });
    else h += `<text x="0" y="-74" class="w-deg" text-anchor="middle">avant</text><text x="0" y="82" class="w-deg" text-anchor="middle">arrière</text>`;
    h += `<g class="w-vec"></g>`;
    svg.innerHTML = h;
    const move = e => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * 260 - 130, py = (e.clientY - r.top) / r.height * 260 - 130;
      const a = Math.atan2(py, px), v = lab.v;
      if (isF) { const m = Math.sqrt(Math.max(0.05, 1 - v[2] * v[2])); lab.v = [Math.cos(a) * m, Math.sin(a) * m, v[2]]; }
      else { const m = Math.sqrt(Math.max(0.05, 1 - v[1] * v[1])); lab.v = [Math.cos(a) * m, v[1], -Math.sin(a) * m]; }
      updateLab();
    };
    svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); svg._drag = true; move(e); });
    svg.addEventListener('pointermove', e => { if (svg._drag) move(e); });
    svg.addEventListener('pointerup', () => { svg._drag = false; });
    svg.addEventListener('pointercancel', () => { svg._drag = false; });
  }
  function drawWheelVec(svg, plane) {
    const v = lab.v, isF = plane === 'f';
    const x = v[0] * 100, y = isF ? v[1] * 100 : -v[2] * 100;
    svg.querySelector('.w-vec').innerHTML = `<line x1="0" y1="0" x2="${x}" y2="${y}" class="w-arrow" marker-end="url(#wHead${plane})"/><circle cx="${x}" cy="${y}" r="9" class="w-handle"/>
      <defs><marker id="wHead${plane}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="w-headp"/></marker></defs>`;
  }
  function updateLab() {
    drawWheelVec(els.wf, 'f'); drawWheelVec(els.wh, 'h');
    const b = E.beat(labMorph(), { pT: 0.06, duration: 0.72 });
    const vals = {};
    E.LEADS.forEach(l => {
      const cv = els.minis[l], dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (!W) return;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const k = W / (0.72 * 25);
      x.fillStyle = css('--paper'); x.fillRect(0, 0, W, H);
      for (let m = 0; m * k <= W; m++) { x.strokeStyle = m % 5 ? css('--grid-minor') : css('--grid-major'); x.lineWidth = m % 5 ? 0.4 : 0.8; x.beginPath(); x.moveTo(m * k, 0); x.lineTo(m * k, H); x.stroke(); }
      for (let m = 0; m * k <= H; m++) { x.strokeStyle = m % 5 ? css('--grid-minor') : css('--grid-major'); x.lineWidth = m % 5 ? 0.4 : 0.8; x.beginPath(); x.moveTo(0, m * k); x.lineTo(W, m * k); x.stroke(); }
      const sig = b.leads[l], mid = H * 0.58, g = 10 * k * (lab.mode === 'axe' ? 0.8 : 1);
      x.strokeStyle = css('--trace'); x.lineWidth = 1.6; x.beginPath();
      for (let i = 0; i < b.N; i++) { const px = i / b.fs * 25 * k, py = mid - sig[i] * g; i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
      x.fillStyle = css('--trace'); x.font = `700 11px ${css('--font-data')}`; x.fillText(label(l), 5, 13);
      const q = b.events.find(e => e.type === 'QRS');
      vals[l] = lab.mode === 'axe' ? E.dot(E.LV[l], lab.v) : sig[Math.round((q.t + q.dur + 0.04) * b.fs)];
      cv.parentElement.dataset.state = lab.mode === 'lesion' ? (vals[l] >= 0.1 ? 'up' : vals[l] <= -0.1 ? 'down' : '') : '';
    });
    if (lab.mode === 'axe') {
      const deg = Math.round(Math.atan2(lab.v[1], lab.v[0]) * 180 / Math.PI);
      let cls = 'normal', txt = 'Axe normal';
      if (deg < -30 && deg >= -90) { cls = 'warn'; txt = 'Déviation axiale gauche'; }
      else if (deg > 90 && deg <= 180) { cls = 'warn'; txt = 'Déviation axiale droite'; }
      else if (deg < -90) { cls = 'bad'; txt = 'Axe hyperdroit (« no man’s land »)'; }
      const pos = E.LIMB.filter(l => vals[l] > 0.15).map(label), neg = E.LIMB.filter(l => vals[l] < -0.15).map(label);
      els.read.innerHTML = `<p class="big"><span class="pill ${cls}">${txt}</span> <b class="num">${deg > 0 ? '+' : ''}${deg}°</b></p>
        <p>QRS positifs : <b>${pos.join(', ') || '—'}</b>. QRS négatifs : <b>${neg.join(', ') || '—'}</b>.</p>
        <p class="muted">Méthode rapide : DI et aVF positifs = axe normal (0 à +90°). DI positif, aVF négatif : regarder DII (positif = −30° à 0°, encore normal).</p>`;
    } else {
      const up = E.LEADS.filter(l => vals[l] >= 0.1), dn = E.LEADS.filter(l => vals[l] <= -0.1);
      const terr = TERR.filter(t => t.l.filter(l => up.includes(l)).length >= 2).map(t => t.n);
      els.read.innerHTML = `<p class="big"><span class="pill bad">Sus-décalage</span> <b>${up.map(label).join(', ') || '—'}</b></p>
        <p><span class="pill cool">Miroir</span> <b>${dn.map(label).join(', ') || '—'}</b></p>
        <p>Territoire : <b>${terr.join(' + ') || 'aucun critère (≥ 2 dérivations contiguës)'}</b></p>
        <p class="muted">Le vecteur de lésion pointe vers la zone lésée. Les dérivations qui le voient arriver montent, celles qui le regardent de dos descendent : c’est l’image en miroir.</p>`;
    }
  }
  function setMode(m) {
    lab.mode = m;
    els.modeBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
    const P = m === 'axe' ? AXE_PRESETS : LES_PRESETS;
    lab.v = norm(P[m === 'axe' ? 0 : 0].v);
    els.presets.innerHTML = P.map((p, i) => `<button class="chip-btn" data-i="${i}">${p.n}</button>`).join('');
    els.presets.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { lab.v = norm(P[+b.dataset.i].v); updateLab(); }));
    els.labTitle.textContent = m === 'axe' ? 'Faites tourner l’axe du QRS' : 'Orientez le vecteur de lésion';
    updateLab();
  }

  function init() {
    els.view = document.getElementById('view-modele');
    document.getElementById('heartSvg').innerHTML = heartSVG();
    els.trace = document.getElementById('mmTrace');
    els.phases = document.getElementById('mmPhases');
    els.card = document.getElementById('mmPhaseCard');
    els.scrub = document.getElementById('mmScrub');
    els.time = document.getElementById('mmTime');
    beat = E.beat(E.MORPHS.normal, { pT: 0.02, pr: QRS0 - 0.02, duration: BEAT, xyz: true, rr: 0.8 });
    setupDash();
    els.phases.innerHTML = PHASES.map(p => `<li><button data-id="${p.id}"><span class="ph-w">${p.wave}</span>${p.name}</button></li>`).join('');
    els.phases.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const p = PHASES.find(x => x.id === b.dataset.id); st.t = (p.a + p.b) / 2; st.play = false; syncPlay();
    }));
    const lp = document.getElementById('mmLeads');
    lp.innerHTML = E.LIMB.map(l => `<button data-l="${l}" aria-pressed="${l === st.lead}">${label(l)}</button>`).join('');
    lp.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      st.lead = b.dataset.l; lp.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); drawAxis();
    }));
    const play = document.getElementById('mmPlay');
    const syncPlay = () => { play.textContent = st.play ? 'Pause' : 'Lecture'; play.setAttribute('aria-pressed', st.play); };
    play.addEventListener('click', () => { st.play = !st.play; syncPlay(); });
    const step = d => {
      const i = PHASES.findIndex(p => st.t >= p.a && st.t < p.b);
      const p = PHASES[(i + d + PHASES.length) % PHASES.length]; st.t = (p.a + p.b) / 2; st.play = false; syncPlay();
    };
    document.getElementById('mmPrev').addEventListener('click', () => step(-1));
    document.getElementById('mmNext').addEventListener('click', () => step(1));
    document.getElementById('mmSpeed').addEventListener('change', e => { st.speed = +e.target.value; });
    els.scrub.max = Math.round(BEAT * 1000);
    els.scrub.addEventListener('input', () => { st.t = +els.scrub.value / 1000; st.play = false; syncPlay(); });
    drawAxis(); syncPlay();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { st.play = false; st.t = 0.21; syncPlay(); }

    // laboratoire
    els.wf = document.getElementById('wheelF'); els.wh = document.getElementById('wheelH');
    els.read = document.getElementById('vlabRead'); els.presets = document.getElementById('vlabPresets');
    els.labTitle = document.getElementById('vlabTitle');
    els.modeBtns = [...document.querySelectorAll('#vlabMode button')];
    els.modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
    const mg = document.getElementById('vlabMinis'); els.minis = {};
    mg.innerHTML = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']].flat().map(l => `<div class="mini"><canvas data-l="${l}"></canvas></div>`).join('');
    mg.querySelectorAll('canvas').forEach(c => els.minis[c.dataset.l] = c);
    wheel(els.wf, 'f'); wheel(els.wh, 'h');
    setMode('axe');
    new ResizeObserver(() => { if (!els.view.hidden) updateLab(); }).observe(mg);
    requestAnimationFrame(loop);
  }
  root.Heart = { init, refresh: () => updateLab() };
})(window);
