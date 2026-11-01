# Portal PIBG SK Puncak Alam

A web portal for the PIBG (Parent-Teacher Association) of SK Puncak Alam. It works on phones and computers, and parents can add it to their home screen.

- **Parents** register, add their children, see the family's yuran status, upload proof of payment, get an official receipt, read memos, see how PIBG funds are used, and check in and vote at the AGM.
- **Class teachers (Guru Kelas)** verify the children parents register for their class (match to an existing record or create a new one) and see their class's yuran status.
- **Ketua Panitia** post memos and propose programs.
- **Donation drives (Kutipan Dana)** such as Smart TV or water filters: the committee creates a drive with a short code (e.g. `SMARTTV`), poster, optional target and end date. Parents transfer any amount to the same PIBG account with the remark `SMARTTV K00012` (drive code + family code), upload proof, and get a separate donation receipt (`SUMB-SKPA/2026/0001`). Everyone sees progress and number of donors; only the committee sees who gave what. Includes a ready-made WhatsApp announcement and per-class participation.
- **AJK PIBG / Bendahari** manage student and family records, import lists from Excel, approve payments, record cash, publish income and expenses, and run the AGM.
- **Pengerusi PIBG (chairman)**, **Bendahari PIBG (treasurer)** and **AJK PIBG** can view records; what each of them may *change* is set by the administrator in **Tetapan → Akses pengguna**. By default AJK PIBG may only manage fund-raising drives, post memos and view reports.
- **Laporan** (reports: fee collection by class and month, donations, finances — totals only) for the committee and teachers.
- **Pentadbir (admin)** assign roles and class teachers.
- The chairman, AJK PIBG and admin can also use every parent function (Anak Saya, Yuran PIBG, AGM vote), since they are parents too.

The interface is in Bahasa Melayu.

## How yuran per family works

Yuran is charged **once per family**, not per student. Families are formed automatically.

- Every parent/guardian is stored once, keyed by their **MyKad number**.
- A student and all of their guardians always share one family.
- So if two students share a father's or mother's IC, even in different classes, they become one family. This works however the data arrived: Excel import, a parent registering, or a teacher verifying.
- When two existing families turn out to be linked, they are **merged** and their payments move with them.
- For guardians with no IC on record, the committee can merge families by family code, or separate a student, from **Rekod Murid & Keluarga**.

Each family gets a code (e.g. `K00012`). Parents use it as the bank transfer reference.

---

## Setup (about 30 minutes, one time)

