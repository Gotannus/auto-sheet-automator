import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Target, Trash2, TrendingDown, TrendingUp } from "lucide-react";

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
import { getDashboard } from "@/lib/celetus/dashboard.functions";
import { listPartners, savePartners, type Partner } from "@/lib/celetus/partners.functions";
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
const fmtDayValue = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
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

type MonthKey = { year: number; month: number };
type Draft = { id?: string; name: string; share_pct: number; sort_order: number };
type Scenario = ProjectionMoney & { requiredRevenue: number; targetProfit: number };

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
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Projeção de lucro
          </h1>
          <p className="text-sm text-muted-foreground">
            {company?.name ?? companySlug} · {MONTHS[ym.month - 1]} {ym.year}
          </p>
        </div>
        <Select value={target} onValueChange={(v) => setTarget(v as "this" | "last")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this">Este mês</SelectItem>
            <SelectItem value="last">Mês passado</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {q.isLoading || !projection ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando...</CardContent>
        </Card>
      ) : (
        <ProjectionWorkspace companySlug={companySlug} projection={projection} />
      )}
    </div>
  );
}

function ProjectionWorkspace({ companySlug, projection }: { companySlug: string; projection: Projection }) {
  const [scenario, setScenario] = useState<Scenario>(() => ({
    ...projection.recommended,
    requiredRevenue: projection.recommended.revenue,
    targetProfit: projection.recommended.profit,
  }));

  return (
    <>
      <CurrentResult p={projection} />
      <ForecastResult p={projection} />
      <ScenarioBuilder p={projection} onScenarioChange={setScenario} />
      <PartnersSection companySlug={companySlug} projection={projection} scenario={scenario} />
    </>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "profit" | "invest" | "revenue" | "neutral";
}) {
  const color =
    tone === "profit"
      ? value.includes("-")
        ? "text-rose-600"
        : "text-emerald-600"
      : tone === "invest"
        ? "text-sky-600"
        : "text-foreground";
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function MoneyGrid({ data }: { data: ProjectionMoney }) {
  return (
    <div className="grid grid-cols-2 gap-4 pt-2">
      <Kpi label="Faturamento" value={fmtBRL(data.revenue)} tone="revenue" />
      <Kpi label="Investimento" value={fmtBRL(data.invest)} tone="invest" />
      <Kpi label="Lucro" value={fmtBRL(data.profit)} tone="profit" />
      <Kpi label="ROI" value={data.invest > 0 ? fmtPct(roiOf(data)) : "—"} />
    </div>
  );
}

function CurrentResult({ p }: { p: Projection }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <Card className="border-primary/30">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Resultado atual</div>
              <div className="text-xs text-muted-foreground">
                {p.monthClosed
                  ? `Mês fechado com ${p.daysInMonth} dias`
                  : `${p.daysElapsed} de ${p.daysInMonth} dias já passaram · ${p.daysRemaining} restantes`}
              </div>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${p.realized.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {fmtBRL(p.realized.profit)}
            </div>
          </div>
          <MoneyGrid data={p.realized} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <div className="text-sm font-semibold">Média real até agora</div>
            <div className="text-xs text-muted-foreground">
              Calculada por dia corrido, incluindo dias zerados.
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Fat./dia" value={fmtBRL(p.runningAverage.revenue)} tone="revenue" />
            <Kpi label="Inv./dia" value={fmtBRL(p.runningAverage.invest)} tone="invest" />
            <Kpi label="Lucro/dia" value={fmtBRL(p.runningAverage.profit)} tone="profit" />
          </div>
          <div className="text-xs text-muted-foreground">
            Dias com movimentação: {p.activeDays} · Dias usados no cálculo: {fmtDayValue(p.daysElapsed || 0)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ForecastResult({ p }: { p: Projection }) {
  const deltaRecent = p.projectedRecent.profit - p.projectedPace.profit;
  const recentBetter = deltaRecent >= 0;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-emerald-500/30">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Fechamento provável</div>
              <div className="text-xs text-muted-foreground">
                {p.monthClosed
                  ? "Resultado final do mês selecionado."
                  : "Se continuar no mesmo ritmo real até hoje."}
              </div>
            </div>
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <MoneyGrid data={p.projectedPace} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Ritmo recente</div>
              <div className="text-xs text-muted-foreground">
                {p.monthClosed
                  ? "Mesmo valor do mês fechado."
                  : `Usando os últimos ${p.recentDays || 0} dias corridos como referência.`}
              </div>
            </div>
            {recentBetter ? (
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-rose-600" />
            )}
          </div>
          <MoneyGrid data={p.projectedRecent} />
          {!p.monthClosed && (
            <div className={`text-sm ${recentBetter ? "text-emerald-600" : "text-rose-600"}`}>
              Diferença contra o provável: <span className="font-semibold tabular-nums">{fmtBRL(deltaRecent)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioBuilder({
  p,
  onScenarioChange,
}: {
  p: Projection;
  onScenarioChange: (scenario: Scenario) => void;
}) {
  const [targetProfitText, setTargetProfitText] = useState(() => moneyInputValue(p.recommended.profit));
  const [plannedInvestText, setPlannedInvestText] = useState(() => moneyInputValue(p.recommended.invest));

  useEffect(() => {
    setTargetProfitText(moneyInputValue(p.recommended.profit));
    setPlannedInvestText(moneyInputValue(p.recommended.invest));
  }, [p.recommended.profit, p.recommended.invest]);

  const targetProfit = parseMoneyInput(targetProfitText, p.recommended.profit);
  const plannedInvest = Math.max(0, parseMoneyInput(plannedInvestText, p.recommended.invest));
  const variableCostRate = p.recommended.revenue > 0
    ? Math.max(0, Math.min(0.95, (p.recommended.revenue - p.recommended.invest - p.recommended.profit) / p.recommended.revenue))
    : 0;
  const netRevenueRate = Math.max(0.05, 1 - variableCostRate);
  const requiredRevenue = Math.max(0, (targetProfit + plannedInvest) / netRevenueRate);
  const scenario: Scenario = {
    revenue: requiredRevenue,
    invest: plannedInvest,
    profit: targetProfit,
    requiredRevenue,
    targetProfit,
  };
  const profitDelta = scenario.profit - p.projectedPace.profit;
  const revenueDelta = scenario.revenue - p.projectedPace.revenue;
  const investDelta = scenario.invest - p.projectedPace.invest;

  useEffect(() => {
    onScenarioChange(scenario);
  }, [scenario.revenue, scenario.invest, scenario.profit, scenario.requiredRevenue, scenario.targetProfit, onScenarioChange]);

  const applyProfitDelta = (delta: number) => setTargetProfitText(moneyInputValue(p.projectedPace.profit + delta));

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Meta e simulação</div>
            <div className="text-xs text-muted-foreground">
              Defina quanto quer lucrar no mês e o investimento previsto. O sistema mostra o faturamento necessário.
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setTargetProfitText(moneyInputValue(p.recommended.profit));
              setPlannedInvestText(moneyInputValue(p.recommended.invest));
            }}
          >
            Resetar provável
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Lucro alvo do mês</span>
            <Input
              inputMode="decimal"
              value={targetProfitText}
              onChange={(e) => setTargetProfitText(e.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Investimento planejado no mês</span>
            <Input
              inputMode="decimal"
              value={plannedInvestText}
              onChange={(e) => setPlannedInvestText(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {[1000, 3000, 5000, 10000].map((delta) => (
            <Button key={delta} type="button" size="sm" variant="secondary" onClick={() => applyProfitDelta(delta)}>
              +{fmtBRL(delta)} de lucro
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <Kpi label="Faturamento necessário" value={fmtBRL(scenario.revenue)} tone="revenue" />
          <Kpi label="Investimento" value={fmtBRL(scenario.invest)} tone="invest" />
          <Kpi label="Lucro alvo" value={fmtBRL(scenario.profit)} tone="profit" />
          <Kpi label="ROI alvo" value={scenario.invest > 0 ? fmtPct(roiOf(scenario)) : "—"} />
        </div>

        <div className="grid gap-3 md:grid-cols-3 text-sm">
          <ScenarioDelta label="Lucro vs. provável" value={profitDelta} />
          <ScenarioDelta label="Faturamento vs. provável" value={revenueDelta} />
          <ScenarioDelta label="Investimento vs. provável" value={investDelta} inverse />
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioDelta({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const good = inverse ? value <= 0 : value >= 0;
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${good ? "text-emerald-600" : "text-rose-600"}`}>
        {value >= 0 ? "+" : ""}{fmtBRL(value)}
      </div>
    </div>
  );
}

function PartnersSection({
  companySlug,
  projection,
  scenario,
}: {
  companySlug: string;
  projection: Projection;
  scenario: Scenario;
}) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listPartners);
  const list = useQuery({
    queryKey: ["partners", companySlug],
    queryFn: () => fetchList({ data: { company_slug: companySlug } }),
  });

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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Divisão entre sócios</div>
            <div className="text-xs text-muted-foreground">
              Valores calculados sobre lucro atual, fechamento provável e cenário simulado.
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDrafts((d) => [...d, { name: "", share_pct: 0, sort_order: d.length }])}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar sócio
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-[110px]">%</TableHead>
              <TableHead className="text-right">Atual</TableHead>
              <TableHead className="text-right">Provável</TableHead>
              <TableHead className="text-right">Simulado</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Nenhum sócio cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              drafts.map((d, i) => {
                const pct = Number(d.share_pct) / 100 || 0;
                return (
                  <TableRow key={d.id ?? `new-${i}`}>
                    <TableCell>
                      <Input
                        value={d.name}
                        onChange={(e) =>
                          setDrafts((arr) =>
                            arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        placeholder="Nome do sócio"
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
                            arr.map((x, j) =>
                              j === i ? { ...x, share_pct: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <PartnerMoneyCell value={projection.realized.profit * pct} />
                    <PartnerMoneyCell value={projection.projectedPace.profit * pct} />
                    <PartnerMoneyCell value={scenario.profit * pct} />
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDrafts((arr) => arr.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className={`text-sm ${balanced ? "text-emerald-600" : "text-amber-600"}`}>
            Total: <span className="font-semibold tabular-nums">{totalPct.toFixed(2)}%</span>
            {!balanced && <span className="ml-2 text-xs">(deve somar 100%)</span>}
          </div>
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || drafts.some((d) => !d.name.trim())}
          >
            {mut.isPending ? "Salvando..." : "Salvar sócios"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PartnerMoneyCell({ value }: { value: number }) {
  return (
    <TableCell className={`text-right tabular-nums ${value >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
      {fmtBRL(value)}
    </TableCell>
  );
}