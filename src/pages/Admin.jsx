import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

/* ── Security helper: slug deve contenere solo [a-z0-9-] prima di essere usato in href ── */
function safePublicUrl(slug) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null
  return `https://${slug}.piumapp.com`
}

/* ── Constants ── */
const PLANS = [
  { value: 'trial',   label: 'Trial'   },
  { value: 'free',    label: 'Free'    },
  { value: 'starter', label: 'Starter' },
  { value: 'pro',     label: 'Pro'     },
]
const STATUS_FILTERS      = ['tutti', 'active', 'trial', 'expired', 'suspended']
const STATUS_FILTER_LABELS = { tutti: 'Tutti', active: 'Attivi', trial: 'Trial', expired: 'Scaduti', suspended: 'Sospesi' }

/* ── Helpers ── */
function getStatus(biz) { return biz.status ?? 'trial' }

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCityProvince(city, province) {
  const parts = [city, province].map(v => (v ?? '').trim()).filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function trialDaysLeft(biz) {
  if (getStatus(biz) !== 'trial' || !biz.trial_ends_at) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end   = new Date(biz.trial_ends_at); end.setHours(0, 0, 0, 0)
  return Math.round((end - today) / 86400000)
}

/* ── Component ── */
export default function Admin() {
  const navigate = useNavigate()
  const [user,         setUser]         = useState(null)
  const [businesses,   setBusinesses]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(null)
  const [denied,       setDenied]       = useState(false)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('tutti')
  const [updatingId,   setUpdatingId]   = useState(null)
  const [copied,       setCopied]       = useState(null)

  const [section,      setSection]      = useState('clienti')
  const [affiliates,   setAffiliates]   = useState([])
  const [affLoading,   setAffLoading]   = useState(false)
  const [affError,     setAffError]     = useState(null)
  const [activatingId, setActivatingId] = useState(null)
  const [drawerAff,    setDrawerAff]    = useState(null)
  const [affDraft,     setAffDraft]     = useState({ city: '', province: '', phone: '', legal_name: '', admin_notes: '' })
  const [affSaveBusy,  setAffSaveBusy]  = useState(false)
  const [affSaveError, setAffSaveError] = useState(null)
  const [affSaveOk,    setAffSaveOk]    = useState(false)
  const [affStats,        setAffStats]        = useState({})
  const [affCommissions,  setAffCommissions]  = useState([])
  const [affCommLoading,  setAffCommLoading]  = useState(false)
  const [affCommError,    setAffCommError]    = useState(null)
  const [markPaidBusy,    setMarkPaidBusy]    = useState(false)
  const [markPaidConfirm, setMarkPaidConfirm] = useState(false)

  /* Drawer */
  const [drawerBiz,           setDrawerBiz]           = useState(null)
  const [drawerHealth,        setDrawerHealth]        = useState(null)
  const [drawerHealthLoading, setDrawerHealthLoading] = useState(false)
  const [drawerNotes,         setDrawerNotes]         = useState('')
  const [notesSaving,         setNotesSaving]         = useState(false)
  const [notesSaved,          setNotesSaved]          = useState(false)
  const [drawerAffiliate,     setDrawerAffiliate]     = useState(null)  // { code, name } | null | 'organic'
  const [drawerTrialDate,     setDrawerTrialDate]     = useState('')
  const [trialDateSaving,     setTrialDateSaving]     = useState(false)
  const [trialDateSaved,      setTrialDateSaved]      = useState(false)

  /* ── Auth + role check ── */
  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return
      if (!data.user) { navigate('/x-admin-login'); return }
      const role = data.user.app_metadata?.role
      if (role !== 'admin') { setDenied(true); setLoading(false); return }
      setUser(data.user)
    })
    return () => { alive = false }
  }, [navigate])

  /* ── Load businesses ── */
  const load = useCallback(async (signal = null) => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, email, city, category, slug, plan, plan_price, cover_url, admin_notes, is_active, status, trial_ends_at, created_at, ai_calls_month, ai_calls_total, ai_calls_month_display, ai_tokens_month, ai_unlimited, affiliate_code')
      .order('created_at', { ascending: false })
    if (signal?.cancelled) return
    if (error) {
      setLoadError('Errore nel caricamento dei clienti. Riprova o controlla la connessione.')
    } else {
      setLoadError(null)
    }
    setBusinesses(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [load])

  /* ── Drawer ── */
  const openDrawer = useCallback(async (biz) => {
    setDrawerBiz(biz)
    setDrawerNotes(biz.admin_notes ?? '')
    setNotesSaved(false)
    setDrawerHealth(null)
    setDrawerAffiliate(null)
    setDrawerTrialDate(biz.trial_ends_at ? biz.trial_ends_at.slice(0, 10) : '')
    setTrialDateSaved(false)
    setDrawerHealthLoading(true)

    const [{ count }, { data: aff }] = await Promise.all([
      supabase.from('services').select('*', { count: 'exact', head: true }).eq('business_id', biz.id),
      biz.affiliate_code
        ? supabase.from('affiliates').select('code, name').eq('code', biz.affiliate_code).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    setDrawerHealth({ serviceCount: count ?? 0, hasCover: !!biz.cover_url })
    setDrawerAffiliate(biz.affiliate_code ? (aff ?? { code: biz.affiliate_code, name: null }) : 'organic')
    setDrawerHealthLoading(false)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerBiz(null)
    setDrawerHealth(null)
    setDrawerNotes('')
    setDrawerAffiliate(null)
    setDrawerTrialDate('')
    setTrialDateSaved(false)
  }, [])

  const saveNotes = useCallback(async () => {
    if (!drawerBiz) return
    setNotesSaving(true)
    const { error } = await supabase.from('businesses')
      .update({ admin_notes: drawerNotes }).eq('id', drawerBiz.id)
    setNotesSaving(false)
    if (!error) {
      setBusinesses(prev => prev.map(b => b.id === drawerBiz.id ? { ...b, admin_notes: drawerNotes } : b))
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    }
  }, [drawerBiz, drawerNotes])

  const saveTrialDate = useCallback(async () => {
    if (!drawerBiz) return
    setTrialDateSaving(true)
    const trial_ends_at = drawerTrialDate ? new Date(drawerTrialDate + 'T00:00:00').toISOString() : null
    const updates = { trial_ends_at, ...(drawerTrialDate ? { status: 'trial' } : {}) }
    const { error } = await supabase.from('businesses').update(updates).eq('id', drawerBiz.id)
    setTrialDateSaving(false)
    if (!error) {
      setBusinesses(prev => prev.map(b => b.id === drawerBiz.id ? { ...b, ...updates } : b))
      setDrawerBiz(prev => prev ? { ...prev, ...updates } : prev)
      setTrialDateSaved(true)
      setTimeout(() => setTrialDateSaved(false), 2000)
    }
  }, [drawerBiz, drawerTrialDate])

  /* ── Business actions ── */
  const updatePlan = async (id, plan) => {
    setUpdatingId(id)
    await supabase.from('businesses').update({ plan }).eq('id', id)
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, plan } : b))
    setUpdatingId(null)
  }

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
      ? new Date(biz.trial_ends_at) : new Date()
    base.setDate(base.getDate() + 30)
    const trial_ends_at = base.toISOString()
    setUpdatingId(biz.id)
    await supabase.from('businesses').update({ trial_ends_at, status: 'trial' }).eq('id', biz.id)
    setBusinesses(prev => prev.map(b => b.id === biz.id ? { ...b, trial_ends_at, status: 'trial' } : b))
    setUpdatingId(null)
  }

  const toggleAiUnlimited = useCallback(async (biz) => {
    const next = !biz.ai_unlimited
    await supabase.from('businesses').update({ ai_unlimited: next }).eq('id', biz.id)
    setBusinesses(prev => prev.map(b => b.id === biz.id ? { ...b, ai_unlimited: next } : b))
    setDrawerBiz(prev => prev?.id === biz.id ? { ...prev, ai_unlimited: next } : prev)
  }, [])

  const copyLink = useCallback((biz) => {
    if (!biz.slug) return
    const url = `${window.location.origin}/${biz.slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(biz.id)
      setTimeout(() => setCopied(null), 2000)
    })
  }, [])

  /* ── Affiliates ── */
  const loadAffiliates = useCallback(async () => {
    if (!user) return
    setAffLoading(true)
    const [{ data, error }, { data: commData }] = await Promise.all([
      supabase
        .from('affiliates')
        .select('id, name, email, code, status, total_clients, total_earned, created_at, approved_email_sent_at, admin_notes, city, province, phone, legal_name')
        .order('created_at', { ascending: false }),
      supabase
        .from('affiliate_commissions')
        .select('affiliate_id, business_id, amount, status'),
    ])
    const statsMap = {}
    for (const row of (commData ?? [])) {
      if (!statsMap[row.affiliate_id]) statsMap[row.affiliate_id] = { bids: new Set(), earned: 0, pending: 0 }
      const s = statsMap[row.affiliate_id]
      s.bids.add(row.business_id)
      if (row.status === 'pending' || row.status === 'paid') s.earned += Number(row.amount)
      if (row.status === 'pending') s.pending += Number(row.amount)
    }
    const computed = {}
    for (const [id, s] of Object.entries(statsMap)) computed[id] = { clients: s.bids.size, earned: s.earned, pending: s.pending }
    setAffStats(computed)
    if (error) {
      setAffError('Errore nel caricamento affiliati. Riprova o controlla la connessione.')
    } else {
      setAffError(null)
    }
    setAffiliates(data ?? [])
    setAffLoading(false)
  }, [user])

  const setAffiliateStatus = async (id, status) => {
    setActivatingId(id)
    setAffError(null)

    const { data, error } = await supabase.functions.invoke('approve-affiliate', {
      body: { affiliate_id: id, target_status: status },
    })

    if (error) {
      setAffError(error.message || 'Errore durante aggiornamento stato affiliato.')
      setActivatingId(null)
      return
    }

    if (data?.error) {
      const detail = data.detail ? ` (${data.detail})` : ''
      setAffError(`${data.error}${detail}`)
      setActivatingId(null)
      return
    }

    setAffiliates(prev => prev.map(a => a.id === id ? { ...a, status: data?.status ?? status } : a))
    setDrawerAff(prev => prev?.id === id ? { ...prev, status: data?.status ?? status } : prev)
    setActivatingId(null)
  }

  const openAffiliateDrawer = useCallback(async (affiliate) => {
    setDrawerAff(affiliate)
    setAffDraft({
      city: affiliate.city ?? '',
      province: affiliate.province ?? '',
      phone: affiliate.phone ?? '',
      legal_name: affiliate.legal_name ?? '',
      admin_notes: affiliate.admin_notes ?? '',
    })
    setAffSaveBusy(false)
    setAffSaveError(null)
    setAffSaveOk(false)
    setAffCommissions([])
    setAffCommLoading(true)
    setAffCommError(null)
    setMarkPaidConfirm(false)

    const { data, error } = await supabase
      .from('affiliate_commissions')
      .select('id, business_id, amount, month_number, status, paid_at, created_at, businesses(name)')
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false })

    setAffCommLoading(false)
    if (error) {
      setAffCommError('Errore nel caricamento commissioni.')
    } else {
      setAffCommissions(data ?? [])
    }
  }, [])

  const closeAffiliateDrawer = useCallback(() => {
    setDrawerAff(null)
    setAffSaveBusy(false)
    setAffSaveError(null)
    setAffSaveOk(false)
    setAffCommissions([])
    setAffCommLoading(false)
    setAffCommError(null)
    setMarkPaidConfirm(false)
  }, [])

  const markCommissionsPaid = useCallback(async () => {
    if (!drawerAff) return
    setMarkPaidBusy(true)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('affiliate_commissions')
      .update({ status: 'paid', paid_at: now })
      .eq('affiliate_id', drawerAff.id)
      .eq('status', 'pending')
    setMarkPaidBusy(false)
    setMarkPaidConfirm(false)
    if (error) {
      setAffCommError('Errore nel salvataggio. Riprova.')
      return
    }
    setAffCommissions(prev => prev.map(c => c.status === 'pending' ? { ...c, status: 'paid', paid_at: now } : c))
    setAffStats(prev => {
      const cur = prev[drawerAff.id] ?? { clients: 0, earned: 0, pending: 0 }
      return { ...prev, [drawerAff.id]: { ...cur, pending: 0 } }
    })
  }, [drawerAff])

  const saveAffiliateDetails = useCallback(async () => {
    if (!drawerAff) return

    const normalize = (v) => {
      const text = (v ?? '').trim()
      return text ? text : null
    }

    const updates = {
      city: normalize(affDraft.city),
      province: normalize(affDraft.province),
      phone: normalize(affDraft.phone),
      legal_name: normalize(affDraft.legal_name),
      admin_notes: normalize(affDraft.admin_notes),
    }

    setAffSaveBusy(true)
    setAffSaveError(null)
    setAffSaveOk(false)

    const { error } = await supabase
      .from('affiliates')
      .update(updates)
      .eq('id', drawerAff.id)

    setAffSaveBusy(false)

    if (error) {
      setAffSaveError('Errore nel salvataggio dati affiliato. Riprova.')
      return
    }

    setAffiliates(prev => prev.map(a => a.id === drawerAff.id ? { ...a, ...updates } : a))
    setDrawerAff(prev => prev ? { ...prev, ...updates } : prev)
    setAffSaveOk(true)
    setTimeout(() => setAffSaveOk(false), 2200)
  }, [drawerAff, affDraft])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  /* ── Filter + search — memoized to avoid re-scanning on every render ── */
  const visible = useMemo(() => businesses.filter(b => {
    if (statusFilter !== 'tutti' && getStatus(b) !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!b.name?.toLowerCase().includes(q) && !b.email?.toLowerCase().includes(q) && !b.city?.toLowerCase().includes(q)) return false
    }
    return true
  }), [businesses, statusFilter, search])

  /* ── Computed stats — memoized ── */
  const { total, attivi, inTrial, scaduti, mrr, convRate } = useMemo(() => {
    const tot     = businesses.length
    const act     = businesses.filter(b => getStatus(b) === 'active').length
    const tri     = businesses.filter(b => getStatus(b) === 'trial').length
    const exp     = businesses.filter(b => getStatus(b) === 'expired').length
    const revenue = businesses.filter(b => getStatus(b) === 'active').reduce((s, b) => s + Number(b.plan_price ?? 99), 0)
    const base    = act + exp
    return { total: tot, attivi: act, inTrial: tri, scaduti: exp, mrr: revenue, convRate: base > 0 ? Math.round((act / base) * 100) : null }
  }, [businesses])

  if (denied) return (
    <div className="adm-denied">
      <div className="adm-denied-card">
        <div className="adm-denied-icon"><IconLock /></div>
        <h1 className="adm-denied-title">Accesso negato</h1>
        <p className="adm-denied-msg">Non hai i permessi per accedere a questa pagina.<br />Solo gli amministratori di PIUM possono accedervi.</p>
        <button className="adm-btn-primary" onClick={() => navigate('/dashboard')}>Torna alla dashboard</button>
      </div>
    </div>
  )

  return (
    <>
    <div className="adm-shell">

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
          <button className="adm-signout" onClick={handleSignOut} title="Esci"><IconLogout /></button>
        </div>
      </header>

      <div className="adm-body">

        <div className="adm-page-header">
          <div>
            <h1 className="adm-page-title">Pannello Admin</h1>
            <p className="adm-page-sub">Gestisci clienti e affiliati.</p>
          </div>
          <button className="adm-btn-refresh" onClick={section === 'clienti' ? load : loadAffiliates} disabled={loading || affLoading} title="Aggiorna">
            <IconRefresh spin={loading || affLoading} />
          </button>
        </div>

        <div className="adm-section-tabs">
          <button className={`adm-section-tab ${section === 'clienti'   ? 'adm-section-tab--active' : ''}`} onClick={() => setSection('clienti')}>Clienti</button>
          <button className={`adm-section-tab ${section === 'affiliati' ? 'adm-section-tab--active' : ''}`} onClick={() => { setSection('affiliati'); loadAffiliates() }}>Affiliati</button>
        </div>

        {section === 'clienti' ? (
          <>
            {/* Stats — 6 card */}
            <div className="adm-stats adm-stats--6">
              <StatCard label="Clienti totali"      value={total}                        icon={<IconUsers />}  color="accent"  />
              <StatCard label="Attivi"              value={attivi}                       icon={<IconCheck />}  color="green"   />
              <StatCard label="In trial"            value={inTrial}                      icon={<IconClock />}  color="yellow"  />
              <StatCard label="Scaduti"             value={scaduti}                      icon={<IconPause />}  color="gray"    />
              <StatCard label="MRR"                 value={`€${mrr.toFixed(0)}`}         icon={<IconEuro />}   color="purple"  />
              <StatCard label="Conversione trial"   value={convRate !== null ? `${convRate}%` : '—'} icon={<IconTrend />}  color="blue"    />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
              <div className="adm-search-wrap">
                <IconSearch />
                <input className="adm-search" type="text" placeholder="Cerca per nome, email, città…" value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button className="adm-search-clear" onClick={() => setSearch('')}><IconX /></button>}
              </div>
              <div className="adm-filter-row">
                {STATUS_FILTERS.map(s => (
                  <button key={s} className={`adm-filter-btn ${statusFilter === s ? 'adm-filter-btn--active' : ''}`} onClick={() => setStatusFilter(s)}>
                    {s === 'tutti' ? `Tutti (${total})` : STATUS_FILTER_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {loadError && (
              <div className="adm-load-error" role="alert">
                <IconAlert /> {loadError}
                <button className="adm-load-error-retry" onClick={load}>Riprova</button>
              </div>
            )}

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
                        <th>Stato</th>
                        <th>Trial</th>
                        <th>Piano / €</th>
                        <th>AI/mese</th>
                        <th>Affiliato</th>
                        <th>Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(b => {
                        const status = getStatus(b)
                        const busy   = updatingId === b.id
                        const days   = trialDaysLeft(b)
                        return (
                          <tr key={b.id} className={busy ? 'adm-row--busy' : ''}>
                            <td>
                              <button className="adm-biz-cell adm-biz-cell--btn" onClick={() => openDrawer(b)}>
                                <div className="adm-biz-avatar">{b.name?.[0]?.toUpperCase() ?? '?'}</div>
                                <div className="adm-biz-info">
                                  <span className="adm-biz-name">{b.name}</span>
                                  {b.category && <span className="adm-biz-cat">{b.category}</span>}
                                </div>
                              </button>
                            </td>
                            <td><span className="adm-cell-email">{b.email ?? '—'}</span></td>
                            <td><StatusBadge status={status} /></td>
                            <td><TrialCell days={days} trialEndsAt={b.trial_ends_at} status={status} /></td>
                            <td>
                              <div className="adm-plan-price-cell">
                                <select className="adm-plan-select" value={b.plan ?? 'trial'} disabled={busy} onChange={e => updatePlan(b.id, e.target.value)}>
                                  {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                                <div className="adm-price-wrap">
                                  <input className="adm-price-input" type="number" defaultValue={b.plan_price ?? 99} onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== b.plan_price) updatePlanPrice(b.id, v) }} disabled={busy} min={0} />
                                  <span className="adm-price-unit">€</span>
                                </div>
                              </div>
                            </td>
                            <td><span className="adm-ai-month">{b.ai_calls_month_display ?? 0}{b.ai_unlimited && <span className="adm-ai-unlimited-dot" title="AI illimitata">∞</span>}</span></td>
                            <td><AffiliateCell code={b.affiliate_code} /></td>
                            <td>
                              <div className="adm-row-actions">
                                {busy ? <AdminSpinner small /> : (
                                  <>
                                    {status !== 'active'    && <button className="adm-toggle-btn adm-toggle-btn--active"   onClick={() => setBizStatus(b.id, 'active')}    title="Attiva"><IconPlay /></button>}
                                    {status !== 'suspended' && <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={() => setBizStatus(b.id, 'suspended')} title="Sospendi"><IconPause /></button>}
                                    <button className="adm-toggle-btn" onClick={() => extendTrial(b)} title="+30 giorni trial" style={{ fontSize: 11, fontWeight: 700 }}>+30</button>
                                    <button className="adm-toggle-btn" onClick={() => copyLink(b)} title="Copia link sito">{copied === b.id ? <IconCheck /> : <IconCopy />}</button>
                                    {b.slug && <a className="adm-link-btn" href={`/${b.slug}`} target="_blank" rel="noreferrer" title="Apri sito"><IconExternalLink /></a>}
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
                    const days   = trialDaysLeft(b)
                    return (
                      <div key={b.id} className="adm-card">
                        <div className="adm-card-head">
                          <button className="adm-biz-cell adm-biz-cell--btn" onClick={() => openDrawer(b)}>
                            <div className="adm-biz-avatar">{b.name?.[0]?.toUpperCase() ?? '?'}</div>
                            <div className="adm-biz-info">
                              <span className="adm-biz-name">{b.name}</span>
                              {b.category && <span className="adm-biz-cat">{b.category}</span>}
                            </div>
                          </button>
                          <StatusBadge status={status} />
                        </div>
                        <div className="adm-card-meta">
                          {b.email && <span className="adm-cell-email">{b.email}</span>}
                          <TrialCell days={days} trialEndsAt={b.trial_ends_at} status={status} />
                          <span className="adm-cell-text adm-cell-date">{formatDate(b.created_at)}</span>
                          <span className="adm-ai-month">{b.ai_calls_month_display ?? 0} AI/mese{b.ai_unlimited && <span className="adm-ai-unlimited-dot" title="AI illimitata">∞</span>}</span>
                          <AffiliateCell code={b.affiliate_code} />
                        </div>
                        <div className="adm-card-footer">
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="adm-plan-select" value={b.plan ?? 'trial'} disabled={busy} onChange={e => updatePlan(b.id, e.target.value)}>
                              {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                            <div className="adm-price-wrap">
                              <input className="adm-price-input" type="number" defaultValue={b.plan_price ?? 99} onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== b.plan_price) updatePlanPrice(b.id, v) }} disabled={busy} min={0} />
                              <span className="adm-price-unit">€</span>
                            </div>
                          </div>
                          <div className="adm-row-actions">
                            {busy ? <AdminSpinner small /> : (
                              <>
                                {status !== 'active'    && <button className="adm-toggle-btn adm-toggle-btn--active"   onClick={() => setBizStatus(b.id, 'active')}    title="Attiva"><IconPlay /></button>}
                                {status !== 'suspended' && <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={() => setBizStatus(b.id, 'suspended')} title="Sospendi"><IconPause /></button>}
                                <button className="adm-toggle-btn" onClick={() => extendTrial(b)} title="+30gg" style={{ fontSize: 11, fontWeight: 700 }}>+30</button>
                                <button className="adm-toggle-btn" onClick={() => copyLink(b)} title="Copia link">{copied === b.id ? <IconCheck /> : <IconCopy />}</button>
                                {b.slug && <a className="adm-link-btn" href={`/${b.slug}`} target="_blank" rel="noreferrer" title="Sito"><IconExternalLink /></a>}
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
          /* ── Affiliati tab ── */
          <>
            {affError && (
              <div className="adm-load-error" role="alert">
                <IconAlert /> {affError}
                <button className="adm-load-error-retry" onClick={loadAffiliates}>Riprova</button>
              </div>
            )}
            {affLoading ? (
              <div className="adm-loading"><AdminSpinner /></div>
            ) : affiliates.length === 0 ? (
              <div className="adm-empty"><IconUsers /><p>Nessun affiliato ancora.</p></div>
            ) : (
              <>
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Affiliato</th><th>Email</th><th>Codice</th><th>Stato</th>
                        <th>Clienti</th><th>Maturato</th><th>Da pagare</th><th>Registrato</th><th>Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affiliates.map(a => {
                        const busy = activatingId === a.id
                        const cityProvince = formatCityProvince(a.city, a.province)
                        const cs = affStats[a.id]
                        return (
                          <tr key={a.id} className={`adm-row--clickable ${busy ? 'adm-row--busy' : ''}`} onClick={() => openAffiliateDrawer(a)}>
                            <td>
                              <div className="adm-biz-cell">
                                <div className="adm-biz-avatar">{a.name?.[0]?.toUpperCase() ?? '?'}</div>
                                <div className="adm-biz-info">
                                  <span className="adm-biz-name">{a.name}</span>
                                  {cityProvince && <span className="adm-biz-cat">{cityProvince}</span>}
                                </div>
                              </div>
                            </td>
                            <td><span className="adm-cell-email">{a.email ?? '—'}</span></td>
                            <td><code style={{ fontSize: 12, background: 'var(--code-bg)', padding: '2px 6px', borderRadius: 4 }}>{a.code}</code></td>
                            <td><AffStatusBadge status={a.status} /></td>
                            <td><span className="adm-cell-text">{cs?.clients ?? 0}</span></td>
                            <td><span className="adm-cell-text">{cs ? `€${cs.earned.toFixed(2)}` : '—'}</span></td>
                            <td><span className="adm-cell-text adm-comm-pending-val">{cs?.pending > 0 ? `€${cs.pending.toFixed(2)}` : '—'}</span></td>
                            <td><span className="adm-cell-text adm-cell-date">{formatDate(a.created_at)}</span></td>
                            <td>
                              <div className="adm-row-actions">
                                {busy ? <AdminSpinner small /> : (
                                  <>
                                    {a.status !== 'approved' && <button className="adm-toggle-btn adm-toggle-btn--active"   onClick={(e) => { e.stopPropagation(); setAffiliateStatus(a.id, 'approved') }} title="Attiva affiliato"><IconPlay /></button>}
                                    {a.status === 'approved' && <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={(e) => { e.stopPropagation(); setAffiliateStatus(a.id, 'pending') }}  title="Sospendi affiliato"><IconPause /></button>}
                                    {a.status !== 'rejected' && <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={(e) => { e.stopPropagation(); setAffiliateStatus(a.id, 'rejected') }} title="Rifiuta affiliato" style={{ color: '#ef4444' }}><IconX /></button>}
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
                <div className="adm-cards">
                  {affiliates.map(a => {
                    const busy = activatingId === a.id
                    const cityProvince = formatCityProvince(a.city, a.province)
                    const cs = affStats[a.id]
                    return (
                      <div key={a.id} className="adm-card adm-aff-card" onClick={() => openAffiliateDrawer(a)}>
                        <div className="adm-card-head">
                          <div className="adm-biz-cell">
                            <div className="adm-biz-avatar">{a.name?.[0]?.toUpperCase() ?? '?'}</div>
                            <div className="adm-biz-info">
                              <div className="adm-aff-headline">
                                <span className="adm-biz-name">{a.name}</span>
                                <AffStatusBadge status={a.status} />
                              </div>
                              {a.email && <span className="adm-biz-cat">{a.email}</span>}
                              {cityProvince && <span className="adm-biz-cat">{cityProvince}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="adm-card-meta">
                          <span className="adm-cell-text">Codice: <code style={{ fontSize: 12, background: 'var(--code-bg)', padding: '2px 6px', borderRadius: 4 }}>{a.code}</code></span>
                          <span className="adm-cell-text">Clienti: {cs?.clients ?? 0}</span>
                          <span className="adm-cell-text">Maturato: {cs ? `€${cs.earned.toFixed(2)}` : '—'}</span>
                          {cs?.pending > 0 && <span className="adm-cell-text adm-comm-pending-val">Da pagare: €{cs.pending.toFixed(2)}</span>}
                          <span className="adm-cell-text adm-cell-date">{formatDate(a.created_at)}</span>
                        </div>
                        <div className="adm-card-footer">
                          <div className="adm-row-actions">
                            {busy ? <AdminSpinner small /> : (
                              <>
                                {a.status !== 'approved' && <button className="adm-toggle-btn adm-toggle-btn--active"   onClick={(e) => { e.stopPropagation(); setAffiliateStatus(a.id, 'approved') }} title="Attiva affiliato"><IconPlay /></button>}
                                {a.status === 'approved' && <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={(e) => { e.stopPropagation(); setAffiliateStatus(a.id, 'pending') }}  title="Sospendi affiliato"><IconPause /></button>}
                                {a.status !== 'rejected' && <button className="adm-toggle-btn adm-toggle-btn--inactive" onClick={(e) => { e.stopPropagation(); setAffiliateStatus(a.id, 'rejected') }} title="Rifiuta affiliato" style={{ color: '#ef4444' }}><IconX /></button>}
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

    {/* Drawer — fuori da adm-shell per evitare stacking context problems */}
    {drawerBiz && (
      <BusinessDrawer
        biz={drawerBiz}
        health={drawerHealth}
        healthLoading={drawerHealthLoading}
        notes={drawerNotes}
        onNotesChange={setDrawerNotes}
        onSaveNotes={saveNotes}
        notesSaving={notesSaving}
        notesSaved={notesSaved}
        onClose={closeDrawer}
        affiliate={drawerAffiliate}
        trialDate={drawerTrialDate}
        onTrialDateChange={v => { setDrawerTrialDate(v); setTrialDateSaved(false) }}
        onSaveTrialDate={saveTrialDate}
        trialDateSaving={trialDateSaving}
        trialDateSaved={trialDateSaved}
        onCopyLink={copyLink}
        onToggleAiUnlimited={toggleAiUnlimited}
        copied={copied}
      />
    )}
    {drawerAff && (
      <AffiliateDrawer
        affiliate={drawerAff}
        draft={affDraft}
        onDraftChange={setAffDraft}
        onSave={saveAffiliateDetails}
        saveBusy={affSaveBusy}
        saveError={affSaveError}
        saveOk={affSaveOk}
        onClose={closeAffiliateDrawer}
        commissions={affCommissions}
        commLoading={affCommLoading}
        commError={affCommError}
        markPaidBusy={markPaidBusy}
        markPaidConfirm={markPaidConfirm}
        onMarkPaid={markCommissionsPaid}
        onMarkPaidConfirm={() => setMarkPaidConfirm(true)}
        onMarkPaidCancel={() => setMarkPaidConfirm(false)}
      />
    )}
  </>
  )
}

/* ── BusinessDrawer ── */
function BusinessDrawer({ biz, health, healthLoading, notes, onNotesChange, onSaveNotes, notesSaving, notesSaved, onClose, onCopyLink, onToggleAiUnlimited, affiliate, trialDate, onTrialDateChange, onSaveTrialDate, trialDateSaving, trialDateSaved, copied }) {
  const status = getStatus(biz)
  const days   = trialDaysLeft(biz)

  const add30Days = () => {
    const base = trialDate ? new Date(trialDate + 'T00:00:00') : new Date()
    base.setDate(base.getDate() + 30)
    onTrialDateChange(base.toISOString().slice(0, 10))
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="adm-drawer-overlay" onClick={onClose}>
      <div className="adm-drawer" onClick={e => e.stopPropagation()}>

        <div className="adm-drawer-header">
          <div className="adm-drawer-title-wrap">
            <div className="adm-biz-avatar adm-biz-avatar--lg">{biz.name?.[0]?.toUpperCase() ?? '?'}</div>
            <div>
              <div className="adm-drawer-title">{biz.name}</div>
              {biz.category && <div className="adm-drawer-subtitle">{biz.category}</div>}
            </div>
          </div>
          <button className="adm-drawer-close" onClick={onClose} title="Chiudi"><IconX /></button>
        </div>

        <div className="adm-drawer-body">

          {/* Stato account */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Stato account</div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Stato</span>
              <StatusBadge status={status} />
            </div>
            <div className="adm-drawer-row adm-drawer-row--col">
              <span className="adm-drawer-label">
                Trial scade
                {days !== null && (
                  <span className={`adm-trial-days-badge adm-trial-days-badge--${days <= 0 ? 'red' : days <= 7 ? 'orange' : 'green'}`} style={{ marginLeft: 6 }}>
                    {days <= 0 ? 'SCADUTO' : `${days}g`}
                  </span>
                )}
              </span>
              <div className="adm-trial-edit-row">
                <input
                  type="date"
                  className="adm-trial-date-input"
                  value={trialDate}
                  onChange={e => onTrialDateChange(e.target.value)}
                />
                <button className="adm-trial-plus30" onClick={add30Days} title="+30 giorni">+30</button>
                <button
                  className={`adm-trial-save-btn ${trialDateSaved ? 'adm-trial-save-btn--saved' : ''}`}
                  onClick={onSaveTrialDate}
                  disabled={trialDateSaving}
                >
                  {trialDateSaving ? '…' : trialDateSaved ? '✓ Salvato' : 'Salva'}
                </button>
              </div>
            </div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Piano</span>
              <span className="adm-drawer-value">{biz.plan ?? 'trial'} · €{biz.plan_price ?? 99}/mese</span>
            </div>
          </div>

          {/* Dati attività */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Dati attività</div>
            {[
              { label: 'Email',      value: biz.email },
              { label: 'Città',      value: biz.city  },
              { label: 'Slug',       value: biz.slug  },
              { label: 'Registrato', value: formatDate(biz.created_at) },
            ].filter(r => r.value).map(({ label, value }) => (
              <div key={label} className="adm-drawer-row">
                <span className="adm-drawer-label">{label}</span>
                <span className="adm-drawer-value">{value}</span>
              </div>
            ))}
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Provenienza</span>
              {affiliate === null ? (
                <span className="adm-drawer-value adm-cell-muted">…</span>
              ) : affiliate === 'organic' ? (
                <span className="adm-drawer-value adm-cell-muted">Organico</span>
              ) : (
                <span className="adm-drawer-value">
                  <span className="adm-aff-badge">{affiliate.code}</span>
                  {affiliate.name && <span className="adm-cell-muted" style={{ marginLeft: 6 }}>{affiliate.name}</span>}
                </span>
              )}
            </div>
          </div>

          {/* Salute onboarding */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Salute onboarding</div>
            {healthLoading ? (
              <div className="adm-drawer-loading"><AdminSpinner small /></div>
            ) : health ? (
              <>
                <div className="adm-health-row">
                  <span className={`adm-health-dot ${health.hasCover ? 'adm-health-dot--ok' : 'adm-health-dot--warn'}`} />
                  <span className="adm-drawer-label">Immagine copertina</span>
                  <span className={`adm-health-tag ${health.hasCover ? 'adm-health-tag--ok' : 'adm-health-tag--warn'}`}>{health.hasCover ? 'Presente' : 'Mancante'}</span>
                </div>
                <div className="adm-health-row">
                  <span className={`adm-health-dot ${health.serviceCount > 0 ? 'adm-health-dot--ok' : 'adm-health-dot--warn'}`} />
                  <span className="adm-drawer-label">Servizi</span>
                  <span className={`adm-health-tag ${health.serviceCount > 0 ? 'adm-health-tag--ok' : 'adm-health-tag--warn'}`}>
                    {health.serviceCount > 0 ? `${health.serviceCount} configurati` : 'Nessuno'}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          {/* Utilizzo AI */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Utilizzo AI</div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">AI illimitata</span>
              <button
                className={`adm-ai-toggle ${biz.ai_unlimited ? 'adm-ai-toggle--on' : ''}`}
                onClick={() => onToggleAiUnlimited(biz)}
                title={biz.ai_unlimited ? 'Disabilita AI illimitata' : 'Abilita AI illimitata'}
              >
                {biz.ai_unlimited ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Questo mese</span>
              <span className="adm-drawer-value adm-drawer-value--accent">{biz.ai_calls_month_display ?? 0} chiamate</span>
            </div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Token usati</span>
              <span className="adm-drawer-value">{(biz.ai_tokens_month ?? 0).toLocaleString('it-IT')}</span>
            </div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Totale storico</span>
              <span className="adm-drawer-value">{biz.ai_calls_total ?? 0} chiamate</span>
            </div>
          </div>

          {/* Note interne */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Note interne</div>
            <textarea
              className="adm-notes-area"
              placeholder="Note visibili solo all'admin…"
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              rows={4}
            />
            <button
              className={`adm-notes-save-btn ${notesSaved ? 'adm-notes-save-btn--saved' : ''}`}
              onClick={onSaveNotes}
              disabled={notesSaving}
            >
              {notesSaving ? 'Salvataggio…' : notesSaved ? '✓ Salvato' : 'Salva note'}
            </button>
          </div>

          {/* Azioni */}
          {biz.slug && (
            <div className="adm-drawer-section adm-drawer-section--actions">
              <button className="adm-drawer-action-btn" onClick={() => onCopyLink(biz)}>
                {copied === biz.id ? <><IconCheck /> Link copiato</> : <><IconCopy /> Copia link sito</>}
              </button>
              {(() => { const url = safePublicUrl(biz.slug); return url ? <a className="adm-drawer-action-btn adm-drawer-action-btn--outline" href={url} target="_blank" rel="noreferrer"><IconExternalLink /> Apri sito pubblico</a> : null })()}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function AffiliateDrawer({ affiliate, draft, onDraftChange, onSave, saveBusy, saveError, saveOk, onClose, commissions, commLoading, commError, markPaidBusy, markPaidConfirm, onMarkPaid, onMarkPaidConfirm, onMarkPaidCancel }) {
  const pendingTotal = (commissions ?? []).filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const cityProvince = formatCityProvince(affiliate.city, affiliate.province)

  return (
    <div className="adm-drawer-overlay" onClick={onClose}>
      <div className="adm-drawer" onClick={e => e.stopPropagation()}>
        <div className="adm-drawer-header">
          <div className="adm-drawer-title-wrap">
            <div className="adm-biz-avatar adm-biz-avatar--lg">{affiliate.name?.[0]?.toUpperCase() ?? '?'}</div>
            <div>
              <div className="adm-drawer-title">{affiliate.name}</div>
              <div className="adm-drawer-subtitle">Dettagli affiliato</div>
            </div>
          </div>
          <button className="adm-drawer-close" onClick={onClose} title="Chiudi"><IconX /></button>
        </div>

        <div className="adm-drawer-body">
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Dati profilo</div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Stato</span>
              <AffStatusBadge status={affiliate.status} />
            </div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Email</span>
              <span className="adm-drawer-value">{affiliate.email ?? '—'}</span>
            </div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Codice affiliato</span>
              <span className="adm-drawer-value"><span className="adm-aff-badge">{affiliate.code}</span></span>
            </div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Data candidatura</span>
              <span className="adm-drawer-value">{formatDate(affiliate.created_at)}</span>
            </div>
            <div className="adm-drawer-row">
              <span className="adm-drawer-label">Email approvazione</span>
              <span className="adm-drawer-value">{affiliate.approved_email_sent_at ? formatDateTime(affiliate.approved_email_sent_at) : '—'}</span>
            </div>
            {cityProvince && (
              <div className="adm-drawer-row">
                <span className="adm-drawer-label">Località</span>
                <span className="adm-drawer-value">{cityProvince}</span>
              </div>
            )}
          </div>

          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Commissioni</div>
            {commLoading ? (
              <div className="adm-drawer-loading"><AdminSpinner small /></div>
            ) : commError ? (
              <div className="adm-aff-save-msg adm-aff-save-msg--error">{commError}</div>
            ) : !commissions || commissions.length === 0 ? (
              <p className="adm-drawer-empty">Nessuna commissione registrata.</p>
            ) : (
              <>
                <div className="adm-comm-table-wrap">
                  <table className="adm-table adm-comm-table">
                    <thead>
                      <tr><th>Cliente</th><th>Mese</th><th>Importo</th><th>Stato</th><th>Data</th></tr>
                    </thead>
                    <tbody>
                      {commissions.map(c => (
                        <tr key={c.id}>
                          <td><span className="adm-cell-text">{c.businesses?.name ?? '—'}</span></td>
                          <td><span className="adm-cell-text">{c.month_number}/12</span></td>
                          <td><span className="adm-cell-text">€{Number(c.amount).toFixed(2)}</span></td>
                          <td><CommStatusBadge status={c.status} /></td>
                          <td><span className="adm-cell-text adm-cell-date">{formatDate(c.created_at)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pendingTotal > 0 && (
                  <div className="adm-comm-footer">
                    <span className="adm-comm-pending-label">Da pagare: <strong>€{pendingTotal.toFixed(2)}</strong></span>
                    {!markPaidConfirm ? (
                      <button className="adm-comm-pay-btn" onClick={onMarkPaidConfirm} disabled={markPaidBusy}>
                        Segna come pagate
                      </button>
                    ) : (
                      <div className="adm-comm-confirm">
                        <p className="adm-comm-confirm-msg">Confermi di aver pagato <strong>€{pendingTotal.toFixed(2)}</strong> a <strong>{affiliate.name}</strong>?</p>
                        <div className="adm-comm-confirm-actions">
                          <button className="adm-comm-confirm-yes" onClick={onMarkPaid} disabled={markPaidBusy}>
                            {markPaidBusy ? '…' : 'Conferma'}
                          </button>
                          <button className="adm-comm-confirm-no" onClick={onMarkPaidCancel} disabled={markPaidBusy}>Annulla</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Dati interni admin</div>
            <div className="adm-aff-form">
              <label className="adm-aff-field">
                <span className="adm-drawer-label">Città</span>
                <input
                  className="adm-aff-input"
                  type="text"
                  value={draft.city}
                  onChange={e => onDraftChange(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Città"
                />
              </label>
              <label className="adm-aff-field">
                <span className="adm-drawer-label">Provincia</span>
                <input
                  className="adm-aff-input"
                  type="text"
                  value={draft.province}
                  onChange={e => onDraftChange(prev => ({ ...prev, province: e.target.value }))}
                  placeholder="Provincia"
                />
              </label>
              <label className="adm-aff-field">
                <span className="adm-drawer-label">Telefono</span>
                <input
                  className="adm-aff-input"
                  type="text"
                  value={draft.phone}
                  onChange={e => onDraftChange(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Telefono"
                />
              </label>
              <label className="adm-aff-field">
                <span className="adm-drawer-label">Nominativo legale</span>
                <input
                  className="adm-aff-input"
                  type="text"
                  value={draft.legal_name}
                  onChange={e => onDraftChange(prev => ({ ...prev, legal_name: e.target.value }))}
                  placeholder="Nome reale / ragione sociale"
                />
              </label>
              <label className="adm-aff-field">
                <span className="adm-drawer-label">Note interne admin</span>
                <textarea
                  className="adm-notes-area"
                  value={draft.admin_notes}
                  onChange={e => onDraftChange(prev => ({ ...prev, admin_notes: e.target.value }))}
                  rows={5}
                  placeholder="Note visibili solo all'admin…"
                />
              </label>
            </div>

            {saveError && <div className="adm-aff-save-msg adm-aff-save-msg--error">{saveError}</div>}
            {saveOk && <div className="adm-aff-save-msg adm-aff-save-msg--ok">Dati affiliato salvati.</div>}

            <button className={`adm-notes-save-btn ${saveOk ? 'adm-notes-save-btn--saved' : ''}`} onClick={onSave} disabled={saveBusy}>
              {saveBusy ? 'Salvataggio…' : saveOk ? '✓ Salvato' : 'Salva dati affiliato'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── AffiliateCell ── */
function AffiliateCell({ code }) {
  if (!code) return <span className="adm-cell-text adm-cell-muted">—</span>
  return <span className="adm-aff-badge">{code}</span>
}

/* ── TrialCell ── */
function TrialCell({ days, trialEndsAt, status }) {
  if (status !== 'trial' || days === null) return <span className="adm-cell-text">—</span>
  const tier = days <= 0 ? 'red' : days <= 7 ? 'orange' : 'green'
  return (
    <div className="adm-trial-cell">
      <span className={`adm-trial-label adm-trial-label--${tier}`}>
        {days <= 0 ? 'SCADUTO' : `${days} giorni`}
      </span>
      {trialEndsAt && <span className="adm-trial-date">{formatDateShort(trialEndsAt)}</span>}
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
    active:    { label: 'Attivo',  cls: 'adm-badge--green'  },
    trial:     { label: 'Trial',   cls: 'adm-badge--yellow' },
    expired:   { label: 'Scaduto', cls: 'adm-badge--red'    },
    suspended: { label: 'Sospeso', cls: 'adm-badge--gray'   },
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

function CommStatusBadge({ status }) {
  const map = {
    pending:   { label: 'In attesa', cls: 'adm-badge--yellow' },
    paid:      { label: 'Pagata',    cls: 'adm-badge--green'  },
    cancelled: { label: 'Annullata', cls: 'adm-badge--gray'   },
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
function IconCopy()         { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function IconEuro()         { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12M4 14h12M19 6a7 7 0 1 0 0 12"/></svg> }
function IconAlert()        { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
function IconTrend()        { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> }
function IconRefresh({ spin }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={spin ? { animation: 'adm-spin 0.9s linear infinite' } : undefined}>
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}
function AdminSpinner({ small }) {
  const s = small ? 13 : 22
  return (
    <svg style={{ width: s, height: s, animation: 'adm-spin 0.8s linear infinite', flexShrink: 0 }}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
  )
}
