import { useState } from 'react'

const BLOCKS = ['hero', 'about', 'cta']

const BLOCK_LABELS = {
  hero:  'Hero — intestazione principale',
  about: 'Chi siamo',
  cta:   'Chiamata all\'azione',
}

export default function EditorSito({ business }) {
  const [active, setActive] = useState('hero')

  if (!business) return <EmptyBiz />

  return (
    <div className="db-section">
      <div className="db-editor-layout">
        <div className="db-editor-sidebar">
          {BLOCKS.map(b => (
            <button
              key={b}
              className={`db-editor-block-btn ${active === b ? 'db-editor-block-btn--active' : ''}`}
              onClick={() => setActive(b)}
            >
              {BLOCK_LABELS[b]}
            </button>
          ))}
        </div>
        <div className="db-card db-editor-main">
          <h3 className="db-card-title">{BLOCK_LABELS[active]}</h3>
          <p className="db-card-empty">Blocco "{active}" — editor in arrivo.</p>
        </div>
      </div>
    </div>
  )
}

function EmptyBiz() {
  return (
    <div className="db-section">
      <div className="db-empty-banner">Configura prima la tua attività.</div>
    </div>
  )
}
