import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

const DAY_LABELS = {
  monday:'Lunedì', tuesday:'Martedì', wednesday:'Mercoledì',
  thursday:'Giovedì', friday:'Venerdì', saturday:'Sabato', sunday:'Domenica',
}

const DEFAULT_HOURS = {
  monday:    { open:'09:00', close:'18:00', closed:false },
  tuesday:   { open:'09:00', close:'18:00', closed:false },
  wednesday: { open:'09:00', close:'18:00', closed:false },
  thursday:  { open:'09:00', close:'18:00', closed:false },
  friday:    { open:'09:00', close:'18:00', closed:false },
  saturday:  { open:'09:00', close:'13:00', closed:false },
  sunday:    { open:'09:00', close:'13:00', closed:true  },
}

export default function Orari({ business }) {
  const [hours, setHours] = useState(() => {
    const saved = business?.opening_hours ?? {}
    return Object.fromEntries(
      DAY_ORDER.map(day => [day, { ...DEFAULT_HOURS[day], ...(saved[day] ?? {}) }])
    )
  })
  const [saving, setSaving] = useState(null)

  if (!business) return (
    <div className="db-section">
      <div className="db-empty-banner">Configura prima la tua attività.</div>
    </div>
  )

  const update = async (day, field, value) => {
    const next = { ...hours, [day]: { ...hours[day], [field]: value } }
    setHours(next)
    setSaving(day)
    await supabase.from('businesses').update({ opening_hours: next }).eq('id', business.id)
    setSaving(null)
  }

  return (
    <div className="db-section">
      <div className="oh-list">
        {DAY_ORDER.map(day => {
          const d = hours[day]
          return (
            <div key={day} className={`oh-row ${d.closed ? 'oh-row--closed' : ''}`}>
              <span className="oh-day-label">{DAY_LABELS[day]}</span>

              <div className="oh-times">
                {d.closed ? (
                  <span className="oh-closed-text">Chiuso</span>
                ) : (
                  <>
                    <input
                      type="time"
                      className="oh-time-input"
                      value={d.open}
                      onChange={e => update(day, 'open', e.target.value)}
                    />
                    <span className="oh-sep">–</span>
                    <input
                      type="time"
                      className="oh-time-input"
                      value={d.close}
                      onChange={e => update(day, 'close', e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="oh-row-end">
                {saving === day && <OhSpinner />}
                <label className="oh-toggle-label">
                  <span className="oh-toggle-text">Chiuso</span>
                  <button
                    className={`sett-toggle ${d.closed ? 'sett-toggle--on' : ''}`}
                    onClick={() => update(day, 'closed', !d.closed)}
                    aria-pressed={d.closed}
                    type="button"
                  >
                    <span className="sett-toggle-thumb" />
                  </button>
                </label>
              </div>
            </div>
          )
        })}
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
