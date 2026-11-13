/* The baked opening (local preview, Robin 2026-11-11: "I want to see both options before i see which one is better";
   "everything stays the same as far as possible between the two new versions ... use the new assets for the baked
   version"). igloo.inc's way: real meshes drawn live, with light that was worked out ahead of time.
   The same scene as the ray-traced video (whole-scene-render-2026-11-10, bake_export.py):
     figures   Luffy with the approved cape, vest and shorts, Imu (seed 50) and today's rock, as the meshes Cycles
               rendered (every subdivision at its render level: Luffy 1.8 million points), moving through the same
               8-second loop; their light is Cycles' own, per light group: where the camera saw the surface in a
               light step, the rendered frame's own pixels (each figure's box of the 4K frame, read per fragment
               through the render's camera, bake_crops.py); elsewhere one value a point, from the same frames
     backdrop  the figure-free storm loop of the video version (plate.js hands over its two videos: the sky, the sea
               and the shore with their own rain, rings and splashes), with the globe's light on the ground from a
               still; until those videos play, the same scene as one still, rendered without figures or rain
     rain      the render's own streaks (the same seed, lean, lengths and speeds), moved live: over the figures only
               once the loop behind them plays (it holds the rest of the rain), everywhere over the still
     water     the figures mirrored in the sea (rasterised, not ray-traced)
   Drawn each frame from the render's own camera into a linear-light frame the shape of the render; plate.js then
   treats that frame as it treats a video frame (the light mix, Blender's AgX look, the camera shift, the scroll). */
import * as THREE from 'three';

const W = 4096;                        // data texture width (points per row)
const GROUPS = 5;                      // storm, lightning_a, _b, _c, globe

const FIG_VS = /* glsl */`
precision highp float;precision highp int;precision highp isampler2DArray;precision highp sampler2DArray;
// each point's moves (a layer a position step) and its own light (a layer a light step and group), ${W} points a row;
// in up to three and two textures of uPosPer and uLightPer layers each (one texture of Luffy's moves would be 1.7 GB,
// more than the GPU gives a single texture)
uniform isampler2DArray tPos0,tPos1,tPos2;uniform sampler2DArray tLight0,tLight1;
uniform int uPosSteps,uLightSteps,uMoving,uLP,uPosPer,uLightPer;uniform float uPosT,uLightT,uDscale,uMirror,uSea,uCrop;
uniform float uW[5];
in float aObj,aMat;uniform mat4 uInv[16];uniform float uScale[5];
out vec3 vF0,vF1,vC0,vC1;out vec3 vWorld;out float vZ;out vec3 vLocal;flat out int vObj;flat out int vMat;
#ifdef LM
// the lightmaps (lightmap_bake.py, igloo.inc's way): each vertex is a page point (aSrc) at its place in its part's
// lightmap (aLM); the light is read there by the fragment
in float aSrc;in vec2 aLM;out vec2 vLM;
#endif
const float VMIN=-11.,VRANGE=14.;
vec3 dec(vec3 e){return max(exp2(e*VRANGE+VMIN)-exp2(VMIN),0.);}
ivec3 at(int v,int layer){return ivec3(v%${W},v/${W},layer);}
// point v's move at position step s (in the file's units), and its own light in layer l (light step * 5 + group)
vec3 moved(int v,int s){
 ivec3 q=at(v,s%uPosPer);int c=s/uPosPer;
 return vec3((c==0?texelFetch(tPos0,q,0):c==1?texelFetch(tPos1,q,0):texelFetch(tPos2,q,0)).xyz);}
vec3 lit(int v,int l){
 ivec3 q=at(v,l%uLightPer);
 return dec((l<uLightPer?texelFetch(tLight0,q,0):texelFetch(tLight1,q,0)).rgb);}
void main(){
 int v=gl_VertexID;
#ifdef LM
 v=int(aSrc+.5);vLM=aLM;
#endif
 vec3 p=position;                                   // Blender world (z up)
 if(uMoving==1){
  int s0=int(floor(uPosT))%uPosSteps,s1=(s0+1)%uPosSteps;float f=fract(uPosT);
  p+=mix(moved(v,s0),moved(v,s1),f)*uDscale;}
 int l0=int(floor(uLightT))%uLightSteps,l1=(l0+1)%uLightSteps;
 vec3 f0=vec3(0.),f1=vec3(0.);
#ifndef LM
 // the point's own light at the two light steps around now (the fragment blends them by time): what is drawn where
 // the camera could not see the surface in either step
 for(int g=0;g<5;g++){
  if(uW[g]<=0.)continue;
  f0+=uW[g]*lit(v,l0*5+g);f1+=uW[g]*lit(v,l1*5+g);}
#endif
 vF0=f0;vF1=f1;vZ=p.z;
 // the crops (bake_crops.py): where this point stood in the rendered frame of each of the two steps, through the
 // render's own camera (clip x, y and w, which is its depth along the view): the fragment divides, and reads Cycles'
 // pixel there
 vC0=vC1=vec3(0.,0.,1.);
 if(uCrop>0.){
  vec3 q0=position,q1=position;
  if(uMoving==1){
   q0+=moved(v,(l0*uLP)%uPosSteps)*uDscale;
   q1+=moved(v,(l1*uLP)%uPosSteps)*uDscale;}
  vC0=(projectionMatrix*viewMatrix*vec4(q0.x,q0.z,-q0.y,1.)).xyw;
  vC1=(projectionMatrix*viewMatrix*vec4(q1.x,q1.z,-q1.y,1.)).xyw;}
 // object coordinates, as the render's fabrics are box-projected on them, at the fabric's own scale
 vObj=int(aObj+.5);vMat=int(aMat+.5);
 vLocal=(uInv[vObj]*vec4(p,1.)).xyz*uScale[vMat];
 if(uMirror>0.)p.z=2.*uSea-p.z;                     // its image in the water
 vWorld=p;
 gl_Position=projectionMatrix*viewMatrix*vec4(p.x,p.z,-p.y,1.);}`;
