import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import {
  subscribeTableOrderItems,
  subscribeHallNotifications,
  subscribeCallSala,
  notifyReady,
} from './kitchenRealtime'
import {
  buildStateNotifications,
  buildEventNotifications,
  mergeNotifications,
  strongestAlertLevel,
} from './hallNotifications'
import { writeCachedStations } from './stationsCache'

// Codice del solo verticale 'ristorante_bar'. Vive qui e non in
// Dashboard.jsx: Dashboard si limita a montare il provider dentro il
// ramo isRestaurant, così nessun business non-ristorante scarica né
// esegue niente di tutto questo.
//
// È l'UNICO punto che legge i dati delle notifiche: ordini aperti,
// postazioni, portate e righe di hall_notifications. La pagina Notifiche
// sala e la piantina dei tavoli li ricevono dal contesto.

const ALERT_MS = 6000
const ITEMS_RELOAD_DEBOUNCE_MS = 200

export function useHallNotifications(business, { alertsSuppressed = false } = {}) {
  const businessId = business?.id ?? null

  const [orders,   setOrders]   = useState([])
  const [events,   setEvents]   = useState([])
  const [settings, setSettings] = useState({ stations: [], courses: [] })
  const [loading,  setLoading]  = useState(true)
  const [alert,    setAlert]    = useState(null) // { kind: 'pronto'|'sala', text }

  // Postazioni e portate servono anche dentro il rilevamento dei nuovi
  // avvisi, che gira dentro una callback stabile: in un ref, così quella
  // callback non cambia identità (e non ricrea le sottoscrizioni) ogni
  // volta che le impostazioni si ricaricano.
  const settingsRef = useRef(settings)

  // ECCEZIONE RICHIESTA: un dispositivo nella vista Cucina non riceve gli
  // avvisi destinati alla sala. In un ref per lo stesso motivo: cambiare
  // sezione non deve disiscrivere e riscrivere i canali.
  const suppressedRef = useRef(alertsSuppressed)
  useEffect(() => { suppressedRef.current = alertsSuppressed }, [alertsSuppressed])

  // Chiavi delle notifiche di stato già viste. null = non abbiamo ancora
  // caricato niente: al primo caricamento NON si suona, altrimenti
  // aprire la dashboard con tre portate già pronte da mezz'ora farebbe
  // partire un avviso come se fossero appena uscite.
  const knownKeysRef  = useRef(null)
  const alertTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(alertTimerRef.current), [])

  const dismissAlert = useCallback(() => {
    clearTimeout(alertTimerRef.current)
    setAlert(null)
  }, [])

  // Solo 'forte' produce banner, suono e vibrazione. 'leggero' e
  // 'nessuno' non arrivano nemmeno qui: restano nell'elenco (e 'leggero'
  // anche sulla card del tavolo), che è esattamente la differenza fra i
  // tre livelli.
  const raiseAlert = useCallback((kind, text, level) => {
    if (suppressedRef.current || level !== 'forte') return
    notifyReady()
    setAlert({ kind, text })
    clearTimeout(alertTimerRef.current)
    alertTimerRef.current = setTimeout(() => setAlert(null), ALERT_MS)
  }, [])

  const loadSettings = useCallback(async () => {
    if (!businessId) return
    const [st, cs] = await Promise.all([
      supabase.from('kitchen_stations').select('*').eq('business_id', businessId).eq('is_active', true),
      supabase.from('business_courses').select('*').eq('business_id', businessId).eq('is_active', true).order('slot_number'),
    ])
    if (st.error) console.error('[useHallNotifications/stations]', st.error)
    if (cs.error) console.error('[useHallNotifications/courses]', cs.error)
    // Nessun seeding qui: "Cucina" e le 4 portate nascono alla prima
    // apertura della gestione menu o della vista cucina (kitchenSeed.js).
    // Questo hook si limita a leggere — un terzo punto che semina
    // creerebbe righe per un business che non ha ancora aperto nessuna
    // delle due schermate.
    const next = { stations: st.data ?? [], courses: cs.data ?? [] }
    settingsRef.current = next
    setSettings(next)
    // Tiene aggiornata la copia sul dispositivo usata dalla schermata
    // Ordine quando la rete non c'è. Questo provider è montato in
    // qualunque sezione per un ristorante, quindi è il punto che vede
    // la configurazione più spesso: se il titolare marca il Bar come
    // "servito dalla sala" mentre il tablet è in sala, la copia è già
    // aggiornata al prossimo ordine, anche se nel frattempo la rete
    // salta. Solo su risposta riuscita: un errore non deve sovrascrivere
    // la copia buona (st.error è già stato stampato sopra).
    if (!st.error) writeCachedStations(businessId, next.stations)
  }, [businessId])

  // Il rilevamento dei nuovi avvisi gira QUI, nella callback che ha
  // appena ricevuto i dati, e non in un effect sul risultato calcolato:
  // così l'avviso parte una volta per ogni caricamento, con i dati di
  // quel caricamento, senza dipendere dall'ordine in cui React applica
  // gli stati.
  const announce = useCallback((nextOrders) => {
    const { stations, courses } = settingsRef.current
    const next = buildStateNotifications({ orders: nextOrders, activeStations: stations, activeCourses: courses })
    const keys = new Set(next.map((n) => n.key))
    const previous = knownKeysRef.current
    knownKeysRef.current = keys
    if (previous === null) return
    const fresh = next.filter((n) => !previous.has(n.key))
    if (fresh.length === 0) return
    const text = fresh.length === 1 ? fresh[0].text : `${fresh.length} portate da servire`
    raiseAlert('pronto', text, strongestAlertLevel(fresh.map((n) => n.alertLevel)))
  }, [raiseAlert])

  const loadOrders = useCallback(async () => {
    if (!businessId) return
    // Stesso embed della vista cucina: le due viste devono risolvere
    // portata e postazione sugli stessi dati.
    const { data, error } = await supabase
      .from('table_orders')
      .select(`
        id, table_id, status,
        tables ( name ),
        table_order_items (
          id, item_name_snapshot, quantity, sent_at, kitchen_status,
          ready_at, delivered_at, fire_status, menu_item_id,
          menu_items ( category_id, menu_categories ( id, station_id, course_id ) )
        )
      `)
      .eq('business_id', businessId)
      .eq('status', 'aperto')
    if (error) { console.error('[useHallNotifications/orders]', error); return }
    const rows = data ?? []
    setOrders(rows)
    announce(rows)
  }, [businessId, announce])

  const loadEvents = useCallback(async () => {
    if (!businessId) return
    const { data, error } = await supabase
      .from('hall_notifications')
      .select('*')
      .eq('business_id', businessId)
      .is('read_at', null)
      .order('created_at')
    if (error) { console.error('[useHallNotifications/events]', error); return }
    setEvents(data ?? [])
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    ;(async () => {
      await loadSettings()
      if (cancelled) return
      await Promise.all([loadOrders(), loadEvents()])
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [businessId, loadSettings, loadOrders, loadEvents])

  // Tempo reale. Nessun patch dal payload: ogni evento ricarica, stesso
  // principio già in uso in Cucina/Ordine/Tavoli — un evento su un
  // ordine aperto altrove e non ancora noto qui non lascerebbe mai uno
  // stato parziale.
  useEffect(() => {
    if (!businessId) return
    let itemsTimer = null
    const reloadOrdersDebounced = () => {
      clearTimeout(itemsTimer)
      itemsTimer = setTimeout(loadOrders, ITEMS_RELOAD_DEBOUNCE_MS)
    }
    const unsubItems = subscribeTableOrderItems(`hall-items-${businessId}`, reloadOrdersDebounced)
    const unsubRows  = subscribeHallNotifications(businessId, loadEvents)
    const unsubCall  = subscribeCallSala(businessId, () => {
      // L'avviso immediato resta sul broadcast, com'era prima di questo
      // blocco. La riga arriva per conto suo (INSERT -> unsubRows) e
      // popola l'elenco: qui non si suona due volte perché la riga non
      // alza nessun avviso.
      raiseAlert('sala', 'La cucina chiama la sala', 'forte')
      loadEvents()
    })
    return () => { unsubItems(); unsubRows(); unsubCall(); clearTimeout(itemsTimer) }
  }, [businessId, loadOrders, loadEvents, raiseAlert])

  const notifications = useMemo(() => mergeNotifications(
    buildStateNotifications({ orders, activeStations: settings.stations, activeCourses: settings.courses }),
    buildEventNotifications(events, settings.stations),
  ), [orders, events, settings])

  /* ── Azioni ── */

  // Tocco su una notifica di stato: la portata diventa consegnata. È la
  // stessa scrittura di "Consegnata" in Ordine e in Cucina (nessuna
  // azione nuova), per questo la riga sparisce anche da quelle schermate.
  const markStateDelivered = useCallback(async (notification) => {
    if (notification.itemIds.length === 0) return
    const { error } = await supabase
      .from('table_order_items')
      .update({ kitchen_status: 'consegnato', delivered_at: new Date().toISOString() })
      .in('id', notification.itemIds)
    if (error) { console.error('[markStateDelivered]', error); return }
    await loadOrders()
  }, [loadOrders])

  const markEventRead = useCallback(async (notification) => {
    const { error } = await supabase
      .from('hall_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notification.id)
    if (error) { console.error('[markEventRead]', error); return }
    await loadEvents()
  }, [loadEvents])

  const dismiss = useCallback((notification) => (
    notification.kind === 'stato' ? markStateDelivered(notification) : markEventRead(notification)
  ), [markStateDelivered, markEventRead])

  const reload = useCallback(async () => {
    await loadSettings()
    await Promise.all([loadOrders(), loadEvents()])
  }, [loadSettings, loadOrders, loadEvents])

  // Nessun "tableIdsToServe" qui: quali tavoli marcare dipende da quali
  // ordini la piantina sta mostrando (data e turno selezionati), che è
  // una cosa che sa solo Tavoli.jsx. Qui si espone l'elenco completo e
  // Tavoli ne ricava la sua fetta con tableIdsToServe().
  return { notifications, loading, dismiss, reload, alert, dismissAlert }
}
