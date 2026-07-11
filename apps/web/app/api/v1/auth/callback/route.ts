import { NextResponse } from "next/server";
import { consumeOidcStateCookie, setAuthenticatedSession } from "@/lib/auth";
import { exchangeCodeForIdentity } from "@/lib/oidc";
import { getEnv } from "@/lib/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stored = await consumeOidcStateCookie();
  if (!code || !state || !stored || stored.state !== state) {
    return NextResponse.redirect(`${getEnv().APP_BASE_URL}/?auth_error=invalid_state`);
  }
  try {
    const { identity, idToken, refreshToken, refreshExpiresAt } = await exchangeCodeForIdentity({ code, expectedNonce: stored.nonce });
    await setAuthenticatedSession(identity, { idToken, refreshToken, refreshExpiresAt });
    return NextResponse.redirect(`${getEnv().APP_BASE_URL}${stored.returnTo ?? ""}`);
  } catch {
    return NextResponse.redirect(`${getEnv().APP_BASE_URL}/?auth_error=login_failed`);
  }
}
