# HANDOFF TECNICO PIUM

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

Data redazione: 2026-05-31  
Workspace analizzato: `C:\Sviluppo\localhub`

Legenda evidenze usata in tutto il documento:
- **[VERIFICATO CODICE]**: verificato direttamente nei file del repository.
- **[DEDOTTO DAL CODICE]**: inferenza tecnica ragionevole a partire dal codice.
- **[DOCUMENTATO MD]**: presente in markdown/documentazione interna del repo.
- **[DA VERIFICARE]**: richiede verifica su ambiente esterno (Supabase/Stripe/Vercel/Cloudflare) o test runtime.

---

# 1. Executive summary tecnico

- PIUM è una web app SaaS per attività locali con onboarding guidato, dashboard operativa, mini-sito pubblico, prenotazioni e gestione interna clienti/agenda. **[VERIFICATO CODICE]** (es. `src/pages/Onboarding.jsx`, `src/pages/Dashboard.jsx`, `src/pages/PublicSite.jsx`, `src/components/public/BookingSection.jsx`).
- Stack principale: React + Vite frontend; Supabase (Auth, DB, Realtime, Edge Functions); Stripe Checkout/Webhook per billing; Resend per email transazionali (via SMTP Supabase Auth e API nella function affiliati). **[VERIFICATO CODICE]** (`package.json`, `src/lib/supabase.js`, `supabase/functions/*`).
- Stato generale: prodotto funzionale su flussi principali merchant/booking/admin; area billing Stripe ancora parzialmente “hardcoded” e non allineata a pricing/trial commerciali desiderati. **[VERIFICATO CODICE]** + **[DEDOTTO DAL CODICE]**.
- Aree più mature:
  - onboarding merchant + creazione business + AI description fallback-safe; **[VERIFICATO CODICE]**
  - booking pubblico con pending + conferma owner + push; **[VERIFICATO CODICE]**
  - admin pannello con gestione business e affiliati; **[VERIFICATO CODICE]**
  - pagine legali frontend collegate. **[VERIFICATO CODICE]**
- Aree rischiose/non chiuse:
  - prezzo Stripe hardcoded a 99,00 e nessun trial Stripe reale; **[VERIFICATO CODICE]**
  - campi admin (`plan_price`, `trial_ends_at`) non applicano logiche reali su Stripe; **[VERIFICATO CODICE]**
  - schema locale non allineato al 100% con schema reale Supabase (tabelle/colonne create manualmente); **[VERIFICATO CODICE]** + **[DOCUMENTATO MD]**
  - claim marketing non allineati pienamente al comportamento runtime (es. “nessuna carta”). **[VERIFICATO CODICE]** + **[DEDOTTO DAL CODICE]**

---

# 2. Stack e architettura

## Frontend
- Framework: React 19 + React Router + Vite. **[VERIFICATO CODICE]** (`package.json`, `src/App.jsx`).
- Struttura UI modulare: pagine in `src/pages`, moduli dashboard in `src/components/dashboard`, librerie in `src/lib`. **[VERIFICATO CODICE]**

## Routing
- Router principale in `src/App.jsx` con route auth/merchant/admin/affiliate/legal/public. **[VERIFICATO CODICE]**
- Catch-all `/:slug` verso `PublicSite`, più gestione separata sottodomini. **[VERIFICATO CODICE]**

## Hosting/deploy
- Frontend predisposto per Vercel SPA rewrite (`vercel.json`). **[VERIFICATO CODICE]**
- Documentazione progetto parla di deploy automatico da push su branch principale. **[DOCUMENTATO MD]** (`PROGETTO.md`).

## Supabase
- Client frontend via `@supabase/supabase-js` con `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. **[VERIFICATO CODICE]** (`src/lib/supabase.js`).
- Edge Functions in `supabase/functions`. **[VERIFICATO CODICE]**

## Auth
- Supabase Auth email/password.
- Ruolo admin basato su `user.app_metadata.role`. **[VERIFICATO CODICE]** (`src/pages/Admin.jsx`, `src/pages/AdminLogin.jsx`, `supabase/functions/approve-affiliate/index.ts`).

## Database
- Schema base SQL presente in `supabase/schema.sql`.
- Migrations incrementali in `supabase/migrations`. **[VERIFICATO CODICE]**

## RLS
- Policy owner/admin presenti per varie tabelle (`businesses`, `bookings`, `contacts`, `activity_log`, ecc.). **[VERIFICATO CODICE]** (`supabase/schema.sql`, migrations).
- RLS `legal_acceptances` e `affiliates` non definita in migrations locali; indicata in documentazione. **[DOCUMENTATO MD]** + **[DA VERIFICARE]**

## Edge Functions
- Presenti: `claude-proxy`, `stripe-checkout`, `stripe-webhook`, `notify-new-booking`, `approve-affiliate`. **[VERIFICATO CODICE]**

## Stripe
- Checkout session creata da Edge Function server-side (`stripe-checkout`). **[VERIFICATO CODICE]**
- Webhook aggiorna stato business su `checkout.session.completed`. **[VERIFICATO CODICE]**

## Resend
- Usato in `approve-affiliate` via API HTTP (`https://api.resend.com/emails`). **[VERIFICATO CODICE]**
- Setup SMTP Supabase Auth e DNS Resend indicati in doc interna. **[DOCUMENTATO MD]**

