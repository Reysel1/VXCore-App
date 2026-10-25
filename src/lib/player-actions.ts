import { useCallback, useEffect, useState } from "react";
import { AGENT_URL } from "@/lib/agent";
import { t } from "@/i18n";

export interface PlayerActionDef {
  key: string;
  label: string;
  kind: "command" | "event";
  event?: string;
  command?: string;
  payload?: string;
  hint?: string;
}

export interface PlayerLike {
  id: number | string;
  citizenid?: string;
  name?: string;
  amount?: number;
}

export function usePlayerActions() {
  const [actions, setActions] = useState<PlayerActionDef[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/events/config`);
      const data = await res.json();
      if (data.success && Array.isArray(data.actions)) setActions(data.actions);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const save = async (next: PlayerActionDef[]): Promise<boolean> => {
    try {
      const res = await fetch(`${AGENT_URL}/api/events/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: next }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.actions)) {
        setActions(data.actions);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const trigger = async (actionKey: string, player: PlayerLike) => {
    try {
      const res = await fetch(`${AGENT_URL}/api/events/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionKey, player }),
      });
      return await res.json();
    } catch {
      return { success: false, error: t("No se pudo contactar con el Agente VXCore (puerto 4000).") };
    }
  };

  return { actions, loading, save, trigger };
}
