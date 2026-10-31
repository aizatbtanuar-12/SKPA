-- =====================================================================
-- 009: family rules
--  * New role: Pengerusi PIBG (chairman). Chairman, AJK PIBG and admin keep
--    their staff powers and can ALSO use every parent function (they are
--    parents too). Parent functions are family-based (my_family_id()), so
--    they already work for any role once the account is linked to a family.
--  * IC number is compulsory for students, parents/guardians and child claims.
--  * Spouse: a parent records their spouse when registering; both parents
--    are attached to the children as one family.
--  * A student IC can't be registered under a different family.
-- Safe to run more than once.
-- =====================================================================

-- ---------- roles ----------
alter type app_role add value if not exists 'pengerusi' after 'admin';

-- compare as text so this file can use the new value in the same run
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('admin','pengerusi','pibg') from profiles where id = auth.uid()), false)
$$;

create or replace function is_school_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text <> 'parent' from profiles where id = auth.uid()), false)
$$;

drop policy if exists memos_insert on memos;
create policy memos_insert on memos for insert with check (
  author_id = auth.uid() and (
    my_role()::text in ('admin','pengerusi','pibg','panitia')
    or (my_role()::text = 'guru' and audience = 'kelas' and teaches_class(class_id))));

-- ---------- spouse details on the profile ----------
alter table profiles add column if not exists relation     text check (relation in ('bapa','ibu','penjaga'));
alter table profiles add column if not exists spouse_name  text;
alter table profiles add column if not exists spouse_ic    text;
alter table profiles add column if not exists spouse_phone text;
alter table profiles add column if not exists no_spouse    boolean not null default false;

