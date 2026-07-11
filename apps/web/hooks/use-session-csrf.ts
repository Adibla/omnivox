"use client";

import { useCallback, useEffect, useState } from "react";

export function useSessionCsrf() {
  const [csrfToken, setCsrfToken] = useState("");
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<"disabled" | "keycloak">("disabled");
  const [authenticated, setAuthenticated] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [user, setUser] = useState<{
    subject: string;
    tenantId?: string;
    email?: string;
    name?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/auth/session", { method: "POST" });
    if (!response.ok) {
      setReady(false);
      return;
    }
    const payload = (await response.json()) as {
      csrfToken?: string;
      tenantId?: string;
      authMode?: "disabled" | "keycloak";
      authenticated?: boolean;
      user?: { subject: string; tenantId?: string; email?: string; name?: string } | null;
    };
    if (typeof payload.csrfToken === "string") {
      setCsrfToken(payload.csrfToken);
      setTenantId(payload.tenantId ?? "");
      setAuthMode(payload.authMode ?? "disabled");
      setAuthenticated(Boolean(payload.authenticated));
      setUser(payload.user ?? null);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { csrfToken, ready, refresh, authMode, authenticated, tenantId, user };
}
