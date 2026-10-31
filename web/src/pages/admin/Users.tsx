import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase, check, type Profile, type Role, type ClassRow } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Card, Empty, useAction } from '../../components/ui'
import { date, maskIC, roleLabel } from '../../lib/util'

type P = Profile & { created_at: string }

export default function Users() {
  const { refresh } = useAuth()
  const [users, setUsers] = useState<P[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState<'' | Role>('')
  const [newClass, setNewClass] = useState('')
  const { busy, run } = useAction()

  const load = useCallback(async () => {
    const [u, c] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('classes').select('*').order('year_level').order('name'),
    ])
    setUsers((u.data as P[]) ?? [])
    setClasses((c.data as ClassRow[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const teachers = useMemo(() => users.filter((u) => u.role !== 'parent'), [users])
  const shown = users.filter((u) => (!roleF || u.role === roleF) &&
    (!q || `${u.full_name} ${u.phone ?? ''}`.toLowerCase().includes(q.toLowerCase())))

  const setRole = (u: P, role: Role) => run(async () => {
    check(await supabase.from('profiles').update({ role }).eq('id', u.id)); load()
  }, `${u.full_name} kini ${roleLabel[role]}.`)
  const setPanitia = (u: P, panitia: string) => run(async () => {
    check(await supabase.from('profiles').update({ panitia: panitia || null }).eq('id', u.id)); load()
  })
  const setTeacher = (c: ClassRow, id: string) => run(async () => {
    check(await supabase.from('classes').update({ class_teacher_id: id || null }).eq('id', c.id)); load(); refresh()
  }, 'Guru kelas dikemas kini.')
  const toggleClass = (c: ClassRow) => run(async () => {
    check(await supabase.from('classes').update({ active: !c.active }).eq('id', c.id)); load(); refresh()
  })
  const addClass = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const name = newClass.trim().toUpperCase().replace(/\s+/g, ' ')
    const lvl = Number(name[0])
    check(await supabase.from('classes').insert({ name, year_level: lvl >= 1 && lvl <= 6 ? lvl : null }))
    setNewClass(''); load(); refresh()
  }, 'Kelas ditambah.') }

  return (
    <>
      <PageHead title="Pengguna & Kelas" sub="Guru dan AJK mendaftar sendiri sebagai pengguna, kemudian pentadbir menetapkan peranan mereka di sini." />

      <Card title="Kelas & guru kelas">
        <table className="table">
          <thead><tr><th>Kelas</th><th>Guru kelas</th><th>Status</th></tr></thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>
                  <select value={c.class_teacher_id ?? ''} onChange={(e) => setTeacher(c, e.target.value)} disabled={busy}>
                    <option value="">(belum ditetapkan)</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name} · {roleLabel[t.role]}</option>)}
                  </select>
                </td>
                <td><button className="btn ghost small" onClick={() => toggleClass(c)}>{c.active ? 'Aktif' : 'Tidak aktif'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form className="row gap" onSubmit={addClass}>
          <input placeholder="Nama kelas baru, cth: 1 Amanah" value={newClass} onChange={(e) => setNewClass(e.target.value)} />
          <button className="btn" disabled={busy || !newClass.trim()}>+ Tambah kelas</button>
        </form>
        <p className="muted small">Pengguna mesti berperanan Guru Kelas, Ketua Panitia, AJK PIBG atau Pentadbir untuk dipilih sebagai guru kelas.</p>
      </Card>

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
      </Card>
    </>
  )
}
