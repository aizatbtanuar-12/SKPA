-- =====================================================================
-- 014: privacy & security hardening (PDPA)
--  A. Only functions the app really calls can be called through the API;
--     anonymous visitors can call none.
--  B. Full IC numbers never leave the database through the API. Tables
--     expose only the last 4 digits; your own IC comes from my_ic(), and
--     staff who manage records can reveal one IC at a time (logged).
--  C. Need-to-know: family, student and payment records are readable only
--     by roles that manage them (no longer by every committee member).
--  D. Audit log of sensitive actions (administrator can read it).
--  E. "Download my data" for every user (PDPA right of access).
-- Safe to run more than once.
-- =====================================================================

-- ---------- D. audit log (created first; used below) ----------
create table if not exists audit_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  actor    uuid references profiles(id) on delete set null,
  action   text not null,
  target   text,
  detail   jsonb
);
create index if not exists audit_log_at_idx on audit_log(at desc);
alter table audit_log enable row level security;
drop policy if exists audit_admin_read on audit_log;
create policy audit_admin_read on audit_log for select using (is_admin());
revoke all on audit_log from anon;
revoke insert, update, delete on audit_log from authenticated;
grant select on audit_log to authenticated;

create or replace function log_event(p_action text, p_target text default null, p_detail jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor, action, target, detail) values (auth.uid(), p_action, p_target, p_detail)
$$;

-- role / IC changes on accounts
create or replace function profiles_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    perform log_event('peranan_ditukar', new.id::text, jsonb_build_object('nama', new.full_name, 'dari', old.role, 'kepada', new.role));
  end if;
  if new.ic_no is distinct from old.ic_no then
    perform log_event('no_kp_ditukar', new.id::text, jsonb_build_object('nama', new.full_name, 'akhir_lama', right(old.ic_no, 4), 'akhir_baru', right(new.ic_no, 4)));
  end if;
  return new;
end $$;
drop trigger if exists profiles_audit on profiles;
create trigger profiles_audit after update of role, ic_no on profiles for each row execute function profiles_audit();

-- access settings changes
create or replace function role_permissions_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_event('akses_ditukar', new.role || ':' || new.perm, jsonb_build_object('dibenarkan', new.allowed));
  return new;
end $$;
drop trigger if exists role_permissions_audit on role_permissions;
create trigger role_permissions_audit after insert or update on role_permissions for each row execute function role_permissions_audit();

-- ---------- C. need-to-know ----------
-- may read family / student / payment records: the administrator and roles that manage them
create or replace function view_people() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or has_perm('rekod_urus') or has_perm('kutipan_yuran') or has_perm('semak_bayaran')
      or has_perm('semak_sumbangan') or has_perm('sahkan_murid') or has_perm('import')
$$;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (
  id = auth.uid() or view_people()
  or (my_role()::text = 'guru' and exists (select 1 from child_claims c where c.user_id = profiles.id and teaches_class(c.class_id)))
  or (my_role()::text <> 'parent' and role::text <> 'parent')            -- staff can see staff names (memo authors, class teachers)
  or (has_perm('kempen') and exists (select 1 from donations d where d.submitted_by = profiles.id)));

drop policy if exists families_read on families;
create policy families_read on families for select using (view_people() or id = my_family_id() or family_in_my_class(id));
drop policy if exists guardians_read on guardians;
create policy guardians_read on guardians for select using (view_people() or family_id = my_family_id() or guardian_in_my_class(id));
drop policy if exists students_read on students;
create policy students_read on students for select using (view_people() or teaches_class(class_id) or family_id = my_family_id());
drop policy if exists sg_read on student_guardians;
create policy sg_read on student_guardians for select using (
  view_people() or exists (select 1 from students s where s.id = student_id and (teaches_class(s.class_id) or s.family_id = my_family_id())));
drop policy if exists claims_read on child_claims;
create policy claims_read on child_claims for select using (user_id = auth.uid() or has_perm('sahkan_murid') or is_admin() or teaches_class(class_id));
drop policy if exists fees_read on fee_payments;
create policy fees_read on fee_payments for select using (
  is_admin() or has_perm('semak_bayaran') or has_perm('kutipan_yuran') or family_id = my_family_id() or family_in_my_class(family_id));
drop policy if exists donations_read on donations;
create policy donations_read on donations for select using (
  is_admin() or has_perm('semak_sumbangan') or has_perm('kempen') or submitted_by = auth.uid() or (family_id is not null and family_id = my_family_id()));
