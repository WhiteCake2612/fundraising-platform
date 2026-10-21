// Deterministic document parsing. Spreadsheets are parsed cell-by-cell with provenance;
// text documents yield text for the LLM step plus a small set of conservative pattern matches.
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const ROW_SYNONYMS = [
  ['revenue', /^(total\s+)?(net\s+)?(revenue|revenues|sales|turnover|net sales|income from operations)$/i],
  ['cogs', /^(cogs|cost of (goods sold|sales|revenue)|direct costs)$/i],
  ['gross_profit', /^gross (profit|margin \(?\$?\)?)$/i],
  ['gross_margin', /^gross margin\s*%?$|^gm\s*%$/i],
  ['opex', /^(total\s+)?(operating expenses|opex|sg&a|overheads)$/i],
  ['ebitda', /^(adjusted\s+)?ebitda$/i],
  ['net_income', /^(net (income|profit|loss)|pat|profit after tax)$/i],
  ['cash_balance', /^(cash( and cash equivalents)?|cash balance|closing cash balance)$/i],
  ['opening_cash', /^(opening cash|cash at (the )?beginning( of (the )?period)?)$/i],
  ['closing_cash', /^(closing cash|cash at (the )?end( of (the )?period)?)$/i],
  ['operating_cash_flow', /^(net )?cash (flow )?from operating activities$|^cfo$/i],
  ['investing_cash_flow', /^(net )?cash (flow )?from investing activities$|^cfi$/i],
  ['financing_cash_flow', /^(net )?cash (flow )?from financing activities$|^cff$/i],
  ['monthly_burn', /^(net )?(monthly )?burn( rate)?( \/ month| per month)?$/i],
  ['runway_months', /^(cash )?runway( \(months\))?( months)?$/i],
  ['revenue_growth', /^(revenue )?growth( %| rate)?$|^yoy growth$/i],
  ['raise_amount', /^(amount (being )?rais(ed|ing)|raise amount|funding (required|ask)|round size)$/i],
];
const PCT = new Set(['gross_margin', 'revenue_growth']);

export function canonicalMetric(label) {
  const l = String(label || '').trim().replace(/[:*]+$/, '').replace(/\s+/g, ' ');
  for (const [k, re] of ROW_SYNONYMS) if (re.test(l)) return k;
  return null;
}

// Returns { period, projection } for header cells like FY2024, 2025E, Q3 2024, "2026 (Forecast)".
export function parsePeriod(cell) {
  if (cell === null || cell === undefined) return null;
  const s = String(cell).trim();
  const m = s.match(/^(FY\s?)?((?:Q[1-4]\s?)?(?:19|20)\d{2})\s*(A|E|F|P|B|\(?(actual|forecast|projected|budget|estimate)\)?)?$/i);
  if (!m) return null;
  const year = m[2].replace(/\s+/, ' ').toUpperCase();
  const tag = (m[3] || '').toUpperCase();
  const period = (m[1] ? 'FY' : '') + year;
  return { period, projection: /^(E|F|P|B)$|FORECAST|PROJECTED|BUDGET|ESTIMATE/.test(tag) };
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s || /^(n\/?a|-|—)$/i.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[(),$€£₹\s-]/g, '');
  let mult = 1;
  const suf = s.match(/(k|m|mn|bn|b|cr|%)$/i);
  if (suf) {
    const u = suf[1].toLowerCase();
    mult = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, cr: 1e7, '%': 0.01 }[u];
    s = s.slice(0, -suf[1].length);
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -1 : 1) * n * mult : null;
}

export function parseSpreadsheet(buffer, { category, currency, filename }) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const metrics = [];
  const textParts = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    textParts.push(`# Sheet ${sheetName}\n` + rows.slice(0, 200).map(r => r.map(c => c ?? '').join('\t')).join('\n'));
    const sheetProjection = /proj|forecast|budget|plan/i.test(sheetName);

    if (category === 'cap_table') {
      metrics.push(...parseCapTable(rows, sheetName));
      continue;
    }

    // Find the header row: the first row containing period cells (FY2024, 2025E, ...).
    let header = null, headerIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const cols = (rows[r] || []).map((c, i) => ({ i, p: parsePeriod(c) })).filter(x => x.p);
      if (cols.length >= 1) { header = cols; headerIdx = r; break; }
    }
    const currentYear = new Date().getFullYear();
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      const labelIdx = row.findIndex(c => typeof c === 'string' && c.trim());
      if (labelIdx < 0) continue;
      const metric = canonicalMetric(row[labelIdx]);
      if (!metric) continue;
      if (header && r > headerIdx) {
        for (const { i, p } of header) {
          const v = toNumber(row[i]);
          if (v === null) continue;
          const yr = Number((p.period.match(/(19|20)\d{2}/) || [])[0]);
          const projection = p.projection || sheetProjection || (category === 'financial_model' && yr > currentYear);
          metrics.push({
            metric, period: p.period, value: normalisePct(metric, v),
            unit: unitFor(metric), currency: unitFor(metric) === 'currency' ? currency : null,
            basis: projection ? 'projection' : 'historical',
            source_location: `Sheet "${sheetName}" ${XLSX.utils.encode_cell({ r, c: i })}`,
          });
        }
      } else {
        // Key/value layout: label then first numeric cell.
        const vi = row.findIndex((c, i) => i > labelIdx && toNumber(c) !== null);
        if (vi < 0) continue;
        metrics.push({
          metric, period: '', value: normalisePct(metric, toNumber(row[vi])),
          unit: unitFor(metric), currency: unitFor(metric) === 'currency' ? currency : null,
          basis: sheetProjection ? 'projection' : 'stated',
          source_location: `Sheet "${sheetName}" ${XLSX.utils.encode_cell({ r, c: vi })}`,
        });
      }
    }
  }
  return { text: textParts.join('\n\n').slice(0, 60_000), metrics };
}

