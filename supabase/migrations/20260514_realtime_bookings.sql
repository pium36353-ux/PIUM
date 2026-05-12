-- Abilita Realtime sulla tabella bookings
-- Necessario per ricevere eventi INSERT/UPDATE nel client dashboard
alter publication supabase_realtime add table bookings;
