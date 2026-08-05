"use client";

import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

// synthwave floor grid + aurora orb, cyan/violet — the DEGENFIRM horizon
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 m = (u_mouse - 0.5) * vec2(0.14, 0.06);

  vec3 col = vec3(0.012, 0.016, 0.034);

  float horizon = 0.42 + m.y;

  // ── sky ──
  if (uv.y > horizon) {
    float sky = (uv.y - horizon) / (1.0 - horizon);
    col = mix(vec3(0.05, 0.09, 0.16), vec3(0.012, 0.016, 0.034), smoothstep(0.0, 0.75, sky));

    // pin-point stars, twinkling
    vec2 sp = uv * vec2(aspect, 1.0) * 90.0;
    vec2 cell = floor(sp);
    vec2 f = fract(sp) - 0.5;
    float star = step(0.994, hash(cell)) * smoothstep(0.16, 0.02, length(f));
    float tw = 0.5 + 0.5 * sin(u_time * (1.5 + hash(cell + 7.0) * 3.0) + hash(cell) * 40.0);
    col += star * tw * vec3(0.5, 0.75, 0.9) * smoothstep(0.05, 0.6, sky);
  }

  // ── sun glow sitting on the horizon ──
  vec2 op = vec2(0.5 + m.x, horizon);
  vec2 d = (uv - op) * vec2(aspect, 1.0);
  float r = length(d);
  vec3 orbCol = mix(vec3(0.13, 0.83, 0.93), vec3(0.65, 0.55, 0.98), 0.5 + 0.5 * sin(u_time * 0.35));
  col += exp(-r * 7.0) * orbCol * 0.5;
  col += exp(-r * 2.2) * orbCol * 0.1;

  // horizon glow line
  col += exp(-abs(uv.y - horizon) * 70.0) * vec3(0.13, 0.83, 0.93) * 0.55;

  // ── perspective floor grid ──
  if (uv.y < horizon) {
    float depth = max(horizon - uv.y, 0.004);
    float wz = 1.0 / depth + u_time * 1.4;
    float wx = (uv.x - 0.5 - m.x * 0.6) * aspect / depth;

    // constant world-space line width — perspective thins it toward the horizon
    float lx = abs(fract(wx) - 0.5);
    float lz = abs(fract(wz) - 0.5);
    float w = 0.045;
    float gx = 1.0 - smoothstep(w * 0.3, w, lx);
    float gz = 1.0 - smoothstep(w * 0.3, w, lz);
    float grid = max(gx, gz);

    float fog = exp(-(1.0 / depth - 2.3) * 0.14);
    vec3 gridCol = mix(vec3(0.65, 0.55, 0.98), vec3(0.13, 0.83, 0.93), clamp(fog, 0.0, 1.0));
    col += grid * gridCol * clamp(fog, 0.0, 1.0) * 0.8;

    // soft cyan sheen under the sun
    col += exp(-abs(uv.x - 0.5 - m.x) * 4.0) * clamp(fog, 0.0, 1.0) * vec3(0.06, 0.2, 0.28) * 0.3;
  }

  // vignette
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.9;

  // film grain
  col += (hash(uv * u_time) - 0.5) * 0.025;

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // alpha:true — if anything fails the canvas stays transparent and the CSS
    // fallback shows through, instead of compositing as an opaque white sheet
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
    if (!gl || gl.isContextLost()) return; // CSS gradient fallback stays visible

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("hero shader fallback:", gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");

    let mx = 0.5;
    let my = 0.5;
    let tmx = 0.5;
    let tmy = 0.5;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tmx = (e.clientX - r.left) / r.width;
      tmy = 1 - (e.clientY - r.top) / r.height;
    };
    window.addEventListener("pointermove", onMove);

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    let raf = 0;
    const t0 = performance.now();
    const frame = () => {
      resize();
      // ease the parallax
      mx += (tmx - mx) * 0.04;
      my += (tmy - my) * 0.04;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - t0) / 1000);
      gl.uniform2f(uMouse, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      // never loseContext() here — React StrictMode remounts the effect in dev,
      // and getContext() would then hand back a dead context (blank white canvas)
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full"
      style={{
        background:
          "radial-gradient(700px 400px at 50% 45%, rgba(34,211,238,0.12), transparent 65%), #05060b",
      }}
      aria-hidden
    />
  );
}
