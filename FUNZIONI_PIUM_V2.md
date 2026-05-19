# PIUM — Funzioni dell'app (v2)

> Percorso reale dell'utente, dalla landing al sito pubblico. Aggiornato al 2026-05-19.

---

## 1. Scoperta — Landing page (`/`)

Pagina marketing pubblica. Visibile solo agli utenti non autenticati (`PublicRoute` reindirizza gli autenticati a `/dashboard`).

**Sezioni:**
- Nav con link alle sezioni e bottoni "Accedi" / "Accedi / Registrati" → `/auth`
- Hero con CTA "Inizia gratis" → `/auth`
- Sezione funzionalità (sito pubblico, dashboard, AI)
- Pricing card 99€/mese con lista feature
- Footer

---

## 2. Registrazione e Login (`/auth`)

Unica schermata con toggle Login / Registrati.

**Registrazione:**
1. Campi: nome completo, email, password (min 6 caratteri)
2. Validazione client-side prima dell'invio (`pendingRef` blocca doppio submit)
3. `supabase.auth.signUp()` con `full_name` in `options.data`
4. In caso di successo → redirect a `/onboarding`

**Login:**
1. Campi: email, password
2. `supabase.auth.signInWithPassword()` — errori tradotti in italiano
3. Redirect a `/dashboard` (utenti normali) o `/admin` (admin con `app_metadata.role = 'admin'`)

**Password dimenticata:** `supabase.auth.resetPasswordForEmail()` → email con link a `/reset-password`. Conferma visiva inline (nessun redirect).

**Toggle mostra/nascondi password** con icona Eye/EyeOff.

**Referral:** al mount, salva `?ref=CODICE` da URL in `localStorage('pium_ref')`.

---

## 3. Primo avvio — Onboarding (`/onboarding`)

Wizard 3 step con barra progresso. Solo per utenti autenticati senza business.

**Step 0 — La tua attività:**
- Nome attività (testo libero, obbligatorio)
- Categoria: griglia 12 bottoni con emoji (Ristorante, Parrucchiere, Barbiere, ecc.)
- Se categoria = "Altro": campo testo libero per descrizione tipo attività

**Step 1 — Contatti:**
- Telefono, WhatsApp, Email (almeno uno tra telefono e email obbligatorio)

**Step 2 — Sede:**
- Indirizzo (facoltativo), Città (obbligatoria)
- Descrizione manuale facoltativa (max 400 caratteri)

**Al submit:**
1. `generateSlug(name)` — prova `bar-roma`, poi `bar-roma-2`... fino a slot libero (max 50 tentativi, fallback con 4 caratteri random)
2. INSERT in `businesses` con tutti i dati + `affiliate_code` da `localStorage('pium_ref')` se presente
3. Generazione AI descrizione via Edge Function `claude-proxy` (prompt costruito con nome, categoria, città, note) — aggiorna `businesses.description` in background
4. Redirect a `/dashboard`

---

## 4. Dashboard (`/dashboard`)

Shell con sidebar di navigazione. Sezione attiva controllata da `?s=` query param (deep-link).

**Sidebar:**
- Logo PIUM + nome utente
- 8 sezioni: Panoramica, Agenda, Clienti, Promemoria, Social, Recensioni, Servizi, Editor Sito
- Badge rosso con count prenotazioni pending (aggiornato in realtime via Supabase Realtime)
- Bottone "Esci"

**Banner trial:** se `status = 'trial'` e `trial_ends_at` impostato → banner giallo con giorni rimasti + CTA "Attiva ora". Se `status = 'expired'` → banner rosso bloccante.

**Banner errore checkout:** se il pagamento Stripe fallisce → banner rosso temporaneo.

**Attivazione Stripe:** dopo redirect da Stripe con `?stripe_success=true`, polling ogni 2s per max 10s sull'aggiornamento `status = 'active'` nel DB. Toast verde di conferma. Due `useEffect` separati per evitare che il `navigate()` cancelli il polling.

**Realtime prenotazioni:** subscription Supabase Realtime su `bookings` filtrata per `business_id`. INSERT → badge +1 + notifica in-app. UPDATE → refresh count.

---

## 5. Panoramica

Home della dashboard con statistiche e prossime attività. Carica 9 query in `Promise.all`.

**Barra utilizzo AI:** chiamate AI questo mese / 350 (limite mensile). Barra progress con colore warning (giallo) oltre l'80%. Testo "Illimitato" se `ai_unlimited = true`. Si rinnova il 1° del mese prossimo.

