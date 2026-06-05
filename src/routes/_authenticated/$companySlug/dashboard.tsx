import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listProducts, type Product } from "@/lib/celetus/products.functions";
import { getDashboard, upsertDailyInput } from "@/lib/celetus/dashboard.functions";
import { companyPath, isCompanySlug, resolveCompany } from "@/lib/celetus/workspaces";
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

export const Route = createFileRoute("/_authenticated/$companySlug/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isCompanySlug(params.companySlug)) {
      throw redirect({ to: companyPath("tannus-labs", "dashboard"), replace: true });
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

function DashboardPage() {
  const { companySlug } = Route.useParams();
  const company = resolveCompany(companySlug);
  const { data: products } = useSuspenseQuery(productsQO(company.slug));
  const now = new Date();
  const [productId, setProductId] = useState<string>(TOTAL_PRODUCT_ID);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const isTotal = productId === TOTAL_PRODUCT_ID;
  const selectedProductId = isTotal ? undefined : productId;
  const selectedLabel = isTotal
    ? "Total de todos os produtos"
    : products.find((product: Product) => product.id === productId)?.name || "Produto";

  const fetchDash = useServerFn(getDashboard);
  const dashQuery = useQuery({
    queryKey: ["dash", company.slug, productId, year, month],
    queryFn: () =>
      fetchDash({
        data: {
          company_slug: company.slug,
          ...(selectedProductId ? { product_id: selectedProductId } : {}),
          year,
          month,
        },
      }),
    enabled: isTotal || !!selectedProductId,
  });

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
            {selectedLabel} - {MONTHS[month - 1]} {year}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Produto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOTAL_PRODUCT_ID}>Total</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
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
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
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
        </div>
      </header>

      {dashQuery.isLoading || !dashQuery.data ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando...</CardContent>
        </Card>
      ) : (
        <DashContent
          companySlug={company.slug}
          productId={selectedProductId}
          isTotal={isTotal}
          data={dashQuery.data}
        />
      )}
    </div>
  );
}

function DashContent({
  companySlug,
  productId,
  isTotal,
  data,
}: {
  companySlug: string;
  productId?: string;
  isTotal: boolean;
  data: DashboardData;
}) {
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat label="Vendas" value={fmtInt(t.sales)} />
        <Stat label="Faturamento" value={fmtBRL(t.revenue)} />
        <Stat label="Imposto fat." value={fmtBRL(t.revenue_tax)} />
        <Stat label="Investimento" value={fmtBRL(t.invest_final)} />
        <Stat
          label={isTotal ? "Lucro liquido" : "Lucro"}
          value={fmtBRL(t.profit)}
          tone={toneProfit(t.profit, t.revenue)}
        />
        <Stat label="ROI" value={fmtPct(t.roi)} tone={toneROI(t.roi)} />
        <Stat label="CPA" value={fmtBRL(t.cpa)} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Ticket medio" value={fmtBRL(t.ticket)} />
        <Stat label="OB qtd / %" value={`${fmtInt(t.ob_qty)} / ${fmtPct(t.ob_pct)}`} />
        <Stat label="OB R$" value={fmtBRL(t.ob_revenue)} />
        <Stat label="CPM medio" value={fmtBRL(t.cpm)} />
        <Stat label="Conv. clique" value={fmtPct(t.conv_click)} />
        <Stat label="Conv. checkout" value={fmtPct(t.conv_checkout)} />
      </div>

      {isTotal && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Lucro antes desp." value={fmtBRL(t.profit_before_expenses)} />
          <Stat label="Despesas" value={fmtBRL(t.monthly_expenses)} />
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

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <DailyTable
            companySlug={companySlug}
            productId={productId}
            isTotal={isTotal}
            days={data.days}
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
            <ReadOnlyDailyRow key={`total:${d.date}`} day={d} />
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

function ReadOnlyDailyRow({ day }: { day: DayData }) {
  return (
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">{dateLabel(day.date)}</TableCell>
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dash", companySlug] }),
  });

  const [invest, setInvest] = useState(day.invest_manual?.toString() ?? "");
  const [clicks, setClicks] = useState(day.clicks?.toString() ?? "");
  const [checkouts, setCheckouts] = useState(day.checkouts?.toString() ?? "");
  const [impressions, setImpressions] = useState(day.impressions?.toString() ?? "");
  const [notes, setNotes] = useState(day.notes ?? "");

  const currentDateLabel = useMemo(() => dateLabel(day.date), [day.date]);

  useEffect(() => {
    setInvest(day.invest_manual?.toString() ?? "");
    setClicks(day.clicks?.toString() ?? "");
    setCheckouts(day.checkouts?.toString() ?? "");
    setImpressions(day.impressions?.toString() ?? "");
    setNotes(day.notes ?? "");
  }, [
    productId,
    day.date,
    day.invest_manual,
    day.clicks,
    day.checkouts,
    day.impressions,
    day.notes,
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

  return (
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">{currentDateLabel}</TableCell>
      <TableCell className="text-right">{day.sales || "-"}</TableCell>
      <TableCell className="text-right">{day.revenue ? fmtBRL(day.revenue) : "-"}</TableCell>
      <TableCell className="text-right">
        {day.revenue_tax ? fmtBRL(day.revenue_tax) : "-"}
      </TableCell>
      <TableCell className="text-right">
        <NumCell value={invest} onChange={setInvest} onCommit={saveInvest} />
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
        <NumCell
          value={clicks}
          onChange={setClicks}
          integer
          onCommit={(v) => mut.mutate({ clicks: v })}
        />
      </TableCell>
      <TableCell className="text-right">
        <NumCell
          value={checkouts}
          onChange={setCheckouts}
          integer
          onCommit={(v) => mut.mutate({ checkouts: v })}
        />
      </TableCell>
      <TableCell className="text-right">
        <NumCell
          value={impressions}
          onChange={setImpressions}
          integer
          onCommit={(v) => mut.mutate({ impressions: v })}
        />
      </TableCell>
      <TableCell>
        <Textarea
          rows={1}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => mut.mutate({ notes: notes || null })}
          className="min-h-8 h-8 py-1 text-xs"
        />
      </TableCell>
    </TableRow>
  );
}

function NumCell({
  value,
  onChange,
  onCommit,
  integer = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: number | null) => void;
  integer?: boolean;
}) {
  return (
    <Input
      className="h-8 w-24 text-right text-xs"
      value={value}
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${tone ?? ""}`}>{value}</div>
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
