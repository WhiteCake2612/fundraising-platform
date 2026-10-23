import { money, pct, stageLabel, isNum } from '../lib/format.js';
import { FitBreakdown } from './OpportunityCard.jsx';

// A Tinder-style profile: a full-bleed cover with photo-style slides, and just the essentials over it.
// Every figure shown comes from the approved teaser; anything missing simply isn't shown.

function hue(s = '') {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function coverStyle(item) {
  const h = hue(item.name || item.code);
  return {
    '--h': h,
    background: `radial-gradient(120% 80% at 20% 10%, hsl(${h} 75% 58% / 0.9), transparent 60%),
      radial-gradient(90% 70% at 90% 80%, hsl(${(h + 50) % 360} 70% 45% / 0.8), transparent 65%),
      linear-gradient(165deg, hsl(${h} 45% 22%), hsl(${(h + 30) % 360} 40% 8%))`,
  };
}

const initials = (s) => s.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export function slidesFor(item) {
  const f = item.financials || {};
  const slides = ['cover'];
  if (f.revenue || f.growth || f.runway || item.raise?.amount != null) slides.push('numbers');
  if (item.traction?.text || item.highlights?.length) slides.push('traction');
  slides.push('fit');
  return slides;
}

export default function SwipeProfile({ item, slide = 0, onInfo }) {
  const title = item.name || `Project ${item.code}`;
  const slides = slidesFor(item);
  const kind = slides[Math.min(slide, slides.length - 1)];
  const f = item.financials || {};
  const cur = item.currency;
  const place = [item.headquarters, item.geography].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  const chips = [item.sub_industry, item.business_model, item.raise?.amount != null && `Raising ${money(item.raise.amount, cur)}`, item.raise?.seeking_lead === 1 && 'Lead needed'].filter(Boolean);

  return (
    <div className="tp" style={coverStyle(item)}>
      <div className="tp-bars" aria-hidden="true">{slides.map((s, i) => <i key={s} className={i === slides.indexOf(kind) ? 'on' : ''} />)}</div>
      <span className={`tp-fit ${item.match.eligible ? '' : 'bad'}`} title="Mandate fit — alignment with your stated criteria, not a return prediction"><b />{item.match.score}% fit</span>

      <div className="tp-art" aria-hidden="true">
        {kind === 'cover' && <span className="tp-mono">{initials(title)}</span>}
        {kind === 'numbers' && (
          <div className="tp-stats">
            {item.raise?.amount != null && <Stat k="Raising" v={money(item.raise.amount, cur)} />}
            {f.revenue && <Stat k="Revenue" v={money(f.revenue.value, cur)} />}
            {f.growth && isNum(f.growth.value) && <Stat k="Growth" v={pct(f.growth.value)} />}
            {f.gross_margin && <Stat k="Gross margin" v={pct(f.gross_margin.value)} />}
            {f.runway && <Stat k="Runway" v={`${f.runway.value.toFixed(0)} mo`} />}
          </div>
        )}
        {kind === 'traction' && (
          <div className="tp-quote">
            {item.traction?.text && <p>“{item.traction.text}”</p>}
            {item.highlights?.slice(0, 2).map((h, i) => <p key={i} className="small">{h.text}</p>)}
          </div>
        )}
        {kind === 'fit' && <div className="tp-fitlist"><FitBreakdown match={item.match} compact /></div>}
      </div>

      <div className="tp-info">
        <div className="tp-name">
          <h2>{title}</h2><span className="tp-age">{stageLabel(item.stage)}</span>
          <button className="tp-i" onClick={(e) => { e.stopPropagation(); onInfo?.(); }} onPointerDown={e => e.stopPropagation()} aria-label="Open full profile">i</button>
        </div>
        {place && <div className="tp-line"><Pin />{place}</div>}
        <div className="tp-line"><Tag />{item.industry || 'Sector not disclosed'}{item.founding_year ? ` · since ${item.founding_year}` : ''}</div>
        {kind === 'cover' && item.overview?.text && <p className="tp-bio">{item.overview.text}</p>}
        {kind === 'cover' && chips.length > 0 && <div className="tp-chips">{chips.map(c => <span key={c}>{c}</span>)}</div>}
      </div>
    </div>
  );
}

function Stat({ k, v }) {
  return <div><span>{k}</span><b>{v}</b></div>;
}
const Pin = () => <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>;
const Tag = () => <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Zm4.5-5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>;
