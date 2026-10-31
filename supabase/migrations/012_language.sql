-- 012: display language per user (Profil → Bahasa). 'ms' = Bahasa Melayu, 'en' = English,
-- empty = not chosen yet (the language picked on the sign-in page is used and then saved).
alter table profiles add column if not exists lang text;
alter table profiles alter column lang drop not null;
alter table profiles alter column lang drop default;
do $$ begin
  alter table profiles add constraint profiles_lang_check check (lang is null or lang in ('ms','en'));
exception when duplicate_object then null; end $$;
