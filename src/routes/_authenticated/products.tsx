import { createFileRoute, redirect } from "@tanstack/react-router";
import { companyPath, DEFAULT_COMPANY_SLUG } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/_authenticated/products")({
  beforeLoad: () => {
    throw redirect({ to: companyPath(DEFAULT_COMPANY_SLUG, "products"), replace: true });
  },
});
