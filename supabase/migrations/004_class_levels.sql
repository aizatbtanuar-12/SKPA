-- =====================================================================
-- Migration 004: Prasekolah & PPKI classes, class rename/delete support
--   year_level: 0 = Prasekolah, 1–6 = Tahun 1–6, 7 = PPKI
-- Safe to run more than once.
-- =====================================================================

alter table classes drop constraint if exists classes_year_level_check;
alter table classes add constraint classes_year_level_check check (year_level between 0 and 7);

-- Work out the level from a class name: "PRA ..."/"PRASEKOLAH ..." -> 0, "PPKI ..." -> 7, "3 ..." -> 3
create or replace function class_level_from_name(n text) returns int
language sql immutable as $$
  select case
    when upper(trim(n)) ~ '^(PRA|PRASEKOLAH|TADIKA)\M' then 0
    when upper(trim(n)) ~ '^PPKI' then 7
    when trim(n) ~ '^[1-6]' then substring(trim(n) from '^([1-6])')::int
  end
$$;

-- Keep class names tidy (upper case, single spaces) and fill in the level when not given
create or replace function classes_normalise() returns trigger
language plpgsql as $$
begin
  new.name := upper(regexp_replace(trim(new.name), '\s+', ' ', 'g'));
  if new.year_level is null then
    new.year_level := class_level_from_name(new.name);
  end if;
  return new;
end $$;

drop trigger if exists classes_normalise on classes;
create trigger classes_normalise before insert or update on classes
  for each row execute function classes_normalise();

update classes set year_level = class_level_from_name(name) where year_level is null;

-- Deleting a class also removes parents' pending "my child is in this class" requests for it
alter table child_claims drop constraint if exists child_claims_class_id_fkey;
alter table child_claims add constraint child_claims_class_id_fkey
  foreign key (class_id) references classes(id) on delete cascade;
