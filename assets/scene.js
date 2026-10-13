(function () {
  'use strict';
  var W = 320, H = 180, LOOP = 2.4, TAU = Math.PI * 2;   // everything animated is periodic in LOOP seconds (seamless GIF)
  var cv = document.getElementById('scene');
  var ctx = cv.getContext ? cv.getContext('2d') : null;
  if (ctx) ctx.imageSmoothingEnabled = false;

  function mk() { var c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d'); }
  function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function hx(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function mix(a, b, t) {
    var p = hx(a), q = hx(b);
    return 'rgb(' + Math.round(p[0] + (q[0] - p[0]) * t) + ',' + Math.round(p[1] + (q[1] - p[1]) * t) + ',' + Math.round(p[2] + (q[2] - p[2]) * t) + ')';
  }
  function rnd(n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
  function line(c, x0, y0, x1, y1, w, col) {
    c.fillStyle = col;
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx - dy;
    for (;;) {
      c.fillRect(x0 - (w >> 1), y0 - (w >> 1), w, w);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e;
      if (e2 > -dy) { e -= dy; x0 += sx; }
      if (e2 < dx) { e += dx; y0 += sy; }
    }
  }
  function ellipse(c, cx, cy, rx, ry, col) {
    c.fillStyle = col;
    for (var y = -ry; y <= ry; y++) {
      var half = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry + 0.0001)));
      c.fillRect(cx - half, cy + y, half * 2 + 1, 1);
    }
  }
  function route(v) {
    var pts = [];
    for (var i = 0; i < v.length - 1; i++) {
      var a = v[i], b = v[i + 1], n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      for (var k = 0; k < n; k++) pts.push([a[0] + Math.sign(b[0] - a[0]) * k, a[1] + Math.sign(b[1] - a[1]) * k]);
    }
    pts.push(v[v.length - 1].slice());
    return pts;
  }

  /* ---------- layout constants ---------- */
  var PANES = [[9, 88], [92, 170], [174, 255]], WY0 = 9, WY1 = 86;     // window panes (x ranges) and glass top/bottom
  var ARC = { x: 160, y: 110 };                                       // weld point: hidden behind the welder's head and shoulders
  var SIGNS = [   // abstract neon signs, no real names
    { x: 22, y: 38, w: 3, h: 20, c: '#ff3fb8', t: 'v' }, { x: 60, y: 52, w: 16, h: 3, c: '#34e6ff', t: 'h' },
    { x: 118, y: 30, w: 3, h: 26, c: '#ffb23a', t: 'v' }, { x: 138, y: 58, w: 18, h: 3, c: '#ff3fb8', t: 'z' },
    { x: 196, y: 36, w: 3, h: 22, c: '#34e6ff', t: 'v' }, { x: 220, y: 56, w: 14, h: 3, c: '#ffb23a', t: 'z' },
    { x: 238, y: 40, w: 8, h: 8, c: '#ff3fb8', t: 'o' }
  ];

  /* ---------- traces (periodic: one trip per loop) ---------- */
  var traces = [
    [[104, 50], [91, 50], [91, 7], [6, 7]],
    [[104, 76], [91, 76], [91, 90], [40, 90], [40, 99]],
    [[216, 30], [259, 30], [259, 60], [290, 60], [290, 80], [316, 80]],
    [[216, 70], [259, 70], [259, 92], [300, 92]],
    [[118, 104], [96, 104], [96, 128], [70, 128], [70, 150], [40, 150]],
    [[202, 104], [226, 104], [226, 124], [258, 124], [258, 148], [300, 148]],
    [[134, 100], [134, 108], [112, 108], [112, 120]],
    [[186, 100], [186, 106], [214, 106], [214, 118]]
  ].map(function (v, i) { var p = route(v); return { v: v, pts: p, off: (i * 37) % (p.length + 24) }; });

  /* ---------- static background: city behind the glass ---------- */
  var back = mk();
  (function () {
    var c = back, y, x, i;
    for (y = 0; y < 100; y++) {
      var t = y / 90, col;
      if (t < .55) col = mix('#0d0722', '#2a0f4e', t / .55);
      else col = mix('#2a0f4e', '#8a2a7a', Math.min(1, (t - .55) / .45));
      R(c, 0, y, W, 1, col);
    }
    for (i = 0; i < 40; i++) R(c, Math.floor(rnd(i + 3) * 250) + 6, Math.floor(rnd(i + 90) * 40) + 8, 1, 1, i % 3 ? '#8c78c8' : '#ffffff');
    function layer(seed, wmin, wr, hmin, hr, base, litCols, prob, wsz, gap) {
      var xx = -4, k = 0;
      while (xx < 262) {
        var bw = wmin + Math.floor(rnd(seed + k * 3.1) * wr), bh = hmin + Math.floor(rnd(seed + k * 5.7) * hr), top = WY1 - bh;
        R(c, xx, top, bw, bh + 4, base);
        R(c, xx, top, bw, 1, mix(base, '#6a3a9a', .35));
        for (var wy = top + 3; wy < WY1 - 2; wy += gap) for (var wx = xx + 2; wx < xx + bw - 2; wx += gap + 1)
          if (rnd(seed + wx * 1.3 + wy * 7.1) < prob) R(c, wx, wy, wsz, wsz > 1 ? 2 : 1, litCols[Math.floor(rnd(wx + wy * 3) * litCols.length)]);
        if (rnd(seed + k * 9.3) > .6) R(c, xx + (bw >> 1), top - 5, 1, 5, base);          // antenna
        xx += bw + (rnd(seed + k) > .7 ? 2 : 0); k++;
      }
    }
    layer(11, 8, 9, 20, 26, '#3c1c72', ['#a070d8', '#c08af0'], .18, 1, 3);
    layer(41, 12, 10, 26, 32, '#26134c', ['#f0b060', '#60d0f0', '#c880ff'], .2, 1, 3);
    layer(77, 16, 14, 34, 34, '#130a28', ['#ffc070', '#58d8ff', '#ff7ad0'], .2, 2, 5);
    // neon signs (static body; glow is added live)
    SIGNS.forEach(function (s) {
      R(c, s.x - 1, s.y - 1, s.w + 2, s.h + 2, '#14091f');
      if (s.t === 'v') { R(c, s.x, s.y, s.w, s.h, s.c); for (var q = 2; q < s.h - 1; q += 5) R(c, s.x - 3, s.y + q, s.w + 6, 1, s.c); }
      else if (s.t === 'h') { R(c, s.x, s.y, s.w, s.h, s.c); R(c, s.x, s.y - 4, 6, 1, s.c); R(c, s.x + 10, s.y + 5, 5, 1, s.c); }
      else if (s.t === 'z') { for (var z = 0; z < s.w; z++) R(c, s.x + z, s.y + ((z >> 1) % 2) * 3, 1, 1, s.c); R(c, s.x, s.y + 4, s.w, 1, s.c); }
      else { ellipse(c, s.x + 4, s.y + 4, 4, 4, s.c); ellipse(c, s.x + 4, s.y + 4, 2, 2, '#14091f'); }
    });
    // road
    R(c, 0, 80, 262, 8, '#0c0716'); R(c, 0, 80, 262, 1, '#3a1c58');
    for (x = 0; x < 262; x += 14) R(c, x, 84, 7, 1, '#2a1a40');
    // horizon haze
    for (y = 60; y < 86; y++) R(c, 0, y, 262, 1, 'rgba(255,60,170,' + ((y - 60) / 26 * .12) + ')');
  })();

  /* ---------- static foreground: wall, window frames, sill, bench, props ---------- */
  var front = mk();
  (function () {
    var c = front, x, y;
    for (y = 0; y < 100; y++) R(c, 0, y, W, 1, mix('#0d1428', '#121b36', y / 100));
    for (x = 0; x < W; x += 40) R(c, x, 0, 1, 100, '#0a1122');
    PANES.forEach(function (p) { c.clearRect(p[0], WY0, p[1] - p[0] + 1, WY1 - WY0 + 1); });
    // frame highlights
    PANES.forEach(function (p) {
      R(c, p[0] - 1, WY0 - 1, p[1] - p[0] + 3, 1, '#2f3c66'); R(c, p[0] - 1, WY0 - 1, 1, WY1 - WY0 + 3, '#2a3660');
      R(c, p[1] + 1, WY0 - 1, 1, WY1 - WY0 + 3, '#070b17');
    });
    R(c, 6, 4, 252, 4, '#0b1124'); R(c, 6, 4, 252, 1, '#34416e');
    R(c, 6, WY1 + 1, 252, 6, '#1a2342'); R(c, 6, WY1 + 1, 252, 1, '#4a5a90'); R(c, 6, WY1 + 6, 252, 1, '#090d1a');
    // glass sheen
    PANES.forEach(function (p) {
      for (var k = 0; k < 3; k++) { var sx = p[0] + 10 + k * 22; for (var s = 0; s < 30; s++) R(c, sx + (s >> 1), WY0 + 4 + s, 2, 1, 'rgba(255,255,255,.035)'); }
    });
    // pegboard + tools on the right wall
    R(c, 262, 12, 54, 78, '#0f1830');
    for (var py = 16; py < 88; py += 6) for (var px = 266; px < 314; px += 6) R(c, px, py, 1, 1, '#070b17');
    R(c, 270, 20, 2, 22, '#26365c'); R(c, 267, 18, 8, 4, '#26365c');
    R(c, 284, 24, 10, 3, '#26365c'); R(c, 288, 24, 3, 20, '#2b3d66');
    R(c, 300, 20, 2, 20, '#26365c'); R(c, 306, 20, 2, 20, '#26365c'); R(c, 299, 38, 10, 5, '#2b3d66');
    R(c, 268, 54, 40, 3, '#26365c'); R(c, 272, 60, 3, 12, '#2b3d66'); R(c, 288, 60, 3, 12, '#2b3d66'); R(c, 300, 60, 3, 10, '#2b3d66');
    // shelf + jars (silhouettes against the window)
    R(c, 10, 62, 66, 3, '#2a3050'); R(c, 10, 65, 66, 1, '#161b30');
    R(c, 13, 48, 12, 14, '#241d44'); R(c, 13, 48, 12, 2, '#3a2e68');
    R(c, 29, 52, 8, 10, '#2a3a60'); R(c, 31, 50, 4, 2, '#3c5282');
    R(c, 42, 54, 14, 8, '#1c2342'); R(c, 44, 56, 3, 3, '#5ee1ff'); R(c, 50, 56, 3, 3, '#1b6f9e');
    R(c, 60, 46, 12, 16, '#241d44'); R(c, 62, 50, 8, 4, '#0b1226');
    // sill items
    R(c, 14, 76, 10, 11, '#1d1838'); R(c, 28, 80, 12, 7, '#171233'); R(c, 118, 78, 8, 9, '#1d1838'); R(c, 120, 74, 2, 4, '#2a6a4a'); R(c, 118, 74, 2, 3, '#3a8a5a'); R(c, 123, 75, 2, 3, '#2a6a4a');
    // base traces
    traces.forEach(function (t) { t.pts.forEach(function (p) { R(c, p[0], p[1], 1, 1, '#14507a'); }); });
    // bench
    for (y = 100; y < 150; y++) R(c, 0, y, W, 1, mix('#171d34', '#212a47', (y - 100) / 50));
    R(c, 0, 100, W, 1, '#3a4776');
    [112, 126, 140].forEach(function (yy) { R(c, 0, yy, W, 1, '#121830'); });
    R(c, 0, 150, W, 6, '#0f1427'); R(c, 0, 150, W, 1, '#2b3560'); R(c, 0, 156, W, 24, '#090d1a');
    // PCB
    R(c, 74, 112, 28, 16, '#0f3b36'); R(c, 74, 112, 28, 1, '#1d6a5c');
    R(c, 80, 116, 8, 6, '#101820'); R(c, 92, 118, 6, 4, '#101820'); R(c, 78, 124, 3, 1, '#d9a441'); R(c, 96, 114, 2, 2, '#e05050');
    // parts bin
    R(c, 100, 134, 22, 12, '#243050'); R(c, 100, 134, 22, 2, '#34406a');
    R(c, 104, 138, 4, 3, '#c8302e'); R(c, 110, 139, 4, 3, '#e6c36a'); R(c, 116, 138, 3, 3, '#5ee1ff');
    // oscilloscope
    R(c, 236, 100, 40, 28, '#1a2240'); R(c, 236, 100, 40, 2, '#34406a');
    R(c, 240, 105, 26, 17, '#050a14'); R(c, 268, 106, 3, 3, '#3a4d7c'); R(c, 268, 112, 3, 3, '#3a4d7c');
    // mug
    R(c, 214, 130, 10, 10, '#d9dbe4'); R(c, 214, 130, 10, 2, '#7a3b2a'); R(c, 224, 132, 3, 5, '#d9dbe4'); R(c, 225, 133, 1, 3, '#171d34');
    // lamp (left)
    ellipse(c, 34, 142, 11, 3, '#0f1427'); R(c, 28, 136, 12, 6, '#2a2f45'); R(c, 28, 136, 12, 1, '#454c70');
    line(c, 34, 136, 38, 114, 2, '#586087'); line(c, 38, 114, 48, 100, 2, '#586087');
    R(c, 42, 91, 18, 2, '#8a5a1c'); R(c, 40, 93, 22, 3, '#d9a441'); R(c, 38, 96, 26, 2, '#a87420');
    R(c, 46, 98, 10, 2, '#ffe9a8');
    // workpiece: steel plate on the bench, welded at ARC
    R(c, 122, 110, 76, 2, '#6a7392'); R(c, 122, 112, 76, 2, '#3a4260'); R(c, 122, 110, 76, 1, '#8a94b4');
    R(c, 122, 114, 76, 1, '#161c32');
  })();

  /* ---------- glow layers ---------- */
  function glowLayer(draw) { var g = mk(); draw(g); return g.canvas; }
  var panelGlow = glowLayer(function (g) {
    var gr = g.createRadialGradient(160, 62, 8, 160, 62, 130);
    gr.addColorStop(0, 'rgba(60,170,255,.3)'); gr.addColorStop(.5, 'rgba(40,120,220,.1)'); gr.addColorStop(1, 'rgba(20,60,160,0)');
    g.save(); g.translate(0, 62); g.scale(1, .75); g.translate(0, -62); g.fillStyle = gr; g.fillRect(0, 0, W, H * 1.4); g.restore();
  });
  var lampGlow = glowLayer(function (g) {
    var gr = g.createRadialGradient(51, 100, 2, 51, 108, 78);
    gr.addColorStop(0, 'rgba(255,190,90,.55)'); gr.addColorStop(.35, 'rgba(255,150,50,.22)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = gr; g.fillRect(0, 20, 150, 160);
    var g3 = g.createRadialGradient(50, 128, 2, 50, 128, 40);
    g3.addColorStop(0, 'rgba(255,200,110,.3)'); g3.addColorStop(1, 'rgba(255,150,50,0)');
    g.save(); g.translate(0, 128); g.scale(1, .45); g.translate(0, -128); g.fillStyle = g3; g.fillRect(0, 60, 120, 140); g.restore();
  });
  // weld light: small, localised (radius about 70 art px); never reaches the text card
  var arcGlow = glowLayer(function (g) {
    g.save(); g.translate(ARC.x, ARC.y); g.scale(1, .72);
    var gr = g.createRadialGradient(0, 0, 1, 0, 0, 64);
    gr.addColorStop(0, 'rgba(190,225,255,.85)'); gr.addColorStop(.12, 'rgba(120,180,255,.42)'); gr.addColorStop(.45, 'rgba(70,120,230,.12)'); gr.addColorStop(1, 'rgba(40,80,200,0)');
    g.fillStyle = gr; g.fillRect(-80, -80, 160, 160); g.restore();
  });
  var scan = glowLayer(function (g) { for (var y = 0; y < H; y += 2) R(g, 0, y, W, 1, 'rgba(0,0,0,.14)'); });
  var cityGlow = glowLayer(function (g) {
    var gr = g.createLinearGradient(0, 40, 0, 90);
    gr.addColorStop(0, 'rgba(255,50,170,0)'); gr.addColorStop(1, 'rgba(255,60,170,.12)');
    g.fillStyle = gr; g.fillRect(6, 9, 252, 78);
  });

  /* ---------- dust (bobbing, periodic) ---------- */
  var motes = [];
  for (var m = 0; m < 46; m++) motes.push({
    x: rnd(m + 1) * W, y: 6 + rnd(m + 50) * 150, ax: 3 + rnd(m + 90) * 5, ay: 3 + rnd(m + 130) * 7,
    ph: rnd(m + 170) * TAU, k: 1 + Math.floor(rnd(m + 190) * 2), warm: rnd(m + 210) > .55
  });

  /* ---------- dynamic: panel ---------- */
  function drawPanel(c, u) {
    var x0 = 104, y0 = 12, x1 = 216, y1 = 98;
    c.fillStyle = 'rgba(14,70,150,.15)'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.fillStyle = 'rgba(120,220,255,.07)'; c.fillRect(x0, y0, x1 - x0, 8);
    var br = '#5ee1ff';
    [[x0, y0, 1, 1], [x1 - 1, y0, -1, 1], [x0, y1 - 1, 1, -1], [x1 - 1, y1 - 1, -1, -1]].forEach(function (k) {
      R(c, k[2] > 0 ? k[0] : k[0] - 7, k[1], 8, 1, br); R(c, k[0], k[3] > 0 ? k[1] : k[1] - 7, 1, 8, br);
    });
    R(c, x0 + 6, y0 + 4, 30, 2, 'rgba(130,230,255,.8)'); R(c, x1 - 20, y0 + 4, 14, 2, 'rgba(130,230,255,.4)');
    var step = Math.floor(u * 6);
    for (var r = 0; r < 9; r++) {
      var w = 6 + Math.floor(rnd(r * 3.1 + step) * 20), ind = (rnd(r + step * .37) > .6) ? 4 : 0;
      R(c, x0 + 7 + ind, y0 + 16 + r * 7, w, 2, 'rgba(110,210,255,' + (.35 + .3 * rnd(r + 9)) + ')');
    }
    var cx = 160, cy = 52, a;
    for (var i = 0; i < 28; i++) {
      a = i / 28 * TAU + u * TAU * 4 / 28;
      R(c, Math.round(cx + Math.cos(a) * 24), Math.round(cy + Math.sin(a) * 24), 1, 1, i % 7 === 0 ? '#bff3ff' : 'rgba(94,225,255,.7)');
    }
    for (var j = 0; j < 3; j++) for (var d = 0; d < 14; d++) {
      a = j * 2.094 - u * TAU / 3 + d * .07;
      R(c, Math.round(cx + Math.cos(a) * 15), Math.round(cy + Math.sin(a) * 15), 1, 1, 'rgba(120,230,255,' + (.9 - d * .05) + ')');
    }
    var pr = 3 + Math.round(1.5 * Math.sin(u * TAU * 2));
    ellipse(c, cx, cy, pr, pr, 'rgba(170,240,255,.85)');
    R(c, cx - 30, cy, 60, 1, 'rgba(94,225,255,.22)'); R(c, cx, cy - 30, 1, 60, 'rgba(94,225,255,.22)');
    for (var b = 0; b < 6; b++) {
      var h = 6 + Math.round((Math.sin(u * TAU + b * 1.1) * .5 + .5) * 38);
      R(c, 186 + b * 5, 86 - h, 3, h, 'rgba(94,225,255,' + (.45 + b * .05) + ')');
      R(c, 186 + b * 5, 86 - h, 3, 1, '#d5f8ff');
    }
    for (var x = x0 + 6; x < x1 - 6; x++) R(c, x, 92 + Math.round(2 * Math.sin(x * .27 + u * TAU) * Math.sin(x * .05)), 1, 1, 'rgba(160,240,255,.8)');
    R(c, x0, Math.round(y0 + u * (y1 - y0)), x1 - x0, 1, 'rgba(180,240,255,.28)');
  }

  function drawTraces(c, u) {
    traces.forEach(function (tr) {
      var n = tr.pts.length, cyc = n + 24, head = (u * cyc + tr.off) % cyc;
      for (var k = 0; k < 16; k++) {
        var i = Math.floor(head - k);
        if (i < 0 || i >= n) continue;
        var p = tr.pts[i];
        R(c, p[0], p[1], 1, 1, k === 0 ? '#ffffff' : 'rgba(94,225,255,' + (1 - k / 16) + ')');
      }
      var e = tr.v[tr.v.length - 1];
      R(c, e[0] - 1, e[1] - 1, 3, 3, (Math.floor(u * 6 + tr.off) % 2 === 0) ? '#5ee1ff' : '#1b6f9e');
    });
  }

  /* ---------- dynamic: city (cars, beacons, drone, neon flicker) ---------- */
  function drawCity(c, u, fi) {
    // traffic: pattern repeats every `sp` px, so moving one spacing per loop is seamless
    var k, x;
    for (k = -1; k < 6; k++) {
      x = Math.round(6 + k * 56 + u * 56);                                     // headlights, rightwards
      if (x > 6 && x < 256) { R(c, x, 82, 2, 1, '#ffffff'); R(c, x + 3, 82, 2, 1, '#ffe9a8'); R(c, x - 2, 83, 8, 1, 'rgba(255,230,160,.25)'); }
      x = Math.round(6 + k * 44 - u * 44 + 20);                                 // tail lights, leftwards
      if (x > 6 && x < 256) { R(c, x, 85, 2, 1, '#ff3030'); R(c, x + 4, 85, 2, 1, '#ff3030'); R(c, x - 1, 86 - 1, 8, 1, 'rgba(255,40,40,.2)'); }
    }
    // rooftop aircraft-warning beacons
    [[44, 36], [128, 24], [206, 28], [246, 40]].forEach(function (b, i) {
      if (Math.floor(u * 4 + i * .5) % 2 === 0) { R(c, b[0], b[1], 2, 2, '#ff2a2a'); R(c, b[0] - 1, b[1] - 1, 4, 4, 'rgba(255,40,40,.25)'); }
    });
    // patrol drone hovering across the sky
    var dx = 150 + 70 * Math.sin(u * TAU), dy = 26 + 4 * Math.sin(u * TAU * 2);
    R(c, Math.round(dx) - 1, Math.round(dy), 3, 1, '#c8d0f0');
    R(c, Math.round(dx), Math.round(dy) + 1, 1, 1, Math.floor(u * 6) % 2 ? '#40ff90' : '#ff4060');
    // neon glow (one sign flickers)
    c.save(); c.globalCompositeOperation = 'lighter';
    SIGNS.forEach(function (s, i) {
      var f = (i === 3) ? (rnd(fi * .7 + i) > .8 ? .35 : 1) : (.8 + .2 * Math.sin(u * TAU * (1 + (i % 2)) + i));
      c.fillStyle = s.c; c.globalAlpha = .13 * f;
      c.fillRect(s.x - 5, s.y - 5, s.w + 10, s.h + 10);
      c.globalAlpha = .1 * f; c.fillRect(s.x - 10, s.y - 10, s.w + 20, s.h + 20);
    });
    c.globalAlpha = 1; c.drawImage(cityGlow.canvas ? cityGlow.canvas : cityGlow, 0, 0); c.restore();
  }

  /* ---------- dynamic: the welder (seen from behind, wrapped in a flowing cloak) ---------- */
  var HAIR = '#1a1410', SKIN2 = '#8a5c40';
  var CXF = 160, TOPY = 88, YS = 116, HEM = 175;                     // figure centre x, hat top, shoulder line, hem line
  var CL = ['#05060a', '#10131c', '#1a1f2e', '#2c3552'];             // cloak: deep crease, base, mid, highlight
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tri(v) { v = ((v % 2) + 2) % 2; return Math.abs(v - 1); }

  /* Cloak geometry as a pure function of (y, u): left/right edge x and the half width. All motion is periodic in u. */
  function cloakEdges(y, u) {
    var d = clamp((y - YS) / (HEM - YS), 0, 1);
    var hw = 9 + 8 * Math.sqrt(clamp((y - YS) / 9, 0, 1)) + 22 * Math.pow(d, 1.55);
    hw += 3 * Math.exp(-Math.pow((y - 134) / 6, 2));                                   // elbows pushing the cloth out
    var sway = 4.2 * Math.pow(d, 1.25) * Math.sin(TAU * (u - d * .7)) + 1.6 * d * d * Math.sin(TAU * (2 * u - d * 1.3 + .4));
    var bl = 1 + .09 * d * Math.sin(TAU * (2 * u - d * 1.6)), br = 1 + .09 * d * Math.sin(TAU * (2 * u - d * 1.6 + 1.3));
    var fl = d > .25 ? 1.3 * (d - .25) * Math.sin(TAU * (3 * u + y / 6)) : 0;          // edge flutter
    var fr = d > .25 ? 1.3 * (d - .25) * Math.sin(TAU * (3 * u + y / 6 + .45)) : 0;
    return { d: d, xl: Math.round(CXF + sway - hw * bl + fl), xr: Math.round(CXF + sway + hw * br + fr), mid: CXF + sway, hw: hw };
  }
  function hemY(x, u) {
    var rel = (x - CXF) / 40;
    return Math.round(HEM + 2.4 * Math.sin(TAU * (2 * u + x / 16)) + 1.2 * Math.sin(TAU * (3 * u - x / 9 + .2)) - 3 * rel * rel * rel * rel
      + 2.2 * tri(x / 4.6 + .35 * Math.sin(TAU * u)) - 1);
  }
  function cloakCol(x, y, e, u) {
    var xr = (x - e.mid) / (e.hw + .001), d = e.d;
    var v1 = .5 + .5 * Math.sin(xr * TAU * 1.15 + d * 3.2 + Math.sin(TAU * (u - d * .5)) + .9 * Math.sin(TAU * 2 * u + d * 5 + xr * 2));
    var v2 = .5 + .5 * Math.sin(xr * TAU * 2.7 - d * 4 + 1.3 * Math.sin(TAU * (u - d * .8)));
    var v = .62 * v1 + .38 * v2 - d * .1;
    if (y < YS + 8) v += .16 * (1 - (y - YS) / 8);                                    // soft sheen over the shoulders
    return v < .2 ? CL[0] : v < .55 ? CL[1] : v < .82 ? CL[2] : CL[3];
  }

  function drawPerson(c, u, k) {
    var y, x;
    // ground shadow
    ellipse(c, CXF, HEM + 3, 40, 2, '#04050a');
    // cloak body: per row, merge horizontal runs of equal colour
    for (y = YS; y < H; y++) {
      var e = cloakEdges(y, u), run = null, rs = 0, fall = Math.max(0, 1 - (y - YS) / 75);
      var xs = e.xl, xe = e.xr;
      for (x = xs; x <= xe + 1; x++) {
        var col = null;
        if (x <= xe && y <= hemY(x, u) && true) {
          col = cloakCol(x, y, e, u);
          var yb = hemY(x, u);
          if (y === yb) col = mix(CL[2], CL[3], .6);                                    // lit hem edge
          if (x === xe) col = mix(CL[3], '#dff4ff', clamp(k * (.25 + .75 * fall) * 1.0, 0, 1));
          else if (x === xe - 1) col = mix(col, '#9fc8ff', clamp(k * .55 * fall, 0, 1));
          if (x === xs) col = mix(mix(CL[2], '#9a6428', .5 * fall), '#cfe6ff', clamp(k * .45 * fall, 0, 1));
          else if (x === xs + 1) col = mix(col, '#9a6428', .3 * fall);
          if (y === YS) col = mix(CL[2], '#dff4ff', k * .3);
        }
        if (col !== run) {
          if (run) R(c, rs, y, x - rs, 1, run);
          run = col; rs = x;
        }
      }
    }
    // centre back seam hint and a darker layered under-fold that sways a little more than the outer cloth
    for (y = YS + 12; y < HEM - 3; y += 1) {
      var e2 = cloakEdges(y, u), dd = e2.d;
      var fx = Math.round(e2.mid - e2.hw * .18 + 2.2 * Math.sin(TAU * (u - dd * .9 + .25)));
      if (y < hemY(fx, u) - 1) R(c, fx, y, 1, 1, CL[0]);
    }
    drawHead(c, u, k);
    drawHat(c, u, k);
  }

  /* head from behind: short black hair, a sliver of neck, the high collar wrapping it, brim shadow */
  function drawHead(c, u, k) {
    var y, i;
    var HW = { 98: 5, 99: 6, 100: 7, 101: 7, 102: 7, 103: 7, 104: 7, 105: 7, 106: 7, 107: 6, 108: 5 };
    for (y = 98; y <= 108; y++) {
      var hw = HW[y];
      R(c, CXF - hw, y, hw * 2, 1, HAIR);
      for (i = -hw + 1; i < hw - 1; i++) if (((i + y * 3) % 5 + 5) % 5 === 0) R(c, CXF + i, y, 1, 1, '#2a2118');
      R(c, CXF + hw - 1, y, 1, 1, mix(HAIR, '#8fb8ff', k * .6));
      R(c, CXF - hw, y, 1, 1, mix(HAIR, '#9a6428', .5));
    }
    R(c, CXF - 3, 109, 6, 2, mix(SKIN2, '#000000', .35));                               // sliver of neck
    // collar: base, two upswept flaps hugging the head, dark inner fold
    R(c, CXF - 10, 110, 20, 7, CL[1]);
    R(c, CXF - 11, 103, 4, 9, CL[1]); R(c, CXF + 7, 103, 4, 9, CL[1]);
    R(c, CXF - 7, 111, 14, 5, CL[0]); R(c, CXF - 10, 110, 20, 1, CL[2]);
    R(c, CXF - 11, 103, 4, 1, CL[2]); R(c, CXF + 7, 103, 4, 1, CL[2]);
    R(c, CXF + 10, 103, 1, 14, mix(CL[3], '#dff4ff', k * .85));
    R(c, CXF - 11, 103, 1, 14, mix(CL[2], '#9a6428', .5));
    // brim shadow falls over the nape and collar
    R(c, CXF - 12, 105, 24, 2, 'rgba(0,0,0,.6)'); R(c, CXF - 11, 107, 22, 2, 'rgba(0,0,0,.45)'); R(c, CXF - 10, 109, 20, 3, 'rgba(0,0,0,.28)');
  }

  /* classic straw hat seen from behind and a little above: wide drooping brim, low dome crown, red ribbon with knot */
  var STRAW = ['#f8e6a6', '#edcb70', '#d7ad52', '#a98039'];
  function strawIdx(s, wv) { var i = s < .26 ? 0 : s < .5 ? 1 : s < .74 ? 2 : 3; return Math.min(3, i + (wv ? 1 : 0)); }
  function drawHat(c, u, k) {
    var hcx = CXF + Math.round(.9 * Math.sin(TAU * (u - .12))), BY = 96, BRX = 27, BRY = 7, TL = 1.9 + .8 * Math.sin(TAU * (u - .3));
    function off(rel) { return TL * rel + 2.6 * rel * rel + .9 * Math.sin(rel * 5 + .6); }
    var x, y, rel, hh, oy, top, bot, col, dy, r, s, wv, ring, th;
    // ---- brim ----
    for (x = -BRX; x <= BRX; x++) {
      rel = x / BRX; oy = BY + off(rel); hh = Math.max(.9, BRY * Math.sqrt(Math.max(0, 1 - rel * rel)));
      top = Math.round(oy - hh); bot = Math.round(oy + hh);
      for (y = top; y <= bot; y++) {
        dy = (y - oy) / hh; r = Math.sqrt(rel * rel + dy * dy * (1 - rel * rel * .6)); ring = Math.floor(r * 15);
        wv = ((x + y) & 1) ^ (ring & 1);
        s = .4 - dy * .3 + rel * .1 + .15 * Math.abs(rel);
        col = STRAW[strawIdx(s, wv && r > .3)];
        if (y === top) col = STRAW[0];
        if (x === -BRX || x === BRX) col = STRAW[1];
        if (rel > .55 && (y === top || x === BRX)) col = mix(col, '#dff4ff', k * .85);
        if (rel < -.55 && (y === top || x === -BRX)) col = mix(col, '#f0b460', .65);
        R(c, hcx + x, y, 1, 1, col);
      }
      th = Math.abs(rel) < .8 ? 2 : 1;                                                 // brim thickness / underside, darker
      for (y = 1; y <= th; y++) R(c, hcx + x, bot + y, 1, 1, mix(y === 1 ? STRAW[3] : '#6e4e26', '#bfe4ff', rel > .3 ? k * .45 : 0));
    }
    // loose straw strands at the brim edge
    [[-29, -1], [-28, 3], [28, 0], [29, 2], [-12, 8], [15, 8], [4, 9]].forEach(function (p, i) {
      var rl = clamp(p[0] / BRX, -1, 1), by = Math.round(BY + off(rl)) + (Math.abs(p[0]) > BRX ? p[1] : p[1] + 2);
      R(c, hcx + p[0], by, 1, 1, i % 2 ? STRAW[2] : STRAW[1]);
      if (Math.abs(p[0]) > BRX) R(c, hcx + p[0] + (p[0] > 0 ? 1 : -1), by + 1, 1, 1, STRAW[3]);
    });
    // ---- crown (low dome, about half as tall as wide) ----
    var CBY = 95, CRX = 12, CH = 13, tops = [], fr, fy;
    for (x = -CRX; x <= CRX; x++) {
      rel = x / CRX;
      top = CBY - Math.round(CH * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(rel), 2.6)))) + Math.round(TL * rel * .35);
      fr = CBY + Math.round(3.2 * Math.sqrt(1 - rel * rel)) + Math.round(TL * rel * .35);
      fy = fr;
      for (y = top; y <= fr; y++) {
        s = .22 + (y - top) / (CH + 3) * .42 + rel * .26 + (rel > 0 ? (rel - .5) * .2 : 0);
        wv = ((x + (y >> 1)) & 1);
        col = STRAW[strawIdx(s, wv && s > .3)];
        if (y <= top + 1 && Math.abs(rel) < .75) col = STRAW[0];
        var ribbon = y >= fr - 5;
        if (ribbon) {                                                             // red ribbon ribbon
          var bi = fr - y;
          col = bi >= 4 ? '#ee4a40' : bi >= 2 ? '#d02a2e' : '#a01c25';
        }
        if (rel > .72) col = mix(col, ribbon ? '#ff9a90' : '#dff4ff', ribbon ? k * .45 : k * .8);
        if (rel < -.72) col = mix(col, ribbon ? '#ff7a50' : '#f0b460', .4);
        if (y === top && rel > .3) col = mix(col, '#dff4ff', k * .7);
        R(c, hcx + x, y, 1, 1, col);
      }
      R(c, hcx + x, fr + 1, 1, 1, 'rgba(70,40,10,.6)'); R(c, hcx + x, fr + 2, 1, 1, 'rgba(70,40,10,.3)');
    }
  }

  /* ---------- dynamic: weld light (the arc itself is hidden behind the welder), sparks, smoke ---------- */
  function drawArc(c, t, u, fi, k) {
    var ax = ARC.x, ay = ARC.y, j, x;
    // light spilling around the silhouette: additive glow, rays, bench and plate lit from behind
    c.save(); c.globalCompositeOperation = 'lighter';
    c.globalAlpha = .35 + .65 * k; c.drawImage(arcGlow, 0, 0);
    for (j = 0; j < 6; j++) {
      var ang = -Math.PI / 2 + (rnd(Math.floor(fi / 2) * 7 + j * 3.3) - .5) * 3.3, ln = 26 + rnd(j + Math.floor(fi / 2) * 11) * 46;
      line(c, ax, ay, Math.round(ax + Math.cos(ang) * ln), Math.round(ay + Math.sin(ang) * ln), 1, 'rgba(150,200,255,' + (.1 + .17 * k) + ')');
    }
    c.globalAlpha = k; ellipse(c, ax, 118, 54, 5, 'rgba(110,160,255,.2)'); ellipse(c, ax, 112, 30, 2, 'rgba(160,210,255,.22)');
    c.restore();
    for (x = ax - 50; x <= ax + 50; x++) R(c, x, 110, 1, 1, 'rgba(210,235,255,' + (.65 * k * Math.max(0, 1 - Math.abs(x - ax) / 50)) + ')');
    // hidden arc core (the welder's body covers it; only the spill above is seen)
    R(c, ax - 2, ay - 2, 5, 5, 'rgba(190,225,255,.9)'); R(c, ax - 1, ay - 1, 3, 3, '#ffffff');
    // sparks: pure functions of (t, index) so the loop is seamless; drawn behind the welder, so only those that clear his silhouette show
    var NS = 96;
    for (j = 0; j < NS; j++) {
      var born = j / NS * LOOP + .02 * rnd(j + 3), age = (((t - born) % LOOP) + LOOP) % LOOP, life = .4 + .5 * rnd(j + 11);
      if (age > life) continue;
      var an2 = -Math.PI / 2 + (rnd(j + 5) - .5) * 3.0, sp = 50 + rnd(j + 9) * 95, vx = Math.cos(an2) * sp, vy = Math.sin(an2) * sp;
      var px = ax + vx * age, py = ay + vy * age + .5 * 200 * age * age;
      if (py > 111) py = 111 - (py - 111) * .4;                                            // bounce on the plate
      var f = age / life, col = f < .22 ? '#ffffff' : f < .5 ? '#fff0b0' : f < .78 ? '#ffa23a' : '#c8501e';
      R(c, Math.round(px), Math.round(py), f < .3 ? 2 : 1, 1, col);
      if (f < .7) { var pp = ax + vx * (age - .035), pq = ay + vy * (age - .035) + .5 * 200 * (age - .035) * (age - .035); if (pq > 111) pq = 111 - (pq - 111) * .4; R(c, Math.round(pp), Math.round(pq), 1, 1, f < .4 ? '#ffd890' : '#c06a2a'); }
      if (rnd(j + 21) > .8 && f < .5) R(c, Math.round(px) + 1, Math.round(py), 1, 1, col);
    }
    // smoke wisps rising either side of the hat
    for (var s = 0; s < 5; s++) {
      var p = (u * 2 + s * .2) % 1, side = (s % 2 ? 1 : -1), sx = ax + side * (12 + 5 * p) + 5 * Math.sin(TAU * (p * 1.4 + s * .3)), sy = ay - 4 - 56 * p;
      var a = .3 * Math.sin(Math.PI * Math.min(1, p * 1.15)) * (1 - p * .6);
      R(c, Math.round(sx), Math.round(sy), 2, 2, 'rgba(190,200,235,' + a + ')');
      R(c, Math.round(sx) + 2, Math.round(sy) + 3, 1, 1, 'rgba(190,200,235,' + a * .7 + ')');
    }
  }

  /* ---------- frame ---------- */
  function render(t) {
    var u = (((t % LOOP) + LOOP) % LOOP) / LOOP, fi = Math.floor(u * 60);       // fi: 25 fps flicker clock
    var fl = rnd(fi * 1.37 + 3), k = rnd(fi + 77) > .86 ? .3 : .62 + .38 * fl;   // weld brightness 0..1
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(back.canvas, 0, 0);
    drawCity(ctx, u, fi);
    ctx.drawImage(front.canvas, 0, 0);
    for (var x = 241; x < 265; x++) R(ctx, x, 113 + Math.round(4 * Math.sin(x * .5 + u * TAU * 2)), 1, 1, '#5ee1ff');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .8 + .2 * Math.sin(u * TAU);
    ctx.drawImage(panelGlow, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    drawPanel(ctx, u); drawTraces(ctx, u);
    drawArc(ctx, u * LOOP, u, fi, k);
    drawPerson(ctx, u, k);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .1 * k; ctx.drawImage(arcGlow, 0, 0); ctx.restore();   // faint bloom over the silhouette
    for (var s = 0; s < 3; s++) {                                                // mug steam: three wavy wisps, periodic in the loop
      for (var j = 1; j < 30; j++) {
        var fa = Math.sin(Math.PI * j / 30), wx = 215 + s * 4.5 + .13 * j * (1 + s * .15) + (1.2 + 2 * j / 30) * Math.sin(TAU * (j / (17 + 2 * s) - u + s * .33));
        ctx.fillStyle = 'rgba(232,240,255,' + (.58 * fa) + ')'; ctx.fillRect(Math.round(wx), 128 - j, 2, 1);
        ctx.fillStyle = 'rgba(200,215,245,' + (.3 * fa) + ')'; ctx.fillRect(Math.round(wx) - 1, 128 - j, 1, 1);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .9 + .06 * Math.sin(u * TAU * 22) + .04 * Math.sin(u * TAU * 5);
    ctx.drawImage(lampGlow, 0, 0);
    ctx.globalAlpha = 1;
    for (var i = 0; i < motes.length; i++) {
      var o = motes[i], q = u * TAU * o.k + o.ph;
      var px = o.x + o.ax * Math.sin(q), py = o.y + o.ay * Math.cos(q * 1.0);
      var al = .25 + .35 * (Math.sin(u * TAU * 2 + o.ph) * .5 + .5);
      ctx.fillStyle = o.warm ? 'rgba(255,200,120,' + al + ')' : 'rgba(120,220,255,' + al + ')';
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(scan, 0, 0);
  }
  window.PortfolioScene = { render: render, canvas: cv, W: W, H: H, LOOP: LOOP };

  /* ---------- integer-scale fit (every art pixel = a whole number of device pixels) ---------- */
  var av = document.getElementById('avatar'), actx = null;
  if (av && av.tagName !== 'CANVAS' && window.AvatarArt) {      // swap the static GIF for the live canvas
    var cvA = document.createElement('canvas');
    cvA.width = cvA.height = AvatarArt.W; cvA.id = 'avatar'; cvA.className = av.className;
    cvA.setAttribute('role', 'img'); cvA.setAttribute('aria-label', av.getAttribute('alt') || '');
    av.parentNode.replaceChild(cvA, av); av = cvA;
  }
  if (av && av.getContext) actx = av.getContext('2d');
  function fitScene() {
    var dpr = window.devicePixelRatio || 1, vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.max(1, Math.ceil(Math.max(vw * dpr / W, vh * dpr / H) - 1e-6));   // smallest whole scale that covers
    var pw = W * s, ph = H * s;                                                    // device pixels
    var focus = vw < vh ? 174 : W / 2;                                        // portrait: keep the welder and the arc in view
    var left = Math.max(Math.min(0, Math.floor(vw * dpr - pw)), Math.min(0, Math.floor(vw * dpr / 2 - focus * s))), top = Math.round(vh * dpr - ph);
    cv.style.width = (pw / dpr) + 'px'; cv.style.height = (ph / dpr) + 'px';
    cv.style.left = (left / dpr) + 'px'; cv.style.top = (top / dpr) + 'px';
    if (av && window.AvatarArt) {   // avatar: CSS size such that size*dpr is a whole multiple of the 64-px grid
      var want = (vw <= 720 ? 104 : 168) * dpr, n = Math.max(1, Math.round(want / AvatarArt.W));
      av.style.width = av.style.height = (AvatarArt.W * n / dpr) + 'px';
    }
  }
  fitScene();
  window.addEventListener('resize', fitScene);
  (function watchDpr() {                      // fires when the page moves to a screen with another pixel ratio / zoom changes
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    var h = function () { fitScene(); watchDpr(); };
    if (mq.addEventListener) mq.addEventListener('change', h, { once: true }); else if (mq.addListener) mq.addListener(h);
  })();

  function fillA(x, y, w, h, col) { actx.fillStyle = col; actx.fillRect(x, y, w, h); }
  function drawAvatar(i) { if (actx) window.AvatarArt.draw(fillA, i); }

  /* ---------- loop: pauses when hidden, still frame for reduced motion ---------- */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var T = 0, last = 0, raf = 0, avT = 0, avI = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (ts - last < 1000 / 24) return;
    var dt = Math.min((ts - last) / 1000, .1); last = ts;
    T += dt; render(T);
    avT += dt;
    if (actx && avT >= AvatarArt.DELAY / 1000) { avT = 0; avI = (avI + 1) % AvatarArt.FRAMES; drawAvatar(avI); }
  }
  function start() { if (!raf && !(reduce && reduce.matches) && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  var still = /[?&]t=([\d.]+)/.exec(location.search);
  render(still ? parseFloat(still[1]) : 0.84); drawAvatar(still ? 3 : 5);       // first frame at once (also the reduced-motion still)
  if (!still) {
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    if (reduce && reduce.addEventListener) reduce.addEventListener('change', function () { reduce.matches ? stop() : start(); });
    start();
  }
})();