## Cloudflare / DNS / email routing
- Worker proxy sottodomini verso `www.piumapp.com`. **[VERIFICATO CODICE]** (`cloudflare-worker.js`).
- Dettagli DNS/MX/SPF/DKIM/DMARC indicati solo in documentazione. **[DOCUMENTATO MD]** + **[DA VERIFICARE]**

## PWA
- Manifest + service worker presenti; registrazione condizionale su dominio principale. **[VERIFICATO CODICE]** (`public/manifest.json`, `public/sw.js`, `src/main.jsx`).

## Notifiche push
- Frontend: subscribe/unsubscribe in `src/lib/pushSubscription.js`.
- Backend push: Edge Function `notify-new-booking`. **[VERIFICATO CODICE]**

## AI / Claude
- Generazione AI passa da `claude-proxy` con JWT + rate limiting su business. **[VERIFICATO CODICE]**

---

# 3. Struttura repository

- `src/`: applicazione frontend React (UI, pagine, librerie client). **[VERIFICATO CODICE]**
- `src/pages/`: pagine principali (`Auth`, `Onboarding`, `Dashboard`, `Admin`, `Affiliates`, `PublicSite`, `ResetPassword`, legali). **[VERIFICATO CODICE]**
- `src/components/`: componenti riusabili; dashboard modules e public booking. **[VERIFICATO CODICE]**
- `src/lib/`: integrazioni client (`supabase`, `claude`, notifiche, push, activity log). **[VERIFICATO CODICE]**
- `supabase/functions/`: Edge Functions Deno deployabili separatamente. **[VERIFICATO CODICE]**
- `supabase/migrations/`: evoluzione schema locale/versionata. **[VERIFICATO CODICE]**
- `legal-docs/`: documenti legali markdown “web version”. **[VERIFICATO CODICE]**
- Documentazione tecnica esistente nel repo:
  - `PROGETTO.md`
  - `TECHNICAL_DOCS.md`
  - `FUNZIONI_PIUM.md`
  - `FUNZIONI_PIUM_V2.md`
  - `ONBOARDING_TECNICO.md`
  - `RIEPILOGO_TECNICO.md`
  - `REPORT_ANALISI_BUG.md`  
  **[VERIFICATO CODICE]**

---

# 4. Routing frontend

Riferimento primario: `src/App.jsx`. **[VERIFICATO CODICE]**

Route principali:
- `/` -> `Landing` (wrapped da `PublicRoute`).
- `/auth` -> `Auth` (wrapped da `PublicRoute`).
- `/onboarding` -> `Onboarding`.
- `/dashboard` -> `Dashboard`.
- `/settings` -> `Settings`.
- `/admin` -> `Admin`.
- `/x-admin-login` -> `AdminLogin`.
- `/affiliates` -> `Affiliates`.
- `/affiliates/auth` -> `AffiliatesAuth`.
- `/reset-password` -> `ResetPassword`.
- `/privacy`, `/termini`, `/cookie`, `/dpa`, `/contratto-affiliazione` -> pagine legali.
- `/ref/:code` -> salva referral in localStorage (`pium_ref`) e redirect `/auth`.
- `/site/:slug` e `/:slug` -> `PublicSite`.

Ordine route prima della catch-all:
- Le route legali e tecniche sono dichiarate prima di `/:slug`, riducendo collisioni. **[VERIFICATO CODICE]**

Catch-all `/:slug`:
- Rischio fisiologico: qualsiasi path non noto può essere interpretato come slug pubblico. **[DEDOTTO DAL CODICE]**
- Mitigato parzialmente dall’ordine esplicito route. **[VERIFICATO CODICE]**

Sottodomini:
- Se hostname è sottodominio (`parts.length >= 3 && parts[0] !== 'www'`) App renderizza direttamente `PublicSite` con route `*`. **[VERIFICATO CODICE]**

---

# 5. Flusso commerciante

1. Landing -> eventuale accesso/registrazione merchant su `/auth`. **[VERIFICATO CODICE]**
2. Registrazione merchant (`Auth.jsx`) con checkbox legale obbligatoria in modalità register. **[VERIFICATO CODICE]**
3. Confirm email: flusso supportato, `emailRedirectTo` merchant impostato a `/onboarding`. **[VERIFICATO CODICE]**
4. Redirect a onboarding e wizard dati attività (`Onboarding.jsx`). **[VERIFICATO CODICE]**
5. Creazione business in `public.businesses` con slug univoco e `affiliate_code` da `localStorage.pium_ref` se presente. **[VERIFICATO CODICE]**
6. Salvataggio legal acceptance merchant in `legal_acceptances` (upsert). **[VERIFICATO CODICE]**
7. Generazione descrizione AI tramite `generateWithClaude()` e update `businesses.description`; se fallisce non blocca redirect a dashboard. **[VERIFICATO CODICE]**
8. Dashboard caricata (`Dashboard.jsx`) con moduli gestionali. **[VERIFICATO CODICE]**
9. Sito pubblico caricato da `PublicSite.jsx` via slug/sottodominio. **[VERIFICATO CODICE]**
10. Booking pubblico via `BookingSection.jsx` -> RPC `create_booking` (`pending`) -> conferma owner in agenda via RPC `owner_confirm_booking`. **[VERIFICATO CODICE]**
11. Checkout Stripe opzionale da banner trial in dashboard (`handleCheckout`). **[VERIFICATO CODICE]**

