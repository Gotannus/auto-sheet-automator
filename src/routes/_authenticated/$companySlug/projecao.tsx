import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getCompanyBySlug } from "@/lib/celetus/companies.functions";
import { getDashboard } from "@/lib/celetus/dashboard.functions";
import { listPartners, savePartners, type Partner } from "@/lib/celetus/partners.functions";
import { computeProjection } from "@/lib/celetus/projection";
import { isValidSlug } from "@/lib/celetus/workspaces";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";

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
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type MonthKey = { year: number; month: number };
function todayYM(): MonthKey {
  const s = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [y, m] = s.split("-").map(Number);
  return { year: y, month: m };
}
function shiftMonth({ year, month }: MonthKey, delta: number): MonthKey {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
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
            <TrendingUp className="h-6 w-6 text-primary" />
            Projeção
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
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando...</CardContent></Card>
      ) : (
        <>
          <ProjectionSummary p={projection} />
          <Simulator p={projection} />
          <PartnersSection companySlug={companySlug} projection={projection} />
        </>
      )}
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "profit" | "invest" | "revenue" | "neutral"; }) {
  const cls =
    tone === "profit"
      ? value.startsWith("-") || value.includes("-R$")
        ? "text-rose-600"
        : "text-emerald-600"
      : tone === "invest"
      ? "text-sky-600"
      : tone === "revenue"
      ? "text-foreground"
      : "text-foreground";
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function ProjectionSummary({ p }: { p: ReturnType<typeof computeProjection> }) {
  const roiA = p.projectionAvg.invest > 0 ? p.projectionAvg.profit / p.projectionAvg.invest : 0;
  const roiB = p.projectionLast7.invest > 0 ? p.projectionLast7.profit / p.projectionLast7.invest : 0;
  const roiReal = p.realized.invest > 0 ? p.realized.profit / p.realized.invest : 0;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-semibold">Realizado</div>
          <div className="text-xs text-muted-foreground">
            {p.daysElapsed} de {p.daysInMonth} dias · {p.daysRemaining} restantes
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <KPI label="Faturamento" value={fmtBRL(p.realized.revenue)} tone="revenue" />
            <KPI label="Investimento" value={fmtBRL(p.realized.invest)} tone="invest" />
            <KPI label="Lucro" value={fmtBRL(p.realized.profit)} tone="profit" />
            <KPI label="ROI" value={p.realized.invest > 0 ? fmtPct(roiReal) : "—"} />
          </div>
        </CardContent>
      </Card>
      <Card className="border-primary/40">
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            Projeção A <span className="text-xs font-normal text-muted-foreground">Média × dias do mês</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Baseada na média diária dos dias com atividade
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <KPI label="Faturamento" value={fmtBRL(p.projectionAvg.revenue)} tone="revenue" />
            <KPI label="Investimento" value={fmtBRL(p.projectionAvg.invest)} tone="invest" />
            <KPI label="Lucro" value={fmtBRL(p.projectionAvg.profit)} tone="profit" />
            <KPI label="ROI" value={p.projectionAvg.invest > 0 ? fmtPct(roiA) : "—"} />
          </div>
        </CardContent>
      </Card>
      <Card className="border-primary/40">
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            Projeção B <span className="text-xs font-normal text-muted-foreground">Últimos 7 dias</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Realizado + média dos últimos 7d × dias restantes
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <KPI label="Faturamento" value={fmtBRL(p.projectionLast7.revenue)} tone="revenue" />
            <KPI label="Investimento" value={fmtBRL(p.projectionLast7.invest)} tone="invest" />
            <KPI label="Lucro" value={fmtBRL(p.projectionLast7.profit)} tone="profit" />
            <KPI label="ROI" value={p.projectionLast7.invest > 0 ? fmtPct(roiB) : "—"} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Simulator({ p }: { p: ReturnType<typeof computeProjection> }) {
  const [revBoost, setRevBoost] = useState(0); // -20..+100 %
  const [invCut, setInvCut] = useState(0); // -50..+50 % (positive = cut)

  const base = p.projectionAvg;
  const simRevenue = base.revenue * (1 + revBoost / 100);
  const simInvest = base.invest * (1 - invCut / 100);
  // Preserve tax margin from baseline: profit = revenue - (base.revenue - base.profit - base.invest) - invest
  const fixedCostBase = base.revenue - base.profit - base.invest; // ~ taxa + despesas absorvidas
  const simProfit = simRevenue - fixedCostBase * (simRevenue / (base.revenue || 1)) - simInvest;
  const simRoi = simInvest > 0 ? simProfit / simInvest : 0;

  const deltaProfit = simProfit - base.profit;
  const isGain = deltaProfit >= 0;

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div>
          <div className="text-sm font-semibold">Simulador de cenários</div>
          <div className="text-xs text-muted-foreground">
            Baseline: Projeção A do mês. Ajuste faturamento e investimento para ver o impacto.
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Aumento de faturamento</span>
              <span className="font-medium tabular-nums">{revBoost >= 0 ? "+" : ""}{revBoost}%</span>
            </div>
            <Slider
              min={-20} max={100} step={1}
              value={[revBoost]}
              onValueChange={(v) => setRevBoost(v[0])}
            />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Redução de investimento</span>
              <span className="font-medium tabular-nums">{invCut >= 0 ? "-" : "+"}{Math.abs(invCut)}%</span>
            </div>
            <Slider
              min={-50} max={50} step={1}
              value={[invCut]}
              onValueChange={(v) => setInvCut(v[0])}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t">
          <KPI label="Faturamento sim." value={fmtBRL(simRevenue)} tone="revenue" />
          <KPI label="Investimento sim." value={fmtBRL(simInvest)} tone="invest" />
          <KPI label="Lucro simulado" value={fmtBRL(simProfit)} tone="profit" />
          <KPI label="ROI simulado" value={simInvest > 0 ? fmtPct(simRoi) : "—"} />
        </div>

        <div className={`flex items-center gap-2 text-sm ${isGain ? "text-emerald-600" : "text-rose-600"}`}>
          {isGain ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          <span>
            {isGain ? "Ganho" : "Perda"} vs. projeção base: <span className="font-semibold">{fmtBRL(deltaProfit)}</span>
          </span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setRevBoost(0); setInvCut(0); }}>
            Resetar
          </Button>
        </div>

        <PartnersSimHint />
      </CardContent>
    </Card>
  );
}

function PartnersSimHint() {
  return (
    <div className="text-xs text-muted-foreground">
      A tabela abaixo mostra como o lucro simulado se divide entre os sócios.
    </div>
  );
}

type Draft = { id?: string; name: string; share_pct: number; sort_order: number };

function PartnersSection({
  companySlug,
  projection,
}: {
  companySlug: string;
  projection: ReturnType<typeof computeProjection>;
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

  const realized = projection.realized.profit;
  const projA = projection.projectionAvg.profit;
  const projB = projection.projectionLast7.profit;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Divisão entre sócios</div>
            <div className="text-xs text-muted-foreground">
              Configure nomes e % de participação. Total deve somar 100%.
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDrafts((d) => [...d, { name: "", share_pct: 0, sort_order: d.length }])
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar sócio
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-[110px]">%</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">Projeção A</TableHead>
              <TableHead className="text-right">Projeção B</TableHead>
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
                    <TableCell className={`text-right tabular-nums ${realized * pct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {fmtBRL(realized * pct)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${projA * pct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {fmtBRL(projA * pct)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${projB * pct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {fmtBRL(projB * pct)}
                    </TableCell>
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
