import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f43f5e', '#84cc16', '#a78bfa',
]
const DURATIONS = [30, 60, 90, 120]
const SLOT_H = 48 // px per 30-min slot

const HOLIDAYS = [
  { month: 1,  day: 1,  name: 'Capodanno' },
  { month: 1,  day: 6,  name: 'Epifania' },
  { month: 4,  day: 25, name: 'Liberazione' },
  { month: 5,  day: 1,  name: 'Festa del Lavoro' },
  { month: 6,  day: 2,  name: 'Repubblica' },
  { month: 8,  day: 15, name: 'Ferragosto' },
  { month: 11, day: 1,  name: 'Ognissanti' },
  { month: 12, day: 8,  name: 'Immacolata' },
  { month: 12, day: 25, name: 'Natale' },
  { month: 12, day: 26, name: 'S. Stefano' },
]

const EMPTY_FORM = {
  client_name: '',
  employee_id: '',
  start_time: '09:00',
  duration_minutes: 60,
  price: '',
  notes: '',
}
const EMPTY_EMP = { name: '', color: COLORS[0] }

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const DAY_FULL  = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MONTHS    = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']

/* ── Date utilities ── */
function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}

// Parses a TIME string like "09:30" or "09:30:00"
function minsFromMidnight(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function slotToTime(i) {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
}

// Formats a TIME string "HH:MM:SS" → "HH:MM"
function fmtTime(timeStr) {
  return timeStr ? timeStr.slice(0, 5) : ''
}

function fmtCurrency(v) {
  if (v == null || v === '') return '—'
  return `€${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtDuration(min) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function getHoliday(date) {
  const m = date.getMonth() + 1
  const d = date.getDate()
  return HOLIDAYS.find(h => h.month === m && h.day === d) ?? null
}

// Assigns column index and total-columns-in-group to each appointment
// so overlapping appointments can be rendered side by side.
function computeColumns(apts) {
  if (apts.length === 0) return { colOf: {}, spanOf: {} }
  const sorted = [...apts].sort((a, b) =>
    minsFromMidnight(a.start_time) - minsFromMidnight(b.start_time)
  )
  const colOf   = {}
  const colEnds = []
  for (const apt of sorted) {
    const start = minsFromMidnight(apt.start_time)
    const end   = start + apt.duration_minutes
    let col = 0
    while (colEnds[col] !== undefined && colEnds[col] > start) col++
    colOf[apt.id] = col
    colEnds[col]  = end
  }
  const spanOf = {}
  for (const apt of apts) {
    const start = minsFromMidnight(apt.start_time)
    const end   = start + apt.duration_minutes
    let maxCol = colOf[apt.id]
    for (const other of apts) {
      if (other.id === apt.id) continue
      const os = minsFromMidnight(other.start_time)
      if (os < end && (os + other.duration_minutes) > start) {
        maxCol = Math.max(maxCol, colOf[other.id])
      }
    }
    spanOf[apt.id] = maxCol + 1
  }
  return { colOf, spanOf }
}

/* ── Component ── */
export default function Agenda({ business }) {
  const [view,         setView]         = useState('week')
  const [weekStart,    setWeekStart]    = useState(() => getMonday(new Date()))
  const [selectedDay,  setSelectedDay]  = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [appointments, setAppointments] = useState([])
  const [employees,    setEmployees]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [empForm,      setEmpForm]      = useState(EMPTY_EMP)
  const [taxRate,      setTaxRate]      = useState(22)
  const [saving,       setSaving]       = useState(false)
  const [savingEmp,    setSavingEmp]    = useState(false)
  const [deletingEmpId, setDeletingEmpId] = useState(null)
  const [togglingId,   setTogglingId]   = useState(null)
  const [confirmDelId, setConfirmDelId] = useState(null)
  const [errors,       setErrors]       = useState({})
  const gridRef = useRef(null)

  /* ── Load ── */
  const loadEmployees = useCallback(async () => {
    if (!business) return
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at')
    if (!error) setEmployees(data ?? [])
  }, [business])

  const loadAppointments = useCallback(async () => {
    if (!business) return
    setLoading(true)
    let query = supabase
      .from('appointments')
      .select('*, employees(name, color)')
      .eq('business_id', business.id)
    if (view === 'week') {
      query = query
        .gte('date', formatDate(weekStart))
        .lte('date', formatDate(addDays(weekStart, 6)))
    } else {
      query = query.eq('date', formatDate(selectedDay))
    }
    const { data } = await query.order('date').order('start_time')
    setAppointments(data ?? [])
    setLoading(false)
  }, [business, view, weekStart, selectedDay])

  useEffect(() => { loadEmployees() },    [loadEmployees])
  useEffect(() => { loadAppointments() }, [loadAppointments])

  /* Scroll day grid to current time on open */
  useEffect(() => {
    if (view === 'day' && gridRef.current) {
      const now  = new Date()
      const mins = now.getHours() * 60 + now.getMinutes()
      gridRef.current.scrollTop = Math.max(0, (mins / 30 * SLOT_H) - 120)
    }
  }, [view])

  /* ── Helpers ── */
  const getEmpColor = (empId) => employees.find(e => e.id === empId)?.color ?? '#94a3b8'

  const openModal = (time = '09:00') => {
    loadEmployees() // refresh employee list every time the modal opens
    setForm({ ...EMPTY_FORM, start_time: time })
    setErrors({})
    setShowModal(true)
  }
  const closeModal = () => setShowModal(false)

  const setField = (f) => (e) => {
    const v = e.target.value
    setForm(prev => ({ ...prev, [f]: v }))
    setErrors(prev => ({ ...prev, [f]: null }))
  }

  const validate = () => {
    const e = {}
    if (!form.client_name.trim()) e.client_name = 'Il nome del cliente è obbligatorio.'
    if (form.price !== '' && isNaN(Number(form.price))) e.price = 'Inserisci un numero valido.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /* ── CRUD: appointments ── */
  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    await supabase.from('appointments').insert({
      business_id:      business.id,
      client_name:      form.client_name.trim(),
      employee_id:      form.employee_id || null,
      date:             formatDate(selectedDay),
      start_time:       form.start_time,
      duration_minutes: Number(form.duration_minutes),
      price:            form.price !== '' ? Number(form.price) : null,
      notes:            form.notes.trim() || null,
      completed:        false,
    })
    setSaving(false)
    closeModal()
    loadAppointments()
  }

  const toggleCompleted = async (apt) => {
    setTogglingId(apt.id)
    await supabase.from('appointments').update({ completed: !apt.completed }).eq('id', apt.id)
    setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, completed: !a.completed } : a))
    setTogglingId(null)
  }

  const deleteAppointment = async (id) => {
    await supabase.from('appointments').delete().eq('id', id)
    setAppointments(prev => prev.filter(a => a.id !== id))
    setConfirmDelId(null)
  }

  /* ── CRUD: employees ── */
  const handleSaveEmployee = async () => {
    if (!empForm.name.trim()) return
    setSavingEmp(true)
    await supabase.from('employees').insert({
      business_id: business.id,
      name:  empForm.name.trim(),
      color: empForm.color,
    })
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

  if (!business) return (
    <div className="db-section">
      <div className="db-empty-banner">Configura prima la tua attività.</div>
    </div>
  )

  /* ── Week view data ── */
  const weekDays      = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const aptsForDay    = (day) => appointments.filter(a => a.date === formatDate(day))
  const totalForDay   = (day) => aptsForDay(day).reduce((s, a) => s + (Number(a.price) || 0), 0)

  /* ── Day view data ── */
  const dayApts = appointments.filter(a => a.date === formatDate(selectedDay))
  const { colOf, spanOf } = computeColumns(dayApts)

  /* ── Summary ── */
  const doneApts = dayApts.filter(a => a.completed)
  const gross    = doneApts.reduce((s, a) => s + (Number(a.price) || 0), 0)
  const net      = gross * (1 - taxRate / 100)

  const goToDay = (day) => {
    const d = new Date(day); d.setHours(0,0,0,0)
    setSelectedDay(d)
    setView('day')
  }

  /* ── Render ── */
  return (
    <div className="db-section">

      {/* ── Header ── */}
      <div className="ag-header">
        <div className="ag-view-tabs">
          <button
            className={`ag-view-tab ${view === 'week' ? 'ag-view-tab--active' : ''}`}
            onClick={() => { setWeekStart(getMonday(selectedDay)); setView('week') }}
          >
            Settimana
          </button>
          <button
            className={`ag-view-tab ${view === 'day' ? 'ag-view-tab--active' : ''}`}
            onClick={() => setView('day')}
          >
            Giornata
          </button>
        </div>

        <div className="ag-nav">
          <button
            className="ag-nav-btn"
            onClick={() => view === 'week'
              ? setWeekStart(addDays(weekStart, -7))
              : setSelectedDay(addDays(selectedDay, -1))
            }
            aria-label="Precedente"
          >
            <IconChevLeft />
          </button>
          <span className="ag-nav-label">
            {view === 'week'
              ? `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} — ${addDays(weekStart,6).getDate()} ${MONTHS[addDays(weekStart,6).getMonth()]} ${weekStart.getFullYear()}`
              : `${DAY_FULL[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTHS[selectedDay.getMonth()]} ${selectedDay.getFullYear()}`
            }
          </span>
          <button
            className="ag-nav-btn"
            onClick={() => view === 'week'
              ? setWeekStart(addDays(weekStart, 7))
              : setSelectedDay(addDays(selectedDay, 1))
            }
            aria-label="Successivo"
          >
            <IconChevRight />
          </button>
        </div>

        <div className="ag-header-actions">
          {view === 'day' && (
            <button className="db-btn-primary" onClick={() => openModal()}>
              + Appuntamento
            </button>
          )}
          <button
            className={`ag-settings-btn ${showSettings ? 'ag-settings-btn--active' : ''}`}
            onClick={() => setShowSettings(s => !s)}
            title="Gestione dipendenti"
          >
            <IconSettings />
          </button>
        </div>
      </div>

      {/* ── Week view ── */}
      {view === 'week' && (
        <div className="ag-week-grid">
          {weekDays.map((day, i) => {
            const apts    = aptsForDay(day)
            const total   = totalForDay(day)
            const today   = sameDay(day, new Date())
            const holiday = getHoliday(day)
            return (
              <button
                key={i}
                className={`ag-week-day ${today ? 'ag-week-day--today' : ''} ${holiday ? 'ag-week-day--holiday' : ''}`}
                onClick={() => goToDay(day)}
              >
                <div className="ag-wday-name">{DAY_SHORT[day.getDay()]}</div>
                <div className={`ag-wday-num ${today ? 'ag-wday-num--today' : ''}`}>
                  {day.getDate()}
                </div>
                {holiday && <div className="ag-wday-holiday">{holiday.name}</div>}
                {apts.length > 0 ? (
                  <>
                    <div className="ag-wday-count">{apts.length} appt.</div>
                    {total > 0 && <div className="ag-wday-total">{fmtCurrency(total)}</div>}
                  </>
                ) : (
                  <div className="ag-wday-empty">libero</div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Day view ── */}
      {view === 'day' && (
        <>
          <div className="ag-day-wrap" ref={gridRef}>
            <div className="ag-time-grid">

              {/* Time labels column */}
              <div className="ag-time-labels">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="ag-time-label" style={{ height: SLOT_H * 2 }}>
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Slots + appointments */}
              <div className="ag-slots-col" style={{ position: 'relative', height: SLOT_H * 48 }}>

                {/* Background slot grid — always clickable for new appointments */}
                {Array.from({ length: 48 }, (_, i) => (
                  <div
                    key={i}
                    className={`ag-slot ${i % 2 === 0 ? 'ag-slot--hour' : 'ag-slot--half'}`}
                    style={{ position: 'absolute', top: i * SLOT_H, height: SLOT_H, left: 0, right: 0, zIndex: 1 }}
                  >
                    <button
                      className="ag-slot-add"
                      onClick={() => openModal(slotToTime(i))}
                      title={`Nuovo alle ${slotToTime(i)}`}
                    >
                      <IconPlus />
                      <span>{slotToTime(i)}</span>
                    </button>
                  </div>
                ))}

                {/* Appointment blocks — side by side when overlapping */}
                {dayApts.map(apt => {
                  const col    = colOf[apt.id]  ?? 0
                  const span   = spanOf[apt.id] ?? 1
                  const startMin = minsFromMidnight(apt.start_time)
                  const top    = startMin / 30 * SLOT_H
                  const height = Math.max(apt.duration_minutes / 30 * SLOT_H, SLOT_H) - 4
                  const color  = apt.employees?.color ?? getEmpColor(apt.employee_id)
                  const isDone = apt.completed
                  const leftPct  = (col / span * 100).toFixed(2)
                  const rightPct = ((span - col - 1) / span * 100).toFixed(2)
                  return (
                    <div
                      key={apt.id}
                      className={`ag-apt ${isDone ? 'ag-apt--done' : ''}`}
                      style={{
                        position: 'absolute',
                        top: top + 2,
                        left:  `calc(${leftPct}%  + 6px)`,
                        right: `calc(${rightPct}% + 6px)`,
                        height,
                        zIndex: 2,
                        backgroundColor: isDone ? 'rgba(34,197,94,0.18)' : color + '22',
                        borderLeft: `3px solid ${isDone ? '#22c55e' : color}`,
                        borderRadius: 6,
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div className="ag-apt-inner">
                        <div className="ag-apt-top-row">
                          <span className="ag-apt-time">{fmtTime(apt.start_time)}</span>
                          <div className="ag-apt-btns">
                            <button
                              className={`ag-apt-btn-check ${apt.completed ? 'ag-apt-btn-check--on' : ''}`}
                              onClick={() => toggleCompleted(apt)}
                              disabled={togglingId === apt.id}
                              title={apt.completed ? 'Annulla completamento' : 'Segna completato'}
                            >
                              <IconCheck />
                            </button>
                            {confirmDelId === apt.id ? (
                              <>
                                <button
                                  className="ag-apt-btn-del ag-apt-btn-del--confirm"
                                  onClick={() => deleteAppointment(apt.id)}
                                  title="Conferma eliminazione"
                                >
                                  <IconCheck />
                                </button>
                                <button className="ag-apt-btn" onClick={() => setConfirmDelId(null)}>
                                  <IconX />
                                </button>
                              </>
                            ) : (
                              <button
                                className="ag-apt-btn-del"
                                onClick={() => setConfirmDelId(apt.id)}
                                title="Elimina"
                              >
                                <IconTrash />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="ag-apt-client">{apt.client_name}</div>
                        {apt.employees && (
                          <div className="ag-apt-employee" style={{ color }}>{apt.employees.name}</div>
                        )}
                        {apt.price != null && (
                          <div className="ag-apt-detail">{fmtCurrency(apt.price)}</div>
                        )}
                        {apt.notes && (
                          <div className="ag-apt-notes">{apt.notes}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Daily summary ── */}
          <div className="ag-summary">
            <div className="ag-summary-title">Riepilogo giornaliero</div>
            <div className="ag-summary-body">
              <div className="ag-summary-row">
                <span>Appuntamenti completati</span>
                <span>{doneApts.length} / {dayApts.length}</span>
              </div>
              <div className="ag-summary-row">
                <span>Totale lordo</span>
                <strong>{fmtCurrency(gross)}</strong>
              </div>
              <div className="ag-summary-row">
                <span>Tasse</span>
                <div className="ag-tax-wrap">
                  <input
                    className="ag-tax-input"
                    type="number"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={e => setTaxRate(Number(e.target.value))}
                  />
                  <span>%</span>
                </div>
              </div>
              <div className="ag-summary-row ag-summary-row--net">
                <span>Totale netto stimato</span>
                <strong>{fmtCurrency(net)}</strong>
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
            <button className="sv-modal-close" onClick={() => setShowSettings(false)} aria-label="Chiudi">
              <IconX />
            </button>
          </div>

          {employees.length === 0 ? (
            <p className="ag-emp-empty">Nessun dipendente ancora.</p>
          ) : (
            <div className="ag-emp-list">
              {employees.map(emp => (
                <div key={emp.id} className="ag-emp-row">
                  <span className="ag-emp-dot" style={{ background: emp.color }} />
                  <span className="ag-emp-name">{emp.name}</span>
                  <button
                    className="sv-action-btn sv-action-btn--danger"
                    onClick={() => handleDeleteEmployee(emp.id)}
                    disabled={deletingEmpId === emp.id}
                    title="Elimina dipendente"
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="ag-emp-add-form">
            <input
              className="sv-input ag-emp-input"
              type="text"
              placeholder="Nome dipendente"
              value={empForm.name}
              onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSaveEmployee()}
            />
            <div className="ag-palette">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`ag-swatch ${empForm.color === c ? 'ag-swatch--active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setEmpForm(f => ({ ...f, color: c }))}
                  aria-label={`Colore ${c}`}
                />
              ))}
            </div>
            <button
              className="db-btn-primary ag-emp-add-btn"
              onClick={handleSaveEmployee}
              disabled={savingEmp || !empForm.name.trim()}
            >
              {savingEmp ? 'Salvataggio…' : 'Aggiungi dipendente'}
            </button>
          </div>
        </div>
      )}

      {/* ── New appointment modal ── */}
      {showModal && (
        <div className="sv-modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Nuovo appuntamento</h2>
              <button className="sv-modal-close" onClick={closeModal} aria-label="Chiudi">
                <IconX />
              </button>
            </div>

            <div className="sv-modal-body">

              <div className="sv-field">
                <label className="sv-label">
                  Nome cliente <span className="sv-required">*</span>
                </label>
                <input
                  className={`sv-input ${errors.client_name ? 'sv-input--error' : ''}`}
                  type="text"
                  value={form.client_name}
                  onChange={setField('client_name')}
                  placeholder="es. Mario Rossi"
                  autoFocus
                />
                {errors.client_name && <p className="sv-field-error">{errors.client_name}</p>}
              </div>

              <div className="sv-field">
                <label className="sv-label">
                  Dipendente <span className="sv-optional">(facoltativo)</span>
                </label>
                <select
                  className="sv-input sv-select"
                  value={form.employee_id}
                  onChange={setField('employee_id')}
                >
                  <option value="">— Nessuno —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="sv-fields-row">
                <div className="sv-field">
                  <label className="sv-label">Ora inizio</label>
                  <input
                    className="sv-input"
                    type="time"
                    step="1800"
                    value={form.start_time}
                    onChange={setField('start_time')}
                  />
                </div>
                <div className="sv-field">
                  <label className="sv-label">Durata</label>
                  <select
                    className="sv-input sv-select"
                    value={form.duration_minutes}
                    onChange={setField('duration_minutes')}
                  >
                    {DURATIONS.map(d => (
                      <option key={d} value={d}>{fmtDuration(d)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="sv-field sv-field--half">
                <label className="sv-label">
                  Prezzo (€) <span className="sv-optional">(facoltativo)</span>
                </label>
                <input
                  className={`sv-input ${errors.price ? 'sv-input--error' : ''}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={setField('price')}
                  placeholder="es. 50"
                />
                {errors.price && <p className="sv-field-error">{errors.price}</p>}
              </div>

              <div className="sv-field">
                <label className="sv-label">
                  Note <span className="sv-optional">(facoltativo)</span>
                </label>
                <textarea
                  className="sv-textarea"
                  value={form.notes}
                  onChange={setField('notes')}
                  placeholder="Note sull'appuntamento…"
                  rows={2}
                />
              </div>

            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={closeModal}>Annulla</button>
              <button className="sv-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvataggio…' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

/* ── Icons ── */
function IconChevLeft()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> }
function IconChevRight() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg> }
function IconPlus()      { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function IconCheck()     { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconX()         { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconTrash()     { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> }
function IconSettings()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
