ALTER TABLE public.celetus_sales
  ADD COLUMN IF NOT EXISTS original_currency TEXT,
  ADD COLUMN IF NOT EXISTS fx_rate NUMERIC;

UPDATE public.celetus_sales
SET original_currency = 'EUR', fx_rate = 5
WHERE transaction_code = 'HP2864577102' AND original_currency IS NULL;