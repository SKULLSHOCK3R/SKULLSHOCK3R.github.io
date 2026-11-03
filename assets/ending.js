/* Closing chamber, after igloo.inc's ending: the baked stone pedestal (pedestal.glb) under a spotlight with two glowing
   rings and a soft light cone, a glass vial over it, and inside a sculpture of fine grains: 120,000 on desktop,
   40,000 on phones. Grain rest positions come from Robin's 3D models (Luffy, the skull and crossbones, the envelope;
   models/*-points.bin, sampled in Blender) and live in float textures; about 38% form a bright inner layer under the
   grey outer one, each drifting along its own surface. A GPGPU pass (two half-float render targets, ping-pong, MRT
   offset + velocity) lets the cursor smear grains (fast ones glint) so they spring back over a few seconds, and lets
   scrolling gust through them. Switching a sculpture scatters the grains and rebuilds them as the next shape. The
   carousel DOM (arrows, current link, a sideways drag) is wired by app.js through switchTo(). */
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
uniform sampler2D tRestA,tRestB,tNrmA,tNrmB,tOff,tVel;uniform float uMix,uAppear,uTime,uRot,uPix,uRefZ,uAlpha,uInsetA,uInsetB;
uniform vec3 uVial;uniform int uW,uN;uniform float uJump;
in vec4 aRand;out float vA,vShade,vIn,vHot;out vec3 vN;
${NOISE3}
ivec2 cell(int i){i=((i%uN)+uN)%uN;return ivec2(i%uW,i/uW);}
// a grain's place on a rest chain at slot s (between two neighbours); across one of the chain's rare long jumps it
// snaps instead of streaking through the model
vec4 slot(sampler2D t,float s,out vec4 q){int i=int(floor(s));float f=fract(s);
 vec4 p0=texelFetch(t,cell(i),0),p1=texelFetch(t,cell(i+1),0);
 if(distance(p0.xyz,p1.xyz)>uJump)f=step(.5,f);q=vec4(f);return mix(p0,p1,f);}
// a current's head at time t: a slow loop round the sculpture's axis, wide enough in depth to leave the body and
// come back through it, sweeping up and down its whole height (uShape: the shape's base height and its height)
uniform vec2 uShape;
vec3 head(float k,float t){float w=t*(k<.5?.55:-.47)+k*2.4;
 return vec3(sin(w)*.32,uShape.x+uShape.y*(.5+.42*sin(w*1.7+k*1.3)),cos(w*1.3)*.3);}
vec3 currents(vec3 p,vec4 r){vec3 d=vec3(0.);
 for(int k=0;k<2;k++){float kk=float(k);
  for(int j=0;j<7;j++){float age=float(j)*.11,t=uTime-age;
   vec3 h=head(kk,t),tg=head(kk,t+.03)-h;
   float dd=dot(p-h,p-h),w=exp(-dd/.025)*(1.-age/.8);
   // most grains are nudged along; the few with high r.z are taken further, so the stream drags a trail out with it
   // (Robin, 2026-11-03: far too far out; igloo's stay within two or three grains of the surface)
   d+=normalize(tg+1e-5)*w*(.022+.07*step(.72,r.z)*r.z);}}
 return d;}
