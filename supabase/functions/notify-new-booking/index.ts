import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const booking = body.record ?? body

    if (booking.status !== 'pending') {
      return new Response('skip', { status: 200 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('business_id', booking.business_id)

    if (!subs?.length) {
      return new Response('no_subscribers', { status: 200 })
    }

    webpush.setVapidDetails(
      'mailto:info@piumapp.com',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!
    )

    const payload = JSON.stringify({
      title: 'Nuova prenotazione',
      body: `${booking.customer_name} ha prenotato`,
      data: { bookingId: booking.id, url: '/dashboard?s=agenda' },
    })

    const staleIds: string[] = []
    await Promise.all(
      subs.map(async (row: { id: string; subscription: webpush.PushSubscription }) => {
        try {
          await webpush.sendNotification(row.subscription, payload)
        } catch (err: unknown) {
          if ((err as { statusCode?: number }).statusCode === 410) {
            staleIds.push(row.id)
          } else {
            console.error('push error for', row.id, err)
          }
        }
      })
    )

    if (staleIds.length > 0) {
      await supabaseAdmin.from('push_subscriptions').delete().in('id', staleIds)
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('notify-new-booking:', err)
    return new Response('error', { status: 500 })
  }
})
