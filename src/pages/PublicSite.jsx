import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PublicSite() {
  const { slug } = useParams()
  const [business, setBusiness] = useState(null)
  const [services, setServices] = useState([])
  const [status, setStatus]     = useState('loading') // loading | found | notfound

  useEffect(() => {
    async function load() {
      const { data: biz, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle()

      if (error || !biz) { setStatus('notfound'); return }

      const { data: svcs } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', biz.id)
        .eq('is_available', true)
        .order('sort_order')

      console.log('[PublicSite] dati attività:', biz)
      console.log('[PublicSite] servizi:', svcs)
      setBusiness(biz)
      setServices(svcs ?? [])
      setStatus('found')
      document.title = `${biz.name} — PIUM`
    }
    load()
    return () => { document.title = 'PIUM' }
  }, [slug])

  if (status === 'loading') return <LoadingScreen />
  if (status === 'notfound') return <NotFound />

  const { name, category, description, phone, whatsapp, email, address, city, logo_url } = business
  const hasContacts = phone || whatsapp || email
  const hasLocation = address || city

  return (
    <div className="ps-shell">

      {/* ── Hero ── */}
      <header className="ps-hero">
        <div className="ps-hero-inner">
          <div className="ps-avatar">
            {logo_url
              ? <img src={logo_url} alt={name} className="ps-avatar-img" />
              : <span className="ps-avatar-letter">{name[0].toUpperCase()}</span>
            }
          </div>
          <div className="ps-hero-text">
            {category && <span className="ps-category-badge">{category}</span>}
            <h1 className="ps-name">{name}</h1>
            {(address || city) && (
              <p className="ps-location">
                <IconPin size={14} />
                {[address, city].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="ps-body">
        <main className="ps-main">

          {/* Description */}
          {description && (
            <section className="ps-section">
              <h2 className="ps-section-title">Chi siamo</h2>
              <p className="ps-description">{description}</p>
            </section>
          )}

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
        </main>

        {/* ── Sidebar ── */}
        <aside className="ps-sidebar">

          {/* Contacts */}
          {hasContacts && (
            <div className="ps-card">
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
        <Link to="/" className="ps-footer-brand">PIUM</Link>
      </footer>

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
