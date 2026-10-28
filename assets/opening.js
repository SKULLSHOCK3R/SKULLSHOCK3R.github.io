/* Opening scene: storm sky (blue-grey, Robin's choice), two cloud decks, slanted rain, lightning that lights the
   clouds and the figures, drifting fog, Luffy from behind holding the world and Imu across the storm.
   Everything is drawn inside the one three.js scene so the post-processing covers it:
     sky      fullscreen quad at the back (procedural, or a photoreal plate if one is supplied, see PLATE below)
     bolt     a 2D canvas of the current lightning bolt, added over the sky
     figures  camera-facing planes: first the SVG silhouettes rasterised to textures, then (2026-10-26) the photoreal
              Blender renders from figures.js RENDERS, a still PNG as soon as it loads and the looping WebM once it can
              play (alpha packed beside the colour, see FIG_FS); the SVG stays as the fallback when a file is missing.
              Lightning still rims them, Imu's eyes glow (never blinking) as their own layers over the render's dark face
     fog      fullscreen quad in front of the figures: ground fog plus the nearest rain
   PLATE (drop-in slot): put a photoreal still at assets/plates/hero.jpg or a clip at assets/plates/hero.mp4, name it
   in index.html (<meta name="hero-plate" content="assets/plates/hero.mp4">), and the sky quad uses it, cover-fitted,
   as the background under the rain, lightning and fog (the procedural clouds are blended down). */
import * as THREE from 'three';
import { NOISE2, LIN } from './glsl.js?v=3';
import { SVG, FRAMES, RENDERS, renderSize, svgTexture, loadStill, loadVideo } from './figures.js?v=15';

const FULL_VS = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;

