import { Link } from 'react-router-dom'
import PrivacyNotice from '../components/PrivacyNotice'
import LangSwitch from '../components/LangSwitch'
import { PageHead } from '../components/Layout'
import { Card } from '../components/ui'

/** Notis privasi. Inside the app when signed in; on its own page (with a way back to sign-in) when not. */
export default function Privacy({ standalone = false }: { standalone?: boolean }) {
  if (!standalone) {
    return (
      <>
        <PageHead title="Notis Privasi" sub="Akta Perlindungan Data Peribadi 2010" />
        <Card><PrivacyNotice /></Card>
      </>
    )
  }
  return (
    <div className="privacy-page">
      <div className="privacy-top">
        <img className="logo" src="/logo.png" alt="Logo PIBG SK Puncak Alam" />
        <LangSwitch />
      </div>
      <h1>Notis Privasi</h1>
      <p className="muted">Akta Perlindungan Data Peribadi 2010</p>
      <div className="card"><PrivacyNotice /></div>
      <p><Link to="/" className="btn">← Kembali ke log masuk</Link></p>
    </div>
  )
}
