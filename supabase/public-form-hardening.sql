-- ============================================================
-- Fairview Baptist Temple: public form hardening, draft privacy, and CMS recovery
--
-- Idempotent. This file is intended to be applied after the base schema.
-- It does not remove or rewrite content rows.
-- ============================================================

create or replace function public.is_fbt_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    ((select auth.jwt()) ->> 'email') = any (array[
      'brandonstone8567@gmail.com'
      -- Add Pastor J. Bret Wiley's email here when known, e.g.:
      -- ,'pastor@example.com'
    ]),
    false
  );
$function$;

-- Complete the repeatable definition for Studio tables that earlier versions
-- created with one-off SQL.
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  start_at   text,
  end_at     text,
  recurring  text,
  location   text,
  address    text,
  category   text,
  cover      text,
  summary    text,
  body       text,
  register   jsonb default '{}'::jsonb,
  links      jsonb default '[]'::jsonb,
  videos     jsonb default '[]'::jsonb,
  featured   boolean default false,
  status     text default 'published',
  sort       integer default 0,
  updated_at timestamptz default now(),
  hero       text
);

alter table public.events add column if not exists slug text;
alter table public.events add column if not exists title text;
alter table public.events add column if not exists start_at text;
alter table public.events add column if not exists end_at text;
alter table public.events add column if not exists recurring text;
alter table public.events add column if not exists location text;
alter table public.events add column if not exists address text;
alter table public.events add column if not exists category text;
alter table public.events add column if not exists cover text;
alter table public.events add column if not exists summary text;
alter table public.events add column if not exists body text;
alter table public.events add column if not exists register jsonb default '{}'::jsonb;
alter table public.events add column if not exists links jsonb default '[]'::jsonb;
alter table public.events add column if not exists videos jsonb default '[]'::jsonb;
alter table public.events add column if not exists featured boolean default false;
alter table public.events add column if not exists status text default 'published';
alter table public.events add column if not exists sort integer default 0;
alter table public.events add column if not exists updated_at timestamptz default now();
alter table public.events add column if not exists hero text;

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  date       text,
  author     text,
  tags       jsonb default '[]'::jsonb,
  cover      text,
  excerpt    text,
  body       text,
  video      text,
  status     text default 'published',
  sort       integer default 0,
  updated_at timestamptz default now()
);

alter table public.posts add column if not exists slug text;
alter table public.posts add column if not exists title text;
alter table public.posts add column if not exists date text;
alter table public.posts add column if not exists author text;
alter table public.posts add column if not exists tags jsonb default '[]'::jsonb;
alter table public.posts add column if not exists cover text;
alter table public.posts add column if not exists excerpt text;
alter table public.posts add column if not exists body text;
alter table public.posts add column if not exists video text;
alter table public.posts add column if not exists status text default 'published';
alter table public.posts add column if not exists sort integer default 0;
alter table public.posts add column if not exists updated_at timestamptz default now();

create table if not exists public.sermon_tags (
  video_id    text primary key,
  title       text,
  speaker     text,
  reference   text,
  series      text,
  topics      jsonb default '[]'::jsonb,
  type        text,
  updated_at  timestamptz default now(),
  summary     text,
  notes       text,
  transcript  text,
  service     text,
  preached_on date
);

alter table public.sermon_tags add column if not exists title text;
alter table public.sermon_tags add column if not exists speaker text;
alter table public.sermon_tags add column if not exists reference text;
alter table public.sermon_tags add column if not exists series text;
alter table public.sermon_tags add column if not exists topics jsonb default '[]'::jsonb;
alter table public.sermon_tags add column if not exists type text;
alter table public.sermon_tags add column if not exists updated_at timestamptz default now();
alter table public.sermon_tags add column if not exists summary text;
alter table public.sermon_tags add column if not exists notes text;
alter table public.sermon_tags add column if not exists transcript text;
alter table public.sermon_tags add column if not exists service text;
alter table public.sermon_tags add column if not exists preached_on date;

-- These tables are included so this hardening file can safely repair an older
-- install where the Studio inbox or prayer wall was never created.
create table if not exists public.submissions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind       text not null default 'contact',
  name       text,
  email      text,
  phone      text,
  message    text,
  details    jsonb default '{}'::jsonb,
  handled    boolean default false
);

