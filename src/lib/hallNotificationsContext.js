import { createContext, useContext } from 'react'

// Le notifiche di sala sono caricate in UN SOLO punto (il provider
// montato solo per i ristoranti, vedi HallNotificationsProvider.jsx) e
// lette da più sezioni: la pagina Notifiche sala e la piantina dei
// tavoli, che ne usa solo l'indicazione sulle card. Un contesto invece
// di due caricamenti paralleli: due letture indipendenti degli stessi
// ordini possono disallinearsi, e sono il doppio delle query e delle
// sottoscrizioni Realtime.
//
// Il valore di ripiego serve a un componente montato fuori dal provider
// (non accade nei percorsi attuali, ma un domani una sezione del
// verticale potrebbe essere montata altrove): legge un elenco vuoto
// invece di esplodere su `null`.
const EMPTY = {
  notifications: [],
  loading:       false,
  dismiss:       () => {},
  reload:        () => {},
}

export const HallNotificationsContext = createContext(EMPTY)

export function useHallNotificationsData() {
  return useContext(HallNotificationsContext) ?? EMPTY
}
