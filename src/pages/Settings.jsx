import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

export default function Settings() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  // Password form
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdStatus, setPwdStatus] = useState('idle') // idle | saving | ok | error
  const [pwdError, setPwdError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { navigate('/auth', { replace: true }); return }
      setUser(data.user)
    })
  }, [navigate])

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
