import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { ensureDefaultCourses, ensureDefaultStation } from '../../lib/kitchenSeed'
import { loadStockState } from '../../lib/stock'

const EMPTY_CATEGORY_FORM = { name: '' }
const EMPTY_ITEM_FORM = {
  name: '', price: '', category_id: '', is_available: true,
  // Blocco E — scorte e costi. vat_rate parte da 10 (aliquota di
  // somministrazione più comune), le altre vuote: track_stock spento di
  // default perché la stragrande maggioranza dei piatti non si conta a
  // pezzo, e una stima assente è uno stato legittimo ("costo non inserito").
  track_stock: false, min_stock: '', estimated_cost: '', vat_rate: '10',
}

function courseLabel(c) {
  if (!c) return 'Subito (nessuna portata)'
  return c.name?.trim() || `Portata ${c.slot_number}`
}

export default function Menu({ business, onBusinessPatch }) {
  const [categories,        setCategories]        = useState([])
  const [categoriesLoading, setCategoriesLoading]  = useState(true)
  const [items,             setItems]              = useState([])
  const [itemsLoading,      setItemsLoading]       = useState(true)

  /* ── Categorie ── */
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false)
  const [newCategoryName,     setNewCategoryName]     = useState('')
  const [addingCategory,      setAddingCategory]      = useState(false)
  const [confirmDeactivateCategoryId, setConfirmDeactivateCategoryId] = useState(null)
  const [busyCategoryId,      setBusyCategoryId]      = useState(null)

  /* ── Piatti ── */
  const [itemModal,     setItemModal]     = useState(null) // null | 'add' | 'edit'
  const [itemForm,      setItemForm]      = useState(EMPTY_ITEM_FORM)
  const [editingItemId, setEditingItemId] = useState(null)
  const [itemSaving,    setItemSaving]    = useState(false)
  const [itemErrors,    setItemErrors]    = useState({})
  const [flaggedFeedbackId, setFlaggedFeedbackId] = useState(null)
  const [flaggingId,        setFlaggingId]        = useState(null)

  /* ── Blocco D: portate ── */
  const [courses,        setCourses]        = useState([])
  const [coursesModalOpen, setCoursesModalOpen] = useState(false)
  const [confirmDeactivateCourseId, setConfirmDeactivateCourseId] = useState(null)
  const [busyCourseId,   setBusyCourseId]   = useState(null)
  const [addingCourse,   setAddingCourse]   = useState(false)
  const [fireImmediateSaving, setFireImmediateSaving] = useState(false)

  /* ── Blocco D: postazioni ── */
  const [stations,        setStations]        = useState([])
  const [stationsModalOpen, setStationsModalOpen] = useState(false)
  const [confirmDeactivateStationId, setConfirmDeactivateStationId] = useState(null)
  const [busyStationId,   setBusyStationId]   = useState(null)
  const [stationBlockedId, setStationBlockedId] = useState(null)
  const [newStationName,  setNewStationName]  = useState('')
  const [addingStation,   setAddingStation]   = useState(false)

  const loadCategories = useCallback(async (signal = null) => {
    if (!business) return
    setCategoriesLoading(true)
    const { data, error } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order')
    if (signal?.cancelled) return
    setCategoriesLoading(false)
    if (error) { console.error('[loadCategories]', error); return }
    setCategories(data ?? [])
  }, [business])

  // menu_item_flags(id) incluso solo per sapere, altrove (sezione Conferme
  // fine turno), quali piatti hanno segnalazioni pendenti — non mostrato
  // in questa vista, che resta il catalogo normale. menu_categories(name)
  // incluso per lo stesso motivo: mostrare la categoria come sottotitolo
  // nella lista delle conferme, senza una seconda query.
  const loadItems = useCallback(async (signal = null) => {
    if (!business) return
    setItemsLoading(true)
    const { data, error } = await supabase
      .from('menu_items')
      .select('*, menu_item_flags(id), menu_categories(name)')
      .eq('business_id', business.id)
      .order('name')
    if (signal?.cancelled) return
    setItemsLoading(false)
    if (error) { console.error('[loadItems]', error); return }
    setItems(data ?? [])
  }, [business])

  // Seeding condiviso con Cucina.jsx (vedi kitchenSeed.js) — qualunque delle
  // due schermate venga aperta per prima per un business senza ancora
  // portate/postazioni.
  const loadCourses = useCallback(async (signal = null) => {
    if (!business) return
    const data = await ensureDefaultCourses(business.id)
    if (signal?.cancelled) return
    setCourses(data)
  }, [business])

  const loadStations = useCallback(async (signal = null) => {
    if (!business) return
    const data = await ensureDefaultStation(business.id)
    if (signal?.cancelled) return
    setStations(data)
  }, [business])

  useEffect(() => {
    const signal = { cancelled: false }
    loadCategories(signal)
    return () => { signal.cancelled = true }
  }, [loadCategories])

  useEffect(() => {
    const signal = { cancelled: false }
    loadItems(signal)
    return () => { signal.cancelled = true }
  }, [loadItems])

  useEffect(() => {
    const signal = { cancelled: false }
    loadCourses(signal)
    return () => { signal.cancelled = true }
  }, [loadCourses])

  useEffect(() => {
    const signal = { cancelled: false }
    loadStations(signal)
    return () => { signal.cancelled = true }
  }, [loadStations])

  const activeCategories = useMemo(() => categories.filter(c => c.is_active), [categories])
  const activeCourses    = useMemo(() => courses.filter(c => c.is_active), [courses])
  const activeStations   = useMemo(() => stations.filter(s => s.is_active), [stations])

  // Categorie attive senza postazione assegnata — i loro piatti finiscono
  // comunque nella prima postazione attiva (vedi resolveStationId in
  // kitchenRouting.js, stessa funzione usata da Cucina.jsx), ma il
  // titolare deve vederlo finché non assegna esplicitamente.
  const orphanStationCategories = useMemo(() => categories.filter(c => c.is_active && !c.station_id), [categories])

  // Gruppi da mostrare: tutte le categorie attive (anche senza piatti, per
  // poterci aggiungere qualcosa subito) + le categorie disattivate che
  // hanno ancora piatti agganciati (mai persi di vista solo perché la
  // categoria è stata disattivata) + un gruppo finale per i piatti senza
  // categoria.
  const itemsByCategory = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      if (!item.category_id) continue
      if (!map.has(item.category_id)) map.set(item.category_id, [])
      map.get(item.category_id).push(item)
    }
    return map
  }, [items])

  const visibleCategories = useMemo(() => {
    return categories.filter(c => c.is_active || (itemsByCategory.get(c.id)?.length ?? 0) > 0)
  }, [categories, itemsByCategory])

  const uncategorizedItems = useMemo(() => items.filter(i => !i.category_id), [items])

  // Piatti con almeno una segnalazione pendente — una riga per piatto, non
  // per singola segnalazione, ordinati per numero di segnalazioni
  // decrescente poi alfabetico. Nessun raggruppamento per categoria, nessun
  // timestamp mostrato — vista pensata per un controllo veloce a fine
  // turno, non un log dettagliato.
  const flaggedItems = useMemo(() => {
    return items
      .map(i => ({ ...i, flagCount: i.menu_item_flags?.length ?? 0 }))
      .filter(i => i.flagCount > 0)
      .sort((a, b) => b.flagCount - a.flagCount || a.name.localeCompare(b.name))
  }, [items])

  /* ── Conferme fine turno ── */
  const [confirmationsModalOpen, setConfirmationsModalOpen] = useState(false)
  const [resolvingItemId,        setResolvingItemId]        = useState(null)

  /* ── Codice di blocco postazione ──
     Sta qui, nella gestione menu, perché è dove vivono già le preferenze
     di servizio del locale (es. "invia sempre tutto subito") e perché
     questa sezione è già riservata al verticale ristorante_bar; le
     impostazioni dell'account (/settings) sono condivise con tutti i
     verticali e non sarebbero il posto giusto. */
  const [kioskModalOpen, setKioskModalOpen] = useState(false)
  const [pinDraft,       setPinDraft]       = useState('')
  const [pinSaving,      setPinSaving]      = useState(false)
  const [pinError,       setPinError]       = useState(null)

  const openKioskModal = () => {
    setPinDraft(business.kiosk_pin ?? '')
    setPinError(null)
    setKioskModalOpen(true)
  }

  const saveKioskPin = async (nextPin) => {
    setPinSaving(true)
    setPinError(null)
    const { error } = await supabase.from('businesses').update({ kiosk_pin: nextPin }).eq('id', business.id)
    setPinSaving(false)
    if (error) {
      console.error('[saveKioskPin]', error)
      // Il caso tipico è la colonna non ancora creata: meglio dirlo che
      // lasciare un salvataggio che sembra riuscito.
      setPinError('Salvataggio non riuscito. Se la migration del codice di blocco non è stata applicata, la colonna non esiste ancora.')
      return
    }
    onBusinessPatch?.({ kiosk_pin: nextPin })
    setKioskModalOpen(false)
  }

  /* ── Blocco E: scorte esaurite ──
     Stato delle giacenze dalla libreria condivisa (stock.js), la stessa
     usata da Scorte.jsx: la stima mostrata qui e quella della sezione
     Scorte vengono per costruzione dallo stesso calcolo. */
  const [stockByItemId, setStockByItemId] = useState({})
  const [markingOutId,  setMarkingOutId]  = useState(null)

  const loadStock = useCallback(async (signal = null) => {
    if (!business) return
    const state = await loadStockState(business.id)
    if (signal?.cancelled || !state) return
    setStockByItemId(state.byItemId)
  }, [business])

  useEffect(() => {
    const signal = { cancelled: false }
    loadStock(signal)
    return () => { signal.cancelled = true }
  }, [loadStock])

  // Prodotti tracciati con giacenza stimata a zero o sotto: da confermare
  // esauriti a mano, MAI automaticamente (una giacenza a zero può essere
  // un conteggio da rettificare, non un prodotto finito davvero).
  const outOfStockItems = useMemo(() => {
    return items
      .filter((i) => i.track_stock && i.is_available)
      .map((i) => ({ ...i, stock: stockByItemId[i.id] }))
      .filter((i) => i.stock && i.stock.estimatedStock <= 0)
      .sort((a, b) => a.stock.estimatedStock - b.stock.estimatedStock || a.name.localeCompare(b.name))
  }, [items, stockByItemId])

  const markOutOfStock = async (item) => {
    setMarkingOutId(item.id)
    const { error } = await supabase.from('menu_items').update({ is_available: false }).eq('id', item.id)
    setMarkingOutId(null)
    if (error) { console.error('[markOutOfStock]', error); return }
    setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, is_available: false } : x))
  }

  const resolveFlags = async (item, markSoldOut) => {
    setResolvingItemId(item.id)
    if (markSoldOut) {
      const { error } = await supabase.from('menu_items').update({ is_available: false }).eq('id', item.id)
      if (error) { console.error('[resolveFlags availability]', error); setResolvingItemId(null); return }
    }
    // DELETE reale, non un resolved_at — vedi nota su menu_item_flags in
    // migration: sono segnalazioni transitorie senza valore storico da
    // conservare, a differenza del resto del progetto.
    const { error: delErr } = await supabase.from('menu_item_flags').delete().eq('menu_item_id', item.id)
    setResolvingItemId(null)
    if (delErr) { console.error('[resolveFlags delete]', delErr); return }
    setItems((prev) => prev.map((x) => x.id === item.id
      ? { ...x, is_available: markSoldOut ? false : x.is_available, menu_item_flags: [] }
      : x
    ))
  }

  /* ── CRUD categorie ── */
  const handleAddCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    setAddingCategory(true)
    const nextSort = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('menu_categories')
      .insert({ business_id: business.id, name, sort_order: nextSort })
      .select('*')
      .single()
    setAddingCategory(false)
    if (error) { console.error('[handleAddCategory]', error); return }
    setCategories((prev) => [...prev, data])
    setNewCategoryName('')
  }

  const handleRenameCategory = async (c, rawValue) => {
    const name = rawValue.trim()
    if (!name || name === c.name) return
    const { error } = await supabase.from('menu_categories').update({ name }).eq('id', c.id)
    if (error) { console.error('[handleRenameCategory]', error); return }
    setCategories((prev) => prev.map((x) => x.id === c.id ? { ...x, name } : x))
  }

  // Riordino: scambia sort_order con il vicino nella lista già ordinata —
  // nessun drag-and-drop, coerente con "CRUD semplice".
  const moveCategory = async (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= categories.length) return
    const a = categories[index]
    const b = categories[targetIndex]
    const [{ error: errA }, { error: errB }] = await Promise.all([
      supabase.from('menu_categories').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('menu_categories').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    if (errA || errB) { console.error('[moveCategory]', errA ?? errB); return }
    setCategories((prev) => {
      const next = [...prev]
      next[index]       = { ...a, sort_order: b.sort_order }
      next[targetIndex]  = { ...b, sort_order: a.sort_order }
      return next.sort((x, y) => x.sort_order - y.sort_order)
    })
  }

  const handleDeactivateCategory = async (c) => {
    setBusyCategoryId(c.id)
    const { error } = await supabase.from('menu_categories').update({ is_active: false }).eq('id', c.id)
    if (error) { console.error('[handleDeactivateCategory]', error); setBusyCategoryId(null); return }
    setCategories((prev) => prev.map((x) => x.id === c.id ? { ...x, is_active: false } : x))
    setBusyCategoryId(null)
    setConfirmDeactivateCategoryId(null)
  }

  const handleReactivateCategory = async (c) => {
    setBusyCategoryId(c.id)
    const { error } = await supabase.from('menu_categories').update({ is_active: true }).eq('id', c.id)
    if (error) { console.error('[handleReactivateCategory]', error); setBusyCategoryId(null); return }
    setCategories((prev) => prev.map((x) => x.id === c.id ? { ...x, is_active: true } : x))
    setBusyCategoryId(null)
  }

  const handleAssignCourse = async (c, courseId) => {
    const { error } = await supabase.from('menu_categories').update({ course_id: courseId }).eq('id', c.id)
    if (error) { console.error('[handleAssignCourse]', error); return }
    setCategories((prev) => prev.map((x) => x.id === c.id ? { ...x, course_id: courseId } : x))
  }

  const handleAssignStation = async (c, stationId) => {
    const { error } = await supabase.from('menu_categories').update({ station_id: stationId }).eq('id', c.id)
    if (error) { console.error('[handleAssignStation]', error); return }
    setCategories((prev) => prev.map((x) => x.id === c.id ? { ...x, station_id: stationId } : x))
  }

  /* ── CRUD portate — stesso identico pattern di business_turns in
     Tavoli.jsx, solo tabella diversa. ── */
  const handleRenameCourse = async (c, rawValue) => {
    const nextName = rawValue.trim() || null
    if (nextName === (c.name ?? null)) return
    const { error } = await supabase.from('business_courses').update({ name: nextName }).eq('id', c.id)
    if (error) { console.error('[handleRenameCourse]', error); return }
    setCourses((prev) => prev.map((x) => x.id === c.id ? { ...x, name: nextName } : x))
  }

  const handleAddCourse = async () => {
    setAddingCourse(true)
    const nextSlot = courses.length > 0 ? Math.max(...courses.map(c => c.slot_number)) + 1 : 1
    const { data, error } = await supabase
      .from('business_courses')
      .insert({ business_id: business.id, slot_number: nextSlot, name: null })
      .select('*')
      .single()
    setAddingCourse(false)
    if (error) { console.error('[handleAddCourse]', error); return }
    setCourses((prev) => [...prev, data])
  }

  const handleDeactivateCourse = async (c) => {
    setBusyCourseId(c.id)
    const { error } = await supabase.from('business_courses').update({ is_active: false }).eq('id', c.id)
    if (error) { console.error('[handleDeactivateCourse]', error); setBusyCourseId(null); return }
    setCourses((prev) => prev.map((x) => x.id === c.id ? { ...x, is_active: false } : x))
    setBusyCourseId(null)
    setConfirmDeactivateCourseId(null)
  }

  const handleReactivateCourse = async (c) => {
    setBusyCourseId(c.id)
    const { error } = await supabase.from('business_courses').update({ is_active: true }).eq('id', c.id)
    if (error) { console.error('[handleReactivateCourse]', error); setBusyCourseId(null); return }
    setCourses((prev) => prev.map((x) => x.id === c.id ? { ...x, is_active: true } : x))
    setBusyCourseId(null)
  }

  const toggleFireImmediate = async () => {
    const next = !business.kitchen_fire_immediately
    setFireImmediateSaving(true)
    const { error } = await supabase.from('businesses').update({ kitchen_fire_immediately: next }).eq('id', business.id)
    setFireImmediateSaving(false)
    if (error) { console.error('[toggleFireImmediate]', error); return }
    onBusinessPatch?.({ kitchen_fire_immediately: next })
  }

  /* ── CRUD postazioni ── */
  const handleRenameStation = async (s, rawValue) => {
    const name = rawValue.trim()
    if (!name || name === s.name) return
    const { error } = await supabase.from('kitchen_stations').update({ name }).eq('id', s.id)
    if (error) { console.error('[handleRenameStation]', error); return }
    setStations((prev) => prev.map((x) => x.id === s.id ? { ...x, name } : x))
  }

  const handleAddStation = async () => {
    const name = newStationName.trim()
    if (!name) return
    setAddingStation(true)
    const { data, error } = await supabase
      .from('kitchen_stations')
      .insert({ business_id: business.id, name })
      .select('*')
      .single()
    setAddingStation(false)
    if (error) { console.error('[handleAddStation]', error); return }
    setStations((prev) => [...prev, data])
    setNewStationName('')
  }

  // Disattivazione bloccata se ci sono ancora categorie attive assegnate a
  // questa postazione — altrimenti i loro piatti sparirebbero da ogni vista
  // cucina finché qualcuno non li riassegna. Controllo locale sulle
  // categorie già caricate, nessun round-trip in più.
  const handleDeactivateStation = async (s) => {
    const hasAssignedCategories = categories.some((c) => c.is_active && c.station_id === s.id)
    if (hasAssignedCategories) {
      setStationBlockedId(s.id)
      setTimeout(() => setStationBlockedId((cur) => cur === s.id ? null : cur), 4000)
      return
    }
    setBusyStationId(s.id)
    const { error } = await supabase.from('kitchen_stations').update({ is_active: false }).eq('id', s.id)
    if (error) { console.error('[handleDeactivateStation]', error); setBusyStationId(null); return }
    setStations((prev) => prev.map((x) => x.id === s.id ? { ...x, is_active: false } : x))
    setBusyStationId(null)
    setConfirmDeactivateStationId(null)
  }

  const handleReactivateStation = async (s) => {
    setBusyStationId(s.id)
    const { error } = await supabase.from('kitchen_stations').update({ is_active: true }).eq('id', s.id)
    if (error) { console.error('[handleReactivateStation]', error); setBusyStationId(null); return }
    setStations((prev) => prev.map((x) => x.id === s.id ? { ...x, is_active: true } : x))
    setBusyStationId(null)
  }

  /* ── CRUD piatti ── */
  const openAddItem = () => {
    setItemForm(EMPTY_ITEM_FORM)
    setItemErrors({})
    setEditingItemId(null)
    setItemModal('add')
  }

  const openEditItem = (item) => {
    setItemForm({
      name:        item.name,
      price:       item.price != null ? String(item.price) : '',
      category_id: item.category_id ?? '',
      is_available: item.is_available,
      track_stock:    !!item.track_stock,
      min_stock:      item.min_stock != null ? String(item.min_stock) : '',
      estimated_cost: item.estimated_cost != null ? String(item.estimated_cost) : '',
      vat_rate:       item.vat_rate != null ? String(item.vat_rate) : '10',
    })
    setItemErrors({})
    setEditingItemId(item.id)
    setItemModal('edit')
  }

  const closeItemModal = () => { setItemModal(null); setEditingItemId(null) }

  const setItemField = (field) => (e) => {
    const val = e.target.value
    setItemForm((f) => ({ ...f, [field]: val }))
    setItemErrors((er) => ({ ...er, [field]: null }))
  }

  // I vincoli qui rispecchiano quelli del database (menu_items_*_positive/
  // _non_negative): stessa regola in due posti di proposito — il DB è
  // l'invariante, questo è il messaggio leggibile prima di sbatterci.
  const validateItem = (f) => {
    const e = {}
    if (!f.name.trim()) e.name = 'Il nome è obbligatorio.'
    if (f.price !== '' && isNaN(Number(f.price))) e.price = 'Inserisci un numero valido.'
    if (f.estimated_cost !== '' && (isNaN(Number(f.estimated_cost)) || Number(f.estimated_cost) < 0))
      e.estimated_cost = 'Inserisci un costo valido (mai negativo).'
    if (f.vat_rate === '' || isNaN(Number(f.vat_rate)) || Number(f.vat_rate) < 0)
      e.vat_rate = 'Inserisci un\'aliquota valida.'
    if (f.track_stock && f.min_stock !== '' &&
        (isNaN(Number(f.min_stock)) || !Number.isInteger(Number(f.min_stock)) || Number(f.min_stock) <= 0))
      e.min_stock = 'Inserisci un numero intero maggiore di zero.'
    return e
  }

  const handleSaveItem = async () => {
    const e = validateItem(itemForm)
    setItemErrors(e)
    if (Object.keys(e).length > 0) return
    setItemSaving(true)

    const payload = {
      name:         itemForm.name.trim(),
      price:        itemForm.price !== '' ? Number(itemForm.price) : null,
      category_id:  itemForm.category_id || null,
      is_available: itemForm.is_available,
      track_stock:  itemForm.track_stock,
      // min_stock ha senso solo per un prodotto tracciato: se la spunta è
      // spenta la soglia viene azzerata invece di restare appesa a un
      // prodotto che non ha nessuna giacenza da confrontarci.
      min_stock:      itemForm.track_stock && itemForm.min_stock !== '' ? Number(itemForm.min_stock) : null,
      estimated_cost: itemForm.estimated_cost !== '' ? Number(itemForm.estimated_cost) : null,
      vat_rate:       Number(itemForm.vat_rate),
    }

    if (itemModal === 'add') {
      const { error } = await supabase.from('menu_items').insert({ ...payload, business_id: business.id })
      if (error) { console.error('[handleSaveItem insert]', error); setItemSaving(false); return }
    } else {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', editingItemId)
      if (error) { console.error('[handleSaveItem update]', error); setItemSaving(false); return }
    }

    setItemSaving(false)
    closeItemModal()
    loadItems()
  }

  // Toggle rapido disponibilità dalla riga, senza aprire il modale — stesso
  // pattern di toggleAvailable in Servizi.jsx.
  const toggleItemAvailable = async (item) => {
    const { error } = await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id)
    if (error) { console.error('[toggleItemAvailable]', error); return }
    setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, is_available: !x.is_available } : x))
  }

  // "Segnala esaurito": accessibile senza restrizioni, un tap = una riga in
  // menu_item_flags. Non cambia is_available — la conferma reale avviene
  // altrove (sezione Conferme fine turno). Nessuna limitazione su quante
  // volte si può segnalare: più righe si accumulano, è il conteggio a
  // contare, non un flag booleano.
  const handleFlagItem = async (item) => {
    setFlaggingId(item.id)
    const { error } = await supabase.from('menu_item_flags').insert({ menu_item_id: item.id })
    setFlaggingId(null)
    if (error) { console.error('[handleFlagItem]', error); return }
    setFlaggedFeedbackId(item.id)
    setTimeout(() => setFlaggedFeedbackId((cur) => cur === item.id ? null : cur), 1800)
  }

  if (!business) {
    return (
      <div className="db-section">
        <div className="db-empty-banner">Configura prima la tua attività.</div>
      </div>
    )
  }

  const renderItemRow = (item) => (
    <div key={item.id} className={`sv-row ${!item.is_available ? 'sv-row--inactive' : ''}`}>
      <div className="sv-row-main">
        <div className="sv-row-top">
          <span className="sv-name">{item.name}</span>
          <div className="sv-row-badges">
            {item.price != null && (
              <span className="sv-price">€{Number(item.price).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
            )}
            <span className={`sv-badge ${item.is_available ? 'sv-badge--green' : 'sv-badge--red'}`}>
              {item.is_available ? 'Disponibile' : 'Non disponibile'}
            </span>
          </div>
        </div>
      </div>
      <div className="sv-row-actions">
        <button
          className="mn-flag-btn"
          disabled={flaggingId === item.id}
          onClick={() => handleFlagItem(item)}
        >
          {flaggedFeedbackId === item.id ? 'Segnalato ✓' : 'Segnala esaurito'}
        </button>
        <button
          className="sv-action-btn"
          title={item.is_available ? 'Segna non disponibile' : 'Segna disponibile'}
          onClick={() => toggleItemAvailable(item)}
        >
          {item.is_available ? <IconEyeOff /> : <IconEye />}
        </button>
        <button className="sv-action-btn" title="Modifica" onClick={() => openEditItem(item)}>
          <IconEdit />
        </button>
      </div>
    </div>
  )

  return (
    <div className="db-section">

      {/* Toolbar */}
      <div className="db-section-toolbar">
        <p className="db-section-desc">
          {items.length > 0
            ? `${items.length} piatt${items.length !== 1 ? 'i' : 'o'} nel menu.`
            : 'Aggiungi i piatti del tuo menu.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="sv-btn-cancel mn-confirmations-btn" onClick={() => setConfirmationsModalOpen(true)}>
            Conferme fine turno
            {(flaggedItems.length + outOfStockItems.length) > 0 && (
              <span className="mn-badge-count">{flaggedItems.length + outOfStockItems.length}</span>
            )}
          </button>
          <button className="sv-btn-cancel" onClick={openKioskModal}>Blocco schermo</button>
          <button className="sv-btn-cancel" onClick={() => setStationsModalOpen(true)}>Postazioni</button>
          <button className="sv-btn-cancel" onClick={() => setCoursesModalOpen(true)}>Portate</button>
          <button className="sv-btn-cancel" onClick={() => setCategoriesModalOpen(true)}>Gestisci categorie</button>
          <button className="db-btn-primary" onClick={openAddItem}>+ Aggiungi piatto</button>
        </div>
      </div>

      {orphanStationCategories.length > 0 && (
        <div className="db-empty-banner">
          {orphanStationCategories.length} categori{orphanStationCategories.length !== 1 ? 'e' : 'a'} senza postazione assegnata — i piatti finiscono nella prima postazione attiva finché non l{orphanStationCategories.length !== 1 ? 'e' : 'a'} assegni da "Gestisci categorie".
        </div>
      )}

      {/* Elenco raggruppato per categoria */}
      {(categoriesLoading || itemsLoading) ? (
        <div className="sv-loading"><MnSpinner /></div>
      ) : items.length === 0 && categories.length === 0 ? (
        <div className="db-card">
          <p className="db-card-empty">Nessun piatto ancora. Crea prima qualche categoria, poi aggiungi i piatti.</p>
        </div>
      ) : (
        <div className="mn-groups">
          {visibleCategories.map((c) => (
            <div key={c.id} className="mn-group">
              <h3 className="mn-group-title">
                {c.name}
                {!c.is_active && <span className="db-badge db-badge--gray" style={{ marginLeft: 8 }}>Disattivata</span>}
              </h3>
              {(itemsByCategory.get(c.id) ?? []).length > 0 ? (
                <div className="sv-list">
                  {(itemsByCategory.get(c.id) ?? []).map(renderItemRow)}
                </div>
              ) : (
                <p className="mn-empty-hint">Nessun piatto in questa categoria.</p>
              )}
            </div>
          ))}

          {uncategorizedItems.length > 0 && (
            <div className="mn-group">
              <h3 className="mn-group-title">Senza categoria</h3>
              <div className="sv-list">
                {uncategorizedItems.map(renderItemRow)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal categorie */}
      {categoriesModalOpen && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && setCategoriesModalOpen(false)}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Categorie</h2>
              <button className="sv-modal-close" onClick={() => setCategoriesModalOpen(false)} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <div className="sv-list">
                {categories.map((c, index) => (
                  <div key={c.id} className={`sv-row ${!c.is_active ? 'sv-row--inactive' : ''}`}>
                    <div className="sv-row-main">
                      <input
                        className="sv-input"
                        type="text"
                        defaultValue={c.name}
                        disabled={!c.is_active}
                        onBlur={(e) => handleRenameCategory(c, e.target.value)}
                      />
                      <div className="mn-category-routing">
                        <select
                          className="sv-input sv-select"
                          value={c.course_id ?? ''}
                          disabled={!c.is_active}
                          title="Portata"
                          onChange={(e) => handleAssignCourse(c, e.target.value || null)}
                        >
                          <option value="">Subito (nessuna portata)</option>
                          {activeCourses.map(x => <option key={x.id} value={x.id}>{courseLabel(x)}</option>)}
                        </select>
                        <select
                          className={`sv-input sv-select ${!c.station_id ? 'sv-input--error' : ''}`}
                          value={c.station_id ?? ''}
                          disabled={!c.is_active}
                          title="Postazione"
                          onChange={(e) => handleAssignStation(c, e.target.value || null)}
                        >
                          <option value="">— Postazione non assegnata —</option>
                          {activeStations.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="sv-row-actions">
                      {c.is_active && (
                        <>
                          <button className="sv-action-btn" title="Sposta su" disabled={index === 0} onClick={() => moveCategory(index, -1)}>
                            <IconChevronUp />
                          </button>
                          <button className="sv-action-btn" title="Sposta giù" disabled={index === categories.length - 1} onClick={() => moveCategory(index, 1)}>
                            <IconChevronDown />
                          </button>
                        </>
                      )}
                      {!c.is_active ? (
                        <button className="mn-btn-reactivate" disabled={busyCategoryId === c.id} onClick={() => handleReactivateCategory(c)}>
                          {busyCategoryId === c.id ? <MnSpinner small /> : 'Riattiva'}
                        </button>
                      ) : confirmDeactivateCategoryId === c.id ? (
                        <div className="mn-confirm-row">
                          <span className="mn-confirm-label">Disattivare?</span>
                          <button className="sv-action-btn sv-action-btn--danger" disabled={busyCategoryId === c.id} onClick={() => handleDeactivateCategory(c)}>
                            {busyCategoryId === c.id ? <MnSpinner small /> : <IconCheck />}
                          </button>
                          <button className="sv-action-btn" onClick={() => setConfirmDeactivateCategoryId(null)}><IconX /></button>
                        </div>
                      ) : (
                        <button className="sv-action-btn sv-action-btn--danger" title="Disattiva" onClick={() => setConfirmDeactivateCategoryId(c.id)}>
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="sv-field" style={{ marginTop: 12 }}>
                <label className="sv-label" htmlFor="mn-new-category">Nuova categoria</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="mn-new-category"
                    className="sv-input"
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory() }}
                    placeholder="es. Antipasti"
                  />
                  <button className="db-btn-primary" onClick={handleAddCategory} disabled={addingCategory || !newCategoryName.trim()}>
                    {addingCategory ? <MnSpinner small /> : '+ Aggiungi'}
                  </button>
                </div>
              </div>
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={() => setCategoriesModalOpen(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal portate — stesso identico pattern del modale Turni in
          Tavoli.jsx (rinomina inline, aggiungi, disattiva/riattiva),
          più l'interruttore "invia sempre tutto subito" in testa: è
          l'unico posto dove ha senso, disattiva l'intera logica attesa/via. */}
      {coursesModalOpen && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && setCoursesModalOpen(false)}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Portate</h2>
              <button className="sv-modal-close" onClick={() => setCoursesModalOpen(false)} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <label className="sv-toggle-row" style={{ marginBottom: 12 }}>
                <div className="sv-toggle-text">
                  <span className="sv-toggle-label">Invia sempre tutto subito</span>
                  <span className="sv-toggle-hint">Se attivo, l'invio in cucina non chiede mai la scelta subito/in attesa tra portate.</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!business.kitchen_fire_immediately}
                  disabled={fireImmediateSaving}
                  className={`sv-toggle ${business.kitchen_fire_immediately ? 'sv-toggle--on' : ''}`}
                  onClick={toggleFireImmediate}
                >
                  <span className="sv-toggle-thumb" />
                </button>
              </label>

              <div className="sv-list">
                {courses.map(c => (
                  <div key={c.id} className={`sv-row ${!c.is_active ? 'sv-row--inactive' : ''}`}>
                    <div className="sv-row-main">
                      <input
                        className="sv-input"
                        type="text"
                        defaultValue={c.name ?? ''}
                        placeholder={`Portata ${c.slot_number}`}
                        disabled={!c.is_active}
                        onBlur={(e) => handleRenameCourse(c, e.target.value)}
                      />
                    </div>
                    <div className="sv-row-actions">
                      {!c.is_active ? (
                        <button className="mn-btn-reactivate" disabled={busyCourseId === c.id} onClick={() => handleReactivateCourse(c)}>
                          {busyCourseId === c.id ? <MnSpinner small /> : 'Riattiva'}
                        </button>
                      ) : confirmDeactivateCourseId === c.id ? (
                        <div className="mn-confirm-row">
                          <span className="mn-confirm-label">Disattivare?</span>
                          <button className="sv-action-btn sv-action-btn--danger" disabled={busyCourseId === c.id} onClick={() => handleDeactivateCourse(c)}>
                            {busyCourseId === c.id ? <MnSpinner small /> : <IconCheck />}
                          </button>
                          <button className="sv-action-btn" onClick={() => setConfirmDeactivateCourseId(null)}><IconX /></button>
                        </div>
                      ) : (
                        <button className="sv-action-btn sv-action-btn--danger" title="Disattiva" onClick={() => setConfirmDeactivateCourseId(c.id)}>
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button className="db-btn-primary" style={{ marginTop: 12 }} onClick={handleAddCourse} disabled={addingCourse}>
                {addingCourse ? <MnSpinner small /> : null} + Aggiungi portata
              </button>
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={() => setCoursesModalOpen(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal codice di blocco postazione */}
      {kioskModalOpen && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && setKioskModalOpen(false)}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Blocco schermo</h2>
              <button className="sv-modal-close" onClick={() => setKioskModalOpen(false)} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <p className="mn-empty-hint">
                Dalle sezioni Tavoli e Cucina il pulsante con il lucchetto blocca il dispositivo
                sull'area di lavoro: menu e altre sezioni spariscono, e il blocco resta anche dopo
                un aggiornamento della pagina. Si sblocca tenendo premuto il lucchetto.
              </p>
              <p className="mn-empty-hint" style={{ marginTop: 6 }}>
                Un codice di 4 cifre aggiunge una conferma allo sblocco. <strong>Non è una
                protezione di sicurezza</strong>: serve solo a evitare uscite involontarie durante
                il servizio.
              </p>

              <div className="sv-field sv-field--half" style={{ marginTop: 12 }}>
                <label className="sv-label" htmlFor="mn-kiosk-pin">
                  Codice <span className="sv-optional">(4 cifre, facoltativo)</span>
                </label>
                <input
                  id="mn-kiosk-pin"
                  className={`sv-input ${pinError ? 'sv-input--error' : ''}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={pinDraft}
                  onChange={(e) => { setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(null) }}
                  placeholder="es. 1234"
                />
                {pinError && <p className="sv-field-error">{pinError}</p>}
                <p className="sv-field-hint">
                  {business.kiosk_pin
                    ? 'Un codice è impostato: lo sblocco lo richiede.'
                    : 'Nessun codice impostato: lo sblocco avviene con la sola pressione lunga.'}
                </p>
              </div>
            </div>

            <div className="sv-modal-footer">
              {business.kiosk_pin && (
                <button
                  className="tv-btn-deactivate"
                  style={{ marginRight: 'auto' }}
                  disabled={pinSaving}
                  onClick={() => saveKioskPin(null)}
                >
                  Rimuovi codice
                </button>
              )}
              <button className="sv-btn-cancel" onClick={() => setKioskModalOpen(false)}>Annulla</button>
              <button
                className="sv-btn-save"
                disabled={pinSaving || pinDraft.length !== 4}
                onClick={() => saveKioskPin(pinDraft)}
              >
                {pinSaving ? <MnSpinner small /> : null}
                {pinSaving ? 'Salvataggio…' : 'Salva codice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal postazioni */}
      {stationsModalOpen && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && setStationsModalOpen(false)}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Postazioni</h2>
              <button className="sv-modal-close" onClick={() => setStationsModalOpen(false)} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <div className="sv-list">
                {stations.map(s => (
                  <div key={s.id} className={`sv-row ${!s.is_active ? 'sv-row--inactive' : ''}`}>
                    <div className="sv-row-main">
                      <input
                        className="sv-input"
                        type="text"
                        defaultValue={s.name}
                        disabled={!s.is_active}
                        onBlur={(e) => handleRenameStation(s, e.target.value)}
                      />
                      {stationBlockedId === s.id && (
                        <p className="sv-field-error">Sposta prima le categorie assegnate su un'altra postazione.</p>
                      )}
                    </div>
                    <div className="sv-row-actions">
                      {!s.is_active ? (
                        <button className="mn-btn-reactivate" disabled={busyStationId === s.id} onClick={() => handleReactivateStation(s)}>
                          {busyStationId === s.id ? <MnSpinner small /> : 'Riattiva'}
                        </button>
                      ) : confirmDeactivateStationId === s.id ? (
                        <div className="mn-confirm-row">
                          <span className="mn-confirm-label">Disattivare?</span>
                          <button className="sv-action-btn sv-action-btn--danger" disabled={busyStationId === s.id} onClick={() => handleDeactivateStation(s)}>
                            {busyStationId === s.id ? <MnSpinner small /> : <IconCheck />}
                          </button>
                          <button className="sv-action-btn" onClick={() => setConfirmDeactivateStationId(null)}><IconX /></button>
                        </div>
                      ) : (
                        <button className="sv-action-btn sv-action-btn--danger" title="Disattiva" onClick={() => setConfirmDeactivateStationId(s.id)}>
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="sv-field" style={{ marginTop: 12 }}>
                <label className="sv-label" htmlFor="mn-new-station">Nuova postazione</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="mn-new-station"
                    className="sv-input"
                    type="text"
                    value={newStationName}
                    onChange={(e) => setNewStationName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddStation() }}
                    placeholder="es. Bar"
                  />
                  <button className="db-btn-primary" onClick={handleAddStation} disabled={addingStation || !newStationName.trim()}>
                    {addingStation ? <MnSpinner small /> : '+ Aggiungi'}
                  </button>
                </div>
              </div>
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={() => setStationsModalOpen(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal piatto (add/edit) */}
      {itemModal && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeItemModal()}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">{itemModal === 'add' ? 'Nuovo piatto' : 'Modifica piatto'}</h2>
              <button className="sv-modal-close" onClick={closeItemModal} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              <div className="sv-field">
                <label className="sv-label" htmlFor="mn-name">Nome <span className="sv-required">*</span></label>
                <input
                  id="mn-name"
                  className={`sv-input ${itemErrors.name ? 'sv-input--error' : ''}`}
                  type="text"
                  value={itemForm.name}
                  onChange={setItemField('name')}
                  placeholder="es. Tagliatelle al ragù"
                  autoFocus
                />
                {itemErrors.name && <p className="sv-field-error">{itemErrors.name}</p>}
              </div>

              <div className="sv-fields-row">
                <div className="sv-field">
                  <label className="sv-label" htmlFor="mn-price">Prezzo (€) <span className="sv-optional">(facoltativo)</span></label>
                  <input
                    id="mn-price"
                    className={`sv-input ${itemErrors.price ? 'sv-input--error' : ''}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.price}
                    onChange={setItemField('price')}
                    placeholder="es. 12"
                  />
                  {itemErrors.price && <p className="sv-field-error">{itemErrors.price}</p>}
                </div>
                <div className="sv-field">
                  <label className="sv-label" htmlFor="mn-category">Categoria <span className="sv-optional">(facoltativo)</span></label>
                  <select id="mn-category" className="sv-input sv-select" value={itemForm.category_id} onChange={setItemField('category_id')}>
                    <option value="">— Nessuna —</option>
                    {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <label className="sv-toggle-row">
                <div className="sv-toggle-text">
                  <span className="sv-toggle-label">Disponibile</span>
                  <span className="sv-toggle-hint">Se spento, il piatto resta nel catalogo ma non è selezionabile</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={itemForm.is_available}
                  className={`sv-toggle ${itemForm.is_available ? 'sv-toggle--on' : ''}`}
                  onClick={() => setItemForm((f) => ({ ...f, is_available: !f.is_available }))}
                >
                  <span className="sv-toggle-thumb" />
                </button>
              </label>

              {/* Blocco E — scorte e costi. Il costo stimato serve ai
                  margini dei prodotti NON tracciati a magazzino; l'IVA
                  serve a scorporare il prezzo di vendita. Entrambi
                  fotografati sulla voce d'ordine al momento dell'invio,
                  quindi cambiarli qui non tocca mai i margini passati. */}
              <h3 className="mn-group-title" style={{ marginTop: 8 }}>Scorte e costi</h3>

              <div className="sv-fields-row">
                <div className="sv-field">
                  <label className="sv-label" htmlFor="mn-estimated-cost">
                    Costo stimato (€) <span className="sv-optional">(facoltativo, IVA esclusa)</span>
                  </label>
                  <input
                    id="mn-estimated-cost"
                    className={`sv-input ${itemErrors.estimated_cost ? 'sv-input--error' : ''}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.estimated_cost}
                    onChange={setItemField('estimated_cost')}
                    placeholder="es. 1.00"
                  />
                  {itemErrors.estimated_cost && <p className="sv-field-error">{itemErrors.estimated_cost}</p>}
                  <p className="sv-field-hint">Senza costo, il piatto entra nell'incasso ma non nel margine.</p>
                </div>
                <div className="sv-field">
                  <label className="sv-label" htmlFor="mn-vat">Aliquota IVA (%)</label>
                  <input
                    id="mn-vat"
                    className={`sv-input ${itemErrors.vat_rate ? 'sv-input--error' : ''}`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={itemForm.vat_rate}
                    onChange={setItemField('vat_rate')}
                    placeholder="10"
                  />
                  {itemErrors.vat_rate && <p className="sv-field-error">{itemErrors.vat_rate}</p>}
                </div>
              </div>

              <label className="sv-toggle-row">
                <div className="sv-toggle-text">
                  <span className="sv-toggle-label">Traccia a magazzino</span>
                  <span className="sv-toggle-hint">Solo per prodotti venduti a pezzo (bibite, dolci confezionati): carichi, giacenza e costo reale dall'ultimo carico</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={itemForm.track_stock}
                  className={`sv-toggle ${itemForm.track_stock ? 'sv-toggle--on' : ''}`}
                  onClick={() => setItemForm((f) => ({ ...f, track_stock: !f.track_stock }))}
                >
                  <span className="sv-toggle-thumb" />
                </button>
              </label>

              {itemForm.track_stock && (
                <div className="sv-field sv-field--half">
                  <label className="sv-label" htmlFor="mn-min-stock">
                    Soglia di riordino <span className="sv-optional">(facoltativo)</span>
                  </label>
                  <input
                    id="mn-min-stock"
                    className={`sv-input ${itemErrors.min_stock ? 'sv-input--error' : ''}`}
                    type="number"
                    min="1"
                    step="1"
                    value={itemForm.min_stock}
                    onChange={setItemField('min_stock')}
                    placeholder="es. 6"
                  />
                  {itemErrors.min_stock && <p className="sv-field-error">{itemErrors.min_stock}</p>}
                  <p className="sv-field-hint">Sotto questa quantità il prodotto compare in "Da riordinare" nella sezione Scorte.</p>
                </div>
              )}
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={closeItemModal}>Annulla</button>
              <button className="sv-btn-save" onClick={handleSaveItem} disabled={itemSaving}>
                {itemSaving ? <MnSpinner small /> : null}
                {itemSaving ? 'Salvataggio…' : itemModal === 'add' ? 'Aggiungi' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conferme fine turno — separato dalla vista normale del
          catalogo, non nel percorso quotidiano di chi si limita a segnalare
          un piatto. Nessuna restrizione di accesso reale (non esiste un
          ruolo staff distinto dal titolare in questo progetto): la
          separazione è solo di collocazione nell'interfaccia. */}
      {confirmationsModalOpen && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmationsModalOpen(false)}>
          <div className="sv-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">Conferme fine turno</h2>
              <button className="sv-modal-close" onClick={() => setConfirmationsModalOpen(false)} aria-label="Chiudi"><IconX /></button>
            </div>

            <div className="sv-modal-body">
              {/* Blocco E — parte a sé, sopra le segnalazioni manuali:
                  qui il sistema sa già che la giacenza stimata è finita,
                  ma l'esaurito resta SEMPRE una conferma del titolare
                  (una giacenza a zero può essere un conteggio da
                  rettificare, non un prodotto finito davvero). */}
              {outOfStockItems.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 className="mn-group-title">Scorte esaurite ({outOfStockItems.length})</h3>
                  <p className="mn-empty-hint" style={{ marginBottom: 8 }}>
                    Giacenza stimata a zero o sotto. Nessun prodotto viene mai segnato esaurito da solo.
                  </p>
                  <div className="sv-list">
                    {outOfStockItems.map(item => (
                      <div key={item.id} className="sv-row">
                        <div className="sv-row-main">
                          <div className="sv-row-top">
                            <span className="sv-name">{item.name}</span>
                            <div className="sv-row-badges">
                              <span className="db-badge db-badge--red">
                                Stima: {item.stock.estimatedStock} pz
                              </span>
                            </div>
                          </div>
                          <p className="mn-empty-hint" style={{ marginTop: 2 }}>
                            Registrata {item.stock.registeredStock} pz, venduti non ancora chiusi {item.stock.soldNotClosed} pz
                          </p>
                        </div>
                        <div className="sv-row-actions">
                          <button
                            className="mn-btn-sold-out"
                            disabled={markingOutId === item.id}
                            onClick={() => markOutOfStock(item)}
                          >
                            {markingOutId === item.id ? <MnSpinner small /> : null}
                            Segna esaurito
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {flaggedItems.length === 0 ? (
                <p className="db-card-empty">Nessuna segnalazione al momento.</p>
              ) : (
                <div className="sv-list">
                  {flaggedItems.map(item => (
                    <div key={item.id} className="sv-row">
                      <div className="sv-row-main">
                        <div className="sv-row-top">
                          <span className="sv-name">{item.name}</span>
                          <div className="sv-row-badges">
                            <span className="db-badge db-badge--red">
                              {item.flagCount} segnalazion{item.flagCount !== 1 ? 'i' : 'e'}
                            </span>
                          </div>
                        </div>
                        {item.menu_categories?.name && (
                          <p className="mn-empty-hint" style={{ marginTop: 2 }}>{item.menu_categories.name}</p>
                        )}
                      </div>
                      <div className="sv-row-actions">
                        <button
                          className="sv-btn-cancel"
                          disabled={resolvingItemId === item.id}
                          onClick={() => resolveFlags(item, false)}
                        >
                          Ignora, resta disponibile
                        </button>
                        <button
                          className="mn-btn-sold-out"
                          disabled={resolvingItemId === item.id}
                          onClick={() => resolveFlags(item, true)}
                        >
                          {resolvingItemId === item.id ? <MnSpinner small /> : null}
                          Segna esaurito davvero
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sv-modal-footer">
              <button className="sv-btn-cancel" onClick={() => setConfirmationsModalOpen(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Icons ── */
function IconEdit()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function IconTrash()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> }
function IconEye()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
function IconEyeOff()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> }
function IconCheck()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconX()       { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function IconChevronUp()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg> }
function IconChevronDown() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg> }
function MnSpinner({ small }) {
  const s = small ? 14 : 18
  return <svg style={{ width: s, height: s, animation: 'sv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>
}
