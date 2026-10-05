/* Focus Range — three contribution demos.
   All in slope form: x(z) = x0 + s (z - z0); the eq. 1 shear across boundary
   F(i+1) with factor Si is  s += t * Si * l / F1  (t = 1 full, t < 1 partial). */
(function(){
'use strict';

function byId(id){ return document.getElementById(id); }
var MONO = '"IBM Plex Mono", monospace';
var SERIF = '"Source Serif 4", Georgia, serif';

function readTok(){
  var cs = getComputedStyle(document.documentElement);
  function g(n){ return cs.getPropertyValue(n).trim(); }
  return {
    surface: g('--surface'), ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'),
    line: g('--line'), hairline: g('--hairline'), accent: g('--accent'),
    accentSoft: g('--accent-soft'), beam: g('--beam'), beamSoft: g('--beam-soft'),
    sthin: g('--s-thin'), srange: g('--s-range'), good: g('--good')
  };
}

/* shared scaffold: sizing, theme redraw, pointer plumbing */
function scaffold(canvasId, cssHeight, draw){
  var canvas = byId(canvasId);
  if(!canvas) return null;
  var ctx = canvas.getContext('2d');
  var S = {canvas: canvas, ctx: ctx, W: 0, H: 0, dpr: 1, draw: draw, raf: 0};
  S.schedule = function(){
    if(S.raf) return;
    S.raf = requestAnimationFrame(function(){ S.raf = 0; S.draw(S); });
  };
  function resize(){
    var w = canvas.clientWidth || 800;
    S.W = w;
    S.H = typeof cssHeight === 'function' ? cssHeight(w) : cssHeight;
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(S.W * S.dpr);
    canvas.height = Math.round(S.H * S.dpr);
    canvas.style.height = S.H + 'px';
    S.schedule();
  }
  if(window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
  else window.addEventListener('resize', resize);
  var mq = window.matchMedia('(prefers-color-scheme: light)');
  if(mq.addEventListener) mq.addEventListener('change', S.schedule);
  new MutationObserver(S.schedule).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(S.schedule);
  resize();
  S.pos = function(e){
    var r = canvas.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
  };
  return S;
}

/* =========================================================================
   DEMO 1 — shading continuity (eq. 3)
   One lens sample l; neighbouring pixels reflect off a glossy sphere that
   straddles F1. Geometry is fixed; only the shading direction changes.
   ========================================================================= */
(function(){
  var F1 = 6, LSAMP = 0.8, ZV = 9.5;    // lens sample offset, view depth
  var st = { zs: 6.9, xs: -0.1, r: 0.95, on: true, delta: 0.6, drag: false };

  var S = scaffold('d-smooth', function(w){ return w < 600 ? 280 : 315; }, draw);
  if(!S) return;

  // ray for pixel p: returns hit {z,x,seg,sInc} or null  (seg0 slope (p-l)/F1, then chief)
  function hitFor(p){
    var s0 = (p - LSAMP) / F1;
    // seg0 from (0, LSAMP)
    var h = circleHit(0, LSAMP, s0, F1);
    if(h) return {z: h.z, x: h.x, sInc: s0, seg: 0};
    var sc = p / F1;
    h = circleHit(F1, p, sc, 1e9);
    if(h) return {z: h.z, x: h.x, sInc: sc, seg: 1};
    return null;
  }
  function circleHit(z0, x0, s, zEnd){
    var dz = z0 - st.zs, dx = x0 - st.xs;
    var A = 1 + s * s, B = 2 * (dz + s * dx), C = dz * dz + dx * dx - st.r * st.r;
    var disc = B * B - 4 * A * C;
    if(disc < 0) return null;
    var u = (-B - Math.sqrt(disc)) / (2 * A);
    if(u < 1e-9) return null;
    var z = z0 + u;
    if(z > zEnd + 1e-9) return null;
    return {z: z, x: x0 + s * u};
  }
  // shading slope per eq. 3 (S0 = 1, boundary F1); raw = incident slope
  function shadeSlope(hit){
    if(hit.seg === 1) return hit.sInc;
    var dh = Math.min(st.delta, F1);
    var ts = Math.max(0, 1 - (F1 - hit.z) / dh);
    return hit.sInc + ts * LSAMP / F1;
  }
  function reflectAngle(hit, slope){
    var n = Math.hypot(1, slope);
    var dz = 1 / n, dx = slope / n;
    var nz = (hit.z - st.zs) / st.r, nx = (hit.x - st.xs) / st.r;
    var d = dz * nz + dx * nx;
    var rz = dz - 2 * d * nz, rx = dx - 2 * d * nx;
    return {a: Math.atan2(rx, rz), rz: rz, rx: rx};
  }

  var L = {};
  function layout(){
    L.plotH = 86;
    L.sceneTop = 8; L.sceneBot = S.H - L.plotH - 26;
    L.plotTop = S.H - L.plotH - 4; L.plotBot = S.H - 16;
    L.padL = 14; L.padR = 14;
    L.pxZ = (S.W - L.padL - L.padR) / ZV;
    var xspan = S.W < 600 ? 3.8 : 3.1;
    L.pxX = (L.sceneBot - L.sceneTop) / xspan;
    L.cx = (L.sceneTop + L.sceneBot) / 2 + 0.3 * L.pxX; // view centred on world x = 0.3
  }
  function zp(z){ return L.padL + z * L.pxZ; }
  function xp(x){ return L.cx - x * L.pxX; }

  var P_LO = -1.6, P_HI = 1.2;   // pixel sweep (aim points on the F1 plane)

  function draw(){
    layout();
    var T = readTok(), ctx = S.ctx;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = T.surface; ctx.fillRect(0, 0, S.W, S.H);

    var dh = Math.min(st.delta, F1);

    // delta band + F1 plane
    ctx.fillStyle = T.accentSoft;
    ctx.fillRect(zp(F1 - dh), L.sceneTop, (zp(F1) - zp(F1 - dh)), L.sceneBot - L.sceneTop);
    ctx.strokeStyle = T.accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(zp(F1) + 0.5, L.sceneTop); ctx.lineTo(zp(F1) + 0.5, L.sceneBot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'italic 12px ' + SERIF; ctx.fillStyle = T.accent; ctx.textAlign = 'center';
    ctx.fillText('F₁', zp(F1), L.sceneTop + 12);
    ctx.font = '10.5px ' + MONO; ctx.fillStyle = T.muted;
    ctx.fillText('δ', zp(F1 - dh / 2), L.sceneTop + 12);
    ctx.textAlign = 'left';

    // scene clip: keep rays and arrows out of the plot strip
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, L.sceneTop, S.W, L.sceneBot - L.sceneTop);
    ctx.clip();

    // lens + sample
    ctx.strokeStyle = T.ink2; ctx.lineWidth = 1.4;
    var la = xp(-1.1), lb = xp(1.1), lx = zp(0.08);
    ctx.beginPath(); ctx.moveTo(lx, lb); ctx.quadraticCurveTo(lx + 8, (la + lb) / 2, lx, la);
    ctx.quadraticCurveTo(lx - 8, (la + lb) / 2, lx, lb); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = T.beam;
    ctx.beginPath(); ctx.arc(lx, xp(LSAMP), 3, 0, 6.2832); ctx.fill();
    ctx.fillStyle = T.muted; ctx.font = '10.5px ' + MONO;
    ctx.fillText('lens sample l', lx + 7, xp(LSAMP) - 6);

    // sphere — drawn in the same (anisotropic) z/x mapping the rays use
    var ox = zp(st.zs), oy = xp(st.xs), orz = st.r * L.pxZ;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(1, L.pxX / L.pxZ);
    var grad = ctx.createRadialGradient(-orz * 0.3, -orz * 0.35, orz * 0.15, 0, 0, orz);
    grad.addColorStop(0, 'rgba(255,215,130,0.95)');
    grad.addColorStop(1, 'rgba(205,140,40,0.9)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, orz, 0, 6.2832); ctx.fill();
    ctx.restore();

    // rays + reflection arrows
    var N = 15;
    var hits = [];
    for(var i = 0; i < N; i++){
      var p = P_LO + (P_HI - P_LO) * i / (N - 1);
      var h = hitFor(p);
      ctx.strokeStyle = T.beam; ctx.lineWidth = 1; ctx.globalAlpha = 0.42;
      ctx.beginPath(); ctx.moveTo(zp(0.08), xp(LSAMP));
      if(h){
        if(h.seg === 1){ ctx.lineTo(zp(F1), xp(p)); }
        ctx.lineTo(zp(h.z), xp(h.x));
      } else {
        ctx.lineTo(zp(F1), xp(p));
        var sc = p / F1;
        ctx.lineTo(zp(ZV), xp(p + sc * (ZV - F1)));
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      if(h) hits.push(h);
    }
    // arrows: active mode strong, other mode faint
    for(var k = 0; k < hits.length; k++){
      var h2 = hits[k];
      var rRaw = reflectAngle(h2, h2.sInc);
      var rSm = reflectAngle(h2, shadeSlope(h2));
      var main = st.on ? rSm : rRaw, ghost = st.on ? rRaw : rSm;
      if(Math.abs(main.a - ghost.a) > 1e-4){
        drawArrow(h2, ghost, T.muted, 0.35);
      }
      drawArrow(h2, main, T.accent, 0.95);
    }
    function drawArrow(h, r, col, alpha){
      var len = 1.05 * L.pxX;
      var x1 = zp(h.z), y1 = xp(h.x);
      // screen direction: z -> +x px, x -> -y px
      var dxp = r.rz * L.pxZ, dyp = -r.rx * L.pxX;
      var nrm = Math.hypot(dxp, dyp); dxp /= nrm; dyp /= nrm;
      var x2 = x1 + dxp * len, y2 = y1 + dyp * len;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      var a = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 6 * Math.cos(a - 0.4), y2 - 6 * Math.sin(a - 0.4));
      ctx.lineTo(x2 - 6 * Math.cos(a + 0.4), y2 - 6 * Math.sin(a + 0.4));
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();   // end scene clip

    /* ---- plot: the direction shading sees, per pixel ---- */
    var M = 220, raw = [], smo = [], segArr = [], lo = 1e9, hi = -1e9;
    for(var j = 0; j < M; j++){
      var pj = P_LO + (P_HI - P_LO) * j / (M - 1);
      var hj = hitFor(pj);
      if(!hj){ raw.push(null); smo.push(null); segArr.push(-1); continue; }
      var ar = Math.atan(hj.sInc);
      var as = Math.atan(shadeSlope(hj));
      raw.push(ar); smo.push(as); segArr.push(hj.seg);
      lo = Math.min(lo, ar, as); hi = Math.max(hi, ar, as);
    }
    if(hi - lo < 0.05){ var mid = (hi + lo) / 2; lo = mid - 0.025; hi = mid + 0.025; }
    var pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
    function py(a){ return L.plotBot - (a - lo) / (hi - lo) * (L.plotBot - L.plotTop); }
    function px(j){ return L.padL + (S.W - L.padL - L.padR) * j / (M - 1); }

    ctx.strokeStyle = T.hairline;
    ctx.beginPath(); ctx.moveTo(L.padL, L.plotBot + 0.5); ctx.lineTo(S.W - L.padR, L.plotBot + 0.5); ctx.stroke();
    ctx.fillStyle = T.muted; ctx.font = '10.5px ' + MONO;
    ctx.fillText('shading-ray direction per pixel →', L.padL, L.plotTop - 3);
    var labelled = false;
    for(var jt = 1; jt < M; jt++){
      if(segArr[jt] >= 0 && segArr[jt - 1] >= 0 && segArr[jt] !== segArr[jt - 1]){
        ctx.strokeStyle = T.accent; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(px(jt) + 0.5, L.plotTop); ctx.lineTo(px(jt) + 0.5, L.plotBot); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        if(!labelled){
          ctx.fillStyle = T.muted; ctx.textAlign = 'center';
          ctx.fillText('hit crosses F₁', px(jt), L.plotBot + 11);
          ctx.textAlign = 'left';
          labelled = true;
        }
      }
    }
    plotCurve(raw, T.sthin, st.on ? 0.4 : 1, st.on ? 1 : 1.8);
    plotCurve(smo, T.srange, st.on ? 1 : 0.4, st.on ? 1.8 : 1);
    function plotCurve(arr, col, alpha, width){
      ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = width;
      ctx.beginPath(); var pen = false;
      for(var q = 0; q < M; q++){
        if(arr[q] === null){ pen = false; continue; }
        if(!pen){ ctx.moveTo(px(q), py(arr[q])); pen = true; }
        else ctx.lineTo(px(q), py(arr[q]));
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    // direct labels
    ctx.font = '10.5px ' + MONO;
    ctx.fillStyle = T.sthin; ctx.fillRect(S.W - L.padR - 92, L.plotTop + 2, 9, 3);
    ctx.fillStyle = T.ink2; ctx.fillText('raw', S.W - L.padR - 79, L.plotTop + 7);
    ctx.fillStyle = T.srange; ctx.fillRect(S.W - L.padR - 52, L.plotTop + 2, 9, 3);
    ctx.fillStyle = T.ink2; ctx.fillText('eq. 3', S.W - L.padR - 39, L.plotTop + 7);
  }

  S.canvas.addEventListener('pointerdown', function(e){
    st.drag = true; S.canvas.setPointerCapture(e.pointerId); move(e); e.preventDefault();
  });
  S.canvas.addEventListener('pointermove', function(e){
    if(st.drag){ move(e); return; }
    var pt = S.pos(e);
    var ex = (pt.x - zp(st.zs)) / (st.r * L.pxZ), ey = (pt.y - xp(st.xs)) / (st.r * L.pxX);
    S.canvas.style.cursor = (ex * ex + ey * ey < 1.3) ? 'grab' : 'crosshair';
  });
  window.addEventListener('pointerup', function(){ st.drag = false; });
  function move(e){
    var pt = S.pos(e);
    st.zs = Math.max(4.8, Math.min(8.4, (pt.x - L.padL) / L.pxZ));
    S.schedule();
  }
  byId('ds-on').addEventListener('change', function(){ st.on = this.checked; S.schedule(); });
  byId('ds-delta').addEventListener('input', function(){
    st.delta = parseFloat(this.value);
    byId('dso-delta').textContent = st.delta.toFixed(2);
    S.schedule();
  });
})();

/* =========================================================================
   DEMO 2 — refraction and incremental shearing (eq. 4)
   Axial bundle through an eta = 1 slab. The continuation ray leaving the slab
   carries the partial shear smoothing applied (t0); the three strategies
   differ in what happens at the next focus plane.
   ========================================================================= */
(function(){
  var F1 = 6, F2 = 10, S1 = -1, HW = 0.6, DELTA = 1.6, ZV = 14;
  var dh = Math.min(DELTA, F1, F2 - F1);
  var st = { zg: 3.0, mode: 'stop', drag: false };

  var S = scaffold('d-refr', function(w){ return w < 600 ? 210 : 240; }, draw);
  if(!S) return;

  /* piecewise polyline for lens offset l under a strategy; 'ref' = no glass */
  function path(l, mode){
    var s = -l / F1;                    // p = 0
    var pts = [{z: 0, x: l}], x = l, z = 0;
    function go(zn){ x += s * (zn - z); z = zn; pts.push({z: z, x: x}); }
    var zg = st.zg, t0 = 0;
    if(mode === 'ref'){
      go(F1); s += l / F1;              // S0 = 1, full
      go(F2); s += S1 * l / F1;
      go(ZV);
      return pts;
    }
    if(zg < F1){
      go(zg);
      t0 = Math.max(0, 1 - (F1 - zg) / dh);
      s += t0 * l / F1;                 // handoff: continuation = shading ray
      go(F1);
      if(mode === 'full') s += l / F1;
      else if(mode === 'incr') s += (1 - t0) * l / F1;
      go(F2);
      if(mode !== 'stop') s += S1 * l / F1;
      go(ZV);
    } else {
      go(F1); s += l / F1;
      go(zg);
      t0 = Math.max(0, 1 - (F2 - zg) / dh);
      s += t0 * S1 * l / F1;
      go(F2);
      if(mode === 'full') s += S1 * l / F1;
      else if(mode === 'incr') s += (1 - t0) * S1 * l / F1;
      go(ZV);
    }
    return pts;
  }
  function xAt(pts, z){
    for(var i = 1; i < pts.length; i++){
      if(z <= pts[i].z + 1e-9){
        var a = pts[i - 1], b = pts[i];
        var u = (z - a.z) / Math.max(b.z - a.z, 1e-12);
        return a.x + (b.x - a.x) * u;
      }
    }
    return pts[pts.length - 1].x;
  }
  function deviation(){
    var mx = 0;
    var m1 = path(HW, st.mode), m2 = path(-HW, st.mode);
    var r1 = path(HW, 'ref'), r2 = path(-HW, 'ref');
    for(var i = 0; i <= 56; i++){
      var z = ZV * i / 56;
      mx = Math.max(mx, Math.abs(xAt(m1, z) - xAt(r1, z)), Math.abs(xAt(m2, z) - xAt(r2, z)));
    }
    return mx;
  }

  var L = {};
  function layout(){
    L.padL = 14; L.padR = 14; L.top = 8; L.bot = S.H - 22;
    L.pxZ = (S.W - L.padL - L.padR) / ZV;
    L.pxX = (L.bot - L.top) / 3.4;
    L.cx = (L.top + L.bot) / 2;
  }
  function zp(z){ return L.padL + z * L.pxZ; }
  function xp(x){ return L.cx - x * L.pxX; }

  function draw(){
    layout();
    var T = readTok(), ctx = S.ctx;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = T.surface; ctx.fillRect(0, 0, S.W, S.H);

    // delta bands + planes
    ctx.fillStyle = T.accentSoft;
    ctx.fillRect(zp(F1 - dh), L.top, zp(F1) - zp(F1 - dh), L.bot - L.top);
    ctx.fillRect(zp(F2 - dh), L.top, zp(F2) - zp(F2 - dh), L.bot - L.top);
    ctx.strokeStyle = T.accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
    [F1, F2].forEach(function(f){
      ctx.beginPath(); ctx.moveTo(zp(f) + 0.5, L.top); ctx.lineTo(zp(f) + 0.5, L.bot); ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.font = 'italic 12px ' + SERIF; ctx.fillStyle = T.accent; ctx.textAlign = 'center';
    ctx.fillText('F₁', zp(F1), L.top + 12); ctx.fillText('F₂', zp(F2), L.top + 12);
    ctx.font = '10.5px ' + MONO; ctx.fillStyle = T.muted;
    ctx.fillText('δ', zp(F1 - dh / 2), L.top + 12);
    ctx.fillText('δ', zp(F2 - dh / 2), L.top + 12);
    ctx.textAlign = 'left';

    // axis line
    ctx.strokeStyle = T.hairline;
    ctx.beginPath(); ctx.moveTo(zp(0), xp(0) + 0.5); ctx.lineTo(zp(ZV), xp(0) + 0.5); ctx.stroke();

    // lens
    ctx.strokeStyle = T.ink2; ctx.lineWidth = 1.4;
    var la = xp(-HW - 0.15), lb = xp(HW + 0.15), lx = zp(0.06);
    ctx.beginPath(); ctx.moveTo(lx, lb); ctx.quadraticCurveTo(lx + 8, (la + lb) / 2, lx, la);
    ctx.quadraticCurveTo(lx - 8, (la + lb) / 2, lx, lb); ctx.closePath(); ctx.stroke();

    // slab (tilted parallelogram, eta = 1)
    var g0 = zp(st.zg - 0.22), g1 = zp(st.zg + 0.22), tilt = 10;
    ctx.fillStyle = T.beamSoft; ctx.strokeStyle = T.beam; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g0 + tilt, L.top + 6); ctx.lineTo(g1 + tilt, L.top + 6);
    ctx.lineTo(g1 - tilt, L.bot - 6); ctx.lineTo(g0 - tilt, L.bot - 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = T.muted; ctx.font = '10.5px ' + MONO; ctx.textAlign = 'center';
    ctx.fillText('η = 1', zp(st.zg), L.bot + 12);
    ctx.textAlign = 'left';

    // reference ghost (extreme rays)
    ctx.strokeStyle = T.muted; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
    [HW, -HW].forEach(function(l){
      var pts = path(l, 'ref');
      ctx.beginPath(); ctx.moveTo(zp(pts[0].z), xp(pts[0].x));
      for(var i = 1; i < pts.length; i++) ctx.lineTo(zp(pts[i].z), xp(pts[i].x));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // actual bundle
    var N = 13;
    for(var i = 0; i < N; i++){
      var l = -HW + 2 * HW * i / (N - 1);
      var pts = path(l, st.mode);
      var center = Math.abs(l) < 1e-9;
      ctx.strokeStyle = T.beam; ctx.globalAlpha = center ? 0.95 : 0.5; ctx.lineWidth = center ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(zp(pts[0].z), xp(pts[0].x));
      for(var k = 1; k < pts.length; k++) ctx.lineTo(zp(pts[k].z), xp(pts[k].x));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = T.muted; ctx.font = '10.5px ' + MONO;
    ctx.fillText('ghost: no glass', zp(ZV) - 110, xp(0) - 6);

    // chip
    var dev = deviation();
    var chip = byId('dr-chip');
    if(chip){
      chip.textContent = 'max deviation from no-glass: ' + dev.toFixed(3);
      chip.className = 'chip ' + (dev < 0.02 ? 'ok' : 'bad');
    }
  }

  S.canvas.addEventListener('pointerdown', function(e){
    st.drag = true; S.canvas.setPointerCapture(e.pointerId); move(e); e.preventDefault();
  });
  S.canvas.addEventListener('pointermove', function(e){
    if(st.drag){ move(e); return; }
    var pt = S.pos(e);
    S.canvas.style.cursor = Math.abs(pt.x - zp(st.zg)) < 26 ? 'ew-resize' : 'crosshair';
  });
  window.addEventListener('pointerup', function(){ st.drag = false; });
  function move(e){
    var pt = S.pos(e);
    st.zg = Math.max(1.0, Math.min(9.4, (pt.x - L.padL) / L.pxZ));
    S.schedule();
  }
  var modes = byId('dr-modes');
  modes.addEventListener('click', function(e){
    var b = e.target.closest('button[data-rmode]');
    if(!b) return;
    st.mode = b.getAttribute('data-rmode');
    var bs = modes.querySelectorAll('button');
    for(var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', bs[i] === b ? 'true' : 'false');
    S.schedule();
  });
})();

/* =========================================================================
   DEMO 3 — ray-oriented flats (fig. 5)
   A camera-facing disc is tested against a plane orthogonal to EACH ray.
   Near the kink both tests can reject a hit the path clearly makes.
   ========================================================================= */
(function(){
  var F1 = 6, P = 2.2, LSAMP = -1.6, H = 0.55;
  var s0 = (P - LSAMP) / F1, sc = P / F1;
  var n0 = Math.hypot(1, s0), d0 = {z: 1 / n0, x: s0 / n0};
  var n1 = Math.hypot(1, sc), d1 = {z: 1 / n1, x: sc / n1};
  var O0 = {z: 0, x: LSAMP}, K = {z: F1, x: P};
  var Z0 = 4.0, Z1 = 8.0;                      // zoomed view
  var st = { c: {z: 5.87, x: 2.47}, flags: false, drag: false };

  var S = scaffold('d-flat', function(w){ return w < 600 ? 240 : 275; }, draw);
  if(!S) return;

  function test(C){
    // R0: oriented plane through C, orthogonal to d0; valid while z <= F1
    var t0 = (C.z - O0.z) * d0.z + (C.x - O0.x) * d0.x;
    var P0 = {z: O0.z + t0 * d0.z, x: O0.x + t0 * d0.x};
    var in0 = Math.hypot(P0.z - C.z, P0.x - C.x) <= H;
    if(t0 > 0 && P0.z <= F1 && in0) return {kind: 'r0', pt: P0};
    // R1 from the kink
    var t1 = (C.z - K.z) * d1.z + (C.x - K.x) * d1.x;
    var P1 = {z: K.z + t1 * d1.z, x: K.x + t1 * d1.x};
    var in1 = Math.hypot(P1.z - C.z, P1.x - C.x) <= H;
    if(t1 >= 0 && in1) return {kind: 'r1', pt: P1};
    // the true-miss configuration: the path crosses the disc (R0 corridor,
    // past the plane) but R1 sees it behind its origin
    var wedge = in0 && P0.z > F1 && in1 && t1 < 0;
    if(st.flags && wedge) return {kind: 'back', pt: P1};
    if(wedge) return {kind: 'miss', pt: C};
    return {kind: 'none', pt: null};
  }
  function naiveMissesButFlagsFind(C){
    var t0 = (C.z - O0.z) * d0.z + (C.x - O0.x) * d0.x;
    var P0 = {z: O0.z + t0 * d0.z, x: O0.x + t0 * d0.x};
    var in0 = Math.hypot(P0.z - C.z, P0.x - C.x) <= H;
    if(t0 > 0 && P0.z <= F1 && in0) return false;
    var t1 = (C.z - K.z) * d1.z + (C.x - K.x) * d1.x;
    var P1 = {z: K.z + t1 * d1.z, x: K.x + t1 * d1.x};
    var in1 = Math.hypot(P1.z - C.z, P1.x - C.x) <= H;
    return in0 && P0.z > F1 && in1 && t1 < 0;
  }

  var L = {};
  function layout(){
    L.padL = 14; L.padR = 14; L.top = 8; L.bot = S.H - 22;
    L.pxZ = (S.W - L.padL - L.padR) / (Z1 - Z0);
    var xspan = (Z1 - Z0) * (L.bot - L.top) / (S.W - L.padL - L.padR); // isotropic
    L.x0 = 2.3 - xspan / 2;
    L.pxX = (L.bot - L.top) / xspan;
  }
  function zp(z){ return L.padL + (z - Z0) * L.pxZ; }
  function xp(x){ return L.bot - (x - L.x0) * L.pxX; }

  function draw(){
    layout();
    var T = readTok(), ctx = S.ctx;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = T.surface; ctx.fillRect(0, 0, S.W, S.H);

    // miss wedge (sampled)
    var cell = 4;
    ctx.fillStyle = T.sthin; ctx.globalAlpha = 0.14;
    for(var gy = L.top; gy < L.bot; gy += cell){
      for(var gx = L.padL; gx < S.W - L.padR; gx += cell){
        var C = {z: Z0 + (gx - L.padL + cell / 2) / L.pxZ, x: L.x0 + (L.bot - (gy + cell / 2)) / L.pxX};
        if(naiveMissesButFlagsFind(C)) ctx.fillRect(gx, gy, cell, cell);
      }
    }
    ctx.globalAlpha = 1;

    // F1 plane
    ctx.strokeStyle = T.accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(zp(F1) + 0.5, L.top); ctx.lineTo(zp(F1) + 0.5, L.bot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'italic 12px ' + SERIF; ctx.fillStyle = T.accent; ctx.textAlign = 'center';
    ctx.fillText('F₁', zp(F1), L.top + 12); ctx.textAlign = 'left';

    var res = test(st.c);

    // rays
    ctx.lineWidth = 1.5;
    if(res.kind === 'r0'){
      ctx.strokeStyle = T.beam;
      ctx.beginPath(); ctx.moveTo(zp(Z0), xp(O0.x + s0 * Z0)); ctx.lineTo(zp(res.pt.z), xp(res.pt.x)); ctx.stroke();
      dot(res.pt, T.beam);
    } else {
      ctx.strokeStyle = T.beam;
      ctx.beginPath(); ctx.moveTo(zp(Z0), xp(O0.x + s0 * Z0)); ctx.lineTo(zp(F1), xp(P)); ctx.stroke();
      var stopZ = (res.kind === 'r1') ? res.pt.z : Z1;
      var stopX = (res.kind === 'r1') ? res.pt.x : P + sc * (Z1 - F1);
      ctx.beginPath(); ctx.moveTo(zp(F1), xp(P)); ctx.lineTo(zp(stopZ), xp(stopX)); ctx.stroke();
      if(res.kind === 'r1') dot(res.pt, T.beam);
      if(res.kind === 'back'){
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(zp(F1), xp(P)); ctx.lineTo(zp(res.pt.z), xp(res.pt.x)); ctx.stroke();
        ctx.setLineDash([]);
        dot(res.pt, T.beam);
      }
    }
    ctx.fillStyle = T.muted; ctx.font = '10.5px ' + MONO;
    ctx.fillText('R₀', zp(5.5), xp(O0.x + s0 * 5.5) - 8);
    ctx.fillText('R₁', zp(6.6), xp(P + sc * 0.6) + 15);

    // the disc (drawn orthogonal to the chief direction)
    var u = {z: -d1.x, x: d1.z};
    var a = {z: st.c.z + u.z * H, x: st.c.x + u.x * H};
    var b = {z: st.c.z - u.z * H, x: st.c.x - u.x * H};
    ctx.strokeStyle = T.ink; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(zp(a.z), xp(a.x)); ctx.lineTo(zp(b.z), xp(b.x)); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = T.muted;
    ctx.fillText('flat', zp(b.z) + 6, xp(b.x) + 10);

    // miss marker
    if(res.kind === 'miss'){
      ctx.strokeStyle = T.sthin; ctx.lineWidth = 2;
      var mx = zp(st.c.z), my = xp(st.c.x);
      ctx.beginPath(); ctx.moveTo(mx - 6, my - 6); ctx.lineTo(mx + 6, my + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 6, my + 6); ctx.lineTo(mx + 6, my - 6); ctx.stroke();
    }
    function dot(p, col){
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(zp(p.z), xp(p.x), 3.6, 0, 6.2832); ctx.fill();
    }

    // wedge label
    ctx.fillStyle = T.muted; ctx.font = '10.5px ' + MONO; ctx.textAlign = 'right';
    ctx.fillText('shaded: both tests reject here', zp(F1) - 10, L.bot - 6);
    ctx.textAlign = 'left';

    // chip
    var chip = byId('df-chip');
    if(chip){
      if(res.kind === 'r0'){ chip.textContent = 'hit on R₀'; chip.className = 'chip ok'; }
      else if(res.kind === 'r1'){ chip.textContent = 'hit on R₁'; chip.className = 'chip ok'; }
      else if(res.kind === 'back'){ chip.textContent = 'recovered · backward hit on R₁'; chip.className = 'chip alt'; }
      else if(res.kind === 'miss'){ chip.textContent = 'MISSED'; chip.className = 'chip bad'; }
      else { chip.textContent = 'no intersection'; chip.className = 'chip'; }
    }
  }

  S.canvas.addEventListener('pointerdown', function(e){
    st.drag = true; S.canvas.setPointerCapture(e.pointerId); move(e); e.preventDefault();
  });
  S.canvas.addEventListener('pointermove', function(e){
    if(st.drag){ move(e); return; }
    var pt = S.pos(e);
    var near = Math.hypot(pt.x - zp(st.c.z), pt.y - xp(st.c.x)) < H * L.pxX + 14;
    S.canvas.style.cursor = near ? 'grab' : 'crosshair';
  });
  window.addEventListener('pointerup', function(){ st.drag = false; });
  function move(e){
    var pt = S.pos(e);
    st.c.z = Math.max(Z0 + 0.2, Math.min(Z1 - 0.2, Z0 + (pt.x - L.padL) / L.pxZ));
    var xspan = (L.bot - L.top) / L.pxX;
    st.c.x = Math.max(L.x0 + 0.08, Math.min(L.x0 + xspan - 0.08, L.x0 + (L.bot - pt.y) / L.pxX));
    S.schedule();
  }
  byId('df-flags').addEventListener('change', function(){ st.flags = this.checked; S.schedule(); });
})();

})();
