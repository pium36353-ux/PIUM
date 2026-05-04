# PIUM — Stato avanzamento

| # | Funzionalità | Stato |
|---|---|---|
| 1 | Setup progetto | ✅ |
| 2 | Auth login/registrazione | ✅ |
| 3 | Onboarding | ✅ |
| 4 | Dashboard | ✅ |
| 5 | Editor Sito | ✅ |
| 6 | Servizi | ✅ |
| 7 | Social | ✅ |
| 8 | Recensioni | ✅ |
| 9 | Promemoria | ✅ |
| 10 | Analytics | ⬜ |
| 11 | Landing page | ✅ |
| 12 | Sito pubblico cliente | ✅ |
| 13 | Bozze social AI | ✅ Completata (aggiunto pulsante copia testo) |
| 14 | Gestione recensioni | ✅ |
| 15 | Promemoria | ✅ |
| 16 | Admin panel | ✅ |
| 17 | Agenda | ✅ |
| 18 | Dashboard affiliati | ⬜ |
| 19 | Deploy + dominio | ⬜ |

## Prima del lancio

- [ ] Verificare numero di telefono sull'account Anthropic
- [ ] Aggiungere dati di fatturazione completi su Anthropic
- [ ] Descrivere il progetto nel profilo Anthropic
- [ ] Spostare le chiamate Claude API su Supabase Edge Functions per sicurezza e gestione rate limit

## Note sessione corrente

**Fatto oggi:**
- Card panoramica: 3 card funzionanti (Attività recenti, Prossime attività, Promemoria) con navigazione cliccabile
- Bottone "Accedi / Registrati" in landing
- PWA installabile con icone del fulmine viola su sfondo bianco
- Sicurezza: Claude API key spostata in Supabase Edge Function, non più esposta nel frontend

**Da fare prima del lancio commerciale:**
- Sostituire Claude API key temporanea con quella dell'account aziendale (solo variabile Supabase, nessun codice)
- Icona PWA da migliorare (attualmente nera su alcuni dispositivi)

**Da fare prossima sessione:**
- Bot supporto clienti con FAQ di PIUM
- Sottodominio personalizzato per ogni attività
- Controllo analytics_events (rate limit insert pubblico)
- Sottodominio personalizzato nomeattivita.piumapp.com

---

Agenda completata. Tabelle Supabase create: appointments ed employees. Funzionalità: vista settimana e giornata con slot 30 minuti, più appuntamenti sovrapposti affiancati per colore dipendente, spunta completato con verde, festività italiane evidenziate, riepilogo lordo/netto con percentuale tasse, gestione dipendenti con palette colori. Voce Agenda aggiunta nel menu dashboard. Logo PIUM: scelta variante C (testo minimalista + punto viola luminoso). Prossimi step: implementare logo C nella Landing.jsx, definire payoff finale, poi deploy su Vercel dopo sblocco account Anthropic.

Logo PIUM scelto — Variante C (minimalismo puro):
- Testo: "pium" tutto minuscolo
- Font: Syne, font-weight 700, letter-spacing -3px
- Colore testo: bianco su sfondo scuro, nero su sfondo chiaro
- Accanto alla parola "pium" c'è un piccolo cerchio (dot) viola
- Dot: width 10px, height 10px, background #a855f7, border-radius 50%, box-shadow 0 0 16px #a855f7aa
- Il dot si posiziona in basso a destra della parola, leggermente sollevato (margin-bottom 10px)
- Nessuna icona, nessun elemento aggiuntivo — solo testo + punto
- Da implementare nella Landing.jsx nella prossima sessione

Dominio acquistato: piumapp.com (registrato su Cloudflare Registrar, piano Business)  
Da collegare a Vercel durante il deploy.

Account Anthropic: bannato temporaneamente, appeal inviato tramite modulo ufficiale Google Forms. Causa probabile: uso VPN. Soluzione definitiva: spostare chiamate API su Supabase Edge Functions (già pianificato) così le chiamate partono sempre dallo stesso IP del server e non dalla VPN dello sviluppatore.

Pricing definitivo: 99€/mese. Strategia lancio: primi 10 clienti a 69€/mese con prezzo bloccato per sempre (piano fondatori), da cliente 11 in poi 99€/mese.

Prossimi step in ordine:  
1. Implementare logo variante C nella Landing.jsx (specifiche già nel PROGETTO.md)  
2. Creare opuscolo PDF per venditori  
3. Implementare Supabase Edge Functions per chiamate Claude API  
4. Deploy su Vercel + collegamento dominio piumapp.com (dopo sblocco Anthropic)  
5. Tracciamento eventi analytics strutturato (bassa priorità, dopo lancio)

---

## Aggiornamenti sessione corrente

**Editor Sito:** implementato e funzionante. Permette di modificare intestazione principale (titolo, sottotitolo, testo pulsante contatto), sezione "Chi siamo" con contatore 500 caratteri, e upload immagine di copertina su Supabase Storage (bucket site-images). I contenuti salvati appaiono nel sito pubblico in tempo reale.

**Recensioni pubblicabili:** aggiunto campo `published` nella tabella reviews. Il proprietario può scegliere quali recensioni pubblicare sul sito pubblico tramite pulsante toggle. Le recensioni pubblicate appaiono in fondo al sito pubblico con risposta del proprietario se presente.

**Sito pubblico:** fix route da `/b/:slug` a `/site/:slug`. Ora carica correttamente i contenuti da `site_content` (titolo, sottotitolo, copertina, chi siamo) e mostra le recensioni pubblicate.

**API Anthropic:** chiave API temporanea attiva su account personale per testing. Modello corretto: `claude-sonnet-4-5`. Da sostituire con chiave account PIUM quando sbloccato.

**Logo:** implementato in tutti i file. Componente `Logo.jsx` creato e funzionante.

**Tabelle Supabase aggiunte in questa sessione:** `site_content` (con RLS), `appointments`, `employees`.  
**Bucket Storage creato:** `site-images` (pubblico).

### Da fare prima del deploy

- [ ] Implementare rate limiting chiamate AI (max generazioni per utente al giorno)
- [ ] Spostare chiamate Claude API su Supabase Edge Functions
- [ ] Template visivi per categoria attività (ristorante, parrucchiere, estetica, ecc.)
- [ ] Opuscolo venditori PDF
- [ ] Deploy su Vercel + collegamento dominio piumapp.com
- [ ] Verifica onboarding → sito pubblico funzionante end-to-end
- [ ] Tabella activity_log nel database (usata da Panoramica.jsx ma non presente nello schema principale)
- [ ] Sistema trial/blocco dopo 1 mese gratis
- [ ] Notifiche push con azione "✓ Fatto" direttamente dalla notifica
- [ ] Limite chiamate AI bozze social (già presente come todo, confermare implementazione)
- [ ] Dashboard affiliati + sistema retribuzione manuale
- [ ] Bot supporto clienti con FAQ PIUM
- [ ] Sottodominio personalizzato per ogni attività (es. nomeattivita.piumapp.com)
- [ ] Icona PWA da correggere (appare nera su alcuni dispositivi)
- [ ] Sostituire Claude API key temporanea con quella account aziendale prima del lancio

---

Aggiunto pulsante "Copia testo" nelle bozze social con feedback visivo "Copiato ✓".  
Fix panoramica dashboard: contatori aggiornati in tempo reale con query Supabase, card cliccabili che navigano alle sezioni, tasto "← Panoramica" ripristinato in tutte le sezioni.  
**Prossimo step immediato: deploy su Vercel con dominio piumapp.com.**
