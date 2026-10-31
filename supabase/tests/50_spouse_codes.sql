-- Spouse linking and gap-free family codes (migration 011). Run after 40_access.sql on the same database.
\set ON_ERROR_STOP 1
\pset pager off

-- codes after everything earlier tests did: K00001..K0000n with no gaps
select count(*) = max(substring(family_code from 2)::int) as codes_have_no_gaps,
       count(*) = count(distinct family_code) as codes_unique from families;

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b1','wife@x','{"full_name":"Aizat binti Anuar","ic_no":"880101106001","relation":"ibu"}'),
 ('00000000-0000-0000-0000-0000000000b2','husband@x','{"full_name":"Luqman bin Ali","ic_no":"860202106002","relation":"bapa"}');

-- wife registers a child; class teacher approves -> her family
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
set role authenticated;
insert into child_claims (user_id, child_name, child_ic, class_id, relation)
  values (auth.uid(), 'Affan', '190303106003', (select id from classes where name='4 AMANAH'), 'ibu');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
set role authenticated;
select approve_claim((select id from child_claims where user_id='00000000-0000-0000-0000-0000000000b1'));
reset role;
select count(*) = max(substring(family_code from 2)::int) as still_no_gaps from families;

-- ===== A. wife adds husband (whose account existed before) =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
set role authenticated;
select save_spouse('Luqman bin Ali', '860202-10-6002', null, 'ibu') is null as saved_without_warning;
reset role;
select (select family_id from guardians where user_id='00000000-0000-0000-0000-0000000000b2')
     = (select family_id from guardians where user_id='00000000-0000-0000-0000-0000000000b1') as husband_account_in_same_family;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
set role authenticated;
select count(*) = 1 as husband_sees_child from students where ic_no = '190303106003';
reset role;

-- ===== B. spouse who registers AFTER being named is linked at sign-up =====
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
set role authenticated;
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000c1','mum2@x','{"full_name":"Ibu Dua","ic_no":"900101106011","relation":"ibu"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
set role authenticated;
insert into child_claims (user_id, child_name, child_ic, class_id, relation)
  values (auth.uid(), 'Anak Dua', '190404106012', (select id from classes where name='4 AMANAH'), 'ibu');
select save_spouse('Bapa Dua', '890101106010', null, 'ibu');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
set role authenticated;
select approve_claim((select id from child_claims where user_id='00000000-0000-0000-0000-0000000000c1'));
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000c2','dad2@x','{"full_name":"Bapa Dua","ic_no":"890101106010"}');
select (select family_id from guardians where user_id='00000000-0000-0000-0000-0000000000c2')
     = (select family_id from guardians where user_id='00000000-0000-0000-0000-0000000000c1') as late_spouse_linked_on_signup;

-- ===== C. two separate families join only when both parents name each other =====
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000d1','p@x','{"full_name":"Pak Tiga","ic_no":"810101106021","relation":"bapa"}'),
 ('00000000-0000-0000-0000-0000000000d2','m@x','{"full_name":"Mak Tiga","ic_no":"820101106022","relation":"ibu"}');
insert into child_claims (user_id, child_name, child_ic, class_id, relation) values
 ('00000000-0000-0000-0000-0000000000d1','Kakak Tiga','170101106023',(select id from classes where name='4 AMANAH'),'bapa'),
 ('00000000-0000-0000-0000-0000000000d2','Adik Tiga','180101106024',(select id from classes where name='4 AMANAH'),'ibu');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
set role authenticated;
select approve_claim(id) from child_claims where user_id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2') order by id;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false);
set role authenticated;
select save_spouse('Mak Tiga', '820101106022', null, 'bapa') like 'Pasangan anda sudah mempunyai rekod keluarga sendiri%' as one_sided_asks_spouse;
reset role;
select count(distinct family_id) = 2 as still_two_families from students where ic_no in ('170101106023','180101106024');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d2',false);
set role authenticated;
select save_spouse('Pak Tiga', '810101106021', null, 'ibu') is null as mutual_saved;
reset role;
select count(distinct family_id) = 1 as joined_into_one_family from students where ic_no in ('170101106023','180101106024');
select count(*) = 4 as both_parents_on_both_children from student_guardians sg join students s on s.id = sg.student_id
 where s.ic_no in ('170101106023','180101106024');
select count(*) = max(substring(family_code from 2)::int) as no_gaps_after_merge_and_new from families;

select 'SPOUSE & CODE TESTS PASSED' as result;
