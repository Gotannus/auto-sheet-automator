import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { listMyCompanies } from "@/lib/celetus/companies.functions";
import { companyPath } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    let target = "/tannus";
    try {
      const companies = await listMyCompanies();
      if (companies.length === 1) {
        target = companyPath(companies[0].slug, "dashboard");
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
    throw redirect({ to: target, replace: true });
  },
});
