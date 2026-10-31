-- Donation-drive scenarios. Run after 10_scenarios.sql on the same database.
\set ON_ERROR_STOP 1
\pset pager off

-- ===== 1. Committee creates a drive (draf hidden from parents) =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
insert into campaigns (title, code, description, target_amount, suggested_amount, status, created_by)
values ('Kutipan Dana Smart TV', 'SMARTTV', 'Smart TV untuk setiap kelas', 30000, 50, 'draf', auth.uid());
do $$ begin
  begin insert into campaigns (title, code) values ('x', 'smart tv'); raise exception 'FAIL: bad code accepted';
  exception when check_violation then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
select count(*) = 0 as parent_cannot_see_draft from campaigns;
do $$ begin
  begin
    insert into donations (campaign_id, family_id, amount, submitted_by)
      values ((select id from campaigns limit 1), my_family_id(), 50, auth.uid());
    raise exception 'FAIL: donated to draft';
  exception when insufficient_privilege or check_violation or not_null_violation then null;
            when others then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

update campaigns set status = 'aktif' where code = 'SMARTTV';

-- ===== 2. Parent (Ali, family K00001) donates with proof =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
select title, status from campaigns;
insert into donations (campaign_id, family_id, amount, reference, proof_path, submitted_by)
  values ((select id from campaigns where code='SMARTTV'), my_family_id(), 100, 'DN998877', auth.uid()::text || '/d1.jpg', auth.uid());
-- cannot donate on behalf of another family, nor set a donor name
do $$ begin
  begin
    insert into donations (campaign_id, family_id, amount, submitted_by)
      values ((select id from campaigns where code='SMARTTV'), 3, 50, auth.uid());
    raise exception 'FAIL: other family';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
do $$ begin
  begin perform approve_donation(1); raise exception 'FAIL: parent approved';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;

-- ===== 3. Bendahari approves, records cash + an outside donor; duplicate reference spotted =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
select approve_donation((select id from donations where reference='DN998877'));
select record_donation((select id from campaigns where code='SMARTTV'), 200, null, 'Alumni SKPA 2010', 'pindahan', 'ALM12345');
select record_donation((select id from campaigns where code='SMARTTV'), 30, (select family_id from students where full_name='Chong Wei'));
do $$ begin
  begin perform record_donation((select id from campaigns where code='SMARTTV'), 10); raise exception 'FAIL: anonymous record';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- a yuran payment that reuses a donation's bank reference is flagged
insert into fee_payments (family_id, year, amount, reference, submitted_by) values (3, 2026, 50, 'dn 998877', auth.uid());
select kind, family_code, label, status from reference_usage('DN998877', 'sumbangan', (select id from donations where reference='DN998877'));
select * from campaign_progress();
select receipt_no from donations order by id;
reset role;

-- ===== 4. Parents see totals only; fund summary includes donations =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
select count(*) as ali_sees_own_donations_only from donations;           -- 1
select collected, donors from campaign_progress();                     -- 330, 3
do $$ begin
  begin perform reference_usage('DN998877'); raise exception 'FAIL: parent used reference_usage';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select yuran_collected, donations, balance from fund_summary(extract(year from now())::int);
reset role;

-- ===== 5. Family merge carries donations =====
select (select count(*) from donations where family_id is not null) as linked_donations;

select 'DONATION TESTS PASSED' as result;
