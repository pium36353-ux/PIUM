-- ============================================================
-- Blocco E, seconda parte: resoconti aggregati (incasso, costo, margine).
--
-- Perché nel database e non nel codice: un mese di servizio supera
-- facilmente le migliaia di voci d'ordine, e PostgREST tronca a 1000
-- righe per default — aggregare lato client vorrebbe dire paginare
-- migliaia di righe a ogni apertura della sezione, o peggio mostrare un
-- totale silenziosamente sbagliato. Qui l'aggregazione costa una query.
--
-- FUSO COME PARAMETRO, mai cablato: p_timezone ha default 'Europe/Rome'
-- ma l'applicazione passa SEMPRE la sua costante condivisa
-- (BUSINESS_TIMEZONE in src/lib/datetime.js), che è l'unica fonte di
-- verità. Quando PIUM andrà in altri paesi diventerà il fuso del singolo
-- business e questa funzione non dovrà cambiare.
--
-- RAGGRUPPAMENTO PER GIORNO/MESE ITALIANO: `sent_at AT TIME ZONE
-- p_timezone` converte l'istante assoluto nell'orario da calendario
-- locale, poi date_trunc taglia sul giorno/mese di QUEL calendario. Una
-- voce inviata alle 00:30 del 28 in Italia (22:30 UTC del 27 in ora
-- legale, 23:30 UTC del 27 in ora solare) finisce nel giorno 28 in
-- entrambi i casi, perché la conversione conosce le regole del fuso.
--
-- QUALE OROLOGIO: i resoconti per giorno/mese usano sent_at (orologio del
-- dispositivo), che è l'ora "vissuta" del servizio — un ordine delle
-- 20:45 deve stare nella sera del suo giorno. Il raggruppamento per
-- chiusura usa invece sent_received_at, perché le finestre delle chiusure
-- sono definite su quello (vedi 20260927_stock_and_costs.sql, nota 3).
--
-- COSTO NON INSERITO: le voci con cost_snapshot NULL entrano
-- nell'incasso ma non nel costo né nel margine, e vengono contate a parte
-- (lines_without_cost / revenue_without_cost) così l'interfaccia può
-- dire quanto del periodo non ha un margine calcolabile invece di
-- spacciare un margine parziale per totale.
-- ============================================================

-- p_to è ESCLUSIVO (sent_at >= p_from AND sent_at < p_to).
-- p_group: 'day' | 'month' | 'closure'.
--   day/month  → bucket_key 'YYYY-MM-DD' / 'YYYY-MM' nel fuso richiesto
--   closure    → bucket_key = id della chiusura che contiene la voce
--                (la prima con period_end >= sent_received_at), oppure
--                'aperto' per il venduto non ancora chiuso.
CREATE OR REPLACE FUNCTION stock_report(
  p_business_id uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_group       text DEFAULT 'day',
  p_timezone    text DEFAULT 'Europe/Rome'
)
RETURNS TABLE (
  bucket_key           text,
  lines_count          int,
  pieces_count         int,
  revenue_gross        numeric,
  cost_real            numeric,
  cost_estimated       numeric,
  margin_real          numeric,
  margin_estimated     numeric,
  lines_without_cost   int,
  revenue_without_cost numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH lines AS (
    SELECT
      toi.quantity,
      COALESCE(toi.price_snapshot, 0)                      AS price,
      COALESCE(toi.vat_rate_snapshot, 0)                   AS vat,
      toi.cost_snapshot,
      toi.cost_source,
      toi.sent_at,
      toi.sent_received_at
    FROM table_order_items toi
    JOIN table_orders o ON o.id = toi.order_id
    WHERE o.business_id = p_business_id
      AND toi.sent_at IS NOT NULL
      AND toi.kitchen_status <> 'annullato'
      AND toi.sent_at >= p_from
      AND toi.sent_at <  p_to
  ),
  keyed AS (
    SELECT
      CASE p_group
        WHEN 'month' THEN
          to_char(date_trunc('month', l.sent_at AT TIME ZONE p_timezone), 'YYYY-MM')
        WHEN 'closure' THEN
          COALESCE(
            (
              SELECT sc.id::text FROM stock_closures sc
              WHERE sc.business_id = p_business_id
                AND l.sent_received_at IS NOT NULL
                AND sc.period_end >= l.sent_received_at
              ORDER BY sc.period_end ASC
              LIMIT 1
            ),
            'aperto'
          )
        ELSE
          to_char(date_trunc('day', l.sent_at AT TIME ZONE p_timezone), 'YYYY-MM-DD')
      END AS bucket_key,
      l.quantity,
      l.price,
      l.vat,
      l.cost_snapshot,
      l.cost_source,
      -- Prezzo unitario senza IVA: price / (1 + aliquota/100).
      (l.price / (1 + l.vat / 100.0)) AS net_price
    FROM lines l
  )
  SELECT
    k.bucket_key,
    count(*)::int,
    COALESCE(sum(k.quantity), 0)::int,
    COALESCE(sum(k.price * k.quantity), 0),
    COALESCE(sum(k.cost_snapshot * k.quantity) FILTER (WHERE k.cost_source = 'reale'), 0),
    COALESCE(sum(k.cost_snapshot * k.quantity) FILTER (WHERE k.cost_source = 'stimato'), 0),
    COALESCE(sum((k.net_price - k.cost_snapshot) * k.quantity) FILTER (WHERE k.cost_source = 'reale'), 0),
    COALESCE(sum((k.net_price - k.cost_snapshot) * k.quantity) FILTER (WHERE k.cost_source = 'stimato'), 0),
    count(*) FILTER (WHERE k.cost_snapshot IS NULL)::int,
    COALESCE(sum(k.price * k.quantity) FILTER (WHERE k.cost_snapshot IS NULL), 0)
  FROM keyed k
  GROUP BY k.bucket_key
  ORDER BY k.bucket_key;
$$;

-- Stessa politica di permessi delle funzioni di 20260927: PUBLIC concede
-- EXECUTE per default e anon lo eredita, quindi si revoca da PUBLIC e si
-- concede esplicitamente solo a authenticated. Le RLS restano la difesa
-- sui dati (SECURITY INVOKER).
REVOKE EXECUTE ON FUNCTION stock_report(uuid, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION stock_report(uuid, timestamptz, timestamptz, text, text) TO authenticated;
