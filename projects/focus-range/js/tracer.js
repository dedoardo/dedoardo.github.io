/* Focus Range — progressive path tracer (WebGL2).
   The accumulation target is double-wide: the left half always holds the thin-lens
   camera (A), the right half the focus-range camera (B). The display pass picks a
   side per pixel from the divider, so dragging the divider never resets the
   accumulated image. The thin lens is literally the degenerate focus range
   (F2 = F1, S1 = -1) — both sides run the same piecewise construction. */
(function(){
'use strict';

function byId(id){ return document.getElementById(id); }
var canvas = byId('pt');
if(!canvas) return;
var stage = byId('pt-stage');
var fallbackEl = byId('pt-fallback');
var sppEl = byId('pt-spp');

var gl = canvas.getContext('webgl2', {antialias:false, alpha:false, depth:false, stencil:false, powerPreference:'high-performance'});
if(!gl){ fallbackEl.hidden = false; return; }
var hasFloat = !!gl.getExtension('EXT_color_buffer_float');

/* ------------------------------------------------ shaders ------------------------------------------------ */
var VS = '#version 300 es\n' +
'void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2));' +
' gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }';

var COMMON =
'precision highp float;\n' +
'precision highp int;\n' +
'const float PI = 3.141592653589793;\n' +
'const vec3 SUND = normalize(vec3(-0.42, 0.62, -0.50));\n' +
'const vec3 SUNC = vec3(3.2, 2.95, 2.55);\n' +
'const vec3 FOGC = vec3(0.110, 0.100, 0.108);\n' +
'uint seed;\n' +
'uint hashU(uint x){ x^=x>>16u; x*=0x7feb352dU; x^=x>>15u; x*=0x846ca68bU; x^=x>>16u; return x; }\n' +
'float rnd(){ seed = seed*747796405u + 2891336453u; uint t=((seed>>((seed>>28u)+4u))^seed)*277803737u; t=(t>>22u)^t; return float(t)*(1.0/4294967296.0); }\n' +
'vec2 diskSample(){ float r=sqrt(rnd()); float a=6.2831853*rnd(); return r*vec2(cos(a),sin(a)); }\n' +
'vec3 sphRand(){ float z=2.0*rnd()-1.0; float a=6.2831853*rnd(); float r=sqrt(max(0.0,1.0-z*z)); return vec3(r*cos(a), r*sin(a), z); }\n' +
'vec3 cosHemi(vec3 n){ float u1=rnd(); float a=6.2831853*rnd(); float r=sqrt(u1);\n' +
'  vec3 t = normalize(abs(n.y)<0.99 ? cross(n, vec3(0,1,0)) : cross(n, vec3(1,0,0)));\n' +
'  vec3 b = cross(n,t);\n' +
'  return normalize(t*(r*cos(a)) + b*(r*sin(a)) + n*sqrt(max(0.0,1.0-u1))); }\n' +
/* scene: floor y=-1, three hero spheres, practicals */
'const vec4 SRED = vec4(-1.12,-0.40, 3.2, 0.60);\n' +
'const vec4 SGLD = vec4( 0.80,-0.08, 6.8, 0.92);\n' +
'const vec4 SBLU = vec4(-2.05, 0.10,12.5, 1.35);\n' +
'const int NL = 14;\n' +
'const vec4 LP[NL] = vec4[NL](\n' +
'  vec4(-4.6, 0.70, 15.0, 0.13), vec4(-3.2, 1.60, 17.0, 0.12),\n' +
'  vec4(-1.6, 0.40, 14.5, 0.10), vec4(-0.2, 1.90, 16.5, 0.13),\n' +
'  vec4( 1.2, 0.80, 15.5, 0.11), vec4( 2.6, 1.40, 18.0, 0.14),\n' +
'  vec4( 4.2, 0.50, 15.8, 0.12), vec4( 5.6, 1.80, 19.0, 0.15),\n' +
'  vec4( 0.4, 2.80, 19.5, 0.15), vec4(-5.8, 2.20, 19.0, 0.15),\n' +
'  vec4( 3.4, 2.60, 20.0, 0.14), vec4(-2.6, 2.90, 20.5, 0.15),\n' +
'  vec4(-0.78, 0.46, 1.55, 0.035), vec4( 0.74, 0.30, 1.42, 0.038));\n' +
'const vec3 LC[NL] = vec3[NL](\n' +
'  vec3(36.0,22.0, 9.0), vec3(38.0,36.0,32.0), vec3(46.0,28.0,11.0), vec3(11.0,28.0,31.0),\n' +
'  vec3(41.0,38.0,34.0), vec3(31.0,19.0, 8.0), vec3(13.0,31.0,34.0), vec3(28.0,17.0, 7.0),\n' +
'  vec3(27.0,26.0,23.0), vec3(10.0,23.0,26.0), vec3(31.0,19.0, 8.0), vec3(25.0,23.0,21.0),\n' +
'  vec3(80.0,50.0,20.0), vec3(25.0,60.0,67.0));\n' +
'float iSphere(vec3 ro, vec3 rd, vec4 s){\n' +
'  vec3 oc = ro - s.xyz; float b = dot(oc, rd); float c = dot(oc,oc) - s.w*s.w;\n' +
'  float h = b*b - c; if(h<0.0) return -1.0; return -b - sqrt(h); }\n' +
'struct Hit { float t; int id; };\n' +
'bool scene(vec3 ro, vec3 rd, float tmin, float tmax, bool withLights, out Hit h){\n' +
'  h.t = tmax; h.id = -1;\n' +
'  if(rd.y < -1e-6){ float t = (-1.0 - ro.y)/rd.y; if(t>tmin && t<h.t){ h.t=t; h.id=0; } }\n' +
'  float t1 = iSphere(ro,rd,SRED); if(t1>tmin && t1<h.t){ h.t=t1; h.id=1; }\n' +
'  float t2 = iSphere(ro,rd,SGLD); if(t2>tmin && t2<h.t){ h.t=t2; h.id=2; }\n' +
'  float t3 = iSphere(ro,rd,SBLU); if(t3>tmin && t3<h.t){ h.t=t3; h.id=3; }\n' +
'  if(withLights){ for(int i=0;i<NL;i++){ float tl = iSphere(ro,rd,LP[i]); if(tl>tmin && tl<h.t){ h.t=tl; h.id=10+i; } } }\n' +
'  return h.id>=0; }\n' +
'vec3 centerOf(int id){ return id==1 ? SRED.xyz : (id==2 ? SGLD.xyz : SBLU.xyz); }\n' +
'vec3 sky(vec3 d){\n' +
'  float h = clamp(d.y, -1.0, 1.0);\n' +
'  vec3 top = vec3(0.030,0.045,0.085); vec3 hor = vec3(0.110,0.100,0.105);\n' +
'  vec3 c = h>0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, vec3(0.052,0.049,0.047), clamp(-h*3.0,0.0,1.0));\n' +
'  c += SUNC * 0.05 * pow(max(dot(d,SUND),0.0), 8.0);\n' +
'  return c; }\n' +
'uniform float uGuides;\n' +
'vec3 floorAlb(vec3 p, float f1, float f2){\n' +
'  float ch = mod(floor(p.x/0.85)+floor(p.z/0.85), 2.0);\n' +
'  vec3 a = mix(vec3(0.185,0.180,0.175), vec3(0.280,0.272,0.262), ch);\n' +
'  if(uGuides>0.5){\n' +
'    float m = smoothstep(0.10,0.045,abs(p.z - f1));\n' +
'    if(f2>f1+1e-3) m += smoothstep(0.10,0.045,abs(p.z - f2));\n' +
'    a = mix(a, vec3(0.85,0.58,0.22), clamp(m,0.0,1.0)*0.6);\n' +
'  }\n' +
'  return a; }\n' +
'vec3 albOf(int id, vec3 p, float f1, float f2){\n' +
'  if(id==0) return floorAlb(p,f1,f2);\n' +
'  if(id==1) return vec3(0.70,0.11,0.09);\n' +
'  if(id==2) return vec3(0.93,0.64,0.22);\n' +
'  return vec3(0.13,0.26,0.68); }\n' +
'float shadowRay(vec3 p, vec3 n){\n' +
'  vec3 d = normalize(SUND + 0.025*sphRand()); Hit h;\n' +
'  return scene(p + n*2e-3, d, 1e-4, 50.0, false, h) ? 0.0 : 1.0; }\n' +
'vec3 ambient(vec3 p, vec3 n){\n' +
'  vec3 d = cosHemi(n); Hit h;\n' +
'  bool occ = scene(p + n*2e-3, d, 1e-4, 4.0, false, h);\n' +
'  vec3 s = sky(d); return occ ? s*0.18 : s; }\n' +
'vec3 shadePoint(int id, vec3 p, vec3 n, vec3 wsh, float f1, float f2){\n' +
'  if(id>=10) return LC[id-10];\n' +
'  vec3 alb = albOf(id, p, f1, f2);\n' +
'  float sh = shadowRay(p, n);\n' +
'  vec3 dif = alb * (SUNC * max(dot(n,SUND),0.0)*sh/PI + ambient(p,n));\n' +
'  vec3 col;\n' +
'  if(id==2){\n' +  /* gold: metallic */
'    float rough = 0.06;\n' +
'    vec3 r = normalize(reflect(wsh, n) + rough*1.2*sphRand());\n' +
'    if(dot(r,n)<0.0) r = normalize(reflect(r, n));\n' +
'    Hit h2; vec3 Lr;\n' +
'    if(scene(p + n*3e-3, r, 1e-4, 60.0, true, h2)){\n' +
'      vec3 p2 = p + r*h2.t;\n' +
'      if(h2.id>=10) Lr = LC[h2.id-10];\n' +
'      else {\n' +
'        vec3 n2 = h2.id==0 ? vec3(0,1,0) : normalize(p2 - centerOf(h2.id));\n' +
'        vec3 a2 = albOf(h2.id, p2, f1, f2);\n' +
'        Lr = a2 * (SUNC*max(dot(n2,SUND),0.0)*shadowRay(p2,n2)/PI + sky(n2)*0.8);\n' +
'      }\n' +
'    } else {\n' +
'      Lr = sky(r) + SUNC * 2.5 * pow(max(dot(r,SUND),0.0), 350.0);\n' +
'    }\n' +
'    float cosv = clamp(dot(-wsh, n), 0.0, 1.0);\n' +
'    vec3 F = alb + (vec3(1.0)-alb)*pow(1.0-cosv, 5.0);\n' +
'    col = F*Lr + dif*0.12;\n' +
'  } else {\n' +
'    col = dif;\n' +
'    if(id==0){ vec3 hv = normalize(SUND - wsh); col += SUNC*0.03*pow(max(dot(n,hv),0.0),48.0)*sh; }\n' +
'  }\n' +
'  float fz = 1.0 - exp(-max(p.z,0.0)*0.020);\n' +
'  return mix(col, FOGC, fz); }\n' +
/* the focus-range camera: three piecewise-linear segments (eqs. 1 & 3) */
'vec3 render(vec2 ndc, float aspect, float ap, float f1, float f2, float s1, float delta){\n' +
'  vec2 lens = ap*0.5*diskSample();\n' +
'  float tanY = 0.30; float tanX = tanY*aspect;\n' +
'  vec3 P1 = vec3(ndc.x*tanX*f1, ndc.y*tanY*f1, f1);\n' +
'  f2 = max(f2, f1);\n' +
'  bool deg = (f2 - f1) < 1e-3;\n' +
'  vec3 ro = vec3(0.0), rd = vec3(0,0,1);\n' +
'  Hit h; h.id=-1; int segHit = -1; vec3 hp = vec3(0.0);\n' +
'  for(int i=0;i<3;i++){\n' +
'    float zEnd;\n' +
'    if(i==0){ ro = vec3(lens, 0.0); rd = normalize(P1 - ro); zEnd = f1; }\n' +
'    else if(i==1){ if(deg) continue; ro = P1; rd = normalize(vec3(P1.xy/f1, 1.0)); zEnd = f2; }\n' +
'    else { ro = P1*(f2/f1); rd = normalize(vec3((P1.xy + s1*lens)/f1, 1.0)); zEnd = 1e5; }\n' +
'    float tmax = (zEnd - ro.z)/rd.z;\n' +
'    Hit hh;\n' +
'    if(scene(ro, rd, 1e-4, tmax, true, hh)){ h = hh; segHit = i; hp = ro + rd*hh.t; break; }\n' +
'  }\n' +
'  if(segHit<0) return sky(rd);\n' +
'  if(h.id>=10) return LC[h.id-10];\n' +
'  vec3 n = h.id==0 ? vec3(0,1,0) : normalize(hp - centerOf(h.id));\n' +
'  vec3 wsh = rd;\n' +
'  if(delta>0.0 && !deg && segHit<2){\n' +  /* eq. 3: smoothed shading ray */
'    float dh = min(delta, min(f1, f2-f1));\n' +
'    float Fn = segHit==0 ? f1 : f2;\n' +
'    float Si = segHit==0 ? 1.0 : s1;\n' +
'    float ts = max(0.0, 1.0 - (Fn - hp.z)/dh);\n' +
'    if(ts>0.0) wsh = normalize(vec3(rd.xy/rd.z + ts*Si*lens/f1, 1.0));\n' +
'  }\n' +
'  return shadePoint(h.id, hp, n, wsh, f1, f2); }\n' +
'vec3 aces(vec3 x){ return clamp(x*(2.51*x+0.03)/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }\n';

var FS_ACCUM = '#version 300 es\n' + COMMON +
'uniform vec2 uHalf;\n' +
'uniform int uFrame;\n' +
'uniform float uApA, uFA, uApB, uF1, uF2, uS1, uDelta;\n' +
'uniform sampler2D uPrev;\n' +
'out vec4 o;\n' +
'void main(){\n' +
'  ivec2 fc = ivec2(gl_FragCoord.xy);\n' +
'  bool isB = gl_FragCoord.x >= uHalf.x;\n' +
'  float px = isB ? gl_FragCoord.x - uHalf.x : gl_FragCoord.x;\n' +
'  seed = hashU(uint(fc.x)*1973u + uint(fc.y)*9277u + uint(uFrame)*26699u) | 1u;\n' +
'  vec2 ndc = ((vec2(px, gl_FragCoord.y) + vec2(rnd(), rnd())) / uHalf)*2.0 - 1.0;\n' +
'  float aspect = uHalf.x/uHalf.y;\n' +
'  vec3 c = isB ? render(ndc, aspect, uApB, uF1, uF2, uS1, uDelta)\n' +
'               : render(ndc, aspect, uApA, uFA, uFA, -1.0, 0.0);\n' +
'  vec3 prev = uFrame==0 ? vec3(0.0) : texelFetch(uPrev, fc, 0).rgb;\n' +
'  o = vec4(prev + c, 1.0);\n' +
'}\n';

var FS_DIRECT = '#version 300 es\n' + COMMON +
'uniform vec2 uHalf;\n' +      /* here: canvas resolution */
'uniform int uFrame;\n' +
'uniform float uApA, uFA, uApB, uF1, uF2, uS1, uDelta, uDivider;\n' +
'out vec4 o;\n' +
'void main(){\n' +
'  ivec2 fc = ivec2(gl_FragCoord.xy);\n' +
'  bool isB = gl_FragCoord.x >= uDivider*uHalf.x;\n' +
'  float aspect = uHalf.x/uHalf.y;\n' +
'  vec3 acc = vec3(0.0);\n' +
'  for(int s=0; s<12; s++){\n' +
'    seed = hashU(uint(fc.x)*1973u + uint(fc.y)*9277u + uint(s)*26699u + 17u) | 1u;\n' +
'    vec2 ndc = ((vec2(fc) + vec2(rnd(), rnd())) / uHalf)*2.0 - 1.0;\n' +
'    acc += isB ? render(ndc, aspect, uApB, uF1, uF2, uS1, uDelta)\n' +
'               : render(ndc, aspect, uApA, uFA, uFA, -1.0, 0.0);\n' +
'  }\n' +
'  vec3 c = pow(aces(acc/12.0*1.25), vec3(1.0/2.2));\n' +
'  o = vec4(c, 1.0);\n' +
'}\n';

var FS_SHOW = '#version 300 es\nprecision highp float;\n' +
'uniform sampler2D uAcc;\n' +
'uniform float uCount, uDivider;\n' +
'uniform vec2 uRes;\n' +
'out vec4 o;\n' +
'vec3 aces2(vec3 x){ return clamp(x*(2.51*x+0.03)/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }\n' +
'void main(){\n' +
'  vec2 uv = gl_FragCoord.xy / uRes;\n' +
'  float side = uv.x < uDivider ? 0.0 : 0.5;\n' +
'  vec3 c = texture(uAcc, vec2(uv.x*0.5 + side, uv.y)).rgb / max(uCount, 1.0);\n' +
'  c = pow(aces2(c*1.25), vec3(1.0/2.2));\n' +
'  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);\n' +
'  o = vec4(c + (dn-0.5)/255.0, 1.0);\n' +
'}\n';

function compile(type, src){
  var s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
  }
  return s;
}
function program(fsSrc){
  var p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
  return p;
}

var progAccum = null, progShow = null, progDirect = null;
try{
  if(hasFloat){ progAccum = program(FS_ACCUM); progShow = program(FS_SHOW); }
  else { progDirect = program(FS_DIRECT); }
}catch(err){
  fallbackEl.hidden = false;
  if(sppEl) sppEl.hidden = true;
  return;
}
function uni(p, n){ return gl.getUniformLocation(p, n); }
var UA = progAccum ? {
  half: uni(progAccum,'uHalf'), frame: uni(progAccum,'uFrame'), prev: uni(progAccum,'uPrev'),
  apA: uni(progAccum,'uApA'), fA: uni(progAccum,'uFA'), apB: uni(progAccum,'uApB'),
  f1: uni(progAccum,'uF1'), f2: uni(progAccum,'uF2'), s1: uni(progAccum,'uS1'),
  delta: uni(progAccum,'uDelta'), guides: uni(progAccum,'uGuides')
} : null;
var US = progShow ? {
  acc: uni(progShow,'uAcc'), count: uni(progShow,'uCount'),
  divider: uni(progShow,'uDivider'), res: uni(progShow,'uRes')
} : null;
var UD = progDirect ? {
  half: uni(progDirect,'uHalf'), frame: uni(progDirect,'uFrame'),
  apA: uni(progDirect,'uApA'), fA: uni(progDirect,'uFA'), apB: uni(progDirect,'uApB'),
  f1: uni(progDirect,'uF1'), f2: uni(progDirect,'uF2'), s1: uni(progDirect,'uS1'),
  delta: uni(progDirect,'uDelta'), divider: uni(progDirect,'uDivider'), guides: uni(progDirect,'uGuides')
} : null;

/* ------------------------------------------------ state ------------------------------------------------ */
var P = { apA: 0.6, fA: 6.8, apB: 0.6, f1: 2.6, f2: 7.6, s1: -1.2, smooth: true, delta: 0.5, guides: false };
var divider = 0.5;
var frame = 0, MAXF = 2600;
var W = 0, H = 0;
var texs = [null, null], fbos = [null, null], src = 0;
var visible = true, needDirect = true;

function allocTargets(){
  if(!hasFloat) return;
  for(var i = 0; i < 2; i++){
    if(texs[i]) gl.deleteTexture(texs[i]);
    if(fbos[i]) gl.deleteFramebuffer(fbos[i]);
    texs[i] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texs[i]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W * 2, H, 0, gl.RGBA, gl.FLOAT, null);
    fbos[i] = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[i]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texs[i], 0);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function resize(){
  var cssW = canvas.clientWidth || 800;
  var cssH = canvas.clientHeight || Math.round(cssW * 9 / 16);
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var w = Math.min(1280, Math.round(cssW * dpr));
  var h = Math.round(w * cssH / cssW);
  if(w === W && h === H) return;
  W = w; H = h;
  canvas.width = W; canvas.height = H;
  allocTargets();
  reset();
}
function reset(){
  frame = 0; needDirect = true;
  kick();
}

/* ------------------------------------------------ render loop ------------------------------------------------ */
var rafId = 0;
function kick(){ if(!rafId) rafId = requestAnimationFrame(tick); }
function tick(){
  rafId = 0;
  if(!visible) return;
  if(hasFloat){
    if(frame < MAXF){
      var dst = 1 - src;
      gl.useProgram(progAccum);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[dst]);
      gl.viewport(0, 0, W * 2, H);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texs[src]);
      gl.uniform1i(UA.prev, 0);
      gl.uniform2f(UA.half, W, H);
      gl.uniform1i(UA.frame, frame);
      gl.uniform1f(UA.apA, P.apA); gl.uniform1f(UA.fA, P.fA);
      gl.uniform1f(UA.apB, P.apB); gl.uniform1f(UA.f1, P.f1);
      gl.uniform1f(UA.f2, Math.max(P.f2, P.f1)); gl.uniform1f(UA.s1, P.s1);
      gl.uniform1f(UA.delta, P.smooth ? P.delta : 0.0);
      gl.uniform1f(UA.guides, P.guides ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = dst;
      frame++;
    }
    gl.useProgram(progShow);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texs[src]);
    gl.uniform1i(US.acc, 0);
    gl.uniform1f(US.count, Math.max(frame, 1));
    gl.uniform1f(US.divider, divider);
    gl.uniform2f(US.res, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if(sppEl && (frame % 10 === 0 || frame >= MAXF)){
      sppEl.textContent = frame >= MAXF ? (frame + ' spp · converged') : (frame + ' spp');
    }
    if(frame < MAXF) kick();
  } else {
    if(!needDirect) return;
    needDirect = false;
    gl.useProgram(progDirect);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.uniform2f(UD.half, W, H);
    gl.uniform1i(UD.frame, 0);
    gl.uniform1f(UD.apA, P.apA); gl.uniform1f(UD.fA, P.fA);
    gl.uniform1f(UD.apB, P.apB); gl.uniform1f(UD.f1, P.f1);
    gl.uniform1f(UD.f2, Math.max(P.f2, P.f1)); gl.uniform1f(UD.s1, P.s1);
    gl.uniform1f(UD.delta, P.smooth ? P.delta : 0.0);
    gl.uniform1f(UD.divider, divider);
    gl.uniform1f(UD.guides, P.guides ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if(sppEl) sppEl.textContent = '12 spp · static (no float buffers)';
  }
}

/* only burn GPU while on screen */
if(window.IntersectionObserver){
  new IntersectionObserver(function(entries){
    visible = entries[0].isIntersecting;
    if(visible) kick();
  }, {threshold: 0.02}).observe(stage);
}
document.addEventListener('visibilitychange', function(){
  if(document.hidden){ visible = false; }
  else { visible = true; kick(); }
});
canvas.addEventListener('webglcontextlost', function(e){
  e.preventDefault();
  fallbackEl.hidden = false;
});

/* ------------------------------------------------ divider ------------------------------------------------ */
var divEl = byId('pt-divider');
var tagA = byId('pt-tag-a'), tagB = byId('pt-tag-b');
function placeDivider(){
  divEl.style.left = (divider * 100) + '%';
  divEl.setAttribute('aria-valuenow', String(Math.round(divider * 100)));
  tagA.style.opacity = divider < 0.14 ? '0' : '1';
  tagB.style.opacity = divider > 0.86 ? '0' : '1';
  if(hasFloat){ kick(); } else { needDirect = true; kick(); }
}
divEl.addEventListener('pointerdown', function(e){
  divEl.setPointerCapture(e.pointerId);
  e.preventDefault();
});
divEl.addEventListener('pointermove', function(e){
  if(!divEl.hasPointerCapture || !divEl.hasPointerCapture(e.pointerId)) return;
  var r = stage.getBoundingClientRect();
  divider = Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width));
  placeDivider();
});
divEl.addEventListener('keydown', function(e){
  if(e.key === 'ArrowLeft'){ divider = Math.max(0.02, divider - 0.05); placeDivider(); e.preventDefault(); }
  if(e.key === 'ArrowRight'){ divider = Math.min(0.98, divider + 0.05); placeDivider(); e.preventDefault(); }
});

