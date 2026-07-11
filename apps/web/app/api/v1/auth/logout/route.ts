import { NextResponse } from "next/server";
import { clearSessionCookie, ensureSessionCookie, isAuthRequired } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { buildLogoutUrl } from "@/lib/oidc";
import { getAuthSession } from "@/lib/session-token-store";

export async function POST() {
  const session = await ensureSessionCookie();
  const stored = await getAuthSession(session.sessionId);
  await clearSessionCookie();
  if (!isAuthRequired()) {
    return NextResponse.json({ ok: true });
  }
  try {
    const logoutUrl = await buildLogoutUrl({ idToken: stored?.idToken });
    return NextResponse.json({
      ok: true,
      logoutUrl: logoutUrl?.toString() ?? getEnv().APP_BASE_URL,
    });
  } catch {
    return NextResponse.json({ ok: true, logoutUrl: getEnv().APP_BASE_URL });
  }
}
