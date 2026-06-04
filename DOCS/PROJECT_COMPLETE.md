# PIUM — Documentazione Tecnica Completa

## Aggiornamento 2026-06-04

**Stripe — configurazione completata (modalità test)**

Prodotto e pricing:
- Price ID standard: `price_1Te6LuFZloiVBwmvrSJ5yUYi` (€99,99/mese, EUR, ricorrente)
- Coupon founder: `FOUNDER30` (-30% per 12 mesi, durata repeating)

Supabase Secrets aggiunti:
- `STRIPE_PRICE_ID` → Price ID standard
- `STRIPE_COUPON_FOUNDER` → FOUNDER30
- `STRIPE_WEBHOOK_SECRET` → aggiornato con chiave firma webhook attuale

Webhook Stripe aggiornato con 3 eventi:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Edge Functions aggiornate:

**stripe-checkout/index.ts:**
- Usa `STRIPE_PRICE_ID` da env invece di `price_data` hardcoded
- Crea o riusa `stripe_customer_id` nel DB
- Applica `STRIPE_COUPON_FOUNDER` automaticamente se `businesses.affiliate_code` non è null
- Rimosso `trial_period_days: 14` — il trial è gestito dal DB, non da Stripe

**stripe-webhook/index.ts:**
- `checkout.session.completed`: lookup per `stripe_customer_id`, salva `trial_ends_at` da `sub.trial_end`
- `customer.subscription.updated`: mappa status Stripe → `trial`/`active`/`suspended`/`expired` nel DB
- `customer.subscription.deleted`: imposta `status = expired`, `plan = free`

Frontend aggiornato:

**Onboarding.jsx:**
- Al signup scrive `status: 'trial'` e `trial_ends_at = now() + 14 giorni` nel DB

**Dashboard.jsx:**
- Aggiunta variabile `trialExpired` (status trial + data scaduta)
- Banner "Il tuo periodo di prova è terminato" con pulsante "Attiva ora" se trial scaduto
- Banner trial normale soppresso se trial scaduto

Da fare prima del lancio:
- Passare chiavi Stripe da test (`sk_test_`, `pk_test_`) a live
- Ricreare webhook Stripe in modalità live
- Aggiornare `VITE_STRIPE_PUBLIC_KEY` con chiave pubblica live
- Cambiare nome account Stripe da "Sandbox di Alessio Mei" a PIUM

---

## 1. Panoramica

**PIUM** è una piattaforma SaaS B2B per attività locali italiane (parrucchieri, ristoranti, estetiste, ecc.) che combina un sito web pubblico personalizzato con un'area gestionale operativa. Il prodotto permette al titolare di un'attività di:

- Avere una pagina pubblica con URL dedicato (`{slug}.piumapp.com` o `piumapp.com/{slug}`)
- Ricevere prenotazioni online dai clienti, confermarle via WhatsApp
- Gestire un'agenda appuntamenti con collaboratori colorati
- Tenere una rubrica clienti importabile da rubrica telefonica (.vcf)
- Creare bozze di post social e risposte alle recensioni via AI (Claude)
- Gestire promemoria e attività quotidiane

**Modello di business:** Abbonamento mensile unico a 99,99 €/mese, prova gratuita 14 giorni, nessuna commissione sulle prenotazioni. Programma affiliati attivo.

**Dominio principale:** `https://www.piumapp.com`

**Supabase Project:** `onkyhknchhlsmcknpinr.supabase.co`

---

## 2. Stack Tecnico

| Layer | Tecnologia | Versione |
|-------|-----------|---------|
| Frontend framework | React | 19.2.5 |
| Routing | React Router DOM | 7.14.2 |
| Build tool | Vite | 8.0.9 |
| Styling | Tailwind CSS v4 | 4.2.4 (via `@tailwindcss/vite`) |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + Realtime) | SDK 2.104.0 |
| Edge Functions | Deno (Supabase Functions) | — |
| AI | Anthropic Claude API | modello `claude-sonnet-4-6` |
| Pagamenti | Stripe | SDK client `@stripe/stripe-js` 9.5.0, server `stripe` 22.1.1 |
| Push notifications | Web Push API + VAPID | `web-push` npm (in Edge Function) |
| CDN / Proxy | Cloudflare Worker | — |
| Hosting SPA | Vercel | SPA rewrites via `vercel.json` |
| Import contatti | libreria `vcf` | 2.1.2 |
| Compressione immagini | `browser-image-compression` | 2.0.2 |
| PWA | Service Worker + Web App Manifest | — |
| Font | Bricolage Grotesque (Google Fonts) | — |

**Nessun contesto React (`Context API`) né hook custom** sono presenti: tutta la gestione dello stato è locale a ogni componente tramite `useState`/`useEffect`.

---

## 3. Struttura File

