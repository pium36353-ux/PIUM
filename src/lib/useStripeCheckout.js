import { useState } from 'react'
import { supabase } from './supabase'

// Avvia il checkout Stripe per il piano PIUM (prezzo pieno o scontato -on, deciso
// server-side da stripe-checkout in base a businesses.affiliate_code). Condiviso tra
// il banner trial in Dashboard.jsx e la sezione Abbonamento in Settings.jsx.
export function useStripeCheckout() {
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)

  const handleCheckout = async () => {
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setCheckoutError('Sessione scaduta. Effettua di nuovo il login.')
        setCheckoutLoading(false)
        return
      }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setCheckoutError('Errore nel caricamento del pagamento. Riprova o contatta info@piumapp.com.')
      }
    } catch {
      setCheckoutError('Errore nel caricamento del pagamento. Riprova o contatta info@piumapp.com.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  return { checkoutLoading, checkoutError, handleCheckout }
}
