import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductActive,
  type Product,
} from "@/lib/celetus/products.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Trash2, Pencil, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { isValidSlug } from "@/lib/celetus/workspaces";

const productsQO = (companySlug: string) =>
  queryOptions({
    queryKey: ["products", companySlug],
    queryFn: () => listProducts({ data: { company_slug: companySlug } }),
  });

export const Route = createFileRoute("/_authenticated/$companySlug/products")({
  head: () => ({ meta: [{ title: "Produtos — Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/tannus", replace: true });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(productsQO(params.companySlug)),
  component: ProductsPage,
  errorComponent: ({ error }) => <div className="p-6">Erro: {error.message}</div>,
});

type Filter = "active" | "inactive" | "all";

function ProductsPage() {
  const { companySlug } = Route.useParams();
  const { data: products } = useSuspenseQuery(productsQO(companySlug));
  const qc = useQueryClient();
  const create = useServerFn(createProduct);
  const update = useServerFn(updateProduct);
  const del = useServerFn(deleteProduct);
  const toggle = useServerFn(setProductActive);

  const [filter, setFilter] = useState<Filter>("active");

  const filtered = useMemo(() => {
    if (filter === "all") return products;
    if (filter === "active") return products.filter((p) => p.is_active);
    return products.filter((p) => !p.is_active);
  }, [products, filter]);

  const counts = useMemo(
    () => ({
      all: products.length,
      active: products.filter((p) => p.is_active).length,
      inactive: products.filter((p) => !p.is_active).length,
    }),
    [products],
  );

  const createMut = useMutation({
    mutationFn: (v: { name: string; src: string; display_name: string | null }) =>
      create({ data: { name: v.name, src: v.src, company_slug: companySlug } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", companySlug] });
      toast.success("Produto cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; name: string; src: string; display_name: string | null }) =>
      update({ data: { ...v, company_slug: companySlug } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", companySlug] });
      toast.success("Produto atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id, company_slug: companySlug } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", companySlug] });
      toast.success("Produto removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleMut = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) =>
      toggle({ data: { ...v, company_slug: companySlug } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["products", companySlug] });
      const prev = qc.getQueryData<Product[]>(["products", companySlug]);
      qc.setQueryData<Product[]>(["products", companySlug], (arr) =>
        (arr ?? []).map((p) => (p.id === v.id ? { ...p, is_active: v.is_active } : p)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["products", companySlug], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["products", companySlug] }),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Marque como <b>ativo</b> apenas os produtos que estão rodando este mês. Só os ativos
            aparecem na Projeção e no menu.
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

      <div className="flex items-center gap-1 text-sm">
        {(["active", "inactive", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md border transition ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-accent"
            }`}
          >
            {f === "active" ? "Ativos" : f === "inactive" ? "Inativos" : "Todos"}
            <span className="ml-1.5 opacity-70 text-xs">({counts[f]})</span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Ativo</TableHead>
                <TableHead>Nome visível</TableHead>
                <TableHead>Nome interno</TableHead>
                <TableHead>SRC</TableHead>
                <TableHead className="w-40 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum produto neste filtro.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((p: Product) => (
                <TableRow key={p.id} className={p.is_active ? "" : "opacity-60"}>
                  <TableCell>
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={(v) =>
                        toggleMut.mutate({ id: p.id, is_active: v })
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      to="/_authenticated/$companySlug/produto/$productId"
                      params={{ companySlug, productId: p.id }}
                      className="inline-flex items-center gap-1.5 hover:text-primary transition"
                    >
                      {p.display_name || (
                        <span className="text-muted-foreground">{p.name}</span>
                      )}
                      <ArrowRight className="h-3.5 w-3.5 opacity-60" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.src}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <ProductDialog
                      trigger={
                        <Button size="icon" variant="ghost">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                      title="Editar produto"
                      initial={{
                        name: p.name,
                        src: p.src,
                        display_name: p.display_name ?? "",
                      }}
                      onSubmit={(v) => updateMut.mutateAsync({ id: p.id, ...v })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (
                          confirm(
                            "Remover este produto e todas as vendas vinculadas?",
                          )
                        ) {
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
  initial?: { name: string; src: string; display_name?: string };
  onSubmit: (v: { name: string; src: string; display_name: string | null }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [src, setSrc] = useState(initial?.src ?? "");
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setName(initial?.name ?? "");
          setSrc(initial?.src ?? "");
          setDisplayName(initial?.display_name ?? "");
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
            <Label htmlFor="pdisplay">Nome visível</Label>
            <Input
              id="pdisplay"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Opcional — usado em todas as telas"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pname">Nome interno (Celetus)</Label>
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
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              if (!name.trim() || !src.trim()) return;
              await onSubmit({
                name: name.trim(),
                src: src.trim(),
                display_name: displayName.trim() ? displayName.trim() : null,
              });
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
