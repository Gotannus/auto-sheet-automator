import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Plus, Target, Trash2, TrendingUp, TrendingDown } from "lucide-react";


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
import { getCompanyBySlug } from "@/lib/celetus/companies.functions";
import { getDashboard, type DayRow } from "@/lib/celetus/dashboard.functions";
import { listPartners, savePartners, type Partner } from "@/lib/celetus/partners.functions";
import { listProducts } from "@/lib/celetus/products.functions";

import { computeProjection, roiOf, type Projection, type ProjectionMoney } from "@/lib/celetus/projection";
import { isValidSlug } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/_authenticated/$companySlug/projecao")({
  head: () => ({ meta: [{ title: "Projeção — Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  component: ProjecaoPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtPct = (v: number) =>
  (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

type MonthKey = { year: number; month: number };
type Draft = { id?: string; name: string; share_pct: number; sort_order: number };

function todayYM(): MonthKey {
  const s = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [y, m] = s.split("-").map(Number);
  return { year: y, month: m };
}
function shiftMonth({ year, month }: MonthKey, delta: number): MonthKey {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
function parseMoneyInput(value: string, fallback = 0) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return fallback;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}
function moneyInputValue(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function ProjecaoPage() {
  const { companySlug } = Route.useParams();
  const { data: company } = useQuery({
    queryKey: ["company-current", companySlug],
    queryFn: () => getCompanyBySlug({ data: { slug: companySlug } }),
  });

  const cur = useMemo(todayYM, []);
  const [target, setTarget] = useState<"this" | "last">("this");
  const ym = target === "this" ? cur : shiftMonth(cur, -1);

  const fetchDash = useServerFn(getDashboard);
  const q = useQuery({
    queryKey: ["dash", companySlug, "__total__", ym.year, ym.month],
    queryFn: () =>
      fetchDash({ data: { company_slug: companySlug, year: ym.year, month: ym.month } }),
  });

  const projection = useMemo(() => {
    if (!q.data) return null;
    return computeProjection(q.data.days, { monthYear: ym.year, monthMonth: ym.month });
  }, [q.data, ym.year, ym.month]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Projeção do mês
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {company?.name ?? companySlug} · {MONTHS[ym.month - 1]} {ym.year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip label="Empresa" value={company?.name ?? companySlug} />
          <Chip label="Mês" value={`${MONTHS[ym.month - 1]} ${ym.year}`} />
          <Select value={target} onValueChange={(v) => setTarget(v as "this" | "last")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this">Este mês</SelectItem>
              <SelectItem value="last">Mês passado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {q.isLoading || !projection ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando...</CardContent>
        </Card>
      ) : (
        <ProjectionBoard
          projection={projection}
          days={q.data!.days}
          ym={ym}
          companySlug={companySlug}
        />
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border text-xs font-semibold">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground truncate max-w-[160px]">{value}</span>
    </div>
  );
}

function ProjectionBoard({
  projection,
  days,
  ym,
  companySlug,
}: {
  projection: Projection;
  days: DayRow[];
  ym: MonthKey;
  companySlug: string;
}) {
  const [goalText, setGoalText] = useState(() =>
    moneyInputValue(Math.max(projection.projectedPace.profit, projection.realized.profit, 1000)),
  );
  const goal = parseMoneyInput(goalText, 0);

  return (
    <div className="space-y-4">
      <KpiRow p={projection} goal={goal} />
      <div className="grid gap-4 lg:grid-cols-[1.32fr_.98fr]">
        <DailyChart p={projection} days={days} />
        <ExecutiveReading p={projection} goal={goal} days={days} ym={ym} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CompareBars p={projection} goal={goal} />
        <ByProductProjection days={days} ym={ym} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <GoalCard p={projection} goalText={goalText} setGoalText={setGoalText} />
        <PartnersSection companySlug={companySlug} projection={projection} />
      </div>
    </div>
  );
}

/* ============ KPI ROW ============ */

function KpiRow({ p, goal }: { p: Projection; goal: number }) {
  const roiRealized = p.realized.invest > 0 ? roiOf(p.realized) : null;
  const roiProj = p.projectedPace.invest > 0 ? roiOf(p.projectedPace) : null;
  const goalDelta = goal > 0 ? (p.projectedPace.profit - goal) / goal : null;

  return (
    <section className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      <KpiCard
        label="Lucro do mês"
        value={fmtBRL(p.realized.profit)}
        tone={p.realized.profit >= 0 ? "success" : "alert"}
        sub={`Dia ${p.daysElapsed} de ${p.daysInMonth}`}
        trend={roiRealized !== null ? { label: `ROI ${fmtPct(roiRealized)}`, tone: "good" } : undefined}
      />
      <KpiCard
        label="Fecha provável"
        value={fmtBRL(p.projectedPace.profit)}
        tone={p.projectedPace.profit >= 0 ? "success" : "alert"}
        sub={p.monthClosed ? "Mês fechado" : `+${p.daysRemaining} dias restantes`}
        trend={
          goalDelta !== null
            ? {
                label: `${goalDelta >= 0 ? "+" : ""}${(goalDelta * 100).toFixed(1)}% vs meta`,
                tone: goalDelta >= 0 ? "good" : "bad",
              }
            : undefined
        }
      />
      <KpiCard
        label="ROI projetado"
        value={roiProj !== null ? fmtPct(roiProj) : "—"}
        tone="info"
        sub={roiRealized !== null ? `Atual: ${fmtPct(roiRealized)}` : "Sem investimento"}
      />
      <KpiCard
        label="Faturamento mês"
        value={fmtBRL(p.realized.revenue)}
        tone="info"
        sub={`Proj: ${fmtBRL(p.projectedPace.revenue)}`}
      />
      <KpiCard
        label="Investimento"
        value={fmtBRL(p.realized.invest)}
        tone="warn"
        sub={`Proj: ${fmtBRL(p.projectedPace.invest)}`}
      />
    </section>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "success" | "alert" | "warn" | "info";
  trend?: { label: string; tone: "good" | "bad" | "mid" | "blue" };
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-500"
      : tone === "alert"
        ? "text-rose-500"
        : tone === "warn"
          ? "text-amber-500"
          : "text-sky-400";
  const trendClass =
    trend?.tone === "good"
      ? "bg-emerald-500/10 text-emerald-500"
      : trend?.tone === "bad"
        ? "bg-rose-500/10 text-rose-500"
        : trend?.tone === "mid"
          ? "bg-amber-500/10 text-amber-500"
          : "bg-sky-500/10 text-sky-400";
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 md:p-5">
        <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground">
          {label}
        </div>
        <div className={`mt-2 text-2xl md:text-3xl font-extrabold tabular-nums leading-none tracking-tight ${toneClass}`}>
          {value}
        </div>
        {sub && <div className="mt-2 text-xs text-muted-foreground">{sub}</div>}
        {trend && (
          <div className={`mt-2 inline-flex px-2 py-1 rounded-full text-[11px] font-bold ${trendClass}`}>
            {trend.label}
          </div>
        )}
        <div className="pointer-events-none absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-foreground/[0.03]" />
      </CardContent>
    </Card>
  );
}

/* ============ DAILY CHART ============ */

function DailyChart({ p, days }: { p: Projection; days: DayRow[] }) {
  const chart = useMemo(() => {
    const monthDays = days
      .filter((d) => {
        const [dy, dm] = d.date.split("-").map(Number);
        return dy === p.year && dm === p.month;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // cumulative profit per day-of-month
    const byDom = new Map<number, number>();
    for (const d of monthDays) {
      const dom = Number(d.date.split("-")[2]);
      byDom.set(dom, (byDom.get(dom) ?? 0) + Number(d.profit || 0));
    }
    let cum = 0;
    const realizedPoints: { dom: number; cum: number }[] = [];
    for (let i = 1; i <= p.daysElapsed; i++) {
      cum += byDom.get(i) ?? 0;
      realizedPoints.push({ dom: i, cum });
    }

    // projected line from last realized to end of month
    const lastCum = realizedPoints.length ? realizedPoints[realizedPoints.length - 1].cum : 0;
    const projectedEnd = p.projectedPace.profit;
    const projectedPoints: { dom: number; cum: number }[] = [];
    if (!p.monthClosed && p.daysRemaining > 0) {
      const startDom = p.daysElapsed;
      const step = (projectedEnd - lastCum) / p.daysRemaining;
      projectedPoints.push({ dom: startDom, cum: lastCum });
      for (let i = 1; i <= p.daysRemaining; i++) {
        projectedPoints.push({ dom: startDom + i, cum: lastCum + step * i });
      }
    }

    const allVals = [
      0,
      ...realizedPoints.map((r) => r.cum),
      ...projectedPoints.map((r) => r.cum),
    ];
    const maxV = Math.max(...allVals, 1);
    const minV = Math.min(...allVals, 0);
    return { realizedPoints, projectedPoints, maxV, minV, monthClosed: p.monthClosed };
  }, [days, p.year, p.month, p.daysElapsed, p.daysRemaining, p.projectedPace.profit, p.monthClosed]);

  const W = 840;
  const H = 300;
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xFor = (dom: number) => padL + ((dom - 1) / (p.daysInMonth - 1 || 1)) * innerW;
  const range = chart.maxV - chart.minV || 1;
  const yFor = (v: number) => padT + innerH - ((v - chart.minV) / range) * innerH;

  const realizedPath = chart.realizedPoints.length
    ? "M " + chart.realizedPoints.map((r) => `${xFor(r.dom).toFixed(1)},${yFor(r.cum).toFixed(1)}`).join(" L ")
    : "";
  const areaPath = chart.realizedPoints.length
    ? `M ${xFor(1).toFixed(1)},${yFor(0).toFixed(1)} L ` +
      chart.realizedPoints.map((r) => `${xFor(r.dom).toFixed(1)},${yFor(r.cum).toFixed(1)}`).join(" L ") +
      ` L ${xFor(chart.realizedPoints[chart.realizedPoints.length - 1].dom).toFixed(1)},${yFor(0).toFixed(1)} Z`
    : "";
  const projectedPath = chart.projectedPoints.length
    ? "M " + chart.projectedPoints.map((r) => `${xFor(r.dom).toFixed(1)},${yFor(r.cum).toFixed(1)}`).join(" L ")
    : "";

  // Y axis ticks
  const ticks = 4;
  const tickVals: number[] = [];
  for (let i = 0; i <= ticks; i++) tickVals.push(chart.minV + (range * i) / ticks);

  const positive = p.projectedPace.profit >= 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Curva diária de lucro</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Lucro acumulado dia a dia · linha pontilhada é a projeção até o fim do mês.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/40 text-[11px] font-bold whitespace-nowrap">
            <span className={`h-2 w-2 rounded-full ${positive ? "bg-emerald-500" : "bg-rose-500"} animate-pulse`} />
            {p.monthClosed ? "Mês fechado" : "Projeção ao vivo"}
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/20 p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Lucro acumulado por dia">
            <defs>
              <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
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
            {/* zero baseline */}
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
            {/* x axis labels every ~5 days */}
            {Array.from({ length: p.daysInMonth }, (_, i) => i + 1)
              .filter((d) => d === 1 || d === p.daysInMonth || d % 5 === 0)
              .map((d) => (
                <text
                  key={d}
                  x={xFor(d)}
                  y={H - 12}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-semibold"
                >
                  {String(d).padStart(2, "0")}
                </text>
              ))}
            {areaPath && (
              <path d={areaPath} fill="url(#fillProfit)" />
            )}
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
            {/* today dot */}
            {chart.realizedPoints.length > 0 && (
              <circle
                cx={xFor(chart.realizedPoints[chart.realizedPoints.length - 1].dom)}
                cy={yFor(chart.realizedPoints[chart.realizedPoints.length - 1].cum)}
                r={6}
                className="fill-emerald-500 stroke-background"
                strokeWidth={2}
              />
            )}
            {/* projected end dot */}
            {chart.projectedPoints.length > 0 && (
              <circle
                cx={xFor(chart.projectedPoints[chart.projectedPoints.length - 1].dom)}
                cy={yFor(chart.projectedPoints[chart.projectedPoints.length - 1].cum)}
                r={5}
                className="fill-background stroke-emerald-500"
                strokeWidth={2}
              />
            )}
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-2">
            <i className="inline-block h-1 w-4 rounded-full bg-sky-400" /> Lucro realizado
          </span>
          <span className="flex items-center gap-2">
            <i className="inline-block h-1 w-4 rounded-full bg-emerald-500" /> Projeção
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============ EXECUTIVE READING ============ */

function ExecutiveReading({
  p,
  goal,
  days,
  ym,
}: {
  p: Projection;
  goal: number;
  days: DayRow[];
  ym: MonthKey;
}) {
  const perDay = p.daysElapsed > 0 ? p.realized.profit / p.daysElapsed : 0;
  const willHitGoal = goal > 0 ? p.projectedPace.profit >= goal : null;

  const topProduct = useMemo(() => {
    const map = new Map<string, { name: string; profit: number }>();
    for (const d of days) {
      for (const bp of d.by_product ?? []) {
        const cur = map.get(bp.product_id) ?? { name: bp.product_name, profit: 0 };
        cur.profit += Number(bp.profit || 0);
        map.set(bp.product_id, cur);
      }
    }
    const arr = Array.from(map.values()).sort((a, b) => b.profit - a.profit);
    return arr[0] ?? null;
  }, [days]);

  const roi = p.realized.invest > 0 ? roiOf(p.realized) : null;

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Leitura executiva</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Resumo automático do desempenho do mês.
          </p>
        </div>

        <ReadCard tone="blue" num="01" title="Ritmo atual" text={
          <>
            Você está fazendo <strong>{fmtBRL(perDay)}</strong> de lucro por dia.
            {p.daysRemaining > 0 && <> Faltam <strong>{p.daysRemaining} dias</strong> no mês.</>}
          </>
        } />

        {goal > 0 && (
          <ReadCard
            tone={willHitGoal ? "green" : "red"}
            num="02"
            title={willHitGoal ? "Meta no ritmo" : "Meta em risco"}
            text={
              <>
                Projeção fecha em <strong>{fmtBRL(p.projectedPace.profit)}</strong> {" vs meta de "}
                <strong>{fmtBRL(goal)}</strong>.
              </>
            }
          />
        )}

        {topProduct && (
          <ReadCard tone="yellow" num="03" title="Produto líder" text={
            <>
              <strong>{topProduct.name}</strong> puxa o mês com <strong>{fmtBRL(topProduct.profit)}</strong> de lucro.
            </>
          } />
        )}

        <div className="p-4 rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10">
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground mb-2">
            Conclusão
          </div>
          <p className="text-sm md:text-base leading-relaxed">
            {p.monthClosed ? (
              <>Mês fechado com <b>{fmtBRL(p.realized.profit)}</b> de lucro{roi !== null ? <> e ROI de <b>{fmtPct(roi)}</b></> : null}.</>
            ) : p.projectedPace.profit >= 0 ? (
              <>Mantendo o ritmo de <b>{MONTHS[ym.month - 1]}</b>, o mês fecha em torno de <b className="text-emerald-500">{fmtBRL(p.projectedPace.profit)}</b>.</>
            ) : (
              <>No ritmo atual, o mês fecha em <b className="text-rose-500">{fmtBRL(p.projectedPace.profit)}</b>. Ajuste investimento ou performance.</>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReadCard({
  tone,
  num,
  title,
  text,
}: {
  tone: "blue" | "red" | "yellow" | "green";
  num: string;
  title: string;
  text: React.ReactNode;
}) {
  const iconClass = {
    blue: "bg-sky-500/15 text-sky-400",
    red: "bg-rose-500/15 text-rose-500",
    yellow: "bg-amber-500/15 text-amber-500",
    green: "bg-emerald-500/15 text-emerald-500",
  }[tone];
  return (
    <div className="p-3.5 rounded-xl border bg-muted/30">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className={`h-7 w-7 rounded-lg grid place-items-center text-[11px] font-extrabold ${iconClass}`}>
          {num}
        </span>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <p className="text-sm text-muted-foreground leading-snug">{text}</p>
    </div>
  );
}

/* ============ COMPARE BARS ============ */

function CompareBars({ p, goal }: { p: Projection; goal: number }) {
  const roiR = p.realized.invest > 0 ? roiOf(p.realized) : 0;
  const roiP = p.projectedPace.invest > 0 ? roiOf(p.projectedPace) : 0;
  const roiGoalPct = p.projectedPace.invest > 0 && goal > 0 ? goal / p.projectedPace.invest : 0;

  const rows: {
    label: string;
    realized: number;
    projected: number;
    goal: number | null;
    fmt: (v: number) => string;
  }[] = [
    { label: "Faturamento", realized: p.realized.revenue, projected: p.projectedPace.revenue, goal: null, fmt: fmtBRL },
    { label: "Investimento", realized: p.realized.invest, projected: p.projectedPace.invest, goal: null, fmt: fmtBRL },
    { label: "Lucro", realized: p.realized.profit, projected: p.projectedPace.profit, goal: goal > 0 ? goal : null, fmt: fmtBRL },
    { label: "ROI", realized: roiR, projected: roiP, goal: roiGoalPct > 0 ? roiGoalPct : null, fmt: fmtPct },
  ];

  return (
    <Card>
      <CardContent className="p-5 space-y-2">
        <div className="mb-3">
          <h3 className="text-lg font-semibold tracking-tight">Realizado × Projetado × Meta</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Comparação por métrica. Barras proporcionais ao maior valor da linha.
          </p>
        </div>
        {rows.map((r) => {
          const values = [r.realized, r.projected, r.goal ?? 0].map(Math.abs);
          const max = Math.max(...values, 0.0001);
          const wR = (Math.abs(r.realized) / max) * 100;
          const wP = (Math.abs(r.projected) / max) * 100;
          const wG = r.goal !== null ? (Math.abs(r.goal) / max) * 100 : 0;
          const delta =
            r.goal !== null && r.goal !== 0
              ? ((r.projected - r.goal) / Math.abs(r.goal)) * 100
              : null;
          return (
            <div key={r.label} className="grid grid-cols-[100px_1fr] gap-3 items-center py-2.5 border-b last:border-b-0">
              <div className="text-sm font-bold">{r.label}</div>
              <div className="space-y-2">
                <BarLine label="Realizado" value={r.fmt(r.realized)} pct={wR} tone="base" />
                <BarLine label="Projetado" value={r.fmt(r.projected)} pct={wP} tone="proj" />
                {r.goal !== null && (
                  <BarLine
                    label="Meta"
                    value={r.fmt(r.goal)}
                    pct={wG}
                    tone="goal"
                    delta={delta !== null ? { value: delta, good: delta >= 0 } : undefined}
                  />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function BarLine({
  label,
  value,
  pct,
  tone,
  delta,
}: {
  label: string;
  value: string;
  pct: number;
  tone: "base" | "proj" | "goal";
  delta?: { value: number; good: boolean };
}) {
  const fill =
    tone === "base"
      ? "bg-gradient-to-r from-sky-500 to-sky-300"
      : tone === "proj"
        ? "bg-gradient-to-r from-emerald-500 to-emerald-300"
        : "bg-gradient-to-r from-amber-500 to-orange-400";
  return (
    <div>
      <div className="flex justify-between items-baseline gap-2 mb-1 text-xs">
        <span className="text-muted-foreground">{label} <strong className="text-foreground tabular-nums">{value}</strong></span>
        {delta && (
          <span className={`text-[11px] font-extrabold ${delta.good ? "text-emerald-500" : "text-rose-500"}`}>
            {delta.value >= 0 ? "+" : ""}{delta.value.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

/* ============ GOAL CARD ============ */

function GoalCard({
  p,
  goalText,
  setGoalText,
}: {
  p: Projection;
  goalText: string;
  setGoalText: (v: string) => void;
}) {
  const goal = parseMoneyInput(goalText, 0);
  const missing = Math.max(0, goal - p.realized.profit);
  const daysLeft = Math.max(0, p.daysRemaining);
  const needPerDay = daysLeft > 0 ? missing / daysLeft : 0;
  const currentPerDay = p.daysElapsed > 0 ? p.realized.profit / p.daysElapsed : 0;
  const onPace = currentPerDay >= needPerDay && goal > 0;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Minha meta de lucro</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Quanto você quer lucrar esse mês?
            </p>
          </div>
          {goal > 0 && (
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                onPace ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              }`}
            >
              {onPace ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {p.monthClosed
                ? goal <= p.realized.profit
                  ? "Meta batida"
                  : "Meta não batida"
                : onPace
                  ? "No ritmo"
                  : "Abaixo do ritmo"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">R$</span>
          <Input
            inputMode="decimal"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            className="w-40 text-lg font-semibold tabular-nums"
          />
        </div>

        {goal > 0 && !p.monthClosed && (
          <div className="grid grid-cols-3 gap-3 pt-3 border-t">
            <MiniStat label="Falta" value={fmtBRL(missing)} />
            <MiniStat label="Precisa/dia" value={daysLeft > 0 ? fmtBRL(needPerDay) : "—"} />
            <MiniStat
              label="Ritmo atual/dia"
              value={fmtBRL(currentPerDay)}
              valueClass={onPace ? "text-emerald-500" : "text-rose-500"}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="p-3 rounded-xl bg-muted/40 border">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-base font-bold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

/* ============ PARTNERS ============ */

function PartnersSection({
  companySlug,
  projection,
}: {
  companySlug: string;
  projection: Projection;
}) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listPartners);
  const list = useQuery({
    queryKey: ["partners", companySlug],
    queryFn: () => fetchList({ data: { company_slug: companySlug } }),
  });

  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => {
    if (list.data) {
      setDrafts(
        list.data.map((p: Partner) => ({
          id: p.id,
          name: p.name,
          share_pct: p.share_pct,
          sort_order: p.sort_order,
        })),
      );
    }
  }, [list.data]);

  const totalPct = drafts.reduce((a, d) => a + (Number(d.share_pct) || 0), 0);
  const balanced = Math.abs(totalPct - 100) < 0.01;

  const save = useServerFn(savePartners);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          company_slug: companySlug,
          partners: drafts.map((d, i) => ({
            id: d.id,
            name: d.name.trim(),
            share_pct: Number(d.share_pct),
            sort_order: i,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Sócios salvos.");
      qc.invalidateQueries({ queryKey: ["partners", companySlug] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baseProfit = projection.projectedPace.profit;

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Divisão entre sócios</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Base: lucro projetado <span className="font-semibold text-foreground">{fmtBRL(baseProfit)}</span>
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Fechar" : "Editar"}
          </Button>
        </div>

        {!editing ? (
          drafts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">Nenhum sócio cadastrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-[80px] text-right">%</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((d, i) => {
                  const pct = Number(d.share_pct) / 100 || 0;
                  const val = baseProfit * pct;
                  return (
                    <TableRow key={d.id ?? `v-${i}`}>
                      <TableCell className="font-medium">{d.name || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(d.share_pct).toFixed(2)}%</TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${val >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {fmtBRL(val)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-[100px]">%</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">
                      Nenhum sócio.
                    </TableCell>
                  </TableRow>
                ) : (
                  drafts.map((d, i) => (
                    <TableRow key={d.id ?? `e-${i}`}>
                      <TableCell>
                        <Input
                          value={d.name}
                          onChange={(e) =>
                            setDrafts((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                          }
                          placeholder="Nome"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={d.share_pct}
                          onChange={(e) =>
                            setDrafts((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, share_pct: Number(e.target.value) } : x)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDrafts((arr) => arr.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDrafts((d) => [...d, { name: "", share_pct: 0, sort_order: d.length }])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
                <span className={`text-xs ${balanced ? "text-emerald-500" : "text-amber-500"}`}>
                  Total: {totalPct.toFixed(2)}% {!balanced && "(deve somar 100%)"}
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => mut.mutate()}
                disabled={mut.isPending || drafts.some((d) => !d.name.trim())}
              >
                {mut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ============ BY PRODUCT ============ */

function ByProductProjection({ days, ym }: { days: DayRow[]; ym: MonthKey }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; days: { date: string; revenue: number; invest_final: number; profit: number }[] }>();
    for (const d of days) {
      for (const bp of d.by_product ?? []) {
        let entry = map.get(bp.product_id);
        if (!entry) {
          entry = { name: bp.product_name, days: [] };
          map.set(bp.product_id, entry);
        }
        entry.days.push({
          date: d.date,
          revenue: Number(bp.revenue || 0),
          invest_final: Number(bp.invest_final || 0),
          profit: Number(bp.profit || 0),
        });
      }
    }
    const list = Array.from(map.entries()).map(([id, e]) => {
      const proj = computeProjection(e.days, { monthYear: ym.year, monthMonth: ym.month });
      return { id, name: e.name, proj };
    });
    list.sort((a, b) => b.proj.projectedPace.profit - a.proj.projectedPace.profit);
    return list;
  }, [days, ym.year, ym.month]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <h3 className="text-lg font-semibold tracking-tight">Projeção por produto</h3>
          <p className="text-sm text-muted-foreground mt-3">Nenhum produto no período.</p>
        </CardContent>
      </Card>
    );
  }

  const totalProjectedProfit = rows.reduce((a, r) => a + r.proj.projectedPace.profit, 0);
  const totalProjectedRev = rows.reduce((a, r) => a + r.proj.projectedPace.revenue, 0);
  const totalProjectedInv = rows.reduce((a, r) => a + r.proj.projectedPace.invest, 0);

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Projeção por produto</h3>
            <p className="text-xs text-muted-foreground mt-1">Ranking pelo lucro projetado do mês</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Fat proj" value={fmtBRL(totalProjectedRev)} />
          <MiniStat label="Inv proj" value={fmtBRL(totalProjectedInv)} />
          <MiniStat
            label="Lucro proj"
            value={fmtBRL(totalProjectedProfit)}
            valueClass={totalProjectedProfit >= 0 ? "text-emerald-500" : "text-rose-500"}
          />
        </div>

        <div className="space-y-2 pt-1">
          {rows.map((r) => {
            const realized = r.proj.realized.profit;
            const projected = r.proj.projectedPace.profit;
            const roi = r.proj.projectedPace.invest > 0 ? roiOf(r.proj.projectedPace) : null;
            const share = totalProjectedProfit > 0 ? Math.max(0, Math.min(1, projected / totalProjectedProfit)) : 0;
            return (
              <div key={r.id} className="rounded-xl border p-3 hover:bg-muted/40 transition">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Fat: <span className="tabular-nums">{fmtBRL(r.proj.projectedPace.revenue)}</span>
                      {" · "}Inv: <span className="tabular-nums">{fmtBRL(r.proj.projectedPace.invest)}</span>
                      {roi !== null && <> {" · "}ROI: <span className="tabular-nums">{fmtPct(roi)}</span></>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Real → Proj</div>
                    <div className="text-sm tabular-nums">
                      <span className={realized >= 0 ? "text-emerald-500" : "text-rose-500"}>{fmtBRL(realized)}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className={`font-bold ${projected >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fmtBRL(projected)}</span>
                    </div>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${projected >= 0 ? "bg-gradient-to-r from-emerald-500 to-emerald-300" : "bg-rose-500"}`}
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
