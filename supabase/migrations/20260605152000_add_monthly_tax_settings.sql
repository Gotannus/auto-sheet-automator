CREATE TABLE IF NOT EXISTS public.monthly_tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  investment_tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1215,
  revenue_tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, month)
);

INSERT INTO public.monthly_tax_settings (
  user_id,
  year,
  month,
  investment_tax_rate,
  revenue_tax_rate
)
SELECT
  user_id,
  year,
  month_value,
  tax_rate,
  0
FROM public.monthly_settings
CROSS JOIN generate_series(1, 12) AS months(month_value)
ON CONFLICT (user_id, year, month) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_tax_settings TO authenticated;
GRANT ALL ON public.monthly_tax_settings TO service_role;

ALTER TABLE public.monthly_tax_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own monthly tax settings" ON public.monthly_tax_settings;
CREATE POLICY "own monthly tax settings" ON public.monthly_tax_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS mts_uat ON public.monthly_tax_settings;
CREATE TRIGGER mts_uat BEFORE UPDATE ON public.monthly_tax_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
