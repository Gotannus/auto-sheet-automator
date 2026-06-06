import { createFileRoute, redirect } from "@tanstack/react-router";
import { listMyCompanies } from "@/lib/celetus/companies.functions";
import { companyPath } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const companies = await listMyCompanies();
      if (companies.length === 1) {
        throw redirect({ to: companyPath(companies[0].slug, "dashboard"), replace: true });
      }
    } catch {
      // ignore and fall through to /tannus
    }
    throw redirect({ to: "/tannus", replace: true });
  },
});