drop policy if exists agm_att_read on agm_attendance;
create policy agm_att_read on agm_attendance for select using (is_admin() or has_perm('agm') or family_id = my_family_id());

-- proofs of payment: only the uploader and the people who check payments
drop policy if exists "bukti: read own or staff" on storage.objects;
create policy "bukti: read own or staff" on storage.objects for select to authenticated
  using (bucket_id = 'bukti-bayaran' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.is_admin() or public.has_perm('semak_bayaran') or public.has_perm('semak_sumbangan')));

create or replace function reference_usage(p_reference text, p_exclude_kind text default null, p_exclude_id bigint default null)
returns table (kind text, id bigint, family_code text, label text, status text)
language plpgsql stable security definer set search_path = public as $$
declare ref text := upper(regexp_replace(coalesce(p_reference, ''), '\s+', '', 'g'));
begin
  if not (is_admin() or has_perm('semak_bayaran') or has_perm('semak_sumbangan')) then raise exception 'Akses ditolak.'; end if;
  if length(ref) < 6 then return; end if;
  return query
    select 'yuran'::text, p.id, f.family_code, ('Yuran ' || p.year)::text, p.status
      from fee_payments p left join families f on f.id = p.family_id
     where upper(regexp_replace(coalesce(p.reference, ''), '\s+', '', 'g')) = ref
       and not (p_exclude_kind = 'yuran' and p.id = p_exclude_id)
    union all
    select 'sumbangan'::text, d.id, f.family_code, c.title, d.status
      from donations d join campaigns c on c.id = d.campaign_id left join families f on f.id = d.family_id
     where upper(regexp_replace(coalesce(d.reference, ''), '\s+', '', 'g')) = ref
       and not (p_exclude_kind = 'sumbangan' and d.id = p_exclude_id);
end $$;

-- fund-raising participation by class, as totals (so drive managers need no access to family records)
create or replace function campaign_by_class(p_campaign bigint)
returns table (class_name text, families bigint, donated bigint, amount numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_admin() or has_perm('kempen') or has_perm('semak_sumbangan') or has_perm('laporan')) then raise exception 'Akses ditolak.'; end if;
  return query
  with paid as (
    select d.family_id, sum(d.amount) as amt from donations d
     where d.campaign_id = p_campaign and d.status = 'diluluskan' and d.family_id is not null group by d.family_id),
  cf as (select distinct s.class_id, s.family_id from students s where s.status = 'aktif' and s.class_id is not null)
  select c.name, count(cf.family_id), count(paid.family_id), coalesce(sum(paid.amt), 0)
    from classes c join cf on cf.class_id = c.id left join paid on paid.family_id = cf.family_id
   group by c.id, c.name, c.year_level
   order by c.year_level nulls last, c.name;
end $$;

-- ---------- B. IC numbers: last 4 digits only through the API ----------
alter table profiles     add column if not exists ic_last4        text generated always as (right(ic_no, 4)) stored;
alter table profiles     add column if not exists spouse_ic_last4 text generated always as (right(spouse_ic, 4)) stored;
alter table guardians    add column if not exists ic_last4        text generated always as (right(ic_no, 4)) stored;
alter table students     add column if not exists ic_last4        text generated always as (right(ic_no, 4)) stored;
alter table child_claims add column if not exists child_ic_last4  text generated always as (right(child_ic, 4)) stored;

-- column-level SELECT: every column except the full IC numbers
do $$
declare t text; cols text; hidden text[];
begin
  foreach t in array array['profiles','guardians','students','child_claims'] loop
    hidden := case t when 'profiles' then array['ic_no','spouse_ic'] when 'child_claims' then array['child_ic'] else array['ic_no'] end;
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns where table_schema = 'public' and table_name = t and column_name <> all(hidden);
    execute format('revoke select on %I from anon, authenticated', t);
    execute format('grant select (%s) on %I to authenticated', cols, t);
  end loop;
end $$;

-- your own IC numbers (Profil, Anak Saya)
create or replace function my_ic() returns table (ic_no text, spouse_ic text)
language sql stable security definer set search_path = public as $$
  select p.ic_no, p.spouse_ic from profiles p where p.id = auth.uid()
$$;

