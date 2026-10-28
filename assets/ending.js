/* Closing chamber, after igloo.inc's ending: the baked stone pedestal (pedestal.glb) under a spotlight with two glowing
   rings and a soft light cone, and on it a sculpture of fine lit grains: 120,000 on desktop, 40,000 on phones.
   Grain rest positions come from shapes.js (Luffy from the mask, the Straw Hat Jolly Roger, the envelope) and live in
   float textures; a GPGPU pass (two half-float render targets, ping-pong, MRT offset + velocity) lets the cursor push
   grains aside so they spring back over a few seconds, and lets scrolling gust through them. The vertex shader adds
   curl-noise drift and a few grains streaming off like dust. Switching a sculpture scatters the grains and rebuilds
   them as the next shape. The carousel DOM (arrows, current link) is wired by app.js through switchTo(). */
import * as THREE from 'three';
import { NOISE3 } from './glsl.js?v=3';
import { drawJolly, drawMail, loadMask, sample } from './shapes.js?v=4';
import { rng } from './world.js?v=3';

export const ITEMS = [
  { name: 'LinkedIn', href: 'https://www.linkedin.com/in/akshith-srinivas-naidu-487b8218b', shape: 'luffy', glow: 1 },
  { name: 'Starter kit', href: 'https://github.com/SKULLSHOCK3R/ai-workflows', shape: 'jolly', glow: 0.42 },
  { name: 'Email', href: 'mailto:asn522@uregina.ca', shape: 'mail', glow: 0.36 }
];   // glow: per-shape grain alpha, since the same grains pack tighter in the smaller drawings

const DRAW_VS = /* glsl */`
precision highp float;precision highp int;
uniform sampler2D tRestA,tRestB,tNrmA,tNrmB,tOff;uniform float uMix,uAppear,uTime,uRot,uPix,uRefZ,uAlpha;uniform int uW;
in vec4 aRand;out float vA,vShade,vY;out vec3 vN;
${NOISE3}
void main(){int id=gl_VertexID;ivec2 c=ivec2(id%uW,id/uW);
 vec4 a=texelFetch(tRestA,c,0),b=texelFetch(tRestB,c,0);vec3 off=texelFetch(tOff,c,0).xyz;vec4 r=aRand;
 float e=smoothstep(r.x*.35,r.x*.35+.65,uMix);
 vec3 n=normalize(mix(texelFetch(tNrmA,c,0).xyz,texelFetch(tNrmB,c,0).xyz,e)+1e-4);
 vec3 dir=normalize(vec3(r.y-.5,r.z-.3,r.w-.5)+.001);
 vec3 p=mix(a.xyz,b.xyz,e)+dir*sin(e*3.14159)*(.6+r.y*.9);
 // the grains arrive from a glowing cloud at the centre (igloo.inc's ring transition), then build the sculpture
 float ap=smoothstep(r.x*.4,r.x*.4+.6,uAppear);
 p=mix(dir*(.45+r.z*.95)+vec3(0.,-.1,0.),p,ap);
 float al=.3+.7*ap;   // the cloud is soft dust; grains brighten as they settle into the sculpture
 if(r.w<.035){float ph=fract(uTime*.07+r.x*7.);p+=vec3(ph*1.4,ph*.5+sin(ph*6.+r.y*9.)*.08,ph*.3);al=1.-ph;}
 p+=curl(p*1.4+vec3(0.,uTime*.12,uTime*.05))*.014*(.5+r.y);
 p+=off;
 float cs=cos(uRot),sn=sin(uRot);vec3 q=vec3(cs*p.x+sn*p.z,p.y,-sn*p.x+cs*p.z);
 vN=vec3(cs*n.x+sn*n.z,n.y,-sn*n.x+cs*n.z);
 vec4 mv=modelViewMatrix*vec4(q,1.);gl_Position=projectionMatrix*mv;
 gl_PointSize=uPix*(.8+r.z*.9)*(uRefZ/max(.1,-mv.z));
 vA=al*uAlpha;vShade=mix(a.w,b.w,e);vY=p.y;}`;