/* ------------------------------------------------ controls ------------------------------------------------ */
function fmt(v, dp){ return (v < 0 ? '−' : '') + Math.abs(v).toFixed(dp); }
var sliders = [
  {id: 'p-apA', out: 'po-apA', key: 'apA', dp: 2},
  {id: 'p-fA',  out: 'po-fA',  key: 'fA',  dp: 1},
  {id: 'p-apB', out: 'po-apB', key: 'apB', dp: 2},
  {id: 'p-f1',  out: 'po-f1',  key: 'f1',  dp: 1},
  {id: 'p-f2',  out: 'po-f2',  key: 'f2',  dp: 1},
  {id: 'p-s1',  out: 'po-s1',  key: 's1',  dp: 2},
  {id: 'p-delta', out: 'po-delta', key: 'delta', dp: 2}
];
function syncControls(){
  for(var i = 0; i < sliders.length; i++){
    var s = sliders[i];
    byId(s.id).value = P[s.key];
    byId(s.out).textContent = fmt(P[s.key], s.dp);
  }
  byId('p-smooth').checked = P.smooth;
  byId('p-guides').checked = P.guides;
}
for(var i = 0; i < sliders.length; i++){
  (function(s){
    byId(s.id).addEventListener('input', function(){
      P[s.key] = parseFloat(this.value);
      if(s.key === 'f1' && P.f2 < P.f1) P.f2 = P.f1;
      if(s.key === 'f2' && P.f1 > P.f2) P.f1 = P.f2;
      syncControls(); clearPressed(); reset();
    });
  })(sliders[i]);
}
byId('p-smooth').addEventListener('change', function(){ P.smooth = this.checked; reset(); });
byId('p-guides').addEventListener('change', function(){ P.guides = this.checked; reset(); });

