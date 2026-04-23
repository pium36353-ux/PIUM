import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateWithClaude } from '../lib/claude'

/* ── Categories ── */
const CATEGORIES = [
  { value: 'Ristorante',       emoji: '🍽️' },
  { value: 'Bar / Caffè',      emoji: '☕' },
  { value: 'Parrucchiere',     emoji: '✂️' },
  { value: 'Barbiere',         emoji: '💈' },
  { value: 'Estetista / Spa',  emoji: '💆' },
  { value: 'Palestra',         emoji: '🏋️' },
  { value: 'Negozio',          emoji: '🛍️' },
  { value: 'Artigiano',        emoji: '🔧' },
  { value: 'Professionista',   emoji: '💼' },
  { value: 'Medico / Dentista',emoji: '🏥' },
  { value: 'Albergo / B&B',    emoji: '🏨' },
  { value: 'Altro',            emoji: '📌' },
]

const STEPS = ['La tua attività', 'Contatti', 'Sede']

const EMPTY = {
  name:        '',
  category:    '',
  description: '',
  phone:       '',
  whatsapp:    '',
  email:       '',
  address:     '',
  city:        '',
}

function toSlug(name) {
  const rand = Math.random().toString(36).slice(2, 6)
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + rand
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep]     = useState(0)
  const [form, setForm]     = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [loading, setLoading]       = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [serverError, setServerError] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate('/auth')
    })
  }, [navigate])

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((er) => ({ ...er, [field]: null }))
  }

  const setCategory = (val) => {
    setForm((f) => ({ ...f, category: val }))
    setErrors((er) => ({ ...er, category: null }))
  }

  /* ── Validation ── */
  const validate = () => {
    const e = {}
    if (step === 0) {
      if (!form.name.trim())     e.name     = 'Il nome è obbligatorio.'
      if (!form.category)        e.category = 'Seleziona una categoria.'
    }
    if (step === 1) {
      if (!form.phone.trim() && !form.email.trim())
        e.phone = 'Inserisci almeno un contatto (telefono o email).'
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
        e.email = 'Indirizzo email non valido.'
    }
    if (step === 2) {
      if (!form.city.trim()) e.city = 'La città è obbligatoria.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => { if (validate()) setStep((s) => s + 1) }
  const back = () => { setStep((s) => s - 1); setErrors({}) }

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    setLoadingMsg('Salvataggio in corso…')
    setServerError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/auth'); return }

    // 1. Insert business
    const { data: biz, error } = await supabase
      .from('businesses')
      .insert({
        user_id:  user.id,
        name:     form.name.trim(),
        slug:     toSlug(form.name.trim()),
        category: form.category,
        phone:    form.phone.trim()    || null,
        whatsapp: form.whatsapp.trim() || null,
        email:    form.email.trim()    || null,
        address:  form.address.trim()  || null,
        city:     form.city.trim(),
      })
      .select('id')
      .single()

    if (error) {
      setServerError('Errore nel salvataggio. Riprova tra qualche istante.')
      setLoading(false)
      return
    }

    // 2. Generate AI description
    setLoadingMsg('Generazione descrizione AI…')
    try {
      const prompt = buildDescriptionPrompt(form)
      console.log('[Claude] prompt inviato:', prompt)

      const aiDescription = await generateWithClaude(prompt)
      console.log('[Claude] risposta ricevuta:', aiDescription)

      const { error: updateError } = await supabase
        .from('businesses')
        .update({ description: aiDescription.trim() })
        .eq('id', biz.id)

      if (updateError) {
        console.error('[Supabase] errore aggiornamento description:', updateError)
      } else {
        console.log('[Supabase] description salvata correttamente')
      }
    } catch (err) {
      console.error('[Claude] errore durante la generazione:', err)
    }

    navigate('/dashboard')
  }

  return (
    <div className="ob-shell">
      <div className="ob-card">

        {/* Brand */}
        <div className="ob-brand">
          <div className="ob-brand-icon">
            <IconHome />
          </div>
          <span className="ob-brand-name">LocalHub</span>
        </div>

        {/* Step indicator */}
        <div className="ob-steps">
          {STEPS.map((label, i) => (
            <div key={i} className={`ob-step ${i === step ? 'ob-step--active' : i < step ? 'ob-step--done' : ''}`}>
              <div className="ob-step-dot">
                {i < step ? <IconCheck /> : <span>{i + 1}</span>}
              </div>
              <span className="ob-step-label">{label}</span>
              {i < STEPS.length - 1 && <div className="ob-step-line" />}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="ob-progress-track">
          <div className="ob-progress-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        {/* ── Step 0: La tua attività ── */}
        {step === 0 && (
          <div className="ob-body">
            <h2 className="ob-title">Come si chiama la tua attività?</h2>
            <p className="ob-subtitle">Questi dati appariranno sulla tua pagina pubblica.</p>

            <div className="ob-field">
              <label className="ob-label" htmlFor="name">Nome attività <span className="ob-required">*</span></label>
              <input
                id="name"
                className={`ob-input ${errors.name ? 'ob-input--error' : ''}`}
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="es. Pizzeria da Mario"
                autoComplete="organization"
                autoFocus
              />
              {errors.name && <p className="ob-field-error">{errors.name}</p>}
            </div>

            <div className="ob-field">
              <label className="ob-label">Categoria <span className="ob-required">*</span></label>
              {errors.category && <p className="ob-field-error">{errors.category}</p>}
              <div className="ob-categories">
                {CATEGORIES.map(({ value, emoji }) => (
                  <button
                    key={value}
                    type="button"
                    className={`ob-cat-btn ${form.category === value ? 'ob-cat-btn--active' : ''}`}
                    onClick={() => setCategory(value)}
                  >
                    <span className="ob-cat-emoji">{emoji}</span>
                    <span className="ob-cat-label">{value}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Contatti ── */}
        {step === 1 && (
          <div className="ob-body">
            <h2 className="ob-title">Come possono contattarti?</h2>
            <p className="ob-subtitle">Inserisci almeno un contatto tra telefono ed email.</p>

            <div className="ob-fields-grid">
              <div className="ob-field">
                <label className="ob-label" htmlFor="phone">Telefono</label>
                <div className="ob-input-icon-wrap">
                  <span className="ob-input-icon"><IconPhone /></span>
                  <input
                    id="phone"
                    className={`ob-input ob-input--icon ${errors.phone ? 'ob-input--error' : ''}`}
                    type="tel"
                    value={form.phone}
                    onChange={set('phone')}
                    placeholder="+39 333 123 4567"
                    autoComplete="tel"
                  />
                </div>
                {errors.phone && <p className="ob-field-error">{errors.phone}</p>}
              </div>

              <div className="ob-field">
                <label className="ob-label" htmlFor="whatsapp">WhatsApp</label>
                <div className="ob-input-icon-wrap">
                  <span className="ob-input-icon"><IconWhatsapp /></span>
                  <input
                    id="whatsapp"
                    className="ob-input ob-input--icon"
                    type="tel"
                    value={form.whatsapp}
                    onChange={set('whatsapp')}
                    placeholder="+39 333 123 4567"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="ob-field ob-field--full">
                <label className="ob-label" htmlFor="email">Email</label>
                <div className="ob-input-icon-wrap">
                  <span className="ob-input-icon"><IconMail /></span>
                  <input
                    id="email"
                    className={`ob-input ob-input--icon ${errors.email ? 'ob-input--error' : ''}`}
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="info@latuaattivita.it"
                    autoComplete="email"
                  />
                </div>
                {errors.email && <p className="ob-field-error">{errors.email}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Sede ── */}
        {step === 2 && (
          <div className="ob-body">
            <h2 className="ob-title">Dove si trova la tua attività?</h2>
            <p className="ob-subtitle">Aiuta i clienti a trovarti facilmente.</p>

            <div className="ob-fields-grid">
              <div className="ob-field ob-field--full">
                <label className="ob-label" htmlFor="address">Indirizzo</label>
                <div className="ob-input-icon-wrap">
                  <span className="ob-input-icon"><IconPin /></span>
                  <input
                    id="address"
                    className="ob-input ob-input--icon"
                    type="text"
                    value={form.address}
                    onChange={set('address')}
                    placeholder="Via Roma 1"
                    autoComplete="street-address"
                    autoFocus
                  />
                </div>
              </div>

              <div className="ob-field">
                <label className="ob-label" htmlFor="city">Città <span className="ob-required">*</span></label>
                <div className="ob-input-icon-wrap">
                  <span className="ob-input-icon"><IconCity /></span>
                  <input
                    id="city"
                    className={`ob-input ob-input--icon ${errors.city ? 'ob-input--error' : ''}`}
                    type="text"
                    value={form.city}
                    onChange={set('city')}
                    placeholder="Milano"
                    autoComplete="address-level2"
                  />
                </div>
                {errors.city && <p className="ob-field-error">{errors.city}</p>}
              </div>

              <div className="ob-field ob-field--full">
                <label className="ob-label" htmlFor="description">Descrizione <span className="ob-optional">(facoltativo)</span></label>
                <textarea
                  id="description"
                  className="ob-textarea"
                  value={form.description}
                  onChange={set('description')}
                  placeholder="Descrivi brevemente la tua attività, cosa offri e cosa ti rende unico…"
                  rows={4}
                />
                <p className="ob-field-hint">{form.description.length}/400 caratteri</p>
              </div>
            </div>

            {serverError && (
              <div className="ob-server-error" role="alert">
                <IconAlertCircle />
                {serverError}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="ob-footer">
          {step > 0
            ? <button type="button" className="ob-btn-back" onClick={back}>← Indietro</button>
            : <div />
          }
          {step < STEPS.length - 1
            ? <button type="button" className="ob-btn-next" onClick={next}>Continua →</button>
            : (
              <button
                type="button"
                className="ob-btn-next"
                onClick={handleSubmit}
                disabled={loading}
              >
                <ObSpinner visible={loading} />
                {loading ? loadingMsg : 'Salva e inizia →'}
              </button>
            )
          }
        </div>

      </div>
    </div>
  )
}

/* ── AI prompt ── */
function buildDescriptionPrompt(form) {
  const lines = [
    'Scrivi una descrizione professionale e accattivante (massimo 3 frasi, tono caldo e diretto) per la seguente attività locale:',
    `- Nome: ${form.name}`,
    `- Categoria: ${form.category}`,
    `- Città: ${form.city}`,
    form.address.trim()     ? `- Indirizzo: ${form.address.trim()}`                                    : null,
    form.description.trim() ? `- Note del titolare: "${form.description.trim()}"`                      : null,
    form.phone.trim()       ? `- Telefono disponibile`                                                 : null,
    form.whatsapp.trim()    ? `- Contattabile su WhatsApp`                                             : null,
    '',
    'Rispondi solo con il testo della descrizione. Niente titoli, niente virgolette, niente commenti. Scrivi in italiano.',
  ]
  return lines.filter((l) => l !== null).join('\n')
}

/* ── Icons ── */
function IconHome() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IconCheck() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function IconPhone() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
}
function IconWhatsapp() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
}
function IconMail() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
}
function IconPin() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
}
function IconCity() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 2 7 22 7"/></svg>
}
function IconAlertCircle() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
}
function ObSpinner({ visible }) {
  if (!visible) return null
  return <svg className="ob-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
