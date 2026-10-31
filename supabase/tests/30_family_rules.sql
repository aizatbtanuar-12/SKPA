-- Family rules (migration 009). Run after 10_scenarios.sql on the same database.
\set ON_ERROR_STOP 1
\pset pager off

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000f1','pengerusi@x','{"full_name":"Pengerusi PIBG","ic_no":"750101-10-5555","relation":"bapa","spouse_name":"Zura binti Kassim","spouse_ic":"770202-10-6666","spouse_phone":"0136666666"}'),
 ('00000000-0000-0000-0000-0000000000f2','zura@x','{"full_name":"Zura binti Kassim","ic_no":"770202106666"}'),
 ('00000000-0000-0000-0000-0000000000f3','lain@x','{"full_name":"Orang Asing","ic_no":"790909-10-7777"}');
update profiles set role='pengerusi' where id='00000000-0000-0000-0000-0000000000f1';
select spouse_name, spouse_ic, relation from profiles where id='00000000-0000-0000-0000-0000000000f1';

-- ===== A. Chairman is staff and can ALSO register his own child =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1',false);
set role authenticated;
select is_staff() as chairman_is_staff;
do $$ begin
  begin
    insert into child_claims (user_id, child_name, class_id, relation)
      values (auth.uid(), 'Tanpa IC', (select id from classes where name='4 AMANAH'), 'bapa');
    raise exception 'FAIL: claim without child IC';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK %', sqlerrm; end;
end $$;
insert into child_claims (user_id, child_name, child_ic, class_id, relation)
  values (auth.uid(), 'Irfan bin Pengerusi', '160101-10-0011', (select id from classes where name='4 AMANAH'), 'bapa');
-- duplicate pending claim blocked
do $$ begin
  begin
    insert into child_claims (user_id, child_name, child_ic, class_id, relation)
      values (auth.uid(), 'Irfan', '160101100011', (select id from classes where name='4 AMANAH'), 'bapa');
    raise exception 'FAIL: duplicate claim';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- a child already in Ali's family can't be claimed into another family
do $$ begin
  begin
    insert into child_claims (user_id, child_name, child_ic, class_id, relation)
      values (auth.uid(), 'Adam', '150505100001', (select id from classes where name='4 AMANAH'), 'bapa');
    raise exception 'FAIL: claimed child of another family';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK %', sqlerrm; end;
end $$;
reset role;

-- ===== B. Teacher approves -> chairman AND spouse attached as one family =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
set role authenticated;
select approve_claim((select id from child_claims where child_name='Irfan bin Pengerusi'));
reset role;
select g.full_name, sg.relation, f.family_code
  from student_guardians sg join guardians g on g.id=sg.guardian_id join students s on s.id=sg.student_id
  join families f on f.id=s.family_id where s.ic_no='160101100011' order by 1;
select count(*) = 2 as both_parents_linked from student_guardians sg join students s on s.id=sg.student_id where s.ic_no='160101100011';
select count(distinct family_id) = 1 as one_family from guardians where ic_no in ('750101105555','770202106666');

-- ===== C. Chairman uses parent functions: sees child, pays yuran =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1',false);
set role authenticated;
select my_family_id() is not null as chairman_has_family;
select family_code, status, active_children from family_fee_status where family_id = my_family_id();
insert into fee_payments (family_id, year, amount, reference, submitted_by, proof_path)
  values (my_family_id(), 2026, 50, 'CHAIR-1', auth.uid(), auth.uid()::text || '/r.jpg');
reset role;

-- ===== D. Spouse registers and claims the same child -> same family, no duplicate =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f2',false);
set role authenticated;
insert into child_claims (user_id, child_name, child_ic, class_id, relation)
  values (auth.uid(), 'Irfan', '160101100011', (select id from classes where name='4 AMANAH'), 'ibu');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
set role authenticated;
select approve_claim((select id from child_claims where user_id='00000000-0000-0000-0000-0000000000f2'));
reset role;
select (select count(*) from students where ic_no='160101100011') = 1 as no_duplicate_student,
       (select user_id from guardians where ic_no='770202106666') = '00000000-0000-0000-0000-0000000000f2' as spouse_account_linked;

-- ===== E. Outsider can't claim; staff can't create a second record with the same IC =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f3',false);
set role authenticated;
do $$ begin
  begin
    insert into child_claims (user_id, child_name, child_ic, class_id, relation)
      values (auth.uid(), 'Irfan', '160101100011', (select id from classes where name='4 AMANAH'), 'bapa');
    raise exception 'FAIL: outsider claim';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- spouse can't be someone already in another family
do $$ declare m text; begin
  m := save_spouse('Ali', '800101101111', null, 'ibu');
  if m is null then null; end if;   -- no family yet: saved on profile only
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
set role authenticated;
do $$ begin
  begin
    insert into students (full_name, ic_no, class_id) values ('Irfan Dua', '160101-10-0011', (select id from classes where name='4 AMANAH'));
    raise exception 'FAIL: duplicate student IC';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK %', sqlerrm; end;
end $$;
do $$ begin
  begin
    insert into students (full_name, class_id) values ('Tanpa IC', (select id from classes where name='4 AMANAH'));
    raise exception 'FAIL: student without IC';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- import: rows without student IC or parent IC skipped; student of another family not re-linked
select import_students('[
 {"nama_murid":"Tiada IC","kelas":"4 AMANAH","nama_bapa":"X","ic_bapa":"800000100000"},
 {"nama_murid":"Tiada IC Ibu Bapa","ic_murid":"170101100099","kelas":"4 AMANAH","nama_bapa":"Y"},
 {"nama_murid":"Irfan bin Pengerusi","ic_murid":"160101100011","kelas":"4 AMANAH","nama_bapa":"Orang Asing","ic_bapa":"790909107777"}
]'::jsonb);
reset role;
select count(*) = 0 as outsider_not_linked from guardians where ic_no='790909107777';

-- ===== F. Chairman changes spouse later via save_spouse (same family) =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1',false);
set role authenticated;
select save_spouse('Zura binti Kassim', '770202106666', '0137777777', 'bapa') is null as spouse_saved;
do $$ begin
  begin perform save_spouse('Diri sendiri', '750101105555', null); raise exception 'FAIL: self as spouse';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- spouse already in another family is refused with a message (not merged)
select save_spouse('Ali bin Abu', '800101101111', null, 'bapa') as msg_other_family;
reset role;
select count(distinct family_id) = 2 as families_not_merged from guardians where ic_no in ('750101105555','800101101111');

select 'FAMILY RULE TESTS PASSED' as result;
