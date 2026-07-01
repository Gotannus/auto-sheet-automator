CREATE TABLE public.company_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  share_pct numeric(5,2) NOT NULL CHECK (share_pct >= 0 AND share_pct <= 100),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_partners TO authenticated;
GRANT ALL ON public.company_partners TO service_role;
ALTER TABLE public.company_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage partners" ON public.company_partners
  FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));
CREATE INDEX company_partners_company_idx ON public.company_partners(company_id, sort_order);
CREATE TRIGGER company_partners_updated_at
  BEFORE UPDATE ON public.company_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();