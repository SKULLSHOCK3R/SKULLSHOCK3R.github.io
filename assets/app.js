/* Homepage (rebuilt 2026-10-26 on three.js 0.186.1, vendored in assets/vendor/three): one fullscreen canvas on a
   scroll-driven timeline with snap points at the opening (0), the globe (1), the parted globe (2), the cores (3) and
   the ending (4); post-processing masks every change of scene. Modules: opening.js (storm, figures), globe.js (the
   instanced block world), cores.js (the three filament cores), ending.js (the particle chamber), post.js (bloom, grade),
   sound.js (synthesised sound, off until the visitor turns it on).
   The page text is ordinary HTML; this file positions the HUD items over the scene, runs the click sheets, the
   carousel and the loop back to the top. Reduced motion or no WebGL2: the html element gets class "static" and the
   stylesheet lays the same text out as a plain page with a still picture. No network calls beyond our own files. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPost } from './post.js?v=4';
import { createOpening } from './opening.js?v=36';
import { createGlobe } from './globe.js?v=41';
import { createCores, mergeOf } from './cores.js?v=10';
import { createEnding, ITEMS } from './ending.js?v=36';
import { createRingGate } from './ringgate.js?v=13';
import { stillSvg } from './figures.js?v=15';
import { createSound } from './sound.js?v=11';
import { createPlate } from './plate.js?v=1';

const html = document.documentElement;
html.setAttribute('data-app', '1');   // the module ran: index.html's watchdog leaves the scene layout alone
const PAGES = 4;
const reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const peak = (x, c, w) => { const t = clamp(1 - Math.abs(x - c) / w, 0, 1); return t * t * (3 - 2 * t); };

/* ---- shared page bits (both modes) ---- */
function wireCopy() {
  const b = $('.copy');
  if (!b) return;
  const note = $('.copied');
  let timer = null;
  b.hidden = false;
  const shown = (msg) => { note.textContent = msg; clearTimeout(timer); timer = setTimeout(() => { note.textContent = ''; }, 2500); };
  const fallback = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    shown(ok ? 'Copied' : 'Copy failed');
  };
  b.addEventListener('click', () => {
    const text = b.getAttribute('data-copy');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => shown('Copied'), () => fallback(text));
    else fallback(text);
  });
}

function goStatic(reason) {
  html.classList.remove('gl');
  html.classList.add('static');
  const still = $('.still');
  if (still && !still.firstChild) still.innerHTML = stillSvg();
  if (reason && window.console) console.info('static page:', reason);
}

/* ---- the carousel (DOM side) ---- */
function carousel(onSwitch) {
  const current = $('.carousel .current'), prev = $('.carousel .prev'), next = $('.carousel .next');
  let idx = 0;
  const n = ITEMS.length;
  function labels() {
    current.textContent = ITEMS[idx].name;
    current.href = ITEMS[idx].href;
    $('.side-name', prev).textContent = ITEMS[(idx + n - 1) % n].name;
    $('.side-name', next).textContent = ITEMS[(idx + 1) % n].name;
    prev.setAttribute('aria-label', 'Show ' + ITEMS[(idx + n - 1) % n].name);
    next.setAttribute('aria-label', 'Show ' + ITEMS[(idx + 1) % n].name);
  }
  function go(d, instant) { idx = (idx + d + n) % n; labels(); if (onSwitch) onSwitch(idx, instant); }
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  $('.carousel').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });
  labels();
  return { go };
}

