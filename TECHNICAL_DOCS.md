# PIUM — Documentazione Tecnica

> Documento aggiornato al 2026-06-18. Permette a un tecnico senza contesto di capire l'intero progetto e ricostruire l'ambiente Supabase da zero.

---

## Aggiornamento 2026-06-18

**Sessione: commissioni affiliati automatiche, capacità booking multi-posto, UX dashboard, audit pre-lancio**

Cinque commit, tutti in produzione su `master`.

### Nuove funzionalità

**feat(affiliates)** `a80de07` — Registro commissioni automatico via Stripe webhook.
- Nuova tabella `affiliate_commissions` (migration `20260610_affiliate_commissions.sql`): `id`, `affiliate_id FK→affiliates`, `business_id FK→businesses`, `stripe_invoice_id text UNIQUE`, `amount numeric(10,2) DEFAULT 25.00`, `month_number int 1–12`, `status (pending|paid|cancelled)`, `paid_at timestamptz`, `created_at`.
- `stripe-webhook/index.ts` estesa: su `invoice.paid`, verifica `businesses.affiliate_code` → carica affiliato (`status = 'approved'`) → conta commissioni esistenti (`< 12`) → inserisce riga con `month_number = existingCount + 1`.
- Costanti: `COMMISSION_AMOUNT = 25.00`, `COMMISSION_MONTHS_CAP = 12`. Cap di 12 mesi per coppia `(affiliate_id, business_id)`.
- Idempotente: `stripe_invoice_id UNIQUE` previene doppio inserimento su retry Stripe (codice errore `23505` ignorato silenziosamente).
- RLS: affiliato legge solo le proprie commissioni; admin legge e aggiorna tutto; nessuna policy INSERT (solo webhook via service role bypassa RLS).

**feat(booking)** `d69e721` — Capacità postazioni multipla.
- Nuova colonna `businesses.booking_capacity int NOT NULL DEFAULT 1 CHECK (between 1 and 50)` (migration `20260610_booking_capacity.sql`).
- `Orari.jsx`: aggiunto campo input per la capacità nella sezione impostazioni orari.
- `get_taken_slots` v2 (DROP+RECREATE): ora include anche i booking con `status = 'pending'` (`UNION ALL` con `bookings JOIN services` per durata; fallback 60 min se servizio non trovato). Prima includeva solo `appointments`.
- `create_booking` v3 (DROP+RECREATE): aggiunge check capacità — conta slot sovrapposti confermati + pending (`get_taken_slots`), confronta con `booking_capacity`; lancia `'Orario non più disponibile'` se `count >= capacity`. Stessa firma di v2 (`20260519_booking_services.sql`).
- `BookingSection.jsx`: sfrutta la nuova logica — un orario appare disponibile finché la capacità non è satura.
- `PublicSite.jsx`: aggiunto `booking_capacity` nel select businesses.

**feat(ux)** `6db955f` — URL sito copiabile in dashboard + favicon unificata.
- `Panoramica.jsx`: nuova card "Il tuo sito" (`https://${slug}.piumapp.com`) con pulsanti Copia (feedback visivo 2s) e Apri.
- `EditorSito.jsx`: link "Vedi sito pubblico" corretto da `www.piumapp.com/site/${slug}` → `${slug}.piumapp.com`; pulsante Copia aggiunto accanto.
- `Social.jsx`: rimossa istruzione "Includi sempre..." dal prompt AI; URL `${slug}.piumapp.com` aggiunto via codice post-generazione (solo se non già presente nel testo, evita doppioni). Prefisso: `📍 Prenota su:`.
- `Recensioni.jsx`: `buildReplyPrompt` include `- Sito: ${slug}.piumapp.com` + istruzione finale "Quando naturale, chiudi con un invito a prenotare o visitare il sito".
- **fix(reviews)**: `togglePublish` scriveva `.update({ published: next })` su un campo inesistente nello schema — l'update su Supabase aggiornava 0 righe silenziosamente. Corretta in `.update({ is_visible: next })`. Tutti i 5 riferimenti a `.published` convertiti a `.is_visible`. Aggiunta gestione errore con toast rosso.
- Favicon unificata: `index.html` usa `.ico` + `.png` + `apple-touch-icon` (rimosso `favicon.svg`). Rimosse 4 righe di injection dinamica da `main.jsx`. `vercel.json`: aggiunto no-cache per `favicon-32.png`.

**fix(favicon)** `5379ac0` — Rigenerazione corretta dei file favicon.
- La prima generazione (`6db955f`) era corrotta: `scripts/gen-favicon.mjs` usava un decoder PNG puro Node.js che ignorava i filtri di riga PNG (Sub/Up/Average/Paeth), producendo output quasi bianco (pixel delta-encoded interpretati come assoluti).
- Riscritto con `sharp` + `png-to-ico` (devDependencies): genera 16×16, 32×32, 48×48 da `public/icon-512.png`; `.ico` risultante contiene 3 immagini BMP DIB (~15 kB, formato universalmente supportato). `favicon-32.png`: 1782 byte corretti (era 351 corrotto).
- Installazione fallita inizialmente con `npm i -D sharp png-to-ico` per errore SSL aziendale; risolto con `--strict-ssl false`.

