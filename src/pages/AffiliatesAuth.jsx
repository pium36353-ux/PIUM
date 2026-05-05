import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

function generateCode(name) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 3)
  const rand = Math.random().toString(36).slice(2, 6)
  return (base || 'aff') + rand
}

export default function AffiliatesAuth() {
  const navigate = useNavigate()
  const [mode,    setMode]    = useState('login')
  const [values,  setValues]  = useState({ name: '', email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,      setError]      = useState(null)
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/affiliates', { replace: true })
    })
  }, [navigate])

  const set = (id) => (e) => setValues(v => ({ ...v, [id]: e.target.value }))
  const switchMode = (next) => { setMode(next); setError(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email, password: values.password,
      })
      if (error) setError(translateError(error.message))
      else       navigate('/affiliates', { replace: true })
    } else {
      const { data: authData, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { data: { full_name: values.name } },
      })
      if (error) {
        setError(error.status === 422 ? error.message : translateError(error.message))
      } else {
        const code = generateCode(values.name)
        await supabase.from('affiliates').insert({
          user_id: authData.user.id,
          code,
          name:    values.name.trim(),
          email:   values.email.trim(),
          status:  'pending',
        })
        setRegistered(true)
      }
    }

    setLoading(false)
  }

  if (registered) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand"><Logo className="auth-brand-name" /></div>
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>✓</div>
            <h1 className="auth-title">Registrazione ricevuta!</h1>
            <p className="auth-subtitle">Ti contatteremo presto per attivare il tuo account affiliato.</p>
            <Link to="/affiliates" style={{ display: 'inline-block', marginTop: 20, color: 'var(--accent)', textDecoration: 'underline', fontSize: 14 }}>
              ← Torna alla pagina affiliati
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">

        <div className="auth-brand">
          <Logo className="auth-brand-name" />
        </div>

        <h1 className="auth-title">
          {mode === 'login' ? 'Accedi — Area Affiliati' : 'Registrati come affiliato'}
        </h1>
        <p className="auth-subtitle">
          {mode === 'login'
            ? 'Accedi per gestire la tua dashboard affiliati.'
            : 'Crea un account per unirti al programma affiliati PIUM.'}
        </p>

        <div className="auth-tabs">
          <button type="button" className={`auth-tab ${mode === 'login'    ? 'auth-tab--active' : ''}`} onClick={() => switchMode('login')}>Accedi</button>
          <button type="button" className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`} onClick={() => switchMode('register')}>Registrati</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-fields">
            {mode === 'register' && (
              <div className="auth-field">
                <label htmlFor="aff-name" className="auth-label">Nome completo</label>
                <input id="aff-name" className="auth-input" type="text" value={values.name} onChange={set('name')} placeholder="Mario Rossi" autoComplete="name" required />
              </div>
            )}
            <div className="auth-field">
              <label htmlFor="aff-email" className="auth-label">Email</label>
              <input id="aff-email" className="auth-input" type="email" value={values.email} onChange={set('email')} placeholder="nome@esempio.it" autoComplete="email" required />
            </div>
            <div className="auth-field">
              <label htmlFor="aff-pwd" className="auth-label">Password</label>
              <div className="auth-input-wrap">
                <input
                  id="aff-pwd"
                  className="auth-input"
                  type={showPwd ? 'text' : 'password'}
                  value={values.password}
                  onChange={set('password')}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
                <button type="button" className="auth-pwd-toggle" onClick={() => setShowPwd(v => !v)} aria-label={showPwd ? 'Nascondi' : 'Mostra'}>
                  {showPwd ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="auth-error" role="alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? <Spinner /> : mode === 'login' ? 'Accedi' : 'Crea account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'Non hai un account?' : 'Hai già un account?'}{' '}
          <button type="button" className="auth-link-btn auth-link-btn--accent" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Registrati' : 'Accedi'}
          </button>
        </p>

        <p style={{ textAlign: 'center', marginTop: 8, fontSize: 13 }}>
          <Link to="/affiliates" style={{ color: 'var(--text)', textDecoration: 'underline' }}>← Torna alla pagina affiliati</Link>
        </p>
      </div>
    </div>
  )
}

function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email o password errati.'
  if (msg.includes('Email not confirmed'))       return 'Conferma la tua email prima di accedere.'
  if (msg.includes('User already registered'))   return 'Questo indirizzo email è già registrato.'
  if (msg.includes('Password should be'))        return 'La password deve essere di almeno 6 caratteri.'
  return msg
}

function Eye() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function EyeOff() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
}
function Spinner() {
  return <svg className="auth-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
