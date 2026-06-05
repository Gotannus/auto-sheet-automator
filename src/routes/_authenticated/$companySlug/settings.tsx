import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getSettings, updateSettings } from "@/lib/celetus/settings.functions";
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
import { companyPath, isCompanySlug, resolveCompany } from "@/lib/celetus/workspaces";

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
    if (!isCompanySlug(params.companySlug)) {
      throw redirect({ to: companyPath("tannus-labs", "settings"), replace: true });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(settingsQO(params.companySlug)),
  component: SettingsPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

function SettingsPage() {
  const { companySlug } = Route.useParams();
  const company = resolveCompany(companySlug);
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

  useEffect(() => {
    setYear(data.year);
    setMonth(data.month);
    setTaxPct((Number(data.tax_rate) * 100).toFixed(2));
    setRevenueTaxPct((Number(data.revenue_tax_rate) * 100).toFixed(2));
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          company_slug: company.slug,
          year,
          month,
          tax_rate: Number(taxPct.replace(",", ".")) / 100,
          revenue_tax_rate: Number(revenueTaxPct.replace(",", ".")) / 100,
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
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            Salvar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
