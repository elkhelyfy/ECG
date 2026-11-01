/* Simulateur cœur ↔ tracé.
   L'onde de dépolarisation, l'influx dans le tissu de conduction et les circuits de réentrée sont calculés
   à partir des événements du tracé rendu (P, QRS, activité de fond) : le cœur montre exactement l'instant
   où se trouve le curseur sur la bande DII. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const frac = x => x - Math.floor(x);
  const ell = (cx, cy, rx, ry, cw) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 ${cw ? 1 : 0} ${2 * rx} 0 a${rx} ${ry} 0 1 ${cw ? 1 : 0} ${-2 * rx} 0`;

  /* ---------- géométrie (coupe frontale schématique) ---------- */
  const SA = [118, 64], AVN = [214, 197], HIS_B = [219, 238], SEPT = [221, 262], KENT_V = [374, 224];
  const FOCI = { ectopicP: [300, 150], atrialP: [176, 172], mat3: [92, 112] };
  const VFOCI = { pvc: [318, 318], vt: [318, 318], paced: [232, 372] };
  const BOX = { A: [60, 52, 384, 200], V: [52, 214, 388, 394] };
  const SHAPE = {
    ra: 'M60 122 C60 74 100 50 140 52 C185 54 210 86 212 126 C213 160 207 186 203 200 L70 200 C62 178 59 150 60 122 Z',
    la: 'M228 122 C226 82 262 58 306 58 C350 58 382 86 384 126 C385 160 379 186 373 200 L236 200 C231 178 229 150 228 122 Z',
    vent: 'M52 214 L388 214 C392 292 338 360 250 394 C152 366 50 300 52 214 Z',
    rvc: 'M80 230 L198 230 C203 282 213 330 224 360 C150 336 84 292 80 230 Z',
    lvc: 'M240 230 L362 230 C360 286 322 336 262 364 C256 322 246 282 240 230 Z'
  };
  const ROUTE = {
    tract: 'M118 64 C140 112 182 150 214 197',
    retro: 'M214 197 C204 168 172 140 140 120',
    lv: 'M214 197 L219 238 C232 262 270 282 312 304',
    lv2: 'M214 197 L219 238 C236 272 252 312 266 348',
    rv: 'M214 197 L219 238 C212 280 206 318 202 346',
    kent: 'M368 184 L376 196 L366 208 L374 224'
  };
  const CIRCUIT = {
    flutter: { d: ell(136, 152, 58, 40, 0), bg: true },
    flutatyp: { d: ell(316, 122, 44, 32, 1), bg: true },
    trin: { d: 'M214 193 a9 13 0 0 1 0 -26 a9 13 0 0 1 0 26', anchor: [214, 193] },
    trav: { d: 'M214 197 L219 238 C250 270 330 270 374 224 L376 196 L368 184 C330 168 260 172 214 197', anchor: HIS_B },
    travanti: { d: 'M214 197 C260 172 330 168 368 184 L376 196 L374 224 C330 270 250 270 219 238 L214 197', anchor: KENT_V },
    pjrt: { d: 'M214 197 L219 238 C210 246 196 240 187 224 L195 208 L186 196 L192 184 C198 180 208 186 214 197', anchor: HIS_B }
  };
  // ce que chaque trouble ajoute au schéma : circuit animé, structures fixes, foyer jonctionnel
  const CFG = {
    flutter: { circuit: 'flutter', extra: ['annulus'] }, flutatyp: { circuit: 'flutatyp', extra: ['scar'] },
    trin: { circuit: 'trin' }, trav: { circuit: 'trav' }, travanti: { circuit: 'travanti' },
    pjrt: { circuit: 'pjrt', extra: ['kent2'] }, rja: { jn: true }, jet: { jn: true }
  };
  const CIRCUIT_TXT = {
    trin: 'La boucle tourne dans le nœud AV (voie lente puis voie rapide) : chaque tour active ventricules et oreillettes presque en même temps.',
    trav: 'Descente par le nœud AV et le His, remontée par la voie accessoire : la P rétrograde arrive après le QRS.',
    travanti: 'Descente par la voie accessoire (QRS large, pré-excité), remontée par le His et le nœud AV.',
    pjrt: 'Remontée lente par une voie accessoire postéroseptale : la P rétrograde arrive tard, juste avant le QRS suivant.',
    flutter: 'Macro-réentrée autour de l’anneau tricuspide, sens antihoraire. Un tour complet inscrit une onde F.',
    flutatyp: 'Macro-réentrée autour d’une cicatrice de l’oreillette gauche. Un tour complet inscrit une onde F.'
  };
  const AF = [[100, 100], [152, 78], [182, 142], [92, 160], [262, 92], [322, 80], [352, 142], [282, 162], [140, 182]];
  const PHASES = [['p', 'P · oreillettes'], ['pr', 'PR · nœud AV'], ['qrs', 'QRS · ventricules'], ['st', 'ST · plateau'], ['t', 'T · repolarisation']];

  const maxR = (o, box) => { const [x0, y0, x1, y1] = BOX[box]; return Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => Math.hypot(x - o[0], y - o[1]))); };
  const pOrigin = p => FOCI[p.m] || (/^retro/.test(p.m) ? 'retro' : SA);
  function vOrigins(q) {
    if (q.m === 'preex') return [[KENT_V, 0]];
    if (q.m === 'wpw') return [[KENT_V, 0], [SEPT, 0.03]];
    if (VFOCI[q.m]) return [[VFOCI[q.m], 0]];
    return [[SEPT, 0]];
  }
  const lastBefore = (list, t) => { let r = null; for (const e of list) { if (e.t <= t) r = e; else break; } return r; };

  function markup() {
    const track = (k, d) => `<g class="hs-fx" data-fx="${k}"><path class="hs-track" d="${d}" marker-mid="url(#hsArr)" marker-end="url(#hsArr)"/></g>`;
    const dot = id => `<g class="hs-dot" id="${id}" opacity="0"><circle class="halo" r="10"/><circle class="core" r="4.6"/></g>`;
    return `
      <defs>
        <clipPath id="hsClipA"><path d="${SHAPE.ra}"/><path d="${SHAPE.la}"/></clipPath>
        <clipPath id="hsClipV"><path clip-rule="evenodd" d="${SHAPE.vent} ${SHAPE.rvc} ${SHAPE.lvc}"/></clipPath>
        <marker id="hsArr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto"><path class="hs-arrow" d="M1 1 L9 5 L1 9 z"/></marker>
        <pattern id="hsHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V5" class="hs-hatch"/></pattern>
      </defs>
      <g visibility="hidden" id="hsRoutes"></g>
      <path class="hs-vessel" d="M98 0 H132 V60 H98 Z"/>
      <path class="hs-muscle" d="${SHAPE.ra}"/><path class="hs-muscle" d="${SHAPE.la}"/>
      <path class="hs-muscle" d="${SHAPE.vent}"/><path class="hs-cav" d="${SHAPE.rvc}"/><path class="hs-cav" d="${SHAPE.lvc}"/>
      <g clip-path="url(#hsClipA)">
        <circle class="hs-wave" id="hsWA" r="0" opacity="0"/>
        ${[0, 1, 2].map(i => `<circle class="hs-wave soft" id="hsF${i}" r="38" opacity="0"/>`).join('')}
        ${AF.map((_, i) => `<circle class="hs-wave soft" id="hsAF${i}" r="0" opacity="0"/>`).join('')}
      </g>
      <g clip-path="url(#hsClipV)">
        <circle class="hs-wave" id="hsWV0" r="0" opacity="0"/><circle class="hs-wave" id="hsWV1" r="0" opacity="0"/>
      </g>
      <path class="hs-outline atrium" d="${SHAPE.ra}"/><path class="hs-outline atrium" d="${SHAPE.la}"/>
      <path class="hs-outline" d="${SHAPE.vent}"/><path class="hs-outline thin" d="${SHAPE.rvc}"/><path class="hs-outline thin" d="${SHAPE.lvc}"/>
      <path class="hs-ring" d="M44 207 H396"/>
      <path class="hs-limit" d="M-52 240 H400"/>
      <text class="hs-zone" x="-52" y="233">↑ SUPRA</text><text class="hs-zone" x="-52" y="254">↓ VENTRIC.</text>
      <text class="hs-cavlab" x="72" y="98">OD</text><text class="hs-cavlab" x="244" y="96">OG</text>
      <text class="hs-cavlab" x="110" y="286">VD</text><text class="hs-cavlab" x="272" y="258">VG</text>
      <path class="hs-tract" d="M118 64 C172 70 204 124 214 197"/><path class="hs-tract" d="${ROUTE.tract}"/>
      <path class="hs-tract" d="M118 64 C92 132 150 188 214 197"/><path class="hs-tract" d="M128 60 C200 40 262 50 324 74"/>
      <path class="hs-cond" d="M214 197 L219 238"/>
      <path class="hs-cond" d="M219 238 C212 280 206 318 202 346"/>
      <path class="hs-cond" d="M219 238 C232 262 270 282 312 304"/><path class="hs-cond" d="M219 238 C236 272 252 312 266 348"/>
      <path class="hs-purk" d="M312 304 l14 -10 M312 304 l12 10 M312 304 l18 2 M266 348 l10 12 M266 348 l-4 14 M266 348 l14 4 M202 346 l-12 8 M202 346 l2 14 M202 346 l-14 -2"/>
      <path class="hs-kent" d="${ROUTE.kent}"/>
      <text class="hs-lab" x="384" y="216">Kent</text>
      <g class="hs-fx" data-fx="annulus"><ellipse class="hs-annulus" cx="136" cy="152" rx="24" ry="9"/><text class="hs-lab sm" x="136" y="174" text-anchor="middle">anneau tricuspide</text></g>
      <g class="hs-fx" data-fx="scar"><ellipse class="hs-scar" cx="316" cy="122" rx="18" ry="12"/><text class="hs-lab sm" x="316" y="82" text-anchor="middle">cicatrice</text></g>
      <g class="hs-fx" data-fx="kent2"><path class="hs-kent slow" d="M192 184 L186 196 L195 208 L187 224"/><text class="hs-lab sm" x="180" y="232" text-anchor="end">voie lente</text></g>
      ${Object.keys(CIRCUIT).map(k => track(k, CIRCUIT[k].d)).join('')}
      <circle class="hs-node sa" cx="${SA[0]}" cy="${SA[1]}" r="7"/>
      <circle class="hs-node av" cx="${AVN[0]}" cy="${AVN[1]}" r="7.5"/>
      <circle class="hs-jn" id="hsJN" cx="${AVN[0]}" cy="${AVN[1]}" r="6" opacity="0"/>
      <g id="hsX" opacity="0" transform="translate(${AVN[0]} ${AVN[1]})"><path class="hs-x" d="M-8 -8 L8 8 M8 -8 L-8 8"/></g>
      ${['hsDA', 'hsDL', 'hsDL2', 'hsDR', 'hsDK', 'hsDC'].map(dot).join('')}
      <text class="hs-lab" x="140" y="44">nœud sinusal</text>
      <text class="hs-lab" x="226" y="191">nœud AV</text>
      <text class="hs-lab" x="228" y="232">His</text>`;
  }

  function create(svg, ui) {
    svg.innerHTML = markup();
    const q = id => svg.querySelector('#' + id);
    const E = {
      wa: q('hsWA'), wv: [q('hsWV0'), q('hsWV1')], flt: [0, 1, 2].map(i => q('hsF' + i)), af: AF.map((_, i) => q('hsAF' + i)),
      jn: q('hsJN'), x: q('hsX'),
      dot: { A: q('hsDA'), L: q('hsDL'), L2: q('hsDL2'), R: q('hsDR'), K: q('hsDK'), C: q('hsDC') }
    };
    // trajets invisibles pour positionner l'influx (getPointAtLength)
    const routesG = q('hsRoutes'), routes = {};
    function route(key, d) {
      if (!routes[key]) {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d || ROUTE[key]);
        routesG.append(p);
        routes[key] = { el: p, len: p.getTotalLength() };
      }
      return routes[key];
    }
    const at = (key, u, d) => { const r = route(key, d); const pt = r.el.getPointAtLength(clamp(u, 0, 1) * r.len); return [pt.x, pt.y]; };
    const setAttrs = (el, o) => { for (const k in o) el.setAttribute(k, o[k]); };
    const showDot = (name, xy, glow) => { const g = E.dot[name]; g.setAttribute('transform', `translate(${xy[0].toFixed(1)} ${xy[1].toFixed(1)})`); g.setAttribute('opacity', 1); g.firstElementChild.setAttribute('r', glow || 10); };
    const hideDot = name => E.dot[name].setAttribute('opacity', 0);
    const wave = (el, o, r, op, repol, front) => {
      setAttrs(el, { cx: o[0], cy: o[1], r: r.toFixed(1), opacity: op.toFixed(3) });
      el.classList.toggle('repol', !!repol);
      el.classList.toggle('front', !!front);
    };

    const S = { data: null, P: [], Q: [], bg: null, cfg: {}, circ: null, anchor: 0, tt: 0, span: 10, speed: 0.25, playing: false, paper: null, head: null, scrubbing: false };
    let raf = 0, lastTs = 0, visible = true, lastTxt = {}, lastPh = '';

    ui.phases.innerHTML = PHASES.map(([k, l]) => `<li data-k="${k}">${l}</li>`).join('');
    const chip = {}; ui.phases.querySelectorAll('li').forEach(li => { chip[li.dataset.k] = li; });
    ui.caption.innerHTML = '<span class="row" data-r="a"><b>Oreillettes</b><span></span></span><span class="row" data-r="v"><b>Ventricules</b><span></span></span><span class="row" data-r="c"><b>Circuit</b><span></span></span>';
    const capRow = {}; ui.caption.querySelectorAll('.row').forEach(r => { capRow[r.dataset.r] = r; });
    const setTxt = (k, txt) => {
      if (lastTxt[k] === txt) return;
      lastTxt[k] = txt;
      capRow[k].hidden = !txt;
      capRow[k].lastElementChild.textContent = txt || '';
    };

    function frame() {
      const t = S.tt, ph = {};
      let aTxt = '', vTxt = '';
      /* ----- oreillettes ----- */
      E.wa.setAttribute('opacity', 0);
      E.flt.forEach(c => c.setAttribute('opacity', 0));
      E.af.forEach(c => c.setAttribute('opacity', 0));
      E.x.setAttribute('opacity', 0);
      hideDot('A');
      const bgKind = S.bg && S.bg.kind;
      if (bgKind === 'af') {
        AF.forEach(([x, y], i) => {
          const r = 12 + 16 * Math.pow(Math.sin(t * (5.3 + i * 0.7) + i * 1.9), 2);
          wave(E.af[i], [x + 16 * Math.sin(t * (2.1 + i * 0.37) + i), y + 12 * Math.cos(t * (1.7 + i * 0.29) + i * 2)], r, 0.5, false, true);
        });
        ph.p = true;
        aTxt = 'Des centaines de micro-réentrées désorganisent les oreillettes : aucune activation commune, donc pas d’onde P mais des ondes f irrégulières.';
      } else if (bgKind === 'flutter' || bgKind === 'flutterAtyp') {
        const per = S.bg.period || 0.2, s = frac((t - (S.bg.offset || 0)) / per);
        [0, 0.06, 0.12].forEach((lag, i) => wave(E.flt[i], at('circ', frac(s - lag), S.circ && S.circ.d), 38 - i * 4, [0.6, 0.34, 0.16][i], false, i === 0));
        showDot('A', at('circ', s, S.circ && S.circ.d));
        ph.p = true;
        aTxt = `${bgKind === 'flutter' ? 'L’influx tourne autour de l’anneau tricuspide' : 'L’influx tourne autour de la cicatrice'} : un tour toutes les ${Math.round(per * 1000)} ms, soit une onde F à ${Math.round(60 / per)}/min, sans retour à la ligne isoélectrique.`;
      } else {
        const p = lastBefore(S.P, t);
        if (p) {
          const o = pOrigin(p), origin = o === 'retro' ? AVN : o, u = (t - p.t) / p.dur;
          const lit = p.t + p.dur + 0.12, fade = clamp(1 - (t - lit) / 0.14, 0, 1);
          if (t < lit + 0.14) wave(E.wa, origin, maxR(origin, 'A') * smooth(u), 0.62 * (t < lit ? 1 : fade), false, u < 1);
          // influx vers le nœud AV, attente nodale, puis blocage éventuel
          const travel = p.dur * 0.85, ua = (t - p.t) / travel;
          if (o === 'retro') {
            if (u <= 1) showDot('A', at('retro', u));
            ph.p = u < 1;
            aTxt = u < 1 ? 'L’influx remonte de la jonction vers les oreillettes, de bas en haut : P rétrograde, négative en DII.' : '';
          } else {
            const key = o === SA ? 'tract' : 'line' + o.join('_'), d = o === SA ? null : `M${o[0]} ${o[1]} L${AVN[0]} ${AVN[1]}`;
            if (ua <= 1) showDot('A', at(key, ua, d));
            else if (p.qrsT && t < p.qrsT - 0.035) showDot('A', AVN, 10 + 3 * Math.sin(t * 60));
            else if (p.conducted === false && t < p.t + travel + 0.3) E.x.setAttribute('opacity', clamp(1 - (t - p.t - travel) / 0.3, 0, 1).toFixed(2));
            if (u < 1) {
              ph.p = true;
              aTxt = o === SA ? 'Le nœud sinusal décharge : l’onde de dépolarisation envahit les oreillettes, c’est l’onde P.'
                : 'Un foyer ectopique décharge : les oreillettes s’activent à partir d’un autre point, d’où une P de forme différente.';
            } else if (p.qrsT && t < p.qrsT) {
              ph.pr = true;
              aTxt = 'Les oreillettes sont activées. L’influx est freiné dans le nœud AV : segment PR isoélectrique.';
            } else if (p.conducted === false && t < p.t + travel + 0.3) {
              aTxt = 'L’influx est bloqué dans le nœud AV : onde P non suivie de QRS.';
            }
          }
        }
      }

      /* ----- ventricules ----- */
      E.wv.forEach(c => c.setAttribute('opacity', 0));
      ['L', 'L2', 'R', 'K'].forEach(hideDot);
      E.jn.setAttribute('opacity', 0);
      const qv = lastBefore(S.Q, t);
      if (qv) {
        const tEnd = qv.tPeak + ((qv.morph && qv.morph.tEnd) || 0.075) + 0.03, repol0 = qv.tPeak - 0.07;
        const origins = vOrigins(qv);
        origins.forEach(([o, delay], i) => {
          if (t < qv.t + delay || t > tEnd) return;
          const u = (t - qv.t - delay) / Math.max(0.04, qv.dur - delay), r = maxR(o, 'V') * smooth(u);
          if (t < repol0) wave(E.wv[i], o, r, 0.62, false, u < 1);
          else wave(E.wv[i], o, r, 0.5 * clamp(1 - (t - repol0) / (tEnd - repol0), 0, 1), true, false);
        });
        if (t < qv.t + qv.dur) {
          ph.qrs = true;
          vTxt = qv.m === 'preex' ? 'Le ventricule est activé par la voie accessoire, de cellule à cellule, sans le His : QRS large, onde delta.'
            : qv.m === 'wpw' ? 'Fusion : la voie accessoire active une partie du ventricule avant le His, d’où l’onde delta.'
            : VFOCI[qv.m] ? 'Un foyer ventriculaire active les ventricules de proche en proche : QRS large.'
            : 'His, branches puis Purkinje : les deux ventricules se dépolarisent presque ensemble, d’où un QRS fin.';
        } else if (t < repol0) { ph.st = true; vTxt = 'Plateau : tout le ventricule est dépolarisé, aucun courant ne circule. Segment ST plat.'; }
        else if (t < tEnd) { ph.t = true; vTxt = 'Repolarisation ventriculaire : onde T.'; }
        else vTxt = 'Diastole : les ventricules sont au repos électrique.';
        // influx dans le His et les branches (sauf activation purement par la voie accessoire)
        if (origins.some(([o]) => o === SEPT)) {
          const u = (t - (qv.t - 0.035)) / (0.035 + 0.5 * qv.dur);
          if (u >= 0 && u <= 1) { const s = smooth(u); showDot('L', at('lv', s)); showDot('L2', at('lv2', s)); showDot('R', at('rv', s)); }
        }
        if (qv.m === 'preex' || qv.m === 'wpw') {
          const u = (t - (qv.t - 0.04)) / 0.05;
          if (u >= 0 && u <= 1) showDot('K', at('kent', u));
        }
      }
      // foyer jonctionnel : l'influx naît dans la jonction juste avant le QRS
      if (S.cfg.jn) {
        const qn = S.Q.find(e => t >= e.t - 0.05 && t < e.t + 0.25);
        if (qn) { const u = (t - qn.t + 0.05) / 0.3; setAttrs(E.jn, { r: (6 + 22 * u).toFixed(1), opacity: (0.9 * (1 - u)).toFixed(2) }); }
        if (qv && t < qv.t + qv.dur && !S.P.some(p => p.qrsT && Math.abs(p.qrsT - qv.t) < 0.005)) vTxt = 'Un foyer de la jonction AV décharge et active les ventricules par le His : QRS fin, sans P conduite.';
      }

      /* ----- circuit de réentrée lié aux QRS ----- */
      hideDot('C');
      if (S.circ && !S.circ.bg && S.Q.length) {
        const qr = lastBefore(S.Q, t) || S.Q[0], nx = S.Q[S.Q.indexOf(qr) + 1];
        const rr = nx ? nx.t - qr.t : (qr.rr || 0.4);
        showDot('C', at('circ', frac(S.anchor + (t - qr.t) / rr), S.circ.d), 12);
      }

      /* ----- interface ----- */
      const phKey = PHASES.map(([k]) => (ph[k] ? k : '')).join('|');
      if (phKey !== lastPh) { lastPh = phKey; PHASES.forEach(([k]) => chip[k].classList.toggle('on', !!ph[k])); }
      setTxt('a', aTxt); setTxt('v', vTxt);
      if (!S.scrubbing) ui.scrub.value = Math.round(t * 1000);
      ui.time.textContent = t.toFixed(2).replace('.', ',') + ' s';
      if (S.paper && S.paper.g && S.head) {
        const x = (9 + t * S.paper.speed) * S.paper.g.k;
        S.head.style.transform = `translateX(${x.toFixed(1)}px)`;
        // écran étroit : la bande défile pour garder le curseur visible pendant la lecture
        const box = S.paper.host.parentElement;
        if (S.playing && box && box.scrollWidth > box.clientWidth + 2 && (x < box.scrollLeft + 20 || x > box.scrollLeft + box.clientWidth - 40)) box.scrollLeft = Math.max(0, x - box.clientWidth * 0.25);
      }
    }

    /* ----- lecture ----- */
    function tick(ts) {
      raf = 0;
      if (!S.playing || !visible) return;
      const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
      lastTs = ts;
      S.tt += dt * S.speed;
      if (S.tt > S.span) S.tt = 0;
      frame();
      raf = requestAnimationFrame(tick);
    }
    function start() { if (!raf && S.playing && visible) { lastTs = performance.now(); raf = requestAnimationFrame(tick); } }
    function setPlaying(v) {
      S.playing = v;
      ui.transport.dataset.playing = v;
      ui.play.setAttribute('aria-label', v ? 'Pause' : 'Lecture');
      if (v) start(); else { cancelAnimationFrame(raf); raf = 0; }
    }
    function step(dir) {
      setPlaying(false);
      const t = S.tt;
      const q = dir > 0 ? S.Q.find(e => e.t - 0.2 > t + 0.01) : [...S.Q].reverse().find(e => e.t - 0.2 < t - 0.01);
      S.tt = q ? clamp(q.t - 0.2, 0, S.span) : (dir > 0 ? 0 : S.span);
      frame();
    }
    ui.play.addEventListener('click', () => setPlaying(!S.playing));
    ui.prev.addEventListener('click', () => step(-1));
    ui.next.addEventListener('click', () => step(1));
    ui.speed.innerHTML = [['0.1', '×0,1'], ['0.25', '×0,25'], ['0.5', '×0,5'], ['1', '×1']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${v === '0.25'}">${l}</button>`).join('');
    ui.speed.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      ui.speed.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      S.speed = +b.dataset.v;
    }));
    ui.scrub.addEventListener('pointerdown', () => { S.scrubbing = true; });
    ui.scrub.addEventListener('pointerup', () => { S.scrubbing = false; });
    ui.scrub.addEventListener('input', () => { S.tt = clamp(+ui.scrub.value / 1000, 0, S.span); frame(); });
    // l'animation ne tourne que si la scène est à l'écran
    // le curseur suit la largeur du papier quand la fenêtre change, même en pause
    // on observe le SVG lui-même : sur téléphone, le conteneur de la scène passe en display: contents et n'a plus de boîte
    new ResizeObserver(() => frame()).observe(svg);
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) start(); else { cancelAnimationFrame(raf); raf = 0; } }).observe(svg);

    function load(c, data, paper) {
      S.data = data;
      S.P = data.events.filter(e => e.type === 'P').sort((a, b) => a.t - b.t);
      S.Q = data.events.filter(e => e.type === 'QRS').sort((a, b) => a.t - b.t);
      S.bg = (data.bg || []).find(b => /af|flutter/.test(b.kind)) || null;
      S.cfg = CFG[c.id] || {};
      S.circ = S.cfg.circuit ? CIRCUIT[S.cfg.circuit] : null;
      delete routes.circ;
      routesG.querySelectorAll('path').forEach(p => { if (!Object.values(routes).some(r => r.el === p)) p.remove(); });
      if (S.circ && S.circ.anchor) {
        // position du circuit au moment du QRS : le point le plus proche de l'ancre (sortie vers le His ou entrée par la voie accessoire)
        const r = route('circ', S.circ.d);
        let best = 0, bd = Infinity;
        for (let i = 0; i <= 200; i++) { const pt = r.el.getPointAtLength(i / 200 * r.len), dd = Math.hypot(pt.x - S.circ.anchor[0], pt.y - S.circ.anchor[1]); if (dd < bd) { bd = dd; best = i / 200; } }
        S.anchor = best;
      }
      svg.querySelectorAll('.hs-fx').forEach(g => g.classList.toggle('on', g.dataset.fx === S.cfg.circuit || (S.cfg.extra || []).includes(g.dataset.fx)));
      setTxt('c', S.cfg.circuit ? CIRCUIT_TXT[S.cfg.circuit] : '');
      // la première étiquette suit ce que font les oreillettes : P, ondes F du flutter ou ondes f de la FA
      chip.p.textContent = !S.bg ? 'P · oreillettes' : S.bg.kind === 'af' ? 'f · fibrillation' : 'F · flutter';
      S.paper = paper;
      if (paper && !S.head) { S.head = document.createElement('div'); S.head.className = 'sv-playhead'; paper.host.append(S.head); }
      S.span = Math.min(data.duration, paper ? 250 / paper.speed : 10);
      ui.scrub.max = Math.round(S.span * 1000);
      const first = [S.P[0], S.Q[0]].filter(Boolean).sort((a, b) => a.t - b.t)[0];
      S.tt = first ? clamp(first.t - 0.08, 0, S.span) : 0;
      lastTxt = {}; lastPh = '';
      frame();
      if (!raf && S.playing) start();
    }

    // sans préférence de mouvement réduit, la simulation démarre seule ; sinon l'étudiant avance pas à pas
    setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
    return { load, frame };
  }

  root.HeartSim = { create };
})(window);
