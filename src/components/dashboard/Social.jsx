import { useState } from 'react'

const PLATFORMS = ['Tutti', 'Instagram', 'Facebook', 'LinkedIn', 'X']
const STATUSES  = ['draft', 'approved', 'scheduled', 'published']
const STATUS_LABELS = { draft: 'Bozza', approved: 'Approvato', scheduled: 'Pianificato', published: 'Pubblicato' }
const STATUS_COLORS = { draft: 'db-badge--gray', approved: 'db-badge--green', scheduled: 'db-badge--blue', published: 'db-badge--purple' }

export default function Social({ business }) {
  const [platform, setPlatform] = useState('Tutti')

  if (!business) return <div className="db-section"><div className="db-empty-banner">Configura prima la tua attività.</div></div>

  return (
    <div className="db-section">
      <div className="db-section-toolbar">
        <div className="db-filter-row">
          {PLATFORMS.map(p => (
            <button
              key={p}
              className={`db-filter-btn ${platform === p ? 'db-filter-btn--active' : ''}`}
              onClick={() => setPlatform(p)}
            >{p}</button>
          ))}
        </div>
        <button className="db-btn-primary">+ Nuova bozza</button>
      </div>
      <div className="db-card">
        <p className="db-card-empty">Nessuna bozza. Clicca "Nuova bozza" per generarne una con AI.</p>
      </div>
    </div>
  )
}
