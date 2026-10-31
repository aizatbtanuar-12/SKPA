import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase, check, type Profile, type Role, type ClassRow } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Card, Empty, Modal, Pager, useAction } from '../../components/ui'
import { LEVELS, date, levelLabel, maskIC, roleLabel } from '../../lib/util'

type P = Profile & { created_at: string }
const CLASS_PAGE = 10
const USER_PAGE = 20

export default function Users() {
  const [users, setUsers] = useState<P[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])

  const load = useCallback(async () => {
    const [u, c] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('classes').select('*').order('year_level').order('name'),
    ])
    setUsers((u.data as P[]) ?? [])
    setClasses((c.data as ClassRow[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <>
      <PageHead title="Pengguna & Kelas" sub="Guru dan AJK mendaftar sendiri sebagai pengguna, kemudian pentadbir menetapkan peranan mereka di sini." />
      <ClassesCard classes={classes} users={users} reload={load} />
      <UsersCard users={users} reload={load} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Classes: tabs by level, pagination, add / rename / delete / copy to other years
// ---------------------------------------------------------------------------
function ClassesCard({ classes, users, reload }: { classes: ClassRow[]; users: P[]; reload: () => Promise<void> }) {
  const { refresh } = useAuth()
  const [tab, setTab] = useState<number | null>(1)
  const [page, setPage] = useState(1)
  const [newName, setNewName] = useState('')
  const [edit, setEdit] = useState<{ id: number; name: string; level: string } | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const { busy, run } = useAction()

  const teachers = useMemo(() => users.filter((u) => u.role !== 'parent'), [users])
  const hasOther = classes.some((c) => c.year_level == null)
  const tabs = hasOther ? [...LEVELS, { value: null, label: 'Lain-lain' }] : LEVELS
  const inTab = classes.filter((c) => (c.year_level ?? null) === tab)
  const pages = Math.max(1, Math.ceil(inTab.length / CLASS_PAGE))
  const shown = inTab.slice((page - 1) * CLASS_PAGE, page * CLASS_PAGE)
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])

  const after = async () => { await reload(); await refresh() }

  const setTeacher = (c: ClassRow, id: string) => run(async () => {
    check(await supabase.from('classes').update({ class_teacher_id: id || null }).eq('id', c.id)); await after()
  }, 'Guru kelas dikemas kini.')

  const toggle = (c: ClassRow) => run(async () => {
    check(await supabase.from('classes').update({ active: !c.active }).eq('id', c.id)); await after()
  }, c.active ? 'Kelas tidak aktif lagi (disembunyikan daripada ibu bapa).' : 'Kelas diaktifkan semula.')

  const add = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const res = await supabase.from('classes').insert({ name: newName.trim(), year_level: tab })
    if (res.error?.code === '23505') throw new Error('Nama kelas ini sudah wujud.')
    check(res); setNewName(''); await after()
  }, 'Kelas ditambah.') }

  const saveEdit = () => run(async () => {
    if (!edit || !edit.name.trim()) throw new Error('Nama kelas tidak boleh kosong.')
    const res = await supabase.from('classes')
      .update({ name: edit.name.trim(), year_level: edit.level === '' ? null : Number(edit.level) }).eq('id', edit.id)
    if (res.error?.code === '23505') throw new Error('Nama kelas ini sudah wujud.')
    check(res); setEdit(null); await after()
  }, 'Kelas dikemas kini.')

  const remove = (c: ClassRow) => run(async () => {
    const { count } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('class_id', c.id).eq('status', 'aktif')
    if (count) throw new Error(`${c.name} masih ada ${count} murid aktif. Pindahkan murid ke kelas lain dahulu (Rekod Murid), atau tandakan kelas sebagai tidak aktif.`)
    if (!window.confirm(`Padam kelas ${c.name}? Memo untuk kelas ini dan permohonan ibu bapa yang belum disahkan untuk kelas ini juga akan dipadam.`)) return
    check(await supabase.from('classes').delete().eq('id', c.id)); await after()
  }, 'Kelas dipadam.')

  const placeholder = tab === 0 ? 'cth: PRA Amanah' : tab === 7 ? 'cth: PPKI Mawar' : tab ? `cth: ${tab} Ibnu Sina` : 'Nama kelas'
  const canCopy = tab != null && tab >= 1 && tab <= 6 && inTab.length > 0

  return (
    <Card title="Kelas & guru kelas" actions={canCopy && (
      <button className="btn" onClick={() => setCopyOpen(true)}>Salin kelas {levelLabel(tab)} ke tahun lain</button>
    )}>
      <div className="tabs-row">
        <div className="seg">
          {tabs.map((t) => {
            const n = classes.filter((c) => (c.year_level ?? null) === t.value).length
            return (
              <button key={String(t.value)} className={tab === t.value ? 'on' : ''} onClick={() => { setTab(t.value); setPage(1); setEdit(null) }}>
                {t.label}<span>{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {shown.length ? (
        <table className="table">
          <thead><tr><th>Kelas</th><th>Guru kelas</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((c) => edit?.id === c.id ? (
              <tr key={c.id}>
                <td colSpan={2}>
                  <div className="row gap wrap">
                    <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null) }} style={{ flex: 2 }} />
                    <select value={edit.level} onChange={(e) => setEdit({ ...edit, level: e.target.value })} style={{ flex: 1 }}>
                      {LEVELS.map((l) => <option key={String(l.value)} value={String(l.value)}>{l.label}</option>)}
                      <option value="">Lain-lain</option>
                    </select>
                  </div>
                </td>
                <td />
                <td className="row-actions">
                  <button className="btn primary small" disabled={busy} onClick={saveEdit}>Simpan</button>
                  <button className="btn ghost small" onClick={() => setEdit(null)}>Batal</button>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>
                  <select value={c.class_teacher_id ?? ''} onChange={(e) => setTeacher(c, e.target.value)} disabled={busy}>
                    <option value="">(belum ditetapkan)</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name} · {roleLabel[t.role]}</option>)}
                  </select>
                </td>
                <td><button className="btn ghost small" onClick={() => toggle(c)} title="Klik untuk tukar">{c.active ? 'Aktif' : 'Tidak aktif'}</button></td>
                <td className="row-actions">
                  <button className="btn ghost small" onClick={() => setEdit({ id: c.id, name: c.name, level: c.year_level == null ? '' : String(c.year_level) })}>Ubah</button>
                  <button className="btn ghost small danger-text" disabled={busy} onClick={() => remove(c)}>Padam</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty>Tiada kelas {levelLabel(tab)} lagi.</Empty>}
      <Pager page={page} pages={pages} onChange={setPage} />

      <form className="row gap" onSubmit={add} style={{ marginTop: '1rem' }}>
        <input placeholder={`Kelas ${levelLabel(tab)} baru, ${placeholder}`} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn" disabled={busy || !newName.trim()}>+ Tambah kelas</button>
      </form>
      <p className="muted small">Pengguna mesti berperanan Guru Kelas, Ketua Panitia, AJK PIBG atau Pentadbir untuk dipilih sebagai guru kelas.</p>

      {copyOpen && tab != null && (
        <CopyModal source={tab} classes={classes} onClose={() => setCopyOpen(false)} onDone={async () => { setCopyOpen(false); await after() }} />
      )}
    </Card>
  )
}

function CopyModal({ source, classes, onClose, onDone }:
  { source: number; classes: ClassRow[]; onClose: () => void; onDone: () => void }) {
  const [targets, setTargets] = useState<number[]>([1, 2, 3, 4, 5, 6].filter((y) => y !== source))
  const { busy, run } = useAction()

  // "1 IBNU SINA" -> "IBNU SINA"
  const suffixes = classes.filter((c) => c.year_level === source).map((c) => c.name.replace(/^\d+\s*/, '')).filter(Boolean)
  const existing = new Set(classes.map((c) => c.name.toUpperCase()))
  const toCreate = targets.flatMap((y) => suffixes.map((s) => ({ name: `${y} ${s}`.toUpperCase(), year_level: y })))
    .filter((c) => !existing.has(c.name))
  const skipped = targets.length * suffixes.length - toCreate.length

  const submit = () => run(async () => {
    if (!toCreate.length) throw new Error('Tiada kelas baru untuk dicipta.')
    check(await supabase.from('classes').insert(toCreate))
    onDone()
  }, `${toCreate.length} kelas dicipta.`)

  return (
    <Modal title={`Salin nama kelas ${levelLabel(source)}`} onClose={onClose}>
      <p className="small">Nama kelas yang sama ({suffixes.join(', ')}) akan dicipta untuk tahun yang dipilih.</p>
      <div className="check-row">
        {[1, 2, 3, 4, 5, 6].filter((y) => y !== source).map((y) => (
          <label key={y}>
            <input type="checkbox" checked={targets.includes(y)}
              onChange={(e) => setTargets(e.target.checked ? [...targets, y].sort() : targets.filter((t) => t !== y))} />
            Tahun {y}
          </label>
        ))}
      </div>
      <div className="copy-preview">
        {toCreate.length ? toCreate.map((c) => <div key={c.name}>+ {c.name}</div>) : <span className="muted">Semua kelas sudah wujud.</span>}
      </div>
      {skipped > 0 && <p className="muted small">{skipped} kelas sudah wujud dan akan dilangkau.</p>}
      <div className="row gap end">
        <button className="btn ghost" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={busy || !toCreate.length} onClick={submit}>Cipta {toCreate.length} kelas</button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Users: search, role filter, pagination
// ---------------------------------------------------------------------------
function UsersCard({ users, reload }: { users: P[]; reload: () => Promise<void> }) {
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState<'' | Role>('')
  const [page, setPage] = useState(1)
  const { busy, run } = useAction()

  const filtered = users.filter((u) => (!roleF || u.role === roleF) &&
    (!q || `${u.full_name} ${u.phone ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const pages = Math.max(1, Math.ceil(filtered.length / USER_PAGE))
  const shown = filtered.slice((page - 1) * USER_PAGE, page * USER_PAGE)
  useEffect(() => { setPage(1) }, [q, roleF])

  const setRole = (u: P, role: Role) => run(async () => {
    check(await supabase.from('profiles').update({ role }).eq('id', u.id)); await reload()
  }, `${u.full_name} kini ${roleLabel[role]}.`)
  const setPanitia = (u: P, panitia: string) => run(async () => {
    check(await supabase.from('profiles').update({ panitia: panitia || null }).eq('id', u.id)); await reload()
  })

  return (
    <Card title={`Pengguna (${users.length})`}>
      <div className="filters">
        <input placeholder="Cari nama atau telefon…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={roleF} onChange={(e) => setRoleF(e.target.value as Role | '')}>
          <option value="">Semua peranan</option>
          {(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
        </select>
      </div>
      {shown.length ? (
        <table className="table">
          <thead><tr><th>Nama</th><th>No. KP</th><th>Telefon</th><th>Daftar</th><th>Peranan</th><th>Panitia</th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name || '-'}</td>
                <td className="mono small">{maskIC(u.ic_no)}</td>
                <td>{u.phone || '-'}</td>
                <td className="small">{date(u.created_at)}</td>
                <td>
                  <select value={u.role} onChange={(e) => setRole(u, e.target.value as Role)} disabled={busy}>
                    {(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                  </select>
                </td>
                <td>
                  {u.role === 'panitia' && (
                    <input defaultValue={u.panitia ?? ''} placeholder="cth: Sains" onBlur={(e) => e.target.value !== (u.panitia ?? '') && setPanitia(u, e.target.value)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty>Tiada pengguna.</Empty>}
      <Pager page={page} pages={pages} onChange={setPage} />
    </Card>
  )
}
