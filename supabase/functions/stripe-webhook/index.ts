import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Verify Stripe webhook signature using Web Crypto (no SDK needed)
async function verifyStripeSignature(body: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts     = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')))
    const timestamp = parts['t']
    const v1        = parts['v1']
    if (!timestamp || !v1) return false

    const payload   = `${timestamp}.${body}`
    const key       = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig       = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const computed  = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

    // Constant-time comparison to prevent timing attacks
    if (computed.length !== v1.length) return false
    let diff = 0
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ v1.charCodeAt(i)
    }
    return diff === 0
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  const body      = await req.text()
  const sigHeader = req.headers.get('stripe-signature') ?? ''
  const secret    = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET not set')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const valid = await verifyStripeSignature(body, sigHeader, secret)
  if (!valid) {
    console.error('Invalid Stripe webhook signature')
    return new Response('Invalid signature', { status: 400 })
  }

  let event: { type: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session     = event.data.object
    const bizId       = session['client_reference_id'] as string | null
    const subId       = session['subscription']        as string | null
    const customerId  = session['customer']            as string | null

    if (!bizId) {
      console.error('No client_reference_id in session')
      return new Response('Missing business id', { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')               ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')  ?? ''
    )

    const { error } = await supabase
      .from('businesses')
      .update({
        status:                  'active',
        plan:                    'active',
        ...(subId      ? { stripe_subscription_id: subId }     : {}),
        ...(customerId ? { stripe_customer_id:     customerId } : {}),
      })
      .eq('id', bizId)

    if (error) {
      console.error('DB update error:', error)
      return new Response('DB error', { status: 500 })
    }

    console.log(`Business ${bizId} activated via Stripe`)
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
