import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const STEPS = { SERVICE: 0, DATE: 1, SLOT: 2, FORM: 3, SUCCESS: 4 }
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function maxDateStr() {
  const d = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function generateSlots(service, dateStr, opening_hours, taken) {
  const dayKey = DAYS[new Date(dateStr + 'T12:00:00').getDay()]
  const hours = opening_hours?.[dayKey]

  let startMin = 9 * 60
  let endMin = 18 * 60

  if (hours) {
    if (hours.closed) return []
    if (hours.open && hours.close) {
      startMin = timeToMin(hours.open)
      endMin = timeToMin(hours.close)
    }
  }

  const dur = service.duration_min
  const slots = []
  let cur = startMin

  while (cur + dur <= endMin) {
    const label = `${Math.floor(cur / 60).toString().padStart(2, '0')}:${(cur % 60).toString().padStart(2, '0')}`
    const conflict = taken.some(t => {
      const ts = timeToMin(t.start_time)
      const te = ts + t.duration_minutes
      return cur < te && cur + dur > ts
    })
    if (!conflict) slots.push(label)
    cur += dur
  }
  return slots
}

function formatDur(min) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export default function BookingSection({ business, services }) {
  const bookable = services.filter(s => s.duration_min)
  if (bookable.length === 0) return null

  const [step, setStep] = useState(bookable.length === 1 ? STEPS.DATE : STEPS.SERVICE)
  const [service, setService] = useState(bookable.length === 1 ? bookable[0] : null)
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState(null)
  const [takenSlots, setTakenSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function reset() {
    setStep(bookable.length === 1 ? STEPS.DATE : STEPS.SERVICE)
    setService(bookable.length === 1 ? bookable[0] : null)
    setDate('')
    setSlot(null)
    setTakenSlots([])
    setForm({ name: '', email: '', phone: '' })
    setError(null)
  }

  function pickService(s) {
    setService(s)
    setError(null)
    setStep(STEPS.DATE)
  }

  async function pickDate() {
    if (!date) return
    setSlotsLoading(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('get_taken_slots', {
      p_business_id: business.id,
      p_date: date,
    })
    setSlotsLoading(false)
    if (e) { setError('Errore nel caricamento degli orari. Riprova.'); return }
    setTakenSlots(data || [])
    setStep(STEPS.SLOT)
  }

  function pickSlot(s) {
    setSlot(s)
    setError(null)
    setStep(STEPS.FORM)
  }

  async function submitBooking() {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Nome e email sono obbligatori')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: e } = await supabase.rpc('create_booking', {
      p_business_id:    business.id,
      p_service_id:     service.id,
      p_customer_name:  form.name.trim(),
      p_customer_email: form.email.trim(),
      p_customer_phone: form.phone.trim() || null,
      p_date:           date,
      p_time:           slot,
    })
    setSubmitting(false)
    if (e) { setError(e.message); return }
    setStep(STEPS.SUCCESS)
  }

  const slots = step === STEPS.SLOT ? generateSlots(service, date, business.opening_hours, takenSlots) : []

  const formattedDate = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  return (
    <section className="bk-section" id="bk-booking">
      <h2 className="bk-title">Prenota un appuntamento</h2>

      {step === STEPS.SERVICE && (
        <div className="bk-step">
          <p className="bk-step-label">Scegli il servizio</p>
          <div className="bk-service-list">
            {bookable.map(s => (
              <button key={s.id} className="bk-service-btn" onClick={() => pickService(s)}>
                <span className="bk-service-name">{s.name}</span>
                <span className="bk-service-meta">
                  {formatDur(s.duration_min)}{s.price != null && <> · €{Number(s.price).toLocaleString('it-IT')}</>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === STEPS.DATE && (
        <div className="bk-step">
          {bookable.length > 1 && (
            <button className="bk-back" onClick={() => setStep(STEPS.SERVICE)}>← {service?.name}</button>
          )}
          <p className="bk-step-label">Scegli la data</p>
          <input
            type="date"
            className="bk-date-input"
            value={date}
            min={todayStr()}
            max={maxDateStr()}
            onChange={e => setDate(e.target.value)}
          />
          <button className="bk-next-btn" onClick={pickDate} disabled={!date || slotsLoading}>
            {slotsLoading ? 'Caricamento...' : 'Vedi orari disponibili'}
          </button>
        </div>
      )}

      {step === STEPS.SLOT && (
        <div className="bk-step">
          <button className="bk-back" onClick={() => setStep(STEPS.DATE)}>← {formattedDate}</button>
          <p className="bk-step-label">Scegli l'orario — {service?.name}</p>
          {slots.length === 0
            ? <p className="bk-no-slots">Nessuno slot disponibile per questa data. Prova un altro giorno.</p>
            : (
              <div className="bk-slots-grid">
                {slots.map(s => (
                  <button key={s} className="bk-slot-btn" onClick={() => pickSlot(s)}>{s}</button>
                ))}
              </div>
            )
          }
        </div>
      )}

      {step === STEPS.FORM && (
        <div className="bk-step">
          <button className="bk-back" onClick={() => setStep(STEPS.SLOT)}>← {slot}</button>
          <p className="bk-step-label">I tuoi dati</p>
          <div className="bk-form">
            <label className="bk-label">
              Nome e cognome *
              <input
                className="bk-input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Mario Rossi"
                autoComplete="name"
              />
            </label>
            <label className="bk-label">
              Email *
              <input
                className="bk-input"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="mario@email.com"
                autoComplete="email"
              />
            </label>
            <label className="bk-label">
              Telefono
              <input
                className="bk-input"
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+39 333 1234567"
                autoComplete="tel"
              />
            </label>
            <button className="bk-submit-btn" onClick={submitBooking} disabled={submitting}>
              {submitting ? 'Invio in corso...' : 'Invia prenotazione'}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.SUCCESS && (
        <div className="bk-step bk-step--success">
          <div className="bk-success-icon">✓</div>
          <h3 className="bk-success-title">Prenotazione ricevuta!</h3>
          <p className="bk-success-detail">
            Il titolare la confermerà a breve.<br />
            <strong>{service?.name}</strong> — {formattedDate} alle {slot}
          </p>
          <button className="bk-back bk-back--reset" onClick={reset}>
            Prenota un altro appuntamento
          </button>
        </div>
      )}

      {error && <p className="bk-error">{error}</p>}
    </section>
  )
}