const FIG_FS = /* glsl */`
precision highp float;precision highp int;precision highp sampler2DArray;
uniform float uMirror,uSea,uShoreY,uTime,uCut,uMask,uDetail;uniform vec3 uCam;
uniform vec3 uAvg[5];uniform mat4 uInv[16];
// the fabrics' maps, Luffy's alone (NOFAB elsewhere: Imu's material with them took 17 texture units of the GPU's 16, 2026-11-12)
#ifndef NOFAB
uniform sampler2D tD1,tD2,tD3,tD4,tN1,tN2,tN3,tN4;
#endif
// the crops, the figure's box of the rendered frame at each light step: tCropS the groups kept at the render's own
// pixel density (uNF layers a step), tCropL those at half of it (uNH layers a step), tCropD the nearest surface's
// depth in the box. uFull[g]: is group g in tCropS; uSlot[g]: its layer within a step; uBox: the box (x0, y0 from the
// frame's top-left in pixels, 1/width, 1/height); uRes: the frame's size; uZ: the depth crop's range (nearest, 1/span)
uniform sampler2DArray tCropS,tCropL,tCropD;uniform float uCrop,uLightT;uniform int uLightSteps,uNF,uNH;uniform int uFull[5],uSlot[5];
uniform vec4 uBox;uniform vec2 uRes,uZ;
uniform float uW[5];
// sea fog round Imu's base (Robin, 2026-11-12: "the aim is to conceal the base of imu"; "i can still see a purple band"):
// over the lowest uFogH metres above the sea he fades into the scene behind him (tBackF, the backdrop as drawn, uRes2
// its frame size), as fog lying on the water would hide him; his image in the sea with him
uniform sampler2D tBackF;uniform vec2 uRes2;uniform float uFogH;
in vec3 vF0,vF1,vC0,vC1;in vec3 vWorld;in float vZ;in vec3 vLocal;flat in int vObj;flat in int vMat;out vec4 outColor;
#ifdef LM
// this part's lightmaps, one a light group, baked as the render camera sees the surface (shine included)
uniform sampler2D tLM0,tLM1,tLM2,tLM3,tLM4;in vec2 vLM;
// each group's level against the render's own pixels (lm_level.py: the median of render / lightmap over the vertices
// the camera sees), so the page matches the render
uniform float uLMS[5];
#endif
const float VMIN=-11.,VRANGE=14.;
vec3 dec(vec3 e){return max(exp2(e*VRANGE+VMIN)-exp2(VMIN),0.);}
// where the fragment's point stood in a light step's frame (c: its clip x, y, w there), in pixels of the figure's box
vec2 boxAt(vec3 c){vec2 s=c.xy/c.z*.5+.5;return vec2(s.x,1.-s.y)*uRes-uBox.xy;}
// did the camera see this point in light step l (1 yes, 0 no): is it the nearest surface at its pixel of that frame.
// Yes within 6 of the depth crop's 255 levels (2.7 cm on Luffy, 12 cm on Imu, who stands 30 m off) and within twice
// the depth the surface itself spans in a pixel (a face seen nearly edge-on does not hide itself); fading to no over
// the next 4 levels, so the depth's 8-bit steps do not show as a stipple where two layers of cloth lie that far apart
float seen(vec3 c,int l){
 float d=(c.z-uZ.x)*uZ.y;
 ivec2 t=clamp(ivec2(floor(boxAt(c))),ivec2(0),textureSize(tCropD,0).xy-1);
 return clamp((texelFetch(tCropD,ivec3(t,l),0).r+10./255.+2.*fwidth(d)-d)*63.75,0.,1.);}
// Cycles' own light at this fragment in light step l, the groups mixed with the page's live weights
vec3 crop(vec3 c,int l){
 vec2 t=boxAt(c)*uBox.zw;
 vec3 x=vec3(0.);
 for(int g=0;g<5;g++){
  if(uW[g]<=0.)continue;
  if(uFull[g]==1)x+=uW[g]*dec(textureLod(tCropS,vec3(t,float(l*uNF+uSlot[g])),0.).rgb);
  else x+=uW[g]*dec(textureLod(tCropL,vec3(t,float(l*uNH+uSlot[g])),0.).rgb);}
 return x;}
#ifdef NOFAB
vec3 fabric(vec3 c){return c;}
#else
vec3 tri(sampler2D t,vec3 p,vec3 w){return texture(t,p.yz).rgb*w.x+texture(t,p.xz).rgb*w.y+texture(t,p.xy).rgb*w.z;}
// the fabric's detail over the point's light: its colour against its own average (so the light keeps the render's
// level), and its relief from the normal map, shading the weave toward and away from the view
vec3 fabric(vec3 c){
 if(vMat==0||uDetail<=0.)return c;
 vec3 n=normalize(cross(dFdx(vLocal),dFdy(vLocal)));
 vec3 w=pow(abs(n),vec3(4.));w/=w.x+w.y+w.z;
 vec3 d=vMat==1?tri(tD1,vLocal,w):vMat==2?tri(tD2,vLocal,w):vMat==3?tri(tD3,vLocal,w):tri(tD4,vLocal,w);
 vec3 nm=(vMat==1?tri(tN1,vLocal,w):vMat==2?tri(tN2,vLocal,w):vMat==3?tri(tN3,vLocal,w):tri(tN4,vLocal,w))*2.-1.;
 vec3 pert=w.x*vec3(0.,nm.x,nm.y)+w.y*vec3(nm.x,0.,nm.y)+w.z*vec3(nm.x,nm.y,0.);
 vec3 V=normalize(mat3(uInv[vObj])*(uCam-vWorld));
 vec3 nd=normalize(n+pert*.8);
 float s=clamp(abs(dot(nd,V))/max(abs(dot(n,V)),.2),.55,1.45);
 vec3 ratio=d/max(uAvg[vMat],vec3(.02));
 return c*mix(vec3(1.),ratio*s,uDetail);}
#endif
void main(){
 // what stands under the water or in the ground is hidden there in the render (Imu's base in the sea, the rock's in
 // the shore): not drawn
 if(vZ<uCut)discard;
 if(uMask>0.){outColor=vec4(1.);return;}           // the mask: where he is on screen
 // the two light steps around now, blended by time: the rendered frames' own pixels where the camera saw this
 // point. Seen in one step only (the cape swept over it in the other), that step's pixel alone; seen in neither,
 // the point's own light with the fabric's detail laid over it (the crops already hold the render's fabric)
 // (the fabric is worked out for every fragment though few show it: taken only where the crops leave a gap, inside
 // that branch, it came out wrong at some hundred pixels a frame on this GPU, 2026-11-11; left as it was)
 float fl=fract(uLightT);
#ifdef LM
 vec3 c=uW[0]*uLMS[0]*dec(texture(tLM0,vLM).rgb);
 if(uW[1]>0.)c+=uW[1]*uLMS[1]*dec(texture(tLM1,vLM).rgb);
 if(uW[2]>0.)c+=uW[2]*uLMS[2]*dec(texture(tLM2,vLM).rgb);
 if(uW[3]>0.)c+=uW[3]*uLMS[3]*dec(texture(tLM3,vLM).rgb);
 if(uW[4]>0.)c+=uW[4]*uLMS[4]*dec(texture(tLM4,vLM).rgb);
#else
 vec3 c=mix(vF0,vF1,fl)*fabric(vec3(1.));
#endif
 if(uCrop>0.){
  int l0=int(floor(uLightT))%uLightSteps,l1=(l0+1)%uLightSteps;
  float sa=seen(vC0,l0),sb=seen(vC1,l1),wa=sa*max(1.-fl,.001),wb=sb*max(fl,.001);
  if(wa+wb>0.){
   vec3 x=vec3(0.);
   if(wa>0.)x+=wa*crop(vC0,l0);
   if(wb>0.)x+=wb*crop(vC1,l1);
   c=mix(c,x/(wa+wb),max(sa,sb));}}
 if(uFogH>0.){
  float k=smoothstep(uSea,uSea+uFogH,vZ);k*=k;
  c=mix(texture(tBackF,gl_FragCoord.xy/uRes2).rgb,c,k);}
 if(uMirror>0.){
  // only where the sea is: the view ray's crossing of the water lies beyond the shore line
  float t=(uCam.z-uSea)/max(uCam.z-vWorld.z,1e-4);vec3 h=uCam+(vWorld-uCam)*t;
  if(h.y<uShoreY)discard;
  // the image lies in the sea, as on the current site (Robin, 2026-11-12: "please look at our current version"): the
  // water as drawn behind it, with his image faintly in it, not a dark copy of him over the sea
  c=mix(texture(tBackF,gl_FragCoord.xy/uRes2).rgb,c,uMirror*smoothstep(uShoreY,uShoreY+2.,h.y));}
 outColor=vec4(c,1.);}`;

const BACK_VS = /* glsl */`out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}`;
const BACK_FS = /* glsl */`
precision highp float;
// tBase, tLights: the still (storm; four tiles: the three bolts and the globe). tLiveB, tLiveL: the figure-free storm
// loop's two videos (storm; tiles: the three bolts), shown in the still's place once they play (uLive)
uniform sampler2D tBase,tLights,tLiveB,tLiveL;uniform float uW[5];uniform float uLive;
uniform float uTime,uHorizon,uShore;
in vec2 vUv;out vec4 outColor;
const float VMIN=-11.,VRANGE=14.;
vec3 dec(vec3 e){return max(exp2(e*VRANGE+VMIN)-exp2(VMIN),0.);}
vec3 tile(sampler2D t,vec2 uv,int k){
 vec2 m=1./vec2(textureSize(t,0));vec2 o=k==0?vec2(0.,.5):k==1?vec2(.5,.5):k==2?vec2(0.):vec2(.5,0.);
 return dec(texture(t,o+clamp(uv*.5,m,.5-m)).rgb);}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec3 stillAt(vec2 uv){return uW[0]*dec(texture(tBase,uv).rgb)+uW[1]*tile(tLights,uv,0)+uW[2]*tile(tLights,uv,1)+uW[3]*tile(tLights,uv,2)+uW[4]*tile(tLights,uv,3);}
void main(){
 vec2 uv=vUv;
 if(uLive>.5){                                      // the figure-free storm loop (the video version's backdrop)
  vec3 c=uW[4]*tile(tLights,uv,3)+uW[0]*dec(texture(tLiveB,uv).rgb)+uW[1]*tile(tLiveL,uv,0)+uW[2]*tile(tLiveL,uv,1)+uW[3]*tile(tLiveL,uv,2);
  outColor=vec4(c,1.);return;}
 // the still on calm water with no rain (calm-backdrop-4k; Robin, 2026-11-12: "we need to keep it sharp and smooth",
 // so no video plays here): the water and the wet shore move live, as on the current site (opening.js): a wind chop
 // (faint on the shore), the rain's rings bending what every light group mirrors, and each drop landing with a bright
 // hit and two droplets thrown up, lit by the sky they face
 float sea=smoothstep(uShore-.01,uShore+.02,uv.y);
 float spl=0.,near=0.;
 if(uv.y<uHorizon){
  float t=uTime;
  float gz=.12/max(uHorizon-uv.y,.012);vec2 g=vec2((uv.x-.5)*3.6*gz,gz*4.);
  vec2 n=vec2(noise(g*vec2(9.,3.)+vec2(t*.6,t*.2))-.5,noise(g*vec2(7.,2.5)-vec2(t*.4,t*.3))-.5)*.5*mix(.15,1.,sea);
  for(int i=0;i<2;i++){float fi=float(i);vec2 cg=g*(5.+fi*3.)+fi*7.3;vec2 id=floor(cg);vec2 f=fract(cg)-.5;
   float h=hash(id+fi*2.7);float ph=fract(t*(.9+h*.5)+h*9.);vec2 q=f-(vec2(hash(id+1.3),hash(id+5.1))-.5)*.5;
   float on=step(.35,h);vec2 qs=q*vec2(1.,2.2);float d=length(qs);float x=(d-ph*.45)/.03;
   n+=normalize(qs+1e-5)*(-x*exp(-x*x))*(1.-ph)*on;
   float s=ph/.16;
   if(s<1.){
    spl+=smoothstep(.06,0.,d)*(1.-s)*2.*on;
    for(int k=0;k<2;k++){float sd=float(k)*2.-1.;
     vec2 dq=q-vec2(sd*(.05+.05*h)*s,(.22+.1*h)*s-.3*s*s);dq.y*=.55;
     spl+=smoothstep(.02,0.,length(dq))*(1.-s*.7)*1.5*on;}}}
  near=smoothstep(uHorizon,uHorizon-.25,uv.y);
  uv+=n*vec2(.004,.006)*near;}
 vec3 c=stillAt(uv);
 if(spl>0.)c+=stillAt(vec2(uv.x,clamp(2.*uHorizon-uv.y,uHorizon,.999)))*spl*near*.35;
 outColor=vec4(c,1.);}`;