**2 hero card:**
- Appuntamenti oggi (non completati) — click apre Agenda vista giorno
- Calendario mensile — click apre Agenda vista mese

**4 count row** (Promemoria in scadenza, Servizi attivi, Bozze social, Recensioni) — click naviga alla sezione.

**Card "Prossime attività":** lista 5 appuntamenti futuri con nome cliente, data relativa (oggi/domani/gg mmm), badge dipendente colorato. Click sull'item → deep-link in Agenda all'orario specifico. Bottone ✓ segna completato senza uscire dalla Panoramica.

**Card "Promemoria":** lista 5 promemoria in scadenza nei prossimi 7 giorni. Badge urgenza colorato: rosso (scaduto/oggi), arancio (≤3 giorni), verde.

**Card "Attività completate":** merge di appuntamenti completati + promemoria done, ordine cronologico inverso, max 5.

---

## 6. Agenda

Vista calendario con appuntamenti. Supporta due viste: giornaliera e mensile.

### Vista giornaliera

**Date picker:** strip orizzontale dei giorni della settimana. Click su data → drum-scroll modale con tre colonne giorno/mese/anno a scroll snap (funziona con mouse su desktop, touch su mobile).

**Timeline:**
- 48 slot da 30 minuti (`SLOT_H = 40px` ciascuno)
- Overlay grigie per orari di chiusura (calcolati da `businesses.opening_hours`)
- Scroll automatico: oggi → ora corrente -1h; altro giorno → inizio prima fascia aperta; deep-link con orario → orario specifico -1h

**Appuntamenti come blocchi colorati** per dipendente. Click apre modal di modifica.
- Su touch: `touchStartY` ref rileva se l'utente ha scrollato > 10px e ignora il click (evita apertura accidentale durante scroll)

**Modal nuovo/modifica appuntamento:**
- **Nome cliente** con autocomplete: debounce 200ms → query `.ilike()` su `contacts` e `appointments` → max 3 suggerimenti (nome + telefono) → click compila nome e telefono automaticamente. Chiusura con Escape o onBlur (150ms delay per compatibilità touch, `onMouseDown` sui suggerimenti)
- Telefono cliente con bottone WhatsApp diretto (se numero presente)
- Data e ora
- Dipendente (opzionale, select con colore)
- **Servizi multi-select:** lista checkbox servizi attivi — spuntare accumula prezzo e durata; i campi rimangono editabili manualmente
- Prezzo totale e durata calcolati automaticamente
- Note
- In modifica: caricamento servizi con `await loadServices()` + pre-selezione da `appointment_services`
- Salvataggio con try/catch; errori mostrati in `errors._global` nel modal che rimane aperto

**Prenotazioni pending:** pannello con lista prenotazioni in attesa di conferma. Flusso in due step obbligatori:
1. **"Invia WhatsApp"** → apre link `wa.me/` con messaggio precompilato ("Ciao [nome], ho ricevuto la tua richiesta per [servizi] il [data] alle [ora]..."). Dopo il click il pulsante diventa "WhatsApp inviato ✓" (stato persistito in `localStorage`)
2. **"Conferma appuntamento"** (visibile solo dopo WA inviato) → dialog inline "Hai ricevuto conferma dal cliente?" → conferma chiama RPC `owner_confirm_booking` (atomica: verifica ownership, aggiorna booking, crea appuntamento, copia telefono)
- **"Rifiuta"** sempre visibile → dialog inline "Rifiutare la prenotazione?" → aggiorna `status = 'cancelled'`
- I nomi dei servizi vengono letti da `bookings.service_names` (multi-servizio) con fallback a `services.name` (singolo)

**Dipendenti:** bottone "Dipendenti" apre modal centrato (backdrop blur) con CRUD nomi e colori. Chiudibile toccando fuori.

### Vista mensile

Griglia mese. Ogni giorno mostra i punti colorati degli appuntamenti. Click su giorno → passa a vista giornaliera per quella data.

---

## 7. Clienti

Rubrica aggregata da due sorgenti: `appointments` e `contacts`.

**Lista clienti:** avatar con iniziali (o colore generato da nome), nome, count visite, totale speso, data ultima visita. Badge "contatto" per chi ha solo un record in `contacts` senza appuntamenti.

**Ricerca:** input con filtro in tempo reale su nome o telefono (client-side, dati già caricati).

