-- ============================================================
-- 20260816_affiliate_code_on_suffix_validation.sql
--
-- COSA FA: sostituisce la FK businesses_affiliate_code_fkey
-- (businesses.affiliate_code → affiliates.code) con un trigger di
-- validazione che accetta anche il suffisso virtuale "-on".
--
-- PERCHÉ: la FK era stata aggiunta A MANO in produzione (SQL Editor,
-- mai documentata in una migration) come protezione anti-codici
-- spazzatura. Ma il canale scontato usa il codice con suffisso "-on"
-- (es. "proabwd-on") che per design NON è un record di affiliates:
-- stripe-checkout applica il coupon leggendo il suffisso intero,
-- stripe-webhook lo strippa per il match commissioni. La FK rifiutava
-- quindi ogni registrazione dal canale -on: insert 23503 → HTTP 409.
--
-- COSA CAMBIA: il trigger strippa un eventuale "-on" finale e valida
-- il codice BASE contro affiliates.code. Spazzatura ancora rifiutata
-- (stessa protezione della FK), codici validi passano con o senza -on.
-- Il valore salvato in businesses.affiliate_code resta INTATTO
-- (suffisso compreso): checkout e webhook non cambiano.
-- ============================================================

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_affiliate_code_fkey;

-- SECURITY DEFINER: chi si registra non ha diritti RLS di lettura su
-- affiliates; la FK bypassava RLS, il trigger deve poter fare lo stesso.
CREATE OR REPLACE FUNCTION public.validate_affiliate_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
BEGIN
  -- Nessun referral: passa (parità con la FK, che ignora i NULL).
  IF NEW.affiliate_code IS NULL OR btrim(NEW.affiliate_code) = '' THEN
    NEW.affiliate_code := NULL;
    RETURN NEW;
  END IF;

  v_base := regexp_replace(lower(btrim(NEW.affiliate_code)), '-on$', '');

  IF NOT EXISTS (SELECT 1 FROM public.affiliates WHERE lower(code) = v_base) THEN
    -- Il marcatore AFFILIATE_CODE_INVALID è riconosciuto da Onboarding.jsx
    -- per mostrare un messaggio dedicato: non rinominarlo senza allinearli.
    RAISE EXCEPTION 'AFFILIATE_CODE_INVALID: nessun affiliato con codice %', NEW.affiliate_code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_businesses_validate_affiliate_code ON public.businesses;
CREATE TRIGGER trg_businesses_validate_affiliate_code
  BEFORE INSERT OR UPDATE OF affiliate_code ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_affiliate_code();
