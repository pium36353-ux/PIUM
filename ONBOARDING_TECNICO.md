# PIUM — Onboarding Tecnico

> Guida per uno sviluppatore esterno che entra sul progetto da zero. Aggiornato al 2026-05-19.

---

## 1. Stack Tecnologico

| Layer | Tecnologia | Versione |
|---|---|---|
| UI Framework | React | 19.2.5 |
| Build | Vite | 8.0.9 |
| CSS | Tailwind CSS v4 | 4.2.4 (via `@tailwindcss/vite`, zero config file) |
| Routing | React Router DOM | 7.14.2 |
| Backend / DB | Supabase | `@supabase/supabase-js` 2.104.0 |
| Edge Functions | Deno (TypeScript) | Runtime Supabase nativo |
| AI | Claude Sonnet 4.6 | Anthropic API, via Edge Function proxy |
| Pagamenti | Stripe | `stripe` 22.1.1 (server), `@stripe/stripe-js` 9.5.0 (client) |
| Push Notifications | Web Push / VAPID | `npm:web-push` in Deno |
| Hosting | Vercel | Deploy automatico da `git push master` |
| Sottodomini | Cloudflare Worker | Proxy trasparente `*.piumapp.com → www.piumapp.com` |
| DNS / CDN | Cloudflare | Registrar + proxy |
| PWA | Service Worker custom | `public/sw.js` |
| Compressione immagini | `browser-image-compression` | 2.0.2 |
| Parse vCard | `vcf` | 2.1.2 |

---

## 2. Setup Locale

```bash
# 1. Clone
git clone https://github.com/pium36353-ux/PIUM.git
cd PIUM

# 2. Install
npm install

# 3. Variabili d'ambiente — crea .env nella root (vedi §6)
cp .env.example .env   # non esiste ancora — crearlo manualmente
# Riempire VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ecc.

# 4. Avvio sviluppo
npm run dev
# → http://localhost:5173
```

**Non serve configurare Supabase in locale** — il progetto punta direttamente al progetto Supabase di produzione (`onkyhknchhlsmcknpinr`). Non esiste un ambiente di staging.

**Deploy:** ogni `git push origin master` trigga automaticamente il build su Vercel.

---

## 3. Mappa Completa `src/`

### `src/main.jsx`
Entry point React. Monta `<App />` su `#root`. Registra il Service Worker (`/sw.js`) se il browser lo supporta.

### `src/App.jsx`
Router top-level. **Prima del routing React**, controlla se il browser è su un sottodominio (`mario.piumapp.com`): in quel caso renderizza direttamente `<PublicSite />` per tutti i path, bypassando il router normale. Altrimenti monta `BrowserRouter` con tutte le route. Contiene anche `NotificationScheduler` (schedula notifiche locali appuntamenti) e `PWABanner`.

### `src/pages/Landing.jsx`
Homepage marketing pubblica. `PublicRoute` la reindirizza a `/dashboard` se l'utente è già autenticato.

### `src/pages/Auth.jsx`
Schermata login/registrazione. Toggle tra i due modi. `translateError()` mappa gli errori Supabase in italiano. `pendingRef` previene doppio submit. Salva `?ref=CODICE` referral in localStorage.

### `src/pages/Onboarding.jsx`
Wizard 3 step post-registrazione. Genera lo slug (`generateSlug` — prova `bar-roma`, poi `bar-roma-2`, ecc. fino a 50 tentativi). Chiama Claude per generare la descrizione AI dell'attività in background. Legge `localStorage('pium_ref')` e lo scrive in `businesses.affiliate_code`.

### `src/pages/Dashboard.jsx`
Shell principale con sidebar. Gestisce la sezione attiva via `?s=` query param. Carica il record `businesses` dell'utente autenticato. Banner trial/expired/checkout. Subscription Supabase Realtime su `bookings` per il badge pending in tempo reale.

