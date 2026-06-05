export const COMPANIES = [
  {
    slug: "tannus-labs",
    name: "Tannus Labs",
    userId: "00000000-0000-4000-8000-000000000001",
  },
  {
    slug: "cecilia-labs",
    name: "Cecilia Labs",
    userId: "00000000-0000-4000-8000-000000000002",
  },
] as const;

export type CompanySlug = (typeof COMPANIES)[number]["slug"];

export const DEFAULT_COMPANY_SLUG: CompanySlug = "tannus-labs";

export function getCompany(slug: string | null | undefined) {
  return COMPANIES.find((company) => company.slug === slug) ?? null;
}

export function isCompanySlug(slug: string | null | undefined): slug is CompanySlug {
  return Boolean(getCompany(slug));
}

export function resolveCompany(slug: string | null | undefined) {
  return getCompany(slug) ?? COMPANIES[0];
}

export function getCompanyFromPath(pathname: string) {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return resolveCompany(firstSegment);
}

export function companyPath(slug: string | null | undefined, page: string) {
  const company = resolveCompany(slug);
  const cleanPage = page.replace(/^\/+/, "");
  return `/${company.slug}/${cleanPage}`;
}
