export const STAGES = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c_plus', 'growth'];
export const STAGE_LABELS = {
  pre_seed: 'Pre-Seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B',
  series_c_plus: 'Series C+', growth: 'Growth',
};

export const SECTORS = [
  'Fintech', 'Healthcare', 'Enterprise Software', 'Consumer', 'Deeptech', 'Climate',
  'Manufacturing', 'Logistics', 'Edtech', 'Agritech', 'Media', 'Real Estate', 'Other',
];
export const BUSINESS_MODELS = ['SaaS', 'Marketplace', 'Transactional', 'D2C', 'Hardware', 'Services', 'Licensing', 'Other'];
export const GEOGRAPHIES = ['India', 'Southeast Asia', 'Middle East', 'Europe', 'United Kingdom', 'North America', 'Latin America', 'Africa', 'Global'];
export const INVESTOR_TYPES = ['angel', 'family_office', 'vc_fund', 'corporate', 'private_equity', 'other'];
// Optional reasons an investor can attach to a pass. Used for the investor's own analytics and host insight.
export const PASS_REASONS = {
  too_early: 'Too early', too_late: 'Too late / too big', sector: 'Sector or model', ticket: 'Ticket or round size',
  geography: 'Geography', traction: 'Not enough traction', market: 'Market size', competition: 'Competition',
  more_info: 'Need more information', other: 'Other',
};
export const LEAD_PREFS = ['lead', 'co_invest', 'follow_on', 'any'];

export const DOC_CATEGORIES = [
  'pitch_deck', 'financial_statements', 'financial_model', 'balance_sheet', 'profit_and_loss',
  'cash_flow', 'cap_table', 'fundraising_materials', 'business_plan', 'market_research', 'other',
];

export const ALLOWED_EXT = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.pptx', '.png', '.jpg', '.jpeg'];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Initial defaults only — host can reconfigure in Settings.
export const DEFAULT_WEIGHTS = { stage: 25, sector: 25, ticket: 20, geography: 10, traction: 10, other: 10 };

export const DEFAULT_STAGES = [
  { key: 'registered', label: 'Founder registered' },
  { key: 'profile_incomplete', label: 'Company profile incomplete' },
  { key: 'documents_received', label: 'Documents received' },
  { key: 'ai_processing', label: 'AI processing' },
  { key: 'awaiting_clarification', label: 'Awaiting founder clarification' },
  { key: 'screening', label: 'Initial screening' },
  { key: 'teaser_pending', label: 'Teaser pending approval' },
  { key: 'discovery', label: 'Approved for investor discovery' },
  { key: 'interest_received', label: 'Investor interest received' },
  { key: 'intro_pending', label: 'Introduction pending' },
  { key: 'intro_completed', label: 'Introduction completed' },
  { key: 'due_diligence', label: 'Due diligence' },
  { key: 'negotiation', label: 'Term sheet / negotiations' },
  { key: 'closed_funded', label: 'Closed — funded', terminal: true },
  { key: 'closed_lost', label: 'Closed — not proceeding', terminal: true },
  { key: 'on_hold', label: 'On hold' },
];

// Stages from which a company is visible in investor discovery.
export const DISCOVERABLE_STAGES = ['discovery', 'interest_received', 'intro_pending', 'intro_completed', 'due_diligence', 'negotiation'];
