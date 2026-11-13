/* The ray-traced opening (local preview, Robin 2026-11-11: "add in the new videos now to a local host version of the
   website ... make the ray traced reflections all the way down to the cores page"). One fullscreen quad behind the
   page's live layers (globe, cores, fog, the bolt line, Imu's eyes), drawing the Cycles renders of
   whole-scene-render-2026-11-10:
     opening  the 8-second loop (Luffy, Imu, the rock, shore, sea, rain): two synced videos, the storm light and four
              light tiles (lightning a, b, c and the globe in his hand)
     empty    the same storm with nobody on the shore, for the scroll once the figures have faded
     scroll   stills of the light the globe throws on its rise (33 steps of its lift) and the light of the three cores,
              in the shore and the water
   Every pass is linear light, log-encoded in 8 bits (encode_page.py): the shader decodes them, adds them with the
   page's live weights (the random flash on one of the three bolts, the globe's own light, each core's brightness),
   looks the sum up in Blender's own AgX look (a 33^3 table), and undoes the page's ACES tone mapping, so what reaches
   the screen is Blender's picture of that mix. */
import * as THREE from 'three';

const VS = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const FS = /* glsl */`
precision highp float;
uniform sampler2D tBaseO,tLightsO,tBaseE,tLightsE,tScrA,tScrB,tLut,tBaked,tBakedE;uniform float uBaked;
uniform float uFig,uHasEmpty,uFlash,uGlobeO,uGlobeS,uScrMix,uDark,uAlpha,uExposure,uPa,uAsp,uHasScroll;
uniform vec3 uBolt,uCores;
uniform vec2 uPan,uAnchor;uniform float uZoom;   // the camera's shift with the mouse, inside a slightly enlarged frame
// the rendered sphere (uDiscR) and where the live globe now is (uDiscL), centre and radius in the picture (radius as
// a share of its height): what the live globe leaves uncovered of the sphere shows the figure-free storm instead
uniform sampler2D tFillB,tFillL;uniform vec3 uDiscR,uDiscL;uniform float uHasFill;
uniform sampler2D tMask;uniform float uOccl;
// the globe's light on its rise: every step in one atlas, loaded once (uAtl: columns, rows; uStepA/B: the two steps)
uniform sampler2D tAtlas;uniform vec2 uAtl;uniform float uStepA,uStepB;
uniform mat3 uOutInv,uInInv;
varying vec2 vUv;
const float VMIN=-11.,VRANGE=14.,LMIN=-12.47393,LRANGE=16.5,N=33.;
vec3 dec(vec3 e){return max(exp2(e*VRANGE+VMIN)-exp2(VMIN),0.);}
// one of four tiles (0 top left, 1 top right, 2 bottom left, 3 bottom right), kept half a texel inside its edges
vec3 tile(sampler2D t,vec2 uv,int k){
 vec2 ts=vec2(textureSize(t,0));vec2 m=1./ts;
 vec2 o=k==0?vec2(0.,.5):k==1?vec2(.5,.5):k==2?vec2(0.):vec2(.5,0.);
 vec2 p=o+clamp(uv*.5,m,.5-m);
 return dec(texture2D(t,p).rgb);}
vec3 atl(vec2 uv,float s){
 vec2 ts=vec2(textureSize(tAtlas,0));vec2 m=uAtl/ts;           // half a texel of one cell, in cell units *2
 float c=mod(s,uAtl.x),r=floor(s/uAtl.x);
 vec2 q=clamp(uv,m,1.-m);
 return dec(texture2D(tAtlas,vec2((c+q.x)/uAtl.x,1.-(r+1.-q.y)/uAtl.y)).rgb);}
vec3 lutAt(vec3 x){
 vec3 g=clamp((log2(max(x,exp2(LMIN)))-LMIN)/LRANGE,0.,1.)*(N-1.);
 float b0=min(floor(g.b),N-2.),fb=g.b-b0;
 vec2 rg=(g.rg+.5)/vec2(N*N,N);
 vec3 c0=texture2D(tLut,vec2(rg.x+b0/N,rg.y)).rgb,c1=texture2D(tLut,vec2(rg.x+(b0+1.)/N,rg.y)).rgb;
 return mix(c0,c1,fb);}
vec3 toLin(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
// the page's ACES (three's ACESFilmicToneMapping, exposure uExposure) run backwards: what to output so that the
// tone mapping gives y
vec3 unAces(vec3 y){
 vec3 c=clamp(uOutInv*y,0.,.985);
 vec3 A=1.-.983729*c,B=.0245786-.432951*c,C=-(.000090537+.238081*c);
 vec3 v=(-B+sqrt(max(B*B-4.*A*C,0.)))/(2.*A);
 return max(uInInv*v,0.)*.6/uExposure;}
void main(){
 // the render's framing on this screen: wider screens keep the bottom (his feet, the rock) and lose sky; narrower
 // ones lose the sides
 vec2 uv=uAnchor+(vUv-uAnchor)/uZoom+uPan;
 if(uAsp>uPa)uv.y=uv.y*uPa/uAsp;else uv.x=.5+(uv.x-.5)*uAsp/uPa;
#ifdef OCCLUDER
 if(texture2D(tMask,uv).r*uOccl<.003)discard;     // nothing to do where he is not
#endif
 vec3 x=vec3(0.);
 if(uFig>0.){
  // the opening: the video's passes mixed here, or (baked mode) the frame baked.js drew live, already mixed
  vec3 o=uBaked>.5?texture2D(tBaked,uv).rgb:
        dec(texture2D(tBaseO,uv).rgb)+uFlash*(uBolt.x*tile(tLightsO,uv,0)+uBolt.y*tile(tLightsO,uv,1)+uBolt.z*tile(tLightsO,uv,2))
        +uGlobeO*tile(tLightsO,uv,3);
  if(uBaked<.5&&uHasFill>0.){
   vec2 a=vec2(uPa,1.);
   float m=smoothstep(uDiscR.z*1.08,uDiscR.z*1.01,length((uv-uDiscR.xy)*a))*smoothstep(uDiscL.z*.97,uDiscL.z*1.01,length((uv-uDiscL.xy)*a));
   // never over him: the rendered sphere sits partly behind his hat brim, and the figure-free storm there erased the
   // brim (2026-11-11)
   m*=1.-texture2D(tMask,uv).r;
   if(m>0.){
    vec3 fc=dec(texture2D(tFillB,uv).rgb)+uFlash*(uBolt.x*tile(tFillL,uv,0)+uBolt.y*tile(tFillL,uv,1)+uBolt.z*tile(tFillL,uv,2));
    o=mix(o,fc,m);}}
  x+=o*uFig;}
 if(uFig<1.&&uHasEmpty>0.){
  // the scene without the figures: in baked mode the frame baked.js drew live (the calm still, its ripples, the rain,
  // already mixed), else the figure-free storm loop
  vec3 e=uBaked>.5?texture2D(tBakedE,uv).rgb:
        dec(texture2D(tBaseE,uv).rgb)+uFlash*(uBolt.x*tile(tLightsE,uv,0)+uBolt.y*tile(tLightsE,uv,1)+uBolt.z*tile(tLightsE,uv,2));
  x+=e*(1.-uFig);}
 if(uHasScroll>0.){
  // the scroll stills: globe (tile 0) between the two nearest steps of its lift, the three cores (tiles 1..3)
  x+=uGlobeS*mix(atl(uv,uStepA),atl(uv,uStepB),uScrMix);
  x+=uCores.x*tile(tScrB,uv,1)+uCores.y*tile(tScrB,uv,2)+uCores.z*tile(tScrB,uv,3);}
 vec3 d=toLin(lutAt(x))*uDark;
 float a=uAlpha;
#ifdef OCCLUDER
 // the picture once more over the live globe, only where Luffy is: the globe floats in front of him, beyond his hat,
 // so his hat and back cover it (Robin, 2026-11-11: "the globe be under luffy's hat")
 a*=texture2D(tMask,uv).r*uOccl;
#endif
 gl_FragColor=vec4(unAces(d),a);}`;

