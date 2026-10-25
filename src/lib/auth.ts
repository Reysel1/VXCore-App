import { AGENT_URL, isAgentRequest } from "@/lib/agent";
import { t } from "@/i18n";

const STORAGE_KEY = "fiveos_session_token";

export type AccessLevel = "owner" | "admin" | "moderator" | "none";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  username: string;
  globalName?: string;
  avatar?: string;
}

export function setSessionToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

let installed = false;

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function installAuthInterceptor(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (!isAgentRequest(url)) return original(input, init);

    const token = getSessionToken();

    let response: Response;
    if (!token) {
      response = await original(input, init);
    } else {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      response = await original(input, { ...init, headers });
    }

    if (response.status === 401) {
      if (token) setSessionToken(null);
      onUnauthorized?.();
    }

    return response;
  };
}

export async function startDiscordLogin(invite?: string): Promise<void> {
  const origin = window.location.origin;
  const query = new URLSearchParams({ origin });
  if (invite) query.set("invite", invite);

  const res = await fetch(`${AGENT_URL}/api/discord/login?${query.toString()}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.success) {
    throw new Error(data.error || t("No se pudo iniciar el login con Discord."));
  }
  window.location.href = data.url;
}
