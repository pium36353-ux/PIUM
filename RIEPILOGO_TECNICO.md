# PIUM — Riepilogo Tecnico

> Ultimo aggiornamento: 23 aprile 2026

---

## 1. Cos'è PIUM

PIUM è una SaaS B2B per attività locali italiane (parrucchieri, ristoranti, palestre, negozi, ecc.).  
Ogni cliente ottiene:
- Un **sito pubblico** generato automaticamente con URL dedicato (`/b/:slug`)
- Una **dashboard** per gestire servizi, recensioni, social e promemoria
- **Generazione AI** di contenuti tramite Claude (descrizioni, risposte recensioni, post social)

Modello di business: **€99/mese** con primo mese gratuito, piano unico tutto incluso.

---

## 2. Stack Tecnico

### Frontend
| Tecnologia | Versione | Ruolo |
|---|---|---|
| React | 19.2.5 | UI library |
| Vite | 8.0.9 | Build tool e dev server |
| React Router DOM | 7.14.2 | Routing SPA |
| Tailwind CSS | 4.2.4 | Sistema CSS (usato via `@import "tailwindcss"`) |
| `@supabase/supabase-js` | 2.104.0 | Client Supabase |

> **Nota CSS**: Tailwind è importato come base, ma tutti gli stili custom sono scritti in `src/index.css` con classi BEM-like prefissate per componente (`auth-`, `db-`, `ob-`, `ps-`, `sv-`, `so-`, `pr-`, `rv-`, `adm-`, `ln-`). Nessun utility class di Tailwind è usato direttamente nel JSX.

### Backend / Infrastruttura
| Servizio | Ruolo |
|---|---|
| **Supabase** | Database PostgreSQL, Auth, RLS, Storage |
| **Anthropic API** | Generazione testi con Claude Sonnet |
| **Vercel** (previsto) | Hosting frontend SPA |
| **GitHub** | Versionamento (`pium36353-ux/PIUM`) |

### Struttura file sorgente
```
src/
├── App.jsx                          # Router principale (6 rotte)
├── main.jsx                         # Entry point React
├── index.css                        # Tutti gli stili (~4870 righe)
├── lib/
│   ├── supabase.js                  # Client Supabase
│   └── claude.js                    # Wrapper chiamate Anthropic API
├── pages/
│   ├── Landing.jsx                  # Homepage pubblica (224 righe)
│   ├── Auth.jsx                     # Login / registrazione (233 righe)
│   ├── Onboarding.jsx               # Wizard 3 step (420 righe)
│   ├── Dashboard.jsx                # Shell dashboard + sidebar (176 righe)
│   ├── PublicSite.jsx               # Sito pubblico cliente (232 righe)
│   └── Admin.jsx                    # Pannello fondatore (422 righe)
└── components/dashboard/
    ├── Panoramica.jsx               # ⬜ stub
    ├── EditorSito.jsx               # ⬜ stub
    ├── Servizi.jsx                  # CRUD servizi (370 righe)
    ├── Social.jsx                   # Bozze social AI (554 righe)
    ├── Recensioni.jsx               # Recensioni + AI reply (460 righe)
    └── Promemoria.jsx               # Promemoria CRUD (378 righe)
```

---

## 3. Database Supabase

### Tabelle
| Tabella | Descrizione | Campi chiave |
|---|---|---|
| `businesses` | Attività cliente | `user_id`, `name`, `slug`, `category`, `description`, `phone`, `whatsapp`, `email`, `city`, `address`, `is_active`, `plan`, `created_at` |
| `services` | Servizi offerti | `business_id`, `name`, `price`, `price_label`, `duration_min`, `is_available`, `sort_order` |
| `site_content` | Blocchi CMS mini-sito | `business_id`, `block_key`, `title`, `body`, `is_published` |
| `social_drafts` | Bozze post social | `business_id`, `platform`, `content`, `hashtags`, `status`, `ai_generated` |
| `reviews` | Recensioni clienti | `business_id`, `author_name`, `rating`, `body`, `source`, `reply`, `replied_at` |
| `reminders` | Promemoria | `business_id`, `user_id`, `title`, `due_at`, `priority`, `status` |
| `analytics_events` | Tracking eventi | `business_id`, `event_type`, `page`, `occurred_at` |

### Sicurezza (Row Level Security)
- **RLS abilitato** su tutte e 7 le tabelle
- Policy principale: ogni utente accede solo ai propri dati (`auth.uid() = user_id`)
- Policy pubblica: lettura su `businesses` (attive), `services` (disponibili), `reviews` (visibili), `site_content` (pubblicato)
- Policy admin: lettura e update su tutte le `businesses` per utenti con `app_metadata.role = 'admin'`

