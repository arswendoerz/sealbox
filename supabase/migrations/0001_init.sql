-- Sealbox schema. Run once in Supabase Dashboard > SQL Editor.
-- The server only ever sees ciphertext: wrapped keys and encrypted items.

-- Per-user key material (vault key wrapped by master key and by recovery key).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  kdf_version smallint not null default 1,
  kdf_iterations integer not null check (kdf_iterations >= 600000),
  wrapped_key jsonb not null,
  recovery_wrapped_key jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per vault item; `data` is AES-256-GCM ciphertext (base64).
create table public.vault_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  iv text not null check (char_length(iv) <= 32),
  data text not null check (char_length(data) <= 200000),
  updated_at timestamptz not null default now()
);
create index vault_items_user_id_idx on public.vault_items (user_id);

alter table public.profiles enable row level security;
alter table public.vault_items enable row level security;

-- Each user can only touch their own rows.
create policy "own profile: read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own items: read" on public.vault_items for select to authenticated using (user_id = (select auth.uid()));
create policy "own items: insert" on public.vault_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own items: update" on public.vault_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own items: delete" on public.vault_items for delete to authenticated using (user_id = (select auth.uid()));

-- "Automatically expose new tables" is off, so grant explicitly. anon gets nothing.
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.vault_items to authenticated;

-- Profile is created from sign-up metadata, so it exists even before email confirmation.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, kdf_version, kdf_iterations, wrapped_key, recovery_wrapped_key)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'kdf_version')::smallint, 1),
    (new.raw_user_meta_data ->> 'kdf_iterations')::integer,
    new.raw_user_meta_data -> 'wrapped_key',
    new.raw_user_meta_data -> 'recovery_wrapped_key'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Keep-alive endpoint for the weekly GitHub Action (free projects pause after 7 idle days).
create function public.ping() returns integer language sql stable set search_path = '' as 'select 1';
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon;
