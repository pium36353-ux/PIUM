const GENDER_COLORS = {
  maschio:         '#3b82f6',
  femmina:         '#ec4899',
  non_specificato: '#94a3b8',
}

const GENDER_LABELS = {
  maschio:         'Maschio',
  femmina:         'Femmina',
  non_specificato: 'Non specificato',
}

// Chip colorato a forma di osso con il nome dell'animale — puramente visivo,
// nessuna logica oltre alla scelta colore in base al genere. Riusato sia in
// Clienti.jsx (scheda cliente) sia in Agenda.jsx (modulo appuntamento).
export default function PetBoneIcon({ name, gender }) {
  const color = GENDER_COLORS[gender] ?? GENDER_COLORS.non_specificato
  const label = GENDER_LABELS[gender] ?? GENDER_LABELS.non_specificato
  return (
    <span className="pet-chip" style={{ background: `${color}22`, color }} title={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17 4a3 3 0 0 0-3 3c0 .35.06.69.16 1H9.84c.1-.31.16-.65.16-1a3 3 0 1 0-3 3c.35 0 .69-.06 1-.16v6.32c-.31-.1-.65-.16-1-.16a3 3 0 1 0 3 3c0-.35-.06-.69-.16-1h4.32c-.1.31-.16.65-.16 1a3 3 0 1 0 3-3c-.35 0-.69.06-1 .16V9.84c.31.1.65.16 1 .16a3 3 0 0 0 0-6z"/>
      </svg>
      <span className="pet-chip-name">{name}</span>
    </span>
  )
}
