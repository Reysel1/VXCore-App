import { t } from "@/i18n";
function resolveAgentUrl(): string {
  if (typeof window !== "undefined" && window.fiveosDesktop?.agentUrl) {
    return window.fiveosDesktop.agentUrl;
  }
  if (process.env.NEXT_PUBLIC_AGENT_URL) return process.env.NEXT_PUBLIC_AGENT_URL;

  if (typeof window !== "undefined" && !isLoopbackHost(window.location.hostname)) {
    return "";
  }

  return "http://localhost:4000";
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

const AGENT_PATHS = /^\/(api|socket\.io)\//;

export function isAgentRequest(url: string): boolean {
  if (AGENT_URL) return url.startsWith(AGENT_URL);
  if (typeof window === "undefined") return false;

  try {
    const resolved = new URL(url, window.location.href);
    return resolved.origin === window.location.origin && AGENT_PATHS.test(resolved.pathname);
  } catch {
    return false;
  }
}

export const AGENT_URL = resolveAgentUrl();

export const AGENT_SOCKET_URL: string | undefined = AGENT_URL || undefined;

export function agentIsOnThisMachine(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isLoopbackHost(new URL(AGENT_URL || window.location.href).hostname);
  } catch {
    return false;
  }
}

export async function sendServerCommand(
  command: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${AGENT_URL}/api/server/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const data = await res.json().catch(() => ({}));

    return data.success
      ? { success: true, message: data.message || t("Comando enviado.") }
      : { success: false, message: data.error || data.message || t("El agente rechazó el comando.") };
  } catch {
    return { success: false, message: t("El agente VXCore no responde.") };
  }
}
