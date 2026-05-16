# FUNZIONI PIUM — Mappa completa del prodotto

Questo documento descrive ogni funzione dell'app seguendo il percorso reale dell'utente, dall'arrivo sulla landing page fino all'uso quotidiano della dashboard. Include anche admin panel, affiliati e flussi tecnici non ovvi.

---

## 1. Landing Page (`/`)

### Cosa vede l'utente
Pagina di marketing pubblica con hero, lista funzionalità e prezzi.

### Cosa può fare
- Leggere le funzionalità principali della piattaforma
- Vedere il pricing (99€/mese, primo mese gratuito, garanzia 30gg)
- Cliccare "Accedi / Registrati" → va a `/auth`

### Come funziona
Pagina statica React, nessuna chiamata al database. Tutti i contenuti (FEATURES, PRICE_FEATURES) sono hardcoded nel componente.

---

## 2. Registrazione e Login (`/auth`)

### Cosa vede l'utente
Form con toggle tra "Accedi" e "Registrati". Campo nome visibile solo in registrazione.

### Cosa può fare
- **Registrarsi**: inserire nome, email, password → viene portato all'onboarding
- **Accedere**: email + password → viene portato alla dashboard
- **Recuperare la password**: inserisce email → riceve link via email
- **Vedere/nascondere la password**: icona occhio nel campo password

### Come funziona
1. Se l'URL contiene `?ref=CODICE` (link affiliato), il codice viene salvato in `localStorage` come `pium_ref` e usato durante l'onboarding
2. Se c'è già una sessione attiva → reindirizza automaticamente a `/dashboard` (o `/admin` se ruolo admin)
3. Registrazione → `supabase.auth.signUp()` con il nome salvato nei metadata
4. Login → `supabase.auth.signInWithPassword()`
5. Reset password → email con link a `/reset-password`

### Funzioni non ovvie
- I messaggi di errore Supabase (in inglese) vengono tradotti automaticamente in italiano ("Invalid login credentials" → "Email o password errati")
- Gli utenti con ruolo `admin` vengono reindirizzati a `/admin`, non a `/dashboard`
- Il codice affiliato nel localStorage viene poi letto durante l'onboarding e salvato nel profilo business

---

## 3. Onboarding (`/onboarding`)

### Cosa vede l'utente
Wizard a 3 step guidato per creare il profilo della sua attività.

### Cosa può fare
**Step 1 — La tua attività**
- Inserire il nome dell'attività
- Selezionare la categoria (12 categorie con emoji: Bar, Ristorante, Parrucchiere, Estetista, Palestra, Yoga, Barbiere, Nail artist, Spa, Tatuaggi, Professionista, Altro)
- Se "Altro": inserire categoria custom

**Step 2 — Contatti**
- Inserire telefono, WhatsApp, email (almeno uno obbligatorio)

**Step 3 — Sede**
- Inserire indirizzo e città (città obbligatoria)
- Inserire descrizione dell'attività (max 400 caratteri, opzionale)
- Cliccare "Salva e inizia"

### Come funziona
1. Genera uno slug univoco dal nome attività: minuscolo, normalizzato (accenti rimossi, spazi → trattini), es. `bar-da-mario` → se già esiste aggiunge suffisso numerico `-2`, `-3`
2. Verifica unicità slug su Supabase (fino a 50 tentativi)
3. Crea il record `businesses` con `status: 'trial'`, `is_active: true`
4. Se c'è un codice affiliato in `localStorage` lo salva nel campo `affiliate_code` del business e poi lo rimuove
5. In background (non bloccante): chiama Claude per generare automaticamente una descrizione dell'attività basata sui dati inseriti
6. Reindirizza a `/dashboard`

### Funzioni non ovvie
- La descrizione AI viene generata in background: l'utente non la vede durante l'onboarding, appare già compilata nell'editor sito
- L'utente admin viene reindirizzato a `/admin` e non può fare onboarding
- Gli slug generati sono puliti e leggibili (senza suffissi casuali) — solo numeri progressivi in caso di collisione

---

## 4. Dashboard — Struttura generale (`/dashboard`)

### Cosa vede l'utente
Shell con sidebar (desktop) o hamburger menu (mobile) che dà accesso a 7 sezioni. In cima al contenuto, eventuali banner di stato account.