function videoTex(src) {
  const v = document.createElement('video');
  v.src = src; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('aria-hidden', 'true');
  const t = new THREE.VideoTexture(v);
  t.colorSpace = THREE.NoColorSpace;                 // encoded values, decoded in the shader
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { v, t, ready: new Promise((res, rej) => { v.addEventListener('canplay', res, { once: true }); v.addEventListener('error', () => rej(new Error('video ' + src)), { once: true }); v.load(); }) };
}

function stillTex(url) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.NoColorSpace; t.flipY = true; t.generateMipmaps = false;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    res(t);
  }, undefined, () => rej(new Error('still ' + url))));
}

export async function createPlate(ctx, base = 'assets/scene/') {
  const man = await fetch(base + 'manifest.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('no manifest'))));
  const fmt = man[ctx.phone ? 'phone' : 'desktop'];
  ctx.phoneSet = !!ctx.phone;   // which set loaded: app.js reloads if the window crosses to the other shape
  if (!fmt || !fmt.opening) throw new Error('no ' + (ctx.phone ? 'phone' : 'desktop') + ' plate');
  const lut = await stillTex(base + man.lut);
  lut.flipY = false; lut.needsUpdate = true;          // row 0 of the table is green index 0
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;
  const q = new URLSearchParams(location.search);
  // ?mode=baked: the opening drawn live from meshes with baked light (baked.js) in place of the video
  let O = null, B = null;
  // the baked version is the site's own (Robin, 2026-11-12: "she's ready to replace the live site"); ?mode=video for
  // the video version, which stays local
  if ((q.get('mode') || 'baked') === 'baked') {
    const { createBaked } = await import('./baked.js?v=2');
    B = await createBaked(ctx, base + 'baked-' + (ctx.phone ? 'phone' : '4k') + '/');
  } else {
    O = { b: videoTex(base + fmt.opening.base), l: videoTex(base + fmt.opening.lights) };
    await Promise.all([O.b.ready, O.l.ready]);
  }
  // Luffy's mask, drawn from his baked mesh (the same meshes and loop), for the globe to pass behind his hat: the
  // video version only. In the baked version the globe is drawn in front of him and beside his hat, as on the live
  // site (Robin, 2026-11-11: "check the current website for how you placed the globe without it interfering with
  // luffy's hat"): no mask, no occluder
  let M = null;
  if (!B && fmt.baked) {
    try { const { createBaked } = await import('./baked.js?v=2'); M = await createBaked(ctx, base + fmt.baked, { maskOnly: true }); }
    catch (e) { M = null; if (window.console) console.info('mask not used:', e.message); }
  }
  let E = null;
  if (!fmt.empty && fmt.emptyStill) {
    // until the empty storm's loop is encoded: one of its frames, still
    Promise.all([stillTex(base + fmt.emptyStill.base), stillTex(base + fmt.emptyStill.lights)]).then(([b, l]) => {
      u.uHasEmpty.value = 1; u.tBaseE.value = b; u.tLightsE.value = l;
    }).catch((e) => { if (window.console) console.info('empty still not used:', e.message); });
  }
  // baked mode plays no video (Robin, 2026-11-12: "we need to keep it sharp and smooth"; the storm loop's two 4K
  // videos were most of the landing's missed frames: 28 in 6 s playing, 2 paused): its figure-free scene is baked.js's
  // own frame without the figures (update)
  if (fmt.empty && !B) {
    E = { b: videoTex(base + fmt.empty.base), l: videoTex(base + fmt.empty.lights) };
    Promise.all([E.b.ready, E.l.ready]).then(() => { u.uHasEmpty.value = 1; E.ok = true; })
      .catch((e) => { E = null; if (window.console) console.info('empty plate not used:', e.message); });
  }
  // the scroll's light: the globe's rise in one atlas and the cores in one still, both loaded now and kept (loading a
  // 4K still at each step of the scroll, and again on the way back, was what made the scroll hitch)
  // not used (Robin, 2026-11-11: "i dont like the fact that the rain effect is paused"): those stills hold the rain
  // frozen, shown six and four times brighter as the globe rose; as on the live site, whose globe light fades as it
  // leaves his hand, the scroll keeps only the falling rain of the figure-free storm
  // The cores' light comes back as a loop (stage scene-6; Robin, 2026-11-11: "The reflections are missing on the core
  // page"): the same empty scene rendered again with the three cores lit and no rain in it, on the storm loop's own
  // water, frame for frame (run_cores_loop.sh), so their light lies on the sea and the shore as those move. It plays
  // only while a core shines, in step with the storm loop behind it (update).
  // (not in baked mode, which plays no video: the loop starting from pause as the cores came in was a run of 19 ms
  // frames, 2026-11-12; the cores' still from the calm set, below, stands in)
  let Cv = null;
  if (fmt.cores && !B) {
    Cv = videoTex(base + fmt.cores.lights);
    Cv.ready.then(() => { if (Cv) Cv.ok = true; }).catch((e) => { Cv = null; if (window.console) console.info('cores light not used:', e.message); });
  }
  // The globe's light on its rise comes back (Robin, 2026-11-12: "you missed the reflections on the globe after the
  // scroll and before the core"): its stills rendered again on calm water with no rain (scroll-calm-4k), so only its
  // light on the shore and the sea is in them and nothing stands still over the falling rain; the cores keep their
  // loop above (their still is used only where there is no loop)
  // (the baked version's own stills and palm where the manifest has them: on the phone its Luffy stands further right
  // than the video loop's, Robin, 2026-11-12: "move luffy over ... so he's not covering imu's reflection")
  const fsc = (B && fmt.bakedScroll) || fmt.scroll, palm = (B && fmt.bakedPalm) || fmt.palm;
  const scroll = fsc ? { n: fsc.n, atlas: null, cores: null } : null;
  if (scroll) {
    const coresUrl = base + fsc.files.replace('%04d', String(fsc.cores).padStart(4, '0'));
    await Promise.all([
      fsc.atlas ? stillTex(base + fsc.atlas).then((t) => { scroll.atlas = t; }) : null,
      fmt.cores && !B ? null : stillTex(coresUrl).then((t) => { scroll.cores = t; })
    ].filter(Boolean)).catch((e) => { if (window.console) console.info('scroll light not used:', e.message); });
  }
  // ACES's matrices, inverted once (three.module.js tonemapping_pars_fragment)
  const IN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
  const OUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: false, depthTest: false, depthWrite: false,
    uniforms: {
      tAtlas: { value: black }, uAtl: { value: new THREE.Vector2(6, 6) }, uStepA: { value: 0 }, uStepB: { value: 0 },
      tFillB: { value: black }, tFillL: { value: black }, uHasFill: { value: 0 }, tMask: { value: black }, uOccl: { value: 0 },
      uDiscR: { value: new THREE.Vector3() }, uDiscL: { value: new THREE.Vector3() },
      tBaseO: { value: O ? O.b.t : black }, tLightsO: { value: O ? O.l.t : black }, tBaked: { value: black }, tBakedE: { value: black }, uBaked: { value: B ? 1 : 0 }, tBaseE: { value: black }, tLightsE: { value: black },
      tScrA: { value: black }, tScrB: { value: black }, tLut: { value: lut },
      uFig: { value: 1 }, uHasEmpty: { value: 0 }, uHasScroll: { value: 0 }, uFlash: { value: 0 }, uGlobeO: { value: 1 },
      uGlobeS: { value: 0 }, uScrMix: { value: 0 }, uDark: { value: 1 }, uAlpha: { value: 1 }, uExposure: { value: 1.05 },
      uPa: { value: fmt.res[0] / fmt.res[1] }, uAsp: { value: 1 },
      // Robin, 2026-11-11: the mouse's camera shift all the way down to the cores. The picture is shown 6 % larger, so
      // it can move inside its own frame; enlarged about a point near the bottom, so his feet and the rock keep their
      // place at the bottom edge and the room to move is in the sky and at the sides
      uZoom: { value: 1.06 }, uAnchor: { value: new THREE.Vector2(0.5, 0.005 * 1.06 / 0.06) }, uPan: { value: new THREE.Vector2() }, uBolt: { value: new THREE.Vector3() }, uCores: { value: new THREE.Vector3() },
      uOutInv: { value: OUT.clone().invert() }, uInInv: { value: IN.clone().invert() }
    }
  });
  const u = mat.uniforms;
  if (B) u.uHasEmpty.value = 1;                    // baked mode: its own frame without the figures (baked.js)
  // the globe's fill picture: the video version only (the shader skips it in baked mode, so it is not fetched there)
  if (!B && fmt.fill && fmt.palm) {
    Promise.all([stillTex(base + fmt.fill.base), stillTex(base + fmt.fill.lights)]).then(([b, l]) => {
      u.tFillB.value = b; u.tFillL.value = l; u.uHasFill.value = 1;
    }).catch((e) => { if (window.console) console.info('globe fill not used:', e.message); });
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -99;                           // over the procedural sky (-100), under everything else
  // the occluder: the same picture (shared uniforms), drawn after the globe, only where Luffy's mask is
  const occMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, defines: { OCCLUDER: 1 }, uniforms: mat.uniforms,
    transparent: true, depthTest: false, depthWrite: false });
  const occluder = new THREE.Mesh(mesh.geometry, occMat);
  occluder.frustumCulled = false;
  occluder.renderOrder = 30;                        // after the globe, before the fog (50)
  occluder.visible = false;
  const gain = { globe: parseFloat(q.get('gglobe') || '6'), cores: parseFloat(q.get('gcores') || '4') };

  // render-frame fractions (from the bottom-left) to this screen's, the same fit as the shader's
  function toScreen(px, py) {
    const pa = u.uPa.value, a = u.uAsp.value, Z = u.uZoom.value, A = u.uAnchor.value;
    const f = a > pa ? [px, py * a / pa] : [0.5 + (px - 0.5) * pa / a, py];
    return [A.x + (f[0] - A.x) * Z, A.y + (f[1] - A.y) * Z];      // at rest: no shift
  }
  // the shift, kept inside the enlarged frame (uv of the picture stays within 0..1 at every screen edge)
  function setPan(x, y) {
    const Z = u.uZoom.value, A = u.uAnchor.value;
    x /= Z; y /= Z;                                // a shift on the screen is 1/Z of that in the enlarged picture
    const lo = [A.x - A.x / Z, A.y - A.y / Z], hi = [A.x + (1 - A.x) / Z, A.y + (1 - A.y) / Z];
    u.uPan.value.set(Math.min(1 - hi[0], Math.max(-lo[0], x)), Math.min(1 - hi[1], Math.max(-lo[1], y)));
  }
  // the lights video follows the storm video's clock (the two are the same loop; a frame or two apart is invisible
  // in light, a seek corrects anything more)
  function sync(pair) {
    const b = pair.b.v, l = pair.l.v, D = b.duration || 8;
    let d = b.currentTime - l.currentTime;
    if (d > D / 2) d -= D; else if (d < -D / 2) d += D;
    // no playback-rate nudging (it made Chrome show the frames unevenly, Robin 2026-11-11: "still looks choppy"):
    // the two start together and run at the same rate; only a drift past two frames is corrected, by a seek
    if (Math.abs(d) > 0.12 && !l.seeking) l.currentTime = b.currentTime;       // a seek is itself a hitch: rarely
  }
  function play(pair, on) {
    if (!pair) return;
    [pair.b.v, pair.l.v].forEach((v) => { if (on && v.paused) v.play().catch(() => {}); else if (!on && !v.paused) v.pause(); });
    if (on) sync(pair);
  }

  /* s: t (the page's timeline), fig (Luffy and Imu shown, 0..1), lift, flash, boltKey, globeLight, cores [3], dark,
     chamber, aspect */
  const holdLight = q.has('glight') ? parseFloat(q.get('glight')) : null;   // checking aid: ?glight=1 holds the globe lit
  function update(s) {
    if (holdLight !== null) s.globeLight = holdLight;
    u.uAsp.value = s.aspect;
    u.uFig.value = s.fig;
    const showEmpty = s.fig < 0.999 && u.uHasEmpty.value > 0;
    u.uAlpha.value = (showEmpty ? 1 : s.fig) * (1 - s.chamber);
    mesh.visible = u.uAlpha.value > 0.002;
    // opaque while it is whole, so it is drawn in order before the globe and the cores (three draws transparent
    // meshes last, over them); blended only while it fades
    mat.transparent = u.uAlpha.value < 0.999;
    // while the plate covers the screen, the page's own procedural sky and water behind it (a heavy full-screen
    // shader) is not drawn at all (opening.js reads this)
    ctx.plateCovers = mesh.visible && !mat.transparent;
    // the videos keep playing across the cross-fade and well past it either way, so neither starts again (a 4K
    // video starting stalls for a moment) while it can be seen; the scroll back to the landing finds the opening
    // loop already running
    play(O, s.t < 1.5 && s.chamber < 1);
    play(E, s.chamber < 1);            // from the first frame: starting it as the scroll began was a stall there
    // a video's texture is bound only while its picture is shown: three copies a bound video into the GPU at every
    // new frame, seen or not, and the two figure-free 4K videos copied under the opening were most of the missed
    // frames on the scroll (2026-11-11: 44 missed scrolling back with them bound, 3 without)
    if (O) { const on = s.fig > 0.001; u.tBaseO.value = on ? O.b.t : black; u.tLightsO.value = on ? O.l.t : black; }
    if (E && E.ok) { const on = s.fig < 0.999; u.tBaseE.value = on ? E.b.t : black; u.tLightsE.value = on ? E.l.t : black; }
    u.uFlash.value = s.flash;
    u.uBolt.value.set(s.boltKey === 'a' ? 1 : 0, s.boltKey === 'b' ? 1 : 0, s.boltKey === 'c' ? 1 : 0);
    // the globe: in his hand (the opening loop's own globe pass) until it starts to rise, then the scroll stills
    const k = Math.min(1, s.lift / 0.06);
    u.uGlobeO.value = s.globeLight * (1 - k);
    if (B && mesh.visible && ctx.renderer) {
      // the baked frame, drawn with the same weights the video's passes get here: the calm still with its live
      // ripples and the rain, and the figures while they show; and the same without the figures while they fade
      // (the scroll's storm). Everything on the page's own clock; no video
      const bw = u.uBolt.value, f = u.uFlash.value;
      B.render(ctx.renderer, { w: [1, f * bw.x, f * bw.y, f * bw.z, u.uGlobeO.value], width: ctx.renderer.domElement.width * u.uZoom.value,
        fig: s.fig, mask: false });
      u.tBaked.value = B.texture || black;
      u.tBakedE.value = B.emptyTexture || black;
    }
    if (M) {
      // the globe passes behind him while it is in his hand; as it rises clear of him, his mask lets go of it
      const occ = s.fig * (1 - Math.min(1, s.lift / 0.25));
      // drawn while he is shown at all: the globe fill below keeps off him with it too
      if (!B && s.fig > 0.001 && ctx.renderer) M.render(ctx.renderer, { frame: (O.b.v.currentTime || 0) * fmt.opening.fps, width: ctx.renderer.domElement.width * u.uZoom.value });
      u.tMask.value = M.mask || black;
      u.uOccl.value = occ;
      occluder.visible = mesh.visible && occ > 0.001;
    }
    u.uDark.value = s.dark;
    if (fmt.palm) {                                // the sphere in the render and the live globe, in the picture
      const b = bobNow(), g = globePicture(), r = fmt.globe_r || 0.075;
      u.uDiscR.value.set(fmt.globe[0], fmt.globe[1] + b, r);
      u.uDiscL.value.set(g[0], g[1], Math.max(1e-4, r * (1 - Math.min(1, s.lift * 4))));   // as it rises, the whole sphere is filled
    }
    // the globe's light on its rise (the atlas) and the cores' light (their loop, or their still), each on its own
    let globeOn = false, coresOn = false;
    if (scroll) {
      const f = s.lift * scroll.n, i0 = Math.min(scroll.n - 1, Math.floor(f));
      u.tAtlas.value = scroll.atlas || black;
      u.uStepA.value = i0; u.uStepB.value = i0 + 1; u.uScrMix.value = f - i0;
      u.uGlobeS.value = scroll.atlas ? s.globeLight * k * gain.globe : 0;
      globeOn = u.uGlobeS.value > 0.0001;
    }
    u.uCores.value.set(0, 0, 0);
    if (Cv && Cv.ok) {
      // the cores' light loop: shown and playing only while a core shines over the storm loop, and kept on that
      // loop's clock (the water under the light is the water behind it); a drift past two frames is put right by a seek
      const v = Cv.v, lit = mesh.visible && (B || (E && E.ok)) && Math.max(s.cores[0], s.cores[1], s.cores[2]) > 0.001;
      if (lit && !(E && E.ok)) {                       // baked mode: no storm loop to keep time with
        if (v.paused) v.play().catch(() => {});
      } else if (lit) {
        const tb = E.b.v.currentTime || 0, D = E.b.v.duration || 8;
        if (v.paused) { v.currentTime = tb; v.play().catch(() => {}); }
        else { let d = tb - v.currentTime; if (d > D / 2) d -= D; else if (d < -D / 2) d += D; if (Math.abs(d) > 0.12 && !v.seeking) v.currentTime = tb; }
      }
      if (lit) {
        u.tScrB.value = Cv.t; coresOn = true;
        u.uCores.value.set(s.cores[0], s.cores[1], s.cores[2]).multiplyScalar(gain.cores);
      } else {
        if (!v.paused) v.pause();
        u.tScrB.value = black;
      }
    } else if (scroll && scroll.cores) {
      u.tScrB.value = scroll.cores; coresOn = true;
      u.uCores.value.set(s.cores[0], s.cores[1], s.cores[2]).multiplyScalar(gain.cores);
    }
    u.uHasScroll.value = globeOn || coresOn ? 1 : 0;
  }
  // where the globe sits in his hand in the render, on this screen: the render's centre, bobbing with the loop as
  // the arm does (build_characters ARM_BOB, 4 mask px of the 842 px frame)
  function bobNow() {
    const f = B ? B.frame : (O.b.v.currentTime || 0) * fmt.opening.fps;
    return fmt.bob * Math.sin(2 * Math.PI * f / fmt.opening.frames);
  }
  // the live globe's place in the picture: over his palm, at the render globe's height (in front of his hat, where
  // the page has always had it; Robin 2026-11-11), or the render's own place if the palm is not known
  // Robin, 2026-11-11: "look at our current website for where the globe needs to go, its too close to his face": on
  // the current site it floats over his open hand, about half its radius right of the palm's centre, clear of his hat;
  // the same offset here, in globe radii (?gx= to try others)
  const GX = q.has('gx') ? parseFloat(q.get('gx')) : 0.55;
  // The baked version: the live site's rule (opening.js handWorld, app.js heroR): the centre 1.66 globe radii above
  // the hover point (his palm), the radius 7.5 % of the screen's smaller side, drawn in front of him. In this render
  // his hand is nearer his hat than on the live site: by that rule alone the globe would cover the brim by 0.66 of
  // its radius, where the live site leaves a gap of 0.04. So it stands 0.72 radii to the right, which gives that same
  // gap (measured on the 4K frame at all 30 light steps: 0.71 to 0.73).
  // 0.83 (Robin, 2026-11-12: "what you have overlaps from time to time"): the site's 0.04-radius gap to his hat at
  // every step of the loop even with the shell breathing open (+0.1 radius; globe_clear.py)
  const GXB = 0.83;
  function globePicture() {
    const b = bobNow(), r = fmt.globe_r || 0.075, pa = fmt.res[0] / fmt.res[1];
    if (B && palm) {
      // the globe's radius on this screen as a share of the picture's height (app.js: 7.5 % of the smaller side; the
      // picture is as tall as the screen, taller on a screen wider than it)
      const a = u.uAsp.value, rs = 0.075 * Math.min(1, a) / Math.max(1, a / pa);
      return [palm[0] + GXB * rs / pa, palm[1] + 1.66 * rs + b];
    }
    return palm ? [palm[0] + GX * r / pa, fmt.globe[1] + b] : [fmt.globe[0], fmt.globe[1] + b];
  }
  if (q.has('fps')) window.__plate = { O, E: () => E, M, B, u, ctx };   // checking aid for frame-time tests
  // a point of the picture on this screen as it is shown now, shifted with the camera (screen fractions)
  function screenNow(px, py) {
    const s = toScreen(px, py), Z = u.uZoom.value, P = u.uPan.value;
    return [s[0] - P.x * Z, s[1] - P.y * Z];
  }
  // that screen point on the page's plane at depth z, through the page camera as it is now: so what the page draws
  // over the picture (the globe, Imu's eyes) stays on it while the camera moves (Robin, 2026-11-11: "only the camera
  // moves, not the objects themselves")
  const ray = new THREE.Vector3();
  function worldAt(sx, sy, z, out) {
    const cam = ctx.camera;
    ray.set(2 * sx - 1, 2 * sy - 1, 0.5).unproject(cam).sub(cam.position);
    const k = (z - cam.position.z) / ray.z;
    return out.set(cam.position.x + ray.x * k, cam.position.y + ray.y * k, z);
  }
  function globeScreen() { const p = globePicture(); return screenNow(p[0], p[1]); }
  return {
    mesh, occluder, update, globeScreen, toScreen, screenNow, worldAt, setPan, bolts: fmt.bolts, get zoom() { return u.uZoom.value; }, eyes: fmt.eyes, glow: fmt.glow,
    get time() { return B ? B.frame / 120 : (O.b.v.currentTime || 0); }
  };
}
