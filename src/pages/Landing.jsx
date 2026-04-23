import { useNavigate } from 'react-router-dom'

/* ── Feature data ── */
const FEATURES = [
  {
    icon: <IconGlobe />,
    color: 'blue',
    title: 'Sito pubblico automatico',
    desc:  'Il tuo sito professionale è pronto in 5 minuti. Servizi, contatti, orari e descrizione AI: tutto generato e aggiornabile dalla dashboard.',
  },
  {
    icon: <IconGrid />,
    color: 'green',
    title: 'Dashboard tutto-in-uno',
    desc:  'Gestisci servizi, recensioni, promemoria e bozze social da un unico pannello semplice. Nessuna competenza tecnica richiesta.',
  },
  {
    icon: <IconSparkle />,
    color: 'accent',
    title: 'AI per i tuoi contenuti',
    desc:  "Genera risposte alle recensioni, post per Instagram e Facebook e descrizioni professionali con un click. Tu approvi, ci pensa l'AI.",
  },
]

const PRICE_FEATURES = [
  'Sito pubblico personalizzato con URL dedicato',
  'Dashboard completa con tutte le sezioni',
  'Generazione AI illimitata (contenuti, risposte, social)',
  'Gestione servizi, prezzi e disponibilità',
  'Raccolta e risposta alle recensioni',
  'Promemoria e gestione attività',
  'Supporto via email prioritario',
  'Aggiornamenti inclusi per sempre',
]

const EXTRA_FEATURES = [
  'Sito mobile-first',
  'Dark mode inclusa',
  'Link WhatsApp diretto',
  'URL personalizzato',
  'Google Maps integrato',
  'Sempre aggiornato',
]

/* ── Component ── */
export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="ln-page">

      {/* ── Nav ── */}
      <nav className="ln-nav">
        <div className="ln-brand">
          <div className="ln-brand-icon"><IconHome /></div>
          <span className="ln-brand-name">PIUM</span>
        </div>
        <div className="ln-nav-links">
          <a href="#funzionalita" className="ln-nav-link">Funzionalità</a>
          <a href="#prezzi"       className="ln-nav-link">Prezzi</a>
        </div>
        <div className="ln-nav-actions">
          <button className="ln-btn-ghost" onClick={() => navigate('/auth')}>Accedi</button>
          <button className="ln-btn-primary" onClick={() => navigate('/auth')}>Inizia gratis</button>
        </div>
      </nav>

      <main className="ln-main">

        {/* ── Hero ── */}
        <section className="ln-hero">
          <div className="ln-hero-glow" aria-hidden="true" />
          <div className="ln-hero-inner">
            <div className="ln-eyebrow">
              <span className="ln-eyebrow-dot" />
              Prova gratuita · Nessuna carta di credito
            </div>

            <h1 className="ln-hero-title">
              Il partner digitale<br />
              per la tua <span className="ln-accent-text">attività locale</span>
            </h1>

            <p className="ln-hero-sub">
              PIUM genera il tuo sito web in automatico, ti aiuta a rispondere alle recensioni
              e a creare post social con l'intelligenza artificiale.
              Tutto da un'unica dashboard semplice.
            </p>

            <div className="ln-hero-ctas">
              <button className="ln-btn-hero-primary" onClick={() => navigate('/auth')}>
                Inizia gratis <IconArrowRight />
              </button>
              <a href="#funzionalita" className="ln-btn-hero-ghost">
                Scopri le funzionalità
              </a>
            </div>

            <div className="ln-hero-proof">
              <span><IconCheck /> Attivazione in 5 minuti</span>
              <span className="ln-proof-sep" aria-hidden="true">·</span>
              <span><IconCheck /> Sito online subito</span>
              <span className="ln-proof-sep" aria-hidden="true">·</span>
              <span><IconCheck /> Cancelli quando vuoi</span>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="ln-features" id="funzionalita">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">Funzionalità</p>
            <h2 className="ln-section-title">Tutto ciò di cui hai bisogno,<br />già incluso</h2>
            <p className="ln-section-sub">
              PIUM non è solo un costruttore di siti. È uno strumento completo
              pensato per chi gestisce un'attività locale e ha poco tempo.
            </p>
          </div>

          <div className="ln-features-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className="ln-feat-card">
                <div className={`ln-feat-icon ln-feat-icon--${f.color}`}>{f.icon}</div>
                <h3 className="ln-feat-title">{f.title}</h3>
                <p className="ln-feat-desc">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="ln-feat-strip">
            {EXTRA_FEATURES.map(t => (
              <span key={t} className="ln-feat-tag">
                <IconCheck /> {t}
              </span>
            ))}
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="ln-pricing" id="prezzi">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">Prezzi</p>
            <h2 className="ln-section-title">Semplice. Trasparente.<br />Senza sorprese.</h2>
            <p className="ln-section-sub">
              Un unico piano con tutto incluso. Nessun piano base, nessun add-on nascosto.
            </p>
          </div>

          <div className="ln-price-wrap">
            <div className="ln-price-card">
              <div className="ln-price-head">
                <div>
                  <p className="ln-price-plan-name">Piano Completo</p>
                  <div className="ln-price-amount-row">
                    <span className="ln-price-currency">€</span>
                    <span className="ln-price-amount">99</span>
                    <span className="ln-price-period">/mese</span>
                  </div>
                </div>
                <div className="ln-price-badge">
                  <IconGift /> Primo mese gratis
                </div>
              </div>

              <ul className="ln-price-list">
                {PRICE_FEATURES.map(f => (
                  <li key={f} className="ln-price-item">
                    <span className="ln-price-check"><IconCheck /></span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="ln-price-footer">
                <button className="ln-btn-price" onClick={() => navigate('/auth')}>
                  Inizia il mese gratuito <IconArrowRight />
                </button>
                <p className="ln-price-disclaimer">
                  Nessuna carta di credito richiesta per il primo mese. Disdici in qualsiasi momento.
                </p>
              </div>
            </div>

            <div className="ln-price-note">
              <span className="ln-price-note-icon"><IconShield /></span>
              <div>
                <strong>Soddisfatti o rimborsati</strong>
                <p>Se entro 30 giorni non sei soddisfatto, ti rimborsiamo integralmente, senza fare domande.</p>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="ln-footer">
        <div className="ln-footer-inner">
          <div className="ln-footer-brand">
            <div className="ln-brand-icon ln-brand-icon--sm"><IconHome /></div>
            <span className="ln-footer-name">PIUM</span>
          </div>
          <p className="ln-footer-copy">© {new Date().getFullYear()} PIUM · Tutti i diritti riservati</p>
          <div className="ln-footer-links">
            <a href="#" className="ln-footer-link">Privacy</a>
            <a href="#" className="ln-footer-link">Termini</a>
            <a href="#" className="ln-footer-link">Contatti</a>
          </div>
        </div>
      </footer>

    </div>
  )
}

/* ── Icons ── */
function IconHome()       { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function IconGlobe()      { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> }
function IconGrid()       { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
function IconSparkle()    { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.88 5.76a1 1 0 0 0 .95.69h6.05l-4.9 3.56a1 1 0 0 0-.36 1.12L17.4 20l-4.9-3.56a1 1 0 0 0-1.18 0L6.42 20l1.88-5.87a1 1 0 0 0-.36-1.12L3.04 9.45H9.1a1 1 0 0 0 .95-.69L12 3z"/></svg> }
function IconCheck()      { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconArrowRight() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> }
function IconGift()       { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg> }
function IconShield()     { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
