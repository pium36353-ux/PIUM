import { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import ErrorBoundary from '../components/ErrorBoundary'
import { notifyNewBooking } from '../lib/notifications'
import Panoramica  from '../components/dashboard/Panoramica'
import EditorSito  from '../components/dashboard/EditorSito'
import Servizi     from '../components/dashboard/Servizi'
import Social      from '../components/dashboard/Social'
import Recensioni  from '../components/dashboard/Recensioni'
import Promemoria  from '../components/dashboard/Promemoria'
import Agenda      from '../components/dashboard/Agenda'
import Clienti     from '../components/dashboard/Clienti'

const NAV = [
  { id: 'panoramica', label: 'Panoramica',  icon: IconGrid },
  { id: 'agenda',     label: 'Agenda',      icon: IconCalendar },
  { id: 'clienti',    label: 'Clienti',     icon: IconUsers },
  { id: 'promemoria', label: 'Promemoria',  icon: IconBell },
  { id: 'social',     label: 'Social',      icon: IconShare },
  { id: 'recensioni', label: 'Recensioni',  icon: IconStar },
  { id: 'servizi',    label: 'Servizi',     icon: IconBriefcase },
  { id: 'editor',     label: 'Editor Sito', icon: IconPen },
]

function formatTrialEnd(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function Dashboard() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [section, setSection]   = useState('panoramica')
  const [user, setUser]         = useState(null)
  const [business, setBusiness] = useState(null)
  const [sideOpen,           setSideOpen]           = useState(false)
  const [pendingCount,       setPendingCount]       = useState(0)
  const [agendaInitialView,  setAgendaInitialView]  = useState('day')
  const [stripeSuccess,      setStripeSuccess]      = useState(false)
  const [checkoutLoading,    setCheckoutLoading]    = useState(false)
  const [checkoutError,      setCheckoutError]      = useState(null)
  const [pendingActivation,  setPendingActivation]  = useState(false)
  const [loadError,          setLoadError]          = useState(false)
  const [adminMessages,      setAdminMessages]      = useState([])

  const trialExpired = business?.status === 'trial'
    && !!business?.trial_ends_at
    && new Date(business.trial_ends_at) < new Date()

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return
      if (!data.user) { navigate('/auth'); return }
      setUser(data.user)
      supabase
        .from('businesses')
        .select('*')
        .eq('user_id', data.user.id)
        .maybeSingle()
        .then(async ({ data: biz, error }) => {
          if (!alive) return
          if (error) { setLoadError(true); return }
          if (!biz) { navigate('/onboarding'); return }
          setBusiness(biz)

          // Carica messaggi admin non letti
          const [{ data: direct }, { data: broadcast }, { data: reads }] = await Promise.all([
            supabase.from('admin_messages').select('id, message, link_url, link_label, created_at').eq('business_id', biz.id),
            supabase.from('admin_messages').select('id, message, link_url, link_label, created_at').is('business_id', null).gt('created_at', biz.created_at),
            supabase.from('admin_message_reads').select('message_id').eq('business_id', biz.id),
          ])
          if (!alive) return
          const readSet = new Set((reads ?? []).map(r => r.message_id))
          const allMsgs = [...(direct ?? []), ...(broadcast ?? [])]
            .filter(m => !readSet.has(m.id))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          setAdminMessages(allMsgs)
        })
    })
    return () => { alive = false }
  }, [navigate])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  const dismissAdminMessage = async (msg) => {
    await supabase.from('admin_message_reads').insert({
      message_id:  msg.id,
      business_id: business.id,
    })
    setAdminMessages(prev => prev.filter(m => m.id !== msg.id))
  }

  // Handle ?s= query param for deep-linking into a section
  useEffect(() => {
    const s = new URLSearchParams(location.search).get('s')
    if (s && NAV.some(n => n.id === s)) setSection(s)
  }, [location.search])

  // Step 1 — rileva il ritorno da Stripe e avvia il polling
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('stripe_success') !== 'true' || !user) return
    navigate('/dashboard', { replace: true })
    setPendingActivation(true)
  }, [location.search, user]) // eslint-disable-line

  // Step 2 — polling separato, non cancellato dal navigate
  useEffect(() => {
    if (!pendingActivation || !user) return

    let mounted = true
    let attempts = 0
    const MAX   = 5     // 5 × 2s = 10s max
    const DELAY = 2000
    let timer
    let successTimer

    const poll = () => {
      attempts++
      supabase.from('businesses').select('*').eq('user_id', user.id).maybeSingle()
        .then(({ data: biz }) => {
          if (!mounted) return
          if (!biz) return
          if (biz.status === 'active') {
            setBusiness(biz)
            setPendingActivation(false)
            setStripeSuccess(true)
            successTimer = setTimeout(() => { if (mounted) setStripeSuccess(false) }, 6000)
            return
          }
          if (attempts < MAX) timer = setTimeout(poll, DELAY)
        })
    }

    timer = setTimeout(poll, DELAY)
    return () => {
      mounted = false
      clearTimeout(timer)
      clearTimeout(successTimer)
    }
  }, [pendingActivation, user]) // eslint-disable-line

  const handleCheckout = async () => {
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setCheckoutError('Sessione scaduta. Effettua di nuovo il login.')
        setCheckoutLoading(false)
        return
      }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setCheckoutError('Errore nel caricamento del pagamento. Riprova o contatta info@piumapp.com.')
      }
    } catch {
      setCheckoutError('Errore nel caricamento del pagamento. Riprova o contatta info@piumapp.com.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const Section = {
    panoramica: Panoramica,
    editor:     EditorSito,
    servizi:    Servizi,
    social:     Social,
    recensioni: Recensioni,
    promemoria: Promemoria,
    agenda:     Agenda,
    clienti:    Clienti,
  }[section]

  useEffect(() => {
    if (!business?.id) return

    let mounted = true
    const businessId = business.id

    const fetchCount = () =>
      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .then(({ count }) => { if (mounted) setPendingCount(count ?? 0) })

    fetchCount()

    // Rifai il count solo quando il tab torna visibile — debounced per evitare refetch multipli
    let focusTimer = null
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return
      clearTimeout(focusTimer)
      focusTimer = setTimeout(fetchCount, 400)
    }
    document.addEventListener('visibilitychange', onFocus)

    const channel = supabase.channel(`pending-bookings-${businessId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bookings',
        filter: `business_id=eq.${businessId}`,
      }, async (payload) => {
        if (payload.new?.status !== 'pending') return
        let serviceName = 'un servizio'
        if (payload.new.service_id) {
          const { data: svc } = await supabase
            .from('services').select('name').eq('id', payload.new.service_id).maybeSingle()
          if (svc?.name) serviceName = svc.name
        }
        if (!mounted) return
        notifyNewBooking(payload.new.customer_name, serviceName, payload.new.appointment_date, payload.new.appointment_time)
        fetchCount()
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `business_id=eq.${businessId}`,
      }, () => { fetchCount() })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') console.error('[Realtime] bookings:', err)
      })

    return () => {
      mounted = false
      clearTimeout(focusTimer)
      document.removeEventListener('visibilitychange', onFocus)
      try { supabase.removeChannel(channel) } catch { /* già rimosso o non ancora connesso */ }
    }
  }, [business?.id]) // primitivo stabile — evita reconnessioni su ogni refresh dell'oggetto business

  const navigate_section = (id, opts = {}) => {
    if (id === 'agenda') setAgendaInitialView(opts.view ?? 'day')
    setSection(id)
    setSideOpen(false)
  }

  return (
    <div className="db-shell">

      {/* Mobile overlay */}
      {sideOpen && (
        <div className="db-overlay" onClick={() => setSideOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`db-sidebar ${sideOpen ? 'db-sidebar--open' : ''}`}>
        <div className="db-sidebar-top">
          <div className="db-brand">
            <div className="db-brand-icon">
              <IconHome />
            </div>
            <Logo className="db-brand-name" />
          </div>

          {business && (
            <div className="db-biz-pill">
              <div className="db-biz-avatar">
                {business.profile_image
                  ? <img src={business.profile_image} alt={business.name} className="db-biz-avatar-img" />
                  : (business.name?.[0]?.toUpperCase() ?? '?')
                }
              </div>
              <div className="db-biz-info">
                <span className="db-biz-name">{business.name}</span>
                <span className="db-biz-cat">{business.category ?? 'Attività'}</span>
              </div>
            </div>
          )}

          <nav className="db-nav">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`db-nav-item ${section === id ? 'db-nav-item--active' : ''}`}
                onClick={() => navigate_section(id)}
              >
                <Icon />
                <span>{label}</span>
                {id === 'agenda' && pendingCount > 0 && (
                  <span className="db-nav-badge">{pendingCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="db-sidebar-bottom">
          <div className="db-user-row">
            <div className="db-user-avatar">
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="db-user-info">
              <span className="db-user-email">{user?.email}</span>
            </div>
          </div>
          <div className="db-sidebar-actions">
            <Link to="/settings" className="db-icon-btn" title="Impostazioni">
              <IconSettings />
            </Link>
            <button className="db-icon-btn" onClick={handleSignOut} title="Esci">
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="db-main">
        {/* Topbar (mobile) */}
        <header className="db-topbar">
          <button className="db-menu-btn" onClick={() => setSideOpen(true)} aria-label="Apri menu">
            <IconMenu />
          </button>
          <span className="db-topbar-title">
            {NAV.find(n => n.id === section)?.label}
          </span>
          <div style={{ width: 36 }} />
        </header>

        {/* Page title (desktop) */}
        <div className="db-page-header">
          {section !== 'panoramica' && (
            <button className="db-back-btn" onClick={() => navigate_section('panoramica')}>
              <IconChevronLeft /> Panoramica
            </button>
          )}
          <h1 className="db-page-title">
            {NAV.find(n => n.id === section)?.label}
          </h1>
        </div>

        <main className="db-content">
          {adminMessages.length > 0 && (
            <div className="db-admin-message-banner">
              <span className="db-admin-message-icon">📢</span>
              <div className="db-admin-message-body">
                <span className="db-admin-message-text">{adminMessages[0].message}</span>
                {adminMessages[0].link_url && (
                  adminMessages[0].link_url.startsWith('/')
                    ? <button className="db-admin-message-link" onClick={() => { navigate(adminMessages[0].link_url); dismissAdminMessage(adminMessages[0]) }}>
                        {adminMessages[0].link_label || 'Scopri di più'}
                      </button>
                    : <a className="db-admin-message-link" href={adminMessages[0].link_url} target="_blank" rel="noopener noreferrer">
                        {adminMessages[0].link_label || 'Scopri di più'}
                      </a>
                )}
              </div>
              <button className="db-admin-message-close" onClick={() => dismissAdminMessage(adminMessages[0])} aria-label="Chiudi">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {loadError && (
            <div className="db-expired-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Errore di connessione. <button className="db-load-retry" onClick={() => window.location.reload()}>Ricarica la pagina</button>
            </div>
          )}

          {business?.status === 'expired' && (
            <div className="db-expired-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Il tuo periodo di prova è scaduto. Contatta <a href="mailto:info@piumapp.com">info@piumapp.com</a> per attivare il tuo piano.
            </div>
          )}

          {trialExpired && (
            <div className="db-trial-expired-banner">
              <div className="db-trial-banner-text">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>
                  <strong>Il tuo periodo di prova è terminato</strong>
                  {' — '}Per continuare ad usare PIUM abbonati al piano mensile.
                </span>
              </div>
              <button
                className="db-trial-btn"
                onClick={handleCheckout}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? 'Caricamento…' : 'Attiva ora'}
              </button>
            </div>
          )}

          {business?.status === 'trial' && !trialExpired && (
            <div className="db-trial-banner">
              <div className="db-trial-banner-text">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>
                  {business.trial_ends_at
                    ? <>Il tuo periodo gratuito scade il <strong>{formatTrialEnd(business.trial_ends_at)}</strong> —</>
                    : <>Stai usando PIUM in prova gratuita —</>
                  }
                  {' '}Attiva il piano a <strong>99€/mese</strong>
                </span>
              </div>
              <button
                className="db-trial-btn"
                onClick={handleCheckout}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? 'Caricamento…' : 'Attiva ora'}
              </button>
            </div>
          )}
          {checkoutError && (
            <div className="db-expired-banner" style={{ marginTop: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {checkoutError}
            </div>
          )}

          {stripeSuccess && (
            <div className="db-stripe-success">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
              Pagamento completato! Il tuo piano è ora attivo. Grazie per aver scelto PIUM.
            </div>
          )}
          {section !== 'panoramica' && (
            <button className="db-back-btn db-back-btn--mobile" onClick={() => navigate_section('panoramica')}>
              <IconChevronLeft /> Panoramica
            </button>
          )}
          {Section && (
            <ErrorBoundary key={section}>
              <Section business={business} user={user} onNavigate={navigate_section} pendingCount={pendingCount} initialView={agendaInitialView} />
            </ErrorBoundary>
          )}
        </main>
      </div>
    </div>
  )
}

/* ── Icons ── */
function IconGrid() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function IconPen() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
}
function IconBriefcase() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
}
function IconShare() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
}
function IconStar() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
}
function IconBell() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
}
function IconHome() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IconLogout() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
}
function IconMenu() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
}
function IconCalendar() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
}
function IconUsers() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function IconChevronLeft() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
}
function IconSettings() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
}
