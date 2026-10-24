import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSectionParams } from '../../lib/sectionParams'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { normalizePhone } from '../../lib/phone'
import { subscribeTableOrderItems } from '../../lib/kitchenRealtime'
import KioskLockButton from './KioskLockButton'
import Ordine from './Ordine'

const EMPTY_TABLE_FORM = { name: '', capacity: '' }
const EMPTY_RESERVATION_FORM = { customer_name: '', customer_phone: '', party_size: '', turn_id: '', notes: '', table_ids: [] }

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDate(str) {
  return new Date(str + 'T00:00:00')
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isToday(date) {
  return formatDate(date) === formatDate(new Date())
}

function formatDateLabel(date) {
  return date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

function turnLabel(t) {
  return t.name?.trim() || `Turno ${t.slot_number}`
}

export default function Tavoli({ business, kioskLock, onKioskLockChange }) {
  const [tables, setTables]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(null)   // null | 'add' | 'edit' (tavolo)
  const [form, setForm]           = useState(EMPTY_TABLE_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [errors, setErrors]       = useState({})

  const [confirmDeactivateId, setConfirmDeactivateId] = useState(null)
  const [busyId, setBusyId]       = useState(null)

  // Aggiunta in blocco (Task 4 Blocco B punto 7) — nomi automatici
  // "Tavolo N" in sequenza a partire dal numero di tavoli già esistenti
  // (mai da 1, per non creare doppioni di nome), capienza di default
  // uguale per tutti, che il titolare poi modifica singolarmente come già
  // fa per un tavolo aggiunto uno alla volta.
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkCount,     setBulkCount]     = useState('')
  const [bulkSaving,    setBulkSaving]    = useState(false)
  const [bulkError,     setBulkError]     = useState(null)
  const BULK_DEFAULT_CAPACITY = 4
  const BULK_MAX = 50

  /* ── Stato nell'indirizzo ──
     Data, turno e ordine aperto vivono anche nei parametri dell'URL, così
     un aggiornamento della pagina riporta esattamente dove si era (serve
     ai tablet di sala, che restano aperti per tutto il servizio). I
     parametri si leggono una volta sola all'avvio come valore iniziale e
     poi si riscrivono quando cambiano: la fonte di verità resta lo stato
     React, l'URL è il suo riflesso. Tutti gli altri parametri già presenti
     (in particolare ?s=) vengono preservati a ogni scrittura. */
  const { searchParams, isActiveSection, patchParams } = useSectionParams('tavoli')
  // Fotografia dei parametri al primo render, tenuta in uno stato e non in
  // un ref: serve leggerla durante il render (negli stati iniziali qui
  // sotto) e un ref non va letto in quella fase.
  const [initialParams] = useState(() => ({
    d: searchParams.get('d'),
    t: searchParams.get('t'),
    o: searchParams.get('o'),
  }))

  // Data in vista — di proposito non solo "oggi": il titolare deve poter
  // navigare avanti (es. per prendere una prenotazione al 15 del mese).
  // Se l'indirizzo porta una data valida, si parte da quella.
  const [selectedDate, setSelectedDate] = useState(() => {
    const fromUrl = initialParams.d
    if (fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl)) {
      const parsed = parseDate(fromUrl)
      if (!isNaN(parsed.getTime())) return parsed
    }
    return new Date()
  })

  // Turni del business (slot configurabili, es. "Pranzo"/"Cena") e turno
  // attualmente selezionato nello switch — vedi nota su reservationsByTable
  // più sotto sul perché lo stato libero/occupato dipende anche da questo.
  const [turns,          setTurns]          = useState([])
  // Dall'indirizzo se c'è: l'effect più sotto che sceglie il primo turno
  // attivo lo rispetta già, perché scatta solo se il turno corrente non è
  // più tra quelli attivi — un turno valido letto dall'URL resta.
  const [selectedTurnId, setSelectedTurnId] = useState(() => initialParams.t ?? null)
  const [turnsModalOpen, setTurnsModalOpen] = useState(false)
  const [confirmDeactivateTurnId, setConfirmDeactivateTurnId] = useState(null)
  const [busyTurnId,     setBusyTurnId]     = useState(null)
  const [addingTurn,     setAddingTurn]     = useState(false)

  // Prenotazioni confermate per la data selezionata, con i tavoli collegati
  // (embed su table_reservation_tables, stesso pattern di
  // appointment_services in Agenda.jsx). Non filtrate per turno lato query:
  // il filtro per turno avviene lato client (reservationsByTable), così
  // cambiare turno nello switch non richiede un nuovo round-trip.
  const [reservations,        setReservations]        = useState([])
  const [reservationsLoading, setReservationsLoading] = useState(false)

  const [resModal,      setResModal]      = useState(null) // null | 'add' | 'edit'
  const [resForm,       setResForm]       = useState(EMPTY_RESERVATION_FORM)
  const [editingResId,  setEditingResId]  = useState(null)
  const [resSaving,     setResSaving]     = useState(false)
  const [resErrors,     setResErrors]     = useState({})
  const [confirmCancelResId, setConfirmCancelResId] = useState(null)
  const [busyResId,     setBusyResId]     = useState(null)

  // Ordini aperti (Blocco C) — per l'ESATTA combinazione (tavolo, data,
  // turno) selezionata, stesso principio di reservations. Determina lo
  // stato OCCUPATO (vedi getTableStatus/openOrderByTable più sotto).
  const [openOrders, setOpenOrders] = useState([])
  const [activeOrder,      setActiveOrder]      = useState(null) // riga table_orders in visualizzazione, o null
  const [activeOrderTable, setActiveOrderTable] = useState(null)
  // Finché il ripristino dell'ordine dall'indirizzo non è stato tentato,
  // non si scrive nulla su o: altrimenti il primo render (activeOrder
  // ancora null) cancellerebbe il parametro prima di poterlo leggere.
  const [orderRestoreDone, setOrderRestoreDone] = useState(() => !initialParams.o)
  const orderRestoreStartedRef = useRef(false)
  const [orderActionBusyId, setOrderActionBusyId] = useState(null) // table.id con un'azione apri-ordine in corso

  const load = useCallback(async (signal = null) => {
    if (!business) return
    setLoading(true)
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at')
    if (signal?.cancelled) return
    setLoading(false)
    if (error) { console.error('[loadTables]', error); return }
    setTables(data ?? [])
  }, [business])

  const loadTurns = useCallback(async (signal = null) => {
    if (!business) return
    const { data, error } = await supabase
      .from('business_turns')
      .select('*')
      .eq('business_id', business.id)
      .order('slot_number')
    if (signal?.cancelled) return
    if (error) { console.error('[loadTurns]', error); return }
    setTurns(data ?? [])
  }, [business])

  const loadReservations = useCallback(async (signal = null) => {
    if (!business) return
    setReservationsLoading(true)
    const { data, error } = await supabase
      .from('table_reservations')
      .select('*, table_reservation_tables(table_id)')
      .eq('business_id', business.id)
      .eq('reservation_date', formatDate(selectedDate))
      .eq('status', 'confermata')
      .order('created_at')
    if (signal?.cancelled) return
    setReservationsLoading(false)
    if (error) { console.error('[loadReservations]', error); return }
    setReservations(data ?? [])
  }, [business, selectedDate])

  // Ordini aperti per la data selezionata — stesso pattern di
  // loadReservations: filtrata per order_date lato query, filtrata per
  // turn_id lato client (openOrderByTable), così cambiare turno nello
  // switch non richiede un nuovo round-trip. CORREZIONE: prima non
  // filtrava per data, rendendo un tavolo "occupato" anche navigando a
  // un giorno diverso da quello dell'ordine aperto — sbagliato, la
  // combinazione (tavolo, order_date, turn_id) deve valere esattamente
  // come per le prenotazioni, non essere un'eccezione globale.
  const loadOpenOrders = useCallback(async (signal = null) => {
    if (!business) return
    const { data, error } = await supabase
      .from('table_orders')
      .select('*')
      .eq('business_id', business.id)
      .eq('order_date', formatDate(selectedDate))
      .eq('status', 'aperto')
    if (signal?.cancelled) return
    if (error) { console.error('[loadOpenOrders]', error); return }
    setOpenOrders(data ?? [])
  }, [business, selectedDate])

  useEffect(() => {
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [load])

  useEffect(() => {
    const signal = { cancelled: false }
    loadOpenOrders(signal)
    return () => { signal.cancelled = true }
  }, [loadOpenOrders])

  // Chiusura automatica degli ordini dimenticati — regola di business:
  // un ordine aperto su un turno si chiude da solo quando arriva la
  // successiva occorrenza dello STESSO turno (es. un Pranzo di ieri
  // lasciato aperto si chiude quando si apre il Pranzo di oggi). Un turno
  // non tocca mai un turno diverso.
  //
  // Scatta SOLO se la data selezionata è davvero oggi — isToday()/
  // formatDate() usano Date locale del browser (fuso del dispositivo, che
  // per un business italiano è Europe/Rome), la STESSA funzione già usata
  // per valorizzare order_date alla creazione — mai now() lato database,
  // che è in UTC e tra mezzanotte e le 2 darebbe una data diversa da
  // quella "vissuta" dal titolare. Navigare su una data diversa da oggi
  // (futura o passata), qualunque turno, resta sempre sola lettura: nessun
  // UPDATE parte mai da questo effect in quel caso.
  //
  // Nessun aggiornamento locale di openOrders necessario dopo: gli ordini
  // chiusi qui hanno order_date precedente a oggi, quindi non facevano già
  // parte di openOrders (che carica solo order_date = selectedDate, oggi
  // in questo ramo) — sono un cleanup in background su dati non
  // visualizzati in questo momento, non uno stato da rispecchiare in UI
  // subito. Le righe in table_order_items non vengono toccate.
  useEffect(() => {
    if (!business || !selectedTurnId || !isToday(selectedDate)) return
    const todayStr = formatDate(new Date())
    supabase
      .from('table_orders')
      .update({ status: 'chiuso', closed_at: new Date().toISOString(), auto_closed: true })
      .eq('business_id', business.id)
      .eq('turn_id', selectedTurnId)
      .eq('status', 'aperto')
      .lt('order_date', todayStr)
      .then(({ error }) => { if (error) console.error('[autoCloseForgottenOrders]', error) })
  }, [business, selectedDate, selectedTurnId])

  // Evidenza visiva sulla card del tavolo quando una sua voce diventa
  // "pronto": ogni evento è mappato al tavolo tramite l'order_id già noto
  // in openOrders (table_order_items non ha table_id diretto) — se
  // l'ordine non è tra quelli in vista (data/turno diversi) non c'è nulla
  // da evidenziare qui, non è un errore. Nessun ricaricamento di
  // openOrders: lo stato libero/prenotato/occupato non dipende dal
  // contenuto delle voci, solo dall'esistenza dell'ordine aperto.
  //
  // Suono, vibrazione e banner NON stanno più qui: sono saliti a livello
  // di Dashboard.jsx, così l'avviso arriva in qualunque sezione e non
  // viene emesso due volte dalla stessa pagina. Qui resta solo
  // l'evidenza locale, che ha senso soltanto su questa griglia.
  const [readyHighlightIds, setReadyHighlightIds] = useState(() => new Set())
  useEffect(() => {
    if (!business) return
    const unsubscribe = subscribeTableOrderItems(`tavoli-ready-${business.id}`, (payload) => {
      if (payload.new?.kitchen_status !== 'pronto') return
      const relatedOrder = openOrders.find((o) => o.id === payload.new.order_id)
      if (!relatedOrder) return
      const tableId = relatedOrder.table_id
      setReadyHighlightIds((prev) => new Set(prev).add(tableId))
      setTimeout(() => setReadyHighlightIds((prev) => { const n = new Set(prev); n.delete(tableId); return n }), 6000)
    })
    return unsubscribe
  }, [business, openOrders])

  /* ── Sincronizzazione con l'indirizzo ──
     `isActiveSection` è sia guardia sia dipendenza: finché l'indirizzo
     porta ancora la sezione precedente (questo componente può essere già
     montato, vedi la nota in sectionParams.js) non si scrive niente, e
     appena l'indirizzo arriva su 'tavoli' questi effect si ri-eseguono e
     scrivono i parametri. Un solo clic basta. ── */
  useEffect(() => {
    if (!isActiveSection) return
    patchParams({ d: formatDate(selectedDate) })
  }, [isActiveSection, selectedDate, patchParams])

  useEffect(() => {
    if (!isActiveSection || !selectedTurnId) return
    patchParams({ t: selectedTurnId })
  }, [isActiveSection, selectedTurnId, patchParams])

  // Solo l'id dell'ordine: il tavolo si ricava da table_id della riga
  // ordine, non serve un secondo parametro da tenere in sincrono.
  useEffect(() => {
    if (!isActiveSection || !orderRestoreDone) return
    patchParams({ o: activeOrder?.id ?? null })
  }, [isActiveSection, orderRestoreDone, activeOrder, patchParams])

  // Ripristino dell'ordine aperto dopo un aggiornamento della pagina.
  // Aspetta che i tavoli siano caricati, perché la schermata ordine ha
  // bisogno della riga del tavolo (nome, capienza). Se l'ordine nel
  // frattempo è stato chiuso (anche dalla chiusura automatica) o non
  // esiste, si torna alla griglia senza errori: il parametro viene
  // semplicemente ripulito.
  useEffect(() => {
    if (orderRestoreDone || orderRestoreStartedRef.current) return
    const orderId = initialParams.o
    if (!orderId || !business || tables.length === 0) return
    orderRestoreStartedRef.current = true
    supabase
      .from('table_orders')
      .select('*')
      .eq('id', orderId)
      .eq('business_id', business.id)
      .eq('status', 'aperto')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[restoreOrderFromUrl]', error)
        if (data) {
          setActiveOrderTable(tables.find((t) => t.id === data.table_id) ?? null)
          setActiveOrder(data)
        }
        setOrderRestoreDone(true)
      })
  }, [orderRestoreDone, business, tables, initialParams])

  useEffect(() => {
    const signal = { cancelled: false }
    loadTurns(signal)
    return () => { signal.cancelled = true }
  }, [loadTurns])

  useEffect(() => {
    const signal = { cancelled: false }
    loadReservations(signal)
    return () => { signal.cancelled = true }
  }, [loadReservations])

  // Turno selezionato nello switch: di default il primo attivo (per
  // slot_number), ricalcolato ogni volta che la lista turni cambia — copre
  // sia il primo caricamento (selectedTurnId ancora null) sia il caso in
  // cui il turno che stava guardando l'utente venga disattivato mentre la
  // pagina è aperta.
  useEffect(() => {
    const stillActive = turns.some(t => t.id === selectedTurnId && t.is_active)
    if (!stillActive) {
      const firstActive = turns.find(t => t.is_active)
      setSelectedTurnId(firstActive ? firstActive.id : null)
    }
  }, [turns]) // eslint-disable-line

  const activeTurns = useMemo(() => turns.filter(t => t.is_active), [turns])

  // Tavolo → prenotazioni per l'ESATTA combinazione data (già filtrata
  // lato query) + turno selezionato. Da sola determina solo lo stato
  // PRENOTATO ora (Blocco C) — una prenotazione confermata significa
  // "atteso", non "seduto". Resta comunque il principio di fondo: niente è
  // mai salvato a parte, è sempre questo calcolo — lo stesso tavolo può
  // risultare senza prenotazione per un turno e con prenotazione per un
  // altro nello stesso giorno, perché sono prenotazioni diverse
  // (turn_id diverso), non un singolo stato condiviso.
  const reservationsByTable = useMemo(() => {
    const map = {}
    for (const r of reservations) {
      if (r.turn_id !== selectedTurnId) continue
      const tableIds = (r.table_reservation_tables ?? []).map(x => x.table_id)
      for (const tid of tableIds) {
        if (!map[tid]) map[tid] = []
        map[tid].push(r)
      }
    }
    return map
  }, [reservations, selectedTurnId])

  // Tavolo → ordine aperto per l'ESATTA combinazione (tavolo, data, turno)
  // selezionata — stesso identico principio di reservationsByTable, niente
  // eccezione. Il vincolo UNIQUE in DB (idx_table_orders_one_open_per_slot)
  // è scoped alla stessa identica combinazione (table_id, order_date,
  // turn_id), non solo al tavolo — coerente con la regola di business: un
  // ordine dimenticato aperto su un turno non blocca un ordine nuovo sullo
  // stesso tavolo in un turno diverso dello stesso giorno, si chiude da
  // solo alla successiva occorrenza dello STESSO turno (vedi l'effect di
  // auto-chiusura più sotto).
  const openOrderByTable = useMemo(() => {
    const map = {}
    for (const o of openOrders) {
      if (o.turn_id !== selectedTurnId) continue
      map[o.table_id] = o
    }
    return map
  }, [openOrders, selectedTurnId])

  // Tre stati, calcolati sempre al volo, mai persistiti — stesso principio
  // già in uso per libero/occupato prima di questo blocco, esteso a tre
  // valori: 'libero' | 'prenotato' | 'occupato'.
  const getTableStatus = useCallback((t) => {
    if (openOrderByTable[t.id]) return 'occupato'
    if ((reservationsByTable[t.id]?.length ?? 0) > 0) return 'prenotato'
    return 'libero'
  }, [openOrderByTable, reservationsByTable])

  /* ── Modal tavolo ── */
  const openAddTable = () => {
    setForm(EMPTY_TABLE_FORM)
    setErrors({})
    setEditingId(null)
    setModal('add')
  }

  const openEditTable = (t) => {
    setForm({ name: t.name, capacity: t.capacity != null ? String(t.capacity) : '' })
    setErrors({})
    setEditingId(t.id)
    setModal('edit')
  }

  const closeModal = () => { setModal(null); setEditingId(null) }

  const set = (field) => (e) => {
    const val = e.target.value
    setForm((f) => ({ ...f, [field]: val }))
    setErrors((er) => ({ ...er, [field]: null }))
  }

  const validate = (f) => {
    const e = {}
    if (!f.name.trim()) e.name = 'Il nome è obbligatorio.'
    if (f.capacity !== '' && (isNaN(Number(f.capacity)) || !Number.isInteger(Number(f.capacity)) || Number(f.capacity) <= 0))
      e.capacity = 'Inserisci un numero intero valido.'
    return e
  }

  const handleSave = async () => {
    const e = validate(form)
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setSaving(true)

    const payload = {
      name:     form.name.trim(),
      capacity: form.capacity !== '' ? Number(form.capacity) : null,
    }

    if (modal === 'add') {
      const { error } = await supabase.from('tables').insert({
        ...payload,
        business_id: business.id,
      })
      if (error) { console.error('[handleSave insert]', error); setSaving(false); return }
      logActivity(business.id, business.user_id, 'table_added', `Tavolo aggiunto: ${payload.name}`)
    } else {
      const { error } = await supabase.from('tables').update(payload).eq('id', editingId)
      if (error) { console.error('[handleSave update]', error); setSaving(false); return }
      logActivity(business.id, business.user_id, 'table_updated', `Tavolo modificato: ${payload.name}`)
    }

    setSaving(false)
    closeModal()
    load()
  }

  /* ── Aggiunta in blocco ── */
  const openBulkAdd = () => {
    setBulkCount('')
    setBulkError(null)
    setBulkModalOpen(true)
  }

  const handleBulkAdd = async () => {
    const n = Number(bulkCount)
    if (!Number.isInteger(n) || n <= 0 || n > BULK_MAX) {
      setBulkError(`Inserisci un numero intero tra 1 e ${BULK_MAX}.`)
      return
    }
    setBulkError(null)
    setBulkSaving(true)
    const startIndex = tables.length + 1
    const rows = Array.from({ length: n }, (_, i) => ({
      business_id: business.id,
      name:        `Tavolo ${startIndex + i}`,
      capacity:    BULK_DEFAULT_CAPACITY,
    }))
    const { error } = await supabase.from('tables').insert(rows)
    setBulkSaving(false)
    if (error) { console.error('[handleBulkAdd]', error); setBulkError('Errore durante la creazione. Riprova.'); return }
    logActivity(business.id, business.user_id, 'table_added', `${n} tavoli aggiunti in blocco`)
    setBulkModalOpen(false)
    load()
  }

  const handleQuickCapacity = async (t, rawValue) => {
    const trimmed = rawValue.trim()
    const nextCapacity = trimmed === '' ? null : Number(trimmed)
    if (trimmed !== '' && (isNaN(nextCapacity) || !Number.isInteger(nextCapacity) || nextCapacity <= 0)) return
    if (nextCapacity === (t.capacity ?? null)) return
    const { error } = await supabase.from('tables').update({ capacity: nextCapacity }).eq('id', t.id)
    if (error) { console.error('[handleQuickCapacity]', error); return }
    setTables((prev) => prev.map((x) => x.id === t.id ? { ...x, capacity: nextCapacity } : x))
  }

  const handleDeactivate = async (t) => {
    setBusyId(t.id)
    const { error } = await supabase.from('tables').update({ is_active: false }).eq('id', t.id)
    if (error) { console.error('[handleDeactivate]', error); setBusyId(null); return }
    setTables((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: false } : x))
    logActivity(business.id, business.user_id, 'table_deactivated', `Tavolo disattivato: ${t.name}`)
    setBusyId(null)
    setConfirmDeactivateId(null)
  }

  const handleReactivate = async (t) => {
    setBusyId(t.id)
    const { error } = await supabase.from('tables').update({ is_active: true }).eq('id', t.id)
    if (error) { console.error('[handleReactivate]', error); setBusyId(null); return }
    setTables((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: true } : x))
    logActivity(business.id, business.user_id, 'table_reactivated', `Tavolo riattivato: ${t.name}`)
    setBusyId(null)
  }

  /* ── Gestione turni ── */
  const handleRenameTurn = async (t, rawValue) => {
    const nextName = rawValue.trim() || null
    if (nextName === (t.name ?? null)) return
    const { error } = await supabase.from('business_turns').update({ name: nextName }).eq('id', t.id)
    if (error) { console.error('[handleRenameTurn]', error); return }
    setTurns((prev) => prev.map((x) => x.id === t.id ? { ...x, name: nextName } : x))
  }

  const handleAddTurn = async () => {
    setAddingTurn(true)
    const nextSlot = turns.length > 0 ? Math.max(...turns.map(t => t.slot_number)) + 1 : 1
    const { data, error } = await supabase
      .from('business_turns')
      .insert({ business_id: business.id, slot_number: nextSlot, name: null })
      .select('*')
      .single()
    setAddingTurn(false)
    if (error) { console.error('[handleAddTurn]', error); return }
    setTurns((prev) => [...prev, data])
  }

  const handleDeactivateTurn = async (t) => {
    setBusyTurnId(t.id)
    const { error } = await supabase.from('business_turns').update({ is_active: false }).eq('id', t.id)
    if (error) { console.error('[handleDeactivateTurn]', error); setBusyTurnId(null); return }
    setTurns((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: false } : x))
    setBusyTurnId(null)
    setConfirmDeactivateTurnId(null)
  }

  const handleReactivateTurn = async (t) => {
    setBusyTurnId(t.id)
    const { error } = await supabase.from('business_turns').update({ is_active: true }).eq('id', t.id)
    if (error) { console.error('[handleReactivateTurn]', error); setBusyTurnId(null); return }
    setTurns((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: true } : x))
    setBusyTurnId(null)
  }

  /* ── Modal prenotazione ── */
  const openAddReservation = (table) => {
    setResForm({ ...EMPTY_RESERVATION_FORM, table_ids: [table.id], turn_id: selectedTurnId ?? '' })
    setResErrors({})
    setEditingResId(null)
    setResModal('add')
  }

  const openEditReservation = (r) => {
    setResForm({
      customer_name:  r.customer_name,
      customer_phone: r.customer_phone ?? '',
      party_size:     r.party_size != null ? String(r.party_size) : '',
      turn_id:        r.turn_id ?? '',
      notes:          r.notes ?? '',
      table_ids:      (r.table_reservation_tables ?? []).map(x => x.table_id),
    })
    setResErrors({})
    setEditingResId(r.id)
    setConfirmCancelResId(null)
    setResModal('edit')
  }

  const closeReservationModal = () => {
    setResModal(null)
    setEditingResId(null)
    setConfirmCancelResId(null)
  }

  const toggleReservationTable = (tableId) => {
    setResForm((f) => {
      const already = f.table_ids.includes(tableId)
      return { ...f, table_ids: already ? f.table_ids.filter(id => id !== tableId) : [...f.table_ids, tableId] }
    })
    setResErrors((er) => ({ ...er, table_ids: null }))
  }

  const validateReservation = (f) => {
    const e = {}
    if (!f.customer_name.trim()) e.customer_name = 'Il nome è obbligatorio.'
    if (!f.turn_id) e.turn_id = 'Seleziona un turno.'
    if (f.table_ids.length === 0) e.table_ids = 'Seleziona almeno un tavolo.'
    if (f.party_size !== '' && (isNaN(Number(f.party_size)) || !Number.isInteger(Number(f.party_size)) || Number(f.party_size) <= 0))
      e.party_size = 'Numero non valido.'
    return e
  }

  // Trova o crea il contatto per il cliente della prenotazione (Correzione
  // Blocco A, collegamento al sistema clienti) — stesso identificativo già
  // usato da contacts/appointments/pets (client_phone normalizzato), non un
  // nuovo sistema di riconoscimento. Best-effort: un errore qui non deve
  // impedire il salvataggio della prenotazione, che resta l'operazione
  // primaria — solo loggato, stesso trattamento di logActivity altrove.
  const ensureContact = async (phone, name) => {
    if (!phone) return
    const { data: existing, error: findErr } = await supabase
      .from('contacts')
      .select('id')
      .eq('business_id', business.id)
      .eq('phone', phone)
      .maybeSingle()
    if (findErr) { console.error('[ensureContact find]', findErr); return }
    if (existing) return // già in rubrica, non duplicare
    const { error: insErr } = await supabase.from('contacts').insert({
      business_id: business.id,
      name,
      phone,
      source: 'ristorante',
    })
    if (insErr) console.error('[ensureContact insert]', insErr)
  }

  const handleSaveReservation = async () => {
    const e = validateReservation(resForm)
    setResErrors(e)
    if (Object.keys(e).length > 0) return
    setResSaving(true)

    const customerName  = resForm.customer_name.trim()
    const customerPhone = normalizePhone(resForm.customer_phone)

    const payload = {
      reservation_date: formatDate(selectedDate),
      turn_id:          resForm.turn_id,
      party_size:       resForm.party_size !== '' ? Number(resForm.party_size) : null,
      customer_name:    customerName,
      customer_phone:   customerPhone,
      notes:            resForm.notes.trim() || null,
    }

    let reservationId = editingResId
    if (editingResId) {
      const { error } = await supabase.from('table_reservations').update(payload).eq('id', editingResId)
      if (error) { console.error('[handleSaveReservation update]', error); setResSaving(false); return }
      logActivity(business.id, business.user_id, 'reservation_updated', `Prenotazione modificata: ${payload.customer_name}`)
    } else {
      const { data: newRes, error } = await supabase
        .from('table_reservations')
        .insert({ ...payload, business_id: business.id })
        .select('id')
        .single()
      if (error) { console.error('[handleSaveReservation insert]', error); setResSaving(false); return }
      reservationId = newRes?.id
      logActivity(business.id, business.user_id, 'reservation_added', `Prenotazione aggiunta: ${payload.customer_name}`)
    }

    // Sync tavoli collegati: delete-all + re-insert, stesso pattern di
    // appointment_services in Agenda.jsx.
    if (reservationId) {
      const { error: delErr } = await supabase.from('table_reservation_tables').delete().eq('reservation_id', reservationId)
      if (delErr) { console.error('[handleSaveReservation sync delete]', delErr); setResSaving(false); return }
      const rows = resForm.table_ids.map(tableId => ({ reservation_id: reservationId, table_id: tableId }))
      const { error: insErr } = await supabase.from('table_reservation_tables').insert(rows)
      if (insErr) { console.error('[handleSaveReservation sync insert]', insErr); setResSaving(false); return }
    }

    await ensureContact(customerPhone, customerName)

    setResSaving(false)
    closeReservationModal()
    loadReservations()
  }

  // Cancellazione: mai un DELETE reale, solo status → 'cancellata' (stesso
  // principio già applicato ai tavoli con is_active).
  const handleCancelReservation = async (r) => {
    setBusyResId(r.id)
    const { error } = await supabase.from('table_reservations').update({ status: 'cancellata' }).eq('id', r.id)
    if (error) { console.error('[handleCancelReservation]', error); setBusyResId(null); return }
    logActivity(business.id, business.user_id, 'reservation_cancelled', `Prenotazione cancellata: ${r.customer_name}`)
    setBusyResId(null)
    closeReservationModal()
    loadReservations()
  }

  /* ── Ordini (Blocco C) ── */
  const openExistingOrder = (t) => {
    const order = openOrderByTable[t.id]
    if (!order) return
    setActiveOrderTable(t)
    setActiveOrder(order)
  }

  // Da una prenotazione confermata (stato PRENOTATO → tap "Prendi ordine"):
  // turn_id copiato dalla prenotazione stessa, non dal turno selezionato
  // nello switch — i due normalmente coincidono (la prenotazione è quella
  // di questo stesso turno), ma se non coincidessero per qualche motivo la
  // fonte di verità per l'ordine resta la prenotazione che lo ha generato.
  const startOrderFromReservation = async (t, reservation) => {
    setOrderActionBusyId(t.id)
    const { data, error } = await supabase
      .from('table_orders')
      .insert({
        business_id:    business.id,
        table_id:       t.id,
        order_date:     formatDate(selectedDate),
        turn_id:        reservation.turn_id,
        reservation_id: reservation.id,
      })
      .select('*')
      .single()
    setOrderActionBusyId(null)
    if (error) { console.error('[startOrderFromReservation]', error); return }
    logActivity(business.id, business.user_id, 'table_order_opened', `Ordine aperto da prenotazione: ${t.name}`)
    setOpenOrders((prev) => [...prev, data])
    setActiveOrderTable(t)
    setActiveOrder(data)
  }

  // Walk-in: nessuna prenotazione dietro, reservation_id resta NULL —
  // turn_id preso dal turno attualmente selezionato nello switch (unica
  // fonte disponibile in questo caso).
  const startWalkInOrder = async (t) => {
    if (!selectedTurnId) return
    setOrderActionBusyId(t.id)
    const { data, error } = await supabase
      .from('table_orders')
      .insert({
        business_id:    business.id,
        table_id:       t.id,
        order_date:     formatDate(selectedDate),
        turn_id:        selectedTurnId,
        reservation_id: null,
      })
      .select('*')
      .single()
    setOrderActionBusyId(null)
    if (error) { console.error('[startWalkInOrder]', error); return }
    logActivity(business.id, business.user_id, 'table_order_opened', `Ordine aperto (walk-in): ${t.name}`)
    setOpenOrders((prev) => [...prev, data])
    setActiveOrderTable(t)
    setActiveOrder(data)
  }

  const closeOrderView = () => {
    setActiveOrder(null)
    setActiveOrderTable(null)
  }

  // Chiamato da Ordine.jsx dopo che "Chiudi tavolo" è andato a buon fine —
  // qui rimuoviamo l'ordine dalla lista degli aperti (non serve un reload,
  // la riga esiste ancora in DB con status='chiuso', solo non più "aperta")
  // e torniamo alla griglia.
  const handleOrderClosed = () => {
    if (activeOrder) {
      setOpenOrders((prev) => prev.filter((o) => o.id !== activeOrder.id))
    }
    closeOrderView()
  }

  if (!business) {
    return (
      <div className="db-section rb-screen">
        <div className="db-empty-banner">Configura prima la tua attività.</div>
      </div>
    )
  }

  const today = isToday(selectedDate)

  // Schermata ordine: sostituisce interamente la griglia tavoli quando
  // attiva (non un overlay sopra), stesso principio di una "schermata"
  // separata richiesta esplicitamente — non un modale sopra alla griglia.
  if (activeOrder) {
    return (
      <div className="db-section rb-screen">
        <Ordine
          business={business}
          order={activeOrder}
          table={activeOrderTable}
          turns={turns}
          onClose={closeOrderView}
          onOrderClosed={handleOrderClosed}
          kioskLock={kioskLock}
          onKioskLockChange={onKioskLockChange}
        />
      </div>
    )
  }

  return (
    <div className="db-section rb-screen">

      {/* Toolbar */}
      <div className="db-section-toolbar">
        <p className="db-section-desc">
          {tables.length > 0
            ? `${tables.length} tavol${tables.length !== 1 ? 'i' : 'o'} — libero, prenotato o occupato calcolato al volo per data e turno.`
            : 'Aggiungi i tavoli della tua sala.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KioskLockButton
            area="sala"
            lockedArea={kioskLock}
            pin={business.kiosk_pin}
            onLock={onKioskLockChange}
            onUnlock={() => onKioskLockChange(null)}
          />
          {!kioskLock && <button className="sv-btn-cancel" onClick={openBulkAdd}>+ Aggiungi N tavoli</button>}
          {!kioskLock && <button className="db-btn-primary" onClick={openAddTable}>+ Aggiungi tavolo</button>}
        </div>
      </div>

      {/* Navigazione data */}
      <div className="tv-date-nav">
        <button className="tv-date-nav-btn" onClick={() => setSelectedDate(d => addDays(d, -1))} aria-label="Giorno precedente">
          <IconChevronLeft />
        </button>
        <input
          className="tv-date-input"
          type="date"
          value={formatDate(selectedDate)}
          onChange={(e) => e.target.value && setSelectedDate(parseDate(e.target.value))}
        />
        <button className="tv-date-nav-btn" onClick={() => setSelectedDate(d => addDays(d, 1))} aria-label="Giorno successivo">
          <IconChevronRight />
        </button>
        {!today && (
          <button className="tv-date-today-btn" onClick={() => setSelectedDate(new Date())}>Oggi</button>
        )}
        <span className="tv-date-label">{formatDateLabel(selectedDate)}{today ? ' (oggi)' : ''}</span>
        {reservationsLoading && <TvSpinner small />}
      </div>

      {/* Switch turno */}
      <div className="tv-turn-switch">
        {activeTurns.map(t => (
          <button
            key={t.id}
            className={`tv-turn-pill ${selectedTurnId === t.id ? 'tv-turn-pill--active' : ''}`}
            onClick={() => setSelectedTurnId(t.id)}
          >
            {turnLabel(t)}
          </button>
        ))}
        <button className="tv-turn-manage-btn" onClick={() => setTurnsModalOpen(true)} title="Gestisci turni">
          <IconSettings />
        </button>
      </div>

      {activeTurns.length === 0 && (
        <div className="db-empty-banner">
          Nessun turno attivo — aggiungine uno da "Gestisci turni" per vedere e prenotare i tavoli.
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="sv-loading"><TvSpinner /></div>
      ) : tables.length === 0 ? (
        <div className="db-card">
          <p className="db-card-empty">Nessun tavolo ancora. Clicca "Aggiungi tavolo" per iniziare.</p>
        </div>
      ) : (
        <div className="tv-grid">
          {tables.map((t) => {
            if (!t.is_active) {
              return (
                <div key={t.id} className="tv-card tv-card--inactive">
                  <div className="tv-card-header">
                    <span className="tv-card-name">{t.name}</span>
                    <span className="tv-badge tv-badge--gray">Disattivato</span>
                  </div>
                  <button
                    className="tv-btn-reactivate"
                    disabled={busyId === t.id}
                    onClick={() => handleReactivate(t)}
                  >
                    {busyId === t.id ? <TvSpinner small /> : 'Riattiva'}
                  </button>
                </div>
              )
            }
            const tableReservations = reservationsByTable[t.id] ?? []
            const status = getTableStatus(t) // 'libero' | 'prenotato' | 'occupato'
            // Nomi classe CSS in inglese (free/reserved/occupied), coerenti con
            // quelli già esistenti prima di questo blocco — status resta in
            // italiano nel resto della logica/UI perché è il linguaggio del
            // dominio (vedi Cronologia in MAPPA_TECNICA_PIUM.md).
            const statusClass = status === 'occupato' ? 'tv-card--occupied'
              : status === 'prenotato' ? 'tv-card--reserved'
              : 'tv-card--free'
            const statusIcon = status === 'occupato' ? <IconStatusOccupied />
              : status === 'prenotato' ? <IconStatusReserved />
              : <IconStatusFree />
            const cardTitle = status === 'occupato' ? "Clicca per aprire l'ordine" : 'Clicca per prenotare questo tavolo'
            const handleCardClick = () => {
              if (status === 'occupato') { openExistingOrder(t); return }
              openAddReservation(t)
            }
            return (
              <div
                key={t.id}
                className={`tv-card tv-card--clickable ${statusClass} ${readyHighlightIds.has(t.id) ? 'tv-card--ready-pulse' : ''}`}
                onClick={handleCardClick}
                title={cardTitle}
              >
                <div className="tv-card-header">
                  <span className="tv-card-title">
                    <span className="tv-status-icon" aria-hidden="true">{statusIcon}</span>
                    <span className="tv-card-name">{t.name}</span>
                  </span>
                  <button className="tv-icon-btn" title="Modifica tavolo" onClick={(e) => { e.stopPropagation(); openEditTable(t) }}>
                    <IconEdit />
                  </button>
                </div>

                <label className="tv-capacity-row" onClick={(e) => e.stopPropagation()}>
                  <span className="tv-capacity-label">Persone</span>
                  <input
                    className="tv-capacity-input"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue={t.capacity ?? ''}
                    placeholder="—"
                    onBlur={(e) => handleQuickCapacity(t, e.target.value)}
                  />
                </label>

                {status === 'occupato' ? (
                  /* Ordine aperto: priorità assoluta sulla visualizzazione,
                     nessuna prenotazione mostrata qui (vedi nota su
                     openOrderByTable più sopra). */
                  <button
                    type="button"
                    className="tv-order-btn"
                    onClick={(e) => { e.stopPropagation(); openExistingOrder(t) }}
                  >
                    Apri ordine
                  </button>
                ) : tableReservations.length > 0 ? (
                  <>
                    {/* Prenotazioni per l'esatta combinazione data+turno selezionata —
                        a colpo d'occhio, mai da aprire nulla per vederle. Può essercene
                        più di una sullo stesso tavolo/data/turno (nessun controllo di
                        doppia prenotazione, come deciso). */}
                    <div className="tv-reservations">
                      {tableReservations.map(r => (
                        <button
                          key={r.id}
                          type="button"
                          className="tv-reservation-chip"
                          onClick={(e) => { e.stopPropagation(); openEditReservation(r) }}
                        >
                          <span className="tv-reservation-name">{r.customer_name}</span>
                          {r.party_size != null && <span className="tv-reservation-size">{r.party_size}p</span>}
                        </button>
                      ))}
                    </div>
                    {/* "Prendi ordine" solo per oggi — non ha senso aprire un ordine
                        reale per una data futura, nessuno è fisicamente al tavolo.
                        Con più prenotazioni sullo stesso tavolo/turno (edge case, non
                        prevenuto) usa la prima trovata. */}
                    {today && (
                      <button
                        type="button"
                        className="tv-order-btn"
                        disabled={orderActionBusyId === t.id}
                        onClick={(e) => { e.stopPropagation(); startOrderFromReservation(t, tableReservations[0]) }}
                      >
                        {orderActionBusyId === t.id ? <TvSpinner small /> : 'Prendi ordine'}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="tv-no-reservation">Nessuna prenotazione</p>
                    {/* Walk-in: percorso alternativo alla prenotazione per un tavolo
                        libero, solo per oggi e solo se c'è un turno selezionato (serve
                        per valorizzare table_orders.turn_id). */}
                    {today && selectedTurnId && (
                      <button
                        type="button"
                        className="tv-walkin-btn"
                        disabled={orderActionBusyId === t.id}
                        onClick={(e) => { e.stopPropagation(); startWalkInOrder(t) }}
                      >
                        {orderActionBusyId === t.id ? <TvSpinner small /> : 'Walk-in: apri ordine'}
                      </button>
                    )}
                  </>
                )}

                {confirmDeactivateId === t.id ? (
                  <div className="tv-confirm-row" onClick={(e) => e.stopPropagation()}>
                    <span className="tv-confirm-label">Disattivare?</span>
                    <button
                      className="tv-icon-btn tv-icon-btn--danger"
                      disabled={busyId === t.id}
                      onClick={() => handleDeactivate(t)}
                    >
                      {busyId === t.id ? <TvSpinner small /> : <IconCheck />}
                    </button>
                    <button className="tv-icon-btn" onClick={() => setConfirmDeactivateId(null)}>
                      <IconX />
                    </button>
                  </div>
                ) : (
                  <button
                    className="tv-btn-deactivate"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeactivateId(t.id) }}
                  >
                    Disattiva
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal tavolo (add/edit) */}
      {modal && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">{modal === 'add' ? 'Nuovo tavolo' : 'Modifica tavolo'}</h2>
              <button className="sv-modal-close" onClick={closeModal} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <div className="sv-field">
                <label className="sv-label" htmlFor="tv-name">Nome/numero <span className="sv-required">*</span></label>
                <input
                  id="tv-name"
                  className={`sv-input ${errors.name ? 'sv-input--error' : ''}`}
                  type="text"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="es. Tavolo 3"
                  autoFocus
                />
                {errors.name && <p className="sv-field-error">{errors.name}</p>}
              </div>

              <div className="sv-field sv-field--half">
                <label className="sv-label" htmlFor="tv-capacity">Capienza <span className="sv-optional">(facoltativo)</span></label>
                <input
                  id="tv-capacity"
                  className={`sv-input ${errors.capacity ? 'sv-input--error' : ''}`}
                  type="number"
                  min="1"
                  step="1"
                  value={form.capacity}
                  onChange={set('capacity')}
                  placeholder="es. 4"
                />
                {errors.capacity && <p className="sv-field-error">{errors.capacity}</p>}
              </div>
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={closeModal}>Annulla</button>
              <button className="sv-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? <TvSpinner small /> : null}
                {saving ? 'Salvataggio…' : modal === 'add' ? 'Aggiungi' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aggiunta in blocco */}
      {bulkModalOpen && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && setBulkModalOpen(false)}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Aggiungi più tavoli</h2>
              <button className="sv-modal-close" onClick={() => setBulkModalOpen(false)} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <div className="sv-field">
                <label className="sv-label" htmlFor="tv-bulk-count">Quanti tavoli?</label>
                <input
                  id="tv-bulk-count"
                  className={`sv-input ${bulkError ? 'sv-input--error' : ''}`}
                  type="number"
                  min="1"
                  max={BULK_MAX}
                  step="1"
                  value={bulkCount}
                  onChange={(e) => { setBulkCount(e.target.value); setBulkError(null) }}
                  placeholder="es. 10"
                  autoFocus
                />
                {bulkError && <p className="sv-field-error">{bulkError}</p>}
                <p className="sv-field-hint">
                  Crea "Tavolo {tables.length + 1}", "Tavolo {tables.length + 2}"… con capienza {BULK_DEFAULT_CAPACITY} di default — modificabile singolarmente dopo.
                </p>
              </div>
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={() => setBulkModalOpen(false)}>Annulla</button>
              <button className="sv-btn-save" onClick={handleBulkAdd} disabled={bulkSaving}>
                {bulkSaving ? <TvSpinner small /> : null}
                {bulkSaving ? 'Creazione…' : 'Crea tavoli'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal gestione turni */}
      {turnsModalOpen && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && setTurnsModalOpen(false)}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Turni</h2>
              <button className="sv-modal-close" onClick={() => setTurnsModalOpen(false)} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <div className="sv-list">
                {turns.map(t => (
                  <div key={t.id} className={`sv-row ${!t.is_active ? 'sv-row--inactive' : ''}`}>
                    <div className="sv-row-main">
                      <input
                        className="sv-input"
                        type="text"
                        defaultValue={t.name ?? ''}
                        placeholder={`Turno ${t.slot_number}`}
                        disabled={!t.is_active}
                        onBlur={(e) => handleRenameTurn(t, e.target.value)}
                      />
                    </div>
                    <div className="sv-row-actions">
                      {!t.is_active ? (
                        <button className="tv-btn-reactivate" disabled={busyTurnId === t.id} onClick={() => handleReactivateTurn(t)}>
                          {busyTurnId === t.id ? <TvSpinner small /> : 'Riattiva'}
                        </button>
                      ) : confirmDeactivateTurnId === t.id ? (
                        <div className="tv-confirm-row">
                          <span className="tv-confirm-label">Disattivare?</span>
                          <button className="tv-icon-btn tv-icon-btn--danger" disabled={busyTurnId === t.id} onClick={() => handleDeactivateTurn(t)}>
                            {busyTurnId === t.id ? <TvSpinner small /> : <IconCheck />}
                          </button>
                          <button className="tv-icon-btn" onClick={() => setConfirmDeactivateTurnId(null)}><IconX /></button>
                        </div>
                      ) : (
                        <button className="tv-btn-deactivate" onClick={() => setConfirmDeactivateTurnId(t.id)}>Disattiva</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button className="db-btn-primary" style={{ marginTop: 12 }} onClick={handleAddTurn} disabled={addingTurn}>
                {addingTurn ? <TvSpinner small /> : null} + Aggiungi turno
              </button>
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={() => setTurnsModalOpen(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal prenotazione (add/edit) */}
      {resModal && (
        <ReservationModal
          mode={resModal}
          date={selectedDate}
          business={business}
          turns={activeTurns}
          form={resForm}
          setForm={setResForm}
          errors={resErrors}
          setErrors={setResErrors}
          tables={tables.filter(t => t.is_active)}
          onToggleTable={toggleReservationTable}
          onClose={closeReservationModal}
          onSave={handleSaveReservation}
          saving={resSaving}
          confirmCancel={confirmCancelResId === editingResId}
          onAskCancel={() => setConfirmCancelResId(editingResId)}
          onCancelCancel={() => setConfirmCancelResId(null)}
          onConfirmCancel={() => handleCancelReservation({ id: editingResId, customer_name: resForm.customer_name })}
          busyCancelling={busyResId === editingResId}
        />
      )}
    </div>
  )
}

/* ── Modale prenotazione — sotto-componente separato per leggibilità, non
   un file a parte: stesso principio di BusinessDrawer in Admin.jsx. ── */
function ReservationModal({
  mode, date, business, turns, form, setForm, errors, setErrors, tables, onToggleTable,
  onClose, onSave, saving, confirmCancel, onAskCancel, onCancelCancel, onConfirmCancel, busyCancelling,
}) {
  const set = (field) => (e) => {
    const val = e.target.value
    setForm((f) => ({ ...f, [field]: val }))
    setErrors((er) => ({ ...er, [field]: null }))
  }

  // Ricerca cliente esistente digitando nome (come Agenda.jsx/handleNameChange)
  // O telefono nello stesso campo — sul campo "Cliente", non "Telefono": è lì
  // che un utente si aspetta l'autocomplete, per analogia col resto dell'app.
  // Stesso pattern debounced di handleNameChange, con l'aggiunta della ricerca
  // per telefono (Agenda.jsx cerca solo per nome sul proprio campo): merge di
  // contacts + appointments per non perdere clienti mai salvati in rubrica,
  // deduplicati per telefono.
  const [nameResults,         setNameResults]         = useState([])
  const [nameDropdownVisible, setNameDropdownVisible] = useState(false)
  const nameSearchTimerRef = useRef(null)

  const handleNameSearchChange = (e) => {
    const val = e.target.value
    setForm((f) => ({ ...f, customer_name: val }))
    setErrors((er) => ({ ...er, customer_name: null }))
    clearTimeout(nameSearchTimerRef.current)
    const term = val.trim()
    if (term.length < 2) { setNameResults([]); setNameDropdownVisible(false); return }
    nameSearchTimerRef.current = setTimeout(async () => {
      try {
        const safeTerm = term.replace(/,/g, '') // "," è il separatore di .or(), non ammesso nel termine
        const [{ data: cts }, { data: apts }] = await Promise.all([
          supabase.from('contacts')
            .select('name, phone')
            .eq('business_id', business.id)
            .or(`name.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%`)
            .order('name')
            .limit(8),
          supabase.from('appointments')
            .select('client_name, client_phone')
            .eq('business_id', business.id)
            .or(`client_name.ilike.%${safeTerm}%,client_phone.ilike.%${safeTerm}%`)
            .order('client_name')
            .limit(8),
        ])
        const seen = new Map()
        for (const ct of (cts ?? [])) {
          const key = ct.phone?.replace(/\s+/g, '') || '__' + ct.name.trim().toLowerCase()
          if (!seen.has(key)) seen.set(key, { name: ct.name, phone: ct.phone ?? null })
        }
        for (const apt of (apts ?? [])) {
          const key = apt.client_phone?.replace(/\s+/g, '') || '__' + apt.client_name.trim().toLowerCase()
          if (!seen.has(key)) seen.set(key, { name: apt.client_name, phone: apt.client_phone ?? null })
        }
        const results = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8)
        setNameResults(results)
        setNameDropdownVisible(results.length > 0)
      } catch { /* silently fail, stessa politica di handleNameChange in Agenda.jsx */ }
    }, 200)
  }

  const selectNameSuggestion = (s) => {
    setForm((f) => ({ ...f, customer_name: s.name, customer_phone: s.phone ?? f.customer_phone }))
    setErrors((er) => ({ ...er, customer_name: null, customer_phone: null }))
    setNameResults([])
    setNameDropdownVisible(false)
  }

  return (
    <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sv-modal">
        <div className="sv-modal-header">
          <h2 className="sv-modal-title">
            {mode === 'add' ? 'Nuova prenotazione' : 'Modifica prenotazione'}
            <span className="tv-modal-date"> — {formatDateLabel(date)}</span>
          </h2>
          <button className="sv-modal-close" onClick={onClose} aria-label="Chiudi"><IconX /></button>
        </div>

        <div className="sv-modal-body">
          <div className="sv-field" style={{ position: 'relative' }}>
            <label className="sv-label" htmlFor="tvr-name">Cliente <span className="sv-required">*</span></label>
            <input
              id="tvr-name"
              className={`sv-input ${errors.customer_name ? 'sv-input--error' : ''}`}
              type="text"
              value={form.customer_name}
              onChange={handleNameSearchChange}
              onBlur={() => setTimeout(() => setNameDropdownVisible(false), 150)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setNameResults([]); setNameDropdownVisible(false) } }}
              placeholder="es. Mario Rossi — o cerca per telefono"
              autoComplete="off"
              autoFocus
            />
            {errors.customer_name && <p className="sv-field-error">{errors.customer_name}</p>}
            {nameDropdownVisible && nameResults.length > 0 && (
              <div className="ag-suggest-dropdown">
                {nameResults.map((s, i) => (
                  <div key={i} className="ag-suggest-item" onMouseDown={() => selectNameSuggestion(s)}>
                    <span className="ag-suggest-name">{s.name}</span>
                    {s.phone && <span className="ag-suggest-phone">{s.phone}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sv-fields-row">
            <div className="sv-field">
              <label className="sv-label" htmlFor="tvr-turn">Turno <span className="sv-required">*</span></label>
              <select
                id="tvr-turn"
                className={`sv-input sv-select ${errors.turn_id ? 'sv-input--error' : ''}`}
                value={form.turn_id}
                onChange={set('turn_id')}
              >
                <option value="">— Seleziona —</option>
                {turns.map(t => (
                  <option key={t.id} value={t.id}>{turnLabel(t)}</option>
                ))}
              </select>
              {errors.turn_id && <p className="sv-field-error">{errors.turn_id}</p>}
              {turns.length === 0 && (
                <p className="sv-field-hint">Nessun turno attivo — configuralo da "Gestisci turni".</p>
              )}
            </div>
            <div className="sv-field">
              <label className="sv-label" htmlFor="tvr-size">Persone <span className="sv-optional">(facoltativo)</span></label>
              <input
                id="tvr-size"
                className={`sv-input ${errors.party_size ? 'sv-input--error' : ''}`}
                type="number"
                min="1"
                step="1"
                value={form.party_size}
                onChange={set('party_size')}
                placeholder="es. 4"
              />
              {errors.party_size && <p className="sv-field-error">{errors.party_size}</p>}
            </div>
          </div>

          <div className="sv-field">
            <label className="sv-label" htmlFor="tvr-phone">Telefono <span className="sv-optional">(facoltativo)</span></label>
            <input
              id="tvr-phone"
              className="sv-input"
              type="text"
              value={form.customer_phone}
              onChange={set('customer_phone')}
              placeholder="es. 333 1234567"
            />
          </div>

          <div className="sv-field">
            <label className="sv-label">Tavoli <span className="sv-required">*</span> <span className="sv-optional">(seleziona più tavoli per unirli)</span></label>
            <div className="tv-table-picker">
              {tables.map(t => {
                const checked = form.table_ids.includes(t.id)
                return (
                  <label key={t.id} className={`tv-table-pick ${checked ? 'tv-table-pick--active' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => onToggleTable(t.id)} />
                    {t.name}{t.capacity != null ? ` (${t.capacity}p)` : ''}
                  </label>
                )
              })}
            </div>
            {errors.table_ids && <p className="sv-field-error">{errors.table_ids}</p>}
          </div>

          <div className="sv-field">
            <label className="sv-label" htmlFor="tvr-notes">Note <span className="sv-optional">(facoltativo)</span></label>
            <textarea
              id="tvr-notes"
              className="sv-textarea"
              value={form.notes}
              onChange={set('notes')}
              placeholder="Allergie, richieste particolari…"
              rows={2}
            />
          </div>
        </div>

        <div className="sv-modal-footer">
          {mode === 'edit' && (
            confirmCancel ? (
              <div className="tv-confirm-row" style={{ marginRight: 'auto' }}>
                <span className="tv-confirm-label">Cancellare la prenotazione?</span>
                <button className="tv-icon-btn tv-icon-btn--danger" disabled={busyCancelling} onClick={onConfirmCancel}>
                  {busyCancelling ? <TvSpinner small /> : <IconCheck />}
                </button>
                <button className="tv-icon-btn" onClick={onCancelCancel}><IconX /></button>
              </div>
            ) : (
              <button className="tv-btn-deactivate" style={{ marginRight: 'auto' }} onClick={onAskCancel}>
                Cancella prenotazione
              </button>
            )
          )}
          <button className="sv-btn-cancel" onClick={onClose}>Chiudi</button>
          <button className="sv-btn-save" onClick={onSave} disabled={saving}>
            {saving ? <TvSpinner small /> : null}
            {saving ? 'Salvataggio…' : mode === 'add' ? 'Prenota' : 'Salva modifiche'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Icons ── */
function IconEdit()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
// Forma diversa per stato, non solo colore — un cerchio con spunta (outline)
// per libero, un segnalibro pieno per prenotato, una sagoma persona piena
// per occupato: tre glifi distinguibili anche senza percepire il colore
// (accessibilità).
function IconStatusFree()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8 12.5 10.5 15 16 9"/></svg> }
function IconStatusReserved() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 2a2 2 0 0 0-2 2v18l8-5.5 8 5.5V4a2 2 0 0 0-2-2z"/></svg> }
function IconStatusOccupied() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="7" r="4"/><path d="M12 13c-4.42 0-8 2.91-8 6.5V21h16v-1.5c0-3.59-3.58-6.5-8-6.5z"/></svg> }
function IconCheck() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconX()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconChevronLeft()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> }
function IconChevronRight() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg> }
function IconSettings() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
function TvSpinner({ small }) {
  const s = small ? 14 : 18
  return <svg style={{ width: s, height: s, animation: 'sv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
