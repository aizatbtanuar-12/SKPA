// PIBG portal security test suite (PDPA). Tries, as each kind of user, what anyone could try from the browser's
// developer tools: read tables straight from the database API, call functions, read other families' data,
// change things they shouldn't, and look inside the website files for secrets.
//
// Usage:
//   node supabase/security/run.mjs                      local test stack (PostgREST on :3000, psql on /tmp:5433 db "app")
//   REST=https://<project>.supabase.co/rest/v1 ANON_KEY=... node supabase/security/run.mjs --site https://epibgsealam.vercel.app
//     (against the real project the per-role checks need JWT_SECRET and real user ids; without them only
//      the anonymous, website-file and header checks run)
// Options: --dist <dir> (built website, default web/dist)   --site <url> (check live response headers)
//          --pg "<psql connection>" (database catalogue checks, default local test stack; "none" to skip)
// Exits 1 when any check fails.
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const REST = process.env.REST || 'http://localhost:3000'
const SECRET = process.env.JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'
const ANON_KEY = process.env.ANON_KEY
const DIST = arg('--dist', new URL('../../web/dist', import.meta.url).pathname)
const SITE = arg('--site', null)
const PG = arg('--pg', '-h /tmp -p 5433 -U postgres -d app')
const USERS = {
  parent: process.env.PARENT_ID || '00000000-0000-0000-0000-0000000000e1',
  teacher: process.env.TEACHER_ID || '00000000-0000-0000-0000-00000000000c',
  ajk: process.env.AJK_ID || '00000000-0000-0000-0000-00000000000b',
  admin: process.env.ADMIN_ID || '00000000-0000-0000-0000-00000000000a',
}

// ---------- helpers ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const sign = (payload) => {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 })
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url')}`
}
const ANON = ANON_KEY || sign({ role: 'anon' })
const tok = (who) => (who === 'anon' ? ANON : sign({ sub: USERS[who], role: 'authenticated' }))
const canSign = Boolean(SECRET)
async function api(method, path, token, body, extra = {}) {
  const r = await fetch(REST + path, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + token, apikey: ANON_KEY || token, 'Content-Type': 'application/json', ...extra },
  })
  const text = await r.text()
  let json = null; try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: r.status, text, json }
}
const get = (p, t) => api('GET', p, t)
const rpc = (fn, t, args = {}) => api('POST', `/rpc/${fn}`, t, args)
const denied = (r) => r.status >= 400
const IC = /(?<!\d)\d{12}(?!\d)/g
const hasIC = (s) => /(?<!\d)\d{12}(?!\d)/.test(s)