File/funzioni chiave:
- `src/pages/Auth.jsx` -> `handleSubmit`, `handleForgotPassword`.
- `src/pages/Onboarding.jsx` -> `handleSubmit`, `buildDescriptionPrompt`.
- `src/pages/Dashboard.jsx` -> `handleCheckout`, polling post-redirect.
- `src/pages/PublicSite.jsx`.
- `src/components/public/BookingSection.jsx` -> submit RPC.
- `src/lib/claude.js`.

---

# 6. Flusso affiliato

1. Accesso pagina affiliati `/affiliates` o auth dedicata `/affiliates/auth`. **[VERIFICATO CODICE]**
2. Registrazione affiliato con checkbox legale obbligatoria in `AffiliatesAuth.jsx`. **[VERIFICATO CODICE]**
3. Confirm email attivo lato flusso applicativo; redirect impostato a `/affiliates`. **[VERIFICATO CODICE]** + **[DA VERIFICARE runtime Auth settings]**
4. Bootstrapping profilo affiliato:
   - tentativo insert post-signup in `AffiliatesAuth.jsx`;
   - fallback robusto in `Affiliates.jsx` con `ensureAffiliateProfile()`. **[VERIFICATO CODICE]**
5. Stato iniziale profilo: `pending`. **[VERIFICATO CODICE]**
6. Salvataggio legal acceptance affiliato in `Affiliates.jsx` via `ensureAffiliateAcceptance()`. **[VERIFICATO CODICE]**
7. Dashboard affiliato mostra referral link e clienti acquisiti via `businesses.affiliate_code = affiliate.code`. **[VERIFICATO CODICE]**
8. Se stato affiliato è `pending`, mostra schermata “richiesta in attesa”. **[VERIFICATO CODICE]**
9. Approvazione admin via funzione admin `setAffiliateStatus()` che invoca Edge Function `approve-affiliate`. **[VERIFICATO CODICE]**
10. Edge Function aggiorna stato e invia email approvazione condizionata. **[VERIFICATO CODICE]**

Nota critica stato attivo:
- Nel codice affiliati lo stato attivo è `approved` (non `active`). **[VERIFICATO CODICE]**

File/funzioni chiave:
- `src/pages/Affiliates.jsx` -> `ensureAffiliateAcceptance`, `ensureAffiliateProfile`, `loadData`.
- `src/pages/AffiliatesAuth.jsx` -> `handleSubmit`.
- `src/pages/Admin.jsx` -> `setAffiliateStatus`.
- `supabase/functions/approve-affiliate/index.ts`.

---

# 7. Admin

Riferimento: `src/pages/Admin.jsx`. **[VERIFICATO CODICE]**

## Login/admin check
- Se non autenticato -> redirect `/x-admin-login`.
- Role gate: `user.app_metadata?.role === 'admin'`. **[VERIFICATO CODICE]**

## Gestione clienti/business
- Caricamento tabella business con campi stato/piano/prezzo/trial/AI e affiliate_code. **[VERIFICATO CODICE]**
- Azioni:
  - update `plan` (`updatePlan`);
  - update `status` (`setBizStatus`);
  - update `plan_price` (`updatePlanPrice`);
  - extend/save `trial_ends_at` (`extendTrial`, `saveTrialDate`);
  - toggle `ai_unlimited`;
  - note interne (`saveNotes`). **[VERIFICATO CODICE]**

## Drawer clienti
- Presente `BusinessDrawer` con dati account, salute onboarding, trial, AI, link pubblico. **[VERIFICATO CODICE]**

## Gestione affiliati
- Sezione dedicata con tabella + card mobile + drawer affiliato. **[VERIFICATO CODICE]**
- Stati gestiti da UI:
  - `approved` (play/pause verso pending),
  - `pending`,
  - `rejected`. **[VERIFICATO CODICE]**
- `setAffiliateStatus()` invoca `supabase.functions.invoke('approve-affiliate', ...)`. **[VERIFICATO CODICE]**

## Drawer affiliati
- Presente `AffiliateDrawer`.
- Campi editabili: `city`, `province`, `phone`, `legal_name`, `admin_notes`.
- Campi read-only: `name`, `email`, `code`, `status`, `created_at`, `approved_email_sent_at`. **[VERIFICATO CODICE]**

## Cosa è gestionale DB vs impatto servizi esterni
- `plan_price`, `trial_ends_at`, `status`, `plan` modificati da admin restano dati DB interni finché non letti da Edge Functions Stripe (oggi non lo sono). **[VERIFICATO CODICE]** + **[DEDOTTO DAL CODICE]**
- Approvazione affiliato invece impatta servizio esterno Resend tramite Edge Function. **[VERIFICATO CODICE]**

