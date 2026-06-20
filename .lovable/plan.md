## Bug

Importei a coluna errada do CSV do Facebook: peguei **"Valor de conversão da compra"** (receita atribuída) em vez de **"Valor usado (BRL)"** (gasto real). Por isso 19/06 ficou 84,70 em vez dos 51,47 corretos.

## Valores corretos (Valor usado, somando todas as campanhas Apolo)

| Dia | Atual no banco | Correto | Ação |
|---|---|---|---|
| 11/06 | 27,00 | **53,06** | atualizar |
| 12/06 | 70,96 | **77,33** | atualizar |
| 13/06 | — | **23,69** | inserir |
| 14/06 | 57,56 | **76,71** | atualizar |
| 15/06 | 32,97 | **52,91** | atualizar |
| 16/06 | 173,60 | **99,51** | atualizar |
| 17/06 | 10,99 | **78,04** | atualizar |
| 18/06 | 35,58 | **49,53** | atualizar |
| 19/06 | 84,70 | **51,47** | atualizar |
| 20/06 | 45,00 (você setou) | 45,63 | **manter 45,00** |

## Execução

- `UPDATE daily_manual_inputs SET invest_manual=<correto>` para 11, 12, 14, 15, 16, 17, 18, 19/06.
- `INSERT` para 13/06 (23,69).
- Não mexer no 20/06.
- Vendas não são afetadas — só o investimento estava errado.
