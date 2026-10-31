-- =====================================================================
-- 010: user access settings (Tetapan → Akses pengguna)
--  * New role: Bendahari PIBG (treasurer).
--  * Committee roles (Pentadbir, Pengerusi, Bendahari, AJK PIBG) can still VIEW
--    records. Every CHANGE now needs a named permission, set per role by the
--    administrator. Pentadbir always has every permission.
--  * Reports (Laporan) for the committee and teachers, as aggregate functions.
-- Safe to run more than once. Existing admin choices are kept on re-run.
-- =====================================================================

alter type app_role add value if not exists 'bendahari' after 'pengerusi';

-- committee = may view records (no changes implied)
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('admin','pengerusi','bendahari','pibg') from profiles where id = auth.uid()), false)
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text = 'admin' from profiles where id = auth.uid()), false)
$$;

-- ---------- permissions ----------
create table if not exists role_permissions (
  role     text not null check (role in ('pengerusi','bendahari','pibg','panitia','guru')),
  perm     text not null,
  allowed  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, perm)
);
alter table role_permissions enable row level security;
grant select, insert, update, delete on role_permissions to authenticated;
drop policy if exists role_perms_read on role_permissions;
create policy role_perms_read on role_permissions for select using (auth.uid() is not null);
drop policy if exists role_perms_admin on role_permissions;
create policy role_perms_admin on role_permissions for all using (is_admin()) with check (is_admin());

-- defaults (only inserted the first time; the administrator changes them in Tetapan)
--                          pengerusi bendahari  ajk    panitia  guru
insert into role_permissions (role, perm, allowed)
select r.role, p.perm, p.def[r.i]
  from (values ('pengerusi',1),('bendahari',2),('pibg',3),('panitia',4),('guru',5)) as r(role, i)
  cross join (values
    ('rekod_urus',      array[true,  true,  false, false, false]),
    ('kutipan_yuran',   array[true,  true,  false, false, false]),
    ('semak_bayaran',   array[true,  true,  false, false, false]),
    ('semak_sumbangan', array[true,  true,  false, false, false]),
    ('kempen',          array[true,  true,  true,  false, false]),
    ('sahkan_murid',    array[true,  false, false, false, false]),
    ('import',          array[true,  false, false, false, false]),
    ('tetapan',         array[true,  true,  false, false, false]),
    ('kewangan',        array[true,  true,  false, false, false]),
    ('agm',             array[true,  false, false, false, false]),
    ('memo_semua',      array[true,  true,  true,  true,  false]),
    ('laporan',         array[true,  true,  true,  true,  true])
  ) as p(perm, def)
on conflict (role, perm) do nothing;

create or replace function has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when (select role::text from profiles where id = auth.uid()) = 'admin' then true
    else coalesce((select rp.allowed from role_permissions rp join profiles pr on pr.role::text = rp.role
                    where pr.id = auth.uid() and rp.perm = p), false)
  end
$$;
grant execute on function has_perm(text) to authenticated;

-- ---------- table rules: viewing stays with the committee, changes need a permission ----------
drop policy if exists settings_write on school_settings;
create policy settings_write on school_settings for update using (has_perm('tetapan'));
drop policy if exists classes_write on classes;
create policy classes_write on classes for all using (is_admin()) with check (is_admin());

drop policy if exists families_write on families;
create policy families_write on families for all using (has_perm('rekod_urus')) with check (has_perm('rekod_urus'));
drop policy if exists guardians_write on guardians;
create policy guardians_write on guardians for all using (has_perm('rekod_urus')) with check (has_perm('rekod_urus'));
drop policy if exists students_write on students;
create policy students_write on students for all using (has_perm('rekod_urus')) with check (has_perm('rekod_urus'));
drop policy if exists students_teacher_update on students;
create policy students_teacher_update on students for update
  using (teaches_class(class_id)) with check (teaches_class(class_id) or has_perm('rekod_urus'));
drop policy if exists sg_write on student_guardians;
create policy sg_write on student_guardians for all using (has_perm('rekod_urus')) with check (has_perm('rekod_urus'));

drop policy if exists claims_staff on child_claims;
create policy claims_staff on child_claims for update using (has_perm('sahkan_murid'));

