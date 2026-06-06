ALTER TABLE public.daily_manual_inputs
  ADD COLUMN IF NOT EXISTS sales_override integer,
  ADD COLUMN IF NOT EXISTS revenue_override numeric(14,2);