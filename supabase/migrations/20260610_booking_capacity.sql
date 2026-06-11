-- Capacità postazioni: quanti clienti il business può servire in parallelo
alter table public.businesses
  add column if not exists booking_capacity int not null default 1
  check (booking_capacity between 1 and 50);

-- get_taken_slots v2: include anche i bookings pending (durata dal servizio, fallback 60 min)
create or replace function get_taken_slots(p_business_id uuid, p_date date)
returns table(start_time time, duration_minutes int)
language sql security definer set search_path = public
as $$
  select a.start_time, a.duration_minutes
  from appointments a
  where a.business_id = p_business_id and a.date = p_date
  union all
  select b.appointment_time as start_time,
         coalesce(s.duration_min, 60) as duration_minutes
  from bookings b
  left join services s on s.id = b.service_id
  where b.business_id = p_business_id
    and b.appointment_date = p_date
    and b.status = 'pending';
$$;

-- create_booking v3: aggiunge check di capacità (stessa firma di 20260519_booking_services.sql)
drop function if exists create_booking(uuid, uuid, text, text, date, time, text, text);

create function create_booking(
  p_business_id    uuid,
  p_service_id     uuid,
  p_customer_name  text,
  p_customer_email text,
  p_date           date,
  p_time           time,
  p_customer_phone text default null,
  p_service_names  text default null
) returns uuid
language plpgsql security definer set search_path = public
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

  if exists (
    select 1 from bookings
    where business_id = p_business_id
      and lower(customer_email) = lower(p_customer_email)
      and status = 'pending'
  ) then
    raise exception 'Hai già una prenotazione in attesa per questa attività';
  end if;

  -- Check 3: capacità — confermati + pending sovrapposti devono essere < booking_capacity
  if (
    select count(*)
    from get_taken_slots(p_business_id, p_date) t
    where p_time < (t.start_time + make_interval(mins => t.duration_minutes))
      and (p_time + make_interval(mins => coalesce(
            (select duration_min from services where id = p_service_id), 60))) > t.start_time
  ) >= (select booking_capacity from businesses where id = p_business_id)
  then raise exception 'Orario non più disponibile';
  end if;

  insert into bookings (
    business_id, service_id, service_names,
    customer_name, customer_email, customer_phone,
    appointment_date, appointment_time, status
  ) values (
    p_business_id, p_service_id, p_service_names,
    p_customer_name, lower(p_customer_email), p_customer_phone,
    p_date, p_time, 'pending'
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

grant execute on function create_booking(uuid, uuid, text, text, date, time, text, text) to anon, authenticated;