### `src/pages/Settings.jsx`
Impostazioni account. Tre sezioni: Notifiche (permesso browser + toggle push VAPID + promemoria), Account (email + cambio password), Esci. Badge "Attivo"/"Non attivo" per lo stato notifiche.

### `src/pages/PublicSite.jsx`
Mini-sito pubblico dell'attività. Caricato da route `/site/:slug`, `/:slug`, o direttamente da sottodominio. Estrae lo slug dall'hostname se è un sottodominio. Select esplicita su `businesses` (esclude campi admin/billing). Contiene `BookingSection`.

### `src/pages/Admin.jsx`
Pannello super-admin (`/admin`). Richiede `app_metadata.role = 'admin'`. Tabella businesses con 6 StatCard. Drawer laterale per ogni cliente con gestione stato, trial, AI, note.

### `src/pages/AdminLogin.jsx`
Login dedicato admin su `/x-admin-login`. Non usa `PublicRoute` (non redirige utenti autenticati normali).

### `src/pages/Affiliates.jsx`
Dashboard affiliati. Link referral personalizzato, lista clienti riferiti, commissioni.

### `src/pages/AffiliatesAuth.jsx`
Login/registrazione affiliati su `/affiliates/auth`.

### `src/components/Logo.jsx`
Logo SVG PIUM riutilizzabile. Prop `size` e `color`.

### `src/components/PWABanner.jsx`
Banner "Installa app" su mobile. Usa evento `beforeinstallprompt`. Si nasconde dopo l'installazione o se già installata.

### `src/components/SupportBot.jsx`
Widget FAQ flottante (pulsante ? in basso a destra). Carica FAQ da tabella `faq` su Supabase. Navigazione categorie → domande → risposta. Link deep a sezioni dashboard.

### `src/components/dashboard/Panoramica.jsx`
Home dashboard. 9 query in `Promise.all`. Hero card appuntamenti oggi + calendario mese. Contatori sezioni. Card prossime attività con deep-link in Agenda. Card promemoria in scadenza. Card attività completate. Barra utilizzo AI mensile.

### `src/components/dashboard/Agenda.jsx`
Calendario appuntamenti. Vista giornaliera (timeline 48 slot × 30min) e mensile. Drum-scroll date picker. Modal appuntamento con autocomplete nome cliente (query live su `contacts` + `appointments`), selezione multipla servizi, telefono WhatsApp. Pannello prenotazioni pending con flusso WA-first (Invia WhatsApp → Conferma). Dialog conferma/rifiuto come modal overlay.

### `src/components/dashboard/Clienti.jsx`
Rubrica aggregata da `appointments` + `contacts`. `groupClients()` deduplica per telefono. Drawer cliente con storico visite, tag servizi, modifica contatto. Modal importazione (vCard + Contact Picker API).

### `src/components/dashboard/Servizi.jsx`
CRUD servizi. Upload immagini per servizio. Toggle disponibilità. Ordinamento drag.

### `src/components/dashboard/Social.jsx`
Generazione bozze AI con Claude. Prompt per piattaforma. Lista bozze con approvazione/eliminazione. `parseAIResponse()` estrae testo + hashtag dalla risposta Claude.

### `src/components/dashboard/Recensioni.jsx`
Lista recensioni. Toggle visibilità. Risposta AI con Claude. Risposta manuale.

### `src/components/dashboard/Promemoria.jsx`
Task manager. Scadenza fissa o relativa (tra X giorni/settimane/mesi — calcolata a `due_at` assoluta prima del salvataggio). Urgenza colorata.

### `src/components/dashboard/EditorSito.jsx`
CMS mini-sito. 4 blocchi (hero, about, copertina, galleria). Upload foto profilo + galleria (max 20 foto, compressione auto). Orari di apertura (delega a `Orari.jsx`). Link "Vedi sito pubblico" → `www.piumapp.com/site/${slug}`.