You need a free [Supabase](https://supabase.com) account (database + login + file storage) and a free [Vercel](https://vercel.com) or [Netlify](https://netlify.com) account (hosts the website). Both can sign in with GitHub.

### 1. Create the Supabase project
1. Supabase → **New project**. Name: `pibg-skpa`. Region: **Southeast Asia (Singapore)**. Save the database password somewhere safe.
2. When it's ready, open **SQL Editor** → **New query**. Paste the whole of `supabase/migrations/001_schema.sql` → **Run**.
3. New query again → paste `supabase/migrations/002_storage.sql` → **Run**.
4. New query again → paste `supabase/migrations/003_profile_repair.sql` → **Run**. This repairs any account registered before steps 2–3 were done, and is safe to run again any time.
5. New query again → paste `supabase/migrations/004_class_levels.sql` → **Run**. Adds Prasekolah and PPKI classes and class rename/delete.
6. New query again → paste `supabase/migrations/005_receipt_format.sql` → **Run**. Lets admins customise the receipt (Tetapan → Format resit).
7. Then `006_donations.sql` and `007_poster_storage.sql`, each → **Run**. Adds donation drives (Kutipan Dana) and poster uploads.
8. Then `008_family_count.sql` → **Run**. Counts families that have paid or are waiting for their children to be verified in the "x daripada y keluarga" figure.
9. Then `009_family_rules.sql` → **Run**. Adds the Pengerusi PIBG role, makes IC numbers compulsory, records each parent's spouse, and stops a student IC being registered under two families.
10. Then `010_access.sql` → **Run**. Adds the Bendahari PIBG role, **Tetapan → Akses pengguna** (the administrator decides what each role may change) and the **Laporan** page. Afterwards, in **Pengguna & Kelas**, change your treasurer's role to *Bendahari PIBG* (AJK PIBG no longer approves payments by default).
11. Then `011_spouse_codes.sql` → **Run**. Links spouses' accounts and joins their family records, renumbers family codes without gaps (K00001, K00002, …), and stores the payment date read from the bank receipt.
12. Then `012_language.sql` → **Run**. Lets each user choose Bahasa Melayu or English (Profil, the BM | EN switch in the menu, or on the sign-in page).
13. Then `013_ic_lock.sql` → **Run**. Once a parent is verified, only the administrator can change their IC number (Pengguna & Kelas → No. KP → Ubah); their family record is updated with it.
14. Then `014_privacy.sql` → **Run**. PDPA hardening: full IC numbers no longer leave the database (only the last 4 digits), each role reads only what its task needs, internal functions can't be called from the browser, and sensitive actions go to an audit log (Tetapan → Log audit). **Deploy the new website at the same time**: the old website version asks for IC columns that 014 hides. See `docs/SECURITY_PDPA.md`.

### 2. Configure sign-in e-mails (important)
Supabase's built-in e-mail sender only delivers to your own Supabase team members, and only 2 e-mails per hour. Parents would never receive their confirmation e-mail. Pick one option:

- **Option A: quickest.** Go to **Authentication → Sign In / Providers → Email** and turn **off** "Confirm email". Parents can log in straight after registering. Password-reset e-mails still won't reach parents until you do option B.
- **Option B: recommended before launch.** Connect a free e-mail service such as [Brevo](https://www.brevo.com) (300 e-mails/day free) under **Authentication → Emails → SMTP Settings**. Then raise the limit under **Authentication → Rate Limits** (e.g. 100/hour for registration week).

Also set **Authentication → URL Configuration → Site URL** to your website address from step 3 (e.g. `https://pibg-skpa.vercel.app`).

### 3. Put the website online (Vercel)
1. Vercel → **Add New → Project** → import this GitHub repository.
2. **Root Directory:** `web`. Framework: Vite (auto-detected).
3. **Environment Variables**, copied from Supabase → **Project Settings → API**:
   - `VITE_SUPABASE_URL`: the Project URL
   - `VITE_SUPABASE_ANON_KEY`: the `anon` `public` key (this key is safe to publish; security is enforced in the database)
4. **Deploy**. Every push to GitHub redeploys automatically.

On Netlify, use the same settings: base directory `web`, build command `npm run build`, publish directory `web/dist`.

### 4. Make yourself the first admin
1. Open the website and **Daftar Akaun** (register) with your own e-mail.
2. In Supabase **SQL Editor**, run (with your e-mail):
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. Log out and in again. You'll see the **Pentadbir** menu.

### 5. Load the school's data
1. **Tetapan:** school code, yuran amount per family, PIBG bank account (shown to parents), current year.
2. **Import Data:** download the template, or upload your own Excel saved as **CSV UTF-8**. Common APDM column names are recognised automatically. Classes are created automatically. Re-importing the same list updates records rather than duplicating them.
3. Ask teachers and AJK to register on the website. Then, in **Pengguna & Kelas**, set each person's role and assign a class teacher to each class. Classes are grouped in tabs (Prasekolah, Tahun 1–6, PPKI); create Tahun 1 classes once and use **Salin kelas Tahun 1 ke tahun lain** to create the same names for Tahun 2–6.
4. Share the website link with parents (WhatsApp class groups work well).

### Each new school year
In **Tetapan**, change **Tahun semasa** (e.g. 2026 → 2027). Every family's yuran status starts again from "Belum bayar". Past payments and receipts are kept. Re-import the new class lists so students move to their new classes. Mark leavers as "Telah keluar" in **Rekod**.

---

## Roles & what each can see

| | Parent | Guru Kelas | Ketua Panitia | AJK PIBG | Pentadbir |
|---|---|---|---|---|---|
| Own children & family yuran | ✔ | | | | |
| Students & parents of **own class** | | ✔ | | ✔ (all) | ✔ (all) |
| Verify children registered by parents | | own class | | all | all |
| Approve payments / record cash | | | | ✔ | ✔ |
| Post memos | | own class | ✔ | ✔ | ✔ |
| Programs | view | view | propose | ✔ | ✔ |
| Income & expense entries | view | view | view | ✔ | ✔ |
| Fund summary (totals only) | ✔ | ✔ | ✔ | ✔ | ✔ |
| AGM check-in & vote | ✔ (1 per family) | | | run meeting | run meeting |
| Assign roles & class teachers | | | | | ✔ |

These rules are enforced **inside the database** (Postgres Row Level Security), not just hidden in the interface. A parent cannot read another family's data even by calling the API directly.

## Security & privacy notes (PDPA)

The full review, test results and the settings to switch on in the Supabase dashboard are in **[docs/SECURITY_PDPA.md](docs/SECURITY_PDPA.md)**. In short:

- Parents tick a consent notice when registering (time of consent is stored). The privacy notice is at `#/privasi` (linked from registration and Profil).
- **Full IC / MyKid numbers never leave the database in bulk.** The API only gives the last 4 digits (`••••••-••-1234`). Your own IC comes from `my_ic()`; staff who manage records see one full IC at a time (`reveal_ic()`), and every reveal is logged.
- Need-to-know access: teachers see their own class, AJK see only what their permissions (Tetapan → Akses pengguna) need, parents see only their own family. Enforced **inside the database** (Row Level Security + column privileges), so it holds even for someone calling the API from browser developer tools.
- Audit log (Tetapan → Log audit, administrator only): role and access changes, IC changes and reveals, data downloads. It cannot be edited or deleted from the app.
- Right of access: Profil → **Muat turun data saya** downloads everything held about the parent's family.
- Payment proofs are stored privately; links to view them expire after 2 minutes. Receipt reading (OCR) runs on the parent's own device.
- AGM votes are secret.
- Security headers (CSP, no framing, HSTS…) are set in `web/vercel.json`; no source maps are published.
- Run the security test suite after any database change: `node supabase/security/run.mjs` (see the doc).

## Free plan limits to know

The Supabase free plan (500 MB database, 1 GB files) is plenty for one school. Payment photos are compressed to ~300 KB before upload. However, **free projects pause after 7 days with no activity**, for example during school holidays. Data is kept, and someone restores it from the Supabase dashboard. If that's a problem, the Pro plan (USD 25/month) removes the pause and adds daily backups. Either way, download a backup before each new year (**Database → Backups**, or `pg_dump`).

## Not included yet
- Online payment gateway (FPX/DuitNow). Parents transfer manually and upload proof.
- Push or WhatsApp notifications. Memos have a "Salin untuk WhatsApp" (copy for WhatsApp) button.
- Login by phone/SMS (needs a paid SMS provider). Login is by e-mail.

## Development

```bash
cd web
cp .env.example .env      # fill in your Supabase URL + anon key
npm install
npm run dev               # http://localhost:5173
npm run build
```

Database tests (`supabase/tests/`) run on any Postgres 15+. They use a small stand-in for Supabase's `auth` and `storage` schemas:

```bash
createdb pibg_test
psql -d pibg_test -f supabase/tests/00_supabase_stub.sql
psql -d pibg_test -f supabase/migrations/001_schema.sql
psql -d pibg_test -f supabase/migrations/002_storage.sql
psql -d pibg_test -f supabase/tests/10_scenarios.sql   # ends with "ALL TESTS PASSED"
psql -d pibg_test -f supabase/tests/20_donations.sql   # ends with "DONATION TESTS PASSED"
```

### Project layout
```
supabase/migrations/001_schema.sql   tables, family/sibling logic, functions, security rules
supabase/migrations/002_storage.sql  private bucket for payment proofs
supabase/migrations/003_profile_repair.sql  repairs accounts created before setup
supabase/migrations/004_class_levels.sql    Prasekolah (0) & PPKI (7) levels, tidy class names
supabase/migrations/005_receipt_format.sql  receipt header/footer/signature settings
supabase/migrations/006_donations.sql       donation drives, donations, donation receipts
supabase/migrations/007_poster_storage.sql  public bucket for drive posters
supabase/migrations/008_family_count.sql    family count for fund summary / fee status
supabase/migrations/009_family_rules.sql    chairman role, compulsory IC, spouse, one family per student
supabase/tests/30_family_rules.sql          tests for 009
supabase/migrations/010_access.sql          Bendahari role, per-role permissions, reports
supabase/tests/40_access.sql                tests for 010
supabase/migrations/011_spouse_codes.sql    spouse linking, gap-free family codes, payment date
supabase/tests/50_spouse_codes.sql          tests for 011
supabase/migrations/012_language.sql        display language per user
supabase/migrations/013_ic_lock.sql         verified IC numbers locked to the administrator
supabase/tests/60_ic_lock.sql               tests for 013
supabase/migrations/014_privacy.sql         PDPA: IC masking, need-to-know reads, function allowlist, audit log, data export
supabase/security/run.mjs                   security test suite (API exposure per role, cross-family, functions, website files, headers)
docs/SECURITY_PDPA.md                       security & PDPA review, findings, fixes, dashboard checklist
web/src/lib/i18n/                           BM → English dictionary (en.ts) and the in-app translator
web/scripts/receipt-date.test.mts           receipt date reader cases (npx tsx scripts/receipt-date.test.mts)
supabase/tests/                      scenario tests (12 scenarios)
web/src/pages/                       one file per screen (parent/, teacher/, staff/, admin/)
web/src/lib/                         Supabase client, auth/roles, helpers
```
