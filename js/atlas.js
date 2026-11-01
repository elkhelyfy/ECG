/* Atelier 4 : atlas des tracés. Atelier 5 : entraînement (quiz). */
(function (root) {
  'use strict';
  const E = root.ECG, LIB = root.ECGCASES;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tagClass = t => /Urgence/.test(t) ? 'bad' : /Piège/.test(t) ? 'warn' : /Concours/.test(t) ? 'acc' : 'neutral';
  const tags = c => c.tags.map(t => `<span class="tag ${tagClass(t)}">${t}</span>`).join('');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  function fiche(c) {
    return `
      <section class="f-block f-crit"><h4>Critères ECG</h4><ul>${c.criteres.map(x => `<li>${x}</li>`).join('')}</ul></section>
      <section class="f-block f-meca"><h4>Modèle mental</h4><p>${c.mecanisme}</p></section>
      <section class="f-block f-trap"><h4>Pièges</h4><ul>${c.pieges.map(x => `<li>${x}</li>`).join('')}</ul></section>
      <section class="f-block f-cat"><h4>Conduite à tenir</h4><p>${c.conduite}</p></section>
      <section class="f-block f-keep"><h4>À retenir pour le concours</h4><p>${c.retenir}</p></section>`;
  }
  function toolbar(prefix, p, extra) {
    const host = document.getElementById(prefix + 'Tools');
    host.innerHTML = `
      <button class="tg" id="${prefix}Annot" aria-pressed="${p.annot}">Annotations</button>
      <div class="seg sm" id="${prefix}Spd" aria-label="Vitesse"><button data-v="25" aria-pressed="true">25 mm/s</button><button data-v="50" aria-pressed="false">50 mm/s</button></div>
      <div class="seg sm" id="${prefix}Gain" aria-label="Amplitude"><button data-v="5" aria-pressed="false">5</button><button data-v="10" aria-pressed="true">10</button><button data-v="20" aria-pressed="false">20 mm/mV</button></div>
      <button class="tg ghost" id="${prefix}Clear">Effacer la mesure</button>${extra || ''}`;
    const a = document.getElementById(prefix + 'Annot');
    a.addEventListener('click', () => { p.annot = !p.annot; a.setAttribute('aria-pressed', p.annot); p.draw(); });
    [['Spd', 'speed'], ['Gain', 'gain']].forEach(([id, key]) => {
      const g = document.getElementById(prefix + id);
      g.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); p[key] = +b.dataset.v; p.draw();
      }));
    });
    document.getElementById(prefix + 'Clear').addEventListener('click', () => p.clearCaliper());
  }

  /* ---------- Atlas ---------- */
  let ap, cur = 'rsn';
  function list(filter) {
    const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const q = norm(filter || '');
    const html = LIB.CATS.map(cat => {
      const items = LIB.CASES.filter(c => c.cat === cat.id && (!q || norm(c.title + ' ' + c.short + ' ' + c.criteres.join(' ')).includes(q)));
      if (!items.length) return '';
      return `<div class="a-group"><p class="a-cat">${cat.label}</p>${items.map(c => `<button class="a-item" data-id="${c.id}" aria-current="${c.id === cur}"><span>${c.title}</span>${c.tags.includes('Urgence vitale') ? '<i class="dot bad" title="Urgence vitale"></i>' : ''}</button>`).join('')}</div>`;
    }).join('');
    const box = document.getElementById('atlasList');
    box.innerHTML = html || '<p class="muted">Aucun tracé ne correspond. Essayez « bloc », « ST » ou « tachycardie ».</p>';
    box.querySelectorAll('.a-item').forEach(b => b.addEventListener('click', () => open(b.dataset.id, true)));
  }
  function open(id, scroll) {
    const c = LIB.byId(id); if (!c) return;
    cur = id;
    document.querySelectorAll('#atlasList .a-item').forEach(b => b.setAttribute('aria-current', b.dataset.id === id));
    document.getElementById('atlasSelect').value = id;
    document.getElementById('caseHead').innerHTML = `<p class="eyebrow">${c.catLabel}</p><h2>${c.title}</h2><div class="tags">${tags(c)}</div><p class="lede">${c.short}</p>`;
    document.getElementById('atlasFiche').innerHTML = fiche(c);
    ap.set(E.render(c.spec(17)), c.marks);
    store.set('ecg.atlas', id);
    if (scroll && innerWidth < 900) document.getElementById('caseHead').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function initAtlas() {
    ap = new root.Paper(document.getElementById('atlasPaper'), { layout: '12' });
    ap.annot = true;
    toolbar('atlas', ap, `<button class="tg ghost" id="atlasToMachine">Voir sur la machine</button>`);
    document.getElementById('atlasToMachine').addEventListener('click', () => { root.Machine.load(cur); location.hash = 'machine'; });
    const sel = document.getElementById('atlasSelect');
    LIB.CATS.forEach(cat => {
      const og = document.createElement('optgroup'); og.label = cat.label;
      LIB.CASES.filter(c => c.cat === cat.id).forEach(c => og.append(new Option(c.title, c.id)));
      sel.append(og);
    });
    sel.addEventListener('change', () => open(sel.value));
    document.getElementById('atlasSearch').addEventListener('input', e => list(e.target.value));
    document.getElementById('atlasCount').textContent = LIB.CASES.length;
    list('');
    open(store.get('ecg.atlas', 'rsn'));
  }

  /* ---------- Quiz ---------- */
  let qp, q = null;
  const score = store.get('ecg.score', { ok: 0, n: 0, streak: 0, best: 0 });
  function pickDistractors(c, rand) {
    const pool = c.confond.filter(id => LIB.byId(id));
    const others = LIB.CASES.filter(x => x.id !== c.id && !pool.includes(x.id));
    const out = [];
    pool.sort(() => rand() - 0.5).forEach(id => { if (out.length < 3) out.push(id); });
    while (out.length < 3) { const o = others[Math.floor(rand() * others.length)].id; if (!out.includes(o)) out.push(o); }
    return out;
  }
  function next() {
    const cat = document.getElementById('quizCat').value;
    const pool = LIB.CASES.filter(c => cat === 'all' || c.cat === cat);
    const seed = Math.floor(Math.random() * 1e9), rand = E.rng(seed);
    let c = pool[Math.floor(rand() * pool.length)];
    if (q && pool.length > 1 && c.id === q.c.id) c = pool[(pool.indexOf(c) + 1) % pool.length];
    const choices = [c.id].concat(pickDistractors(c, rand)).sort(() => rand() - 0.5);
    q = { c, choices, done: false };
    qp.annot = false; document.getElementById('quizAnnot').setAttribute('aria-pressed', 'false');
    qp.set(E.render(c.spec(seed)), c.marks);
    document.getElementById('choices').innerHTML = choices.map(id => `<button class="choice" data-id="${id}">${LIB.byId(id).title}</button>`).join('');
    document.querySelectorAll('#choices .choice').forEach(b => b.addEventListener('click', () => answer(b.dataset.id)));
    const fb = document.getElementById('feedback'); fb.hidden = true; fb.innerHTML = '';
    document.getElementById('quizNext').textContent = 'Passer';
  }
  function answer(id) {
    if (q.done) return;
    q.done = true;
    const ok = id === q.c.id;
    score.n++; if (ok) { score.ok++; score.streak++; score.best = Math.max(score.best, score.streak); } else score.streak = 0;
    store.set('ecg.score', score); scoreUI();
    document.querySelectorAll('#choices .choice').forEach(b => {
      b.disabled = true;
      if (b.dataset.id === q.c.id) b.classList.add('right');
      else if (b.dataset.id === id) b.classList.add('wrong');
    });
    qp.annot = true; document.getElementById('quizAnnot').setAttribute('aria-pressed', 'true'); qp.draw();
    const c = q.c, fb = document.getElementById('feedback');
    fb.hidden = false;
    fb.innerHTML = `<p class="verdict ${ok ? 'ok' : 'bad'}">${ok ? 'Bonne réponse' : 'Ce n’est pas ça. Réponse : ' + esc(c.title)}</p>
      <p><b>${c.retenir}</b></p>
      <ul>${c.criteres.slice(0, 3).map(x => `<li>${x}</li>`).join('')}</ul>
      <p><a href="#atlas" data-case="${c.id}">Ouvrir la fiche complète</a></p>`;
    document.getElementById('quizNext').textContent = 'Tracé suivant';
  }
  function scoreUI() {
    document.getElementById('qScore').textContent = `${score.ok} / ${score.n}`;
    document.getElementById('qPct').textContent = score.n ? Math.round(100 * score.ok / score.n) + ' %' : '—';
    document.getElementById('qStreak').textContent = score.streak;
    document.getElementById('qBest').textContent = score.best;
  }
  function initQuiz() {
    qp = new root.Paper(document.getElementById('quizPaper'), { layout: '12' });
    toolbar('quiz', qp);
    document.getElementById('quizAnnot').setAttribute('aria-pressed', 'false');
    const sel = document.getElementById('quizCat');
    LIB.CATS.forEach(c => sel.append(new Option(c.label, c.id)));
    sel.addEventListener('change', next);
    document.getElementById('quizNext').addEventListener('click', next);
    document.getElementById('quizReset').addEventListener('click', () => { Object.assign(score, { ok: 0, n: 0, streak: 0, best: 0 }); store.set('ecg.score', score); scoreUI(); });
    scoreUI(); next();
  }

  root.Atlas = { init() { initAtlas(); initQuiz(); }, open, fiche, tags, redraw() { ap && ap.draw(); qp && qp.draw(); } };
})(window);
