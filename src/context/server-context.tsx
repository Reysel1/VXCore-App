"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { AGENT_URL } from "@/lib/agent";
import { ParsedServerConfig } from "@/lib/cfg-parser";
import { toast } from "sonner";
import type { Socket } from "socket.io-client";
import { connectAgentSocket } from "@/lib/agent-socket";
import { t } from "@/i18n";

export type LivenessSource = "managed" | "external" | "offline";

export interface ServerNode {
  id: string;
  name: string;
  ip: string;
  port?: string;
  status: "online" | "offline";
  livenessSource: LivenessSource;
  managed: boolean;
  cpu: string;
  ram: string;
  players: string;
  maxClients: number;
  uptime: string;
  location: string;
  framework: string;
  database: string;
  dbConnection?: string;
  cfgPath?: string;
  serverDataPath?: string;
  rawContent?: string;
  game: "fivem" | "redm" | "open77";
  resources: { name: string; status: "active" | "stopped"; type: string; memory: string; cpu: string }[];
  wardenUrl?: string | null;
  licenseKeyConfigured?: boolean;
}

export interface PowerResult {
  success: boolean;
  message: string;
  code?: string;
  handled?: boolean;
}

export interface FxServerUsage {
  cpu: number;
  memoryBytes: number;
  memoryPercent: number;
  pids: number[];
}

interface ServerContextType {
  servers: ServerNode[];
  activeServer: ServerNode | null;
  activeServerId: string;
  setActiveServerId: (id: string) => void;
  addServerFromConfig: (config: ParsedServerConfig, filePath?: string) => Promise<ServerNode>;
  removeServer: (id: string) => Promise<void>;
  toggleServerPower: (id: string) => Promise<PowerResult>;
  restartServer: (id: string) => Promise<PowerResult>;
  refreshServers: () => Promise<void>;
  agentOnline: boolean;
  loading: boolean;
  onboarding: boolean;
  fxUsage: FxServerUsage | null;
  firewallRequest: { program: string; ruleName: string; serverId: string } | null;
  allowFirewall: () => Promise<boolean>;
  dismissFirewall: () => void;
}

const STORAGE_KEY_SERVERS = "fiveos_servers_cache";
const STORAGE_KEY_ACTIVE = "fiveos_active_server_id";

interface Liveness {
  online: boolean;
  managed: boolean;
  reachable: boolean;
  source: LivenessSource;
  uptime: string | null;
  players?: number;
}

const OFFLINE: Liveness = {
  online: false,
  managed: false,
  reachable: false,
  source: "offline",
  uptime: null,
};

function classifyResource(name: string): string {
  if (name.includes("qb-core") || name.includes("es_extended") || name.includes("ox_core")) return "Core Framework";
  if (name.includes("mysql") || name.includes("oxmysql") || name.includes("ghmattimysql")) return "Database Driver";
  if (name.includes("inventory")) return "Inventory";
  if (name.includes("job") || name.includes("policejob") || name.includes("ambulance")) return "Job";
  if (name.includes("hud") || name.includes("ui") || name.includes("menu")) return "UI";
  if (name.includes("vehicle") || name.includes("garage")) return "Vehicle";
  if (name.includes("house") || name.includes("housing") || name.includes("property")) return "Housing";
  if (name.includes("fiveos")) return "VXCore Agent";
  if (name.startsWith("ox_")) return "OX Library";
  if (name.startsWith("qb-")) return "QBCore Script";
  return "Script";
}

interface MachineStats {
  cpu: string;
  ram: string;
}

interface DetectedServer {
  id?: string;
  detectedId?: string;
  name?: string;
  sv_hostname?: string;
  game?: string;
  ip?: string;
  port?: string | number;
  maxClients?: number;
  players?: string;
  location?: string;
  framework?: string;
  databaseEnabled?: boolean;
  databaseConfigured?: boolean;
  database?: string | { dbName?: string; connectionString?: string } | null;
  dbConnection?: string;
  cfgPath?: string;
  serverDataPath?: string;
  rawContent?: string;
  resources?: unknown[];
  wardenUrl?: string | null;
  licenseKeyConfigured?: boolean;
  liveness?: Liveness;
}