// the rain: each streak falls down its own slanted line as build_scene.rain_points moves it, drawn as a thin quad
// about a pixel wide (fainter where the streak is thinner than a pixel), lit by what lies behind it, as the render's
// mostly see-through water streaks are
const RAIN_VS = /* glsl */`
precision highp float;
in vec4 aA;in vec2 aB;               // xa, y0, u0, falls | length, rad
uniform float uLoop,uTop,uSea,uTl,uCosL,uRes;uniform vec2 uSize;
out float vA;out vec2 vScreen;
void main(){
 float H=uTop-uSea;float u=fract(aA.z+aA.w*uLoop/960.);float z=uTop-u*H;
 vec3 top=vec3(aA.x+(uTop-z)*uTl,aA.y,z);
 float reach=min(aB.x,max(z-uSea,0.)/uCosL);
 vec3 bot=top+vec3(sqrt(1.-uCosL*uCosL),0.,-uCosL)*reach;
 vec4 a=projectionMatrix*viewMatrix*vec4(top.x,top.z,-top.y,1.),b=projectionMatrix*viewMatrix*vec4(bot.x,bot.z,-bot.y,1.);
 vec4 p=position.y<.5?a:b;
 vec2 dir=normalize((b.xy/b.w-a.xy/a.w)*uSize+1e-6);vec2 nrm=vec2(-dir.y,dir.x);
 float px=2.*aB.y/(p.w*tan(radians(18.))*2.)*uSize.y;          // the streak's true width in pixels
 float wpx=max(px,1.2);
 p.xy+=nrm*(position.x-.5)*wpx/uSize*2.*p.w;
 vA=clamp(px/wpx,0.,1.)*step(.001,reach);
 vScreen=(p.xy/p.w)*.5+.5;
 gl_Position=p;}`;
const RAIN_FS = /* glsl */`
precision highp float;
uniform sampler2D tBack;uniform float uMix,uGain;in float vA;in vec2 vScreen;out vec4 outColor;
// lit by what lies behind it, and by the sky above it (Robin, 2026-11-12: "a whole mid section of imu/the clouds that i
// cant see the rain drops over"): over the dark band of cloud and sea, lit by what lay behind alone, a streak was black)
void main(){vec3 behind=texture(tBack,vScreen).rgb;vec3 sky=texture(tBack,vec2(vScreen.x,.82)).rgb;
 outColor=vec4(max(behind,sky*.45)*uMix*uGain*vA,0.);}`;

/* A file's bytes (or a blob), asked for up to four times: the baked figures are some 700 requests and 2.5 GB, and one
   dropped connection would otherwise cost a figure its crops or the page its figures. A missing file is not asked
   for again. */
let onBytes = null;                    // the page's loading bar (app.js): told of every byte as it lands
async function grab(url, init, as = 'arrayBuffer') {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, init);
      if (!r.ok) return { status: r.status, body: null };
      const body = await r[as]();
      if (onBytes) onBytes(as === 'blob' ? body.size : body.byteLength);
      return { status: r.status, body };
    } catch (e) {
      if (attempt >= 3) throw new Error('could not read ' + url + ': ' + e.message);
      await new Promise((res) => setTimeout(res, 150 * (attempt + 1)));
    }
  }
}
// fog at Imu's base (Robin, 2026-11-12: "Can we have fog at the base of imu"): a low bank drifting along the horizon,
// thickest round Imu where he stands in the sea, over the figures and under the rain, in the colour of the horizon
// behind it (the backdrop as drawn, tBack). The picture's own fractions: Imu's base at 0.38 up, the horizon at 0.461
const FOG_FS = /* glsl */`
precision highp float;
uniform sampler2D tBack;uniform float uTime,uAmt;in vec2 vUv;out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
void main(){
 vec2 uv=vUv;
 float band=smoothstep(.27,.37,uv.y)*smoothstep(.52,.42,uv.y);
 float atImu=.3+.7*exp(-pow((uv.x-.24)/.2,2.));
 float f=fbm(vec2(uv.x*4.5+uTime*.045,uv.y*13.-uTime*.015));
 float f2=fbm(vec2(uv.x*9.-uTime*.07,uv.y*22.)+f*1.3);
 float a=band*atImu*(.25+.75*f2)*uAmt;
 vec3 c=texture(tBack,vec2(uv.x,.47)).rgb*1.15;
 outColor=vec4(c*a,a);}`;

async function bin(url, Type) {
  const r = await grab(url);
  if (!r.body) throw new Error('missing ' + url);
  return new Type(r.body);
}
function stillTex(url) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; res(t);
  }, undefined, () => rej(new Error('still ' + url))));
}
/* Bytes a to b - 1 of a file. The local server answers byte ranges; from one that sends the whole file instead, the
   file is read once and cut. */
const wholeFiles = new Map();
// a pack split into parts for GitHub, which takes no file over 100 MB (2026-11-12): url -> the parts' byte sizes, in
// order, saved as url + '.0', '.1', ...; a range is read from each part it covers and joined
const splitFiles = new Map();
async function part(url, a, b) {
  const sp = splitFiles.get(url);
  if (sp) {
    const out = new Uint8Array(b - a);
    for (let k = 0, at = 0; k < sp.length && at < b; at += sp[k], k++) {
      const s = Math.max(a, at), e = Math.min(b, at + sp[k]);
      if (s < e) out.set(new Uint8Array(await part(url + '.' + k, s - at, e - at)), s - a);
    }
    return out.buffer;
  }
  if (!wholeFiles.has(url)) {
    const r = await grab(url, { headers: { Range: 'bytes=' + a + '-' + (b - 1) } });
    if (r.status === 206) return r.body;
    if (!r.body) throw new Error('missing ' + url);
    wholeFiles.set(url, r.body);
  }
  return wholeFiles.get(url).slice(a, b);
}

/* The page's set of a figure (bake_pack.py): one file of zlib chunks, each read by its byte range, unpacked, and put
   back as it was packed: nothing is lost (with ?verify each chunk's Adler-32 is checked against the export's).
   Returns the readers of its parts; the steps of the moves and of the light must be asked for in order (each step of
   the moves is stored as its difference from the one before), and are read a few ahead. */