/* Grains are lit as one solid object, like igloo.inc's sculptures: a key light from above and in front, a soft sky
   term, darker inside (the shade), a cold rim from behind; opaque and depth-tested */
const DRAW_FS = /* glsl */`
precision highp float;in float vA,vShade,vY;in vec3 vN;out vec4 fragColor;
void main(){vec2 c=gl_PointCoord-.5;float rr=dot(c,c);if(rr>.25)discard;
 vec3 n=normalize(vN);
 float key=max(dot(n,normalize(vec3(.35,.85,.55))),0.),sky=n.y*.5+.5,rim=pow(1.-abs(n.z),3.);
 float l=(.12+.78*key+.22*sky)*(.25+.95*vShade);
 vec3 col=mix(vec3(.07,.09,.16),vec3(.93,.95,1.),clamp(l,0.,1.2))+vec3(.35,.45,.8)*rim*.22*vShade;
 col*=.92+.16*smoothstep(.25,0.,rr);
 float a=vA;fragColor=vec4(col*a,a);}`;

const SIM_VS = /* glsl */`void main(){gl_Position=vec4(position.xy,0.,1.);}`;
const SIM_FS = /* glsl */`
precision highp float;
uniform sampler2D tOff,tVel,tRest;uniform vec3 uPointer,uPointerVel,uGustDir;
uniform float uDt,uRadius,uStrength,uGust,uActive,uTime;
layout(location=0) out vec4 oOff;layout(location=1) out vec4 oVel;
${NOISE3}
void main(){ivec2 c=ivec2(gl_FragCoord.xy);
 vec4 rest=texelFetch(tRest,c,0);vec3 off=texelFetch(tOff,c,0).xyz;vec3 vel=texelFetch(tVel,c,0).xyz;
 vec3 p=rest.xyz+off;float h=hash3(vec3(c,7.));
 vec2 d=p.xy-uPointer.xy;float dist=length(d);
 float f=smoothstep(uRadius,uRadius*.1,dist)*uActive;
 vec3 push=(vec3(normalize(d+1e-4),0.)*1.2+uPointerVel*.4+vec3(0.,0.,(h-.5)*.8))*f*uStrength;
 vec3 gust=uGustDir*uGust*(.3+.7*h)*(1.+.5*sin(uTime*7.+h*40.));
 vel+=(push+gust)*uDt;
 vel-=off*6.*uDt;
 vel*=exp(-uDt*2.4);
 off+=vel*uDt;
 oOff=vec4(off,1.);oVel=vec4(vel,1.);}`;

const CONE_VS = /* glsl */`varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`;
const CONE_FS = /* glsl */`precision highp float;uniform float uTime,uAmt;varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){float fr=pow(abs(dot(normalize(vN),normalize(vV))),1.4);
 float a=(1.-vUv.y)*(1.-vUv.y)*fr*(.9+.1*sin(uTime*1.7+vUv.y*9.))*.16*uAmt;
 gl_FragColor=vec4(vec3(.55,.68,.95)*a,a);}`;

/* The portal (Robin, 2026-10-26: "only through the last ring should we see that final scene"): while the ring gate
   passes, every ending material draws only inside a screen circle (the last ring's opening, device pixels from the
   bottom left); uPortalR < 0 draws nothing, a huge radius draws everything. */
const portal = { uPortalC: { value: new THREE.Vector2() }, uPortalR: { value: 1e9 } };
const PORTAL_GLSL = 'uniform vec2 uPortalC;uniform float uPortalR;';
const PORTAL_TEST = 'if(distance(gl_FragCoord.xy,uPortalC)>uPortalR)discard;';
function portalize(mat) {
  if (mat.isShaderMaterial) {
    Object.assign(mat.uniforms, portal);
    mat.fragmentShader = mat.fragmentShader.replace('void main(){', PORTAL_GLSL + 'void main(){' + PORTAL_TEST);
    return mat;
  }
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, portal);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', PORTAL_GLSL + '\nvoid main() {\n' + PORTAL_TEST);
  };
  return mat;
}

