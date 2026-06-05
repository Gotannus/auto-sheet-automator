import { createFileRoute, redirect } from "@tanstack/react-router";
import { companyPath, isValidSlug } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/_authenticated/$companySlug/")({
  beforeLoad: ({ params }) => {
    if (!isValidSlug(params.companySlug)) {
      throw redirect({ to: "/companies", replace: true });
    }

    throw redirect({ to: companyPath(params.companySlug, "dashboard"), replace: true });
  },
});
