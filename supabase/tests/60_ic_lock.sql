-- IC lock (migration 013). Run after 50_spouse_codes.sql on the same database.
\set ON_ERROR_STOP 1
create or replace function pg_temp.refused(q text) returns boolean language plpgsql as $$
begin begin execute q; return false; exception when others then return true; end; end $$;

-- Ali is verified (linked to his family): he cannot change his own IC
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
select my_ic_locked() as ali_locked;
select pg_temp.refused($q$update profiles set ic_no = '800101109999' where id = auth.uid()$q$) as ali_cannot_change_ic;
update profiles set phone = '0120000000' where id = auth.uid();
select phone = '0120000000' as ali_can_still_change_phone from profiles where id = auth.uid();
reset role;
-- an AJK / chairman cannot change it either (not the administrator)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
select pg_temp.refused($q$update profiles set ic_no = '800101109999' where id = '00000000-0000-0000-0000-0000000000e1'$q$)
    or (select ic_no from profiles where id = '00000000-0000-0000-0000-0000000000e1') = '800101101111' as chairman_cannot_change_ic;
reset role;
-- the administrator can, and the family record follows
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
set role authenticated;
update profiles set ic_no = '800101-10-9999' where id = '00000000-0000-0000-0000-0000000000e1';
reset role;
select (select ic_no from profiles where id = '00000000-0000-0000-0000-0000000000e1') = '800101109999'
   and (select ic_no from guardians where user_id = '00000000-0000-0000-0000-0000000000e1') = '800101109999' as admin_changed_and_family_followed;
-- an IC that belongs to another parent is refused
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
set role authenticated;
select pg_temp.refused($q$update profiles set ic_no = '820202102222' where id = '00000000-0000-0000-0000-0000000000e1'$q$) as duplicate_refused;
reset role;
-- a parent who is not verified yet can still correct their own IC
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f3',false);
set role authenticated;
select not my_ic_locked() as outsider_not_locked;
update profiles set ic_no = '790909107778' where id = auth.uid();
select ic_no = '790909107778' as unverified_can_fix_ic from profiles where id = auth.uid();
reset role;
select 'IC LOCK TESTS PASSED' as result;
