-- Pedidos de criação de produto (sistema -> Hermes -> sistema)
CREATE TABLE IF NOT EXISTS public.product_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'na_fila'
    CHECK (status IN ('na_fila', 'criando', 'aguardando_cadastro', 'cadastrado', 'erro')),
  briefing jsonb NOT NULL DEFAULT '{}'::jsonb,
  src text NOT NULL,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  progress jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb NULL,
  celetus_prompt text NULL,
  checkout_url text NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_jobs_user_status_idx
  ON public.product_jobs (user_id, status, created_at);

ALTER TABLE public.product_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company product jobs" ON public.product_jobs;
CREATE POLICY "company product jobs" ON public.product_jobs FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), user_id))
  WITH CHECK (public.has_company_access(auth.uid(), user_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_jobs TO authenticated;
GRANT ALL ON public.product_jobs TO service_role;
