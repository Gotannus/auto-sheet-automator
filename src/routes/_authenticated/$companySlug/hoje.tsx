import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDailySummary, type DailySummaryResult } from "@/lib/celetus/dashboard.functions";
import { listProducts } from "@/lib/celetus/products.functions";
import { companyPath, isValidSlug } from "@/lib/celetus/workspaces";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, RefreshCw, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/$companySlug/hoje")({
  head: () => ({ meta: [{ title: "Resumo do dia - Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  component: DailyPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

type Preset = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

// BRT helpers
function brtNow(): Date {
  const now = new Date();
  // Convert to BRT (UTC-3)
  return new Date(now.getTime() - 3 * 60 * 60 * 1000);
}
function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function daysBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}
function firstDayOfMonth(ymd: string): string {
  const [y, m] = ymd.split("-");
  return `${y}-${m}-01`;
}
function lastDayOfMonth(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of current
  return dt.toISOString().slice(0, 10);
}
function addMonths(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, d));
  return dt.toISOString().slice(0, 10);
}
function fmtBR(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function rangeForPreset(
  preset: Preset,
  custom?: { from: string; to: string },
): { from: string; to: string; prevFrom: string; prevTo: string; label: string; prevLabel: string } {
  const today = toYMD(brtNow());
  if (preset === "today") {
    const y = addDays(today, -1);
    return {
      from: today, to: today,
      prevFrom: y, prevTo: y,
      label: `Hoje · ${fmtBR(today)}`,
      prevLabel: `vs Ontem (${fmtBR(y)})`,
    };
  }
  if (preset === "yesterday") {
    const y = addDays(today, -1);
    const yy = addDays(today, -2);
    return {
      from: y, to: y,
      prevFrom: yy, prevTo: yy,
      label: `Ontem · ${fmtBR(y)}`,
      prevLabel: `vs Anteontem (${fmtBR(yy)})`,
    };
  }
  if (preset === "thisMonth") {
    const from = firstDayOfMonth(today);
    const to = today;
    const prevFrom = addMonths(from, -1);
    const prevTo = addMonths(to, -1);
    return {
      from, to, prevFrom, prevTo,
      label: `Este mês · ${fmtBR(from)} → ${fmtBR(to)}`,
      prevLabel: `vs mesmo período do mês passado (${fmtBR(prevFrom)} → ${fmtBR(prevTo)})`,
    };
  }
  if (preset === "lastMonth") {
    const firstThis = firstDayOfMonth(today);
    const from = addMonths(firstThis, -1);
    const to = lastDayOfMonth(from);
    const prevFrom = addMonths(from, -1);
    const prevTo = lastDayOfMonth(prevFrom);
    return {
      from, to, prevFrom, prevTo,
      label: `Mês passado · ${fmtBR(from)} → ${fmtBR(to)}`,
      prevLabel: `vs mês retrasado (${fmtBR(prevFrom)} → ${fmtBR(prevTo)})`,
    };
  }
  if (preset === "custom" && custom) {
    const from = custom.from;
    const to = custom.to;
    const span = daysBetween(from, to);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -span);
    return {
      from, to, prevFrom, prevTo,
      label: `Personalizado · ${fmtBR(from)} → ${fmtBR(to)}`,
      prevLabel: `vs período anterior (${fmtBR(prevFrom)} → ${fmtBR(prevTo)})`,
    };
  }
  // last7
  const to = today;
  const from = addDays(today, -6);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -6);
  return {
    from, to, prevFrom, prevTo,
    label: `Últimos 7 dias · ${fmtBR(from)} → ${fmtBR(to)}`,
    prevLabel: `vs 7 dias anteriores (${fmtBR(prevFrom)} → ${fmtBR(prevTo)})`,
  };
}

