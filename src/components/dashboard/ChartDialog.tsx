import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getDashboard } from "@/lib/celetus/dashboard.functions";

export type MetricKey =
  | "revenue"
  | "invest"
  | "profit"
  | "sales"
  | "roi"
  | "cpa"
  | "ticket"
  | "clicks"
  | "checkouts";

type MetricDef = {
  key: MetricKey;
  label: string;
  color: string;
  axis: "left" | "right";
  format: "brl" | "int" | "pct";
  type: "bar" | "line";
};

const METRICS: MetricDef[] = [
  { key: "revenue", label: "Faturamento", color: "hsl(217 91% 60%)", axis: "left", format: "brl", type: "bar" },
  { key: "invest", label: "Investimento", color: "hsl(25 95% 53%)", axis: "left", format: "brl", type: "bar" },
  { key: "profit", label: "Lucro", color: "hsl(142 76% 36%)", axis: "left", format: "brl", type: "line" },
  { key: "cpa", label: "CPA", color: "hsl(280 65% 60%)", axis: "left", format: "brl", type: "line" },
  { key: "ticket", label: "Ticket médio", color: "hsl(199 89% 48%)", axis: "left", format: "brl", type: "line" },
  { key: "sales", label: "Vendas", color: "hsl(340 75% 55%)", axis: "right", format: "int", type: "line" },
  { key: "roi", label: "ROI", color: "hsl(48 96% 53%)", axis: "right", format: "pct", type: "line" },
  { key: "clicks", label: "Cliques", color: "hsl(168 76% 42%)", axis: "right", format: "int", type: "line" },
  { key: "checkouts", label: "Checkouts", color: "hsl(20 90% 60%)", axis: "right", format: "int", type: "line" },
];

type PeriodKey =
  | "current_month"
  | "previous_month"
  | "last_3_months"
  | "last_6_months"
  | "current_year"
  | "previous_year";

type Granularity = "day" | "week" | "month";

