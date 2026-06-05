import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Play, Eye } from "lucide-react";
import {
  listWebhookEvents,
  reprocessWebhookEvent,
  type WebhookEventRow,
} from "@/lib/celetus/webhook-events.functions";
import { companyPath, isCompanySlug } from "@/lib/celetus/workspaces";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/$companySlug/webhook-logs")({
  head: () => ({ meta: [{ title: "Webhook Logs — Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isCompanySlug(params.companySlug)) {
      throw redirect({
        to: companyPath("tannus-labs", "webhook-logs"),
        replace: true,
      });
    }
  },
  component: WebhookLogsPage,
});

type StatusFilter = "all" | "ok" | "ignored" | "error";
type KindFilter = "all" | "webhook" | "import";

function WebhookLogsPage() {
  const { companySlug } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listWebhookEvents);
  const reprocessFn = useServerFn(reprocessWebhookEvent);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [selected, setSelected] = useState<WebhookEventRow | null>(null);
  const [reprocessing, setReprocessing] = useState<string | null>(null);

  const queryKey = ["webhook-events", companySlug, status, kind];

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      listFn({ data: { company_slug: companySlug, status, kind, limit: 100 } }),
    refetchOnWindowFocus: false,
  });

  const handleReprocess = async (id: string) => {
    setReprocessing(id);
    try {
      const res = await reprocessFn({
        data: { company_slug: companySlug, event_id: id },
      });
      if (res.result.status === "ok") {
        toast.success(
          `Reprocessado: ${res.result.rowsUpserted} venda(s) inseridas/atualizadas.`,
        );
      } else if (res.result.status === "error") {
        toast.error(`Falhou: ${res.result.errorMessage ?? "erro desconhecido"}`);
      } else {
        toast.info(`Ignorado: ${res.result.errorMessage ?? "sem detalhes"}`);
      }
      qc.invalidateQueries({ queryKey: ["webhook-events"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reprocessar");
    } finally {
      setReprocessing(null);
    }
  };

  const counts = data?.counts ?? { ok: 0, ignored: 0, error: 0, total: 0 };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Webhook Logs</h1>
          <p className="text-sm text-muted-foreground">
            Eventos recebidos da Celetus. Use isto para diagnosticar vendas que
            não apareceram no dashboard.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total (últimos 1000)" value={counts.total} />
        <StatCard label="OK" value={counts.ok} tone="success" />
        <StatCard label="Ignorados" value={counts.ignored} tone="warning" />
        <StatCard label="Erros" value={counts.error} tone="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Tipo:</span>
        <Select value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="import">Importação</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">Status:</span>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="ignored">Ignorados</SelectItem>
            <SelectItem value="error">Erros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido em</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Origem / Transação</TableHead>
                <TableHead className="text-right">Inseridas</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.events.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nenhum evento ainda.
                  </TableCell>
                </TableRow>
              )}
              {data?.events.map((ev) => {
                const isImport = ev.kind === "import";
                return (
                  <TableRow key={ev.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(ev.received_at).toLocaleString("pt-BR")}
                      {ev.reprocessed_at && (
                        <div className="text-xs text-muted-foreground">
                          reproc. {new Date(ev.reprocessed_at).toLocaleString("pt-BR")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isImport ? "outline" : "secondary"} className="text-xs">
                        {isImport ? "Importação" : "Webhook"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={ev.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {isImport
                        ? (ev.file_name ?? "(planilha)")
                        : (ev.transaction_code ?? "—")}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {ev.rows_upserted ?? 0}
                      {ev.rows_read != null && isImport ? (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          / {ev.rows_read} lidas
                        </span>
                      ) : null}
                      {ev.rows_ignored ? (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          (ig. {ev.rows_ignored})
                        </span>
                      ) : null}
                      {ev.products_created ? (
                        <div className="text-xs text-emerald-600">
                          +{ev.products_created} produto(s)
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                      {ev.error_message ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected(ev)}
                          disabled={!ev.payload_json}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReprocess(ev.id)}
                          disabled={isImport || !ev.payload_json || reprocessing === ev.id}
                          title={isImport ? "Reenvie a planilha pela tela Importar" : undefined}
                        >
                          <Play
                            className={`h-4 w-4 ${reprocessing === ev.id ? "animate-pulse" : ""}`}
                          />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>


      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Payload bruto</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded bg-muted p-4 text-xs">
            {selected?.payload_json
              ? JSON.stringify(JSON.parse(selected.payload_json), null, 2)
              : ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-red-600"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">OK</Badge>
    );
  }
  if (status === "error") {
    return <Badge variant="destructive">Erro</Badge>;
  }
  return <Badge variant="secondary">Ignorado</Badge>;
}
