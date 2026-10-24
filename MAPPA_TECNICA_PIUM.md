# MAPPA TECNICA PIUM

> Documento generato per ricostruire una visione tecnica completa del progetto. Sola lettura sul codice: nessuna modifica applicata durante la stesura.

---

## Verticali — leggere PRIMA dei dettagli di ciascun verticale

PIUM è nato come dashboard generica per attività locali. Da settembre 2026 esiste un meccanismo per attivare funzionalità specifiche di un **tipo** di attività ("verticale", es. toelettatura) senza toccare la dashboard generica per tutti gli altri business. Regola valida per ogni verticale futuro, non solo per quello già implementato:

- **`businesses.vertical`** (text, `DEFAULT 'generico'`, nullable, **nessun CHECK sui valori ammessi** — di proposito, per non richiedere una nuova migration solo per sbloccare un nuovo verticale). Colonna introdotta da `20260920_business_vertical.sql` (commit `ea4dced`). Impostata **solo** da `Admin.jsx` (campo di testo libero nel drawer business, non un menu a tendina) — **mai** da `Onboarding.jsx` o da qualunque flusso self-service del merchant.
- **Fail-safe per costruzione, non per controllo esplicito**: qualunque valore diverso da quelli riconosciuti — incluso `'generico'`, `NULL`, stringa vuota o un refuso di battitura (es. `'Toelettatura'` con maiuscola, o `'toelettattura'`) — deve comportarsi **esattamente** come nessun verticale attivo. Questo non dipende da un `if` che qualcuno potrebbe dimenticare in un punto nuovo del codice, ma dal fatto che ogni funzionalità di verticale è isolata in un componente separato o in un ramo esplicitamente gated, mai cablata di default nella UI condivisa.
- **Regola architetturale — componente separato, mai condizioni sparse dentro la dashboard generica**: una feature di verticale vive in un componente proprio (es. `PetBoneIcon.jsx`, `PetIndicators.jsx`) montato/renderizzato **solo** dentro un `if (business.vertical === '<valore esatto>')` messo **prima** che qualunque JSX o query specifica del verticale venga anche solo costruita da React (`return null`/return anticipato — non un nascondimento CSS a posteriori, non un componente sempre montato con dati vuoti). `Agenda.jsx`/`Clienti.jsx` restano i componenti condivisi esistenti: le sezioni specifiche del verticale sono rami interni gated, non hanno trasformato quei file in componenti "per toelettatura".
- **Verticali riconosciuti ad oggi** (valore esatto da scrivere in Admin, case-sensitive, identico carattere per carattere al confronto nel codice):
  - `toelettatura` — UI animali (pets): sezione "Animali" nel modulo appuntamento e sul blocco appuntamento di `Agenda.jsx`, sezione "Animali" nella scheda cliente di `Clienti.jsx`. Dettagli tabella `pets` e componenti in Fase 2/Fase 1.
  - `ristorante_bar` — piantina tavoli, prenotazioni per data/turno, catalogo menu, comande/ordinazioni con invio in cucina (portate, attesa/via, protezione offline), vista cucina dedicata per postazione, scorte/costi/margini e notifiche di sala: componenti `Tavoli.jsx`/`Menu.jsx`/`Ordine.jsx`/`Cucina.jsx`/`Scorte.jsx`/`NotificheSala.jsx`. Copre indistintamente ristoranti e bar (nessuna distinzione di categoria a livello di schema o UI, per scelta esplicita). Il Blocco F aggiunge il servizio su più dispositivi: ogni schermata ha il proprio indirizzo, gli avvisi arrivano in qualunque sezione, totali per piatto in cucina e blocco della postazione su un'area di lavoro. Il Blocco G aggiunge il canale delle notifiche per i camerieri: avviso per **portata completa** (mai per singolo piatto), livelli d'avviso per postazione e postazioni "servite dalla sala". Costruito in sette blocchi (A→G), tutti uniti a master: A-D con `22b8f39`, E subito dopo, F da `feature/ristorante-servizio`, G da `feature/notifiche-sala`. Dettagli tabelle in Fase 2, componenti in Fase 1, cronologia delle correzioni subito sotto.
- **Da non confondere con `businesses.category`**: colonna preesistente, testo libero scelto dal merchant in `Onboarding.jsx` (es. la voce `"Toelettatura"` con emoji 🐾, aggiunta al `CATEGORIES` array da `a2f1966`) — è solo un'etichetta mostrata sul sito pubblico/dashboard, **non attiva alcuna UI**. Solo `vertical`, impostato dall'admin, attiva funzionalità. Un business può avere `category='Toelettatura'` e `vertical='generico'` (nessuna UI animali) o viceversa.
- **Lezione dalla prima implementazione** (utile per verificare ogni verticale futuro con lo stesso rigore): la UI animali era stata inizialmente montata come universale per errore (commit `a2f1966`), corretto con un fix urgente subito dopo (`05d166f`, "gating pets/PetBoneIcon dietro business.vertical='toelettatura'"). Il gate va verificato con un **grep su ogni riferimento** ai simboli della feature (nomi componenti, funzioni di load, stato React) in tutto `src/`, non solo letto "a occhio" nel punto dove sembra ovvio — le uniche eccezioni legittime a un grep del genere sono le dichiarazioni `useState` (obbligatorie e unconditional per le regole di React, non producono output da sole) e le definizioni di funzione mai invocate se il pulsante che le richiama non è nel DOM.
- **Componenti di verticale vanno SEMPRE caricati con `React.lazy()`, mai importati staticamente**: regola aggiunta con `ristorante_bar` (commit `015111d`), applicata anche retroattivamente ai componenti `toelettatura` già esistenti (`PetBoneIcon.jsx`, `PetIndicators.jsx`, prima importati staticamente in cima ad `Agenda.jsx`/`Clienti.jsx`). Così il codice di un componente specifico di un verticale scende sul browser solo per i business che hanno davvero quel verticale attivo, non per tutti — verificato in build (`npm run build`): ogni componente di verticale produce un chunk separato dal bundle principale, e `dist/index.html` non lo referenzia con alcun `<link rel="modulepreload">`. In `Dashboard.jsx`: `const Tavoli = lazy(() => import(...))`, un unico `<Suspense fallback="Caricamento…">` attorno al rendering della sezione attiva (non ha effetto sulle sezioni non-lazy, che risolvono subito). Nei componenti condivisi (`Agenda.jsx`/`Clienti.jsx`), `<Suspense fallback={null}>` avvolge solo i punti d'uso già gated dietro il controllo su `vertical` — componenti troppo piccoli per giustificare uno spinner visibile.
- **Stato "calcolato al volo", mai persistito, quando dipende da una combinazione di fattori**: principio emerso durante `ristorante_bar` (vedi Cronologia sotto) — se un dato (es. "il tavolo X è libero o occupato") dipende dall'incrocio di più dimensioni indipendenti (tavolo, data, turno), **non va salvato come colonna** da tenere sincronizzata, va **ricalcolato ogni volta** interrogando i dati che lo determinano davvero (qui: esiste una `table_reservations` confermata per l'esatta combinazione richiesta?). Salvarlo a parte richiederebbe aggiornarlo da ogni punto che potrebbe farlo cambiare, con margine costante di disallineamento; calcolarlo al volo lo rende impossibile da disallineare, per costruzione. Vale ogni volta che uno "stato" sembra un singolo campo ma in realtà è una domanda con più parametri. Esteso a OCCUPATO nel Blocco C (punto 7 della Cronologia) e alla risoluzione postazione/portata nel Blocco D.
- **Confini contabili: solo l'orologio del DATABASE, mai quello dei dispositivi**: principio emerso nel Blocco E e valido per qualunque conteggio futuro (scorte, cassa, chiusure di qualunque tipo). Un timestamp scritto dal client (`sent_at`, orologio del tablet di sala) va benissimo per dire *quando è successo* a un umano — resoconti per giorno, turno, mese: è l'ora "vissuta" del servizio. Ma **non può delimitare un periodo contabile**: un dispositivo con l'orologio indietro scriverebbe un istante anteriore a un confine già chiuso, e quella riga non verrebbe contata da nessun periodo, né da quello chiuso né dal successivo — persa per sempre, in silenzio. Lo stesso vale per una riga composta offline e salvata mezz'ora dopo. Per questo `table_order_items` ha **due** timestamp con ruoli diversi: `sent_at` (dispositivo, per i resoconti) e `sent_received_at` (scritto da un trigger con `now()` del database, unico confine della contabilità), e `stock_closures.period_end` arriva da una funzione SQL, mai dal client. Regola pratica: se un valore decide *cosa entra e cosa no* in un conteggio, deve nascere dove nasce il dato, non dove si tocca lo schermo.
- **Un solo punto che scrive uno stato condiviso, e mai da una fotografia**: principio emerso dal difetto di navigazione del Blocco F (vedi Cronologia). Se due parti dell'app scrivono lo stesso stato condiviso — lì era la query string dell'indirizzo, scritta sia da `Dashboard.jsx` al cambio sezione sia dalle sezioni per i propri parametri — prima o poi una delle due parte da un valore già superato e riporta indietro il lavoro dell'altra. Due regole pratiche che ne derivano: **(1)** per ogni pezzo di stato condiviso ci deve essere un solo modo di scriverlo (qui l'hook `useSectionParams`, e lo si verifica con un grep su tutti i writer, non "a memoria"); **(2)** una scrittura va costruita sul **valore vivo** in quell'istante (`window.location.search`), non su una copia catturata in una closure o in un render precedente. Vale ogni volta che stato React e stato di una libreria esterna (router, store) si aggiornano con tempi diversi: il primo è immediato nel batch, il secondo arriva un render dopo, e nella finestra tra i due una copia è già vecchia.
- **Una sola funzione condivisa per una regola di ripiego usata in più punti**: quando la stessa regola (es. "quale postazione riceve questa voce se la sua categoria non ne ha una assegnata") serve a più componenti — `Cucina.jsx` per filtrare le voci da mostrare, `Ordine.jsx` per raggruppare l'invio per portata, `Menu.jsx` per segnalare le categorie orfane — la logica vive in **una** funzione condivisa (`resolveStationId`/`resolveCourseId`/`groupItemsByCourse` in `src/lib/kitchenRouting.js`), mai riscritta punto per punto. Altrimenti i casi limite (categoria senza postazione, piatto senza categoria, piatto cancellato dal catalogo dopo l'ordine) rischiano di essere gestiti in modo diverso da un componente all'altro senza che nessuno se ne accorga. Principio emerso con `ristorante_bar` Blocco D, esplicitamente richiesto prima di scrivere il codice.

- **Un solo punto che LEGGE uno stato condiviso, e i consumatori lo ricevono**: complemento del principio precedente, emerso nel Blocco G. Lo stesso dato serviva a tre posti — la pagina Notifiche sala, l'indicazione sulle card della piantina e la decisione "suona o no" del banner. Tre letture indipendenti degli stessi ordini aperti avrebbero significato tre query, tre sottoscrizioni Realtime e tre momenti diversi in cui ciascuna si aggiorna: l'elenco può mostrare una portata che il banner non ha annunciato, o una card accesa per qualcosa che l'elenco non ha più. Un solo lettore (`useHallNotifications`), montato una volta sola, e i consumatori leggono dal contesto. Corollario pratico: quando un consumatore ha bisogno di una **fetta** di quel dato che solo lui sa definire (la piantina vuole i tavoli da servire *limitati agli ordini che sta mostrando*, cioè data e turno selezionati), la fetta la calcola lui con una funzione condivisa, e non si aggiunge una seconda versione del dato nel lettore.

### Cronologia: decisioni corrette durante lo sviluppo di `ristorante_bar`

Sequenza di iterazioni, con cinque correzioni sostanziali (punti 2→3, 3→4, 4→6, 6→7, 7→8), prima di arrivare alla forma descritta in questo documento — utile a chi tocca questo codice per capire **perché** è fatto così e non riproporre un'idea già scartata. Tutti i commit citati sono sul branch `feature/ristorante-tavoli`.

1. **`24ef2bf` — versione minima**: tabella `tables` senza alcuna colonna di stato, di proposito — il toggle libero/occupato era solo `useState` locale in `Tavoli.jsx`, si azzerava a ogni reload. Nessuna migration per uno stato che "oggi non rappresenterebbe alcun dato reale".
2. **`172010b` — persistenza richiesta**: aggiunta `tables.status` (`text` CHECK `libero`/`occupato`, non `boolean`, per poter aggiungere un terzo stato in futuro senza cambiare tipo) + toggle manuale che lo scrive. Ancora nessun collegamento a prenotazioni reali.
3. **`015111d` — "Blocco A": riuso del modello di `appointments`**. Idea: un appuntamento normale (orario + durata) può avere un tavolo assegnato. Aggiunta `appointments.table_id`, select tavolo nel modulo appuntamento di `Agenda.jsx`, `Tavoli.jsx` che deriva lo stato "oggi" da un appuntamento in corso adesso collegato a quel tavolo (con `tables.status` tenuto come override manuale solo per le date diverse da oggi).
4. **`1927c27` — CORREZIONE: il modello di `appointments` non si adatta a una prenotazione ristorante.** Una prenotazione ha data + turno ("pranzo", "cena"), non un orario fisso con una durata calcolabile — nessuno sa in anticipo quando un tavolo si libererà. Disfatto il Blocco A: rimossa la select tavolo da `Agenda.jsx`, rimossa da `Tavoli.jsx` ogni logica basata su un appuntamento collegato. **`appointments.table_id` (e la sua migration, `20260922_appointments_table_id.sql`) restano nello schema inutilizzati** — nessun rollback, il codice applicativo ha semplicemente smesso di leggerlo/scriverlo (rischio di un rollback ritenuto superiore al beneficio di una colonna morta). Introdotto il nuovo modello `table_reservations`/`table_reservation_tables`, con `turn` ancora testo libero in questa fase, e `tables.status` ancora presente ma ora esplicitamente **disaccoppiato dalle prenotazioni** (nessun incrocio dati) e limitato alla sola vista di "oggi".
5. **`a9a2d00`/`310f963` — collegamento al sistema clienti**: `ensureContact()` crea/riusa un `contacts` in base al telefono al salvataggio di una prenotazione (dettagli in Fase 2, tabella `table_reservations`); correzione successiva perché la ricerca live del cliente era stata agganciata per errore al campo "Telefono" invece che al campo "Cliente" (bug di UX scoperto testando il comportamento, non di logica).
6. **`406b667` — CORREZIONE, la più importante del Blocco iniziale**: realizzato che libero/occupato **non è un valore unico per giorno** — lo stesso tavolo può essere libero a pranzo e occupato a cena, sono stati indipendenti legati anche al turno, non solo alla data. Introdotti i turni come entità propria (`business_turns`, configurabili per business, 4 creati automaticamente quando si imposta `vertical='ristorante_bar'` da `Admin.jsx`); `table_reservations.turn` (testo libero) sostituito da `turn_id` (FK obbligatoria). **`tables.status` e ogni toggle manuale eliminati per sempre** (colonna droppata): lo stato è ora **sempre calcolato al volo** per l'esatta combinazione (tavolo, data, turno) richiesta — vedi il principio generale poco sopra. I dati di prova delle sessioni precedenti in `table_reservations`/`table_reservation_tables` sono stati ripuliti con una `TRUNCATE` nella stessa migration (dati di test, non reali, mai avuto bisogno di essere migrati).
7. **`dd39b10`→`d70ad01` — CORREZIONE (Blocco C): OCCUPATO non può essere uno stato globale.** Il primo Blocco C (comande/ordinazioni — tabella `table_orders`, tre stati LIBERO/PRENOTATO/OCCUPATO) è partito con OCCUPATO derivato dalla sola esistenza di un ordine aperto sul tavolo, **indipendentemente da `order_date`/`turn_id`** — trattato come "un fatto fisico assoluto": un ordine aperto rende il tavolo occupato punto e basta, il turno resta solo informativo (così diceva letteralmente il commento originale della migration). Sbagliato per lo stesso identico motivo del punto 6: un ordine dimenticato aperto di ieri rendeva occupato il tavolo anche navigando su oggi, in un turno diverso — violava il principio "stato calcolato al volo per l'ESATTA combinazione" già stabilito per le prenotazioni, trattandolo come un'eccezione ingiustificata. Corretto scoping `openOrderByTable` (query `.eq('order_date', ...)` + filtro client su `turn_id`) alla stessa identica combinazione (tavolo, order_date, turn_id) di `reservationsByTable`, nessuna eccezione residua.
8. **`dd09580` — allineamento del vincolo DB, conseguenza diretta del punto 7.** Il vincolo unico originale (`idx_table_orders_one_open_per_table`) restava scoped al solo `table_id` — **"un tavolo fisico non può avere più di un ordine aperto contemporaneamente, punto"**. Corretto lo scoping applicativo (punto 7) ma non quello del vincolo DB, un ordine dimenticato aperto su un turno bloccava (errore 23505) l'apertura di un nuovo ordine sullo stesso tavolo a un turno diverso dello stesso giorno, anche se la UI mostrava già quel tavolo come libero per quella combinazione — un disallineamento tra ciò che il vincolo permette e ciò che la UI promette. Sostituito con `idx_table_orders_one_open_per_slot`, scoped a `(table_id, order_date, turn_id)`, introdotta insieme alla **chiusura automatica degli ordini dimenticati** (`table_orders.auto_closed`): un ordine aperto su un turno si chiude da solo quando arriva la successiva occorrenza dello STESSO turno (es. un Pranzo di ieri lasciato aperto si chiude quando si apre il Pranzo di oggi) — un turno non tocca mai un turno diverso, e navigare su una data diversa da oggi resta sempre sola lettura. Il commento in testa a `20260923_table_orders.sql` descriveva ancora la vecchia logica quando scoperto (la migration era già applicata in produzione) — corretto **solo nel commento**, con un commit separato (`0da027b`), nessuna modifica allo SQL eseguito.

Il Blocco B (catalogo menu — `menu_categories`/`menu_items`/`menu_item_flags`, commit `8041238`/`7d0af76`) è arrivato dopo le correzioni 1-6 ed è un modello indipendente, senza una propria cronologia di ripensamenti.

Il Blocco D (invio in cucina, portate, postazioni, vista cucina — `c913b7f`) ha portato la propria correzione di modello, sullo stesso principio dei punti 7-8: **nessuna voce d'ordine può restare senza postazione**, mai un'eccezione silenziosa. La regola di ripiego (prima postazione attiva) copre esplicitamente tre casi — categoria senza `station_id`, piatto senza categoria, piatto cancellato dal catalogo dopo l'ordine — risolti da un'**unica funzione condivisa** (`resolveStationId`/`resolveCourseId`/`groupItemsByCourse` in `src/lib/kitchenRouting.js`), mai duplicata tra `Cucina.jsx`/`Ordine.jsx`/`Menu.jsx` (vedi principio generale poco sopra). La messa a punto ha richiesto alcune correzioni minori scoperte in test dal vivo (bug, non decisioni di modello): `kitchen_stations` creata senza colonna `created_at` nonostante il codice la ordini per quella colonna, migration di fix separata (`36b1f0b`); l'uscita dalla modalità "solo schermo" della vista cucina agganciata per errore a un tocco sul nome della postazione invece che a un comando esplicito, causa di due test falliti (`d3e04cd`); i colori per portata mai realmente implementati e il pulsante "Postazioni" reso irraggiungibile da un contenitore toolbar senza `flex-wrap` in `Menu.jsx` (`faa49f0`).

### Blocco E (scorte, costi e margini) — decisioni prese e scartate

Il Blocco E (`cef770c`, branch `feature/ristorante-scorte`) non ha avuto correzioni *dopo* la scrittura come i precedenti: le alternative sono state scartate **prima**, in fase di progetto, perché ognuna nascondeva un modo di perdere dati o di mentire sui numeri. Vale la pena conoscerle per non riproporle.

1. **Ingredienti e ricette per piatto: esclusi di proposito.** L'alternativa era scalare la materia prima (farina, pomodoro) a ogni piatto venduto. Scartata: richiede unità di misura, conversioni, rese, cali di lavorazione e una distinta base per ogni piatto — un sistema che il titolare deve mantenere ogni volta che cambia una ricetta, e che produce numeri sbagliati appena smette di farlo. Si traccia **solo ciò che si vende a pezzo** (bibite, dolci confezionati): un dominio dove il conteggio è esatto senza manutenzione. Fuori scopo anche confezioni, fornitori e ordini ai fornitori.
2. **Costo stimato per piatto, accanto al costo reale.** Per tutto ciò che non si traccia a magazzino (la pizza, il primo) il costo non può essere "reale", ma lasciarlo vuoto renderebbe il margine inutilizzabile su quasi tutto il menu. Soluzione: `menu_items.estimated_cost`, sempre facoltativo, e ogni numero porta con sé la propria provenienza (`cost_source` `'reale'`\|`'stimato'`). In ogni resoconto le due parti restano **separate**: un margine calcolato su stime non viene mai sommato a uno calcolato su costi reali senza dirlo. Le voci senza nessun costo entrano nell'incasso, restano fuori dal margine e vengono contate a parte ("costo non inserito") invece di essere silenziosamente trattate come costo zero — che gonfierebbe il margine.
3. **`period_end` invece di `closed_at` come confine della chiusura.** Prima versione: la chiusura aveva solo `closed_at`, e la finestra successiva ripartiva da lì. Buco trovato prima di applicare la migration: tra il calcolo della proposta e la conferma passa tempo, e le voci inviate in quel buco non sono nella proposta ma hanno un istante *precedente* a `closed_at` — quindi la chiusura dopo le escluderebbe, e non verrebbero scalate da nessuna giacenza. Ora `period_end` è il confine contabile, fissato quando si **calcola** la proposta, e `closed_at` resta solo un timestamp di audit: ciò che arriva mentre la schermata è aperta cade nella finestra successiva.
4. **Orologio del database invece di quello dei dispositivi.** Stesso difetto del punto 3 ma peggiore, perché invisibile: anche con `period_end` corretto, confrontarlo con `sent_at` (scritto dal tablet) lascia che un orologio sbagliato faccia cadere una riga fuori da ogni finestra. Introdotta `table_order_items.sent_received_at`, scritta **solo** da un trigger con `now()` del database alla transizione "non inviata → inviata", e `period_end` ottenuto da `stock_closure_proposal()`, mai generato dal client. `sent_at` resta per i resoconti per giorno/turno/mese. Vedi il principio generale "confini contabili" sopra.
5. **Lock per le conferme simultanee.** Il controllo di concorrenza ottimistico ("il confine precedente è ancora quello su cui ho calcolato la proposta?") da solo non basta: due conferme simultanee da due dispositivi leggono entrambe lo stesso `max(period_end)` — nessuna vede l'insert non ancora committato dell'altra — passano entrambe il controllo e scalano due volte la parte di finestra in comune. La `UNIQUE (business_id, period_end)` non le intercetta, perché due proposte calcolate a istanti diversi hanno confini diversi. Risolto con `pg_advisory_xact_lock` per business all'inizio di `stock_closure_confirm`, **prima** della lettura del confine — stesso pattern di `create_booking`. Caso verificato per ragionamento sul percorso del codice, non riproducibile a mano da un solo browser.
6. **Conferma atomica in una funzione sola.** `supabase-js` non ha transazioni multi-statement: scrivere la chiusura e poi i movimenti con due chiamate separate significa che un errore di rete in mezzo lascia una chiusura senza movimenti — il venduto di quella finestra non scalato e la finestra successiva che riparte da dopo, cioè di nuovo venduto perso. Tutta la conferma vive in `stock_closure_confirm()`.
7. **Giacenza come registro, non come contatore** — applicazione diretta del principio "stato calcolato al volo": nessuna colonna `stock` da nessuna parte, la giacenza è sempre `somma(stock_movements.quantity)` e il costo attuale è sempre l'`unit_cost` dell'ultimo carico. Un errore non si corregge sovrascrivendo un numero ma aggiungendo una `rettifica` che lo compensa, così la storia resta leggibile.

### Blocco F (servizio di sala e cucina) — il difetto di navigazione e come è stato risolto

Il Blocco F (`aaac1be`, branch `feature/ristorante-servizio`) ha portato quattro cose: ogni schermata del verticale con il proprio indirizzo, gli avvisi di servizio a livello di dashboard, i totali per piatto in cucina e il blocco della postazione su un'area di lavoro. La prima ha prodotto un difetto istruttivo, corretto da `71a74ba`.

**Il sintomo.** Partendo da `?s=clienti` e premendo "Tavoli": al primo clic l'indirizzo diventava `?s=clienti&t=<id>` e si continuava a vedere Clienti; al secondo si vedeva Tavoli ma con l'indirizzo ancora sbagliato; solo al terzo i due si riallineavano. In più un parametro di Tavoli (`t=`) finiva nell'indirizzo mentre `s=` valeva ancora `clienti`, e `d=` si perdeva.

**La causa**, trovata leggendo il sorgente della libreria (`node_modules/react-router/.../useSearchParams`) e non per ipotesi:
```js
typeof nextInit === "function" ? nextInit(new URLSearchParams(searchParams)) : nextInit
...
}, [navigate, searchParams]);
```
L'updater funzionale di `setSearchParams` **non riceve l'indirizzo vivo**, riceve `searchParams` catturato nella closure della `useCallback`, cioè la fotografia del render in cui quella istanza è nata; e `setSearchParams` cambia identità a ogni query string, perché `searchParams` è tra le sue dipendenze. Si sommavano due effetti:
1. `setSection` è stato React (applicato subito nel batch del clic) mentre `navigate` passa dallo store del router e arriva **un render dopo**. In quella finestra `Tavoli.jsx` era già montato ma l'indirizzo diceva ancora `clienti`: i suoi effect scrivevano `d` e `t` su quella fotografia scaduta, riportando `s=clienti` e cancellando il `s=tavoli` appena scritto da `navigate_section`. L'effect che rilegge `s=` leggeva `clienti` e riportava indietro la sezione. Le due scritture (`d` e `t`) partivano dalla **stessa** fotografia, quindi vinceva l'ultima: per questo `d=` spariva.
2. Gli effect di scrittura dipendevano da `patchParams`, che dipendeva da `setSearchParams`: ogni scrittura dell'indirizzo li ri-eseguiva a catena. Al terzo clic la sezione risultava già quella giusta, il componente non si rimontava e l'indirizzo finalmente restava.

**La correzione.** Un solo modo di scrivere i parametri di sezione, l'hook `useSectionParams` (`src/lib/sectionParams.js`), che: costruisce la nuova query string da `window.location.search` (l'indirizzo vero in quell'istante — con `BrowserRouter` `history` lo aggiorna in modo sincrono, quindi due scritture consecutive si **compongono** invece di sovrascriversi); scrive con `navigate` di `useNavigate`, la cui identità non dipende dalla query string (dipende da `basename, navigator, routePathnamesJson, locationPathname, dataRouterContext`), quindi `patchParams` resta stabile e la catena di ri-esecuzioni si interrompe; e rifiuta di scrivere se `s=` non è già la propria sezione. Quel flag (`isActiveSection`) sta anche tra le dipendenze degli effect di scrittura, così una sezione non scrive niente finché l'indirizzo porta la precedente e scrive da sé appena arriva su di lei: **un clic basta**. L'effect che rilegge `s=` non è stato toccato, perché è condiviso con gli altri verticali.