create or replace function spouse_relation(p text) returns text
language sql immutable as $$
  select case p when 'bapa' then 'ibu' when 'ibu' then 'bapa' else 'penjaga' end
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := new.raw_user_meta_data;
begin
  insert into profiles (id, full_name, phone, ic_no, pdpa_consent_at, relation, spouse_name, spouse_ic, spouse_phone, no_spouse)
  values (new.id,
          coalesce(m->>'full_name', ''),
          m->>'phone',
          norm_ic(m->>'ic_no'),
          case when m->>'pdpa_consent' = 'true' then now() end,
          nullif(m->>'relation','') ,
          nullif(trim(coalesce(m->>'spouse_name','')),''),
          norm_ic(m->>'spouse_ic'),
          nullif(trim(coalesce(m->>'spouse_phone','')),''),
          coalesce((m->>'no_spouse')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.ensure_my_profile() returns void
language plpgsql security definer set search_path = public as $$
declare u auth.users; m jsonb;
begin
  if auth.uid() is null then return; end if;
  select * into u from auth.users where id = auth.uid();
  m := u.raw_user_meta_data;
  insert into profiles (id, full_name, phone, ic_no, pdpa_consent_at, relation, spouse_name, spouse_ic, spouse_phone, no_spouse)
  values (u.id, coalesce(m->>'full_name', ''), m->>'phone', norm_ic(m->>'ic_no'),
          case when m->>'pdpa_consent' = 'true' then now() end,
          nullif(m->>'relation',''), nullif(trim(coalesce(m->>'spouse_name','')),''), norm_ic(m->>'spouse_ic'),
          nullif(trim(coalesce(m->>'spouse_phone','')),''), coalesce((m->>'no_spouse')::boolean, false))
  on conflict (id) do nothing;
end $$;
grant execute on function public.ensure_my_profile() to authenticated;

-- ---------- IC compulsory ----------
-- Enforced with triggers on new rows (and on clearing an IC), so older records
-- without an IC can still be merged / moved by the system.
alter table students     drop constraint if exists students_ic_required;
alter table guardians    drop constraint if exists guardians_ic_required;
alter table child_claims drop constraint if exists claims_ic_required;

create or replace function guardians_ic_required() returns trigger
language plpgsql as $$
begin
  if new.ic_no is null and (tg_op = 'INSERT' or old.ic_no is not null) then
    raise exception 'No. Kad Pengenalan ibu bapa / penjaga wajib diisi.';
  end if;
  return new;
end $$;
drop trigger if exists guardians_ic_req on guardians;
create trigger guardians_ic_req before insert or update of ic_no on guardians
  for each row execute function guardians_ic_required();

-- a guardian without an IC is no longer created
create or replace function upsert_guardian(p_name text, p_ic text, p_phone text, p_email text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_ic text := norm_ic(p_ic);
begin
  if v_ic is null then return null; end if;
  select id into v_id from guardians where ic_no = v_ic;
  if v_id is null then
    insert into guardians (full_name, ic_no, phone, email)
    values (coalesce(nullif(trim(p_name),''), 'Penjaga'), v_ic, nullif(trim(p_phone),''), nullif(trim(p_email),''))
    returning id into v_id;
  else
    update guardians set
      phone     = coalesce(nullif(trim(p_phone),''), phone),
      email     = coalesce(nullif(trim(p_email),''), email),
      full_name = case when coalesce(trim(p_name),'') <> '' then trim(p_name) else full_name end
    where id = v_id;
  end if;
  return v_id;
end $$;

-- ---------- one student IC = one family ----------
-- Who may be attached to an existing student: the student has no guardians yet,
-- or the person (by IC) is already a parent/guardian in that student's family.
create or replace function may_join_student(p_student bigint, p_ic text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from student_guardians where student_id = p_student)
      or exists (select 1 from guardians g join students s on s.family_id = g.family_id
                  where s.id = p_student and g.ic_no = norm_ic(p_ic))
$$;

create or replace function family_code_of_student(p_student bigint) returns text
language sql stable security definer set search_path = public as $$
  select f.family_code from students s join families f on f.id = s.family_id where s.id = p_student
$$;

create or replace function check_child_claim() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_my_ic text; v_student bigint; v_other uuid;
begin
  new.child_ic := norm_ic(new.child_ic);
  if new.child_ic is null or length(new.child_ic) <> 12 then
    raise exception 'No. MyKid / Kad Pengenalan anak wajib diisi (12 digit).';
  end if;
  select ic_no into v_my_ic from profiles where id = new.user_id;
  if v_my_ic is null then
    raise exception 'Sila isi No. Kad Pengenalan anda dalam Profil dahulu.';
  end if;
  if new.child_ic = v_my_ic then raise exception 'No. KP anak tidak boleh sama dengan No. KP anda.'; end if;

  if exists (select 1 from child_claims where user_id = new.user_id and child_ic = new.child_ic and status = 'menunggu') then
    raise exception 'Anda sudah menghantar permohonan untuk anak ini. Sila tunggu pengesahan guru kelas.';
  end if;

  select id into v_student from students where ic_no = new.child_ic;
  if v_student is not null and not may_join_student(v_student, v_my_ic) then
    raise exception 'No. KP murid ini telah berdaftar di bawah keluarga lain (%). Jika anda ibu/bapa murid ini, minta pasangan anda menambah anda sebagai pasangan, atau hubungi bendahari PIBG.',
      family_code_of_student(v_student);
  end if;

  -- another parent's claim for the same child is waiting: only their declared spouse may also claim
  select c.user_id into v_other from child_claims c join profiles p on p.id = c.user_id
   where c.child_ic = new.child_ic and c.status = 'menunggu' and c.user_id <> new.user_id
     and coalesce(p.spouse_ic,'') <> v_my_ic
     and coalesce((select spouse_ic from profiles where id = new.user_id),'') <> coalesce(p.ic_no,'')
   limit 1;
  if v_other is not null then
    raise exception 'Murid dengan No. KP ini sedang didaftarkan oleh keluarga lain. Hubungi guru kelas atau bendahari PIBG.';
  end if;
  return new;
end $$;

drop trigger if exists child_claims_check on child_claims;
create trigger child_claims_check before insert on child_claims
  for each row execute function check_child_claim();

-- Link the spouse to the family of p_student (used on approval and from the profile)
create or replace function link_spouse(p_user uuid, p_family bigint) returns text
language plpgsql security definer set search_path = public as $$
declare p profiles; v_sp bigint; v_sp_family bigint; st record;
begin
  select * into p from profiles where id = p_user;
  if p.spouse_ic is null or p_family is null then return null; end if;
  if p.spouse_ic = p.ic_no then return 'No. KP pasangan sama dengan No. KP anda.'; end if;
  select id, family_id into v_sp, v_sp_family from guardians where ic_no = p.spouse_ic;
  if v_sp_family is not null and v_sp_family <> p_family then
    return 'No. KP pasangan sudah berdaftar dengan keluarga lain. Hubungi bendahari PIBG untuk menggabungkan rekod.';
  end if;
  v_sp := upsert_guardian(p.spouse_name, p.spouse_ic, p.spouse_phone);
  update guardians set family_id = p_family where id = v_sp and family_id is null;
  for st in select id from students where family_id = p_family and status = 'aktif' loop
    insert into student_guardians (student_id, guardian_id, relation)
    values (st.id, v_sp, spouse_relation(coalesce(p.relation, 'penjaga'))) on conflict do nothing;
  end loop;
  return null;
end $$;

-- Parent saves / changes their spouse (Profil or Anak Saya)
create or replace function save_spouse(p_name text, p_ic text, p_phone text, p_relation text default null, p_none boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare v_ic text := norm_ic(p_ic); me profiles;
begin
  if auth.uid() is null then raise exception 'Sila log masuk.'; end if;
  select * into me from profiles where id = auth.uid();
  if not p_none then
    if coalesce(trim(p_name),'') = '' then raise exception 'Sila isi nama pasangan.'; end if;
    if v_ic is null or length(v_ic) <> 12 then raise exception 'No. KP pasangan mesti 12 digit.'; end if;
    if v_ic = me.ic_no then raise exception 'No. KP pasangan tidak boleh sama dengan No. KP anda.'; end if;
  end if;
  update profiles set
    spouse_name  = case when p_none then null else trim(p_name) end,
    spouse_ic    = case when p_none then null else v_ic end,
    spouse_phone = case when p_none then null else nullif(trim(p_phone),'') end,
    relation     = coalesce(nullif(p_relation,''), relation),
    no_spouse    = p_none
  where id = auth.uid();
  if p_none then return null; end if;
  return link_spouse(auth.uid(), my_family_id());
end $$;
grant execute on function save_spouse(text, text, text, text, boolean) to authenticated;

-- Class teacher / staff approval, now with the one-family rule and the spouse
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
    if not is_staff() and not exists (select 1 from students s where s.id = v_student and teaches_class(s.class_id)) then
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

-- Staff adding / editing a student by hand: same one-family rule is enforced by unique IC;
-- give a clear message instead of a constraint error.
create or replace function students_ic_unique_msg() returns trigger
language plpgsql security definer set search_path = public as $$
declare other text;
begin
  if new.ic_no is null then
    if tg_op = 'INSERT' or old.ic_no is not null then raise exception 'No. MyKid / KP murid wajib diisi.'; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.ic_no is not distinct from old.ic_no then return new; end if;
  if length(new.ic_no) <> 12 then raise exception 'No. MyKid / KP murid mesti 12 digit.'; end if;
  select f.family_code into other from students s left join families f on f.id = s.family_id
   where s.ic_no = new.ic_no and s.id <> new.id;
  if found then
    raise exception 'No. KP murid ini telah berdaftar di bawah keluarga lain (%).', coalesce(other, '-');
  end if;
  return new;
end $$;

drop trigger if exists students_ic_unique on students;
create trigger students_ic_unique before insert or update of ic_no on students
  for each row execute function students_ic_unique_msg();

-- Bulk import with the same rules: student IC required, at least one parent /
-- guardian IC required, and a student already in another family is not re-linked.
create or replace function import_students(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_class bigint; v_student bigint; v_g bigint; v_ic text;
  v_name text; v_kelas text; n_new int := 0; n_upd int := 0; n_skip int := 0;
  warnings text[] := '{}'; i int := 0; rel text; has_parent boolean; v_gic text; v_ok boolean;
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;

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
