import { money, pct, months, stageLabel, date, human, ORIGIN, isNum } from '../lib/format.js';

const NA = <span style={{ color: '#999' }}>Not disclosed</span>;

function Txt({ f }) {
  if (!f?.text) return NA;
  return <>{f.text}<span className="origin">[{ORIGIN[f.origin] || f.origin}]</span></>;
}

function Kpi({ label, v, sub }) {
  return <div className="kpi"><small>{label}</small><b>{v}</b>{sub && <small>{sub}</small>}</div>;
}

// Standardised one-page teaser. Prints to a single A4 page (see @media print in styles.css).
export default function TeaserView({ c, anonymous }) {
  if (!c) return null;
  const f = c.financials || {};
  const cur = c.currency || 'USD';
  const title = anonymous || !c.name ? `Project ${c.code}` : c.name;
  return (
    <article className="teaser" aria-label="Investment teaser">
      <div className="t-head">
        <div>
          <h4>Investment teaser · {stageLabel(c.stage)}</h4>
          <h2>{title}</h2>
          <div style={{ color: '#7a6455' }}>{[c.industry, c.sub_industry, c.business_model, c.headquarters || c.geography, c.founding_year && `Founded ${c.founding_year}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h4>Raising</h4>
          <div className="display" style={{ fontSize: 30 }}>{money(c.raise?.amount, cur)}</div>
          <div style={{ color: '#7a6455' }}>{c.raise?.round_size ? `Round size ${money(c.raise.round_size, cur)}` : ''}{c.raise?.seeking_lead === 1 ? ' · Seeking lead' : c.raise?.seeking_lead === 0 ? ' · Lead in place' : ''}</div>
        </div>
      </div>

      <div className="t-grid">
        <div className="stack" style={{ gap: 10 }}>
          <section><h4>Company overview</h4><Txt f={c.overview} /></section>
          <div className="t-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <section><h4>Problem</h4><Txt f={c.problem} /></section>
            <section><h4>Solution</h4><Txt f={c.solution} /></section>
          </div>
          <section><h4>Market opportunity</h4><Txt f={c.market} /></section>
          <section><h4>Differentiation & competitive position</h4><Txt f={c.differentiation} /></section>
          <section><h4>Business model & revenue streams</h4><Txt f={c.revenue_model} /></section>
          <section><h4>Traction</h4><Txt f={c.traction} /></section>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <section>
            <h4>Financial highlights</h4>
            <div className="t-kpis">
              <Kpi label="Revenue" v={f.revenue ? money(f.revenue.value, cur) : '—'} sub={f.revenue?.period} />
              <Kpi label="Growth" v={f.growth && isNum(f.growth.value) ? pct(f.growth.value) : '—'} sub={f.growth?.period} />
              <Kpi label="Gross margin" v={f.gross_margin ? pct(f.gross_margin.value) : '—'} sub={f.gross_margin?.period} />
              <Kpi label="EBITDA margin" v={f.ebitda_margin ? pct(f.ebitda_margin.value) : '—'} sub={f.ebitda_margin?.period} />
              <Kpi label="Monthly burn" v={f.burn ? money(f.burn.value, cur) : '—'} />
              <Kpi label="Runway" v={f.runway ? months(f.runway.value) : '—'} sub={f.runway ? 'cash ÷ burn' : ''} />
            </div>
            <div style={{ fontSize: 9, color: '#777', marginTop: 4 }}>
              — = not disclosed. Revenue basis: {f.revenue ? human(f.revenue.basis) : 'n/a'}. Growth and runway are computed by the platform from reported figures; no projections are shown as actuals.
            </div>
          </section>
          <section><h4>Use of proceeds</h4><Txt f={c.raise?.use_of_funds} /></section>
          <section>
            <h4>Investment highlights</h4>
            {c.highlights?.length ? <ul>{c.highlights.map((h, i) => <li key={i}>{h.text}<span className="origin">[{ORIGIN[h.origin] || h.origin}]</span></li>)}</ul> : NA}
          </section>
          <section>
            <h4>Risks & open questions</h4>
            {c.risks?.length ? <ul>{c.risks.map((r, i) => <li key={i}>{r.text}<span className="origin">[{ORIGIN[r.origin] || r.origin}]</span></li>)}</ul> : <span style={{ color: '#777' }}>No open items recorded.</span>}
          </section>
        </div>
      </div>

      <div className="t-foot">
        Sources: {c.sources?.length ? c.sources.map(s => `${s.filename || human(s.category)} (v${s.version}, ${date(s.uploaded)})`).join('; ') : 'company profile only'}.
        {' '}Generated {date(c.generated_at)}. Origin tags distinguish founder statements, AI-extracted text and platform analysis. Figures are as reported by the company and have not been audited by the platform. This teaser does not constitute an offer or investment advice.
      </div>
    </article>
  );
}
