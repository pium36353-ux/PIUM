// Blocco "area di lavoro" per i dispositivi di sala e cucina — verticale
// 'ristorante_bar'. Quale area è bloccata è una scelta del DISPOSITIVO
// (vive in localStorage, non sul server): lo stesso locale può avere un
// tablet bloccato in sala e uno in cucina. Il codice di sblocco, invece, è
// una scelta del locale e sta su businesses.kiosk_pin.
//
// Non è una protezione di sicurezza: serve a evitare che un tocco
// involontario faccia uscire dall'area durante il servizio. Vedi la nota
// in testa a 20261018_kiosk_pin.sql.

// Sezioni raggiungibili da ciascuna area. 'tavoli' copre anche la
// schermata ordine, che è renderizzata da Tavoli.jsx e non è una sezione
// a sé: così il passaggio piantina → ordine → piantina resta libero senza
// bisogno di elencarlo qui.
// 'notifiche' (Notifiche sala) fa parte dell'area Sala: con il lucchetto
// attivo si passa liberamente fra piantina, ordine e notifiche, che sono
// le tre schermate di un cameriere in servizio. Il primo elemento
// dell'elenco è anche la sezione su cui il blocco riporta chi arriva da
// un deep-link fuori area (vedi Dashboard.jsx), quindi 'tavoli' resta
// primo.
export const KIOSK_AREAS = {
  sala:   { label: 'Sala',   sections: ['tavoli', 'notifiche'] },
  cucina: { label: 'Cucina', sections: ['cucina'] },
}

function lockKey(businessId) { return `pium_kiosk_lock_${businessId}` }

export function readKioskLock(businessId) {
  if (!businessId) return null
  let stored = null
  try { stored = window.localStorage.getItem(lockKey(businessId)) } catch { return null }
  // Whitelist esplicita: qualunque valore imprevisto (storage manomesso,
  // area rinominata in futuro) vale "non bloccato", non un blocco su una
  // sezione inesistente da cui sarebbe impossibile uscire.
  return stored && Object.prototype.hasOwnProperty.call(KIOSK_AREAS, stored) ? stored : null
}

export function writeKioskLock(businessId, area) {
  if (!businessId) return
  try {
    if (area) window.localStorage.setItem(lockKey(businessId), area)
    else window.localStorage.removeItem(lockKey(businessId))
  } catch { /* storage non disponibile: il blocco vale per questa sessione, non sopravvive al reload */ }
}

// Lo schermo intero va chiesto DENTRO il gestore del tocco, altrimenti il
// browser lo rifiuta: per questo viene chiamato dal pulsante e non dallo
// stato. Se il browser lo nega (iOS Safari su iPhone non lo consente), il
// blocco funziona comunque — nasconde solo il menu invece di coprire
// anche la barra del browser.
export function enterFullscreen() {
  try { document.documentElement.requestFullscreen?.().catch(() => {}) } catch { /* non supportato */ }
}

export function exitFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}) } catch { /* non supportato */ }
}
