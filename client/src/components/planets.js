// Procedural planet surfaces and a lightweight orthographic sphere renderer.
// Textures are equirectangular maps that tile seamlessly in longitude; each frame only
// shifts longitude and re-samples, so a rotating 3D sphere costs one lookup per pixel.

const TEX_W = 512, TEX_H = 256;

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Value noise that wraps every `px` lattice cells in x, so the texture tiles around the globe.
function makeNoise(seed) {
  const rnd = mulberry(seed);
  const perm = new Uint16Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const lat = (x, y) => vals[perm[(perm[x & 255] + y) & 511]];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y, px) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
    const u = fade(xf), v = fade(yf);
    const a = lat(x0, yi), b = lat(x1, yi), c = lat(x0, yi + 1), d = lat(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(noise, u, v, { base = 4, oct = 5, gain = 0.5, sy = 1 } = {}) {
  let amp = 0.5, sum = 0, norm = 0, f = base;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise(u * f, v * f * sy, f);
    norm += amp; amp *= gain; f *= 2;
  }
  return sum / norm;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function ramp(stops) {
  const s = stops.map(([t, c]) => [t, hex(c)]);
  return (t) => {
    t = Math.max(0, Math.min(1, t));
    let i = 0;
    while (i < s.length - 2 && t > s[i + 1][0]) i++;
    const [t0, c0] = s[i], [t1, c1] = s[i + 1];
    const k = (t - t0) / (t1 - t0 || 1);
    return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
  };
}

const TONES = {
  sapphire: { seed: 11, atmo: [110, 150, 255], rim: 0.55,
    pal: ramp([[0, '#0a1650'], [0.35, '#1d3aa8'], [0.62, '#3a64e0'], [0.85, '#7fa2ff'], [1, '#c9d8ff']]),
    f: (n, u, v) => { const w = fbm(n, u, v, { base: 3, oct: 4 }); const bands = 0.5 + 0.3 * Math.sin(v * Math.PI * 9 + w * 5); const storm = Math.exp(-(((u - 0.62) * 9) ** 2 + ((v - 0.6) * 18) ** 2)); return bands * 0.8 + fbm(n, u + 3.1, v, { base: 8, oct: 3, sy: 0.25 }) * 0.25 - storm * 0.45; } },
  amber: { seed: 23, atmo: [255, 220, 170], rim: 0.18,
    pal: ramp([[0, '#6e4a30'], [0.3, '#a07a5a'], [0.55, '#cdb08c'], [0.78, '#e6d5b8'], [1, '#f4ead8']]),
    f: (n, u, v) => { const w = fbm(n, u, v, { base: 5, oct: 6, sy: 0.35 }); const b = 0.55 + 0.2 * Math.sin(v * Math.PI * 22 + w * 2.6) + 0.12 * Math.sin(v * Math.PI * 7 + 1.3); const eddy = fbm(n, u + 9, v, { base: 14, oct: 3, sy: 0.4 }); return b + (w - 0.5) * 0.3 + (eddy - 0.5) * 0.12; },
    spot: (u, v) => Math.exp(-(((u - 0.35) * 14) ** 2 + ((v - 0.64) * 24) ** 2)), spotCol: [176, 84, 48] },
  pearl: { seed: 37, atmo: [240, 232, 220], rim: 0, craters: true,
    pal: ramp([[0, '#2e2b28'], [0.35, '#6a655e'], [0.6, '#9e978d'], [0.85, '#c9c2b6'], [1, '#e6e0d6']]),
    f: (n, u, v) => { const maria = fbm(n, u, v, { base: 2, oct: 3 }); const fine = fbm(n, u + 7, v, { base: 16, oct: 4 }); return 0.62 + fine * 0.35 - Math.max(0, maria - 0.52) * 1.6; } },
  garnet: { seed: 53, atmo: [255, 150, 120], rim: 0.2,
    pal: ramp([[0, '#3a0f0b'], [0.4, '#8a2e1c'], [0.7, '#c4623b'], [1, '#e8a27a']]),
    f: (n, u, v) => { const w = fbm(n, u, v, { base: 4, oct: 6 }); const cap = Math.max(0, (0.14 - v) / 0.14); return w + cap * 2; }, cap: true },
  emerald: { seed: 71, atmo: [150, 255, 220], rim: 0.5,
    pal: ramp([[0, '#0f4c40'], [0.45, '#2f9a82'], [0.75, '#7fd6bf'], [1, '#d4fff2']]),
    f: (n, u, v) => { const w = fbm(n, u, v, { base: 2, oct: 3 }); return 0.55 + 0.12 * Math.sin(v * Math.PI * 7 + w * 2) + w * 0.25; } },
  sun: { seed: 89, emissive: true, atmo: [255, 170, 80], rim: 0,
    pal: ramp([[0, '#9a3008'], [0.3, '#e0641c'], [0.55, '#f7a23a'], [0.8, '#ffd889'], [1, '#fff7dc']]),
    f: (n, u, v) => { const g = fbm(n, u, v, { base: 36, oct: 3, gain: 0.5 }); const big = fbm(n, u + 5, v, { base: 4, oct: 3 }); return 0.28 + g * 0.45 + big * 0.35; } },
};

const cache = new Map();
export function planetTexture(tone) {
  if (cache.has(tone)) return cache.get(tone);
  const T = TONES[tone] || TONES.sapphire;
  const noise = makeNoise(T.seed);
  const data = new Uint8ClampedArray(TEX_W * TEX_H * 3);
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W;
      let [r, g, b] = T.pal(T.f(noise, u, v));
      if (T.spot) { const s = T.spot(u, v); r += (T.spotCol[0] - r) * s; g += (T.spotCol[1] - g) * s; b += (T.spotCol[2] - b) * s; }
      if (T.cap && v < 0.12) { const k = Math.min(1, (0.12 - v) / 0.05); r += (245 - r) * k; g += (238 - g) * k; b += (230 - b) * k; }
      const i = (y * TEX_W + x) * 3;
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
  if (T.craters) {
    const rnd = mulberry(T.seed + 1);
    for (let c = 0; c < 70; c++) {
      const cx = rnd() * TEX_W, cy = 30 + rnd() * (TEX_H - 60), rad = 2 + rnd() ** 2.2 * 16;
      for (let y = Math.max(0, cy - rad * 1.4 | 0); y < Math.min(TEX_H, cy + rad * 1.4); y++) {
        for (let dx = -rad * 1.4; dx < rad * 1.4; dx++) {
          const x = ((cx + dx) % TEX_W + TEX_W) % TEX_W | 0;
          const d = Math.hypot(dx, y - cy) / rad;
          if (d > 1.35) continue;
          const i = (y * TEX_W + x) * 3;
          const k = d < 0.85 ? -0.22 * (1 - d * 0.6) : d < 1.1 ? 0.16 : 0.06 * (1.35 - d) / 0.25;
          for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.max(0, Math.min(255, data[i + ch] * (1 + k)));
        }
      }
    }
  }
  const out = { data, w: TEX_W, h: TEX_H, tone: T };
  cache.set(tone, out);
  return out;
}

// Precomputes sphere geometry for an R×R canvas: texture coordinates, lighting and edge coverage.
export function sphereMap(R, tone) {
  const T = (TONES[tone] || TONES.sapphire);
  const L = [-0.58, -0.42, 0.7]; const ln = Math.hypot(...L); L[0] /= ln; L[1] /= ln; L[2] /= ln;
  const px = [], lon = [], row = [], shade = [], rim = [], cov = [];
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const nx = ((x + 0.5) / R) * 2 - 1, ny = ((y + 0.5) / R) * 2 - 1, rr = nx * nx + ny * ny;
    if (rr > 1) continue;
    const nz = Math.sqrt(1 - rr), d = Math.sqrt(rr);
    const latv = Math.asin(Math.max(-1, Math.min(1, ny)));
    const lo = Math.atan2(nx, nz);
    px.push((y * R + x) * 4);
    lon.push((lo / (2 * Math.PI) + 0.5) * TEX_W);
    row.push(Math.min(TEX_H - 1, Math.max(0, ((latv / Math.PI + 0.5) * TEX_H) | 0)) * TEX_W);
    if (T.emissive) shade.push(0.62 + 0.5 * Math.pow(nz, 0.55));
    else { const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]); shade.push(0.05 + 1.08 * Math.pow(lam, 0.9)); }
    rim.push(T.rim ? Math.pow(1 - nz, 3) * T.rim * (0.35 + 0.65 * Math.max(0, nx * L[0] + ny * L[1] + 0.3)) : 0);
    cov.push(Math.max(0, Math.min(1, (1 - d) * R * 0.9)));
  }
  return { n: px.length, px: Int32Array.from(px), lon: Float32Array.from(lon), row: Int32Array.from(row), shade: Float32Array.from(shade), rim: Float32Array.from(rim), cov: Float32Array.from(cov) };
}

export function paintSphere(img, map, tex, offset) {
  const d = img.data, t = tex.data, W = tex.w, atmo = tex.tone.atmo;
  for (let i = 0; i < map.n; i++) {
    let u = (map.lon[i] + offset) % W; if (u < 0) u += W;
    const ti = (map.row[i] + (u | 0)) * 3, s = map.shade[i], r = map.rim[i], p = map.px[i];
    d[p] = t[ti] * s + atmo[0] * r;
    d[p + 1] = t[ti + 1] * s + atmo[1] * r;
    d[p + 2] = t[ti + 2] * s + atmo[2] * r;
    d[p + 3] = 255 * map.cov[i];
  }
}
