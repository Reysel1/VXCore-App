"use client";

import { useCallback, useEffect, useState } from "react";

import { AGENT_URL } from "@/lib/agent";
import { t } from "@/i18n";

export const ADMIN_GROUPS = ["superadmin", "admin", "moderator"] as const;
export type AdminGroup = (typeof ADMIN_GROUPS)[number];

export interface Principal {
  identifier: string;
  group: string;
  known: boolean;
}

export interface GroupOption {
  group: AdminGroup;
  label: string;
}

interface Result {
  success: boolean;
  error?: string;
  appliedLive?: boolean;
}

export function preferredIdentifier(identity?: {
  license?: string;
  steam?: string;
  discord?: string;
  fivem?: string;
}): string | null {
  if (!identity) return null;
  for (const field of ["license", "steam", "discord", "fivem"] as const) {
    const value = identity[field];
    if (typeof value === "string" && value.trim()) return `${field}:${value.trim()}`;
  }
  return null;
}

export function usePrincipals(cfgPath?: string) {
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);

  const read = useCallback(async (): Promise<{ principals: Principal[]; groups: GroupOption[] } | null> => {
    if (!cfgPath) return null;
    try {
      const res = await fetch(
        `${AGENT_URL}/api/server/principals?cfgPath=${encodeURIComponent(cfgPath)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!data.success) return null;
      return {
        principals: Array.isArray(data.principals) ? data.principals : [],
        groups: Array.isArray(data.groups) ? data.groups : [],
      };
    } catch {
      return null;
    }
  }, [cfgPath]);

  const load = useCallback(async () => {
    const fresh = await read();
    if (!fresh) {
      setLoading(false);
      return;
    }
    setPrincipals(fresh.principals);
    setGroups(fresh.groups);
    setLoading(false);
  }, [read]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const fresh = await read();
      if (cancelled) return;
      if (fresh) {
        setPrincipals(fresh.principals);
        setGroups(fresh.groups);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [read]);

  const groupOf = useCallback(
    (identifier?: string | null): string | null => {
      if (!identifier) return null;
      const wanted = identifier.toLowerCase();
      return principals.find((p) => p.identifier.toLowerCase() === wanted)?.group ?? null;
    },
    [principals]
  );

  const grant = useCallback(
    async (identifier: string, group: AdminGroup): Promise<Result> => {
      try {
        const res = await fetch(`${AGENT_URL}/api/server/principals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cfgPath, identifier, group }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          return { success: false, error: data.error || t("El agente rechazó el cambio.") };
        }
        await load();
        return { success: true, appliedLive: Boolean(data.appliedLive) };
      } catch {
        return { success: false, error: t("El agente VXCore no responde.") };
      }
    },
    [cfgPath, load]
  );

  const revoke = useCallback(
    async (identifier: string): Promise<Result> => {
      try {
        const res = await fetch(`${AGENT_URL}/api/server/principals/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cfgPath, identifier }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          return { success: false, error: data.error || t("El agente rechazó el cambio.") };
        }
        await load();
        return { success: true, appliedLive: Boolean(data.appliedLive) };
      } catch {
        return { success: false, error: t("El agente VXCore no responde.") };
      }
    },
    [cfgPath, load]
  );

  return { principals, groups, loading, groupOf, grant, revoke, reload: load };
}
