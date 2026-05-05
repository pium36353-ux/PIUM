import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

export default function PublicSite() {
  const { slug } = useParams()
  const [business,    setBusiness]    = useState(null)
  const [siteContent, setSiteContent] = useState({})
  const [services,    setServices]    = useState([])
  const [reviews,     setReviews]     = useState([])
  const [status,      setStatus]      = useState('loading') // loading | found | notfound

  useEffect(() => {
    async function load() {
      const { data: biz, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle()

      if (error || !biz) { setStatus('notfound'); return }

      const [{ data: svcs }, { data: rvs }, { data: sc }] = await Promise.all([
        supabase.from('services').select('*').eq('business_id', biz.id).eq('is_available', true).order('sort_order'),
        supabase.from('reviews').select('id,author_name,rating,body,reply,reviewed_at').eq('business_id', biz.id).eq('published', true).order('reviewed_at', { ascending: false }),
        supabase.from('site_content').select('*').eq('business_id', biz.id),
      ])

      // Indicizza per block_key, poi estrae solo i campi rilevanti per blocco
      const byBlock = {}
      for (const row of sc ?? []) byBlock[row.block_key] = row
      let gallery_images = []
      try { if (byBlock.gallery?.body) gallery_images = JSON.parse(byBlock.gallery.body) } catch {}

      const scFlat = {
        hero_title:      byBlock.hero?.hero_title       ?? null,
        hero_subtitle:   byBlock.hero?.hero_subtitle    ?? null,
        hero_cta_text:   byBlock.hero?.hero_cta_text    ?? null,
        about_text:      byBlock.about?.about_text      ?? null,
        cover_image_url: byBlock.cover?.cover_image_url ?? null,
        gallery_images,
      }
      setBusiness(biz)
      setSiteContent(scFlat)
      setServices(svcs ?? [])
      setReviews(rvs ?? [])
      setStatus('found')
      document.title = `${biz.name} — PIUM`
    }
    load()
    return () => { document.title = 'PIUM' }
  }, [slug])

  useEffect(() => {
    if (status !== 'found' || !business) return
    const t = getTheme(business.category)
    document.body.style.backgroundImage = t.patternImage
    document.body.style.backgroundSize  = t.patternSize
    return () => {
      document.body.style.backgroundImage = ''
      document.body.style.backgroundSize  = ''
    }
  }, [status, business?.category])

  if (status === 'loading') return <LoadingScreen />
  if (status === 'notfound') return <NotFound />

  const { name, category, description, phone, whatsapp, email, address, city, logo_url } = business
  const { hero_title, hero_subtitle, hero_cta_text, about_text, cover_image_url, gallery_images } = siteContent

  const displayName    = hero_title || name
  const displayAbout   = about_text || description
  const hasContacts    = phone || whatsapp || email
  const hasLocation    = address || city

  // Link per il pulsante contatto: telefono > whatsapp > email
  const ctaHref = phone
    ? `tel:${phone}`
    : whatsapp
      ? `https://wa.me/${whatsapp.replace(/\D/g, '')}`
      : email
        ? `mailto:${email}`
        : '#ps-contacts'

  const theme = getTheme(category)
  const hasImgBg = !!cover_image_url

  const heroStyle = hasImgBg
    ? { backgroundImage: `url(${cover_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat', position: 'relative' }
    : { background: theme.heroBg }

  const txtColor  = hasImgBg ? '#ffffff' : theme.textColor
  const subColor  = hasImgBg ? 'rgba(255,255,255,0.82)' : theme.subtitleColor
  const badgeBg   = hasImgBg ? 'rgba(255,255,255,0.15)' : theme.accentLight
  const badgeFg   = hasImgBg ? '#ffffff' : theme.accent
  const badgeBdr  = hasImgBg ? 'rgba(255,255,255,0.35)' : theme.accentBorder
  const avatarBg  = hasImgBg ? 'rgba(255,255,255,0.18)' : theme.accentLight
  const avatarBdr = hasImgBg ? 'rgba(255,255,255,0.4)'  : theme.accentBorder
  const avatarFg  = hasImgBg ? '#ffffff' : theme.accent
  const ctaBg     = hasImgBg ? 'rgba(255,255,255,0.22)' : theme.accent

  return (
    <div className="ps-shell">

      {/* ── Hero ── */}
      <header className="ps-hero" style={heroStyle}>
        {hasImgBg && <div className="ps-hero-overlay" />}
        <div className="ps-hero-inner" style={{ position: 'relative', zIndex: 1 }}>
          <div className="ps-avatar" style={{ background: avatarBg, borderColor: avatarBdr }}>
            {logo_url
              ? <img src={logo_url} alt={name} className="ps-avatar-img" />
              : <span className="ps-avatar-letter" style={{ color: avatarFg }}>{name[0].toUpperCase()}</span>
            }
          </div>
          <div className="ps-hero-text">
            {category && (
              <span className="ps-category-badge" style={{ background: badgeBg, color: badgeFg, borderColor: badgeBdr }}>
                {theme.emoji && <span style={{ marginRight: 4 }}>{theme.emoji}</span>}{category}
              </span>
            )}
            <h1 className="ps-name" style={{ fontWeight: theme.titleWeight, color: txtColor }}>
              {displayName}
            </h1>
            {hero_subtitle && <p className="ps-hero-subtitle" style={{ color: subColor }}>{hero_subtitle}</p>}
            {(address || city) && (
              <p className="ps-location" style={{ color: subColor }}>
                <IconPin size={14} />
                {[address, city].filter(Boolean).join(', ')}
              </p>
            )}
            {hero_cta_text && hasContacts && (
              <a href={ctaHref} className="ps-hero-cta" style={{ background: ctaBg }}>
                {hero_cta_text}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="ps-body">
        <main className="ps-main">

          {/* Chi siamo */}
          {displayAbout && (
            <section className="ps-section">
              <h2 className="ps-section-title">Chi siamo</h2>
              <p className="ps-description">{displayAbout}</p>
            </section>
          )}

          {/* Galleria */}
          {gallery_images?.length > 0 && <Carousel images={gallery_images} />}

          {/* Services */}
          {services.length > 0 && (
            <section className="ps-section">
              <h2 className="ps-section-title">Servizi</h2>
              <div className="ps-services-grid">
                {services.map(s => (
                  <div key={s.id} className="ps-service-card">
                    <div className="ps-service-top">
                      <h3 className="ps-service-name">{s.name}</h3>
                      {s.price != null && (
                        <span className="ps-service-price">
                          {s.price_label && <span className="ps-price-label">{s.price_label} </span>}
                          €{Number(s.price).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    {s.description && <p className="ps-service-desc">{s.description}</p>}
                    {s.duration_min && (
                      <p className="ps-service-duration">
                        <IconClock size={13} /> {formatDuration(s.duration_min)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <section className="ps-section">
              <h2 className="ps-section-title">Recensioni</h2>
              <div className="ps-reviews-list">
                {reviews.map(r => <PsReviewCard key={r.id} review={r} />)}
              </div>
            </section>
          )}
        </main>

        {/* ── Sidebar ── */}
        <aside className="ps-sidebar">

          {/* Contacts */}
          {hasContacts && (
            <div id="ps-contacts" className="ps-card">
              <h2 className="ps-card-title">Contatti</h2>
              <div className="ps-contacts">
                {phone && (
                  <a href={`tel:${phone}`} className="ps-contact-btn ps-contact-btn--phone">
                    <IconPhone /> <span>{phone}</span>
                  </a>
                )}
                {whatsapp && (
                  <a
                    href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ps-contact-btn ps-contact-btn--whatsapp"
                  >
                    <IconWhatsapp /> <span>Scrivici su WhatsApp</span>
                  </a>
                )}
                {email && (
                  <a href={`mailto:${email}`} className="ps-contact-btn ps-contact-btn--email">
                    <IconMail /> <span>{email}</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Location */}
          {hasLocation && (
            <div className="ps-card">
              <h2 className="ps-card-title">Dove siamo</h2>
              <p className="ps-address-text">
                {address && <span>{address}<br /></span>}
                {city && <span>{city}</span>}
              </p>
              {(address || city) && (
                <a
                  href={`https://www.google.com/maps/search/${encodeURIComponent([address, city].filter(Boolean).join(', '))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ps-maps-link"
                >
                  <IconMap /> Apri in Google Maps
                </a>
              )}
            </div>
          )}

        </aside>
      </div>

      {/* ── Footer ── */}
      <footer className="ps-footer">
        <span>Pagina realizzata con</span>
        <Link to="/" className="ps-footer-brand"><Logo /></Link>
      </footer>

    </div>
  )
}

