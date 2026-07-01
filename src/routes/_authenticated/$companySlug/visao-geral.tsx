import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getAdminOverview } from "@/lib/celetus/admin-overview.functions";
import { companyPath } from "@/lib/celetus/workspaces";
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
import { RefreshCw, CalendarDays, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/$companySlug/visao-geral")({
  head: () => ({ meta: [{ title: "Visão Geral - Gotannus" }] }),
  beforeLoad: ({ params }) => {
    if (params.companySlug !== "gotannus") {
      throw redirect({ to: "/$companySlug/dashboard", params: { companySlug: params.companySlug } });
    }
  },
  component: VisaoGeralPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

const PASS = "4188";
const SS_KEY = "gotannus_admin_unlocked";

type Preset = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

function brtNow() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}
function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function firstDayOfMonth(ymd: string) {
  const [y, m] = ymd.split("-");
  return `${y}-${m}-01`;
}
function lastDayOfMonth(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function addMonths(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, d)).toISOString().slice(0, 10);
}
function fmtBR(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function rangeForPreset(preset: Preset, custom?: { from: string; to: string }) {
  const today = toYMD(brtNow());
  if (preset === "today") return { from: today, to: today, label: `Hoje · ${fmtBR(today)}` };
  if (preset === "yesterday") {
    const y = addDays(today, -1);
    return { from: y, to: y, label: `Ontem · ${fmtBR(y)}` };
  }
  if (preset === "thisMonth") {
    const from = firstDayOfMonth(today);
    return { from, to: today, label: `Este mês · ${fmtBR(from)} → ${fmtBR(today)}` };
  }
  if (preset === "lastMonth") {
    const from = addMonths(firstDayOfMonth(today), -1);
    const to = lastDayOfMonth(from);
    return { from, to, label: `Mês passado · ${fmtBR(from)} → ${fmtBR(to)}` };
  }
  if (preset === "custom" && custom) {
    return {
      from: custom.from,
      to: custom.to,
      label: `Personalizado · ${fmtBR(custom.from)} → ${fmtBR(custom.to)}`,
    };
  }
  const from = addDays(today, -6);
  return { from, to: today, label: `Últimos 7 dias · ${fmtBR(from)} → ${fmtBR(today)}` };
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtInt = (v: number) => v.toLocaleString("pt-BR");
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function VisaoGeralPage() {
  const [unlocked, setUnlocked] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(SS_KEY) === "1",
  );
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <OverviewInner />;
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pw === PASS) {
            sessionStorage.setItem(SS_KEY, "1");
            onUnlock();
          } else {
            setErr(true);
          }
        }}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">Senha de 4 dígitos para a visão geral.</p>
        </div>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          autoFocus
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            if (err) setErr(false);
          }}
          placeholder="••••"
        />
        {err && <p className="text-sm text-destructive">Senha incorreta.</p>}
        <Button type="submit" className="w-full">
          Entrar
        </Button>
      </form>
    </div>
  );
}

