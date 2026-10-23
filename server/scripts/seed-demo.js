// Seeds 50 fictional demo companies for testing the investor experience (discover deck, fit scores, pipeline).
// Every record is clearly synthetic: founders use @demo.test emails, websites use .example domains, and
// all figures are entered as founder input — nothing here is presented as a real company or real data.
//
//   node scripts/seed-demo.js           add the demo companies (skips any that already exist)
//   node scripts/seed-demo.js --reset   remove all demo companies and their founder accounts
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { openDb, tx } from '../src/db.js';
import { createPipeline } from '../src/services/pipeline.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb(process.env.DB_FILE || path.join(root, 'data', 'app.db'));
const DOMAIN = 'demo.test';

if (process.argv.includes('--reset')) {
  const n = db.prepare(`DELETE FROM users WHERE role='founder' AND email LIKE '%@${DOMAIN}'`).run().changes;
  console.log(`Removed ${n} demo founder accounts (companies, teasers, swipes and deals cascade).`);
  process.exit(0);
}

// Deterministic RNG so every run produces the same demo set.
let seed = 20261023;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const round = (v, step) => Math.round(v / step) * step;

// [brand, industry, sub-industry, model, city, geography, founder, one-line bio]
const COMPANIES = [
  ['Lumora', 'Fintech', 'SME lending', 'Transactional', 'Bengaluru', 'India', 'Aarav Mehta', 'Working-capital loans for kirana stores, underwritten from UPI cash flows.'],
  ['Payloft', 'Fintech', 'Payments', 'SaaS', 'London', 'United Kingdom', 'Hannah Clarke', 'Invoice-to-payment automation for agencies that bill by the hour.'],
  ['Quillstack', 'Enterprise Software', 'Legal tech', 'SaaS', 'New York', 'North America', 'Marcus Reed', 'Contract review copilot that redlines NDAs in under a minute.'],
  ['Verdana Grid', 'Climate', 'Energy storage', 'Hardware', 'Berlin', 'Europe', 'Lena Vogel', 'Second-life EV batteries repackaged as storage for small factories.'],
  ['Medisync', 'Healthcare', 'Clinic software', 'SaaS', 'Mumbai', 'India', 'Priya Nair', 'Practice management for multi-specialty clinics in tier-2 cities.'],
  ['Harvestly', 'Agritech', 'Farm inputs', 'Marketplace', 'Pune', 'India', 'Rohan Patil', 'Direct-from-manufacturer seeds and fertiliser with doorstep delivery.'],
  ['Cartwheel', 'Logistics', 'Last-mile', 'Services', 'Jakarta', 'Southeast Asia', 'Dewi Santoso', 'Electric two-wheeler fleets for same-day grocery delivery.'],
  ['Orbitly', 'Deeptech', 'Space', 'Hardware', 'Toulouse', 'Europe', 'Julien Moreau', 'Shoebox-sized satellites for crop and flood monitoring.'],
  ['Tutorloop', 'Edtech', 'Test prep', 'D2C', 'Delhi', 'India', 'Kavya Sharma', 'Live small-group coaching for engineering entrance exams.'],
  ['Brewhaus', 'Consumer', 'Beverages', 'D2C', 'Austin', 'North America', 'Tyler Brooks', 'Low-sugar craft sodas sold through subscriptions and cafés.'],
  ['Stackwise', 'Enterprise Software', 'DevOps', 'SaaS', 'San Francisco', 'North America', 'Emily Chen', 'Cloud cost alerts that open a pull request with the fix.'],
  ['Kiranet', 'Consumer', 'Retail tech', 'Marketplace', 'Hyderabad', 'India', 'Sai Reddy', 'B2B ordering app connecting neighbourhood stores to distributors.'],
  ['Nimbus Health', 'Healthcare', 'Remote monitoring', 'SaaS', 'Boston', 'North America', 'Daniel Ortiz', 'Post-surgery recovery tracking with nurse escalation.'],
  ['Freightly', 'Logistics', 'Freight brokerage', 'Marketplace', 'Dubai', 'Middle East', 'Omar Haddad', 'Spot-rate trucking marketplace across the GCC corridor.'],
  ['Solaris Rooftop', 'Climate', 'Solar', 'Services', 'Ahmedabad', 'India', 'Meera Joshi', 'Zero-upfront rooftop solar for mid-sized manufacturers.'],
  ['Pocketbook', 'Fintech', 'Personal finance', 'D2C', 'Singapore', 'Southeast Asia', 'Wei Ling Tan', 'Round-up savings that invest spare change into index funds.'],
  ['Craftory', 'Consumer', 'Home decor', 'D2C', 'Jaipur', 'India', 'Ananya Singh', 'Handmade home décor sourced directly from artisan clusters.'],
  ['Synthetica', 'Deeptech', 'AI infrastructure', 'Licensing', 'Zurich', 'Europe', 'Felix Baumann', 'Synthetic tabular data that passes privacy audits.'],
  ['Shiftboard', 'Enterprise Software', 'HR tech', 'SaaS', 'Manchester', 'United Kingdom', 'Olivia Hughes', 'Shift scheduling for hospitals and care homes.'],
  ['AquaSense', 'Agritech', 'Irrigation', 'Hardware', 'Nairobi', 'Africa', 'Brian Otieno', 'Soil-moisture sensors that switch pumps on only when needed.'],
  ['Learnhive', 'Edtech', 'Upskilling', 'SaaS', 'Bengaluru', 'India', 'Vikram Rao', 'Cohort-based data-skills courses sold to employers.'],
  ['Tasteful', 'Consumer', 'Food', 'D2C', 'Kochi', 'India', 'Neha Menon', 'Ready-to-cook regional meal kits with a 9-month shelf life.'],
  ['Clearpath', 'Fintech', 'Compliance', 'SaaS', 'Amsterdam', 'Europe', 'Sophie de Vries', 'KYC and AML checks for crypto exchanges in one API.'],
  ['Moveo', 'Logistics', 'Warehousing', 'SaaS', 'São Paulo', 'Latin America', 'Lucas Almeida', 'Warehouse slotting software that cuts picker walking time.'],
  ['Gridlock Labs', 'Deeptech', 'Cybersecurity', 'SaaS', 'Tel Aviv', 'Middle East', 'Noa Levi', 'Attack-surface mapping for operational technology networks.'],
  ['Dermalyte', 'Healthcare', 'Dermatology', 'D2C', 'Seoul', 'Global', 'Ji-woo Park', 'Teledermatology with prescription skincare shipped monthly.'],
  ['Foundry OS', 'Manufacturing', 'Factory software', 'SaaS', 'Chennai', 'India', 'Karthik Iyer', 'Shop-floor OEE tracking that runs on a tablet per machine.'],
  ['Petpal', 'Consumer', 'Pet care', 'Marketplace', 'Gurugram', 'India', 'Ishita Kapoor', 'Vet-verified pet sitters and walkers, booked by the hour.'],
  ['Ledgerline', 'Fintech', 'Accounting', 'SaaS', 'Toronto', 'North America', 'Ryan Murphy', 'Month-end close automation for venture-backed startups.'],
  ['Carbonix', 'Climate', 'Carbon accounting', 'SaaS', 'Copenhagen', 'Europe', 'Freja Nielsen', 'Scope 3 emissions tracking straight from supplier invoices.'],
  ['Rentora', 'Real Estate', 'Rentals', 'Marketplace', 'Lisbon', 'Europe', 'Tiago Costa', 'Mid-term furnished rentals for remote workers.'],
  ['Mediscan AI', 'Healthcare', 'Radiology', 'Licensing', 'Bengaluru', 'India', 'Dr. Arjun Pillai', 'Chest X-ray triage that flags urgent scans first.'],
  ['Voxa', 'Media', 'Audio', 'D2C', 'Los Angeles', 'North America', 'Maya Johnson', 'Short-form audio dramas with a pay-per-episode model.'],
  ['Tractiv', 'Agritech', 'Farm machinery', 'Transactional', 'Indore', 'India', 'Aditya Verma', 'Pay-per-acre tractor rentals booked over WhatsApp.'],
  ['Brightdesk', 'Enterprise Software', 'Customer support', 'SaaS', 'Dublin', 'Europe', 'Aoife Byrne', 'AI support inbox that drafts replies from your help docs.'],
  ['Urbanest', 'Real Estate', 'Co-living', 'Services', 'Pune', 'India', 'Siddharth Kulkarni', 'Managed co-living for students near university campuses.'],
  ['Fleetwise', 'Logistics', 'Fleet telematics', 'SaaS', 'Riyadh', 'Middle East', 'Faisal Al-Saud', 'Fuel-theft and idling alerts for truck fleets.'],
  ['Kindred Care', 'Healthcare', 'Elder care', 'Services', 'Melbourne', 'Global', 'Grace Wilson', 'In-home elder care with family updates after every visit.'],
  ['Mintable', 'Fintech', 'Wealth', 'Transactional', 'Mumbai', 'India', 'Rahul Desai', 'Fixed-income marketplace for corporate bonds from ₹10,000.'],
  ['Weavr', 'Manufacturing', 'Textiles', 'Hardware', 'Tiruppur', 'India', 'Lakshmi Sundaram', 'Retrofit kits that make old looms report output and faults.'],
  ['Spectra Bio', 'Deeptech', 'Biotech', 'Licensing', 'Cambridge', 'United Kingdom', 'Dr. James Whitfield', 'Rapid antimicrobial-resistance test that returns in 2 hours.'],
  ['Snackcraft', 'Consumer', 'Snacks', 'D2C', 'Kolkata', 'India', 'Arnab Ghosh', 'Millet-based snacks distributed through modern trade.'],
  ['Pathwise', 'Edtech', 'Career services', 'Marketplace', 'Lagos', 'Africa', 'Chiamaka Obi', 'Mentor marketplace that matches graduates with first jobs.'],
  ['Hydroloop', 'Climate', 'Water', 'Hardware', 'Chennai', 'India', 'Divya Krishnan', 'Greywater recycling units for apartment complexes.'],
  ['Quantico Labs', 'Deeptech', 'Quantum', 'Licensing', 'Waterloo', 'North America', 'Dr. Aiden Clarke', 'Error-mitigation software for today’s noisy quantum chips.'],
  ['Tradebook', 'Enterprise Software', 'Procurement', 'SaaS', 'Ho Chi Minh City', 'Southeast Asia', 'Minh Nguyen', 'Purchase-order software for garment exporters.'],
  ['Streamline Ads', 'Media', 'Ad tech', 'Transactional', 'Mumbai', 'India', 'Kabir Malhotra', 'Shoppable ads for regional-language streaming apps.'],
  ['Groundwork', 'Real Estate', 'Construction tech', 'SaaS', 'Dubai', 'Middle East', 'Layla Mansour', 'Site progress tracking from daily 360° photos.'],
  ['Veloce', 'Logistics', 'Cross-border', 'Services', 'Mexico City', 'Latin America', 'Sofía Hernández', 'Cross-border returns handling for US online retailers.'],
  ['Kosha', 'Fintech', 'Insurance', 'Transactional', 'Bengaluru', 'India', 'Tanvi Bhat', 'Embedded health insurance for gig workers, paid daily.'],
];

