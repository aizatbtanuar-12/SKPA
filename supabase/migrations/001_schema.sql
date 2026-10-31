-- =====================================================================
-- PIBG SK Puncak Alam — Portal PIBG
-- Migration 001: schema, sibling/family logic, functions, security (RLS)
-- Run this in Supabase: Dashboard → SQL Editor → paste → Run
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Roles
--   admin   : Pentadbir sistem (setiausaha PIBG / GPK) — semua akses
--   pibg    : AJK PIBG / Bendahari — yuran, kewangan, memo, AGM, rekod
--   panitia : Ketua Panitia — memo & program
--   guru    : Guru Kelas — murid & sahkan pendaftaran kelas sendiri
--   parent  : Ibu bapa / penjaga — keluarga sendiri sahaja
-- ---------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('admin','pibg','panitia','guru','parent');
exception when duplicate_object then null; end $$;

-- IC helper: keep digits only (900101-10-1234 -> 900101101234)
create or replace function norm_ic(v text) returns text
language sql immutable as $$
  select nullif(regexp_replace(coalesce(v,''), '[^0-9]', '', 'g'), '')
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null default '',
  ic_no            text,
  phone            text,
  role             app_role not null default 'parent',
  panitia          text,
  pdpa_consent_at  timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists school_settings (
  id              int primary key default 1 check (id = 1),
  school_name     text not null default 'SK Puncak Alam',
  school_code     text,
  current_year    int  not null default extract(year from now())::int,
  fee_per_family  numeric(10,2) not null default 50.00,
  bank_name       text,
  bank_account    text,
  bank_holder     text,
  contact_phone   text,
  updated_at      timestamptz not null default now()
);
insert into school_settings (id) values (1) on conflict do nothing;

create table if not exists classes (
  id                bigserial primary key,
  name              text not null unique,
  year_level        int check (year_level between 1 and 6),
  class_teacher_id  uuid references profiles(id) on delete set null,
  active            boolean not null default true
);

