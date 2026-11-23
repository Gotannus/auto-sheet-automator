-- Etapa 3: aprovação do cadastro na Celetus.
-- aguardando_cadastro -> (usuário aprova) aprovado -> (ponte pega) cadastrando -> cadastrado
-- Se o cadastro automático falhar, volta para aguardando_cadastro com error_message.

ALTER TABLE public.product_jobs DROP CONSTRAINT IF EXISTS product_jobs_status_check;
ALTER TABLE public.product_jobs
  ADD CONSTRAINT product_jobs_status_check
  CHECK (status IN ('na_fila','criando','aguardando_cadastro','aprovado','cadastrando','cadastrado','erro'));

CREATE OR REPLACE FUNCTION public.claim_next_approved_job(_company_id uuid)
RETURNS SETOF public.product_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.product_jobs j
     SET status = 'cadastrando',
         error_message = NULL,
         updated_at = now(),
         progress = COALESCE(j.progress, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object('at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                              'message', 'Claude começou o cadastro na Celetus'))
   WHERE j.id = (
     SELECT id FROM public.product_jobs
      WHERE user_id = _company_id AND status = 'aprovado'
      ORDER BY updated_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.*;
$$;

REVOKE ALL ON FUNCTION public.claim_next_approved_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_approved_job(uuid) TO service_role;
