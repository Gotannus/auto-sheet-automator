Vou corrigir a projeção para ela virar uma tela útil de decisão, não só números automáticos irreais.

Plano:

1. **Trocar a lógica principal da projeção**
   - Parar de usar “média só dos dias com atividade” como base principal, porque isso infla demais quando o mês ainda tem poucos dias.
   - Mostrar claramente:
     - lucro já realizado até agora;
     - média diária real até hoje;
     - projeção conservadora até o fim do mês;
     - projeção por ritmo recente quando fizer sentido.
   - Em mês passado, mostrar como mês fechado, sem tentar projetar dias restantes.

2. **Melhorar o card do Dashboard**
   - Deixar o Dashboard mostrar algo direto: “Lucro atual” e “se continuar nesse ritmo, fecha em X”.
   - Remover nomes confusos tipo “Projeção A / B” como destaque principal.

3. **Refazer a aba Projeção**
   - Criar uma tela mais prática com três blocos:
     - **Resultado atual:** faturamento, investimento, lucro e ROI já feitos.
     - **Fechamento provável:** quanto deve fechar no mês com base no ritmo atual.
     - **Meta/Simulação:** o usuário escolhe quanto quer melhorar o lucro ou ROI e vê quanto precisa faturar/investir.
   - O simulador deve partir do resultado atual/projeção realista, não de número inflado.

4. **Corrigir o simulador**
   - Trocar sliders confusos por campos diretos:
     - meta de lucro no mês;
     - ou aumento de lucro desejado;
     - ou investimento planejado até o fim do mês.
   - Mostrar: lucro final estimado, diferença contra o ritmo atual e divisão entre sócios.

5. **Sócios continuam, mas com números úteis**
   - A divisão entre sócios vai mostrar valores por:
     - lucro já realizado;
     - fechamento provável;
     - cenário simulado.

Detalhes técnicos:
- Ajustar `computeProjection` para retornar métricas mais claras: realizado, média por dia corrido, média por dia com dado, fechamento provável, cenário recente e mês fechado.
- Atualizar `dashboard.tsx` para exibir a projeção principal com a nova métrica realista.
- Refatorar `projecao.tsx` para usar os novos cálculos e uma UI mais objetiva.