create table if not exists families (
  id           bigserial primary key,
  family_code  text unique,
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists guardians (
  id          bigserial primary key,
  family_id   bigint references families(id) on delete restrict,
  user_id     uuid unique references profiles(id) on delete set null,
  full_name   text not null,
  ic_no       text unique,
  phone       text,
  email       text,
  created_at  timestamptz not null default now()
);

create table if not exists students (
  id          bigserial primary key,
  family_id   bigint references families(id) on delete restrict,
  full_name   text not null,
  ic_no       text unique,
  class_id    bigint references classes(id) on delete set null,
  status      text not null default 'aktif' check (status in ('aktif','keluar')),
  source      text not null default 'manual' check (source in ('import','manual','ibubapa')),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists students_class_idx on students(class_id);
create index if not exists students_family_idx on students(family_id);
create index if not exists students_name_trgm on students using gin (full_name gin_trgm_ops);

create table if not exists student_guardians (
  student_id   bigint not null references students(id) on delete cascade,
  guardian_id  bigint not null references guardians(id) on delete cascade,
  relation     text not null default 'penjaga' check (relation in ('bapa','ibu','penjaga')),
  primary key (student_id, guardian_id)
);

-- Parent says "this is my child" -> class teacher verifies
create table if not exists child_claims (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  child_name   text not null,
  child_ic     text,
  class_id     bigint not null references classes(id),
  relation     text not null default 'penjaga' check (relation in ('bapa','ibu','penjaga')),
  status       text not null default 'menunggu'
               check (status in ('menunggu','dipadan','rekod_baru','ditolak')),
  student_id   bigint references students(id) on delete set null,
  review_note  text,
  reviewed_by  uuid references profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists receipt_counters (
  year  int primary key,
  last  int not null default 0
);

create table if not exists fee_payments (
  id            bigserial primary key,
  family_id     bigint not null references families(id) on delete restrict,
  year          int not null,
  amount        numeric(10,2) not null check (amount > 0),
  method        text not null default 'pindahan' check (method in ('pindahan','tunai','lain')),
  reference     text,
  proof_path    text,
  status        text not null default 'dihantar' check (status in ('dihantar','diluluskan','ditolak')),
  receipt_no    text unique,
  submitted_by  uuid references profiles(id) on delete set null,
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references profiles(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text
);
create index if not exists fee_payments_family_idx on fee_payments(family_id, year);

create table if not exists memos (
  id            bigserial primary key,
  title         text not null,
  body          text not null,
  audience      text not null default 'semua' check (audience in ('semua','kelas','guru')),
  class_id      bigint references classes(id) on delete cascade,
  author_id     uuid references profiles(id) on delete set null,
  pinned        boolean not null default false,
  published_at  timestamptz not null default now(),
  check (audience <> 'kelas' or class_id is not null)
);

create table if not exists memo_reads (
  memo_id  bigint not null references memos(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (memo_id, user_id)
);

create table if not exists programs (
  id           bigserial primary key,
  title        text not null,
  description  text,
  start_date   date,
  end_date     date,
  budget       numeric(12,2) not null default 0,
  status       text not null default 'dirancang'
               check (status in ('dirancang','berjalan','selesai','dibatalkan')),
  panitia      text,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists transactions (
  id           bigserial primary key,
  txn_date     date not null default current_date,
  kind         text not null check (kind in ('masuk','keluar')),
  category     text not null,
  amount       numeric(12,2) not null check (amount > 0),
  description  text,
  program_id   bigint references programs(id) on delete set null,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists agm_meetings (
  id            bigserial primary key,
  title         text not null,
  meeting_date  timestamptz,
  venue         text,
  status        text not null default 'draf' check (status in ('draf','dibuka','ditutup')),
  quorum        int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists agm_attendance (
  meeting_id     bigint not null references agm_meetings(id) on delete cascade,
  family_id      bigint not null references families(id) on delete cascade,
  checked_in_at  timestamptz not null default now(),
  checked_in_by  uuid references profiles(id) on delete set null,
  primary key (meeting_id, family_id)
);

create table if not exists agm_motions (
  id           bigserial primary key,
  meeting_id   bigint not null references agm_meetings(id) on delete cascade,
  title        text not null,
  description  text,
  options      text[] not null default array['Setuju','Tidak Setuju','Berkecuali'],
  status       text not null default 'draf' check (status in ('draf','dibuka','ditutup')),
  sort         int not null default 0
);

-- One vote per FAMILY per motion (consistent with per-family membership)
create table if not exists agm_votes (
  motion_id  bigint not null references agm_motions(id) on delete cascade,
  family_id  bigint not null references families(id) on delete cascade,
  choice     text not null,
  voted_by   uuid references profiles(id) on delete set null,
  voted_at   timestamptz not null default now(),
  primary key (motion_id, family_id)
);

-- ---------------------------------------------------------------------
-- Role helpers (security definer so policies don't recurse)
-- ---------------------------------------------------------------------
create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','pibg') from profiles where id = auth.uid()), false)
$$;

create or replace function is_school_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','pibg','panitia','guru') from profiles where id = auth.uid()), false)
$$;

create or replace function teaches_class(p_class bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = p_class and class_teacher_id = auth.uid())
$$;

create or replace function my_family_id() returns bigint
language sql stable security definer set search_path = public as $$
  select family_id from guardians where user_id = auth.uid()
$$;

create or replace function family_in_my_class(p_family bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students s join classes c on c.id = s.class_id
    where s.family_id = p_family and c.class_teacher_id = auth.uid())
$$;

create or replace function guardian_in_my_class(p_guardian bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from student_guardians sg
    join students s on s.id = sg.student_id
    join classes c on c.id = s.class_id
    where sg.guardian_id = p_guardian and c.class_teacher_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- Profiles: auto-create on sign-up; only admin may change roles
-- ---------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, phone, ic_no, pdpa_consent_at)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          new.raw_user_meta_data->>'phone',
          norm_ic(new.raw_user_meta_data->>'ic_no'),
          case when new.raw_user_meta_data->>'pdpa_consent' = 'true' then now() end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.ic_no := norm_ic(new.ic_no);
  if auth.uid() is not null and coalesce(my_role()::text,'') <> 'admin' then
    if new.role is distinct from old.role or new.panitia is distinct from old.panitia then
      raise exception 'Hanya pentadbir boleh menukar peranan.';
    end if;
    -- once a parent is linked as a guardian, IC changes go through admin
    if new.ic_no is distinct from old.ic_no
       and exists (select 1 from guardians where user_id = old.id) then
      raise exception 'No. KP telah disahkan. Hubungi pentadbir untuk pindaan.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect on profiles;
create trigger profiles_protect before update on profiles
  for each row execute function protect_profile();

-- ---------------------------------------------------------------------
-- Families & sibling detection
--   Rule: a student and every guardian linked to them share one family.
--   Because guardians are unique by IC, two students who share a parent
--   IC automatically end up in the same family (yuran paid once).
-- ---------------------------------------------------------------------
create or replace function set_family_code() returns trigger
language plpgsql as $$
begin
  if new.family_code is null then
    new.family_code := 'K' || lpad(new.id::text, 5, '0');
  end if;
  return new;
end $$;

drop trigger if exists families_code on families;
create trigger families_code before insert on families
  for each row execute function set_family_code();

create or replace function new_family() returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into families default values returning id into v;
  return v;
end $$;

-- Move everything from family p_drop into p_keep, then delete p_drop
create or replace function merge_families(p_keep bigint, p_drop bigint) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    return coalesce(p_keep, p_drop);
  end if;
  update students     set family_id = p_keep where family_id = p_drop;
  update guardians    set family_id = p_keep where family_id = p_drop;
  update fee_payments set family_id = p_keep where family_id = p_drop;
  -- AGM: keep one attendance / one vote per family
  delete from agm_attendance a using agm_attendance k
    where a.family_id = p_drop and k.family_id = p_keep and k.meeting_id = a.meeting_id;
  update agm_attendance set family_id = p_keep where family_id = p_drop;
  delete from agm_votes v using agm_votes k
    where v.family_id = p_drop and k.family_id = p_keep and k.motion_id = v.motion_id;
  update agm_votes set family_id = p_keep where family_id = p_drop;
  update families set notes = concat_ws(E'\n', notes,
         'Digabung daripada ' || (select family_code from families where id = p_drop))
    where id = p_keep;
  delete from families where id = p_drop;
  return p_keep;
end $$;

create or replace function unify_family_on_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare fs bigint; fg bigint; keep bigint;
begin
  select family_id into fs from students  where id = new.student_id;
  select family_id into fg from guardians where id = new.guardian_id;
  if fs is null and fg is null then
    keep := new_family();
  elsif fs is null then keep := fg;
  elsif fg is null then keep := fs;
  else keep := least(fs, fg);   -- older family wins
       perform merge_families(keep, greatest(fs, fg));
  end if;
  update students  set family_id = keep where id = new.student_id and family_id is distinct from keep;
  update guardians set family_id = keep where id = new.guardian_id and family_id is distinct from keep;
  return new;
end $$;

drop trigger if exists student_guardians_unify on student_guardians;
create trigger student_guardians_unify after insert on student_guardians
  for each row execute function unify_family_on_link();

-- Every student always belongs to some family
create or replace function ensure_student_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.ic_no := norm_ic(new.ic_no);
  if new.family_id is null then new.family_id := new_family(); end if;
  return new;
end $$;

drop trigger if exists students_family on students;
create trigger students_family before insert or update on students
  for each row execute function ensure_student_family();

create or replace function norm_guardian_ic() returns trigger
language plpgsql as $$
begin
  new.ic_no := norm_ic(new.ic_no);
  return new;
end $$;

drop trigger if exists guardians_ic on guardians;
create trigger guardians_ic before insert or update on guardians
  for each row execute function norm_guardian_ic();

-- Find-or-create a guardian by IC (IC is the sibling key)
create or replace function upsert_guardian(p_name text, p_ic text, p_phone text, p_email text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_ic text := norm_ic(p_ic);
begin
  if coalesce(trim(p_name),'') = '' and v_ic is null then return null; end if;
  if v_ic is not null then
    select id into v_id from guardians where ic_no = v_ic;
  end if;
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

-- ---------------------------------------------------------------------
-- Bulk import (from Excel/CSV converted to JSON by the app)
-- Each row: {nama_murid, ic_murid, kelas, nama_bapa, ic_bapa, tel_bapa,
--            nama_ibu, ic_ibu, tel_ibu, nama_penjaga, ic_penjaga, tel_penjaga}
-- ---------------------------------------------------------------------
create or replace function import_students(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_class bigint; v_student bigint; v_g bigint; v_ic text;
  v_name text; v_kelas text; n_new int := 0; n_upd int := 0; n_skip int := 0;
  warnings text[] := '{}'; i int := 0; rel text;
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

    select id into v_class from classes where upper(name) = v_kelas;
    if v_class is null then
      insert into classes (name, year_level)
      values (v_kelas, nullif(substring(v_kelas from '^[1-6]'),'')::int)
      returning id into v_class;
    end if;

    v_student := null;
    if v_ic is not null then
      select id into v_student from students where ic_no = v_ic;
    end if;
    if v_student is null then
      select id into v_student from students
       where ic_no is null and lower(full_name) = lower(v_name) and class_id = v_class;
    end if;

    if v_student is null then
      insert into students (full_name, ic_no, class_id, source, created_by)
      values (v_name, v_ic, v_class, 'import', auth.uid()) returning id into v_student;
      n_new := n_new + 1;
    else
      update students set full_name = v_name, class_id = v_class,
             ic_no = coalesce(v_ic, ic_no), status = 'aktif'
       where id = v_student;
      n_upd := n_upd + 1;
    end if;

    foreach rel in array array['bapa','ibu','penjaga'] loop
      v_g := upsert_guardian(r->>('nama_'||rel), r->>('ic_'||rel), r->>('tel_'||rel), r->>('emel_'||rel));
      if v_g is not null then
        insert into student_guardians (student_id, guardian_id, relation)
        values (v_student, v_g, rel) on conflict do nothing;
        if norm_ic(r->>('ic_'||rel)) is null then
          warnings := warnings || format('Baris %s (%s): No. KP %s tiada — adik-beradik tidak dapat dikesan automatik', i, v_name, rel);
        end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('baru', n_new, 'dikemaskini', n_upd, 'dilangkau', n_skip, 'amaran', to_jsonb(warnings));
end $$;

-- ---------------------------------------------------------------------
-- Class teacher verification of parent claims
-- ---------------------------------------------------------------------
create or replace function can_review_claim(p_claim bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or exists (select 1 from child_claims c where c.id = p_claim and teaches_class(c.class_id))
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

-- p_student given  -> match claim to that existing student
-- p_student null   -> create a new student record from the claim
create or replace function approve_claim(p_claim bigint, p_student bigint default null, p_note text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare c child_claims; p profiles; v_g bigint; v_student bigint := p_student;
begin
  if not can_review_claim(p_claim) then raise exception 'Akses ditolak.'; end if;
  select * into c from child_claims where id = p_claim for update;
  if c.status <> 'menunggu' then raise exception 'Permohonan ini telah diproses.'; end if;
  select * into p from profiles where id = c.user_id;
  if p.ic_no is null then raise exception 'Ibu bapa belum mengisi No. KP dalam profil.'; end if;

  -- Find guardian by IC (may already exist from import) and attach the parent's account
  select id into v_g from guardians where ic_no = p.ic_no;
  if v_g is null then
    select id into v_g from guardians where user_id = c.user_id;
  end if;
  if v_g is null then
    insert into guardians (full_name, ic_no, phone, user_id)
    values (p.full_name, p.ic_no, p.phone, c.user_id) returning id into v_g;
  else
    if exists (select 1 from guardians where id = v_g and user_id is not null and user_id <> c.user_id) then
      raise exception 'No. KP ini telah dipautkan kepada akaun lain. Rujuk pentadbir.';
    end if;
    update guardians set user_id = c.user_id,
           phone = coalesce(phone, p.phone)
     where id = v_g;
  end if;

  if v_student is null then
    insert into students (full_name, ic_no, class_id, source, created_by)
    values (c.child_name, norm_ic(c.child_ic), c.class_id, 'ibubapa', auth.uid())
    returning id into v_student;
  elsif not is_staff() and not exists (
      select 1 from students s where s.id = v_student and teaches_class(s.class_id)) then
    raise exception 'Murid ini bukan dalam kelas anda.';
  end if;

  insert into student_guardians (student_id, guardian_id, relation)
  values (v_student, v_g, c.relation) on conflict do nothing;

  update child_claims set
    status = case when p_student is null then 'rekod_baru' else 'dipadan' end,
    student_id = v_student, review_note = p_note,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_claim;
  return v_student;
end $$;

create or replace function reject_claim(p_claim bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_review_claim(p_claim) then raise exception 'Akses ditolak.'; end if;
  update child_claims set status = 'ditolak', review_note = p_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_claim and status = 'menunggu';
end $$;

-- Manual overrides (admin/pibg): join two families, or move a student out
create or replace function admin_merge_families(p_a bigint, p_b bigint) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;
  return merge_families(least(p_a,p_b), greatest(p_a,p_b));
end $$;

create or replace function admin_move_student(p_student bigint, p_family bigint default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint := p_family;
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;
  if v is null then v := new_family(); end if;
  update students set family_id = v where id = p_student;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Yuran (per family)
-- ---------------------------------------------------------------------
create or replace function next_receipt_no(p_year int) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into receipt_counters (year, last) values (p_year, 1)
  on conflict (year) do update set last = receipt_counters.last + 1
  returning last into n;
  return format('PIBG-SKPA/%s/%s', p_year, lpad(n::text, 4, '0'));
end $$;

create or replace function approve_payment(p_payment bigint, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare f fee_payments; r text;
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;
  select * into f from fee_payments where id = p_payment for update;
  if f.status = 'diluluskan' then return f.receipt_no; end if;
  r := next_receipt_no(f.year);
  update fee_payments set status = 'diluluskan', receipt_no = r, review_note = p_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_payment;
  return r;
end $$;

create or replace function reject_payment(p_payment bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;
  update fee_payments set status = 'ditolak', review_note = p_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_payment and status = 'dihantar';
end $$;

-- Counter / cash payment recorded by the treasurer (approved immediately)
create or replace function record_payment(p_family bigint, p_amount numeric, p_method text default 'tunai',
                                          p_reference text default null, p_year int default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_year int;
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;
  v_year := coalesce(p_year, (select current_year from school_settings where id = 1));
  insert into fee_payments (family_id, year, amount, method, reference, submitted_by)
  values (p_family, v_year, p_amount, p_method, p_reference, auth.uid()) returning id into v_id;
  return approve_payment(v_id, 'Direkod oleh bendahari');
end $$;

-- Fee status per family for the current year (respects RLS of the caller)
create or replace view family_fee_status with (security_invoker = on) as
select f.id                                   as family_id,
       f.family_code,
       s.current_year                         as year,
       s.fee_per_family                       as fee_due,
       coalesce((select sum(p.amount) from fee_payments p
                  where p.family_id = f.id and p.year = s.current_year and p.status = 'diluluskan'), 0) as paid,
       exists (select 1 from fee_payments p
                where p.family_id = f.id and p.year = s.current_year and p.status = 'dihantar') as has_pending,
       (select count(*) from students st where st.family_id = f.id and st.status = 'aktif') as active_children,
       (select string_agg(st.full_name || ' (' || coalesce(c.name,'-') || ')', ', ' order by c.year_level, st.full_name)
          from students st left join classes c on c.id = st.class_id
         where st.family_id = f.id and st.status = 'aktif') as children,
       (select string_agg(g.full_name, ' / ' order by g.id) from guardians g where g.family_id = f.id) as guardians,
       (select g.phone from guardians g where g.family_id = f.id and g.phone is not null order by g.id limit 1) as phone,
       case
         when coalesce((select sum(p.amount) from fee_payments p
                         where p.family_id = f.id and p.year = s.current_year and p.status = 'diluluskan'), 0)
              >= s.fee_per_family then 'lunas'
         when exists (select 1 from fee_payments p
                       where p.family_id = f.id and p.year = s.current_year and p.status = 'dihantar') then 'menunggu'
         else 'belum'
       end as status
  from families f cross join school_settings s
 where s.id = 1
   and exists (select 1 from students st where st.family_id = f.id and st.status = 'aktif');

-- Aggregated fund summary visible to every signed-in user (transparency)
create or replace function fund_summary(p_year int default null)
returns table (year int, families_total bigint, families_paid bigint, yuran_collected numeric,
               other_income numeric, expenses numeric, balance numeric)
language plpgsql stable security definer set search_path = public as $$
declare y int;
begin
  if auth.uid() is null then raise exception 'Sila log masuk.'; end if;
  y := coalesce(p_year, (select current_year from school_settings where id = 1));
  return query
  with fam as (
    select f.id,
           coalesce(sum(p.amount) filter (where p.status = 'diluluskan' and p.year = y), 0) as paid
      from families f left join fee_payments p on p.family_id = f.id
     where exists (select 1 from students st where st.family_id = f.id and st.status = 'aktif')
     group by f.id)
  select y,
         (select count(*) from fam),
         (select count(*) from fam where paid >= (select fee_per_family from school_settings where id = 1)),
         (select coalesce(sum(amount),0) from fee_payments where status = 'diluluskan' and fee_payments.year = y),
         (select coalesce(sum(amount),0) from transactions where kind = 'masuk' and extract(year from txn_date) = y),
         (select coalesce(sum(amount),0) from transactions where kind = 'keluar' and extract(year from txn_date) = y),
         (select coalesce(sum(amount),0) from fee_payments where status = 'diluluskan' and fee_payments.year = y)
         + (select coalesce(sum(amount),0) from transactions where kind = 'masuk' and extract(year from txn_date) = y)
         - (select coalesce(sum(amount),0) from transactions where kind = 'keluar' and extract(year from txn_date) = y);
end $$;

-- ---------------------------------------------------------------------
-- AGM: check-in & voting (one vote per family, secret ballot)
-- ---------------------------------------------------------------------
create or replace function agm_check_in(p_meeting bigint, p_family bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_family bigint := p_family; m agm_meetings;
begin
  select * into m from agm_meetings where id = p_meeting;
  if m.id is null then raise exception 'Mesyuarat tidak dijumpai.'; end if;
  if v_family is null or not is_staff() then
    if m.status <> 'dibuka' then raise exception 'Pendaftaran kehadiran belum dibuka.'; end if;
    v_family := my_family_id();
    if v_family is null then raise exception 'Akaun anda belum dipautkan kepada mana-mana keluarga murid.'; end if;
  end if;
  insert into agm_attendance (meeting_id, family_id, checked_in_by)
  values (p_meeting, v_family, auth.uid()) on conflict do nothing;
end $$;

create or replace function cast_vote(p_motion bigint, p_choice text) returns void
language plpgsql security definer set search_path = public as $$
declare mo agm_motions; v_family bigint := my_family_id();
begin
  select * into mo from agm_motions where id = p_motion;
  if mo.id is null or mo.status <> 'dibuka' then raise exception 'Undian tidak dibuka.'; end if;
  if v_family is null then raise exception 'Akaun anda belum dipautkan kepada keluarga murid.'; end if;
  if not exists (select 1 from agm_attendance where meeting_id = mo.meeting_id and family_id = v_family) then
    raise exception 'Sila daftar kehadiran mesyuarat dahulu.';
  end if;
  if not (p_choice = any (mo.options)) then raise exception 'Pilihan tidak sah.'; end if;
  insert into agm_votes (motion_id, family_id, choice, voted_by)
  values (p_motion, v_family, p_choice, auth.uid());
exception when unique_violation then
  raise exception 'Keluarga anda telah mengundi bagi usul ini.';
end $$;

create or replace function motion_results(p_motion bigint)
returns table (choice text, votes bigint)
language plpgsql stable security definer set search_path = public as $$
declare mo agm_motions;
begin
  select * into mo from agm_motions where id = p_motion;
  if not (is_staff() or mo.status = 'ditutup') then raise exception 'Keputusan belum diumumkan.'; end if;
  return query
    select o.opt, count(v.family_id)
      from unnest(mo.options) with ordinality as o(opt, ord)
      left join agm_votes v on v.motion_id = p_motion and v.choice = o.opt
     group by o.opt, o.ord order by o.ord;
end $$;

create or replace function agm_stats(p_meeting bigint)
returns table (families_present bigint, quorum int)
language sql stable security definer set search_path = public as $$
  select (select count(*) from agm_attendance where meeting_id = p_meeting),
         (select quorum from agm_meetings where id = p_meeting)
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table profiles          enable row level security;
alter table school_settings   enable row level security;
alter table classes           enable row level security;
alter table families          enable row level security;
alter table guardians         enable row level security;
alter table students          enable row level security;
alter table student_guardians enable row level security;
alter table child_claims      enable row level security;
alter table receipt_counters  enable row level security;
alter table fee_payments      enable row level security;
alter table memos             enable row level security;
alter table memo_reads        enable row level security;
alter table programs          enable row level security;
alter table transactions      enable row level security;
alter table agm_meetings      enable row level security;
alter table agm_attendance    enable row level security;
alter table agm_motions       enable row level security;
alter table agm_votes         enable row level security;

-- profiles
create policy profiles_select on profiles for select using (
  id = auth.uid() or is_staff()
  or (my_role() = 'guru' and exists (
        select 1 from child_claims c where c.user_id = profiles.id and teaches_class(c.class_id)))
  or (my_role() in ('guru','panitia') and role <> 'parent'));
create policy profiles_update_own on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on profiles for update using (my_role() = 'admin');

-- settings & classes: everyone signed in reads; staff edits
create policy settings_read  on school_settings for select using (auth.uid() is not null);
create policy settings_write on school_settings for update using (is_staff());
create policy classes_read   on classes for select using (auth.uid() is not null);
create policy classes_write  on classes for all using (is_staff()) with check (is_staff());

-- families
create policy families_read on families for select using (
  is_staff() or id = my_family_id() or family_in_my_class(id));
create policy families_write on families for all using (is_staff()) with check (is_staff());

-- guardians
create policy guardians_read on guardians for select using (
  is_staff() or family_id = my_family_id() or guardian_in_my_class(id));
create policy guardians_write on guardians for all using (is_staff()) with check (is_staff());
create policy guardians_self_update on guardians for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- students
create policy students_read on students for select using (
  is_staff() or teaches_class(class_id) or family_id = my_family_id());
create policy students_write on students for all using (is_staff()) with check (is_staff());
create policy students_teacher_update on students for update
  using (teaches_class(class_id)) with check (teaches_class(class_id) or is_staff());

-- student_guardians
create policy sg_read on student_guardians for select using (
  is_staff()
  or exists (select 1 from students s where s.id = student_id and (teaches_class(s.class_id) or s.family_id = my_family_id())));
create policy sg_write on student_guardians for all using (is_staff()) with check (is_staff());

-- child claims
create policy claims_read on child_claims for select using (
  user_id = auth.uid() or is_staff() or teaches_class(class_id));
create policy claims_insert on child_claims for insert with check (
  user_id = auth.uid() and status = 'menunggu' and student_id is null and reviewed_by is null);
create policy claims_delete_own on child_claims for delete using (user_id = auth.uid() and status = 'menunggu');
create policy claims_staff on child_claims for update using (is_staff());

-- fee payments
create policy fees_read on fee_payments for select using (
  is_staff() or family_id = my_family_id() or family_in_my_class(family_id));
create policy fees_parent_insert on fee_payments for insert with check (
  family_id = my_family_id() and submitted_by = auth.uid()
  and status = 'dihantar' and receipt_no is null and reviewed_by is null);
create policy fees_staff on fee_payments for all using (is_staff()) with check (is_staff());

-- memos
create policy memos_read on memos for select using (
  is_staff() or author_id = auth.uid()
  or audience = 'semua'
  or (audience = 'guru' and is_school_staff())
  or (audience = 'kelas' and (teaches_class(class_id)
        or exists (select 1 from students s where s.class_id = memos.class_id and s.family_id = my_family_id()))));
create policy memos_insert on memos for insert with check (
  author_id = auth.uid() and (
    my_role() in ('admin','pibg','panitia')
    or (my_role() = 'guru' and audience = 'kelas' and teaches_class(class_id))));
create policy memos_modify on memos for update using (author_id = auth.uid() or is_staff());
create policy memos_delete on memos for delete using (author_id = auth.uid() or is_staff());

create policy memo_reads_own on memo_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy memo_reads_staff on memo_reads for select using (
  is_staff() or exists (select 1 from memos m where m.id = memo_id and m.author_id = auth.uid()));

-- programs & transactions: transparent to all signed-in users
create policy programs_read on programs for select using (auth.uid() is not null);
create policy programs_staff on programs for all using (is_staff()) with check (is_staff());
create policy programs_panitia_insert on programs for insert with check (
  my_role() = 'panitia' and created_by = auth.uid() and status = 'dirancang');
create policy programs_panitia_update on programs for update using (
  my_role() = 'panitia' and created_by = auth.uid());
create policy txn_read on transactions for select using (auth.uid() is not null);
create policy txn_staff on transactions for all using (is_staff()) with check (is_staff());

-- AGM
create policy agm_meet_read on agm_meetings for select using (auth.uid() is not null);
create policy agm_meet_staff on agm_meetings for all using (is_staff()) with check (is_staff());
create policy agm_mot_read on agm_motions for select using (auth.uid() is not null and (status <> 'draf' or is_staff()));
create policy agm_mot_staff on agm_motions for all using (is_staff()) with check (is_staff());
create policy agm_att_read on agm_attendance for select using (is_staff() or family_id = my_family_id());
create policy agm_att_staff on agm_attendance for delete using (is_staff());
-- votes: secret — a family sees only its own; totals via motion_results()
create policy agm_votes_own on agm_votes for select using (family_id = my_family_id());

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on family_fee_status to authenticated;

-- internal helpers must not be called directly by users
revoke execute on function merge_families(bigint,bigint)        from public, authenticated;
revoke execute on function new_family()                          from public, authenticated;
revoke execute on function next_receipt_no(int)                  from public, authenticated;
revoke execute on function upsert_guardian(text,text,text,text)  from public, authenticated;
