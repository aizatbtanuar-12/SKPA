-- =====================================================================
-- Migration 006: donation drives (Kutipan Dana), e.g. SMART TV, penapis air
--   * one PIBG bank account; each drive has a short CODE parents put in the
--     transfer remark together with their family code: "SMARTTV K00007"
--   * parents see totals only; the committee sees every donation
-- Safe to run more than once.
-- =====================================================================

create table if not exists campaigns (
  id                bigserial primary key,
  title             text not null,
  code              text not null unique check (code ~ '^[A-Z0-9]{3,10}$'),
  description       text,
  poster_path       text,
  target_amount     numeric(12,2) check (target_amount is null or target_amount > 0),
  suggested_amount  numeric(10,2) check (suggested_amount is null or suggested_amount > 0),
  start_date        date,
  end_date          date,
  status            text not null default 'draf' check (status in ('draf','aktif','ditutup')),
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table if not exists donations (
  id            bigserial primary key,
  campaign_id   bigint not null references campaigns(id) on delete restrict,
  family_id     bigint references families(id) on delete set null,
  donor_name    text,                       -- for donors outside the portal (alumni, public, companies)
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
create index if not exists donations_campaign_idx on donations(campaign_id, status);
create index if not exists donations_family_idx on donations(family_id);
create index if not exists donations_reference_idx on donations(reference);

create table if not exists donation_receipt_counters (
  year  int primary key,
  last  int not null default 0
);

-- If a family is merged, its donations move with it
create or replace function merge_families(p_keep bigint, p_drop bigint) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    return coalesce(p_keep, p_drop);
  end if;
  update students     set family_id = p_keep where family_id = p_drop;
  update guardians    set family_id = p_keep where family_id = p_drop;
  update fee_payments set family_id = p_keep where family_id = p_drop;
  update donations    set family_id = p_keep where family_id = p_drop;
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
revoke execute on function merge_families(bigint,bigint) from public, authenticated;

-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------
create or replace function next_donation_receipt_no(p_year int) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into donation_receipt_counters (year, last) values (p_year, 1)
  on conflict (year) do update set last = donation_receipt_counters.last + 1
  returning last into n;
  return format('SUMB-SKPA/%s/%s', p_year, lpad(n::text, 4, '0'));
end $$;
revoke execute on function next_donation_receipt_no(int) from public, authenticated;

create or replace function approve_donation(p_donation bigint, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare d donations; r text;
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;
  select * into d from donations where id = p_donation for update;
  if d.id is null then raise exception 'Sumbangan tidak dijumpai.'; end if;
  if d.status = 'diluluskan' then return d.receipt_no; end if;
  r := next_donation_receipt_no(extract(year from now())::int);
  update donations set status = 'diluluskan', receipt_no = r, review_note = p_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_donation;
  return r;
end $$;

create or replace function reject_donation(p_donation bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;
  update donations set status = 'ditolak', review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_donation and status = 'dihantar';
end $$;

-- Committee records a donation received at the counter or from outside the portal
create or replace function record_donation(p_campaign bigint, p_amount numeric, p_family bigint default null,
                                           p_donor_name text default null, p_method text default 'tunai',
                                           p_reference text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;
  if p_family is null and coalesce(trim(p_donor_name), '') = '' then
    raise exception 'Nyatakan kod keluarga atau nama penyumbang.';
  end if;
  insert into donations (campaign_id, family_id, donor_name, amount, method, reference, submitted_by)
  values (p_campaign, p_family, nullif(trim(p_donor_name), ''), p_amount, p_method, p_reference, auth.uid())
  returning id into v_id;
  return approve_donation(v_id, 'Direkod oleh bendahari');
end $$;

-- Public progress of a drive: totals only, never who gave what
create or replace function campaign_progress()
returns table (campaign_id bigint, collected numeric, donors bigint, pending bigint)
language sql stable security definer set search_path = public as $$
  select c.id,
         coalesce(sum(d.amount) filter (where d.status = 'diluluskan'), 0),
         count(distinct coalesce(d.family_id::text, 'n' || d.id)) filter (where d.status = 'diluluskan'),
         count(*) filter (where d.status = 'dihantar')
    from campaigns c left join donations d on d.campaign_id = c.id
   where auth.uid() is not null and (c.status <> 'draf' or is_staff())
   group by c.id
$$;

-- Has this bank reference been used before (yuran or donation)? Committee only.
create or replace function reference_usage(p_reference text, p_exclude_kind text default null, p_exclude_id bigint default null)
returns table (kind text, id bigint, family_code text, label text, status text)
language plpgsql stable security definer set search_path = public as $$
declare ref text := upper(regexp_replace(coalesce(p_reference, ''), '\s+', '', 'g'));
begin
  if not is_staff() then raise exception 'Akses ditolak.'; end if;
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

-- Fund summary now includes approved donations
drop function if exists fund_summary(int);
create or replace function fund_summary(p_year int default null)
returns table (year int, families_total bigint, families_paid bigint, yuran_collected numeric,
               donations numeric, other_income numeric, expenses numeric, balance numeric)
language plpgsql stable security definer set search_path = public as $$
declare y int; fee numeric; don numeric; inc numeric; exp numeric;
begin
  if auth.uid() is null then raise exception 'Sila log masuk.'; end if;
  y := coalesce(p_year, (select current_year from school_settings where id = 1));
  select coalesce(sum(amount), 0) into fee from fee_payments where status = 'diluluskan' and fee_payments.year = y;
  select coalesce(sum(amount), 0) into don from donations
   where status = 'diluluskan' and extract(year from coalesce(reviewed_at, submitted_at)) = y;
  select coalesce(sum(amount), 0) into inc from transactions where kind = 'masuk' and extract(year from txn_date) = y;
  select coalesce(sum(amount), 0) into exp from transactions where kind = 'keluar' and extract(year from txn_date) = y;
  return query
  with fam as (
    select f.id, coalesce(sum(p.amount) filter (where p.status = 'diluluskan' and p.year = y), 0) as paid
      from families f left join fee_payments p on p.family_id = f.id
     where exists (select 1 from students st where st.family_id = f.id and st.status = 'aktif')
     group by f.id)
  select y,
         (select count(*) from fam),
         (select count(*) from fam where paid >= (select fee_per_family from school_settings where id = 1)),
         fee, don, inc, exp, fee + don + inc - exp;
end $$;
grant execute on function fund_summary(int) to authenticated;

-- ---------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------
alter table campaigns enable row level security;
alter table donations enable row level security;
alter table donation_receipt_counters enable row level security;

drop policy if exists campaigns_read on campaigns;
create policy campaigns_read on campaigns for select using (auth.uid() is not null and (status <> 'draf' or is_staff()));
drop policy if exists campaigns_staff on campaigns;
create policy campaigns_staff on campaigns for all using (is_staff()) with check (is_staff());

drop policy if exists donations_read on donations;
create policy donations_read on donations for select using (
  is_staff() or submitted_by = auth.uid() or (family_id is not null and family_id = my_family_id()));
drop policy if exists donations_parent_insert on donations;
create policy donations_parent_insert on donations for insert with check (
  submitted_by = auth.uid() and status = 'dihantar' and receipt_no is null and reviewed_by is null
  and donor_name is null
  and family_id is not distinct from my_family_id()
  and exists (select 1 from campaigns c where c.id = campaign_id and c.status = 'aktif'));
drop policy if exists donations_staff on donations;
create policy donations_staff on donations for all using (is_staff()) with check (is_staff());

grant select, insert, update, delete on campaigns, donations, donation_receipt_counters to authenticated;
grant usage, select on all sequences in schema public to authenticated;
