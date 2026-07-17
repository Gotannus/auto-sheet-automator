## Problema

A venda `HP2864577102` (Sussurros, Tannus Labs) chegou da Hotmart em **EUR** (`price.currency_value: "EUR"`, value 9.70) e foi gravada como se fosse R$ 9,70. Precisamos converter moeda estrangeira → BRL no webhook, com taxa fixa de **5x**.

## Mudanças

### 1. `src/lib/celetus/hotmart-parser.ts`
- Ler `price.currency_value` (fallback `full_price.currency_value`).
- Se a moeda **não for BRL** (ex.: USD, EUR), aplicar multiplicador **× 5** em:
  - `grossValue`
  - `producerCommission` (comissões somadas antes do arredondamento)
- Não mexer em BRL/vazio (comportamento atual preservado).
- Guardar a moeda original + taxa aplicada dentro de `row.raw` (nada visível na UI, só rastreabilidade — o payload cru já vai pra `raw`, então só garantir que fica salvo).

### 2. Correção retroativa
- Atualizar a linha `HP2864577102`: multiplicar `gross_value`, `net_value`, `commission_value`, `fees` por 5 (9,70 → 48,50; 9,48 → 47,40).

## Fora do escopo
- Celetus (opera em BRL).
- Taxa dinâmica de câmbio — usuário pediu fixa em 5.
- Reprocessar histórico além dessa venda (só há 1 registro em moeda estrangeira).