async function inflate(buf) {
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
}
function adler32(u8) {
  let a = 1, b = 0;
  for (let i = 0; i < u8.length;) {
    const end = Math.min(i + 5552, u8.length);
    for (; i < end; i++) { a += u8[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}
function packedFigure(base, f, V, verify) {
  const P = f.packed, url = base + P.file, stat = { read: 0, checked: 0 };
  if (P.split) splitFiles.set(url, P.split);
  const chunk = async (e) => { stat.read += e[1]; return new Uint8Array(await inflate(await part(url, e[0], e[0] + e[1]))); };
  const check = (e, values) => {
    if (!verify) return;
    if (adler32(new Uint8Array(values.buffer, values.byteOffset, values.byteLength)) !== e[2]) throw new Error('a chunk of ' + url + ' did not unpack to what was packed');
    stat.checked++;
  };
  // steps in order, the next few already on their way
  const ahead = (list) => {
    const q = [];
    return (s) => { while (q.length < 4 && s + q.length < list.length) q.push(chunk(list[s + q.length])); return q.shift(); };
  };
  const nextPos = P.dpos ? ahead(P.dpos) : null, nextLight = ahead(P.light);
  let prev = null;
  return {
    stat,
    async idx() {
      const raw = await chunk(P.idx), n = raw.length >> 2, out = new Uint32Array(n);
      for (let i = 0, acc = 0; i < n; i++) { acc = (acc + (raw[i] | (raw[n + i] << 8) | (raw[2 * n + i] << 16) | (raw[3 * n + i] << 24))) | 0; out[i] = acc; }
      check(P.idx, out);
      return out;
    },
    async plain(key, Type) { const raw = await chunk(P[key]), out = new Type(raw.buffer); check(P[key], out); return out; },
    // a position step: stored as its difference from the step before, and that as each point's difference from the
    // point before, low bytes then high bytes; the sums wrap in 16 bits as the differences did
    async pos(s) {
      const raw = await nextPos(s), n = V * 3, q = new Int16Array(n);
      for (let i = 0; i < n; i++) q[i] = raw[i] | (raw[n + i] << 8);
      for (let i = 3; i < n; i++) q[i] += q[i - 3];
      if (prev) for (let i = 0; i < n; i++) q[i] += prev[i];
      prev = q;
      check(P.dpos[s], q);
      return q;
    },
    // a light step (five groups): each point's difference from the point before, wrapping in 8 bits
    async light(s) {
      const q = await nextLight(s), g = V * 3;
      for (let k = 0; k < GROUPS; k++) for (let i = k * g + 3, end = (k + 1) * g; i < end; i++) q[i] += q[i - 3];
      check(P.light[s], q);
      return q;
    }
  };
}

/* A figure's per-point data as an array texture, 4096 points a row and a layer a step: its moves through the loop
   (kind 'pos': int16 x y z a point, a layer a position step) or its own light (kind 'light': bytes r g b a point,
   five groups a light step, a layer a step and group). step(s) gives a step's values, asked for in order (from the
   packed set, or by byte range from the whole export's file), and each is copied into its layers as it comes. As
   one sheet of rows, as it was, Luffy as rendered (1.8 million points; his moves are 1.3 GB) would be 52,560 texels
   tall for his moves, past WebGL's 16,384, and held three times over in memory; and as one array texture 1.7 GB,
   which this GPU refuses (1.08 GB it gives, 1.7 GB it does not): so the layers are shared out over up to `most`
   textures of about 600 MB (the shader has three for the moves, two for the light).
   Returns { tex: the textures, per: layers in each, bytes: on the GPU }. */
async function pointLayers(renderer, url, V, steps, kind, most, step) {
  const gl = renderer.getContext(), st = renderer.state, rows = Math.ceil(V / W), pos = kind === 'pos';
  const each = pos ? 1 : GROUPS, layers = steps * each, layerBytes = W * rows * (pos ? 8 : 4);
  const n = Math.min(most, Math.max(1, Math.ceil(layers * layerBytes / 6e8))), per = Math.ceil(layers / n);
  if (rows > renderer.capabilities.maxTextureSize || W > renderer.capabilities.maxTextureSize || per > gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) || per * layerBytes > 1e9) {
    throw new Error('this figure is too large for this GPU: ' + V + ' points, ' + n + ' textures of ' + Math.round(per * layerBytes / 1e6) + ' MB (' + url + ')');
  }
  const tex = [];
  for (let c = 0; c < n; c++) {
    const t = new THREE.DataArrayTexture(null, W, rows, Math.min(per, layers - c * per));
    t.format = pos ? THREE.RGBAIntegerFormat : THREE.RGBAFormat; t.type = pos ? THREE.ShortType : THREE.UnsignedByteType;
    if (pos) t.internalFormat = 'RGBA16I';
    t.colorSpace = THREE.NoColorSpace; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.source.dataReady = false;                    // three only makes the storage; the layers are copied in below
    t.needsUpdate = true;
    renderer.initTexture(t);
    tex.push(t);
  }
  const layer = pos ? new Int16Array(W * rows * 4) : new Uint8Array(W * rows * 4), stepBytes = V * 3 * (pos ? 2 : GROUPS);
  if (!pos) layer.fill(255);
  while (gl.getError()) { /* errors from before are not these textures' */ }
  for (let s = 0; s < steps; s++) {
    let src;
    if (step) src = await step(s);
    else { const buf = await part(url, s * stepBytes, (s + 1) * stepBytes); src = pos ? new Int16Array(buf) : new Uint8Array(buf); }
    if (src.byteLength !== stepBytes) throw new Error('short read of ' + url);
    for (let k = 0; k < each; k++) {
      for (let v = 0, a = k * V * 3, b = 0; v < V; v++, a += 3, b += 4) { layer[b] = src[a]; layer[b + 1] = src[a + 1]; layer[b + 2] = src[a + 2]; }
      const l = s * each + k;
      st.bindTexture(gl.TEXTURE_2D_ARRAY, renderer.properties.get(tex[Math.floor(l / per)]).__webglTexture);
      st.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); st.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      st.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, l % per, W, rows, 1, pos ? gl.RGBA_INTEGER : gl.RGBA, pos ? gl.SHORT : gl.UNSIGNED_BYTE, layer);
    }
  }
  st.unbindTexture();
  wholeFiles.delete(url);
  const err = gl.getError();
  if (err) throw new Error('WebGL error ' + err + ' filling ' + url);
  return { tex, per, bytes: layers * layerBytes, read: step ? 0 : steps * stepBytes };
}

/* A figure's crops (bake_crops.py; Robin, 2026-11-11: "MODELS NEED TO BE SHARP"): its box of the rendered frame at
   every light step, as three array textures: the groups figures.json lists as full (the storm) at the render's own
   pixel density, those it lists as half (the three bolts and the globe) at half of it, and the nearest surface's
   depth in the box (one channel, read unfiltered), by which a fragment knows whether the camera saw it in that step.
   Each PNG is decoded as it is (no colour conversion, no flip: row 0 is the frame's top) and copied into its layer;
   the light is read with a linear filter and no mipmaps, so a texel is a pixel of Cycles' frame. Returns null (the
   per-point light alone is drawn, as before) if the export has no crops, or one cannot be read. */