**Cosa resta vero da ricordare**: i writer dell'indirizzo in tutta l'app sono esattamente **due** — `sectionParams.js` per i parametri dentro una sezione (sempre `replace`, così cambiare data dieci volte non riempie la cronologia e "indietro" torna alla sezione precedente) e `navigate_section` in `Dashboard.jsx` per la sezione (push, l'unica cosa che crea una voce di cronologia). Verificabile con un grep su `navigate({ search` e `setSearchParams(`.

Altre due note del Blocco F:
- **Avvisi a livello di dashboard.** "Piatto pronto" e "chiama sala" prima vivevano dentro `Ordine.jsx`, quindi arrivavano solo a chi era già dentro la schermata di un ordine. Ora le sottoscrizioni stanno in `Dashboard.jsx` e l'avviso (banner, suono, vibrazione) arriva in qualunque sezione. **Eccezione**: un dispositivo che sta nella vista Cucina non li riceve, perché sono avvisi destinati alla sala — il controllo usa un ref sulla sezione corrente, non lo stato, per non ricreare la sottoscrizione a ogni navigazione. In `Tavoli.jsx` e `Ordine.jsx` resta solo l'evidenza visiva locale (alone sulla card, pulsazione della sezione "In cucina"), per non emettere l'avviso due volte dalla stessa pagina.
- **Totali per piatto in cucina** ("Da preparare" / "In arrivo", raggruppati per nome): calcolati dalle **stesse** voci già filtrate per postazione di `tickets`, non da una query propria, così non possono raccontare qualcosa di diverso dalle schede sotto e si aggiornano in tempo reale insieme a loro.

### Blocco G (notifiche sala) — avviso per portata, non per piatto

Il Blocco G (branch `feature/notifiche-sala`) aggiunge il canale delle notifiche per i camerieri. Quattro decisioni di modello, tutte prese prima di scrivere il codice.

**1. Due famiglie di notifiche, trattate in modo diverso di proposito.** Nello stesso elenco, perché per un cameriere in sala sono la stessa cosa — qualcosa da fare adesso — ma nascono in due modi opposti:

- **STATO** ("Tavolo 3 · Antipasti — da servire"): **nessuna tabella, nessuna colonna**. È una lettura degli ordini aperti, applicazione diretta del principio "stato calcolato al volo". Conseguenze concrete: la riga sparisce **da sola** quando la portata viene consegnata, da qualunque schermata arrivi la consegna, senza che nessun punto del codice debba cancellare una notifica; e la stessa portata **non può** produrre due avvisi, perché la riga *è* lo stato, non un evento emesso. Persistirla avrebbe richiesto di cancellarla da Ordine, da Cucina e da questa pagina, con il consueto margine di disallineamento.
- **EVENTO** ("La cucina chiama la sala"): qui una riga in `hall_notifications` serve, perché l'evento **non è ricavabile da nessun altro dato**. Prima del Blocco G "Chiama sala" era solo un broadcast Realtime: un tablet di sala spento o riavviato nell'istante della chiamata la perdeva per sempre. Ora la cucina fa due cose — il broadcast (l'avviso immediato, invariato) e la riga (il ricordo). Il tocco valorizza `read_at`, nessun DELETE. `type` ha un CHECK già esteso a `'prodotto_esaurito'`, che il codice **non usa**: così il giorno in cui servirà non occorrerà una migration per allargare il vincolo.

**2. La regola "portata pronta", in un posto solo** (`buildStateNotifications` in `src/lib/hallNotifications.js`). I gruppi sono **(ordine, portata)** — e attraversano le postazioni: due antipasti dalla cucina e uno dal bar sono **un** gruppo, con un solo avviso — oppure **(ordine, postazione)** per le voci senza portata risolvibile, etichettate con `kitchen_stations.notification_label`. Dentro un gruppo contano solo le voci inviate, col via dato, in `'da_preparare'` (in lavorazione) o `'pronto'`; `'consegnato'` e `'annullato'` restano fuori, e restano fuori anche le voci ancora in attesa del via — una portata trattenuta non è in lavorazione, e se contasse non si completerebbe mai. Il gruppo è una notifica se e solo se **pronte > 0 e in lavorazione == 0**. Tre antipasti che diventano pronti uno alla volta producono **un solo** avviso, alla fine.

**Conseguenza accettata esplicitamente**: una voce aggiunta e inviata *dopo* che la portata era già completa la fa tornare incompleta, quindi la riga sparisce finché anche quella non è pronta, e poi riappare. È il prezzo di "l'avviso parte a portata completa" senza ricordare da nessuna parte che un avviso era già stato dato — l'alternativa era persistire lo stato, cioè il contrario del punto 1.

**3. Livelli d'avviso per postazione** (`kitchen_stations.alert_level`): `'forte'` dà banner, suono e vibrazione; `'leggero'` niente suono, resta nell'elenco e sulla card del tavolo; `'nessuno'` solo nell'elenco. Il livello non cambia **mai** quali notifiche esistono, solo quanto rumore fanno: per questo è una colonna della postazione e non un filtro sulle notifiche. Su una portata che attraversa postazioni con livelli diversi vince il **più forte** — il contrario significherebbe perdere in silenzio un piatto che il cuoco ha chiesto di segnalare.

**4. Postazioni servite dalla sala** (`kitchen_stations.served_by_hall`), per i locali dove le bibite le prende direttamente il cameriere: le loro voci, **nello stesso write che le invia**, nascono già consegnate (`kitchen_status='consegnato'`, `ready_at` e `delivered_at` = istante dell'invio). Non compaiono in nessuna vista cucina né nei totali per piatto, ma restano a tutti gli effetti nell'ordine, nel conto, nei margini (il costo è fotografato come per ogni altra voce) e nello scarico delle scorte. `ready_at` è valorizzato insieme a `delivered_at` di proposito: una riga consegnata senza `ready_at` sarebbe uno stato che non esiste in nessun altro percorso e falserebbe qualunque futuro calcolo di tempi di preparazione.

Due note su questa colonna:
- **Non è un trigger, è il client.** Un trigger dovrebbe risolvere la postazione della voce (`menu_items` → `menu_categories.station_id` più i tre casi di ripiego), cioè riscrivere in PL/pgSQL la logica di `kitchenRouting.js`: due copie della stessa regola che possono divergere, contro il principio "una sola funzione condivisa". L'invio passa comunque da un punto solo (`sendToKitchen` in `Ordine.jsx`), che deve calcolare la cosa anche per la coda offline. Perché quel punto sappia la risposta **già all'apertura della schermata e anche senza rete**, l'ultima configurazione nota delle postazioni è salvata sul dispositivo (`src/lib/stationsCache.js`) e sovrascritta appena la query risponde: senza quella copia esisteva una finestra in cui una bibita veniva inviata come un piatto normale, e offline la finestra non si chiudeva mai.
- **La regola di ripiego non sceglie mai una postazione servita dalla sala**: `resolveStationId` ripiega sulla prima attiva **non** servita dalla sala, e solo se non ne esiste nessuna torna alla regola precedente (prima attiva, qualunque sia). Altrimenti una voce senza postazione assegnata sarebbe nata consegnata senza che nessuno l'avesse deciso. L'assegnazione **esplicita** di una categoria a una postazione servita dalla sala invece vale: è esattamente il caso delle bibite. Conseguenza in `Cucina.jsx`: la risoluzione riceve sempre l'elenco **completo** delle postazioni attive e solo *dopo* si scartano le voci servite dalla sala — risolvere su un elenco già filtrato farebbe ripiegare le bibite sulla prima postazione della cucina, facendole comparire proprio dove non devono. Nel selettore di postazione della vista cucina quelle postazioni non compaiono: mostrerebbero per sempre una vista vuota.

**Un solo punto che legge** (vedi il principio generale sopra): `useHallNotifications` carica ordini aperti, postazioni, portate e righe non lette, tiene le tre sottoscrizioni Realtime e offre le azioni; `HallNotificationsProvider` lo monta e mette tutto nel contesto. `Dashboard.jsx` in questo blocco **perde** codice: i due effect degli avvisi, lo stato del banner e il banner stesso sono usciti da lì e sono entrati nel provider, montato nel ramo `isRestaurant` — il bundle principale è leggermente più piccolo di prima. L'eccezione "un dispositivo nella vista Cucina non riceve gli avvisi di sala" è rimasta, come prop `section` letta attraverso un ref per non ricreare le sottoscrizioni a ogni navigazione. Il banner è diventato un pulsante: toccarlo apre la pagina da qualunque sezione.

**Area Sala del lucchetto**: `KIOSK_AREAS.sala` elenca ora `['tavoli', 'notifiche']`, così con il lucchetto attivo si passa liberamente fra piantina, ordine e notifiche. Da bloccati la barra laterale non è renderizzata, quindi il passaggio fra le due schermate vive **in pagina** (un collegamento nella toolbar di ciascuna, con il contatore su quello di Tavoli) — senza, le notifiche sarebbero raggiungibili solo aspettando un banner.

**L'indicazione sulle card dei tavoli** era un lampo di sei secondi a ogni singolo piatto che diventava pronto; ora segue la stessa regola della portata e resta finché non è servita, ed è limitata agli ordini che la piantina sta mostrando (data e turno selezionati) — un ordine dimenticato aperto ieri sera marcherebbe altrimenti un tavolo che in quella griglia è libero.

**Due limiti noti, non difetti nascosti**: il tocco su una notifica scrive diretto, senza la coda offline di `Ordine.jsx` (stesso comportamento di "Pronto"/"Consegnata" nella vista Cucina); e l'ordinamento dell'elenco mescola `ready_at` (orologio del dispositivo) e `created_at` (orologio del database) — accettabile perché è un elenco di lavoro, non un confine contabile: per quelli vale la regola "solo l'orologio del database" descritta sopra.

---

## FASE 1 — Struttura, stack, route, edge function, migration

### 1. Struttura completa di cartelle e file

```
localhub/                              root del progetto (nome interno "pium")
├── .env                                variabili d'ambiente locali (VITE_SUPABASE_URL, chiavi, ecc.) — non versionato
├── index.html                          entry HTML di Vite, monta <div id="root"> e carica src/main.jsx
├── vite.config.js                      config Vite: plugin React + plugin Tailwind CSS v4
├── eslint.config.js                    config ESLint (flat config), regole React Hooks/Refresh
├── vercel.json                         config deploy Vercel: rewrite SPA (tutte le route → index.html) + header no-cache per favicon/icone
├── cloudflare-worker.js                Worker Cloudflare: proxy trasparente *.piumapp.com → www.piumapp.com (per i siti pubblici su sottodominio, es. mario.piumapp.com)
├── package.json / package-lock.json    manifest npm e lock delle dipendenze
├── test_contatti.vcf                   file vCard di test per l'import contatti (Clienti.jsx)
│
├── scripts/
│   └── gen-favicon.mjs                 script Node: genera favicon.ico/favicon-32.png da icon-512.png (sharp + png-to-ico)
│
├── public/                             asset statici serviti as-is da Vite
│   ├── favicon.ico, favicon-32.png, favicon.svg, icon-192.png, icon-512.png, icons.svg
│   ├── manifest.json                   manifest PWA (nome app, icone, display standalone)
│   ├── sw.js                           service worker PWA (cache/notifiche push)
│   └── fonts/                          font self-hosted
│
├── dist/                               output di build (`vite build`), stessa struttura di public/ + assets/ compilati — non va toccato a mano
│
├── src/
│   ├── main.jsx                        bootstrap React: monta <App/>, inietta manifest PWA/meta Apple e registra il service worker solo sul dominio principale (www.piumapp.com/piumapp.com/localhost); su sottodominio pubblico deregistra eventuali SW
│   ├── App.jsx                         definizione di tutte le route (BrowserRouter) + logica di redirect per i sottodomini pubblici
│   ├── App.css / index.css             stili globali e Tailwind
│   ├── assets/                         immagini statiche importate nei componenti (hero.png, react.svg, vite.svg)
│   │
│   ├── lib/                            moduli di utilità condivisi, non-UI
│   │   ├── supabase.js                 istanza singola del client Supabase (createClient con URL + anon key da env)
│   │   ├── claude.js                   client per la Edge Function claude-proxy (generateWithClaude), usato per generare contenuti AI (recensioni, social, onboarding)
│   │   ├── activityLog.js              logActivity(): insert fire-and-forget su tabella activity_log
│   │   ├── businessGate.js             logica di stato dell'abbonamento: isTrialExpiredUnpaid, isBusinessBlocked, getBusinessRealStatus (trial/active/expired/suspended/gift)
│   │   ├── errors.js                   translateError(): mappa i messaggi d'errore Supabase Auth in italiano leggibile
│   │   ├── notifications.js            gestione notifiche browser/local (richiesta permesso, promemoria appuntamenti del giorno, notifica prossimo appuntamento)
│   │   ├── phone.js                    normalizePhone()/buildWaLink(): normalizzazione numeri IT e generazione link wa.me
│   │   ├── pushSubscription.js         iscrizione/disiscrizione Web Push (VAPID) tramite Service Worker
│   │   ├── safeUrl.js                  safeHref(): whitelist di protocolli (http/https/mailto/tel) per evitare javascript: URL non sicuri nei link generati da dati utente
│   │   ├── useStripeCheckout.js        hook React: avvia il checkout Stripe (piano PIUM, pieno o scontato "-on") condiviso da Dashboard e Settings
│   │   ├── kitchenRouting.js           [verticale 'ristorante_bar'] resolveStationId/resolveCourseId/groupItemsByCourse — unica fonte di verità per la risoluzione postazione/portata di una voce d'ordine (coi 3 casi di ripiego), usata da Cucina.jsx/Ordine.jsx/Menu.jsx
│   │   ├── kitchenRealtime.js          [verticale 'ristorante_bar'] subscribeTableOrderItems/subscribeCallSala/sendCallSala/notifyReady/recordCallSala/subscribeHallNotifications — wrapper Supabase Realtime (postgres_changes su table_order_items, senza filtro business_id: la tabella non ha quella colonna, RLS scopa comunque le righe; su hall_notifications il filtro business_id c'è, perché quella colonna esiste) + canale broadcast "Chiama sala" + vibrazione/suono
│   │   ├── hallNotifications.js        [verticale 'ristorante_bar'] logica pura delle notifiche di sala, senza React e senza DB: buildStateNotifications (la regola "una portata è pronta"), buildEventNotifications, mergeNotifications, strongestAlertLevel, tableIdsToServe — vedi Blocco G in "Verticali"
│   │   ├── useHallNotifications.js     [verticale 'ristorante_bar'] UNICO punto che legge i dati delle notifiche (ordini aperti, postazioni, portate, righe di hall_notifications) con le relative sottoscrizioni Realtime e le azioni "consegnata"/"letta". Montato solo dal provider, mai da Dashboard.jsx
│   │   ├── hallNotificationsContext.js [verticale 'ristorante_bar'] il contesto da cui NotificheSala.jsx e Tavoli.jsx leggono quelle notifiche, con valore di ripiego vuoto per un componente montato fuori dal provider
│   │   ├── stationsCache.js            [verticale 'ristorante_bar'] ultima configurazione nota delle postazioni salvata sul dispositivo (incluso served_by_hall), letta all'apertura di Ordine.jsx prima che la query risponda e quando la rete non c'è — fotografia dell'ultima risposta del server, non una seconda verità
│   │   ├── kitchenSeed.js              [verticale 'ristorante_bar'] ensureDefaultCourses/ensureDefaultStation — seeding condiviso tra Menu.jsx e Cucina.jsx (qualunque delle due schermate si apra per prima su un business senza ancora portate/postazioni)
│   │   ├── datetime.js                 BUSINESS_TIMEZONE ('Europe/Rome', unica costante del progetto) + formattatori e chiavi di raggruppamento per giorno/mese di calendario ITALIANO. Qualunque orario mostrato all'utente passa di qui: toLocaleString() nudo userebbe il fuso del dispositivo, e un raggruppamento con getDate() userebbe il giorno del browser invece di quello italiano
│   │   ├── stock.js                    [verticale 'ristorante_bar'] giacenze (somma dei movimenti), costo attuale (ultimo carico), resolveCostSnapshot (la regola del costo da fotografare all'invio, in un posto solo), margini, e il caricamento dello stato scorte che riusa stock_closure_proposal — usata da Scorte.jsx, Menu.jsx e Ordine.jsx
│   │   ├── sectionParams.js            [verticale 'ristorante_bar'] useSectionParams: UNICO modo in cui una sezione scrive i propri parametri d'indirizzo (data/turno/ordine in Tavoli, postazione in Cucina). Base sempre da window.location.search, scrittura con navigate di useNavigate, guardia "sono la sezione attiva", sempre replace — il perché di ognuna di queste tre scelte è un difetto reale, vedi Cronologia Blocco F
│   │   └── kiosk.js                    [verticale 'ristorante_bar'] blocco postazione: aree di lavoro (Sala = tavoli+ordine, Cucina), lettura/scrittura dello stato su localStorage per dispositivo con whitelist dei valori, ingresso/uscita da schermo intero
│   │
│   ├── components/                     componenti condivisi/trasversali
│   │   ├── ErrorBoundary.jsx           React error boundary di primo livello, cattura crash e mostra fallback
│   │   ├── Logo.jsx                    logo testuale "pium" con pallino colorato, riusato in tutte le pagine
│   │   ├── PWABanner.jsx               banner "installa l'app" per mobile (prompt PWA nativo o istruzioni iOS)
│   │   ├── SubscriptionGate.jsx        schermata a tutto schermo mostrata quando isBusinessBlocked è vero (trial scaduto/sospeso/expired): permette solo pagare o uscire
│   │   ├── SupportBot.jsx              chatbot di supporto client-side basato su regole (FAQ locali), non chiama AI
│   │   ├── PetBoneIcon.jsx             [verticale 'toelettatura'] chip colorato a forma di osso con nome+genere del pet; riusato da Clienti.jsx e Agenda.jsx, sempre dietro il gate su business.vertical — vedi sezione "Verticali"
│   │   ├── PetIndicators.jsx           [verticale 'toelettatura'] CoatBars (lunghezza pelo, 3 tacche) e SizeBadge (taglia XS→XL); mostrati sul blocco appuntamento di Agenda.jsx solo se il verticale è attivo E l'appuntamento ha un pet collegato
│   │   │
│   │   ├── dashboard/                  le sezioni della dashboard business (montate da Dashboard.jsx come tab)
│   │   │   ├── Panoramica.jsx           riepilogo/home dashboard: prossimi appuntamenti, statistiche rapide
│   │   │   ├── Agenda.jsx               agenda/calendario appuntamenti: creazione, collaboratori, colori, festività, notifiche (il componente più grande, ~1700+ righe); per business.vertical='toelettatura' aggiunge una sezione "Animali" gated nel modulo appuntamento (ricerca cross-business su pets.name, precompila cliente, salva pet_id) e gli indicatori pelo/taglia sul blocco in vista giorno
│   │   │   ├── Clienti.jsx              rubrica clienti: CRUD, import vCard (libreria vcf), raggruppamento per telefono normalizzato; per business.vertical='toelettatura' aggiunge sezione "Animali" gated nella scheda cliente (CRUD pet completo: crea, modifica, elimina)
│   │   │   ├── EditorSito.jsx           editor del sito pubblico del business: hero, chi siamo, copertina, galleria immagini (con compressione client-side), orari (via Orari.jsx)
│   │   │   ├── Orari.jsx                sotto-componente di EditorSito: editor degli orari di apertura settimanali (mattina/pomeriggio per giorno)
│   │   │   ├── Servizi.jsx              CRUD servizi offerti (nome, prezzo, durata, disponibilità, visibilità sul sito pubblico, colore facoltativo — stessa palette/classi `.ag-swatch` già usate per i dipendenti in Agenda.jsx, mostrato come pallino sul blocco appuntamento)
│   │   │   ├── Social.jsx               generazione post social (Instagram/Facebook) assistita da AI (Claude), con toni predefiniti
│   │   │   ├── Recensioni.jsx           gestione recensioni multi-sorgente (manuale, Google, TripAdvisor, Facebook, Yelp) con risposte generate via AI
│   │   │   ├── Promemoria.jsx           todo/reminder interni per l'attività (priorità alta/media/bassa, stato pending/done)
│   │   │   ├── PromemoriaClienti.jsx    promemoria manuali verso i clienti via WhatsApp (genera link wa.me con messaggio precompilato) — legge solo `appointments`, NON `table_reservations`: un cliente con una prenotazione tavolo per oggi non compare qui (verificato, non esteso di proposito)
│   │   │   ├── Tavoli.jsx               [verticale 'ristorante_bar'] piantina tavoli: CRUD tavoli (incl. "+ Aggiungi N tavoli" in blocco), switch di turno, prenotazioni per data/turno, gestione turni (business_turns), lucchetto area Sala, data/turno/ordine nell'indirizzo (hook useSectionParams), TRE stati tavolo (LIBERO/PRENOTATO/OCCUPATO) SEMPRE calcolati al volo per l'esatta combinazione tavolo+data+turno (mai persistiti — vedi sezione "Verticali"), avviso vibrazione+suono+evidenza visiva sulla card quando una voce diventa "pronto", ricezione "Chiama sala". Monta Ordine.jsx a schermo intero al posto della griglia quando un ordine è aperto. Caricato con `React.lazy()` da Dashboard.jsx, mai staticamente
│   │   │   ├── Menu.jsx                 [verticale 'ristorante_bar'] catalogo menu: categorie (CRUD + riordino, assegnazione portata/postazione), piatti (CRUD + disponibilità), pulsante "Segnala esaurito" senza restrizioni, sezione separata "Conferme fine turno", gestione Portate (business_courses) e Postazioni (kitchen_stations) con avviso categorie orfane, interruttore "invia sempre tutto subito". Caricato con `React.lazy()`, stesso principio di Tavoli.jsx
│   │   │   ├── Ordine.jsx               [verticale 'ristorante_bar'] schermata ordine (Blocco C, estesa nei Blocchi D-F; lucchetto area Sala, e l'ordine aperto sta nell'indirizzo — scritto da Tavoli.jsx, che la monta): ricerca+griglia piatti, righe "da inviare" (editabili) vs "in cucina" (sent_at valorizzato, sola azione "Annulla"), invio in cucina con scelta subito/in attesa per portata, "Via"/"Consegnata" per fascia, protezione dalle cadute di rete (coda locale con id generato lato client, upsert-per-id, badge "in attesa di rete", blocco invio finché non è tutto salvato), indicatore realtime disconnesso. Importata staticamente SOLO da Tavoli.jsx (che è già `React.lazy()` e già gated) — nessun secondo punto d'ingresso, verificato con grep
│   │   │   ├── Scorte.jsx               [verticale 'ristorante_bar'] scorte, costi e margini (Blocco E) — voce di navigazione propria, `React.lazy()` + doppio gate. Quattro linguette: Giacenze (registrata / da scalare / stima attuale, costo attuale con provenienza reale|stimata, margine per pezzo, % costo, "Da riordinare"), Movimenti (registro completo), Chiusure, Margini (per giorno/mese/chiusura, costo reale e stimato sempre distinti). Carichi e rettifiche; "Chiudi conteggio" con quantità correggibili prima di confermare. Pensata per il titolare, non per la sala
│   │   │   ├── NotificheSala.jsx        [verticale 'ristorante_bar'] pagina "Notifiche sala" (Blocco G) — voce di navigazione propria, `React.lazy()` + doppio gate, parte dell'area Sala del lucchetto insieme a Tavoli e Ordine. NON carica niente: legge l'elenco dal contesto e agisce (tocco = portata consegnata, oppure notifica letta). Elenco unico dalla più vecchia alla più recente, con le due famiglie mescolate
│   │   │   ├── HallNotificationsProvider.jsx [verticale 'ristorante_bar'] monta useHallNotifications, mette i dati nel contesto e mostra il banner dell'avviso (un pulsante: apre Notifiche sala). Montato da Dashboard.jsx con `React.lazy()` dentro il ramo isRestaurant, FUORI dall'ErrorBoundary con key={section} così non si rimonta a ogni navigazione
│   │   │   └── Cucina.jsx               [verticale 'ristorante_bar'] vista cucina — voce di navigazione propria, `React.lazy()` + doppio gate (NAV + Section map in Dashboard.jsx) come Tavoli/Menu. Selezione postazione/modalità per dispositivo (localStorage, mai sul server), schede per tavolo divise in fasce colorate per portata (palette fissa per slot_number), totali per piatto in cima ("Da preparare"/"In arrivo", dagli stessi dati delle schede), tap→pronto, Via/Consegnata, "Chiama sala", lucchetto area Cucina, postazione nell'indirizzo, modalità "solo schermo" per TV (testo grande, nessun pulsante — il cambio modalità è un comando esplicito separato, mai un tocco sul nome della postazione). Tempo reale con reload completo a ogni evento/riconnessione, mai patch parziali
│   │   │
│   │   └── public/
│   │       └── BookingSection.jsx      form di prenotazione pubblico multi-step (servizio → data → slot → dati → conferma → successo), con Cloudflare Turnstile anti-bot, chiama la Edge Function create-booking
│   │
│   └── pages/                          una pagina per route
│       ├── Landing.jsx                  homepage marketing pubblica (www.piumapp.com/)
│       ├── Auth.jsx                     login/registrazione utente business
│       ├── Onboarding.jsx               wizard di configurazione iniziale del business (categoria, dati, generazione contenuti con Claude)
│       ├── Dashboard.jsx                shell della dashboard autenticata: carica il business, gestisce il gate abbonamento, monta le sezioni di components/dashboard — i componenti specifici di verticale (Tavoli.jsx/Menu.jsx/Cucina.jsx/Scorte.jsx) sono `React.lazy()`, non import statici, e compaiono in NAV/vengono montati solo se business.vertical corrisponde. Per `ristorante_bar` ospita anche gli avvisi di servizio (unico punto che li ascolta, vedi Blocco F) e lo stato del blocco postazione, che nasconde barra laterale e navigazione; tutto dentro un controllo su business.vertical, inerte per gli altri verticali
│       ├── Settings.jsx                 impostazioni account/abbonamento: notifiche push, stato piano, checkout/gestione Stripe
│       ├── ResetPassword.jsx            flusso di reset password (link da email Supabase Auth)
│       ├── PublicSite.jsx               sito pubblico del business (per slug o sottodominio): presenta servizi, galleria, orari, recensioni e il BookingSection
│       ├── Admin.jsx                    pannello amministrativo interno (gestione business, piani, note admin, affiliati) — il file più grande del progetto (~1470 righe)
│       ├── AdminLogin.jsx               login separato per l'accesso admin (/x-admin-login)
│       ├── Affiliates.jsx               area riservata affiliati: stato clienti referenziati, commissioni
│       ├── AffiliatesAuth.jsx           login/registrazione affiliati, genera il codice affiliato
│       └── legal/
│           ├── LegalPage.jsx            layout comune per le pagine legali (rende il markdown ricevuto come content)
│           ├── Privacy.jsx              wrapper che carica legal-docs/privacy-policy.md
│           ├── Termini.jsx              wrapper che carica legal-docs/termini-servizio.md
│           ├── Cookie.jsx               wrapper che carica legal-docs/cookie-policy.md
│           ├── Dpa.jsx                  wrapper che carica legal-docs/dpa.md
│           └── ContrattoAffiliazione.jsx wrapper che carica legal-docs/contratto-affiliazione.md
│
├── legal-docs/                          testi legali in Markdown, importati con `?raw` dalle pagine legal/*
│   ├── privacy-policy.md, termini-servizio.md, cookie-policy.md, dpa.md, contratto-affiliazione.md
│
├── supabase/
│   ├── schema.sql                       schema di riferimento "storico" del database (tabelle core: businesses, services, ecc.) — non sempre allineato 1:1 col DB reale (vedi migration che "documentano" colonne aggiunte a mano)
│   ├── activity_log.sql                 script standalone (pre-migration) per creare activity_log — poi ri-tracciato in 20260521_activity_log.sql
│   ├── .temp/                           file di lavoro della Supabase CLI (cli-latest, linked-project.json) — generati in locale, non contenuto applicativo
│   ├── functions/                       Edge Functions Deno (dettaglio sezione 4)
│   └── migrations/                      migration SQL in ordine cronologico (dettaglio sezione 5)
│
└── DOCS/, *.md in root                  documentazione precedente del progetto (audit, handoff, FAQ tecniche) — materiale di contesto, non fa parte del codice applicativo
```

---

### 2. Stack tecnologico reale (da `package.json`)

**Runtime / framework**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `react` | ^19.2.5 | libreria UI, tutta l'app è una SPA React |
| `react-dom` | ^19.2.5 | rendering React nel DOM |
| `react-router-dom` | ^7.14.2 | routing client-side (tutte le route in `App.jsx`, incl. `BrowserRouter`, `Navigate`, `useParams`) |
| `vite` | ^8.0.9 | build tool e dev server |
| `@vitejs/plugin-react` | ^6.0.1 | supporto JSX/Fast Refresh per Vite |

**Backend-as-a-service / pagamenti**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `@supabase/supabase-js` | ^2.104.0 | client per Postgres+Auth+Storage+Realtime di Supabase (unico backend dati) |
| `@stripe/stripe-js` | ^9.5.0 | client Stripe lato browser (redirect a Stripe Checkout) |
| `stripe` | ^22.1.1 | SDK Stripe server-side, usato dentro le Edge Functions (`stripe-checkout`, `stripe-webhook`) |

**Utility applicative**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `vcf` | ^2.1.2 | parsing di file vCard (.vcf) per l'import contatti in Clienti.jsx |
| `browser-image-compression` | ^2.0.2 | compressione immagini lato client prima dell'upload (galleria sito, EditorSito.jsx) |

**Styling**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `tailwindcss` | ^4.2.4 | utility CSS |
| `@tailwindcss/vite` | ^4.2.4 | plugin Vite per Tailwind v4 (nessun tailwind.config separato, integrato via plugin) |

**Dev tooling**
| Libreria | Versione | A cosa serve |
|---|---|---|
| `eslint` + `@eslint/js` | ^9.39.4 | linting |
| `eslint-plugin-react-hooks` | ^7.1.1 | regole lint sulle regole degli hook React |
| `eslint-plugin-react-refresh` | ^0.5.2 | regole lint compatibilità Fast Refresh |
| `globals` | ^17.5.0 | set di globals per config ESLint |
| `@types/react`, `@types/react-dom` | ^19.x | tipi TS per autocompletamento (progetto è JS puro, non TS) |
| `sharp` | ^0.35.1 | elaborazione immagini (usato da `scripts/gen-favicon.mjs`) |
| `png-to-ico` | ^3.0.1 | conversione PNG→ICO (favicon), usato dallo stesso script |

**Note**: nessun framework di test presente in `package.json` (no Jest/Vitest/Playwright). Nessun TypeScript nel codice applicativo (solo Edge Functions `.ts`, eseguite da Deno, fuori dalla build Vite).

---

### 3. Route (da `App.jsx`) e componenti dashboard

**Routing generale**: `App.jsx` distingue due modalità in base all'hostname:
- **Sottodominio pubblico** (es. `mario.piumapp.com`, proxato in modo trasparente da `cloudflare-worker.js`): tutte le route vengono catturate e rese come `PublicSite`, bypassando i redirect di `PublicRoute`.
- **Dominio principale** (`www.piumapp.com` / `piumapp.com` / `localhost`): tabella di route completa sotto.

| Path | Componente | Wrapper | Note |
|---|---|---|---|
| `/` | `Landing` | `PublicRoute` | homepage marketing; redirect a `/dashboard` se già loggato |
| `/auth` | `Auth` | `PublicRoute` | login/registrazione |
| `/onboarding` | `Onboarding` | — | wizard post-registrazione |
| `/dashboard` | `Dashboard` | — | area autenticata principale |
| `/admin` | `Admin` | — | pannello amministrativo interno |
| `/x-admin-login` | `AdminLogin` | — | login separato per l'admin |
| `/settings` | `Settings` | — | impostazioni account/abbonamento |
| `/reset-password` | `ResetPassword` | — | reset password da link email |
| `/site/:slug` | `PublicSite` | — | sito pubblico via path esplicito |
| `/affiliates` | `Affiliates` | — | area riservata affiliati |
| `/affiliates/auth` | `AffiliatesAuth` | — | login/registrazione affiliati |
| `/privacy` | `Privacy` | — | pagina legale |
| `/termini` | `Termini` | — | pagina legale |
| `/cookie` | `Cookie` | — | pagina legale |
| `/dpa` | `Dpa` | — | pagina legale |
| `/contratto-affiliazione` | `ContrattoAffiliazione` | — | pagina legale |
| `/ref/:code` | `RefRedirect` (locale ad App.jsx) | — | salva il codice affiliato in `localStorage` e redirige a `/auth` |
| `/:slug` | `PublicSite` | — | catch-all finale: sito pubblico via slug diretto (deve restare l'ultima route) |

Componenti ausiliari montati sempre in `App.jsx` (non route, sempre presenti sul dominio principale): `NotificationScheduler` (pianifica le notifiche degli appuntamenti odierni), `PWABanner`, `SupportBot`, entrambi avvolti in `ErrorBoundary`.

**Componenti dashboard** (montati come tab/sezioni dentro `Dashboard.jsx`, in `src/components/dashboard/`):
1. `Panoramica.jsx` — riepilogo/home
2. `Agenda.jsx` — calendario appuntamenti
3. `Clienti.jsx` — rubrica clienti
4. `EditorSito.jsx` (+ `Orari.jsx`) — editor sito pubblico e orari
5. `Servizi.jsx` — catalogo servizi
6. `Social.jsx` — generazione post social AI
7. `Recensioni.jsx` — gestione recensioni
8. `Promemoria.jsx` — reminder interni
9. `PromemoriaClienti.jsx` — reminder WhatsApp verso clienti

**Solo per `business.vertical === 'ristorante_bar'`**, montati SOLO per `business.vertical === 'ristorante_bar'`, caricati con `React.lazy()` (non nell'elenco sopra perché non presenti in master e non statici — `Ordine.jsx` fa eccezione, importato staticamente ma solo da `Tavoli.jsx`, già lazy):
10. `Tavoli.jsx` — piantina tavoli, prenotazioni per data/turno, gestione turni, tre stati tavolo calcolati al volo
11. `Menu.jsx` — catalogo menu (categorie, piatti, segnalazioni esaurito, portate, postazioni)
12. `Ordine.jsx` — schermata ordine (invio in cucina, attesa/via, protezione offline, snapshot di costo), montata da `Tavoli.jsx`
13. `Cucina.jsx` — vista cucina per postazione, nav propria, tempo reale
14. `Scorte.jsx` — scorte, costi e margini: giacenze, carichi/rettifiche, chiusure del conteggio, resoconti

Non è una sezione ma vive nella stessa cartella: `KioskLockButton.jsx` — il pulsante lucchetto con pressione lunga e tastierino del codice, usato da Tavoli, Ordine e Cucina (compresa l'intestazione della modalità solo schermo). Una sola implementazione, altrimenti le tre sezioni finirebbero con comportamenti di sblocco leggermente diversi.

Componente pubblico separato: `src/components/public/BookingSection.jsx`, usato da `PublicSite.jsx`.

---

### 4. Edge Functions (`supabase/functions/`)

| Funzione | `verify_jwt` | Scopo |
|---|---|---|
| `approve-affiliate` | (default, JWT richiesto) | Cambia lo stato di un affiliato (`pending`/`approved`/`rejected`) usando la service role key; invia email via Resend. Unico canale ammesso per approvare un affiliato (la policy RLS diretta è stata rimossa, vedi migration `20260719_drop_affiliates_all_policy.sql`) |
| `claude-proxy` | (default, JWT richiesto) | Proxy autenticato verso l'API Claude per la generazione di contenuti AI (recensioni, social, onboarding); applica un limite token (`TOKEN_LIMIT = 350_000`) |
| `create-booking` | (default, JWT richiesto lato dashboard, ma pensata per essere l'unico ingresso pubblico alle prenotazioni tramite anon key) | Crea una prenotazione pubblica chiamando la RPC `create_booking` nel DB; traduce gli errori noti del DB in messaggi utente, nasconde gli altri; punto di arrivo del form `BookingSection.jsx` |
| `notify-new-booking` | `false` (esplicito in `config.toml`) | Webhook invocato dal trigger DB `on_new_booking`; verifica un secret condiviso (`X-Webhook-Secret`, confronto a tempo costante) e invia una notifica push (libreria `web-push`) al proprietario del business |
| `stripe-checkout` | (default, JWT richiesto) | Crea una sessione di Stripe Checkout per l'upgrade al piano a pagamento, applicando lo sconto "-on" in base al codice affiliato del business |
| `stripe-webhook` | `false` (esplicito in `config.toml`) | Riceve gli eventi Stripe (pagamenti, abbonamenti), verifica la firma con Web Crypto, aggiorna lo stato del business e calcola/registra le commissioni affiliato (tariffe piena/scontata/a lungo termine definite qui) |

---

### 5. Migration (`supabase/migrations/`, in ordine cronologico)

| File | Cosa fa |
|---|---|
| `20260422_add_whatsapp_to_businesses.sql` | Aggiunge la colonna `whatsapp` a `businesses` |
| `20260423_admin_panel.sql` | Aggiunge la colonna `plan` (trial/free/starter/pro) e la policy RLS per il pannello admin |
| `20260507_profile_social_custom_category.sql` | Aggiunge foto profilo, link social (Instagram/Facebook) e categoria libera a `businesses` |
| `20260509_bookings.sql` | Crea la tabella `bookings` (sistema di prenotazione V1) |
| `20260512_booking_v2.sql` | Booking V2: rimuove l'OTP, passa a un flusso pending + conferma manuale del proprietario |
| `20260513_booking_whatsapp.sql` | Aggiunge `booking_id` su `appointments` per collegare l'appuntamento alla prenotazione d'origine |
| `20260514_realtime_bookings.sql` | Abilita Supabase Realtime sulla tabella `bookings` |
| `20260515_site_content_public_read.sql` | Rende leggibili a tutti (anche anonimi) i blocchi `site_content`, correggendo una policy troppo restrittiva che causava pagina bianca ai visitatori |
| `20260516_push_subscriptions.sql` | Crea la tabella `push_subscriptions` per le iscrizioni Web Push |
| `20260517_admin_rls_fix.sql` | Corregge la policy RLS admin per garantire lettura/scrittura su tutti i `businesses` indipendentemente da `is_active`/`user_id` |
| `20260518_admin_notes.sql` | Aggiunge `admin_notes` e documenta colonne già presenti in produzione ma non nello schema locale |
| `20260519_ai_rate_limit.sql` | Aggiunge contatori di rate limiting AI (`ai_tokens_month`, `ai_calls_month_display`) a `businesses` |
| `20260519_booking_services.sql` | Aggiunge `service_names` a `bookings` per la visualizzazione multi-servizio e rimuove vecchi overload di `create_booking` |
| `20260519_fix_trigger_notify.sql` | Ricrea il trigger `on_new_booking` rimuovendo l'header Authorization che causava 401 verso `notify-new-booking` |
| `20260520_affiliate_code.sql` | Aggiunge `affiliate_code` a `businesses` per tracciare l'affiliato che ha portato il cliente |
| `20260520_performance_indexes.sql` | Aggiunge indici di performance basati sui pattern di query reali del codice (es. `businesses.user_id`) |
| `20260521_activity_log.sql` | Crea la tabella `activity_log` (log eventi fire-and-forget, scritta da `src/lib/activityLog.js`) |
| `20260522_stripe_columns.sql` | Aggiunge `stripe_subscription_id` e `stripe_customer_id` a `businesses` |
| `20260523_plan_active_value.sql` | Aggiunge il valore `'active'` ai valori ammessi per `plan` (impostato dal webhook Stripe al pagamento confermato) |
| `20260524_add_client_phone.sql` | Aggiunge `client_phone` ad `appointments` |
| `20260525_owner_confirm_booking_phone.sql` | Aggiorna la funzione `owner_confirm_booking` per salvare il telefono cliente nella colonna dedicata invece che concatenato alle note |
| `20260526_appointment_services.sql` | Crea `appointment_services` (relazione N servizi ↔ appuntamento) con snapshot di prezzo/durata al momento della creazione |
| `20260527_create_contacts.sql` | Crea la tabella `contacts` (rubrica clienti) |
| `20260610_affiliate_commissions.sql` | Crea `affiliate_commissions`, registro delle commissioni mensili pagate per cliente referenziato |
| `20260610_booking_capacity.sql` | Aggiunge `booking_capacity` a `businesses` e aggiorna `get_taken_slots` per includere anche i booking pending |
| `20260719_booking_multi_service.sql` | Documenta (già applicata a mano in produzione) la Fase 1 del multi-servizio nel booking pubblico: colonna array servizi retrocompatibile |
| `20260719_businesses_user_id_unique.sql` | Documenta il vincolo `UNIQUE(user_id)` già applicato a mano su `businesses` |
| `20260719_create_booking_advisory_lock.sql` | `create_booking` v4: aggiunge un advisory lock per prevenire race condition sul controllo di capacità |
| `20260719_drop_affiliates_all_policy.sql` | Rimuove la policy RLS che permetteva a un affiliato di auto-approvarsi (`status → 'approved'`), lasciando solo la lettura dei propri dati |
| `20260719_trigger_notify_secret.sql` | Documenta il trigger `on_new_booking` con l'header `X-Webhook-Secret` richiesto da `notify-new-booking` |
| `20260720_businesses_owner_email.sql` | Aggiunge `owner_email` a `businesses` (email di registrazione, distinta dall'email di contatto pubblico) e la popola dai dati esistenti in `auth.users` |
| `20260806_create_booking_hardening.sql` | `create_booking` v6: aggiunge controlli lato DB (rifiuto date passate, validazione formato email/telefono, validazione orari di apertura) mantenendo le difese esistenti |
| `20260806_create_booking_revoke_anon.sql` | Revoca l'accesso pubblico diretto a `create_booking`, obbligando il flusso a passare dalla Edge Function `create-booking` |
| `20260807_drop_create_booking_8params.sql` | Rimuove il vecchio overload a 8 parametri di `create_booking` (residuo pre-multi-servizio, privo dei controlli di hardening) |
| `20260809_smart_time_foundations.sql` | Fase 1 della feature "Smart Time": aggiunge solo le colonne per il tracciamento del tempo reale di lavorazione degli appuntamenti (nessuna UI ancora) |
| `20260816_affiliate_code_on_suffix_validation.sql` | Sostituisce la FK `businesses.affiliate_code → affiliates.code` con un trigger di validazione che accetta anche il suffisso virtuale `-on` |
| `20260819_affiliate_commissions_schema_fix.sql` | Allinea lo schema reale di `affiliate_commissions` a quello atteso dal codice (drop + create pulito, tabella verificata vuota) |
| `20260823_faq_table_and_seed.sql` | Crea la tabella `faq` e ne popola/allinea il contenuto |
| `20260907_business_is_free.sql` | Aggiunge il flag `is_free` a `businesses` per gli account gratuiti legittimi (mai bloccati, mai contati come clienti paganti) |
| `20260908_services_visible_on_public_site.sql` | Aggiunge `visible_on_public_site` a `services`: nasconde un servizio dal sito pubblico mantenendolo selezionabile in agenda |
| `20260920_business_vertical.sql` | Aggiunge `businesses.vertical` (text, `DEFAULT 'generico'`, nullable, nessun CHECK) — fondamento del meccanismo verticali, vedi sezione dedicata a inizio documento |
| `20260920_grooming_universal_fields.sql` | Task 3 toelettatura: `services.color` (nullable), `contacts.display_name` (nullable), **crea la tabella `pets`** (id, business_id, client_phone, name, breed, coat, gender, weight_note) con RLS owner-all — stesso pattern di `contacts`/`appointment_services` |
| `20260921_pets_size_and_appointment_link.sql` | Estende Task 3: `appointments.pet_id` (FK → `pets`, nullable, ON DELETE SET NULL), `pets.size` (CHECK `xs`\|`s`\|`m`\|`l`\|`xl`, nullable), indice GIN trigram `idx_pets_name_trgm` su `pets.name` (ricerca fuzzy, stesso pattern di `contacts.name`/`appointments.client_name`) |

**Verticale `'ristorante_bar'`** (vedi sezione "Verticali" a inizio documento per la cronologia completa delle correzioni):

| File | Cosa fa |
|---|---|
| `20260921_ristorante_tables.sql` | Crea `tables` (piantina tavoli), RLS owner-only. Nessuna colonna di stato di proposito (Task 4 "versione minima") |
| `20260921_ristorante_tables_status.sql` | **Superata**: aggiunge `tables.status` (libero/occupato persistito). Rimossa da `20260922_table_reservations_turns.sql` — lo stato non è mai un valore salvato a parte, vedi Cronologia |
| `20260922_appointments_table_id.sql` | **Superata, mai realmente usata**: aggiunge `appointments.table_id` ("Blocco A" — riuso del modello orario+durata di appointments per le prenotazioni ristorante). Scartata quasi subito da `20260922_table_reservations.sql` perché quel modello non si adatta a una prenotazione con turno invece di un orario preciso. Colonna lasciata nello schema inutilizzata, nessun rollback |
| `20260922_table_reservations.sql` | Crea `table_reservations` (prenotazioni per data, con `turn` ancora testo libero in questa fase) e `table_reservation_tables` (ponte N↔N tavolo↔prenotazione, PK composita), RLS owner-only |
| `20260922_table_reservations_turns.sql` | **Rifacimento del sistema turni/stato** (la correzione più importante, vedi Cronologia): crea `business_turns`; sostituisce `table_reservations.turn` (testo) con `turn_id` (FK obbligatoria verso business_turns); **droppa `tables.status`** — lo stato libero/occupato diventa sempre calcolato al volo per combinazione (tavolo, data, turno). `TRUNCATE` dei dati di test preesistenti in `table_reservations`/`table_reservation_tables` (dati di prova, non reali, autorizzati a essere ripuliti) |
| `20260922_menu_catalog.sql` | Blocco B — crea `menu_categories`, `menu_items`, `menu_item_flags` (catalogo menu manuale, nessuna lettura foto/AI in questa migration), RLS owner-only |
| `20260923_table_orders.sql` | Blocco C — crea `table_orders` (un ordine aperto = tavolo fisicamente occupato) e `table_order_items`, indice trigram su `menu_items.name`. Contiene un vincolo unico ormai **superato** (vedi riga successiva) e un commento di testa corretto a posteriori (`0da027b`, solo commento, nessuna modifica allo SQL già applicato) — vedi Cronologia punti 7-8 |
| `20260923_table_orders_auto_close.sql` | Chiusura automatica ordini dimenticati + **sostituisce** il vincolo unico di `20260923_table_orders.sql` (da `table_id` solo a `(table_id, order_date, turn_id)`) — vedi Cronologia punto 8. Aggiunge `table_orders.auto_closed` |
| `20260924_kitchen_courses_stations.sql` | Blocco D — crea `business_courses`, `kitchen_stations` (quest'ultima con un bug, vedi riga successiva); estende `menu_categories` (`course_id`, `station_id`), `table_order_items` (`sent_at`, `kitchen_status`, `ready_at`, `delivered_at`, `fire_status`, `fired_at`), `businesses` (`kitchen_fire_immediately`); abilita Realtime su `table_order_items` |
| `20260924_kitchen_stations_created_at.sql` | Fix: `kitchen_stations` era stata creata senza `created_at` nonostante `kitchenSeed.js`/`kitchenRouting.js` la ordinino per quella colonna (query falliva con 42703, il seeding della postazione "Cucina" non scriveva mai — bug scoperto in test dal vivo, vedi Cronologia chiusura Blocco D) |
| `20260927_stock_and_costs.sql` | Blocco E — campi prodotto su `menu_items` (`track_stock`, `min_stock`, `estimated_cost`, `vat_rate`); crea `stock_closures` e `stock_movements`; snapshot di costo/IVA + `sent_received_at` su `table_order_items`; trigger `set_sent_received_at` e `check_stock_closure_boundary`; funzioni `stock_closure_proposal` e `stock_closure_confirm` |
| `20261018_kiosk_pin.sql` | Blocco F — `businesses.kiosk_pin` (text, nullable) + CHECK sul formato a 4 cifre: codice facoltativo per sbloccare il blocco postazione. **Non è una protezione di sicurezza** (vedi la colonna in Fase 2) |
| `20261024_hall_notifications.sql` | Blocco G — crea `hall_notifications` (notifiche evento, RLS owner-only via `business_id` diretto, Realtime abilitato, `created_at` scritto solo dal database); estende `kitchen_stations` (`alert_level`, `notification_label`, `served_by_hall`). Le notifiche di STATO ("portata pronta") non hanno **nessuna** struttura qui: sono una lettura degli ordini, vedi Blocco G in "Verticali" |
| `20260928_stock_reports.sql` | Blocco E — funzione `stock_report` (incasso/costo/margine per giorno, mese o chiusura), con il fuso orario come **parametro** e non cablato |

**Nota ricorrente**: diverse migration (`20260719_*`, `20260720_*`, alcune di agosto) sono etichettate come "già applicate manualmente in produzione via SQL Editor" — servono a documentare lo stato reale del DB per chi crea un ambiente nuovo, non riflettono l'ordine cronologico di applicazione originale in produzione.

---

*Fine Fase 1.*

---

## FASE 2 — Database

### 0. Metodologia e affidabilità delle fonti

Questa sezione incrocia tre fonti, lette per intero:

1. **`supabase/schema.sql`** — schema "storico" di riferimento (parzialmente aggiornato a mano nel tempo, non un dump reale).
2. **Tutti i file in `supabase/migrations/`** (43 al 21/09/2026, includendo le 3 aggiunte dai commit toelettatura/vertical — vedi sezione "Verticali" a inizio documento) — letti integralmente, non solo l'intestazione, per ricostruire l'unione di tutte le `ALTER TABLE`/`CREATE TABLE`/`CREATE OR REPLACE FUNCTION` mai applicate.
3. **`DOCS/MAPPA_DATABASE.md`** — un audit precedente (16/08/2026) basato su **query dirette eseguite in produzione** (non su migration), che ha fotografato lo stato reale del DB a quella data: 19 tabelle, colonne esatte con tipo/default/nullable, RLS reali, trigger reali. Fonte preziosa perché il codice usa da tempo tabelle e colonne mai comparse in nessuna migration ("fantasma").

Ho poi **verificato incrociando il codice sorgente attuale** (tutte le chiamate `.from('...')` e `.rpc('...')` in `src/` e `supabase/functions/`) per confermare quali tabelle sono ancora realmente lette/scritte oggi, e ho riletto per intero le migration aggiunte dopo il 16/08 (`20260819`, `20260823`, `20260907`, `20260908`) per capire cosa è cambiato da allora.

**Cosa è garantito al 100% in questo documento**: le tabelle/colonne/funzioni create da `schema.sql` o da una migration — è DDL, fa fede.
**Cosa è ereditato dall'audit di produzione del 16/08 (non ri-verificato con una query live in questa passata, per rispettare il mandato "sola lettura")**: struttura delle tabelle fantasma (`affiliates`, `legal_acceptances`, `admin_messages`, `admin_message_reads`) e delle colonne fantasma (`businesses.opening_hours`, `businesses.template`, colonne `hero_*`/`about_text`/`cover_image_url` di `site_content`, `reviews.published`). Il nome e l'uso di queste colonne sono comunque **confermati indipendentemente** in questa passata leggendo il codice che le usa (riportato per ciascuna).
**Cosa è cambiato rispetto all'audit del 16/08** (verificato leggendo le migration più recenti): `affiliate_commissions` è stata ricreata con la struttura corretta (`20260819`), `faq` è stata finalmente tracciata in una migration (`20260823`), sono comparse nuove colonne (`businesses.is_free` in `20260907`, `services.visible_on_public_site` in `20260908`, `businesses.vertical` in `20260920`, `services.color`/`contacts.display_name`/`appointments.pet_id`/`pets.size` in `20260920`-`20260921`) ed è comparsa una nuova tabella tracciata fin dalla nascita, non fantasma: **`pets`** (`20260920_grooming_universal_fields.sql`).

---

### 1. Tabelle fantasma — sintesi (esistono in produzione, MAI create da una migration)

| Tabella | Rischio | Nota |
|---|---|---|
| `affiliates` | 🟡 Medio | Anagrafica affiliati — cuore del programma referral. Nessun ambiente nuovo può essere bootstrappato senza ricrearla a mano. |
| `legal_acceptances` | 🟡 Medio | Traccia le accettazioni di termini/privacy — dati con valore probatorio/legale, ancora più critico non averli version-controllati. |
| `admin_messages` | 🟢 Basso | Messaggi admin→merchant. Funzionale ma non riproducibile su ambiente pulito. |
| `admin_message_reads` | 🟢 Basso | Stato di lettura dei messaggi admin. Idem. |

`faq` **non è più fantasma**: tracciata da `20260823_faq_table_and_seed.sql`. Restano invece **colonne fantasma** (colonne usate dal codice ma mai aggiunte da una migration, su tabelle altrimenti tracciate): `businesses.opening_hours`, `businesses.template`, `site_content.hero_title`/`hero_subtitle`/`hero_cta_text`/`about_text`/`cover_image_url`, `reviews.published` — dettagliate nelle rispettive tabelle sotto, con 🔴 esplicito.

---

### 2. Tabelle

Per ciascuna tabella: colonne (tipo, default, nullable, note), indici, FK, RLS. Le tabelle segnate **[FANTASMA]** non sono in nessuna migration; struttura da `DOCS/MAPPA_DATABASE.md` (audit di produzione 16/08), nomi colonna confermati dal codice attuale.

#### `activity_log`
Log eventi fire-and-forget per azioni in-app (servizio aggiunto, recensione risposta, bozza approvata...). Scritta da `src/lib/activityLog.js` (insert non bloccante, errori solo loggati in console).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| user_id | uuid | — | NO | FK → `auth.users(id)` ON DELETE CASCADE |
| type | text | — | NO | es. `service_added`, `review_replied` |
| description | text | — | **dipende** | vedi nota sotto |
| created_at | timestamptz | `now()` | NO | |

⚠️ **Doppia definizione nel repo, produzione allineata a quella NON tracciata come migration**: esiste sia `supabase/activity_log.sql` (file sciolto fuori da `migrations/`, `description NOT NULL`, policy `select_own`/`insert_own`, indice `activity_log_business_created`) sia `supabase/migrations/20260521_activity_log.sql` (`description` nullable, 3 policy incluso `activity_log: admin read all`, indice `idx_activity_log_business_id`). Per query dirette (16/08), **la produzione corrisponde al file sciolto**, non alla migration: `description NOT NULL`, solo 2 policy, manca la policy admin. Se il pannello admin dovesse leggere l'activity log di un business qualunque, oggi non può.

- **Indici**: PK; `activity_log_business_created` (business_id, created_at desc).
- **RLS**: abilitata. `select_own` (SELECT, `auth.uid()=user_id`), `insert_own` (INSERT, check `auth.uid()=user_id`).

#### `admin_message_reads` [FANTASMA]
Traccia quali business hanno letto quale messaggio admin. Usata da `src/pages/Dashboard.jsx:95,114`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| message_id | uuid | — | NO | FK → `admin_messages(id)` ON DELETE CASCADE |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| read_at | timestamptz | `now()` | NO | |

- **Vincoli**: UNIQUE(message_id, business_id).
- **Indici**: PK, unique(message_id, business_id), `idx_admin_message_reads` (business_id, message_id).
- **RLS**: `admin_message_reads: admin read` (SELECT, ruolo admin), `admin_message_reads: owner all` (ALL, tramite proprietà del business).

#### `admin_messages` [FANTASMA]
Messaggi dell'admin verso i merchant: broadcast (`business_id IS NULL`) o mirati. Letta/scritta da `src/pages/Admin.jsx:223,242` (invio) e `src/pages/Dashboard.jsx:93-94` (lettura non letti).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | **YES** | NULL = broadcast a tutti |
| message | text | — | NO | |
| link_url | text | — | YES | |
| link_label | text | — | YES | |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK; `idx_admin_messages_broadcast` (created_at desc) WHERE business_id IS NULL; `idx_admin_messages_business` (business_id, created_at desc).
- **RLS**: `admin_messages: admin write` (ALL, ruolo admin), `admin_messages: owner read` (SELECT, proprio business OR broadcast).

#### `affiliate_commissions`
Registro di una riga per ogni mensilità commissionata a un affiliato, scritta esclusivamente dal webhook Stripe (`stripe-webhook/index.ts`) su `invoice.paid`, con service role (bypassa RLS — nessuna policy INSERT). **Ricreata da zero il 19/08** (`20260819_affiliate_commissions_schema_fix.sql`) perché la tabella reale in produzione (creata a mano) non corrispondeva alla migration originale (`20260610`): mancavano `stripe_invoice_id`/`month_number`/`paid_at`, quindi ogni insert del webhook falliva silenziosamente con `42703 undefined_column` (errore loggato ma la funzione rispondeva comunque 200 a Stripe) — **nessuna commissione veniva registrata**. La struttura sotto è quella attuale, corretta.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| affiliate_id | uuid | — | NO | FK → `affiliates(id)` ON DELETE CASCADE |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| stripe_invoice_id | text | — | NO | UNIQUE |
| amount | numeric(10,2) | — | NO | nessun default (era 25.00 nella versione errata) |
| month_number | int | — | NO | CHECK `>= 1`, **senza tetto** — volutamente diverso dalla vecchia migration (CHECK 1-12): dal 13° mese la commissione continua a tariffa ridotta a vita, un CHECK 1-12 avrebbe fatto fallire l'insert dal 13° mese in poi |
| status | text | `'pending'` | NO | CHECK: `pending`\|`paid`\|`cancelled` |
| paid_at | timestamptz | — | YES | |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK, `idx_aff_comm_affiliate` (affiliate_id, status), `idx_aff_comm_business` (business_id).
- **RLS**: `aff_comm: affiliate read own` (SELECT, `affiliate_id in (select id from affiliates where user_id = auth.uid())`), `aff_comm: admin read all` (SELECT, ruolo admin), `aff_comm: admin update all` (UPDATE, ruolo admin). Nessuna policy INSERT/DELETE: solo il service role scrive.

#### `affiliates` [FANTASMA]
Anagrafica del programma di affiliazione a due canali (link diretto/prezzo pieno, link scontato con suffisso `-on`). Usata da `AffiliatesAuth.jsx` (insert alla registrazione), `Affiliates.jsx` (dashboard affiliato), `Admin.jsx` (gestione admin), Edge Function `approve-affiliate` (cambio stato), trigger `validate_affiliate_code` (lettura).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| user_id | uuid | — | YES | FK → `auth.users(id)` ON DELETE CASCADE |
| code | text | — | NO | UNIQUE — codice referral base (senza `-on`) |
| parent_id | uuid | — | YES | FK self → `affiliates(id)` ON DELETE SET NULL; nessun uso trovato nel frontend |
| status | text | `'pending'` | YES | CHECK: `pending`\|`approved`\|`rejected` |
| total_clients | integer | `0` | YES | obsoleto, mai aggiornato — il frontend calcola le stats live da `affiliate_commissions` |
| total_earned | numeric | `0` | YES | idem |
| total_pending | numeric | `0` | YES | idem |
| created_at | timestamptz | `now()` | YES | |
| email | text | — | YES | |
| name | text | — | YES | |
| approved_email_sent_at | timestamptz | — | YES | letta/scritta da `approve-affiliate` per evitare doppie email di approvazione |
| admin_notes | text | — | YES | |
| city | text | — | YES | |
| province | text | — | YES | |
| phone | text | — | YES | |
| legal_name | text | — | YES | |

- **Indici**: PK, `affiliates_code_key` (unique su `code`).
- **RLS**: `Chiunque può fare richiesta affiliato` (INSERT, check `status='pending'`), `affiliates: admin read all` (SELECT, ruolo admin), `affiliates: admin update` (UPDATE, ruolo admin), `affiliates: select own` (SELECT, `auth.uid() = user_id`).
- ⚠️ **Nessuna policy UPDATE per l'utente stesso**: la migration `20260719_drop_affiliates_all_policy.sql` ha rimosso una policy `ALL` legacy (`"Affiliato vede solo i suoi dati"`, mai vista in nessuna migration precedente — prova che la tabella esisteva "a mano" ben prima della cartella `migrations/`) che permetteva a un affiliato di aggiornare la propria riga, incluso `status → 'approved'`, bypassando `approve-affiliate`. Da allora il cambio di stato passa **solo** dalla Edge Function (service role).
- ⚠️ Una FK `businesses_affiliate_code_fkey` (`businesses.affiliate_code → affiliates.code`) esisteva in produzione (aggiunta a mano, mai in una migration) ma è stata rimossa da `20260816_affiliate_code_on_suffix_validation.sql` e sostituita da un trigger — vedi sezione RPC.

#### `appointment_services`
Righe di dettaglio servizi per appuntamento multi-servizio, con snapshot di prezzo/durata al momento della conferma (le modifiche future al listino non alterano lo storico). Creata da `20260526_appointment_services.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| appointment_id | uuid | — | NO | FK → `appointments(id)` ON DELETE CASCADE |
| service_id | uuid | — | YES | FK → `services(id)` ON DELETE SET NULL |
| price_snapshot | numeric(10,2) | — | YES | |
| duration_snapshot | int | — | YES | |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK, `idx_aptsvc_appointment_id`, `idx_aptsvc_service_id`.
- **RLS**: `aptsvc: owner all` (ALL, via join `appointment_id → appointments → businesses.user_id = auth.uid()`).
- Popolata da `owner_confirm_booking()` (multi-servizio) e da `Agenda.jsx` alla creazione manuale di un appuntamento multi-servizio.

#### `appointments`
Agenda: appuntamenti effettivi del commerciante (creati manualmente o generati da `owner_confirm_booking()` a partire da una `bookings`). Include i campi "Smart Time" (`20260809`, solo schema, nessuna UI ancora collegata).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()`/`gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| employee_id | uuid | — | YES | FK → `employees(id)` ON DELETE SET NULL |
| client_name | text | — | NO | |
| date | date | — | NO | |
| start_time | time | `'09:00'` | NO | |
| duration_minutes | int | `60` (schema.sql) / `30` (verificato in prod) | NO | |
| price | numeric(10,2) | — | YES | |
| notes | text | — | YES | |
| completed | boolean | `false` | NO | |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_appointments_updated_at` |
| booking_id | uuid | — | YES | FK → `bookings(id)` ON DELETE SET NULL — `20260513_booking_whatsapp.sql` |
| client_phone | text | — | YES | `20260524_add_client_phone.sql` |
| actual_start_at | timestamptz | — | YES | Smart Time: tap "inizio lavorazione" — `20260809` |
| actual_end_at | timestamptz | — | YES | Smart Time: tap "fine lavorazione" — `20260809` |
| manual_minutes | int | — | YES | Smart Time: durata inserita a mano — `20260809` |
| time_status | text | `'none'` | NO | Smart Time: CHECK `none`\|`temp`\|`confirmed`\|`excluded` — `20260809` |
| pet_id | uuid | — | YES | FK → `pets(id)` ON DELETE SET NULL — quale animale è questo appuntamento; sempre NULL per business non-toelettatura o per pet non ancora censiti — `20260921_pets_size_and_appointment_link.sql` |
| table_id | uuid | — | YES | 🟡 **INUTILIZZATA** — FK → `tables(id)` ON DELETE SET NULL, aggiunta per il "Blocco A" (collegare un appuntamento a un tavolo riusando il modello orario+durata di `appointments`), scartata quasi subito perché una prenotazione ristorante è data+turno, non un orario con durata calcolabile — vedi Cronologia in "Verticali" a inizio documento. Colonna lasciata nello schema di proposito (nessun rollback), ma **nessun punto del codice applicativo la legge o la scrive più** — `20260922_appointments_table_id.sql` |

- **Indici**: PK, `idx_appointments_business_id`, `idx_appointments_date`/`idx_appointments_business_date` (business_id, date[, start_time] — duplicati funzionali, uno da `schema.sql` uno da `20260520_performance_indexes.sql`), `idx_appointments_business_completed` (business_id, completed, updated_at desc), `idx_appointments_booking_id`, `idx_appointments_client_name_trgm` (GIN trigram su `client_name`, ricerca fuzzy), `idx_appointments_pet_id`, `idx_appointments_table_id` (verticale 'ristorante_bar').
- **RLS**: `appointments: owner access` (ALL, via `businesses.user_id = auth.uid()`); in produzione coesiste con una policy legacy equivalente `"Appointments visibili solo al proprietario"` (mai in una migration, stessa condizione, solo ridondante).

#### `bookings`
Prenotazioni self-service dal mini-sito pubblico, stato `pending` finché il titolare non le conferma (`owner_confirm_booking`), trasformandole in una riga `appointments`. Realtime abilitato (`20260514_realtime_bookings.sql`) per notificare la dashboard in diretta.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| service_id | uuid | — | YES | FK → `services(id)` ON DELETE SET NULL |
| customer_name | text | — | NO | |
| customer_email | text | — | NO | salvata sempre in lowercase (normalizzata da `create_booking`) |
| customer_phone | text | — | YES | |
| appointment_date | date | — | NO | |
| appointment_time | time | — | NO | |
| status | text | `'confirmed'` (schema.sql) / di fatto sempre `'pending'` all'insert da `create_booking` | NO | CHECK: `pending`\|`confirmed`\|`cancelled` |
| created_at | timestamptz | `now()` | NO | |
| service_names | text | — | YES | snapshot testuale nomi servizi — `20260519_booking_services.sql` |
| service_ids | uuid[] | — | YES | multi-servizio — `20260719_booking_multi_service.sql` |

- **Indici**: PK, `idx_bookings_business_id`, `idx_bookings_business_status` (business_id, status), `idx_bookings_email` (su `lower(customer_email)`).
- **RLS**: `bookings: owner read` (SELECT), `bookings: owner update` (UPDATE) — entrambe via `businesses.user_id = auth.uid()`. **Nessuna policy INSERT**: by design, l'unico modo di creare una riga è la funzione `create_booking()` (SECURITY DEFINER); l'accesso diretto di `anon`/`authenticated` alla funzione stessa è stato revocato (`20260806_create_booking_revoke_anon.sql`) — solo il `service_role` (usato dalla Edge Function `create-booking`) può eseguirla.
- **Trigger**: `on_new_booking` (AFTER INSERT) → chiama `supabase_functions.http_request(...)` verso l'Edge Function `notify-new-booking`, con header `X-Webhook-Secret` in chiaro nella definizione del trigger (leggibile da chi ha accesso a `pg_trigger`, tipicamente solo ruoli con privilegi elevati).

#### `business_courses` — verticale `'ristorante_bar'`
Portate configurabili per business (es. "Antipasti"/"Primi"/"Secondi"/"Dolci") — verticale `'ristorante_bar'`, Blocco D. Stesso identico modello di `business_turns` (`slot_number` come ancoraggio stabile, `name` rinominabile, `is_active`), stessa ragione: locali diversi vogliono portate diverse, nessun set universale. **Differenza dal seeding di `business_turns`**: qui il seeding NON scatta all'attivazione del vertical, ma alla prima apertura di `Menu.jsx` **o** `Cucina.jsx` (qualunque delle due arrivi prima) — vedi `src/lib/kitchenSeed.js`, condiviso tra i due componenti. Creata da `20260924_kitchen_courses_stations.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| slot_number | int | — | NO | posizione della portata, usata per l'ordinamento (fasce in `Cucina.jsx`, colore automatico — vedi `menu_categories`) e come seme del nome segnaposto |
| name | text | — | YES | se NULL, mostrato come "Portata {slot_number}" |
| is_active | boolean | `true` | NO | mai un DELETE reale |

- **Vincoli**: UNIQUE(business_id, slot_number) — `idx_business_courses_business_slot`, permette al seeding di usare `upsert(..., { onConflict: 'business_id,slot_number', ignoreDuplicates: true })` senza doppioni se due dispositivi aprono Menu.jsx/Cucina.jsx nello stesso momento.
- **Indici**: PK, `idx_business_courses_business_id`, unique(business_id, slot_number).
- **RLS**: `business_courses: owner all` (ALL, via `businesses.user_id = auth.uid()`).
- **Una categoria senza portata (`menu_categories.course_id` NULL) è "subito" sempre**, non un dato mancante — per questo non esiste una portata fittizia "Subito" da gestire come le altre. Stesso trattamento per una voce d'ordine la cui portata non è risolvibile per nessuno dei 3 motivi di ripiego — vedi `menu_categories`/`table_order_items` e `src/lib/kitchenRouting.js`.

#### `business_turns` — verticale `'ristorante_bar'`
Slot di turno configurabili per business (es. "Pranzo"/"Cena"/"Aperitivo") — verticale `'ristorante_bar'`. Testo libero scelto dal titolare, nessun enum di sistema: locali diversi usano turni diversi, non esiste un set universale valido per tutti (a differenza del seeding automatico iniziale, vedi sotto). Creata da `20260922_table_reservations_turns.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| slot_number | int | — | NO | posizione del turno, usata per l'ordinamento e come seme del nome segnaposto |
| name | text | — | YES | se NULL, mostrato come "Turno {slot_number}" lato UI (`Tavoli.jsx`, funzione `turnLabel()`) — il codice normalizza una stringa vuota digitata a `NULL`, mai salvata com'è |
| is_active | boolean | `true` | NO | mai un DELETE reale — un turno disattivato sparisce dallo switch e dal selettore di una nuova prenotazione, ma le prenotazioni storiche che lo referenziano (FK da `table_reservations.turn_id`) restano intatte e ne mostrano ancora il nome |

- **Vincoli**: UNIQUE(business_id, slot_number) — `idx_business_turns_business_slot`, impedisce al seeding (o a un bug futuro) di creare due volte lo stesso slot.
- **Indici**: PK, `idx_business_turns_business_id`, unique(business_id, slot_number).
- **RLS**: `business_turns: owner all` (ALL, via `businesses.user_id = auth.uid()`).
- **Seeding automatico**: quando `Admin.jsx` (funzione `setVertical`) imposta `businesses.vertical = 'ristorante_bar'`, se il business non ha ancora nessun turno vengono create 4 righe (`slot_number` 1-4, `name` NULL) — best-effort, un fallimento non blocca il salvataggio del vertical. Il controllo è "il business non ha ancora nessun turno" (non solo "il valore è appena cambiato"), per coprire il caso di un business che esce e rientra più volte dal verticale senza duplicare i turni.

#### `businesses`
Tabella centrale: un'attività per utente proprietario (UNIQUE su `user_id` — `20260719_businesses_user_id_unique.sql`). ~42 colonne: anagrafica, piano/stato abbonamento, dati Stripe, rate limit AI, referral, orari, smart-time.

| Colonna | Tipo | Default | Null | Note / migration di origine |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| user_id | uuid | — | NO | FK → `auth.users(id)` CASCADE; UNIQUE (`20260719_businesses_user_id_unique.sql`) |
| name | text | — | NO | |
| slug | text | — | YES | UNIQUE — URL pubblico |
| category | text | — | YES | |
| description | text | — | YES | |
| address | text | — | YES | |
| city | text | — | YES | |
| phone | text | — | YES | |
| whatsapp | text | — | YES | `20260422_add_whatsapp_to_businesses.sql` |
| email | text | — | YES | contatto pubblico mostrato sul sito |
| website | text | — | YES | |
| logo_url | text | — | YES | |
| cover_url | text | — | YES | |
| profile_image | text | — | YES | `20260507_profile_social_custom_category.sql` |
| instagram_url | text | — | YES | `20260507_...` |
| facebook_url | text | — | YES | `20260507_...` |
| business_type_custom | text | — | YES | `20260507_...` — categoria libera |
| is_active | boolean | `true` | NO | |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_businesses_updated_at` |
| plan | text | `'trial'` | YES | CHECK: `trial`\|`free`\|`starter`\|`pro`\|`active` (`'active'` aggiunto da `20260523_plan_active_value.sql`) — `20260423_admin_panel.sql` |
| admin_notes | text | — | YES | `20260518_admin_notes.sql` |
| status | text | `'trial'` | NO | CHECK: `trial`\|`active`\|`expired`\|`suspended` — `20260518_...` |
| plan_price | numeric | `99` | YES | `20260518_...` |
| trial_ends_at | timestamptz | — | YES | `20260518_...` |
| ai_calls_month | int | `0` | NO | deprecato, sostituito da `ai_calls_month_display` — `20260518_...` |
| ai_calls_total | int | `0` | NO | `20260518_...` |
| ai_tokens_month | int | `0` | NO | `20260519_ai_rate_limit.sql` |
| ai_calls_month_display | int | `0` | NO | `20260519_...` |
| ai_unlimited | boolean | `false` | NO | `20260519_...` |
| ai_reset_date | date | — | YES | `20260519_...` |
| affiliate_code | text | — | YES | codice referral (con eventuale suffisso `-on`); validato dal trigger `validate_affiliate_code` — `20260520_affiliate_code.sql` |
| stripe_subscription_id | text | — | YES | `20260522_stripe_columns.sql` |
| stripe_customer_id | text | — | YES | `20260522_...` |
| booking_capacity | int | `1` | NO | CHECK 1–50 — quanti clienti in parallelo — `20260610_booking_capacity.sql` |
| owner_email | text | — | YES | email di registrazione (da `auth.users`), distinta da `email` — `20260720_businesses_owner_email.sql` |
| smart_time_enabled | boolean | `false` | NO | `20260809_smart_time_foundations.sql` |
| is_free | boolean | `false` | NO | account omaggio legittimo: mai bloccato da `isBusinessBlocked`, mai contato come pagante (`getBusinessRealStatus` → `'gift'`) — `20260907_business_is_free.sql` |
| vertical | text | `'generico'` | YES | tipo di attività per attivare funzionalità dedicate (es. `'toelettatura'`); nessun CHECK sui valori ammessi, impostata solo da `Admin.jsx` — vedi sezione "Verticali" a inizio documento — `20260920_business_vertical.sql` |
| kiosk_pin | text | — | YES | 🟡 Verticale `'ristorante_bar'`, Blocco F: codice di 4 cifre, facoltativo, chiesto quando si sblocca il blocco postazione. CHECK: NULL oppure `^[0-9]{4}$` — il formato è un'invariante (un codice di 3 o 5 cifre sarebbe impossibile da inserire dal tastierino a 4 caselle). **NON è una protezione di sicurezza**: è in chiaro, viaggia nella stessa sessione del titolare con cui il tablet è loggato e chiunque apra gli strumenti per sviluppatori può leggerlo; serve solo a evitare uscite involontarie dall'area di lavoro durante il servizio. Per una protezione vera servirebbero account separati per il personale, che non esistono (vedi `AUDIT_KIOSK.md`). Si imposta da `Menu.jsx` → "Blocco schermo" — `20261018_kiosk_pin.sql` |
| kitchen_fire_immediately | boolean | `false` | NO | 🟡 Verticale `'ristorante_bar'`, Blocco D: se attivo, l'invio in cucina da `Ordine.jsx` non chiede mai la scelta subito/in attesa tra portate, tutto parte subito. Sta su `businesses` (come `vertical` stesso) perché è una preferenza di business, non di singolo ordine; toggle in `Menu.jsx` → gestione Portate — `20260924_kitchen_courses_stations.sql` |
| opening_hours | jsonb | (orari 9-18 standard, gestito lato applicazione) | YES | 🔴 **FANTASMA** — mai in una migration/schema.sql, ma letta/scritta da `Orari.jsx:36,62`, da `create_booking()` (validazione orari) e da `BookingSection.jsx`/`PublicSite.jsx`/`Agenda.jsx`. Struttura: oggetto con chiave per giorno (`monday`...`sunday`), ciascuno `{closed, morning:{open,close,active}, afternoon:{open,close,active}}` (formato nuovo) o `{open,close}` (formato legacy, gestito come fallback da `create_booking`) |
| template | text | `'standard'` | NO | 🔴 **FANTASMA** — mai in una migration/schema.sql; **nessun uso trovato nel codice frontend attuale** in questa passata — verificare se è un residuo morto o una feature non ancora collegata |

- **Vincoli**: CHECK `booking_capacity` (1-50), CHECK `plan`, CHECK `status`; FK `user_id`; UNIQUE `slug`; UNIQUE `user_id`.
- **FK rimossa**: `businesses_affiliate_code_fkey` (verso `affiliates.code`) — era stata aggiunta a mano in produzione, mai in una migration; rimossa da `20260816_affiliate_code_on_suffix_validation.sql` e sostituita da un trigger (vedi RPC).
- **Trigger**: `trg_businesses_updated_at` (BEFORE UPDATE → `set_updated_at()`), `trg_businesses_validate_affiliate_code` (BEFORE INSERT OR UPDATE OF affiliate_code → `validate_affiliate_code()`, `20260816`).
- **Indici**: PK, `businesses_slug_key`/`idx_businesses_slug` (duplicati funzionali), `businesses_user_id_unique`/`idx_businesses_user_id` (duplicati funzionali), `idx_businesses_affiliate_code` (parziale, WHERE NOT NULL).
- **RLS**: `businesses: owner access` (ALL, `auth.uid() = user_id`), `businesses: public read` (SELECT, `is_active = true` — mini-sito pubblico), `businesses: admin read all` (SELECT, ruolo admin — `20260423`/rifatta idempotente in `20260517_admin_rls_fix.sql`), `businesses: admin update all` (UPDATE, ruolo admin — idem). In produzione coesistono policy legacy equivalenti (`"Users can insert/update/view own business"`, mai in una migration) con la stessa condizione — ridondanti, non contraddittorie.

#### `contacts`
Rubrica clienti indipendente dagli appuntamenti (CRM leggero), con import vCard. Creata da `20260527_create_contacts.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | — | NO | |
| phone | text | — | YES | normalizzato IT da `src/lib/phone.js` prima dell'insert |
| email | text | — | YES | |
| notes | text | — | YES | |
| source | text | `'manual'` | NO | es. `manual`, import vCard |
| created_at | timestamptz | `now()` | NO | |
| display_name | text | — | YES | nome alternativo per le comunicazioni verso il cliente; se impostato, sostituisce il nome reale **solo** nei messaggi WhatsApp (`PromemoriaClienti.jsx`, promemoria giorno-prima in `Agenda.jsx`) — mai nelle viste interne (agenda, lista clienti), dove il titolare vede sempre il nome vero — `20260920_grooming_universal_fields.sql` |

- **Indici**: PK, `idx_contacts_business_id`, `idx_contacts_business_phone` (business_id, phone), `idx_contacts_name_trgm` (GIN trigram su `name`, ricerca fuzzy — `20260520_performance_indexes.sql`).
- **RLS**: `contacts: owner all` (ALL, via `businesses.user_id = auth.uid()`).

#### `employees`
Dipendenti/collaboratori assegnabili agli appuntamenti (colore etichetta in agenda).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()`/`gen_random_uuid()` | NO | PK |
| business_id | uuid | — | YES/NO | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | — | NO | |
| color | text | `'#94a3b8'` (schema.sql) / `'#6366f1'` (verificato in prod) | NO | |
| created_at | timestamptz | `now()` | YES | |

- **Indici**: PK, `idx_employees_business_id` (duplicato `idx_employees_business`, stesse colonne).
- **RLS**: `employees: owner access` (ALL, via `businesses.user_id = auth.uid()`); coesiste con policy legacy equivalente `"Employees visibili solo al proprietario"` (mai in una migration).

#### `faq`
FAQ del supporto self-service (`SupportBot.jsx`). **Tracciata per la prima volta** da `20260823_faq_table_and_seed.sql` (prima era fantasma, creata a mano); la migration crea la tabella (`IF NOT EXISTS`) e fa upsert di 27 righe con ID espliciti (stessi UUID già in produzione, upsert idempotente `on conflict (id)`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| categoria | text | — | NO | es. `Account`, `Affiliati`, `Agenda`, `Recensioni`, `Sito`, `Social` |
| domanda | text | — | NO | |
| risposta | text | — | NO | |
| link | text | — | YES | route interna opzionale (es. `/dashboard?s=agenda`) |
| ordine | int | `0` | YES | ordinamento all'interno della categoria |
| created_at | timestamp *(senza timezone — unica tabella così)* | `now()` | YES | |

- **RLS**: `Lettura pubblica FAQ` (SELECT, `using (true)` — corretto per contenuto pubblico, ricreata idempotente dalla migration con `DROP POLICY IF EXISTS` prima).

#### `kitchen_stations` — verticale `'ristorante_bar'`
Postazioni di preparazione (es. "Cucina"/"Bar"/"Pizzeria") — verticale `'ristorante_bar'`, Blocco D. Ogni categoria del menu è assegnata a una postazione (`menu_categories.station_id`); la vista `Cucina.jsx` mostra solo le voci della postazione scelta dal dispositivo. Seeding di una postazione "Cucina" alla prima apertura di `Menu.jsx` **o** `Cucina.jsx` (qualunque arrivi prima), stesso meccanismo condiviso di `business_courses` (`src/lib/kitchenSeed.js`). Creata da `20260924_kitchen_courses_stations.sql`, **con un bug**: mancava `created_at` nonostante il codice la usi per ordinare — corretto da `20260924_kitchen_stations_created_at.sql` (vedi Cronologia in "Verticali").

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | — | NO | es. "Cucina" |
| is_active | boolean | `true` | NO | mai un DELETE reale |
| created_at | timestamptz | `now()` | NO | aggiunta da `20260924_kitchen_stations_created_at.sql`, non presente nella migration originale — vedi Cronologia |
| alert_level | text | `'forte'` | NO | Blocco G. CHECK `('forte','leggero','nessuno')`. Quanto rumore fa l'avviso di una portata pronta di questa postazione: `forte` banner+suono+vibrazione, `leggero` solo elenco Notifiche sala + segno sulla card del tavolo, `nessuno` solo elenco. **Non cambia MAI quali notifiche esistono**, solo quanto si fanno sentire |
| notification_label | text | — | SÌ | Blocco G. Nome usato nelle notifiche delle voci **senza portata**, raggruppate per postazione (postazione "Bar" → etichetta "Bibite"). NULL o vuoto = si usa `name`. Non NOT NULL con default: "non impostata" e "impostata uguale al nome" sono due cose diverse per chi poi rinomina la postazione |
| served_by_hall | boolean | `false` | NO | Blocco G. Postazione servita direttamente dal cameriere: le sue voci nascono già consegnate all'invio e non compaiono in nessuna vista cucina. Vedi Blocco G in "Verticali" per il perché non sia un trigger |

- **Vincoli**: UNIQUE(business_id, lower(name)) — `idx_kitchen_stations_business_name`, indice su un'espressione. **Non è un target valido per `upsert(...).onConflict(...)`** (richiede colonne semplici): il seeding usa un `insert` normale, trattando l'errore 23505 (violazione di unicità) come "la postazione esiste già", non come un fallimento — scelta esplicita, diversa dall'`upsert` usato per `business_courses`.
- **Indici**: PK, `idx_kitchen_stations_business_id`, unique(business_id, lower(name)).
- **RLS**: `kitchen_stations: owner all` (ALL, via `businesses.user_id = auth.uid()`).
- **REGOLA DI SICUREZZA — nessuna categoria/voce può restare senza postazione**: se `menu_categories.station_id` è NULL (o punta a una postazione non più attiva), `resolveStationId()` (`src/lib/kitchenRouting.js`) ricade sulla **prima postazione attiva non servita dalla sala** (dal Blocco G; se non ne esiste nessuna, sulla prima attiva qualunque essa sia) — mai su "nessuna postazione" (che farebbe sparire la voce da ogni vista cucina). Se non esiste **nessuna** postazione attiva, `Cucina.jsx` mostra **tutte** le voci, mai nessuna. `Menu.jsx` mostra un avviso persistente per le categorie orfane finché il titolare non le assegna esplicitamente. Disattivare una postazione con categorie ancora assegnate è bloccato lato applicazione (controllo locale su `menu_categories` già caricate, nessun vincolo DB).

#### `hall_notifications` — verticale `'ristorante_bar'`
Notifiche **evento** per la sala — verticale `'ristorante_bar'`, Blocco G. Creata da `20261024_hall_notifications.sql`, Realtime abilitato.

**Attenzione a cosa NON c'è qui**: le notifiche "portata pronta" (quelle di stato) non hanno nessuna riga in questa tabella e nessuna colonna da nessuna parte — sono una lettura degli ordini aperti, calcolata al volo da `buildStateNotifications` (`src/lib/hallNotifications.js`). Questa tabella serve **solo** agli eventi che non sono ricavabili da altri dati: oggi "chiama sala", che senza una riga andrebbe perso da un dispositivo spento o riavviato nell'istante del broadcast.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| type | text | — | NO | CHECK `('chiama_sala','prodotto_esaurito')`. `'prodotto_esaurito'` è previsto dal vincolo ma **nessun punto del codice lo scrive**: il CHECK è già largo per non richiedere una migration il giorno in cui servirà |
| table_id | uuid | — | SÌ | FK → `tables(id)` ON DELETE SET NULL. Nullable: "chiama sala" nasce dalla cucina e non riguarda un tavolo preciso. SET NULL e non CASCADE: la notifica resta leggibile anche se il tavolo viene eliminato dalla piantina nel frattempo |
| station_id | uuid | — | SÌ | FK → `kitchen_stations(id)` ON DELETE SET NULL. Quale postazione ha chiamato |
| payload | jsonb | `'{}'::jsonb` | NO | Dati specifici del tipo (per `prodotto_esaurito`: quale piatto). Vuoto e non NULL, così chi lo legge non deve distinguere i due casi |
| created_at | timestamptz | `now()` | NO | **Scritto solo dal database**, il client non lo invia mai: l'elenco è ordinato dal più vecchio e con gli orologi dei tablet due dispositivi produrrebbero un ordine diverso (stesso motivo di `table_order_items.sent_received_at`) |
| read_at | timestamptz | — | SÌ | Valorizzato = letta dalla sala, sparisce dall'elenco. **Nessun DELETE**, come nel resto del progetto |

- **Indici**: PK, `idx_hall_notifications_business_id`, `idx_hall_notifications_table_id`, `idx_hall_notifications_station_id`, più `idx_hall_notifications_unread` su `(business_id, created_at) WHERE read_at IS NULL` — indice **parziale**, perché l'unica query della pagina chiede le non lette e le righe già lette non devono pesarci.
- **RLS**: `hall_notifications: owner all` (ALL, via `businesses.user_id = auth.uid()`), owner-only con `business_id` **diretto** — non il join attraverso `table_orders` usato da `table_order_items`, che qui non servirebbe.
- **Scritta da**: `recordCallSala()` (`src/lib/kitchenRealtime.js`), chiamata da `Cucina.jsx` insieme al broadcast; `read_at` da `NotificheSala.jsx` tramite `useHallNotifications`.

#### `legal_acceptances` [FANTASMA]
Traccia le accettazioni di termini/privacy/DPA con versioning dei documenti accettati. Scritta oggi **solo** da `Onboarding.jsx:191-203` (contesto merchant, upsert con `onConflict: 'user_id,acceptance_type', ignoreDuplicates: true`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| user_id | uuid | — | NO | FK → `auth.users(id)` ON DELETE CASCADE |
| context | text | — | NO | CHECK (verificato in prod): `merchant`\|`affiliate` |
| acceptance_type | text | — | NO | CHECK (verificato in prod): `merchant_terms_dpa_privacy`\|`affiliate_contract_privacy` |
| document_versions | jsonb | `{}` | NO | es. `{termini: '2026-05-28', dpa: '...', privacy: '...'}` |
| source | text | — | NO | es. `onboarding_create_business` |
| accepted_at | timestamptz | `now()` | NO | |
| created_at | timestamptz | `now()` | NO | |

- **Vincoli**: UNIQUE(user_id, acceptance_type) — `legal_acceptances_unique_user_type`, è il target dell'`onConflict` usato dall'upsert.
- **RLS**: `legal_acceptances: owner insert`, `legal_acceptances: owner read`.
- ⚠️ **Discrepanza trovata in questa passata**: il CHECK su `acceptance_type` prevede anche `'affiliate_contract_privacy'` (verificato in produzione il 16/08), ma **nessun punto del codice attuale scrive questa riga** — `AffiliatesAuth.jsx` mostra solo una checkbox obbligatoria lato client (`legalAccepted`, righe 32/47/172-179) per accettare il Contratto di Affiliazione, senza persistere nulla in `legal_acceptances`. L'accettazione dell'affiliato non risulta oggi tracciata lato server, a differenza di quella del merchant.

#### `menu_categories` — verticale `'ristorante_bar'`
Categorie del menu (es. "Antipasti", "Primi") — verticale `'ristorante_bar'`. **Nessuna riga pre-creata di default**, a differenza di `business_turns`/`business_courses`/`kitchen_stations`: qui non esiste un set universale sensato per qualunque locale, il titolare le crea da zero in `Menu.jsx`. Creata da `20260922_menu_catalog.sql`, estesa da `20260924_kitchen_courses_stations.sql` (Blocco D: `course_id`, `station_id`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | — | NO | |
| sort_order | int | `0` | NO | riordino manuale (frecce su/giù in `Menu.jsx` → scambio di `sort_order` con il vicino nella lista ordinata, nessun drag-and-drop) |
| is_active | boolean | `true` | NO | mai un DELETE reale; una categoria disattivata con piatti ancora agganciati resta visibile nel catalogo (badge "Disattivata"), sparisce dalla vista solo se non ha più nessun piatto |
| course_id | uuid | — | YES | FK → `business_courses(id)` ON DELETE SET NULL — **nullable di proposito**: NULL significa "questa categoria è sempre subito" (es. bevande), non un dato mancante da segnalare, a differenza di `station_id` sotto. Assegnata da `Menu.jsx` → "Gestisci categorie" — `20260924_kitchen_courses_stations.sql` |
| station_id | uuid | — | YES | FK → `kitchen_stations(id)` ON DELETE SET NULL — nullable **a livello DB** ma con una regola di sicurezza applicativa: nessuna categoria dovrebbe restare senza postazione, vedi `kitchen_stations` per il ripiego e l'avviso in `Menu.jsx`. Assegnata da `Menu.jsx` → "Gestisci categorie" — `20260924_kitchen_courses_stations.sql` |

- **Indici**: PK, `idx_menu_categories_business_id`, `idx_menu_categories_course_id`, `idx_menu_categories_station_id`.
- **RLS**: `menu_categories: owner all` (ALL, via `businesses.user_id = auth.uid()`).

#### `menu_item_flags` — verticale `'ristorante_bar'`
Segnalazioni "questo piatto potrebbe essere esaurito" — verticale `'ristorante_bar'`. Una riga per segnalazione, nessun contatore mantenuto a parte (si conta con la lunghezza dell'embed). **Unica tabella di tutto il progetto le cui righe vengono cancellate per davvero invece che soft-disattivate**: sono segnalazioni transitorie senza valore storico da conservare (a differenza di tavoli/prenotazioni/turni/categorie/piatti, dove non si cancella mai nulla) — decisione esplicita discussa con l'utente prima di scrivere la migration. Niente `resolved_at`: "risolvere" una segnalazione (sezione "Conferme fine turno" di `Menu.jsx`) è un `DELETE` diretto di tutte le righe per quel `menu_item_id`. Creata da `20260922_menu_catalog.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| menu_item_id | uuid | — | NO | FK → `menu_items(id)` ON DELETE CASCADE |
| flagged_at | timestamptz | `now()` | NO | non mostrato in UI in questa versione — solo il conteggio conta |
| flagged_by | text | — | YES | testo libero, oggi non popolato lato UI (nessun sistema di permessi/ruoli staff in questo progetto — un solo login per business); campo predisposto per un'eventuale distinzione futura |

- **Indici**: PK, `idx_menu_item_flags_menu_item_id`.
- **RLS**: `menu_item_flags: owner all` (ALL, via join `menu_item_id → menu_items → businesses.user_id = auth.uid()` — stesso pattern di `appointment_services`/`table_reservation_tables`, nessun `business_id` diretto su questa tabella).
- **Uso**: "Segnala esaurito" in `Menu.jsx` — un tap, nessuna restrizione oltre il normale accesso alla dashboard (non esiste un ruolo "staff" separato dal titolare da poter restringere), insert diretto, **non tocca** `menu_items.is_available`. Sezione separata "Conferme fine turno" (pulsante con badge di conteggio nella toolbar, non nel percorso quotidiano di chi si limita a segnalare): una riga per piatto con il conteggio, ordinate per numero di segnalazioni decrescente poi alfabetico, nessun raggruppamento per categoria, nessun timestamp mostrato. "Segna esaurito davvero" imposta `menu_items.is_available = false` **e** cancella le segnalazioni di quel piatto; "Ignora, resta disponibile" le cancella senza toccare `is_available`. Entrambe operano su tutte le segnalazioni del piatto in blocco, mai una alla volta.

#### `menu_items` — verticale `'ristorante_bar'`
Piatti/voci di menu — verticale `'ristorante_bar'`. Creata da `20260922_menu_catalog.sql`, estesa da `20260927_stock_and_costs.sql` (Blocco E: campi prodotto per scorte e costi).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| category_id | uuid | — | YES | FK → `menu_categories(id)` ON DELETE SET NULL — un piatto può non avere ancora una categoria; selezionabile in `Menu.jsx` solo tra le categorie attive, ma un piatto già assegnato a una categoria poi disattivata resta visibile lì (non si sposta in "Senza categoria" da solo) |
| name | text | — | NO | |
| price | numeric(10,2) | — | YES | |
| is_available | boolean | `true` | NO | mai un DELETE reale; nasconde il piatto dalle ordinazioni senza cancellarlo — toggle rapido dalla riga in `Menu.jsx`, stesso pattern di `toggleAvailable` in `Servizi.jsx`. Messo a false anche da "Segna esaurito" nelle Conferme fine turno, **mai automaticamente** da una giacenza a zero |
| track_stock | boolean | `false` | NO | 🔵 Blocco E — "traccia a magazzino". Solo per prodotti venduti A PEZZO (bibite, dolci confezionati): niente litri, grammi o confezioni, e nessun ingrediente/ricetta (scartati di proposito, vedi Cronologia Blocco E) |
| min_stock | int | — | YES | 🔵 Blocco E — soglia di riordino. CHECK: NULL o > 0; NULL = nessuna soglia, il prodotto non compare mai in "Da riordinare". Azzerata da `Menu.jsx` se si spegne `track_stock` |
| estimated_cost | numeric(10,2) | — | YES | 🔵 Blocco E — costo STIMATO per piatto, IVA esclusa, sempre facoltativo. Serve ai margini dei prodotti NON tracciati (la pizza, il primo) e fa anche da ripiego per un prodotto tracciato senza ancora nessun carico. 2 decimali e non 4: è una stima digitata a mano, non un valore derivato da una divisione |
| vat_rate | numeric(5,2) | `10` | NO | 🔵 Blocco E — aliquota IVA di vendita, per scorporare il prezzo nel calcolo del margine. CHECK >= 0. Fotografata sulla voce d'ordine all'invio (`vat_rate_snapshot`), quindi cambiarla non tocca i margini passati |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK, `idx_menu_items_business_id`, `idx_menu_items_category_id`, `idx_menu_items_name_trgm` (GIN trigram, ricerca fuzzy nella schermata ordine), `idx_menu_items_business_track_stock` (parziale `WHERE track_stock` — la sezione Scorte parte sempre dai soli prodotti tracciati).
- **RLS**: `menu_items: owner all` (ALL, via `businesses.user_id = auth.uid()`).
- **Fuori scope esplicito di questo blocco** (per scelta, non dimenticanza): nessuna lettura menu da foto/AI, nessuna nota testuale per piatto (arriverà legata alla riga d'ordine, non al catalogo), nessun tracciamento quantità/scorte fisiche.

#### `pets`
Animali dei clienti, funzionalità del verticale `'toelettatura'` (vedi sezione "Verticali" a inizio documento) — ma la tabella e la RLS restano sempre attive per qualunque business: è la UI in `Agenda.jsx`/`Clienti.jsx` a essere gated, non la lettura/scrittura del dato. Agganciata per `client_phone` normalizzato, stesso identificativo già usato da `contacts`/`appointments` — nessun nuovo sistema di riconoscimento cliente. Creata da `20260920_grooming_universal_fields.sql`, estesa da `20260921_pets_size_and_appointment_link.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| client_phone | text | — | NO | normalizzato IT da `src/lib/phone.js`, stesso identificativo di `contacts`/`appointments` |
| name | text | — | NO | |
| breed | text | — | YES | razza, testo libero |
| coat | text | — | YES | CHECK: `corto`\|`medio`\|`lungo` — mostrato come `CoatBars` (`PetIndicators.jsx`) |
| gender | text | `'non_specificato'` | NO | CHECK: `maschio`\|`femmina`\|`non_specificato` — determina il colore di `PetBoneIcon` |
| weight_note | text | — | YES | nota libera sul peso (non un campo numerico strutturato) |
| created_at | timestamptz | `now()` | NO | |
| size | text | — | YES | CHECK: `xs`\|`s`\|`m`\|`l`\|`xl` — mostrata come `SizeBadge` (`PetIndicators.jsx`); aggiunta da `20260921_pets_size_and_appointment_link.sql`, presente sia nel form di `Agenda.jsx` sia in quello di `Clienti.jsx` (aggiunto con un fix separato, `df690df`, perché mancante al primo giro) |

- **Indici**: PK, `idx_pets_business_id`, `idx_pets_business_phone` (business_id, client_phone), `idx_pets_name_trgm` (GIN trigram su `name`, ricerca fuzzy cross-cliente — `20260921`).
- **RLS**: `pets: owner all` (ALL, via `businesses.user_id = auth.uid()`) — stesso pattern di `contacts`/`appointment_services`.
- **Uso reale**: in `Agenda.jsx` il modulo appuntamento fa una ricerca live cross-business su `pets.name` (non più un fetch di tutti i pet del business — rimosso da `9bd642f`), mostra "Nome pet · Proprietario" + telefono per disambiguare omonimi, precompila cliente e salva `pet_id` sull'appuntamento; in `Clienti.jsx` la scheda cliente ha CRUD pet completo (crea/modifica/elimina, `39d768d`) sulla lista dei pet di quel `client_phone`. Quando un pet viene eliminato, `appointments.pet_id` passa a `NULL` via `ON DELETE SET NULL` — nessun errore lato UI, verificato esplicitamente in `39d768d`.

#### `push_subscriptions`
Sottoscrizioni Web Push per notifiche browser. Creata da `20260516_push_subscriptions.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| user_id | uuid | — | NO | FK → `auth.users(id)` ON DELETE CASCADE |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| endpoint | text | — | NO | endpoint del push service del browser |
| subscription | jsonb | — | NO | oggetto `PushSubscription` completo (endpoint+chiavi) |
| created_at | timestamptz | `now()` | YES | |

- **Vincoli**: UNIQUE(user_id, endpoint).
- **RLS**: `push_subscriptions: owner` (ALL, `user_id = auth.uid()`).

#### `reminders`
Promemoria/task interni del commerciante (non da confondere con i "Promemoria clienti" WhatsApp, che non usano una tabella propria ma leggono `appointments`/`contacts`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| user_id | uuid | — | NO | FK → `auth.users(id)` ON DELETE CASCADE |
| title | text | — | NO | |
| notes | text | — | YES | |
| due_at | timestamptz | — | YES | |
| priority | text | `'medium'` | NO | CHECK: `low`\|`medium`\|`high` |
| status | text | `'pending'` | NO | CHECK: `pending`\|`done`\|`dismissed` |
| related_type | text | — | YES | es. `social_draft`, `review`, `service` |
| related_id | uuid | — | YES | id dell'entità correlata (nessuna FK, tipo libero) |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_reminders_updated_at` |

- **Indici**: PK, `idx_reminders_business_id`, `idx_reminders_user_id`, `idx_reminders_due_at` (parziale, WHERE status='pending'), `idx_reminders_business_status_due` (business_id, status, due_at — `20260520_performance_indexes.sql`).
- **RLS**: `reminders: owner access` (ALL, `auth.uid() = user_id`).

#### `reviews`
Recensioni clienti (manuali o "importate" a mano da altre piattaforme), con risposta del titolare generabile via AI.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| author_name | text | — | NO | |
| author_avatar | text | — | YES | |
| rating | smallint | — | NO | CHECK 1–5 |
| body | text | — | YES | |
| source | text | `'manual'` | NO | CHECK: `manual`\|`google`\|`tripadvisor`\|`facebook`\|`yelp` |
| source_id | text | — | YES | ID originale nella piattaforma sorgente |
| is_visible | boolean | `true` | NO | mostrata sul sito pubblico se true (badge "Pubblicata" in `Recensioni.jsx`) |
| reply | text | — | YES | risposta del titolare |
| replied_at | timestamptz | — | YES | |
| reviewed_at | timestamptz | `now()` | NO | |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_reviews_updated_at` |
| published | boolean | `false` | YES | 🔴 **FANTASMA** — non in `schema.sql`; **nessun riferimento nel codice frontend attuale** in questa passata (verosimile residuo morto, distinto da `is_visible` che è la colonna realmente usata per "pubblicata sul sito") |

- **Indici**: PK, `idx_reviews_business_id`, `idx_reviews_rating` (business_id, rating), `idx_reviews_business_visible` (business_id, is_visible, reviewed_at desc — `20260520_performance_indexes.sql`).
- **RLS**: `reviews: owner access` (ALL, via `businesses.user_id = auth.uid()`), `reviews: public read` (SELECT, `is_visible = true`); coesiste con policy legacy equivalente `"Users can manage own reviews"` (mai in una migration).

#### `services`
Listino servizi offerti dal business (usato sia dall'agenda interna sia dal sito pubblico/prenotazioni).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | — | NO | |
| description | text | — | YES | |
| price | numeric(10,2) | — | YES | |
| price_label | text | — | YES | es. "a partire da", "fisso", "per ora" |
| duration_min | int | — | YES | durata in minuti — se NULL, `create_booking` non riesce a calcolare gli slot (nota nella FAQ) |
| image_url | text | — | YES | |
| is_available | boolean | `true` | NO | spegne il servizio **ovunque** (sito pubblico E agenda interna) |
| sort_order | int | `0` | NO | |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_services_updated_at` |
| visible_on_public_site | boolean | `true` | NO | nasconde il servizio **solo** dal sito pubblico (lista + form prenotazione), resta selezionabile in agenda — distinto da `is_available` — `20260908_services_visible_on_public_site.sql` |
| color | text | — | YES | colore facoltativo del servizio (stessa palette/classi `.ag-swatch` già usate per il colore dei dipendenti in Agenda.jsx); mostrato come pallino nella lista di `Servizi.jsx` e sul blocco appuntamento in `Agenda.jsx` (rappresentativo: primo servizio con colore impostato, se multi-servizio) — `20260920_grooming_universal_fields.sql` |

- **Indici**: PK, `idx_services_business_id`, `idx_services_business_sort` (business_id, sort_order — `20260520_performance_indexes.sql`).
- **RLS**: `services: owner access` (ALL, via `businesses.user_id = auth.uid()`), `services: public read` (SELECT, `is_available = true`); coesiste con policy legacy equivalente `"Users can manage own services"`.

#### `site_content`
Blocchi di contenuto del mini-sito pubblico (editor "Sito" → `EditorSito.jsx`), un blocco per `block_key` (`hero`, `about`, `cover`, `gallery`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| block_key | text | — | NO | UNIQUE con `business_id` |
| title | text | — | YES | |
| body | text | — | YES | |
| cta_label | text | — | YES | |
| cta_url | text | — | YES | |
| image_url | text | — | YES | |
| metadata | jsonb | `{}` | YES | campi extra liberi per il blocco |
| is_published | boolean | `false` | NO | **non più usata per il filtro pubblico** dal 15/06 (vedi sotto) |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_site_content_updated_at` |
| hero_title | text | — | YES | 🔴 **FANTASMA** — usata da `EditorSito.jsx:169,176` e `PublicSite.jsx` |
| hero_subtitle | text | — | YES | 🔴 idem — `EditorSito.jsx:170,177` |
| hero_cta_text | text | — | YES | 🔴 idem — `EditorSito.jsx:171,178` |
| about_text | text | — | YES | 🔴 idem — `EditorSito.jsx:243,248` |
| cover_image_url | text | — | YES | 🔴 idem — `EditorSito.jsx:286,325,339` |

- **Vincoli**: UNIQUE(business_id, block_key).
- **Indici**: PK, `idx_site_content_business_id`.
- **RLS**: `site_content: owner access` (ALL, via `businesses.user_id = auth.uid()`), `site_content: public read` (SELECT, `using (true)` — **da `20260515_site_content_public_read.sql`**, che ha sostituito la policy originale filtrata su `is_published = true`: quel filtro causava pagina bianca ai visitatori perché i blocchi non venivano esplicitamente "pubblicati" dall'editor). Coesiste con policy legacy equivalente `"Site content leggibile pubblicamente"`.

#### `social_drafts`
Bozze di post social (Instagram/Facebook) generate dall'AI o scritte a mano, con stato di avanzamento.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `uuid_generate_v4()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| platform | text | — | NO | CHECK: `instagram`\|`facebook`\|`linkedin`\|`x`\|`tiktok`\|`generic` (solo `instagram`/`facebook` usati oggi dalla UI) |
| content | text | — | NO | |
| hashtags | text[] | — | YES | |
| image_url | text | — | YES | |
| status | text | `'draft'` | NO | CHECK: `draft`\|`approved`\|`scheduled`\|`published`\|`archived` |
| scheduled_at | timestamptz | — | YES | |
| published_at | timestamptz | — | YES | |
| ai_generated | boolean | `false` | NO | |
| ai_prompt | text | — | YES | prompt usato per generare il draft |
| created_at | timestamptz | `now()` | NO | |
| updated_at | timestamptz | `now()` | NO | trigger `trg_social_drafts_updated_at` |

- **Indici**: PK, `idx_social_drafts_business_id`, `idx_social_drafts_status`, `idx_social_drafts_scheduled_at`, `idx_social_drafts_business_status` (business_id, status, created_at desc — `20260520_performance_indexes.sql`).
- **RLS**: `social_drafts: owner access` (ALL, via `businesses.user_id = auth.uid()`); coesiste con policy legacy equivalente `"Users can manage own social drafts"`.

#### `stock_closures` — verticale `'ristorante_bar'`
Chiusure del conteggio scorte — Blocco E. Il titolare chiude quando vuole, quante volte vuole: nessun turno fisso, nessun legame con `business_turns` (turni e scorte sono assi indipendenti). Creata da `20260927_stock_and_costs.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| period_end | timestamptz | — | NO | **Confine CONTABILE**: fino a qui la chiusura ha contato il venduto. Preso dall'orologio del DATABASE nell'istante in cui si calcola la proposta (`stock_closure_proposal`), **non** alla conferma e **non** dal dispositivo del titolare. NOT NULL senza default di proposito: una chiusura senza confine non è interpretabile |
| closed_at | timestamptz | `now()` | NO | Timestamp di AUDIT (quando il titolare ha confermato). **Non** è il confine contabile — vedi il principio "confini contabili" in "Verticali" |

- **Vincoli**: UNIQUE(business_id, period_end) — `stock_closures_business_period_unique`, contro il doppio tap su "Conferma" con rete lenta.
- **Indici**: PK, `idx_stock_closures_business_id`, `idx_stock_closures_business_period_desc` (business_id, period_end DESC — "l'ultima chiusura di questo business" è la query più frequente del blocco).
- **Trigger**: `trg_stock_closures_boundary` (BEFORE INSERT → `check_stock_closure_boundary()`): rifiuta un `period_end` nel futuro (inghiottirebbe vendite non ancora arrivate) o non successivo a quello dell'ultima chiusura (riconterebbe una finestra già chiusa). Vale per qualunque percorso di insert, non solo per la funzione di conferma.
- **RLS**: `stock_closures: owner all` (ALL, via `businesses.user_id = auth.uid()`).
- **Una chiusura confermata non si modifica**: un errore si corregge con una `rettifica` in `stock_movements`, non riscrivendo la chiusura.

#### `stock_movements` — verticale `'ristorante_bar'`
Registro **append-only** dei movimenti di magazzino — Blocco E. **La giacenza non è una colonna da nessuna parte**: è sempre `somma(quantity)` sui movimenti del prodotto, e il costo attuale è sempre l'`unit_cost` del carico più recente (vedi il principio "stato calcolato al volo" in "Verticali"). Creata da `20260927_stock_and_costs.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| menu_item_id | uuid | — | NO | FK → `menu_items(id)` ON DELETE **CASCADE** — deliberatamente diverso da `table_order_items.menu_item_id` (nullable + SET NULL): là la riga sopravvive alla cancellazione del piatto perché conserva un senso proprio (incasso storico, grazie agli snapshot); qui un movimento senza prodotto non è storia, è rumore — non servirebbe a calcolare la giacenza di nessuno |
| type | text | — | NO | CHECK: `carico`\|`vendita`\|`rettifica` |
| quantity | int | — | NO | **Con segno**, così la giacenza è una semplice somma senza casi speciali per tipo. CHECK: mai 0; `carico` sempre > 0; `vendita` sempre < 0; `rettifica` libera (è il suo scopo) — segni garantiti dal DB, non solo dall'interfaccia |
| unit_cost | numeric(12,4) | — | YES | IVA esclusa. **Obbligatorio sui carichi** (CHECK `type <> 'carico' OR unit_cost IS NOT NULL`): senza, "costo attuale = ultimo carico" non avrebbe senso, e qui non esiste un ripiego. 4 decimali e non 2 come il resto degli importi del progetto: un costo derivato da una confezione (14,50 / 24 = 0,6042) perderebbe precisione al centesimo e l'errore si moltiplicherebbe per ogni pezzo |
| closure_id | uuid | — | YES | FK → `stock_closures(id)` ON DELETE SET NULL — valorizzato sulle `vendita` generate da una chiusura, NULL per carichi e rettifiche manuali |
| note | text | — | YES | es. "rotture", "inventario del lunedì" |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK, `idx_stock_movements_business_id`, `idx_stock_movements_menu_item_id`, `idx_stock_movements_closure_id`, `idx_stock_movements_business_created` (resoconti per periodo), `idx_stock_movements_last_carico` (parziale su `(menu_item_id, created_at DESC) WHERE type='carico'` — il costo attuale serve a ogni invio in cucina, a ogni apertura di Scorte e a ogni conferma di chiusura).
- **RLS**: `stock_movements: owner all` (ALL, via `businesses.user_id = auth.uid()`).
- **Mai modificato, mai cancellato**: un conteggio sbagliato si corregge aggiungendo una `rettifica` che lo compensa, così la storia resta leggibile.

#### `table_order_items` — verticale `'ristorante_bar'`
Righe di una comanda (`table_orders`) — verticale `'ristorante_bar'`, Blocco C esteso nel Blocco D. Righe **indipendenti l'una dall'altra di proposito**: due camerieri che aggiungono lo stesso piatto nello stesso istante ottengono due insert separati, mai una race su un unico update — niente realtime a livello di singola riga per la scrittura, solo per la lettura (vedi sotto). Creata da `20260923_table_orders.sql`, estesa da `20260924_kitchen_courses_stations.sql` (Blocco D).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK — **generato lato client** (`crypto.randomUUID()`) in `Ordine.jsx`, non lasciato al default server: riusato a ogni retry di un salvataggio fallito per rete, così un upsert-per-id successivo converge sempre sullo stesso stato invece di creare un doppione |
| order_id | uuid | — | NO | FK → `table_orders(id)` ON DELETE CASCADE |
| menu_item_id | uuid | — | YES | FK → `menu_items(id)` ON DELETE SET NULL — **nullable apposta**: se il piatto viene cancellato dal catalogo dopo l'ordine, la riga sopravvive (grazie a `item_name_snapshot`) ma perde il collegamento; è uno dei 3 casi di ripiego per postazione/portata, vedi `kitchen_stations`/`kitchenRouting.js` |
| item_name_snapshot | text | — | NO | copia del nome al momento dell'ordine, non un join live — sopravvive a una modifica/cancellazione del piatto |
| price_snapshot | numeric(10,2) | — | YES | idem, prezzo congelato al momento dell'ordine |
| quantity | int | `1` | NO | portata a 0 → la riga viene cancellata (DELETE reale, unica eccezione al "mai DELETE" di questo verticale: una riga in composizione senza quantità non rappresenta nulla) |
| notes | text | — | YES | nota libera per riga (es. "senza cipolla") |
| sent_at | timestamptz | — | YES | NULL = ancora "in composizione" (editabile liberamente, cancellabile); valorizzato = inviata in cucina col pulsante "Invia in cucina" — da questo momento **non più cancellabile né modificabile in quantità**, solo `kitchen_status='annullato'` |
| kitchen_status | text | `'da_preparare'` | NO | CHECK: `da_preparare`\|`pronto`\|`consegnato`\|`annullato`. Nome scelto deliberatamente diverso da `'attesa'` per non confondersi con `fire_status='in_attesa'` (due colonne, stati opposti, nomi troppo simili sarebbero stati un rischio concreto). Prima dell'invio (`sent_at` NULL) non ha significato, si guarda solo `sent_at` |
| ready_at | timestamptz | — | YES | valorizzato quando `kitchen_status` passa a `'pronto'` (tap sulla voce in `Cucina.jsx`) |
| delivered_at | timestamptz | — | YES | valorizzato quando `kitchen_status` passa a `'consegnato'` (pulsante "Consegnata" per fascia/portata, disponibile sia in `Cucina.jsx` sia in `Ordine.jsx`) |
| fire_status | text | `'subito'` | NO | CHECK: `subito`\|`in_attesa` — la voce parte subito in cucina o resta in attesa del "via". Le voci senza portata risolvibile sono **sempre** `'subito'` (vedi `kitchenRouting.js`) |
| sent_received_at | timestamptz | — | YES | 🔵 **Blocco E — orologio del DATABASE, il client non la scrive MAI.** Scritta dal trigger `set_sent_received_at` nella transizione "non inviata → inviata"; su qualunque update successivo della riga (annulla, via, consegnata, retry della coda offline) il valore originale resta invariato, così il confine contabile di una voce non si sposta mai. **Unico** campo usato per le finestre delle chiusure e per la stima delle giacenze. Vedi il principio "confini contabili" in "Verticali" — `20260927_stock_and_costs.sql` |
| cost_snapshot | numeric(12,4) | — | YES | 🔵 Blocco E — costo unitario IVA esclusa fotografato **all'invio** in cucina (non all'aggiunta della voce: tra i due momenti un carico può cambiare il costo reale). NULL = costo sconosciuto: la voce entra nell'incasso, resta fuori dal margine. 4 decimali, stesso motivo di `stock_movements.unit_cost` |
| cost_source | text | — | YES | 🔵 Blocco E — CHECK `reale`\|`stimato` (NULL ammesso: `NULL IN (...)` vale NULL e un CHECK fallisce solo su FALSE). `'reale'` = ultimo carico di un prodotto tracciato; `'stimato'` = `menu_items.estimated_cost`, usato anche quando il prodotto è tracciato ma non ha ancora nessun carico. Nei resoconti le due provenienze non vengono mai sommate senza distinguerle |
| vat_rate_snapshot | numeric(5,2) | — | YES | 🔵 Blocco E — aliquota del prodotto al momento dell'invio, per scorporare il prezzo: `prezzo senza IVA = price_snapshot / (1 + vat_rate_snapshot/100)`. NULL sulle voci inviate prima della migration (restano senza margine calcolabile, nessun valore inventato a posteriori) |
| fired_at | timestamptz | — | YES | valorizzato quando `fire_status` diventa (o resta) `'subito'` — al momento dell'invio se la portata è scelta come "subito", oppure più tardi col "via". Usato anche da `Cucina.jsx` per far salire in cima la scheda del tavolo che ha appena ricevuto un "via" |

- **Indici**: PK, `idx_table_order_items_order_id`, `idx_table_order_items_menu_item_id`, `idx_table_order_items_sent_at` (parziale, WHERE `sent_at IS NOT NULL` — le query della vista cucina filtrano sempre su questo).
- **RLS**: `table_order_items: owner all` (ALL, via join `order_id → table_orders → businesses.user_id = auth.uid()` — nessun `business_id` diretto, stesso pattern di `appointment_services`/`menu_item_flags`/`table_reservation_tables`).
- **Realtime**: pubblicata su `supabase_realtime` (`ALTER PUBLICATION ... ADD TABLE table_order_items` in `20260924_kitchen_courses_stations.sql`, riga non idempotente — fallisce se rilanciata due volte, va bene per un'esecuzione singola). Nessun filtro `business_id=eq.…` possibile lato canale (la colonna non esiste su questa tabella, a differenza di `bookings`): la sottoscrizione arriva senza filtro, RLS realtime scopa comunque le righe al proprietario, e per difesa in profondità ogni ascoltatore (`Cucina.jsx`/`Ordine.jsx`/`Tavoli.jsx`) tratta qualunque evento come "qualcosa è cambiato, ricarica tutto" invece di fidarsi del payload — mai un patch parziale, nemmeno alla riconnessione.
- **Protezione dalle cadute di rete** (solo `Ordine.jsx`, non richiesta altrove): ogni modifica locale (aggiungi/quantità/nota/invio/via/consegnata/annulla) aggiorna prima lo stato React, poi tenta un `upsert(row, {onConflict:'id'})` — se fallisce, la voce resta in una coda locale (`outboxRef`) con badge "in attesa di rete" e blocca "Invia in cucina"/"Chiudi tavolo", ritentata da sola all'evento `online` del browser e a un intervallo di retry, **mai serve ritoccarla**. Una cancellazione converte un eventuale upsert ancora in coda in un `delete` invece di scartarlo silenziosamente: se l'insert non era mai arrivato al server il delete è un no-op innocuo, se invece era arrivato (solo l'ack perso) lo rimuove per davvero — corretto in entrambi i casi.

#### `table_orders` — verticale `'ristorante_bar'`
Una comanda aperta = un tavolo fisicamente occupato **per l'esatta combinazione (tavolo, data, turno)** — verticale `'ristorante_bar'`, Blocco C. Affina il modello di stato: una `table_reservations` confermata significa solo "il cliente è atteso" (PRENOTATO), non "è seduto"; il tavolo diventa davvero OCCUPATO solo quando esiste una riga qui con `status='aperto'` per quella combinazione — che nasca da una prenotazione (`reservation_id` valorizzato) o da un walk-in (NULL) non cambia lo stato, solo la provenienza. Creata da `20260923_table_orders.sql`, estesa da `20260923_table_orders_auto_close.sql` (`auto_closed`).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| table_id | uuid | — | NO | FK → `tables(id)` ON DELETE CASCADE |
| order_date | date | — | NO | valorizzata con la data **locale del browser** al momento dell'apertura (mai `now()` DB, che è UTC — tra mezzanotte e le 2 darebbe una data diversa da quella "vissuta" dal titolare in Italia) |
| turn_id | uuid | — | NO | FK → `business_turns(id)`, obbligatoria — stesso principio di `table_reservations.turn_id`: lo stato OCCUPATO è calcolato per l'esatta combinazione (tavolo, data, turno), non ha senso un ordine "senza turno" |
| reservation_id | uuid | — | YES | FK → `table_reservations(id)` ON DELETE SET NULL — valorizzata se l'ordine nasce da "Prendi ordine" su una prenotazione esistente, NULL per un walk-in ("Walk-in: apri ordine") |
| status | text | `'aperto'` | NO | CHECK: `aperto`\|`chiuso`. "Chiudi tavolo" (conferma a due passaggi in `Ordine.jsx`) è l'unico modo di liberare davvero il tavolo — l'unico UPDATE esplicito dell'utente; la chiusura automatica (vedi `auto_closed`) è l'altro modo, non manuale |
| opened_at | timestamptz | `now()` | NO | |
| closed_at | timestamptz | — | YES | valorizzato alla chiusura, manuale o automatica |
| auto_closed | boolean | `false` | NO | `true` se la chiusura è scattata da sola (ordine dimenticato) invece che da un tap esplicito su "Chiudi tavolo" — `20260923_table_orders_auto_close.sql` |

- **Vincoli**: UNIQUE parziale WHERE `status='aperto'`, **scoped a `(table_id, order_date, turn_id)`** — `idx_table_orders_one_open_per_slot` (`20260923_table_orders_auto_close.sql`). **Sostituisce** un vincolo precedente scoped al solo `table_id` (`idx_table_orders_one_open_per_table`, ora dropped) — vedi Cronologia punto 8 in "Verticali" per il perché del cambio.
- **Indici**: PK, `idx_table_orders_business_id`, `idx_table_orders_business_date` (business_id, order_date), `idx_table_orders_table_id`, `idx_table_orders_reservation_id`.
- **RLS**: `table_orders: owner all` (ALL, via `businesses.user_id = auth.uid()`).
- **Chiusura automatica degli ordini dimenticati** (`Tavoli.jsx`, effect dedicato): un ordine aperto su un turno si chiude da solo (`status='chiuso'`, `auto_closed=true`) quando arriva la successiva occorrenza dello **stesso** turno — mai un turno diverso, e solo se la data in vista è davvero oggi (stesso motivo `order_date`: `Date` locale del browser). Navigare su una data diversa da oggi, qualunque turno, resta sempre sola lettura — nessun UPDATE parte mai da lì. Nessun aggiornamento locale di `openOrders` necessario dopo: gli ordini chiusi così hanno `order_date` precedente a oggi, quindi non facevano già parte della lista visualizzata.
- **Tre stati tavolo, sempre calcolati al volo** (mai persistiti, vedi principio generale in "Verticali"): LIBERO (nessuna prenotazione confermata, nessun ordine aperto per l'esatta combinazione), PRENOTATO (prenotazione confermata, nessun ordine aperto ancora), OCCUPATO (un ordine aperto esiste per l'esatta combinazione). Calcolo in `Tavoli.jsx` (`getTableStatus`), stesso principio già in uso per `table_reservations`.

#### `table_reservation_tables` — verticale `'ristorante_bar'`
Tabella ponte N↔N: una prenotazione può occupare più tavoli (gruppi grandi, tavoli uniti) — verticale `'ristorante_bar'`. Stesso principio di `appointment_services`, ma **PK composita invece di un `id` surrogato**: qui la riga non porta dati propri oltre alle due FK, quindi la coppia è già una chiave naturale e impedisce da sola il duplicato "stesso tavolo aggiunto due volte alla stessa prenotazione" — scelta discussa esplicitamente con l'utente prima di scrivere la migration. Creata da `20260922_table_reservations.sql`.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| reservation_id | uuid | — | NO | FK → `table_reservations(id)` ON DELETE CASCADE — **PK composita** insieme a `table_id` |
| table_id | uuid | — | NO | FK → `tables(id)` ON DELETE CASCADE |

- **Indici**: PK composita (reservation_id, table_id), `idx_table_reservation_tables_table_id`.
- **RLS**: `table_reservation_tables: owner all` (ALL, via join `reservation_id → table_reservations → businesses.user_id = auth.uid()` — stesso pattern di `appointment_services`/`menu_item_flags`, nessun `business_id` diretto).
- ⚠️ **Integrità referenziale non completa a livello di DB**: nulla impedisce che una `table_reservations` di un business venga collegata (per bug applicativo) a un `table_id` di un *altro* business — le due FK sono indipendenti, nessun vincolo/trigger verifica `business_id` coerente su entrambi i lati. Non è un buco di sicurezza (le RLS restano owner-only su entrambe le tabelle), solo un'integrità referenziale incompleta, accettata come rischio teorico per non introdurre un trigger nella "versione minima" — prevenuta lato applicazione (il selettore tavoli usa sempre e solo `tables` dello stesso business).

#### `table_reservations` — verticale `'ristorante_bar'`
Prenotazioni tavolo per data e turno — verticale `'ristorante_bar'`. **Seconda versione** di questo concetto: la prima (`appointments.table_id`, "Blocco A") è stata scartata quasi subito — vedi Cronologia nella sezione "Verticali" a inizio documento. Creata da `20260922_table_reservations.sql`, poi modificata da `20260922_table_reservations_turns.sql` (colonna `turn` testo libero → `turn_id` FK obbligatoria).

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| reservation_date | date | — | NO | non un orario+durata come `appointments` — vedi Cronologia |
| turn_id | uuid | — | NO | FK → `business_turns(id)`, **obbligatoria** — ogni prenotazione appartiene esattamente a un turno perché lo stato libero/occupato è calcolato per l'esatta combinazione (tavolo, data, turno): una prenotazione "senza turno" non avrebbe un modo coerente di entrare in quel calcolo. FK vera e non un intero (`slot_number`) copiato a mano, per lo stesso motivo di `pet_id`/`table_id`/`employee_id` altrove nel progetto — integrità referenziale, e se il titolare rinomina un turno le prenotazioni storiche mostrano subito il nome aggiornato. Sostituisce la precedente colonna `turn` (text libero) — `20260922_table_reservations_turns.sql` |
| party_size | int | — | YES | |
| customer_name | text | — | NO | |
| customer_phone | text | — | YES | normalizzato con `normalizePhone()` prima del salvataggio, stesso identificativo di `contacts`/`appointments`/`pets` |
| notes | text | — | YES | |
| status | text | `'confermata'` | NO | CHECK: `confermata`\|`cancellata` — mai un DELETE reale, "cancellare" una prenotazione da `Tavoli.jsx` è un update di questo campo |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK, `idx_table_reservations_business_id`, `idx_table_reservations_business_date` (business_id, reservation_date), `idx_table_reservations_turn_id`.
- **RLS**: `table_reservations: owner all` (ALL, via `businesses.user_id = auth.uid()`).
- **Collegamento al sistema clienti** (non un identificativo separato): al salvataggio, se il telefono inserito non corrisponde a un contatto esistente del business, `Tavoli.jsx` (funzione `ensureContact`) crea automaticamente una riga in `contacts` (`source='ristorante'`) — stesso identificativo (telefono normalizzato) di tutto il resto del progetto, così il cliente compare subito in `Clienti.jsx` indipendentemente da dove sia arrivato. Se il telefono corrisponde già, non duplica — best-effort, un suo errore non blocca il salvataggio della prenotazione. Ricerca del cliente nel form: stesso pattern debounced di `handleNameChange` in `Agenda.jsx` (nome O telefono, merge di `contacts`+`appointments`, deduplicato per telefono), agganciato al campo "Cliente" — non "Telefono": la prima versione l'aveva agganciato al campo sbagliato, corretto dopo verifica del comportamento con l'utente.
- ⚠️ **Non collegata a `PromemoriaClienti.jsx`**: quella sezione (promemoria WhatsApp) legge solo `appointments`, non questa tabella — un cliente con una prenotazione tavolo per oggi non compare nei promemoria. Verificato esplicitamente, non esteso di proposito (in attesa di una decisione separata dell'utente).
- **Nessun controllo di doppia prenotazione**: lo stesso tavolo può avere più righe confermate per la stessa combinazione (data, turno) — nessuna UI né vincolo DB lo impedisce, scelta esplicita ("versione semplice funzionante prima di una complessa incompleta").

#### `tables` — verticale `'ristorante_bar'`
Piantina tavoli — verticale `'ristorante_bar'`. Creata da `20260921_ristorante_tables.sql`. **Ha avuto una colonna `status`** (libero/occupato persistito, tra `20260921_ristorante_tables_status.sql` e `20260922_table_reservations_turns.sql`) **poi rimossa**: vedi Cronologia nella sezione "Verticali" a inizio documento per il perché — non è un refuso di questo documento, la colonna è stata davvero droppata.

| Colonna | Tipo | Default | Null | Note |
|---|---|---|---|---|
| id | uuid | `gen_random_uuid()` | NO | PK |
| business_id | uuid | — | NO | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | — | NO | es. "Tavolo 3"; il pulsante "+ Aggiungi N tavoli" in `Tavoli.jsx` crea più righe in un colpo solo con nome automatico "Tavolo N" in sequenza, a partire dal numero di tavoli già esistenti (mai da 1, per non creare doppioni di nome), capienza di default 4 |
| capacity | int | — | YES | |
| is_active | boolean | `true` | NO | mai un DELETE reale — disattivazione con conferma a due passaggi |
| created_at | timestamptz | `now()` | NO | |

- **Indici**: PK, `idx_tables_business_id`.
- **RLS**: `tables: owner all` (ALL, via `businesses.user_id = auth.uid()`).
- **Stato del tavolo: non è una colonna.** Sempre calcolato al volo per l'esatta combinazione tavolo+data+turno, TRE stati da Blocco C in poi (prima erano due, libero/occupato) — vedi `table_orders` per la definizione completa di LIBERO/PRENOTATO/OCCUPATO, principio generale in "Verticali".

#### `analytics_events` — dichiarata ma **non esistente in produzione**
`schema.sql` (righe 158-172) dichiara questa tabella con indici e 2 policy (owner read + public insert per tracking anonimo), ma l'audit di produzione del 16/08 **non l'ha trovata** tra le tabelle reali, e nessuna chiamata `.from('analytics_events')` esiste nel codice attuale. Se si usa `schema.sql` per bootstrappare un ambiente nuovo, questa parte viene creata comunque (nessun errore) ma non riflette lo stato di produzione. **Non contarla tra le tabelle reali** — 19 fotografate dall'audit del 16/08 + `pets` (20/09) sono in master; il verticale `ristorante_bar` ne aggiunge altre 13: `business_courses`, `business_turns`, `kitchen_stations`, `menu_categories`, `menu_items`, `menu_item_flags`, `stock_closures`, `stock_movements`, `table_order_items`, `table_orders`, `table_reservation_tables`, `table_reservations`, `tables` — 33 in totale.

---

### 3. RLS — policy legacy duplicate (non in nessuna migration)

Oltre alle policy elencate per tabella sopra, la produzione porta ancora policy "storiche" (pre-esistenti alla cartella `migrations/`, quindi non ricreabili da una migration) che **coesistono** con le policy più recenti sulla stessa tabella, con condizioni equivalenti (nessun conflitto di sicurezza, solo ridondanza):

| Tabella | Policy legacy | Duplica |
|---|---|---|
| `businesses` | `"Users can insert own business"`, `"Users can update own business"`, `"Users can view own business"` | `businesses: owner access` |
| `appointments` | `"Appointments visibili solo al proprietario"` | `appointments: owner access` |
| `employees` | `"Employees visibili solo al proprietario"` | `employees: owner access` |
| `reviews` | `"Users can manage own reviews"` | `reviews: owner access` |
| `services` | `"Users can manage own services"` | `services: owner access` |
| `social_drafts` | `"Users can manage own social drafts"` | `social_drafts: owner access` |
| `site_content` | `"Site content leggibile pubblicamente"` | `site_content: public read` |
| `affiliates` | `"Chiunque può fare richiesta affiliato"` | (nessun duplicato diretto, ma stesso intento di `INSERT` pubblico) |

Se si ricrea il DB da zero seguendo **solo** `schema.sql` + `migrations/`, queste policy legacy **non vengono ricreate** — non è un problema di sicurezza (le versioni "ufficiali" coprono le stesse condizioni), ma il comportamento sarà lievemente più pulito (una sola policy per condizione) rispetto alla produzione storica.

---

### 4. Funzioni / RPC / Trigger

Tutte `SECURITY DEFINER` tranne dove indicato, con `search_path = public` esplicito (buona pratica anti hijacking di search_path).

#### `create_booking(...)` — funzione pubblica di creazione prenotazione
**Definizione corrente** (unica firma rimasta, 9 parametri — l'overload legacy a 8 parametri, privo dei controlli di hardening, è stato rimosso da `20260807_drop_create_booking_8params.sql`):

```sql
create_booking(
  p_business_id    uuid,
  p_service_id     uuid,
  p_customer_name  text,
  p_customer_email text,
  p_date           date,
  p_time           time,
  p_customer_phone text default null,
  p_service_names  text default null,
  p_service_ids    uuid[] default null
) returns uuid
```

Logica (versione hardening, `20260806_create_booking_hardening.sql`, che ha aggiunto controlli SENZA rimuovere quelli precedenti):
1. `pg_advisory_xact_lock` su hash(business_id + data) — serializza le richieste concorrenti sullo stesso business+giorno, rilasciato automaticamente a fine transazione.
2. Rifiuta date nel passato (`p_date < current_date`).
3. Valida il formato email (regex) e, se presente, del telefono.
4. Valida i servizi: se `p_service_ids` è valorizzato, **tutti** i servizi devono esistere/essere disponibili per quel business (multi-servizio); altrimenti valida `p_service_id` singolo. Calcola la durata totale.
5. Valida che l'orario richiesto rientri **interamente** in una fascia di apertura attiva di `businesses.opening_hours` per quel giorno della settimana (specchio server-side della logica client in `BookingSection.jsx`), con fallback al formato "vecchio" `{open,close}` o a 09:00-18:00 se mancante.
6. Anti-doppione: rifiuta se esiste già un `pending` per la stessa email sullo stesso business.
7. Backstop anti-flood: rifiuta se il business ha già ≥200 booking `pending` totali, o se ne ha ricevuti ≥20 negli ultimi 10 minuti.
8. Check capacità: conta gli slot sovrapposti (via `get_taken_slots`) e rifiuta se ≥ `businesses.booking_capacity`.
9. Insert della riga `bookings` con `status='pending'`.

**Permessi**: dopo `20260806_create_booking_revoke_anon.sql`, l'esecuzione è **revocata** a `public`/`anon`/`authenticated` e concessa **solo** a `service_role` — l'unico chiamante è la Edge Function `create-booking` (che applica anche la verifica Cloudflare Turnstile prima di invocare la RPC). `BookingSection.jsx` non chiama più la RPC direttamente.

**Storia delle versioni** (per completezza, tutte sovrascritte dalla corrente): v1 `20260509` (nome `confirm_booking`, richiedeva OTP via `auth.email()`, creava subito l'appuntamento) → v2 `20260512` (rinominata `create_booking`, rimosso OTP, salva solo `pending`) → v3 `20260519_booking_services`/`20260610_booking_capacity` (parametri riordinati, check capacità) → v4 `20260719_create_booking_advisory_lock` (advisory lock) → v5 `20260719_booking_multi_service` (parametro `p_service_ids`) → v6 `20260806_create_booking_hardening` (corrente).

#### `get_taken_slots(p_business_id uuid, p_date date)` — SECURITY DEFINER, `language sql`
Restituisce `table(start_time time, duration_minutes int)`: unione di (a) gli `appointments` confermati per quel giorno e (b) i `bookings` ancora `pending` per quello stesso giorno, con la durata calcolata dal/dai servizio/i collegati (fallback 60 minuti se mancante). Usata da `create_booking` per il check di capacità e da `BookingSection.jsx` (RPC diretta, pubblica) per calcolare gli slot liberi lato client. **Resta pubblica** (`grant ... to anon, authenticated`) anche dopo la revoca di `create_booking`, perché espone solo orari/durate, non dati personali.

#### `owner_confirm_booking(p_booking_id uuid)` — SECURITY DEFINER
Solo il titolare autenticato (verificato via join `bookings → businesses` su `businesses.user_id = auth.uid()`). Passi: verifica che la prenotazione esista e sia ancora `pending`; calcola durata/prezzo totali (somma se multi-servizio via `service_ids`, altrimenti singolo `service_id`); aggiorna `bookings.status = 'confirmed'`; inserisce la riga `appointments` corrispondente (con `client_phone`, `booking_id`); se multi-servizio, popola anche `appointment_services` con lo snapshot prezzo/durata di ciascun servizio. Concessa solo a `authenticated`. Chiamata da `Agenda.jsx:553`.

#### `validate_affiliate_code()` — SECURITY DEFINER, trigger BEFORE INSERT OR UPDATE OF affiliate_code ON `businesses`
Introdotta da `20260816_affiliate_code_on_suffix_validation.sql` per sostituire la ex-FK rigida `businesses_affiliate_code_fkey`. Se `NEW.affiliate_code` è NULL/vuoto, passa (normalizzato a NULL). Altrimenti strippa un eventuale suffisso `-on` finale e verifica che il codice base esista (case-insensitive) in `affiliates.code`; se non esiste, solleva `'AFFILIATE_CODE_INVALID: nessun affiliato con codice %'` — marcatore riconosciuto esplicitamente da `Onboarding.jsx` per mostrare un messaggio dedicato all'utente. `SECURITY DEFINER` perché chi si registra non ha permessi RLS di lettura su `affiliates`.
Trigger: `trg_businesses_validate_affiliate_code`.

#### `set_updated_at()` — trigger generico, INVOKER
```sql
begin
  new.updated_at = now();
  return new;
end;
```
Riusato da 7 trigger: `trg_businesses_updated_at`, `trg_services_updated_at`, `trg_site_content_updated_at`, `trg_social_drafts_updated_at`, `trg_reviews_updated_at`, `trg_reminders_updated_at`, `trg_appointments_updated_at`.

#### `stock_closure_proposal(p_business_id uuid)` — SECURITY INVOKER, `language sql`, STABLE
Blocco E (`20260927_stock_and_costs.sql`). Restituisce in un colpo solo **il confine contabile** (`period_end` = `now()` del database, mai del dispositivo), il confine della chiusura precedente (`'-infinity'` se è la prima) e, per **ogni** prodotto tracciato del business, i pezzi venduti nella finestra `sent_received_at > previous_end AND <= period_end` — anche zero, così il titolare può correggere in su un venduto che il sistema non ha visto. Esclude le voci annullate e quelle senza `menu_item_id` (piatto cancellato dal catalogo: non attribuibile a nessuna giacenza). Restituisce anche il costo dell'ultimo carico per prodotto.

Usata in **due** punti con lo stesso identico calcolo, di proposito: la schermata "Chiudi conteggio" e la stima attuale delle giacenze mostrata in `Scorte.jsx`/`Menu.jsx` (via `src/lib/stock.js`) — così ciò che vedi e ciò che verrà scalato non possono divergere. Essendo SECURITY INVOKER, le RLS fanno l'isolamento: passare l'id di un altro business restituisce zero righe.

#### `stock_closure_confirm(p_business_id uuid, p_previous_end timestamptz, p_period_end timestamptz, p_items jsonb)` — SECURITY INVOKER, plpgsql
Blocco E. Conferma **atomica** della chiusura: inserisce la riga in `stock_closures` e tutti i movimenti `vendita` (quantità negativa, `unit_cost` = ultimo carico del momento, `closure_id` valorizzato) in una sola transazione. Esiste perché `supabase-js` non ha transazioni multi-statement: due chiamate separate lascerebbero, al primo errore di rete, una chiusura senza movimenti — venduto mai scalato e finestra successiva che riparte da dopo, cioè venduto perso.

Tre difese, in quest'ordine:
1. `pg_advisory_xact_lock(hashtextextended('stock_closure:' || business_id, 0))` **prima** di leggere il confine precedente — stesso pattern di `create_booking`. Senza, due conferme simultanee leggerebbero entrambe lo stesso `max(period_end)` (nessuna vede l'insert non committato dell'altra) e scalerebbero due volte la parte di finestra in comune.
2. Controllo di concorrenza ottimistico: se `max(period_end)` non è più uguale a `p_previous_end` (la proposta è stata calcolata prima che un altro dispositivo chiudesse), rifiuta con un messaggio che invita a ricalcolare la proposta.
3. Verifica che ogni `menu_item_id` appartenga davvero a quel business — le due FK sono indipendenti e nessun vincolo DB lo garantirebbe da solo (stessa lacuna documentata per `table_reservation_tables`, qui chiusa).

Le quantità a zero non producono movimenti (il CHECK `quantity <> 0` le rifiuterebbe). Permessi: `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated` — revocare solo da `anon` non basterebbe, perché una funzione nasce con EXECUTE a PUBLIC e `anon` lo eredita.

#### `stock_report(p_business_id uuid, p_from timestamptz, p_to timestamptz, p_group text, p_timezone text)` — SECURITY INVOKER, `language sql`, STABLE
Blocco E (`20260928_stock_reports.sql`). Incasso, costo e margine aggregati per giorno, mese o chiusura (`p_group` = `'day'`\|`'month'`\|`'closure'`), con costo **reale** e **stimato** sempre su colonne separate, più il conteggio e l'incasso delle voci senza costo inserito. `p_to` è esclusivo.

Due scelte da non perdere di vista:
- **Aggregazione nel database, non nel codice**: un mese di servizio supera facilmente le migliaia di voci e PostgREST tronca a 1000 righe per default — aggregare lato client vorrebbe dire paginare migliaia di righe, o peggio mostrare un totale silenziosamente sbagliato.
- **Il fuso è un PARAMETRO, non è cablato**: `p_timezone` ha default `'Europe/Rome'` ma l'applicazione passa sempre `BUSINESS_TIMEZONE` da `src/lib/datetime.js`, che resta l'unica fonte di verità. Il raggruppamento usa `sent_at AT TIME ZONE p_timezone` + `date_trunc`, quindi segue il calendario **italiano**: una voce inviata alle 00:30 del 28 in Italia finisce nel giorno 28 anche se in UTC è ancora il 27, sia in ora legale sia in ora solare. Il raggruppamento per chiusura usa invece `sent_received_at`, perché è su quello che sono definite le finestre.

#### `set_sent_received_at()` — trigger BEFORE INSERT OR UPDATE ON `table_order_items`
Blocco E. Scrive `sent_received_at` con `now()` del database **solo** nella transizione "non inviata → inviata" (`sent_at` da NULL a un valore); su update successivi della stessa riga conserva il valore originale, e se `sent_at` tornasse NULL lo azzera. Sovrascrive sempre qualunque valore mandato dal client — è il modo con cui "il client non la scrive mai" è garantito dallo schema e non dalla buona volontà del codice applicativo. Trigger: `trg_table_order_items_sent_received_at`.

#### `check_stock_closure_boundary()` — trigger BEFORE INSERT ON `stock_closures`
Blocco E. Rifiuta un `period_end` nel futuro (inghiottirebbe vendite non ancora arrivate — sintomo tipico di un confine preso dall'orologio del dispositivo invece che del database) o non successivo a quello dell'ultima chiusura (riconterebbe una finestra già chiusa). Trigger: `trg_stock_closures_boundary`.

#### Trigger `on_new_booking` (AFTER INSERT ON `bookings`)
Non è una funzione PL/pgSQL propria: chiama l'utility di sistema `supabase_functions.http_request(url, method, headers, body, timeout_ms)` per invocare in modo asincrono l'Edge Function `notify-new-booking`, passando l'header `X-Webhook-Secret` (il cui valore reale, in produzione, è incorporato in chiaro nella definizione del trigger). Storia: creato inizialmente con un header `Authorization` che causava 401 (la funzione ha `verify_jwt=false`) — rimosso da `20260519_fix_trigger_notify.sql`; il secret è stato aggiunto in produzione il 06/07 e documentato (con placeholder) da `20260719_trigger_notify_secret.sql`.

#### Funzioni rimosse (solo per cronaca, non eseguibili oggi)
- `confirm_booking(...)` — versione v1 con verifica OTP via `auth.email()`, rimossa da `20260512_booking_v2.sql`.
- `create_booking(uuid, uuid, text, text, text, date, time)` (7 parametri, ordine originale) — rimossa da `20260519_booking_services.sql`.
- `create_booking(uuid, uuid, text, text, date, time, text, text)` (8 parametri, senza `p_service_ids`) — rimossa da `20260807_drop_create_booking_8params.sql`.

#### Estensioni installate
- `uuid-ossp` (`schema.sql`) — fornisce `uuid_generate_v4()`, usata come default PK in molte tabelle (le più recenti usano invece `gen_random_uuid()`, nativa di Postgres 13+, senza bisogno di estensione — le due funzioni coesistono nel DB).
- `pg_trgm` (`20260520_performance_indexes.sql`) — abilita gli indici GIN trigram (`idx_contacts_name_trgm`, `idx_appointments_client_name_trgm`, `idx_pets_name_trgm` — quest'ultimo aggiunto da `20260921_pets_size_and_appointment_link.sql`) per ricerca fuzzy `ILIKE '%...%'`; installa ~24 funzioni interne (`similarity`, `gtrgm_*`, ecc.), non custom, non da documentare come oggetti applicativi.

---

*Fine Fase 2.*

---

## FASE 3 — Edge Functions e servizi esterni

### 0. Metodologia
Le 6 Edge Function sono state lette per intero (non solo l'intestazione). Per la mappa degli agganci esterni ho cercato in tutto `src/` e `supabase/functions/` ogni chiamata a `supabase.auth.*`, `supabase.storage.*`, `supabase.channel(...)`, `supabase.functions.invoke(...)`, ogni `fetch()` verso un dominio esterno, e ogni variabile d'ambiente (`import.meta.env.VITE_*` lato frontend, `Deno.env.get(...)` lato Edge Function).

---

### 1. Le 6 Edge Function, passo-passo

#### `claude-proxy` — `verify_jwt`: **true** (default)
**Scopo**: proxy autenticato verso l'API Anthropic (Claude), con rate-limit a token mensile per business. È l'unico punto da cui il frontend genera contenuti AI (descrizione onboarding, post social, risposte alle recensioni).

1. Legge l'header `Authorization` (obbligatorio) e crea un client Supabase con quel token per identificare l'utente (`auth.getUser()`); se manca o non è valido → 401.
2. Legge `prompt` dal body JSON; rifiuta se assente, vuoto o >20.000 caratteri.
3. Carica il business dell'utente (`businesses.ai_tokens_month`, `ai_calls_month`, `ai_calls_month_display`, `ai_calls_total`, `ai_unlimited`, `ai_reset_date`).
4. Calcola se serve il reset mensile (mese corrente ≠ mese di `ai_reset_date`); se il business non ha `ai_unlimited=true` e ha già raggiunto `TOKEN_LIMIT = 350_000` token nel mese corrente → **429** `AI_LIMIT_REACHED`.
5. Chiama `POST https://api.anthropic.com/v1/messages` (modello `claude-sonnet-4-6`, `max_tokens: 1000`, timeout 25s) con l'header `x-api-key: CLAUDE_API_KEY`.
6. Se Anthropic risponde errore → 502 con dettaglio.
7. Aggiorna in modo fire-and-forget (non blocca la risposta) i contatori del business (`ai_tokens_month`, `ai_calls_month_display`, `ai_calls_month`, `ai_calls_total`, ed `ai_reset_date` se è scattato il reset mensile).
8. Risponde `{ text }` col solo testo generato.

**Input**: `{ prompt: string }` + header `Authorization: Bearer <access_token utente>`.
**Output**: `{ text: string }` oppure `{ error, message? }`.
**Secret usati**: `CLAUDE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
**Servizi esterni chiamati**: **Anthropic API** (`api.anthropic.com`).

#### `create-booking` — `verify_jwt`: **true** (default, ma pensata per essere invocata anche senza sessione utente — vedi nota)
**Scopo**: unico punto d'ingresso pubblico per creare una prenotazione dal mini-sito; applica l'anti-bot Cloudflare Turnstile prima di chiamare la RPC `create_booking` con privilegi di `service_role` (che bypassano i grant `anon`/`authenticated`, revocati sulla RPC da `20260806_create_booking_revoke_anon.sql`).

1. Accetta solo `POST` (gestisce `OPTIONS` per CORS).
2. Se `TURNSTILE_SECRET_KEY` è configurato: richiede `turnstile_token` nel body, lo verifica con `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` (passando anche l'IP client, letto da `cf-connecting-ip` o `x-forwarded-for`); se manca o non è valido → 400/403. Se il secret **non** è configurato, salta la verifica (rollout in due tempi, funzione resta operativa ma senza anti-bot).
3. Valida che i campi obbligatori (`business_id`, `service_id`, `customer_name`, `customer_email`, `date`, `time`) siano stringhe presenti.
4. Crea un client Supabase con `SUPABASE_SERVICE_ROLE_KEY` e chiama `supabase.rpc('create_booking', {...})` passando tutti i parametri incluso l'opzionale `p_service_ids` (multi-servizio).
5. Se la RPC solleva uno degli errori "noti" (`KNOWN_BOOKING_ERRORS`, es. "Servizio non disponibile", "Orario fuori dagli orari di apertura"...) lo inoltra verbatim al client (400); qualunque altro errore Postgres viene mascherato con un messaggio generico (500) per non far trapelare dettagli interni dello schema.
6. Risponde `{ id: <booking_id> }`.

**Input**: `{ business_id, service_id, customer_name, customer_email, date, time, customer_phone?, service_names?, service_ids?, turnstile_token? }` — **nessun header Authorization richiesto per il flusso applicativo**: è la stessa Edge Function ad autenticarsi verso Supabase con la service role key, non verso l'utente finale (chiamata pubblica dal sito, `BookingSection.jsx`).
**Output**: `{ id: uuid }` oppure `{ error: string }`.
**Secret usati**: `TURNSTILE_SECRET_KEY` (opzionale), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
**Servizi esterni chiamati**: **Cloudflare Turnstile** (`challenges.cloudflare.com/turnstile/v0/siteverify`).

#### `notify-new-booking` — `verify_jwt`: **false** (esplicito in `config.toml`)
**Scopo**: invocata dal trigger DB `on_new_booking` (AFTER INSERT su `bookings`) per inviare una notifica push al titolare quando arriva una nuova prenotazione pending. Non è mai chiamata dal frontend.

1. Verifica l'header `X-Webhook-Secret` contro `NOTIFY_WEBHOOK_SECRET` con confronto a tempo costante (`crypto.subtle.timingSafeEqual`); se assente/errato → 401.
2. Legge il body (payload del trigger, `{record: {...}}` o il booking diretto); se `status !== 'pending'` esce subito (200, "skip") — evita notifiche per righe non pending.
3. Legge `push_subscriptions` per il `business_id` della prenotazione; se nessuna subscription → 200 `{result: 'no_subscribers'}`.
4. Configura `web-push` con `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` e `mailto:info@piumapp.com`.
5. Invia in parallelo (`Promise.all`, timeout 5s ciascuna) una notifica push a ogni subscription (`title: 'Nuova prenotazione'`, deep-link a `/dashboard?s=agenda`).
6. Se una subscription risponde 410 (Gone, scaduta) la raccoglie e la elimina da `push_subscriptions` a fine ciclo.
7. Risponde `{ sent, failed, stale }` (500 solo se tutte le push sono fallite e nessuna inviata).

**Input**: payload del trigger DB (booking appena inserito) + header `X-Webhook-Secret`.
**Output**: `{ sent, failed, stale }` o `{ error }`.
**Secret usati**: `NOTIFY_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
**Servizi esterni chiamati**: **Web Push** (libreria `web-push`, protocollo standard verso gli endpoint push dei browser — es. FCM per Chrome/Android, servizio Apple per Safari — nessuna chiave API di terze parti oltre alle chiavi VAPID generate da PIUM stesso).

#### `stripe-checkout` — `verify_jwt`: **true** (default)
**Scopo**: crea (o riusa) un Customer Stripe per il business dell'utente autenticato e apre una sessione di Stripe Checkout per l'abbonamento, applicando lo sconto del canale affiliato "-on" quando pertinente.

1. Verifica `Authorization`, ottiene l'utente da Supabase Auth (con service role key, non anon).
2. Legge il business dell'utente (`id, stripe_customer_id, affiliate_code, plan_price`); 404 se non esiste.
3. Se il business non ha ancora un `stripe_customer_id`, crea un Customer Stripe (`POST /v1/customers`, con `metadata.supabase_user_id`/`metadata.business_id`) e lo salva sul business.
4. **Anti-doppio-addebito**: interroga `GET /v1/subscriptions?customer=...&status=all` e, se trova già una subscription `active`/`trialing`, riallinea `businesses.status`/`stripe_subscription_id` a quello stato reale su Stripe e risponde `{ already_active: true }` **senza aprire un secondo checkout**.
5. Altrimenti crea la sessione (`POST /v1/checkout/sessions`, `mode=subscription`, `line_items[0][price]=STRIPE_PRICE_ID`, `success_url`/`cancel_url` verso `APP_URL`, `locale=it`); se `affiliate_code` termina in `-on` (case-insensitive), applica `discounts[0][coupon] = STRIPE_COUPON_ON`.
6. Risponde `{ url: <checkout_session_url> }` — il frontend fa un semplice redirect (`window.location.href`), **nessuna libreria Stripe.js coinvolta**.

**Input**: nessun body, solo header `Authorization: Bearer <access_token utente>`.
**Output**: `{ url }` oppure `{ already_active: true }` oppure `{ error }`.
**Secret usati**: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_COUPON_ON` (opzionale), `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
**Servizi esterni chiamati**: **Stripe API** (`api.stripe.com` — Customers, Subscriptions, Checkout Sessions).

#### `stripe-webhook` — `verify_jwt`: **false** (esplicito in `config.toml`, obbligatorio: Stripe non manda un JWT Supabase)
**Scopo**: riceve gli eventi Stripe e tiene sincronizzato lo stato di abbonamento del business, oltre a registrare le commissioni affiliato mensili.

1. Legge il body raw e l'header `stripe-signature`; verifica la firma **con Web Crypto nativo** (HMAC-SHA256, nessun SDK Stripe) confrontando contro `STRIPE_WEBHOOK_SECRET`, con **rifiuto di webhook più vecchi di 5 minuti** (anti-replay) e confronto a tempo costante; firma non valida → 400.
2. Gestisce 4 tipi di evento:
   - **`checkout.session.completed`**: trova il business per `stripe_customer_id`, imposta `status='active'`, `plan='active'`, salva `stripe_subscription_id`; se c'è un `trial_end` sulla subscription (letta con `GET /v1/subscriptions/:id`), lo salva in `trial_ends_at`.
   - **`customer.subscription.updated`**: mappa lo `status` Stripe → status PIUM (`trialing→trial`, `active→active`, `past_due→suspended`, `canceled→expired`) e aggiorna il business.
   - **`customer.subscription.deleted`**: imposta `status='expired'`, `plan='free'`.
   - **`invoice.paid`**: (a) se il business non è già `active`, rilegge la subscription reale su Stripe e riallinea lo status locale se risulta `active`/`trialing` (protegge da disallineamenti, es. blocco admin manuale su un cliente in realtà ancora regolare); (b) se `amount_paid` è mancante o ≤0, **skip esplicito** (nessuna riga a 0 registrata, `c6ba13e`); (c) se il business ha un `affiliate_code` e `amount_paid` è valido, calcola il numero di mensilità già commissionate (`count` su `affiliate_commissions`), determina l'importo con `commissionFor(amountPaidCents, monthNumber)` — **percentuale sull'importo REALMENTE fatturato** (`invoice.amount_paid`, non più un importo fisso per canale): 30% per i primi 12 mesi, 15% dal 13° mese a vita, **nessun tetto** — e inserisce una riga in `affiliate_commissions` con `status='pending'`; un insert duplicato (stesso `stripe_invoice_id`, retry di Stripe) viene riconosciuto dal codice errore Postgres `23505` e ignorato silenziosamente (non è un errore per il chiamante). Modello a percentuale introdotto da `c6ba13e` (era: importo fisso 29,99€ canale pieno / 19,99€ canale "-on"): canale FULL/ON pagano prezzi diversi, quindi la commissione differisce già di conseguenza senza bisogno di una tariffa separata per canale. **Non deployato**: resta solo nel repo finché non si aggiornano manualmente `STRIPE_PRICE_ID`/`STRIPE_COUPON_ON` su Stripe Dashboard e si verifica con un pagamento di test.
3. Risponde sempre `{received:true}` (200) agli eventi gestiti con successo, anche quando una scrittura secondaria (es. commissione) fallisce in modo "non-blocking" — Stripe non deve ritentare l'evento principale.

**Input**: body raw dell'evento Stripe + header `stripe-signature`.
**Output**: `{received:true}` o `{error}`.
**Secret usati**: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
**Servizi esterni chiamati**: **Stripe API** (verifica webhook via Web Crypto — nessuna chiamata HTTP per la verifica firma; chiamata HTTP `GET /v1/subscriptions/:id` per rileggere lo stato reale in due punti).

#### `approve-affiliate` — `verify_jwt`: **true** (default) + controllo ruolo applicativo
**Scopo**: unico canale per cambiare lo stato di un affiliato (`pending`→`approved`/`rejected`), da quando la policy RLS che lo permetteva direttamente è stata rimossa (`20260719_drop_affiliates_all_policy.sql`). Invia anche l'email di approvazione.

1. Verifica che tutte le env var richieste siano presenti (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) — se manca qualcosa, 500 esplicito con l'elenco.
2. Estrae il bearer token, verifica l'utente con un client **anon** (`auth.getUser(token)`), poi controlla `user.app_metadata.role === 'admin'` — se non admin, 403.
3. Valida `affiliate_id` (stringa) e `target_status` (deve essere uno tra `pending`/`approved`/`rejected`).
4. Con un client **service role**, legge l'affiliato (`id, name, email, status, approved_email_sent_at`), poi aggiorna `status = target_status`.
5. Se il nuovo stato è `'approved'`, lo stato precedente era `'pending'` e non è già stata mandata un'email di approvazione (`approved_email_sent_at IS NULL`): invia l'email via **Resend** (`POST https://api.resend.com/emails`, con `Idempotency-Key: affiliate-approved-<id>` per evitare doppie email in caso di retry) e poi aggiorna `approved_email_sent_at`.
6. Risponde con lo stato applicato e se l'email è stata inviata.

**Input**: `{ affiliate_id, target_status }` + header `Authorization: Bearer <access_token admin>`.
**Output**: `{ updated, email_sent, previous_status, status }` oppure `{ error, detail? }`.
**Secret usati**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `FROM_EMAIL` (default `PIUM <no-reply@piumapp.com>`).
**Servizi esterni chiamati**: **Resend** (`api.resend.com`, invio email transazionale).

---

### 2. Mappa degli agganci esterni

Organizzata per servizio. Ogni riga: dove nel codice, cosa fa. Questa è la mappa da usare per capire cosa va riscritto/sostituito per portare PIUM su un'infrastruttura diversa da Supabase/Stripe/Anthropic/Cloudflare/Resend.

#### Supabase — Auth
| Dove | Cosa fa |
|---|---|
| `src/lib/supabase.js` | istanzia il client (`createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`), condiviso da tutta l'app |
| `App.jsx:35,48` | `getSession()` per instradare `PublicRoute` (redirect a `/dashboard` se già loggato) e per `NotificationScheduler` |
| `Auth.jsx:36,70,81,251` | `getSession()` (redirect se già loggato), `signInWithPassword`, `signUp`, `resetPasswordForEmail` |
| `AdminLogin.jsx:18,30` | `signInWithPassword` per l'accesso admin separato, `signOut` in caso di fallimento post-check ruolo |
| `AffiliatesAuth.jsx:36,56,66` | `getSession`, `signInWithPassword`, `signUp` (per affiliati) |
| `ResetPassword.jsx:16,37,46` | `getSession` (verifica token di recovery), `updateUser({password})`, `signOut` post-reset |
| `Settings.jsx:57,120,136,145,151,159` | `getUser`, `updateUser({email})`, `signInWithPassword` (ri-autenticazione prima di cambiare password), `updateUser({password})`, `signOut`, `signOut({scope:'global'})` (revoca tutte le sessioni) |
| `Dashboard.jsx:76,109` | `getUser`, `signOut` |
| `Admin.jsx:120,486` | `getUser` (verifica ruolo admin dal JWT), `signOut` |
| `Affiliates.jsx:32,148` | `getSession`, `signOut` |
| `Onboarding.jsx:84,146` | `getUser` (due punti del wizard) |
| `SubscriptionGate.jsx:13` | `signOut` (unica via d'uscita per un account bloccato) |
| `Promemoria.jsx:149` | `getUser` (per popolare `user_id` sull'insert di un reminder) |
| `lib/useStripeCheckout.js:15`, `lib/pushSubscription.js:27,58`, `lib/claude.js:6` | `getSession` per recuperare l'`access_token` da passare come `Authorization` alle Edge Function |
| Edge Functions (`claude-proxy`, `stripe-checkout`, `approve-affiliate`) | `supabase.auth.getUser(token)` lato server per identificare/autorizzare il chiamante |
| **Ruolo admin** | non è una tabella `roles`: è il claim `app_metadata.role === 'admin'` dentro il JWT Supabase, controllato sia lato RLS (`auth.jwt() -> 'app_metadata' ->> 'role'`) sia lato Edge Function (`user.app_metadata?.role`) — va impostato a mano sull'utente Supabase (Dashboard o Admin API), non esiste un flusso applicativo per promuovere un admin |

#### Supabase — Database (Postgres via `postgrest`)
Coperto in dettaglio dalla **Fase 2**. In sintesi: ogni pagina/componente legge/scrive direttamente le tabelle via client `supabase.from(...)` con RLS a proteggere l'accesso (nessun backend REST/GraphQL proprietario) — è l'accoppiamento più profondo con Supabase: sostituire il DB significa riscrivere ogni chiamata `.from()` sparsa in ~25 file frontend oltre alle RPC e ai trigger.

#### Supabase — Storage
| Dove | Cosa fa |
|---|---|
| `EditorSito.jsx:310-312` | upload immagine di copertina (bucket `site-images`, `upsert:true`) |
| `EditorSito.jsx:320-322` | `getPublicUrl` per l'immagine di copertina appena caricata |
| `EditorSito.jsx:453-455` | upload immagine galleria (bucket `site-images`, niente `upsert`: ogni immagine è un file nuovo) |
| `EditorSito.jsx:462` | `getPublicUrl` per l'immagine galleria |
| `EditorSito.jsx:614-616,624` | upload/getPublicUrl per il logo/foto profilo del business |
| — | **Unico bucket usato: `site-images`**. Nessuna chiamata `.remove()` trovata: le immagini rimosse dalla galleria lato UI restano orfane nello storage (non vengono mai cancellate fisicamente) |
| — | Le immagini vengono compresse client-side (`browser-image-compression`) **prima** dell'upload, per ridurre banda/storage |

#### Supabase — Realtime
| Dove | Cosa fa |
|---|---|
| `Dashboard.jsx:208-219` | `supabase.channel('pending-bookings-<businessId>').on('postgres_changes', {event:'INSERT', table:'bookings', filter:'business_id=eq.<id>'}, ...)` — riceve in diretta le nuove prenotazioni pending per aggiornare il badge/contatore senza refresh; richiede `alter publication supabase_realtime add table bookings` (`20260514_realtime_bookings.sql`) |
| 🟡 `src/lib/kitchenRealtime.js` — verticale `'ristorante_bar'` | `subscribeTableOrderItems()`: `supabase.channel(...).on('postgres_changes', {event:'*', table:'table_order_items'}, ...)` **senza filtro** `business_id` (la tabella non ha quella colonna diretta — RLS via join, vedi `table_order_items`); usata da `Cucina.jsx`/`Ordine.jsx`/`Tavoli.jsx`, ogni evento ricarica lo stato completo invece di applicare il payload. Richiede `alter publication supabase_realtime add table table_order_items` (`20260924_kitchen_courses_stations.sql`, riga non idempotente). `subscribeCallSala()`/`sendCallSala()`: canale **broadcast** dedicato per business (`kitchen-call-<businessId>`), nessuna riga DB — "Chiama sala" da `Cucina.jsx` verso `Tavoli.jsx`/`Ordine.jsx` |

#### Supabase — Edge Functions (invocazione dal frontend)
| Dove | Cosa fa |
|---|---|
| `Admin.jsx:361` | `supabase.functions.invoke('approve-affiliate', {body:{affiliate_id, target_status}})` |
| `lib/claude.js` | chiama `claude-proxy` con `fetch()` diretto (non `functions.invoke`) verso `${VITE_SUPABASE_URL}/functions/v1/claude-proxy`, header `Authorization` manuale |
| `lib/useStripeCheckout.js:21-30` | `fetch()` diretto verso `.../functions/v1/stripe-checkout` |
| `BookingSection.jsx` (`BOOKING_ENDPOINT`) | `fetch()` diretto verso `.../functions/v1/create-booking`, **senza** header Authorization utente (endpoint pubblico) |
| `lib/pushSubscription.js` | non chiama una function propria, ma usa `getSession()` per il token da altri flussi (nessuna Edge Function dedicata alle subscription: l'insert/delete su `push_subscriptions` avviene via `.from()` diretto) |

#### Stripe
| Dove | Cosa fa |
|---|---|
| `stripe-checkout/index.ts` | crea/riusa Customer, verifica subscription esistenti, crea Checkout Session (API REST diretta via `fetch`, **non** l'SDK `stripe` node nonostante sia in `package.json`) |
| `stripe-webhook/index.ts` | verifica firma webhook (Web Crypto, no SDK), legge lo stato reale di una subscription (`GET /v1/subscriptions/:id`) in due rami (`checkout.session.completed`, `invoice.paid`) |
| `lib/useStripeCheckout.js` | lato frontend, **nessuna chiamata diretta a Stripe**: riceve l'URL della Checkout Session dall'Edge Function e fa un redirect pieno (`window.location.href`) — Stripe Checkout è hosted, non embedded |
| `package.json` | dipendenze `@stripe/stripe-js` (client) e `stripe` (server SDK) **dichiarate ma non importate/usate da nessun file** in questa passata — tutto il codice Stripe usa `fetch()` grezzo verso `api.stripe.com`; verosimile dipendenza morta/residua |
| Webhook Stripe → PIUM | configurato lato dashboard Stripe (fuori dal repo) per puntare a `stripe-webhook`, eventi: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` |

#### Anthropic (Claude)
| Dove | Cosa fa |
|---|---|
| `claude-proxy/index.ts` | unico punto di contatto, `POST https://api.anthropic.com/v1/messages`, modello `claude-sonnet-4-6` |
| `lib/claude.js` (`generateWithClaude`) | wrapper frontend che chiama `claude-proxy`; usato da `Onboarding.jsx` (descrizione attività), `Social.jsx` (bozze post), `Recensioni.jsx` (risposte alle recensioni) |
| — | Nessuna chiave Anthropic esposta al client: `CLAUDE_API_KEY` vive solo nei secret dell'Edge Function |

#### Cloudflare
| Dove | Cosa fa |
|---|---|
| `cloudflare-worker.js` | Worker deployato manualmente su Cloudflare (route `*piumapp.com/*`): proxy trasparente che inoltra le richieste ai sottodomini attività (`mario.piumapp.com`) verso `www.piumapp.com`, lasciando l'hostname originale visibile al browser — `App.jsx`/`main.jsx` lo rilevano e servono `PublicSite` |
| `BookingSection.jsx:97-133` | carica lo script `https://challenges.cloudflare.com/turnstile/v0/api.js`, monta il widget Turnstile (solo se `VITE_TURNSTILE_SITE_KEY` è configurata) nello step di conferma prenotazione |
| `create-booking/index.ts:40-59` | verifica server-side del token Turnstile (`POST https://challenges.cloudflare.com/turnstile/v0/siteverify`) |
| DNS/CDN | dominio `piumapp.com` presumibilmente proxato da Cloudflare (necessario perché il Worker intercetti le richieste) — non verificabile dal codice, solo dedotto dalla presenza del Worker |

#### Resend
| Dove | Cosa fa |
|---|---|
| `approve-affiliate/index.ts:53-99` | unico punto di invio email transazionali: notifica di approvazione candidatura affiliato, `POST https://api.resend.com/emails` |
| — | Nessun altro flusso applicativo invia email da codice PIUM: le email di conferma registrazione/reset password sono gestite **da Supabase Auth stesso** (SMTP/provider configurato lato progetto Supabase, fuori dal repo) |

#### Web Push (VAPID) — standard web, non un "servizio" con account/API key di terzi
| Dove | Cosa fa |
|---|---|
| `lib/pushSubscription.js` | lato client, usa l'API browser `PushManager`/`serviceWorker` per creare la subscription (`VAPID_PUBLIC_KEY` pubblica, passata come `applicationServerKey`), salvata su `push_subscriptions` |
| `notify-new-booking/index.ts` | lato server, usa la libreria `web-push` (npm, via `import webpush from 'npm:web-push'` in Deno) con la chiave privata VAPID per firmare e inviare le notifiche ai browser (che le instradano a loro volta ai servizi push nativi: FCM per Chrome, servizio Apple per Safari — invisibili al codice PIUM) |
| `public/sw.js` | service worker che riceve l'evento `push` e mostra la notifica |

**Convenzione**: la costante `CACHE` in `public/sw.js` (es. `'pium-v2'` → `'pium-v3'`) va incrementata a ogni aggiornamento importante del progetto — l'`activate` handler cancella ogni cache con un nome diverso da quello corrente, così un service worker già installato su un dispositivo si allinea alla versione nuova invece di restare indefinitamente su cache datate. Bump più recente: `2e87c5f` (branch `feature/ristorante-tavoli`, in occasione del Blocco D di `ristorante_bar`) — irrilevante per il verticale in sé, è la convenzione generale del progetto applicata a un aggiornamento che la meritava.

---

### 3. Variabili d'ambiente / secret — elenco completo

**Frontend (`.env`, prefisso `VITE_`, incorporate nel bundle a build-time — non sono segreti, sono chiavi pubbliche per design)**

| Variabile | Usata in | Scopo |
|---|---|---|
| `VITE_SUPABASE_URL` | `lib/supabase.js` + varie Edge Function calls dirette | URL progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `lib/supabase.js`, `BookingSection.jsx` | chiave pubblica Supabase (anon, protetta da RLS) |
| `VITE_TURNSTILE_SITE_KEY` | `BookingSection.jsx` | site key pubblica Cloudflare Turnstile (opzionale: se assente, niente anti-bot lato widget) |
| `VITE_VAPID_PUBLIC_KEY` | `lib/pushSubscription.js` | chiave pubblica VAPID per la subscription push del browser |

**Edge Functions (`Deno.env.get(...)`, secret configurati lato Supabase, mai esposti al client)**

| Secret | Usato da | Scopo |
|---|---|---|
| `SUPABASE_URL` | tutte e 6 | URL progetto (spesso ridondante con l'env auto-iniettata da Supabase) |
| `SUPABASE_ANON_KEY` | `claude-proxy`, `approve-affiliate` | client anon per validare il JWT dell'utente chiamante |
| `SUPABASE_SERVICE_ROLE_KEY` | tutte tranne (nessuna esclusa — anche `claude-proxy`/`stripe-checkout` la usano per bypassare RLS su letture/scritture applicative) | bypass RLS per operazioni con privilegi elevati |
| `CLAUDE_API_KEY` | `claude-proxy` | autenticazione API Anthropic |
| `STRIPE_SECRET_KEY` | `stripe-checkout`, `stripe-webhook` | autenticazione API Stripe |
| `STRIPE_PRICE_ID` | `stripe-checkout` | ID del prezzo (piano PIUM) su Stripe |
| `STRIPE_COUPON_ON` | `stripe-checkout` | ID coupon sconto per il canale affiliato "-on" |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | verifica firma HMAC degli eventi Stripe |
| `APP_URL` | `stripe-checkout` | base URL per `success_url`/`cancel_url` del Checkout (default `https://www.piumapp.com`) |
| `TURNSTILE_SECRET_KEY` | `create-booking` | verifica server-side del token Turnstile (opzionale) |
| `NOTIFY_WEBHOOK_SECRET` | `notify-new-booking` (verificato) + incorporato nella definizione del trigger `on_new_booking` (chi lo invoca) | autenticazione del trigger DB verso la function |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `notify-new-booking` | firma delle notifiche push (la pubblica deve corrispondere a `VITE_VAPID_PUBLIC_KEY` lato frontend) |
| `RESEND_API_KEY` | `approve-affiliate` | autenticazione API Resend |
| `FROM_EMAIL` | `approve-affiliate` | mittente email (default `PIUM <no-reply@piumapp.com>`) |

---

*Fine Fase 3.*

---

## FASE 4 — Flussi

Ogni flusso è ricostruito leggendo il codice reale (frontend + RPC + Edge Function), con riferimenti a file/riga.

### 1. Registrazione e onboarding

#### 1a. Merchant (attività)
1. **`/auth`** (`Auth.jsx`) — tab "Registrati": form nome/email/password + checkbox obbligatoria di accettazione Termini/DPA/Privacy (`legalAccepted`, riga 59-62 — blocca il submit se non spuntata, ma **non scrive nulla in DB a questo punto**, è solo un gate client-side). Se in `?ref=CODICE` nell'URL, il codice viene salvato in `localStorage.pium_ref` (riga 32-33) **prima ancora** del signup, così sopravvive anche se l'utente non completa subito la registrazione.
2. `supabase.auth.signUp({email, password, options:{data:{full_name}, emailRedirectTo: '<origin>/auth'}})` (Auth.jsx:81-88). Se Supabase Auth richiede conferma email, non c'è sessione (`data.session` nullo) → schermata "Email inviata"; se la conferma email è disabilitata, c'è subito sessione → redirect a **`/onboarding`**.
3. **`/onboarding`** (`Onboarding.jsx`) — al mount verifica che l'utente sia loggato, non sia admin, e non abbia già un business (righe 81-99); precompila `affiliate_code` da `localStorage.pium_ref` (riga 68-71, resta modificabile a mano).
4. Wizard a 3 step (validazione client-side ad ogni step: `validate()` riga 114-131): **Step 0** nome+categoria+codice affiliato opzionale, **Step 1** almeno un contatto tra telefono/email, **Step 2** città obbligatoria + descrizione libera opzionale.
5. Al submit finale (`handleSubmit`, riga 137): genera uno slug unico (`generateSlug`, incrementale `nome`, `nome-2`, `nome-3`... controllando `businesses.slug` a ogni tentativo, fallback random dopo 50 tentativi) e fa **insert** in `businesses` con `status:'trial'`, `trial_ends_at: now+30 giorni` (14→30 dal `c6ba13e`, unico punto che scrive `trial_ends_at`), `owner_email: user.email`, l'`affiliate_code` normalizzato (lowercase, trim, o `null`).
6. Se l'insert fallisce con `AFFILIATE_CODE_INVALID` (sollevato dal trigger `validate_affiliate_code`, vedi Fase 2) o `23503` → messaggio dedicato "Codice affiliato non valido"; `23505` (business duplicato per lo stesso user, violazione dello `UNIQUE(user_id)`) → messaggio dedicato.
7. Pulisce **incondizionatamente** `localStorage.pium_ref` (anche se il codice non era valorizzato, per evitare che si riattacchi a una registrazione successiva sullo stesso device).
8. Upsert in `legal_acceptances` (context `merchant`, `acceptance_type: merchant_terms_dpa_privacy`, con `onConflict` idempotente) — **questo è il punto reale in cui l'accettazione ottenuta al passo 1 viene persistita**, non al momento del click sulla checkbox.
9. Genera la descrizione AI (`generateWithClaude`, vedi sezione 6) e la salva su `businesses.description` — **in modo "best effort"**: se fallisce, logga in console ma non blocca il flusso.
10. Redirect a `/dashboard`.

#### 1b. Affiliato
1. **`/affiliates/auth`** (`AffiliatesAuth.jsx`) — tab "Registrati": nome/email/password + checkbox obbligatoria di accettazione del Contratto di Affiliazione + Privacy (righe 32,47,172-179).
2. `supabase.auth.signUp(...)` (righe 66-73, `emailRedirectTo: '<origin>/affiliates'`).
3. Se il signup ritorna uno `user.id` (righe 81-94): genera un codice referral (`generateCode`, prime 3 lettere del nome normalizzate + 4 caratteri random, rigenerato se terminasse per `-on` — riservato al canale scontato) e fa **insert diretto** in `affiliates` con `status:'pending'`.
4. ⚠️ **Nessuna riga viene scritta in `legal_acceptances`** per questo flusso (a differenza del merchant) — l'accettazione del contratto affiliato resta solo un flag client-side non persistito lato server (vedi discrepanza già segnalata in Fase 2, sezione `legal_acceptances`).
5. Schermata "Registrazione ricevuta" → l'utente deve confermare l'email prima del primo accesso.
6. **`/affiliates`** (`Affiliates.jsx`) mostra poi lo stato: se non esiste un profilo `affiliates` per l'utente loggato → invito a registrarsi; se `status='pending'` → schermata di attesa; se `'approved'` → dashboard con link/statistiche. **Nota di design esplicita nel codice** (riga 43-46): questa pagina non crea mai un record affiliato solo perché un utente autenticato la visita — solo `AffiliatesAuth.jsx` può farlo, per evitare "affiliati fantasma".
7. Il passaggio da `pending` ad `approved`/`rejected` avviene **solo** tramite l'Edge Function `approve-affiliate`, invocata dall'admin da `Admin.jsx:361` (`supabase.functions.invoke`) — mai da un update diretto lato client (la vecchia policy RLS che lo permetteva è stata rimossa, Fase 2).

---

### 2. Flusso di pagamento completo (checkout → webhook → attivazione → commissione)

1. **Trigger**: l'utente clicca "Attiva ora" nel banner trial di `Dashboard.jsx` (righe 393-421, mostrato se `status==='trial'`) o nella sezione Abbonamento di `Settings.jsx` → entrambi usano l'hook condiviso `useStripeCheckout()`.
2. **`handleCheckout()`** (`lib/useStripeCheckout.js`): recupera l'`access_token` di sessione e fa `fetch POST /functions/v1/stripe-checkout` con quel Bearer token.
3. **Edge Function `stripe-checkout`** (dettaglio completo in Fase 3): crea/riusa un Customer Stripe; se trova già una subscription `active`/`trialing` su quel Customer, **non apre un secondo checkout** — riallinea lo status locale e risponde `{already_active:true}` (il frontend fa `window.location.reload()`); altrimenti crea una Checkout Session, applicando il coupon `STRIPE_COUPON_ON` solo se `businesses.affiliate_code` termina in `-on`, e risponde `{url}`.
4. Il frontend fa un **redirect pieno** (`window.location.href = data.url`) alla pagina Stripe Checkout hosted (nessuna integrazione embedded).
5. L'utente paga su Stripe. Stripe reindirizza a `success_url = <APP_URL>/dashboard?stripe_success=true` (o `cancel_url = <APP_URL>/dashboard` se annulla).
6. **In parallelo**, Stripe invia in webhook l'evento `checkout.session.completed` a `stripe-webhook`, che: trova il business per `stripe_customer_id`, imposta `status='active'`, `plan='active'`, salva `stripe_subscription_id`, e se la subscription ha un `trial_end` lo salva in `trial_ends_at`.
7. **Lato frontend**, `Dashboard.jsx` rileva `?stripe_success=true` nell'URL (riga 128-133), ripulisce l'URL e avvia un **polling** (righe 136-169): rilegge `businesses` ogni 2 secondi, fino a 5 tentativi (10s totali) o finché non vede `status==='active'` — necessario perché l'attivazione arriva in modo asincrono dal webhook, non dal redirect stesso. Se trova `active`, mostra il banner verde "Pagamento completato!" per 6 secondi.
8. **Eventi successivi nel ciclo di vita dell'abbonamento**, tutti gestiti da `stripe-webhook`:
   - `customer.subscription.updated` → rimappa lo stato Stripe sullo stato PIUM (`trialing→trial`, `active→active`, `past_due→suspended`, `canceled→expired`).
   - `customer.subscription.deleted` → `status='expired'`, `plan='free'`.
   - `invoice.paid` → (a) riallinea lo status se necessario, (b) **se e solo se** il business ha un `affiliate_code`, calcola e registra la commissione (dettaglio in sezione 3).
9. Se il business non ha un `affiliate_code`, il flusso di pagamento si esaurisce al passo 8 senza toccare `affiliate_commissions`.

---

### 3. Sistema affiliati e commissioni

#### Canali "-on" / pieno
- Ogni affiliato ha **un solo codice base** (`affiliates.code`), ma **due link condivisibili**, costruiti lato frontend in `Affiliates.jsx:194-196`: `.../auth?ref=<code>` (canale pieno, cliente paga 49,99€/mese) e `.../auth?ref=<code>-on` (canale scontato, cliente paga 29,99€/mese — prezzi aggiornati da `c6ba13e`, erano 99,99€/69,99€). Il suffisso `-on` **non esiste come record separato** — è una convenzione di stringa sul valore salvato in `businesses.affiliate_code`.
- Il codice arriva al business tramite `?ref=` in URL → `localStorage.pium_ref` → precompilato (ma modificabile) nel form di onboarding → salvato **intatto, suffisso compreso**, su `businesses.affiliate_code` all'insert.
- Il trigger `validate_affiliate_code` (Fase 2) valida il codice **base** (strippando `-on`) contro `affiliates.code`, ma salva il valore originale intatto — così sia `stripe-checkout` (per applicare lo sconto) sia `stripe-webhook` (per calcolare la commissione) possono leggere il suffisso.

#### Calcolo `commissionFor()` (in `stripe-webhook/index.ts`)
**Modello a percentuale** (introdotto da `c6ba13e`, sostituisce il precedente importo fisso per canale — 29,99€ pieno / 19,99€ "-on"):
1. Ad ogni evento `invoice.paid`, se il business ha un `affiliate_code`: determina `hadOnSuffix = affiliate_code.toLowerCase().endsWith('-on')` (usato solo per il log/badge canale, non più per il calcolo dell'importo) e il `baseCode` (senza suffisso).
2. Cerca l'affiliato per `code = baseCode` **e** `status = 'approved'` — se non trovato o non approvato, **nessuna commissione** (skip silenzioso, loggato).
3. Se `invoice.amount_paid` è mancante o ≤0, **skip esplicito** (nessuna riga a 0 registrata) — guardia aggiunta da `c6ba13e` proprio perché il calcolo ora dipende da questo valore.
4. Conta quante commissioni esistono già per quel `business_id` in `affiliate_commissions` (`count`) → `monthNumber = count + 1`.
5. `commissionFor(amountPaidCents, monthNumber)`: **30%** dell'importo realmente fatturato (`invoice.amount_paid`) se `monthNumber ≤ 12`, **15%** se `monthNumber > 12` (tariffa ridotta "a vita", stessa soglia di prima) — `COMMISSION_RATE_FULL = 0.30`, `COMMISSION_RATE_LATE = 0.15`, `COMMISSION_TIER_MONTHS = 12`.
6. Insert in `affiliate_commissions` (`status:'pending'`, `stripe_invoice_id` come chiave di deduplica — un retry dello stesso webhook Stripe con lo stesso `invoice.paid` viene ignorato via UNIQUE constraint, errore `23505` catturato esplicitamente).
7. Il pagamento effettivo delle commissioni all'affiliato (`status: pending → paid`) è **manuale**, gestito da `Admin.jsx` (non trovato nessun automatismo — l'admin marca le righe come pagate dal pannello, aggiornando `status`/`paid_at`).

**Non deployato**: la modifica resta solo nel repo finché non si aggiornano manualmente `STRIPE_PRICE_ID`/`STRIPE_COUPON_ON` su Stripe Dashboard (per riflettere i nuovi prezzi 49,99€/29,99€) e si verifica con un pagamento di test.

#### Dashboard affiliato (`Affiliates.jsx`)
- Al login, carica il proprio profilo `affiliates` (mai creato automaticamente, solo letto) e, se esiste, in parallelo: (a) i business con `affiliate_code IN (code, code-on)` — **selezionando esplicitamente solo colonne commerciali** (id, name, city, status, trial_ends_at, stripe_subscription_id, is_free, affiliate_code, created_at), mai dati operativi dei clienti finali — e (b) le proprie righe in `affiliate_commissions`.
- Calcola lato client: `earned` (somma di tutte le commissioni `pending`+`paid`), `pending` (solo `pending`), e per ogni cliente lo stato "reale" via `getBusinessRealStatus()` (sezione 5) per mostrare un badge (Pagante/In prova/Scaduto/Perso/Sospeso/Omaggio).
- Il canale di ciascun cliente portato è dedotto **di nuovo dal suffisso** di `businesses.affiliate_code` (badge "Pieno · 49,99€" vs "Scontato · 29,99€", prezzi aggiornati da `c6ba13e`), non da una colonna dedicata.
- **Badge di stato arricchito** (`RealStatusBadge`, `c6ba13e`): se lo stato reale è `'trial'`, mostra "In prova (giorno X/Y)" con `Y` calcolato da `trial_ends_at - created_at` (funzione `trialProgress()`, non hardcoded a 30 — si adatta se un admin allunga/accorcia `trial_ends_at` per un singolo business); se `'active'`, mostra "Convertito"; per tutti gli altri stati resta l'etichetta di `REAL_STATUS_META` invariata. Puro calcolo di visualizzazione sui dati già caricati, nessuna nuova query.
- Copy "Tu guadagni" aggiornato da importo fisso a percentuale (es. "Tu guadagni il 30% (circa 15€/mese)") per restare coerente col nuovo calcolo commissioni.

#### Approvazione affiliato
Vedi Fase 3 (`approve-affiliate`): solo un admin (claim JWT `app_metadata.role='admin'`) può cambiare `affiliates.status`; alla prima approvazione (`pending→approved`) invia un'email via Resend e marca `approved_email_sent_at` per non rimandarla in caso di doppio click/retry.

---

### 4. Prenotazioni pubbliche (booking → conferma owner → agenda)

1. **Sul mini-sito pubblico** (`PublicSite.jsx` → `BookingSection.jsx`): il visitatore seleziona uno o più servizi (solo quelli con `duration_min` valorizzato e `visible_on_public_site=true`/`is_available=true` — filtrati a monte dalla query di `PublicSite.jsx`), una data, e il componente chiama **`supabase.rpc('get_taken_slots', {p_business_id, p_date})`** (pubblica, nessuna autenticazione) per sapere cosa è già occupato.
2. Genera gli slot liberi **lato client** (`generateSlots()`, righe 46-68) leggendo `business.opening_hours` (formato nuovo mattina/pomeriggio con `active`, o legacy `open/close`) e sottraendo gli slot già occupati fino a `booking_capacity` sovrapposizioni simultanee consentite.
3. L'utente compila nome/email/telefono (validati anche client-side: regex email, telefono 6-20 caratteri) e arriva al riepilogo, dove — se configurato — deve risolvere il widget **Cloudflare Turnstile**.
4. **Submit**: `fetch POST` diretto (non tramite client Supabase) verso l'Edge Function `create-booking`, con l'anon key come Bearer/apikey (endpoint pubblico, nessuna sessione utente) e il token Turnstile.
5. **`create-booking`** verifica Turnstile server-side, poi chiama `supabase.rpc('create_booking', {...})` con **service role** (l'unico chiamante autorizzato, dopo la revoca dei grant `anon`/`authenticated` sulla RPC — Fase 2/3).
6. **`create_booking`** (RPC, Fase 2) rivalida **tutto** lato server (data non passata, formato email/telefono, disponibilità servizi, orari di apertura, anti-doppione 1-pending-per-email, backstop anti-flood, capacità slot con advisory lock anti race-condition) e inserisce la riga in `bookings` con `status='pending'`.
7. L'insert fa scattare il **trigger `on_new_booking`** → chiama in modo asincrono l'Edge Function `notify-new-booking`, che invia una **notifica push** al/ai dispositivo/i del titolare registrati in `push_subscriptions` (payload: "Nuova prenotazione", deep-link a `/dashboard?s=agenda`).
8. **In parallelo**, se il titolare ha la dashboard aperta, il canale **Realtime** `pending-bookings-<businessId>` (`Dashboard.jsx:208-234`) riceve l'evento `INSERT` su `bookings` e aggiorna subito il badge/contatore nella sidebar (`pendingCount`), oltre a mostrare una notifica browser locale (`notifyNewBooking`, `lib/notifications.js`).
9. **Nell'Agenda** (`Agenda.jsx`), il pannello "Prenotazioni in attesa" mostra ogni booking pending con un pulsante **"Invia WhatsApp"**: apre un link `wa.me` precompilato (`buildWaLink`) con un messaggio che chiede al cliente di rispondere "Confermo" — **azione manuale del titolare**, PIUM non invia WhatsApp in autonomia né riceve/legge le risposte del cliente.
10. Solo dopo aver cliccato "Invia WhatsApp" (stato tracciato in `localStorage`, chiave `wa_sent_<id>`, **non nel DB**) compare il pulsante **"Conferma appuntamento"**: il titolare lo preme solo dopo aver ricevuto a mano la conferma dal cliente via WhatsApp (fuori app). Questo apre un dialog di conferma che chiama **`supabase.rpc('owner_confirm_booking', {p_booking_id})`**.
11. **`owner_confirm_booking`** (RPC, Fase 2): verifica che il chiamante sia il proprietario del business collegato al booking, passa `bookings.status='confirmed'`, crea la riga `appointments` corrispondente (sommando durata/prezzo se multi-servizio) e, se multi-servizio, popola `appointment_services` con lo snapshot di prezzo/durata di ciascun servizio.
12. In alternativa, il titolare può **"Rifiuta"** la prenotazione (`rejectPendingBooking`, `Agenda.jsx:570-577`): semplice `update bookings set status='cancelled'`, nessuna RPC, nessun appuntamento creato.
13. Da questo punto la prenotazione confermata vive come una normale riga `appointments`, visibile/gestibile in Agenda come un appuntamento creato manualmente.

---

### 5. Blocco abbonamento / `is_free` / stati (`getBusinessRealStatus`)

Tutta la logica vive in **`src/lib/businessGate.js`**, unica fonte di verità, usata sia in `Dashboard.jsx`/`Settings.jsx` (per bloccare l'accesso) sia in `Affiliates.jsx`/`Admin.jsx` (per mostrare badge di stato).

- **`isTrialExpiredUnpaid(business)`**: `true` solo se `status==='trial'` **e** `trial_ends_at` è passato **e** non esiste un `stripe_subscription_id` — cioè un trial scaduto che non è mai diventato un cliente Stripe (nemmeno in fase `trialing`). Necessario perché `businesses.status` avanza **solo** tramite webhook Stripe: un utente che non paga mai resterebbe per sempre `status='trial'` senza questo calcolo aggiuntivo lato applicazione.
- **`getBusinessRealStatus(business)`** — stato "vero" mostrato ovunque (badge dashboard affiliato, pannello admin):
  1. Se `is_free===true` → **`'gift'`** (account omaggio: sempre, a prescindere da qualunque altro campo — non passa mai da Stripe).
  2. Altrimenti se `isTrialExpiredUnpaid()` → **`'trial_expired'`**.
  3. Altrimenti lo `status` grezzo del DB (`trial`/`active`/`expired`/`suspended`).
  - Nota esplicita nel codice: `'gift'` è deliberatamente diverso da `'free'` (valore già usato da `businesses.plan` con significato opposto: ex-cliente pagante degradato dopo disdetta) per non sovrapporre due concetti opposti sotto la stessa etichetta.
- **`isBusinessBlocked(business)`** — regola unica di blocco operativo:
  1. Se `is_free===true` → **mai bloccato**, qualunque altro campo dica.
  2. Altrimenti bloccato se `status` è `'suspended'` (bloccato a mano dall'admin) o `'expired'` (subscription Stripe cancellata) o se `isTrialExpiredUnpaid()`.
  3. `'trial'` (in corso) e `'active'` passano sempre.
- **Applicazione pratica**: `Dashboard.jsx:72,250-258` e (per lo stesso pattern) `Settings.jsx` chiamano `isBusinessBlocked(business)` **prima** di renderizzare qualunque sezione operativa; se bloccato, sostituiscono l'intera pagina con `<SubscriptionGate>` (schermata a tutto schermo con le uniche due azioni possibili: pagare o uscire — mai un accesso parziale).
- `Dashboard.jsx` calcola **anche** un `trialExpired` locale leggermente diverso (righe 64-66, senza guardare `stripe_subscription_id`): usato solo per decidere quale **banner non bloccante** mostrare (trial in corso vs trial scaduto, entrambi con pulsante "Attiva ora") nel breve intervallo in cui una subscription esiste già su Stripe ma il webhook non ha ancora aggiornato `status` — in quella finestra `isBlocked` resta `false` (grazie al controllo su `stripe_subscription_id` in `isTrialExpiredUnpaid`) e l'utente vede il banner "attiva ora" invece del gate a tutta pagina.
- Sia il banner sia il gate nascondono l'invito a pagare se `business.is_free===true` (controlli `&& !business?.is_free` sparsi in `Dashboard.jsx:384,403`).
- **Admin** (`Admin.jsx`) può forzare `is_free` con un toggle diretto (`update businesses set is_free=...`, righe 307-312) — l'unico modo per creare/rimuovere un account omaggio, nessun flusso self-service.

---

### 6. Generazione AI — dove, come, limiti

**Unico varco**: `src/lib/claude.js` (`generateWithClaude(prompt)`) → Edge Function `claude-proxy` → Anthropic API. Tre punti di chiamata nel frontend:

| Chiamante | Quando | Prompt (sintesi) |
|---|---|---|
| `Onboarding.jsx` (`buildDescriptionPrompt`, riga 488-502) | automatico, subito dopo la creazione del business | descrizione professionale ≤3 frasi da nome/categoria/città/indirizzo/note del titolare |
| `Social.jsx` (`buildPrompt`, riga 46-65) | manuale, l'utente clicca "Genera bozza" scegliendo piattaforma/argomento/tono | post per Instagram/Facebook, risposta richiesta in **JSON** (`{content, hashtags}`, parsato da `parseAIResponse` con fallback se Claude non rispetta il formato) |
| `Recensioni.jsx` (`buildReplyPrompt`, riga 43-58) | manuale, l'utente clicca "Genera risposta" su una recensione | risposta 2-4 frasi, tono variabile in base al rating (`≥4`→caloroso, `=3`→costruttivo, `≤2`→empatico/scusante) |

**Flusso** (identico per tutti e tre): il chiamante costruisce il prompt lato client (mai lato server) → `generateWithClaude` recupera l'`access_token` di sessione → `fetch POST /functions/v1/claude-proxy` con quel Bearer → la Edge Function autentica l'utente, applica il rate limit, chiama Anthropic, aggiorna i contatori, ritorna `{text}`.

**Limiti** (applicati **solo** lato Edge Function, mai lato client — quindi non aggirabili dal browser):
- **350.000 token/mese** per business (`businesses.ai_tokens_month`, confrontato con `TOKEN_LIMIT` hardcoded in `claude-proxy/index.ts`), reset automatico al cambio mese solare (confronto `YYYY-MM` tra oggi e `ai_reset_date`).
- Bypassabile per singolo business con `businesses.ai_unlimited=true` (flag, verosimilmente impostabile solo da admin/SQL diretto — nessun toggle trovato in `Admin.jsx` per questo campo in questa passata, a differenza di `is_free` che ha un toggle dedicato).
- Prompt massimo **20.000 caratteri** (validazione in `claude-proxy`, indipendente dal limite mensile).
- Modello fisso **`claude-sonnet-4-6`**, `max_tokens: 1000` per risposta, timeout **25 secondi**.
- Superato il limite mensile: risposta `429 {error:'AI_LIMIT_REACHED'}`, il frontend mostra il messaggio "Hai raggiunto il limite mensile di utilizzo AI. Si rinnova il 1° del mese." (gestione errore per-chiamante, non centralizzata).
- Contatori aggiornati in modo **fire-and-forget** dopo la risposta ad Anthropic (non bloccano la risposta all'utente): `ai_tokens_month` (cumulativo nel mese), `ai_calls_month_display` (contatore "umano" mostrato all'utente), `ai_calls_month`/`ai_calls_total` (deprecati/interni).

---

*Fine Fase 4.*

---

## FASE 5 — Transizione internazionale

Sintesi valutativa basata su tutto quanto mappato nelle Fasi 1-4, per capire cosa serve a chi volesse portare PIUM (a) su un'infrastruttura diversa da Supabase/Stripe/Anthropic/Cloudflare/Resend, e/o (b) fuori dal mercato italiano.

### 1. Logica pura — portabile senza modifiche

Codice che non conosce Supabase/Stripe/Anthropic/Cloudflare e non è legato al mercato italiano più di quanto lo sia un'app qualsiasi che lavora in EUR/orario CET. Sopravvive a un cambio di infrastruttura quasi identico.

- **`src/lib/errors.js`** — mappa messaggi Supabase Auth → italiano; la logica di matching stringa→messaggio è portabile, va solo aggiornata se cambia provider di auth (i messaggi d'errore sorgente cambierebbero).
- **`src/lib/safeUrl.js`** — whitelist protocolli URL, puro.
- **`src/lib/phone.js`** — la *struttura* (normalizzazione, costruzione link `wa.me`) è portabile; il *contenuto* assume il mercato italiano (v. sezione 4) e andrebbe generalizzato per altri paesi.
- **`src/lib/businessGate.js`** — tutta la logica di stato abbonamento (`isTrialExpiredUnpaid`, `getBusinessRealStatus`, `isBusinessBlocked`) è pura logica di business su dati già in memoria, zero dipendenze esterne. Sopravvive intatta a qualunque backend, **a patto che l'oggetto `business` esponga gli stessi campi** (`status`, `trial_ends_at`, `stripe_subscription_id`, `is_free`).
- **RPC `create_booking`, `get_taken_slots`, `owner_confirm_booking`, `validate_affiliate_code`** (Fase 2) — logica di dominio (validazione orari, capacità, anti-doppione, commissioni) scritta in PL/pgSQL: portabile **concettualmente** a qualunque database relazionale con transazioni e lock, ma va **riscritta linguisticamente** (sintassi Postgres-specifica: `jsonb`, `pg_advisory_xact_lock`, `RAISE EXCEPTION`) se si cambia RDBMS.
- **`commissionFor()`** (`stripe-webhook/index.ts`) — funzione pura (tier mesi + importo fatturato → percentuale applicata, modello a percentuale da `c6ba13e`), indipendente da Stripe: la logica di calcolo si porta 1:1, cambia solo *da dove* viene invocata (oggi un evento `invoice.paid`).
- **`generateSlots()`/`generateSlotsForRange()`** (`BookingSection.jsx`) — calcolo puro degli slot disponibili da orari+durata+occupazione, nessuna dipendenza esterna.
- **Componentistica React pura** (rendering, validazione form client-side, wizard multi-step di `Onboarding.jsx`/`Auth.jsx`, macchina a stati di `BookingSection.jsx`) — portabile a qualunque backend, cambiano solo le chiamate `.from()`/`.rpc()`/`fetch()` al loro interno.
- **`vite.config.js`, `eslint.config.js`, struttura cartelle `src/`** — tooling e organizzazione del codice, indipendenti da qualunque servizio.

### 2. Agganciato all'infrastruttura — da sostituire

Per ciascuno: cosa c'è oggi (rimando alla Fase 3 per il dettaglio), e il **peso di sostituzione** (stima qualitativa basata su quanti file toccano il servizio e quanto la sua API è "incorporata" nella logica applicativa, non un'ipotesi di ore).

| Servizio | Punti d'aggancio (da Fase 3) | Peso di sostituzione | Perché |
|---|---|---|---|
| **Supabase Database (Postgres+RLS)** | ~25 file frontend con `.from()`, tutte le RPC, tutti i trigger | 🔴 **Altissimo** | È l'accoppiamento più profondo e diffuso: non c'è un layer di accesso dati centralizzato (nessun repository/DAO) — ogni componente parla direttamente al DB. La sicurezza stessa (RLS) è nel DB, non in un livello applicativo: cambiare DB significa reimplementare da zero sia le query sia tutte le regole di autorizzazione, oltre a riscrivere le 4 RPC in un altro linguaggio/paradigma |
| **Supabase Auth** | ~20 file (`signIn/signUp/signOut/getSession/getUser/updateUser/resetPasswordForEmail`), + il concetto di ruolo admin come claim JWT `app_metadata.role` | 🔴 **Alto** | Login/registrazione/reset password toccano quasi ogni pagina "auth-aware"; il claim custom per il ruolo admin è un pattern Supabase-specifico (va rifatto con claim/custom token del nuovo provider) |
| **Supabase Edge Functions (Deno)** | tutte e 6 le function | 🟡 **Medio** | La *logica* di ciascuna è per lo più portabile (è codice TypeScript/fetch abbastanza standard); va riscritto lo strato di deploy/runtime (Deno → altro) e il client `createClient(...)` verso il nuovo DB/auth. `stripe-webhook` in particolare non usa l'SDK Stripe (verifica firma con Web Crypto nativo) — **più portabile del previsto** |
| **Supabase Storage** | 1 file (`EditorSito.jsx`), 1 bucket | 🟢 **Basso** | Solo upload+getPublicUrl in 3 punti dello stesso file; sostituibile con qualunque object storage (S3, R2, GCS) cambiando poche righe |
| **Supabase Realtime** | 1 punto (`Dashboard.jsx`, badge prenotazioni pending) | 🟢 **Basso** | Funzionalità isolata e non critica al funzionamento core (senza, il badge si aggiorna solo al refresh/focus tab); sostituibile con polling o un altro sistema pub/sub senza toccare il resto |
| **Stripe** | `stripe-checkout`, `stripe-webhook`, `useStripeCheckout.js` | 🟡 **Medio-alto** | La logica di business (anti-doppio-addebito, riallineamento stato, calcolo commissioni) è scritta *attorno* alle chiamate Stripe ma non è indissolubile da esse — va rimappata sul modello a eventi/webhook del nuovo PSP (quasi tutti i payment processor moderni ne hanno uno simile), ma ogni branch di `stripe-webhook` (4 tipi di evento) va riscritto sul set di eventi del nuovo provider |
| **Anthropic (Claude)** | 1 Edge Function (`claude-proxy`), 3 punti di chiamata frontend (via un unico wrapper `lib/claude.js`) | 🟢 **Basso** | Ottimo isolamento: un solo endpoint HTTP da ripuntare (`api.anthropic.com` → altro provider LLM), i prompt sono testo semplice, il rate-limiting è generico (non specifico di Anthropic) |
| **Cloudflare (Worker + Turnstile)** | 1 Worker (proxy sottodomini), widget+verifica Turnstile in 2 file | 🟢 **Basso-medio** | Il Worker di proxy sottodominio è sostituibile con qualunque reverse proxy/CDN che sappia riscrivere richieste per hostname; Turnstile è un semplice anti-bot, intercambiabile con reCAPTCHA/hCaptcha cambiando 2 file (widget + verifica server) — **ma la funzione resta operativa anche senza**, essendo opzionale by design |
| **Resend** | 1 Edge Function (`approve-affiliate`) | 🟢 **Basso** | Singolo endpoint HTTP per un solo tipo di email transazionale; le email di Auth (conferma/reset) sono già gestite da Supabase Auth stesso, quindi cambiando provider di auth cambia automaticamente anche quel canale — non serve toccare altro codice applicativo per quello |
| **Web Push (VAPID)** | `pushSubscription.js` + `notify-new-booking` | 🟢 **Basso** | Standard web (RFC 8030), non un vendor — resta identico a prescindere dal backend, cambia solo dove vivono le chiavi VAPID e chi invoca l'invio |

**Nota di sintesi**: i due agganci davvero strutturali sono **Database+RLS** e **Auth** — non a caso sono anche quelli con più superficie di codice coinvolta. Tutto il resto (Storage, Realtime, Stripe, Anthropic, Cloudflare, Resend, Push) è isolato in singoli file o singole Edge Function e si sostituisce con un impatto localizzato.

### 3. Testi hardcoded (da estrarre per i18n)

**Non esiste alcuna libreria di i18n** in `package.json` (nessun `react-i18next`, `next-intl`, `formatjs`, ecc.) e **nessun file di traduzione/dizionario** in `src/`. Ogni stringa visibile all'utente è scritta **in italiano, direttamente nel JSX**, mischiata a markup e logica — non c'è alcuna separazione testo/codice da cui partire.

**Stima per file** (conteggio automatico approssimativo di stringhe JSX in italiano — un indicatore di grandezza, non un numero esatto):

| File | Ordine di grandezza stringhe | Note |
|---|---|---|
| `src/pages/Admin.jsx` | ~70+ | pannello admin, il più denso di testo (etichette, colonne tabella, messaggi di stato) |
| `src/components/dashboard/Agenda.jsx` | ~40+ | + nomi festività italiane hardcoded (v. sezione 4) |
| `src/components/dashboard/EditorSito.jsx` | ~30 | editor sito pubblico |
| `src/pages/Settings.jsx` | ~20 | |
| `src/pages/Landing.jsx` | ~20 | copy marketing, il testo più "curato" e meno banale da tradurre 1:1 |
| `src/pages/PublicSite.jsx`, `Onboarding.jsx`, `Affiliates.jsx`, `Clienti.jsx` | ~15-18 ciascuno | |
| resto di `src/pages/` e `src/components/` | 2-15 ciascuno | quasi ogni file ne ha almeno qualcuna |
| `src/pages/legal/*.jsx` | 0 in JSX, ma… | il testo vero è nei 5 file **`legal-docs/*.md`** (Termini, Privacy, Cookie, DPA, Contratto Affiliazione) — Markdown lungo in italiano, caricato con `?raw`; sono i documenti più lunghi e legalmente sensibili da tradurre |
| Edge Functions (`approve-affiliate/index.ts`) | 1 blocco | il template HTML dell'email di approvazione affiliato è embedded come stringa nel codice server |
| `supabase/migrations/20260823_faq_table_and_seed.sql` | ~27 righe | contenuto FAQ (domanda/risposta) inserito **come dati**, non come codice — comunque testo italiano da tradurre se si vuole una versione multilingua, ma già separato dal codice applicativo |
| **Notifiche push/browser** (`lib/notifications.js`, `notify-new-booking/index.ts`) | poche stringhe | titoli/corpo notifica ("Nuova prenotazione", promemoria appuntamento) |
| **Messaggi WhatsApp precompilati** (`Agenda.jsx`, `PromemoriaClienti.jsx`) | alcuni template | frasi con placeholder (nome cliente, data, servizio) costruite via template string — vanno estratte come i18n **con interpolazione**, non semplici etichette statiche |

**Totale indicativo**: qualche **centinaio di stringhe distinte** sparse in ~30 file `.jsx`/`.ts`, più 5 documenti legali lunghi e ~30 righe di FAQ. Un lavoro di i18n richiederebbe: (a) introdurre una libreria (`react-i18next` o equivalente), (b) estrarre sistematicamente ogni stringa in file di traduzione per chiave, (c) gestire a parte i contenuti "a struttura libera" (Markdown legale, FAQ da DB, prompt AI) che non sono semplici etichette UI.

### 4. Prezzi e configurazioni hardcoded

Nessun prezzo/percentuale vive in una singola "tabella di configurazione": sono sparsi tra **testo di presentazione** (frontend, solo visualizzazione) e **valori realmente applicati** (Stripe Dashboard + Edge Function). Elenco completo:

| Valore | Dove (visualizzazione, non applicato) | Dove (applicato realmente) |
|---|---|---|
| **49,99 €/mese** (prezzo pieno, era 99,99€ prima di `c6ba13e`) | `Landing.jsx:142,328` (copy marketing), `PublicSite.jsx:155` (meta description), `Affiliates.jsx:238,308` (etichette canale), `Dashboard.jsx:412` (banner trial) | **`STRIPE_PRICE_ID`** (secret Edge Function `stripe-checkout`) — il prezzo vero è configurato lato Stripe Dashboard, non nel codice; **non deployato** finché il price ID su Stripe non viene aggiornato a mano |
| **29,99 €/mese** (prezzo scontato "-on", era 69,99€ prima di `c6ba13e`) | `Affiliates.jsx:249,308` | **coupon `STRIPE_COUPON_ON`** (secret) configurato lato Stripe Dashboard — stesso "non deployato" del prezzo pieno |
| **30%** dell'importo fatturato (commissione, mesi 1-12; era un importo fisso — 29,99€ canale pieno/19,99€ "-on" — prima di `c6ba13e`) | `Affiliates.jsx:238,249` ("Tu guadagni il 30%...") | `COMMISSION_RATE_FULL = 0.30` — **hardcoded in `stripe-webhook/index.ts`**, applicata su `invoice.amount_paid` |
| **15%** dell'importo fatturato (commissione ridotta, dal mese 13 a vita; era 15,00€ fisso prima di `c6ba13e`) | `Affiliates.jsx:257` | `COMMISSION_RATE_LATE = 0.15` — **hardcoded in `stripe-webhook/index.ts`**, `COMMISSION_TIER_MONTHS = 12` (soglia, invariata) |
| **`businesses.plan_price`** (default **99**, colonna DB, editabile per singolo business da `Admin.jsx:277-281,648,706`) | — | **non collegato a Stripe**: sembra un valore puramente informativo/di reportistica interna (usato per calcolare `revenue` lato admin, `Admin.jsx:508`), **non** il prezzo realmente addebitato (quello è deciso da `STRIPE_PRICE_ID`) — rischio di disallineamento se un admin lo modifica pensando di cambiare il prezzo reale; **non aggiornato** al nuovo prezzo 49,99€ da `c6ba13e` (fuori scope di quel commit, resta un potenziale disallineamento aggiuntivo) |
| **30 giorni** di trial (era 14 giorni prima di `c6ba13e`) | `Onboarding.jsx:169` (`Date.now() + 30*24*60*60*1000`, hardcoded al momento dell'insert) | stesso valore ripetuto in copy marketing (`Landing.jsx:142`, `PublicSite.jsx:155`) — **tre punti indipendenti**, nessuna costante condivisa |
| **1-50** (range `booking_capacity`) | — | CHECK constraint nel DB (`20260610_booking_capacity.sql`) |
| **350.000 token/mese** (limite AI) | — | `TOKEN_LIMIT` hardcoded in `claude-proxy/index.ts:8` |
| **22%** (aliquota IVA di default per il calcolo del netto in Agenda) | `Agenda.jsx:121` (`useState(22)`) | solo client-side, **non persistita** — si resetta a ogni refresh/sessione, editabile dall'utente ma mai salvata su `businesses` |
| **1.000 max_tokens** risposta Claude, **25s** timeout, **20.000** caratteri prompt max | — | tutti hardcoded in `claude-proxy/index.ts` |
| **200** booking pending totali, **20** booking in 10 minuti (backstop anti-flood) | — | hardcoded dentro la RPC `create_booking` (`20260806_create_booking_hardening.sql`) |

**Nessuna di queste cifre è centralizzata**: cambiare il prezzo del piano richiede un intervento su Stripe Dashboard **più** una ricerca manuale di tutte le occorrenze testuali sparse in almeno 4 file frontend per non lasciare il marketing disallineato dal prezzo reale — è esattamente quello che ha richiesto il passaggio a 49,99€/29,99€ (`c6ba13e`), oltre a `businesses.plan_price` che resta non allineato (vedi tabella sopra). Le commissioni affiliato sono l'unico blocco con un minimo di struttura (tre costanti raggruppate in cima a `stripe-webhook/index.ts`, con un commento esplicito "UNICO punto di configurazione") ma restano comunque codice, non dati.

### 5. Valutazione: cosa si riusa identico, cosa va riscritto

**Si riusa praticamente identico** (portare la stessa logica, cambiando solo l'infrastruttura sottostante):
- Tutta la UI React (componenti, form, wizard, macchina a stati di prenotazione) — il markup e l'interazione utente non conoscono Supabase.
- La logica di dominio pura elencata in sezione 1 (`businessGate.js`, `commissionFor()`, generazione slot, normalizzazione telefono).
- Il modello dati concettuale (33 tabelle: 20 di base piu 13 del verticale `ristorante_bar` — Fase 2) — è un buon schema relazionale indipendente dal vendor; va solo re-implementato come DDL nel nuovo RDBMS.
- Il flusso di business dei 6 flussi mappati in Fase 4 (onboarding, pagamento, affiliati, booking, gate abbonamento, AI) — sono processi applicativi, non legati a un fornitore specifico.

**Va riscritto** (accoppiamento diretto al vendor):
- **Ogni chiamata `.from()`/`.rpc()`** sparsa nei ~25 file frontend — non esiste un livello di accesso dati da sostituire in un solo posto; serve introdurlo (repository/API layer) se si vuole disaccoppiare per il futuro, oppure riscrivere punto per punto.
- **Le regole RLS** — vanno reincarnate come logica applicativa esplicita (middleware/policy layer) se il nuovo DB non supporta la sicurezza a livello di riga, con il rischio di introdurre buchi di sicurezza se la migrazione non è sistematica (oggi la sicurezza "vive" nel DB, spesso senza un doppio controllo lato applicazione).
- **Le 4 RPC PL/pgSQL** — da riscrivere in un linguaggio applicativo o nel dialetto del nuovo DB, prestando attenzione a rimappare le tre proprietà di sicurezza che oggi garantiscono (advisory lock anti-race, validazione server-side indipendente dal client, revoca dell'accesso diretto pubblico).
- **Le 6 Edge Function** — logica riusabile (sezione 2), ma runtime/deploy da rifare.
- **Auth** — sia il meccanismo (signIn/signUp/sessioni) sia il pattern del ruolo admin via claim custom.
- **Stripe** — mappatura eventi/webhook specifica del nuovo PSP.

**Va ripensato, non solo riscritto** (per una vera versione internazionale, oltre al cambio infrastruttura):
- **i18n**: introdurre da zero una libreria e un processo di estrazione stringhe (sezione 3) — oggi zero preparazione.
- **Localizzazione business logic**: `phone.js` (assume prefisso IT implicito), le festività italiane hardcoded in `Agenda.jsx` (Capodanno/Epifania/Liberazione/Ferragosto — un calendario festività per country sarebbe da esternalizzare e parametrizzare), l'aliquota IVA di default al 22% (andrebbe resa configurabile per paese, non hardcoded come default italiano), tutti i `toLocaleString('it-IT')`/`toLocaleDateString('it-IT')` sparsi (27 occorrenze in 13 file) da agganciare a una lingua/locale dinamica invece che fissa.
- **Prezzi/valuta**: oggi tutto in EUR con importi fissi ripetuti in testo libero (sezione 4) — una vera versione multi-mercato richiederebbe un modello prezzi/valuta esplicito, non stringhe sparse da tenere sincronizzate a mano.
- **Contenuti legali**: i 5 documenti in `legal-docs/` sono scritti per il diritto italiano (riferimenti impliciti a normativa IT/UE) — non è un problema di traduzione ma di **revisione legale per giurisdizione**, va oltre l'ambito tecnico di questo documento.

---

*Fine Fase 5.*
