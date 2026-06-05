import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { importCeletusReport } from "@/lib/celetus/import.functions";
import { companyPath, isCompanySlug } from "@/lib/celetus/workspaces";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/$companySlug/import")({
  head: () => ({ meta: [{ title: "Importar planilha — Painel Celetus" }] }),
  beforeLoad: ({ params }) => {
    if (!isCompanySlug(params.companySlug)) {
      throw redirect({ to: companyPath("tannus-labs", "import"), replace: true });
    }
  },
  component: ImportPage,
});

type ImportResult = Awaited<ReturnType<typeof importCeletusReport>>;

function ImportPage() {
  const { companySlug } = Route.useParams();
  const qc = useQueryClient();
  const importFn = useServerFn(importCeletusReport);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const mutation = useMutation({
    mutationFn: async (f: File) => {
      const buf = await f.arrayBuffer();
      const file_b64 = arrayBufferToBase64(buf);
      return importFn({ data: { company_slug: companySlug, file_b64 } });
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Importar planilha Celetus</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Faça upload do relatório (.xlsx) exportado da Celetus. As vendas serão inseridas (ou
          atualizadas se já existirem) — usado para corrigir vendas que não chegaram via webhook.
        </p>
      </header>

      <Card>
        <CardContent className="p-6 space-y-4">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
          />
          <Button
            disabled={!file || mutation.isPending}
            onClick={() => file && mutation.mutate(file)}
          >
            {mutation.isPending ? "Importando…" : "Importar"}
          </Button>
          {mutation.isError && (
            <p className="text-sm text-destructive">
              Erro: {(mutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-6 space-y-2 text-sm">
            <h2 className="font-semibold text-base mb-2">Resumo</h2>
            <Row label="Linhas lidas" value={result.rows_read} />
            <Row label="Linhas processadas (upsert)" value={result.rows_upserted} />
            <Row label="Linhas ignoradas (indicação / sem id / tipo desconhecido)" value={result.rows_ignored} />
            <Row label="Vendas pagas no arquivo" value={result.paid_count} />
            <Row label="Produtos criados automaticamente" value={result.products_created} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b last:border-0 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
