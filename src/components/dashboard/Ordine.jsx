import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { groupItemsByCourse } from '../../lib/kitchenRouting'
import { subscribeTableOrderItems } from '../../lib/kitchenRealtime'
import { loadCostBook, resolveCostSnapshot } from '../../lib/stock'
import KioskLockButton from './KioskLockButton'

function turnLabel(t) {
  if (!t) return ''
  return t.name?.trim() || `Turno ${t.slot_number}`
}

function courseLabel(c) {
  if (!c) return 'Senza portata'
  return c.name?.trim() || `Portata ${c.slot_number}`
}

function kitchenStatusLabel(s) {
  return { da_preparare: 'Da preparare', pronto: 'Pronto', consegnato: 'Consegnato', annullato: 'Annullato' }[s] ?? s
}

function formatPrice(n) {
  return `€${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Toglie dalla riga i campi che sono un embed di lettura (menu_items/
// menu_categories, aggiunti dalla select per risolvere la portata — vedi
// kitchenRouting.js), mai colonne reali di table_order_items: scriverli
// dritti su un insert/upsert farebbe fallire la chiamata.
function stripEmbeds(row) {
  const { menu_items: _menu_items, ...rest } = row
  return rest
}

// Schermata ordine (Blocco C, esteso nel Blocco D con invio in cucina,
// portate/attesa/via, protezione offline) — sostituisce interamente la
// griglia tavoli mentre è aperta (vedi Tavoli.jsx), non un modale sopra di
// essa. Montata solo indirettamente dietro il gate su
// vertical='ristorante_bar': non ha un proprio controllo perché è importata
// staticamente solo da Tavoli.jsx, che è già React.lazy() e già gated in
// Dashboard.jsx.
export default function Ordine({ business, order, table, turns, onClose, onOrderClosed, kioskLock, onKioskLockChange }) {
  const [items,        setItems]        = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)

  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [gridItems,   setGridItems]   = useState([])
  const [gridLoading, setGridLoading] = useState(false)
  const searchTimerRef = useRef(null)

  const [activeCourses, setActiveCourses] = useState([])

  // Libro dei costi (Blocco E): track_stock/estimated_cost/vat_rate e
  // costo dell'ultimo carico per ogni prodotto. Caricato in anticipo, non
  // interrogato al momento dell'invio, perché l'invio deve poter comporre
  // la riga completa anche senza rete — la coda offline la salverà da sola.
  const [costBook, setCostBook] = useState({})

  const [closeConfirm, setCloseConfirm] = useState(false)
  const [closing,      setClosing]      = useState(false)

  const turn = useMemo(() => turns.find(t => t.id === order.turn_id) ?? null, [turns, order.turn_id])

  /* ── Protezione dalle cadute di rete ──────────────────────────────────
     Coda locale (outbox) per ogni voce: ogni modifica (aggiunta, quantità,
     nota, invio, via, consegnata, annulla) aggiorna PRIMA lo stato locale,
     poi tenta subito il salvataggio via upsert-per-id (id generato lato
     client, riusato a ogni retry — una violazione di chiave primaria
     equivarrebbe a "già salvata", ma con upsert non si presenta nemmeno: un
     retry con lo stesso id scrive semplicemente lo stato più recente).
     Se il salvataggio fallisce la voce resta in outboxRef con l'id ancora in
     pendingIds (badge "in attesa di rete" + blocco invio), riprovata da sola
     al prossimo evento 'online' o al giro dell'intervallo di retry — mai
     serve ritoccare la voce. Una cancellazione (quantity a 0 o "annulla")
     converte l'eventuale upsert ancora in coda in un delete, mai lo scarta:
     se l'insert non era mai arrivato al server il delete è un no-op
     innocuo, se invece era arrivato (solo l'ack è andato perso) il delete
     lo rimuove davvero — corretto in entrambi i casi. */
  const outboxRef = useRef(new Map()) // id -> { type: 'upsert', row } | { type: 'delete' }
  const flushingRef = useRef(false)
  const [pendingIds, setPendingIds] = useState(() => new Set())
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)

  const flushOutbox = useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    for (const id of Array.from(outboxRef.current.keys())) {
      const op = outboxRef.current.get(id)
      if (!op) continue
      const { error } = op.type === 'upsert'
        ? await supabase.from('table_order_items').upsert(op.row, { onConflict: 'id' })
        : await supabase.from('table_order_items').delete().eq('id', id)
      if (error) { flushingRef.current = false; return } // rete probabilmente ancora giù, riprovato dopo
      // Rimuovi dalla coda solo se nessuna nuova modifica è arrivata nel
      // frattempo (stessa istanza dell'op appena processata) — altrimenti
      // una modifica arrivata durante l'invio andrebbe persa dalla coda.
      if (outboxRef.current.get(id) === op) {
        outboxRef.current.delete(id)
        setPendingIds((prev) => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n })
      }
    }
    flushingRef.current = false
  }, [])

  const enqueueUpsert = useCallback((id, row) => {
    outboxRef.current.set(id, { type: 'upsert', row: stripEmbeds(row) })
    setPendingIds((prev) => new Set(prev).add(id))
    flushOutbox()
  }, [flushOutbox])

  const enqueueDelete = useCallback((id) => {
    outboxRef.current.set(id, { type: 'delete' })
    setPendingIds((prev) => new Set(prev).add(id))
    flushOutbox()
  }, [flushOutbox])

  const loadItems = useCallback(async (signal = null) => {
    setItemsLoading(true)
    const { data, error } = await supabase
      .from('table_order_items')
      .select('*, menu_items(category_id, menu_categories(id, course_id))')
      .eq('order_id', order.id)
      .order('created_at')
    if (signal?.cancelled) return
    setItemsLoading(false)
    if (error) { console.error('[loadItems]', error); return }
    setItems(data ?? [])
  }, [order.id])

  const loadCategories = useCallback(async (signal = null) => {
    const { data, error } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('sort_order')
    if (signal?.cancelled) return
    if (error) { console.error('[loadCategories]', error); return }
    setCategories(data ?? [])
  }, [business])

  const loadCourses = useCallback(async (signal = null) => {
    const { data, error } = await supabase
      .from('business_courses')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('slot_number')
    if (signal?.cancelled) return
    if (error) { console.error('[loadCourses]', error); return }
    setActiveCourses(data ?? [])
  }, [business])

  // Griglia piatti: ricerca fuzzy per nome (ilike, indice trigram
  // idx_menu_items_name_trgm) + filtro categoria, solo piatti disponibili.
  // menu_categories(id, course_id) incluso per poter risolvere la portata
  // di una voce appena aggiunta senza un round-trip in più (vedi addItem).
  const loadGrid = useCallback(async (term, categoryId, signal = null) => {
    setGridLoading(true)
    let q = supabase.from('menu_items')
      .select('id, name, price, category_id, menu_categories(id, course_id)')
      .eq('business_id', business.id)
      .eq('is_available', true)
    if (categoryId) q = q.eq('category_id', categoryId)
    const trimmed = term.trim()
    if (trimmed) q = q.ilike('name', `%${trimmed}%`)
    const { data, error } = await q.order('name').limit(100)
    if (signal?.cancelled) return
    setGridLoading(false)
    if (error) { console.error('[loadGrid]', error); return }
    setGridItems(data ?? [])
  }, [business])

  useEffect(() => {
    const signal = { cancelled: false }
    loadItems(signal)
    return () => { signal.cancelled = true }
  }, [loadItems])

  useEffect(() => {
    const signal = { cancelled: false }
    loadCategories(signal)
    return () => { signal.cancelled = true }
  }, [loadCategories])

  useEffect(() => {
    const signal = { cancelled: false }
    loadCourses(signal)
    return () => { signal.cancelled = true }
  }, [loadCourses])

  useEffect(() => {
    const signal = { cancelled: false }
    loadCostBook(business.id).then((book) => {
      if (signal.cancelled) return
      setCostBook(book)
    })
    return () => { signal.cancelled = true }
  }, [business.id])

  useEffect(() => {
    const signal = { cancelled: false }
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => loadGrid(searchTerm, selectedCategoryId, signal), 150)
    return () => { signal.cancelled = true; clearTimeout(searchTimerRef.current) }
  }, [searchTerm, selectedCategoryId, loadGrid])

  // Indicatore offline + riconciliazione: al ritorno online ritenta subito
  // la coda E ricarica lo stato completo dal DB (mai restare con dati
  // vecchi/parziali dopo un'interruzione).
  useEffect(() => {
    const onOnline  = () => { setIsOffline(false); flushOutbox(); loadItems() }
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [flushOutbox, loadItems])

  // Rete che sembra ok ma il salvataggio fallisce comunque (proxy, server
  // momentaneamente irraggiungibile...): un ritentativo periodico finché
  // c'è qualcosa in coda, oltre al solo evento 'online' del browser.
  useEffect(() => {
    if (pendingIds.size === 0) return
    const t = setInterval(flushOutbox, 4000)
    return () => clearInterval(t)
  }, [pendingIds.size, flushOutbox])

  // Tempo reale: qualunque cambiamento su una voce di QUESTO ordine
  // (arrivato da un altro dispositivo, dalla cucina, o da questo stesso
  // dispositivo tramite un altro tab) ricarica lo stato completo — mai un
  // patch dal payload, stesso principio della riconnessione. Se la voce
  // diventa 'pronto', avviso (vibrazione+suono) ed evidenza visiva.
  const [readyPulse, setReadyPulse] = useState(false)
  const [realtimeDown, setRealtimeDown] = useState(false)
  const wasSubscribedRef = useRef(false)
  useEffect(() => {
    const unsubscribe = subscribeTableOrderItems(
      `order-items-${order.id}`,
      (payload) => {
        const orderId = payload.new?.order_id ?? payload.old?.order_id
        if (orderId !== order.id) return
        // Solo l'evidenza visiva locale: suono, vibrazione e banner sono
        // saliti a livello di Dashboard.jsx, così l'avviso arriva in
        // qualunque sezione e non viene emesso due volte da questa pagina.
        if (payload.new?.kitchen_status === 'pronto') {
          setReadyPulse(true)
          setTimeout(() => setReadyPulse(false), 3000)
        }
        loadItems()
      },
      (status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeDown(false)
          if (wasSubscribedRef.current) loadItems() // riconnessione dopo una caduta, non il primo aggancio
          wasSubscribedRef.current = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeDown(true)
        }
      }
    )
    return unsubscribe
  }, [order.id, loadItems])

  const composingItems = useMemo(() => items.filter(i => !i.sent_at), [items])
  const sentItems       = useMemo(() => items.filter(i => i.sent_at), [items])
  const sentBands        = useMemo(() => groupItemsByCourse(sentItems, activeCourses), [sentItems, activeCourses])
  const composingGroups  = useMemo(() => groupItemsByCourse(composingItems, activeCourses), [composingItems, activeCourses])

  const orderedQtyByMenuItemId = useMemo(() => {
    const map = {}
    for (const i of items) {
      if (!i.menu_item_id || i.kitchen_status === 'annullato') continue
      map[i.menu_item_id] = (map[i.menu_item_id] ?? 0) + i.quantity
    }
    return map
  }, [items])

  // Il conto esclude le voci annullate.
  const total = useMemo(() => {
    return items
      .filter(i => i.kitchen_status !== 'annullato')
      .reduce((sum, i) => sum + (Number(i.price_snapshot) || 0) * i.quantity, 0)
  }, [items])

  const findRowForMenuItem = (menuItemId) => composingItems.find(i => i.menu_item_id === menuItemId)

  // Tap su un piatto in griglia: se è già nell'ordine E ANCORA IN
  // COMPOSIZIONE, incrementa la riga esistente; altrimenti inserisce una
  // nuova riga (anche se lo stesso piatto è già stato inviato in cucina in
  // un'altra riga — righe indipendenti, mai un update su una riga già
  // inviata). Righe indipendenti per ogni nuovo inserimento (Blocco C punto
  // 6): due camerieri che aggiungono lo STESSO piatto per la prima volta
  // nello stesso istante ottengono due insert separati, mai una race su un
  // unico update.
  const addItem = (menuItem) => {
    const existing = findRowForMenuItem(menuItem.id)
    if (existing) { bumpQuantity(existing, 1); return }
    const id = crypto.randomUUID()
    const row = {
      id,
      order_id:           order.id,
      menu_item_id:        menuItem.id,
      item_name_snapshot:  menuItem.name,
      price_snapshot:      menuItem.price,
      quantity:            1,
      notes:               null,
      sent_at:             null,
      kitchen_status:      'da_preparare',
      ready_at:            null,
      delivered_at:        null,
      fire_status:         'subito',
      fired_at:            null,
      menu_items:          { category_id: menuItem.category_id, menu_categories: menuItem.menu_categories ?? null },
    }
    setItems((prev) => [...prev, row])
    enqueueUpsert(id, row)
  }

  // delta positivo o negativo su una riga in composizione (id conosciuto
  // localmente) — quantity<=0 cancella la riga invece di scrivere 0 o
  // negativo, non ha senso una riga d'ordine a quantità zero. Solo voci non
  // ancora inviate: le voci inviate non sono più modificabili in quantità
  // (vedi cancelSentItem per l'unica azione possibile su quelle).
  const bumpQuantity = (row, delta) => {
    const nextQty = row.quantity + delta
    if (nextQty <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== row.id))
      outboxRef.current.delete(row.id) // se era ancora solo locale, niente da annullare in coda
      enqueueDelete(row.id)
      return
    }
    const nextRow = { ...row, quantity: nextQty }
    setItems((prev) => prev.map((i) => i.id === row.id ? nextRow : i))
    enqueueUpsert(row.id, nextRow)
  }

  const updateNotes = (row, rawValue) => {
    const notes = rawValue.trim() || null
    if (notes === (row.notes ?? null)) return
    const nextRow = { ...row, notes }
    setItems((prev) => prev.map((i) => i.id === row.id ? nextRow : i))
    enqueueUpsert(row.id, nextRow)
  }

  /* ── Invio in cucina ── */
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [fireChoices,   setFireChoices]   = useState({})
  const [sending,       setSending]       = useState(false)

  const openSendPicker = () => {
    if (composingItems.length === 0 || pendingIds.size > 0) return
    if (business.kitchen_fire_immediately) { sendToKitchen({}); return }
    const realCourseGroups = composingGroups.filter(g => g.course)
    if (realCourseGroups.length <= 1) { sendToKitchen({}); return } // niente da scegliere
    const defaults = {}
    realCourseGroups.forEach((g, idx) => { defaults[g.course.id] = idx === 0 ? 'subito' : 'in_attesa' })
    setFireChoices(defaults)
    setSendModalOpen(true)
  }

  const sendToKitchen = async (choices) => {
    setSending(true)
    const now = new Date().toISOString()
    for (const group of composingGroups) {
      const fireStatus = !group.course ? 'subito' : (choices[group.course.id] ?? 'subito')
      for (const it of group.items) {
        // Costo e IVA fotografati QUI, nello stesso write che valorizza
        // sent_at: da questo momento il margine di questa voce non cambia
        // più, nemmeno se domani il titolare corregge la stima del piatto
        // o registra un carico a prezzo diverso (Blocco E, punto 4).
        // sent_received_at non viene toccato: lo scrive il trigger del
        // database, il client non lo scrive mai.
        const product = it.menu_item_id ? costBook[it.menu_item_id] : null
        const { cost, source } = resolveCostSnapshot(product)
        const nextRow = {
          ...it,
          sent_at:           now,
          fire_status:       fireStatus,
          fired_at:          fireStatus === 'subito' ? now : null,
          cost_snapshot:     cost,
          cost_source:       source,
          vat_rate_snapshot: product?.vat_rate ?? null,
        }
        setItems((prev) => prev.map((x) => x.id === it.id ? nextRow : x))
        enqueueUpsert(it.id, nextRow)
      }
    }
    setSending(false)
    setSendModalOpen(false)
    logActivity(business.id, business.user_id, 'table_order_sent_to_kitchen', `Invio in cucina: ${table?.name ?? ''}`)
  }

  /* ── Azioni su voci già inviate ── */
  const cancelSentItem = (row) => {
    const nextRow = { ...row, kitchen_status: 'annullato' }
    setItems((prev) => prev.map((x) => x.id === row.id ? nextRow : x))
    enqueueUpsert(row.id, nextRow)
  }

  // "Via" per portata — disponibile anche qui, non solo in cucina: chiunque
  // può darlo, nessun passaggio obbligatorio.
  const fireBandNow = (band) => {
    const now = new Date().toISOString()
    for (const it of band.items.filter(i => i.fire_status === 'in_attesa')) {
      const nextRow = { ...it, fire_status: 'subito', fired_at: now }
      setItems((prev) => prev.map((x) => x.id === it.id ? nextRow : x))
      enqueueUpsert(it.id, nextRow)
    }
  }

  // "Consegnata" per portata — segna consegnate tutte le voci pronte di
  // quella fascia in un colpo solo, stesso pulsante disponibile in cucina.
  const markBandDelivered = (band) => {
    const now = new Date().toISOString()
    for (const it of band.items.filter(i => i.kitchen_status === 'pronto')) {
      const nextRow = { ...it, kitchen_status: 'consegnato', delivered_at: now }
      setItems((prev) => prev.map((x) => x.id === it.id ? nextRow : x))
      enqueueUpsert(it.id, nextRow)
    }
  }

  // "Chiudi tavolo": azione esplicita, mai automatica — richiede un tap di
  // conferma in più (stesso pattern "disattiva con conferma" del resto del
  // progetto), perché è l'unico modo per liberare davvero il tavolo
  // (status='aperto' → status libera lo stato OCCUPATO, vedi
  // getTableStatus in Tavoli.jsx). Bloccata finché c'è qualcosa in coda di
  // rete: chiudere ora rischierebbe di perdere di vista una modifica non
  // ancora salvata.
  const handleCloseTable = async () => {
    setClosing(true)
    const { error } = await supabase
      .from('table_orders')
      .update({ status: 'chiuso', closed_at: new Date().toISOString() })
      .eq('id', order.id)
    setClosing(false)
    if (error) { console.error('[handleCloseTable]', error); return }
    logActivity(business.id, business.user_id, 'table_order_closed', `Tavolo chiuso: ${table?.name ?? ''}`)
    onOrderClosed()
  }

  const renderComposingLine = (item) => (
    <div key={item.id} className="ord-line">
      <div className="ord-line-main">
        <span className="ord-line-name">{item.item_name_snapshot}</span>
        {item.price_snapshot != null && (
          <span className="ord-line-price">{formatPrice(item.price_snapshot * item.quantity)}</span>
        )}
      </div>
      <div className="ord-line-stepper">
        <button onClick={() => bumpQuantity(item, -1)}>−</button>
        <span>{item.quantity}</span>
        <button onClick={() => bumpQuantity(item, 1)}>+</button>
      </div>
      <input
        className="sv-input ord-line-notes"
        type="text"
        defaultValue={item.notes ?? ''}
        placeholder="Nota (facoltativo)"
        onBlur={(e) => updateNotes(item, e.target.value)}
      />
      {pendingIds.has(item.id) && <span className="ord-pending-badge" title="In attesa di rete">In attesa</span>}
    </div>
  )

  return (
    <div className="ord-screen rb-screen">
      {/* Intestazione: solo ciò che serve a capire dove si è. "Chiudi
          tavolo" è stato spostato in fondo alla schermata — in alto, di
          fianco alla freccia indietro, era il pulsante più grande e più
          facile da toccare per sbaglio durante il servizio. */}
      <div className="ord-header">
        <button className="tv-date-nav-btn ord-back-btn" onClick={onClose} aria-label="Torna ai tavoli" title="Torna ai tavoli">
          <IconArrowLeft />
        </button>
        <div className="ord-header-title">
          <h2 className="ord-table-name">{table?.name ?? 'Tavolo'}</h2>
          {turn && <span className="ord-turn-label">{turnLabel(turn)}</span>}
          {!order.reservation_id && <span className="db-badge db-badge--blue">Walk-in</span>}
        </div>
        <KioskLockButton
          area="sala"
          lockedArea={kioskLock}
          pin={business.kiosk_pin}
          onLock={onKioskLockChange}
          onUnlock={() => onKioskLockChange(null)}
        />
      </div>

      {isOffline && (
        <div className="ord-offline-banner">
          <IconOffline /> Dispositivo senza connessione — le modifiche restano salvate qui e partiranno da sole al ritorno della rete.
        </div>
      )}
      {!isOffline && realtimeDown && (
        <div className="ord-offline-banner">
          <IconOffline /> Aggiornamenti in tempo reale interrotti — riconnessione in corso, lo stato si aggiorna da solo appena torna attiva.
        </div>
      )}
      <div className="ord-search-row">
        <input
          className="sv-input"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Cerca piatto…"
          autoComplete="off"
        />
      </div>

      <div className="ord-category-pills">
        <button
          className={`tv-turn-pill ${selectedCategoryId === null ? 'tv-turn-pill--active' : ''}`}
          onClick={() => setSelectedCategoryId(null)}
        >
          Tutte
        </button>
        {categories.map(c => (
          <button
            key={c.id}
            className={`tv-turn-pill ${selectedCategoryId === c.id ? 'tv-turn-pill--active' : ''}`}
            onClick={() => setSelectedCategoryId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {gridLoading ? (
        <div className="sv-loading"><OrdSpinner /></div>
      ) : gridItems.length === 0 ? (
        <div className="db-card"><p className="db-card-empty">Nessun piatto trovato.</p></div>
      ) : (
        <div className="ord-grid">
          {gridItems.map(mi => {
            const qty = orderedQtyByMenuItemId[mi.id] ?? 0
            return (
              <div key={mi.id} className="ord-tile" onClick={() => addItem(mi)}>
                <span className="ord-tile-name">{mi.name}</span>
                {mi.price != null && <span className="ord-tile-price">{formatPrice(mi.price)}</span>}
                {qty > 0 && (
                  <div className="ord-tile-stepper" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => bumpQuantity(findRowForMenuItem(mi.id), -1)}>−</button>
                    <span>{qty}</span>
                    <button onClick={() => addItem(mi)}>+</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="ord-current">
        <div className="ord-current-header">
          <h3 className="mn-group-title">Da inviare {composingItems.length > 0 ? `(${composingItems.length})` : ''}</h3>
          {composingItems.length > 0 && (
            <button
              className="db-btn-primary"
              disabled={pendingIds.size > 0}
              onClick={openSendPicker}
            >
              Invia in cucina
            </button>
          )}
        </div>
        {pendingIds.size > 0 && (
          <p className="ord-pending-hint">
            {pendingIds.size} voc{pendingIds.size !== 1 ? 'i' : 'e'} in attesa di rete — l'invio riparte da solo appena tornano salvate.
          </p>
        )}
        {itemsLoading ? (
          <div className="sv-loading"><OrdSpinner /></div>
        ) : composingItems.length === 0 ? (
          <p className="mn-empty-hint">Nessun piatto da inviare — tocca un piatto in griglia per aggiungerlo.</p>
        ) : (
          <div className="ord-lines">
            {composingItems.map(renderComposingLine)}
          </div>
        )}
      </div>

      {sentItems.length > 0 && (
        <div className={`ord-current ord-sent-section ${readyPulse ? 'ord-ready-pulse' : ''}`}>
          <h3 className="mn-group-title">In cucina ({sentItems.filter(i => i.kitchen_status !== 'annullato').length})</h3>
          <div className="ord-course-bands">
            {sentBands.map((band, idx) => {
              const anyWaiting   = band.items.some(i => i.fire_status === 'in_attesa')
              const anyReady     = band.items.some(i => i.kitchen_status === 'pronto')
              return (
                <div key={band.course?.id ?? `none-${idx}`} className="ord-band">
                  <div className="ord-band-header">
                    <span className="ord-band-title">{courseLabel(band.course)}</span>
                    <div className="ord-band-actions">
                      {anyWaiting && (
                        <button className="sv-btn-cancel" onClick={() => fireBandNow(band)}>Via</button>
                      )}
                      {anyReady && (
                        <button className="sv-btn-save" onClick={() => markBandDelivered(band)}>Consegnata</button>
                      )}
                    </div>
                  </div>
                  <div className="ord-lines">
                    {band.items.map(item => (
                      <div
                        key={item.id}
                        className={`ord-line ord-line--sent ${item.fire_status === 'in_attesa' ? 'ord-line--waiting' : ''} ${item.kitchen_status === 'annullato' ? 'ord-line--cancelled' : ''}`}
                      >
                        <div className="ord-line-main">
                          <span className="ord-line-name">{item.item_name_snapshot} × {item.quantity}</span>
                          {item.notes && <span className="ord-line-note-text">{item.notes}</span>}
                        </div>
                        <span className={`db-badge ${item.kitchen_status === 'pronto' ? 'db-badge--green' : item.kitchen_status === 'consegnato' ? 'db-badge--gray' : item.kitchen_status === 'annullato' ? 'db-badge--red' : 'db-badge--blue'}`}>
                          {kitchenStatusLabel(item.kitchen_status)}
                        </span>
                        {item.fire_status === 'in_attesa' && <span className="db-badge db-badge--gray">In attesa</span>}
                        {pendingIds.has(item.id) && <span className="ord-pending-badge" title="In attesa di rete">In attesa rete</span>}
                        {item.kitchen_status !== 'consegnato' && item.kitchen_status !== 'annullato' && (
                          <button className="ord-cancel-item-btn" title="Annulla voce" onClick={() => cancelSentItem(item)}>
                            <IconX />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Totale e chiusura tavolo in fondo, dove si arriva quando il
          servizio al tavolo è finito. Stile volutamente sobrio: non deve
          attirare il pollice più dei pulsanti di servizio. */}
      <div className="ord-footer">
        <div className="ord-total">Totale: <strong>{formatPrice(total)}</strong></div>
        <button
          className="ord-close-table-btn"
          disabled={pendingIds.size > 0}
          title={pendingIds.size > 0 ? 'Attendi il salvataggio delle modifiche in sospeso' : undefined}
          onClick={() => setCloseConfirm(true)}
        >
          Chiudi tavolo
        </button>
        {pendingIds.size > 0 && (
          <p className="ord-pending-hint">
            Il tavolo si può chiudere appena le voci in attesa di rete sono salvate.
          </p>
        )}
      </div>

      {/* Conferma di chiusura: pannello dal basso, non più una riga
          schiacciata nell'intestazione sopra le etichette del turno. */}
      {closeConfirm && (
        <div className="sv-modal-overlay ord-sheet-overlay" onClick={(e) => e.target === e.currentTarget && setCloseConfirm(false)}>
          <div className="ord-sheet">
            <h2 className="ord-sheet-title">Chiudere il tavolo?</h2>
            <p className="ord-sheet-text">
              {table?.name ?? 'Tavolo'}{turn ? ` · ${turnLabel(turn)}` : ''}
            </p>
            <p className="ord-sheet-total">Totale <strong>{formatPrice(total)}</strong></p>
            <p className="ord-sheet-note">
              Il tavolo torna libero per questa combinazione di data e turno. Le comande restano registrate.
            </p>
            <div className="ord-sheet-actions">
              <button className="ord-sheet-btn ord-sheet-btn--confirm" disabled={closing} onClick={handleCloseTable}>
                {closing ? <OrdSpinner small /> : null}
                {closing ? 'Chiusura…' : 'Chiudi tavolo'}
              </button>
              <button className="ord-sheet-btn ord-sheet-btn--cancel" disabled={closing} onClick={() => setCloseConfirm(false)}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {sendModalOpen && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && setSendModalOpen(false)}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Invia in cucina</h2>
              <button className="sv-modal-close" onClick={() => setSendModalOpen(false)} aria-label="Chiudi"><IconX /></button>
            </div>
            <div className="sv-modal-body">
              <p className="mn-empty-hint">Scegli per ogni portata se partire subito o restare in attesa del "via".</p>
              <div className="ord-fire-choices">
                {composingGroups.filter(g => g.course).map(g => (
                  <div key={g.course.id} className="ord-fire-choice-row">
                    <span className="ord-band-title">{courseLabel(g.course)}</span>
                    <div className="ord-fire-toggle">
                      <button
                        className={fireChoices[g.course.id] === 'subito' ? 'tv-turn-pill tv-turn-pill--active' : 'tv-turn-pill'}
                        onClick={() => setFireChoices((f) => ({ ...f, [g.course.id]: 'subito' }))}
                      >
                        Subito
                      </button>
                      <button
                        className={fireChoices[g.course.id] === 'in_attesa' ? 'tv-turn-pill tv-turn-pill--active' : 'tv-turn-pill'}
                        onClick={() => setFireChoices((f) => ({ ...f, [g.course.id]: 'in_attesa' }))}
                      >
                        In attesa
                      </button>
                    </div>
                  </div>
                ))}
                {composingGroups.some(g => !g.course) && (
                  <p className="mn-empty-hint">Le voci senza portata partono comunque subito.</p>
                )}
              </div>
            </div>
            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={() => setSendModalOpen(false)}>Annulla</button>
              <button className="sv-btn-save" onClick={() => sendToKitchen(fireChoices)} disabled={sending}>
                {sending ? <OrdSpinner small /> : null}
                {sending ? 'Invio…' : 'Invia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Icons ── */
function IconArrowLeft() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> }
function IconX()         { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconOffline()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg> }
function OrdSpinner({ small }) {
  const s = small ? 14 : 18
  return <svg style={{ width: s, height: s, animation: 'sv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
