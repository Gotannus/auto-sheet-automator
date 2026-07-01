import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Target, Trash2 } from "lucide-react";

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
    <div className="p-4 md:p-6 space-y-5 max-w-[1100px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Projeção
          </h1>
          <p className="text-sm text-muted-foreground">
            {company?.name ?? companySlug} · {MONTHS[ym.month - 1]} {ym.year}
          </p>
        </div>
        <Select value={target} onValueChange={(v) => setTarget(v as "this" | "last")}>
          <SelectTrigger className="w-[180px]">
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
        <>
          <HeroCard p={projection} />
          <div className="grid gap-4 md:grid-cols-2">
            <MoneyCard title="Realizado" subtitle="O que já aconteceu" data={projection.realized} highlight />
            <MoneyCard title="Projetado" subtitle="Estimativa até o fim do mês" data={projection.projectedPace} />
          </div>
          <ByProductProjection days={q.data!.days} ym={ym} />
          <GoalCard p={projection} />
          <PartnersSection companySlug={companySlug} projection={projection} />
        </>
      )}
    </div>
  );
}

function HeroCard({ p }: { p: Projection }) {
  const profit = p.realized.profit;
  const positive = profit >= 0;
  const pctMonth = p.daysInMonth > 0 ? Math.min(1, p.daysElapsed / p.daysInMonth) : 0;
  const roi = p.realized.invest > 0 ? roiOf(p.realized) : null;

  return (
    <Card className="border-primary/30">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-muted-foreground">Lucro do mês</div>
            <div className={`text-4xl md:text-5xl font-bold tabular-nums ${positive ? "text-emerald-600" : "text-rose-600"}`}>
              {fmtBRL(profit)}
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Fecha provável</div>
            <div className={`text-2xl font-semibold tabular-nums ${p.projectedPace.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {fmtBRL(p.projectedPace.profit)}
            </div>
            {roi !== null && (
              <div className="text-xs text-muted-foreground">ROI atual: <span className="font-semibold text-foreground">{fmtPct(roi)}</span></div>
            )}
          </div>
        </div>
        <div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${pctMonth * 100}%` }} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {p.monthClosed
              ? `Mês fechado (${p.daysInMonth} dias).`
              : `Dia ${p.daysElapsed} de ${p.daysInMonth} · faltam ${p.daysRemaining} dias`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MoneyCard({
  title,
  subtitle,
  data,
  highlight = false,
}: {
  title: string;
  subtitle: string;
  data: ProjectionMoney;
  highlight?: boolean;
}) {
  const roi = data.invest > 0 ? roiOf(data) : null;
  return (
    <Card className={highlight ? "border-emerald-500/20" : undefined}>
      <CardContent className="p-5 space-y-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <Row label="Faturamento" value={fmtBRL(data.revenue)} />
        <Row label="Investimento" value={fmtBRL(data.invest)} />
        <Row
          label="Lucro"
          value={fmtBRL(data.profit)}
          valueClass={data.profit >= 0 ? "text-emerald-600" : "text-rose-600"}
          strong
        />
        <Row label="ROI" value={roi !== null ? fmtPct(roi) : "—"} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value, valueClass = "", strong = false }: { label: string; value: string; valueClass?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm border-b last:border-b-0 pb-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold text-base" : ""} ${valueClass}`}>{value}</span>
    </div>
  );
}

function GoalCard({ p }: { p: Projection }) {
  const [goalText, setGoalText] = useState(() =>
    moneyInputValue(Math.max(p.projectedPace.profit, p.realized.profit)),
  );
  useEffect(() => {
    setGoalText(moneyInputValue(Math.max(p.projectedPace.profit, p.realized.profit)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.realized.profit, p.projectedPace.profit]);

  const goal = parseMoneyInput(goalText, 0);
  const missing = Math.max(0, goal - p.realized.profit);
  const daysLeft = Math.max(0, p.daysRemaining);
  const needPerDay = daysLeft > 0 ? missing / daysLeft : 0;
  const currentPerDay = p.daysElapsed > 0 ? p.realized.profit / p.daysElapsed : 0;
  const onPace = currentPerDay >= needPerDay && goal > 0;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <div className="text-sm font-semibold">Minha meta de lucro</div>
          <div className="text-xs text-muted-foreground">Quanto você quer lucrar esse mês?</div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">R$</span>
            <Input
              inputMode="decimal"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              className="w-40 text-lg font-semibold"
            />
          </div>
          {goal > 0 && (
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                onPace ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"
              }`}
            >
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

        {goal > 0 && !p.monthClosed && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t">
            <Stat label="Falta" value={fmtBRL(missing)} />
            <Stat label="Precisa/dia" value={daysLeft > 0 ? fmtBRL(needPerDay) : "—"} />
            <Stat
              label="Ritmo atual/dia"
              value={fmtBRL(currentPerDay)}
              valueClass={onPace ? "text-emerald-600" : "text-rose-600"}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

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
            <div className="text-sm font-semibold">Divisão entre sócios</div>
            <div className="text-xs text-muted-foreground">
              Com base no lucro projetado: <span className="font-semibold text-foreground">{fmtBRL(baseProfit)}</span>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Fechar" : "Editar sócios"}
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
                      <TableCell className={`text-right tabular-nums font-semibold ${val >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
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
                          <Trash2 className="h-4 w-4 text-rose-600" />
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
                <span className={`text-xs ${balanced ? "text-emerald-600" : "text-amber-600"}`}>
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
