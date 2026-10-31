-- 008: count every family that is taking part this year, not only families
-- whose children have already been verified by a class teacher.
--
-- Before: a family was counted only if it had an 'aktif' student linked to it.
-- A parent who registered, added children (still waiting for the class teacher)
-- and paid would show up in "Dikutip" but not in "x daripada y keluarga", so the
-- ring read 0 of 0. Now a family counts when it has an active child, a yuran
-- payment for the year, or a child claim still waiting for verification.

create or replace function family_in_scope(p_family bigint, p_year int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from students st where st.family_id = p_family and st.status = 'aktif')
      or exists (select 1 from fee_payments p where p.family_id = p_family and p.year = p_year
                   and p.status in ('dihantar', 'diluluskan'))
      or exists (select 1 from child_claims c join guardians g on g.user_id = c.user_id
                  where g.family_id = p_family and c.status = 'menunggu');
$$;

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
   and family_in_scope(f.id, s.current_year);

create or replace function fund_summary(p_year int default null)
returns table (year int, families_total bigint, families_paid bigint, yuran_collected numeric,
               donations numeric, other_income numeric, expenses numeric, balance numeric)
language plpgsql stable security definer set search_path = public as $$
declare y int; fee numeric; don numeric; inc numeric; exp numeric; due numeric;
begin
  if auth.uid() is null then raise exception 'Sila log masuk.'; end if;
  y := coalesce(p_year, (select current_year from school_settings where id = 1));
  select fee_per_family into due from school_settings where id = 1;
  select coalesce(sum(fp.amount), 0) into fee from fee_payments fp where fp.status = 'diluluskan' and fp.year = y;
  select coalesce(sum(d.amount), 0) into don from public.donations d
   where d.status = 'diluluskan' and extract(year from coalesce(d.reviewed_at, d.submitted_at)) = y;
  select coalesce(sum(t.amount), 0) into inc from transactions t where t.kind = 'masuk' and extract(year from t.txn_date) = y;
  select coalesce(sum(t.amount), 0) into exp from transactions t where t.kind = 'keluar' and extract(year from t.txn_date) = y;
  return query
  with fam as (
    select f.id,
           coalesce((select sum(p.amount) from fee_payments p
                      where p.family_id = f.id and p.year = y and p.status = 'diluluskan'), 0) as paid
      from families f
     where family_in_scope(f.id, y))
  select y,
         (select count(*) from fam)::bigint,
         (select count(*) from fam where fam.paid >= coalesce(due, 0))::bigint,
         fee, don, inc, exp, fee + don + inc - exp;
end $$;
grant execute on function fund_summary(int) to authenticated;
