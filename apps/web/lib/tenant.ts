import { getEnv } from "./env";

const TENANT_HEADER = "x-tenant-id";

function isValidTenantId(value: string) {
  return /^[a-z0-9-]+$/.test(value) && value.length >= 3 && value.length <= 64;
}

export function resolveTenantId(request: Request) {
  const fromHeader = request.headers.get(TENANT_HEADER)?.trim();
  if (fromHeader && isValidTenantId(fromHeader)) {
    return fromHeader;
  }
  return getEnv().DEFAULT_TENANT_ID;
}
