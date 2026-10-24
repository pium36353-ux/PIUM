import { useState } from 'react'
import KioskLockButton from './KioskLockButton'
import { useHallNotificationsData } from '../../lib/hallNotificationsContext'
import { formatTime } from '../../lib/datetime'

// Pagina "Notifiche sala" — verticale 'ristorante_bar', voce di
// navigazione propria, React.lazy + doppio gate in Dashboard.jsx come
// Tavoli/Menu/Cucina/Scorte.
//
// Non carica niente: i dati arrivano dal contesto, riempito dall'unico
// punto che li legge (useHallNotifications, montato dal provider per i
// soli ristoranti). Qui si mostra l'elenco e si agisce.
//
// Un elenco unico, dalla più vecchia alla più recente, con le sole
// notifiche non ancora consegnate o lette: le due famiglie (stato ed
// evento) sono mescolate di proposito, perché per un cameriere in sala
// sono la stessa cosa — qualcosa da fare adesso. La differenza sta in
// cosa succede al tocco, non in dove compaiono.
export default function NotificheSala({ business, onNavigate, kioskLock, onKioskLockChange }) {
  const { notifications, loading, dismiss } = useHallNotificationsData()
  const [busyKey, setBusyKey] = useState(null)

  const handleTap = async (notification) => {
    if (busyKey) return
    setBusyKey(notification.key)
    await dismiss(notification)
    setBusyKey(null)
  }

  if (!business) {
    return <div className="db-section rb-screen"><div className="db-empty-banner">Configura prima la tua attività.</div></div>
  }

  return (
    <div className="db-section rb-screen">
      <div className="db-section-toolbar">
        <p className="db-section-desc">
          {notifications.length === 0
            ? 'Niente da servire e nessuna chiamata dalla cucina.'
            : `${notifications.length} avvis${notifications.length !== 1 ? 'i' : 'o'} da gestire — dal più vecchio.`}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Ritorno alla piantina: a lucchetto attivo la barra laterale
              non esiste, e queste due schermate devono restare
              raggiungibili l'una dall'altra. */}
          <button className="tv-sala-link" onClick={() => onNavigate?.('tavoli')}>Tavoli</button>
          <KioskLockButton
            area="sala"
            lockedArea={kioskLock}
            pin={business.kiosk_pin}
            onLock={onKioskLockChange}
            onUnlock={() => onKioskLockChange(null)}
          />
        </div>
      </div>

      {loading && notifications.length === 0 ? (
        <div className="sv-loading"><HnSpinner /></div>
      ) : notifications.length === 0 ? (
        <div className="db-card">
          <p className="db-card-empty">
            Gli avvisi compaiono qui da soli: una portata pronta da servire, o una chiamata dalla cucina.
          </p>
        </div>
      ) : (
        <div className="hn-list">
          {notifications.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`hn-row ${n.kind === 'evento' ? 'hn-row--evento' : 'hn-row--stato'}`}
              disabled={busyKey === n.key}
              onClick={() => handleTap(n)}
            >
              <span className="hn-row-main">
                <span className="hn-row-kind">{n.kind === 'evento' ? 'Chiamata' : 'Da servire'}</span>
                <span className="hn-row-text">{n.text}</span>
              </span>
              <span className="hn-row-side">
                <span className="hn-row-time">{formatTime(new Date(n.at).toISOString())}</span>
                {/* Cosa fa il tocco, scritto: le due famiglie finiscono
                    in due stati diversi (consegnata / letta) e un
                    cameriere non deve indovinarlo. */}
                <span className="hn-row-action">
                  {busyKey === n.key ? <HnSpinner small /> : (n.kind === 'evento' ? 'Tocca: letta' : 'Tocca: consegnata')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function HnSpinner({ small }) {
  const size = small ? 14 : 18
  return (
    <svg style={{ width: size, height: size, animation: 'sv-spin 0.8s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}
