"use client";

import React from "react";
import { TerminalSquare } from "lucide-react";
import { ConsoleTerminal } from "@/components/dashboard/console-terminal";
import { useServerContext } from "@/context/server-context";
import { t } from "@/i18n";

export default function ConsolaEnVentana() {
  const { activeServer } = useServerContext();

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <title>
        {activeServer?.name ? t("Consola · {name}", { name: activeServer.name }) : t("Consola · VXCore")}
      </title>

      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <TerminalSquare className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {activeServer?.name || t("Sin servidor seleccionado")}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <ConsoleTerminal fill compact detached />
      </div>
    </div>
  );
}
