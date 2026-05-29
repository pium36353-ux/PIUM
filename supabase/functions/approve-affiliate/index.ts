import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_TARGET_STATUSES = new Set(['pending', 'approved', 'rejected'])

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'PIUM <no-reply@piumapp.com>'

type Payload = {
  affiliate_id?: string
  target_status?: string
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  return match[1].trim() || null
}

function missingEnvResponse(): Response | null {
  const missing: string[] = []
  if (!SUPABASE_URL) missing.push('SUPABASE_URL')
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY')

  if (missing.length > 0) {
    return jsonResponse(
      {
        error: 'missing_env',
        detail: `Missing required environment variables: ${missing.join(', ')}`,
      },
      500
    )
  }
  return null
}

async function sendApprovedEmail(params: {
  affiliateId: string
  name: string | null
  email: string
}): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error('missing_env:RESEND_API_KEY')
  }

  const displayName = params.name?.trim() || 'affiliato'
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p style="margin:0 0 16px 0;font-size:18px;font-weight:700">PIUM</p>
      <p>Ciao ${displayName},</p>
      <p>la tua candidatura al Programma di Affiliazione PIUM è stata approvata.</p>
      <p>Puoi accedere alla tua area affiliato e iniziare a promuovere PIUM usando il tuo codice/link personale.</p>
      <p>
        <a href="https://www.piumapp.com/affiliates" style="display:inline-block;background:#111827;color:#ffffff;padding:10px 16px;text-decoration:none;border-radius:6px">
          Vai alla tua area affiliato
        </a>
      </p>
      <p>Durante la registrazione hai accettato digitalmente le Condizioni del Programma di Affiliazione PIUM e la Privacy Policy. Puoi consultare la versione corrente delle condizioni qui: <a href="https://www.piumapp.com/contratto-affiliazione">https://www.piumapp.com/contratto-affiliazione</a></p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">Email automatica inviata da PIUM. Non rispondere a questo messaggio.</p>
    </div>
  `

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `affiliate-approved-${params.affiliateId}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [params.email],
      subject: 'La tua candidatura affiliato PIUM è stata approvata',
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!resendRes.ok) {
    const detail = await resendRes.text()
    throw new Error(`resend_error:${resendRes.status}:${detail}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const envError = missingEnvResponse()
  if (envError) return envError

  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) {
    return jsonResponse({ error: 'Unauthorized: missing bearer token' }, 401)
  }

  const authClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  const user = authData?.user

  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized: invalid user token' }, 401)
  }

  if (user.app_metadata?.role !== 'admin') {
    return jsonResponse({ error: 'Forbidden: admin role required' }, 403)
  }

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const affiliateId = payload.affiliate_id
  const targetStatus = payload.target_status

  if (!affiliateId || typeof affiliateId !== 'string') {
    return jsonResponse({ error: 'Invalid affiliate_id' }, 400)
  }
  if (!targetStatus || !ALLOWED_TARGET_STATUSES.has(targetStatus)) {
    return jsonResponse({ error: 'Invalid target_status' }, 400)
  }

  const adminClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

  const { data: affiliate, error: readError } = await adminClient
    .from('affiliates')
    .select('id, name, email, status, approved_email_sent_at')
    .eq('id', affiliateId)
    .maybeSingle()

  if (readError) {
    return jsonResponse({ error: 'affiliate_read_failed', detail: readError.message }, 500)
  }
  if (!affiliate) {
    return jsonResponse({ error: 'Affiliate not found' }, 404)
  }

  const previousStatus = affiliate.status
  const updated = previousStatus !== targetStatus

  const { error: updateError } = await adminClient
    .from('affiliates')
    .update({ status: targetStatus })
    .eq('id', affiliateId)

  if (updateError) {
    return jsonResponse(
      {
        error: 'affiliate_update_failed',
        detail: updateError.message,
        updated: false,
        email_sent: false,
        previous_status: previousStatus,
        status: targetStatus,
      },
      500
    )
  }

  const shouldSendApprovedEmail =
    targetStatus === 'approved' &&
    previousStatus === 'pending' &&
    affiliate.approved_email_sent_at === null

  if (!shouldSendApprovedEmail) {
    return jsonResponse({
      updated,
      email_sent: false,
      previous_status: previousStatus,
      status: targetStatus,
    })
  }

  if (!affiliate.email) {
    return jsonResponse(
      {
        error: 'affiliate_email_missing',
        updated,
        email_sent: false,
        previous_status: previousStatus,
        status: targetStatus,
      },
      500
    )
  }

  try {
    await sendApprovedEmail({
      affiliateId,
      name: affiliate.name,
      email: affiliate.email,
    })
  } catch (err) {
    return jsonResponse(
      {
        error: 'affiliate_approved_email_failed',
        detail: String(err),
        updated,
        email_sent: false,
        previous_status: previousStatus,
        status: targetStatus,
      },
      502
    )
  }

  const approvedEmailSentAt = new Date().toISOString()
  const { error: markSentError } = await adminClient
    .from('affiliates')
    .update({ approved_email_sent_at: approvedEmailSentAt })
    .eq('id', affiliateId)

  if (markSentError) {
    return jsonResponse(
      {
        error: 'approved_email_sent_at_update_failed',
        detail: markSentError.message,
        updated,
        email_sent: true,
        previous_status: previousStatus,
        status: targetStatus,
      },
      500
    )
  }

  return jsonResponse({
    updated,
    email_sent: true,
    previous_status: previousStatus,
    status: targetStatus,
  })
})
