import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw } from "lucide-react";
import { listSales, type SaleRow } from "@/lib/celetus/sales.functions";
import { listProducts } from "@/lib/celetus/products.functions";
import { companyPath, isValidSlug } from "@/lib/celetus/workspaces";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/$companySlug/sales")({
  head: () => ({ meta: [{ title: "Vendas — Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  component: SalesPage,
});

type SortField = "sale_date" | "commission_value" | "net_value" | "gross_value";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

const ALL = "__all__";

function SalesPage() {
  const { companySlug } = Route.useParams();
  const qc = useQueryClient();
  const listSalesFn = useServerFn(listSales);
  const listProductsFn = useServerFn(listProducts);

  const [productId, setProductId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("sale_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const productsQ = useQuery({
    queryKey: ["products", companySlug],
    queryFn: () => listProductsFn({ data: { company_slug: companySlug } }),
  });

  const queryKey = useMemo(
    () => [
      "sales",
      companySlug,
      { productId, status, kind, search, dateFrom, dateTo, sortBy, sortDir, page },
    ],
    [companySlug, productId, status, kind, search, dateFrom, dateTo, sortBy, sortDir, page],
  );

  const salesQ = useQuery({
    queryKey,
    queryFn: () =>
      listSalesFn({
        data: {
          company_slug: companySlug,
          product_id: productId || null,
          status: status || null,
          kind: kind || null,
          search: search.trim() || null,
          date_from: dateFrom || null,
          date_to: dateTo || null,
          sort_by: sortBy,
          sort_dir: sortDir,
          page,
          page_size: PAGE_SIZE,
        },
      }),
    placeholderData: (prev) => prev,
  });

  const total = salesQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = salesQ.data?.rows ?? [];
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);

  function resetFilters() {
    setProductId("");
    setStatus("");
    setKind("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  function onFilterChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-sm text-muted-foreground">
            Todas as vendas registradas (webhook + importação de planilha).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["sales", companySlug] })}
          disabled={salesQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${salesQ.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      <SummaryCards totals={salesQ.data?.totals} loading={salesQ.isFetching} />



      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-6">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Produto</Label>
            <Select
              value={productId || ALL}
              onValueChange={(v) => onFilterChange(setProductId)(v === ALL ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os produtos</SelectItem>
                {(productsQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select
              value={status || ALL}
              onValueChange={(v) => onFilterChange(setStatus)(v === ALL ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="Pago">Pago</SelectItem>
                <SelectItem value="Aprovado">Aprovado</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Recusado">Recusado</SelectItem>
                <SelectItem value="Reembolso">Reembolso</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
                <SelectItem value="Chargeback">Chargeback</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select
              value={kind || ALL}
              onValueChange={(v) => onFilterChange(setKind)(v === ALL ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="Principal">Principal</SelectItem>
                <SelectItem value="Orderbump">Orderbump</SelectItem>
                <SelectItem value="Upsell">Upsell</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-6 flex flex-wrap gap-1.5">
            {(
              [
                { label: "Hoje", days: 0 },
                { label: "Ontem", days: 1, single: true },
                { label: "7 dias", days: 6 },
                { label: "30 dias", days: 29 },
                { label: "Mês atual", month: true },
              ] as const
            ).map((preset) => {
              const today = new Date();
              const ymd = (d: Date) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              let from = "";
              let to = ymd(today);
              if ("month" in preset && preset.month) {
                from = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
              } else if ("single" in preset && preset.single) {
                const d = new Date(today);
                d.setDate(d.getDate() - (preset as { days: number }).days);
                from = ymd(d);
                to = ymd(d);
              } else {
                const d = new Date(today);
                d.setDate(d.getDate() - ((preset as { days: number }).days ?? 0));
                from = ymd(d);
              }
              const active = dateFrom === from && dateTo === to;
              return (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => {
                    setDateFrom(from);
                    setDateTo(to);
                    setPage(1);
                  }}
                >
                  {preset.label}
                </Button>
              );
            })}
            {(dateFrom || dateTo) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
              >
                Limpar datas
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onFilterChange(setDateFrom)(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onFilterChange(setDateTo)(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 md:col-span-4">
            <Label className="text-xs">Buscar (transação, comprador, produto)</Label>
            <Input
              placeholder="Ex: ABC123, fulano@..., Peso da cama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  salesQ.refetch();
                }
              }}
            />
          </div>
          <div className="md:col-span-2 flex items-end gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setPage(1);
                salesQ.refetch();
              }}
            >
              Aplicar busca
            </Button>
            <Button variant="ghost" onClick={resetFilters}>
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Data"
                    field="sale_date"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onClick={toggleSort}
                  />
                  <TableHead>Transação</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Oferta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <SortableHead
                    label="Comissão"
                    field="commission_value"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="Líquido"
                    field="net_value"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="Bruto"
                    field="gross_value"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <TableHead>Comprador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesQ.isLoading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                      Nenhuma venda encontrada com esses filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => <SaleRowItem key={r.id} row={r} />)
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between p-3 border-t text-sm">
            <div className="text-muted-foreground">
              {total === 0
                ? "Nenhum registro"
                : `Mostrando ${showingFrom}–${showingTo} de ${total}`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || salesQ.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || salesQ.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableHead({
  label,
  field,
  sortBy,
  sortDir,
  onClick,
  align,
}: {
  label: string;
  field: SortField;
  sortBy: SortField;
  sortDir: SortDir;
  onClick: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const active = sortBy === field;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onClick(field)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          active ? "text-foreground font-medium" : ""
        }`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

function SaleRowItem({ row }: { row: SaleRow }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs">{formatDate(row.sale_date)}</TableCell>
      <TableCell className="font-mono text-xs max-w-[140px] truncate" title={row.transaction_code}>
        {row.transaction_code}
      </TableCell>
      <TableCell className="max-w-[200px] truncate" title={row.product_name ?? ""}>
        {row.product_name ?? "—"}
      </TableCell>
      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={row.offer_name ?? ""}>
        {row.offer_name ?? "—"}
      </TableCell>
      <TableCell>
        <Badge variant={kindVariant(row.kind)} className="capitalize">
          {row.kind}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
      <TableCell className="text-right tabular-nums">{formatBRL(row.commission_value)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {row.net_value != null ? formatBRL(row.net_value) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {row.gross_value != null ? formatBRL(row.gross_value) : "—"}
      </TableCell>
      <TableCell className="max-w-[180px] truncate text-xs" title={`${row.buyer_name ?? ""} ${row.buyer_email ?? ""}`.trim()}>
        <div className="truncate">{row.buyer_name ?? "—"}</div>
        <div className="truncate text-muted-foreground">{row.buyer_email ?? ""}</div>
      </TableCell>
    </TableRow>
  );
}

function SummaryCards({
  totals,
  loading,
}: {
  totals:
    | {
        count: number;
        commission: number;
        gross: number;
        net: number;
        principal_qty: number;
        orderbump_qty: number;
      }
    | undefined;
  loading: boolean;
}) {
  const count = totals?.count ?? 0;
  const commission = totals?.commission ?? 0;
  const principalQty = totals?.principal_qty ?? 0;
  const orderbumpQty = totals?.orderbump_qty ?? 0;
  const sales = principalQty;
  const ticket = principalQty > 0 ? commission / principalQty : 0;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Vendas</div>
          <div className="text-2xl font-bold tabular-nums">
            {loading && count === 0 ? "—" : sales.toLocaleString("pt-BR")}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {count} registros - {orderbumpQty} orderbump
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Faturamento (comissão)</div>
          <div className="text-2xl font-bold tabular-nums">{formatBRL(commission)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Soma de commission_value (ignora TestWebhook)
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Ticket médio (Principal)</div>
          <div className="text-2xl font-bold tabular-nums">{formatBRL(ticket)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Faturamento ÷ vendas Principal
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatBRL(v: number) {

  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

function kindVariant(kind: string): "default" | "secondary" | "outline" {
  const k = kind.toLowerCase();
  if (k === "principal" || k === "main") return "default";
  if (k === "orderbump" || k === "bump") return "secondary";
  return "outline";
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  const s = status.toLowerCase();
  if (["pago", "aprovado", "paid", "approved", "complete", "completed"].includes(s))
    return "default";
  if (["pendente", "pending"].includes(s)) return "secondary";
  if (["recusado", "cancelado", "chargeback", "reembolsado", "refunded"].includes(s))
    return "destructive";
  return "outline";
}
