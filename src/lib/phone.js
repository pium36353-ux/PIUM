// Normalizzazione numeri di telefono — mercato italiano.
// Assume che ogni numero senza prefisso esplicito sia italiano: è la regola
// giusta solo perché PIUM serve esclusivamente attività ed è pensato per
// clienti IT. Riportare tutti i numeri allo stesso formato (+39...) qui,
// all'inserimento, è ciò che permette a doImport/groupClients di riconoscere
// lo stesso numero scritto in formati diversi (spazi, prefisso o meno) come
// la stessa persona, ed è ciò che rende sempre validi i link wa.me costruiti
// da buildWaLink.
export function normalizePhone(raw) {
  if (!raw) return null
  const cleaned = raw.trim().replace(/[\s\-.()]/g, '')
  if (!cleaned) return null

  // Già in formato internazionale esplicito (anche estero, raro ma non lo tocchiamo).
  if (cleaned.startsWith('+')) return cleaned

  // Prefisso IDD invece del +.
  if (cleaned.startsWith('0039')) return '+39' + cleaned.slice(4)

  // "39" + numero nazionale (10 cifre tipiche di un mobile, o 9 di alcuni fissi)
  // scritto senza + davanti — lunghezza totale 11 o 12.
  if (cleaned.startsWith('39') && (cleaned.length === 11 || cleaned.length === 12)) {
    return '+' + cleaned
  }

  // Numero nazionale senza alcun prefisso (mobile 3xx a 10 cifre, o fisso a 9-10).
  if (cleaned.length === 9 || cleaned.length === 10) {
    return '+39' + cleaned
  }

  // Pattern non riconosciuto: meglio restituire grezzo (ripulito da spazi/punteggiatura)
  // che inventare un prefisso e rompere un numero valido ma anomalo.
  return cleaned
}

// Costruisce un link wa.me dal numero (normalizzato prima dell'uso) con
// messaggio precompilato opzionale. Unica implementazione condivisa — prima
// esisteva in 3 copie leggermente diverse (Clienti.jsx, Agenda.jsx x2, PublicSite.jsx),
// tutte con lo stesso difetto: numero passato grezzo, link rotto senza prefisso.
export function buildWaLink(phone, message) {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const digits = normalized.replace(/\D/g, '')
  if (digits.length < 6) return null
  const base = `https://wa.me/${digits}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
