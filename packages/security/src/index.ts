export function buildObjectKey(input: {
  tenantId: string;
  meetingId: string;
  extension: string;
  now?: Date;
}): string {
  const current = input.now ?? new Date();
  const year = current.getUTCFullYear().toString();
  const month = String(current.getUTCMonth() + 1).padStart(2, "0");
  return `${input.tenantId}/${year}/${month}/${input.meetingId}.${input.extension}`;
}

export function createSecurityHeaders(input?: { serverSideEncryption?: string }) {
  const headers: Record<string, string> = {};
  if (input?.serverSideEncryption) {
    headers["x-amz-server-side-encryption"] = input.serverSideEncryption;
  }
  return headers;
}
