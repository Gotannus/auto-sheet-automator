-- Regras da página Validação, uma linha por empresa
CREATE TABLE IF NOT EXISTS public.validation_settings (
  user_id uuid PRIMARY KEY,
  cpa_max numeric NOT NULL DEFAULT 14,
  min_invest numeric NOT NULL DEFAULT 100,
  roas_target numeric NOT NULL DEFAULT 1.3,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.validation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company validation settings" ON public.validation_settings;
CREATE POLICY "company validation settings" ON public.validation_settings FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_settings TO authenticated;
GRANT ALL ON public.validation_settings TO service_role;
