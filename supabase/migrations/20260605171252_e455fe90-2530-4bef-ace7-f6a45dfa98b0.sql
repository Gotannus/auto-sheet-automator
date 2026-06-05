CREATE TABLE public.monthly_tax_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,
  investment_tax_rate numeric NOT NULL DEFAULT 0.1215,
  revenue_tax_rate numeric NOT NULL DEFAULT 0,
  monthly_expenses numeric NOT NULL DEFAULT 0,
  company_cash_rate numeric NOT NULL DEFAULT 0.1,
  partner_1_name text NOT NULL DEFAULT 'Rodrigo',
  partner_1_rate numeric NOT NULL DEFAULT 0.35,
  partner_2_name text NOT NULL DEFAULT 'Marcos',
  partner_2_rate numeric NOT NULL DEFAULT 0.65,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_tax_settings TO authenticated;
GRANT ALL ON public.monthly_tax_settings TO service_role;

ALTER TABLE public.monthly_tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own monthly_tax_settings"
  ON public.monthly_tax_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_monthly_tax_settings_updated_at
  BEFORE UPDATE ON public.monthly_tax_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();