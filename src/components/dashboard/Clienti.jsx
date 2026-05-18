import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

const MONTHS = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function fmtDuration(m) {
  if (!m) return null
  const h = Math.floor(m / 60); const r = m % 60
  return r ? `${h}h ${r}min` : h ? `${h}h` : `${m} min`
}

function fmtCurrency(v) {
  if (v == null || v === 0) return null
  return `€${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function buildWaLink(phone) {
  if (!phone) return null
  return `https://wa.me/${phone.trim().replace(/^\+/, '').replace(/\s+/g, '')}`
}

// Raggruppa appuntamenti per telefono (se presente) o nome normalizzato
function groupClients(appointments) {
  const map = new Map()

  const sorted = [...appointments].sort((a, b) => (a.date < b.date ? -1 : 1))

  for (const apt of sorted) {
    const key = apt.client_phone?.trim()
      ? apt.client_phone.trim().replace(/\s+/g, '')
      : '__name__' + apt.client_name.trim().toLowerCase()

    if (!map.has(key)) {
      map.set(key, {
        key,
        name:         apt.client_name,
        phone:        apt.client_phone?.trim() || null,
        appointments: [],
        spent:        0,
        firstVisit:   apt.date,
        lastVisit:    apt.date,
      })
    }

    const c = map.get(key)
    c.appointments.push(apt)
    c.name     = apt.client_name                                    // usa il nome più recente
    c.lastVisit = apt.date > c.lastVisit ? apt.date : c.lastVisit
    if (!c.phone && apt.client_phone?.trim()) c.phone = apt.client_phone.trim()
    if (apt.completed && apt.price != null) c.spent += Number(apt.price)
  }

  return Array.from(map.values())
    .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit))
}

function avgFrequency(client) {
  if (client.appointments.length < 2) return null
  const days = Math.round(
    (new Date(client.lastVisit) - new Date(client.firstVisit)) / 86400000
  )
  return Math.round(days / (client.appointments.length - 1))
}

/* ── Component ── */
export default function Clienti({ business }) {
  const [appointments, setAppointments] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [drawer,       setDrawer]       = useState(null)  // client object | null

  useEffect(() => {
    if (!business) return
    supabase
      .from('appointments')
      .select('id, client_name, client_phone, date, start_time, duration_minutes, price, notes, completed, employees(name, color)')
      .eq('business_id', business.id)
      .order('date', { ascending: false })
      .then(({ data }) => {
        setAppointments(data ?? [])
        setLoading(false)
      })
  }, [business])

  const clients = useMemo(() => groupClients(appointments), [appointments])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q))
    )
  }, [clients, search])

  // Blocca scroll body quando drawer aperto
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawer])

  if (loading) return <div className="db-section"><p className="db-card-empty">Caricamento…</p></div>

  return (
    <div className="db-section">

      {/* Barra di ricerca */}
      <div className="cl-search-wrap">
        <svg className="cl-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          className="cl-search-input"
          type="text"
          placeholder="Cerca per nome o telefono…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="cl-search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* Lista clienti */}
      {filtered.length === 0 ? (
        <p className="db-card-empty">
          {clients.length === 0
            ? 'Nessun cliente ancora. I clienti appariranno automaticamente dopo il primo appuntamento.'
            : 'Nessun cliente trovato per questa ricerca.'}
        </p>
      ) : (
        <div className="cl-list">
          {filtered.map(c => {
            const waLink = buildWaLink(c.phone)
            return (
              <div key={c.key} className="cl-row" onClick={() => setDrawer(c)}>
                <div className="cl-avatar">{c.name.trim()[0]?.toUpperCase() ?? '?'}</div>
                <div className="cl-info">
                  <span className="cl-name">{c.name}</span>
                  {c.phone && (
                    <span className="cl-phone">
                      {c.phone}
                      {waLink && (
                        <a
                          className="cl-wa-btn"
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="Apri WhatsApp"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          WA
                        </a>
                      )}
                    </span>
                  )}
                </div>
                <div className="cl-meta">
                  <span className="cl-meta-appt">{c.appointments.length} {c.appointments.length === 1 ? 'visita' : 'visite'}</span>
                  {c.spent > 0 && <span className="cl-meta-spent">{fmtCurrency(c.spent)}</span>}
                  <span className="cl-meta-date">{fmtDate(c.lastVisit)}</span>
                </div>
                <svg className="cl-row-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            )
          })}
        </div>
      )}

      {/* Drawer scheda cliente */}
      {drawer && (
        <ClientDrawer client={drawer} onClose={() => setDrawer(null)} />
      )}

    </div>
  )
}

/* ── ClientDrawer ── */
function ClientDrawer({ client, onClose }) {
  const waLink = buildWaLink(client.phone)
  const freq   = avgFrequency(client)

  const apts = [...client.appointments]
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.start_time > a.start_time ? 1 : -1))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="adm-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-drawer">

        {/* Header */}
        <div className="adm-drawer-header">
          <div className="adm-drawer-title-wrap">
            <div className="cl-drawer-avatar">{client.name.trim()[0]?.toUpperCase() ?? '?'}</div>
            <div>
              <div className="adm-drawer-title">{client.name}</div>
              {client.phone && (
                <div className="cl-drawer-phone">
                  {client.phone}
                  {waLink && (
                    <a className="cl-drawer-wa" href={waLink} target="_blank" rel="noopener noreferrer">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </a>
                  )}
                </div>
              )}
              <div className="adm-drawer-subtitle">Prima visita: {fmtDate(client.firstVisit)}</div>
            </div>
          </div>
          <button className="adm-drawer-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="adm-drawer-body">

          {/* Riepilogo */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Riepilogo</div>
            <div className="cl-stats-grid">
              <div className="cl-stat">
                <span className="cl-stat-value">{client.appointments.length}</span>
                <span className="cl-stat-label">{client.appointments.length === 1 ? 'visita' : 'visite totali'}</span>
              </div>
              <div className="cl-stat">
                <span className="cl-stat-value">{client.spent > 0 ? fmtCurrency(client.spent) : '—'}</span>
                <span className="cl-stat-label">totale speso</span>
              </div>
              <div className="cl-stat">
                <span className="cl-stat-value">{freq ? `${freq}gg` : '—'}</span>
                <span className="cl-stat-label">frequenza media</span>
              </div>
            </div>
          </div>

          {/* Storico appuntamenti */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Storico visite</div>
            <div className="cl-apt-list">
              {apts.map(apt => (
                <div key={apt.id} className={`cl-apt-item ${apt.completed ? 'cl-apt-item--done' : ''}`}>
                  <div className="cl-apt-header">
                    <span className="cl-apt-date">{fmtDate(apt.date)}</span>
                    {apt.start_time && (
                      <span className="cl-apt-time">{apt.start_time.slice(0, 5)}</span>
                    )}
                    {apt.completed && <span className="cl-apt-done-badge">✓</span>}
                  </div>
                  <div className="cl-apt-details">
                    {apt.duration_minutes && (
                      <span className="cl-apt-detail">{fmtDuration(apt.duration_minutes)}</span>
                    )}
                    {apt.price != null && (
                      <span className="cl-apt-detail cl-apt-detail--price">{fmtCurrency(apt.price)}</span>
                    )}
                    {apt.employees?.name && (
                      <span className="cl-apt-detail">
                        <span className="cl-emp-dot" style={{ background: apt.employees.color }} />
                        {apt.employees.name}
                      </span>
                    )}
                  </div>
                  {apt.notes && <p className="cl-apt-notes">{apt.notes}</p>}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
