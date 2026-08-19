// Regola UNICA di cosa blocca l'accesso operativo di un commerciante.
// Usata da ogni route autenticata che espone funzioni del business (Dashboard,
// Settings, eventuali future) — cambiarla qui la cambia ovunque.
export function isBusinessBlocked(business) {
  return business?.status === 'suspended' || business?.status === 'expired'
}