### `src/components/dashboard/Orari.jsx`
Form orari di apertura (7 giorni, mattina + pomeriggio con flag `active`). Migrazione automatica dal vecchio formato `open`/`close` al nuovo `morning`/`afternoon`.

### `src/components/public/BookingSection.jsx`
Form prenotazione online integrato nel mini-sito. 6 step: SERVICE (checkbox multipli + barra totale) → DATE → SLOT (RPC `get_taken_slots`) → FORM (telefono obbligatorio) → CONFIRM (riepilogo + disclaimer WhatsApp) → SUCCESS. Supporta entrambi i formati `opening_hours`.

### `src/lib/supabase.js`
Client Supabase singleton. `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`.

### `src/lib/claude.js`
Chiamata alla Edge Function `claude-proxy`. Verifica sessione prima della chiamata. Traduce errori HTTP in messaggi italiani. Gestisce `AI_LIMIT_REACHED` (429).

### `src/lib/notifications.js`
`scheduleAllTodayNotifications(apts)` — schedula notifiche locali con `setTimeout` per ogni appuntamento di oggi. `requestPermission()` — richiede permesso notifiche browser. `testNotification()` — notifica di prova immediata.

### `src/lib/pushSubscription.js`
`subscribePush()` — sottoscrive al Web Push con VAPID public key, salva su Supabase `push_subscriptions`. `unsubscribePush()` — rimuove subscription. `isPushSubscribed()` — verifica stato corrente.

### `src/lib/activityLog.js`
`logActivity(type, description)` — fire-and-forget insert su `activity_log`. Usato per tracciare azioni titolare (aggiunti servizi, risposte a recensioni, ecc.).

---

## 4. Tabelle Supabase

### `businesses`
Tabella centrale — un record per utente registrato.
- `id` uuid PK, `user_id` uuid FK→auth.users (cascade), `name`, `slug` UNIQUE
- `category`, `business_type_custom`, `description`, `address`, `city`
- `phone`, `whatsapp`, `email`, `website`
- `logo_url`, `cover_url`, `profile_image`, `instagram_url`, `facebook_url`
- `opening_hours` jsonb (formato `morning`/`afternoon` con flag `active`)
- `plan` (`trial|free|starter|pro`), `status` (`trial|active|expired|suspended`), `trial_ends_at`, `plan_price`
- `ai_tokens_month`, `ai_calls_month_display`, `ai_unlimited`, `ai_reset_date`
- `affiliate_code`, `admin_notes`, `is_active`
- `stripe_customer_id`, `stripe_subscription_id`

### `services`
Servizi dell'attività. `business_id` FK→businesses. `name`, `price`, `duration_min`, `is_available`, `sort_order`.

### `appointments`
Appuntamenti in agenda. `business_id`, `employee_id` FK→employees (nullable), `client_name`, `client_phone`, `date`, `start_time`, `duration_minutes`, `price`, `notes`, `booking_id` FK→bookings (nullable), `completed`.

### `bookings`
Prenotazioni online. `business_id`, `service_id` FK→services (nullable), `service_names` text (multi-servizio), `customer_name`, `customer_email`, `customer_phone`, `appointment_date`, `appointment_time`, `status` (`pending|confirmed|cancelled`). Abilitata su Realtime.

### `appointment_services`
Collega più servizi a un appuntamento. `appointment_id` FK→appointments (cascade), `service_id` FK→services (set null), `price_snapshot`, `duration_snapshot`.

### `contacts`
Rubrica manuale. `business_id`, `name`, `phone`, `notes`. UNIQUE `(business_id, phone)`.

### `push_subscriptions`
Sottoscrizioni Web Push. `user_id` FK→auth.users (cascade), `business_id`, `endpoint`, `subscription` jsonb. UNIQUE `(user_id, endpoint)`.

### `site_content`
Blocchi CMS mini-sito. `business_id`, `block_key` (`hero|about|gallery|faq|booking|hours`), `title`, `body`, `metadata` jsonb. UNIQUE `(business_id, block_key)`.

