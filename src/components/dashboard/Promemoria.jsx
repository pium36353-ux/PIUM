import { useState } from 'react'

const PRIORITIES = ['Tutti', 'Alta', 'Media', 'Bassa']
const P_MAP = { Alta: 'high', Media: 'medium', Bassa: 'low' }
const P_COLORS = { high: 'db-badge--red', medium: 'db-badge--yellow', low: 'db-badge--gray' }
const P_LABELS = { high: 'Alta', medium: 'Media', low: 'Bassa' }

export default function Promemoria({ business }) {
  const [filter, setFilter] = useState('Tutti')

  if (!business) return <div className="db-section"><div className="db-empty-banner">Configura prima la tua attività.</div></div>

  return (
    <div className="db-section">
      <div className="db-section-toolbar">
        <div className="db-filter-row">
          {PRIORITIES.map(p => (
            <button
              key={p}
              className={`db-filter-btn ${filter === p ? 'db-filter-btn--active' : ''}`}
              onClick={() => setFilter(p)}
            >{p}</button>
          ))}
        </div>
        <button className="db-btn-primary">+ Nuovo promemoria</button>
      </div>
      <div className="db-card">
        <p className="db-card-empty">Nessun promemoria attivo.</p>
      </div>
    </div>
  )
}
