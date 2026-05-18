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
  - *Panoramica*: hero card appuntamenti oggi + calendario mensile, contatori (promemoria, servizi, bozze social, recensioni), card prossime attività, card promemoria in scadenza, card attività completate, barra utilizzo AI con reset mensile
  - *Agenda*: vista giornaliera con timeline slot 30 min, vista mensile con griglia; drum-scroll date picker; gestione dipendenti (modal centrato); prenotazioni pubbliche con sistema pending/conferma; notifiche push appuntamenti
  - *Servizi*: CRUD completo, toast eliminazione
  - *Social*: generazione bozze AI con Claude (include link sito pubblico nel testo), approvazione/eliminazione, toast eliminazione
  - *Recensioni*: lista recensioni, risposta AI con Claude, toast eliminazione
  - *Promemoria*: CRUD, stati pending/done, urgenza colorata (rosso/arancio/verde)
  - *Editor Sito*: modifica dati attività, caricamento foto profilo + galleria (max 20 foto, compressione auto), orari, descrizione
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
