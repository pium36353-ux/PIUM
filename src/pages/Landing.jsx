import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'

const CORE_FEATURES = [
  {
    icon: <IconGlobe />,
    color: 'blue',
    title: 'Il sito dei tuoi clienti',
    desc: 'I tuoi clienti trovano online servizi, foto, orari, recensioni e contatti, e possono chiederti un appuntamento. Con un indirizzo web tutto tuo.',
  },
  {
    icon: <IconCalendar />,
    color: 'blue',
    title: 'Agenda e collaboratori',
    desc: 'Gestisci gli appuntamenti della giornata e aggiungi i tuoi collaboratori, ognuno con il suo colore. Sai sempre a che punto sei, senza chiamare nessuno.',
  },
  {
    icon: <IconTag />,
    color: 'accent',
    title: 'Prenotazioni: decidi tu',
    desc: 'Quando un cliente prenota, ti arriva una notifica. Lo contatti su WhatsApp per verificare, poi decidi se accettare. L\'ultima parola è sempre tua.',
  },
  {
    icon: <IconGrid />,
    color: 'green',
    title: "L'area gestionale per te",
    desc: "Aggiorni testi, foto, galleria, orari e prezzi del tuo sito quando vuoi, da solo. E apri la panoramica per vedere a colpo d'occhio gli appuntamenti di oggi e le cose da fare.",
  },
  {
    icon: <IconPhone />,
    color: 'blue',
    title: 'Rubrica clienti',
    desc: 'Tutti i tuoi clienti in un posto, importabili dalla rubrica del telefono. Per ognuno vedi lo storico: cosa ha fatto e quando.',
  },
  {
    icon: <IconSparkle />,
    color: 'accent',
    title: 'Strumenti AI inclusi',
    desc: 'Ti prepariamo bozze di descrizioni, post social e risposte alle recensioni. Tu leggi, modifichi e pubblichi solo quello che decidi.',
  },
  {
    icon: <IconMessage />,
    color: 'green',
    title: "Si usa come un'app",
    desc: 'Aggiungi PIUM alla schermata del telefono e aprilo come un\'app, senza installare niente.',
  },
]

const DAILY_ACTIONS = [
  'Aggiorni servizi e prezzi in due minuti, senza scrivere a nessuno.',
  'Ricevi richieste di prenotazione e confermi tu, dopo aver sentito il cliente su WhatsApp.',
  'Gestisci agenda e collaboratori a colpo d\'occhio, senza dover chiamare nessuno.',
  'Prepari testi per sito e social con strumenti AI inclusi: bozze pronte, controllo a te.',
  'Rispondi alle recensioni partendo da una bozza già scritta.',
  'Usi tutto dal telefono, anche mentre lavori, senza competenze tecniche.',
]

const COST_ITEMS = [
  {
    title: 'Sito web da professionista',
    desc: 'Spesso centinaia o migliaia di euro, più i costi di aggiornamento.',
  },
  {
    title: 'Gestione prenotazioni',
    desc: 'Gli strumenti dedicati spesso prendono una commissione su ogni prenotazione.',
  },
  {
    title: 'Testi, descrizioni e contenuti',
    desc: 'Tempo tuo oppure un consulente: in entrambi i casi ha un costo.',
  },
  {
    title: 'Agenda e collaboratori',
    desc: 'Strumento separato oppure lavoro manuale tra chiamate e messaggi.',
  },
  {
    title: 'Risposte recensioni e social',
    desc: 'Richiedono tempo, continuità e una linea coerente.',
  },
]

const MAIN_FEATURES = [
  'Sito pubblico con indirizzo web dedicato',
  'Foto, galleria, orari e recensioni sul sito',
  'Agenda appuntamenti con gestione collaboratori',
  'Prenotazioni online: ricevi, verifichi e confermi tu',
  'Notifiche su ogni richiesta, anche col telefono in tasca',
  'Rubrica clienti con import dalla rubrica del telefono',
  'Promemoria e cose da fare con scadenze',
  'Modifichi testi, foto e contenuti del sito da solo',
  'Panoramica con il riepilogo della giornata',
  'Strumenti AI per testi, social e risposte recensioni',
  'Gestione servizi e prezzi in autonomia',
  'Nessuna commissione sulle prenotazioni',
  'Si usa come app dal telefono, senza installazioni',
]

