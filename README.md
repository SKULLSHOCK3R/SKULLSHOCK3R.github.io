# SKULLSHOCK3R.github.io

A personal site built with plain HTML and no trackers, cookies or external requests. It also hosts the privacy policy for a private home-automation app.

## Homepage (index.html)

One fullscreen three.js scene on a scroll-driven timeline (three.js 0.186.1, vendored in `assets/vendor/three`, loaded through an import map; no CDN). Modules in `assets/`:

| File | Role |
| --- | --- |
| `app.js` | Timeline, snap points (opening, globe, parted globe, cores, ending), post-processing values, HUD placement, click sheets, carousel, the loop back to the top, static fallback. |
| `opening.js` | Storm sky, rain, lightning, fog, Luffy and Imu (rendered video loops with their stills, `assets/figures/`, placed by `figures.js`), the wet rock under Luffy, the plate slot. |
| `globe.js`, `world.js` | The world as instanced baked blocks (`assets/models/block.glb`) tinted from our own map; parting and the collapse into the cores. |
| `cores.js` | The two filament cores (J.A.R.V.I.S. gold, E.V. purple) as GPU lines. |
| `ringgate.js` | The ring gate: three stone rings that grow out of J.A.R.V.I.S.'s core and sweep past the camera into the chamber. |
| `figures.js` | Luffy and Imu: their video loops and stills (HD on phones, 4K on large screens), frames, hover point and Imu's eyes. |
| `ending.js`, `shapes.js` | The chamber: baked pedestal (`assets/models/pedestal.glb`), rings, light cone, and the grain sculptures (Luffy from `assets/luffy-mask.png`, Jolly Roger, envelope) with a GPGPU push-and-spring simulation. |
| `post.js`, `glsl.js` | Bloom, output, and the grade pass (chromatic smear, grain, vignette, whiteout); shared GLSL noise. |
| `storm.css` | Document layout by default (no JS, no WebGL2, reduced motion) and the fixed-layer layout under `html.gl`. |
| `sound.js` | Optional sound, synthesised in the browser (no audio files): a generative soft-piano score with quiet rain, thunder, the globe's breath, the cores, the ring gate and the chamber. Off until the Sound switch is pressed; the choice is remembered in this browser (`localStorage`, no cookie) and resumes at the next visit's first click or key press. |

Plate slot: drop a photoreal still or clip at `assets/plates/hero.jpg` or `assets/plates/hero.mp4` and name it in `index.html` (`<meta name="hero-plate" content="assets/plates/hero.mp4">`); the opening uses it under the rain, lightning and fog.

Test switches (query string, for screenshots only): `?t=<page>` jumps the timeline (0 to 4), `&still` freezes scroll effects, `&shape=1|2` starts the ending on the Jolly Roger or the envelope, `?static=1` forces the plain page, `?pany=-2` holds the opening view low (to check Luffy's feet on the rock).

The two other pages: `privacy.html` (the H.I.V.E. privacy policy, its own inline styles) and `404.html` (the earlier `site.css` and `scene.js`).
