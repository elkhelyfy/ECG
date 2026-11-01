/* Bibliothèque de tracés : chaque cas = une spécification de synthèse + une fiche pédagogique. */
(function (root) {
  'use strict';
  const E = root.ECG, S = E.RHYTHMS.sinus;

  const CATS = [
    { id: 'base', label: 'Normal & rythmes sinusaux' },
    { id: 'supra', label: 'Troubles du rythme supraventriculaires' },
    { id: 'ventri', label: 'Troubles du rythme ventriculaires' },
    { id: 'cond', label: 'Troubles de conduction' },
    { id: 'isch', label: 'Ischémie & infarctus' },
    { id: 'divers', label: 'Métabolique & divers' }
  ];

  /* ---- Générateurs de rythmes spécifiques ---- */
  function withPremature(o) {
    // o.kind 'esa' | 'esv', o.at : indices des battements prématurés
    return (r, D) => {
      const hr = o.hr || 72, rr = 60 / hr, pr = 0.16, ev = [];
      let t = -rr + 0.2 + r() * 0.2, i = 0, lastQ = null;
      while (t < D + 0.5) {
        if (o.at.includes(i) && lastQ != null) {
          if (o.kind === 'esv') {
            ev.push({ type: 'P', t, m: 'normal', conducted: false });
            const q = lastQ + rr * 0.58;
            ev.push({ type: 'QRS', t: q, m: 'pvc' });
            lastQ = null; t += rr; i++; continue;
          } else {
            const pt = lastQ - pr + rr * 0.6;
            ev.push({ type: 'P', t: pt, m: 'ectopicP', qrsT: pt + 0.15 });
            ev.push({ type: 'QRS', t: pt + 0.15, m: 'normal', ectopic: true });
            lastQ = pt + 0.15; t = pt + rr * 1.02; i++; continue;
          }
        }
        ev.push({ type: 'P', t, m: 'normal', qrsT: t + pr });
        ev.push({ type: 'QRS', t: t + pr, m: 'normal' });
        lastQ = t + pr; t += rr * (1 + 0.01 * E.randn(r)); i++;
      }
      return ev;
    };
  }
  function irregular(o) {
    return (r, D) => {
      const ev = []; let t = -0.3 + r() * 0.3;
      while (t < D + 0.5) { ev.push({ type: 'QRS', t, m: o.m || 'normal' }); t += o.min + r() * (o.max - o.min); }
      return ev;
    };
  }
  function regularQRS(o) {
    // o.retro : true (P collée au QRS) ou décalage en s (négatif = P avant le QRS) ; o.alt : alternance électrique
    return (r, D) => {
      const ev = []; let t = o.start ?? (-0.2 + r() * 0.2), n = 0;
      while (t < D + 0.5) {
        ev.push({ type: 'QRS', t, m: o.m || 'normal', k: o.alt && n % 2 ? o.alt : 1 });
        if (o.retro) ev.push({ type: 'P', t: t + (o.retro === true ? 0.07 : o.retro), m: o.rm || 'retro' });
        t += o.rr; n++;
      }
      if (o.p) { let p = 0.12 + r() * 0.3; while (p < D + 0.5) { ev.push({ type: 'P', t: p, m: 'normal', conducted: false }); p += o.p; } }
      return ev;
    };
  }
  function avBlock(o) {
    // o.pattern : liste de PR (null = onde P bloquée)
    return (r, D) => {
      const ev = []; let t = -o.pp + 0.25, i = 0;
      while (t < D + 0.5) {
        const pr = o.pattern[i % o.pattern.length];
        if (pr == null) ev.push({ type: 'P', t, m: 'normal', conducted: false });
        else { ev.push({ type: 'P', t, m: 'normal', qrsT: t + pr }); ev.push({ type: 'QRS', t: t + pr, m: o.m || 'normal' }); }
        t += o.pp; i++;
      }
      return ev;
    };
  }
  function flutter(r, D) {
    const ev = [], off = 0.05;
    let n = 0;
    while (true) {
      const ratio = off + n * 0.2 < 5 ? 2 : 4;
      const t = off + n * 0.2 + 0.26;
      if (t > D + 0.5) break;
      ev.push({ type: 'QRS', t, m: 'normal' });
      n += ratio;
    }
    return ev;
  }
  // activité atriale ondes P par ondes P : pp, pr et morphologie fixes ou fonctions ; conduct(i, t) décide du passage AV
  function atrial(o) {
    const val = (v, i, r, d) => (typeof v === 'function' ? v(i, r) : (v ?? d));
    return (r, D) => {
      const ev = []; let t = o.start ?? (0.1 + r() * 0.2), i = 0;
      while (t < D + 0.5) {
        const pm = val(o.pm, i, r, 'normal'), pr = val(o.pr, i, r, 0.16);
        if (!o.conduct || o.conduct(i, t)) {
          ev.push({ type: 'P', t, m: pm, qrsT: t + pr });
          ev.push({ type: 'QRS', t: t + pr, m: o.m || 'normal' });
        } else ev.push({ type: 'P', t, m: pm, conducted: false });
        t += val(o.pp, i, r, 0.8); i++;
      }
      return ev;
    };
  }
  // flutter à conduction variable : ratio(t) = nombre d'ondes F par QRS
  function flutterVar(o) {
    return (r, D) => {
      const ev = []; let n = 0, j = 0;
      while (true) {
        const t = o.off + n * o.per + o.delay;
        if (t > D + 0.5) break;
        ev.push({ type: 'QRS', t, m: 'normal' });
        n += typeof o.ratio === 'function' ? o.ratio(t, j) : o.ratio[j % o.ratio.length];
        j++;
      }
      return ev;
    };
  }
  // FA pré-excitée : RR très courts et irréguliers, degré de pré-excitation variable
  function preexAF(r, D) {
    const ev = []; let t = 0.1 + r() * 0.2;
    while (t < D + 0.5) {
      const u = r();
      ev.push({ type: 'QRS', t, m: u < 0.6 ? 'preex' : u < 0.85 ? 'wpw' : 'normal' });
      t += 0.23 + r() * 0.3;
    }
    return ev;
  }
  const MAT = ['normal', 'ectopicP', 'atrialP', 'mat3'];
  function torsades(r, D) {
    return [
      { type: 'P', t: 0.1, m: 'normal', qrsT: 0.26 }, { type: 'QRS', t: 0.26, m: 'longqt' },
      { type: 'P', t: 1.25, m: 'normal', qrsT: 1.41 }, { type: 'QRS', t: 1.41, m: 'longqt' },
      { type: 'QRS', t: 2.25, m: 'pvc' },
      { type: 'P', t: 8.75, m: 'normal', qrsT: 8.91 }, { type: 'QRS', t: 8.91, m: 'longqt', rr: 1.1 }
    ];
  }

  const sp = (rhythm, extra) => seed => Object.assign({ duration: 10, seed, rhythm }, extra || {});

  /* ---- Les cas ---- */
  const CASES = [
    {
      id: 'rsn', cat: 'base', title: 'Rythme sinusal normal', tags: ['Référence'],
      short: 'Le tracé de référence : chaque P est suivie d’un QRS fin, à 75/min.',
      spec: sp(S({ hr: 75 })),
      marks: [{ lead: 'R', f: 'p', label: 'P sinusale' }, { lead: 'R', f: 'pr', which: 1, label: 'PR 160 ms' }, { lead: 'V1', f: 'qrs', label: 'rS' }, { lead: 'V6', f: 'qrs', label: 'qR' }],
      criteres: ['Onde P positive en DI, DII, aVF ; négative en aVR', 'Chaque P suivie d’un QRS, PR constant (120–200 ms)', 'QRS fins (< 120 ms), axe entre −30° et +90°', 'Progression de R de V1 à V6, transition en V3–V4', 'ST isoélectrique, T positives (sauf aVR, ± V1 et DIII)'],
      mecanisme: 'Le nœud sinusal commande. L’onde de dépolarisation descend vers la gauche et la pointe : les dérivations qui « regardent » vers le bas et la gauche (DII, V5, V6) voient le vecteur arriver vers elles et inscrivent une onde positive.',
      pieges: ['Une T négative isolée en DIII ou V1 peut être normale', 'Une petite onde q fine (< 40 ms) en DI, aVL, V5–V6 est septale et normale'],
      conduite: 'Servir de comparaison : toujours confronter un ECG à un tracé antérieur quand il existe.',
      retenir: 'Sinusal = P positive en DI–DII–aVF, chaque P suivie d’un QRS, PR constant.',
      confond: ['tachy', 'brady', 'arythmie']
    },
    {
      id: 'tachy', cat: 'base', title: 'Tachycardie sinusale', tags: ['Fréquent'],
      short: 'Rythme sinusal au-dessus de 100/min, P toujours visibles devant chaque QRS.',
      spec: sp(S({ hr: 122, pr: 0.14 })),
      marks: [{ lead: 'R', f: 'rr', label: 'RR ≈ 2,5 grands carreaux' }, { lead: 'II', f: 'p', label: 'P sinusale' }],
      criteres: ['FC > 100/min', 'P sinusale devant chaque QRS, morphologie normale', 'PR un peu raccourci, QT raccourci', 'Accélération et ralentissement progressifs'],
      mecanisme: 'Le nœud sinusal accélère sous l’effet du tonus sympathique. Toute la chaîne de conduction est normale, seul le métronome va plus vite.',
      pieges: ['À 150/min, un flutter 2:1 peut se faire passer pour une tachycardie sinusale : chercher une onde F cachée dans la T', 'Une tachycardie sinusale inexpliquée doit faire chercher une cause'],
      conduite: 'Traiter la cause : fièvre, douleur, hypovolémie, anémie, hypoxie, embolie pulmonaire, hyperthyroïdie, sepsis, sevrage.',
      retenir: 'Tachycardie sinusale = symptôme : on cherche la cause, on ne traite pas l’ECG.',
      confond: ['rsn', 'flutter', 'trin', 'ep']
    },
    {
      id: 'brady', cat: 'base', title: 'Bradycardie sinusale', tags: [],
      short: 'Rythme sinusal en dessous de 60/min avec une conduction normale.',
      spec: sp(S({ hr: 46 })),
      marks: [{ lead: 'R', f: 'rr', label: 'RR > 6 grands carreaux' }, { lead: 'R', f: 'pr', label: 'PR normal' }],
      criteres: ['FC < 60/min', 'P sinusale devant chaque QRS', 'PR constant et normal', 'QRS fins'],
      mecanisme: 'Le nœud sinusal ralentit (tonus vagal, médicaments, dysfonction sinusale). La conduction en aval reste intacte.',
      pieges: ['Physiologique chez le sportif et pendant le sommeil', 'Ne pas confondre avec un BAV 2:1 : chercher une P cachée dans l’onde T'],
      conduite: 'Rechercher bêtabloquants, inhibiteurs calciques bradycardisants, digoxine, amiodarone, hypothyroïdie, hyperkaliémie, hypothermie. Atropine si mal tolérée.',
      retenir: 'Bradycardie + symptômes = chercher un médicament et un trouble métabolique.',
      confond: ['rsn', 'bav1', 'hypotherm']
    },
    {
      id: 'arythmie', cat: 'base', title: 'Arythmie sinusale respiratoire', tags: ['Piège'],
      short: 'Rythme sinusal dont la fréquence varie avec la respiration.',
      spec: sp(S({ hr: 70, resp: 0.22, jitter: 0.005 })),
      marks: [{ lead: 'R', f: 'p', which: 'all', label: 'P identiques' }],
      criteres: ['P sinusales identiques devant chaque QRS', 'RR variable de façon progressive et cyclique', 'Accélération à l’inspiration, ralentissement à l’expiration'],
      mecanisme: 'L’inspiration diminue le tonus vagal, ce qui accélère le nœud sinusal. Phénomène physiologique, marqué chez l’enfant et le sujet jeune.',
      pieges: ['Ce n’est pas une FA : les ondes P sont présentes et toutes identiques'],
      conduite: 'Aucun traitement. Simple variante de la normale.',
      retenir: 'Irrégulier avec des P identiques = sinusal. Irrégulier sans P = FA.',
      confond: ['fa', 'esa', 'rsn']
    },
    {
      id: 'esa', cat: 'supra', title: 'Extrasystoles auriculaires', tags: ['Fréquent'],
      short: 'Battements prématurés précédés d’une onde P de forme différente, QRS fin.',
      spec: sp(withPremature({ kind: 'esa', at: [4, 9], hr: 70 })),
      marks: [{ lead: 'R', f: 'p', which: 'ectopic', label: 'P prématurée différente' }],
      criteres: ['Onde P prématurée de morphologie différente de la P sinusale', 'QRS fin, identique aux QRS de base', 'Repos non compensateur (le nœud sinusal est remis à zéro)'],
      mecanisme: 'Un foyer auriculaire ectopique se dépolarise avant le nœud sinusal. Le vecteur de l’oreillette part d’un autre point, d’où une P de forme différente. La conduction vers les ventricules reste normale.',
      pieges: ['Une ESA précoce peut être bloquée (P sans QRS) et simuler une pause sinusale', 'Une ESA peut être conduite avec aberration (QRS large)'],
      conduite: 'Le plus souvent bénignes. Corriger excitants (café, alcool, tabac), rechercher une cardiopathie si nombreuses : elles peuvent annoncer une FA.',
      retenir: 'ESA = P prématurée différente + QRS fin + repos non compensateur.',
      confond: ['esv', 'fa', 'arythmie']
    },
    {
      id: 'fa', cat: 'supra', title: 'Fibrillation atriale', tags: ['Fréquent', 'Concours'],
      short: 'Rythme irrégulièrement irrégulier, sans onde P, avec trémulation de la ligne de base.',
      spec: sp(irregular({ min: 0.42, max: 1.0 }), { bg: [{ kind: 'af', amp: 1.2 }] }),
      marks: [{ lead: 'R', f: 'window', t0: 0.0, t1: 2.4, label: 'RR irréguliers, pas de P' }, { lead: 'V1', f: 'window', label: 'Ondes f' }],
      criteres: ['Absence d’onde P', 'Ondes f : trémulation irrégulière de la ligne de base (mieux vue en V1 et DII), 400–600/min', 'RR totalement irréguliers', 'QRS fins le plus souvent'],
      mecanisme: 'Des centaines de micro-réentrées désorganisent les oreillettes : plus de vecteur auriculaire cohérent, donc plus de P. Le nœud AV filtre au hasard, d’où des RR imprévisibles.',
      pieges: ['FA à réponse rapide (> 150/min) : l’irrégularité devient difficile à voir, mesurer plusieurs RR', 'FA + QRS larges très rapides et irréguliers : penser à une pré-excitation (WPW), contre-indication aux freinateurs nodaux'],
      conduite: 'Évaluer la tolérance. Anticoagulation selon le score CHA₂DS₂-VA, contrôle de la fréquence (bêtabloquant) ou du rythme (cardioversion après ETO ou anticoagulation ≥ 3 semaines si > 48 h).',
      retenir: 'Irrégulièrement irrégulier sans P = FA jusqu’à preuve du contraire. Toujours penser anticoagulation.',
      confond: ['flutter', 'tam', 'fapx', 'arythmie', 'esa']
    },
    {
      id: 'flutter', cat: 'supra', title: 'Flutter atrial typique', tags: ['Concours', 'Piège'],
      short: 'Ondes F en dents de scie à 300/min ; conduction 2:1 (150/min) puis 4:1 après manœuvre vagale.',
      spec: sp(flutter, { bg: [{ kind: 'flutter', period: 0.2, offset: 0.05 }] }),
      marks: [{ lead: 'R', f: 'window', t0: 6.0, t1: 8.6, label: 'Dents de scie (4:1)' }, { lead: 'R', f: 'window', t0: 0.3, t1: 2.6, label: '2:1 → 150/min' }, { lead: 'V1', f: 'window', label: 'F positives en V1' }],
      criteres: ['Activité auriculaire régulière à ~300/min, sans retour à la ligne isoélectrique', 'Ondes F négatives en DII, DIII, aVF (aspect en dents de scie), positives en V1', 'Conduction AV fixe (2:1, 3:1, 4:1) ou variable', 'QRS fins'],
      mecanisme: 'Une macro-réentrée tourne autour de l’anneau tricuspide (sens antihoraire dans le flutter typique). Une boucle complète toutes les 200 ms donne une onde F toutes les 200 ms. Le nœud AV ne laisse passer qu’une onde sur deux ou sur quatre.',
      pieges: ['Tachycardie régulière à 150/min = flutter 2:1 jusqu’à preuve du contraire', 'Une onde F sur deux se cache dans le QRS ou la T : la manœuvre vagale ou l’adénosine démasquent les dents de scie'],
      conduite: 'Même anticoagulation que la FA. Contrôle de fréquence souvent difficile ; traitement de choix : ablation de l’isthme cavo-tricuspide.',
      retenir: 'Dents de scie en DII–DIII–aVF à 300/min ; 150/min régulier = penser flutter 2:1.',
      confond: ['fa', 'flutatyp', 'ta', 'tachy', 'trin']
    },
    {
      id: 'trin', cat: 'supra', title: 'Tachycardie jonctionnelle (TRIN)', tags: ['Concours'],
      short: 'Tachycardie régulière à QRS fins, 180/min, sans onde P visible devant les QRS.',
      spec: sp(regularQRS({ rr: 0.333, retro: true })),
      marks: [{ lead: 'R', f: 'rr', label: 'RR fixes, 180/min' }, { lead: 'V1', f: 'qrs', label: 'Pseudo r′' }, { lead: 'II', f: 'qrs', label: 'Pseudo S (P rétrograde)' }],
      criteres: ['Tachycardie régulière à QRS fins, 150–250/min', 'Pas d’onde P avant les QRS', 'P rétrograde parfois visible juste après le QRS : pseudo r′ en V1, pseudo S en DII–DIII–aVF', 'Début et fin brutaux (maladie de Bouveret)'],
      mecanisme: 'Réentrée intra-nodale : deux voies de conduction dans le nœud AV forment une boucle. Ventricules et oreillettes sont activés presque en même temps, la P est cachée dans le QRS ou juste après.',
      pieges: ['Ne pas la confondre avec un flutter 2:1 (150/min, dents de scie)', 'Si les QRS sont larges : considérer comme une TV jusqu’à preuve du contraire'],
      conduite: 'Manœuvres vagales (Valsalva modifiée), puis adénosine (Striadyne) IV sous scope. Choc électrique si mauvaise tolérance. Ablation de la voie lente si récidives.',
      retenir: 'Régulière, fine, rapide, sans P, début brutal = TRIN. 1ʳᵉ ligne : manœuvre vagale puis adénosine.',
      confond: ['flutter', 'trav', 'tachy', 'tv']
    },
    {
      id: 'ta', cat: 'supra', title: 'Tachycardie atriale focale', tags: ['Concours'],
      short: 'Ondes P régulières à 136/min, non sinusales (négatives en DII–DIII–aVF), séparées par une ligne isoélectrique ; passage en 2:1 sans arrêt.',
      spec: sp(atrial({ pp: 0.44, pr: 0.15, pm: 'atrialP', conduct: (i, t) => (t % 10) < 5.5 || i % 2 === 0 })),
      marks: [{ lead: 'II', f: 'p', which: 'allP', label: 'P négatives en DII' }, { lead: 'R', f: 'rp', label: 'RP long > PR' }, { lead: 'R', f: 'window', t0: 6.1, t1: 9.6, label: 'Bloc 2:1 : la TA continue' }],
      criteres: ['Tachycardie régulière, fréquence atriale 100–250/min', 'Onde P monomorphe de morphologie non sinusale (ici négative en inférieur : foyer bas situé)', 'Retour à la ligne isoélectrique entre les P (différence avec le flutter)', 'RP long (RP > PR) en conduction 1:1', 'Un bloc AV (2:1, Wenckebach) peut apparaître sans interrompre la tachycardie'],
      mecanisme: 'Un foyer atrial unique (automatique, déclenché ou micro-réentrant) décharge plus vite que le nœud sinusal. L’activation atriale part de ce foyer : la forme de la P renseigne sur sa localisation. Le nœud AV n’est pas dans le circuit : il peut bloquer sans arrêter la tachycardie.',
      pieges: ['Une P cachée dans la T peut faire croire à une TRIN : chercher une déformation de la T', 'TA avec bloc AV : penser à une intoxication digitalique', 'À 150/min en 2:1, la ligne isoélectrique entre les P la distingue du flutter'],
      conduite: 'Manœuvre vagale ou adénosine : la tachycardie persiste avec un bloc AV (ou s’arrête parfois). Ralentir par bêtabloquant ou inhibiteur calcique. Ablation par cathéter si récidivante, incessante ou responsable d’une cardiomyopathie rythmique (ESC 2019).',
      retenir: 'P non sinusale + ligne isoélectrique + RP long = tachycardie atriale. Le bloc AV ne l’arrête pas.',
      confond: ['flutter', 'tachy', 'pjrt', 'trin']
    },
    {
      id: 'tam', cat: 'supra', title: 'Tachycardie atriale multifocale', tags: ['Piège'],
      short: 'Rythme rapide et irrégulier avec des ondes P d’au moins trois formes différentes et des PR variables.',
      spec: sp(atrial({ pp: (i, r) => 0.44 + r() * 0.2, pr: (i, r) => 0.12 + r() * 0.08, pm: i => MAT[[0, 2, 1, 3, 2, 0, 3, 1][i % 8]] })),
      marks: [{ lead: 'II', f: 'p', which: 'allP', label: '≥ 3 formes de P' }, { lead: 'R', f: 'window', t0: 3.2, t1: 6.4, label: 'PP, PR et RR irréguliers' }],
      criteres: ['Fréquence > 100/min', 'Au moins 3 morphologies d’ondes P différentes dans une même dérivation', 'PP, PR et RR irréguliers', 'Ligne isoélectrique entre les P (différence avec la FA)'],
      mecanisme: 'Plusieurs foyers atriaux s’allument à tour de rôle, souvent par activité déclenchée sur des oreillettes distendues et hypoxiques. Chaque foyer donne sa propre P, avec son propre PR.',
      pieges: ['Ressemble à une FA à la palpation et sur un tracé rapide : chercher des P nettes', 'La cardioversion électrique et les antiarythmiques sont inefficaces'],
      conduite: 'Traiter la cause : décompensation de BPCO, hypoxie, hypokaliémie, hypomagnésémie, intoxication à la théophylline. Ralentir si besoin (inhibiteur calcique, bêtabloquant cardiosélectif si toléré). Pas de cardioversion.',
      retenir: 'Irrégulier + ≥ 3 formes de P = TAM : traiter le poumon, pas l’ECG.',
      confond: ['fa', 'esa', 'arythmie', 'ta']
    },
    {
      id: 'flutatyp', cat: 'supra', title: 'Flutter atypique', tags: [],
      short: 'Activité atriale ondulante continue à 250/min, positive en inférieur, sans ligne isoélectrique, conduction AV variable.',
      spec: sp(flutterVar({ off: 0.06, per: 0.24, delay: 0.2, ratio: [2, 2, 3, 2, 4, 3] }), { bg: [{ kind: 'flutterAtyp', period: 0.24, offset: 0.06 }] }),
      marks: [{ lead: 'II', f: 'window', label: 'Ondulation continue, positive' }, { lead: 'R', f: 'rr', which: 2, label: 'Conduction variable' }],
      criteres: ['Activité atriale organisée 250–350/min, sans ligne isoélectrique', 'Morphologie qui ne répond pas au flutter typique (ici ondes F positives en inférieur)', 'Conduction AV fixe ou variable', 'Terrain : cicatrice atriale (chirurgie cardiaque, ablation de FA, cardiopathie)'],
      mecanisme: 'Une macro-réentrée tourne autour d’un obstacle autre que l’isthme cavo-tricuspide : cicatrice de chirurgie ou d’ablation, zone fibreuse de l’oreillette gauche. Le circuit est différent, donc la forme et la polarité des ondes F aussi.',
      pieges: ['Une activité atriale continue à 250/min reste un flutter même sans dents de scie classiques', 'L’ablation de l’isthme cavo-tricuspide ne suffit pas : une cartographie est nécessaire'],
      conduite: 'Anticoagulation comme pour la FA. Contrôle de fréquence, cardioversion. Ablation guidée par cartographie électro-anatomique en centre expert.',
      retenir: 'Flutter atypique = activité atriale continue sans ligne isoélectrique, hors dents de scie classiques, sur oreillette cicatricielle.',
      confond: ['flutter', 'fa', 'ta']
    },
    {
      id: 'rja', cat: 'supra', title: 'Rythme jonctionnel accéléré', tags: [],
      short: 'QRS fins réguliers à 85/min, précédés d’une P rétrograde (négative en DII) avec un PR court.',
      spec: sp(regularQRS({ rr: 0.7, retro: -0.085 })),
      marks: [{ lead: 'II', f: 'p', which: 'retro', label: 'P rétrograde, PR court' }, { lead: 'R', f: 'rr', label: 'RR 700 ms : 85/min' }],
      criteres: ['Rythme régulier à QRS fins, 60–100/min (au-delà : tachycardie jonctionnelle)', 'P rétrograde (négative en DII, DIII, aVF) juste avant le QRS avec PR < 120 ms, cachée dans le QRS ou juste après', 'Début et fin progressifs (automatisme, pas de réentrée)'],
      mecanisme: 'Le tissu jonctionnel, pacemaker de secours à 40–60/min, s’accélère et prend la commande. Il active les ventricules par les voies normales (QRS fins) et remonte vers les oreillettes en sens inverse (P rétrograde).',
      pieges: ['Une P négative avec PR court peut évoquer une pré-excitation : ici pas d’onde delta, QRS fins', 'Peut s’accompagner d’une dissociation AV avec des P sinusales indépendantes'],
      conduite: 'Chercher la cause : intoxication digitalique (doser, arrêter la digoxine), ischémie inférieure, myocardite, post-chirurgie cardiaque, hypokaliémie. Le plus souvent pas de traitement antiarythmique.',
      retenir: 'QRS fins 60–100/min + P rétrograde à PR court = rythme jonctionnel accéléré : penser digoxine.',
      confond: ['rsn', 'wpw', 'jet', 'trin']
    },
    {
      id: 'jet', cat: 'supra', title: 'Tachycardie jonctionnelle ectopique', tags: [],
      short: 'Tachycardie régulière à QRS fins (143/min) avec des P sinusales plus lentes, dissociées des QRS.',
      spec: sp(regularQRS({ rr: 0.42, p: 0.85 })),
      marks: [{ lead: 'R', f: 'p', which: 'allP', label: 'P sinusales dissociées' }, { lead: 'R', f: 'rr', which: 1, label: 'QRS fins, 143/min' }],
      criteres: ['Tachycardie régulière à QRS fins, 110–250/min', 'Dissociation AV : P sinusales plus lentes que les QRS, sans lien fixe (ou P rétrogrades 1:1)', 'Parfois des captures sinusales', 'Début progressif, caractère souvent incessant'],
      mecanisme: 'Un foyer automatique du faisceau de His ou de la jonction décharge plus vite que le sinus. Les ventricules suivent le foyer, les oreillettes suivent le sinus : deux pacemakers indépendants.',
      pieges: ['Rare chez l’adulte, fréquente chez l’enfant après chirurgie cardiaque', 'Résiste à l’adénosine et à la cardioversion (automatisme)', 'QRS fins + dissociation AV : penser TJE ; QRS larges + dissociation : TV'],
      conduite: 'Corriger les facteurs favorisants (catécholamines, fièvre, troubles électrolytiques). Amiodarone ; refroidissement modéré chez l’enfant. Ablation prudente (risque de BAV) chez l’adulte symptomatique.',
      retenir: 'QRS fins rapides + P sinusales dissociées = tachycardie jonctionnelle ectopique.',
      confond: ['trin', 'rja', 'bav3', 'tv']
    },
    {
      id: 'trav', cat: 'supra', title: 'TRAV orthodromique', tags: ['Concours'],
      short: 'Tachycardie régulière à QRS fins à 200/min, P rétrograde visible dans le segment ST, alternance électrique.',
      spec: sp(regularQRS({ rr: 0.3, retro: 0.14, alt: 0.82 })),
      marks: [{ lead: 'II', f: 'p', which: 'retro', label: 'P rétrograde dans le ST' }, { lead: 'R', f: 'rp', which: 1, label: 'RP > 70 ms' }, { lead: 'V4', f: 'qrs', which: 'all', label: 'Alternance électrique' }],
      criteres: ['Tachycardie régulière à QRS fins, 150–250/min', 'P rétrograde dans le segment ST ou au début de la T : RP > 70 ms, RP < PR', 'Alternance électrique des QRS possible', 'Début et fin brutaux ; en rythme sinusal : pré-excitation (WPW) ou voie accessoire cachée'],
      mecanisme: 'Le circuit est macroscopique : descente par le nœud AV et le His (QRS fins), remontée vers les oreillettes par la voie accessoire. Le trajet ventricule → voie accessoire → oreillette prend du temps : la P rétrograde arrive plus tard que dans la TRIN.',
      pieges: ['La différence avec la TRIN tient à la position de la P : collée au QRS (TRIN) ou dans le ST (TRAV)', 'Une voie accessoire peut être cachée : l’ECG de base est alors normal'],
      conduite: 'Comme la TRIN : manœuvres vagales, adénosine, choc électrique si mauvaise tolérance. Ablation de la voie accessoire en première intention si récidives ou pré-excitation (ESC 2019).',
      retenir: 'Fine, régulière, rapide avec P rétrograde dans le ST (RP > 70 ms) = TRAV orthodromique.',
      confond: ['trin', 'pjrt', 'ta', 'flutter']
    },
    {
      id: 'travanti', cat: 'supra', title: 'TRAV antidromique', tags: ['Piège'],
      short: 'Tachycardie régulière à QRS larges (190/min) entièrement pré-excités : elle imite une TV.',
      spec: sp(regularQRS({ rr: 0.315, m: 'preex' })),
      marks: [{ lead: 'R', f: 'qrs', which: 'all', label: 'QRS larges pré-excités' }, { lead: 'V1', f: 'delta', label: 'Empâtement initial' }],
      criteres: ['Tachycardie régulière à QRS larges (≥ 120 ms), 150–250/min', 'QRS entièrement pré-excités : début empâté (onde delta) très marqué', 'P rétrograde le plus souvent invisible', 'Pré-excitation sur l’ECG de base en rythme sinusal'],
      mecanisme: 'Le circuit tourne à l’envers : descente par la voie accessoire, qui active les ventricules de proche en proche (QRS large, delta maximale), puis remontée par le His et le nœud AV.',
      pieges: ['Indiscernable d’une TV sur le seul tracé : traiter comme une TV en cas de doute', 'Plusieurs voies accessoires sont possibles'],
      conduite: 'Mal tolérée : choc électrique synchronisé. Bien tolérée : antiarythmique IV en milieu spécialisé (ibutilide, procaïnamide, flécaïnide), choc si échec. Ablation de la voie accessoire (ESC 2019).',
      retenir: 'Tachycardie à QRS larges sur WPW connu = TRAV antidromique possible, mais TV jusqu’à preuve du contraire.',
      confond: ['tv', 'fapx', 'bbg', 'wpw']
    },
    {
      id: 'fapx', cat: 'supra', title: 'FA pré-excitée (FA sur WPW)', tags: ['Urgence vitale', 'Concours'],
      short: 'Rythme irrégulier très rapide (jusqu’à 250/min) avec des QRS larges de forme changeante.',
      spec: sp(preexAF, { bg: [{ kind: 'af', amp: 0.8 }] }),
      marks: [{ lead: 'R', f: 'window', t0: 0, t1: 2.6, label: 'Irrégulier, très rapide' }, { lead: 'R', f: 'qrs', which: 'preex', label: 'QRS large pré-excité' }, { lead: 'V2', f: 'window', label: 'Largeur variable' }],
      criteres: ['RR totalement irréguliers, très rapides (souvent > 200/min)', 'QRS larges, de largeur variable d’un battement à l’autre (pré-excitation plus ou moins complète)', 'Quelques QRS fins intercalés', 'RR pré-excité le plus court < 250 ms : voie accessoire à haut risque'],
      mecanisme: 'La FA bombarde les ventricules par deux routes : le nœud AV, qui filtre, et la voie accessoire, qui ne filtre pas. Chaque QRS est une fusion différente entre les deux, d’où des formes changeantes et une fréquence très élevée qui peut dégénérer en FV.',
      pieges: ['Freinateurs nodaux contre-indiqués (adénosine, vérapamil, diltiazem, bêtabloquants, digoxine) : ils favorisent le passage par la voie accessoire et la FV', 'Amiodarone IV non recommandée', 'Ne pas confondre avec une FA + bloc de branche (QRS de largeur fixe) ou une TV polymorphe'],
      conduite: 'Instable : choc électrique synchronisé immédiat. Stable : ibutilide ou procaïnamide IV (flécaïnide possible), choc si échec. Puis ablation de la voie accessoire (ESC 2019).',
      retenir: 'Irrégulier + très rapide + QRS larges changeants = FA pré-excitée : choc, jamais de freinateur nodal.',
      confond: ['fa', 'tv', 'tdp', 'wpw']
    },
    {
      id: 'pjrt', cat: 'supra', title: 'Tachycardie de Coumel (PJRT)', tags: [],
      short: 'Tachycardie régulière à QRS fins à 130/min, incessante, P négatives profondes en inférieur, RP long.',
      spec: sp(regularQRS({ rr: 0.46, retro: 0.29, rm: 'retroDeep' })),
      marks: [{ lead: 'II', f: 'p', which: 'retro', label: 'P négative profonde' }, { lead: 'R', f: 'rp', which: 1, label: 'RP > PR' }],
      criteres: ['Tachycardie régulière à QRS fins, 120–200/min, incessante', 'P rétrograde négative profonde en DII, DIII, aVF (et V3–V6)', 'RP long : RP > PR', 'Reprend après quelques battements sinusaux'],
      mecanisme: 'TRAV orthodromique qui utilise une voie accessoire à conduction lente et décrémentielle, le plus souvent postéroseptale. La remontée lente place la P rétrograde tard, juste avant le QRS suivant. Le circuit, toujours prêt, se relance sans cesse.',
      pieges: ['Ressemble à une tachycardie atriale basse ou à une TRIN atypique (autres causes de RP long)', 'Incessante : risque de cardiomyopathie rythmique (dysfonction VG réversible)', 'Bien tolérée, souvent découverte chez l’enfant ou devant une insuffisance cardiaque'],
      conduite: 'Ablation de la voie accessoire, traitement de choix. L’adénosine l’arrête transitoirement mais elle récidive. Surveiller la fonction VG.',
      retenir: 'RP long + P négatives profondes en inférieur + incessante = PJRT (Coumel) : risque de cardiomyopathie rythmique.',
      confond: ['ta', 'trav', 'trin', 'tachy']
    },
    {
      id: 'esv', cat: 'ventri', title: 'Extrasystoles ventriculaires', tags: ['Fréquent'],
      short: 'Complexes prématurés larges et bizarres, sans P, suivis d’un repos compensateur.',
      spec: sp(withPremature({ kind: 'esv', at: [4, 9], hr: 72 })),
      marks: [{ lead: 'R', f: 'qrs', which: 'pvc', label: 'QRS large prématuré' }, { lead: 'R', f: 't', which: 'pvc', label: 'T opposée' }],
      criteres: ['QRS prématuré, large (≥ 120 ms) et de morphologie différente', 'Pas d’onde P prématurée devant', 'ST et T opposés au QRS', 'Repos compensateur : l’intervalle autour de l’ESV = 2 RR de base'],
      mecanisme: 'Un foyer ventriculaire se dépolarise seul. L’influx ne prend pas les voies rapides (His–Purkinje) : il chemine de cellule à cellule, lentement, d’où un QRS large. Le nœud sinusal n’est pas touché et continue son rythme : la P suivante tombe pendant l’ESV, d’où le repos compensateur.',
      pieges: ['Bigéminisme : une ESV après chaque battement sinusal, peut faire sous-estimer la FC', 'ESV polymorphes, en salves ou « R sur T » : risque de TV/FV'],
      conduite: 'Le plus souvent bénignes sur cœur sain. Rechercher cardiopathie, hypokaliémie, hypomagnésémie, intoxication digitalique. Échographie si fréquentes.',
      retenir: 'ESV = QRS large prématuré sans P + repos compensateur.',
      confond: ['esa', 'bbg', 'tv']
    },
    {
      id: 'tv', cat: 'ventri', title: 'Tachycardie ventriculaire', tags: ['Urgence vitale', 'Concours'],
      short: 'Tachycardie régulière à QRS larges à 175/min, avec dissociation auriculo-ventriculaire.',
      spec: sp(regularQRS({ rr: 0.343, m: 'vt', p: 0.78 })),
      marks: [{ lead: 'R', f: 'qrs', which: 'all', label: 'QRS larges réguliers' }, { lead: 'aVF', f: 'qrs', label: 'Axe hypergauche' }],
      criteres: ['Tachycardie régulière à QRS larges (≥ 120 ms), souvent > 140 ms', 'Dissociation AV : ondes P indépendantes, plus lentes', 'Complexes de capture ou de fusion (signes quasi pathognomoniques)', 'Axe hypergauche, concordance des QRS en V1–V6'],
      mecanisme: 'Un circuit de réentrée autour d’une cicatrice d’infarctus (ou un foyer) commande les ventricules. L’activation passe de myocyte à myocyte, d’où des QRS larges. Les oreillettes continuent au rythme sinusal, sans lien : c’est la dissociation.',
      pieges: ['Toute tachycardie à QRS larges = TV jusqu’à preuve du contraire, surtout sur cardiopathie', 'Une bonne tolérance hémodynamique n’élimine pas une TV', 'Jamais de vérapamil devant une tachycardie à QRS larges'],
      conduite: 'Pouls absent : réanimation, choc électrique. Mal tolérée : choc électrique synchronisé. Bien tolérée : amiodarone IV, correction K⁺/Mg²⁺, recherche d’ischémie.',
      retenir: 'QRS larges + régulier + rapide = TV. Dissociation AV, capture, fusion = signes de certitude.',
      confond: ['trin', 'bbg', 'tdp', 'fv']
    },
    {
      id: 'tdp', cat: 'ventri', title: 'Torsades de pointes', tags: ['Urgence vitale', 'Concours'],
      short: 'TV polymorphe dont les pointes tournent autour de la ligne de base, sur QT long.',
      spec: sp(torsades, { bg: [{ kind: 'tdp', t0: 2.55, t1: 8.2 }] }),
      marks: [{ lead: 'R', f: 'window', t0: 2.6, t1: 8.2, label: 'Torsion des pointes' }, { lead: 'R', f: 'qt', which: 0, label: 'QT long' }, { lead: 'R', f: 'qrs', which: 'pvc', label: 'ESV « R sur T »' }],
      criteres: ['Tachycardie ventriculaire polymorphe, 200–250/min', 'Amplitude et polarité des QRS qui varient : aspect en fuseau tournant autour de la ligne de base', 'Accès souvent brefs, auto-limités, récidivants', 'QT long sur les battements de base, déclenchement par une ESV après une pause'],
      mecanisme: 'Le QT long traduit une repolarisation hétérogène. Des post-dépolarisations précoces déclenchent une réentrée dont l’axe tourne en permanence : chaque dérivation voit le vecteur s’approcher puis s’éloigner, d’où la torsion.',
      pieges: ['Peut dégénérer en FV', 'Les antiarythmiques classiques (amiodarone) allongent le QT et aggravent'],
      conduite: 'Sulfate de magnésium IV (2 g), correction de la kaliémie (> 4,5), arrêt des médicaments allongeant le QT, accélération de la fréquence (isoprénaline ou entraînement électrosystolique). Choc électrique si dégénérescence.',
      retenir: 'Torsades = QT long + bradycardie + hypokaliémie. Traitement : magnésium.',
      confond: ['tv', 'fv', 'qtlong']
    },
    {
      id: 'fv', cat: 'ventri', title: 'Fibrillation ventriculaire', tags: ['Urgence vitale'],
      short: 'Activité électrique anarchique, sans QRS identifiable : arrêt cardiaque.',
      spec: sp(() => [], { bg: [{ kind: 'vf', amp: 1 }] }),
      marks: [{ lead: 'R', f: 'window', t0: 0, t1: 3, label: 'Aucun QRS organisé' }],
      criteres: ['Ondulations irrégulières d’amplitude et de fréquence variables', 'Aucun complexe QRS, aucune onde P ou T identifiable', 'FV « à grandes mailles » puis « à petites mailles » avec le temps'],
      mecanisme: 'De multiples fronts d’activation chaotiques parcourent les ventricules : aucune contraction efficace, débit cardiaque nul.',
      pieges: ['Une électrode décollée ou un patient qui bouge peut simuler une FV : regarder le patient', 'FV à petites mailles peut ressembler à une asystolie : vérifier le gain et deux dérivations'],
      conduite: 'Arrêt cardiaque : massage cardiaque externe, défibrillation immédiate (choc non synchronisé), adrénaline et amiodarone selon l’algorithme.',
      retenir: 'FV = choc électrique le plus tôt possible. Chaque minute sans choc diminue la survie.',
      confond: ['tdp', 'tv', 'asystolie']
    },
    {
      id: 'asystolie', cat: 'ventri', title: 'Asystolie', tags: ['Urgence vitale'],
      short: 'Ligne plate : aucune activité électrique ventriculaire.',
      spec: sp(() => [], { noise: 0.006 }),
      marks: [{ lead: 'R', f: 'window', label: 'Ligne quasi isoélectrique' }],
      criteres: ['Absence de toute activité électrique', 'Parfois des ondes P seules (BAV complet sans échappement)'],
      mecanisme: 'Ni le nœud sinusal ni aucun foyer d’échappement ne commandent les ventricules.',
      pieges: ['Toujours vérifier : électrodes en place, gain, deux dérivations différentes (une FV à petites mailles perpendiculaire à la dérivation peut paraître plate)'],
      conduite: 'Rythme non choquable : massage cardiaque, adrénaline dès que possible, recherche des causes réversibles (4H/4T).',
      retenir: 'Asystolie = non choquable. Massage + adrénaline + 4H/4T.',
      confond: ['fv', 'bav3']
    },
    {
      id: 'bav1', cat: 'cond', title: 'BAV du 1ᵉʳ degré', tags: [],
      short: 'Allongement fixe du PR au-delà de 200 ms, chaque P reste conduite.',
      spec: sp(S({ hr: 68, pr: 0.3 })),
      marks: [{ lead: 'R', f: 'pr', which: 'all', label: 'PR 300 ms' }],
      criteres: ['PR > 200 ms (plus d’un grand carreau)', 'PR constant', 'Chaque P est suivie d’un QRS'],
      mecanisme: 'Le passage dans le nœud AV est ralenti, mais tous les influx passent. Il s’agit d’un retard, pas d’un blocage.',
      pieges: ['Un PR très long peut placer la P dans la T précédente'],
      conduite: 'Le plus souvent sans gravité. Rechercher médicaments (bêtabloquants, digoxine, inhibiteurs calciques), hyperkaliémie, ischémie inférieure, maladie de Lyme.',
      retenir: 'BAV 1 = PR > 200 ms fixe, toutes les P conduites.',
      confond: ['bav2m1', 'brady', 'rsn']
    },
    {
      id: 'bav2m1', cat: 'cond', title: 'BAV 2ᵉ degré Mobitz I (Wenckebach)', tags: ['Concours'],
      short: 'Allongement progressif du PR jusqu’à une onde P bloquée, puis le cycle recommence.',
      spec: sp(avBlock({ pp: 0.7, pattern: [0.16, 0.26, 0.32, null] })),
      marks: [{ lead: 'R', f: 'pr', which: 'all', label: 'PR s’allonge' }, { lead: 'R', f: 'p', which: 'blocked', label: 'P bloquée' }],
      criteres: ['PR qui s’allonge progressivement d’un battement à l’autre', 'Puis une onde P non suivie de QRS', 'Le PR qui suit la pause est le plus court', 'Les RR se raccourcissent avant la pause (groupement des QRS)'],
      mecanisme: 'Le nœud AV se fatigue : chaque influx arrive alors que le nœud n’a pas totalement récupéré, il passe de plus en plus lentement, jusqu’à ce qu’un influx soit bloqué. La pause permet la récupération.',
      pieges: ['Un BAV 2:1 ne permet pas de distinguer Mobitz I et II', 'Ne pas confondre avec des ESA bloquées (P prématurée)'],
      conduite: 'Bloc nodal, en général bénin (sportif, vagal, infarctus inférieur, médicaments). Surveillance, arrêt des freinateurs. Rarement un pacemaker.',
      retenir: 'Wenckebach = PR qui s’allonge puis P bloquée. Nodal, bon pronostic.',
      confond: ['bav2m2', 'bav1', 'esa']
    },
    {
      id: 'bav2m2', cat: 'cond', title: 'BAV 2ᵉ degré Mobitz II', tags: ['Urgence', 'Concours'],
      short: 'PR fixe puis onde P brutalement bloquée, souvent avec un bloc de branche.',
      spec: sp(avBlock({ pp: 0.78, pattern: [0.18, 0.18, 0.18, null], m: 'bbd' })),
      marks: [{ lead: 'R', f: 'pr', which: 'all', label: 'PR constant' }, { lead: 'R', f: 'p', which: 'blocked', label: 'P bloquée sans prévenir' }],
      criteres: ['PR constant sur les battements conduits', 'Onde P soudainement non suivie de QRS', 'QRS souvent larges (bloc infra-hisien)'],
      mecanisme: 'Le blocage est sous le nœud AV (His ou branches). Le tissu fonctionne en tout ou rien : pas de fatigue progressive, l’influx passe normalement ou pas du tout.',
      pieges: ['Risque d’évolution brutale vers un BAV complet et une syncope (Adams-Stokes)', 'Un PR fixe ne signifie pas un bloc bénin'],
      conduite: 'Hospitalisation sous scope, arrêt des médicaments bradycardisants. Indication de stimulateur cardiaque définitif. Isoprénaline ou entraînement externe en attendant si mal toléré.',
      retenir: 'Mobitz II = PR fixe + P bloquée = infra-hisien = pacemaker.',
      confond: ['bav2m1', 'bav3', 'bbd']
    },
    {
      id: 'bav3', cat: 'cond', title: 'BAV complet (3ᵉ degré)', tags: ['Urgence', 'Concours'],
      short: 'Oreillettes et ventricules battent chacun à leur rythme : P à 85/min, QRS larges à 38/min.',
      spec: sp((r, D) => {
        const ev = []; for (let p = 0.12; p < D + 0.5; p += 0.705) ev.push({ type: 'P', t: p, m: 'normal', conducted: false });
        for (let q = 0.85; q < D + 0.5; q += 1.58) ev.push({ type: 'QRS', t: q, m: 'escape' });
        return ev;
      }),
      marks: [{ lead: 'R', f: 'p', which: 'allP', label: 'P régulières' }, { lead: 'R', f: 'qrs', which: 'all', label: 'Échappement lent et large' }],
      criteres: ['Ondes P régulières, plus rapides que les QRS', 'QRS réguliers et lents, sans relation avec les P (PR variable)', 'QRS fins si échappement jonctionnel (40–60/min), larges si ventriculaire (20–40/min)'],
      mecanisme: 'Aucun influx auriculaire ne franchit la jonction. Un foyer d’échappement sous le bloc prend le relais : plus il est bas, plus il est lent, large et instable.',
      pieges: ['Ne pas prendre pour un BAV 2:1 : mesurer les PR, ils varient tous', 'Une FA lente et régulière = FA + BAV complet (intoxication digitalique ?)'],
      conduite: 'Urgence : scope, voie veineuse, atropine (peu efficace si infra-nodal), isoprénaline, entraînement électrosystolique externe puis sonde temporaire. Pacemaker définitif.',
      retenir: 'BAV 3 = dissociation AV avec P plus rapides que les QRS. Isoprénaline + pacemaker.',
      confond: ['bav2m2', 'brady', 'tv']
    },
    {
      id: 'bbd', cat: 'cond', title: 'Bloc de branche droit complet', tags: ['Fréquent'],
      short: 'QRS ≥ 120 ms avec aspect rsR′ en V1 et onde S large en DI et V6.',
      spec: sp(S({ hr: 72, m: 'bbd' })),
      marks: [{ lead: 'V1', f: 'qrs', label: 'rsR′ « M »' }, { lead: 'V6', f: 'qrs', label: 'S large' }, { lead: 'I', f: 'qrs', label: 'S large' }],
      criteres: ['QRS ≥ 120 ms', 'Aspect rsR′ (en « M » ou oreille de lapin) en V1–V2', 'Onde S large et empâtée en DI, aVL, V5–V6', 'T négatives secondaires en V1–V3', 'Incomplet si QRS 110–120 ms'],
      mecanisme: 'La branche droite ne conduit plus. Le ventricule gauche se dépolarise normalement, puis le ventricule droit est activé en retard, de gauche à droite. Ce vecteur tardif dirigé vers la droite et l’avant donne R′ en V1 et S terminale en V6.',
      pieges: ['Un BBD récent + douleur thoracique ou dyspnée : penser embolie pulmonaire et infarctus', 'Le BBD n’empêche pas de lire un sus-décalage ST'],
      conduite: 'Isolé : souvent bénin. Rechercher cardiopathie droite, embolie pulmonaire, communication interatriale. Associé à un hémibloc : bloc bifasciculaire, surveiller.',
      retenir: 'BBD = M en V1 + S large en V6. « MaRRoW » : M en V1, W en V6.',
      confond: ['bbg', 'brugada', 'ep']
    },
    {
      id: 'bbg', cat: 'cond', title: 'Bloc de branche gauche complet', tags: ['Concours'],
      short: 'QRS ≥ 120 ms, R large crochetée en V6, QS profond en V1, ST-T discordants.',
      spec: sp(S({ hr: 74, m: 'bbg' })),
      marks: [{ lead: 'V1', f: 'qrs', label: 'QS large' }, { lead: 'V6', f: 'qrs', label: 'R crochetée, pas de q' }, { lead: 'V2', f: 'st', label: 'ST discordant' }],
      criteres: ['QRS ≥ 120 ms', 'V5–V6, DI, aVL : onde R large, crochetée (« M »), sans onde q septale', 'V1–V2 : QS ou rS profond et large', 'ST et T opposés au QRS (discordance appropriée)'],
      mecanisme: 'La branche gauche ne conduit plus : le septum est activé de droite à gauche (perte de la q septale), puis le ventricule gauche est envahi lentement de proche en proche. Le gros vecteur gauche s’éloigne de V1 et va vers V6.',
      pieges: ['Un BBG empêche l’interprétation habituelle du ST : utiliser les critères de Sgarbossa', 'BBG récent + douleur thoracique = équivalent de STEMI'],
      conduite: 'Toujours rechercher une cardiopathie sous-jacente (échocardiographie) : cardiopathie ischémique, hypertensive, dilatée, valvulopathie aortique.',
      retenir: 'BBG = W en V1, M en V6, pas de q en V6. Un BBG est presque toujours pathologique.',
      confond: ['bbd', 'hvg', 'pacemaker', 'esv']
    },
    {
      id: 'hbag', cat: 'cond', title: 'Hémibloc antérieur gauche', tags: [],
      short: 'Axe hypergauche (≈ −55°) avec qR en DI–aVL et rS en DII–DIII–aVF, QRS fins.',
      spec: sp(S({ hr: 72, m: 'hbag' })),
      marks: [{ lead: 'aVL', f: 'qrs', label: 'qR' }, { lead: 'III', f: 'qrs', label: 'rS profond' }, { lead: 'II', f: 'qrs', label: 'S > R' }],
      criteres: ['Axe entre −45° et −90°', 'qR en DI et aVL, rS en DII, DIII et aVF (S DIII > S DII)', 'QRS < 120 ms'],
      mecanisme: 'Le faisceau antérieur de la branche gauche est bloqué : la paroi antéro-supérieure du VG s’active en dernier, par le faisceau postérieur. Le vecteur final pointe vers le haut et la gauche.',
      pieges: ['Ne pas confondre avec une séquelle d’infarctus inférieur (vraies ondes Q en DII–DIII–aVF)'],
      conduite: 'Isolé : pas de traitement. Associé à un BBD : bloc bifasciculaire, risque de BAV complet.',
      retenir: 'Axe hypergauche + rS en inférieur + QRS fins = HBAG.',
      confond: ['necinf', 'bbg', 'rsn']
    },
    {
      id: 'wpw', cat: 'cond', title: 'Syndrome de Wolff-Parkinson-White', tags: ['Concours', 'Piège'],
      short: 'PR court, onde delta qui empâte le début du QRS, QRS élargi.',
      spec: sp(S({ hr: 72, pr: 0.105, m: 'wpw' })),
      marks: [{ lead: 'R', f: 'pr', label: 'PR < 120 ms' }, { lead: 'V3', f: 'delta', label: 'Onde δ' }, { lead: 'I', f: 'delta', label: 'Onde δ' }],
      criteres: ['PR < 120 ms', 'Onde delta : début du QRS lent, empâté', 'QRS ≥ 110–120 ms', 'Troubles secondaires de la repolarisation'],
      mecanisme: 'Un faisceau accessoire (de Kent) court-circuite le nœud AV. Une partie du ventricule s’active plus tôt et lentement, de myocyte à myocyte (onde delta), avant d’être rejointe par l’activation normale (QRS fusionné).',
      pieges: ['FA sur WPW : tachycardie irrégulière à QRS larges et variables, très rapide (risque de FV)', 'Jamais de freinateurs nodaux (vérapamil, digoxine, adénosine) dans la FA pré-excitée'],
      conduite: 'Avis rythmologique, exploration électrophysiologique, ablation de la voie accessoire si symptomatique ou à risque.',
      retenir: 'WPW = PR court + onde delta + QRS large. FA pré-excitée : choc ou flécaïnide, jamais de freinateur nodal.',
      confond: ['bbg', 'bbd', 'hvg']
    },
    {
      id: 'pacemaker', cat: 'cond', title: 'Rythme électro-entraîné (VVI)', tags: [],
      short: 'Spicule de stimulation suivi d’un QRS large d’aspect retard gauche, axe gauche.',
      spec: sp(regularQRS({ rr: 0.857, m: 'paced' }), { bg: [{ kind: 'af', amp: 0.6 }] }),
      marks: [{ lead: 'R', f: 'spike', which: 'all', label: 'Spicule' }, { lead: 'V1', f: 'qrs', label: 'Aspect retard gauche' }],
      criteres: ['Spicule fin et vertical avant chaque QRS', 'QRS large (stimulation de la pointe du VD) : aspect de BBG, axe gauche', 'Fréquence fixe = fréquence programmée (ici 70/min)'],
      mecanisme: 'La sonde stimule la pointe du ventricule droit. L’activation part de là et se propage lentement de cellule à cellule, du VD vers le VG et de la pointe vers la base : QRS large, axe vers le haut et la gauche.',
      pieges: ['Défaut d’entraînement : spicule non suivi de QRS', 'Défaut de détection : spicule qui tombe n’importe où, y compris sur la T', 'Les spicules bipolaires sont parfois minuscules'],
      conduite: 'Vérifier l’entraînement et la détection, interroger le boîtier en cas de doute.',
      retenir: 'Spicule + QRS large aspect BBG = stimulation VD.',
      confond: ['bbg', 'tv', 'esv']
    },
    {
      id: 'stemiant', cat: 'isch', title: 'STEMI antérieur', tags: ['Urgence vitale', 'Concours'],
      short: 'Sus-décalage ST convexe de V1 à V5 avec miroir inférieur : occlusion de l’IVA.',
      spec: sp(S({ hr: 92, m: 'stemiAnt' })),
      marks: [{ lead: 'V2', f: 'st', label: 'Sus-décalage' }, { lead: 'V3', f: 'st', label: 'Sus-décalage' }, { lead: 'III', f: 'st', label: 'Miroir' }, { lead: 'aVL', f: 'st', label: 'ST ↑' }],
      criteres: ['Sus-décalage ST ≥ 2 mm en V2–V3 (homme ≥ 40 ans ; ≥ 2,5 mm < 40 ans ; ≥ 1,5 mm chez la femme) et ≥ 1 mm ailleurs, sur 2 dérivations contiguës', 'ST convexe vers le haut, englobant la T (onde de Pardee)', 'Image en miroir : sous-décalage en DIII, aVF', 'Ondes T géantes (hyperaiguës) au tout début, puis ondes Q'],
      mecanisme: 'La zone ischémiée reste partiellement dépolarisée pendant le plateau : un courant de lésion circule de la zone saine vers la zone lésée. Le vecteur de lésion pointe vers l’avant : les électrodes antérieures le voient arriver (ST ↑), les dérivations opposées le voient partir (miroir ST ↓).',
      pieges: ['Le miroir renforce le diagnostic : il distingue le STEMI de la péricardite', 'Penser aux équivalents : BBG récent, sus-décalage en aVR avec sous-décalage diffus, infarctus postérieur'],
      conduite: 'Urgence : SAMU, aspirine, anticoagulant, antalgique. Angioplastie primaire si délai < 120 min, sinon fibrinolyse. Défibrillateur à portée de main.',
      retenir: 'ST ↑ V1–V4 + miroir inférieur = IVA. « Time is muscle » : reperfusion.',
      confond: ['peri', 'stemiinf', 'brugada', 'hvg']
    },
    {
      id: 'stemiinf', cat: 'isch', title: 'STEMI inférieur', tags: ['Urgence vitale', 'Concours'],
      short: 'Sus-décalage ST en DII, DIII, aVF (DIII > DII) avec miroir en DI et aVL.',
      spec: sp(S({ hr: 58, m: 'stemiInf' })),
      marks: [{ lead: 'III', f: 'st', label: 'ST ↑ (III > II)' }, { lead: 'aVF', f: 'st', label: 'ST ↑' }, { lead: 'aVL', f: 'st', label: 'Miroir' }, { lead: 'V2', f: 'st', label: 'ST ↓ (postérieur ?)' }],
      criteres: ['Sus-décalage ST ≥ 1 mm en DII, DIII et aVF', 'Miroir : sous-décalage ST en aVL et DI', 'ST DIII > ST DII : orientation vers la coronaire droite', 'Sous-décalage V1–V3 : extension postérieure (faire V7–V9)'],
      mecanisme: 'Le vecteur de lésion pointe vers le bas (et un peu à droite si la coronaire droite est en cause) : DIII et aVF le voient arriver, aVL est l’axe exactement opposé et montre le miroir.',
      pieges: ['Faire V3R–V4R : extension au ventricule droit (pas de dérivés nitrés, remplissage)', 'Bradycardie et BAV fréquents (nœud AV vascularisé par la coronaire droite)'],
      conduite: 'Même urgence de reperfusion. Enregistrer V3R, V4R, V7, V8, V9. Prudence avec les dérivés nitrés si atteinte du VD.',
      retenir: 'ST ↑ DII–DIII–aVF + miroir aVL. Toujours faire V3R–V4R et V7–V9.',
      confond: ['stemiant', 'peri', 'necinf']
    },
    {
      id: 'scamoins', cat: 'isch', title: 'Sous-décalage diffus + ST ↑ en aVR', tags: ['Urgence', 'Concours'],
      short: 'Sous-décalage ST horizontal dans de nombreuses dérivations et sus-décalage en aVR.',
      spec: sp(S({ hr: 96, m: 'scaMoins' })),
      marks: [{ lead: 'aVR', f: 'st', label: 'ST ↑ aVR' }, { lead: 'V5', f: 'st', label: 'ST ↓ horizontal' }, { lead: 'II', f: 'st', label: 'ST ↓' }],
      criteres: ['Sous-décalage ST ≥ 1 mm horizontal ou descendant dans ≥ 6 dérivations', 'Sus-décalage ST en aVR (± V1)', 'Ondes T aplaties'],
      mecanisme: 'Ischémie sous-endocardique étendue : le vecteur de lésion pointe vers la cavité, donc vers le haut et la droite. Seule aVR, qui regarde le cœur par l’intérieur, voit un sus-décalage.',
      pieges: ['Évoque une atteinte du tronc commun ou un tritronculaire', 'Aussi vu en cas de tachycardie rapide, d’anémie sévère, de choc'],
      conduite: 'SCA à haut risque : traitement antithrombotique, coronarographie urgente.',
      retenir: 'Sous-décalage diffus + ST ↑ aVR = penser tronc commun.',
      confond: ['stemiant', 'hvg', 'hypok']
    },
    {
      id: 'wellens', cat: 'isch', title: 'Syndrome de Wellens', tags: ['Piège', 'Concours'],
      short: 'Ondes T négatives profondes et symétriques en V2–V3, sans sus-décalage, douleur résolue.',
      spec: sp(S({ hr: 68, m: 'wellens' })),
      marks: [{ lead: 'V2', f: 't', label: 'T négative symétrique' }, { lead: 'V3', f: 't', label: 'T profonde' }],
      criteres: ['Ondes T négatives, profondes et symétriques (ou biphasiques) en V2–V3', 'Pas d’onde Q, R conservée, ST peu ou pas décalé', 'Contexte : douleur thoracique récente, souvent disparue'],
      mecanisme: 'L’ischémie sous-épicardique inverse le sens de la repolarisation : la repolarisation va de l’endocarde vers l’épicarde, la T s’inverse. Marqueur de sténose critique de l’IVA proximale.',
      pieges: ['L’ECG paraît « calme » chez un patient indolore : risque d’infarctus antérieur étendu dans les jours suivants', 'Pas d’épreuve d’effort'],
      conduite: 'Coronarographie rapide. Ne pas faire d’épreuve d’effort.',
      retenir: 'T négatives profondes symétriques V2–V3 après une douleur = sténose IVA proximale.',
      confond: ['stemiant', 'ep', 'hvg']
    },
    {
      id: 'necinf', cat: 'isch', title: 'Séquelle d’infarctus inférieur', tags: [],
      short: 'Ondes Q larges et profondes en DII, DIII, aVF, avec T négatives.',
      spec: sp(S({ hr: 66, m: 'necInf' })),
      marks: [{ lead: 'III', f: 'qrs', label: 'Q de nécrose' }, { lead: 'aVF', f: 'qrs', label: 'Q ≥ 40 ms' }, { lead: 'III', f: 't', label: 'T négative' }],
      criteres: ['Onde Q ≥ 40 ms ou ≥ 1/3 de l’amplitude du QRS', 'Dans au moins 2 dérivations contiguës (ici DII, DIII, aVF)', 'Ondes T négatives dans le même territoire'],
      mecanisme: 'Le myocarde nécrosé est électriquement mort, une « fenêtre » : l’électrode inférieure voit à travers lui la dépolarisation de la paroi opposée qui s’éloigne, d’où une onde négative initiale.',
      pieges: ['Une petite q fine en DIII isolée peut être normale (varie avec la respiration)', 'Un HBAG ne donne pas d’onde Q inférieure (rS)'],
      conduite: 'Prévention secondaire : aspirine, statine, bêtabloquant, IEC, réadaptation. Évaluer la fonction VG.',
      retenir: 'Q ≥ 40 ms ou ≥ 1/3 du QRS dans 2 dérivations contiguës = nécrose.',
      confond: ['hbag', 'stemiinf', 'ep']
    },
    {
      id: 'peri', cat: 'divers', title: 'Péricardite aiguë', tags: ['Concours', 'Piège'],
      short: 'Sus-décalage ST diffus et concave, sans miroir, avec sous-décalage du PR.',
      spec: sp(S({ hr: 100, m: 'peri', pm: 'periP' })),
      marks: [{ lead: 'II', f: 'st', label: 'ST ↑ concave' }, { lead: 'II', f: 'pr', label: 'PR ↓' }, { lead: 'aVR', f: 'pr', label: 'PR ↑ aVR' }, { lead: 'V5', f: 'st', label: 'Diffus' }],
      criteres: ['Sus-décalage ST diffus (plusieurs territoires), concave vers le haut', 'Pas d’image en miroir (sauf aVR et V1)', 'Sous-décalage du segment PR (sus-décalage du PR en aVR)', 'Pas d’onde Q, tachycardie fréquente', 'Évolution en 4 stades (Holzmann) : ST ↑, retour, T négatives, normalisation'],
      mecanisme: 'L’inflammation touche l’épicarde de tout le cœur : le vecteur de lésion pointe vers la pointe, globalement, sans territoire coronaire. L’atteinte de l’épicarde auriculaire décale le segment PR.',
      pieges: ['Le miroir est le meilleur argument pour un STEMI', 'Douleur augmentée à l’inspiration, soulagée penché en avant, frottement péricardique'],
      conduite: 'Échocardiographie (épanchement, tamponnade). AINS ou aspirine à forte dose + colchicine, repos sportif.',
      retenir: 'ST ↑ diffus, concave, sans miroir + PR ↓ = péricardite.',
      confond: ['stemiant', 'stemiinf', 'brugada']
    },
    {
      id: 'hyperk', cat: 'divers', title: 'Hyperkaliémie', tags: ['Urgence vitale', 'Concours'],
      short: 'Ondes T amples, pointues et symétriques, P aplaties, QRS qui s’élargissent.',
      spec: sp(S({ hr: 70, pr: 0.2, m: 'hyperk', pm: 'hyperkP' })),
      marks: [{ lead: 'V3', f: 't', label: 'T pointue « en tente »' }, { lead: 'II', f: 'p', label: 'P aplatie' }, { lead: 'V2', f: 't', label: 'Base étroite' }],
      criteres: ['Ondes T amples, pointues, symétriques, à base étroite (d’abord en V2–V4)', 'Puis aplatissement des P, allongement du PR', 'Puis élargissement des QRS, bradycardie, BAV', 'Stade ultime : aspect sinusoïdal, FV ou asystolie'],
      mecanisme: 'Le potassium extracellulaire élevé accélère la repolarisation (T pointue), puis diminue le potentiel de repos et ralentit la conduction (P et QRS s’étalent).',
      pieges: ['L’ECG peut rester presque normal malgré une hyperkaliémie sévère', 'Vérifier l’absence d’hémolyse du prélèvement'],
      conduite: 'Urgence : gluconate de calcium IV si signes ECG (stabilise la membrane), insuline + glucose, salbutamol, bicarbonate si acidose, résines, épuration extrarénale si réfractaire.',
      retenir: 'T pointue symétrique + P qui disparaît + QRS qui s’élargit = calcium IV sans attendre.',
      confond: ['hypok', 'stemiant', 'qtlong']
    },
    {
      id: 'hypok', cat: 'divers', title: 'Hypokaliémie', tags: ['Concours'],
      short: 'Ondes T aplaties, onde U proéminente, sous-décalage ST, aspect de QT long.',
      spec: sp(S({ hr: 72, m: 'hypok' })),
      marks: [{ lead: 'V3', f: 'u', label: 'Onde U' }, { lead: 'V3', f: 't', label: 'T aplatie' }, { lead: 'II', f: 'st', label: 'ST ↓' }],
      criteres: ['Aplatissement puis inversion des T', 'Onde U ample (> 1 mm, parfois > T), surtout en V2–V3', 'Sous-décalage ST', 'Fausse impression de QT long (QU)'],
      mecanisme: 'La baisse du potassium extracellulaire ralentit la repolarisation et la rend hétérogène : T plus basse, onde U plus visible.',
      pieges: ['Risque d’ESV, de TV, de torsades de pointes', 'Potentialise la toxicité de la digoxine', 'Ne pas mesurer le QT jusqu’à la fin de l’onde U'],
      conduite: 'Supplémentation en potassium (orale ou IV lente selon la sévérité), corriger le magnésium, rechercher la cause (diurétiques, vomissements, diarrhées).',
      retenir: 'Hypokaliémie = T plate + U ample + ST ↓. Hyperkaliémie = T pointue.',
      confond: ['hyperk', 'qtlong', 'scamoins']
    },
    {
      id: 'qtlong', cat: 'divers', title: 'QT long', tags: ['Concours'],
      short: 'QT corrigé allongé (≈ 560 ms) avec onde T large : risque de torsades de pointes.',
      spec: sp(S({ hr: 60, m: 'longqt' })),
      marks: [{ lead: 'R', f: 'qt', label: 'QT ≈ 560 ms' }, { lead: 'II', f: 'qt', label: 'QT > RR/2' }],
      criteres: ['QTc (Bazett = QT / √RR) > 440 ms chez l’homme, > 460 ms chez la femme', 'QTc > 500 ms : risque élevé de torsades de pointes', 'Repère rapide : à FC 60–100, si le QT dépasse la moitié du RR, il est long'],
      mecanisme: 'La repolarisation ventriculaire est prolongée (canaux potassiques bloqués ou mutés) : le plateau dure, la T est retardée et étalée.',
      pieges: ['Mesurer en DII ou V5, sans inclure une onde U séparée', 'Bazett surestime le QTc aux fréquences rapides : utiliser Fridericia'],
      conduite: 'Arrêter les médicaments allongeant le QT (macrolides, antipsychotiques, antiarythmiques, ondansétron, méthadone…), corriger K⁺ et Mg²⁺, rechercher un QT long congénital.',
      retenir: 'QTc > 500 ms = danger. Corriger K⁺/Mg²⁺ et arrêter les médicaments torsadogènes.',
      confond: ['hypok', 'tdp', 'hypotherm']
    },
    {
      id: 'hvg', cat: 'divers', title: 'Hypertrophie ventriculaire gauche', tags: ['Fréquent'],
      short: 'Indice de Sokolow-Lyon > 35 mm, avec surcharge systolique en V5–V6.',
      spec: sp(S({ hr: 70, m: 'hvg' })),
      marks: [{ lead: 'V1', f: 'qrs', label: 'S profonde' }, { lead: 'V6', f: 'qrs', label: 'R ample' }, { lead: 'V6', f: 't', label: 'Surcharge' }],
      criteres: ['Sokolow-Lyon : S V1 + R V5 ou V6 > 35 mm', 'Cornell : R aVL + S V3 > 28 mm (H) ou > 20 mm (F)', 'Surcharge « systolique » : ST descendant et T négative asymétrique en V5–V6, DI, aVL', 'Parfois déviation axiale gauche, HAG'],
      mecanisme: 'Plus de masse musculaire gauche = vecteur gauche plus grand : il s’éloigne davantage de V1 (S profonde) et va plus fort vers V5–V6 (R ample). L’épaississement perturbe la repolarisation.',
      pieges: ['Voltage élevé physiologique chez le sujet jeune et mince', 'La surcharge peut masquer ou simuler une ischémie'],
      conduite: 'Échocardiographie. Rechercher et traiter HTA, rétrécissement aortique, cardiomyopathie hypertrophique.',
      retenir: 'S V1 + R V5/V6 > 35 mm = HVG électrique (Sokolow).',
      confond: ['bbg', 'scamoins', 'wpw']
    },
    {
      id: 'ep', cat: 'divers', title: 'Embolie pulmonaire', tags: ['Concours', 'Piège'],
      short: 'Tachycardie sinusale avec aspect S1Q3T3, T négatives en V1–V3, retard droit.',
      spec: sp(S({ hr: 114, pr: 0.14, m: 'ep' })),
      marks: [{ lead: 'I', f: 'qrs', label: 'S1' }, { lead: 'III', f: 'qrs', label: 'Q3' }, { lead: 'III', f: 't', label: 'T3' }, { lead: 'V2', f: 't', label: 'T négative' }],
      criteres: ['Tachycardie sinusale (signe le plus fréquent)', 'S1Q3T3 : onde S en DI, onde Q et T négative en DIII', 'T négatives en V1–V3 (surcharge VD)', 'Bloc de branche droit (complet ou incomplet), axe droit', 'Parfois FA ou flutter'],
      mecanisme: 'L’obstruction artérielle pulmonaire dilate brutalement le ventricule droit. Le cœur tourne dans le thorax et le VD souffre : le vecteur terminal part vers la droite (S1, retard droit) et la repolarisation du VD s’inverse (T négatives V1–V3).',
      pieges: ['Un ECG normal n’élimine pas l’embolie', 'S1Q3T3 est peu sensible et peu spécifique : l’ECG sert surtout à éliminer un autre diagnostic'],
      conduite: 'Probabilité clinique (Wells, Genève), D-dimères, angioscanner thoracique. Anticoagulation ; thrombolyse si état de choc.',
      retenir: 'EP à l’ECG = tachycardie sinusale ± S1Q3T3 ± BBD ± T négatives V1–V3.',
      confond: ['tachy', 'bbd', 'wellens', 'necinf']
    },
    {
      id: 'brugada', cat: 'divers', title: 'Syndrome de Brugada (type 1)', tags: ['Concours', 'Piège'],
      short: 'Sus-décalage ST en dôme (« coved ») ≥ 2 mm en V1–V2 suivi d’une T négative.',
      spec: sp(S({ hr: 70, m: 'brugada' })),
      marks: [{ lead: 'V1', f: 'st', label: 'ST en dôme' }, { lead: 'V2', f: 'st', label: '≥ 2 mm puis T −' }],
      criteres: ['Type 1 : sus-décalage du point J ≥ 2 mm, ST descendant en dôme, T négative, en V1 et/ou V2', 'Aspect de pseudo-bloc de branche droit', 'Seul le type 1 est diagnostique'],
      mecanisme: 'Canalopathie (souvent SCN5A, courant sodique diminué) : l’épicarde du ventricule droit se repolarise trop tôt, ce qui crée un gradient de voltage dans la paroi du VD, visible seulement par les électrodes en regard (V1–V2).',
      pieges: ['Démasqué par la fièvre, certains médicaments (classe IC), l’alcool, la cocaïne', 'Mort subite nocturne, syncope : interroger sur les antécédents familiaux', 'Enregistrer V1–V2 aux 2ᵉ et 3ᵉ espaces intercostaux'],
      conduite: 'Avis rythmologique. Traiter vigoureusement la fièvre, éviter les médicaments contre-indiqués (brugadadrugs.org). Défibrillateur implantable si syncope ou arythmie.',
      retenir: 'Dôme ST ≥ 2 mm + T négative en V1–V2 = Brugada type 1 : risque de mort subite.',
      confond: ['bbd', 'stemiant', 'peri']
    },
    {
      id: 'hypotherm', cat: 'divers', title: 'Hypothermie', tags: [],
      short: 'Bradycardie, ondes J d’Osborn à la fin du QRS, QT long, artéfacts de frissons.',
      spec: sp(S({ hr: 44, pr: 0.22, m: 'osborn' }), { bg: [{ kind: 'tremor', amp: 0.06 }] }),
      marks: [{ lead: 'II', f: 'j', label: 'Onde J d’Osborn' }, { lead: 'V4', f: 'j', label: 'Onde J' }, { lead: 'R', f: 'window', t0: 0, t1: 2.5, label: 'Frissons' }],
      criteres: ['Onde J d’Osborn : bosse positive à la jonction QRS–ST, ample en DII et V3–V6', 'Bradycardie sinusale, PR et QT allongés', 'Artéfacts de frissons', 'FA puis FV sous 28 °C'],
      mecanisme: 'Le froid crée un gradient de repolarisation précoce entre épicarde et endocarde (courant Ito), qui fait apparaître une onde J. L’amplitude de l’onde J augmente quand la température baisse.',
      pieges: ['Les ondes J peuvent être prises pour un sus-décalage ST', 'Tant que le patient n’est pas réchauffé, il n’est pas déclaré mort'],
      conduite: 'Réchauffement (externe, interne, circulation extracorporelle selon la profondeur), manipulation douce (risque de FV).',
      retenir: 'Onde J d’Osborn + bradycardie = hypothermie.',
      confond: ['brady', 'stemiinf', 'qtlong']
    },
    {
      id: 'inversion', cat: 'divers', title: 'Inversion des électrodes des bras', tags: ['Piège', 'Concours'],
      short: 'DI entièrement négatif (P, QRS, T) et aVR positif, mais précordiales normales.',
      spec: sp(S({ hr: 74 }), { armSwap: true }),
      marks: [{ lead: 'I', f: 'beat', label: 'P, QRS, T négatifs' }, { lead: 'aVR', f: 'beat', label: 'aVR positif' }, { lead: 'V5', f: 'qrs', label: 'V1–V6 normales' }],
      criteres: ['DI : P, QRS et T négatifs', 'aVR devient positif, DII et DIII sont échangées, aVL et aVR aussi', 'Progression précordiale normale (contrairement à la dextrocardie)'],
      mecanisme: 'DI mesure le bras gauche moins le bras droit : inverser les deux bras change le signe de DI. Les dérivations précordiales ne dépendent pas de ce montage et restent normales.',
      pieges: ['Ne pas conclure à une dextrocardie : celle-ci donne aussi une perte de progression de R de V1 à V6'],
      conduite: 'Vérifier les électrodes (rouge au bras droit, jaune au bras gauche) et refaire l’ECG.',
      retenir: 'DI tout négatif + V1–V6 normales = électrodes des bras inversées.',
      confond: ['rsn', 'necinf', 'hbag']
    }
  ];

  CASES.forEach(c => { c.catLabel = (CATS.find(k => k.id === c.cat) || {}).label; });
  const byId = id => CASES.find(c => c.id === id);
  root.ECGCASES = { CATS, CASES, byId, GEN: { atrial, regularQRS, flutterVar, irregular, preexAF } };
})(window);