const STAGE_PROFILE = {
  pre_seed: { raise: [250e3, 900e3], rev: [0, 60e3], burn: [15e3, 45e3] },
  seed: { raise: [1e6, 3e6], rev: [80e3, 600e3], burn: [40e3, 120e3] },
  series_a: { raise: [4e6, 12e6], rev: [800e3, 4e6], burn: [150e3, 450e3] },
  series_b: { raise: [15e6, 35e6], rev: [4e6, 15e6], burn: [400e3, 1.2e6] },
  growth: { raise: [40e6, 80e6], rev: [20e6, 60e6], burn: [600e3, 2e6] },
};
const STAGE_MIX = ['pre_seed', 'seed', 'seed', 'seed', 'series_a', 'series_a', 'series_a', 'series_b', 'series_b', 'growth'];
const GM = { SaaS: [0.65, 0.85], Marketplace: [0.4, 0.7], Transactional: [0.35, 0.6], D2C: [0.3, 0.55], Hardware: [0.2, 0.45], Services: [0.2, 0.4], Licensing: [0.7, 0.9], Other: [0.3, 0.6] };
const USES = ['Hiring engineering and sales', 'Expansion into two new cities', 'Product development and certifications', 'Working capital and inventory', 'Go-to-market in new regions', 'Scaling manufacturing capacity'];
const TRACTION = [
  (c) => `${Math.round(between(40, 400))} paying customers; ${Math.round(between(85, 98))}% logo retention`,
  (c) => `${Math.round(between(30, 65))}% of customers buy again within 90 days`,
  (c) => `${Math.round(between(5, 60))}k monthly active users in ${c.city}`,
  (c) => `Pilots with ${Math.round(between(3, 12))} enterprise customers, ${Math.round(between(1, 4))} converted to annual contracts`,
  (c) => `Net revenue retention of ${Math.round(between(105, 140))}%`,
];

