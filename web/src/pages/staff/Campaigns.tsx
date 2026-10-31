import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Empty, Field, Modal, useAction } from '../../components/ui'
import CampaignCard from '../../components/CampaignCard'
import { compressImage } from '../../lib/image'
import { loadProgress, posterUrl, type Campaign, type Progress } from '../../lib/donations'

export default function Campaigns() {
  const [list, setList] = useState<Campaign[]>([])
  const [prog, setProg] = useState<Record<number, Progress>>({})
  const [open, setOpen] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    supabase.from('campaigns').select('*').order('created_at', { ascending: false }).then(({ data }) => setList((data as Campaign[]) ?? []))
    loadProgress().then(setProg)
  }, [])

  return (
    <>
      <PageHead title="Kutipan Dana" sub="Kutipan sumbangan selain yuran PIBG, cth: Smart TV, penapis air. Semua ke akaun bank PIBG yang sama; setiap kutipan ada kod rujukan sendiri."
        actions={<button className="btn primary" onClick={() => setOpen(true)}>+ Kutipan baru</button>} />
      {list.length ? (
        <div className="campaign-grid">
          {list.map((c) => <CampaignCard key={c.id} c={c} p={prog[c.id]} to={`/kempen/${c.id}`} />)}
        </div>
      ) : <Empty>Belum ada kutipan dana. Klik "+ Kutipan baru" untuk mula.</Empty>}
      {open && <CampaignForm onClose={() => setOpen(false)} onSaved={(id) => nav(`/kempen/${id}`)} />}
    </>
  )
}

const suggestCode = (title: string) =>
  title.toUpperCase().replace(/^KUTIPAN\s+(DANA\s+)?(UNTUK\s+)?/, '').replace(/[^A-Z0-9]/g, '').slice(0, 10)

export function CampaignForm({ campaign, onClose, onSaved }: { campaign?: Campaign; onClose: () => void; onSaved: (id: number) => void }) {
  const { profile } = useAuth()
  const [f, setF] = useState({
    title: campaign?.title ?? '', code: campaign?.code ?? '', description: campaign?.description ?? '',
    target_amount: campaign?.target_amount ? String(campaign.target_amount) : '',
    suggested_amount: campaign?.suggested_amount ? String(campaign.suggested_amount) : '',
    start_date: campaign?.start_date ?? new Date().toISOString().slice(0, 10), end_date: campaign?.end_date ?? '',
    status: campaign?.status ?? 'draf',
  })
  const [codeTouched, setCodeTouched] = useState(Boolean(campaign))
  const [poster, setPoster] = useState<File | null>(null)
  const { busy, run } = useAction()
  const current = posterUrl(campaign?.poster_path ?? null)

  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const code = f.code.trim().toUpperCase()
    if (!/^[A-Z0-9]{3,10}$/.test(code)) throw new Error('Kod mesti 3–10 huruf atau nombor, tanpa ruang (cth: SMARTTV).')
    let poster_path = campaign?.poster_path ?? null
    if (poster) {
      const img = await compressImage(poster)
      const path = `${code}-${Date.now()}.jpg`
      const up = await supabase.storage.from('poster-kempen').upload(path, img, { contentType: img.type })
      if (up.error) throw new Error('Gagal memuat naik poster: ' + up.error.message)
      poster_path = path
    }
    const body = {
      title: f.title.trim(), code, description: f.description.trim() || null,
      target_amount: f.target_amount ? Number(f.target_amount) : null,
      suggested_amount: f.suggested_amount ? Number(f.suggested_amount) : null,
      start_date: f.start_date || null, end_date: f.end_date || null, status: f.status, poster_path,
    }
    const res = campaign
      ? await supabase.from('campaigns').update(body).eq('id', campaign.id).select('id').single()
      : await supabase.from('campaigns').insert({ ...body, created_by: profile!.id }).select('id').single()
    if (res.error?.code === '23505') throw new Error(`Kod ${code} sudah digunakan oleh kutipan lain.`)
    onSaved((check(res) as { id: number }).id)
  }, campaign ? 'Kutipan dikemas kini.' : 'Kutipan dicipta.') }

  return (
    <Modal title={campaign ? 'Kemas kini kutipan' : 'Kutipan dana baru'} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="row gap wrap">
          <Field label="Tajuk">
            <input required value={f.title} placeholder="cth: Kutipan Dana Smart TV"
              onChange={(e) => setF({ ...f, title: e.target.value, code: codeTouched ? f.code : suggestCode(e.target.value) })} />
          </Field>
          <Field label="Kod rujukan bank" hint="Ditulis oleh ibu bapa dalam catatan pindahan, bersama kod keluarga. 3–10 huruf/nombor.">
            <input required className="mono" value={f.code} maxLength={10}
              onChange={(e) => { setCodeTouched(true); setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }) }} />
          </Field>
        </div>
        <Field label="Keterangan" hint="Untuk apa dana ini, siapa yang mendapat manfaat. Dipaparkan kepada ibu bapa dan dalam teks WhatsApp.">
          <textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div className="row gap wrap">
          <Field label="Sasaran (RM, pilihan)"><input type="number" min="1" step="0.01" value={f.target_amount} onChange={(e) => setF({ ...f, target_amount: e.target.value })} /></Field>
          <Field label="Cadangan sumbangan (RM, pilihan)"><input type="number" min="1" step="0.01" value={f.suggested_amount} onChange={(e) => setF({ ...f, suggested_amount: e.target.value })} /></Field>
        </div>
        <div className="row gap wrap">
          <Field label="Mula"><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Tamat (pilihan)"><input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
          <Field label="Status">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Campaign['status'] })}>
              <option value="draf">Draf (belum dipaparkan)</option>
              <option value="aktif">Sedang dikutip</option>
              <option value="ditutup">Ditutup</option>
            </select>
          </Field>
        </div>
        <Field label="Poster (pilihan)" hint="Gambar JPG/PNG. Boleh dikongsi terus di WhatsApp.">
          <input type="file" accept="image/*" onChange={(e) => setPoster(e.target.files?.[0] ?? null)} />
        </Field>
        {current && !poster && <img src={current} alt="Poster semasa" className="poster-thumb" />}
        <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      </form>
    </Modal>
  )
}
