-- Scenario tests. Run as superuser; switches identity with set_config + set role.
\set ON_ERROR_STOP 1
\pset pager off

-- users
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','admin@x','{"full_name":"Admin Sekolah"}'),
 ('00000000-0000-0000-0000-00000000000b','bendahari@x','{"full_name":"Bendahari PIBG"}'),
 ('00000000-0000-0000-0000-00000000000c','cikgu4a@x','{"full_name":"Cikgu Aminah"}'),
 ('00000000-0000-0000-0000-00000000000d','cikgu2b@x','{"full_name":"Cikgu Badrul"}'),
 ('00000000-0000-0000-0000-0000000000e1','ali@x','{"full_name":"Ali bin Abu","ic_no":"800101-10-1111","phone":"0121111111"}'),
 ('00000000-0000-0000-0000-0000000000e2','siti@x','{"full_name":"Siti binti Omar","ic_no":"820202-10-2222"}'),
 ('00000000-0000-0000-0000-0000000000e3','imposter@x','{"full_name":"Orang Lain","ic_no":"800101101111"}');
update profiles set role='admin' where id='00000000-0000-0000-0000-00000000000a';
update profiles set role='pibg'  where id='00000000-0000-0000-0000-00000000000b';
update profiles set role='guru'  where id in ('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000d');
select full_name, ic_no, role from profiles order by full_name;

-- ===== 1. Import as bendahari: siblings across classes share father's IC =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
select import_students('[
 {"nama_murid":"Adam bin Ali","ic_murid":"150505-10-0001","kelas":"4 Amanah","nama_bapa":"Ali bin Abu","ic_bapa":"800101-10-1111","tel_bapa":"012-1111111","nama_ibu":"Siti binti Omar","ic_ibu":"820202102222"},
 {"nama_murid":"Aisyah binti Ali","ic_murid":"170707-10-0002","kelas":"2 bestari","nama_ibu":"Siti binti Omar","ic_ibu":"820202-10-2222"},
 {"nama_murid":"Chong Wei","ic_murid":"160606-10-0003","kelas":"4 Amanah","nama_bapa":"Chong Ah Kow","ic_bapa":"780808-10-3333"},
 {"nama_murid":"Dewi","kelas":"2 Bestari","nama_ibu":"Kamala"},
 {"nama_murid":"","kelas":"1 A"}
]'::jsonb);
reset role;
select s.full_name, c.name kelas, f.family_code from students s join classes c on c.id=s.class_id join families f on f.id=s.family_id order by s.id;
-- Expect: Adam & Aisyah same family (linked via mother IC); Chong & Dewi separate
select count(distinct family_id) = 3 as three_families from students;

-- assign class teachers
update classes set class_teacher_id='00000000-0000-0000-0000-00000000000c' where name='4 AMANAH';
update classes set class_teacher_id='00000000-0000-0000-0000-00000000000d' where name='2 BESTARI';

-- ===== 2. Re-import is idempotent =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
select import_students('[{"nama_murid":"Adam bin Ali","ic_murid":"150505100001","kelas":"4 AMANAH","nama_bapa":"Ali bin Abu","ic_bapa":"800101101111","tel_bapa":"0129999999"}]'::jsonb);
reset role;
select count(*) = 4 as still_4_students, (select phone from guardians where ic_no='800101101111') as father_phone_updated from students;

-- ===== 3. Parent without access before verification =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
select count(*) as students_visible_before_link from students;   -- expect 0
insert into child_claims (user_id, child_name, child_ic, class_id, relation)
  values (auth.uid(), 'Adam Ali', '150505100001', (select id from classes where name='4 AMANAH'), 'bapa');
insert into child_claims (user_id, child_name, class_id, relation)
  values (auth.uid(), 'Yusuf bin Ali', (select id from classes where name='2 BESTARI'), 'bapa');
-- parent cannot self-approve
do $$ begin
  update child_claims set status='dipadan' where user_id=auth.uid();
  if found then raise exception 'FAIL: parent updated claim'; end if;
end $$;
reset role;

-- ===== 4. Teacher 4A sees only own class claim, matches to existing Adam =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
set role authenticated;
select child_name, status from child_claims;                     -- expect only Adam claim
select * from suggest_matches((select id from child_claims where child_name='Adam Ali'));
select approve_claim((select id from child_claims where child_name='Adam Ali'),
                     (select student_id from suggest_matches((select id from child_claims where child_name='Adam Ali')) limit 1));
