import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'

function turnLabel(t) {
  if (!t) return ''
  return t.name?.trim() || `Turno ${t.slot_number}`
}

function formatPrice(n) {
  return `€${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Schermata ordine (Blocco C) — sostituisce interamente la griglia tavoli
// mentre è aperta (vedi Tavoli.jsx), non un modale sopra di essa. Montata
// solo indirettamente dietro il gate su vertical='ristorante_bar': non ha
// un proprio controllo perché è importata staticamente solo da Tavoli.jsx,
// che è già React.lazy() e già gated in Dashboard.jsx — nessun secondo
// punto d'ingresso da cui potrebbe essere raggiunta altrimenti (verificato
// con grep, vedi report).
export default function Ordine({ business, order, table, turns, onClose, onOrderClosed }) {
  const [items,        setItems]        = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)

  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [gridItems,   setGridItems]   = useState([])
  const [gridLoading, setGridLoading] = useState(false)
  const searchTimerRef = useRef(null)

  const [closeConfirm, setCloseConfirm] = useState(false)
  const [closing,      setClosing]      = useState(false)

  const turn = useMemo(() => turns.find(t => t.id === order.turn_id) ?? null, [turns, order.turn_id])

  const loadItems = useCallback(async (signal = null) => {
    setItemsLoading(true)
    const { data, error } = await supabase
      .from('table_order_items')
      .select('*')
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

  // Griglia piatti: ricerca fuzzy per nome (ilike, indice trigram
  // idx_menu_items_name_trgm) + filtro categoria, solo piatti disponibili.
  // Un'unica funzione per entrambi i filtri: il pill categoria non ha
  // bisogno di debounce (click discreto), la ricerca testuale sì.
  const loadGrid = useCallback(async (term, categoryId, signal = null) => {
    setGridLoading(true)
    let q = supabase.from('menu_items')
      .select('id, name, price, category_id')
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
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => loadGrid(searchTerm, selectedCategoryId, signal), 150)
    return () => { signal.cancelled = true; clearTimeout(searchTimerRef.current) }
  }, [searchTerm, selectedCategoryId, loadGrid])

  const orderedQtyByMenuItemId = useMemo(() => {
    const map = {}
    for (const i of items) {
      if (!i.menu_item_id) continue
      map[i.menu_item_id] = (map[i.menu_item_id] ?? 0) + i.quantity
    }
    return map
  }, [items])

  const total = useMemo(() => {
    return items.reduce((sum, i) => sum + (Number(i.price_snapshot) || 0) * i.quantity, 0)
  }, [items])

  const findRowForMenuItem = (menuItemId) => items.find(i => i.menu_item_id === menuItemId)

  // Tap su un piatto in griglia: se è già nell'ordine, incrementa la riga
  // esistente (stesso comportamento del "+" nello stepper); altrimenti
  // inserisce una nuova riga. Righe indipendenti per ogni nuovo inserimento
  // (Blocco C punto 6): due camerieri che aggiungono lo STESSO piatto per
  // la prima volta nello stesso istante ottengono due insert separati, mai
  // una race su un unico update.
  const addItem = async (menuItem) => {
    const existing = findRowForMenuItem(menuItem.id)
    if (existing) { await bumpQuantity(existing, 1); return }
    const { data, error } = await supabase
      .from('table_order_items')
      .insert({
        order_id:           order.id,
        menu_item_id:        menuItem.id,
        item_name_snapshot:  menuItem.name,
        price_snapshot:      menuItem.price,
        quantity:            1,
      })
      .select('*')
      .single()
    if (error) { console.error('[addItem]', error); return }
    setItems((prev) => [...prev, data])
  }

  // delta positivo o negativo su una riga già nota (id conosciuto
  // localmente) — quantity<=0 cancella la riga invece di scrivere 0 o
  // negativo, non ha senso una riga d'ordine a quantità zero.
  const bumpQuantity = async (row, delta) => {
    const nextQty = row.quantity + delta
    if (nextQty <= 0) {
      const { error } = await supabase.from('table_order_items').delete().eq('id', row.id)
      if (error) { console.error('[bumpQuantity delete]', error); return }
      setItems((prev) => prev.filter((i) => i.id !== row.id))
      return
    }
    const { error } = await supabase.from('table_order_items').update({ quantity: nextQty }).eq('id', row.id)
    if (error) { console.error('[bumpQuantity update]', error); return }
    setItems((prev) => prev.map((i) => i.id === row.id ? { ...i, quantity: nextQty } : i))
  }

  const updateNotes = async (row, rawValue) => {
    const notes = rawValue.trim() || null
    if (notes === (row.notes ?? null)) return
    const { error } = await supabase.from('table_order_items').update({ notes }).eq('id', row.id)
    if (error) { console.error('[updateNotes]', error); return }
    setItems((prev) => prev.map((i) => i.id === row.id ? { ...i, notes } : i))
  }

  // "Chiudi tavolo": azione esplicita, mai automatica — richiede un tap di
  // conferma in più (stesso pattern "disattiva con conferma" del resto del
  // progetto), perché è l'unico modo per liberare davvero il tavolo
  // (status='aperto' → status libera lo stato OCCUPATO, vedi
  // getTableStatus in Tavoli.jsx).
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

  return (
    <div className="ord-screen">
      <div className="ord-header">
        <button className="tv-date-nav-btn" onClick={onClose} aria-label="Torna ai tavoli" title="Torna ai tavoli">
          <IconArrowLeft />
        </button>
        <div className="ord-header-title">
          <h2 className="ord-table-name">{table?.name ?? 'Tavolo'}</h2>
          {turn && <span className="ord-turn-label">{turnLabel(turn)}</span>}
          {!order.reservation_id && <span className="db-badge db-badge--blue">Walk-in</span>}
        </div>
        {closeConfirm ? (
          <div className="tv-confirm-row">
            <span className="tv-confirm-label">Chiudere il tavolo?</span>
            <button className="tv-icon-btn tv-icon-btn--danger" disabled={closing} onClick={handleCloseTable}>
              {closing ? <OrdSpinner small /> : <IconCheck />}
            </button>
            <button className="tv-icon-btn" onClick={() => setCloseConfirm(false)}><IconX /></button>
          </div>
        ) : (
          <button className="mn-btn-sold-out" onClick={() => setCloseConfirm(true)}>Chiudi tavolo</button>
        )}
      </div>

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
        <h3 className="mn-group-title">Ordinato {items.length > 0 ? `(${items.length})` : ''}</h3>
        {itemsLoading ? (
          <div className="sv-loading"><OrdSpinner /></div>
        ) : items.length === 0 ? (
          <p className="mn-empty-hint">Nessun piatto ordinato ancora — tocca un piatto in griglia per aggiungerlo.</p>
        ) : (
          <div className="ord-lines">
            {items.map(item => (
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
              </div>
            ))}
          </div>
        )}
        <div className="ord-total">Totale: <strong>{formatPrice(total)}</strong></div>
      </div>
    </div>
  )
}

/* ── Icons ── */
function IconArrowLeft() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> }
function IconCheck()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconX()         { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function OrdSpinner({ small }) {
  const s = small ? 14 : 18
  return <svg style={{ width: s, height: s, animation: 'sv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
