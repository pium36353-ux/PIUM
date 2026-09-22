import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'

const EMPTY_FORM = { name: '', capacity: '' }

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Un appuntamento è "in corso" se l'ora attuale cade nell'intervallo
// [start_time, start_time + duration_minutes) — stessa logica usata per
// gli orari di apertura in Agenda.jsx, qui applicata al singolo appuntamento.
function isActiveNow(apt, nowMin) {
  if (!apt.start_time) return false
  const [h, m] = apt.start_time.split(':').map(Number)
  const startMin = h * 60 + m
  const duration = apt.duration_minutes ?? 60
  return nowMin >= startMin && nowMin < startMin + duration
}

export default function Tavoli({ business }) {
  const [tables, setTables]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(null)   // null | 'add' | 'edit'
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [errors, setErrors]       = useState({})

  const [confirmDeactivateId, setConfirmDeactivateId] = useState(null)
  const [busyId, setBusyId]       = useState(null)

  // Tavolo → nome cliente dell'appuntamento in corso adesso (Task 4 Blocco A).
  // Popolata da loadActiveAppointments; un tavolo presente qui ha priorità
  // sul toggle manuale per la visualizzazione (vedi render sotto).
  const [activeByTable, setActiveByTable] = useState({})

  const load = useCallback(async (signal = null) => {
    if (!business) return
    setLoading(true)
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at')
    if (signal?.cancelled) return
    setLoading(false)
    if (error) { console.error('[loadTables]', error); return }
    setTables(data ?? [])
  }, [business])

  // Appuntamenti di oggi collegati a un tavolo (table_id): un tavolo è
  // "occupato da prenotazione" se l'ora attuale cade nell'intervallo
  // dell'appuntamento. Nessun controllo di doppia prenotazione qui, solo
  // lettura per la visualizzazione — coerente col resto del Blocco A
  // (versione semplice funzionante).
  const loadActiveAppointments = useCallback(async (signal = null) => {
    if (!business) return
    const { data, error } = await supabase
      .from('appointments')
      .select('table_id, client_name, start_time, duration_minutes')
      .eq('business_id', business.id)
      .eq('date', formatDate(new Date()))
      .not('table_id', 'is', null)
    if (signal?.cancelled) return
    if (error) { console.error('[loadActiveAppointments]', error); return }
    const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })()
    const map = {}
    for (const apt of data ?? []) {
      if (isActiveNow(apt, nowMin)) map[apt.table_id] = apt.client_name
    }
    setActiveByTable(map)
  }, [business])

  useEffect(() => {
    const signal = { cancelled: false }
    load(signal)
    loadActiveAppointments(signal)
    // Refresh periodico: un appuntamento può iniziare/finire mentre la
    // pagina resta aperta, senza che nessuna azione dell'utente lo segnali.
    const interval = setInterval(() => loadActiveAppointments(), 60000)
    return () => { signal.cancelled = true; clearInterval(interval) }
  }, [load, loadActiveAppointments])

  /* ── Modal helpers ── */
  const openAdd = () => {
    setForm(EMPTY_FORM)
    setErrors({})
    setEditingId(null)
    setModal('add')
  }

  const openEdit = (t) => {
    setForm({ name: t.name, capacity: t.capacity != null ? String(t.capacity) : '' })
    setErrors({})
    setEditingId(t.id)
    setModal('edit')
  }

  const closeModal = () => { setModal(null); setEditingId(null) }

  const set = (field) => (e) => {
    const val = e.target.value
    setForm((f) => ({ ...f, [field]: val }))
    setErrors((er) => ({ ...er, [field]: null }))
  }

  const validate = (f) => {
    const e = {}
    if (!f.name.trim()) e.name = 'Il nome è obbligatorio.'
    if (f.capacity !== '' && (isNaN(Number(f.capacity)) || !Number.isInteger(Number(f.capacity)) || Number(f.capacity) <= 0))
      e.capacity = 'Inserisci un numero intero valido.'
    return e
  }

  /* ── Save (add / edit) ── */
  const handleSave = async () => {
    const e = validate(form)
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setSaving(true)

    const payload = {
      name:     form.name.trim(),
      capacity: form.capacity !== '' ? Number(form.capacity) : null,
    }

    if (modal === 'add') {
      const { error } = await supabase.from('tables').insert({
        ...payload,
        business_id: business.id,
      })
      if (error) { console.error('[handleSave insert]', error); setSaving(false); return }
      logActivity(business.id, business.user_id, 'table_added', `Tavolo aggiunto: ${payload.name}`)
    } else {
      const { error } = await supabase.from('tables').update(payload).eq('id', editingId)
      if (error) { console.error('[handleSave update]', error); setSaving(false); return }
      logActivity(business.id, business.user_id, 'table_updated', `Tavolo modificato: ${payload.name}`)
    }

    setSaving(false)
    closeModal()
    load()
  }

  /* ── Modifica rapida capienza dalla card (senza aprire il modale) ── */
  const handleQuickCapacity = async (t, rawValue) => {
    const trimmed = rawValue.trim()
    const nextCapacity = trimmed === '' ? null : Number(trimmed)
    if (trimmed !== '' && (isNaN(nextCapacity) || !Number.isInteger(nextCapacity) || nextCapacity <= 0)) return
    if (nextCapacity === (t.capacity ?? null)) return
    const { error } = await supabase.from('tables').update({ capacity: nextCapacity }).eq('id', t.id)
    if (error) { console.error('[handleQuickCapacity]', error); return }
    setTables((prev) => prev.map((x) => x.id === t.id ? { ...x, capacity: nextCapacity } : x))
  }

  /* ── Toggle libero/occupato — persistito su Supabase (tables.status),
     stesso pattern di handleQuickCapacity: update diretto sulla riga.
     Sopravvive al reload e resta coerente tra dispositivi/schede diverse
     aperte sullo stesso business (nessuna sottoscrizione realtime qui:
     ogni scheda vede lo stato aggiornato al prossimo load/refresh). ── */
  const toggleStatus = async (t) => {
    const nextStatus = t.status === 'occupato' ? 'libero' : 'occupato'
    const { error } = await supabase.from('tables').update({ status: nextStatus }).eq('id', t.id)
    if (error) { console.error('[toggleStatus]', error); return }
    setTables((prev) => prev.map((x) => x.id === t.id ? { ...x, status: nextStatus } : x))
  }

  /* ── Disattiva (mai DELETE reale) ── */
  const handleDeactivate = async (t) => {
    setBusyId(t.id)
    const { error } = await supabase.from('tables').update({ is_active: false }).eq('id', t.id)
    if (error) { console.error('[handleDeactivate]', error); setBusyId(null); return }
    setTables((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: false } : x))
    logActivity(business.id, business.user_id, 'table_deactivated', `Tavolo disattivato: ${t.name}`)
    setBusyId(null)
    setConfirmDeactivateId(null)
  }

  /* ── Riattiva ── */
  const handleReactivate = async (t) => {
    setBusyId(t.id)
    const { error } = await supabase.from('tables').update({ is_active: true }).eq('id', t.id)
    if (error) { console.error('[handleReactivate]', error); setBusyId(null); return }
    setTables((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: true } : x))
    logActivity(business.id, business.user_id, 'table_reactivated', `Tavolo riattivato: ${t.name}`)
    setBusyId(null)
  }

  if (!business) {
    return (
      <div className="db-section">
        <div className="db-empty-banner">Configura prima la tua attività.</div>
      </div>
    )
  }

  return (
    <div className="db-section">

      {/* Toolbar */}
      <div className="db-section-toolbar">
        <p className="db-section-desc">
          {tables.length > 0
            ? `${tables.length} tavol${tables.length !== 1 ? 'i' : 'o'} — libero/occupato è manuale, ma un appuntamento in corso collegato a un tavolo mostra il cliente automaticamente.`
            : 'Aggiungi i tavoli della tua sala.'}
        </p>
        <button className="db-btn-primary" onClick={openAdd}>+ Aggiungi tavolo</button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="sv-loading"><TvSpinner /></div>
      ) : tables.length === 0 ? (
        <div className="db-card">
          <p className="db-card-empty">Nessun tavolo ancora. Clicca "Aggiungi tavolo" per iniziare.</p>
        </div>
      ) : (
        <div className="tv-grid">
          {tables.map((t) => {
            // Un appuntamento reale collegato ha priorità sulla visualizzazione
            // rispetto al toggle manuale — vedi loadActiveAppointments sopra.
            const linkedClient = activeByTable[t.id] ?? null
            const occupied = linkedClient != null || t.status === 'occupato'
            if (!t.is_active) {
              return (
                <div key={t.id} className="tv-card tv-card--inactive">
                  <div className="tv-card-header">
                    <span className="tv-card-name">{t.name}</span>
                    <span className="tv-badge tv-badge--gray">Disattivato</span>
                  </div>
                  <button
                    className="tv-btn-reactivate"
                    disabled={busyId === t.id}
                    onClick={() => handleReactivate(t)}
                  >
                    {busyId === t.id ? <TvSpinner small /> : 'Riattiva'}
                  </button>
                </div>
              )
            }
            return (
              <div key={t.id} className={`tv-card ${occupied ? 'tv-card--occupied' : 'tv-card--free'}`}>
                <div className="tv-card-header">
                  <span className="tv-card-name">{t.name}</span>
                  <button className="tv-icon-btn" title="Modifica" onClick={() => openEdit(t)}>
                    <IconEdit />
                  </button>
                </div>

                <label className="tv-capacity-row">
                  <span className="tv-capacity-label">Persone</span>
                  <input
                    className="tv-capacity-input"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue={t.capacity ?? ''}
                    placeholder="—"
                    onBlur={(e) => handleQuickCapacity(t, e.target.value)}
                  />
                </label>

                {linkedClient ? (
                  <div
                    className="tv-status-toggle tv-status-toggle--occupied tv-status-toggle--linked"
                    title="Collegato a un appuntamento di oggi — il toggle manuale non si applica finché resta in corso"
                  >
                    {linkedClient}
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`tv-status-toggle ${occupied ? 'tv-status-toggle--occupied' : 'tv-status-toggle--free'}`}
                    onClick={() => toggleStatus(t)}
                  >
                    {occupied ? 'Occupato' : 'Libero'}
                  </button>
                )}

                {confirmDeactivateId === t.id ? (
                  <div className="tv-confirm-row">
                    <span className="tv-confirm-label">Disattivare?</span>
                    <button
                      className="tv-icon-btn tv-icon-btn--danger"
                      disabled={busyId === t.id}
                      onClick={() => handleDeactivate(t)}
                    >
                      {busyId === t.id ? <TvSpinner small /> : <IconCheck />}
                    </button>
                    <button className="tv-icon-btn" onClick={() => setConfirmDeactivateId(null)}>
                      <IconX />
                    </button>
                  </div>
                ) : (
                  <button
                    className="tv-btn-deactivate"
                    onClick={() => setConfirmDeactivateId(t.id)}
                  >
                    Disattiva
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal add/edit */}
      {modal && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">{modal === 'add' ? 'Nuovo tavolo' : 'Modifica tavolo'}</h2>
              <button className="sv-modal-close" onClick={closeModal} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <div className="sv-field">
                <label className="sv-label" htmlFor="tv-name">Nome/numero <span className="sv-required">*</span></label>
                <input
                  id="tv-name"
                  className={`sv-input ${errors.name ? 'sv-input--error' : ''}`}
                  type="text"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="es. Tavolo 3"
                  autoFocus
                />
                {errors.name && <p className="sv-field-error">{errors.name}</p>}
              </div>

              <div className="sv-field sv-field--half">
                <label className="sv-label" htmlFor="tv-capacity">Capienza <span className="sv-optional">(facoltativo)</span></label>
                <input
                  id="tv-capacity"
                  className={`sv-input ${errors.capacity ? 'sv-input--error' : ''}`}
                  type="number"
                  min="1"
                  step="1"
                  value={form.capacity}
                  onChange={set('capacity')}
                  placeholder="es. 4"
                />
                {errors.capacity && <p className="sv-field-error">{errors.capacity}</p>}
              </div>
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={closeModal}>Annulla</button>
              <button className="sv-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? <TvSpinner small /> : null}
                {saving ? 'Salvataggio…' : modal === 'add' ? 'Aggiungi' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Icons ── */
function IconEdit()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function IconCheck() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconX()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function TvSpinner({ small }) {
  const s = small ? 14 : 18
  return <svg style={{ width: s, height: s, animation: 'sv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
