import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Trash2, UserPlus, Crown } from "lucide-react";
import { getSettings, updateSettings } from "@/lib/celetus/settings.functions";
import {
  getCompanyBySlug,
  listCompanyMembers,
  addCompanyMember,
  removeCompanyMember,
} from "@/lib/celetus/companies.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { isValidSlug } from "@/lib/celetus/workspaces";


const settingsQO = (companySlug: string, year?: number, month?: number) =>
  queryOptions({
    queryKey: ["settings", companySlug, year ?? "current", month ?? "current"],
    queryFn: () => getSettings({ data: { company_slug: companySlug, year, month } }),
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

export const Route = createFileRoute("/_authenticated/$companySlug/settings")({
  head: () => ({ meta: [{ title: "Configuracoes - Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(settingsQO(params.companySlug)),
  component: SettingsPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

function SettingsPage() {
  const { companySlug } = Route.useParams();
  const company = { slug: companySlug };
  const { data: initialSettings } = useSuspenseQuery(settingsQO(company.slug));
  const qc = useQueryClient();
  const save = useServerFn(updateSettings);

  const [year, setYear] = useState(initialSettings.year);
  const [month, setMonth] = useState(initialSettings.month);
  const { data } = useSuspenseQuery(settingsQO(company.slug, year, month));
  const [taxPct, setTaxPct] = useState((Number(initialSettings.tax_rate) * 100).toFixed(2));
  const [revenueTaxPct, setRevenueTaxPct] = useState(
    (Number(initialSettings.revenue_tax_rate) * 100).toFixed(2),
  );
  const [monthlyExpenses, setMonthlyExpenses] = useState(
    Number(initialSettings.monthly_expenses ?? 0).toFixed(2),
  );
  const [companyCashPct, setCompanyCashPct] = useState(
    (Number(initialSettings.company_cash_rate ?? 0.1) * 100).toFixed(2),
  );
  const [partner1Name, setPartner1Name] = useState(initialSettings.partner_1_name ?? "Rodrigo");
  const [partner1Pct, setPartner1Pct] = useState(
    (Number(initialSettings.partner_1_rate ?? 0.35) * 100).toFixed(2),
  );
  const [partner2Name, setPartner2Name] = useState(initialSettings.partner_2_name ?? "Marcos");
  const [partner2Pct, setPartner2Pct] = useState(
    (Number(initialSettings.partner_2_rate ?? 0.65) * 100).toFixed(2),
  );

  useEffect(() => {
    setYear(data.year);
    setMonth(data.month);
    setTaxPct((Number(data.tax_rate) * 100).toFixed(2));
    setRevenueTaxPct((Number(data.revenue_tax_rate) * 100).toFixed(2));
    setMonthlyExpenses(Number(data.monthly_expenses ?? 0).toFixed(2));
    setCompanyCashPct((Number(data.company_cash_rate ?? 0.1) * 100).toFixed(2));
    setPartner1Name(data.partner_1_name ?? "Rodrigo");
    setPartner1Pct((Number(data.partner_1_rate ?? 0.35) * 100).toFixed(2));
    setPartner2Name(data.partner_2_name ?? "Marcos");
    setPartner2Pct((Number(data.partner_2_rate ?? 0.65) * 100).toFixed(2));
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          company_slug: company.slug,
          year,
          month,
          tax_rate: parsePtNumber(taxPct) / 100,
          revenue_tax_rate: parsePtNumber(revenueTaxPct) / 100,
          monthly_expenses: parsePtNumber(monthlyExpenses),
          company_cash_rate: parsePtNumber(companyCashPct) / 100,
          partner_1_name: partner1Name,
          partner_1_rate: parsePtNumber(partner1Pct) / 100,
          partner_2_name: partner2Name,
          partner_2_rate: parsePtNumber(partner2Pct) / 100,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", company.slug] });
      qc.invalidateQueries({ queryKey: ["dash", company.slug] });
      toast.success("Configuracoes salvas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <header>
        <h1 className="text-2xl font-bold">Configuracoes</h1>
        <p className="text-sm text-muted-foreground">
          Mesmas opcoes da aba CONFIG da planilha original.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Geral</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="month">Mes</Label>
              <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
                <SelectTrigger id="month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((monthName, index) => (
                    <SelectItem key={monthName} value={String(index + 1)}>
                      {monthName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="year">Ano</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax">Taxa sobre investimento (%)</Label>
            <Input id="tax" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Aplicada como Invest. Final = Invest. Manual x (1 + taxa). Use 0 se o investimento ja
              vier com imposto.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="revenue-tax">Imposto sobre faturamento do mes (%)</Label>
            <Input
              id="revenue-tax"
              value={revenueTaxPct}
              onChange={(e) => setRevenueTaxPct(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Aplicado como Imposto = Faturamento do mes x taxa. Esse valor entra no lucro do
              dashboard.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="monthly-expenses">Despesas do mes (R$)</Label>
              <Input
                id="monthly-expenses"
                value={monthlyExpenses}
                onChange={(e) => setMonthlyExpenses(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-cash">Caixa Empresa (%)</Label>
              <Input
                id="company-cash"
                value={companyCashPct}
                onChange={(e) => setCompanyCashPct(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Socios</div>
              <p className="text-xs text-muted-foreground">
                Primeiro o sistema desconta despesas e caixa da empresa; depois divide o restante
                pelos percentuais abaixo.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_120px]">
              <div className="space-y-1.5">
                <Label htmlFor="partner-1-name">Socio 1</Label>
                <Input
                  id="partner-1-name"
                  value={partner1Name}
                  onChange={(e) => setPartner1Name(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="partner-1-pct">Percentual (%)</Label>
                <Input
                  id="partner-1-pct"
                  value={partner1Pct}
                  onChange={(e) => setPartner1Pct(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="partner-2-name">Socio 2</Label>
                <Input
                  id="partner-2-name"
                  value={partner2Name}
                  onChange={(e) => setPartner2Name(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="partner-2-pct">Percentual (%)</Label>
                <Input
                  id="partner-2-pct"
                  value={partner2Pct}
                  onChange={(e) => setPartner2Pct(e.target.value)}
                />
              </div>
            </div>
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            Salvar
          </Button>
        </CardContent>
      </Card>
      <MembersCard companySlug={company.slug} />
    </div>
  );
}

function MembersCard({ companySlug }: { companySlug: string }) {
  const qc = useQueryClient();
  const add = useServerFn(addCompanyMember);
  const remove = useServerFn(removeCompanyMember);
  const [email, setEmail] = useState("");

  // Probe ownership — only show this card when the current user is the owner.
  const { data: company, isLoading: loadingCompany } = useQuery({
    queryKey: ["company-current", companySlug],
    queryFn: () => getCompanyBySlug({ data: { slug: companySlug } }),
  });

  const { data: members, isLoading } = useQuery({
    queryKey: ["company-members", companySlug],
    queryFn: () => listCompanyMembers({ data: { company_slug: companySlug } }),
    enabled: !!company?.is_owner,
  });

  const addMut = useMutation({
    mutationFn: (e: string) => add({ data: { company_slug: companySlug, email: e } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-members", companySlug] });
      setEmail("");
      toast.success("Sócio adicionado");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rmMut = useMutation({
    mutationFn: (memberId: string) =>
      remove({ data: { company_slug: companySlug, member_id: memberId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-members", companySlug] });
      toast.success("Sócio removido");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (loadingCompany) return null;
  if (!company?.is_owner) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-primary" /> Sócios desta empresa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Cada sócio precisa ter conta criada com o e-mail abaixo. Ao adicionar, ele
          passa a ver os mesmos dados desta empresa, sem acesso às outras.
        </p>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="email@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && email.trim()) addMut.mutate(email.trim());
            }}
          />
          <Button
            onClick={() => email.trim() && addMut.mutate(email.trim())}
            disabled={!email.trim() || addMut.isPending}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando sócios...</div>
        ) : !members || members.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">
            Nenhum sócio adicionado. Só você tem acesso a esta empresa.
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.email ?? "(e-mail desconhecido)"}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.role}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => rmMut.mutate(m.id)}
                  disabled={rmMut.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function parsePtNumber(value: string) {
  const normalized = value.trim().replace(/[^\d,.-]/g, "");
  if (!normalized) return 0;
  const parsed = Number(
    normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized,
  );

  return Number.isNaN(parsed) ? 0 : parsed;
}

