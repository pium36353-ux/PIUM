import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing    from './pages/Landing'
import Auth       from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard  from './pages/Dashboard'
import PublicSite from './pages/PublicSite'
import Admin      from './pages/Admin'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"           element={<Landing />} />
        <Route path="/auth"       element={<Auth />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard"  element={<Dashboard />} />
        <Route path="/admin"      element={<Admin />} />
        <Route path="/b/:slug"    element={<PublicSite />} />
      </Routes>
    </BrowserRouter>
  )
}
