import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [values,  setValues]  = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const set = (id) => (e) => setValues(v => ({ ...v, [id]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email:    values.email,
      password: values.password,
    })

    if (signInError) {
      setError('Credenziali non valide.')
      setLoading(false)
      return
    }

    if (data.user?.app_metadata?.role !== 'admin') {
      await supabase.auth.signOut()
      setError('Accesso negato.')
      setLoading(false)
      return
    }

    navigate('/admin', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360, padding: '40px 32px', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-h)', margin: '0 0 8px' }}>Accesso riservato</h1>
        <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 28px' }}>Inserisci le credenziali per continuare.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-h)', marginBottom: 6 }}>Email</label>
              <input
                className="auth-input"
                type="email"
                value={values.email}
                onChange={set('email')}
                placeholder="nome@esempio.it"
                autoComplete="email"
                autoFocus
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-h)', marginBottom: 6 }}>Password</label>
              <input
                className="auth-input"
                type="password"
                value={values.password}
                onChange={set('password')}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {error && (
            <div className="auth-error" role="alert" style={{ marginBottom: 16 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? <Spinner /> : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Spinner() {
  return <svg className="auth-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
