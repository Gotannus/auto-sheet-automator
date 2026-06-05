CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  transaction_code text,
  status text NOT NULL,
  error_message text,
  rows_upserted integer,
  rows_ignored integer,
  payload jsonb,
  reprocessed_at timestamptz
);

CREATE INDEX webhook_events_user_received_idx ON public.webhook_events (user_id, received_at DESC);
CREATE INDEX webhook_events_user_status_idx ON public.webhook_events (user_id, status);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own webhook events read"
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);