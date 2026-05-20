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

const EMPTY_FORM = { date: '', client_name: '', client_phone: '', employee_id: '', start_time: '09:00', duration_minutes: 60, price: '', notes: '', selected_services: [] }
const EMPTY_EMP  = { name: '', color: COLORS[0] }

const SLOT_H = 40 // px per 30-minute slot

/* ── Wheel picker constants ── */
const WP_ITEM_H    = 44
const WP_VISIBLE   = 5
const WP_PAD       = (WP_ITEM_H * WP_VISIBLE) / 2 - WP_ITEM_H / 2  // 88px
const WP_YEAR_START = 2020
const WP_YEAR_END   = 2035

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
export default function Agenda({ business, initialView = 'day' }) {
  const location = useLocation()
  const rNav     = useNavigate()

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [view,         setView]         = useState(initialView)
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
  const [services,      setServices]      = useState([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [editingId,     setEditingId]     = useState(null)
  const [addAnotherTime, setAddAnotherTime] = useState(null)
  const [taxRate,       setTaxRate]       = useState(22)

  const [suggestions,     setSuggestions]     = useState([])
  const [dropdownVisible, setDropdownVisible] = useState(false)

  const [showDatePicker,        setShowDatePicker]        = useState(false)

  const [pendingBookings,       setPendingBookings]       = useState([])
  const [processingId,          setProcessingId]          = useState(null)
  const [waSentIds,             setWaSentIds]             = useState(() => {
    try {
      return new Set(Object.keys(localStorage).filter(k => k.startsWith('wa_sent_')).map(k => k.slice(8)))
    } catch { return new Set() }
  })
  const [confirmDialogId,       setConfirmDialogId]       = useState(null)
  const [rejectDialogId,        setRejectDialogId]        = useState(null)
  const [showOutOfHoursConfirm, setShowOutOfHoursConfirm] = useState(false)

  const scrollToTimeRef  = useRef(null)
  const suggestTimerRef  = useRef(null)

  // Read location state after mount: set selected date/time, then clear state
  useEffect(() => {
    const state   = location.state ?? {}
    const dateStr = state.selectedDate ?? state.agendaDate

    if (dateStr) {
      const d = new Date(dateStr + 'T00:00:00')
      d.setHours(0, 0, 0, 0)
      setSelectedDay(d)
      setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1))
    }

    if (state.selectedTime) scrollToTimeRef.current = state.selectedTime

    if (state.agendaDate || state.selectedDate || state.selectedTime) {
      rNav(location.pathname, { state: {}, replace: true })
    }
  }, []) // eslint-disable-line

  /* ── Load ── */
  const loadEmployees = useCallback(async (signal = null) => {
    if (!business) return
    const { data, error } = await supabase.from('employees').select('*').eq('business_id', business.id).order('created_at')
    if (signal?.cancelled) return
    if (error) { console.error('[loadEmployees]', error); return }
    setEmployees(data ?? [])
  }, [business])

  const loadServices = useCallback(async () => {
    if (!business) return
    setServicesLoading(true)
    const { data, error } = await supabase
      .from('services')
      .select('id, name, price, duration_min')
      .eq('business_id', business.id)
      .eq('is_available', true)
      .order('sort_order')
    setServicesLoading(false)
    if (error) { console.error('[loadServices]', error); return }
    setServices(data ?? [])
  }, [business])

  const loadAppointments = useCallback(async (signal = null) => {
    if (!business) return
    setLoading(true)
    let q = supabase.from('appointments')
      .select('*, employees(name, color), bookings(customer_phone, services(name)), appointment_services(service_id, price_snapshot, duration_snapshot, services(name))')
      .eq('business_id', business.id)
    if (view === 'month') {
      const lastOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
      q = q.gte('date', formatDate(monthDate)).lte('date', formatDate(lastOfMonth))
    } else {
      q = q.eq('date', formatDate(selectedDay))
    }
    const { data, error } = await q.order('date').order('start_time')
    if (signal?.cancelled) return
    setLoading(false)
    if (error) { console.error('[loadAppointments]', error); return }
    setAppointments(data ?? [])
    scheduleAllTodayNotifications(data ?? [])
  }, [business, view, monthDate, selectedDay])

  const loadPendingBookings = useCallback(async (signal = null) => {
    if (!business) return
    const { data, error } = await supabase.from('bookings')
      .select('*, services(name)')
      .eq('business_id', business.id)
      .eq('status', 'pending')
      .order('appointment_date')
      .order('appointment_time')
    if (signal?.cancelled) return
    if (error) { console.error('[loadPendingBookings]', error); return }
    setPendingBookings(data ?? [])
  }, [business])

  useEffect(() => {
    const signal = { cancelled: false }
    loadEmployees(signal)
    return () => { signal.cancelled = true }
  }, [loadEmployees])
  useEffect(() => {
    const signal = { cancelled: false }
    loadAppointments(signal)
    return () => { signal.cancelled = true }
  }, [loadAppointments])
  useEffect(() => {
    const signal = { cancelled: false }
    loadPendingBookings(signal)
    return () => { signal.cancelled = true }
  }, [loadPendingBookings])

  /* ── Modal helpers ── */
  const openModal = (date = formatDate(selectedDay), time = '09:00') => {
    loadEmployees()
    loadServices()
    setForm({ ...EMPTY_FORM, date, start_time: time })
    setEditingId(null)
    setErrors({})
    setSuggestions([])
    setDropdownVisible(false)
    setShowModal(true)
  }
  const openEditModal = async (apt, tappedTime = null) => {
    loadEmployees()
    await loadServices()
    setSuggestions([])
    setDropdownVisible(false)
    const { data: aptSvcs } = await supabase
      .from('appointment_services')
      .select('service_id')
      .eq('appointment_id', apt.id)
    setForm({
      date:             apt.date,
      client_name:      apt.client_name,
      client_phone:     apt.client_phone ?? '',
      employee_id:      apt.employee_id ?? '',
      start_time:       apt.start_time?.slice(0, 5) ?? '09:00',
      duration_minutes: apt.duration_minutes ?? 60,
      price:            apt.price != null ? String(apt.price) : '',
      notes:            apt.notes ?? '',
      selected_services: aptSvcs?.map(s => s.service_id) ?? [],
    })
    setEditingId(apt.id)
    setAddAnotherTime(tappedTime ?? apt.start_time?.slice(0, 5) ?? '09:00')
    setErrors({})
    setShowModal(true)
  }
  const closeModal = () => {
    clearTimeout(suggestTimerRef.current)
    setSuggestions([])
    setDropdownVisible(false)
    setShowModal(false)
    setEditingId(null)
    setAddAnotherTime(null)
  }
  const setField = (f) => (e) => { setForm(p => ({ ...p, [f]: e.target.value })); setErrors(p => ({ ...p, [f]: null })) }

  const handleNameChange = (e) => {
    const val = e.target.value
    setForm(p => ({ ...p, client_name: val }))
    setErrors(p => ({ ...p, client_name: null }))
    try {
      clearTimeout(suggestTimerRef.current)
      if (val.trim().length < 2) {
        setSuggestions([])
        setDropdownVisible(false)
        return
      }
      suggestTimerRef.current = setTimeout(async () => {
        try {
          const [{ data: cts }, { data: apts }] = await Promise.all([
            supabase.from('contacts')
              .select('name, phone')
              .eq('business_id', business.id)
              .ilike('name', `%${val.trim()}%`)
              .limit(5),
            supabase.from('appointments')
              .select('client_name, client_phone')
              .eq('business_id', business.id)
              .ilike('client_name', `%${val.trim()}%`)
              .limit(5),
          ])
          const seen = new Map()
          for (const ct of (cts ?? [])) {
            const key = ct.phone?.replace(/\s+/g, '') || '__' + ct.name.trim().toLowerCase()
            if (!seen.has(key)) seen.set(key, { name: ct.name, phone: ct.phone ?? null })
          }
          for (const apt of (apts ?? [])) {
            const key = apt.client_phone?.replace(/\s+/g, '') || '__' + apt.client_name.trim().toLowerCase()
            if (!seen.has(key)) seen.set(key, { name: apt.client_name, phone: apt.client_phone ?? null })
          }
          const results = Array.from(seen.values()).slice(0, 3)
          setSuggestions(results)
          setDropdownVisible(results.length > 0)
        } catch { /* silently fail */ }
      }, 200)
    } catch { /* silently fail */ }
  }

  const selectSuggestion = (s) => {
    try {
      setForm(p => ({ ...p, client_name: s.name, client_phone: s.phone ?? p.client_phone }))
      setErrors(p => ({ ...p, client_name: null }))
      setSuggestions([])
      setDropdownVisible(false)
    } catch { /* silently fail */ }
  }

  const toggleService = (svc) => {
    setForm(prev => {
      const already = prev.selected_services.includes(svc.id)
      const selected = already
        ? prev.selected_services.filter(id => id !== svc.id)
        : [...prev.selected_services, svc.id]
      const svcsData = services.filter(s => selected.includes(s.id))
      const totalPrice    = svcsData.reduce((sum, s) => sum + (Number(s.price) || 0), 0)
      const totalDuration = svcsData.reduce((sum, s) => sum + (Number(s.duration_min) || 0), 0)
      return {
        ...prev,
        selected_services: selected,
        price:            selected.length > 0 ? String(totalPrice) : prev.price,
        duration_minutes: selected.length > 0 && totalDuration > 0 ? totalDuration : prev.duration_minutes,
      }
    })
  }

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
  const handleSave = async (skipHoursCheck = false) => {
    if (!validate()) return

    if (!skipHoursCheck) {
      const dateObj = new Date(form.date + 'T00:00:00')
      const dayKey  = DAY_KEYS[dateObj.getDay()]
      const dayH    = business?.opening_hours?.[dayKey]
      const ranges  = parseOpeningRanges(dayH)
      if (ranges.length > 0) {
        const [sh, sm] = form.start_time.split(':').map(Number)
        const startMin = sh * 60 + sm
        if (!ranges.some(([s, e]) => startMin >= s && startMin < e)) {
          setShowOutOfHoursConfirm(true)
          return
        }
      }
    }

    setShowOutOfHoursConfirm(false)
    setSaving(true)
    setErrors(prev => ({ ...prev, _global: null }))

    try {
      const payload = {
        client_name:      form.client_name.trim(),
        client_phone:     form.client_phone.trim() || null,
        employee_id:      form.employee_id || null,
        date:             form.date,
        start_time:       form.start_time,
        duration_minutes: Number(form.duration_minutes),
        price:            form.price !== '' ? Number(form.price) : null,
        notes:            form.notes.trim() || null,
      }

      let appointmentId = editingId
      if (editingId) {
        const { error } = await supabase.from('appointments').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { data: newApt, error } = await supabase
          .from('appointments')
          .insert({ ...payload, business_id: business.id, completed: false })
          .select('id')
          .single()
        if (error) throw error
        appointmentId = newApt?.id
        logActivity(business.id, business.user_id, 'appointment_created', `Appuntamento creato: ${form.client_name.trim()} il ${form.date}`)
      }

      // Sync appointment_services (delete-all + re-insert)
      if (appointmentId) {
        const { error: delErr } = await supabase.from('appointment_services').delete().eq('appointment_id', appointmentId)
        if (delErr) throw delErr
        if (form.selected_services.length > 0) {
          const rows = form.selected_services.map(svcId => {
            const svc = services.find(s => s.id === svcId)
            return {
              appointment_id:    appointmentId,
              service_id:        svcId,
              price_snapshot:    svc?.price ?? null,
              duration_snapshot: svc?.duration_min ?? null,
            }
          })
          const { error: insErr } = await supabase.from('appointment_services').insert(rows)
          if (insErr) throw insErr
        }
      }

      closeModal()
      loadAppointments()
    } catch {
      setErrors(prev => ({ ...prev, _global: 'Errore nel salvataggio. Riprova.' }))
    } finally {
      setSaving(false)
    }
  }

  const toggleCompleted = async (apt) => {
    setTogglingId(apt.id)
    const newCompleted = !apt.completed
    const { error } = await supabase.from('appointments').update({ completed: newCompleted }).eq('id', apt.id)
    setTogglingId(null)
    if (error) { console.error('[toggleCompleted]', error); return }
    const updated = appointments.map(a => a.id === apt.id ? { ...a, completed: newCompleted } : a)
    setAppointments(updated)
    if (newCompleted) notifyNextAppointment(updated)
  }

  const deleteAppointment = async (id) => {
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (error) { console.error('[deleteAppointment]', error); return }
    setAppointments(prev => prev.filter(a => a.id !== id))
    setConfirmDelId(null)
  }

  const confirmPendingBooking = async (id) => {
    setProcessingId(id)
    setConfirmDialogId(null)
    const { error } = await supabase.rpc('owner_confirm_booking', { p_booking_id: id })
    setProcessingId(null)
    if (error) { console.error('[confirmPendingBooking]', error); return }
    loadPendingBookings()
    loadAppointments()
  }

  const handlePickerConfirm = (date) => {
    date.setHours(0, 0, 0, 0)
    if (view === 'day') {
      setSelectedDay(date)
    } else {
      setMonthDate(new Date(date.getFullYear(), date.getMonth(), 1))
    }
    setShowDatePicker(false)
  }

  const rejectPendingBooking = async (id) => {
    setProcessingId(id)
    setRejectDialogId(null)
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
    setProcessingId(null)
    if (error) { console.error('[rejectPendingBooking]', error); return }
    loadPendingBookings()
  }


  /* ── CRUD: employees ── */
  const handleSaveEmployee = async () => {
    if (!empForm.name.trim()) return
    setSavingEmp(true)
    const { error } = await supabase.from('employees').insert({ business_id: business.id, name: empForm.name.trim(), color: empForm.color })
    setSavingEmp(false)
    if (error) { console.error('[handleSaveEmployee]', error); return }
    setEmpForm(EMPTY_EMP)
    loadEmployees()
  }
  const handleDeleteEmployee = async (id) => {
    setDeletingEmpId(id)
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) { console.error('[handleDeleteEmployee]', error); setDeletingEmpId(null); return }
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

      {showDatePicker && (
        <DateWheelPicker
          date={view === 'day' ? selectedDay : monthDate}
          onConfirm={handlePickerConfirm}
          onCancel={() => setShowDatePicker(false)}
        />
      )}

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

          <span className="ag-nav-label ag-nav-label--pick" onClick={() => setShowDatePicker(true)}>
            {view === 'month'
              ? `${MONTHS_LONG[monthDate.getMonth()]} ${monthDate.getFullYear()}`
              : <>
                  <span className="ag-nav-day-name">{DAY_FULL[selectedDay.getDay()]}</span>
                  <span className="ag-nav-day-sep">, </span>
                  <span className="ag-nav-day-date">{selectedDay.getDate()} {MONTHS_LONG[selectedDay.getMonth()]} {selectedDay.getFullYear()}</span>
                </>
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
              const dateLabel    = new Date(b.appointment_date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
              const serviceLabel = b.service_names ?? b.services?.name ?? 'servizio'
              const waSent       = waSentIds.has(b.id)
              const waMsg        = `Ciao ${b.customer_name}! Ho ricevuto la tua richiesta di appuntamento per ${serviceLabel} il ${dateLabel} alle ${b.appointment_time?.slice(0, 5)}. Puoi confermare rispondendo "Confermo" a questo messaggio. Grazie! — ${business.name}`
              const waLink       = buildWaLink(b.customer_phone, waMsg)
              return (
                <div key={b.id} className="ag-pending-card">
                  <div className="ag-pending-info">
                    <span className="ag-pending-name">{b.customer_name}</span>
                    <span className="ag-pending-detail">
                      {serviceLabel} · {dateLabel} alle {b.appointment_time?.slice(0, 5)}
                    </span>
                    {(b.customer_email || b.customer_phone) && (
                      <span className="ag-pending-contact">
                        {b.customer_email}{b.customer_phone ? ` · ${b.customer_phone}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="ag-pending-actions">
                    {waSent ? (
                      <span className="ag-pending-wa-sent">WhatsApp inviato ✓</span>
                    ) : waLink ? (
                      <a
                        className="ag-pending-btn ag-pending-btn--wa"
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          localStorage.setItem(`wa_sent_${b.id}`, '1')
                          setWaSentIds(prev => new Set([...prev, b.id]))
                        }}
                      >
                        Invia WhatsApp
                      </a>
                    ) : (
                      <span className="ag-pending-no-phone">Nessun numero</span>
                    )}
                    {waSent && (
                      <button
                        className="ag-pending-btn ag-pending-btn--confirm"
                        onClick={() => setConfirmDialogId(b.id)}
                        disabled={processingId === b.id}
                      >
                        Conferma appuntamento
                      </button>
                    )}
                    <button
                      className="ag-pending-btn ag-pending-btn--reject"
                      onClick={() => setRejectDialogId(b.id)}
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

      {/* ── Confirm dialog overlay ── */}
      {confirmDialogId && (() => {
        const b = pendingBookings.find(x => x.id === confirmDialogId)
        if (!b) return null
        return (
          <div className="ag-dialog-overlay" onClick={() => setConfirmDialogId(null)}>
            <div className="ag-dialog-box" onClick={e => e.stopPropagation()}>
              <p className="ag-dialog-text">Hai ricevuto conferma da <strong>{b.customer_name}</strong>?</p>
              <div className="ag-dialog-actions">
                <button
                  className="ag-pending-btn ag-pending-btn--confirm"
                  onClick={() => confirmPendingBooking(b.id)}
                  disabled={processingId === b.id}
                >
                  {processingId === b.id ? '…' : 'Sì, conferma'}
                </button>
                <button className="ag-pending-btn ag-pending-btn--cancel" onClick={() => setConfirmDialogId(null)}>Annulla</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Reject dialog overlay ── */}
      {rejectDialogId && (() => {
        const b = pendingBookings.find(x => x.id === rejectDialogId)
        if (!b) return null
        return (
          <div className="ag-dialog-overlay" onClick={() => setRejectDialogId(null)}>
            <div className="ag-dialog-box" onClick={e => e.stopPropagation()}>
              <p className="ag-dialog-text">Rifiutare la prenotazione di <strong>{b.customer_name}</strong>?</p>
              <div className="ag-dialog-actions">
                <button
                  className="ag-pending-btn ag-pending-btn--reject"
                  onClick={() => rejectPendingBooking(b.id)}
                  disabled={processingId === b.id}
                >
                  {processingId === b.id ? '…' : 'Sì, rifiuta'}
                </button>
                <button className="ag-pending-btn ag-pending-btn--cancel" onClick={() => setRejectDialogId(null)}>Annulla</button>
              </div>
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
        <div className="sv-modal-overlay" onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
        <div className="ag-settings-modal">
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
              <div className="sv-field" style={{ position: 'relative' }}>
                <label className="sv-label">Nome cliente <span className="sv-required">*</span></label>
                <input
                  className={`sv-input ${errors.client_name ? 'sv-input--error' : ''}`}
                  type="text"
                  value={form.client_name}
                  onChange={handleNameChange}
                  onBlur={() => setTimeout(() => setDropdownVisible(false), 150)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSuggestions([]); setDropdownVisible(false) } }}
                  placeholder="es. Mario Rossi"
                  enterKeyHint="next"
                  autoComplete="off"
                />
                {errors.client_name && <p className="sv-field-error">{errors.client_name}</p>}
                {dropdownVisible && suggestions.length > 0 && (
                  <div className="ag-suggest-dropdown">
                    {suggestions.map((s, i) => (
                      <div
                        key={i}
                        className="ag-suggest-item"
                        onMouseDown={() => selectSuggestion(s)}
                      >
                        <span className="ag-suggest-name">{s.name}</span>
                        {s.phone && <span className="ag-suggest-phone">{s.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone */}
              <div className="sv-field">
                <label className="sv-label">Telefono cliente <span className="sv-optional">(facoltativo)</span></label>
                <div className="ag-phone-row">
                  <input
                    className="sv-input"
                    type="tel"
                    value={form.client_phone}
                    onChange={setField('client_phone')}
                    placeholder="es. +39 333 1234567"
                    enterKeyHint="next"
                  />
                  {form.client_phone.trim() && (
                    <a
                      className="ag-wa-btn"
                      href={`https://wa.me/${form.client_phone.trim().replace(/^\+/, '').replace(/\s+/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Apri WhatsApp"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>

              {/* Services */}
              {(services.length > 0 || servicesLoading) && (
                <div className="sv-field">
                  <label className="sv-label">Servizi <span className="sv-optional">(facoltativo)</span></label>
                  {servicesLoading ? (
                    <p className="sv-field-hint">Caricamento…</p>
                  ) : (
                    <div className="ag-svc-list">
                      {services.map(svc => {
                        const checked = form.selected_services.includes(svc.id)
                        return (
                          <label key={svc.id} className={`ag-svc-item ${checked ? 'ag-svc-item--checked' : ''}`}>
                            <input
                              type="checkbox"
                              className="ag-svc-checkbox"
                              checked={checked}
                              onChange={() => toggleService(svc)}
                            />
                            <span className="ag-svc-name">{svc.name}</span>
                            <span className="ag-svc-meta">
                              {svc.duration_min != null && <span>{fmtDuration(svc.duration_min)}</span>}
                              {svc.price != null && <span>{fmtCurrency(svc.price)}</span>}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

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

            {errors._global && (
              <p className="sv-field-error" style={{ margin: '0 20px 4px', textAlign: 'center' }}>{errors._global}</p>
            )}

            {showOutOfHoursConfirm ? (
              <div className="sv-ooh-confirm">
                <p className="sv-ooh-text">Questo appuntamento è fuori dall'orario di lavoro. Vuoi salvarlo comunque?</p>
                <div className="sv-modal-footer">
                  <button className="sv-btn-cancel" onClick={() => setShowOutOfHoursConfirm(false)}>Annulla</button>
                  <button className="sv-btn-save" onClick={() => handleSave(true)} disabled={saving}>
                    {saving ? 'Salvataggio…' : 'Salva comunque'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="sv-modal-footer">
                <button className="sv-btn-cancel" onClick={closeModal}>Annulla</button>
                <button className="sv-btn-save" onClick={() => handleSave(false)} disabled={saving}>
                  {saving ? 'Salvataggio…' : 'Salva'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

/* ── Date Wheel Picker ── */
function DateWheelPicker({ date, onConfirm, onCancel }) {
  const [d, setD] = useState(date.getDate() - 1)  // 0-based day index
  const [m, setM] = useState(date.getMonth())
  const [y, setY] = useState(date.getFullYear() - WP_YEAR_START)

  const yr          = WP_YEAR_START + y
  const daysInMonth = new Date(yr, m + 1, 0).getDate()

  // Clamp day when month/year change (e.g. Jan 31 → Feb: day → 28)
  useEffect(() => {
    if (d >= daysInMonth) setD(daysInMonth - 1)
  }, [m, y]) // eslint-disable-line

  // Prevent body scroll while picker is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCancel])

  const days   = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))
  const months = MONTHS_LONG
  const years  = Array.from({ length: WP_YEAR_END - WP_YEAR_START + 1 }, (_, i) => String(WP_YEAR_START + i))

  const handleConfirm = () => {
    const clampedD = Math.min(d, daysInMonth - 1)
    onConfirm(new Date(yr, m, clampedD + 1))
  }

  return (
    <div className="wp-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="wp-picker">
        <div className="wp-header">
          <button className="wp-btn-cancel" onClick={onCancel}>Annulla</button>
          <span className="wp-title">Scegli data</span>
          <button className="wp-btn-confirm" onClick={handleConfirm}>Conferma</button>
        </div>
        <div className="wp-columns">
          <div className="wp-center-band" />
          <WheelColumn items={days}   value={Math.min(d, daysInMonth - 1)} onChange={setD} />
          <WheelColumn items={months} value={m}                            onChange={setM} />
          <WheelColumn items={years}  value={y}                            onChange={setY} />
        </div>
      </div>
    </div>
  )
}

function WheelColumn({ items, value, onChange }) {
  const ref   = useRef(null)
  const timer = useRef(null)

  // Set initial scroll position without animation
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = value * WP_ITEM_H
  }, []) // eslint-disable-line

  // Sync scroll when value is updated externally (e.g. day clamping)
  useEffect(() => {
    if (!ref.current) return
    const current = Math.round(ref.current.scrollTop / WP_ITEM_H)
    if (current !== value) {
      ref.current.scrollTo({ top: value * WP_ITEM_H, behavior: 'smooth' })
    }
  }, [value])

  const handleScroll = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!ref.current) return
      const idx     = Math.round(ref.current.scrollTop / WP_ITEM_H)
      const clamped = Math.max(0, Math.min(items.length - 1, idx))
      onChange(clamped)
    }, 100)
  }

  return (
    <div className="wp-col-wrap">
      <div className="wp-col" ref={ref} onScroll={handleScroll}>
        <div style={{ height: WP_PAD, flexShrink: 0 }} />
        {items.map((item, i) => (
          <div
            key={i}
            className={`wp-item ${i === value ? 'wp-item--sel' : ''}`}
            style={{ height: WP_ITEM_H }}
            onClick={() => onChange(i)}
          >
            {item}
          </div>
        ))}
        <div style={{ height: WP_PAD, flexShrink: 0 }} />
      </div>
    </div>
  )
}

/* ── WhatsApp helper ── */
function buildWaLink(phone, message) {
  const clean = phone?.replace(/\D/g, '')
  if (!clean || clean.length < 6) return null
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

// Returns sorted [[startMin, endMin]] pairs for a day's opening_hours entry (handles old + new format)
function parseOpeningRanges(dayH) {
  if (!dayH || dayH.closed) return []
  if ('open' in dayH && 'close' in dayH) {
    const [oh, om] = dayH.open.split(':').map(Number)
    const [ch, cm] = dayH.close.split(':').map(Number)
    return [[oh * 60 + om, ch * 60 + cm]]
  }
  const ranges = []
  if (dayH.morning?.active && dayH.morning.open && dayH.morning.close) {
    const [oh, om] = dayH.morning.open.split(':').map(Number)
    const [ch, cm] = dayH.morning.close.split(':').map(Number)
    ranges.push([oh * 60 + om, ch * 60 + cm])
  }
  if (dayH.afternoon?.active && dayH.afternoon.open && dayH.afternoon.close) {
    const [oh, om] = dayH.afternoon.open.split(':').map(Number)
    const [ch, cm] = dayH.afternoon.close.split(':').map(Number)
    ranges.push([oh * 60 + om, ch * 60 + cm])
  }
  return ranges
}

function buildClosedOverlays(openRanges) {
  const closed = []
  let cursor = 0
  for (const [s, e] of openRanges) {
    if (cursor < s) closed.push([cursor, s])
    cursor = e
  }
  if (cursor < 1440) closed.push([cursor, 1440])
  return closed
}

function DayTimeline({ dayApts, loading, togglingId, confirmDelId, openModal, openEditModal, toggleCompleted, deleteAppointment, setConfirmDelId, selectedDay, openingHours, businessName, scrollToTimeRef }) {
  const wrapRef      = useRef(null)
  const touchStartY  = useRef(null)

  useEffect(() => {
    if (loading || !wrapRef.current) return

    // If we arrived here from Panoramica with a specific appointment time, scroll to it once
    if (scrollToTimeRef?.current) {
      const [h, m] = scrollToTimeRef.current.split(':').map(Number)
      const startMin = h * 60 + m
      wrapRef.current.scrollTop = Math.max(0, startMin - 60) / 30 * SLOT_H
      scrollToTimeRef.current = null
      return
    }

    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)
    const isToday = selectedDay.getTime() === todayMidnight.getTime()

    let scrollPx
    if (isToday) {
      scrollPx = Math.max(0, new Date().getHours() - 1) * 2 * SLOT_H
    } else {
      const dayKey = DAY_KEYS[selectedDay.getDay()]
      const dayH   = openingHours?.[dayKey]
      const ranges = parseOpeningRanges(dayH)
      if (ranges.length > 0) {
        scrollPx = (ranges[0][0] / 30) * SLOT_H
      } else {
        scrollPx = 8 * 2 * SLOT_H
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

          {/* Left: time labels (one per hour) */}
          <div className="ag-time-labels">
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="ag-time-label ag-time-label--hour"
                style={{ height: SLOT_H * 2 }}
              >
                {`${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* Right: slot rows + absolute appointment blocks */}
          <div className="ag-slots-col" style={{ position: 'relative' }}>
            {/* Closed-period shading */}
            {(() => {
              const dayKey = DAY_KEYS[selectedDay.getDay()]
              const dayH   = openingHours?.[dayKey]
              const ranges = parseOpeningRanges(dayH)
              if (ranges.length === 0) return null
              return buildClosedOverlays(ranges).map(([s, e], i) => (
                <div
                  key={i}
                  className="ag-closed-period"
                  style={{
                    position: 'absolute',
                    top:    (s / 30) * SLOT_H,
                    height: ((e - s) / 30) * SLOT_H,
                    left: 0, right: 0,
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              ))
            })()}
            {Array.from({ length: 48 }, (_, i) => {
              const totalMin = i * 30
              const h       = Math.floor(totalMin / 60)
              const m       = totalMin % 60
              const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
              const isHour  = m === 0
              return (
                <div key={i} className={`ag-slot ${isHour ? 'ag-slot--hour' : 'ag-slot--half'}`} style={{ height: SLOT_H }}>
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
              const top    = (apt.startMin / 30) * SLOT_H
              const height = Math.max((Number(apt.duration_minutes) / 30) * SLOT_H, SLOT_H * 0.9)
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
                  onTouchStart={e => { touchStartY.current = e.touches[0].clientY }}
                  onClick={(e) => {
                    if (touchStartY.current !== null && Math.abs(e.clientY - touchStartY.current) > 10) {
                      touchStartY.current = null
                      return
                    }
                    touchStartY.current = null
                    const offsetY = e.clientY - e.currentTarget.getBoundingClientRect().top
                    const tappedMin = apt.startMin + Math.round(offsetY / SLOT_H) * 30
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
