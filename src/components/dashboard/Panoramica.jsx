import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { notifyNextAppointment } from '../../lib/notifications'

/* ── Helpers ── */
const MONTHS_SHORT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
const DAYS_SHORT   = ['dom','lun','mar','mer','gio','ven','sab']

function formatAptDate(dateStr, timeStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const date  = new Date(dateStr + 'T00:00:00')
  const diff  = Math.round((date - today) / 86400000)
  const time  = timeStr ? timeStr.slice(0, 5) : ''

  if (diff === 0) return time ? `oggi ${time}` : 'oggi'
  if (diff === 1) return time ? `domani ${time}` : 'domani'

  const day = DAYS_SHORT[date.getDay()]
  const d   = date.getDate()
  const m   = MONTHS_SHORT[date.getMonth()]
  return time ? `${day} ${d} ${m} ${time}` : `${day} ${d} ${m}`
}

function formatActivityTime(isoStr) {
  if (!isoStr) return ''
  const d   = new Date(isoStr)
  const now  = new Date()
  const diff = Math.floor((now - d) / 60000)
  if (diff < 1)   return 'adesso'
  if (diff < 60)  return `${diff} min fa`
  if (diff < 1440) return `${Math.floor(diff / 60)}h fa`
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function reminderUrgency(due_at) {
  if (!due_at) return 'normal'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(due_at + 'T00:00:00')
  const diff  = Math.round((due - today) / 86400000)
  if (diff <= 0) return 'red'
  if (diff <= 3) return 'orange'
  return 'green'
}

function formatReminderDue(due_at) {
  if (!due_at) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(due_at + 'T00:00:00')
  const diff  = Math.round((due - today) / 86400000)
  if (diff < 0)  return `scaduto`
  if (diff === 0) return 'oggi'
  if (diff === 1) return 'domani'
  const d = due.getDate()
  const m = MONTHS_SHORT[due.getMonth()]
  return `${d} ${m}`
}

/* ── Component ── */
export default function Panoramica({ business, onNavigate, pendingCount = 0 }) {
  const rNav = useNavigate()
  const [counts,       setCounts]       = useState({ servizi: null, recensioni: null, appuntamenti: null, bozzeSocial: null, promemoria: null })
  const [loading,      setLoading]      = useState(true)
  const [activity,     setActivity]     = useState([])
  const [upcoming,     setUpcoming]     = useState([])
  const [reminders,    setReminders]    = useState([])
  const [cardsLoading, setCardsLoading] = useState(true)
  const [completingId, setCompletingId] = useState(null)

  const load = useCallback(async () => {
    if (!business) return
    setLoading(true)
    setCardsLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const sevenDaysLater = new Date(); sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)
    const sevenDaysStr = sevenDaysLater.toISOString().split('T')[0]

    const [
      { count: cServizi },
      { count: cRecensioni },
      { count: cAppuntamenti },
      { count: cSocial },
      { count: cPromemoria },
      { data: apts },
      { data: rems },
      { data: doneApts },
      { data: doneRems },
    ] = await Promise.all([
      supabase.from('services').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
      supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('date', today).eq('completed', false),
      supabase.from('social_drafts').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'draft'),
      supabase.from('reminders').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'pending').lte('due_at', sevenDaysStr),
      supabase.from('appointments').select('id, client_name, date, start_time, employees(name, color)').eq('business_id', business.id).gte('date', today).eq('completed', false).order('date').order('start_time').limit(5),
      supabase.from('reminders').select('id, title, due_at, priority').eq('business_id', business.id).eq('status', 'pending').gte('due_at', today).order('due_at').limit(5),
      supabase.from('appointments').select('id, client_name, date, updated_at').eq('business_id', business.id).eq('completed', true).order('updated_at', { ascending: false }).limit(5),
      supabase.from('reminders').select('id, title, updated_at').eq('business_id', business.id).eq('status', 'done').order('updated_at', { ascending: false }).limit(5),
    ])

    setCounts({
      servizi:      cServizi      ?? 0,
      recensioni:   cRecensioni   ?? 0,
      appuntamenti: cAppuntamenti ?? 0,
      bozzeSocial:  cSocial       ?? 0,
      promemoria:   cPromemoria   ?? 0,
    })
    setUpcoming(apts ?? [])
    setReminders(rems ?? [])

    const merged = [
      ...(doneApts ?? []).map(a => ({ id: 'a-' + a.id, icon: '📅', desc: `Appuntamento: ${a.client_name}`, section: 'agenda',     ts: a.updated_at })),
      ...(doneRems ?? []).map(r => ({ id: 'r-' + r.id, icon: '🔔', desc: `Promemoria: ${r.title}`,         section: 'promemoria', ts: r.updated_at })),
    ]
    merged.sort((a, b) => (b.ts > a.ts ? 1 : -1))
    setActivity(merged.slice(0, 5))

    setLoading(false)
    setCardsLoading(false)
  }, [business]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const markComplete = async (id) => {
    setCompletingId(id)
    const { error } = await supabase.from('appointments').update({ completed: true }).eq('id', id)
    setCompletingId(null)
    if (!error) {
      notifyNextAppointment((upcoming ?? []).filter(a => a.id !== id).map(a => a.id === id ? { ...a, completed: true } : a))
      load()
    }
  }

  return (
    <div className="db-section">
      {!business && (
        <div className="db-empty-banner">
          Nessuna attività trovata. Configura la tua attività per iniziare.
        </div>
      )}

      {/* Hero grid — 2 big cards */}
      <div className="pn-hero-grid">
        <button className="pn-hero-card" onClick={() => onNavigate?.('agenda', { view: 'day' })}>
          {pendingCount > 0 && <span className="db-stat-badge">{pendingCount}</span>}
          <span className="pn-hero-icon">📅</span>
          <span className="pn-hero-value">
            {loading ? <span className="db-stat-loading">…</span> : (counts.appuntamenti ?? '—')}
          </span>
          <span className="pn-hero-label">Appuntamenti oggi</span>
        </button>
        <button className="pn-hero-card" onClick={() => onNavigate?.('agenda', { view: 'month' })}>
          <span className="pn-hero-icon">🗓️</span>
          <span className="pn-hero-value">—</span>
          <span className="pn-hero-label">Calendario mensile</span>
        </button>
      </div>

      {/* Compact count rows */}
      <div className="pn-count-rows">
        {[
          { icon: '🔔', label: 'Promemoria in scadenza', value: counts.promemoria,  section: 'promemoria' },
          { icon: '🛎️', label: 'Servizi attivi',         value: counts.servizi,     section: 'servizi'    },
          { icon: '✍️',  label: 'Bozze social',           value: counts.bozzeSocial, section: 'social'     },
          { icon: '⭐',  label: 'Recensioni',             value: counts.recensioni,  section: 'recensioni' },
        ].map(row => (
          <button key={row.section} className="pn-count-row" onClick={() => onNavigate?.(row.section)}>
            <span className="pn-count-row-icon">{row.icon}</span>
            <span className="pn-count-row-label">{row.label}</span>
            <span className="pn-count-row-value">{loading ? '…' : (row.value ?? '—')}</span>
          </button>
        ))}
      </div>

      <div className="pn-cards-stack">

        {/* Card top — Prossime attività (full width) */}
        <div className="db-card">
          <h3 className="db-card-title">Prossime attività</h3>
          {cardsLoading ? (
            <p className="db-card-empty">…</p>
          ) : upcoming.length === 0 ? (
            <p className="db-card-empty">Nessun appuntamento in programma.</p>
          ) : (
            <ul className="pn-activity-list">
              {upcoming.map(apt => (
                <li
                  key={apt.id}
                  className="pn-activity-item pn-activity-item--link"
                  onClick={() => {
                    rNav(window.location.pathname, { state: { selectedDate: apt.date, selectedTime: apt.start_time?.slice(0, 5) }, replace: true })
                    onNavigate?.('agenda', { view: 'day' })
                  }}
                >
                  <span className="pn-activity-icon">📅</span>
                  <span className="pn-activity-desc">
                    {apt.client_name}
                    {apt.employees && (
                      <span className="pn-emp-badge" style={{ background: apt.employees.color }}>
                        {apt.employees.name.slice(0, 3).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="pn-activity-time">{formatAptDate(apt.date, apt.start_time)}</span>
                  <button
                    className="pn-apt-check-btn"
                    onClick={e => { e.stopPropagation(); markComplete(apt.id) }}
                    disabled={completingId === apt.id}
                    title="Segna completato"
                  >✓</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Bottom row — Promemoria + Attività completate */}
        <div className="pn-cards-row">

          {/* Card — Promemoria */}
          <div className="db-card">
            <h3 className="db-card-title">Promemoria</h3>
            {cardsLoading ? (
              <p className="db-card-empty">…</p>
            ) : reminders.length === 0 ? (
              <p className="db-card-empty">Nessun promemoria in scadenza.</p>
            ) : (
              <ul className="pn-activity-list">
                {reminders.map(r => {
                  const urgency = reminderUrgency(r.due_at)
                  const due     = formatReminderDue(r.due_at)
                  return (
                    <li key={r.id} className="pn-activity-item pn-activity-item--link" onClick={() => onNavigate?.('promemoria')}>
                      <span className="pn-activity-icon">🔔</span>
                      <span className="pn-activity-desc">{r.title}</span>
                      {due && (
                        <span className={`pn-reminder-due pn-reminder-due--${urgency}`}>{due}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Card — Attività completate */}
          <div className="db-card">
            <h3 className="db-card-title">Attività completate</h3>
            {cardsLoading ? (
              <p className="db-card-empty">…</p>
            ) : activity.length === 0 ? (
              <p className="db-card-empty">Nessuna attività completata.</p>
            ) : (
              <ul className="pn-activity-list">
                {activity.map(ev => (
                  <li key={ev.id} className="pn-activity-item pn-activity-item--link" onClick={() => onNavigate?.(ev.section)}>
                    <span className="pn-activity-icon">{ev.icon}</span>
                    <span className="pn-activity-desc">{ev.desc}</span>
                    <span className="pn-activity-time">{formatActivityTime(ev.ts)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