create table if not exists public.prayers (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text,
  request    text not null,
  approved   boolean default false,
  answered   boolean default false
);

-- Keep public request metadata outside the exposed API schemas. RLS is enabled
-- as a second boundary, even though no browser role receives schema access.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.public_form_rate_limits (
  id         bigint generated by default as identity primary key,
  ip         inet not null,
  scope      text not null,
  created_at timestamptz not null default clock_timestamp()
);

alter table private.public_form_rate_limits enable row level security;
revoke all on table private.public_form_rate_limits from public, anon, authenticated;
create index if not exists public_form_rate_limits_ip_scope_created_at_idx
  on private.public_form_rate_limits (ip, scope, created_at desc);
create index if not exists public_form_rate_limits_created_at_idx
  on private.public_form_rate_limits (created_at);

create or replace function private.fbt_request_ip()
returns inet
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  request_headers jsonb := '{}'::jsonb;
  raw_ip text := '';
begin
  begin
    request_headers := coalesce(
      nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    request_headers := '{}'::jsonb;
  end;

  raw_ip := pg_catalog.btrim(pg_catalog.split_part(
    coalesce(request_headers ->> 'x-forwarded-for', request_headers ->> 'x-real-ip', ''),
    ',',
    1
  ));
  if raw_ip = '' then return '0.0.0.0'::inet; end if;

  begin
    return raw_ip::inet;
  exception when others then
    return '0.0.0.0'::inet;
  end;
end;
$function$;

create or replace function private.consume_public_rate_limit(
  requested_scope text,
  request_limit integer,
  request_window interval
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  request_ip inet := private.fbt_request_ip();
  clean_scope text := pg_catalog.left(coalesce(requested_scope, 'public'), 60);
  recent_count integer := 0;
begin
  if request_limit < 1 or request_window <= interval '0 seconds' then
    raise exception 'Invalid rate limit configuration';
  end if;

  -- Serialize checks for one IP and scope so parallel requests cannot all pass
  -- before their counters are inserted.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(clean_scope || '|' || pg_catalog.host(request_ip), 0)
  );

  delete from private.public_form_rate_limits
  where created_at < pg_catalog.clock_timestamp() - interval '1 day';

  select pg_catalog.count(*)::integer
  into recent_count
  from private.public_form_rate_limits
  where ip = request_ip
    and scope = clean_scope
    and created_at >= pg_catalog.clock_timestamp() - request_window;

  if recent_count >= request_limit then
    raise sqlstate 'PGRST' using
      message = pg_catalog.json_build_object(
        'code', 'rate_limit',
        'message', 'Please wait a few minutes before sending another message.'
      )::text,
      detail = pg_catalog.json_build_object('status', 429)::text;
  end if;

  insert into private.public_form_rate_limits (ip, scope)
  values (request_ip, clean_scope);
end;
$function$;

revoke all on function private.fbt_request_ip() from public, anon, authenticated;
revoke all on function private.consume_public_rate_limit(text, integer, interval) from public, anon, authenticated;

-- The public functions deliberately bypass table RLS for one narrow insert.
-- They validate every value, choose protected fields themselves, and expose no
-- private rows. An empty search_path prevents object-shadowing attacks.
create or replace function public.submit_public_form(
  p_kind text,
  p_name text default null,
  p_email text default null,
  p_phone text default null,
  p_message text default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  clean_kind text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_kind, 'contact')));
  clean_name text := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'), '');
  clean_email text := nullif(pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_email, '')), '[[:space:]]+', ' ', 'g')), '');
  clean_phone text := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_phone, '')), '[[:space:]]+', ' ', 'g'), '');
  clean_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  clean_details jsonb := coalesce(p_details, '{}'::jsonb);
  detail_count integer := 0;
  new_id uuid;
