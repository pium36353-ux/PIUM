import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'

const EMPTY_FORM = { name: '', capacity: '' }

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

  useEffect(() => {
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [load])

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
            ? `${tables.length} tavol${tables.length !== 1 ? 'i' : 'o'} — stato libero/occupato manuale, non ancora collegato alle prenotazioni.`
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
            const occupied = t.status === 'occupato'
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

                <button
                  type="button"
                  className={`tv-status-toggle ${occupied ? 'tv-status-toggle--occupied' : 'tv-status-toggle--free'}`}
                  onClick={() => toggleStatus(t)}
                >
                  {occupied ? 'Occupato' : 'Libero'}
                </button>

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
