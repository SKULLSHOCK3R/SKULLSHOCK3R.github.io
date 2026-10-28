/* The two opening figures. Since 2026-10-26 they are photoreal Blender renders (asset-src/build_characters.py): Luffy
   from behind, built from Robin's silhouette (assets/luffy-mask.png) with a cloth-simulated Yonko cloak, and Imu's
   hooded velvet shroud with purple rims and shadow tendrils, each a seamless 48-frame loop with a transparent
   background. RENDERS below names the files and frames; opening.js loads the still PNG first and then the WebM loop
   (VP9, alpha packed beside the colour), and falls back to the SVG drawings here (2026-10-25) when a file is missing.
   Imu's eyes stay the page's own blinking layers (the render leaves the face dark); the same SVG markup is dropped into
   the page for the no-WebGL still. */
import * as THREE from 'three';

/* Photoreal renders, two sizes each: uhd (the native render, for 4K and high-density screens) and hd (half). frame:
   the render's extent in the figure's own units (Luffy: mask pixels, origin at the mask's top-left; Imu: the SVG units
   below), the same numbers as FRAME_LUFFY and FRAME_IMU in build_characters.py; hover: the point just above Luffy's
   open hand, the globe floats a gap above it (opening.js); bob: how far the hand rises and settles through the loop,
   in frame units, mirrored on the globe; vh: frame height as a fraction of the view height [desktop, phone]. The
   video packs each frame side by side: straight colour on the left, alpha as grey on the right, `gutter` black
   columns between. */
export const RENDERS = {
  luffy: {
    frame: { x0: -30, y0: -44, w: 560, h: 842, hover: [415, 163], bob: 4, vh: [0.726, 0.518] }, gutter: 16,
    hd: { still: 'assets/figures/luffy-still.png?v=7', video: 'assets/figures/luffy.webm?v=7', px: { w: 756, h: 1136 } },
    uhd: { still: 'assets/figures/luffy-still-4k.png?v=7', video: 'assets/figures/luffy-4k.webm?v=7', px: { w: 1512, h: 2273 } }
  },
  imu: {
    frame: { x0: -60, y0: -40, w: 420, h: 640, vh: [0.9, 0.5] }, gutter: 16,
    hd: { still: 'assets/figures/imu-still.png?v=2', video: 'assets/figures/imu.webm?v=2', px: { w: 567, h: 864 } },
    uhd: { still: 'assets/figures/imu-still-4k.png?v=2', video: 'assets/figures/imu-4k.webm?v=2', px: { w: 1134, h: 1728 } }
  }
};

/* Which size a screen needs: the native render once the figure would show taller than the half size (desktop
   4K, or a 2x laptop at 0.7 of the view); phones always take the lighter set. */
export function renderSize(phone) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  return !phone && innerHeight * dpr * 0.7 > 1150 ? 'uhd' : 'hd';
}

/* A still PNG (straight alpha) as a texture; rejects when the file is missing. */
export function loadStill(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
      resolve(tex);
    }, undefined, () => reject(new Error('still failed: ' + url)));
  });
}

/* The looping WebM as a video texture; resolves once the first frame can show, rejects on error or after `timeoutMs`. */
export function loadVideo(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true; video.preload = 'auto';
    video.setAttribute('aria-hidden', 'true');
    video.src = url;
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; video.src = ''; reject(new Error('video timeout: ' + url)); } }, timeoutMs || 12000);
    video.addEventListener('error', () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('video failed: ' + url)); } });
    video.addEventListener('loadeddata', () => {
      if (done) return;
      done = true; clearTimeout(timer);
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.NoColorSpace;    // packed layout: the figure shader decodes the colour half itself
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      video.play().catch(() => {});
      resolve({ video, texture: tex });
    });
    video.load();
  });
}

const IMU_DEFS = `<defs>
  <radialGradient id="imuAura" cx="50%" cy="30%" r="55%">
    <stop offset="0" stop-color="#d0102e" stop-opacity="0.55"/><stop offset="0.6" stop-color="#7a0a1c" stop-opacity="0.18"/><stop offset="1" stop-color="#7a0a1c" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="imuEye" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ff3b5c" stop-opacity="0.35"/><stop offset="0.45" stop-color="#ff2440" stop-opacity="0.7"/><stop offset="1" stop-color="#ff1a3a" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="imuRim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b5a6ff" stop-opacity="0.85"/><stop offset="0.7" stop-color="#6c5bb0" stop-opacity="0.45"/><stop offset="1" stop-color="#3a2f66" stop-opacity="0"/>
  </linearGradient>
  <filter id="imuWaver" x="-20%" y="-10%" width="140%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="8" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="shadowWrithe" x="-60%" y="-20%" width="220%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.03 0.012" numOctaves="2" seed="19"/><feDisplacementMap in="SourceGraphic" scale="18" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</defs>`;

