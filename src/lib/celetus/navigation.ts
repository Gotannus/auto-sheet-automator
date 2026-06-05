import { listMyCompanies } from "@/lib/celetus/companies.functions";
import { companyPath } from "@/lib/celetus/workspaces";

export async function routeAfterLogin(): Promise<string> {
  try {
    const companies = await listMyCompanies();
    if (companies.length === 0) return "/tannus";
    if (companies.length === 1) return companyPath(companies[0].slug, "dashboard");
    return "/tannus";
  } catch {
    return "/tannus";
  }
}
