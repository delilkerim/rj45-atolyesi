'use strict';
/* =====================================================================
   SİMÜLASYON MOTORU — dünya birimi milimetre, kamera ile ölçeklenir
   ===================================================================== */
const Sim = (() => {
  const W = 1600, H = 1000;
  let cv, ctx, cssScale = 1, DPR = 1, last = 0, running = false;
  const cam = { x: 0, y: 0, ppm: 10, tx: 0, ty: 0, tppm: 10 };
  let scene = null, E = null, T = null, cb = {};
  const effects = [];
  let drag = null, hoverW = [0, 0], pointerIn = false;
  let opts = { labels: false, sound: true, practice: true, reduced: false };
  let noisePat = null;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const hyp = Math.hypot;
  const JD = 6.2, WW = 1.05, PL = 22, PW = 11.7;
  const JACKET = { base: '#3a73b8', dark: '#1d4778', light: '#8fb8e6' };
  const LAY = [11.5, 13.4, 15.6, 18.2];

  /* ---------- renk yardımcıları ---------- */
  function rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  function shade(h, a) {
    const c = rgb(h).map(v => a < 0 ? v * (1 + a) : v + (255 - v) * a);
    return 'rgb(' + c.map(v => Math.round(clamp(v, 0, 255))).join(',') + ')';
  }

  /* ---------- ses (Web Audio ile sentez) ---------- */
  const AU = {
    ac: null,
    ensure() {
      if (!opts.sound) return null;
      try { if (!this.ac) this.ac = new (window.AudioContext || window.webkitAudioContext)(); if (this.ac.state === 'suspended') this.ac.resume(); } catch (e) { return null; }
      return this.ac;
    },
    noise(dur, freq, q, vol, type) {
      const ac = this.ensure(); if (!ac) return;
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
    },
    tone(freq, dur, vol, type) {
      const ac = this.ensure(); if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    },
    click() { this.noise(0.025, 3200, 6, 0.5); },
    ratchet() { this.noise(0.018, 4200, 9, 0.35); },
    snap() { this.noise(0.05, 1800, 3, 0.8); this.noise(0.02, 5200, 5, 0.4); },
    cut() { this.noise(0.06, 2600, 2, 0.7); },
    thud() { this.noise(0.08, 380, 1.2, 0.9, 'lowpass'); },
    crimp() { this.noise(0.12, 900, 1.5, 1); this.noise(0.04, 3000, 4, 0.6); },
    beep() { this.tone(2400, 0.05, 0.05, 'square'); },
    err() { this.tone(220, 0.18, 0.12, 'sawtooth'); },
  };

  /* ---------- tuval ve kamera ---------- */
  function resize() {
    if (!cv) return;
    const box = cv.parentElement.getBoundingClientRect();
    let w = Math.max(200, box.width), h = w * H / W;
    const maxH = Math.max(220, window.innerHeight - (window.innerWidth < 1000 ? 24 : 150));
    if (h > maxH) { h = maxH; w = h * W / H; }
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    DPR = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
    cssScale = w / W;
  }
  function setCam(x, y, ppm, instant) { cam.tx = x; cam.ty = y; cam.tppm = ppm; if (instant || opts.reduced) { cam.x = x; cam.y = y; cam.ppm = ppm; } }
  function fitCam(x0, y0, x1, y1, instant) { setCam((x0 + x1) / 2, (y0 + y1) / 2, Math.min(W / (x1 - x0), H / (y1 - y0)), instant); }
  const w2s = (x, y) => [(x - cam.x) * cam.ppm + W / 2, (y - cam.y) * cam.ppm + H / 2];
  const s2w = (x, y) => [(x - W / 2) / cam.ppm + cam.x, (y - H / 2) / cam.ppm + cam.y];
  function worldTf() { const k = DPR * cssScale; ctx.setTransform(k * cam.ppm, 0, 0, k * cam.ppm, k * (W / 2 - cam.x * cam.ppm), k * (H / 2 - cam.y * cam.ppm)); }
  function screenTf() { const k = DPR * cssScale; ctx.setTransform(k, 0, 0, k, 0, 0); }
  function shadowOn(blur, ox, oy, a) { const k = DPR * cssScale; ctx.shadowColor = 'rgba(0,0,0,' + (a == null ? 0.45 : a) + ')'; ctx.shadowBlur = blur * k; ctx.shadowOffsetX = ox * k; ctx.shadowOffsetY = oy * k; }
  function shadowOff() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
  const FONT = '"Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif';
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

  /* ---------- kesme matı ---------- */
  function makeNoise() {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'); const id = g.createImageData(160, 160);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 10; }
    g.putImageData(id, 0, 0); noisePat = ctx.createPattern(c, 'repeat');
  }
  function drawMat() {
    screenTf();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2c5a4d'); g.addColorStop(1, '#244c41');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (noisePat) { ctx.fillStyle = noisePat; ctx.fillRect(0, 0, W, H); }
    worldTf();
    const [x0, y0] = s2w(0, 0), [x1, y1] = s2w(W, H);
    const steps = cam.ppm > 7 ? [[1, 0.05], [5, 0.09], [10, 0.2]] : cam.ppm > 2 ? [[10, 0.12], [50, 0.2]] : [[10, 0.07], [100, 0.2]];
    for (const [st, a] of steps) {
      if (st * cam.ppm < 5) continue;
      ctx.strokeStyle = 'rgba(200,236,215,' + a + ')'; ctx.lineWidth = (st >= 10 ? 1.2 : 0.8) / cam.ppm;
      ctx.beginPath();
      for (let x = Math.floor(x0 / st) * st; x <= x1; x += st) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.floor(y0 / st) * st; y <= y1; y += st) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    }
    screenTf();
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    worldTf();
  }

  /* ---------- yol çizimi ---------- */
  function tracePath(pts) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); return; }
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const l = pts[pts.length - 1]; ctx.lineTo(l.x, l.y);
  }
  function offsetPts(pts, d) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y; const l = hyp(dx, dy) || 1; dx /= l; dy /= l;
      let nx = -dy, ny = dx; if (nx * -0.45 + ny * -1 < 0) { nx = -nx; ny = -ny; }
      out.push({ x: pts[i].x + nx * d, y: pts[i].y + ny * d });
    }
    return out;
  }
  function tube(pts, w, base, dark, light, stripe, shadow) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (shadow) shadowOn(shadow, shadow * 0.25, shadow * 0.45, 0.4);
    tracePath(pts); ctx.strokeStyle = dark; ctx.lineWidth = w; ctx.stroke();
    shadowOff();
    tracePath(pts); ctx.strokeStyle = base; ctx.lineWidth = w * 0.8; ctx.stroke();
    if (stripe) {
      ctx.setLineDash([w * 0.75, w * 1.5]); tracePath(pts); ctx.strokeStyle = stripe; ctx.lineWidth = w * 0.8; ctx.stroke(); ctx.setLineDash([]);
    }
    const hp = offsetPts(pts, w * 0.2); tracePath(hp);
    ctx.strokeStyle = light; ctx.globalAlpha = 0.6; ctx.lineWidth = w * 0.2; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function wireTube(pts, id, shadow) {
    const c = D.COLORS[id];
    tube(pts, WW, c.base, shade(c.stripe || c.base, -0.45), '#ffffff', c.stripe || null, shadow);
  }
  function copperTip(x, y) {
    ctx.fillStyle = '#b8742f'; ctx.beginPath(); ctx.arc(x, y, WW * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(x - 0.08, y - 0.08, WW * 0.12, 0, Math.PI * 2); ctx.fill();
  }

  /* ---------- düz kablo kılıfı (soldan sağa) ---------- */
  function jacketStraight(x0, x1, y, print) {
    shadowOn(14, 3, 6, 0.5);
    const g = ctx.createLinearGradient(0, y - JD / 2, 0, y + JD / 2);
    g.addColorStop(0, JACKET.dark); g.addColorStop(0.18, JACKET.base); g.addColorStop(0.32, JACKET.light);
    g.addColorStop(0.5, JACKET.base); g.addColorStop(0.88, shade(JACKET.base, -0.35)); g.addColorStop(1, JACKET.dark);
    ctx.fillStyle = g; ctx.fillRect(x0, y - JD / 2, x1 - x0, JD);
    shadowOff();
    // kesik yüz
    ctx.fillStyle = shade(JACKET.base, -0.25);
    ctx.beginPath(); ctx.ellipse(x1, y, 0.9, JD / 2, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
    if (print && cam.ppm > 4) {
      screenTf();
      const fs = 1.6 * cam.ppm;
      ctx.font = '600 ' + fs + 'px ' + MONO; ctx.fillStyle = 'rgba(235,242,250,0.55)'; ctx.textBaseline = 'middle';
      const txt = 'CAT.6 U/UTP 4x2xAWG23 250MHz LSZH  ▸  ';
      const tw = ctx.measureText(txt).width;
      const [sxE, sy] = w2s(x1, y); const [sx0] = w2s(x0, y);
      ctx.save(); ctx.beginPath(); ctx.rect(Math.max(0, sx0), sy - fs, sxE - Math.max(0, sx0) - 1.5 * cam.ppm, fs * 2); ctx.clip();
      for (let sx = sxE - 4 * cam.ppm - tw; sx > sx0 - tw; sx -= tw) ctx.fillText(txt, sx, sy + 0.1 * cam.ppm);
      ctx.restore();
      worldTf();
    }
  }

  /* ---------- bükümlü çiftler ---------- */
  function pairY(k, x, len, spread) {
    const a = E.pairAnchor[k], b = lerp(a, E.pairTip[k], spread);
    return a + (b - a) * smooth(x / len);
  }
  function drawPairs(ox, len, spread, twist, highlightK) {
    const n = Math.max(24, Math.ceil(len / 0.35));
    const runs = [];
    for (let k = 0; k < 4; k++) {
      const t = twist[k];
      if (highlightK === k) {
        ctx.strokeStyle = 'rgba(255,240,170,0.35)'; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(ox, pairY(k, 0, len, spread)); for (let i = 1; i <= 20; i++) { const x = i * len / 20; ctx.lineTo(ox + x, pairY(k, x, len, spread)); } ctx.stroke();
      }
      const ph = x => 2 * Math.PI * x / LAY[k] + k * 1.3;
      for (let j = 0; j < 2; j++) {
        const id = E.pairWires[k][j], sg = j === 0 ? 1 : -1;
        let cur = null;
        for (let i = 0; i <= n; i++) {
          const x = i * len / n, y = pairY(k, x, len, spread) + sg * 0.53 * (t * Math.sin(ph(x)) + (1 - t));
          const front = (sg * t * Math.cos(ph(x))) >= 0;
          const pt = { x: ox + x, y };
          if (!cur || cur.front !== front) { if (cur) cur.pts.push(pt); cur = { id, front, pts: cur ? [cur.pts[cur.pts.length - 1], pt] : [pt], k }; runs.push(cur); }
          else cur.pts.push(pt);
        }
      }
    }
    runs.sort((a, b) => (a.front ? 1 : 0) - (b.front ? 1 : 0));
    for (const r of runs) if (r.pts.length > 1) wireTube(r.pts, r.id, 0);
  }
  function drawSpline(ox, len, a) {
    ctx.globalAlpha = a == null ? 1 : a;
    const g = ctx.createLinearGradient(0, -0.7, 0, 0.7);
    g.addColorStop(0, 'rgba(210,214,206,0.95)'); g.addColorStop(0.4, 'rgba(250,250,245,0.98)'); g.addColorStop(1, 'rgba(170,176,168,0.95)');
    ctx.fillStyle = g; ctx.fillRect(ox, -0.65, len, 1.3);
    ctx.globalAlpha = 1;
  }

  /* ---------- verlet ip (bükülebilir tel/kablo) ---------- */
  class Rope {
    constructor(pts, pinned) {
      this.p = pts.map(q => ({ x: q[0], y: q[1], ox: q[0], oy: q[1] }));
      this.n = this.p.length; this.pinned = pinned || 2;
      let L = 0; for (let i = 1; i < this.n; i++) L += hyp(this.p[i].x - this.p[i - 1].x, this.p[i].y - this.p[i - 1].y);
      this.seg = L / (this.n - 1); this.tip = null; this.head = null; this.awake = 0; this.minX = 0.35;
      this.damp = 0.55; this.bend = 0.1;
    }
    get length() { return this.seg * (this.n - 1); }
    get end() { return this.p[this.n - 1]; }
    step(iter) {
      const p = this.p, n = this.n;
      for (let i = 0; i < n; i++) {
        if (i < this.pinned && !this.head) continue;
        const q = p[i]; const vx = (q.x - q.ox) * this.damp, vy = (q.y - q.oy) * this.damp;
        q.ox = q.x; q.oy = q.y; q.x += vx; q.y += vy;
      }
      const inv = i => {
        if (this.head) { if (i === 0) return 0; } else if (i < this.pinned) return 0;
        if (i === n - 1 && this.tip) return 0;
        return 1;
      };
      for (let it = 0; it < (iter || 14); it++) {
        if (this.tip) { p[n - 1].x = this.tip.x; p[n - 1].y = this.tip.y; }
        if (this.head) { p[0].x = this.head.x; p[0].y = this.head.y; }
        for (let i = 0; i < n - 1; i++) {
          const a = p[i], b = p[i + 1]; const wa = inv(i), wb = inv(i + 1); if (!wa && !wb) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy) || 1e-6, df = (d - this.seg) / d / (wa + wb);
          a.x += dx * df * wa; a.y += dy * df * wa; b.x -= dx * df * wb; b.y -= dy * df * wb;
        }
        for (let i = 0; i < n - 2; i++) {
          const a = p[i], b = p[i + 2]; const wa = inv(i), wb = inv(i + 2); if (!wa && !wb) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy) || 1e-6, r = this.seg * 1.96;
          if (d >= r) continue;
          const df = (d - r) / d / (wa + wb) * this.bend;
          a.x += dx * df * wa; a.y += dy * df * wa; b.x -= dx * df * wb; b.y -= dy * df * wb;
        }
        if (this.minX != null) for (let i = 2; i < n; i++) if (inv(i) && p[i].x < this.minX) p[i].x = this.minX;
      }
    }
  }
  function clampReach(anchor, pt, L) {
    const dx = pt.x - anchor.x, dy = pt.y - anchor.y, d = hyp(dx, dy);
    if (d <= L * 0.985) return pt;
    const k = L * 0.985 / d; return { x: anchor.x + dx * k, y: anchor.y + dy * k };
  }

  /* ---------- efektler ---------- */
  function addPiece(obj) { effects.push(Object.assign({ t: 0, life: 1.1 }, obj)); }
  function bubble(x, y, text, kind) { effects.push({ bubble: true, x, y, text, kind: kind || 'info', t: 0, life: 2.8 }); }
  function drawEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const f = effects[i]; f.t += dt;
      if (f.t > f.life) { effects.splice(i, 1); continue; }
      const a = 1 - f.t / f.life;
      if (f.pieces) {
        ctx.globalAlpha = a;
        for (const p of f.pieces) {
          const x = p.x + p.vx * f.t, y = p.y + p.vy * f.t + 6 * f.t * f.t;
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.r * f.t);
          wireTube([{ x: -p.l / 2, y: 0 }, { x: p.l / 2, y: 0 }], p.id, 0);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      } else if (f.slug) {
        ctx.globalAlpha = a;
        ctx.save(); ctx.translate(f.x + 40 * f.t, f.y + 30 * f.t * f.t); ctx.rotate(0.5 * f.t);
        jacketStraight(-f.l / 2, f.l / 2, 0, false); ctx.restore(); ctx.globalAlpha = 1;
      } else if (f.splinePiece) {
        ctx.globalAlpha = a; ctx.save(); ctx.translate(f.x + 10 * f.t, f.y + 18 * f.t * f.t); ctx.rotate(0.6 * f.t); drawSpline(-f.l / 2, f.l, 1); ctx.restore(); ctx.globalAlpha = 1;
      }
    }
  }
  function drawBubbles() {
    screenTf();
    for (const f of effects) {
      if (!f.bubble) continue;
      const a = Math.min(1, (f.life - f.t) * 2, f.t * 6);
      const [sx, sy] = w2s(f.x, f.y);
      pill(sx, sy - 10 - f.t * 8, f.text, { a, kind: f.kind, size: 26 });
    }
    worldTf();
  }
  function pill(sx, sy, text, o) {
    o = o || {};
    const size = o.size || 22;
    ctx.font = '600 ' + size + 'px ' + FONT;
    const tw = ctx.measureText(text).width, pw = tw + size * 0.9, ph = size * 1.5;
    const bg = { info: 'rgba(16,28,36,0.9)', ok: 'rgba(22,96,58,0.95)', err: 'rgba(150,40,30,0.95)', warn: 'rgba(150,100,10,0.95)', light: 'rgba(250,252,250,0.95)' }[o.kind || 'info'];
    ctx.globalAlpha = o.a == null ? 1 : o.a;
    let x = clamp(sx - pw / 2, 6, W - pw - 6), y = clamp(sy - ph / 2, 6, H - ph - 6);
    ctx.fillStyle = bg; roundRect(x, y, pw, ph, ph / 2); ctx.fill();
    ctx.fillStyle = o.kind === 'light' ? '#13212b' : '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, x + pw / 2, y + ph / 2 + 1);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ---------- çelik cetvel ---------- */
  function ruler(x0, y, len, dir, label) {
    // dir: +1 sağa doğru artan, -1 sola doğru artan; x0 sıfır noktası
    const xa = dir > 0 ? x0 - 3 : x0 - len - 3, xb = dir > 0 ? x0 + len + 3 : x0 + 3;
    shadowOn(8, 2, 3, 0.4);
    const g = ctx.createLinearGradient(0, y, 0, y + 9);
    g.addColorStop(0, '#e9edef'); g.addColorStop(0.45, '#c4cbcf'); g.addColorStop(0.55, '#d7dde0'); g.addColorStop(1, '#9aa3a8');
    ctx.fillStyle = g; ctx.fillRect(xa, y, xb - xa, 9); shadowOff();
    ctx.strokeStyle = '#1b2126'; ctx.lineWidth = 0.12;
    ctx.beginPath();
    for (let m = 0; m <= len; m++) {
      const x = x0 + dir * m, h = m % 10 === 0 ? 3.2 : m % 5 === 0 ? 2.2 : 1.3;
      ctx.moveTo(x, y); ctx.lineTo(x, y + h);
    }
    ctx.stroke();
    if (cam.ppm > 3) {
      screenTf(); ctx.fillStyle = '#1b2126'; ctx.font = '600 ' + Math.max(11, 2.2 * cam.ppm) + 'px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let m = 0; m <= len; m += 10) { const [sx, sy] = w2s(x0 + dir * m, y + 3.6); ctx.fillText(String(m / 10), sx, sy); }
      if (label) { ctx.font = '500 ' + Math.max(10, 1.7 * cam.ppm) + 'px ' + FONT; const [sx, sy] = w2s(x0 + dir * (len - 6), y + 6.3); ctx.fillText(label, sx, sy); }
      ctx.textAlign = 'left'; worldTf();
    }
  }

  /* ---------- RJ-45 konnektör (üstten görünüş) ---------- */
  // fx: ön uç x, y: eksen, flipped: klips üstte, press: 0..1 pin basma
  function plugTop(fx, y, flipped, press, opt) {
    opt = opt || {};
    ctx.save(); ctx.translate(fx, y); if (opt.rot) ctx.rotate(opt.rot);
    const x0 = -PL, x1 = 0, hw = PW / 2;
    shadowOn(12, 2, 5, 0.35);
    ctx.fillStyle = 'rgba(214,226,232,0.38)';
    ctx.beginPath(); ctx.moveTo(x0, -hw + 0.6); ctx.lineTo(x1 - 1.2, -hw); ctx.quadraticCurveTo(x1, -hw, x1, -hw + 1.2);
    ctx.lineTo(x1, hw - 1.2); ctx.quadraticCurveTo(x1, hw, x1 - 1.2, hw); ctx.lineTo(x0, hw - 0.6); ctx.closePath(); ctx.fill();
    shadowOff();
    // plastik kenar ve parlama
    ctx.strokeStyle = 'rgba(235,245,250,0.85)'; ctx.lineWidth = 0.28; ctx.stroke();
    const g = ctx.createLinearGradient(0, -hw, 0, hw);
    g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.2, 'rgba(255,255,255,0.05)'); g.addColorStop(0.8, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(255,255,255,0.3)');
    ctx.fillStyle = g; ctx.fill();
    // iç kanallar
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.12;
    ctx.beginPath(); for (let k = 0; k <= 8; k++) { const yy = (k - 4) * 1.02; ctx.moveTo(-10.5, yy); ctx.lineTo(-1.1, yy); } ctx.stroke();
    // ön duvar
    ctx.fillStyle = 'rgba(230,238,242,0.55)'; ctx.fillRect(-1.1, -hw + 0.5, 1.0, PW - 1.0);
    // gerilim giderici dil (kilit dili)
    const wedgeDown = (opt.wedge || 0);
    ctx.fillStyle = 'rgba(205,218,226,' + (0.5 + wedgeDown * 0.3) + ')';
    roundRect(-19.5, -hw + 1.4, 5.5, PW - 2.8, 0.6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.15; ctx.stroke();
    // altın kontaklar
    const ca = flipped ? 0.3 : 1;
    for (let k = 0; k < 8; k++) {
      const yy = (k - 3.5) * 1.02, raise = (1 - press) * 0.25;
      const gg = ctx.createLinearGradient(0, yy - 0.3, 0, yy + 0.3);
      gg.addColorStop(0, 'rgba(255,236,160,' + ca + ')'); gg.addColorStop(0.5, 'rgba(214,166,58,' + ca + ')'); gg.addColorStop(1, 'rgba(150,104,30,' + ca + ')');
      ctx.fillStyle = gg;
      ctx.fillRect(-5.2 - raise, yy - 0.29, 3.6 + raise * 2, 0.58);
    }
    if (flipped) {
      // klips (mandal) üstte görünür
      ctx.fillStyle = 'rgba(200,214,222,0.8)';
      ctx.beginPath(); ctx.moveTo(-15.5, -2.6); ctx.lineTo(-3.2, -3.1); ctx.quadraticCurveTo(-2.4, 0, -3.2, 3.1); ctx.lineTo(-15.5, 2.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(120,135,145,0.55)'; ctx.lineWidth = 0.15;
      ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(-13 + i * 1.1, -2); ctx.lineTo(-13 + i * 1.1, 2); } ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- yan kesit (lup) ---------- */
  function sideInset(sx, sy, sw, sh, d) {
    // d: {fx, cutLen, press, title}
    screenTf();
    ctx.save();
    shadowOn(18, 0, 6, 0.5);
    ctx.fillStyle = 'rgba(244,247,248,0.97)'; roundRect(sx, sy, sw, sh, 14); ctx.fill(); shadowOff();
    ctx.beginPath(); roundRect(sx, sy, sw, sh, 14); ctx.clip();
    ctx.fillStyle = '#13212b'; ctx.font = '600 26px ' + FONT; ctx.textBaseline = 'top';
    ctx.fillText(d.title || 'Yandan görünüş (lup)', sx + 18, sy + 14);
    const k = (sw - 60) / 30; // px/mm
    const ox = sx + sw - 30, oy = sy + sh * 0.5;
    const X = u => ox + u * k, Y = v => oy + v * k;
    // kılıf
    const jEnd = -d.fx; // kılıf ucu (konnektör ön ucu 0)
    ctx.fillStyle = '#3a73b8'; ctx.fillRect(X(-30), Y(-JD / 2 + 0.6), X(jEnd) - X(-30), JD * k - 1.2 * k);
    // teller
    const tip = d.cutLen - d.fx;
    const gw = ctx.createLinearGradient(0, Y(-1.3), 0, Y(1.3));
    gw.addColorStop(0, '#f2efe6'); gw.addColorStop(0.3, '#e8741a'); gw.addColorStop(0.55, '#2f9548'); gw.addColorStop(0.8, '#2a5fc2'); gw.addColorStop(1, '#7a4826');
    ctx.fillStyle = gw; ctx.fillRect(X(jEnd), Y(-1.0), X(tip) - X(jEnd), 2.0 * k);
    ctx.fillStyle = '#b8742f'; ctx.fillRect(X(tip) - 2, Y(-1.0), 3, 2.0 * k);
    // konnektör gövdesi
    ctx.strokeStyle = 'rgba(80,100,112,0.9)'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(190,210,220,0.35)';
    ctx.beginPath(); ctx.moveTo(X(-PL), Y(-4.2)); ctx.lineTo(X(-0.6), Y(-4.2)); ctx.lineTo(X(0), Y(-3.6)); ctx.lineTo(X(0), Y(3.4)); ctx.lineTo(X(-PL), Y(3.4)); ctx.closePath(); ctx.fill(); ctx.stroke();
    // klips
    ctx.beginPath(); ctx.moveTo(X(-3), Y(3.4)); ctx.lineTo(X(-15), Y(5.6)); ctx.stroke();
    // ön duvar
    ctx.fillStyle = 'rgba(80,100,112,0.5)'; ctx.fillRect(X(-1.0), Y(-4.2), 1.0 * k, 7.6 * k);
    // gerilim giderici
    const wd = d.press;
    ctx.fillStyle = 'rgba(80,100,112,0.75)'; ctx.fillRect(X(-19.5), Y(-4.2), 5.5 * k, (0.8 + wd * 1.4) * k);
    // kontak bıçakları
    for (let i = 0; i < 3; i++) {
      const u = -5 + i * 1.2; const top = -4.2 - (1 - d.press) * 0.6, bot = top + 1.9 + d.press * 0.6;
      ctx.fillStyle = '#d6a63a'; ctx.fillRect(X(u), Y(top), 0.6 * k, (bot - top) * k);
    }
    // ölçü notları
    ctx.font = '600 22px ' + FONT; ctx.fillStyle = '#13212b'; ctx.textBaseline = 'alphabetic';
    const gap = (d.fx - 1) - d.cutLen; const jd = PL - d.fx;
    const ok1 = gap <= 1.5, ok2 = jd >= 6;
    if (d.labels) {
      ctx.fillStyle = ok1 ? '#1f7a46' : '#a3321f';
      ctx.fillText('Tel ucu – ön duvar: ' + Math.max(0, gap).toFixed(1) + ' mm', sx + 18, sy + sh - 46);
      ctx.fillStyle = ok2 ? '#1f7a46' : '#a3321f';
      ctx.fillText('Kılıf içeride: ' + Math.max(0, jd).toFixed(1) + ' mm', sx + 18, sy + sh - 16);
    }
    ctx.restore();
    worldTf();
  }

  /* =================================================================
     SAHNE YARDIMCILARI
     ================================================================= */
  function newEnd(idx, cfg) {
    const pos = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const anchors = [-2.15, -0.72, 0.72, 2.15], tips = [-9.5, -3.2, 3.2, 9.5];
    const e = {
      idx, phase: '', stripLen: 0, splineStub: 0, twist: [1, 1, 1, 1], swept: [new Set(), new Set(), new Set(), new Set()],
      pairAnchor: [], pairTip: [], pairWires: [], ropes: [], slot: Array(8).fill(-1), wireSlot: Array(8).fill(-1),
      straight: false, lb: null, cutLen: 0, conn: null, crimp: 0, crimpFull: false, done: false,
      events: [], stats: { stripTries: 0, checks: 0, firstCheckErr: null, hints: 0, connectors: 0 },
      cfg,
    };
    for (let k = 0; k < 4; k++) {
      e.pairAnchor[k] = anchors[pos[k]]; e.pairTip[k] = tips[pos[k]];
      const pair = [2 * k, 2 * k + 1]; if (Math.random() < 0.5) pair.reverse();
      e.pairWires[k] = pair;
    }
    return e;
  }

  /* --------- SAHNE: kılıf soyma --------- */
  const sStrip = {
    enter() {
      E.phase = 'place'; E.tool = { x: -62, y: -30, snap: false, turns: 0, rot: 0, pull: 0, x0: 0 };
      fitCam(-118, -50, 32, 42);
    },
    hit(w) { const t = E.tool; return Math.abs(w[0] - t.x) < 16 && Math.abs(w[1] - t.y) < 13; },
    down(w) {
      if (E.phase === 'done') return;
      if (this.hit(w)) { drag = { kind: 'tool', sx: w[0], sy: w[1], tx: E.tool.x, ty: E.tool.y, mode: null }; AU.click(); }
    },
    move(w) {
      if (!drag) return;
      const t = E.tool;
      if (E.phase === 'place') {
        t.x = drag.tx + w[0] - drag.sx; t.y = drag.ty + w[1] - drag.sy;
        t.snap = Math.abs(t.y) < 8 && t.x < -4 && t.x > -95;
        if (t.snap) { t.y = 0; t.x = clamp(t.x, -90, -6); }
      } else if (E.phase === 'turn') {
        const dx = w[0] - drag.sx, dy = w[1] - drag.sy;
        if (!drag.mode) { if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) drag.mode = Math.abs(dy) >= Math.abs(dx) ? 'rot' : (t.turns < 0.2 ? 'slide' : 'rot'); }
        if (drag.mode === 'slide') { t.x = clamp(drag.tx + dx, -90, -6); if (Math.abs(w[1]) > 14) { E.phase = 'place'; t.snap = false; t.y = w[1]; } }
        if (drag.mode === 'rot') {
          const inc = Math.abs(w[1] - (drag.ly == null ? drag.sy : drag.ly)); drag.ly = w[1];
          const before = Math.floor(t.turns * 6);
          t.turns += inc / 26; t.rot += inc / 26 * Math.PI * 2;
          if (Math.floor(t.turns * 6) !== before) { AU.ratchet(); cb.hint && cb.hint('turn'); }
          if (t.turns >= 2) { E.phase = 'pull'; drag = null; t.x0 = t.x; AU.click(); bubble(t.x, -12, 'Kılıf çizildi — şimdi soyucuyu kablo ucuna doğru çek', 'ok'); cb.hint && cb.hint('pull'); }
        }
      } else if (E.phase === 'pull') {
        t.pull = clamp(w[0] - drag.sx, 0, 40); t.x = t.x0 + t.pull;
        if (t.pull > Math.min(10, -t.x0 * 0.5)) this.finish();
      }
    },
    up() {
      if (!drag) return; drag = null;
      const t = E.tool;
      if (E.phase === 'place' && t.snap) { E.phase = 'turn'; AU.click(); cb.hint && cb.hint('turn'); }
      if (E.phase === 'pull' && t.pull < 10) { t.pull = 0; t.x = t.x0; }
    },
    finish() {
      const t = E.tool; drag = null;
      E.stripLen = Math.round(-t.x0); E.phase = 'done';
      addPiece({ slug: true, x: t.x0 / 2 + 6, y: 0, l: -t.x0, life: 1.2 });
      AU.thud();
      E.tool.y = -30; E.tool.x = -62; E.tool.snap = false;
      cb.event('stripped', { len: E.stripLen });
    },
    draw() {
      const t = E.tool;
      ruler(0, 7, 100, -1, 'cm — kablo ucundan');
      const jEnd = E.phase === 'done' ? -E.stripLen : 0;
      if (E.phase === 'pull' && t.pull > 0) {
        // kılıf parçası kayıyor, altından teller görünüyor
        drawPairs(t.x0, -t.x0, 0, [1, 1, 1, 1]);
        jacketStraight(-260, t.x0, 0, true);
        ctx.save(); ctx.translate(t.pull, 0); jacketStraight(t.x0, 0, 0, false); ctx.restore();
      } else if (E.phase === 'done') {
        jacketStraight(-260, jEnd, 0, true); drawPairs(jEnd, E.stripLen, 0, [1, 1, 1, 1]);
      } else {
        jacketStraight(-260, 0, 0, true);
        if (t.turns > 0.3) { ctx.strokeStyle = 'rgba(20,30,40,' + Math.min(0.8, t.turns / 2) + ')'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(t.x, -JD / 2); ctx.lineTo(t.x, JD / 2); ctx.stroke(); }
      }
      if (E.phase !== 'done') drawStripper(t.x, t.y, t.rot, t.snap);
      if (t.snap && E.phase !== 'done') {
        screenTf(); const [sx, sy] = w2s(t.x, -15);
        pill(sx, sy, 'Soyma uzunluğu: ' + Math.round(-(E.phase === 'pull' ? t.x0 : t.x)) + ' mm', { kind: 'light', size: 24 });
        worldTf();
      }
    },
  };
  function drawStripper(x, y, rot, snap) {
    ctx.save(); ctx.translate(x, y);
    shadowOn(16, 3, 7, 0.45);
    const g = ctx.createLinearGradient(0, -11, 0, 11);
    g.addColorStop(0, '#f2c230'); g.addColorStop(0.35, '#ffd95a'); g.addColorStop(0.65, '#e3ad1c'); g.addColorStop(1, '#a87a08');
    ctx.fillStyle = g; roundRect(-15, -11, 30, 22, 8); ctx.fill(); shadowOff();
    ctx.strokeStyle = 'rgba(80,55,0,0.6)'; ctx.lineWidth = 0.35; ctx.stroke();
    // kablo kanalı
    ctx.fillStyle = 'rgba(40,30,10,0.35)'; ctx.fillRect(-15, -3.6, 30, 7.2);
    // döner gösterge
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(0, -7, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(Math.cos(rot) * 2, -7 + Math.sin(rot) * 2); ctx.stroke();
    // bıçak penceresi
    ctx.fillStyle = '#c9d0d4'; ctx.fillRect(-0.6, -3.6, 1.2, 2.6);
    // kaymaz tırtıl
    ctx.strokeStyle = 'rgba(120,85,0,0.5)'; ctx.lineWidth = 0.3; ctx.beginPath();
    for (let i = -12; i <= 12; i += 2) { ctx.moveTo(i, 6); ctx.lineTo(i, 9.5); } ctx.stroke();
    if (!snap) { ctx.fillStyle = 'rgba(60,40,0,0.75)'; ctx.font = '600 2.4px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('SOYUCU', 0, 7.2 - 9.8 + 10); ctx.textAlign = 'left'; }
    ctx.restore();
  }

  /* --------- SAHNE: ayırıcı (spline) kesme --------- */
  const sSpline = {
    enter() {
      E.phase = 'cut'; E.cutter = { x: E.stripLen + 12, y: 12, open: 0.5 };
      E.splineStub = E.stripLen; this.spread = 0;
      fitCam(-14, -15, E.stripLen + 26, 17);
    },
    update(dt) { this.spread = Math.min(0.42, this.spread + dt * 0.6); },
    down(w) {
      const c = E.cutter;
      if (hyp(w[0] - c.x - 4, w[1] - c.y - 4) < 9) { drag = { kind: 'cutter', ox: c.x - w[0], oy: c.y - w[1] }; AU.click(); }
    },
    move(w) { if (!drag) return; E.cutter.x = w[0] + drag.ox; E.cutter.y = w[1] + drag.oy; },
    up() {
      if (!drag) return; drag = null;
      const c = E.cutter, L = E.stripLen;
      if (E.phase !== 'cut') return;
      if (c.x < -1 || c.x > L + 1 || Math.abs(c.y) > 12) return;
      // tel mi ayırıcı mı?
      let onWire = -1;
      for (let k = 0; k < 4; k++) { const py = pairY(k, clamp(c.x, 0, L), L, this.spread); if (Math.abs(c.y - py) < 0.95) onWire = k; }
      const onSpline = Math.abs(c.y) < 0.85;
      if (onSpline && (onWire < 0 || Math.abs(c.y) < 0.4)) {
        AU.cut(); E.splineStub = Math.max(0, c.x); E.phase = 'done';
        addPiece({ splinePiece: true, x: (c.x + L) / 2, y: 0, l: L - c.x, life: 1.1 });
        cb.event('splineCut', { at: c.x });
      } else if (onWire >= 0) {
        AU.err(); bubble(c.x, -6, 'Dikkat! Keski telleri kesti', 'err');
        cb.event('wireDamaged', { pair: onWire });
      } else { bubble(c.x, -6, 'Keskinin ağzını ortadaki beyaz ayırıcının üzerine getir', 'warn'); }
    },
    draw() {
      const L = E.stripLen;
      ruler(0, 14, Math.min(60, Math.ceil(L / 10) * 10 + 10), 1, 'cm — kılıf ucundan');
      jacketStraight(-200, 0, 0, true);
      drawSpline(0, E.phase === 'done' ? E.splineStub : L);
      drawPairs(0, L, this.spread, E.twist);
      drawCutter(E.cutter.x, E.cutter.y, drag ? 0.15 : 0.55);
    },
  };
  function drawCutter(x, y, open) {
    // yan keski — ağız ucu (x,y)
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.65);
    shadowOn(14, 3, 6, 0.45);
    // saplar
    for (const s of [-1, 1]) {
      ctx.save(); ctx.rotate(s * open * 0.25);
      const g = ctx.createLinearGradient(0, -3, 0, 3);
      g.addColorStop(0, '#d8402e'); g.addColorStop(0.5, '#f0604a'); g.addColorStop(1, '#8c2014');
      ctx.fillStyle = g; roundRect(9, s * 2.2 - 2.4, 52, 4.8, 2.4); ctx.fill();
      ctx.restore();
    }
    shadowOff();
    // metal ağız
    for (const s of [-1, 1]) {
      ctx.save(); ctx.rotate(s * open * 0.25);
      const g = ctx.createLinearGradient(0, -2, 0, 2);
      g.addColorStop(0, '#d6dbde'); g.addColorStop(0.5, '#8e979c'); g.addColorStop(1, '#5c6468');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, s * 3.2); ctx.lineTo(12, s * 1.2); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#4c5458'; ctx.beginPath(); ctx.arc(10, 0, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b9c0c4'; ctx.beginPath(); ctx.arc(10, 0, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // hedef işareti
    ctx.strokeStyle = 'rgba(255,230,120,0.9)'; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.stroke();
  }

  /* --------- SAHNE: çiftleri açma --------- */
  const sUntwist = {
    enter() {
      E.phase = 'untwist'; this.spread = 0.42; this.active = -1;
      fitCam(-10, -14, E.stripLen + 12, 14);
    },
    update(dt) {
      this.spread = Math.min(1, this.spread + dt * 0.8);
      for (let k = 0; k < 4; k++) {
        const target = 1 - Math.min(1, E.swept[k].size / 14);
        E.twist[k] += (target - E.twist[k]) * Math.min(1, dt * 10);
        if (target <= 0.12 && E.twist[k] > 0) { E.twist[k] = Math.max(0, E.twist[k] - dt * 2); if (E.twist[k] === 0) cb.hint && cb.hint('pair'); }
      }
      if (E.phase === 'untwist' && E.twist.every(t => t < 0.02)) { E.phase = 'done'; E.twist = [0, 0, 0, 0]; AU.click(); cb.event('untwisted', {}); }
    },
    nearestPair(w) {
      const L = E.stripLen; let best = -1, bd = 2.2;
      if (w[0] < -1 || w[0] > L + 2) return -1;
      for (let k = 0; k < 4; k++) { const d = Math.abs(w[1] - pairY(k, clamp(w[0], 0, L), L, this.spread)); if (d < bd) { bd = d; best = k; } }
      return best;
    },
    down(w) { const k = this.nearestPair(w); if (k >= 0) { drag = { kind: 'pair', k }; this.mark(k, w); } },
    move(w) {
      if (!drag) { this.active = this.nearestPair(w); return; }
      this.mark(drag.k, w);
    },
    mark(k, w) {
      const L = E.stripLen; const bin = Math.floor(clamp(w[0], 0, L - 0.01) / L * 16);
      if (!E.swept[k].has(bin)) { E.swept[k].add(bin); if (E.swept[k].size % 3 === 0) AU.ratchet(); if (E.swept[k].size === 14) cb.hint && cb.hint('pair'); }
    },
    up() { drag = null; },
    draw() {
      const L = E.stripLen;
      jacketStraight(-200, 0, 0, true);
      if (E.splineStub > 0) drawSpline(0, E.splineStub);
      drawPairs(0, L, this.spread, E.twist, drag ? drag.k : this.active);
    },
  };

  /* --------- SAHNE: renk sıralama --------- */
  function slotPos(k) { return { x: E.slotX, y: (k - 3.5) * 1.65 }; }
  function makeRopes(fromStraight) {
    const L = E.cutLen || E.stripLen; E.ropes = [];
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 2; j++) {
        const id = E.pairWires[k][j], sg = j === 0 ? 1 : -1, pts = [];
        const anchorY = E.pairAnchor[k] + sg * 0.53;
        for (let i = 0; i < 16; i++) {
          const x = L * i / 15;
          let y;
          if (fromStraight && E.wireSlot[id] >= 0) { const yy = (E.wireSlot[id] - 3.5) * 1.02; y = x < 4 ? lerp(anchorY, yy, smooth(x / 4)) : yy; }
          else y = pairY(k, x, L, 1) + sg * 0.6 * smooth(x / L * 2);
          pts.push([x, y]);
        }
        const r = new Rope(pts, 2); r.id = id; r.anchorY = anchorY; E.ropes[id] = r;
      }
    }
  }
  const sSort = {
    enter() {
      E.phase = 'sort'; const L = E.cutLen || E.stripLen;
      E.slotX = Math.max(L * 0.55, Math.sqrt(Math.max(1, L * L - 85)) - 1.2);
      if (!E.ropes.length) makeRopes(false);
      else if (E.straight) {
        makeRopes(true); E.straight = false;
        for (const r of E.ropes) { const k = E.wireSlot[r.id]; if (k >= 0) { r.tip = slotPos(k); r.awake = 1.5; } }
      }
      this.flash = 0;
      fitCam(-6, -12.5, Math.max(L, E.slotX + 4) + 5, 12.5);
    },
    update(dt) {
      for (const r of E.ropes) if (r.awake > 0) { r.step(14); r.awake -= dt; }
      if (this.flash > 0) this.flash -= dt;
    },
    pick(w) {
      let best = -1, bd = 2.6;
      for (const r of E.ropes) { const e = r.end; const d = hyp(w[0] - e.x, w[1] - e.y); if (d < bd) { bd = d; best = r.id; } }
      if (best < 0) {
        // telin herhangi bir yerinden tutma (uca yakın yarı)
        for (const r of E.ropes) for (let i = 8; i < r.n; i++) { const d = hyp(w[0] - r.p[i].x, w[1] - r.p[i].y); if (d < Math.min(bd, 0.9)) { bd = d; best = r.id; } }
      }
      return best;
    },
    down(w) {
      const id = this.pick(w); if (id < 0) return;
      const r = E.ropes[id]; drag = { kind: 'wire', id };
      if (E.wireSlot[id] >= 0) { E.slot[E.wireSlot[id]] = -1; drag.from = E.wireSlot[id]; E.wireSlot[id] = -1; }
      r.tip = clampReach({ x: 0, y: r.anchorY }, { x: w[0], y: w[1] }, r.length); r.awake = 9; AU.click();
      cb.event('sortChanged', {});
    },
    move(w) {
      if (!drag) return;
      const r = E.ropes[drag.id]; r.tip = clampReach({ x: 0, y: r.anchorY }, { x: w[0], y: w[1] }, r.length); r.awake = 9;
    },
    up(w) {
      if (!drag) return;
      const r = E.ropes[drag.id], id = drag.id;
      let best = -1, bd = 1.5;
      for (let k = 0; k < 8; k++) { const s = slotPos(k); const d = hyp(r.tip.x - s.x, r.tip.y - s.y); if (d < bd) { bd = d; best = k; } }
      if (best >= 0) {
        const other = E.slot[best];
        if (other >= 0 && other !== id) {
          const ro = E.ropes[other];
          if (drag.from != null && drag.from >= 0) { E.slot[drag.from] = other; E.wireSlot[other] = drag.from; ro.tip = slotPos(drag.from); }
          else { E.wireSlot[other] = -1; ro.tip = null; const s = slotPos(best); ro.p[ro.n - 1].x = s.x - 3; ro.p[ro.n - 1].y = s.y + (s.y > 0 ? 2.5 : -2.5); }
          ro.awake = 1.2;
        }
        E.slot[best] = id; E.wireSlot[id] = best; r.tip = slotPos(best); AU.snap();
      } else { r.tip = null; }
      r.awake = 1.2; drag = null;
      cb.event('sortChanged', { filled: E.slot.filter(v => v >= 0).length });
    },
    flashWrong(list) { this.wrong = list; this.flash = 2.5; },
    draw() {
      const L = E.cutLen || E.stripLen;
      jacketStraight(-200, 0, 0, true);
      if (E.splineStub > 0) drawSpline(0, Math.min(E.splineStub, 1.5));
      // yuvalar
      for (let k = 0; k < 8; k++) {
        const s = slotPos(k);
        const wrong = this.flash > 0 && this.wrong && this.wrong.includes(k);
        ctx.fillStyle = wrong ? 'rgba(220,70,50,0.55)' : E.slot[k] >= 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.68, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.08; ctx.stroke();
      }
      const order = E.ropes.slice().sort((a, b) => (drag && a.id === drag.id ? 1 : 0) - (drag && b.id === drag.id ? 1 : 0) || (E.wireSlot[a.id] >= 0) - (E.wireSlot[b.id] >= 0));
      for (const r of order) { wireTube(r.p, r.id, drag && drag.id === r.id ? 6 : 2); if (E.cutLen) copperTip(r.end.x, r.end.y); }
      screenTf();
      ctx.font = '700 ' + Math.max(14, 0.95 * cam.ppm) + 'px ' + MONO; ctx.fillStyle = 'rgba(235,250,240,0.85)'; ctx.textBaseline = 'middle';
      for (let k = 0; k < 8; k++) { const s = slotPos(k); const [sx, sy] = w2s(s.x + 1.4, s.y); ctx.fillText(String(k + 1), sx, sy); }
      if (opts.labels || drag) {
        for (const r of E.ropes) {
          if (!opts.labels && (!drag || drag.id !== r.id)) continue;
          const e = r.end; const [sx, sy] = w2s(e.x + (E.wireSlot[r.id] >= 0 ? 2.7 : 0.9), e.y);
          ctx.font = '600 16px ' + FONT;
          const txt = D.COLORS[r.id].ad, tw = ctx.measureText(txt).width;
          ctx.fillStyle = 'rgba(12,20,26,0.82)'; roundRect(sx + 6, sy - 12, tw + 14, 24, 12); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillText(txt, sx + 13, sy + 1);
        }
      }
      worldTf();
    },
  };

  /* --------- SAHNE: düzleştirme, ara parça, kesme --------- */
  const sCut = {
    enter() {
      E.phase = 'straighten'; this.t = 0; const L = E.cutLen || E.stripLen;
      this.from = E.ropes.map(r => r.p.map(q => ({ x: q.x, y: q.y })));
      this.to = E.ropes.map(r => {
        const yy = (E.wireSlot[r.id] - 3.5) * 1.02, out = [];
        for (let i = 0; i < r.n; i++) { const x = L * i / (r.n - 1); out.push({ x, y: x < 4.5 ? lerp(r.anchorY, yy, smooth(x / 4.5)) : yy }); }
        return out;
      });
      E.blade = { x: clamp(13, 6, L - 1) + (E.cutLen ? 0 : 6) };
      if (E.cutLen) E.blade.x = Math.max(4, E.cutLen - 1);
      if (E.cfg.loadBar && !E.lb) E.lb = { x: L + 9, y: -9, on: false, pos: L + 9 };
      fitCam(-8, -12, L + 22, 13);
    },
    update(dt) {
      if (E.phase === 'straighten') {
        this.t = Math.min(1, this.t + dt * (opts.reduced ? 10 : 1.6)); const k = smooth(this.t);
        E.ropes.forEach((r, i) => r.p.forEach((q, j) => { q.x = q.ox = lerp(this.from[i][j].x, this.to[i][j].x, k); q.y = q.oy = lerp(this.from[i][j].y, this.to[i][j].y, k); }));
        if (this.t >= 1) { E.phase = (E.cfg.loadBar && !(E.lb && E.lb.on)) ? 'loadbar' : 'cut'; E.straight = true; cb.event('straightened', {}); }
      }
    },
    down(w) {
      const L = E.cutLen || E.stripLen;
      if (E.phase === 'loadbar' && E.lb) {
        if (hyp(w[0] - E.lb.x, w[1] - E.lb.y) < 6) { drag = { kind: 'lb', ox: E.lb.x - w[0], oy: E.lb.y - w[1] }; AU.click(); }
        return;
      }
      if (E.phase === 'cut' && Math.abs(w[0] - E.blade.x) < 3 && Math.abs(w[1]) < 12) { drag = { kind: 'blade', ox: E.blade.x - w[0] }; AU.click(); }
      void L;
    },
    move(w) {
      if (!drag) return; const L = E.cutLen || E.stripLen;
      if (drag.kind === 'blade') E.blade.x = clamp(w[0] + drag.ox, 3, L - 0.5);
      if (drag.kind === 'lb') {
        const lb = E.lb; const nx = w[0] + drag.ox, ny = w[1] + drag.oy;
        if (!lb.on) { lb.x = nx; lb.y = ny; if (Math.abs(ny) < 3 && Math.abs(nx - L) < 4) { lb.on = true; lb.y = 0; AU.snap(); } }
        else { lb.x = clamp(nx, 3.5, L - 1); lb.y = 0; }
      }
    },
    up() {
      if (drag && drag.kind === 'lb' && E.lb.on && E.lb.x < 8) { E.phase = 'cut'; bubble(E.lb.x, -8, 'Ara parça yerinde', 'ok'); cb.event('loadbar', {}); E.blade.x = Math.max(E.blade.x, E.lb.x + 2.5); }
      drag = null;
    },
    doCut() {
      if (E.phase !== 'cut') return false;
      const L = E.cutLen || E.stripLen, x = E.blade.x;
      if (E.lb && E.lb.on && x < E.lb.x + 2) { bubble(x, -8, 'Ara parçanın önünden kes', 'warn'); return false; }
      const pieces = [];
      E.ropes.forEach(r => {
        const yy = (E.wireSlot[r.id] - 3.5) * 1.02;
        pieces.push({ id: r.id, x: (x + L) / 2, y: yy, l: L - x, vx: 6 + Math.random() * 8, vy: (Math.random() - 0.5) * 10, r: (Math.random() - 0.5) * 3 });
        r.p.forEach((q, j) => { const xx = x * j / (r.n - 1); q.x = q.ox = xx; q.y = q.oy = xx < 4.5 ? lerp(r.anchorY, yy, smooth(xx / 4.5)) : yy; });
        r.seg = x / (r.n - 1);
      });
      if (L - x > 0.3) addPiece({ pieces, life: 1.2 });
      E.cutLen = Math.round(x * 2) / 2; AU.cut();
      cb.event('cut', { len: E.cutLen });
      return true;
    },
    draw() {
      const L = E.cutLen || E.stripLen;
      ruler(0, 8.5, Math.min(60, Math.ceil(L / 10) * 10), 1, 'cm — kılıf ucundan');
      jacketStraight(-200, 0, 0, true);
      for (const r of E.ropes) { wireTube(r.p, r.id, 2); if (E.cutLen) copperTip(r.end.x, r.end.y); }
      if (E.lb) drawLoadBar(E.lb.x, E.lb.y);
      if (E.phase === 'cut') drawBlade(E.blade.x);
      if (E.phase === 'cut') {
        screenTf(); const [sx, sy] = w2s(E.blade.x, -9.5);
        const v = E.blade.x; const kind = v > 14.5 || v < 10 ? 'warn' : 'light';
        pill(sx, sy, 'Kesim: ' + v.toFixed(1) + ' mm', { kind, size: 24 });
        worldTf();
      }
    },
  };
  function drawLoadBar(x, y) {
    ctx.save(); ctx.translate(x, y);
    shadowOn(8, 1, 3, 0.3);
    ctx.fillStyle = 'rgba(225,235,240,0.45)'; roundRect(-2, -5, 4, 10, 0.8); ctx.fill(); shadowOff();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.15; ctx.stroke();
    ctx.fillStyle = 'rgba(80,100,110,0.35)'; for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.arc(0, (k - 3.5) * 1.02, 0.42, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function drawBlade(x) {
    ctx.save(); ctx.translate(x, 0);
    // pense bıçak ağzı (üst ve alt)
    for (const s of [-1, 1]) {
      shadowOn(10, 2, 4, 0.4);
      const g = ctx.createLinearGradient(-4, 0, 4, 0);
      g.addColorStop(0, '#5f686d'); g.addColorStop(0.5, '#cfd6da'); g.addColorStop(1, '#6e787d');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-3.5, s * 6.2); ctx.lineTo(0, s * 5.0); ctx.lineTo(3.5, s * 6.2); ctx.lineTo(3.5, s * 13); ctx.lineTo(-3.5, s * 13); ctx.closePath(); ctx.fill();
      shadowOff();
    }
    ctx.setLineDash([0.6, 0.5]); ctx.strokeStyle = 'rgba(255,235,140,0.95)'; ctx.lineWidth = 0.14;
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  /* --------- SAHNE: konnektör takma --------- */
  const sInsert = {
    enter() {
      E.phase = 'insert';
      if (!E.conn) { E.conn = { x: E.cutLen + 30, y: -15, flipped: Math.random() < 0.5, snapped: false, fx: E.cutLen + 30, clicked: false }; }
      else { E.conn.snapped = false; E.conn.x = E.cutLen + 30; E.conn.y = -15; }
      fitCam(-28, -22, E.cutLen + 46, 18);
    },
    minFront() { return Math.max(E.cutLen + 1, PL - 9.5); },
    down(w) {
      const c = E.conn;
      const fx = c.snapped ? c.fx : c.x, fy = c.snapped ? 0 : c.y;
      if (w[0] < fx + 2 && w[0] > fx - PL - 2 && Math.abs(w[1] - fy) < PW / 2 + 2) {
        drag = { kind: 'conn', ox: fx - w[0], oy: fy - w[1], t0: performance.now() }; AU.click();
      }
    },
    move(w) {
      if (!drag) return; const c = E.conn;
      const nx = w[0] + drag.ox, ny = w[1] + drag.oy;
      if (!c.snapped) {
        c.x = nx; c.y = ny;
        if (Math.abs(ny) < 3.2 && nx > E.cutLen - 1 && nx < E.cutLen + 26) { c.snapped = true; c.fx = Math.max(nx, E.cutLen + 3); AU.click(); }
      } else {
        if (Math.abs(ny) > 7 && c.fx > E.cutLen + 6) { c.snapped = false; c.x = nx; c.y = ny; return; }
        const mf = this.minFront(); const before = c.fx;
        c.fx = Math.max(mf, nx);
        if (c.fx <= mf + 0.01 && before > mf + 0.01) { AU.snap(); c.clicked = true; bubble(c.fx - 6, -9, E.cutLen + 1 >= PL - 9.5 ? 'Teller ön duvara dayandı' : 'Kılıf daha fazla girmiyor', 'info'); }
      }
      cb.event('connMoved', {});
    },
    up() { if (!drag) return; drag = null; cb.event('connMoved', {}); },
    flip() { E.conn.flipped = !E.conn.flipped; AU.click(); cb.event('connMoved', {}); },
    dbl(w) { const c = E.conn; if (!c.snapped && hyp(w[0] - (c.x - PL / 2), w[1] - c.y) < 12) this.flip(); },
    draw() {
      jacketStraight(-200, 0, 0, true);
      for (const r of E.ropes) { wireTube(r.p, r.id, 2); copperTip(r.end.x, r.end.y); }
      if (E.lb) drawLoadBar(E.lb.x, E.lb.y);
      const c = E.conn;
      if (c.snapped) plugTop(c.fx, 0, c.flipped, 0); else plugTop(c.x, c.y, c.flipped, 0);
      if (!c.snapped) {
        screenTf(); const [sx, sy] = w2s(c.x - PL / 2, c.y - 9.5);
        pill(sx, sy, c.flipped ? 'Klips üstte görünüyor' : 'Altın pinler üstte', { kind: 'light', size: 20 });
        worldTf();
      }
    },
  };
  function connState() {
    const c = E.conn; if (!c || !c.snapped) return { snapped: false, gap: 99, jacketIn: -99 };
    return { snapped: true, gap: (c.fx - 1) - E.cutLen, jacketIn: PL - c.fx, flipped: c.flipped };
  }

  /* --------- SAHNE: görsel kontrol --------- */
  const sInspect = {
    enter() { E.phase = 'inspect'; const c = E.conn; fitCam(c.fx - 34, -9, c.fx + 22, 21); },
    down() {}, move() {}, up() {},
    draw() {
      const c = E.conn;
      jacketStraight(-200, 0, 0, true);
      for (const r of E.ropes) { wireTube(r.p, r.id, 2); copperTip(r.end.x, r.end.y); }
      if (E.lb) drawLoadBar(E.lb.x, E.lb.y);
      plugTop(c.fx, 0, c.flipped, 0);
      sideInset(W - 640, H - 360, 620, 340, { fx: c.fx, cutLen: E.cutLen, press: 0, labels: opts.practice });
    },
  };

  /* --------- SAHNE: pense ile çakma --------- */
  const TH_OPEN = 0.24, DIES = [{ n: '4P', x: 18, w: 7.9 }, { n: '6P', x: 33, w: 9.8 }, { n: '8P', x: 50, w: 11.9 }];
  const sCrimp = {
    enter() {
      E.phase = 'crimp'; this.th = TH_OPEN; this.plug = { x: -30, y: 58, inDie: null }; this.maxP = E.crimp || 0; this.lastClick = 0; this.hold = false;
      fitCam(-58, -78, 222, 98);
    },
    rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; },
    lowerLocal(w) { return this.rot(w[0], w[1], -this.th); },
    down(w) {
      const pl = this.plug;
      if (!pl.inDie && hyp(w[0] - pl.x, w[1] - pl.y) < 11) { drag = { kind: 'plug', ox: pl.x - w[0], oy: pl.y - w[1] }; AU.click(); return; }
      const [lx, ly] = this.lowerLocal(w);
      if (lx > 85 && lx < 225 && ly > 0 && ly < 34) { drag = { kind: 'handle' }; this.hold = true; AU.ensure(); }
    },
    move(w) {
      if (!drag) return;
      if (drag.kind === 'plug') { this.plug.x = w[0] + drag.ox; this.plug.y = w[1] + drag.oy; return; }
      const ang = Math.atan2(w[1], w[0]) - Math.atan2(16, 150);
      const prev = this.th; this.th = clamp(ang, 0, TH_OPEN);
      this.afterTh(prev);
    },
    afterTh(prev) {
      if (!this.plug.inDie) return;
      const p = 1 - this.th / TH_OPEN;
      if (Math.floor(p * 14) > Math.floor((1 - prev / TH_OPEN) * 14)) AU.ratchet();
      if (p > this.maxP) { this.maxP = p; E.crimp = p; }
      if (p >= 0.995 && !E.crimpFull) { E.crimpFull = true; AU.crimp(); bubble(50, -30, 'Çıt! Pense tam kapandı', 'ok'); cb.event('crimped', { full: true }); }
      cb.event('crimpProgress', { p: this.maxP });
    },
    up() {
      if (drag && drag.kind === 'plug') {
        const pl = this.plug; let hit = null;
        // plug merkezi kalıp ağzına yakın mı (açık durumda alt çene üzerinde)
        const [lx, ly] = this.lowerLocal([pl.x, pl.y]);
        for (const d of DIES) { if (Math.abs(lx - d.x) < d.w / 2 + 3.5 && ly > -14 && ly < 16) hit = d; }
        if (hit && this.th < TH_OPEN * 0.8) { bubble(pl.x, pl.y - 12, 'Önce penseyi aç', 'warn'); }
        else if (hit && hit.n === '8P') { pl.inDie = hit; AU.snap(); cb.event('plugInDie', { die: '8P' }); }
        else if (hit) { AU.err(); bubble(pl.x, pl.y - 12, hit.n + ' yuvası RJ-45 için dar — 8P yuvasını kullan', 'err'); cb.event('wrongDie', { die: hit.n }); pl.x = -30; pl.y = 58; }
      }
      if (drag && drag.kind === 'handle') this.hold = false;
      drag = null;
    },
    key(down) { if (!this.plug.inDie) return; this.hold = down; if (down) AU.ensure(); },
    update(dt) {
      if (!drag || drag.kind !== 'handle') {
        if (this.hold) { const prev = this.th; this.th = Math.max(0, this.th - dt * 0.18); this.afterTh(prev); }
        else this.th = Math.min(TH_OPEN, this.th + dt * 0.35);
      }
    },
    release() { this.plug.inDie = null; this.plug.x = -30; this.plug.y = 58; },
    draw() {
      const th = this.th;
      drawCrimper(th);
      const pl = this.plug; let px = pl.x, py = pl.y, ang = 0;
      if (pl.inDie) { const r = this.rot(pl.inDie.x, 2.85, th); px = r[0]; py = r[1]; ang = th; }
      // kablo (izleyiciye doğru gelen)
      const pts = [{ x: px, y: py + 3 }, { x: px - 4, y: py + 25 }, { x: px - 20, y: py + 60 }, { x: px - 35, y: 140 }];
      tube(pts, JD, JACKET.base, JACKET.dark, JACKET.light, null, 10);
      const press = smooth((Math.max(this.maxP, E.crimp) - 0.72) / 0.28);
      plugFace(px, py, ang, press);
      // zoom inset
      if (pl.inDie) crimpInset(W - 560, 24, 536, 360, press, th);
      if (!pl.inDie) { screenTf(); const [sx, sy] = w2s(pl.x, pl.y - 12); pill(sx, sy, 'Konnektörü 8P yuvasına sürükle', { kind: 'light', size: 22 }); worldTf(); }
      else {
        screenTf(); const [sx, sy] = w2s(160, 66);
        pill(sx, sy, E.crimpFull ? 'Tam çakıldı' : 'Alt sapı yukarı doğru sık: %' + Math.round(this.maxP * 100), { kind: E.crimpFull ? 'ok' : 'light', size: 22 });
        worldTf();
      }
    },
  };
  function drawCrimper(th) {
    const metal = (y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#9ea7ac'); g.addColorStop(0.3, '#e2e7ea'); g.addColorStop(0.55, '#868f94'); g.addColorStop(1, '#4b5357'); return g; };
    const grip = (y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#2b2f33'); g.addColorStop(0.35, '#4a5258'); g.addColorStop(1, '#16191b'); return g; };
    // ALT ÇENE + ALT SAP (döner)
    ctx.save(); ctx.rotate(th);
    shadowOn(22, 5, 12, 0.5);
    ctx.fillStyle = metal(1, 16);
    ctx.beginPath(); ctx.moveTo(-4, 1); ctx.lineTo(70, 1); ctx.lineTo(88, 4); ctx.lineTo(100, 9); ctx.lineTo(100, 20); ctx.lineTo(70, 16); ctx.lineTo(4, 14); ctx.quadraticCurveTo(-8, 12, -4, 1); ctx.closePath(); ctx.fill();
    shadowOff();
    // kalıp yuvaları (alt çenede)
    for (const d of DIES) {
      ctx.fillStyle = '#2b3135'; ctx.fillRect(d.x - d.w / 2, 1, d.w, 8.3);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(d.x - d.w / 2, 8.3, d.w, 0.8);
    }
    ctx.fillStyle = '#20262a'; ctx.font = '700 4px ' + FONT; ctx.textAlign = 'center';
    for (const d of DIES) ctx.fillText(d.n, d.x, 13.6);
    ctx.textAlign = 'left';
    // alt sap
    shadowOn(18, 4, 10, 0.5);
    ctx.fillStyle = grip(20, 40);
    ctx.beginPath(); ctx.moveTo(96, 10); ctx.lineTo(210, 9); ctx.quadraticCurveTo(222, 14, 210, 23); ctx.lineTo(96, 24); ctx.closePath(); ctx.fill();
    shadowOff();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let x = 115; x < 205; x += 7) { ctx.moveTo(x, 12); ctx.lineTo(x - 2, 22); } ctx.stroke();
    ctx.fillStyle = '#b8352a'; ctx.beginPath(); ctx.moveTo(196, 9.2); ctx.lineTo(210, 9); ctx.quadraticCurveTo(222, 14, 210, 23); ctx.lineTo(196, 23.2); ctx.closePath(); ctx.fill();
    ctx.restore();
    // ÜST ÇENE + ÜST SAP (sabit)
    shadowOn(22, 5, 12, 0.5);
    ctx.fillStyle = metal(-18, -1);
    ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(70, -1); ctx.lineTo(88, -4); ctx.lineTo(100, -9); ctx.lineTo(100, -22); ctx.lineTo(70, -19); ctx.lineTo(4, -15); ctx.quadraticCurveTo(-8, -12, -4, -1); ctx.closePath(); ctx.fill();
    shadowOff();
    // bıçak ve soyma ağzı (dekor)
    ctx.fillStyle = '#c9d0d4'; ctx.fillRect(74, -8, 10, 2); ctx.fillStyle = '#5b6468'; ctx.fillRect(74, -6, 10, 0.6);
    // itici dişler (her yuva için)
    for (const d of DIES) {
      const n = parseInt(d.n, 10);
      ctx.fillStyle = '#6c757a';
      for (let k = 0; k < n; k++) ctx.fillRect(d.x + (k - (n - 1) / 2) * 1.02 - 0.3, -1, 0.6, 0.7);
    }
    shadowOn(18, 4, 10, 0.5);
    ctx.fillStyle = grip(-42, -20);
    ctx.beginPath(); ctx.moveTo(96, -10); ctx.lineTo(210, -9); ctx.quadraticCurveTo(222, -14, 210, -23); ctx.lineTo(96, -24); ctx.closePath(); ctx.fill();
    shadowOff();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let x = 115; x < 205; x += 7) { ctx.moveTo(x, -12); ctx.lineTo(x - 2, -22); } ctx.stroke();
    ctx.fillStyle = '#b8352a'; ctx.beginPath(); ctx.moveTo(196, -9.2); ctx.lineTo(210, -9); ctx.quadraticCurveTo(222, -14, 210, -23); ctx.lineTo(196, -23.2); ctx.closePath(); ctx.fill();
    // yay
    ctx.strokeStyle = '#c8cdd0'; ctx.lineWidth = 0.9; ctx.beginPath();
    const yTop = -12, yBot = Math.sin(th) * 112 + 12;
    for (let i = 0; i <= 14; i++) { const y = lerp(yTop, yBot, i / 14); ctx.lineTo(112 + (i % 2 ? 3 : -3), y); }
    ctx.stroke();
    // mandal yayı (ratchet) dişleri
    ctx.fillStyle = '#7d868b';
    ctx.beginPath(); ctx.arc(0, 0, 6.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d5dbde'; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b6468'; ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, Math.PI * 2); ctx.fill();
  }
  function plugFace(cx, cy, ang, press) {
    // konnektörün ön yüzü (izleyiciye bakar)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang || 0);
    shadowOn(10, 2, 5, 0.4);
    ctx.fillStyle = 'rgba(205,220,228,0.55)'; roundRect(-PW / 2, -4.15, PW, 8.3, 0.8); ctx.fill(); shadowOff();
    ctx.strokeStyle = 'rgba(240,248,252,0.9)'; ctx.lineWidth = 0.22; ctx.stroke();
    // arkadaki kılıf gölgesi
    ctx.fillStyle = 'rgba(40,90,150,0.35)'; ctx.beginPath(); ctx.arc(0, 0.6, JD / 2, 0, Math.PI * 2); ctx.fill();
    // tel kesitleri
    for (let k = 0; k < 8; k++) {
      const id = E.ropes.length ? (E.slot[E.conn && E.conn.flipped ? 7 - k : k]) : k;
      const c = D.COLORS[id >= 0 ? id : 0];
      ctx.fillStyle = c.stripe || c.base; ctx.beginPath(); ctx.arc((k - 3.5) * 1.02, -1.6, 0.46, 0, Math.PI * 2); ctx.fill();
      if (c.stripe) { ctx.fillStyle = c.base; ctx.beginPath(); ctx.arc((k - 3.5) * 1.02, -1.6, 0.46, 0.4, 2.2); ctx.fill(); }
      ctx.fillStyle = '#c47f39'; ctx.beginPath(); ctx.arc((k - 3.5) * 1.02, -1.6, 0.2, 0, Math.PI * 2); ctx.fill();
    }
    // kontak tepeleri
    for (let k = 0; k < 8; k++) {
      const up = (1 - press) * 0.6;
      ctx.fillStyle = '#d9aa3e'; ctx.fillRect((k - 3.5) * 1.02 - 0.3, -4.15 - up, 0.6, 1.2 + up * 0.2);
    }
    // klips
    ctx.fillStyle = 'rgba(200,214,222,0.7)'; ctx.fillRect(-3, 4.15, 6, 1.4);
    ctx.restore();
  }
  function crimpInset(sx, sy, sw, sh, press, th) {
    screenTf(); ctx.save();
    shadowOn(18, 0, 6, 0.5); ctx.fillStyle = 'rgba(244,247,248,0.97)'; roundRect(sx, sy, sw, sh, 14); ctx.fill(); shadowOff();
    ctx.beginPath(); roundRect(sx, sy, sw, sh, 14); ctx.clip();
    ctx.fillStyle = '#13212b'; ctx.font = '600 24px ' + FONT; ctx.textBaseline = 'top'; ctx.fillText('Yakın görünüş: pinler tellere iniyor', sx + 16, sy + 12);
    const k = Math.min((sw - 40) / 12.5, (sh - 120) / 10.5), ox = sx + sw / 2, oy = sy + 62 + 6.6 * k;
    const X = u => ox + u * k, Y = v => oy + v * k;
    // itici
    const gap = Math.sin(th) * 50 * 0.12;
    ctx.fillStyle = '#7b8489'; ctx.fillRect(X(-6), Y(-6.2 - gap - (1 - press) * 0.4), 12 * k, 1.4 * k);
    // konnektör
    ctx.fillStyle = 'rgba(190,210,220,0.45)'; ctx.fillRect(X(-5.85), Y(-4.15), 11.7 * k, 8.3 * k);
    ctx.strokeStyle = 'rgba(80,100,112,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(X(-5.85), Y(-4.15), 11.7 * k, 8.3 * k);
    for (let i = 0; i < 8; i++) {
      const u = (i - 3.5) * 1.02;
      const id = E.slot[E.conn && E.conn.flipped ? 7 - i : i]; const c = D.COLORS[id >= 0 ? id : 0];
      ctx.fillStyle = c.stripe || c.base; ctx.beginPath(); ctx.arc(X(u), Y(-1.6), 0.46 * k, 0, Math.PI * 2); ctx.fill();
      if (c.stripe) { ctx.fillStyle = c.base; ctx.beginPath(); ctx.arc(X(u), Y(-1.6), 0.46 * k, 0.4, 2.2); ctx.fill(); }
      ctx.fillStyle = '#c47f39'; ctx.beginPath(); ctx.arc(X(u), Y(-1.6), 0.2 * k, 0, Math.PI * 2); ctx.fill();
      // kontak bıçağı
      const top = -4.75 + press * 0.6, bot = top + 2.1 + press * 0.85;
      ctx.fillStyle = '#d9aa3e'; ctx.beginPath(); ctx.moveTo(X(u - 0.28), Y(top)); ctx.lineTo(X(u + 0.28), Y(top)); ctx.lineTo(X(u + 0.28), Y(bot - 0.4)); ctx.lineTo(X(u), Y(bot)); ctx.lineTo(X(u - 0.28), Y(bot - 0.4)); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#13212b'; ctx.font = '500 22px ' + FONT; ctx.textBaseline = 'alphabetic';
    ctx.fillText(press >= 0.99 ? 'Pinler yalıtımı delip bakıra oturdu.' : press > 0 ? 'Pinler iniyor… sıkmaya devam et.' : 'Pinler henüz tellere değmedi.', sx + 16, sy + sh - 18);
    ctx.restore(); worldTf();
  }

  /* --------- SAHNE: test cihazı --------- */
  const UNITS = {
    main: { x: -175, y: -105, w: 150, h: 96, label: 'ANA ÜNİTE' },
    remote: { x: 180, y: -105, w: 122, h: 82, label: 'UZAK ÜNİTE' },
  };
  function portPos(u, kind) { const U = UNITS[u]; return { x: U.x + (kind === 'rj45' ? -16 : 26), y: U.y + U.h / 2 }; }
  const sTest = {
    enter(data) {
      E = E || {};
      this.map = data.map; this.diag = !!data.diag; this.power = 0; this.t = 0; this.step = -1; this.cycles = 0;
      const N = 40, L = 640, pts = [];
      for (let i = 0; i < N; i++) { const a = i / (N - 1); const ang = Math.PI * a; pts.push([-125 * Math.cos(ang) , 150 + Math.sin(ang) * 95]); }
      this.rope = new Rope(pts, 0); this.rope.minX = null; this.rope.damp = 0.86; this.rope.bend = 0.18;
      this.rope.seg = L / (N - 1);
      this.conns = [
        { x: -125, y: 122, dir: [0, -1], plug: null, end: 0 },
        { x: 125, y: 122, dir: [0, -1], plug: null, end: 1 },
      ];
      fitCam(-330, -180, 330, 232);
    },
    connAt(w) { for (const c of this.conns) { const cx = c.x - c.dir[0] * PL / 2, cy = c.y - c.dir[1] * PL / 2; if (hyp(w[0] - cx, w[1] - cy) < 26) return c; } return null; },
    down(w) {
      const c = this.connAt(w);
      if (c) { if (c.plug) { c.plug = null; AU.click(); cb.event('unplug', { end: c.end }); } drag = { kind: 'conn', c, ox: c.x - w[0], oy: c.y - w[1] }; return; }
      const U = UNITS.main, sw = { x: U.x + 40, y: U.y - U.h / 2 + 16 };
      if (Math.abs(w[0] - sw.x) < 20 && Math.abs(w[1] - sw.y) < 12) { this.power = (this.power + 1) % 3; this.step = -1; this.t = 0; this.cycles = 0; AU.click(); cb.event('power', { p: this.power }); }
    },
    move(w) {
      if (!drag) return; const c = drag.c;
      const nx = w[0] + drag.ox, ny = w[1] + drag.oy;
      // yön: kablodan uzağa
      const rp = this.rope.p, ri = c.end === 0 ? 1 : rp.length - 2; const q = rp[ri];
      let dx = nx - q.x, dy = ny - q.y; const d = hyp(dx, dy) || 1; dx /= d; dy /= d;
      c.dir = [lerp(c.dir[0], dx, 0.3), lerp(c.dir[1], dy, 0.3)]; const dl = hyp(c.dir[0], c.dir[1]) || 1; c.dir = [c.dir[0] / dl, c.dir[1] / dl];
      c.x = nx; c.y = ny;
    },
    up() {
      if (!drag) return; const c = drag.c; drag = null;
      for (const u of ['main', 'remote']) {
        for (const k of ['rj45', 'rj11']) {
          const p = portPos(u, k);
          if (hyp(c.x - p.x, c.y - (p.y + 6)) < 24) {
            if (k === 'rj11') { AU.err(); bubble(p.x, p.y + 30, 'Bu RJ-11 (telefon) girişi — RJ-45 buraya girmez', 'err'); cb.event('wrongPort', { unit: u }); c.y += 30; return; }
            if (this.conns.some(o => o !== c && o.plug === u)) { bubble(p.x, p.y + 30, 'Bu giriş dolu', 'warn'); return; }
            c.plug = u; c.x = p.x; c.y = p.y - 4; c.dir = [0, -1]; AU.snap(); cb.event('plug', { end: c.end, unit: u });
            return;
          }
        }
      }
    },
    update(dt) {
      const r = this.rope; const n = r.n;
      const a = this.conns[0], b = this.conns[1];
      r.head = { x: a.x - a.dir[0] * (PL + 3), y: a.y - a.dir[1] * (PL + 3) };
      r.tip = { x: b.x - b.dir[0] * (PL + 3), y: b.y - b.dir[1] * (PL + 3) };
      // uçlar fazla uzaklaşırsa
      const dd = hyp(r.head.x - r.tip.x, r.head.y - r.tip.y), maxL = r.length * 0.97;
      if (dd > maxL) {
        const mover = drag ? drag.c : b, other = mover === a ? b : a;
        const ox = other.x - other.dir[0] * (PL + 3), oy = other.y - other.dir[1] * (PL + 3);
        const mx = mover.x - mover.dir[0] * (PL + 3), my = mover.y - mover.dir[1] * (PL + 3);
        const k = maxL / dd; mover.x = ox + (mx - ox) * k + mover.dir[0] * (PL + 3); mover.y = oy + (my - oy) * k + mover.dir[1] * (PL + 3);
        r.head = { x: a.x - a.dir[0] * (PL + 3), y: a.y - a.dir[1] * (PL + 3) };
        r.tip = { x: b.x - b.dir[0] * (PL + 3), y: b.y - b.dir[1] * (PL + 3) };
      }
      r.step(10); void n;
      if (this.power) {
        this.t += dt; const per = this.power === 1 ? 0.55 : 1.25;
        if (this.t > per) { this.t = 0; this.step = (this.step + 1) % 9; if (this.step === 0) this.cycles++; if (this.step === 0 && this.cycles >= 2) cb.event('cycled', { cycles: this.cycles }); }
      }
    },
    lit() {
      const both = this.conns.every(c => c.plug), main = [], rem = [];
      if (!this.power || this.step < 0) return { main, rem };
      main.push(this.step);
      if (both && this.step < 8) {
        const mainEnd = this.conns.find(c => c.plug === 'main').end;
        const m = mainEnd === 0 ? this.map : invertMap(this.map);
        for (const q of m[this.step]) rem.push(q);
      }
      return { main, rem };
    },
    draw() {
      const L = this.lit();
      drawUnit('main', L.main, this.power);
      drawUnit('remote', L.rem, -1);
      const r = this.rope;
      tube(r.p, JD, JACKET.base, JACKET.dark, JACKET.light, null, 10);
      for (const c of this.conns) {
        // koruyucu kılıf (boot)
        const ang = Math.atan2(c.dir[1], c.dir[0]);
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang);
        ctx.fillStyle = 'rgba(40,90,150,0.9)'; roundRect(-PL - 4, -JD / 2 - 0.4, 6, JD + 0.8, 1.5); ctx.fill();
        ctx.restore();
        plugTop(c.x, c.y, false, 1, { rot: ang });
      }
      if (this.diag) { screenTf(); pill(W / 2, H - 40, 'Atölyede verilen kablo: K-' + (100 + (this.map.flat().length * 7) % 89), { kind: 'light', size: 22 }); worldTf(); }
    },
  };
  function invertMap(m) { const out = [[], [], [], [], [], [], [], []]; m.forEach((qs, p) => qs.forEach(q => out[q].push(p))); return out; }
  function drawUnit(u, litList, power) {
    const U = UNITS[u];
    ctx.save(); ctx.translate(U.x, U.y);
    shadowOn(24, 6, 12, 0.5);
    const g = ctx.createLinearGradient(0, -U.h / 2, 0, U.h / 2);
    g.addColorStop(0, '#3e5566'); g.addColorStop(0.1, '#58718a'); g.addColorStop(0.55, '#3d5466'); g.addColorStop(1, '#22313c');
    ctx.fillStyle = g; roundRect(-U.w / 2, -U.h / 2, U.w, U.h, 12); ctx.fill(); shadowOff();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8; ctx.stroke();
    // panel
    ctx.fillStyle = '#1a242b'; roundRect(-U.w / 2 + 8, -U.h / 2 + 30, U.w - 16, 22, 4); ctx.fill();
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', 'G'];
    const span = U.w - 30, x0 = -span / 2;
    for (let i = 0; i < 9; i++) {
      const x = x0 + i * span / 8, y = -U.h / 2 + 37;
      const on = litList.includes(i);
      if (on) { ctx.shadowColor = 'rgba(80,255,120,0.95)'; ctx.shadowBlur = 18 * DPR * cssScale; }
      const lg = ctx.createRadialGradient(x - 1, y - 1, 0.3, x, y, 3.6);
      if (on) { lg.addColorStop(0, '#eaffef'); lg.addColorStop(0.4, '#5cff86'); lg.addColorStop(1, '#16a540'); }
      else { lg.addColorStop(0, '#4a5c50'); lg.addColorStop(0.6, '#1f3226'); lg.addColorStop(1, '#0f1a13'); }
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();
      shadowOff();
      ctx.fillStyle = '#cfd9df'; ctx.font = '700 5px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(labels[i], x, y + 11);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d6e0e6'; ctx.font = '700 7px ' + FONT; ctx.fillText(U.label, -U.w / 2 + 10, -U.h / 2 + 15);
    // portlar
    for (const k of ['rj45', 'rj11']) {
      const p = portPos(u, k); const px = p.x - U.x, py = p.y - U.y;
      const pw = k === 'rj45' ? 16 : 11;
      ctx.fillStyle = '#0d1317'; roundRect(px - pw / 2, py - 11, pw, 11, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(214,170,60,0.8)'; const nn = k === 'rj45' ? 8 : 4;
      for (let i = 0; i < nn; i++) ctx.fillRect(px + (i - (nn - 1) / 2) * (pw - 4) / nn - 0.25, py - 9, 0.5, 2.6);
      ctx.fillStyle = '#9fb0ba'; ctx.font = '600 4.6px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(k === 'rj45' ? 'RJ-45' : 'RJ-11', px, py - 14);
    }
    ctx.textAlign = 'left';
    if (power >= 0) {
      // anahtar OFF / ON / S
      const sx = 40, sy = -U.h / 2 + 16;
      ctx.fillStyle = '#111a20'; roundRect(sx - 18, sy - 5, 36, 10, 5); ctx.fill();
      const pos = [-11, 0, 11][power];
      ctx.fillStyle = '#e6ecef'; roundRect(sx + pos - 5, sy - 4, 10, 8, 4); ctx.fill();
      ctx.fillStyle = '#b8c6cf'; ctx.font = '700 4px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText('OFF', sx - 11, sy - 7); ctx.fillText('ON', sx, sy - 7); ctx.fillText('S', sx + 11, sy - 7);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /* =================================================================
     DÖNGÜ ve GİRİŞ
     ================================================================= */
  const SCENES = { strip: sStrip, spline: sSpline, untwist: sUntwist, sort: sSort, cut: sCut, insert: sInsert, inspect: sInspect, crimp: sCrimp, test: sTest };
  let curName = '';
  function frame(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    const k = Math.min(1, dt * 6);
    cam.x = lerp(cam.x, cam.tx, k); cam.y = lerp(cam.y, cam.ty, k); cam.ppm = lerp(cam.ppm, cam.tppm, k);
    if (scene && scene.update) scene.update(dt);
    drawMat();
    if (scene) scene.draw();
    drawEffects(dt);
    drawBubbles();
    requestAnimationFrame(frame);
  }
  function evPos(e) { const r = cv.getBoundingClientRect(); const sx = (e.clientX - r.left) / cssScale, sy = (e.clientY - r.top) / cssScale; return s2w(sx, sy); }
  function bind() {
    cv.addEventListener('pointerdown', e => { e.preventDefault(); AU.ensure(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* yok */ } const w = evPos(e); if (scene && scene.down) scene.down(w); });
    cv.addEventListener('pointermove', e => { const w = evPos(e); hoverW = w; if (scene && scene.move) scene.move(w); cv.style.cursor = drag ? 'grabbing' : 'grab'; });
    const up = e => { const w = evPos(e); if (scene && scene.up) scene.up(w); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', e => { const w = evPos(e); if (scene && scene.dbl) scene.dbl(w); });
    window.addEventListener('keydown', e => { if (e.code === 'Space' && curName === 'crimp' && document.activeElement === cv) { e.preventDefault(); sCrimp.key(true); } });
    window.addEventListener('keyup', e => { if (e.code === 'Space' && curName === 'crimp') sCrimp.key(false); });
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentElement);
    void pointerIn; void hoverW;
  }

  return {
    init(canvas, callbacks) {
      cv = canvas; ctx = cv.getContext('2d'); cb = callbacks || {};
      makeNoise(); resize(); bind(); running = true; last = performance.now(); requestAnimationFrame(frame);
      setCam(0, 0, 10, true);
    },
    setOpts(o) { Object.assign(opts, o); },
    newEnd(idx, cfg) { E = newEnd(idx, cfg); return E; },
    useEnd(e) { E = e; },
    get end() { return E; },
    go(name, data) { curName = name; drag = null; scene = SCENES[name]; if (scene && scene.enter) scene.enter(data || {}); },
    get sceneName() { return curName; },
    flip() { if (curName === 'insert') sInsert.flip(); },
    doCut() { return sCut.doCut(); },
    flashWrong(list) { sSort.flashWrong(list); },
    crimpRelease() { sCrimp.release(); },
    connState,
    testLit() { return sTest.lit(); },
    testPlugged() { return sTest.conns ? sTest.conns.map(c => c.plug) : []; },
    testPower() { return sTest.power; },
    testConns() { return sTest.conns.map(c => ({ x: c.x, y: c.y, dir: c.dir, plug: c.plug })); },
    portPos,
    resize, AU,
    toCss(x, y) { const [sx, sy] = [(x - cam.tx) * cam.tppm + W / 2, (y - cam.ty) * cam.tppm + H / 2]; return [sx * cssScale, sy * cssScale]; },
    crimpState() { return { th: sCrimp.th, plug: sCrimp.plug }; },
    PL, setTask(t) { T = t; void T; },
  };
})();
