import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Building2, ArrowRight } from "lucide-react";
import {
  listMyCompanies,
  createCompany,
  type CompanySummary,
} from "@/lib/celetus/companies.functions";
import { companyPath } from "@/lib/celetus/workspaces";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const companiesQO = queryOptions({
  queryKey: ["companies"],
  queryFn: () => listMyCompanies(),
});

export const Route = createFileRoute("/tannus")({
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(companiesQO),
  component: CompaniesPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-destructive">
      Erro ao carregar empresas: {error.message}
    </div>
  ),
});

function CompaniesPage() {
  const { data: companies } = useSuspenseQuery(companiesQO);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createCompany);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const createMut = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: (company: CompanySummary) => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success(`Empresa "${company.name}" criada`);
      setOpen(false);
      setName("");
      navigate({ to: companyPath(company.slug, "dashboard") });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Selecione uma empresa</h1>
            <p className="text-muted-foreground mt-1">
              Cada empresa tem seus próprios produtos, vendas e webhook.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar nova empresa</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <label className="text-sm font-medium">Nome da empresa</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Acme Labs"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => name.trim() && createMut.mutate(name.trim())}
                  disabled={!name.trim() || createMut.isPending}
                >
                  {createMut.isPending ? "Criando..." : "Criar empresa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {companies.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Você ainda não tem nenhuma empresa cadastrada.
              </p>
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar primeira empresa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {companies.map((c) => (
              <Link
                key={c.id}
                to={companyPath(c.slug, "dashboard")}
                className="block"
              >
                <Card className="hover:border-primary transition-colors h-full">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          /{c.slug}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
