"use client";

import { useEffect, useState } from "react";
import { AGENT_URL } from "@/lib/agent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, Cpu, HardDrive, Users, Server, CheckCircle2, Database, Loader2, Plus, HelpCircle, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { Socket } from "socket.io-client";
import { connectAgentSocket } from "@/lib/agent-socket";
import Link from "next/link";

import { useServerContext } from "@/context/server-context";
import {
  ServerControls,
  QuickConsole,
  ScheduledRestarts,
} from "@/components/dashboard/server-controls";
import { OnlinePlayers } from "@/components/dashboard/online-players";
import { WebVersionButton } from "@/components/dashboard/web-version-button";
import { t, intlLocale } from "@/i18n";

type CheckStatus = "ok" | "warn" | "error" | "unknown";

interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  hint?: string;
}

const CHECK_STYLES: Record<CheckStatus, { className: string; Icon: typeof CheckCircle2 }> = {
  ok: { className: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400", Icon: CheckCircle2 },
  warn: { className: "border-amber-500/50 bg-amber-500/10 text-amber-400", Icon: AlertTriangle },
  error: { className: "border-red-500/50 bg-red-500/10 text-red-400", Icon: AlertTriangle },
  unknown: { className: "border-border bg-muted/30 text-muted-foreground", Icon: HelpCircle },
};

interface TelemetrySample {
  cpu: { load: number };
  memory: { used: number; total: number; usedPercent: number };
  players?: number;
  uptime?: number;
}

export default function DashboardPage() {
  const { activeServer, agentOnline, loading } = useServerContext();
  const [telemetry, setTelemetry] = useState<TelemetrySample | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
  const [playersOnline, setPlayersOnline] = useState<number | null>(null);
  const [connectingCount, setConnectingCount] = useState(0);
  const [reachable, setReachable] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!activeServer) return;

    let cancelled = false;

    const runDiagnostics = async () => {
      const params = new URLSearchParams();
      if (activeServer.ip) params.set("ip", activeServer.ip);
      if (activeServer.port) params.set("port", String(activeServer.port));
      if (activeServer.cfgPath) params.set("cfgPath", activeServer.cfgPath);
      if (activeServer.serverDataPath) params.set("serverDataPath", activeServer.serverDataPath);

      try {
        const res = await fetch(`${AGENT_URL}/api/server/diagnostics?${params.toString()}`);
        const data = await res.json();
        if (cancelled || !data.success) return;
        setChecks(data.checks ?? []);
        setPlayersOnline(data.players?.online ?? null);
        setReachable(data.fxserver?.reachable ?? false);
        setCheckedAt(new Date());
      } catch {
        if (!cancelled) setChecks(null);
      }
    };

    runDiagnostics();
    const interval = setInterval(runDiagnostics, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeServer, refreshTick]);

  useEffect(() => {
    const socket: Socket = connectAgentSocket();

    socket.on("connect", () => {
      setSocketConnected(true);
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
      setTelemetry(null);
    });

    socket.on("telemetry", (data) => {
      setTelemetry(data);
    });

    socket.on("connecting-players", (list: unknown) => {
      setConnectingCount(Array.isArray(list) ? list.length : 0);
    });

    fetch(`${AGENT_URL}/api/server/connecting`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.connecting)) setConnectingCount(d.connecting.length);
      })
      .catch(() => {});

    return () => {
      socket.disconnect();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="size-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm">{t("Conectando con el Agente VXCore y buscando servidores...")}</p>
      </div>
    );
  }

  if (!activeServer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="size-20 rounded-2xl bg-muted/50 flex items-center justify-center">
          <Server className="size-10 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h2 className="text-2xl font-bold">{t("Sin servidores detectados")}</h2>
          <p className="text-muted-foreground text-sm">
            {agentOnline
              ? t("El Agente VXCore está conectado pero no encontró ningún archivo server.cfg en las rutas conocidas. Añade tu servidor manualmente.")
              : t("No se pudo conectar con el Agente VXCore (puerto 4000). Asegúrate de que el agente esté ejecutándose.")}
          </p>
        </div>
        <Button render={<Link href="/servers" />} className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 size-4" />{" "}{t("Añadir Servidor")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{activeServer.name}</h1>
          <p className="text-muted-foreground mt-1">
            {t("Diagnóstico en tiempo real • {framework} • BD:", { framework: activeServer.framework })}{" "}
            <span className="font-mono text-xs text-blue-400">{activeServer.database}</span>
            {activeServer.cfgPath && (
              <span className="text-xs text-muted-foreground/60 ml-2">({activeServer.cfgPath})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <WebVersionButton />
          <span className="flex items-center gap-1.5">
            <Activity className="size-3.5 text-emerald-500" />
            {t("En vivo")}
          </span>
          {checkedAt && <span className="tabular-nums">· {checkedAt.toLocaleTimeString(intlLocale(), { hour12: false })}</span>}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-primary"
            onClick={() => setRefreshTick((t) => t + 1)}
            title={t("Volver a comprobar el diagnóstico")}
            aria-label={t("Refrescar diagnóstico")}
          >
            <RefreshCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      <ServerControls />

      <div className="grid gap-4 lg:grid-cols-4 lg:items-start">
        <div className="lg:col-span-3">
          <QuickConsole />
        </div>
        <OnlinePlayers />
      </div>

      <ScheduledRestarts />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("Uso de CPU")}</CardTitle>
            <Cpu className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{telemetry ? `${telemetry.cpu.load}%` : activeServer.cpu !== "-" ? activeServer.cpu : "--%"}</div>
            <Progress value={telemetry ? telemetry.cpu.load : 0} className="h-2 mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("Memoria RAM")}</CardTitle>
            <HardDrive className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {telemetry ? `${(telemetry.memory.used / 1024 / 1024 / 1024).toFixed(1)} GB` : activeServer.ram !== "-" ? activeServer.ram : t("-- GB")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              de {telemetry ? `${(telemetry.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB` : t("-- GB")}{" "}{t("disponibles")}
            </p>
            <Progress value={telemetry ? telemetry.memory.usedPercent : 0} className="h-2 mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("Jugadores Activos")}</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {playersOnline !== null ? `${playersOnline}/${activeServer.maxClients}` : "--"}
              </span>
              {connectingCount > 0 && (
                <span
                  className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  title={t("Conectándose ahora mismo")}
                >
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
                  {t("{connectingCount} conectándose", { connectingCount })}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {playersOnline !== null
                ? t("Conectados a {ip}", { ip: activeServer.ip })
                : reachable
                  ? t("El servidor no publica la lista de jugadores")
                  : t("El servidor no responde")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("Recursos Declarados")}</CardTitle>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeServer.resources.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("Con")}{" "}<code className="font-mono">ensure</code>{" "}{t("en server.cfg")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
        <Card className="col-span-4">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>{t("Diagnóstico Accionable")}</CardTitle>
              <CardDescription>{t("Problemas detectados por el Agente y sugerencias.")}</CardDescription>
            </div>
            {checks && (
              <div className="flex items-center gap-1.5 shrink-0">
                {checks.filter((c) => c.status === "ok").length > 0 && (
                  <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-400" title={t("Comprobaciones en orden")}>
                    <CheckCircle2 className="size-3" /> {checks.filter((c) => c.status === "ok").length}{" "}{t("ok")}
                  </span>
                )}
                {checks.filter((c) => c.status === "warn").length > 0 && (
                  <span className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-400" title={t("Avisos")}>
                    <AlertTriangle className="size-3" /> {checks.filter((c) => c.status === "warn").length}{" "}{t("avisos")}
                  </span>
                )}
                {checks.filter((c) => c.status === "error").length > 0 && (
                  <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-400" title={t("Problemas que requieren atención")}>
                    <AlertTriangle className="size-3" /> {checks.filter((c) => c.status === "error").length}{" "}{t("problemas")}
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {checks === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="size-4 animate-spin" />
                {t("Comprobando el estado real del servidor...")}
              </div>
            ) : (
              checks.map((check) => {
                const { className, Icon } = CHECK_STYLES[check.status];
                return (
                  <Alert key={check.id} className={className}>
                    <Icon className="size-4" />
                    <AlertTitle>{check.label}</AlertTitle>
                    <AlertDescription>
                      <span className="block">{check.message}</span>
                      {check.hint && <span className="block mt-1 opacity-70 text-xs">{check.hint}</span>}
                    </AlertDescription>
                  </Alert>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>{t("Estado de Componentes")}</CardTitle>
            <CardDescription>{t("Servicios reales de {name}", { name: activeServer.name })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="size-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{t("FXServer Daemon")}</span>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded font-medium ${
                    activeServer.status === "online"
                      ? activeServer.managed
                        ? "bg-emerald-500/20 text-emerald-500"
                        : "bg-amber-500/20 text-amber-500"
                      : "bg-red-500/20 text-red-500"
                  }`}
                >
                  {activeServer.status === "online" ? (activeServer.managed ? t("Activo") : t("Activo (externo)")) : t("Detenido")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{t("Base de Datos ({database})", { database: activeServer.database })}</span>
                </div>
                {(() => {
                  const db = checks?.find((c) => c.id === "database");
                  const label = !db ? t("Comprobando...") : db.status === "ok" ? t("Conectada") : db.status === "unknown" ? t("Sin configurar") : t("Sin conexión");
                  const tone = !db
                    ? "bg-muted text-muted-foreground"
                    : db.status === "ok"
                      ? "bg-emerald-500/20 text-emerald-500"
                      : db.status === "unknown"
                        ? "bg-muted text-muted-foreground"
                        : "bg-red-500/20 text-red-500";
                  return <span className={`text-xs px-2 py-1 rounded font-medium ${tone}`} title={db?.message}>{label}</span>;
                })()}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="size-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{t("Agente VXCore Daemon")}</span>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded font-medium ${
                    socketConnected ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"
                  }`}
                >
                  {socketConnected ? t("Conectado (Port 4000)") : t("Desconectado")}
                </span>
              </div>
              {activeServer.cfgPath && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm truncate max-w-[200px]" title={activeServer.cfgPath}>
                      {activeServer.cfgPath}
                    </span>
                  </div>
                  <span className="text-xs bg-blue-500/20 text-blue-500 px-2 py-1 rounded font-medium">{t("Archivo Real")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
