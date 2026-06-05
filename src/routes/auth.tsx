import { createFileRoute, redirect } from "@tanstack/react-router";
import { companyPath, DEFAULT_COMPANY_SLUG } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: companyPath(DEFAULT_COMPANY_SLUG, "dashboard"), replace: true });
  },
});
