/* Atelier 3 : méthode de lecture en 10 étapes + outils de calcul. */
(function (root) {
  'use strict';
  const E = root.ECG, LIB = root.ECGCASES;

  const STEPS = [
    { title: 'Contrôle technique', look: 'Identité, date, heure. Étalonnage : le créneau de 1 mV doit mesurer 10 mm ; vitesse 25 mm/s. Qualité du signal et position des électrodes.',
      norms: ['1 mV = 10 mm (2 grands carreaux)', '1 petit carreau = 1 mm = 40 ms = 0,1 mV', '1 grand carreau = 5 mm = 200 ms = 0,5 mV'],
      bad: [['inversion', 'DI tout négatif : électrodes inversées']], marks: [{ lead: 'R', f: 'cal', label: '1 mV = 10 mm' }, { lead: 'I', f: 'cal', label: 'Étalonnage' }] },
    { title: 'Rythme', look: 'Sinusal ? Chaque P est suivie d’un QRS, chaque QRS est précédé d’une P, la P est positive en DI, DII, aVF. Régulier ou non ?',
      norms: ['P positive en DII, négative en aVR', 'Rapport P/QRS = 1/1, PR constant', 'RR réguliers'],
      bad: [['fa', 'Pas de P, irrégulier : FA'], ['flutter', 'Dents de scie : flutter'], ['bav3', 'P et QRS dissociés']], marks: [{ lead: 'R', f: 'p', which: 'all', label: 'P avant chaque QRS' }] },
    { title: 'Fréquence', look: 'Rythme régulier : 300 ÷ nombre de grands carreaux entre deux R (ou 1500 ÷ petits carreaux). Irrégulier : nombre de QRS sur 10 s × 6.',
      norms: ['60 à 100 /min', '300 – 150 – 100 – 75 – 60 – 50 pour 1, 2, 3, 4, 5, 6 grands carreaux'],
      bad: [['tachy', '> 100 : tachycardie'], ['brady', '< 60 : bradycardie']], marks: [{ lead: 'R', f: 'rr', label: 'RR = 4 grands carreaux → 75/min' }] },
    { title: 'Axe', look: 'Regarder le QRS en DI et aVF. Positif dans les deux = axe normal. Affiner avec DII, ou trouver la dérivation où le QRS est isodiphasique : l’axe lui est perpendiculaire.',
      norms: ['Normal : −30° à +90°', 'Gauche : −30° à −90°', 'Droit : +90° à +180°'],
      bad: [['hbag', 'Axe hypergauche : HBAG'], ['ep', 'Axe droit : surcharge droite']], marks: [{ lead: 'I', f: 'qrs', label: 'DI +' }, { lead: 'aVF', f: 'qrs', label: 'aVF +' }] },
    { title: 'Onde P', look: 'Durée, amplitude, morphologie en DII et V1.',
      norms: ['Durée < 120 ms (3 petits carreaux)', 'Amplitude < 2,5 mm en DII', 'V1 : positive ou biphasique'],
      bad: [['hyperk', 'P aplatie : hyperkaliémie']], marks: [{ lead: 'II', f: 'p', label: 'P < 120 ms, < 2,5 mm' }, { lead: 'V1', f: 'p', label: 'Biphasique' }] },
    { title: 'Intervalle PR', look: 'Du début de P au début du QRS. Constant ?',
      norms: ['120 à 200 ms (3 à 5 petits carreaux)'],
      bad: [['bav1', '> 200 ms : BAV 1'], ['wpw', '< 120 ms + delta : WPW'], ['bav2m1', 'PR qui s’allonge : Wenckebach']], marks: [{ lead: 'R', f: 'pr', label: 'PR 160 ms' }] },
    { title: 'Complexe QRS', look: 'Durée (fin ou large), amplitude (hypertrophie, microvoltage), ondes Q pathologiques, progression de R de V1 à V6.',
      norms: ['Durée < 120 ms (< 100 ms habituellement)', 'Sokolow S V1 + R V5/V6 < 35 mm', 'Q pathologique si ≥ 40 ms ou ≥ 1/3 du QRS', 'Transition R/S en V3–V4'],
      bad: [['bbd', 'rsR′ V1 : BBD'], ['bbg', 'QS V1, R crochetée V6 : BBG'], ['hvg', 'Voltage ↑ : HVG'], ['necinf', 'Q de nécrose']], marks: [{ lead: 'V1', f: 'qrs', label: 'rS' }, { lead: 'V6', f: 'qrs', label: 'qR' }, { lead: 'R', f: 'qrs', label: '< 120 ms' }] },
    { title: 'Segment ST', look: 'Comparer le point J à la ligne de base (segment PR ou TP). Sus- ou sous-décalage, forme, territoire, miroir.',
      norms: ['Isoélectrique', 'Sus-décalage pathologique ≥ 1 mm (≥ 2 mm en V2–V3 chez l’homme) dans 2 dérivations contiguës'],
      bad: [['stemiant', 'Convexe + miroir : STEMI'], ['peri', 'Diffus, concave : péricardite'], ['scamoins', 'Sous-décalage diffus'], ['brugada', 'Dôme en V1–V2']], marks: [{ lead: 'II', f: 'st', label: 'ST isoélectrique' }, { lead: 'V2', f: 'st', label: 'ST plat' }] },
    { title: 'Onde T', look: 'Sens, symétrie, amplitude. La T suit normalement le sens du QRS.',
      norms: ['Positive sauf aVR (négative), ± V1 et DIII', 'Asymétrique : montée lente, descente rapide', '< 5 mm en périphérie, < 10 mm en précordial'],
      bad: [['hyperk', 'Pointue symétrique : hyperkaliémie'], ['wellens', 'Négative profonde V2–V3 : Wellens'], ['hypok', 'Plate + U : hypokaliémie']], marks: [{ lead: 'II', f: 't', label: 'T positive' }, { lead: 'aVR', f: 't', label: 'Négative en aVR' }] },
    { title: 'Intervalle QT', look: 'Du début du QRS à la fin de la T, en DII ou V5. Le corriger par la fréquence.',
      norms: ['QTc Bazett = QT / √RR (RR en secondes)', 'Normal < 440 ms (homme), < 460 ms (femme)', '> 500 ms : risque de torsades', 'Repère : QT < RR/2 entre 60 et 100/min'],
      bad: [['qtlong', 'QT long'], ['tdp', 'Torsades de pointes']], marks: [{ lead: 'R', f: 'qt', label: 'QT ≈ 380 ms' }] }
  ];

  let paper, cur = 0, normal;

  function renderStep() {
    const s = STEPS[cur];
    document.querySelectorAll('#steps button').forEach((b, i) => b.setAttribute('aria-current', i === cur ? 'step' : 'false'));
    document.getElementById('stepCard').innerHTML = `
      <p class="eyebrow">Étape ${cur + 1} sur ${STEPS.length}</p>
      <h3>${s.title}</h3>
      <p>${s.look}</p>
      <div class="step-cols">
        <div><h4>Valeurs normales</h4><ul class="norms">${s.norms.map(n => `<li>${n}</li>`).join('')}</ul></div>
        <div><h4>Si c’est anormal</h4><ul class="links">${s.bad.map(([id, t]) => `<li><a href="#atlas" data-case="${id}">${t}</a></li>`).join('')}</ul></div>
      </div>
      <div class="step-nav"><button class="btn ghost" id="stepPrev" ${cur === 0 ? 'disabled' : ''}>Étape précédente</button><button class="btn" id="stepNext" ${cur === STEPS.length - 1 ? 'disabled' : ''}>Étape suivante</button></div>`;
    document.getElementById('stepPrev').onclick = () => { cur--; renderStep(); };
    document.getElementById('stepNext').onclick = () => { cur++; renderStep(); };
    paper.annot = true;
    paper.set(normal, s.marks);
  }

  /* --- Outil FC --- */
  let fcPaper, fcRaf = 0;
  function fcUpdate() {
    const hr = +document.getElementById('fcRange').value;
    const rrBig = 300 / hr;
    document.getElementById('fcOut').innerHTML = `<b class="num">${hr}</b>/min · RR = <b class="num">${(60 / hr * 1000).toFixed(0)} ms</b> = <b class="num">${rrBig.toFixed(1)}</b> grands carreaux → 300 ÷ ${rrBig.toFixed(1)} = <b class="num">${hr}</b>`;
    cancelAnimationFrame(fcRaf);
    fcRaf = requestAnimationFrame(() => {
      const d = E.render({ duration: 10, seed: 3, rhythm: (r, D) => { const ev = []; for (let t = 0.12; t < D + 0.5; t += 60 / hr) { ev.push({ type: 'P', t, m: 'normal', qrsT: t + 0.15 }); ev.push({ type: 'QRS', t: t + 0.15, m: 'normal' }); } return ev; }, noise: 0.004 });
      fcPaper.annot = true;
      fcPaper.set(d, [{ lead: 'II', f: 'rr', which: 0, label: `${rrBig.toFixed(1)} grands carreaux` }]);
    });
  }
  /* --- QTc --- */
  function qtcUpdate() {
    const qt = +document.getElementById('qtIn').value, hr = +document.getElementById('qtHr').value;
    const sex = document.getElementById('qtSex').value;
    const out = document.getElementById('qtOut');
    if (!qt || !hr) { out.innerHTML = '<p class="muted">Saisissez le QT et la fréquence.</p>'; return; }
    const rr = 60 / hr, baz = qt / Math.sqrt(rr), fri = qt / Math.cbrt(rr);
    const lim = sex === 'f' ? 460 : 440;
    const lvl = baz > 500 ? ['bad', 'Très allongé : risque de torsades'] : baz > lim ? ['warn', 'Allongé'] : baz < 340 ? ['warn', 'Court (< 340 ms)'] : ['ok', 'Normal'];
    out.innerHTML = `<p class="big"><span class="pill ${lvl[0]}">${lvl[1]}</span></p>
      <p>Bazett : <b class="num">${Math.round(baz)} ms</b> · Fridericia : <b class="num">${Math.round(fri)} ms</b></p>
      <p class="muted">RR = ${rr.toFixed(2)} s. Au-dessus de 100/min, Bazett surcorrige : préférer Fridericia.</p>`;
  }
  /* --- Axe rapide --- */
  const ax = { I: 1, aVF: 1, II: 1 };
  function axUpdate() {
    let res, cls;
    if (ax.I > 0 && ax.aVF > 0) { res = 'Axe normal (0° à +90°)'; cls = 'ok'; }
    else if (ax.I > 0 && ax.aVF < 0) { if (ax.II > 0) { res = 'Axe normal (−30° à 0°)'; cls = 'ok'; } else { res = 'Déviation axiale gauche (< −30°)'; cls = 'warn'; } }
    else if (ax.I < 0 && ax.aVF > 0) { res = 'Déviation axiale droite (+90° à +180°)'; cls = 'warn'; }
    else { res = 'Axe hyperdroit (−90° à −180°)'; cls = 'bad'; }
    document.getElementById('axOut').innerHTML = `<span class="pill ${cls}">${res}</span>`;
    document.getElementById('axII').hidden = !(ax.I > 0 && ax.aVF < 0);
  }

  function init() {
    const ol = document.getElementById('steps');
    ol.innerHTML = STEPS.map((s, i) => `<li><button data-i="${i}"><span class="n">${i + 1}</span>${s.title}</button></li>`).join('');
    ol.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { cur = +b.dataset.i; renderStep(); }));
    paper = new root.Paper(document.getElementById('methodPaper'), { layout: '12' });
    normal = E.render(LIB.byId('rsn').spec(5));
    if (root.Chat) root.Chat.attach(document.getElementById('methodPaper'), () => {
      const s = STEPS[cur];
      return {
        key: 'step' + cur,
        text: [`Vue : méthode de lecture, étape ${cur + 1} sur ${STEPS.length} « ${s.title} ».`,
          'Tracé affiché : ECG normal de référence (rythme sinusal à 75/min), 12 dérivations avec bande de rythme DII.',
          `Ce qu’il faut regarder : ${s.look}`, `Valeurs normales : ${s.norms.join(' ; ')}`,
          `Si c’est anormal : ${s.bad.map(b => b[1]).join(' ; ')}`,
          `Repères annotés : ${s.marks.map(m => m.label).filter(Boolean).join(', ')}`].join('\n'),
        chips: [['Comment mesurer ici ?', `À l’étape « ${s.title} », comment mesurer concrètement sur ce tracé ?`],
          ['Pourquoi c’est normal ?', `Pourquoi ce tracé est-il normal pour l’étape « ${s.title} » ?`]]
          .concat(s.bad.slice(0, 1).map(([, t]) => [`Et si : ${t} ?`, `À l’étape « ${s.title} », à quoi ressemblerait ce tracé en cas de « ${t} » ? Qu’est-ce qui changerait ?`]))
      };
    });
    renderStep();

    fcPaper = new root.Paper(document.getElementById('fcPaper'), { layout: 'strip', leads: ['II'], rowH: 26, minK: 2.6 });
    document.getElementById('fcRange').addEventListener('input', fcUpdate);
    fcUpdate();
    ['qtIn', 'qtHr', 'qtSex'].forEach(id => document.getElementById(id).addEventListener('input', qtcUpdate));
    qtcUpdate();
    document.querySelectorAll('[data-ax]').forEach(g => g.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      ax[g.dataset.ax] = +b.dataset.v; axUpdate();
    })));
    axUpdate();
  }
  root.Method = { init, redraw: () => { paper && paper.draw(); fcPaper && fcPaper.draw(); } };
})(window);
