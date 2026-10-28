-- Key hygiene and vault-key rotation. Run once in Supabase Dashboard > SQL Editor, after 0003.
-- The web app and extension work before and after this migration (they detect key_version).

create extension if not exists pgcrypto with schema extensions; -- digest(); enabled by default on Supabase

-- 1. Proof of the vault key -------------------------------------------------------------------
-- Clients prove they hold the current vault key by sending a value derived from it; the server
-- keeps only its SHA-256. Changing key material then needs that proof, not just a session.
alter table public.profiles
  add column key_version integer not null default 1,
  add column key_proof_hash text;

-- Profiles can no longer be updated directly at all; key changes go through the functions below.
revoke update on public.profiles from authenticated;

-- Legacy accounts get their proof hash on the next unlock (only while none is set).
create function public.set_key_proof(p_proof_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.mfa_satisfied() then
    raise exception 'not allowed';
  end if;
  update public.profiles set key_proof_hash = p_proof_hash where id = auth.uid() and key_proof_hash is null;
end $$;

-- 2. Key versions on items ----------------------------------------------------------------------
-- A device still holding an old vault key can't write items nobody can decrypt any more.
alter table public.vault_items add column key_version integer;
alter table public.vault_item_versions add column key_version integer;

create function public.check_item_key_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  current_version integer;
begin
  select key_version into current_version from public.profiles where id = new.user_id;
  if new.key_version is null then
    new.key_version := current_version; -- clients from before this migration
  elsif new.key_version <> current_version then
    raise exception 'vault key changed on another device' using hint = 'sealbox:stale_key';
  end if;
  return new;
end $$;

create trigger vault_items_key_version
  before insert or update on public.vault_items
  for each row execute function public.check_item_key_version();

-- History keeps the key version too, and is skipped while a rotation re-encrypts everything
-- (otherwise the rotation would store a fresh copy of every item under the old key).
create or replace function public.keep_item_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('sealbox.rotating', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.data = old.data and new.iv = old.iv then
    return new;
  end if;
  insert into public.vault_item_versions (item_id, user_id, iv, data, item_updated_at, change, key_version)
  values (old.id, old.user_id, old.iv, old.data, old.updated_at, lower(tg_op), old.key_version);
  delete from public.vault_item_versions where user_id = old.user_id and saved_at < now() - interval '30 days';
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- 3. Rotation ----------------------------------------------------------------------------------
-- Replaces the vault key in one transaction: both wrapped copies, every item and the readable
-- history, re-encrypted by the client. Requires 2FA (if enabled) and proof of the current key.
create function public.rotate_vault_key(
  p_proof text,
  p_new_proof_hash text,
  p_wrapped_key jsonb,
  p_recovery_wrapped_key jsonb,
  p_items jsonb,
  p_versions jsonb
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  new_version integer;
  changed integer;
begin
  if uid is null or not public.mfa_satisfied() then
    raise exception 'not allowed';
  end if;
  select * into prof from public.profiles where id = uid for update;
  if prof.key_proof_hash is null or prof.key_proof_hash <> encode(extensions.digest(p_proof, 'sha256'), 'hex') then
    raise exception 'key proof mismatch' using hint = 'sealbox:bad_proof';
  end if;
  if jsonb_array_length(p_items) <> (select count(*) from public.vault_items where user_id = uid) then
    raise exception 'items changed during rotation' using hint = 'sealbox:items_changed';
  end if;

  perform set_config('sealbox.rotating', 'on', true);
  new_version := prof.key_version + 1;
  update public.profiles
    set wrapped_key = p_wrapped_key, recovery_wrapped_key = p_recovery_wrapped_key,
        key_proof_hash = p_new_proof_hash, key_version = new_version
    where id = uid;
  update public.vault_items v
    set iv = x.iv, data = x.data, key_version = new_version
    from jsonb_to_recordset(p_items) as x(id uuid, iv text, data text)
    where v.id = x.id and v.user_id = uid;
  get diagnostics changed = row_count;
  if changed <> jsonb_array_length(p_items) then
    raise exception 'items changed during rotation' using hint = 'sealbox:items_changed';
  end if;
  update public.vault_item_versions v
    set iv = x.iv, data = x.data, key_version = new_version
    from jsonb_to_recordset(p_versions) as x(version_id bigint, iv text, data text)
    where v.version_id = x.version_id and v.user_id = uid;
  perform set_config('sealbox.rotating', 'off', true);
  return new_version;
end $$;

revoke execute on function public.set_key_proof(text) from public, anon;
revoke execute on function public.rotate_vault_key(text, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.set_key_proof(text) to authenticated;
grant execute on function public.rotate_vault_key(text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- 4. Key material out of auth metadata ------------------------------------------------------
-- Sign-up still passes the wrapped keys as metadata (the profile must exist before the email
-- is confirmed), but they are moved into profiles and removed, so they no longer sit in
-- auth.users or in every JWT. A repeated sign-up before confirmation replaces the keys
-- (otherwise the new recovery key shown to the user would not work); after it, never.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(new.raw_user_meta_data ? 'wrapped_key', false) then
    return new; -- e.g. users created from the dashboard: no keys to store
  end if;
  insert into public.profiles (id, kdf_version, kdf_iterations, wrapped_key, recovery_wrapped_key, key_proof_hash)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'kdf_version')::smallint, 1),
    (new.raw_user_meta_data ->> 'kdf_iterations')::integer,
    new.raw_user_meta_data -> 'wrapped_key',
    new.raw_user_meta_data -> 'recovery_wrapped_key',
    new.raw_user_meta_data ->> 'key_proof_hash'
  )
  on conflict (id) do update
    set kdf_version = excluded.kdf_version, kdf_iterations = excluded.kdf_iterations,
        wrapped_key = excluded.wrapped_key, recovery_wrapped_key = excluded.recovery_wrapped_key,
        key_proof_hash = excluded.key_proof_hash
    where new.email_confirmed_at is null;
  begin
    update auth.users
      set raw_user_meta_data = raw_user_meta_data - 'wrapped_key' - 'recovery_wrapped_key' - 'key_proof_hash' - 'kdf_iterations' - 'kdf_version'
      where id = new.id;
  exception when insufficient_privilege then
    raise warning 'sealbox: could not strip key metadata for %', new.id; -- never block a sign-up
  end;
  return new;
end $$;

create trigger on_auth_user_metadata_keys
  after update of raw_user_meta_data on auth.users
  for each row when (new.raw_user_meta_data ? 'wrapped_key')
  execute function public.handle_new_user();

-- Clean up accounts created before this migration.
update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'wrapped_key' - 'recovery_wrapped_key' - 'key_proof_hash' - 'kdf_iterations' - 'kdf_version'
  where raw_user_meta_data ? 'wrapped_key';
