import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

export default function ResetPassword() {
  const [status, setStatus] = useState('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return
      setStatus(session ? 'ready' : 'invalid')
    })
    return () => { alive = false }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La password deve essere di almeno 6 caratteri.')
      return
    }
    if (password !== confirm) {
      setError('Le password non coincidono.')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (error) {
      setError(error.message || 'Impossibile aggiornare la password. Riprova.')
      return
    }

    try {
      await supabase.auth.signOut()
    } catch {
      // La password e' gia' stata aggiornata: il logout non deve bloccare il flusso.
    }

    setStatus('success')
    setPassword('')
    setConfirm('')
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <Logo className="auth-brand-name" />
        </div>

        <h1 className="auth-title">Reset password</h1>

        {status === 'checking' && (
          <p className="auth-subtitle">Verifica del link in corso...</p>
        )}

        {status === 'invalid' && (
          <>
            <p className="auth-subtitle">
              Link non valido o scaduto. Richiedi un nuovo reset password.
            </p>
            <Link className="auth-submit" to="/auth">Torna al login</Link>
          </>
        )}

        {status === 'ready' && (
          <>
            <p className="auth-subtitle">Scegli una nuova password per il tuo account.</p>
            <form onSubmit={handleSubmit} noValidate>
              <div className="auth-fields">
                <div className="auth-field">
                  <label htmlFor="reset-password" className="auth-label">Nuova password</label>
                  <input
                    id="reset-password"
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    placeholder="Minimo 6 caratteri"
                    autoComplete="new-password"
                    required
                    className="auth-input"
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="reset-confirm" className="auth-label">Conferma password</label>
                  <input
                    id="reset-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError('') }}
                    placeholder="Ripeti la nuova password"
                    autoComplete="new-password"
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              {error && (
                <div className="auth-error" role="alert">
                  <IconAlert />
                  {error}
                </div>
              )}

              <button type="submit" disabled={saving} className="auth-submit">
                {saving ? 'Salvataggio...' : 'Aggiorna password'}
              </button>
            </form>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="auth-success" role="status">
              Password aggiornata correttamente. Ora accedi con la nuova password.
            </div>
            <p className="auth-switch">
              <Link className="auth-link-btn auth-link-btn--accent" to="/auth">Torna al login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function IconAlert() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}