### `social_drafts`
Bozze social. `business_id`, `platform`, `content`, `hashtags` text[], `status` (`draft|approved`), `ai_generated`.

### `reviews`
Recensioni. `business_id`, `author_name`, `rating`, `body`, `reply`, `is_visible`.

### `reminders`
Task. `business_id`, `user_id`, `title`, `due_at`, `priority` (`low|medium|high`), `status` (`pending|done|dismissed`).

### `employees`
Staff. `business_id`, `name`, `color` hex.

### `activity_log`
Log azioni titolare. `business_id`, `user_id`, `type`, `description`.

### `faq`
Domande FAQ bot. `categoria`, `domanda`, `risposta`, `sort_order`. Nessuna RLS — read-only pubblico.

### `affiliates`
(Non ha migration locale — esiste solo in produzione.) `user_id`, `name`, `code` UNIQUE, `status` (`pending|active`), `total_earned`, `total_pending`.

---

## 5. Edge Functions

### `claude-proxy`
- **Trigger:** chiamata HTTP autenticata (JWT required) da `src/lib/claude.js`
- **Scopo:** Proxy sicuro all'API Anthropic. Rate limiting 350k token/mese per business. Reset mensile automatico. Bypass per `ai_unlimited = true`.
- **Secrets:** `CLAUDE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Rideploy:** `npx supabase functions deploy claude-proxy --project-ref onkyhknchhlsmcknpinr`

### `notify-new-booking`
- **Trigger:** Trigger PostgreSQL `on_new_booking` — AFTER INSERT ON `bookings`, chiama via `supabase_functions.http_request()` **senza** Authorization header
- **Config:** `verify_jwt = false` (⚠️ obbligatorio — il trigger non invia JWT)
- **Scopo:** Invia Web Push a tutti i dispositivi del titolare tramite VAPID. Rimuove automaticamente subscription `410 Gone`.
- **Secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Rideploy:** `npx supabase functions deploy notify-new-booking --project-ref onkyhknchhlsmcknpinr --use-api --no-verify-jwt`
- **⚠️ Attenzione:** dopo ogni rideploy, i titolari devono disattivare e riattivare il toggle notifiche in Settings per rinnovare la subscription

### `stripe-checkout`
- **Trigger:** chiamata HTTP autenticata (JWT required) da `Dashboard.jsx`
- **Config:** `verify_jwt = false` — gestisce manualmente l'auth (legge JWT dall'header)
- **Scopo:** Crea sessione Stripe Checkout (99€/mese). Redirect a Stripe. Dopo pagamento: Stripe chiama `stripe-webhook`.
- **Secrets:** `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### `stripe-webhook`
- **Trigger:** Stripe invia POST all'URL webhook dopo ogni evento (`checkout.session.completed`)
- **Config:** `verify_jwt = false` — valida firma HMAC Stripe manualmente
- **Scopo:** Verifica firma Stripe → aggiorna `businesses.status = 'active'` e `plan = 'active'`
- **Secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Webhook URL Stripe:** `https://onkyhknchhlsmcknpinr.supabase.co/functions/v1/stripe-webhook`

---

## 6. Variabili d'Ambiente

### `.env` locale (non committato — in `.gitignore`)

```
VITE_SUPABASE_URL=https://onkyhknchhlsmcknpinr.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key del progetto>
VITE_VAPID_PUBLIC_KEY=<chiave pubblica VAPID>
VITE_STRIPE_PUBLIC_KEY=<pk_test_ o pk_live_ da Stripe>
STRIPE_SECRET_KEY=<sk_test_ o sk_live_ — solo per test locale>
```

### Vercel Environment Variables (Dashboard → Settings → Environment Variables)

