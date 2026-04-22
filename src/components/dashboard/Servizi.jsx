export default function Servizi({ business }) {
  if (!business) return <div className="db-section"><div className="db-empty-banner">Configura prima la tua attività.</div></div>

  return (
    <div className="db-section">
      <div className="db-section-toolbar">
        <p className="db-section-desc">Gestisci i servizi offerti dalla tua attività.</p>
        <button className="db-btn-primary">+ Aggiungi servizio</button>
      </div>
      <div className="db-card">
        <p className="db-card-empty">Nessun servizio ancora. Aggiungine uno per iniziare.</p>
      </div>
    </div>
  )
}
