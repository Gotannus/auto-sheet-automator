import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  createProductJob,
  PRODUCT_TYPES,
  type ProductJobStatus,
} from "@/lib/celetus/product-jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const STATUS_LABEL: Record<ProductJobStatus, string> = {
  na_fila: "Na fila",
  criando: "Hermes criando",
  aguardando_cadastro: "Aguardando cadastro",
  cadastrado: "Cadastrado",
  erro: "Erro",
};

const STATUS_CLASS: Record<ProductJobStatus, string> = {
  na_fila: "bg-muted text-muted-foreground border-border",
  criando: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  aguardando_cadastro: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  cadastrado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  erro: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
};

export function JobStatusBadge({ status }: { status: ProductJobStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
        STATUS_CLASS[status] ?? STATUS_CLASS.na_fila
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function CreateProductJobDialog({ companySlug }: { companySlug: string }) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<string>(PRODUCT_TYPES[0]);
  const [tema, setTema] = useState("");
  const [publico, setPublico] = useState("");
  const [precoAlvo, setPrecoAlvo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [temaError, setTemaError] = useState("");
  const create = useServerFn(createProductJob);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          company_slug: companySlug,
          tipo,
          tema: tema.trim(),
          publico: publico.trim() || undefined,
          preco_alvo: precoAlvo.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["products", companySlug] });
      qc.invalidateQueries({ queryKey: ["product-jobs", companySlug] });
      toast.success(`Pedido enviado para o Hermes · SRC ${res.src}`);
      setOpen(false);
      navigate({
        to: "/$companySlug/pedido/$jobId",
        params: { companySlug, jobId: res.id },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setTipo(PRODUCT_TYPES[0]);
          setTema("");
          setPublico("");
          setPrecoAlvo("");
          setObservacoes("");
          setTemaError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="h-4 w-4 mr-1" /> Criar produto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar produto com o Hermes</DialogTitle>
          <DialogDescription>
            O SRC é gerado agora e o produto já entra fixado no mês, pronto para receber vendas e
            investimento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job-tema">Tema</Label>
            <Input
              id="job-tema"
              value={tema}
              onChange={(e) => {
                setTema(e.target.value);
                if (temaError) setTemaError("");
              }}
              placeholder="Kit Natal com 12 enfeites de feltro"
            />
            {temaError && <p className="text-xs text-destructive">{temaError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job-publico">Público</Label>
            <Input
              id="job-publico"
              value={publico}
              onChange={(e) => setPublico(e.target.value)}
              placeholder="Mães artesãs iniciantes"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job-preco">Preço alvo</Label>
            <Input
              id="job-preco"
              value={precoAlvo}
              onChange={(e) => setPrecoAlvo(e.target.value)}
              placeholder="19,90 a 27,90"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job-obs">Observações</Label>
            <Textarea
              id="job-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Referências, order bumps que quer, o que evitar…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={mut.isPending}
            onClick={() => {
              if (tema.trim().length < 2) {
                setTemaError("Escreva o tema do produto");
                return;
              }
              mut.mutate();
            }}
          >
            {mut.isPending ? "Enviando…" : "Enviar para o Hermes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
