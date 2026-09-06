import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { buildWaLink } from '../../lib/phone'

/* ── Helpers ── */
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Senza giorno della settimana: si usa dentro al messaggio WhatsApp
// ("l'appuntamento del 12 settembre"), dove il weekday sarebbe ridondante.
function formatDateForMessage(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
}

// Con giorno della settimana: usato solo per lo stato vuoto in pagina.
function formatDateForLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

/* ── Component ──
   Versione 1, leggera: sola lettura di appointments filtrati per data,
   nessuna tabella/campo nuovo, nessun tracking "già inviato" — il link
   WhatsApp resta sempre cliccabile, l'invio effettivo resta manuale.
   Distinta da "Promemoria" (Promemoria.jsx, tabella reminders): quella
   sezione sono i task personali del commerciante, questa manda messaggi
   ai clienti. Nessun nome/tabella/evento condiviso tra le due. */
export default function PromemoriaClienti({ business }) {
  const [date,         setDate]         = useState(todayStr())
  const [appointments, setAppointments] = useState([])
  const [loading,      setLoading]      = useState(true)

  const load = useCallback(async (signal = null) => {
    if (!business) return
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select('id, client_name, client_phone, start_time, appointment_services(services(name))')
      .eq('business_id', business.id)
      .eq('date', date)
      .order('start_time', { ascending: true })
    if (signal?.cancelled) return
    setAppointments(data ?? [])
    setLoading(false)
  }, [business, date])

  useEffect(() => {
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [load])

  const messageDateLabel = useMemo(() => formatDateForMessage(date), [date])
  const emptyDateLabel   = useMemo(() => formatDateForLabel(date), [date])

  if (!business) {
    return (
      <div className="db-section">
        <div className="db-empty-banner">Configura prima la tua attività.</div>
      </div>
    )
  }

  return (
    <div className="db-section">

      {/* Toolbar */}
      <div className="db-section-toolbar">
        <p className="db-section-desc">
          Scegli un giorno per vedere i suoi appuntamenti e mandare un promemoria WhatsApp ai clienti.
        </p>
        <div className="pmc-date-picker">
          <label className="pmc-date-label" htmlFor="pmc-date">Giorno</label>
          <input
            id="pmc-date"
            className="pmc-date-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
      </div>

      {/* Lista appuntamenti */}
      {loading ? (
        <div className="pmc-loading"><PmcSpinner /></div>
      ) : appointments.length === 0 ? (
        <div className="db-card">
          <p className="db-card-empty">Nessun appuntamento il {emptyDateLabel}.</p>
        </div>
      ) : (
        <div className="pmc-list">
          {appointments.map(apt => {
            const serviceName = apt.appointment_services?.[0]?.services?.name ?? null
            const waLink = buildWaLink(
              apt.client_phone,
              `Ciao ${apt.client_name}, ti ricordo l'appuntamento del ${messageDateLabel} alle ${apt.start_time?.slice(0, 5)} presso ${business.name}.`
            )
            return (
              <div key={apt.id} className="pmc-row">
                <div className="pmc-row-info">
                  <span className="pmc-time">{apt.start_time?.slice(0, 5)}</span>
                  <div className="pmc-row-text">
                    <span className="pmc-name">{apt.client_name}</span>
                    {serviceName && <span className="pmc-service">{serviceName}</span>}
                  </div>
                </div>
                {waLink ? (
                  <a className="pmc-wa-btn" href={waLink} target="_blank" rel="noopener noreferrer">
                    <IconWhatsapp /> Promemoria
                  </a>
                ) : (
                  <span className="pmc-no-phone">Nessun numero</span>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}

/* ── Icons ── */
function IconWhatsapp() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
}
function PmcSpinner() {
  return <svg className="pmc-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
