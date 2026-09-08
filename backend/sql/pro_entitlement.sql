-- SportMind Pro entitlement — server-authoritative trial/subscription state.
--
-- WHY THIS EXISTS. The trial clock must be the SERVER's clock, not the
-- client's: a client that computed "14 days since trialStartedAt" from its
-- own Date.now() could be trivially extended by turning back the device
-- clock. This mirrors the Stylist app's own `/v1/entitlement` model — the
-- server owns the clock and the stored start instant, the client only reads
-- the answer — adapted to SportMind's actual infrastructure (Supabase
-- directly, no separate auth/API server) instead of copying Stylist's Logto+
-- custom-backend shape verbatim, which SportMind has no equivalent of.
--
-- IDENTITY. SportMind has no login system, so entitlement is keyed by an
-- anonymous, locally-generated device id (see services/entitlement.ts) —
-- the same accepted limitation Stylist's own anonymous session has: a
-- reinstall gets a new id and a new trial. Closing that needs device
-- attestation, which is out of scope here for the same reason it is out of
-- scope in Stylist.
--
-- HOW TO APPLY. Run this file's contents once in the Supabase project's SQL
-- editor (Dashboard → SQL Editor → New query → paste → Run). Nothing in the
-- mobile or backend app requires this to exist to run — see
-- services/entitlement.ts's documented local-fallback path — but the trial
-- is only genuinely tamper-resistant once this is live.

create table if not exists public.pro_entitlement (
  device_id text primary key,
  trial_started_at timestamptz not null default now(),
  pro_active boolean not null default false,
  pro_source text,
  pro_activated_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.pro_entitlement is
  'One row per anonymous device. trial_started_at and pro_active are pinned '
  'server-side by trg_pro_entitlement_defaults on insert; anon clients can '
  'never set either directly (see RLS policies below) and there is no UPDATE '
  'policy for anon at all, so once a row exists its trial start cannot move.';

-- Pins the real fields on INSERT regardless of what the client's payload
-- contained, so "insert a row with an old trial_started_at" is not a way to
-- get extra trial time — the same property Stylist's server-computed start
-- instant has, just enforced by a trigger instead of a full backend route.
create or replace function public.set_pro_entitlement_defaults()
returns trigger
language plpgsql
security definer
as $$
begin
  new.trial_started_at := now();
  new.pro_active := false;
  new.pro_source := null;
  new.pro_activated_at := null;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pro_entitlement_defaults on public.pro_entitlement;
create trigger trg_pro_entitlement_defaults
  before insert on public.pro_entitlement
  for each row execute function public.set_pro_entitlement_defaults();

alter table public.pro_entitlement enable row level security;

-- Anon may create its own row once (the trigger above pins the honest
-- values no matter what it sends) and read rows back. There is
-- deliberately no UPDATE or DELETE policy for anon: nothing a client sends
-- can ever flip pro_active to true or move trial_started_at. Setting
-- pro_active is reserved for a future server-side purchase-confirmation
-- path (service-role key), which does not exist yet — see
-- services/purchase.ts's isPurchaseConfigured().
drop policy if exists pro_entitlement_insert_own on public.pro_entitlement;
create policy pro_entitlement_insert_own on public.pro_entitlement
  for insert to anon
  with check (true);

drop policy if exists pro_entitlement_select_own on public.pro_entitlement;
create policy pro_entitlement_select_own on public.pro_entitlement
  for select to anon
  using (true);

-- The computed tri-state entitlement, decided by Postgres's own now() at
-- query time — never by client-supplied date math. security_invoker so the
-- view is subject to the base table's RLS (anon can select) rather than
-- running as the view owner.
create or replace view public.pro_entitlement_state
  with (security_invoker = true)
as
select
  device_id,
  case
    when pro_active then 'pro'
    when now() < trial_started_at + interval '14 days' then 'trial'
    else 'expired'
  end as entitlement,
  trial_started_at,
  (trial_started_at + interval '14 days') as trial_ends_at,
  pro_active,
  pro_source
from public.pro_entitlement;

grant select on public.pro_entitlement_state to anon;

-- KNOWN LIMITATION, STATED PLAINLY (mirrors Stylist's own documented gap):
-- with no auth, `using (true)` means any holder of the public anon key can
-- read any device_id's row if they know or guess the id (a random locally-
-- generated string, not sequential or guessable in practice). No personal
-- data is stored here — only a device id, a start timestamp and a boolean —
-- so the exposure is the same shape as every other row in this project's
-- publicly-readable tables. Tightening this to real per-owner isolation
-- needs real authentication, which is a larger decision than this table.