### Cosa può fare
- Navigare tra: Panoramica, Agenda, Promemoria, Social, Recensioni, Servizi, Editor Sito
- Vedere badge numerico su "Agenda" con le prenotazioni in attesa di conferma
- Cliccare l'icona ingranaggio → Impostazioni (`/settings`)
- Cliccare l'icona logout → Esci
- Su mobile: aprire/chiudere il menu laterale con il pulsante hamburger
- Deep-linking: aprire una sezione specifica aggiungendo `?s=nomesezione` all'URL (es. `?s=agenda`)

### Come funziona
1. Al caricamento verifica la sessione; se assente → reindirizza a `/auth`
2. Carica i dati del business con `select('*')` — include tutti i campi (status, trial_ends_at, ai_calls_month_display, ecc.)
3. Se nessun business trovato → reindirizza a `/onboarding`
4. Ascolta in tempo reale (Supabase Realtime) le nuove prenotazioni pendenti → aggiorna il badge su Agenda e genera notifica push

### Banner di stato account
- **Banner giallo (trial)**: visibile quando `status = 'trial'`. Mostra la data di scadenza e il pulsante "Attiva ora" → avvia il pagamento Stripe
- **Banner rosso (scaduto)**: visibile quando `status = 'expired'`. Invita a contattare `info@piumapp.com`
- **Toast verde (pagamento)**: appare dopo il ritorno da Stripe con `?stripe_success=true`, scompare dopo 6 secondi

### Flusso pagamento Stripe (da "Attiva ora")
1. Chiama la Edge Function `stripe-checkout` → riceve un URL Stripe
2. Reindirizza l'utente su Stripe Checkout (pagina hosted da Stripe)
3. Dopo il pagamento, Stripe rimanda a `/dashboard?stripe_success=true`
4. La dashboard fa polling ogni 2 secondi (max 10 secondi / 5 tentativi) finché `status` nel DB diventa `active`
5. Appena confermato: nasconde il banner trial, mostra il toast verde, aggiorna i dati in memoria

