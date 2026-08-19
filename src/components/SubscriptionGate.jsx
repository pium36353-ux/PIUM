import Logo from './Logo'

// Schermata a tutto schermo condivisa da ogni route operativa autenticata
// (Dashboard, Settings, ...) quando isBusinessBlocked(business) è vero.
// Unica eccezione al blocco: il pulsante di pagamento stesso. Nessun'altra
// funzione dell'app è raggiungibile finché resta montata al posto della pagina.
export default function SubscriptionGate({ checkoutLoading, checkoutError, onCheckout }) {
  return (
    <div className="db-block-shell">
      <div className="db-block-card">
        <Logo className="db-block-logo" />
        <h1 className="db-block-title">Il tuo abbonamento non è attivo</h1>
        <p className="db-block-text">Rinnova per continuare a usare PIUM.</p>
        <button className="db-block-btn" onClick={onCheckout} disabled={checkoutLoading}>
          {checkoutLoading ? 'Caricamento…' : 'Rinnova ora'}
        </button>
        {checkoutError && (
          <p className="db-block-error" role="alert">{checkoutError}</p>
        )}
      </div>
    </div>
  )
}