let failed = 0, passed = 0
const section = (s) => console.log(`\n== ${s}`)
const check = (ok, msg, why = '') => {
  if (ok) passed++; else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}${!ok && why ? `\n        ${why}` : ''}`)
}

const TABLES = ['profiles', 'guardians', 'students', 'student_guardians', 'child_claims', 'families', 'family_fee_status', 'fee_payments',
  'donations', 'campaigns', 'memos', 'memo_reads', 'transactions', 'programs', 'school_settings', 'classes', 'agm_meetings', 'agm_motions',
  'agm_attendance', 'agm_votes', 'role_permissions', 'receipt_counters', 'donation_receipt_counters', 'app_flags', 'audit_log']
const HIDDEN = { profiles: ['ic_no', 'spouse_ic'], guardians: ['ic_no'], students: ['ic_no'], child_claims: ['child_ic'] }
const INTERNAL_FNS = ['merge_families', 'new_family', 'next_receipt_no', 'next_donation_receipt_no', 'upsert_guardian', 'link_spouse',
  'may_join_student', 'family_code_of_student', 'log_event']
const READ_RPCS = ['fund_summary', 'campaign_progress', 'report_overview', 'report_fee_by_class', 'report_campaigns']

// ---------- 1. anonymous visitor (anyone on the internet with the public key) ----------
section('1. Anonymous visitor: nothing readable, nothing callable')
for (const t of TABLES) {
  const r = await get(`/${t}?select=*&limit=5`, ANON)
  check(denied(r) || (Array.isArray(r.json) && r.json.length === 0), `anon cannot read ${t}`, `${r.status} ${r.text.slice(0, 120)}`)
}
for (const fn of [...READ_RPCS, ...INTERNAL_FNS, 'my_ic', 'reveal_ic', 'students_with_ic', 'my_data_export', 'campaign_by_class', 'reference_usage']) {
  const r = await rpc(fn, ANON, {})
  check(denied(r) && !hasIC(r.text), `anon cannot call ${fn}()`, `${r.status} ${r.text.slice(0, 120)}`)
}

if (!canSign) {
  console.log('\n(skipping signed-in checks: set JWT_SECRET and *_ID to run them against a real project)')
} else {
  // ---------- 2. full IC numbers never leave the database in bulk ----------
  section('2. Data masking: no full IC numbers of other people in any API response')
  for (const who of Object.keys(USERS)) {
    const t = tok(who)
    const mine = await rpc('my_ic', t)
    const own = (Array.isArray(mine.json) ? mine.json : [mine.json]).flatMap((x) => (x ? [x.ic_no, x.spouse_ic] : [])).filter(Boolean)
    for (const tbl of TABLES) {
      const r = await get(`/${tbl}?select=*`, t)
      const leaked = [...new Set((r.text.match(IC) || []).filter((x) => !own.includes(x)))]
      check(leaked.length === 0, `${who}: ${tbl}${denied(r) ? ' (select=* refused)' : ''}`, `${leaked.length} full IC number(s) in the response`)
    }
    for (const [tbl, cols] of Object.entries(HIDDEN)) {
      const r = await get(`/${tbl}?select=${cols.join(',')}&limit=1`, t)
      check(denied(r), `${who}: asking for ${tbl}.${cols.join('/')} directly is refused`, `${r.status} ${r.text.slice(0, 120)}`)
      // filtering on the hidden column would let someone test guesses ("is this IC in the school?")
      const f = await get(`/${tbl}?select=id&${cols[0]}=eq.000000000000`, t)
      check(denied(f), `${who}: filtering ${tbl} by ${cols[0]} is refused`, `${f.status}`)
    }
    for (const fn of READ_RPCS) {
      const r = await rpc(fn, t)
      check(!(r.text.match(IC) || []).some((x) => !own.includes(x)), `${who}: ${fn}() shows no full IC numbers`)
    }
  }

  // ---------- 3. a parent cannot reach another family ----------
  section('3. A parent cannot see or change another family')
  const P = tok('parent'), A = tok('admin')
  const myFam = (await rpc('my_family_id', P)).json
  const fams = (await get('/families?select=id&order=id', A)).json ?? []
  const other = fams.map((f) => f.id).find((id) => id !== myFam)
  check(myFam != null && other != null, `test data has the parent's family (${myFam}) and another (${other})`)
  const fp = (await get(`/fee_payments?select=id,family_id&family_id=neq.${myFam}`, P)).json ?? []
  check(fp.length === 0, 'parent sees no other family\'s fee payments', `${fp.length} rows`)
  const st = (await get(`/student_guardians?select=student_id`, P)).json ?? []
  const otherKids = (await get(`/students?select=id&family_id=eq.${other}`, A)).json ?? []
  check(!st.some((x) => otherKids.some((k) => k.id === x.student_id)), 'parent sees no other family\'s children')
  const fs = (await get(`/family_fee_status?select=family_id`, P)).json ?? []
  check(fs.every((x) => x.family_id === myFam), 'family fee status only for own family', JSON.stringify(fs))
  const dn = (await get(`/donations?select=id,family_id,submitted_by`, P)).json ?? []
  check(dn.every((d) => d.submitted_by === USERS.parent || d.family_id === myFam), 'parent sees only own donations')
  const pr = (await get(`/profiles?select=id,full_name,phone`, P)).json ?? []
  check(pr.length <= 2, 'parent sees at most own + spouse profile', `${pr.length} profiles`)
  const other1 = otherKids[0]?.id
  if (other1) {
    const u = await api('PATCH', `/students?id=eq.${other1}`, P, { full_name: 'X' }, { Prefer: 'return=representation' })
    check(denied(u) || (Array.isArray(u.json) && u.json.length === 0), 'parent cannot edit another family\'s child', `${u.status} ${u.text.slice(0, 120)}`)
  }
  const esc = await api('PATCH', `/profiles?id=eq.${USERS.parent}`, P, { role: 'admin' }, { Prefer: 'return=representation' })
  check(denied(esc) || esc.json?.[0]?.role !== 'admin', 'parent cannot make themself administrator', `${esc.status} ${esc.text.slice(0, 120)}`)
  const pm = await api('PATCH', `/role_permissions?role=eq.parent`, P, { allowed: true }, { Prefer: 'return=representation' })
  check(denied(pm) || (Array.isArray(pm.json) && pm.json.length === 0), 'parent cannot change role permissions')
  const al = await api('POST', '/audit_log', P, { action: 'x' })
  check(denied(al), 'nobody can write to the audit log directly')
  const ald = await api('DELETE', '/audit_log?id=gt.0', A, undefined, { Prefer: 'return=representation' })
  check(denied(ald) || (Array.isArray(ald.json) && ald.json.length === 0), 'even the administrator cannot delete audit log entries')
  check(denied(await rpc('reveal_ic', P, { p_kind: 'student', p_id: String(other1 ?? 1) })), 'parent cannot reveal a full IC')
  const swi = await rpc('students_with_ic', P, { p_ic: '000000000000' })
  check(denied(swi) || (Array.isArray(swi.json) && swi.json.length === 0), 'parent cannot search students by IC')
  for (const fn of INTERNAL_FNS) check(denied(await rpc(fn, P, {})), `signed-in users cannot call internal ${fn}()`)
  const ex = (await rpc('my_data_export', P)).json
  const ownNames = new Set(((await get('/students?select=full_name', P)).json ?? []).map((k) => k.full_name))
  const exKids = ex?.anak ?? []
  check(ex && ex.keluarga && exKids.length > 0 && exKids.every((k) => ownNames.has(k.nama)), 'data download contains only own family',
    JSON.stringify(exKids.map((k) => k.nama)))
  const audit = (await get(`/audit_log?select=action&action=eq.data_dimuat_turun`, A)).json ?? []
  check(audit.length > 0, 'data download is recorded in the audit log')

  // ---------- 4. need-to-know for staff ----------
  section('4. Staff see only what their task needs')
  const T = tok('teacher'), J = tok('ajk')
  const tStudents = (await get('/students?select=id,class_id', T)).json ?? []
  const tClasses = new Set(((await get('/classes?select=id,class_teacher_id', T)).json ?? []).filter((c) => c.class_teacher_id === USERS.teacher).map((c) => c.id))
  check(tStudents.length > 0 && tStudents.every((s) => tClasses.has(s.class_id) || s.class_id == null), 'teacher sees students of own class only', `${tStudents.length} students`)
  check(denied(await rpc('reveal_ic', T, { p_kind: 'student', p_id: String(tStudents[0]?.id ?? 1) })), 'teacher cannot reveal a full IC')
  // AJK members are parents too: they see their own family, nobody else's
  const jFam = (await rpc('my_family_id', J)).json
  const jStudents = (await get(`/students?select=id&or=(family_id.is.null,family_id.neq.${jFam ?? 0})`, J)).json ?? []
  const jGuardians = (await get(`/guardians?select=id&or=(family_id.is.null,family_id.neq.${jFam ?? 0})`, J)).json ?? []
  check(jStudents.length === 0 && jGuardians.length === 0, 'AJK without record access sees no other family\'s records', `${jStudents.length} students, ${jGuardians.length} guardians`)
  check(denied(await get('/audit_log?select=id', J)) || ((await get('/audit_log?select=id', J)).json ?? []).length === 0, 'only the administrator reads the audit log')
  const rv = await rpc('reveal_ic', A, { p_kind: 'student', p_id: String(otherKids[0]?.id ?? 1) })
  check(rv.status === 200, 'administrator can reveal one IC (for corrections)')
  const rva = (await get(`/audit_log?select=action,target&action=eq.no_kp_dilihat`, A)).json ?? []
  check(rva.length > 0, 'every IC reveal is recorded in the audit log')
}

