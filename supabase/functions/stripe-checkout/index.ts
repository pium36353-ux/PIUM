import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://www.piumapp.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')              ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data: biz } = await supabase
      .from('businesses')
      .select('id, stripe_customer_id, affiliate_code, plan_price')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!biz) {
      return new Response(JSON.stringify({ error: 'Business not found' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Create or reuse Stripe Customer
    let customerId = biz.stripe_customer_id as string | null
    if (!customerId) {
      const customerParams = new URLSearchParams()
      customerParams.set('metadata[supabase_user_id]', user.id)
      customerParams.set('metadata[business_id]', biz.id)

      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: customerParams.toString(),
        signal: AbortSignal.timeout(10_000),
      })

      if (!customerRes.ok) {
        const err = await customerRes.json()
        console.error('Stripe customer creation error:', err)
        return new Response(JSON.stringify({ error: 'Payment service error' }), {
          status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      const customer = await customerRes.json()
      customerId = customer.id as string

      const { error: dbErr } = await supabase
        .from('businesses')
        .update({ stripe_customer_id: customerId })
        .eq('id', biz.id)

      if (dbErr) {
        console.error('Failed to save stripe_customer_id:', dbErr)
      }
    }

    // Anti-duplicazione: un customer con una subscription già attiva o in trial
    // non deve poterne aprire una seconda — rischio di doppio addebito mensile.
    // Capita tipicamente quando lo status locale è disallineato da quello reale
    // su Stripe (es. blocco manuale admin su un cliente mai davvero sospeso lato
    // Stripe) e l'utente preme "Rinnova ora" per sbloccarsi. In quel caso non
    // apriamo un secondo checkout: riallineiamo lo status locale a quello vero
    // e segnaliamo al frontend che non c'è bisogno di pagare di nuovo.
    const existingSubsRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=all&limit=10`,
      {
        headers: { 'Authorization': `Bearer ${stripeKey}` },
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (existingSubsRes.ok) {
      const existingSubs = await existingSubsRes.json()
      const activeSub = (existingSubs.data ?? []).find(
        (s: { status: string }) => s.status === 'active' || s.status === 'trialing'
      )
      if (activeSub) {
        const newStatus = activeSub.status === 'trialing' ? 'trial' : 'active'
        const { error: realignErr } = await supabase
          .from('businesses')
          .update({ status: newStatus, stripe_subscription_id: activeSub.id })
          .eq('id', biz.id)
        if (realignErr) {
          console.error('stripe-checkout: realign error (non-blocking):', realignErr)
        }
        console.log(`stripe-checkout: business ${biz.id} ha già una subscription ${activeSub.status}, checkout evitato`)
        return new Response(JSON.stringify({ already_active: true }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    } else {
      console.error('stripe-checkout: impossibile verificare subscription esistenti, procedo comunque')
    }

    const priceId = Deno.env.get('STRIPE_PRICE_ID') ?? ''
    const checkoutParams = new URLSearchParams()
    checkoutParams.set('mode',                                  'subscription')
    checkoutParams.set('customer',                              customerId)
    checkoutParams.set('line_items[0][price]',                  priceId)
    checkoutParams.set('line_items[0][quantity]',               '1')
    checkoutParams.set('success_url',                           `${APP_URL}/dashboard?stripe_success=true`)
    checkoutParams.set('cancel_url',                            `${APP_URL}/dashboard`)
    checkoutParams.set('locale',                                'it')

    // Coupon sconto SOLO per il canale "-on" (codice affiliato che termina in -on, salvato lowercased).
    // Qualsiasi altro codice, o nessun codice → prezzo pieno (STRIPE_PRICE_ID), nessun coupon.
    if (biz.affiliate_code && biz.affiliate_code.toLowerCase().endsWith('-on')) {
      const coupon = Deno.env.get('STRIPE_COUPON_ON') ?? ''
      if (coupon) {
        checkoutParams.set('discounts[0][coupon]', coupon)
      }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: checkoutParams.toString(),
      signal: AbortSignal.timeout(10_000),
    })

    if (!stripeRes.ok) {
      const err = await stripeRes.json()
      console.error('Stripe checkout error:', err)
      return new Response(JSON.stringify({ error: 'Payment service error' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const session = await stripeRes.json()
    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('stripe-checkout error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
