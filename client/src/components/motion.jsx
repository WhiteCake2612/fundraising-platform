import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Pixel-dissolve wipe between routes (the white/teal checker transition in the reference video).
export function PixelTransition() {
  const ref = useRef();
  const loc = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reducedMotion()) return;
    const c = ref.current;
    const ctx = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`;
    ctx.scale(dpr, dpr);
    const S = W < 600 ? 22 : 30;
    const cols = Math.ceil(W / S), rows = Math.ceil(H / S);
    // Each cell gets a time to appear (sweeping bottom→top with noise) and to disappear.
    const cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const t = (1 - y / rows) * 0.55 + Math.random() * 0.45;
      cells.push({ x, y, t, color: Math.random() < 0.16 ? '#2ee6c9' : Math.random() < 0.5 ? '#f2f2ee' : '#0b0c0d' });
    }
    const IN = 300, HOLD = 60, OUT = 340, total = IN + HOLD + OUT;
    let start, raf;
    const frame = (now) => {
      start ??= now;
      const e = now - start;
      ctx.clearRect(0, 0, W, H);
      for (const cell of cells) {
        const appear = cell.t * IN, vanish = IN + HOLD + cell.t * OUT;
        if (e >= appear && e < vanish) { ctx.fillStyle = cell.color; ctx.fillRect(cell.x * S, cell.y * S, S - 1, S - 1); }
      }
      if (e < total) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [loc.pathname]);
  return <canvas ref={ref} className="pixel-canvas" aria-hidden="true" />;
}

export function ScrollProgress() {
  const ref = useRef();
  useEffect(() => {
    const on = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      ref.current.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
    };
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); };
  }, []);
  return <div ref={ref} className="scroll-progress" style={{ width: '100%', transform: 'scaleX(0)' }} />;
}

// Watches the DOM for .reveal / .reveal-clip elements and animates them in when scrolled into view.
export function RevealObserver() {
  const loc = useLocation();
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const scan = () => document.querySelectorAll('.reveal:not(.in), .reveal-clip:not(.in)').forEach(el => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [loc.pathname]);
  return null;
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>';
// Decoding text effect: characters resolve left→right from random glyphs.
export function Scramble({ text, as: Tag = 'span', className, duration = 700, trigger = 'mount', ...rest }) {
  const str = String(text ?? '');
  const [out, setOut] = useState(reducedMotion() ? str : str.replace(/\S/g, ' '));
  const raf = useRef();
  const run = () => {
    if (reducedMotion()) { setOut(str); return; }
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const n = Math.floor(p * str.length);
      setOut(str.slice(0, n) + str.slice(n).replace(/\S/g, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]));
      if (p < 1) raf.current = requestAnimationFrame(tick); else setOut(str);
    };
    raf.current = requestAnimationFrame(tick);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); return () => cancelAnimationFrame(raf.current); }, [str]);
  return <Tag className={className} aria-label={str} onMouseEnter={trigger === 'hover' || trigger === 'both' ? run : undefined} {...rest}><span aria-hidden="true">{out}</span></Tag>;
}

// Counts numeric values up when they first appear; non-numeric strings render as-is.
export function CountUp({ value, duration = 1100 }) {
  const ref = useRef();
  const str = String(value ?? '');
  const m = str.match(/^([^\d−-]*)([−-]?)([\d,]*\.?\d+)(.*)$/);
  const [shown, setShown] = useState(m && !reducedMotion() ? `${m[1]}${m[2]}0${m[4]}` : str);
  useEffect(() => {
    if (!m || reducedMotion()) { setShown(str); return; }
    const target = Number(m[3].replace(/,/g, ''));
    const decimals = (m[3].split('.')[1] || '').length;
    let raf;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const v = target * (1 - Math.pow(1 - p, 3));
        setShown(`${m[1]}${m[2]}${v.toFixed(decimals)}${m[4]}`);
        if (p < 1) raf = requestAnimationFrame(tick); else setShown(str);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [str]);
  return <span ref={ref}>{shown}</span>;
}

// Rolling text for links and buttons (the stacked "READ STORY" hover in the video).
export function Roll({ children }) {
  const t = String(children);
  return <span className="roll"><span data-text={t}>{t}</span></span>;
}

// Subtle 3D tilt following the pointer.
export function useTilt(strength = 6) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || window.matchMedia('(hover: none)').matches) return;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${px * strength}deg) rotateX(${-py * strength}deg)`;
    };
    const leave = () => { el.style.transform = ''; };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, [strength]);
  return ref;
}

// Progress (0→1) of an element scrolling through the viewport.
export function useScrollProgress(ref, { start = 0.85, end = 0.25 } = {}) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const a = innerHeight * start, b = innerHeight * end;
        const v = (a - r.top) / (r.height + a - b);
        setP(Math.max(0, Math.min(1, v)));
      });
    };
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, [ref, start, end]);
  return p;
}