const PRICE_FEATURES = [
  'Sito pubblico personalizzato con URL dedicato',
  'Pannello gestionale completo in un unico spazio',
  'Strumenti AI inclusi per testi e bozze operative',
  'Gestione servizi, prezzi e richieste clienti',
  'Supporto alla gestione recensioni e contenuti',
  'Aggiornamenti inclusi nel piano',
]

const FAQS = [
  {
    q: 'PIUM è solo un sito web?',
    a: 'No. Oltre al sito hai agenda, gestione collaboratori, prenotazioni online, strumenti AI e tutto quello che serve per gestire la tua attività ogni giorno.',
  },
  {
    q: 'Posso usarlo dal telefono?',
    a: 'Sì, anche come app aggiunta alla schermata Home. La stessa area che usi dal computer, in tasca.',
  },
  {
    q: 'Come funzionano le prenotazioni?',
    a: 'Quando un cliente prenota ricevi una notifica. Lo contatti su WhatsApp per verificare, poi decidi se accettare. E non prendiamo commissioni su quello che incassi.',
  },
  {
    q: "L'AI pubblica da sola sui social o risponde alle recensioni?",
    a: 'No. Prepara bozze. Decidi, modifichi e pubblichi sempre tu.',
  },
  {
    q: 'Devo essere bravo con la tecnologia?',
    a: 'No, è pensato per chi non lo è. E c\'è una persona che ti segue all\'inizio per aiutarti a partire.',
  },
  {
    q: 'Quanto costa?',
    a: 'Piano unico 99,99 €/mese, tutto incluso, senza commissioni sulle prenotazioni. Prova 14 giorni. Promo founder per i primi clienti.',
  },
]

