import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Panoramica({ business, onNavigate }) {
  const [counts, setCounts] = useState({ servizi: null, recensioni: null, appuntamenti: null, bozzeSocial: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return
    async function load() {
      setLoading(true)
      const today = new Date().toISOString().split('T')[0]
      const [
        { count: cServizi },
        { count: cRecensioni },
        { count: cAppuntamenti },
        { count: cSocial },
      ] = await Promise.all([
        supabase.from('services').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
        supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('business_id', business.id).gte('date', today),
        supabase.from('social_drafts').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'draft'),
      ])
      setCounts({
        servizi:      cServizi      ?? 0,
        recensioni:   cRecensioni   ?? 0,
        appuntamenti: cAppuntamenti ?? 0,
        bozzeSocial:  cSocial       ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [business?.id])

  const stats = [
    { label: 'Servizi',             value: counts.servizi,      icon: '🛎️', section: 'servizi'    },
    { label: 'Recensioni',          value: counts.recensioni,   icon: '⭐',  section: 'recensioni' },
    { label: 'Appuntamenti oggi+',  value: counts.appuntamenti, icon: '📅', section: 'agenda'     },
    { label: 'Bozze social',        value: counts.bozzeSocial,  icon: '✍️', section: 'social'     },
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
          <button
            key={s.label}
            className="db-stat-card db-stat-card--link"
            onClick={() => onNavigate?.(s.section)}
          >
            <span className="db-stat-icon">{s.icon}</span>
            <span className="db-stat-value">
              {loading ? <span className="db-stat-loading">…</span> : s.value}
            </span>
            <span className="db-stat-label">{s.label}</span>
          </button>
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
