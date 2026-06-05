-- 1) Para cada linha em formato antigo, calcula o código normalizado
--    e remove a versão mais antiga entre as duas (antiga vs nova já existente).
WITH old_rows AS (
  SELECT id, user_id, transaction_code, created_at,
         TRIM(BOTH ':' FROM concat_ws(':', kind, NULLIF(product_name,''), NULLIF(offer_name,''))) AS new_code
  FROM public.celetus_sales
  WHERE line_item_code NOT LIKE 'Principal:%'
    AND line_item_code NOT LIKE 'Orderbump:%'
    AND line_item_code NOT LIKE 'Upsell:%'
),
pairs AS (
  SELECT o.id AS old_id, o.created_at AS old_created,
         n.id AS new_id, n.created_at AS new_created
  FROM old_rows o
  JOIN public.celetus_sales n
    ON n.user_id = o.user_id
   AND n.transaction_code = o.transaction_code
   AND n.line_item_code = o.new_code
),
to_delete AS (
  SELECT CASE WHEN old_created >= new_created THEN new_id ELSE old_id END AS del_id
  FROM pairs
)
DELETE FROM public.celetus_sales WHERE id IN (SELECT del_id FROM to_delete);

-- 2) Agora normaliza os antigos que sobraram (sem colisão)
UPDATE public.celetus_sales
SET line_item_code = TRIM(BOTH ':' FROM concat_ws(':', kind, NULLIF(product_name,''), NULLIF(offer_name,'')))
WHERE line_item_code NOT LIKE 'Principal:%'
  AND line_item_code NOT LIKE 'Orderbump:%'
  AND line_item_code NOT LIKE 'Upsell:%';

-- 3) Deduplica qualquer remanescente exato
DELETE FROM public.celetus_sales a
USING public.celetus_sales b
WHERE a.user_id = b.user_id
  AND a.transaction_code = b.transaction_code
  AND a.line_item_code = b.line_item_code
  AND a.created_at < b.created_at;