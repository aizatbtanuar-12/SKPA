import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth, useRole } from '../lib/auth'
import { roleLabel } from '../lib/util'

interface NavItem { to: string; label: string; icon: string; show: boolean }

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, settings, signOut } = useAuth()
  const r = useRole()
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Utama',
      items: [
        { to: '/', label: 'Laman Utama', icon: '⌂', show: true },
        { to: '/memo', label: 'Memo & Pengumuman', icon: '✉', show: true },
        { to: '/dana', label: 'Dana & Program', icon: '◎', show: true },
        { to: '/sumbangan', label: 'Sumbangan', icon: '♥', show: true },
        { to: '/agm', label: 'Mesyuarat Agung', icon: '☑', show: true },
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

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand">
          <img className="logo" src="/logo.png" alt="Logo PIBG SK Puncak Alam" />
          <div>
            <strong>Portal PIBG</strong>
            <span>{settings?.school_name ?? 'SK Puncak Alam'}</span>
          </div>
        </div>
        <nav onClick={() => setOpen(false)}>
          {groups.map((g) => {
            const items = g.items.filter((i) => i.show)
            if (!items.length) return null
            return (
              <div key={g.title} className="nav-group">
                <span className="nav-title">{g.title}</span>
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} className="nav-link">
                    <span className="nav-icon" aria-hidden>{i.icon}</span>{i.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="side-foot">
          <NavLink to="/profil" className="who" onClick={() => setOpen(false)}>
            <strong>{profile?.full_name || 'Pengguna'}</strong>
            <span>{roleLabel[r.role]}</span>
          </NavLink>
          <button className="btn ghost small" onClick={signOut}>Log keluar</button>
        </div>
      </aside>
      {open && <div className="side-back" onClick={() => setOpen(false)} />}
      <main className="main" key={loc.pathname}>
        <div className="topbar">
          <button className="btn ghost menu-btn" onClick={() => setOpen(true)} aria-label="Menu">☰</button>
          <span className="topbar-title">Portal PIBG {settings?.school_name ?? ''}</span>
        </div>
        {children}
      </main>
    </div>
  )
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="row gap wrap">{actions}</div>}
    </div>
  )
}
