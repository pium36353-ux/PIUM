-- ============================================================
-- Booking V2: rimuovi OTP, flusso pending + conferma manuale
-- ============================================================

-- Rimuovi vecchia RPC (aveva check auth.email())
drop function if exists confirm_booking(uuid, uuid, text, text, text, date, time);

-- ============================================================
-- create_booking — pubblico, nessuna sessione richiesta
-- Salva la prenotazione come 'pending', non crea appuntamento.
-- ============================================================
create or replace function create_booking(
  p_business_id    uuid,
  p_service_id     uuid,
  p_customer_name  text,
  p_customer_email text,
  p_customer_phone text,
  p_date           date,
  p_time           time
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
begin
  if not exists (
    select 1 from services
    where id = p_service_id
      and business_id = p_business_id
      and is_available = true
  ) then
    raise exception 'Servizio non disponibile';
  end if;

  -- Antiabuse: 1 pending per email per business
  if exists (
    select 1 from bookings
    where business_id = p_business_id
      and lower(customer_email) = lower(p_customer_email)
      and status = 'pending'
  ) then
    raise exception 'Hai già una prenotazione in attesa per questa attività';
  end if;

  insert into bookings (
    business_id, service_id, customer_name, customer_email,
    customer_phone, appointment_date, appointment_time, status
  ) values (
    p_business_id, p_service_id, p_customer_name, lower(p_customer_email),
    p_customer_phone, p_date, p_time, 'pending'
  ) returning id into v_booking_id;

  return v_booking_id;
end;
$$;

grant execute on function create_booking(uuid, uuid, text, text, text, date, time) to anon, authenticated;

-- ============================================================
-- owner_confirm_booking — solo titolare autenticato
-- Aggiorna status a 'confirmed' e crea l'appuntamento in agenda.
-- ============================================================
create or replace function owner_confirm_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings%rowtype;
  v_dur     int;
  v_price   numeric;
begin
  select b.* into v_booking
  from bookings b
  join businesses biz on biz.id = b.business_id
  where b.id = p_booking_id
    and biz.user_id = auth.uid();

  if not found then
    raise exception 'Prenotazione non trovata';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'La prenotazione non è in attesa';
  end if;

  select duration_min, price into v_dur, v_price
  from services where id = v_booking.service_id;

  update bookings set status = 'confirmed' where id = p_booking_id;

  insert into appointments (
    business_id, client_name, date, start_time, duration_minutes, price, notes
  ) values (
    v_booking.business_id,
    v_booking.customer_name,
    v_booking.appointment_date,
    v_booking.appointment_time,
    coalesce(v_dur, 60),
    v_price,
    'Prenotazione confermata – ' || v_booking.customer_email
    || case when v_booking.customer_phone is not null then ' · ' || v_booking.customer_phone else '' end
  );
end;
$$;

grant execute on function owner_confirm_booking(uuid) to authenticated;
