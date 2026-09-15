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

-- Private bucket for uploaded media (audio, image, video). Files are written
-- directly from the browser via short-lived signed upload URLs issued by
-- POST /api/upload-url (requires a signed-in user), not proxied through a
-- serverless function. Playback URLs are similarly short-lived signed reads
-- issued by GET /api/reports.
insert into storage.buckets (id, name, public)
values ('report-media', 'report-media', false)
on conflict (id) do nothing;
