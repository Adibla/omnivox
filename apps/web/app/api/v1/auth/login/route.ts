import { NextResponse } from "next/server";
import { createOidcState, isAuthRequired, setOidcStateCookie } from "@/lib/auth";
import { buildAuthorizationUrl } from "@/lib/oidc";
import { getEnv } from "@/lib/env";

function safeReturnTo(value: string | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  return value;
}

export async function GET(request: Request) {
  if (!isAuthRequired()) {
    return NextResponse.redirect(getEnv().APP_BASE_URL);
  }
  const url = new URL(request.url);
  const state = {
    ...createOidcState(),
    returnTo: safeReturnTo(url.searchParams.get("returnTo")),
  };
  await setOidcStateCookie(state);
  return NextResponse.redirect(await buildAuthorizationUrl(state));
}