### Migrations
- `supabase/schema.sql` — schema completo iniziale
- `supabase/migrations/20260422_add_whatsapp_to_businesses.sql` — aggiunta campo `whatsapp`
- `supabase/migrations/20260423_admin_panel.sql` — aggiunta campo `plan` + policy admin

---

## 4. Funzionalità Implementate

### Autenticazione (`/auth`)
- Login, registrazione e recupero password via Supabase Auth
- Redirect automatico a `/onboarding` dopo la registrazione
- Redirect a `/dashboard` se già autenticato

### Onboarding (`/onboarding`)
- Wizard 3 step: dati attività → contatti → anteprima
- Salvataggio su tabella `businesses`
- **Generazione automatica descrizione AI** con Claude dopo il salvataggio
- Generazione `slug` univoco dall'onboarding

### Dashboard (`/dashboard`)
- Sidebar fissa (desktop) con 6 sezioni navigabili
- Drawer mobile con overlay
- Caricamento automatico dati attività; redirect a `/onboarding` se nessuna attività trovata

#### Servizi
- Lista servizi con disponibilità toggle
- Modal aggiunta/modifica: nome, descrizione, prezzo, label prezzo, durata (con preview formattata), disponibilità
- Eliminazione con conferma inline

#### Social
- Generazione bozze post con Claude AI
- Parametri: piattaforma (Instagram/Facebook), argomento, tono (5 opzioni)
- Output JSON con `content` + `hashtags`
- Preview, rigenera, modifica, approva, elimina

#### Recensioni
- Aggiunta manuale recensioni: autore, stelle (1-5), testo, fonte (Google/TripAdvisor/Facebook/Yelp/manuale), data
- **Generazione risposta AI** con tono adattivo al voto (≥4: caloroso, =3: costruttivo, ≤2: empatico)
- Flusso modifica → salva come inviata (`replied_at`)
- Riepilogo con media voti e grafico a barre
- Filtro per numero di stelle

#### Promemoria
- CRUD completo con titolo, note, scadenza, priorità (alta/media/bassa)
- Toggle completato/da fare
- Etichette scadenza intelligenti (scaduto / oggi / domani / x giorni)
- Doppio filtro: stato + priorità

### Sito Pubblico (`/b/:slug`)
- Pagina pubblica per ogni attività
- Hero con nome, categoria, descrizione
- Lista servizi con prezzi e durate
- Pulsanti contatto: telefono, WhatsApp, email
- Link Google Maps
- Responsive, dark mode automatica

### Admin Panel (`/admin`)
- Accesso riservato: controlla `user.app_metadata.role === 'admin'`
- Lista tutti i clienti con: nome attività, email, città, piano, stato, data registrazione
- Ricerca full-text (nome, email, città)
- Filtro per stato (attivo / trial / inattivo)
- Modifica piano inline (trial / free / starter / pro)
- Toggle attiva/disattiva cliente
- 4 stat card: totali, attivi, trial, inattivi

### Landing Page (`/`)
- Navbar sticky con link sezioni + CTA
- Hero con headline, sottotitolo, doppia CTA, social proof
- Sezione funzionalità (3 card)
- Sezione prezzi (piano unico €99/mese, badge "1 mese gratis", 8 feature)
- Footer con link privacy/termini/contatti

---

## 5. Integrazione AI (Claude)

**File**: `src/lib/claude.js`  
**Modello**: `claude-sonnet-4-5-20251001`  
**Modalità**: chiamata diretta dal browser con header `anthropic-dangerous-direct-browser-access: true`

### Usi AI nel prodotto
| Dove | Cosa genera | Prompt |
|---|---|---|
| Onboarding | Descrizione attività professionale | Dati inseriti nel wizard |
| Social | Post Instagram/Facebook + hashtags | Piattaforma + argomento + tono scelto |
| Recensioni | Risposta al cliente | Testo recensione + voto + info attività |

### ⚠️ Problema sicurezza attuale
La chiave API Anthropic è esposta nel frontend (`VITE_CLAUDE_API_KEY`). Chiunque possa aprire i DevTools può leggerla.  
**Soluzione prevista**: spostare tutte le chiamate su **Supabase Edge Functions** prima del lancio.

---

## 6. Costi Operativi Stimati

