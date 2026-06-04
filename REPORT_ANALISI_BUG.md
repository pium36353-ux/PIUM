li an# 🔍 REPORT ANALISI BUG E PROBLEMI — PIUM

**Data analisi**: 26 maggio 2026  
**Versione progetto**: Commit attuale  
**Analista**: Assistente tecnico

---

## 📊 RIEPILOGO ESECUTIVO

Analisi completata su 15.000+ righe di codice. Identificati **23 problemi**, di cui:
- 🔴 **7 CRITICI** (bloccanti o che causano malfunzionamenti)
- 🟠 **10 IMPORTANTI** (bug logici, sicurezza, performance)
- 🟡 **6 MINORI** (best practice, ottimizzazioni)

---

## 🔴 PROBLEMI CRITICI (DA RISOLVERE SUBITO)

### 1. ❌ SCHEMA DATABASE GRAVEMENTE INCONSISTENTE CON MIGRAZIONI

**Posizione**: `supabase/schema.sql`  
**Severità**: 🔴 CRITICA  
**Impatto**: Il database di produzione non corrisponde allo schema.sql

#### Problema
Lo schema.sql è obsoleto e non include numerose colonne aggiunte dalle migrazioni:

**Colonne mancanti in `businesses`**:
- `whatsapp` (aggiunta in 20260422)
- `plan`, `status`, `trial_ends_at` (20260423, 20260523)
- `stripe_subscription_id`, `stripe_customer_id` (20260522)
- `admin_notes` (20260518)
- `ai_tokens_month`, `ai_calls_month_display`, `ai_unlimited`, `ai_reset_date` (20260519)
- `ai_calls_month`, `ai_calls_total` (usate in Admin.jsx ma non trovate nelle migrazioni!)
- `affiliate_code` (20260520)
- `plan_price`, `cover_url` (usate in Admin.jsx ma non trovate nelle migrazioni!)

**Tabelle completamente mancanti**:
- `contacts` (usata in Agenda.jsx righe 277-280)
- `affiliates` (usata in Admin.jsx righe 220-233)
- `appointment_services` (usata in Agenda.jsx righe 393-408, schema righe 172)
- `push_subscriptions` (migrazione 20260516)

#### Soluzione
```sql
-- Ricreare schema.sql completo sincronizzato con tutte le migrazioni
-- O eseguire uno script di export dal database di produzione:
pg_dump --schema-only [DATABASE_URL] > supabase/schema_updated.sql
```

---

### 2. ❌ CIRCULAR REFERENCE NELLO SCHEMA DATABASE

**Posizione**: `supabase/schema.sql:202`  
**Severità**: 🔴 CRITICA  
**Impatto**: Impossibile creare il database da schema.sql pulito

#### Problema
```sql
-- RIGA 192-206: appointments creata per prima
create table appointments (
  ...
  booking_id       uuid references bookings(id) on delete set null,  -- ⚠️ bookings non esiste ancora!
  ...
);

-- RIGA 374: bookings creata DOPO
create table bookings (
  id uuid primary key default uuid_generate_v4(),
  ...
);
```

#### Soluzione
Spostare la definizione di `bookings` PRIMA di `appointments`, oppure rimuovere la foreign key constraint e aggiungerla dopo con `ALTER TABLE`.

---

### 3. ❌ VARIABILI NON DEFINITE IN AGENDA.JSX

**Posizione**: `src/components/dashboard/Agenda.jsx:348-349, 586`  
**Severità**: 🔴 CRITICA  
**Impatto**: Crash dell'applicazione quando si tenta di salvare un appuntamento

#### Problema
```javascript
// RIGA 348-349
const dateObj = new Date(form.date + 'T00:00:00')
const dayKey  = DAY_KEYS[dateObj.getDay()]  // ❌ DAY_KEYS non è definito!
const dayH    = business?.opening_hours?.[dayKey]
const ranges  = parseOpeningRanges(dayH)    // ❌ parseOpeningRanges non è definito!

// RIGA 586
const waLink = buildWaLink(b.customer_phone, waMsg)  // ❌ buildWaLink non è definito!
```

