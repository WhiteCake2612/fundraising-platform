import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { money, pct, stageLabel, isNum } from '../lib/format.js';
import { FitBreakdown } from './OpportunityCard.jsx';
import { Icon, SectorIcon } from './icons.jsx';
import { FitRadar, PeerBars, RunwayTimeline, ConfidenceMeter, CONFIDENCE } from './charts.jsx';

// A swipe-deck profile: a full-bleed cover with photo-style slides and the essentials over it.
// Every figure shown comes from the approved teaser; anything missing simply isn't shown.

export function hue(s = '') {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function coverStyle(item) {
  const h = hue(item.name || item.code);
  return {
    '--h': h,
    background: `radial-gradient(110% 70% at 15% 0%, hsl(${h} 55% 42% / 0.85), transparent 62%),
      radial-gradient(80% 60% at 100% 85%, hsl(${(h + 40) % 360} 45% 32% / 0.7), transparent 65%),
      linear-gradient(170deg, hsl(${h} 30% 17%), hsl(${(h + 25) % 360} 25% 7%))`,
  };
}

const initials = (s) => s.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const title = (item) => item.name || `Project ${item.code}`;

// Short, factual highlights derived only from disclosed figures.
export function badges(item) {
  const f = item.financials || {};
  const p = item.peers || {};
  const out = [];
  if (item.match?.eligible && item.match.score >= 85) out.push(['target', 'Strong mandate fit']);
  if (p.growth && p.growth.pct >= 75) out.push(['trend', `Top ${Math.max(1, 100 - p.growth.pct)}% growth at stage`]);
  else if (f.growth && isNum(f.growth.value)) out.push(['trend', `${pct(f.growth.value)} YoY growth`]);
  out.push(f.revenue ? ['cash', 'Revenue-generating'] : ['sprout', 'Pre-revenue']);
  if (f.gross_margin && f.gross_margin.value >= 0.6) out.push(['percent', `${pct(f.gross_margin.value)} gross margin`]);
  if (f.runway && f.runway.value < 9) out.push(['clock', `${f.runway.value.toFixed(0)} mo runway`]);
  if (item.raise?.seeking_lead === 1) out.push(['users', 'Lead investor wanted']);
  return out;
}

const lookingFor = (item) => item.raise?.seeking_lead === 1 ? 'a lead investor' : item.raise?.seeking_lead === 0 ? 'co-investors' : 'investors';

export function slidesFor(item) {
  const f = item.financials || {};
  const slides = ['cover'];
  if (f.revenue || f.growth || f.runway || item.raise?.amount != null) slides.push('numbers');
  if (item.peers && Object.keys(item.peers).length) slides.push('peers');
  slides.push('fit', 'diligence');
  return slides;
}
const SLIDE_LABEL = { cover: 'Overview', numbers: 'Numbers', peers: 'Vs peers', fit: 'Mandate fit', diligence: 'Diligence' };

export default function SwipeProfile({ item, slide = 0, onInfo }) {
  const slides = slidesFor(item);
  const kind = slides[Math.min(slide, slides.length - 1)];
  const cur = item.currency;
  const place = [item.headquarters, item.geography].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  const chips = [item.business_model, item.raise?.seeking_lead === 1 && 'Lead round', item.founding_year && `Est. ${item.founding_year}`].filter(Boolean);
  const conf = item.confidence && CONFIDENCE[item.confidence.level];

  return (
    <div className={`tp tp-s-${kind}`} style={coverStyle(item)}>
      <div className="tp-bars" aria-hidden="true">{slides.map((s, i) => <i key={s} className={i === slides.indexOf(kind) ? 'on' : ''} />)}</div>
      <span className={`tp-fit ${item.match.eligible ? '' : 'bad'}`} title="Mandate fit — alignment with your stated criteria, not a return prediction"><b />{item.match.score}% fit</span>
      {conf && <span className={`tp-conf ${conf.cls}`} title={`${item.confidence.documented}/${item.confidence.metrics} figures backed by documents`}><Icon name={conf.icon} size={13} />{conf.label}</span>}
      {kind !== 'cover' && <span className="tp-slide">{SLIDE_LABEL[kind]}</span>}

      <div className="tp-art">
        {kind === 'cover' && <Cover item={item} />}
        {kind === 'numbers' && <Numbers item={item} />}
        {kind === 'peers' && <div className="tp-panel"><div className="tp-glass flush"><PeerBars peers={item.peers} stage={item.stage} currency={cur} /></div></div>}
        {kind === 'fit' && <Fit item={item} />}
        {kind === 'diligence' && <Diligence item={item} />}
      </div>

      <div className="tp-info">
        <div className="tp-name">
          <h2>{title(item)}</h2><span className="tp-age">{stageLabel(item.stage)}</span>
          <button className="tp-i" onClick={(e) => { e.stopPropagation(); onInfo?.(); }} onPointerDown={e => e.stopPropagation()} aria-label="Open full profile">i</button>
        </div>
        {place && <div className="tp-line"><Icon name="pin" size={14} />{place}</div>}
        <div className="tp-line"><SectorIcon sector={item.industry} size={14} />{item.industry || 'Sector not disclosed'}{kind === 'cover' && item.sub_industry ? ` · ${item.sub_industry}` : ''}</div>
        {kind === 'cover' && (
          <>
            {item.overview?.text && <p className="tp-bio">{item.overview.text}</p>}
            <div className="tp-looking"><Icon name="users" size={14} />Seeking {lookingFor(item)}{item.raise?.amount != null ? <> · <b>{money(item.raise.amount, cur)}</b></> : null}</div>
            {chips.length > 0 && <div className="tp-chips">{chips.map(c => <span key={c}>{c}</span>)}</div>}
          </>
        )}
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
      <div className="tp-avatar"><span>{initials(title(item))}</span><i><SectorIcon sector={item.industry} size={18} /></i></div>
      <div className="tp-badges">{badges(item).slice(0, 3).map(([ic, t], i) => <span key={t} style={{ '--i': i }}><Icon name={ic} size={13} />{t}</span>)}</div>
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
      <div className="tp-grid">
        {f.revenue && <Tile k="Revenue" v={money(f.revenue.value, cur)} />}
        {f.growth && isNum(f.growth.value) && <Tile k="YoY growth" v={pct(f.growth.value)} />}
        {f.gross_margin && <Tile k="Gross margin" v={pct(f.gross_margin.value)} ring={f.gross_margin.value} />}
        {f.burn && <Tile k="Burn / month" v={money(f.burn.value, cur)} />}
      </div>
      {f.revenue && prior != null && (
        <div className="tp-rev">
          <div><span>Prior yr</span><i style={{ '--w': `${(prior / max) * 100}%` }} /><b>{money(prior, cur)}</b></div>
          <div className="now"><span>Latest</span><i style={{ '--w': `${(f.revenue.value / max) * 100}%` }} /><b>{money(f.revenue.value, cur)}</b></div>
        </div>
      )}
      <div className="tp-glass flush"><RunwayTimeline fin={f} raise={item.raise?.amount} currency={cur} /></div>
    </div>
  );
}

function Fit({ item }) {
  return (
    <div className="tp-panel tp-fitpanel">
      <FitRadar series={[{ label: '', color: '#ffffff', factors: item.match.factors }]} size={230} light />
      <div className="tp-fitnote">
        <b>{item.match.score}</b><span>/100 mandate fit</span>
        {item.match.exclusions.length > 0 && <em><Icon name="alert" size={13} />{item.match.exclusions[0]}</em>}
        {item.match.missing.length > 0 && <small>Limited data: {item.match.missing.join(', ')}</small>}
      </div>
    </div>
  );
}

function Diligence({ item }) {
  return (
    <div className="tp-panel">
      <div className="tp-glass flush"><ConfidenceMeter c={item.confidence} /></div>
      {item.risks?.length > 0 && (
        <div className="tp-glass"><span>Open questions</span>{item.risks.slice(0, 2).map((r, i) => <p key={i} className="tp-risk"><Icon name="alert" size={13} />{r.text}</p>)}</div>
      )}
      {item.traction?.text && <div className="tp-glass"><span>Traction</span>{item.traction.text}</div>}
      {item.raise?.use_of_funds?.text && <div className="tp-glass"><span>Use of funds</span>{item.raise.use_of_funds.text}</div>}
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

const SUGGESTED_TAGS = ['follow-up', 'strong team', 'watchlist', 'warm intro', 'needs diligence', 'too early'];

// Private notes and tags. Visible only to this investor.
export function NotesBox({ item, onSaved }) {
  const [note, setNote] = useState(item.my_note?.note || '');
  const [tags, setTags] = useState(item.my_note?.tags || []);
  const [saved, setSaved] = useState({ note: item.my_note?.note || '', tags: item.my_note?.tags || [] });
  const [custom, setCustom] = useState('');
  const [state, setState] = useState(null);
  const dirty = note !== saved.note || tags.join() !== saved.tags.join();
  const toggle = (t) => setTags(ts => (ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t].slice(0, 12)));
  const save = async () => {
    setState('saving');
    try {
      const r = await api(`/investor/notes/${item.company_id}`, { method: 'PUT', body: { note, tags } });
      setTags(r.my_note.tags);
      setSaved(r.my_note);
      setState('saved');
      onSaved?.(r.my_note);
    } catch (e) { setState(e.message || 'Could not save'); }
  };
  const all = [...new Set([...SUGGESTED_TAGS, ...tags])];
  return (
    <div className="notes">
      <textarea className="input" rows={3} maxLength={4000} value={note} onChange={e => { setNote(e.target.value); setState(null); }} placeholder="Thesis, concerns, questions for the founder…" />
      <div className="notes-tags">
        {all.map(t => <button key={t} type="button" className="chip" aria-pressed={tags.includes(t)} onClick={() => { toggle(t); setState(null); }}>{t}</button>)}
        <form onSubmit={(e) => { e.preventDefault(); const t = custom.trim().toLowerCase(); if (t) { toggle(t); setCustom(''); setState(null); } }}>
          <input className="input" value={custom} maxLength={30} onChange={e => setCustom(e.target.value)} placeholder="+ tag" aria-label="Add a custom tag" />
        </form>
      </div>
      <div className="notes-foot">
        <span className="small muted"><Icon name="shield" size={12} /> Private to you — never shared with founders, the host or other investors.</span>
        <button className="btn sm" disabled={!dirty || state === 'saving'} onClick={save}>{state === 'saving' ? 'Saving…' : state === 'saved' && !dirty ? 'Saved' : 'Save note'}</button>
      </div>
      {state && !['saving', 'saved'].includes(state) && <div className="small" style={{ color: 'var(--crit)' }}>{state}</div>}
    </div>
  );
}

// The full profile, laid out like a dating-app "about" page.
export function ProfileSheet({ item, onClose }) {
  const f = item.financials || {};
  const cur = item.currency;
  const essentials = [
    ['stairs', 'Stage', stageLabel(item.stage)],
    [null, 'Sector', [item.industry, item.sub_industry].filter(Boolean).join(' · ')],
    ['layers', 'Business model', item.business_model],
    ['calendar', 'Founded', item.founding_year],
    ['pin', 'Headquarters', item.headquarters],
    ['globe', 'Market', item.geography],
  ].filter(r => r[2]);
  const nums = [
    ['Revenue', f.revenue && money(f.revenue.value, cur)], ['Growth', f.growth && isNum(f.growth.value) && pct(f.growth.value)],
    ['Gross margin', f.gross_margin && pct(f.gross_margin.value)], ['Runway', f.runway && `${f.runway.value.toFixed(0)} mo`],
    ['Burn / mo', f.burn && money(f.burn.value, cur)], ['Cash', f.cash && money(f.cash.value, cur)],
  ].filter(r => r[1]);
  return (
    <div className="ps">
      <div className="ps-hero" style={coverStyle(item)}>
        <button className="tp-close" onClick={onClose} aria-label="Close full profile"><Icon name="down" size={18} stroke={2.2} /></button>
        <div className="tp-avatar sm"><span>{initials(title(item))}</span><i><SectorIcon sector={item.industry} size={14} /></i></div>
        <h2>{title(item)} <span>{stageLabel(item.stage)}</span></h2>
        <div className="ps-badges">{badges(item).map(([ic, t]) => <span key={t}><Icon name={ic} size={12} />{t}</span>)}</div>
      </div>

      <section className="ps-card look">
        <h4>Seeking</h4>
        <div className="ps-look"><span><Icon name="users" size={20} /></span><div><b>{item.raise?.amount != null ? money(item.raise.amount, cur) : 'Amount not disclosed'}</b><small>from {lookingFor(item)}</small></div></div>
        {item.raise?.use_of_funds?.text && <p>{item.raise.use_of_funds.text}</p>}
      </section>

      <section className="ps-card">
        <h4>My notes</h4>
        <NotesBox item={item} />
      </section>

      {(item.overview?.text || item.problem?.text) && (
        <section className="ps-card">
          <h4>About</h4>
          {item.overview?.text && <p className="ps-lead">{item.overview.text}</p>}
          {item.problem?.text && <p><span className="ps-k">Problem</span>{item.problem.text}</p>}
          {item.differentiation?.text && <p><span className="ps-k">Edge</span>{item.differentiation.text}</p>}
        </section>
      )}

      <section className="ps-card">
        <h4>Essentials</h4>
        <ul className="ps-ess">{essentials.map(([ic, k, v]) => <li key={k}><span>{ic ? <Icon name={ic} size={16} /> : <SectorIcon sector={item.industry} size={16} />}</span><div><small>{k}</small>{v}</div></li>)}</ul>
      </section>

      {nums.length > 0 && (
        <section className="ps-card">
          <h4>Numbers</h4>
          <div className="ps-nums">{nums.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>
          <RunwayTimeline fin={f} raise={item.raise?.amount} currency={cur} />
        </section>
      )}

      {item.peers && Object.keys(item.peers).length > 0 && (
        <section className="ps-card"><h4>Versus peers</h4><PeerBars peers={item.peers} stage={item.stage} currency={cur} /></section>
      )}

      <section className="ps-card"><h4>Data confidence</h4><ConfidenceMeter c={item.confidence} /></section>

      {(item.traction?.text || item.highlights?.length > 0) && (
        <section className="ps-card">
          <h4>Traction</h4>
          {item.traction?.text && <p className="ps-lead">{item.traction.text}</p>}
          {item.highlights?.map((h, i) => <p key={i}>{h.text}</p>)}
        </section>
      )}

      <section className="ps-card warn">
        <h4>Risk flags & open questions</h4>
        {item.risks?.length ? item.risks.slice(0, 4).map((r, i) => <p key={i} className="tp-risk"><Icon name="alert" size={13} />{r.text}</p>) : <p className="ps-src">None recorded at approval.</p>}
      </section>

      <section className="ps-card">
        <h4>Why it fits you · {item.match.score}%</h4>
        <div className="ps-radar"><FitRadar series={[{ label: '', color: '#3987e5', factors: item.match.factors }]} size={220} /></div>
        <FitBreakdown match={item.match} />
        <p className="ps-src">Fit measures alignment with your stated mandate only — not a prediction of returns or an endorsement.</p>
      </section>

      <Link className="ps-cta" to={`/investor/opportunities/${item.company_id}`}>Open full teaser <Icon name="external" size={15} /></Link>
    </div>
  );
}
