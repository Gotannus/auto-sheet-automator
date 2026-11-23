import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Bot, ChevronDown, ChevronRight, RefreshCw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getValidation,
  listHermesReports,
  saveValidationRules,
  type HermesReport,
  type ValidationDay,
  type ValidationProduct,
  type ValidationRules,
  type Verdict,
} from "@/lib/celetus/validation.functions";
import { isValidSlug } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/_authenticated/$companySlug/validacao")({
  head: () => ({ meta: [{ title: "Validação — Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  component: ValidacaoPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {(error as Error).message}</div>,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const num = (v: number, d = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtDay = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const VERDICT: Record<Verdict, { label: string; badge: string; bar: string }> = {
  escalar: {
    label: "Escalar",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    bar: "border-l-emerald-500",
  },
  testando: {
    label: "Testando",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    bar: "border-l-sky-500",
  },
  segurar: {
    label: "Segurar",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    bar: "border-l-amber-500",
  },
  matar: {
    label: "Matar",
    badge: "bg-red-100 text-red-800 border-red-200",
    bar: "border-l-red-500",
  },
  sem_dados: {
    label: "Sem dados",
    badge: "bg-muted text-muted-foreground border-border",
    bar: "border-l-border",
  },
};

const PERIODS = [7, 14, 30];

function ValidacaoPage() {
  const { companySlug } = Route.useParams();
  const [days, setDays] = useState(14);
  const fetchValidation = useServerFn(getValidation);
  const fetchReports = useServerFn(listHermesReports);

  const q = useQuery({
    queryKey: ["validation", companySlug, days],
    queryFn: () => fetchValidation({ data: { company_slug: companySlug, days } }),
    refetchInterval: 60_000,
  });
  const reports = useQuery({
    queryKey: ["hermes-reports", companySlug],
    queryFn: () => fetchReports({ data: { company_slug: companySlug } }),
    refetchInterval: 60_000,
  });

  const products = q.data?.products ?? [];
  const counts = products.reduce(
    (acc, p) => ({ ...acc, [p.verdict]: (acc[p.verdict] ?? 0) + 1 }),
    {} as Partial<Record<Verdict, number>>,
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Validação</h1>
          <p className="text-sm text-muted-foreground">
            Veredito de cada produto nos últimos {days} dias
            {q.data ? ` (${fmtDay(q.data.from)} a ${fmtDay(q.data.to)})` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={d === days ? "default" : "outline"}
              onClick={() => setDays(d)}
            >
              {d} dias
            </Button>
          ))}
          {q.data && <RulesButton slug={companySlug} rules={q.data.rules} />}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              q.refetch();
              reports.refetch();
            }}
            disabled={q.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {q.data && (
        <div className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(VERDICT) as Verdict[]).map((v) => (
            <span key={v} className={`rounded-full border px-3 py-1 ${VERDICT[v].badge}`}>
              {VERDICT[v].label}: <b>{counts[v] ?? 0}</b>
            </span>
          ))}
          <span className="px-2 py-1 text-muted-foreground">
            Regras: CPA máx. {brl(q.data.rules.cpa_max)} · decide a partir de{" "}
            {brl(q.data.rules.min_invest)} · ROAS alvo {num(q.data.rules.roas_target)}
          </span>
        </div>
      )}

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : q.isError ? (
        <p className="text-sm text-red-600">Erro: {(q.error as Error).message}</p>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhum produto ativo, fixado no mês ou com movimento no período.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} slug={companySlug} p={p} />
          ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bot className="h-5 w-5" /> Relatórios do Hermes
        </h2>
        {reports.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (reports.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Nenhum relatório ainda. Eles aparecem aqui quando o Hermes enviar pela API (
              <code>POST /api/public/hermes/reports</code>).
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {(reports.data ?? []).map((r, i) => (
              <ReportItem key={r.id} r={r} defaultOpen={i === 0} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ProductCard({ slug, p }: { slug: string; p: ValidationProduct }) {
  const v = VERDICT[p.verdict];
  return (
    <Card className={`border-l-4 ${v.bar}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to="/$companySlug/produto/$productId"
              params={{ companySlug: slug, productId: p.id }}
              className="font-semibold hover:underline line-clamp-2"
            >
              {p.name}
            </Link>
            <div className="text-xs text-muted-foreground truncate">
              {p.src ? `SRC ${p.src}` : "sem SRC"} · {p.days_since_created} dias
              {p.created_by_hermes ? " · Hermes" : ""}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${v.badge}`}
          >
            {v.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
          <Metric label="Investimento" value={brl(p.invest)} />
          <Metric label="Vendas" value={p.sales} />
          <Metric label="Faturamento" value={brl(p.revenue)} />
          <Metric label="CPA" value={p.sales > 0 ? brl(p.cpa) : "—"} />
          <Metric label="ROAS" value={p.invest > 0 ? num(p.roas) : "—"} />
          <Metric label="Lucro" value={brl(p.revenue - p.invest)} />
        </div>

        <MiniChart daily={p.daily} />

        <p className="text-xs text-muted-foreground">{p.reason}</p>
      </CardContent>
    </Card>
  );
}

// Barras por dia: faturamento (verde) ao lado do investimento (cinza).
function MiniChart({ daily }: { daily: ValidationDay[] }) {
  const max = Math.max(1, ...daily.map((d) => Math.max(d.revenue, d.invest)));
  const w = 100 / daily.length;
  const h = 40;
  return (
    <div>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="h-10 w-full">
        {daily.map((d, i) => {
          const rh = (d.revenue / max) * h;
          const ih = (d.invest / max) * h;
          const x = i * w;
          return (
            <g key={d.date}>
              <title>
                {`${fmtDay(d.date)}: ${d.sales} vendas, faturamento ${brl(d.revenue)}, investimento ${brl(d.invest)}`}
              </title>
              <rect
                x={x + w * 0.1}
                y={h - ih}
                width={w * 0.38}
                height={ih}
                className="fill-slate-300"
              />
              <rect
                x={x + w * 0.52}
                y={h - rh}
                width={w * 0.38}
                height={rh}
                className="fill-emerald-500"
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{fmtDay(daily[0]?.date ?? "")}</span>
        <span className="flex gap-2">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 bg-slate-300" /> invest.
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 bg-emerald-500" /> fatur.
          </span>
        </span>
        <span>{fmtDay(daily[daily.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  );
}

function RulesButton({ slug, rules }: { slug: string; rules: ValidationRules }) {
  const qc = useQueryClient();
  const save = useServerFn(saveValidationRules);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    cpa_max: String(rules.cpa_max),
    min_invest: String(rules.min_invest),
    roas_target: String(rules.roas_target),
  });
  useEffect(() => {
    if (open) {
      setForm({
        cpa_max: String(rules.cpa_max),
        min_invest: String(rules.min_invest),
        roas_target: String(rules.roas_target),
      });
    }
  }, [open, rules]);

  const m = useMutation({
    mutationFn: () => {
      const parse = (s: string) => Number(s.replace(",", "."));
      const values = {
        cpa_max: parse(form.cpa_max),
        min_invest: parse(form.min_invest),
        roas_target: parse(form.roas_target),
      };
      if (Object.values(values).some((n) => !Number.isFinite(n) || n < 0)) {
        throw new Error("Use números maiores ou iguais a zero.");
      }
      return save({ data: { company_slug: slug, ...values } });
    },
    onSuccess: () => {
      toast.success("Regras salvas");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["validation", slug] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const field = (key: keyof typeof form, label: string, hint: string) => (
    <div className="space-y-1">
      <Label htmlFor={`rule-${key}`}>{label}</Label>
      <Input
        id={`rule-${key}`}
        inputMode="decimal"
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <SlidersHorizontal className="h-4 w-4 mr-1" /> Regras
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          {field("cpa_max", "CPA máximo (R$)", "Acima disso o produto não escala.")}
          {field(
            "min_invest",
            "Investimento mínimo para decidir (R$)",
            "Abaixo disso fica em Testando.",
          )}
          {field("roas_target", "ROAS alvo", "Faturamento ÷ investimento (com imposto). Ex.: 1,3")}
          <p className="text-xs text-muted-foreground">
            Segurar: CPA até 30% acima do máximo, ou CPA bom com ROAS abaixo do alvo. Matar: CPA
            mais de 30% acima, ou nenhuma venda depois do mínimo.
          </p>
          <Button type="submit" className="w-full" disabled={m.isPending}>
            {m.isPending ? "Salvando…" : "Salvar regras"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ReportItem({ r, defaultOpen }: { r: HermesReport; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 p-4 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-medium flex-1">{r.title}</span>
        <span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>
      </button>
      {open && (
        <CardContent className="pt-0 pb-4 px-10">
          <Markdown text={r.body_markdown} />
        </CardContent>
      )}
    </Card>
  );
}

// Markdown simples (títulos, listas, negrito, itálico, código), sem HTML cru.
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`"))
      out.push(
        <code key={k++} className="rounded bg-muted px-1 text-[0.9em]">
          {t.slice(1, -1)}
        </code>,
      );
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={blocks.length} className="leading-relaxed">
          {inline(para.join(" "))}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={blocks.length} className="list-decimal pl-5 space-y-1">
            {items}
          </ol>
        ) : (
          <ul key={blocks.length} className="list-disc pl-5 space-y-1">
            {items}
          </ul>
        ),
      );
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      const size = h[1].length <= 1 ? "text-lg" : h[1].length === 2 ? "text-base" : "text-sm";
      blocks.push(
        <div key={blocks.length} className={`${size} font-semibold mt-2`}>
          {inline(h[2])}
        </div>,
      );
    } else if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-2 text-sm">{blocks}</div>;
}