type DayRow = {
  date: string;
  sales: number;
  revenue: number;
  invest_final: number;
  profit: number;
  cpa: number;
  ticket: number;
  roi: number;
  clicks: number | null;
  checkouts: number | null;
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRLFull = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtPct = (n: number) =>
  (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";

function formatValue(value: number, fmt: MetricDef["format"]) {
  if (fmt === "brl") return fmtBRLFull(value);
  if (fmt === "pct") return fmtPct(value);
  return fmtInt(value);
}

function axisTick(value: number, fmt: MetricDef["format"]) {
  if (fmt === "brl") return fmtBRL(value);
  if (fmt === "pct") return (value * 100).toFixed(0) + "%";
  return fmtInt(value);
}

function getMonthsRange(period: PeriodKey, now: Date): { year: number; month: number }[] {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const months: { year: number; month: number }[] = [];
  const push = (year: number, month: number) => {
    let yr = year;
    let mo = month;
    while (mo <= 0) {
      mo += 12;
      yr -= 1;
    }
    while (mo > 12) {
      mo -= 12;
      yr += 1;
    }
    months.push({ year: yr, month: mo });
  };
  switch (period) {
    case "current_month":
      push(y, m);
      break;
    case "previous_month":
      push(y, m - 1);
      break;
    case "last_3_months":
      for (let i = 2; i >= 0; i--) push(y, m - i);
      break;
    case "last_6_months":
      for (let i = 5; i >= 0; i--) push(y, m - i);
      break;
    case "current_year":
      for (let i = 1; i <= 12; i++) push(y, i);
      break;
    case "previous_year":
      for (let i = 1; i <= 12; i++) push(y - 1, i);
      break;
  }
  return months;
}

function defaultGranularity(period: PeriodKey): Granularity {
  if (period === "current_month" || period === "previous_month") return "day";
  if (period === "last_3_months" || period === "last_6_months") return "week";
  return "month";
}

function isoWeekKey(date: Date): string {
  // ISO week label: yyyy-Www (UTC)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function bucketKey(dateStr: string, gran: Granularity): { key: string; label: string } {
  const [yy, mm, dd] = dateStr.split("-").map(Number);
  const date = new Date(yy, mm - 1, dd);
  if (gran === "day") {
    return { key: dateStr, label: `${String(dd).padStart(2, "0")}/${String(mm).padStart(2, "0")}` };
  }
  if (gran === "month") {
    const key = `${yy}-${String(mm).padStart(2, "0")}`;
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return { key, label: `${monthNames[mm - 1]}/${String(yy).slice(2)}` };
  }
  // week
  const key = isoWeekKey(date);
  // Compute monday of that week for label
  const d = new Date(date);
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() - dow + 1);
  const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { key, label };
}

type Bucket = {
  key: string;
  label: string;
  revenue: number;
  invest: number;
  profit: number;
  sales: number;
  clicks: number;
  checkouts: number;
};

function aggregate(days: DayRow[], gran: Granularity) {
  const map = new Map<string, Bucket>();
  for (const d of days) {
    const { key, label } = bucketKey(d.date, gran);
    let b = map.get(key);
    if (!b) {
      b = { key, label, revenue: 0, invest: 0, profit: 0, sales: 0, clicks: 0, checkouts: 0 };
      map.set(key, b);
    }
    b.revenue += d.revenue;
    b.invest += d.invest_final;
    b.profit += d.profit;
    b.sales += d.sales;
    b.clicks += d.clicks ?? 0;
    b.checkouts += d.checkouts ?? 0;
  }
  const buckets = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  return buckets.map((b) => ({
    ...b,
    cpa: b.sales > 0 ? b.invest / b.sales : 0,
    ticket: b.sales > 0 ? b.revenue / b.sales : 0,
    roi: b.invest > 0 ? b.profit / b.invest : 0,
  }));
}

export function ChartDialog({
  open,
  onOpenChange,
  companySlug,
  productId,
  initialMetrics,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companySlug: string;
  productId?: string;
  initialMetrics?: MetricKey[];
}) {
  const [period, setPeriod] = useState<PeriodKey>("current_month");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [granularityTouched, setGranularityTouched] = useState(false);
  const [selected, setSelected] = useState<MetricKey[]>(
    initialMetrics && initialMetrics.length ? initialMetrics : ["revenue", "invest", "profit"],
  );

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setSelected(initialMetrics && initialMetrics.length ? initialMetrics : ["revenue", "invest", "profit"]);
      setPeriod("current_month");
      setGranularity("day");
      setGranularityTouched(false);
    }
  }, [open, initialMetrics]);

  // Auto-adjust granularity when period changes (unless user touched it)
  useEffect(() => {
    if (!granularityTouched) {
      setGranularity(defaultGranularity(period));
    }
  }, [period, granularityTouched]);

  const months = useMemo(() => getMonthsRange(period, new Date()), [period]);
  const fetchDash = useServerFn(getDashboard);

  const queries = useQueries({
    queries: months.map((mo) => ({
      queryKey: ["chart-month", companySlug, productId ?? "__total__", mo.year, mo.month],
      queryFn: () =>
        fetchDash({
          data: {
            company_slug: companySlug,
            ...(productId ? { product_id: productId } : {}),
            year: mo.year,
            month: mo.month,
          },
        }),
      enabled: open,
      staleTime: 30_000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const allDays = useMemo<DayRow[]>(() => {
    const out: DayRow[] = [];
    for (const q of queries) {
      if (!q.data) continue;
      for (const d of q.data.days) {
        out.push({
          date: d.date,
          sales: d.sales,
          revenue: d.revenue,
          invest_final: d.invest_final,
          profit: d.profit,
          cpa: d.cpa,
          ticket: d.ticket,
          roi: d.roi,
          clicks: d.clicks,
          checkouts: d.checkouts,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join(",")]);

  const buckets = useMemo(() => aggregate(allDays, granularity), [allDays, granularity]);

  // Trim trailing empty buckets only at the very end (so today's blank doesn't dominate)
  const trimmed = useMemo(() => {
    const arr = [...buckets];
    while (arr.length > 1) {
      const last = arr[arr.length - 1];
      const empty =
        last.revenue === 0 && last.invest === 0 && last.sales === 0 && last.clicks === 0 && last.checkouts === 0;
      if (!empty) break;
      arr.pop();
    }
    return arr;
  }, [buckets]);

  const activeMetrics = METRICS.filter((m) => selected.includes(m.key));
  const hasLeft = activeMetrics.some((m) => m.axis === "left");
  const hasRight = activeMetrics.some((m) => m.axis === "right");
  const hasMoney = activeMetrics.some((m) => m.format === "brl");
  const hasPctOrInt = activeMetrics.some((m) => m.format !== "brl");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Gráficos do dashboard</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Período</span>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Mês atual</SelectItem>
                <SelectItem value="previous_month">Mês anterior</SelectItem>
                <SelectItem value="last_3_months">Últimos 3 meses</SelectItem>
                <SelectItem value="last_6_months">Últimos 6 meses</SelectItem>
                <SelectItem value="current_year">Ano atual</SelectItem>
                <SelectItem value="previous_year">Ano anterior</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Granularidade</span>
            <ToggleGroup
              type="single"
              size="sm"
              value={granularity}
              onValueChange={(v) => {
                if (!v) return;
                setGranularity(v as Granularity);
                setGranularityTouched(true);
              }}
            >
              <ToggleGroupItem value="day">Dia</ToggleGroupItem>
              <ToggleGroupItem value="week">Semana</ToggleGroupItem>
              <ToggleGroupItem value="month">Mês</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => {
            const active = selected.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() =>
                  setSelected((s) =>
                    s.includes(m.key) ? s.filter((k) => k !== m.key) : [...s, m.key],
                  )
                }
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors flex items-center gap-1.5 ${
                  active
                    ? "bg-foreground/5 border-foreground/30"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: active ? m.color : "transparent", border: `1px solid ${m.color}` }}
                />
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="h-[420px] w-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Carregando…
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-full text-sm text-destructive">
              Erro ao carregar dados do gráfico.
            </div>
          ) : trimmed.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Sem dados para o período selecionado.
            </div>
          ) : activeMetrics.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Selecione ao menos uma métrica.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trimmed} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                {hasLeft && (
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => axisTick(v, hasMoney ? "brl" : "int")}
                    width={70}
                  />
                )}
                {hasRight && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) =>
                      axisTick(v, hasPctOrInt && activeMetrics.some((m) => m.axis === "right" && m.format === "pct") ? "pct" : "int")
                    }
                    width={60}
                  />
                )}
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number, name: string) => {
                    const def = METRICS.find((m) => m.label === name);
                    if (!def) return [value, name];
                    return [formatValue(value, def.format), def.label];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {activeMetrics.map((m) =>
                  m.type === "bar" ? (
                    <Bar
                      key={m.key}
                      yAxisId={m.axis}
                      dataKey={m.key}
                      name={m.label}
                      fill={m.color}
                      radius={[3, 3, 0, 0]}
                    />
                  ) : (
                    <Line
                      key={m.key}
                      yAxisId={m.axis}
                      type="monotone"
                      dataKey={m.key}
                      name={m.label}
                      stroke={m.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  ),
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
