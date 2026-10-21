import { useEffect, useState } from 'react';
import { useApi, api } from '../../lib/api.js';
import { useMeta } from '../../components/Shell.jsx';
import { PageHead, Async, Field, MoneyInput, Tabs, ActionMsg, useAction } from '../../components/ui.jsx';
import { stageLabel } from '../../lib/format.js';

const STEPS = [
  { key: 'company', label: '01 Company' },
  { key: 'story', label: '02 Story' },
  { key: 'raise', label: '03 Fundraising' },
  { key: 'financials', label: '04 Financials' },
];

export default function FounderCompany() {
  const q = useApi('/founder/company');
  return <Async q={q}>{d => <Form initial={d} onSaved={() => q.reload(true)} />}</Async>;
}

function Form({ initial, onSaved }) {
  const meta = useMeta();
  const [c, setC] = useState(initial.company);
  const [step, setStep] = useState('company');
  const [pctDone, setPct] = useState(initial.completeness);
  const a = useAction();
  useEffect(() => setC(initial.company), [initial]);
  const set = (k) => (e) => setC({ ...c, [k]: e?.target ? e.target.value : e });
  const fieldErr = (p) => a.error?.fields?.find(x => x.path === p)?.message;
  const text = (k, label, opts = {}) => (
    <Field label={label} hint={opts.hint} error={fieldErr(k)} full={opts.full}>
      {opts.area ? <textarea className="input" value={c[k] ?? ''} onChange={set(k)} /> : <input className="input" value={c[k] ?? ''} onChange={set(k)} placeholder={opts.ph} />}
    </Field>
  );
  const select = (k, label, options, labels = {}) => (
    <Field label={label} error={fieldErr(k)}>
      <select className="input" value={c[k] ?? ''} onChange={e => setC({ ...c, [k]: e.target.value || null })}>
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{labels[o] || o}</option>)}
      </select>
    </Field>
  );
  const money = (k, label, hint) => <Field label={`${label} (${c.currency})`} hint={hint} error={fieldErr(k)}><MoneyInput value={c[k]} onChange={v => setC({ ...c, [k]: v })} /></Field>;

  const save = async () => {
    const keys = ['legal_name', 'brand_name', 'website', 'headquarters', 'industry', 'sub_industry', 'business_model', 'description', 'problem', 'solution', 'differentiation', 'market', 'leadership', 'product', 'target_market', 'geography', 'stage', 'currency', 'raise_amount', 'round_size', 'use_of_funds', 'previous_rounds', 'existing_investors', 'revenue', 'revenue_prior', 'gross_margin', 'cash_balance', 'monthly_burn', 'runway_months', 'traction', 'seeking_lead', 'founding_year'];
    const body = {};
    for (const k of keys) {
      let v = c[k];
      if (v === '' || v === undefined) v = null;
      if (k === 'founding_year' && v !== null) v = Number(v);
      if (k === 'seeking_lead' && v !== null) v = Number(v);
      body[k] = v;
    }
    body.currency = c.currency || 'USD';
    const r = await a.run(() => api('/founder/company', { method: 'PUT', body }), 'Saved.').catch(() => null);
    if (r) { setPct(r.completeness); onSaved(); }
  };

  if (!meta) return null;
  return (
    <>
      <PageHead kicker="Company profile" title="Your company" sub={`${pctDone}% complete · required: legal name, industry, model, description, stage, raise, use of funds, geography, HQ, founding year`}>
        <button className="btn" onClick={save} disabled={a.busy}>{a.busy ? 'Saving…' : 'Save profile'}</button>
      </PageHead>
      <Tabs tabs={STEPS} value={step} onChange={setStep} />
      <div className="stack" style={{ gap: 20 }}>
        {step === 'company' && (
          <div className="form-grid">
            {text('legal_name', 'Legal company name')}
            {text('brand_name', 'Brand name')}
            {text('website', 'Website', { ph: 'https://' })}
            {text('headquarters', 'Headquarters', { ph: 'City, Country' })}
            {select('industry', 'Industry', meta.sectors)}
            {text('sub_industry', 'Sub-industry')}
            {select('business_model', 'Business model', meta.businessModels)}
            <Field label="Founding year" error={fieldErr('founding_year')}><input className="input" type="number" min="1900" max="2100" value={c.founding_year ?? ''} onChange={set('founding_year')} /></Field>
            {select('geography', 'Primary geography', meta.geographies)}
            {text('target_market', 'Target market / customers')}
            {text('leadership', 'Founders & leadership', { area: true, full: true, hint: 'Names, roles and relevant background' })}
          </div>
        )}
        {step === 'story' && (
          <div className="form-grid">
            {text('description', 'Company description', { area: true, full: true })}
            {text('problem', 'Problem', { area: true })}
            {text('solution', 'Solution', { area: true })}
            {text('product', 'Product or service', { area: true })}
            {text('differentiation', 'Differentiation & competition', { area: true })}
            {text('market', 'Market opportunity', { area: true, full: true, hint: 'If you cite a market size, name the source — it will be shown as a third-party estimate.' })}
            {text('traction', 'Customer / commercial traction', { area: true, full: true })}
          </div>
        )}
        {step === 'raise' && (
          <div className="form-grid">
            {select('stage', 'Current funding stage', meta.stages, Object.fromEntries(meta.stages.map(s => [s, stageLabel(s)])))}
            <Field label="Reporting currency"><select className="input" value={c.currency} onChange={set('currency')}>{['USD', 'EUR', 'GBP', 'INR', 'SGD', 'AED'].map(x => <option key={x}>{x}</option>)}</select></Field>
            {money('raise_amount', 'Amount being raised')}
            {money('round_size', 'Target round size', 'Total round including other participants, if different')}
            <Field label="Lead investor"><select className="input" value={c.seeking_lead ?? ''} onChange={e => setC({ ...c, seeking_lead: e.target.value === '' ? null : Number(e.target.value) })}><option value="">Not specified</option><option value="1">Seeking a lead</option><option value="0">Lead already in place</option></select></Field>
            <div />
            {text('use_of_funds', 'Proposed use of funds', { area: true, full: true, hint: 'e.g. Engineering 45%, Sales 35%, Working capital 20%' })}
            {text('previous_rounds', 'Previous funding rounds', { area: true })}
            {text('existing_investors', 'Existing investors (if disclosable)', { area: true })}
          </div>
        )}
        {step === 'financials' && (
          <>
            <div className="notice">These are your own stated figures. Figures extracted from uploaded statements are kept separately with their source, and any differences are raised as findings for clarification.</div>
            <div className="form-grid">
              {money('revenue', 'Revenue — latest 12 months')}
              {money('revenue_prior', 'Revenue — prior 12 months')}
              <Field label="Gross margin (%)" error={fieldErr('gross_margin')}><input className="input" type="number" step="0.1" value={c.gross_margin == null ? '' : +(c.gross_margin * 100).toFixed(2)} onChange={e => setC({ ...c, gross_margin: e.target.value === '' ? null : Number(e.target.value) / 100 })} /></Field>
              {money('cash_balance', 'Current cash balance')}
              {money('monthly_burn', 'Net monthly burn')}
              <Field label="Stated runway (months)"><input className="input" type="number" step="0.5" value={c.runway_months ?? ''} onChange={e => setC({ ...c, runway_months: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            </div>
          </>
        )}
        <ActionMsg a={a} />
        <div className="row between">
          <button className="btn ghost" disabled={step === STEPS[0].key} onClick={() => setStep(STEPS[STEPS.findIndex(s => s.key === step) - 1].key)}>Back</button>
          <div className="row">
            <button className="btn ghost" onClick={save} disabled={a.busy}>Save</button>
            {step !== STEPS.at(-1).key && <button className="btn" onClick={async () => { await save(); setStep(STEPS[STEPS.findIndex(s => s.key === step) + 1].key); }}>Save & continue</button>}
          </div>
        </div>
      </div>
    </>
  );
}
