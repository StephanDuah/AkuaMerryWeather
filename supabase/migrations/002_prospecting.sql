-- Merry Cleaners - migration 002
--
-- Lead Intelligence & Prospecting.
--
-- A prospect is an organisation that MIGHT become a customer. It is not a
-- lead. Leads live in the `leads` table and only exist once someone has
-- contacted the business. `prospects.lead_id` is the bridge between the two,
-- set at the moment a prospect actually responds.
--
-- Safe to run more than once.

create table if not exists prospects (
  id                      text primary key,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  company_name            text not null,
  trading_name            text,
  business_type           text not null default 'other_business',

  website                 text,
  email                   text,
  phone                   text,
  contact_form_url        text,

  address                 text,
  postcode                text,
  borough                 text,

  companies_house_number  text,
  companies_house_status  text,

  -- Every source that contributed to this one deduplicated record.
  sources                 jsonb not null default '[]'::jsonb,
  -- Field-level provenance: value, source, URL, date, reliability.
  provenance              jsonb not null default '[]'::jsonb,

  discovered_at           timestamptz not null default now(),
  verified_at             timestamptz,
  last_checked_at         timestamptz,

  -- Priority with the factors that produced it, so it is never a black box.
  qualification           jsonb not null default '{}'::jsonb,
  status                  text not null default 'discovered',

  -- Set only when this prospect has actually become a lead.
  lead_id                 text references leads (id) on delete set null,

  flags                   jsonb not null default '[]'::jsonb,
  notes                   text,

  -- Synthetic test rows are never mixed with real prospects.
  is_test                 boolean not null default false,

  campaign_id             text
);

create index if not exists prospects_status_idx   on prospects (status);
create index if not exists prospects_priority_idx on prospects ((qualification->>'priority'));
create index if not exists prospects_borough_idx  on prospects (borough);
create index if not exists prospects_test_idx     on prospects (is_test);
create index if not exists prospects_created_idx  on prospects (created_at desc);

-- Deduplication keys. Partial unique indexes so blanks do not collide.
create unique index if not exists prospects_ch_number_uniq
  on prospects (companies_house_number)
  where companies_house_number is not null and is_test = false;

-- Permanent do-not-contact list. Checked before every campaign.
create table if not exists suppressions (
  id              text primary key,
  created_at      timestamptz not null default now(),
  identifier      text not null,
  identifier_type text not null,
  reason          text not null,
  created_by      text not null default 'owner',
  source          text
);

create unique index if not exists suppressions_identifier_uniq
  on suppressions (identifier_type, identifier);

-- Reusable prospecting campaigns, editable by the owner.
create table if not exists campaigns (
  id               text primary key,
  created_at       timestamptz not null default now(),
  name             text not null,
  description      text not null default '',
  target_types     jsonb not null default '[]'::jsonb,
  boroughs         jsonb not null default '[]'::jsonb,
  sources          jsonb not null default '[]'::jsonb,
  enabled          boolean not null default true,
  last_run_at      timestamptz,
  last_run_summary text
);

alter table prospects    enable row level security;
alter table suppressions enable row level security;
alter table campaigns    enable row level security;

-- No policies, as with every other table: reachable only through the
-- server's service-role key. Prospect data is commercially sensitive and,
-- where it names individuals, personal.
