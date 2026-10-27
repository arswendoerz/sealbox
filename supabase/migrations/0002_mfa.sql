-- 2FA enforcement. Run once in Supabase Dashboard > SQL Editor, after 0001_init.sql.
-- Once an account has a verified MFA factor, its vault rows are only visible to sessions that
-- passed the second factor (aal2). Without this, 2FA would only be checked by the client.

create function public.mfa_satisfied() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

-- Restrictive: combined with AND on top of the "own rows" policies from 0001.
create policy "mfa: profiles" on public.profiles as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
create policy "mfa: items" on public.vault_items as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
