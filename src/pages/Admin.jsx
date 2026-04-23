import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* ── Constants ── */
const PLANS = [
  { value: 'trial',   label: 'Trial'   },
  { value: 'free',    label: 'Free'    },
  { value: 'starter', label: 'Starter' },
  { value: 'pro',     label: 'Pro'     },
]

const STATUS_FILTERS = ['tutti', 'attivo', 'trial', 'inattivo']

/* ── Helpers ── */
function getStatus(biz) {
  if (!biz.is_active) return 'inattivo'
  if (biz.plan === 'trial') return 'trial'
  return 'attivo'
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

/* ── Component ── */
export default function Admin() {
  const navigate = useNavigate()
  const [user, setUser]           = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [loading, setLoading]     = useState(true)
  const [denied, setDenied]       = useState(false)

  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('tutti')

  const [updatingId, setUpdatingId] = useState(null)

  /* ── Auth + role check ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { navigate('/auth'); return }
      const role = data.user.app_metadata?.role
      if (role !== 'admin') { setDenied(true); setLoading(false); return }
      setUser(data.user)
    })
  }, [navigate])

  /* ── Load all businesses ── */
  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('businesses')
      .select('id, name, email, city, category, slug, plan, is_active, created_at')
      .order('created_at', { ascending: false })
    setBusinesses(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  /* ── Inline plan update ── */
  const updatePlan = async (id, plan) => {
    setUpdatingId(id)
    await supabase.from('businesses').update({ plan }).eq('id', id)
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, plan } : b))
    setUpdatingId(null)
  }

  /* ── Toggle is_active ── */
  const toggleActive = async (biz) => {
    const next = !biz.is_active
    setUpdatingId(biz.id)
    await supabase.from('businesses').update({ is_active: next }).eq('id', biz.id)
    setBusinesses(prev => prev.map(b => b.id === biz.id ? { ...b, is_active: next } : b))
    setUpdatingId(null)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  /* ── Filter + search ── */
  const visible = businesses.filter(b => {
    if (statusFilter !== 'tutti' && getStatus(b) !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (
        !b.name?.toLowerCase().includes(q) &&
        !b.email?.toLowerCase().includes(q) &&
        !b.city?.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  /* ── Stats ── */
  const total    = businesses.length
  const attivi   = businesses.filter(b => getStatus(b) === 'attivo').length
  const trial    = businesses.filter(b => getStatus(b) === 'trial').length
  const inattivi = businesses.filter(b => getStatus(b) === 'inattivo').length

  /* ── Access denied ── */
  if (denied) {
    return (
      <div className="adm-denied">
        <div className="adm-denied-card">
          <div className="adm-denied-icon"><IconLock /></div>
          <h1 className="adm-denied-title">Accesso negato</h1>
          <p className="adm-denied-msg">
            Non hai i permessi per accedere a questa pagina.<br />
            Solo gli amministratori di LocalHub possono accedervi.
          </p>
          <button className="adm-btn-primary" onClick={() => navigate('/dashboard')}>
            Torna alla dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="adm-shell">

      {/* Header */}
      <header className="adm-header">
        <div className="adm-header-left">
          <div className="adm-brand">
            <div className="adm-brand-icon"><IconHome /></div>
            <span className="adm-brand-name">LocalHub</span>
          </div>
          <span className="adm-admin-badge">Admin</span>
        </div>
        <div className="adm-header-right">
          <span className="adm-header-email">{user?.email}</span>
          <button className="adm-signout" onClick={handleSignOut} title="Esci">
            <IconLogout />
          </button>
        </div>
      </header>

      <div className="adm-body">

        {/* Page title */}
        <div className="adm-page-header">
          <div>
            <h1 className="adm-page-title">Pannello Admin</h1>
            <p className="adm-page-sub">Gestisci tutti i clienti e i loro abbonamenti.</p>
          </div>
          <button className="adm-btn-refresh" onClick={load} disabled={loading} title="Aggiorna">
            <IconRefresh spin={loading} />
          </button>
        </div>

        {/* Stats */}
        <div className="adm-stats">
          <StatCard label="Clienti totali"  value={total}    icon={<IconUsers />}  color="accent" />
          <StatCard label="Attivi"           value={attivi}   icon={<IconCheck />}  color="green"  />
          <StatCard label="In trial"         value={trial}    icon={<IconClock />}  color="yellow" />
          <StatCard label="Inattivi"         value={inattivi} icon={<IconPause />}  color="gray"   />
        </div>

        {/* Toolbar */}
        <div className="adm-toolbar">
          <div className="adm-search-wrap">
            <IconSearch />
            <input
              className="adm-search"
              type="text"
              placeholder="Cerca per nome, email, città…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="adm-search-clear" onClick={() => setSearch('')}>
                <IconX />
              </button>
            )}
          </div>
          <div className="adm-filter-row">
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                className={`adm-filter-btn ${statusFilter === s ? 'adm-filter-btn--active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'tutti' ? `Tutti (${total})` : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="adm-loading"><AdminSpinner /></div>
        ) : visible.length === 0 ? (
          <div className="adm-empty">
            <IconUsers />
            <p>{businesses.length === 0 ? 'Nessun cliente ancora.' : 'Nessun risultato per i filtri applicati.'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Attività</th>
                    <th>Email</th>
                    <th>Città</th>
                    <th>Piano</th>
                    <th>Stato</th>
                    <th>Registrato</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(b => {
                    const status = getStatus(b)
                    const busy   = updatingId === b.id
                    return (
                      <tr key={b.id} className={busy ? 'adm-row--busy' : ''}>
                        <td>
                          <div className="adm-biz-cell">
                            <div className="adm-biz-avatar">
                              {b.name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div className="adm-biz-info">
                              <span className="adm-biz-name">{b.name}</span>
                              {b.category && <span className="adm-biz-cat">{b.category}</span>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="adm-cell-email">{b.email ?? '—'}</span>
                        </td>
                        <td>
                          <span className="adm-cell-text">{b.city ?? '—'}</span>
                        </td>
                        <td>
                          <select
                            className="adm-plan-select"
                            value={b.plan}
                            disabled={busy}
                            onChange={e => updatePlan(b.id, e.target.value)}
                          >
                            {PLANS.map(p => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <StatusBadge status={status} />
                        </td>
                        <td>
                          <span className="adm-cell-text adm-cell-date">{formatDate(b.created_at)}</span>
                        </td>
                        <td>
                          <div className="adm-row-actions">
                            <button
                              className={`adm-toggle-btn ${b.is_active ? 'adm-toggle-btn--active' : 'adm-toggle-btn--inactive'}`}
                              disabled={busy}
                              onClick={() => toggleActive(b)}
                              title={b.is_active ? 'Disattiva cliente' : 'Attiva cliente'}
                            >
                              {busy ? <AdminSpinner small /> : b.is_active ? <IconPause /> : <IconPlay />}
                            </button>
                            {b.slug && (
                              <a
                                className="adm-link-btn"
                                href={`/b/${b.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Vedi sito pubblico"
                              >
                                <IconExternalLink />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="adm-cards">
              {visible.map(b => {
                const status = getStatus(b)
                const busy   = updatingId === b.id
                return (
                  <div key={b.id} className="adm-card">
                    <div className="adm-card-head">
                      <div className="adm-biz-cell">
                        <div className="adm-biz-avatar">{b.name?.[0]?.toUpperCase() ?? '?'}</div>
                        <div className="adm-biz-info">
                          <span className="adm-biz-name">{b.name}</span>
                          {b.category && <span className="adm-biz-cat">{b.category}</span>}
                        </div>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                    <div className="adm-card-meta">
                      {b.email && <span className="adm-cell-email">{b.email}</span>}
                      {b.city  && <span className="adm-cell-text">{b.city}</span>}
                      <span className="adm-cell-text adm-cell-date">{formatDate(b.created_at)}</span>
                    </div>
                    <div className="adm-card-footer">
                      <select
                        className="adm-plan-select"
                        value={b.plan}
                        disabled={busy}
                        onChange={e => updatePlan(b.id, e.target.value)}
                      >
                        {PLANS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <div className="adm-row-actions">
                        <button
                          className={`adm-toggle-btn ${b.is_active ? 'adm-toggle-btn--active' : 'adm-toggle-btn--inactive'}`}
                          disabled={busy}
                          onClick={() => toggleActive(b)}
                          title={b.is_active ? 'Disattiva' : 'Attiva'}
                        >
                          {busy ? <AdminSpinner small /> : b.is_active ? <IconPause /> : <IconPlay />}
                        </button>
                        {b.slug && (
                          <a
                            className="adm-link-btn"
                            href={`/b/${b.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Vedi sito pubblico"
                          >
                            <IconExternalLink />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="adm-count-label">
              {visible.length} {visible.length === 1 ? 'cliente' : 'clienti'} mostrat{visible.length === 1 ? 'o' : 'i'}
              {visible.length !== total && ` su ${total}`}
            </p>
          </>
        )}

      </div>
    </div>
  )
}

/* ── Sub-components ── */
function StatCard({ label, value, icon, color }) {
  return (
    <div className={`adm-stat adm-stat--${color}`}>
      <div className="adm-stat-icon">{icon}</div>
      <div className="adm-stat-body">
        <span className="adm-stat-value">{value}</span>
        <span className="adm-stat-label">{label}</span>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    attivo:   { label: 'Attivo',   cls: 'adm-badge--green'  },
    trial:    { label: 'Trial',    cls: 'adm-badge--yellow' },
    inattivo: { label: 'Inattivo', cls: 'adm-badge--gray'   },
  }
  const { label, cls } = map[status] ?? map.inattivo
  return <span className={`adm-badge ${cls}`}>{label}</span>
}

/* ── Icons ── */
function IconHome()         { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function IconLogout()       { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }
function IconUsers()        { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
function IconCheck()        { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconClock()        { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function IconPause()        { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> }
function IconPlay()         { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> }
function IconSearch()       { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> }
function IconX()            { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconLock()         { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> }
function IconExternalLink() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> }
function IconRefresh({ spin }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={spin ? { animation: 'adm-spin 0.9s linear infinite' } : undefined}
    >
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}
function AdminSpinner({ small }) {
  const s = small ? 13 : 22
  return (
    <svg
      style={{ width: s, height: s, animation: 'adm-spin 0.8s linear infinite', flexShrink: 0 }}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    >
      <path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
  )
}
