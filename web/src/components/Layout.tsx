import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth, useRole } from '../lib/auth'
import { roleLabel } from '../lib/util'
import { Live, initials, useIsMobile } from './pui'
import { useUnreadMemos } from './useUnreadMemos'

interface NavItem { to: string; label: string; icon: string; show: boolean; count?: number }
interface Tab { to: string; label: string; icon: string; match: string[] }

/**
 * One shell for every role (design handoff "Parent (PTA) Portal Redesign"):
 * navy sidebar on desktop, bottom tab bar on phones. What changes per role is
 * only the menu.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const { profile, settings, signOut } = useAuth()
  const r = useRole()
  const mobile = useIsMobile()
  const loc = useLocation()
  const unread = useUnreadMemos()
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    document.body.classList.add('parent-ui')
    return () => document.body.classList.remove('parent-ui')
  }, [])
  useEffect(() => { window.scrollTo({ top: 0 }); setMenu(false) }, [loc.pathname])

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Utama',
      items: [
        { to: '/', label: 'Laman Utama', icon: '⌂', show: true },
        { to: '/memo', label: 'Memo & Pengumuman', icon: '✉', show: true, count: unread },
        { to: '/dana', label: 'Dana & Program', icon: '◎', show: true },
        { to: '/agm', label: 'Mesyuarat Agung', icon: '☑', show: true },
        { to: '/sumbangan', label: 'Sumbangan', icon: '♥', show: true },
      ],
    },
    {
      title: 'Keluarga Saya',
      items: [
        { to: '/anak', label: 'Anak Saya', icon: '☺', show: r.isParent },
        { to: '/yuran', label: 'Yuran PIBG', icon: '◆', show: r.isParent },
      ],
    },
    {
      title: 'Guru',
      items: [
        { to: '/pengesahan', label: 'Pengesahan Murid', icon: '✓', show: r.canVerify },
        { to: '/kelas', label: 'Kelas Saya', icon: '▦', show: r.isTeacher && r.myClasses.length > 0 },
      ],
    },
    {
      title: 'PIBG',
      items: [
        { to: '/rekod', label: 'Rekod Murid & Keluarga', icon: '☰', show: r.isStaff },
        { to: '/kutipan', label: 'Kutipan Yuran', icon: '◆', show: r.isStaff },
        { to: '/semakan-bayaran', label: 'Semakan Bayaran', icon: '⎙', show: r.isStaff },
        { to: '/kempen', label: 'Kutipan Dana', icon: '♥', show: r.isStaff },
        { to: '/import', label: 'Import Data', icon: '⇪', show: r.isStaff },
      ],
    },
    {
      title: 'Pentadbir',
      items: [
        { to: '/pengguna', label: 'Pengguna & Kelas', icon: '⚙', show: r.isAdmin },
        { to: '/tetapan', label: 'Tetapan', icon: '⚒', show: r.isStaff },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show) }))
    .filter((g) => g.items.length)

  const item = (i: NavItem) => (
    <NavLink key={i.to} to={i.to} end={i.to === '/'} className="pside-link">
      <span className="ico" aria-hidden="true">{i.icon}</span>{i.label}
      {i.count ? <Live className="count">{i.count}</Live> : null}
    </NavLink>
  )

  if (mobile) {
    const tabs: Tab[] = r.isParent
      ? [
          { to: '/', label: 'Utama', icon: '⌂', match: ['/', '/anak', '/sumbangan', '/profil', '/resit', '/resit-sumbangan'] },
          { to: '/yuran', label: 'Yuran', icon: '◆', match: ['/yuran'] },
          { to: '/memo', label: 'Memo', icon: '✉', match: ['/memo'] },
          { to: '/dana', label: 'Dana', icon: '◎', match: ['/dana'] },
          { to: '/agm', label: 'AGM', icon: '☑', match: ['/agm'] },
        ]
      : [
          { to: '/', label: 'Utama', icon: '⌂', match: ['/'] },
          r.isStaff
            ? { to: '/semakan-bayaran', label: 'Semak', icon: '⎙', match: ['/semakan-bayaran'] }
            : { to: '/pengesahan', label: 'Sahkan', icon: '✓', match: ['/pengesahan'] },
          { to: '/memo', label: 'Memo', icon: '✉', match: ['/memo'] },
          { to: '/dana', label: 'Dana', icon: '◎', match: ['/dana'] },
        ]
    const inTabs = tabs.flatMap((t) => t.match)
    const isOn = (m: string) => (m === '/' ? loc.pathname === '/' : loc.pathname === m || loc.pathname.startsWith(m + '/'))
    const active = (t: Tab) => !menu && t.match.some(isOn)
    const menuActive = menu || (!r.isParent && !inTabs.some(isOn))
    return (
      <div className="pshell mob">
        {loc.pathname === '/' ? children : <div className="pmob-page up" key={loc.pathname}>{children}</div>}
        <nav className="ptabbar" aria-label="Menu utama">
          {tabs.map((t) => (
            <Link key={t.to} to={t.to} className={`ptab ${active(t) ? 'active' : ''}`} aria-current={active(t) ? 'page' : undefined}>
              <span className="pill" aria-hidden="true">{t.icon}{t.to === '/memo' && unread ? <i className="dot" /> : null}</span>{t.label}
            </Link>
          ))}
          {!r.isParent && (
            <button type="button" className={`ptab ${menuActive ? 'active' : ''}`} onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              <span className="pill" aria-hidden="true">☰</span>Menu
            </button>
          )}
        </nav>
        {menu && (
          <div className="sheet-back menu-back" onClick={() => setMenu(false)}>
            <div className="sheet menu-sheet" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
              <div className="grab" />
              <Link to="/profil" className="menu-who">
                <span className="avatar" aria-hidden="true">{initials(profile?.full_name)}</span>
                <div><strong>{profile?.full_name || 'Pengguna'}</strong><span>{roleLabel[r.role]}</span></div>
              </Link>
              {groups.map((g) => (
                <div key={g.title}>
                  <span className="pside-title">{g.title}</span>
                  <div className="menu-grid">
                    {g.items.map((i) => (
                      <NavLink key={i.to} to={i.to} end={i.to === '/'} className="menu-link">
                        <span className="ico" aria-hidden="true">{i.icon}</span><span>{i.label}</span>
                        {i.count ? <Live className="count">{i.count}</Live> : null}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
              <button className="pbtn sec" style={{ marginTop: 18 }} onClick={signOut}>Log keluar</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pshell desk">
      <aside className="pside">
        <div className="pside-brand">
          <img src="/logo.png" alt="Logo PIBG SK Puncak Alam" />
          <div><strong>Portal PIBG</strong><span>{settings?.school_name ?? 'SK Puncak Alam'}</span></div>
        </div>
        <nav aria-label="Menu utama">
          {groups.map((g) => (
            <div key={g.title}>
              <span className="pside-title">{g.title}</span>
              {g.items.map(item)}
            </div>
          ))}
        </nav>
        <div className="pside-foot">
          <Link to="/profil">
            <span className="avatar" aria-hidden="true">{initials(profile?.full_name)}</span>
            <div style={{ minWidth: 0 }}><strong>{profile?.full_name || 'Pengguna'}</strong><span>{r.isParent ? 'Ibu Bapa / Penjaga' : roleLabel[r.role]}</span></div>
          </Link>
          <button onClick={signOut}>Keluar</button>
        </div>
      </aside>
      <main className="pmain"><div className="pcontent up" key={loc.pathname}>{children}</div></main>
    </div>
  )
}

/** Page title block used by the shared and staff pages (same look as the parent screens) */
export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ph page-head-x">
      <div className="ph-row">
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="ph-actions">{actions}</div>}
      </div>
    </div>
  )
}
