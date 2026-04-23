import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const EMPTY_FORM = {
  name:         '',
  description:  '',
  price:        '',
  price_label:  '',
  duration_min: '',
  is_available: true,
}

const PRICE_LABELS = ['', 'a partire da', 'fisso', 'per ora', 'a seduta', 'al mese', 'a persona']

function formatDuration(min) {
  if (!min) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export default function Servizi({ business }) {
  const [services, setServices]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null)   // null | 'add' | 'edit'
  const [form, setForm]             = useState(EMPTY_FORM)
  const [editingId, setEditingId]   = useState(null)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmId, setConfirmId]   = useState(null)
  const [errors, setErrors]         = useState({})

  const load = useCallback(async () => {
    if (!business) return
    setLoading(true)
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order')
      .order('created_at')
    setServices(data ?? [])
    setLoading(false)
  }, [business])

  useEffect(() => { load() }, [load])

  /* ── Modal helpers ── */
  const openAdd = () => {
    setForm(EMPTY_FORM)
    setErrors({})
    setEditingId(null)
    setModal('add')
  }

  const openEdit = (s) => {
    setForm({
      name:         s.name,
      description:  s.description ?? '',
      price:        s.price != null ? String(s.price) : '',
      price_label:  s.price_label ?? '',
      duration_min: s.duration_min != null ? String(s.duration_min) : '',
      is_available: s.is_available,
    })
    setErrors({})
    setEditingId(s.id)
    setModal('edit')
  }

  const closeModal = () => { setModal(null); setEditingId(null) }

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [field]: val }))
    setErrors((er) => ({ ...er, [field]: null }))
  }

  /* ── Validation ── */
  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Il nome è obbligatorio.'
    if (form.price !== '' && isNaN(Number(form.price))) e.price = 'Inserisci un numero valido.'
    if (form.duration_min !== '' && (isNaN(Number(form.duration_min)) || Number(form.duration_min) <= 0))
      e.duration_min = 'Inserisci una durata valida in minuti.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /* ── Save (add / edit) ── */
  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)

    const payload = {
      name:         form.name.trim(),
      description:  form.description.trim() || null,
      price:        form.price !== '' ? Number(form.price) : null,
      price_label:  form.price_label || null,
      duration_min: form.duration_min !== '' ? Number(form.duration_min) : null,
      is_available: form.is_available,
    }

    if (modal === 'add') {
      await supabase.from('services').insert({
        ...payload,
        business_id: business.id,
        sort_order:  services.length,
      })
    } else {
      await supabase.from('services').update(payload).eq('id', editingId)
    }

    setSaving(false)
    closeModal()
    load()
  }

  /* ── Toggle availability ── */
  const toggleAvailable = async (s) => {
    await supabase
      .from('services')
      .update({ is_available: !s.is_available })
      .eq('id', s.id)
    setServices((prev) =>
      prev.map((x) => x.id === s.id ? { ...x, is_available: !x.is_available } : x)
    )
  }

  /* ── Delete ── */
  const handleDelete = async (id) => {
    setDeletingId(id)
    await supabase.from('services').delete().eq('id', id)
    setServices((prev) => prev.filter((s) => s.id !== id))
    setDeletingId(null)
    setConfirmId(null)
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
          {services.length > 0
            ? `${services.length} servizio${services.length !== 1 ? 'i' : ''} — visibili sulla tua pagina pubblica.`
            : 'Aggiungi i servizi offerti dalla tua attività.'}
        </p>
        <button className="db-btn-primary" onClick={openAdd}>+ Aggiungi servizio</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="sv-loading">
          <SvSpinner />
        </div>
      ) : services.length === 0 ? (
        <div className="db-card">
          <p className="db-card-empty">Nessun servizio ancora. Clicca "Aggiungi servizio" per iniziare.</p>
        </div>
      ) : (
        <div className="sv-list">
          {services.map((s) => (
            <div key={s.id} className={`sv-row ${!s.is_available ? 'sv-row--inactive' : ''}`}>
              <div className="sv-row-main">
                <div className="sv-row-top">
                  <span className="sv-name">{s.name}</span>
                  <div className="sv-row-badges">
                    {s.price != null && (
                      <span className="sv-price">
                        {s.price_label && <span className="sv-price-label">{s.price_label} </span>}
                        €{Number(s.price).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </span>
                    )}
                    {s.duration_min && (
                      <span className="sv-badge sv-badge--gray">
                        <IconClock /> {formatDuration(s.duration_min)}
                      </span>
                    )}
                    <span className={`sv-badge ${s.is_available ? 'sv-badge--green' : 'sv-badge--red'}`}>
                      {s.is_available ? 'Attivo' : 'Disattivo'}
                    </span>
                  </div>
                </div>
                {s.description && <p className="sv-desc">{s.description}</p>}
              </div>

              <div className="sv-row-actions">
                <button
                  className="sv-action-btn"
                  title={s.is_available ? 'Disattiva' : 'Attiva'}
                  onClick={() => toggleAvailable(s)}
                >
                  {s.is_available ? <IconEyeOff /> : <IconEye />}
                </button>
                <button className="sv-action-btn" title="Modifica" onClick={() => openEdit(s)}>
                  <IconEdit />
                </button>
                {confirmId === s.id ? (
                  <div className="sv-confirm-row">
                    <span className="sv-confirm-label">Eliminare?</span>
                    <button
                      className="sv-action-btn sv-action-btn--danger"
                      disabled={deletingId === s.id}
                      onClick={() => handleDelete(s.id)}
                    >
                      {deletingId === s.id ? <SvSpinner small /> : <IconCheck />}
                    </button>
                    <button className="sv-action-btn" onClick={() => setConfirmId(null)}>
                      <IconX />
                    </button>
                  </div>
                ) : (
                  <button
                    className="sv-action-btn sv-action-btn--danger"
                    title="Elimina"
                    onClick={() => setConfirmId(s.id)}
                  >
                    <IconTrash />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">{modal === 'add' ? 'Nuovo servizio' : 'Modifica servizio'}</h2>
              <button className="sv-modal-close" onClick={closeModal} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              {/* Nome */}
              <div className="sv-field">
                <label className="sv-label" htmlFor="sv-name">Nome <span className="sv-required">*</span></label>
                <input
                  id="sv-name"
                  className={`sv-input ${errors.name ? 'sv-input--error' : ''}`}
                  type="text"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="es. Taglio capelli, Massaggio rilassante…"
                  autoFocus
                />
                {errors.name && <p className="sv-field-error">{errors.name}</p>}
              </div>

              {/* Descrizione */}
              <div className="sv-field">
                <label className="sv-label" htmlFor="sv-desc">Descrizione <span className="sv-optional">(facoltativo)</span></label>
                <textarea
                  id="sv-desc"
                  className="sv-textarea"
                  value={form.description}
                  onChange={set('description')}
                  placeholder="Descrivi brevemente il servizio…"
                  rows={3}
                />
              </div>

              {/* Prezzo + etichetta */}
              <div className="sv-fields-row">
                <div className="sv-field">
                  <label className="sv-label" htmlFor="sv-price">Prezzo (€) <span className="sv-optional">(facoltativo)</span></label>
                  <input
                    id="sv-price"
                    className={`sv-input ${errors.price ? 'sv-input--error' : ''}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={set('price')}
                    placeholder="es. 25"
                  />
                  {errors.price && <p className="sv-field-error">{errors.price}</p>}
                </div>
                <div className="sv-field">
                  <label className="sv-label" htmlFor="sv-price-label">Tipo prezzo</label>
                  <select
                    id="sv-price-label"
                    className="sv-input sv-select"
                    value={form.price_label}
                    onChange={set('price_label')}
                    disabled={form.price === ''}
                  >
                    {PRICE_LABELS.map((l) => (
                      <option key={l} value={l}>{l || '—'}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Durata */}
              <div className="sv-field sv-field--half">
                <label className="sv-label" htmlFor="sv-duration">Durata (minuti) <span className="sv-optional">(facoltativo)</span></label>
                <div className="sv-input-suffix-wrap">
                  <input
                    id="sv-duration"
                    className={`sv-input sv-input--suffix ${errors.duration_min ? 'sv-input--error' : ''}`}
                    type="number"
                    min="1"
                    step="1"
                    value={form.duration_min}
                    onChange={set('duration_min')}
                    placeholder="es. 60"
                  />
                  <span className="sv-input-suffix">
                    {form.duration_min ? formatDuration(Number(form.duration_min)) : 'min'}
                  </span>
                </div>
                {errors.duration_min && <p className="sv-field-error">{errors.duration_min}</p>}
              </div>

              {/* Toggle attivo */}
              <label className="sv-toggle-row">
                <div className="sv-toggle-text">
                  <span className="sv-toggle-label">Servizio attivo</span>
                  <span className="sv-toggle-hint">Visibile sulla pagina pubblica</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_available}
                  className={`sv-toggle ${form.is_available ? 'sv-toggle--on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, is_available: !f.is_available }))}
                >
                  <span className="sv-toggle-thumb" />
                </button>
              </label>
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={closeModal}>Annulla</button>
              <button className="sv-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? <SvSpinner small /> : null}
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
function IconEdit()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function IconTrash()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> }
function IconEye()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
function IconEyeOff() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> }
function IconCheck()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconX()      { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconClock()  { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function SvSpinner({ small }) {
  const s = small ? 14 : 18
  return <svg style={{ width: s, height: s, animation: 'sv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
