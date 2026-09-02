import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import { requestPermission, testNotification } from '../lib/notifications'
import { subscribePush, unsubscribePush, isPushSubscribed } from '../lib/pushSubscription'
import { translateError } from '../lib/errors'
import { useStripeCheckout } from '../lib/useStripeCheckout'
import { isBusinessBlocked } from '../lib/businessGate'
import SubscriptionGate from '../components/SubscriptionGate'

// Stati che possono raggiungere questa pagina: isBusinessBlocked intercetta
// suspended/expired/trial_expired prima del render (vedi sotto), qui restano solo trial/active.
const STATUS_LABEL = {
  trial:  { label: 'Prova gratuita', cls: 'sett-badge--off' },
  active: { label: 'Attivo',         cls: 'sett-badge--on'  },
}

const NOTIF_KEY = 'pium_notification_settings'
const DEFAULT_NOTIF = { appointmentMinutesBefore: 15, notifyNextOnComplete: false }

export default function Settings() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [business, setBusiness] = useState(null)
  const { checkoutLoading, checkoutError, handleCheckout } = useStripeCheckout()

  const [email, setEmail]           = useState('')
  const [emailStatus, setEmailStatus] = useState('idle')
  const [emailError, setEmailError]   = useState('')

  const [pwd, setPwd]           = useState({ current: '', next: '', confirm: '' })
  const [pwdStatus, setPwdStatus] = useState('idle')
  const [pwdError, setPwdError] = useState('')

  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false)
  const [logoutAllStatus, setLogoutAllStatus]   = useState('idle')

  const [notifPerm, setNotifPerm] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  const [notifSettings, setNotifSettings] = useState(() => {
    try { return { ...DEFAULT_NOTIF, ...JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '{}') } }
    catch { return DEFAULT_NOTIF }
  })
  const [notifSaved, setNotifSaved]   = useState(false)
  const [testStatus, setTestStatus]   = useState('idle')
  const [pushSub, setPushSub]         = useState(null)
  const [pushStatus, setPushStatus]   = useState('idle')

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return
      if (!data.user) { navigate('/auth', { replace: true }); return }
      setUser(data.user)
      supabase
        .from('businesses')
        .select('status, trial_ends_at, stripe_subscription_id')
        .eq('user_id', data.user.id)
        .maybeSingle()
        .then(({ data: biz }) => { if (alive && biz) setBusiness(biz) })
    })
    return () => { alive = false }
  }, [navigate])

  useEffect(() => {
    let alive = true
    isPushSubscribed().then(v => { if (alive) setPushSub(v) })
    return () => { alive = false }
  }, [])

  const handleSubscribePush = async () => {
    setPushStatus('saving')
    const res = await subscribePush()
    if (res?.ok) { setPushSub(true); setPushStatus('idle') }
    else setPushStatus('error')
  }

  const handleUnsubscribePush = async () => {
    setPushStatus('saving')
    await unsubscribePush()
    setPushSub(false)
    setPushStatus('idle')
  }

  const handleRequestPermission = async () => {
    const result = await requestPermission()
    setNotifPerm(result)
  }

  const setNotif = useCallback((k, v) => {
    setNotifSettings(prev => {
      const next = { ...prev, [k]: v }
      localStorage.setItem(NOTIF_KEY, JSON.stringify(next))
      return next
    })
    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 1500)
  }, [])

  const handleTestNotification = async () => {
    setTestStatus('idle')
    const ok = await testNotification()
    setTestStatus(ok ? 'sent' : 'error')
    setTimeout(() => setTestStatus('idle'), 3000)
  }

  const handleEmailSave = async (e) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) { setEmailError('Inserisci la nuova email.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setEmailError('Email non valida.'); return }
    if (trimmed === user?.email) { setEmailError('È già la tua email attuale.'); return }
    setEmailStatus('saving')
    const { error } = await supabase.auth.updateUser({ email: trimmed })
    if (error) { setEmailError(translateError(error.message)); setEmailStatus('error') }
    else { setEmailStatus('ok'); setEmail('') }
  }

  const setP = (k, v) => { setPwd(p => ({ ...p, [k]: v })); setPwdError('') }

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    if (!pwd.current.trim()) { setPwdError('Inserisci la password attuale.'); return }
    if (!pwd.next.trim()) { setPwdError('Inserisci la nuova password.'); return }
    if (pwd.next.length < 6) { setPwdError('La password deve essere di almeno 6 caratteri.'); return }
    if (pwd.next !== pwd.confirm) { setPwdError('Le password non coincidono.'); return }
    setPwdStatus('saving')
    // updateUser non richiede la vecchia password: la verifichiamo esplicitamente
    // ri-autenticando l'utente prima di consentire il cambio.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email:    user?.email,
      password: pwd.current,
    })
    if (reauthError) {
      setPwdError('La password attuale non è corretta.')
      setPwdStatus('error')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: pwd.next })
    if (error) { setPwdError(translateError(error.message)); setPwdStatus('error') }
    else { setPwdStatus('ok'); setPwd({ current: '', next: '', confirm: '' }) }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  // Termina TUTTE le sessioni, inclusa quella corrente (scope 'global'), a differenza
  // del cambio password che di proposito non disconnette nessuno (vedi handlePasswordSave).
  const handleSignOutAll = async () => {
    setLogoutAllStatus('saving')
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      setLogoutAllStatus('error')
      return
    }
    navigate('/auth', { replace: true })
  }

  const notifActive = notifPerm === 'granted'

  // Stesso gate di Dashboard.jsx: da bloccato, /settings non deve esporre
  // NULLA (email, password, notifiche, logout-tutti) oltre al pagamento —
  // altrimenti sarebbe una via per aggirare il blocco della dashboard.
  if (isBusinessBlocked(business)) {
    return (
      <SubscriptionGate
        checkoutLoading={checkoutLoading}
        checkoutError={checkoutError}
        onCheckout={handleCheckout}
      />
    )
  }

  return (
    <div className="sett-shell">
      <header className="sett-header">
        <Link to="/dashboard" className="sett-back">
          <IconChevronLeft /> Dashboard
        </Link>
        <Logo />
      </header>

      <main className="sett-main">
        <h1 className="sett-title">Impostazioni</h1>

        {/* ── Abbonamento — punto fisso per gestire/rinnovare in anticipo da
             trial o active, senza aspettare che il banner in Dashboard scompaia
             o perda il bottone. Da suspended/expired non si arriva qui: il gate
             sopra ha già intercettato con la sola opzione di pagare. ── */}
        <section className="sett-card">
          <div className="sett-section-header">
            <span className="sett-section-icon"><IconCard /></span>
            <h2 className="sett-section-title">Abbonamento</h2>
            {business?.status && (
              <span className={`sett-badge ${STATUS_LABEL[business.status]?.cls ?? 'sett-badge--off'}`}>
                {STATUS_LABEL[business.status]?.label ?? business.status}
              </span>
            )}
          </div>

          <p className="sett-notif-hint">
            {business?.status === 'active'
              ? "Il tuo piano è attivo. Puoi comunque gestire l'abbonamento da qui in qualsiasi momento."
              : 'Attiva o rinnova il piano PIUM per continuare a usare tutte le funzioni.'}
          </p>

          <button
            className="sett-btn-primary sett-btn-primary--full"
            onClick={handleCheckout}
            disabled={checkoutLoading}
          >
            <IconCard /> {checkoutLoading ? 'Caricamento…' : 'Attiva / Rinnova abbonamento'}
          </button>

          {checkoutError && <p className="sett-error"><IconAlert /> {checkoutError}</p>}
        </section>

        {/* ── Notifiche ── */}
        <section className="sett-card">
          <div className="sett-section-header">
            <span className="sett-section-icon"><IconBell /></span>
            <h2 className="sett-section-title">Notifiche</h2>
            {notifActive
              ? <span className="sett-badge sett-badge--on">Attivo</span>
              : <span className="sett-badge sett-badge--off">Non attivo</span>
            }
          </div>

          {notifPerm === 'unsupported' && (
            <p className="sett-notif-hint">Le notifiche non sono supportate su questo browser.</p>
          )}

          {notifPerm !== 'unsupported' && !notifActive && (
            <div className="sett-notif-cta">
              <p className="sett-notif-hint">Attiva le notifiche per ricevere promemoria appuntamenti e avvisi di nuove prenotazioni.</p>
              <button className="sett-btn-primary sett-btn-primary--full" onClick={handleRequestPermission}>
                <IconBell /> Attiva notifiche
              </button>
            </div>
          )}

          {notifActive && (
            <>
              <div className="sett-field">
                <label className="sett-label">Promemoria prima dell'appuntamento</label>
                <select
                  className="sett-select"
                  value={notifSettings.appointmentMinutesBefore}
                  onChange={e => setNotif('appointmentMinutesBefore', Number(e.target.value))}
                >
                  <option value={0}>Al momento esatto</option>
                  <option value={1}>1 minuto prima</option>
                  <option value={5}>5 minuti prima</option>
                  <option value={15}>15 minuti prima</option>
                  <option value={30}>30 minuti prima</option>
                  <option value={60}>1 ora prima</option>
                  <option value={120}>2 ore prima</option>
                </select>
              </div>

              <div className="sett-toggle-row">
                <span className="sett-label">Avvisami del prossimo appuntamento dopo aver completato uno</span>
                <button
                  className={`sett-toggle ${notifSettings.notifyNextOnComplete ? 'sett-toggle--on' : ''}`}
                  onClick={() => setNotif('notifyNextOnComplete', !notifSettings.notifyNextOnComplete)}
                  aria-pressed={notifSettings.notifyNextOnComplete}
                >
                  <span className="sett-toggle-thumb" />
                </button>
              </div>

              {'PushManager' in window && pushSub !== null && (
                <div className="sett-toggle-row">
                  <div>
                    <span className="sett-label">Notifiche anche con il telefono in tasca</span>
                    <p className="sett-notif-hint" style={{ margin: '3px 0 0' }}>Ricevi avvisi anche con il browser chiuso</p>
                  </div>
                  <button
                    className={`sett-toggle ${pushSub ? 'sett-toggle--on' : ''}`}
                    onClick={pushSub ? handleUnsubscribePush : handleSubscribePush}
                    disabled={pushStatus === 'saving'}
                    aria-pressed={pushSub}
                  >
                    <span className="sett-toggle-thumb" />
                  </button>
                </div>
              )}

              {pushStatus === 'error' && (
                <p className="sett-error"><IconAlert /> Errore attivazione push. Riprova.</p>
              )}

              {notifSaved && (
                <p className="sett-success"><IconCheck /> Impostazioni salvate</p>
              )}

              <button
                className="sett-test-link"
                onClick={handleTestNotification}
                disabled={testStatus === 'sent'}
              >
                {testStatus === 'sent' ? '✓ Notifica inviata' : testStatus === 'error' ? 'Abilita le notifiche prima' : 'Invia una notifica di prova'}
              </button>
            </>
          )}
        </section>

        {/* ── Account ── */}
        <section className="sett-card">
          <div className="sett-section-header">
            <span className="sett-section-icon"><IconUser /></span>
            <h2 className="sett-section-title">Account</h2>
          </div>

          <div className="sett-field">
            <label className="sett-label">Email attuale</label>
            <div className="sett-email">{user?.email ?? '…'}</div>
          </div>

          <h3 className="sett-subsection-title">Cambia email</h3>
          <form onSubmit={handleEmailSave} noValidate className="sett-pwd-form">
            <div className="sett-field">
              <label className="sett-label" htmlFor="sett-email-new">Nuova email</label>
              <input
                id="sett-email-new"
                className="sett-input"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError(''); setEmailStatus('idle') }}
                placeholder="nuova@email.com"
                autoComplete="email"
              />
            </div>
            {emailError && <p className="sett-error"><IconAlert /> {emailError}</p>}
            {emailStatus === 'ok' && (
              <p className="sett-success">
                <IconCheck /> Controlla la tua nuova email: ti abbiamo inviato un link di conferma. Il cambio sarà attivo dopo la conferma.
              </p>
            )}
            <button className="sett-btn-primary" type="submit" disabled={emailStatus === 'saving'}>
              {emailStatus === 'saving' ? 'Salvataggio…' : 'Aggiorna email'}
            </button>
          </form>

          <div className="sett-divider" />

          <h3 className="sett-subsection-title">Cambia password</h3>
          <form onSubmit={handlePasswordSave} noValidate className="sett-pwd-form">
            <div className="sett-field">
              <label className="sett-label" htmlFor="sett-pwd-current">Password attuale</label>
              <input
                id="sett-pwd-current"
                className="sett-input"
                type="password"
                value={pwd.current}
                onChange={e => setP('current', e.target.value)}
                placeholder="La tua password attuale"
                autoComplete="current-password"
              />
            </div>
            <div className="sett-field">
              <label className="sett-label" htmlFor="sett-pwd-next">Nuova password</label>
              <input
                id="sett-pwd-next"
                className="sett-input"
                type="password"
                value={pwd.next}
                onChange={e => setP('next', e.target.value)}
                placeholder="Minimo 6 caratteri"
                autoComplete="new-password"
              />
            </div>
            <div className="sett-field">
              <label className="sett-label" htmlFor="sett-pwd-confirm">Conferma nuova password</label>
              <input
                id="sett-pwd-confirm"
                className="sett-input"
                type="password"
                value={pwd.confirm}
                onChange={e => setP('confirm', e.target.value)}
                placeholder="Ripeti la nuova password"
                autoComplete="new-password"
              />
            </div>
            {pwdError && <p className="sett-error"><IconAlert /> {pwdError}</p>}
            {pwdStatus === 'ok' && <p className="sett-success"><IconCheck /> Password aggiornata.</p>}
            <button className="sett-btn-primary" type="submit" disabled={pwdStatus === 'saving'}>
              {pwdStatus === 'saving' ? 'Salvataggio…' : 'Aggiorna password'}
            </button>
          </form>

          <div className="sett-divider" />

          <h3 className="sett-subsection-title">Disconnetti tutti i dispositivi</h3>
          <p className="sett-notif-hint" style={{ margin: '0 0 12px' }}>
            Termina tutte le sessioni attive, incluse quelle su altri dispositivi e su questo stesso dispositivo.
          </p>
          {!confirmLogoutAll ? (
            <button className="sett-btn-danger" type="button" onClick={() => setConfirmLogoutAll(true)}>
              <IconLogout /> Disconnetti tutti i dispositivi
            </button>
          ) : (
            <div className="sett-field">
              <p className="sett-error" style={{ marginBottom: 10 }}>
                <IconAlert /> Sei sicuro? Dovrai rifare l'accesso ovunque, incluso questo dispositivo.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button className="sett-btn-danger" type="button" onClick={handleSignOutAll} disabled={logoutAllStatus === 'saving'}>
                  {logoutAllStatus === 'saving' ? 'Disconnessione…' : 'Sì, disconnetti tutti'}
                </button>
                <button className="sett-test-link" type="button" onClick={() => setConfirmLogoutAll(false)}>Annulla</button>
              </div>
            </div>
          )}
          {logoutAllStatus === 'error' && (
            <p className="sett-error" style={{ marginTop: 10 }}><IconAlert /> Errore durante la disconnessione. Riprova.</p>
          )}
        </section>

        {/* ── Esci ── */}
        <section className="sett-card sett-card--danger">
          <div className="sett-section-header">
            <span className="sett-section-icon sett-section-icon--danger"><IconLogout /></span>
            <h2 className="sett-section-title">Esci</h2>
          </div>
          <p className="sett-danger-desc">Verrai disconnesso da questo dispositivo.</p>
          <button className="sett-btn-danger" onClick={handleSignOut}>
            <IconLogout /> Esci dall'account
          </button>
        </section>
      </main>
    </div>
  )
}

function IconCard() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
}
function IconBell() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
}
function IconUser() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
function IconChevronLeft() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
}
function IconLogout() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
}
function IconCheck() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function IconAlert() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
}
