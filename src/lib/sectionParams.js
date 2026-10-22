import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

// Unico modo di scrivere i parametri d'indirizzo di una sezione del
// verticale 'ristorante_bar' (data/turno/ordine in Tavoli, postazione in
// Cucina). Nessun altro punto di quelle sezioni deve chiamare navigate o
// setSearchParams: un secondo writer è esattamente ciò che ha prodotto il
// difetto descritto sotto.
//
// PERCHÉ NON setSearchParams CON L'UPDATER FUNZIONALE
// In react-router l'updater riceve `searchParams` catturato nella closure
// della useCallback, non l'indirizzo vivo:
//   nextInit(new URLSearchParams(searchParams))   // ← fotografia del render
// e `setSearchParams` ha `searchParams` tra le proprie dipendenze, quindi
// cambia identità a ogni query string. Le due cose insieme causavano:
//   1. scritture costruite su una fotografia scaduta, che riportavano
//      indietro un s= già superato (la sezione mostrata e l'indirizzo si
//      disallineavano e servivano più clic per riallinearsi);
//   2. la ri-esecuzione a catena degli effect di scrittura, perché
//      dipendevano da una funzione che cambiava identità a ogni scrittura.
// Qui invece la base è sempre `window.location.search` (l'indirizzo vero
// in quell'istante) e si scrive con `navigate` di useNavigate, la cui
// identità NON dipende dalla query string (dipende da basename,
// navigator, pathname e contesto del router): patchParams resta stabile.
//
// GUARDIA "SONO LA SEZIONE ATTIVA"
// Un componente di sezione può essere già montato mentre l'indirizzo
// contiene ancora la sezione precedente: `setSection` è stato React
// (applicato subito) mentre `navigate` passa dallo store del router e
// arriva un render dopo. In quella finestra la sezione NON deve scrivere
// i propri parametri, altrimenti li attacca all'indirizzo di un'altra
// sezione. `isActiveSection` serve a due cose: come guardia dentro
// patchParams e come dipendenza degli effect di scrittura, così la
// scrittura avviene da sola appena l'indirizzo arriva alla sezione giusta.
//
// CRONOLOGIA
// Le modifiche DENTRO una sezione sostituiscono la voce corrente
// (replace), così cambiare data dieci volte non riempie la cronologia: il
// tasto "indietro" riporta alla sezione precedente, non alla data
// precedente. È il cambio DI sezione (navigate_section in Dashboard.jsx)
// a creare una nuova voce.
export function useSectionParams(sectionId) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isActiveSection = searchParams.get('s') === sectionId

  const patchParams = useCallback((patch) => {
    const current = new URLSearchParams(window.location.search)
    if (current.get('s') !== sectionId) return
    const next = new URLSearchParams(current)
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    // Niente navigate se non cambierebbe niente: evita voci di cronologia
    // inutili e cicli di render.
    if (next.toString() === current.toString()) return
    navigate({ search: `?${next.toString()}` }, { replace: true })
  }, [navigate, sectionId])

  return { searchParams, isActiveSection, patchParams }
}
