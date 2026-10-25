"use client";

import React, { useState } from "react";
import { AGENT_URL } from "@/lib/agent";
import Link from "next/link";
import {
  Server,
  Activity,
  HardDrive,
  Users,
  Settings,
  Plus,
  Power,
  RefreshCcw,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Database,
  ShieldCheck,
  Layers,
  Globe,
  Sparkles,
  Trash2,
  Check,
  Loader2,
  Wifi,
  WifiOff,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PathPicker } from "@/components/common/path-picker";
import { parseServerCfg, ParsedServerConfig } from "@/lib/cfg-parser";
import { CreateServerDialog } from "@/components/onboarding/create-server-dialog";

const DEFAULT_CFG_SAMPLE = `# VXCore Real Server Configuration
endpoint_add_tcp "0.0.0.0:30120"
endpoint_add_udp "0.0.0.0:30120"

sv_hostname "VXCore Roleplay - Servidor España #1 [QBCore Real]"
set sv_maxclients 64
sv_licenseKey "cfxk_fiveos_real_license_key_detected"

# Database Configuration (oxmysql)
set mysql_connection_string "user=root;database=qbcoreframework_db;host=127.0.0.1;password=secret_password"
ensure oxmysql

# Core Resources
ensure qb-core
ensure qb-policejob
ensure qb-ambulancejob
ensure qb-inventory
ensure ox_lib
ensure fiveos-agent
`;

import { useServerContext, type ServerNode } from "@/context/server-context";
import { t } from "@/i18n";