**Logica di aggregazione (`groupClients`):**
- Chiave primaria: telefono normalizzato (solo cifre)
- Omonimi senza telefono: `nameIndex` Map raggruppa per `name + date` al primo incontro — evita di spezzare le visite dello stesso cliente in gruppi separati
- Merge `contacts + appointments`: i contatti puri appaiono in fondo

**Drawer cliente:**
- Riepilogo: visite totali, totale speso (€), frequenza media in giorni
- Storico visite: lista cronologica con data, ora, dipendente, prezzo, tag servizi ("Taglio • Barba"), note
- **Modifica contatto:** campi nome, telefono, note con un solo pulsante "Salva modifiche". Se non esiste record in `contacts` → INSERT automatico al primo salvataggio; se esiste → UPDATE. Hint "Aggiungi telefono per evitare duplicati" se campo vuoto
- Hint "Aggiungi telefono per evitare duplicati" se il numero è assente

**Importazione contatti (modal 3 step):**

Step 1 — Scelta metodo:
- **Carica file vCard (.vcf):** qualsiasi contatti app su iOS, Android, desktop
- **Importa da rubrica Android** (solo Chrome Android): pulsante visibile solo se `navigator.contacts` è disponibile

Step 2 — Anteprima:
- Lista nomi + numeri estratti
- Normalizzazione CRLF obbligatoria per la libreria `vcf` (altrimenti 0 contatti parsati)
- Count totale trovati

Step 3 — Risultato:
- "Importati X contatti, Y già presenti saltati"
- Icona verde ✓ (successo) o rossa ✗ (errore) a seconda dell'esito
- Deduplicazione per telefono: `(business_id, phone)` già esistente → skip silenzioso

---

## 8. Servizi

CRUD completo dei servizi offerti dall'attività.

- Lista card: nome, prezzo, durata, badge "non disponibile" se `is_available = false`
- Modal add/edit: nome, descrizione, prezzo, label prezzo (es. "a partire da"), durata in minuti, ordinamento
- Galleria foto per servizio (upload multiplo su Supabase Storage)
- Toggle disponibilità inline
- Eliminazione con toast "Eliminato ✓"
- Ordinamento drag (sort_order salvato)

---

## 9. Social

Generazione e gestione bozze post social con AI.

**Generazione:**
- Prompt template per piattaforma (Instagram, Facebook, LinkedIn, X, TikTok, Generico)
- Invio a Edge Function `claude-proxy` con contesto attività (nome, categoria, servizi)
- L'AI genera il testo e gli hashtag (incluso il link al sito pubblico dell'attività)
- Rate limit: 350.000 token/mese; se raggiunto → messaggio "Limite AI raggiunto"

**Lista bozze:**
- Card per piattaforma con testo + hashtag
- Bottone "Approva" → `status = 'approved'`
- Bottone "Elimina" con toast conferma
- Bozze approvate archiviate separatamente

---

## 10. Recensioni

Moderazione e risposta alle recensioni clienti.

- Lista recensioni con stelle (1-5), autore, testo, data
- Toggle visibilità (`is_visible`) — se false non appare nel sito pubblico
- **Risposta AI:** genera risposta professionale e personalizzata via Claude con contesto della recensione. L'utente approva o modifica prima di salvare
- Risposta manuale inline
- Eliminazione con toast

---

## 11. Promemoria

Task manager con priorità e scadenza.

- Lista task con colore urgenza: rosso (scaduto/oggi), arancio (≤3 giorni), verde
- Modal add/edit: titolo, note, scadenza (data fissa o relativa: "tra X giorni/settimane/mesi"), priorità (alta/media/bassa)
- Toggle completato inline
- Filtro per stato (pending / done)

---

## 12. Editor Sito

CMS per il sito pubblico dell'attività. 4 blocchi editabili:

**Intestazione principale (hero):**
- Titolo, sottotitolo, testo CTA
- Preview in tempo reale

**Chi siamo (about):**
- Testo descrittivo, max 500 caratteri
- Generazione AI disponibile

**Immagine di copertina:**
- Upload (max 5MB, formati JPEG/PNG/WebP)
- Compressione automatica con `browser-image-compression` (output max 0.8MB, max 1920px)
- Usata come sfondo del blocco hero nel sito pubblico

**Galleria fotografica:**
- Upload multiplo, max 20 foto
- Compressione automatica
- Ordinamento drag

