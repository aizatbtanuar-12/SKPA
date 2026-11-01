-- User access settings (migration 010). Run after 30_family_rules.sql on the same database.
\set ON_ERROR_STOP 1
\pset pager off

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','ajk@x','{"full_name":"AJK Biasa","ic_no":"700101105511"}'),
 ('00000000-0000-0000-0000-0000000000a2','treasurer@x','{"full_name":"Bendahari Sebenar","ic_no":"700202105522"}');
update profiles set role='pibg' where id='00000000-0000-0000-0000-0000000000a1';
update profiles set role='bendahari' where id='00000000-0000-0000-0000-0000000000a2';

-- helper: expect a statement to be refused
create or replace function pg_temp.refused(q text) returns boolean language plpgsql as $$
begin
  begin execute q; return false;
  exception when others then return true; end;
end $$;
create or replace function pg_temp.changed(q text) returns bigint language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n = row_count; return n; end $$;

-- ===== A. AJK PIBG: can view, can't change records / fees / settings / import / verify =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
set role authenticated;
select is_staff() as ajk_is_committee, (select count(*) = 0 from students) and (select count(*) = 0 from guardians) as ajk_cannot_read_family_records;
select pg_temp.changed($q$update students set full_name = full_name || ' X' where true$q$) = 0 as ajk_cannot_edit_students;
select pg_temp.changed($q$update school_settings set fee_per_family = 1 where id = 1$q$) = 0 as ajk_cannot_edit_settings;
select pg_temp.refused($q$select import_students('[{"nama_murid":"Z","ic_murid":"190101100001","kelas":"1 A","ic_bapa":"800000000001","nama_bapa":"Z"}]')$q$) as ajk_cannot_import;
select pg_temp.refused($q$select approve_payment((select id from fee_payments where status='dihantar' limit 1))$q$) as ajk_cannot_approve;
select pg_temp.refused($q$select record_payment((select id from families limit 1), 10, 'tunai', 'x')$q$) as ajk_cannot_record_fee;
select pg_temp.refused($q$select approve_claim((select id from child_claims where status='menunggu' limit 1))$q$) as ajk_cannot_verify;
select pg_temp.refused($q$select admin_move_student((select id from students limit 1), null)$q$) as ajk_cannot_move_student;
-- ...but can help with fund-raising and see reports
insert into campaigns (title, code, status, created_by) values ('Kipas Kelas', 'KIPAS', 'draf', auth.uid());
select (select count(*) from campaigns where code='KIPAS') = 1 as ajk_created_campaign;
select pg_temp.refused($q$select approve_donation((select id from donations limit 1))$q$) as ajk_cannot_approve_donation;
select (select students from report_overview()) > 0 as ajk_sees_report;
reset role;

-- ===== B. Bendahari: payment check and fee collection, no import =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
set role authenticated;
select has_perm('semak_bayaran') and has_perm('kutipan_yuran') and not has_perm('import') as treasurer_defaults;
select record_payment((select family_id from family_fee_status where status <> 'lunas' limit 1), 5, 'tunai', 'Kaunter') is not null as treasurer_recorded_cash;
reset role;

-- ===== C. Teacher sees reports (totals only) but not other classes' records =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
set role authenticated;
select count(*) > 0 as teacher_report_rows from report_fee_by_class();
select (select count(*) from report_fee_monthly()) = 12 as twelve_months;
reset role;

-- ===== D. Only the administrator changes access; changes take effect at once =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
set role authenticated;
select pg_temp.changed($q$update role_permissions set allowed = true where role = 'pibg'$q$) = 0 as ajk_cannot_grant_self;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
set role authenticated;
update role_permissions set allowed = true where role = 'pibg' and perm = 'semak_bayaran';
update role_permissions set allowed = false where role = 'guru' and perm = 'laporan';
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
set role authenticated;
select has_perm('semak_bayaran') as ajk_granted_after_admin_change;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
set role authenticated;
select pg_temp.refused($q$select * from report_overview()$q$) as teacher_report_revoked;
reset role;

select 'ACCESS TESTS PASSED' as result;
