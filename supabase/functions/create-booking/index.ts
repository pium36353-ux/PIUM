import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Messaggi d'errore già pronti per l'utente sollevati da create_booking (RAISE EXCEPTION).
// Solo questi vengono inoltrati verbatim al client; qualunque altro errore → messaggio generico,
// per non far trapelare dettagli interni del DB.
const KNOWN_BOOKING_ERRORS = [
  'Servizio non disponibile',
  'Hai già una prenotazione in attesa',
  'Orario fuori dagli orari di apertura',
  'chiusa nel giorno selezionato',
  'La data selezionata è già passata',
  'Indirizzo email non valido',
  'Numero di telefono non valido',
  'momentaneamente pieno',
  'Troppe richieste in poco tempo',
  'Orario non più disponibile',
]

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function clientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim() || null
  return null
}

// Verifica il token Cloudflare Turnstile lato server.
async function verifyTurnstile(token: string, secret: string, ip: string | null): Promise<boolean> {
  try {
    const body = new URLSearchParams()
    body.set('secret', secret)
    body.set('response', token)
    if (ip) body.set('remoteip', ip)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return false
    const data = await res.json()
    return data?.success === true
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    let payload: Record<string, unknown>
    try {
      payload = await req.json()
    } catch {
      return json({ error: 'Richiesta non valida.' }, 400)
    }

    // ── Anti-bot: verifica Turnstile (attiva solo se il secret è configurato) ──
    const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? ''
    if (turnstileSecret) {
      const token = typeof payload.turnstile_token === 'string' ? payload.turnstile_token : ''
      if (!token) {
        return json({ error: 'Verifica di sicurezza mancante. Ricarica la pagina e riprova.' }, 400)
      }
      const ok = await verifyTurnstile(token, turnstileSecret, clientIp(req))
      if (!ok) {
        return json({ error: 'Verifica di sicurezza non superata. Riprova.' }, 403)
      }
    }
    // Se TURNSTILE_SECRET_KEY non è configurato la verifica viene saltata (rollout in due tempi):
    // la function resta funzionante ma senza anti-bot finché non imposti il secret.

    // ── Validazione minima dei campi obbligatori (il grosso lo fa la RPC) ──
    const businessId    = payload.business_id
    const serviceId     = payload.service_id
    const customerName  = payload.customer_name
    const customerEmail = payload.customer_email
    const date          = payload.date
    const time          = payload.time
    if (
      typeof businessId !== 'string' || typeof serviceId !== 'string' ||
      typeof customerName !== 'string' || typeof customerEmail !== 'string' ||
      typeof date !== 'string' || typeof time !== 'string'
    ) {
      return json({ error: 'Dati della prenotazione incompleti.' }, 400)
    }

    // ── Chiamata alla RPC via service_role (bypassa i grant anon/authenticated) ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')              ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabase.rpc('create_booking', {
      p_business_id:    businessId,
      p_service_id:     serviceId,
      p_customer_name:  customerName,
      p_customer_email: customerEmail,
      p_customer_phone: typeof payload.customer_phone === 'string' ? payload.customer_phone : null,
      p_date:           date,
      p_time:           time,
      p_service_names:  typeof payload.service_names === 'string' ? payload.service_names : null,
      p_service_ids:    Array.isArray(payload.service_ids) ? payload.service_ids : null,
    })

    if (error) {
      const msg = error.message ?? ''
      const known = KNOWN_BOOKING_ERRORS.find(k => msg.includes(k))
      if (known) {
        // Errore di business atteso: inoltra il messaggio chiaro all'utente.
        return json({ error: msg }, 400)
      }
      // Errore inatteso: non far trapelare dettagli interni.
      console.error('[create-booking] RPC error:', msg)
      return json({ error: 'Si è verificato un errore. Riprova tra qualche istante.' }, 500)
    }

    return json({ id: data }, 200)

  } catch (err) {
    console.error('[create-booking] unhandled error:', (err as { message?: string })?.message ?? String(err))
    return json({ error: 'Si è verificato un errore. Riprova tra qualche istante.' }, 500)
  }
})