-- staff who manage records can see one full IC at a time; every reveal is logged
create or replace function reveal_ic(p_kind text, p_id text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not (is_admin() or has_perm('rekod_urus')) then raise exception 'Akses ditolak.'; end if;
  case p_kind
    when 'student'  then select ic_no into v from students  where id = p_id::bigint;
    when 'guardian' then select ic_no into v from guardians where id = p_id::bigint;
    when 'profile'  then if not is_admin() then raise exception 'Akses ditolak.'; end if;
                         select ic_no into v from profiles where id = p_id::uuid;
    else raise exception 'Jenis tidak sah.';
  end case;
  perform log_event('no_kp_dilihat', p_kind || ':' || p_id, null);
  return v;
end $$;

-- search records by a full IC number (student's or a parent's) without exposing IC columns
create or replace function students_with_ic(p_ic text) returns setof bigint
language sql stable security definer set search_path = public as $$
  select s.id from students s
   where (is_admin() or has_perm('rekod_urus') or has_perm('sahkan_murid') or has_perm('kutipan_yuran'))
     and (s.ic_no = norm_ic(p_ic)
          or exists (select 1 from student_guardians sg join guardians g on g.id = sg.guardian_id
                      where sg.student_id = s.id and g.ic_no = norm_ic(p_ic)))
$$;

-- staff: add a parent / guardian to a student by IC (find-or-create), with the one-family rule
create or replace function staff_link_guardian(p_student bigint, p_name text, p_ic text, p_phone text, p_relation text) returns void
language plpgsql security definer set search_path = public as $$
declare g bigint;
begin
  if not (is_admin() or has_perm('rekod_urus')) then raise exception 'Akses ditolak.'; end if;
  if length(coalesce(norm_ic(p_ic), '')) <> 12 then raise exception 'No. KP ibu bapa / penjaga wajib diisi (12 digit).'; end if;
  g := upsert_guardian(p_name, p_ic, p_phone);
  insert into student_guardians (student_id, guardian_id, relation) values (p_student, g, coalesce(nullif(p_relation, ''), 'penjaga'))
  on conflict do nothing;
  perform log_event('penjaga_dipautkan', 'student:' || p_student, jsonb_build_object('penjaga', g));
end $$;

-- ---------- E. download my data (PDPA right of access) ----------
create or replace function my_data_export() returns jsonb
language plpgsql security definer set search_path = public as $$
declare fam bigint := my_family_id(); out jsonb;
begin
  if auth.uid() is null then raise exception 'Sila log masuk.'; end if;
  select jsonb_build_object(
    'dijana_pada', now(),
    'profil', (select to_jsonb(p) - 'ic_last4' - 'spouse_ic_last4' from profiles p where p.id = auth.uid()),
    'keluarga', (select jsonb_build_object('kod', f.family_code) from families f where f.id = fam),
    'ibu_bapa_penjaga', (select coalesce(jsonb_agg(jsonb_build_object('nama', g.full_name, 'no_kp', g.ic_no, 'telefon', g.phone, 'emel', g.email)), '[]') from guardians g where g.family_id = fam),
    'anak', (select coalesce(jsonb_agg(jsonb_build_object('nama', s.full_name, 'mykid', s.ic_no, 'kelas', c.name, 'status', s.status)), '[]')
               from students s left join classes c on c.id = s.class_id where s.family_id = fam),
    'permohonan_anak', (select coalesce(jsonb_agg(to_jsonb(cc) - 'child_ic_last4'), '[]') from child_claims cc where cc.user_id = auth.uid()),
    'bayaran_yuran', (select coalesce(jsonb_agg(jsonb_build_object('tahun', p.year, 'jumlah', p.amount, 'rujukan', p.reference, 'tarikh_bayar', p.paid_on, 'status', p.status, 'resit', p.receipt_no)), '[]')
                        from fee_payments p where p.family_id = fam),
    'sumbangan', (select coalesce(jsonb_agg(jsonb_build_object('kutipan', ca.title, 'jumlah', d.amount, 'tarikh_bayar', d.paid_on, 'status', d.status, 'resit', d.receipt_no)), '[]')
                    from donations d join campaigns ca on ca.id = d.campaign_id where d.submitted_by = auth.uid() or (fam is not null and d.family_id = fam))
  ) into out;
  perform log_event('data_dimuat_turun', auth.uid()::text, null);
  return out;
end $$;

-- ---------- A. who may call which function ----------
do $$
declare f record;
  internal text[] := array['merge_families','new_family','next_receipt_no','next_donation_receipt_no','upsert_guardian','link_spouse',
                           'may_join_student','family_code_of_student','log_event'];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- leave extension functions alone
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.proname = any(internal) then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
-- functions created later are not callable by anonymous visitors either
alter default privileges in schema public revoke execute on functions from public, anon;
