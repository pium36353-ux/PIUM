import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from './Logo'

// Schermata a tutto schermo condivisa da ogni route operativa autenticata
// (Dashboard, Settings, ...) quando isBusinessBlocked(business) è vero.
// Le uniche due azioni possibili da bloccato: pagare (per sbloccarsi) o
// uscire — mai intrappolare l'utente, specie da PWA senza barra del browser.
export default function SubscriptionGate({ checkoutLoading, checkoutError, onCheckout }) {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

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
        <button className="db-block-logout" onClick={handleSignOut}>
          Esci
        </button>
      </div>
    </div>
  )
}
