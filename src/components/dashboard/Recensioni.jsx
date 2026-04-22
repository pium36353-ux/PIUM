const STARS = [5, 4, 3, 2, 1]

export default function Recensioni({ business }) {
  if (!business) return <div className="db-section"><div className="db-empty-banner">Configura prima la tua attività.</div></div>

  return (
    <div className="db-section">
      <div className="db-section-toolbar">
        <p className="db-section-desc">Monitora e rispondi alle recensioni dei clienti.</p>
        <button className="db-btn-primary">+ Aggiungi recensione</button>
      </div>

      <div className="db-reviews-summary">
        <div className="db-review-score">
          <span className="db-review-score-num">—</span>
          <div className="db-review-stars">{'★'.repeat(5)}</div>
          <span className="db-review-count">0 recensioni</span>
        </div>
        <div className="db-review-bars">
          {STARS.map(n => (
            <div key={n} className="db-review-bar-row">
              <span className="db-review-bar-label">{n}★</span>
              <div className="db-review-bar-track"><div className="db-review-bar-fill" style={{ width: '0%' }} /></div>
              <span className="db-review-bar-pct">0</span>
            </div>
          ))}
        </div>
      </div>

      <div className="db-card">
        <p className="db-card-empty">Nessuna recensione ancora.</p>
      </div>
    </div>
  )
}