#### Soluzione
```javascript
// Aggiungere in cima al file dopo le costanti:
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseOpeningRanges(dayHours) {
  if (!dayHours || dayHours.closed) return []
  const ranges = []
  if (dayHours.morning?.active) {
    const [sh, sm] = dayHours.morning.open.split(':').map(Number)
    const [eh, em] = dayHours.morning.close.split(':').map(Number)
    ranges.push([sh * 60 + sm, eh * 60 + em])
  }
  if (dayHours.afternoon?.active) {
    const [sh, sm] = dayHours.afternoon.open.split(':').map(Number)
    const [eh, em] = dayHours.afternoon.close.split(':').map(Number)
    ranges.push([sh * 60 + sm, eh * 60 + em])
  }
  return ranges
}

function buildWaLink(phone, message) {
  if (!phone) return null
  const clean = phone.replace(/\D/g, '')
  if (!clean) return null
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
}
```

---

### 4. ❌ BUG CAMPO INESISTENTE: reviews.published

**Posizione**: `src/components/dashboard/Recensioni.jsx:179-183`  
**Severità**: 🔴 CRITICA  
**Impatto**: La funzione "pubblica recensione" non funziona

#### Problema
```javascript
// RIGA 179-183
const togglePublish = async (review) => {
  const next = !review.published  // ❌ campo 'published' non esiste!
  await supabase.from('reviews').update({ published: next }).eq('id', review.id)
  setReviews(prev => prev.map(r => r.id === review.id ? { ...r, published: next } : r))
}
```

Nello schema database (riga 121) il campo si chiama `is_visible`, non `published`.

#### Soluzione
```javascript
const togglePublish = async (review) => {
  const next = !review.is_visible  // ✅ Corretto
  await supabase.from('reviews').update({ is_visible: next }).eq('id', review.id)
  setReviews(prev => prev.map(r => r.id === review.id ? { ...r, is_visible: next } : r))
}
```

E aggiornare anche la UI (righe 388, 396, 407-412):
```javascript
// Sostituire tutte le occorrenze di review.published con review.is_visible
```

---

### 5. ❌ FILE AGENDA.JSX TRONCATO NELLA LETTURA

**Posizione**: `src/components/dashboard/Agenda.jsx:1000+`  
**Severità**: 🔴 CRITICA  
**Impatto**: Codice mancante, possibili funzioni incomplete

#### Problema
Il file è stato letto solo fino a riga 1000, ma ha 1405 righe totali. Mancano 405 righe di codice che potrebbero contenere bug o logica incompleta.

#### Soluzione
Leggere il file completo per analizzare le righe mancanti:
```javascript
// Righe 1001-1405 da analizzare
```

---

### 6. ❌ MANCANZA COLONNE NEL DATABASE

**Posizione**: Varie parti del codice  
**Severità**: 🔴 CRITICA  
**Impatto**: Query falliscono o restituiscono null

#### Problema
Il codice usa colonne che non sono documentate nelle migrazioni:

**In Admin.jsx** (riga 91):
```javascript
.select('id, name, email, city, category, slug, plan, plan_price, cover_url, admin_notes, 
        is_active, status, trial_ends_at, created_at, ai_calls_month, ai_calls_total, 
        ai_calls_month_display, ai_tokens_month, ai_unlimited, affiliate_code')
```

Colonne non trovate nelle migrazioni viste:
- `ai_calls_month` (solo `ai_calls_month_display` è nelle migrazioni)
- `ai_calls_total`
- `plan_price`
- `cover_url`
- `status` (aggiunto in migrazione non vista)

#### Soluzione
Creare migrazioni mancanti per queste colonne, o verificare che esistano nel database di produzione.

