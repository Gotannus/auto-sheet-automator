import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Package, Settings as SettingsIcon, Webhook, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const router = useRouter();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 border-r bg-card hidden md:flex flex-col">
        <div className="p-4 border-b">
          <div className="font-bold text-lg">Painel Celetus</div>
          <div className="text-xs text-muted-foreground">por produto · mensal</div>
        </div>
        <nav className="flex-1 p-2 space-y-1 text-sm">
          <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
            Dashboard
          </NavItem>
          <NavItem to="/products" icon={<Package className="h-4 w-4" />}>
            Produtos
          </NavItem>
          <NavItem to="/webhook" icon={<Webhook className="h-4 w-4" />}>
            Webhook
          </NavItem>
          <NavItem to="/settings" icon={<SettingsIcon className="h-4 w-4" />}>
            Configurações
          </NavItem>
        </nav>
        <div className="p-2 border-t">
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
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