**Orari di apertura (Orari.jsx):**
- Sette giorni, ogni giorno: toggle chiuso / due fasce orarie (mattina + pomeriggio)
- Retrocompatibilità con formato vecchio (singola fascia `open`/`close`)

**Dati attività base:** nome, categoria personalizzata, telefono, WhatsApp, email, indirizzo, città, profilo immagine, link Instagram/Facebook

**"Vedi sito pubblico":** apre `https://www.piumapp.com/site/${slug}` in nuova tab (route pubblica, nessun controllo auth)

---

## 13. Sito Pubblico (`/site/:slug` o `slug.piumapp.com`)

Pagina pubblica dell'attività accessibile senza login. Caricato direttamente da `App.jsx` se il browser è su un sottodominio (`isSubdomain = true`), altrimenti tramite route `/site/:slug` o `/:slug`.

**Slug detection:**
```js
const parts = window.location.hostname.split('.')
const slug = parts.length >= 3 && parts[0] !== 'www' ? parts[0] : paramSlug
```

**Struttura:**
- **Hero:** foto profilo o lettera iniziale; nome attività (o `hero_title`); badge categoria; indirizzo; pulsante CTA (tel/WhatsApp/email per priorità)
- **Chi siamo:** testo `about_text` o `description`
- **Galleria:** carosello con swipe touch (soglia 40px), frecce, immagini rotte nascoste via `onError`
- **Servizi:** card con nome, prezzo, durata; solo servizi `is_available = true`
- **Prenota:** form booking online (solo se almeno un servizio ha `duration_min`)
- **Orari:** tabella orari di apertura (gestisce vecchio e nuovo formato)
- **Recensioni:** lista recensioni `is_visible = true` con stelle e risposta titolare
- **Contatti:** telefono, WhatsApp, email, indirizzo (Google Maps), Instagram, Facebook

**Owner banner:** se l'utente loggato è il proprietario → banner "Stai visualizzando il tuo sito" con link "Torna all'editor"

**Tema visivo:** colori e pattern di sfondo generati da `getTheme(category)` in base alla categoria attività

---

## 14. Form prenotazione online (BookingSection)

Wizard a 6 step integrato nel sito pubblico. Accessibile da chiunque senza login.

**Step SERVICE** (se più servizi disponibili): selezione multipla con checkbox. Ogni click alterna selezione/deselezione. Barra totale in tempo reale: "Totale: 45min — €50". Se c'è un solo servizio, questo step viene saltato automaticamente.

**Step DATE:** `<input type="date">` con min = oggi, max = +60 giorni

**Step SLOT:** carica slot liberi via RPC `get_taken_slots()` + `generateSlots()` che esclude i conflitti con appuntamenti esistenti. Rispetta entrambi i formati `opening_hours` (vecchio `open`/`close` e nuovo `morning`/`afternoon` con flag `active`)

**Step FORM:** nome *, email *, telefono * (ora obbligatorio — necessario per la conferma WhatsApp)

**Step CONFIRM** (nuovo): riepilogo completo prima dell'invio — servizi, durata totale, prezzo totale, data, ora, nome, telefono. Disclaimer: "La tua richiesta è stata ricevuta da [attività]. Riceverai un messaggio WhatsApp al numero [tel] — dovrai rispondere per confermare. Senza conferma la prenotazione non sarà valida."

**Step SUCCESS:** "Richiesta inviata!" con istruzioni risposta WhatsApp e contatto diretto dell'attività (usa `business.whatsapp ?? business.phone`). Il titolare riceve notifica push + aggiornamento badge in dashboard.

**Parametri passati a `create_booking`:** `p_service_id` (primo servizio selezionato), `p_service_names` (nomi separati da virgola di tutti i servizi).

**Anti-abuso:** RPC `create_booking` controlla che non esista già un `pending` per la stessa email + business.

---

## 15. Settings (`/settings`)

Impostazioni account.

