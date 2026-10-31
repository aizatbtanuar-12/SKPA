-- =====================================================================
-- Migration 003: profile repair
-- Fixes "loading forever" for accounts registered before 001 was run
-- (they have a login but no row in profiles). Safe to run more than once.
-- =====================================================================

-- 1. Create missing profiles for every existing login
insert into public.profiles (id, full_name, phone, ic_no, pdpa_consent_at)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', ''),
       u.raw_user_meta_data->>'phone',
       public.norm_ic(u.raw_user_meta_data->>'ic_no'),
       case when u.raw_user_meta_data->>'pdpa_consent' = 'true' then now() end
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id);

-- 2. Let the app create a missing profile for the signed-in user by itself
create or replace function public.ensure_my_profile() returns void
language plpgsql security definer set search_path = public as $$
declare u auth.users;
begin
  if auth.uid() is null then return; end if;
  select * into u from auth.users where id = auth.uid();
  insert into profiles (id, full_name, phone, ic_no, pdpa_consent_at)
  values (u.id, coalesce(u.raw_user_meta_data->>'full_name', ''), u.raw_user_meta_data->>'phone',
          norm_ic(u.raw_user_meta_data->>'ic_no'),
          case when u.raw_user_meta_data->>'pdpa_consent' = 'true' then now() end)
  on conflict (id) do nothing;
end $$;
grant execute on function public.ensure_my_profile() to authenticated;
