-- ============================================================
-- create_booking v6 — hardening server-side
-- ============================================================
-- Aggiunge controlli lato DB SENZA rimuovere nessuna difesa esistente:
--   (INVARIATO) advisory lock, validazione servizi, anti-doppione email,
--               check capacità con durata totale, insert pending.
--   (NUOVO)     rifiuto data passata, validazione formato email/telefono,
--               validazione orari di apertura (specchio di generateSlots),
--               backstop tetto pending per business, backstop anti-flood.
-- Stessa identica firma della v5 multi-servizio (20260719_booking_multi_service.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_booking(
  p_business_id    uuid,
  p_service_id     uuid,
  p_customer_name  text,
  p_customer_email text,
  p_date           date,
  p_time           time without time zone,
  p_customer_phone text DEFAULT NULL::text,
  p_service_names  text DEFAULT NULL::text,
  p_service_ids    uuid[] DEFAULT NULL::uuid[]
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking_id     uuid;
  v_total_duration int;
  v_hours          jsonb;
  v_day            jsonb;
  v_day_key        text;
  v_start_min      int;
  v_end_min        int;
  v_ok             boolean := false;
  v_rstart         int;
  v_rend           int;
  v_pending_total  int;
  v_recent_count   int;
begin
  -- (INVARIATO) Lock anti race-condition: serializza le prenotazioni per stesso business+giorno.
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_date::text, 0));

  -- (NUOVO) Rifiuto data nel passato.
  -- Nota: current_date è in UTC; per l'Italia (sempre UTC+1/+2) la data locale è >= UTC,
  -- quindi una prenotazione per "oggi locale" non viene mai erroneamente rifiutata.
  if p_date < current_date then
    raise exception 'La data selezionata è già passata';
  end if;

  -- (NUOVO) Validazione formato email (specchio della regex client).
  if p_customer_email is null
     or p_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Indirizzo email non valido';
  end if;

  -- (NUOVO) Validazione formato telefono, solo se fornito (il parametro resta opzionale).
  if p_customer_phone is not null and btrim(p_customer_phone) <> ''
     and p_customer_phone !~ '^[0-9[:space:]+()\-]{6,20}$' then
    raise exception 'Numero di telefono non valido';
  end if;

  -- (INVARIATO) Validazione servizi + calcolo durata totale.
  if p_service_ids is not null and array_length(p_service_ids, 1) > 0 then
    if exists (
      select 1 from unnest(p_service_ids) as sid
      where not exists (
        select 1 from services
        where id = sid and business_id = p_business_id and is_available = true
      )
    ) then
      raise exception 'Servizio non disponibile';
    end if;
    select coalesce(sum(coalesce(duration_min, 60)), 60) into v_total_duration
    from services where id = any(p_service_ids);
  else
    if not exists (
      select 1 from services
      where id = p_service_id and business_id = p_business_id and is_available = true
    ) then
      raise exception 'Servizio non disponibile';
    end if;
    select coalesce(duration_min, 60) into v_total_duration
    from services where id = p_service_id;
  end if;

  -- (NUOVO) Validazione orari di apertura, specchio server-side di generateSlots (BookingSection.jsx).
  -- La prenotazione [inizio, inizio+durata_totale] deve rientrare INTERAMENTE in una fascia attiva.
  select opening_hours into v_hours from businesses where id = p_business_id;
  -- dow: 0=Domenica..6=Sabato, identico a JS getDay() usato dal client.
  v_day_key := (array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])[extract(dow from p_date)::int + 1];
  v_day := v_hours -> v_day_key;

  if v_day is null or coalesce((v_day->>'closed')::boolean, false) then
    raise exception 'L''attività è chiusa nel giorno selezionato';
  end if;

  v_start_min := extract(hour from p_time)::int * 60 + extract(minute from p_time)::int;
  v_end_min   := v_start_min + v_total_duration;

  if (v_day ? 'morning') or (v_day ? 'afternoon') then
    -- Nuovo formato: fasce mattina/pomeriggio con flag active.
    if coalesce((v_day->'morning'->>'active')::boolean, false)
       and (v_day->'morning'->>'open')  ~ '^[0-9]{1,2}:[0-9]{2}$'
       and (v_day->'morning'->>'close') ~ '^[0-9]{1,2}:[0-9]{2}$' then
      v_rstart := split_part(v_day->'morning'->>'open',  ':', 1)::int * 60 + split_part(v_day->'morning'->>'open',  ':', 2)::int;
      v_rend   := split_part(v_day->'morning'->>'close', ':', 1)::int * 60 + split_part(v_day->'morning'->>'close', ':', 2)::int;
      if v_start_min >= v_rstart and v_end_min <= v_rend then v_ok := true; end if;
    end if;
    if not v_ok
       and coalesce((v_day->'afternoon'->>'active')::boolean, false)
       and (v_day->'afternoon'->>'open')  ~ '^[0-9]{1,2}:[0-9]{2}$'
       and (v_day->'afternoon'->>'close') ~ '^[0-9]{1,2}:[0-9]{2}$' then
      v_rstart := split_part(v_day->'afternoon'->>'open',  ':', 1)::int * 60 + split_part(v_day->'afternoon'->>'open',  ':', 2)::int;
      v_rend   := split_part(v_day->'afternoon'->>'close', ':', 1)::int * 60 + split_part(v_day->'afternoon'->>'close', ':', 2)::int;
      if v_start_min >= v_rstart and v_end_min <= v_rend then v_ok := true; end if;
    end if;
  else
    -- Vecchio formato: open/close singolo (fallback 09:00-18:00 come il client).
    if (v_day->>'open') ~ '^[0-9]{1,2}:[0-9]{2}$' then
      v_rstart := split_part(v_day->>'open', ':', 1)::int * 60 + split_part(v_day->>'open', ':', 2)::int;
    else
      v_rstart := 9 * 60;
    end if;
    if (v_day->>'close') ~ '^[0-9]{1,2}:[0-9]{2}$' then
      v_rend := split_part(v_day->>'close', ':', 1)::int * 60 + split_part(v_day->>'close', ':', 2)::int;
    else
      v_rend := 18 * 60;
    end if;
    if v_start_min >= v_rstart and v_end_min <= v_rend then v_ok := true; end if;
  end if;

  if not v_ok then
    raise exception 'Orario fuori dagli orari di apertura';
  end if;

  -- (INVARIATO) Anti-doppione: 1 pending per email per business.
  if exists (
    select 1 from bookings
    where business_id = p_business_id
      and lower(customer_email) = lower(p_customer_email)
      and status = 'pending'
  ) then
    raise exception 'Hai già una prenotazione in attesa per questa attività';
  end if;

  -- (NUOVO) Backstop: tetto totale prenotazioni pending per business (soglia tunabile).
  -- Limita il danno di una creazione in massa anche se l'anti-bot venisse in parte aggirato.
  select count(*) into v_pending_total
  from bookings
  where business_id = p_business_id and status = 'pending';
  if v_pending_total >= 200 then
    raise exception 'Il calendario prenotazioni è momentaneamente pieno. Riprova più tardi';
  end if;

  -- (NUOVO) Backstop anti-flood: max prenotazioni per business in una finestra breve (soglia tunabile).
  select count(*) into v_recent_count
  from bookings
  where business_id = p_business_id
    and created_at > now() - interval '10 minutes';
  if v_recent_count >= 20 then
    raise exception 'Troppe richieste in poco tempo. Riprova tra qualche minuto';
  end if;

  -- (INVARIATO) Check capacità con durata TOTALE.
  if (
    select count(*)
    from get_taken_slots(p_business_id, p_date) t
    where p_time < (t.start_time + make_interval(mins => t.duration_minutes))
      and (p_time + make_interval(mins => v_total_duration)) > t.start_time
  ) >= (select booking_capacity from businesses where id = p_business_id)
  then raise exception 'Orario non più disponibile';
  end if;

  -- (INVARIATO) Insert prenotazione pending.
  insert into bookings (
    business_id, service_id, service_ids, service_names,
    customer_name, customer_email, customer_phone,
    appointment_date, appointment_time, status
  ) values (
    p_business_id, p_service_id, p_service_ids, p_service_names,
    p_customer_name, lower(p_customer_email), p_customer_phone,
    p_date, p_time, 'pending'
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$function$;

-- Mantiene invariata la raggiungibilità attuale (anon/authenticated) + garantisce l'accesso
-- al service_role usato dalla Edge Function create-booking. La revoca dell'accesso anon
-- è in una migration separata (20260806_create_booking_revoke_anon.sql), da applicare
-- solo dopo il deploy della Edge Function + frontend.
grant execute on function public.create_booking(uuid, uuid, text, text, date, time, text, text, uuid[]) to anon, authenticated, service_role;