```
localhub/
├── index.html                          # Entry point HTML
├── vite.config.js                      # Vite + React + Tailwind
├── vercel.json                         # SPA catch-all rewrite + cache headers
├── cloudflare-worker.js                # Proxy trasparente sottodomini → www
├── .env                                # Variabili d'ambiente (NON committare in produzione)
├── package.json
├── public/
│   ├── favicon.svg
│   ├── icon-192.png / icon-512.png     # PWA icons
│   ├── manifest.json                   # PWA manifest
│   ├── sw.js                           # Service Worker
│   └── icons.svg
├── src/
│   ├── main.jsx                        # Entry React: gestisce PWA manifest, SW, hostname detection
│   ├── App.jsx                         # Router principale, protezione route, NotificationScheduler
│   ├── App.css
│   ├── index.css                       # CSS globale (design token + utility classes)
│   ├── pages/
│   │   ├── Landing.jsx                 # Home pubblica marketing
│   │   ├── Auth.jsx                    # Login / Registrazione / Reset password
│   │   ├── Onboarding.jsx              # Wizard 3 step creazione business
│   │   ├── Dashboard.jsx               # Shell dashboard con sidebar + sezioni
│   │   ├── PublicSite.jsx              # Sito pubblico del business (slug-based)
│   │   ├── Settings.jsx                # Impostazioni account (email, password, notifiche, push)
│   │   ├── Admin.jsx                   # Pannello amministrativo (ruolo admin)
│   │   ├── AdminLogin.jsx              # Login admin dedicato (route /x-admin-login)
│   │   ├── Affiliates.jsx              # Dashboard affiliati
│   │   ├── AffiliatesAuth.jsx          # Auth dedicata per affiliati
│   │   ├── ResetPassword.jsx           # Reset password via link email
│   │   └── legal/
│   │       ├── LegalPage.jsx           # Wrapper layout documenti legali
│   │       ├── Privacy.jsx             # Privacy Policy
│   │       ├── Termini.jsx             # Termini di Servizio
│   │       ├── Cookie.jsx              # Cookie Policy
│   │       ├── Dpa.jsx                 # Data Processing Agreement
│   │       └── ContrattoAffiliazione.jsx
│   ├── components/
│   │   ├── Logo.jsx                    # Logo PIUM riutilizzabile
│   │   ├── PWABanner.jsx               # Banner "Aggiungi alla Home"
│   │   ├── SupportBot.jsx              # Bot di supporto in-app
│   │   ├── dashboard/
│   │   │   ├── Panoramica.jsx          # Overview: contatori, upcoming, promemoria, attività recenti
│   │   │   ├── Agenda.jsx              # Calendario (giorno/mese), appuntamenti, prenotazioni pending
│   │   │   ├── EditorSito.jsx          # CMS blocchi: hero, about, cover, gallery, profilo, orari
│   │   │   ├── Servizi.jsx             # CRUD servizi offerti
│   │   │   ├── Social.jsx              # Bozze social con AI (Instagram, Facebook)
│   │   │   ├── Recensioni.jsx          # Gestione recensioni + AI reply
│   │   │   ├── Promemoria.jsx          # Task manager con scadenze e priorità
│   │   │   ├── Clienti.jsx             # Rubrica clienti (da appuntamenti + import .vcf)
│   │   │   └── Orari.jsx               # Gestione orari apertura (mattina/pomeriggio per giorno)
│   │   └── public/
│   │       └── BookingSection.jsx      # Widget prenotazione sul sito pubblico (6 step)
│   ├── lib/
│   │   ├── supabase.js                 # Istanza client Supabase
│   │   ├── claude.js                   # Chiamata Edge Function claude-proxy
│   │   ├── notifications.js            # Notifiche browser: schedule, new booking, next apt
│   │   ├── pushSubscription.js         # Web Push: subscribe/unsubscribe/isPushSubscribed
│   │   └── activityLog.js              # Fire-and-forget su tabella activity_log
│   └── assets/
│       └── hero.png, react.svg, vite.svg
├── supabase/
│   ├── schema.sql                      # Schema DB baseline
│   ├── activity_log.sql                # Script separato per activity_log
│   ├── functions/
│   │   ├── claude-proxy/index.ts       # Proxy AI con rate limiting
│   │   ├── stripe-checkout/index.ts    # Crea sessione Stripe Checkout
│   │   ├── stripe-webhook/index.ts     # Gestisce webhook Stripe (checkout.session.completed)
│   │   ├── approve-affiliate/index.ts  # Approva/rifiuta affiliato + email via Resend
│   │   └── notify-new-booking/index.ts # Push notification su nuova prenotazione
│   └── migrations/                     # 20+ file SQL ordinati per data
├── legal-docs/                         # Sorgenti Markdown dei documenti legali
│   ├── privacy-policy.md
│   ├── termini-servizio.md
│   ├── cookie-policy.md
│   ├── dpa.md
│   └── contratto-affiliazione.md
└── dist/                               # Build output (non committare idealmente)
```

---

## 4. Routing

Tutte le route sono definite in `src/App.jsx`. Meccanismo speciale: se il browser è su un sottodominio (es. `mario.piumapp.com`), il componente `App` bypassa tutto il router e renderizza direttamente `<PublicSite />`.

| Path | Componente | Protezione |
|------|-----------|-----------|
| `/` | `Landing` | `PublicRoute` (redirect a /dashboard se autenticato) |
| `/auth` | `Auth` | `PublicRoute` |
| `/onboarding` | `Onboarding` | Nessuna (verifica auth internamente) |
| `/dashboard` | `Dashboard` | Nessuna (verifica auth internamente) |
| `/settings` | `Settings` | Nessuna (verifica auth internamente) |
| `/admin` | `Admin` | Ruolo `admin` in `app_metadata` |
| `/x-admin-login` | `AdminLogin` | Pubblica |
| `/reset-password` | `ResetPassword` | Pubblica |
| `/site/:slug` | `PublicSite` | Pubblica |
| `/:slug` | `PublicSite` | Pubblica (catch-all slug) |
| `/affiliates` | `Affiliates` | Nessuna (verifica auth internamente) |
| `/affiliates/auth` | `AffiliatesAuth` | Pubblica |
| `/ref/:code` | `RefRedirect` | Pubblica (salva ref in localStorage e redirect a /auth) |
| `/privacy` | `Privacy` | Pubblica |
| `/termini` | `Termini` | Pubblica |
| `/cookie` | `Cookie` | Pubblica |
| `/dpa` | `Dpa` | Pubblica |
| `/contratto-affiliazione` | `ContrattoAffiliazione` | Pubblica |

