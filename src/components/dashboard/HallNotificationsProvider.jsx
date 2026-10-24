import { HallNotificationsContext } from '../../lib/hallNotificationsContext'
import { useHallNotifications } from '../../lib/useHallNotifications'

// Componente del solo verticale 'ristorante_bar', montato da
// Dashboard.jsx con React.lazy dentro il ramo isRestaurant: tiene fuori
// da Dashboard sia il codice sia il peso del modulo.
//
// Due compiti, nessun altro:
//   1. caricare le notifiche una volta sola e metterle nel contesto;
//   2. mostrare il banner dell'avviso, che deve comparire in QUALUNQUE
//      sezione — per questo sta qui, intorno al contenuto, e non dentro
//      la pagina Notifiche sala.
// Il banner è un pulsante: toccarlo apre la pagina Notifiche sala, come
// richiesto, da qualunque sezione.
export default function HallNotificationsProvider({ business, section, onNavigate, children }) {
  const hall = useHallNotifications(business, { alertsSuppressed: section === 'cucina' })

  return (
    <HallNotificationsContext.Provider value={hall}>
      {children}
      {hall.alert && (
        <button
          type="button"
          className={`kio-alert hn-alert ${hall.alert.kind === 'sala' ? 'kio-alert--sala' : 'kio-alert--pronto'}`}
          onClick={() => { hall.dismissAlert(); onNavigate('notifiche') }}
        >
          <span className="hn-alert-text">{hall.alert.text}</span>
          <span className="hn-alert-hint">Tocca per aprire Notifiche sala</span>
        </button>
      )}
    </HallNotificationsContext.Provider>
  )
}
