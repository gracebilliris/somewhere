-- Isolated application tables: no changes to Caffeine Committee's data or policies.
begin;

create table public.somewhere_profiles (
  id uuid primary key,
  user_id uuid unique references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,40}$'),
  name text not null check (length(trim(name)) between 1 and 60),
  bio text not null default '' check (length(bio) <= 300),
  city text not null default 'Sydney' check (length(city) <= 80),
  avatar text not null default '',
  editorial boolean not null default false,
  check ((editorial and user_id is null) or (not editorial and user_id = id and user_id is not null))
);
create table public.somewhere_categories (name text primary key);
insert into public.somewhere_categories values
  ('Food & drink'), ('Bars'), ('Cafes'), ('Art & culture'), ('Outdoors'), ('Shopping'), ('Attractions');
create table public.somewhere_places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  suburb text not null,
  category text not null references public.somewhere_categories(name),
  occasions text[] not null default '{}',
  description text not null,
  address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  website text not null check (website like 'https://%'),
  photo jsonb not null
);
create table public.somewhere_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.somewhere_profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 600),
  occasion text not null default 'Places to try',
  cover text not null default '' check (length(cover) <= 500),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now()
);
create table public.somewhere_collection_places (
  collection_id uuid not null references public.somewhere_collections(id) on delete cascade,
  place_id uuid not null references public.somewhere_places(id) on delete cascade,
  position integer not null check (position >= 0),
  note text not null default '' check (length(note) <= 400),
  primary key (collection_id, place_id)
);
create table public.somewhere_saved_places (
  user_id uuid not null references public.somewhere_profiles(id) on delete cascade,
  place_id uuid not null references public.somewhere_places(id) on delete cascade,
  primary key (user_id, place_id)
);
create table public.somewhere_follows (
  follower_id uuid not null references public.somewhere_profiles(id) on delete cascade,
  following_id uuid not null references public.somewhere_profiles(id) on delete cascade,
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create table public.somewhere_likes (
  user_id uuid not null references public.somewhere_profiles(id) on delete cascade,
  collection_id uuid not null references public.somewhere_collections(id) on delete cascade,
  primary key (user_id, collection_id)
);
create index on public.somewhere_places (city, category);
create index on public.somewhere_places using gin (occasions);
create index on public.somewhere_collections (owner_id, created_at desc);
create index on public.somewhere_collections (visibility, created_at desc);
create index on public.somewhere_collection_places (place_id);
create index on public.somewhere_collection_places (collection_id, position);
create index on public.somewhere_saved_places (place_id);
create index on public.somewhere_follows (following_id);
create index on public.somewhere_likes (collection_id);

alter table public.somewhere_profiles enable row level security;
alter table public.somewhere_categories enable row level security;
alter table public.somewhere_places enable row level security;
alter table public.somewhere_collections enable row level security;
alter table public.somewhere_collection_places enable row level security;
alter table public.somewhere_saved_places enable row level security;
alter table public.somewhere_follows enable row level security;
alter table public.somewhere_likes enable row level security;

create policy "Somewhere public profiles" on public.somewhere_profiles for select using (true);
create policy "Somewhere own profile" on public.somewhere_profiles for update to authenticated
  using (id = (select auth.uid()) and user_id = (select auth.uid()))
  with check (id = (select auth.uid()) and user_id = (select auth.uid()) and not editorial
    and (avatar = '' or avatar like 'upload:' || (select auth.uid())::text || '/%'));
create policy "Somewhere public categories" on public.somewhere_categories for select using (true);
create policy "Somewhere curated places" on public.somewhere_places for select using (true);
create policy "Somewhere visible collections" on public.somewhere_collections for select
  using (visibility = 'public' or owner_id = (select auth.uid()));
create policy "Somewhere create own collection" on public.somewhere_collections for insert to authenticated
  with check (owner_id = (select auth.uid())
    and (cover = '' or cover like 'place:%' or cover like 'upload:' || (select auth.uid())::text || '/%'));
create policy "Somewhere edit own collection" on public.somewhere_collections for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid())
    and (cover = '' or cover like 'place:%' or cover like 'upload:' || (select auth.uid())::text || '/%'));
create policy "Somewhere delete own collection" on public.somewhere_collections for delete to authenticated
  using (owner_id = (select auth.uid()));
create policy "Somewhere visible collection places" on public.somewhere_collection_places for select
  using (exists (select 1 from public.somewhere_collections c where c.id = collection_id));
create policy "Somewhere edit own collection places" on public.somewhere_collection_places for all to authenticated
  using (exists (select 1 from public.somewhere_collections c where c.id = collection_id and c.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.somewhere_collections c where c.id = collection_id and c.owner_id = (select auth.uid())));
