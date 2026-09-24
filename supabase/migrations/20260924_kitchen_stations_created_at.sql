-- ============================================================
-- Fix: kitchen_stations.created_at mancante.
--
-- La migration 20260924_kitchen_courses_stations.sql ha creato
-- kitchen_stations senza una colonna created_at (solo id, business_id,
-- name, is_active) — copiata per errore dal modello di business_turns,
-- che non ha created_at nemmeno lui, ma kitchenSeed.js/kitchenRouting.js
-- ordinano le postazioni per created_at (serve un ordine stabile per "la
-- prima postazione attiva" usata come ripiego, vedi kitchenRouting.js).
-- La select falliva con 42703 (colonna inesistente), quindi il seeding
-- della postazione "Cucina" non arrivava mai a scrivere.
--
-- Additiva, nessun impatto sulle righe esistenti.
-- ============================================================

ALTER TABLE kitchen_stations
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
