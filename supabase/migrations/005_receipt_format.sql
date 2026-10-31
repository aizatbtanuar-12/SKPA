-- =====================================================================
-- Migration 005: receipt layout settings (editable in Tetapan → Format resit)
-- Safe to run more than once.
-- =====================================================================
alter table school_settings add column if not exists receipt_org_name  text    not null default 'Persatuan Ibu Bapa dan Guru';
alter table school_settings add column if not exists receipt_title     text    not null default 'RESIT RASMI YURAN PIBG';
alter table school_settings add column if not exists receipt_header    text;     -- extra lines under the school name: address, phone, e-mail
alter table school_settings add column if not exists receipt_footer    text    default 'Resit ini dijana oleh komputer dan tidak memerlukan tandatangan.';
alter table school_settings add column if not exists receipt_show_logo boolean not null default true;
alter table school_settings add column if not exists receipt_signatory text;     -- e.g. "Bendahari PIBG"; shows a signature line when set
alter table school_settings add column if not exists receipt_note      text;     -- e.g. "Terima kasih atas sumbangan anda."

-- Help the duplicate-reference check on Semakan Bayaran
create index if not exists fee_payments_reference_idx on fee_payments (reference);
