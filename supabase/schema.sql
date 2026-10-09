-- Merry Cleaners - Supabase (Postgres) schema
--
-- Run this once in the Supabase SQL editor, then put SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY in your .env file. The application switches
-- from the local JSON file to Postgres automatically once both are set.
--
-- Row Level Security is enabled with no public policies: the only access
-- is through the service-role key, which lives on the server. Nothing in
-- the browser can read or write these tables directly.

create table if not exists leads (
  id                text primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  name              text,
  email             text,
  phone             text,
  address           text,
  postcode          text,
  property_type     text,
  bedrooms          integer,
  floor_area_sqft   numeric,
  service_type      text,
  addons            jsonb not null default '[]'::jsonb,
  preferred_date    text,
  segment           text not null default 'unknown',
  source            text not null default 'other',
  status            text not null default 'new',
  quote_low         numeric,
  quote_high        numeric,
  notes             text,
  lawful_basis      text not null default 'legitimate_interest',
  marketing_consent boolean not null default false,
  consent_text      text,
  followup_stage    integer not null default 0,
  next_followup_at  timestamptz,
  followup_paused   boolean not null default false
);

create index if not exists leads_status_idx on leads (status);
create index if not exists leads_created_idx on leads (created_at desc);
create index if not exists leads_followup_idx on leads (next_followup_at)
  where followup_paused = false;

create table if not exists bookings (
  id                text primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  lead_id           text references leads (id) on delete set null,
  customer_name     text not null,
  email             text,
  phone             text,
  address           text not null,
  postcode          text not null,
  service_type      text not null,
  addons            jsonb not null default '[]'::jsonb,
  date              text not null,
  slot              text not null,
  duration_hours    numeric not null default 3,
  price             numeric,
  price_is_estimate boolean not null default true,
  status            text not null default 'pending',
  payment_status    text not null default 'unpaid',
  payment_link      text,
  notes             text
);

create index if not exists bookings_date_idx on bookings (date, slot);
create index if not exists bookings_lead_idx on bookings (lead_id);

create table if not exists communications (
  id          text primary key,
  created_at  timestamptz not null default now(),
  lead_id     text references leads (id) on delete cascade,
  booking_id  text references bookings (id) on delete set null,
  channel     text not null,
  direction   text not null,
  status      text not null default 'logged',
  subject     text,
  body        text not null,
  template    text,
  to_address  text,
  sent_at     timestamptz
);

create index if not exists communications_lead_idx on communications (lead_id, created_at desc);

create table if not exists escalations (
  id               text primary key,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  lead_id          text references leads (id) on delete cascade,
  booking_id       text references bookings (id) on delete set null,
  communication_id text,
  reason           text not null,
  summary          text not null,
  detail           text not null default '',
  status           text not null default 'open',
  draft_subject    text,
  draft_body       text,
  draft_to         text
);

create index if not exists escalations_status_idx on escalations (status, created_at desc);

-- One row per tool the AI agent ran: the audit trail.
create table if not exists agent_actions (
  id          text primary key,
  created_at  timestamptz not null default now(),
  trace_id    text not null,
  channel     text not null,
  tool        text not null,
  summary     text not null default '',
  outcome     text not null default 'ok',
  lead_id     text references leads (id) on delete set null,
  booking_id  text references bookings (id) on delete set null,
  actor       text not null default 'rules',
  duration_ms integer,
  error       text
);

create index if not exists agent_actions_created_idx on agent_actions (created_at desc);
create index if not exists agent_actions_trace_idx on agent_actions (trace_id);
create index if not exists agent_actions_lead_idx on agent_actions (lead_id);

create table if not exists ad_drafts (
  id           text primary key,
  created_at   timestamptz not null default now(),
  channel      text not null,
  service_type text,
  audience     text not null,
  title        text not null,
  body         text not null
);

-- Pricing and settings are single JSON documents, edited from /admin.
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table leads          enable row level security;
alter table bookings       enable row level security;
alter table communications enable row level security;
alter table escalations    enable row level security;
alter table agent_actions  enable row level security;
alter table ad_drafts      enable row level security;
alter table app_config     enable row level security;

-- No policies are created on purpose. With RLS on and no policy, the
-- anonymous and authenticated keys can do nothing; only the service-role
-- key used by the server bypasses RLS.