const SKY_FS = /* glsl */`
precision highp float;
uniform vec2 uRes,uPlateSize;uniform float uTime,uFlash,uFlashX,uDark,uChamber,uHasPlate;uniform sampler2D uPlate;
uniform vec3 uGlobe;   // the globe's position (backdrop uv) and its light (0 once it leaves Luffy's hand)
uniform vec2 uPan;
varying vec2 vUv;
${NOISE2}${LIN}
float asp;
// the storm sky at uv: gradient, two cloud decks, the plate if one is loaded, the lightning glow; called twice, once
// directly and once mirrored at the horizon for the reflections in the water and the wet ground
vec3 skyAt(vec2 uv){
 vec2 p=vec2(uv.x*asp,uv.y);float t=uTime;
 vec3 col=mix(vec3(.004,.006,.011),vec3(.030,.036,.052),smoothstep(0.,.95,uv.y));
 float c1=fbm(p*vec2(1.5,2.4)+vec2(t*.016,t*.005));
 float c2=fbm(p*vec2(3.1,4.8)+vec2(-t*.028,t*.009)+c1*1.6);
 float cloud=smoothstep(.32,.86,c1*.6+c2*.55)*smoothstep(.12,.7,uv.y);
 col=mix(col,mix(vec3(.010,.012,.018),vec3(.075,.085,.115),c2),cloud);
 if(uHasPlate>.5){
  float pa=uPlateSize.x/max(uPlateSize.y,1.);vec2 q=uv-.5;
  if(pa>asp)q.x*=asp/pa;else q.y*=pa/asp;
  col=mix(col,texture2D(uPlate,clamp(q+.5,.001,.999)).rgb*(.75+.25*c2),uHasPlate);
 }
 float d=abs(uv.x-uFlashX)*asp;
 col+=lin(vec3(.74,.42,1.))*uFlash*1.5*exp(-d*2.0)*(.35+.9*c2)*smoothstep(.15,.9,uv.y)+lin(vec3(.11,.06,.15))*uFlash;
 return col;
}
void main(){
 // uPan: the backdrop moves with the camera, so the scene stays put and only the view changes (Robin, 2026-10-27:
 // "camera moves and models stay stuck"; painted flat on the screen, it made the figures seem to slide over it)
 vec2 uv=vUv+uPan;asp=uRes.x/uRes.y;vec2 p=vec2(uv.x*asp,uv.y);float t=uTime;
 // the horizon: the plate's sea line (plate v .461), wherever the cover fit puts it on this screen
 float pa=uPlateSize.x/max(uPlateSize.y,1.);
 float hz=uHasPlate>.5?(pa>asp?.461:.5+(.461-.5)*asp/pa):.46;
 vec3 col=skyAt(uv);
 // below the horizon (Robin, 2026-10-27, "more photorealistic"): the sea and, in front, a wet dark shore where Luffy
 // stands. Both reflect the sky mirrored at the horizon; rain rings are small waves that bend the reflection and catch
 // glints, each drop landing with a bright hit and two droplets thrown up; a light wind chop roughens the water
 float shore=hz-.29+.035*sin(p.x*2.3+.7)+.03*(fbm3(vec2(p.x*1.7,3.1))-.5);
 float land=0.,spl=0.;vec2 nrm=vec2(0.);
 if(uv.y<hz){
  float gz=.12/max(hz-uv.y,.012);vec2 g=vec2((uv.x-.5)*asp*gz*2.,gz*4.);
  land=smoothstep(shore+.004,shore-.004,uv.y);
  // wind chop: fine moving waves on the sea, almost none on the shore
  nrm+=vec2(noise(g*vec2(9.,3.)+vec2(t*.6,t*.2))-.5,noise(g*vec2(7.,2.5)-vec2(t*.4,t*.3))-.5)*mix(1.,.15,land);
  for(int i=0;i<2;i++){float fi=float(i);
   vec2 cg=g*(5.+fi*3.)+fi*7.3;vec2 id=floor(cg);vec2 f=fract(cg)-.5;
   float h=hash(id+fi*2.7);float ph=fract(t*(.9+h*.5)+h*9.);
   vec2 o=vec2(hash(id+1.3),hash(id+5.1))-.5;vec2 q=f-o*.5;
   float on=step(.35,h);vec2 qs=q*vec2(1.,2.2);float dd=length(qs);
   // the ring as a travelling wave: its slope tilts the surface outward on the front and inward behind
   float x=(dd-ph*.45)/.03;
   nrm+=normalize(qs+1e-5)*(-x*exp(-x*x))*(1.-ph)*1.6*on;
   float s=ph/.16;
   if(s<1.){
    spl+=smoothstep(.06,0.,dd)*(1.-s)*2.*on;
    for(int k=0;k<2;k++){float sd=float(k)*2.-1.;
     vec2 dp=vec2(sd*(.05+.05*h)*s,(.22+.1*h)*s-.3*s*s);
     vec2 dq=q-dp;dq.y*=.55;           // a short vertical smear: the droplet is moving fast
     spl+=smoothstep(.02,0.,length(dq))*(1.-s*.7)*1.5*on;}
   }}
  float near=smoothstep(hz,hz-.25,uv.y);
  vec2 ruv=vec2(uv.x+nrm.x*.012*near,2.*hz-uv.y+nrm.y*.02*near+.004);
  vec3 refl=skyAt(ruv);
  // the sea: the plate's own water with the mirrored sky over it, stronger towards the horizon (Fresnel)
  float fres=mix(.6,.22,near);
  vec3 sea=mix(col,refl*.55,fres);
  // the shore: dark wet rock, mirror-like in the puddles, and only a dull sheen elsewhere
  float rock=fbm(g*vec2(1.4,1.)*3.);
  float pud=smoothstep(.54,.62,fbm(g*1.1+vec2(4.2,1.3)));
  vec3 wet=vec3(.008,.009,.012)*(.6+.8*rock);
  wet=mix(wet+refl*.07,refl*.42,pud);
  col=mix(sea,wet,land);
  // glints: ring slopes catch the bright sky and the lightning
  float slope=length(nrm-vec2(noise(g*vec2(9.,3.)+vec2(t*.6,t*.2))-.5,noise(g*vec2(7.,2.5)-vec2(t*.4,t*.3))-.5)*mix(1.,.15,land));
  col+=refl*smoothstep(.15,.9,slope)*.9*near+lin(vec3(.72,.45,1.))*uFlash*slope*.3*near;
  col+=vec3(.12,.14,.18)*spl*near*(1.+uFlash*3.);
  // the globe as a point light over the shore (Robin, 2026-10-27: "let the light dissipate in a sphere getting weaker
  // as it moves out from the source ... like real light", not a column). In ground-plane units (camera height 1,
  // focal .12, as for gz above) the globe floats at Luffy's depth (his feet at the bottom of the view) at the height
  // its screen position gives; each point of the ground and water is lit by inverse-square falloff times the angle
  // the light arrives at, so the pool is round on the ground and fades evenly outward. Its reflection is the globe's
  // own mirror image in the wet surface: a round glow, broken up by the ripple slopes, brightest in the puddles
  if(uGlobe.z>0.){
   float Dg=.12/max(hz,.05);
   float Hg=max((.12-(hz-uGlobe.y)*Dg)/.12,.05);
   vec3 P=vec3((uv.x-.5)*asp*gz/.12,0.,gz);
   vec3 G=vec3((uGlobe.x-.5)*asp*Dg/.12,Hg,Dg);
   vec3 Lv=G-P;float r2=dot(Lv,Lv);
   float lit=max(Lv.y,0.)/(r2*sqrt(r2))*Hg*Hg*Hg;              // 1 right under it, falling off as a real light does
   float gyR=hz-.12*(1.+Hg)/Dg;                                // where its mirror image falls on flat water
   vec2 hd=vec2((uv.x-uGlobe.x)*asp,uv.y-gyR)+nrm*vec2(.012,.02)*near;
   float halo=exp(-dot(hd,hd)/.0016);
   float wetk=mix(1.,.35+pud,land);
   col+=lin(vec3(.35,.62,1.))*uGlobe.z*(lit*(.22+.9*smoothstep(.1,.7,slope))*wetk*.6+halo*.35*wetk);
  }
  // foam where the water meets the shore
  col+=vec3(.05,.06,.08)*smoothstep(.01,0.,abs(uv.y-shore))*(.4+.6*noise(vec2(p.x*20.,t*.6)))*(1.+uFlash*3.);
 }
 float fog=fbm3(vec2(p.x*1.3+t*.02,uv.y*3.-t*.012));
 col=mix(col,vec3(.030,.034,.044)+vec3(.1)*uFlash,smoothstep(.5,0.,uv.y)*(.18+.3*fog));
 float r=0.;
 for(int i=0;i<3;i++){float fi=float(i);
  vec2 q=vec2(p.x*(60.+fi*45.)+p.y*(7.+fi*5.),p.y*(3.+fi*1.5)+t*(4.5+fi*2.5));
  vec2 id=floor(q);float h=hash(id+fi*7.1);vec2 f=fract(q);
  r+=smoothstep(.07,0.,abs(f.x-h))*smoothstep(0.,.35,f.y)*smoothstep(1.,.55,f.y)*step(.62,h)*(.06-fi*.014);}
 col+=vec3(.22,.26,.34)*r*(1.+uFlash*2.5);
 col*=uDark*mix(.55,1.,smoothstep(1.25,.25,length((uv-vec2(.5,.55))*vec2(asp*.8,1.))));
 vec3 ch=lin(vec3(.05,.065,.10))*smoothstep(1.05,.05,length((uv-vec2(.5,.42))*vec2(asp,1.2)))+lin(vec3(.01,.012,.02));
 col=mix(col,ch,uChamber);
 gl_FragColor=vec4(col,1.);}`;

