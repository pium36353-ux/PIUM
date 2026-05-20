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
| 13 | Bozze social AI | ✅ |
| 14 | Gestione recensioni | ✅ |
| 15 | Promemoria | ✅ |
| 16 | Admin panel | ✅ |
| 17 | Agenda | ✅ |
| 18 | Dashboard affiliati | ✅ |
| 19 | Deploy + dominio | ✅ |
| 20 | Rate limiting AI | ✅ |
| 21 | Sottodomini personalizzati | ✅ |
| 22 | Bot FAQ supporto | ✅ |
| 23 | Pagamenti Stripe | ✅ |
| 24 | Rubrica clienti con storico | ✅ |
| 25 | Multi-servizio per appuntamento | ✅ |
| 26 | Importazione contatti (vCard + Android) | ✅ |
| 27 | Cambio email in Impostazioni | ✅ |
| 28 | Audit sicurezza + fix completo (CRITICO/ALTO/MEDIO/BASSO) | ✅ |

---

## Prima del lancio

### Bloccanti (senza questi non si lancia)
- [ ] **Sostituire chiavi Stripe da test a live** — attualmente configurate con `pk_test_` / `sk_test_`. Prima del lancio: generare chiavi live su Stripe Dashboard, aggiornare secret su Supabase, aggiornare `VITE_STRIPE_PUBLIC_KEY` nel `.env` di produzione su Vercel
- [ ] **Sostituire Claude API key temporanea** con quella account aziendale
- [ ] **Verificare numero di telefono** sull'account Anthropic
- [ ] **Aggiungere dati di fatturazione** su Anthropic
- [ ] **Verifica onboarding → sito pubblico** funzionante end-to-end su utente reale

### Importanti ma non bloccanti
- [ ] **Upgrade Supabase al piano Pro** (25€/mese) — il piano Free ha 50 MB storage condivisi. Con foto dei clienti si esaurisce rapidamente. Nessuna modifica al codice, solo upgrade dal pannello Supabase
- [ ] **Calcolo automatico guadagni affiliati** collegato a Stripe (ora è manuale)
- [ ] **Reset password cliente** dal pannello admin
- [ ] **Pulizia slug vecchi clienti** — migrazione da formato `bar-roma-xxxx` a `bar-roma`

### Dopo il lancio
- [ ] **Sistema di monitoraggio**: avviso automatico se il webhook Supabase smette di rispondere, se le notifiche push falliscono sistematicamente, o se Stripe webhook non processa pagamenti. Priorità: media (dopo il lancio dei primi clienti)
- [ ] **Miglioramento bot FAQ**: ampliare le domande coperte, migliorare le risposte esistenti, aggiungere categoria "Notifiche e prenotazioni" che copre i problemi più comuni segnalati dai clienti reali. Priorità: alta (prima di scalare gli affiliati)