create policy "Somewhere personal saved places" on public.somewhere_saved_places for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Somewhere public follows" on public.somewhere_follows for select using (true);
create policy "Somewhere follow as yourself" on public.somewhere_follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy "Somewhere unfollow as yourself" on public.somewhere_follows for delete to authenticated
  using (follower_id = (select auth.uid()));
create policy "Somewhere visible likes" on public.somewhere_likes for select
  using (exists (select 1 from public.somewhere_collections c where c.id = collection_id));
create policy "Somewhere like as yourself" on public.somewhere_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.somewhere_collections c where c.id = collection_id));
create policy "Somewhere unlike as yourself" on public.somewhere_likes for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.somewhere_profiles, public.somewhere_categories, public.somewhere_places,
  public.somewhere_collections, public.somewhere_collection_places, public.somewhere_follows, public.somewhere_likes to anon, authenticated;
grant update (name, username, bio, city, avatar) on public.somewhere_profiles to authenticated;
grant insert, update, delete on public.somewhere_collections, public.somewhere_collection_places to authenticated;
grant select, insert, delete on public.somewhere_saved_places to authenticated;
grant insert, delete on public.somewhere_follows, public.somewhere_likes to authenticated;
-- Supabase's default privileges may grant more than the above; explicitly narrow profile writes.
revoke insert, delete, update on public.somewhere_profiles from anon, authenticated;
grant update (name, username, bio, city, avatar) on public.somewhere_profiles to authenticated;
revoke insert, update, delete on public.somewhere_places, public.somewhere_categories from anon, authenticated;

create function public.somewhere_ensure_profile() returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first'; end if;
  insert into public.somewhere_profiles (id, user_id, username, name)
  values (uid, uid, 'guide.' || replace(uid::text, '-', ''), 'New explorer')
  on conflict (id) do nothing;
  return uid;
end;
$$;
revoke all on function public.somewhere_ensure_profile() from public, anon;
grant execute on function public.somewhere_ensure_profile() to authenticated;

create function public.somewhere_save_place(p_place uuid, p_collections uuid[], p_favourite boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cid uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if p_collections is null or p_favourite is null then raise exception 'Invalid save options'; end if;
  if not exists (select 1 from public.somewhere_places where id = p_place) then raise exception 'Place unavailable'; end if;
  if exists (
    select 1 from unnest(p_collections) as wanted(id)
    where not exists (select 1 from public.somewhere_collections c where c.id = wanted.id and c.owner_id = uid)
  ) then raise exception 'You can only save to your own collections'; end if;
  delete from public.somewhere_collection_places cp
    using public.somewhere_collections c
    where cp.collection_id = c.id and c.owner_id = uid and cp.place_id = p_place
      and not (c.id = any(p_collections));
  foreach cid in array p_collections loop
    insert into public.somewhere_collection_places (collection_id, place_id, position)
    select cid, p_place, coalesce(max(position), -1) + 1 from public.somewhere_collection_places where collection_id = cid
    on conflict do nothing;
  end loop;
  if p_favourite then
    insert into public.somewhere_saved_places values (uid, p_place) on conflict do nothing;
  else
    delete from public.somewhere_saved_places where user_id = uid and place_id = p_place;
  end if;
end;
$$;
revoke all on function public.somewhere_save_place(uuid, uuid[], boolean) from public, anon;
grant execute on function public.somewhere_save_place(uuid, uuid[], boolean) to authenticated;

create function public.somewhere_reorder_collection(p_collection uuid, p_places uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); expected integer;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if not exists (select 1 from public.somewhere_collections where id = p_collection and owner_id = uid)
    then raise exception 'You can only reorder your own collections'; end if;
  select count(*) into expected from public.somewhere_collection_places where collection_id = p_collection;
  if p_places is null or cardinality(p_places) <> expected
    or (select count(distinct id) from unnest(p_places) as items(id)) <> expected
    or exists (select 1 from public.somewhere_collection_places where collection_id = p_collection and not (place_id = any(p_places)))
    then raise exception 'Place order has changed. Reload and try again'; end if;
  update public.somewhere_collection_places cp set position = ordered.ordinality - 1
    from unnest(p_places) with ordinality as ordered(id, ordinality)
    where cp.collection_id = p_collection and cp.place_id = ordered.id;
end;
$$;
revoke all on function public.somewhere_reorder_collection(uuid, uuid[]) from public, anon;
grant execute on function public.somewhere_reorder_collection(uuid, uuid[]) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('somewhere-images', 'somewhere-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "Somewhere upload own image" on storage.objects for insert to authenticated
  with check (bucket_id = 'somewhere-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Somewhere view permitted image" on storage.objects for select
  using (bucket_id = 'somewhere-images' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.somewhere_collections c where c.cover = 'upload:' || name and c.visibility = 'public')
    or exists (select 1 from public.somewhere_profiles p where p.avatar = 'upload:' || name)
  ));
create policy "Somewhere remove own image" on storage.objects for delete to authenticated
  using (bucket_id = 'somewhere-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
