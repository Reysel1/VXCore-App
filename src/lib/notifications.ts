"use client";

import { useEffect, useMemo, useState } from "react";
import { AGENT_URL } from "@/lib/agent";
import { isUpdatePending, type UpdaterSnapshot } from "@/lib/updater";
import type { ServerNode } from "@/context/server-context";
import { t } from "@/i18n";

export type NotificationTone = "info" | "warn" | "error";

export interface AppNotification {
  id: string;
  tone: NotificationTone;
  title: string;
  detail: string;
  href?: string;
  action?: string;
}

interface Requirement {
  id: string;
  label: string;
  status: "ok" | "missing" | "unknown";
  required: boolean;
  detail: string;
}

function useRequirements(enabled: boolean): Requirement[] {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled);
    if (!enabled) setRequirements([]);
  }

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${AGENT_URL}/api/requirements`);
        const data = await res.json();
        if (!cancelled && data?.success) setRequirements(data.requirements ?? []);
      } catch {}
    };

    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return requirements;
}

function useOneSyncWarning(cfgPath: string | undefined): AppNotification | null {
  const [note, setNote] = useState<AppNotification | null>(null);
  const [prevCfgPath, setPrevCfgPath] = useState(cfgPath);
  if (prevCfgPath !== cfgPath) {
    setPrevCfgPath(cfgPath);
    if (!cfgPath) setNote(null);
  }

  useEffect(() => {
    if (!cfgPath) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${AGENT_URL}/api/server/onesync?cfgPath=${encodeURIComponent(cfgPath)}`
        );
        const data = await res.json();
        if (cancelled) return;

        setNote(
          data?.success && data.mode === "off"
            ? {
                id: "onesync-off",
                tone: "warn",
                title: t("El servidor arranca sin OneSync"),
                detail: data.commentedOnly
                  ? t("Tu server.cfg tiene la línea de OneSync comentada, así que no se ejecuta. Sin OneSync no hay state bags ni más de 32 jugadores.")
                  : t("Sin OneSync no hay state bags, ni propiedad de entidades, ni más de 32 jugadores."),
                href: "/settings",
                action: t("Activar"),
              }
            : null
        );
      } catch {
        if (!cancelled) setNote(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cfgPath]);

  return note;
}

export function useNotifications(input: {
  agentOnline: boolean;
  servers: ServerNode[];
  activeServer: ServerNode | null | undefined;
  updater: UpdaterSnapshot;
}): AppNotification[] {
  const { agentOnline, servers, activeServer, updater } = input;
  const requirements = useRequirements(agentOnline && servers.length > 0);
  const onesync = useOneSyncWarning(agentOnline ? activeServer?.cfgPath : undefined);

  return useMemo(() => {
    const list: AppNotification[] = [];

    if (!agentOnline) {
      list.push({
        id: "agent-offline",
        tone: "error",
        title: t("El agente VXCore no responde"),
        detail: t("Sin él el panel no puede leer ni controlar tu servidor."),
      });
      return list;
    }

    if (isUpdatePending(updater)) {
      const version = updater.state?.info?.version;
      list.push({
        id: "update",
        tone: "info",
        title:
          updater.state?.status === "downloaded"
            ? t("Actualización lista para instalar")
            : t("Hay una versión nueva{valor}", { valor: version ? ` (${version})` : "" }),
        detail:
          updater.state?.status === "downloaded"
            ? t("Se instalará al cerrar la aplicación.")
            : t("Puedes descargarla desde Ajustes → Sistema."),
        href: "/settings",
        action: t("Ver"),
      });
    }

    for (const requirement of requirements) {
      if (requirement.status !== "missing" || !requirement.required) continue;
      list.push({
        id: `req-${requirement.id}`,
        tone: "warn",
        title: t("Falta {label}", { label: requirement.label }),
        detail: requirement.detail,
        href: "/settings",
        action: t("Resolver"),
      });
    }

    if (onesync) list.push(onesync);

    if (activeServer && activeServer.status !== "online") {
      list.push({
        id: `server-down-${activeServer.id}`,
        tone: "warn",
        title: t("{name} está parado", { name: activeServer.name }),
        detail: t("Nadie puede conectarse mientras siga así."),
        href: "/",
        action: t("Ir al panel"),
      });
    }

    return list;
  }, [agentOnline, requirements, activeServer, updater, onesync]);
}
