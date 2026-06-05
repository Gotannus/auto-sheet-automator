
-- Replace expression index with a column-based unique constraint so PostgREST upsert can target it.
DROP INDEX IF EXISTS public.celetus_sales_user_transaction_line_uniq;

-- Backfill existing rows so the column is unique-safe.
UPDATE public.celetus_sales
   SET line_item_code = src || ':' || kind
 WHERE line_item_code IS NULL;

ALTER TABLE public.celetus_sales ALTER COLUMN line_item_code SET NOT NULL;
ALTER TABLE public.celetus_sales ALTER COLUMN line_item_code SET DEFAULT '';

ALTER TABLE public.celetus_sales
  ADD CONSTRAINT celetus_sales_user_tx_line_unique
  UNIQUE (user_id, transaction_code, line_item_code);
