-- Final access-policy polish for Fairview Baptist Temple.
--
-- Public pages use the anonymous Supabase client. Authenticated access is
-- reserved for Studio owners, which avoids duplicate permissive policies.
-- The fbt-media bucket remains public, so its public object URLs continue
-- to work without a storage.objects SELECT policy.

drop policy if exists "site_content public read" on public.site_content;
create policy "site_content public read"
  on public.site_content for select
  to anon
  using (true);

drop policy if exists "sermons public read" on public.sermons;
create policy "sermons public read"
  on public.sermons for select
  to anon
  using (true);

drop policy if exists "events published read" on public.events;
create policy "events published read"
  on public.events for select
  to anon
  using (status = 'published');

drop policy if exists "posts published read" on public.posts;
create policy "posts published read"
  on public.posts for select
  to anon
  using (status = 'published');

drop policy if exists "sermon tags public read" on public.sermon_tags;
create policy "sermon tags public read"
  on public.sermon_tags for select
  to anon
  using (true);

drop policy if exists "prayers approved read" on public.prayers;
create policy "prayers approved read"
  on public.prayers for select
  to anon
  using (approved = true);

drop policy if exists "sermons owner write" on public.sermons;
create policy "sermons owner write"
  on public.sermons for all
  to authenticated
  using ((select public.is_fbt_owner()))
  with check ((select public.is_fbt_owner()));

drop policy if exists "missionaries owner manage" on public.missionaries;
create policy "missionaries owner manage"
  on public.missionaries for all
  to authenticated
  using ((select public.is_fbt_owner()))
  with check ((select public.is_fbt_owner()));

drop policy if exists "fbt-media public read" on storage.objects;
drop policy if exists "fbt-media owner write" on storage.objects;
drop policy if exists "fbt-media owner manage" on storage.objects;

create policy "fbt-media owner manage"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'fbt-media' and (select public.is_fbt_owner()))
  with check (bucket_id = 'fbt-media' and (select public.is_fbt_owner()));
