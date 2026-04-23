import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { generateWithClaude } from '../../lib/claude'

/* ── Constants ── */
const SOURCES = [
  { value: 'manual',      label: 'Manuale'     },
  { value: 'google',      label: 'Google'      },
  { value: 'tripadvisor', label: 'TripAdvisor' },
  { value: 'facebook',    label: 'Facebook'    },
  { value: 'yelp',        label: 'Yelp'        },
]

const FILTER_RATINGS = [0, 5, 4, 3, 2, 1]

const EMPTY_FORM = { author_name: '', rating: 5, body: '', source: 'manual', reviewed_at: '' }

/* ── Helpers ── */
function Stars({ rating, size = 16, interactive = false, onSelect }) {
  return (
    <div className="rv-stars" style={{ gap: size < 14 ? 2 : 3 }}>
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          type="button"
          className={`rv-star ${n <= rating ? 'rv-star--on' : ''} ${interactive ? 'rv-star--btn' : ''}`}
          style={{ fontSize: size }}
          onClick={interactive ? () => onSelect(n) : undefined}
          tabIndex={interactive ? 0 : -1}
          aria-label={interactive ? `${n} stelle` : undefined}
        >★</button>
      ))}
    </div>
  )
}

function avgRating(reviews) {
  if (!reviews.length) return null
  return (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
}

function buildReplyPrompt(business, review) {
  const tone = review.rating >= 4 ? 'caloroso e grato' : review.rating === 3 ? 'professionale e costruttivo' : 'empatico, scusante e propositivo'
  return [
    `Sei il titolare di "${business.name}", un'attività di tipo "${business.category ?? 'locale'}" a ${business.city ?? 'Italia'}.`,
    `Scrivi una risposta professionale in italiano a questa recensione ricevuta:`,
    ``,
    `Autore: ${review.author_name}`,
    `Valutazione: ${review.rating}/5 stelle`,
    review.body ? `Testo: "${review.body}"` : `Testo: (senza testo)`,
    ``,
    `Tono da usare: ${tone}.`,
    `La risposta deve essere breve (2-4 frasi), personale, in prima persona. Non usare frasi generiche.`,
    `Rispondi SOLO con il testo della risposta, senza virgolette, senza intestazioni.`,
  ].join('\n')
}

/* ── Component ── */
export default function Recensioni({ business }) {
  const [reviews, setReviews]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [filterRating, setFilterRating] = useState(0)

  // Add modal
  const [addModal, setAddModal]     = useState(false)
  const [addForm, setAddForm]       = useState(EMPTY_FORM)
  const [addErrors, setAddErrors]   = useState({})
  const [addSaving, setAddSaving]   = useState(false)

  // Reply state per card: { [id]: { text, generating, saved, editing } }
  const [replies, setReplies]       = useState({})

  // Delete
  const [confirmId, setConfirmId]   = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  /* ── Load ── */
  const load = useCallback(async () => {
    if (!business) return
    setLoading(true)
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('business_id', business.id)
      .order('reviewed_at', { ascending: false })
    const list = data ?? []
    setReviews(list)
    // Init reply state from DB
    const init = {}
    list.forEach(r => {
      init[r.id] = {
        text:       r.reply ?? '',
        generating: false,
        saved:      !!r.replied_at,
        editing:    false,
      }
    })
    setReplies(init)
    setLoading(false)
  }, [business])

  useEffect(() => { load() }, [load])

  /* ── Filtered + stats ── */
  const filtered = filterRating === 0 ? reviews : reviews.filter(r => r.rating === filterRating)
  const avg      = avgRating(reviews)
  const counts   = [5,4,3,2,1].map(n => reviews.filter(r => r.rating === n).length)

  /* ── Reply helpers ── */
  const setReply = (id, patch) =>
    setReplies(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const generateReply = async (review) => {
    setReply(review.id, { generating: true, saved: false })
    try {
      const text = await generateWithClaude(buildReplyPrompt(business, review))
      setReply(review.id, { text: text.trim(), generating: false, editing: true })
    } catch (err) {
      console.error('[Recensioni] errore generazione risposta:', err)
      setReply(review.id, { generating: false })
    }
  }

  const saveReply = async (review) => {
    const text = replies[review.id]?.text ?? ''
    await supabase.from('reviews').update({
      reply:      text.trim() || null,
      replied_at: text.trim() ? new Date().toISOString() : null,
    }).eq('id', review.id)
    setReply(review.id, { saved: !!text.trim(), editing: false })
  }

  /* ── Add review ── */
  const validateAdd = () => {
    const e = {}
    if (!addForm.author_name.trim()) e.author_name = 'Il nome è obbligatorio.'
    setAddErrors(e)
    return Object.keys(e).length === 0
  }

  const handleAdd = async () => {
    if (!validateAdd()) return
    setAddSaving(true)
    const { data: row } = await supabase.from('reviews').insert({
      business_id:  business.id,
      author_name:  addForm.author_name.trim(),
      rating:       Number(addForm.rating),
      body:         addForm.body.trim() || null,
      source:       addForm.source,
      reviewed_at:  addForm.reviewed_at || new Date().toISOString(),
      is_visible:   true,
    }).select().single()
    setAddSaving(false)
    setAddModal(false)
    setAddForm(EMPTY_FORM)
    if (row) {
      setReviews(prev => [row, ...prev])
      setReplies(prev => ({ ...prev, [row.id]: { text: '', generating: false, saved: false, editing: false } }))
    }
  }

  /* ── Delete ── */
  const handleDelete = async (id) => {
    setDeletingId(id)
    await supabase.from('reviews').delete().eq('id', id)
    setReviews(prev => prev.filter(r => r.id !== id))
    setReplies(prev => { const n = { ...prev }; delete n[id]; return n })
    setDeletingId(null)
    setConfirmId(null)
  }

  if (!business) {
    return <div className="db-section"><div className="db-empty-banner">Configura prima la tua attività.</div></div>
  }

  return (
    <div className="db-section">

      {/* Toolbar */}
      <div className="db-section-toolbar">
        <p className="db-section-desc">
          {reviews.length > 0
            ? `${reviews.length} recension${reviews.length === 1 ? 'e' : 'i'} — media ${avg}/5`
            : 'Aggiungi le recensioni ricevute e genera risposte con AI.'}
        </p>
        <button className="db-btn-primary" onClick={() => setAddModal(true)}>+ Aggiungi recensione</button>
      </div>

      {/* Summary */}
      {reviews.length > 0 && (
        <div className="db-reviews-summary">
          <div className="db-review-score">
            <span className="db-review-score-num">{avg}</span>
            <Stars rating={Math.round(Number(avg))} size={15} />
            <span className="db-review-count">{reviews.length} recension{reviews.length === 1 ? 'e' : 'i'}</span>
          </div>
          <div className="db-review-bars">
            {[5,4,3,2,1].map((n, i) => {
              const pct = reviews.length ? Math.round((counts[i] / reviews.length) * 100) : 0
              return (
                <div key={n} className="db-review-bar-row">
                  <span className="db-review-bar-label">{n}★</span>
                  <div className="db-review-bar-track">
                    <div className="db-review-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="db-review-bar-pct">{counts[i]}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter */}
      {reviews.length > 0 && (
        <div className="db-filter-row">
          {FILTER_RATINGS.map(n => (
            <button key={n}
              className={`db-filter-btn ${filterRating === n ? 'db-filter-btn--active' : ''}`}
              onClick={() => setFilterRating(n)}
            >
              {n === 0 ? 'Tutte' : `${n}★`}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="rv-loading"><RvSpinner /></div>
      ) : filtered.length === 0 ? (
        <div className="db-card">
          <p className="db-card-empty">
            {reviews.length === 0
              ? 'Nessuna recensione ancora. Aggiungine una per iniziare.'
              : 'Nessuna recensione con questo filtro.'}
          </p>
        </div>
      ) : (
        <div className="rv-list">
          {filtered.map(r => (
            <ReviewCard
              key={r.id}
              review={r}
              business={business}
              reply={replies[r.id] ?? { text: '', generating: false, saved: false, editing: false }}
              confirmId={confirmId}
              deletingId={deletingId}
              onGenerate={() => generateReply(r)}
              onReplyChange={text => setReply(r.id, { text, saved: false })}
              onEditToggle={() => setReply(r.id, { editing: !replies[r.id]?.editing })}
              onSaveReply={() => saveReply(r)}
              onConfirmDelete={() => setConfirmId(r.id)}
              onCancelDelete={() => setConfirmId(null)}
              onDelete={() => handleDelete(r.id)}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      {addModal && (
        <div className="rv-overlay" onClick={e => e.target === e.currentTarget && setAddModal(false)}>
          <div className="rv-modal">
            <div className="rv-modal-header">
              <h2 className="rv-modal-title">Aggiungi recensione</h2>
              <button className="rv-modal-close" onClick={() => setAddModal(false)}><IconX /></button>
            </div>

            <div className="rv-modal-body">
              {/* Autore + fonte */}
              <div className="rv-fields-row">
                <div className="rv-field">
                  <label className="rv-label" htmlFor="rv-author">
                    Nome autore <span className="rv-required">*</span>
                  </label>
                  <input
                    id="rv-author"
                    className={`rv-input ${addErrors.author_name ? 'rv-input--error' : ''}`}
                    type="text"
                    value={addForm.author_name}
                    onChange={e => { setAddForm(f => ({ ...f, author_name: e.target.value })); setAddErrors({}) }}
                    placeholder="es. Marco B."
                    autoFocus
                  />
                  {addErrors.author_name && <p className="rv-field-error">{addErrors.author_name}</p>}
                </div>
                <div className="rv-field">
                  <label className="rv-label" htmlFor="rv-source">Fonte</label>
                  <select
                    id="rv-source"
                    className="rv-input rv-select"
                    value={addForm.source}
                    onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))}
                  >
                    {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Voto */}
              <div className="rv-field">
                <label className="rv-label">Valutazione</label>
                <div className="rv-rating-row">
                  <Stars rating={addForm.rating} size={28} interactive onSelect={n => setAddForm(f => ({ ...f, rating: n }))} />
                  <span className="rv-rating-label">{addForm.rating}/5</span>
                </div>
              </div>

              {/* Testo */}
              <div className="rv-field">
                <label className="rv-label" htmlFor="rv-body">
                  Testo della recensione <span className="rv-optional">(facoltativo)</span>
                </label>
                <textarea
                  id="rv-body"
                  className="rv-textarea"
                  value={addForm.body}
                  onChange={e => setAddForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Cosa ha scritto il cliente…"
                  rows={4}
                />
              </div>

              {/* Data */}
              <div className="rv-field rv-field--half">
                <label className="rv-label" htmlFor="rv-date">
                  Data recensione <span className="rv-optional">(facoltativo)</span>
                </label>
                <input
                  id="rv-date"
                  className="rv-input"
                  type="date"
                  value={addForm.reviewed_at}
                  onChange={e => setAddForm(f => ({ ...f, reviewed_at: e.target.value }))}
                  max={new Date().toISOString().slice(0,10)}
                />
              </div>
            </div>

            <div className="rv-modal-footer">
              <button className="rv-btn-cancel" onClick={() => setAddModal(false)}>Annulla</button>
              <button className="rv-btn-save" onClick={handleAdd} disabled={addSaving}>
                {addSaving ? <><RvSpinner small /> Salvataggio…</> : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Review card ── */
function ReviewCard({ review: r, business, reply, confirmId, deletingId, onGenerate, onReplyChange, onEditToggle, onSaveReply, onConfirmDelete, onCancelDelete, onDelete }) {
  const date = new Date(r.reviewed_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  const src  = SOURCES.find(s => s.value === r.source)

  return (
    <div className="rv-card">
      {/* Header */}
      <div className="rv-card-head">
        <div className="rv-card-author-row">
          <div className="rv-avatar">{r.author_name[0].toUpperCase()}</div>
          <div className="rv-author-info">
            <span className="rv-author-name">{r.author_name}</span>
            <div className="rv-author-meta">
              <Stars rating={r.rating} size={13} />
              <span className="rv-date">{date}</span>
              {src && src.value !== 'manual' && <span className="rv-source-badge">{src.label}</span>}
            </div>
          </div>
        </div>
        <div className="rv-card-actions">
          {confirmId === r.id ? (
            <div className="rv-confirm-row">
              <span className="rv-confirm-label">Eliminare?</span>
              <button className="rv-action-btn rv-action-btn--danger" disabled={deletingId === r.id} onClick={onDelete}>
                {deletingId === r.id ? <RvSpinner small /> : <IconCheck />}
              </button>
              <button className="rv-action-btn" onClick={onCancelDelete}><IconX /></button>
            </div>
          ) : (
            <button className="rv-action-btn rv-action-btn--danger" title="Elimina" onClick={onConfirmDelete}>
              <IconTrash />
            </button>
          )}
        </div>
      </div>

      {/* Review body */}
      {r.body && <p className="rv-body">{r.body}</p>}

      {/* Reply section */}
      <div className="rv-reply-section">
        <div className="rv-reply-header">
          <span className="rv-reply-label">
            {reply.saved ? <><IconCheckCircle /> Risposta inviata</> : 'Risposta del titolare'}
          </span>
          <div className="rv-reply-actions-row">
            {!reply.generating && (
              <button className="rv-btn-ai" onClick={onGenerate}>
                <IconSparkle /> {reply.text ? 'Rigenera' : 'Genera con AI'}
              </button>
            )}
            {reply.text && !reply.editing && (
              <button className="rv-btn-ghost" onClick={onEditToggle}><IconEdit /> Modifica</button>
            )}
          </div>
        </div>

        {reply.generating ? (
          <div className="rv-reply-generating">
            <RvSpinner small /> Generazione in corso…
          </div>
        ) : reply.editing ? (
          <div className="rv-reply-edit">
            <textarea
              className="rv-reply-textarea"
              value={reply.text}
              onChange={e => onReplyChange(e.target.value)}
              rows={4}
              placeholder="Scrivi la tua risposta…"
              autoFocus
            />
            <div className="rv-reply-edit-actions">
              <button className="rv-btn-ghost" onClick={onEditToggle}>Annulla</button>
              <button className="rv-btn-save-reply" onClick={onSaveReply}>
                <IconCheck /> Salva come inviata
              </button>
            </div>
          </div>
        ) : reply.text ? (
          <div className={`rv-reply-text ${reply.saved ? 'rv-reply-text--sent' : ''}`}>
            <p>{reply.text}</p>
            {!reply.saved && (
              <button className="rv-btn-send" onClick={onSaveReply}>
                <IconCheck /> Segna come inviata
              </button>
            )}
          </div>
        ) : (
          <p className="rv-reply-empty">Nessuna risposta. Clicca "Genera con AI" per crearne una automaticamente.</p>
        )}
      </div>
    </div>
  )
}

/* ── Icons ── */
function IconX()          { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconCheck()      { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconCheckCircle(){ return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> }
function IconTrash()      { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> }
function IconEdit()       { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function IconSparkle()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.88 5.76a1 1 0 0 0 .95.69h6.05l-4.9 3.56a1 1 0 0 0-.36 1.12L17.4 20l-4.9-3.56a1 1 0 0 0-1.18 0L6.42 20l1.88-5.87a1 1 0 0 0-.36-1.12L3.04 9.45H9.1a1 1 0 0 0 .95-.69L12 3z"/></svg> }
function RvSpinner({ small }) {
  const s = small ? 13 : 20
  return <svg style={{ width: s, height: s, animation: 'rv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