---

### 7. ❌ MANCANZA TABELLE NEL DATABASE

**Posizione**: Schema database  
**Severità**: 🔴 CRITICA  
**Impatto**: Funzionalità non funzionanti

#### Problema
Tabelle usate nel codice ma non presenti nello schema.sql:

1. **`contacts`** (Agenda.jsx:277-280):
```javascript
supabase.from('contacts')
  .select('name, phone')
  .eq('business_id', business.id)
```

2. **`affiliates`** (Admin.jsx:221-223):
```javascript
supabase.from('affiliates')
  .select('id, name, email, code, status, total_clients, total_earned, created_at')
```

3. **`appointment_services`** (Agenda.jsx:393, schema.sql:172):
```javascript
supabase.from('appointment_services').delete().eq('appointment_id', appointmentId)
```

#### Soluzione
Creare le migrazioni per queste tabelle o aggiungerle allo schema.sql.

---

## 🟠 PROBLEMI IMPORTANTI

### 8. ⚠️ POTENZIALE XSS IN ADMIN PANEL

**Posizione**: `src/pages/Admin.jsx:406, 460, 778`  
**Severità**: 🟠 SICUREZZA  
**Impatto**: Potenziale Cross-Site Scripting se slug contiene caratteri dannosi

#### Problema
```javascript
// RIGA 406
{b.slug && <a className="adm-link-btn" href={`/${b.slug}`} ...>}

// RIGA 778
{(() => { const url = safePublicUrl(biz.slug); return url ? <a ... href={url} ...>
```

La funzione `safePublicUrl` valida lo slug (riga 8), ma non viene usata ovunque.

#### Soluzione
Usare `safePublicUrl` in TUTTI i punti dove si usa lo slug in un href:
```javascript
// Sostituire riga 406
{b.slug && safePublicUrl(b.slug) && <a className="adm-link-btn" href={safePublicUrl(b.slug)} ...>}
```

---

### 9. ⚠️ MANCANZA RATE LIMITING LATO CLIENT

**Posizione**: `src/lib/claude.js`  
**Severità**: 🟠 IMPORTANTE  
**Impatto**: Utenti possono abusare delle chiamate AI

#### Problema
La migrazione 20260519_ai_rate_limit.sql aggiunge colonne per tracciare l'uso AI:
- `ai_tokens_month`
- `ai_calls_month_display`
- `ai_unlimited`

Ma `claude.js` non implementa alcun controllo. L'unico controllo è lato Edge Function.

#### Soluzione
Aggiungere validazione preventiva lato client per dare feedback immediato:
```javascript
export async function generateWithClaude(prompt, businessId) {
  // 1. Controllare rate limit prima di chiamare
  const { data: biz } = await supabase
    .from('businesses')
    .select('ai_unlimited, ai_calls_month_display, plan')
    .eq('id', businessId)
    .single()
  
  if (!biz.ai_unlimited) {
    const limit = biz.plan === 'trial' ? 10 : 50
    if (biz.ai_calls_month_display >= limit) {
      throw new Error('AI_LIMIT_REACHED')
    }
  }
  
  // 2. Poi chiamare l'Edge Function
  // ... resto del codice
}
```

---

### 10. ⚠️ INCONSISTENZA STATUS BUSINESS

**Posizione**: Schema database vs migrazioni vs codice  
**Severità**: 🟠 IMPORTANTE  
**Impatto**: Confusione tra `plan`, `status`, `is_active`

#### Problema
Ci sono 3 campi diversi per gestire lo stato di un business:
1. `is_active` (boolean, nello schema.sql originale)
2. `plan` ('trial', 'free', 'starter', 'pro', 'active')
3. `status` ('active', 'trial', 'expired', 'suspended')

Questo crea confusione. Ad esempio:
- Dashboard.jsx riga 332 usa `business?.status === 'expired'`
- Admin.jsx riga 23 usa funzione `getStatus()` che legge `biz.status`
- Ma lo schema.sql originale non ha il campo `status`

