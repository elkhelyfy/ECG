/* Assistant pédagogique sous chaque tracé : « pourquoi ce diagnostic ? », « pourquoi pas celui-là ? ».
   Le navigateur n'a jamais la clé OpenRouter : il parle au Worker (/api/chat), protégé par un mot de passe. */
(function (root) {
  'use strict';
  const LIB = root.ECGCASES, E = root.ECG;
  const MEASURE_CHIP = ['Les mesures de ce tracé', 'Quelles sont les mesures de ce tracé (fréquence, RR, PR, QRS, QT) et que signifient-elles ici ?'];
  const PASS_KEY = 'ecg.chatpass';
  const OFFLINE = 'Assistant injoignable. Il fonctionne sur le site en ligne (Cloudflare) ou en local avec « npx wrangler dev ».';
  const store = {
    get() { try { return localStorage.getItem(PASS_KEY) || ''; } catch (e) { return ''; } },
    set(v) { try { if (v) localStorage.setItem(PASS_KEY, v); else localStorage.removeItem(PASS_KEY); } catch (e) { /* stockage indisponible */ } }
  };
  let pass = store.get();
  const boxes = new Set();
  let uid = 0;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = s => String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  // Markdown minimal et sûr : le texte est échappé avant toute mise en forme
  function md(src) {
    const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    let html = '', list = null, table = null;
    const flushTable = () => {
      if (!table) return;
      const rows = table.filter(r => !/^\|?[\s:|-]+\|?$/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim())));
      html += `<div class="ask-table"><table>${rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${c}</td>` : `<th>${c}</th>`).join('')}</tr>`).join('')}</table></div>`;
      table = null;
    };
    const close = () => { flushTable(); if (list) { html += `</${list}>`; list = null; } };
    esc(src).split('\n').forEach(raw => {
      const l = raw.trim(); let m;
      if (/^\|.*\|$/.test(l)) { if (list) { html += `</${list}>`; list = null; } (table = table || []).push(l); return; }
      flushTable();
      if ((m = l.match(/^[-•*]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
      else if (!l) close();
      else if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); html += `<p><b>${inline(m[1])}</b></p>`; }
      else { close(); html += `<p>${inline(l)}</p>`; }
    });
    close();
    return html;
  }

  /* ---------- contexte d'un cas de l'atlas ---------- */
  function caseText(c, extra) {
    const title = id => (LIB.byId(id) || {}).title;
    return [
      `Tracé affiché : ${c.title} (catégorie : ${c.catLabel}).`,
      `Description : ${c.short}`,
      `Critères ECG : ${c.criteres.join(' ; ')}`,
      `Mécanisme : ${c.mecanisme}`,
      `Pièges : ${c.pieges.join(' ; ')}`,
      `Conduite : ${c.conduite}`,
      `À retenir : ${c.retenir}`,
      `Diagnostics différentiels : ${c.confond.map(title).filter(Boolean).join(', ')}`,
      c.marks && c.marks.length ? `Repères annotés sur le tracé : ${c.marks.map(m => m.label).filter(Boolean).join(', ')}` : '',
      extra || ''
    ].filter(Boolean).join('\n');
  }
  function caseChips(c) {
    const out = [['Pourquoi ce diagnostic ?', `Pourquoi ce tracé correspond-il à « ${c.title} » ? Quels signes sur l’ECG le montrent ?`]];
    c.confond.map(id => LIB.byId(id)).filter(Boolean).slice(0, 2).forEach(o =>
      out.push([`Pourquoi pas : ${o.title} ?`, `Pourquoi ce tracé n’est-il pas « ${o.title} » ? Quelles différences permettent de trancher sur l’ECG ?`]));
    return out;
  }
  // o.extra : texte de contexte en plus ; o.key : suffixe de clé (change = nouvelle conversation) ; o.chips : suggestions en plus
  function forCase(c, o = {}) {
    if (!c) return null;
    return { key: c.id + '|' + (o.key || ''), text: caseText(c, o.extra), chips: caseChips(c).concat(o.chips || []) };
  }

  /* ---------- mesures extraites du signal affiché ---------- */
  const LN = l => (l === 'I' || l === 'II' || l === 'III' ? 'D' + l : l);
  const n2 = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');
  const mv = x => (x >= 0 ? '+' : '−') + n2(Math.abs(x));
  const ms = x => Math.round(x * 1000);
  const hiLo = a => (a.length ? Math.max(...a) - Math.min(...a) : 0);
  const P_LABEL = { ectopicP: 'P ectopique', atrialP: 'P atriale non sinusale', mat3: 'P de forme différente', retro: 'P rétrograde', retroDeep: 'P rétrograde profonde' };
  const pLabel = p => P_LABEL[p.m] || 'P sinusale';
  const Q_LABEL = { pvc: 'ESV', vt: 'complexe de TV', escape: 'échappement', bbd: 'aspect BBD', bbg: 'aspect BBG', wpw: 'pré-excitation partielle', preex: 'pré-excitation complète', paced: 'électro-entraîné, spicule', hbag: 'axe hypergauche' };
  function bgLabel(b) {
    const cyc = p => `cycle ${ms(p)} ms, soit ${Math.round(60 / p)}/min`;
    return ({
      af: 'trémulation irrégulière de la ligne de base (ondes f de fibrillation atriale)',
      flutter: `ondes F en dents de scie régulières, ${cyc(b.period || 0.2)}`,
      flutterAtyp: `activité atriale ondulante continue sans ligne isoélectrique, ${cyc(b.period || 0.24)}`,
      vf: 'activité ventriculaire anarchique sans QRS organisé',
      tdp: `tachycardie ventriculaire polymorphe torsadée de ${n2(b.t0)} s à ${n2(b.t1)} s`,
      tremor: 'artéfacts de tremblement musculaire', mains: 'parasite secteur 50 Hz', wander: 'dérive lente de la ligne de base'
    })[b.kind];
  }
  // src : { data (rendu du moteur), speed, gain, shown, paper? } → texte de mesures pour le modèle
  function measure(src) {
    const d = src && src.data;
    if (!d || !d.events) return '';
    const span = Math.min(d.duration, 250 / (src.speed || 25));
    const inWin = e => e.t >= 0 && e.t + (e.dur || 0.1) <= span;
    const Q = d.events.filter(e => e.type === 'QRS' && inWin(e)).slice(0, 45);
    const P = d.events.filter(e => e.type === 'P' && inWin(e));
    const sig = l => d.leads[l];
    const at = (s, t) => s[Math.max(0, Math.min(d.N - 1, Math.round(t * d.fs)))];
    const ext = (s, a, b) => { let lo = Infinity, hi = -Infinity; for (let i = Math.max(0, Math.floor(a * d.fs)); i <= Math.min(d.N - 1, Math.ceil(b * d.fs)); i++) { lo = Math.min(lo, s[i]); hi = Math.max(hi, s[i]); } return [lo, hi]; };
    const out = [`MESURES EXTRAITES DU TRACÉ (signal simulé ; fenêtre analysée 0 à ${n2(span)} s ; ${src.speed || 25} mm/s, ${src.gain || 10} mm/mV donc 1 mV = ${src.gain || 10} mm ; affichage : ${src.shown || 'tracé'}).`];
    if (src.paper && src.paper.o.layout === '12') out.push('Disposition 12 dérivations : DI, DII, DIII = 0 à 2,5 s ; aVR, aVL, aVF = 2,5 à 5 s ; V1, V2, V3 = 5 à 7,5 s ; V4, V5, V6 = 7,5 à 10 s ; bande de rythme DII longue = 0 à 10 s.');
    (d.bg || []).forEach(b => { const l = bgLabel(b); if (l) out.push(`Activité de fond : ${l}.`); });

    if (!Q.length) {
      out.push('Aucun complexe QRS identifiable dans la fenêtre.');
      out.push('Amplitude crête à crête par dérivation : ' + E.LEADS.map(l => { const [lo, hi] = ext(sig(l), 0, span); return `${LN(l)} ${n2(hi - lo)} mV`; }).join(' ; ') + '.');
    } else {
      const rr = Q.slice(1).map((q, i) => q.t - Q[i].t);
      if (rr.length) {
        const mean = rr.reduce((a, b) => a + b, 0) / rr.length, lo = Math.min(...rr), hi = Math.max(...rr);
        out.push(`Ventricules : ${Q.length} QRS ; fréquence moyenne ${Math.round(60 / mean)}/min ; RR de ${ms(lo)} à ${ms(hi)} ms (écart ${ms(hi - lo)} ms) : rythme ${hi - lo < 0.08 ? 'régulier' : 'irrégulier'}.`);
      }
      if (P.length) {
        const kinds = {};
        P.forEach(p => { const k = pLabel(p) + (p.conducted === false ? ' non conduite' : ''); kinds[k] = (kinds[k] || 0) + 1; });
        const pp = P.slice(1).map((p, i) => p.t - P[i].t), mpp = pp.length ? pp.reduce((a, b) => a + b, 0) / pp.length : 0;
        out.push(`Oreillettes : ${P.length} ondes P visibles${mpp ? ` ; fréquence atriale moyenne ${Math.round(60 / mpp)}/min` : ''} ; ${Object.entries(kinds).map(([k, n]) => `${n} × ${k}`).join(', ')}.`);
      } else if (!(d.bg || []).some(b => /af|flutter/.test(b.kind))) out.push('Oreillettes : aucune onde P identifiable.');

      out.push('Battements numérotés dans l’ordre (RRn = intervalle entre le battement n et le battement n+1) :');
      Q.forEach((q, i) => {
        const nx = Q[i + 1], parts = [`n°${i + 1} à ${n2(q.t)} s : QRS ${ms(q.dur)} ms${Q_LABEL[q.m] ? ` (${Q_LABEL[q.m]})` : ''}${q.k && q.k !== 1 ? `, amplitude ×${n2(q.k)}` : ''}`];
        const p = P.find(x => x.qrsT && Math.abs(x.qrsT - q.t) < 0.005);
        if (p) parts.push(`PR ${ms(q.t - p.t)} ms (${pLabel(p)})`);
        P.filter(x => /^retro/.test(x.m) && x.t > q.t - 0.15 && x.t < (nx ? nx.t : q.t + 0.6)).forEach(x =>
          parts.push(x.t >= q.t ? `${pLabel(x)} ${ms(x.t - q.t)} ms après le début du QRS (RP)` : `${pLabel(x)} ${ms(q.t - x.t)} ms avant le QRS`));
        P.filter(x => x.conducted === false && x.t > q.t && x.t < (nx ? nx.t : span)).forEach(x => parts.push(`P non conduite à ${n2(x.t)} s`));
        if (nx) parts.push(`RR${i + 1} = ${ms(nx.t - q.t)} ms (${Math.round(60 / (nx.t - q.t))}/min)`);
        out.push('- ' + parts.join(' ; '));
      });

      // battement de référence : la morphologie la plus fréquente, pas le tout premier (ligne de base avant lui)
      const count = {}; Q.forEach(q => { count[q.m] = (count[q.m] || 0) + 1; });
      const main = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      const idx = Math.max(0, Q.findIndex((q, i) => i > 0 && q.m === main));
      const q = Q[idx] || Q[0];
      // le QT dépend du RR qui précède le battement (c'est celui qu'utilise le moteur)
      const qt = q.tPeak + ((q.morph && q.morph.tEnd) || 0.075) - q.t, rrRef = q.rr || (Q[idx + 1] ? Q[idx + 1].t - q.t : 0.8);
      out.push(`Battement de référence n°${idx + 1} : QRS ${ms(q.dur)} ms ; QT ${ms(qt)} ms ; RR précédent ${ms(rrRef)} ms ; QTc Bazett ${Math.round(ms(qt) / Math.sqrt(rrRef))} ms${hiLo(rr) > 0.08 ? ' (peu fiable : rythme irrégulier)' : ''}.`);
      const pRef = P.find(x => x.qrsT && Math.abs(x.qrsT - q.t) < 0.005);
      // ligne de base : segment PR si une P précède le QRS, sinon moyenne de la diastole (lisse les ondes f ou F)
      const prev = Q[idx - 1];
      let wA = q.t - 0.035, wB = q.t - 0.012;
      if (pRef && q.t - 0.005 - (pRef.t + (pRef.dur || 0.1)) > 0.015) { wA = pRef.t + (pRef.dur || 0.1); wB = q.t - 0.005; }
      else if (prev) { wA = Math.min(prev.tPeak + 0.15, q.t - 0.04); wB = q.t - 0.012; }
      const lines = E.LEADS.map(l => {
        const s = sig(l);
        let b0 = 0, n = 0;
        for (let t = wA; t < wB; t += 1 / d.fs) { b0 += at(s, t); n++; }
        b0 /= n || 1;
        const [lo, hi] = ext(s, q.t - 0.01, q.t + q.dur + 0.01);
        const j60 = q.t + q.dur + 0.06, st = j60 < q.tPeak ? at(s, j60) - b0 : null;
        const parts = [`${LN(l)} : R ${mv(hi - b0)} mV, S/Q ${mv(lo - b0)} mV`];
        if (st != null) parts.push(`ST (J+60 ms) ${mv(st)} mV`);
        parts.push(`T ${mv(at(s, q.tPeak) - b0)} mV`);
        if (pRef) parts.push(`P ${mv(at(s, pRef.t + (pRef.dur || 0.1) / 2) - b0)} mV`);
        return '- ' + parts.join(', ');
      });
      out.push('Amplitudes du battement de référence (par rapport à la ligne de base juste avant le QRS) :', ...lines);
    }

    const p = src.paper;
    if (p && p.g && p.annot && p.marks.length) {
      const rows = [];
      p.marks.forEach(m => {
        if (m.f === 'cal') return;
        const r = p.ranges(m)[0];
        if (r) rows.push(`« ${m.label} » sur ${m.lead === 'R' ? 'la bande DII' : LN(m.lead)} : de ${n2(r[0])} à ${n2(r[1])} s (${ms(r[1] - r[0])} ms)`);
      });
      if (rows.length) out.push('Repères annotés à l’écran :', ...rows.map(r => '- ' + r));
    }
    if (p && p.g && p.cal) {
      const dt = Math.abs(p.cal.b.x - p.cal.a.x) / p.g.k / p.speed, dv = Math.abs(p.cal.b.y - p.cal.a.y) / p.g.k / p.gain;
      out.push(`Mesure au compas tracée par l’étudiant : ${ms(dt)} ms${dt > 0.2 ? ` (${Math.round(60 / dt)}/min)` : ''}${dv > 0.05 ? `, ${n2(dv)} mV` : ''}.`);
    }
    return out.join('\n');
  }

  /* ---------- appel au Worker, réponse en flux ---------- */
  async function stream(messages, context, onText, signal) {
    let res;
    try {
      res = await fetch('/api/chat', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'X-Chat-Password': pass },
        body: JSON.stringify({ messages, context })
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error(OFFLINE);
    }
    if (res.status === 401) { const err = new Error('Mot de passe incorrect ou expiré.'); err.auth = true; throw err; }
    if (!res.ok || !res.body) {
      let msg = '';
      try { msg = (await res.json()).error; } catch (e) { /* pas de JSON : serveur statique sans API */ }
      throw new Error(msg || ([404, 405, 501].includes(res.status) ? OFFLINE : `Erreur ${res.status}.`));
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue; // commentaires SSE (« : OPENROUTER PROCESSING »)
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch (e) { continue; }
        if (j.error) throw new Error(j.error.message || 'Erreur du modèle.');
        const ch = j.choices && j.choices[0];
        const d = ch && ch.delta && ch.delta.content;
        if (d) { text += d; onText(text); }
        if (ch && ch.finish_reason === 'length' && text) { text += '\n\n*(Réponse coupée : posez une question plus précise.)*'; onText(text); }
      }
    }
    if (!text) throw new Error('Réponse vide du modèle.');
    return text;
  }

  async function unlock(pw) {
    let res;
    try {
      res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    } catch (e) { throw new Error(OFFLINE); }
    if (res.ok) { pass = pw; store.set(pw); boxes.forEach(b => b.lockUI(false)); return; }
    let msg = '';
    try { msg = (await res.json()).error; } catch (e) { /* serveur statique */ }
    throw new Error(msg || ([404, 405, 501].includes(res.status) ? OFFLINE : `Erreur ${res.status}.`));
  }

  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" fill="currentColor"/></svg>';

  /* ---------- la boîte sous un tracé ---------- */
  // paperHost : élément du tracé (écoute l'événement ecg:set) ; getCtx() → { key, text, chips } | { off, hide } | null
  function attach(paperHost, getCtx, o = {}) {
    // d'où viennent les mesures : la fonction fournie (machine) ou le papier ECG du tracé
    const source = () => {
      if (o.data) return o.data();
      const p = paperHost.__paper;
      return p && p.data ? { data: p.data, speed: p.speed, gain: p.gain, paper: p,
        shown: p.o.layout === '12' ? 'ECG 12 dérivations + bande de rythme DII' : 'bande ' + p.o.leads.map(LN).join(', ') + ' seule' } : null;
    };
    let anchor = o.anchor || paperHost.closest('.scroll-x') || paperHost;
    if (!o.anchor && anchor.nextElementSibling && anchor.nextElementSibling.classList.contains('hint')) anchor = anchor.nextElementSibling;
    const id = 'ask' + (++uid);
    const el = document.createElement('section');
    el.className = 'ask';
    el.setAttribute('aria-label', 'Assistant : questions sur ce tracé');
    el.innerHTML = `
      <div class="ask-head"><p class="ask-title">${SPARK}Une question sur ce tracé ?</p><button type="button" class="ask-clear" hidden>Effacer</button></div>
      <p class="ask-off muted" hidden></p>
      <div class="ask-chips"></div>
      <div class="ask-thread" aria-live="polite"></div>
      <form class="ask-lock" hidden>
        <label for="${id}p">Mot de passe de l’assistant</label>
        <div class="ask-row"><input type="password" id="${id}p" autocomplete="current-password" required><button class="btn" type="submit">Déverrouiller</button></div>
        <p class="ask-err" role="alert"></p>
      </form>
      <form class="ask-form">
        <label class="sr" for="${id}q">Votre question sur ce tracé</label>
        <div class="ask-row"><input type="text" id="${id}q" maxlength="600" autocomplete="off" placeholder="Pourquoi… ? Pourquoi pas… ?"><button class="btn" type="submit">Demander</button></div>
      </form>`;
    anchor.after(el);
    const $ = s => el.querySelector(s);
    const thread = $('.ask-thread'), chips = $('.ask-chips'), form = $('.ask-form'), lock = $('.ask-lock');
    const input = $(`#${id}q`), pwIn = $(`#${id}p`), err = $('.ask-err'), clear = $('.ask-clear'), off = $('.ask-off');
    let ctx = null, key = null, msgs = [], pending = null, ctrl = null, busy = false;

    function reset() {
      if (ctrl) ctrl.abort();
      ctrl = null; busy = false; msgs = []; thread.innerHTML = ''; clear.hidden = true;
      form.querySelector('button').disabled = false;
    }
    function refresh() {
      const c = getCtx();
      const disabled = !c || c.off;
      el.hidden = !!(c && c.hide);
      off.hidden = !disabled; off.textContent = disabled ? (c && c.off) || 'Aucun tracé sélectionné.' : '';
      chips.hidden = form.hidden = disabled;
      if (disabled) { reset(); key = null; ctx = null; return; }
      if (c.key !== key) { reset(); key = c.key; }
      ctx = Object.assign({}, c, { chips: (c.chips || []).concat([MEASURE_CHIP]) });
      chips.innerHTML = ctx.chips.map((ch, i) => `<button type="button" class="ask-chip" data-i="${i}">${esc(ch[0])}</button>`).join('');
    }
    function bubble(cls, html) {
      const b = document.createElement('div');
      b.className = 'ask-msg ' + cls;
      b.innerHTML = html;
      thread.append(b);
      return b;
    }
    function lockUI(show) {
      lock.hidden = !show;
      if (show) { err.textContent = ''; pwIn.value = ''; pwIn.focus(); }
    }
    async function send(q) {
      q = (q || '').trim();
      if (!q || busy || !ctx) return;
      if (!pass) { pending = q; lockUI(true); return; }
      const fresh = getCtx(); // contexte relu au moment de l'envoi (dérivation, état, mesure au compas…)
      const text = [fresh && !fresh.off ? fresh.text : ctx.text, measure(source())].filter(Boolean).join('\n\n');
      bubble('user', esc(q));
      msgs.push({ role: 'user', content: q });
      clear.hidden = false; input.value = '';
      const bot = bubble('bot', '<span class="ask-dots" aria-label="Réponse en cours"><i></i><i></i><i></i></span>');
      busy = true; form.querySelector('button').disabled = true;
      const my = ctrl = new AbortController();
      let raf = 0;
      try {
        const answer = await stream(msgs, text, t => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => { bot.innerHTML = md(t); });
        }, my.signal);
        cancelAnimationFrame(raf);
        bot.innerHTML = md(answer);
        msgs.push({ role: 'assistant', content: answer });
      } catch (e) {
        if (e.name === 'AbortError') return;
        bot.className = 'ask-msg err';
        bot.textContent = e.message;
        msgs.pop(); // la question sans réponse ne doit pas polluer l'historique envoyé
        if (e.auth) { pass = ''; store.set(''); pending = q; lockUI(true); }
      } finally {
        if (ctrl === my) { busy = false; form.querySelector('button').disabled = false; ctrl = null; }
      }
    }

    chips.addEventListener('click', e => {
      const b = e.target.closest('.ask-chip');
      if (b && ctx) send(ctx.chips[+b.dataset.i][1]);
    });
    form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
    lock.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = lock.querySelector('button');
      btn.disabled = true; err.textContent = '';
      try {
        await unlock(pwIn.value);
        const q = pending; pending = null;
        if (q) send(q);
      } catch (x) { err.textContent = x.message; }
      finally { btn.disabled = false; }
    });
    clear.addEventListener('click', reset);
    paperHost.addEventListener('ecg:set', refresh);

    const box = { refresh, lockUI };
    boxes.add(box);
    refresh();
    return box;
  }

  root.Chat = { attach, forCase, plain, measure };
})(window);
