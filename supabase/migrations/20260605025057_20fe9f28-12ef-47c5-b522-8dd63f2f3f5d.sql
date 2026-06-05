
-- products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  src TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, src)
);
CREATE INDEX products_user_idx ON public.products(user_id);
CREATE INDEX products_src_idx ON public.products(src);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own products" ON public.products FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- celetus_sales
CREATE TABLE public.celetus_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  transaction_code TEXT NOT NULL,
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  buyer_document TEXT,
  src TEXT NOT NULL,
  product_name TEXT,
  offer_name TEXT,
  kind TEXT NOT NULL, -- 'Principal' | 'Orderbump'
  status TEXT NOT NULL, -- 'Pago' | 'Pendente' | etc
  doc_type TEXT, -- 'Pedido' etc
  payment_method TEXT,
  commission_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  sale_date TIMESTAMPTZ NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  gross_value NUMERIC(14,2),
  net_value NUMERIC(14,2),
  fees NUMERIC(14,2),
  recipient TEXT,
  recipient_company TEXT,
  recipient_type TEXT,
  item_type TEXT,
  src_tag TEXT,
  utm_source TEXT,
  utm_status TEXT,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, transaction_code, src, kind)
);
CREATE INDEX celetus_sales_user_product_date_idx ON public.celetus_sales(user_id, product_id, sale_date);
CREATE INDEX celetus_sales_user_date_idx ON public.celetus_sales(user_id, sale_date);
GRANT SELECT ON public.celetus_sales TO authenticated;
GRANT ALL ON public.celetus_sales TO service_role;
ALTER TABLE public.celetus_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sales read" ON public.celetus_sales FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- daily_manual_inputs
CREATE TABLE public.daily_manual_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  invest_manual NUMERIC(14,2),
  clicks INTEGER,
  checkouts INTEGER,
  impressions INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id, date)
);
CREATE INDEX dmi_user_product_date_idx ON public.daily_manual_inputs(user_id, product_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_manual_inputs TO authenticated;
GRANT ALL ON public.daily_manual_inputs TO service_role;
ALTER TABLE public.daily_manual_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dmi" ON public.daily_manual_inputs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- monthly_settings
CREATE TABLE public.monthly_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  year INTEGER NOT NULL DEFAULT 2026,
  tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1215,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_settings TO authenticated;
GRANT ALL ON public.monthly_settings TO service_role;
ALTER TABLE public.monthly_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.monthly_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- webhook_config
CREATE TABLE public.webhook_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhook_config_secret_idx ON public.webhook_config(webhook_secret);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_config TO authenticated;
GRANT ALL ON public.webhook_config TO service_role;
ALTER TABLE public.webhook_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own webhook config" ON public.webhook_config FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER products_uat BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER dmi_uat BEFORE UPDATE ON public.daily_manual_inputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ms_uat BEFORE UPDATE ON public.monthly_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER wc_uat BEFORE UPDATE ON public.webhook_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create settings + webhook_config on first auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.monthly_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.webhook_config (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
