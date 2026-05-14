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

## Completati di recente

- ✅ Sistema affiliati (registrazione, dashboard, approvazione da admin)
- ✅ Gestione piani clienti (trial/active/expired/suspended, prezzo personalizzabile, estensione trial)
- ✅ Login admin separato su route nascosta /x-admin-login
- ✅ Notifiche push con impostazioni personalizzabili (minuti pre-appuntamento, notifica dopo spunta, azione "✓ Fatto" dalla notifica)
- ✅ Documenti GDPR generati (Privacy Policy, Termini di Servizio, DPA, Cookie Policy)
- ✅ Email info@piumapp.com attiva con forwarding su Cloudflare
- ✅ Galleria fotografica carosello nel sito pubblico (fino a 20 foto, compressione automatica)
- ✅ Card panoramica (attività completate, prossime attività, promemoria)
- ✅ PWA installabile con icone
- ✅ Sottodomini personalizzati automatici (nomeattivita.piumapp.com via Cloudflare Worker)
- ✅ Slug puliti per nuovi onboarding (es. bar-roma, bar-roma-2 — senza suffisso casuale)
- ✅ Redesign completo Admin panel: tabella 8 colonne, 6 StatCard (MRR, conversione trial), drawer laterale per ogni cliente
- ✅ Rate limiting AI: 350k token/mese, contatore reale su Edge Function, barra utilizzo in Panoramica, toggle AI illimitata nel drawer admin
- ✅ Affiliato per cliente in admin panel (badge codice in tabella + provenienza con nome affiliato nel drawer)
- ✅ Rimozione di tutti i console.log sensibili (prompt Claude, dati utenti, token)
- ✅ Fix admin panel che mostrava 0 clienti (RLS policy + colonne mancanti)
- ✅ Fix drawer admin non visibile (spostato fuori da adm-shell, z-index 9999)
- ✅ Colonne DB documentate in migration: admin_notes, status, plan_price, trial_ends_at, ai_calls_month, ai_calls_total, ai_tokens_month, ai_calls_month_display, ai_unlimited, ai_reset_date

## Prima del lancio

- [ ] Integrazione Stripe per pagamenti ricorrenti automatici
- [ ] Calcolo automatico guadagni affiliati collegato a Stripe
- [ ] Reset password cliente dal pannello admin
- [ ] Pulizia slug vecchi clienti (migrazione da formato bar-roma-xxxx a bar-roma / bar-roma-2)
- [ ] Debug generale completo prima del lancio
- ✅ Icona PWA funzionante su mobile
- [ ] Sostituire Claude API key temporanea con quella account aziendale prima del lancio
- [ ] Verificare numero di telefono sull'account Anthropic
- [ ] Aggiungere dati di fatturazione completi su Anthropic
- [ ] Template visivi per categoria attività (ristorante, parrucchiere, estetica, ecc.)
- [ ] Opuscolo venditori PDF
- [ ] Verifica onboarding → sito pubblico funzionante end-to-end
- ✅ Bot supporto clienti con FAQ PIUM
- ✅ Sottodominio personalizzato per ogni attività (nomeattivita.piumapp.com)
- ✅ Notifiche push con impostazioni personalizzabili
- ✅ Sistema trial/blocco dopo 1 mese gratis
- ✅ Dashboard affiliati + sistema retribuzione manuale
- ✅ Limite chiamate AI (350k token/mese con reset mensile automatico)
- ✅ Spostare chiamate Claude API su Supabase Edge Functions
- ✅ Admin panel professionale con gestione clienti completa

## Booking system — stato attuale e prossimi step

✅ V1 completata: prenotazione pubblica con sistema pending + conferma manuale titolare

### Da implementare prossima sessione booking:
1. Selezione multipla servizi — il cliente può scegliere più servizi nella stessa prenotazione
2. Messaggio WhatsApp precompilato — quando il titolare conferma, appare un pulsante
   "Invia conferma su WhatsApp" con messaggio già scritto e numero del cliente precompilato
3. Promemoria appuntamento — il giorno prima o X ore prima, nella dashboard appare
   un alert con pulsante "Invia promemoria WhatsApp" con messaggio precompilato

## Fatto in questa sessione

- **Redesign Admin panel**: tabella clienti con 8 colonne (Attività, Email, Stato, Trial, Piano/€, AI/mese, Affiliato, Azioni), 6 StatCard con MRR e tasso di conversione, drawer laterale con stato account, dati attività, salute onboarding, utilizzo AI, note interne
- **Rate limiting AI**: Edge Function `claude-proxy` aggiornata — SELECT biz prima della chiamata Claude, controllo mensile tramite `ai_reset_date`, 429 con `AI_LIMIT_REACHED` se ≥ 350k token, fire-and-forget UPDATE con reset o incremento. Frontend: errore localizzato in Social.jsx e Recensioni.jsx, barra utilizzo "X/350 chiamate" in Panoramica con warning arancione all'80%, toggle AI illimitata nel drawer admin
  - Migration: `20260519_ai_rate_limit.sql` (ai_tokens_month, ai_calls_month_display, ai_unlimited, ai_reset_date)
  - Edge Function deployata con `npx supabase functions deploy`
- **Affiliato per cliente**: colonna `affiliate_code` aggiunta al SELECT in Admin.jsx; `openDrawer` fa join con tabella `affiliates` in parallelo; badge viola con codice in tabella; riga "Provenienza" nel drawer con nome affiliato o "Organico"
- **Rimozione console.log sensibili**: rimossi da Onboarding.jsx (prompt Claude, risposta AI, conferma salvataggio) e Affiliates.jsx (userId + dati affiliato)
- **Fix drawer admin**: spostato `<BusinessDrawer>` fuori da `adm-shell` tramite React Fragment per evitare stacking context con `overflow: hidden`
- **Fix admin 0 clienti**: migration idempotente `20260517_admin_rls_fix.sql` per RLS + `20260518_admin_notes.sql` per colonne fantasma

## Da fare prossima sessione

- Integrazione Stripe (prima priorità assoluta per il lancio)
- Reset password cliente dal pannello admin
- Pulizia slug vecchi clienti (migrazione da formato bar-roma-xxxx a bar-roma)
- Debug generale end-to-end prima del lancio
- Bot supporto clienti con FAQ PIUM

---

## Note tecniche

- **Cloudflare Worker**: `pium-subdomain-proxy` — route `*piumapp.com/*`, DNS wildcard `*.piumapp.com`. Legge lo slug dal sottodominio e fa proxy trasparente verso `www.piumapp.com`. File: `cloudflare-worker.js`
- **Slug generazione**: algoritmo asincrono in `Onboarding.jsx` — verifica unicità su Supabase, formato `bar-roma` con suffisso numerico `-2`, `-3` in caso di collisione
- **Rate limiting AI**: token limit 350.000/mese, confronto `ai_reset_date.slice(0,7)` con mese corrente per reset automatico, `ai_unlimited = true` bypassa il limite per clienti VIP
- **Galleria fotografica**: limite 20 foto, upload multiplo, compressione automatica client-side con `browser-image-compression` (maxSizeMB: 0.8, maxWidthOrHeight: 1920)
- **Infrastruttura storage**: passare a Supabase Pro (25$/mese) quando si raggiungono i primi clienti paganti (100 GB storage invece di 1 GB)
- **Pricing**: 99€/mese. Primi 10 clienti a 69€/mese con prezzo bloccato (piano fondatori)
- **Dominio**: piumapp.com su Cloudflare Registrar, deploy su Vercel
