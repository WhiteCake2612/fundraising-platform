import { Link } from 'react-router-dom';
import { money, pct, stageLabel, isNum } from '../lib/format.js';
import { FitBreakdown } from './OpportunityCard.jsx';

// A Tinder-style profile: a full-bleed cover with photo-style slides, and the essentials over it.
// Every figure shown comes from the approved teaser; anything missing simply isn't shown.

const SECTOR_ICON = {
  Fintech: '💳', Healthcare: '🩺', 'Enterprise Software': '🧩', Consumer: '🛍️', Deeptech: '🔬', Climate: '🌍',
  Manufacturing: '🏭', Logistics: '🚚', Edtech: '🎓', Agritech: '🌾', Media: '🎬', 'Real Estate': '🏙️', Other: '✨',
};
export const sectorIcon = (s) => SECTOR_ICON[s] || '✨';

export function hue(s = '') {
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
const title = (item) => item.name || `Project ${item.code}`;

// Short, factual badges derived only from disclosed figures.
export function badges(item) {
  const f = item.financials || {};
  const out = [];
  if (item.match?.eligible && item.match.score >= 85) out.push(['🎯', 'Top match']);
  if (f.growth && isNum(f.growth.value)) out.push(f.growth.value >= 1 ? ['🚀', `${pct(f.growth.value)} YoY`] : ['📈', `${pct(f.growth.value)} growth`]);
  out.push(f.revenue ? ['💵', 'Revenue-generating'] : ['🌱', 'Pre-revenue']);
  if (f.gross_margin && f.gross_margin.value >= 0.6) out.push(['💎', `${pct(f.gross_margin.value)} gross margin`]);
  if (f.runway) out.push(f.runway.value >= 18 ? ['🛟', `${f.runway.value.toFixed(0)} mo runway`] : f.runway.value < 9 ? ['⏳', `${f.runway.value.toFixed(0)} mo runway`] : null);
  if (item.raise?.seeking_lead === 1) out.push(['🤝', 'Needs a lead']);
  return out.filter(Boolean);
}

const lookingFor = (item) => item.raise?.seeking_lead === 1 ? 'a lead investor' : item.raise?.seeking_lead === 0 ? 'co-investors' : 'investors';

export function slidesFor(item) {
  const f = item.financials || {};
  const slides = ['cover'];
  if (f.revenue || f.growth || f.runway || item.raise?.amount != null) slides.push('numbers');
  if (item.traction?.text || item.highlights?.length || item.raise?.use_of_funds?.text || item.problem?.text) slides.push('story');
  slides.push('fit');
  return slides;
}

export default function SwipeProfile({ item, slide = 0, onInfo }) {
  const slides = slidesFor(item);
  const kind = slides[Math.min(slide, slides.length - 1)];
  const cur = item.currency;
  const place = [item.headquarters, item.geography].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  const chips = [item.business_model, item.raise?.seeking_lead === 1 && 'Lead round', item.founding_year && `Est. ${item.founding_year}`].filter(Boolean);

  return (
    <div className={`tp tp-${kind}`} style={coverStyle(item)}>
      <span className="tp-blob a" aria-hidden="true" /><span className="tp-blob b" aria-hidden="true" />
      <div className="tp-bars" aria-hidden="true">{slides.map((s, i) => <i key={s} className={i === slides.indexOf(kind) ? 'on' : ''} />)}</div>
      <span className={`tp-fit ${item.match.eligible ? '' : 'bad'}`} title="Mandate fit — alignment with your stated criteria, not a return prediction"><b />{item.match.score}% fit</span>
      <span className="tp-sector" title={item.industry || 'Sector not disclosed'}>{sectorIcon(item.industry)}</span>

      <div className="tp-art">
        {kind === 'cover' && <Cover item={item} />}
        {kind === 'numbers' && <Numbers item={item} />}
        {kind === 'story' && <Story item={item} />}
        {kind === 'fit' && <Fit item={item} />}
      </div>

      <div className="tp-info">
        <div className="tp-name">
          <h2>{title(item)}</h2><span className="tp-age">{stageLabel(item.stage)}</span>
          <button className="tp-i" onClick={(e) => { e.stopPropagation(); onInfo?.(); }} onPointerDown={e => e.stopPropagation()} aria-label="Open full profile">i</button>
        </div>
        {place && <div className="tp-line"><Pin />{place}</div>}
        {kind === 'cover' ? (
          <>
            <div className="tp-line"><Tag />{item.industry || 'Sector not disclosed'}{item.sub_industry ? ` · ${item.sub_industry}` : ''}</div>
            {item.overview?.text && <p className="tp-bio">{item.overview.text}</p>}
            <div className="tp-looking"><span>👀</span>Looking for {lookingFor(item)}{item.raise?.amount != null ? <> · <b>{money(item.raise.amount, cur)}</b></> : null}</div>
            {chips.length > 0 && <div className="tp-chips">{chips.map(c => <span key={c}>{c}</span>)}</div>}
          </>
        ) : <div className="tp-line"><Tag />{item.industry || 'Sector not disclosed'}</div>}
      </div>
    </div>
  );
}

function Cover({ item }) {
  const f = item.financials || {};
  const cur = item.currency;
  const stats = [
    item.raise?.amount != null && ['Raising', money(item.raise.amount, cur)],
    f.revenue && ['Revenue', money(f.revenue.value, cur)],
    f.growth && isNum(f.growth.value) ? ['Growth', pct(f.growth.value)] : f.runway && ['Runway', `${f.runway.value.toFixed(0)} mo`],
  ].filter(Boolean);
  return (
    <div className="tp-cover-in">
      <div className="tp-avatar"><span>{initials(title(item))}</span><i>{sectorIcon(item.industry)}</i></div>
      <div className="tp-badges">{badges(item).slice(0, 3).map(([e, t], i) => <span key={t} style={{ '--i': i }}>{e} {t}</span>)}</div>
      {stats.length > 0 && <div className="tp-strip">{stats.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>}
    </div>
  );
}

function Numbers({ item }) {
  const f = item.financials || {};
  const cur = item.currency;
  const prior = f.revenue && f.growth && isNum(f.growth.value) ? f.revenue.value / (1 + f.growth.value) : null;
  const max = Math.max(f.revenue?.value || 0, prior || 0) || 1;
  return (
    <div className="tp-panel">
      <span className="tp-kicker">📊 The numbers</span>
      {f.revenue && (
        <div className="tp-rev">
          {prior != null && <div><span>Prior year</span><i style={{ '--w': `${(prior / max) * 100}%` }} /><b>{money(prior, cur)}</b></div>}
          <div className="now"><span>Latest</span><i style={{ '--w': `${(f.revenue.value / max) * 100}%` }} /><b>{money(f.revenue.value, cur)}</b></div>
        </div>
      )}
      <div className="tp-grid">
        {item.raise?.amount != null && <Tile k="Raising" v={money(item.raise.amount, cur)} />}
        {f.growth && isNum(f.growth.value) && <Tile k="YoY growth" v={pct(f.growth.value)} />}
        {f.gross_margin && <Tile k="Gross margin" v={pct(f.gross_margin.value)} ring={f.gross_margin.value} />}
        {f.burn && <Tile k="Monthly burn" v={money(f.burn.value, cur)} />}
      </div>
      {f.runway && (
        <div className="tp-runway"><div className="row between"><span>Runway</span><b>{f.runway.value.toFixed(0)} months</b></div><i style={{ '--w': `${Math.min(100, (f.runway.value / 36) * 100)}%` }} /></div>
      )}
      <span className="tp-src">Founder-stated figures · {f.revenue?.period || 'latest'}</span>
    </div>
  );
}

function Story({ item }) {
  return (
    <div className="tp-panel">
      <span className="tp-kicker">⚡ Traction</span>
      {item.traction?.text && <p className="tp-big">“{item.traction.text}”</p>}
      {item.highlights?.slice(0, 2).map((h, i) => <p key={i} className="tp-note">✦ {h.text}</p>)}
      {item.problem?.text && <div className="tp-glass"><span>The problem</span>{item.problem.text}</div>}
      {item.raise?.use_of_funds?.text && <div className="tp-glass"><span>Use of funds</span>{item.raise.use_of_funds.text}</div>}
    </div>
  );
}

function Fit({ item }) {
  const m = item.match;
  return (
    <div className="tp-panel">
      <div className="tp-ring" style={{ '--p': m.score, '--c': m.eligible ? '#3ce38f' : '#fd5068' }}><b>{m.score}</b><span>fit</span></div>
      <div className="tp-fitlist"><FitBreakdown match={m} compact /></div>
    </div>
  );
}

function Tile({ k, v, ring }) {
  return (
    <div className="tp-tile">
      {ring != null && <em style={{ '--p': Math.max(0, Math.min(100, ring * 100)) }} />}
      <span>{k}</span><b>{v}</b>
    </div>
  );
}

// The full profile, laid out like a dating-app "about" page.
export function ProfileSheet({ item, onClose }) {
  const f = item.financials || {};
  const cur = item.currency;
  const essentials = [
    ['🪜', 'Stage', stageLabel(item.stage)],
    [sectorIcon(item.industry), 'Sector', [item.industry, item.sub_industry].filter(Boolean).join(' · ')],
    ['🧱', 'Business model', item.business_model],
    ['📅', 'Founded', item.founding_year],
    ['📍', 'Headquarters', item.headquarters],
    ['🌍', 'Market', item.geography],
  ].filter(r => r[2]);
  const nums = [
    ['Revenue', f.revenue && money(f.revenue.value, cur)], ['Growth', f.growth && isNum(f.growth.value) && pct(f.growth.value)],
    ['Gross margin', f.gross_margin && pct(f.gross_margin.value)], ['Runway', f.runway && `${f.runway.value.toFixed(0)} mo`],
    ['Burn / mo', f.burn && money(f.burn.value, cur)], ['Cash', f.cash && money(f.cash.value, cur)],
  ].filter(r => r[1]);
  return (
    <div className="ps">
      <div className="ps-hero" style={coverStyle(item)}>
        <button className="tp-close" onClick={onClose} aria-label="Close full profile">↓</button>
        <div className="tp-avatar sm"><span>{initials(title(item))}</span><i>{sectorIcon(item.industry)}</i></div>
        <h2>{title(item)} <span>{stageLabel(item.stage)}</span></h2>
        <div className="ps-badges">{badges(item).map(([e, t]) => <span key={t}>{e} {t}</span>)}</div>
      </div>

      <section className="ps-card look">
        <h4>Looking for</h4>
        <div className="ps-look"><span>👀</span><div><b>{item.raise?.amount != null ? money(item.raise.amount, cur) : 'Amount not disclosed'}</b><small>from {lookingFor(item)}</small></div></div>
        {item.raise?.use_of_funds?.text && <p>{item.raise.use_of_funds.text}</p>}
      </section>

      {(item.overview?.text || item.problem?.text || item.solution?.text) && (
        <section className="ps-card">
          <h4>About</h4>
          {item.overview?.text && <p className="ps-lead">{item.overview.text}</p>}
          {item.problem?.text && <p><span className="ps-k">Problem</span>{item.problem.text}</p>}
          {item.differentiation?.text && <p><span className="ps-k">Edge</span>{item.differentiation.text}</p>}
        </section>
      )}

      <section className="ps-card">
        <h4>Essentials</h4>
        <ul className="ps-ess">{essentials.map(([e, k, v]) => <li key={k}><span>{e}</span><div><small>{k}</small>{v}</div></li>)}</ul>
      </section>

      {nums.length > 0 && (
        <section className="ps-card">
          <h4>Numbers</h4>
          <div className="ps-nums">{nums.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>
          <p className="ps-src">Founder-stated · {f.revenue?.period || 'latest'}. Verify in diligence.</p>
        </section>
      )}

      {(item.traction?.text || item.highlights?.length > 0) && (
        <section className="ps-card">
          <h4>Traction</h4>
          {item.traction?.text && <p className="ps-lead">{item.traction.text}</p>}
          {item.highlights?.map((h, i) => <p key={i}>✦ {h.text}</p>)}
        </section>
      )}

      <section className="ps-card warn">
        <h4>Risk flags & open questions</h4>
        {item.risks?.length ? item.risks.slice(0, 4).map((r, i) => <p key={i}>⚠️ {r.text}</p>) : <p className="ps-src">None recorded at approval.</p>}
      </section>

      <section className="ps-card">
        <h4>Why it fits you · {item.match.score}%</h4>
        <FitBreakdown match={item.match} />
        <p className="ps-src">Fit measures alignment with your stated mandate only — not a prediction of returns or an endorsement.</p>
      </section>

      <Link className="ps-cta" to={`/investor/opportunities/${item.company_id}`}>Open full teaser →</Link>
    </div>
  );
}

const Pin = () => <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>;
const Tag = () => <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Zm4.5-5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>;
