-- Use the same line-item key for webhook payloads and XLSX imports.
-- This prevents the same order line from being counted twice when both sources are used.
WITH normalized AS (
  SELECT
    id,
    user_id,
    transaction_code,
    LEFT(
      CONCAT_WS(
        ':',
        NULLIF(kind, ''),
        NULLIF(product_name, ''),
        NULLIF(offer_name, '')
      ),
      240
    ) AS normalized_code
  FROM public.celetus_sales
  WHERE product_name IS NOT NULL
    AND product_name <> ''
),
duplicate_rows AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, transaction_code, normalized_code
        ORDER BY id
      ) AS row_number
    FROM normalized
    WHERE normalized_code <> ''
  ) ranked
  WHERE row_number > 1
)
DELETE FROM public.celetus_sales
WHERE id IN (SELECT id FROM duplicate_rows);

UPDATE public.celetus_sales
SET line_item_code = LEFT(
  CONCAT_WS(
    ':',
    NULLIF(kind, ''),
    NULLIF(product_name, ''),
    NULLIF(offer_name, '')
  ),
  240
)
WHERE product_name IS NOT NULL
  AND product_name <> '';
