import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

const PLAN_META = {
  trial: { label: 'Trial', bg: '#fef3c7', color: '#92400e' },
  free: { label: 'Gratuito', bg: '#f1f5f9', color: '#475569' },
  starter: { label: 'Starter', bg: '#dbeafe', color: '#1e40af' },
  pro: { label: 'Pro', bg: '#ede9fe', color: '#5b21b6' },
}

function generateCode(name) {
  const base = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 3)
  const rand = Math.random().toString(36).slice(2, 6)
  return (base || 'aff') + rand
}

function getAffiliateName(user) {
  const fullName = user?.user_metadata?.full_name
  if (typeof fullName === 'string' && fullName.trim()) return fullName.trim()
  const localPart = user?.email?.split('@')?.[0]
  if (localPart) return localPart
  return 'Affiliato'
}

export default function Affiliates() {
  const navigate = useNavigate()
  const [session, setSession] = useState(undefined)
  const [affiliate, setAffiliate] = useState(null)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [flowError, setFlowError] = useState('')
  const [commStats, setCommStats] = useState({ earned: 0, pending: 0 })
  const acceptanceAttemptedRef = useRef(new Set())
  const bootstrapAttemptedRef = useRef(new Set())

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

  const ensureAffiliateAcceptance = useCallback(async (userId) => {
    if (!userId) return
    if (acceptanceAttemptedRef.current.has(userId)) return
    acceptanceAttemptedRef.current.add(userId)

    const { error } = await supabase
      .from('legal_acceptances')
      .upsert({
        user_id: userId,
        context: 'affiliate',
        acceptance_type: 'affiliate_contract_privacy',
        document_versions: {
          contratto_affiliazione: '2026-05-28',
          privacy: '2026-05-28',
        },
        source: 'affiliate_register_confirmed',
      }, { onConflict: 'user_id,acceptance_type', ignoreDuplicates: true })

    if (error) {
      setFlowError('Accesso riuscito, ma non e stato possibile salvare l accettazione dei documenti. Ricarica la pagina o contatta l assistenza.')
      return
    }

    setFlowError('')
  }, [])

  const ensureAffiliateProfile = useCallback(async (user) => {
    const userId = user?.id
    if (!userId) return null

    const { data: existing, error: existingError } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (existingError) {
      setFlowError('Impossibile caricare il profilo affiliato. Riprova tra poco.')
      return null
    }

    if (existing) return existing

    if (bootstrapAttemptedRef.current.has(userId)) return null
    bootstrapAttemptedRef.current.add(userId)

    const name = getAffiliateName(user)
    const email = (user?.email || '').trim()

    let inserted = false
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generateCode(name)
      const { error: insertError } = await supabase.from('affiliates').insert({
        user_id: userId,
        code,
        name,
        email,
        status: 'pending',
      })

      if (!insertError) {
        inserted = true
        break
      }

      const msg = String(insertError.message || '').toLowerCase()
      if (!msg.includes('duplicate')) break
    }

    if (!inserted) {
      setFlowError('Il profilo affiliato non e ancora disponibile. Riprova tra qualche secondo o contatta l assistenza.')
      return null
    }

    const { data: created } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    return created ?? null
  }, [])

  const loadData = useCallback(async (user) => {
    const aff = await ensureAffiliateProfile(user)
    setAffiliate(aff ?? null)

    if (aff) {
      const [{ data: biz }, { data: commData }] = await Promise.all([
        supabase
          .from('businesses')
          .select('id, name, city, plan, is_active, created_at')
          .eq('affiliate_code', aff.code)
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
  }, [ensureAffiliateProfile])

  useEffect(() => {
    let alive = true

    const run = async () => {
      if (session === undefined) return
      if (!session) {
        setLoading(false)
        return
      }

      await ensureAffiliateAcceptance(session.user.id)
      if (!alive) return
      await loadData(session.user)
    }

    run()
    return () => { alive = false }
  }, [session, ensureAffiliateAcceptance, loadData])

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
            <h1 className="af-title">Account non trovato</h1>
            <p className="af-subtitle">Non risulta un account affiliato per questo utente. Contattaci a <a href="mailto:info@piumapp.com" style={{ color: 'var(--accent)' }}>info@piumapp.com</a> per assistenza.</p>
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
  const refLink = `https://piumapp.com/auth?ref=${affiliate.code}`
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
        <div className="af-link-label">Il tuo link di referral</div>
        <div className="af-link-row">
          <code className="af-link-code">{refLink}</code>
          <button className={`af-copy-btn ${copied ? 'af-copy-btn--done' : ''}`} onClick={onCopy}>
            {copied ? '✓ Copiato' : 'Copia link'}
          </button>
        </div>
        <p className="af-link-hint">
          Codice: <strong>{affiliate.code}</strong> - condividi il link con i tuoi clienti.
          Chi si registra tramite questo link viene associato al tuo account.
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
