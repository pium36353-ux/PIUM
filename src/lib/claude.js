import { supabase } from './supabase'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`

export async function generateWithClaude(prompt) {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Sessione scaduta. Effettua di nuovo il login.')
  }

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    if (err.error) throw new Error(err.error)
    if (response.status === 401) throw new Error('Sessione scaduta. Effettua di nuovo il login.')
    if (response.status >= 500) throw new Error('Servizio temporaneamente non disponibile. Riprova tra poco.')
    throw new Error('Errore di connessione. Riprova.')
  }

  const { text } = await response.json()
  return text
}
