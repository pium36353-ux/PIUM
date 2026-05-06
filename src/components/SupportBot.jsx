import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CATEGORIE = [
  { label: 'Sito',      icon: '🌐' },
  { label: 'Agenda',    icon: '📅' },
  { label: 'Social',    icon: '✍️' },
  { label: 'Account',   icon: '👤' },
  { label: 'Affiliati', icon: '🤝' },
]

export default function SupportBot() {
  const navigate = useNavigate()
  const [open,      setOpen]      = useState(false)
  const [screen,    setScreen]    = useState('categorie') // categorie | domande | risposta
  const [categoria, setCategoria] = useState(null)
  const [domande,   setDomande]   = useState([])
  const [selected,  setSelected]  = useState(null)
  const [loading,   setLoading]   = useState(false)

  const selectCategoria = async (cat) => {
    setCategoria(cat)
    setScreen('domande')
    setLoading(true)
    const { data } = await supabase
      .from('faq')
      .select('id, domanda, risposta, link, ordine')
      .eq('categoria', cat)
      .order('ordine', { ascending: true })
    setDomande(data ?? [])
    setLoading(false)
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
    }, 200)
  }

  const handleLink = () => {
    if (!selected?.link) return
    close()
    if (selected.link.startsWith('/')) navigate(selected.link)
    else window.open(selected.link, '_blank')
  }

  const title = screen === 'categorie' ? 'Come posso aiutarti?'
              : screen === 'domande'   ? categoria
              : selected?.domanda ?? 'Risposta'

  return (
    <>
      {open && (
        <div className="bot-window">
          <div className="bot-header">
            <div className="bot-header-left">
              {screen !== 'categorie' && (
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

          <div className="bot-body">
            {screen === 'categorie' && (
              <div className="bot-list">
                {CATEGORIE.map(({ label, icon }) => (
                  <button key={label} className="bot-list-item" onClick={() => selectCategoria(label)}>
                    <span className="bot-item-icon">{icon}</span>
                    <span className="bot-item-label">{label}</span>
                    <IconChevronRight />
                  </button>
                ))}
              </div>
            )}

            {screen === 'domande' && (
              <div className="bot-list">
                {loading ? (
                  <div className="bot-loading"><BotSpinner /></div>
                ) : domande.length === 0 ? (
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

          <div className="bot-footer">
            Supporto PIUM
          </div>
        </div>
      )}

      <button
        className={`bot-fab ${open ? 'bot-fab--open' : ''}`}
        onClick={() => setOpen(o => !o)}
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
function IconChevronRight() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0, opacity:0.4}}><polyline points="9 18 15 12 9 6"/></svg> }
function IconX()            { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