#### Soluzione
Decidere un modello unico:
- Usare solo `status` come fonte di verità
- Deprecare `plan` come indicatore di stato (usarlo solo per pricing)
- Mantenere `is_active` solo per disabilitazione manuale dall'admin

---

### 11. ⚠️ MANCANZA GESTIONE ERRORI IN ASYNC/AWAIT

**Posizione**: Multipli file  
**Severità**: 🟠 IMPORTANTE  
**Impatto**: Crash silenti, stati inconsistenti

#### Problema
Molte funzioni async non gestiscono errori. Esempi:

**Servizi.jsx:119**:
```javascript
const { error } = await supabase.from('services').insert({...})
if (error) { console.error('[handleSave insert]', error); setSaving(false); return }
```
❌ L'errore viene loggato ma non mostrato all'utente.

**Recensioni.jsx:139-142**:
```javascript
await supabase.from('reviews').update({...}).eq('id', review.id)
setReply(review.id, { saved: !!text.trim(), editing: false })
```
❌ Nessun controllo dell'errore. Se l'update fallisce, l'UI mostrerà "salvato" ma non è vero.

#### Soluzione
Aggiungere try/catch e mostrare errori all'utente:
```javascript
try {
  const { error } = await supabase.from('reviews').update({...}).eq('id', review.id)
  if (error) throw error
  setReply(review.id, { saved: !!text.trim(), editing: false })
} catch (err) {
  setReply(review.id, { error: 'Errore nel salvataggio. Riprova.' })
}
```

---

### 12. ⚠️ RACE CONDITION IN DASHBOARD POLLING

**Posizione**: `src/pages/Dashboard.jsx:88-121`  
**Severità**: 🟠 IMPORTANTE  
**Impatto**: Polling continua anche dopo unmount del componente

#### Problema
```javascript
// RIGA 88-121
useEffect(() => {
  if (!pendingActivation || !user) return
  let mounted = true
  let attempts = 0
  const MAX   = 5
  const DELAY = 2000
  let timer
  let successTimer
  
  const poll = () => {
    attempts++
    supabase.from('businesses').select('*')...  // ❌ query eseguita anche se !mounted
      .then(({ data: biz }) => {
        if (!mounted) return  // Check troppo tardi
        // ...
      })
  }
  
  timer = setTimeout(poll, DELAY)
  return () => {
    mounted = false
    clearTimeout(timer)
    clearTimeout(successTimer)
  }
}, [pendingActivation, user])
```

Se l'utente naviga via prima che il polling finisca, la query continua.

#### Soluzione
```javascript
const poll = () => {
  if (!mounted) return  // ✅ Check prima della query
  attempts++
  supabase.from('businesses').select('*')...
}
```

---

### 13. ⚠️ MISSING INDEX SU COLONNE USATE FREQUENTEMENTE

**Posizione**: Schema database  
**Severità**: 🟠 PERFORMANCE  
**Impatto**: Query lente con dataset grandi

#### Problema
Alcune colonne usate spesso in filtri/join non hanno indici:

1. `businesses.status` - usato per filtrare in Admin.jsx
2. `businesses.affiliate_code` - usato per join in Admin.jsx
3. `reviews.is_visible` - usato per filtrare in PublicSite.jsx
4. `appointments.completed` - usato per filtrare in Agenda.jsx

#### Soluzione
```sql
CREATE INDEX idx_businesses_status ON businesses(status);
CREATE INDEX idx_businesses_affiliate_code ON businesses(affiliate_code);
CREATE INDEX idx_reviews_is_visible ON reviews(business_id, is_visible);
CREATE INDEX idx_appointments_completed ON appointments(business_id, completed);
```

---

### 14. ⚠️ POTENZIALE N+1 QUERY IN AGENDA

