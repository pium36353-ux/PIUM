import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import { requestPermission, testNotification } from '../lib/notifications'

const NOTIF_KEY = 'pium_notification_settings'
const DEFAULT_NOTIF = { appointmentMinutesBefore: 15, notifyNextOnComplete: false }

export default function Settings() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  // Password form
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdStatus, setPwdStatus] = useState('idle') // idle | saving | ok | error
  const [pwdError, setPwdError] = useState('')

  // Notification settings
  const [notifPerm, setNotifPerm] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  const [notifSettings, setNotifSettings] = useState(() => {
    try { return { ...DEFAULT_NOTIF, ...JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '{}') } }
    catch { return DEFAULT_NOTIF }
  })
  const [notifSaved, setNotifSaved] = useState(false)
  const [testStatus, setTestStatus] = useState('idle') // idle | sent | error

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { navigate('/auth', { replace: true }); return }
      setUser(data.user)
    })
  }, [navigate])

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

  const setP = (k, v) => { setPwd(p => ({ ...p, [k]: v })); setPwdError('') }

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    if (!pwd.next.trim()) { setPwdError('Inserisci la nuova password.'); return }
    if (pwd.next.length < 6) { setPwdError('La password deve essere di almeno 6 caratteri.'); return }
    if (pwd.next !== pwd.confirm) { setPwdError('Le password non coincidono.'); return }

    setPwdStatus('saving')
    const { error } = await supabase.auth.updateUser({ password: pwd.next })
    if (error) {
      setPwdError(error.message)
      setPwdStatus('error')
    } else {
      setPwdStatus('ok')
      setPwd({ current: '', next: '', confirm: '' })
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
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

        {/* Account info */}
        <section className="sett-card">
          <h2 className="sett-section-title">Account</h2>
          <div className="sett-field">
            <label className="sett-label">Email</label>
            <div className="sett-email">{user?.email ?? '…'}</div>
          </div>
        </section>

        {/* Password */}
        <section className="sett-card">
          <h2 className="sett-section-title">Cambia password</h2>
          <form onSubmit={handlePasswordSave} noValidate>
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

            {pwdError && (
              <p className="sett-error"><IconAlert /> {pwdError}</p>
            )}
            {pwdStatus === 'ok' && (
              <p className="sett-success"><IconCheck /> Password aggiornata.</p>
            )}

            <button className="sett-btn-primary" type="submit" disabled={pwdStatus === 'saving'}>
              {pwdStatus === 'saving' ? 'Salvataggio…' : 'Aggiorna password'}
            </button>
          </form>
        </section>

        {/* Notifications */}
        <section className="sett-card">
          <h2 className="sett-section-title">Notifiche</h2>

          {notifPerm === 'unsupported' && (
            <p className="sett-notif-hint">Le notifiche non sono supportate su questo browser.</p>
          )}

          {notifPerm !== 'unsupported' && notifPerm !== 'granted' && (
            <div className="sett-field">
              <p className="sett-notif-hint">Attiva le notifiche per ricevere promemoria appuntamenti.</p>
              <button className="sett-btn-primary" onClick={handleRequestPermission}>
                <IconBell /> Attiva notifiche
              </button>
            </div>
          )}

          {notifPerm === 'granted' && (
            <>
              <p className="sett-notif-hint sett-notif-granted">✓ Notifiche attive</p>

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
                <span className="sett-label">Notifica prossimo appuntamento dopo spunta</span>
                <button
                  className={`sett-toggle ${notifSettings.notifyNextOnComplete ? 'sett-toggle--on' : ''}`}
                  onClick={() => setNotif('notifyNextOnComplete', !notifSettings.notifyNextOnComplete)}
                  aria-pressed={notifSettings.notifyNextOnComplete}
                >
                  <span className="sett-toggle-thumb" />
                </button>
              </div>

              {notifSaved && (
                <p className="sett-success" style={{ marginTop: 8 }}><IconCheck /> Impostazioni salvate</p>
              )}

              <button
                className="sett-btn-primary"
                onClick={handleTestNotification}
                style={{ marginTop: 12 }}
                disabled={testStatus === 'sent'}
              >
                <IconBell />
                {testStatus === 'sent' ? 'Notifica inviata ✓' : testStatus === 'error' ? 'Abilita notifiche prima' : 'Invia notifica di prova'}
              </button>
            </>
          )}
        </section>

        {/* Logout */}
        <section className="sett-card sett-card--danger">
          <h2 className="sett-section-title">Esci</h2>
          <p className="sett-danger-desc">Verrai disconnesso da questo dispositivo.</p>
          <button className="sett-btn-danger" onClick={handleSignOut}>
            <IconLogout /> Esci dall'account
          </button>
        </section>
      </main>
    </div>
  )
}

function IconBell() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
}
function IconChevronLeft() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
}
function IconLogout() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
}
function IconCheck() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function IconAlert() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
}
