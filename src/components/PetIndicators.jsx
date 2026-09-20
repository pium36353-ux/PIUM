// Colore ambra condiviso dai due indicatori, per coerenza visiva tra loro.
const AMBER = '#d97706'
const NEUTRAL = '#e5e7eb'

const COAT_LEVELS = { corto: 1, medio: 2, lungo: 3 }

// Icona lunghezza pelo "a tacche di segnale": 3 barre verticali, altezza
// crescente da sinistra a destra. Piene in ambra fino al livello del pelo
// (corto=1, medio=2, lungo=3), le restanti in grigio neutro. Nessun output
// se il pelo non è impostato (facoltativo su pets.coat).
export function CoatBars({ coat }) {
  const active = COAT_LEVELS[coat] ?? 0
  if (!active) return null
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-label={`Pelo ${coat}`} role="img">
      <title>{`Pelo ${coat}`}</title>
      <rect x="0"    y="7" width="3" height="5"  rx="1" fill={active >= 1 ? AMBER : NEUTRAL} />
      <rect x="5.5"  y="4" width="3" height="8"  rx="1" fill={active >= 2 ? AMBER : NEUTRAL} />
      <rect x="11"   y="0" width="3" height="12" rx="1" fill={active >= 3 ? AMBER : NEUTRAL} />
    </svg>
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