begin
  if clean_kind not in (
    'contact', 'visit', 'prayer', 'newsletter', 'rsvp',
    'next_step_follow_jesus', 'next_step_baptism', 'next_step_membership',
    'next_step_group', 'next_step_serve', 'next_step_pastor'
  ) then
    raise exception using errcode = '22023', message = 'That form type is not supported.';
  end if;

  if pg_catalog.char_length(coalesce(clean_name, '')) > 120
    or pg_catalog.char_length(coalesce(clean_email, '')) > 254
    or pg_catalog.char_length(coalesce(clean_phone, '')) > 50
    or pg_catalog.char_length(coalesce(clean_message, '')) > 5000 then
    raise exception using errcode = '22001', message = 'One or more form fields are too long.';
  end if;

  if clean_email is not null
    and clean_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Enter a complete email address.';
  end if;

  if pg_catalog.jsonb_typeof(clean_details) <> 'object' then
    raise exception using errcode = '22023', message = 'Form details must be an object.';
  end if;
  if nullif(pg_catalog.btrim(coalesce(clean_details ->> 'website', '')), '') is not null then
    return pg_catalog.gen_random_uuid();
  end if;
  clean_details := clean_details - 'website';
  select pg_catalog.count(*)::integer into detail_count
  from pg_catalog.jsonb_object_keys(clean_details);
  if detail_count > 24 or pg_catalog.octet_length(clean_details::text) > 12000 then
    raise exception using errcode = '22001', message = 'Those form details are too long.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(clean_details) as fields(key)
    where fields.key !~ '^[A-Za-z0-9_-]{1,64}$'
  ) then
    raise exception using errcode = '22023', message = 'A form field could not be read.';
  end if;

  if clean_kind in ('contact', 'visit', 'rsvp') or clean_kind like 'next_step_%' then
    if clean_name is null or clean_email is null then
      raise exception using errcode = '22023', message = 'Name and email are required.';
    end if;
  end if;
  if clean_kind = 'newsletter' and clean_email is null then
    raise exception using errcode = '22023', message = 'Email is required.';
  end if;
  if clean_kind in ('contact', 'prayer') and clean_message is null then
    raise exception using errcode = '22023', message = 'A message is required.';
  end if;
  if clean_name is null and clean_email is null and clean_phone is null and clean_message is null then
    raise exception using errcode = '22023', message = 'Add your information before sending.';
  end if;

  perform private.consume_public_rate_limit('submission:' || clean_kind, 12, interval '15 minutes');

  insert into public.submissions (
    kind, name, email, phone, message, details, handled
  ) values (
    clean_kind, clean_name, clean_email, clean_phone, clean_message, clean_details, false
  ) returning id into new_id;

  return new_id;
end;
$function$;

