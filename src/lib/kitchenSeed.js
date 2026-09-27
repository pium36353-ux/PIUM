import { supabase } from './supabase'

// Seeding delle 4 portate di default, condiviso da Menu.jsx e Cucina.jsx —
// qualunque delle due schermate venga aperta per prima per un business
// ristorante_bar senza ancora nessuna portata. Upsert con onConflict sul
// vincolo (business_id, slot_number): se due dispositivi aprono una delle
// due schermate nello stesso momento, chi arriva secondo non fallisce,
// semplicemente non crea righe in più.
export async function ensureDefaultCourses(businessId) {
  const { data, error } = await supabase
    .from('business_courses').select('*').eq('business_id', businessId).order('slot_number')
  if (error) { console.error('[ensureDefaultCourses load]', error); return [] }
  if (data.length > 0) return data
  const rows = [1, 2, 3, 4].map((n) => ({ business_id: businessId, slot_number: n, name: null }))
  const { error: seedErr } = await supabase
    .from('business_courses').upsert(rows, { onConflict: 'business_id,slot_number', ignoreDuplicates: true })
  if (seedErr) { console.error('[ensureDefaultCourses seed]', seedErr); return data }
  const { data: reloaded, error: reloadErr } = await supabase
    .from('business_courses').select('*').eq('business_id', businessId).order('slot_number')
  if (reloadErr) { console.error('[ensureDefaultCourses reload]', reloadErr); return data }
  return reloaded ?? []
}

// Seeding della postazione "Cucina" di default, stesso principio. L'indice
// unico su kitchen_stations è su (business_id, lower(name)) — un'espressione,
// non colonne semplici — quindi non è un target valido per
// upsert.onConflict: un insert normale con 23505 trattato come "esiste già"
// è l'unica via (indicazione esplicita).
export async function ensureDefaultStation(businessId) {
  const { data, error } = await supabase
    .from('kitchen_stations').select('*').eq('business_id', businessId).order('created_at')
  if (error) { console.error('[ensureDefaultStation load]', error); return [] }
  if (data.length > 0) return data
  const { error: seedErr } = await supabase.from('kitchen_stations').insert({ business_id: businessId, name: 'Cucina' })
  if (seedErr && seedErr.code !== '23505') { console.error('[ensureDefaultStation seed]', seedErr); return data }
  const { data: reloaded, error: reloadErr } = await supabase
    .from('kitchen_stations').select('*').eq('business_id', businessId).order('created_at')
  if (reloadErr) { console.error('[ensureDefaultStation reload]', reloadErr); return data }
  return reloaded ?? []
}
