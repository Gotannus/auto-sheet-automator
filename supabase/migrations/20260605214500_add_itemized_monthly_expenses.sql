CREATE TABLE IF NOT EXISTS public.monthly_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  description text NOT NULL,
  category text NOT NULL DEFAULT 'Geral',
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  expense_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monthly_expenses_user_month_idx
  ON public.monthly_expenses (user_id, year, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_expenses TO authenticated;
GRANT ALL ON public.monthly_expenses TO service_role;

ALTER TABLE public.monthly_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company monthly expenses" ON public.monthly_expenses;
CREATE POLICY "company monthly expenses"
  ON public.monthly_expenses
  FOR ALL
  TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

DROP TRIGGER IF EXISTS update_monthly_expenses_updated_at ON public.monthly_expenses;
CREATE TRIGGER update_monthly_expenses_updated_at
  BEFORE UPDATE ON public.monthly_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
