import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useToast } from '../../components/ui'
import { PageHead, PPager, dayMonth, tintBg, tintInk, useIsMobile, usePaged } from '../../components/pui'
import { date } from '../../lib/util'

interface Memo {
  id: number; title: string; body: string; audience: 'semua' | 'kelas' | 'guru'; class_id: number | null
  pinned: boolean; published_at: string; author: { full_name: string } | null
}
type Filter = 'semua' | 'baru' | 'pin'

export default function ParentMemos() {
  const { profile, classes } = useAuth()
  const mobile = useIsMobile()
  const toast = useToast()
  const loc = useLocation()
  const [memos, setMemos] = useState<Memo[]>([])
  const [read, setRead] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<Filter>('semua')
  const [openId, setOpenId] = useState<number | null>(null)
  const [deep, setDeep] = useState<number | null>(Number(loc.hash.slice(1)) || null)

  const load = useCallback(async () => {
    const [m, r] = await Promise.all([
      supabase.from('memos').select('id,title,body,audience,class_id,pinned,published_at,author:profiles!memos_author_id_fkey(full_name)')
        .order('pinned', { ascending: false }).order('published_at', { ascending: false }).limit(200),
      supabase.from('memo_reads').select('memo_id').eq('user_id', profile!.id),
    ])
    setMemos((m.data as unknown as Memo[]) ?? [])
    setRead(new Set(((r.data ?? []) as { memo_id: number }[]).map((x) => x.memo_id)))
  }, [profile])
  useEffect(() => { load() }, [load])

  const list = useMemo(() => memos.filter((m) => filter === 'semua' || (filter === 'baru' ? !read.has(m.id) : m.pinned)), [memos, read, filter])
  const paged = usePaged(list, 4, filter)
  const counts = { semua: memos.length, baru: memos.filter((m) => !read.has(m.id)).length, pin: memos.filter((m) => m.pinned).length }

  const markRead = async (id: number) => {
    if (read.has(id)) return
    setRead((r) => new Set([...r, id]))
    await supabase.from('memo_reads').upsert({ memo_id: id, user_id: profile!.id })
  }
  const open = (m: Memo) => { setOpenId(m.id); markRead(m.id) }

  // deep link /memo#id: jump to its page and open it
  useEffect(() => {
    if (!deep || !memos.length) return
    const i = list.findIndex((m) => m.id === deep)
    if (i >= 0) { paged.setPage(Math.floor(i / 4)); open(list[i]) }
    setDeep(null)
  }, [deep, memos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // desktop: the reading pane defaults to the first memo on the page
  const selected = memos.find((m) => m.id === openId) ?? (!mobile ? paged.slice[0] : undefined)
  useEffect(() => {
    if (!mobile && selected && !read.has(selected.id)) markRead(selected.id)
  }, [mobile, selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const audience = (m: Memo) => m.audience === 'kelas' ? `Kelas ${classes.find((c) => c.id === m.class_id)?.name ?? ''}` : 'Semua'
  const tint = (m: Memo) => m.id % 4

  const copyWA = async (m: Memo) => {
    try { await navigator.clipboard.writeText(`*${m.title}*\n\n${m.body}\n\n— PIBG SK Puncak Alam`); toast('Disalin. Tampal ke WhatsApp.') }
    catch { toast('Tidak dapat menyalin.', 'err') }
  }

  const reader = (m: Memo, onClose?: () => void) => (
    <div className="memo-read">
      <div className="memo-meta">
        <span style={{ background: tintBg(tint(m)), color: tintInk(tint(m)) }}>{audience(m)}</span>
        <span>{date(m.published_at)}</span>
        {m.pinned && <span>Disemat</span>}
      </div>
      <h2>{m.title}</h2>
      <div className="from">Daripada {m.author?.full_name ?? 'PIBG'}</div>
      <div className="body">{m.body}</div>
      <div className="pstack" style={{ gap: 8 }}>
        <button className={`pbtn wa ${mobile ? '' : 'small'}`} style={mobile ? undefined : { width: 'auto', alignSelf: 'flex-start' }} onClick={() => copyWA(m)}>Salin untuk WhatsApp</button>
        {onClose && <button className="pbtn sec" onClick={onClose}>Tutup</button>}
      </div>
    </div>
  )

  const listCol = (
    <div>
      <div className="chips-row">
        {([['semua', 'Semua'], ['baru', 'Belum dibaca'], ['pin', 'Disemat']] as [Filter, string][]).map(([k, label]) => (
          <button key={k} className={`fchip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}<span className="n">{counts[k]}</span></button>
        ))}
      </div>
      {paged.slice.length ? (
        <div className="pstack" style={{ gap: 10 }}>
          {paged.slice.map((m) => {
            const dm = dayMonth(m.published_at)
            return (
              <button key={m.id} className={`memo-row up ${!mobile && selected?.id === m.id ? 'sel' : ''}`} onClick={() => open(m)}>
                <span className="datebox" style={{ background: tintBg(tint(m)), color: tintInk(tint(m)) }}><b>{dm.day}</b><span>{dm.month}</span></span>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{m.title}</div>
                  <div className="m">{m.author?.full_name ?? 'PIBG'} · {audience(m)}</div>
                </div>
                {!read.has(m.id) && <span className="unread-dot" aria-label="Belum dibaca" />}
              </button>
            )
          })}
        </div>
      ) : <div className="pcard pempty">{filter === 'baru' ? 'Semua memo telah dibaca. 🎉' : 'Tiada memo.'}</div>}
      <PPager page={paged.page} pages={paged.pages} onChange={paged.setPage} variant={mobile ? 'label' : 'text'} />
    </div>
  )

  if (mobile) {
    const m = memos.find((x) => x.id === openId)
    return (
      <>
        <PageHead title="Memo" sub="Pengumuman daripada PIBG & guru kelas" />
        {listCol}
        {m && (
          <div className="sheet-back" onMouseDown={(e) => e.target === e.currentTarget && setOpenId(null)}>
            <div className="sheet" role="dialog" aria-label={m.title}>
              <div className="grab" aria-hidden="true" />
              {reader(m, () => setOpenId(null))}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <PageHead title="Memo & Pengumuman" sub="Daripada PIBG dan guru kelas anak anda" />
      <div className="pgrid">
        {listCol}
        {selected ? (
          <div className="memo-pane up" key={selected.id}>
            <div className="strip" style={{ background: tintBg(tint(selected)) }} />
            <div className="inner">{reader(selected)}</div>
          </div>
        ) : <div />}
      </div>
    </>
  )
}