| Variabile | Descrizione |
|---|---|
| `VITE_SUPABASE_URL` | URL progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chiave pubblica Supabase (anon) |
| `VITE_VAPID_PUBLIC_KEY` | Chiave pubblica VAPID (Web Push) |
| `VITE_STRIPE_PUBLIC_KEY` | Chiave pubblica Stripe |

### Supabase Secrets (Dashboard → Edge Functions → Secrets)

| Secret | Funzione | Descrizione |
|---|---|---|
| `CLAUDE_API_KEY` | `claude-proxy` | Chiave API Anthropic |
| `VAPID_PUBLIC_KEY` | `notify-new-booking` | Chiave pubblica VAPID |
| `VAPID_PRIVATE_KEY` | `notify-new-booking` | Chiave privata VAPID (mai nel frontend) |
| `STRIPE_SECRET_KEY` | `stripe-checkout`, `stripe-webhook` | Chiave segreta Stripe |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | Secret per verifica firma HMAC |
| `SUPABASE_URL` | tutte | Automatico |
| `SUPABASE_SERVICE_ROLE_KEY` | tutte | Automatico |

---

## 7. Flussi Critici

### 7.1 Registrazione utente

```
1. Auth.jsx: supabase.auth.signUp() con email/password
2. Supabase Auth crea user in auth.users
3. Redirect a /onboarding
4. Onboarding.jsx (3 step): raccoglie nome attività, contatti, sede
5. generateSlug(name) — verifica disponibilità su DB in loop
6. supabase.from('businesses').insert({...slug, affiliate_code da localStorage})
7. Claude API (background): genera description AI → UPDATE businesses.description
8. Redirect a /dashboard
```

### 7.2 Prenotazione pubblica

```
1. Visitatore apre slug.piumapp.com (Cloudflare Worker → www.piumapp.com)
2. App.jsx rileva sottodominio → renderizza PublicSite direttamente
3. PublicSite carica business + services da Supabase (anon)
4. BookingSection: 6 step (SERVICE → DATE → SLOT → FORM → CONFIRM → SUCCESS)
5. Step SLOT: get_taken_slots RPC (SECURITY DEFINER, anon) → generateSlots()
6. Step SUCCESS: create_booking RPC (SECURITY DEFINER, anon)
   → INSERT bookings (status='pending')
7. Trigger PostgreSQL on_new_booking → Edge Function notify-new-booking
   → Web Push al titolare
8. Supabase Realtime → Dashboard.jsx aggiorna badge pending
```

### 7.3 Conferma appuntamento

```
1. Titolare vede card nel pannello "Prenotazioni in attesa"
2. Clicca "Invia WhatsApp" → link wa.me/ precompilato con messaggio
   → localStorage.setItem('wa_sent_${id}', '1')
3. Appare "Conferma appuntamento" (visibile solo dopo WA inviato)
4. Titolare clicca → dialog "Hai ricevuto conferma?" → "Sì, conferma"
5. owner_confirm_booking RPC (SECURITY DEFINER, solo titolare):
   - Verifica ownership: booking.business_id → businesses.user_id = auth.uid()
   - UPDATE bookings.status = 'confirmed'
   - INSERT appointments (copia data, ora, durata dal servizio, telefono cliente)
6. loadPendingBookings() → card sparisce
7. loadAppointments() → appuntamento compare in agenda
```

### 7.4 Pagamento Stripe

```
1. Dashboard.jsx: titolare clicca "Attiva ora" (banner trial)
2. handleCheckout → fetch Edge Function stripe-checkout (con JWT)
3. stripe-checkout: verifica JWT → legge businesses → crea Stripe Checkout Session
4. Redirect a Stripe (checkout.stripe.com)
5. Cliente paga → Stripe invia webhook a stripe-webhook Edge Function
6. stripe-webhook: verifica firma HMAC → UPDATE businesses SET status='active', plan='active'
7. Dashboard.jsx: polling ogni 2s per max 10s su businesses.status
8. Quando status='active': toast verde "Piano attivato" + banner sparisce
```

---

