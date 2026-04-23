import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

/* ── Constants ── */
const PRIORITY_META = {
  high:   { label: 'Alta',  cls: 'pr-pill--red',    dot: 'pr-dot--red'    },
  medium: { label: 'Media', cls: 'pr-pill--yellow',  dot: 'pr-dot--yellow' },
  low:    { label: 'Bassa', cls: 'pr-pill--gray',    dot: 'pr-dot--gray'   },
}

const FILTER_STATUS   = ['tutti', 'pending', 'done']
const FILTER_PRIORITY = ['tutti', 'high', 'medium', 'low']

const EMPTY_FORM = { title: '', notes: '', due_at: '', priority: 'medium' }

/* ── Helpers ── */
function formatDueDate(iso) {
  if (!iso) return null
  const d    = new Date(iso)
  const now  = new Date()
  const diff = Math.ceil((d - now) / 86400000)
  const fmt  = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  if (diff < 0)  return { label: `Scaduto il ${fmt}`,   overdue: true  }
  if (diff === 0) return { label: 'Scade oggi',          urgent:  true  }
  if (diff === 1) return { label: 'Scade domani',        urgent:  true  }
  if (diff <= 7)  return { label: `Scade in ${diff} gg`, soon:    true  }
  return { label: fmt }
}

function toLocalDateInput(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/* ── Component ── */
export default function Promemoria({ business }) {
  const [reminders, setReminders]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [filterStatus,   setFilterStatus]   = useState('tutti')
  const [filterPriority, setFilterPriority] = useState('tutti')

  const [modal, setModal]           = useState(null)   // null | 'add' | 'edit'
  const [form, setForm]             = useState(EMPTY_FORM)
  const [editId, setEditId]         = useState(null)
  const [errors, setErrors]         = useState({})
  const [saving, setSaving]         = useState(false)
  const [confirmId, setConfirmId]   = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  /* ── Load ── */
  const load = useCallback(async () => {
    if (!business) return
    setLoading(true)
    const { data } = await supabase
      .from('reminders')
      .select('*')
      .eq('business_id', business.id)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    setReminders(data ?? [])
    setLoading(false)
  }, [business])

  useEffect(() => { load() }, [load])

  /* ── Filtered ── */
  const filtered = reminders.filter(r => {
    if (filterStatus   !== 'tutti' && r.status   !== filterStatus)   return false
    if (filterPriority !== 'tutti' && r.priority !== filterPriority) return false
    return true
  })

  const pending = reminders.filter(r => r.status === 'pending').length

  /* ── Modal helpers ── */
  const openAdd = () => {
    setForm(EMPTY_FORM)
    setErrors({})
    setEditId(null)
    setModal('add')
  }

  const openEdit = (r) => {
    setForm({
      title:    r.title,
      notes:    r.notes ?? '',
      due_at:   toLocalDateInput(r.due_at),
      priority: r.priority,
    })
    setErrors({})
    setEditId(r.id)
    setModal('edit')
  }

  const closeModal = () => { setModal(null); setEditId(null) }

  const set = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: null }))
  }

  /* ── Validation ── */
  const validate = () => {
    const e = {}
    if (!form.title.trim()) e.title = 'Il titolo è obbligatorio.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /* ── Save ── */
  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      title:    form.title.trim(),
      notes:    form.notes.trim() || null,
      due_at:   form.due_at || null,
      priority: form.priority,
    }

    if (modal === 'add') {
      await supabase.from('reminders').insert({
        ...payload,
        business_id: business.id,
        user_id:     user.id,
        status:      'pending',
      })
    } else {
      await supabase.from('reminders').update(payload).eq('id', editId)
    }

    setSaving(false)
    closeModal()
    load()
  }

  /* ── Toggle done/pending ── */
  const toggleDone = async (r) => {
    const next = r.status === 'done' ? 'pending' : 'done'
    await supabase.from('reminders').update({ status: next }).eq('id', r.id)
    setReminders(prev => prev.map(x => x.id === r.id ? { ...x, status: next } : x))
  }

  /* ── Delete ── */
  const handleDelete = async (id) => {
    setDeletingId(id)
    await supabase.from('reminders').delete().eq('id', id)
    setReminders(prev => prev.filter(r => r.id !== id))
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
        <div className="pr-filters">
          <div className="db-filter-row">
            {FILTER_STATUS.map(s => (
              <button key={s}
                className={`db-filter-btn ${filterStatus === s ? 'db-filter-btn--active' : ''}`}
                onClick={() => setFilterStatus(s)}
              >
                {s === 'tutti' ? `Tutti${pending > 0 ? ` (${pending})` : ''}` : s === 'pending' ? 'Da fare' : 'Completati'}
              </button>
            ))}
          </div>
          <div className="db-filter-row">
            {FILTER_PRIORITY.map(p => (
              <button key={p}
                className={`db-filter-btn ${filterPriority === p ? 'db-filter-btn--active' : ''}`}
                onClick={() => setFilterPriority(p)}
              >
                {p === 'tutti' ? 'Tutte le priorità' : PRIORITY_META[p].label}
              </button>
            ))}
          </div>
        </div>
        <button className="db-btn-primary" onClick={openAdd}>+ Nuovo promemoria</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="pr-loading"><PrSpinner /></div>
      ) : filtered.length === 0 ? (
        <div className="db-card">
          <p className="db-card-empty">
            {reminders.length === 0
              ? 'Nessun promemoria. Aggiungine uno per tenere traccia delle attività.'
              : 'Nessun promemoria corrisponde ai filtri selezionati.'}
          </p>
        </div>
      ) : (
        <div className="pr-list">
          {filtered.map(r => {
            const due  = formatDueDate(r.due_at)
            const pmeta = PRIORITY_META[r.priority] ?? PRIORITY_META.medium
            const done  = r.status === 'done'

            return (
              <div key={r.id} className={`pr-row ${done ? 'pr-row--done' : ''}`}>
                {/* Checkbox */}
                <button
                  className={`pr-check ${done ? 'pr-check--done' : ''}`}
                  onClick={() => toggleDone(r)}
                  title={done ? 'Segna come da fare' : 'Segna come completato'}
                >
                  {done && <IconCheck />}
                </button>

                {/* Content */}
                <div className="pr-row-content">
                  <div className="pr-row-top">
                    <span className="pr-title">{r.title}</span>
                    <div className="pr-row-meta">
                      <span className={`pr-dot ${pmeta.dot}`} title={pmeta.label} />
                      <span className={`pr-pill ${pmeta.cls}`}>{pmeta.label}</span>
                      {due && (
                        <span className={`pr-due ${due.overdue ? 'pr-due--overdue' : due.urgent || due.soon ? 'pr-due--urgent' : ''}`}>
                          <IconClock /> {due.label}
                        </span>
                      )}
                    </div>
                  </div>
                  {r.notes && <p className="pr-notes">{r.notes}</p>}
                </div>

                {/* Actions */}
                <div className="pr-actions">
                  <button className="pr-action-btn" title="Modifica" onClick={() => openEdit(r)}>
                    <IconEdit />
                  </button>
                  {confirmId === r.id ? (
                    <div className="pr-confirm-row">
                      <span className="pr-confirm-label">Eliminare?</span>
                      <button
                        className="pr-action-btn pr-action-btn--danger"
                        disabled={deletingId === r.id}
                        onClick={() => handleDelete(r.id)}
                      >
                        {deletingId === r.id ? <PrSpinner small /> : <IconCheck />}
                      </button>
                      <button className="pr-action-btn" onClick={() => setConfirmId(null)}>
                        <IconX />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="pr-action-btn pr-action-btn--danger"
                      title="Elimina"
                      onClick={() => setConfirmId(r.id)}
                    >
                      <IconTrash />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal ── */}
      {modal && (
        <div className="pr-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="pr-modal">
            <div className="pr-modal-header">
              <h2 className="pr-modal-title">
                {modal === 'add' ? 'Nuovo promemoria' : 'Modifica promemoria'}
              </h2>
              <button className="pr-modal-close" onClick={closeModal}><IconX /></button>
            </div>

            <div className="pr-modal-body">

              {/* Titolo */}
              <div className="pr-field">
                <label className="pr-label" htmlFor="pr-title">
                  Titolo <span className="pr-required">*</span>
                </label>
                <input
                  id="pr-title"
                  className={`pr-input ${errors.title ? 'pr-input--error' : ''}`}
                  type="text"
                  value={form.title}
                  onChange={set('title')}
                  placeholder="es. Rispondere alle recensioni, Aggiornare i servizi…"
                  autoFocus
                />
                {errors.title && <p className="pr-field-error">{errors.title}</p>}
              </div>

              {/* Note */}
              <div className="pr-field">
                <label className="pr-label" htmlFor="pr-notes">
                  Note <span className="pr-optional">(facoltativo)</span>
                </label>
                <textarea
                  id="pr-notes"
                  className="pr-textarea"
                  value={form.notes}
                  onChange={set('notes')}
                  placeholder="Aggiungi dettagli o contesto…"
                  rows={3}
                />
              </div>

              {/* Data + Priorità */}
              <div className="pr-fields-row">
                <div className="pr-field">
                  <label className="pr-label" htmlFor="pr-due">
                    Scadenza <span className="pr-optional">(facoltativo)</span>
                  </label>
                  <input
                    id="pr-due"
                    className="pr-input"
                    type="date"
                    value={form.due_at}
                    onChange={set('due_at')}
                    min={new Date().toISOString().slice(0, 10)}
                  />
                </div>

                <div className="pr-field">
                  <label className="pr-label">Priorità</label>
                  <div className="pr-priority-row">
                    {['high', 'medium', 'low'].map(p => (
                      <button
                        key={p}
                        type="button"
                        className={`pr-priority-btn pr-priority-btn--${p} ${form.priority === p ? 'pr-priority-btn--active' : ''}`}
                        onClick={() => setForm(f => ({ ...f, priority: p }))}
                      >
                        <span className={`pr-dot ${PRIORITY_META[p].dot}`} />
                        {PRIORITY_META[p].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pr-modal-footer">
              <button className="pr-btn-cancel" onClick={closeModal}>Annulla</button>
              <button className="pr-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? <><PrSpinner small /> Salvataggio…</> : modal === 'add' ? 'Aggiungi' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

/* ── Icons ── */
function IconCheck() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconEdit()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function IconTrash() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> }
function IconX()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconClock() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function PrSpinner({ small }) {
  const s = small ? 14 : 20
  return <svg style={{ width: s, height: s, animation: 'pr-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