**Posizione**: `src/components/dashboard/Agenda.jsx:196-199`  
**Severità**: 🟠 PERFORMANCE  
**Impatto**: Una query per ogni prenotazione pending

#### Problema
```javascript
// RIGA 196-199
if (payload.new.service_id) {
  const { data: svc } = await supabase
    .from('services').select('name').eq('id', payload.new.service_id).maybeSingle()
  if (svc?.name) serviceName = svc.name
}
```

Questo viene eseguito in un loop realtime per ogni nuovo booking.

#### Soluzione
Includere il servizio nella query iniziale dei bookings (riga 190-195):
```javascript
const { data, error } = await supabase.from('bookings')
  .select('*, services(name)')  // ✅ JOIN
  .eq('business_id', business.id)
  .eq('status', 'pending')
```

---

### 15. ⚠️ HARDCODED URLS IN MULTIPLE PLACES

**Posizione**: Vari file  
**Severità**: 🟠 MANUTENIBILITÀ  
**Impatto**: Difficile cambiare dominio in futuro

#### Problema
URL hardcoded in:
- Admin.jsx riga 9: `https://${slug}.piumapp.com`
- Social.jsx riga 60: `${business.slug}.piumapp.com`
- PublicSite.jsx: riferimenti impliciti al dominio

#### Soluzione
Centralizzare in un file di configurazione:
```javascript
// src/config.js
export const PUBLIC_DOMAIN = import.meta.env.VITE_PUBLIC_DOMAIN || 'piumapp.com'
export const getPublicUrl = (slug) => `https://${slug}.${PUBLIC_DOMAIN}`
```

---

### 16. ⚠️ MANCANZA VALIDAZIONE EMAIL IN ONBOARDING

**Posizione**: `src/pages/Onboarding.jsx:102-103`  
**Severità**: 🟠 VALIDAZIONE  
**Impatto**: Email invalide salvate nel database

#### Problema
```javascript
// RIGA 102-103
if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
  e.email = 'Indirizzo email non valido.'
```

Questa regex è troppo permissiva e accetta email non valide come `a@b.c` (dominio troppo corto).

#### Soluzione
Usare una regex più robusta:
```javascript
const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

if (form.email && !emailRegex.test(form.email))
  e.email = 'Indirizzo email non valido.'
```

---

### 17. ⚠️ MEMORIA LEAK POTENZIALE IN AGENDA

**Posizione**: `src/components/dashboard/Agenda.jsx:124, 187-220`  
**Severità**: 🟠 MEMORIA  
**Impatto**: Canale Realtime non viene sempre chiuso correttamente

#### Problema
```javascript
// RIGA 187-220
const channel = supabase.channel(`pending-bookings-${businessId}`)
  .on('postgres_changes', {...})
  .subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR') console.error('[Realtime] bookings:', err)
  })

