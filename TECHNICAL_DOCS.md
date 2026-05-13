# PIUM — Documentazione Tecnica

> Documento generato il 2026-05-12. Permette a un tecnico senza contesto di capire l'intero progetto e ricostruire l'ambiente Supabase da zero.

---

## Indice

1. [Stack Tecnologico](#1-stack-tecnologico)
2. [Struttura Cartelle](#2-struttura-cartelle)
3. [Route Frontend](#3-route-frontend)
4. [Variabili d'Ambiente](#4-variabili-dambiente)
5. [Stato Supabase](#5-stato-supabase)
   - [Tabelle e Colonne](#51-tabelle-e-colonne)
   - [Policy RLS per Tabella](#52-policy-rls-per-tabella)
   - [RPC (Stored Functions)](#53-rpc-stored-functions)
   - [Edge Functions](#54-edge-functions)
   - [Realtime](#55-realtime)
   - [Storage](#56-storage)
6. [Ordine Migration su Progetto Nuovo](#6-ordine-migration-su-progetto-nuovo)
7. [Web Push VAPID — Setup Manuale](#7-web-push-vapid--setup-manuale)
8. [Ruoli e Autenticazione](#8-ruoli-e-autenticazione)
9. [PWA e Service Worker](#9-pwa-e-service-worker)

---

## 1. Stack Tecnologico

| Layer | Tecnologia | Note |
|---|---|---|
| Frontend framework | React 18 | Hooks, no class components |
| Build tool | Vite | Con `@vitejs/plugin-react` |
| CSS | Tailwind CSS v4 | Via `@tailwindcss/vite`, zero config file |
| Routing | React Router DOM v7 | `BrowserRouter`, nessun loader/action |
| Backend / DB | Supabase | Postgres + Auth + Storage + Realtime + Edge Functions |
| Linguaggio Edge Functions | Deno (TypeScript) | Runtime Supabase nativo |
| AI | Claude Sonnet 4.6 | Via Edge Function proxy `claude-proxy` |
| Push Notifications | Web Push API + VAPID | `npm:web-push` in Deno |
| Hosting | Vercel | Deploy automatico su `git push` a `master` |
| PWA | Service Worker custom | `public/sw.js`, manifest in `public/manifest.json` |

---

## 2. Struttura Cartelle

```
localhub/
├── public/
│   ├── sw.js              # Service Worker: cache, push events, notificationclick
│   ├── manifest.json      # PWA manifest (nome, icone, display standalone)
│   ├── icon-192.png       # Icona PWA 192×192
│   └── icon-512.png       # Icona PWA 512×512
│
├── src/
│   ├── main.jsx           # Entry point React, registra Service Worker
│   ├── App.jsx            # Router top-level, NotificationScheduler, PWABanner
│   │
│   ├── pages/
│   │   ├── Landing.jsx        # Homepage pubblica (/ — redirect se loggato)
│   │   ├── Auth.jsx           # Login / registrazione
│   │   ├── Onboarding.jsx     # Wizard primo avvio: crea business, genera sito con AI
│   │   ├── Dashboard.jsx      # Shell dashboard titolare (sidebar + sezioni)
│   │   ├── Settings.jsx       # Impostazioni account, password, notifiche, Web Push
│   │   ├── PublicSite.jsx     # Mini-sito pubblico dell'attività (/:slug)
│   │   ├── Admin.jsx          # Pannello super-admin (gestione businesses/piani)
│   │   ├── AdminLogin.jsx     # Login dedicato admin
│   │   ├── Affiliates.jsx     # Portale affiliati
│   │   └── AffiliatesAuth.jsx # Login affiliati
│   │
│   ├── components/
│   │   ├── Logo.jsx           # Logo SVG PIUM riutilizzabile
│   │   ├── PWABanner.jsx      # Banner "installa app" su mobile
│   │   ├── SupportBot.jsx     # Chat FAQ flottante (carica da tabella `faq`)
│   │   │
│   │   ├── dashboard/
│   │   │   ├── Panoramica.jsx # Home dashboard: statistiche, prossimo appuntamento
│   │   │   ├── EditorSito.jsx # Editor blocchi CMS del mini-sito
│   │   │   ├── Servizi.jsx    # CRUD servizi + galleria foto
│   │   │   ├── Social.jsx     # Generazione e gestione bozze social con AI
│   │   │   ├── Recensioni.jsx # Gestione recensioni clienti
│   │   │   ├── Promemoria.jsx # Task/reminder con priorità e scadenza
│   │   │   ├── Agenda.jsx     # Calendario appuntamenti + gestione prenotazioni pending
│   │   │   └── Orari.jsx      # Gestione orari di apertura (componente interno)
│   │   │
│   │   └── public/
│   │       └── BookingSection.jsx  # Form prenotazione online (sul mini-sito pubblico)
│   │
│   └── lib/
│       ├── supabase.js        # Client Supabase (singleton)
│       ├── claude.js          # Chiamata alla Edge Function claude-proxy
│       ├── notifications.js   # API Web Notifications: schedule, test, nuova prenotazione
│       ├── pushSubscription.js# VAPID: subscribe/unsubscribe/isPushSubscribed
│       └── activityLog.js     # Fire-and-forget insert su tabella activity_log
│
├── supabase/
│   ├── schema.sql             # Schema completo (stato finale da usare su progetto nuovo)
│   ├── migrations/            # Storico modifiche cronologico (vedi §6)
│   └── functions/
│       ├── claude-proxy/      # Edge Function: proxy sicuro a Claude API
│       └── notify-new-booking/# Edge Function: Web Push su nuova prenotazione
│
├── .env                       # Variabili locali (non committare)
└── vite.config.js             # Vite: plugin React + Tailwind
```

---

## 3. Route Frontend

| Path | Componente | Accesso | Descrizione |
|---|---|---|---|
| `/` | `Landing` | Pubblico (redirect se autenticato) | Homepage marketing |
| `/auth` | `Auth` | Pubblico (redirect se autenticato) | Login e registrazione email/password |
| `/onboarding` | `Onboarding` | Autenticato senza business | Wizard creazione business: nome, categoria, contatti, generazione AI sito |
| `/dashboard` | `Dashboard` | Autenticato con business | Shell con sidebar; sezione default `panoramica` |
| `/dashboard?s=panoramica` | `Panoramica` | — | Statistiche, prossimo appuntamento, activity log |
| `/dashboard?s=editor` | `EditorSito` | — | Editor blocchi CMS del mini-sito (hero, about, servizi, gallery, faq…) |
| `/dashboard?s=servizi` | `Servizi` | — | CRUD servizi con prezzo, durata, galleria multi-foto |
| `/dashboard?s=social` | `Social` | — | Generazione bozze social AI, approvazione, archivio |
| `/dashboard?s=recensioni` | `Recensioni` | — | Moderazione recensioni, risposta titolare |
| `/dashboard?s=promemoria` | `Promemoria` | — | Lista task con priorità alta/media/bassa e scadenza |
| `/dashboard?s=agenda` | `Agenda` | — | Calendario appuntamenti + pannello prenotazioni pending da confermare |
| `/settings` | `Settings` | Autenticato | Cambio password, impostazioni notifiche, toggle Web Push |
| `/admin` | `Admin` | `app_metadata.role = 'admin'` | Lista businesses, modifica piano/stato, impersona |
| `/x-admin-login` | `AdminLogin` | Pubblico | Login dedicato per admin (non usa PublicRoute) |
| `/affiliates` | `Affiliates` | Autenticato come affiliato | Dashboard affiliato: link referral, lista clienti, commissioni |
| `/affiliates/auth` | `AffiliatesAuth` | Pubblico | Login/registrazione affiliati |
| `/site/:slug` | `PublicSite` | Pubblico | Mini-sito attività (URL legacy, mantenuto per backward compat) |
| `/:slug` | `PublicSite` | Pubblico | Mini-sito attività (URL attuale es. `/mario-parrucchiere-87pb`) |
| `/ref/:code` | `RefRedirect` | Pubblico | Salva codice referral in `localStorage('pium_ref')` e redirect a `/auth` |

**Nota routing:** React Router v7, le route statiche (es. `/admin`) hanno priorità su `/:slug` grazie all'ordine di dichiarazione in `App.jsx`.

---

## 4. Variabili d'Ambiente

### Frontend (`.env` + Vercel Environment Variables)

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `VITE_SUPABASE_URL` | Sì | URL progetto Supabase (es. `https://xxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Sì | Chiave pubblica Supabase (`anon`) |
| `VITE_VAPID_PUBLIC_KEY` | Sì (Web Push) | Chiave pubblica VAPID per Web Push (generata con `npx web-push generate-vapid-keys`) |

### Edge Functions (Supabase Secrets — Dashboard → Edge Functions → Secrets)

| Secret | Funzione | Descrizione |
|---|---|---|
| `SUPABASE_URL` | tutte | Automatico in Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | tutte | Automatico in Supabase |
| `SUPABASE_ANON_KEY` | `claude-proxy` | Automatico in Supabase |
| `CLAUDE_API_KEY` | `claude-proxy` | Chiave API Anthropic |
| `VAPID_PUBLIC_KEY` | `notify-new-booking` | Stessa chiave del frontend |
| `VAPID_PRIVATE_KEY` | `notify-new-booking` | Chiave privata VAPID (mai esposta al client) |

---

## 5. Stato Supabase

### 5.1 Tabelle e Colonne

#### `businesses`
La tabella centrale: un'attività per utente. Il titolare interagisce solo con il proprio record.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | `uuid_generate_v4()` |
| `user_id` | uuid FK → `auth.users` | `on delete cascade` |
| `name` | text NOT NULL | Nome dell'attività |
| `slug` | text UNIQUE | URL pubblico es. `/mario-parrucchiere-87pb` |
| `category` | text | Categoria libera (es. "Parrucchiere") |
| `description` | text | Descrizione generata da AI o manuale |
| `address` | text | |
| `city` | text | |
| `phone` | text | |
| `whatsapp` | text | Numero WhatsApp (aggiunto con migration 20260422) |
| `email` | text | |
| `website` | text | |
| `logo_url` | text | URL logo su Supabase Storage |
| `cover_url` | text | URL immagine copertina |
| `profile_image` | text | URL foto profilo (aggiunta con migration 20260507) |
| `instagram_url` | text | (aggiunta con migration 20260507) |
| `facebook_url` | text | (aggiunta con migration 20260507) |
| `business_type_custom` | text | Categoria personalizzata libera |
| `plan` | text | `trial \| free \| starter \| pro` (default `trial`, aggiunta migration 20260423) |
| `status` | text | `trial \| active \| expired \| suspended` — gestito da admin |
| `is_active` | boolean | Default `true`; se `false` il mini-sito non è visibile |
| `ai_calls_month` | int | Contatore chiamate AI nel mese corrente |
| `ai_calls_total` | int | Contatore chiamate AI totali |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Auto-aggiornato da trigger `trg_businesses_updated_at` |

#### `services`
Servizi/prodotti offerti da un'attività. Usati nel booking online e nel mini-sito.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | `on delete cascade` |
| `name` | text NOT NULL | |
| `description` | text | |
| `price` | numeric(10,2) | |
| `price_label` | text | Es. "a partire da", "fisso" |
| `duration_min` | int | Durata in minuti (usata nel booking per calcolare slot occupati) |
| `image_url` | text | URL immagine servizio |
| `is_available` | boolean | Default `true`; se `false` non appare nel booking |
| `sort_order` | int | Ordinamento manuale |
| `created_at` / `updated_at` | timestamptz | |

#### `site_content`
Blocchi CMS del mini-sito. Un record per block_key per business.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | `on delete cascade` |
| `block_key` | text NOT NULL | Es. `hero`, `about`, `cta`, `gallery`, `faq`, `hours`, `booking` |
| `title` | text | Titolo del blocco |
| `body` | text | Testo principale (Markdown o plain) |
| `cta_label` | text | Label pulsante call-to-action |
| `cta_url` | text | URL pulsante call-to-action |
| `image_url` | text | Immagine del blocco |
| `metadata` | jsonb | Campi extra liberi (es. array foto galleria, lista FAQ) |
| `is_published` | boolean | Default `false` — nota: la policy RLS pubblica usa `using(true)` (vedi §5.2) |
| `created_at` / `updated_at` | timestamptz | |
| UNIQUE | `(business_id, block_key)` | Un solo blocco per tipo per business |

#### `social_drafts`
Bozze post social, generate con AI o scritte manualmente.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | |
| `platform` | text | `instagram \| facebook \| linkedin \| x \| tiktok \| generic` |
| `content` | text NOT NULL | Testo del post |
| `hashtags` | text[] | Array hashtag |
| `image_url` | text | |
| `status` | text | `draft \| approved \| scheduled \| published \| archived` |
| `scheduled_at` | timestamptz | |
| `published_at` | timestamptz | |
| `ai_generated` | boolean | |
| `ai_prompt` | text | Prompt usato per la generazione |
| `created_at` / `updated_at` | timestamptz | |

#### `reviews`
Recensioni clienti. Possono essere inserite manualmente dal titolare o da fonti esterne.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | |
| `author_name` | text NOT NULL | |
| `author_avatar` | text | URL avatar |
| `rating` | smallint | 1–5 (check constraint) |
| `body` | text | Testo recensione |
| `source` | text | `manual \| google \| tripadvisor \| facebook \| yelp` |
| `source_id` | text | ID originale della piattaforma sorgente |
| `is_visible` | boolean | Default `true`; se `false` non appare nel mini-sito |
| `reply` | text | Risposta del titolare |
| `replied_at` | timestamptz | |
| `reviewed_at` | timestamptz | Data originale della recensione |
| `created_at` / `updated_at` | timestamptz | |

#### `reminders`
Promemoria/task per il titolare. Con priorità, scadenza e collegamento opzionale a un'entità.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | |
| `user_id` | uuid FK → `auth.users` | |
| `title` | text NOT NULL | |
| `notes` | text | |
| `due_at` | timestamptz | Scadenza |
| `priority` | text | `low \| medium \| high` |
| `status` | text | `pending \| done \| dismissed` |
| `related_type` | text | Es. `social_draft`, `review`, `service` |
| `related_id` | uuid | FK logica all'entità correlata |
| `created_at` / `updated_at` | timestamptz | |

#### `analytics_events`
Tracking eventi mini-sito (pageview, click CTA, ecc.). Insert pubblico, read solo owner.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | |
| `event_type` | text | Es. `page_view`, `cta_click`, `contact_click` |
| `page` | text | Path o slug |
| `referrer` | text | |
| `user_agent` | text | |
| `session_id` | text | |
| `properties` | jsonb | Dati extra |
| `occurred_at` | timestamptz | |

#### `employees`
Staff dell'attività. Opzionalmente assegnati agli appuntamenti.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | |
| `name` | text NOT NULL | |
| `color` | text | Hex color per il calendario, default `#94a3b8` |
| `created_at` | timestamptz | |

#### `appointments`
Appuntamenti in agenda. Creati manualmente dal titolare o automaticamente da `owner_confirm_booking`.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | |
| `employee_id` | uuid FK → `employees` | `on delete set null`; nullable |
| `client_name` | text NOT NULL | |
| `date` | date NOT NULL | |
| `start_time` | time NOT NULL | Default `09:00` |
| `duration_minutes` | int NOT NULL | Default 60 |
| `price` | numeric(10,2) | |
| `notes` | text | |
| `booking_id` | uuid FK → `bookings` | `on delete set null`; nullable. Collegamento alla prenotazione originale (per link WhatsApp reminder) |
| `completed` | boolean | Default `false` |
| `created_at` / `updated_at` | timestamptz | |

#### `bookings`
Prenotazioni online inviate dai clienti. Il flusso è: `pending` → `confirmed` (tramite `owner_confirm_booking`) oppure `pending` → `cancelled`.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | |
| `service_id` | uuid FK → `services` | `on delete set null`; nullable |
| `customer_name` | text NOT NULL | |
| `customer_email` | text NOT NULL | Salvato lowercase |
| `customer_phone` | text | Opzionale |
| `appointment_date` | date NOT NULL | |
| `appointment_time` | time NOT NULL | |
| `status` | text | `pending \| confirmed \| cancelled`; default `pending` in V2 |
| `created_at` | timestamptz | |

**Nota:** La tabella è abilitata su Supabase Realtime (migration 20260514). La Dashboard ascolta INSERT/UPDATE per aggiornare il badge pending in tempo reale.

#### `push_subscriptions`
Sottoscrizioni Web Push dei titolari. Un record per dispositivo per utente.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → `auth.users` | `on delete cascade` |
| `business_id` | uuid FK → `businesses` | `on delete cascade` |
| `endpoint` | text NOT NULL | URL endpoint push del browser |
| `subscription` | jsonb NOT NULL | Oggetto `PushSubscription` completo (`{endpoint, keys: {p256dh, auth}}`) |
| `created_at` | timestamptz | |
| UNIQUE | `(user_id, endpoint)` | Un solo record per browser per utente |

#### `activity_log`
Log attività titolare (es. "hai aggiunto un servizio", "hai risposto a una recensione"). Insert fire-and-forget da `src/lib/activityLog.js`.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | |
| `user_id` | uuid FK → `auth.users` | |
| `type` | text | Tipo evento |
| `description` | text | Descrizione human-readable |
| `created_at` | timestamptz | |

#### `faq`
Domande e risposte per il SupportBot flottante. Read-only dal client.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `categoria` | text | Categoria FAQ (es. "Sito", "Agenda", "Social") |
| `domanda` | text | |
| `risposta` | text | |
| `sort_order` | int | |

---

### 5.2 Policy RLS per Tabella

| Tabella | Policy | Operazione | Condizione |
|---|---|---|---|
| `businesses` | owner access | ALL | `auth.uid() = user_id` |
| `businesses` | public read | SELECT | `is_active = true` |
| `businesses` | admin read all | SELECT | `auth.jwt()->'app_metadata'->>'role' = 'admin'` |
| `businesses` | admin update all | UPDATE | `auth.jwt()->'app_metadata'->>'role' = 'admin'` |
| `services` | owner access | ALL | business owner via join |
| `services` | public read | SELECT | `is_available = true` |
| `site_content` | owner access | ALL | business owner via join |
| `site_content` | public read | SELECT | `true` — tutti i blocchi visibili (**migration 20260515** ha rimosso il filtro `is_published`) |
| `social_drafts` | owner access | ALL | business owner via join |
| `reviews` | owner access | ALL | business owner via join |
| `reviews` | public read | SELECT | `is_visible = true` |
| `reminders` | owner access | ALL | `auth.uid() = user_id` |
| `analytics_events` | owner read | SELECT | business owner via join |
| `analytics_events` | public insert | INSERT | `true` — chiunque può tracciare |
| `employees` | owner access | ALL | business owner via join |
| `appointments` | owner access | ALL | business owner via join |
| `bookings` | owner read | SELECT | business owner via join |
| `bookings` | owner update | UPDATE | business owner via join |
| `push_subscriptions` | owner | ALL | `auth.uid() = user_id` |

**Nota:** Le RPC `create_booking` e `get_taken_slots` usano `SECURITY DEFINER` e bypass RLS, consentendo chiamate da utenti anonimi (`anon` role).

---

### 5.3 RPC (Stored Functions)

#### `get_taken_slots(p_business_id uuid, p_date date)`
- **Tipo:** `SECURITY DEFINER`, SQL puro
- **Grant:** `anon, authenticated`
- **Cosa fa:** Restituisce `(start_time, duration_minutes)` degli appuntamenti esistenti per un business in una data, senza esporre nomi clienti o note. Usato da `BookingSection.jsx` per calcolare gli slot disponibili nel calendario booking pubblico.

#### `create_booking(p_business_id, p_service_id, p_customer_name, p_customer_email, p_customer_phone, p_date, p_time)`
- **Tipo:** `SECURITY DEFINER`, PL/pgSQL
- **Grant:** `anon, authenticated`
- **Cosa fa:** Crea una nuova prenotazione con `status='pending'`. Non richiede sessione autenticata. Validazioni interne:
  1. Servizio deve essere `is_available=true` e appartenere al business
  2. Antiabuse: un solo `pending` per email per business
- **Restituisce:** UUID della nuova prenotazione

#### `owner_confirm_booking(p_booking_id uuid)`
- **Tipo:** `SECURITY DEFINER`, PL/pgSQL
- **Grant:** `authenticated` (solo titolare)
- **Cosa fa:** Atomicamente:
  1. Verifica che il titolare autenticato sia il proprietario del business della prenotazione
  2. Verifica che lo status sia `pending`
  3. Aggiorna `bookings.status = 'confirmed'`
  4. Crea un record in `appointments` con durata e prezzo dal servizio; include `booking_id` per il link WhatsApp reminder
- **Errori:** lancia eccezione se prenotazione non trovata o non pending

#### `confirm_booking(...)` *(deprecata)*
- Rimossa con migration `20260512_booking_v2.sql`. Era la RPC V1 che richiedeva OTP via `auth.email()`. Non esiste più in produzione.

---

### 5.4 Edge Functions

#### `claude-proxy`
- **Path:** `supabase/functions/claude-proxy/index.ts`
- **Trigger:** Chiamata HTTP da client autenticato (via `src/lib/claude.js`)
- **Cosa fa:**
  1. Verifica JWT Supabase dell'utente
  2. Legge `prompt` dal body JSON
  3. Chiama `api.anthropic.com/v1/messages` con `claude-sonnet-4-6` (max 1000 token)
  4. Incrementa `ai_calls_month` e `ai_calls_total` su `businesses` (fire-and-forget)
  5. Restituisce `{ text: string }`
- **Secrets necessari:** `CLAUDE_API_KEY`
- **Usata da:** `Onboarding.jsx` (generazione descrizione AI), `EditorSito.jsx`, `Social.jsx`

#### `notify-new-booking`
- **Path:** `supabase/functions/notify-new-booking/index.ts`
- **Trigger:** Database Webhook su `bookings` evento `INSERT`
- **Cosa fa:**
  1. Riceve il payload del webhook `{ record: booking }`
  2. Se `booking.status !== 'pending'` esce (skip)
  3. Carica tutte le `push_subscriptions` per il `business_id`
  4. Imposta VAPID credentials con `web-push`
  5. Invia Web Push a ogni device del titolare con titolo "Nuova prenotazione" e nome cliente
  6. Rimuove automaticamente le sottoscrizioni con risposta `410 Gone` (dispositivo non più registrato)
- **Secrets necessari:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- **Payload notifica push:**
  ```json
  {
    "title": "Nuova prenotazione",
    "body": "<customer_name> ha prenotato",
    "data": { "bookingId": "<uuid>", "url": "/dashboard?s=agenda" }
  }
  ```

---

### 5.5 Realtime

| Tabella | Abilitata | Usata da | Motivo |
|---|---|---|---|
| `bookings` | Sì (migration 20260514) | `Dashboard.jsx` | Badge pending in tempo reale; notifica push in-app su nuova prenotazione |

**Subscription in `Dashboard.jsx`:**
- `INSERT` su `bookings` con filtro `business_id=eq.{business.id}` → incrementa `pendingCount`, mostra notifica in-app
- `UPDATE` su `bookings` con filtro `business_id=eq.{business.id}` → richiede count aggiornato
- Fallback: `visibilitychange` event richiede il count fresh quando il tab torna visibile

---

### 5.6 Storage

Supabase Storage è usato per immagini. I bucket usati:

| Bucket | Accesso | Contenuto |
|---|---|---|
| `business-images` | Pubblico | Logo, copertina, foto profilo, immagini galleria servizi |

Le URL sono salvate direttamente nei campi `image_url`, `logo_url`, `cover_url`, `profile_image` delle tabelle corrispondenti.

---

## 6. Ordine Migration su Progetto Nuovo

Per ricostruire il database Supabase da zero, esegui in questo ordine:

### Step 1 — Schema base
Esegui `supabase/schema.sql` nella SQL Editor di Supabase. Crea:
- Tutte le tabelle: `businesses`, `services`, `site_content`, `social_drafts`, `reviews`, `reminders`, `analytics_events`, `employees`, `appointments`, `bookings`
- Trigger `set_updated_at` su tutte le tabelle
- RLS e policy base
- RPC: `get_taken_slots`, `create_booking`, `owner_confirm_booking`

### Step 2 — Migration incrementali (in ordine cronologico)

```
20260422_add_whatsapp_to_businesses.sql
  → ALTER businesses: aggiunge colonna whatsapp

20260423_admin_panel.sql
  → ALTER businesses: aggiunge colonna plan (trial|free|starter|pro)
  → CREATE POLICY "businesses: admin read all" e "businesses: admin update all"

20260507_profile_social_custom_category.sql
  → ALTER businesses: aggiunge profile_image, business_type_custom, instagram_url, facebook_url

20260509_bookings.sql
  → Crea tabella bookings (V1 con OTP)
  → RPC get_taken_slots, confirm_booking (V1 — richiede auth.email())
  ⚠️ confirm_booking V1 viene rimossa nel prossimo step

20260512_booking_v2.sql
  → DROP FUNCTION confirm_booking (V1 con OTP)
  → CREATE OR REPLACE FUNCTION create_booking (anon, nessuna sessione)
  → CREATE OR REPLACE FUNCTION owner_confirm_booking (solo titolare autenticato)

20260513_booking_whatsapp.sql
  → ALTER appointments: aggiunge colonna booking_id (FK → bookings)
  → CREATE INDEX idx_appointments_booking_id
  → CREATE OR REPLACE FUNCTION owner_confirm_booking (aggiornata per salvare booking_id)

20260514_realtime_bookings.sql
  → ALTER PUBLICATION supabase_realtime ADD TABLE bookings

20260515_site_content_public_read.sql
  → DROP POLICY "site_content: public read"
  → CREATE POLICY "site_content: public read" ON site_content FOR SELECT USING (true)
  (rimuove il filtro is_published — tutti i blocchi sono visibili ai visitatori)

20260516_push_subscriptions.sql
  → CREATE TABLE push_subscriptions (id, user_id, business_id, endpoint, subscription, created_at)
  → UNIQUE (user_id, endpoint)
  → ALTER TABLE: enable RLS
  → CREATE POLICY "push_subscriptions: owner" (owner full access)
```

### Step 3 — Tabelle non in migrations (create direttamente in Supabase)

Le seguenti tabelle esistono in produzione ma non hanno file di migration locale. Ricreale manualmente se necessario:

- **`activity_log`** — colonne: `id uuid PK`, `business_id uuid FK`, `user_id uuid FK`, `type text`, `description text`, `created_at timestamptz`
- **`faq`** — colonne: `id uuid PK`, `categoria text`, `domanda text`, `risposta text`, `sort_order int`
- **`businesses.status`** — colonna `status text` su businesses (`trial|active|expired|suspended`), aggiunta direttamente dall'admin
- **`businesses.ai_calls_month`** e **`businesses.ai_calls_total`** — colonne int su businesses per tracking utilizzo AI

### Step 4 — Realtime
Nel Dashboard Supabase → Database → Replication, assicurarsi che `bookings` sia abilitata per Realtime (già incluso nella migration 20260514, ma verificare che la `supabase_realtime` publication includa la tabella).

### Step 5 — Edge Functions
Deploy via Supabase CLI:
```bash
supabase functions deploy claude-proxy
supabase functions deploy notify-new-booking
```

### Step 6 — Database Webhook
Dashboard Supabase → Database → Webhooks → Create:
- **Nome:** `on-new-booking`
- **Table:** `bookings`, evento `INSERT`
- **URL:** `https://<project-ref>.supabase.co/functions/v1/notify-new-booking`
- **HTTP Headers:** `Authorization: Bearer <service_role_key>`

---

## 7. Web Push VAPID — Setup Manuale

Il sistema Web Push richiede 4 step manuali una tantum:

**1. Genera le chiavi VAPID:**
```bash
npx web-push generate-vapid-keys
# Output:
# Public Key:  BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxJo=
# Private Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=
```

**2. Aggiungi la chiave pubblica al frontend** (`.env` locale + Vercel):
```
VITE_VAPID_PUBLIC_KEY=<Public Key>
```

**3. Aggiungi entrambe le chiavi ai Supabase Secrets** (Dashboard → Edge Functions → `notify-new-booking` → Secrets):
```
VAPID_PUBLIC_KEY  = <Public Key>
VAPID_PRIVATE_KEY = <Private Key>
```

**4. Configura il Database Webhook** (vedi §6, Step 6).

**Flusso completo:**
```
Cliente prenota
    ↓
create_booking RPC  →  INSERT in bookings (status='pending')
    ↓
Supabase Database Webhook  →  Edge Function notify-new-booking
    ↓
Edge Function carica push_subscriptions per business_id
    ↓
web-push.sendNotification() per ogni device
    ↓
Service Worker (public/sw.js) riceve 'push' event
    ↓
showNotification() → titolare vede notifica anche con browser chiuso
    ↓
Click notifica → apre /dashboard?s=agenda
```

**Parallelo:** Supabase Realtime aggiorna il badge pending nel tab aperto simultaneamente al Web Push, garantendo consistenza visiva se il titolare ha il browser aperto.

---

## 8. Ruoli e Autenticazione

### Utenti normali (titolari)
- Autenticazione via `supabase.auth` email/password
- Nessun `app_metadata.role` speciale
- Accesso a `/dashboard`, `/settings`, `/affiliates`

### Admin
- `app_metadata.role = 'admin'` (impostato da Supabase Dashboard → Authentication → Users → Edit User Metadata)
- Accesso a `/admin` (pannello di gestione businesses)
- Login dedicato su `/x-admin-login`
- Può leggere e modificare qualsiasi business (policy RLS admin)

### Utenti anonimi (`anon`)
- Possono chiamare `create_booking` e `get_taken_slots` (SECURITY DEFINER bypass RLS)
- Possono inserire eventi `analytics_events`
- Possono leggere `businesses` (is_active=true), `services` (is_available=true), `reviews` (is_visible=true), `site_content` (tutti i blocchi)

---

## 9. PWA e Service Worker

**File:** `public/sw.js`

**Strategia cache:** Network-first con fallback su cache per le sole risorse della stessa origin. Richieste a Supabase e API esterne non vengono cachate.

**Versione cache:** `pium-v2` — incrementare per invalidare la cache su aggiornamenti major.

**Gestione Push:**
- `push` event: legge `e.data.json()`, chiama `registration.showNotification()` con azioni, icona e `data`
- `notificationclick` event:
  - Action `complete`: manda `postMessage({ type: 'MARK_COMPLETE', appointmentId })` al tab dashboard aperto
  - Click normale: apre `data.url` se presente, altrimenti `/dashboard`; focalizza tab esistente se disponibile

**iOS:** La PWA deve essere installata tramite "Aggiungi a schermo Home" per ricevere Web Push su iOS 16.4+. La policy `userVisibleOnly: true` è obbligatoria per tutte le piattaforme.