## Bug layout affiliati
- Utente ha segnalato regressione badge fuori card; CSS/JSX attuali mostrano classi di contenimento responsive (`adm-aff-headline`, `flex-wrap`, badge inline). **[VERIFICATO CODICE]**
- Stato reale UI va confermato in runtime/browser con viewport reali. **[DA VERIFICARE]**

---

# 8. Auth e email

## Supabase Auth
- Email/password standard in `Auth.jsx` e `AffiliatesAuth.jsx`. **[VERIFICATO CODICE]**
- Gestione ruolo admin via app metadata in più punti (frontend + function). **[VERIFICATO CODICE]**

## Confirm email / redirect
- Merchant signup -> `emailRedirectTo: /onboarding`.
- Affiliate signup -> `emailRedirectTo: /affiliates`. **[VERIFICATO CODICE]**

## Reset password
- Trigger in `Auth.jsx` con `redirectTo: /reset-password`.
- Pagina `ResetPassword.jsx` con:
  - verifica sessione recovery (`getSession`);
  - validazione password;
  - `updateUser({ password })`;
  - `signOut()` post-success. **[VERIFICATO CODICE]**

## Resend SMTP / template auth
- Config SMTP Supabase Auth, template personalizzati e dominio verificato sono descritti in `PROGETTO.md`. **[DOCUMENTATO MD]**
- Non verificabili via codice locale (impostazioni pannello Supabase/Resend). **[DA VERIFICARE]**

## Link Supabase nelle email
- Comportamento “link passa da dominio Supabase prima del redirect finale” documentato e coerente con Supabase Auth. **[DOCUMENTATO MD]** + **[DEDOTTO DAL CODICE]**

## Test dichiarati
- Confirm email merchant/affiliate e reset password “OK” sono indicati in markdown, non riprodotti in questa analisi. **[DOCUMENTATO MD]** + **[DA VERIFICARE]**

---

# 9. Documenti legali e accettazioni

## Pagine legali frontend
- Presenti route e pagine:
  - `/privacy`, `/termini`, `/cookie`, `/dpa`, `/contratto-affiliazione`
  - files in `src/pages/legal/*`.
  **[VERIFICATO CODICE]**

## Documenti markdown
- Presenti in `legal-docs/`:
  - `termini-servizio.md`
  - `dpa.md`
  - `privacy-policy.md`
  - `cookie-policy.md`
  - `contratto-affiliazione.md`
  **[VERIFICATO CODICE]**

## Placeholder societari
- Nei documenti sono presenti placeholder non compilati (es. ragione sociale, P.IVA/C.F., indirizzo, PEC, foro, data). **[VERIFICATO CODICE]**

## Checkbox legali
- Merchant: checkbox obbligatoria in `Auth.jsx`.
- Affiliate: checkbox obbligatoria in `AffiliatesAuth.jsx`. **[VERIFICATO CODICE]**

## legal_acceptances
- Flusso applicativo usa tabella `legal_acceptances` sia merchant che affiliate con `document_versions` e `source` specifici. **[VERIFICATO CODICE]**
- Struttura tabella/policy RLS non in migrations locali; descritta in `PROGETTO.md` come creata manualmente con owner-only read/insert. **[DOCUMENTATO MD]** + **[DA VERIFICARE]**

## Booking privacy note
- Nota privacy presente nello step finale booking con link assoluto a `/privacy`. **[VERIFICATO CODICE]**

---

# 10. Database Supabase

## Distinzione fondamentale
- **Presente in migrations/schema locale**: molte tabelle core (`businesses`, `services`, `bookings`, `appointments`, `contacts`, `push_subscriptions`, `activity_log`, ecc.). **[VERIFICATO CODICE]**
- **Usato dal frontend ma non trovato in migration locale**: `affiliates`, `legal_acceptances`. **[VERIFICATO CODICE]**
- **Creato manualmente (documentato)**: `legal_acceptances`; colonne extra su `affiliates` (`approved_email_sent_at`, `admin_notes`, `city`, `province`, `phone`, `legal_name`). **[DOCUMENTATO MD]** + **[DA VERIFICARE]**

## Tabelle principali (stato locale repo)
- `businesses`: base in `schema.sql`, poi estesa via migrations (`plan`, `status`, `plan_price`, `trial_ends_at`, `ai_*`, `affiliate_code`, `stripe_*`). **[VERIFICATO CODICE]**
- `services`, `site_content`, `reviews`, `employees`, `appointments`, `bookings`: presenti in schema/migrations e usate nel frontend. **[VERIFICATO CODICE]**
- `appointment_services`: migration 20260526 e uso in `Agenda.jsx`/`Clienti.jsx`. **[VERIFICATO CODICE]**
- `contacts`: migration 20260527 e uso in `Clienti.jsx`. **[VERIFICATO CODICE]**
- `push_subscriptions`: migration 20260516 + uso frontend/lib + function push. **[VERIFICATO CODICE]**
- `activity_log`: migration 20260521 + helper `src/lib/activityLog.js`. **[VERIFICATO CODICE]**

