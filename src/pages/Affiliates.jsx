import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

const PLAN_META = {
  trial:   { label: 'Trial',    bg: '#fef3c7', color: '#92400e' },
  free:    { label: 'Gratuito', bg: '#f1f5f9', color: '#475569' },
  starter: { label: 'Starter',  bg: '#dbeafe', color: '#1e40af' },
  pro:     { label: 'Pro',      bg: '#ede9fe', color: '#5b21b6' },
}

export default function Affiliates() {
  const navigate = useNavigate()
  const [session,   setSession]   = useState(undefined)
  const [affiliate, setAffiliate] = useState(null)
  const [clients,   setClients]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [copied,    setCopied]    = useState(false)

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

  const loadData = useCallback(async (userId) => {
    const { data: aff, error: affErr } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    setAffiliate(aff ?? null)

    if (aff) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, name, city, plan, is_active, created_at')
        .eq('affiliate_code', aff.code)
        .order('created_at', { ascending: false })
      setClients(biz ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (!session) { setLoading(false); return }
    loadData(session.user.id)
  }, [session, loadData])

  const copyLink = () => {
    navigator.clipboard.writeText(`https://piumapp.com/auth?ref=${affiliate.code}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
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
        {!session ? (
          <div className="af-card">
            <h1 className="af-title">Programma Affiliati PIUM</h1>
            <p className="af-subtitle">Porta nuovi clienti su PIUM e guadagna una commissione per ogni attivazione. Accedi per gestire la tua dashboard.</p>
            <Link to="/affiliates/auth" className="af-cta-btn">Accedi / Registrati</Link>
          </div>
        ) : !affiliate ? (
          <div className="af-card">
            <h1 className="af-title">Account non trovato</h1>
            <p className="af-subtitle">Non risulta un account affiliato per questo utente. Contattaci a <a href="mailto:info@piumapp.com" style={{ color: 'var(--accent)' }}>info@piumapp.com</a> per assistenza.</p>
          </div>
        ) : affiliate.status === 'pending' ? (
          <div className="af-card">
            <div style={{ fontSize: 40, marginBottom: 12, textAlign: 'center' }}>⏳</div>
            <h1 className="af-title" style={{ textAlign: 'center' }}>Richiesta in attesa</h1>
            <p className="af-subtitle" style={{ textAlign: 'center' }}>
              La tua registrazione come affiliato è stata ricevuta. Ti contatteremo presto per attivare il tuo account.
            </p>
          </div>
        ) : (
          <Dashboard affiliate={affiliate} clients={clients} copied={copied} onCopy={copyLink} />
        )}
      </div>
    </div>
  )
}

/* ── Dashboard affiliato ── */
function Dashboard({ affiliate, clients, copied, onCopy }) {
  const refLink     = `https://piumapp.com/auth?ref=${affiliate.code}`
  const activeCount = clients.filter(c => c.is_active && c.plan === 'pro').length

  return (
    <div className="af-dashboard">
      <div className="af-dash-header">
        <div>
          <h1 className="af-title">Ciao, {affiliate.name.split(' ')[0]} 👋</h1>
          <p className="af-subtitle">La tua dashboard affiliati PIUM</p>
        </div>
      </div>

      {/* Stats */}
      <div className="af-stats-row">
        <div className="af-stat-card">
          <span className="af-stat-value">€{Number(affiliate.total_earned).toFixed(2)}</span>
          <span className="af-stat-label">Guadagnato totale</span>
        </div>
        <div className="af-stat-card af-stat-card--pending">
          <span className="af-stat-value">€{Number(affiliate.total_pending).toFixed(2)}</span>
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

      {/* Link di referral */}
      <div className="af-link-card">
        <div className="af-link-label">Il tuo link di referral</div>
        <div className="af-link-row">
          <code className="af-link-code">{refLink}</code>
          <button className={`af-copy-btn ${copied ? 'af-copy-btn--done' : ''}`} onClick={onCopy}>
            {copied ? '✓ Copiato' : 'Copia link'}
          </button>
        </div>
        <p className="af-link-hint">
          Codice: <strong>{affiliate.code}</strong> — condividi il link con i tuoi clienti.
          Chi si registra tramite questo link viene associato al tuo account.
        </p>
      </div>

      {/* Lista clienti */}
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