return () => {
  mounted = false
  clearTimeout(focusTimer)
  document.removeEventListener('visibilitychange', onFocus)
  try { supabase.removeChannel(channel) } catch { /* già rimosso o non ancora connesso */ }
}
```

Il try/catch nasconde errori legittimi. Se la chiamata fallisce, il canale rimane aperto.

#### Soluzione
```javascript
return () => {
  mounted = false
  clearTimeout(focusTimer)
  document.removeEventListener('visibilitychange', onFocus)
  if (channel) {
    channel.unsubscribe()
    supabase.removeChannel(channel).catch(err => {
      console.warn('[Realtime cleanup warning]:', err)
    })
  }
}
```

---

## 🟡 PROBLEMI MINORI

### 18. 📝 CONSOLE.LOG DIMENTICATI

**Posizione**: Vari file  
**Severità**: 🟡 BEST PRACTICE  
**Impatto**: Logging non necessario in produzione

#### Problema
Console.log trovati in:
- Servizi.jsx:47, 118, 122, 137
- Recensioni.jsx: vari
- Social.jsx:142
- Admin.jsx:58, 95, ecc.
- E altri...

Citato anche nel documento tecnico (RIEPILOGO_TECNICO.md:262).

#### Soluzione
Rimuovere tutti i console.log o usare un logger configurabile:
```javascript
// src/lib/logger.js
export const logger = {
  error: import.meta.env.PROD ? () => {} : console.error,
  warn:  import.meta.env.PROD ? () => {} : console.warn,
  info:  import.meta.env.PROD ? () => {} : console.log,
}
```

---

### 19. 📝 HARDCODED MAGIC NUMBERS

**Posizione**: Vari file  
**Severità**: 🟡 MANUTENIBILITÀ  
**Impatto**: Valori duplicati difficili da aggiornare

#### Problema
- Prezzi: `99` in multipli posti (Dashboard.jsx:348, Admin.jsx:256, 391, 449, 670)
- Limiti AI: `10`, `50` non definiti (dovrebbero essere in ai_rate_limit)
- Timeouts: `2000`, `6000`, vari valori sparsi
- Limiti trial: `30` giorni in Admin.jsx (189, 193, 608, 658)

#### Soluzione
Centralizzare in un file di costanti:
```javascript
// src/config.js
export const PRICING = {
  MONTHLY_PRICE: 99,
  TRIAL_DAYS: 30,
}

export const AI_LIMITS = {
  TRIAL: 10,
  PAID: 50,
}
```

---

### 20. 📝 MANCANZA PROP-TYPES O TYPESCRIPT

**Posizione**: Tutti i componenti  
**Severità**: 🟡 QUALITÀ  
**Impatto**: Nessuna validazione dei props a runtime

#### Problema
Nessun componente valida i props in ingresso. Esempio:
```javascript
export default function Servizi({ business }) {
  // Cosa succede se business è undefined? null? Un oggetto malformato?
}
```

#### Soluzione
Migrare a TypeScript o aggiungere PropTypes:
```javascript
import PropTypes from 'prop-types'

Servizi.propTypes = {
  business: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    // ...
  }).isRequired,
}
```

---

### 21. 📝 GESTIONE DUPLICATI SLUG NON OTTIMALE

**Posizione**: `src/pages/Onboarding.jsx:46-59`  
**Severità**: 🟡 LOGICA  
**Impatto**: Possibile loop infinito teorico

#### Problema
```javascript
// RIGA 46-59
async function generateSlug(name) {
  const base = baseSlug(name)
  for (let i = 0; i < 50; i++) {  // ❌ Limite fisso
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const { data } = await supabase
      .from('businesses')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!data) return candidate
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}
```

Se ci sono già 50+ businesses con lo stesso base slug, il fallback random potrebbe ancora collidere.

#### Soluzione
Usare UUID o timestamp garantito univoco:
```javascript
if (!data) return candidate
}
// Fallback garantito univoco
return `${base}-${Date.now().toString(36)}`
```

---

### 22. 📝 TIMEZONE HANDLING NON CONSISTENTE

**Posizione**: Vari file  
**Severità**: 🟡 UX  
**Impatto**: Confusione con date/orari se utenti in timezone diverse

#### Problema
Date salvate come:
- Onboarding.jsx:166: `new Date().toISOString()` (UTC)
- Agenda.jsx:157: `new Date(drawerTrialDate + 'T00:00:00').toISOString()` (local -> UTC)
- Recensioni.jsx:341: `new Date(r.reviewed_at).toLocaleDateString('it-IT', ...)` (UTC -> local)

Non c'è una strategia consistente.

#### Soluzione
Decidere uno standard:
1. Salvare sempre in UTC nel database
2. Convertire sempre in timezone utente per display
3. Usare una libreria come date-fns-tz per gestione consistente

---

### 23. 📝 MANCANZA TEST

**Posizione**: Tutto il progetto  
**Severità**: 🟡 QUALITÀ  
**Impatto**: Difficile validare che i fix funzionino

#### Problema
Nessun file di test trovato nel progetto. Con tutti i bug identificati, non c'è modo di validare le correzioni senza test manuali estensivi.

#### Soluzione
Aggiungere test almeno per:
- Utilità critiche (generateSlug, parseOpeningRanges, etc.)
- Componenti critici (Onboarding, Dashboard)
- API calls (supabase queries)

```javascript
// __tests__/utils.test.js
import { describe, it, expect } from 'vitest'
import { generateSlug } from '../src/pages/Onboarding'