async function main() {
  wireCopy();
  if (reduce.matches) return goStatic('reduced motion');
  if (new URLSearchParams(location.search).has('static')) return goStatic('forced by ?static');
  const canvas = $('#stage');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
  } catch (e) { return goStatic('no WebGL: ' + (e && e.message)); }
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); return goStatic('no WebGL2'); }
  html.classList.add('gl');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = true;

  const FOV = 36;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.set(0, 0, 6);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();   // HUD projection runs before the first render
  const scene = new THREE.Scene();
  const ctx = {
    camera, phone: (innerWidth || screen.width) < 760, aspect: 1,
    halfH(z) { return (camera.position.z - z) * Math.tan(FOV * Math.PI / 360); },
    halfW(z) { return this.halfH(z) * this.aspect; }
  };
  // lights shared by the globe (the chamber brings its own)
  const hemi = new THREE.HemisphereLight(0x5a6f9e, 0x070a12, 0.7);
  const key = new THREE.DirectionalLight(0xcfe0ff, 2.4);
  key.position.set(-2.5, 3.2, 4);
  const flashLight = new THREE.DirectionalLight(0xc89bff, 0);   // purple lightning (Robin, 2026-10-27)
  flashLight.position.set(1, 3, 2);
  scene.add(hemi, key, flashLight);

  const post = createPost(renderer, scene, camera);
  post.grade.uFade.value = 0;
  if (new URLSearchParams(location.search).has('fps')) window.__post = post;   // checking aid, as window.__plate
  // the preloader (Robin, 2026-10-28, after igloo.inc's loading screen): every model and texture goes through three's
  // default loading manager, so its count drives the percentage; the cover lifts once they are all in and the first
  // frames are drawn, so nothing pops in under the visitor
  const cover = $('#loader'), pct = cover && $('.pct', cover);
  // The baked opening (local preview, Robin 2026-11-11: "it's stuck on 99% for so long ... make it so it linearly
  // rises and doesnt get stuck at 99%"): its figures are most of the wait and were not counted at all, so the count
  // stood at 99 while they came in. They are counted in bytes as they land (ctx.loadBytes, below: baked.js is told
  // the whole from bake_pack.py's list, and reports each piece): the scene's models and textures are the first part
  // of the bar, those bytes the rest (BYTES_SHARE: about their share of the wait: on this PC the models are in after
  // 0.4 s and the figures take the seconds after).
  const BYTES_SHARE = 0.9, urlQ = new URLSearchParams(location.search);
  const load = { loaded: 0, total: 0, shown: 0, lastAt: performance.now(), bytes: 0, bytesTotal: 0,
    byBytes: (urlQ.get('mode') || 'baked') === 'baked' && !urlQ.has('noplate') };
  let lifted = false;   // the manifesto waits for the cover to lift
  const mgr = THREE.DefaultLoadingManager;
  const showPct = () => {
    const items = load.total ? load.loaded / load.total : 0;
    const p = Math.floor(100 * (load.byBytes ? (1 - BYTES_SHARE) * items + BYTES_SHARE * (load.bytesTotal ? Math.min(1, load.bytes / load.bytesTotal) : 0) : items));
    load.shown = Math.max(load.shown, Math.min(99, p));
    if (pct) pct.textContent = String(load.shown);
    if (cover) cover.style.setProperty('--p', (load.shown / 100).toFixed(2));
  };
  const seen = () => { load.lastAt = performance.now(); };
  mgr.onStart = (u, l, t) => { load.loaded = l; load.total = t; seen(); showPct(); };
  mgr.onProgress = (u, l, t) => { load.loaded = l; load.total = t; seen(); showPct(); };
  mgr.onError = () => { seen(); };   // a missing texture never holds the cover
  const loader = new GLTFLoader();
  // a load that never finishes must not hold the cover forever (review, 2026-10-28): if the scene is still not built
  // after 20 s, fall back to the plain page, which hides the cover
  let gaveUp = false;
  const stall = setTimeout(() => { gaveUp = true; renderer.dispose(); goStatic('scene still loading after 20 s'); }, 20000);
  let opening, globe, cores, ending, gate;
  try {
    [opening, globe, cores, ending, gate] = await Promise.all([createOpening(ctx), createGlobe(ctx, loader), createCores(ctx), createEnding(ctx, loader, renderer), createRingGate(ctx, 0xffb547)]);
    clearTimeout(stall);
    if (gaveUp) return;
  } catch (e) {
    clearTimeout(stall);
    if (gaveUp) return;
    if (window.console) console.error('scene failed to build', e);
    renderer.dispose();
    return goStatic('scene build failed');
  }
  scene.add(opening.group, globe.group, cores.group, ending.group, gate.group);
  // the ray-traced plate (plate.js; local preview 2026-11-11); ?noplate shows the page as it was
  let plate = null;
  if (!new URLSearchParams(location.search).has('noplate')) {
    ctx.renderer = renderer;      // baked mode draws its own frame each frame (baked.js)
    // the loading bar's bytes: expect(the whole), got(each piece as it lands)
    ctx.loadBytes = { expect: (n) => { load.bytesTotal = n; showPct(); }, got: (n) => { load.bytes += n; seen(); showPct(); } };
    try { plate = await createPlate(ctx); ctx.plate = plate; scene.add(plate.mesh, plate.occluder); if (window.console) console.info('ray-traced plate on'); }
    catch (e) { load.byBytes = false; showPct(); if (window.console) console.info('ray-traced plate not used:', e && e.message); }
  }
  scene.fog = new THREE.FogExp2(0x04060b, 0.05);   // only the chamber floor and pedestal use fog (other materials opt out)

  /* ---- DOM: layers, HUD, sheets, carousel ---- */
  const layers = { open: $('.layer-open'), globe: $('.layer-globe'), cores: $('.layer-cores'), end: $('.layer-end') };
  const spacer = $('.spacer');
  const hudLines = $('#hudlines');
  // the labels' leader lines on a 2D canvas over the scene (2026-11-12): the SVG they were drawn in, its lines moved
  // every frame, was repainted whole each frame at the screen's full size, and on the cores page that alone dropped the
  // page from 160 to 135 fps (33 missed frames in 2.5 s; none with the lines hidden). The same colour, width and opacity
  // drawn inside the WebGL canvas, after the post-processing (no layer at all over the canvas: any full-screen layer
  // over it, the SVG or a 2D canvas, made the browser composite the whole screen each frame; on the cores page that held
  // the page at 135 fps where the GPU needed 3 ms)
  hudLines.style.display = 'none';
  const hudList = [];
  const newLine = () => { const l = { x1: 0, y1: 0, x2: 0, y2: 0, a: 0 }; hudList.push(l); return l; };
  let hudScene = null, hudCam = null, hudPos = null, hudCol = null, hudGeo = null;
  const hudRGB = new THREE.Color().setStyle('rgb(190, 210, 255)');
  function drawHudLines() {
    const n = hudList.length;
    if (!hudScene) {
      hudGeo = new THREE.BufferGeometry();
      hudPos = new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 6), 3).setUsage(THREE.DynamicDrawUsage);
      hudCol = new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 8), 4).setUsage(THREE.DynamicDrawUsage);
      hudGeo.setAttribute('position', hudPos); hudGeo.setAttribute('color', hudCol);
      const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const seg = new THREE.LineSegments(hudGeo, m); seg.frustumCulled = false;
      hudScene = new THREE.Scene(); hudScene.add(seg);
      hudCam = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
    }
    let any = false;
    for (let i = 0; i < n; i++) {
      const l = hudList[i], a = l.a > 0.001 ? l.a * 0.75 : 0;
      if (a) any = true;
      hudPos.setXYZ(i * 2, l.x1, l.y1, 0); hudPos.setXYZ(i * 2 + 1, l.x2, l.y2, 0);
      hudCol.setXYZW(i * 2, hudRGB.r, hudRGB.g, hudRGB.b, a); hudCol.setXYZW(i * 2 + 1, hudRGB.r, hudRGB.g, hudRGB.b, a);
    }
    if (!any) return false;
    hudPos.needsUpdate = hudCol.needsUpdate = true;
    if (hudCam.right !== W || hudCam.bottom !== H) { hudCam.right = W; hudCam.bottom = H; hudCam.updateProjectionMatrix(); }
    return true;
  }
  function renderHudLines() {
    if (!drawHudLines()) return;
    const ac = renderer.autoClear;
    renderer.autoClear = false; renderer.setRenderTarget(null);
    renderer.render(hudScene, hudCam);
    renderer.autoClear = ac;
  }
  const globeTags = globe.labels.map((L) => {
    const li = document.createElement('li');
    li.className = 'tag' + (L.gold ? ' gold' : '');
    li.textContent = L.name;
    $('.hud-globe').appendChild(li);
    return { el: li, line: newLine() };
  });
  const coreItems = $$('.hud-cores .hud-item').map((el) => ({ el, line: newLine(), key: el.getAttribute('data-item') }));
  const sheet = $('#sheet'), sheetBody = $('.sheet-body', sheet), sheetClose = $('.sheet-close', sheet);
  let sheetOpenFrom = null, smearPulse = 0;
  function openSheet(key, from) {
    const src = $('#src-' + key);
    if (!src) return;
    sheetBody.innerHTML = src.innerHTML;
    sheet.setAttribute('data-key', key);
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('open'));
    sheetOpenFrom = from || null;
    smearPulse = 1;
    sound.sheet(true, key);
    setTimeout(() => sheetClose.focus(), 30);
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove('open');
    smearPulse = 0.7;
    sound.sheet(false);
    const from = sheetOpenFrom;
    setTimeout(() => { sheet.hidden = true; if (from) from.focus(); }, 420);
    sheetOpenFrom = null;
  }
  coreItems.forEach((it) => {
    it.el.addEventListener('click', () => openSheet(it.key, it.el));
    const ci = ['jarvis', 'ev', 'homer'].indexOf(it.key);
    if (ci >= 0) {
      it.el.addEventListener('focus', () => { cores.setHot(ci, true); sound.hover(ci); });
      it.el.addEventListener('blur', () => { cores.setHot(ci, false); sound.unhover(ci); });
      it.el.addEventListener('pointerenter', () => { cores.setHot(ci, true); sound.hover(ci); });
      it.el.addEventListener('pointerleave', () => { cores.setHot(ci, false); sound.unhover(ci); });
    }
  });
  sheetClose.addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  const sound = createSound($('.brand .sound'));
  const car = carousel((i, instant) => { ending.switchTo(i, instant); if (!instant) sound.shape(); });

  /* ---- scroll timeline ---- */
  const STROLL = 2.2;
  let W = 0, H = 0, PH = innerHeight * STROLL, dpr = 1;
  // frame-rate governor (Robin, 2026-10-26: "ALL ON 120"): the frame loop runs at the display's own rate (120 Hz on a
  // 120 Hz screen); when frames take longer than the display's interval, render at a lower pixel ratio, and raise it
  // again after a few seconds with headroom
  const perf = { deltas: [], interval: 0, avg: 0, q: 1, acc: 0, good: 0 };
  // checking aids (2026-11-12): ?q=1 holds the drawing at full resolution (the governor does nothing); ?gpu times the
  // GPU's work per frame, the baked figures' draw (in plate.update) and the rest, into window.__gpu
  const holdQ = new URLSearchParams(location.search).get('q');
  const gpuT = (() => {
    if (!new URLSearchParams(location.search).has('gpu')) return null;
    const gl = ctx.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    const open = [], out = { plate: [], post: [] };
    window.__gpu = out;
    return {
      begin() { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); return q; },
      end(q, kind) { gl.endQuery(ext.TIME_ELAPSED_EXT); open.push([q, kind]); },
      poll() {
        for (let i = open.length - 1; i >= 0; i--) {
          const [q, kind] = open[i];
          if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) {
            out[kind].push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); open.splice(i, 1);
            if (out[kind].length > 600) out[kind].shift();
          }
        }
      }
    };
  })();
  if (holdQ) perf.q = Math.min(1, Math.max(0.3, parseFloat(holdQ) || 1));
  function governor(ms) {
    if (holdQ) return;
    if (!(ms > 0 && ms < 100)) return;              // a hidden tab or a stall says nothing about the frame cost
    if (!perf.interval) {
      perf.deltas.push(ms);
      // the display's interval is the shortest steady gap, not the median: a phone's first frames, drawn while the
      // models load, ran slow and read a 120 Hz screen as 60 (2026-10-29)
      if (perf.deltas.length >= 90) perf.interval = perf.deltas.sort((a, b) => a - b)[9];
      return;
    }
    perf.avg = perf.avg ? perf.avg * 0.92 + ms * 0.08 : ms;
    if ((perf.acc += ms) < 1000) return;
    perf.acc = 0;
    let q = perf.q;
    // phones hold the display's own rate too (Robin, 2026-10-29: "Is the motion set to 120 fps for the phone animations
    // as well?"); until then they settled for 60 on a 120 Hz screen. Sharpness is kept by the floor below
    const budget = perf.interval;
    // floor: 0.7 of 2x on phones (about 1.4x, still sharp), 0.5 elsewhere as before, so a weak GPU keeps its room
    // (2026-11-12, igloo.inc's way: theirs steps in below 30 fps): only below 60 fps, not at a frame or two over the
    // display's interval. Stepping the resolution down and up again every second at 135 fps on the cores page read as
    // tearing and glitches (Robin: "the screen tears and glitchs ... as i ... scroll through the final rings")
    if (perf.avg > Math.max(budget * 1.12, 1000 / 60)) { q = Math.max(ctx.phone ? 0.7 : 0.5, q - 0.1); perf.good = 0; }
    else if (perf.avg < budget * 1.03 && q < 1 && ++perf.good >= 4) { q = Math.min(1, q + 0.05); perf.good = 0; }
    if (q !== perf.q) { perf.q = q; layout(); }
  }
  let cur = 0, prevCur = 0, vel = 0, lastScrollAt = 0, touching = false, programmatic = 0, overscroll = 0, loopT = -1;
  // scrolling up from the opening wraps round to the ending, as scrolling past the ending wraps to the opening
  // (Robin, 2026-10-26: "the scroll up from the home spot isn't working")
  let underscroll = 0, loopTo = 0;
  function layout() {
    W = innerWidth; H = innerHeight;
    // phones render at up to 2x too (Robin, 2026-10-28, comparing with igloo.inc on a phone: at 1.5x, and the
    // governor's floor below that, the scene drew at well under the screen's own resolution)
    // the phone and desktop sets are rendered for their own screen shape: crossing the line after the set has loaded
    // (a window or emulator resized) loads the page again with the set for the new shape, rather than stretching
    // the phone's portrait frame over a wide screen (Robin, 2026-11-12: "i can only see luffy's feet")
    if (W > 1 && ctx.phoneSet !== undefined && (W < 760) !== ctx.phoneSet) { location.reload(); return; }
    if (W > 1) ctx.phone = W < 760;
    // phones at 1.5x at most, as igloo.inc draws them (2026-11-12: its code caps a pixel ratio over 2 at 1.5); desktops
    // at their own up to 2x
    dpr = Math.min(devicePixelRatio || 1, ctx.phone ? 1.5 : 2) * perf.q;
    ctx.aspect = W / H;
    camera.aspect = ctx.aspect;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    post.setSize(W, H, dpr);
    hudLines.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  }
  // touch screens scroll a virtual page, as igloo.inc's phone site does (Robin, 2026-10-29: "a very slow scroll exactly
  // the same as ... the igloo phone site", and a pull down at the landing kept reloading the page): the document itself
  // never scrolls there (html.touchscroll: overflow hidden, touch-action none), so the browser has no pull-to-refresh or
  // fling to run; a finger moves the page at TOUCH_GAIN of its travel and a flick carries on briefly, then settles
  const TOUCH_GAIN = 0.5, FLING = 0.45, FLING_DECAY = 4;
  const vs = { on: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches), y: 0, goal: -1, v: 0 };
  if (vs.on) html.classList.add('touchscroll');
  const pageY = () => (vs.on ? vs.y : scrollY);
  function setPageY(y) {
    if (vs.on) { vs.y = clamp(y, 0, maxScroll()); vs.goal = -1; vs.v = 0; } else scrollTo({ top: y, behavior: 'instant' });
  }
  function pageLayout() {
    // each scene takes STROLL screens of scrolling (Robin, 2026-10-26: "we fly through the animation, more like a
    // slow stroll")
    const oldPH = PH;
    PH = innerHeight * STROLL;
    spacer.style.height = ((PAGES + 1) * PH) + 'px';
    if (vs.on && oldPH > 1) vs.y *= PH / oldPH;   // a turned phone keeps its place in the story
  }
  layout();
  pageLayout();
  let lastW = W, lastPH = PH;
  // ?t=<page> jumps the timeline (0 opening, 1 globe, 2 parted, 3 cores, 4 ending) for screenshots and tests
  const params = new URLSearchParams(location.search);
  const debugT = params.has('t') ? clamp(parseFloat(params.get('t')) || 0, 0, PAGES) : null;
  // always open at the landing (Robin, 2026-10-26: a reload restored the last scroll and opened mid-globe)
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (debugT === null) scrollTo(0, 0);
  let lastDir = 1, lastY = pageY();
  addEventListener('scroll', () => {
    lastScrollAt = performance.now();
    if (!programmatic && scrollY !== lastY) lastDir = scrollY > lastY ? 1 : -1;
    lastY = scrollY;
  }, { passive: true });
  addEventListener('wheel', (e) => {
    programmatic = 0;
    if (e.deltaY) lastDir = e.deltaY > 0 ? 1 : -1;
    if (pageY() >= maxScroll() - 2 && e.deltaY > 0) overscroll += e.deltaY;
    if (pageY() <= 2 && e.deltaY < 0) underscroll -= e.deltaY;
    if (vs.on && !sheet.classList.contains('open')) { vs.goal = -1; vs.v = 0; vs.y = clamp(vs.y + e.deltaY, 0, maxScroll()); lastScrollAt = performance.now(); }
  }, { passive: true });
  addEventListener('touchstart', () => { touching = true; programmatic = 0; }, { passive: true });
  addEventListener('touchend', () => { touching = false; }, { passive: true });
  let touchY = null, touchAt = 0, touchV = 0;
  addEventListener('touchstart', (e) => {
    if (!vs.on || e.touches.length !== 1) return;
    touchY = e.touches[0].clientY; touchAt = e.timeStamp; touchV = 0; vs.v = 0; vs.goal = -1;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    const y = e.touches[0].clientY;
    if (vs.on) {
      // the open sheet scrolls its own text; elsewhere the page is ours, so the browser gets no pull-to-refresh
      if (sheet.classList.contains('open')) { touchY = null; return; }
      if (e.cancelable) e.preventDefault();
      if (touchY === null) { touchY = y; touchAt = e.timeStamp; return; }
      const dy = touchY - y, dts = Math.max(1, e.timeStamp - touchAt) / 1000;
      if (vs.y >= maxScroll() - 2 && dy > 0) overscroll += dy * 2.5;
      if (vs.y <= 2 && dy < 0) underscroll -= dy * 2.5;
      vs.y = clamp(vs.y + dy * TOUCH_GAIN, 0, maxScroll());
      touchV = touchV * 0.6 + (dy * TOUCH_GAIN / dts) * 0.4;   // smoothed finger speed, page px a second
      if (dy) { lastDir = dy > 0 ? 1 : -1; lastScrollAt = performance.now(); }
      touchY = y; touchAt = e.timeStamp;
      return;
    }
    if (touchY !== null && scrollY >= maxScroll() - 2 && touchY - y > 0) overscroll += (touchY - y) * 2.5;
    if (touchY !== null && scrollY <= 2 && y - touchY > 0) underscroll += (y - touchY) * 2.5;
    touchY = y;
  }, { passive: false });
  const touchUp = (e) => {
    // a flick carries on a little (a finger resting before it lifts throws nothing)
    if (vs.on && touchY !== null && e.timeStamp - touchAt < 80) vs.v = clamp(touchV * FLING, -PH * 0.6, PH * 0.6);
    touchY = null;
  };
  addEventListener('touchend', touchUp, { passive: true });
  addEventListener('touchcancel', touchUp, { passive: true });
  addEventListener('keydown', (e) => {
    if (sheet.classList.contains('open')) return;
    const down = e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ', up = e.key === 'ArrowUp' || e.key === 'PageUp';
    if (down && pageY() >= maxScroll() - 2) overscroll += 300;
    if (up && pageY() <= 2) underscroll += 300;
    // a keyboard on a touch screen (a tablet's) steps the virtual page
    if (vs.on && (down || up) && !e.target.closest('a, button, input')) { e.preventDefault(); vs.goal = -1; vs.v = (down ? 1 : -1) * PH * 0.35 * FLING_DECAY; lastDir = down ? 1 : -1; }
  });
  function maxScroll() { return PAGES * PH; }
  function scrollToPage(p, instant) {
    programmatic = performance.now();
    if (vs.on) { if (instant) setPageY(p * PH); else { vs.goal = clamp(p * PH, 0, maxScroll()); vs.v = 0; } }
    else scrollTo({ top: p * PH, behavior: instant ? 'instant' : 'smooth' });
  }
  // moves the virtual page each frame: a flick's glide, or the ease onto a scene that scrollToPage asked for
  function touchScrollTick(dt, now) {
    if (!vs.on || touching) return;
    if (vs.goal >= 0) {
      vs.y += (vs.goal - vs.y) * (1 - Math.exp(-dt * 3));
      if (Math.abs(vs.goal - vs.y) < 0.5) { vs.y = vs.goal; vs.goal = -1; }
    } else if (vs.v) {
      const y0 = vs.y;
      vs.y = clamp(vs.y + vs.v * dt, 0, maxScroll());
      if (vs.y === 0 && y0 > 0 && vs.v < 0) underscroll -= vs.v * dt;   // a flick into an end still counts as a pull
      if (vs.y === maxScroll() && y0 < vs.y && vs.v > 0) overscroll += vs.v * dt;
      vs.v *= Math.exp(-dt * FLING_DECAY);
      if (Math.abs(vs.v) < 4 || vs.y === 0 || vs.y === maxScroll()) vs.v = 0;
      lastScrollAt = now;
    }
  }
  function snapTick(now, target) {
    if (touching || sheet.classList.contains('open')) return;
    if (programmatic && now - programmatic < 1400) {
      if (Math.abs(pageY() - Math.round(pageY() / PH) * PH) < 1.5) programmatic = 0;
      return;
    }
    programmatic = 0;
    // igloo-style gravity (Robin, 2026-10-26: "some gravity ... not as strong as you set it, similar to the igloo
    // page"): once scrolling has rested about half a second, the page eases onto a scene. Past a quarter of the way in
    // the direction of travel it carries on to the next scene; short of that it falls back to the one it left
    const lo = Math.floor(target), frac = target - lo;
    // the last transition (cores to the ending, through the ring gate) pulls far more gently (Robin, 2026-10-26: "the
    // gravity on the last transition seems very high"): a longer rest first, and it carries on only past 60 %
    // on a touch screen a finger moves the page slowly, so one deliberate swipe (a tenth of the way) is enough to
    // carry on to the next scene rather than fall back (2026-10-29)
    const last = lo === PAGES - 1, carry = vs.on ? (last ? 0.3 : 0.1) : (last ? 0.6 : 0.25);
    if (now - lastScrollAt < (last ? 1200 : 550)) return;
    if (frac < 0.004 || frac > 0.996) return;
    const next = lastDir > 0 ? (frac > carry ? lo + 1 : lo) : (frac < 1 - carry ? lo : lo + 1);
    scrollToPage(Math.min(PAGES, next));
  }
  // keyboard focus inside a scene brings that scene up
  addEventListener('focusin', (e) => {
    const sec = e.target.closest('[data-scene]');
    if (!sec || sheet.contains(e.target)) return;
    const p = +sec.getAttribute('data-scene');
    if (Math.abs(cur - p) > 0.5) scrollToPage(p);
  });

  /* ---- pointer ---- */
  const pointer = { x: 0, y: 0, px: 0, py: 0, active: false };
  addEventListener('pointermove', (e) => {
    pointer.px = e.clientX; pointer.py = e.clientY;
    pointer.x = e.clientX / W * 2 - 1; pointer.y = 1 - e.clientY / H * 2;
    pointer.active = e.pointerType !== 'touch' || true;
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    pointer.px = e.clientX; pointer.py = e.clientY;
    pointer.x = e.clientX / W * 2 - 1; pointer.y = 1 - e.clientY / H * 2;
    pointer.active = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') pointer.active = false; });
  // a touch that turns into a scroll ends in pointercancel, not pointerup: without this the touch point stayed
  // "active" where the finger first landed, and a core scrolling under it chimed as if hovered (2026-10-28)
  addEventListener('pointercancel', (e) => { if (e.pointerType === 'touch') pointer.active = false; });
  // a sideways drag across the chamber switches the sculpture (brief, 2026-11-03): mouse through pointer events,
  // fingers through touch events (a vertical page scroll cancels the pointer, but touchend still arrives)
  let dragFrom = null;
  const dragStart = (x, y, el) => { dragFrom = ending.group.visible && !(el && el.closest && el.closest('a,button')) ? { x, y } : null; };
  const dragEnd = (x, y) => {
    if (!dragFrom) return;
    const dx = x - dragFrom.x, dy = y - dragFrom.y;
    dragFrom = null;
    if (Math.abs(dx) > Math.max(70, W * 0.08) && Math.abs(dy) < Math.abs(dx) * 0.6) car.go(dx < 0 ? 1 : -1);
  };
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') dragStart(e.clientX, e.clientY, e.target); }, { passive: true });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') dragEnd(e.clientX, e.clientY); }, { passive: true });
  addEventListener('touchstart', (e) => { if (e.touches.length === 1) dragStart(e.touches[0].clientX, e.touches[0].clientY, e.target); else dragFrom = null; }, { passive: true });
  addEventListener('touchend', (e) => { const t = e.changedTouches[0]; if (t) dragEnd(t.clientX, t.clientY); }, { passive: true });
  // every finger on the screen, for the globe (Robin, 2026-10-28: several fingers at once on phones).
  // Touch events, not pointer events: a phone cancels a pointer as soon as the touch starts scrolling the page, while
  // touchmove keeps coming, so the blocks follow each finger through a swipe too. Up to four, in stable slots.
  const fingers = [null, null, null, null];
  function readTouches(e) {
    const ids = [];
    for (let i = 0; i < e.touches.length; i++) {
      const tc = e.touches[i];
      ids.push(tc.identifier);
      let k = fingers.findIndex((f) => f && f.id === tc.identifier);
      if (k < 0) k = fingers.indexOf(null);
      if (k < 0) continue;
      fingers[k] = { id: tc.identifier, x: tc.clientX / W * 2 - 1, y: 1 - tc.clientY / H * 2 };
    }
    for (let k = 0; k < fingers.length; k++) if (fingers[k] && !ids.includes(fingers[k].id)) fingers[k] = null;
  }
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((ev) => addEventListener(ev, readTouches, { passive: true }));
  // a system gesture or app switch can swallow the touchend: let go of every finger then
  const dropFingers = () => fingers.fill(null);
  addEventListener('blur', dropFingers);
  document.addEventListener('visibilitychange', () => { if (document.hidden) dropFingers(); });
  const globeRays = [0, 1, 2, 3].map(() => new THREE.Ray()), rays = [null, null, null, null];
  let lastPointerType = 'mouse';
  addEventListener('pointerdown', (e) => { lastPointerType = e.pointerType; }, { passive: true });
  addEventListener('pointermove', (e) => { lastPointerType = e.pointerType; }, { passive: true });
  // clicking a core in the scene (not only its HUD label) opens its sheet
  canvas.addEventListener('click', (e) => {
    if (!layers.cores.classList.contains('on')) return;
    const i = coreUnder(e.clientX, e.clientY);
    if (i >= 0) openSheet(coreItems[i].key, coreItems[i].el);
  });
  // the camera drifts a little toward the mouse, as on igloo.inc; the pointer's world ray feeds the globe push
  const camDrift = new THREE.Vector2(), raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function driftCamera(dt, t) {
    // the cores and the chamber sit at the centre with little depth around them, so the same drift reads weaker
    // there: it grows to about 2.6x from the cores on (Robin, 2026-10-26)
    const amp = 1 + 1.6 * smooth(2.4, 3.0, t);
    const k = 1 - Math.exp(-dt * 2.2), on = pointer.active && !ctx.phone;
    camDrift.x += ((on ? pointer.x * 0.42 * amp : 0) - camDrift.x) * k;
    camDrift.y += ((on ? pointer.y * 0.24 * amp : 0) - camDrift.y) * k;
    if (params.has('pany')) camDrift.y = parseFloat(params.get('pany')) || 0;   // checking aid: ?pany=-2 holds the view low
    // the first scene turns the camera rather than moving it (Robin, 2026-10-27: "make it so the camera angle changes
    // not the model positions"): the camera stays put and looks toward the mouse, so the figures never slide against
    // each other; from the globe's lift on, the old sideways drift returns
    const turn = 1 - smooth(0.6, 1.2, t);
    camera.position.set(camDrift.x * (1 - turn), camDrift.y * (1 - turn), 6);
    camera.lookAt(camDrift.x * 0.35 * turn, camDrift.y * 0.35 * turn, 0);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  }
  const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();
  function project(world, out) {
    v3b.copy(world).project(camera);
    out.x = (v3b.x + 1) / 2 * W; out.y = (1 - v3b.y) / 2 * H; out.z = v3b.z;
    return out;
  }
  const corePx = [0, 1, 2].map(() => ({ x: 0, y: 0, r: 0 }));
  function coreUnder(px, py) {
    for (let i = 0; i < corePx.length; i++) {
      const c = corePx[i];
      if (Math.hypot(px - c.x, py - c.y) < c.r * 1.05) return i;
    }
    return -1;
  }

  /* ---- frame ---- */
  const handPos = new THREE.Vector3(), globePos = new THREE.Vector3(), coreA = new THREE.Vector3(), coreB = new THREE.Vector3(), coreC = new THREE.Vector3();
  const sp = { x: 0, y: 0, z: 0 };
  let time = 0, last = performance.now(), fade = 0, hoverCore = -1;
  let pendingJump = debugT;
  const farP = new THREE.Vector3();
  let fpsBox = null, fpsN = 0, fpsAcc = 0, fpsLast = performance.now();
  if (params.has('fps')) {
    fpsBox = document.createElement('div');
    fpsBox.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:12px monospace;color:#9fe;background:rgba(0,0,0,.6);padding:4px 6px;pointer-events:none';
    document.body.appendChild(fpsBox);
  }
  if (debugT !== null) {
    fade = 1;
    html.classList.add('debug');
    if (params.has('shape')) car.go(parseInt(params.get('shape'), 10) || 0, true);   // ?shape=1 starts on the Jolly Roger, 2 the envelope
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (debugT === null) governor(now - last);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now; time += dt;
    if (innerWidth !== W || innerHeight !== H) layout();
    if (W !== lastW || Math.abs(innerHeight * STROLL - lastPH) > lastPH * 0.25) { pageLayout(); lastW = W; lastPH = PH; }
    if (W < 2 || H < 2 || PH < 2) return;   // loaded in a hidden pane: wait for a real size
    if (pendingJump !== null) {
      setPageY(pendingJump * PH);
      cur = prevCur = pendingJump;
      lastScrollAt = now + 5000;
      pendingJump = null;
    }

    // scroll smoothing, snapping, the loop past the end
    touchScrollTick(dt, now);
    const target = clamp(pageY() / PH, 0, PAGES);
    cur += (target - cur) * (1 - Math.exp(-dt * 3.5));   // eases after the scroll, unhurried
    if (Math.abs(target - cur) < 0.0004) cur = target;
    vel = (cur - prevCur) / dt; prevCur = cur;
    if (debugT !== null && params.has('still')) vel = 0;   // ?still freezes scroll effects for screenshots
    else snapTick(now, target);
    overscroll *= Math.exp(-dt * 2.5);
    underscroll *= Math.exp(-dt * 2.5);
    let loopWhite = 0;
    if (loopT < 0 && overscroll > 240 && cur > PAGES - 0.05) { loopT = 0; overscroll = 0; loopTo = 0; sound.loop(); }
    if (loopT < 0 && underscroll > 240 && cur < 0.05) { loopT = 0; underscroll = 0; loopTo = PAGES; sound.loop(); }
    if (loopT >= 0) {
      loopT += dt;
      loopWhite = loopT < 0.55 ? smooth(0, 0.55, loopT) : loopT < 1.5 ? 1 - smooth(0.55, 1.5, loopT) : 0;
      if (loopT >= 0.55 && loopT - dt < 0.55) {
        scrollToPage(loopTo, true); cur = prevCur = loopTo; programmatic = 0; overscroll = underscroll = 0;
        lastDir = loopTo ? -1 : 1;
      }
      if (loopT > 1.5) loopT = -1;
    }
    driftCamera(dt, cur);
    // the rendered picture follows the camera (Robin, 2026-11-11: "the camera shift with the mouse is missing all the
    // way down till the core animation"): the turn moves it as it moves the sky (the far point's shift, as opening.js
    // works it out), and the sideways drift from the globe on moves it as a backdrop 14 units away would move; set
    // before anything is placed on it this frame, so the globe and Imu's eyes stay on it
    if (plate) {
      farP.set(0, 0, -1000).project(camera);
      plate.setPan(-farP.x * 0.5 + camera.position.x / (2 * ctx.halfW(-8)), -farP.y * 0.5 + camera.position.y / (2 * ctx.halfH(-8)));
    }
    const t = cur;
    const lift = smooth(0, 1, t), part = clamp(t - 1, 0, 1), collapse = clamp(t - 2, 0, 1), toEnd = clamp(t - 3, 0, 1);
    // the chamber comes in behind the ring gate, already in its overhead view, so the last ring frames it before the
    // camera is through (Robin, 2026-10-26: "let us see the final scene through the final ring")
    const endVisible = toEnd >= 0.3, coresVisible = collapse > 0.45 && toEnd < 0.62;

    // post: smear with scroll speed and at each transition; whiteouts mask the scene switches
    smearPulse *= Math.exp(-dt * 5);
    const g = post.grade;
    g.uTime.value = time;
    g.uSmear.value = clamp(Math.abs(vel) * 0.45, 0, 1) + peak(collapse, 0.62, 0.3) * 1.2 + peak(toEnd, 0.5, 0.2) * 0.6 + smearPulse * 0.9 + loopWhite * 0.8;
    // the dive through the ring gate into J.A.R.V.I.S.'s core carries the switch to the ending: only a faint flash
    g.uWhite.value = clamp(peak(collapse, 0.66, 0.1) * 0.3 + loopWhite, 0, 1);
    fade = Math.min(1, fade + dt / 1.4);
    g.uFade.value = smooth(0, 1, fade);
    g.uVignette.value = 0.5 + 0.2 * endVisible;

    // opening
    const figures = 1 - smooth(0.12, 0.82, t);
    opening.update({
      time, dt, W, H, figures, flashScale: 1 - 0.6 * smooth(2.2, 2.9, t),
      fogFade: (1 - 0.7 * lift) * (1 - smooth(2.3, 2.9, t)),
      dark: (1 - 0.3 * lift) * (1 - 0.6 * smooth(2.2, 2.9, t)),
      chamber: smooth(3.52, 3.62, t)   // the sky turns to the chamber's dark as the last ring sweeps past
    });
    const flash = opening.flash;
    flashLight.intensity = flash * 5 * (1 - 0.6 * smooth(2.2, 2.9, t));
    flashLight.position.set((opening.flashX - 0.5) * 6, 3, 2);
    key.intensity = 2.4 * (1 - 0.35 * collapse);
    hemi.intensity = 0.7 * (1 - 0.4 * lift);

    // globe: from Luffy's hand to the centre, then parting, then the collapse into the cores
    const viewH = 2 * ctx.halfH(0), minDim = Math.min(W, H);
    // (with the plate, the globe in his hand grows with the picture's 6 % enlargement, so it stays his size)
    const heroR = Math.max(24, 0.075 * minDim) / H * viewH * (plate ? plate.zoom : 1), mainR = Math.min(0.29 * viewH, 0.4 * viewH * ctx.aspect);
    opening.handWorld(handPos);
    if (plate) {   // the live globe over the rendered one: the render's globe centre on this screen, on the plane z = 0
      const gs = plate.globeScreen();
      plate.worldAt(gs[0], gs[1], 0, handPos);   // on the picture as the camera now sees it, so it moves only with the view
    }
    globePos.set(0, ctx.phone ? 0.12 : 0.04, 0).lerp(handPos, 1 - lift);
    opening.setGlobe(globePos, (1 - lift) * figures * globe.light);    // its light in the water and on Luffy, as it shines
    // three cores in a triangle (2026-11-03): a touch smaller, and on a phone held upright small enough that the
    // triangle fits the width with a margin
    const coreR = Math.min(0.6, 0.15 * viewH, (ctx.aspect < 0.9 ? 0.2 : 0.3) * viewH * ctx.aspect);
    cores.group.visible = coresVisible;
    const coresLeave = smooth(0, 0.5, toEnd);
    cores.update({ time, dt, radius: coreR, reveal: smooth(0.55, 0.95, collapse), leave: coresLeave });
    const gq = gpuT && plate ? gpuT.begin() : null;
    if (plate) plate.update({ t, aspect: ctx.aspect, fig: figures, lift, flash: flash * (1 - 0.6 * smooth(2.2, 2.9, t)), boltKey: opening.boltKey,
      globeLight: globe.light, dark: (1 - 0.3 * lift) * (1 - 0.6 * smooth(2.2, 2.9, t)), chamber: smooth(3.52, 3.62, t),
      cores: coresVisible ? cores.cores.map((c) => c.mat.uniforms.uAlpha.value) : [0, 0, 0] });
    if (gq) gpuT.end(gq, 'plate');
    cores.worldPos(0, coreA); cores.worldPos(1, coreB); cores.worldPos(2, coreC);
    // the ring gate assembles round J.A.R.V.I.S.'s core as the camera dives into it (ringgate.js)
    // late in the dive, and carried across the switch, so the camera is still passing through the rings as the
    // overhead view of the pedestal opens (Robin, 2026-10-26: "too early with the rings still")
    // the first ring floats within the cores whenever they are shown (Robin, 2026-10-26), a third of it at each core
    // (2026-11-03); merge follows the cores' own dive (cores.js), so the pieces close as the cores do
    const port = gate.update({ leave: clamp((toEnd - 0.2) / 0.42, 0, 1), time, pos: coreA,
      rest: coresVisible ? smooth(0.55, 0.95, collapse) : 0, coreR: cores.baseRadius(0),
      pieces: [coreA, coreB, coreC], merge: mergeOf(coresLeave) });
    // the chamber shows only through the last ring's opening until that ring has swept past the edges
    ending.setPortal((port.x * 0.5 + 0.5) * W * dpr, (port.y * 0.5 + 0.5) * H * dpr, port.r * 0.5 * H * dpr);
    globe.group.visible = t < 2.995 && !endVisible;
    if (globe.group.visible) {
      const open = sheet.classList.contains('open');
      for (let k = 0; k < 4; k++) {
        // the mouse (or pen) takes slot 0; fingers fill the slots they hold
        const f = fingers[k];
        const src = f ? f : (k === 0 && pointer.active && lastPointerType !== 'touch' ? pointer : null);
        if (src && !open) { raycaster.setFromCamera(ndc.set(src.x, src.y), camera); rays[k] = globeRays[k].copy(raycaster.ray); }
        else rays[k] = null;
      }
      globe.update({ time, dt, part, collapse, position: globePos, radius: heroR + (mainR - heroR) * lift, coreA, coreB, coreC, flash, rays });
    }
    opening.group.visible = true;

    // ending chamber
    ending.group.visible = endVisible;
    ending.update({ time, dt, visible: endVisible, pointer, gustVel: vel, W, H, dpr, instant: debugT !== null && time < 0.5,
      entry: clamp((toEnd - 0.5) / 0.45, 0, 1) });   // from overhead to the front over the second half of the scroll
    // HUD layers
    layers.open.classList.toggle('on', t < 0.55);
    layers.globe.classList.toggle('on', part > 0.22 && collapse < 0.2);
    layers.cores.classList.toggle('on', coresVisible && collapse > 0.9 && toEnd < 0.3);
    layers.end.classList.toggle('on', toEnd > 0.55);
    html.style.setProperty('--open-fade', (1 - smooth(0.05, 0.5, t)).toFixed(3));
    html.style.setProperty('--end-fade', (smooth(0.55, 0.9, toEnd) * (1 - loopWhite)).toFixed(3));
    if (layers.globe.classList.contains('on')) {
      const show = smooth(0.3, 0.65, part) * (1 - smooth(0, 0.14, collapse));
      globe.anchors(part).forEach((a, i) => {
        const tag = globeTags[i];
        project(a.world, sp);
        const lx = sp.x + (i % 2 ? -16 : 16), ly = sp.y - 26 - (i % 3) * 8;
        tag.el.style.transform = 'translate(' + (i % 2 ? 'calc(-100% + ' + lx.toFixed(1) + 'px)' : lx.toFixed(1) + 'px') + ',' + (ly - 14).toFixed(1) + 'px)';
        tag.el.style.opacity = (show * (sp.z < 1 ? 1 : 0)).toFixed(3);
        setLine(tag.line, lx, ly, sp.x, sp.y, show * 0.7);
      });
    } else globeTags.forEach((tag) => { tag.el.style.opacity = '0'; setLine(tag.line, 0, 0, 0, 0, 0); });
    if (layers.cores.classList.contains('on')) {
      const show = smooth(0.9, 1, collapse) * (1 - smooth(0.05, 0.3, toEnd));
      const stacked = ctx.aspect < 0.9;
      let lowest = 0;
      for (let i = 0; i < 3; i++) {
        project(i === 0 ? coreA : i === 1 ? coreB : coreC, sp);
        // the radius without the hover swell, so a label never slides out from under a resting cursor (cores.js)
        const rpx = cores.baseRadius(i) / ctx.halfH(0) * H / 2;
        corePx[i].x = sp.x; corePx[i].y = sp.y; corePx[i].r = rpx;
        const it = coreItems[i];
        if (stacked) {
          // phones: J.A.R.V.I.S.'s label sits centred above his core; the lower two are too wide to sit side by side,
          // so E.V.'s hangs from the left edge under her core and H.O.M.E.R.'s from the right edge a line lower
          const up = i === 0, lh = it.el.offsetHeight || 36;
          const ly = up ? sp.y - rpx - 14 : sp.y + rpx + 14 + (i === 2 ? lh + 8 : 0);
          const tx = up ? 'calc(-50% + ' + sp.x.toFixed(1) + 'px)' : i === 1 ? '16px' : 'calc(-100% + ' + (W - 16).toFixed(1) + 'px)';
          it.el.style.transform = 'translate(' + tx + ',' + (up ? ly - 36 : ly).toFixed(1) + 'px)';
          it.el.style.opacity = show.toFixed(3);
          setLine(it.line, sp.x, ly - 2, sp.x, up ? sp.y - rpx * 0.9 : sp.y + rpx * 0.9, show * 0.6);
          if (!up) lowest = Math.max(lowest, ly + lh);
        } else {
          const dx = i === 2 ? 1 : -1;   // J.A.R.V.I.S. and E.V. label to the left, H.O.M.E.R. to the right
          lowest = Math.max(lowest, sp.y + rpx);
          let lx = sp.x + dx * rpx * 0.95 + dx * 14;
          const ly = sp.y - rpx * 0.95 - 10;
          // keep the whole label on screen (a phone held sideways ran E.V.'s line off the right edge, 2026-10-29)
          const lw = it.el.offsetWidth || 0;
          lx = dx < 0 ? Math.max(lx, 16 + lw) : Math.min(lx, W - 16 - lw);
          it.el.style.transform = 'translate(' + (dx < 0 ? 'calc(-100% + ' + lx.toFixed(1) + 'px)' : lx.toFixed(1) + 'px') + ',' + (ly - 30).toFixed(1) + 'px)';
          it.el.style.opacity = show.toFixed(3);
          setLine(it.line, lx, ly, sp.x + dx * rpx * 0.72, sp.y - rpx * 0.72, show * 0.6);
        }
      }
      const eng = coreItems[3];
      if (eng) {   // below the triangle (and, on a phone, below the two lower labels), centred
        v3.set(0, 0, 0);
        project(v3, sp);
        const ey = lowest + (stacked ? 18 : 22);
        eng.el.style.transform = 'translate(calc(-50% + ' + sp.x.toFixed(1) + 'px),' + (ey + 14).toFixed(1) + 'px)';
        eng.el.style.opacity = show.toFixed(3);
        setLine(eng.line, sp.x, ey - 2, sp.x, ey + 12, show * 0.6);
      }
      const hc = pointer.active ? coreUnder(pointer.px, pointer.py) : -1;
      if (hc !== hoverCore) {
        if (hoverCore >= 0) { cores.setHot(hoverCore, false); sound.unhover(hoverCore); }
        if (hc >= 0) { cores.setHot(hc, true); sound.hover(hc); }
        hoverCore = hc;
        canvas.style.cursor = hc >= 0 ? 'pointer' : '';
      }
    } else {
      coreItems.forEach((it) => { it.el.style.opacity = '0'; setLine(it.line, 0, 0, 0, 0, 0); });
      if (hoverCore >= 0) { cores.setHot(hoverCore, false); sound.unhover(hoverCore); hoverCore = -1; canvas.style.cursor = ''; }
    }
    sound.update({ t, dt, time, vel, flash, flashScale: 1 - 0.6 * smooth(2.2, 2.9, t), globeLight: globe.light, globeShown: globe.group.visible,
      collapse, toEnd, coreReveal: coresVisible ? smooth(0.55, 0.95, collapse) * (1 - smooth(0, 0.5, toEnd)) : 0,
      end: smooth(0.55, 0.9, toEnd), loopWhite });
    if (fpsBox) {   // ?fps: the real frame rate and the size the canvas draws at (local preview, 2026-11-11)
      fpsN++; fpsAcc += now - fpsLast; fpsLast = now;
      if (fpsAcc > 500) {
        fpsBox.textContent = (1000 * fpsN / fpsAcc).toFixed(0) + ' fps, ' + canvas.width + 'x' + canvas.height + ' (quality ' + perf.q.toFixed(2) + ')' + (plate ? ', plate on' : '');
        fpsN = 0; fpsAcc = 0;
      }
    }
    if (fade > 0.2 && lifted && !html.classList.contains('ready')) html.classList.add('ready');
    if (gpuT) { const pq = gpuT.begin(); post.composer.render(dt); gpuT.end(pq, 'post'); gpuT.poll(); }
    else post.composer.render(dt);
    renderHudLines();
  }
  function setLine(line, x1, y1, x2, y2, a) {
    line.x1 = x1; line.y1 = y1; line.x2 = x2; line.y2 = y2; line.a = a;
  }
  requestAnimationFrame(frame);
  // lift the cover once every asset is in, or once nothing new has arrived for 0.6 s (the manager can keep one internal
  // item open after every file has landed, measured 2026-10-28), and at most 12 s after the build: a slow texture then
  // streams in behind the scene
  const builtAt = performance.now();
  await new Promise((res) => {
    const check = () => {
      const now = performance.now();
      if ((load.total && load.loaded >= load.total) || now - load.lastAt > 600 || now - builtAt > 12000) res();
      else setTimeout(check, 100);
    };
    check();
  });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // two frames drawn with them
  if (pct) pct.textContent = '100';
  if (cover) { cover.style.setProperty('--p', '1'); cover.classList.add('gone'); setTimeout(() => { cover.hidden = true; }, 900); }
  lifted = true;
  if (reduce.addEventListener) reduce.addEventListener('change', () => location.reload());
  if (window.console) console.info('scene ready: ' + globe.count + ' blocks, ' + ending.count + ' grains');
}

main().catch((e) => { if (window.console) console.error(e); goStatic('startup error'); });
