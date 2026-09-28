import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { loadStockState, costRatio, netPriceOf } from '../../lib/stock'
import { BUSINESS_TIMEZONE, formatDateTime, formatDayKey, formatMonthKey } from '../../lib/datetime'

const TABS = [
  { id: 'giacenze',  label: 'Giacenze' },
  { id: 'movimenti', label: 'Movimenti' },
  { id: 'chiusure',  label: 'Chiusure' },
  { id: 'margini',   label: 'Margini' },
]

const MOVEMENT_LABEL = { carico: 'Carico', vendita: 'Vendita', rettifica: 'Rettifica' }

function formatMoney(n, decimals = 2) {
  if (n == null) return '—'
  return `€${Number(n).toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

function formatPercent(n) {
  if (n == null) return '—'
  return `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`
}

// Sezione Scorte (Blocco E) — voce di navigazione propria, montata solo
// per vertical='ristorante_bar' (React.lazy + doppio gate in
// Dashboard.jsx, stesso pattern di Tavoli/Menu/Cucina). Pensata per il
// titolare, non per la sala: carichi, rettifiche, chiusure del conteggio,
// giacenze, da riordinare, margini.
//
// Nessuna giacenza è mai letta da una colonna: tutto arriva da
// src/lib/stock.js, che somma i movimenti e chiede al database il venduto
// non ancora chiuso con la STESSA funzione che calcola la proposta di
// chiusura — così la stima mostrata qui e ciò che verrà scalato al
// momento di chiudere non possono divergere.
export default function Scorte({ business }) {
  const [tab, setTab] = useState('giacenze')

  const [products, setProducts] = useState([])   // menu_items tracciati + non tracciati (per i margini)
  const [stock,    setStock]    = useState(null) // stato da loadStockState
  const [closures, setClosures] = useState([])
  const [loading,  setLoading]  = useState(true)

  const loadProducts = useCallback(async (signal = null) => {
    if (!business) return
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, price, is_available, track_stock, min_stock, estimated_cost, vat_rate')
      .eq('business_id', business.id)
      .order('name')
    if (signal?.cancelled) return
    if (error) { console.error('[loadProducts]', error); return }
    setProducts(data ?? [])
  }, [business])

  const loadClosures = useCallback(async (signal = null) => {
    if (!business) return
    const { data, error } = await supabase
      .from('stock_closures')
      .select('*')
      .eq('business_id', business.id)
      .order('period_end', { ascending: false })
      .limit(100)
    if (signal?.cancelled) return
    if (error) { console.error('[loadClosures]', error); return }
    setClosures(data ?? [])
  }, [business])

  const loadStock = useCallback(async (signal = null) => {
    if (!business) return
    setLoading(true)
    const state = await loadStockState(business.id)
    if (signal?.cancelled) return
    setLoading(false)
    if (state) setStock(state)
  }, [business])

  const reloadAll = useCallback(() => {
    loadProducts()
    loadClosures()
    loadStock()
  }, [loadProducts, loadClosures, loadStock])

  useEffect(() => {
    const signal = { cancelled: false }
    loadProducts(signal)
    return () => { signal.cancelled = true }
  }, [loadProducts])

  useEffect(() => {
    const signal = { cancelled: false }
    loadClosures(signal)
    return () => { signal.cancelled = true }
  }, [loadClosures])

  useEffect(() => {
    const signal = { cancelled: false }
    loadStock(signal)
    return () => { signal.cancelled = true }
  }, [loadStock])

  const trackedProducts = useMemo(() => products.filter(p => p.track_stock), [products])

  // Riga completa per prodotto tracciato: dati anagrafici + giacenze.
  const stockRows = useMemo(() => {
    if (!stock) return []
    return trackedProducts.map((p) => {
      const s = stock.byItemId[p.id]
      return {
        product: p,
        registeredStock: s?.registeredStock ?? 0,
        soldNotClosed:   s?.soldNotClosed ?? 0,
        estimatedStock:  s?.estimatedStock ?? 0,
        currentUnitCost: s?.currentUnitCost ?? null,
      }
    })
  }, [trackedProducts, stock])

  const toReorder = useMemo(() => {
    return stockRows
      .filter(r => r.product.min_stock != null && r.estimatedStock < r.product.min_stock)
      .sort((a, b) => (a.estimatedStock - a.product.min_stock) - (b.estimatedStock - b.product.min_stock))
  }, [stockRows])

  /* ── Carico e rettifica ── */
  const [movementModal, setMovementModal] = useState(null) // null | { type, product }
  const [movQty,  setMovQty]  = useState('')
  const [movCost, setMovCost] = useState('')
  const [movNote, setMovNote] = useState('')
  const [movSaving, setMovSaving] = useState(false)
  const [movError,  setMovError]  = useState(null)

  const openMovement = (type, product) => {
    setMovementModal({ type, product })
    setMovQty('')
    setMovCost('')
    setMovNote('')
    setMovError(null)
  }

  const closeMovement = () => setMovementModal(null)

  const saveMovement = async () => {
    const { type, product } = movementModal
    const qty = Number(movQty)
    if (!Number.isInteger(qty) || qty === 0) {
      setMovError(type === 'carico'
        ? 'Inserisci un numero intero di pezzi maggiore di zero.'
        : 'Inserisci un numero intero diverso da zero (negativo per togliere pezzi).')
      return
    }
    if (type === 'carico' && qty < 0) {
      setMovError('Un carico non può essere negativo. Per togliere pezzi usa una rettifica.')
      return
    }
    let unitCost = null
    if (type === 'carico') {
      if (movCost === '' || isNaN(Number(movCost)) || Number(movCost) < 0) {
        setMovError('Il prezzo per pezzo (IVA esclusa) è obbligatorio per un carico.')
        return
      }
      unitCost = Number(movCost)
    }

    setMovSaving(true)
    const { error } = await supabase.from('stock_movements').insert({
      business_id:  business.id,
      menu_item_id: product.id,
      type,
      quantity:     qty,
      unit_cost:    unitCost,
      note:         movNote.trim() || null,
    })
    setMovSaving(false)
    if (error) { console.error('[saveMovement]', error); setMovError('Salvataggio non riuscito. Riprova.'); return }

    logActivity(business.id, business.user_id,
      type === 'carico' ? 'stock_load' : 'stock_adjustment',
      `${MOVEMENT_LABEL[type]}: ${product.name} (${qty > 0 ? '+' : ''}${qty} pz)`)
    closeMovement()
    reloadAll()
  }

  /* ── Chiusura del conteggio ──
     La proposta arriva dal database (stock_closure_proposal) insieme al
     confine contabile: il dispositivo non genera mai un period_end, lo
     riceve e lo restituisce identico alla conferma. La conferma è una
     sola chiamata atomica che scrive chiusura e movimenti insieme. */
  const [closureModal,   setClosureModal]   = useState(false)
  const [closureRows,    setClosureRows]    = useState([])
  const [closureBounds,  setClosureBounds]  = useState(null) // { periodEnd, previousEnd }
  const [closureLoading, setClosureLoading] = useState(false)
  const [closureSaving,  setClosureSaving]  = useState(false)
  const [closureError,   setClosureError]   = useState(null)

  const openClosure = async () => {
    setClosureModal(true)
    setClosureLoading(true)
    setClosureError(null)
    const { data, error } = await supabase.rpc('stock_closure_proposal', { p_business_id: business.id })
    setClosureLoading(false)
    if (error) {
      console.error('[stock_closure_proposal]', error)
      setClosureError('Non è stato possibile calcolare la proposta. Riprova.')
      return
    }
    const rows = data ?? []
    setClosureBounds(rows[0] ? { periodEnd: rows[0].period_end, previousEnd: rows[0].previous_end } : null)
    setClosureRows(rows.map(r => ({
      menuItemId: r.menu_item_id,
      itemName:   r.item_name,
      proposed:   Number(r.proposed_quantity ?? 0),
      quantity:   String(r.proposed_quantity ?? 0),
      unitCost:   r.current_unit_cost == null ? null : Number(r.current_unit_cost),
    })))
  }

  const closeClosureModal = () => {
    setClosureModal(false)
    setClosureRows([])
    setClosureBounds(null)
    setClosureError(null)
  }

  const setClosureQty = (menuItemId, value) => {
    setClosureRows(prev => prev.map(r => r.menuItemId === menuItemId ? { ...r, quantity: value } : r))
  }

  const confirmClosure = async () => {
    if (!closureBounds) return
    const invalid = closureRows.find(r => {
      const n = Number(r.quantity)
      return r.quantity === '' || isNaN(n) || !Number.isInteger(n) || n < 0
    })
    if (invalid) {
      setClosureError(`Quantità non valida per "${invalid.itemName}": inserisci un numero intero maggiore o uguale a zero.`)
      return
    }

    setClosureSaving(true)
    setClosureError(null)
    const { error } = await supabase.rpc('stock_closure_confirm', {
      p_business_id:  business.id,
      p_previous_end: closureBounds.previousEnd,
      p_period_end:   closureBounds.periodEnd,
      p_items: closureRows
        .filter(r => Number(r.quantity) > 0)
        .map(r => ({ menu_item_id: r.menuItemId, quantity: Number(r.quantity) })),
    })
    setClosureSaving(false)
    if (error) {
      console.error('[stock_closure_confirm]', error)
      // Il messaggio del database è già scritto per essere letto: copre
      // anche il caso "un altro dispositivo ha chiuso nel frattempo".
      setClosureError(error.message || 'Conferma non riuscita. Riprova.')
      return
    }
    logActivity(business.id, business.user_id, 'stock_closure', 'Conteggio scorte chiuso')
    closeClosureModal()
    reloadAll()
  }

  /* ── Margini e resoconti ── */
  const [reportGroup,  setReportGroup]  = useState('day')
  const [reportDays,   setReportDays]   = useState(30)
  const [reportRows,   setReportRows]   = useState([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError,  setReportError]  = useState(null)

  const loadReport = useCallback(async (signal = null) => {
    if (!business) return
    setReportLoading(true)
    setReportError(null)
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - reportDays)
    // Il fuso viaggia come parametro dalla costante condivisa: la funzione
    // SQL non lo ha cablato, così quando diventerà il fuso del singolo
    // business non cambierà niente nello schema.
    const { data, error } = await supabase.rpc('stock_report', {
      p_business_id: business.id,
      p_from:        from.toISOString(),
      p_to:          to.toISOString(),
      p_group:       reportGroup,
      p_timezone:    BUSINESS_TIMEZONE,
    })
    if (signal?.cancelled) return
    setReportLoading(false)
    if (error) {
      console.error('[stock_report]', error)
      setReportError('Resoconto non disponibile. Verifica che la migration dei resoconti sia stata applicata.')
      return
    }
    setReportRows(data ?? [])
  }, [business, reportGroup, reportDays])

  useEffect(() => {
    if (tab !== 'margini') return
    const signal = { cancelled: false }
    loadReport(signal)
    return () => { signal.cancelled = true }
  }, [tab, loadReport])

  const closureLabelById = useMemo(() => {
    const map = {}
    for (const c of closures) map[c.id] = formatDateTime(c.closed_at)
    return map
  }, [closures])

  const bucketLabel = (key) => {
    if (reportGroup === 'day')   return formatDayKey(key)
    if (reportGroup === 'month') return formatMonthKey(key)
    if (key === 'aperto')        return 'Non ancora chiuso'
    return closureLabelById[key] ?? 'Chiusura'
  }

  const reportTotals = useMemo(() => {
    return reportRows.reduce((acc, r) => ({
      revenue:          acc.revenue + Number(r.revenue_gross ?? 0),
      costReal:         acc.costReal + Number(r.cost_real ?? 0),
      costEstimated:    acc.costEstimated + Number(r.cost_estimated ?? 0),
      marginReal:       acc.marginReal + Number(r.margin_real ?? 0),
      marginEstimated:  acc.marginEstimated + Number(r.margin_estimated ?? 0),
      linesWithoutCost: acc.linesWithoutCost + Number(r.lines_without_cost ?? 0),
      revenueWithoutCost: acc.revenueWithoutCost + Number(r.revenue_without_cost ?? 0),
    }), {
      revenue: 0, costReal: 0, costEstimated: 0, marginReal: 0, marginEstimated: 0,
      linesWithoutCost: 0, revenueWithoutCost: 0,
    })
  }, [reportRows])

  if (!business) {
    return <div className="db-section"><div className="db-empty-banner">Configura prima la tua attività.</div></div>
  }

  const lastClosure = closures[0] ?? null

  return (
    <div className="db-section">
      <div className="db-section-toolbar">
        <p className="db-section-desc">
          {lastClosure
            ? `Ultima chiusura del conteggio: ${formatDateTime(lastClosure.closed_at)}.`
            : 'Nessuna chiusura del conteggio ancora: la prima conterà tutto il venduto dall\'inizio.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="db-btn-primary"
            disabled={trackedProducts.length === 0}
            title={trackedProducts.length === 0 ? 'Nessun prodotto tracciato a magazzino' : undefined}
            onClick={openClosure}
          >
            Chiudi conteggio
          </button>
        </div>
      </div>

      {trackedProducts.length === 0 && (
        <div className="db-empty-banner">
          Nessun prodotto tracciato a magazzino. Attiva "Traccia a magazzino" sui prodotti venduti a pezzo dalla sezione Menu.
        </div>
      )}

      <div className="tv-turn-switch">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tv-turn-pill ${tab === t.id ? 'tv-turn-pill--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !stock ? (
        <div className="sv-loading"><ScSpinner /></div>
      ) : tab === 'giacenze' ? (
        <>
          {toReorder.length > 0 && (
            <div className="sc-reorder">
              <h3 className="mn-group-title">Da riordinare ({toReorder.length})</h3>
              <div className="sc-reorder-list">
                {toReorder.map(r => (
                  <span key={r.product.id} className="sc-reorder-chip">
                    {r.product.name}: <strong>{r.estimatedStock}</strong> / soglia {r.product.min_stock}
                  </span>
                ))}
              </div>
            </div>
          )}

          {stockRows.length === 0 ? (
            <div className="db-card"><p className="db-card-empty">Nessun prodotto tracciato a magazzino.</p></div>
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th title="Somma dei movimenti registrati: carichi, vendite delle chiusure, rettifiche">Registrata</th>
                    <th title="Venduto inviato in cucina dopo l'ultima chiusura, non ancora scalato">Da scalare</th>
                    <th title="Registrata meno il venduto non ancora chiuso">Stima attuale</th>
                    <th>Costo attuale</th>
                    <th>Prezzo</th>
                    <th title="Margine per pezzo: prezzo senza IVA meno costo">Margine/pz</th>
                    <th title="Costo sul prezzo senza IVA">Costo %</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map(r => {
                    const net = netPriceOf(r.product.price, r.product.vat_rate)
                    const cost = r.currentUnitCost ?? (r.product.estimated_cost == null ? null : Number(r.product.estimated_cost))
                    const isReal = r.currentUnitCost != null
                    const margin = (net == null || cost == null) ? null : net - cost
                    const low = r.product.min_stock != null && r.estimatedStock < r.product.min_stock
                    return (
                      <tr key={r.product.id} className={r.estimatedStock <= 0 ? 'sc-row--empty' : low ? 'sc-row--low' : ''}>
                        <td>
                          <span className="sc-product-name">{r.product.name}</span>
                          {!r.product.is_available && <span className="db-badge db-badge--gray" style={{ marginLeft: 6 }}>Non disponibile</span>}
                        </td>
                        <td className="sc-num">{r.registeredStock}</td>
                        <td className="sc-num">{r.soldNotClosed > 0 ? `−${r.soldNotClosed}` : '—'}</td>
                        <td className="sc-num"><strong>{r.estimatedStock}</strong></td>
                        <td className="sc-num">
                          {formatMoney(cost, 4)}
                          {cost != null && (
                            <span className={`db-badge ${isReal ? 'db-badge--green' : 'db-badge--blue'}`} style={{ marginLeft: 6 }}>
                              {isReal ? 'reale' : 'stimato'}
                            </span>
                          )}
                        </td>
                        <td className="sc-num">{formatMoney(r.product.price)}</td>
                        <td className="sc-num">{formatMoney(margin)}</td>
                        <td className="sc-num">{formatPercent(costRatio(cost, r.product.price, r.product.vat_rate))}</td>
                        <td>
                          <div className="sc-row-actions">
                            <button className="sv-btn-cancel" onClick={() => openMovement('carico', r.product)}>+ Carico</button>
                            <button className="sv-btn-cancel" onClick={() => openMovement('rettifica', r.product)}>Rettifica</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === 'movimenti' ? (
        (stock?.movements ?? []).length === 0 ? (
          <div className="db-card"><p className="db-card-empty">Nessun movimento registrato.</p></div>
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Prodotto</th>
                  <th>Tipo</th>
                  <th>Pezzi</th>
                  <th>Costo/pz</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {(stock?.movements ?? []).map(m => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.created_at)}</td>
                    <td>{m.menu_items?.name ?? '—'}</td>
                    <td>
                      <span className={`db-badge ${m.type === 'carico' ? 'db-badge--green' : m.type === 'vendita' ? 'db-badge--blue' : 'db-badge--gray'}`}>
                        {MOVEMENT_LABEL[m.type] ?? m.type}
                      </span>
                    </td>
                    <td className="sc-num">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="sc-num">{formatMoney(m.unit_cost, 4)}</td>
                    <td>{m.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'chiusure' ? (
        closures.length === 0 ? (
          <div className="db-card"><p className="db-card-empty">Nessuna chiusura ancora.</p></div>
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Confermata</th>
                  <th title="Confine contabile: fino a qui la chiusura ha contato il venduto">Conta fino a</th>
                  <th>Pezzi scalati</th>
                </tr>
              </thead>
              <tbody>
                {closures.map(c => {
                  const pieces = (stock?.movements ?? [])
                    .filter(m => m.closure_id === c.id)
                    .reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0)
                  return (
                    <tr key={c.id}>
                      <td>{formatDateTime(c.closed_at)}</td>
                      <td>{formatDateTime(c.period_end)}</td>
                      <td className="sc-num">{pieces}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          <div className="sc-report-controls">
            <div className="tv-turn-switch" style={{ marginBottom: 0 }}>
              {[['day', 'Per giorno'], ['month', 'Per mese'], ['closure', 'Per chiusura']].map(([id, label]) => (
                <button
                  key={id}
                  className={`tv-turn-pill ${reportGroup === id ? 'tv-turn-pill--active' : ''}`}
                  onClick={() => setReportGroup(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <select className="sv-input sv-select" value={reportDays} onChange={(e) => setReportDays(Number(e.target.value))}>
              <option value={7}>Ultimi 7 giorni</option>
              <option value={30}>Ultimi 30 giorni</option>
              <option value={90}>Ultimi 90 giorni</option>
              <option value={365}>Ultimo anno</option>
            </select>
          </div>

          {reportError ? (
            <div className="db-empty-banner">{reportError}</div>
          ) : reportLoading ? (
            <div className="sv-loading"><ScSpinner /></div>
          ) : reportRows.length === 0 ? (
            <div className="db-card"><p className="db-card-empty">Nessun venduto nel periodo.</p></div>
          ) : (
            <>
              <div className="sc-totals">
                <div className="sc-total-card">
                  <span className="sc-total-label">Incasso</span>
                  <span className="sc-total-value">{formatMoney(reportTotals.revenue)}</span>
                </div>
                <div className="sc-total-card">
                  <span className="sc-total-label">Costo reale</span>
                  <span className="sc-total-value">{formatMoney(reportTotals.costReal)}</span>
                </div>
                <div className="sc-total-card">
                  <span className="sc-total-label">Costo stimato</span>
                  <span className="sc-total-value">{formatMoney(reportTotals.costEstimated)}</span>
                </div>
                <div className="sc-total-card sc-total-card--strong">
                  <span className="sc-total-label">Margine (costo reale)</span>
                  <span className="sc-total-value">{formatMoney(reportTotals.marginReal)}</span>
                </div>
                <div className="sc-total-card">
                  <span className="sc-total-label">Margine (costo stimato)</span>
                  <span className="sc-total-value">{formatMoney(reportTotals.marginEstimated)}</span>
                </div>
              </div>

              {reportTotals.linesWithoutCost > 0 && (
                <div className="db-empty-banner">
                  {reportTotals.linesWithoutCost} voc{reportTotals.linesWithoutCost !== 1 ? 'i' : 'e'} senza costo inserito
                  ({formatMoney(reportTotals.revenueWithoutCost)} di incasso): contano nell'incasso, non nel margine.
                </div>
              )}

              <div className="sc-table-wrap">
                <table className="sc-table">
                  <thead>
                    <tr>
                      <th>{reportGroup === 'closure' ? 'Chiusura' : reportGroup === 'month' ? 'Mese' : 'Giorno'}</th>
                      <th>Pezzi</th>
                      <th>Incasso</th>
                      <th>Costo reale</th>
                      <th>Margine reale</th>
                      <th>Costo stimato</th>
                      <th>Margine stimato</th>
                      <th title="Voci senza costo inserito: nell'incasso, fuori dal margine">Senza costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map(r => (
                      <tr key={r.bucket_key}>
                        <td>{bucketLabel(r.bucket_key)}</td>
                        <td className="sc-num">{r.pieces_count}</td>
                        <td className="sc-num">{formatMoney(r.revenue_gross)}</td>
                        <td className="sc-num">{formatMoney(r.cost_real)}</td>
                        <td className="sc-num"><strong>{formatMoney(r.margin_real)}</strong></td>
                        <td className="sc-num">{formatMoney(r.cost_estimated)}</td>
                        <td className="sc-num">{formatMoney(r.margin_estimated)}</td>
                        <td className="sc-num">{r.lines_without_cost > 0 ? `${r.lines_without_cost} (${formatMoney(r.revenue_without_cost)})` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Modal carico / rettifica */}
      {movementModal && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeMovement()}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">
                {movementModal.type === 'carico' ? 'Carico' : 'Rettifica'} — {movementModal.product.name}
              </h2>
              <button className="sv-modal-close" onClick={closeMovement} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <div className="sv-field">
                <label className="sv-label" htmlFor="sc-qty">
                  {movementModal.type === 'carico' ? 'Pezzi caricati' : 'Correzione in pezzi'}
                </label>
                <input
                  id="sc-qty"
                  className="sv-input"
                  type="number"
                  step="1"
                  value={movQty}
                  onChange={(e) => { setMovQty(e.target.value); setMovError(null) }}
                  placeholder={movementModal.type === 'carico' ? 'es. 24' : 'es. -2'}
                  autoFocus
                />
                {movementModal.type === 'rettifica' && (
                  <p className="sv-field-hint">
                    Negativo per togliere pezzi (rotture, ammanchi), positivo per aggiungerne. La giacenza non si sovrascrive mai: si corregge con un movimento.
                  </p>
                )}
              </div>

              {movementModal.type === 'carico' && (
                <div className="sv-field">
                  <label className="sv-label" htmlFor="sc-cost">Prezzo per pezzo (€, IVA esclusa)</label>
                  <input
                    id="sc-cost"
                    className="sv-input"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={movCost}
                    onChange={(e) => { setMovCost(e.target.value); setMovError(null) }}
                    placeholder="es. 0.6042"
                  />
                  <p className="sv-field-hint">
                    Da qui in avanti è questo il costo reale del prodotto. Le voci già inviate mantengono il costo che avevano.
                  </p>
                </div>
              )}

              <div className="sv-field">
                <label className="sv-label" htmlFor="sc-note">Nota <span className="sv-optional">(facoltativo)</span></label>
                <input
                  id="sc-note"
                  className="sv-input"
                  type="text"
                  value={movNote}
                  onChange={(e) => setMovNote(e.target.value)}
                  placeholder={movementModal.type === 'carico' ? 'es. consegna del fornitore' : 'es. inventario del lunedì'}
                />
              </div>

              {movError && <p className="sv-field-error">{movError}</p>}
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={closeMovement}>Annulla</button>
              <button className="sv-btn-save" onClick={saveMovement} disabled={movSaving}>
                {movSaving ? <ScSpinner small /> : null}
                {movSaving ? 'Salvataggio…' : 'Registra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal chiusura conteggio */}
      {closureModal && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeClosureModal()}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Chiudi conteggio</h2>
              <button className="sv-modal-close" onClick={closeClosureModal} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              {closureLoading ? (
                <div className="sv-loading"><ScSpinner /></div>
              ) : closureRows.length === 0 ? (
                <p className="db-card-empty">Nessun prodotto tracciato a magazzino.</p>
              ) : (
                <>
                  <p className="mn-empty-hint">
                    Venduto {closureBounds?.previousEnd && closureBounds.previousEnd !== '-infinity'
                      ? `dalla chiusura del ${formatDateTime(closureBounds.previousEnd)}`
                      : 'dall\'inizio'}
                    {closureBounds?.periodEnd ? ` fino alle ${formatDateTime(closureBounds.periodEnd)}` : ''}.
                    Correggi le quantità se il conteggio fisico dice altro: quello che confermi qui è ciò che verrà scalato.
                  </p>
                  <p className="mn-empty-hint" style={{ marginBottom: 8 }}>
                    Le voci inviate da ora in poi non vanno perse: finiranno nella prossima chiusura.
                  </p>

                  <div className="sv-list">
                    {closureRows.map(r => (
                      <div key={r.menuItemId} className="sv-row">
                        <div className="sv-row-main">
                          <div className="sv-row-top">
                            <span className="sv-name">{r.itemName}</span>
                            <div className="sv-row-badges">
                              <span className="db-badge db-badge--gray">proposti {r.proposed}</span>
                              {r.unitCost != null && (
                                <span className="db-badge db-badge--green">{formatMoney(r.unitCost, 4)}/pz</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="sv-row-actions">
                          <input
                            className="sv-input sc-qty-input"
                            type="number"
                            min="0"
                            step="1"
                            value={r.quantity}
                            onChange={(e) => setClosureQty(r.menuItemId, e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {closureError && <p className="sv-field-error" style={{ marginTop: 10 }}>{closureError}</p>}
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={closeClosureModal}>Annulla</button>
              <button
                className="sv-btn-save"
                onClick={confirmClosure}
                disabled={closureSaving || closureLoading || closureRows.length === 0}
              >
                {closureSaving ? <ScSpinner small /> : null}
                {closureSaving ? 'Conferma…' : 'Conferma chiusura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Icons ── */
function IconX() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function ScSpinner({ small }) {
  const s = small ? 14 : 18
  return <svg style={{ width: s, height: s, animation: 'sv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
