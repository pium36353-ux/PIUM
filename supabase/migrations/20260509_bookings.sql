-- ============================================================
-- Booking system V1
-- ============================================================

create table bookings (
  id               uuid primary key default uuid_generate_v4(),
  business_id      uuid not null references businesses(id) on delete cascade,
  service_id       uuid references services(id) on delete set null,
  customer_name    text not null,
  customer_email   text not null,
  customer_phone   text,
  appointment_date date not null,
  appointment_time time not null,
  status           text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'cancelled')),
  created_at       timestamptz not null default now()
);

create index idx_bookings_business_id on bookings(business_id);
create index idx_bookings_email       on bookings(lower(customer_email));

alter table bookings enable row level security;

-- Owner can read all bookings for their business
create policy "bookings: owner read"
  on bookings for select
  using (
    exists (
      select 1 from businesses b
      where b.id = bookings.business_id
        and b.user_id = auth.uid()
    )
  );

-- Owner can cancel bookings
create policy "bookings: owner update"
  on bookings for update
  using (
    exists (
      select 1 from businesses b
      where b.id = bookings.business_id
        and b.user_id = auth.uid()
    )
  );

-- ============================================================
-- RPC: get_taken_slots
-- Public SECURITY DEFINER — exposes only time/duration, not
-- client names or notes, for slot availability calculation.
-- ============================================================
create or replace function get_taken_slots(p_business_id uuid, p_date date)
returns table(start_time time, duration_minutes int)
language sql
security definer
set search_path = public
as $$
  select a.start_time, a.duration_minutes
  from appointments a
  where a.business_id = p_business_id
    and a.date = p_date;
$$;

grant execute on function get_taken_slots(uuid, date) to anon, authenticated;

-- ============================================================
-- RPC: confirm_booking
-- Authenticated SECURITY DEFINER — validates that the caller's
-- OTP-verified email matches p_customer_email, enforces 1-active-
-- booking antiabuse, then atomically writes bookings + appointments.
-- ============================================================
create or replace function confirm_booking(
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
  v_booking_id   uuid;
  v_duration_min int;
  v_price        numeric;
begin
  if auth.email() is null or lower(auth.email()) <> lower(p_customer_email) then
    raise exception 'Verifica email non valida';
  end if;

  if exists (
    select 1 from bookings
    where business_id = p_business_id
      and lower(customer_email) = lower(p_customer_email)
      and status in ('pending', 'confirmed')
  ) then
    raise exception 'Hai già una prenotazione attiva per questa attività';
  end if;

  select duration_min, price
  into v_duration_min, v_price
  from services
  where id = p_service_id
    and business_id = p_business_id
    and is_available = true;

  if not found then
    raise exception 'Servizio non disponibile';
  end if;

  insert into bookings (
    business_id, service_id, customer_name, customer_email,
    customer_phone, appointment_date, appointment_time, status
  ) values (
    p_business_id, p_service_id, p_customer_name, lower(p_customer_email),
    p_customer_phone, p_date, p_time, 'confirmed'
  ) returning id into v_booking_id;

  insert into appointments (
    business_id, client_name, date, start_time, duration_minutes, price, notes
  ) values (
    p_business_id,
    p_customer_name,
    p_date,
    p_time,
    coalesce(v_duration_min, 60),
    v_price,
    'Prenotazione online – ' || lower(p_customer_email)
    || case when p_customer_phone is not null then ' · ' || p_customer_phone else '' end
  );

  return v_booking_id;
end;
$$;

grant execute on function confirm_booking(uuid, uuid, text, text, text, date, time) to authenticated;
