import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  type Product,
} from "@/lib/celetus/products.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { companyPath, isCompanySlug, resolveCompany } from "@/lib/celetus/workspaces";

const productsQO = (companySlug: string) =>
  queryOptions({
    queryKey: ["products", companySlug],
    queryFn: () => listProducts({ data: { company_slug: companySlug } }),
  });

export const Route = createFileRoute("/_authenticated/$companySlug/products")({
  head: () => ({ meta: [{ title: "Produtos â€” Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isCompanySlug(params.companySlug)) {
      throw redirect({ to: companyPath("tannus-labs", "products"), replace: true });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(productsQO(params.companySlug)),
  component: ProductsPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

function ProductsPage() {
  const { companySlug } = Route.useParams();
  const company = resolveCompany(companySlug);
  const { data: products } = useSuspenseQuery(productsQO(company.slug));
  const qc = useQueryClient();
  const create = useServerFn(createProduct);
  const update = useServerFn(updateProduct);
  const del = useServerFn(deleteProduct);

  const createMut = useMutation({
    mutationFn: (v: { name: string; src: string }) =>
      create({ data: { ...v, company_slug: company.slug } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", company.slug] });
      toast.success("Produto cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; name: string; src: string }) =>
      update({ data: { ...v, company_slug: company.slug } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", company.slug] });
      toast.success("Produto atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id, company_slug: company.slug } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", company.slug] });
      toast.success("Produto removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Cada produto Ã© identificado pelo SRC que vem no webhook da Celetus. Produtos sem SRC
            podem ser corrigidos depois.
          </p>
        </div>
        <ProductDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Novo produto
            </Button>
          }
          title="Novo produto"
          onSubmit={(v) => createMut.mutateAsync(v)}
        />
      </header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>SRC</TableHead>
                <TableHead className="w-32 text-right">AÃ§Ãµes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Nenhum produto. Crie o primeiro acima.
                  </TableCell>
                </TableRow>
              )}
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.src}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <ProductDialog
                      trigger={
                        <Button size="icon" variant="ghost">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                      title="Editar produto"
                      initial={{ name: p.name, src: p.src }}
                      onSubmit={(v) => updateMut.mutateAsync({ id: p.id, ...v })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Remover este produto e todas as vendas vinculadas?")) {
                          delMut.mutate(p.id);
                        }
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
    </div>
  );
}

function ProductDialog({
  trigger,
  title,
  initial,
  onSubmit,
}: {
  trigger: React.ReactNode;
  title: string;
  initial?: { name: string; src: string };
  onSubmit: (v: { name: string; src: string }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [src, setSrc] = useState(initial?.src ?? "");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setName(initial?.name ?? "");
          setSrc(initial?.src ?? "");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pname">Nome</Label>
            <Input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: O Peso da Cama Feita"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="psrc">SRC do produto na Celetus</Label>
            <Input
              id="psrc"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              placeholder="palavras-tentacao"
            />
            <p className="text-xs text-muted-foreground">
              Campo <code>trackingParameters.src</code> que vem em cada venda da Celetus. Se o
              produto foi criado automaticamente, substitua o identificador temporÃ¡rio pelo SRC
              correto.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              if (!name.trim() || !src.trim()) return;
              await onSubmit({ name: name.trim(), src: src.trim() });
              setOpen(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
