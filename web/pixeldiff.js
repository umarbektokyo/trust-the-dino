// "changes": the after screenshot, faded, with every pixel that differs from before in orange and a soft
// halo around it, so a one-pixel change is still findable. One shared WebGL canvas renders it and the
// result is copied into a plain 2D canvas per scene, so many scenes never cost more than one context.
//
//   const canvas = await pixelDiff(beforeImg, afterImg);   // null without WebGL

import { context, quad, rgb } from "./gl.js";

const FRAG = `
uniform sampler2D u_before, u_after;
uniform vec2 u_size, u_bsize;      // after and before, in image pixels
uniform vec3 u_hot, u_paper;

float diff(vec2 p) {               // p: after pixel, y down
  if (p.x < 0. || p.y < 0. || p.x >= u_size.x || p.y >= u_size.y) return 0.;  // halo taps off the image
  vec3 a = texture2D(u_after, (p + .5) / u_size).rgb;
  if (p.x >= u_bsize.x || p.y >= u_bsize.y) return 1.;   // no before here: all of it is new
  vec3 b = texture2D(u_before, (p + .5) / u_bsize).rgb;
  vec3 d = abs(a - b);
  return step(.04, max(d.r, max(d.g, d.b)));             // ignore anti-aliasing noise
}

void main() {
  vec2 p = vec2(gl_FragCoord.x - .5, u_size.y - gl_FragCoord.y + .5);
  vec3 a = texture2D(u_after, (p + .5) / u_size).rgb;
  float lum = dot(a, vec3(.299, .587, .114));
  vec3 base = mix(vec3(lum), u_paper, .7);                // the unchanged page steps back

  if (diff(p) > 0.) { gl_FragColor = vec4(mix(u_hot, a, .25), 1.); return; }

  // halo: how much changed nearby, sampled on a sparse ring so small changes glow and big ones don't flood
  float near = 0.;
  for (int i = 0; i < 16; i++) {
    float ang = float(i) * .3927;
    near += diff(p + vec2(cos(ang), sin(ang)) * 6.) + diff(p + vec2(cos(ang), sin(ang)) * 12.) * .5;
  }
  gl_FragColor = vec4(mix(base, u_hot, clamp(near / 10., 0., .45)), 1.);
}`;

let shared = null; // { canvas, gl, fx } or false when WebGL is unavailable

function setup() {
  if (shared !== null) return shared;
  const canvas = document.createElement("canvas");
  const gl = context(canvas, { preserveDrawingBuffer: true });
  try {
    const fx = gl && quad(gl, FRAG);
    const css = getComputedStyle(document.documentElement);
    fx.set("u_hot", ...rgb(css.getPropertyValue("--hot") || "#ff5a1f"));
    fx.set("u_paper", ...rgb(css.getPropertyValue("--paper") || "#fbfbf8"));
    shared = { canvas, gl, fx };
  } catch { shared = false; }
  return shared;
}

export const canDiff = () => Boolean(setup());

export async function pixelDiff(before, after) {
  const s = setup();
  if (!s) return null;
  await Promise.all([before.decode(), after.decode()]).catch(() => {});
  if (!before.naturalWidth || !after.naturalWidth) return null;
  const { canvas, gl, fx } = s;
  canvas.width = after.naturalWidth;
  canvas.height = after.naturalHeight;
  fx.texture(0, "u_before", before);
  fx.texture(1, "u_after", after);
  fx.set("u_size", after.naturalWidth, after.naturalHeight);
  fx.set("u_bsize", before.naturalWidth, before.naturalHeight);
  fx.draw();
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  out.getContext("2d").drawImage(canvas, 0, 0);
  return gl.isContextLost() ? null : out;
}
