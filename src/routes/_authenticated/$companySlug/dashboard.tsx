import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueries,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { listProducts, type Product } from "@/lib/celetus/products.functions";
import { getDashboard, upsertDailyInput } from "@/lib/celetus/dashboard.functions";
import { companyPath, isValidSlug } from "@/lib/celetus/workspaces";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Pencil, Check, BarChart3, LineChart as LineChartIcon, ChevronRight, ChevronDown } from "lucide-react";
import { ChartDialog, type MetricKey } from "@/components/dashboard/ChartDialog";

export const Route = createFileRoute("/_authenticated/$companySlug/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(productsQO(params.companySlug)),
  component: DashboardPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

const productsQO = (companySlug: string) =>
  queryOptions({
    queryKey: ["products", companySlug],
    queryFn: () => listProducts({ data: { company_slug: companySlug } }),
  });

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const TOTAL_PRODUCT_ID = "__total__";

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
type DayData = DashboardData["days"][number];

function todayBRT(): { year: number; month: number; day: string } {
  const s = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [y, m] = s.split("-");
  return { year: Number(y), month: Number(m), day: s };
}
function yesterdayBRT(): { year: number; month: number; day: string } {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const s = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [y, m] = s.split("-");
  return { year: Number(y), month: Number(m), day: s };
}

type DayFilter = "all" | "today" | "yesterday";
type Range = { from: string; to: string };

function monthsBetween(from: string, to: string): { year: number; month: number }[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: { year: number; month: number }[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function brtFromDate(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function parseLocal(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function shiftDays(d: string, delta: number): string {
  const base = parseLocal(d);
  base.setDate(base.getDate() + delta);
  return brtFromDate(base);
}

function isFullMonth(range: Range): boolean {
  const [fy, fm, fd] = range.from.split("-").map(Number);
  const [ty, tm, td] = range.to.split("-").map(Number);
  if (fy !== ty || fm !== tm) return false;
  if (fd !== 1) return false;
  const lastDay = new Date(ty, tm, 0).getDate();
  return td === lastDay;
}

function DashboardPage() {
  const { companySlug } = Route.useParams();
  const company = { slug: companySlug };
  const { data: products } = useSuspenseQuery(productsQO(company.slug));
  const now = new Date();
  const [productId, setProductId] = useState<string>(TOTAL_PRODUCT_ID);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [range, setRange] = useState<Range | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [pickerRange, setPickerRange] = useState<DateRange | undefined>(undefined);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartMetrics, setChartMetrics] = useState<MetricKey[] | undefined>(undefined);
  const openChart = (metrics?: MetricKey[]) => {
    setChartMetrics(metrics);
    setChartOpen(true);
  };
  const isTotal = productId === TOTAL_PRODUCT_ID;
  const selectedProductId = isTotal ? undefined : productId;

  const targetDay = useMemo(() => {
    if (range) return null;
    if (dayFilter === "today") return todayBRT().day;
    if (dayFilter === "yesterday") return yesterdayBRT().day;
    return null;
  }, [dayFilter, range]);

  const applyQuickFilter = (f: DayFilter) => {
    setRange(null);
    setPickerRange(undefined);
    if (f === "all") {
      setDayFilter("all");
      return;
    }
    const t = f === "today" ? todayBRT() : yesterdayBRT();
    setYear(t.year);
    setMonth(t.month);
    setDayFilter(f);
  };

  const setMonthManual = (m: number) => {
    setRange(null);
    setPickerRange(undefined);
    setMonth(m);
    setDayFilter("all");
  };
  const setYearManual = (y: number) => {
    setRange(null);
    setPickerRange(undefined);
    setYear(y);
    setDayFilter("all");
  };

  const applyRange = (from: string, to: string) => {
    setDayFilter("all");
    setRange({ from, to });
    setPickerRange({ from: parseLocal(from), to: parseLocal(to) });
    // align month/year selectors to the range start
    const [ry, rm] = from.split("-").map(Number);
    setYear(ry);
    setMonth(rm);
    setRangeOpen(false);
  };

  const applyPreset = (days: number) => {
    const today = todayBRT().day;
    const from = shiftDays(today, -(days - 1));
    applyRange(from, today);
  };

  const dayLabel = targetDay ? targetDay.split("-").reverse().slice(0, 2).join("/") : null;
  const selectedLabel = isTotal
    ? "Total de todos os produtos"
    : products.find((product: Product) => product.id === productId)?.name || "Produto";
  const rangeLabel = range
    ? `${range.from.split("-").reverse().slice(0, 2).join("/")} → ${range.to
        .split("-")
        .reverse()
        .slice(0, 2)
        .join("/")}`
    : null;
  const periodLabel = rangeLabel
    ? rangeLabel
    : targetDay
    ? `${dayLabel} (${dayFilter === "today" ? "Hoje" : "Ontem"})`
    : `${MONTHS[month - 1]} ${year}`;

  const months = useMemo(
    () => (range ? monthsBetween(range.from, range.to) : [{ year, month }]),
    [range, year, month],
  );

  const fetchDash = useServerFn(getDashboard);
  const queries = useQueries({
    queries: months.map((mo) => ({
      queryKey: ["dash", company.slug, productId, mo.year, mo.month],
      queryFn: () =>
        fetchDash({
          data: {
            company_slug: company.slug,
            ...(selectedProductId ? { product_id: selectedProductId } : {}),
            year: mo.year,
            month: mo.month,
          },
        }),
      enabled: isTotal || !!selectedProductId,
    })),
  });

  // Always-Total queries used to derive which products have activity in the
  // current period (for filtering the product dropdown). When the user is
  // already in Total, React Query dedupes via the shared queryKey.
  const totalQueries = useQueries({
    queries: months.map((mo) => ({
      queryKey: ["dash", company.slug, TOTAL_PRODUCT_ID, mo.year, mo.month],
      queryFn: () =>
        fetchDash({
          data: { company_slug: company.slug, year: mo.year, month: mo.month },
        }),
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const primary = queries[0]?.data ?? null;

  const mergedDays = useMemo<DayData[]>(() => {
    const all: DayData[] = [];
    for (const q of queries) if (q.data) all.push(...q.data.days);
    if (range) return all.filter((d) => d.date >= range.from && d.date <= range.to);
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join(","), range]);

  const activeProductIds = useMemo<Set<string> | null>(() => {
    if (totalQueries.some((q) => q.isLoading && !q.data)) return null;
    const ids = new Set<string>();
    for (const q of totalQueries) {
      if (!q.data) continue;
      for (const d of q.data.days) {
        if (range && (d.date < range.from || d.date > range.to)) continue;
        for (const p of d.by_product ?? []) {
          if (p.sales > 0 || (p.invest_manual ?? 0) > 0) ids.add(p.product_id);
        }
      }
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalQueries.map((q) => q.dataUpdatedAt).join(","), range]);

  const visibleProducts = useMemo(() => {
    if (!activeProductIds) return products;
    return products.filter(
      (p: Product) => activeProductIds.has(p.id) || p.id === productId,
    );
  }, [products, activeProductIds, productId]);


  if (!products.length) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <h2 className="text-xl font-semibold">Nenhum produto cadastrado</h2>
            <p className="text-muted-foreground">
              Cadastre o primeiro produto com nome + SRC da Celetus para comecar.
            </p>
            <Button asChild>
              <Link to={companyPath(company.slug, "products")}>Cadastrar produto</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-col md:flex-row md:items-end gap-3 md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {selectedLabel} - {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={!range && dayFilter === "today" ? "default" : "outline"}
              onClick={() => applyQuickFilter("today")}
            >
              Hoje
            </Button>
            <Button
              size="sm"
              variant={!range && dayFilter === "yesterday" ? "default" : "outline"}
              onClick={() => applyQuickFilter("yesterday")}
            >
              Ontem
            </Button>
            <Button
              size="sm"
              variant={!range && dayFilter === "all" ? "default" : "outline"}
              onClick={() => applyQuickFilter("all")}
            >
              Mês inteiro
            </Button>
            <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant={range ? "default" : "outline"}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {range ? rangeLabel : "Personalizado"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3 pointer-events-auto" align="end">
                <div className="flex flex-wrap gap-1 mb-2">
                  <Button size="sm" variant="ghost" onClick={() => applyPreset(7)}>
                    Últimos 7d
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => applyPreset(14)}>
                    Últimos 14d
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => applyPreset(30)}>
                    Últimos 30d
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const today = todayBRT();
                      const from = `${today.year}-${String(today.month).padStart(2, "0")}-01`;
                      applyRange(from, today.day);
                    }}
                  >
                    Este mês
                  </Button>
                  {range && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRange(null);
                        setPickerRange(undefined);
                        setRangeOpen(false);
                      }}
                    >
                      Limpar
                    </Button>
                  )}
                </div>
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={pickerRange}
                  onSelect={(r) => {
                    setPickerRange(r);
                    if (r?.from && r?.to) {
                      applyRange(brtFromDate(r.from), brtFromDate(r.to));
                    }
                  }}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Produto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOTAL_PRODUCT_ID}>Total</SelectItem>
              {products.map((p: Product) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.display_name || p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonthManual(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYearManual(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="outline"
            onClick={() => openChart()}
            title="Ver gráficos"
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {isLoading || !primary ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando...</CardContent>
        </Card>
      ) : (
        <DashContent
          companySlug={company.slug}
          productId={selectedProductId}
          isTotal={isTotal}
          data={primary}
          targetDay={targetDay}
          rangeDays={range ? mergedDays : null}
          rangeFullMonth={range ? isFullMonth(range) : false}
          onChartClick={openChart}
        />
      )}

      <ChartDialog
        open={chartOpen}
        onOpenChange={setChartOpen}
        companySlug={company.slug}
        productId={selectedProductId}
        initialMetrics={chartMetrics}
      />
    </div>
  );
}


function DashContent({
  companySlug,
  productId,
  isTotal,
  data,
  targetDay,
  rangeDays,
  rangeFullMonth,
  onChartClick,
}: {
  companySlug: string;
  productId?: string;
  isTotal: boolean;
  data: DashboardData;
  targetDay: string | null;
  rangeDays: DayData[] | null;
  rangeFullMonth: boolean;
  onChartClick: (metrics?: MetricKey[]) => void;
}) {
  const filteredDays = useMemo(
    () =>
      rangeDays
        ? rangeDays
        : targetDay
        ? data.days.filter((d) => d.date === targetDay)
        : data.days,
    [data.days, targetDay, rangeDays],
  );

  const t = useMemo(() => {
    const base = data.totals;
    // Range mode: aggregate the provided days
    if (rangeDays) {
      let sales = 0;
      let revenue = 0;
      let revenue_tax = 0;
      let ob_qty = 0;
      let ob_revenue = 0;
      let invest_manual = 0;
      let invest_final = 0;
      let clicks = 0;
      let checkouts = 0;
      let impressions = 0;
      for (const d of rangeDays) {
        sales += d.sales;
        revenue += d.revenue;
        revenue_tax += d.revenue_tax;
        ob_qty += d.ob_qty;
        ob_revenue += d.ob_revenue;
        invest_manual += d.invest_manual ?? 0;
        invest_final += d.invest_final;
        clicks += d.clicks ?? 0;
        checkouts += d.checkouts ?? 0;
        impressions += d.impressions ?? 0;
      }
      const profitBeforeExpenses = revenue - revenue_tax - invest_final;
      const monthlyExpenses = rangeFullMonth ? base.monthly_expenses : 0;
      const netProfit = profitBeforeExpenses - monthlyExpenses;
      const positive = Math.max(0, netProfit);
      const companyCash = positive * base.company_cash_rate;
      const distributable = Math.max(0, positive - companyCash);
      const cpm = impressions > 0 ? (invest_final / impressions) * 1000 : 0;
      return {
        ...base,
        sales,
        revenue,
        revenue_tax,
        ob_qty,
        ob_revenue,
        invest_manual,
        invest_final,
        clicks,
        checkouts,
        impressions,
        profit: netProfit,
        profit_before_expenses: profitBeforeExpenses,
        monthly_expenses: monthlyExpenses,
        net_profit: netProfit,
        company_cash: companyCash,
        distributable_profit: distributable,
        partner_1_amount: distributable * base.partner_1_rate,
        partner_2_amount: distributable * base.partner_2_rate,
        roi: invest_final > 0 ? netProfit / invest_final : 0,
        cpa: sales > 0 ? invest_final / sales : 0,
        ticket: sales > 0 ? revenue / sales : 0,
        ob_pct: sales > 0 ? ob_qty / sales : 0,
        cpm,
        conv_click: clicks > 0 ? sales / clicks : 0,
        conv_checkout: checkouts > 0 ? sales / checkouts : 0,
      };
    }
    if (!targetDay) return base;
    const d = data.days.find((x) => x.date === targetDay);
    if (!d) {
      return {
        ...base,
        sales: 0,
        revenue: 0,
        revenue_tax: 0,
        ob_qty: 0,
        ob_revenue: 0,
        invest_manual: 0,
        invest_final: 0,
        clicks: 0,
        checkouts: 0,
        impressions: 0,
        profit: 0,
        profit_before_expenses: 0,
        monthly_expenses: 0,
        net_profit: 0,
        company_cash: 0,
        distributable_profit: 0,
        partner_1_amount: 0,
        partner_2_amount: 0,
        roi: 0,
        cpa: 0,
        ticket: 0,
        ob_pct: 0,
        cpm: 0,
        conv_click: 0,
        conv_checkout: 0,
      };
    }
    const profitBeforeExpenses = d.profit; // já = revenue - revenue_tax - invest_final
    const netProfit = profitBeforeExpenses; // sem despesas no modo dia
    const positive = Math.max(0, netProfit);
    const companyCash = positive * base.company_cash_rate;
    const distributable = Math.max(0, positive - companyCash);
    const cpm = (d.impressions ?? 0) > 0 ? (d.invest_final / (d.impressions ?? 1)) * 1000 : 0;
    const convClick = (d.clicks ?? 0) > 0 ? d.sales / (d.clicks ?? 1) : 0;
    const convCheckout = (d.checkouts ?? 0) > 0 ? d.sales / (d.checkouts ?? 1) : 0;
    return {
      ...base,
      sales: d.sales,
      revenue: d.revenue,
      revenue_tax: d.revenue_tax,
      ob_qty: d.ob_qty,
      ob_revenue: d.ob_revenue,
      invest_manual: d.invest_manual ?? 0,
      invest_final: d.invest_final,
      clicks: d.clicks ?? 0,
      checkouts: d.checkouts ?? 0,
      impressions: d.impressions ?? 0,
      profit: netProfit,
      profit_before_expenses: profitBeforeExpenses,
      monthly_expenses: 0,
      net_profit: netProfit,
      company_cash: companyCash,
      distributable_profit: distributable,
      partner_1_amount: distributable * base.partner_1_rate,
      partner_2_amount: distributable * base.partner_2_rate,
      roi: d.roi,
      cpa: d.cpa,
      ticket: d.ticket,
      ob_pct: d.ob_pct,
      cpm,
      conv_click: convClick,
      conv_checkout: convCheckout,
    };
  }, [data, targetDay, rangeDays, rangeFullMonth]);

  const isPartialRange = !!rangeDays && !rangeFullMonth;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat label="Vendas" value={fmtInt(t.sales)} onChart={() => onChartClick(["sales"])} />
        <Stat label="Faturamento" value={fmtBRL(t.revenue)} onChart={() => onChartClick(["revenue"])} />
        <Stat label="Imposto fat." value={fmtBRL(t.revenue_tax)} />
        <Stat label="Investimento" value={fmtBRL(t.invest_final)} onChart={() => onChartClick(["invest"])} />
        <Stat
          label={isTotal ? "Lucro liquido" : "Lucro"}
          value={fmtBRL(t.profit)}
          tone={toneProfit(t.profit, t.revenue)}
          onChart={() => onChartClick(["profit"])}
        />
        <Stat label="ROI" value={fmtPct(t.roi)} tone={toneROI(t.roi)} onChart={() => onChartClick(["roi"])} />
        <Stat label="CPA" value={fmtBRL(t.cpa)} onChart={() => onChartClick(["cpa"])} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Ticket medio" value={fmtBRL(t.ticket)} onChart={() => onChartClick(["ticket"])} />
        <Stat label="OB qtd / %" value={`${fmtInt(t.ob_qty)} / ${fmtPct(t.ob_pct)}`} />
        <Stat label="OB R$" value={fmtBRL(t.ob_revenue)} />
        <Stat label="CPM medio" value={fmtBRL(t.cpm)} />
        <Stat label="Conv. clique" value={fmtPct(t.conv_click)} onChart={() => onChartClick(["clicks", "sales"])} />
        <Stat label="Conv. checkout" value={fmtPct(t.conv_checkout)} onChart={() => onChartClick(["checkouts", "sales"])} />
      </div>

      {isTotal && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Lucro antes desp." value={fmtBRL(t.profit_before_expenses)} />
          <Link
            to={companyPath(companySlug, "expenses")}
            className="block hover:opacity-80 transition-opacity"
            title={
              targetDay || isPartialRange
                ? "Despesas só aparecem na visão Mês inteiro"
                : "Ver detalhes das despesas do mês"
            }
          >
            <Stat
              label={targetDay || isPartialRange ? "Despesas (mês)" : "Despesas (ver)"}
              value={fmtBRL(t.monthly_expenses)}
            />
          </Link>
          <Stat
            label="Lucro liquido"
            value={fmtBRL(t.net_profit)}
            tone={toneProfit(t.net_profit, t.revenue)}
          />
          <Stat
            label="Caixa Empresa"
            value={`${fmtBRL(t.company_cash)} / ${fmtPct(t.company_cash_rate)}`}
          />
          <Stat
            label={t.partner_1_name}
            value={`${fmtBRL(t.partner_1_amount)} / ${fmtPct(t.partner_1_rate)}`}
          />
          <Stat
            label={t.partner_2_name}
            value={`${fmtBRL(t.partner_2_amount)} / ${fmtPct(t.partner_2_rate)}`}
          />
        </div>
      )}

      {(targetDay || isPartialRange) && (
        <p className="text-xs text-muted-foreground -mt-2">
          {targetDay
            ? "Visão de dia único: despesas mensais não são distribuídas por dia."
            : "Período parcial: despesas mensais não são distribuídas no range."}
        </p>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <DailyTable
            companySlug={companySlug}
            productId={productId}
            isTotal={isTotal}
            days={filteredDays}
          />
        </CardContent>
      </Card>
    </div>
  );

}

function DailyTable({
  companySlug,
  productId,
  isTotal,
  days,
}: {
  companySlug: string;
  productId?: string;
  isTotal: boolean;
  days: DashboardData["days"];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (date: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead className="text-right">Vendas</TableHead>
          <TableHead className="text-right">Faturamento</TableHead>
          <TableHead className="text-right">Imposto fat.</TableHead>
          <TableHead className="text-right">Invest. manual</TableHead>
          <TableHead className="text-right">Invest. final</TableHead>
          <TableHead className="text-right">Lucro</TableHead>
          <TableHead className="text-right">ROI</TableHead>
          <TableHead className="text-right">CPA</TableHead>
          <TableHead className="text-right">Ticket</TableHead>
          <TableHead className="text-right">OB%</TableHead>
          <TableHead className="text-right">Cliques</TableHead>
          <TableHead className="text-right">Checkouts</TableHead>
          <TableHead className="text-right">Impressoes</TableHead>
          <TableHead>Observacoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((d) =>
          isTotal ? (
            <ReadOnlyDailyRow
              key={`total:${d.date}`}
              day={d}
              expanded={expanded.has(d.date)}
              onToggle={() => toggle(d.date)}
            />
          ) : (
            <DailyRow
              key={`${productId}:${d.date}`}
              companySlug={companySlug}
              productId={productId!}
              day={d}
            />
          ),
        )}
      </TableBody>
    </Table>
  );
}

function ReadOnlyDailyRow({
  day,
  expanded,
  onToggle,
}: {
  day: DayData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasBreakdown = (day.by_product?.length ?? 0) > 0;
  return (
    <>
      <TableRow>
        <TableCell className="font-medium whitespace-nowrap">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onToggle}
              disabled={!hasBreakdown}
              title={hasBreakdown ? (expanded ? "Recolher" : "Ver produtos do dia") : "Sem dados"}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className={`h-3.5 w-3.5 ${hasBreakdown ? "" : "opacity-30"}`} />
              )}
            </Button>
            <span>{dateLabel(day.date)}</span>
          </div>
        </TableCell>
        <TableCell className="text-right">{day.sales || "-"}</TableCell>
        <TableCell className="text-right">{day.revenue ? fmtBRL(day.revenue) : "-"}</TableCell>
        <TableCell className="text-right">
          {day.revenue_tax ? fmtBRL(day.revenue_tax) : "-"}
        </TableCell>
        <TableCell className="text-right">
          {day.invest_manual != null ? fmtBRL(day.invest_manual) : "-"}
        </TableCell>
        <TableCell className="text-right">
          {day.invest_final ? fmtBRL(day.invest_final) : "-"}
        </TableCell>
        <TableCell className={`text-right ${toneProfit(day.profit, day.revenue)}`}>
          {day.revenue || day.invest_final ? fmtBRL(day.profit) : "-"}
        </TableCell>
        <TableCell className={`text-right ${toneROI(day.roi)}`}>
          {day.invest_final ? fmtPct(day.roi) : "-"}
        </TableCell>
        <TableCell className="text-right">{day.sales ? fmtBRL(day.cpa) : "-"}</TableCell>
        <TableCell className="text-right">{day.sales ? fmtBRL(day.ticket) : "-"}</TableCell>
        <TableCell className="text-right">{day.sales ? fmtPct(day.ob_pct) : "-"}</TableCell>
        <TableCell className="text-right">{day.clicks != null ? fmtInt(day.clicks) : "-"}</TableCell>
        <TableCell className="text-right">
          {day.checkouts != null ? fmtInt(day.checkouts) : "-"}
        </TableCell>
        <TableCell className="text-right">
          {day.impressions != null ? fmtInt(day.impressions) : "-"}
        </TableCell>
        <TableCell>-</TableCell>
      </TableRow>
      {expanded && hasBreakdown && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={15} className="p-0">
            <div className="p-3">
              <p className="text-xs text-muted-foreground mb-2">
                Detalhe por produto — {dateLabel(day.date)}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                    <TableHead className="text-right">Imposto fat.</TableHead>
                    <TableHead className="text-right">Invest. manual</TableHead>
                    <TableHead className="text-right">Invest. final</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                    <TableHead className="text-right">CPA</TableHead>
                    <TableHead className="text-right">Ticket</TableHead>
                    <TableHead className="text-right">OB%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {day.by_product!.map((p) => (
                    <TableRow key={p.product_id}>
                      <TableCell className="font-medium">{p.product_name}</TableCell>
                      <TableCell className="text-right">{p.sales || "-"}</TableCell>
                      <TableCell className="text-right">
                        {p.revenue ? fmtBRL(p.revenue) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.revenue_tax ? fmtBRL(p.revenue_tax) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.invest_manual != null ? fmtBRL(p.invest_manual) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.invest_final ? fmtBRL(p.invest_final) : "-"}
                      </TableCell>
                      <TableCell className={`text-right ${toneProfit(p.profit, p.revenue)}`}>
                        {p.revenue || p.invest_final ? fmtBRL(p.profit) : "-"}
                      </TableCell>
                      <TableCell className={`text-right ${toneROI(p.roi)}`}>
                        {p.invest_final ? fmtPct(p.roi) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.sales ? fmtBRL(p.cpa) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.sales ? fmtBRL(p.ticket) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.sales ? fmtPct(p.ob_pct) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}


function DailyRow({
  companySlug,
  productId,
  day,
}: {
  companySlug: string;
  productId: string;
  day: DayData;
}) {
  const qc = useQueryClient();
  const save = useServerFn(upsertDailyInput);
  const [editing, setEditing] = useState(false);
  const [investEditing, setInvestEditing] = useState(false);
  const mut = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      save({
        data: {
          company_slug: companySlug,
          product_id: productId,
          date: day.date,
          ...patch,
        } as never,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dash", companySlug] });
      setEditing(false);
      setInvestEditing(false);
    },
  });

  const [invest, setInvest] = useState(day.invest_manual?.toString() ?? "");
  const [clicks, setClicks] = useState(day.clicks?.toString() ?? "");
  const [checkouts, setCheckouts] = useState(day.checkouts?.toString() ?? "");
  const [impressions, setImpressions] = useState(day.impressions?.toString() ?? "");
  const [notes, setNotes] = useState(day.notes ?? "");
  const [salesOv, setSalesOv] = useState(day.sales_override?.toString() ?? "");
  const [revenueOv, setRevenueOv] = useState(day.revenue_override?.toString() ?? "");

  const currentDateLabel = useMemo(() => dateLabel(day.date), [day.date]);

  useEffect(() => {
    setInvest(day.invest_manual?.toString() ?? "");
    setClicks(day.clicks?.toString() ?? "");
    setCheckouts(day.checkouts?.toString() ?? "");
    setImpressions(day.impressions?.toString() ?? "");
    setNotes(day.notes ?? "");
    setSalesOv(day.sales_override?.toString() ?? "");
    setRevenueOv(day.revenue_override?.toString() ?? "");
  }, [
    productId,
    day.date,
    day.invest_manual,
    day.clicks,
    day.checkouts,
    day.impressions,
    day.notes,
    day.sales_override,
    day.revenue_override,
  ]);

  const saveInvest = (value: number | null) => {
    const current = day.invest_manual;
    if (current != null && value != null && !sameMoney(current, value)) {
      const confirmed = confirm(
        `Substituir investimento do dia ${currentDateLabel}?\n\nAtual: ${fmtBRL(
          current,
        )}\nNovo: ${fmtBRL(value)}`,
      );

      if (!confirmed) {
        setInvest(current.toString());
        return;
      }
    }

    mut.mutate({ invest_manual: value });
  };

  const saveSalesOv = (value: number | null) => {
    const current = day.sales_override;
    if (current != null && value != null && current !== value) {
      const ok = confirm(
        `Substituir override de vendas do dia ${currentDateLabel}?\n\nAtual: ${current}\nNovo: ${value}`,
      );
      if (!ok) {
        setSalesOv(current.toString());
        return;
      }
    }
    mut.mutate({ sales_override: value });
  };

  const saveRevenueOv = (value: number | null) => {
    const current = day.revenue_override;
    if (current != null && value != null && !sameMoney(current, value)) {
      const ok = confirm(
        `Substituir override de faturamento do dia ${currentDateLabel}?\n\nAtual: ${fmtBRL(
          current,
        )}\nNovo: ${fmtBRL(value)}`,
      );
      if (!ok) {
        setRevenueOv(current.toString());
        return;
      }
    }
    mut.mutate({ revenue_override: value });
  };


  const toggleEditing = () => {
    if (editing) {
      // cancelar/sair — restaurar estados a partir do day
      setInvest(day.invest_manual?.toString() ?? "");
      setClicks(day.clicks?.toString() ?? "");
      setCheckouts(day.checkouts?.toString() ?? "");
      setImpressions(day.impressions?.toString() ?? "");
      setNotes(day.notes ?? "");
      setSalesOv(day.sales_override?.toString() ?? "");
      setRevenueOv(day.revenue_override?.toString() ?? "");
    }
    setEditing((v) => !v);
  };

  const salesDisplay = day.sales_override != null ? day.sales_override : day.sales;
  const revenueDisplay = day.revenue_override != null ? day.revenue_override : day.revenue;

  return (
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">
        <div className="flex items-center gap-1">
          <span>{currentDateLabel}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={toggleEditing}
            title={editing ? "Concluir edição" : "Editar dia"}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right">
        {editing ? (
          <NumCell
            value={salesOv}
            onChange={setSalesOv}
            integer
            onCommit={saveSalesOv}
            placeholder={day.sales_auto ? String(day.sales_auto) : "0"}
          />
        ) : (
          salesDisplay || "-"
        )}
      </TableCell>
      <TableCell className="text-right">
        {editing ? (
          <NumCell
            value={revenueOv}
            onChange={setRevenueOv}
            onCommit={saveRevenueOv}
            placeholder={day.revenue_auto ? day.revenue_auto.toFixed(2) : "0"}
          />
        ) : revenueDisplay ? (
          fmtBRL(revenueDisplay)
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell className="text-right">
        {day.revenue_tax ? fmtBRL(day.revenue_tax) : "-"}
      </TableCell>
      <TableCell className="text-right">
        {editing || investEditing ? (
          <NumCell
            value={invest}
            onChange={setInvest}
            onCommit={(v) => {
              saveInvest(v);
              setInvestEditing(false);
            }}
          />
        ) : (
          <div className="flex items-center justify-end gap-1">
            <span>{day.invest_manual != null ? fmtBRL(day.invest_manual) : "-"}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground/60 hover:text-foreground"
              onClick={() => {
                setInvest(day.invest_manual?.toString() ?? "");
                setInvestEditing(true);
              }}
              title="Editar investimento"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">
        {day.invest_final ? fmtBRL(day.invest_final) : "-"}
      </TableCell>
      <TableCell className={`text-right ${toneProfit(day.profit, day.revenue)}`}>
        {day.revenue || day.invest_final ? fmtBRL(day.profit) : "-"}
      </TableCell>
      <TableCell className={`text-right ${toneROI(day.roi)}`}>
        {day.invest_final ? fmtPct(day.roi) : "-"}
      </TableCell>
      <TableCell className="text-right">{day.sales ? fmtBRL(day.cpa) : "-"}</TableCell>
      <TableCell className="text-right">{day.sales ? fmtBRL(day.ticket) : "-"}</TableCell>
      <TableCell className="text-right">{day.sales ? fmtPct(day.ob_pct) : "-"}</TableCell>
      <TableCell className="text-right">
        {editing ? (
          <NumCell
            value={clicks}
            onChange={setClicks}
            integer
            onCommit={(v) => mut.mutate({ clicks: v })}
          />
        ) : day.clicks != null ? (
          fmtInt(day.clicks)
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell className="text-right">
        {editing ? (
          <NumCell
            value={checkouts}
            onChange={setCheckouts}
            integer
            onCommit={(v) => mut.mutate({ checkouts: v })}
          />
        ) : day.checkouts != null ? (
          fmtInt(day.checkouts)
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell className="text-right">
        {editing ? (
          <NumCell
            value={impressions}
            onChange={setImpressions}
            integer
            onCommit={(v) => mut.mutate({ impressions: v })}
          />
        ) : day.impressions != null ? (
          fmtInt(day.impressions)
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell>
        {editing ? (
          <Textarea
            rows={1}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => mut.mutate({ notes: notes || null })}
            className="min-h-8 h-8 py-1 text-xs"
          />
        ) : (
          <span className="text-xs">{day.notes || "-"}</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function NumCell({
  value,
  onChange,
  onCommit,
  integer = false,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: number | null) => void;
  integer?: boolean;
  placeholder?: string;
}) {
  return (
    <Input
      className="h-8 w-24 text-right text-xs"
      value={value}
      placeholder={placeholder}
      inputMode={integer ? "numeric" : "decimal"}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const s = value.replace(",", ".").trim();
        if (s === "") return onCommit(null);
        const n = integer ? parseInt(s, 10) : Number(s);
        onCommit(isNaN(n) ? null : n);
      }}
    />
  );
}

function Stat({
  label,
  value,
  tone,
  onChart,
}: {
  label: string;
  value: string;
  tone?: string;
  onChart?: () => void;
}) {
  return (
    <Card className="relative">
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${tone ?? ""}`}>{value}</div>
        {onChart && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onChart();
            }}
            className="absolute top-1.5 right-1.5 p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
            title={`Ver gráfico de ${label}`}
          >
            <LineChartIcon className="h-3 w-3" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtPct = (n: number) =>
  (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";

function dateLabel(date: string) {
  const [, mm, dd] = date.split("-");
  return `${dd}/${mm}`;
}

function toneROI(roi: number) {
  if (roi < 0) return "text-red-600 font-semibold";
  if (roi < 0.2) return "text-orange-600";
  if (roi < 0.3) return "text-yellow-600";
  if (roi < 0.5) return "text-green-600";
  return "text-emerald-700 font-semibold";
}

function toneProfit(profit: number, revenue: number) {
  if (revenue <= 0) return "";
  const margin = profit / revenue;
  return toneROI(margin);
}

function sameMoney(a: number, b: number) {
  return Math.round(a * 100) === Math.round(b * 100);
}
