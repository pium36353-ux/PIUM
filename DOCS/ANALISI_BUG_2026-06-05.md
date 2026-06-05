# Analisi Bug — Sessione 2026-06-05
> File analizzati: 1-5 di 13. Riprendi da `Agenda.jsx` nella prossima sessione.

## Priorità Alta 🔴
- `PublicSite.jsx` — instagram_url/facebook_url usati direttamente come href senza validazione: rischio javascript: injection
- `Settings.jsx` — cambio password senza verifica password attuale
- `Dashboard.jsx` — handleCheckout crasha con TypeError se session è null

## Priorità Media 🟡
- `Onboarding.jsx` — business creato prima dell'accettazione legale, nessun rollback
- `Onboarding.jsx` — generateSlug fino a 50 query sequenziali
- `Onboarding.jsx` — textarea descrizione senza maxLength={400}
- `Auth.jsx` — user enumeration: "email già registrata" espone presenza utente

## Priorità Bassa 🟠
- `PublicSite.jsx` — getTheme calcolata due volte per render
- `Settings.jsx` — timeout non cancellati al smontaggio
- `Settings.jsx` — handleUnsubscribePush senza try/catch

## Note
- `Auth.jsx` riga 122: claim "Nessuna carta richiesta" da rimuovere prima del lancio live
- `Onboarding.jsx` — versioni documenti legali hardcoded '2026-05-28': aggiornare quando si cambiano i documenti
- `Dashboard.jsx` — select('*') carica colonne inutili al frontend