interface DetectResponse {
  success?: boolean;
  servers?: unknown;
  activeServerId?: string | null;
}

interface StatusResponse {
  success?: boolean;
  system?: {
    cpu?: { load?: number };
    memory?: { used?: number; total?: number };
  };
  fxserver?: { usage?: FxServerUsage | null };
}

interface MachineSnapshot {
  machine: MachineStats;
  fxUsage?: FxServerUsage | null;
}

async function fetchMachineSnapshot(): Promise<MachineSnapshot> {
  const snapshot: MachineSnapshot = { machine: { cpu: "-", ram: "-" } };
  try {
    const statusRes = await fetch(`${AGENT_URL}/api/server/status`);
    const statusData: StatusResponse = await statusRes.json();
    if (statusData.success && statusData.system) {
      const cpuLoad = statusData.system.cpu?.load ?? 0;
      const usedGB = ((statusData.system.memory?.used || 0) / 1024 / 1024 / 1024).toFixed(1);
      const totalGB = ((statusData.system.memory?.total || 0) / 1024 / 1024 / 1024).toFixed(1);
      snapshot.machine = { cpu: `${cpuLoad}%`, ram: `${usedGB} / ${totalGB} GB` };
    }
    snapshot.fxUsage = statusData.fxserver?.usage ?? null;
  } catch {}
  return snapshot;
}

interface ServerCache {
  servers: ServerNode[];
  activeId: string;
}

const NO_SERVERS: ServerNode[] = [];
let serverCache: ServerCache | null | undefined;

function readServerCache(): ServerCache | null {
  if (serverCache !== undefined) return serverCache;
  serverCache = null;
  try {
    const cached = localStorage.getItem(STORAGE_KEY_SERVERS);
    const cachedActive = localStorage.getItem(STORAGE_KEY_ACTIVE);
    if (cached) {
      const parsed: unknown = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cachedServers = parsed as ServerNode[];
        serverCache = {
          servers: cachedServers,
          activeId:
            cachedActive && cachedServers.some((s) => s.id === cachedActive) ? cachedActive : cachedServers[0].id,
        };
      }
    }
  } catch {}
  return serverCache;
}

const subscribeToServerCache = () => () => {};
const readServerCacheOnServer = () => null;

