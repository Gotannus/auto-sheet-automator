import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Package,
  Receipt,
  Settings as SettingsIcon,
  Upload,
  Webhook,
  Activity,
  Building2,
  Wallet,
  Zap,
} from "lucide-react";

import {
  companyPath,
  getCompanySlugFromPath,
} from "@/lib/celetus/workspaces";
import { getCompanyBySlug } from "@/lib/celetus/companies.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const slug = getCompanySlugFromPath(pathname);

  const { data: company } = useQuery({
    queryKey: ["company-current", slug],
    queryFn: () => (slug ? getCompanyBySlug({ data: { slug } }) : null),
    enabled: !!slug,
  });

  const displayName = company?.name ?? slug ?? "Empresa";

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 border-r bg-card hidden md:flex flex-col">
        <div className="p-4 border-b">
          <div className="font-bold text-lg">Painel Celetus</div>
          <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-md bg-muted">
            <Building2 className="h-4 w-4 text-primary shrink-0" />
            <div className="text-sm font-medium truncate flex-1">{displayName}</div>
          </div>
        </div>
        {slug ? (
          <nav className="flex-1 p-2 space-y-1 text-sm">
            <NavItem to={companyPath(slug, "dashboard")} icon={<LayoutDashboard className="h-4 w-4" />}>
              Dashboard
            </NavItem>
            <NavItem to={companyPath(slug, "sales")} icon={<Receipt className="h-4 w-4" />}>
              Vendas
            </NavItem>
            <NavItem to={companyPath(slug, "products")} icon={<Package className="h-4 w-4" />}>
              Produtos
            </NavItem>
            <NavItem to={companyPath(slug, "expenses")} icon={<Wallet className="h-4 w-4" />}>
              Despesas
            </NavItem>
            <NavItem to={companyPath(slug, "webhook")} icon={<Webhook className="h-4 w-4" />}>
              Webhook
            </NavItem>
            <NavItem to={companyPath(slug, "webhook-logs")} icon={<Activity className="h-4 w-4" />}>
              Webhook logs
            </NavItem>
            <NavItem to={companyPath(slug, "import")} icon={<Upload className="h-4 w-4" />}>
              Importar planilha
            </NavItem>
            <NavItem to={companyPath(slug, "settings")} icon={<SettingsIcon className="h-4 w-4" />}>
              Configurações
            </NavItem>
          </nav>
        ) : (
          <div className="flex-1" />
        )}
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent text-foreground/80 data-[status=active]:bg-accent data-[status=active]:text-foreground"
      activeProps={{ "data-status": "active" } as never}
    >
      {icon}
      {children}
    </Link>
  );
}
