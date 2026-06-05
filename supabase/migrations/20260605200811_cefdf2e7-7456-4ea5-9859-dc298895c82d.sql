
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own companies"
  ON public.companies
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE
  temp_user uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  fake_tannus uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  fake_cecilia uuid := '00000000-0000-4000-8000-000000000002'::uuid;
  tannus_id uuid;
  cecilia_id uuid;
BEGIN
  INSERT INTO public.companies (owner_user_id, slug, name)
  VALUES (temp_user, 'tannus-labs', 'Tannus Labs')
  RETURNING id INTO tannus_id;

  INSERT INTO public.companies (owner_user_id, slug, name)
  VALUES (temp_user, 'cecilia-labs', 'Cecilia Labs')
  RETURNING id INTO cecilia_id;

  UPDATE public.celetus_sales SET user_id = tannus_id WHERE user_id = fake_tannus;
  UPDATE public.celetus_sales SET user_id = cecilia_id WHERE user_id = fake_cecilia;

  UPDATE public.products SET user_id = tannus_id WHERE user_id = fake_tannus;
  UPDATE public.products SET user_id = cecilia_id WHERE user_id = fake_cecilia;

  UPDATE public.daily_manual_inputs SET user_id = tannus_id WHERE user_id = fake_tannus;
  UPDATE public.daily_manual_inputs SET user_id = cecilia_id WHERE user_id = fake_cecilia;

  UPDATE public.monthly_settings SET user_id = tannus_id WHERE user_id = fake_tannus;
  UPDATE public.monthly_settings SET user_id = cecilia_id WHERE user_id = fake_cecilia;

  UPDATE public.monthly_tax_settings SET user_id = tannus_id WHERE user_id = fake_tannus;
  UPDATE public.monthly_tax_settings SET user_id = cecilia_id WHERE user_id = fake_cecilia;

  UPDATE public.webhook_config SET user_id = tannus_id WHERE user_id = fake_tannus;
  UPDATE public.webhook_config SET user_id = cecilia_id WHERE user_id = fake_cecilia;

  UPDATE public.webhook_events SET user_id = tannus_id WHERE user_id = fake_tannus;
  UPDATE public.webhook_events SET user_id = cecilia_id WHERE user_id = fake_cecilia;
END $$;
