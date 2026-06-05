import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getSettings, updateSettings } from "@/lib/celetus/settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { companyPath, isCompanySlug, resolveCompany } from "@/lib/celetus/workspaces";

const settingsQO = (companySlug: string) =>
  queryOptions({
    queryKey: ["settings", companySlug],
    queryFn: () => getSettings({ data: { company_slug: companySlug } }),
  });

export const Route = createFileRoute("/_authenticated/$companySlug/settings")({
  head: () => ({ meta: [{ title: "ConfiguraÃ§Ãµes â€” Painel Celetus" }] }),
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
  const { data } = useSuspenseQuery(settingsQO(company.slug));
  const qc = useQueryClient();
  const save = useServerFn(updateSettings);

  const [year, setYear] = useState(data.year);
  const [taxPct, setTaxPct] = useState((Number(data.tax_rate) * 100).toFixed(2));

  useEffect(() => {
    setYear(data.year);
    setTaxPct((Number(data.tax_rate) * 100).toFixed(2));
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          company_slug: company.slug,
          year,
          tax_rate: Number(taxPct.replace(",", ".")) / 100,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", company.slug] });
      qc.invalidateQueries({ queryKey: ["dash", company.slug] });
      toast.success("ConfiguraÃ§Ãµes salvas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-xl">
      <header>
        <h1 className="text-2xl font-bold">ConfiguraÃ§Ãµes</h1>
        <p className="text-sm text-muted-foreground">
          Mesmas opÃ§Ãµes da aba CONFIG da planilha original.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Geral</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="year">Ano</Label>
            <Input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax">Taxa sobre investimento (%)</Label>
            <Input id="tax" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Aplicada como Invest. Final = Invest. Manual Ã— (1 + taxa). Use 0 se o investimento jÃ¡
              vier com imposto.
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
