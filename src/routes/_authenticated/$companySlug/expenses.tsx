import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { isValidSlug } from "@/lib/celetus/workspaces";
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  type ExpenseItem,
} from "@/lib/celetus/expenses.functions";

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

const CATEGORIES = [
  "Aluguel",
  "Salários",
  "Pro-labore",
  "Software",
  "Marketing",
  "Impostos",
  "Serviços",
  "Outros",
];

const expensesQO = (slug: string, year: number, month: number) =>
  queryOptions({
    queryKey: ["expenses", slug, year, month],
    queryFn: () => listExpenses({ data: { company_slug: slug, year, month } }),
  });

export const Route = createFileRoute("/_authenticated/$companySlug/expenses")({
  head: () => ({ meta: [{ title: "Despesas - Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  loader: ({ context, params }) => {
    const now = new Date();
    return context.queryClient.ensureQueryData(
      expensesQO(params.companySlug, now.getFullYear(), now.getMonth() + 1),
    );
  },
  component: ExpensesPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

function ExpensesPage() {
  const { companySlug } = Route.useParams();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data } = useSuspenseQuery(expensesQO(companySlug, year, month));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (item: ExpenseItem) => {
    setEditing(item);
    setDialogOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <header className="flex flex-col md:flex-row md:items-end gap-3 md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Despesas</h1>
          <p className="text-sm text-muted-foreground">
            {MONTHS[month - 1]} {year} — total entra no cálculo de lucro do dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Nova despesa
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Total do mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fmtBRL(data.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {data.items.length} {data.items.length === 1 ? "lançamento" : "lançamentos"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {data.by_category.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                Nenhuma despesa lançada neste mês.
              </div>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.by_category.map((c) => (
                  <li key={c.category} className="flex justify-between">
                    <span>{c.category}</span>
                    <span className="font-medium tabular-nums">{fmtBRL(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma despesa cadastrada. Clique em "Nova despesa" para começar.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((item) => (
                  <ExpenseRow
                    key={item.id}
                    item={item}
                    companySlug={companySlug}
                    year={year}
                    month={month}
                    onEdit={() => openEdit(item)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        companySlug={companySlug}
        year={year}
        month={month}
      />
    </div>
  );
}

function ExpenseRow({
  item,
  companySlug,
  year,
  month,
  onEdit,
}: {
  item: ExpenseItem;
  companySlug: string;
  year: number;
  month: number;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const remove = useServerFn(deleteExpense);
  const mut = useMutation({
    mutationFn: () => remove({ data: { company_slug: companySlug, id: item.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", companySlug, year, month] });
      qc.invalidateQueries({ queryKey: ["dash", companySlug] });
      toast.success("Despesa removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{dateLabel(item.date)}</TableCell>
      <TableCell className="font-medium">{item.description}</TableCell>
      <TableCell>
        <span className="inline-block px-2 py-0.5 rounded bg-muted text-xs">{item.category}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmtBRL(item.amount)}</TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
        {item.notes ?? "-"}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm(`Remover "${item.description}"?`)) mut.mutate();
          }}
          disabled={mut.isPending}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ExpenseDialog({
  open,
  onOpenChange,
  editing,
  companySlug,
  year,
  month,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ExpenseItem | null;
  companySlug: string;
  year: number;
  month: number;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createExpense);
  const update = useServerFn(updateExpense);

  const defaultDate = `${year}-${String(month).padStart(2, "0")}-${String(
    Math.min(new Date().getDate(), 28),
  ).padStart(2, "0")}`;

  const [date, setDate] = useState(defaultDate);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Outros");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date);
      setDescription(editing.description);
      setCategory(editing.category);
      setAmount(String(editing.amount));
      setNotes(editing.notes ?? "");
    } else {
      setDate(defaultDate);
      setDescription("");
      setCategory("Outros");
      setAmount("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const mut = useMutation({
    mutationFn: async () => {
      const amt = parsePtNumber(amount);
      if (!description.trim()) throw new Error("Descrição é obrigatória");
      if (amt <= 0) throw new Error("Valor precisa ser maior que zero");
      if (editing) {
        return update({
          data: {
            company_slug: companySlug,
            id: editing.id,
            date,
            description: description.trim(),
            category,
            amount: amt,
            notes: notes.trim() || null,
          },
        });
      }
      return create({
        data: {
          company_slug: companySlug,
          year,
          month,
          date,
          description: description.trim(),
          category,
          amount: amt,
          notes: notes.trim() || null,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", companySlug, year, month] });
      qc.invalidateQueries({ queryKey: ["dash", companySlug] });
      toast.success(editing ? "Despesa atualizada" : "Despesa adicionada");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar despesa" : "Nova despesa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              placeholder="Ex: Aluguel escritório"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {editing ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function dateLabel(date: string) {
  const [, mm, dd] = date.split("-");
  return `${dd}/${mm}`;
}

function parsePtNumber(value: string) {
  const normalized = value.trim().replace(/[^\d,.-]/g, "");
  if (!normalized) return 0;
  const parsed = Number(
    normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized,
  );
  return Number.isNaN(parsed) ? 0 : parsed;
}
