-- Merry Cleaners - migration 001
--
-- 1. A booking may now legitimately have no price: the owner may not have
--    approved a rate card yet, and the agent must never invent a figure.
--    The price is confirmed by a person and written back later.
-- 2. Adds the agent action audit log.
--
-- Safe to run more than once.

alter table bookings alter column price drop not null;
alter table bookings alter column price drop default;

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

alter table agent_actions enable row level security;
-- No policies: reachable only through the server's service-role key.
