import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_LIMIT = 350_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
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
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { prompt } = await req.json()
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Load business data for rate limiting
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, ai_tokens_month, ai_calls_month, ai_calls_month_display, ai_calls_total, ai_unlimited, ai_reset_date')
      .eq('user_id', user.id)
      .maybeSingle()

    const currentMonth = new Date().toISOString().slice(0, 7) // "YYYY-MM"
    const needsReset   = !biz?.ai_reset_date || biz.ai_reset_date.slice(0, 7) !== currentMonth
    const effectiveTokens = (biz && !needsReset) ? (biz.ai_tokens_month ?? 0) : 0

    if (biz && !biz.ai_unlimited && effectiveTokens >= TOKEN_LIMIT) {
      return new Response(JSON.stringify({
        error: 'AI_LIMIT_REACHED',
        message: 'Hai raggiunto il limite mensile di utilizzo AI. Si rinnova il 1° del mese.',
      }), {
        status: 429,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const claudeKey = Deno.env.get('CLAUDE_API_KEY')
    if (!claudeKey) {
      return new Response(JSON.stringify({ error: 'Claude API key not configured' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25_000),
    })

    if (!response.ok) {
      const err = await response.text()
      return new Response(JSON.stringify({ error: `Claude API error: ${response.status}`, detail: err }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const data      = await response.json()
    const text      = data.content?.[0]?.text ?? ''
    const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)

    // Update counters (fire-and-forget — don't block response)
    if (biz) {
      const today   = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"
      const updates = needsReset
        ? {
            ai_tokens_month:        tokensUsed,
            ai_calls_month_display: 1,
            ai_reset_date:          today,
            ai_calls_month:         (biz.ai_calls_month ?? 0) + 1,
            ai_calls_total:         (biz.ai_calls_total ?? 0) + 1,
          }
        : {
            ai_tokens_month:        effectiveTokens + tokensUsed,
            ai_calls_month_display: (biz.ai_calls_month_display ?? 0) + 1,
            ai_calls_month:         (biz.ai_calls_month ?? 0) + 1,
            ai_calls_total:         (biz.ai_calls_total ?? 0) + 1,
          }

      supabase.from('businesses').update(updates).eq('id', biz.id)
        .then(() => {}).catch(() => {})
    }

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (_err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
