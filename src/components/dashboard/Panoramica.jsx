export default function Panoramica({ business }) {
  const stats = [
    { label: 'Visite oggi',      value: '—', icon: '👁' },
    { label: 'Recensioni',       value: '—', icon: '⭐' },
    { label: 'Bozze social',     value: '—', icon: '✍️' },
    { label: 'Promemoria attivi', value: '—', icon: '🔔' },
  ]

  return (
    <div className="db-section">
      {!business && (
        <div className="db-empty-banner">
          Nessuna attività trovata. Configura la tua attività per iniziare.
        </div>
      )}

      <div className="db-stats-grid">
        {stats.map(s => (
          <div key={s.label} className="db-stat-card">
            <span className="db-stat-icon">{s.icon}</span>
            <span className="db-stat-value">{s.value}</span>
            <span className="db-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="db-cards-row">
        <div className="db-card">
          <h3 className="db-card-title">Attività recente</h3>
          <p className="db-card-empty">Nessuna attività recente.</p>
        </div>
        <div className="db-card">
          <h3 className="db-card-title">Prossimi promemoria</h3>
          <p className="db-card-empty">Nessun promemoria in scadenza.</p>
        </div>
      </div>
    </div>
  )
}
