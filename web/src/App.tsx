import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth, useRole } from './lib/auth'
import { configured } from './lib/supabase'
import { Spinner, ToastProvider } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Memos from './pages/Memos'
import Funds from './pages/Funds'
import Agm from './pages/Agm'
import Profile from './pages/Profile'
import Receipt from './pages/Receipt'
import MyChildren from './pages/parent/MyChildren'
import ParentFees from './pages/parent/ParentFees'
import Verify from './pages/teacher/Verify'
import MyClass from './pages/teacher/MyClass'
import Records from './pages/staff/Records'
import Collection from './pages/staff/Collection'
import PaymentReview from './pages/staff/PaymentReview'
import Import from './pages/staff/Import'
import Users from './pages/admin/Users'
import Settings from './pages/admin/Settings'
import Donations from './pages/Donations'
import DonationCampaign from './pages/DonationCampaign'
import DonationReceipt from './pages/DonationReceipt'
import Campaigns from './pages/staff/Campaigns'
import CampaignManage from './pages/staff/CampaignManage'
import ParentHome from './pages/parent/Home'
import ParentMemos from './pages/parent/ParentMemos'
import ParentFunds from './pages/parent/ParentFunds'
import ParentAgm from './pages/parent/ParentAgm'

function Guard({ ok, children }: { ok: boolean; children: ReactNode }) {
  return ok ? <>{children}</> : <Navigate to="/" replace />
}

function Routed() {
  const { session, loading, profile, error, refresh, signOut } = useAuth()
  const r = useRole()
  if (loading) return <div className="center"><Spinner /></div>
  if (!session) return <Login />
  if (!profile) {
    return (
      <div className="center">
        <div className="card narrow">
          <h2>Tidak dapat memuatkan akaun anda</h2>
          <p>Sistem tidak dapat membaca profil anda daripada pangkalan data. Ini biasanya berlaku jika
            fail SQL dalam <code>supabase/migrations</code> belum dijalankan sepenuhnya.</p>
          {error && <div className="alert err small">{error}</div>}
          <div className="row gap">
            <button className="btn primary" onClick={refresh}>Cuba lagi</button>
            <button className="btn ghost" onClick={signOut}>Log keluar</button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={r.isParent ? <ParentHome /> : <Dashboard />} />
        <Route path="/memo" element={r.isParent ? <ParentMemos /> : <Memos />} />
        <Route path="/dana" element={r.isParent ? <ParentFunds /> : <Funds />} />
        <Route path="/agm" element={r.isParent ? <ParentAgm /> : <Agm />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/resit/:id" element={<Receipt />} />
        <Route path="/sumbangan" element={<Donations />} />
        <Route path="/sumbangan/:id" element={<DonationCampaign />} />
        <Route path="/resit-sumbangan/:id" element={<DonationReceipt />} />
        <Route path="/kempen" element={<Guard ok={r.isStaff}><Campaigns /></Guard>} />
        <Route path="/kempen/:id" element={<Guard ok={r.isStaff}><CampaignManage /></Guard>} />
        <Route path="/anak" element={<Guard ok={r.hasFamily}><MyChildren /></Guard>} />
        <Route path="/yuran" element={<Guard ok={r.hasFamily}><ParentFees /></Guard>} />
        <Route path="/pengesahan" element={<Guard ok={r.canVerify}><Verify /></Guard>} />
        <Route path="/kelas" element={<Guard ok={r.isTeacher}><MyClass /></Guard>} />
        <Route path="/rekod" element={<Guard ok={r.isStaff}><Records /></Guard>} />
        <Route path="/kutipan" element={<Guard ok={r.isStaff}><Collection /></Guard>} />
        <Route path="/semakan-bayaran" element={<Guard ok={r.isStaff}><PaymentReview /></Guard>} />
        <Route path="/import" element={<Guard ok={r.isStaff}><Import /></Guard>} />
        <Route path="/pengguna" element={<Guard ok={r.isAdmin}><Users /></Guard>} />
        <Route path="/tetapan" element={<Guard ok={r.isStaff}><Settings /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  if (!configured) {
    return (
      <div className="center">
        <div className="card narrow">
          <h2>Belum dikonfigurasi</h2>
          <p>Tetapkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> dalam fail <code>.env</code>
            (atau dalam tetapan hosting), kemudian bina semula. Lihat README.</p>
        </div>
      </div>
    )
  }
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Routed />
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
