"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Power } from "lucide-react";
import type { Socket } from "socket.io-client";
import { connectAgentSocket } from "@/lib/agent-socket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useServerContext } from "@/context/server-context";
import { ConsoleTerminal } from "@/components/dashboard/console-terminal";
import { toast } from "sonner";
import { t } from "@/i18n";

export default function ConsolePage() {
  const { activeServer, toggleServerPower } = useServerContext();
  const serverName = activeServer?.name || t("Servidor FXServer");
  const isOnline = activeServer?.status === "online";
  const [agentConnected, setAgentConnected] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);

  useEffect(() => {
    const socket: Socket = connectAgentSocket();
    socket.on("connect", () => {
      setAgentConnected(true);
    });
    socket.on("disconnect", () => {
      setAgentConnected(false);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const handlePowerToggle = async () => {
    if (!activeServer) return;
    setPowerBusy(true);
    const result = await toggleServerPower(activeServer.id);
    setPowerBusy(false);
    if (result.success) {
      toast.success(result.message);
    } else if (!result.handled) {
      toast.error(isOnline ? t("No se pudo detener el servidor") : t("No se pudo arrancar el servidor"), {
        description: result.message,
        duration: 8000,
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("Consola Interactiva")}</h1>
            <Badge
              variant="outline"
              className={
                agentConnected
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              }
            >
              <span
                className={`size-2 rounded-full mr-1.5 ${
                  agentConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}
              />
              <span>{agentConnected ? t("WebSocket Conectado") : t("Desconectado")}</span>
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("La misma consola del dashboard a pantalla completa, para")}{" "}
            <span className="font-semibold text-primary">{serverName}</span>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {activeServer && (
            <Button
              variant={isOnline ? "destructive" : "default"}
              size="sm"
              className="h-8 gap-1.5 font-semibold"
              onClick={handlePowerToggle}
              disabled={powerBusy}
            >
              {powerBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
              {isOnline ? t("Detener Servidor") : t("Arrancar Servidor")}
            </Button>
          )}
        </div>
      </div>

      <ConsoleTerminal fill />
    </div>
  );
}
