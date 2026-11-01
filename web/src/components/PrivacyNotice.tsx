import { useAuth } from '../lib/auth'
import { useLang } from '../lib/i18n'

/**
 * Notis Privasi (PDPA 2010). Written in both languages here rather than through the
 * dictionary, so the legal wording is exact. The PIBG should review it before launch.
 */
export default function PrivacyNotice() {
  const lang = useLang()
  const { settings } = useAuth()
  const school = settings?.school_name ?? 'SK Puncak Alam'
  const contact = settings?.contact_phone ? ` (${settings.contact_phone})` : ''
  const ms = lang === 'ms'
  return (
    <div className="privacy no-i18n">
      {ms ? <>
        <p>Notis ini menerangkan cara Persatuan Ibu Bapa dan Guru (PIBG) {school} memproses data peribadi anda di Portal PIBG, selaras dengan Akta Perlindungan Data Peribadi 2010 (PDPA).</p>
        <h3>1. Data yang dikumpul</h3>
        <p>Nama, No. Kad Pengenalan, no. telefon dan e-mel ibu bapa / penjaga; nama pasangan; nama, No. MyKid dan kelas anak; bukti bayaran (gambar resit) dan maklumat bayaran; kehadiran dan undian Mesyuarat Agung (undian adalah rahsia).</p>
        <h3>2. Tujuan</h3>
        <p>Mengurus keahlian PIBG dan kumpulan keluarga (yuran dikenakan sekali bagi setiap keluarga), mengeluarkan resit, mengurus kutipan dana, menghantar memo, mengendalikan Mesyuarat Agung dan menyediakan laporan kewangan kepada ahli.</p>
        <h3>3. Siapa boleh melihat data anda</h3>
        <p>Hanya mereka yang memerlukannya untuk tugas mereka: guru kelas anak anda, dan AJK PIBG yang diberi akses oleh pentadbir (contohnya bendahari untuk menyemak bayaran). No. Kad Pengenalan penuh tidak dipaparkan; hanya 4 digit akhir. Data anda tidak dijual atau dikongsi dengan pihak luar, kecuali penyedia perkhidmatan pengehosan aplikasi ini (Supabase dan Vercel) yang memprosesnya bagi pihak PIBG. Pelayan mereka mungkin berada di luar Malaysia (contohnya Singapura), di negara yang mempunyai perlindungan data yang setara.</p>
        <h3>4. Keselamatan</h3>
        <p>Data dihantar melalui sambungan yang disulitkan (HTTPS). Akses dikawal mengikut peranan, bukti bayaran disimpan secara peribadi, dan tindakan sensitif (seperti melihat atau menukar No. KP) direkodkan dalam log audit.</p>
        <h3>5. Tempoh simpanan</h3>
        <p>Data disimpan selagi anak anda bersekolah di {school}. Rekod kewangan (bayaran dan resit) disimpan mengikut keperluan audit PIBG. Selepas itu data dipadam atau dijadikan tanpa nama.</p>
        <h3>6. Hak anda</h3>
        <p>Anda boleh melihat dan memuat turun data anda (Profil → Muat turun data saya), membetulkan maklumat anda (Profil, atau melalui pentadbir untuk No. KP yang telah disahkan), dan menarik balik persetujuan atau meminta data dipadam dengan menghubungi PIBG{contact}. Menarik balik persetujuan mungkin bermakna anda tidak lagi dapat menggunakan portal ini.</p>
      </> : <>
        <p>This notice explains how the Parent-Teacher Association (PTA) of {school} processes your personal data in the PTA Portal, in line with the Personal Data Protection Act 2010 (PDPA).</p>
        <h3>1. Data we collect</h3>
        <p>Parents’ / guardians’ names, IC numbers, phone numbers and e-mail; your spouse’s name; your children’s names, MyKid numbers and classes; proofs of payment (receipt images) and payment details; General Meeting attendance and votes (votes are secret).</p>
        <h3>2. Purpose</h3>
        <p>To manage PTA membership and family grouping (the fee is charged once per family), issue receipts, run fund-raising drives, send memos, hold the General Meeting and give members financial reports.</p>
        <h3>3. Who can see your data</h3>
        <p>Only people who need it for their task: your children’s class teachers, and PTA committee members given access by the administrator (for example the treasurer, to check payments). Full IC numbers are not shown — only the last 4 digits. Your data is not sold or shared with outside parties, except the hosting providers that run this app on the PTA’s behalf (Supabase and Vercel). Their servers may be outside Malaysia (for example Singapore), in a country with comparable data protection.</p>
        <h3>4. Security</h3>
        <p>Data travels over an encrypted connection (HTTPS). Access is limited by role, proofs of payment are stored privately, and sensitive actions (such as viewing or changing an IC number) are recorded in an audit log.</p>
        <h3>5. How long we keep it</h3>
        <p>Data is kept while your child is at {school}. Financial records (payments and receipts) are kept as required for PTA audits. After that, data is deleted or anonymised.</p>
        <h3>6. Your rights</h3>
        <p>You can view and download your data (Profile → Download my data), correct your details (Profile, or through the administrator for a verified IC number), and withdraw consent or ask for your data to be deleted by contacting the PTA{contact}. Withdrawing consent may mean you can no longer use this portal.</p>
      </>}
    </div>
  )
}
