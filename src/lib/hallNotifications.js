import { resolveCourseId, resolveStationId } from './kitchenRouting'

// Logica delle notifiche di sala (verticale 'ristorante_bar'), senza
// React e senza accesso al database: riceve gli ordini aperti già
// caricati e restituisce l'elenco. Un solo posto dove la regola "una
// portata è pronta" è scritta, usato sia dalla pagina Notifiche sala sia
// dal punto che decide se far suonare l'avviso — se fossero due calcoli
// distinti, l'elenco e il suono potrebbero raccontare cose diverse.
//
// NIENTE È PERSISTITO. Una notifica di stato esiste finché la condizione
// è vera: appena la portata viene consegnata (da questa pagina, da
// Ordine o da Cucina) la riga sparisce da sola, senza che nessuno debba
// cancellarla. Stesso principio dello stato OCCUPATO di un tavolo e
// delle giacenze.

const LEVEL_RANK = { nessuno: 0, leggero: 1, forte: 2 }

// Il livello più forte vince: se un antipasto arriva da una postazione
// 'forte' e uno da una 'leggero', la portata suona. Il contrario
// significherebbe perdere in silenzio un piatto che il cuoco ha chiesto
// di segnalare. Un valore imprevisto (impossibile: c'è un CHECK sul
// database) viene trattato come 'forte', mai come 'nessuno': meglio un
// avviso di troppo che un piatto che resta sul passe.
export function strongestAlertLevel(levels) {
  let best = 'nessuno'
  for (const raw of levels) {
    const level = LEVEL_RANK[raw] != null ? raw : 'forte'
    if (LEVEL_RANK[level] > LEVEL_RANK[best]) best = level
  }
  return best
}

export function courseNotificationLabel(course) {
  if (!course) return null
  return course.name?.trim() || `Portata ${course.slot_number}`
}

// L'etichetta della postazione è il nome usato nelle notifiche delle voci
// senza portata: "Bar" può diventare "Bibite". Vuota = si usa il nome
// della postazione.
export function stationNotificationLabel(station) {
  if (!station) return 'Senza portata'
  return station.notification_label?.trim() || station.name
}

// Testo neutro, valido per qualunque nome scritto dal titolare: "pronti"
// o "pronte" concorderebbe col genere dell'etichetta, che non possiamo
// conoscere ("Caffè pronte").
function toServeText(tableName, label) {
  return `${tableName} · ${label} — da servire`
}

/* ── Notifiche di STATO ───────────────────────────────────────────────
   Una notifica per GRUPPO, mai per piatto. Un gruppo è:
     - (ordine, portata) per le voci con una portata risolvibile —
       attraversa le postazioni: due antipasti dalla cucina e uno dal bar
       sono UN gruppo;
     - (ordine, postazione) per le voci senza portata, con l'etichetta
       della postazione.

   Entrano nel conteggio solo le voci inviate (sent_at), col via dato
   (fire_status 'subito') e in uno dei due stati che riguardano la
   cucina:
     'da_preparare' -> in lavorazione
     'pronto'       -> pronta
   Restano fuori 'consegnato' e 'annullato', e restano fuori le voci
   ancora in attesa del via: una portata trattenuta non è in lavorazione,
   e se contasse non si completerebbe mai.

   Il gruppo è una notifica se e solo se:
     pronte > 0  AND  in lavorazione == 0
   "pronte > 0" è anche la condizione "non ancora consegnata": quando
   l'ultima voce pronta passa a 'consegnato' il gruppo esce dall'elenco.

   Conseguenza accettata: una voce aggiunta e inviata dopo che la portata
   era già completa la fa tornare incompleta, quindi la riga sparisce
   finché anche quella non è pronta, e poi riappare. È il prezzo di
   "l'avviso parte a portata completa" senza ricordare da nessuna parte
   che un avviso era già stato dato. ── */
