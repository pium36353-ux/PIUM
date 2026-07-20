-- Già applicato manualmente in produzione il 2026-07-20 (SQL Editor).
-- Questa migration documenta lo stato reale del DB per ambienti nuovi.
-- owner_email = email di registrazione dell'utente (da auth.users),
-- distinta da email (contatto pubblico mostrato sul sito).
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS owner_email text;

UPDATE public.businesses b
SET owner_email = u.email
FROM auth.users u
WHERE u.id = b.user_id
  AND b.owner_email IS NULL;