## RLS nel repo
- Owner policies e admin policies su varie tabelle presenti in SQL locale. **[VERIFICATO CODICE]**
- RLS reali su `affiliates`/`legal_acceptances` non verificabili localmente. **[DA VERIFICARE]**

## Mismatch noti
- `affiliates` queryata da frontend/admin (`src/pages/Affiliates*.jsx`, `src/pages/Admin.jsx`) ma non definita in migration locale. **[VERIFICATO CODICE]**
- `legal_acceptances` usata da onboarding/affiliate ma non definita in migration locale. **[VERIFICATO CODICE]**
- `approved_email_sent_at` e campi dettaglio affiliato usati nel codice ma non migrati localmente. **[VERIFICATO CODICE]**

---

# 11. Edge Functions

| Funzione | Scopo | Input | Output | Auth | Secrets principali | Chiamate esterne | Stato |
|---|---|---|---|---|---|---|---|
| `claude-proxy` | Proxy AI + rate limit | `{ prompt }` | `{ text }` o errore | JWT richiesto (`Authorization`, `auth.getUser`) | `CLAUDE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Anthropic `/v1/messages` | Implementata e usata dal frontend **[VERIFICATO CODICE]** |
| `stripe-checkout` | Crea sessione checkout subscription | body vuoto (usa user dal JWT) | `{ url }` | JWT richiesto (`auth.getUser`) | `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL?` | Stripe `/v1/checkout/sessions` | Implementata ma con prezzo hardcoded **[VERIFICATO CODICE]** |
| `stripe-webhook` | Aggiorna business dopo pagamento | payload webhook Stripe | `{received:true}`/error text | `verify_jwt=false` via `config.toml` | `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | nessuna API esterna oltre webhook in ingresso | Implementata **[VERIFICATO CODICE]** |
| `notify-new-booking` | Push su nuova booking pending | payload trigger booking | `{sent,failed,stale}`/error | `verify_jwt=false` via `config.toml` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | web-push provider endpoint | Implementata **[VERIFICATO CODICE]** |
| `approve-affiliate` | Cambio stato affiliato + email approvazione | `{affiliate_id,target_status}` | `{updated,email_sent,previous_status,status}`/error dettagliato | JWT richiesto + role admin check | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `FROM_EMAIL` | Resend `/emails` | Implementata **[VERIFICATO CODICE]** |

Note verify_jwt:
- Config esplicita presente solo per `stripe-webhook` e `notify-new-booking`. **[VERIFICATO CODICE]**
- Per `claude-proxy`, `stripe-checkout`, `approve-affiliate` assenza `config.toml` locale: comportamento effettivo verify_jwt va confermato sul progetto Supabase. **[DA VERIFICARE]**

---

# 12. Stripe / billing

Stato reale attuale:
- `stripe-checkout` usa `price_data` inline con `unit_amount=9900` (EUR mensile). **[VERIFICATO CODICE]**
- Non usa Price ID Stripe. **[VERIFICATO CODICE]**
- Non usa coupon/promo founder. **[VERIFICATO CODICE]**
- Non imposta trial Stripe (`subscription_data.trial_period_days` assente). **[VERIFICATO CODICE]**
- Admin `plan_price` non viene letto da `stripe-checkout`. **[VERIFICATO CODICE]**
- Admin `trial_ends_at` non viene letto da `stripe-checkout`. **[VERIFICATO CODICE]**
- `affiliate_code` non viene letto in `stripe-checkout`. **[VERIFICATO CODICE]**
- `stripe-webhook` su `checkout.session.completed` imposta `businesses.status='active'` e `plan='active'`. **[VERIFICATO CODICE]**

Rischi:
- Possibile disallineamento tra pricing mostrato/admin e pricing realmente fatturato su Stripe. **[DEDOTTO DAL CODICE]**
- Nessun handling esplicito stato `trialing` da Stripe. **[DEDOTTO DAL CODICE]**

Strategia futura discussa (non implementata):
- Listino 99,99 €/mese standard.
- Founder/partner promo -30% per 12 mesi.
- Trial Stripe reale 14 giorni.
- Preferenza tecnica: Price ID standard + coupon founder (invece di price_data hardcoded).
- Secret previsti:
  - `STRIPE_PRICE_STANDARD_MONTHLY`
  - `STRIPE_COUPON_FOUNDER_12M`
  **[DOCUMENTATO MD + RICHIESTE UTENTE]** + **[DA VERIFICARE implementazione]**

---

# 13. Resend / email transazionali

