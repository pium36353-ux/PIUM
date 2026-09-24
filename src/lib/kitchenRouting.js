// Unica fonte di verità per "a quale postazione/portata appartiene questa
// voce d'ordine" — usata sia dalla vista Cucina (Cucina.jsx) sia da
// qualunque altro punto che debba filtrare/raggruppare per postazione o
// portata (Ordine.jsx per l'invio, Menu.jsx per l'avviso categorie orfane),
// così i tre casi di ripiego sotto non possono divergere tra un punto e
// l'altro del codice.
//
// Tre casi trattati allo stesso modo, sempre risolti al volo (mai
// persistiti): la categoria non ha station_id/course_id, il piatto non ha
// categoria (menu_items.category_id NULL), il piatto è stato cancellato dal
// catalogo dopo l'ordine (item.menu_item_id NULL, la riga sopravvive grazie
// a item_name_snapshot). item è una riga di table_order_items caricata con
// l'embed `menu_items(category_id, menu_categories(station_id, course_id))`.

function categoryOf(item) {
  return item.menu_items?.menu_categories ?? null
}

// Ripiego alla prima postazione attiva in tutti e tre i casi sopra, PIÙ un
// quarto caso difensivo (station_id valorizzato ma quella postazione non è
// (più) tra le attive — non dovrebbe accadere, la disattivazione di una
// postazione con categorie assegnate è bloccata altrove, ma se accadesse
// comunque la voce non deve sparire da ogni vista cucina). Se non esiste
// nessuna postazione attiva, torna null — è compito del chiamante trattare
// null come "nessun filtro, mostra tutto" (vedi Cucina.jsx), mai come
// "nascondi tutto".
export function resolveStationId(item, activeStations) {
  const stationId = categoryOf(item)?.station_id ?? null
  if (stationId && activeStations.some((s) => s.id === stationId)) return stationId
  return activeStations[0]?.id ?? null
}

// Nessuna portata risolvibile (stessi tre casi) → "subito", non un ripiego
// alla prima portata: una voce senza portata determinabile va nella fascia
// senza portata in cima alla scheda, esattamente come una voce di una
// categoria dichiaratamente senza portata (es. bevande) — stesso
// trattamento, stessa fascia.
export function resolveCourseId(item, activeCourses) {
  const courseId = categoryOf(item)?.course_id ?? null
  if (courseId && activeCourses.some((c) => c.id === courseId)) return courseId
  return null
}

// Raggruppa una lista di voci per portata, ordinate per slot_number con la
// fascia "senza portata" (course: null) sempre in cima — stesso ordine visivo
// richiesto sia nella scheda cucina (Cucina.jsx) sia nella schermata ordine
// (Ordine.jsx, sezione "In cucina" e scelta d'invio), un solo posto dove
// questo ordinamento è definito.
export function groupItemsByCourse(items, activeCourses) {
  const map = new Map()
  for (const it of items) {
    const courseId = resolveCourseId(it, activeCourses)
    const key = courseId ?? '__none__'
    if (!map.has(key)) map.set(key, { course: activeCourses.find((c) => c.id === courseId) ?? null, items: [] })
    map.get(key).items.push(it)
  }
  return Array.from(map.values()).sort((a, b) => {
    if (!a.course) return -1
    if (!b.course) return 1
    return a.course.slot_number - b.course.slot_number
  })
}
