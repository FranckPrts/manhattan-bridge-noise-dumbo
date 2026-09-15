-- Run this once in the Supabase SQL editor for your project.
--
-- If you already ran an earlier version of this schema and have no real
-- data to preserve yet, drop it first: `drop table if exists reports;`

create table if not exists reports (
  id uuid primary key,
  schema_v int not null default 1,
  user_id uuid not null references auth.users(id) on delete cascade,
  timestamp timestamptz not null,
  lat double precision not null,
  lon double precision not null,
  report_data jsonb not null,
  spectral jsonb,
  device text,
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reports_user_id_idx on reports(user_id);

alter table reports enable row level security;

-- All reads/writes are actually performed server-side (Vercel functions,
-- service role key, which bypasses RLS and does its own ownership checks).
-- These policies are defense-in-depth in case the browser ever queries the
-- table directly with a signed-in user's session.
drop policy if exists "Users can view own reports" on reports;
create policy "Users can view own reports"
  on reports for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own reports" on reports;
create policy "Users can delete own reports"
  on reports for delete
  using (auth.uid() = user_id);

-- One row per identity, filled in voluntarily via the Profile area (separate
-- from any single report). Captures exposure context that a report-by-report
-- schema can't: relationship to the location, tenure, glazing, and where the
-- person typically is when exposed. This is what makes repeat reports from
-- the same identity usable as a longitudinal exposure panel instead of a
-- pile of unrelated one-off complaints — see IMPLEMENTATION_NOTES.md.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  relationship text,              -- resident | worker | regular_visitor | occasional_visitor
  tenure text,                    -- lt_1yr | 1_5yr | 5yr_plus
  glazing text,                   -- single | double | not_sure | na
  typical_context text,           -- home | work | park | transit | other
  longitudinal_consent boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = user_id);

-- Private bucket for uploaded media (audio, image, video). Files are written
-- directly from the browser via short-lived signed upload URLs issued by
-- POST /api/upload-url (requires a signed-in user), not proxied through a
-- serverless function. Playback URLs are similarly short-lived signed reads
-- issued by GET /api/reports.
insert into storage.buckets (id, name, public)
values ('report-media', 'report-media', false)
on conflict (id) do nothing;