- Resend API usata direttamente in `approve-affiliate` (header bearer + idempotency key). **[VERIFICATO CODICE]**
- Mittente usato dalla function: `FROM_EMAIL` con fallback `PIUM <no-reply@piumapp.com>`. **[VERIFICATO CODICE]**
- Subject/email body approvazione affiliato implementati server-side. **[VERIFICATO CODICE]**
- Setup SMTP Supabase Auth via Resend, dominio verificato, template custom: presente in documentazione progetto ma non verificabile via repo. **[DOCUMENTATO MD]** + **[DA VERIFICARE]**
- Stato test email approvazione affiliato:
  - doc progetto: “testata OK”; **[DOCUMENTATO MD]**
  - segnalazioni utente recenti: “non arrivata” in almeno un test. **[DOCUMENTATO MD (conversazione)]**
  - conclusione tecnica: da verificare con log Edge Function + record `approved_email_sent_at` + risposta Resend. **[DA VERIFICARE]**

---

# 14. AI / generazione sito

Percorso AI principale:
- `Onboarding.jsx` crea prompt descrizione e chiama `generateWithClaude()`. **[VERIFICATO CODICE]**
- `generateWithClaude()` chiama Edge Function `claude-proxy` con JWT. **[VERIFICATO CODICE]**
- `claude-proxy`:
  - valida auth/token;
  - valida prompt non vuoto e max 20k char;
  - applica limite mensile su `businesses.ai_tokens_month` salvo `ai_unlimited`;
  - chiama Anthropic model `claude-sonnet-4-6`;
  - aggiorna contatori AI.
  **[VERIFICATO CODICE]**

Altri usi AI:
- `src/components/dashboard/Social.jsx` generazione bozze social. **[VERIFICATO CODICE]**
- `src/components/dashboard/Recensioni.jsx` generazione risposta recensioni. **[VERIFICATO CODICE]**

Fallback/error handling:
- Se AI fallisce in onboarding: errore loggato ma onboarding continua a dashboard (descrizione non bloccante). **[VERIFICATO CODICE]**
- Nei moduli social/recensioni: mostra messaggi utente, inclusa gestione `AI_LIMIT_REACHED`. **[VERIFICATO CODICE]**

Rischi:
- Limite AI comunicato in chiamate (`ai_calls_month_display`) ma enforced su token; possibili divergenze percepite dall’utente. **[DEDOTTO DAL CODICE]**
- Dipendenza runtime da secret Anthropic in Edge Function. **[DA VERIFICARE]**

---

# 15. Booking / sito pubblico / notifiche

## PublicSite
- Carica business per slug/sottodominio con embed relazioni (`services`, `reviews`, `site_content`), richiede `is_active=true`. **[VERIFICATO CODICE]**
- Costruisce pagina pubblica con hero/servizi/galleria/booking/contatti/orari. **[VERIFICATO CODICE]**

## Booking
- `BookingSection.jsx`:
  - legge slot occupati via RPC `get_taken_slots`;
  - invia prenotazione via RPC `create_booking`;
  - passa `p_service_names` per multi-servizio;
  - include privacy note.
  **[VERIFICATO CODICE]**
- Flusso owner:
  - Agenda carica pending bookings;
  - owner conferma via RPC `owner_confirm_booking` o rifiuta con update `status='cancelled'`.
  **[VERIFICATO CODICE]**

## Notifiche push
- Subscriptions salvate in `push_subscriptions`.
- Trigger DB (`on_new_booking`) invoca function `notify-new-booking`.
- Function invia push solo se booking `pending`; pulisce subscription stale (410). **[VERIFICATO CODICE]**

Test noti:
- Booking + push “OK” sono riportati in doc progetto. **[DOCUMENTATO MD]**
- Verifica end-to-end attuale non eseguita in questa analisi. **[DA VERIFICARE]**

---

# 16. Landing page / marketing

Stato corrente claim (da `src/pages/Landing.jsx`):
- presenti claim come:
  - “Attivazione in 5 minuti”
  - “Nessuna carta di credito”
  - “Generazione AI illimitata”
  - “GDPR compliant”
  - “Zero tracciamento”
  - “Soddisfatti o rimborsati”
  - prezzo visualizzato “99”
  **[VERIFICATO CODICE]**

Rischio commerciale/legale:
- Alcuni claim possono essere troppo assoluti rispetto al comportamento implementato (es. carta richiesta in Checkout Stripe, AI limitata salvo flag). **[DEDOTTO DAL CODICE]**

Wording più sicuro consigliato:
- “Strumenti AI inclusi”
- “Progettato con attenzione alla privacy”
- “Nessuna vendita dei dati”
- “Prova 14 giorni”
- “Sito pronto in pochi minuti”  
**[DEDOTTO DAL CODICE + RICHIESTE UTENTE]**

Allineamento prezzi:
- Landing e Stripe devono essere allineati prima di vendita reale. **[DEDOTTO DAL CODICE]**

---

# 17. PWA / mobile

- Manifest PWA presente (`public/manifest.json`). **[VERIFICATO CODICE]**
- Service Worker presente (`public/sw.js`) con cache shell, push, notification click, fetch caching. **[VERIFICATO CODICE]**
- Registrazione SW condizionale in `src/main.jsx` solo su domini principali; sottodomini eseguono unregister. **[VERIFICATO CODICE]**
- Banner install PWA presente (`src/components/PWABanner.jsx`). **[VERIFICATO CODICE]**

