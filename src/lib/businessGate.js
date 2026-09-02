// Trial in stato 'trial' il cui trial_ends_at è passato e che non ha mai
// attivato una subscription Stripe (nessun pagamento) — cliente "fantasma"
// che altrimenti resterebbe 'trial' per sempre, perché lo status DB avanza
// solo tramite webhook Stripe, che per definizione qui non arriva mai.
// Un trial Stripe legittimo (stripe_subscription_id valorizzato, es. in fase
// 'trialing') non entra mai qui finché trial_ends_at è futuro, e comunque è
// escluso anche a scadenza dal check sulla subscription.
export function isTrialExpiredUnpaid(business) {
  return business?.status === 'trial'
    && !!business?.trial_ends_at
    && new Date(business.trial_ends_at) < new Date()
    && !business?.stripe_subscription_id
}

// Stato "reale" del business, unica fonte di verità per badge/filtri/contatori
// ovunque venga mostrato lo stato (Admin, dashboard affiliato, ...): distingue
// il trial scaduto MAI pagato ('trial_expired') dallo status DB grezzo 'expired'
// (subscription Stripe cancellata — era cliente pagante, ha disdetto).
export function getBusinessRealStatus(business) {
  if (isTrialExpiredUnpaid(business)) return 'trial_expired'
  return business?.status ?? 'trial'
}

// Regola UNICA di cosa blocca l'accesso operativo di un commerciante.
// Usata da ogni route autenticata che espone funzioni del business (Dashboard,
// Settings, eventuali future) — cambiarla qui la cambia ovunque.
export function isBusinessBlocked(business) {
  return business?.status === 'suspended'
    || business?.status === 'expired'
    || isTrialExpiredUnpaid(business)
}