function parseCapTable(rows, sheetName) {
  const out = [];
  let hdr = -1, pctCol = -1;
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const c = (rows[r] || []).findIndex(x => typeof x === 'string' && /(%|ownership|fully diluted|stake)/i.test(x));
    if (c >= 0) { hdr = r; pctCol = c; break; }
  }
  if (hdr < 0) return out;
  for (let r = hdr + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = row.find(x => typeof x === 'string' && x.trim());
    if (!name || /^total/i.test(name)) continue;
    let v = toNumber(row[pctCol]);
    if (v === null) continue;
    if (v > 1.0001) v = v / 100;
    out.push({ metric: 'ownership_pct', period: String(name).trim(), value: v, unit: 'pct', currency: null, basis: 'historical', source_location: `Sheet "${sheetName}" ${XLSX.utils.encode_cell({ r, c: pctCol })}` });
  }
  return out;
}

function unitFor(metric) {
  if (PCT.has(metric)) return 'pct';
  if (metric === 'runway_months') return 'months';
  return 'currency';
}
function normalisePct(metric, v) {
  return PCT.has(metric) && Math.abs(v) > 1.0001 ? v / 100 : v;
}

async function pdfPages(buffer) {
  const pages = [];
  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const tc = await pageData.getTextContent();
      const t = tc.items.map(i => i.str).join(' ');
      pages.push(t);
      return t;
    },
  });
  return pages;
}

async function pptxSlides(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/g).pop()) - Number(b.match(/\d+/g).pop()));
  const slides = [];
  for (const n of names) {
    const xml = await zip.files[n].async('string');
    slides.push([...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join(' '));
  }
  return slides;
}

// Conservative patterns only for unambiguous phrasing; everything else is left to the LLM step.
export function patternMetrics(pages, labelPrefix, currency) {
  const out = [];
  pages.forEach((text, idx) => {
    const loc = `${labelPrefix} ${idx + 1}`;
    const raise = text.match(/\b(?:raising|raise of|seeking)\s+(?:US)?\$\s?([\d.,]+)\s?(k|m|mn|million|bn|billion)?\b/i);
    if (raise) out.push({ metric: 'raise_amount', period: '', value: scale(raise[1], raise[2]), unit: 'currency', currency, basis: 'stated', source_location: loc, quote: raise[0] });
    const runway = text.match(/\b(\d{1,2}(?:\.\d)?)\s+months?\s+(?:of\s+)?runway\b|\brunway\s+of\s+(\d{1,2}(?:\.\d)?)\s+months?\b/i);
    if (runway) out.push({ metric: 'runway_months', period: '', value: Number(runway[1] || runway[2]), unit: 'months', currency: null, basis: 'stated', source_location: loc, quote: runway[0] });
  });
  return out;
}
function scale(num, suf) {
  const n = Number(String(num).replace(/,/g, ''));
  const s = (suf || '').toLowerCase();
  return n * ({ k: 1e3, m: 1e6, mn: 1e6, million: 1e6, bn: 1e9, billion: 1e9 }[s] || 1);
}

/** Returns { text, metrics, needsOcr } */
export async function extractDocument(filePath, { filename, category, currency }) {
  const ext = path.extname(filename).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  if (['.xlsx', '.xls', '.csv'].includes(ext)) return { ...parseSpreadsheet(buffer, { category, currency, filename }), needsOcr: false };
  if (ext === '.pdf') {
    const pages = await pdfPages(buffer);
    const text = pages.map((t, i) => `[Page ${i + 1}]\n${t}`).join('\n\n');
    const needsOcr = text.replace(/\[Page \d+\]|\s/g, '').length < 40 * Math.max(1, pages.length);
    return { text, metrics: patternMetrics(pages, 'Page', currency), needsOcr };
  }
  if (ext === '.pptx') {
    const slides = await pptxSlides(buffer);
    return { text: slides.map((t, i) => `[Slide ${i + 1}]\n${t}`).join('\n\n'), metrics: patternMetrics(slides, 'Slide', currency), needsOcr: false };
  }
  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value, metrics: patternMetrics([value], 'Document section', currency), needsOcr: false };
  }
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return { text: '', metrics: [], needsOcr: true };
  throw new Error(`Unsupported file type ${ext}`);
}