async function loadCrops(renderer, base, name, f, meta) {
  const c = f.crop, cm = meta.crops;
  if (!c || !cm || !cm.depth || !c.z || !renderer || typeof createImageBitmap !== 'function') return null;
  const gl = renderer.getContext(), st = renderer.state, S = c.steps, G = meta.groups;
  // which groups are kept at the render's density and which at half (figures.json says), and each one's layer in a step
  const full = G.map((g) => (cm.full.includes(g) ? 1 : 0)), slot = [];
  let NF = 0, NH = 0;
  full.forEach((isFull) => slot.push(isFull ? NF++ : NH++));
  const arr = (w, h, d, grey) => {
    const t = new THREE.DataArrayTexture(null, w, h, Math.max(1, d));
    t.format = grey ? THREE.RedFormat : THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.NoColorSpace;
    t.minFilter = t.magFilter = grey ? THREE.NearestFilter : THREE.LinearFilter; t.generateMipmaps = false;
    t.source.dataReady = false;                    // three only makes the storage; the layers are copied in below
    t.needsUpdate = true;
    renderer.initTexture(t);
    return t;
  };
  const tS = arr(c.size[0], c.size[1], S * NF), tL = arr(c.half[0], c.half[1], S * NH), tD = arr(c.size[0], c.size[1], S, true);
  const jobs = [];
  for (let s = 0; s < S; s++) {
    const stem = base + cm.dir + '/' + name + '-s' + String(s).padStart(2, '0') + '-';
    G.forEach((g, k) => jobs.push({ url: stem + g + '.png', t: full[k] ? tS : tL, layer: s * (full[k] ? NF : NH) + slot[k],
      size: full[k] ? c.size : c.half, fmt: gl.RGBA }));
    jobs.push({ url: stem + 'depth.png', t: tD, layer: s, size: c.size, fmt: gl.RED });
  }
  let bytes = 0, next = 0, failed = null;
  async function worker() {
    while (next < jobs.length && !failed) {
      const j = jobs[next++];
      try {
        const blob = (await grab(j.url, undefined, 'blob')).body;
        if (!blob) throw new Error('missing ' + j.url);
        const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        if (bmp.width !== j.size[0] || bmp.height !== j.size[1]) throw new Error('wrong size ' + j.url);
        bytes += blob.size;
        st.bindTexture(gl.TEXTURE_2D_ARRAY, renderer.properties.get(j.t).__webglTexture);
        st.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); st.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        st.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); st.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, j.layer, j.size[0], j.size[1], 1, j.fmt, gl.UNSIGNED_BYTE, bmp);
        bmp.close();
      } catch (e) { failed = e; }
    }
  }
  while (gl.getError()) { /* errors from before are not these textures' */ }
  await Promise.all(Array.from({ length: 8 }, worker));
  st.unbindTexture();
  const glErr = gl.getError();
  if (!failed && glErr) failed = new Error('WebGL error ' + glErr);
  if (failed) {
    tS.dispose(); tL.dispose(); tD.dispose();
    if (window.console) console.info('baked crops not used for ' + name + ':', failed.message);
    return null;
  }
  const px = c.size[0] * c.size[1], hpx = c.half[0] * c.half[1];
  return { tS, tL, tD, full, slot, NF, NH, files: jobs.length, bytes, gpu: S * (4 * NF * px + 4 * NH * hpx + px) };
}

/* opts.maskOnly: Luffy's mesh alone, drawn only as a mask (for the video version, where it tells the page where he
   stands in each frame, so the live globe can pass behind his hat). That mask is read from the folder's mask/ set
   where there is one: the light meshes that version has used from the start (56,000 points, 42 MB), not the 1.8
   million points the baked version draws, whose moves alone are 1.3 GB to read and 1.7 GB on the GPU. */
