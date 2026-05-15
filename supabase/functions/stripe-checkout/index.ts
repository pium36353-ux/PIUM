import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = 'https://www.piumapp.com'

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
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name, status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!biz) {
      return new Response(JSON.stringify({ error: 'Business not found' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (biz.status === 'active') {
      return new Response(JSON.stringify({ error: 'Already active' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Create Checkout session via Stripe REST API (no SDK needed — avoids Deno compat issues)
    const params = new URLSearchParams({
      mode:                                                  'subscription',
      'payment_method_types[]':                              'card',
      customer_email:                                        user.email ?? '',
      client_reference_id:                                   biz.id,
      'line_items[0][price_data][currency]':                 'eur',
      'line_items[0][price_data][unit_amount]':              '9900',
      'line_items[0][price_data][recurring][interval]':      'month',
      'line_items[0][price_data][product_data][name]':       'PIUM — Piano Mensile',
      'line_items[0][price_data][product_data][description]':'Accesso completo alla piattaforma PIUM per la tua attività',
      'line_items[0][quantity]':                             '1',
      success_url:                                           `${APP_URL}/dashboard?stripe_success=true`,
      cancel_url:                                            `${APP_URL}/dashboard`,
      locale:                                                'it',
    })

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${stripeKey}`,
        'Content-Type':   'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!stripeRes.ok) {
      const err = await stripeRes.json()
      console.error('Stripe error:', err)
      return new Response(JSON.stringify({ error: err?.error?.message ?? 'Stripe error' }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const session = await stripeRes.json()

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (_err) {
    console.error(_err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
