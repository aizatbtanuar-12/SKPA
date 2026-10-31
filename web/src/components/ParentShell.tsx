import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { initials, useIsMobile } from './pui'

/** Count of memos the signed-in user has not opened yet */
export function useUnreadMemos() {
  const { profile } = useAuth()
  const loc = useLocation()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('memos').select('id').limit(500),
      supabase.from('memo_reads').select('memo_id').eq('user_id', profile.id),
    ]).then(([m, r]) => {
      const read = new Set(((r.data ?? []) as { memo_id: number }[]).map((x) => x.memo_id))
      setN(((m.data ?? []) as { id: number }[]).filter((x) => !read.has(x.id)).length)
    })
  }, [profile, loc.pathname])
  return n
}

const TABS = [
  { to: '/', label: 'Utama', icon: '⌂', match: ['/', '/anak', '/sumbangan', '/profil', '/resit', '/resit-sumbangan'] },
  { to: '/yuran', label: 'Yuran', icon: '◆', match: ['/yuran'] },
  { to: '/memo', label: 'Memo', icon: '✉', match: ['/memo'] },
  { to: '/dana', label: 'Dana', icon: '◎', match: ['/dana'] },
  { to: '/agm', label: 'AGM', icon: '☑', match: ['/agm'] },
]

export default function ParentShell({ children }: { children: ReactNode }) {
  const mobile = useIsMobile()
  const loc = useLocation()
  const { profile, settings, signOut } = useAuth()
  const unread = useUnreadMemos()

  useEffect(() => {
    document.body.classList.add('parent-ui')
    return () => document.body.classList.remove('parent-ui')
  }, [])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [loc.pathname])

  if (mobile) {
    const active = (t: typeof TABS[number]) =>
      t.match.some((m) => (m === '/' ? loc.pathname === '/' : loc.pathname === m || loc.pathname.startsWith(m + '/')))
    return (
      <div className="pshell mob">
        {loc.pathname === '/' ? children : <div className="pmob-page up" key={loc.pathname}>{children}</div>}
        <nav className="ptabbar" aria-label="Menu utama">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} className={`ptab ${active(t) ? 'active' : ''}`} aria-current={active(t) ? 'page' : undefined}>
              <span className="pill" aria-hidden="true">{t.icon}</span>{t.label}
            </Link>
          ))}
        </nav>
      </div>
    )
  }

  const item = (to: string, icon: string, label: string, count?: number) => (
    <NavLink to={to} end={to === '/'} className="pside-link">
      <span className="ico" aria-hidden="true">{icon}</span>{label}
      {count ? <span className="count" aria-label={`${count} belum dibaca`}>{count}</span> : null}
    </NavLink>
  )

  return (
    <div className="pshell desk">
      <aside className="pside">
        <div className="pside-brand">
          <img src="/logo.png" alt="Logo PIBG SK Puncak Alam" />
          <div><strong>Portal PIBG</strong><span>{settings?.school_name ?? 'SK Puncak Alam'}</span></div>
        </div>
        <nav aria-label="Menu utama">
          <span className="pside-title">Utama</span>
          {item('/', '⌂', 'Laman Utama')}
          {item('/memo', '✉', 'Memo & Pengumuman', unread)}
          {item('/dana', '◎', 'Dana & Program')}
          {item('/agm', '☑', 'Mesyuarat Agung')}
          {item('/sumbangan', '♥', 'Sumbangan')}
          <span className="pside-title">Keluarga Saya</span>
          {item('/anak', '☺', 'Anak Saya')}
          {item('/yuran', '◆', 'Yuran PIBG')}
        </nav>
        <div className="pside-foot">
          <Link to="/profil">
            <span className="avatar" aria-hidden="true">{initials(profile?.full_name)}</span>
            <div style={{ minWidth: 0 }}><strong>{profile?.full_name || 'Pengguna'}</strong><span>Ibu Bapa / Penjaga</span></div>
          </Link>
          <button onClick={signOut}>Keluar</button>
        </div>
      </aside>
      <main className="pmain"><div className="pcontent up" key={loc.pathname}>{children}</div></main>
    </div>
  )
}
