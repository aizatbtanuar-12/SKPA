-- =====================================================================
-- 011: spouse linking + family codes without gaps
--  1. A parent who adds their spouse now links the spouse's existing
--     account too, and when BOTH parents have named each other, their two
--     family records are joined into one. Works whichever parent registered
--     first, and runs again automatically when the spouse registers later.
--  2. Family codes (K00001…) are numbered in order with no gaps. Codes were
--     the internal record number, which skipped every time a temporary
--     family was merged away. Existing codes are renumbered once.
--  3. Payment date: fee payments and donations keep the date on the bank
--     receipt (read from the uploaded receipt, editable by the parent).
-- Safe to run more than once.
-- =====================================================================

-- ---------- 2. family codes ----------
create table if not exists app_flags (key text primary key, done_at timestamptz not null default now());
alter table app_flags enable row level security;

-- next code = highest existing code + 1 (a code freed by a merge is reused if it was the last one)
create or replace function set_family_code() returns trigger
language plpgsql as $$
declare n int;
begin
  if new.family_code is null then
    perform pg_advisory_xact_lock(hashtext('pibg_family_code'));
    select coalesce(max(substring(family_code from 2)::int), 0) + 1 into n
      from families where family_code ~ '^K[0-9]+$';
    new.family_code := 'K' || lpad(n::text, 5, '0');
  end if;
  return new;
end $$;

-- one-time renumbering of the existing codes, keeping their current order
do $$
begin
  if not exists (select 1 from app_flags where key = 'renumber_family_codes_011') then
    update families set family_code = 'T' || id;               -- avoid clashes while renumbering
    with o as (select id, row_number() over (order by id) as n from families)
    update families f set family_code = 'K' || lpad(o.n::text, 5, '0') from o where o.id = f.id;
    insert into app_flags (key) values ('renumber_family_codes_011');
  end if;
end $$;

