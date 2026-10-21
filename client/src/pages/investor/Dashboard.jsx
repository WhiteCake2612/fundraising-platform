import { Link } from 'react-router-dom';
import { useApi } from '../../lib/api.js';
import { PageHead, Async, Stat, Empty } from '../../components/ui.jsx';
import { money, stageLabel } from '../../lib/format.js';
import { useAuth } from '../../components/Shell.jsx';

export default function InvestorDashboard() {
  const q = useApi('/investor/dashboard');
  const { user } = useAuth();
  return (
    <Async q={q}>{d => (
      <>
        <PageHead kicker="Investor" title={user.name} sub={d.completeness < 100 ? `Mandate ${d.completeness}% complete — a fuller mandate gives more accurate fit scores.` : 'Mandate complete'}>
          {d.completeness < 100 && <Link className="bracket" to="/investor/mandate">Complete mandate</Link>}
          <Link className="btn accent" to="/investor/discover">Start discovering</Link>
        </PageHead>
        <div className="grid g3">
          <Stat label="New on mandate" value={d.counts.new} sub="Unreviewed, eligible opportunities" />
          <Stat label="Interested" value={d.counts.interested} />
          <Stat label="Saved" value={d.counts.saved} />
          <Stat label="Passed" value={d.counts.passed} />
          <Stat label="Approved intros" value={d.counts.intros_approved} />
          <Stat label="In diligence" value={d.counts.diligence} />
        </div>
        <section className="section">
          <div className="section-title"><span className="label accent">Recommended for you</span><Link className="label" to="/investor/discover">Open deck →</Link></div>
          {d.recommended.length ? (
            <div className="grid g2">
              {d.recommended.map(x => (
                <Link key={x.company_id} to={`/investor/opportunities/${x.company_id}`} className="card hover corners row between reveal" style={{ textDecoration: 'none' }}>
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="label">{stageLabel(x.stage)} · {x.industry}</span>
                    <span className="display d-s">{x.name || `Project ${x.code}`}</span>
                    <span className="small muted">Raising {money(x.raise?.amount, x.currency)}</span>
                  </div>
                  <span className="display" style={{ fontSize: 44, color: 'var(--accent)' }}>{x.match.score}</span>
                </Link>
              ))}
            </div>
          ) : <Empty title="Nothing new right now">New opportunities appear once the host approves them for discovery.</Empty>}
        </section>
        {d.recent.length > 0 && (
          <section className="section dark" style={{ padding: 28 }}>
            <span className="label accent">Newly available · last 14 days</span>
            <div className="timeline" style={{ marginTop: 16 }}>
              {d.recent.map(x => <div className="item" key={x.company_id}><div className="when">{stageLabel(x.stage)}</div><Link to={`/investor/opportunities/${x.company_id}`} style={{ color: '#eee' }}>{x.name || `Project ${x.code}`} — {x.industry}, fit {x.match.score}</Link></div>)}
            </div>
          </section>
        )}
      </>
    )}</Async>
  );
}
