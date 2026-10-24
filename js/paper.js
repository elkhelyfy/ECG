/* Papier ECG : rendu 12 dérivations (ou bande unique), annotations et compas de mesure. */
(function (root) {
  'use strict';

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const LAYOUT12 = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6'], ['R']];
  const PAPER_MM = 250, CAL_MM = 9, TOP_MM = 3;

  class Paper {
    constructor(host, o = {}) {
      this.host = host;
      this.o = Object.assign({ layout: '12', leads: ['II'], rowH: 27, minK: 3.4, caliper: true, rhythmLead: 'II' }, o);
      this.speed = 25; this.gain = 10; this.annot = false;
      this.data = null; this.marks = []; this.cal = null;
      host.classList.add('paper-host');
      this.base = document.createElement('canvas');
      this.over = document.createElement('canvas');
      this.over.className = 'paper-over';
      host.append(this.base, this.over);
      if (this.o.caliper) this.bindCaliper();
      this.ro = new ResizeObserver(() => this.draw());
      this.ro.observe(host.parentElement || host);
    }
    set(data, marks) { this.data = data; this.marks = marks || []; this.cal = null; this.draw(); }
    rows() {
      if (this.o.layout === '12') return LAYOUT12;
      return this.o.leads.map(l => [l + '!']);
    }
    geom() {
      const rows = this.rows();
      const wmm = CAL_MM + PAPER_MM + 3;
      const avail = (this.host.parentElement || this.host).clientWidth || 900;
      const k = Math.max(this.o.minK, avail / wmm);
      const hmm = TOP_MM + rows.length * this.o.rowH + 2;
      return { k, wmm, hmm, rows, W: Math.round(wmm * k), H: Math.round(hmm * k) };
    }
    // fenêtre temporelle d'une case : [t0, t1] et position x0 (mm)
    cell(r, c, rows) {
      const span = PAPER_MM / this.speed;
      const row = rows[r];
      if (row.length === 1) return { t0: 0, t1: span, x0: CAL_MM, wmm: PAPER_MM };
      const cw = PAPER_MM / row.length, ct = span / row.length;
      return { t0: c * ct, t1: (c + 1) * ct, x0: CAL_MM + c * cw, wmm: cw };
    }
    locate(lead) {
      const rows = this.rows();
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
        const n = rows[r][c].replace('!', '');
        if (n === lead || (lead === 'R' && n === 'R')) return { r, c };
      }
      if (rows.length === 1) return { r: 0, c: 0 };
      return null;
    }
    leadOf(name) { return name === 'R' ? this.o.rhythmLead : name.replace('!', ''); }
    draw() {
      if (!this.data) return;
      const g = this.geom(), dpr = window.devicePixelRatio || 1;
      this.g = g;
      [this.base, this.over].forEach(cv => {
        cv.width = g.W * dpr; cv.height = g.H * dpr;
        cv.style.width = g.W + 'px'; cv.style.height = g.H + 'px';
      });
      this.host.style.width = g.W + 'px'; this.host.style.height = g.H + 'px';
      const x = this.base.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const k = g.k;
      x.fillStyle = css('--paper'); x.fillRect(0, 0, g.W, g.H);
      // grille
      const minor = css('--grid-minor'), major = css('--grid-major');
      x.lineWidth = 1;
      for (let m = 0; m <= g.wmm; m++) {
        x.strokeStyle = m % 5 ? minor : major; x.lineWidth = m % 5 ? 0.5 : 1;
        x.beginPath(); x.moveTo(m * k + 0.5, 0); x.lineTo(m * k + 0.5, g.H); x.stroke();
      }
      for (let m = 0; m <= g.hmm; m++) {
        x.strokeStyle = m % 5 ? minor : major; x.lineWidth = m % 5 ? 0.5 : 1;
        x.beginPath(); x.moveTo(0, m * k + 0.5); x.lineTo(g.W, m * k + 0.5); x.stroke();
      }
      if (this.annot) this.drawMarks(x, g);
      // tracés
      const ink = css('--trace'), d = this.data;
      x.strokeStyle = ink; x.lineWidth = Math.max(1.1, k * 0.32); x.lineJoin = 'round';
      x.font = `600 ${Math.max(10, k * 3)}px ${css('--font-data')}`; x.fillStyle = ink;
      g.rows.forEach((row, r) => {
        const base = (TOP_MM + r * this.o.rowH + this.o.rowH * 0.62) * k;
        // impulsion d'étalonnage 1 mV
        const cw = 0.2 * this.speed;
        x.beginPath();
        x.moveTo(1 * k, base); x.lineTo(2 * k, base); x.lineTo(2 * k, base - this.gain * k);
        x.lineTo((2 + cw) * k, base - this.gain * k); x.lineTo((2 + cw) * k, base); x.lineTo(CAL_MM * k, base);
        x.stroke();
        row.forEach((name, c) => {
          const cell = this.cell(r, c, g.rows), lead = this.leadOf(name);
          const sig = d.leads[lead]; if (!sig) return;
          const i0 = Math.floor(cell.t0 * d.fs), i1 = Math.min(d.N - 1, Math.floor(cell.t1 * d.fs));
          const pxPerSample = this.speed * k / d.fs;
          const step = Math.max(1, Math.floor(0.5 / pxPerSample));
          x.beginPath();
          for (let i = i0; i <= i1; i += step) {
            const px = (cell.x0 + (i / d.fs - cell.t0) * this.speed) * k;
            const py = base - sig[i] * this.gain * k;
            i === i0 ? x.moveTo(px, py) : x.lineTo(px, py);
          }
          x.stroke();
          if (c > 0) { x.beginPath(); x.moveTo(cell.x0 * k, base - 4 * k); x.lineTo(cell.x0 * k, base + 4 * k); x.stroke(); }
          const label = name === 'R' ? this.o.rhythmLead : lead;
          x.fillText(label === 'I' || label === 'II' || label === 'III' ? 'D' + label : label, (cell.x0 + 1.2) * k, base - 10.5 * k);
        });
      });
      x.font = `${Math.max(9, k * 2.4)}px ${css('--font-data')}`;
      x.fillStyle = css('--ink-soft');
      x.fillText(`${this.speed} mm/s · ${this.gain} mm/mV`, (g.wmm - 42) * k, (g.hmm - 1) * k);
      this.drawCaliper();
    }
    /* ---------- annotations ---------- */
    ranges(mark) {
      const d = this.data, loc = this.locate(mark.lead);
      if (!loc) return [];
      const cell = this.cell(loc.r, loc.c, this.g.rows);
      const inWin = (a, b) => a >= cell.t0 - 0.02 && b <= cell.t1 + 0.02;
      const Q = d.events.filter(e => e.type === 'QRS');
      const P = d.events.filter(e => e.type === 'P');
      const f = mark.f;
      if (f === 'window') {
        const a = mark.t0 != null ? mark.t0 : cell.t0 + 0.05, b = mark.t1 != null ? mark.t1 : cell.t1 - 0.05;
        return [[Math.max(a, cell.t0), Math.min(b, cell.t1)]].filter(r => r[1] > r[0]);
      }
      if (f === 'p' && (mark.which === 'blocked' || mark.which === 'allP' || mark.which === 'ectopic')) {
        let ps = P.filter(p => inWin(p.t - 0.01, p.t + p.dur));
        if (mark.which === 'blocked') ps = ps.filter(p => p.conducted === false);
        if (mark.which === 'ectopic') ps = ps.filter(p => p.m === 'ectopicP');
        return ps.map(p => [p.t - 0.01, p.t + p.dur]);
      }
      const full = Q.filter(q => inWin(q.t - 0.18, (q.tPeak || q.t) + 0.08));
      let pick;
      if (mark.which === 'all') pick = full;
      else if (typeof mark.which === 'number') pick = full.slice(mark.which, mark.which + 1);
      else if (typeof mark.which === 'string') pick = full.filter(q => q.m === mark.which).slice(0, 1);
      else pick = full.slice(0, 1);
      if (!pick.length && Q.length) pick = Q.filter(q => q.t > cell.t0 && q.t < cell.t1).slice(0, 1);
      const out = [];
      pick.forEach(q => {
        const pIn = P.filter(p => p.qrsT && Math.abs(p.qrsT - q.t) < 0.005)[0];
        switch (f) {
          case 'p': if (pIn) out.push([pIn.t - 0.01, pIn.t + pIn.dur]); break;
          case 'pr': if (pIn) out.push([pIn.t, q.t]); break;
          case 'qrs': out.push([q.t - 0.01, q.t + q.dur + 0.01]); break;
          case 'delta': out.push([q.t - 0.02, q.t + 0.05]); break;
          case 'j': out.push([q.t + q.dur - 0.025, q.t + q.dur + 0.03]); break;
          case 'spike': out.push([q.spike - 0.012, q.spike + 0.012]); break;
          case 'st': out.push([q.t + q.dur, q.tPeak - 0.03]); break;
          case 't': out.push([q.tPeak - 0.09, q.tPeak + 0.08]); break;
          case 'u': out.push([q.tPeak + 0.1, q.tPeak + 0.27]); break;
          case 'qt': out.push([q.t, q.tPeak + q.morph.tEnd]); break;
          case 'beat': out.push([(pIn ? pIn.t : q.t) - 0.04, q.tPeak + 0.1]); break;
          case 'rr': { const nx = Q[Q.indexOf(q) + 1]; if (nx) out.push([q.t + 0.03, nx.t + 0.03]); break; }
        }
      });
      return out.filter(r => inWin(r[0], r[1]));
    }
    drawMarks(x, g) {
      const k = g.k, acc = css('--accent'), accSoft = css('--accent-wash');
      const placed = [];
      this.marks.forEach(mark => {
        const loc = this.locate(mark.lead); if (!loc) return;
        const cell = this.cell(loc.r, loc.c, g.rows);
        const base = TOP_MM + loc.r * this.o.rowH + this.o.rowH * 0.62;
        const isCal = mark.f === 'cal';
        const rs = isCal ? [[0, 0]] : this.ranges(mark);
        rs.forEach((rg, i) => {
          const xa = isCal ? 0.4 * k : (cell.x0 + (rg[0] - cell.t0) * this.speed) * k;
          const xb = isCal ? (CAL_MM - 0.4) * k : (cell.x0 + (rg[1] - cell.t0) * this.speed) * k;
          const ya = (base - 14) * k, yb = (base + 8) * k;
          x.fillStyle = accSoft; x.fillRect(xa, ya, xb - xa, yb - ya);
          x.strokeStyle = acc; x.lineWidth = 1.5; x.setLineDash([4, 3]);
          x.strokeRect(xa + 0.5, ya + 0.5, xb - xa, yb - ya); x.setLineDash([]);
          if (i === 0 && mark.label) {
            x.font = `600 ${Math.max(10, k * 2.6)}px ${css('--font-body')}`;
            const tw = x.measureText(mark.label).width + 10, th = Math.max(16, k * 4.2);
            let lx = Math.min(xa, g.W - tw - 4), ly = ya - th - 2;
            placed.forEach(p => { if (lx < p.x + p.w && lx + tw > p.x && Math.abs(ly - p.y) < th) ly = p.y + th + 2; });
            placed.push({ x: lx, y: ly, w: tw });
            x.fillStyle = acc; roundRect(x, lx, ly, tw, th, 4); x.fill();
            x.fillStyle = css('--on-accent'); x.textBaseline = 'middle';
            x.fillText(mark.label, lx + 5, ly + th / 2 + 0.5); x.textBaseline = 'alphabetic';
          }
        });
      });
    }
    /* ---------- compas ---------- */
    bindCaliper() {
      const pos = e => { const r = this.over.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      this.over.addEventListener('pointerdown', e => {
        this.over.setPointerCapture(e.pointerId);
        const p = pos(e); this.cal = { a: p, b: p, live: true }; this.drawCaliper();
      });
      this.over.addEventListener('pointermove', e => { if (this.cal && this.cal.live) { this.cal.b = pos(e); this.drawCaliper(); } });
      const end = () => { if (this.cal) { this.cal.live = false; if (Math.abs(this.cal.b.x - this.cal.a.x) < 3 && Math.abs(this.cal.b.y - this.cal.a.y) < 3) this.cal = null; this.drawCaliper(); } };
      this.over.addEventListener('pointerup', end);
      this.over.addEventListener('pointercancel', end);
    }
    clearCaliper() { this.cal = null; this.drawCaliper(); }
    drawCaliper() {
      const g = this.g; if (!g) return;
      const dpr = window.devicePixelRatio || 1, x = this.over.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, g.W, g.H);
      if (!this.cal) return;
      const { a, b } = this.cal, col = css('--caliper');
      const dtMs = Math.abs(b.x - a.x) / g.k / this.speed * 1000;
      const dmv = Math.abs(b.y - a.y) / g.k / this.gain;
      x.strokeStyle = col; x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(a.x, a.y - 30); x.lineTo(a.x, a.y + 30);
      x.moveTo(b.x, a.y - 30); x.lineTo(b.x, a.y + 30);
      x.moveTo(a.x, a.y); x.lineTo(b.x, a.y);
      x.stroke();
      if (dmv > 0.05) { x.setLineDash([3, 3]); x.beginPath(); x.moveTo(b.x, a.y); x.lineTo(b.x, b.y); x.stroke(); x.setLineDash([]); }
      const txt = `${Math.round(dtMs)} ms` + (dtMs > 200 ? ` · ${Math.round(60000 / dtMs)}/min` : '') + (dmv > 0.05 ? ` · ${dmv.toFixed(2)} mV` : '');
      x.font = `600 12px ${css('--font-data')}`;
      const tw = x.measureText(txt).width + 12, lx = Math.min(Math.max(4, (a.x + b.x) / 2 - tw / 2), g.W - tw - 4), ly = Math.max(4, a.y - 54);
      x.fillStyle = col; roundRect(x, lx, ly, tw, 20, 5); x.fill();
      x.fillStyle = css('--on-accent'); x.fillText(txt, lx + 6, ly + 14);
    }
  }
  function roundRect(x, X, Y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }
  root.Paper = Paper;
  root.cssVar = css;
})(window);
