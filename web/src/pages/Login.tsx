import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { normIC, validIC, errMsg } from '../lib/util'
import { Field } from '../components/ui'
import LangSwitch from '../components/LangSwitch'

type Mode = 'login' | 'daftar' | 'lupa'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [f, setF] = useState({ email: '', password: '', full_name: '', ic_no: '', phone: '', consent: false,
    relation: 'bapa', spouse_name: '', spouse_ic: '', spouse_phone: '', no_spouse: false })
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mel atau kata laluan salah.' : error.message)
      } else if (mode === 'daftar') {
        if (!validIC(f.ic_no)) throw new Error('No. Kad Pengenalan mesti 12 digit.')
        if (!f.no_spouse) {
          if (!f.spouse_name.trim()) throw new Error('Sila isi nama pasangan, atau tandakan "Tiada pasangan untuk didaftarkan".')
          if (!validIC(f.spouse_ic)) throw new Error('No. Kad Pengenalan pasangan mesti 12 digit.')
          if (normIC(f.spouse_ic) === normIC(f.ic_no)) throw new Error('No. KP pasangan tidak boleh sama dengan No. KP anda.')
        }
        if (f.password.length < 8) throw new Error('Kata laluan sekurang-kurangnya 8 aksara.')
        if (!f.consent) throw new Error('Sila bersetuju dengan notis privasi untuk mendaftar.')
        const { data, error } = await supabase.auth.signUp({
          email: f.email.trim(),
          password: f.password,
          options: {
            data: {
              full_name: f.full_name.trim(), ic_no: normIC(f.ic_no), phone: f.phone.trim(), pdpa_consent: true,
              relation: f.relation, no_spouse: f.no_spouse,
              ...(f.no_spouse ? {} : { spouse_name: f.spouse_name.trim(), spouse_ic: normIC(f.spouse_ic), spouse_phone: f.spouse_phone.trim() }),
            },
            emailRedirectTo: window.location.origin,
          },
        })
        if (error) throw error
        if (!data.session) {
          setMsg({ tone: 'ok', text: 'Pendaftaran berjaya. Sila semak e-mel anda untuk mengesahkan akaun, kemudian log masuk.' })
          setMode('login')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: window.location.origin + '/#/profil' })
        if (error) throw error
        setMsg({ tone: 'ok', text: 'Pautan tetapan semula kata laluan telah dihantar ke e-mel anda.' })
      }
    } catch (err) {
      setMsg({ tone: 'err', text: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <img className="logo big" src="/logo.png" alt="Logo PIBG SK Puncak Alam" />
        <h1>Portal PIBG<br />SK Puncak Alam</h1>
        <p>Yuran keluarga, memo sekolah, laporan dana dan Mesyuarat Agung, semua di satu tempat.</p>
        <ul>
          <li>Yuran PIBG dikira sekali bagi setiap keluarga, bukan setiap anak</li>
          <li>Muat naik bukti bayaran dan dapatkan resit rasmi</li>
          <li>Lihat bagaimana dana PIBG digunakan</li>
        </ul>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-lang"><LangSwitch /></div>
        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log Masuk</button>
          <button type="button" className={mode === 'daftar' ? 'on' : ''} onClick={() => setMode('daftar')}>Daftar Akaun</button>
        </div>

        {mode === 'daftar' && (
          <>
            <Field label="Nama penuh (seperti dalam MyKad)">
              <input required value={f.full_name} onChange={set('full_name')} autoComplete="name" />
            </Field>
            <Field label="No. Kad Pengenalan" hint="Digunakan untuk memadankan anak-anak anda sebagai satu keluarga.">
              <input required value={f.ic_no} onChange={set('ic_no')} inputMode="numeric" placeholder="800101-10-1234" />
            </Field>
            <Field label="No. telefon">
              <input required value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="012-3456789" autoComplete="tel" />
            </Field>
            <Field label="Saya ialah">
              <select value={f.relation} onChange={set('relation')}>
                <option value="bapa">Bapa</option><option value="ibu">Ibu</option><option value="penjaga">Penjaga</option>
              </select>
            </Field>
            <fieldset className="spouse-box">
              <legend>{f.relation === 'bapa' ? 'Isteri (ibu kepada anak-anak)' : f.relation === 'ibu' ? 'Suami (bapa kepada anak-anak)' : 'Pasangan / penjaga kedua'}</legend>
              <p className="small muted">Kedua-dua ibu dan bapa akan dipautkan kepada anak-anak sebagai satu keluarga.</p>
              {!f.no_spouse && (
                <>
                  <Field label="Nama penuh pasangan"><input required value={f.spouse_name} onChange={set('spouse_name')} /></Field>
                  <Field label="No. Kad Pengenalan pasangan">
                    <input required value={f.spouse_ic} onChange={set('spouse_ic')} inputMode="numeric" placeholder="820202-10-2222" />
                  </Field>
                  <Field label="No. telefon pasangan (pilihan)"><input value={f.spouse_phone} onChange={set('spouse_phone')} inputMode="tel" /></Field>
                </>
              )}
              <label className="check" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={f.no_spouse} onChange={set('no_spouse')} />
                <span>Tiada pasangan untuk didaftarkan (ibu / bapa tunggal atau penjaga)</span>
              </label>
            </fieldset>
          </>
        )}
        <Field label="E-mel">
          <input required type="email" value={f.email} onChange={set('email')} autoComplete="email" />
        </Field>
        {mode !== 'lupa' && (
          <Field label="Kata laluan">
            <input required type="password" value={f.password} onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'daftar' ? 8 : undefined} />
          </Field>
        )}
        {mode === 'daftar' && (
          <label className="check">
            <input type="checkbox" checked={f.consent} onChange={set('consent')} />
            <span>
              Saya bersetuju PIBG SK Puncak Alam menyimpan dan memproses maklumat peribadi saya dan anak-anak saya
              bagi urusan PIBG sahaja, selaras dengan Akta Perlindungan Data Peribadi 2010.
            </span>
          </label>
        )}

        {msg && <div className={`alert ${msg.tone}`}>{msg.text}</div>}

        <button className="btn primary full" disabled={busy}>
          {busy ? 'Sila tunggu…' : mode === 'login' ? 'Log Masuk' : mode === 'daftar' ? 'Daftar' : 'Hantar pautan'}
        </button>
        {mode === 'login' && <button type="button" className="link" onClick={() => setMode('lupa')}>Lupa kata laluan?</button>}
        {mode === 'lupa' && <button type="button" className="link" onClick={() => setMode('login')}>Kembali ke log masuk</button>}
      </form>
    </div>
  )
}
