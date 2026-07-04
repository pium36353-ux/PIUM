import { useState, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const ICONE = {
  Sito:       '🌐',
  Agenda:     '📅',
  Social:     '📱',
  Recensioni: '⭐',
  Account:    '👤',
  Affiliati:  '🤝',
}
const ICONA_DEFAULT = '💬'

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export default function SupportBot() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const cacheRef  = useRef(null)

  const isAffiliatePage = location.pathname.startsWith('/affiliates')

  const [open,      setOpen]      = useState(false)
  const [screen,    setScreen]    = useState('categorie')
  const [categoria, setCategoria] = useState(null)
  const [domande,   setDomande]   = useState([])
  const [selected,  setSelected]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [query,     setQuery]     = useState('')

  const loadAllFaq = async () => {
    if (cacheRef.current) return cacheRef.current
    setLoading(true)
    const { data } = await supabase
      .from('faq')
      .select('id, categoria, domanda, risposta, link, ordine')
      .order('ordine', { ascending: true })
    cacheRef.current = data ?? []
    setLoading(false)
    return cacheRef.current
  }

  const handleOpen = async () => {
    setOpen(true)
    await loadAllFaq()
  }

  // Categorie dinamiche dal DB, icone dalla mappa con fallback
  const categorieVisibili = useMemo(() => {
    const all = cacheRef.current ?? []
    const uniche = [...new Set(all.map(f => f.categoria))]
    return uniche
      .filter(cat => isAffiliatePage ? cat === 'Affiliati' : cat !== 'Affiliati')
      .map(label => ({ label, icon: ICONE[label] ?? ICONA_DEFAULT }))
  }, [isAffiliatePage, open]) // ricalcola quando si apre (dopo il fetch)

  // Risultati ricerca: filtra tutto il cache su domanda + risposta
  const risultatiRicerca = useMemo(() => {
    const q = normalize(query.trim())
    if (!q || !cacheRef.current) return null
    return cacheRef.current.filter(f =>
      (isAffiliatePage ? f.categoria === 'Affiliati' : f.categoria !== 'Affiliati') &&
      (normalize(f.domanda).includes(q) || normalize(f.risposta).includes(q))
    )
  }, [query, isAffiliatePage, open])

  const selectCategoria = async (cat) => {
    const all = await loadAllFaq()
    setCategoria(cat)
    setDomande(all.filter(f => f.categoria === cat))
    setScreen('domande')
  }

  const selectDomanda = (faq) => {
    setSelected(faq)
    setScreen('risposta')
  }

  const goBack = () => {
    if (screen === 'risposta') { setScreen('domande'); setSelected(null) }
    else if (screen === 'domande') { setScreen('categorie'); setCategoria(null) }
  }

  const close = () => {
    setOpen(false)
    setTimeout(() => {
      setScreen('categorie')
      setCategoria(null)
      setSelected(null)
      setQuery('')
    }, 200)
  }

  const handleLink = () => {
    if (!selected?.link) return
    close()
    if (selected.link.startsWith('/')) navigate(selected.link)
    else window.open(selected.link, '_blank')
  }

  const isSearching = risultatiRicerca !== null

  const title = isSearching             ? 'Risultati ricerca'
              : screen === 'categorie'  ? 'Come posso aiutarti?'
              : screen === 'domande'    ? categoria
              : selected?.domanda ?? 'Risposta'

  const showBack = !isSearching && screen !== 'categorie'

  return (
    <>
      {open && (
        <div className="bot-window">
          <div className="bot-header">
            <div className="bot-header-left">
              {showBack && (
                <button className="bot-back" onClick={goBack} aria-label="Indietro">
                  <IconChevronLeft />
                </button>
              )}
              <span className="bot-title">{title}</span>
            </div>
            <button className="bot-close" onClick={close} aria-label="Chiudi">
              <IconX />
            </button>
          </div>

          {/* Campo ricerca — sempre visibile tranne nella schermata risposta */}
          {screen !== 'risposta' && (
            <div className="bot-search">
              <IconSearch />
              <input
                className="bot-search-input"
                type="text"
                placeholder="Cerca nelle FAQ…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && (
                <button className="bot-search-clear" onClick={() => setQuery('')} aria-label="Cancella">
                  <IconX />
                </button>
              )}
            </div>
          )}

          <div className="bot-body">
            {/* RICERCA ATTIVA: lista piatta con tag categoria */}
            {isSearching && (
              <div className="bot-list">
                {risultatiRicerca.length === 0 ? (
                  <p className="bot-empty">Nessun risultato per "{query}"</p>
                ) : (
                  risultatiRicerca.map(faq => (
                    <button key={faq.id} className="bot-list-item bot-list-item--search"
                      onClick={() => selectDomanda(faq)}>
                      <span className="bot-item-label">{faq.domanda}</span>
                      <span className="bot-item-tag">{ICONE[faq.categoria] ?? ICONA_DEFAULT} {faq.categoria}</span>
                      <IconChevronRight />
                    </button>
                  ))
                )}
              </div>
            )}

            {/* NAVIGAZIONE NORMALE */}
            {!isSearching && screen === 'categorie' && (
              <div className="bot-list">
                {loading ? (
                  <div className="bot-loading"><BotSpinner /></div>
                ) : (
                  categorieVisibili.map(({ label, icon }) => (
                    <button key={label} className="bot-list-item" onClick={() => selectCategoria(label)}>
                      <span className="bot-item-icon">{icon}</span>
                      <span className="bot-item-label">{label}</span>
                      <IconChevronRight />
                    </button>
                  ))
                )}
              </div>
            )}

            {!isSearching && screen === 'domande' && (
              <div className="bot-list">
                {domande.length === 0 ? (
                  <p className="bot-empty">Nessuna domanda disponibile per questa categoria.</p>
                ) : (
                  domande.map(faq => (
                    <button key={faq.id} className="bot-list-item" onClick={() => selectDomanda(faq)}>
                      <span className="bot-item-label">{faq.domanda}</span>
                      <IconChevronRight />
                    </button>
                  ))
                )}
              </div>
            )}

            {screen === 'risposta' && selected && (
              <div className="bot-answer">
                <p className="bot-answer-text">{selected.risposta}</p>
                {selected.link && (
                  <button className="bot-cta" onClick={handleLink}>
                    Vai alla sezione →
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="bot-footer">Supporto PIUM</div>
        </div>
      )}

      <button
        className={`bot-fab ${open ? 'bot-fab--open' : ''}`}
        onClick={open ? close : handleOpen}
        aria-label="Supporto"
      >
        {open ? <IconX /> : '?'}
      </button>
    </>
  )
}

function BotSpinner() {
  return (
    <svg style={{ width: 20, height: 20, animation: 'bot-spin 0.8s linear infinite' }}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}
function IconChevronLeft()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> }
function IconChevronRight() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.4}}><polyline points="9 18 15 12 9 6"/></svg> }
function IconX()            { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconSearch()       { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.5}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> }
