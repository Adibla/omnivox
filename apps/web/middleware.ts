import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const correlationId = request.headers.get("x-correlation-id") ?? crypto.randomUUID();
  response.headers.set("x-correlation-id", correlationId);
  const isDev = process.env.NODE_ENV !== "production";
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "microphone=(self), camera=()");
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  const storageSrc = "http: https:";
  const connectSrc = isDev
    ? `'self' ws: wss: https://api.openai.com ${storageSrc}`
    : `'self' https://api.openai.com ${storageSrc}`;
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; connect-src ${connectSrc}; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: ${storageSrc};`,
  );
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