const summaryQO = (companySlug: string, from: string, to: string, productId: string | null) =>
  queryOptions({
    queryKey: ["daily-summary", companySlug, from, to, productId ?? "all"],
    queryFn: () =>
      getDailySummary({
        data: {
          company_slug: companySlug,
          from,
          to,
          ...(productId ? { product_id: productId } : {}),
        },
      }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

const productsQO = (companySlug: string) =>
  queryOptions({
    queryKey: ["products", companySlug],
    queryFn: () => listProducts({ data: { company_slug: companySlug } }),
  });

function DailyPage() {
  const { companySlug } = Route.useParams();
  const [preset, setPreset] = useState<Preset>("today");
  const [productId, setProductId] = useState<string>("all");
  const todayYmd = useMemo(() => toYMD(brtNow()), []);
  const [customFrom, setCustomFrom] = useState<string>(firstDayOfMonth(todayYmd));
  const [customTo, setCustomTo] = useState<string>(todayYmd);
  const r = useMemo(
    () => rangeForPreset(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );

  const productsQuery = useQuery(productsQO(companySlug));
  const products = productsQuery.data ?? [];
  const pid = productId === "all" ? null : productId;

  const curQuery = useQuery(summaryQO(companySlug, r.from, r.to, pid));
  const prevQuery = useQuery(summaryQO(companySlug, r.prevFrom, r.prevTo, pid));

  // Refetch when preset changes -> queries re-key automatically.
  const cur = curQuery.data;
  const prev = prevQuery.data;
  const loading = curQuery.isLoading || prevQuery.isLoading;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resumo do dia</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span>{r.label}</span>
            <span className="text-muted-foreground/70">·</span>
            <span>{r.prevLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Todos os produtos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.display_name || p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="yesterday">Ontem</SelectItem>
              <SelectItem value="last7">Últimos 7 dias</SelectItem>
              <SelectItem value="thisMonth">Este mês</SelectItem>
              <SelectItem value="lastMonth">Mês passado</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-[160px]"
              />
              <span className="text-muted-foreground text-sm">→</span>
              <Input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              curQuery.refetch();
              prevQuery.refetch();
            }}
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>


      {curQuery.error || prevQuery.error ? (
        <Card>
          <CardContent className="p-6 text-destructive">
            Erro: {(curQuery.error || prevQuery.error)?.message}
          </CardContent>
        </Card>
      ) : null}

      <SummaryCards cur={cur} prev={prev} loading={loading} />

      <Card>
        <CardContent className="p-0">
          <div className="px-5 py-3 border-b font-semibold text-sm">
            Produtos do período {cur ? `(${cur.by_product.length})` : ""}
          </div>
          <ProductsTable cur={cur} companySlug={companySlug} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---- formatters ----
const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtInt = (v: number) => v.toLocaleString("pt-BR");
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Delta({ cur, prev, kind = "currency" }: { cur: number; prev: number; kind?: "currency" | "int" | "pct" }) {
  const diff = cur - prev;
  const pct = prev !== 0 ? diff / Math.abs(prev) : cur > 0 ? 1 : 0;
  const positive = diff >= 0;
  const fmt =
    kind === "currency" ? fmtBRL : kind === "int" ? fmtInt : fmtPct;
  const sign = positive ? "+" : "−";
  const absDiff = Math.abs(diff);
  return (
    <div className={`flex items-center gap-1 text-xs mt-1 ${positive ? "text-emerald-600" : "text-rose-600"}`}>
      {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      <span>
        {sign}
        {kind === "pct" ? fmt(absDiff) : fmt(absDiff)}
      </span>
      {prev !== 0 && (
        <span className="text-muted-foreground/80">
          ({sign}
          {(Math.abs(pct) * 100).toFixed(1)}%)
        </span>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  accent,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  accent?: "default" | "profit" | "loss" | "roi" | "invest";
}) {
  const accentClass =
    accent === "profit"
      ? "text-emerald-600"
      : accent === "loss"
        ? "text-rose-600"
        : accent === "roi"
          ? "text-amber-600"
          : accent === "invest"
            ? "text-sky-600"
            : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${accentClass}`}>{value}</div>
        {delta}
      </CardContent>
    </Card>
  );
}

function SummaryCards({
  cur,
  prev,
  loading,
}: {
  cur: DailySummaryResult | undefined;
  prev: DailySummaryResult | undefined;
  loading: boolean;
}) {
  if (!cur || !prev) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              <div className="h-7 w-28 bg-muted rounded mt-2 animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  const t = cur.totals;
  const p = prev.totals;
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${loading ? "opacity-80" : ""}`}>
      <MetricCard
        label="Vendas"
        value={fmtInt(t.sales)}
        delta={<Delta cur={t.sales} prev={p.sales} kind="int" />}
      />
      <MetricCard
        label="Faturamento líq."
        value={fmtBRL(t.revenue - t.revenue_tax)}
        delta={
          <Delta cur={t.revenue - t.revenue_tax} prev={p.revenue - p.revenue_tax} />
        }
      />
      <MetricCard
        label="Investimento"
        value={fmtBRL(t.invest_final)}
        accent="invest"
        delta={<Delta cur={t.invest_final} prev={p.invest_final} />}
      />
      <MetricCard
        label="Lucro"
        value={fmtBRL(t.profit)}
        accent={t.profit >= 0 ? "profit" : "loss"}
        delta={<Delta cur={t.profit} prev={p.profit} />}
      />
      <MetricCard
        label="ROI"
        value={fmtPct(t.roi)}
        accent="roi"
        delta={<Delta cur={t.roi} prev={p.roi} kind="pct" />}
      />
      <MetricCard
        label="CPA"
        value={t.sales > 0 ? fmtBRL(t.cpa) : "—"}
        delta={t.sales > 0 && p.sales > 0 ? <Delta cur={t.cpa} prev={p.cpa} /> : undefined}
      />
      <MetricCard
        label="Ticket médio"
        value={t.sales > 0 ? fmtBRL(t.ticket) : "—"}
        delta={t.sales > 0 && p.sales > 0 ? <Delta cur={t.ticket} prev={p.ticket} /> : undefined}
      />
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Order Bump</div>
          <div className="text-2xl font-bold mt-1">{fmtInt(t.ob_qty)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {fmtBRL(t.ob_revenue)} · {fmtPct(t.ob_pct)} dos pedidos
          </div>
          <Delta cur={t.ob_qty} prev={p.ob_qty} kind="int" />
        </CardContent>
      </Card>
    </div>
  );
}

function ProductsTable({
  cur,
  companySlug,
  loading,
}: {
  cur: DailySummaryResult | undefined;
  companySlug: string;
  loading: boolean;
}) {
  if (!cur) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {loading ? "Carregando..." : "Sem dados."}
      </div>
    );
  }
  if (cur.by_product.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Nenhum produto teve atividade no período selecionado.
      </div>
    );
  }
  const t = cur.totals;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Produto</TableHead>
          <TableHead className="text-right">Vendas</TableHead>
          <TableHead className="text-right">Faturamento</TableHead>
          <TableHead className="text-right">OB qtd</TableHead>
          <TableHead className="text-right">OB fat.</TableHead>
          <TableHead className="text-right">Invest.</TableHead>
          <TableHead className="text-right">Lucro</TableHead>
          <TableHead className="text-right">ROI</TableHead>
          <TableHead className="text-right">CPA</TableHead>
          <TableHead className="text-right">Ticket</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cur.by_product.map((row) => (
          <TableRow key={row.product_id}>
            <TableCell>
              <Link
                to={companyPath(companySlug, "dashboard")}
                className="text-primary hover:underline"
              >
                {row.product_name}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtInt(row.sales)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtBRL(row.revenue)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtInt(row.ob_qty)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtBRL(row.ob_revenue)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtBRL(row.invest_final)}</TableCell>
            <TableCell
              className={`text-right tabular-nums font-medium ${row.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {fmtBRL(row.profit)}
            </TableCell>
            <TableCell
              className={`text-right tabular-nums ${row.roi >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {row.invest_final > 0 ? fmtPct(row.roi) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.sales > 0 ? fmtBRL(row.cpa) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.sales > 0 ? fmtBRL(row.ticket) : "—"}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="font-semibold bg-muted/40">
          <TableCell>TOTAL</TableCell>
          <TableCell className="text-right tabular-nums">{fmtInt(t.sales)}</TableCell>
          <TableCell className="text-right tabular-nums">{fmtBRL(t.revenue)}</TableCell>
          <TableCell className="text-right tabular-nums">{fmtInt(t.ob_qty)}</TableCell>
          <TableCell className="text-right tabular-nums">{fmtBRL(t.ob_revenue)}</TableCell>
          <TableCell className="text-right tabular-nums">{fmtBRL(t.invest_final)}</TableCell>
          <TableCell
            className={`text-right tabular-nums ${t.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
          >
            {fmtBRL(t.profit)}
          </TableCell>
          <TableCell
            className={`text-right tabular-nums ${t.roi >= 0 ? "text-emerald-600" : "text-rose-600"}`}
          >
            {t.invest_final > 0 ? fmtPct(t.roi) : "—"}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {t.sales > 0 ? fmtBRL(t.cpa) : "—"}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {t.sales > 0 ? fmtBRL(t.ticket) : "—"}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}



