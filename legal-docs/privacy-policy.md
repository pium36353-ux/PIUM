Privacy Policy — PIUM

Ultimo aggiornamento: [DATA]

La presente Privacy Policy descrive come PIUM raccoglie, utilizza e protegge i dati personali degli utenti in conformità al Regolamento (UE) 2016/679 (GDPR) e alla normativa italiana vigente.

# 1. Titolare del Trattamento

Titolare del trattamento dei dati personali è:

[NOME E COGNOME / RAGIONE SOCIALE — DA COMPILARE]

[INDIRIZZO COMPLETO — DA COMPILARE]

P.IVA / C.F.: [DA COMPILARE]

Email: info@piumapp.com

# 2. Dati Raccolti

PIUM raccoglie esclusivamente i dati necessari al funzionamento del servizio:

## 2.1 Dati degli utenti registrati (titolari delle attività)

Dati di registrazione: indirizzo email e password cifrata (gestiti da Supabase Auth)

Dati dell'attività: nome, descrizione, indirizzo, numero di telefono, canali di contatto, immagini caricate dall'utente e destinate alla pubblicazione sul sito pubblico dell'attività (es. immagine profilo, copertina, galleria e immagini dei servizi)

Dati operativi: appuntamenti, servizi, promemoria, recensioni, bozze social inseriti dall'utente

Dati di fatturazione e pagamento: gestiti da Stripe — PIUM non conserva dati della carta

Dati di utilizzo: contatore token AI utilizzati mensilmente

## 2.2 Dati dei clienti finali delle attività

Attraverso il sistema di prenotazione pubblica, PIUM raccoglie per conto del titolare dell'attività i seguenti dati dei clienti finali:

Nome e cognome

Numero di telefono

Indirizzo email, se inserito o importato dal titolare dell’attività

Servizi prenotati, data e ora dell'appuntamento

Note aggiuntive inserite al momento della prenotazione

Dati importati dal titolare dell’attività nella rubrica clienti, inclusi nome, cognome, numero di telefono, eventuale email, note, fonte/importazione e storico visite ove disponibile

Questi dati sono trattati da PIUM in qualità di Responsabile del Trattamento per conto del titolare dell'attività (Titolare del Trattamento). Il relativo accordo è regolato dal DPA allegato.

Il titolare dell’attività rimane responsabile della liceità della raccolta, dell’importazione e dell’utilizzo dei dati dei propri clienti finali nella piattaforma, inclusi i dati inseriti o importati nella rubrica clienti. PIUM tratta tali dati esclusivamente per conto del titolare dell’attività e secondo le istruzioni ricevute tramite l’utilizzo del servizio.

## 2.3 Dati tecnici

Token di sessione per l'autenticazione (cookie tecnici Supabase)

Subscription push notification (token VAPID del dispositivo) per l'invio di notifiche push

Indirizzo IP e user agent in forma anonima per la sicurezza del servizio

PIUM non raccoglie dati sensibili, non vende dati a terzi e non utilizza cookie di profilazione o tracciamento pubblicitario.

# 3. Finalità del Trattamento

I dati vengono trattati per le seguenti finalità:

Erogazione del servizio PIUM (creazione sito, gestione dashboard, funzionalità AI, agenda)

Pubblicazione sul sito pubblico dell’attività dei contenuti e delle immagini caricati volontariamente dal titolare, quali immagine profilo, copertina, galleria fotografica e immagini dei servizi

Gestione del sistema di prenotazione pubblica

Gestione della rubrica clienti dell’attività, inclusi contatti importati dal titolare, storico visite e dati necessari alla gestione del rapporto con i clienti finali

Invio di notifiche push per promemoria appuntamenti

Gestione del rapporto contrattuale e della fatturazione tramite Stripe

Assistenza tecnica e supporto clienti

Miglioramento del servizio tramite analisi aggregate e anonime

# 4. Base Giuridica del Trattamento

Esecuzione del contratto (art. 6, par. 1, lett. b GDPR): dati necessari per erogare il servizio

Consenso (art. 6, par. 1, lett. a GDPR): notifiche push (revocabile in qualsiasi momento dalle impostazioni)

Legittimo interesse (art. 6, par. 1, lett. f GDPR): sicurezza e miglioramento del servizio

Obbligo legale (art. 6, par. 1, lett. c GDPR): conservazione dati fiscali

# 5. Conservazione dei Dati

I dati vengono conservati per la durata del contratto e, ove applicabile, per i successivi 10 anni per finalità fiscali e contabili. I dati dei clienti finali delle attività, inclusi i dati inseriti o importati nella rubrica clienti, vengono conservati per la durata dell’account del titolare dell’attività o fino alla loro cancellazione da parte del titolare, salvo obblighi di legge. Le immagini e i contenuti pubblicati sul sito dell’attività rimangono disponibili fino alla loro rimozione da parte del titolare o alla cancellazione dell’account. I token push notification vengono eliminati alla revoca del consenso o alla disinstallazione della PWA.

# 6. Condivisione con Terze Parti

I dati sono trattati dai seguenti fornitori di servizi tecnici in qualità di responsabili del trattamento, tutti operanti con garanzie adeguate ai sensi del GDPR (Standard Contractual Clauses o equivalenti):

Supabase Inc. — database, autenticazione e storage (server in area UE ove disponibile)

Vercel Inc. — hosting dell'applicazione web

Anthropic PBC — elaborazione AI per generazione testi (solo testi anonimi dell'attività, nessun dato personale identificativo dei clienti finali)

Stripe Inc. — gestione pagamenti e abbonamenti (dati di fatturazione e carta)

Cloudflare Inc. — CDN, DNS, routing sottodomini

Nessun dato viene venduto o ceduto a terzi per finalità commerciali o pubblicitarie.

# 7. Diritti dell'Interessato

L'utente ha il diritto di:

Accedere ai propri dati personali

Rettificare dati inesatti o incompleti

Richiedere la cancellazione dei dati (diritto all'oblio)

Limitare o opporsi al trattamento

Portabilità dei dati

Revocare il consenso alle notifiche push in qualsiasi momento dalle Impostazioni della app

Per esercitare questi diritti: info@piumapp.com

È possibile presentare reclamo all'Autorità Garante per la Protezione dei Dati Personali (www.garanteprivacy.it).

# 8. Sicurezza dei Dati

PIUM adotta misure tecniche e organizzative adeguate per proteggere i dati personali, tra cui:

Cifratura dei dati in transito (HTTPS/TLS su tutti i canali)

Autenticazione sicura tramite Supabase Auth

Controllo degli accessi tramite Row Level Security (RLS) a livello di database

Isolamento logico dei dati per singola attività/account, al fine di impedire l’accesso ai dati di altri clienti della piattaforma

Chiavi API non esposte lato client (gestite tramite Supabase Edge Functions)

Accesso ai dati limitato al solo personale autorizzato

# 9. Cookie

PIUM utilizza esclusivamente cookie tecnici necessari al funzionamento del servizio:

sb-access-token: token di sessione per mantenere l'utente autenticato. Durata: sessione / 1 ora

sb-refresh-token: token per il rinnovo automatico della sessione. Durata: 7 giorni

Non vengono utilizzati cookie di profilazione, tracciamento o pubblicità. Non è richiesto il consenso per i cookie tecnici ai sensi del Provvedimento del Garante del 10 giugno 2021.

# 10. Modifiche alla Privacy Policy

PIUM si riserva il diritto di aggiornare la presente Privacy Policy. Le modifiche sostanziali verranno comunicate via email con almeno 15 giorni di preavviso. L'uso continuato del servizio dopo la notifica costituisce accettazione delle modifiche.