### Nice to have
- [ ] Template visivi per categoria attività (ristorante, parrucchiere, estetica, ecc.)
- [ ] Opuscolo venditori PDF
- [ ] Analytics (sezione #10 mai implementata)

---

## Cosa funziona oggi — recap completo

### Prodotto cliente
- **Auth**: registrazione email/password, login, logout, reset password
- **Onboarding**: wizard guidato con generazione slug univoco (`bar-roma`, `bar-roma-2`), categoria attività, orari, descrizione
- **Dashboard**:
  - *Panoramica*: hero grid 2 card (appuntamenti oggi + calendario mensile), contatori compatti (promemoria, servizi, bozze social, recensioni), card "Prossime attività" full-width con segna-completato inline, card "Promemoria" con urgenza colorata, card "Attività completate", barra utilizzo AI con reset mensile
  - *Agenda*: vista giornaliera con timeline slot 30 min, vista mensile con griglia; drum-scroll date picker; gestione dipendenti (modal centrato); prenotazioni pubbliche con sistema pending/conferma; notifiche push appuntamenti
  - *Servizi*: CRUD completo, toast eliminazione
  - *Social*: generazione bozze AI con Claude (include link sito pubblico nel testo), approvazione/eliminazione, toast eliminazione
  - *Recensioni*: lista recensioni, risposta AI con Claude, toast eliminazione
  - *Promemoria*: CRUD, stati pending/done, urgenza colorata (rosso/arancio/verde)
  - *Editor Sito*: modifica dati attività, caricamento foto profilo + galleria (max 20 foto, compressione auto), orari, descrizione
- **Impostazioni**: cambio email con OTP Supabase, cambio password, gestione notifiche push (permesso, test, abilitazione/disabilitazione), impostazione minuti preavviso appuntamento
- **Sito pubblico**: `nomeattivita.piumapp.com` via Cloudflare Worker, pagina pubblica con servizi, galleria carosello, form prenotazione
- **Notifiche push**: PWA installabile, notifiche X minuti prima degli appuntamenti, azione "✓ Fatto" dalla notifica, impostazioni personalizzabili
- **Bot supporto**: FAQ PIUM rispondibile via chat
- **Pagamenti**: flusso Stripe Checkout completo — banner trial con data scadenza, redirect a Stripe, webhook che aggiorna `status` e `plan` ad `active`, polling post-redirect con toast conferma

### Sistema trial e monetizzazione
- Trial gratuito con `trial_ends_at` configurabile dall'admin
- Banner trial visibile in dashboard con data scadenza e pulsante "Attiva ora"
- Blocco accesso dopo scadenza (`status = expired`) con banner rosso
- Pagamento 99€/mese via Stripe — dopo pagamento: `status = active`, `plan = active`, banner sparisce
- Rate limiting AI: 350k token/mese, reset automatico mensile, toggle illimitato per VIP

### Admin panel (`/x-admin-login`)
- Tabella clienti: 8 colonne (Attività, Email, Stato, Trial, Piano/€, AI/mese, Affiliato, Azioni)
- 6 StatCard: MRR, clienti attivi, in trial, conversione trial→paid, chiamate AI totali mese
- Drawer laterale per ogni cliente: stato account, dati attività, salute onboarding, utilizzo AI, note interne, estensione trial (input data + +30gg), toggle AI illimitata
- Badge affiliato + provenienza con nome affiliato nel drawer

### Sistema affiliati
- Registrazione affiliati con codice univoco
- Dashboard affiliati con link referral personalizzato
- Clienti registrati via referral tracciati (`affiliate_code` in `businesses`)
- Approvazione manuale da admin, guadagni tracciati manualmente (Stripe non ancora collegato)

### Infrastruttura
- Deploy su Vercel (CI/CD automatico da `git push`)
- Dominio `piumapp.com` su Cloudflare Registrar
- Supabase: auth, DB PostgreSQL, storage foto, Edge Functions, Realtime
- Edge Functions deployate: `claude-proxy` (AI con rate limiting), `stripe-checkout`, `stripe-webhook`, `notify-new-booking`
- Cloudflare Worker: proxy trasparente sottodomini `*.piumapp.com → www.piumapp.com`
- GDPR: Privacy Policy, Termini di Servizio, DPA, Cookie Policy generati
- Email `info@piumapp.com` attiva con forwarding su Cloudflare

---

## Sessione corrente — 2026-05-20

### Performance e ottimizzazioni DB

- ✅ **12 indici database** (migration `20260520_performance_indexes.sql`): `businesses.user_id` e `businesses.slug` (ogni page load), `appointments.business_id` (tabella più interrogata), indice composito `(business_id, date, completed)` e `(business_id, updated_at)`, `reviews.is_visible`, `bookings.status`, `reminders.(business_id, due_at)`, `social_drafts.(business_id, status)`, trigram GIN su `contacts.name/phone` e `appointments.client_name` per ILIKE veloci
- ✅ **PublicSite ottimizzato** — da 5 query in serie a 2 richieste parallele con `Promise.all`: `businesses` con embed PostgREST (`services(*)`, `reviews(...)`, `site_content(*)`) + `auth.getSession()` in un'unica onda. Filtraggio `is_available`/`is_visible` spostato lato client. Rimosso il secondo `useEffect` separato per l'auth

### Robustezza e error handling

- ✅ **Error handling su tutte le mutazioni** (commit `3b03334`): `Agenda.jsx` — `toggleCompleted`, `deleteAppointment`, `confirmPendingBooking`, `rejectPendingBooking`, `handleSaveEmployee`, `handleDeleteEmployee` tutti con try/catch, rollback UI su errore, toast visibile; `Servizi.jsx` — `handleSave` (insert/update), `toggleAvailable`, `handleDelete` con la stessa logica. Panoramica avvolta in try/catch/finally con `setLoading(false)` garantito
- ✅ **Timeout espliciti su tutte le chiamate esterne** (commit `5c19f90`): `claude.js` → `AbortSignal.timeout(30_000)` sulla chiamata alla Edge Function; `claude-proxy/index.ts` → `AbortSignal.timeout(25_000)` sulla chiamata ad Anthropic; `stripe-checkout/index.ts` → `AbortSignal.timeout(10_000)` già presente
- ✅ **Fix Realtime subscription** (commit `50b9b4f`): 3 bug risolti — (1) `[business]` → `[business?.id]` nelle deps evita rimozione+ricreazione del canale a ogni refresh dell'oggetto; (2) guard `visibilityState === 'visible'` per non invocare `fetchCount` quando il tab va in background; (3) `mounted` flag che blocca state update nel callback async INSERT se il componente si smonta mentre la query è in volo

### Nuove funzionalità

- ✅ **Cambio email in Impostazioni** (commit `aabf8b4`): flusso via `supabase.auth.updateUser({ email })` con conferma OTP; UI dedicata nella card Account; sezioni cambio email e cambio password separate con feedback visivo (idle → saving → done/error); fix hydration error `<p>` annidato in `<p>` su Landing.jsx
- ✅ **Tabelle `employees` e `appointments` in schema.sql**: definizioni complete con FK, indici, RLS owner-via-business, trigger `trg_appointments_updated_at`; SQL standalone per l'esecuzione manuale su Supabase SQL Editor
- ✅ **Panoramica ridisegnata**: sezione inferiore riscritta con 3 card — "Prossime attività" (full-width, con pulsante segna-completato inline su ogni riga), "Promemoria" (con colore urgenza rosso/arancio/verde), "Attività completate" (appuntamenti + promemoria completati di recente). Rimosso il vecchio blocco "In arrivo"

### PWA fix sottodomini

- ✅ **Manifest e Service Worker disabilitati sui sottodomini pubblici** (commit `c630c73`): rimossi tutti i meta tag PWA da `index.html`; `main.jsx` controlla `window.location.hostname` — sui domini principali (`piumapp.com`, `localhost`) inietta dinamicamente manifest, meta Apple, registra SW con `{ once: true }` + check `readyState`; sui sottodomini (`nomeattivita.piumapp.com`) chiama `getRegistrations().forEach(reg => reg.unregister())` per ripulire i clienti già colpiti. Risolve il popup "Installa app" che appariva sui siti pubblici dei clienti

### Audit sicurezza e qualità — fix completo

**Audit su tutto il codice in `src/` e `supabase/functions/`** — identificati e risolti 6 CRITICO, 9 ALTO, 10+ MEDIO, 5 BASSO:

#### CRITICO (6)
| # | File | Problema | Fix |
|---|---|---|---|
| 1 | `Dashboard.jsx` | Race condition nel polling Stripe post-redirect: timer non cancellato su unmount | Flag `mounted`, `clearTimeout(timer)` + `clearTimeout(successTimer)` nel cleanup |
| 2 | `activityLog.js` | Fire-and-forget senza catch: errori DB ingoiati silenziosamente | Aggiunto `.catch(err => console.error(...))` |
| 3 | `Affiliates.jsx` | Race condition auth: `setSession` dopo navigate su componente smontato | Flag `alive` nel `useEffect` |
| 4 | `Admin.jsx` | XSS: slug non validato interpolato direttamente in `href` | Helper `safePublicUrl(slug)` con whitelist regex `^[a-z0-9-]+$` + null-check sul link |
| 5 | `Dashboard.jsx` | Canale Realtime non rimosso se ancora in stato "joining" | `supabase.removeChannel()` avvolto in try/catch |
| 6 | `BookingSection.jsx` | Submit duplicato: `disabled={submitting}` non blocca click concorrenti su race | `useRef` lock (`submittingRef.current`) prima dell'`await` |

#### ALTO (9)
| # | File | Problema | Fix |
|---|---|---|---|
| 7 | `main.jsx` | Event listener `load` SW mai rimosso — memory leak | `{ once: true }` + guard `document.readyState === 'complete'` |
| 8 | Tutti i componenti dashboard | `setState` dopo unmount: `Panoramica`, `Promemoria`, `Servizi`, `Recensioni`, `Social`, `Agenda` (`loadEmployees`, `loadPendingBookings`) | Pattern signal `{ cancelled: false }` su tutti i `load` useCallback + useEffect con cleanup |
| 9 | `claude.js` | Risposta AI non validata: destructuring di `{ text }` senza controllo tipo | `if (typeof body?.text !== 'string') throw new Error(...)` |
| 10 | `claude-proxy/index.ts` | Errore aggiornamento contatori AI ingoiato silenziosamente | Aggiunto `console.error` nel `.catch()` del counter update |
| 11 | `Dashboard.jsx` | `visibilitychange` senza debounce: tab switching rapido scatena N fetch | Debounce 400ms con `clearTimeout(focusTimer)` |
| 12 | `Onboarding.jsx` | `handleSubmit` con 3+ await senza isMounted | `mountedRef = useRef(true)` + cleanup `useEffect(() => () => { mountedRef.current = false })` |
| 13 | `Settings.jsx` | `isPushSubscribed` useEffect senza cleanup | Flag `alive` |
| 14 | `Panoramica.jsx` | Bug timezone: `toISOString().split('T')[0]` ritorna data UTC | Sostituzione con costruzione stringa da `getFullYear/getMonth/getDate` |
| 15 | `Admin.jsx` | `visible` e stats ricalcolati a ogni render | `useMemo` su entrambi con deps corrette |

#### MEDIO (10 categorie)
- `Social.jsx`, `EditorSito.jsx` — signal/alive pattern su load mancante
- `Settings.jsx`, `Dashboard.jsx`, `Admin.jsx`, `Onboarding.jsx`, `Auth.jsx`, `AffiliatesAuth.jsx`, `PublicSite.jsx` — alive flag su tutti i `getUser`/`getSession` useEffect rimasti senza cleanup
- `BookingSection.jsx` — validazione formato email (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) e telefono (`/^[\d\s\+\-\(\)]{6,20}$/`) in `goToConfirm()`; errore RPC sostituito con messaggio generico (no leaking di dettagli interni)
- `stripe-checkout/index.ts` — `APP_URL` da `Deno.env.get('APP_URL')` con fallback
- `stripe-webhook/index.ts` — controllo timestamp per prevenire replay attack (rifiuta webhook con `|now - ts| > 300s`)
- `claude-proxy/index.ts` — validazione `prompt.trim()` + limite 20.000 caratteri
- `Admin.jsx` — signal pattern su `load` useCallback

#### BASSO (5 categorie)
- `Social.jsx`, `Promemoria.jsx`, `Recensioni.jsx` — `filtered`, `avg`, `counts`, `pending` avvolti in `useMemo` con deps corrette; aggiunto `useMemo` agli import
- `Admin.jsx` — signal pattern su `load` businesses useCallback
- `Agenda.jsx` — `buildWaLink` restituisce `null` anche per numeri con < 6 cifre

---

## Fatto nelle ultime sessioni

- ✅ **Integrazione Stripe completa**: Edge Function `stripe-checkout` (crea sessione Checkout), `stripe-webhook` (verifica firma HMAC, aggiorna `status` e `plan` ad `active`), banner trial in dashboard, polling post-redirect fino a conferma DB, toast verde conferma. Colonne `stripe_subscription_id`, `stripe_customer_id` su `businesses`. Fix JWT (`verify_jwt = false`), fix `quantity` mancante, fix polling cancellato da navigate (due `useEffect` separati)
- ✅ **Drum-scroll date picker in Agenda**: cliccando la data si apre modale con tre colonne giorno/mese/anno a scroll snap, funziona su desktop (mouse) e mobile (touch)
- ✅ **Settings dipendenti come modal centrato**: non più in fondo alla pagina, overlay con backdrop blur, chiudibile toccando fuori
- ✅ **Fix data troncata su mobile** in Agenda vista giornaliera: layout a due righe su mobile, font grande leggibile
- ✅ **Debug completo pre-lancio**: errori in italiano, toast "Eliminato ✓" su Servizi/Social/Recensioni, migration affiliate_code e activity_log, barra AI sempre visibile (anche a 0 chiamate)
- ✅ **Admin panel redesign**: tabella 8 colonne, 6 StatCard con MRR, drawer laterale completo
- ✅ **Rate limiting AI**: 350k token/mese con reset automatico, barra utilizzo in Panoramica
- ✅ **Sottodomini personalizzati**: `nomeattivita.piumapp.com` via Cloudflare Worker
- ✅ **PWA**: installabile su mobile con icone, notifiche push funzionanti
- ✅ **Bot supporto FAQ PIUM**
- ✅ **Campo `client_phone` su `appointments`**: migration `20260524`, campo telefono nel modal appuntamento con bottone WhatsApp inline (si attiva solo se il numero è presente). RPC `owner_confirm_booking` aggiornata: copia automaticamente `customer_phone` dalla prenotazione pubblica all'appuntamento creato
- ✅ **Sezione Clienti in dashboard**: nuovo menu "Clienti" con icona Users. `Clienti.jsx` aggrega gli appuntamenti per telefono (o nome normalizzato), mostra rubrica con avatar, numero di visite, totale speso, ultima visita. Ricerca in tempo reale per nome o telefono. Drawer laterale con: riepilogo (visite totali, speso, frequenza media in giorni), storico completo visite con data/ora/dipendente/prezzo/note
- ✅ **Multi-servizio per appuntamento**: tabella `appointment_services` (migration `20260526`) con `price_snapshot` e `duration_snapshot` per congelare i valori al momento della prenotazione. Modal appuntamento aggiornato con lista checkbox servizi attivi — spuntare un servizio accumula prezzo e durata automaticamente; i campi restano editabili manualmente. In modifica: pre-compilazione dei servizi già selezionati. Drawer Clienti mostra i tag servizi nello storico ("Taglio • Barba")
- ✅ **Tabella `contacts`** (migration `20260527`): contatti senza appuntamenti. RLS owner-only, indice composto `(business_id, phone)` per deduplicazione. `Clienti.jsx` legge da due sorgenti in parallelo (appointments + contacts) con merge per chiave telefono — i contatti senza visite appaiono in fondo alla lista con badge "contatto"
- ✅ **Importazione contatti**: modal a tre step (scelta metodo → anteprima → risultato). **vCard (.vcf)**: parsing con libreria `vcf`, normalizzazione LF→CRLF prima del parse (fix bug specifica vCard), anteprima lista nomi+numeri, deduplicazione per telefono prima dell'insert. **Contact Picker API**: pulsante visibile solo su Chrome Android (`PICKER_SUPPORTED`), chiama `navigator.contacts.select()`, stesso flusso preview+dedup. Messaggio finale: "Importati X contatti, Y già presenti saltati"
- ✅ **Fix pulsanti "Vedi sito pubblico"**: `EditorSito.jsx` e `Admin.jsx` ora usano `https://${slug}.piumapp.com` invece di URL relativi `/site/${slug}` — i clienti vedono il proprio sottodominio personalizzato
- ✅ **Modifica contatto nel drawer clienti**: campi nome, telefono e note modificabili con un unico pulsante "Salva modifiche". Se il cliente viene solo da appuntamenti (nessun record in `contacts`) → INSERT automatico al primo salvataggio; se ha già un record in `contacts` → UPDATE
- ✅ **Autocomplete dropdown nel modal appuntamento** (Agenda.jsx): campo "Nome cliente" con suggerimenti in tempo reale (max 3 risultati) cercati in `contacts` + `appointments` tramite `.ilike()`. Click su un suggerimento compila automaticamente nome e telefono. Debounce 200ms, chiusura con Escape o onBlur, `onMouseDown` per compatibilità touch, deduplicazione via Map per telefono
- ✅ **15 fix anti-bug pre-lancio** (Agenda, Dashboard, Clienti, Auth, PublicSite): handleSave Agenda con try/catch e modal aperto su errore; openEditModal con await loadServices; cleanup suggestTimerRef su closeModal; handleCheckout con banner errore; loadError DB con banner anziché redirect falso a /onboarding; Auth pendingRef blocca doppio invio; vCard normalizzazione LF→CRLF; groupClients omonimi con nameIndex Map; loadAppointments con signal cancellazione; DayTimeline scroll detection (touch 10px); Carousel swipe touch 40px; PublicSite onError immagini; handleSave Clienti try/catch; confirmImport try/catch; Realtime INSERT con fetchCount
- ✅ **Fix routing sottodomini**: `App.jsx` rileva il sottodominio da `window.location.hostname` (`hostParts.length >= 3 && parts[0] !== 'www'`) e renderizza `<PublicSite />` direttamente bypassando `PublicRoute`, che altrimenti reindirizzava gli utenti autenticati a `/dashboard`
- ✅ **Fix pulsanti "Vedi sito pubblico"**: `EditorSito.jsx` ora usa `https://www.piumapp.com/site/${slug}` — la route `/site/:slug` non è protetta da `PublicRoute` e funziona indipendentemente dallo stato del Cloudflare Worker (il precedente `${slug}.piumapp.com` dipendeva dal Worker attivo)
- ✅ **Booking flow multi-servizio**: `BookingSection.jsx` riprogettato con 6 step (SERVICE → DATE → SLOT → FORM → CONFIRM → SUCCESS). Selezione multipla servizi con checkbox e barra totale in tempo reale. Step CONFIRM con riepilogo completo e disclaimer WhatsApp. Step SUCCESS con numero whatsapp/phone dell'attività. Telefono obbligatorio. `generateSlots` aggiornato per formato `morning`/`afternoon`
- ✅ **Pannello conferma prenotazioni** in `Agenda.jsx`: flusso in due step — prima "Invia WhatsApp" (messaggio precompilato con servizi/data/ora), poi "Conferma appuntamento" (dialog inline dopo aver ricevuto risposta). Dialog di rifiuto inline. Stato `waSentIds` persistito in localStorage. Rimosso il vecchio WA banner globale post-conferma
- ✅ **Colonna `service_names` su `bookings`**: migration `20260519_booking_services.sql` aggiunge `service_names text` e aggiorna la firma di `create_booking` con parametro opzionale `p_service_names`
- ✅ **Notifiche push diagnosticate e risolte**: causa del silenzio era `verify_jwt = true` (default) su `notify-new-booking` senza `config.toml` → trigger riceveva 401. Creato `supabase/functions/notify-new-booking/config.toml` con `verify_jwt = false`. Creata tabella `push_subscriptions` (migration `20260516`). Aggiunti secrets VAPID su Supabase. Aggiunta `VITE_VAPID_PUBLIC_KEY` su Vercel. Trigger `on_new_booking` ricreato senza Authorization header
- ✅ **Cloudflare DNS fix**: record CNAME `*` modificato con proxy arancione attivato — necessario per il Worker `pium-subdomain-proxy`
- ✅ **Pannello prenotazioni in attesa** riprogettato: layout mobile corretto (card flex column, azioni flex-wrap row, pulsanti full-width su <480px), dialog conferma e rifiuto trasformati in modal overlay centrato con backdrop semitrasparente e nome cliente nel titolo ("Rifiutare la prenotazione di Mario?"), click sul backdrop chiude il dialog
- ✅ **Rimosso pulsante "Elimina tutte"** da Agenda.jsx — non utile per il commerciante
- ✅ **Pagina Impostazioni ridisegnata**: nuovo ordine sezioni (Notifiche → Account → Esci), icone 32×32 con sfondo colorato per ogni sezione, titoli più grandi (17px 700), badge "Attivo"/"Non attivo" accanto al titolo Notifiche, linguaggio semplificato ("Notifiche anche con il telefono in tasca", "Avvisami del prossimo appuntamento dopo aver completato uno"), test notifica diventato link testo piccolo, sezione Esci con sfondo rossastro, bottone "Attiva notifiche" a larghezza piena quando non attivo

---

## Booking system

✅ V1 completata: prenotazione pubblica con sistema pending + conferma manuale titolare

### Da implementare (prossima sessione booking):
1. Selezione multipla servizi nella stessa prenotazione
2. Messaggio WhatsApp precompilato alla conferma prenotazione
3. Promemoria appuntamento il giorno prima via WhatsApp

---

## Note tecniche

- **Stripe**: chiavi test attive. Prima del lancio sostituire con chiavi live su Stripe Dashboard + Supabase secrets + Vercel env vars. Webhook URL: `https://onkyhknchhlsmcknpinr.supabase.co/functions/v1/stripe-webhook`
- **Cloudflare Worker**: `pium-subdomain-proxy` — route `*piumapp.com/*`, DNS wildcard `*.piumapp.com`. File: `cloudflare-worker.js`
- **Slug**: algoritmo in `Onboarding.jsx` — formato `bar-roma`, suffisso numerico `-2`, `-3` su collisione
- **Rate limiting AI**: 350.000 token/mese, reset su `ai_reset_date`, `ai_unlimited = true` bypassa limite
- **Galleria**: max 20 foto, compressione auto con `browser-image-compression` (maxSizeMB: 0.8, maxWidthOrHeight: 1920)
- **Pricing**: 99€/mese. Primi 10 clienti a 69€/mese con prezzo bloccato (piano fondatori)
- **Deploy**: Vercel (prod automatico da push su `master`), Supabase Free plan (upgrade a Pro prima di scalare)
- **Pattern cancellazione async**: tutti i `load` useCallback usano `signal = null` + `if (signal?.cancelled) return` dopo ogni await. Tutti i `getUser`/`getSession` useEffect usano `let alive = true` + `return () => { alive = false }`. Tutti i `useEffect` con `load` in cleanup usano `const signal = { cancelled: false }; return () => { signal.cancelled = true }`.
- **Indici PostgreSQL**: 12 indici aggiunti in `20260520_performance_indexes.sql`. Trigram extension (`pg_trgm`) richiesta per gli indici GIN su `client_name` e `contacts.name/phone`
- **Replay attack protection**: `stripe-webhook` rifiuta eventi con timestamp più vecchio di 5 minuti dalla firma HMAC
