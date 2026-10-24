import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSectionParams } from '../../lib/sectionParams'
import { supabase } from '../../lib/supabase'
import KioskLockButton from './KioskLockButton'
import { ensureDefaultCourses, ensureDefaultStation } from '../../lib/kitchenSeed'
import { resolveStationId, groupItemsByCourse, isServedByHall } from '../../lib/kitchenRouting'
import { subscribeTableOrderItems, sendCallSala, recordCallSala } from '../../lib/kitchenRealtime'
import { formatTime } from '../../lib/datetime'

// Un ticket "riceve il via" resta in cima alla vista per questa finestra di
// tempo, poi torna nell'ordine normale (dalla più vecchia alla più
// recente per orario di invio) — sale in cima sia una portata appena
// inviata "subito" sia una portata appena passata da "in attesa" a
// "subito" col pulsante Via: stesso segnale (fired_at appena valorizzato),
// stesso trattamento.
const RECENT_FIRE_WINDOW_MS = 90_000

function stationStorageKey(businessId) { return `pium_kitchen_station_${businessId}` }
function modeStorageKey(businessId)    { return `pium_kitchen_mode_${businessId}` }

function readLocal(key) {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function writeLocal(key, value) {
  try { window.localStorage.setItem(key, value) } catch { /* storage non disponibile, scelta non salvata sul dispositivo ma la vista funziona comunque */ }
}

function courseLabel(c) {
  if (!c) return 'Senza portata'
  return c.name?.trim() || `Portata ${c.slot_number}`
}

// Colore automatico per slot_number, mai una scelta del titolare — palette
// fissa (6 tinte, come i fogli colorati delle comande a carta carbone),
// ciclica se le portate attive superano la palette. La fascia "senza
// portata" resta neutra (kt-band senza modificatore): non è una vera
// portata, va distinta per posizione (sempre in cima), non per colore.
const COURSE_COLOR_COUNT = 6
function courseColorClass(course) {
  if (!course) return ''
  const idx = (course.slot_number - 1 + COURSE_COLOR_COUNT * 100) % COURSE_COLOR_COUNT
  return `kt-band--c${idx}`
}

// L'orario di invio mostrato sulle schede usa il formattatore condiviso
// (fuso del business, non del dispositivo): un tablet con il fuso
// configurato male mostrerebbe altrimenti orari diversi da quelli della
// sala — vedi src/lib/datetime.js.

// Vista cucina (Blocco D) — nuovo componente, voce di navigazione propria,
// montato solo per vertical='ristorante_bar' (React.lazy + doppio gate in
// Dashboard.jsx, stesso pattern di Tavoli/Menu). A differenza di Ordine.jsx
// non ha protezione offline dedicata (fuori scopo qui, richiesta solo per
// la schermata ordine): le azioni sono chiamate dirette, stesso stile del
// resto del progetto prima del Blocco D.
export default function Cucina({ business, kioskLock, onKioskLockChange }) {
  const [stations,        setStations]        = useState([])
  const [courses,         setCourses]         = useState([])
  const [settingsLoading, setSettingsLoading]  = useState(true)

  // La postazione vive nell'indirizzo oltre che sul dispositivo: un
  // aggiornamento della pagina deve riportare sulla stessa postazione.
  // L'URL vince sul localStorage quando c'è (è più specifico: è
  // l'indirizzo di QUESTA schermata), il localStorage resta la
  // preferenza predefinita del dispositivo.
  const { searchParams, isActiveSection, patchParams } = useSectionParams('cucina')
  // In uno stato e non in un ref: va letta durante il render, nello stato
  // iniziale della postazione qui sotto.
  const [initialStationParam] = useState(() => searchParams.get('st'))

  const [selectedStationId, setSelectedStationId] = useState(() =>
    initialStationParam || (business ? readLocal(stationStorageKey(business.id)) : null))
  // Predefinita SEMPRE 'interattiva' al primo avvio su un dispositivo —
  // solo il valore esatto 'solo_schermo' salvato in precedenza sposta la
  // modalità, qualunque altra cosa (niente salvato, storage corrotto,
  // valore imprevisto) resta interattiva. Whitelist esplicita, non un
  // `??` che si limiterebbe a coprire il solo caso "niente salvato".
  const [mode, setMode] = useState(() => {
    const stored = business ? readLocal(modeStorageKey(business.id)) : null
    return stored === 'solo_schermo' ? 'solo_schermo' : 'interattiva'
  })
  const [stationPickerOpen,  setStationPickerOpen]  = useState(false)

  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [tick,    setTick]    = useState(() => Date.now())

  const activeStations = useMemo(() => stations.filter(s => s.is_active), [stations])
  const activeCourses  = useMemo(() => courses.filter(c => c.is_active), [courses])

  // Postazioni scegliibili da un dispositivo di cucina: quelle servite
  // dalla sala non lo sono mai. Le loro voci nascono già consegnate
  // all'invio, quindi una postazione del genere mostrerebbe per sempre
  // una vista vuota. Attenzione: resolveStationId continua a ricevere
  // activeStations COMPLETO — risolvere su un elenco filtrato farebbe
  // ripiegare le voci del bar sulla prima postazione della cucina,
  // facendole comparire proprio dove non devono.
  const pickableStations = useMemo(() => activeStations.filter(s => !s.served_by_hall), [activeStations])

  // Seeding condiviso con Menu.jsx: se questa è la prima schermata mai
  // aperta per il business, "Cucina" e le 4 portate nascono qui.
  const loadSettings = useCallback(async (signal = null) => {
    if (!business) return
    setSettingsLoading(true)
    const [st, cs] = await Promise.all([ensureDefaultStation(business.id), ensureDefaultCourses(business.id)])
    if (signal?.cancelled) return
    setSettingsLoading(false)
    setStations(st)
    setCourses(cs)
  }, [business])

  useEffect(() => {
    const signal = { cancelled: false }
    loadSettings(signal)
    return () => { signal.cancelled = true }
  }, [loadSettings])

  // Se la postazione salvata sul dispositivo non esiste più o è stata
  // disattivata, torna al selettore invece di restare bloccati su un id
  // ormai invalido.
  useEffect(() => {
    if (!business || settingsLoading) return
    if (selectedStationId && !pickableStations.some(s => s.id === selectedStationId)) {
      setSelectedStationId(null)
      writeLocal(stationStorageKey(business.id), '')
      patchParams({ st: null })
    }
  }, [settingsLoading, pickableStations, selectedStationId, business, patchParams])

  // La postazione scelta finisce sempre nell'indirizzo, anche quando
  // arriva dal localStorage del dispositivo: così la schermata ha un
  // indirizzo proprio e un aggiornamento della pagina non la perde.
  // `isActiveSection` è guardia e dipendenza insieme: non si scrive
  // mentre l'indirizzo porta ancora un'altra sezione, e si scrive da sé
  // appena arriva su 'cucina' (vedi sectionParams.js).
  useEffect(() => {
    if (!isActiveSection || !selectedStationId) return
    patchParams({ st: selectedStationId })
  }, [isActiveSection, selectedStationId, patchParams])

  const chooseStation = (stationId) => {
    setSelectedStationId(stationId)
    writeLocal(stationStorageKey(business.id), stationId)
    patchParams({ st: stationId })
    setStationPickerOpen(false)
  }

  const chooseMode = (nextMode) => {
    setMode(nextMode)
    writeLocal(modeStorageKey(business.id), nextMode)
  }

  // Ordini aperti con le loro voci, embed fino a menu_categories per
  // risolvere postazione/portata con la stessa identica funzione usata
  // ovunque altro (kitchenRouting.js) — nessuna duplicazione della logica.
  const loadOrders = useCallback(async (signal = null) => {
    if (!business) return
    setLoading(true)
    const { data, error } = await supabase
      .from('table_orders')
      .select(`
        id, table_id, order_date, turn_id, status,
        tables ( name ),
        table_order_items (
          id, item_name_snapshot, quantity, notes, sent_at, kitchen_status,
          ready_at, delivered_at, fire_status, fired_at, menu_item_id,
          menu_items ( category_id, menu_categories ( id, name, station_id, course_id ) )
        )
      `)
      .eq('business_id', business.id)
      .eq('status', 'aperto')
    if (signal?.cancelled) return
    setLoading(false)
    if (error) { console.error('[loadOrders]', error); return }
    setOrders(data ?? [])
  }, [business])

  useEffect(() => {
    const signal = { cancelled: false }
    loadOrders(signal)
    return () => { signal.cancelled = true }
  }, [loadOrders])

  // Tempo reale: qualunque evento su una voce ricarica tutto — mai un patch
  // dal payload (stesso principio di Ordine.jsx/Tavoli.jsx), corretto anche
  // per un evento che riguarda un ordine appena aperto altrove e non ancora
  // noto qui. Debounce breve: un "Invia in cucina" da più voci in un colpo
  // solo genera più eventi ravvicinati, ne basta un reload.
  const [realtimeDown, setRealtimeDown] = useState(false)
  const wasSubscribedRef = useRef(false)
  const reloadTimerRef = useRef(null)
  useEffect(() => {
    if (!business) return
    const debouncedReload = () => {
      clearTimeout(reloadTimerRef.current)
      reloadTimerRef.current = setTimeout(loadOrders, 200)
    }
    const unsubscribe = subscribeTableOrderItems(
      `cucina-${business.id}`,
      debouncedReload,
      (status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeDown(false)
          if (wasSubscribedRef.current) loadOrders()
          wasSubscribedRef.current = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeDown(true)
        }
      }
    )
    return () => { unsubscribe(); clearTimeout(reloadTimerRef.current) }
  }, [business, loadOrders])

  // Avanza "adesso" ogni 15s per far scadere da solo il boost "appena dato
  // il via" (vedi RECENT_FIRE_WINDOW_MS) senza bisogno di un nuovo evento.
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  // Schede: una per ordine aperto, solo le voci inviate della postazione
  // scelta — se non esiste NESSUNA postazione attiva, nessun filtro:
  // mostra tutto, mai nessuna (regola esplicita). Una scheda sparisce
  // quando tutte le sue voci visibili sono consegnate o annullate.
  const tickets = useMemo(() => {
    const list = []
    for (const o of orders) {
      // Le voci delle postazioni servite dalla sala non compaiono mai
      // qui, nemmeno quando non esiste nessuna postazione attiva (dove la
      // regola è "mostra tutto"): quelle le ha già prese il cameriere al
      // bancone, e all'invio sono nate consegnate.
      const sentItems = (o.table_order_items ?? [])
        .filter(i => i.sent_at && !isServedByHall(i, activeStations))
      const visible = activeStations.length === 0
        ? sentItems
        : sentItems.filter(i => resolveStationId(i, activeStations) === selectedStationId)
      if (visible.length === 0) continue
      const allDone = visible.every(i => i.kitchen_status === 'consegnato' || i.kitchen_status === 'annullato')
      if (allDone) continue
      const bands = groupItemsByCourse(visible, activeCourses)
      const earliestSentAt = Math.min(...visible.map(i => new Date(i.sent_at).getTime()))
      const firedTimestamps = visible.filter(i => i.fire_status === 'subito' && i.fired_at).map(i => new Date(i.fired_at).getTime())
      const maxFiredAt = firedTimestamps.length > 0 ? Math.max(...firedTimestamps) : null
      list.push({ order: o, table: o.tables, bands, earliestSentAt, maxFiredAt })
    }
    list.sort((a, b) => {
      const aBoost = a.maxFiredAt != null && (tick - a.maxFiredAt) < RECENT_FIRE_WINDOW_MS
      const bBoost = b.maxFiredAt != null && (tick - b.maxFiredAt) < RECENT_FIRE_WINDOW_MS
      if (aBoost && !bBoost) return -1
      if (bBoost && !aBoost) return 1
      if (aBoost && bBoost) return b.maxFiredAt - a.maxFiredAt
      return a.earliestSentAt - b.earliestSentAt
    })
    return list
  }, [orders, activeStations, activeCourses, selectedStationId, tick])

  /* ── Totali per piatto ──
     Calcolati dalle STESSE voci già filtrate per postazione dentro
     `tickets`, non da una query propria: così non possono raccontare una
     cosa diversa dalle schede sotto, e si aggiornano in tempo reale
     insieme a loro (ogni evento ricarica gli ordini → tickets → questi).
       "Da preparare" = inviate, con il via dato, non ancora pronte.
       "In arrivo"    = inviate ma ancora in attesa del via.
     Le voci annullate restano fuori da entrambe (kitchen_status diverso
     da 'da_preparare'), così come quelle già pronte o consegnate. */
  const dishTotals = useMemo(() => {
    const toPrepare = new Map()
    const incoming  = new Map()
    for (const ticket of tickets) {
      for (const band of ticket.bands) {
        for (const item of band.items) {
          if (item.kitchen_status !== 'da_preparare') continue
          const bucket = item.fire_status === 'in_attesa' ? incoming : toPrepare
          const name = item.item_name_snapshot
          bucket.set(name, (bucket.get(name) ?? 0) + Number(item.quantity))
        }
      }
    }
    const toList = (m) => Array.from(m.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
    return { toPrepare: toList(toPrepare), incoming: toList(incoming) }
  }, [tickets])

  /* ── Azioni ── */
  const markItemReady = async (item) => {
    if (item.kitchen_status !== 'da_preparare' || item.fire_status !== 'subito') return
    const { error } = await supabase
      .from('table_order_items')
      .update({ kitchen_status: 'pronto', ready_at: new Date().toISOString() })
      .eq('id', item.id)
    if (error) { console.error('[markItemReady]', error); return }
    loadOrders()
  }

  const fireBandNow = async (band) => {
    const ids = band.items.filter(i => i.fire_status === 'in_attesa').map(i => i.id)
    if (ids.length === 0) return
    const { error } = await supabase
      .from('table_order_items')
      .update({ fire_status: 'subito', fired_at: new Date().toISOString() })
      .in('id', ids)
    if (error) { console.error('[fireBandNow]', error); return }
    loadOrders()
  }

  const markBandDelivered = async (band) => {
    const ids = band.items.filter(i => i.kitchen_status === 'pronto').map(i => i.id)
    if (ids.length === 0) return
    const { error } = await supabase
      .from('table_order_items')
      .update({ kitchen_status: 'consegnato', delivered_at: new Date().toISOString() })
      .in('id', ids)
    if (error) { console.error('[markBandDelivered]', error); return }
    loadOrders()
  }

  const [callSent, setCallSent] = useState(false)
  const handleCallSala = () => {
    // Due cose, non una: il broadcast è l'avviso immediato (arriva solo a
    // chi è collegato in quell'istante), la riga in hall_notifications è
    // il ricordo, che resta nell'elenco Notifiche sala anche se il
    // tablet della sala era spento o si è riavviato subito dopo.
    sendCallSala(business.id)
    recordCallSala(business.id, currentStation?.id ?? null)
    setCallSent(true)
    setTimeout(() => setCallSent(false), 3000)
  }

  if (!business) {
    return <div className="db-section rb-screen"><div className="db-empty-banner">Configura prima la tua attività.</div></div>
  }

  if (settingsLoading) {
    return <div className="db-section rb-screen"><div className="sv-loading"><KtSpinner /></div></div>
  }

  const currentStation = pickableStations.find(s => s.id === selectedStationId) ?? null

  // Selettore postazione a tutta pagina — non un modale sopra a una vista
  // ancora senza senso senza postazione scelta (stesso principio della
  // schermata Ordine che sostituisce la griglia, non un overlay).
  if (!currentStation || stationPickerOpen) {
    return (
      <div className="db-section rb-screen">
        <h2 className="sv-modal-title" style={{ marginBottom: 12 }}>Scegli la postazione di questo dispositivo</h2>
        {pickableStations.length === 0 ? (
          <div className="db-card"><p className="db-card-empty">Nessuna postazione attiva ancora.</p></div>
        ) : (
          <div className="kt-station-picker">
            {pickableStations.map(s => (
              <button key={s.id} className="kt-station-pick" onClick={() => chooseStation(s.id)}>{s.name}</button>
            ))}
          </div>
        )}
        {currentStation && (
          <button className="sv-btn-cancel" style={{ marginTop: 16 }} onClick={() => setStationPickerOpen(false)}>Annulla</button>
        )}
      </div>
    )
  }

  const interactive = mode === 'interattiva'

  return (
    <div className={`db-section rb-screen kt-view ${!interactive ? 'kt-view--tv' : ''}`}>
      {interactive && (
        <div className="db-section-toolbar">
          <p className="db-section-desc">Postazione: <strong>{currentStation.name}</strong> — {tickets.length} tavol{tickets.length !== 1 ? 'i' : 'o'} in corso.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <KioskLockButton
              area="cucina"
              lockedArea={kioskLock}
              pin={business.kiosk_pin}
              onLock={onKioskLockChange}
              onUnlock={() => onKioskLockChange(null)}
            />
            <button className="sv-btn-cancel" onClick={() => chooseMode('solo_schermo')}>Modalità solo schermo</button>
            {!kioskLock && <button className="sv-btn-cancel" onClick={() => setStationPickerOpen(true)}>Cambia postazione</button>}
            <button className="db-btn-primary" disabled={callSent} onClick={handleCallSala}>{callSent ? 'Chiamata inviata' : 'Chiama sala'}</button>
          </div>
        </div>
      )}

      {/* Modalità "solo schermo": il nome postazione resta un'etichetta
          informativa, MAI un pulsante — toccarlo per errore non deve
          uscire dalla modalità TV rivelando "Chiama sala"/"Cambia
          postazione" di sorpresa. Il ritorno all'interattiva è un comando
          separato, piccolo ma esplicito, sempre presente. */}
      {!interactive && (
        <div className="kt-tv-header">
          <span className="kt-tv-station-label">{currentStation.name}</span>
          {/* Da bloccato il lucchetto serve anche qui, con la sua
              indicazione: è l'unica via d'uscita, e in modalità TV non
              esiste nessun altro comando che la riveli. */}
          {kioskLock && (
            <KioskLockButton
              area="cucina"
              lockedArea={kioskLock}
              pin={business.kiosk_pin}
              onLock={onKioskLockChange}
              onUnlock={() => onKioskLockChange(null)}
            />
          )}
          <button className="kt-tv-exit" onClick={() => chooseMode('interattiva')}>
            ↩ Modalità interattiva
          </button>
        </div>
      )}

      {realtimeDown && (
        <div className="ord-offline-banner">
          Aggiornamenti in tempo reale interrotti — riconnessione in corso, lo stato si aggiorna da solo appena torna attiva.
        </div>
      )}

      {/* Totali per piatto della postazione: cosa c'è da fare adesso e
          cosa sta per arrivare. Visibili anche in modalità solo schermo,
          dove i caratteri diventano grandi insieme al resto della vista. */}
      {(dishTotals.toPrepare.length > 0 || dishTotals.incoming.length > 0) && (
        <div className="kt-totals">
          <div className="kt-total-row">
            <span className="kt-total-label">Da preparare</span>
            {dishTotals.toPrepare.length === 0 ? (
              <span className="kt-total-empty">niente in preparazione</span>
            ) : (
              <span className="kt-total-list">
                {dishTotals.toPrepare.map((d, i) => (
                  <span key={d.name} className="kt-total-item">
                    {i > 0 && <span className="kt-total-sep"> · </span>}
                    <strong>{d.qty}×</strong> {d.name}
                  </span>
                ))}
              </span>
            )}
          </div>
          {dishTotals.incoming.length > 0 && (
            <div className="kt-total-row kt-total-row--incoming">
              <span className="kt-total-label">In arrivo</span>
              <span className="kt-total-list">
                {dishTotals.incoming.map((d, i) => (
                  <span key={d.name} className="kt-total-item">
                    {i > 0 && <span className="kt-total-sep"> · </span>}
                    <strong>{d.qty}×</strong> {d.name}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}

      {loading && orders.length === 0 ? (
        <div className="sv-loading"><KtSpinner /></div>
      ) : tickets.length === 0 ? (
        <div className="db-card"><p className="db-card-empty">Nessuna comanda in corso per questa postazione.</p></div>
      ) : (
        <div className="kt-tickets">
          {tickets.map(({ order, table, bands, earliestSentAt, maxFiredAt }) => {
            const boosted = maxFiredAt != null && (tick - maxFiredAt) < RECENT_FIRE_WINDOW_MS
            return (
              <div key={order.id} className={`kt-ticket ${boosted ? 'kt-ticket--boosted' : ''}`}>
                <div className="kt-ticket-header">
                  <span className="kt-ticket-table">{table?.name ?? 'Tavolo'}</span>
                  <span className="kt-ticket-time">{formatTime(new Date(earliestSentAt).toISOString())}</span>
                </div>
                {bands.map((band, idx) => {
                  const anyWaiting = band.items.some(i => i.fire_status === 'in_attesa')
                  const anyReady   = band.items.some(i => i.kitchen_status === 'pronto')
                  return (
                    <div key={band.course?.id ?? `none-${idx}`} className={`kt-band ${courseColorClass(band.course)} ${anyWaiting ? 'kt-band--waiting' : ''}`}>
                      <div className="kt-band-header">
                        <span className="kt-band-title">{courseLabel(band.course)}</span>
                        {interactive && (
                          <div className="ord-band-actions">
                            {anyWaiting && <button className="sv-btn-cancel" onClick={() => fireBandNow(band)}>Via</button>}
                            {anyReady && <button className="sv-btn-save" onClick={() => markBandDelivered(band)}>Consegnata</button>}
                          </div>
                        )}
                      </div>
                      <div className="kt-band-items">
                        {band.items.map(item => (
                          <div
                            key={item.id}
                            className={`kt-item ${item.kitchen_status === 'pronto' ? 'kt-item--ready' : ''} ${item.kitchen_status === 'annullato' ? 'kt-item--cancelled' : ''} ${item.fire_status === 'in_attesa' ? 'kt-item--waiting' : ''}`}
                            onClick={interactive ? () => markItemReady(item) : undefined}
                          >
                            <span className="kt-item-name">{item.quantity}× {item.item_name_snapshot}</span>
                            {item.notes && <span className="kt-item-note">{item.notes}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function KtSpinner() {
  return <svg style={{ width: 18, height: 18, animation: 'sv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
