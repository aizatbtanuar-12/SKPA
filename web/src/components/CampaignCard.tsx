import { Link } from 'react-router-dom'
import { Badge } from './ui'
import { campaignStatus, daysLeft, pct, posterUrl, type Campaign, type Progress } from '../lib/donations'
import { date, rm } from '../lib/util'

/** One donation drive: poster, progress towards the target, and a link to donate or manage */
export default function CampaignCard({ c, p, to, compact }: { c: Campaign; p?: Progress; to: string; compact?: boolean }) {
  const collected = Number(p?.collected ?? 0)
  const percent = pct(collected, c.target_amount)
  const left = c.status === 'aktif' ? daysLeft(c.end_date) : null
  const poster = posterUrl(c.poster_path)
  return (
    <Link to={to} className={`campaign ${compact ? 'compact' : ''}`}>
      {poster ? <img src={poster} alt="" className="campaign-poster" /> : <div className="campaign-poster empty" aria-hidden="true">{c.code}</div>}
      <div className="campaign-body">
        <div className="row between gap">
          <strong>{c.title}</strong>
          <Badge tone={campaignStatus[c.status][1]}>{campaignStatus[c.status][0]}</Badge>
        </div>
        <div className="campaign-amount">
          <b>{rm(collected)}</b>
          {c.target_amount && <span className="muted"> daripada {rm(c.target_amount)}</span>}
        </div>
        {percent != null && <div className="progress"><div style={{ width: `${percent}%` }} /></div>}
        <span className="muted small">
          {p?.donors ?? 0} penyumbang
          {left != null && (left >= 0 ? ` · ${left} hari lagi` : ' · tarikh tamat telah lepas')}
          {c.status === 'ditutup' && c.end_date && ` · ditutup ${date(c.end_date)}`}
        </span>
      </div>
    </Link>
  )
}