Possibili criticità:
- comportamento cache/auth tra release successive va monitorato (cache strategy network-first con fallback). **[DEDOTTO DAL CODICE]**
- test PWA iOS/Android non ripetuti in questa analisi. **[DA VERIFICARE]**

---

# 18. Sicurezza

Controlli attuali:
- RLS su molte tabelle core (`businesses`, `bookings`, `contacts`, `activity_log`, ecc.). **[VERIFICATO CODICE]**
- Admin gate frontend su `app_metadata.role === 'admin'` (`Admin`, `AdminLogin`). **[VERIFICATO CODICE]**
- Admin gate server-side in `approve-affiliate` (`auth.getUser(token)` + role check). **[VERIFICATO CODICE]**
- Service role usato solo in Edge Functions per operazioni privilegiate (`approve-affiliate`, `stripe-webhook`, `notify-new-booking`). **[VERIFICATO CODICE]**
- `stripe-webhook` verifica firma HMAC + timestamp anti-replay. **[VERIFICATO CODICE]**

Raccomandazioni critiche:
- Non esporre mai `SUPABASE_SERVICE_ROLE_KEY` o `RESEND_API_KEY` nel frontend. **[DEDOTTO DAL CODICE]**
- Verificare RLS reali su `affiliates` e `legal_acceptances` (non versionate localmente). **[DA VERIFICARE]**
- Verificare presenza/assegnazione corretta ruolo admin in `app_metadata` utenti reali. **[DA VERIFICARE]**
- Verificare configurazione `verify_jwt` runtime su functions senza `config.toml` locale. **[DA VERIFICARE]**

---

# 19. Bug noti e debiti tecnici

1. Possibile regressione layout admin affiliati (badge fuori card) segnalata utente; codice CSS appare mitigato ma richiede verifica visuale runtime. **[DOCUMENTATO conversazione]** + **[DA VERIFICARE]**
2. Email approvazione affiliato non sempre arrivata in test utente; da correlare con logs function/resend e condizioni `pending -> approved` + `approved_email_sent_at`. **[DOCUMENTATO conversazione]** + **[VERIFICATO CODICE condizioni]** + **[DA VERIFICARE]**
3. Stripe checkout hardcoded `9900` e senza Price ID/coupon/trial reale. **[VERIFICATO CODICE]**
4. `plan_price` e `trial_ends_at` admin non impattano Stripe reale. **[VERIFICATO CODICE]**
5. Claim landing da riallineare alla realtà tecnica/commerciale. **[VERIFICATO CODICE]**
6. Documenti legali con placeholder ancora non compilati. **[VERIFICATO CODICE]**
7. Warning bundle Vite >500 kB riportato in doc. **[DOCUMENTATO MD]**
8. Catch-all `/:slug` da monitorare per collisioni future route. **[VERIFICATO CODICE]**
9. Schema locale Supabase non allineato al reale (affiliates/legal_acceptances + colonne manuali). **[VERIFICATO CODICE]** + **[DOCUMENTATO MD]**
10. “Nessuna carta richiesta” non coerente con checkout card attuale (`payment_method_types[]=card`). **[VERIFICATO CODICE]** + **[DEDOTTO DAL CODICE]**

---

# 20. Test già eseguiti

Nota: in questa analisi non sono stati eseguiti test runtime/build; i punti sotto sono da documentazione esistente.

- `npm run build` OK, warning chunk >500kB non bloccante. **[DOCUMENTATO MD]**
- Legal acceptances merchant OK. **[DOCUMENTATO MD]**
- Legal acceptances affiliate OK. **[DOCUMENTATO MD]**
- Reset password OK. **[DOCUMENTATO MD]**
- Confirm email merchant OK. **[DOCUMENTATO MD]**
- Confirm email affiliate OK. **[DOCUMENTATO MD]**
- Booking OK + push ricevuta. **[DOCUMENTATO MD]**
- Deploy `approve-affiliate` OK. **[DOCUMENTATO MD]**
- Email approvazione affiliato: doc “OK”, ma segnalazione utente “non arrivata” -> stato effettivo da verificare. **[DOCUMENTATO MD + conversazione]** + **[DA VERIFICARE]**
- Stripe pricing/trial/coupon: da sistemare. **[VERIFICATO CODICE]**

---

# 21. Prossime priorità operative

Priorità proposta (allineata alle richieste emerse):

1. Fix/validazione definitiva layout Admin->Affiliati su viewport reali desktop/mobile. **[DA VERIFICARE]**
2. Debug end-to-end `approve-affiliate` (log Edge Function + risposta Resend + `approved_email_sent_at`). **[DA VERIFICARE]**
3. Aggiornare landing claim commerciali/legal-safe.
4. Rifattorizzare Stripe checkout su Price ID + trial 14 gg + coupon founder.
5. Aggiornare webhook Stripe per stati trialing/active e sync metadati prezzo.
6. Drawer/note affiliati: funzionalità presente; valutare solo hardening UX/permessi. **[VERIFICATO CODICE]**
7. Consolidare documentazione (`PROGETTO.md` + questo handoff) con check di coerenza periodico.
8. Upgrade Supabase Pro.
9. Passaggio Stripe live (chiavi/webhook/segreti/test reale).
10. Anthropic account/billing definitivo.
11. Test end-to-end completo (auth, onboarding, affiliate, booking, push, billing).

