import { supabase } from './supabase'

// Unica fonte di verità per giacenze, costi e margini del verticale
// 'ristorante_bar' — usata da Scorte.jsx (sezione scorte), Menu.jsx
// (avviso scorte esaurite) e Ordine.jsx (snapshot di costo all'invio).
// Stesso principio di kitchenRouting.js nel Blocco D: una regola che
// serve a più componenti vive in un posto solo, altrimenti i casi limite
// (prodotto tracciato senza carichi, costo sconosciuto, voce annullata)
// finiscono gestiti in modo diverso da un punto all'altro senza che
// nessuno se ne accorga.

// La giacenza NON è mai una colonna: è sempre la somma dei movimenti.
// quantity è già con segno (carico positivo, vendita negativa, rettifica
// libera), quindi nessun caso speciale per tipo.
export function stockFromMovements(movements) {
  return (movements ?? []).reduce((sum, m) => sum + Number(m.quantity), 0)
}

// Costo attuale di un prodotto tracciato = unit_cost del carico più
// recente. Anche questo calcolato, mai persistito.
export function currentUnitCostFromMovements(movements) {
  const carichi = (movements ?? [])
    .filter((m) => m.type === 'carico')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const last = carichi[0]
  return last?.unit_cost == null ? null : Number(last.unit_cost)
}

// Costo da fotografare sulla voce d'ordine AL MOMENTO DELL'INVIO in
// cucina (mai all'aggiunta della voce, mai con un join live dopo):
//   prodotto tracciato con almeno un carico → costo di quel carico, 'reale'
//   altrimenti, se esiste una stima              → la stima, 'stimato'
//   altrimenti                                   → costo sconosciuto
// Il secondo ramo copre anche il prodotto tracciato che non ha ancora
// nessun carico: l'etichetta 'stimato' dice già la verità sul dato, e
// buttare via una stima disponibile lascerebbe "costo sconosciuto" senza
// guadagnarci niente.
export function resolveCostSnapshot(product) {
  if (!product) return { cost: null, source: null }
  if (product.track_stock && product.realCost != null) {
    return { cost: product.realCost, source: 'reale' }
  }
  if (product.estimated_cost != null) {
    return { cost: product.estimated_cost, source: 'stimato' }
  }
  return { cost: null, source: null }
}

// Prezzo di vendita senza IVA. L'aliquota è quella fotografata sulla voce
// (vat_rate_snapshot), non quella attuale del prodotto: cambiarla domani
// non deve spostare i margini di ieri.
export function netPriceOf(price, vatRate) {
  if (price == null) return null
  const vat = Number(vatRate ?? 0)
  return Number(price) / (1 + vat / 100)
}

// Margine di una singola voce d'ordine. null = non calcolabile (costo non
// inserito): la voce resta nell'incasso ma fuori dal margine.
export function lineMargin(item) {
  if (item?.cost_snapshot == null || item?.price_snapshot == null) return null
  const net = netPriceOf(item.price_snapshot, item.vat_rate_snapshot)
  return (net - Number(item.cost_snapshot)) * item.quantity
}

// Percentuale di costo sul prezzo (senza IVA) di un prodotto, per la
// tabella per-prodotto. null se manca uno dei due.
export function costRatio(cost, price, vatRate) {
  const net = netPriceOf(price, vatRate)
  if (cost == null || net == null || net === 0) return null
  return (Number(cost) / net) * 100
}

// Libro dei costi per l'invio in cucina: tutto ciò che serve a risolvere
// uno snapshot senza altre query. Caricato in anticipo da Ordine.jsx
// proprio perché l'invio deve poter essere composto anche senza rete (la
// coda offline del Blocco D salva la riga completa e la ritenta da sola).
export async function loadCostBook(businessId) {
  const [items, carichi] = await Promise.all([
    supabase
      .from('menu_items')
      .select('id, track_stock, estimated_cost, vat_rate')
      .eq('business_id', businessId),
    // Ordinati dal più recente: la prima occorrenza di ogni prodotto è il
    // suo ultimo carico. Limite esplicito, non il default di PostgREST.
    supabase
      .from('stock_movements')
      .select('menu_item_id, unit_cost, created_at')
      .eq('business_id', businessId)
      .eq('type', 'carico')
      .order('created_at', { ascending: false })
      .limit(2000),
  ])

  if (items.error)   { console.error('[loadCostBook items]', items.error);   return {} }
  if (carichi.error) { console.error('[loadCostBook carichi]', carichi.error); return {} }

  const realCostByItem = {}
  for (const c of carichi.data ?? []) {
    if (!(c.menu_item_id in realCostByItem)) {
      realCostByItem[c.menu_item_id] = c.unit_cost == null ? null : Number(c.unit_cost)
    }
  }

  const book = {}
  for (const it of items.data ?? []) {
    book[it.id] = {
      track_stock:    it.track_stock,
      estimated_cost: it.estimated_cost == null ? null : Number(it.estimated_cost),
      vat_rate:       it.vat_rate == null ? null : Number(it.vat_rate),
      realCost:       realCostByItem[it.id] ?? null,
    }
  }
  return book
}

// '-infinity' è il confine che il database restituisce quando un business
// non ha ancora nessuna chiusura: qui diventa null, più facile da trattare
// lato interfaccia ("dall'inizio").
function normalizeBoundary(value) {
  if (!value || value === '-infinity') return null
  return value
}

// Stato completo delle scorte. Il venduto non ancora chiuso arriva dalla
// STESSA funzione SQL che calcola la proposta di chiusura
// (stock_closure_proposal): così la stima mostrata qui e la quantità
// proposta al momento di chiudere non possono divergere, ed è aggregata
// dal database invece che paginando migliaia di voci d'ordine.
export async function loadStockState(businessId) {
  const [proposal, movements] = await Promise.all([
    supabase.rpc('stock_closure_proposal', { p_business_id: businessId }),
    // Cronologia completa dei movimenti: serve sia alla giacenza
    // registrata (somma) sia all'elenco movimenti. Limite esplicito e
    // generoso; se un business lo supererà, la somma andrà spostata in
    // una funzione SQL come già fatto per i resoconti.
    supabase
      .from('stock_movements')
      .select('*, menu_items(name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5000),
  ])

  if (proposal.error)  { console.error('[loadStockState proposal]', proposal.error);   return null }
  if (movements.error) { console.error('[loadStockState movements]', movements.error); return null }

  const rows = proposal.data ?? []
  const movementRows = movements.data ?? []

  const movementsByItem = {}
  for (const m of movementRows) {
    if (!movementsByItem[m.menu_item_id]) movementsByItem[m.menu_item_id] = []
    movementsByItem[m.menu_item_id].push(m)
  }

  const byItemId = {}
  for (const r of rows) {
    const own = movementsByItem[r.menu_item_id] ?? []
    const registeredStock = stockFromMovements(own)
    const soldNotClosed = Number(r.proposed_quantity ?? 0)
    byItemId[r.menu_item_id] = {
      menuItemId:      r.menu_item_id,
      itemName:        r.item_name,
      soldNotClosed,
      currentUnitCost: r.current_unit_cost == null ? null : Number(r.current_unit_cost),
      registeredStock,
      estimatedStock:  registeredStock - soldNotClosed,
    }
  }

  return {
    // now() del database nell'istante della proposta: è il confine che
    // userebbe una chiusura confermata adesso. Mai l'orologio del
    // dispositivo (vedi nota "due orologi" nella migration).
    periodEnd:   rows[0]?.period_end ?? null,
    previousEnd: normalizeBoundary(rows[0]?.previous_end),
    byItemId,
    movements: movementRows,
  }
}
