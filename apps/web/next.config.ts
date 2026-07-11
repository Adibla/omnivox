import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image small; the tracing root points at
  // the monorepo root so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
};

export default nextConfig;
