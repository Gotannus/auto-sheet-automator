
ALTER TABLE public.celetus_sales ADD COLUMN IF NOT EXISTS line_item_code text;

-- Drop the old unique constraint/index that collapses multiple OBs per order
ALTER TABLE public.celetus_sales DROP CONSTRAINT IF EXISTS celetus_sales_user_id_transaction_code_src_kind_key;
DROP INDEX IF EXISTS public.celetus_sales_user_id_transaction_code_src_kind_key;
DROP INDEX IF EXISTS public.celetus_sales_user_transaction_src_kind_idx;

-- New unique key: per-line dedup. Falls back to src:kind when line_item_code is null (legacy rows).
CREATE UNIQUE INDEX IF NOT EXISTS celetus_sales_user_transaction_line_uniq
  ON public.celetus_sales (
    user_id,
    transaction_code,
    COALESCE(line_item_code, src || ':' || kind)
  );
