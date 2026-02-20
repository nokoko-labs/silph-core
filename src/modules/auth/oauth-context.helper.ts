/**
 * Extracts context tenant slug from request (query param `slug` or `tenantSlug`, or header).
 * Used for OAuth direct-tenant login: slug is passed via state from init to callback.
 */
export function getContextTenantSlug(req: {
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const fromSlug = req.query?.slug;
  const slugVal =
    typeof fromSlug === 'string' ? fromSlug : Array.isArray(fromSlug) ? fromSlug[0] : undefined;
  const fromTenantSlug = req.query?.tenantSlug;
  const tenantSlugVal =
    typeof fromTenantSlug === 'string'
      ? fromTenantSlug
      : Array.isArray(fromTenantSlug)
        ? fromTenantSlug[0]
        : undefined;
  const fromHeader = req.headers?.['x-tenant-slug'];
  const headerVal =
    typeof fromHeader === 'string'
      ? fromHeader
      : Array.isArray(fromHeader)
        ? fromHeader[0]
        : undefined;
  return (slugVal ?? tenantSlugVal ?? headerVal)?.trim() || undefined;
}
