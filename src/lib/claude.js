const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY

export async function generateWithClaude(prompt) {
  console.log('[Claude] API key (primi 10 char):', CLAUDE_API_KEY?.slice(0, 10))
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = await response.json()
  console.log('[Claude] risposta completa API:', JSON.stringify(data))
  return data.content[0].text
}
