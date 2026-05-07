import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'

const BLOCKS = [
  { id: 'hero',    label: 'Intestazione principale' },
  { id: 'about',   label: 'Chi siamo' },
  { id: 'cover',   label: 'Immagine di copertina' },
  { id: 'gallery', label: 'Galleria fotografica' },
]

const ABOUT_MAX      = 500
const COVER_MAX_MB   = 5
const COVER_ACCEPT   = ['image/jpeg', 'image/png', 'image/webp']
const GALLERY_MAX    = 5
const GALLERY_MAX_MB = 5

export default function EditorSito({ business }) {
  const [active,  setActive]  = useState('hero')
  const [content, setContent] = useState(null) // { hero: row|null, about: row|null, cover: row|null }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return
    async function load() {
      setLoading(true)
      const { data: rows } = await supabase
        .from('site_content')
        .select('*')
        .eq('business_id', business.id)
      // Indicizza per block_key
      const byBlock = {}
      for (const row of rows ?? []) byBlock[row.block_key] = row
      setContent(byBlock)
      setLoading(false)
    }
    load()
  }, [business])

  if (!business) {
    return (
      <div className="db-section">
        <div className="db-empty-banner">Configura prima la tua attività.</div>
      </div>
    )
  }

  const mergeBlock = (blockKey, row) => {
    setContent(prev => ({ ...prev, [blockKey]: row }))
    const label = BLOCKS.find(b => b.id === blockKey)?.label ?? blockKey
    logActivity(business.id, business.user_id, 'site_updated', `Sito aggiornato: ${label}`)
  }

  return (
    <div className="db-section">
      <div className="db-section-toolbar">
        <p className="db-section-desc">Personalizza i contenuti del tuo sito pubblico.</p>
        {business.slug && (
          <a
            href={`/site/${business.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ed-view-btn"
          >
            <IconExternalLink /> Vedi sito pubblico
          </a>
        )}
      </div>

      <div className="db-editor-layout">
        <div className="db-editor-sidebar">
          {BLOCKS.map(b => (
            <button
              key={b.id}
              className={`db-editor-block-btn ${active === b.id ? 'db-editor-block-btn--active' : ''}`}
              onClick={() => setActive(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="db-editor-main">
          {loading ? (
            <div className="db-card"><p className="db-card-empty">Caricamento…</p></div>
          ) : active === 'hero' ? (
            <HeroBlock  business={business} row={content?.hero  ?? null} onSaved={row => mergeBlock('hero',  row)} />
          ) : active === 'about' ? (
            <AboutBlock   business={business} row={content?.about   ?? null} onSaved={row => mergeBlock('about',   row)} />
          ) : active === 'cover' ? (
            <CoverBlock   business={business} row={content?.cover   ?? null} onSaved={row => mergeBlock('cover',   row)} />
          ) : (
            <GalleryBlock business={business} row={content?.gallery ?? null} onSaved={row => mergeBlock('gallery', row)} />
          )}
        </div>
      </div>

      <OpeningHoursBlock business={business} />
    </div>
  )
}

/* ── Save helper: INSERT se non esiste, UPDATE se esiste ── */
async function saveBlock(business, row, blockKey, fields) {
  if (row?.id) {
    return supabase.from('site_content').update(fields).eq('id', row.id).select().single()
  }
  return supabase.from('site_content')
    .insert({ business_id: business.id, block_key: blockKey, ...fields })
    .select()
    .single()
}

/* ── useSaveStatus hook ── */
function useSaveStatus() {
  const [status, setStatus] = useState('idle')
  const timer = useRef(null)
  const trigger = async (fn) => {
    setStatus('saving')
    try {
      await fn()
      setStatus('saved')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('error')
    }
  }
  return [status, trigger]
}

/* ── Intestazione principale ── */
function HeroBlock({ business, row, onSaved }) {
  const [title,    setTitle]    = useState(row?.hero_title    ?? '')
  const [subtitle, setSubtitle] = useState(row?.hero_subtitle ?? '')
  const [ctaText,  setCtaText]  = useState(row?.hero_cta_text ?? '')
  const [status, triggerSave]   = useSaveStatus()

  const save = () => triggerSave(async () => {
    const { data, error } = await saveBlock(business, row, 'hero', {
      hero_title:    title.trim()    || null,
      hero_subtitle: subtitle.trim() || null,
      hero_cta_text: ctaText.trim()  || null,
    })
    if (error) throw error
    onSaved(data)
  })

  return (
    <div className="db-card">
      <div className="ed-block-header">
        <h3 className="db-card-title">Intestazione principale</h3>
        <p className="ed-block-desc">Il titolo e il sottotitolo che appaiono in cima al sito.</p>
      </div>

      <div className="ed-fields">
        <div className="ed-field">
          <label className="ed-label">Titolo principale</label>
          <input
            className="ed-input"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={business.name}
            maxLength={80}
          />
          <p className="ed-hint">Lascia vuoto per usare il nome dell'attività.</p>
        </div>

        <div className="ed-field">
          <label className="ed-label">
            Sottotitolo <span className="ed-optional">(facoltativo)</span>
          </label>
          <input
            className="ed-input"
            type="text"
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
            placeholder="es. Il barbiere di fiducia del quartiere"
            maxLength={120}
          />
        </div>

        <div className="ed-field">
          <label className="ed-label">
            Testo pulsante contatto <span className="ed-optional">(facoltativo)</span>
          </label>
          <input
            className="ed-input"
            type="text"
            value={ctaText}
            onChange={e => setCtaText(e.target.value)}
            placeholder="es. Contattaci, Prenota ora, Chiamaci"
            maxLength={40}
          />
        </div>
      </div>

      <div className="ed-footer">
        <SaveButton status={status} onClick={save} />
      </div>
    </div>
  )
}

/* ── Chi siamo ── */
function AboutBlock({ business, row, onSaved }) {
  const [text,   setText]     = useState(row?.about_text ?? '')
  const [status, triggerSave] = useSaveStatus()

  const save = () => triggerSave(async () => {
    const { data, error } = await saveBlock(business, row, 'about', {
      about_text: text.trim() || null,
    })
    if (error) throw error
    onSaved(data)
  })

  return (
    <div className="db-card">
      <div className="ed-block-header">
        <h3 className="db-card-title">Chi siamo</h3>
        <p className="ed-block-desc">Racconta la tua attività ai visitatori del sito.</p>
      </div>

      <div className="ed-fields">
        <div className="ed-field">
          <label className="ed-label">Descrizione</label>
          <textarea
            className="ed-textarea"
            value={text}
            onChange={e => setText(e.target.value.slice(0, ABOUT_MAX))}
            placeholder="Descrivi la tua attività, la tua storia, i tuoi valori…"
            rows={7}
          />
          <p className={`ed-counter ${text.length >= ABOUT_MAX ? 'ed-counter--limit' : ''}`}>
            {text.length}/{ABOUT_MAX}
          </p>
        </div>
      </div>

      <div className="ed-footer">
        <SaveButton status={status} onClick={save} />
      </div>
    </div>
  )
}

/* ── Immagine di copertina ── */
function CoverBlock({ business, row, onSaved }) {
  const [preview,   setPreview]   = useState(row?.cover_image_url ?? null)
  const [uploading, setUploading] = useState(false)
  const [fileError, setFileError] = useState(null)
  const inputRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)

    if (!COVER_ACCEPT.includes(file.type)) {
      setFileError('Formato non supportato. Usa JPG, PNG o WebP.')
      return
    }
    if (file.size > COVER_MAX_MB * 1024 * 1024) {
      setFileError(`Il file supera i ${COVER_MAX_MB} MB.`)
      return
    }

    setUploading(true)
    const ext  = file.name.split('.').pop().toLowerCase()
    const path = `${business.id}/cover.${ext}`

    const { error: upErr } = await supabase.storage
      .from('site-images')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) {
      setFileError('Errore durante il caricamento. Riprova.')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('site-images')
      .getPublicUrl(path)

    const { data, error: dbErr } = await saveBlock(business, row, 'cover', {
      cover_image_url: publicUrl,
    })

    setUploading(false)
    if (dbErr) {
      setFileError('Immagine caricata, ma errore nel salvataggio. Riprova.')
      return
    }
    setPreview(`${publicUrl}?t=${Date.now()}`)
    onSaved(data)
  }

  const handleRemove = async () => {
    const { data, error } = await saveBlock(business, row, 'cover', { cover_image_url: null })
    if (!error) {
      setPreview(null)
      onSaved(data)
    }
  }

  return (
    <div className="db-card">
      <div className="ed-block-header">
        <h3 className="db-card-title">Immagine di copertina</h3>
        <p className="ed-block-desc">
          Appare in cima al sito pubblico. Formati accettati: JPG, PNG, WebP. Dimensione massima: 5 MB.
        </p>
      </div>

      <div className="ed-fields">
        {preview ? (
          <div className="ed-cover-preview">
            <img src={preview} alt="Anteprima copertina" className="ed-cover-img" />
            <div className="ed-cover-actions">
              <button
                className="ed-cover-change-btn"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <><EdSpinner /> Caricamento…</> : <><IconUpload /> Cambia immagine</>}
              </button>
              <button className="ed-cover-remove-btn" onClick={handleRemove} disabled={uploading}>
                <IconTrash /> Rimuovi
              </button>
            </div>
          </div>
        ) : (
          <button
            className="ed-cover-dropzone"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            type="button"
          >
            {uploading ? (
              <><EdSpinner /><span>Caricamento in corso…</span></>
            ) : (
              <>
                <div className="ed-cover-dropzone-icon"><IconUpload /></div>
                <span className="ed-cover-dropzone-text">Clicca per caricare un'immagine</span>
                <span className="ed-cover-dropzone-hint">JPG, PNG o WebP — max 5 MB</span>
              </>
            )}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          style={{ display: 'none' }}
        />

        {fileError && <p className="ed-file-error">{fileError}</p>}
      </div>
    </div>
  )
}

/* ── Galleria fotografica ── */
function GalleryBlock({ business, row, onSaved }) {
  const rowRef = useRef(row)
  const [images,   setImages]   = useState(() => {
    try { return JSON.parse(row?.body ?? '[]') } catch { return [] }
  })
  const [uploading, setUploading] = useState(false)
  const [fileError, setFileError] = useState(null)
  const inputRef = useRef(null)

  const persist = async (newImages) => {
    const { data, error } = await saveBlock(business, rowRef.current, 'gallery', {
      body: JSON.stringify(newImages),
    })
    if (!error) { rowRef.current = data; onSaved(data) }
    return error
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setFileError(null)

    if (!COVER_ACCEPT.includes(file.type)) { setFileError('Formato non supportato. Usa JPG, PNG o WebP.'); return }
    if (file.size > GALLERY_MAX_MB * 1024 * 1024) { setFileError(`Il file supera i ${GALLERY_MAX_MB} MB.`); return }
    if (images.length >= GALLERY_MAX) { setFileError(`Puoi caricare al massimo ${GALLERY_MAX} immagini.`); return }

    setUploading(true)
    const ext  = file.name.split('.').pop().toLowerCase()
    const path = `${business.id}/gallery_${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('site-images')
      .upload(path, file, { contentType: file.type })

    if (upErr) { setFileError('Errore durante il caricamento. Riprova.'); setUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('site-images').getPublicUrl(path)
    const newImages = [...images, publicUrl]
    setImages(newImages)
    await persist(newImages)
    setUploading(false)
  }

  const handleDelete = async (url) => {
    const newImages = images.filter(u => u !== url)
    setImages(newImages)
    await persist(newImages)
  }

  return (
    <div className="db-card">
      <div className="ed-block-header">
        <h3 className="db-card-title">Galleria fotografica</h3>
        <p className="ed-block-desc">
          Aggiungi fino a {GALLERY_MAX} foto. Appaiono come carosello nel sito pubblico.
          Formati: JPG, PNG, WebP — max {GALLERY_MAX_MB} MB ciascuna.
        </p>
      </div>

      <div className="ed-fields">
        {images.length > 0 && (
          <div className="ed-gallery-grid">
            {images.map((url, i) => (
              <div key={url} className="ed-gallery-thumb">
                <img src={url} alt={`Foto ${i + 1}`} className="ed-gallery-thumb-img" />
                <button
                  className="ed-gallery-thumb-del"
                  onClick={() => handleDelete(url)}
                  title="Elimina foto"
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        )}

        {images.length < GALLERY_MAX && (
          <button
            className="ed-cover-dropzone ed-gallery-add-zone"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            type="button"
          >
            {uploading ? (
              <><EdSpinner /><span>Caricamento in corso…</span></>
            ) : (
              <>
                <div className="ed-cover-dropzone-icon"><IconUpload /></div>
                <span className="ed-cover-dropzone-text">Aggiungi foto</span>
                <span className="ed-cover-dropzone-hint">{images.length}/{GALLERY_MAX} caricate</span>
              </>
            )}
          </button>
        )}

        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} style={{ display: 'none' }} />
        {fileError && <p className="ed-file-error">{fileError}</p>}
      </div>
    </div>
  )
}

/* ── Pulsante Salva ── */
function SaveButton({ status, onClick }) {
  return (
    <button
      className={`ed-save-btn ${status === 'saved' ? 'ed-save-btn--saved' : ''}`}
      onClick={onClick}
      disabled={status === 'saving'}
    >
      {status === 'saving' && <><EdSpinner /> Salvataggio…</>}
      {status === 'saved'  && <><IconCheck /> Salvato</>}
      {status === 'error'  && 'Errore — riprova'}
      {status === 'idle'   && 'Salva'}
    </button>
  )
}

/* ── Opening hours block ── */
const OH_DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const OH_DAY_LABELS = {
  monday:'Lunedì', tuesday:'Martedì', wednesday:'Mercoledì',
  thursday:'Giovedì', friday:'Venerdì', saturday:'Sabato', sunday:'Domenica',
}
const OH_DEFAULT = {
  monday:    { open:'09:00', close:'18:00', closed:false },
  tuesday:   { open:'09:00', close:'18:00', closed:false },
  wednesday: { open:'09:00', close:'18:00', closed:false },
  thursday:  { open:'09:00', close:'18:00', closed:false },
  friday:    { open:'09:00', close:'18:00', closed:false },
  saturday:  { open:'09:00', close:'13:00', closed:false },
  sunday:    { open:'09:00', close:'13:00', closed:true  },
}

function OpeningHoursBlock({ business }) {
  const [hours, setHours] = useState(() => {
    const saved = business?.opening_hours ?? {}
    return Object.fromEntries(
      OH_DAY_ORDER.map(day => [day, { ...OH_DEFAULT[day], ...(saved[day] ?? {}) }])
    )
  })
  const [saving, setSaving] = useState(null)

  const update = async (day, field, value) => {
    const next = { ...hours, [day]: { ...hours[day], [field]: value } }
    setHours(next)
    setSaving(day)
    const { error } = await supabase
      .from('businesses')
      .update({ opening_hours: next })
      .eq('id', business.id)
    if (error) console.error('Errore salvataggio orari:', error)
    setSaving(null)
  }

  return (
    <div className="db-card" style={{ marginTop: 20 }}>
      <div className="ed-block-header">
        <h3 className="db-card-title">Orari di apertura</h3>
        <p className="ed-block-desc">Mostrati nel sito pubblico. Attiva il toggle per segnare un giorno come chiuso.</p>
      </div>
      <div className="oh-list">
        {OH_DAY_ORDER.map(day => {
          const d = hours[day]
          return (
            <div key={day} className={`oh-row ${d.closed ? 'oh-row--closed' : ''}`}>
              <div className="oh-row-top">
                <span className="oh-day-label">{OH_DAY_LABELS[day]}</span>
              </div>
              <div className="oh-row-bottom">
                {d.closed ? (
                  <span className="oh-closed-text">Chiuso</span>
                ) : (
                  <>
                    <input
                      type="time"
                      className="oh-time-input"
                      value={d.open}
                      onChange={e => update(day, 'open', e.target.value)}
                    />
                    <span className="oh-sep">–</span>
                    <input
                      type="time"
                      className="oh-time-input"
                      value={d.close}
                      onChange={e => update(day, 'close', e.target.value)}
                    />
                  </>
                )}
                <label className="oh-toggle-label">
                  <span className="oh-toggle-text">Chiuso</span>
                  <button
                    className={`sett-toggle ${d.closed ? 'sett-toggle--on' : ''}`}
                    onClick={() => update(day, 'closed', !d.closed)}
                    aria-pressed={d.closed}
                    type="button"
                  >
                    <span className="sett-toggle-thumb" />
                  </button>
                </label>
                {saving === day && <EdSpinner />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Icons ── */
function IconExternalLink() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
}
function IconUpload() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
}
function IconTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
}
function IconCheck() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function EdSpinner() {
  return <svg style={{ width: 14, height: 14, animation: 'ed-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
