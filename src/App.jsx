import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Landing    from './pages/Landing'
import Auth       from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard  from './pages/Dashboard'
import PublicSite from './pages/PublicSite'
import Admin      from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import Settings   from './pages/Settings'
import ResetPassword from './pages/ResetPassword'
import Affiliates     from './pages/Affiliates'
import AffiliatesAuth from './pages/AffiliatesAuth'
import Privacy from './pages/legal/Privacy'
import Termini from './pages/legal/Termini'
import Cookie from './pages/legal/Cookie'
import Dpa from './pages/legal/Dpa'
import ContrattoAffiliazione from './pages/legal/ContrattoAffiliazione'
import PWABanner      from './components/PWABanner'
import SupportBot     from './components/SupportBot'
import ErrorBoundary  from './components/ErrorBoundary'
import { scheduleAllTodayNotifications } from './lib/notifications'

function RefRedirect() {
  const { code } = useParams()
  if (code) localStorage.setItem('pium_ref', code.toLowerCase().trim())
  return <Navigate to="/auth" replace />
}

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

function NotificationScheduler() {
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: biz } = await supabase
        .from('businesses').select('id').eq('user_id', session.user.id).maybeSingle()
      if (!biz) return
      const today = new Date().toISOString().slice(0, 10)
      const { data: apts } = await supabase
        .from('appointments').select('*')
        .eq('business_id', biz.id).eq('date', today).eq('completed', false)
      scheduleAllTodayNotifications(apts ?? [])
    })
  }, [])
  return null
}

export default function App() {
  // Cloudflare Worker proxies mario.piumapp.com → www.piumapp.com transparently.
  // The browser hostname is still mario.piumapp.com, so we detect it here and
  // render PublicSite directly, bypassing PublicRoute which would redirect
  // authenticated users to /dashboard.
  const hostParts = window.location.hostname.split('.')
  const isSubdomain = hostParts.length >= 3 && hostParts[0] !== 'www'

  if (isSubdomain) {
    return (
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="*" element={<PublicSite />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <NotificationScheduler />
      <PWABanner />
      <SupportBot />
      <Routes>
        <Route path="/"           element={<PublicRoute><Landing /></PublicRoute>} />
        <Route path="/auth"       element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard"  element={<Dashboard />} />
        <Route path="/admin"           element={<Admin />} />
        <Route path="/x-admin-login"   element={<AdminLogin />} />
        <Route path="/settings"   element={<Settings />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/site/:slug"   element={<PublicSite />} />
        <Route path="/affiliates"      element={<Affiliates />} />
        <Route path="/affiliates/auth" element={<AffiliatesAuth />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/termini" element={<Termini />} />
        <Route path="/cookie" element={<Cookie />} />
        <Route path="/dpa" element={<Dpa />} />
        <Route path="/contratto-affiliazione" element={<ContrattoAffiliazione />} />
        <Route path="/ref/:code"    element={<RefRedirect />} />
        <Route path="/:slug"        element={<PublicSite />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
