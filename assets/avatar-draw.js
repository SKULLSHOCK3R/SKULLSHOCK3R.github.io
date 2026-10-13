/* Original pixel-art avatar: two-dog tug of war.
   draw(fill, frame): fill(x, y, w, h, '#rrggbb') paints opaque rectangles on a 64x64 grid.
   Works in the browser (canvas) and in Node (GIF export). */
(function (root) {
  'use strict';
  var W = 64, H = 64, N = 12, GY = 51;

  function bayer(x, y) { return [[0, 2], [3, 1]][y & 1][x & 1] / 4; }

  function drawBg(f, i) {
    var bands = ['#080d1c', '#0a1124', '#0c1530', '#0f1b3a', '#122246', '#162a52'];
    var bh = Math.ceil(GY / bands.length);
    for (var b = 0; b < bands.length; b++) f(0, b * bh, W, bh + 1, bands[b]);
    var ramp = [null, '#13244a', '#1a3366', '#234a85'];
    for (var y = 0; y < GY + 1; y++) {
      for (var x = 0; x < W; x++) {
        var d = Math.sqrt((x - 32) * (x - 32) * 0.55 + (y - 38) * (y - 38) * 1.2);
        var m = 3 * (1 - d / 27);
        var lvl = Math.floor(Math.max(0, m) + bayer(x, y));
        if (lvl > 3) lvl = 3;
        if (lvl > 0) f(x, y, 1, 1, ramp[lvl]);
      }
    }
    f(0, GY + 1, W, H - GY - 1, '#141b30');
    f(0, GY + 1, W, 1, '#2a4a7c');
    f(0, GY + 2, W, 1, '#1c2a4a');
    for (var x2 = 1; x2 < W; x2 += 5) f(x2, GY + 5, 3, 1, '#1a2340');
    for (var x3 = 3; x3 < W; x3 += 7) f(x3, GY + 9, 2, 1, '#1a2340');
    // drifting motes
    for (var k = 0; k < 7; k++) {
      var a = 2 * Math.PI * i / N + k * 1.7;
      var mx = (k * 9 + 5) % 60 + Math.round(2 * Math.sin(a));
      var my = 6 + (k * 5) % 24 - Math.round(2 * Math.cos(a));
      f(mx, my, 1, 1, k % 2 ? '#5ad0ff' : '#e0a44a');
    }
  }

  function dog(f, c, i) {
    var d = c.dir, ox = c.ox + c.sh, L = c.len;
    function R(lx, ly, w, h, col) {
      var x = d > 0 ? ox + lx : ox - lx - w + 1;
      f(x, GY + ly, w, h, col);
    }
    var ph = (i + c.ph);
    var hd = 1 + (ph % 2);
    var eb = (ph % 2) ? -1 : 1;
    var tw = [-1, 0, 1, 0][ph % 4];
    var leg = ph % 2;
    var white = '#f2efe6';
    // shadow
    R(-1, 1, L + 4, 1, '#0b1020');
    // tail
    if (c.thickTail) {
      R(-1, -10, 1, 2, c.coat); R(-3, -11 + tw, 3, 2, c.coat);
    } else {
      R(-1, -10, 1, 1, c.coat); R(-2, -11 + tw, 1, 1, c.coat); R(-3, -12 + tw * 2, 1, 1, c.coat);
    }
    // far legs
    R(2 + leg, -5, 2, 5, c.dark); R(L - 4 - leg, -5, 2, 5, c.dark);
    R(2 + leg, -1, 2, 2, c.pawFar); R(L - 4 - leg, -1, 2, 2, c.pawFar);
    // body
    R(0, -11, L, 7, c.coat);
    R(1, -6, L - 2, 1, c.dark);
    // near legs
    R(0 + leg, -5, 2, 5, c.coat); R(L - 2 - leg, -5, 2, 5, c.coat);
    R(0 + leg, -2, 2, 2, c.paw); R(L - 2 - leg, -2, 2, 2, c.paw);
    // chest
    if (c.chest) R(L - 3, -9, 3, 5, c.chest);
    // neck + head
    R(L - 3, -12 + hd, 4, 6, c.coat);
    R(L - 1, -14 + hd, 8, 7, c.coat);
    if (c.jaw) R(L + 1, -7 + hd, 6, 1, c.coat);
    R(L + 7, -11 + hd, c.snout, 4, c.coat);
    if (c.blaze) {
      R(L + 3, -14 + hd, 2, 4, white);
      R(L + 5, -11 + hd, c.snout + 2, 2, white);
      R(L + 7, -9 + hd, c.snout, 1, white);
    }
    var tip = L + 7 + c.snout - 1;
    R(tip, -11 + hd, 1, 2, c.nose);
    R(L + 4, -12 + hd, 1, 1, '#0a0a10');
    R(L + 4, -13 + hd, 2, 1, c.dark);
    // ear
    if (c.rose) R(L, -16 + hd + (eb > 0 ? 0 : -1), 2, 3, c.ear);
    else R(L - 1, -13 + hd + (eb > 0 ? 1 : 0), 3, 5, c.ear);
    // collar
    R(L - 2, -11 + hd, 2, 5, '#d02a2a');
    R(L - 2, -7 + hd, 1, 1, '#f0c040');
    return { x: d > 0 ? ox + tip : ox - tip, y: GY - 9 + hd };
  }

  function draw(f, i) {
    i = ((i % N) + N) % N;
    drawBg(f, i);
    var sh = Math.round(1.4 * Math.sin(2 * Math.PI * i / N));
    var dogA = dog(f, {
      ox: 6, dir: 1, sh: sh, ph: 0, len: 11, snout: 3, jaw: true, rose: true, blaze: true,
      coat: '#a8461f', dark: '#7a3216', ear: '#6e2c12', chest: '#f2efe6',
      paw: '#f2efe6', pawFar: '#d8d4c8', nose: '#16120f', thickTail: false
    }, i);
    var dogB = dog(f, {
      ox: 58, dir: -1, sh: sh, ph: 1, len: 12, snout: 4, jaw: false, rose: false, blaze: false,
      coat: '#e6c872', dark: '#c9a24a', ear: '#bf9638', chest: null,
      paw: '#e6c872', pawFar: '#c9a24a', nose: '#1a1410', thickTail: true
    }, i);
    // rope
    var x1 = dogA.x - 1, x2 = dogB.x + 1, span = x2 - x1;
    var sag = 1 + (i % 3 === 0 ? 1 : 0);
    for (var x = x1; x <= x2; x++) {
      var u = span ? (x - x1) / span : 0;
      var y = Math.round(dogA.y + (dogB.y - dogA.y) * u + sag * Math.sin(Math.PI * u));
      var col = (Math.floor((x + i) / 2) % 2) ? '#d8b25a' : '#9c7430';
      f(x, y, 1, 2, col);
    }
  }

  var api = { W: W, H: H, FRAMES: N, DELAY: 100, draw: draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AvatarArt = api;
})(typeof window !== 'undefined' ? window : this);
