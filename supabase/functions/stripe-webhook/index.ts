import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Commissioni affiliato — UNICO punto di configurazione (facile da modificare) ──
const COMMISSION_TIER_MONTHS = 12      // mesi 1..12 tariffa piena; oltre, tariffa ridotta (nessun cap)
const COMMISSION_FULL  = 29.99         // canale FULL (cliente paga 99,99€), mesi 1..12
const COMMISSION_ON    = 19.99         // canale ON  (cliente paga 69,99€), mesi 1..12
const COMMISSION_LATE  = 15.00         // qualsiasi canale, mesi > 12 (commissione a vita)

// Tier deciso dal suffisso "-on" del codice (robusto, a prova di IVA/proration),
// non da amount_paid. Oltre i 12 mesi vale la tariffa ridotta per entrambi i canali.
function commissionFor(hadOnSuffix: boolean, monthNumber: number): number {
  if (monthNumber > COMMISSION_TIER_MONTHS) return COMMISSION_LATE
  return hadOnSuffix ? COMMISSION_ON : COMMISSION_FULL
}

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
      const invoice        = event.data.object
      const customerId     = invoice['customer']     as string | null
      const invoiceId      = invoice['id']           as string | null
      const subscriptionId = invoice['subscription'] as string | null
      const amountPaid     = (invoice['amount_paid'] as number | null) ?? null   // centesimi, solo per cross-check nei log

      if (!customerId || !invoiceId) {
        console.log('invoice.paid: missing customer or invoice id, skipping')
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .select('id, status, affiliate_code')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (bizErr || !biz) {
        console.log(`invoice.paid: no business found for customer ${customerId}, skipping`)
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      // Riattivazione: una fattura pagata è il segnale più diretto che il cliente
      // è in regola, ma NON ci fidiamo solo dell'evento fattura — rileggiamo lo
      // stato REALE della subscription su Stripe prima di scrivere 'active', per
      // non riattivare un business la cui subscription resta past_due per altre
      // fatture ancora insolute. Corregge qualunque disallineamento tra status
      // locale e Stripe, incluso un blocco manuale admin su un cliente la cui
      // subscription in realtà non si è mai fermata.
      if (subscriptionId && biz.status !== 'active') {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` },
          signal: AbortSignal.timeout(10_000),
        })
        if (subRes.ok) {
          const sub = await subRes.json()
          if (sub.status === 'active' || sub.status === 'trialing') {
            const newStatus = sub.status === 'trialing' ? 'trial' : 'active'
            const { error: reactivateErr } = await supabase
              .from('businesses')
              .update({ status: newStatus })
              .eq('id', biz.id)
            if (reactivateErr) {
              console.error('invoice.paid: reactivation error (non-blocking):', reactivateErr)
            } else {
              console.log(`invoice.paid: business ${biz.id} riallineato a status=${newStatus}`)
            }
          } else {
            console.log(`invoice.paid: subscription ${subscriptionId} status=${sub.status}, nessuna riattivazione`)
          }
        } else {
          console.error('invoice.paid: impossibile leggere la subscription per la riattivazione')
        }
      }

      if (!biz.affiliate_code) {
        console.log(`invoice.paid: no affiliate_code for customer ${customerId}, skipping commission`)
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      // Il suffisso "-on" marca il canale scontato ma NON fa parte del codice base
      // salvato in affiliates.code: va tolto prima del match, altrimenti i clienti -on
      // non troverebbero l'affiliato e la commissione andrebbe persa.
      const hadOnSuffix = biz.affiliate_code.toLowerCase().endsWith('-on')
      const baseCode    = biz.affiliate_code.toLowerCase().replace(/-on$/, '')

      const { data: aff, error: affErr } = await supabase
        .from('affiliates')
        .select('id, status')
        .eq('code', baseCode)
        .maybeSingle()

      if (affErr || !aff || aff.status !== 'approved') {
        console.log(`invoice.paid: affiliate not found or not approved for code ${baseCode}, skipping`)
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

      // Nessun cap: la commissione continua finché il cliente paga (mesi >12 → tariffa ridotta).
      const existingCount = count ?? 0
      const monthNumber   = existingCount + 1
      const commission    = commissionFor(hadOnSuffix, monthNumber)

      const { error: insertErr } = await supabase
        .from('affiliate_commissions')
        .insert({
          affiliate_id:      aff.id,
          business_id:       biz.id,
          stripe_invoice_id: invoiceId,
          amount:            commission,
          month_number:      monthNumber,
          status:            'pending',
        })

      if (insertErr) {
        if ((insertErr as { code?: string }).code === '23505') {
          console.log(`invoice.paid: duplicate invoice ${invoiceId} (Stripe retry), skipping`)
        } else {
          console.error('invoice.paid: insert error (non-blocking):', insertErr)
        }
      } else {
        // amountPaid è un cross-check: canale=ON atteso ~6999, FULL atteso ~9999 (al netto di IVA/proration).
        console.log(`invoice.paid: commission €${commission} (month ${monthNumber}, ${hadOnSuffix ? 'ON' : 'FULL'}, amount_paid=${amountPaid}) recorded for business ${biz.id}, affiliate ${aff.id}`)
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
