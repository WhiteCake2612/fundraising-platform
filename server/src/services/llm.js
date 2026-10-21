// Provider-independent LLM client. Any OpenAI-compatible chat-completions endpoint works
// (Google Gemini's OpenAI-compatible endpoint, Groq, OpenRouter, a local Ollama, ...).
// Configure with LLM_BASE_URL, LLM_API_KEY, LLM_MODEL. Keys never leave the server.
import { z } from 'zod';

export class LlmNotConfigured extends Error {
  constructor(msg = 'No LLM provider is configured (set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL).') { super(msg); this.code = 'not_configured'; }
}
export class LlmError extends Error {
  constructor(msg, retryable = true) { super(msg); this.code = 'llm_error'; this.retryable = retryable; }
}

export function llmConfig(env = process.env) {
  const ok = Boolean(env.LLM_BASE_URL && env.LLM_MODEL);
  return {
    configured: ok,
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    // Confidential document text is only sent when explicitly authorised by the operator.
    allowDocumentText: env.LLM_ALLOW_DOCUMENT_TEXT === 'true',
    provider: env.LLM_PROVIDER_NAME || (ok ? new URL(env.LLM_BASE_URL).host : null),
  };
}

let transport = null; // tests can inject a fake transport
export function setLlmTransport(fn) { transport = fn; }

export async function completeJson({ system, user, schema, env = process.env }) {
  const cfg = llmConfig(env);
  if (!cfg.configured && !transport) throw new LlmNotConfigured();
  const body = {
    model: cfg.model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  let text;
  if (transport) text = await transport(body);
  else {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(env.LLM_API_KEY ? { authorization: `Bearer ${env.LLM_API_KEY}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    }).catch(e => { throw new LlmError(`LLM request failed: ${e.message}`); });
    if (res.status === 429) throw new LlmError('LLM provider rate limit or free-tier quota exceeded. Retry later.');
    if (!res.ok) throw new LlmError(`LLM provider returned HTTP ${res.status}`, res.status >= 500);
    const data = await res.json();
    text = data?.choices?.[0]?.message?.content;
  }
  if (!text) throw new LlmError('LLM returned an empty response');
  let parsed;
  try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new LlmError('LLM response was not valid JSON'); }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new LlmError(`LLM response failed schema validation: ${result.error.issues.slice(0, 3).map(i => i.path.join('.') + ' ' + i.message).join('; ')}`);
  return result.data;
}

const nullableStr = z.string().nullable().optional();
const metricItem = z.object({
  metric: z.enum(['revenue', 'cogs', 'gross_profit', 'gross_margin', 'opex', 'ebitda', 'net_income', 'cash_balance', 'monthly_burn', 'runway_months', 'revenue_growth', 'raise_amount', 'customers', 'arr', 'mrr']),
  period: z.string().default(''),
  value: z.number(),
  unit: z.enum(['currency', 'pct', 'months', 'count']).default('currency'),
  currency: nullableStr,
  basis: z.enum(['historical', 'projection', 'assumption', 'third_party', 'stated']),
  source_location: nullableStr,
  quote: nullableStr,
});

export const ExtractionSchema = z.object({
  company: z.object({
    description: nullableStr, problem: nullableStr, solution: nullableStr, differentiation: nullableStr,
    market: nullableStr, business_model: nullableStr, target_market: nullableStr, traction: nullableStr, use_of_funds: nullableStr,
  }).partial().default({}),
  metrics: z.array(metricItem).default([]),
  highlights: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
});

export const EXTRACTION_SYSTEM = `You extract facts from startup fundraising documents for an investment banking analyst.
Return ONLY JSON matching: {"company":{description,problem,solution,differentiation,market,business_model,target_market,traction,use_of_funds},"metrics":[{metric,period,value,unit,currency,basis,source_location,quote}],"highlights":[],"risks":[],"questions":[]}.
Rules:
- Only include facts explicitly stated in the text. Use null for anything not stated. Never estimate or invent numbers.
- basis: "historical" for reported actuals, "projection" for forecasts, "assumption" for model inputs, "third_party" for market estimates, "stated" for claims in a deck.
- value is a plain number in base units (e.g. 1.2M -> 1200000). Percentages as fractions (45% -> 0.45).
- period like "FY2024", "2024", "Q3 2025" or "" if not stated. For growth, period as "FY2023 → FY2024".
- source_location: page/slide/sheet reference if visible (e.g. "Page 4"). quote: the exact short phrase the number came from.
- questions: clarification questions an analyst should ask the founder about gaps or ambiguities.`;