### Supabase
| Piano | Costo | Limiti |
|---|---|---|
| Free | €0/mese | 500 MB DB, 50.000 utenti auth, 2 GB bandwidth |
| Pro | ~€25/mese | 8 GB DB, 100.000 utenti auth, 250 GB bandwidth |

> Stima: il piano **Free** regge fino a ~50 clienti attivi. Oltre, passare a **Pro (~€25/mese)**.

### Vercel
| Piano | Costo | Limiti |
|---|---|---|
| Hobby | €0/mese | 100 GB bandwidth, deploy illimitati, no dominio custom su team |
| Pro | ~€20/mese | 1 TB bandwidth, dominio custom, analytics avanzate |

> Stima: il piano **Hobby** è sufficiente per il lancio. Passare a **Pro** se si vuole un dominio custom di team o analytics.

### Anthropic API (Claude Sonnet)
| Operazione | Token stimati | Costo per chiamata |
|---|---|---|
| Descrizione attività (onboarding) | ~600 input + ~200 output | ~€0,003 |
| Post social | ~400 input + ~300 output | ~€0,003 |
| Risposta recensione | ~300 input + ~150 output | ~€0,002 |

**Prezzi Claude Sonnet 4.5** (indicativi):
- Input: ~$3 / 1M token
- Output: ~$15 / 1M token

| Scenario | Clienti | Uso medio AI/mese | Costo AI/mese |
|---|---|---|---|
| Lancio | 10 clienti | 30 chiamate/cliente | ~€1,5 |
| Crescita | 100 clienti | 30 chiamate/cliente | ~€15 |
| Scala | 500 clienti | 30 chiamate/cliente | ~€75 |

### Totale stimato a regime (100 clienti)
| Voce | Costo/mese |
|---|---|
| Supabase Pro | €25 |
| Vercel Pro | €20 |
| Anthropic API | ~€15 |
| **Totale costi** | **~€60/mese** |
| **Ricavi (100 × €99)** | **€9.900/mese** |
| **Margine lordo** | **~€9.840/mese** |

---

## 7. Stato Attuale

### Completato ✅
- Setup progetto (Vite + React + Supabase + Tailwind)
- Schema database completo con RLS
- Auth (login, registrazione, recupero password)
- Onboarding wizard 3 step con AI
- Dashboard completa (shell + sidebar + mobile)
- Servizi (CRUD completo)
- Social (generazione AI + gestione bozze)
- Recensioni (+ risposte AI)
- Promemoria (CRUD + stati)
- Sito pubblico cliente (`/b/:slug`)
- Landing page pubblica
- Admin panel (protezione ruolo, gestione clienti)
- Migrazione `plan` column + RLS admin

### Non ancora implementato ⬜
| Funzionalità | Note |
|---|---|
| **Panoramica** (dashboard home) | Stub vuoto — da fare: metriche rapide, recap attività recente |
| **Editor Sito** | Stub vuoto — da fare: editing blocchi CMS, anteprima live |
| **Analytics** | Tabella `analytics_events` pronta, manca UI |
| **Dashboard affiliati** | Non iniziata |
| **Deploy + dominio** | Non configurato |

---

## 8. Cosa Manca Prima del Lancio

### Tecnico
- [ ] **Spostare Claude API su Edge Functions** — la chiave è attualmente esposta nel browser
- [ ] Implementare `Panoramica.jsx` — sezione home della dashboard
- [ ] Implementare `EditorSito.jsx` — editor CMS mini-sito
- [ ] Rimuovere tutti i `console.log` di debug (supabase.js, claude.js, PublicSite.jsx, Onboarding.jsx)
- [ ] Applicare migrazione `20260422` e `20260423` sul progetto Supabase di produzione
- [ ] Configurare dominio e deploy su Vercel
- [ ] Aggiungere `meta description` e OG tags alla landing page

### Account Anthropic
- [ ] Verificare numero di telefono sull'account Anthropic
- [ ] Aggiungere dati di fatturazione completi
- [ ] Descrivere il progetto nel profilo Anthropic

### Business / Legale
- [ ] Scrivere pagina Privacy Policy
- [ ] Scrivere Termini di Servizio
- [ ] Configurare metodo di pagamento (Stripe o simile)
- [ ] Definire flusso cancellazione account

---

## 9. Repository

- **GitHub**: `https://github.com/pium36353-ux/PIUM`
- **Branch principale**: `master`
- **File env**: `.env` (escluso da git via `.gitignore`)
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_CLAUDE_API_KEY`
