export function buildQueueJobId(parts: Array<string>) {
  return parts.join("__");
}