/* ── Public review card ── */
function PsStars({ rating }) {
  return (
    <span className="ps-review-stars">
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ color: n <= rating ? '#f59e0b' : 'var(--border)' }}>★</span>
      ))}
    </span>
  )
}

function PsReviewCard({ review: r }) {
  const date = new Date(r.reviewed_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <div className="ps-review-card">
      <div className="ps-review-head">
        <div className="ps-review-avatar">{r.author_name[0].toUpperCase()}</div>
        <div className="ps-review-author-info">
          <span className="ps-review-author-name">{r.author_name}</span>
          <div className="ps-review-meta">
            {r.rating != null && <PsStars rating={r.rating} />}
            <span className="ps-review-date">{date}</span>
          </div>
        </div>
      </div>
      {r.body && <p className="ps-review-body">{r.body}</p>}
      {r.reply && (
        <div className="ps-review-reply">
          <span className="ps-review-reply-label">Risposta del titolare</span>
          <p className="ps-review-reply-text">{r.reply}</p>
        </div>
      )}
    </div>
  )
}

/* ── Loading ── */
function LoadingScreen() {
  return (
    <div className="ps-shell ps-shell--center">
      <div className="ps-spinner-wrap">
        <svg className="ps-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      </div>
    </div>
  )
}

/* ── Not found ── */
function NotFound() {
  return (
    <div className="ps-shell ps-shell--center">
      <div className="ps-notfound">
        <div className="ps-notfound-icon">🏚️</div>
        <h1 className="ps-notfound-title">Pagina non trovata</h1>
        <p className="ps-notfound-text">Questa attività non esiste o non è più attiva.</p>
        <Link to="/" className="ps-notfound-link">Torna alla home</Link>
      </div>
    </div>
  )
}