const FOG_FS = /* glsl */`
precision highp float;
uniform vec2 uRes,uPan;uniform float uTime,uFlash,uFade;varying vec2 vUv;
${NOISE2}${LIN}
void main(){vec2 uv=vUv+uPan;float asp=uRes.x/uRes.y;vec2 p=vec2(uv.x*asp,uv.y);
 float f=fbm3(vec2(uv.x*asp*1.8+uTime*.045,uv.y*3.5-uTime*.015));
 float f2=fbm3(vec2(uv.x*asp*3.6-uTime*.07,uv.y*6.)+f*1.4);
 float a=smoothstep(.45,0.,uv.y)*(.25+.75*f2)*.7*uFade;
 vec3 c=vec3(.028,.032,.040)+vec3(.17,.10,.22)*uFlash*.6;
 float r=0.;
 for(int i=0;i<2;i++){float fi=float(i);
  vec2 q=vec2(p.x*(30.+fi*18.)+p.y*(4.+fi*3.),p.y*(3.2+fi*1.4)+uTime*(4.+fi*1.8));
  vec2 id=floor(q);float h=hash(id+fi*3.3);vec2 fr=fract(q);
  r+=smoothstep(.04,0.,abs(fr.x-h))*smoothstep(0.,.3,fr.y)*smoothstep(1.,.5,fr.y)*step(.86,h)*(.09-fi*.03);}
 r*=uFade;
 vec3 rc=vec3(.3,.34,.42)*r*(1.+uFlash*2.);
 gl_FragColor=vec4(c*a+rc,a+r*.4);}`;

const FIG_VS = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

/* The wet rock Luffy stands on (Robin, 2026-10-27; asset-src/build_rock.py): its storm-lit render, plus live light from
   the scene through its camera-space normals and wet albedo: the purple lightning from the sky beyond him, with sharp
   wet highlights, and the globe's blue light when it shines. Premultiplied output, like the figures. */
const ROCK_FS = /* glsl */`
precision highp float;
uniform sampler2D map,nrm,alb,lmap;uniform float uFlash,uFlashX,uOpacity,uAsp;uniform vec3 uGlobe;varying vec2 vUv;
// Luffy's shadow (Robin, 2026-10-27): his own frame (the live video's alpha), rows in mask pixels: the rock's frame
// (uRowA, uRowB), his (uLy0, uLh), where his soles meet the stone (uFeet); the light is beyond him, so the shadow falls
// toward the camera, down the rock, his height squashed (uSquash) and leaning away from the flash
uniform float lPacked,lPackW,lAlphaX,uRowA,uRowB,uLy0,uLh,uFeet,uSquash;
${LIN}
float la(vec2 t){
 if(t.x<0.||t.x>1.||t.y<0.||t.y>1.)return 0.;
 return lPacked>.5?texture2D(lmap,vec2(lAlphaX+t.x*lPackW,t.y)).r:texture2D(lmap,t).a;}
void main(){
 vec4 c=texture2D(map,vUv);
 vec3 n=normalize(texture2D(nrm,vUv).rgb*2.-1.);
 vec3 a=texture2D(alb,vUv).rgb;
 vec3 V=vec3(0.,0.,1.);
 float row=uRowA+(1.-vUv.y)*uRowB,d=max(row-uFeet,0.);
 float lean=(.5-uFlashX)*.0016*d;
 float src=uFeet-d*uSquash;
 float sh=0.;
 for(int i=-2;i<=2;i++){float o=float(i)*(.002+.00025*d);   // softer the further it falls
  sh+=la(vec2(vUv.x+lean+o,1.-(src-uLy0)/uLh));}
 sh=clamp(sh/5.,0.,1.)*smoothstep(-2.,3.,row-uFeet);   // full strength across the rock: a cast shadow does not fade
 // contact: right under his soles, dark and tight
 float con=0.;
 for(int i=-1;i<=1;i++)con+=la(vec2(vUv.x+float(i)*.003,1.-(uFeet-3.-uLy0)/uLh));
 con=clamp(con/3.,0.,1.)*exp(-d/7.);
 // in shadow the rock takes the tone of the shaded backs of his calves (Robin, 2026-10-27: "the same intensity ... as
 // what you see at the back of his feet/calves"; measured on the 4K render: sRGB about 32,27,28)
 vec3 calf=vec3(.0144,.0110,.0116);
 vec3 col=mix(c.rgb,min(c.rgb,calf),max(sh,con));
 // lightning: from the sky beyond him, above, toward the flash; where he blocks it, his shadow stays dark
 vec3 L=normalize(vec3((uFlashX-.5)*1.4,.9,-.35));
 float dif=max(dot(n,L),0.),spec=pow(max(dot(n,normalize(L+V)),0.),48.);
 col+=lin(vec3(.74,.42,1.))*uFlash*(a*dif*1.6+spec*.9)*(1.-sh)*(1.-con);
 // the globe's light, from where it floats above his hand
 if(uGlobe.z>0.){
  vec2 gd=(uGlobe.xy-vUv)*vec2(uAsp,1.);
  vec3 G=normalize(vec3(gd,.35));
  float fall=exp(-length(gd)*1.6);
  float gs=pow(max(dot(n,normalize(G+V)),0.),40.);
  col+=lin(vec3(.35,.62,1.))*uGlobe.z*fall*(a*max(dot(n,G),0.)*1.2+gs*.7)*(1.-.7*con);
 }
 // its base sunk into the dark wet shore, so the rock rests in the ground instead of hanging over it (seen when the
 // camera pans down, 2026-10-27): the lower part fades to the shore's colour, and the rounded underside is filled in
 float base=smoothstep(.0,.42,vUv.y+(fract(sin(dot(floor(vUv*vec2(140.,40.)),vec2(12.9898,78.233)))*43758.5453)-.5)*.05);
 vec3 shore=vec3(.006,.007,.010)*(1.+uFlash*2.);
 col=mix(shore,col,base);
 float al=max(c.a,1.-smoothstep(.0,.3,vUv.y))*uOpacity;
 gl_FragColor=vec4(col*al,al);}`;