---

# 22. Comandi operativi utili

## Build / stato git
```bash
npm run build
git status
git add -p
git commit -m "messaggio"
git push
```
**[VERIFICATO CODICE per script build]**

## Deploy Edge Function (pattern progetto)
```bash
npx supabase functions deploy <nome-funzione> --project-ref onkyhknchhlsmcknpinr
```
Esempio documentato:
```bash
npx supabase functions deploy approve-affiliate --project-ref onkyhknchhlsmcknpinr
```
**[DOCUMENTATO MD]** + **[VERIFICATO CODICE project ref in `supabase/.temp/linked-project.json`]**

## Query SQL diagnostiche (senza secret)
```sql
-- legal acceptances recenti
select user_id, context, acceptance_type, source, document_versions, accepted_at, created_at
from public.legal_acceptances
order by created_at desc
limit 100;

-- affiliates e stato email approvazione
select id, user_id, email, code, status, approved_email_sent_at, city, province, phone, legal_name
from public.affiliates
order by created_at desc
limit 100;

-- businesses con dati billing/trial/referral
select id, user_id, name, status, plan, plan_price, trial_ends_at, affiliate_code, stripe_customer_id, stripe_subscription_id
from public.businesses
order by created_at desc
limit 100;
```
**[DEDOTTO DAL CODICE]**

## Controllo colonne esistenti
```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('businesses','affiliates','legal_acceptances')
order by table_name, ordinal_position;
```
**[DEDOTTO DAL CODICE]**

---

# 23. Decisioni commerciali tecniche già prese o preferite

- Prezzo listino preferito: 99,99 €/mese. **[RICHIESTA UTENTE]**
- Founder/partner: -30% per 12 mesi (target ~100 founder iniziali). **[RICHIESTA UTENTE]**
- Trial desiderato: 14 giorni (reale lato Stripe). **[RICHIESTA UTENTE]**
- Evitare claim assoluti “per sempre” e “AI illimitata” senza condizioni. **[RICHIESTA UTENTE]** + **[DEDOTTO DAL CODICE]**
- Email approvazione affiliato senza allegato contratto; link a versione corrente contratto OK. **[VERIFICATO CODICE]**
- Tracciamento accettazione legale tramite `document_versions` nel DB. **[VERIFICATO CODICE]**

Nota implementativa:
- Queste preferenze commerciali non sono ancora completamente implementate nel billing Stripe attuale. **[VERIFICATO CODICE]**

---

# 24. Appendice file critici

- `src/App.jsx` — routing globale, subdomain bypass, route catch-all/ref.
- `src/pages/Auth.jsx` — login/register merchant, checkbox legale, reset email trigger.
- `src/pages/Onboarding.jsx` — creazione business, acceptance merchant, AI description.
- `src/pages/Dashboard.jsx` — shell dashboard, checkout Stripe trigger, polling activation.
- `src/pages/Admin.jsx` — pannello admin business/affiliate, drawer, update interni, invoke approve-affiliate.
- `src/pages/Affiliates.jsx` — dashboard affiliato, bootstrap profilo, acceptance affiliato.
- `src/pages/AffiliatesAuth.jsx` — login/register affiliato, redirect conferma email.
- `src/pages/ResetPassword.jsx` — recovery session + password update + signout.
- `src/components/public/BookingSection.jsx` — booking pubblico + privacy note.
- `src/pages/PublicSite.jsx` — rendering sito pubblico per slug/sottodominio.
- `src/lib/claude.js` — chiamata client a function AI.
- `src/lib/pushSubscription.js` — registrazione push su tabella `push_subscriptions`.
- `src/lib/notifications.js` — scheduling notifiche locali/SW.
- `supabase/functions/claude-proxy/index.ts` — proxy Anthropic + rate limit.
- `supabase/functions/stripe-checkout/index.ts` — checkout subscription (hardcoded price).
- `supabase/functions/stripe-webhook/index.ts` + `config.toml` — verifica firma e attivazione business.
- `supabase/functions/notify-new-booking/index.ts` + `config.toml` — push booking pending.
- `supabase/functions/approve-affiliate/index.ts` — approvazione affiliato + email Resend.
- `supabase/migrations/*.sql` — evoluzione schema locale.
- `legal-docs/*` — testi legali web.
- `src/index.css` — layout globale/admin/public inclusi stili affiliati.

Tutti i riferimenti sopra: **[VERIFICATO CODICE]**.

---

# 25. Output finale richiesto

- File creato/aggiornato: `HANDOFF_TECNICO_PIUM.md`. **[VERIFICATO CODICE]**
- Modifiche effettuate: solo questo file markdown (nessuna modifica codice applicativo, SQL, Edge Functions, Stripe, `.env`). **[VERIFICATO CODICE]**
- Nessun commit eseguito.
- Nessun push eseguito.
- Nessun deploy eseguito.
- Nessuna build eseguita in questa attività (scelta intenzionale per richiesta utente).

