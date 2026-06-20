
DELETE FROM public.celetus_sales
WHERE user_id='f26e1c0f-279e-4a8a-b50a-9aba4874429c' AND src='sussuros';

WITH p AS (
  SELECT id AS product_id FROM public.products
  WHERE user_id='f26e1c0f-279e-4a8a-b50a-9aba4874429c' AND src='sussuros' LIMIT 1
)
INSERT INTO public.celetus_sales
  (user_id, product_id, src, kind, status, recipient, payment_method,
   gross_value, net_value, commission_value, quantity, sale_date, transaction_code)
SELECT 'f26e1c0f-279e-4a8a-b50a-9aba4874429c', p.product_id, 'sussuros',
       v.kind, 'Pago', 'Produtor', v.pm, v.val, v.val, v.val, 1,
       v.sd::timestamptz, v.tc
FROM p,
(VALUES
  ('principal','PIX',              14.11, '2026-06-15 16:11:41-03', 'TKLXXPL5'),
  ('principal','PIX',              14.11, '2026-06-16 06:44:52-03', 'WLJOMPZW'),
  ('principal','PIX',              14.11, '2026-06-16 09:14:40-03', 'SW67V77B'),
  ('principal','PIX',              14.11, '2026-06-16 12:44:09-03', '9LU28JC9'),
  ('principal','Cartão de crédito',14.11, '2026-06-16 01:46:38-03', '4I4F6YQQ-P'),
  ('orderbump','Cartão de crédito', 5.65, '2026-06-16 01:46:38-03', '4I4F6YQQ-OB1'),
  ('orderbump','Cartão de crédito', 6.51, '2026-06-16 01:46:38-03', '4I4F6YQQ-OB2'),
  ('orderbump','Cartão de crédito',16.10, '2026-06-16 01:46:38-03', '4I4F6YQQ-OB3'),
  ('principal','PIX',              14.11, '2026-06-17 20:37:56-03', 'RKE8GSWF')
) AS v(kind, pm, val, sd, tc);
