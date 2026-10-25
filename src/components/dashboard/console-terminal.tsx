"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TerminalSquare,
  Send,
  Loader2,
  RefreshCw,
  RotateCw,
  Gauge,
  Activity,
  History,
  Search,
  AlertTriangle,
  Pause,
  Play,
  ArrowDownToLine,
  Download,
  Trash2,
  Save,
  ExternalLink,
  PictureInPicture2,
  Megaphone,
} from "lucide-react";
import type { Socket } from "socket.io-client";
import { connectAgentSocket } from "@/lib/agent-socket";
import { AGENT_URL } from "@/lib/agent";
import { useAccess } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerContext } from "@/context/server-context";
import { floatingConsole } from "@/lib/floating-console";
import { openPopout } from "@/lib/popout";
import { parseConsoleLine, stripCodes } from "@/lib/console-format";
import { AnnounceDialog } from "@/components/dashboard/announce-dialog";
import { toast } from "sonner";
import { t, msg, intlLocale } from "@/i18n";

interface LogLine {
  type: string;
  message: string;
  time: string;
}

const QUICK_COMMANDS: {
  label: string;
  command: string;
  icon: typeof Save;
  hint: string;
  tone: string;
  template?: boolean;
}[] = [
  {
    label: msg("Recargar recursos"),
    command: "refresh",
    icon: RefreshCw,
    tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    hint: msg("Vuelve a escanear la carpeta resources en busca de recursos nuevos."),
  },
  {
    label: msg("Reiniciar recurso"),
    command: "restart ",
    icon: RotateCw,
    tone: "text-amber-400 bg-amber-500/10 border-amber-500/25",
    hint: msg("Reinicia un recurso concreto sin tocar el resto del servidor."),
    template: true,
  },
  {
    label: msg("GUI nativa (svgui)"),
    command: "svgui",
    icon: Gauge,
    tone: "text-violet-400 bg-violet-500/10 border-violet-500/25",
    hint: msg("Abre la interfaz propia de FXServer, en la ventana del servidor — no dentro de VXCore. Para una consola dentro del panel, usa la consola flotante."),
  },
  {
    label: msg("Versión"),
    command: "version",
    icon: Activity,
    tone: "text-purple-400 bg-purple-500/10 border-purple-500/25",
    hint: msg("Muestra la build de FXServer en uso."),
  },
  {
    label: msg("Comandos"),
    command: "cmdlist",
    icon: TerminalSquare,
    tone: "text-zinc-400 bg-zinc-500/10 border-zinc-500/25",
    hint: msg("Vuelca todos los comandos y convars disponibles."),
  },
];

