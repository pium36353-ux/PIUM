import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { notifyNextAppointment, scheduleAllTodayNotifications } from '../../lib/notifications'

const COLORS    = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f43f5e','#84cc16','#a78bfa']
const DURATIONS = [15, 30, 45, 60, 90, 120]

const HOLIDAYS = [
  { month: 1,  day: 1,  name: 'Capodanno' },
  { month: 1,  day: 6,  name: 'Epifania' },
  { month: 4,  day: 25, name: 'Liberazione' },
  { month: 5,  day: 1,  name: 'Lavoro' },
  { month: 6,  day: 2,  name: 'Repubblica' },
  { month: 8,  day: 15, name: 'Ferragosto' },
  { month: 11, day: 1,  name: 'Ognissanti' },
  { month: 12, day: 8,  name: 'Immacolata' },
  { month: 12, day: 25, name: 'Natale' },
  { month: 12, day: 26, name: 'S. Stefano' },
]

const MONTHS_LONG = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const MONTHS      = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
const DAY_FULL    = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato']
const DAY_LETTER  = ['L','M','M','G','V','S','D']

const EMPTY_FORM = { date: '', client_name: '', employee_id: '', start_time: '09:00', duration_minutes: 60, price: '', notes: '' }
const EMPTY_EMP  = { name: '', color: COLORS[0] }

const SLOT_H = 12 // px per 5-minute slot

/* ── Date utilities ── */
function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getHoliday(date) {
  const m = date.getMonth() + 1; const d = date.getDate()
  return HOLIDAYS.find(h => h.month === m && h.day === d) ?? null
}

function fmtTime(t)      { return t ? t.slice(0, 5) : '' }
function fmtCurrency(v)  { return (v == null || v === '') ? '' : `€${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` }
function fmtDuration(m)  { if (m < 60) return `${m} min`; const h = Math.floor(m/60), r = m%60; return r ? `${h}h ${r}min` : `${h}h` }

// Returns 6 weeks of Date objects covering the given month (Mon-Sun rows)
function getMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const dow   = first.getDay() // 0=Sun
  const start = addDays(first, -(dow === 0 ? 6 : dow - 1))
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d))
  )
}