export async function createBaked(ctx, base, opts = {}) {
  const maskOnly = !!opts.maskOnly;
  let meta = null;
  if (maskOnly) {
    meta = await fetch(base + 'mask/figures.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (meta) base += 'mask/';
  }
  if (!meta) meta = await fetch(base + 'figures.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('no baked figures'))));
  // the loading bar: the whole of what is read here, in bytes (bake_pack.py lists them), and each piece as it lands
  // (a whole export, not packed, has no list: its figures' own sizes then stand for the whole)
  const sizes = (meta.pack && meta.pack.sizes) || {}, bar = !maskOnly && ctx.loadBytes ? ctx.loadBytes : null;
  onBytes = bar ? (n) => bar.got(n) : null;
  // the lightmaps (lm_page.py; Robin, 2026-11-11, igloo.inc's way): where a figure has them, its light is read from
  // them, and its per-point light and crops are not loaded at all
  const LMJ = maskOnly ? null : await fetch(base + 'lightmaps.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  // Imu keeps the render's own pixels (the crops): his violet rim did not come through his shroud's lightmap
  // (2026-11-11), and the crops match the render on him to 99.9 % (he barely moves)
  const noLM = new URLSearchParams(location.search).has('nolm');      // checking aid: the crops on every figure
  const lmUse = (n) => !!(LMJ && !noLM && LMJ.figures[n] && n !== 'imu');
  // a lightmap file's share of the bytes: the maps evenly, the geometry by its own size
  const mapBytes = LMJ ? (LMJ.bytes - Object.values(LMJ.figures).reduce((s, x) => s + x.lm_bytes, 0)) /
    Object.values(LMJ.figures).reduce((s, x) => s + x.parts.length * LMJ.groups.length, 0) : 0;
  if (bar) {
    let total = meta.pack ? meta.pack.total : Object.values(meta.figures).reduce((s, f) => s + f.points * (14 + 15 * (f.light_steps || 0) +
      6 * (f.moving ? f.pos_steps : 0)) + f.triangles * 12, 0);
    if (LMJ && meta.pack) {
      // what a figure on its lightmaps does not read (its per-point light, its crops) and what it reads instead
      const area = (f) => (f.crop ? f.crop.size[0] * f.crop.size[1] : 0);
      const allArea = Object.values(meta.figures).reduce((s, f) => s + area(f), 0) || 1;
      for (const [n, f] of Object.entries(meta.figures)) {
        if (!lmUse(n) || !f.packed) continue;
        const L = LMJ.figures[n];
        total += L.lm_bytes + mapBytes * L.parts.length * LMJ.groups.length
          - f.packed.light.reduce((s, e) => s + e[1], 0) - (sizes.crops || 0) * area(f) / allArea;
      }
    }
    bar.expect(Math.round(total));
  }
  const verify = new URLSearchParams(location.search).has('verify');
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const counted = (name, p) => p.then((t) => { if (onBytes && t) onBytes(sizes[name] || 0); return t; });   // pictures: by their listed size
  const [backBase, backLights] = maskOnly ? [black, black] : await Promise.all([counted('backdrop-base.png', stillTex(base + 'backdrop-base.png')),
    counted('backdrop-lights.png', stillTex(base + 'backdrop-lights.png'))]);
  const scene = new THREE.Scene();
  const res = meta.camera.res, aspect = res[0] / res[1];
  // the render's camera, Blender (z up) to three (y up): x stays, z becomes y, y becomes -z
  const camera = new THREE.PerspectiveCamera(meta.camera.fov_y_deg, aspect, 0.1, 6000);
  const Mb = new THREE.Matrix4().set(...meta.camera.matrix_world.flat());
  const C = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
  new THREE.Matrix4().multiplyMatrices(C, Mb).decompose(camera.position, camera.quaternion, camera.scale);
  const camB = new THREE.Vector3().setFromMatrixPosition(Mb);
  const place = meta.place || {};
  const sea = place.sea_z ?? -0.42, shoreY = place.shore_y ?? 4.5;

  // the backdrop: drawn first, behind everything (depth 1)
  const backW = { value: [1, 0, 0, 0, 1] };
  const backMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BACK_VS, fragmentShader: BACK_FS, depthWrite: false,
    uniforms: { tBase: { value: backBase }, tLights: { value: backLights }, tLiveB: { value: black }, tLiveL: { value: black }, uLive: { value: 0 }, uW: backW,
      uTime: { value: 0 }, uHorizon: { value: 0.461 }, uShore: { value: 0.17 } } });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backMat);
  back.frustumCulled = false; back.renderOrder = -10;
  scene.add(back);

  const figW = { value: [1, 0, 0, 0, 1] };
  const figs = [];
  // the fabrics' maps (the render's own Poly Haven sets), tiled, and each one's average colour
  const fab = { d: [], n: [], avg: [new THREE.Vector3(1, 1, 1)], scale: [1] };
  const loadRepeat = (url, srgb) => new Promise((res) => new THREE.TextureLoader().load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; res(t);
  }, undefined, () => res(null)));
  function average(tex) {                          // the map's mean colour, linear (sRGB decoded)
    const im = tex.image, cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0, 64, 64);
    const px = g.getImageData(0, 0, 64, 64).data; const s = [0, 0, 0];
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) s[k] += lin(px[i + k]);
    const n = px.length / 4; return new THREE.Vector3(s[0] / n, s[1] / n, s[2] / n);
  }
  if (!maskOnly && meta.fabrics) {
    for (let c = 1; c <= 4; c++) {
      const F = meta.fabrics[String(c)] || {};
      const [d, n] = await Promise.all([F.diff ? counted(F.diff, loadRepeat(base + F.diff, true)) : null, F.nor ? counted(F.nor, loadRepeat(base + F.nor, false)) : null]);
      fab.d[c] = d || black; fab.n[c] = n || black;
      fab.avg[c] = d ? average(d) : new THREE.Vector3(1, 1, 1);
      fab.scale[c] = F.scale || 1;
    }
  }
  const detail = parseFloat(new URLSearchParams(location.search).get('detail') || '1');
  // stands in for a figure's crops where there are none (the mask, an older export)
  const noCrop = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1); noCrop.needsUpdate = true;
  // and for the moves of a figure that stands still
  const noPos = new THREE.DataArrayTexture(new Int16Array(4), 1, 1, 1);
  noPos.format = THREE.RGBAIntegerFormat; noPos.type = THREE.ShortType; noPos.internalFormat = 'RGBA16I'; noPos.needsUpdate = true;
  // the lightmaps are read without mipmaps: with them, the small levels ran each map's islands into each other and
  // showed as streaks along the seams (2026-11-11, on Imu's shroud); ?lmmip to compare
  const lmNoMip = !new URLSearchParams(location.search).has('lmmip');
  // the KTX2 reader (three's own, its Basis transcoder served with the page), if any lightmap comes as KTX2
  let ktx2 = null;
  if (LMJ && Object.values(LMJ.figures).some((x) => x.parts.some((p) => p.ktx2)) && !new URLSearchParams(location.search).has('lmpng')) {
    const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
    ktx2 = new KTX2Loader().setTranscoderPath('assets/vendor/three/addons/libs/basis/').detectSupport(ctx.renderer);
  }
  // at most four lightmaps on their way at once
  let lmBusy = 0;
  const lmWait = [];
  const lmSlot = async (job) => {
    if (lmBusy >= 4) await new Promise((r) => lmWait.push(r));
    lmBusy++;
    try { return await job(); } finally { lmBusy--; const n = lmWait.shift(); if (n) n(); }
  };
  // the backdrop as drawn and its size, for Imu's sea fog (shared by every figure material; set in ensure)
  const fogTex = { value: black }, fogRes = { value: new THREE.Vector2(1, 1) };
  const lmStat = { parts: 0, gpu: 0 }, cropStat = { files: 0, bytes: 0, gpu: 0 }, dataStat = { points: 0, triangles: 0, read: 0, gpu: 0, checked: 0 };
  const maskScene = new THREE.Scene();
  const loaded = await Promise.all(Object.entries(meta.figures).map(async ([name, f]) => {
    if (maskOnly && name !== 'luffy') return null;
    const V = f.points;
    // the page's packed set (bake_pack.py) where there is one, else the whole export's separate files
    const src = f.packed ? packedFigure(base, f, V, verify) : null;
    const [pos0, idx] = src ? [await src.plain('pos0', Float32Array), await src.idx()]
      : await Promise.all([bin(base + name + '-pos0.bin', Float32Array), bin(base + name + '-idx.bin', Uint32Array)]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos0, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    // each point's object and fabric (older exports have neither: no fabric detail)
    const [oi, mi] = src ? [await src.plain('obj', Uint8Array), await src.plain('mat', Uint8Array)]
      : await Promise.all([bin(base + name + '-obj.bin', Uint8Array).catch(() => new Uint8Array(V)),
        bin(base + name + '-mat.bin', Uint8Array).catch(() => new Uint8Array(V))]);
    geo.setAttribute('aObj', new THREE.BufferAttribute(Float32Array.from(oi), 1));
    geo.setAttribute('aMat', new THREE.BufferAttribute(Float32Array.from(mi), 1));
    const inv = [];
    for (let k = 0; k < 16; k++) inv.push(f.objects_inv && f.objects_inv[k] ? new THREE.Matrix4().set(...f.objects_inv[k].flat()) : new THREE.Matrix4());
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    // its own light: (steps, groups, points, 3) bytes, a layer a step and group; not for the mask
    const LS = f.light_steps;
    const LMF = lmUse(name) ? LMJ.figures[name] : null;
    let tLight = { tex: [], per: 1, bytes: 0, read: 0 }, crops = null;
    if (!maskOnly && !LMF) {
      tLight = await pointLayers(ctx.renderer, base + name + '-light.bin', V, LS, 'light', 2, src ? (s) => src.light(s) : null);
      // the crops: where the camera saw the surface in a light step, the fragment reads Cycles' own pixels from them
      // in place of the point's light above
      crops = await loadCrops(ctx.renderer, base, name, f, meta);
      if (crops) { cropStat.files += crops.files; cropStat.bytes += crops.bytes; cropStat.gpu += crops.gpu; }
    }
    const box = crops ? new THREE.Vector4(f.crop.box[0], f.crop.box[1], 1 / f.crop.size[0], 1 / f.crop.size[1]) : new THREE.Vector4(0, 0, 1, 1);
    const zr = crops ? new THREE.Vector2(f.crop.z[0], 1 / (f.crop.z[1] - f.crop.z[0])) : new THREE.Vector2(0, 1);
    // its moves: (steps, points, 3) int16, a layer a position step
    const tPos = f.moving ? await pointLayers(ctx.renderer, base + name + '-dpos.bin', V, f.pos_steps, 'pos', 3, src ? (s) => src.pos(s) : null)
      : { tex: [], per: 1, bytes: 0, read: 0 };
    dataStat.points += V; dataStat.triangles += f.triangles;
    dataStat.read += src ? src.stat.read : pos0.byteLength + idx.byteLength + 2 * V + tLight.read + tPos.read;
    dataStat.checked += src ? src.stat.checked : 0;
    dataStat.gpu += pos0.byteLength + idx.byteLength + 8 * V + tLight.bytes + tPos.bytes;
    const cut = name === 'imu' ? sea : name === 'rock' ? -0.40 : -1e9;
    // Imu's sea fog: the lowest share of his height above the water (?imufog=0..1, 0 off): 0.13, up to the horizon behind
    // him on screen (Robin, 2026-11-12: "reduce imu's transition zone to be below the horizon behind it")
    let zTop = -1e9;
    for (let i = 2; i < pos0.length; i += 3) if (pos0[i] > zTop) zTop = pos0[i];
    const fq = new URLSearchParams(location.search).get('imufog');
    // the share of his height from his base to the horizon behind him (picture 0.461), from his frame on this format
    // (desktop about 0.14, the phone about 0.05: there he stands nearly on the horizon)
    const imf = place.imu_frame, toHz = !ctx.phone ? 0.13 : imf ? Math.max(0.02, Math.min(0.3, (0.461 - imf[1]) / (imf[3] - imf[1]))) : 0.13;
    const imuFogH = name === 'imu' ? (fq === null ? toHz : parseFloat(fq)) * Math.max(0, zTop - sea) : 0;
    const mk = (mirror, mask = 0, lm = null, level = null) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: FIG_VS, fragmentShader: FIG_FS, side: THREE.DoubleSide,
      defines: Object.assign(lm ? { LM: 1 } : {}, name === 'luffy' ? {} : { NOFAB: 1 }),
      uniforms: {
        uLMS: { value: level || [1, 1, 1, 1, 1] },
        tBackF: fogTex, uRes2: fogRes, uFogH: { value: name === 'imu' && !mask ? imuFogH : 0 },
        tLM0: { value: lm ? lm[0] : black }, tLM1: { value: lm ? lm[1] : black }, tLM2: { value: lm ? lm[2] : black },
        tLM3: { value: lm ? lm[3] : black }, tLM4: { value: lm ? lm[4] : black },
        tPos0: { value: tPos.tex[0] || noPos }, tPos1: { value: tPos.tex[1] || noPos }, tPos2: { value: tPos.tex[2] || noPos }, uPosPer: { value: tPos.per },
        tLight0: { value: tLight.tex[0] || noCrop }, tLight1: { value: tLight.tex[1] || noCrop }, uLightPer: { value: tLight.per },
        uPosSteps: { value: f.pos_steps || 1 },
        uLightSteps: { value: LS }, uMoving: { value: f.moving ? 1 : 0 }, uPosT: { value: 0 }, uLightT: { value: 0 },
        uDscale: { value: f.dscale || 0 }, uMirror: { value: mirror }, uSea: { value: sea }, uShoreY: { value: shoreY },
        uTime: { value: 0 }, uCam: { value: camB }, uW: mask ? { value: [0, 0, 0, 0, 0] } : figW, uCut: { value: cut }, uMask: { value: mask },
        uInv: { value: inv }, uScale: { value: [1, fab.scale[1] || 1, fab.scale[2] || 1, fab.scale[3] || 1, fab.scale[4] || 1] },
        uAvg: { value: [0, 1, 2, 3, 4].map((c) => fab.avg[c] || new THREE.Vector3(1, 1, 1)) }, uDetail: { value: name === 'luffy' ? detail : 0 },
        tD1: { value: fab.d[1] || black }, tD2: { value: fab.d[2] || black }, tD3: { value: fab.d[3] || black }, tD4: { value: fab.d[4] || black },
        tN1: { value: fab.n[1] || black }, tN2: { value: fab.n[2] || black }, tN3: { value: fab.n[3] || black }, tN4: { value: fab.n[4] || black },
        // the crops (not for the mask): the light steps are uLP position steps apart
        tCropS: { value: crops ? crops.tS : noCrop }, tCropL: { value: crops ? crops.tL : noCrop }, tCropD: { value: crops ? crops.tD : noCrop },
        uCrop: { value: crops && !mask ? 1 : 0 }, uFull: { value: crops ? crops.full : [0, 0, 0, 0, 0] }, uSlot: { value: crops ? crops.slot : [0, 0, 0, 0, 0] },
        uNF: { value: crops ? crops.NF : 1 }, uNH: { value: crops ? crops.NH : 1 }, uZ: { value: zr },
        uBox: { value: box }, uRes: { value: new THREE.Vector2(res[0], res[1]) }, uLP: { value: Math.round(meta.light_step / meta.pos_step) }
      },
      // every figure and its image in the sea is marked in the stencil (Imu himself 1, the rest 2): over the storm
      // loop the live rain is drawn only where they are, and over Imu it is dimmed as the render's is (RAIN_IMU 0.12)
      stencilWrite: !mask, stencilRef: name === 'imu' && !mirror ? 1 : 2, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp
    });
    // its image in the sea, only if any of it can show there: the image is drawn where the view ray meets the water
    // beyond the shore line, which lies between the camera and the point, so a figure that never reaches past that
    // line (Luffy and the rock stand 4 m short of it) has none, and its 3.6 million triangles are not drawn twice
    let farY = -Infinity;
    for (let i = 1; i < pos0.length; i += 3) if (pos0[i] > farY) farY = pos0[i];
    const mirrored = farY + (f.moving ? (f.dscale || 0) * 32767 : 0) >= shoreY;
    // with lightmaps: one mesh a part, its vertices page points at their place in the part's maps (lm_page.py)
    const parts = [];
    if (LMF) {
      const lmBuf = (await grab(base + LMF.file)).body;
      if (!lmBuf) throw new Error('missing ' + LMF.file);
      // each map read with grab()'s retries, a few at a time (fifty 4K pictures asked for at once ran the browser out
      // of buffers, ERR_NO_BUFFER_SPACE, and a part came out black), decoded off the main thread, rows flipped so
      // the map's v runs up as Blender's does
      const map = (url, k2url) => lmSlot(async () => {
        try {
          if (k2url && ktx2) {
            // KTX2 (lm_ktx.sh): UASTC, transcoded to the GPU's own compressed format (BC7 here), a quarter of the
            // memory of the plain picture; stored bottom row first, so v runs up as the PNG's flip gave
            const r = await grab(base + k2url);
            if (!r.body) throw new Error('missing');
            const t = await new Promise((res, rej) => ktx2.parse(r.body, res, rej));
            t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16;
            t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter;
            t.needsUpdate = true;
            return t;
          }
          const r = await grab(base + url, undefined, 'blob');
          if (!r.body) throw new Error('missing');
          const bmp = await createImageBitmap(r.body, { imageOrientation: 'flipY', colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
          const t = new THREE.Texture(bmp);
          t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.flipY = false;
          if (lmNoMip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; } else t.minFilter = THREE.LinearMipmapLinearFilter;
          t.needsUpdate = true;
          return t;
        } catch (e) { if (window.console) console.info('lightmap not read: ' + url + ' (' + e.message + ')'); return black; }
      });
      for (const p of LMF.parts) {
        const src = new Uint32Array(lmBuf, p.src, p.vertices), uv = new Uint16Array(lmBuf, p.uv, p.vertices * 2);
        const pidx = new Uint32Array(lmBuf, p.idx, p.triangles * 3);
        const pos = new Float32Array(p.vertices * 3), aS = new Float32Array(p.vertices), aO = new Float32Array(p.vertices), aM = new Float32Array(p.vertices);
        for (let i = 0; i < p.vertices; i++) {
          const s = src[i];
          pos[i * 3] = pos0[s * 3]; pos[i * 3 + 1] = pos0[s * 3 + 1]; pos[i * 3 + 2] = pos0[s * 3 + 2];
          aS[i] = s; aO[i] = oi[s]; aM[i] = mi[s];
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('aSrc', new THREE.BufferAttribute(aS, 1));
        g.setAttribute('aLM', new THREE.BufferAttribute(uv, 2, true));
        g.setAttribute('aObj', new THREE.BufferAttribute(aO, 1));
        g.setAttribute('aMat', new THREE.BufferAttribute(aM, 1));
        g.setIndex(new THREE.BufferAttribute(pidx, 1));
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
        const tex = await Promise.all(LMJ.groups.map((gn) => map(p.maps[gn], p.ktx2 && p.ktx2[gn])));
        parts.push({ g, tex, level: LMJ.groups.map((gn) => (p.level && p.level[gn]) || 1) });
        dataStat.gpu += pos.byteLength + aS.byteLength * 3 + uv.byteLength + pidx.byteLength;
        lmStat.parts++; lmStat.gpu += tex.reduce((s, t) => s + (t.isCompressedTexture ? t.image.width * t.image.height : t.image ? t.image.width * t.image.height * 4 : 0), 0);
      }
    }
    const mkMesh = (g, mat, order) => { const m = new THREE.Mesh(g, mat); m.frustumCulled = false; if (order !== undefined) m.renderOrder = order; return m; };
    const meshes = LMF ? parts.map((p) => mkMesh(p.g, mk(0, 0, p.tex, p.level))) : [mkMesh(geo, mk(0))];
    const refls = mirrored ? (LMF ? parts.map((p) => mkMesh(p.g, mk(0.32, 0, p.tex, p.level), -5)) : [mkMesh(geo, mk(0.32), -5)]) : [];
    const mesh = meshes[0], refl = refls[0] || null;
    let maskMesh = null, last = null;
    if (name === 'luffy') {                          // where he stands on screen, for the globe to pass behind him
      maskMesh = new THREE.Mesh(geo, mk(0, 1));
      maskMesh.frustumCulled = false;
      // drawn last in the mask's pass, and drawing nothing: a material with no textures. three counts texture units
      // on from the last program of the render before when it makes the globe's environment map inside the page's
      // own render (it restores the count that render began with), and after this figure's 16 samplers it warned
      // "Trying to use 17 ... 23 texture units"
      last = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthTest: false, depthWrite: false }));
      last.frustumCulled = false; last.renderOrder = 1e6;
    }
    return { name, mesh, refl, meshes, refls, maskMesh, last, f };
  }));
  // (the figures are read side by side; they join the scene in the export's order, as before)
  for (const F of loaded) {
    if (!F) continue;
    if (!maskOnly) { F.refls.forEach((m) => scene.add(m)); F.meshes.forEach((m) => scene.add(m)); }
    if (F.maskMesh) maskScene.add(F.maskMesh, F.last);
    figs.push(F);
  }
  if (window.console) {
    console.info('baked figures: ' + dataStat.points + ' points, ' + dataStat.triangles + ' triangles, ' + (dataStat.read / 1e6).toFixed(0) + ' MB read, ' +
      (dataStat.gpu / 1e6).toFixed(0) + ' MB on the GPU' + (maskOnly ? ' (his mask only)' : '') +
      (meta.pack ? '; of ' + meta.pack.whole.points + ' points as rendered, the rest never in view' : '') +
      (dataStat.checked ? '; ' + dataStat.checked + ' chunks checked against the export: all as packed' : ''));
    if (lmStat.parts) console.info('lightmaps: ' + lmStat.parts + ' parts, ' + (lmStat.gpu / 1e6).toFixed(0) + ' MB of textures' + (lmNoMip ? '' : ' with mipmaps'));
    if (cropStat.files) console.info('baked crops: ' + cropStat.files + ' files, ' + (cropStat.bytes / 1e6).toFixed(1) + ' MB read, ' + (cropStat.gpu / 1e6).toFixed(0) + ' MB of textures');
  }

  // the rain
  let rain = null;
  if (meta.rain && !maskOnly) {
    const R = await bin(base + 'rain.bin', Float32Array), n = meta.rain.streaks;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const A = new Float32Array(n * 4), B = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { for (let k = 0; k < 4; k++) A[i * 4 + k] = R[i * 6 + k]; B[i * 2] = R[i * 6 + 4]; B[i * 2 + 1] = R[i * 6 + 5]; }
    g.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
    g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 2));
    g.instanceCount = n;
    const lean = meta.rain.lean_deg * Math.PI / 180;
    const ru = { tBack: { value: null }, uMix: { value: 0.25 }, uGain: { value: 1 }, uLoop: { value: 0 }, uTop: { value: meta.rain.top },
      uSea: { value: meta.rain.sea }, uTl: { value: Math.tan(lean) }, uCosL: { value: Math.cos(lean) }, uSize: { value: new THREE.Vector2(1, 1) }, uRes: { value: 1 } };
    // two passes by the figures' stencil marks: over Imu (1), dimmed; and the rest: everywhere but Imu over the still
    // backdrop, only over the other figures and the images in the sea (2) once the storm loop plays behind (render)
    const mkRain = (onImu) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: RAIN_VS, fragmentShader: RAIN_FS,
      // Until 2026-11-11 the live rain drew nothing at all, for two reasons, both mended here. DoubleSide: the streaks'
      // quads are built on the screen and come out facing away, so they were culled. premultipliedAlpha: the streaks'
      // light is added as it is; without it three multiplies an additive material's colour by its alpha, which the
      // shader leaves 0
      // over Imu at full strength (Robin, 2026-11-12, the rain he could not see over him; it was 0.12, the render's
      // RAIN_IMU, to match the old page)
      uniforms: { ...ru, uGain: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
      side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: onImu ? THREE.EqualStencilFunc : THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
    const r1 = new THREE.Mesh(g, mkRain(false)), r2 = new THREE.Mesh(g, mkRain(true));
    r1.frustumCulled = r2.frustumCulled = false;
    r1.renderOrder = r2.renderOrder = 10;
    scene.add(r1, r2);
    rain = [r1, r2];
  }

  // the fog bank at Imu's base (FOG_FS), after the figures and before the rain; ?fog=0..1 to set its amount
  let fog = null;
  if (!maskOnly) {
    const fa = new URLSearchParams(location.search).get('fog');
    const fm = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BACK_VS, fragmentShader: FOG_FS,
      // off by default: the page's own fog (opening.js, with its bank at his base) does this now (Robin, 2026-11-12:
      // "look at the fog we use in our current version"); ?fog=0..1 to compare
      uniforms: { tBack: { value: black }, uTime: { value: 0 }, uAmt: { value: fa === null ? 0 : parseFloat(fa) } },
      transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false });
    fog = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fm);
    fog.frustumCulled = false; fog.renderOrder = 8; fog.visible = fm.uniforms.uAmt.value > 0;
    scene.add(fog);
  }
  // the frame: linear light, the render's shape, multisampled; and his mask, the same shape
  let target = null, backCopy = null, maskT = null, emptyT = null;
  // Phones draw this frame at their own drawing size: with a 960 floor a phone at 499 x 1008 drew 960 x 1707 behind
  // it (three times the pixels; 21 fps where the page without it ran at 60), and the page's quality step-down could
  // not shrink it. Desktop keeps the 960 floor. Checking aids: ?bmin= the floor, ?bs= the smoothing samples (0 to 4)
  const bq = new URLSearchParams(location.search);
  const minW = bq.has('bmin') ? Math.max(240, parseInt(bq.get('bmin'), 10) || 960) : (ctx.phone ? 360 : 960);
  const SAMPLES = bq.has('bs') ? Math.max(0, Math.min(4, parseInt(bq.get('bs'), 10) || 0)) : 4;
  function ensure(w) {
    const tw = Math.min(3840, Math.max(minW, Math.round(w))), th = Math.round(tw / aspect);
    if (maskT && maskT.width === tw) return;
    if (maskT) { maskT.dispose(); if (target) { target.dispose(); backCopy.dispose(); } if (emptyT) { emptyT.dispose(); emptyT = null; } }
    // resolveDepthBuffer, resolveStencilBuffer false: only the colour is read afterwards. Left on (three's default),
    // every frame also copied the multisampled depth and stencil out: 3.0 of this draw's 6.2 ms at 1632 wide, 16 of
    // its 19.5 ms at 3840 (GPU timer, 2026-11-11), with nothing drawn at all
    maskT = new THREE.WebGLRenderTarget(tw, th, { samples: SAMPLES, resolveDepthBuffer: false });
    if (maskOnly) return;
    target = new THREE.WebGLRenderTarget(tw, th, { type: THREE.HalfFloatType, samples: SAMPLES, stencilBuffer: true, depthBuffer: true,
      resolveDepthBuffer: false, resolveStencilBuffer: false });
    backCopy = new THREE.WebGLRenderTarget(Math.round(tw / 2), Math.round(th / 2), { type: THREE.HalfFloatType });
    if (rain) rain.forEach((m) => { m.material.uniforms.tBack.value = backCopy.texture; m.material.uniforms.uSize.value.set(tw, th); });
    if (fog) fog.material.uniforms.tBack.value = backCopy.texture;
    fogTex.value = backCopy.texture; fogRes.value.set(tw, th);
  }
  const t0 = performance.now();
  let frame = 0;
  const backScene = new THREE.Scene();
  const back2 = new THREE.Mesh(back.geometry, backMat); back2.frustumCulled = false; backScene.add(back2);
  /* The figure-free storm loop's two video textures (plate.js's, already playing) as the backdrop in the still's
     place; null for the still again. The caller then gives render() the loop frame from that video's clock, so the
     figures, the live rain over them and the loop behind them keep one time. */
  function setBackdrop(baseTex, lightsTex) {
    const u = backMat.uniforms, on = !!(baseTex && lightsTex);
    u.tLiveB.value = on ? baseTex : black; u.tLiveL.value = on ? lightsTex : black; u.uLive.value = on ? 1 : 0;
  }
  /* s: weights [storm, a, b, c, globe] for the figures and the backdrop, the width to draw at, the loop frame to show
     (from the backdrop loop's or the video version's own clock; this page's clock if none is given), and mask: false
     where his mask is not wanted */
  function render(renderer, s) {
    ensure(s.width);
    frame = s.frame !== undefined ? s.frame : (((performance.now() - t0) / 1000) * 120) % 960;
    figW.value = s.w || figW.value; backW.value = s.w || backW.value;
    backMat.uniforms.uTime.value = (performance.now() - t0) / 1000;      // the live ripples on the still
    if (fog) fog.material.uniforms.uTime.value = backMat.uniforms.uTime.value;
    // s.fig: how much the figures show (plate.js). The scene with them is drawn while they show at all; the scene
    // without them (the backdrop and the rain: the scroll's storm, in place of the video it used to play) while they
    // are not fully shown
    const fig = s.fig === undefined ? 1 : s.fig;
    for (const F of figs) for (const m of [...F.meshes, ...F.refls, F.maskMesh]) {
      if (!m) continue;
      const u = m.material.uniforms;
      u.uPosT.value = frame / 8; u.uLightT.value = frame / 32;
    }
    if (rain) {
      rain.forEach((m) => { m.material.uniforms.uLoop.value = frame; });
      // the storm loop holds its own rain: the live streaks only where a figure covers it, so none is drawn twice
      const live = backMat.uniforms.uLive.value > 0.5;
      rain[0].material.stencilFunc = live ? THREE.EqualStencilFunc : THREE.NotEqualStencilFunc;
      rain[0].material.stencilRef = live ? 2 : 1;
    }
    const prev = renderer.getRenderTarget(), ac = renderer.autoClear, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    if (!maskOnly) {
      renderer.setRenderTarget(backCopy); renderer.render(backScene, camera);   // what lies behind the rain
      if (fig > 0.001) { renderer.setRenderTarget(target); renderer.render(scene, camera); }
      if (fig < 0.999) {
        if (!emptyT) emptyT = new THREE.WebGLRenderTarget(target.width, target.height, { type: THREE.HalfFloatType, samples: SAMPLES, resolveDepthBuffer: false });
        const shown = [];
        for (const F of figs) for (const m of [...F.meshes, ...F.refls]) if (m.visible) { m.visible = false; shown.push(m); }
        renderer.setRenderTarget(emptyT); renderer.render(scene, camera);
        for (const m of shown) m.visible = true;
      }
    }
    if (s.mask !== false) { renderer.setRenderTarget(maskT); renderer.render(maskScene, camera); }
    renderer.setRenderTarget(prev); renderer.autoClear = ac; renderer.setClearColor(cc, ca);
  }
  return { render, setBackdrop, get texture() { return target ? target.texture : null; }, get mask() { return maskT ? maskT.texture : null; },
    get emptyTexture() { return emptyT ? emptyT.texture : null; },
    get frame() { return frame; }, meta };
}
