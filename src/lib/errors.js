export function translateError(msg) {
  if (!msg) return 'Si è verificato un errore. Riprova tra poco.'
  if (msg.includes('Invalid login credentials'))   return 'Email o password errati.'
  if (msg.includes('Email not confirmed'))          return 'Conferma la tua email prima di accedere.'
  if (msg.includes('User already registered'))     return 'Questo indirizzo email è già registrato.'
  if (msg.includes('Password should be') || msg.includes('weak_password')) return 'La password deve essere di almeno 6 caratteri.'
  if (msg.includes('Unable to validate'))          return 'Email non valida.'
  if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit')) return 'Troppe richieste. Riprova tra qualche minuto.'
  if (msg.includes('signup_disabled'))             return 'Le registrazioni sono temporaneamente disabilitate.'
  if (msg.includes('network') || msg.includes('fetch')) return 'Errore di connessione. Controlla la tua rete e riprova.'
  if (msg.includes('422') || msg.includes('Unprocessable')) return 'Dati non validi. Controlla email e password e riprova.'
  return 'Si è verificato un errore. Riprova tra poco.'
}
