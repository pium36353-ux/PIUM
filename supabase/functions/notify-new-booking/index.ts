import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

Deno.serve(async (req) => {
  const incomingSecret = req.headers.get('X-Webhook-Secret')
  const expectedSecret = Deno.env.get('NOTIFY_WEBHOOK_SECRET')

  if (!incomingSecret || !expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const encoder = new TextEncoder()
  const a = encoder.encode(incomingSecret)
  const b = encoder.encode(expectedSecret)
  if (a.length !== b.length || !crypto.subtle.timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const body = await req.json()
    const booking = body.record ?? body

    console.log('[notify] booking_id:', booking.id, 'status:', booking.status, 'business_id:', booking.business_id)

    if (booking.status !== 'pending') {
      console.log('[notify] skip — status non è pending')
      return new Response('skip', { status: 200 })
    }

    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!vapidPublic || !vapidPrivate) {
      console.error('[notify] ERRORE: VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY non configurati nei secrets')
      return new Response(JSON.stringify({ error: 'vapid_secrets_missing' }), { status: 500 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: subs, error: subsError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('business_id', booking.business_id)

    if (subsError) {
      console.error('[notify] Errore lettura push_subscriptions:', subsError.message)
      return new Response(JSON.stringify({ error: 'db_error', detail: subsError.message }), { status: 500 })
    }

    if (!subs?.length) {
      console.log('[notify] Nessuna subscription trovata per business_id:', booking.business_id)
      return new Response(JSON.stringify({ result: 'no_subscribers' }), { status: 200 })
    }

    console.log('[notify] Trovate', subs.length, 'subscription(s) — invio push...')

    webpush.setVapidDetails(
      'mailto:info@piumapp.com',
      vapidPublic,
      vapidPrivate,
    )

    const payload = JSON.stringify({
      title: 'Nuova prenotazione',
      body: `${booking.customer_name} ha prenotato`,
      data: { bookingId: booking.id, url: '/dashboard?s=agenda' },
    })

    const staleIds: string[] = []
    let sent = 0
    let failed = 0

    await Promise.all(
      subs.map(async (row: { id: string; subscription: webpush.PushSubscription }) => {
        try {
          await Promise.race([
            webpush.sendNotification(row.subscription, payload),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('push_timeout')), 5_000)
            ),
          ])
          sent++
          console.log('[notify] Push inviato OK — sub_id:', row.id)
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 410) {
            console.log('[notify] Subscription scaduta (410) — sub_id:', row.id, '— verrà eliminata')
            staleIds.push(row.id)
          } else {
            failed++
            console.error('[notify] ERRORE push — sub_id:', row.id, '— statusCode:', status, '— err:', String(err))
          }
        }
      })
    )

    if (staleIds.length > 0) {
      await supabaseAdmin.from('push_subscriptions').delete().in('id', staleIds)
      console.log('[notify] Eliminate', staleIds.length, 'subscription(s) scadute')
    }

    const result = { sent, failed, stale: staleIds.length }
    console.log('[notify] Risultato finale:', JSON.stringify(result))
    return new Response(JSON.stringify(result), {
      status: failed > 0 && sent === 0 ? 500 : 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[notify] Eccezione non gestita:', String(err))
    return new Response(JSON.stringify({ error: 'unexpected', detail: String(err) }), { status: 500 })
  }
})
