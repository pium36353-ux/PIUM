import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { generateWithClaude } from '../../lib/claude'

/* ── Constants ── */
const PLATFORMS = [
  { value: 'instagram', label: 'Instagram', color: '#e1306c' },
  { value: 'facebook',  label: 'Facebook',  color: '#1877f2' },
]

const TONES = [
  'Amichevole e informale',
  'Professionale',
  'Promozionale',
  'Storytelling',
  'Urgente (offerta limitata)',
]

const STATUS_META = {
  draft:    { label: 'Bozza',     cls: 'so-badge--gray'  },
  approved: { label: 'Approvato', cls: 'so-badge--green' },
  archived: { label: 'Archiviato',cls: 'so-badge--muted' },
}

const FILTER_PLATFORMS = ['tutti', 'instagram', 'facebook']
const FILTER_STATUSES  = ['tutti', 'draft', 'approved']

const EMPTY_GENERATE = { platform: 'instagram', topic: '', tone: TONES[0] }
const EMPTY_EDIT     = { content: '', hashtags: '', platform: 'instagram', status: 'draft' }

/* ── Helpers ── */
function parseAIResponse(raw) {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const obj = JSON.parse(cleaned)
    return {
      content:  obj.content  ?? raw,
      hashtags: Array.isArray(obj.hashtags) ? obj.hashtags : [],
    }
  } catch {
    return { content: raw, hashtags: [] }
  }
}

function buildPrompt(business, { platform, topic, tone }) {
  const plabel = PLATFORMS.find(p => p.value === platform)?.label ?? platform
  return [
    `Sei un esperto di social media marketing per piccole imprese locali italiane.`,
    `Genera un post per ${plabel} per questa attività:`,
    `- Nome: ${business.name}`,
    `- Categoria: ${business.category ?? ''}`,
    `- Città: ${business.city ?? ''}`,
    business.description ? `- Descrizione: ${business.description}` : null,
    ``,
    `Argomento del post: ${topic || 'presentazione generale dell\'attività'}`,
    `Tono: ${tone}`,
    ``,
    `Rispondi SOLO con un oggetto JSON (senza markdown, senza backtick) con questa struttura:`,
    `{"content":"testo del post in italiano","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]}`,
    ``,
    `Il post deve essere coinvolgente, adatto a ${plabel}, scritto in italiano. Max 280 parole per il content.`,
  ].filter(Boolean).join('\n')
}