drop policy if exists fees_staff on fee_payments;
create policy fees_staff on fee_payments for all
  using (has_perm('semak_bayaran') or has_perm('kutipan_yuran'))
  with check (has_perm('semak_bayaran') or has_perm('kutipan_yuran'));

drop policy if exists memos_insert on memos;
create policy memos_insert on memos for insert with check (
  author_id = auth.uid() and (has_perm('memo_semua') or (audience = 'kelas' and teaches_class(class_id))));
drop policy if exists memos_modify on memos;
create policy memos_modify on memos for update using (author_id = auth.uid() or is_admin());
drop policy if exists memos_delete on memos;
create policy memos_delete on memos for delete using (author_id = auth.uid() or is_admin());

drop policy if exists programs_staff on programs;
create policy programs_staff on programs for all using (has_perm('kewangan')) with check (has_perm('kewangan'));
drop policy if exists txn_staff on transactions;
create policy txn_staff on transactions for all using (has_perm('kewangan')) with check (has_perm('kewangan'));

drop policy if exists agm_meet_staff on agm_meetings;
create policy agm_meet_staff on agm_meetings for all using (has_perm('agm')) with check (has_perm('agm'));
drop policy if exists agm_mot_staff on agm_motions;
create policy agm_mot_staff on agm_motions for all using (has_perm('agm')) with check (has_perm('agm'));
drop policy if exists agm_att_staff on agm_attendance;
create policy agm_att_staff on agm_attendance for delete using (has_perm('agm'));

drop policy if exists campaigns_staff on campaigns;
create policy campaigns_staff on campaigns for all using (has_perm('kempen')) with check (has_perm('kempen'));
drop policy if exists donations_staff on donations;
create policy donations_staff on donations for all using (has_perm('semak_sumbangan')) with check (has_perm('semak_sumbangan'));

drop policy if exists "bukti: staff delete" on storage.objects;
create policy "bukti: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'bukti-bayaran' and (public.has_perm('semak_bayaran') or public.has_perm('semak_sumbangan')));
drop policy if exists "poster: staff upload" on storage.objects;
create policy "poster: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'poster-kempen' and public.has_perm('kempen'));
drop policy if exists "poster: staff delete" on storage.objects;
create policy "poster: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'poster-kempen' and public.has_perm('kempen'));

