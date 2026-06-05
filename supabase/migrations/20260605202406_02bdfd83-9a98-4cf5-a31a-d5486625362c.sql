-- 1. Reassign existing demo companies to the first real auth user
UPDATE public.companies
SET owner_user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
WHERE owner_user_id = '00000000-0000-4000-8000-000000000001'
  AND EXISTS (SELECT 1 FROM auth.users);

-- 2. company_members
CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- 3. has_company_access
CREATE OR REPLACE FUNCTION public.has_company_access(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies WHERE id = _company_id AND owner_user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id
  );
$$;

-- 4. Policies for company_members
CREATE POLICY "owner manages members" ON public.company_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_user_id = auth.uid()));
CREATE POLICY "member reads own row" ON public.company_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 5. Companies: owner full, members read
DROP POLICY IF EXISTS "own companies" ON public.companies;
CREATE POLICY "owner manages company" ON public.companies FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "member reads company" ON public.companies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = id AND m.user_id = auth.uid()));

-- 6. Operational tables: switch to has_company_access (user_id stores company_id)
DROP POLICY IF EXISTS "own sales read" ON public.celetus_sales;
CREATE POLICY "company sales" ON public.celetus_sales FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

DROP POLICY IF EXISTS "own products" ON public.products;
CREATE POLICY "company products" ON public.products FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

DROP POLICY IF EXISTS "own dmi" ON public.daily_manual_inputs;
CREATE POLICY "company dmi" ON public.daily_manual_inputs FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

DROP POLICY IF EXISTS "own settings" ON public.monthly_settings;
CREATE POLICY "company settings" ON public.monthly_settings FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

DROP POLICY IF EXISTS "Users manage own monthly_tax_settings" ON public.monthly_tax_settings;
CREATE POLICY "company tax settings" ON public.monthly_tax_settings FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

DROP POLICY IF EXISTS "own webhook config" ON public.webhook_config;
CREATE POLICY "company webhook config" ON public.webhook_config FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

DROP POLICY IF EXISTS "own webhook events read" ON public.webhook_events;
CREATE POLICY "company webhook events" ON public.webhook_events FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

-- 7. Grant write privileges that were missing
GRANT INSERT, UPDATE, DELETE ON public.celetus_sales TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.webhook_events TO authenticated;