## 8. Cose da NON Toccare

| Cosa | Perché |
|---|---|
| `supabase/migrations/` — non eliminare file | Lo storico è l'unica documentazione dello schema. Eliminare un file non fa rollback sul DB. |
| RLS su `bookings` — non disabilitare `owner read/update` | Senza RLS, qualsiasi utente autenticato potrebbe leggere le prenotazioni di altri business. |
| `create_booking` con `SECURITY DEFINER` — non aggiungere auth check | Deve essere chiamabile da utenti anonimi (clienti del sito pubblico). |
| `verify_jwt = false` su `notify-new-booking` | Il trigger PostgreSQL non può inviare JWT. Rimuoverlo causa 401 silenti. |
| `verify_jwt = false` su `stripe-webhook` | Stripe non invia JWT Supabase. Usa HMAC signature propria. |
| Ordine parametri in `create_booking` SQL | PostgreSQL richiede parametri senza DEFAULT prima di quelli con DEFAULT. Non riordinare. |
| `cloudflare-worker.js` route `*piumapp.com/*` | Rimuovere la route disattiva tutti i sottodomini personalizzati. |
| Chiave CNAME wildcard `*.piumapp.com` con proxy Cloudflare arancione | Disabilitare il proxy rompe il Worker. Vercel non supporta wildcard subdomain direttamente. |
| `public/sw.js` versione cache `pium-v2` | Incrementare la versione invalida la cache di tutti gli utenti — farlo solo in caso di breaking change. |

---

## 9. Problemi Noti e Workaround

### Re-subscription push dopo rideploy Edge Function
**Problema:** ogni volta che si rideploya `notify-new-booking`, le subscription esistenti smettono di funzionare.
**Workaround attuale:** il titolare deve andare in Impostazioni, disattivare e riattivare il toggle "Notifiche anche con il telefono in tasca".
**Causa:** il rideploy cambia internamente la chiave di cifratura del service worker endpoint.
**Fix futuro:** logica di re-subscription automatica al mount di Settings.jsx.

### Sottodomini non funzionano senza Cloudflare Worker attivo
**Problema:** `mario.piumapp.com` non raggiunge il sito se il Worker è disattivato.
**Workaround:** la route `/site/:slug` (es. `www.piumapp.com/site/mario`) funziona sempre indipendentemente dal Worker.
**Debug:** Worker → Triggers → verificare route `*piumapp.com/*` attiva.

### Stripe in modalità test
**Problema:** le chiavi Stripe attuali sono `pk_test_` / `sk_test_` — i pagamenti non sono reali.
**Azione prima del lancio:** sostituire con chiavi live da Stripe Dashboard → aggiornare Vercel env vars + Supabase secrets.

### Nessun ambiente di staging
**Problema:** non esiste un progetto Supabase separato per testing — tutto va direttamente in produzione.
**Workaround:** testare funzionalità critiche con utenti test reali sul DB di produzione.

### Prezzo Stripe hardcodato
**Problema:** il prezzo `9900` (€99) è hardcodato in `stripe-checkout/index.ts`. Cambiare il prezzo richiede un rideploy della Edge Function.
**Workaround attuale:** modificare il file e rideploy manuale.

### `opening_hours` in due formati
**Problema:** i business più vecchi hanno `opening_hours` nel formato `{open, close}`, quelli nuovi nel formato `{morning, afternoon}`.
**Workaround:** `Orari.jsx` migra automaticamente il formato vecchio in memoria al mount. Il DB viene aggiornato solo alla prima modifica. `BookingSection.jsx` e `PublicSite.jsx` supportano entrambi i formati.

### Calcolo guadagni affiliati manuale
**Problema:** il collegamento Stripe → affiliati non è automatico. I guadagni vengono aggiornati manualmente dall'admin.
**Fix futuro:** webhook Stripe che legge `businesses.affiliate_code` e aggiorna `affiliates.total_earned`.
