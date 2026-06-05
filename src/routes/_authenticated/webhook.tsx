import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWebhookConfig, rotateWebhookSecret } from "@/lib/celetus/settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";

const webhookQO = () =>
  queryOptions({ queryKey: ["webhook"], queryFn: () => getWebhookConfig() });

export const Route = createFileRoute("/_authenticated/webhook")({
  head: () => ({ meta: [{ title: "Webhook — Painel Celetus" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(webhookQO()),
  component: WebhookPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

function WebhookPage() {
  const { data } = useSuspenseQuery(webhookQO());
  const qc = useQueryClient();
  const rot = useServerFn(rotateWebhookSecret);
  const rotMut = useMutation({
    mutationFn: () => rot(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook"] });
      toast.success("Novo secret gerado");
    },
  });

  const url = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/celetus-webhook`
    : "/api/public/celetus-webhook";

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">Webhook da Celetus</h1>
        <p className="text-sm text-muted-foreground">
          Cole essa URL nas configurações de webhook do seu painel da Celetus.
          As vendas vão entrar automaticamente no dashboard do produto correspondente (identificado pelo SRC).
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>URL</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={url} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(url)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Aceita POST com JSON. Autentica pelo header <code>X-Webhook-Secret</code> ou query <code>?secret=</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Secret</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={data.webhook_secret} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(data.webhook_secret)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => {
              if (confirm("Gerar novo secret? O anterior deixa de funcionar.")) rotMut.mutate();
            }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Rotacionar
            </Button>
          </div>
          <div className="rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
{`curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: ${data.webhook_secret}" \\
  -d '{
    "transactionCode": "ABC123",
    "src": "8578ff75-82f3-411a-95ec-060c062509ef",
    "productName": "O Peso da Cama Feita",
    "offerName": "OFERTA 10 UNIDADES R$10",
    "kind": "Principal",
    "status": "Pago",
    "paymentMethod": "PIX",
    "commissionValue": 9.45,
    "saleDate": "04/06/2026 22:26:20",
    "recipient": "Produtor",
    "buyerName": "Fulano",
    "buyerEmail": "fulano@example.com"
  }'`}
          </div>
          <p className="text-xs text-muted-foreground">
            Campos aceitos (camelCase ou snake_case): <code>transactionCode</code>, <code>src</code>,
            <code> productName</code>, <code>offerName</code>, <code>kind</code>, <code>status</code>,
            <code> paymentMethod</code>, <code>commissionValue</code>, <code>saleDate</code>,
            <code> recipient</code>, <code>buyerName</code>, <code>buyerEmail</code>, etc.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
