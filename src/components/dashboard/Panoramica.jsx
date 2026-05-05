import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

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
export default function Panoramica({ business, onNavigate }) {
  const rNav = useNavigate()
  const [counts,    setCounts]    = useState({ servizi: null, recensioni: null, appuntamenti: null, bozzeSocial: null })
  const [loading,   setLoading]   = useState(true)
  const [activity,  setActivity]  = useState([])
  const [upcoming,  setUpcoming]  = useState([])
  const [reminders, setReminders] = useState([])
  const [cardsLoading, setCardsLoading] = useState(true)

  useEffect(() => {
    if (!business) return
    async function load() {
      setLoading(true)
      setCardsLoading(true)
      const today = new Date().toISOString().split('T')[0]

      const [
        { count: cServizi },
        { count: cRecensioni },
        { count: cAppuntamenti },
        { count: cSocial },
        { data: apts },
        { data: rems },
        { data: doneApts },
        { data: doneRems },
      ] = await Promise.all([
        supabase.from('services').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
        supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('business_id', business.id).gte('date', today),
        supabase.from('social_drafts').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'draft'),
        supabase.from('appointments').select('id, client_name, date, start_time').eq('business_id', business.id).gte('date', today).order('date').order('start_time').limit(5),
        supabase.from('reminders').select('id, title, due_at, priority').eq('business_id', business.id).eq('status', 'pending').gte('due_at', today).order('due_at').limit(5),
        supabase.from('appointments').select('id, client_name, date, updated_at').eq('business_id', business.id).eq('completed', true).order('updated_at', { ascending: false }).limit(5),
        supabase.from('reminders').select('id, title, updated_at').eq('business_id', business.id).eq('status', 'done').order('updated_at', { ascending: false }).limit(5),
      ])

      setCounts({
        servizi:      cServizi      ?? 0,
        recensioni:   cRecensioni   ?? 0,
        appuntamenti: cAppuntamenti ?? 0,
        bozzeSocial:  cSocial       ?? 0,
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
    }
    load()
  }, [business?.id])

  const stats = [
    { label: 'Servizi',             value: counts.servizi,      icon: '🛎️', section: 'servizi'    },
    { label: 'Recensioni',          value: counts.recensioni,   icon: '⭐',  section: 'recensioni' },
    { label: 'Appuntamenti oggi+',  value: counts.appuntamenti, icon: '📅', section: 'agenda'     },
    { label: 'Bozze social',        value: counts.bozzeSocial,  icon: '✍️', section: 'social'     },
  ]

  return (
    <div className="db-section">
      {!business && (
        <div className="db-empty-banner">
          Nessuna attività trovata. Configura la tua attività per iniziare.
        </div>
      )}

      <div className="db-stats-grid">
        {stats.map(s => (
          <button
            key={s.label}
            className="db-stat-card db-stat-card--link"
            onClick={() => {
              if (s.section === 'agenda') {
                rNav(window.location.pathname, { state: { agendaView: 'day' }, replace: true })
              }
              onNavigate?.(s.section)
            }}
          >
            <span className="db-stat-icon">{s.icon}</span>
            <span className="db-stat-value">
              {loading ? <span className="db-stat-loading">…</span> : s.value}
            </span>
            <span className="db-stat-label">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="pn-cards-row">

        {/* Card 1 — Attività completate */}
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

        {/* Card 2 — Prossime attività */}
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
                    rNav(window.location.pathname, { state: { selectedDate: apt.date }, replace: true })
                    onNavigate?.('agenda')
                  }}
                >
                  <span className="pn-activity-icon">📅</span>
                  <span className="pn-activity-desc">{apt.client_name}</span>
                  <span className="pn-activity-time">{formatAptDate(apt.date, apt.start_time)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Card 3 — Promemoria */}
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

      </div>
    </div>
  )
}
