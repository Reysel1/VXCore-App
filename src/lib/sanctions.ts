import { AGENT_URL } from "@/lib/agent";
import { t, msg } from "@/i18n";

export type SanctionType = "ban" | "warn" | "kick";

export interface PlayerIdentity {
  license?: string;
  license2?: string;
  steam?: string;
  discord?: string;
  xbl?: string;
  live?: string;
  fivem?: string;
  ip?: string;
  tokens?: string[];
}

export interface Sanction {
  id: string;
  type: SanctionType;
  playerName: string;
  identity: PlayerIdentity;
  reason: string;
  byName: string;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  revokedBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

export const DURATIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: msg("1 hora") },
  { minutes: 60 * 6, label: msg("6 horas") },
  { minutes: 60 * 24, label: msg("1 día") },
  { minutes: 60 * 24 * 3, label: msg("3 días") },
  { minutes: 60 * 24 * 7, label: msg("1 semana") },
  { minutes: 60 * 24 * 30, label: msg("1 mes") },
  { minutes: 0, label: msg("Permanente") },
];

export const SANCTION_COPY: Record<SanctionType, { title: string; hint: string; verb: string }> = {
  ban: {
    title: msg("Banear"),
    hint: msg("No podrá entrar. Si está conectado, se le echa ahora."),
    verb: msg("baneado"),
  },
  kick: {
    title: msg("Expulsar"),
    hint: msg("Le echa de la partida. Puede volver a entrar cuando quiera."),
    verb: msg("expulsado"),
  },
  warn: {
    title: msg("Avisar"),
    hint: msg("Queda registrado en su historial. No le echa ni le impide entrar."),
    verb: msg("avisado"),
  },
};

export function isActive(sanction: Sanction): boolean {
  if (sanction.revoked) return false;
  if (sanction.expiresAt && new Date(sanction.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

export interface SanctionResult {
  success: boolean;
  sanction?: Sanction;
  error?: string;
}

export async function createSanction(input: {
  type: SanctionType;
  playerName: string;
  identity: PlayerIdentity;
  reason: string;
  durationMinutes: number;
}): Promise<SanctionResult> {
  try {
    const res = await fetch(`${AGENT_URL}/api/sanctions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      return { success: false, error: data.error || t("El agente rechazó la sanción.") };
    }
    return { success: true, sanction: data.sanction };
  } catch {
    return { success: false, error: t("El agente VXCore no responde.") };
  }
}

export interface SanctionablePlayer {
  key: string;
  id: string | number;
  name: string;
  citizenid: string;
  license: string;
  discord: string;
  job: string;
  identity: PlayerIdentity;
  sanctions?: { bans: number; warns: number; kicks: number };
  isOnline: boolean;
  source: "live" | "database";
}

export async function fetchSanctionablePlayers(): Promise<{
  players: SanctionablePlayer[];
  framework: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${AGENT_URL}/api/sanctions/players`, { method: "POST" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      return {
        players: [],
        framework: "",
        error:
          res.status === 403
            ? t("Tu acceso no incluye la sección de Sanciones.")
            : data.error || t("El agente no pudo leer la lista de jugadores."),
      };
    }
    return { players: data.players ?? [], framework: data.framework ?? "" };
  } catch {
    return { players: [], framework: "", error: t("El agente VXCore no responde.") };
  }
}

export async function fetchHistory(identity: PlayerIdentity): Promise<Sanction[]> {
  try {
    const res = await fetch(`${AGENT_URL}/api/sanctions/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity }),
    });
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.sanctions) ? data.sanctions : [];
  } catch {
    return [];
  }
}

export async function revokeSanction(id: string, reason: string): Promise<SanctionResult> {
  try {
    const res = await fetch(`${AGENT_URL}/api/sanctions/${id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      return { success: false, error: data.error || t("No se pudo levantar.") };
    }
    return { success: true, sanction: data.sanction };
  } catch {
    return { success: false, error: t("El agente VXCore no responde.") };
  }
}
