# Portal PIBG SK Puncak Alam: security & PDPA review

This review covers the Portal PIBG, which holds parents' and children's names, IC / MyKid numbers, phone numbers, payment proofs and AGM votes. It was checked against the Personal Data Protection Act 2010 as amended in 2024. The question was what anyone could see or do through the website, browser developer tools (Network, Console, Sources), the API responses, and the database API called directly with the public key.

This document is not legal advice. The PIBG committee should review the privacy notice (`#/privasi`) before launch.

## 1. What was found (before migration 014)

| # | Finding | Severity |
|---|---------|----------|
| F1 | **Full IC / MyKid numbers in API responses.** The screens showed masked ICs (`••••••-••-1234`), but the masking happened only in the browser. The API returned full 12-digit numbers to every signed-in role, and anyone could see them in the Network tab. In tests: a parent received the spouse's and children's ICs, a teacher received the ICs of class parents and all staff, and AJK / admin received everyone's. Our scan counted 16 separate exposures. | High |
| F2 | **Database functions callable by anonymous visitors.** Almost every function could be called with only the public key, without signing in. That included helpers such as `may_join_student` and `family_code_of_student`, which can be used to check whether an IC number is in the school, and `link_spouse`. | High |
| F3 | **AJK PIBG could read every family record.** This included IC numbers, phone numbers and children, even for AJK members with no records permission. This breaks need-to-know. | Medium |
| F4 | Teachers could read profiles of all staff. Donation and payment-proof reads were broader than the task needed. | Medium |
| F5 | There was no audit trail of who changed roles or access, or who changed or viewed IC numbers. | Medium |
| F6 | There was no way for a parent to see everything held about them (right of access). The privacy notice was a single sentence. | Medium |
| F7 | There were no security headers: CSP, anti-framing and HSTS. Links to payment proofs stayed valid for 10 minutes. | Low |

## 2. What was changed

### Data masking in transit (F1)
- `014_privacy.sql` **revokes column access** to `profiles.ic_no`, `profiles.spouse_ic`, `guardians.ic_no`, `students.ic_no` and `child_claims.child_ic` for API users. The database itself refuses to send them, so the masking does not depend on the website code.
- New generated columns `ic_last4` / `spouse_ic_last4` / `child_ic_last4` carry only the last 4 digits. Screens show `••••••-••-1234`.
- The full IC is available only where there is a need, through audited functions:
  - `my_ic()` returns your own IC, for Profil.
  - `reveal_ic(kind, id)` returns one IC at a time. Only the administrator or records managers can use it, when they open a record to correct it, and **every call is logged**.
  - `students_with_ic(ic)` lets staff search by a full IC and returns record IDs only, never the IC.
- Filtering by a hidden column (`?ic_no=eq.…`) is also refused, so the API can't be used to test whether a guessed IC is in the school.

### Function allowlist (F2)
- No database function can be called anonymously.
- Internal helpers can't be called from the browser at all: `merge_families`, `new_family`, `next_receipt_no`, `next_donation_receipt_no`, `upsert_guardian`, `link_spouse`, `may_join_student`, `family_code_of_student` and `log_event`.
- Default privileges stop new functions from becoming public by accident.

### Need-to-know reads (F3, F4)
Read rules were rewritten around `view_people()`:
- **Administrator, and anyone with a records, fee, payment-check, donation-check, verification or import permission:** sees family records.
- **Teacher:** sees own class only.
- **AJK fund-raising (kempen):** sees donors of their drives, as totals per class (`campaign_by_class`).
- **Parent:** sees own family only.
- **Payment proofs:** only the uploader, the administrator and the treasurer roles can open them.

### Audit log (F5)
- New `audit_log` table. It records role changes, access-setting changes, IC changes (last 4 digits only), IC reveals, guardian links and personal-data downloads.
- The administrator reads it in **Tetapan → Log audit**.
- No one can insert, edit or delete entries through the API, not even the administrator.

### PDPA rights and notice (F6)
- **Notis Privasi** (`#/privasi`, BM and EN) covers:
  - data collected and purpose;
  - who can see it;
  - security;
  - retention;
  - hosting outside Malaysia;
  - access, correction and withdrawal.
- It is linked from registration and from Profil.
- **Profil → Data & privasi → Muat turun data saya** downloads, as JSON, everything held about the parent's family. Each download is logged.

