# RAISE01 — AI-assisted fundraising & deal-discovery platform

A lightweight investment-banking operating system with three portals:

- **Founder portal**: company profile, private data room, extracted figures, findings to clarify, one-page teaser, investor interest.
- **Investor portal**: mandate, swipe-based discovery ranked by explainable mandate fit, shortlist, introductions.
- **Host control room**: users, deal pipeline (Kanban + table), teaser approvals, findings review, introductions and disclosure, data-room grants, audit log, settings, CSV exports.

The visual direction follows the reference video: an off-white editorial canvas, heavy condensed display caps (Anton), small tracked mono labels, one teal accent, and dark timeline sections.

## Run locally

Requires Node 22.5+ (uses the built-in `node:sqlite`).

```bash
cd server && npm install && cd ../client && npm install && npm run build && cd ..
```

`server/.env` is already created with a random `SESSION_SECRET` and a local host account (`HOST_EMAIL` / `HOST_PASSWORD`). The host account is created on first start.

```bash
npm --prefix server run dev
```

Open http://localhost:4000. For frontend hot reload, also run `npm --prefix client run dev` and use http://localhost:5173 (it proxies `/api` to port 4000).

Tests:

```bash
npm --prefix server test
```

### Demo data (optional)

To try the investor deck without onboarding founders, seed 50 fictional companies (founders on `@demo.test`, websites on `.example`, all figures marked as founder input, teasers approved through the normal builder):

```bash
npm --prefix server run seed:demo
```

Remove them again with `node server/scripts/seed-demo.js --reset`. Never run this against a production database.

## Architecture

| Layer | Implementation |
|---|---|
| Frontend | React 18 + React Router, Vite, plain CSS design tokens (`client/src/styles.css`) |
| API | Express 5 (`server/src/app.js`, routes per role in `server/src/routes/`) |
| Database | SQLite via `node:sqlite`, with foreign keys, unique constraints, indexes and transactions (`server/src/db.js`) |
| Auth | bcrypt password hashes, JWT in an httpOnly SameSite cookie, the user reloaded from the DB on every request (so suspension takes effect immediately), CSRF header check, rate limiting on auth routes |
| Documents | Private disk storage under `server/data/uploads` with random names, extension + magic-byte validation, SHA-256 dedupe, versioning. Downloads need a short-lived HMAC-signed URL bound to the user **and** a live permission re-check |
| Extraction | `services/extraction.js`: XLSX/CSV parsed cell by cell with sheet/cell provenance and historical/projection basis; PDF (per page), PPTX (per slide) and DOCX text extracted for the AI step; conservative pattern matches for unambiguous phrases |
| LLM | `services/llm.js`: provider-independent, OpenAI-compatible chat completions, JSON output validated with zod. Retryable and idempotent jobs (`ai_jobs` keyed by document hash) |
| Finance engine | `services/finance.js`: deterministic growth, margins, runway, EBITDA bridge, cash roll-forward, cap table and cross-document reconciliation, with rounding tolerance and currency checks. No LLM arithmetic |
| Matching | `services/matching.js`: weighted rules (host-configurable), hard exclusions, partial credit and confidence for missing data, a per-factor explanation |
| Pipeline | `services/pipeline.js`: extraction → AI enrichment → reconciliation → stage automation. Automatic transitions only move forward through the screening stages; release, intros and closing are host decisions |

## How the requirements are met

- **No fabrication.** Missing values stay `null` and render as "Not disclosed". The teaser tags every narrative field with its origin (Founder, AI-extracted, Host edited, Platform analysis). Growth and runway are computed only from reported figures.
- **Findings** carry an ID, severity, category, metric, both values and sources (sheet/cell or page), period, units, method, a neutral explanation, a clarification question, status and history. Wording is "requires clarification", never "fraud".
- **Interest is not commitment.** A right swipe creates a pending introduction for host review. It discloses nothing by itself. The dashboard reports stated raise, committed and funded capital separately.
- **Disclosure.** Investors see an anonymised project code until the host discloses the company globally or per introduction. Founders see investor identities only when the host enables it per introduction. Documents are shared only by explicit grants after an approved introduction, and grants are revocable.

## Integration status

| Integration | Status | To enable |
|---|---|---|
| LLM extraction | **Not configured** | Set `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` in `server/.env` (any OpenAI-compatible endpoint, e.g. Google Gemini's OpenAI-compatible endpoint, Groq or OpenRouter). Also set `LLM_ALLOW_DOCUMENT_TEXT=true` once you have checked the provider's privacy, data-retention and commercial-use terms. Free-tier limits and terms were not verified in this build; check them before choosing a provider |
| Email (verification / reset) | **Not configured** | Messages are queued in `email_outbox` (visible under Host → Audit → Email outbox). Connect an SMTP or email API sender |
| OCR for scanned PDFs / images | **Not configured** | Such documents are marked "needs attention", never silently skipped |
| Malware scanning | **Not configured** | Uploads are type- and magic-byte-checked only. Add ClamAV or a cloud scanner before production |
| Object storage | Local disk | Swap `uploadDir` for S3/GCS with private buckets and presigned URLs for production |

## Phase report

**Implemented:** Phase 1 in full. Phase 2: deterministic extraction, reconciliation, missing-information detection, teaser generation, founder corrections, explainable scoring, and the LLM integration boundary. Phase 3: Kanban + table pipeline, introductions, disclosure controls, data-room grants, activity timelines, internal notes, follow-ups, info requests, notifications, and the founder and investor dashboards.

**Tests (31 passing):** financial formulas against known examples, every reconciliation rule, the spreadsheet parser, matching weights and exclusions, and an end-to-end API workflow. That workflow covers registration and roles, CSRF, upload validation, founder isolation, signed-URL binding and expiry, host-only operations, discovery gating, teaser approval, swipe persistence and idempotency, undo, intro-gated document access and revocation, stage transitions and closing rules, suspension, and failed or retried AI calls.

**Known limitations / next steps**
- Background jobs run in-process. Use a queue (e.g. BullMQ, pg-boss) for multi-instance deployments.
- SQLite suits a single server. Migrate to Postgres for production, and add backups and a retention / account-deletion job.
- Phase 4 items (advanced model validation, sector research, secure data-room viewer, extra providers) are not started.
- Teaser PDF export uses the browser print dialog with A4 print CSS. Server-side PDF rendering is not implemented.
