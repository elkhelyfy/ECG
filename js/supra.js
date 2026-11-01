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
  let mapPaper, mapId = 'trin', sim = null;
  function pickMap(id) {
    mapId = id;
    const c = LIB.byId(id), grp = MAP.find(g => g.items.includes(id));
    $('svHeart').dataset.lvl = grp.lvl;
    $('svGroups').querySelectorAll('.sv-pick').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
    $('svDetail').innerHTML = `<div class="sv-fade">
      <p class="eyebrow">${grp.label}</p>
      <h3>${c.title}</h3>
      <p>${c.mecanisme}</p>
      <p class="sv-keep">${c.retenir}</p>
      <p>${link(id, 'Ouvrir la fiche complète')}</p></div>`;
    // un seul rendu pour le tracé et pour le cœur : ils montrent exactement les mêmes événements
    const data = E.render(c.spec(17));
    mapPaper.set(data, onStrip(c.marks));
    sim.load(c, data, mapPaper);
  }
  function initMap() {
    $('svGroups').innerHTML = MAP.map(g => `<div class="sv-group"><p class="a-cat">${g.label}</p><div class="sv-picks">${
      g.items.map(id => `<button class="sv-pick" data-id="${id}" aria-pressed="false">${SHORT[id]}</button>`).join('')}</div></div>`).join('');
    $('svGroups').querySelectorAll('.sv-pick').forEach(b => b.addEventListener('click', () => pickMap(b.dataset.id)));
    mapPaper = strip($('svMapPaper'));
    sim = root.HeartSim.create($('svHeart'), {
      stage: $('svStage'), phases: $('svPhases'), caption: $('svCaption'), transport: $('svTransport'),
      play: $('svPlay'), prev: $('svPrev'), next: $('svNext'), speed: $('svSpeed'), scrub: $('svScrub'), time: $('svTime')
    });
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
  let rpPaper, rpK = 'trin';
  function setRp(k) {
    rpK = k;
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
  let adoPaper, adoK = 'trin', adoAnim = null, adoDone = false;
  function adoShow(k, inject) {
    adoK = k; adoDone = !!inject;
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

  /* =========================================================
     Fiche complète ouverte sur place : on ne quitte pas l'atelier
     ========================================================= */
  let dlg, dlgPaper, dlgId = null;
  function closeFiche(instant) {
    if (!dlg || !dlg.open || dlg.dataset.closing) return;
    if (instant === true || reduceMotion() || !dlg.animate) { dlg.close(); return; }
    dlg.dataset.closing = '1';
    const finish = () => { if (!dlg.dataset.closing) return; delete dlg.dataset.closing; anim.cancel(); dlg.close(); };
    // sortie plus rapide que l'entrée : le système répond, l'utilisateur n'attend pas
    const anim = dlg.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }],
      { duration: 140, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
    anim.finished.then(finish, finish);
    // filet de sécurité : si le rendu est suspendu (onglet en arrière-plan), la fermeture ne doit pas dépendre de l'animation
    setTimeout(finish, 220);
  }
  function openFiche(id) {
    const c = LIB.byId(id);
    if (!c) return;
    dlgId = id;
    if (!dlg) {
      dlg = $('svDialog');
      dlg.addEventListener('click', e => { if (e.target === dlg) closeFiche(); });
      dlg.addEventListener('cancel', e => { e.preventDefault(); closeFiche(); });
      $('svDlgClose').addEventListener('click', closeFiche);
      $('svDlgAtlas').addEventListener('click', () => closeFiche(true));
    }
    $('svDlgHead').innerHTML = `<p class="eyebrow">${c.catLabel}</p><h2 id="svDlgTitle">${c.title}</h2>
      <div class="tags">${root.Atlas.tags(c)}</div><p class="muted">${c.short}</p>`;
    $('svDlgFiche').innerHTML = root.Atlas.fiche(c);
    $('svDlgAtlas').dataset.case = id;
    if (!dlg.open) dlg.showModal();
    if (!dlgPaper) {
      dlgPaper = new root.Paper($('svDlgPaper'), { layout: '12' }); dlgPaper.annot = true; papers.push(dlgPaper);
      if (root.Chat) root.Chat.attach($('svDlgPaper'), () => root.Chat.forCase(LIB.byId(dlgId), { extra: 'Vue : fiche ouverte depuis l’atelier supraventriculaire, ECG 12 dérivations avec bande de rythme DII.' }));
    }
    dlgPaper.set(E.render(c.spec(17)), c.marks);
    dlg.querySelector('.sv-dlg-body').scrollTop = 0;
  }

  /* Assistant sous les tracés de l'atelier */
  function initChat() {
    const C = root.Chat;
    if (!C) return;
    C.attach($('svMapPaper'), () => C.forCase(LIB.byId(mapId), { extra: 'Vue : atelier supraventriculaire, carte des mécanismes ; bande DII de 10 s à 25 mm/s.' }));
    C.attach($('svRpPaper'), () => {
      const o = RP[rpK], rp = Math.round(o.rp * 1000), pr = Math.round((o.rr - o.rp) * 1000);
      return {
        key: 'rp' + rpK,
        text: [`Vue : atelier « Où est l’onde P ? ». Bande DII à 50 mm/s d’une tachycardie régulière à QRS fins, profil « ${o.label} ».`,
          `RR ${Math.round(o.rr * 1000)} ms (${Math.round(60 / o.rr)}/min), RP ${rp} ms, PR ${pr} ms. La P rétrograde et l’intervalle RP sont annotés.`,
          `Explication affichée : ${C.plain(o.read)}`,
          'Repères : RP < 70 ms = TRIN commune ; RP > 70 ms et RP < PR = TRAV orthodromique ; RP > PR = tachycardie à RP long (TA, PJRT, TRIN atypique).'].join('\n'),
        chips: [['Pourquoi ce RP oriente-t-il ?', `Pourquoi un RP de ${rp} ms oriente-t-il vers ce mécanisme ?`],
          ['Comment mesurer le RP ?', 'Comment mesurer le RP sur ce tracé, et dans quelle dérivation ?'],
          ['Pourquoi le seuil de 70 ms ?', 'Pourquoi utilise-t-on le seuil de 70 ms pour séparer TRIN et TRAV ?']]
      };
    });
    C.attach($('svAdoPaper'), () => {
      const o = ADO[adoK];
      return {
        key: 'ado' + adoK + adoDone,
        text: [`Vue : atelier « Test à l’adénosine ». Bande DII de 10 s. Tachycardie testée : ${o.label}. ${o.pre}`,
          adoDone ? `L’adénosine a été injectée vers la 4e seconde. Résultat affiché : ${C.plain(o.read)}`
            : 'L’adénosine n’a pas encore été injectée : seule la tachycardie de base est affichée.'].join('\n'),
        chips: adoDone
          ? [['Pourquoi ce résultat ?', 'Pourquoi l’adénosine a-t-elle eu cet effet sur ce tracé ?'],
            ['Et sur les autres tachycardies ?', 'Que montrerait l’adénosine sur une TRIN, une TRAV, un flutter et une tachycardie atriale ? Compare avec ce tracé.']]
          : [['Que va faire l’adénosine ?', 'Que va faire l’adénosine sur cette tachycardie, et pourquoi ?'],
            ['Quelles précautions ?', 'Quelles précautions avant d’injecter de l’adénosine devant ce tracé ?']]
      };
    });
  }

  let inited = false;
  function init() {
    if (inited) return;
    inited = true;
    initMap(); initRp(); initAdo(); algo(false); initTable(); initCalc(); initChat();
    // dans l'atelier, les liens « Fiche » ouvrent le panneau au lieu de basculer vers l'Atlas
    $('view-supra').addEventListener('click', e => {
      const a = e.target.closest('a[data-case]');
      if (!a || a.hasAttribute('data-atlas')) return;
      e.preventDefault();
      e.stopPropagation();
      openFiche(a.dataset.case);
    });
  }
  root.Supra = { init, redraw() { papers.forEach(p => p.draw()); if (sim) sim.frame(); } };
})(window);
