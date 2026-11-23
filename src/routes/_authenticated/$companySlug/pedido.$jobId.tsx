import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, ExternalLink, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getProductJob,
  markProductJobRegistered,
  retryProductJob,
  type ProductJob,
} from "@/lib/celetus/product-jobs.functions";
import { JobStatusBadge } from "@/components/product-jobs/ProductJobParts";
import { isValidSlug } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/_authenticated/$companySlug/pedido/$jobId")({
  head: () => ({ meta: [{ title: "Pedido de produto — Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  component: ProductJobPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {(error as Error).message}</div>,
});

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  } catch {
    toast.error("Não deu para copiar. Selecione e copie à mão.");
  }
}

const RESULT_LABELS: Record<string, string> = {
  nome: "Nome",
  descricao: "Descrição",
  preco: "Preço",
  order_bumps: "Order bumps",
  copy: "Copy",
  arquivos: "Arquivos",
};

function renderValue(value: unknown) {
  if (value == null || value === "") return <span className="text-muted-foreground">—</span>;
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) {
      return (
        <a href={value} target="_blank" rel="noreferrer" className="text-primary underline break-all">
          {value}
        </a>
      );
    }
    return <p className="whitespace-pre-wrap">{value}</p>;
  }
  if (typeof value === "number" || typeof value === "boolean") return <p>{String(value)}</p>;
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc pl-5 space-y-1">
        {value.map((v, i) => (
          <li key={i}>{typeof v === "object" ? <ObjectView obj={v as Record<string, unknown>} /> : renderValue(v)}</li>
        ))}
      </ul>
    );
  }
  return <ObjectView obj={value as Record<string, unknown>} />;
}

function ObjectView({ obj }: { obj: Record<string, unknown> }) {
  return (
    <dl className="space-y-1">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{RESULT_LABELS[k] ?? k}</dt>
          <dd className="text-sm">{renderValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProductJobPage() {
  const { companySlug, jobId } = Route.useParams();
  const fetchJob = useServerFn(getProductJob);
  const { data: job, isLoading, error } = useQuery({
    queryKey: ["product-job", companySlug, jobId],
    queryFn: () => fetchJob({ data: { company_slug: companySlug, id: jobId } }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "na_fila" || s === "criando" ? 10000 : false;
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Carregando…</div>;
  if (error) return <div className="p-6">Erro: {(error as Error).message}</div>;
  if (!job) return null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <Link
        to="/$companySlug/products"
        params={{ companySlug }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Produtos
      </Link>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{job.briefing?.tema ?? "Produto"}</h1>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <JobStatusBadge status={job.status} />
            <span className="text-muted-foreground">{job.briefing?.tipo}</span>
            <span className="text-muted-foreground">· criado em {fmtDateTime(job.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">SRC</span>
          <code className="rounded-md border bg-muted px-2 py-1 text-sm">{job.src}</code>
          <Button size="icon" variant="ghost" title="Copiar SRC" onClick={() => copy(job.src, "SRC")}>
            <Copy className="h-4 w-4" />
          </Button>
          {job.product_id && (
            <Button asChild variant="outline" size="sm">
              <Link
                to="/$companySlug/produto/$productId"
                params={{ companySlug, productId: job.product_id }}
              >
                Ver métricas
              </Link>
            </Button>
          )}
        </div>
      </header>

      {job.status === "aguardando_cadastro" && (
        <RegisterCard job={job} companySlug={companySlug} />
      )}
      {job.status === "erro" && <ErrorCard job={job} companySlug={companySlug} />}
      {job.status === "cadastrado" && job.checkout_url && (
        <Card>
          <CardContent className="p-4 text-sm flex items-center gap-2 flex-wrap">
            <span className="font-medium">Checkout:</span>
            <a
              href={job.checkout_url}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline break-all inline-flex items-center gap-1"
            >
              {job.checkout_url} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Briefing</h2>
            <ObjectView
              obj={{
                Público: job.briefing?.publico,
                "Preço alvo": job.briefing?.preco_alvo,
                Observações: job.briefing?.observacoes,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Andamento</h2>
            {(job.progress ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem atualizações ainda.</p>
            ) : (
              <ol className="space-y-2">
                {[...(job.progress ?? [])].reverse().map((p, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-xs text-muted-foreground tabular-nums w-24 shrink-0">
                      {fmtDateTime(p.at)}
                    </span>
                    <span>{p.message}</span>
                  </li>
                ))}
              </ol>
            )}
            {(job.status === "na_fila" || job.status === "criando") && (
              <p className="text-xs text-muted-foreground">
                {job.status === "na_fila"
                  ? "Esperando o Hermes pegar o pedido (ele precisa estar rodando no seu PC)."
                  : "O Hermes está trabalhando. Esta página atualiza sozinha."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {job.result && Object.keys(job.result).length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Produto gerado</h2>
            <ObjectView obj={job.result} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RegisterCard({ job, companySlug }: { job: ProductJob; companySlug: string }) {
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const mark = useServerFn(markProductJobRegistered);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => mark({ data: { company_slug: companySlug, id: job.id, checkout_url: url.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-job", companySlug, job.id] });
      qc.invalidateQueries({ queryKey: ["product-jobs", companySlug] });
      qc.invalidateQueries({ queryKey: ["products", companySlug] });
      toast.success("Produto marcado como cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-amber-500/40">
      <CardContent className="p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Cadastrar na Celetus</h2>
          <p className="text-sm text-muted-foreground">
            Copie o prompt, cole no Claude (Chrome) para ele cadastrar o produto com o SRC{" "}
            <code>{job.src}</code>. Depois cole aqui o link do checkout.
          </p>
        </div>
        {job.celetus_prompt ? (
          <div className="space-y-2">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">
              {job.celetus_prompt}
            </pre>
            <Button variant="outline" size="sm" onClick={() => copy(job.celetus_prompt!, "Prompt")}>
              <Copy className="h-4 w-4 mr-1" /> Copiar prompt
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">O Hermes não mandou o prompt de cadastro.</p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="checkout-url">Link do checkout</Label>
          <div className="flex gap-2">
            <Input
              id="checkout-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError("");
              }}
              placeholder="https://pay.celetus.com/..."
            />
            <Button
              disabled={mut.isPending}
              onClick={() => {
                if (!/^https?:\/\/\S+$/.test(url.trim())) {
                  setUrlError("Cole o link completo, começando com https://");
                  return;
                }
                mut.mutate();
              }}
            >
              Marcar como cadastrado
            </Button>
          </div>
          {urlError && <p className="text-xs text-destructive">{urlError}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ job, companySlug }: { job: ProductJob; companySlug: string }) {
  const retry = useServerFn(retryProductJob);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => retry({ data: { company_slug: companySlug, id: job.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-job", companySlug, job.id] });
      qc.invalidateQueries({ queryKey: ["product-jobs", companySlug] });
      toast.success("Pedido reenviado para a fila");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="border-red-500/40">
      <CardContent className="p-4 space-y-2">
        <h2 className="text-sm font-semibold">O Hermes encontrou um erro</h2>
        <p className="text-sm whitespace-pre-wrap">{job.error_message ?? "Sem detalhes."}</p>
        <Button variant="outline" size="sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
          <RotateCcw className="h-4 w-4 mr-1" /> Reenviar
        </Button>
      </CardContent>
    </Card>
  );
}
