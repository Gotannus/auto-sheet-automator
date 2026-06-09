import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getWebhookConfig,
  rotateWebhookSecret,
  updateWebhookSecret,
  getHotmartConfig,
  rotateHotmartHottok,
  updateHotmartHottok,
  clearHotmartHottok,
} from "@/lib/celetus/settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, RefreshCw, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, RefreshCw, Save } from "lucide-react";
import { isValidSlug } from "@/lib/celetus/workspaces";



export const Route = createFileRoute("/_authenticated/$companySlug/webhook")({
  head: () => ({ meta: [{ title: "Webhook — Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      queryOptions({
        queryKey: ["webhook", params.companySlug],
        queryFn: () => getWebhookConfig({ data: { company_slug: params.companySlug } }),
      }),
    ),
  component: WebhookPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

function WebhookPage() {
  const { companySlug } = Route.useParams();
  const company = { slug: companySlug };
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["webhook", company.slug],
      queryFn: () => getWebhookConfig({ data: { company_slug: company.slug } }),
    }),
  );
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

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const baseUrl = `${origin}/api/public/celetus-webhook?company=${company.slug}`;
  const fullUrl = `${baseUrl}&secret=${encodeURIComponent(token)}`;

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">Webhook da Celetus</h1>
        <p className="text-sm text-muted-foreground">
          Cole essa URL nas configurações de webhook do seu painel da Celetus. As vendas vão entrar
          automaticamente no dashboard do produto correspondente (identificado pelo SRC).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>URL completa (recomendada)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={fullUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(fullUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Já contém o token embutido. Cole só ela no campo URL da Celetus — não precisa preencher
            o campo Token separado.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>URL sem token (alternativa)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={baseUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(baseUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use se a Celetus exigir o token em campo separado — cole o token abaixo no campo Token
            (a Celetus envia no header <code>Api-Token</code>).
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
            {`curl -X POST "${baseUrl}" \\
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

      <HotmartSection companySlug={company.slug} origin={origin} />
    </div>
  );
}

function HotmartSection({ companySlug, origin }: { companySlug: string; origin: string }) {
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["hotmart-webhook", companySlug],
      queryFn: () => getHotmartConfig({ data: { company_slug: companySlug } }),
    }),
  );
  const qc = useQueryClient();
  const save = useServerFn(updateHotmartHottok);
  const rot = useServerFn(rotateHotmartHottok);
  const [hottok, setHottok] = useState(data.hotmart_hottok);

  useEffect(() => {
    setHottok(data.hotmart_hottok);
  }, [data.hotmart_hottok]);

  const saveMut = useMutation({
    mutationFn: () =>
      save({ data: { company_slug: companySlug, hotmart_hottok: hottok.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotmart-webhook", companySlug] });
      toast.success("Hottok salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotMut = useMutation({
    mutationFn: () => rot({ data: { company_slug: companySlug } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotmart-webhook", companySlug] });
      toast.success("Novo Hottok gerado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baseUrl = `${origin}/api/public/hotmart-webhook?company=${companySlug}`;
  const fullUrl = `${baseUrl}&hottok=${encodeURIComponent(hottok)}`;

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  return (
    <>
      <header className="pt-6">
        <h2 className="text-2xl font-bold">Webhook da Hotmart</h2>
        <p className="text-sm text-muted-foreground">
          Configure este endpoint nas Ferramentas → Notificações Webhook da Hotmart. Eventos
          aceitos: <code>PURCHASE_APPROVED</code>, <code>PURCHASE_REFUNDED</code>,{" "}
          <code>PURCHASE_CHARGEBACK</code>, <code>PURCHASE_CANCELED</code>.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>URL do webhook (Hotmart)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={baseUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(baseUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cole essa URL no campo "URL" da Hotmart e o Hottok abaixo no campo "Hottok". A
            Hotmart envia o Hottok no header <code>X-Hotmart-Hottok</code> (também aceitamos no
            corpo da requisição).
          </p>
          <div className="flex gap-2">
            <Input value={fullUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(fullUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Alternativa: URL com o Hottok embutido (para testes).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hottok</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="hotmart-hottok">Hottok cadastrado na Hotmart</Label>
            <div className="flex gap-2">
              <Input
                id="hotmart-hottok"
                value={hottok}
                onChange={(e) => setHottok(e.target.value)}
                className="font-mono text-xs"
                placeholder="Cole aqui ou gere um novo"
              />
              <Button variant="outline" size="icon" onClick={() => copy(hottok)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !hottok.trim()}>
                <Save className="h-4 w-4 mr-1" /> Salvar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("Gerar novo Hottok? O anterior deixa de funcionar.")) rotMut.mutate();
                }}
                disabled={rotMut.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-1" /> Rotacionar
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Cada empresa precisa de um Hottok único. Se você usa o mesmo Hottok em várias
            empresas, o webhook não saberá para qual direcionar a venda.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

