-- Segredo próprio do Hermes por empresa (separado do token do webhook da Celetus)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS hermes_secret text NOT NULL
  DEFAULT encode(gen_random_bytes(24), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS companies_hermes_secret_key
  ON public.companies (hermes_secret);

-- Relatórios que o Hermes escreve para aparecer no sistema
CREATE TABLE IF NOT EXISTS public.hermes_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  title text NOT NULL,
  body_markdown text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hermes_reports_user_created_idx
  ON public.hermes_reports (user_id, created_at DESC);

ALTER TABLE public.hermes_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company hermes reports" ON public.hermes_reports;
CREATE POLICY "company hermes reports" ON public.hermes_reports FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hermes_reports TO authenticated;
GRANT ALL ON public.hermes_reports TO service_role;

-- Pega o próximo pedido da fila de forma atômica (evita duas pontes pegarem o mesmo)
CREATE OR REPLACE FUNCTION public.claim_next_product_job(_company_id uuid)
RETURNS SETOF public.product_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.product_jobs
     SET status = 'criando',
         updated_at = now(),
         progress = progress || jsonb_build_array(
           jsonb_build_object('at', now(), 'message', 'Hermes pegou o pedido')
         )
   WHERE id = (
     SELECT id FROM public.product_jobs
      WHERE user_id = _company_id AND status = 'na_fila'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_next_product_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_product_job(uuid) TO service_role;