function buildServerNode(
  parsed: DetectedServer,
  idx: number,
  liveness?: Liveness,
  machine?: MachineStats
): ServerNode {
  const isOnline = liveness?.online ?? false;

  const resources = (parsed.resources || []).map((entry: unknown) => {
    const name = typeof entry === "string" ? entry : String((entry as { name?: unknown } | null)?.name ?? "");
    return {
      name,
      status: isOnline ? ("active" as const) : ("stopped" as const),
      type: classifyResource(name),
      memory: "-",
      cpu: "-",
    };
  });

  const stableId = parsed.id || parsed.detectedId || `srv-${Date.now().toString().slice(-4)}-${idx}`;
  const game: ServerNode["game"] =
    parsed.game === "open77" ? "open77" : parsed.game === "redm" ? "redm" : "fivem";
  const defaultPort = game === "open77" ? "11778" : "30120";
  const ip = parsed.ip || `127.0.0.1:${defaultPort}`;
  const port = ip.includes(":") ? ip.split(":")[1] : String(parsed.port || defaultPort);
  const maxClients = parsed.maxClients || (game === "open77" ? 32 : 64);

  return {
    id: stableId,
    name: parsed.name || parsed.sv_hostname || (game === "open77" ? t("Servidor Open77") : t("Servidor FiveM")),
    ip,
    port,
    status: isOnline ? "online" : "offline",
    livenessSource: liveness?.source ?? "offline",
    managed: liveness?.managed ?? false,
    cpu: isOnline ? machine?.cpu ?? "-" : "-",
    ram: isOnline ? machine?.ram ?? "-" : "-",
    players:
      typeof liveness?.players === "number"
        ? `${liveness.players}/${maxClients}`
        : parsed.players || `0/${maxClients}`,
    maxClients,
    uptime: isOnline
      ? liveness?.uptime || (liveness?.source === "external" ? t("Arrancado externamente") : t("En ejecución"))
      : t("Detenido"),
    location: parsed.location || t("Local / VPS"),
    framework: parsed.framework || (game === "open77" ? "Open77" : "QBCore"),
    game,
    database:
      game === "open77"
        ? parsed.databaseEnabled || parsed.databaseConfigured
          ? "MySQL / MariaDB"
          : t("Sin base de datos")
        : typeof parsed.database === "object"
          ? parsed.database?.dbName || "fivem_db"
          : parsed.database || "fivem_db",
    dbConnection: parsed.dbConnection || (typeof parsed.database === "object" ? parsed.database?.connectionString : undefined),
    cfgPath: parsed.cfgPath,
    serverDataPath: parsed.serverDataPath || (parsed.cfgPath ? parsed.cfgPath.replace(/[\\/][^\\/]+$/, "") : undefined),
    rawContent: parsed.rawContent,
    resources,
    wardenUrl: parsed.wardenUrl ?? null,
    licenseKeyConfigured: parsed.licenseKeyConfigured,
  };
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const cache = useSyncExternalStore(subscribeToServerCache, readServerCache, readServerCacheOnServer);
  const [ownServers, setOwnServers] = useState<ServerNode[] | null>(null);
  const [ownActiveId, setOwnActiveId] = useState<string | null>(null);
  const servers = ownServers ?? cache?.servers ?? NO_SERVERS;
  const activeServerId = ownActiveId ?? cache?.activeId ?? "";

  const setServers = useCallback((update: React.SetStateAction<ServerNode[]>) => {
    setOwnServers((prev) => {
      const current = prev ?? readServerCache()?.servers ?? NO_SERVERS;
      return typeof update === "function" ? update(current) : update;
    });
  }, []);

  const setActiveServerIdState = useCallback((update: React.SetStateAction<string>) => {
    setOwnActiveId((prev) => {
      const current = prev ?? readServerCache()?.activeId ?? "";
      return typeof update === "function" ? update(current) : update;
    });
  }, []);

  const [agentOnline, setAgentOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fxUsage, setFxUsage] = useState<FxServerUsage | null>(null);
  const [firewallRequest, setFirewallRequest] = useState<{
    program: string;
    ruleName: string;
    serverId: string;
  } | null>(null);

  const activeIdRef = useRef<string>("");
  useEffect(() => {
    activeIdRef.current = activeServerId;
  }, [activeServerId]);

  const pendingActiveRef = useRef(false);

  const setActiveServerId = (id: string) => {
    const previous = activeIdRef.current;
    setActiveServerIdState(id);
    pendingActiveRef.current = true;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE, id);
      } catch {}
    }

    fetch(`${AGENT_URL}/api/server/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .then(async (res) => {
        if (res.ok) return;
        const data = await res.json().catch(() => ({}));
        setActiveServerIdState(previous);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(STORAGE_KEY_ACTIVE, previous);
          } catch {}
        }
        if (data.code === "ANOTHER_SERVER_RUNNING") {
          toast.error(t("No se pudo cambiar de servidor"), { description: data.error, duration: 8000 });
        } else if (data.error) {
          toast.error(t("No se pudo cambiar de servidor"), { description: data.error });
        }
      })
      .catch(() => {})
      .finally(() => {
        pendingActiveRef.current = false;
      });
  };

  useEffect(() => {
    if (servers.length > 0 && typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_SERVERS, JSON.stringify(servers));
      } catch {}
    }
  }, [servers]);

  const refreshServers = useCallback(
    () =>
      fetch(`${AGENT_URL}/api/server/detect`)
        .then((detectRes) => detectRes.json())
        .then(async (detectData: DetectResponse) => {
          setAgentOnline(true);

          if (!detectData.success || !Array.isArray(detectData.servers)) return;

          const detected = detectData.servers as DetectedServer[];

          const { machine, fxUsage } = await fetchMachineSnapshot();
          if (fxUsage !== undefined) setFxUsage(fxUsage);

          const fetchedNodes: ServerNode[] = detected.map((s, i) =>
            buildServerNode(s, i, s.liveness ?? OFFLINE, machine)
          );

          setServers(fetchedNodes);

          setActiveServerIdState((currActive) => {
            if (pendingActiveRef.current) return currActive;

            const agentActive = detectData.activeServerId ?? null;
            if (agentActive && fetchedNodes.some((n) => n.id === agentActive)) return agentActive;
            if (currActive && fetchedNodes.some((n) => n.id === currActive)) return currActive;
            return fetchedNodes[0]?.id ?? "";
          });
        })
        .catch((err: unknown) => {
          if (err instanceof TypeError) {
            setAgentOnline(false);
          } else {
            console.error("[ServerContext] Error procesando la respuesta del agente:", err);
          }
        })
        .finally(() => {
          setLoading(false);
        }),
    [setServers, setActiveServerIdState]
  );

  useEffect(() => {
    refreshServers();
    const interval = setInterval(refreshServers, 8000);

    let socket: Socket | null = null;
    try {
      socket = connectAgentSocket();
      socket.on("server-status", () => {
        refreshServers();
      });
      socket.on("firewall-needed", (fw) => {
        if (fw?.program) {
          setFirewallRequest({
            program: fw.program,
            ruleName: fw.ruleName || "VXCore FXServer",
            serverId: fw.serverId || activeIdRef.current,
          });
        }
      });
    } catch {}

    return () => {
      clearInterval(interval);
      if (socket) socket.disconnect();
    };
  }, [refreshServers]);

  const addServerFromConfig = async (config: ParsedServerConfig, filePath?: string): Promise<ServerNode> => {
    const resources =
      config.resources.length > 0
        ? config.resources.map((resName) => ({
            name: resName,
            status: "active" as const,
            type: classifyResource(resName),
            memory: "-",
            cpu: "-",
          }))
        : [];

    const stableId = `srv-${Date.now().toString().slice(-4)}`;
    const newServer: ServerNode = {
      id: stableId,
      name: config.name || t("Servidor FiveM"),
      ip: config.ip || "127.0.0.1:30120",
      port: config.ip?.includes(":") ? config.ip.split(":")[1] : "30120",
      status: "offline",
      livenessSource: "offline",
      managed: false,
      cpu: "-",
      ram: "-",
      players: `0/${config.maxClients || 64}`,
      maxClients: config.maxClients || 64,
      uptime: t("Detenido"),
      location: t("Local / VPS"),
      framework: config.framework || "QBCore",
      game: config.game === "redm" ? "redm" : "fivem",
      database: config.database?.dbName || "fivem_db",
      dbConnection: config.database?.connectionString,
      cfgPath: filePath,
      serverDataPath: filePath ? filePath.replace(/[\\/][^\\/]+$/i, "") : undefined,
      rawContent: config.rawContent,
      resources,
    };

    try {
      await fetch(`${AGENT_URL}/api/server/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newServer),
      });
    } catch (err) {
      console.warn("[ServerContext] Could not register server with agent:", err);
    }

    setServers((prev) => {
      const exists = prev.some((s) => s.id === newServer.id || (filePath && s.cfgPath === filePath));
      if (exists) {
        return prev.map((s) => (s.id === newServer.id || (filePath && s.cfgPath === filePath) ? newServer : s));
      }
      return [...prev, newServer];
    });

    setActiveServerIdState(newServer.id);
    return newServer;
  };

  const removeServer = async (id: string) => {
    const target = servers.find((s) => s.id === id);

    try {
      await fetch(`${AGENT_URL}/api/server/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, cfgPath: target?.cfgPath }),
      });
    } catch (err) {
      console.warn("[ServerContext] Error removing from agent:", err);
    }

    setServers((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_SERVERS, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    setActiveServerIdState((curr) => {
      if (curr === id) {
        const remaining = servers.filter((s) => s.id !== id);
        const nextId = remaining[0]?.id || "";
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY_ACTIVE, nextId);
        }
        return nextId;
      }
      return curr;
    });
  };

  const sendPowerAction = async (
    target: ServerNode,
    action: "start" | "stop" | "restart"
  ): Promise<PowerResult> => {
    try {
      const res = await fetch(`${AGENT_URL}/api/server/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: target.id,
          serverDataPath:
            target.serverDataPath ||
            (target.cfgPath ? target.cfgPath.replace(/[\\/][^\\/]+$/, "") : undefined),
          cfgPath: target.cfgPath,
          ip: target.ip,
          port: target.port,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        if (data.code === "FIREWALL_PERMISSION_NEEDED" && data.firewall?.program) {
          setFirewallRequest({
            program: data.firewall.program,
            ruleName: data.firewall.ruleName || "VXCore FXServer",
            serverId: target.id,
          });
        }
        return {
          success: false,
          code: data.code,
          handled: data.code === "FIREWALL_PERMISSION_NEEDED",
          message: data.error || t("El agente rechazó la orden."),
        };
      }

      setTimeout(refreshServers, action === "restart" ? 6000 : 2000);
      return { success: true, message: data.message || t("Orden enviada.") };
    } catch {
      return {
        success: false,
        code: "AGENT_UNREACHABLE",
        message: t("No se pudo contactar con el Agente VXCore (puerto 4000)."),
      };
    }
  };

  const toggleServerPower = async (id: string): Promise<PowerResult> => {
    const target = servers.find((s) => s.id === id);
    if (!target) return { success: false, code: "NOT_FOUND", message: t("Servidor no encontrado.") };

    if (target.status === "online" && !target.managed) {
      return {
        success: false,
        code: "NOT_MANAGED",
        message:
          t("Este servidor responde pero no lo arrancó VXCore, así que no podemos detenerlo. Párala desde la herramienta que lo lanzó."),
      };
    }

    return sendPowerAction(target, target.status === "online" ? "stop" : "start");
  };

  const restartServer = async (id: string): Promise<PowerResult> => {
    const target = servers.find((s) => s.id === id);
    if (!target) return { success: false, code: "NOT_FOUND", message: t("Servidor no encontrado.") };
    return sendPowerAction(target, "restart");
  };

  const allowFirewall = async (): Promise<boolean> => {
    if (!firewallRequest) return false;
    const { program, ruleName, serverId } = firewallRequest;

    try {
      const res = await fetch(`${AGENT_URL}/api/server/firewall-allow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program, ruleName }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.ok !== true) {
        if (data.code === "PERMISSION_DENIED") {
          setFirewallRequest(null);
          toast(t("El servidor no se ha arrancado"), {
            description:
              t("Sin el permiso de Windows Firewall, VXCore no puede levantar FXServer. Vuelve a darle a Arrancar cuando quieras concederlo."),
            duration: 9000,
          });
          return false;
        }

        toast.error(t("No se pudo conceder el permiso"), {
          description: data.error || t("Acepta la ventana de confirmación de Windows e inténtalo de nuevo."),
          duration: 8000,
        });
        return false;
      }

      setFirewallRequest(null);

      const target = servers.find((s) => s.id === serverId);
      if (target) {
        const result = await sendPowerAction(target, "start");
        if (result.success) {
          toast.success(t("Permiso concedido"), { description: result.message });
        } else {
          toast.error(t("Permiso concedido, pero no se pudo arrancar"), {
            description: result.message,
            duration: 8000,
          });
        }
      } else {
        toast.success(t("Permiso concedido"), {
          description: t("El servidor ya no está disponible para arrancarlo."),
        });
      }
      return true;
    } catch {
      toast.error(t("El agente VXCore no responde."));
      return false;
    }
  };

  const dismissFirewall = () => {
    if (!firewallRequest) return;
    setFirewallRequest(null);
    toast(t("El servidor se queda parado"), {
      description:
        t("VXCore necesita que Windows Firewall autorice a FXServer para poder arrancarlo. Nada más; puedes concederlo en cualquier momento."),
      duration: 8000,
    });
  };

  const activeServer = servers.find((s) => s.id === activeServerId) || servers[0] || null;

  return (
    <ServerContext.Provider
      value={{
        servers,
        activeServer,
        activeServerId,
        setActiveServerId,
        addServerFromConfig,
        removeServer,
        toggleServerPower,
        restartServer,
        refreshServers,
        agentOnline,
        loading,
        onboarding: !loading && servers.length === 0,
        fxUsage,
        firewallRequest,
        allowFirewall,
        dismissFirewall,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServerContext() {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error(t("useServerContext must be used within a ServerProvider"));
  }
  return context;
}
