import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Package, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { getDashboard, upsertDailyInput, type DayRow } from "@/lib/celetus/dashboard.functions";
import { listProducts, setProductActive } from "@/lib/celetus/products.functions";
import { computeProjection, roiOf } from "@/lib/celetus/projection";
import { isValidSlug } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/_authenticated/$companySlug/produto/$productId")({
  head: () => ({ meta: [{ title: "Produto — Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  component: ProductPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtPct = (v: number) =>
  (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";

type YM = { year: number; month: number };
function todayYM(): YM {
  const s = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [y, m] = s.split("-").map(Number);
  return { year: y, month: m };
}
function shiftMonth({ year, month }: YM, delta: number): YM {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
function parseMoney(v: string): number | null {
  const s = v.replace(/\./g, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function ProductPage() {
  const { companySlug, productId } = Route.useParams();
  const cur = useMemo(todayYM, []);
  const [target, setTarget] = useState<"this" | "last" | "prev2">("this");
  const ym =
    target === "this" ? cur : target === "last" ? shiftMonth(cur, -1) : shiftMonth(cur, -2);

  const fetchDash = useServerFn(getDashboard);
  const q = useQuery({
    queryKey: ["dash", companySlug, productId, ym.year, ym.month],
    queryFn: () =>
      fetchDash({
        data: {
          company_slug: companySlug,
          product_id: productId,
          year: ym.year,
          month: ym.month,
        },
      }),
  });

  const productsQ = useQuery({
    queryKey: ["products", companySlug],
    queryFn: () => listProducts({ data: { company_slug: companySlug } }),
  });
  const product = productsQ.data?.find((p) => p.id === productId);

  const qc = useQueryClient();
  const toggleFn = useServerFn(setProductActive);
  const toggleMut = useMutation({
    mutationFn: (v: boolean) =>
      toggleFn({ data: { company_slug: companySlug, id: productId, is_active: v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", companySlug] });
      toast.success("Produto atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projection = useMemo(() => {
    if (!q.data) return null;
    return computeProjection(q.data.days, { monthYear: ym.year, monthMonth: ym.month });
  }, [q.data, ym.year, ym.month]);

  const productName = product?.display_name || product?.name || "Produto";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div>
        <Link
          to={`/${companySlug}/products`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Voltar para Produtos
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            {productName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {MONTHS[ym.month - 1]} {ym.year}
            {product && (
              <>
                {" · "}
                <span className="font-mono text-xs">{product.src}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {product && (
            <label className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border bg-card">
              <Power className="h-3.5 w-3.5" />
              <span>Ativo</span>
              <Switch
                checked={product.is_active}
                onCheckedChange={(v) => toggleMut.mutate(v)}
              />
            </label>
          )}
          <Select value={target} onValueChange={(v) => setTarget(v as typeof target)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this">Este mês</SelectItem>
              <SelectItem value="last">Mês passado</SelectItem>
              <SelectItem value="prev2">2 meses atrás</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {q.isLoading || !projection || !q.data ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando...</CardContent>
        </Card>
      ) : (
        <>
          <KpiRow projection={projection} />
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <DailyChart projection={projection} days={q.data.days} />
            <ProjectionCard projection={projection} />
          </div>
          <DailyTable
            companySlug={companySlug}
            productId={productId}
            days={q.data.days}
          />
        </>
      )}
    </div>
  );
}

/* ============ KPIs ============ */

function KpiRow({ projection }: { projection: ReturnType<typeof computeProjection> }) {
  const r = projection.realized;
  const roi = r.invest > 0 ? roiOf(r) : null;
  return (
    <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <Kpi label="Faturamento" value={fmtBRL(r.revenue)} tone="info" />
      <Kpi label="Investimento" value={fmtBRL(r.invest)} tone="warn" />
      <Kpi
        label="Lucro"
        value={fmtBRL(r.profit)}
        tone={r.profit >= 0 ? "success" : "alert"}
      />
      <Kpi
        label="ROI"
        value={roi !== null ? fmtPct(roi) : "—"}
        tone={roi !== null && roi >= 0 ? "success" : "info"}
      />
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "alert" | "warn" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-500"
      : tone === "alert"
        ? "text-rose-500"
        : tone === "warn"
          ? "text-amber-500"
          : "text-sky-400";
  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground">
          {label}
        </div>
        <div
          className={`mt-2 text-2xl md:text-3xl font-extrabold tabular-nums leading-none tracking-tight ${toneClass}`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============ Projeção fim do mês ============ */

function ProjectionCard({ projection }: { projection: ReturnType<typeof computeProjection> }) {
  const p = projection;
  const roiR = p.realized.invest > 0 ? roiOf(p.realized) : null;
  const roiP = p.projectedPace.invest > 0 ? roiOf(p.projectedPace) : null;

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Projeção fim do mês</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {p.monthClosed
              ? "Mês fechado."
              : `Dia ${p.daysElapsed} de ${p.daysInMonth} · faltam ${p.daysRemaining} dias.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Fat proj" value={fmtBRL(p.projectedPace.revenue)} />
          <MiniStat label="Inv proj" value={fmtBRL(p.projectedPace.invest)} />
          <MiniStat
            label="Lucro proj"
            value={fmtBRL(p.projectedPace.profit)}
            valueClass={p.projectedPace.profit >= 0 ? "text-emerald-500" : "text-rose-500"}
          />
          <MiniStat
            label="ROI proj"
            value={roiP !== null ? fmtPct(roiP) : "—"}
            valueClass={roiP !== null && roiP >= 0 ? "text-emerald-500" : "text-rose-500"}
          />
        </div>
        <div className="pt-3 border-t space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lucro realizado</span>
            <span className={`tabular-nums font-semibold ${p.realized.profit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {fmtBRL(p.realized.profit)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">ROI realizado</span>
            <span className="tabular-nums font-semibold">
              {roiR !== null ? fmtPct(roiR) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lucro/dia</span>
            <span className="tabular-nums font-semibold">
              {p.daysElapsed > 0 ? fmtBRL(p.realized.profit / p.daysElapsed) : "—"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-muted/40 border">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-base font-bold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

/* ============ Curva diária ============ */

function DailyChart({
  projection,
  days,
}: {
  projection: ReturnType<typeof computeProjection>;
  days: DayRow[];
}) {
  const p = projection;
  const chart = useMemo(() => {
    const monthDays = days
      .filter((d) => {
        const [dy, dm] = d.date.split("-").map(Number);
        return dy === p.year && dm === p.month;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    const byDom = new Map<number, number>();
    for (const d of monthDays) {
      const dom = Number(d.date.split("-")[2]);
      byDom.set(dom, (byDom.get(dom) ?? 0) + Number(d.profit || 0));
    }
    let cum = 0;
    const realized: { dom: number; cum: number }[] = [];
    for (let i = 1; i <= p.daysElapsed; i++) {
      cum += byDom.get(i) ?? 0;
      realized.push({ dom: i, cum });
    }
    const lastCum = realized.length ? realized[realized.length - 1].cum : 0;
    const projectedEnd = p.projectedPace.profit;
    const projected: { dom: number; cum: number }[] = [];
    if (!p.monthClosed && p.daysRemaining > 0) {
      const startDom = p.daysElapsed;
      const step = (projectedEnd - lastCum) / p.daysRemaining;
      projected.push({ dom: startDom, cum: lastCum });
      for (let i = 1; i <= p.daysRemaining; i++) {
        projected.push({ dom: startDom + i, cum: lastCum + step * i });
      }
    }
    const allVals = [0, ...realized.map((r) => r.cum), ...projected.map((r) => r.cum)];
    const maxV = Math.max(...allVals, 1);
    const minV = Math.min(...allVals, 0);
    return { realized, projected, maxV, minV };
  }, [days, p.year, p.month, p.daysElapsed, p.daysRemaining, p.projectedPace.profit, p.monthClosed]);

  const W = 820;
  const H = 260;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xFor = (dom: number) => padL + ((dom - 1) / (p.daysInMonth - 1 || 1)) * innerW;
  const range = chart.maxV - chart.minV || 1;
  const yFor = (v: number) => padT + innerH - ((v - chart.minV) / range) * innerH;

  const realizedPath = chart.realized.length
    ? "M " + chart.realized.map((r) => `${xFor(r.dom).toFixed(1)},${yFor(r.cum).toFixed(1)}`).join(" L ")
    : "";
  const areaPath = chart.realized.length
    ? `M ${xFor(1).toFixed(1)},${yFor(0).toFixed(1)} L ` +
      chart.realized.map((r) => `${xFor(r.dom).toFixed(1)},${yFor(r.cum).toFixed(1)}`).join(" L ") +
      ` L ${xFor(chart.realized[chart.realized.length - 1].dom).toFixed(1)},${yFor(0).toFixed(1)} Z`
    : "";
  const projectedPath = chart.projected.length
    ? "M " + chart.projected.map((r) => `${xFor(r.dom).toFixed(1)},${yFor(r.cum).toFixed(1)}`).join(" L ")
    : "";
  const ticks = 4;
  const tickVals: number[] = [];
  for (let i = 0; i <= ticks; i++) tickVals.push(chart.minV + (range * i) / ticks);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3">
          <h3 className="text-lg font-semibold tracking-tight">Curva diária de lucro</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Lucro acumulado do produto · linha pontilhada é a projeção até o fim do mês.
          </p>
        </div>
        <div className="rounded-2xl border bg-muted/20 p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
            <defs>
              <linearGradient id="fillProfitProd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" className="text-sky-400" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" className="text-sky-400" />
              </linearGradient>
            </defs>
            {tickVals.map((v, i) => (
              <g key={i}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={yFor(v)}
                  y2={yFor(v)}
                  stroke="currentColor"
                  className="text-muted-foreground/25"
                  strokeDasharray="4 6"
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={yFor(v) + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] font-semibold"
                >
                  {fmtBRL(v)}
                </text>
              </g>
            ))}
            {chart.minV < 0 && chart.maxV > 0 && (
              <line
                x1={padL}
                x2={W - padR}
                y1={yFor(0)}
                y2={yFor(0)}
                stroke="currentColor"
                className="text-muted-foreground/60"
                strokeWidth={1.2}
              />
            )}
            {Array.from({ length: p.daysInMonth }, (_, i) => i + 1)
              .filter((d) => d === 1 || d === p.daysInMonth || d % 5 === 0)
              .map((d) => (
                <text
                  key={d}
                  x={xFor(d)}
                  y={H - 10}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-semibold"
                >
                  {String(d).padStart(2, "0")}
                </text>
              ))}
            {areaPath && <path d={areaPath} fill="url(#fillProfitProd)" />}
            {realizedPath && (
              <path
                d={realizedPath}
                fill="none"
                stroke="currentColor"
                className="text-sky-400"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {projectedPath && (
              <path
                d={projectedPath}
                fill="none"
                stroke="currentColor"
                className="text-emerald-500"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 6"
              />
            )}
            {chart.realized.length > 0 && (
              <circle
                cx={xFor(chart.realized[chart.realized.length - 1].dom)}
                cy={yFor(chart.realized[chart.realized.length - 1].cum)}
                r={6}
                className="fill-emerald-500 stroke-background"
                strokeWidth={2}
              />
            )}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============ Tabela diária editável ============ */

function DailyTable({
  companySlug,
  productId,
  days,
}: {
  companySlug: string;
  productId: string;
  days: DayRow[];
}) {
  const today = todayISO();
  const sorted = useMemo(
    () => [...days].sort((a, b) => b.date.localeCompare(a.date)),
    [days],
  );

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Movimento diário</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Edite o <b>investimento do dia</b> mesmo quando não houve venda. O lucro e o ROI
            recalculam sozinhos.
          </p>
        </div>
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dia</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right w-44">Investimento</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead className="text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((d) => (
                <DailyEditRow
                  key={d.date}
                  day={d}
                  companySlug={companySlug}
                  productId={productId}
                  isToday={d.date === today}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyEditRow({
  day,
  companySlug,
  productId,
  isToday,
}: {
  day: DayRow;
  companySlug: string;
  productId: string;
  isToday: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(upsertDailyInput);
  const initial = day.invest_manual != null ? day.invest_manual.toString().replace(".", ",") : "";
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(day.invest_manual != null ? day.invest_manual.toString().replace(".", ",") : "");
  }, [day.invest_manual]);

  const mut = useMutation({
    mutationFn: (value: number | null) =>
      save({
        data: {
          company_slug: companySlug,
          product_id: productId,
          date: day.date,
          invest_manual: value,
        },
      }),
    onMutate: () => setSaving(true),
    onSettled: () => setSaving(false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dash", companySlug, productId] });
      qc.invalidateQueries({ queryKey: ["dash", companySlug, "__total__"] });
      toast.success(`Investimento salvo — ${day.date.split("-").reverse().join("/")}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commit = () => {
    const parsed = parseMoney(text);
    if ((parsed ?? null) === (day.invest_manual ?? null)) return;
    mut.mutate(parsed);
  };

  const dateLabel = day.date.split("-").reverse().join("/");
  const dow = new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <TableRow className={isToday ? "bg-primary/5" : ""}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <span>{dateLabel}</span>
          <span className="text-[10px] uppercase text-muted-foreground">{dow}</span>
          {isToday && (
            <span className="text-[10px] font-bold text-primary uppercase">Hoje</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{day.sales || "—"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {day.revenue ? fmtBRL(day.revenue) : "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="text-xs text-muted-foreground">R$</span>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setText(
                  day.invest_manual != null
                    ? day.invest_manual.toString().replace(".", ",")
                    : "",
                );
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="0,00"
            inputMode="decimal"
            disabled={saving}
            className="w-28 h-8 text-right tabular-nums"
          />
        </div>
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${
          day.revenue || day.invest_final
            ? day.profit >= 0
              ? "text-emerald-500"
              : "text-rose-500"
            : ""
        }`}
      >
        {day.revenue || day.invest_final ? fmtBRL(day.profit) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {day.invest_final ? fmtPct(day.roi) : "—"}
      </TableCell>
    </TableRow>
  );
}
