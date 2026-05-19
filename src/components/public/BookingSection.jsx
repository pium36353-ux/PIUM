import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const STEPS = { SERVICE: 0, DATE: 1, SLOT: 2, FORM: 3, CONFIRM: 4, SUCCESS: 5 }
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

function generateSlotsForRange(startMin, endMin, dur, taken) {
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

function generateSlots(totalDuration, dateStr, opening_hours, taken) {
  const dayKey = DAYS[new Date(dateStr + 'T12:00:00').getDay()]
  const hours = opening_hours?.[dayKey]

  if (!hours || hours.closed) return []

  // New format: morning + afternoon blocks with active flag
  if (hours.morning !== undefined || hours.afternoon !== undefined) {
    const slots = []
    if (hours.morning?.active && hours.morning.open && hours.morning.close) {
      slots.push(...generateSlotsForRange(timeToMin(hours.morning.open), timeToMin(hours.morning.close), totalDuration, taken))
    }
    if (hours.afternoon?.active && hours.afternoon.open && hours.afternoon.close) {
      slots.push(...generateSlotsForRange(timeToMin(hours.afternoon.open), timeToMin(hours.afternoon.close), totalDuration, taken))
    }
    return slots
  }

  // Old format: open/close
  const startMin = hours.open ? timeToMin(hours.open) : 9 * 60
  const endMin   = hours.close ? timeToMin(hours.close) : 18 * 60
  return generateSlotsForRange(startMin, endMin, totalDuration, taken)
}

function formatDur(min) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export default function BookingSection({ business, services }) {
  const bookable = services.filter(s => s.duration_min)
  if (bookable.length === 0) return null

  const singleService = bookable.length === 1 ? bookable[0] : null

  const [step, setStep]                   = useState(singleService ? STEPS.DATE : STEPS.SERVICE)
  const [selectedServices, setSelectedServices] = useState(singleService ? [singleService] : [])
  const [date, setDate]                   = useState('')
  const [slot, setSlot]                   = useState(null)
  const [takenSlots, setTakenSlots]       = useState([])
  const [slotsLoading, setSlotsLoading]   = useState(false)
  const [form, setForm]                   = useState({ name: '', email: '', phone: '' })
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState(null)

  const totalDuration = selectedServices.reduce((acc, s) => acc + s.duration_min, 0)
  const totalPrice    = selectedServices.reduce((acc, s) => acc + (s.price ?? 0), 0)
  const hasPrice      = selectedServices.some(s => s.price != null)
  const servicesSummary = selectedServices.map(s => s.name).join(', ')

  function reset() {
    setStep(singleService ? STEPS.DATE : STEPS.SERVICE)
    setSelectedServices(singleService ? [singleService] : [])
    setDate('')
    setSlot(null)
    setTakenSlots([])
    setForm({ name: '', email: '', phone: '' })
    setError(null)
  }

  function toggleService(s) {
    setSelectedServices(prev => {
      const has = prev.some(x => x.id === s.id)
      return has ? prev.filter(x => x.id !== s.id) : [...prev, s]
    })
    setError(null)
  }

  function goToDate() {
    if (selectedServices.length === 0) { setError('Seleziona almeno un servizio'); return }
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

  function goToConfirm() {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError('Nome, email e telefono sono obbligatori')
      return
    }
    setError(null)
    setStep(STEPS.CONFIRM)
  }

  async function submitBooking() {
    setSubmitting(true)
    setError(null)
    const { error: e } = await supabase.rpc('create_booking', {
      p_business_id:    business.id,
      p_service_id:     selectedServices[0].id,
      p_customer_name:  form.name.trim(),
      p_customer_email: form.email.trim(),
      p_customer_phone: form.phone.trim(),
      p_date:           date,
      p_time:           slot,
      p_service_names:  selectedServices.map(s => s.name).join(', '),
    })
    setSubmitting(false)
    if (e) { setError(e.message); return }
    setStep(STEPS.SUCCESS)
  }

  const slots = step === STEPS.SLOT ? generateSlots(totalDuration, date, business.opening_hours, takenSlots) : []

  const formattedDate = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  return (
    <section className="bk-section" id="bk-booking">
      <h2 className="bk-title">Prenota un appuntamento</h2>

      {step === STEPS.SERVICE && (
        <div className="bk-step">
          <p className="bk-step-label">Scegli i servizi</p>
          <div className="bk-service-list">
            {bookable.map(s => {
              const checked = selectedServices.some(x => x.id === s.id)
              return (
                <button
                  key={s.id}
                  className={`bk-service-btn${checked ? ' bk-service-btn--selected' : ''}`}
                  onClick={() => toggleService(s)}
                >
                  <span className="bk-service-check">{checked ? '✓' : ''}</span>
                  <span className="bk-service-name">{s.name}</span>
                  <span className="bk-service-meta">
                    {formatDur(s.duration_min)}{s.price != null && <> · €{Number(s.price).toLocaleString('it-IT')}</>}
                  </span>
                </button>
              )
            })}
          </div>
          {selectedServices.length > 0 && (
            <div className="bk-total-bar">
              Totale: {formatDur(totalDuration)}{hasPrice && <> — €{Number(totalPrice).toLocaleString('it-IT')}</>}
            </div>
          )}
          <button className="bk-next-btn" onClick={goToDate} disabled={selectedServices.length === 0}>
            Continua
          </button>
        </div>
      )}

      {step === STEPS.DATE && (
        <div className="bk-step">
          {bookable.length > 1 && (
            <button className="bk-back" onClick={() => setStep(STEPS.SERVICE)}>← {servicesSummary}</button>
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
          <p className="bk-step-label">Scegli l'orario</p>
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
              Telefono *
              <input
                className="bk-input"
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+39 333 1234567"
                autoComplete="tel"
              />
            </label>
            <button className="bk-next-btn" onClick={goToConfirm}>
              Continua
            </button>
          </div>
        </div>
      )}

      {step === STEPS.CONFIRM && (
        <div className="bk-step">
          <button className="bk-back" onClick={() => setStep(STEPS.FORM)}>← Modifica dati</button>
          <p className="bk-step-label">Riepilogo prenotazione</p>
          <div className="bk-confirm-summary">
            <div className="bk-confirm-row">
              <span className="bk-confirm-label">Servizi</span>
              <span className="bk-confirm-value">{servicesSummary}</span>
            </div>
            <div className="bk-confirm-row">
              <span className="bk-confirm-label">Durata</span>
              <span className="bk-confirm-value">{formatDur(totalDuration)}{hasPrice && <> — €{Number(totalPrice).toLocaleString('it-IT')}</>}</span>
            </div>
            <div className="bk-confirm-row">
              <span className="bk-confirm-label">Data</span>
              <span className="bk-confirm-value">{formattedDate}</span>
            </div>
            <div className="bk-confirm-row">
              <span className="bk-confirm-label">Ora</span>
              <span className="bk-confirm-value">{slot}</span>
            </div>
            <div className="bk-confirm-row">
              <span className="bk-confirm-label">Nome</span>
              <span className="bk-confirm-value">{form.name}</span>
            </div>
            <div className="bk-confirm-row">
              <span className="bk-confirm-label">Telefono</span>
              <span className="bk-confirm-value">{form.phone}</span>
            </div>
          </div>
          <p className="bk-confirm-disclaimer">
            La tua richiesta è stata ricevuta da <strong>{business.name}</strong>. Riceverai un messaggio WhatsApp al numero {form.phone} — dovrai rispondere per confermare l'appuntamento. Senza conferma la prenotazione non sarà valida.
          </p>
          <button className="bk-submit-btn" onClick={submitBooking} disabled={submitting}>
            {submitting ? 'Invio in corso...' : 'Invia richiesta'}
          </button>
        </div>
      )}

      {step === STEPS.SUCCESS && (
        <div className="bk-step bk-step--success">
          <div className="bk-success-icon">✓</div>
          <h3 className="bk-success-title">Richiesta inviata!</h3>
          <p className="bk-success-detail">
            A breve riceverai un messaggio WhatsApp al numero {form.phone}. Rispondi al messaggio per confermare il tuo appuntamento.<br />
            Se non ricevi nulla entro qualche ora, contatta direttamente <strong>{business.name}</strong>{business.phone ? <> al {business.phone}</> : ''}.
          </p>
          <p className="bk-success-recap">{servicesSummary} — {formattedDate} alle {slot}</p>
          <button className="bk-back bk-back--reset" onClick={reset}>
            Prenota un altro appuntamento
          </button>
        </div>
      )}

      {error && <p className="bk-error">{error}</p>}
    </section>
  )
}