/* ------------------------------------------------ presets ------------------------------------------------ */
var CAP = {
  p1: '<b>Fig. 1, b vs c.</b> A: wide open on the gold character — the red one blurs out. B: the range covers both and S₁ still melts the background.',
  p2: '<b>Fig. 1, b vs d.</b> A: stopped down — both sharp, but the bokeh dies. B: keeps both, trades nothing.',
  p3: '<b>Fig. 3.</b> <i>F</i>₁ slices the glossy sphere. Toggle <em>smoothed shading rays</em>: off → a seam across the reflection at the plane; on → eq. 3 blends it over δ.',
  p4: '<b>The S₁ dial.</b> A tight range on the gold character, S₁ = −1.8: background bokeh far beyond any thin lens at this aperture.'
};
var PRESETS = {
  p1: {apA: 0.60, fA: 6.8, apB: 0.60, f1: 2.6, f2: 7.6, s1: -1.2, smooth: true,  delta: 0.5, guides: false, div: 0.5},
  p2: {apA: 0.10, fA: 4.6, apB: 0.60, f1: 2.6, f2: 7.6, s1: -1.2, smooth: true,  delta: 0.5, guides: false, div: 0.5},
  p3: {apA: 0.85, fA: 6.8, apB: 0.85, f1: 6.8, f2: 10.5, s1: -1.0, smooth: false, delta: 0.5, guides: true,  div: 0.1},
  p4: {apA: 0.90, fA: 6.4, apB: 0.90, f1: 5.8, f2: 7.6, s1: -1.8, smooth: true,  delta: 0.5, guides: false, div: 0.08}
};
var presetsEl = byId('presets');
var capEl = byId('pt-caption');
function clearPressed(){
  var bs = presetsEl.querySelectorAll('button');
  for(var j = 0; j < bs.length; j++) bs[j].setAttribute('aria-pressed', 'false');
}
function applyPreset(name){
  var pr = PRESETS[name];
  for(var k in pr){ if(k !== 'div') P[k] = pr[k]; }
  divider = pr.div;
  syncControls(); placeDivider();
  capEl.innerHTML = CAP[name];
  var bs = presetsEl.querySelectorAll('button');
  for(var j = 0; j < bs.length; j++){
    bs[j].setAttribute('aria-pressed', bs[j].getAttribute('data-preset') === name ? 'true' : 'false');
  }
  reset();
}
presetsEl.addEventListener('click', function(e){
  var b = e.target.closest('button[data-preset]');
  if(b) applyPreset(b.getAttribute('data-preset'));
});

/* ------------------------------------------------ init ------------------------------------------------ */
if(window.ResizeObserver){
  new ResizeObserver(function(){ resize(); }).observe(stage);
}else{
  window.addEventListener('resize', resize);
}
resize();
applyPreset('p1');
})();