const IMU_BODY = `<g filter="url(#shadowWrithe)" fill="#000" stroke="rgba(181,166,255,0.35)" stroke-width="1">
  <path d="M18 600 C30 560 40 520 36 470 C46 500 52 540 58 600 Z"/>
  <path d="M262 600 C258 540 266 470 286 420 C280 480 282 540 296 600 Z"/>
  <path d="M240 600 C244 560 250 530 262 510 C258 540 260 570 268 600 Z"/>
</g>
<g filter="url(#imuWaver)">
  <path fill="#010103" d="M150 36 C96 36 70 84 66 156 C60 256 50 420 20 600 L280 600 C250 420 240 256 234 156 C230 84 204 36 150 36 Z"/>
  <path fill="none" stroke="url(#imuRim)" stroke-width="3" d="M150 36 C96 36 70 84 66 156 C60 256 50 420 20 600 M150 36 C204 36 230 84 234 156 C240 256 250 420 280 600"/>
  <path fill="rgba(150,130,230,0.35)" stroke="rgba(150,130,230,0.22)" stroke-width="1.2" d="M84 120 C80 200 76 300 64 420 M220 118 C224 200 228 300 238 430 M174 120 L184 168 L178 168 Z"/>
</g>`;

/* Imu's eyes after Robin's anime stills (2026-10-27; the second, at the page's distance, governs): level almond eyes
   with a clean lavender-white sclera, a large red iris filling most of the eye's height (a dark rim, a red band, a dark
   ring, a red centre and a dark pupil), a red glow round the iris and a soft pale glow round the whole eye against the
   black hood, a thin dark lid line. One eye is drawn and mirrored about x 150 for the other. */
const EYE_D = 'M100 131 C107 120.5 133 120.5 141 131 C133 138.5 107 138.5 100 131 Z';
const IMU_EYE = `<path fill="#ffe2ec" opacity="0.55" filter="url(#imuHalo)" d="${EYE_D}"/>
  <path fill="#f1ecf6" d="${EYE_D}"/>
  <g clip-path="url(#imuEyeClip)">
    <circle cx="121" cy="130" r="10" fill="#ff2436" opacity="0.55" filter="url(#imuBloom)"/>
    <g>   <!-- crisp ring edges (Robin, 2026-10-27: "4k sharp"); the glow is the haze behind and the page's glow layer -->
      <circle cx="121" cy="130" r="6.9" fill="#3a060c"/>
      <circle cx="121" cy="130" r="6.1" fill="#d21c2c"/>
      <circle cx="121" cy="130" r="3.9" fill="#5e0a12"/>
      <circle cx="121" cy="130" r="3.1" fill="#e8343e"/>
      <circle cx="121" cy="130" r="1.3" fill="#4a060c"/>
    </g>
  </g>
  <path fill="none" stroke="#120814" stroke-width="0.9" stroke-linejoin="round" d="${EYE_D}"/>`;
const IMU_EYES = `<defs><filter id="imuBloom" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.8"/></filter>
<filter id="imuHalo" x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="2.4"/></filter>
<clipPath id="imuEyeClip"><path d="${EYE_D}"/></clipPath></defs>
<g>${IMU_EYE}</g><g transform="translate(300 0) scale(-1 1)">${IMU_EYE}</g>`;

const IMU_GLOW = `<ellipse cx="120" cy="131" rx="34" ry="17" fill="url(#imuEye)"/><ellipse cx="180" cy="131" rx="34" ry="17" fill="url(#imuEye)"/>`;

