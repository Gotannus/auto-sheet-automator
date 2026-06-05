// Helpers for company workspace URLs. Companies themselves live in the
// `companies` table and are loaded dynamically per user.

export const TEMPORARY_PUBLIC_USER_ID =
  "00000000-0000-4000-8000-000000000001";

export function slugifyName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "empresa"
  );
}

export function companyPath(slug: string, page: string): string {
  const cleanPage = page.replace(/^\/+/, "");
  return `/${slug}/${cleanPage}`;
}

export function isValidSlug(slug: string | null | undefined): slug is string {
  return typeof slug === "string" && /^[a-z0-9][a-z0-9-]{0,60}$/.test(slug);
}

export function getCompanySlugFromPath(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  return isValidSlug(seg) ? seg : null;
}