const TRUST_PILLS = [
  'Non vendiamo i dati dei tuoi clienti',
  'Documenti privacy, termini e DPA disponibili',
  'Nessuna commissione sulle prenotazioni',
  'Fatto in Italia',
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="ln-page">
      <nav className="ln-nav">
        <div className="ln-brand">
          <div className="ln-brand-icon"><IconHome /></div>
          <Logo className="ln-brand-name" />
        </div>
        <div className="ln-nav-links">
          <a href="#cosa-include" className="ln-nav-link">Cosa include</a>
          <a href="#prezzi" className="ln-nav-link">Prezzi</a>
          <a href="#faq" className="ln-nav-link">FAQ</a>
        </div>
        <div className="ln-nav-actions">
          <button className="ln-btn-ghost" onClick={() => navigate('/auth')}>Accedi</button>
          <button className="ln-btn-primary" onClick={() => navigate('/auth')}>Inizia la prova</button>
        </div>
      </nav>

      <main className="ln-main">
        <section className="ln-hero">
          <div className="ln-hero-glow" aria-hidden="true" />
          <div className="ln-hero-inner">
            <div className="ln-eyebrow">
              <span className="ln-eyebrow-dot" />
              Piattaforma digitale per attività locali
            </div>

            <h1 className="ln-hero-title">
              Il sito della tua attività e l'agenda per gestirla. In un posto solo.
            </h1>

            <p className="ln-hero-sub">
              Crea il tuo sito, ricevi prenotazioni, organizza appuntamenti e collaboratori, prepara post e risposte: tutto dal telefono, in pochi minuti, senza saperne di tecnologia.
            </p>

            <div className="ln-hero-ctas">
              <button className="ln-btn-hero-primary" onClick={() => navigate('/auth')}>
                Inizia la prova <IconArrowRight />
              </button>
              <a href="#cosa-include" className="ln-btn-hero-ghost">
                Scopri cosa include
              </a>
            </div>

            <div className="ln-hero-proof">
              <span><IconCheck /> Prova 14 giorni</span>
              <span className="ln-proof-sep" aria-hidden="true">·</span>
              <span><IconCheck /> Si usa anche come app dal telefono</span>
            </div>
          </div>
        </section>

        <section className="ln-features" id="cosa-include">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">PIUM</p>
            <h2 className="ln-section-title">Un sito per i tuoi clienti, un'area gestionale per te</h2>
            <p className="ln-section-sub">
              I tuoi clienti trovano online servizi, orari e contatti, e possono chiederti un appuntamento. Tu, dallo stesso posto, aggiorni tutto, ricevi le richieste e organizzi la giornata. Due cose in uno, sempre in mano tua.
            </p>
          </div>

          <div className="ln-features-grid">
            {CORE_FEATURES.map((feature) => (
              <div key={feature.title} className="ln-feat-card">
                <div className={`ln-feat-icon ln-feat-icon--${feature.color}`}>{feature.icon}</div>
                <h3 className="ln-feat-title">{feature.title}</h3>
                <p className="ln-feat-desc">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ln-features ln-features--soft">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">Operatività quotidiana</p>
            <h2 className="ln-section-title">Gestisci la tua presenza digitale senza competenze tecniche</h2>
          </div>
          <ul className="ln-check-list">
            {DAILY_ACTIONS.map((item) => (
              <li key={item} className="ln-check-item">
                <span className="ln-price-check"><IconCheck /></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ln-features">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">Smartphone</p>
            <h2 className="ln-section-title">Usalo come un'app dal tuo telefono</h2>
            <p className="ln-section-sub">
              Puoi aggiungere PIUM alla schermata Home del telefono e aprirlo come un'app,
              senza installazioni complicate e senza passare ogni volta dal browser.
            </p>
          </div>
          <div className="ln-feat-strip">
            <span className="ln-feat-tag"><IconPhone /> Apertura rapida dalla Home</span>
            <span className="ln-feat-tag"><IconCheck /> Accesso ai dati principali in mobilità</span>
            <span className="ln-feat-tag"><IconCheck /> Stessa area gestionale che usi da desktop</span>
          </div>
        </section>

        <section className="ln-features ln-features--soft">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">Valore economico</p>
            <h2 className="ln-section-title">Una cosa sola, invece di mettere insieme dieci pezzi</h2>
            <p className="ln-section-sub">
              Creare e mantenere una presenza digitale spesso significa coordinare più fornitori,
              strumenti e costi separati. PIUM riunisce gli strumenti essenziali in un unico abbonamento.
            </p>
          </div>
          <div className="ln-cost-grid">
            {COST_ITEMS.map((item) => (
              <div key={item.title} className="ln-cost-card">
                <h3 className="ln-feat-title">{item.title}</h3>
                <p className="ln-feat-desc">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="ln-cost-footer">
            PIUM riunisce tutto in un unico abbonamento, e non prendiamo commissioni su nessuna prenotazione che incassi.
          </p>
        </section>

        <section className="ln-features">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">Funzioni principali</p>
            <h2 className="ln-section-title">Strumenti essenziali, in un unico spazio</h2>
          </div>
          <div className="ln-main-features-grid">
            {MAIN_FEATURES.map((feature) => (
              <div key={feature} className="ln-main-feature">
                <span className="ln-price-check"><IconCheck /></span>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="ln-features ln-features--soft">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">Assistenza</p>
            <h2 className="ln-section-title">C'è una persona che ti segue, non un modulo da compilare</h2>
            <p className="ln-section-sub">
              PIUM non è "arrangiati". C'è chi ti aiuta a partire, a impostare il sito e a usarlo, e che puoi sentire quando ti serve. E sulle prenotazioni che ricevi non prendiamo nessuna commissione: quello che incassi è tuo.
            </p>
          </div>
        </section>

        <section className="ln-pricing" id="prezzi">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">Prezzo</p>
            <h2 className="ln-section-title">Piano completo: 99,99 €/mese</h2>
            <p className="ln-section-sub">
              Un piano unico, tutto incluso: sito, area gestionale, agenda, prenotazioni e strumenti AI.
            </p>
          </div>

          <div className="ln-price-wrap">
            <div className="ln-price-card">
              <div className="ln-price-head">
                <div>
                  <p className="ln-price-plan-name">Piano completo</p>
                  <div className="ln-price-amount-row">
                    <span className="ln-price-currency">€</span>
                    <span className="ln-price-amount">99,99</span>
                    <span className="ln-price-period">/mese</span>
                  </div>
                </div>
                <div className="ln-price-badge">
                  <IconClock /> 14 giorni di prova
                </div>
              </div>

              <ul className="ln-price-list">
                {PRICE_FEATURES.map((feature) => (
                  <li key={feature} className="ln-price-item">
                    <span className="ln-price-check"><IconCheck /></span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="ln-price-footer">
                <button className="ln-btn-price" onClick={() => navigate('/auth')}>
                  Inizia la prova <IconArrowRight />
                </button>
                <p className="ln-price-disclaimer">
                  Promo founder per i primi clienti. Nessuna commissione sulle prenotazioni.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="ln-features" id="faq">
          <div className="ln-section-header">
            <p className="ln-section-eyebrow">FAQ</p>
            <h2 className="ln-section-title">Domande frequenti</h2>
          </div>
          <div className="ln-faq-grid">
            {FAQS.map((faq) => (
              <article key={faq.q} className="ln-faq-item">
                <h3 className="ln-faq-q">{faq.q}</h3>
                <p className="ln-faq-a">{faq.a}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ln-trust">
          <SslBadge size={96} />
          <h2 className="ln-trust-title">I tuoi dati trattati con attenzione</h2>
          <p className="ln-trust-copy">
            PIUM non vende i dati tuoi né dei tuoi clienti. Documenti chiari su privacy, termini e trattamento dati sempre disponibili.
          </p>
          <div className="ln-trust-pills">
            {TRUST_PILLS.map((pill) => (
              <span key={pill} className="ln-trust-pill">
                <span className="ln-trust-pill-dot" />
                {pill}
              </span>
            ))}
          </div>
        </section>
      </main>

      <footer className="ln-footer">
        <div className="ln-footer-inner">
          <div className="ln-footer-brand">
            <div className="ln-brand-icon ln-brand-icon--sm"><IconHome /></div>
            <Logo className="ln-footer-name" />
          </div>
          <div className="ln-footer-copy">
            <SslBadge size={36} />
            © {new Date().getFullYear()} <Logo /> · Tutti i diritti riservati
          </div>
          <div className="ln-footer-links">
            <a href="/privacy" className="ln-footer-link">Privacy</a>
            <a href="/termini" className="ln-footer-link">Termini</a>
            <a href="/cookie" className="ln-footer-link">Cookie</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function SslBadge({ size = 64 }) {
  const cx = size / 2
  const cy = size / 2
  const outerR = size / 2 - 1.5
  const petalD = outerR / 1.38
  const petalR = outerR - petalD
  const innerR = petalD - petalR * 0.6
  const backR = innerR + petalR * 0.42
  const hasLbl = size >= 56
  const aFont = innerR * 0.92
  const aY = cy + aFont * 0.36 - (hasLbl ? innerR * 0.08 : 0)
  const lFont = Math.max(6, innerR * 0.32)
  const lY = cy + innerR * 0.72

  const petals = Array.from({ length: 12 }, (_, k) => {
    const angle = (k * Math.PI * 2) / 12 - Math.PI / 2
    return { x: cx + petalD * Math.cos(angle), y: cy + petalD * Math.sin(angle) }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="SSL A+" style={{ flexShrink: 0 }}>
      {petals.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={petalR} fill="#F5C518" />)}
      <circle cx={cx} cy={cy} r={backR} fill="#E8A000" />
      <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
      <text x={cx} y={aY} textAnchor="middle" fontFamily="system-ui,sans-serif" fontWeight="700" fontSize={aFont} fill="#1a1a1a">A+</text>
      {hasLbl && <text x={cx} y={lY} textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize={lFont} fill="#888">SSL Labs</text>}
    </svg>
  )
}

function IconHome() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
}
function IconGlobe() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
}
function IconGrid() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
}
function IconTag() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 11 23l-9-9V5h9l9.59 8.59a2 2 0 0 1 0 2.82Z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
}
function IconCalendar() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
}
function IconSparkle() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.88 5.76a1 1 0 0 0 .95.69h6.05l-4.9 3.56a1 1 0 0 0-.36 1.12L17.4 20l-4.9-3.56a1 1 0 0 0-1.18 0L6.42 20l1.88-5.87a1 1 0 0 0-.36-1.12L3.04 9.45H9.1a1 1 0 0 0 .95-.69L12 3z" /></svg>
}
function IconMessage() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
}
function IconPhone() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72 13 13 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45 13 13 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
}
function IconClock() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
}
function IconCheck() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
}
function IconArrowRight() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
}
