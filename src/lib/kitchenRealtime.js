import { supabase } from './supabase'

// Un solo canale Realtime condiviso concettualmente da Cucina.jsx, Tavoli.jsx
// e Ordine.jsx, ciascuno con la propria sottoscrizione: table_order_items non
// ha una colonna business_id diretta (RLS via join su table_orders →
// businesses, stesso pattern del resto del Blocco C), quindi il filtro
// `business_id=eq.…` di Realtime — usato per bookings in Dashboard.jsx — non
// è applicabile qui. La sottoscrizione arriva quindi senza filtro; RLS
// realtime scopa comunque le righe al proprietario, ma per difesa in
// profondità onChange (lato chiamante) riconcilia sempre con un reload
// completo invece di fidarsi del payload, così un evento imprevisto non
// lascia mai uno stato parziale (stessa regola esplicitamente richiesta per
// la riconnessione).
export function subscribeTableOrderItems(channelName, onChange, onStatusChange) {
  const channel = supabase.channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_order_items' }, onChange)
    .subscribe((status) => { onStatusChange?.(status) })
  return () => { try { supabase.removeChannel(channel) } catch { /* già rimosso o non ancora connesso */ } }
}

// "Chiama sala" — un segnale transitorio, non un dato da conservare: canale
// broadcast dedicato per business, nessuna riga in DB.
export function callSalaChannelName(businessId) {
  return `kitchen-call-${businessId}`
}

export function subscribeCallSala(businessId, onCall) {
  const channel = supabase.channel(callSalaChannelName(businessId))
    .on('broadcast', { event: 'call_sala' }, onCall)
    .subscribe()
  return () => { try { supabase.removeChannel(channel) } catch { /* già rimosso o non ancora connesso */ } }
}

export function sendCallSala(businessId) {
  supabase.channel(callSalaChannelName(businessId)).send({ type: 'broadcast', event: 'call_sala', payload: {} })
}

// Vibrazione (dove supportata) + suono breve. I browser bloccano l'audio
// finché l'utente non ha interagito con la pagina — AudioContext può
// lanciare o restare 'suspended': mai un errore visibile per l'utente se il
// suono non parte, è un avviso accessorio, non l'unico (vedi anche
// l'evidenza visiva richiesta a parte).
let sharedAudioCtx = null
export function notifyReady() {
  try { navigator.vibrate?.(200) } catch { /* non supportata */ }
  try {
    sharedAudioCtx = sharedAudioCtx ?? new (window.AudioContext || window.webkitAudioContext)()
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(() => {})
    const osc = sharedAudioCtx.createOscillator()
    const gain = sharedAudioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, sharedAudioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, sharedAudioCtx.currentTime + 0.4)
    osc.connect(gain).connect(sharedAudioCtx.destination)
    osc.start()
    osc.stop(sharedAudioCtx.currentTime + 0.4)
  } catch { /* audio non disponibile/bloccato, nessun errore visibile */ }
}
