import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../lib/api.js';
import { useMeta } from '../../components/Shell.jsx';
import { Async } from '../../components/ui.jsx';
import { MarketMap, FitColumns, DecisionMix, SimpleBars, Funnel, DECISION } from '../../components/charts.jsx';
import { money, pct, stageLabel } from '../../lib/format.js';

// Deal-flow analytics shown on the investor overview: built from the live deck and the investor's own decisions.
export default function InvestorAnalytics() {
  const q = useApi('/investor/analytics');
  const meta = useMeta();
  const nav = useNavigate();
  const [sector, setSector] = useState('');
  const [stage, setStage] = useState('');
  const [mixBy, setMixBy] = useState('sector');
  return (
    <Async q={q}>{d => {
      const pts = d.map.filter(p => (!sector || p.industry === sector) && (!stage || p.stage === stage));
      return (
        <section className="section analytics">
          <div className="section-title"><span className="label accent">Deal-flow analytics</span><span className="small muted">Live deck + your decisions · fit is mandate alignment, not a return forecast</span></div>

          <div className="grid g4">
            {['interested', 'saved', 'passed', 'deck'].map(k => (
              <div key={k} className="stat an-stat">
                <span className="label"><i style={{ background: DECISION[k].color }} />Avg fit · {DECISION[k].label.toLowerCase()}</span>
                <span className="num">{d.avgFit[k === 'deck' ? 'deck' : k] ?? '—'}</span>
              </div>
            ))}
          </div>

          <div className="card an-card">
            <div className="row between an-head">
              <h3>Market map</h3>
              <div className="row">
                <select className="input" style={{ width: 'auto' }} value={sector} onChange={e => setSector(e.target.value)} aria-label="Sector"><option value="">All sectors</option>{(meta?.sectors || []).map(s => <option key={s}>{s}</option>)}</select>
                <select className="input" style={{ width: 'auto' }} value={stage} onChange={e => setStage(e.target.value)} aria-label="Stage"><option value="">All stages</option>{(meta?.stages || []).map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}</select>
              </div>
            </div>
            <MarketMap points={pts} onOpen={(id) => nav(`/investor/opportunities/${id}`)} />
            <details className="an-table">
              <summary>View as table</summary>
              <div className="table-wrap"><table>
                <thead><tr><th>Company</th><th>Sector</th><th>Stage</th><th>Revenue</th><th>Growth</th><th>Raising</th><th>Fit</th><th>Decision</th></tr></thead>
                <tbody>{pts.map(p => <tr key={p.company_id}><td>{p.name}</td><td>{p.industry}</td><td>{stageLabel(p.stage)}</td><td>{money(p.revenue, p.currency)}</td><td>{p.growth == null ? '—' : pct(p.growth)}</td><td>{money(p.raise, p.currency)}</td><td>{p.score}</td><td>{DECISION[p.swipe || 'deck'].label}</td></tr>)}</tbody>
              </table></div>
            </details>
          </div>

          <div className="grid g2">
            <div className="card an-card"><h3>My pipeline</h3><Funnel steps={d.funnel} /></div>
            <div className="card an-card"><h3>Fit-score distribution</h3><FitColumns bins={d.fitBins} /></div>
          </div>

          <div className="grid g2">
            <div className="card an-card">
              <div className="row between an-head">
                <h3>Decisions by {mixBy}</h3>
                <div className="seg" role="tablist">{['sector', 'stage'].map(k => <button key={k} role="tab" aria-selected={mixBy === k} onClick={() => setMixBy(k)}>{k}</button>)}</div>
              </div>
              <DecisionMix rows={mixBy === 'sector' ? d.bySector : d.byStage} label={mixBy === 'stage' ? stageLabel : undefined} />
            </div>
            <div className="card an-card"><h3>Why I pass</h3><SimpleBars rows={d.passReasons} empty="No pass reasons recorded yet. Pick one after passing to see your patterns here." /></div>
          </div>
        </section>
      );
    }}</Async>
  );
}
