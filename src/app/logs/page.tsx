"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AGENT_URL } from "@/lib/agent";
import { Download, AlertCircle, Info, AlertTriangle, Bug, Loader2, FileText, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useServerContext } from "@/context/server-context";
import type { Socket } from "socket.io-client";
import { connectAgentSocket } from "@/lib/agent-socket";
import { toast } from "sonner";
import { t, msg, intlLocale } from "@/i18n";

type LogLevel = "error" | "warning" | "info" | "debug";

interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  resource: string;
  message: string;
  stream: string;
}

const LEVELS: { value: LogLevel; label: string; icon: typeof Info; badge: string }[] = [
  { value: "error", label: msg("Error"), icon: AlertCircle, badge: "bg-red-500/10 text-red-500 border-red-500/20" },
  { value: "warning", label: msg("Aviso"), icon: AlertTriangle, badge: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  { value: "info", label: msg("Info"), icon: Info, badge: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { value: "debug", label: msg("Debug"), icon: Bug, badge: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
];

const EMPTY_COUNTS: Record<LogLevel, number> = { error: 0, warning: 0, info: 0, debug: 0 };

export default function LogsPage() {
  const { activeServer } = useServerContext();
  const serverName = activeServer?.name || t("Servidor");

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [resources, setResources] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<LogLevel, number>>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [agentDown, setAgentDown] = useState(false);

  const [search, setSearch] = useState("");
  const [activeLevels, setActiveLevels] = useState<LogLevel[]>([]);
  const [resourceFilter, setResourceFilter] = useState<string>("");
  const [files, setFiles] = useState<{ name: string; size: number; modified: string }[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/logs/recent?limit=1000`);
      const data = await res.json();
      if (data.success) {
        setEntries(data.entries ?? []);
        setResources(data.resources ?? []);
        setCounts(data.counts ?? EMPTY_COUNTS);
        setAgentDown(false);
      }
    } catch {
      setAgentDown(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/logs/files`);
      const data = await res.json();
      if (data.success) setFiles(data.files ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      loadHistory();
      loadFiles();
    }, 0);
    return () => clearTimeout(initial);
  }, [loadHistory, loadFiles]);

  useEffect(() => {
    const socket: Socket = connectAgentSocket();

    socket.on("server-log", (data: { type: string; message: string; time: string }) => {
      const lower = data.message.toLowerCase();
      const level: LogLevel = /error|failed|exception|fatal/.test(lower)
        ? "error"
        : /warn|deprecated/.test(lower)
          ? "warning"
          : /debug|trace/.test(lower)
            ? "debug"
            : data.type === "stderr"
              ? "warning"
              : "info";

      const match = data.message.match(/^\[\s*([^\]]+?)\s*\]\s?([\s\S]*)$/);
      const rawResource = match?.[1] ?? "system";
      const resource = rawResource.includes(":") ? rawResource.split(":").pop()!.trim() : rawResource;

      setEntries((prev) => [
        { id: Date.now() + Math.random(), time: data.time, level, resource, message: match?.[2] || data.message, stream: data.type },
        ...prev.slice(0, 999),
      ]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const toggleLevel = (level: LogLevel) => {
    setActiveLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
  };

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return entries.filter((entry) => {
      if (activeLevels.length > 0 && !activeLevels.includes(entry.level)) return false;
      if (resourceFilter && entry.resource !== resourceFilter) return false;
      if (needle && !entry.message.toLowerCase().includes(needle) && !entry.resource.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [entries, search, activeLevels, resourceFilter]);

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error(t("No hay nada que exportar con los filtros actuales."));
      return;
    }

    const content = filtered
      .slice()
      .reverse()
      .map((e) => `${new Date(e.time).toISOString()}\t${e.level.toUpperCase()}\t${e.resource}\t${e.message}`)
      .join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fiveos-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.log`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t("{length} líneas exportadas", { length: filtered.length }));
  };

  const levelMeta = (level: LogLevel) => LEVELS.find((l) => l.value === level)!;
  const hasFilters = activeLevels.length > 0 || !!resourceFilter || !!search;

  return (
    <div className="flex h-full min-h-0 w-full flex-col space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("Logs Globales")}</h2>
          <p className="text-muted-foreground mt-1">
            {t("Salida real de")}{" "}<span className="font-semibold text-primary">{serverName}</span>{t(", capturada por el agente.")}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" />{" "}{t("Exportar ({length})", { length: filtered.length })}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 p-2.5">
        {LEVELS.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            variant={activeLevels.includes(value) ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => toggleLevel(value)}
          >
            <Icon className="size-3" /> {t(label)}
            <span className="opacity-60">{counts[value]}</span>
          </Button>
        ))}

        <div className="h-5 w-px bg-border mx-1" />

        <select
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="h-7 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="">{t("Todos los recursos")}</option>
          {resources.map((resource) => (
            <option key={resource} value={resource}>
              {resource}
            </option>
          ))}
        </select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => {
              setActiveLevels([]);
              setResourceFilter("");
              setSearch("");
            }}
          >
            <X className="size-3" />{" "}{t("Limpiar filtros")}
          </Button>
        )}

        {files.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3.5" />
            <span>{t("Histórico en disco:")}</span>
            {files.slice(0, 3).map((file) => (
              <a
                key={file.name}
                href={`${AGENT_URL}/api/logs/file?name=${encodeURIComponent(file.name)}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono hover:text-primary underline underline-offset-2"
                title={`${(file.size / 1024).toFixed(0)} KB`}
              >
                {file.name.replace("fiveos-", "").replace(".log", "")}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 rounded-xl border border-border/50 bg-background overflow-hidden flex flex-col">
        <div className="p-2 border-b border-border/50 bg-muted/30">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Buscar en los logs del servidor...")}
            className="h-9 bg-background shadow-sm"
          />
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />{" "}{t("Cargando histórico...")}
            </div>
          ) : agentDown ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
              <AlertCircle className="size-6 text-red-400" />
              {t("El Agente VXCore no responde en el puerto 4000.")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-sm text-center px-6">
              <Info className="size-6 opacity-40" />
              {entries.length === 0
                ? t("Todavía no hay logs. El agente los captura cuando el servidor arranca desde VXCore.")
                : t("Ninguna línea coincide con los filtros.")}
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0 border-b border-border/50 z-10">
                <tr>
                  <th className="px-4 py-3 w-32">{t("Tiempo")}</th>
                  <th className="px-4 py-3 w-32">{t("Nivel")}</th>
                  <th className="px-4 py-3 w-48">{t("Recurso")}</th>
                  <th className="px-4 py-3">{t("Mensaje")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 font-mono">
                {filtered.map((entry) => {
                  const meta = levelMeta(entry.level);
                  const Icon = meta.icon;
                  return (
                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(entry.time).toLocaleTimeString(intlLocale())}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`gap-1.5 font-normal ${meta.badge}`}>
                          <Icon className="size-3.5" />
                          <span className="capitalize text-xs">{entry.level}</span>
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs font-semibold truncate max-w-[12rem]">
                        {entry.resource}
                      </td>
                      <td className={`px-4 py-3 text-xs ${entry.level === "error" ? "text-red-400" : "text-foreground/90"}`}>
                        {t(entry.message)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t border-border/50 bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("{length} de {length2} líneas", { length: filtered.length, length2: entries.length })}
            {hasFilters && t(" (filtradas)")}
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />{" "}{t("En vivo")}
          </span>
        </div>
      </div>
    </div>
  );
}
