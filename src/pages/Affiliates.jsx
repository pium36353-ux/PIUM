import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

const PLAN_META = {
  trial: { label: 'Trial', bg: '#fef3c7', color: '#92400e' },
  free: { label: 'Gratuito', bg: '#f1f5f9', color: '#475569' },
  starter: { label: 'Starter', bg: '#dbeafe', color: '#1e40af' },
  pro: { label: 'Pro', bg: '#ede9fe', color: '#5b21b6' },
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
        supabase
          .from('businesses')
          .select('id, name, city, plan, is_active, created_at')
          .in('affiliate_code', [aff.code, `${aff.code}-on`])
          .order('created_at', { ascending: false }),
        supabase
          .from('affiliate_commissions')
          .select('amount, status')
          .eq('affiliate_id', aff.id),
      ])
      setClients(biz ?? [])

      let earned = 0, pending = 0
      for (const row of (commData ?? [])) {
        if (row.status === 'pending' || row.status === 'paid') earned += Number(row.amount)
        if (row.status === 'pending') pending += Number(row.amount)
      }
      setCommStats({ earned, pending })
    } else {
      setClients([])
      setCommStats({ earned: 0, pending: 0 })
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
          <Dashboard affiliate={affiliate} clients={clients} copied={copied} onCopy={copyLink} commStats={commStats} />
        )}
      </div>
    </div>
  )
}

function Dashboard({ affiliate, clients, copied, onCopy, commStats }) {
  // Il suffisso "-on" e riservato al canale scontato: il codice base deve restare pulito.
  const baseCode = affiliate.code.replace(/-on$/i, '')
  const directLink = `https://piumapp.com/auth?ref=${baseCode}`
  const onlineLink = `https://piumapp.com/auth?ref=${baseCode}-on`
  const activeCount = clients.filter(c => c.is_active && c.plan === 'pro').length

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
          <span className="af-stat-value">{activeCount}</span>
          <span className="af-stat-label">Attivi (Pro)</span>
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
          *I rapporti si rinnovano ogni 12 mesi: alla scadenza puoi scegliere se continuare
          ad ampliare il tuo portafoglio o mantenere solo l'assistenza dei clienti già acquisiti.
        </p>
      </div>

      <div className="af-section">
        <h2 className="af-section-title">Clienti portati ({clients.length})</h2>
        {clients.length === 0 ? (
          <p className="af-empty">Nessun cliente ancora. Condividi il tuo link per iniziare!</p>
        ) : (
          <div className="af-clients-list">
            {clients.map(c => (
              <div key={c.id} className="af-client-row">
                <div className="af-client-info">
                  <span className="af-client-name">{c.name}</span>
                  {c.city && <span className="af-client-city">{c.city}</span>}
                </div>
                <div className="af-client-meta">
                  <PlanBadge plan={c.plan} />
                  <StatusDot active={c.is_active} />
                  <span className="af-client-date">
                    {new Date(c.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PlanBadge({ plan }) {
  const meta = PLAN_META[plan] ?? PLAN_META.trial
  return <span className="af-plan-badge" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
}

function StatusDot({ active }) {
  return <span className={`af-status-dot ${active ? 'af-status-dot--active' : 'af-status-dot--inactive'}`}>{active ? 'Attivo' : 'Inattivo'}</span>
}
