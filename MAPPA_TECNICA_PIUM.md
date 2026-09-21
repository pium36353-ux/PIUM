# MAPPA TECNICA PIUM

> Documento generato per ricostruire una visione tecnica completa del progetto. Sola lettura sul codice: nessuna modifica applicata durante la stesura.

---

## Verticali — leggere PRIMA dei dettagli di ciascun verticale

PIUM è nato come dashboard generica per attività locali. Da settembre 2026 esiste un meccanismo per attivare funzionalità specifiche di un **tipo** di attività ("verticale", es. toelettatura) senza toccare la dashboard generica per tutti gli altri business. Regola valida per ogni verticale futuro, non solo per quello già implementato:

- **`businesses.vertical`** (text, `DEFAULT 'generico'`, nullable, **nessun CHECK sui valori ammessi** — di proposito, per non richiedere una nuova migration solo per sbloccare un nuovo verticale). Colonna introdotta da `20260920_business_vertical.sql` (commit `ea4dced`). Impostata **solo** da `Admin.jsx` (campo di testo libero nel drawer business, non un menu a tendina) — **mai** da `Onboarding.jsx` o da qualunque flusso self-service del merchant.
- **Fail-safe per costruzione, non per controllo esplicito**: qualunque valore diverso da quelli riconosciuti — incluso `'generico'`, `NULL`, stringa vuota o un refuso di battitura (es. `'Toelettatura'` con maiuscola, o `'toelettattura'`) — deve comportarsi **esattamente** come nessun verticale attivo. Questo non dipende da un `if` che qualcuno potrebbe dimenticare in un punto nuovo del codice, ma dal fatto che ogni funzionalità di verticale è isolata in un componente separato o in un ramo esplicitamente gated, mai cablata di default nella UI condivisa.
- **Regola architetturale — componente separato, mai condizioni sparse dentro la dashboard generica**: una feature di verticale vive in un componente proprio (es. `PetBoneIcon.jsx`, `PetIndicators.jsx`) montato/renderizzato **solo** dentro un `if (business.vertical === '<valore esatto>')` messo **prima** che qualunque JSX o query specifica del verticale venga anche solo costruita da React (`return null`/return anticipato — non un nascondimento CSS a posteriori, non un componente sempre montato con dati vuoti). `Agenda.jsx`/`Clienti.jsx` restano i componenti condivisi esistenti: le sezioni specifiche del verticale sono rami interni gated, non hanno trasformato quei file in componenti "per toelettatura".
- **Verticali riconosciuti ad oggi** (valore esatto da scrivere in Admin, case-sensitive, identico carattere per carattere al confronto nel codice):
  - `toelettatura` — UI animali (pets): sezione "Animali" nel modulo appuntamento e sul blocco appuntamento di `Agenda.jsx`, sezione "Animali" nella scheda cliente di `Clienti.jsx`. Dettagli tabella `pets` e componenti in Fase 2/Fase 1.
- **Da non confondere con `businesses.category`**: colonna preesistente, testo libero scelto dal merchant in `Onboarding.jsx` (es. la voce `"Toelettatura"` con emoji 🐾, aggiunta al `CATEGORIES` array da `a2f1966`) — è solo un'etichetta mostrata sul sito pubblico/dashboard, **non attiva alcuna UI**. Solo `vertical`, impostato dall'admin, attiva funzionalità. Un business può avere `category='Toelettatura'` e `vertical='generico'` (nessuna UI animali) o viceversa.
- **Lezione dalla prima implementazione** (utile per verificare ogni verticale futuro con lo stesso rigore): la UI animali era stata inizialmente montata come universale per errore (commit `a2f1966`), corretto con un fix urgente subito dopo (`05d166f`, "gating pets/PetBoneIcon dietro business.vertical='toelettatura'"). Il gate va verificato con un **grep su ogni riferimento** ai simboli della feature (nomi componenti, funzioni di load, stato React) in tutto `src/`, non solo letto "a occhio" nel punto dove sembra ovvio — le uniche eccezioni legittime a un grep del genere sono le dichiarazioni `useState` (obbligatorie e unconditional per le regole di React, non producono output da sole) e le definizioni di funzione mai invocate se il pulsante che le richiama non è nel DOM.

---

## FASE 1 — Struttura, stack, route, edge function, migration

### 1. Struttura completa di cartelle e file

```
localhub/                              root del progetto (nome interno "pium")
├── .env                                variabili d'ambiente locali (VITE_SUPABASE_URL, chiavi, ecc.) — non versionato
├── index.html                          entry HTML di Vite, monta <div id="root"> e carica src/main.jsx
├── vite.config.js                      config Vite: plugin React + plugin Tailwind CSS v4
├── eslint.config.js                    config ESLint (flat config), regole React Hooks/Refresh
├── vercel.json                         config deploy Vercel: rewrite SPA (tutte le route → index.html) + header no-cache per favicon/icone
├── cloudflare-worker.js                Worker Cloudflare: proxy trasparente *.piumapp.com → www.piumapp.com (per i siti pubblici su sottodominio, es. mario.piumapp.com)
├── package.json / package-lock.json    manifest npm e lock delle dipendenze
├── test_contatti.vcf                   file vCard di test per l'import contatti (Clienti.jsx)
│
├── scripts/
│   └── gen-favicon.mjs                 script Node: genera favicon.ico/favicon-32.png da icon-512.png (sharp + png-to-ico)
│
├── public/                             asset statici serviti as-is da Vite
│   ├── favicon.ico, favicon-32.png, favicon.svg, icon-192.png, icon-512.png, icons.svg
│   ├── manifest.json                   manifest PWA (nome app, icone, display standalone)
│   ├── sw.js                           service worker PWA (cache/notifiche push)
│   └── fonts/                          font self-hosted
│
├── dist/                               output di build (`vite build`), stessa struttura di public/ + assets/ compilati — non va toccato a mano
│
├── src/
│   ├── main.jsx                        bootstrap React: monta <App/>, inietta manifest PWA/meta Apple e registra il service worker solo sul dominio principale (www.piumapp.com/piumapp.com/localhost); su sottodominio pubblico deregistra eventuali SW
│   ├── App.jsx                         definizione di tutte le route (BrowserRouter) + logica di redirect per i sottodomini pubblici
│   ├── App.css / index.css             stili globali e Tailwind
│   ├── assets/                         immagini statiche importate nei componenti (hero.png, react.svg, vite.svg)
│   │
│   ├── lib/                            moduli di utilità condivisi, non-UI
│   │   ├── supabase.js                 istanza singola del client Supabase (createClient con URL + anon key da env)
│   │   ├── claude.js                   client per la Edge Function claude-proxy (generateWithClaude), usato per generare contenuti AI (recensioni, social, onboarding)
│   │   ├── activityLog.js              logActivity(): insert fire-and-forget su tabella activity_log
│   │   ├── businessGate.js             logica di stato dell'abbonamento: isTrialExpiredUnpaid, isBusinessBlocked, getBusinessRealStatus (trial/active/expired/suspended/gift)
│   │   ├── errors.js                   translateError(): mappa i messaggi d'errore Supabase Auth in italiano leggibile
│   │   ├── notifications.js            gestione notifiche browser/local (richiesta permesso, promemoria appuntamenti del giorno, notifica prossimo appuntamento)
│   │   ├── phone.js                    normalizePhone()/buildWaLink(): normalizzazione numeri IT e generazione link wa.me
│   │   ├── pushSubscription.js         iscrizione/disiscrizione Web Push (VAPID) tramite Service Worker
│   │   ├── safeUrl.js                  safeHref(): whitelist di protocolli (http/https/mailto/tel) per evitare javascript: URL non sicuri nei link generati da dati utente
│   │   └── useStripeCheckout.js        hook React: avvia il checkout Stripe (piano PIUM, pieno o scontato "-on") condiviso da Dashboard e Settings
│   │
│   ├── components/                     componenti condivisi/trasversali
│   │   ├── ErrorBoundary.jsx           React error boundary di primo livello, cattura crash e mostra fallback
│   │   ├── Logo.jsx                    logo testuale "pium" con pallino colorato, riusato in tutte le pagine
│   │   ├── PWABanner.jsx               banner "installa l'app" per mobile (prompt PWA nativo o istruzioni iOS)
│   │   ├── SubscriptionGate.jsx        schermata a tutto schermo mostrata quando isBusinessBlocked è vero (trial scaduto/sospeso/expired): permette solo pagare o uscire
│   │   ├── SupportBot.jsx              chatbot di supporto client-side basato su regole (FAQ locali), non chiama AI
│   │   ├── PetBoneIcon.jsx             [verticale 'toelettatura'] chip colorato a forma di osso con nome+genere del pet; riusato da Clienti.jsx e Agenda.jsx, sempre dietro il gate su business.vertical — vedi sezione "Verticali"
│   │   ├── PetIndicators.jsx           [verticale 'toelettatura'] CoatBars (lunghezza pelo, 3 tacche) e SizeBadge (taglia XS→XL); mostrati sul blocco appuntamento di Agenda.jsx solo se il verticale è attivo E l'appuntamento ha un pet collegato
│   │   │
│   │   ├── dashboard/                  le sezioni della dashboard business (montate da Dashboard.jsx come tab)
│   │   │   ├── Panoramica.jsx           riepilogo/home dashboard: prossimi appuntamenti, statistiche rapide
│   │   │   ├── Agenda.jsx               agenda/calendario appuntamenti: creazione, collaboratori, colori, festività, notifiche (il componente più grande, ~1700+ righe); per business.vertical='toelettatura' aggiunge una sezione "Animali" gated nel modulo appuntamento (ricerca cross-business su pets.name, precompila cliente, salva pet_id) e gli indicatori pelo/taglia sul blocco in vista giorno
│   │   │   ├── Clienti.jsx              rubrica clienti: CRUD, import vCard (libreria vcf), raggruppamento per telefono normalizzato; per business.vertical='toelettatura' aggiunge sezione "Animali" gated nella scheda cliente (CRUD pet completo: crea, modifica, elimina)
│   │   │   ├── EditorSito.jsx           editor del sito pubblico del business: hero, chi siamo, copertina, galleria immagini (con compressione client-side), orari (via Orari.jsx)
│   │   │   ├── Orari.jsx                sotto-componente di EditorSito: editor degli orari di apertura settimanali (mattina/pomeriggio per giorno)
│   │   │   ├── Servizi.jsx              CRUD servizi offerti (nome, prezzo, durata, disponibilità, visibilità sul sito pubblico, colore facoltativo — stessa palette/classi `.ag-swatch` già usate per i dipendenti in Agenda.jsx, mostrato come pallino sul blocco appuntamento)
│   │   │   ├── Social.jsx               generazione post social (Instagram/Facebook) assistita da AI (Claude), con toni predefiniti
│   │   │   ├── Recensioni.jsx           gestione recensioni multi-sorgente (manuale, Google, TripAdvisor, Facebook, Yelp) con risposte generate via AI
│   │   │   ├── Promemoria.jsx           todo/reminder interni per l'attività (priorità alta/media/bassa, stato pending/done)
│   │   │   └── PromemoriaClienti.jsx    promemoria manuali verso i clienti via WhatsApp (genera link wa.me con messaggio precompilato)
│   │   │
│   │   └── public/
│   │       └── BookingSection.jsx      form di prenotazione pubblico multi-step (servizio → data → slot → dati → conferma → successo), con Cloudflare Turnstile anti-bot, chiama la Edge Function create-booking
│   │
│   └── pages/                          una pagina per route
│       ├── Landing.jsx                  homepage marketing pubblica (www.piumapp.com/)
│       ├── Auth.jsx                     login/registrazione utente business
│       ├── Onboarding.jsx               wizard di configurazione iniziale del business (categoria, dati, generazione contenuti con Claude)
│       ├── Dashboard.jsx                shell della dashboard autenticata: carica il business, gestisce il gate abbonamento, monta le sezioni di components/dashboard
│       ├── Settings.jsx                 impostazioni account/abbonamento: notifiche push, stato piano, checkout/gestione Stripe
│       ├── ResetPassword.jsx            flusso di reset password (link da email Supabase Auth)
│       ├── PublicSite.jsx               sito pubblico del business (per slug o sottodominio): presenta servizi, galleria, orari, recensioni e il BookingSection
│       ├── Admin.jsx                    pannello amministrativo interno (gestione business, piani, note admin, affiliati) — il file più grande del progetto (~1470 righe)
│       ├── AdminLogin.jsx               login separato per l'accesso admin (/x-admin-login)
│       ├── Affiliates.jsx               area riservata affiliati: stato clienti referenziati, commissioni
│       ├── AffiliatesAuth.jsx           login/registrazione affiliati, genera il codice affiliato
│       └── legal/
│           ├── LegalPage.jsx            layout comune per le pagine legali (rende il markdown ricevuto come content)
│           ├── Privacy.jsx              wrapper che carica legal-docs/privacy-policy.md
│           ├── Termini.jsx              wrapper che carica legal-docs/termini-servizio.md
│           ├── Cookie.jsx               wrapper che carica legal-docs/cookie-policy.md
│           ├── Dpa.jsx                  wrapper che carica legal-docs/dpa.md
│           └── ContrattoAffiliazione.jsx wrapper che carica legal-docs/contratto-affiliazione.md
│
├── legal-docs/                          testi legali in Markdown, importati con `?raw` dalle pagine legal/*
│   ├── privacy-policy.md, termini-servizio.md, cookie-policy.md, dpa.md, contratto-affiliazione.md
│
├── supabase/
│   ├── schema.sql                       schema di riferimento "storico" del database (tabelle core: businesses, services, ecc.) — non sempre allineato 1:1 col DB reale (vedi migration che "documentano" colonne aggiunte a mano)
│   ├── activity_log.sql                 script standalone (pre-migration) per creare activity_log — poi ri-tracciato in 20260521_activity_log.sql
│   ├── .temp/                           file di lavoro della Supabase CLI (cli-latest, linked-project.json) — generati in locale, non contenuto applicativo
│   ├── functions/                       Edge Functions Deno (dettaglio sezione 4)
│   └── migrations/                      migration SQL in ordine cronologico (dettaglio sezione 5)
│
└── DOCS/, *.md in root                  documentazione precedente del progetto (audit, handoff, FAQ tecniche) — materiale di contesto, non fa parte del codice applicativo
```

---

### 2. Stack tecnologico reale (da `package.json`)

**Runtime / framework**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `react` | ^19.2.5 | libreria UI, tutta l'app è una SPA React |
| `react-dom` | ^19.2.5 | rendering React nel DOM |
| `react-router-dom` | ^7.14.2 | routing client-side (tutte le route in `App.jsx`, incl. `BrowserRouter`, `Navigate`, `useParams`) |
| `vite` | ^8.0.9 | build tool e dev server |
| `@vitejs/plugin-react` | ^6.0.1 | supporto JSX/Fast Refresh per Vite |

**Backend-as-a-service / pagamenti**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `@supabase/supabase-js` | ^2.104.0 | client per Postgres+Auth+Storage+Realtime di Supabase (unico backend dati) |
| `@stripe/stripe-js` | ^9.5.0 | client Stripe lato browser (redirect a Stripe Checkout) |
| `stripe` | ^22.1.1 | SDK Stripe server-side, usato dentro le Edge Functions (`stripe-checkout`, `stripe-webhook`) |

**Utility applicative**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `vcf` | ^2.1.2 | parsing di file vCard (.vcf) per l'import contatti in Clienti.jsx |
| `browser-image-compression` | ^2.0.2 | compressione immagini lato client prima dell'upload (galleria sito, EditorSito.jsx) |

**Styling**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `tailwindcss` | ^4.2.4 | utility CSS |
| `@tailwindcss/vite` | ^4.2.4 | plugin Vite per Tailwind v4 (nessun tailwind.config separato, integrato via plugin) |

**Dev tooling**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `eslint` + `@eslint/js` | ^9.39.4 | linting |
| `eslint-plugin-react-hooks` | ^7.1.1 | regole lint sulle regole degli hook React |
| `eslint-plugin-react-refresh` | ^0.5.2 | regole lint compatibilità Fast Refresh |
| `globals` | ^17.5.0 | set di globals per config ESLint |
| `@types/react`, `@types/react-dom` | ^19.x | tipi TS per autocompletamento (progetto è JS puro, non TS) |
| `sharp` | ^0.35.1 | elaborazione immagini (usato da `scripts/gen-favicon.mjs`) |
| `png-to-ico` | ^3.0.1 | conversione PNG→ICO (favicon), usato dallo stesso script |

**Note**: nessun framework di test presente in `package.json` (no Jest/Vitest/Playwright). Nessun TypeScript nel codice applicativo (solo Edge Functions `.ts`, eseguite da Deno, fuori dalla build Vite).

---

### 3. Route (da `App.jsx`) e componenti dashboard

**Routing generale**: `App.jsx` distingue due modalità in base all'hostname:
- **Sottodominio pubblico** (es. `mario.piumapp.com`, proxato in modo trasparente da `cloudflare-worker.js`): tutte le route vengono catturate e rese come `PublicSite`, bypassando i redirect di `PublicRoute`.
- **Dominio principale** (`www.piumapp.com` / `piumapp.com` / `localhost`): tabella di route completa sotto.

