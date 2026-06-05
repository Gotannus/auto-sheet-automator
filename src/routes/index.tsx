import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { listMyCompanies } from "@/lib/celetus/companies.functions";
import { companyPath } from "@/lib/celetus/workspaces";

async function routeAfterLogin(): Promise<string> {
  try {
    const companies = await listMyCompanies();
    if (companies.length === 0) return "/tannus";
    if (companies.length === 1) return companyPath(companies[0].slug, "dashboard");
    return "/tannus";
  } catch {
    return "/tannus";
  }
}

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const to = await routeAfterLogin();
    throw redirect({ to, replace: true });
  },
});
