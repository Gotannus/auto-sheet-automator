Aplicar as duas correções restantes (migração já feita):

1. **Webhook** (`src/routes/api/public/celetus-webhook.ts`): capturar `line_item_code` de cada item (ProductPriceCodeId / item.id / product_code) e usar `onConflict: "user_id,transaction_code,line_item_code"`.

2. **Importação de planilha Celetus**:
   - Dep `xlsx` já instalada.
   - `src/lib/celetus/import.functions.ts`: server fn `importCeletusReport` recebe base64 do arquivo, faz parse com SheetJS, mapeia colunas (`Id`→transaction_code, `ProductPriceCodeId`→line_item_code, `ProductType`→kind, `Value`→commission_value, `TotalAmountPaid`→gross_value, `CommissionValue`→net_value, `CreatedDate`→sale_date, `SRC/UTM_*`, etc), auto-cria produtos faltantes, upsert em batches usando a nova chave.
   - `src/routes/_authenticated/$companySlug/import.tsx`: página com upload (.xlsx), botão "Importar", mostra resumo (lidas / inseridas / atualizadas / ignoradas / produtos criados).
   - Link "Importar" no menu lateral do dashboard.