select count(*) as teacher4a_students from students;             -- expect 2 (Adam, Chong)
-- teacher cannot approve another class's claim
do $$ begin
  begin
    perform approve_claim((select id from child_claims where child_name='Yusuf bin Ali'));
    raise exception 'FAIL: cross-class approve';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- ===== 5. Teacher 2B creates Yusuf as a new record -> joins Ali's family =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
set role authenticated;
select approve_claim((select id from child_claims where child_name='Yusuf bin Ali'), null, 'Murid baru pindah');
reset role;
select s.full_name, f.family_code from students s join families f on f.id=s.family_id order by f.family_code, s.full_name;
select count(*) = 3 as ali_family_has_3_children from students
 where family_id = (select family_id from guardians where ic_no='800101101111');

-- ===== 6. Parent now sees own family only; pays once for the family =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
select full_name from students order by 1;                       -- Adam, Aisyah, Yusuf
select family_code, status, active_children, fee_due from family_fee_status;
insert into fee_payments (family_id, year, amount, reference, submitted_by, proof_path)
  values (my_family_id(), 2026, 50, 'DuitNow 123', auth.uid(), auth.uid()::text || '/resit.jpg');
-- cannot submit for another family
do $$ begin
  begin
    insert into fee_payments (family_id, year, amount, submitted_by)
      values (3, 2026, 50, auth.uid());
    raise exception 'FAIL: paid for other family';
  exception when insufficient_privilege or check_violation then null;
           when others then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
-- cannot approve own payment
do $$ begin
  begin perform approve_payment(1); raise exception 'FAIL: self approve';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select status from family_fee_status;                            -- menunggu
reset role;

-- ===== 7. Imposter with same IC cannot hijack =====
insert into child_claims (user_id, child_name, class_id, relation)
  values ('00000000-0000-0000-0000-0000000000e3','Adam',(select id from classes where name='4 AMANAH'),'bapa');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
set role authenticated;
do $$ begin
  begin
    perform approve_claim((select id from child_claims where user_id='00000000-0000-0000-0000-0000000000e3'),
                          (select id from students where full_name='Adam bin Ali'));
    raise exception 'FAIL: imposter linked';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK imposter blocked: %', sqlerrm;
  end;
end $$;
reset role;

-- ===== 8. Bendahari approves; cash payment for another family =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
select approve_payment((select id from fee_payments where status='dihantar' limit 1));
select record_payment((select family_id from students where full_name='Chong Wei'), 50, 'tunai', 'Kaunter');
select family_code, status, paid, children from family_fee_status order by family_code;
insert into transactions (kind, category, amount, description) values ('keluar','Program',30,'Hadiah Hari Sukan');
reset role;

-- ===== 9. Parent sees transparency summary, not other families =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
select * from fund_summary(2026);
select count(*) as fee_rows_visible from fee_payments;           -- 1 (own)
select count(*) as tx_visible from transactions;                 -- 1
reset role;

-- ===== 10. AGM: one vote per family, secret ballot =====
insert into agm_meetings (title, status, quorum) values ('Mesyuarat Agung 2026','dibuka',2);
insert into agm_motions (meeting_id, title, status) values (1,'Lulus minit mesyuarat lalu','dibuka');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
do $$ begin
  begin perform cast_vote(1,'Setuju'); raise exception 'FAIL: voted without check-in';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select agm_check_in(1);
select cast_vote(1,'Setuju');
do $$ begin
  begin perform cast_vote(1,'Setuju'); raise exception 'FAIL: double vote';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
do $$ begin
  begin perform motion_results(1); raise exception 'FAIL: parent saw open results';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
select * from motion_results(1);
select count(*) as staff_sees_raw_votes from agm_votes;          -- 0: secret ballot
select * from agm_stats(1);
reset role;

-- ===== 11. Role protection & memos =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
do $$ begin
  begin update profiles set role='admin' where id=auth.uid(); raise exception 'FAIL: self-promote';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
set role authenticated;
insert into memos (title, body, audience, class_id, author_id)
  values ('Lawatan', 'Lawatan ke zoo', 'kelas', (select id from classes where name='2 BESTARI'), auth.uid());
do $$ begin
  begin insert into memos (title, body, audience, author_id) values ('x','y','semua',auth.uid());
        raise exception 'FAIL: guru posted to all';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
set role authenticated;
select title from memos;                                         -- Ali has child in 2 BESTARI -> sees it
reset role;

-- ===== 12. Manual override: move Dewi into Chong's family and back =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
set role authenticated;
select admin_move_student((select id from students where full_name='Dewi'),
                          (select family_id from students where full_name='Chong Wei'));
select count(*) = 2 as chong_family_two from students where family_id=(select family_id from students where full_name='Chong Wei');
reset role;

select 'ALL TESTS PASSED' as result;
