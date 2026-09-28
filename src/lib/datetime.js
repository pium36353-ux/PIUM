// Fuso orario del business: UNICA costante condivisa di tutto il progetto.
// Oggi è fissa su Europe/Rome perché PIUM vende solo in Italia; quando
// arriveranno altri paesi diventerà una colonna del business e tutte le
// funzioni qui sotto riceveranno il fuso come parametro — le funzioni SQL
// dei resoconti (stock_report) lo accettano già proprio per questo.
//
// Regola: qualunque orario MOSTRATO all'utente va formattato con queste
// funzioni, mai con toLocaleString() nudo (userebbe il fuso del
// dispositivo: un tablet configurato male mostrerebbe orari diversi dalla
// sala), e mai lasciando vedere UTC. Qualunque raggruppamento per giorno
// o mese va fatto con businessDayKey/businessMonthKey, mai con
// getDate()/getMonth() del browser.
export const BUSINESS_TIMEZONE = 'Europe/Rome'

const dateTimeFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: BUSINESS_TIMEZONE,
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

const timeFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: BUSINESS_TIMEZONE,
  hour: '2-digit', minute: '2-digit',
})

const dateFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: BUSINESS_TIMEZONE,
  day: '2-digit', month: '2-digit', year: 'numeric',
})

// formatToParts invece di affidarsi al formato di un locale: il risultato
// deve essere esattamente 'YYYY-MM-DD', non qualcosa che gli assomiglia.
const partsFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
})

function partsOf(value) {
  const parts = partsFmt.formatToParts(new Date(value))
  const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day') }
}

export function formatDateTime(value) {
  if (!value) return ''
  return dateTimeFmt.format(new Date(value))
}

export function formatTime(value) {
  if (!value) return ''
  return timeFmt.format(new Date(value))
}

export function formatDate(value) {
  if (!value) return ''
  return dateFmt.format(new Date(value))
}

// Chiave di raggruppamento per giorno di calendario ITALIANO. Una voce
// inviata alle 00:30 del 28 in Italia appartiene al 28 anche se in UTC è
// ancora il 27 — Intl applica le regole del fuso, quindi vale identico in
// ora legale e in ora solare.
export function businessDayKey(value) {
  const { year, month, day } = partsOf(value)
  return `${year}-${month}-${day}`
}

export function businessMonthKey(value) {
  const { year, month } = partsOf(value)
  return `${year}-${month}`
}

// Etichette leggibili per le chiavi prodotte sopra (e dalla funzione SQL
// stock_report, che usa lo stesso formato).
export function formatDayKey(key) {
  if (!key) return ''
  const [y, m, d] = key.split('-')
  return `${d}/${m}/${y}`
}

export function formatMonthKey(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  const label = new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Estremi (istanti assoluti) del giorno italiano corrente e di N giorni
// indietro, per i filtri dei resoconti: si costruiscono dalla chiave del
// giorno italiano, non da mezzanotte del fuso del dispositivo.
export function businessDayRange(dayKey) {
  const from = new Date(`${dayKey}T00:00:00${timezoneOffsetFor(dayKey)}`)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from, to }
}

// Offset del fuso del business per una certa data (es. '+02:00' in ora
// legale, '+01:00' in ora solare): ricavato da Intl, non cablato, così i
// cambi di ora legale non richiedono nessuna manutenzione.
function timezoneOffsetFor(dayKey) {
  const probe = new Date(`${dayKey}T12:00:00Z`)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    timeZoneName: 'longOffset',
  })
  const name = fmt.formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const offset = name.replace('GMT', '')
  return offset || '+00:00'
}