function ToolbarToggle({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: typeof Save;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={
        "inline-flex size-7 items-center justify-center rounded transition-colors " +
        (active
          ? "bg-primary/20 text-primary"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground")
      }
    >
      <Icon className="size-3.5" />
    </button>
  );
}

const LEVEL_STYLES: Record<string, string> = {
  stderr: "text-red-400",
  stdin: "text-primary",
  stdout: "text-foreground/80",
};

const HISTORY_KEY = "fiveos_command_history";
const HISTORY_MAX = 50;

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ConsoleTerminal({
  fill = false,
  compact = false,
  detached = false,
}: {
  fill?: boolean;
  compact?: boolean;
  detached?: boolean;
}) {
  const { activeServer } = useServerContext();
  const { can, reasonFor } = useAccess();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [search, setSearch] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);

  const pushHistory = useCallback((cmd: string) => {
    setHistory((prev) => {
      const next = [cmd, ...prev.filter((c) => c !== cmd)].slice(0, HISTORY_MAX);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setHistoryIndex(-1);
  }, []);

  const navigateHistory = (direction: 1 | -1) => {
    if (history.length === 0) return;

    const next = Math.min(Math.max(historyIndex + direction, -1), history.length - 1);
    setHistoryIndex(next);
    setCommand(next === -1 ? "" : history[next]);
  };

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const socket: Socket = connectAgentSocket();
    socket.on("server-log", (line: LogLine) => {
      if (pausedRef.current) return;
      setLines((prev) => [...prev.slice(-999), line]);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lines.filter((line) => {
      if (onlyErrors && line.type !== "stderr") return false;
      if (needle && !stripCodes(line.message).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [lines, search, onlyErrors]);

  useEffect(() => {
    if (autoScroll && !paused) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [shown, autoScroll, paused]);

  const download = () => {
    const text = shown.map((l) => `[${l.time}] ${l.message}`).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `consola-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const send = useCallback(
    async (raw: string) => {
      const cmd = raw.trim();
      if (!cmd) return;

      setSending(true);
      try {
        const res = await fetch(`${AGENT_URL}/api/server/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd }),
        });
        const data = await res.json();
        if (!data.success) {
          toast.error(t("Comando descartado"), { description: data.message, duration: 7000 });
        } else {
          pushHistory(cmd);
          setCommand("");
        }
      } catch {
        toast.error(t("El agente VXCore no responde."));
      } finally {
        setSending(false);
      }
    },
    [pushHistory]
  );

  const hasConsole = activeServer?.managed;

  const canCommand = can("console.command");
  const promptDisabled = !hasConsole || !canCommand;
  const promptHint = !canCommand
    ? reasonFor("console.command")
    : hasConsole
      ? "refresh, restart <recurso>…  (↑ historial)"
      : t("Consola no disponible");

  return (
    <div className={`flex flex-col gap-3 ${fill ? "min-h-0 w-full flex-1" : ""}`}>
      <div
        className={
          "flex flex-col overflow-hidden rounded-xl border border-border/60 bg-[#0d0d0d] shadow-sm " +
          (fill ? "min-h-[280px] flex-1" : "")
        }
      >
        <div className="h-0.5 w-full bg-gradient-to-r from-primary via-primary/30 to-transparent" />
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-white/[0.02] px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <TerminalSquare className="size-3.5 text-primary" />
            {t("Consola")}
          </span>

          <span
            className={
              "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] " +
              (hasConsole
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-muted/40 text-muted-foreground")
            }
            title={
              hasConsole
                ? t("Conectada al stdin del servidor")
                : t("Sólo se puede hablar con servidores que arrancó VXCore")
            }
          >
            <span
              className={
                "size-1.5 rounded-full " +
                (hasConsole ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/60")
              }
            />
            {hasConsole ? t("conectada") : t("sin consola")}
          </span>

          <div className="relative ml-auto w-44">
            <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Filtrar")}
              className="h-7 border-border/50 bg-black/30 pl-6 text-[11px]"
            />
          </div>

          <div className="flex items-center gap-0.5">
            {!detached && (
              <ToolbarToggle
                active={false}
                onClick={() => {
                  const ok = openPopout({
                    route: "consola",
                    name: "vxcore-consola",
                    width: 760,
                    height: 520,
                  });
                  if (!ok) toast.error(t("El navegador bloqueó la ventana emergente."));
                }}
                label={t("Sacar a una ventana aparte")}
                icon={ExternalLink}
              />
            )}
            <ToolbarToggle
              active={onlyErrors}
              onClick={() => setOnlyErrors((v) => !v)}
              label={t("Sólo errores")}
              icon={AlertTriangle}
            />
            <ToolbarToggle
              active={paused}
              onClick={() => setPaused((v) => !v)}
              label={paused ? t("Reanudar captura") : t("Pausar captura")}
              icon={paused ? Play : Pause}
            />
            <ToolbarToggle
              active={autoScroll}
              onClick={() => setAutoScroll((v) => !v)}
              label={t("Seguir la última línea")}
              icon={ArrowDownToLine}
            />
            <ToolbarToggle onClick={download} label={t("Descargar lo mostrado")} icon={Download} />
            <ToolbarToggle onClick={() => setLines([])} label={t("Limpiar la vista")} icon={Trash2} />
            {!compact && (
              <ToolbarToggle
                onClick={floatingConsole.open}
                label={t("Abrir en una ventana flotante")}
                icon={PictureInPicture2}
              />
            )}
          </div>
        </div>

        <div
          className={
            "overflow-y-auto px-3 py-2 font-mono text-[11px] leading-[1.65] " +
            (fill ? "min-h-0 flex-1" : "h-80")
          }
        >
          {shown.length === 0 ? (
            <p className="text-muted-foreground/70">
              {lines.length === 0
                ? t("Esperando salida del servidor…")
                : t("Ninguna línea coincide con el filtro.")}
            </p>
          ) : (
            shown.map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="shrink-0 select-none text-muted-foreground/35 tabular-nums">
                  {new Date(line.time).toLocaleTimeString(intlLocale(), { hour12: false })}
                </span>
                <span
                  className={`min-w-0 whitespace-pre-wrap break-words ${
                    LEVEL_STYLES[line.type] ?? "text-foreground/80"
                  }`}
                >
                  {parseConsoleLine(line.message).map((segment, s) => (
                    <span key={s} className={segment.className ?? undefined}>
                      {t(segment.text)}
                    </span>
                  ))}
                </span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <div className="flex items-center gap-2 border-t border-border/40 bg-white/[0.02] px-2.5 py-2">
          <span className="select-none font-mono text-xs text-primary">&gt;</span>
          <Input
            ref={inputRef}
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              setHistoryIndex(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") return send(command);
              if (e.key === "ArrowUp") {
                e.preventDefault();
                navigateHistory(1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                navigateHistory(-1);
              }
            }}
            placeholder={promptHint ?? ""}
            disabled={promptDisabled || sending}
            className="h-7 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
          />
          <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
            {shown.length}/{lines.length}
            {paused && t(" · pausada")}
          </span>
          <Button
            size="sm"
            className="h-7 px-2"
            onClick={() => send(command)}
            disabled={promptDisabled || sending || !command.trim()}
          >
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size={compact ? "xs" : "sm"}
          title={t("Manda una notificación a la pantalla de todos los jugadores.")}
          className="gap-1.5 border-sky-500/25 bg-sky-500/10 text-sky-400"
          disabled={promptDisabled || sending}
          onClick={() => setAnnounceOpen(true)}
        >
          <Megaphone className="size-3.5" />
          {t("Anuncio")}
        </Button>

        {QUICK_COMMANDS.map((q) => (
          <Button
            key={q.command}
            variant="outline"
            size={compact ? "xs" : "sm"}
            title={t(q.hint)}
            className={`gap-1.5 border-border/60 ${q.tone}`}
            disabled={promptDisabled || sending}
            onClick={() => {
              if (q.template) {
                setCommand(q.command);
                inputRef.current?.focus();
              } else {
                send(q.command);
              }
            }}
          >
            <q.icon className="size-3.5" />
            {t(q.label)}
          </Button>
        ))}
      </div>

      <AnnounceDialog open={announceOpen} onOpenChange={setAnnounceOpen} />

      {history.length > 0 && !compact && (
        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <History className="size-3.5" />
              {t("Historial")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setHistory([]);
                setHistoryIndex(-1);
                try {
                  localStorage.removeItem(HISTORY_KEY);
                } catch {}
              }}
            >
              {t("Vaciar")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {history.slice(0, 8).map((cmd) => (
              <button
                key={cmd}
                type="button"
                title={t("Volver a enviar: {cmd}", { cmd })}
                disabled={promptDisabled || sending}
                onClick={() => send(cmd)}
                className="max-w-full truncate rounded border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
