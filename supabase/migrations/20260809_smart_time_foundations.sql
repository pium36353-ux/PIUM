-- ============================================================
-- Smart Time — Fase 1: fondamenta dati (solo schema)
-- ============================================================
-- Tracciamento del tempo REALE di lavorazione degli appuntamenti,
-- misurato con start/stop manuale dal commerciante, attivabile per-business.
-- I tempi nascono "temporanei" e vengono poi confermati/corretti/scartati.
--
-- Questo passo aggiunge SOLO le colonne. Nessuna UI, nessun timer, nessuna
-- logica applicativa. Idempotente (ADD COLUMN IF NOT EXISTS).
--
-- RLS: NON toccata. La policy row-level esistente "appointments: owner access"
-- (schema.sql) è a livello di riga e copre automaticamente le nuove colonne.
-- ============================================================

-- ── businesses ──
-- smart_time_enabled: attiva/disattiva per questo business la modalità di
--   tracciamento del tempo reale (start/stop manuale). Preferenza per-business,
--   default off: la funzione è opt-in.
alter table public.businesses
  add column if not exists smart_time_enabled boolean not null default false;

-- ── appointments ──
alter table public.appointments
  -- actual_start_at: istante del tap "inizio lavorazione" (cronometro).
  --   Null finché il commerciante non avvia il tracciamento.
  add column if not exists actual_start_at timestamptz,

  -- actual_end_at: istante del tap "fine lavorazione" (cronometro).
  --   Null finché il tracciamento non viene fermato.
  add column if not exists actual_end_at   timestamptz,

  -- manual_minutes: durata inserita a mano dal commerciante, alternativa al
  --   cronometro (start/end). Null quando si usa il cronometro o non c'è tempo.
  add column if not exists manual_minutes  int,

  -- time_status: stato del tempo tracciato per l'appuntamento.
  --   'none'      = nessun tempo tracciato (default)
  --   'temp'      = tempo temporaneo, in attesa di conferma del commerciante
  --   'confirmed' = tempo confermato dal commerciante (valido per le statistiche)
  --   'excluded'  = tempo scartato/escluso (non conteggiato nelle statistiche)
  add column if not exists time_status text not null default 'none'
    check (time_status in ('none','temp','confirmed','excluded'));
