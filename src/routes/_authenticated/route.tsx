import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, Package, Settings as SettingsIcon, Webhook } from "lucide-react";
import { companyPath, getCompanyFromPath } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const company =
    typeof window === "undefined"
      ? getCompanyFromPath("/")
      : getCompanyFromPath(window.location.pathname);

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 border-r bg-card hidden md:flex flex-col">
        <div className="p-4 border-b">
          <div className="font-bold text-lg">Painel Celetus</div>
          <div className="text-xs text-muted-foreground">por produto Â· mensal</div>
        </div>
        <nav className="flex-1 p-2 space-y-1 text-sm">
          <NavItem
            to={companyPath(company.slug, "dashboard")}
            icon={<LayoutDashboard className="h-4 w-4" />}
          >
            Dashboard
          </NavItem>
          <NavItem
            to={companyPath(company.slug, "products")}
            icon={<Package className="h-4 w-4" />}
          >
            Produtos
          </NavItem>
          <NavItem to={companyPath(company.slug, "webhook")} icon={<Webhook className="h-4 w-4" />}>
            Webhook
          </NavItem>
          <NavItem
            to={companyPath(company.slug, "settings")}
            icon={<SettingsIcon className="h-4 w-4" />}
          >
            ConfiguraÃ§Ãµes
          </NavItem>
        </nav>
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
