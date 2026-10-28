-- Protects vault data against a stolen or misused session. Run once in Supabase Dashboard >
-- SQL Editor, after 0002_mfa.sql. Nothing here can reveal plaintext; it limits destruction.

-- 1. Profiles: the app only ever rewrites wrapped_key (recovery / new master password).
--    The recovery copy and KDF settings become read-only, so a session alone can't make the
--    vault unrecoverable: the recovery key still opens it after wrapped_key is tampered with.
revoke update on public.profiles from authenticated;
grant update (wrapped_key) on public.profiles to authenticated;

-- 2. Item history: every change or delete first keeps the previous ciphertext for 30 days.
--    Clients may read their own history but never change or delete it.
create table public.vault_item_versions (
  version_id bigint generated always as identity primary key,
  item_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  iv text not null,
  data text not null,
  item_updated_at timestamptz not null,
  change text not null check (change in ('update', 'delete')),
  saved_at timestamptz not null default now()
);
create index vault_item_versions_user_idx on public.vault_item_versions (user_id, saved_at desc);

alter table public.vault_item_versions enable row level security;
create policy "own versions: read" on public.vault_item_versions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "mfa: versions" on public.vault_item_versions as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
grant select on public.vault_item_versions to authenticated;

create function public.keep_item_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Saving the same ciphertext again (e.g. a restore) isn't a change worth keeping.
  if tg_op = 'UPDATE' and new.data = old.data and new.iv = old.iv then
    return new;
  end if;
  insert into public.vault_item_versions (item_id, user_id, iv, data, item_updated_at, change)
  values (old.id, old.user_id, old.iv, old.data, old.updated_at, lower(tg_op));
  delete from public.vault_item_versions where user_id = old.user_id and saved_at < now() - interval '30 days';
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger vault_items_keep_version
  before update or delete on public.vault_items
  for each row execute function public.keep_item_version();