function OverviewInner() {
  const [preset, setPreset] = useState<Preset>("today");
  const todayYmd = useMemo(() => toYMD(brtNow()), []);
  const [customFrom, setCustomFrom] = useState(firstDayOfMonth(todayYmd));
  const [customTo, setCustomTo] = useState(todayYmd);
  const [salesFilter, setSalesFilter] = useState<string>("all");
  const r = useMemo(
    () => rangeForPreset(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );

  const query = useQuery({
    queryKey: ["admin-overview", r.from, r.to],
    queryFn: () => getAdminOverview({ data: { from: r.from, to: r.to } }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const data = query.data;

  const totals = useMemo(() => {
    if (!data || data.companies.length === 0) return null;
    return data.companies.reduce(
      (a, c) => ({
        sales: a.sales + c.sales,
        principal_qty: a.principal_qty + c.principal_qty,
        ob_qty: a.ob_qty + c.ob_qty,
        revenue: a.revenue + c.revenue,
        invest_manual: a.invest_manual + c.invest_manual,
        invest_final: a.invest_final + c.invest_final,
        profit: a.profit + c.profit,
      }),
      { sales: 0, principal_qty: 0, ob_qty: 0, revenue: 0, invest_manual: 0, invest_final: 0, profit: 0 },
    );
  }, [data]);
  const totalRoi = totals && totals.invest_final > 0 ? totals.profit / totals.invest_final : 0;

  const filteredSales = useMemo(() => {
    if (!data) return [];
    if (salesFilter === "all") return data.recent_sales;
    return data.recent_sales.filter((s) => s.company_slug === salesFilter);
  }, [data, salesFilter]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span>{r.label}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
            onClick={() => query.refetch()}
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      {query.error && (
        <Card>
          <CardContent className="p-6 text-destructive">Erro: {query.error.message}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Empresas {data ? `(${data.companies.length})` : ""}
          </div>
          {!data ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-6 w-24 bg-muted rounded mt-3 animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : data.companies.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Nenhuma empresa cadastrada.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {totals && (
                <Card className="border-primary/40 bg-primary/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">Total geral</div>
                      <div className="text-xs text-muted-foreground">
                        {data!.companies.length} empresas
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Faturamento</div>
                        <div className="font-medium tabular-nums">{fmtBRL(totals.revenue)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Investimento</div>
                        <div className="font-medium tabular-nums text-sky-600">
                          {fmtBRL(totals.invest_final)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Lucro</div>
                        <div
                          className={`font-semibold tabular-nums ${totals.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                        >
                          {fmtBRL(totals.profit)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">ROI</div>
                        <div className="font-medium tabular-nums text-amber-600">
                          {totals.invest_final > 0 ? fmtPct(totalRoi) : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground pt-1 border-t">
                      {fmtInt(totals.sales)} vendas · {fmtInt(totals.principal_qty)}P /{" "}
                      {fmtInt(totals.ob_qty)}B
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="grid sm:grid-cols-2 gap-3">

              {data.companies.map((c) => (
                <Link
                  key={c.company_id}
                  to={companyPath(c.company_slug, "hoje")}
                  className="block group"
                >
                  <Card className="hover:border-primary transition-colors h-full">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold truncate">{c.company_name}</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Faturamento</div>
                          <div className="font-medium tabular-nums">{fmtBRL(c.revenue)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Investimento</div>
                          <div className="font-medium tabular-nums text-sky-600">
                            {fmtBRL(c.invest_final)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Lucro</div>
                          <div
                            className={`font-semibold tabular-nums ${c.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                          >
                            {fmtBRL(c.profit)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">ROI</div>
                          <div className="font-medium tabular-nums text-amber-600">
                            {c.invest_final > 0 ? fmtPct(c.roi) : "—"}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground pt-1 border-t">
                        {fmtInt(c.sales)} vendas · {fmtInt(c.principal_qty)}P / {fmtInt(c.ob_qty)}B
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              </div>
            </div>
          )}
        </div>


        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Últimas vendas
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              ao vivo
            </div>
          </div>
          {data && data.companies.length > 0 && (
            <Select value={salesFilter} onValueChange={setSalesFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {data.companies.map((c) => (
                  <SelectItem key={c.company_id} value={c.company_slug}>
                    {c.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Card>
            <CardContent className="p-0 max-h-[700px] overflow-y-auto">
              {!data ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : filteredSales.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">Sem vendas recentes.</div>
              ) : (
                <ul className="divide-y">
                  {filteredSales.map((s) => {
                    const isBump =
                      s.kind.toLowerCase() === "orderbump" ||
                      s.kind.toLowerCase() === "order_bump" ||
                      s.kind.toLowerCase() === "bump";
                    const dt = new Date(s.sale_date);
                    const time = dt.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Sao_Paulo",
                    });
                    const date = dt.toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      timeZone: "America/Sao_Paulo",
                    });
                    return (
                      <li key={s.id} className="px-4 py-2.5 text-sm hover:bg-muted/40">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium truncate">{s.company_name}</div>
                          <div className="font-semibold tabular-nums text-emerald-600 shrink-0">
                            {fmtBRL(s.commission_value)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-0.5">
                          <div className="truncate">
                            {s.product_name}
                            {isBump && (
                              <span className="ml-1.5 px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] uppercase">
                                bump
                              </span>
                            )}
                          </div>
                          <div className="shrink-0 tabular-nums">
                            {date} {time}
                          </div>
                        </div>
                        {s.buyer_name && (
                          <div className="text-xs text-muted-foreground/80 truncate mt-0.5">
                            {s.buyer_name}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