const ROCK = { y0: 700, h: 330, feet: 795, map: 'assets/figures/rock.png?v=1', nrm: 'assets/figures/rock-normal.png?v=1', alb: 'assets/figures/rock-albedo.png?v=1' };
/* Two texture layouts: a straight-alpha RGBA image (SVG raster or still PNG, uploaded as sRGB), or uPacked: the video,
   uploaded linearly, with the colour in the left uPackW of the frame and the alpha as grey from uAlphaX on (so the
   alpha is never gamma-decoded); the colour is sRGB-decoded here. Output is premultiplied either way. */
const FIG_FS = /* glsl */`
precision highp float;
uniform sampler2D map;uniform float uTime,uFlash,uWave,uHair,uOpacity,uPacked,uPackW,uAlphaX,uFoot,uSea,uRefl;uniform vec2 uFlashDir;varying vec2 vUv;
uniform vec3 uGlobe;   // the globe in this plane's uv and its light (Luffy only)
${NOISE2}${LIN}
float alphaAt(vec2 t){return uPacked>.5?texture2D(map,vec2(uAlphaX+t.x*uPackW,t.y)).r:texture2D(map,t).a;}
void main(){vec2 uv=vUv;
 // uRefl: this plane is the figure's reflection in the water below it (Imu only, Robin 2026-10-27): the texture flipped,
 // rippled sideways more the further it is from the base, darkened and fading out with distance
 float fy=vUv.y;
 if(uRefl>0.){
  fy=1.-vUv.y;float far=1.-vUv.y;
  uv=vec2(vUv.x+(noise(vec2(vUv.y*34.-uTime*1.1,vUv.x*3.))-.5)*.06*(.25+far),
          fy+(noise(vec2(vUv.x*5.,vUv.y*26.+uTime*.9))-.5)*.012*far);
 }
 float cloak=smoothstep(.72,.45,uv.y)*uWave;
 float gust=max(0.,sin(uTime*.37))*sin(uTime*2.1)*.5+.5;
 uv.x+=(noise(vec2(uv.x*3.+uTime*.5,uv.y*5.-uTime*.9))-.5)*.035*cloak*(.6+gust);
 uv.y+=(noise(vec2(uv.x*4.-uTime*.4,uv.y*7.+uTime*.6))-.5)*.012*cloak;
 float hair=smoothstep(.8,.9,uv.y)*uHair;
 uv.x+=(noise(vec2(uv.x*18.+uTime*3.,uv.y*18.))-.5)*.01*hair;
 vec3 col;float a;
 if(uPacked>.5){
  vec2 cuv=vec2(uv.x*uPackW,uv.y),auv=vec2(uAlphaX+uv.x*uPackW,uv.y);
  col=lin(texture2D(map,cuv).rgb);a=texture2D(map,auv).r;
  float a2=texture2D(map,auv+uFlashDir*vec2(.012*uPackW,.012)).r;
  col+=lin(vec3(.75,.5,1.))*clamp(a-a2,0.,1.)*uFlash*1.6;
 }else{
  vec4 c=texture2D(map,uv);
  float a2=texture2D(map,uv+uFlashDir*.012).a;
  col=c.rgb+lin(vec3(.75,.5,1.))*clamp(c.a-a2,0.,1.)*uFlash*1.6;a=c.a;
 }
 // the globe lights him (Robin, 2026-10-27): a blue rim on the edges that face it and a soft fill falling off with
 // distance (hat brim, raised hand, the coat's shoulder)
 if(uGlobe.z>0.&&a>0.){
  vec2 gd=(uGlobe.xy-vUv)*vec2(1.,1.45);vec2 dir=normalize(gd+1e-5);
  float rim=clamp(a-alphaAt(uv+dir*vec2(.012,.0083)),0.,1.);
  float fall=exp(-length(gd)*3.2);
  col+=lin(vec3(.35,.62,1.))*(rim*2.4+.07)*fall*uGlobe.z;
 }
 // uSea: the base fades into the dark sea's colour over that fraction of the height, staying opaque (Imu stands in the
 // water; Robin, 2026-10-27: no see-through base); uFoot: only the last sliver's edge is softened, over the dark water
 if(uSea>0.)col=mix(vec3(.006,.007,.010)*(1.+uFlash*2.),col,smoothstep(0.,uSea,fy+(noise(vec2(vUv.x*9.,uTime*.25))-.5)*uSea*.6));
 if(uRefl>0.){col*=.6;a*=uRefl*smoothstep(0.,.85,vUv.y);}
 else if(uFoot>0.)a*=smoothstep(0.,uFoot,vUv.y+(noise(vec2(vUv.x*14.,uTime*.3))-.5)*uFoot*.5);
 a*=uOpacity;
 gl_FragColor=vec4(col*a,a);}`;