export function buildStateNotifications({ orders, activeStations, activeCourses }) {
  const stationsById = new Map(activeStations.map((s) => [s.id, s]))
  const out = []

  for (const order of orders) {
    const tableName = order.tables?.name ?? 'Tavolo'
    const groups = new Map()

    for (const item of order.table_order_items ?? []) {
      if (!item.sent_at) continue
      if (item.fire_status !== 'subito') continue
      if (item.kitchen_status !== 'da_preparare' && item.kitchen_status !== 'pronto') continue

      const courseId  = resolveCourseId(item, activeCourses)
      const stationId = resolveStationId(item, activeStations)
      const key = courseId ? `course:${courseId}` : `station:${stationId ?? 'none'}`

      let group = groups.get(key)
      if (!group) {
        const course = courseId ? activeCourses.find((c) => c.id === courseId) ?? null : null
        group = {
          key,
          label: course
            ? courseNotificationLabel(course)
            : stationNotificationLabel(stationId ? stationsById.get(stationId) ?? null : null),
          pending: 0,
          readyItemIds: [],
          readyAt: 0,
          levels: [],
        }
        groups.set(key, group)
      }

      group.levels.push(stationsById.get(stationId)?.alert_level ?? 'forte')
      if (item.kitchen_status === 'da_preparare') {
        group.pending += 1
      } else {
        group.readyItemIds.push(item.id)
        // ready_at è sempre valorizzato da chi segna "pronto"; il
        // ripiego su sent_at copre una riga arrivata per una strada
        // imprevista, così la notifica non finisce al 1970 in cima
        // all'elenco e con un orario assurdo.
        const at = new Date(item.ready_at ?? item.sent_at).getTime()
        if (at > group.readyAt) group.readyAt = at
      }
    }

    for (const group of groups.values()) {
      if (group.pending > 0 || group.readyItemIds.length === 0) continue
      out.push({
        kind:       'stato',
        key:        `${order.id}:${group.key}`,
        orderId:    order.id,
        tableId:    order.table_id,
        tableName,
        label:      group.label,
        text:       toServeText(tableName, group.label),
        itemIds:    group.readyItemIds,
        alertLevel: strongestAlertLevel(group.levels),
        at:         group.readyAt,
      })
    }
  }

  return out.sort((a, b) => a.at - b.at)
}

/* ── Notifiche EVENTO ──
   Righe di hall_notifications non ancora lette. A differenza di quelle
   di stato non sono ricavabili da nessun altro dato: "chiama sala" non
   lascia traccia da nessuna parte, e senza la riga un tablet riavviato
   nell'istante della chiamata la perderebbe per sempre. ── */
function eventText(row, station) {
  if (row.type === 'chiama_sala') {
    return station ? `${station.name} chiama la sala` : 'La cucina chiama la sala'
  }
  // Tipo previsto dal CHECK ma non ancora scritto da nessun punto del
  // codice: il testo c'è già perché il giorno in cui verrà scritto non
  // serva toccare questa funzione.
  if (row.type === 'prodotto_esaurito') {
    return `${row.payload?.item_name ?? 'Un prodotto'} è esaurito`
  }
  return 'Avviso dalla cucina'
}

export function buildEventNotifications(rows, activeStations) {
  const stationsById = new Map(activeStations.map((s) => [s.id, s]))
  return rows.map((row) => {
    const station = row.station_id ? stationsById.get(row.station_id) ?? null : null
    return {
      kind:       'evento',
      key:        `evento:${row.id}`,
      id:         row.id,
      type:       row.type,
      tableId:    row.table_id ?? null,
      text:       eventText(row, station),
      // Gli eventi suonano sempre: non appartengono a una postazione nel
      // senso di alert_level (quello governa i piatti pronti), e una
      // chiamata della cucina è per definizione una richiesta di
      // attenzione immediata.
      alertLevel: 'forte',
      at:         new Date(row.created_at).getTime(),
    }
  })
}

// Elenco unico, dalla più vecchia alla più recente.
export function mergeNotifications(stateNotifications, eventNotifications) {
  return [...stateNotifications, ...eventNotifications].sort((a, b) => a.at - b.at)
}

// Tavoli con qualcosa da servire, per l'indicazione sulla card nella
// piantina. Due filtri, entrambi necessari:
//   - 'nessuno' resta fuori: quella postazione chiede di non dare nessun
//     avviso, e la card è un avviso;
//   - solo gli ordini passati in `visibleOrderIds`, cioè quelli che la
//     piantina sta mostrando. Le notifiche coprono tutti gli ordini
//     aperti del locale, anche di altre date o turni: senza questo
//     filtro un ordine dimenticato aperto ieri sera marcherebbe il
//     tavolo come "da servire" in una griglia dove quel tavolo è libero.
export function tableIdsToServe(notifications, visibleOrderIds) {
  const ids = new Set()
  for (const n of notifications) {
    if (n.kind !== 'stato' || n.alertLevel === 'nessuno') continue
    if (!visibleOrderIds.has(n.orderId)) continue
    if (n.tableId) ids.add(n.tableId)
  }
  return ids
}