create or replace function public.submit_public_prayer(
  p_name text default null,
  p_request text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  clean_name text := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'), '');
  clean_request text := nullif(pg_catalog.btrim(coalesce(p_request, '')), '');
  new_id uuid;
begin
  if pg_catalog.char_length(coalesce(clean_name, '')) > 80 then
    raise exception using errcode = '22001', message = 'That display name is too long.';
  end if;
  if clean_request is null then
    raise exception using errcode = '22023', message = 'A prayer request is required.';
  end if;
  if pg_catalog.char_length(clean_request) > 3000 then
    raise exception using errcode = '22001', message = 'That prayer request is too long.';
  end if;

  perform private.consume_public_rate_limit('prayer-wall', 8, interval '15 minutes');

  insert into public.prayers (name, request, approved, answered)
  values (clean_name, clean_request, false, false)
  returning id into new_id;

  return new_id;
end;
$function$;

revoke all on function public.submit_public_form(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_public_prayer(text, text) from public, anon, authenticated;
grant execute on function public.submit_public_form(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.submit_public_prayer(text, text) to anon, authenticated;

-- Normalize only missing visibility values. Drafts remain drafts, and unknown
-- values fail closed under the public policies below.
update public.events set status = 'published' where status is null or pg_catalog.btrim(status) = '';
update public.posts set status = 'published' where status is null or pg_catalog.btrim(status) = '';

alter table public.events enable row level security;
alter table public.posts enable row level security;
alter table public.sermon_tags enable row level security;
alter table public.submissions enable row level security;
alter table public.prayers enable row level security;
alter table public.site_content enable row level security;

-- Policy names varied between setup versions. Remove all policies on these
-- six tables before installing one exact access model, so an old broad policy
-- cannot continue exposing drafts or accepting direct anonymous inserts.
do $policy_cleanup$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('events', 'posts', 'sermon_tags', 'submissions', 'prayers', 'site_content')
  loop
    execute pg_catalog.format(
      'drop policy %I on %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  end loop;
end;
$policy_cleanup$;

create policy "site_content public read"
  on public.site_content for select
  to anon
  using (true);
create policy "site_content owner manage"
  on public.site_content for all
  to authenticated
  using ((select public.is_fbt_owner()))
  with check ((select public.is_fbt_owner()));

create policy "events published read"
  on public.events for select
  to anon
  using (status = 'published');
create policy "events owner manage"
  on public.events for all
  to authenticated
  using ((select public.is_fbt_owner()))
  with check ((select public.is_fbt_owner()));

create policy "posts published read"
  on public.posts for select
  to anon
  using (status = 'published');
create policy "posts owner manage"
  on public.posts for all
  to authenticated
  using ((select public.is_fbt_owner()))
  with check ((select public.is_fbt_owner()));

create policy "sermon tags public read"
  on public.sermon_tags for select
  to anon
  using (true);
create policy "sermon tags owner manage"
  on public.sermon_tags for all
  to authenticated
  using ((select public.is_fbt_owner()))
  with check ((select public.is_fbt_owner()));

create policy "submissions owner manage"
  on public.submissions for all
  to authenticated
  using ((select public.is_fbt_owner()))
  with check ((select public.is_fbt_owner()));

create policy "prayers approved read"
  on public.prayers for select
  to anon
  using (approved = true);
create policy "prayers owner manage"
  on public.prayers for all
  to authenticated
  using ((select public.is_fbt_owner()))
  with check ((select public.is_fbt_owner()));

create index if not exists events_published_start_at_idx
  on public.events (start_at) where status = 'published';
create index if not exists posts_published_date_idx
  on public.posts (date desc) where status = 'published';
create index if not exists submissions_created_at_idx
  on public.submissions (created_at desc);
create index if not exists prayers_created_at_idx
  on public.prayers (created_at desc);
create index if not exists prayers_approved_created_at_idx
  on public.prayers (created_at desc) where approved = true;

-- Data API exposure is explicit. Grants decide which operations can reach a
-- table, and RLS decides which rows those operations can see.
revoke create on schema public from public;
grant usage on schema public to anon, authenticated;

revoke all on table public.site_content from public, anon, authenticated;
grant select on table public.site_content to anon;
grant select, insert, update, delete on table public.site_content to authenticated;

revoke all on table public.sermons from public, anon, authenticated;
grant select on table public.sermons to anon;
grant select, insert, update, delete on table public.sermons to authenticated;

revoke all on table public.live_status from public, anon, authenticated;
grant select on table public.live_status to anon, authenticated;

revoke all on table public.missionaries from public, anon, authenticated;
grant select (
  id, slug, name, region, location, lat, lng, field, org, photo, bio,
  our_connection, prayer, latest_update, latest_update_date, support_url,
  video, videos, photos, letters, ministry, status_label, country, sent_year,
  timezone, status, sort, updated_at
) on table public.missionaries to anon;
grant select, insert, update, delete on table public.missionaries to authenticated;

revoke all on table public.events from public, anon, authenticated;
grant select on table public.events to anon;
grant select, insert, update, delete on table public.events to authenticated;

revoke all on table public.posts from public, anon, authenticated;
grant select on table public.posts to anon;
grant select, insert, update, delete on table public.posts to authenticated;

revoke all on table public.sermon_tags from public, anon, authenticated;
grant select on table public.sermon_tags to anon;
grant select, insert, update, delete on table public.sermon_tags to authenticated;

revoke all on table public.submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.submissions to authenticated;

revoke all on table public.prayers from public, anon, authenticated;
grant select on table public.prayers to anon;
grant select, insert, update, delete on table public.prayers to authenticated;

-- is_fbt_owner is used only by authenticated policies. Keeping it away from
-- anonymous callers narrows the exposed function surface.
revoke all on function public.is_fbt_owner() from public, anon, authenticated;
grant execute on function public.is_fbt_owner() to authenticated;

-- Opt future objects into least privilege too. Every public table/function
-- intended for the site must receive an explicit grant in its own migration.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;

notify pgrst, 'reload schema';
