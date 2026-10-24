/* Navigation entre ateliers, liens vers l'atlas, redessin au changement de thème. */
(function () {
  'use strict';
  const VIEWS = ['machine', 'modele', 'methode', 'atlas', 'quiz'];
  const inited = {};

  function show(v) {
    if (!VIEWS.includes(v)) v = 'machine';
    VIEWS.forEach(id => { document.getElementById('view-' + id).hidden = id !== v; });
    document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'));
    if (!inited[v]) {
      inited[v] = true;
      if (v === 'modele') window.Heart.init();
      if (v === 'methode') window.Method.init();
      if (v === 'atlas' || v === 'quiz') { if (!inited.lib) { inited.lib = true; window.Atlas.init(); } }
    }
    redraw();
  }
  function redraw() {
    window.Method && inited.methode && window.Method.redraw();
    window.Atlas && inited.lib && window.Atlas.redraw();
    window.Heart && inited.modele && window.Heart.refresh();
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-case]');
    if (!a) return;
    e.preventDefault();
    if (!inited.lib) { inited.lib = true; window.Atlas.init(); }
    window.Atlas.open(a.dataset.case);
    if (location.hash === '#atlas') show('atlas'); else location.hash = 'atlas';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('hashchange', () => { show(location.hash.slice(1)); window.scrollTo({ top: 0 }); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  window.Machine.init();
  inited.machine = true;
  show(location.hash.slice(1) || 'machine');
})();
