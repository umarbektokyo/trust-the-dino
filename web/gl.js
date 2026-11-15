// Tiny WebGL1 helpers: one triangle covering the canvas, one fragment shader, a few uniforms.
// Everything that uses them keeps a plain fallback, so no WebGL simply means no effects.
//
//   const gl = context(canvas);
//   const fx = quad(gl, `uniform vec3 u_c; void main() { gl_FragColor = vec4(u_c, 1.); }`);
//   fx.set("u_c", 1, .5, 0); fx.draw();

const VERT = "attribute vec2 a; void main() { gl_Position = vec4(a, 0., 1.); }";
const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
// 4x4 ordered dither, 0..1: the threshold that turns a fade into pixel-art speckle
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2. + a.y * a.y * .75); }
float bayer4(vec2 a) { return bayer2(.5 * a) * .25 + bayer2(a); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

export function context(canvas, opts = {}) {
  try {
    return canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, ...opts });
  } catch { return null; }
}

export function quad(gl, frag) {
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, HEAD + frag));
  gl.bindAttribLocation(p, 0, "a");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const locs = {};
  const loc = (name) => (name in locs ? locs[name] : (locs[name] = gl.getUniformLocation(p, name)));
  const textures = [];
  return {
    set(name, ...v) { const l = loc(name); if (l) gl[`uniform${v.length}f`](l, ...v); },
    // source: an <img>/<canvas>, or { width, height, data: Uint8Array RGBA }. Nearest, clamped: pixels stay pixels.
    texture(unit, name, source) {
      const t = textures[unit] || (textures[unit] = gl.createTexture());
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (source.data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      const l = loc(name);
      if (l) gl.uniform1i(l, unit);
    },
    draw() {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

// "#ff5a1f" or "rgb(255, 90, 31)" -> [1, .35, .12]
export function rgb(css) {
  const s = css.trim();
  if (s.startsWith("#")) {
    const h = s.length === 4 ? [...s.slice(1)].map((c) => c + c).join("") : s.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  return (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map((n) => +n / 255);
}