- Cambio password (vecchia + nuova + conferma)
- Impostazioni notifiche: orario anticipo (0 / 1 / 5 minuti prima dell'appuntamento)
- **Web Push:** toggle attiva/disattiva notifiche push. Subscribe via VAPID → salva `push_subscriptions`. Test notifica per verifica. Mostra avviso se permesso negato dal browser.

---

## 16. Pannello Admin (`/x-admin-login` + `/admin`)

Accesso riservato a utenti con `app_metadata.role = 'admin'`.

**Login dedicato** (`/x-admin-login`): form separato, non usa `PublicRoute`.

**Dashboard admin:**

**6 StatCard:** MRR (somma `plan_price` clienti attivi), clienti attivi, in trial, tasso conversione trial→paid, chiamate AI totali mese, token AI mese.

**Tabella businesses** (8 colonne): Attività, Email, Stato (`trial`/`active`/`expired`), Trial ends, Piano/€, AI questo mese, Affiliato, Azioni. Ogni riga ha un link "Vedi sito" che apre `www.piumapp.com/site/${slug}`.

**Drawer cliente** (aperto cliccando su una riga):
- Dati business: nome, categoria, slug, città
- Salute onboarding: servizi, sito, foto profilo
- Stato account + piano con badge colorato
- Utilizzo AI: chiamate, token, toggle AI illimitata
- Note admin (textarea salvata su `businesses.admin_notes`)
- Estensione trial: input data + bottone "+30 giorni"
- Badge affiliato con nome affiliato

---

## 17. Sistema Affiliati (`/affiliates/auth` + `/affiliates`)

**Registrazione affiliato** (`/affiliates/auth`): form email/password + nome → INSERT in `affiliates` con `status = 'pending'`. L'admin approva manualmente.

**Dashboard affiliato** (`/affiliates`): link referral personalizzato (`piumapp.com/auth?ref=CODICE`), lista clienti che hanno usato il codice, commissioni totali e pending (gestione manuale).

**Flusso referral:**
1. Affiliato condivide link → `?ref=CODICE` salvato in `localStorage('pium_ref')`
2. Utente si registra → Onboarding inserisce `affiliate_code` nel business
3. Admin vede il badge affiliato nel drawer

---

## 18. PWA e notifiche push

**Installazione:** banner "Installa app" (`PWABanner.jsx`) visibile su mobile se l'app non è già installata. Usa `beforeinstallprompt` event.

**Service Worker** (`public/sw.js`):
- Cache network-first per risorse same-origin
- `push` event: mostra notifica con azioni (✓ Fatto)
- `notificationclick` event: action `complete` → `postMessage({ type: 'MARK_COMPLETE', appointmentId })` al tab aperto; click normale → apre `/dashboard?s=agenda`

**Scheduling notifiche** (`src/lib/notifications.js`):
- `scheduleAllTodayNotifications(apts)`: per ogni appuntamento non completato di oggi, calcola il ritardo e schedula una notifica locale con `setTimeout`
- Anticipo configurabile: 0, 1 o 5 minuti (salvato in `localStorage`)
- `notifyNextAppointment()`: ricalcola dopo ogni completamento

**Web Push server-side** (`notify-new-booking` Edge Function): triggered da trigger PostgreSQL `on_new_booking` su `bookings AFTER INSERT` → invia push a tutti i dispositivi del titolare tramite VAPID.

**Setup VAPID (una tantum):**
- `VITE_VAPID_PUBLIC_KEY` su Vercel (frontend)
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` nei secrets di Supabase Edge Functions
- `config.toml` nella cartella della funzione con `verify_jwt = false` (il trigger non invia JWT)
- Trigger SQL su `bookings` senza Authorization header

**⚠️ Re-subscription dopo rideploy:** dopo ogni `supabase functions deploy notify-new-booking`, il titolare deve disattivare e riattivare il toggle notifiche in Settings per rinnovare la subscription push.

---

## 19. Bot Supporto (`SupportBot`)

Widget FAQ flottante (pulsante ? in basso a destra). Carica le FAQ dalla tabella `faq` su Supabase.

- Categorie → lista domande → risposta
- Deep link alla sezione dashboard rilevante (es. "Vai all'Agenda")
- Sempre visibile su tutte le pagine autenticate

---

## 20. Infrastruttura e deploy

**Deploy frontend:** `git push origin master` → Vercel build automatico → pubblicato su `www.piumapp.com`.

**Deploy Edge Functions:** `supabase functions deploy <nome>` (manuale, non legato al push GitHub).

**Deploy Cloudflare Worker:** manuale dal Cloudflare Dashboard (incolla `cloudflare-worker.js`, assegna route `*piumapp.com/*`).

**Variabili ambiente frontend:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLIC_KEY`, `VITE_VAPID_PUBLIC_KEY` — configurate su Vercel Dashboard.

**Edge Function secrets:** `CLAUDE_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — configurati su Supabase Dashboard → Edge Functions → Secrets.