/* ── Carosello galleria ── */
function Carousel({ images }) {
  const [current, setCurrent] = useState(0)
  const n = images.length
  const prev = useCallback(() => setCurrent(i => (i - 1 + n) % n), [n])
  const next = useCallback(() => setCurrent(i => (i + 1) % n), [n])

  return (
    <section className="ps-section">
      <h2 className="ps-section-title">Galleria</h2>
      <div className="ps-carousel">
        <div className="ps-carousel-track-wrap">
          <div className="ps-carousel-track" style={{ transform: `translateX(-${current * 100}%)` }}>
            {images.map((url, i) => (
              <div key={i} className="ps-carousel-slide">
                <img src={url} alt={`Foto ${i + 1}`} className="ps-carousel-img" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
        {n > 1 && (
          <>
            <button className="ps-carousel-btn ps-carousel-btn--prev" onClick={prev} aria-label="Precedente"><IconChevLeft /></button>
            <button className="ps-carousel-btn ps-carousel-btn--next" onClick={next} aria-label="Successivo"><IconChevRight /></button>
            <div className="ps-carousel-dots">
              {images.map((_, i) => (
                <button key={i} className={`ps-carousel-dot ${i === current ? 'ps-carousel-dot--active' : ''}`} onClick={() => setCurrent(i)} aria-label={`Foto ${i + 1}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/* ── Temi visivi per categoria ── */
const THEMES = {
  default: {
    heroBg:        'linear-gradient(135deg, var(--accent-bg) 0%, var(--bg) 60%)',
    accent:        'var(--accent)',
    accentLight:   'var(--accent-bg)',
    accentBorder:  'var(--accent-border)',
    titleWeight:   '800',
    textColor:     undefined,
    subtitleColor: undefined,
    emoji:         null,
    patternImage:  'radial-gradient(rgba(168,85,247,0.12) 1px, transparent 1px)',
    patternSize:   '18px 18px',
  },
  bar: {
    heroBg:        'linear-gradient(135deg, #FFF0DC 0%, #FFFAF4 70%)',
    accent:        '#6F4E37',
    accentLight:   'rgba(111,78,55,0.1)',
    accentBorder:  'rgba(111,78,55,0.28)',
    titleWeight:   '800',
    textColor:     '#3B2314',
    subtitleColor: '#7A5C47',
    emoji:         '☕',
    patternImage:  'radial-gradient(circle, rgba(111,78,55,0.13) 2px, transparent 2px)',
    patternSize:   '22px 22px',
  },
  fitness: {
    heroBg:        'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
    accent:        '#FFD700',
    accentLight:   'rgba(255,215,0,0.15)',
    accentBorder:  'rgba(255,215,0,0.4)',
    titleWeight:   '900',
    textColor:     '#FFD700',
    subtitleColor: 'rgba(255,255,255,0.65)',
    emoji:         '💪',
    patternImage:  'repeating-linear-gradient(45deg, rgba(255,215,0,0.13) 0, rgba(255,215,0,0.13) 1px, transparent 0, transparent 50%)',
    patternSize:   '10px 10px',
  },
  ristorante: {
    heroBg:        'linear-gradient(135deg, #F2E0CC 0%, #FAF0E6 70%)',
    accent:        '#8B0000',
    accentLight:   'rgba(139,0,0,0.08)',
    accentBorder:  'rgba(139,0,0,0.22)',
    titleWeight:   '800',
    textColor:     '#4A0000',
    subtitleColor: '#7A3030',
    emoji:         '🍽️',
    patternImage:  'repeating-linear-gradient(45deg, rgba(139,0,0,0.11) 0, rgba(139,0,0,0.11) 1px, transparent 0, transparent 50%), repeating-linear-gradient(-45deg, rgba(139,0,0,0.11) 0, rgba(139,0,0,0.11) 1px, transparent 0, transparent 50%)',
    patternSize:   '16px 16px',
  },
  parrucchiere: {
    heroBg:        'linear-gradient(135deg, #FAF0F0 0%, #FFFFFF 70%)',
    accent:        '#A87070',
    accentLight:   'rgba(201,160,160,0.14)',
    accentBorder:  'rgba(201,160,160,0.38)',
    titleWeight:   '800',
    textColor:     '#4A2C2C',
    subtitleColor: '#9A7070',
    emoji:         '✂️',
    patternImage:  'radial-gradient(circle, rgba(201,160,160,0.15) 1.5px, transparent 1.5px)',
    patternSize:   '14px 14px',
  },
  spa: {
    heroBg:        'linear-gradient(135deg, #E4F0E4 0%, #F8FFF8 70%)',
    accent:        '#5A8A5A',
    accentLight:   'rgba(143,175,143,0.14)',
    accentBorder:  'rgba(143,175,143,0.35)',
    titleWeight:   '700',
    textColor:     '#2A4A2A',
    subtitleColor: '#5A7A5A',
    emoji:         '🌿',
    patternImage:  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='20'%3E%3Cpath d='M0 15 Q10 5 20 15 Q30 25 40 15' fill='none' stroke='%238FAF8F' stroke-opacity='0.15' stroke-width='1.5'/%3E%3C/svg%3E")`,
    patternSize:   '40px 20px',
  },
  professionista: {
    heroBg:        'linear-gradient(135deg, #DDE4F0 0%, #F5F5F5 70%)',
    accent:        '#1B2A4A',
    accentLight:   'rgba(27,42,74,0.08)',
    accentBorder:  'rgba(27,42,74,0.2)',
    titleWeight:   '700',
    textColor:     '#0D1A30',
    subtitleColor: '#4A5A70',
    emoji:         '💼',
    patternImage:  'linear-gradient(rgba(27,42,74,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(27,42,74,0.12) 1px, transparent 1px)',
    patternSize:   '24px 24px',
  },
}

function getTheme(category) {
  if (!category) return THEMES.default
  const c = category.toLowerCase()
  if (c.includes('bar') || c.includes('caffè') || c.includes('caffe') || c.includes('café')) return THEMES.bar
  if (c.includes('palestra') || c.includes('fitness') || c.includes('gym') || c.includes('crossfit')) return THEMES.fitness
  if (c.includes('ristorante') || c.includes('trattoria') || c.includes('pizzeria') || c.includes('osteria')) return THEMES.ristorante
  if (c.includes('parrucchiere') || c.includes('barbiere') || c.includes('hair') || c.includes('coiffeur')) return THEMES.parrucchiere
  if (c.includes('estetista') || c.includes('estetica') || c.includes('spa') || c.includes('benessere') || c.includes('centro estetico')) return THEMES.spa
  if (c.includes('professionista') || c.includes('studio') || c.includes('consulenza') || c.includes('avvocato') || c.includes('commercialista') || c.includes('notaio')) return THEMES.professionista
  return THEMES.default
}

/* ── Helpers ── */
function formatDuration(min) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

/* ── Icons ── */
function IconPin({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
}
function IconPhone() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
}
function IconWhatsapp() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
}
function IconMail() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
}
function IconMap() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
}
function IconClock({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}
function IconChevLeft() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
}
function IconChevRight() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
}