const host = db.prepare("SELECT id FROM users WHERE role='host' ORDER BY id LIMIT 1").get();
if (!host) { console.error('No host account exists yet — start the server once so it bootstraps one.'); process.exit(1); }
const pipeline = createPipeline({ db, uploadDir: path.join(root, 'data', 'uploads'), env: {}, inline: true });
const unusable = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 4); // demo founders cannot log in

let created = 0;
COMPANIES.forEach(([brand, industry, sub, model, city, geography, founder, bio], i) => {
  const email = `founder${String(i + 1).padStart(2, '0')}@${DOMAIN}`;
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return;
  const stage = pick(STAGE_MIX), p = STAGE_PROFILE[stage];
  const revenue = stage === 'pre_seed' && rnd() < 0.5 ? null : round(between(...p.rev), 1000);
  const growth = between(0.4, 2.2);
  const burn = round(between(...p.burn), 1000);
  const ctx = { city };
  const cid = tx(db, () => {
    const uid = Number(db.prepare("INSERT INTO users(email, password_hash, role, name, email_verified) VALUES (?,?,'founder',?,1)").run(email, unusable, founder).lastInsertRowid);
    const code = `DMO-${String(i + 1).padStart(4, '0')}`;
    const cid = Number(db.prepare(`INSERT INTO companies(owner_user_id, code, legal_name, brand_name, website, headquarters, industry, sub_industry, business_model,
      description, problem, solution, differentiation, market, founding_year, leadership, target_market, geography, stage, currency,
      raise_amount, round_size, use_of_funds, revenue, revenue_prior, gross_margin, cash_balance, monthly_burn, traction, seeking_lead, disclose_identity)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
      uid, code, `${brand} Technologies (Demo)`, brand, `https://${brand.toLowerCase().replace(/[^a-z]/g, '')}.example`, `${city}`,
      industry, sub, model, bio,
      `${sub} is still run on spreadsheets, phone calls and guesswork.`,
      bio, `Built by operators from the ${sub.toLowerCase()} industry, with a data advantage from day one.`,
      `${sub} in ${geography}`, 2026 - Math.floor(between(1, 7)), `${founder} (Founder & CEO)`, `${sub} buyers in ${geography}`, geography, stage, 'USD',
      round(between(...p.raise), 50e3), null, pick(USES),
      revenue, revenue ? round(revenue / (1 + growth), 1000) : null,
      revenue ? Number(between(...GM[model]).toFixed(2)) : null,
      round(burn * between(6, 24), 1000), burn, pick(TRACTION)(ctx), rnd() < 0.6 ? 1 : 0,
    ).lastInsertRowid);
    db.prepare("INSERT INTO deals(company_id, stage) VALUES (?, 'screening')").run(cid);
    return cid;
  });
  // Teasers go through the normal builder and are approved by the host, exactly as real ones are.
  const tid = pipeline.generateTeaser(cid, host.id);
  db.prepare("UPDATE teasers SET status='approved', reviewed_by=?, review_note='Demo data', reviewed_at=datetime('now', ?) WHERE id=?").run(host.id, `-${i} hours`, tid);
  pipeline.setStage(cid, 'discovery', host.id, 'Demo seed');
  created++;
});
console.log(`Seeded ${created} demo companies (${COMPANIES.length - created} already existed). Remove them with: node scripts/seed-demo.js --reset`);
