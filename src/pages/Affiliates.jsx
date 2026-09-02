import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import { getBusinessRealStatus } from '../lib/businessGate'

// Etichette/colore per lo stato reale del cliente (vedi businessGate.js) —
// quello che interessa davvero all'affiliato per curare il rapporto: paga,
// è ancora in prova, o l'ha perso (e se sì, se non ha mai pagato o ha disdetto).
const REAL_STATUS_META = {
  active:        { label: 'Pagante',  cls: 'af-status-dot--active'   },
  trial:         { label: 'In prova', cls: 'af-status-dot--trial'    },
  trial_expired: { label: 'Scaduto',  cls: 'af-status-dot--expired'  },
  expired:       { label: 'Perso',    cls: 'af-status-dot--lost'     },
  suspended:     { label: 'Sospeso',  cls: 'af-status-dot--inactive' },
}

export default function Affiliates() {
  const navigate = useNavigate()
  const [session, setSession] = useState(undefined)
  const [affiliate, setAffiliate] = useState(null)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(null)
  const [flowError, setFlowError] = useState('')
  const [commStats, setCommStats] = useState({ earned: 0, pending: 0 })
  const [commByBusiness, setCommByBusiness] = useState({})

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!alive) return
      if (s?.user?.app_metadata?.role === 'admin') {
        navigate('/admin', { replace: true })
        return
      }
      setSession(s ?? null)
    })
    return () => { alive = false }
  }, [navigate])

  // Sola lettura: un record affiliato esiste solo se creato esplicitamente in
  // AffiliatesAuth.jsx (form + accettazione contratto). Questa pagina non deve
  // MAI crearne uno solo perche un utente autenticato la visita (era il bug:
  // trasformava qualunque cliente loggato in un affiliato "fantasma").
  const loadAffiliateProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      setFlowError('Impossibile caricare il profilo affiliato. Riprova tra poco.')
      return null
    }

    return data ?? null
  }, [])

  const loadData = useCallback(async (user) => {
    const aff = await loadAffiliateProfile(user.id)
    setAffiliate(aff ?? null)

    if (aff) {
      const [{ data: biz }, { data: commData }] = await Promise.all([
        // Privacy: SOLO colonne commerciali (stato del rapporto). L'affiliato
        // non deve mai vedere dati operativi del commerciante o dei suoi
        // clienti finali (email, telefono, prenotazioni, ecc.) — questa select
        // è l'unica barriera, perché la RLS su businesses ("public read") filtra
        // le righe (is_active = true) ma non le colonne. Nota per il futuro:
        // andrebbe irrobustita con una RLS/funzione dedicata alle sole colonne
        // commerciali, invece di affidarsi alla disciplina di questa select.
        supabase
          .from('businesses')
          .select('id, name, city, status, trial_ends_at, stripe_subscription_id, affiliate_code, created_at')
          .in('affiliate_code', [aff.code, `${aff.code}-on`])
          .order('created_at', { ascending: false }),
        supabase
          .from('affiliate_commissions')
          .select('business_id, amount, status, month_number')
          .eq('affiliate_id', aff.id),
      ])
      setClients(biz ?? [])

      // month_number non viene mostrato in UI (il ciclo 12 mesi/15€ resta un
      // dettaglio interno, non enfatizzato all'affiliato): qui serve solo se
      // in futuro servisse un calcolo lato client sulla fase della commissione.
      let earned = 0, pending = 0
      const byBusiness = {}
      for (const row of (commData ?? [])) {
        const maturata = row.status === 'pending' || row.status === 'paid'
        if (maturata) {
          earned += Number(row.amount)
          byBusiness[row.business_id] = (byBusiness[row.business_id] ?? 0) + Number(row.amount)
        }
        if (row.status === 'pending') pending += Number(row.amount)
      }
      setCommStats({ earned, pending })
      setCommByBusiness(byBusiness)
    } else {
      setClients([])
      setCommStats({ earned: 0, pending: 0 })
      setCommByBusiness({})
    }

    setLoading(false)
  }, [loadAffiliateProfile])

  useEffect(() => {
    let alive = true

    const run = async () => {
      if (session === undefined) return
      if (!session) {
        setLoading(false)
        return
      }

      await loadData(session.user)
    }

    run()
    return () => { alive = false }
  }, [session, loadData])

  const copyLink = (url, key) => {
    navigator.clipboard.writeText(url)
      .then(() => { setCopied(key); setTimeout(() => setCopied(null), 2500) })
  }

  if (loading || session === undefined) {
    return (
      <div className="af-shell af-shell--center">
        <svg className="af-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      </div>
    )
  }

  return (
    <div className="af-shell">
      <div className="af-topbar">
        <Link to="/"><Logo /></Link>
        {session && (
          <button className="af-logout-btn" onClick={() => supabase.auth.signOut().then(() => setSession(null))}>
            Esci
          </button>
        )}
      </div>

      <div className="af-body">
        {flowError && (
          <div className="af-form-error" role="alert">{flowError}</div>
        )}

        {!session ? (
          <div className="af-card">
            <h1 className="af-title">Programma Affiliati PIUM</h1>
            <p className="af-subtitle">Porta nuovi clienti su PIUM e guadagna una commissione per ogni attivazione. Accedi per gestire la tua dashboard.</p>
            <Link to="/affiliates/auth" className="af-cta-btn">Accedi / Registrati</Link>
            <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
              <Link to="/contratto-affiliazione" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                Contratto di Affiliazione PIUM
              </Link>
            </p>
          </div>
        ) : !affiliate ? (
          <div className="af-card">
            <h1 className="af-title">Non sei ancora un affiliato</h1>
            <p className="af-subtitle">Questo account non ha un profilo affiliato. Se vuoi guadagnare una commissione per ogni cliente che porti su PIUM, registrati al programma.</p>
            <Link to="/affiliates/auth" className="af-cta-btn">Registrati come affiliato</Link>
          </div>
        ) : affiliate.status === 'pending' ? (
          <div className="af-card">
            <div style={{ fontSize: 40, marginBottom: 12, textAlign: 'center' }}>⌛</div>
            <h1 className="af-title" style={{ textAlign: 'center' }}>Richiesta in attesa</h1>
            <p className="af-subtitle" style={{ textAlign: 'center' }}>
              La tua registrazione come affiliato e stata ricevuta. Ti contatteremo presto per attivare il tuo account.
            </p>
          </div>
        ) : (
          <Dashboard affiliate={affiliate} clients={clients} copied={copied} onCopy={copyLink} commStats={commStats} commByBusiness={commByBusiness} />
        )}
      </div>
    </div>
  )
}

