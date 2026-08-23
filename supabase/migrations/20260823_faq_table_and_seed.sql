-- ============================================================
-- 20260823_faq_table_and_seed.sql
--
-- COSA FA: crea la tabella `faq` (se non esiste già) e ne popola/allinea il
-- contenuto — stesso pattern delle altre tabelle "fantasma" di questo
-- progetto (affiliates, legal_acceptances, admin_messages...): create in
-- produzione a mano via SQL Editor, mai tracciate in una migration.
--
-- PERCHÉ ORA: durante una revisione della FAQ affiliati sono emerse due
-- risposte con numeri di commissione superati (25€/mese fisso, cap a 12
-- mensilità) invece del modello ON/OFF attuale (29,99€/19,99€ per i primi 12
-- mesi a seconda del canale, poi 15€/mese a vita in fase di assistenza — vedi
-- commissionFor() in stripe-webhook/index.ts). Nella stessa passata sono stati
-- sistemati anche 9 apostrofi mancanti (elisioni: "l app"→"l'app", "all
-- agenda"→"all'agenda", "all editor"→"all'editor", "L AI"→"L'AI", "una
-- email"→"un'email") e riscritta la risposta sull'installazione dell'app per
-- distinguere il percorso Android (Chrome) da quello iPhone (solo Safari →
-- Condividi → Aggiungi a Home). Correggendole si è colta l'occasione per
-- tracciare finalmente l'intera tabella: se il DB venisse ripristinato o
-- azzerato, oggi tutto il contenuto della FAQ andrebbe perso.
--
-- ID espliciti: ogni riga usa lo stesso UUID già presente in produzione (letto
-- via query di sola lettura sull'endpoint pubblico REST, RLS permettendo solo
-- SELECT). L'upsert è quindi idempotente e allinea, non duplica, se rieseguito
-- o se applicato su un ambiente che ha già queste righe.
-- ============================================================

create table if not exists public.faq (
  id         uuid primary key default gen_random_uuid(),
  categoria  text not null,
  domanda    text not null,
  risposta   text not null,
  link       text,
  ordine     integer default 0,
  created_at timestamp default now()
);

alter table public.faq enable row level security;

drop policy if exists "Lettura pubblica FAQ" on public.faq;
create policy "Lettura pubblica FAQ" on public.faq
  for select using (true);

insert into public.faq (id, categoria, domanda, risposta, link, ordine) values

-- ── Account ──────────────────────────────────────────────────────────────
('b1cc0f6c-95c1-4dbf-8b5b-b793aceb9d72', 'Account', 'Come cambio la mia password?', 'Vai alla pagina di login e clicca su Password dimenticata.', '/auth', 1),
('a314ee9f-9b7a-450a-a2d1-57b4641ebb5f', 'Account', 'Come installo l''app sul telefono?', 'Su Android: apri piumapp.com da Chrome, apparirà un banner per installarla. Su iPhone: apri piumapp.com da Safari, tocca Condividi e poi "Aggiungi a Home".', null, 2),
('c074c5fe-484b-4f01-9833-efb7fd4a0050', 'Account', 'Non ricevo le notifiche, cosa faccio?', 'Vai alle impostazioni e verifica che le notifiche push siano abilitate.', '/settings', 3),
('c65fa8df-7ed1-467b-9e93-4b60b32b4c9a', 'Account', 'Come contatto il supporto?', 'Scrivi un''email a info@piumapp.com e ti risponderemo al più presto.', null, 4),
('b0cf438a-6a82-4767-918c-2e1213a22988', 'Account', 'Devo confermare la mia email per usare PIUM?', 'Sì, dopo la registrazione ti arriva un''email di conferma. Finché non confermi, non potrai accedere al tuo account. Se non la trovi, controlla anche nella cartella spam.', null, 5),
('98ad105a-baa0-42c4-905d-b4735d8346a9', 'Account', 'Posso cancellare il mio abbonamento in qualsiasi momento?', 'Sì, puoi disdire quando vuoi scrivendo a info@piumapp.com. La disdetta ha effetto alla fine del periodo già pagato: non ci sono penali, ma non vengono effettuati rimborsi per il periodo in corso.', null, 6),

-- ── Affiliati ────────────────────────────────────────────────────────────
-- Righe "Quanto guadagno..." e "Per quanto tempo guadagno..." corrette in
-- questa migration: numeri vecchi (25€/mese fisso, cap 12 mensilità) → modello
-- ON/OFF attuale (29,99/19,99 primi 12 mesi, 15€/mese a vita dal 13°).
('a4bc4add-28ca-4554-b8ac-8a125f8ebf39', 'Affiliati', 'Come divento affiliato?', 'Registrati come affiliato tramite il link qui sotto.', '/affiliates/auth', 1),
('261e9a7f-768e-45a2-83c5-856afede253a', 'Affiliati', 'Come trovo il mio link personale?', 'Vai alla dashboard affiliati per trovare il tuo link e codice personale.', '/affiliates', 2),
('d41b8a6e-9c2e-4b7f-8a11-6f1a2b3c4d5e', 'Affiliati', 'Qual è la differenza tra i due link che ho nella dashboard?', 'Hai due link referral. Il link diretto porta il cliente al prezzo pieno (99,99€/mese) e ti dà la commissione più alta (29,99€/mese). Il link scontato offre al cliente un prezzo ridotto (69,99€/mese) e ti dà una commissione di 19,99€/mese: è utile quando il cliente è indeciso e uno sconto può aiutarti a chiudere. Scegli tu quale usare in base alla situazione — entrambi i clienti vengono conteggiati nella tua dashboard.', null, 3),
('354aad91-5e91-490b-af65-a2e6b5ada562', 'Affiliati', 'Come vedo i miei guadagni?', 'Vai alla dashboard affiliati per vedere clienti portati, stato e guadagni maturati.', '/affiliates', 4),
('64e48f30-eaca-438b-9100-ccc9276b8029', 'Affiliati', 'Quanto guadagno per ogni cliente che porto?', 'Ricevi una commissione ricorrente ogni mese, per ogni cliente che porti, finché resta abbonato. L''importo dipende dal canale con cui acquisisci il cliente: con il link diretto (cliente a 99,99€/mese) guadagni 29,99€ al mese per i primi 12 mesi; con il link scontato online (cliente a 69,99€/mese) guadagni 19,99€ al mese per i primi 12 mesi. Dopo il 12° mese la commissione continua a 15€ al mese finché il cliente resta abbonato (fase di assistenza continuativa). Trovi entrambi i tuoi link nella dashboard affiliati.', null, 5),
('2554c7f4-51a1-4188-ab95-93916732dfe0', 'Affiliati', 'Per quanto tempo guadagno su un cliente?', 'Guadagni su un cliente finché resta abbonato e pagante, senza limiti di tempo. Per i primi 12 mesi ricevi la commissione piena (29,99€ o 19,99€ al mese a seconda del canale); dal 13° mese in poi ricevi 15€ al mese finché il cliente continua a pagare, per l''assistenza continuativa. Il guadagno si interrompe solo se il cliente disdice o smette di pagare. Non devi fare nulla: il sistema calcola tutto in automatico.', null, 6),
('443b0f54-3e02-4bb2-882d-04cc1cd15a7d', 'Affiliati', 'Posso vedere quanto ho guadagnato in tempo reale?', 'Sì. Nella tua dashboard affiliato trovi il numero di clienti portati, quanto hai maturato in totale e quanto è ancora da liquidare. I dati sono calcolati automaticamente a ogni pagamento dei tuoi clienti, senza bisogno di chiedere nulla.', null, 7),
('9f9a0c72-233c-4bae-89f9-64d577329e94', 'Affiliati', 'Cosa succede se mi registro con il mio stesso codice?', 'Non è consentito utilizzare il proprio codice referral per registrare la propria attività o attività di cui si è titolari. Questo genere di registrazioni viene verificato ed escluso dal calcolo delle commissioni, secondo quanto previsto dal Contratto di Affiliazione.', null, 8),

-- ── Agenda ───────────────────────────────────────────────────────────────
('a442f403-8fc6-4280-8620-8de8d2a889dd', 'Agenda', 'Come aggiungo un appuntamento?', 'Vai all''agenda e clicca su uno slot libero per aggiungere un appuntamento.', '/dashboard?s=agenda', 1),
('39f8e3d8-7503-4911-8847-13539129be0e', 'Agenda', 'Come aggiungo un dipendente?', 'Vai all''agenda e clicca su Gestione dipendenti.', '/dashboard?s=agenda', 2),
('b6ac0e78-d565-4f69-bb8b-2823b3946118', 'Agenda', 'Come ricevo una notifica prima di un appuntamento?', 'Vai alle impostazioni e abilita le notifiche push scegliendo i minuti di anticipo.', '/settings', 3),
('c88c986c-41af-4fe9-9a1f-7edaf97d466d', 'Agenda', 'Come segno un appuntamento come completato?', 'Vai all''agenda e clicca sulla spunta verde accanto all''appuntamento.', '/dashboard?s=agenda', 4),
('93cb792a-fcc7-4761-ac33-b12760b9a441', 'Agenda', 'Posso avere più appuntamenti nello stesso orario?', 'Sì, se la tua attività ha più postazioni disponibili in contemporanea. Imposta il numero di "Clienti in contemporanea" da Editor Sito → Orari: da quel momento il sito pubblico accetterà prenotazioni multiple sullo stesso orario, fino al limite che hai impostato.', null, 5),
('cdb94f10-4c85-4170-993f-239f47d54052', 'Agenda', 'Le richieste di prenotazione in attesa bloccano lo slot per altri clienti?', 'Sì. Per evitare overbooking, anche le richieste ancora in attesa di conferma vengono contate nel calcolo della disponibilità. Se confermi o rifiuti rapidamente le richieste in arrivo, liberi prima lo slot per eventuali altri clienti.', null, 6),
('1fb7005e-4761-4094-a645-aef69329085c', 'Agenda', 'Perché non compaiono gli orari disponibili per prenotare sul mio sito?', 'Se la sezione prenotazioni non mostra nessuno slot disponibile, controlla che i tuoi servizi abbiano la durata in minuti inserita. Senza la durata, il sistema non riesce a calcolare gli slot e non mostra nessuna disponibilità. Vai su Dashboard → Servizi → modifica il servizio → inserisci la durata in minuti → salva.', null, 7),

-- ── Recensioni ───────────────────────────────────────────────────────────
('19a62878-b2c3-4d12-9b84-5402bc3bd45f', 'Recensioni', 'Come aggiungo una recensione?', 'Vai alla sezione recensioni e clicca su Aggiungi recensione.', '/dashboard?s=recensioni', 1),
('5987e4b6-7cc7-46e2-8713-338280674f53', 'Recensioni', 'Come pubblico una recensione sul mio sito?', 'Vai alle recensioni e attiva il toggle Pubblica sul sito accanto alla recensione.', '/dashboard?s=recensioni', 2),
('adc3cad4-c254-4587-a995-74cff0f56b34', 'Recensioni', 'Come rispondo a una recensione?', 'Vai alle recensioni, clicca su Rispondi e usa il suggerimento AI oppure scrivi la tua risposta.', '/dashboard?s=recensioni', 3),

-- ── Sito ─────────────────────────────────────────────────────────────────
('4f2df2e6-2f3d-4af8-b0a9-17b24277e532', 'Sito', 'Come vedo il mio sito pubblico?', 'Puoi vedere il tuo sito cliccando su "Vai alla sezione" qui sotto.', '/site/', 1),
('b94d44dc-87a8-465e-81ed-549283ca2c7e', 'Sito', 'Come cambio il titolo del mio sito?', 'Vai all''editor del sito e modifica il titolo principale.', '/dashboard?s=editor', 2),
('5e5f30c7-1096-4150-b146-842c1a4271ce', 'Sito', 'Come cambio la foto di copertina?', 'Vai all''editor del sito e carica una nuova immagine di copertina.', '/dashboard?s=editor', 3),
('6b77f0fc-93b8-477e-8842-88ae2c9f6a47', 'Sito', 'Come scrivo la descrizione della mia attività?', 'Vai all''editor e modifica la sezione Chi siamo.', '/dashboard?s=editor', 4),
('839bac37-dfb2-49f7-997f-c2b83adb85a9', 'Sito', 'Come aggiungo un servizio?', 'Vai alla sezione servizi e clicca su Aggiungi servizio.', '/dashboard?s=servizi', 5),
('c3b209fe-d204-45f6-a60e-151b215f81ce', 'Sito', 'Come modifico il prezzo di un servizio?', 'Vai alla sezione servizi e clicca su modifica accanto al servizio.', '/dashboard?s=servizi', 6),
('52f0a3f2-9ddd-4324-b609-2dc621ec7591', 'Sito', 'Come disattivo un servizio senza eliminarlo?', 'Vai alla sezione servizi e usa il toggle per disattivarlo.', '/dashboard?s=servizi', 7),
('82356053-7246-47ae-8da4-a757ee8f3f3e', 'Sito', 'Quanti clienti posso servire nello stesso orario?', 'Per impostazione predefinita PIUM gestisce una persona alla volta per ogni orario. Se la tua attività ha più postazioni (es. più poltrone, più cabine, più tavoli) puoi aumentare questo numero da Editor Sito → Orari, nel campo "Clienti in contemporanea". In questo modo il sito pubblico accetterà più prenotazioni sullo stesso orario, fino al numero che hai impostato.', null, 8),
('8ba5bb8b-6c63-4ae0-a12f-0040f09a87f3', 'Sito', 'Come copio il link del mio sito?', 'Trovi il link del tuo sito pubblico in alto nella sezione Panoramica della dashboard, con un pulsante "Copia link" che lo mette negli appunti pronto per essere condiviso su WhatsApp, Instagram o dove preferisci. Lo trovi anche nella sezione Editor Sito.', null, 9),
('5eaeea40-f9f2-46b8-95ef-1cd7c00d4834', 'Sito', 'Perché quando condivido il link non si vede l''anteprima con la foto?', 'Se hai appena modificato la foto di copertina o la descrizione, alcune app (WhatsApp, Instagram) potrebbero mostrare ancora l''anteprima precedente per un po'' di tempo, perché la salvano in una cache temporanea. Aspetta qualche minuto o prova a condividere il link aggiungendo un carattere alla fine (es. un punto) per forzare un aggiornamento dell''anteprima.', null, 10),

-- ── Social ───────────────────────────────────────────────────────────────
('bda03202-5338-4297-aaa8-97489f36fee1', 'Social', 'Come creo un post per Facebook o Instagram?', 'Vai alla sezione social e clicca su Genera bozza. L''AI creerà un testo pronto da pubblicare.', '/dashboard?s=social', 1),
('7f54b73c-db74-4438-a942-98b356ef682d', 'Social', 'Come copio il testo generato?', 'Vai alla sezione social e clicca sul pulsante Copia testo sotto la bozza.', '/dashboard?s=social', 2),
('9925b680-255e-425a-8ed7-385c21bfbb9a', 'Social', 'Come modifico il testo prima di pubblicarlo?', 'Vai alla sezione social, clicca sulla bozza e modificala direttamente.', '/dashboard?s=social', 3),
('1b6d5be7-12b6-4e5a-87f8-1640f0b2ad2c', 'Social', 'I post generati con l''AI includono il link al mio sito?', 'Sì. Ogni post generato da PIUM include automaticamente in fondo il link al tuo sito pubblico, così chi legge il post sa dove prenotare o trovare maggiori informazioni sulla tua attività.', null, 4),
('80b03646-cfa9-4f6d-96cb-5566bb48f167', 'Social', 'Posso modificare il post prima di pubblicarlo?', 'Sì. Dopo la generazione puoi modificare liberamente il testo della bozza prima di copiarlo e pubblicarlo sui tuoi canali social. PIUM genera una proposta di partenza, ma il controllo finale è sempre tuo.', null, 5)

on conflict (id) do update set
  categoria = excluded.categoria,
  domanda   = excluded.domanda,
  risposta  = excluded.risposta,
  link      = excluded.link,
  ordine    = excluded.ordine;
