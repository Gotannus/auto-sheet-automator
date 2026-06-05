import { createFileRoute, redirect } from "@tanstack/react-router";
import { companyPath, isCompanySlug } from "@/lib/celetus/workspaces";

export const Route = createFileRoute("/_authenticated/$companySlug/")({
  beforeLoad: ({ params }) => {
    if (!isCompanySlug(params.companySlug)) {
      throw redirect({ to: companyPath("tannus-labs", "dashboard"), replace: true });
    }

    throw redirect({ to: companyPath(params.companySlug, "dashboard"), replace: true });
  },
});
