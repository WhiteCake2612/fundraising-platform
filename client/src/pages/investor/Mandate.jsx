import { useEffect, useState } from 'react';
import { useApi, api } from '../../lib/api.js';
import { useMeta } from '../../components/Shell.jsx';
import { PageHead, Async, Field, Chips, MoneyInput, ActionMsg, useAction } from '../../components/ui.jsx';
import { STAGE_LABELS, human } from '../../lib/format.js';

export default function InvestorMandate() {
  const q = useApi('/investor/mandate');
  return <Async q={q}>{d => <Form d={d} onSaved={() => q.reload(true)} />}</Async>;
}

function Form({ d, onSaved }) {
  const meta = useMeta();
  const [m, setM] = useState(d.mandate);
  const [pct, setPct] = useState(d.completeness);
  const a = useAction();
  useEffect(() => setM(d.mandate), [d]);
  const fieldErr = (p) => a.error?.fields?.find(x => x.path === p)?.message;
  if (!meta) return null;
  const set = (k) => (v) => setM({ ...m, [k]: v?.target ? v.target.value : v });
  const save = async () => {
    const keys = ['firm', 'title', 'website', 'bio', 'investor_type', 'sectors', 'business_models', 'stages', 'excluded_stages', 'geographies', 'ticket_min', 'ticket_max', 'round_min', 'round_max', 'lead_preference', 'min_revenue', 'requires_revenue', 'requires_profitability', 'other_criteria'];
    const body = Object.fromEntries(keys.map(k => [k, m[k] === '' ? null : m[k]]));
    body.requires_revenue = m.requires_revenue ? 1 : 0;
    body.requires_profitability = m.requires_profitability ? 1 : 0;
    const r = await a.run(() => api('/investor/mandate', { method: 'PUT', body }), 'Mandate saved. Your discovery feed has been re-scored.').catch(() => null);
    if (r) { setPct(r.completeness); onSaved(); }
  };
  return (
    <>
      <PageHead kicker={`Investment mandate · ${pct}% complete`} title="Mandate">
        <button className="btn" onClick={save} disabled={a.busy}>{a.busy ? 'Saving…' : 'Save mandate'}</button>
      </PageHead>
      <div className="stack" style={{ gap: 28 }}>
        <section className="form-grid">
          <Field label="Firm / entity"><input className="input" value={m.firm ?? ''} onChange={set('firm')} /></Field>
          <Field label="Your title"><input className="input" value={m.title ?? ''} onChange={set('title')} /></Field>
          <Field label="Investor type"><select className="input" value={m.investor_type ?? ''} onChange={e => setM({ ...m, investor_type: e.target.value || null })}><option value="">Select…</option>{meta.investorTypes.map(t => <option key={t} value={t}>{human(t)}</option>)}</select></Field>
          <Field label="Lead / co-invest preference"><select className="input" value={m.lead_preference ?? ''} onChange={e => setM({ ...m, lead_preference: e.target.value || null })}><option value="">Select…</option>{meta.leadPrefs.map(t => <option key={t} value={t}>{human(t)}</option>)}</select></Field>
        </section>
        <section className="stack"><span className="label accent">Sectors</span><Chips options={meta.sectors} value={m.sectors} onChange={set('sectors')} /></section>
        <section className="stack"><span className="label accent">Business models</span><Chips options={meta.businessModels} value={m.business_models} onChange={set('business_models')} /></section>
        <section className="grid g2">
          <div className="stack"><span className="label accent">Target stages</span><Chips options={meta.stages} labels={STAGE_LABELS} value={m.stages} onChange={set('stages')} /></div>
          <div className="stack"><span className="label" style={{ color: 'var(--crit)' }}>Excluded stages (hard exclusion)</span><Chips variant="x" options={meta.stages} labels={STAGE_LABELS} value={m.excluded_stages} onChange={set('excluded_stages')} />{fieldErr('excluded_stages') && <small className="err">{fieldErr('excluded_stages')}</small>}</div>
        </section>
        <section className="stack"><span className="label accent">Geographies</span><Chips options={meta.geographies} value={m.geographies} onChange={set('geographies')} /></section>
        <section className="form-grid">
          <Field label="Minimum ticket (USD)" hint="Rounds smaller than this are excluded"><MoneyInput value={m.ticket_min} onChange={set('ticket_min')} /></Field>
          <Field label="Maximum ticket (USD)" error={fieldErr('ticket_max')}><MoneyInput value={m.ticket_max} onChange={set('ticket_max')} /></Field>
          <Field label="Preferred round size — min (USD)"><MoneyInput value={m.round_min} onChange={set('round_min')} /></Field>
          <Field label="Preferred round size — max (USD)" error={fieldErr('round_max')}><MoneyInput value={m.round_max} onChange={set('round_max')} /></Field>
          <Field label="Minimum annual revenue (USD)"><MoneyInput value={m.min_revenue} onChange={set('min_revenue')} /></Field>
          <div className="stack" style={{ justifyContent: 'flex-end' }}>
            <label className="row small"><input type="checkbox" checked={!!m.requires_revenue} onChange={e => setM({ ...m, requires_revenue: e.target.checked ? 1 : 0 })} /> Revenue-generating companies only</label>
            <label className="row small"><input type="checkbox" checked={!!m.requires_profitability} onChange={e => setM({ ...m, requires_profitability: e.target.checked ? 1 : 0 })} /> Profitable (EBITDA-positive) only</label>
          </div>
          <Field label="Other criteria" full><textarea className="input" value={m.other_criteria ?? ''} onChange={set('other_criteria')} /></Field>
        </section>
        <ActionMsg a={a} />
        <div><button className="btn" onClick={save} disabled={a.busy}>Save mandate</button></div>
      </div>
    </>
  );
}