| Path | Componente | Wrapper | Note |
|---|---|---|---|
| `/` | `Landing` | `PublicRoute` | homepage marketing; redirect a `/dashboard` se già loggato |
| `/auth` | `Auth` | `PublicRoute` | login/registrazione |
| `/onboarding` | `Onboarding` | — | wizard post-registrazione |
| `/dashboard` | `Dashboard` | — | area autenticata principale |
| `/admin` | `Admin` | — | pannello amministrativo interno |
| `/x-admin-login` | `AdminLogin` | — | login separato per l'admin |
| `/settings` | `Settings` | — | impostazioni account/abbonamento |
| `/reset-password` | `ResetPassword` | — | reset password da link email |
| `/site/:slug` | `PublicSite` | — | sito pubblico via path esplicito |
| `/affiliates` | `Affiliates` | — | area riservata affiliati |
| `/affiliates/auth` | `AffiliatesAuth` | — | login/registrazione affiliati |
| `/privacy` | `Privacy` | — | pagina legale |
| `/termini` | `Termini` | — | pagina legale |
| `/cookie` | `Cookie` | — | pagina legale |
| `/dpa` | `Dpa` | — | pagina legale |
| `/contratto-affiliazione` | `ContrattoAffiliazione` | — | pagina legale |
| `/ref/:code` | `RefRedirect` (locale ad App.jsx) | — | salva il codice affiliato in `localStorage` e redirige a `/auth` |
| `/:slug` | `PublicSite` | — | catch-all finale: sito pubblico via slug diretto (deve restare l'ultima route) |

Componenti ausiliari montati sempre in `App.jsx` (non route, sempre presenti sul dominio principale): `NotificationScheduler` (pianifica le notifiche degli appuntamenti odierni), `PWABanner`, `SupportBot`, entrambi avvolti in `ErrorBoundary`.

**Componenti dashboard** (montati come tab/sezioni dentro `Dashboard.jsx`, in `src/components/dashboard/`):
1. `Panoramica.jsx` — riepilogo/home
2. `Agenda.jsx` — calendario appuntamenti
3. `Clienti.jsx` — rubrica clienti
4. `EditorSito.jsx` (+ `Orari.jsx`) — editor sito pubblico e orari
5. `Servizi.jsx` — catalogo servizi
6. `Social.jsx` — generazione post social AI
7. `Recensioni.jsx` — gestione recensioni
8. `Promemoria.jsx` — reminder interni
9. `PromemoriaClienti.jsx` — reminder WhatsApp verso clienti

Componente pubblico separato: `src/components/public/BookingSection.jsx`, usato da `PublicSite.jsx`.

---

### 4. Edge Functions (`supabase/functions/`)

| Funzione | `verify_jwt` | Scopo |
|---|---|---|
| `approve-affiliate` | (default, JWT richiesto) | Cambia lo stato di un affiliato (`pending`/`approved`/`rejected`) usando la service role key; invia email via Resend. Unico canale ammesso per approvare un affiliato (la policy RLS diretta è stata rimossa, vedi migration `20260719_drop_affiliates_all_policy.sql`) |
| `claude-proxy` | (default, JWT richiesto) | Proxy autenticato verso l'API Claude per la generazione di contenuti AI (recensioni, social, onboarding); applica un limite token (`TOKEN_LIMIT = 350_000`) |
| `create-booking` | (default, JWT richiesto lato dashboard, ma pensata per essere l'unico ingresso pubblico alle prenotazioni tramite anon key) | Crea una prenotazione pubblica chiamando la RPC `create_booking` nel DB; traduce gli errori noti del DB in messaggi utente, nasconde gli altri; punto di arrivo del form `BookingSection.jsx` |
| `notify-new-booking` | `false` (esplicito in `config.toml`) | Webhook invocato dal trigger DB `on_new_booking`; verifica un secret condiviso (`X-Webhook-Secret`, confronto a tempo costante) e invia una notifica push (libreria `web-push`) al proprietario del business |
| `stripe-checkout` | (default, JWT richiesto) | Crea una sessione di Stripe Checkout per l'upgrade al piano a pagamento, applicando lo sconto "-on" in base al codice affiliato del business |
| `stripe-webhook` | `false` (esplicito in `config.toml`) | Riceve gli eventi Stripe (pagamenti, abbonamenti), verifica la firma con Web Crypto, aggiorna lo stato del business e calcola/registra le commissioni affiliato (tariffe piena/scontata/a lungo termine definite qui) |

---

### 5. Migration (`supabase/migrations/`, in ordine cronologico)

| File | Cosa fa |
|---|---|
| `20260422_add_whatsapp_to_businesses.sql` | Aggiunge la colonna `whatsapp` a `businesses` |
| `20260423_admin_panel.sql` | Aggiunge la colonna `plan` (trial/free/starter/pro) e la policy RLS per il pannello admin |
| `20260507_profile_social_custom_category.sql` | Aggiunge foto profilo, link social (Instagram/Facebook) e categoria libera a `businesses` |
| `20260509_bookings.sql` | Crea la tabella `bookings` (sistema di prenotazione V1) |
| `20260512_booking_v2.sql` | Booking V2: rimuove l'OTP, passa a un flusso pending + conferma manuale del proprietario |
| `20260513_booking_whatsapp.sql` | Aggiunge `booking_id` su `appointments` per collegare l'appuntamento alla prenotazione d'origine |
| `20260514_realtime_bookings.sql` | Abilita Supabase Realtime sulla tabella `bookings` |
| `20260515_site_content_public_read.sql` | Rende leggibili a tutti (anche anonimi) i blocchi `site_content`, correggendo una policy troppo restrittiva che causava pagina bianca ai visitatori |
| `20260516_push_subscriptions.sql` | Crea la tabella `push_subscriptions` per le iscrizioni Web Push |
| `20260517_admin_rls_fix.sql` | Corregge la policy RLS admin per garantire lettura/scrittura su tutti i `businesses` indipendentemente da `is_active`/`user_id` |
| `20260518_admin_notes.sql` | Aggiunge `admin_notes` e documenta colonne già presenti in produzione ma non nello schema locale |
| `20260519_ai_rate_limit.sql` | Aggiunge contatori di rate limiting AI (`ai_tokens_month`, `ai_calls_month_display`) a `businesses` |
| `20260519_booking_services.sql` | Aggiunge `service_names` a `bookings` per la visualizzazione multi-servizio e rimuove vecchi overload di `create_booking` |
| `20260519_fix_trigger_notify.sql` | Ricrea il trigger `on_new_booking` rimuovendo l'header Authorization che causava 401 verso `notify-new-booking` |
| `20260520_affiliate_code.sql` | Aggiunge `affiliate_code` a `businesses` per tracciare l'affiliato che ha portato il cliente |
| `20260520_performance_indexes.sql` | Aggiunge indici di performance basati sui pattern di query reali del codice (es. `businesses.user_id`) |
| `20260521_activity_log.sql` | Crea la tabella `activity_log` (log eventi fire-and-forget, scritta da `src/lib/activityLog.js`) |
| `20260522_stripe_columns.sql` | Aggiunge `stripe_subscription_id` e `stripe_customer_id` a `businesses` |
| `20260523_plan_active_value.sql` | Aggiunge il valore `'active'` ai valori ammessi per `plan` (impostato dal webhook Stripe al pagamento confermato) |
| `20260524_add_client_phone.sql` | Aggiunge `client_phone` ad `appointments` |
| `20260525_owner_confirm_booking_phone.sql` | Aggiorna la funzione `owner_confirm_booking` per salvare il telefono cliente nella colonna dedicata invece che concatenato alle note |
| `20260526_appointment_services.sql` | Crea `appointment_services` (relazione N servizi ↔ appuntamento) con snapshot di prezzo/durata al momento della creazione |
| `20260527_create_contacts.sql` | Crea la tabella `contacts` (rubrica clienti) |
| `20260610_affiliate_commissions.sql` | Crea `affiliate_commissions`, registro delle commissioni mensili pagate per cliente referenziato |
| `20260610_booking_capacity.sql` | Aggiunge `booking_capacity` a `businesses` e aggiorna `get_taken_slots` per includere anche i booking pending |
| `20260719_booking_multi_service.sql` | Documenta (già applicata a mano in produzione) la Fase 1 del multi-servizio nel booking pubblico: colonna array servizi retrocompatibile |
| `20260719_businesses_user_id_unique.sql` | Documenta il vincolo `UNIQUE(user_id)` già applicato a mano su `businesses` |
| `20260719_create_booking_advisory_lock.sql` | `create_booking` v4: aggiunge un advisory lock per prevenire race condition sul controllo di capacità |
| `20260719_drop_affiliates_all_policy.sql` | Rimuove la policy RLS che permetteva a un affiliato di auto-approvarsi (`status → 'approved'`), lasciando solo la lettura dei propri dati |
| `20260719_trigger_notify_secret.sql` | Documenta il trigger `on_new_booking` con l'header `X-Webhook-Secret` richiesto da `notify-new-booking` |
| `20260720_businesses_owner_email.sql` | Aggiunge `owner_email` a `businesses` (email di registrazione, distinta dall'email di contatto pubblico) e la popola dai dati esistenti in `auth.users` |
| `20260806_create_booking_hardening.sql` | `create_booking` v6: aggiunge controlli lato DB (rifiuto date passate, validazione formato email/telefono, validazione orari di apertura) mantenendo le difese esistenti |
| `20260806_create_booking_revoke_anon.sql` | Revoca l'accesso pubblico diretto a `create_booking`, obbligando il flusso a passare dalla Edge Function `create-booking` |
| `20260807_drop_create_booking_8params.sql` | Rimuove il vecchio overload a 8 parametri di `create_booking` (residuo pre-multi-servizio, privo dei controlli di hardening) |
| `20260809_smart_time_foundations.sql` | Fase 1 della feature "Smart Time": aggiunge solo le colonne per il tracciamento del tempo reale di lavorazione degli appuntamenti (nessuna UI ancora) |
| `20260816_affiliate_code_on_suffix_validation.sql` | Sostituisce la FK `businesses.affiliate_code → affiliates.code` con un trigger di validazione che accetta anche il suffisso virtuale `-on` |
| `20260819_affiliate_commissions_schema_fix.sql` | Allinea lo schema reale di `affiliate_commissions` a quello atteso dal codice (drop + create pulito, tabella verificata vuota) |
| `20260823_faq_table_and_seed.sql` | Crea la tabella `faq` e ne popola/allinea il contenuto |
| `20260907_business_is_free.sql` | Aggiunge il flag `is_free` a `businesses` per gli account gratuiti legittimi (mai bloccati, mai contati come clienti paganti) |
| `20260908_services_visible_on_public_site.sql` | Aggiunge `visible_on_public_site` a `services`: nasconde un servizio dal sito pubblico mantenendolo selezionabile in agenda |
| `20260920_business_vertical.sql` | Aggiunge `businesses.vertical` (text, `DEFAULT 'generico'`, nullable, nessun CHECK) — fondamento del meccanismo verticali, vedi sezione dedicata a inizio documento |
| `20260920_grooming_universal_fields.sql` | Task 3 toelettatura: `services.color` (nullable), `contacts.display_name` (nullable), **crea la tabella `pets`** (id, business_id, client_phone, name, breed, coat, gender, weight_note) con RLS owner-all — stesso pattern di `contacts`/`appointment_services` |
| `20260921_pets_size_and_appointment_link.sql` | Estende Task 3: `appointments.pet_id` (FK → `pets`, nullable, ON DELETE SET NULL), `pets.size` (CHECK `xs`\|`s`\|`m`\|`l`\|`xl`, nullable), indice GIN trigram `idx_pets_name_trgm` su `pets.name` (ricerca fuzzy, stesso pattern di `contacts.name`/`appointments.client_name`) |

**Nota ricorrente**: diverse migration (`20260719_*`, `20260720_*`, alcune di agosto) sono etichettate come "già applicate manualmente in produzione via SQL Editor" — servono a documentare lo stato reale del DB per chi crea un ambiente nuovo, non riflettono l'ordine cronologico di applicazione originale in produzione.

---

*Fine Fase 1.*

---

## FASE 2 — Database

### 0. Metodologia e affidabilità delle fonti

Questa sezione incrocia tre fonti, lette per intero:

1. **`supabase/schema.sql`** — schema "storico" di riferimento (parzialmente aggiornato a mano nel tempo, non un dump reale).
2. **Tutti i file in `supabase/migrations/`** (43 al 21/09/2026, includendo le 3 aggiunte dai commit toelettatura/vertical — vedi sezione "Verticali" a inizio documento) — letti integralmente, non solo l'intestazione, per ricostruire l'unione di tutte le `ALTER TABLE`/`CREATE TABLE`/`CREATE OR REPLACE FUNCTION` mai applicate.
3. **`DOCS/MAPPA_DATABASE.md`** — un audit precedente (16/08/2026) basato su **query dirette eseguite in produzione** (non su migration), che ha fotografato lo stato reale del DB a quella data: 19 tabelle, colonne esatte con tipo/default/nullable, RLS reali, trigger reali. Fonte preziosa perché il codice usa da tempo tabelle e colonne mai comparse in nessuna migration ("fantasma").

Ho poi **verificato incrociando il codice sorgente attuale** (tutte le chiamate `.from('...')` e `.rpc('...')` in `src/` e `supabase/functions/`) per confermare quali tabelle sono ancora realmente lette/scritte oggi, e ho riletto per intero le migration aggiunte dopo il 16/08 (`20260819`, `20260823`, `20260907`, `20260908`) per capire cosa è cambiato da allora.

**Cosa è garantito al 100% in questo documento**: le tabelle/colonne/funzioni create da `schema.sql` o da una migration — è DDL, fa fede.
**Cosa è ereditato dall'audit di produzione del 16/08 (non ri-verificato con una query live in questa passata, per rispettare il mandato "sola lettura")**: struttura delle tabelle fantasma (`affiliates`, `legal_acceptances`, `admin_messages`, `admin_message_reads`) e delle colonne fantasma (`businesses.opening_hours`, `businesses.template`, colonne `hero_*`/`about_text`/`cover_image_url` di `site_content`, `reviews.published`). Il nome e l'uso di queste colonne sono comunque **confermati indipendentemente** in questa passata leggendo il codice che le usa (riportato per ciascuna).
**Cosa è cambiato rispetto all'audit del 16/08** (verificato leggendo le migration più recenti): `affiliate_commissions` è stata ricreata con la struttura corretta (`20260819`), `faq` è stata finalmente tracciata in una migration (`20260823`), sono comparse nuove colonne (`businesses.is_free` in `20260907`, `services.visible_on_public_site` in `20260908`, `businesses.vertical` in `20260920`, `services.color`/`contacts.display_name`/`appointments.pet_id`/`pets.size` in `20260920`-`20260921`) ed è comparsa una nuova tabella tracciata fin dalla nascita, non fantasma: **`pets`** (`20260920_grooming_universal_fields.sql`).

---

### 1. Tabelle fantasma — sintesi (esistono in produzione, MAI create da una migration)

| Tabella | Rischio | Nota |
|---|---|---|
| `affiliates` | 🟡 Medio | Anagrafica affiliati — cuore del programma referral. Nessun ambiente nuovo può essere bootstrappato senza ricrearla a mano. |
| `legal_acceptances` | 🟡 Medio | Traccia le accettazioni di termini/privacy — dati con valore probatorio/legale, ancora più critico non averli version-controllati. |
| `admin_messages` | 🟢 Basso | Messaggi admin→merchant. Funzionale ma non riproducibile su ambiente pulito. |
| `admin_message_reads` | 🟢 Basso | Stato di lettura dei messaggi admin. Idem. |

`faq` **non è più fantasma**: tracciata da `20260823_faq_table_and_seed.sql`. Restano invece **colonne fantasma** (colonne usate dal codice ma mai aggiunte da una migration, su tabelle altrimenti tracciate): `businesses.opening_hours`, `businesses.template`, `site_content.hero_title`/`hero_subtitle`/`hero_cta_text`/`about_text`/`cover_image_url`, `reviews.published` — dettagliate nelle rispettive tabelle sotto, con 🔴 esplicito.

---

### 2. Tabelle

Per ciascuna tabella: colonne (tipo, default, nullable, note), indici, FK, RLS. Le tabelle segnate **[FANTASMA]** non sono in nessuna migration; struttura da `DOCS/MAPPA_DATABASE.md` (audit di produzione 16/08), nomi colonna confermati dal codice attuale.

#### `activity_log`
Log eventi fire-and-forget per azioni in-app (servizio aggiunto, recensione risposta, bozza approvata...). Scritta da `src/lib/activityLog.js` (insert non bloccante, errori solo loggati in console).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| user_id | uuid | — | NO | FK → `auth.users(id)` ON DELETE CASCADE |
| type | text | — | NO | es. `service_added`, `review_replied` |
| description | text | — | **dipende** | vedi nota sotto |
| created_at | timestamptz | `now()` | NO | |

⚠️ **Doppia definizione nel repo, produzione allineata a quella NON tracciata come migration**: esiste sia `supabase/activity_log.sql` (file sciolto fuori da `migrations/`, `description NOT NULL`, policy `select_own`/`insert_own`, indice `activity_log_business_created`) sia `supabase/migrations/20260521_activity_log.sql` (`description` nullable, 3 policy incluso `activity_log: admin read all`, indice `idx_activity_log_business_id`). Per query dirette (16/08), **la produzione corrisponde al file sciolto**, non alla migration: `description NOT NULL`, solo 2 policy, manca la policy admin. Se il pannello admin dovesse leggere l'activity log di un business qualunque, oggi non può.

- **Indici**: PK; `activity_log_business_created` (business_id, created_at desc).
- **RLS**: abilitata. `select_own` (SELECT, `auth.uid()=user_id`), `insert_own` (INSERT, check `auth.uid()=user_id`).

#### `admin_message_reads` [FANTASMA]
Traccia quali business hanno letto quale messaggio admin. Usata da `src/pages/Dashboard.jsx:95,114`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| message_id | uuid | — | NO | FK → `admin_messages(id)` ON DELETE CASCADE |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| read_at | timestamptz | `now()` | NO | |

- **Vincoli**: UNIQUE(message_id, business_id).
- **Indici**: PK, unique(message_id, business_id), `idx_admin_message_reads` (business_id, message_id).
- **RLS**: `admin_message_reads: admin read` (SELECT, ruolo admin), `admin_message_reads: owner all` (ALL, tramite proprietà del business).

#### `admin_messages` [FANTASMA]
Messaggi dell'admin verso i merchant: broadcast (`business_id IS NULL`) o mirati. Letta/scritta da `src/pages/Admin.jsx:223,242` (invio) e `src/pages/Dashboard.jsx:93-94` (lettura non letti).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | **YES** | NULL = broadcast a tutti |
| message | text | — | NO | |
| link_url | text | — | YES | |
| link_label | text | — | YES | |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK; `idx_admin_messages_broadcast` (created_at desc) WHERE business_id IS NULL; `idx_admin_messages_business` (business_id, created_at desc).
- **RLS**: `admin_messages: admin write` (ALL, ruolo admin), `admin_messages: owner read` (SELECT, proprio business OR broadcast).

#### `affiliate_commissions`
Registro di una riga per ogni mensilità commissionata a un affiliato, scritta esclusivamente dal webhook Stripe (`stripe-webhook/index.ts`) su `invoice.paid`, con service role (bypassa RLS — nessuna policy INSERT). **Ricreata da zero il 19/08** (`20260819_affiliate_commissions_schema_fix.sql`) perché la tabella reale in produzione (creata a mano) non corrispondeva alla migration originale (`20260610`): mancavano `stripe_invoice_id`/`month_number`/`paid_at`, quindi ogni insert del webhook falliva silenziosamente con `42703 undefined_column` (errore loggato ma la funzione rispondeva comunque 200 a Stripe) — **nessuna commissione veniva registrata**. La struttura sotto è quella attuale, corretta.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| affiliate_id | uuid | — | NO | FK → `affiliates(id)` ON DELETE CASCADE |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| stripe_invoice_id | text | — | NO | UNIQUE |
| amount | numeric(10,2) | — | NO | nessun default (era 25.00 nella versione errata) |
| month_number | int | — | NO | CHECK `>= 1`, **senza tetto** — volutamente diverso dalla vecchia migration (CHECK 1-12): dal 13° mese la commissione continua a tariffa ridotta a vita, un CHECK 1-12 avrebbe fatto fallire l'insert dal 13° mese in poi |
| status | text | `'pending'` | NO | CHECK: `pending`\|`paid`\|`cancelled` |
| paid_at | timestamptz | — | YES | |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK, `idx_aff_comm_affiliate` (affiliate_id, status), `idx_aff_comm_business` (business_id).
- **RLS**: `aff_comm: affiliate read own` (SELECT, `affiliate_id in (select id from affiliates where user_id = auth.uid())`), `aff_comm: admin read all` (SELECT, ruolo admin), `aff_comm: admin update all` (UPDATE, ruolo admin). Nessuna policy INSERT/DELETE: solo il service role scrive.

#### `affiliates` [FANTASMA]
Anagrafica del programma di affiliazione a due canali (link diretto/prezzo pieno, link scontato con suffisso `-on`). Usata da `AffiliatesAuth.jsx` (insert alla registrazione), `Affiliates.jsx` (dashboard affiliato), `Admin.jsx` (gestione admin), Edge Function `approve-affiliate` (cambio stato), trigger `validate_affiliate_code` (lettura).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| user_id | uuid | — | YES | FK → `auth.users(id)` ON DELETE CASCADE |
| code | text | — | NO | UNIQUE — codice referral base (senza `-on`) |
| parent_id | uuid | — | YES | FK self → `affiliates(id)` ON DELETE SET NULL; nessun uso trovato nel frontend |
| status | text | `'pending'` | YES | CHECK: `pending`\|`approved`\|`rejected` |
| total_clients | integer | `0` | YES | obsoleto, mai aggiornato — il frontend calcola le stats live da `affiliate_commissions` |
| total_earned | numeric | `0` | YES | idem |
| total_pending | numeric | `0` | YES | idem |
| created_at | timestamptz | `now()` | YES | |
| email | text | — | YES | |
| name | text | — | YES | |
| approved_email_sent_at | timestamptz | — | YES | letta/scritta da `approve-affiliate` per evitare doppie email di approvazione |
| admin_notes | text | — | YES | |
| city | text | — | YES | |
| province | text | — | YES | |
| phone | text | — | YES | |
| legal_name | text | — | YES | |

- **Indici**: PK, `affiliates_code_key` (unique su `code`).
- **RLS**: `Chiunque può fare richiesta affiliato` (INSERT, check `status='pending'`), `affiliates: admin read all` (SELECT, ruolo admin), `affiliates: admin update` (UPDATE, ruolo admin), `affiliates: select own` (SELECT, `auth.uid() = user_id`).
- ⚠️ **Nessuna policy UPDATE per l'utente stesso**: la migration `20260719_drop_affiliates_all_policy.sql` ha rimosso una policy `ALL` legacy (`"Affiliato vede solo i suoi dati"`, mai vista in nessuna migration precedente — prova che la tabella esisteva "a mano" ben prima della cartella `migrations/`) che permetteva a un affiliato di aggiornare la propria riga, incluso `status → 'approved'`, bypassando `approve-affiliate`. Da allora il cambio di stato passa **solo** dalla Edge Function (service role).
- ⚠️ Una FK `businesses_affiliate_code_fkey` (`businesses.affiliate_code → affiliates.code`) esisteva in produzione (aggiunta a mano, mai in una migration) ma è stata rimossa da `20260816_affiliate_code_on_suffix_validation.sql` e sostituita da un trigger — vedi sezione RPC.

#### `appointment_services`
Righe di dettaglio servizi per appuntamento multi-servizio, con snapshot di prezzo/durata al momento della conferma (le modifiche future al listino non alterano lo storico). Creata da `20260526_appointment_services.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| appointment_id | uuid | — | NO | FK → `appointments(id)` ON DELETE CASCADE |
| service_id | uuid | — | YES | FK → `services(id)` ON DELETE SET NULL |
| price_snapshot | numeric(10,2) | — | YES | |
| duration_snapshot | int | — | YES | |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK, `idx_aptsvc_appointment_id`, `idx_aptsvc_service_id`.
- **RLS**: `aptsvc: owner all` (ALL, via join `appointment_id → appointments → businesses.user_id = auth.uid()`).
- Popolata da `owner_confirm_booking()` (multi-servizio) e da `Agenda.jsx` alla creazione manuale di un appuntamento multi-servizio.

#### `appointments`
Agenda: appuntamenti effettivi del commerciante (creati manualmente o generati da `owner_confirm_booking()` a partire da una `bookings`). Include i campi "Smart Time" (`20260809`, solo schema, nessuna UI ancora collegata).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()`/`gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| employee_id | uuid | — | YES | FK → `employees(id)` ON DELETE SET NULL |
| client_name | text | — | NO | |
| date | date | — | NO | |
| start_time | time | `'09:00'` | NO | |
| duration_minutes | int | `60` (schema.sql) / `30` (verificato in prod) | NO | |
| price | numeric(10,2) | — | YES | |
| notes | text | — | YES | |
| completed | boolean | `false` | NO | |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_appointments_updated_at` |
| booking_id | uuid | — | YES | FK → `bookings(id)` ON DELETE SET NULL — `20260513_booking_whatsapp.sql` |
| client_phone | text | — | YES | `20260524_add_client_phone.sql` |
| actual_start_at | timestamptz | — | YES | Smart Time: tap "inizio lavorazione" — `20260809` |
| actual_end_at | timestamptz | — | YES | Smart Time: tap "fine lavorazione" — `20260809` |
| manual_minutes | int | — | YES | Smart Time: durata inserita a mano — `20260809` |
| time_status | text | `'none'` | NO | Smart Time: CHECK `none`\|`temp`\|`confirmed`\|`excluded` — `20260809` |
| pet_id | uuid | — | YES | FK → `pets(id)` ON DELETE SET NULL — quale animale è questo appuntamento; sempre NULL per business non-toelettatura o per pet non ancora censiti — `20260921_pets_size_and_appointment_link.sql` |

- **Indici**: PK, `idx_appointments_business_id`, `idx_appointments_date`/`idx_appointments_business_date` (business_id, date[, start_time] — duplicati funzionali, uno da `schema.sql` uno da `20260520_performance_indexes.sql`), `idx_appointments_business_completed` (business_id, completed, updated_at desc), `idx_appointments_booking_id`, `idx_appointments_client_name_trgm` (GIN trigram su `client_name`, ricerca fuzzy), `idx_appointments_pet_id`.
- **RLS**: `appointments: owner access` (ALL, via `businesses.user_id = auth.uid()`); in produzione coesiste con una policy legacy equivalente `"Appointments visibili solo al proprietario"` (mai in una migration, stessa condizione, solo ridondante).

#### `bookings`
Prenotazioni self-service dal mini-sito pubblico, stato `pending` finché il titolare non le conferma (`owner_confirm_booking`), trasformandole in una riga `appointments`. Realtime abilitato (`20260514_realtime_bookings.sql`) per notificare la dashboard in diretta.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| service_id | uuid | — | YES | FK → `services(id)` ON DELETE SET NULL |
| customer_name | text | — | NO | |
| customer_email | text | — | NO | salvata sempre in lowercase (normalizzata da `create_booking`) |
| customer_phone | text | — | YES | |
| appointment_date | date | — | NO | |
| appointment_time | time | — | NO | |
| status | text | `'confirmed'` (schema.sql) / di fatto sempre `'pending'` all'insert da `create_booking` | NO | CHECK: `pending`\|`confirmed`\|`cancelled` |
| created_at | timestamptz | `now()` | NO | |
| service_names | text | — | YES | snapshot testuale nomi servizi — `20260519_booking_services.sql` |
| service_ids | uuid[] | — | YES | multi-servizio — `20260719_booking_multi_service.sql` |

- **Indici**: PK, `idx_bookings_business_id`, `idx_bookings_business_status` (business_id, status), `idx_bookings_email` (su `lower(customer_email)`).
- **RLS**: `bookings: owner read` (SELECT), `bookings: owner update` (UPDATE) — entrambe via `businesses.user_id = auth.uid()`. **Nessuna policy INSERT**: by design, l'unico modo di creare una riga è la funzione `create_booking()` (SECURITY DEFINER); l'accesso diretto di `anon`/`authenticated` alla funzione stessa è stato revocato (`20260806_create_booking_revoke_anon.sql`) — solo il `service_role` (usato dalla Edge Function `create-booking`) può eseguirla.
- **Trigger**: `on_new_booking` (AFTER INSERT) → chiama `supabase_functions.http_request(...)` verso l'Edge Function `notify-new-booking`, con header `X-Webhook-Secret` in chiaro nella definizione del trigger (leggibile da chi ha accesso a `pg_trigger`, tipicamente solo ruoli con privilegi elevati).

#### `businesses`
Tabella centrale: un'attività per utente proprietario (UNIQUE su `user_id` — `20260719_businesses_user_id_unique.sql`). ~42 colonne: anagrafica, piano/stato abbonamento, dati Stripe, rate limit AI, referral, orari, smart-time.

| Colonna | Tipo | Default | Null | Note / migration di origine |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| user_id | uuid | — | NO | FK → `auth.users(id)` CASCADE; UNIQUE (`20260719_businesses_user_id_unique.sql`) |
| name | text | — | NO | |
| slug | text | — | YES | UNIQUE — URL pubblico |
| category | text | — | YES | |
| description | text | — | YES | |
| address | text | — | YES | |
| city | text | — | YES | |
| phone | text | — | YES | |
| whatsapp | text | — | YES | `20260422_add_whatsapp_to_businesses.sql` |
| email | text | — | YES | contatto pubblico mostrato sul sito |
| website | text | — | YES | |
| logo_url | text | — | YES | |
| cover_url | text | — | YES | |
| profile_image | text | — | YES | `20260507_profile_social_custom_category.sql` |
| instagram_url | text | — | YES | `20260507_...` |
| facebook_url | text | — | YES | `20260507_...` |
| business_type_custom | text | — | YES | `20260507_...` — categoria libera |
| is_active | boolean | `true` | NO | |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_businesses_updated_at` |
| plan | text | `'trial'` | YES | CHECK: `trial`\|`free`\|`starter`\|`pro`\|`active` (`'active'` aggiunto da `20260523_plan_active_value.sql`) — `20260423_admin_panel.sql` |
| admin_notes | text | — | YES | `20260518_admin_notes.sql` |
| status | text | `'trial'` | NO | CHECK: `trial`\|`active`\|`expired`\|`suspended` — `20260518_...` |
| plan_price | numeric | `99` | YES | `20260518_...` |
| trial_ends_at | timestamptz | — | YES | `20260518_...` |
| ai_calls_month | int | `0` | NO | deprecato, sostituito da `ai_calls_month_display` — `20260518_...` |
| ai_calls_total | int | `0` | NO | `20260518_...` |
| ai_tokens_month | int | `0` | NO | `20260519_ai_rate_limit.sql` |
| ai_calls_month_display | int | `0` | NO | `20260519_...` |
| ai_unlimited | boolean | `false` | NO | `20260519_...` |
| ai_reset_date | date | — | YES | `20260519_...` |
| affiliate_code | text | — | YES | codice referral (con eventuale suffisso `-on`); validato dal trigger `validate_affiliate_code` — `20260520_affiliate_code.sql` |
| stripe_subscription_id | text | — | YES | `20260522_stripe_columns.sql` |
| stripe_customer_id | text | — | YES | `20260522_...` |
| booking_capacity | int | `1` | NO | CHECK 1–50 — quanti clienti in parallelo — `20260610_booking_capacity.sql` |
| owner_email | text | — | YES | email di registrazione (da `auth.users`), distinta da `email` — `20260720_businesses_owner_email.sql` |
| smart_time_enabled | boolean | `false` | NO | `20260809_smart_time_foundations.sql` |
| is_free | boolean | `false` | NO | account omaggio legittimo: mai bloccato da `isBusinessBlocked`, mai contato come pagante (`getBusinessRealStatus` → `'gift'`) — `20260907_business_is_free.sql` |
| vertical | text | `'generico'` | YES | tipo di attività per attivare funzionalità dedicate (es. `'toelettatura'`); nessun CHECK sui valori ammessi, impostata solo da `Admin.jsx` — vedi sezione "Verticali" a inizio documento — `20260920_business_vertical.sql` |
| opening_hours | jsonb | (orari 9-18 standard, gestito lato applicazione) | YES | 🔴 **FANTASMA** — mai in una migration/schema.sql, ma letta/scritta da `Orari.jsx:36,62`, da `create_booking()` (validazione orari) e da `BookingSection.jsx`/`PublicSite.jsx`/`Agenda.jsx`. Struttura: oggetto con chiave per giorno (`monday`...`sunday`), ciascuno `{closed, morning:{open,close,active}, afternoon:{open,close,active}}` (formato nuovo) o `{open,close}` (formato legacy, gestito come fallback da `create_booking`) |
| template | text | `'standard'` | NO | 🔴 **FANTASMA** — mai in una migration/schema.sql; **nessun uso trovato nel codice frontend attuale** in questa passata — verificare se è un residuo morto o una feature non ancora collegata |

- **Vincoli**: CHECK `booking_capacity` (1-50), CHECK `plan`, CHECK `status`; FK `user_id`; UNIQUE `slug`; UNIQUE `user_id`.
- **FK rimossa**: `businesses_affiliate_code_fkey` (verso `affiliates.code`) — era stata aggiunta a mano in produzione, mai in una migration; rimossa da `20260816_affiliate_code_on_suffix_validation.sql` e sostituita da un trigger (vedi RPC).
- **Trigger**: `trg_businesses_updated_at` (BEFORE UPDATE → `set_updated_at()`), `trg_businesses_validate_affiliate_code` (BEFORE INSERT OR UPDATE OF affiliate_code → `validate_affiliate_code()`, `20260816`).
- **Indici**: PK, `businesses_slug_key`/`idx_businesses_slug` (duplicati funzionali), `businesses_user_id_unique`/`idx_businesses_user_id` (duplicati funzionali), `idx_businesses_affiliate_code` (parziale, WHERE NOT NULL).
- **RLS**: `businesses: owner access` (ALL, `auth.uid() = user_id`), `businesses: public read` (SELECT, `is_active = true` — mini-sito pubblico), `businesses: admin read all` (SELECT, ruolo admin — `20260423`/rifatta idempotente in `20260517_admin_rls_fix.sql`), `businesses: admin update all` (UPDATE, ruolo admin — idem). In produzione coesistono policy legacy equivalenti (`"Users can insert/update/view own business"`, mai in una migration) con la stessa condizione — ridondanti, non contraddittorie.

#### `contacts`
Rubrica clienti indipendente dagli appuntamenti (CRM leggero), con import vCard. Creata da `20260527_create_contacts.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | — | NO | |
| phone | text | — | YES | normalizzato IT da `src/lib/phone.js` prima dell'insert |
| email | text | — | YES | |
| notes | text | — | YES | |
| source | text | `'manual'` | NO | es. `manual`, import vCard |
| created_at | timestamptz | `now()` | NO | |
| display_name | text | — | YES | nome alternativo per le comunicazioni verso il cliente; se impostato, sostituisce il nome reale **solo** nei messaggi WhatsApp (`PromemoriaClienti.jsx`, promemoria giorno-prima in `Agenda.jsx`) — mai nelle viste interne (agenda, lista clienti), dove il titolare vede sempre il nome vero — `20260920_grooming_universal_fields.sql` |

- **Indici**: PK, `idx_contacts_business_id`, `idx_contacts_business_phone` (business_id, phone), `idx_contacts_name_trgm` (GIN trigram su `name`, ricerca fuzzy — `20260520_performance_indexes.sql`).
- **RLS**: `contacts: owner all` (ALL, via `businesses.user_id = auth.uid()`).

#### `employees`
Dipendenti/collaboratori assegnabili agli appuntamenti (colore etichetta in agenda).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()`/`gen_random_uuid()` | NO | PK |
| business_id | uuid | — | YES/NO | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | — | NO | |
| color | text | `'#94a3b8'` (schema.sql) / `'#6366f1'` (verificato in prod) | NO | |
| created_at | timestamptz | `now()` | YES | |

- **Indici**: PK, `idx_employees_business_id` (duplicato `idx_employees_business`, stesse colonne).
- **RLS**: `employees: owner access` (ALL, via `businesses.user_id = auth.uid()`); coesiste con policy legacy equivalente `"Employees visibili solo al proprietario"` (mai in una migration).

#### `faq`
FAQ del supporto self-service (`SupportBot.jsx`). **Tracciata per la prima volta** da `20260823_faq_table_and_seed.sql` (prima era fantasma, creata a mano); la migration crea la tabella (`IF NOT EXISTS`) e fa upsert di 27 righe con ID espliciti (stessi UUID già in produzione, upsert idempotente `on conflict (id)`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| categoria | text | — | NO | es. `Account`, `Affiliati`, `Agenda`, `Recensioni`, `Sito`, `Social` |
| domanda | text | — | NO | |
| risposta | text | — | NO | |
| link | text | — | YES | route interna opzionale (es. `/dashboard?s=agenda`) |
| ordine | int | `0` | YES | ordinamento all'interno della categoria |
| created_at | timestamp *(senza timezone — unica tabella così)* | `now()` | YES | |

- **RLS**: `Lettura pubblica FAQ` (SELECT, `using (true)` — corretto per contenuto pubblico, ricreata idempotente dalla migration con `DROP POLICY IF EXISTS` prima).

#### `legal_acceptances` [FANTASMA]
Traccia le accettazioni di termini/privacy/DPA con versioning dei documenti accettati. Scritta oggi **solo** da `Onboarding.jsx:191-203` (contesto merchant, upsert con `onConflict: 'user_id,acceptance_type', ignoreDuplicates: true`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| user_id | uuid | — | NO | FK → `auth.users(id)` ON DELETE CASCADE |
| context | text | — | NO | CHECK (verificato in prod): `merchant`\|`affiliate` |
| acceptance_type | text | — | NO | CHECK (verificato in prod): `merchant_terms_dpa_privacy`\|`affiliate_contract_privacy` |
| document_versions | jsonb | `{}` | NO | es. `{termini: '2026-05-28', dpa: '...', privacy: '...'}` |
| source | text | — | NO | es. `onboarding_create_business` |
| accepted_at | timestamptz | `now()` | NO | |
| created_at | timestamptz | `now()` | NO | |

- **Vincoli**: UNIQUE(user_id, acceptance_type) — `legal_acceptances_unique_user_type`, è il target dell'`onConflict` usato dall'upsert.
- **RLS**: `legal_acceptances: owner insert`, `legal_acceptances: owner read`.
- ⚠️ **Discrepanza trovata in questa passata**: il CHECK su `acceptance_type` prevede anche `'affiliate_contract_privacy'` (verificato in produzione il 16/08), ma **nessun punto del codice attuale scrive questa riga** — `AffiliatesAuth.jsx` mostra solo una checkbox obbligatoria lato client (`legalAccepted`, righe 32/47/172-179) per accettare il Contratto di Affiliazione, senza persistere nulla in `legal_acceptances`. L'accettazione dell'affiliato non risulta oggi tracciata lato server, a differenza di quella del merchant.

#### `pets`
Animali dei clienti, funzionalità del verticale `'toelettatura'` (vedi sezione "Verticali" a inizio documento) — ma la tabella e la RLS restano sempre attive per qualunque business: è la UI in `Agenda.jsx`/`Clienti.jsx` a essere gated, non la lettura/scrittura del dato. Agganciata per `client_phone` normalizzato, stesso identificativo già usato da `contacts`/`appointments` — nessun nuovo sistema di riconoscimento cliente. Creata da `20260920_grooming_universal_fields.sql`, estesa da `20260921_pets_size_and_appointment_link.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| client_phone | text | — | NO | normalizzato IT da `src/lib/phone.js`, stesso identificativo di `contacts`/`appointments` |
| name | text | — | NO | |
| breed | text | — | YES | razza, testo libero |
| coat | text | — | YES | CHECK: `corto`\|`medio`\|`lungo` — mostrato come `CoatBars` (`PetIndicators.jsx`) |
| gender | text | `'non_specificato'` | NO | CHECK: `maschio`\|`femmina`\|`non_specificato` — determina il colore di `PetBoneIcon` |
| weight_note | text | — | YES | nota libera sul peso (non un campo numerico strutturato) |
| created_at | timestamptz | `now()` | NO | |
| size | text | — | YES | CHECK: `xs`\|`s`\|`m`\|`l`\|`xl` — mostrata come `SizeBadge` (`PetIndicators.jsx`); aggiunta da `20260921_pets_size_and_appointment_link.sql`, presente sia nel form di `Agenda.jsx` sia in quello di `Clienti.jsx` (aggiunto con un fix separato, `df690df`, perché mancante al primo giro) |

- **Indici**: PK, `idx_pets_business_id`, `idx_pets_business_phone` (business_id, client_phone), `idx_pets_name_trgm` (GIN trigram su `name`, ricerca fuzzy cross-cliente — `20260921`).
- **RLS**: `pets: owner all` (ALL, via `businesses.user_id = auth.uid()`) — stesso pattern di `contacts`/`appointment_services`.
- **Uso reale**: in `Agenda.jsx` il modulo appuntamento fa una ricerca live cross-business su `pets.name` (non più un fetch di tutti i pet del business — rimosso da `9bd642f`), mostra "Nome pet · Proprietario" + telefono per disambiguare omonimi, precompila cliente e salva `pet_id` sull'appuntamento; in `Clienti.jsx` la scheda cliente ha CRUD pet completo (crea/modifica/elimina, `39d768d`) sulla lista dei pet di quel `client_phone`. Quando un pet viene eliminato, `appointments.pet_id` passa a `NULL` via `ON DELETE SET NULL` — nessun errore lato UI, verificato esplicitamente in `39d768d`.

#### `push_subscriptions`
Sottoscrizioni Web Push per notifiche browser. Creata da `20260516_push_subscriptions.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| user_id | uuid | — | NO | FK → `auth.users(id)` ON DELETE CASCADE |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| endpoint | text | — | NO | endpoint del push service del browser |
| subscription | jsonb | — | NO | oggetto `PushSubscription` completo (endpoint+chiavi) |
| created_at | timestamptz | `now()` | YES | |

- **Vincoli**: UNIQUE(user_id, endpoint).
- **RLS**: `push_subscriptions: owner` (ALL, `user_id = auth.uid()`).

#### `reminders`
Promemoria/task interni del commerciante (non da confondere con i "Promemoria clienti" WhatsApp, che non usano una tabella propria ma leggono `appointments`/`contacts`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| user_id | uuid | — | NO | FK → `auth.users(id)` ON DELETE CASCADE |
| title | text | — | NO | |
| notes | text | — | YES | |
| due_at | timestamptz | — | YES | |
| priority | text | `'medium'` | NO | CHECK: `low`\|`medium`\|`high` |
| status | text | `'pending'` | NO | CHECK: `pending`\|`done`\|`dismissed` |
| related_type | text | — | YES | es. `social_draft`, `review`, `service` |
| related_id | uuid | — | YES | id dell'entità correlata (nessuna FK, tipo libero) |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_reminders_updated_at` |

- **Indici**: PK, `idx_reminders_business_id`, `idx_reminders_user_id`, `idx_reminders_due_at` (parziale, WHERE status='pending'), `idx_reminders_business_status_due` (business_id, status, due_at — `20260520_performance_indexes.sql`).
- **RLS**: `reminders: owner access` (ALL, `auth.uid() = user_id`).

#### `reviews`
Recensioni clienti (manuali o "importate" a mano da altre piattaforme), con risposta del titolare generabile via AI.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| author_name | text | — | NO | |
| author_avatar | text | — | YES | |
| rating | smallint | — | NO | CHECK 1–5 |
| body | text | — | YES | |
| source | text | `'manual'` | NO | CHECK: `manual`\|`google`\|`tripadvisor`\|`facebook`\|`yelp` |
| source_id | text | — | YES | ID originale nella piattaforma sorgente |
| is_visible | boolean | `true` | NO | mostrata sul sito pubblico se true (badge "Pubblicata" in `Recensioni.jsx`) |
| reply | text | — | YES | risposta del titolare |
| replied_at | timestamptz | — | YES | |
| reviewed_at | timestamptz | `now()` | NO | |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_reviews_updated_at` |
| published | boolean | `false` | YES | 🔴 **FANTASMA** — non in `schema.sql`; **nessun riferimento nel codice frontend attuale** in questa passata (verosimile residuo morto, distinto da `is_visible` che è la colonna realmente usata per "pubblicata sul sito") |

- **Indici**: PK, `idx_reviews_business_id`, `idx_reviews_rating` (business_id, rating), `idx_reviews_business_visible` (business_id, is_visible, reviewed_at desc — `20260520_performance_indexes.sql`).
- **RLS**: `reviews: owner access` (ALL, via `businesses.user_id = auth.uid()`), `reviews: public read` (SELECT, `is_visible = true`); coesiste con policy legacy equivalente `"Users can manage own reviews"` (mai in una migration).

#### `services`
Listino servizi offerti dal business (usato sia dall'agenda interna sia dal sito pubblico/prenotazioni).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | — | NO | |
| description | text | — | YES | |
| price | numeric(10,2) | — | YES | |
| price_label | text | — | YES | es. "a partire da", "fisso", "per ora" |
| duration_min | int | — | YES | durata in minuti — se NULL, `create_booking` non riesce a calcolare gli slot (nota nella FAQ) |
| image_url | text | — | YES | |
| is_available | boolean | `true` | NO | spegne il servizio **ovunque** (sito pubblico E agenda interna) |
| sort_order | int | `0` | NO | |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_services_updated_at` |
| visible_on_public_site | boolean | `true` | NO | nasconde il servizio **solo** dal sito pubblico (lista + form prenotazione), resta selezionabile in agenda — distinto da `is_available` — `20260908_services_visible_on_public_site.sql` |
| color | text | — | YES | colore facoltativo del servizio (stessa palette/classi `.ag-swatch` già usate per il colore dei dipendenti in Agenda.jsx); mostrato come pallino nella lista di `Servizi.jsx` e sul blocco appuntamento in `Agenda.jsx` (rappresentativo: primo servizio con colore impostato, se multi-servizio) — `20260920_grooming_universal_fields.sql` |

- **Indici**: PK, `idx_services_business_id`, `idx_services_business_sort` (business_id, sort_order — `20260520_performance_indexes.sql`).
- **RLS**: `services: owner access` (ALL, via `businesses.user_id = auth.uid()`), `services: public read` (SELECT, `is_available = true`); coesiste con policy legacy equivalente `"Users can manage own services"`.

#### `site_content`
Blocchi di contenuto del mini-sito pubblico (editor "Sito" → `EditorSito.jsx`), un blocco per `block_key` (`hero`, `about`, `cover`, `gallery`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| block_key | text | — | NO | UNIQUE con `business_id` |
| title | text | — | YES | |
| body | text | — | YES | |
| cta_label | text | — | YES | |
| cta_url | text | — | YES | |
| image_url | text | — | YES | |
| metadata | jsonb | `{}` | YES | campi extra liberi per il blocco |
| is_published | boolean | `false` | NO | **non più usata per il filtro pubblico** dal 15/06 (vedi sotto) |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_site_content_updated_at` |
| hero_title | text | — | YES | 🔴 **FANTASMA** — usata da `EditorSito.jsx:169,176` e `PublicSite.jsx` |
| hero_subtitle | text | — | YES | 🔴 idem — `EditorSito.jsx:170,177` |
| hero_cta_text | text | — | YES | 🔴 idem — `EditorSito.jsx:171,178` |
| about_text | text | — | YES | 🔴 idem — `EditorSito.jsx:243,248` |
| cover_image_url | text | — | YES | 🔴 idem — `EditorSito.jsx:286,325,339` |

- **Vincoli**: UNIQUE(business_id, block_key).
- **Indici**: PK, `idx_site_content_business_id`.
- **RLS**: `site_content: owner access` (ALL, via `businesses.user_id = auth.uid()`), `site_content: public read` (SELECT, `using (true)` — **da `20260515_site_content_public_read.sql`**, che ha sostituito la policy originale filtrata su `is_published = true`: quel filtro causava pagina bianca ai visitatori perché i blocchi non venivano esplicitamente "pubblicati" dall'editor). Coesiste con policy legacy equivalente `"Site content leggibile pubblicamente"`.

#### `social_drafts`
Bozze di post social (Instagram/Facebook) generate dall'AI o scritte a mano, con stato di avanzamento.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| platform | text | — | NO | CHECK: `instagram`\|`facebook`\|`linkedin`\|`x`\|`tiktok`\|`generic` (solo `instagram`/`facebook` usati oggi dalla UI) |
| content | text | — | NO | |
| hashtags | text[] | — | YES | |
| image_url | text | — | YES | |
| status | text | `'draft'` | NO | CHECK: `draft`\|`approved`\|`scheduled`\|`published`\|`archived` |
| scheduled_at | timestamptz | — | YES | |
| published_at | timestamptz | — | YES | |
| ai_generated | boolean | `false` | NO | |
| ai_prompt | text | — | YES | prompt usato per generare il draft |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_social_drafts_updated_at` |

- **Indici**: PK, `idx_social_drafts_business_id`, `idx_social_drafts_status`, `idx_social_drafts_scheduled_at`, `idx_social_drafts_business_status` (business_id, status, created_at desc — `20260520_performance_indexes.sql`).
- **RLS**: `social_drafts: owner access` (ALL, via `businesses.user_id = auth.uid()`); coesiste con policy legacy equivalente `"Users can manage own social drafts"`.

#### `analytics_events` — dichiarata ma **non esistente in produzione**
`schema.sql` (righe 158-172) dichiara questa tabella con indici e 2 policy (owner read + public insert per tracking anonimo), ma l'audit di produzione del 16/08 **non l'ha trovata** tra le tabelle reali, e nessuna chiamata `.from('analytics_events')` esiste nel codice attuale. Se si usa `schema.sql` per bootstrappare un ambiente nuovo, questa parte viene creata comunque (nessun errore) ma non riflette lo stato di produzione. **Non contarla tra le 20 tabelle reali** (19 fotografate dall'audit del 16/08 + `pets`, aggiunta il 20/09 da `20260920_grooming_universal_fields.sql`).

---

### 3. RLS — policy legacy duplicate (non in nessuna migration)

Oltre alle policy elencate per tabella sopra, la produzione porta ancora policy "storiche" (pre-esistenti alla cartella `migrations/`, quindi non ricreabili da una migration) che **coesistono** con le policy più recenti sulla stessa tabella, con condizioni equivalenti (nessun conflitto di sicurezza, solo ridondanza):

| Tabella | Policy legacy | Duplica |
|---|---|---|
| `businesses` | `"Users can insert own business"`, `"Users can update own business"`, `"Users can view own business"` | `businesses: owner access` |
| `appointments` | `"Appointments visibili solo al proprietario"` | `appointments: owner access` |
| `employees` | `"Employees visibili solo al proprietario"` | `employees: owner access` |
| `reviews` | `"Users can manage own reviews"` | `reviews: owner access` |
| `services` | `"Users can manage own services"` | `services: owner access` |
| `social_drafts` | `"Users can manage own social drafts"` | `social_drafts: owner access` |
| `site_content` | `"Site content leggibile pubblicamente"` | `site_content: public read` |
| `affiliates` | `"Chiunque può fare richiesta affiliato"` | (nessun duplicato diretto, ma stesso intento di `INSERT` pubblico) |

Se si ricrea il DB da zero seguendo **solo** `schema.sql` + `migrations/`, queste policy legacy **non vengono ricreate** — non è un problema di sicurezza (le versioni "ufficiali" coprono le stesse condizioni), ma il comportamento sarà lievemente più pulito (una sola policy per condizione) rispetto alla produzione storica.

---

### 4. Funzioni / RPC / Trigger

Tutte `SECURITY DEFINER` tranne dove indicato, con `search_path = public` esplicito (buona pratica anti hijacking di search_path).

#### `create_booking(...)` — funzione pubblica di creazione prenotazione
**Definizione corrente** (unica firma rimasta, 9 parametri — l'overload legacy a 8 parametri, privo dei controlli di hardening, è stato rimosso da `20260807_drop_create_booking_8params.sql`):

```sql
create_booking(
  p_business_id    uuid,
  p_service_id     uuid,
  p_customer_name  text,
  p_customer_email text,
  p_date           date,
  p_time           time,
  p_customer_phone text default null,
  p_service_names  text default null,
  p_service_ids    uuid[] default null
) returns uuid
```

Logica (versione hardening, `20260806_create_booking_hardening.sql`, che ha aggiunto controlli SENZA rimuovere quelli precedenti):
1. `pg_advisory_xact_lock` su hash(business_id + data) — serializza le richieste concorrenti sullo stesso business+giorno, rilasciato automaticamente a fine transazione.
2. Rifiuta date nel passato (`p_date < current_date`).
3. Valida il formato email (regex) e, se presente, del telefono.
4. Valida i servizi: se `p_service_ids` è valorizzato, **tutti** i servizi devono esistere/essere disponibili per quel business (multi-servizio); altrimenti valida `p_service_id` singolo. Calcola la durata totale.
5. Valida che l'orario richiesto rientri **interamente** in una fascia di apertura attiva di `businesses.opening_hours` per quel giorno della settimana (specchio server-side della logica client in `BookingSection.jsx`), con fallback al formato "vecchio" `{open,close}` o a 09:00-18:00 se mancante.
6. Anti-doppione: rifiuta se esiste già un `pending` per la stessa email sullo stesso business.
7. Backstop anti-flood: rifiuta se il business ha già ≥200 booking `pending` totali, o se ne ha ricevuti ≥20 negli ultimi 10 minuti.
8. Check capacità: conta gli slot sovrapposti (via `get_taken_slots`) e rifiuta se ≥ `businesses.booking_capacity`.
9. Insert della riga `bookings` con `status='pending'`.

**Permessi**: dopo `20260806_create_booking_revoke_anon.sql`, l'esecuzione è **revocata** a `public`/`anon`/`authenticated` e concessa **solo** a `service_role` — l'unico chiamante è la Edge Function `create-booking` (che applica anche la verifica Cloudflare Turnstile prima di invocare la RPC). `BookingSection.jsx` non chiama più la RPC direttamente.

**Storia delle versioni** (per completezza, tutte sovrascritte dalla corrente): v1 `20260509` (nome `confirm_booking`, richiedeva OTP via `auth.email()`, creava subito l'appuntamento) → v2 `20260512` (rinominata `create_booking`, rimosso OTP, salva solo `pending`) → v3 `20260519_booking_services`/`20260610_booking_capacity` (parametri riordinati, check capacità) → v4 `20260719_create_booking_advisory_lock` (advisory lock) → v5 `20260719_booking_multi_service` (parametro `p_service_ids`) → v6 `20260806_create_booking_hardening` (corrente).

#### `get_taken_slots(p_business_id uuid, p_date date)` — SECURITY DEFINER, `language sql`
Restituisce `table(start_time time, duration_minutes int)`: unione di (a) gli `appointments` confermati per quel giorno e (b) i `bookings` ancora `pending` per quello stesso giorno, con la durata calcolata dal/dai servizio/i collegati (fallback 60 minuti se mancante). Usata da `create_booking` per il check di capacità e da `BookingSection.jsx` (RPC diretta, pubblica) per calcolare gli slot liberi lato client. **Resta pubblica** (`grant ... to anon, authenticated`) anche dopo la revoca di `create_booking`, perché espone solo orari/durate, non dati personali.

#### `owner_confirm_booking(p_booking_id uuid)` — SECURITY DEFINER
Solo il titolare autenticato (verificato via join `bookings → businesses` su `businesses.user_id = auth.uid()`). Passi: verifica che la prenotazione esista e sia ancora `pending`; calcola durata/prezzo totali (somma se multi-servizio via `service_ids`, altrimenti singolo `service_id`); aggiorna `bookings.status = 'confirmed'`; inserisce la riga `appointments` corrispondente (con `client_phone`, `booking_id`); se multi-servizio, popola anche `appointment_services` con lo snapshot prezzo/durata di ciascun servizio. Concessa solo a `authenticated`. Chiamata da `Agenda.jsx:553`.

#### `validate_affiliate_code()` — SECURITY DEFINER, trigger BEFORE INSERT OR UPDATE OF affiliate_code ON `businesses`
Introdotta da `20260816_affiliate_code_on_suffix_validation.sql` per sostituire la ex-FK rigida `businesses_affiliate_code_fkey`. Se `NEW.affiliate_code` è NULL/vuoto, passa (normalizzato a NULL). Altrimenti strippa un eventuale suffisso `-on` finale e verifica che il codice base esista (case-insensitive) in `affiliates.code`; se non esiste, solleva `'AFFILIATE_CODE_INVALID: nessun affiliato con codice %'` — marcatore riconosciuto esplicitamente da `Onboarding.jsx` per mostrare un messaggio dedicato all'utente. `SECURITY DEFINER` perché chi si registra non ha permessi RLS di lettura su `affiliates`.
Trigger: `trg_businesses_validate_affiliate_code`.

#### `set_updated_at()` — trigger generico, INVOKER
```sql
begin
  new.updated_at = now();
  return new;
end;
```
Riusato da 7 trigger: `trg_businesses_updated_at`, `trg_services_updated_at`, `trg_site_content_updated_at`, `trg_social_drafts_updated_at`, `trg_reviews_updated_at`, `trg_reminders_updated_at`, `trg_appointments_updated_at`.

#### Trigger `on_new_booking` (AFTER INSERT ON `bookings`)
Non è una funzione PL/pgSQL propria: chiama l'utility di sistema `supabase_functions.http_request(url, method, headers, body, timeout_ms)` per invocare in modo asincrono l'Edge Function `notify-new-booking`, passando l'header `X-Webhook-Secret` (il cui valore reale, in produzione, è incorporato in chiaro nella definizione del trigger). Storia: creato inizialmente con un header `Authorization` che causava 401 (la funzione ha `verify_jwt=false`) — rimosso da `20260519_fix_trigger_notify.sql`; il secret è stato aggiunto in produzione il 06/07 e documentato (con placeholder) da `20260719_trigger_notify_secret.sql`.

#### Funzioni rimosse (solo per cronaca, non eseguibili oggi)
- `confirm_booking(...)` — versione v1 con verifica OTP via `auth.email()`, rimossa da `20260512_booking_v2.sql`.
- `create_booking(uuid, uuid, text, text, text, date, time)` (7 parametri, ordine originale) — rimossa da `20260519_booking_services.sql`.
- `create_booking(uuid, uuid, text, text, date, time, text, text)` (8 parametri, senza `p_service_ids`) — rimossa da `20260807_drop_create_booking_8params.sql`.

#### Estensioni installate
- `uuid-ossp` (`schema.sql`) — fornisce `uuid_generate_v4()`, usata come default PK in molte tabelle (le più recenti usano invece `gen_random_uuid()`, nativa di Postgres 13+, senza bisogno di estensione — le due funzioni coesistono nel DB).
- `pg_trgm` (`20260520_performance_indexes.sql`) — abilita gli indici GIN trigram (`idx_contacts_name_trgm`, `idx_appointments_client_name_trgm`, `idx_pets_name_trgm` — quest'ultimo aggiunto da `20260921_pets_size_and_appointment_link.sql`) per ricerca fuzzy `ILIKE '%...%'`; installa ~24 funzioni interne (`similarity`, `gtrgm_*`, ecc.), non custom, non da documentare come oggetti applicativi.

---

*Fine Fase 2.*

---

## FASE 3 — Edge Functions e servizi esterni

### 0. Metodologia
Le 6 Edge Function sono state lette per intero (non solo l'intestazione). Per la mappa degli agganci esterni ho cercato in tutto `src/` e `supabase/functions/` ogni chiamata a `supabase.auth.*`, `supabase.storage.*`, `supabase.channel(...)`, `supabase.functions.invoke(...)`, ogni `fetch()` verso un dominio esterno, e ogni variabile d'ambiente (`import.meta.env.VITE_*` lato frontend, `Deno.env.get(...)` lato Edge Function).

---

### 1. Le 6 Edge Function, passo-passo

#### `claude-proxy` — `verify_jwt`: **true** (default)
**Scopo**: proxy autenticato verso l'API Anthropic (Claude), con rate-limit a token mensile per business. È l'unico punto da cui il frontend genera contenuti AI (descrizione onboarding, post social, risposte alle recensioni).

1. Legge l'header `Authorization` (obbligatorio) e crea un client Supabase con quel token per identificare l'utente (`auth.getUser()`); se manca o non è valido → 401.
2. Legge `prompt` dal body JSON; rifiuta se assente, vuoto o >20.000 caratteri.
3. Carica il business dell'utente (`businesses.ai_tokens_month`, `ai_calls_month`, `ai_calls_month_display`, `ai_calls_total`, `ai_unlimited`, `ai_reset_date`).
4. Calcola se serve il reset mensile (mese corrente ≠ mese di `ai_reset_date`); se il business non ha `ai_unlimited=true` e ha già raggiunto `TOKEN_LIMIT = 350_000` token nel mese corrente → **429** `AI_LIMIT_REACHED`.
5. Chiama `POST https://api.anthropic.com/v1/messages` (modello `claude-sonnet-4-6`, `max_tokens: 1000`, timeout 25s) con l'header `x-api-key: CLAUDE_API_KEY`.
6. Se Anthropic risponde errore → 502 con dettaglio.
7. Aggiorna in modo fire-and-forget (non blocca la risposta) i contatori del business (`ai_tokens_month`, `ai_calls_month_display`, `ai_calls_month`, `ai_calls_total`, ed `ai_reset_date` se è scattato il reset mensile).
8. Risponde `{ text }` col solo testo generato.

**Input**: `{ prompt: string }` + header `Authorization: Bearer <access_token utente>`.
**Output**: `{ text: string }` oppure `{ error, message? }`.
**Secret usati**: `CLAUDE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
**Servizi esterni chiamati**: **Anthropic API** (`api.anthropic.com`).

#### `create-booking` — `verify_jwt`: **true** (default, ma pensata per essere invocata anche senza sessione utente — vedi nota)
**Scopo**: unico punto d'ingresso pubblico per creare una prenotazione dal mini-sito; applica l'anti-bot Cloudflare Turnstile prima di chiamare la RPC `create_booking` con privilegi di `service_role` (che bypassano i grant `anon`/`authenticated`, revocati sulla RPC da `20260806_create_booking_revoke_anon.sql`).

1. Accetta solo `POST` (gestisce `OPTIONS` per CORS).
2. Se `TURNSTILE_SECRET_KEY` è configurato: richiede `turnstile_token` nel body, lo verifica con `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` (passando anche l'IP client, letto da `cf-connecting-ip` o `x-forwarded-for`); se manca o non è valido → 400/403. Se il secret **non** è configurato, salta la verifica (rollout in due tempi, funzione resta operativa ma senza anti-bot).
3. Valida che i campi obbligatori (`business_id`, `service_id`, `customer_name`, `customer_email`, `date`, `time`) siano stringhe presenti.
4. Crea un client Supabase con `SUPABASE_SERVICE_ROLE_KEY` e chiama `supabase.rpc('create_booking', {...})` passando tutti i parametri incluso l'opzionale `p_service_ids` (multi-servizio).
5. Se la RPC solleva uno degli errori "noti" (`KNOWN_BOOKING_ERRORS`, es. "Servizio non disponibile", "Orario fuori dagli orari di apertura"...) lo inoltra verbatim al client (400); qualunque altro errore Postgres viene mascherato con un messaggio generico (500) per non far trapelare dettagli interni dello schema.
6. Risponde `{ id: <booking_id> }`.

**Input**: `{ business_id, service_id, customer_name, customer_email, date, time, customer_phone?, service_names?, service_ids?, turnstile_token? }` — **nessun header Authorization richiesto per il flusso applicativo**: è la stessa Edge Function ad autenticarsi verso Supabase con la service role key, non verso l'utente finale (chiamata pubblica dal sito, `BookingSection.jsx`).
**Output**: `{ id: uuid }` oppure `{ error: string }`.
**Secret usati**: `TURNSTILE_SECRET_KEY` (opzionale), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
**Servizi esterni chiamati**: **Cloudflare Turnstile** (`challenges.cloudflare.com/turnstile/v0/siteverify`).

#### `notify-new-booking` — `verify_jwt`: **false** (esplicito in `config.toml`)
**Scopo**: invocata dal trigger DB `on_new_booking` (AFTER INSERT su `bookings`) per inviare una notifica push al titolare quando arriva una nuova prenotazione pending. Non è mai chiamata dal frontend.

1. Verifica l'header `X-Webhook-Secret` contro `NOTIFY_WEBHOOK_SECRET` con confronto a tempo costante (`crypto.subtle.timingSafeEqual`); se assente/errato → 401.
2. Legge il body (payload del trigger, `{record: {...}}` o il booking diretto); se `status !== 'pending'` esce subito (200, "skip") — evita notifiche per righe non pending.
3. Legge `push_subscriptions` per il `business_id` della prenotazione; se nessuna subscription → 200 `{result: 'no_subscribers'}`.
4. Configura `web-push` con `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` e `mailto:info@piumapp.com`.
5. Invia in parallelo (`Promise.all`, timeout 5s ciascuna) una notifica push a ogni subscription (`title: 'Nuova prenotazione'`, deep-link a `/dashboard?s=agenda`).
6. Se una subscription risponde 410 (Gone, scaduta) la raccoglie e la elimina da `push_subscriptions` a fine ciclo.
7. Risponde `{ sent, failed, stale }` (500 solo se tutte le push sono fallite e nessuna inviata).

**Input**: payload del trigger DB (booking appena inserito) + header `X-Webhook-Secret`.
**Output**: `{ sent, failed, stale }` o `{ error }`.
**Secret usati**: `NOTIFY_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
**Servizi esterni chiamati**: **Web Push** (libreria `web-push`, protocollo standard verso gli endpoint push dei browser — es. FCM per Chrome/Android, servizio Apple per Safari — nessuna chiave API di terze parti oltre alle chiavi VAPID generate da PIUM stesso).

#### `stripe-checkout` — `verify_jwt`: **true** (default)
**Scopo**: crea (o riusa) un Customer Stripe per il business dell'utente autenticato e apre una sessione di Stripe Checkout per l'abbonamento, applicando lo sconto del canale affiliato "-on" quando pertinente.

1. Verifica `Authorization`, ottiene l'utente da Supabase Auth (con service role key, non anon).
2. Legge il business dell'utente (`id, stripe_customer_id, affiliate_code, plan_price`); 404 se non esiste.
3. Se il business non ha ancora un `stripe_customer_id`, crea un Customer Stripe (`POST /v1/customers`, con `metadata.supabase_user_id`/`metadata.business_id`) e lo salva sul business.
4. **Anti-doppio-addebito**: interroga `GET /v1/subscriptions?customer=...&status=all` e, se trova già una subscription `active`/`trialing`, riallinea `businesses.status`/`stripe_subscription_id` a quello stato reale su Stripe e risponde `{ already_active: true }` **senza aprire un secondo checkout**.
5. Altrimenti crea la sessione (`POST /v1/checkout/sessions`, `mode=subscription`, `line_items[0][price]=STRIPE_PRICE_ID`, `success_url`/`cancel_url` verso `APP_URL`, `locale=it`); se `affiliate_code` termina in `-on` (case-insensitive), applica `discounts[0][coupon] = STRIPE_COUPON_ON`.
6. Risponde `{ url: <checkout_session_url> }` — il frontend fa un semplice redirect (`window.location.href`), **nessuna libreria Stripe.js coinvolta**.

**Input**: nessun body, solo header `Authorization: Bearer <access_token utente>`.
**Output**: `{ url }` oppure `{ already_active: true }` oppure `{ error }`.
**Secret usati**: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_COUPON_ON` (opzionale), `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
**Servizi esterni chiamati**: **Stripe API** (`api.stripe.com` — Customers, Subscriptions, Checkout Sessions).

#### `stripe-webhook` — `verify_jwt`: **false** (esplicito in `config.toml`, obbligatorio: Stripe non manda un JWT Supabase)
**Scopo**: riceve gli eventi Stripe e tiene sincronizzato lo stato di abbonamento del business, oltre a registrare le commissioni affiliato mensili.

1. Legge il body raw e l'header `stripe-signature`; verifica la firma **con Web Crypto nativo** (HMAC-SHA256, nessun SDK Stripe) confrontando contro `STRIPE_WEBHOOK_SECRET`, con **rifiuto di webhook più vecchi di 5 minuti** (anti-replay) e confronto a tempo costante; firma non valida → 400.
2. Gestisce 4 tipi di evento:
   - **`checkout.session.completed`**: trova il business per `stripe_customer_id`, imposta `status='active'`, `plan='active'`, salva `stripe_subscription_id`; se c'è un `trial_end` sulla subscription (letta con `GET /v1/subscriptions/:id`), lo salva in `trial_ends_at`.
   - **`customer.subscription.updated`**: mappa lo `status` Stripe → status PIUM (`trialing→trial`, `active→active`, `past_due→suspended`, `canceled→expired`) e aggiorna il business.
   - **`customer.subscription.deleted`**: imposta `status='expired'`, `plan='free'`.
   - **`invoice.paid`**: (a) se il business non è già `active`, rilegge la subscription reale su Stripe e riallinea lo status locale se risulta `active`/`trialing` (protegge da disallineamenti, es. blocco admin manuale su un cliente in realtà ancora regolare); (b) se `amount_paid` è mancante o ≤0, **skip esplicito** (nessuna riga a 0 registrata, `c6ba13e`); (c) se il business ha un `affiliate_code` e `amount_paid` è valido, calcola il numero di mensilità già commissionate (`count` su `affiliate_commissions`), determina l'importo con `commissionFor(amountPaidCents, monthNumber)` — **percentuale sull'importo REALMENTE fatturato** (`invoice.amount_paid`, non più un importo fisso per canale): 30% per i primi 12 mesi, 15% dal 13° mese a vita, **nessun tetto** — e inserisce una riga in `affiliate_commissions` con `status='pending'`; un insert duplicato (stesso `stripe_invoice_id`, retry di Stripe) viene riconosciuto dal codice errore Postgres `23505` e ignorato silenziosamente (non è un errore per il chiamante). Modello a percentuale introdotto da `c6ba13e` (era: importo fisso 29,99€ canale pieno / 19,99€ canale "-on"): canale FULL/ON pagano prezzi diversi, quindi la commissione differisce già di conseguenza senza bisogno di una tariffa separata per canale. **Non deployato**: resta solo nel repo finché non si aggiornano manualmente `STRIPE_PRICE_ID`/`STRIPE_COUPON_ON` su Stripe Dashboard e si verifica con un pagamento di test.
3. Risponde sempre `{received:true}` (200) agli eventi gestiti con successo, anche quando una scrittura secondaria (es. commissione) fallisce in modo "non-blocking" — Stripe non deve ritentare l'evento principale.

**Input**: body raw dell'evento Stripe + header `stripe-signature`.
**Output**: `{received:true}` o `{error}`.
**Secret usati**: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
**Servizi esterni chiamati**: **Stripe API** (verifica webhook via Web Crypto — nessuna chiamata HTTP per la verifica firma; chiamata HTTP `GET /v1/subscriptions/:id` per rileggere lo stato reale in due punti).

#### `approve-affiliate` — `verify_jwt`: **true** (default) + controllo ruolo applicativo
**Scopo**: unico canale per cambiare lo stato di un affiliato (`pending`→`approved`/`rejected`), da quando la policy RLS che lo permetteva direttamente è stata rimossa (`20260719_drop_affiliates_all_policy.sql`). Invia anche l'email di approvazione.

1. Verifica che tutte le env var richieste siano presenti (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) — se manca qualcosa, 500 esplicito con l'elenco.
2. Estrae il bearer token, verifica l'utente con un client **anon** (`auth.getUser(token)`), poi controlla `user.app_metadata.role === 'admin'` — se non admin, 403.
3. Valida `affiliate_id` (stringa) e `target_status` (deve essere uno tra `pending`/`approved`/`rejected`).
4. Con un client **service role**, legge l'affiliato (`id, name, email, status, approved_email_sent_at`), poi aggiorna `status = target_status`.
5. Se il nuovo stato è `'approved'`, lo stato precedente era `'pending'` e non è già stata mandata un'email di approvazione (`approved_email_sent_at IS NULL`): invia l'email via **Resend** (`POST https://api.resend.com/emails`, con `Idempotency-Key: affiliate-approved-<id>` per evitare doppie email in caso di retry) e poi aggiorna `approved_email_sent_at`.
6. Risponde con lo stato applicato e se l'email è stata inviata.

**Input**: `{ affiliate_id, target_status }` + header `Authorization: Bearer <access_token admin>`.
**Output**: `{ updated, email_sent, previous_status, status }` oppure `{ error, detail? }`.
**Secret usati**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `FROM_EMAIL` (default `PIUM <no-reply@piumapp.com>`).
**Servizi esterni chiamati**: **Resend** (`api.resend.com`, invio email transazionale).

---

### 2. Mappa degli agganci esterni

Organizzata per servizio. Ogni riga: dove nel codice, cosa fa. Questa è la mappa da usare per capire cosa va riscritto/sostituito per portare PIUM su un'infrastruttura diversa da Supabase/Stripe/Anthropic/Cloudflare/Resend.

#### Supabase — Auth
| Dove | Cosa fa |
|---|---|
| `src/lib/supabase.js` | istanzia il client (`createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`), condiviso da tutta l'app |
| `App.jsx:35,48` | `getSession()` per instradare `PublicRoute` (redirect a `/dashboard` se già loggato) e per `NotificationScheduler` |
| `Auth.jsx:36,70,81,251` | `getSession()` (redirect se già loggato), `signInWithPassword`, `signUp`, `resetPasswordForEmail` |
| `AdminLogin.jsx:18,30` | `signInWithPassword` per l'accesso admin separato, `signOut` in caso di fallimento post-check ruolo |
| `AffiliatesAuth.jsx:36,56,66` | `getSession`, `signInWithPassword`, `signUp` (per affiliati) |
| `ResetPassword.jsx:16,37,46` | `getSession` (verifica token di recovery), `updateUser({password})`, `signOut` post-reset |
| `Settings.jsx:57,120,136,145,151,159` | `getUser`, `updateUser({email})`, `signInWithPassword` (ri-autenticazione prima di cambiare password), `updateUser({password})`, `signOut`, `signOut({scope:'global'})` (revoca tutte le sessioni) |
| `Dashboard.jsx:76,109` | `getUser`, `signOut` |
| `Admin.jsx:120,486` | `getUser` (verifica ruolo admin dal JWT), `signOut` |
| `Affiliates.jsx:32,148` | `getSession`, `signOut` |
| `Onboarding.jsx:84,146` | `getUser` (due punti del wizard) |
| `SubscriptionGate.jsx:13` | `signOut` (unica via d'uscita per un account bloccato) |
| `Promemoria.jsx:149` | `getUser` (per popolare `user_id` sull'insert di un reminder) |
| `lib/useStripeCheckout.js:15`, `lib/pushSubscription.js:27,58`, `lib/claude.js:6` | `getSession` per recuperare l'`access_token` da passare come `Authorization` alle Edge Function |
| Edge Functions (`claude-proxy`, `stripe-checkout`, `approve-affiliate`) | `supabase.auth.getUser(token)` lato server per identificare/autorizzare il chiamante |
| **Ruolo admin** | non è una tabella `roles`: è il claim `app_metadata.role === 'admin'` dentro il JWT Supabase, controllato sia lato RLS (`auth.jwt() -> 'app_metadata' ->> 'role'`) sia lato Edge Function (`user.app_metadata?.role`) — va impostato a mano sull'utente Supabase (Dashboard o Admin API), non esiste un flusso applicativo per promuovere un admin |

#### Supabase — Database (Postgres via `postgrest`)
Coperto in dettaglio dalla **Fase 2**. In sintesi: ogni pagina/componente legge/scrive direttamente le tabelle via client `supabase.from(...)` con RLS a proteggere l'accesso (nessun backend REST/GraphQL proprietario) — è l'accoppiamento più profondo con Supabase: sostituire il DB significa riscrivere ogni chiamata `.from()` sparsa in ~25 file frontend oltre alle RPC e ai trigger.

#### Supabase — Storage
| Dove | Cosa fa |
|---|---|
| `EditorSito.jsx:310-312` | upload immagine di copertina (bucket `site-images`, `upsert:true`) |
| `EditorSito.jsx:320-322` | `getPublicUrl` per l'immagine di copertina appena caricata |
| `EditorSito.jsx:453-455` | upload immagine galleria (bucket `site-images`, niente `upsert`: ogni immagine è un file nuovo) |
| `EditorSito.jsx:462` | `getPublicUrl` per l'immagine galleria |
| `EditorSito.jsx:614-616,624` | upload/getPublicUrl per il logo/foto profilo del business |
| — | **Unico bucket usato: `site-images`**. Nessuna chiamata `.remove()` trovata: le immagini rimosse dalla galleria lato UI restano orfane nello storage (non vengono mai cancellate fisicamente) |
| — | Le immagini vengono compresse client-side (`browser-image-compression`) **prima** dell'upload, per ridurre banda/storage |

#### Supabase — Realtime
| Dove | Cosa fa |
|---|---|
| `Dashboard.jsx:208-219` | `supabase.channel('pending-bookings-<businessId>').on('postgres_changes', {event:'INSERT', table:'bookings', filter:'business_id=eq.<id>'}, ...)` — riceve in diretta le nuove prenotazioni pending per aggiornare il badge/contatore senza refresh; richiede `alter publication supabase_realtime add table bookings` (`20260514_realtime_bookings.sql`) |

#### Supabase — Edge Functions (invocazione dal frontend)
| Dove | Cosa fa |
|---|---|
| `Admin.jsx:361` | `supabase.functions.invoke('approve-affiliate', {body:{affiliate_id, target_status}})` |
| `lib/claude.js` | chiama `claude-proxy` con `fetch()` diretto (non `functions.invoke`) verso `${VITE_SUPABASE_URL}/functions/v1/claude-proxy`, header `Authorization` manuale |
| `lib/useStripeCheckout.js:21-30` | `fetch()` diretto verso `.../functions/v1/stripe-checkout` |
| `BookingSection.jsx` (`BOOKING_ENDPOINT`) | `fetch()` diretto verso `.../functions/v1/create-booking`, **senza** header Authorization utente (endpoint pubblico) |
| `lib/pushSubscription.js` | non chiama una function propria, ma usa `getSession()` per il token da altri flussi (nessuna Edge Function dedicata alle subscription: l'insert/delete su `push_subscriptions` avviene via `.from()` diretto) |

#### Stripe
| Dove | Cosa fa |
|---|---|
| `stripe-checkout/index.ts` | crea/riusa Customer, verifica subscription esistenti, crea Checkout Session (API REST diretta via `fetch`, **non** l'SDK `stripe` node nonostante sia in `package.json`) |
| `stripe-webhook/index.ts` | verifica firma webhook (Web Crypto, no SDK), legge lo stato reale di una subscription (`GET /v1/subscriptions/:id`) in due rami (`checkout.session.completed`, `invoice.paid`) |
| `lib/useStripeCheckout.js` | lato frontend, **nessuna chiamata diretta a Stripe**: riceve l'URL della Checkout Session dall'Edge Function e fa un redirect pieno (`window.location.href`) — Stripe Checkout è hosted, non embedded |
| `package.json` | dipendenze `@stripe/stripe-js` (client) e `stripe` (server SDK) **dichiarate ma non importate/usate da nessun file** in questa passata — tutto il codice Stripe usa `fetch()` grezzo verso `api.stripe.com`; verosimile dipendenza morta/residua |
| Webhook Stripe → PIUM | configurato lato dashboard Stripe (fuori dal repo) per puntare a `stripe-webhook`, eventi: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` |

#### Anthropic (Claude)
| Dove | Cosa fa |
|---|---|
| `claude-proxy/index.ts` | unico punto di contatto, `POST https://api.anthropic.com/v1/messages`, modello `claude-sonnet-4-6` |
| `lib/claude.js` (`generateWithClaude`) | wrapper frontend che chiama `claude-proxy`; usato da `Onboarding.jsx` (descrizione attività), `Social.jsx` (bozze post), `Recensioni.jsx` (risposte alle recensioni) |
| — | Nessuna chiave Anthropic esposta al client: `CLAUDE_API_KEY` vive solo nei secret dell'Edge Function |

#### Cloudflare
| Dove | Cosa fa |
|---|---|
| `cloudflare-worker.js` | Worker deployato manualmente su Cloudflare (route `*piumapp.com/*`): proxy trasparente che inoltra le richieste ai sottodomini attività (`mario.piumapp.com`) verso `www.piumapp.com`, lasciando l'hostname originale visibile al browser — `App.jsx`/`main.jsx` lo rilevano e servono `PublicSite` |
| `BookingSection.jsx:97-133` | carica lo script `https://challenges.cloudflare.com/turnstile/v0/api.js`, monta il widget Turnstile (solo se `VITE_TURNSTILE_SITE_KEY` è configurata) nello step di conferma prenotazione |
| `create-booking/index.ts:40-59` | verifica server-side del token Turnstile (`POST https://challenges.cloudflare.com/turnstile/v0/siteverify`) |
| DNS/CDN | dominio `piumapp.com` presumibilmente proxato da Cloudflare (necessario perché il Worker intercetti le richieste) — non verificabile dal codice, solo dedotto dalla presenza del Worker |

#### Resend
| Dove | Cosa fa |
|---|---|
| `approve-affiliate/index.ts:53-99` | unico punto di invio email transazionali: notifica di approvazione candidatura affiliato, `POST https://api.resend.com/emails` |
| — | Nessun altro flusso applicativo invia email da codice PIUM: le email di conferma registrazione/reset password sono gestite **da Supabase Auth stesso** (SMTP/provider configurato lato progetto Supabase, fuori dal repo) |

#### Web Push (VAPID) — standard web, non un "servizio" con account/API key di terzi
| Dove | Cosa fa |
|---|---|
| `lib/pushSubscription.js` | lato client, usa l'API browser `PushManager`/`serviceWorker` per creare la subscription (`VAPID_PUBLIC_KEY` pubblica, passata come `applicationServerKey`), salvata su `push_subscriptions` |
| `notify-new-booking/index.ts` | lato server, usa la libreria `web-push` (npm, via `import webpush from 'npm:web-push'` in Deno) con la chiave privata VAPID per firmare e inviare le notifiche ai browser (che le instradano a loro volta ai servizi push nativi: FCM per Chrome, servizio Apple per Safari — invisibili al codice PIUM) |
| `public/sw.js` | service worker che riceve l'evento `push` e mostra la notifica |

---

### 3. Variabili d'ambiente / secret — elenco completo

**Frontend (`.env`, prefisso `VITE_`, incorporate nel bundle a build-time — non sono segreti, sono chiavi pubbliche per design)**

| Variabile | Usata in | Scopo |
|---|---|---|
| `VITE_SUPABASE_URL` | `lib/supabase.js` + varie Edge Function calls dirette | URL progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `lib/supabase.js`, `BookingSection.jsx` | chiave pubblica Supabase (anon, protetta da RLS) |
| `VITE_TURNSTILE_SITE_KEY` | `BookingSection.jsx` | site key pubblica Cloudflare Turnstile (opzionale: se assente, niente anti-bot lato widget) |
| `VITE_VAPID_PUBLIC_KEY` | `lib/pushSubscription.js` | chiave pubblica VAPID per la subscription push del browser |

**Edge Functions (`Deno.env.get(...)`, secret configurati lato Supabase, mai esposti al client)**

| Secret | Usato da | Scopo |
|---|---|---|
| `SUPABASE_URL` | tutte e 6 | URL progetto (spesso ridondante con l'env auto-iniettata da Supabase) |
| `SUPABASE_ANON_KEY` | `claude-proxy`, `approve-affiliate` | client anon per validare il JWT dell'utente chiamante |
| `SUPABASE_SERVICE_ROLE_KEY` | tutte tranne (nessuna esclusa — anche `claude-proxy`/`stripe-checkout` la usano per bypassare RLS su letture/scritture applicative) | bypass RLS per operazioni con privilegi elevati |
| `CLAUDE_API_KEY` | `claude-proxy` | autenticazione API Anthropic |
| `STRIPE_SECRET_KEY` | `stripe-checkout`, `stripe-webhook` | autenticazione API Stripe |
| `STRIPE_PRICE_ID` | `stripe-checkout` | ID del prezzo (piano PIUM) su Stripe |
| `STRIPE_COUPON_ON` | `stripe-checkout` | ID coupon sconto per il canale affiliato "-on" |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | verifica firma HMAC degli eventi Stripe |
| `APP_URL` | `stripe-checkout` | base URL per `success_url`/`cancel_url` del Checkout (default `https://www.piumapp.com`) |
| `TURNSTILE_SECRET_KEY` | `create-booking` | verifica server-side del token Turnstile (opzionale) |
| `NOTIFY_WEBHOOK_SECRET` | `notify-new-booking` (verificato) + incorporato nella definizione del trigger `on_new_booking` (chi lo invoca) | autenticazione del trigger DB verso la function |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `notify-new-booking` | firma delle notifiche push (la pubblica deve corrispondere a `VITE_VAPID_PUBLIC_KEY` lato frontend) |
| `RESEND_API_KEY` | `approve-affiliate` | autenticazione API Resend |
| `FROM_EMAIL` | `approve-affiliate` | mittente email (default `PIUM <no-reply@piumapp.com>`) |

---

*Fine Fase 3.*

---

## FASE 4 — Flussi

Ogni flusso è ricostruito leggendo il codice reale (frontend + RPC + Edge Function), con riferimenti a file/riga.

### 1. Registrazione e onboarding

#### 1a. Merchant (attività)
1. **`/auth`** (`Auth.jsx`) — tab "Registrati": form nome/email/password + checkbox obbligatoria di accettazione Termini/DPA/Privacy (`legalAccepted`, riga 59-62 — blocca il submit se non spuntata, ma **non scrive nulla in DB a questo punto**, è solo un gate client-side). Se in `?ref=CODICE` nell'URL, il codice viene salvato in `localStorage.pium_ref` (riga 32-33) **prima ancora** del signup, così sopravvive anche se l'utente non completa subito la registrazione.
2. `supabase.auth.signUp({email, password, options:{data:{full_name}, emailRedirectTo: '<origin>/auth'}})` (Auth.jsx:81-88). Se Supabase Auth richiede conferma email, non c'è sessione (`data.session` nullo) → schermata "Email inviata"; se la conferma email è disabilitata, c'è subito sessione → redirect a **`/onboarding`**.
3. **`/onboarding`** (`Onboarding.jsx`) — al mount verifica che l'utente sia loggato, non sia admin, e non abbia già un business (righe 81-99); precompila `affiliate_code` da `localStorage.pium_ref` (riga 68-71, resta modificabile a mano).
4. Wizard a 3 step (validazione client-side ad ogni step: `validate()` riga 114-131): **Step 0** nome+categoria+codice affiliato opzionale, **Step 1** almeno un contatto tra telefono/email, **Step 2** città obbligatoria + descrizione libera opzionale.
5. Al submit finale (`handleSubmit`, riga 137): genera uno slug unico (`generateSlug`, incrementale `nome`, `nome-2`, `nome-3`... controllando `businesses.slug` a ogni tentativo, fallback random dopo 50 tentativi) e fa **insert** in `businesses` con `status:'trial'`, `trial_ends_at: now+30 giorni` (14→30 dal `c6ba13e`, unico punto che scrive `trial_ends_at`), `owner_email: user.email`, l'`affiliate_code` normalizzato (lowercase, trim, o `null`).
6. Se l'insert fallisce con `AFFILIATE_CODE_INVALID` (sollevato dal trigger `validate_affiliate_code`, vedi Fase 2) o `23503` → messaggio dedicato "Codice affiliato non valido"; `23505` (business duplicato per lo stesso user, violazione dello `UNIQUE(user_id)`) → messaggio dedicato.
7. Pulisce **incondizionatamente** `localStorage.pium_ref` (anche se il codice non era valorizzato, per evitare che si riattacchi a una registrazione successiva sullo stesso device).
8. Upsert in `legal_acceptances` (context `merchant`, `acceptance_type: merchant_terms_dpa_privacy`, con `onConflict` idempotente) — **questo è il punto reale in cui l'accettazione ottenuta al passo 1 viene persistita**, non al momento del click sulla checkbox.
9. Genera la descrizione AI (`generateWithClaude`, vedi sezione 6) e la salva su `businesses.description` — **in modo "best effort"**: se fallisce, logga in console ma non blocca il flusso.
10. Redirect a `/dashboard`.

#### 1b. Affiliato
1. **`/affiliates/auth`** (`AffiliatesAuth.jsx`) — tab "Registrati": nome/email/password + checkbox obbligatoria di accettazione del Contratto di Affiliazione + Privacy (righe 32,47,172-179).
2. `supabase.auth.signUp(...)` (righe 66-73, `emailRedirectTo: '<origin>/affiliates'`).
3. Se il signup ritorna uno `user.id` (righe 81-94): genera un codice referral (`generateCode`, prime 3 lettere del nome normalizzate + 4 caratteri random, rigenerato se terminasse per `-on` — riservato al canale scontato) e fa **insert diretto** in `affiliates` con `status:'pending'`.
4. ⚠️ **Nessuna riga viene scritta in `legal_acceptances`** per questo flusso (a differenza del merchant) — l'accettazione del contratto affiliato resta solo un flag client-side non persistito lato server (vedi discrepanza già segnalata in Fase 2, sezione `legal_acceptances`).
5. Schermata "Registrazione ricevuta" → l'utente deve confermare l'email prima del primo accesso.
6. **`/affiliates`** (`Affiliates.jsx`) mostra poi lo stato: se non esiste un profilo `affiliates` per l'utente loggato → invito a registrarsi; se `status='pending'` → schermata di attesa; se `'approved'` → dashboard con link/statistiche. **Nota di design esplicita nel codice** (riga 43-46): questa pagina non crea mai un record affiliato solo perché un utente autenticato la visita — solo `AffiliatesAuth.jsx` può farlo, per evitare "affiliati fantasma".
7. Il passaggio da `pending` ad `approved`/`rejected` avviene **solo** tramite l'Edge Function `approve-affiliate`, invocata dall'admin da `Admin.jsx:361` (`supabase.functions.invoke`) — mai da un update diretto lato client (la vecchia policy RLS che lo permetteva è stata rimossa, Fase 2).

---

### 2. Flusso di pagamento completo (checkout → webhook → attivazione → commissione)

1. **Trigger**: l'utente clicca "Attiva ora" nel banner trial di `Dashboard.jsx` (righe 393-421, mostrato se `status==='trial'`) o nella sezione Abbonamento di `Settings.jsx` → entrambi usano l'hook condiviso `useStripeCheckout()`.
2. **`handleCheckout()`** (`lib/useStripeCheckout.js`): recupera l'`access_token` di sessione e fa `fetch POST /functions/v1/stripe-checkout` con quel Bearer token.
3. **Edge Function `stripe-checkout`** (dettaglio completo in Fase 3): crea/riusa un Customer Stripe; se trova già una subscription `active`/`trialing` su quel Customer, **non apre un secondo checkout** — riallinea lo status locale e risponde `{already_active:true}` (il frontend fa `window.location.reload()`); altrimenti crea una Checkout Session, applicando il coupon `STRIPE_COUPON_ON` solo se `businesses.affiliate_code` termina in `-on`, e risponde `{url}`.
4. Il frontend fa un **redirect pieno** (`window.location.href = data.url`) alla pagina Stripe Checkout hosted (nessuna integrazione embedded).
5. L'utente paga su Stripe. Stripe reindirizza a `success_url = <APP_URL>/dashboard?stripe_success=true` (o `cancel_url = <APP_URL>/dashboard` se annulla).
6. **In parallelo**, Stripe invia in webhook l'evento `checkout.session.completed` a `stripe-webhook`, che: trova il business per `stripe_customer_id`, imposta `status='active'`, `plan='active'`, salva `stripe_subscription_id`, e se la subscription ha un `trial_end` lo salva in `trial_ends_at`.
7. **Lato frontend**, `Dashboard.jsx` rileva `?stripe_success=true` nell'URL (riga 128-133), ripulisce l'URL e avvia un **polling** (righe 136-169): rilegge `businesses` ogni 2 secondi, fino a 5 tentativi (10s totali) o finché non vede `status==='active'` — necessario perché l'attivazione arriva in modo asincrono dal webhook, non dal redirect stesso. Se trova `active`, mostra il banner verde "Pagamento completato!" per 6 secondi.
8. **Eventi successivi nel ciclo di vita dell'abbonamento**, tutti gestiti da `stripe-webhook`:
   - `customer.subscription.updated` → rimappa lo stato Stripe sullo stato PIUM (`trialing→trial`, `active→active`, `past_due→suspended`, `canceled→expired`).
   - `customer.subscription.deleted` → `status='expired'`, `plan='free'`.
   - `invoice.paid` → (a) riallinea lo status se necessario, (b) **se e solo se** il business ha un `affiliate_code`, calcola e registra la commissione (dettaglio in sezione 3).
9. Se il business non ha un `affiliate_code`, il flusso di pagamento si esaurisce al passo 8 senza toccare `affiliate_commissions`.

---

### 3. Sistema affiliati e commissioni

#### Canali "-on" / pieno
- Ogni affiliato ha **un solo codice base** (`affiliates.code`), ma **due link condivisibili**, costruiti lato frontend in `Affiliates.jsx:194-196`: `.../auth?ref=<code>` (canale pieno, cliente paga 49,99€/mese) e `.../auth?ref=<code>-on` (canale scontato, cliente paga 29,99€/mese — prezzi aggiornati da `c6ba13e`, erano 99,99€/69,99€). Il suffisso `-on` **non esiste come record separato** — è una convenzione di stringa sul valore salvato in `businesses.affiliate_code`.
- Il codice arriva al business tramite `?ref=` in URL → `localStorage.pium_ref` → precompilato (ma modificabile) nel form di onboarding → salvato **intatto, suffisso compreso**, su `businesses.affiliate_code` all'insert.
- Il trigger `validate_affiliate_code` (Fase 2) valida il codice **base** (strippando `-on`) contro `affiliates.code`, ma salva il valore originale intatto — così sia `stripe-checkout` (per applicare lo sconto) sia `stripe-webhook` (per calcolare la commissione) possono leggere il suffisso.

#### Calcolo `commissionFor()` (in `stripe-webhook/index.ts`)
**Modello a percentuale** (introdotto da `c6ba13e`, sostituisce il precedente importo fisso per canale — 29,99€ pieno / 19,99€ "-on"):
1. Ad ogni evento `invoice.paid`, se il business ha un `affiliate_code`: determina `hadOnSuffix = affiliate_code.toLowerCase().endsWith('-on')` (usato solo per il log/badge canale, non più per il calcolo dell'importo) e il `baseCode` (senza suffisso).
2. Cerca l'affiliato per `code = baseCode` **e** `status = 'approved'` — se non trovato o non approvato, **nessuna commissione** (skip silenzioso, loggato).
3. Se `invoice.amount_paid` è mancante o ≤0, **skip esplicito** (nessuna riga a 0 registrata) — guardia aggiunta da `c6ba13e` proprio perché il calcolo ora dipende da questo valore.
4. Conta quante commissioni esistono già per quel `business_id` in `affiliate_commissions` (`count`) → `monthNumber = count + 1`.
5. `commissionFor(amountPaidCents, monthNumber)`: **30%** dell'importo realmente fatturato (`invoice.amount_paid`) se `monthNumber ≤ 12`, **15%** se `monthNumber > 12` (tariffa ridotta "a vita", stessa soglia di prima) — `COMMISSION_RATE_FULL = 0.30`, `COMMISSION_RATE_LATE = 0.15`, `COMMISSION_TIER_MONTHS = 12`.
6. Insert in `affiliate_commissions` (`status:'pending'`, `stripe_invoice_id` come chiave di deduplica — un retry dello stesso webhook Stripe con lo stesso `invoice.paid` viene ignorato via UNIQUE constraint, errore `23505` catturato esplicitamente).
7. Il pagamento effettivo delle commissioni all'affiliato (`status: pending → paid`) è **manuale**, gestito da `Admin.jsx` (non trovato nessun automatismo — l'admin marca le righe come pagate dal pannello, aggiornando `status`/`paid_at`).

**Non deployato**: la modifica resta solo nel repo finché non si aggiornano manualmente `STRIPE_PRICE_ID`/`STRIPE_COUPON_ON` su Stripe Dashboard (per riflettere i nuovi prezzi 49,99€/29,99€) e si verifica con un pagamento di test.

#### Dashboard affiliato (`Affiliates.jsx`)
- Al login, carica il proprio profilo `affiliates` (mai creato automaticamente, solo letto) e, se esiste, in parallelo: (a) i business con `affiliate_code IN (code, code-on)` — **selezionando esplicitamente solo colonne commerciali** (id, name, city, status, trial_ends_at, stripe_subscription_id, is_free, affiliate_code, created_at), mai dati operativi dei clienti finali — e (b) le proprie righe in `affiliate_commissions`.
- Calcola lato client: `earned` (somma di tutte le commissioni `pending`+`paid`), `pending` (solo `pending`), e per ogni cliente lo stato "reale" via `getBusinessRealStatus()` (sezione 5) per mostrare un badge (Pagante/In prova/Scaduto/Perso/Sospeso/Omaggio).
- Il canale di ciascun cliente portato è dedotto **di nuovo dal suffisso** di `businesses.affiliate_code` (badge "Pieno · 49,99€" vs "Scontato · 29,99€", prezzi aggiornati da `c6ba13e`), non da una colonna dedicata.
- **Badge di stato arricchito** (`RealStatusBadge`, `c6ba13e`): se lo stato reale è `'trial'`, mostra "In prova (giorno X/Y)" con `Y` calcolato da `trial_ends_at - created_at` (funzione `trialProgress()`, non hardcoded a 30 — si adatta se un admin allunga/accorcia `trial_ends_at` per un singolo business); se `'active'`, mostra "Convertito"; per tutti gli altri stati resta l'etichetta di `REAL_STATUS_META` invariata. Puro calcolo di visualizzazione sui dati già caricati, nessuna nuova query.
- Copy "Tu guadagni" aggiornato da importo fisso a percentuale (es. "Tu guadagni il 30% (circa 15€/mese)") per restare coerente col nuovo calcolo commissioni.

#### Approvazione affiliato
Vedi Fase 3 (`approve-affiliate`): solo un admin (claim JWT `app_metadata.role='admin'`) può cambiare `affiliates.status`; alla prima approvazione (`pending→approved`) invia un'email via Resend e marca `approved_email_sent_at` per non rimandarla in caso di doppio click/retry.

---

### 4. Prenotazioni pubbliche (booking → conferma owner → agenda)

1. **Sul mini-sito pubblico** (`PublicSite.jsx` → `BookingSection.jsx`): il visitatore seleziona uno o più servizi (solo quelli con `duration_min` valorizzato e `visible_on_public_site=true`/`is_available=true` — filtrati a monte dalla query di `PublicSite.jsx`), una data, e il componente chiama **`supabase.rpc('get_taken_slots', {p_business_id, p_date})`** (pubblica, nessuna autenticazione) per sapere cosa è già occupato.
2. Genera gli slot liberi **lato client** (`generateSlots()`, righe 46-68) leggendo `business.opening_hours` (formato nuovo mattina/pomeriggio con `active`, o legacy `open/close`) e sottraendo gli slot già occupati fino a `booking_capacity` sovrapposizioni simultanee consentite.
3. L'utente compila nome/email/telefono (validati anche client-side: regex email, telefono 6-20 caratteri) e arriva al riepilogo, dove — se configurato — deve risolvere il widget **Cloudflare Turnstile**.
4. **Submit**: `fetch POST` diretto (non tramite client Supabase) verso l'Edge Function `create-booking`, con l'anon key come Bearer/apikey (endpoint pubblico, nessuna sessione utente) e il token Turnstile.
5. **`create-booking`** verifica Turnstile server-side, poi chiama `supabase.rpc('create_booking', {...})` con **service role** (l'unico chiamante autorizzato, dopo la revoca dei grant `anon`/`authenticated` sulla RPC — Fase 2/3).
6. **`create_booking`** (RPC, Fase 2) rivalida **tutto** lato server (data non passata, formato email/telefono, disponibilità servizi, orari di apertura, anti-doppione 1-pending-per-email, backstop anti-flood, capacità slot con advisory lock anti race-condition) e inserisce la riga in `bookings` con `status='pending'`.
7. L'insert fa scattare il **trigger `on_new_booking`** → chiama in modo asincrono l'Edge Function `notify-new-booking`, che invia una **notifica push** al/ai dispositivo/i del titolare registrati in `push_subscriptions` (payload: "Nuova prenotazione", deep-link a `/dashboard?s=agenda`).
8. **In parallelo**, se il titolare ha la dashboard aperta, il canale **Realtime** `pending-bookings-<businessId>` (`Dashboard.jsx:208-234`) riceve l'evento `INSERT` su `bookings` e aggiorna subito il badge/contatore nella sidebar (`pendingCount`), oltre a mostrare una notifica browser locale (`notifyNewBooking`, `lib/notifications.js`).
9. **Nell'Agenda** (`Agenda.jsx`), il pannello "Prenotazioni in attesa" mostra ogni booking pending con un pulsante **"Invia WhatsApp"**: apre un link `wa.me` precompilato (`buildWaLink`) con un messaggio che chiede al cliente di rispondere "Confermo" — **azione manuale del titolare**, PIUM non invia WhatsApp in autonomia né riceve/legge le risposte del cliente.
10. Solo dopo aver cliccato "Invia WhatsApp" (stato tracciato in `localStorage`, chiave `wa_sent_<id>`, **non nel DB**) compare il pulsante **"Conferma appuntamento"**: il titolare lo preme solo dopo aver ricevuto a mano la conferma dal cliente via WhatsApp (fuori app). Questo apre un dialog di conferma che chiama **`supabase.rpc('owner_confirm_booking', {p_booking_id})`**.
11. **`owner_confirm_booking`** (RPC, Fase 2): verifica che il chiamante sia il proprietario del business collegato al booking, passa `bookings.status='confirmed'`, crea la riga `appointments` corrispondente (sommando durata/prezzo se multi-servizio) e, se multi-servizio, popola `appointment_services` con lo snapshot di prezzo/durata di ciascun servizio.
12. In alternativa, il titolare può **"Rifiuta"** la prenotazione (`rejectPendingBooking`, `Agenda.jsx:570-577`): semplice `update bookings set status='cancelled'`, nessuna RPC, nessun appuntamento creato.
13. Da questo punto la prenotazione confermata vive come una normale riga `appointments`, visibile/gestibile in Agenda come un appuntamento creato manualmente.

---

### 5. Blocco abbonamento / `is_free` / stati (`getBusinessRealStatus`)

Tutta la logica vive in **`src/lib/businessGate.js`**, unica fonte di verità, usata sia in `Dashboard.jsx`/`Settings.jsx` (per bloccare l'accesso) sia in `Affiliates.jsx`/`Admin.jsx` (per mostrare badge di stato).

- **`isTrialExpiredUnpaid(business)`**: `true` solo se `status==='trial'` **e** `trial_ends_at` è passato **e** non esiste un `stripe_subscription_id` — cioè un trial scaduto che non è mai diventato un cliente Stripe (nemmeno in fase `trialing`). Necessario perché `businesses.status` avanza **solo** tramite webhook Stripe: un utente che non paga mai resterebbe per sempre `status='trial'` senza questo calcolo aggiuntivo lato applicazione.
- **`getBusinessRealStatus(business)`** — stato "vero" mostrato ovunque (badge dashboard affiliato, pannello admin):
  1. Se `is_free===true` → **`'gift'`** (account omaggio: sempre, a prescindere da qualunque altro campo — non passa mai da Stripe).
  2. Altrimenti se `isTrialExpiredUnpaid()` → **`'trial_expired'`**.
  3. Altrimenti lo `status` grezzo del DB (`trial`/`active`/`expired`/`suspended`).
  - Nota esplicita nel codice: `'gift'` è deliberatamente diverso da `'free'` (valore già usato da `businesses.plan` con significato opposto: ex-cliente pagante degradato dopo disdetta) per non sovrapporre due concetti opposti sotto la stessa etichetta.
- **`isBusinessBlocked(business)`** — regola unica di blocco operativo:
  1. Se `is_free===true` → **mai bloccato**, qualunque altro campo dica.
  2. Altrimenti bloccato se `status` è `'suspended'` (bloccato a mano dall'admin) o `'expired'` (subscription Stripe cancellata) o se `isTrialExpiredUnpaid()`.
  3. `'trial'` (in corso) e `'active'` passano sempre.
- **Applicazione pratica**: `Dashboard.jsx:72,250-258` e (per lo stesso pattern) `Settings.jsx` chiamano `isBusinessBlocked(business)` **prima** di renderizzare qualunque sezione operativa; se bloccato, sostituiscono l'intera pagina con `<SubscriptionGate>` (schermata a tutto schermo con le uniche due azioni possibili: pagare o uscire — mai un accesso parziale).
- `Dashboard.jsx` calcola **anche** un `trialExpired` locale leggermente diverso (righe 64-66, senza guardare `stripe_subscription_id`): usato solo per decidere quale **banner non bloccante** mostrare (trial in corso vs trial scaduto, entrambi con pulsante "Attiva ora") nel breve intervallo in cui una subscription esiste già su Stripe ma il webhook non ha ancora aggiornato `status` — in quella finestra `isBlocked` resta `false` (grazie al controllo su `stripe_subscription_id` in `isTrialExpiredUnpaid`) e l'utente vede il banner "attiva ora" invece del gate a tutta pagina.
- Sia il banner sia il gate nascondono l'invito a pagare se `business.is_free===true` (controlli `&& !business?.is_free` sparsi in `Dashboard.jsx:384,403`).
- **Admin** (`Admin.jsx`) può forzare `is_free` con un toggle diretto (`update businesses set is_free=...`, righe 307-312) — l'unico modo per creare/rimuovere un account omaggio, nessun flusso self-service.

---

### 6. Generazione AI — dove, come, limiti

**Unico varco**: `src/lib/claude.js` (`generateWithClaude(prompt)`) → Edge Function `claude-proxy` → Anthropic API. Tre punti di chiamata nel frontend:

| Chiamante | Quando | Prompt (sintesi) |
|---|---|---|
| `Onboarding.jsx` (`buildDescriptionPrompt`, riga 488-502) | automatico, subito dopo la creazione del business | descrizione professionale ≤3 frasi da nome/categoria/città/indirizzo/note del titolare |
| `Social.jsx` (`buildPrompt`, riga 46-65) | manuale, l'utente clicca "Genera bozza" scegliendo piattaforma/argomento/tono | post per Instagram/Facebook, risposta richiesta in **JSON** (`{content, hashtags}`, parsato da `parseAIResponse` con fallback se Claude non rispetta il formato) |
| `Recensioni.jsx` (`buildReplyPrompt`, riga 43-58) | manuale, l'utente clicca "Genera risposta" su una recensione | risposta 2-4 frasi, tono variabile in base al rating (`≥4`→caloroso, `=3`→costruttivo, `≤2`→empatico/scusante) |

**Flusso** (identico per tutti e tre): il chiamante costruisce il prompt lato client (mai lato server) → `generateWithClaude` recupera l'`access_token` di sessione → `fetch POST /functions/v1/claude-proxy` con quel Bearer → la Edge Function autentica l'utente, applica il rate limit, chiama Anthropic, aggiorna i contatori, ritorna `{text}`.

**Limiti** (applicati **solo** lato Edge Function, mai lato client — quindi non aggirabili dal browser):
- **350.000 token/mese** per business (`businesses.ai_tokens_month`, confrontato con `TOKEN_LIMIT` hardcoded in `claude-proxy/index.ts`), reset automatico al cambio mese solare (confronto `YYYY-MM` tra oggi e `ai_reset_date`).
- Bypassabile per singolo business con `businesses.ai_unlimited=true` (flag, verosimilmente impostabile solo da admin/SQL diretto — nessun toggle trovato in `Admin.jsx` per questo campo in questa passata, a differenza di `is_free` che ha un toggle dedicato).
- Prompt massimo **20.000 caratteri** (validazione in `claude-proxy`, indipendente dal limite mensile).
- Modello fisso **`claude-sonnet-4-6`**, `max_tokens: 1000` per risposta, timeout **25 secondi**.
- Superato il limite mensile: risposta `429 {error:'AI_LIMIT_REACHED'}`, il frontend mostra il messaggio "Hai raggiunto il limite mensile di utilizzo AI. Si rinnova il 1° del mese." (gestione errore per-chiamante, non centralizzata).
- Contatori aggiornati in modo **fire-and-forget** dopo la risposta ad Anthropic (non bloccano la risposta all'utente): `ai_tokens_month` (cumulativo nel mese), `ai_calls_month_display` (contatore "umano" mostrato all'utente), `ai_calls_month`/`ai_calls_total` (deprecati/interni).

---

*Fine Fase 4.*

---

## FASE 5 — Transizione internazionale

Sintesi valutativa basata su tutto quanto mappato nelle Fasi 1-4, per capire cosa serve a chi volesse portare PIUM (a) su un'infrastruttura diversa da Supabase/Stripe/Anthropic/Cloudflare/Resend, e/o (b) fuori dal mercato italiano.

### 1. Logica pura — portabile senza modifiche

Codice che non conosce Supabase/Stripe/Anthropic/Cloudflare e non è legato al mercato italiano più di quanto lo sia un'app qualsiasi che lavora in EUR/orario CET. Sopravvive a un cambio di infrastruttura quasi identico.

- **`src/lib/errors.js`** — mappa messaggi Supabase Auth → italiano; la logica di matching stringa→messaggio è portabile, va solo aggiornata se cambia provider di auth (i messaggi d'errore sorgente cambierebbero).
- **`src/lib/safeUrl.js`** — whitelist protocolli URL, puro.
- **`src/lib/phone.js`** — la *struttura* (normalizzazione, costruzione link `wa.me`) è portabile; il *contenuto* assume il mercato italiano (v. sezione 4) e andrebbe generalizzato per altri paesi.
- **`src/lib/businessGate.js`** — tutta la logica di stato abbonamento (`isTrialExpiredUnpaid`, `getBusinessRealStatus`, `isBusinessBlocked`) è pura logica di business su dati già in memoria, zero dipendenze esterne. Sopravvive intatta a qualunque backend, **a patto che l'oggetto `business` esponga gli stessi campi** (`status`, `trial_ends_at`, `stripe_subscription_id`, `is_free`).
- **RPC `create_booking`, `get_taken_slots`, `owner_confirm_booking`, `validate_affiliate_code`** (Fase 2) — logica di dominio (validazione orari, capacità, anti-doppione, commissioni) scritta in PL/pgSQL: portabile **concettualmente** a qualunque database relazionale con transazioni e lock, ma va **riscritta linguisticamente** (sintassi Postgres-specifica: `jsonb`, `pg_advisory_xact_lock`, `RAISE EXCEPTION`) se si cambia RDBMS.
- **`commissionFor()`** (`stripe-webhook/index.ts`) — funzione pura (tier mesi + importo fatturato → percentuale applicata, modello a percentuale da `c6ba13e`), indipendente da Stripe: la logica di calcolo si porta 1:1, cambia solo *da dove* viene invocata (oggi un evento `invoice.paid`).
- **`generateSlots()`/`generateSlotsForRange()`** (`BookingSection.jsx`) — calcolo puro degli slot disponibili da orari+durata+occupazione, nessuna dipendenza esterna.
- **Componentistica React pura** (rendering, validazione form client-side, wizard multi-step di `Onboarding.jsx`/`Auth.jsx`, macchina a stati di `BookingSection.jsx`) — portabile a qualunque backend, cambiano solo le chiamate `.from()`/`.rpc()`/`fetch()` al loro interno.
- **`vite.config.js`, `eslint.config.js`, struttura cartelle `src/`** — tooling e organizzazione del codice, indipendenti da qualunque servizio.

### 2. Agganciato all'infrastruttura — da sostituire

Per ciascuno: cosa c'è oggi (rimando alla Fase 3 per il dettaglio), e il **peso di sostituzione** (stima qualitativa basata su quanti file toccano il servizio e quanto la sua API è "incorporata" nella logica applicativa, non un'ipotesi di ore).

| Servizio | Punti d'aggancio (da Fase 3) | Peso di sostituzione | Perché |
|---|---|---|---|
| **Supabase Database (Postgres+RLS)** | ~25 file frontend con `.from()`, tutte le RPC, tutti i trigger | 🔴 **Altissimo** | È l'accoppiamento più profondo e diffuso: non c'è un layer di accesso dati centralizzato (nessun repository/DAO) — ogni componente parla direttamente al DB. La sicurezza stessa (RLS) è nel DB, non in un livello applicativo: cambiare DB significa reimplementare da zero sia le query sia tutte le regole di autorizzazione, oltre a riscrivere le 4 RPC in un altro linguaggio/paradigma |
| **Supabase Auth** | ~20 file (`signIn/signUp/signOut/getSession/getUser/updateUser/resetPasswordForEmail`), + il concetto di ruolo admin come claim JWT `app_metadata.role` | 🔴 **Alto** | Login/registrazione/reset password toccano quasi ogni pagina "auth-aware"; il claim custom per il ruolo admin è un pattern Supabase-specifico (va rifatto con claim/custom token del nuovo provider) |
| **Supabase Edge Functions (Deno)** | tutte e 6 le function | 🟡 **Medio** | La *logica* di ciascuna è per lo più portabile (è codice TypeScript/fetch abbastanza standard); va riscritto lo strato di deploy/runtime (Deno → altro) e il client `createClient(...)` verso il nuovo DB/auth. `stripe-webhook` in particolare non usa l'SDK Stripe (verifica firma con Web Crypto nativo) — **più portabile del previsto** |
| **Supabase Storage** | 1 file (`EditorSito.jsx`), 1 bucket | 🟢 **Basso** | Solo upload+getPublicUrl in 3 punti dello stesso file; sostituibile con qualunque object storage (S3, R2, GCS) cambiando poche righe |
| **Supabase Realtime** | 1 punto (`Dashboard.jsx`, badge prenotazioni pending) | 🟢 **Basso** | Funzionalità isolata e non critica al funzionamento core (senza, il badge si aggiorna solo al refresh/focus tab); sostituibile con polling o un altro sistema pub/sub senza toccare il resto |
| **Stripe** | `stripe-checkout`, `stripe-webhook`, `useStripeCheckout.js` | 🟡 **Medio-alto** | La logica di business (anti-doppio-addebito, riallineamento stato, calcolo commissioni) è scritta *attorno* alle chiamate Stripe ma non è indissolubile da esse — va rimappata sul modello a eventi/webhook del nuovo PSP (quasi tutti i payment processor moderni ne hanno uno simile), ma ogni branch di `stripe-webhook` (4 tipi di evento) va riscritto sul set di eventi del nuovo provider |
| **Anthropic (Claude)** | 1 Edge Function (`claude-proxy`), 3 punti di chiamata frontend (via un unico wrapper `lib/claude.js`) | 🟢 **Basso** | Ottimo isolamento: un solo endpoint HTTP da ripuntare (`api.anthropic.com` → altro provider LLM), i prompt sono testo semplice, il rate-limiting è generico (non specifico di Anthropic) |
| **Cloudflare (Worker + Turnstile)** | 1 Worker (proxy sottodomini), widget+verifica Turnstile in 2 file | 🟢 **Basso-medio** | Il Worker di proxy sottodominio è sostituibile con qualunque reverse proxy/CDN che sappia riscrivere richieste per hostname; Turnstile è un semplice anti-bot, intercambiabile con reCAPTCHA/hCaptcha cambiando 2 file (widget + verifica server) — **ma la funzione resta operativa anche senza**, essendo opzionale by design |
| **Resend** | 1 Edge Function (`approve-affiliate`) | 🟢 **Basso** | Singolo endpoint HTTP per un solo tipo di email transazionale; le email di Auth (conferma/reset) sono già gestite da Supabase Auth stesso, quindi cambiando provider di auth cambia automaticamente anche quel canale — non serve toccare altro codice applicativo per quello |
| **Web Push (VAPID)** | `pushSubscription.js` + `notify-new-booking` | 🟢 **Basso** | Standard web (RFC 8030), non un vendor — resta identico a prescindere dal backend, cambia solo dove vivono le chiavi VAPID e chi invoca l'invio |

**Nota di sintesi**: i due agganci davvero strutturali sono **Database+RLS** e **Auth** — non a caso sono anche quelli con più superficie di codice coinvolta. Tutto il resto (Storage, Realtime, Stripe, Anthropic, Cloudflare, Resend, Push) è isolato in singoli file o singole Edge Function e si sostituisce con un impatto localizzato.

### 3. Testi hardcoded (da estrarre per i18n)

**Non esiste alcuna libreria di i18n** in `package.json` (nessun `react-i18next`, `next-intl`, `formatjs`, ecc.) e **nessun file di traduzione/dizionario** in `src/`. Ogni stringa visibile all'utente è scritta **in italiano, direttamente nel JSX**, mischiata a markup e logica — non c'è alcuna separazione testo/codice da cui partire.

**Stima per file** (conteggio automatico approssimativo di stringhe JSX in italiano — un indicatore di grandezza, non un numero esatto):

| File | Ordine di grandezza stringhe | Note |
|---|---|---|
| `src/pages/Admin.jsx` | ~70+ | pannello admin, il più denso di testo (etichette, colonne tabella, messaggi di stato) |
| `src/components/dashboard/Agenda.jsx` | ~40+ | + nomi festività italiane hardcoded (v. sezione 4) |
| `src/components/dashboard/EditorSito.jsx` | ~30 | editor sito pubblico |
| `src/pages/Settings.jsx` | ~20 | |
| `src/pages/Landing.jsx` | ~20 | copy marketing, il testo più "curato" e meno banale da tradurre 1:1 |
| `src/pages/PublicSite.jsx`, `Onboarding.jsx`, `Affiliates.jsx`, `Clienti.jsx` | ~15-18 ciascuno | |
| resto di `src/pages/` e `src/components/` | 2-15 ciascuno | quasi ogni file ne ha almeno qualcuna |
| `src/pages/legal/*.jsx` | 0 in JSX, ma… | il testo vero è nei 5 file **`legal-docs/*.md`** (Termini, Privacy, Cookie, DPA, Contratto Affiliazione) — Markdown lungo in italiano, caricato con `?raw`; sono i documenti più lunghi e legalmente sensibili da tradurre |
| Edge Functions (`approve-affiliate/index.ts`) | 1 blocco | il template HTML dell'email di approvazione affiliato è embedded come stringa nel codice server |
| `supabase/migrations/20260823_faq_table_and_seed.sql` | ~27 righe | contenuto FAQ (domanda/risposta) inserito **come dati**, non come codice — comunque testo italiano da tradurre se si vuole una versione multilingua, ma già separato dal codice applicativo |
| **Notifiche push/browser** (`lib/notifications.js`, `notify-new-booking/index.ts`) | poche stringhe | titoli/corpo notifica ("Nuova prenotazione", promemoria appuntamento) |
| **Messaggi WhatsApp precompilati** (`Agenda.jsx`, `PromemoriaClienti.jsx`) | alcuni template | frasi con placeholder (nome cliente, data, servizio) costruite via template string — vanno estratte come i18n **con interpolazione**, non semplici etichette statiche |

**Totale indicativo**: qualche **centinaio di stringhe distinte** sparse in ~30 file `.jsx`/`.ts`, più 5 documenti legali lunghi e ~30 righe di FAQ. Un lavoro di i18n richiederebbe: (a) introdurre una libreria (`react-i18next` o equivalente), (b) estrarre sistematicamente ogni stringa in file di traduzione per chiave, (c) gestire a parte i contenuti "a struttura libera" (Markdown legale, FAQ da DB, prompt AI) che non sono semplici etichette UI.

### 4. Prezzi e configurazioni hardcoded

Nessun prezzo/percentuale vive in una singola "tabella di configurazione": sono sparsi tra **testo di presentazione** (frontend, solo visualizzazione) e **valori realmente applicati** (Stripe Dashboard + Edge Function). Elenco completo:

| Valore | Dove (visualizzazione, non applicato) | Dove (applicato realmente) |
|---|---|---|
| **49,99 €/mese** (prezzo pieno, era 99,99€ prima di `c6ba13e`) | `Landing.jsx:142,328` (copy marketing), `PublicSite.jsx:155` (meta description), `Affiliates.jsx:238,308` (etichette canale), `Dashboard.jsx:412` (banner trial) | **`STRIPE_PRICE_ID`** (secret Edge Function `stripe-checkout`) — il prezzo vero è configurato lato Stripe Dashboard, non nel codice; **non deployato** finché il price ID su Stripe non viene aggiornato a mano |
| **29,99 €/mese** (prezzo scontato "-on", era 69,99€ prima di `c6ba13e`) | `Affiliates.jsx:249,308` | **coupon `STRIPE_COUPON_ON`** (secret) configurato lato Stripe Dashboard — stesso "non deployato" del prezzo pieno |
| **30%** dell'importo fatturato (commissione, mesi 1-12; era un importo fisso — 29,99€ canale pieno/19,99€ "-on" — prima di `c6ba13e`) | `Affiliates.jsx:238,249` ("Tu guadagni il 30%...") | `COMMISSION_RATE_FULL = 0.30` — **hardcoded in `stripe-webhook/index.ts`**, applicata su `invoice.amount_paid` |
| **15%** dell'importo fatturato (commissione ridotta, dal mese 13 a vita; era 15,00€ fisso prima di `c6ba13e`) | `Affiliates.jsx:257` | `COMMISSION_RATE_LATE = 0.15` — **hardcoded in `stripe-webhook/index.ts`**, `COMMISSION_TIER_MONTHS = 12` (soglia, invariata) |
| **`businesses.plan_price`** (default **99**, colonna DB, editabile per singolo business da `Admin.jsx:277-281,648,706`) | — | **non collegato a Stripe**: sembra un valore puramente informativo/di reportistica interna (usato per calcolare `revenue` lato admin, `Admin.jsx:508`), **non** il prezzo realmente addebitato (quello è deciso da `STRIPE_PRICE_ID`) — rischio di disallineamento se un admin lo modifica pensando di cambiare il prezzo reale; **non aggiornato** al nuovo prezzo 49,99€ da `c6ba13e` (fuori scope di quel commit, resta un potenziale disallineamento aggiuntivo) |
| **30 giorni** di trial (era 14 giorni prima di `c6ba13e`) | `Onboarding.jsx:169` (`Date.now() + 30*24*60*60*1000`, hardcoded al momento dell'insert) | stesso valore ripetuto in copy marketing (`Landing.jsx:142`, `PublicSite.jsx:155`) — **tre punti indipendenti**, nessuna costante condivisa |
| **1-50** (range `booking_capacity`) | — | CHECK constraint nel DB (`20260610_booking_capacity.sql`) |
| **350.000 token/mese** (limite AI) | — | `TOKEN_LIMIT` hardcoded in `claude-proxy/index.ts:8` |
| **22%** (aliquota IVA di default per il calcolo del netto in Agenda) | `Agenda.jsx:121` (`useState(22)`) | solo client-side, **non persistita** — si resetta a ogni refresh/sessione, editabile dall'utente ma mai salvata su `businesses` |
| **1.000 max_tokens** risposta Claude, **25s** timeout, **20.000** caratteri prompt max | — | tutti hardcoded in `claude-proxy/index.ts` |
| **200** booking pending totali, **20** booking in 10 minuti (backstop anti-flood) | — | hardcoded dentro la RPC `create_booking` (`20260806_create_booking_hardening.sql`) |

**Nessuna di queste cifre è centralizzata**: cambiare il prezzo del piano richiede un intervento su Stripe Dashboard **più** una ricerca manuale di tutte le occorrenze testuali sparse in almeno 4 file frontend per non lasciare il marketing disallineato dal prezzo reale — è esattamente quello che ha richiesto il passaggio a 49,99€/29,99€ (`c6ba13e`), oltre a `businesses.plan_price` che resta non allineato (vedi tabella sopra). Le commissioni affiliato sono l'unico blocco con un minimo di struttura (tre costanti raggruppate in cima a `stripe-webhook/index.ts`, con un commento esplicito "UNICO punto di configurazione") ma restano comunque codice, non dati.

### 5. Valutazione: cosa si riusa identico, cosa va riscritto

**Si riusa praticamente identico** (portare la stessa logica, cambiando solo l'infrastruttura sottostante):
- Tutta la UI React (componenti, form, wizard, macchina a stati di prenotazione) — il markup e l'interazione utente non conoscono Supabase.
- La logica di dominio pura elencata in sezione 1 (`businessGate.js`, `commissionFor()`, generazione slot, normalizzazione telefono).
- Il modello dati concettuale (le 20 tabelle e le loro relazioni, Fase 2) — è un buon schema relazionale indipendente dal vendor; va solo re-implementato come DDL nel nuovo RDBMS.
- Il flusso di business dei 6 flussi mappati in Fase 4 (onboarding, pagamento, affiliati, booking, gate abbonamento, AI) — sono processi applicativi, non legati a un fornitore specifico.

**Va riscritto** (accoppiamento diretto al vendor):
- **Ogni chiamata `.from()`/`.rpc()`** sparsa nei ~25 file frontend — non esiste un livello di accesso dati da sostituire in un solo posto; serve introdurlo (repository/API layer) se si vuole disaccoppiare per il futuro, oppure riscrivere punto per punto.
- **Le regole RLS** — vanno reincarnate come logica applicativa esplicita (middleware/policy layer) se il nuovo DB non supporta la sicurezza a livello di riga, con il rischio di introdurre buchi di sicurezza se la migrazione non è sistematica (oggi la sicurezza "vive" nel DB, spesso senza un doppio controllo lato applicazione).
- **Le 4 RPC PL/pgSQL** — da riscrivere in un linguaggio applicativo o nel dialetto del nuovo DB, prestando attenzione a rimappare le tre proprietà di sicurezza che oggi garantiscono (advisory lock anti-race, validazione server-side indipendente dal client, revoca dell'accesso diretto pubblico).
- **Le 6 Edge Function** — logica riusabile (sezione 2), ma runtime/deploy da rifare.
- **Auth** — sia il meccanismo (signIn/signUp/sessioni) sia il pattern del ruolo admin via claim custom.
- **Stripe** — mappatura eventi/webhook specifica del nuovo PSP.

**Va ripensato, non solo riscritto** (per una vera versione internazionale, oltre al cambio infrastruttura):
- **i18n**: introdurre da zero una libreria e un processo di estrazione stringhe (sezione 3) — oggi zero preparazione.
- **Localizzazione business logic**: `phone.js` (assume prefisso IT implicito), le festività italiane hardcoded in `Agenda.jsx` (Capodanno/Epifania/Liberazione/Ferragosto — un calendario festività per country sarebbe da esternalizzare e parametrizzare), l'aliquota IVA di default al 22% (andrebbe resa configurabile per paese, non hardcoded come default italiano), tutti i `toLocaleString('it-IT')`/`toLocaleDateString('it-IT')` sparsi (27 occorrenze in 13 file) da agganciare a una lingua/locale dinamica invece che fissa.
- **Prezzi/valuta**: oggi tutto in EUR con importi fissi ripetuti in testo libero (sezione 4) — una vera versione multi-mercato richiederebbe un modello prezzi/valuta esplicito, non stringhe sparse da tenere sincronizzate a mano.
- **Contenuti legali**: i 5 documenti in `legal-docs/` sono scritti per il diritto italiano (riferimenti impliciti a normativa IT/UE) — non è un problema di traduzione ma di **revisione legale per giurisdizione**, va oltre l'ambito tecnico di questo documento.

---

*Fine Fase 5.*
