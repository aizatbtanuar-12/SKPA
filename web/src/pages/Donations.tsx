import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useRole } from '../lib/auth'
import { PageHead } from '../components/Layout'
import { Empty } from '../components/ui'
import CampaignCard from '../components/CampaignCard'
import { loadProgress, type Campaign, type Progress } from '../lib/donations'

export default function Donations() {
  const { isStaff } = useRole()
  const [list, setList] = useState<Campaign[] | null>(null)
  const [prog, setProg] = useState<Record<number, Progress>>({})

  useEffect(() => {
    supabase.from('campaigns').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setList((data as Campaign[]) ?? []))
    loadProgress().then(setProg)
  }, [])

  const active = (list ?? []).filter((c) => c.status === 'aktif')
  const closed = (list ?? []).filter((c) => c.status === 'ditutup')

  return (
    <>
      <PageHead title="Sumbangan" sub="Kutipan dana PIBG untuk kemudahan murid. Sebarang jumlah amat dihargai."
        actions={isStaff && <Link className="btn primary" to="/kempen">Urus kutipan dana</Link>} />
      <h2 className="h3">Sedang dikutip</h2>
      {list === null ? null : active.length ? (
        <div className="campaign-grid">{active.map((c) => <CampaignCard key={c.id} c={c} p={prog[c.id]} to={`/sumbangan/${c.id}`} />)}</div>
      ) : <Empty>Tiada kutipan dana yang sedang berjalan.</Empty>}
      {closed.length > 0 && (
        <>
          <h2 className="h3">Telah selesai</h2>
          <div className="campaign-grid">{closed.map((c) => <CampaignCard key={c.id} c={c} p={prog[c.id]} to={`/sumbangan/${c.id}`} compact />)}</div>
        </>
      )}
    </>
  )
}
