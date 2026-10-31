# Portal PIBG SK Puncak Alam

A web portal for the PIBG (Parent-Teacher Association) of SK Puncak Alam. It works on phones and computers, and parents can add it to their home screen.

- **Parents** register, add their children, see the family's yuran status, upload proof of payment, get an official receipt, read memos, see how PIBG funds are used, and check in and vote at the AGM.
- **Class teachers (Guru Kelas)** verify the children parents register for their class (match to an existing record or create a new one) and see their class's yuran status.
- **Ketua Panitia** post memos and propose programs.
- **AJK PIBG / Bendahari** manage student and family records, import lists from Excel, approve payments, record cash, publish income and expenses, and run the AGM.
- **Pentadbir (admin)** assign roles and class teachers.

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
3. Ask teachers and AJK to register on the website. Then, in **Pengguna & Kelas**, set each person's role and assign a class teacher to each class.
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

- Parents must tick a consent notice when registering. The time of consent is stored.
- A parent's account is only linked to a family after a class teacher verifies a child. If an IC is already linked to another account, the link is refused, which stops impersonation.
- Payment proofs are stored privately. Only the uploader and AJK PIBG can open them.
- AGM votes are secret. Everyone, including AJK, sees only the totals, and parents see them only after a motion is closed. Each family votes once, after checking in.
- IC numbers are shown masked (`••••••-••-1234`) to teachers and on parent screens.
- Admins can change roles. Keep the number of `admin` and `pibg` accounts small.

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
```

### Project layout
```
supabase/migrations/001_schema.sql   tables, family/sibling logic, functions, security rules
supabase/migrations/002_storage.sql  private bucket for payment proofs
supabase/tests/                      scenario tests (12 scenarios)
web/src/pages/                       one file per screen (parent/, teacher/, staff/, admin/)
web/src/lib/                         Supabase client, auth/roles, helpers
```
