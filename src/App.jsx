import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Landing    from './pages/Landing'
import Auth       from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard  from './pages/Dashboard'
import PublicSite from './pages/PublicSite'
import Admin      from './pages/Admin'

function PublicRoute({ children }) {
  const [status, setStatus] = useState('loading') // loading | authed | public

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? 'authed' : 'public')
    })
  }, [])

  if (status === 'loading') return null
  if (status === 'authed')  return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"           element={<PublicRoute><Landing /></PublicRoute>} />
        <Route path="/auth"       element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard"  element={<Dashboard />} />
        <Route path="/admin"      element={<Admin />} />
        <Route path="/site/:slug" element={<PublicSite />} />
      </Routes>
    </BrowserRouter>
  )
}
