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
import Affiliates     from './pages/Affiliates'
import AffiliatesAuth from './pages/AffiliatesAuth'
import PWABanner      from './components/PWABanner'
import SupportBot     from './components/SupportBot'
import { scheduleAllTodayNotifications } from './lib/notifications'

function RefRedirect() {
  const { code } = useParams()
  if (code) localStorage.setItem('pium_ref', code)
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
  return (
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
        <Route path="/site/:slug"   element={<PublicSite />} />
        <Route path="/affiliates"      element={<Affiliates />} />
        <Route path="/affiliates/auth" element={<AffiliatesAuth />} />
        <Route path="/ref/:code"    element={<RefRedirect />} />
      </Routes>
    </BrowserRouter>
  )
}
