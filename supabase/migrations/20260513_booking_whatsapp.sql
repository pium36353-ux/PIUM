-- ============================================================
-- Booking WhatsApp: booking_id su appointments
-- ============================================================

alter table appointments
  add column if not exists booking_id uuid references bookings(id) on delete set null;

create index if not exists idx_appointments_booking_id on appointments(booking_id);

-- Aggiorna owner_confirm_booking per salvare booking_id nell'appuntamento
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
    business_id, client_name, date, start_time, duration_minutes, price, notes, booking_id
  ) values (
    v_booking.business_id,
    v_booking.customer_name,
    v_booking.appointment_date,
    v_booking.appointment_time,
    coalesce(v_dur, 60),
    v_price,
    'Prenotazione confermata – ' || v_booking.customer_email
    || case when v_booking.customer_phone is not null then ' · ' || v_booking.customer_phone else '' end,
    p_booking_id
  );
end;
$$;

grant execute on function owner_confirm_booking(uuid) to authenticated;
