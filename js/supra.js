/* Atelier 6 : troubles du rythme supraventriculaires.
   Carte animée des circuits, position de l'onde P (RP), test à l'adénosine, algorithme diagnostique,
   tableau de synthèse, calculateur CHA₂DS₂-VA. */
(function (root) {
  'use strict';
  const E = root.ECG, LIB = root.ECGCASES, G = LIB.GEN;
  const $ = id => document.getElementById(id);
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const papers = [];

  function strip(host, speed) {
    const p = new root.Paper(host, { layout: 'strip', leads: ['II'], rowH: 30 });
    if (speed) p.speed = speed;
    p.annot = true;
    papers.push(p);
    return p;
  }
  // une bande DII unique ne peut afficher que les repères posés sur DII ou la bande de rythme
  const onStrip = marks => (marks || []).filter(m => m.lead === 'R' || m.lead === 'II');
  const link = (id, txt) => (LIB.byId(id) ? `<a href="#atlas" data-case="${id}">${txt || LIB.byId(id).title}</a>` : '');
  function seg(host, items, cur, on) {
    host.innerHTML = items.map(([k, l]) => `<button data-k="${k}" aria-pressed="${k === cur}">${l}</button>`).join('');
    host.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      host.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      on(b.dataset.k);
    }));
  }

  /* =========================================================
     1. Carte des mécanismes
     ========================================================= */
  const MAP = [
    { lvl: 'sinus', label: 'Sinusal', items: ['tachy'] },
    { lvl: 'atrial', label: 'Atrial', items: ['esa', 'ta', 'tam', 'flutter', 'flutatyp', 'fa'] },
    { lvl: 'junction', label: 'Jonction AV', items: ['rja', 'jet', 'trin'] },
    { lvl: 'ap', label: 'Voie accessoire', items: ['trav', 'travanti', 'pjrt', 'fapx'] }
  ];
  const SHORT = {
    tachy: 'Tachycardie sinusale', esa: 'Extrasystoles atriales', ta: 'Tachycardie atriale focale', tam: 'TA multifocale',
    flutter: 'Flutter typique', flutatyp: 'Flutter atypique', fa: 'Fibrillation atriale', rja: 'Rythme jonctionnel accéléré',
    jet: 'Tachycardie jonctionnelle ectopique', trin: 'TRIN', trav: 'TRAV orthodromique', travanti: 'TRAV antidromique',
    pjrt: 'PJRT (Coumel)', fapx: 'FA pré-excitée'
  };
  // calques animés du schéma allumés pour chaque trouble
  const FX = {
    tachy: ['sa', 'his'], esa: ['sa', 'esa', 'his'], ta: ['focus', 'his'], tam: ['multi', 'his'],
    flutter: ['flutter', 'his'], flutatyp: ['flutatyp', 'his'], fa: ['fa', 'his'],
    rja: ['jn', 'his'], jet: ['jn', 'sa', 'his'], trin: ['trin', 'his'],
    trav: ['trav'], travanti: ['travanti'], pjrt: ['pjrt'], fapx: ['fa', 'kentdown', 'his']
  };

  const ell = (cx, cy, rx, ry, cw) => {
    const s = cw ? 1 : 0;
    return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 ${s} ${2 * rx} 0 a${rx} ${ry} 0 1 ${s} ${-2 * rx} 0`;
  };
  const loop = (d, dur, arrows = true) =>
    `<path class="sv-track" d="${d}"${arrows ? ' marker-mid="url(#svArr)" marker-end="url(#svArr)"' : ''}/><path class="sv-comet" pathLength="100" d="${d}" style="--dur:${dur}s"/>`;
  const comet = (d, dur, delay = 0) => `<path class="sv-comet" pathLength="100" d="${d}" style="--dur:${dur}s;animation-delay:${delay}s"/>`;
  const pulse = (x, y, delay = 0, dur = 1.6, cls = '') =>
    `<circle class="sv-pulse ${cls}" cx="${x}" cy="${y}" r="9" style="--dur:${dur}s;animation-delay:${delay}s"/><circle class="sv-focus" cx="${x}" cy="${y}" r="4.5"/>`;

  const P_LB = 'M196 172 L204 214 C226 246 256 270 286 292';
  const P_RB = 'M196 172 L204 214 C188 250 170 280 150 300';
  const P_ORTHO = 'M196 172 L204 214 C240 250 300 250 344 196 L338 150 C300 140 240 150 196 172';
  const P_ANTI = 'M196 172 C240 150 300 140 338 150 L344 196 C300 250 240 250 204 214 L196 172';
  const P_PJRT = 'M196 172 L204 214 C196 222 178 214 166 196 L170 150 C182 150 190 160 196 172';
  const P_KENT = 'M338 150 L346 168 L334 178 L344 196 C330 240 305 270 286 292';
  const WAVELETS = [[78, 96, 13, 0, 1.1], [128, 74, 11, 1, 1.4], [150, 128, 12, 0, 0.9], [96, 142, 10, 1, 1.3],
    [250, 86, 13, 1, 1.2], [302, 70, 11, 0, 1.0], [318, 120, 12, 1, 1.5], [262, 130, 10, 0, 0.95]];

  function heartSvg() {
    return `
      <defs>
        <marker id="svArr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path class="sv-arrowhead" d="M1 1 L9 5 L1 9 z"/></marker>
        <pattern id="svHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V5" class="sv-hatch"/></pattern>
      </defs>
      <rect class="sv-vessel" x="82" y="0" width="34" height="58" rx="6"/>
      <ellipse class="sv-atrium" cx="118" cy="112" rx="82" ry="66"/>
      <ellipse class="sv-atrium" cx="282" cy="104" rx="78" ry="60"/>
      <path class="sv-vent" d="M44 192 H356 C356 262 300 318 232 346 C150 320 44 270 44 192 Z"/>
      <path class="sv-septum" d="M205 192 C210 250 222 300 232 340"/>
      <path class="sv-ring" d="M36 184 H364"/>
      <text class="sv-cav" x="46" y="92">OD</text><text class="sv-cav" x="236" y="68">OG</text>
      <text class="sv-cav" x="104" y="262">VD</text><text class="sv-cav" x="282" y="262">VG</text>
      <path class="sv-limit" d="M-40 214 H392"/>
      <text class="sv-zone" x="-40" y="207">↑ SUPRA</text><text class="sv-zone" x="-40" y="228">↓ VENTRIC.</text>
      <path class="sv-cond" d="M196 180 L204 214"/>
      <path class="sv-cond" d="M204 214 C188 250 170 280 150 300"/><path class="sv-cond" d="M204 214 C226 246 256 270 286 292"/>
      <path class="sv-kent" d="M338 150 L346 168 L334 178 L344 196"/>
      <text class="sv-lab" x="352" y="177">Kent</text>
      <text class="sv-lab" x="122" y="40">nœud sinusal</text>
      <text class="sv-lab" x="182" y="177" text-anchor="end">nœud AV</text>
      <text class="sv-lab" x="212" y="226">His</text>

      <g data-fx="sa">${pulse(104, 56, 0, 1.4)}</g>
      <g data-fx="esa">${pulse(240, 140, 0, 2.8, 'once')}</g>
      <g data-fx="focus">${pulse(165, 150, 0, 1.1)}</g>
      <g data-fx="multi">${pulse(70, 108, 0, 1.5)}${pulse(262, 74, 0.5, 1.5)}${pulse(165, 150, 1.0, 1.5)}</g>
      <g data-fx="flutter"><ellipse class="sv-annulus" cx="130" cy="146" rx="22" ry="7"/><text class="sv-lab sm" x="130" y="164" text-anchor="middle">anneau tricuspide</text>${loop(ell(130, 138, 56, 30, 0), 2.6)}</g>
      <g data-fx="flutatyp"><ellipse class="sv-scar" cx="298" cy="96" rx="16" ry="10"/><text class="sv-lab sm" x="298" y="62" text-anchor="middle">cicatrice</text>${loop(ell(298, 96, 40, 26, 1), 2.8)}</g>
      <g data-fx="fa">${WAVELETS.map(([x, y, r, cw, d]) => loop(ell(x, y, r, r, cw), d, false)).join('')}</g>
      <g data-fx="trin">${loop(ell(196, 156, 15, 9, 0), 1.3)}<text class="sv-lab sm" x="196" y="140" text-anchor="middle">voies lente / rapide</text></g>
      <g data-fx="trav">${loop(P_ORTHO, 3)}</g>
      <g data-fx="travanti">${loop(P_ANTI, 3)}</g>
      <g data-fx="pjrt"><path class="sv-kent slow" d="M170 150 L164 166 L174 178 L166 196"/><text class="sv-lab sm" x="160" y="206" text-anchor="end">voie lente</text>${loop(P_PJRT, 2.4)}</g>
      <g data-fx="kentdown">${comet(P_KENT, 0.9)}${comet(P_KENT, 0.9, 0.45)}</g>
      <g data-fx="jn">${pulse(196, 172, 0, 1.3)}</g>
      <g data-fx="his">${comet(P_LB, 1.4)}${comet(P_RB, 1.4)}</g>

      <circle class="sv-node sa" cx="104" cy="56" r="7"/>
      <circle class="sv-node av" cx="196" cy="172" r="8"/>`;
  }

  let mapPaper;
  function pickMap(id) {
    const c = LIB.byId(id), grp = MAP.find(g => g.items.includes(id));
    const svg = $('svHeart'), fx = FX[id] || [];
    svg.dataset.lvl = grp.lvl;
    svg.querySelectorAll('[data-fx]').forEach(g => g.classList.toggle('on', fx.includes(g.dataset.fx)));
    $('svGroups').querySelectorAll('.sv-pick').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
    $('svDetail').innerHTML = `<div class="sv-fade">
      <p class="eyebrow">${grp.label}</p>
      <h3>${c.title}</h3>
      <p>${c.mecanisme}</p>
      <p class="sv-keep">${c.retenir}</p>
      <p>${link(id, 'Ouvrir la fiche complète')}</p></div>`;
    mapPaper.set(E.render(c.spec(17)), onStrip(c.marks));
  }
  function initMap() {
    $('svHeart').setAttribute('viewBox', '-44 0 444 352');
    $('svHeart').innerHTML = heartSvg();
    $('svGroups').innerHTML = MAP.map(g => `<div class="sv-group"><p class="a-cat">${g.label}</p><div class="sv-picks">${
      g.items.map(id => `<button class="sv-pick" data-id="${id}" aria-pressed="false">${SHORT[id]}</button>`).join('')}</div></div>`).join('');
    $('svGroups').querySelectorAll('.sv-pick').forEach(b => b.addEventListener('click', () => pickMap(b.dataset.id)));
    mapPaper = strip($('svMapPaper'));
    pickMap('trin');
  }

  /* =========================================================
     2. Où est l'onde P ? (intervalle RP)
     ========================================================= */
  const RP = {
    trin: {
      label: 'TRIN commune', rr: 0.333, rp: 0.045, rm: 'retro', cases: ['trin'],
      read: 'La P rétrograde est collée au QRS : oreillettes et ventricules s’activent presque en même temps. Elle déforme la fin du QRS (pseudo r′ en V1, pseudo S en DII). C’est le profil de la <b>TRIN commune</b> (lente-rapide).'
    },
    trav: {
      label: 'TRAV orthodromique', rr: 0.3, rp: 0.14, rm: 'retro', cases: ['trav'],
      read: 'L’influx doit traverser le ventricule puis remonter par la voie accessoire avant d’activer les oreillettes : la P tombe dans le segment ST. C’est le profil de la <b>TRAV orthodromique</b>.'
    },
    long: {
      label: 'RP long', rr: 0.46, rp: 0.29, rm: 'retroDeep', cases: ['ta', 'pjrt', 'tachy'],
      read: 'La P est plus proche du QRS suivant que du précédent. Tachycardie à RP long : <b>tachycardie atriale</b> (la plus fréquente), <b>PJRT de Coumel</b>, TRIN atypique, ou tachycardie sinusale si la P est sinusale.'
    }
  };
  let rpPaper;
  function setRp(k) {
    const o = RP[k], f = o.rp / o.rr, rpMs = Math.round(o.rp * 1000), prMs = Math.round((o.rr - o.rp) * 1000);
    const tl = $('svTl'), mv = key => tl.querySelector(`[data-k="${key}"]`);
    mv('p').style.setProperty('--f', f);
    mv('th').style.setProperty('--f', 0.07 / o.rr);
    mv('rpl').style.setProperty('--f', f / 2);
    mv('prl').style.setProperty('--f', f + (1 - f) / 2);
    tl.querySelector('.sv-tl-bar.rp i').style.setProperty('--f', f);
    tl.querySelector('.sv-tl-bar.pr i').style.setProperty('--f', 1 - f);
    $('svRpLab').textContent = `RP ${rpMs} ms`;
    $('svPrLab').textContent = `PR ${prMs} ms`;
    const verdict = rpMs < 70 ? `RP ${rpMs} ms &lt; 70 ms` : rpMs < prMs ? `RP ${rpMs} ms &gt; 70 ms, RP &lt; PR` : `RP ${rpMs} ms &gt; PR ${prMs} ms`;
    rpPaper.set(E.render({ duration: 10, seed: 5, rhythm: G.regularQRS({ rr: o.rr, retro: o.rp, rm: o.rm, start: 0.3 }) }),
      [{ lead: 'R', f: 'p', which: 'retro', label: 'P rétrograde' }, { lead: 'R', f: 'rp', which: 2, label: `RP ${rpMs} ms` }]);
    $('svRpRead').innerHTML = `<p><span class="pill ${rpMs < 70 ? 'bad' : rpMs < prMs ? 'warn' : 'cool'}">${verdict}</span></p><p>${o.read}</p><p class="sv-links">${o.cases.map(id => link(id)).join('')}</p>`;
  }
  function initRp() {
    rpPaper = strip($('svRpPaper'), 50);
    seg($('svRpSeg'), Object.keys(RP).map(k => [k, RP[k].label]), 'trin', setRp);
    setRp('trin');
  }

  /* =========================================================
     3. Test à l'adénosine
     ========================================================= */
  // tachycardie par réentrée nodale arrêtée par l'adénosine, pause, puis reprise sinusale
  function stopSinus(o) {
    return (r, D) => {
      const ev = []; let t = 0.2, last = 0;
      while (t < o.stop) {
        ev.push({ type: 'QRS', t, m: 'normal' });
        ev.push({ type: 'P', t: t + o.retro, m: 'retro' });
        last = t; t += o.rr;
      }
      const rr = 60 / o.hr; let p = last + o.pause;
      while (p < D + 0.5) {
        ev.push({ type: 'P', t: p, m: 'normal', qrsT: p + o.pr });
        ev.push({ type: 'QRS', t: p + o.pr, m: o.sm || 'normal' });
        p += rr * (1 + 0.01 * E.randn(r));
      }
      return ev;
    };
  }
  const FLUT_BG = [{ kind: 'flutter', period: 0.2, offset: 0.05 }];
  const ADO = {
    trin: {
      label: 'TRIN', pre: 'Tachycardie régulière à QRS fins à 180/min, sans P visible.',
      base: () => G.regularQRS({ rr: 0.333, retro: 0.045, start: 0.2 }),
      after: () => stopSinus({ rr: 0.333, retro: 0.045, stop: 4.3, pause: 1.7, hr: 78, pr: 0.16 }),
      marks: [{ lead: 'R', f: 'window', t0: 4.3, t1: 6.2, label: 'Arrêt brutal, pause' }],
      read: '<b>Arrêt brutal.</b> L’adénosine bloque le nœud AV quelques secondes ; comme il fait partie du circuit, la réentrée s’interrompt. Après une courte pause, le rythme sinusal reprend. L’adénosine est ici diagnostique et thérapeutique.',
      cases: ['trin']
    },
    trav: {
      label: 'TRAV', pre: 'Tachycardie régulière à QRS fins à 200/min, P dans le ST.',
      base: () => G.regularQRS({ rr: 0.3, retro: 0.14, start: 0.2 }),
      after: () => stopSinus({ rr: 0.3, retro: 0.14, stop: 4.3, pause: 1.6, hr: 74, pr: 0.105, sm: 'wpw' }),
      marks: [{ lead: 'R', f: 'window', t0: 4.3, t1: 5.9, label: 'Fin sur une P rétrograde' }, { lead: 'R', f: 'delta', which: 'wpw', label: 'Onde δ démasquée' }],
      read: '<b>Arrêt brutal sur une P rétrograde</b> : le dernier influx remonte par la voie accessoire puis se bloque dans le nœud AV. Le circuit passait donc par le nœud. Au retour en sinusal, le PR court et l’onde delta révèlent la voie accessoire.',
      cases: ['trav', 'wpw']
    },
    flutter: {
      label: 'Flutter 2:1', pre: 'Tachycardie régulière à QRS fins à 150/min.', bg: FLUT_BG,
      base: () => G.flutterVar({ off: 0.05, per: 0.2, delay: 0.26, ratio: [2] }),
      after: () => G.flutterVar({ off: 0.05, per: 0.2, delay: 0.26, ratio: t => (t > 3.9 && t < 7.6 ? (t < 5.5 ? 7 : 6) : 2) }),
      marks: [{ lead: 'R', f: 'window', t0: 4.2, t1: 7.6, label: 'Dents de scie démasquées' }],
      read: '<b>La tachycardie continue.</b> Le nœud AV se ferme mais les oreillettes poursuivent leur macro-réentrée : les dents de scie à 300/min apparaissent dans les pauses. L’adénosine ne réduit pas le flutter, elle le démasque.',
      cases: ['flutter', 'flutatyp']
    },
    ta: {
      label: 'Tachycardie atriale', pre: 'Tachycardie régulière à QRS fins à 143/min.',
      base: () => G.atrial({ pp: 0.42, pr: 0.15, pm: 'atrialP', start: 0.15 }),
      after: () => G.atrial({ pp: 0.42, pr: 0.15, pm: 'atrialP', start: 0.15, conduct: (i, t) => t < 4.1 || t > 6.9 }),
      marks: [{ lead: 'R', f: 'p', which: 'blocked', label: 'Les P continuent seules' }],
      read: '<b>Les ondes P continuent pendant le bloc AV.</b> La tachycardie ne dépend pas du nœud AV : elle est atriale. Elle reprend en 1:1 dès que l’effet de l’adénosine (quelques secondes) se dissipe.',
      cases: ['ta']
    }
  };
  let adoPaper, adoK = 'trin', adoAnim = null;
  function adoShow(k, inject) {
    adoK = k;
    const o = ADO[k], host = $('svAdoPaper'), read = $('svAdoRead');
    if (adoAnim) { adoAnim.cancel(); adoAnim = null; }
    adoPaper.set(E.render({ duration: 10, seed: 9, bg: o.bg, rhythm: (inject ? o.after : o.base)() }),
      inject ? o.marks : [{ lead: 'R', f: 'rr', which: 2, label: 'Régulière' }]);
    $('svAdoGo').textContent = inject ? 'Rejouer l’injection' : 'Injecter l’adénosine';
    if (!inject) {
      read.dataset.state = 'pre';
      read.innerHTML = `<p>${o.pre} Quel est le mécanisme ? Injectez l’adénosine et regardez ce qui se passe à partir de la 4ᵉ seconde.</p>`;
      return;
    }
    const done = () => {
      read.dataset.state = 'post';
      read.innerHTML = `<p>${o.read}</p><p class="sv-links">${o.cases.map(id => link(id)).join('')}</p>`;
    };
    if (reduceMotion() || !host.animate) { done(); return; }
    read.dataset.state = 'wait';
    read.innerHTML = '<p class="muted">Impression du tracé…</p>';
    // le papier sort de l'imprimante à vitesse constante : révélation linéaire de gauche à droite
    adoAnim = host.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 2600, easing: 'linear' });
    adoAnim.finished.then(done, () => {});
  }
  function initAdo() {
    adoPaper = strip($('svAdoPaper'));
    seg($('svAdoSeg'), Object.keys(ADO).map(k => [k, ADO[k].label]), 'trin', k => adoShow(k, false));
    $('svAdoGo').addEventListener('click', () => adoShow(adoK, true));
    adoShow('trin', false);
  }

  /* =========================================================
     4. Algorithme : devant une tachycardie
     ========================================================= */
  const TREE = {
    start: { s: 'QRS', q: 'Les QRS sont-ils fins (< 120 ms) ?', hint: 'Mesurer dans la dérivation où le QRS paraît le plus large.', a: [['Fins', 'reg'], ['Larges (≥ 120 ms)', 'wide']] },
    reg: { s: 'Rythme', q: 'Le rythme est-il régulier ?', hint: 'Comparer plusieurs RR sur la bande de 10 s : au-delà de 150/min, l’irrégularité se voit mal.', a: [['Régulier', 'atr'], ['Irrégulier', 'irr']] },
    irr: { s: 'Activité atriale', q: 'Quelle activité atriale voit-on ?', hint: 'Regarder DII et V1.', a: [['Aucune P, trémulation de la ligne de base', 'e_fa'], ['Des P nettes d’au moins 3 formes', 'e_tam'], ['Ondes F organisées, conduction variable', 'e_flv']] },
    atr: { s: 'Rapport A/V', q: 'Y a-t-il plus d’ondes atriales que de QRS ?', hint: 'Chercher une onde cachée dans la T ou le QRS ; une manœuvre vagale peut la démasquer.', a: [['Oui, 2 pour 1 ou plus', 'e_more'], ['Non : 1 pour 1, ou aucune P visible', 'rp'], ['P plus lentes, sans lien avec les QRS', 'e_jet']] },
    rp: { s: 'Position de P', q: 'Où se trouve l’onde P par rapport au QRS ?', hint: 'Mesurer le RP, du début du QRS au début de la P qui suit (section 2).', a: [['Invisible ou collée au QRS (RP < 70 ms)', 'e_trin'], ['Dans le segment ST (RP > 70 ms, RP < PR)', 'e_trav'], ['Juste avant le QRS suivant (RP > PR)', 'e_long']] },
    wide: { tone: 'bad', title: 'QRS larges : TV jusqu’à preuve du contraire', text: 'Une tachycardie supraventriculaire peut avoir des QRS larges (bloc de branche, aberration, pré-excitation), mais ce diagnostic ne se pose qu’après avoir éliminé une TV. Irrégulière, très rapide, QRS changeants : FA pré-excitée.', act: 'Instable : choc électrique synchronisé. Jamais de vérapamil ni de freinateur nodal devant une tachycardie à QRS larges irrégulière.', cases: ['tv', 'travanti', 'fapx'] },
    e_fa: { title: 'Fibrillation atriale', text: 'Rythme irrégulièrement irrégulier sans onde P organisée.', act: 'Anticoagulation selon le CHA₂DS₂-VA, contrôle de la fréquence ou du rythme (parcours AF-CARE).', cases: ['fa'] },
    e_tam: { title: 'Tachycardie atriale multifocale', text: 'Au moins 3 formes de P, PR variables, ligne isoélectrique entre les P.', act: 'Traiter la cause pulmonaire ou métabolique. Pas de cardioversion.', cases: ['tam', 'esa'] },
    e_flv: { title: 'Flutter à conduction variable', text: 'Activité atriale continue sans ligne isoélectrique, conduction AV qui change d’un cycle à l’autre.', act: 'Anticoagulation comme la FA. Ablation de l’isthme cavo-tricuspide si flutter typique.', cases: ['flutter', 'flutatyp'] },
    e_more: { title: 'Flutter ou tachycardie atriale avec bloc', text: 'Dents de scie sans ligne isoélectrique : flutter. P fines séparées par une ligne isoélectrique : tachycardie atriale. Régulière à 150/min : flutter 2:1 jusqu’à preuve du contraire.', act: 'L’adénosine ne les arrête pas mais démasque l’activité atriale (section 3).', cases: ['flutter', 'ta', 'flutatyp'] },
    e_jet: { title: 'Dissociation AV à QRS fins', text: 'Un foyer jonctionnel commande les ventricules pendant que le sinus commande les oreillettes.', act: 'Chercher une intoxication digitalique, des catécholamines, un contexte post-opératoire.', cases: ['jet', 'rja'] },
    e_trin: { title: 'TRIN commune', text: 'La plus fréquente des tachycardies paroxystiques régulières : P rétrograde cachée, pseudo r′ en V1, début et fin brutaux.', act: 'Manœuvre vagale (Valsalva modifiée), puis adénosine. Ablation de la voie lente si récidives.', cases: ['trin'] },
    e_trav: { title: 'TRAV orthodromique', text: 'P rétrograde dans le ST : le circuit emprunte une voie accessoire pour remonter vers les oreillettes.', act: 'Manœuvre vagale, puis adénosine. Ablation de la voie accessoire.', cases: ['trav', 'wpw'] },
    e_long: { title: 'Tachycardie à RP long', text: 'Tachycardie atriale (la plus fréquente), PJRT de Coumel, TRIN atypique. P sinusale : tachycardie sinusale ou réentrée sinusale.', act: 'L’adénosine aide : la tachycardie atriale continue avec un bloc, la PJRT s’arrête puis récidive.', cases: ['ta', 'pjrt', 'tachy'] }
  };
  let path = ['start'];
  function algo(focus) {
    const trail = $('svTrail');
    trail.innerHTML = path.slice(0, -1).map((id, i) => {
      const n = TREE[id], ans = n.a.find(a => a[1] === path[i + 1]);
      return `<li><button class="sv-crumb" data-i="${i}"><span>${n.s}</span><b>${ans[0]}</b></button></li>`;
    }).join('');
    trail.querySelectorAll('.sv-crumb').forEach(b => b.addEventListener('click', () => { path = path.slice(0, +b.dataset.i + 1); algo(true); }));
    const n = TREE[path[path.length - 1]], box = $('svQ');
    if (n.a) {
      box.innerHTML = `<div class="sv-card"><p class="ctl-label">Question ${path.length}</p><h3 tabindex="-1">${n.q}</h3><p class="muted">${n.hint}</p>
        <div class="sv-answers">${n.a.map(a => `<button class="sv-ans" data-to="${a[1]}">${a[0]}</button>`).join('')}</div></div>`;
      box.querySelectorAll('.sv-ans').forEach(b => b.addEventListener('click', () => { path.push(b.dataset.to); algo(true); }));
    } else {
      box.innerHTML = `<div class="sv-card sv-end ${n.tone || ''}"><p class="ctl-label">Orientation</p><h3 tabindex="-1">${n.title}</h3><p>${n.text}</p>
        <p class="sv-act"><b>Conduite :</b> ${n.act}</p><p class="sv-links">${n.cases.map(id => link(id)).join('')}</p>
        <button class="btn ghost sv-restart">Recommencer</button></div>`;
      box.querySelector('.sv-restart').addEventListener('click', () => { path = ['start']; algo(true); });
    }
    // le bouton cliqué disparaît : on rend le focus au nouveau titre pour la navigation au clavier
    if (focus) box.querySelector('h3').focus({ preventScroll: true });
  }

  /* =========================================================
     5. Tableau de synthèse
     ========================================================= */
  const ROWS = [
    ['Sinusal', [
      ['tachy', 'Tachycardie sinusale', 'Automatisme sinusal', '> 100', 'P sinusale, accélération et ralentissement progressifs'],
      [null, 'Tachycardie sinusale inappropriée', 'Automatisme sinusal excessif', '> 100 au repos', 'P sinusale sans cause retrouvée : diagnostic d’exclusion'],
      [null, 'Réentrée sinusale', 'Réentrée autour du nœud sinusal', '100–150', 'P d’aspect sinusal, mais début et fin brutaux']
    ]],
    ['Atrial', [
      ['esa', 'Extrasystoles atriales', 'Foyer ectopique', '—', 'P prématurée différente, repos non compensateur'],
      ['ta', 'Tachycardie atriale focale', 'Foyer unique', '100–250', 'P non sinusale, ligne isoélectrique, RP long, bloc AV possible'],
      ['tam', 'Tachycardie atriale multifocale', 'Plusieurs foyers', '> 100', '≥ 3 formes de P, PP, PR et RR irréguliers'],
      ['flutter', 'Flutter typique', 'Macro-réentrée autour de l’anneau tricuspide', 'A ≈ 300', 'Dents de scie négatives en inférieur ; 2:1 = 150/min'],
      ['flutatyp', 'Flutter atypique', 'Macro-réentrée sur cicatrice', 'A 250–350', 'Activité continue, morphologie inhabituelle'],
      ['fa', 'Fibrillation atriale', 'Micro-réentrées multiples', 'A 400–600', 'Pas de P, RR irrégulièrement irréguliers']
    ]],
    ['Jonction AV', [
      ['rja', 'Rythme jonctionnel accéléré', 'Automatisme jonctionnel', '60–100', 'QRS fins, P rétrograde à PR court'],
      ['jet', 'Tachycardie jonctionnelle ectopique', 'Automatisme du His', '110–250', 'QRS fins, dissociation AV'],
      ['trin', 'TRIN commune (lente-rapide)', 'Réentrée intranodale', '150–250', 'P cachée, pseudo r′ en V1, RP < 70 ms'],
      [null, 'TRIN atypique (rapide-lente)', 'Réentrée intranodale inversée', '120–200', 'RP long, P négative en inférieur']
    ]],
    ['Voie accessoire', [
      ['wpw', 'Pré-excitation (WPW)', 'Faisceau de Kent', '—', 'PR court, onde delta, QRS large'],
      ['trav', 'TRAV orthodromique', 'Descente nodale, remontée par la voie', '150–250', 'QRS fins, P dans le ST, RP > 70 ms'],
      ['travanti', 'TRAV antidromique', 'Descente par la voie, remontée nodale', '150–250', 'QRS larges pré-excités : imite une TV'],
      ['pjrt', 'PJRT (Coumel)', 'Voie accessoire lente décrémentielle', '120–200', 'Incessante, RP > PR, P négatives profondes'],
      ['fapx', 'FA pré-excitée', 'FA conduite par la voie accessoire', 'jusqu’à 300', 'Irrégulière, très rapide, QRS larges changeants'],
      [null, 'Voie de Mahaim', 'Voie atriofasciculaire', '—', 'Pré-excitation à aspect de retard gauche']
    ]]
  ];
  function initTable() {
    $('svTable').innerHTML = `<thead><tr><th scope="col">Trouble</th><th scope="col">Mécanisme</th><th scope="col">Fréquence (/min)</th><th scope="col">Signes ECG clés</th><th scope="col"><span class="sr">Fiche</span></th></tr></thead>
      <tbody>${ROWS.map(([g, rows]) => `<tr class="sv-grp"><th colspan="5" scope="colgroup">${g}</th></tr>${rows.map(([id, t, m, f, s]) =>
        `<tr><td>${t}</td><td data-label="Mécanisme">${m}</td><td data-label="Fréquence" class="num">${f}</td><td data-label="ECG">${s}</td><td>${id ? link(id, 'Fiche') : '<span class="muted">—</span>'}</td></tr>`).join('')}`).join('')}</tbody>`;
  }

  /* =========================================================
     6. CHA₂DS₂-VA (ESC 2024)
     ========================================================= */
  const CHA = [['c', 'Insuffisance cardiaque', 1], ['h', 'Hypertension artérielle', 1], ['d', 'Diabète', 1],
    ['s', 'AVC, AIT ou embolie artérielle', 2], ['v', 'Maladie vasculaire (infarctus, AOMI, plaque aortique)', 1]];
  let age = 0;
  function score() {
    const s = age + CHA.reduce((n, [k, , p]) => n + ($('svCha_' + k).checked ? p : 0), 0);
    const [cls, txt] = s >= 2 ? ['bad', 'Anticoagulation orale recommandée'] : s === 1 ? ['warn', 'Anticoagulation à envisager'] : ['ok', 'Pas d’anticoagulation'];
    $('svScore').innerHTML = `<b class="num sv-big">${s}</b><span class="pill ${cls}">${txt}</span>`;
  }
  function initCalc() {
    $('svChecks').innerHTML = CHA.map(([k, l, p]) => `<label><input type="checkbox" id="svCha_${k}"><span>${l}</span><span class="pts">+${p}</span></label>`).join('') +
      '<div class="sv-age"><span>Âge</span><div class="seg sm" id="svAge" role="group" aria-label="Âge"></div></div>';
    seg($('svAge'), [['0', '< 65 ans'], ['1', '65–74 ans (+1)'], ['2', '≥ 75 ans (+2)']], '0', v => { age = +v; score(); });
    $('svChecks').querySelectorAll('input').forEach(i => i.addEventListener('change', score));
    score();
  }

  let inited = false;
  function init() {
    if (inited) return;
    inited = true;
    initMap(); initRp(); initAdo(); algo(false); initTable(); initCalc();
  }
  root.Supra = { init, redraw() { papers.forEach(p => p.draw()); } };
})(window);
