/**
 * Extracts context tenant slug from request (query param or header).
 * Used for Caso 3: Registro automático en Tenant específico vía URL/Contexto.
 */
export function getContextTenantSlug(req: {
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const fromQuery = req.query?.tenantSlug;
  const value =
    typeof fromQuery === 'string' ? fromQuery : Array.isArray(fromQuery) ? fromQuery[0] : undefined;
  const fromHeader = req.headers?.['x-tenant-slug'];
  const headerVal =
    typeof fromHeader === 'string'
      ? fromHeader
      : Array.isArray(fromHeader)
        ? fromHeader[0]
        : undefined;
  return (value ?? headerVal)?.trim() || undefined;
}