// ---------- 5. database catalogue ----------
if (PG !== 'none') {
  section('5. Database settings')
  const q = (sql) => { try { return execFileSync('psql', [...PG.split(' '), '-Atc', sql], { encoding: 'utf8' }).trim() } catch (e) { return `ERR ${e.message}` } }
  const noRls = q(`select string_agg(relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace where nspname = 'public' and relkind = 'r' and not relrowsecurity`)
  check(!noRls, 'every table has row level security switched on', noRls)
  const anonFns = q(`select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)
  check(!anonFns, 'no function can be called by anonymous visitors', anonFns)
  const intFns = q(`select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where nspname = 'public' and p.proname = any(array['${INTERNAL_FNS.join("','")}']) and has_function_privilege('authenticated', p.oid, 'execute')`)
  check(!intFns, 'internal functions cannot be called by signed-in users', intFns)
  const icCols = q(`select string_agg(table_name || '.' || column_name, ', ') from information_schema.column_privileges
    where grantee in ('anon', 'authenticated') and privilege_type = 'SELECT' and table_schema = 'public'
      and column_name in ('ic_no', 'spouse_ic', 'child_ic')`)
  check(!icCols, 'IC number columns are not readable through the API', icCols)
  const pubBucket = q(`select coalesce(string_agg(id, ', '), '') from storage.buckets where id = 'bukti-bayaran' and public`)
  check(!pubBucket, 'proof-of-payment storage is private')
}

// ---------- 6. website files ----------
section('6. Website files (what browser developer tools can see)')
if (!existsSync(DIST)) check(false, `built website found at ${DIST}`, 'run "npm run build" in web/ first')
else {
  const files = []
  const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p) })
  walk(DIST)
  const maps = files.filter((f) => f.endsWith('.map'))
  check(maps.length === 0, 'no source maps published', maps.join(', '))
  const code = files.filter((f) => /\.(js|html|css|json|webmanifest)$/.test(f) && !f.includes('/tesseract/'))
  let serviceKey = [], secrets = [], ics = []
  for (const f of code) {
    const s = readFileSync(f, 'utf8')
    for (const m of s.match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g) || []) {
      try { const p = JSON.parse(Buffer.from(m.split('.')[1], 'base64url').toString()); if (p.role && p.role !== 'anon') serviceKey.push(`${f}: role=${p.role}`) } catch { /* not a token */ }
    }
    if (/SUPABASE_SERVICE_ROLE|sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(s)) secrets.push(f)
    const found = (s.match(IC) || []).filter((x) => /^\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{6}$/.test(x))
    if (found.length) ics.push(`${f}: ${found.length}`)
  }
  check(serviceKey.length === 0, 'no privileged (service role) key inside the website', serviceKey.join('; '))
  check(secrets.length === 0, 'no secret keys or private keys inside the website', secrets.join(', '))
  check(ics.length === 0, 'no IC numbers hard-coded inside the website', ics.join('; '))
}

// ---------- 7. security headers ----------
section('7. Security headers')
const NEED = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security']
const vj = new URL('../../web/vercel.json', import.meta.url).pathname
if (existsSync(vj)) {
  const cfg = JSON.parse(readFileSync(vj, 'utf8'))
  const set = new Set(cfg.headers.flatMap((h) => h.headers.map((x) => x.key.toLowerCase())))
  for (const h of NEED) check(set.has(h), `vercel.json sets ${h}`)
  const csp = cfg.headers.flatMap((h) => h.headers).find((x) => x.key.toLowerCase() === 'content-security-policy')?.value ?? ''
  check(!/script-src[^;]*'unsafe-inline'/.test(csp) && !/script-src[^;]*'unsafe-eval'/.test(csp), 'CSP does not allow inline or eval scripts')
  check(/frame-ancestors 'none'/.test(csp), 'CSP forbids embedding the portal in other sites (clickjacking)')
} else check(false, 'web/vercel.json exists')
if (SITE) {
  const r = await fetch(SITE, { redirect: 'follow' })
  for (const h of NEED) check(r.headers.has(h), `${SITE} sends ${h}`)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