export default function ServersPage() {
  const {
    servers,
    activeServerId,
    setActiveServerId,
    addServerFromConfig,
    removeServer,
    toggleServerPower,
    refreshServers,
    loading: contextLoading,
    agentOnline
  } = useServerContext();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cfgText, setCfgText] = useState(DEFAULT_CFG_SAMPLE);
  const [filePath, setFilePath] = useState("C:\\FXServer\\server-data\\server.cfg");
  const [parsedConfig, setParsedConfig] = useState<ParsedServerConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [busyServerId, setBusyServerId] = useState<string | null>(null);

  const handlePowerToggle = async (server: ServerNode) => {
    setBusyServerId(server.id);
    try {
      const result = await toggleServerPower(server.id);
      if (result.success) {
        toast.success(result.message, { description: server.name });
      } else if (!result.handled) {
        toast.error(
          server.status === "online" ? t("No se pudo detener el servidor") : t("No se pudo arrancar el servidor"),
          { description: result.message, duration: 9000 }
        );
      }
    } finally {
      setBusyServerId(null);
    }
  };

  const handleParseText = () => {
    try {
      setErrorMsg("");
      const parsed = parseServerCfg(cfgText);
      setParsedConfig(parsed);
    } catch (e) {
      setErrorMsg(t("Error analizando el archivo server.cfg: ") + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleFetchFromAgent = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${AGENT_URL}/api/server/parse-cfg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath })
      });
      const data = await res.json();
      if (res.ok && data.server) {
        setParsedConfig(data.server);
        setCfgText(data.server.rawContent || cfgText);
      } else {
        setErrorMsg(data.error || t("No se pudo leer el archivo en la ruta del servidor."));
      }
    } catch {
      handleParseText();
    } finally {
      setLoading(false);
    }
  };

  const handleAddServer = async () => {
    const config = parsedConfig || parseServerCfg(cfgText);
    await addServerFromConfig(config, filePath);
    setDialogOpen(false);
    setTimeout(() => refreshServers(), 500);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("Servidores")}</h2>
          <p className="text-muted-foreground mt-1">{t("Gestiona todos tus nodos, VPS y archivos `server.cfg` conectados.")}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => refreshServers()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {contextLoading ? t("Buscando...") : t("Actualizar")}
          </Button>

          <Button variant="outline" onClick={() => setCreateOpen(true)} disabled={!agentOnline}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t("Crear servidor desde cero")}
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={
              <Button className="bg-primary hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" />
                {t("Añadir Servidor Real")}
              </Button>
            } />

            <DialogContent className="sm:max-w-2xl bg-background/95 backdrop-blur border-border/50">
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  {t("Añadir Servidor mediante `server.cfg`")}
                </DialogTitle>
                <DialogDescription>
                  {t("VXCore analizará tu configuración de FiveM para autodetectar la base de datos, el framework, los recursos y la licencia.")}
                </DialogDescription>
              </DialogHeader>

              <DialogBody className="space-y-4">
              <Tabs defaultValue="paste" className="mt-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="paste" className="gap-2">
                    <FileCode className="size-4" />{" "}{t("Pegar `server.cfg`")}
                  </TabsTrigger>
                  <TabsTrigger value="vps" className="gap-2">
                    <Globe className="size-4" />{" "}{t("Ruta en VPS")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="space-y-4 pt-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">{t("Contenido del archivo server.cfg:")}</label>
                    <Textarea
                      value={cfgText}
                      onChange={(e) => {
                        setCfgText(e.target.value);
                        setParsedConfig(parseServerCfg(e.target.value));
                      }}
                      placeholder={t("Pega aquí el contenido de tu server.cfg...")}
                      className="font-mono text-xs min-h-[160px] bg-[#0d0d0d] border-border/50"
                    />
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleParseText} className="w-full">
                    <Sparkles className="mr-2 size-3.5" />{" "}{t("Analizar Configuración Manualmente")}
                  </Button>
                </TabsContent>

                <TabsContent value="vps" className="space-y-4 pt-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">{t("Ruta absoluta del server.cfg:")}</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={filePath}
                        onChange={(e) => setFilePath(e.target.value)}
                        placeholder={t("ej. C:\\FXServer\\server-data\\server.cfg")}
                        className="min-w-0 flex-1 font-mono text-xs bg-[#0d0d0d]"
                      />
                      <div className="flex gap-2">
                      <PathPicker
                        value={filePath}
                        onSelect={(picked) => {
                          setFilePath(picked);
                          setErrorMsg("");
                        }}
                        mode="file"
                        extensions={["cfg"]}
                        title={t("Busca tu server.cfg")}
                        compact
                      />
                      <Button
                        onClick={handleFetchFromAgent}
                        disabled={loading}
                        className="flex-1 sm:flex-none"
                      >
                        {loading ? t("Leyendo...") : t("Leer con Agente")}
                      </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {parsedConfig && (
                <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-primary tracking-wider">{t("Configuración Detectada")}</span>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                      <CheckCircle2 className="mr-1 size-3" /> Auto-Configurado
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-xs text-muted-foreground">{t("Nombre del Servidor:")}</span>
                      <p className="font-semibold text-foreground truncate">{parsedConfig.name}</p>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-xs text-muted-foreground">{t("Framework Detectado:")}</span>
                      <p className="flex min-w-0 items-center gap-1 font-medium text-emerald-400">
                        <Layers className="size-3.5 shrink-0" /> <span className="truncate">{parsedConfig.framework}</span>
                      </p>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-xs text-muted-foreground">{t("Slots Max:")}</span>
                      <p className="font-mono">{t("{maxClients} Jugadores", { maxClients: parsedConfig.maxClients })}</p>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-xs text-muted-foreground">{t("Base de Datos:")}</span>
                      <p className="flex min-w-0 items-center gap-1 font-mono text-xs text-blue-400">
                        <Database className="size-3.5 shrink-0" /> <span className="truncate">{parsedConfig.database.connected ? parsedConfig.database.dbName : t("No especificada")}</span>
                      </p>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-xs text-muted-foreground">{t("Recursos `ensure`:")}</span>
                      <p className="font-mono text-xs text-foreground/90">{t("{length} recursos en auto-start", { length: parsedConfig.resources.length })}</p>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-xs text-muted-foreground">{t("Licencia Key:")}</span>
                      <p className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="size-3.5 shrink-0" /> {parsedConfig.licenseKeyConfigured ? t("Válida & Configurada") : t("Sin Clave")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              </DialogBody>

              <DialogFooter className="mt-4">
                <Button variant="destructive" onClick={() => setDialogOpen(false)}>{t("Cancelar")}</Button>
                <Button onClick={handleAddServer} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="mr-2 size-4" />{" "}{t("Conectar & Importar Servidor")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <CreateServerDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            agentOnline={agentOnline}
            onCreated={async ({ cfgPath, serverDataPath, game, serverId }) => {
              if (game === "open77") {
                await refreshServers();
                if (serverId) setActiveServerId(serverId);
                toast.success(t("Servidor de Open77 añadido."), { description: serverDataPath });
                return;
              }
              const read = await fetch(`${AGENT_URL}/api/server/read-cfg`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cfgPath }),
              });
              const cfg = await read.json();
              if (cfg.success) {
                await addServerFromConfig(parseServerCfg(cfg.rawContent), cfgPath);
                await refreshServers();
              }
              toast.success(t("Servidor creado y añadido."), { description: serverDataPath });
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Wifi className="size-3 text-emerald-500" />{" "}{t("En línea: responde por red")}
        </span>
        <span className="flex items-center gap-1.5">
          <ExternalLink className="size-3 text-amber-500" />{" "}{t("En línea (externo): lo arrancó otra herramienta, sin consola")}
        </span>
        <span className="flex items-center gap-1.5">
          <WifiOff className="size-3 text-muted-foreground" />{" "}{t("Detenido: el agente puede arrancarlo")}
        </span>
      </div>

      {servers.length === 0 && !contextLoading && (
        <Card className="border-dashed border-2 border-border/50 bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Server className="size-12 text-muted-foreground/40" />
            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold">{t("Sin servidores")}</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {agentOnline
                  ? t("El agente no encontró ningún server.cfg en las rutas comunes. Crea uno desde cero, o usa 'Añadir Servidor Real' para importar uno que ya tengas.")
                  : t("Inicia el Agente VXCore (puerto 4000) para auto-detectar servidores, o añade uno manualmente.")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {servers.map((server) => {
          const isActive = server.id === activeServerId;
          return (
            <Card
              key={server.id}
              className={`border-border/50 bg-background/50 backdrop-blur transition-all ${
                isActive ? "ring-2 ring-primary/60 border-primary/40 shadow-lg shadow-primary/5" : "hover:border-border"
              }`}
            >
              <CardHeader className="flex flex-row items-start justify-between pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Server className="size-5 text-primary" />
                      {server.name}
                    </CardTitle>
                    {isActive && (
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-2 py-0.5">
                        <Check className="size-3 mr-1" />{" "}{t("Activo")}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">{server.ip}</span>
                    <span>•</span>
                    {server.game === "open77" && (
                      <Badge
                        variant="outline"
                        className="border-yellow-400/40 bg-yellow-400/10 text-yellow-300 text-[10px] px-1.5 py-0"
                        title={t("Servidor de Cyberpunk 2077 (Open77)")}
                      >
                        Open77
                      </Badge>
                    )}
                    {server.game === "redm" && (
                      <Badge
                        variant="outline"
                        className="border-red-500/30 bg-red-500/10 text-red-400 text-[10px] px-1.5 py-0"
                        title={t("Servidor de Red Dead Redemption 2 (RedM)")}
                      >
                        RedM
                      </Badge>
                    )}
                    <span className="text-emerald-400 font-medium text-xs">{server.framework}</span>
                    {server.cfgPath && (
                      <>
                        <span>•</span>
                        <span className="text-blue-400 font-mono text-[10px]" title={server.cfgPath}>
                          📄 {server.cfgPath.length > 40 ? "..." + server.cfgPath.slice(-35) : server.cfgPath}
                        </span>
                      </>
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {server.status === "online" ? (
                    <Badge
                      variant="default"
                      className={
                        server.managed
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1"
                      }
                      title={
                        server.managed
                          ? t("En línea · Proceso lanzado por VXCore: consola y control total disponibles.")
                          : t("En línea · Responde por red pero lo arrancó otra herramienta: sin consola ni apagado desde aquí.")
                      }
                    >
                      {server.managed ? <Wifi className="size-3" /> : <ExternalLink className="size-3" />}
                      {server.managed ? t("Activo") : t("Externo")}
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-muted-foreground gap-1"
                      title={t("Detenido · Pulsa Iniciar para que VXCore lo arranque y abra la consola.")}
                    >
                      <WifiOff className="size-3" />
                      {t("Offline")}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeServer(server.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                    title={t("Eliminar servidor de la lista")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-xl border border-border/50">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Activity className="size-3.5" /> CPU</span>
                    <p className="text-sm font-medium">{server.cpu}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><HardDrive className="size-3.5" /> RAM</span>
                    <p className="text-sm font-medium">{server.ram}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="size-3.5" />{" "}{t("Jugadores")}</span>
                    <p className="text-sm font-medium">{server.players}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Database className="size-3.5 text-blue-400" />{" "}{t("Base de Datos")}</span>
                    <p className="text-xs font-mono font-medium text-foreground/90">{server.database}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Layers className="size-3.5" />{" "}{t("Recursos")}</span>
                    <p className="text-sm font-medium">{t("{length} en auto-start", { length: server.resources.length })}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Globe className="size-3.5" />{" "}{t("Uptime")}</span>
                    <p className="text-sm font-medium">{server.uptime}</p>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex justify-between items-center border-t border-border/50 pt-4 bg-muted/10">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe className="size-3.5" /> {server.location}
                </span>
                <div className="flex gap-2">
                  {!isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveServerId(server.id)}
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t("Seleccionar")}
                    </Button>
                  )}
                  {server.game === "open77" ? (
                    server.wardenUrl && (
                      <Button
                        render={<a href={server.wardenUrl} target="_blank" rel="noreferrer" />}
                        variant="outline"
                        size="sm"
                        className="h-8"
                        title={t("Panel de administración de Open77: consola, recursos y jugadores")}
                      >
                        <Settings className="mr-2 h-4 w-4" />{" "}Warden
                      </Button>
                    )
                  ) : (
                    <Button
                      onClick={() => setActiveServerId(server.id)}
                      render={<Link href="/settings" />}
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      <Settings className="mr-2 h-4 w-4" />{" "}{t("Configurar")}
                    </Button>
                  )}
                  <Button
                    onClick={() => handlePowerToggle(server)}
                    disabled={busyServerId === server.id}
                    variant={server.status === "online" ? "destructive" : "default"}
                    size="sm"
                    className={`h-8 ${server.status === "online" ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}
                  >
                    {busyServerId === server.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Power className="mr-2 h-4 w-4" />
                    )}
                    {server.status === "online" ? t("Detener") : t("Iniciar")}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