### Funzioni non ovvie
- Il badge "Agenda" si aggiorna automaticamente via Realtime senza ricaricare la pagina
- Il polling post-Stripe è implementato con due `useEffect` separati per evitare che il `navigate()` (che pulisce `?stripe_success` dall'URL) cancelli il timer del polling

---

## 5. Panoramica

### Cosa vede l'utente
Homepage della dashboard con KPI, barra utilizzo AI, attività imminenti e log recente.

### Cosa può fare
- Vedere quanti **appuntamenti ha oggi** (non completati) → cliccare apre la vista giornaliera dell'Agenda
- Aprire il **calendario mensile** → cliccare apre la vista mensile dell'Agenda
- Vedere contatori compatti: **Promemoria in scadenza** (entro 7 giorni), **Servizi attivi**, **Bozze social**, **Recensioni** → cliccare naviga alla sezione
- Nella card **Prossime attività**: vedere i prossimi 5 appuntamenti con orario, cliente, dipendente; cliccare → apre Agenda su quella data/ora; spuntare il checkbox → segna completato
- Nella card **Promemoria**: vedere i prossimi 5 promemoria con urgenza colorata (rosso = scaduto, arancio = entro 3 giorni, verde = ok)
- Nella card **Attività completate**: vedere le ultime 5 azioni concluse (appuntamenti completati + promemoria segnati come fatti)

### Come funziona
Carica in parallelo tutti i dati con `Promise.all`: contatori, prossimi appuntamenti (entro 7 giorni), promemoria, ultimi 5 appuntamenti completati, ultimi 5 promemoria completati. Unisce appuntamenti e promemoria in una lista cronologica mista per la card "Attività completate".

### Barra utilizzo AI
- Sempre visibile se il business esiste
- Mostra `X / 350 chiamate` questo mese
- Barra di avanzamento diventa arancione se si supera l'80% del limite
- Se `ai_unlimited = true` (impostato dall'admin): mostra "Illimitato" senza barra
- Indica il mese in cui si rinnova il contatore

### Funzioni non ovvie
- Il contatore appuntamenti oggi esclude quelli già completati
- La card "Prossime attività" clickando porta direttamente all'orario specifico nell'Agenda (pre-seleziona data e ora tramite state di React Router)

---

## 6. Agenda

### Cosa vede l'utente
Calendario con vista mensile e vista giornaliera, gestione appuntamenti, dipendenti e prenotazioni in attesa.

### Vista mensile
**Cosa può fare**
- Navigare tra mesi (frecce prev/next)
- Cliccare su una data → passa alla vista giornaliera di quel giorno
- Cliccare "+" su una cella → apre il modal nuovo appuntamento pre-compilato con quella data
- Vedere i festivi italiani evidenziati (Capodanno, Epifania, Liberazione, ecc.)
- Vedere i punti colorati sulle date con appuntamenti (un punto per dipendente)

### Vista giornaliera
**Cosa può fare**
- Navigare tra giorni (frecce prev/next) o cliccare sulla data per aprire il **drum-scroll date picker** (ruota a 3 colonne giorno/mese/anno)
- Vedere la timeline 24h con slot da 30 minuti
- Cliccare su uno slot vuoto → apre il modal nuovo appuntamento
- Cliccare su un appuntamento esistente → apre il modal di modifica
- Spuntare il checkbox su un appuntamento → segna come completato
- Vedere il **riepilogo giornaliero** in fondo: appuntamenti completati, lordo incassato, aliquota fiscale (modificabile), netto
- Modificare l'aliquota fiscale (default 22%) — calcola in tempo reale

### Modal nuovo / modifica appuntamento
**Campi**
- Data (obbligatoria)
- Ora inizio
- Nome cliente (obbligatorio)
- Dipendente (opzionale — se ne sono stati aggiunti)
- Durata (15, 30, 45, 60, 90, 120 minuti)
- Prezzo €
- Note

**Comportamento**
- Se l'orario è fuori dagli orari di apertura configurati → mostra avviso con conferma "Vuoi salvare comunque?"
- In modifica: appare il pulsante "+ Aggiungi altro appuntamento alle [ora]" che pre-compila un nuovo appuntamento dopo quello corrente

### Gestione dipendenti (pulsante ingranaggio)
- Modal centrato con lista dipendenti (nome + pallino colorato)
- Aggiungere dipendente: inserire nome, scegliere un colore tra 12 predefiniti
- Eliminare dipendente

### Prenotazioni in attesa (pannello in basso)
- Mostra le prenotazioni arrivate dal sito pubblico non ancora confermate
- Per ogni prenotazione: nome cliente, servizio richiesto, data/ora, contatti (email, telefono)
- Pulsante **Conferma**: crea un appuntamento dall'agenda + mostra banner con link WhatsApp precompilato per inviare la conferma al cliente
- Pulsante **Rifiuta**: rimuove la prenotazione

### Come funziona
- Carica appuntamenti per il mese o il giorno selezionato
- Carica dipendenti del business
- Carica prenotazioni pending in tempo reale
- Salvataggio: validazione → INSERT/UPDATE su `appointments` → log attività
- La conferma prenotazione chiama la RPC `owner_confirm_booking` che crea l'appuntamento e notifica il sistema

### Funzioni non ovvie
- Il **drum-scroll date picker** funziona con scroll mouse su desktop e swipe su mobile; gestisce automaticamente il numero di giorni per mese (es. passando da marzo a febbraio, il giorno viene clampato)
- Gli orari di apertura vengono letti da `business.opening_hours` (formato doppio turno: mattina + pomeriggio per ogni giorno); supporta anche il vecchio formato a turno unico (migrazione automatica)
- Gli slot "occupati" nella timeline mostrano il blocco con colore del dipendente assegnato
- Il conteggio fatturato giornaliero considera solo gli appuntamenti con prezzo compilato e completati

---

## 7. Promemoria

### Cosa vede l'utente
Lista di promemoria con filtri per stato e priorità.

### Cosa può fare
- Filtrare per stato: Tutti / Da fare / Completati
- Filtrare per priorità: Tutte / Alta / Media / Bassa
- Aggiungere un promemoria
- Spuntare → segna come completato (o de-spuntare → riporta a pending)
- Modificare un promemoria
- Eliminare un promemoria (con conferma)

### Modal nuovo / modifica
- **Titolo** (obbligatorio)
- **Note** (opzionale)
- **Scadenza**: scelta tra "Data fissa" (input calendario) o "Relativa" (es. "tra 3 giorni", "tra 2 settimane", "tra 1 mese") — con anteprima della data calcolata
- **Priorità**: Alta (rosso) / Media (arancio) / Bassa (verde)

### Come funziona
- I promemoria con scadenza relativa vengono convertiti in data assoluta prima del salvataggio
- L'urgenza è visiva: rosso = scaduto, arancio = scade oggi o domani, verde = prossimi 7 giorni, grigio = oltre

### Funzioni non ovvie
- I promemoria in scadenza entro 7 giorni compaiono anche nella Panoramica
- La modalità "Relativa" mostra in tempo reale la data che verrà salvata

---

## 8. Social — Bozze AI

### Cosa vede l'utente
Lista di bozze per post social (Instagram e Facebook) con filtri e generazione AI.

### Cosa può fare
- Filtrare per piattaforma (Tutti / Instagram / Facebook) e stato (Tutti / Bozza / Approvato)
- Generare un nuovo post con AI
- Copiare il testo di un post (pulsante "Copia" → feedback "✓ Copiato" per 2 secondi)
- Approvare / disapprovare una bozza (toggle)
- Modificare manualmente una bozza
- Eliminare una bozza (con conferma + toast "Eliminato ✓")

### Generazione AI
1. Scegliere la piattaforma (Instagram o Facebook)
2. Inserire l'argomento del post (opzionale — se non inserito l'AI usa la descrizione dell'attività)
3. Scegliere il tono: Amichevole / Professionale / Promozionale / Storytelling / Urgente
4. Cliccare "Genera post" → Claude genera testo + hashtag
5. Vedere l'anteprima con formattazione piattaforma
6. Cliccare "Rigenera" per una nuova versione
7. Cliccare "Salva bozza"

### Come funziona
- Il prompt inviato a Claude contiene: nome attività, categoria, città, descrizione, URL del sito (`slug.piumapp.com`), piattaforma, argomento, tono
- Claude risponde con JSON: `{ content: "...", hashtags: ["..."] }`
- L'URL del sito viene incluso nel post come call-to-action naturale (non come link aggiunto a fine testo)
- La chiamata passa dalla Edge Function `claude-proxy` che gestisce il rate limiting

### Funzioni non ovvie
- Il testo copiato include sia il contenuto che gli hashtag (uniti da spazi)
- Gli hashtag vengono normalizzati automaticamente (aggiunge `#` se mancante)
- Se si raggiunge il limite mensile AI (350k token), appare un messaggio specifico con la data di reset
- Le bozze con stato "archived" non vengono mostrate nei filtri normali

---

## 9. Recensioni

### Cosa vede l'utente
Riepilogo con voto medio, distribuzione stelle e lista recensioni con possibilità di risposta AI.

### Cosa può fare
- Vedere la media voti e le barre di distribuzione per stella
- Filtrare per numero di stelle
- Aggiungere manualmente una recensione
- Generare una risposta AI a una recensione
- Modificare la risposta generata prima di inviarla
- Segnare la risposta come "inviata"
- Pubblicare / nascondere una recensione dal sito pubblico (icona globo)
- Eliminare una recensione (con conferma + toast)

### Modal aggiunta recensione
- Nome autore (obbligatorio)
- Fonte (Manuale / Google / TripAdvisor / Facebook / Yelp)
- Valutazione da 1 a 5 stelle (picker interattivo)
- Testo recensione (opzionale)
- Data (opzionale, default oggi)

### Risposta AI
- Claude genera una risposta personalizzata basandosi su: nome attività, categoria, città, testo della recensione, voto
- Il tono si adatta automaticamente al voto: caloroso per 4-5★, costruttivo per 3★, empatico per 1-2★
- La risposta appare in una textarea modificabile — si può correggere prima di salvarla
- Il pulsante "Segna come inviata" salva il timestamp della risposta

### Come funziona
- Solo le recensioni con `is_visible = true` appaiono sul sito pubblico
- `replied_at` viene impostato al momento del click su "Segna come inviata"
- Il calcolo della media esclude le recensioni senza voto numerico

### Funzioni non ovvie
- La risposta può essere generata, modificata e salvata senza mai cliccare "Segna come inviata" (utile per tenerla in bozza)
- Le recensioni non visibili rimangono nella lista admin ma non appaiono sul sito

---

## 10. Servizi

### Cosa vede l'utente
Lista dei servizi offerti con possibilità di attivare/disattivare ogni voce.

### Cosa può fare
- Vedere tutti i servizi con nome, prezzo, durata, stato attivo/inattivo
- Aggiungere un servizio
- Modificare un servizio (click sulla riga o pulsante edit)
- Attivare / disattivare un servizio (occhio)
- Eliminare un servizio (con conferma + toast)

### Modal nuovo / modifica
- **Nome** (obbligatorio)
- **Descrizione** (opzionale)
- **Prezzo €** (opzionale)
- **Tipo prezzo**: nessuno / "a partire da" / "fisso" / "per ora" / "a seduta" / "al mese" / "a persona"
- **Durata in minuti** (opzionale — ma necessaria per abilitare le prenotazioni)
- Toggle **Servizio attivo**

### Funzioni non ovvie
- Se un servizio non ha la durata impostata, non appare tra le opzioni prenotabili sul sito pubblico
- I servizi disattivati non appaiono sul sito pubblico ma rimangono nella lista
- Il tipo prezzo appare come label accanto al numero nel sito (es. "€50 a seduta")

---

## 11. Editor Sito

### Cosa vede l'utente
Pannello diviso in blocchi tematici per modificare ogni sezione del sito pubblico.

### Blocchi disponibili
1. **Hero** — titolo principale, sottotitolo, testo del pulsante contatti
2. **Chi siamo** — testo descrittivo (max 500 caratteri)
3. **Immagine di copertina** — foto hero del sito
4. **Galleria fotografica** — fino a 20 foto
5. **Foto profilo** — avatar/logo dell'attività
6. **Contatti** — telefono, WhatsApp, email
7. **Social** — URL Instagram, URL Facebook
8. **Orari di apertura** — configurazione per ogni giorno della settimana

### Come funziona per i testi
- I contenuti sono salvati nella tabella `site_content` con `block_key` (es. `hero`, `about`)
- Salvataggio: se il record esiste → UPDATE; se non esiste → INSERT
- Feedback stato: "Salvato ✓" appare per 2.5 secondi dopo ogni salvataggio

### Come funziona per le immagini
1. L'utente seleziona o trascina un file
2. Il browser comprime automaticamente l'immagine (max 0.8 MB, max 1920px) — non blocca l'interfaccia
3. Il file viene caricato su Supabase Storage (`site-images`)
4. L'URL pubblico viene salvato nel record `site_content`
5. L'anteprima si aggiorna subito

### Orari di apertura
Per ogni giorno (lunedì-domenica):
- Toggle "Chiuso / Aperto"
- Se aperto: turno mattina (orario apertura-chiusura, attivabile/disattivabile) + turno pomeriggio (stesso)
- Ogni modifica viene salvata immediatamente con spinner visivo

### Funzioni non ovvie
- La compressione immagine avviene via Web Worker e non blocca l'interfaccia
- La galleria supporta upload multiplo (più file contemporaneamente)
- Il vecchio formato orari (turno unico) viene migrato automaticamente al nuovo formato (doppio turno)
- Il testo "Chi siamo" viene pre-compilato con la descrizione generata da Claude durante l'onboarding

---

## 12. Sito Pubblico (`nomeattivita.piumapp.com` o `/pub/:slug`)

### Cosa vede il cliente
Sito mobile-first con le informazioni dell'attività, servizi, galleria, form prenotazione e recensioni.

### Cosa può fare il cliente
- Leggere le informazioni dell'attività (nome, categoria, location)
- Vedere e scorrere la galleria fotografica (carosello con frecce e indicatori punto)
- Leggere la lista dei servizi (nome, prezzo, durata, descrizione)
- **Prenotare un appuntamento** (flusso 5 step — vedi sezione 13)
- Leggere le recensioni pubblicate con le risposte del titolare
- Cliccare sul numero di telefono per chiamare
- Cliccare su WhatsApp per aprire la chat
- Aprire Google Maps per raggiungere la sede
- Vedere gli orari di apertura

### Come funziona
1. Legge lo slug dall'URL o dal sottodominio (es. `mario.piumapp.com` → slug `mario`)
2. Un Cloudflare Worker fa proxy trasparente da `*.piumapp.com` a `www.piumapp.com` passando lo slug
3. Carica dati business, servizi, recensioni, contenuti sito da Supabase con policy RLS pubblica
4. Applica un tema visivo basato sulla categoria (bar → caffè, palestra → nero/oro, ristorante → rosso/beige, ecc.)
5. Se presente immagine di copertina → sovrascrive il tema con un gradiente sull'immagine

### Funzioni non ovvie
- Se il titolare accede al proprio sito mentre è loggato, appare un banner "Stai visualizzando il tuo sito in anteprima" con link all'editor
- Se il business non è attivo o non esiste → pagina 404
- La sezione prenotazioni appare solo se ci sono servizi con durata impostata
- I contatti seguono una gerarchia: il pulsante principale mostra telefono → WhatsApp → email (il primo disponibile)

---

## 13. Prenotazione (sito pubblico)

### Cosa vede il cliente
Un flusso guidato a step per scegliere servizio, data, orario e inserire i propri dati.

### Flusso
1. **Seleziona servizio** (step saltato automaticamente se c'è un solo servizio)
2. **Seleziona data** — calendar da oggi a 60 giorni nel futuro
3. **Seleziona orario** — slot disponibili generati in base agli orari di apertura e agli appuntamenti già presi
4. **Inserisci dati** — nome (obbligatorio), email (obbligatoria), telefono (opzionale)
5. **Conferma** — "Prenotazione ricevuta! Il titolare ti contatterà per confermare."

### Come funziona
- Gli slot occupati vengono letti con la RPC `get_taken_slots(business_id, date)`
- Gli slot disponibili vengono generati partendo dagli orari di apertura, escludendo i già presi
- La prenotazione viene creata con la RPC `create_booking(...)` come record `pending`
- La dashboard del titolare riceve una notifica in tempo reale (Supabase Realtime) e aggiorna il badge su Agenda

### Funzioni non ovvie
- La durata degli slot dipende dal servizio scelto (es. servizio da 60 min → slot ogni 60 min)
- Se il titolare non ha configurato orari di apertura, il sistema usa 09:00-18:00 come default
- Il cliente non riceve email automatica — la conferma avviene manualmente dal titolare (con il messaggio WhatsApp precompilato)

---

## 14. Impostazioni (`/settings`)

### Cosa vede l'utente
Tre sezioni: Account, Notifiche, Esci.

### Cosa può fare
**Account**
- Vedere l'email (non modificabile da qui)
- Cambiare la password (min 6 caratteri, conferma richiesta)

**Notifiche**
- Se il browser non supporta le notifiche → messaggio informativo
- Se i permessi non sono stati concessi → pulsante "Attiva notifiche" → richiesta permesso browser
- Se permessi concessi:
  - Scegliere quanti minuti prima ricevere il promemoria appuntamento (0, 1, 5, 15, 30, 60, 120)
  - Toggle "Notifica prossimo appuntamento dopo la spunta" (dopo aver completato un appt, notifica il successivo)
  - Toggle "Notifiche push" (notifiche anche con il browser chiuso, se il dispositivo lo supporta)
  - Pulsante "Invia notifica di prova"

**Esci**
- Pulsante rosso per logout

### Come funziona
- Le impostazioni notifiche vengono salvate in `localStorage` (non nel DB) — persistono sul dispositivo specifico
- Le notifiche push usano il Service Worker della PWA + Supabase per la subscription

### Funzioni non ovvie
- Le impostazioni notifiche sono per dispositivo: impostare notifiche su PC non attiva quelle su mobile
- Il toggle push non appare se il browser non supporta `PushManager`

---

## 15. Notifiche Push e PWA

### Cosa vede l'utente
Un banner nella dashboard che invita a installare l'app. Una volta installata, l'app si comporta come un'app nativa.

### Funzionalità PWA
- Installabile su iOS (Safari → Condividi → Aggiungi a schermata Home) e Android (Chrome → Installa app)
- Icone dell'app, splash screen, modalità standalone (senza barra browser)
- Il banner di installazione appare solo su mobile e solo se l'app non è già installata
- Dismiss del banner → salvato in `sessionStorage` (scompare per la sessione corrente)

### Notifiche push
- Funzionano anche con il browser/app chiusi
- Scheduling: le notifiche vengono pianificate all'apertura della dashboard o dopo aver segnato un appuntamento come completato
- L'azione "✓ Fatto" direttamente dalla notifica segna l'appuntamento come completato senza aprire l'app

### Come funziona
- Service Worker registrato a livello di app (`/sw.js`)
- Subscription Push salvata in `push_subscriptions` su Supabase
- La Edge Function `notify-new-booking` gestisce le notifiche per nuove prenotazioni

### Funzioni non ovvie
- Se l'app è già in modalità standalone (installata), il banner PWA non appare
- Il sistema verifica `getInstalledRelatedApps()` per rilevare se l'app è già installata prima di mostrare il banner

---

## 16. Bot FAQ Supporto

### Cosa vede l'utente
Un pulsante "?" fisso in basso a destra su tutte le pagine.

### Cosa può fare
- Cliccare "?" → apre widget chat
- Selezionare una categoria (Sito, Agenda, Social, Recensioni, Account, Affiliati)
- Selezionare una domanda dalla lista
- Leggere la risposta + eventuale link di approfondimento (interno o esterno)
- Navigare con il pulsante "Indietro"
- Cliccare "X" per chiudere

### Come funziona
- Le FAQ sono caricate da Supabase (tabella `faq`) al primo click e poi cached per la sessione
- I link interni (che iniziano con `/`) usano React Router navigate; i link esterni si aprono in nuova tab
- La categoria "Affiliati" compare solo nella sezione `/affiliates`

---

## 17. Sistema Trial e Pagamento

### Flusso completo
1. Alla registrazione il business viene creato con `status = 'trial'`
2. L'admin imposta `trial_ends_at` (data scadenza trial) dal pannello admin
3. Quando la data scade, il sistema (o l'admin) aggiorna `status = 'expired'`
4. L'utente in trial vede il banner giallo con la data di scadenza
5. Cliccando "Attiva ora" → Stripe Checkout (99€/mese)
6. Dopo il pagamento → webhook Stripe aggiorna `status = 'active'` e `plan = 'active'`
7. Il banner sparisce, appare il toast verde

### Edge Functions coinvolte
- **`stripe-checkout`**: autenticato (richiede JWT), crea una Stripe Checkout Session e ritorna l'URL
- **`stripe-webhook`**: non autenticato (webhook Stripe non manda JWT), verifica la firma HMAC-SHA256, aggiorna il DB usando la `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS)

### Colonne DB rilevanti
- `status`: trial / active / expired / suspended
- `plan`: trial / free / starter / pro / active
- `plan_price`: prezzo mensile (default 99)
- `trial_ends_at`: data scadenza trial (timestamptz)
- `stripe_subscription_id`: ID abbonamento Stripe (scritto dal webhook)
- `stripe_customer_id`: ID cliente Stripe (scritto dal webhook)

---

## 18. Sistema Affiliati

### Registrazione affiliato (`/affiliates/auth`)
- Form separato da quello normale con campo nome completo
- Alla registrazione: genera un codice affiliato univoco (3 lettere da nome + 4 caratteri hex casuali, es. `mar1a2b3`)
- L'account parte con `status = 'pending'` → necessaria approvazione manuale dall'admin

### Dashboard affiliato (`/affiliates`)
Se approvato, l'affiliato vede:
- Statistiche: guadagnato totale, in attesa, clienti portati, clienti attivi Pro
- Il link di referral da condividere: `https://piumapp.com/auth?ref=CODICE`
- Pulsante "Copia link"
- Lista dei clienti portati con: nome, città, piano, stato, data registrazione

### Come funziona il tracking
1. Potenziale cliente clicca il link `?ref=CODICE`
2. Il codice viene salvato in `localStorage` come `pium_ref`
3. Durante l'onboarding, il codice viene letto e salvato nel campo `affiliate_code` del business
4. Il campo `affiliate_code` persiste e viene mostrato nell'admin panel

### Funzioni non ovvie
- Il codice affiliato viene rimosso da `localStorage` dopo il salvataggio (una sola attribuzione per browser)
- Il calcolo guadagni è manuale (non ancora collegato a Stripe) — viene aggiornato dall'admin

---

## 19. Admin Panel (`/x-admin-login` → `/admin`)

### Accesso
Route nascosta (`/x-admin-login`) non linkata da nessuna parte nell'app. Solo utenti con `app_metadata.role = 'admin'` in Supabase possono accedere.

### Sezione Clienti

**Tabella** (8 colonne)
- Attività (nome + categoria)
- Email
- Stato (badge colorato: active/trial/expired/suspended)
- Trial (giorni rimanenti — rosso se scaduto, arancio se <7gg)
- Piano/€ (piano attuale + prezzo mensile)
- AI/mese (chiamate questo mese)
- Affiliato (badge con codice se arrivato da referral)
- Azioni (pulsanti rapidi)

**Filtri e ricerca**
- Ricerca testuale per nome / email / città (client-side)
- Filtro per status: Tutti / Attivi / Trial / Scaduti / Sospesi

**StatCard in cima** (6 card)
- Clienti totali, Attivi, In trial, Scaduti
- MRR (somma `plan_price` dei clienti `active`)
- Tasso conversione trial→paid

**Drawer laterale** (click su una riga)
- Stato account con input data scadenza trial + pulsante "+30 giorni" + salvataggio
- Dati attività: email, città, slug, data registrazione
- Provenienza: "Organico" oppure codice affiliato + nome affiliato
- Salute onboarding: copertina presente / numero servizi inseriti
- Utilizzo AI: toggle "AI illimitata", chiamate questo mese, token usati, totale storico
- Note interne: textarea libero (salvato su `admin_notes`)

### Sezione Affiliati
- Tabella con: nome, email, codice, stato (Attivo/In attesa/Rifiutato), clienti portati, guadagnato, data registrazione
- Pulsanti per approvare / sospendere / rifiutare ogni affiliato

### Come funziona
- Il drawer carica in parallelo: conteggio servizi del business + dati affiliato (se c'è codice)
- Il toggle AI illimitata aggiorna `ai_unlimited` in DB in tempo reale
- Le modifiche al trial date aggiornano anche `status = 'trial'` (riattiva utenti scaduti)

### Funzioni non ovvie
- L'admin può riattivare un account scaduto semplicemente aggiornando la data trial → il sistema cambia automaticamente `status` a `trial`
- Il toggle AI illimitata è per cliente (non globale) — utile per VIP o beta tester
- Il MRR è calcolato client-side sommando `plan_price` di tutti gli utenti `active`

---

## Riepilogo Edge Functions deployate

| Funzione | Autenticazione | Scopo |
|---|---|---|
| `claude-proxy` | JWT richiesto | Proxy verso Claude API con rate limiting (350k token/mese) |
| `stripe-checkout` | JWT richiesto | Crea Stripe Checkout Session, ritorna URL |
| `stripe-webhook` | Nessuna (firma HMAC) | Processa eventi Stripe, aggiorna DB |
| `notify-new-booking` | — | Notifica push per nuova prenotazione |

---

## Riepilogo tabelle Supabase principali

| Tabella | Cosa contiene |
|---|---|
| `businesses` | Profilo attività, status, plan, stripe IDs, AI counters, orari |
| `services` | Servizi offerti (nome, prezzo, durata, is_available) |
| `appointments` | Appuntamenti (data, ora, cliente, dipendente, prezzo, completato) |
| `employees` | Dipendenti per business (nome, colore) |
| `bookings` | Prenotazioni pubbliche pending/confirmed/rejected |
| `reviews` | Recensioni (autore, voto, testo, risposta, is_visible) |
| `social_drafts` | Bozze post social (piattaforma, contenuto, hashtag, status) |
| `reminders` | Promemoria (titolo, note, scadenza, priorità, status) |
| `site_content` | Contenuti sito pubblico per block_key (hero, about, gallery, ecc.) |
| `affiliates` | Affiliati (codice, status, guadagni) |
| `activity_log` | Log azioni utente (tipo, descrizione, timestamp) |
| `push_subscriptions` | Subscription push per notifiche background |
| `faq` | Domande e risposte del bot supporto |
