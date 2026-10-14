-- Metal & Forma: persistent records, owner-only access, public quote intake.
-- In Supabase, create the owner account first, then run this entire script
-- in SQL Editor after replacing OWNER_EMAIL below with that account's email.

create extension if not exists pgcrypto;

create table if not exists public.mf_workshop_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.mf_workshop_members enable row level security;
revoke all on table public.mf_workshop_members from public, anon, authenticated;

create or replace function public.mf_is_workshop_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mf_workshop_members where user_id = auth.uid()
  );
$$;
revoke all on function public.mf_is_workshop_owner() from public;
grant execute on function public.mf_is_workshop_owner() to authenticated;

create table if not exists public.mf_workshop_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.mf_workshop_state enable row level security;
revoke all on table public.mf_workshop_state from public, anon, authenticated;
grant select, insert, update on public.mf_workshop_state to authenticated;
drop policy if exists "Owner reads workshop state" on public.mf_workshop_state;
create policy "Owner reads workshop state" on public.mf_workshop_state for select to authenticated
  using (user_id = auth.uid() and public.mf_is_workshop_owner());
drop policy if exists "Owner creates workshop state" on public.mf_workshop_state;
create policy "Owner creates workshop state" on public.mf_workshop_state for insert to authenticated
  with check (user_id = auth.uid() and public.mf_is_workshop_owner());
drop policy if exists "Owner updates workshop state" on public.mf_workshop_state;
create policy "Owner updates workshop state" on public.mf_workshop_state for update to authenticated
  using (user_id = auth.uid() and public.mf_is_workshop_owner())
  with check (user_id = auth.uid() and public.mf_is_workshop_owner());

create table if not exists public.mf_portfolio_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  image_url text,
  image_path text,
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.mf_portfolio_items enable row level security;
revoke all on table public.mf_portfolio_items from public, anon, authenticated;
grant select on public.mf_portfolio_items to anon, authenticated;
grant insert, update, delete on public.mf_portfolio_items to authenticated;
drop policy if exists "Public reads published portfolio" on public.mf_portfolio_items;
create policy "Public reads published portfolio" on public.mf_portfolio_items for select to anon, authenticated
  using (is_public = true);
drop policy if exists "Owner manages portfolio" on public.mf_portfolio_items;
create policy "Owner manages portfolio" on public.mf_portfolio_items for all to authenticated
  using (user_id = auth.uid() and public.mf_is_workshop_owner())
  with check (user_id = auth.uid() and public.mf_is_workshop_owner());

create table if not exists public.mf_quote_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  contact text not null check (length(contact) between 8 and 40),
  project text not null check (length(project) between 1 and 160),
  material text not null default '' check (length(material) <= 120),
  measures text not null default '' check (length(measures) <= 250),
  timeline text not null default '' check (length(timeline) <= 100),
  details text not null default '' check (length(details) <= 4000),
  photo_names jsonb not null default '[]'::jsonb check (jsonb_typeof(photo_names) = 'array' and jsonb_array_length(photo_names) <= 5),
  created_at timestamptz not null default now()
);
alter table public.mf_quote_requests enable row level security;
revoke all on table public.mf_quote_requests from public, anon, authenticated;
grant insert on public.mf_quote_requests to anon, authenticated;
grant select on public.mf_quote_requests to authenticated;
drop policy if exists "Anyone can submit a quote request" on public.mf_quote_requests;
create policy "Anyone can submit a quote request" on public.mf_quote_requests for insert to anon, authenticated
  with check (length(name) between 1 and 120 and length(contact) between 8 and 40 and length(project) between 1 and 160);
drop policy if exists "Owner reads quote requests" on public.mf_quote_requests;
create policy "Owner reads quote requests" on public.mf_quote_requests for select to authenticated
  using (public.mf_is_workshop_owner());

insert into public.mf_workshop_members (user_id)
select id from auth.users where lower(email) = lower('OWNER_EMAIL')
on conflict (user_id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mf-portfolio-images', 'mf-portfolio-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner uploads portfolio photos" on storage.objects;
create policy "Owner uploads portfolio photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'mf-portfolio-images' and public.mf_is_workshop_owner());
drop policy if exists "Owner updates portfolio photos" on storage.objects;
create policy "Owner updates portfolio photos" on storage.objects for update to authenticated
  using (bucket_id = 'mf-portfolio-images' and public.mf_is_workshop_owner())
  with check (bucket_id = 'mf-portfolio-images' and public.mf_is_workshop_owner());
drop policy if exists "Owner deletes portfolio photos" on storage.objects;
create policy "Owner deletes portfolio photos" on storage.objects for delete to authenticated
  using (bucket_id = 'mf-portfolio-images' and public.mf_is_workshop_owner());
