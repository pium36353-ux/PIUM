// Ultima configurazione nota delle postazioni, salvata sul dispositivo.
//
// Serve a un caso preciso: la schermata Ordine deve sapere GIÀ
// all'apertura quali postazioni sono servite dalla sala, perché lo
// decide nello stesso istante in cui invia in cucina (vedi
// sendToKitchen). Senza questa copia esisteva una finestra fra
// l'apertura della schermata e la risposta della query in cui una
// bibita veniva trattata come un piatto normale — e senza rete quella
// finestra non si chiudeva mai.
//
// Non è una seconda verità: è la fotografia dell'ultima risposta del
// server, sovrascritta appena arriva quella nuova. Il server resta
// l'unica fonte; questa copia è un ripiego per il tempo in cui la
// risposta non c'è.
//
// Stesso trattamento degli altri valori salvati sul dispositivo nel
// verticale (postazione scelta, modalità, lucchetto): per business, e
// ogni accesso protetto — in navigazione privata o con lo storage
// negato si torna semplicemente all'elenco vuoto, che è il
// comportamento di prima.

function cacheKey(businessId) { return `pium_kitchen_stations_${businessId}` }

export function readCachedStations(businessId) {
  if (!businessId) return []
  try {
    const raw = window.localStorage.getItem(cacheKey(businessId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Whitelist della forma, non fiducia nel contenuto: lo storage è
    // modificabile a mano e una riga senza id farebbe risolvere la
    // postazione di una voce su un oggetto senza senso.
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s) => s && typeof s.id === 'string')
  } catch {
    return []
  }
}

export function writeCachedStations(businessId, stations) {
  if (!businessId) return
  try {
    // Solo i campi che servono a risolvere e a etichettare: la copia non
    // deve diventare un doppione della tabella.
    const slim = (stations ?? []).map((s) => ({
      id:                 s.id,
      name:               s.name,
      is_active:          s.is_active,
      served_by_hall:     s.served_by_hall ?? false,
      alert_level:        s.alert_level ?? 'forte',
      notification_label: s.notification_label ?? null,
    }))
    window.localStorage.setItem(cacheKey(businessId), JSON.stringify(slim))
  } catch { /* storage non disponibile: si resta sul comportamento senza copia */ }
}
