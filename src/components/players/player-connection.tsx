"use client";

import { Activity, Hash, Wifi } from "lucide-react";
import { t } from "@/i18n";

interface Props {
  sessionId: number | string;
  ping?: number;
  ip?: string;
}

function pingTone(ping?: number): { tone: string; label: string } {
  if (ping === undefined || ping === null) return { tone: "text-muted-foreground", label: t("sin dato") };
  if (ping < 60) return { tone: "text-emerald-400", label: t("bien") };
  if (ping < 120) return { tone: "text-amber-400", label: t("justo") };
  return { tone: "text-red-400", label: t("a tirones") };
}

export function PlayerConnection({ sessionId, ping, ip }: Props) {
  const { tone, label } = pingTone(ping);

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Activity className="size-3" />{" "}{t("Conexión")}
      </p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wifi className="size-3" />{" "}{t("Ping")}
          </span>
          <span className={`font-mono text-[11px] font-semibold ${tone}`}>
            {ping ?? "—"}
            {ping !== undefined && ping !== null ? t(" ms · {label}", { label }) : ""}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Hash className="size-3" />{" "}{t("Id de sesión")}
          </span>
          <span className="font-mono text-[11px]">{sessionId}</span>
        </div>

        {ip && (
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[11px] text-muted-foreground">IP</span>
            <span className="truncate font-mono text-[11px]" title={ip}>
              {ip}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