**feat(admin)** `4a6d5c9` — Pannello admin affiliati collegato al registro commissioni.
- `loadAffiliates`: batch query in `Promise.all` su `affiliates` + `affiliate_commissions(affiliate_id, business_id, amount, status)`. Calcolo client-side: `Set<business_id>` per clienti distinti, somme separate per `earned` (pending+paid) e `pending`.
- Tabella: "Guadagnato" → "Maturato" + nuova colonna "Da pagare" (arancio se > 0). `total_clients`/`total_earned` del DB rimangono nella select ma non vengono più renderizzati.
- Drawer: nuova sezione "Commissioni" (caricata async all'apertura) con tabella per-riga: Cliente (embed `businesses(name)`), Mese (N/12), Importo, Stato (badge), Data. Se pendente > 0: totale "Da pagare" + pulsante "Segna come pagate" → conferma inline `"Confermi di aver pagato €X a [nome]?"` → UPDATE `status='paid', paid_at=now()` su tutte le righe pending dell'affiliato. Optimistic UI: righe diventano "Pagata" e colonna tabella si azzera senza reload.

### Audit pre-lancio (sola lettura — nessuna modifica)

Audit completo: sicurezza frontend, flussi critici, gestione errori, edge functions, RLS, UX, PWA.

| Severity | Problema | File |
|---|---|---|
| ✅ risolto | `togglePublish` scriveva su colonna inesistente `published` | `Recensioni.jsx` |
| 🟡 | `notify-new-booking`: `verify_jwt=false` senza shared secret — chiunque conosca l'URL può inviare push a qualsiasi business | `supabase/functions/notify-new-booking` |
| 🟡 | `PublicSite.jsx`: recensioni `is_visible=false` incluse nella risposta API — filtro solo client-side espone testo nel network tab | `PublicSite.jsx` + RLS `reviews` |
| 🟡 | `Auth.jsx`: `signUp()` naviga a `/onboarding` senza controllare `data.session` — bounce silenzioso se email confirmation abilitata | `Auth.jsx:91` |
| 🟡 | `Onboarding.jsx`: `handleSubmit` senza `try/finally` — spinner bloccato su eccezione di rete in `getUser()` | `Onboarding.jsx:129` |
| 🟡 | `Settings.jsx`, `ResetPassword.jsx`, `AffiliatesAuth.jsx`: messaggi errore Supabase raw (inglese) mostrati all'utente | righe 95/108, 40, 69 |
| 🟢 | Stripe polling: max 10s senza messaggio di recovery dopo timeout | `Dashboard.jsx:116` |
| 🟢 | `CACHE = 'pium-v2'` in `sw.js` — non viene mai bumped; invalidazione cache richiede modifica manuale | `public/sw.js` |

### Ancora da fare prima del lancio reale

- 🔴 **Stripe LIVE**: chiavi live (`pk_live_`/`sk_live_`) in `.env` + Vercel + Supabase Secrets; webhook live ricreato con endpoint produzione
- 🔴 **Documenti legali**: compilare i placeholder con dati societari reali (P.IVA, ragione sociale, PEC, foro)
- 🔴 **Cookie banner GDPR** (assente)
- 🟡 `VITE_VAPID_PUBLIC_KEY` nel `.env` frontend (attualmente vuoto — push notification lato client non funzionanti)
- 🟡 Fix: `Auth.jsx` — controllare `data.session` dopo `signUp()` e mostrare "Controlla la tua email" se nulla
- 🟡 Fix: `notify-new-booking` — aggiungere shared secret header per autenticare le chiamate in ingresso
- 🟡 Fix: RLS `reviews` — aggiungere policy `anon SELECT WHERE is_visible = true` (filtro server-side)
- 🟡 Fix errori in italiano: `Settings.jsx`, `ResetPassword.jsx`, `AffiliatesAuth.jsx`
- 🟡 Fix: `Onboarding.jsx` — wrappare `handleSubmit` in `try/finally` per evitare spinner bloccato su errore di rete
- 🟡 Verificare deliverability email auth Supabase (SMTP Resend) — durante i test un'email di conferma non è arrivata; sender default Supabase limite ~2/ora

---

## Aggiornamento 2026-06-08

**Sessione: fix pre-lancio + verifica billing Stripe end-to-end (modalità test)**

Cinque fix applicati, committati e in produzione:
- **fix(stripe)** `e31230b` — `success_url` corretto da `?activated=true` a `?stripe_success=true`. Il polling post-checkout in `Dashboard.jsx` ora si attiva: prima il parametro non combaciava e il banner trial non spariva mai dopo il pagamento.
- **feat(robustness)** `6977952` — React Error Boundary in `src/components/ErrorBoundary.jsx`, applicato a livello app (`App.jsx`, entrambi i rami: subdomain bypass + router) e a livello sezione dashboard (`Dashboard.jsx`, con `key={section}` per reset automatico al cambio sezione). Primo e unico class component del progetto.
- **fix(onboarding)** `e8340ba` — guard al mount in `Onboarding.jsx`: se l'utente ha già un business → redirect immediato a `/dashboard`, wizard mai mostrato (state `checking` che ritorna `null` finché la verifica non completa). Previene la creazione di business duplicati al riatterraggio su `/onboarding`.
- **fix(auth)** `5c5103b` — `emailRedirectTo` cambiato da `/onboarding` a `/auth` in `Auth.jsx`: il link di conferma email reindirizza al login.
- **feat(security)** `ff00847` — XSS guard sugli URL social: nuovo `src/lib/safeUrl.js` (`safeHref`, ammette solo protocolli `http`/`https`/`mailto`/`tel`), validazione in scrittura in `EditorSito.jsx`, sanitization in lettura in `PublicSite.jsx`.

Fix infrastruttura:
- `stripe-webhook` ridistribuita con `--no-verify-jwt` → risolto **errore 401** sul webhook. Il `config.toml` aveva già `verify_jwt = false` ma il deploy precedente non lo applicava. Sicurezza garantita dalla verifica firma HMAC Stripe, non dal JWT Supabase. Nessuna modifica al codice della funzione.

**Billing Stripe verificato END-TO-END (test) — FUNZIONANTE:**
Registrazione → conferma email (bloccante) → onboarding → pagamento carta test `4242` → webhook 200 → DB `status='active'`, `plan='active'`, `stripe_subscription_id` salvato → banner trial sparito in automatico con messaggio "Pagamento completato! Il tuo piano è ora attivo". Confermato sia con reinvio evento sia con pagamento fresco (polling automatico, nessun refresh).

**Verifiche di sicurezza:**
- `.env` gitignored (riga 3), mai committato in alcun branch della storia. Chiavi Stripe tutte in modalità test.
- Supabase Secrets completi: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_COUPON_FOUNDER`, `CLAUDE_API_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
- "Confirm email" attivo in Supabase Auth — blocco login pre-conferma verificato.

**Ancora da fare prima del lancio reale:**
- 🔴 Stripe LIVE: chiavi live (`pk_live_`/`sk_live_`) + webhook ricreato in modalità live + `VITE_STRIPE_PUBLIC_KEY` live
- 🔴 Documenti legali: compilare i placeholder con dati societari reali (P.IVA, ragione sociale, PEC, foro) — in lavorazione con il commercialista
- 🔴 Cookie banner GDPR (assente)
- 🟡 `VITE_VAPID_PUBLIC_KEY` nel `.env` frontend (push notifications)
- 🟡 Verificare deliverability email auth Supabase (SMTP Resend) — durante i test un'email di conferma non è arrivata; il sender di default Supabase ha limite ~2/ora

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
10. [Modifiche Architetturali 2026-05-13](#10-modifiche-architetturali--sessione-2026-05-13)
11. [Sicurezza — Decisioni e Pattern](#11-sicurezza--decisioni-e-pattern)
12. [Sistema Affiliati](#12-sistema-affiliati)
13. [Sottodomini — Quick Reference](#13-sottodomini--quick-reference)

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
| `/:slug` | `PublicSite` | Pubblico | Mini-sito attività (URL attuale es. `/bar-roma`). Accessibile anche su `bar-roma.piumapp.com` tramite Cloudflare Worker |
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
| `slug` | text UNIQUE | URL pubblico es. `mario-parrucchiere` (vecchio formato: `bar-roma-ffs6`). Generato da `generateSlug()` in Onboarding.jsx: cerca `bar-roma`, poi `bar-roma-2`, ecc. fino a trovare uno non occupato |
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
| `plan` | text | `trial \| free \| starter \| pro` (default `trial`, migration 20260423) |
| `plan_price` | numeric(10,2) | Prezzo mensile personalizzato concordato con il cliente (migration 20260518) |
| `status` | text | `trial \| active \| expired \| suspended` — gestito da admin (migration 20260518) |
| `trial_ends_at` | timestamptz | Scadenza periodo trial — editabile dall'admin nel drawer (migration 20260518) |
| `admin_notes` | text | Note interne visibili solo all'admin (migration 20260518) |
| `affiliate_code` | text | Codice affiliato che ha riferito questo cliente al signup (migration 20260520). Join: `affiliate_code = affiliates.code` |
| `booking_capacity` | int | Numero massimo di prenotazioni simultanee per lo stesso orario. Default `1`, range 1–50. (migration 20260610_booking_capacity) |
| `is_active` | boolean | Default `true`; se `false` il mini-sito non è visibile |
| `ai_calls_month` | int | Contatore chiamate AI nel mese corrente (deprecato — usa `ai_calls_month_display`) |
| `ai_calls_total` | int | Contatore chiamate AI totali |
| `ai_tokens_month` | int | Token Claude consumati nel mese corrente, usato per il gate 350k (migration 20260519) |
| `ai_calls_month_display` | int | Numero di chiamate AI questo mese — valore mostrato in Panoramica e Admin (migration 20260519) |
| `ai_unlimited` | boolean | Se `true` bypass rate limit — togglabile dall'admin nel drawer (migration 20260519) |
| `ai_reset_date` | date | Data dell'ultimo reset mensile token — confrontata con mese corrente nell'Edge Function (migration 20260519) |
| `opening_hours` | jsonb | Orari di apertura per giorno della settimana (formato v2 con `morning`/`afternoon` — vedi §10.1) |
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
| `service_names` | text | Nomi servizi selezionati separati da virgola (es. "Taglio, Barba"). Aggiunto con migration `20260519_booking_services.sql`. Visualizzato nel pannello pending di Agenda.jsx |
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

#### `contacts`
Contatti senza appuntamenti. Usata dalla sezione Clienti per gestire numeri importati da vCard, Android Contact Picker, o inseriti manualmente nel drawer. Merge con `appointments` per la rubrica unificata.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → `businesses` | `on delete cascade` |
| `name` | text NOT NULL | |
| `phone` | text | Usato come chiave di deduplicazione nella rubrica |
| `notes` | text | Note libere del titolare |
| `created_at` / `updated_at` | timestamptz | |
| UNIQUE | `(business_id, phone)` | Previene duplicati per stesso numero |

**RLS:** owner-only per tutte le operazioni. Migration: `20260527_create_contacts.sql`.

#### `appointment_services`
Collega più servizi a un singolo appuntamento. Congela il prezzo e la durata al momento della prenotazione (price/duration snapshot) per preservare lo storico anche se il servizio viene modificato successivamente.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `appointment_id` | uuid FK → `appointments` | `on delete cascade` |
| `service_id` | uuid FK → `services` | `on delete set null` |
| `price_snapshot` | numeric(10,2) | Prezzo al momento della prenotazione |
| `duration_snapshot` | int | Durata in minuti al momento della prenotazione |
| `created_at` | timestamptz | |

**RLS:** accesso tramite join con `appointments` → `businesses` (owner). Migration: `20260526_appointment_services.sql`.

#### `affiliate_commissions`
Registro commissioni affiliati. Una riga per ogni mensilità di abbonamento pagato da un cliente referenziato. Popolata automaticamente da `stripe-webhook` su `invoice.paid`; mai scritta dal frontend.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `affiliate_id` | uuid FK → `affiliates` | `on delete cascade` |
| `business_id` | uuid FK → `businesses` | `on delete cascade` |
| `stripe_invoice_id` | text NOT NULL UNIQUE | Previene doppio inserimento su retry Stripe |
| `amount` | numeric(10,2) | Default `25.00` (€) |
| `month_number` | int | Numero progressivo mensile per la coppia `(affiliate_id, business_id)`, range 1–12 |
| `status` | text | `pending \| paid \| cancelled` |
| `paid_at` | timestamptz | Popolato dall'admin al pagamento manuale |
| `created_at` | timestamptz | |

**RLS:** affiliato legge solo le proprie righe (`affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())`); admin legge e aggiorna tutto; nessuna policy INSERT (solo webhook con service role).
**Indici:** `(affiliate_id, status)`, `(business_id)`.

---

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
| `appointment_services` | owner access | ALL | business owner via join su `appointments` |
| `contacts` | owner access | ALL | business owner via join |
| `bookings` | owner read | SELECT | business owner via join |
| `bookings` | owner update | UPDATE | business owner via join |
| `push_subscriptions` | owner | ALL | `auth.uid() = user_id` |

**Nota:** Le RPC `create_booking` e `get_taken_slots` usano `SECURITY DEFINER` e bypass RLS, consentendo chiamate da utenti anonimi (`anon` role).

---

### 5.3 RPC (Stored Functions)

#### `get_taken_slots(p_business_id uuid, p_date date)` — v2
- **Tipo:** `SECURITY DEFINER`, SQL puro
- **Grant:** `anon, authenticated`
- **Cosa fa:** Restituisce `(start_time, duration_minutes)` degli slot occupati per un business in una data. **v2 (migration 20260610_booking_capacity):** include sia `appointments` esistenti sia booking con `status = 'pending'` (via `UNION ALL`; durata da `services.duration_min` o fallback 60 min). Usato da `BookingSection.jsx` e da `create_booking` per il check capacità.

#### `create_booking(p_business_id, p_service_id, p_customer_name, p_customer_email, p_date, p_time, p_customer_phone?, p_service_names?)` — v3
- **Tipo:** `SECURITY DEFINER`, PL/pgSQL
- **Grant:** `anon, authenticated`
- **Firma attuale** (dopo migration `20260610_booking_capacity.sql`, identica a v2):
  ```
  p_business_id uuid, p_service_id uuid,
  p_customer_name text, p_customer_email text,
  p_date date, p_time time,
  p_customer_phone text DEFAULT NULL,
  p_service_names text DEFAULT NULL
  ```
  ⚠️ I parametri con `DEFAULT` devono venire dopo quelli senza — vincolo PostgreSQL. La vecchia firma (con `p_customer_phone` prima di `p_date`) è stata droppata e ricreata.
- **Cosa fa:** Crea una nuova prenotazione con `status='pending'`. Non richiede sessione autenticata. Validazioni interne:
  1. Servizio deve essere `is_available=true` e appartenere al business
  2. Antiabuse: un solo `pending` per email per business
  3. **[v3]** Capacità: conta gli slot sovrapposti (confermati + pending) via `get_taken_slots`; se `count >= booking_capacity` → lancia `'Orario non più disponibile'`
- **Restituisce:** UUID della nuova prenotazione
- **`p_service_names`:** stringa opzionale con i nomi dei servizi selezionati (es. `"Taglio, Barba"`) — usata solo per display nel pannello pending

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
  1. Verifica JWT Supabase dell'utente → estrae `user_id`
  2. Legge `prompt` dal body JSON
  3. **Rate limiting:** SELECT su `businesses` per `user_id` — legge `ai_tokens_month`, `ai_reset_date`, `ai_unlimited`
  4. Controlla se il mese è cambiato (`ai_reset_date.slice(0,7) !== currentMonth`) → se sì, `effectiveTokens = 0`
  5. Se `effectiveTokens >= 350_000` e `!ai_unlimited` → risponde `429 { error: 'AI_LIMIT_REACHED' }`
  6. Chiama `api.anthropic.com/v1/messages` con `claude-sonnet-4-6` (max 1024 token output)
  7. Fire-and-forget UPDATE su `businesses`: incrementa `ai_tokens_month`, `ai_calls_month_display`, `ai_calls_total`; se reset mensile, azzera prima i contatori e aggiorna `ai_reset_date`
  8. Restituisce `{ text: string }`
- **Limiti:** 350.000 token/mese per cliente. Reset automatico il 1° del mese (rilevato dal confronto data). Clienti `ai_unlimited = true` non sono soggetti al limite.
- **Secrets necessari:** `CLAUDE_API_KEY`
- **Usata da:** `Onboarding.jsx` (generazione descrizione AI), `EditorSito.jsx`, `Social.jsx`, `Recensioni.jsx`
- **Errori propagati al client:** `AI_LIMIT_REACHED` (429), `Sessione scaduta` (401), `Servizio non disponibile` (500+)
- **Deployed con:** `npx supabase functions deploy claude-proxy --project-ref <ref>` con `SUPABASE_ACCESS_TOKEN` in env

#### `notify-new-booking`
- **Path:** `supabase/functions/notify-new-booking/index.ts`
- **Config:** `supabase/functions/notify-new-booking/config.toml` con `verify_jwt = false` — **obbligatorio**: il trigger PostgreSQL non invia JWT; senza questo file la funzione risponde 401 e non viene mai eseguita
- **Trigger:** Trigger PostgreSQL `on_new_booking` su `bookings AFTER INSERT` — chiama la funzione via `supabase_functions.http_request()` **senza** Authorization header
- **⚠️ Rideploy:** ogni volta che si modifica `index.ts` o `config.toml`, rieseguire:
  ```bash
  npx supabase functions deploy notify-new-booking --project-ref onkyhknchhlsmcknpinr --use-api --no-verify-jwt
  ```
  Dopo ogni rideploy, il titolare deve disattivare e riattivare il toggle "Notifiche push" in Settings per rinnovare la subscription (problema noto — da automatizzare in futuro)
- **Cosa fa:**
  1. Legge `body.record ?? body` — il trigger invia `to_jsonb(NEW)` come body raw (senza wrapper `record`)
  2. Se `booking.status !== 'pending'` esce (skip)
  3. Verifica secrets VAPID — risponde 500 se mancanti (log `[notify] ERRORE: VAPID_PUBLIC_KEY...`)
  4. Carica tutte le `push_subscriptions` per il `business_id`
  5. Imposta VAPID credentials con `web-push`
  6. Invia Web Push a ogni device del titolare con titolo "Nuova prenotazione" e nome cliente
  7. Rimuove automaticamente le sottoscrizioni con risposta `410 Gone` (dispositivo non più registrato)
  8. Risponde `{ sent, failed, stale }` — 500 solo se `sent=0` e `failed>0`
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

20260517_admin_rls_fix.sql
  → DROP + RECREATE POLICY "businesses: admin read all" (idempotente — fix 0 clienti in admin)
  → DROP + RECREATE POLICY "businesses: admin update all"

20260518_admin_notes.sql
  → ALTER businesses: aggiunge admin_notes text, status text, plan_price numeric, trial_ends_at timestamptz
  → (colonne già esistenti in produzione, migration documentale IF NOT EXISTS)

20260519_ai_rate_limit.sql
  → ALTER businesses: aggiunge ai_tokens_month int DEFAULT 0, ai_calls_month_display int DEFAULT 0, ai_unlimited boolean DEFAULT false, ai_reset_date date

20260520_affiliate_code.sql
  → ALTER businesses: aggiunge affiliate_code text
  → CREATE INDEX idx_businesses_affiliate_code WHERE affiliate_code IS NOT NULL

20260521_activity_log.sql
  → CREATE TABLE IF NOT EXISTS activity_log (id, business_id, user_id, type, description, created_at)
  → CREATE INDEX idx_activity_log_business_id
  → ALTER TABLE: enable RLS
  → CREATE POLICY "owner read", "owner insert", "admin read all"

20260524_client_phone.sql
  → ALTER appointments: aggiunge colonna client_phone text
  → CREATE OR REPLACE FUNCTION owner_confirm_booking: aggiornata per copiare customer_phone dalla prenotazione all'appuntamento creato

20260526_appointment_services.sql
  → CREATE TABLE appointment_services (id, appointment_id FK→appointments, service_id FK→services, price_snapshot numeric, duration_snapshot int, created_at)
  → CREATE INDEX idx_appointment_services_appointment_id
  → ALTER TABLE: enable RLS
  → CREATE POLICY "owner access" (via join appointments→businesses)

20260527_create_contacts.sql
  → CREATE TABLE contacts (id, business_id FK→businesses, name, phone, notes, created_at, updated_at)
  → UNIQUE (business_id, phone)
  → CREATE INDEX idx_contacts_business_id
  → ALTER TABLE: enable RLS
  → CREATE POLICY "owner access" (auth.uid() = businesses.user_id via join)

20260519_booking_services.sql
  → ALTER bookings: aggiunge colonna service_names text
  → DROP FUNCTION create_booking (vecchia firma con p_customer_phone prima di p_date)
  → CREATE FUNCTION create_booking con nuova firma (p_date, p_time prima dei parametri con DEFAULT)
  → GRANT EXECUTE sulla nuova firma ad anon, authenticated

20260519_fix_trigger_notify.sql  ← solo documentazione, già applicata manualmente
  → DROP TRIGGER IF EXISTS on_new_booking ON bookings
  → CREATE TRIGGER on_new_booking AFTER INSERT ON bookings
     che chiama supabase_functions.http_request() SENZA Authorization header
     (la funzione ha verify_jwt = false in config.toml)

20260610_affiliate_commissions.sql
  → CREATE TABLE affiliate_commissions (id, affiliate_id FK, business_id FK, stripe_invoice_id UNIQUE,
     amount numeric(10,2) DEFAULT 25.00, month_number int 1-12, status pending|paid|cancelled, paid_at, created_at)
  → CREATE INDEX idx_aff_comm_affiliate ON (affiliate_id, status)
  → CREATE INDEX idx_aff_comm_business ON (business_id)
  → ALTER TABLE: enable RLS
  → CREATE POLICY "aff_comm: affiliate read own" (affiliate_id IN proprie righe via user_id)
  → CREATE POLICY "aff_comm: admin read all" e "aff_comm: admin update all" (app_metadata.role = 'admin')
  ⚠️ Nessuna policy INSERT: l'unico writer è stripe-webhook via service role (bypass RLS)

20260610_booking_capacity.sql
  → ALTER businesses: aggiunge booking_capacity int NOT NULL DEFAULT 1 CHECK (between 1 and 50)
  → CREATE OR REPLACE FUNCTION get_taken_slots v2: UNION ALL con bookings pending (durata da services, fallback 60 min)
  → DROP FUNCTION create_booking (firma v2 — stessa firma, necessario drop per recreate)
  → CREATE FUNCTION create_booking v3: aggiunge check capacità (count slot sovrapposti >= booking_capacity → eccezione)
  → GRANT EXECUTE su create_booking v3 ad anon, authenticated
```

### Step 3 — Tabelle non in migrations (create direttamente in Supabase)

Le seguenti tabelle esistono in produzione ma non hanno file di migration locale. Ricreale manualmente se necessario:

- **`faq`** — colonne: `id uuid PK`, `categoria text`, `domanda text`, `risposta text`, `sort_order int`. Read-only dal client; popolata manualmente dalla Dashboard Supabase.
- **`affiliates`** — colonne: `id uuid PK`, `user_id uuid FK`, `name text`, `code text UNIQUE`, `status text` (`pending|active`), `total_earned numeric`, `total_pending numeric`, `created_at timestamptz`. Join con `businesses` via `businesses.affiliate_code = affiliates.code`.

> **Nota:** `activity_log` era precedentemente in questa lista — ora documentata in `20260521_activity_log.sql`.

### Step 4 — Realtime
Nel Dashboard Supabase → Database → Replication, assicurarsi che `bookings` sia abilitata per Realtime (già incluso nella migration 20260514, ma verificare che la `supabase_realtime` publication includa la tabella).

### Step 5 — Edge Functions
Deploy via Supabase CLI:
```bash
supabase functions deploy claude-proxy
supabase functions deploy notify-new-booking
```

### Step 6 — Database Webhook / Trigger
Il trigger è gestito via SQL (non tramite la UI Webhooks di Supabase). Esegui nella SQL Editor:

```sql
-- Da supabase/migrations/20260519_fix_trigger_notify.sql
DROP TRIGGER IF EXISTS on_new_booking ON public.bookings;

CREATE TRIGGER on_new_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://onkyhknchhlsmcknpinr.supabase.co/functions/v1/notify-new-booking',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
```

**⚠️ Non aggiungere Authorization header** — la funzione ha `verify_jwt = false` in `config.toml`. Con il JWT il trigger andrebbe comunque in 401 perché il service role key non viene passato correttamente dal trigger PostgreSQL.

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

**4. Crea il trigger SQL** (vedi §6, Step 6). Non usare la UI Database Webhooks — usare il trigger SQL direttamente.

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

**⚠️ Problema noto — re-subscription dopo rideploy:** ogni volta che si rideploya `notify-new-booking`, il titolare deve disattivare e riattivare il toggle "Notifiche push" in Settings per rinnovare la subscription. Da automatizzare in futuro con una logica di re-subscription automatica al mount di Settings.jsx.

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

---

## 10. Modifiche Architetturali — Sessione 2026-05-13

### 10.1 Struttura `businesses.opening_hours` (nuovo formato)

La colonna `opening_hours` (jsonb) su `businesses` supporta ora due fasce orarie per giorno.

**Nuovo formato (da Orari.jsx v2):**
```json
{
  "monday": {
    "closed": false,
    "morning":   { "open": "09:00", "close": "13:00", "active": true },
    "afternoon": { "open": "15:00", "close": "19:00", "active": true }
  },
  "sunday": {
    "closed": true,
    "morning":   { "open": "09:00", "close": "13:00", "active": true },
    "afternoon": { "open": "15:00", close": "19:00", "active": false }
  }
}
```

**Vecchio formato (ancora supportato — retrocompatibilità):**
```json
{
  "monday": { "open": "09:00", "close": "18:00", "closed": false }
}
```

**Migrazione lato client** (`Orari.jsx`, funzione `migrateDay`): se un giorno ha `open`/`close` al livello radice (vecchio formato), viene convertito automaticamente a `morning` attivo + `afternoon` inattivo. La conversione avviene solo in memoria al mount del componente; il DB viene aggiornato solo alla prima modifica del titolare.

**Lettura in PublicSite.jsx** (`formatDayHours`): gestisce entrambi i formati. Mostra `09:00 – 13:00 · 15:00 – 19:00` se entrambe le fasce sono attive, fascia singola se solo una è attiva.

**Lettura in Agenda.jsx** (`parseOpeningRanges`): converte il formato (vecchio o nuovo) in array `[[startMin, endMin], ...]` per il calcolo degli overlay di chiusura e per il check fuori-orario.

---

### 10.2 Prop `initialView` in `Agenda.jsx`

**Problema risolto:** race condition tra `React Router navigate()` e `React setState()` nella stessa call-stack. Se `setSection('agenda')` e `navigate(pathname, {state: {viewMode}})` venivano chiamati insieme, il componente `Agenda` poteva montarsi prima che `location.state` fosse aggiornato, leggendo il viewMode sbagliato.

**Soluzione:**
- `Dashboard.jsx` mantiene lo stato `agendaInitialView` (default `'day'`)
- La funzione `navigate_section(id, opts)` aggiorna `agendaInitialView` con `opts.view` **prima** di chiamare `setSection`
- `Agenda` riceve `initialView` come prop e chiama `useState(initialView)` — il valore è già corretto al momento del primo render, nessuna dipendenza da `location.state` per la selezione della vista

**File coinvolti:** `Dashboard.jsx` (stato + prop), `Agenda.jsx` (`function Agenda({ business, initialView = 'day' })`)

---

### 10.3 Griglia giornaliera `Agenda.jsx` — slot 30 minuti

**Costante:** `SLOT_H = 40` (px per slot da 30 minuti, dichiarata a livello modulo)

**Slot grid:**
- 48 slot totali (24 ore × 2) — ciascuno `height: SLOT_H`
- Label ore: 24 label, una ogni due slot (`height: SLOT_H * 2`)
- Solo le righe d'ora piena hanno bordo marcato (`ag-slot--hour`); le mezze ore sono tratteggiati (`ag-slot--half`)

**Posizionamento appuntamenti:**
```js
top    = (startMin / 30) * SLOT_H
height = Math.max((duration_minutes / 30) * SLOT_H, SLOT_H * 0.9)
```

**Scroll automatico:**
- Oggi: scorre all'ora corrente meno 1 ora (`(currentHour - 1) * 2 * SLOT_H`)
- Altro giorno: scorre all'inizio della prima fascia aperta (`ranges[0][0] / 30 * SLOT_H`)
- Deep-link da Panoramica con orario specifico: `(startMin - 60) / 30 * SLOT_H` (consumato via `scrollToTimeRef` — ref nullato dopo uso per evitare re-scroll)

---

### 10.4 Scadenza relativa nei promemoria

Aggiunta in `Promemoria.jsx` — solo logica frontend, nessuna modifica al DB.

- Stato locale: `dueDateMode: 'fixed' | 'relative'`, `relativeAmount: string`, `relativeUnit: 'days' | 'weeks' | 'months'`
- `calcRelativeDate(amount, unit)`: somma il periodo alla data di oggi e restituisce un oggetto `Date`
- Al salvataggio: se `dueDateMode === 'relative'`, `due_at` viene calcolata e salvata come `YYYY-MM-DD`; il DB riceve sempre una data assoluta
- `openEdit` resetta sempre `dueDateMode: 'fixed'` (la data già salvata nel DB è assoluta)

---

### 10.5 Sottodomini `nomeattivita.piumapp.com` — Architettura

**Problema:** Vercel non supporta wildcard subdomain routing con Cloudflare in modalità proxy. Non è possibile aggiungere `*.piumapp.com` come dominio Vercel e farlo passare per il proxy Cloudflare.

**Soluzione: Cloudflare Worker come proxy trasparente**

```
Visitatore → bar-roma.piumapp.com
    ↓
Cloudflare Worker (pium-subdomain-proxy)
    ↓  riscrive hostname a www.piumapp.com, mantiene path + query
fetch(https://www.piumapp.com/...)
    ↓
Vercel serve la SPA React
    ↓
PublicSite.jsx legge window.location.hostname = "bar-roma.piumapp.com"
    ↓
estrae "bar-roma" come slug → carica dati da Supabase
```

**File:** `cloudflare-worker.js` (root del progetto — da incollare nel Cloudflare Dashboard)

**Logica Worker:**
- `parts.length < 3` o `parts[0] === 'www'` → pass-through (no proxy)
- Altrimenti: `target.hostname = 'www.piumapp.com'`, tutto il resto (path, query, headers, body) invariato

**Configurazione Cloudflare:**
- Worker name: `pium-subdomain-proxy`
- Route: `*piumapp.com/*`
- DNS: record CNAME wildcard `*.piumapp.com → www.piumapp.com` (proxy arancione `🟠`)

**Rilevamento slug in `PublicSite.jsx`:**
```js
const { slug: paramSlug } = useParams()
const slug = (() => {
  const parts = window.location.hostname.split('.')
  return parts.length >= 3 && parts[0] !== 'www' ? parts[0] : paramSlug
})()
```
Se il visitatore arriva da `bar-roma.piumapp.com`, `slug = 'bar-roma'` (da hostname). Se arriva da `www.piumapp.com/bar-roma`, `slug = paramSlug` (da React Router). Entrambe le modalità di accesso caricano gli stessi dati.

---

### 10.6 Slug — Generazione Asincrona (`Onboarding.jsx`)

**Vecchio sistema:** `toSlug(name)` — aggiungeva 4 caratteri casuali (`Math.random().toString(36).slice(2, 6)`) senza verifica DB. Produceva URL come `bar-roma-ffs6`.

**Nuovo sistema:** `baseSlug(name)` + `generateSlug(name)` async.

```js
function baseSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')      // rimuove diacritici
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function generateSlug(name) {
  const base = baseSlug(name)
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const { data } = await supabase.from('businesses').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate  // slot libero
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`  // fallback dopo 50 tentativi
}
```

**Utilizzo in `handleSubmit`:**
```js
slug: await generateSlug(form.name.trim())
```

**Comportamento:** `bar-roma` → se occupato → `bar-roma-2` → `bar-roma-3` → … Fallback random solo dopo 50 collisioni (scenario praticamente impossibile).

---

## 11. Sicurezza — Decisioni e Pattern

### 11.1 Select esplicito su pagine pubbliche

`PublicSite.jsx` usa una select esplicita per evitare di esporre campi admin/billing al browser:

```js
.select('id, user_id, name, slug, category, business_type_custom, description, phone, whatsapp, email, address, city, profile_image, instagram_url, facebook_url, opening_hours')
```

Campi esclusi deliberatamente: `admin_notes`, `affiliate_code`, `ai_calls_*`, `ai_tokens_month`, `ai_unlimited`, `ai_reset_date`, `plan_price`, `plan`, `status`, `trial_ends_at`.

### 11.2 Gestione sessione scaduta in `claude.js`

`src/lib/claude.js` verifica la sessione **prima** di chiamare la Edge Function:

```js
const { data: { session } } = await supabase.auth.getSession()
if (!session?.access_token) {
  throw new Error('Sessione scaduta. Effettua di nuovo il login.')
}
```

Se la Edge Function risponde con errore HTTP, il messaggio è sempre tradotto in italiano (no status code esposto all'utente):
- `err.error` presente → propagato com'è (es. `AI_LIMIT_REACHED`)
- 401 → `"Sessione scaduta. Effettua di nuovo il login."`
- 500+ → `"Servizio temporaneamente non disponibile. Riprova tra poco."`
- altro → `"Errore di connessione. Riprova."`

### 11.3 Messaggi di errore Auth in italiano

`Auth.jsx` usa `translateError(msg)` che mappa gli errori Supabase in italiano. Il fallback restituisce `"Si è verificato un errore. Riprova tra poco."` invece del messaggio grezzo in inglese.

### 11.4 RLS Admin su `businesses`

Due policy RLS permettono all'admin di leggere e modificare qualsiasi business:

```sql
-- Lettura
CREATE POLICY "businesses: admin read all" ON businesses FOR SELECT
  USING (auth.jwt()->'app_metadata'->>'role' = 'admin');

-- Modifica
CREATE POLICY "businesses: admin update all" ON businesses FOR UPDATE
  USING (auth.jwt()->'app_metadata'->>'role' = 'admin')
  WITH CHECK (auth.jwt()->'app_metadata'->>'role' = 'admin');
```

Il ruolo viene impostato manualmente dalla Dashboard Supabase → Authentication → Users → Edit User Metadata → `{ "role": "admin" }`.

### 11.5 Console.log sensibili rimossi

Rimossi in sessione 2026-05-14:
- `Onboarding.jsx`: prompt Claude inviato, risposta AI ricevuta, conferma salvataggio descrizione
- `Affiliates.jsx`: userId + dati affiliato

---

## 12. Sistema Affiliati

### 12.1 Flusso referral

```
Affiliato condivide link → piumapp.com/auth?ref=CODICE
    ↓
Auth.jsx salva ref in localStorage('pium_ref')
    ↓
Utente si registra → Onboarding.jsx legge pium_ref
    ↓
INSERT businesses con affiliate_code = codice affiliato
localStorage.removeItem('pium_ref')  // pulizia
    ↓
Admin vede badge codice in tabella + nome affiliato nel drawer
```

### 12.2 Join affiliates → businesses

Non c'è FK formale. Il collegamento avviene via string match:

```js
supabase.from('affiliates').select('code, name').eq('code', biz.affiliate_code).maybeSingle()
```

`businesses.affiliate_code` = valore del codice (es. `"MARCO2024"`)  
`affiliates.code` = stessa stringa — colonna UNIQUE nella tabella affiliates.

### 12.3 Tabella `affiliates`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → `auth.users` | L'affiliato ha un account Supabase Auth separato |
| `name` | text | Nome completo affiliato |
| `code` | text UNIQUE | Codice referral (es. `MARCO2024`) |
| `status` | text | `pending \| active` — approvato dall'admin |
| `total_earned` | numeric | Commissioni totali guadagnate |
| `total_pending` | numeric | Commissioni in attesa di pagamento |
| `created_at` | timestamptz | |

### 12.4 Commissioni automatiche via Stripe

Il webhook `stripe-webhook` registra automaticamente le commissioni su `invoice.paid`:
1. Verifica `businesses.affiliate_code` → carica affiliato con `status = 'approved'`
2. Conta le commissioni già esistenti per la coppia `(affiliate_id, business_id)` — cap 12 mesi
3. Inserisce riga in `affiliate_commissions` con `amount = 25.00`, `month_number = count + 1`, `status = 'pending'`
4. Idempotente: `stripe_invoice_id UNIQUE` previene doppi inserimenti su retry Stripe

I campi `total_clients` e `total_earned` in `affiliates` **non vengono più aggiornati dal sistema** — erano pensati per aggregati, ma il pannello admin ora li ignora e calcola tutto live da `affiliate_commissions`. Mantenuti per retro-compatibilità ma da considerare deprecati.

### 12.5 Gestione commissioni in Admin

L'admin vede le commissioni aggregate in tabella (clienti distinti, maturato, da pagare) e le dettaglio nel drawer. Il pulsante "Segna come pagate" aggiorna tutte le righe `pending` dell'affiliato a `status = 'paid'` con `paid_at = now()`. Operazione reversibile solo manualmente da DB.

### 12.6 Migration

`affiliate_code` su `businesses`: `20260520_affiliate_code.sql`. La tabella `affiliates` non ha migration locale — esiste in produzione, ricreala manualmente se necessario (vedi §6, Step 3). La tabella `affiliate_commissions` ha migration locale: `20260610_affiliate_commissions.sql` (vedi §6).

---

## 13. Sottodomini — Quick Reference

> Architettura completa in §10.5. Questa sezione è un riferimento rapido per chi deve replicare o debuggare il sistema.

**Stack:** Cloudflare Worker + DNS wildcard CNAME.

**Worker `pium-subdomain-proxy`:**
- Route configurata: `*piumapp.com/*`
- Logica: se hostname ha 3+ parti e non è `www.` → proxy trasparente verso `www.piumapp.com`
- File sorgente: `cloudflare-worker.js` (root del progetto)

**DNS Cloudflare:**
```
CNAME  *   →  www.piumapp.com  (proxy arancione 🟠)
CNAME  www →  <cname-vercel>   (proxy arancione 🟠)
```

**Lettura slug in `PublicSite.jsx`:**
```js
const parts = window.location.hostname.split('.')
const slug = parts.length >= 3 && parts[0] !== 'www' ? parts[0] : paramSlug
```

**Rilevamento sottodominio in `App.jsx` (fix sessione 2026-05-18):**

Il Worker proxia in modo trasparente: il browser è a `mario.piumapp.com`, `window.location.hostname = 'mario.piumapp.com'`. `App.jsx` rileva questo prima del routing React:

```js
const hostParts = window.location.hostname.split('.')
const isSubdomain = hostParts.length >= 3 && hostParts[0] !== 'www'

if (isSubdomain) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<PublicSite />} />
      </Routes>
    </BrowserRouter>
  )
}
```

Senza questo fix, React Router matchava `/` su `<PublicRoute><Landing /></PublicRoute>`. Il localStorage di `mario.piumapp.com` è separato da quello di `www.piumapp.com` (origin-scoped), quindi la sessione non era disponibile → `PublicRoute` renderizzava `<Landing />` (pagina marketing) invece del sito dell'attività.

**Preview da EditorSito:** usa `https://www.piumapp.com/site/${slug}` (non il sottodominio) — la route `/site/:slug` non è protetta da `PublicRoute`, quindi funziona anche senza Worker attivo.

**Debug:** Se un sottodominio non funziona, verificare in ordine:
1. DNS wildcard attivo (Cloudflare Dashboard → DNS)
2. Worker deployato e route assegnata (Workers → Triggers)
3. `window.location.hostname` nel browser mostra il sottodominio corretto
4. Slug esiste in `businesses.slug` su Supabase

---

## 14. Rubrica Clienti — Architettura

### 14.1 Fonti dati e merge

La sezione Clienti (`Clienti.jsx`) aggrega da **due sorgenti** in parallelo via `Promise.all`:

```js
const [{ data: apts }, { data: contacts }] = await Promise.all([
  supabase.from('appointments').select('...').eq('business_id', biz.id),
  supabase.from('contacts').select('*').eq('business_id', biz.id),
])
```

Le due liste vengono unite dalla funzione `groupClients(apts, contacts)`:
- **Chiave primaria:** `phone` normalizzato (strip non-numerici). Appuntamenti con lo stesso numero → stesso cliente.
- **Omonimi senza telefono:** risolti con `nameIndex = new Map()`. Alla prima occorrenza di un nome senza telefono, viene creata una chiave sintetica `__name__${cleanName}__${date}`. Le occorrenze successive dello stesso nome (stessa data) vengono aggiunte allo stesso gruppo.
- **Contatti puri** (solo in `contacts`, zero appuntamenti): appaiono in fondo alla lista con badge "contatto".

### 14.2 Tabella `appointment_services` — multi-servizio

Il modal appuntamento in `Agenda.jsx` mostra una lista checkbox dei servizi attivi. Spuntare un servizio accumula `price` e `duration_minutes` nel form. Al salvataggio:

```
INSERT INTO appointments (client_name, price, duration_minutes, ...)
INSERT INTO appointment_services (appointment_id, service_id, price_snapshot, duration_snapshot)
  per ogni servizio selezionato
```

In modifica (`openEditModal`): viene eseguito `await loadServices()` **prima** di aprire il modal (fix bug: in precedenza la lista era vuota al mount), poi viene letta la join `appointment_services` per pre-spuntare i servizi già associati.

Nel drawer Clienti, lo storico mostra i tag servizi: `"Taglio • Barba"`.

### 14.3 Importazione contatti

**vCard (.vcf):**
1. Upload file → `FileReader.readAsText()`
2. Normalizzazione obbligatoria: `text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')` (la libreria `vcf` richiede CRLF)
3. Parse con libreria `vcf` → array oggetti vCard
4. Anteprima lista nomi + numeri (step modale 'preview')
5. Deduplicazione per telefono prima dell'INSERT: se `(business_id, phone)` già esiste → skip

**Contact Picker API (Android Chrome):**
```js
const PICKER_SUPPORTED = 'contacts' in navigator && 'ContactsManager' in window
if (PICKER_SUPPORTED) {
  const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true })
}
```
Stesso flusso preview + deduplicazione della vCard. Il pulsante è visibile solo se `PICKER_SUPPORTED = true`.

---

## 15. Fix Anti-Bug — Sessione 2026-05-18

15 fix pre-lancio implementati in questa sessione:

| # | File | Problema | Fix |
|---|---|---|---|
| 1 | `Agenda.jsx` | `handleSave` senza try/catch — errori Supabase silenti | try/catch/finally; errore mostrato in `errors._global` nel modal che rimane aperto |
| 2 | `Agenda.jsx` | `openEditModal` non await `loadServices()` — servizi vuoti al salvataggio | Aggiunto `await` |
| 3 | `Agenda.jsx` | `suggestTimerRef` non pulito in `closeModal` — memory leak | `clearTimeout(suggestTimerRef.current)` in `closeModal` |
| 4 | `Dashboard.jsx` | `handleCheckout` fallisce senza feedback visivo | try/catch con `setCheckoutError(msg)`, banner rosso sotto il trial banner |
| 5 | `Dashboard.jsx` | Errore DB al caricamento business → redirect a `/onboarding` | `if (error) { setLoadError(true) }` con banner "Ricarica la pagina" |
| 6 | `Auth.jsx` | Doppio submit se l'utente clicca due volte prima della risposta | `pendingRef = useRef(false)` blocca secondo invio; reset in `switchMode` |
| 7 | `Clienti.jsx` | vCard: 0 contatti importati se il file ha LF invece di CRLF | Normalizzazione `\n → \r\n` prima del parse con libreria `vcf` |
| 8 | `Clienti.jsx` | `groupClients`: omonimi senza telefono spezzati in gruppi separati | `nameIndex = new Map()` raggruppa per `name+date` al primo incontro |
| 9 | `Agenda.jsx` | `loadAppointments` in useEffect: race condition su cambio data rapido | Signal pattern `{ cancelled: false }` — `if (signal?.cancelled) return` dopo ogni await |
| 10 | `Agenda.jsx` | `DayTimeline`: click su appuntamento scatta durante scroll touch | `touchStartY` ref; in `onClick` ignora se delta Y > 10px |
| 11 | `PublicSite.jsx` | `Carousel`: nessun swipe su mobile | `touchX` ref + `onTouchStart`/`onTouchEnd`, soglia 40px |
| 12 | `PublicSite.jsx` | Immagini rotte nella galleria causano slot vuoti | `onError={e => e.currentTarget.closest('.ps-carousel-slide').style.display='none'}` |
| 13 | `Clienti.jsx` | `handleSave` nel drawer: nessun errore mostrato su fallimento Supabase | try/catch/finally; `saveError` state mostrato sotto il form |
| 14 | `Clienti.jsx` | `confirmImport`: errore INSERT non comunicato all'utente | try/catch; step 'done' mostra icona rossa + messaggio errore |
| 15 | `Dashboard.jsx` | Realtime INSERT su `bookings`: `setPendingCount(c+1)` senza fetch → stale count | `setPendingCount(c => c + 1)` poi `fetchCount()` per conferma DB |

---

## 16. TODOs e Problemi Noti

| Stato | Problema | Note |
|---|---|---|
| ✅ Risolto 2026-06-08 | Assenza di React Error Boundary — crash non gestiti abbattevano l'intera UI senza messaggio utente | Aggiunto `ErrorBoundary.jsx` (commit `6977952`): applicato in `App.jsx` (entrambi i rami subdomain + router) e in `Dashboard.jsx` con `key={section}` per reset automatico al cambio sezione |
| 🔴 Aperto | Cookie banner GDPR assente | Obbligatorio prima del lancio reale |
| 🔴 Aperto | Documenti legali con placeholder — dati societari non compilati | In lavorazione con il commercialista (P.IVA, ragione sociale, PEC, foro) |
| 🟡 Aperto | Re-subscription push dopo rideploy `notify-new-booking` — il titolare deve disattivare/riattivare il toggle Web Push manualmente | Da automatizzare con logica re-subscription al mount di `Settings.jsx` |
| 🟡 Aperto | Deliverability email auth Supabase — durante i test una conferma non è arrivata | Sender Supabase default ha limite ~2/ora; valutare SMTP Resend configurato |
| 🟡 Aperto | `VITE_VAPID_PUBLIC_KEY` mancante nel `.env` frontend di produzione | Necessario per Web Push |

---

## 17. Checklist Pre-Lancio

| Fatto | Voce |
|---|---|
| ✅ | Verificare che `.env` sia nel `.gitignore` (riga 3 — confermato, mai committato) |
| ✅ | Aggiungere React Error Boundary (commit `6977952` — 2026-06-08) |
| ✅ | Billing Stripe end-to-end verificato in modalità test |
| ✅ | Webhook Stripe attivo e funzionante (`verify_jwt = false`, risposta 200) |
| ✅ | "Confirm email" attivo in Supabase Auth |
| ✅ | RLS su tutte le tabelle |
| ✅ | Select esplicita in `PublicSite.jsx` (nessun campo admin/billing esposto) |
| ✅ | XSS guard URL social (`safeHref` — commit `ff00847`) |
| 🔴 | Stripe LIVE: chiavi `pk_live_`/`sk_live_` + webhook live + `VITE_STRIPE_PUBLIC_KEY` live |
| 🔴 | Documenti legali: compilare placeholder con dati societari reali |
| 🔴 | Cookie banner GDPR |
| 🟡 | `VITE_VAPID_PUBLIC_KEY` in `.env` frontend produzione |
| 🟡 | Verifica deliverability email auth (SMTP Resend) |
