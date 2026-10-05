/* Focus Range — 2-D optical bench.
   Camera at z=0 looking +z. World x is vertical. One pixel's full lens bundle is
   drawn as piecewise-linear rays (eq. 1 of the paper, in slope form); the film
   strip renders the whole flatland scene with the same construction. */
(function(){
'use strict';

var canvas = document.getElementById('bench');
if(!canvas) return;
var ctx = canvas.getContext('2d');

var ZMAX = 20;       // scene depth extent, scene units
var TANQ = 0.5;      // tan of half the vertical FOV
var FLEN = 1.0;      // focal length used for nothing but intuition; CoC drawn geometrically

var state = {
  mode: 'range',          // thin | gdof | range
  ap: 1.1, F1: 6.0, F2: 12.0, S1: -1.0, B: 0.45,
  pixel: -0.20,           // film coordinate in [-1, 1]
  objects: [
    {x:  1.30, z:  3.1, r: 0.55, alb: [0.82, 0.20, 0.17], name: 'near'},
    {x: -0.55, z:  8.6, r: 0.72, alb: [0.88, 0.60, 0.20], name: 'mid'},
    {x:  1.05, z: 16.2, r: 0.85, alb: [0.22, 0.38, 0.80], name: 'far'},
    {x: -2.30, z: 18.2, r: 0.16, alb: [1.00, 0.78, 0.45], em: 5.0},
    {x:  2.75, z: 18.8, r: 0.14, alb: [0.55, 0.92, 0.95], em: 4.5}
  ],
  hoverZ: null, hoverY: null,
  drag: null
};

var MODE_COLOR = {thin: '--s-thin', gdof: '--s-gdof', range: '--s-range'};
var MODE_LABEL = {thin: 'thin lens', gdof: 'generalized DoF', range: 'focus range'};

/* ---------------- geometry: piecewise segments in slope form ---------------- */
/* Each segment: {z0, z1, x0, s} with x(z) = x0 + s*(z - z0), valid z in [z0, z1]. */
function raySegments(l, p, st){
  var F1 = st.F1, F2 = Math.max(st.F2, F1 + 0.2);
  var s0 = (p - l) / F1;
  if(st.mode === 'thin') return [{z0: 0, z1: ZMAX + 5, x0: l, s: s0}];
  var segs = [{z0: 0, z1: F1, x0: l, s: s0}];
  var xF2 = p * F2 / F1;
  if(st.mode === 'range'){
    segs.push({z0: F1, z1: F2, x0: p, s: p / F1});
    segs.push({z0: F2, z1: ZMAX + 5, x0: xF2, s: (p + st.S1 * l) / F1});
  } else { // gdof: converge at F1 and F2, bulge B at the midpoint
    var M = (F1 + F2) / 2;
    var xM = p * M / F1 - st.B * l;
    segs.push({z0: F1, z1: M, x0: p, s: (xM - p) / (M - F1)});
    segs.push({z0: M, z1: F2, x0: xM, s: (xF2 - xM) / (F2 - M)});
    segs.push({z0: F2, z1: ZMAX + 5, x0: xF2, s: (p + st.S1 * l) / F1});
  }
  return segs;
}
function xAt(segs, z){
  for(var i = 0; i < segs.length; i++){
    var g = segs[i];
    if(z <= g.z1 || i === segs.length - 1) return g.x0 + g.s * (z - g.z0);
  }
  return 0;
}

/* Beam half-width profile: distance between the two extreme lens samples.
   Independent of the pixel (see the paper's eq. 2) — a property of the lens. */
function beamWidth(z, st, S1override){
  var st2 = S1override === undefined ? st : {
    mode: st.mode, F1: st.F1, F2: st.F2, S1: S1override, B: st.B
  };
  var h = st.ap / 2;
  var a = raySegments(-h, 0, st2), b = raySegments(h, 0, st2);
  return Math.abs(xAt(a, z) - xAt(b, z));
}

/* ---------------- flatland ray trace ---------------- */
function traceSegs(segs, objects){
  for(var i = 0; i < segs.length; i++){
    var g = segs[i];
    var best = null;
    for(var k = 0; k < objects.length; k++){
      var o = objects[k];
      // param u = z - z0; point: (z0+u, x0+s u); circle at (o.z, o.x) radius o.r
      var dz = g.z0 - o.z, dx = g.x0 - o.x;
      var A = 1 + g.s * g.s;
      var Bq = 2 * (dz + g.s * dx);
      var C = dz * dz + dx * dx - o.r * o.r;
      var u;
      if(C < 0){ u = 0; }           // segment starts inside (plane split the object)
      else {
        var disc = Bq * Bq - 4 * A * C;
        if(disc < 0) continue;
        u = (-Bq - Math.sqrt(disc)) / (2 * A);
        if(u < 0) continue;
      }
      var z = g.z0 + u;
      if(z > g.z1 + 1e-9) continue;
      if(!best || z < best.z){
        best = {z: z, x: g.x0 + g.s * u, o: o};
      }
    }
    if(best){
      var nz = (best.z - best.o.z) / best.o.r, nx = (best.x - best.o.x) / best.o.r;
      best.nz = nz; best.nx = nx;
      return best;
    }
  }
  return null;
}

function shadeHit(hit){
  if(hit.o.em){
    return [hit.o.alb[0] * hit.o.em, hit.o.alb[1] * hit.o.em, hit.o.alb[2] * hit.o.em];
  }
  // light from the camera side, above: direction TO light in (z, x)
  var Lz = -0.55, Lx = 0.835;
  var nl = Math.max(0, hit.nz * Lz + hit.nx * Lx);
  var k = 0.30 + 0.75 * nl;
  return [hit.o.alb[0] * k, hit.o.alb[1] * k, hit.o.alb[2] * k];
}
function bgColor(yim){
  var t = (yim + 1) / 2; // 0 bottom, 1 top
  return [0.045 + 0.02 * t, 0.055 + 0.035 * t, 0.085 + 0.075 * t];
}

var STRIP_ROWS = 150;
var stripCanvas = document.createElement('canvas');
stripCanvas.width = 1; stripCanvas.height = STRIP_ROWS;
var stripCtx = stripCanvas.getContext('2d');

function renderStrip(st){
  var img = stripCtx.createImageData(1, STRIP_ROWS);
  var d = img.data;
  var NL = 14, NSUB = 2;
  for(var row = 0; row < STRIP_ROWS; row++){
    var acc = [0, 0, 0];
    for(var sub = 0; sub < NSUB; sub++){
      var yim = 1 - 2 * (row + (sub + 0.5) / NSUB) / STRIP_ROWS;
      var p = yim * TANQ * st.F1;
      for(var li = 0; li < NL; li++){
        var l = st.ap * ((li + 0.5) / NL - 0.5);
        var hit = traceSegs(raySegments(l, p, st), st.objects);
        var c = hit ? shadeHit(hit) : bgColor(yim);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
    }
    var n = NL * NSUB, o = row * 4;
    for(var ch = 0; ch < 3; ch++){
      var v = acc[ch] / n;
      v = v / (1 + v);                       // reinhard
      d[o + ch] = Math.round(255 * Math.pow(v, 1 / 2.2));
    }
    d[o + 3] = 255;
  }
  stripCtx.putImageData(img, 0, 0);
}

/* ---------------- layout ---------------- */
var L = {};        // computed pixel layout
function computeLayout(){
  var cssW = canvas.clientWidth || 900;
  var small = cssW < 600;
  var benchH = small ? 220 : 290;
  var chartH = small ? 88 : 104;
  var axisH = 24;
  var padT = 10, padB = 8;
  L.W = cssW;
  L.benchTop = padT;
  L.benchBot = padT + benchH;
  L.benchH = benchH;
  L.axisY = L.benchBot + axisH / 2 + 4;
  L.chartTop = L.benchBot + axisH + 6;
  L.chartBot = L.chartTop + chartH;
  L.H = L.chartBot + padB;
  L.filmX = small ? 10 : 16;
  L.filmW = small ? 20 : 26;
  L.lensX = L.filmX + L.filmW + (small ? 24 : 40);
  L.padR = 14;
  L.pxPerZ = (L.W - L.padR - L.lensX) / ZMAX;
  L.cx = L.benchTop + benchH / 2;
  L.pxPerX = benchH / (small ? 10 : 9);
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(L.W * dpr);
  canvas.height = Math.round(L.H * dpr);
  canvas.style.height = L.H + 'px';
  L.dpr = dpr;
}
function zpx(z){ return L.lensX + z * L.pxPerZ; }
function pxz(px){ return (px - L.lensX) / L.pxPerZ; }
function xpx(x){ return L.cx - x * L.pxPerX; }
function filmY(yim){ return L.benchTop + (1 - yim) / 2 * L.benchH; }
function yimAt(py){ return 1 - 2 * (py - L.benchTop) / L.benchH; }

var T = {};        // theme tokens, re-read each draw
function readTokens(){
  var cs = getComputedStyle(document.documentElement);
  function g(n){ return cs.getPropertyValue(n).trim(); }
  T.surface = g('--surface'); T.ink = g('--ink'); T.ink2 = g('--ink-2');
  T.muted = g('--muted'); T.line = g('--line'); T.hairline = g('--hairline');
  T.accent = g('--accent'); T.accentSoft = g('--accent-soft');
  T.beam = g('--beam'); T.beamSoft = g('--beam-soft');
  T.mode = g(MODE_COLOR[state.mode]);
  T.sthin = g('--s-thin'); T.sgdof = g('--s-gdof'); T.srange = g('--s-range');
}

/* ---------------- drawing ---------------- */
var MONO = '"IBM Plex Mono", monospace';
var SERIF = '"Source Serif 4", Georgia, serif';

function draw(){
  readTokens();
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  ctx.clearRect(0, 0, L.W, L.H);
  ctx.fillStyle = T.surface;
  ctx.fillRect(0, 0, L.W, L.H);

  var st = state;
  var F1 = st.F1, F2 = Math.max(st.F2, F1 + 0.2);
  var showF2 = st.mode !== 'thin';

  /* depth gridlines + shared axis */
  ctx.strokeStyle = T.hairline; ctx.lineWidth = 1;
  ctx.fillStyle = T.muted; ctx.font = '10.5px ' + MONO; ctx.textAlign = 'center';
  for(var z = 0; z <= ZMAX; z += 2){
    var px = Math.round(zpx(z)) + 0.5;
    ctx.beginPath(); ctx.moveTo(px, L.benchTop); ctx.lineTo(px, L.benchBot); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, L.chartTop); ctx.lineTo(px, L.chartBot); ctx.stroke();
    if(z < ZMAX) ctx.fillText(String(z), px, L.axisY + 3);
  }
  ctx.textAlign = 'right';
  ctx.fillText('depth z →', L.W - L.padR, L.axisY + 3);
  ctx.textAlign = 'left';

  /* in-focus band */
  if(showF2){
    ctx.fillStyle = T.accentSoft;
    ctx.fillRect(zpx(F1), L.benchTop, zpx(F2) - zpx(F1), L.benchH);
    ctx.fillRect(zpx(F1), L.chartTop, zpx(F2) - zpx(F1), L.chartBot - L.chartTop);
  }

  /* interval labels along the top */
  ctx.font = '10.5px ' + MONO; ctx.fillStyle = T.muted; ctx.textAlign = 'center';
  if(showF2){
    ctx.fillText('foreground', (zpx(0) + zpx(F1)) / 2, L.benchTop + 12);
    ctx.fillStyle = T.accent;
    ctx.fillText('in focus', (zpx(F1) + zpx(F2)) / 2, L.benchTop + 12);
    ctx.fillStyle = T.muted;
    if(zpx(ZMAX) - zpx(F2) > 70) ctx.fillText('background', (zpx(F2) + zpx(ZMAX)) / 2, L.benchTop + 12);
  } else {
    ctx.fillText('in focus at exactly F₁', zpx(F1), L.benchTop + 12);
  }
  ctx.textAlign = 'left';

  /* the pixel's bundle */
  var p = st.pixel * TANQ * F1;
  var NR = 13;
  var hw = st.ap / 2;

  // envelope between extreme rays, clipped where the whole bundle is absorbed
  var top = raySegments(-hw, p, st), bot = raySegments(hw, p, st);
  var hitT = traceSegs(top, st.objects), hitB = traceSegs(bot, st.objects);
  var zEnv = Math.max(hitT ? hitT.z : ZMAX, hitB ? hitB.z : ZMAX);
  ctx.beginPath();
  var steps = 60;
  for(var i = 0; i <= steps; i++){
    var zz = zEnv * i / steps;
    var py = xpx(xAt(top, zz));
    if(i === 0) ctx.moveTo(zpx(zz), py); else ctx.lineTo(zpx(zz), py);
  }
  for(var i2 = steps; i2 >= 0; i2--){
    var zz2 = zEnv * i2 / steps;
    ctx.lineTo(zpx(zz2), xpx(xAt(bot, zz2)));
  }
  ctx.closePath();
  ctx.fillStyle = T.beamSoft;
  ctx.fill();

  /* film + fan from the film pixel to the lens samples */
  var fpy = filmY(st.pixel);
  ctx.strokeStyle = T.beam; ctx.globalAlpha = 0.18; ctx.lineWidth = 1;
  for(var ri = 0; ri < NR; ri++){
    var l = -hw + st.ap * ri / (NR - 1);
    ctx.beginPath();
    ctx.moveTo(L.filmX + L.filmW, fpy);
    ctx.lineTo(zpx(0), xpx(l));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* rays, clipped at scene hits */
  for(var ri2 = 0; ri2 < NR; ri2++){
    var l2 = -hw + st.ap * ri2 / (NR - 1);
    var segs = raySegments(l2, p, st);
    var hit = traceSegs(segs, st.objects);
    var zEnd = hit ? hit.z : ZMAX;
    var center = Math.abs(l2) < 1e-9;
    ctx.strokeStyle = T.beam;
    ctx.globalAlpha = center ? 0.95 : 0.45;
    ctx.lineWidth = center ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(zpx(0), xpx(l2));
    for(var si = 0; si < segs.length; si++){
      var g = segs[si];
      if(g.z0 >= zEnd) break;
      var zStop = Math.min(g.z1, zEnd);
      ctx.lineTo(zpx(zStop), xpx(g.x0 + g.s * (zStop - g.z0)));
    }
    ctx.stroke();
    if(hit){
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = T.beam;
      ctx.beginPath(); ctx.arc(zpx(hit.z), xpx(hit.x), 1.6, 0, 6.2832); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  /* objects (blur halo width follows the local beam width) */
  for(var k = 0; k < st.objects.length; k++){
    var o = st.objects[k];
    var ox = zpx(o.z), oy = xpx(o.x), orr = o.r * L.pxPerX;
    var coc = beamWidth(o.z, st);
    var blurPx = Math.min(26, coc * L.pxPerX * 0.8);
    var col = 'rgb(' + Math.round(255 * o.alb[0]) + ',' + Math.round(255 * o.alb[1]) + ',' + Math.round(255 * o.alb[2]) + ')';
    ctx.save();
    if(o.em || blurPx > 0.6){
      ctx.shadowColor = col;
      ctx.shadowBlur = o.em ? Math.max(8, blurPx) : blurPx;
    }
    var grad = ctx.createRadialGradient(ox - orr * 0.35, oy - orr * 0.4, orr * 0.1, ox, oy, orr);
    grad.addColorStop(0, 'rgba(' + Math.round(255 * Math.min(1, o.alb[0] + 0.25)) + ',' + Math.round(255 * Math.min(1, o.alb[1] + 0.25)) + ',' + Math.round(255 * Math.min(1, o.alb[2] + 0.25)) + ',1)');
    grad.addColorStop(1, col);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(ox, oy, orr, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  /* lens */
  var la = xpx(-hw) /* bottom */, lb = xpx(hw);
  var lx = zpx(0);
  ctx.fillStyle = T.beamSoft;
  ctx.strokeStyle = T.ink2; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(lx, lb);
  ctx.quadraticCurveTo(lx + 9, (la + lb) / 2, lx, la);
  ctx.quadraticCurveTo(lx - 9, (la + lb) / 2, lx, lb);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // aperture ticks
  ctx.strokeStyle = T.muted;
  ctx.beginPath(); ctx.moveTo(lx - 5, lb); ctx.lineTo(lx + 5, lb); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx - 5, la); ctx.lineTo(lx + 5, la); ctx.stroke();

  /* film strip (the flatland render) */
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stripCanvas, L.filmX, L.benchTop, L.filmW, L.benchH);
  ctx.restore();
  ctx.strokeStyle = T.line; ctx.lineWidth = 1;
  ctx.strokeRect(L.filmX + 0.5, L.benchTop + 0.5, L.filmW - 1, L.benchH - 1);
  ctx.fillStyle = T.muted; ctx.font = '10.5px ' + MONO;
  ctx.save();
  ctx.translate(L.filmX - 4, L.cx);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('film', 0, 0);
  ctx.restore();

  /* pixel marker on the film */
  ctx.fillStyle = T.accent;
  ctx.beginPath();
  ctx.moveTo(L.filmX + L.filmW + 1, fpy);
  ctx.lineTo(L.filmX + L.filmW + 8, fpy - 5);
  ctx.lineTo(L.filmX + L.filmW + 8, fpy + 5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = T.accent; ctx.globalAlpha = 0.8; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(L.filmX - 1, fpy + 0.5); ctx.lineTo(L.filmX + L.filmW + 1, fpy + 0.5); ctx.stroke();
  ctx.globalAlpha = 1;

  /* focus planes (draggable) */
  drawPlane(F1, 'F₁', true);
  if(showF2) drawPlane(F2, 'F₂', false);

  /* ------------- chart ------------- */
  var wmaxData = 0.001;
  var chartModes = [st];
  for(var zi = 0; zi <= 100; zi++){
    wmaxData = Math.max(wmaxData, beamWidth(ZMAX * zi / 100, st));
  }
  var ghosts = [];
  if(st.mode === 'range'){
    var fan = [-0.5, -1, -1.5, -2];
    for(var fi = 0; fi < fan.length; fi++){
      if(Math.abs(fan[fi] - st.S1) > 0.11) ghosts.push(fan[fi]);
    }
    for(var gi = 0; gi < ghosts.length; gi++){
      for(var zj = 0; zj <= 40; zj++){
        wmaxData = Math.max(wmaxData, beamWidth(ZMAX * zj / 40, st, ghosts[gi]));
      }
    }
  }
  var wmax = Math.max(1.0, Math.ceil(wmaxData * 2) / 2);
  function wy(w){ return L.chartBot - (w / wmax) * (L.chartBot - L.chartTop - 16); }

  // y gridlines + labels
  ctx.font = '10px ' + MONO; ctx.fillStyle = T.muted; ctx.textAlign = 'left';
  var wstep = wmax > 2.5 ? 1 : 0.5;
  for(var wv = 0; wv <= wmax + 1e-6; wv += wstep){
    var yy = Math.round(wy(wv)) + 0.5;
    ctx.strokeStyle = T.hairline;
    ctx.beginPath(); ctx.moveTo(L.lensX, yy); ctx.lineTo(L.W - L.padR, yy); ctx.stroke();
    if(wv > 0) ctx.fillText(wv.toFixed(1), L.filmX, yy + 3);
  }
  // baseline
  ctx.strokeStyle = T.line;
  ctx.beginPath(); ctx.moveTo(L.lensX, wy(0) + 0.5); ctx.lineTo(L.W - L.padR, wy(0) + 0.5); ctx.stroke();
  ctx.fillStyle = T.muted;
  ctx.fillText('circle of confusion, beam width at z', L.lensX + 6, L.chartTop + 9);

  // ghost curves (S1 fan)
  for(var gj = 0; gj < ghosts.length; gj++){
    drawCurve(st, ghosts[gj], T.mode, 0.22, 1);
    var wEnd = beamWidth(ZMAX, st, ghosts[gj]);
    ctx.fillStyle = T.muted; ctx.globalAlpha = 0.7; ctx.textAlign = 'right';
    ctx.font = '9.5px ' + MONO;
    ctx.fillText(ghosts[gj].toFixed(1), L.W - L.padR - 2, Math.max(L.chartTop + 24, wy(wEnd) - 3));
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  // active curve + soft fill
  drawCurveFill(st, T.mode);
  drawCurve(st, undefined, T.mode, 1, 2);

  // direct label with chip
  ctx.font = '11px ' + MONO;
  var lbl = MODE_LABEL[st.mode];
  var lw = ctx.measureText(lbl).width;
  var lxx = L.W - L.padR - lw - 16, lyy = L.chartTop + 9;
  ctx.fillStyle = T.mode; ctx.fillRect(lxx, lyy - 7, 9, 3);
  ctx.fillStyle = T.ink2; ctx.fillText(lbl, lxx + 14, lyy - 1);

  /* kink markers where the active curve touches zero */
  ctx.fillStyle = T.mode;
  circle(zpx(F1), wy(0), 2.4);
  if(showF2) circle(zpx(F2), wy(0), 2.4);

  /* ------------- crosshair ------------- */
  if(st.hoverZ !== null && !st.drag){
    var hz = st.hoverZ;
    var hx = Math.round(zpx(hz)) + 0.5;
    ctx.strokeStyle = T.muted; ctx.globalAlpha = 0.55;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(hx, L.benchTop); ctx.lineTo(hx, L.chartBot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    var w = beamWidth(hz, st);
    var zone = st.mode === 'thin'
      ? (Math.abs(hz - F1) < 0.15 ? 'in focus' : (hz < F1 ? 'near' : 'far'))
      : (hz < F1 ? 'foreground' : (hz < F2 ? 'in focus' : 'background'));
    var txt = 'z ' + hz.toFixed(1) + ' · ' + zone + ' · CoC ' + w.toFixed(2);
    ctx.font = '11px ' + MONO;
    var tw = ctx.measureText(txt).width;
    var bx = Math.min(L.W - L.padR - tw - 14, Math.max(L.lensX, hx + 8));
    var by = L.benchBot - 24;
    ctx.fillStyle = T.surface; ctx.globalAlpha = 0.92;
    ctx.fillRect(bx - 6, by - 12, tw + 12, 19);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = T.line; ctx.strokeRect(bx - 5.5, by - 11.5, tw + 11, 18);
    ctx.fillStyle = T.ink2; ctx.fillText(txt, bx, by + 2);
  }

  function drawPlane(zp, label, isF1){
    var px = Math.round(zpx(zp)) + 0.5;
    ctx.strokeStyle = T.accent; ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(px, L.benchTop); ctx.lineTo(px, L.chartBot); ctx.stroke();
    ctx.setLineDash([]);
    // handle chip
    ctx.font = 'italic 12px ' + SERIF;
    var tw = ctx.measureText(label).width;
    var hy = L.benchTop + 20;
    ctx.fillStyle = T.surface;
    ctx.strokeStyle = T.accent;
    roundRect(px - tw / 2 - 7, hy, tw + 14, 19, 5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = T.accent; ctx.textAlign = 'center';
    ctx.fillText(label, px, hy + 13.5);
    ctx.textAlign = 'left';
  }
  function drawCurve(stc, S1o, color, alpha, width){
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width;
    ctx.beginPath();
    var n = 160;
    for(var ii = 0; ii <= n; ii++){
      var zz = 0.4 + (ZMAX - 0.4) * ii / n;
      var yy = wy(Math.min(beamWidth(zz, stc, S1o), wmax * 1.04));
      if(ii === 0) ctx.moveTo(zpx(zz), yy); else ctx.lineTo(zpx(zz), yy);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  function drawCurveFill(stc, color){
    ctx.fillStyle = color; ctx.globalAlpha = 0.08;
    ctx.beginPath();
    var n = 160;
    ctx.moveTo(zpx(0.4), wy(0));
    for(var ii = 0; ii <= n; ii++){
      var zz = 0.4 + (ZMAX - 0.4) * ii / n;
      ctx.lineTo(zpx(zz), wy(Math.min(beamWidth(zz, stc), wmax * 1.04)));
    }
    ctx.lineTo(zpx(ZMAX), wy(0));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }
  function roundRect(x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(x, y, r){ ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
}

/* ---------------- scheduling ---------------- */
var needStrip = true, raf = 0;
function schedule(stripToo){
  if(stripToo) needStrip = true;
  if(raf) return;
  raf = requestAnimationFrame(function(){
    raf = 0;
    if(needStrip){ renderStrip(state); needStrip = false; }
    draw();
  });
}

/* ---------------- interaction ---------------- */
function evPos(e){
  var r = canvas.getBoundingClientRect();
  return {x: e.clientX - r.left, y: e.clientY - r.top};
}
function hitTest(pt){
  var F1px = zpx(state.F1), F2px = zpx(Math.max(state.F2, state.F1 + 0.2));
  var showF2 = state.mode !== 'thin';
  // film pixel
  if(pt.x < L.filmX + L.filmW + 12 && pt.y > L.benchTop - 6 && pt.y < L.benchBot + 6) return {kind: 'pixel'};
  // plane handles: anywhere near the dashed line
  if(Math.abs(pt.x - F1px) < 7 && pt.y > L.benchTop && pt.y < L.chartBot){
    if(!showF2 || Math.abs(pt.x - F1px) <= Math.abs(pt.x - F2px)) return {kind: 'f1'};
  }
  if(showF2 && Math.abs(pt.x - F2px) < 7 && pt.y > L.benchTop && pt.y < L.chartBot) return {kind: 'f2'};
  // objects
  for(var k = 0; k < state.objects.length; k++){
    var o = state.objects[k];
    var dx = pt.x - zpx(o.z), dy = pt.y - xpx(o.x);
    if(dx * dx + dy * dy < Math.pow(o.r * L.pxPerX + 7, 2)) return {kind: 'obj', idx: k};
  }
  return null;
}
canvas.addEventListener('pointerdown', function(e){
  var pt = evPos(e);
  var h = hitTest(pt);
  if(h){
    state.drag = h;
    canvas.setPointerCapture(e.pointerId);
    applyDrag(pt);
    e.preventDefault();
  }
});
canvas.addEventListener('pointermove', function(e){
  var pt = evPos(e);
  if(state.drag){ applyDrag(pt); return; }
  var h = hitTest(pt);
  canvas.style.cursor = h ? (h.kind === 'obj' ? 'grab' : (h.kind === 'pixel' ? 'ns-resize' : 'ew-resize')) : 'crosshair';
  if(pt.x > L.lensX - 4 && pt.x < L.W - L.padR){
    state.hoverZ = Math.max(0, Math.min(ZMAX, pxz(pt.x)));
  } else state.hoverZ = null;
  schedule(false);
});
canvas.addEventListener('pointerleave', function(){
  state.hoverZ = null; schedule(false);
});
window.addEventListener('pointerup', function(){
  if(state.drag){ state.drag = null; schedule(false); }
});
function applyDrag(pt){
  var d = state.drag;
  if(d.kind === 'pixel'){
    state.pixel = Math.max(-1, Math.min(1, yimAt(pt.y)));
    schedule(false); // pixel doesn't change the strip
  } else if(d.kind === 'f1'){
    var z1 = Math.max(1.5, Math.min(pxz(pt.x), state.mode === 'thin' ? 16 : state.F2 - 0.8));
    state.F1 = Math.round(z1 * 10) / 10;
    syncSliders(); schedule(true);
  } else if(d.kind === 'f2'){
    var z2 = Math.max(state.F1 + 0.8, Math.min(pxz(pt.x), 18));
    state.F2 = Math.round(z2 * 10) / 10;
    syncSliders(); schedule(true);
  } else if(d.kind === 'obj'){
    var o = state.objects[d.idx];
    o.z = Math.max(0.8, Math.min(ZMAX - 0.3, pxz(pt.x)));
    o.x = Math.max(-4.2, Math.min(4.2, (L.cx - pt.y) / L.pxPerX));
    schedule(true);
  }
}

/* ---------------- controls ---------------- */
function byId(id){ return document.getElementById(id); }
var sAp = byId('b-ap'), sF1 = byId('b-f1'), sF2 = byId('b-f2'), sS1 = byId('b-s1'), sB = byId('b-bb');
var oAp = byId('bo-ap'), oF1 = byId('bo-f1'), oF2 = byId('bo-f2'), oS1 = byId('bo-s1'), oB = byId('bo-bb');

function fmt(v, dp){ return (v < 0 ? '−' : '') + Math.abs(v).toFixed(dp); }
function syncSliders(){
  sAp.value = state.ap; sF1.value = state.F1; sF2.value = state.F2;
  sS1.value = state.S1; sB.value = state.B;
  oAp.textContent = fmt(state.ap, 2);
  oF1.textContent = fmt(state.F1, 1);
  oF2.textContent = fmt(state.F2, 1);
  oS1.textContent = fmt(state.S1, 2);
  oB.textContent = fmt(state.B, 2);
}
function bindSlider(el, key, dp, after){
  el.addEventListener('input', function(){
    state[key] = parseFloat(el.value);
    if(after) after();
    syncSliders(); schedule(true);
  });
}
bindSlider(sAp, 'ap', 2);
bindSlider(sF1, 'F1', 1, function(){
  if(state.mode !== 'thin' && state.F2 < state.F1 + 0.8) state.F2 = state.F1 + 0.8;
});
bindSlider(sF2, 'F2', 1, function(){
  if(state.F1 > state.F2 - 0.8) state.F1 = Math.max(1.5, state.F2 - 0.8);
});
bindSlider(sS1, 'S1', 2);
bindSlider(sB, 'B', 2);

/* mode tabs */
var tabs = byId('bench-tabs');
tabs.addEventListener('click', function(e){
  var b = e.target.closest('button[data-mode]');
  if(!b) return;
  state.mode = b.getAttribute('data-mode');
  var bs = tabs.querySelectorAll('button');
  for(var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-selected', bs[i] === b ? 'true' : 'false');
  var ctls = document.querySelectorAll('#bench-ctls .ctl');
  for(var j = 0; j < ctls.length; j++){
    var modes = ctls[j].getAttribute('data-modes') || '';
    ctls[j].classList.toggle('off', modes.indexOf(state.mode) === -1);
  }
  schedule(true);
});

/* theme + resize + fonts */
function relayout(){ computeLayout(); schedule(true); }
if(window.ResizeObserver){
  var ro = new ResizeObserver(function(){ relayout(); });
  ro.observe(canvas.parentElement);
} else {
  window.addEventListener('resize', relayout);
}
var mq = window.matchMedia('(prefers-color-scheme: light)');
if(mq.addEventListener) mq.addEventListener('change', function(){ schedule(false); });
new MutationObserver(function(){ schedule(false); })
  .observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ schedule(false); });

/* init */
var ctls0 = document.querySelectorAll('#bench-ctls .ctl');
for(var j0 = 0; j0 < ctls0.length; j0++){
  var modes0 = ctls0[j0].getAttribute('data-modes') || '';
  ctls0[j0].classList.toggle('off', modes0.indexOf(state.mode) === -1);
}
syncSliders();
computeLayout();
renderStrip(state); needStrip = false;
draw();
})();