**Sottodomini:** `{slug}.piumapp.com` — risolti dal Cloudflare Worker che fa proxy trasparente verso `www.piumapp.com`, la SPA legge `window.location.hostname` e usa il sottodominio come slug.

**Deep-link dashboard:** supportato via query param `?s={section}` (es. `/dashboard?s=agenda`).

---

## 5. Database Supabase

### Tabelle principali

#### `businesses`
Entità centrale. Una per utente/owner.

Colonne chiave (da schema.sql + migrations):
- `id` uuid PK
- `user_id` uuid → `auth.users`
- `name`, `slug` (unique), `category`, `description`, `business_type_custom`
- `phone`, `whatsapp`, `email`, `address`, `city`
- `logo_url`, `cover_url`, `profile_image`
- `instagram_url`, `facebook_url`
- `opening_hours` jsonb (formato: `{ monday: { morning: { active, open, close }, afternoon: { active, open, close } }, ... }`)
- `is_active` boolean (default true)
- `status` text: `trial` | `active` | `expired` | `suspended`
- `plan` text: `trial` | `free` | `starter` | `pro` | `active`
- `plan_price` numeric (default 99)
- `trial_ends_at` timestamptz
- `stripe_subscription_id`, `stripe_customer_id` text
- `affiliate_code` text (codice dell'affiliato che ha referenziato)
- `admin_notes` text (visibili solo admin)
- `ai_tokens_month` int, `ai_calls_month_display` int, `ai_calls_month` int, `ai_calls_total` int
- `ai_unlimited` boolean (flag admin)
- `ai_reset_date` date

#### `services`
Servizi/prodotti offerti da un'attività.
- `id`, `business_id`, `name`, `description`, `price` numeric(10,2), `price_label`, `duration_min` int, `image_url`, `is_available` boolean, `sort_order` int

#### `appointments`
Appuntamenti manuali o confermati da prenotazione.
- `id`, `business_id`, `employee_id` → `employees`, `client_name`, `client_phone`, `date`, `start_time`, `duration_minutes`, `price`, `notes`, `booking_id` → `bookings`, `completed` boolean

#### `bookings`
Richieste di prenotazione online dai clienti.
- `id`, `business_id`, `service_id`, `customer_name`, `customer_email`, `customer_phone`, `appointment_date`, `appointment_time`
- `status`: `pending` | `confirmed` | `cancelled`
- Campo denormalizzato `service_names` (da migration 20260519_booking_services)

#### `appointment_services`
Tabella ponte appuntamento ↔ servizi (aggiunta 20260526).
- `appointment_id`, `service_id`, `price_snapshot`, `duration_snapshot`

#### `employees`
Collaboratori di un'attività.
- `id`, `business_id`, `name`, `color` text (hex)

#### `site_content`
Blocchi CMS per il sito pubblico. Una riga per blocco.
- `id`, `business_id`, `block_key` (`hero` | `about` | `cover` | `gallery`), colonne dedicate per blocco + `metadata` jsonb
- `is_published` boolean

#### `social_drafts`
Bozze post social (AI o manuali).
- `platform`: `instagram` | `facebook` | `linkedin` | `x` | `tiktok` | `generic`
- `status`: `draft` | `approved` | `scheduled` | `published` | `archived`
- `ai_generated` boolean, `ai_prompt` text

#### `reviews`
Recensioni clienti (manuali o importate).
- `author_name`, `rating` smallint (1-5), `body`, `source` (`manual` | `google` | `tripadvisor` | `facebook` | `yelp`), `is_visible`, `reply`, `replied_at`

#### `reminders`
Task manager con priorità e scadenze.
- `title`, `notes`, `due_at`, `priority` (`low` | `medium` | `high`), `status` (`pending` | `done` | `dismissed`)

#### `contacts`
Rubrica clienti (migration 20260527).
- `id`, `business_id`, `name`, `phone`, `email`, `notes`, `source` (default `manual`)

#### `employees`
Collaboratori.

#### `push_subscriptions`
Sottoscrizioni Web Push per notifiche.
- `user_id`, `business_id`, `endpoint`, `subscription` jsonb
- Unique su `(user_id, endpoint)`

#### `activity_log`
Log attività in-app (fire-and-forget).
- `business_id`, `user_id`, `type`, `description`

#### `analytics_events`
Tracking eventi pubblici (page view, click ecc.).
- `business_id`, `event_type`, `page`, `referrer`, `user_agent`, `session_id`, `properties` jsonb

#### `affiliates`
Profili affiliati.
- `id`, `user_id`, `code` (unique), `name`, `email`, `status` (`pending` | `approved` | `rejected`)
- `total_clients`, `total_earned`, `total_pending`
- `city`, `province`, `phone`, `legal_name` (dati interni admin)
- `admin_notes`, `approved_email_sent_at`

#### `legal_acceptances`
Traccia accettazione documenti legali.
- `user_id`, `context` (`merchant` | `affiliate`), `acceptance_type`, `document_versions` jsonb, `source`
- Unique su `(user_id, acceptance_type)`

### Stored Procedures / RPC

| Funzione | Tipo | Scopo |
|---------|------|-------|
| `get_taken_slots(p_business_id, p_date)` | SECURITY DEFINER | Slot occupati per il booking pubblico |
| `create_booking(...)` | SECURITY DEFINER, anonimo | Crea prenotazione pending dal sito pubblico |
| `owner_confirm_booking(p_booking_id)` | SECURITY DEFINER, autenticato | Owner conferma booking → crea appointment |
| `confirm_booking(...)` | SECURITY DEFINER, authenticated | Vecchia versione (OTP-based, ora non usata nel client) |
| `set_updated_at()` | Trigger function | Aggiorna `updated_at` automaticamente |

### Row Level Security

Ogni tabella ha RLS attiva. Pattern generale:
- **Owner**: accesso completo via `business_id → businesses.user_id = auth.uid()`
- **Pubblico read-only**: `businesses` (is_active=true), `services` (is_available=true), `reviews` (is_visible=true), `site_content` (is_published=true)
- **Admin**: legge e aggiorna tutto via `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`
- **Analytics**: insert pubblico senza auth

### Performance Indexes (migration 20260520)

Indici aggiuntivi su `bookings(business_id, status)`, `appointments(business_id, date, completed)`, `businesses(status)`.

---

## 6. Funzionalità

### 6.1 Autenticazione

**File:** `src/pages/Auth.jsx`

- Login / Registrazione con email+password via `supabase.auth`
- Al login: redirect a `/admin` se `app_metadata.role === 'admin'`, altrimenti `/dashboard`
- Registrazione: richiede accettazione esplicita di Termini, DPA, Privacy tramite checkbox. Email redirect a `/onboarding`
- Reset password: `supabase.auth.resetPasswordForEmail` con redirect a `/reset-password`
- Gestione referral: legge `?ref=CODICE` dall'URL e lo salva in `localStorage` (`pium_ref`)

**Stato:** ✅ funzionante

### 6.2 Onboarding

**File:** `src/pages/Onboarding.jsx`

Wizard 3 step:
1. **La tua attività**: nome, categoria (12 preset + Altro custom)
2. **Contatti**: telefono, WhatsApp, email (almeno uno richiesto)
3. **Sede**: indirizzo, città, descrizione opzionale

All'invio:
1. Insert `businesses` con slug auto-generato (fino a 50 tentativi + fallback random)
2. Upsert `legal_acceptances` (context: merchant)
3. Legge codice affiliato da `localStorage` se presente
4. Genera descrizione AI via `generateWithClaude` (prompt costruito da `buildDescriptionPrompt`)
5. Redirect a `/dashboard`

**Stato:** ✅ funzionante

### 6.3 Dashboard

**File:** `src/pages/Dashboard.jsx`

Shell con sidebar (desktop) + topbar mobile. 8 sezioni navigabili:

| ID sezione | Componente | Funzione |
|-----------|-----------|---------|
| `panoramica` | `Panoramica.jsx` | Overview, upcoming appointments, promemoria, attività completate |
| `agenda` | `Agenda.jsx` | Calendario mese/giorno, CRUD appuntamenti, prenotazioni pending |
| `clienti` | `Clienti.jsx` | Rubrica clienti, storico appuntamenti, import .vcf |
| `promemoria` | `Promemoria.jsx` | Task manager con priorità, scadenze, stati |
| `social` | `Social.jsx` | Bozze post social AI (Instagram, Facebook) |
| `recensioni` | `Recensioni.jsx` | Gestione recensioni + AI reply |
| `servizi` | `Servizi.jsx` | CRUD servizi/prezzi/durate |
| `editor` | `EditorSito.jsx` | CMS blocchi sito pubblico + profilo + orari |

**Funzionalità trasversali della Dashboard:**
- Badge contatore prenotazioni pending in tempo reale (Supabase Realtime su `bookings`)
- Banner trial con countdown scadenza e pulsante "Attiva ora" → Stripe Checkout
- Polling post-Stripe (5 tentativi da 2s) per rilevare attivazione piano
- Notifica browser su nuova prenotazione tramite `notifyNewBooking`
- `NotificationScheduler` in `App.jsx`: schedula notifiche per appuntamenti di oggi al boot

**Stato:** ✅ funzionante

### 6.4 Agenda

**File:** `src/components/dashboard/Agenda.jsx`

- Vista **mese**: griglia 6 settimane, holiday italiane hardcoded (10 festività), dot colorati per appuntamento
- Vista **giorno**: timeline 00:00-23:59 con slot da 30 min, blocchi appuntamenti con layout colonne (no overlap)
- CRUD appuntamenti: data, ora, nome cliente, telefono, dipendente, servizi, durata, prezzo, note
- Autocomplete nome cliente da `contacts` + storico `appointments`
- Selezione servizi multi-check con calcolo automatico prezzo/durata totale
- Verifica orario di lavoro: avviso se appuntamento fuori orari apertura
- Prenotazioni pending: panel con action "Invia WhatsApp" + "Conferma" (via RPC `owner_confirm_booking`) + "Rifiuta"
- Riepilogo giornaliero: totale lordo/netto con aliquota IVA configurabile
- Date picker personalizzato a wheel iOS-style
- Gestione dipendenti: CRUD con nome + colore

**Stato:** ✅ funzionante

### 6.5 Sito Pubblico

**File:** `src/pages/PublicSite.jsx`, `src/components/public/BookingSection.jsx`

- Risoluzione slug da URL param o sottodominio
- Temi visivi per categoria (7 temi: default, bar, fitness, ristorante, parrucchiere, spa, professionista)
- Hero con cover image, avatar, badge categoria, CTA contatto
- Sezioni: Chi siamo, Galleria (carosello touch), Servizi, Prenotazione, Recensioni
- Sidebar: Contatti (tel, WhatsApp, email, Instagram, Facebook), Orari apertura, Mappa (Google Maps)
- Banner owner preview quando il proprietario visita il proprio sito

**BookingSection** (6 step):
1. Selezione servizio
2. Selezione data (max 60gg, rispetta `opening_hours`)
3. Selezione slot (da `get_taken_slots` RPC)
4. Form cliente (nome, email, telefono)
5. Conferma dati
6. Success (via RPC `create_booking` → status pending)

**Stato:** ✅ funzionante

### 6.6 Editor Sito

**File:** `src/components/dashboard/EditorSito.jsx`

Blocchi editabili:
- **Hero** (`block_key: hero`): hero_title, hero_subtitle, hero_cta_text
- **Chi siamo** (`block_key: about`): about_text (max 500 char)
- **Copertina** (`block_key: cover`): upload immagine (JPEG/PNG/WebP, max 5MB) con compressione via `browser-image-compression`
- **Galleria** (`block_key: gallery`): fino a 20 immagini, upload multi-file, compressione a 0.8MB target

Dati business modificabili: nome, categoria, telefono, WhatsApp, email, indirizzo, città, descrizione, immagine profilo, Instagram URL, Facebook URL.

**Componente Orari** (`Orari.jsx`): gestione per giorno della settimana con fasce mattina/pomeriggio e flag chiuso.

Salvataggio via `upsert` su `site_content` (conflict su `business_id, block_key`). Upload immagini su Supabase Storage bucket (presumibilmente `business-assets`).

**Stato:** ✅ funzionante

### 6.7 Clienti

**File:** `src/components/dashboard/Clienti.jsx`

- Aggrega contatti da tabella `contacts` + storico `appointments` (deduplicazione per telefono/nome)
- Mostra per ogni cliente: nome, telefono, email, numero appuntamenti, totale speso, prima/ultima visita
- Import contatti da file `.vcf` (Contact Book VCard) tramite libreria `vcf`
- Import tramite Contact Picker API (Chrome/Android) se supportata (`navigator.contacts`)
- Ricerca e filtro
- Link diretto WhatsApp per ogni cliente con telefono
- Visualizzazione storico appuntamenti per cliente con servizi, prezzi, durate

**Stato:** ✅ funzionante

### 6.8 Social

**File:** `src/components/dashboard/Social.jsx`

- Genera bozze post per Instagram e Facebook via AI (Claude)
- Input: piattaforma, argomento, tono (5 preset toni)
- AI restituisce JSON con `content` + `hashtags[]`
- CRUD bozze: crea, modifica, approva, archivia
- Copia testo in clipboard
- Log attività su `activity_log`

**Stato:** ✅ funzionante

### 6.9 Recensioni

**File:** `src/components/dashboard/Recensioni.jsx`

- CRUD recensioni con stelle (1-5), autore, testo, data, fonte
- Genera risposta AI con tono adattivo (caldo per 4-5 stelle, costruttivo per 3, empatico per 1-2)
- Visibilità toggle (nasconde dal sito pubblico)
- Filtri per rating e fonte

**Stato:** ✅ funzionante

### 6.10 Promemoria

**File:** `src/components/dashboard/Promemoria.jsx`

- CRUD promemoria con titolo, note, scadenza, priorità (Alta/Media/Bassa)
- Scadenza: data fissa o relativa (N giorni/settimane/mesi)
- Filtri per stato e priorità
- Urgency coloring: rosso (scaduto), arancione (≤3gg), verde

**Stato:** ✅ funzionante

### 6.11 Impostazioni

**File:** `src/pages/Settings.jsx`

- Cambia email account (con conferma via link)
- Cambia password
- Gestione notifiche browser: richiesta permesso, intervallo pre-appuntamento, notifica "prossimo dopo completamento"
- Web Push toggle (notifiche con browser chiuso): subscribe/unsubscribe via VAPID
- Test notifica di prova
- Logout

**Stato:** ✅ funzionante

### 6.12 Pannello Admin

**File:** `src/pages/Admin.jsx`

Accessibile solo con `app_metadata.role === 'admin'`. Login dedicato su `/x-admin-login`.

**Tab Clienti:**
- Tabella con tutti i business (filtro per status, ricerca)
- KPI: totale, attivi, in trial, scaduti, MRR calcolato, tasso conversione
- Azioni per business: attiva, sospendi, +30 giorni trial, copia link, apri sito
- Drawer dettaglio business: stato, scadenza trial (modificabile), piano/prezzo, provenienza (affiliato/organic), "salute onboarding" (copertina + servizi), utilizzo AI, note interne, toggle AI illimitata

**Tab Affiliati:**
- Lista affiliati con stato, clienti portati, guadagnato
- Azioni: approva (chiama Edge Function `approve-affiliate` → email Resend), sospendi, rifiuta
- Drawer con dati interni admin editabili (città, provincia, telefono, nominativo legale, note)

**Stato:** ✅ funzionante

### 6.13 Programma Affiliati

**File:** `src/pages/Affiliates.jsx`, `src/pages/AffiliatesAuth.jsx`

- Auth separata per affiliati (email + password)
- Alla prima autenticazione: crea profilo `affiliates` con codice univoco generato da nome
- Stato `pending` fino ad approvazione manuale admin
- Dashboard: guadagnato totale, in attesa pagamento, clienti portati, attivi Pro
- Link referral personalizzato: `https://piumapp.com/auth?ref={code}`
- Accettazione contratto affiliazione + privacy tracciata in `legal_acceptances`

**Stato:** ✅ funzionante

### 6.14 Notifiche Push

**Flusso:**
1. Utente attiva push da `/settings`
2. `subscribePush()` → SW registra push subscription, salva in `push_subscriptions`
3. Edge Function `notify-new-booking` (trigger webhook Supabase su INSERT bookings) → legge subscriptions → invia push via `web-push` npm

**Stato:** ⚠️ parziale — VAPID_PUBLIC_KEY è vuoto nel `.env` locale; Edge Function configurata ma la chiave VAPID va configurata nei Supabase Secrets

### 6.15 Pagamenti Stripe

**Flusso:**
1. Utente clicca "Attiva ora" in dashboard (solo se `status === 'trial'`)
2. Dashboard chiama Edge Function `stripe-checkout` (POST autenticato)
3. Edge Function crea Stripe Checkout Session (subscription, 99€/mese, EUR, locale it)
4. Redirect a Stripe Hosted Checkout
5. Al completamento: Stripe chiama webhook → Edge Function `stripe-webhook`
6. Webhook verifica firma HMAC-SHA256, aggiorna `businesses.status = 'active'`
7. Dashboard fa polling per rilevare attivazione (max 5×2s)

**Modalità:** Test (pk_test_, sk_test_) — NON in produzione

**Stato:** ⚠️ parziale — chiavi Stripe in modalità test, `STRIPE_WEBHOOK_SECRET` non configurato nel `.env` (configurato nei Supabase Secrets in produzione)

---

## 7. Integrazioni Esterne

### Anthropic Claude API
- **Endpoint usato:** `https://api.anthropic.com/v1/messages`
- **Modello:** `claude-sonnet-4-6`
- **Max tokens per risposta:** 1000
- **Rate limit:** 350.000 token/mese per business (reset il 1° del mese), con flag `ai_unlimited` override
- **Gestione chiave:** lato server nella Edge Function `claude-proxy`; il client frontend chiama `/functions/v1/claude-proxy` con Bearer token Supabase

### Stripe
- **Modalità attuale:** test
- **Flow:** Stripe Checkout hosted (subscription mensile)
- **Webhook:** verifica firma custom senza SDK (Web Crypto HMAC-SHA256), anti-replay 5 minuti
- **Variabile critica da impostare:** `STRIPE_WEBHOOK_SECRET` nei Supabase Secrets

### Resend (Email Transazionale)
- **Usato in:** Edge Function `approve-affiliate`
- **From:** `PIUM <no-reply@piumapp.com>` (da env `FROM_EMAIL`)
- **Idempotency-Key:** `affiliate-approved-{affiliateId}`
- **Variabile:** `RESEND_API_KEY` nei Supabase Secrets

### Supabase Realtime
- Canale `pending-bookings-{businessId}` su INSERT/UPDATE `bookings`
- Usato in Dashboard per aggiornare badge count e mostrare notifica browser

### Cloudflare Worker
- Route: `*.piumapp.com/*`
- Proxy trasparente: riscrive hostname verso `www.piumapp.com`, mantiene path/query/headers
- La SPA legge `window.location.hostname` per estrarre lo slug del sottodominio

### Web Push VAPID
- Chiave pubblica: `VITE_VAPID_PUBLIC_KEY` (vuoto nel `.env` locale)
- Chiave privata: `VAPID_PRIVATE_KEY` nei Supabase Secrets
- Notifica su nuove prenotazioni via webhook Supabase Database

### Google Maps
- Link diretto a `https://www.google.com/maps/search/{indirizzo}` (nessuna API key richiesta)

### Google Fonts
- Font `Bricolage Grotesque` caricato via `<link>` in `index.html`

---

## 8. Variabili d'Ambiente

### Frontend (`.env` locale, prefisso `VITE_`)

| Variabile | Valore nel `.env` | Note |
|-----------|------------------|------|
| `VITE_SUPABASE_URL` | `https://onkyhknchhlsmcknpinr.supabase.co` | URL progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` (JWT) | **ATTENZIONE: chiave pubblica esposta in `.env` committato** |
| `VITE_VAPID_PUBLIC_KEY` | `""` (vuoto) | Mancante — push non attive |
| `VITE_STRIPE_PUBLIC_KEY` | `pk_test_51TXHOC...` | Chiave pubblica Stripe **TEST** |

### Backend (`.env` locale, usate server-side — NON prefisso VITE_)

| Variabile | Valore nel `.env` | Note |
|-----------|------------------|------|
| `STRIPE_SECRET_KEY` | `sk_test_51TXHOC...` | Chiave segreta Stripe **TEST** — **nel file .env, RISCHIO** |

### Supabase Secrets (Edge Functions)

Variabili da configurare nel Dashboard Supabase → Project Settings → Edge Functions Secrets:

| Secret | Usato in |
|--------|---------|
| `CLAUDE_API_KEY` | `claude-proxy` |
| `STRIPE_SECRET_KEY` | `stripe-checkout` |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` |
| `RESEND_API_KEY` | `approve-affiliate` |
| `FROM_EMAIL` | `approve-affiliate` |
| `VAPID_PUBLIC_KEY` | `notify-new-booking` |
| `VAPID_PRIVATE_KEY` | `notify-new-booking` |
| `APP_URL` | `stripe-checkout` (default: `https://www.piumapp.com`) |
| `SUPABASE_URL` | tutte (auto-iniettato da Supabase) |
| `SUPABASE_ANON_KEY` | tutte (auto-iniettato) |
| `SUPABASE_SERVICE_ROLE_KEY` | `stripe-webhook`, `approve-affiliate`, `notify-new-booking` |

---

## 9. Sicurezza

### Problemi critici rilevati nel codice

**9.1 Chiavi segrete nel file `.env` committato**
- `STRIPE_SECRET_KEY=sk_test_...` è presente nel file `.env` nella root del progetto
- `VITE_SUPABASE_ANON_KEY` è visibile nel `.env` (accettabile per chiave anon, ma il file non dovrebbe essere in git)
- **Il file `.env` NON è nel `.gitignore` se questi dati sono già nel repository**
- **Azione richiesta:** revocare e ruotare immediatamente tutte le chiavi, non committare `.env`

**9.2 Modalità test Stripe**
- `pk_test_` e `sk_test_` in uso — non idonee per produzione

**9.3 VAPID mancante**
- `VITE_VAPID_PUBLIC_KEY` è vuoto → le Web Push non funzionano in locale

### Sicurezza implementata correttamente

- **RLS Supabase:** attiva su tutte le tabelle con policy granulari owner/public/admin
- **Verifica firma webhook Stripe:** HMAC-SHA256 constant-time comparison, anti-replay 5 minuti
- **Idempotency key Resend:** previene invii duplicati email
- **Validazione slug:** `safePublicUrl()` in Admin.jsx verifica regex `^[a-z0-9-]+$` prima di costruire href
- **Rate limiting AI:** 350.000 token/mese per business, gestito server-side
- **Admin role:** verificato lato server in Edge Function `approve-affiliate` (`app_metadata.role !== 'admin'`)
- **Antiabuse prenotazioni:** una sola prenotazione pending per email per business (CHECK in `create_booking` RPC)
- **Prompt length cap:** max 20.000 caratteri nella Edge Function `claude-proxy`

### `console.log` / `console.error` in produzione

Presenti `console.error` in molti componenti come pattern di debug (es. `Agenda.jsx`, `Servizi.jsx`, `EditorSito.jsx`, `Social.jsx`). Non espongono dati sensibili ma sono visibili nella console del browser.

---

## 10. Deployment / Infra

### Frontend (Vercel)

**File:** `vercel.json`

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [...]
}
```

- SPA catch-all: tutto viene servito da `index.html`
- Cache disabilitata per icone PWA (`icon-192.png`, `icon-512.png`, `favicon.ico`)

### Subdomain Proxy (Cloudflare Worker)

**File:** `cloudflare-worker.js`

- Route da configurare nel Cloudflare Dashboard: `*.piumapp.com/*`
- Proxy trasparente da `{slug}.piumapp.com` → `www.piumapp.com` mantenendo path/query

### Backend (Supabase)

- Database PostgreSQL managed
- Auth (email/password, magic links)
- Storage (immagini profilo, cover, gallery)
- Edge Functions (Deno runtime) su 4 funzioni
- Realtime (WebSocket per bookings)

### Edge Functions — configurazione speciale

`supabase/functions/stripe-webhook/config.toml` e `supabase/functions/notify-new-booking/config.toml` (file presenti ma non letti — presumibilmente gestiscono `verify_jwt = false` per Stripe e webhook Supabase).

### Build

```bash
npm run dev      # sviluppo locale (Vite HMR)
npm run build    # build produzione → dist/
npm run preview  # anteprima build
npm run lint     # ESLint
```

### CI/CD

Nessun file di configurazione CI/CD trovato nel repository (nessun `.github/workflows`, nessun `.gitlab-ci.yml`). Il deploy sembra essere manuale o tramite integrazione Vercel Git.

---

## 11. Documenti Legali

Tutti i documenti legali sono presenti sia come sorgente Markdown in `legal-docs/` sia come componenti React in `src/pages/legal/`.

| Documento | Route | File Markdown | Versione tracciata |
|-----------|-------|---------------|--------------------|
| Privacy Policy | `/privacy` | `legal-docs/privacy-policy.md` | `2026-05-28` |
| Termini di Servizio | `/termini` | `legal-docs/termini-servizio.md` | `2026-05-28` |
| Cookie Policy | `/cookie` | `legal-docs/cookie-policy.md` | — |
| DPA (Data Processing Agreement) | `/dpa` | `legal-docs/dpa.md` | `2026-05-28` |
| Contratto di Affiliazione | `/contratto-affiliazione` | `legal-docs/contratto-affiliazione.md` | `2026-05-28` |

### Accettazione tracciata

In `legal_acceptances`:
- Al signup merchant (da `Onboarding.jsx`): tipo `merchant_terms_dpa_privacy`, context `merchant`
- Al signup affiliato (da `Affiliates.jsx`): tipo `affiliate_contract_privacy`, context `affiliate`

Il checkbox di accettazione è richiesto esplicitamente in `Auth.jsx` prima della registrazione.

---

## 12. TODOs e Problemi Noti

### Nessun commento TODO/FIXME/HACK trovato nel codice sorgente

La ricerca ripgrep su `src/` non ha trovato alcun commento `TODO`, `FIXME`, `HACK`, `XXX`.

### Problemi tecnici rilevati dall'analisi del codice

1. **VAPID_PUBLIC_KEY mancante** — Le notifiche push non sono attivabili in locale. La key vuota in `.env` causa errore silenzioso in `pushSubscription.js` (`if (!VAPID_PUBLIC_KEY) return { error: 'no_vapid_key' }`).

2. **Stripe in modalità test** — Le chiavi `pk_test_` / `sk_test_` non sono idonee per pagamenti reali. Necessario switch a produzione con configurazione `STRIPE_WEBHOOK_SECRET`.

3. **`.env` con dati sensibili potenzialmente in git** — `STRIPE_SECRET_KEY` è in `.env`. Verificare che `.env` sia nel `.gitignore`.

4. **Chiave anon Supabase esposta** — `VITE_SUPABASE_ANON_KEY` è nel `.env` ed è inclusa nel bundle JS (comportamento normale per anon key Supabase, ma va verificata la sicurezza RLS su ogni tabella).

5. **Incoerenza status/plan nel webhook Stripe** — `stripe-webhook/index.ts` imposta `plan: 'active'` (non previsto nei valori originali) ma la migration `20260523_plan_active_value.sql` ha aggiunto questo valore alla constraint. Status aggiornato correttamente a `'active'`.

6. **Realtime Supabase** — Il canale `pending-bookings-{businessId}` viene rimosso e ricreato a ogni cambio di `business.id`. Il `try/catch` nel cleanup è necessario ma segnala `console.error` su CHANNEL_ERROR.

7. **Nessun error boundary React** — Un errore in un componente dashboard può crashare l'intera applicazione.

8. **ActivityLog fire-and-forget** — Gli errori di scrittura su `activity_log` vengono loggati su console ma non mostrati all'utente. Accettabile per log non critici.

9. **notify-new-booking — trigger non verificato** — La Edge Function `notify-new-booking` non verifica un header segreto (a differenza del webhook Stripe). Dovrebbe essere chiamata solo da Supabase Database Webhooks (configurato nel Dashboard Supabase).

10. **Contatti: Contact Picker API** — Disponibile solo su Chrome Android 80+/Desktop Chrome con flag. Su iOS Safari non supportata. Il codice usa `PICKER_SUPPORTED` per condizionare la UI correttamente.

---

## 13. Checklist Pre-Lancio

### Sicurezza e Credenziali

- 🔴 **Ruotare STRIPE_SECRET_KEY** (presente nel `.env`, potenzialmente esposto se il file è in git)
- 🔴 **Passare Stripe a modalità produzione** (cambiare `pk_test_` → `pk_live_`, `sk_test_` → `sk_live_`)
- 🔴 **Configurare STRIPE_WEBHOOK_SECRET** nei Supabase Secrets
- 🔴 **Verificare che `.env` sia nel `.gitignore`** e non sia mai stato committato con dati reali
- 🔴 **Generare e configurare chiavi VAPID** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) per le notifiche push
- 🔴 **Configurare CLAUDE_API_KEY** nei Supabase Secrets con chiave produzione Anthropic
- 🔴 **Configurare RESEND_API_KEY** nei Supabase Secrets

### Infrastruttura

- 🔴 **Configurare Supabase Database Webhook** su INSERT in `bookings` → chiama `notify-new-booking`
- 🔴 **Configurare Cloudflare Worker** con route `*.piumapp.com/*` per sottodomini
- 🔴 **Configurare dominio su Vercel** (`www.piumapp.com`, `piumapp.com`)
- 🟡 **Configurare APP_URL** nei Supabase Secrets (`https://www.piumapp.com`)
- 🟡 **Configurare FROM_EMAIL** nei Supabase Secrets (`PIUM <no-reply@piumapp.com>`)
- 🟡 **Verificare dominio email Resend** (no-reply@piumapp.com deve essere verificato in Resend)

### Funzionalità

- 🟡 **Testare flusso completo prenotazione** end-to-end (cliente → pending → WhatsApp → conferma → appuntamento)
- 🟡 **Testare flusso Stripe** in produzione (non solo test)
- 🟡 **Testare push notification** con VAPID configurato
- 🟡 **Verificare Supabase Realtime** funzionante in produzione (WebSocket)
- 🟡 **Testare import VCF** con file reali di diversi formati
- 🟡 **Verificare upload immagini** su Storage Supabase (bucket policy, dimensioni)

### Compliance e Legale

- 🟡 **Verificare documenti legali** (Privacy, Termini, DPA, Cookie) — hanno contenuto reale o sono placeholder?
- 🟡 **Banner cookie** — non presente nell'app. Valutare se necessario per GDPR
- 🟢 **Tracciamento accettazione** — già implementato in `legal_acceptances`

### Performance e Qualità

- 🟡 **Aggiungere React Error Boundary** per prevenire crash totali dell'app
- 🟡 **Rimuovere `console.error` in produzione** o sostituire con sistema di error reporting (es. Sentry)
- 🟢 **Indici DB** — già aggiunti in migration 20260520
- 🟢 **Compressione immagini** — già implementata in EditorSito.jsx

### SEO e PWA

- 🟡 **Meta tag SEO** per siti pubblici — il `document.title` viene aggiornato (`${biz.name} — PIUM`) ma mancano meta description, og:image
- 🟡 **Verifica Service Worker** in produzione — lo SW è presente in `public/sw.js` ma il contenuto non è stato verificato
- 🟢 **PWA manifest** — configurato correttamente, iniettato solo su dominio principale

---

Generato il: 2026-06-02
Commit: 938d550 (Landing design pass)