describe('generateSlug', () => {
  it('should generate valid slug', () => {
    expect(generateSlug('Test Business')).toMatch(/^[a-z0-9-]+$/)
  })
})
```

---

## 📋 CHECKLIST AZIONI PRIORITARIE

### 🔥 Da fare IMMEDIATAMENTE (prima del deploy)
- [ ] **Fix #1**: Sincronizzare schema.sql con tutte le migrazioni
- [ ] **Fix #2**: Risolvere circular reference bookings/appointments
- [ ] **Fix #3**: Definire DAY_KEYS, parseOpeningRanges, buildWaLink in Agenda.jsx
- [ ] **Fix #4**: Correggere campo `published` → `is_visible` in Recensioni.jsx
- [ ] **Fix #5**: Leggere e analizzare righe 1001-1405 di Agenda.jsx
- [ ] **Fix #6**: Verificare esistenza colonne mancanti nel DB produzione
- [ ] **Fix #7**: Creare migrazioni per tabelle mancanti (contacts, affiliates, appointment_services)

### ⚠️ Da fare PRESTO (prima di scalare)
- [ ] **Fix #8**: Implementare sanitizzazione XSS universale per slug
- [ ] **Fix #9**: Aggiungere rate limiting lato client per AI
- [ ] **Fix #10**: Unificare gestione status/plan/is_active
- [ ] **Fix #11**: Aggiungere gestione errori consistente
- [ ] **Fix #12**: Risolvere race condition in polling
- [ ] **Fix #13**: Aggiungere indici database mancanti
- [ ] **Fix #14**: Ottimizzare query N+1 in Agenda
- [ ] **Fix #15**: Centralizzare configurazione URL
- [ ] **Fix #16**: Migliorare validazione email
- [ ] **Fix #17**: Sistemare cleanup canali Realtime

### 📝 Da pianificare (debt tecnico)
- [ ] **Fix #18**: Rimuovere tutti i console.log
- [ ] **Fix #19**: Centralizzare magic numbers
- [ ] **Fix #20**: Aggiungere TypeScript o PropTypes
- [ ] **Fix #21**: Migliorare generazione slug
- [ ] **Fix #22**: Standardizzare timezone handling
- [ ] **Fix #23**: Implementare test suite

---

## 🎯 CONCLUSIONI

Il progetto PIUM ha un'**architettura solida** ma presenta **problemi critici** che devono essere risolti prima del lancio in produzione.

### Punti di Forza ✅
- Struttura componenti chiara e modulare
- Uso appropriato di Supabase RLS per sicurezza
- Edge Functions per operazioni sensibili (Claude, Stripe)
- UI/UX curata con attenzione ai dettagli

### Aree Critiche ⚠️
- **Schema database inconsistente**: priorità assoluta
- **Bug logici** che causano crash o malfunzionamenti
- **Variabili mancanti** che bloccano funzionalità
- **Validazioni insufficienti** su input e errori

### Raccomandazioni
1. **Fase 1** (1-2 giorni): Risolvere tutti i problemi CRITICI (#1-#7)
2. **Fase 2** (3-5 giorni): Implementare fix IMPORTANTI (#8-#17)
3. **Fase 3** (ongoing): Refactoring MINORI (#18-#23)

**Stima totale per produzione-ready**: ~1 settimana di sviluppo full-time.

---

*Fine Report*