/* ── Component ── */
export default function Agenda({ business }) {
  const location = useLocation()
  const rNav     = useNavigate()

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [view,         setView]         = useState('month')
  const [monthDate,    setMonthDate]    = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay,  setSelectedDay]  = useState(today)

  const [appointments, setAppointments] = useState([])
  const [employees,    setEmployees]    = useState([])
  const [loading,      setLoading]      = useState(true)

  const [showModal,    setShowModal]    = useState(false)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [errors,       setErrors]       = useState({})
  const [saving,       setSaving]       = useState(false)

  const [showSettings,  setShowSettings]  = useState(false)
  const [empForm,       setEmpForm]       = useState(EMPTY_EMP)
  const [savingEmp,     setSavingEmp]     = useState(false)
  const [deletingEmpId, setDeletingEmpId] = useState(null)
  const [togglingId,    setTogglingId]    = useState(null)
  const [confirmDelId,  setConfirmDelId]  = useState(null)
  const [editingId,     setEditingId]     = useState(null)
  const [addAnotherTime, setAddAnotherTime] = useState(null)
  const [taxRate,       setTaxRate]       = useState(22)

  const [pendingBookings, setPendingBookings] = useState([])
  const [processingId,    setProcessingId]    = useState(null)
  const [confirmedWa,     setConfirmedWa]     = useState(null)

  const scrollToTimeRef = useRef(null)

  // Read location state after mount: atomically set date + view, then clear state
  useEffect(() => {
    const state   = location.state ?? {}
    const dateStr = state.selectedDate ?? state.agendaDate
    const forceDay = state.agendaView === 'day' || !!state.selectedDate

    if (dateStr) {
      const d = new Date(dateStr + 'T00:00:00')
      d.setHours(0, 0, 0, 0)
      setSelectedDay(d)
      setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1))
    }
    if (forceDay) setView('day')
    if (state.selectedTime) scrollToTimeRef.current = state.selectedTime

    if (state.agendaView || state.agendaDate || state.selectedDate || state.selectedTime) {
      rNav(location.pathname, { state: {}, replace: true })
    }
  }, []) // eslint-disable-line

  /* ── Load ── */
  const loadEmployees = useCallback(async () => {
    if (!business) return
    const { data } = await supabase.from('employees').select('*').eq('business_id', business.id).order('created_at')
    setEmployees(data ?? [])
  }, [business])

  const loadAppointments = useCallback(async () => {
    if (!business) return
    setLoading(true)
    let q = supabase.from('appointments').select('*, employees(name, color), bookings(customer_phone, services(name))').eq('business_id', business.id)
    if (view === 'month') {
      const lastOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
      q = q.gte('date', formatDate(monthDate)).lte('date', formatDate(lastOfMonth))
    } else {
      q = q.eq('date', formatDate(selectedDay))
    }
    const { data } = await q.order('date').order('start_time')
    setAppointments(data ?? [])
    scheduleAllTodayNotifications(data ?? [])
    setLoading(false)
  }, [business, view, monthDate, selectedDay])

  const loadPendingBookings = useCallback(async () => {
    if (!business) return
    const { data } = await supabase.from('bookings')
      .select('*, services(name)')
      .eq('business_id', business.id)
      .eq('status', 'pending')
      .order('appointment_date')
      .order('appointment_time')
    setPendingBookings(data ?? [])
  }, [business])

  useEffect(() => { loadEmployees() },       [loadEmployees])
  useEffect(() => { loadAppointments() },    [loadAppointments])
  useEffect(() => { loadPendingBookings() }, [loadPendingBookings])

  /* ── Modal helpers ── */
  const openModal = (date = formatDate(selectedDay), time = '09:00') => {
    loadEmployees()
    setForm({ ...EMPTY_FORM, date, start_time: time })
    setEditingId(null)
    setErrors({})
    setShowModal(true)
  }
  const openEditModal = (apt, tappedTime = null) => {
    loadEmployees()
    setForm({
      date:             apt.date,
      client_name:      apt.client_name,
      employee_id:      apt.employee_id ?? '',
      start_time:       apt.start_time?.slice(0, 5) ?? '09:00',
      duration_minutes: apt.duration_minutes ?? 60,
      price:            apt.price != null ? String(apt.price) : '',
      notes:            apt.notes ?? '',
    })
    setEditingId(apt.id)
    setAddAnotherTime(tappedTime ?? apt.start_time?.slice(0, 5) ?? '09:00')
    setErrors({})
    setShowModal(true)
  }
  const closeModal = () => { setShowModal(false); setEditingId(null); setAddAnotherTime(null) }
  const setField = (f) => (e) => { setForm(p => ({ ...p, [f]: e.target.value })); setErrors(p => ({ ...p, [f]: null })) }

  /* ── Validation ── */
  const validate = () => {
    const e = {}
    if (!form.date)                               e.date        = 'Seleziona una data.'
    if (!form.client_name.trim())                 e.client_name = 'Il nome è obbligatorio.'
    if (form.price !== '' && isNaN(Number(form.price))) e.price = 'Numero non valido.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /* ── CRUD: appointments ── */
  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    const payload = {
      client_name:      form.client_name.trim(),
      employee_id:      form.employee_id || null,
      date:             form.date,
      start_time:       form.start_time,
      duration_minutes: Number(form.duration_minutes),
      price:            form.price !== '' ? Number(form.price) : null,
      notes:            form.notes.trim() || null,
    }
    if (editingId) {
      await supabase.from('appointments').update(payload).eq('id', editingId)
    } else {
      await supabase.from('appointments').insert({ ...payload, business_id: business.id, completed: false })
      logActivity(business.id, business.user_id, 'appointment_created', `Appuntamento creato: ${form.client_name.trim()} il ${form.date}`)
    }
    setSaving(false)
    closeModal()
    loadAppointments()
  }

  const toggleCompleted = async (apt) => {
    setTogglingId(apt.id)
    const newCompleted = !apt.completed
    await supabase.from('appointments').update({ completed: newCompleted }).eq('id', apt.id)
    const updated = appointments.map(a => a.id === apt.id ? { ...a, completed: newCompleted } : a)
    setAppointments(updated)
    if (newCompleted) notifyNextAppointment(updated)
    setTogglingId(null)
  }

  const deleteAppointment = async (id) => {
    await supabase.from('appointments').delete().eq('id', id)
    setAppointments(prev => prev.filter(a => a.id !== id))
    setConfirmDelId(null)
  }

  const confirmPendingBooking = async (id) => {
    const booking = pendingBookings.find(b => b.id === id)
    setProcessingId(id)
    await supabase.rpc('owner_confirm_booking', { p_booking_id: id })
    setProcessingId(null)
    if (booking) setConfirmedWa(booking)
    loadPendingBookings()
    loadAppointments()
  }

  const rejectPendingBooking = async (id) => {
    setProcessingId(id)
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
    setProcessingId(null)
    loadPendingBookings()
  }

  /* ── CRUD: employees ── */
  const handleSaveEmployee = async () => {
    if (!empForm.name.trim()) return
    setSavingEmp(true)
    await supabase.from('employees').insert({ business_id: business.id, name: empForm.name.trim(), color: empForm.color })
    setSavingEmp(false)
    setEmpForm(EMPTY_EMP)
    loadEmployees()
  }
  const handleDeleteEmployee = async (id) => {
    setDeletingEmpId(id)
    await supabase.from('employees').delete().eq('id', id)
    setEmployees(prev => prev.filter(e => e.id !== id))
    setDeletingEmpId(null)
  }

  if (!business) return <div className="db-section"><div className="db-empty-banner">Configura prima la tua attività.</div></div>

  /* ── Derived data ── */
  const monthGrid = getMonthGrid(monthDate.getFullYear(), monthDate.getMonth())
  const aptsOnDay = (day) => appointments.filter(a => a.date === formatDate(day))

  const dayApts  = appointments.filter(a => a.date === formatDate(selectedDay))
                               .sort((a, b) => a.start_time.localeCompare(b.start_time))
  const doneApts = dayApts.filter(a => a.completed)
  const gross    = doneApts.reduce((s, a) => s + (Number(a.price) || 0), 0)
  const net      = gross * (1 - taxRate / 100)

  const goToDay = (day) => {
    const d = new Date(day); d.setHours(0, 0, 0, 0)
    setSelectedDay(d)
    setView('day')
  }

  /* ── Render ── */
  return (
    <div className="db-section">

      {/* ── Header ── */}
      <div className="ag-header">

        {/* View tabs */}
        <div className="ag-view-tabs">
          <button
            className={`ag-view-tab ${view === 'month' ? 'ag-view-tab--active' : ''}`}
            onClick={() => setView('month')}
          >
            Mese
          </button>
          <button
            className={`ag-view-tab ${view === 'day' ? 'ag-view-tab--active' : ''}`}
            onClick={() => setView('day')}
          >
            Giorno
          </button>
        </div>

        {/* Navigation */}
        <div className="ag-nav">
          <button className="ag-nav-btn" onClick={() => {
            if (view === 'month') setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
            else setSelectedDay(d => addDays(d, -1))
          }} aria-label="Precedente"><IconChevLeft /></button>

          <span className="ag-nav-label">
            {view === 'month'
              ? `${MONTHS_LONG[monthDate.getMonth()]} ${monthDate.getFullYear()}`
              : `${DAY_FULL[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTHS[selectedDay.getMonth()]} ${selectedDay.getFullYear()}`
            }
          </span>

          <button className="ag-nav-btn" onClick={() => {
            if (view === 'month') setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
            else setSelectedDay(d => addDays(d, 1))
          }} aria-label="Successivo"><IconChevRight /></button>
        </div>

        {/* Actions */}
        <div className="ag-header-actions">
          <button className="db-btn-primary" onClick={() => openModal(view === 'day' ? formatDate(selectedDay) : formatDate(today))}>
            + Appuntamento
          </button>
          <button
            className={`ag-settings-btn ${showSettings ? 'ag-settings-btn--active' : ''}`}
            onClick={() => setShowSettings(s => !s)}
            title="Gestione dipendenti"
          >
            <IconSettings />
          </button>
        </div>
      </div>

      {/* ── Pending bookings panel ── */}
      {pendingBookings.length > 0 && (
        <div className="ag-pending-panel">
          <div className="ag-pending-header">
            <span className="ag-pending-title">Prenotazioni in attesa</span>
            <span className="ag-pending-count">{pendingBookings.length}</span>
          </div>
          <div className="ag-pending-list">
            {pendingBookings.map(b => {
              const dateLabel = new Date(b.appointment_date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
              return (
                <div key={b.id} className="ag-pending-card">
                  <div className="ag-pending-info">
                    <span className="ag-pending-name">{b.customer_name}</span>
                    <span className="ag-pending-detail">
                      {b.services?.name && <>{b.services.name} · </>}
                      {dateLabel} alle {b.appointment_time?.slice(0, 5)}
                    </span>
                    {(b.customer_email || b.customer_phone) && (
                      <span className="ag-pending-contact">
                        {b.customer_email}{b.customer_phone ? ` · ${b.customer_phone}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="ag-pending-actions">
                    <button
                      className="ag-pending-btn ag-pending-btn--confirm"
                      onClick={() => confirmPendingBooking(b.id)}
                      disabled={processingId === b.id}
                    >
                      {processingId === b.id ? '…' : 'Conferma'}
                    </button>
                    <button
                      className="ag-pending-btn ag-pending-btn--reject"
                      onClick={() => rejectPendingBooking(b.id)}
                      disabled={processingId === b.id}
                    >
                      Rifiuta
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── WhatsApp conferma banner ── */}
      {confirmedWa && (() => {
        const dateLabel = new Date(confirmedWa.appointment_date + 'T12:00:00')
          .toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
        const msg = `Ciao ${confirmedWa.customer_name}, la tua prenotazione per ${confirmedWa.services?.name ?? 'il servizio'} è confermata per ${dateLabel} alle ${confirmedWa.appointment_time?.slice(0, 5)}. A presto! — ${business.name}`
        const waLink = buildWaLink(confirmedWa.customer_phone, msg)
        return (
          <div className="ag-wa-banner">
            <span className="ag-wa-banner-text">
              ✓ Prenotazione di <strong>{confirmedWa.customer_name}</strong> confermata
            </span>
            <div className="ag-wa-banner-actions">
              {waLink
                ? <a className="ag-wa-btn" href={waLink} target="_blank" rel="noopener noreferrer">Invia conferma su WhatsApp</a>
                : <span className="ag-wa-no-phone">Nessun numero disponibile</span>
              }
              <button className="ag-wa-dismiss" onClick={() => setConfirmedWa(null)}><IconX /></button>
            </div>
          </div>
        )
      })()}

      {/* ── Month view ── */}
      {view === 'month' && (
        <div className="ag-month">
          {/* Day name headers */}
          <div className="ag-month-header">
            {DAY_LETTER.map((l, i) => (
              <div key={i} className="ag-month-day-name">{l}</div>
            ))}
          </div>
          {/* Grid */}
          {monthGrid.map((week, wi) => (
            <div key={wi} className="ag-month-week">
              {week.map((day, di) => {
                const isToday     = sameDay(day, today)
                const isThisMonth = day.getMonth() === monthDate.getMonth()
                const holiday     = getHoliday(day)
                const apts        = aptsOnDay(day)
                return (
                  <div
                    key={di}
                    className={[
                      'ag-month-cell',
                      isToday      ? 'ag-month-cell--today'   : '',
                      !isThisMonth ? 'ag-month-cell--other'   : '',
                      holiday      ? 'ag-month-cell--holiday' : '',
                    ].join(' ')}
                    onClick={() => goToDay(day)}
                  >
                    <div className="ag-month-cell-top">
                      <span className="ag-month-cell-num">{day.getDate()}</span>
                      <button
                        className="ag-month-cell-add"
                        onClick={e => { e.stopPropagation(); openModal(formatDate(day)) }}
                        title="Nuovo appuntamento"
                      >+</button>
                    </div>
                    {holiday && <span className="ag-month-holiday-name">{holiday.name}</span>}
                    {apts.length > 0 && (
                      <div className="ag-month-dots">
                        {apts.slice(0, 3).map(a => (
                          <span
                            key={a.id}
                            className="ag-month-dot"
                            style={{ background: a.employees?.color ?? '#94a3b8' }}
                          />
                        ))}
                        {apts.length > 3 && <span className="ag-month-dot-more">+{apts.length - 3}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          <p className="ag-month-hint">Clicca su un giorno per aprire la vista giornaliera · usa + per aggiungere un appuntamento</p>
        </div>
      )}

      {/* ── Day view ── */}
      {view === 'day' && (
        <>
          <DayTimeline
            dayApts={dayApts}
            loading={loading}
            togglingId={togglingId}
            confirmDelId={confirmDelId}
            openModal={openModal}
            openEditModal={openEditModal}
            toggleCompleted={toggleCompleted}
            deleteAppointment={deleteAppointment}
            setConfirmDelId={setConfirmDelId}
            selectedDay={selectedDay}
            openingHours={business?.opening_hours}
            businessName={business?.name ?? ''}
            scrollToTimeRef={scrollToTimeRef}
          />

          {/* Daily summary */}
          <div className="ag-summary">
            <div className="ag-summary-title">Riepilogo giornaliero</div>
            <div className="ag-summary-body">
              <div className="ag-summary-row">
                <span>Appuntamenti completati</span>
                <span>{doneApts.length} / {dayApts.length}</span>
              </div>
              <div className="ag-summary-row">
                <span>Totale lordo</span>
                <strong>{fmtCurrency(gross) || '€0'}</strong>
              </div>
              <div className="ag-summary-row">
                <span>Tasse</span>
                <div className="ag-tax-wrap">
                  <input className="ag-tax-input" type="number" min="0" max="100" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} />
                  <span>%</span>
                </div>
              </div>
              <div className="ag-summary-row ag-summary-row--net">
                <span>Totale netto stimato</span>
                <strong>{fmtCurrency(net) || '€0'}</strong>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Settings panel ── */}
      {showSettings && (
        <div className="ag-settings">
          <div className="ag-settings-head">
            <span className="ag-settings-title">Gestione dipendenti</span>
            <button className="sv-modal-close" onClick={() => setShowSettings(false)}><IconX /></button>
          </div>
          {employees.length === 0 ? (
            <p className="ag-emp-empty">Nessun dipendente ancora.</p>
          ) : (
            <div className="ag-emp-list">
              {employees.map(emp => (
                <div key={emp.id} className="ag-emp-row">
                  <span className="ag-emp-dot" style={{ background: emp.color }} />
                  <span className="ag-emp-name">{emp.name}</span>
                  <button className="sv-action-btn sv-action-btn--danger" onClick={() => handleDeleteEmployee(emp.id)} disabled={deletingEmpId === emp.id}><IconTrash /></button>
                </div>
              ))}
            </div>
          )}
          <div className="ag-emp-add-form">
            <input className="sv-input ag-emp-input" type="text" placeholder="Nome dipendente" value={empForm.name} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleSaveEmployee()} />
            <div className="ag-palette">
              {COLORS.map(c => (
                <button key={c} className={`ag-swatch ${empForm.color === c ? 'ag-swatch--active' : ''}`} style={{ background: c }} onClick={() => setEmpForm(f => ({ ...f, color: c }))} />
              ))}
            </div>
            <button className="db-btn-primary ag-emp-add-btn" onClick={handleSaveEmployee} disabled={savingEmp || !empForm.name.trim()}>
              {savingEmp ? 'Salvataggio…' : 'Aggiungi dipendente'}
            </button>
          </div>
        </div>
      )}

      {/* ── New / edit appointment modal ── */}
      {showModal && (
        <div className="sv-modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">{editingId ? 'Modifica appuntamento' : 'Nuovo appuntamento'}</h2>
              <button className="sv-modal-close" onClick={closeModal}><IconX /></button>
            </div>

            <div className="sv-modal-body">

              {editingId && (
                <button
                  className="ag-add-another-btn"
                  onClick={() => {
                    const date = form.date
                    const time = addAnotherTime ?? form.start_time
                    setEditingId(null)
                    setAddAnotherTime(null)
                    setForm({ ...EMPTY_FORM, date, start_time: time })
                    setErrors({})
                  }}
                >
                  + Aggiungi altro appuntamento alle {addAnotherTime ?? form.start_time?.slice(0, 5)}
                </button>
              )}

              {/* Date */}
              <div className="sv-fields-row">
                <div className="sv-field">
                  <label className="sv-label">Data <span className="sv-required">*</span></label>
                  <input
                    className={`sv-input ${errors.date ? 'sv-input--error' : ''}`}
                    type="date"
                    value={form.date}
                    onChange={setField('date')}
                  />
                  {errors.date && <p className="sv-field-error">{errors.date}</p>}
                </div>
                <div className="sv-field">
                  <label className="sv-label">Ora inizio</label>
                  <input className="sv-input" type="time" value={form.start_time} onChange={setField('start_time')} />
                </div>
              </div>

              {/* Client */}
              <div className="sv-field">
                <label className="sv-label">Nome cliente <span className="sv-required">*</span></label>
                <input
                  className={`sv-input ${errors.client_name ? 'sv-input--error' : ''}`}
                  type="text"
                  value={form.client_name}
                  onChange={setField('client_name')}
                  placeholder="es. Mario Rossi"
                  enterKeyHint="next"
                />
                {errors.client_name && <p className="sv-field-error">{errors.client_name}</p>}
              </div>

              {/* Employee + Duration */}
              <div className="sv-fields-row">
                <div className="sv-field">
                  <label className="sv-label">Dipendente <span className="sv-optional">(facoltativo)</span></label>
                  <select className="sv-input sv-select" value={form.employee_id} onChange={setField('employee_id')}>
                    <option value="">— Nessuno —</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
                <div className="sv-field">
                  <label className="sv-label">Durata</label>
                  <select className="sv-input sv-select" value={form.duration_minutes} onChange={setField('duration_minutes')}>
                    {DURATIONS.map(d => <option key={d} value={d}>{fmtDuration(d)}</option>)}
                  </select>
                </div>
              </div>

              {/* Price */}
              <div className="sv-field sv-field--half">
                <label className="sv-label">Prezzo (€) <span className="sv-optional">(facoltativo)</span></label>
                <input
                  className={`sv-input ${errors.price ? 'sv-input--error' : ''}`}
                  type="number" min="0" step="0.01"
                  value={form.price}
                  onChange={setField('price')}
                  placeholder="es. 50"
                />
                {errors.price && <p className="sv-field-error">{errors.price}</p>}
              </div>

              {/* Notes */}
              <div className="sv-field">
                <label className="sv-label">Note <span className="sv-optional">(facoltativo)</span></label>
                <textarea className="sv-textarea" value={form.notes} onChange={setField('notes')} placeholder="Note sull'appuntamento…" rows={2} enterKeyHint="done" />
              </div>

            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={closeModal}>Annulla</button>
              <button className="sv-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvataggio…' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

/* ── WhatsApp helper ── */
function buildWaLink(phone, message) {
  const clean = phone?.replace(/\D/g, '')
  if (!clean) return null
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
}

/* ── Timeline helpers ── */
function buildAptBlocks(apts) {
  const items = [...apts].map(a => {
    const [h, m] = (a.start_time ?? '00:00').split(':').map(Number)
    const startMin = h * 60 + m
    const endMin   = startMin + (Number(a.duration_minutes) || 60)
    return { ...a, startMin, endMin, col: 0, maxCols: 1 }
  }).sort((a, b) => a.startMin - b.startMin)

  const colEnds = []
  items.forEach(apt => {
    let c = colEnds.findIndex(end => end <= apt.startMin)
    if (c === -1) c = colEnds.length
    apt.col = c
    colEnds[c] = apt.endMin
  })

  items.forEach(apt => {
    const overlapping = items.filter(o => o.startMin < apt.endMin && o.endMin > apt.startMin)
    apt.maxCols = overlapping.reduce((max, o) => Math.max(max, o.col + 1), 0)
  })

  return items
}

const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

function DayTimeline({ dayApts, loading, togglingId, confirmDelId, openModal, openEditModal, toggleCompleted, deleteAppointment, setConfirmDelId, selectedDay, openingHours, businessName, scrollToTimeRef }) {
  const wrapRef = useRef(null)

  useEffect(() => {
    if (loading || !wrapRef.current) return

    // If we arrived here from Panoramica with a specific appointment time, scroll to it once
    if (scrollToTimeRef?.current) {
      const [h, m] = scrollToTimeRef.current.split(':').map(Number)
      const startMin = h * 60 + m
      wrapRef.current.scrollTop = Math.max(0, startMin - 60) / 5 * SLOT_H
      scrollToTimeRef.current = null
      return
    }

    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)
    const isToday = selectedDay.getTime() === todayMidnight.getTime()

    let scrollPx
    if (isToday) {
      scrollPx = Math.max(0, new Date().getHours() - 1) * 60 * SLOT_H / 5
    } else {
      const dayKey = DAY_KEYS[selectedDay.getDay()]
      const dayH   = openingHours?.[dayKey]
      if (dayH && !dayH.closed && dayH.open) {
        const [h, m] = dayH.open.split(':').map(Number)
        scrollPx = ((h * 60 + m) / 5) * SLOT_H
      } else {
        scrollPx = 8 * 60 * SLOT_H / 5
      }
    }
    wrapRef.current.scrollTop = scrollPx
  }, [selectedDay, loading, openingHours])

  const blocks = buildAptBlocks(dayApts)

  return (
    <div className="ag-day-wrap" ref={wrapRef}>
      {loading ? (
        <div className="ag-day-loading"><AgSpinner /></div>
      ) : (
        <div className="ag-time-grid">

          {/* Left: time labels (one per 30 min) */}
          <div className="ag-time-labels">
            {Array.from({ length: 48 }, (_, i) => {
              const totalMin = i * 30
              const h = Math.floor(totalMin / 60)
              const m = totalMin % 60
              const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
              return (
                <div
                  key={i}
                  className={`ag-time-label ${m === 0 ? 'ag-time-label--hour' : 'ag-time-label--half'}`}
                  style={{ height: SLOT_H * 6 }}
                >
                  {label}
                </div>
              )
            })}
          </div>

          {/* Right: slot rows + absolute appointment blocks */}
          <div className="ag-slots-col" style={{ position: 'relative' }}>
            {Array.from({ length: 288 }, (_, i) => {
              const h = Math.floor(i / 12)
              const m = (i % 12) * 5
              const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
              const posInHour = i % 12
              let slotCls = 'ag-slot'
              if (posInHour === 11)     slotCls += ' ag-slot--hour'
              else if (posInHour === 5) slotCls += ' ag-slot--half'
              return (
                <div key={i} className={slotCls} style={{ height: SLOT_H }}>
                  <button
                    className="ag-slot-add"
                    onClick={() => openModal(formatDate(selectedDay), timeStr)}
                    aria-label={`Nuovo appuntamento alle ${timeStr}`}
                    tabIndex={-1}
                  >+ {timeStr}</button>
                </div>
              )
            })}

            {blocks.map(apt => {
              const top    = (apt.startMin / 5) * SLOT_H
              const height = Math.max((Number(apt.duration_minutes) / 5) * SLOT_H, SLOT_H * 2)
              const color  = apt.employees?.color ?? '#94a3b8'
              const pct    = 100 / apt.maxCols
              const isDone = apt.completed
              const waReminderLink = apt.bookings?.customer_phone
                ? buildWaLink(apt.bookings.customer_phone, `Ciao ${apt.client_name}, ti ricordiamo l'appuntamento di domani alle ${apt.start_time?.slice(0, 5)} per ${apt.bookings?.services?.name ?? 'il tuo appuntamento'}. A presto! — ${businessName}`)
                : null
              return (
                <div
                  key={apt.id}
                  className={`ag-apt ${isDone ? 'ag-apt--done' : ''}`}
                  style={{
                    position: 'absolute',
                    top,
                    left: `${apt.col * pct}%`,
                    width: `calc(${pct}% - 3px)`,
                    height,
                    background: isDone ? 'rgba(34,197,94,0.12)' : `${color}1e`,
                    borderLeft: `3px solid ${isDone ? '#22c55e' : color}`,
                    borderRadius: 4,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    zIndex: 1,
                    boxSizing: 'border-box',
                  }}
                  onClick={(e) => {
                    const offsetY = e.clientY - e.currentTarget.getBoundingClientRect().top
                    const tappedMin = apt.startMin + Math.floor(offsetY / SLOT_H) * 5
                    const th = Math.floor(tappedMin / 60)
                    const tm = tappedMin % 60
                    openEditModal(apt, `${String(th).padStart(2,'0')}:${String(tm).padStart(2,'0')}`)
                  }}
                >
                  <div className="ag-apt-inner">
                    <div className="ag-apt-top-row">
                      <span className="ag-apt-time">{apt.start_time?.slice(0, 5)}</span>
                      <div className="ag-apt-btns" onClick={e => e.stopPropagation()}>
                        <button
                          className={`ag-apt-btn-check ${isDone ? 'ag-apt-btn-check--on' : ''}`}
                          onClick={e => { e.stopPropagation(); toggleCompleted(apt) }}
                          disabled={togglingId === apt.id}
                          title={isDone ? 'Annulla completamento' : 'Segna completato'}
                        ><IconCheck /></button>
                        {confirmDelId === apt.id ? (
                          <>
                            <button className="ag-apt-btn-del ag-apt-btn-del--confirm" onClick={e => { e.stopPropagation(); deleteAppointment(apt.id) }} title="Conferma"><IconCheck /></button>
                            <button className="ag-apt-btn" onClick={e => { e.stopPropagation(); setConfirmDelId(null) }}><IconX /></button>
                          </>
                        ) : (
                          <button className="ag-apt-btn-del" onClick={e => { e.stopPropagation(); setConfirmDelId(apt.id) }} title="Elimina"><IconTrash /></button>
                        )}
                      </div>
                    </div>
                    <span className="ag-apt-client">{apt.client_name}</span>
                    {apt.employees && (
                      <span className="ag-apt-employee" style={{ color: isDone ? '#22c55e' : color }}>
                        {apt.employees.name}
                      </span>
                    )}
                    {(apt.price != null || apt.duration_minutes) && (
                      <span className="ag-apt-detail">
                        {fmtDuration(apt.duration_minutes)}{apt.price != null ? ` · ${fmtCurrency(apt.price)}` : ''}
                      </span>
                    )}
                    {apt.notes && <span className="ag-apt-notes">{apt.notes}</span>}
                    {waReminderLink && (
                      <a
                        className="ag-apt-wa"
                        href={waReminderLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                      >Promemoria</a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      )}
    </div>
  )
}

/* ── Icons ── */
function IconChevLeft()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> }
function IconChevRight() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg> }
function IconCheck()     { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconX()         { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconTrash()     { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> }
function IconSettings()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
function AgSpinner() {
  return <svg style={{ width: 24, height: 24, animation: 'ag-spin 0.8s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
