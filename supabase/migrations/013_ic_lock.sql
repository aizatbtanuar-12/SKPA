-- 013: once a parent is verified (linked to a family), only the administrator can change their IC
-- number. The change is carried to the parent's family record so the two stay the same.
create or replace function protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare g bigint;
begin
  new.ic_no := norm_ic(new.ic_no);
  if auth.uid() is not null and coalesce(my_role()::text,'') <> 'admin' then
    if new.role is distinct from old.role or new.panitia is distinct from old.panitia then
      raise exception 'Hanya pentadbir boleh menukar peranan.';
    end if;
    if new.ic_no is distinct from old.ic_no and (
         exists (select 1 from guardians where user_id = old.id)
      or exists (select 1 from child_claims where user_id = old.id and status in ('dipadan','rekod_baru'))) then
      raise exception 'No. KP telah disahkan. Hubungi pentadbir untuk pindaan.';
    end if;
  end if;
  -- keep the parent record in step with the account
  if new.ic_no is distinct from old.ic_no and new.ic_no is not null then
    if length(new.ic_no) <> 12 then raise exception 'No. Kad Pengenalan mesti 12 digit.'; end if;
    select id into g from guardians where user_id = old.id;
    if g is not null then
      if exists (select 1 from guardians where ic_no = new.ic_no and id <> g) then
        raise exception 'No. KP ini sudah digunakan oleh ibu bapa / penjaga lain.';
      end if;
      update guardians set ic_no = new.ic_no where id = g;
    end if;
  end if;
  return new;
end $$;

-- is this account verified? (the profile page locks the IC field)
create or replace function my_ic_locked() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians where user_id = auth.uid())
      or exists (select 1 from child_claims where user_id = auth.uid() and status in ('dipadan','rekod_baru'))
$$;
grant execute on function my_ic_locked() to authenticated;
