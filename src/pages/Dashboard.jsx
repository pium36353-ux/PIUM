import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Panoramica  from '../components/dashboard/Panoramica'
import EditorSito  from '../components/dashboard/EditorSito'
import Servizi     from '../components/dashboard/Servizi'
import Social      from '../components/dashboard/Social'
import Recensioni  from '../components/dashboard/Recensioni'
import Promemoria  from '../components/dashboard/Promemoria'

const NAV = [
  { id: 'panoramica', label: 'Panoramica',  icon: IconGrid },
  { id: 'editor',     label: 'Editor Sito', icon: IconPen },
  { id: 'servizi',    label: 'Servizi',     icon: IconBriefcase },
  { id: 'social',     label: 'Social',      icon: IconShare },
  { id: 'recensioni', label: 'Recensioni',  icon: IconStar },
  { id: 'promemoria', label: 'Promemoria',  icon: IconBell },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [section, setSection]   = useState('panoramica')
  const [user, setUser]         = useState(null)
  const [business, setBusiness] = useState(null)
  const [sideOpen, setSideOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { navigate('/auth'); return }
      setUser(data.user)
      supabase
        .from('businesses')
        .select('*')
        .eq('user_id', data.user.id)
        .maybeSingle()
        .then(({ data: biz }) => {
          if (!biz) { navigate('/onboarding'); return }
          setBusiness(biz)
        })
    })
  }, [navigate])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  const Section = {
    panoramica: Panoramica,
    editor:     EditorSito,
    servizi:    Servizi,
    social:     Social,
    recensioni: Recensioni,
    promemoria: Promemoria,
  }[section]

  const navigate_section = (id) => {
    setSection(id)
    setSideOpen(false)
  }

  return (
    <div className="db-shell">

      {/* Mobile overlay */}
      {sideOpen && (
        <div className="db-overlay" onClick={() => setSideOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`db-sidebar ${sideOpen ? 'db-sidebar--open' : ''}`}>
        <div className="db-sidebar-top">
          <div className="db-brand">
            <div className="db-brand-icon">
              <IconHome />
            </div>
            <span className="db-brand-name">PIUM</span>
          </div>

          {business && (
            <div className="db-biz-pill">
              <div className="db-biz-avatar">
                {business.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="db-biz-info">
                <span className="db-biz-name">{business.name}</span>
                <span className="db-biz-cat">{business.category ?? 'Attività'}</span>
              </div>
            </div>
          )}

          <nav className="db-nav">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`db-nav-item ${section === id ? 'db-nav-item--active' : ''}`}
                onClick={() => navigate_section(id)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="db-sidebar-bottom">
          <div className="db-user-row">
            <div className="db-user-avatar">
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="db-user-info">
              <span className="db-user-email">{user?.email}</span>
            </div>
          </div>
          <button className="db-signout" onClick={handleSignOut} title="Esci">
            <IconLogout />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="db-main">
        {/* Topbar (mobile) */}
        <header className="db-topbar">
          <button className="db-menu-btn" onClick={() => setSideOpen(true)} aria-label="Apri menu">
            <IconMenu />
          </button>
          <span className="db-topbar-title">
            {NAV.find(n => n.id === section)?.label}
          </span>
          <div style={{ width: 36 }} />
        </header>

        {/* Page title (desktop) */}
        <div className="db-page-header">
          <h1 className="db-page-title">
            {NAV.find(n => n.id === section)?.label}
          </h1>
        </div>

        <main className="db-content">
          {Section && <Section business={business} user={user} />}
        </main>
      </div>
    </div>
  )
}

/* ── Icons ── */
function IconGrid() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function IconPen() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
}
function IconBriefcase() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
}
function IconShare() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
}
function IconStar() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
}
function IconBell() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
}
function IconHome() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IconLogout() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
}
function IconMenu() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
}
