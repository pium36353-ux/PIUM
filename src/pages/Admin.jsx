import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

/* ── Constants ── */
const PLANS = [
  { value: 'trial',   label: 'Trial'   },
  { value: 'free',    label: 'Free'    },
  { value: 'starter', label: 'Starter' },
  { value: 'pro',     label: 'Pro'     },
]

const STATUS_FILTERS = ['tutti', 'active', 'trial', 'expired', 'suspended']
const STATUS_FILTER_LABELS = { tutti: 'Tutti', active: 'Attivi', trial: 'Trial', expired: 'Scaduti', suspended: 'Sospesi' }

/* ── Helpers ── */
function getStatus(biz) {
  return biz.status ?? 'trial'
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

  const [section,      setSection]      = useState('clienti')
  const [affiliates,   setAffiliates]   = useState([])
  const [affLoading,   setAffLoading]   = useState(false)
  const [activatingId, setActivatingId] = useState(null)

  /* ── Auth + role check ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { navigate('/x-admin-login'); return }
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
      .select('id, name, email, city, category, slug, plan, plan_price, is_active, status, trial_ends_at, created_at, ai_calls_month, ai_calls_total')
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

  /* ── Plan status ── */
  const setBizStatus = async (id, status) => {
    setUpdatingId(id)
    await supabase.from('businesses').update({ status }).eq('id', id)
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    setUpdatingId(null)
  }

  const updatePlanPrice = async (id, plan_price) => {
    await supabase.from('businesses').update({ plan_price }).eq('id', id)
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, plan_price } : b))
  }

  const extendTrial = async (biz) => {
    const base = biz.trial_ends_at && new Date(biz.trial_ends_at) > new Date()
      ? new Date(biz.trial_ends_at)
      : new Date()
    base.setDate(base.getDate() + 30)
    const trial_ends_at = base.toISOString()
    setUpdatingId(biz.id)
    await supabase.from('businesses').update({ trial_ends_at, status: 'trial' }).eq('id', biz.id)
    setBusinesses(prev => prev.map(b => b.id === biz.id ? { ...b, trial_ends_at, status: 'trial' } : b))
    setUpdatingId(null)
  }

  const loadAffiliates = useCallback(async () => {
    if (!user) return
    setAffLoading(true)
    const { data } = await supabase
      .from('affiliates')
      .select('id, name, email, code, status, total_clients, total_earned, created_at')
      .order('created_at', { ascending: false })
    setAffiliates(data ?? [])
    setAffLoading(false)
  }, [user])

  const setAffiliateStatus = async (id, status) => {
    setActivatingId(id)
    await supabase.from('affiliates').update({ status }).eq('id', id)
    setAffiliates(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setActivatingId(null)
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
  const attivi   = businesses.filter(b => getStatus(b) === 'active').length
  const trial    = businesses.filter(b => getStatus(b) === 'trial').length
  const scaduti  = businesses.filter(b => getStatus(b) === 'expired').length

  /* ── Access denied ── */
  if (denied) {
    return (
      <div className="adm-denied">
        <div className="adm-denied-card">
          <div className="adm-denied-icon"><IconLock /></div>
          <h1 className="adm-denied-title">Accesso negato</h1>
          <p className="adm-denied-msg">
            Non hai i permessi per accedere a questa pagina.<br />
            Solo gli amministratori di PIUM possono accedervi.
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
            <Logo className="adm-brand-name" />
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
            <p className="adm-page-sub">Gestisci clienti e affiliati.</p>
          </div>
          <button className="adm-btn-refresh" onClick={section === 'clienti' ? load : loadAffiliates} disabled={loading || affLoading} title="Aggiorna">
            <IconRefresh spin={loading || affLoading} />
          </button>
        </div>

        {/* Section tabs */}
        <div className="adm-section-tabs">
          <button
            className={`adm-section-tab ${section === 'clienti' ? 'adm-section-tab--active' : ''}`}
            onClick={() => setSection('clienti')}
          >Clienti</button>
          <button
            className={`adm-section-tab ${section === 'affiliati' ? 'adm-section-tab--active' : ''}`}
            onClick={() => { setSection('affiliati'); loadAffiliates() }}
          >Affiliati</button>
        </div>

        {section === 'clienti' ? (
          <>
            {/* Stats */}
            <div className="adm-stats">
              <StatCard label="Clienti totali"  value={total}   icon={<IconUsers />}  color="accent" />
              <StatCard label="Attivi"          value={attivi}  icon={<IconCheck />}  color="green"  />
              <StatCard label="In trial"        value={trial}   icon={<IconClock />}  color="yellow" />
              <StatCard label="Scaduti"         value={scaduti} icon={<IconPause />}  color="gray"   />
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
                    {s === 'tutti' ? `Tutti (${total})` : STATUS_FILTER_LABELS[s]}
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
                        <th>Prezzo</th>
                        <th>Trial scade</th>
                        <th>Registrato</th>
                        <th>Chiamate AI</th>
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input
                                  className="adm-price-input"
                                  type="number"
                                  defaultValue={b.plan_price ?? 99}
                                  onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== b.plan_price) updatePlanPrice(b.id, v) }}
                                  disabled={busy}
                                  min={0}
                                />
                                <span style={{ fontSize: 11, color: 'var(--text)' }}>€/m</span>
                              </div>
                            </td>
                            <td>
                              {b.status === 'trial'
                                ? <span className="adm-cell-text adm-cell-date">{formatDate(b.trial_ends_at)}</span>
                                : <span className="adm-cell-text">—</span>
                              }
                            </td>
                            <td>
                              <span className="adm-cell-text adm-cell-date">{formatDate(b.created_at)}</span>
                            </td>
                            <td>
                              <span className="adm-ai-calls-cell">
                                <span className="adm-ai-month">{b.ai_calls_month ?? 0} mese</span>
                                <span className="adm-ai-total">{b.ai_calls_total ?? 0} tot</span>
                              </span>
                            </td>
                            <td>
                              <div className="adm-row-actions">
                                {busy ? <AdminSpinner small /> : (
                                  <>
                                    {b.status !== 'active' && (
                                      <button className="adm-toggle-btn adm-toggle-btn--active" onClick={() => setBizStatus(b.id, 'active')} title="Attiva piano"><IconPlay /></button>
                                    )}
                                    {b.status !== 'suspended' && (
                                      <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={() => setBizStatus(b.id, 'suspended')} title="Sospendi"><IconPause /></button>
                                    )}
                                    <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={() => extendTrial(b)} title="Estendi trial +30gg" style={{ fontSize: 11, fontWeight: 700 }}>+30</button>
                                    {b.slug && (
                                      <a className="adm-link-btn" href={`/site/${b.slug}`} target="_blank" rel="noreferrer" title="Vedi sito pubblico"><IconExternalLink /></a>
                                    )}
                                  </>
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
                          {b.status === 'trial' && <span className="adm-cell-text adm-cell-date">Trial scade: {formatDate(b.trial_ends_at)}</span>}
                          <span className="adm-cell-text adm-cell-date">{formatDate(b.created_at)}</span>
                          <span className="adm-ai-calls-cell">
                            <span className="adm-ai-month">{b.ai_calls_month ?? 0} mese</span>
                            <span className="adm-ai-total">{b.ai_calls_total ?? 0} tot</span>
                          </span>
                        </div>
                        <div className="adm-card-footer">
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input
                                className="adm-price-input"
                                type="number"
                                defaultValue={b.plan_price ?? 99}
                                onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== b.plan_price) updatePlanPrice(b.id, v) }}
                                disabled={busy}
                                min={0}
                              />
                              <span style={{ fontSize: 11, color: 'var(--text)' }}>€/m</span>
                            </div>
                          </div>
                          <div className="adm-row-actions">
                            {busy ? <AdminSpinner small /> : (
                              <>
                                {b.status !== 'active' && (
                                  <button className="adm-toggle-btn adm-toggle-btn--active" onClick={() => setBizStatus(b.id, 'active')} title="Attiva"><IconPlay /></button>
                                )}
                                {b.status !== 'suspended' && (
                                  <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={() => setBizStatus(b.id, 'suspended')} title="Sospendi"><IconPause /></button>
                                )}
                                <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={() => extendTrial(b)} title="+30gg trial" style={{ fontSize: 11, fontWeight: 700 }}>+30</button>
                                {b.slug && (
                                  <a className="adm-link-btn" href={`/site/${b.slug}`} target="_blank" rel="noreferrer" title="Vedi sito pubblico"><IconExternalLink /></a>
                                )}
                              </>
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
          </>
        ) : (
          <>
            {affLoading ? (
              <div className="adm-loading"><AdminSpinner /></div>
            ) : affiliates.length === 0 ? (
              <div className="adm-empty">
                <IconUsers />
                <p>Nessun affiliato ancora.</p>
              </div>
            ) : (
              <>
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Affiliato</th>
                        <th>Email</th>
                        <th>Codice</th>
                        <th>Stato</th>
                        <th>Clienti</th>
                        <th>Guadagnato</th>
                        <th>Registrato</th>
                        <th>Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affiliates.map(a => {
                        const busy = activatingId === a.id
                        return (
                          <tr key={a.id} className={busy ? 'adm-row--busy' : ''}>
                            <td>
                              <div className="adm-biz-cell">
                                <div className="adm-biz-avatar">{a.name?.[0]?.toUpperCase() ?? '?'}</div>
                                <div className="adm-biz-info">
                                  <span className="adm-biz-name">{a.name}</span>
                                </div>
                              </div>
                            </td>
                            <td><span className="adm-cell-email">{a.email ?? '—'}</span></td>
                            <td><code style={{ fontSize: 12, background: 'var(--surface)', padding: '2px 6px', borderRadius: 4 }}>{a.code}</code></td>
                            <td><AffStatusBadge status={a.status} /></td>
                            <td><span className="adm-cell-text">{a.total_clients ?? 0}</span></td>
                            <td><span className="adm-cell-text">€{Number(a.total_earned ?? 0).toFixed(2)}</span></td>
                            <td><span className="adm-cell-text adm-cell-date">{formatDate(a.created_at)}</span></td>
                            <td>
                              <div className="adm-row-actions">
                                {busy ? (
                                  <AdminSpinner small />
                                ) : (
                                  <>
                                    {a.status !== 'approved' && (
                                      <button
                                        className="adm-toggle-btn adm-toggle-btn--active"
                                        onClick={() => setAffiliateStatus(a.id, 'approved')}
                                        title="Attiva affiliato"
                                      ><IconPlay /></button>
                                    )}
                                    {a.status === 'approved' && (
                                      <button
                                        className="adm-toggle-btn adm-toggle-btn--inactive"
                                        onClick={() => setAffiliateStatus(a.id, 'pending')}
                                        title="Sospendi affiliato"
                                      ><IconPause /></button>
                                    )}
                                    {a.status !== 'rejected' && (
                                      <button
                                        className="adm-toggle-btn adm-toggle-btn--inactive"
                                        onClick={() => setAffiliateStatus(a.id, 'rejected')}
                                        title="Rifiuta affiliato"
                                        style={{ color: '#ef4444' }}
                                      ><IconX /></button>
                                    )}
                                  </>
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
                  {affiliates.map(a => {
                    const busy = activatingId === a.id
                    return (
                      <div key={a.id} className="adm-card">
                        <div className="adm-card-head">
                          <div className="adm-biz-cell">
                            <div className="adm-biz-avatar">{a.name?.[0]?.toUpperCase() ?? '?'}</div>
                            <div className="adm-biz-info">
                              <span className="adm-biz-name">{a.name}</span>
                              {a.email && <span className="adm-biz-cat">{a.email}</span>}
                            </div>
                          </div>
                          <AffStatusBadge status={a.status} />
                        </div>
                        <div className="adm-card-meta">
                          <span className="adm-cell-text">Codice: <code style={{ fontSize: 12, background: 'var(--surface)', padding: '2px 6px', borderRadius: 4 }}>{a.code}</code></span>
                          <span className="adm-cell-text">Clienti: {a.total_clients ?? 0}</span>
                          <span className="adm-cell-text">Guadagnato: €{Number(a.total_earned ?? 0).toFixed(2)}</span>
                          <span className="adm-cell-text adm-cell-date">{formatDate(a.created_at)}</span>
                        </div>
                        <div className="adm-card-footer">
                          <div className="adm-row-actions">
                            {busy ? <AdminSpinner small /> : (
                              <>
                                {a.status !== 'approved' && (
                                  <button className="adm-toggle-btn adm-toggle-btn--active" onClick={() => setAffiliateStatus(a.id, 'approved')} title="Attiva affiliato"><IconPlay /></button>
                                )}
                                {a.status === 'approved' && (
                                  <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={() => setAffiliateStatus(a.id, 'pending')} title="Sospendi affiliato"><IconPause /></button>
                                )}
                                {a.status !== 'rejected' && (
                                  <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={() => setAffiliateStatus(a.id, 'rejected')} title="Rifiuta affiliato" style={{ color: '#ef4444' }}><IconX /></button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <p className="adm-count-label">{affiliates.length} affiliat{affiliates.length === 1 ? 'o' : 'i'}</p>
              </>
            )}
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
    active:    { label: 'Attivo',   cls: 'adm-badge--green'  },
    trial:     { label: 'Trial',    cls: 'adm-badge--yellow' },
    expired:   { label: 'Scaduto',  cls: 'adm-badge--red'    },
    suspended: { label: 'Sospeso',  cls: 'adm-badge--gray'   },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'adm-badge--gray' }
  return <span className={`adm-badge ${cls}`}>{label}</span>
}

function AffStatusBadge({ status }) {
  const map = {
    approved: { label: 'Attivo',    cls: 'adm-badge--green'  },
    pending:  { label: 'In attesa', cls: 'adm-badge--yellow' },
    rejected: { label: 'Rifiutato', cls: 'adm-badge--gray'   },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'adm-badge--gray' }
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
