
CREATE TABLE public.monthly_expenses_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_monthly_expenses_items_user_period
  ON public.monthly_expenses_items(user_id, year, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_expenses_items TO authenticated;
GRANT ALL ON public.monthly_expenses_items TO service_role;

ALTER TABLE public.monthly_expenses_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company expenses items"
  ON public.monthly_expenses_items
  FOR ALL
  TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

CREATE TRIGGER update_monthly_expenses_items_updated_at
  BEFORE UPDATE ON public.monthly_expenses_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
