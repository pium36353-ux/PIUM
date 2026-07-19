import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const COMMISSION_AMOUNT = 25.00
const COMMISSION_MONTHS_CAP = 12

// Verify Stripe webhook signature using Web Crypto (no SDK needed)
async function verifyStripeSignature(body: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts     = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')))
    const timestamp = parts['t']
    const v1        = parts['v1']
    if (!timestamp || !v1) return false

    // Reject webhooks older than 5 minutes to prevent replay attacks
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false

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
  try {
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')              ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (event.type === 'checkout.session.completed') {
      const session    = event.data.object
      const customerId = session['customer']     as string | null
      const subId      = session['subscription'] as string | null

      if (!customerId) {
        console.error('No customer in checkout session')
        return new Response('Missing customer', { status: 400 })
      }

      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (bizErr || !biz) {
        console.error('Business not found for customer:', customerId, bizErr)
        return new Response('Business not found', { status: 404 })
      }

      const updateData: Record<string, unknown> = {
        status: 'active',
        plan:   'active',
        ...(subId ? { stripe_subscription_id: subId } : {}),
      }

      if (subId) {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` },
          signal: AbortSignal.timeout(10_000),
        })
        if (subRes.ok) {
          const sub = await subRes.json()
          if (sub.trial_end) {
            updateData.trial_ends_at = new Date(sub.trial_end * 1000).toISOString()
          }
        }
      }

      const { error } = await supabase
        .from('businesses')
        .update(updateData)
        .eq('id', biz.id)

      if (error) {
        console.error('DB update error (checkout.session.completed):', error)
        return new Response('DB error', { status: 500 })
      }

      console.log(`Business ${biz.id} activated via Stripe checkout`)
    }

    else if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object
      const customerId   = subscription['customer'] as string | null
      const subId        = subscription['id']       as string | null
      const subStatus    = subscription['status']   as string | null

      if (!customerId) {
        console.error('No customer in subscription.updated')
        return new Response('Missing customer', { status: 400 })
      }

      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (bizErr || !biz) {
        console.error('Business not found for customer:', customerId, bizErr)
        return new Response('Business not found', { status: 404 })
      }

      const statusMap: Record<string, string> = {
        trialing: 'trial',
        active:   'active',
        past_due: 'suspended',
        canceled: 'expired',
      }
      const newStatus = statusMap[subStatus ?? '']

      const updateData: Record<string, unknown> = {
        ...(newStatus ? { status: newStatus } : {}),
        ...(subId     ? { stripe_subscription_id: subId } : {}),
      }

      const { error } = await supabase
        .from('businesses')
        .update(updateData)
        .eq('id', biz.id)

      if (error) {
        console.error('DB update error (customer.subscription.updated):', error)
        return new Response('DB error', { status: 500 })
      }

      console.log(`Business ${biz.id} subscription updated: ${subStatus} → ${newStatus ?? '(unmapped)'}`)
    }

    else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      const customerId   = subscription['customer'] as string | null

      if (!customerId) {
        console.error('No customer in subscription.deleted')
        return new Response('Missing customer', { status: 400 })
      }

      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (bizErr || !biz) {
        console.error('Business not found for customer:', customerId, bizErr)
        return new Response('Business not found', { status: 404 })
      }

      const { error } = await supabase
        .from('businesses')
        .update({ status: 'expired', plan: 'free' })
        .eq('id', biz.id)

      if (error) {
        console.error('DB update error (customer.subscription.deleted):', error)
        return new Response('DB error', { status: 500 })
      }

      console.log(`Business ${biz.id} subscription deleted → expired/free`)
    }

    else if (event.type === 'invoice.paid') {
      const invoice    = event.data.object
      const customerId = invoice['customer'] as string | null
      const invoiceId  = invoice['id']       as string | null

      if (!customerId || !invoiceId) {
        console.log('invoice.paid: missing customer or invoice id, skipping')
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .select('id, affiliate_code')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (bizErr || !biz || !biz.affiliate_code) {
        console.log(`invoice.paid: no business or no affiliate_code for customer ${customerId}, skipping`)
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      const { data: aff, error: affErr } = await supabase
        .from('affiliates')
        .select('id, status')
        .eq('code', biz.affiliate_code)
        .maybeSingle()

      if (affErr || !aff || aff.status !== 'approved') {
        console.log(`invoice.paid: affiliate not found or not approved for code ${biz.affiliate_code}, skipping`)
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      const { count, error: countErr } = await supabase
        .from('affiliate_commissions')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', biz.id)

      if (countErr) {
        console.error('invoice.paid: error counting commissions:', countErr)
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      const existingCount = count ?? 0
      if (existingCount >= COMMISSION_MONTHS_CAP) {
        console.log(`invoice.paid: commission cap (${COMMISSION_MONTHS_CAP}) reached for business ${biz.id}, skipping`)
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      const { error: insertErr } = await supabase
        .from('affiliate_commissions')
        .insert({
          affiliate_id:      aff.id,
          business_id:       biz.id,
          stripe_invoice_id: invoiceId,
          amount:            COMMISSION_AMOUNT,
          month_number:      existingCount + 1,
          status:            'pending',
        })

      if (insertErr) {
        if ((insertErr as { code?: string }).code === '23505') {
          console.log(`invoice.paid: duplicate invoice ${invoiceId} (Stripe retry), skipping`)
        } else {
          console.error('invoice.paid: insert error (non-blocking):', insertErr)
        }
      } else {
        console.log(`invoice.paid: commission ${existingCount + 1}/${COMMISSION_MONTHS_CAP} recorded for business ${biz.id}, affiliate ${aff.id}`)
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('stripe-webhook unhandled error:', err?.message ?? String(err))
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
