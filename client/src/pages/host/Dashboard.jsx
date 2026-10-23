import { Link } from 'react-router-dom';
import { useApi } from '../../lib/api.js';
import { PageHead, Async, Stat } from '../../components/ui.jsx';
import { money, ago, stageLabel, human } from '../../lib/format.js';
import { useMeta } from '../../components/Shell.jsx';

function Bars({ rows, label = (k) => k }) {
  const max = Math.max(1, ...rows.map(r => r.n));
  if (!rows.length) return <div className="small muted">No data yet.</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map(r => (
        <div key={r.k || r.key} className="stack" style={{ gap: 4 }}>
          <div className="row between small"><span>{label(r.k ?? r.label)}</span><span className="mono">{r.n}</span></div>
          <div className="bar"><i style={{ width: `${(r.n / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function HostDashboard() {
  const q = useApi('/host/dashboard');
  const meta = useMeta();
  return (
    <Async q={q} rows={6}>{d => {
      const sev = Object.fromEntries(d.findings.map(f => [f.k, f.n]));
      return (
        <>
          <PageHead kicker="Host control room" title="Overview" sub="All figures are live counts from platform records. Hover a capital figure for its definition.">
            <a className="btn ghost" href="/api/host/export/deals.csv">Export deals</a>
            <a className="btn ghost" href="/api/host/export/interest.csv">Export interest</a>
          </PageHead>

          <div className="grid g4">
            <Stat label="Founders" value={d.users.founders} sub={`${d.users.active30} active users (30d) · ${d.users.inactive} inactive`} />
            <Stat label="Investors" value={d.users.investors} sub={`${d.users.suspended} suspended / deactivated`} />
            <div title={d.definitions.stated_raise}><Stat label="Stated raise — open deals" value={money(d.capital.stated_raise)} sub="Founder-stated. Not committed." /></div>
            <div title={`${d.definitions.committed} / ${d.definitions.funded}`}><Stat label="Committed / funded" value={`${money(d.capital.committed)} / ${money(d.capital.funded)}`} sub="Recorded by host on deal records" /></div>
          </div>

          <section className="section">
            <div className="section-title"><span className="label accent">Work queue</span></div>
            <div className="grid g3">
              <QueueLink to="/host/teasers" n={d.queue.teasers_pending} label="Teasers awaiting approval" />
              <QueueLink to="/host/introductions" n={d.queue.intros_pending} label="Introductions pending" />
              <QueueLink to="/host/pipeline?q=" n={d.queue.analyses_review} label="Analyses with founder responses to review" />
              <QueueLink to="/host/pipeline" n={d.queue.failed_docs} label="Documents needing attention" />
              <QueueLink to="/host/pipeline?sort=due" n={d.queue.overdue} label="Overdue follow-ups" />
              <QueueLink to="/host/pipeline" n={d.queue.open_requests} label="Open information requests" />
            </div>
          </section>

          <div className="grid g3 section">
            <div className="card"><h3>Open findings by severity</h3>
              <div className="row" style={{ gap: 20 }}>{['critical', 'high', 'medium', 'low'].map(s => <div key={s} className="stack" style={{ gap: 2 }}><span className="num">{sev[s] || 0}</span><span className={`badge b-${s === 'critical' ? 'crit' : s === 'medium' ? 'med' : s}`}>{s}</span></div>)}</div>
            </div>
            <div className="card" title={d.definitions.interest}><h3>Investor activity</h3>
              <div className="row" style={{ gap: 24 }}>
                <div><span className="num">{d.interest.total}</span><div className="label">Interested</div></div>
                <div><span className="num">{d.interest.saves}</span><div className="label">Saved</div></div>
                <div><span className="num">{d.interest.passes}</span><div className="label">Passed</div></div>
              </div>
            </div>
            <div className="card"><h3>Introductions & deals</h3>
              <div className="row" style={{ gap: 24 }}>
                <div><span className="num">{d.intros.pending}</span><div className="label">Pending</div></div>
                <div><span className="num">{d.intros.completed}</span><div className="label">Completed</div></div>
                <div><span className="num">{d.deals.diligence}</span><div className="label">In DD</div></div>
                <div><span className="num">{d.deals.closed_funded}</span><div className="label">Funded</div></div>
              </div>
            </div>
          </div>

          <div className="grid g3 section">
            <div className="card"><h3>Pipeline conversion</h3><p className="small muted">Deals currently at or beyond each milestone (excluding lost / on hold).</p><Bars rows={d.funnel} /></div>
            <div className="card"><h3>Companies by round</h3><Bars rows={d.byRoundStage} label={stageLabel} /></div>
            <div className="card"><h3>Companies by industry</h3><Bars rows={d.byIndustry} /></div>
          </div>

          <div className="grid g2 section">
            <div className="card"><h3>Why investors pass</h3><p className="small muted">Optional reasons investors gave when passing. Use it to coach founders and tune what reaches discovery.</p><Bars rows={d.passReasons || []} label={k => meta?.passReasons?.[k] || human(k)} /></div>
          </div>

          <div className="grid g2 section">
            <div className="card"><h3>Most interest</h3>
              {d.interest.top.length ? d.interest.top.map(t => <Link key={t.id} to={`/host/deals/${t.id}`} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', textDecoration: 'none' }}><span>{t.name}</span><span className="mono">{t.n}</span></Link>) : <div className="small muted">No interest recorded yet.</div>}
            </div>
            <div className="dark card frame" style={{ padding: 24 }}>
              <span className="label accent">Live activity</span>
              <div className="timeline" style={{ marginTop: 12 }}>
                {d.recent.map(a => <div className="item" key={a.id}><div className="when">{ago(a.created_at)}{a.company ? ` · ${a.company}` : ''}</div>{a.company_id ? <Link to={`/host/deals/${a.company_id}`} style={{ color: '#ddd' }}>{a.summary}</Link> : a.summary}</div>)}
              </div>
            </div>
          </div>
          <p className="small muted section">Registrations in the last 30 days: {d.registrations.reduce((s, r) => s + r.n, 0)} ({d.registrations.filter(r => r.role === 'founder').reduce((s, r) => s + r.n, 0)} founders, {d.registrations.filter(r => r.role === 'investor').reduce((s, r) => s + r.n, 0)} investors). Pipeline states: {d.byPipeline.map(p => `${human(p.k)} ${p.n}`).join(' · ') || 'none'}.</p>
        </>
      );
    }}</Async>
  );
}

function QueueLink({ to, n, label }) {
  return (
    <Link to={to} className="stat corners" style={{ textDecoration: 'none', borderLeft: n ? '3px solid var(--accent)' : undefined }}>
      <span className="num">{n}</span><span className="label">{label}</span>
    </Link>
  );
}
