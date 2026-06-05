import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getDashboard } from "@/lib/celetus/dashboard.functions";
import { addMonthlyExpense, deleteMonthlyExpense } from "@/lib/celetus/settings.functions";
import { isValidSlug } from "@/lib/celetus/workspaces";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PlusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/$companySlug/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro - Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  component: FinancialPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
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

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

function FinancialPage() {
  const { companySlug } = Route.useParams();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Geral");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const queryClient = useQueryClient();

  const fetchDashboard = useServerFn(getDashboard);
  const addExpense = useServerFn(addMonthlyExpense);
  const removeExpense = useServerFn(deleteMonthlyExpense);

  const queryKey = useMemo(
    () => ["financial-report", companySlug, year, month],
    [companySlug, year, month],
  );

  const reportQuery = useQuery({
    queryKey,
    queryFn: () =>
      fetchDashboard({
        data: {
          company_slug: companySlug,
          year,
          month,
        },
      }),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      addExpense({
        data: {
          company_slug: companySlug,
          year,
          month,
          description: description.trim(),
          category: category.trim() || "Geral",
          amount: Number(amount.replace(",", ".")),
          expense_date: expenseDate || null,
        },
      }),
    onSuccess: () => {
      setDescription("");
      setCategory("Geral");
      setAmount("");
      setExpenseDate("");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["dash", companySlug] });
      toast.success("Despesa adicionada");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeExpense({ data: { company_slug: companySlug, id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["dash", companySlug] });
      toast.success("Despesa removida");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = reportQuery.data as DashboardData | undefined;
  const totals = data?.totals;
  const expenses = data?.expenses ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatorio financeiro</h1>
          <p className="text-sm text-muted-foreground">
            {MONTHS[month - 1]} {year}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, index) => (
                <SelectItem key={name} value={String(index + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((item) => (
                <SelectItem key={item} value={String(item)}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="Faturamento" value={brl(totals?.revenue)} />
        <Metric label="Investimento" value={brl(totals?.invest_final)} />
        <Metric label="Imposto" value={brl(totals?.revenue_tax)} />
        <Metric label="Despesas" value={brl(totals?.monthly_expenses)} />
        <Metric label="Lucro liquido" value={brl(totals?.net_profit)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Despesas do mes</h2>
                <p className="text-sm text-muted-foreground">
                  Total lancado: {brl(totals?.monthly_expenses)}
                </p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descricao</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {!reportQuery.isLoading && expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhuma despesa cadastrada para este mes.
                    </TableCell>
                  </TableRow>
                )}
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">{expense.description}</TableCell>
                    <TableCell>{expense.category}</TableCell>
                    <TableCell>{formatDate(expense.expense_date)}</TableCell>
                    <TableCell className="text-right">{brl(expense.amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm("Remover esta despesa?")) deleteMutation.mutate(expense.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <h2 className="font-semibold">Adicionar despesa</h2>
              <p className="text-sm text-muted-foreground">
                O lancamento fica salvo somente no mes selecionado.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="expense-description">Descricao</Label>
                <Input
                  id="expense-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ex: ferramenta, saque, freelancer"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="expense-category">Categoria</Label>
                  <Input
                    id="expense-category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-amount">Valor</Label>
                  <Input
                    id="expense-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-date">Data</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={expenseDate}
                  onChange={(event) => setExpenseDate(event.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={
                  !description.trim() ||
                  Number(amount.replace(",", ".")) <= 0 ||
                  addMutation.isPending
                }
                onClick={() => addMutation.mutate()}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Adicionar despesa
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3">Fechamento do mes</h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 text-sm">
            <Line label="Lucro antes das despesas" value={brl(totals?.profit_before_expenses)} />
            <Line label="Caixa empresa" value={brl(totals?.company_cash)} />
            <Line
              label={`${totals?.partner_1_name ?? "Socio 1"} (${percent(totals?.partner_1_rate)})`}
              value={brl(totals?.partner_1_amount)}
            />
            <Line
              label={`${totals?.partner_2_name ?? "Socio 2"} (${percent(totals?.partner_2_rate)})`}
              value={brl(totals?.partner_2_amount)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-lg font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function brl(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function percent(value: unknown) {
  return `${(Number(value ?? 0) * 100).toFixed(0)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
