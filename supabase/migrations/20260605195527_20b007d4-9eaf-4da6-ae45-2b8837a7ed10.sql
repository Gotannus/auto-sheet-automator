ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'webhook',
  ADD COLUMN IF NOT EXISTS products_created integer,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS rows_read integer;