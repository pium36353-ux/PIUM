import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const set = (id) => (e) => setValues((v) => ({ ...v, [id]: e.target.value }))

  const switchMode = (next) => {
    setMode(next)
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      })
      if (error) {
        setError(translateError(error.message))
      } else {
        navigate('/dashboard')
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { data: { full_name: values.name } },
      })
      if (error) {
        setError(translateError(error.message))
      } else {
        navigate('/onboarding')
      }
    }

    setLoading(false)
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
          <span className="auth-brand-name">PIUM</span>
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

function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email o password errati.'
  if (msg.includes('Email not confirmed'))       return 'Conferma la tua email prima di accedere.'
  if (msg.includes('User already registered'))   return 'Questo indirizzo email è già registrato.'
  if (msg.includes('Password should be'))        return 'La password deve essere di almeno 6 caratteri.'
  if (msg.includes('Unable to validate'))        return 'Email non valida.'
  return msg
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