const LUFFY_BODY = `<defs>
  <filter id="cloakWave" x="-25%" y="-10%" width="150%" height="125%">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="22" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="hairWave" x="-30%" y="-30%" width="160%" height="160%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="11"/><feDisplacementMap in="SourceGraphic" scale="6" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <linearGradient id="cloakRim" x1="0" x2="1"><stop offset="0" stop-color="#2a3550"/><stop offset="0.5" stop-color="#05070c"/><stop offset="1" stop-color="#1a2236"/></linearGradient>
</defs>
<g fill="#020306">
  <path d="M262 236 C292 214 312 182 322 150 L336 154 C328 190 306 226 274 254 Z"/>
  <g filter="url(#hairWave)"><path d="M168 120 L158 104 L172 108 L170 92 L184 104 L190 88 L198 104 L210 90 L214 106 L228 96 L226 112 L240 110 L230 124 Z"/></g>
  <path d="M200 104 C178 104 166 120 166 140 C166 160 180 176 200 176 C220 176 234 160 234 140 C234 120 222 104 200 104 Z"/>
  <path fill="#07080b" d="M140 128 C150 116 176 110 200 110 C224 110 250 116 260 128 C246 134 224 136 200 136 C176 136 154 134 140 128 Z M172 120 C174 100 186 92 200 92 C214 92 226 100 228 120 Z"/>
  <path fill="#3a0b0b" d="M172 118 C182 122 218 122 228 118 L228 124 C218 128 182 128 172 124 Z"/>
  <g filter="url(#cloakWave)">
    <path d="M168 540 L194 540 L190 600 L164 600 Z M206 540 L232 540 L236 600 L210 600 Z"/>
    <path fill="url(#cloakRim)" stroke="rgba(150,175,230,0.3)" stroke-width="1.4" d="M200 168 C170 168 144 176 124 188 L64 246 L-34 326 C8 356 38 420 56 556 L102 544 L150 560 L200 546 L250 560 L298 544 L344 556 C362 420 392 356 434 326 L336 246 L276 188 C256 176 230 168 200 168 Z"/>
    <path fill="none" stroke="rgba(120,140,190,0.12)" stroke-width="2" d="M130 236 C100 330 80 430 76 552 M270 236 C300 330 320 430 324 552 M200 220 C198 340 200 450 200 548"/>
  </g>
</g>`;

function svgDoc(viewBox, inner, extraDefs) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" overflow="visible">${extraDefs || ''}${inner}</svg>`;
}

/* The SVG frames (x0 y0 w h = the viewBox). Imu's SVG spans 300 x 600 but the cloak overflows it: the textures use a
   wider frame. hover: the globe floats above this point (the raised hand) in SVG units; vh: frame height as a
   fraction of the view [desktop, phone]. */
export const FRAMES = {
  luffy: { viewBox: '-60 60 520 540', x0: -60, y0: 60, w: 520, h: 540, hover: [329, 140], bob: 0, vh: [0.62, 0.46] },
  imu: { viewBox: '-60 -40 420 640', x0: -60, y0: -40, w: 420, h: 640, vh: [0.9, 0.5] },
  imuEyes: { viewBox: '80 108 140 48', w: 140, h: 48, centre: [150, 132] },
  imuGlow: { viewBox: '60 92 180 80', w: 180, h: 80, centre: [150, 132] }
};

export const SVG = {
  luffy: svgDoc(FRAMES.luffy.viewBox, LUFFY_BODY),
  imu: svgDoc(FRAMES.imu.viewBox, IMU_BODY, IMU_DEFS),
  imuEyes: svgDoc(FRAMES.imuEyes.viewBox, IMU_EYES),
  imuGlow: svgDoc(FRAMES.imuGlow.viewBox, IMU_GLOW, IMU_DEFS)
};

/* The still picture for the no-WebGL and reduced-motion page: both figures in one drawing. */
export function stillSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${IMU_DEFS}
  <g transform="translate(760 -30) scale(1.05)">${IMU_BODY}${IMU_GLOW}${IMU_EYES}</g>
  <g transform="translate(220 170) scale(0.72)">${LUFFY_BODY}</g></svg>`;
}

/* Rasterises an SVG string to a CanvasTexture `px` pixels tall (aspect from the frame). */
export function svgTexture(svg, frame, px) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const h = px, w = Math.round(px * frame.w / frame.h);
    // the SVG gets its pixel size, so it is drawn sharp at that size rather than at the browser's 300 x 150 default
    const sized = svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
      resolve(tex);
    };
    img.onerror = () => reject(new Error('figure SVG failed to load'));
    img.src = url;
  });
}
