import { Link } from 'react-router-dom';
import { useApi } from '../../lib/api.js';
import { money, human } from '../../lib/format.js';
import { PageHead, Async, Stat, Status, Timeline } from '../../components/ui.jsx';

export default function FounderDashboard() {
  const q = useApi('/founder/dashboard');
  const act = useApi('/founder/activity');
  return (
    <Async q={q}>{d => (
      <>
        <PageHead kicker={`Fundraising · ${human(d.stage)}`} title={d.company.brand_name || d.company.legal_name || 'Your company'} sub={`${d.company.code} · ${d.company.industry || 'Industry not set'}`}>
          <Link className="bracket" to="/founder/company">Edit profile</Link>
        </PageHead>

        <div className="grid g-side">
          <div className="stack" style={{ gap: 24 }}>
            <section>
              <div className="section-title"><span className="label accent">Next steps</span></div>
              {d.next.length ? (
                <div className="stack" style={{ gap: 0 }}>
                  {d.next.map((n, i) => (
                    <Link key={i} to={n.to} className="row between" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)', textDecoration: 'none' }}>
                      <span className="row"><span className="display" style={{ fontSize: 28, color: 'var(--accent)', width: 40 }}>{String(i + 1).padStart(2, '0')}</span><span style={{ fontSize: 16 }}>{n.label}</span></span>
                      <span className="label">Open →</span>
                    </Link>
                  ))}
                </div>
              ) : <div className="notice">You're all caught up. The host team will be in touch as your raise progresses.</div>}
            </section>

            <div className="grid g3">
              <Stat label="Profile complete" value={`${d.completeness}%`} pct={d.completeness} />
              <Stat label="Documents" value={d.documentCount} sub={d.documents.map(x => `${x.n} ${human(x.status)}`).join(' · ') || 'None uploaded'} />
              <Stat label="Open findings" value={d.openFindings} sub="Items needing clarification" />
              <Stat label="Teaser" value={d.teaser ? `v${d.teaser.version}` : '—'} sub={d.teaser ? <Status s={d.teaser.status} /> : 'Not generated'} />
              <Stat label="Investor interest" value={d.interest} sub="Investors who expressed interest" />
              <Stat label="Introductions" value={d.introductions} sub="Approved by the host" />
            </div>

            <div className="card">
              <span className="label">Fundraising target</span>
              <div className="row between" style={{ marginTop: 8 }}>
                <span className="num l">{money(d.company.raise_amount, d.company.currency)}</span>
                <span className="muted" style={{ maxWidth: 420 }}>{d.company.use_of_funds || 'Use of proceeds not specified.'}</span>
              </div>
            </div>
          </div>
          <aside>
            <div className="section-title"><span className="label accent">Recent activity</span></div>
            <Async q={act}>{a => <Timeline dark items={a.activity.slice(0, 12)} />}</Async>
          </aside>
        </div>
      </>
    )}</Async>
  );
}