/* ── Component ── */
export default function Social({ business }) {
  const [drafts, setDrafts]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [filterPlatform, setFilterPlatform] = useState('tutti')
  const [filterStatus,   setFilterStatus]   = useState('tutti')

  // Generate modal
  const [genModal, setGenModal]     = useState(false)
  const [genForm,  setGenForm]      = useState(EMPTY_GENERATE)
  const [genLoading, setGenLoading] = useState(false)
  const [genPreview, setGenPreview] = useState(null)  // { content, hashtags }
  const [genError, setGenError]     = useState(null)
  const [genSaving, setGenSaving]   = useState(false)

  // Edit modal
  const [editModal, setEditModal]   = useState(false)
  const [editForm,  setEditForm]    = useState(EMPTY_EDIT)
  const [editId,    setEditId]      = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editErrors, setEditErrors] = useState({})

  // Delete
  const [confirmId,   setConfirmId]   = useState(null)
  const [deletingId,  setDeletingId]  = useState(null)

  /* ── Load ── */
  const load = useCallback(async () => {
    if (!business) return
    setLoading(true)
    const { data } = await supabase
      .from('social_drafts')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
    setDrafts(data ?? [])
    setLoading(false)
  }, [business])

  useEffect(() => { load() }, [load])

  /* ── Filtered drafts ── */
  const filtered = drafts.filter(d => {
    if (filterPlatform !== 'tutti' && d.platform !== filterPlatform) return false
    if (filterStatus   !== 'tutti' && d.status   !== filterStatus)   return false
    return true
  })

  /* ── Generate ── */
  const handleGenerate = async () => {
    setGenLoading(true)
    setGenError(null)
    setGenPreview(null)
    try {
      const prompt = buildPrompt(business, genForm)
      const raw    = await generateWithClaude(prompt)
      setGenPreview(parseAIResponse(raw))
    } catch (err) {
      setGenError('Errore durante la generazione. Riprova.')
      console.error('[Social] generazione fallita:', err)
    }
    setGenLoading(false)
  }

  const handleSaveDraft = async () => {
    if (!genPreview) return
    setGenSaving(true)
    const prompt = buildPrompt(business, genForm)
    await supabase.from('social_drafts').insert({
      business_id:  business.id,
      platform:     genForm.platform,
      content:      genPreview.content,
      hashtags:     genPreview.hashtags,
      status:       'draft',
      ai_generated: true,
      ai_prompt:    prompt,
    })
    setGenSaving(false)
    setGenModal(false)
    setGenPreview(null)
    setGenForm(EMPTY_GENERATE)
    load()
  }

  const closeGenModal = () => {
    setGenModal(false)
    setGenPreview(null)
    setGenError(null)
    setGenForm(EMPTY_GENERATE)
  }

  /* ── Edit ── */
  const openEdit = (d) => {
    setEditForm({
      content:  d.content,
      hashtags: (d.hashtags ?? []).join(' '),
      platform: d.platform,
      status:   d.status,
    })
    setEditId(d.id)
    setEditErrors({})
    setEditModal(true)
  }

  const handleEditSave = async () => {
    if (!editForm.content.trim()) {
      setEditErrors({ content: 'Il testo è obbligatorio.' })
      return
    }
    setEditSaving(true)
    const hashtags = editForm.hashtags
      .split(/\s+/)
      .map(t => t.startsWith('#') ? t : `#${t}`)
      .filter(t => t.length > 1)

    await supabase.from('social_drafts').update({
      content:  editForm.content.trim(),
      hashtags: hashtags.length > 0 ? hashtags : null,
      platform: editForm.platform,
      status:   editForm.status,
    }).eq('id', editId)

    setEditSaving(false)
    setEditModal(false)
    load()
  }

  /* ── Approve quick action ── */
  const toggleApprove = async (d) => {
    const next = d.status === 'approved' ? 'draft' : 'approved'
    await supabase.from('social_drafts').update({ status: next }).eq('id', d.id)
    setDrafts(prev => prev.map(x => x.id === d.id ? { ...x, status: next } : x))
  }

  /* ── Delete ── */
  const handleDelete = async (id) => {
    setDeletingId(id)
    await supabase.from('social_drafts').delete().eq('id', id)
    setDrafts(prev => prev.filter(d => d.id !== id))
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
        <div className="so-filters">
          <div className="db-filter-row">
            {FILTER_PLATFORMS.map(p => (
              <button key={p}
                className={`db-filter-btn ${filterPlatform === p ? 'db-filter-btn--active' : ''}`}
                onClick={() => setFilterPlatform(p)}
              >
                {p === 'tutti' ? 'Tutti' : PLATFORMS.find(x => x.value === p)?.label}
              </button>
            ))}
          </div>
          <div className="db-filter-row">
            {FILTER_STATUSES.map(s => (
              <button key={s}
                className={`db-filter-btn ${filterStatus === s ? 'db-filter-btn--active' : ''}`}
                onClick={() => setFilterStatus(s)}
              >
                {s === 'tutti' ? 'Tutti gli stati' : STATUS_META[s]?.label}
              </button>
            ))}
          </div>
        </div>
        <button className="db-btn-primary" onClick={() => setGenModal(true)}>
          <IconSparkle /> Genera con AI
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="so-loading"><SoSpinner /></div>
      ) : filtered.length === 0 ? (
        <div className="db-card">
          <p className="db-card-empty">
            {drafts.length === 0
              ? 'Nessuna bozza. Clicca "Genera con AI" per creare il tuo primo post.'
              : 'Nessuna bozza corrisponde ai filtri selezionati.'}
          </p>
        </div>
      ) : (
        <div className="so-list">
          {filtered.map(d => (
            <DraftCard
              key={d.id}
              draft={d}
              confirmId={confirmId}
              deletingId={deletingId}
              onEdit={() => openEdit(d)}
              onApprove={() => toggleApprove(d)}
              onDelete={() => handleDelete(d.id)}
              onConfirmDelete={() => setConfirmId(d.id)}
              onCancelDelete={() => setConfirmId(null)}
            />
          ))}
        </div>
      )}

      {/* ── Generate modal ── */}
      {genModal && (
        <div className="so-overlay" onClick={e => e.target === e.currentTarget && closeGenModal()}>
          <div className="so-modal">
            <div className="so-modal-header">
              <h2 className="so-modal-title">
                <IconSparkle /> Genera post con AI
              </h2>
              <button className="so-modal-close" onClick={closeGenModal}><IconX /></button>
            </div>

            <div className="so-modal-body">
              {/* Platform */}
              <div className="so-field">
                <label className="so-label">Piattaforma</label>
                <div className="so-platform-row">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      className={`so-platform-btn ${genForm.platform === p.value ? 'so-platform-btn--active' : ''}`}
                      style={{ '--p-color': p.color }}
                      onClick={() => setGenForm(f => ({ ...f, platform: p.value }))}
                    >
                      <PlatformIcon platform={p.value} size={18} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Topic */}
              <div className="so-field">
                <label className="so-label" htmlFor="so-topic">
                  Argomento del post <span className="so-optional">(facoltativo)</span>
                </label>
                <input
                  id="so-topic"
                  className="so-input"
                  type="text"
                  value={genForm.topic}
                  onChange={e => setGenForm(f => ({ ...f, topic: e.target.value }))}
                  placeholder="es. Promozione estiva, Nuovo servizio, Evento speciale…"
                />
              </div>

              {/* Tone */}
              <div className="so-field">
                <label className="so-label">Tono</label>
                <div className="so-tone-row">
                  {TONES.map(t => (
                    <button
                      key={t}
                      type="button"
                      className={`so-tone-btn ${genForm.tone === t ? 'so-tone-btn--active' : ''}`}
                      onClick={() => setGenForm(f => ({ ...f, tone: t }))}
                    >{t}</button>
                  ))}
                </div>
              </div>

              {/* Generate btn */}
              <button
                className="so-btn-generate"
                onClick={handleGenerate}
                disabled={genLoading}
              >
                {genLoading ? <><SoSpinner small /> Generazione in corso…</> : <><IconSparkle /> Genera post</>}
              </button>

              {/* Error */}
              {genError && (
                <div className="so-error" role="alert">
                  <IconAlert /> {genError}
                </div>
              )}

              {/* Preview */}
              {genPreview && (
                <div className="so-preview">
                  <div className="so-preview-header">
                    <span className="so-preview-label">Anteprima</span>
                    <button className="so-preview-regen" onClick={handleGenerate} disabled={genLoading}>
                      <IconRefresh /> Rigenera
                    </button>
                  </div>
                  <div className="so-preview-platform">
                    <PlatformIcon platform={genForm.platform} size={14} />
                    <span>{PLATFORMS.find(p => p.value === genForm.platform)?.label}</span>
                  </div>
                  <p className="so-preview-content">{genPreview.content}</p>
                  {genPreview.hashtags.length > 0 && (
                    <p className="so-preview-hashtags">{genPreview.hashtags.join(' ')}</p>
                  )}
                </div>
              )}
            </div>

            <div className="so-modal-footer">
              <button className="so-btn-cancel" onClick={closeGenModal}>Annulla</button>
              <button
                className="so-btn-save"
                onClick={handleSaveDraft}
                disabled={!genPreview || genSaving || genLoading}
              >
                {genSaving ? <><SoSpinner small /> Salvataggio…</> : 'Salva bozza'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editModal && (
        <div className="so-overlay" onClick={e => e.target === e.currentTarget && setEditModal(false)}>
          <div className="so-modal">
            <div className="so-modal-header">
              <h2 className="so-modal-title">Modifica bozza</h2>
              <button className="so-modal-close" onClick={() => setEditModal(false)}><IconX /></button>
            </div>

            <div className="so-modal-body">
              <div className="so-field">
                <label className="so-label">Piattaforma</label>
                <div className="so-platform-row">
                  {PLATFORMS.map(p => (
                    <button key={p.value} type="button"
                      className={`so-platform-btn ${editForm.platform === p.value ? 'so-platform-btn--active' : ''}`}
                      style={{ '--p-color': p.color }}
                      onClick={() => setEditForm(f => ({ ...f, platform: p.value }))}
                    >
                      <PlatformIcon platform={p.value} size={18} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="so-field">
                <label className="so-label" htmlFor="so-edit-content">
                  Testo <span className="so-required">*</span>
                </label>
                <textarea
                  id="so-edit-content"
                  className={`so-textarea ${editErrors.content ? 'so-input--error' : ''}`}
                  value={editForm.content}
                  onChange={e => { setEditForm(f => ({ ...f, content: e.target.value })); setEditErrors({}) }}
                  rows={6}
                  placeholder="Scrivi il testo del post…"
                />
                {editErrors.content && <p className="so-field-error">{editErrors.content}</p>}
              </div>

              <div className="so-field">
                <label className="so-label" htmlFor="so-edit-hashtags">
                  Hashtag <span className="so-optional">(separati da spazio)</span>
                </label>
                <input
                  id="so-edit-hashtags"
                  className="so-input"
                  type="text"
                  value={editForm.hashtags}
                  onChange={e => setEditForm(f => ({ ...f, hashtags: e.target.value }))}
                  placeholder="#tag1 #tag2 #tag3"
                />
              </div>

              <div className="so-field so-field--half">
                <label className="so-label" htmlFor="so-edit-status">Stato</label>
                <select
                  id="so-edit-status"
                  className="so-input so-select"
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="draft">Bozza</option>
                  <option value="approved">Approvato</option>
                  <option value="archived">Archiviato</option>
                </select>
              </div>
            </div>

            <div className="so-modal-footer">
              <button className="so-btn-cancel" onClick={() => setEditModal(false)}>Annulla</button>
              <button className="so-btn-save" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? <><SoSpinner small /> Salvataggio…</> : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Draft card ── */
function DraftCard({ draft: d, confirmId, deletingId, onEdit, onApprove, onConfirmDelete, onCancelDelete, onDelete }) {
  const meta = STATUS_META[d.status] ?? STATUS_META.draft
  const platform = PLATFORMS.find(p => p.value === d.platform)

  return (
    <div className="so-card">
      <div className="so-card-top">
        <div className="so-card-meta">
          {platform && (
            <span className="so-card-platform" style={{ color: platform.color }}>
              <PlatformIcon platform={d.platform} size={14} />
              {platform.label}
            </span>
          )}
          <span className={`so-badge ${meta.cls}`}>{meta.label}</span>
          {d.ai_generated && <span className="so-badge so-badge--ai"><IconSparkle size={11} /> AI</span>}
        </div>
        <div className="so-card-actions">
          <button
            className={`so-action-btn ${d.status === 'approved' ? 'so-action-btn--active' : ''}`}
            title={d.status === 'approved' ? 'Riporta in bozza' : 'Approva'}
            onClick={onApprove}
          >
            <IconCheck />
          </button>
          <button className="so-action-btn" title="Modifica" onClick={onEdit}>
            <IconEdit />
          </button>
          {confirmId === d.id ? (
            <div className="so-confirm-row">
              <span className="so-confirm-label">Eliminare?</span>
              <button className="so-action-btn so-action-btn--danger" disabled={deletingId === d.id} onClick={onDelete}>
                {deletingId === d.id ? <SoSpinner small /> : <IconCheck />}
              </button>
              <button className="so-action-btn" onClick={onCancelDelete}><IconX /></button>
            </div>
          ) : (
            <button className="so-action-btn so-action-btn--danger" title="Elimina" onClick={onConfirmDelete}>
              <IconTrash />
            </button>
          )}
        </div>
      </div>

      <p className="so-card-content">{d.content}</p>

      {d.hashtags?.length > 0 && (
        <p className="so-card-hashtags">{d.hashtags.join(' ')}</p>
      )}
    </div>
  )
}

/* ── Platform icon ── */
function PlatformIcon({ platform, size = 16 }) {
  if (platform === 'instagram') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  )
  if (platform === 'facebook') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  )
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
}

/* ── Icons ── */
function IconSparkle({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.88 5.76a1 1 0 0 0 .95.69h6.05l-4.9 3.56a1 1 0 0 0-.36 1.12L17.4 20l-4.9-3.56a1 1 0 0 0-1.18 0L6.42 20l1.88-5.87a1 1 0 0 0-.36-1.12L3.04 9.45H9.1a1 1 0 0 0 .95-.69L12 3z"/></svg>
}
function IconEdit()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function IconTrash()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> }
function IconCheck()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconX()       { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconRefresh() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> }
function IconAlert()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
function SoSpinner({ small }) {
  const s = small ? 14 : 20
  return <svg style={{ width: s, height: s, animation: 'so-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
