import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import { translateError } from '../lib/errors'

const FIELDS = {
  login: [
    { id: 'email',    label: 'Email',    type: 'email',    placeholder: 'nome@esempio.it',  autoComplete: 'email' },
    { id: 'password', label: 'Password', type: 'password', placeholder: '••••••••',         autoComplete: 'current-password' },
  ],
  register: [
    { id: 'name',     label: 'Nome completo', type: 'text',     placeholder: 'Mario Rossi',      autoComplete: 'name' },
    { id: 'email',    label: 'Email',         type: 'email',    placeholder: 'nome@esempio.it',  autoComplete: 'email' },
    { id: 'password', label: 'Password',      type: 'password', placeholder: '••••••••',         autoComplete: 'new-password' },
  ],
}

export default function Auth() {
  const navigate   = useNavigate()
  const [mode, setMode]       = useState('login')
  const [values, setValues]   = useState({ name: '', email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const pendingRef = useRef(false)

  useEffect(() => {
    // Salva codice referral se presente nell'URL (?ref=CODICE)
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) localStorage.setItem('pium_ref', ref.toLowerCase().trim())

    let alive = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive || !session) return
      const role = session.user?.app_metadata?.role
      navigate(role === 'admin' ? '/admin' : '/dashboard', { replace: true })
    })
    return () => { alive = false }
  }, [navigate])

  const set = (id) => (e) => setValues((v) => ({ ...v, [id]: e.target.value }))

  const switchMode = (next) => {
    pendingRef.current = false
    setMode(next)
    setError(null)
    setLegalAccepted(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (pendingRef.current) return

    if (!values.email.includes('@')) { setError('Inserisci un\'email valida.'); return }
    if (values.password.length < 6)  { setError('La password deve essere di almeno 6 caratteri.'); return }
    if (mode === 'register' && !legalAccepted) {
      setError('Devi accettare i Termini di Servizio, il DPA e confermare la presa visione della Privacy Policy.')
      return
    }

    pendingRef.current = true
    setLoading(true)
    setError(null)

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        })
        if (error) {
          setError(translateError(error.message))
        } else {
          const role = data.user?.app_metadata?.role
          navigate(role === 'admin' ? '/admin' : '/dashboard', { replace: true })
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: { full_name: values.name },
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        })
        if (error) {
          setError(translateError(error.message))
        } else {
          if (data.session) {
            navigate('/onboarding', { replace: true })
          } else {
            setConfirmed(true)
          }
        }
      }
    } finally {
      pendingRef.current = false
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">

        {/* Brand */}
        <div className="auth-brand">
          <div className="auth-logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <Logo className="auth-brand-name" />
        </div>

        <h1 className="auth-title">
          {mode === 'login' ? 'Bentornato' : 'Crea il tuo account'}
        </h1>
        <p className="auth-subtitle">
          {mode === 'login'
            ? 'Accedi per gestire la tua attività.'
            : 'Inizia gratis. Nessuna carta richiesta.'}
        </p>

        {/* Mode toggle */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Accedi
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`}
            onClick={() => switchMode('register')}
          >
            Registrati
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-fields">
            {FIELDS[mode].map(({ id, label, type, placeholder, autoComplete }) => (
              <div key={id} className="auth-field">
                <label htmlFor={id} className="auth-label">{label}</label>
                <div className="auth-input-wrap">
                  <input
                    id={id}
                    type={id === 'password' && showPwd ? 'text' : type}
                    value={values[id]}
                    onChange={set(id)}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    required
                    className="auth-input"
                  />
                  {id === 'password' && (
                    <button
                      type="button"
                      className="auth-pwd-toggle"
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? 'Nascondi password' : 'Mostra password'}
                    >
                      {showPwd
                        ? <EyeOff />
                        : <Eye />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {mode === 'login' && (
            <div className="auth-forgot">
              <button type="button" className="auth-link-btn" onClick={handleForgotPassword}>
                Password dimenticata?
              </button>
            </div>
          )}

          {confirmed && (
            <div className="auth-success" role="status">
              ✓ Email inviata! Controlla la tua casella di posta.
            </div>
          )}

          {mode === 'register' && (
            <label className="auth-legal-check">
              <input
                type="checkbox"
                checked={legalAccepted}
                onChange={(e) => setLegalAccepted(e.target.checked)}
              />
              <span>
                Accetto i <Link to="/termini">Termini di Servizio</Link> e il <Link to="/dpa">DPA</Link>, inclusi gli obblighi relativi al caricamento di dati dei miei clienti, rubriche telefoniche e immagini, e dichiaro di aver preso visione della <Link to="/privacy">Privacy Policy</Link>.
              </span>
            </label>
          )}

          {error && (
            <div className="auth-error" role="alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading
              ? <Spinner />
              : mode === 'login' ? 'Accedi' : 'Crea account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'Non hai un account?' : 'Hai già un account?'}{' '}
          <button
            type="button"
            className="auth-link-btn auth-link-btn--accent"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Registrati' : 'Accedi'}
          </button>
        </p>
      </div>
    </div>
  )

  async function handleForgotPassword() {
    if (!values.email) {
      setError('Inserisci la tua email per reimpostare la password.')
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError(translateError(error.message))
    } else {
      setError(null)
      setConfirmed(true)
    }
  }
}


function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="auth-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}