function Dashboard({ affiliate, clients, copied, onCopy, commStats, commByBusiness }) {
  // Il suffisso "-on" e riservato al canale scontato: il codice base deve restare pulito.
  const baseCode = affiliate.code.replace(/-on$/i, '')
  const directLink = `https://piumapp.com/auth?ref=${baseCode}`
  const onlineLink = `https://piumapp.com/auth?ref=${baseCode}-on`
  const payingCount = clients.filter(c => getBusinessRealStatus(c) === 'active').length

  return (
    <div className="af-dashboard">
      <div className="af-dash-header">
        <div>
          <h1 className="af-title">Ciao, {affiliate.name.split(' ')[0]} 👋</h1>
          <p className="af-subtitle">La tua dashboard affiliati PIUM</p>
        </div>
      </div>

      <div className="af-stats-row">
        <div className="af-stat-card">
          <span className="af-stat-value">€{commStats.earned.toFixed(2)}</span>
          <span className="af-stat-label">Guadagnato totale</span>
        </div>
        <div className="af-stat-card af-stat-card--pending">
          <span className="af-stat-value">€{commStats.pending.toFixed(2)}</span>
          <span className="af-stat-label">In attesa di pagamento</span>
        </div>
        <div className="af-stat-card">
          <span className="af-stat-value">{clients.length}</span>
          <span className="af-stat-label">Clienti portati</span>
        </div>
        <div className="af-stat-card">
          <span className="af-stat-value">{payingCount}</span>
          <span className="af-stat-label">Clienti paganti</span>
        </div>
      </div>

      <div className="af-link-card">
        <div className="af-link-label">I tuoi link di referral</div>

        <div className="af-link-block">
          <div className="af-link-name">Link diretto (prezzo pieno)</div>
          <div className="af-link-row">
            <code className="af-link-code">{directLink}</code>
            <button className={`af-copy-btn ${copied === 'direct' ? 'af-copy-btn--done' : ''}`} onClick={() => onCopy(directLink, 'direct')}>
              {copied === 'direct' ? '✓ Copiato' : 'Copia link'}
            </button>
          </div>
          <p className="af-link-hint">Il cliente paga 99,99€/mese · Tu guadagni 29,99€/mese*</p>
        </div>

        <div className="af-link-block">
          <div className="af-link-name">Link online (scontato)</div>
          <div className="af-link-row">
            <code className="af-link-code">{onlineLink}</code>
            <button className={`af-copy-btn ${copied === 'online' ? 'af-copy-btn--done' : ''}`} onClick={() => onCopy(onlineLink, 'online')}>
              {copied === 'online' ? '✓ Copiato' : 'Copia link'}
            </button>
          </div>
          <p className="af-link-hint">Il cliente paga 69,99€/mese · Tu guadagni 19,99€/mese*</p>
        </div>

        <p className="af-link-hint">
          Codice: <strong>{baseCode}</strong> - condividi il link con i tuoi clienti.
          Chi si registra tramite questi link viene associato al tuo account.
        </p>
        <p className="af-link-note">
          *Commissione piena per i primi 12 mesi; dal 13° mese 15€/mese finché il cliente
          resta abbonato (assistenza continuativa).
        </p>
      </div>

      <div className="af-section">
        <h2 className="af-section-title">Clienti portati ({clients.length})</h2>
        {clients.length === 0 ? (
          <p className="af-empty">Nessun cliente ancora. Condividi il tuo link per iniziare!</p>
        ) : (
          <div className="af-clients-list">
            {clients.map(c => {
              const commissione = commByBusiness[c.id] ?? 0
              return (
                <div key={c.id} className="af-client-row">
                  <div className="af-client-info">
                    <span className="af-client-name">{c.name}</span>
                    {c.city && <span className="af-client-city">{c.city}</span>}
                  </div>
                  <div className="af-client-badges">
                    <ChannelBadge affiliateCode={c.affiliate_code} />
                    <RealStatusBadge status={getBusinessRealStatus(c)} />
                  </div>
                  <div className="af-client-footer">
                    <span className="af-client-commission">
                      {commissione > 0 ? `€${commissione.toFixed(2)} maturati` : '—'}
                    </span>
                    <span className="af-client-date">
                      {new Date(c.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Canale commerciale (deducibile dal solo suffisso "-on" di affiliate_code,
// intatto da quando il cliente si è registrato — vedi migration
// 20260816_affiliate_code_on_suffix_validation.sql), non dal piano app.
function ChannelBadge({ affiliateCode }) {
  const isOn = (affiliateCode ?? '').toLowerCase().endsWith('-on')
  return (
    <span
      className="af-plan-badge"
      style={isOn ? { background: '#dbeafe', color: '#1e40af' } : { background: '#ede9fe', color: '#5b21b6' }}
    >
      {isOn ? 'Scontato · 69,99€' : 'Pieno · 99,99€'}
    </span>
  )
}

function RealStatusBadge({ status }) {
  const meta = REAL_STATUS_META[status] ?? REAL_STATUS_META.trial
  return <span className={`af-status-dot ${meta.cls}`}>{meta.label}</span>
}
