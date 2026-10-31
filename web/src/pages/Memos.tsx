import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, check } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import { PageHead } from '../components/Layout'
import { Badge, Card, Empty, Field, Modal, useAction, useToast } from '../components/ui'
import { dateTime } from '../lib/util'

interface Memo {
  id: number; title: string; body: string; audience: 'semua' | 'kelas' | 'guru'; class_id: number | null
  author_id: string | null; pinned: boolean; published_at: string
  author: { full_name: string } | null
  memo_reads: { count: number }[]
}

export default function Memos() {
  const { profile, classes } = useAuth()
  const r = useRole()
  const toast = useToast()
  const loc = useLocation()
  const [rows, setRows] = useState<Memo[]>([])
  const [readIds, setReadIds] = useState<Set<number>>(new Set())
  const [openId, setOpenId] = useState<number | null>(Number(loc.hash.slice(1)) || null)
  const [compose, setCompose] = useState(false)
  const { run } = useAction()

  const load = useCallback(async () => {
    const [m, rd] = await Promise.all([
      supabase.from('memos').select('*, author:profiles!memos_author_id_fkey(full_name), memo_reads(count)')
        .order('pinned', { ascending: false }).order('published_at', { ascending: false }).limit(100),
      supabase.from('memo_reads').select('memo_id').eq('user_id', profile!.id),
    ])
    setRows((m.data as unknown as Memo[]) ?? [])
    setReadIds(new Set(((rd.data ?? []) as { memo_id: number }[]).map((x) => x.memo_id)))
  }, [profile])
  useEffect(() => { load() }, [load])

  const open = async (m: Memo) => {
    setOpenId(openId === m.id ? null : m.id)
    if (!readIds.has(m.id)) {
      await supabase.from('memo_reads').upsert({ memo_id: m.id, user_id: profile!.id })
      setReadIds(new Set([...readIds, m.id]))
    }
  }

  const copy = async (m: Memo) => {
    try {
      await navigator.clipboard.writeText(`*${m.title}*\n\n${m.body}\n\n— PIBG SK Puncak Alam`)
      toast('Disalin. Tampal ke WhatsApp.')
    } catch { toast('Tidak dapat menyalin.', 'err') }
  }

  const canManage = (m: Memo) => r.isStaff || m.author_id === profile?.id
  const audienceLabel = (m: Memo) =>
    m.audience === 'semua' ? 'Semua' : m.audience === 'guru' ? 'Guru sahaja' : `Kelas ${classes.find((c) => c.id === m.class_id)?.name ?? ''}`

  return (
    <>
      <PageHead title="Memo & Pengumuman" actions={r.canPostMemo && <button className="btn primary" onClick={() => setCompose(true)}>+ Memo baru</button>} />
      {rows.length ? rows.map((m) => (
        <Card key={m.id} className={`memo ${readIds.has(m.id) ? '' : 'unread'}`}>
          <button className="memo-head" onClick={() => open(m)}>
            <div>
              <strong>{m.pinned && '📌 '}{m.title}</strong>
              <div className="muted small">{dateTime(m.published_at)} · {m.author?.full_name ?? 'PIBG'}</div>
            </div>
            <div className="row gap">
              {!readIds.has(m.id) && <Badge tone="blue">Baru</Badge>}
              <Badge>{audienceLabel(m)}</Badge>
            </div>
          </button>
          {openId === m.id && (
            <div className="memo-body">
              <p className="pre">{m.body}</p>
              <div className="row gap wrap">
                <button className="btn ghost small" onClick={() => copy(m)}>Salin untuk WhatsApp</button>
                {canManage(m) && (
                  <>
                    <span className="muted small">Dibaca oleh {m.memo_reads?.[0]?.count ?? 0} pengguna</span>
                    {r.isStaff && <button className="btn ghost small" onClick={() => run(async () => {
                      check(await supabase.from('memos').update({ pinned: !m.pinned }).eq('id', m.id)); load()
                    })}>{m.pinned ? 'Nyahsemat' : 'Semat'}</button>}
                    <button className="btn ghost small danger-text" onClick={() => run(async () => {
                      check(await supabase.from('memos').delete().eq('id', m.id)); load()
                    }, 'Memo dipadam.')}>Padam</button>
                  </>
                )}
              </div>
            </div>
          )}
        </Card>
      )) : <Empty>Belum ada memo.</Empty>}
      {compose && <Compose onClose={() => setCompose(false)} onDone={() => { setCompose(false); load() }} />}
    </>
  )
}

function Compose({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { profile, classes } = useAuth()
  const r = useRole()
  const onlyClass = r.isTeacher
  const classChoices = onlyClass ? r.myClasses : classes
  const [f, setF] = useState({ title: '', body: '', audience: onlyClass ? 'kelas' : 'semua', class_id: classChoices[0]?.id ? String(classChoices[0].id) : '' })
  const { busy, run } = useAction()

  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    check(await supabase.from('memos').insert({
      title: f.title.trim(), body: f.body.trim(), audience: f.audience,
      class_id: f.audience === 'kelas' ? Number(f.class_id) : null, author_id: profile!.id,
    }))
    onDone()
  }, 'Memo diterbitkan.') }

  return (
    <Modal title="Memo baru" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <Field label="Tajuk"><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Kandungan"><textarea required rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="row gap">
          <Field label="Kepada">
            <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} disabled={onlyClass}>
              <option value="semua">Semua ibu bapa & guru</option>
              <option value="kelas">Satu kelas</option>
              <option value="guru">Guru sahaja</option>
            </select>
          </Field>
          {f.audience === 'kelas' && (
            <Field label="Kelas">
              <select required value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}>
                {classChoices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <button className="btn primary" disabled={busy}>Terbitkan</button>
      </form>
    </Modal>
  )
}
