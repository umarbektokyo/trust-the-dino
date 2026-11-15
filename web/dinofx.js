// The dino drawn by a shader instead of SVG rects, so it can have light and weather:
//   - texture: a 1px rim light on every top edge, a dithered shade on the ink and a faint scanline per pixel row;
//   - sky: while it stargazes, a dusk sky dissolves in behind it, with twinkling stars;
//   - heat: while something waits on you (orange spines), orange heat rises off it.
// The SVG stays in the DOM (hidden) for layout and as the fallback when WebGL is missing or lost.
//
//   const fx = dinoFx(button, cell);   // null without WebGL
//   fx.draw(grid, { sky: 0..1, heat: 0..1, t: seconds });

import { context, quad, rgb } from "./gl.js";

const MARGIN = 6;  // extra cells left and right of the sprite, for the sky
const ROWS = 24;   // canvas height in cells; the sprite sits on its bottom row
const CODES = { o: 1, k: 1, p: 2, g: 2, e: 3, w: 3, "!": 4 };

const FRAG = `
uniform sampler2D u_grid;
uniform vec2 u_size;       // sprite cols, rows
uniform vec2 u_canvas;     // canvas cols, rows
uniform float u_cell, u_dpr, u_t, u_sky, u_heat;
uniform vec3 u_ink, u_plate, u_eye, u_hot, u_paper;

// what the sprite has at a cell (x right, y up from the ground row): 0 empty, 1 ink, 2 plate, 3 eye, 4 hot
float grid(vec2 c) {
  if (c.x < 0. || c.y < 0. || c.x >= u_size.x || c.y >= u_size.y) return 0.;
  vec4 v = texture2D(u_grid, vec2((c.x + .5) / u_size.x, (u_size.y - c.y - .5) / u_size.y));
  return floor(v.r * 255. / 50. + .5);
}
float occ(vec2 c) { return grid(c) > 0. ? 1. : 0.; }

vec3 skyColor(float h, vec2 cell) {
  // four dusk bands, dithered into each other: peach at the horizon, night at the top
  float b = clamp(floor(h * 3.4 + (bayer4(cell) - .5) * .9 + .5), 0., 3.);
  if (b < .5) return vec3(.96, .66, .52);
  if (b < 1.5) return vec3(.70, .45, .52);
  if (b < 2.5) return vec3(.33, .33, .50);
  return vec3(.16, .17, .28);
}

void main() {
  vec2 px = floor(gl_FragCoord.xy / u_dpr);   // css px from the bottom-left
  vec2 cell = floor(px / u_cell);
  vec2 sub = mod(px, u_cell);
  vec2 sc = cell - vec2(floor((u_canvas.x - u_size.x) / 2.), 0.);  // sprite cell
  float id = grid(sc);
  vec4 col = vec4(0.);

  // sky: a dome on the ground behind the dino that dissolves in through the dither
  if (u_sky > 0.) {
    vec2 d = (sc - vec2(u_size.x / 2., 0.)) / vec2(u_size.x / 2. + 4., u_canvas.y - 2.);
    float m = 1. - length(d);
    if (m > 0. && smoothstep(0., .3, m) * u_sky > bayer4(cell)) {
      float h = clamp(sc.y / (u_canvas.y - 2.), 0., 1.);
      vec3 c = skyColor(h, cell);
      float r = hash(cell);
      if (h > .38 && r > .955) {
        float tw = .5 + .5 * sin(u_t * (1.5 + 3. * hash(cell + 7.)) + r * 40.);
        if (tw > .3) c = mix(c, u_paper, tw);
      }
      col = vec4(c, 1.);
    }
  }

  // heat: rises off the top of the body, wobbling, pulsing slowly
  if (u_heat > 0. && id == 0.) {
    float h = 0.;
    for (int k = 1; k <= 5; k++) {
      float fk = float(k);
      float wob = floor(sin(u_t * 3. + sc.y * .9 + fk * 1.7) * 1.1 + .5);
      h += occ(sc - vec2(wob, fk)) * (1. - fk / 6.);
    }
    float rise = hash(vec2(sc.x, floor(sc.y - u_t * 5.)));
    float pulse = .6 + .4 * sin(u_t * 2.4);
    float a = clamp(h * .5, 0., 1.) * pulse * u_heat;
    if (a > .25 + .75 * max(bayer4(cell), rise)) col = vec4(mix(u_hot, col.rgb, col.a * .2), 1.);
  }

  // the dino itself
  if (id > 0.) {
    vec3 c = id < 1.5 ? u_ink : id < 2.5 ? u_plate : id < 3.5 ? u_eye : u_hot;
    if (id < 1.5) {
      // dithered light from above, so the ink isn't a flat cutout
      if (bayer4(px) < .22 * clamp(sc.y / u_size.y, 0., 1.)) c = mix(c, u_plate, .3);
      // rim light on edges that face the sky; warmer against the dusk
      if (occ(sc + vec2(0., 1.)) == 0. && sub.y == u_cell - 1.)
        c = mix(c, mix(u_plate, vec3(1., .78, .62), u_sky), .6);
    }
    if (sub.y == 0.) c *= .86;  // one darker row of real pixels per sprite pixel: a faint scanline
    col = vec4(c, 1.);
  }

  gl_FragColor = vec4(col.rgb * col.a, col.a);
}`;

export function dinoFx(button, cell) {
  const canvas = document.createElement("canvas");
  canvas.className = "peek-gl";
  canvas.setAttribute("aria-hidden", "true");
  const gl = context(canvas);
  if (!gl) return null;
  let fx;
  try { fx = quad(gl, FRAG); } catch (e) { console.warn("dino shader:", e.message); return null; }

  const recolor = () => { // from the CSS variables, so day and night both come from creature.css
    const css = getComputedStyle(button);
    const color = (v, fb) => rgb(css.getPropertyValue(v) || fb);
    fx.set("u_ink", ...color("--peek-ink", "#141414"));
    fx.set("u_plate", ...color("--peek-plate", "#9a998f"));
    fx.set("u_eye", ...color("--peek-eye", "#fbfbf8"));
    fx.set("u_hot", ...color("--peek-hot", "#ff5a1f"));
  };
  recolor();
  fx.set("u_paper", ...rgb("#fbfbf8"));
  fx.set("u_cell", cell);

  let lost = false, cols = 0;
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; button.classList.remove("gl"); });
  button.append(canvas);
  button.classList.add("gl");

  return {
    recolor,
    draw(g, { sky = 0, heat = 0, t = 0 } = {}) {
      if (lost) return false;
      const w = g[0].length, h = g.length;
      if (w !== cols) { // the sprite is always 34 wide, but don't assume it
        cols = w;
        const cw = w + 2 * MARGIN, dpr = devicePixelRatio || 1;
        canvas.width = Math.round(cw * cell * dpr);
        canvas.height = Math.round(ROWS * cell * dpr);
        canvas.style.width = cw * cell + "px";
        canvas.style.height = ROWS * cell + "px";
        canvas.style.left = -MARGIN * cell + "px";
        fx.set("u_canvas", cw, ROWS);
        fx.set("u_dpr", dpr);
      }
      const data = new Uint8Array(w * h * 4);
      g.forEach((row, y) => row.forEach((c, x) => { data[(y * w + x) * 4] = (CODES[c] || 0) * 50; data[(y * w + x) * 4 + 3] = 255; }));
      fx.texture(0, "u_grid", { width: w, height: h, data });
      fx.set("u_size", w, h);
      fx.set("u_t", t);
      fx.set("u_sky", sky);
      fx.set("u_heat", heat);
      fx.draw();
      return true;
    },
  };
}