-- ---------- functions: the same bodies as before, with the matching permission ----------
-- import_students: needs "import"
create or replace function import_students(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_class bigint; v_student bigint; v_g bigint; v_ic text;
  v_name text; v_kelas text; n_new int := 0; n_upd int := 0; n_skip int := 0;
  warnings text[] := '{}'; i int := 0; rel text; has_parent boolean; v_gic text; v_ok boolean;
begin
  if not has_perm('import') then raise exception 'Akses ditolak.'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_name  := trim(coalesce(r->>'nama_murid',''));
    v_kelas := upper(regexp_replace(trim(coalesce(r->>'kelas','')), '\s+', ' ', 'g'));
    v_ic    := norm_ic(r->>'ic_murid');
    if v_name = '' or v_kelas = '' then
      n_skip := n_skip + 1;
      warnings := warnings || format('Baris %s: nama murid atau kelas kosong — dilangkau', i);
      continue;
    end if;
    if v_ic is null or length(v_ic) <> 12 then
      n_skip := n_skip + 1;
      warnings := warnings || format('Baris %s (%s): No. MyKid / KP murid tiada atau bukan 12 digit — dilangkau', i, v_name);
      continue;
    end if;
    has_parent := false;
    foreach rel in array array['bapa','ibu','penjaga'] loop
      if length(coalesce(norm_ic(r->>('ic_'||rel)),'')) = 12 then has_parent := true; end if;
    end loop;
    if not has_parent then
      n_skip := n_skip + 1;
      warnings := warnings || format('Baris %s (%s): tiada No. KP bapa / ibu / penjaga yang sah — dilangkau', i, v_name);
      continue;
    end if;

    select id into v_class from classes where upper(name) = v_kelas;
    if v_class is null then
      insert into classes (name, year_level)
      values (v_kelas, nullif(substring(v_kelas from '^[1-6]'),'')::int)
      returning id into v_class;
    end if;

    select id into v_student from students where ic_no = v_ic;
    if v_student is null then
      select id into v_student from students
       where ic_no is null and lower(full_name) = lower(v_name) and class_id = v_class;
    end if;

    if v_student is null then
      insert into students (full_name, ic_no, class_id, source, created_by)
      values (v_name, v_ic, v_class, 'import', auth.uid()) returning id into v_student;
      n_new := n_new + 1;
    else
      update students set full_name = v_name, class_id = v_class, ic_no = v_ic, status = 'aktif'
       where id = v_student;
      n_upd := n_upd + 1;
    end if;

    -- the row may attach its parents if the student has none yet, or one of them is already in the family
    v_ok := not exists (select 1 from student_guardians where student_id = v_student);
    foreach rel in array array['bapa','ibu','penjaga'] loop
      v_gic := norm_ic(r->>('ic_'||rel));
      if v_gic is not null and may_join_student(v_student, v_gic) then v_ok := true; end if;
    end loop;

    foreach rel in array array['bapa','ibu','penjaga'] loop
      v_gic := norm_ic(r->>('ic_'||rel));
      if coalesce(trim(r->>('nama_'||rel)),'') <> '' and (v_gic is null or length(v_gic) <> 12) then
        warnings := warnings || format('Baris %s (%s): No. KP %s tiada / tidak sah — %s tidak disimpan', i, v_name, rel, rel);
        continue;
      end if;
      if v_gic is null then continue; end if;
      if not v_ok then
        warnings := warnings || format('Baris %s (%s): murid sudah berdaftar di bawah keluarga %s — %s tidak dipautkan',
                                       i, v_name, family_code_of_student(v_student), rel);
        continue;
      end if;
      v_g := upsert_guardian(r->>('nama_'||rel), v_gic, r->>('tel_'||rel), r->>('emel_'||rel));
      insert into student_guardians (student_id, guardian_id, relation)
      values (v_student, v_g, rel) on conflict do nothing;
    end loop;
  end loop;

  return jsonb_build_object('baru', n_new, 'dikemaskini', n_upd, 'dilangkau', n_skip, 'amaran', to_jsonb(warnings));
end $$;

-- admin_merge_families: needs "rekod_urus"
create or replace function admin_merge_families(p_a bigint, p_b bigint) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('rekod_urus') then raise exception 'Akses ditolak.'; end if;
  return merge_families(least(p_a,p_b), greatest(p_a,p_b));
end $$;

-- admin_move_student: needs "rekod_urus"
create or replace function admin_move_student(p_student bigint, p_family bigint default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint := p_family;
begin
  if not has_perm('rekod_urus') then raise exception 'Akses ditolak.'; end if;
  if v is null then v := new_family(); end if;
  update students set family_id = v where id = p_student;
  return v;
end $$;

-- approve_payment: needs "semak_bayaran"
create or replace function approve_payment(p_payment bigint, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare f fee_payments; r text;
begin
  if not has_perm('semak_bayaran') then raise exception 'Akses ditolak.'; end if;
  select * into f from fee_payments where id = p_payment for update;
  if f.status = 'diluluskan' then return f.receipt_no; end if;
  r := next_receipt_no(f.year);
  update fee_payments set status = 'diluluskan', receipt_no = r, review_note = p_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_payment;
  return r;
end $$;

-- reject_payment: needs "semak_bayaran"
create or replace function reject_payment(p_payment bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('semak_bayaran') then raise exception 'Akses ditolak.'; end if;
  update fee_payments set status = 'ditolak', review_note = p_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_payment and status = 'dihantar';
end $$;

-- record_payment: needs "kutipan_yuran"
create or replace function record_payment(p_family bigint, p_amount numeric, p_method text default 'tunai',
                                          p_reference text default null, p_year int default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_year int;
begin
  if not has_perm('kutipan_yuran') then raise exception 'Akses ditolak.'; end if;
  v_year := coalesce(p_year, (select current_year from school_settings where id = 1));
  insert into fee_payments (family_id, year, amount, method, reference, submitted_by)
  values (p_family, v_year, p_amount, p_method, p_reference, auth.uid()) returning id into v_id;
  return approve_payment(v_id, 'Direkod oleh bendahari');
end $$;

-- approve_donation: needs "semak_sumbangan"
create or replace function approve_donation(p_donation bigint, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare d donations; r text;
begin
  if not has_perm('semak_sumbangan') then raise exception 'Akses ditolak.'; end if;
  select * into d from donations where id = p_donation for update;
  if d.id is null then raise exception 'Sumbangan tidak dijumpai.'; end if;
  if d.status = 'diluluskan' then return d.receipt_no; end if;
  r := next_donation_receipt_no(extract(year from now())::int);
  update donations set status = 'diluluskan', receipt_no = r, review_note = p_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_donation;
  return r;
end $$;

-- reject_donation: needs "semak_sumbangan"
create or replace function reject_donation(p_donation bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('semak_sumbangan') then raise exception 'Akses ditolak.'; end if;
  update donations set status = 'ditolak', review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_donation and status = 'dihantar';
end $$;

-- record_donation: needs "semak_sumbangan"
create or replace function record_donation(p_campaign bigint, p_amount numeric, p_family bigint default null,
                                           p_donor_name text default null, p_method text default 'tunai',
                                           p_reference text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not has_perm('semak_sumbangan') then raise exception 'Akses ditolak.'; end if;
  if p_family is null and coalesce(trim(p_donor_name), '') = '' then
    raise exception 'Nyatakan kod keluarga atau nama penyumbang.';
  end if;
  insert into donations (campaign_id, family_id, donor_name, amount, method, reference, submitted_by)
  values (p_campaign, p_family, nullif(trim(p_donor_name), ''), p_amount, p_method, p_reference, auth.uid())
  returning id into v_id;
  return approve_donation(v_id, 'Direkod oleh bendahari');
end $$;

-- agm_check_in: needs "agm"
create or replace function agm_check_in(p_meeting bigint, p_family bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_family bigint := p_family; m agm_meetings;
begin
  select * into m from agm_meetings where id = p_meeting;
  if m.id is null then raise exception 'Mesyuarat tidak dijumpai.'; end if;
  if v_family is null or not has_perm('agm') then
    if m.status <> 'dibuka' then raise exception 'Pendaftaran kehadiran belum dibuka.'; end if;
    v_family := my_family_id();
    if v_family is null then raise exception 'Akaun anda belum dipautkan kepada mana-mana keluarga murid.'; end if;
  end if;
  insert into agm_attendance (meeting_id, family_id, checked_in_by)
  values (p_meeting, v_family, auth.uid()) on conflict do nothing;
end $$;

create or replace function can_review_claim(p_claim bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm('sahkan_murid') or exists (select 1 from child_claims c where c.id = p_claim and teaches_class(c.class_id))
$$;

-- Suggest existing students for a claim (same IC anywhere, or similar name in the class)
create or replace function suggest_matches(p_claim bigint)
returns table (student_id bigint, full_name text, class_name text, ic_last4 text, score real, reason text)
language plpgsql stable security definer set search_path = public as $$
declare c child_claims;
begin
  if not can_review_claim(p_claim) then raise exception 'Akses ditolak.'; end if;
  select * into c from child_claims where id = p_claim;
  return query
    select s.id, s.full_name, cl.name, right(s.ic_no, 4),
           case when s.ic_no is not null and s.ic_no = norm_ic(c.child_ic) then 1.0::real
                else similarity(lower(s.full_name), lower(c.child_name)) end,
           case when s.ic_no is not null and s.ic_no = norm_ic(c.child_ic) then 'No. KP sama'
                else 'Nama hampir sama' end
      from students s left join classes cl on cl.id = s.class_id
     where s.status = 'aktif'
       and ((s.ic_no is not null and s.ic_no = norm_ic(c.child_ic))
            or (s.class_id = c.class_id and similarity(lower(s.full_name), lower(c.child_name)) > 0.25))
     order by 5 desc
     limit 5;
end $$;

create or replace function approve_claim(p_claim bigint, p_student bigint default null, p_note text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare c child_claims; p profiles; v_g bigint; v_student bigint := p_student; v_new boolean := false;
begin
  if not can_review_claim(p_claim) then raise exception 'Akses ditolak.'; end if;
  select * into c from child_claims where id = p_claim for update;
  if c.status <> 'menunggu' then raise exception 'Permohonan ini telah diproses.'; end if;
  select * into p from profiles where id = c.user_id;
  if p.ic_no is null then raise exception 'Ibu bapa belum mengisi No. KP dalam profil.'; end if;

  -- an existing student with the same IC is always the one we attach to
  if v_student is null and norm_ic(c.child_ic) is not null then
    select id into v_student from students where ic_no = norm_ic(c.child_ic);
  end if;
  if v_student is not null then
    if (select ic_no from students where id = v_student) is distinct from norm_ic(c.child_ic)
       and (select ic_no from students where id = v_student) is not null and c.child_ic is not null then
      raise exception 'No. KP murid yang dipilih tidak sama dengan No. KP dalam permohonan.';
    end if;
    if not may_join_student(v_student, p.ic_no) then
      raise exception 'Murid ini telah berdaftar di bawah keluarga lain (%). Permohonan tidak boleh dipadankan.',
        family_code_of_student(v_student);
    end if;
    if not has_perm('sahkan_murid') and not exists (select 1 from students s where s.id = v_student and teaches_class(s.class_id)) then
      raise exception 'Murid ini bukan dalam kelas anda.';
    end if;
  end if;

  -- find guardian by IC (may already exist from import or as a spouse) and attach the account
  select id into v_g from guardians where ic_no = p.ic_no;
  if v_g is null then select id into v_g from guardians where user_id = c.user_id; end if;
  if v_g is null then
    insert into guardians (full_name, ic_no, phone, user_id)
    values (p.full_name, p.ic_no, p.phone, c.user_id) returning id into v_g;
  else
    if exists (select 1 from guardians where id = v_g and user_id is not null and user_id <> c.user_id) then
      raise exception 'No. KP ini telah dipautkan kepada akaun lain. Rujuk pentadbir.';
    end if;
    update guardians set user_id = c.user_id, phone = coalesce(phone, p.phone),
           full_name = case when coalesce(p.full_name,'') <> '' then p.full_name else full_name end
     where id = v_g;
  end if;

  if v_student is null then
    insert into students (full_name, ic_no, class_id, source, created_by)
    values (c.child_name, norm_ic(c.child_ic), c.class_id, 'ibubapa', auth.uid())
    returning id into v_student;
    v_new := true;
  else
    update students set status = 'aktif', class_id = coalesce(class_id, c.class_id) where id = v_student;
  end if;

  insert into student_guardians (student_id, guardian_id, relation)
  values (v_student, v_g, c.relation) on conflict do nothing;

  if p.relation is null then update profiles set relation = c.relation where id = c.user_id; end if;
  perform link_spouse(c.user_id, (select family_id from students where id = v_student));

  update child_claims set
    status = case when v_new then 'rekod_baru' else 'dipadan' end,
    student_id = v_student, review_note = p_note,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_claim;
  return v_student;
end $$;

-- ---------- Laporan (reports): totals only, no family details ----------
create or replace function report_overview(p_year int default null)
returns table (students bigint, families bigint, guardians bigint, parent_accounts bigint,
               pending_claims bigint, classes bigint, fee_due numeric, fee_collected numeric,
               families_paid bigint, donations numeric, expenses numeric)
language plpgsql stable security definer set search_path = public as $$
declare y int; fee numeric;
begin
  if not has_perm('laporan') then raise exception 'Akses ditolak.'; end if;
  y := coalesce(p_year, (select current_year from school_settings where id = 1));
  select fee_per_family into fee from school_settings where id = 1;
  return query
  with fam as (
    select f.id, coalesce((select sum(p.amount) from fee_payments p
                            where p.family_id = f.id and p.year = y and p.status = 'diluluskan'), 0) as paid
      from families f where family_in_scope(f.id, y))
  select (select count(*) from students where status = 'aktif'),
         (select count(*) from fam),
         (select count(*) from guardians g where exists (select 1 from fam where fam.id = g.family_id)),
         (select count(*) from guardians g where g.user_id is not null and exists (select 1 from fam where fam.id = g.family_id)),
         (select count(*) from child_claims where status = 'menunggu'),
         (select count(*) from classes where active),
         (select count(*) from fam) * coalesce(fee, 0),
         (select coalesce(sum(amount), 0) from fee_payments where status = 'diluluskan' and year = y),
         (select count(*) from fam where paid >= coalesce(fee, 0)),
         (select coalesce(sum(amount), 0) from donations where status = 'diluluskan'
             and extract(year from coalesce(reviewed_at, submitted_at)) = y),
         (select coalesce(sum(amount), 0) from transactions where kind = 'keluar' and extract(year from txn_date) = y);
end $$;
grant execute on function report_overview(int) to authenticated;

-- one row per class; a family with children in two classes counts in both
create or replace function report_fee_by_class(p_year int default null)
returns table (class_id bigint, class_name text, year_level int, students bigint, families bigint,
               lunas bigint, menunggu bigint, belum bigint, collected numeric, parent_accounts bigint)
language plpgsql stable security definer set search_path = public as $$
declare y int; fee numeric;
begin
  if not has_perm('laporan') then raise exception 'Akses ditolak.'; end if;
  y := coalesce(p_year, (select current_year from school_settings where id = 1));
  select fee_per_family into fee from school_settings where id = 1;
  return query
  with fs as (
    select f.id,
           coalesce((select sum(p.amount) from fee_payments p where p.family_id = f.id and p.year = y and p.status = 'diluluskan'), 0) as paid,
           exists (select 1 from fee_payments p where p.family_id = f.id and p.year = y and p.status = 'dihantar') as pending,
           exists (select 1 from guardians g where g.family_id = f.id and g.user_id is not null) as has_acc
      from families f),
  cf as (
    select distinct s.class_id, s.family_id from students s where s.status = 'aktif' and s.class_id is not null)
  select c.id, c.name, c.year_level,
         (select count(*) from students s where s.class_id = c.id and s.status = 'aktif'),
         count(cf.family_id),
         count(*) filter (where fs.paid >= coalesce(fee, 0)),
         count(*) filter (where fs.paid < coalesce(fee, 0) and fs.pending),
         count(*) filter (where fs.paid < coalesce(fee, 0) and not fs.pending),
         coalesce(sum(fs.paid), 0),
         count(*) filter (where fs.has_acc)
    from classes c
    join cf on cf.class_id = c.id
    join fs on fs.id = cf.family_id
   group by c.id, c.name, c.year_level
   order by c.year_level nulls last, c.name;
end $$;
grant execute on function report_fee_by_class(int) to authenticated;

create or replace function report_fee_monthly(p_year int default null)
returns table (month int, payments bigint, amount numeric)
language plpgsql stable security definer set search_path = public as $$
declare y int;
begin
  if not has_perm('laporan') then raise exception 'Akses ditolak.'; end if;
  y := coalesce(p_year, (select current_year from school_settings where id = 1));
  return query
  select m::int, count(p.id), coalesce(sum(p.amount), 0)
    from generate_series(1, 12) m
    left join fee_payments p on p.status = 'diluluskan' and p.year = y
         and extract(month from coalesce(p.reviewed_at, p.submitted_at)) = m
   group by m order by m;
end $$;
grant execute on function report_fee_monthly(int) to authenticated;

create or replace function report_campaigns()
returns table (campaign_id bigint, title text, code text, status text, target numeric,
               collected numeric, donors bigint, pending bigint, end_date date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm('laporan') then raise exception 'Akses ditolak.'; end if;
  return query
  select c.id, c.title, c.code, c.status::text, c.target_amount,
         coalesce(sum(d.amount) filter (where d.status = 'diluluskan'), 0),
         count(distinct coalesce(d.family_id::text, d.submitted_by::text, d.donor_name)) filter (where d.status = 'diluluskan'),
         count(*) filter (where d.status = 'dihantar'),
         c.end_date
    from campaigns c left join donations d on d.campaign_id = c.id
   where c.status <> 'draf'
   group by c.id order by c.created_at desc;
end $$;
grant execute on function report_campaigns() to authenticated;
