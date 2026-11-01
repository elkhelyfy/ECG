/* Atelier 1 : l'électrocardiographe (moniteur, imprimante, sélecteur, patient et électrodes). */
(function (root) {
  'use strict';
  const E = root.ECG, LIB = root.ECGCASES, css = root.cssVar;
  const LEADS = E.LEADS;
  const GROUPS = [['I', 'II', 'III'], ['aVR', 'aVL', 'aVF'], ['V1', 'V2', 'V3'], ['V4', 'V5', 'V6']];
  const label = l => (l === 'I' || l === 'II' || l === 'III') ? 'D' + l : l;

  const ELEC = [
    { id: 'R', name: 'Bras droit', tag: 'R', color: '#d7263d', x: 66, y: 282, pos: 'Poignet ou avant-bras droit, face interne, sur une zone non osseuse.', leads: ['I', 'II', 'aVR'] },
    { id: 'L', name: 'Bras gauche', tag: 'L', color: '#f2c230', x: 294, y: 282, pos: 'Poignet ou avant-bras gauche, face interne.', leads: ['I', 'III', 'aVL'] },
    { id: 'F', name: 'Jambe gauche', tag: 'F', color: '#2e9e5b', x: 228, y: 432, pos: 'Cheville ou jambe gauche, face interne.', leads: ['II', 'III', 'aVF'] },
    { id: 'N', name: 'Jambe droite (neutre)', tag: 'N', color: '#1c1c1c', x: 132, y: 432, pos: 'Cheville droite. Électrode de référence (terre) : elle n’entre dans aucune dérivation, elle sert à réduire les parasites.', leads: [] },
    { id: 'V1', name: 'V1', tag: 'V1', color: '#d7263d', x: 170, y: 150, pos: '4ᵉ espace intercostal droit, au bord droit du sternum.', leads: ['V1'] },
    { id: 'V2', name: 'V2', tag: 'V2', color: '#f2c230', x: 190, y: 150, pos: '4ᵉ espace intercostal gauche, au bord gauche du sternum.', leads: ['V2'] },
    { id: 'V3', name: 'V3', tag: 'V3', color: '#2e9e5b', x: 204, y: 161, pos: 'À mi-distance entre V2 et V4.', leads: ['V3'] },
    { id: 'V4', name: 'V4', tag: 'V4', color: '#8a5a33', x: 217, y: 171, pos: '5ᵉ espace intercostal gauche, sur la ligne médio-claviculaire.', leads: ['V4'] },
    { id: 'V5', name: 'V5', tag: 'V5', color: '#1c1c1c', x: 237, y: 172, pos: 'Même horizontale que V4, sur la ligne axillaire antérieure.', leads: ['V5'] },
    { id: 'V6', name: 'V6', tag: 'V6', color: '#7b4bc4', x: 254, y: 173, pos: 'Même horizontale que V4, sur la ligne axillaire moyenne.', leads: ['V6'] }
  ];
  const LEAD_INFO = {
    I: 'DI = bras gauche − bras droit. Regarde la paroi latérale haute, axe 0°.',
    II: 'DII = jambe gauche − bras droit. Axe +60°, la plus proche de l’axe normal : idéale pour le rythme.',
    III: 'DIII = jambe gauche − bras gauche. Axe +120°, paroi inférieure. Loi d’Einthoven : DII = DI + DIII.',
    aVR: 'aVR : bras droit contre la moyenne des deux autres. Axe −150°, regarde la cavité : normalement tout négatif.',
    aVL: 'aVL : bras gauche. Axe −30°, paroi latérale haute.',
    aVF: 'aVF : jambe gauche. Axe +90°, paroi inférieure.',
    V1: 'V1 : en regard du ventricule droit et du septum. Normalement rS.',
    V2: 'V2 : septum. Petite r, grande S.',
    V3: 'V3 : paroi antérieure. Zone de transition (R ≈ S).',
    V4: 'V4 : pointe (apex). R dominante.',
    V5: 'V5 : paroi latérale basse. qR.',
    V6: 'V6 : paroi latérale basse. qR, petite S.'
  };

  const st = { rid: 'rsn', lead: 1, speed: 25, gain: 10, filter: true, sound: false, artef: false, run: true, swap: false, t: 0 };
  let buf = null, qrsTimes = [], cals = [], printLabels = [], audio = null, lastBeat = -1, last = 0;
  let mon, strip, els = {}, chatBox = null;

  function build() {
    const c = LIB.byId(st.rid);
    const spec = c.spec(11);
    spec.duration = (st.rid === 'tdp') ? 10 : 30;
    if (c.id === 'tdp' || c.id === 'fv' || c.id === 'asystolie') spec.duration = 10;
    spec.bg = (spec.bg || []).slice();
    if (!st.filter) spec.bg.push({ kind: 'mains', amp: 0.06 });
    if (st.artef) spec.bg.push({ kind: 'tremor', amp: 0.08 }, { kind: 'wander', amp: 0.18 });
    spec.armSwap = st.swap || spec.armSwap;
    buf = E.render(spec);
    qrsTimes = buf.events.filter(e => e.type === 'QRS' && e.t >= 0).map(e => e.t);
    if (chatBox) chatBox.refresh();
  }
  const D = () => buf.duration;
  function sample(lead, t) {
    const d = D(); let tt = ((t % d) + d) % d;
    const i = Math.floor(tt * buf.fs);
    let v = buf.leads[lead][i] || 0;
    for (const c of cals) if (t >= c && t < c + 0.2) v += 1;
    return v;
  }

  /* ---------- moniteur ---------- */
  function drawMonitor() {
    const cv = mon, dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = css('--screen'); x.fillRect(0, 0, W, H);
    x.fillStyle = css('--screen-dot');
    for (let gx = 20; gx < W; gx += 20) for (let gy = 20; gy < H; gy += 20) x.fillRect(gx, gy, 1, 1);
    const span = 125 / st.speed, pps = W / span;
    const xNow = ((st.t % span) / span) * W;
    const group = GROUPS.find(g => g.includes(LEADS[st.lead]));
    const chH = H / 3;
    group.forEach((lead, ci) => {
      const active = lead === LEADS[st.lead];
      const mid = chH * ci + chH * 0.62, k = chH * 0.3 * st.gain / 10;
      x.strokeStyle = active ? css('--screen-trace') : css('--screen-trace-dim');
      x.lineWidth = active ? 2 : 1.4;
      x.beginPath();
      let pen = false;
      for (let px = 0; px < W; px += 1) {
        const ahead = px > xNow && px < xNow + 16;
        if (ahead) { pen = false; continue; }
        const t = px <= xNow ? st.t - (xNow - px) / pps : st.t - (xNow + W - px) / pps;
        if (t < 0) { pen = false; continue; }
        const y = mid - sample(lead, t) * k;
        if (!pen) { x.moveTo(px, y); pen = true; } else x.lineTo(px, y);
      }
      x.stroke();
      x.fillStyle = active ? css('--screen-trace') : css('--screen-trace-dim');
      x.font = `600 12px ${css('--font-data')}`;
      x.fillText(label(lead), 8, chH * ci + 16);
    });
    // spot lumineux
    const lead = LEADS[st.lead], ci = group.indexOf(lead), mid = chH * ci + chH * 0.62;
    x.fillStyle = css('--screen-trace');
    x.beginPath(); x.arc(xNow, mid - sample(lead, st.t) * chH * 0.3 * st.gain / 10, 3, 0, 7); x.fill();
  }

  /* ---------- imprimante thermique ---------- */
  function drawStrip() {
    const cv = strip, dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = H / 42, head = W - 26;
    const sNow = st.t * st.speed;
    x.fillStyle = css('--paper'); x.fillRect(0, 0, W, H);
    const s0 = sNow - head / k;
    for (let m = Math.floor(s0); m <= sNow; m++) {
      const px = head - (sNow - m) * k;
      x.strokeStyle = m % 5 ? css('--grid-minor') : css('--grid-major'); x.lineWidth = m % 5 ? 0.5 : 1;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H); x.stroke();
    }
    for (let m = 0; m <= 42; m++) {
      x.strokeStyle = m % 5 ? css('--grid-minor') : css('--grid-major'); x.lineWidth = m % 5 ? 0.5 : 1;
      x.beginPath(); x.moveTo(0, m * k + 0.5); x.lineTo(head, m * k + 0.5); x.stroke();
    }
    const mid = 26 * k, lead = LEADS[st.lead];
    x.strokeStyle = css('--trace'); x.lineWidth = 1.4; x.lineJoin = 'round';
    x.beginPath(); let pen = false;
    for (let px = 0; px <= head; px++) {
      const t = st.t - (head - px) / (k * st.speed);
      if (t < 0) { pen = false; continue; }
      const y = mid - sample(lead, t) * st.gain * k;
      if (!pen) { x.moveTo(px, y); pen = true; } else x.lineTo(px, y);
    }
    x.stroke();
    x.fillStyle = css('--trace'); x.font = `600 11px ${css('--font-data')}`;
    printLabels = printLabels.filter(p => head - (sNow - p.s) * k > -120);
    printLabels.forEach(p => { const px = head - (sNow - p.s) * k; if (px < head - 4) x.fillText(p.text, px + 3, 12); });
    // tête d'impression
    x.fillStyle = css('--machine-dark'); x.fillRect(head, 0, W - head, H);
    x.fillStyle = css('--accent'); x.fillRect(head - 2, 0, 3, H);
  }
  function addLabel() {
    const s = st.t * st.speed, text = `${label(LEADS[st.lead])} · ${st.speed} mm/s · ${st.gain} mm/mV`;
    const lastL = printLabels[printLabels.length - 1];
    if (lastL && s - lastL.s < 40) { lastL.text = text; return; }
    printLabels.push({ s, text });
  }

  /* ---------- fréquence, bips ---------- */
  function hud() {
    const d = D(), tt = ((st.t % d) + d) % d, loops = Math.floor(st.t / d);
    const abs = qrsTimes.map(q => q + loops * d).concat(qrsTimes.map(q => q + (loops - 1) * d)).filter(q => q <= st.t).sort((a, b) => a - b);
    const recent = abs.slice(-4);
    let hr = '---';
    if (recent.length >= 2 && st.t - recent[recent.length - 1] < 2.6) {
      const rr = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
      hr = Math.round(60 / rr);
    }
    els.hr.textContent = hr;
    const lastQ = recent[recent.length - 1];
    if (lastQ != null && lastQ !== lastBeat && st.t - lastQ < 0.15) {
      lastBeat = lastQ;
      els.heart.classList.remove('beat'); void els.heart.offsetWidth; els.heart.classList.add('beat');
      if (st.sound && audio) beep();
    }
    void tt;
  }
  function beep() {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 960; g.gain.value = 0.0001;
    o.connect(g); g.connect(audio.destination);
    const n = audio.currentTime;
    g.gain.exponentialRampToValueAtTime(0.12, n + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.09);
    o.start(n); o.stop(n + 0.1);
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (st.run && !document.hidden && els.view && !els.view.hidden) st.t += dt;
    if (els.view && !els.view.hidden) { drawMonitor(); drawStrip(); hud(); }
    requestAnimationFrame(loop);
  }

  /* ---------- sélecteur rotatif ---------- */
  function drawKnob() {
    const svg = els.knob, n = LEADS.length;
    const ang = i => -150 + i * (300 / (n - 1));
    let h = '';
    LEADS.forEach((l, i) => {
      const a = (ang(i) - 90) * Math.PI / 180;
      const lx = 100 + Math.cos(a) * 84, ly = 100 + Math.sin(a) * 84;
      const tx = 100 + Math.cos(a) * 64, ty = 100 + Math.sin(a) * 64;
      h += `<line x1="${tx}" y1="${ty}" x2="${100 + Math.cos(a) * 70}" y2="${100 + Math.sin(a) * 70}" class="kn-tick"/>`;
      h += `<text x="${lx}" y="${ly}" class="kn-lab${i === st.lead ? ' on' : ''}" data-i="${i}" text-anchor="middle" dominant-baseline="central">${label(l)}</text>`;
    });
    h += `<g class="kn-cap" style="transform:rotate(${ang(st.lead)}deg)"><circle cx="100" cy="100" r="50" class="kn-body"/><circle cx="100" cy="100" r="40" class="kn-face"/><rect x="97" y="56" width="6" height="26" rx="3" class="kn-ptr"/></g>`;
    svg.innerHTML = h;
  }
  function setLead(i, quiet) {
    st.lead = (i + LEADS.length) % LEADS.length;
    drawKnob(); addLabel();
    els.leadInfo.innerHTML = `<b>${label(LEADS[st.lead])}</b> ${LEAD_INFO[LEADS[st.lead]]}`;
    if (!quiet) highlightLead(LEADS[st.lead]);
  }

  /* ---------- patient ---------- */
  function elecPos(e) {
    if (!st.swap) return e;
    if (e.id === 'R') return Object.assign({}, e, { x: 294, y: 282 });
    if (e.id === 'L') return Object.assign({}, e, { x: 66, y: 282 });
    return e;
  }
  function drawPatient() {
    const box = { x: 14, y: 196 };
    let wires = '', dots = '';
    ELEC.forEach((e0, i) => {
      const e = elecPos(e0);
      const sx = box.x + 40, sy = box.y + 8 + i * 4.4;
      const c1x = sx + 40 + (e.x - sx) * 0.3, c1y = sy, c2x = e.x - 10, c2y = e.y + (e.y > sy ? -40 : 30);
      wires += `<path d="M${sx} ${sy} C${c1x} ${c1y} ${c2x} ${c2y} ${e.x} ${e.y}" class="wire" stroke="${e.color}" data-id="${e.id}"/>`;
      const lx = e.id[0] === 'V' ? e.x : (e.x < 180 ? e.x - 16 : e.x + 16);
      const ly = e.id[0] === 'V' ? e.y + (i % 2 ? 19 : -14) : e.y;
      dots += `<g class="elec" data-id="${e.id}" tabindex="0" role="button" aria-label="Électrode ${e.name}">
        <circle cx="${e.x}" cy="${e.y}" r="11" class="elec-hit"/>
        <circle cx="${e.x}" cy="${e.y}" r="7.5" fill="${e.color}" class="elec-dot"/>
        <text x="${lx}" y="${ly}" class="elec-lab" text-anchor="middle" dominant-baseline="central">${e.tag}</text></g>`;
    });
    els.patient.innerHTML = `
      <path d="M0 214 C 8 214, 6 214, 14 214" class="trunk"/>
      <g class="body">
        <circle cx="180" cy="48" r="27"/>
        <rect x="168" y="70" width="24" height="22" rx="6"/>
        <path d="M100 104 Q80 150 74 212 L66 286" class="limb"/>
        <path d="M260 104 Q280 150 286 212 L294 286" class="limb"/>
        <path d="M142 296 L134 436" class="limb leg"/>
        <path d="M218 296 L226 436" class="limb leg"/>
        <path d="M118 92 Q180 80 242 92 L262 112 Q270 190 254 302 L106 302 Q90 190 98 112 Z"/>
      </g>
      <g class="anat">
        <path d="M180 98 L180 178"/><path d="M126 100 Q152 110 176 100"/><path d="M184 100 Q208 110 234 100"/>
        <path d="M120 150 Q180 138 248 152" class="ics"/><path d="M118 168 Q190 160 258 170" class="ics"/>
        <path d="M217 104 L217 196" class="mcl"/>
        <text x="122" y="146" class="anat-lab">4ᵉ EIC</text><text x="120" y="180" class="anat-lab">5ᵉ EIC</text>
      </g>
      <rect x="${box.x}" y="${box.y}" width="40" height="52" rx="6" class="jbox"/>
      <text x="${box.x + 20}" y="${box.y + 64}" class="anat-lab" text-anchor="middle">câble</text>
      ${wires}${dots}`;
    els.patient.querySelectorAll('.elec').forEach(g => {
      const go = () => selectElec(g.dataset.id);
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  function selectElec(id) {
    const e = ELEC.find(x => x.id === id);
    els.patient.querySelectorAll('.elec').forEach(g => g.classList.toggle('sel', g.dataset.id === id));
    els.patient.querySelectorAll('.wire').forEach(w => w.classList.toggle('sel', w.dataset.id === id));
    const leads = e.leads.length ? e.leads.map(l => `<span class="chip">${label(l)}</span>`).join('') : '<span class="chip ghost">aucune</span>';
    els.card.innerHTML = `<div class="ec-head"><span class="ec-dot" style="background:${e.color}"></span><b>${e.name}</b></div>
      <p>${e.pos}</p><p class="ec-leads"><span>Dérivations&nbsp;:</span> ${leads}</p>`;
    if (id[0] === 'V') setLead(LEADS.indexOf(id), true);
  }
  function highlightLead(lead) {
    const ids = ELEC.filter(e => e.leads.includes(lead)).map(e => e.id);
    els.patient.querySelectorAll('.elec').forEach(g => g.classList.toggle('lit', ids.includes(g.dataset.id)));
  }

  function seg(host, key, after) {
    host.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      host.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      st[key] = +b.dataset.v; addLabel(); meta(); after && after();
    }));
  }
  function meta() { els.meta.textContent = `${st.speed} mm/s · ${st.gain} mm/mV · ${st.filter ? 'Filtre 50 Hz' : 'Sans filtre'}${st.swap ? ' · bras inversés' : ''}`; }
  function toggle(btn, key, after) {
    btn.addEventListener('click', () => { st[key] = !st[key]; btn.setAttribute('aria-pressed', st[key]); after && after(); meta(); });
  }

  function init() {
    els = {
      view: document.getElementById('view-machine'), knob: document.getElementById('knob'), hr: document.getElementById('monHR'),
      heart: document.getElementById('monHeart'), meta: document.getElementById('monMeta'), patient: document.getElementById('patientSvg'),
      card: document.getElementById('elecCard'), leadInfo: document.getElementById('leadInfo'), rhythm: document.getElementById('mRhythm'),
      swapNote: document.getElementById('swapNote')
    };
    mon = document.getElementById('mon'); strip = document.getElementById('strip');
    LIB.CATS.forEach(cat => {
      const og = document.createElement('optgroup'); og.label = cat.label;
      LIB.CASES.filter(c => c.cat === cat.id).forEach(c => { const o = new Option(c.title, c.id); og.append(o); });
      els.rhythm.append(og);
    });
    els.rhythm.value = st.rid;
    els.rhythm.addEventListener('change', () => { st.rid = els.rhythm.value; build(); });
    els.knob.addEventListener('click', e => {
      const t = e.target.closest('[data-i]');
      setLead(t ? +t.dataset.i : st.lead + 1);
    });
    els.knob.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setLead(st.lead + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setLead(st.lead - 1); }
    });
    seg(document.getElementById('spd'), 'speed');
    seg(document.getElementById('gain'), 'gain');
    toggle(document.getElementById('kFilter'), 'filter', build);
    toggle(document.getElementById('kArtef'), 'artef', build);
    toggle(document.getElementById('kRun'), 'run', () => { document.getElementById('kRun').textContent = st.run ? 'Pause' : 'Marche'; });
    toggle(document.getElementById('kSound'), 'sound', () => {
      if (st.sound && !audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } }
      if (audio && audio.state === 'suspended') audio.resume();
    });
    toggle(document.getElementById('kSwap'), 'swap', () => {
      build(); drawPatient();
      els.swapNote.hidden = !st.swap;
      if (st.swap) setLead(0);
    });
    document.getElementById('kCal').addEventListener('click', () => cals.push(st.t + 0.05));
    build(); drawKnob(); drawPatient(); setLead(1, true); selectElec('V1'); setLead(1, true); meta();
    highlightLead('II');
    requestAnimationFrame(loop);
    if (root.Chat) chatBox = root.Chat.attach(strip, () => root.Chat.forCase(LIB.byId(st.rid), {
      extra: `Vue : appareil ECG simulé (moniteur + papier), dérivation affichée ${LEADS[st.lead] || 'II'}, ${st.speed} mm/s, ${st.gain} mm/mV`
        + (st.swap ? ', électrodes des bras inversées' : '') + (st.artef ? ', artéfacts activés' : '') + (st.filter ? '' : ', filtre 50 Hz désactivé') + '.'
    }), {
      anchor: els.leadInfo,
      data: () => ({ data: buf, speed: st.speed, gain: st.gain, shown: `appareil, dérivation ${LEADS[st.lead] || 'II'} au moniteur (analyse des 10 premières secondes de l’enregistrement en boucle)` })
    });
  }
  root.Machine = {
    init,
    load(id) { st.rid = id; els.rhythm.value = id; build(); }
  };
})(window);