### Web hardening (F7)
- `web/vercel.json` sets these headers:
  - `Content-Security-Policy`: scripts only from the site itself, no inline or eval script, data only to Supabase, `frame-ancestors 'none'`.
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Strict-Transport-Security`
  - `Cross-Origin-Opener-Policy`
- **No source maps** are published (`build.sourcemap: false`).
- Payment-proof links expire after **2 minutes** (previously 10).
- Receipt reading (OCR) still runs on the parent's own device and was confirmed to work under the new CSP.

## 3. Security testing

`supabase/security/run.mjs` uses the database API directly, the way someone with browser developer tools could. It runs as an anonymous visitor, a parent, a teacher, an AJK member and the administrator.

| Section | What it checks |
|---|---|
| 1. Anonymous visitor | No table is readable. No function is callable. |
| 2. Data masking | No response, from any table or report, contains someone else's full IC. Asking for IC columns, or filtering by them, is refused. |
| 3. Cross-family | A parent cannot read another family's children, fees, donations or profiles. A parent cannot edit another family's child, make themself administrator, change permissions, reveal or search ICs, or call internal functions. The data download contains only their own family. |
| 4. Need-to-know | A teacher sees only their own class. AJK see no other family's records. The audit log is administrator-only and cannot be deleted. IC reveals are logged. |
| 5. Database | Every table has Row Level Security. No anonymous function access. IC columns have no SELECT grant. The payment-proof bucket is private. |
| 6. Website files | No source maps. No service-role or secret key. No hard-coded IC numbers in the published JavaScript. |
| 7. Headers | All required headers are configured. With `--site <url>`, it also checks the live site. |

**Result on the test database with migrations 001–014: 244 passed, 0 failed.** A browser walk-through recorded every API response for each role and found no full IC numbers. The only exceptions were the user's own IC and the one record an administrator opened to edit. To check that the suite catches regressions, IC column access was briefly re-granted and anonymous access was restored to one function. The suite then reported 14 failures.

The database scenario tests (`supabase/tests/10`–`60`) were also run and all pass.

**Run it after every database change:**
```bash
node supabase/security/run.mjs                       # local test stack
node supabase/security/run.mjs --site https://epibgsealam.vercel.app   # + live header check
```

## 4. To do in the Supabase / Vercel dashboards (cannot be set from code)

| Setting | Where | Why |
|---|---|---|
| Confirm e-mail on sign-up: **ON** | Authentication → Providers → Email | Stops sign-ups with other people's e-mail addresses |
| Minimum password length **8+**, require letters and digits | Authentication → Providers → Email → Password security | Weak passwords |
| Leaked password protection: **ON** (Pro plan) | Same place | Blocks passwords known from breaches |
| Rate limits: keep the defaults or lower them | Authentication → Rate Limits | Slows password-guessing and sign-up spam |
| Site URL and redirect URLs: only `https://epibgsealam.vercel.app` | Authentication → URL Configuration | Stops reset links pointing elsewhere |
| Never put the **service_role** key in Vercel or the website | Vercel → Settings → Environment Variables | Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong there |
| Few administrators; remove accounts of AJK who leave | Pengguna & Kelas | Least privilege |
| Supabase account owners: turn on **MFA** for the dashboard | supabase.com → Account → Security | The dashboard can read everything |
| Backups: download one each term, or use Pro (daily backups) | Database → Backups | Availability and integrity |
| Check **Security Advisor** after each migration | Database → Advisors | Supabase's own checks |
| Region | Project settings | Data stored outside Malaysia (e.g. Singapore) is a cross-border transfer; this is disclosed in the privacy notice |

**New columns on `profiles`, `guardians`, `students` or `child_claims`.** These four tables use a column allowlist, so a new column is not readable until it is granted, for example `grant select (new_col) on students to authenticated;`. Never grant `ic_no`, `spouse_ic` or `child_ic`.

## 5. Procedures the PIBG should adopt

- **Data breach.** The 2024 amendments added mandatory breach notification. Notify the Personal Data Protection Commissioner as soon as practicable and **within 72 hours**. Notify affected parents without undue delay (guidance: within 7 days) if significant harm is likely. Steps:
  1. Disable the leaked access: change passwords, rotate the anon key if needed.
  2. Read **Log audit** and Supabase logs to find what was exposed.
  3. Record the facts.
  4. Notify.
- **Person in charge.** Name one AJK member, for example the Setiausaha, as the contact for data matters: access requests, corrections, withdrawals and breaches. A formal DPO appointment is required only above certain thresholds (for example, more than 20,000 data subjects).
- **Retention.** At the start of each school year, archive or delete the records of families with no active child. Keep financial records for as long as the PIBG audit requires.
- **Withdrawal / deletion requests.** The administrator removes the parent's account and anonymises the family's records. Receipts and payments stay, because they are needed for accounts.
- **Exports.** CSV files downloaded from Kutipan / Laporan contain personal data. Keep them off personal shared drives and delete them when done.

## 6. Residual risks (accepted or for later)

- Phone numbers stay visible to the people who need them: class teachers and records or fee staff. That is the purpose of collecting them.
- A signed-in parent can still see their own family's full ICs, through `my_ic` and the data download. This is intended.
- The anon key is public by design. Security relies on Row Level Security and grants, which the test suite checks.
- The fake sign-in in the test stack does not test Supabase Auth itself (password policy, rate limits). Those are dashboard settings (section 4).
- Admin MFA inside the portal is not built. It is recommended if the number of administrators grows.
