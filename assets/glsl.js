/* Shared GLSL snippets: 2D and 3D value noise, fBm, curl noise and a rotation-matrix helper. */

export const NOISE2 = /* glsl */`
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
float fbm3(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
`;

export const NOISE3 = /* glsl */`
float hash3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 curl(vec3 p){const float e=.12;vec3 dx=vec3(e,0,0),dy=vec3(0,e,0),dz=vec3(0,0,e);
 vec3 A=vec3(0.),B=vec3(31.7,0.,0.),C=vec3(0.,67.3,0.);
 float zy=noise3(p+dy+C)-noise3(p-dy+C),yz=noise3(p+dz+B)-noise3(p-dz+B);
 float xz=noise3(p+dz+A)-noise3(p-dz+A),zx=noise3(p+dx+C)-noise3(p-dx+C);
 float yx=noise3(p+dx+B)-noise3(p-dx+B),xy=noise3(p+dy+A)-noise3(p-dy+A);
 return vec3(zy-yz,xz-zx,yx-xy)/(2.*e);}
`;

export const ROT = /* glsl */`
mat3 rotAxis(vec3 a,float g){float c=cos(g),s=sin(g),k=1.-c;
 return mat3(c+a.x*a.x*k,a.y*a.x*k+a.z*s,a.z*a.x*k-a.y*s, a.x*a.y*k-a.z*s,c+a.y*a.y*k,a.z*a.y*k+a.x*s,
  a.x*a.z*k+a.y*s,a.y*a.z*k-a.x*s,c+a.z*a.z*k);}
`;

/* sRGB-looking constants to linear light (the scene renders in linear and OutputPass tone-maps). */
export const LIN = /* glsl */`
vec3 lin(vec3 c){return pow(c,vec3(2.2));}
`;