export async function createEnding(ctx, loader, renderer) {
  const group = new THREE.Group();
  group.name = 'ending';
  group.rotation.x = 0.1;
  group.position.y = ctx.phone ? 0.72 : 0.42;
  group.scale.setScalar(ctx.phone ? 0.58 : 0.9);
  const W = ctx.phone ? 200 : 400, H = ctx.phone ? 200 : 300, N = W * H;

  // ---- pedestal, floor, lights, rings, cone ----
  const gltf = await loader.loadAsync('assets/models/pedestal.glb');
  const pedestal = gltf.scene;
  pedestal.traverse((o) => { if (o.isMesh) { o.material.roughness = 0.95; o.material.metalness = 0; o.material.aoMapIntensity = 1.1; portalize(o.material); } });
  const PS = 0.78, PY = -1.62;
  pedestal.scale.setScalar(PS);
  pedestal.position.y = PY;
  group.add(pedestal);
  // the baked pedestal's top tier reaches 0.42 model units (0.28 + 0.14 in build_assets.py) plus its chipped surface;
  // the sculptures float a little above it (Robin, 2026-10-26: Luffy's feet clipped into the stone)
  const top = PY + 0.43 * PS;
  const HOVER = 0.17;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), portalize(new THREE.MeshStandardMaterial({ color: 0x070a12, roughness: 0.92, metalness: 0 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = PY + 0.02;
  group.add(floor);
  const spot = new THREE.SpotLight(0xdfe8ff, 42, 14, 0.42, 0.75, 1.6);
  spot.position.set(0.3, 4.6, 1.4);
  spot.target.position.set(0, PY, 0);
  group.add(spot, spot.target);
  const fill = new THREE.PointLight(0x6d82c8, 6, 9, 1.8);
  fill.position.set(-2.4, 0.4, 2.2);
  const rim = new THREE.PointLight(0xb57bff, 3.5, 8, 1.8);
  rim.position.set(2.2, -0.2, -1.6);
  group.add(fill, rim, new THREE.HemisphereLight(0x2a3450, 0x05070c, 0.5));
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.62, 1.0).multiplyScalar(1.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.62 * PS + 0.1, 0.006, 6, 120), ringMat);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = PY + 0.05;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.62 * PS + 0.42, 0.004, 6, 140), ringMat);
  ring2.rotation.x = Math.PI / 2 + 0.06;
  ring2.position.y = PY + 0.16;
  portalize(ringMat);
  const ring3 = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.003, 6, 120), portalize(ringMat.clone()));
  ring3.material.opacity = 0.5;
  ring3.rotation.x = Math.PI / 2;
  ring3.position.y = top + 0.03;
  group.add(ring1, ring2, ring3);
  const coneMat = new THREE.ShaderMaterial({ vertexShader: CONE_VS, fragmentShader: CONE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uAmt: { value: 1 } } });
  portalize(coneMat);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.9, 5.4, 40, 1, true), coneMat);
  cone.position.y = PY + 2.7;
  cone.renderOrder = 5;
  group.add(cone);

  // ---- grain rest positions as float textures ----
  // Luffy: grains over the surface of the real 3D model (build_characters.py "points" mode), with normals; the flat
  // drawings (and Luffy, if the file is missing) face the viewer
  const flat = () => { const a = new Float32Array(N * 4); for (let i = 0; i < N; i++) { a[i * 4 + 2] = 1; a[i * 4 + 3] = 1; } return a; };
  async function loadPoints(url, height, baseY) {
    const buf = await (await fetch(url)).arrayBuffer();
    const [total, ext] = new Float32Array(buf, 0, 2);
    const P = new Int16Array(buf, 8, total * 3), Nr = new Int8Array(buf, 8 + total * 6, total * 3), S = new Uint8Array(buf, 8 + total * 9, total);
    let ymax = 1;
    for (let i = 0; i < total; i++) ymax = Math.max(ymax, P[i * 3 + 1]);
    const k = height / ymax, pos = new Float32Array(N * 4), nrm = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const j = i % total;
      pos[i * 4] = P[j * 3] * k; pos[i * 4 + 1] = baseY + P[j * 3 + 1] * k; pos[i * 4 + 2] = P[j * 3 + 2] * k;
      pos[i * 4 + 3] = S[j] / 255;
      nrm[i * 4] = Nr[j * 3] / 127; nrm[i * 4 + 1] = Nr[j * 3 + 1] / 127; nrm[i * 4 + 2] = Nr[j * 3 + 2] / 127; nrm[i * 4 + 3] = 1;
    }
    return { pos, nrm };
  }
  // Luffy stays the silhouette from Robin's mask (Robin, 2026-10-26: "dont touch that it was perfect"), drawn as lit
  // grains with normals from the silhouette's own rounded surface; loadPoints (the 3D model) is kept but not used
  const normals = { luffy: new Float32Array(N * 4), jolly: new Float32Array(N * 4), mail: new Float32Array(N * 4) };
  const data = {
    luffy: sample(await loadMask('assets/luffy-mask.png'), N, 2.5, 0.27, top + HOVER, 11, new Float32Array(N * 4), normals.luffy),
    jolly: sample(drawJolly(300), N, 1.9, 0.32, top + 0.35, 12, new Float32Array(N * 4), normals.jolly),
    mail: sample(drawMail(240), N, 1.25, 0.15, top + 0.6, 13, new Float32Array(N * 4), normals.mail)
  };
  function restTexture(arr) {
    const t = new THREE.DataTexture(arr, W, H, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }
  const restA = restTexture(new Float32Array(data.luffy)), restB = restTexture(new Float32Array(data.luffy));
  const nrmA = restTexture(new Float32Array(normals.luffy)), nrmB = restTexture(new Float32Array(normals.luffy));

  // ---- simulation targets ----
  function target() {
    return new THREE.WebGLRenderTarget(W, H, { count: 2, type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
  }
  let simA = target(), simB = target();
  const simMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: SIM_VS, fragmentShader: SIM_FS, depthTest: false, depthWrite: false,
    uniforms: {
      tOff: { value: null }, tVel: { value: null }, tRest: { value: restB },
      uPointer: { value: new THREE.Vector3(99, 99, 0) }, uPointerVel: { value: new THREE.Vector3() }, uGustDir: { value: new THREE.Vector3(0, 1, 0) },
      uDt: { value: 0.016 }, uRadius: { value: 0.42 }, uStrength: { value: 9 }, uGust: { value: 0 }, uActive: { value: 0 }, uTime: { value: 0 }
    }
  });
  const simScene = new THREE.Scene();
  simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat));
  const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clearColor = new THREE.Color(0, 0, 0);
  [simA, simB].forEach((t) => {
    renderer.setRenderTarget(t);
    renderer.setClearColor(clearColor, 0);
    renderer.clear(true, false, false);
  });
  renderer.setRenderTarget(null);

  // ---- grains ----
  const R = rng(31), rand = new Float32Array(N * 4);
  for (let k = 0; k < N * 4; k++) rand[k] = R();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  const drawMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: DRAW_VS, fragmentShader: DRAW_FS, transparent: true, depthWrite: true,
    depthTest: true, blending: THREE.NormalBlending, premultipliedAlpha: true,
    uniforms: {
      tRestA: { value: restA }, tRestB: { value: restB }, tNrmA: { value: nrmA }, tNrmB: { value: nrmB }, tOff: { value: simA.textures[0] },
      uMix: { value: 1 }, uAppear: { value: 0 }, uTime: { value: 0 }, uRot: { value: 0 }, uPix: { value: 2 }, uRefZ: { value: 6 }, uAlpha: { value: 1 }, uW: { value: W }
    }
  });
  portalize(drawMat);
  const grains = new THREE.Points(geo, drawMat);
  grains.frustumCulled = false;
  grains.renderOrder = 6;
  group.add(grains);

  let idx = 0, prevIdx = 0, mix = 1, appear = 0, shown = false;
  function switchTo(next, instant) {
    const from = ITEMS[idx].shape, to = ITEMS[next].shape;
    prevIdx = idx;
    idx = next;
    restA.image.data.set(data[from]); restA.needsUpdate = true;
    restB.image.data.set(data[to]); restB.needsUpdate = true;
    nrmA.image.data.set(normals[from]); nrmA.needsUpdate = true;
    nrmB.image.data.set(normals[to]); nrmB.needsUpdate = true;
    mix = instant ? 1 : 0;
  }

  const ray = new THREE.Ray(), inv = new THREE.Matrix4(), hit = new THREE.Vector3(), lastHit = new THREE.Vector3(99, 99, 0), v3 = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  let pointerOn = false;

  /* state: time, dt, visible, pointer {x, y (NDC), active}, gustVel (scroll pages per second), W, H, dpr */
  function update(s) {
    if (!s.visible) { shown = false; return; }
    if (!shown) { shown = true; appear = s.instant ? 1 : 0; }
    // entry (0..1, from the scroll): the chamber opens looking straight down on the pedestal, its rings concentric
    // with the ring gate the camera just came through, and swings down to the front as the grains build the sculpture
    const entry = s.entry === undefined ? 1 : s.entry, swing = 1 - entry * entry * (3 - 2 * entry);
    group.rotation.x = 0.1 + 1.38 * swing;
    spot.intensity = 42 * (1 - 0.75 * swing);   // overhead, the camera looks straight into the spot's pool
    appear = s.entry === undefined ? Math.min(1, appear + s.dt / 2.4) : Math.min(1, entry * 1.15);
    mix = Math.min(1, mix + s.dt / 1.7);
    group.updateMatrixWorld();
    coneMat.uniforms.uTime.value = s.time;
    ring2.rotation.z = s.time * 0.05;
    ring3.rotation.z = -s.time * 0.12;

    // pointer into the sculpture's own frame (its rest plane, un-spun)
    const rot = Math.sin(s.time * 0.32) * 0.4;
    const u = simMat.uniforms;
    if (s.pointer.active) {
      v3.set(s.pointer.x, s.pointer.y, 0.5).unproject(ctx.camera);
      ray.origin.copy(ctx.camera.position);
      ray.direction.copy(v3).sub(ctx.camera.position).normalize();
      inv.copy(grains.matrixWorld).invert();
      ray.applyMatrix4(inv);
      if (ray.intersectPlane(plane, hit)) {
        const cs = Math.cos(-rot), sn = Math.sin(-rot);
        hit.set(cs * hit.x + sn * hit.z, hit.y, -sn * hit.x + cs * hit.z);
        if (pointerOn) u.uPointerVel.value.copy(hit).sub(lastHit).divideScalar(Math.max(s.dt, 0.004)).clampLength(0, 6);
        else u.uPointerVel.value.set(0, 0, 0);
        lastHit.copy(hit);
        u.uPointer.value.copy(hit);
        pointerOn = true;
      }
    } else { pointerOn = false; }
    u.uActive.value = pointerOn ? 1 : 0;
    u.uDt.value = Math.min(s.dt, 0.033);
    u.uTime.value = s.time;
    u.uGust.value = Math.min(1.2, Math.abs(s.gustVel) * 0.7);
    u.uGustDir.value.set(0.35 * Math.sin(s.time * 2.3), s.gustVel > 0 ? 1 : -1, 0.3 * Math.cos(s.time * 1.7));
    u.tOff.value = simA.textures[0];
    u.tVel.value = simA.textures[1];
    renderer.setRenderTarget(simB);
    renderer.render(simScene, simCam);
    renderer.setRenderTarget(null);
    const t = simA; simA = simB; simB = t;

    const d = drawMat.uniforms;
    d.tOff.value = simA.textures[0];
    d.uMix.value = mix;
    d.uAppear.value = appear;
    d.uTime.value = s.time;
    d.uRot.value = rot;
    d.uRefZ.value = ctx.camera.position.z;
    d.uPix.value = Math.max(1.2, 1.7 * s.H / 900) * s.dpr * (ctx.phone ? 0.8 : 1);
    d.uAlpha.value = 1;   // opaque lit grains (the additive glow needed per-shape alpha)
  }

  /* Portal circle in device pixels from the bottom left; r < 0 hides the chamber, r = Infinity shows it all. */
  function setPortal(x, y, r) { portal.uPortalC.value.set(x, y); portal.uPortalR.value = Math.min(r, 1e9); }

  return { group, update, switchTo, setPortal, get index() { return idx; }, count: N };
}