function fullscreen(material, order) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  m.frustumCulled = false;
  m.renderOrder = order;
  material.depthTest = false;
  material.depthWrite = false;
  return m;
}

export async function createOpening(ctx) {
  const group = new THREE.Group();
  group.name = 'opening';

  // ---- sky ----
  const sky = new THREE.ShaderMaterial({
    vertexShader: FULL_VS, fragmentShader: SKY_FS,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) }, uPlateSize: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uFlash: { value: 0 }, uFlashX: { value: 0.5 }, uDark: { value: 1 }, uChamber: { value: 0 }, uHasPlate: { value: 0 },
      uPlate: { value: null }, uGlobe: { value: new THREE.Vector3(0.5, 0.7, 0) }, uPan: { value: new THREE.Vector2() }
    }
  });
  const skyMesh = fullscreen(sky, -100);
  group.add(skyMesh);
  probePlate(sky);

  // ---- lightning bolt layer ----
  const boltCanvas = document.createElement('canvas');
  const bctx = boltCanvas.getContext('2d');
  const boltTex = new THREE.CanvasTexture(boltCanvas);
  boltTex.colorSpace = THREE.SRGBColorSpace;
  const boltMat = new THREE.MeshBasicMaterial({ map: boltTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
  const boltMesh = fullscreen(boltMat, -90);   // a positioned plane (MeshBasicMaterial), scaled to the view each frame
  boltMesh.position.set(0, 0, -4);
  group.add(boltMesh);

  // ---- fog and front rain ----
  const fog = new THREE.ShaderMaterial({
    vertexShader: FULL_VS, fragmentShader: FOG_FS, transparent: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uPan: { value: new THREE.Vector2() }, uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 } }
  });
  const fogMesh = fullscreen(fog, 50);
  group.add(fogMesh);

  // ---- figures ----
  const px = ctx.phone ? 900 : 1400;
  const [luffyTex, imuTex, eyesTex, glowTex] = await Promise.all([
    svgTexture(SVG.luffy, FRAMES.luffy, px), svgTexture(SVG.imu, FRAMES.imu, px),
    // Imu's eyes: the photoreal Blender render (asset-src/build_imu_eyes.py, the same frame as FRAMES.imuEyes), the
    // drawn SVG eyes only if it cannot load (Robin, 2026-10-27: "build Imu's eyes in Blender ... extra sharp")
    loadStill('assets/figures/imu-eyes.png?v=1').catch(() => svgTexture(SVG.imuEyes, FRAMES.imuEyes, 1024)),
    svgTexture(SVG.imuGlow, FRAMES.imuGlow, 360)
  ]);
  function figure(tex, frame, wave, hair, order) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: FIG_VS, fragmentShader: FIG_FS, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        map: { value: tex }, uTime: { value: 0 }, uFlash: { value: 0 }, uWave: { value: wave }, uHair: { value: hair },
        uOpacity: { value: 1 }, uFlashDir: { value: new THREE.Vector2(0.3, 0.3) },
        uPacked: { value: 0 }, uPackW: { value: 1 }, uAlphaX: { value: 0 }, uFoot: { value: 0 }, uSea: { value: 0 }, uRefl: { value: 0 }, uGlobe: { value: new THREE.Vector3(0, 0, 0) }
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.renderOrder = order;
    m.userData.frame = frame;       // the texture's extent in figure units (switches with the texture)
    m.userData.video = null;
    group.add(m);
    return m;
  }
  const luffy = figure(luffyTex, FRAMES.luffy, 1, 1, 10);
  const imu = figure(imuTex, FRAMES.imu, 0.35, 0, 8);
  imu.material.uniforms.uSea.value = 0.22;   // Robin, 2026-10-27: no see-through base, and the base hidden in the sea
  imu.material.uniforms.uFoot.value = 0.03;
  // Imu's reflection in the sea (Robin, 2026-10-27: "mirror only imu"): a second plane under him whose material shares
  // his uniforms' values each frame (texture, packing, time, lightning), drawn just before him
  const imuRefl = figure(imuTex, FRAMES.imu, 0, 0, 7.5);
  imuRefl.material.uniforms.uRefl.value = 0.5;

  /* Swaps a figure's texture: a render (still or video) has no shader-drawn cloak or hair motion of its own. */
  function setRender(mesh, tex, spec, size, video) {
    const u = mesh.material.uniforms;
    u.map.value = tex;
    u.uWave.value = 0; u.uHair.value = 0;
    if (video) {
      tex.colorSpace = THREE.NoColorSpace;    // decoded in the shader: the alpha half must stay linear
      const W = 2 * size.px.w + spec.gutter;
      u.uPacked.value = 1; u.uPackW.value = size.px.w / W; u.uAlphaX.value = (size.px.w + spec.gutter) / W;
      mesh.userData.video = video;
    } else {
      u.uPacked.value = 0;
    }
    mesh.userData.frame = spec.frame;
  }
  // the renders, at the size the screen needs: the stills are awaited (so the globe starts over the rendered hand),
  // the loops arrive when they can play
  const saveData = navigator.connection && navigator.connection.saveData;
  const sizeKey = renderSize(ctx.phone);
  if (window.console) console.info('figure renders:', sizeKey);
  await Promise.all([[luffy, RENDERS.luffy], [imu, RENDERS.imu]].map(([mesh, spec]) => {
    const size = spec[sizeKey];
    return loadStill(size.still).then((tex) => {
      setRender(mesh, tex, spec, size, null);
      if (saveData) return;
      return loadVideo(size.video).then(({ video, texture }) => setRender(mesh, texture, spec, size, video)).catch((e) => { if (window.console) console.info('figure loop not used:', e.message); });
    }).catch((e) => { if (window.console) console.info('figure render not used:', e.message); });
  }));
  eyesTex.anisotropy = 16;
  const eyes = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: eyesTex, transparent: true, depthWrite: false }));
  eyes.renderOrder = 9;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.renderOrder = 8.5;     // behind the eyes, additive, so they glow without being washed soft (Robin, 2026-10-27)
  group.add(eyes, glow);

  // the rock under Luffy's feet: drawn just before him, in a frame of its own below his (ROCK, mask pixels)
  const rockMat = new THREE.ShaderMaterial({
    vertexShader: FIG_VS, fragmentShader: ROCK_FS, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { map: { value: null }, nrm: { value: null }, alb: { value: null }, uFlash: { value: 0 }, uFlashX: { value: 0.5 },
      uOpacity: { value: 1 }, uAsp: { value: 1 }, uGlobe: { value: new THREE.Vector3() },
      lmap: { value: null }, lPacked: { value: 0 }, lPackW: { value: 1 }, lAlphaX: { value: 0 },
      uRowA: { value: ROCK.y0 }, uRowB: { value: ROCK.h }, uLy0: { value: 0 }, uLh: { value: 1 },
      uFeet: { value: ROCK.feet }, uSquash: { value: 2.6 } }
  });
  const rock = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rockMat);
  rock.renderOrder = 9.8;
  rock.visible = false;
  group.add(rock);
  Promise.all([loadStill(ROCK.map), loadStill(ROCK.nrm), loadStill(ROCK.alb)]).then(([m, n, a]) => {
    n.colorSpace = THREE.NoColorSpace;      // directions, not colours
    rockMat.uniforms.map.value = m; rockMat.uniforms.nrm.value = n; rockMat.uniforms.alb.value = a;
    rock.userData.ready = true;
  }).catch((e) => { if (window.console) console.info('rock not used:', e.message); });

  // ---- lightning clock ----
  let flash = 0, flashX = 0.5, flashT = 9, nextFlash = 2.2, bolt = null, boltDrawn = false;
  function makeBolt(W, H) {
    let x = flashX * W, y = -10;
    const end = H * (0.42 + Math.random() * 0.25), main = [[x, y]], branches = [];
    while (y < end) {
      y += 12 + Math.random() * 26;
      x += (Math.random() - 0.5) * 42;
      main.push([x, y]);
      if (Math.random() < 0.12 && branches.length < 3) {
        let bx = x, by = y;
        const br = [[bx, by]], dirn = Math.random() < 0.5 ? -1 : 1;
        for (let k = 0; k < 6; k++) { bx += dirn * (8 + Math.random() * 20); by += 10 + Math.random() * 18; br.push([bx, by]); }
        branches.push(br);
      }
    }
    return { main, branches };
  }
  function flashLevel(t) {
    let a = Math.exp(-t * 14);
    if (t > 0.11) a = Math.max(a, 0.75 * Math.exp(-(t - 0.11) * 12));
    if (t > 0.27) a = Math.max(a, 0.45 * Math.exp(-(t - 0.27) * 9));
    return a;
  }
  function drawBolt(W, H) {
    bctx.clearRect(0, 0, W, H);
    if (!bolt || flash < 0.03) return;
    bctx.lineCap = 'round'; bctx.lineJoin = 'round';
    // bright purple lightning (Robin, 2026-10-27): a wide violet glow under a hot white-lilac core
    const path = (pts, width) => {
      bctx.lineWidth = width;
      bctx.beginPath();
      bctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) bctx.lineTo(pts[i][0], pts[i][1]);
      bctx.stroke();
    };
    const a = Math.min(1, flash * 1.4);
    bctx.shadowColor = 'rgba(185,80,255,1)'; bctx.shadowBlur = 30;
    bctx.strokeStyle = 'rgba(175,85,255,' + a * 0.85 + ')';
    path(bolt.main, 7);
    bolt.branches.forEach((b) => path(b, 3.5));
    bctx.shadowColor = 'rgba(220,160,255,1)'; bctx.shadowBlur = 10;
    bctx.strokeStyle = 'rgba(250,235,255,' + a + ')';
    path(bolt.main, 2.6);
    bctx.strokeStyle = 'rgba(225,180,255,' + a * 0.9 + ')';
    bolt.branches.forEach((b) => path(b, 1.3));
  }

  /* state: time, dt, W, H, lift (0 at the opening, 1 once the globe is centred), dark, chamber, visible */
  function update(s) {
    const W = s.W, H = s.H;
    viewW = W; viewH = H;
    flashT += s.dt;
    if ((nextFlash -= s.dt) <= 0) {
      nextFlash = 3 + Math.random() * 6; flashT = 0; flashX = 0.15 + Math.random() * 0.7;
      const bw = Math.min(960, Math.round(W / 2)), bh = Math.min(600, Math.round(H / 2));
      if (boltCanvas.width !== bw || boltCanvas.height !== bh) { boltCanvas.width = bw; boltCanvas.height = bh; }
      bolt = makeBolt(bw, bh);
    }
    flash = flashT < 1.2 ? flashLevel(flashT) : 0;
    if (flash > 0.03 || boltDrawn) {
      drawBolt(boltCanvas.width, boltCanvas.height);
      boltTex.needsUpdate = true;
      boltDrawn = flash > 0.03;
    }

    // where the camera now points, as a shift of the backdrop: a far point straight ahead, projected (Robin,
    // 2026-10-27: "camera moves and models stay stuck")
    panP.set(0, 0, -1000).project(ctx.camera);
    pan.set(-panP.x * 0.5, -panP.y * 0.5);
    sky.uniforms.uPan.value.copy(pan);
    fog.uniforms.uPan.value.copy(pan);
    sky.uniforms.uRes.value.set(W, H);
    sky.uniforms.uTime.value = s.time;
    sky.uniforms.uFlash.value = flash * s.flashScale;
    sky.uniforms.uFlashX.value = flashX;
    sky.uniforms.uDark.value = s.dark;
    sky.uniforms.uChamber.value = s.chamber;
    if (sky.uniforms.uPlate.value && sky.uniforms.uPlate.value.isVideoTexture) sky.uniforms.uPlate.value.needsUpdate = true;

    fog.uniforms.uRes.value.set(W, H);
    fog.uniforms.uTime.value = s.time;
    fog.uniforms.uFlash.value = flash;
    fog.uniforms.uFade.value = s.fogFade;
    fogMesh.visible = s.fogFade > 0.01;

    // bolt quad covers the view at its depth
    const bz = boltMesh.position.z, hh = ctx.halfH(bz), hw = ctx.halfW(bz);
    boltMesh.scale.set(hw, hh, 1);
    boltMesh.visible = s.figures > 0.01 && flash > 0.03;

    // figures: bottom-aligned planes sized from the view height at their depth
    const figOpacity = s.figures;
    luffy.visible = imu.visible = imuRefl.visible = eyes.visible = glow.visible = figOpacity > 0.005;
    [luffy, imu].forEach((m) => {     // the loops decode only while the figures show
      const v = m.userData.video;
      if (!v) return;
      if (luffy.visible && v.paused) v.play().catch(() => {});
      else if (!luffy.visible && !v.paused) v.pause();
    });
    if (luffy.visible) {
      const lf = luffy.userData.frame, mf = imu.userData.frame;
      place(luffy, lf, lf.vh[ctx.phone ? 1 : 0], ctx.phone ? 0.36 : 0.5, -0.6);   // a little right (Robin, 2026-10-26)
      // the rock: same x frame and scale as his, its own rows below (it starts at mask row ROCK.y0), a hair behind him
      rock.visible = !!rock.userData.ready;
      if (rock.visible) {
        const rs = luffy.scale.y / lf.h;
        rock.scale.set(lf.w * rs, ROCK.h * rs, 1);
        rock.position.set(luffy.position.x,
          luffy.position.y + ((lf.y0 + lf.h / 2) - (ROCK.y0 + ROCK.h / 2)) * rs, luffy.position.z - 0.002);
        const ru = rockMat.uniforms;
        ru.uFlash.value = flash; ru.uFlashX.value = flashX; ru.uOpacity.value = figOpacity;
        ru.uAsp.value = rock.scale.x / rock.scale.y;
        // his shadow comes from whatever he currently shows (still or live video), in his own frame's rows
        const lu = luffy.material.uniforms;
        ru.lmap.value = lu.map.value; ru.lPacked.value = lu.uPacked.value; ru.lPackW.value = lu.uPackW.value;
        ru.lAlphaX.value = lu.uAlphaX.value; ru.uLy0.value = lf.y0; ru.uLh.value = lf.h;
      }
      // Imu looms far off across the water at the upper left, over the lit cloud bank (Robin, 2026-10-26, a marked
      // screenshot): large, its base at the horizon dissolving into the mist, deep in the scene so the camera drift
      // moves it less than Luffy
      place(imu, mf, ctx.phone ? 0.46 : 0.6, ctx.phone ? 0.24 : 0.24, -2.4, ctx.phone ? 0.44 : 0.38);
      // eye layers follow Imu's plane (the eyes sit at SVG (150, 132) in every Imu frame)
      const sImu = imu.scale.y / mf.h;
      const ox = (150 - (mf.x0 + mf.w / 2)) * sImu, oy = ((mf.y0 + mf.h / 2) - 132) * sImu;
      // Robin, 2026-10-27: the eyes never blink; they glow steadily, breathing slowly brighter and dimmer
      eyes.position.set(imu.position.x + ox, imu.position.y + oy, imu.position.z + 0.01);
      eyes.scale.set(FRAMES.imuEyes.w * sImu, FRAMES.imuEyes.h * sImu, 1);
      eyes.material.opacity = figOpacity;
      glow.position.set(imu.position.x + ox, imu.position.y + oy, imu.position.z + 0.005);
      // the glow breathes (Robin, 2026-10-27): a slow 5 s breath, swelling brighter and wider, then sinking dim and close
      const br = 0.5 - 0.5 * Math.cos(s.time * 2 * Math.PI / 5), bs = 0.88 + 0.24 * br;
      glow.scale.set(FRAMES.imuGlow.w * sImu * bs, FRAMES.imuGlow.h * sImu * bs, 1);
      glow.material.opacity = Math.min(1, 0.3 + 0.7 * br + 0.25 * flash) * figOpacity;
      [luffy, imu].forEach((m) => {
        m.material.uniforms.uTime.value = s.time;
        m.material.uniforms.uFlash.value = flash;
        m.material.uniforms.uOpacity.value = figOpacity;
        m.material.uniforms.uFlashDir.value.set((flashX - 0.5) * 0.6, 0.5).normalize();
      });
      // the reflection hangs from Imu's base, mirrored, with his current texture and settings
      imuRefl.scale.copy(imu.scale);
      imuRefl.position.set(imu.position.x, imu.position.y - imu.scale.y, imu.position.z);
      const ru = imuRefl.material.uniforms, iu = imu.material.uniforms;
      ['map', 'uPacked', 'uPackW', 'uAlphaX', 'uSea', 'uTime', 'uFlash', 'uOpacity'].forEach((k) => { ru[k].value = iu[k].value; });
      ru.uFlashDir.value.copy(iu.uFlashDir.value);
    }
  }

  /* Places a plane `frac` of the view height tall at depth z, centred at x fraction fx, its bottom `lift` of the view
     height above the bottom edge. */
  function place(mesh, frame, frac, fx, z, lift = 0) {
    const hh = ctx.halfH(z), hw = ctx.halfW(z);
    const h = frac * 2 * hh, w = h * frame.w / frame.h;
    mesh.scale.set(w, h, 1);
    mesh.position.set((fx * 2 - 1) * hw, -hh + lift * 2 * hh + h / 2, z);
  }

  /* World position (at z = 0) of the globe's centre over Luffy's open hand: the frame's hover point (just above the
     hand top), lifted by the globe's radius plus a gap of a third of its diameter, and bobbing with the hand in the
     loop (the render moves the arm by frame.bob * sin(phase); the video's clock gives the phase). The radius formula
     is app.js's heroR. */
  let viewW = 1, viewH = 1;
  const pan = new THREE.Vector2(), panP = new THREE.Vector3();   // the backdrop's shift with the camera (update)
  function handWorld(out) {
    const fr = luffy.userData.frame, s = luffy.scale.y / fr.h;
    const v = luffy.userData.video, phase = v && v.duration ? 2 * Math.PI * (v.currentTime / v.duration) : 0;
    const bob = (fr.bob || 0) * Math.sin(phase);
    const hx = luffy.position.x + (fr.hover[0] - (fr.x0 + fr.w / 2)) * s, hy = luffy.position.y + ((fr.y0 + fr.h / 2) - fr.hover[1] + bob) * s;
    const p = new THREE.Vector3(hx, hy, luffy.position.z).project(ctx.camera);
    const r = Math.max(24, 0.075 * Math.min(viewW, viewH)) / viewH * (2 * ctx.halfH(0));
    // back out along the camera's ray to the globe's plane (z 0): right when the camera turns (first scene) as well
    // as when it only slides
    const cam = ctx.camera.position, dir = p.unproject(ctx.camera).sub(cam).normalize();
    const k = -cam.z / dir.z;
    return out.set(cam.x + dir.x * k, cam.y + dir.y * k + r * 1.66, 0);
  }

  /* The globe's light on the scene (Robin, 2026-10-27): its centre (world) and strength, from app.js each frame; the
     sky shader gets its screen position for the reflection in the water, Luffy's material its position in his plane
     for the rim light. */
  const gNdc = new THREE.Vector3(), cA = new THREE.Vector3(), cB = new THREE.Vector3();
  function setGlobe(pos, strength) {
    gNdc.copy(pos).project(ctx.camera);
    sky.uniforms.uGlobe.value.set(gNdc.x * 0.5 + 0.5 + pan.x, gNdc.y * 0.5 + 0.5 + pan.y, strength);   // backdrop uv
    const lu = luffy.material.uniforms.uGlobe.value;
    if (!luffy.visible || strength <= 0) { lu.z = 0; return; }
    cA.set(luffy.position.x - luffy.scale.x / 2, luffy.position.y - luffy.scale.y / 2, luffy.position.z).project(ctx.camera);
    cB.set(luffy.position.x + luffy.scale.x / 2, luffy.position.y + luffy.scale.y / 2, luffy.position.z).project(ctx.camera);
    lu.set((gNdc.x - cA.x) / (cB.x - cA.x), (gNdc.y - cA.y) / (cB.y - cA.y), strength);
    if (rock.visible) {                            // the same for the rock's plane
      cA.set(rock.position.x - rock.scale.x / 2, rock.position.y - rock.scale.y / 2, rock.position.z).project(ctx.camera);
      cB.set(rock.position.x + rock.scale.x / 2, rock.position.y + rock.scale.y / 2, rock.position.z).project(ctx.camera);
      rockMat.uniforms.uGlobe.value.set((gNdc.x - cA.x) / (cB.x - cA.x), (gNdc.y - cA.y) / (cB.y - cA.y), strength);
    }
  }

  return {
    group, update, handWorld, setGlobe,
    get flash() { return flash; }, get flashX() { return flashX; }
  };
}

/* The plate slot. index.html carries <meta name="hero-plate" content="">: set the content to assets/plates/hero.jpg or
   assets/plates/hero.mp4 once the file is in place (a probe for a missing file would log a 404 in the console). */
function probePlate(sky) {
  const meta = document.querySelector('meta[name="hero-plate"]');
  const src = meta && meta.getAttribute('content') ? meta.getAttribute('content').trim() : '';
  if (!src) return;
  if (/\.(mp4|webm|mov)$/i.test(src)) {
    const video = document.createElement('video');
    video.src = src;
    video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true;
    video.setAttribute('aria-hidden', 'true');
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    video.addEventListener('loadedmetadata', () => {
      sky.uniforms.uPlateSize.value.set(video.videoWidth, video.videoHeight);
      sky.uniforms.uPlate.value = tex;
      sky.uniforms.uHasPlate.value = 1;
      video.play().catch(() => {});
    });
    video.load();
    return;
  }
  {
    new THREE.TextureLoader().load(src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      sky.uniforms.uPlateSize.value.set(tex.image.width, tex.image.height);
      sky.uniforms.uPlate.value = tex;
      sky.uniforms.uHasPlate.value = 1;
    });
  }
}
