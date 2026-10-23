import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { reducedMotion } from './motion.jsx';

// Celestial visual layer: a parallax starfield, rotating jewel-tone orbs, particle constellations,
// staggered word reveals and magnetic buttons.

const sized = (canvas, w, h) => {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
};

// Fixed, full-viewport starfield. Stars twinkle, drift with scroll and pointer by depth, and
// an occasional gold shooting star crosses the sky. Denser on the landing page.
export function StarField() {
  const ref = useRef();
  const loc = useLocation();
  const density = loc.pathname === '/' ? 1 : 0.5;
  useEffect(() => {
    const c = ref.current;
    let W = innerWidth, H = innerHeight, ctx = sized(c, W, H);
    const make = () => Array.from({ length: Math.min(420, Math.round((W * H) / 7000 * density)) }, () => ({
      x: Math.random() * W, y: Math.random() * H, z: 0.15 + Math.random() * 0.85,
      r: Math.random() < 0.9 ? 0.6 + Math.random() * 1.0 : 1.5 + Math.random() * 1.0,
      ph: Math.random() * Math.PI * 2, sp: 0.6 + Math.random() * 1.6, gold: Math.random() < 0.22,
    }));
    let stars = make();
    let mx = 0, my = 0, tmx = 0, tmy = 0, raf, shoot = null, nextShoot = performance.now() + 2500;
    const still = reducedMotion();
    const draw = (now) => {
      mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
      ctx.clearRect(0, 0, W, H);
      const sy = scrollY;
      for (const s of stars) {
        const y = ((s.y - sy * s.z * 0.18 + my * s.z * 14) % H + H) % H;
        const x = ((s.x + mx * s.z * 18) % W + W) % W;
        const a = still ? 0.7 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 1000 * s.sp + s.ph));
        ctx.globalAlpha = Math.min(1, a * (0.55 + s.z * 0.6));
        ctx.fillStyle = s.gold ? '#e8c27a' : '#f3e6d3';
        ctx.beginPath(); ctx.arc(x, y, s.r * (0.6 + s.z * 0.5), 0, 6.283); ctx.fill();
        if (s.r > 1.6 && a > 0.8) { ctx.globalAlpha = (a - 0.8) * 1.5; ctx.fillRect(x - s.r * 3, y - 0.3, s.r * 6, 0.6); ctx.fillRect(x - 0.3, y - s.r * 3, 0.6, s.r * 6); }
      }
      if (!still) {
        if (!shoot && now > nextShoot) {
          shoot = { x: Math.random() * W * 0.7, y: Math.random() * H * 0.4, t: now, len: 120 + Math.random() * 120, ang: 0.35 + Math.random() * 0.35 };
        }
        if (shoot) {
          const p = (now - shoot.t) / 900;
          if (p >= 1) { shoot = null; nextShoot = now + 4000 + Math.random() * 6000; }
          else {
            const hx = shoot.x + Math.cos(shoot.ang) * 520 * p, hy = shoot.y + Math.sin(shoot.ang) * 520 * p;
            const tx = hx - Math.cos(shoot.ang) * shoot.len, ty = hy - Math.sin(shoot.ang) * shoot.len;
            const g = ctx.createLinearGradient(tx, ty, hx, hy);
            g.addColorStop(0, 'rgba(232,194,122,0)'); g.addColorStop(1, 'rgba(243,230,211,0.95)');
            ctx.globalAlpha = Math.sin(p * Math.PI);
            ctx.strokeStyle = g; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
          }
        }
        raf = requestAnimationFrame(draw);
      }
      ctx.globalAlpha = 1;
    };
    const resize = () => { W = innerWidth; H = innerHeight; ctx = sized(c, W, H); stars = make(); if (still) draw(0); };
    const move = (e) => { tmx = e.clientX / W - 0.5; tmy = e.clientY / H - 0.5; };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !still) raf = requestAnimationFrame(draw); };
    addEventListener('resize', resize); addEventListener('pointermove', move, { passive: true }); document.addEventListener('visibilitychange', vis);
    if (still) draw(0); else raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('pointermove', move); document.removeEventListener('visibilitychange', vis); };
  }, [density]);
  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}

// A rotating sphere drawn with layered gradients: base colour, a scrolling surface texture,
// a lit highlight and a terminator shadow, an atmosphere glow and an optional ring.
export function Orb({ tone = 'sapphire', size = 200, ring = false, spin = 40, className = '', style }) {
  return (
    <div className={`orb3d orb-${tone} ${ring ? 'has-ring' : ''} ${className}`} style={{ '--s': `${size}px`, '--spin': `${spin}s`, ...style }} aria-hidden="true">
      {ring && <i className="orb-ring back" />}
      <div className="orb-body"><i className="orb-tex" /><i className="orb-shade" /></div>
      {ring && <i className="orb-ring front" />}
    </div>
  );
}