-- ---------- 1. spouse linking ----------
-- Called whenever a parent's spouse details or IC change, and after a child is approved.
-- p_family is ignored (kept for older callers); the families are worked out here.
create or replace function link_spouse(p_user uuid, p_family bigint default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me profiles; sp profiles; mutual boolean;
  my_g guardians; sp_g guardians; fam bigint; v_sp bigint; v_me bigint; st record;
begin
  select * into me from profiles where id = p_user;
  if me.id is null or me.spouse_ic is null or me.ic_no is null then return null; end if;
  if me.spouse_ic = me.ic_no then return 'No. KP pasangan sama dengan No. KP anda.'; end if;

  -- prefer the account that named me back (two accounts can carry the same IC)
  select * into sp from profiles where ic_no = me.spouse_ic and id <> me.id
   order by (spouse_ic = me.ic_no) desc nulls last, created_at limit 1;
  mutual := coalesce(sp.id is not null and sp.spouse_ic = me.ic_no, false);

  select * into my_g from guardians where user_id = me.id or ic_no = me.ic_no order by (user_id = me.id) desc nulls last limit 1;
  select * into sp_g from guardians where ic_no = me.spouse_ic or (sp.id is not null and user_id = sp.id)
   order by (ic_no = me.spouse_ic) desc limit 1;

  if my_g.family_id is not null and sp_g.family_id is not null and my_g.family_id <> sp_g.family_id then
    -- two separate families: only join them when both parents named each other
    if not mutual then
      return format('Pasangan anda sudah mempunyai rekod keluarga sendiri (%s). Minta pasangan log masuk dan tambah anda sebagai pasangan di Anak Saya; kedua-dua rekod akan digabungkan secara automatik.',
                    (select family_code from families where id = sp_g.family_id));
    end if;
    fam := merge_families(least(my_g.family_id, sp_g.family_id), greatest(my_g.family_id, sp_g.family_id));
  elsif my_g.family_id is not null then
    fam := my_g.family_id;
  elsif sp_g.family_id is not null then
    -- I have no family yet but my spouse does: join it only if they named me too
    if not mutual then
      return 'Pasangan anda sudah berdaftar. Minta pasangan log masuk dan tambah anda sebagai pasangan di Anak Saya untuk menyertai keluarga yang sama.';
    end if;
    fam := sp_g.family_id;
  else
    return null;  -- neither has children registered yet; linked when the first child is approved
  end if;

  -- me (as guardian) in the family
  v_me := coalesce(my_g.id, null);
  if v_me is null then
    insert into guardians (full_name, ic_no, phone, user_id, family_id)
    values (me.full_name, me.ic_no, me.phone, me.id, fam) returning id into v_me;
  else
    update guardians set family_id = fam,
           user_id = coalesce(user_id, case when not exists (select 1 from guardians x where x.user_id = me.id and x.id <> v_me) then me.id end)
     where id = v_me;
  end if;

  -- spouse (as guardian) in the family, with their account if they have one
  v_sp := coalesce(sp_g.id, upsert_guardian(coalesce(me.spouse_name, sp.full_name), me.spouse_ic, coalesce(me.spouse_phone, sp.phone)));
  update guardians set family_id = fam where id = v_sp;
  if sp.id is not null and not exists (select 1 from guardians x where x.user_id = sp.id and x.id <> v_sp) then
    update guardians set user_id = sp.id where id = v_sp and user_id is null;
  end if;

  -- both parents attached to every child in the family
  for st in select id from students where family_id = fam and status = 'aktif' loop
    insert into student_guardians (student_id, guardian_id, relation)
    values (st.id, v_me, coalesce(me.relation, 'penjaga')) on conflict do nothing;
    insert into student_guardians (student_id, guardian_id, relation)
    values (st.id, v_sp, spouse_relation(coalesce(me.relation, 'penjaga'))) on conflict do nothing;
  end loop;

  -- children either parent is still waiting for that are already in this family: mark matched
  update child_claims c set status = 'dipadan', student_id = s.id, reviewed_at = now(),
         review_note = coalesce(c.review_note, 'Dipadankan automatik: anak sudah berdaftar dalam keluarga pasangan')
    from students s
   where c.status = 'menunggu' and c.user_id in (me.id, sp.id)
     and s.family_id = fam and s.ic_no = norm_ic(c.child_ic);
  return null;
end $$;

-- run it when a profile's IC or spouse changes, for this person and for anyone who named them
create or replace function profiles_spouse_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare q record;
begin
  if new.spouse_ic is not null then perform link_spouse(new.id); end if;
  if new.ic_no is not null then
    for q in select id from profiles where spouse_ic = new.ic_no and id <> new.id loop
      perform link_spouse(q.id);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists profiles_spouse on profiles;
create trigger profiles_spouse after insert or update of ic_no, spouse_ic on profiles
  for each row execute function profiles_spouse_sync();

-- save_spouse: same as before, the trigger above does the linking; return its message
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
  return link_spouse(auth.uid());
end $$;
grant execute on function save_spouse(text, text, text, text, boolean) to authenticated;

-- approval: new child goes straight into the parent's family (no throw-away family)
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
    -- put the new child straight into the parent's family (no throw-away family, no skipped code)
    insert into students (full_name, ic_no, class_id, source, created_by, family_id)
    values (c.child_name, norm_ic(c.child_ic), c.class_id, 'ibubapa', auth.uid(), (select family_id from guardians where id = v_g))
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

-- one-time repair: link every spouse already entered
do $$ declare q record; begin
  for q in select id from profiles where spouse_ic is not null loop perform link_spouse(q.id); end loop;
end $$;

-- ---------- 3. payment date from the receipt ----------
alter table fee_payments add column if not exists paid_on date;
alter table donations    add column if not exists paid_on date;

-- monthly report counts a payment in the month it was paid
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
         and extract(month from coalesce(p.paid_on::timestamptz, p.reviewed_at, p.submitted_at)) = m
   group by m order by m;
end $$;
