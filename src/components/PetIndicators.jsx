// Colore ambra condiviso dai due indicatori, per coerenza visiva tra loro.
const AMBER = '#d97706'

const COAT_LEVELS = { corto: 1, medio: 2, lungo: 3 }

// Chip a sfondo ambra chiaro FISSO (non theme-aware, come .pet-size-badge):
// serve a garantire contrasto indipendentemente dallo sfondo del blocco
// appuntamento sottostante (spesso grigio, dove un indicatore "trasparente"
// si perdeva) — e proprio perché è fisso, anche il colore delle barre deve
// restare fisso: una variabile che segue il tema (es. --text-h, quasi bianca
// in dark mode) sparirebbe contro questo stesso sfondo chiaro fisso quando
// il resto dell'app passa a dark mode. Il nero pieno funziona in entrambi i
// temi solo perché lo sfondo del chip non cambia mai.
const COAT_BAR_FILLED = '#1a1a1a'
const COAT_BAR_EMPTY  = '#F0DBAE'

// Icona lunghezza pelo "a tacche": 3 barre verticali della STESSA altezza —
// il livello si legge dal NUMERO di barre piene (corto=1, medio=2, lungo=3),
// non dalla loro grandezza (una singola barra bassa, come nella versione a
// altezza crescente, era poco leggibile per "corto"). Nessun output se il
// pelo non è impostato (facoltativo su pets.coat).
export function CoatBars({ coat }) {
  const active = COAT_LEVELS[coat] ?? 0
  if (!active) return null
  return (
    <span className="pet-coat-chip" title={`Pelo ${coat}`}>
      <svg width="20" height="14" viewBox="0 0 20 14" aria-label={`Pelo ${coat}`} role="img">
        <title>{`Pelo ${coat}`}</title>
        <rect x="1"  y="3" width="4" height="8" rx="1.2" fill={active >= 1 ? COAT_BAR_FILLED : COAT_BAR_EMPTY} />
        <rect x="8"  y="3" width="4" height="8" rx="1.2" fill={active >= 2 ? COAT_BAR_FILLED : COAT_BAR_EMPTY} />
        <rect x="15" y="3" width="4" height="8" rx="1.2" fill={active >= 3 ? COAT_BAR_FILLED : COAT_BAR_EMPTY} />
      </svg>
    </span>
  )
}

// Badge taglia: cerchio il cui raggio cresce progressivamente da xs a xl,
// sigla scritta dentro, stesso ambra di CoatBars. Nessun output se la
// taglia non è impostata (facoltativa su pets.size).
const SIZE_RADIUS = { xs: 8, s: 9, m: 10, l: 11, xl: 12 }

export function SizeBadge({ size }) {
  const r = SIZE_RADIUS[size]
  if (!r) return null
  const d = r * 2
  return (
    <span
      className="pet-size-badge"
      style={{ width: d, height: d, background: AMBER, fontSize: Math.round(r * 0.7) }}
      title={`Taglia ${size.toUpperCase()}`}
    >
      {size.toUpperCase()}
    </span>
  )
}