void main(){int id=gl_VertexID;ivec2 c=ivec2(id%uW,id/uW);vec4 r=aRand;
 // igloo.inc's grains travel freely over the whole surface yet the shape never thins (Robin's captures,
 // 2026-11-03): the rest points form one chain over the surface and every grain streams along it, each at its own
 // speed, half of them the other way, so every part of the surface always has grains passing through
 float s=float(id)+uTime*(7.+11.*r.y)*(r.x<.5?1.:-1.);
 s=mod(s,float(uN));   // never negative (GLSL % on negatives is undefined) and never so large fract() turns coarse
 vec4 fq;
 vec4 a=slot(tRestA,s,fq),b=slot(tRestB,s,fq);
 int i0=int(floor(s));float fn=fq.x;
 vec3 nA=mix(texelFetch(tNrmA,cell(i0),0).xyz,texelFetch(tNrmA,cell(i0+1),0).xyz,fn);
 vec3 nB=mix(texelFetch(tNrmB,cell(i0),0).xyz,texelFetch(tNrmB,cell(i0+1),0).xyz,fn);
 vec3 off=texelFetch(tOff,c,0).xyz;
 // the switch (after igloo.inc): grains leave from the bottom up, ride a rising swirl round the vial, glowing white
 // while they fly, and settle into the next shape; e is each grain's own progress, k its time in flight
 float hy=clamp((a.y-uVial.y)/(uVial.z-uVial.y),0.,1.);
 float st=hy*.35+r.x*.2;
 float e=smoothstep(st,st+.45,uMix),k=sin(e*3.14159);
 vec3 n=normalize(mix(nA,nB,e)+1e-4);
 // two layers (Robin, 2026-11-03, after igloo.inc): bright grains inside, dark grains on the surface
 float inner=step(r.w,.38);
 vec3 p=mix(a.xyz,b.xyz,smoothstep(.3,.7,e))-n*inner*mix(uInsetA,uInsetB,e)*(.55+.9*r.y);
 float ang=k*(2.2+r.y*2.6)*(r.z<.5?1.:.8),cs0=cos(ang),sn0=sin(ang);
 p=vec3(cs0*p.x-sn0*p.z,p.y,sn0*p.x+cs0*p.z);
 p.xz*=1.+k*(.25+.35*r.z);
 p.y+=k*(.12+.3*r.x)+k*sin(ang*1.3+r.y*6.)*.1;
 // the grains arrive from a glowing cloud at the centre (igloo.inc's ring transition), then build the sculpture
 vec3 dir=normalize(vec3(r.y-.5,r.z-.3,r.w-.5)+.001);
 float ap=smoothstep(r.x*.4,r.x*.4+.6,uAppear);
 p=mix(dir*(.45+r.z*.95)+vec3(0.,-.1,0.),p,ap);
 float al=.3+.7*ap;
 // the streaming above does the travelling; this only adds a little life, kept on the surface so the layers stay
 // apart until the cursor or a switch stirs them, and a few outer grains lift off and settle, softening the edge
 vec3 dr=curl(p*2.2+vec3(inner*5.,uTime*.9,uTime*.4))*.006*(.6+.8*r.y);
 p+=dr-n*dot(dr,n);
 // (the lifted outer grains that made a haze round the model are gone: Robin, 2026-11-03)
 // two currents (Robin, 2026-11-03, watching igloo.inc): two streams loop through the sculpture, diving into it and
 // out again; grains along each stream's recent path are pulled along its direction of travel, and a few of them
 // are carried well along with it, then let go and spring back
 // only the dark shell rides the currents, so where they pull it aside the bright layer underneath shows
 p+=currents(p,r)*(1.-inner);
 p+=off;
 // everything stays inside the vial, even when the cursor throws it about (Robin, 2026-11-03)
 float rad=length(p.xz),lim=uVial.x*(.93-.04*r.y);
 if(rad>lim)p.xz*=lim/rad;
 p.y=clamp(p.y,uVial.y+.02,uVial.z-.03);
 float cs=cos(uRot),sn=sin(uRot);vec3 q=vec3(cs*p.x+sn*p.z,p.y,-sn*p.x+cs*p.z);
 vN=vec3(cs*n.x+sn*n.z,n.y,-sn*n.x+cs*n.z);
 vec4 mv=modelViewMatrix*vec4(q,1.);gl_Position=projectionMatrix*mv;
 gl_PointSize=uPix*(.8+r.z*.7)*(inner>.5?.75:1.1)*(1.+.3*k)*(uRefZ/max(.1,-mv.z));
 // hot: in flight (a switch) or thrown by the cursor; hot grains glow white, the inner ones most
 float sp=length(texelFetch(tVel,c,0).xyz);
 vHot=clamp(k*(inner>.5?1.:.75)+smoothstep(.2,1.,sp)*(inner>.5?1.:.5),0.,1.);
 vA=al*uAlpha;vShade=mix(a.w,b.w,e);vIn=inner;}`;
/* Settled, the sculpture reads like igloo.inc's: dark slate grains, densely packed and lit as one solid (a key light
   from above and in front, a soft sky term, darker where the model's texture is dark, a faint cold rim); opaque and
   depth-tested. The bright inner grains add their light (alpha 0 in the premultiplied blend): hidden under the dark
   shell at rest, they show as white streams when a switch or the cursor stirs the grains. */
const DRAW_FS = /* glsl */`
precision highp float;in float vA,vShade,vIn,vHot;in vec3 vN;out vec4 fragColor;
void main(){vec2 c=gl_PointCoord-.5;float rr=dot(c,c);if(rr>.25)discard;
 float g=smoothstep(.25,0.,rr);
 if(vIn>.5){vec3 glow=vec3(.85,.92,1.)*g*(.24+1.4*vHot);fragColor=vec4(glow*vA,0.);return;}
 // each grain is a little lit bead (Robin's igloo.inc phone captures, 2026-11-03): its own sphere normal bent by the
 // sculpture's surface normal, so the surface reads as packed balls with a soft shadow between them
 vec3 ns=vec3(c.x*2.,-c.y*2.,sqrt(max(0.,1.-4.*rr)));
 vec3 n=normalize(normalize(vN)*.9+ns);
 float key=max(dot(n,normalize(vec3(-.35,.8,.55))),0.),sky=n.y*.5+.5,rim=pow(1.-abs(normalize(vN).z),3.);
 float l=(.06+.72*key+.14*sky)*(.45+.6*vShade)*(.5+.5*ns.z);
 vec3 col=mix(vec3(.025,.027,.034),vec3(.44,.46,.52),clamp(l,0.,1.1))+vec3(.45,.5,.62)*rim*.04;
 col=mix(col,vec3(.92,.95,1.),vHot*.8*g);
 float a=vA;fragColor=vec4(col*a,a);}`;

const SIM_VS = /* glsl */`void main(){gl_Position=vec4(position.xy,0.,1.);}`;
const SIM_FS = /* glsl */`
precision highp float;
uniform sampler2D tOff,tVel,tRest,tRand;uniform vec3 uPointer,uPointerVel,uGustDir;
uniform float uDt,uRadius,uStrength,uGust,uActive,uTime,uJump,uRot;uniform int uW,uN;
layout(location=0) out vec4 oOff;layout(location=1) out vec4 oVel;
${NOISE3}
ivec2 cell(int i){i=((i%uN)+uN)%uN;return ivec2(i%uW,i/uW);}
void main(){ivec2 c=ivec2(gl_FragCoord.xy);
 // where this grain is drawn right now: the same place on the streaming chain as the draw pass (Robin, 2026-11-03:
 // touching the feet moved grains in the face, because the cursor was tested against the grain's old fixed slot)
 vec4 r=texelFetch(tRand,c,0);
 float s=float(c.y*uW+c.x)+uTime*(7.+11.*r.y)*(r.x<.5?1.:-1.);
 s=mod(s,float(uN));   // the same wrap as the draw pass
 int i0=int(floor(s));float fs=fract(s);
 vec4 q0=texelFetch(tRest,cell(i0),0),q1=texelFetch(tRest,cell(i0+1),0);
 if(distance(q0.xyz,q1.xyz)>uJump)fs=step(.5,fs);
 vec4 rest=mix(q0,q1,fs);vec3 off=texelFetch(tOff,c,0).xyz;vec3 vel=texelFetch(tVel,c,0).xyz;
 vec3 p=rest.xyz+off;float h=hash3(vec3(c,7.));
 // test the cursor against the grain as it sits now, turned with the sculpture, so everything in front of and
 // behind the cursor is caught whichever side of the model has turned to face it (Robin, 2026-11-03)
 float cr=cos(uRot),sr=sin(uRot);vec3 pv=vec3(cr*p.x+sr*p.z,p.y,-sr*p.x+cr*p.z);
 vec2 d=pv.xy-uPointer.xy;float dist=length(d);
 // the cursor throws the dark shell about but barely moves the bright inner grains, which then show through
 float f=smoothstep(uRadius,uRadius*.1,dist)*uActive*(r.w<.38?.3:1.);
 // igloo.inc's flick (measured there 2026-11-03): a narrow band about a fourteenth of the model's height is caught and
 // dragged out along the cursor's path as one tongue, about a third of the model's width, then sprays and settles
 vec3 pushV=(vec3(normalize(d+1e-4),0.)*.15+uPointerVel*1.4+vec3(0.,0.,(h-.5)*.5))*f*uStrength;
 vec3 push=vec3(cr*pushV.x-sr*pushV.z,pushV.y,sr*pushV.x+cr*pushV.z);   // back into the sculpture's own frame
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

// the vial's glass: edge-on it glows (fresnel), face-on it is nearly clear, with a slow sheen running up it
const VIAL_FS = /* glsl */`precision highp float;uniform float uTime;varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){float fr=pow(1.-abs(dot(normalize(vN),normalize(vV))),3.);
 float sheen=smoothstep(.06,0.,abs(fract(vUv.y*.6-uTime*.04)-.5)-.38);
 float a=(fr*.22+.012+sheen*fr*.08)*(.55+.45*vUv.y);
 gl_FragColor=vec4(vec3(.6,.74,1.)*a,a);}`;

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
  // the glass vial over the sculpture (brief, 2026-11-03): bright only at its edges, a faint triangulated wire in
  // the glass and a ring of light around its rim; drawn after the grains, so the back wall stays hidden behind them
  const VR = 1.02, VH = 2.95, vialY = top + VH / 2 - 0.02;
  const vialMat = new THREE.ShaderMaterial({ vertexShader: CONE_VS, fragmentShader: VIAL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } } });
  portalize(vialMat);
  const vial = new THREE.Mesh(new THREE.CylinderGeometry(VR, VR, VH, 72, 1, true), vialMat);
  vial.position.y = vialY;
  vial.renderOrder = 7;
  const wireMat = portalize(new THREE.LineBasicMaterial({ color: 0x8fb0ff, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false }));
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.CylinderGeometry(VR * 1.002, VR * 1.002, VH, 16, 6, true)), wireMat);
  wire.position.y = vialY;
  wire.renderOrder = 7;
  const lipMat = portalize(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.7, 1.0).multiplyScalar(2.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(VR, 0.007, 6, 140), lipMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = vialY + VH / 2;
  group.add(vial, wire, lip);
  // a pale haze filling the vial behind the sculpture, so the dark grains read against light as igloo.inc's do
  const hazeMat = portalize(new THREE.ShaderMaterial({
    vertexShader: CONE_VS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: `precision highp float;varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){vec2 d=(vUv-vec2(.5,.48))*vec2(1.25,.9);float a=smoothstep(.5,0.,length(d))*.34;gl_FragColor=vec4(vec3(.5,.56,.68)*a,a);}`
  }));
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(VR * 2.1, VH), hazeMat);
  haze.position.set(0, vialY, -VR * 0.75);
  haze.renderOrder = 4;
  group.add(haze);

  // ---- grain rest positions as float textures ----
  // Luffy: grains over the surface of the real 3D model (build_characters.py "points" mode), with normals; the flat
  // drawings (and Luffy, if the file is missing) face the viewer
  const flat = () => { const a = new Float32Array(N * 4); for (let i = 0; i < N; i++) { a[i * 4 + 2] = 1; a[i * 4 + 3] = 1; } return a; };
  async function loadPoints(url, height, baseY) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url + ' ' + res.status);
    const buf = await res.arrayBuffer();
    const [total, ext] = new Float32Array(buf, 0, 2);
    const P = new Int16Array(buf, 8, total * 3), Nr = new Int8Array(buf, 8 + total * 6, total * 3), S = new Uint8Array(buf, 8 + total * 9, total);
    let ymax = 1;
    for (let i = 0; i < total; i++) ymax = Math.max(ymax, P[i * 3 + 1]);
    const k = height / ymax, pos = new Float32Array(N * 4), nrm = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const j = Math.floor(i * total / N);   // the file is one chain over the surface: take it evenly, in order
      pos[i * 4] = P[j * 3] * k; pos[i * 4 + 1] = baseY + P[j * 3 + 1] * k; pos[i * 4 + 2] = P[j * 3 + 2] * k;
      pos[i * 4 + 3] = S[j] / 255;
      nrm[i * 4] = Nr[j * 3] / 127; nrm[i * 4 + 1] = Nr[j * 3 + 1] / 127; nrm[i * 4 + 2] = Nr[j * 3 + 2] / 127; nrm[i * 4 + 3] = 1;
    }
    return { pos, nrm };
  }
  // Robin's three 3D models (2026-11-03: the Luffy statue, base cut off; the skull and crossbones; the envelope),
  // sampled in Blender as one chain over each surface; if a file fails to load, that shape falls back to its old
  // flat drawing (Luffy's mask) so the chamber never comes up empty
  const normals = {}, data = {};
  const flatShape = {
    luffy: async () => sample(await loadMask('assets/luffy-mask.png'), N, 2.5, 0.27, top + HOVER, 11, new Float32Array(N * 4), normals.luffy),
    jolly: async () => sample(drawJolly(300), N, 1.9, 0.32, top + 0.35, 12, new Float32Array(N * 4), normals.jolly),
    mail: async () => sample(drawMail(240), N, 1.25, 0.15, top + 0.6, 13, new Float32Array(N * 4), normals.mail)
  };
  const MODELS = { luffy: [2.45, top + HOVER], jolly: [1.95, top + 0.3], mail: [1.3, top + 0.55] };
  await Promise.all(Object.keys(MODELS).map(async (k) => {
    try {
      const r = await loadPoints('assets/models/' + k + '-points.bin', MODELS[k][0], MODELS[k][1]);
      data[k] = r.pos; normals[k] = r.nrm;
    } catch (e) {
      normals[k] = new Float32Array(N * 4);
      data[k] = await flatShape[k]();
    }
  }));
  // how deep the bright inner layer sits under the grey outer one, per shape (the envelope is only 0.1 thick)
  // kept just under the surface: a deeper inset went straight through thin parts (hat brims, the shirt hem, sandal
  // soles) and left bright grains showing on the far side (Robin, 2026-11-03)
  const INSET = { luffy: 0.006, jolly: 0.006, mail: 0.005 };
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
      uDt: { value: 0.016 }, uRadius: { value: 0.2 }, uStrength: { value: 30 },
      tRand: { value: null }, uRot: { value: 0 }, uJump: { value: ctx.phone ? 0.075 : 0.05 }, uW: { value: W }, uN: { value: N }, uGust: { value: 0 }, uActive: { value: 0 }, uTime: { value: 0 }
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
  simMat.uniforms.tRand.value = restTexture(rand);   // the simulation streams each grain exactly as the draw pass does
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  const drawMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: DRAW_VS, fragmentShader: DRAW_FS, transparent: true, depthWrite: true,
    depthTest: true, blending: THREE.NormalBlending, premultipliedAlpha: true,
    uniforms: {
      tRestA: { value: restA }, tRestB: { value: restB }, tNrmA: { value: nrmA }, tNrmB: { value: nrmB }, tOff: { value: simA.textures[0] },
      tVel: { value: simA.textures[1] }, uInsetA: { value: INSET.luffy }, uInsetB: { value: INSET.luffy },
      uVial: { value: new THREE.Vector3(VR, top, top + VH) }, uShape: { value: new THREE.Vector2(MODELS.luffy[1], MODELS.luffy[0]) }, uN: { value: N }, uJump: { value: ctx.phone ? 0.075 : 0.05 },
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
    drawMat.uniforms.uInsetA.value = INSET[from];
    drawMat.uniforms.uInsetB.value = INSET[to];
    drawMat.uniforms.uShape.value.set(MODELS[to][1], MODELS[to][0]);
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
    mix = Math.min(1, mix + s.dt / 2.6);
    group.updateMatrixWorld();
    coneMat.uniforms.uTime.value = s.time;
    ring2.rotation.z = s.time * 0.05;
    ring3.rotation.z = -s.time * 0.12;

    // pointer onto the chamber's front plane (not un-spun: the simulation turns each grain to meet it)
    // a full turn every 8 s, as igloo.inc's sculptures turn at rest (timed there, 2026-11-03)
    const rot = s.time * Math.PI * 2 / 8;
    const u = simMat.uniforms;
    if (s.pointer.active) {
      v3.set(s.pointer.x, s.pointer.y, 0.5).unproject(ctx.camera);
      ray.origin.copy(ctx.camera.position);
      ray.direction.copy(v3).sub(ctx.camera.position).normalize();
      inv.copy(grains.matrixWorld).invert();
      ray.applyMatrix4(inv);
      if (ray.intersectPlane(plane, hit)) {
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
    u.uRot.value = rot;   // the simulation tests the cursor against the turned sculpture
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
    d.tVel.value = simA.textures[1];
    vialMat.uniforms.uTime.value = s.time;
    d.uMix.value = mix;
    d.uAppear.value = appear;
    d.uTime.value = s.time;
    d.uRot.value = rot;
    d.uRefZ.value = ctx.camera.position.z;
    // big beads like igloo.inc's, packed edge to edge (fewer grains on phones, so theirs are bigger still)
    d.uPix.value = Math.max(2, 2.8 * s.H / 900) * s.dpr * (ctx.phone ? 0.95 : 1);
    d.uAlpha.value = 1;   // opaque lit grains (the additive glow needed per-shape alpha)
  }

  /* Portal circle in device pixels from the bottom left; r < 0 hides the chamber, r = Infinity shows it all. */
  function setPortal(x, y, r) { portal.uPortalC.value.set(x, y); portal.uPortalR.value = Math.min(r, 1e9); }

  return { group, update, switchTo, setPortal, get index() { return idx; }, count: N };
}
