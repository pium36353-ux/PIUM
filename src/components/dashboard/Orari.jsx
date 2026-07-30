import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

const DAY_LABELS = {
  monday:'Lunedì', tuesday:'Martedì', wednesday:'Mercoledì',
  thursday:'Giovedì', friday:'Venerdì', saturday:'Sabato', sunday:'Domenica',
}

const DEFAULT_HOURS = {
  monday:    { closed: false, morning: { open: '09:00', close: '13:00', active: true }, afternoon: { open: '15:00', close: '19:00', active: true  } },
  tuesday:   { closed: false, morning: { open: '09:00', close: '13:00', active: true }, afternoon: { open: '15:00', close: '19:00', active: true  } },
  wednesday: { closed: false, morning: { open: '09:00', close: '13:00', active: true }, afternoon: { open: '15:00', close: '19:00', active: true  } },
  thursday:  { closed: false, morning: { open: '09:00', close: '13:00', active: true }, afternoon: { open: '15:00', close: '19:00', active: true  } },
  friday:    { closed: false, morning: { open: '09:00', close: '13:00', active: true }, afternoon: { open: '15:00', close: '19:00', active: true  } },
  saturday:  { closed: false, morning: { open: '09:00', close: '13:00', active: true }, afternoon: { open: '15:00', close: '19:00', active: false } },
  sunday:    { closed: true,  morning: { open: '09:00', close: '13:00', active: true }, afternoon: { open: '15:00', close: '19:00', active: false } },
}

// Converts old { open, close, closed } format to new dual-slot format
function migrateDay(saved) {
  if (!saved) return null
  if ('morning' in saved || 'afternoon' in saved) return saved
  return {
    closed:    saved.closed ?? false,
    morning:   { open: saved.open ?? '09:00', close: saved.close ?? '13:00', active: true  },
    afternoon: { open: '15:00', close: '19:00', active: false },
  }
}

export { DAY_ORDER, DAY_LABELS, DEFAULT_HOURS }

export default function Orari({ business }) {
  const [hours, setHours] = useState(() => {
    const saved = business?.opening_hours ?? {}
    return Object.fromEntries(
      DAY_ORDER.map(day => {
        const migrated = migrateDay(saved[day])
        return [day, migrated ?? DEFAULT_HOURS[day]]
      })
    )
  })
  const [saving,          setSaving]          = useState(null)
  const [saveError,       setSaveError]       = useState(null)
  const [capacity,        setCapacity]        = useState(business?.booking_capacity ?? 1)
  const [savingCapacity,  setSavingCapacity]  = useState(false)
  const [capacitySaved,   setCapacitySaved]   = useState(false)

  if (!business) return (
    <div className="db-section">
      <div className="db-empty-banner">Configura prima la tua attività.</div>
    </div>
  )

  const persist = async (next, day, prevHours) => {
    setSaving(day)
    const { error } = await supabase
      .from('businesses')
      .update({ opening_hours: next })
      .eq('id', business.id)
    setSaving(null)
    if (error) {
      console.error('Errore salvataggio orari:', error)
      setHours(prevHours)
      setSaveError('Errore nel salvataggio degli orari. Le modifiche sono state annullate. Riprova.')
      setTimeout(() => setSaveError(null), 3000)
    }
  }

  const saveCapacity = async () => {
    const val = Math.min(50, Math.max(1, Number(capacity) || 1))
    setCapacity(val)
    setSavingCapacity(true)
    const { error } = await supabase
      .from('businesses')
      .update({ booking_capacity: val })
      .eq('id', business.id)
    setSavingCapacity(false)
    if (!error) {
      setCapacitySaved(true)
      setTimeout(() => setCapacitySaved(false), 2000)
    } else {
      console.error('Errore salvataggio capacità:', error)
      setSaveError('Errore nel salvataggio della capacità. Riprova.')
      setTimeout(() => setSaveError(null), 3000)
    }
  }

  const updateDay = (day, patch) => {
    const next = { ...hours, [day]: { ...hours[day], ...patch } }
    setHours(next)
    persist(next, day, hours)
  }

  const updateSlot = (day, slot, patch) => {
    const next = {
      ...hours,
      [day]: { ...hours[day], [slot]: { ...hours[day][slot], ...patch } },
    }
    setHours(next)
    persist(next, day, hours)
  }

  return (
    <div className="db-section">
      {saveError && <div className="db-deleted-toast" style={{ background: '#ef4444' }}>{saveError}</div>}
      <div className="oh-list">
        {DAY_ORDER.map(day => {
          const d = hours[day]
          return (
            <div key={day} className={`oh-row ${d.closed ? 'oh-row--closed' : ''}`}>
              <div className="oh-row-head">
                <span className="oh-day-label">{DAY_LABELS[day]}</span>
                <label className="oh-toggle-label">
                  <span className="oh-toggle-text">Chiuso</span>
                  <button
                    className={`sett-toggle ${d.closed ? 'sett-toggle--on' : ''}`}
                    onClick={() => updateDay(day, { closed: !d.closed })}
                    aria-pressed={d.closed}
                    type="button"
                  >
                    <span className="sett-toggle-thumb" />
                  </button>
                </label>
                {saving === day && <OhSpinner />}
              </div>

              {!d.closed && (
                <div className="oh-slots">
                  {['morning', 'afternoon'].map(slot => {
                    const s = d[slot]
                    const label = slot === 'morning' ? 'Mattina' : 'Pomeriggio'
                    return (
                      <div key={slot} className={`oh-slot-row ${!s.active ? 'oh-slot-row--inactive' : ''}`}>
                        <div className="oh-slot-toggle-label">
                          <button
                            className={`sett-toggle sett-toggle--sm ${s.active ? 'sett-toggle--on' : ''}`}
                            onClick={() => updateSlot(day, slot, { active: !s.active })}
                            aria-pressed={s.active}
                            type="button"
                          >
                            <span className="sett-toggle-thumb" />
                          </button>
                          <span className="oh-slot-label">{label}</span>
                        </div>
                        {s.active ? (
                          <div className="oh-slot-times">
                            <input
                              type="time"
                              className="oh-time-input"
                              value={s.open}
                              onChange={e => updateSlot(day, slot, { open: e.target.value })}
                            />
                            <span className="oh-sep">–</span>
                            <input
                              type="time"
                              className="oh-time-input"
                              value={s.close}
                              onChange={e => updateSlot(day, slot, { close: e.target.value })}
                            />
                          </div>
                        ) : (
                          <span className="oh-closed-text">Non attivo</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="oh-capacity-row">
        <div className="oh-capacity-label">
          <span className="oh-day-label">Clienti in contemporanea</span>
          <span className="oh-capacity-hint">Quante persone puoi servire nello stesso orario (es. numero di postazioni)</span>
        </div>
        <div className="oh-capacity-controls">
          <input
            type="number"
            className="oh-time-input"
            value={capacity}
            min={1}
            max={50}
            onChange={e => { setCapacity(e.target.value); setCapacitySaved(false) }}
            style={{ width: 64 }}
          />
          <button
            className={`oh-capacity-save-btn ${capacitySaved ? 'oh-capacity-save-btn--saved' : ''}`}
            onClick={saveCapacity}
            disabled={savingCapacity}
            type="button"
          >
            {savingCapacity ? '…' : capacitySaved ? '✓ Salvato' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OhSpinner() {
  return (
    <svg
      style={{ width:14, height:14, animation:'ag-spin 0.8s linear infinite', flexShrink:0 }}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}
