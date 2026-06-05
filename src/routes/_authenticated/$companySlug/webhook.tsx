import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getWebhookConfig,
  rotateWebhookSecret,
  updateWebhookSecret,
} from "@/lib/celetus/settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, RefreshCw, Save } from "lucide-react";
import { companyPath, isValidSlug } from "@/lib/celetus/workspaces";

const webhookQO = (companySlug: string) =>
  queryOptions({
    queryKey: ["webhook", companySlug],
    queryFn: () => getWebhookConfig({ data: { company_slug: companySlug } }),
  });

export const Route = createFileRoute("/_authenticated/$companySlug/webhook")({
  head: () => ({ meta: [{ title: "Webhook â€” Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/companies", replace: true });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(webhookQO(params.companySlug)),
  component: WebhookPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

function WebhookPage() {
  const { companySlug } = Route.useParams();
  const company = { slug: companySlug };
  const { data } = useSuspenseQuery(webhookQO(company.slug));
  const qc = useQueryClient();
  const rot = useServerFn(rotateWebhookSecret);
  const save = useServerFn(updateWebhookSecret);
  const [token, setToken] = useState(data.webhook_secret);

  useEffect(() => {
    setToken(data.webhook_secret);
  }, [data.webhook_secret]);

  const saveMut = useMutation({
    mutationFn: () => save({ data: { company_slug: company.slug, webhook_secret: token.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook", company.slug] });
      toast.success("Token salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotMut = useMutation({
    mutationFn: () => rot({ data: { company_slug: company.slug } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook", company.slug] });
      toast.success("Novo token gerado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/celetus-webhook?company=${company.slug}`
      : `/api/public/celetus-webhook?company=${company.slug}`;

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">Webhook da Celetus</h1>
        <p className="text-sm text-muted-foreground">
          Cole essa URL nas configuraÃ§Ãµes de webhook do seu painel da Celetus. As vendas vÃ£o entrar
          automaticamente no dashboard do produto correspondente (identificado pelo SRC).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={url} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(url)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Aceita POST com JSON. Na Celetus, cole essa URL no campo URL do webhook.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="webhook-token">Token cadastrado na Celetus</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono text-xs"
              />
              <Button variant="outline" size="icon" onClick={() => copy(token)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                <Save className="h-4 w-4 mr-1" /> Salvar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("Gerar novo token? O anterior deixa de funcionar.")) rotMut.mutate();
                }}
                disabled={rotMut.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-1" /> Rotacionar
              </Button>
            </div>
          </div>
          <div className="rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
            {`curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -H "Api-Token: ${token}" \\
  -d '{
    "event_type": "ApprovedPurchase",
    "payment_method": "pix",
    "order_code": "ABC123",
    "order_status": "Approved",
    "approved_date": "2026-06-04T22:26:20.000Z",
    "customer": {
      "name": "Fulano",
      "email": "fulano@example.com"
    },
    "items": [{
      "id": "8578ff75-82f3-411a-95ec-060c062509ef",
      "name": "O Peso da Cama Feita",
      "offer_name": "OFERTA 10 UNIDADES R$10",
      "item_type": "Principal",
      "amount": 10.99
    }],
    "charge": {
      "status": "paid",
      "amount": 10.99
    },
    "commission": {
      "totalPrice": 10.99,
      "gatewayFee": 1.54,
      "userCommission": 9.45
    },
    "seller_name": "TANNUS LABS",
    "seller_type": "Produtor"
  }'`}
          </div>
          <p className="text-xs text-muted-foreground">
            Na Celetus, use esse valor no campo Token. A plataforma envia esse token no header{" "}
            <code>Api-Token</code>. O endpoint tambem aceita
            <code> X-Webhook-Secret</code> ou <code>?secret=</code> para testes manuais.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