// Particles circling a tilted ellipse, like a constellation in orbit. Hovering scatters them outward.
export function ParticleSwirl({ count = 150, className = '' }) {
  const wrap = useRef(), ref = useRef();
  useEffect(() => {
    const c = ref.current, el = wrap.current;
    let W = el.clientWidth, H = el.clientHeight, ctx = sized(c, W, H), raf;
    const ps = Array.from({ length: count }, () => ({
      a: Math.random() * Math.PI * 2, sp: (0.15 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : 1.2),
      rr: 0.75 + Math.random() * 0.5, jy: (Math.random() - 0.5) * 0.35, r: 0.5 + Math.random() * 1.4, gold: Math.random() < 0.3,
    }));
    let spread = 1, target = 1, last = performance.now();
    const still = reducedMotion();
    const draw = (now) => {
      const dt = Math.min(50, now - last) / 1000; last = now;
      spread += (target - spread) * 0.06;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, rx = W * 0.3, ry = H * 0.16, tilt = -0.32;
      for (const p of ps) {
        if (!still) p.a += p.sp * dt * (spread > 1.2 ? 1.8 : 1);
        const ex = Math.cos(p.a) * rx * p.rr * spread, ey = (Math.sin(p.a) * ry * p.rr + p.jy * ry) * spread;
        const x = cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
        const depth = 0.5 + 0.5 * Math.sin(p.a);
        ctx.globalAlpha = 0.25 + depth * 0.75;
        ctx.fillStyle = p.gold ? '#e8c27a' : '#f3e6d3';
        ctx.beginPath(); ctx.arc(x, y, p.r * (0.7 + depth * 0.6), 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(() => { W = el.clientWidth; H = el.clientHeight; ctx = sized(c, W, H); if (still) draw(performance.now()); });
    ro.observe(el);
    const enter = () => { target = 1.55; }, leave = () => { target = 1; };
    const host = el.closest('.swirl-host') || el;
    host.addEventListener('pointerenter', enter); host.addEventListener('pointerleave', leave);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); host.removeEventListener('pointerenter', enter); host.removeEventListener('pointerleave', leave); };
  }, [count]);
  return <div ref={wrap} className={`swirl ${className}`} aria-hidden="true"><canvas ref={ref} /></div>;
}

// Heading whose words rise in one after another when scrolled into view. Words in `accent` are gold italic.
export function Words({ text, accent = [], as: Tag = 'h2', className = '', style }) {
  const acc = new Set([].concat(accent));
  let i = 0;
  return (
    <Tag className={`words reveal ${className}`} style={style} aria-label={text.replace(/\n/g, ' ')}>
      {text.split('\n').map((line, li) => (
        <span key={li} className="words-line" aria-hidden="true">
          {line.split(' ').map((w) => <span key={i} className={`w ${acc.has(w.replace(/[.,]/g, '')) ? 'em' : ''}`} style={{ '--i': i++ }}><span>{w}</span></span>)}
        </span>
      ))}
    </Tag>
  );
}

// Pulls an element gently toward the pointer while hovered.
export function useMagnetic(strength = 0.3) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || matchMedia('(hover: none)').matches) return;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`;
    };
    const leave = () => { el.style.transform = ''; };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, [strength]);
  return ref;
}

// Writes the page's scroll position (0..1 of one viewport) and pointer offset into CSS variables on an element.
export function useSceneVars(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf, mx = 0, my = 0, tx = 0, ty = 0;
    const still = reducedMotion();
    const loop = () => {
      mx += (tx - mx) * 0.08; my += (ty - my) * 0.08;
      el.style.setProperty('--p', Math.min(1.2, scrollY / innerHeight).toFixed(4));
      el.style.setProperty('--mx', mx.toFixed(4)); el.style.setProperty('--my', my.toFixed(4));
      raf = requestAnimationFrame(loop);
    };
    const move = (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; };
    if (!still) { addEventListener('pointermove', move, { passive: true }); raf = requestAnimationFrame(loop); }
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', move); };
  }, [ref]);
}

// Types `text` out once it is visible; restarts when `text` changes.
export function useTyping(text, { speed = 22, start = true } = {}) {
  const [out, setOut] = useState(reducedMotion() ? text : '');
  useEffect(() => {
    if (reducedMotion()) { setOut(text); return; }
    if (!start) { setOut(''); return; }
    let i = 0, t;
    const tick = () => { i += 1; setOut(text.slice(0, i)); if (i < text.length) t = setTimeout(tick, speed); };
    setOut(''); t = setTimeout(tick, speed);
    return () => clearTimeout(t);
  }, [text, start, speed]);
  return out;
}

// Spaced serif wordmark with a tilted gold orbit around the final letter.
export function Wordmark({ size = 'sm' }) {
  return (
    <span className={`wordmark wm-${size}`} aria-label="RAISE">
      <span aria-hidden="true">R</span><span aria-hidden="true">A</span><span aria-hidden="true">I</span><span aria-hidden="true">S</span>
      <span className="wm-last" aria-hidden="true">E<svg viewBox="0 0 120 60"><ellipse cx="60" cy="30" rx="56" ry="17" /></svg></span>
    </span>
  );
}
