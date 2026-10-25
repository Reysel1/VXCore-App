"use client";

import React, { useEffect, useState } from "react";
import { AGENT_URL } from "@/lib/agent";
import {
  Settings,
  Server,
  Database,
  Save,
  FileCode,
  Globe,
  Cpu,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  Loader2,
  Rocket,
  FolderTree
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useServerContext } from "@/context/server-context";
import { parseServerCfg } from "@/lib/cfg-parser";
import { AiProviderCard } from "@/components/settings/ai-provider-card";
import { DiscordCard } from "@/components/settings/discord-card";
import { UpdatesCard } from "@/components/settings/updates-card";
import { PathsCard } from "@/components/settings/paths-card";
import { RemoteAccessCard } from "@/components/settings/remote-access-card";
import { OneSyncCard } from "@/components/settings/onesync-card";
import { ServerSettingsCard } from "@/components/settings/server-settings-card";
import { InGameResourceStatus } from "@/components/settings/ingame-resource";
import { LanguageCard } from "@/components/settings/language-card";
import Link from "next/link";
import { t } from "@/i18n";

export default function SettingsPage() {
  const { activeServer, loading: contextLoading } = useServerContext();

  if (contextLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="size-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm">{t("Cargando configuración del servidor...")}</p>
      </div>
    );
  }

  if (!activeServer) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Settings className="size-8 text-muted-foreground" />
          </div>
          <div className="space-y-2 max-w-md">
            <h2 className="text-2xl font-bold">{t("Sin servidor activo")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("Añade un servidor para configurarlo. Si el tuyo no aparece, dile aquí abajo dónde está y VXCore lo encontrará solo.")}
            </p>
          </div>
          <Button render={<Link href="/servers" />} className="bg-primary hover:bg-primary/90">
            {t("Ir a Servidores")}
          </Button>
        </div>

        <LanguageCard />
        <PathsCard />
        <RemoteAccessCard />
      </div>
    );
  }

  return <SettingsForm server={activeServer} />;
}

function SettingsForm({ server }: { server: NonNullable<ReturnType<typeof import("@/context/server-context").useServerContext>["activeServer"]> }) {
  const { addServerFromConfig } = useServerContext();

  const [cfgCode, setCfgCode] = useState(
    server.rawContent || generateCfgFromFields(server)
  );

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("editor");

  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get("tab");
    const validas = ["editor", "general", "database", "paths", "agent", "ai", "discord", "system"];
    if (!pedida || !validas.includes(pedida)) return;
    const id = requestAnimationFrame(() => setTab(pedida));
    return () => cancelAnimationFrame(id);
  }, []);
  const [savedCfg, setSavedCfg] = useState(cfgCode);
  const dirty = cfgCode !== savedCfg;

  const handleSaveSettings = async () => {
    setLoading(true);
    setSaveStatus(null);

    const updatedCfg = cfgCode;
    const parsed = parseServerCfg(updatedCfg);

    try {
      const res = await fetch(`${AGENT_URL}/api/server/save-cfg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cfgContent: updatedCfg,
          filePath: server.cfgPath,
        }),
      });
      await res.json();
      if (res.ok) {
        setSavedCfg(updatedCfg);
        setSaveStatus(t("✅ Guardado"));
      } else {
        setSaveStatus(t("⚠️ Guardado en estado local del panel (Agente no pudo escribir en disco)."));
      }
    } catch {
      setSaveStatus(t("⚠️ Agente desconectado — configuración guardada en el panel solamente."));
    }

    await addServerFromConfig(parsed, server.cfgPath);
    setLoading(false);

    setTimeout(() => setSaveStatus(null), 5000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("Configuración del Servidor")}</h2>
          <p className="text-muted-foreground mt-1">
            {t("Parámetros de")}{" "}<span className="font-semibold text-primary">{server.name}</span>{" "}{t("y edición directa de")}{" "}
            <code className="text-xs bg-muted p-1 rounded font-mono">server.cfg</code>
            {server.cfgPath && (
              <span className="text-xs text-blue-400 ml-2 font-mono">({server.cfgPath})</span>
            )}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="w-full space-y-6">
        <TabsList className="max-w-full overflow-x-auto justify-start bg-muted/50 border border-border/50">
          <TabsTrigger value="editor" className="gap-1.5"><FileCode className="size-4" />{" "}{t("Editor server.cfg")}</TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5"><Server className="size-4" />{" "}{t("General & FXServer")}</TabsTrigger>
          <TabsTrigger value="database" className="gap-1.5"><Database className="size-4" />{" "}{t("Base de Datos")}</TabsTrigger>
          <TabsTrigger value="paths" className="gap-1.5"><FolderTree className="size-4" />{" "}{t("Rutas")}</TabsTrigger>
          <TabsTrigger value="agent" className="gap-1.5"><Cpu className="size-4" />{" "}{t("Agente & In-Game")}</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Sparkles className="size-4" />{" "}{t("Agente IA")}</TabsTrigger>
          <TabsTrigger value="discord" className="gap-1.5"><MessageSquare className="size-4" />{" "}{t("Discord & Staff")}</TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5"><Rocket className="size-4" />{" "}{t("Sistema")}</TabsTrigger>
        </TabsList>

        <TabsContent value="paths">
          <PathsCard />
        </TabsContent>

        <TabsContent value="ai">
          <AiProviderCard />
        </TabsContent>

        <TabsContent value="discord">
          <DiscordCard />
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <LanguageCard />
          <RemoteAccessCard onFixDiscord={() => setTab("discord")} />
          <UpdatesCard />
        </TabsContent>

        <TabsContent value="editor">
          <Card className="border-border/50 bg-background/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <FileCode className="size-5 text-purple-400" />
                {t("Editor en Vivo de server.cfg")}
                {server.cfgPath && (
                  <Badge variant="outline" className="ml-2 bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                    📄 {server.cfgPath}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {server.rawContent
                  ? t("Contenido real cargado desde el archivo server.cfg detectado por el Agente.")
                  : t("Edita directamente el archivo de configuración del servidor en el VPS.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={cfgCode}
                onChange={(e) => setCfgCode(e.target.value)}
                className="font-mono text-xs min-h-[400px] bg-[#0d0d0d] border-border/50 leading-relaxed"
              />
            </CardContent>
            <CardFooter className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {t("{length} líneas • {length2} recursos detectados", { length: cfgCode.split("\n").length, length2: server.resources.length })}
                {saveStatus && <span className="ml-2 text-emerald-400">{saveStatus}</span>}
              </span>
              {dirty && (
                <Button onClick={handleSaveSettings} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Save className="mr-2 size-4" />
                  {loading ? t("Guardando...") : t("Guardar server.cfg")}
                </Button>
              )}
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <OneSyncCard />

          <ServerSettingsCard
            cfgPath={server.cfgPath}
            icon={<Globe className="size-5 text-primary" />}
            title={t("Identidad del servidor")}
            description={t("Lo que ve la gente en la lista de FiveM. Se guarda solo, en la línea que le toca de tu server.cfg.")}
            fields={[
              { name: "sv_hostname", label: t("Nombre (sv_hostname)"), placeholder: t("Mi servidor de rol") },
              {
                name: "sv_maxclients",
                label: t("Slots máximos (sv_maxclients)"),
                type: "number",
                mono: true,
                hint: t("Con OneSync apagado el tope real son 32."),
              },
              { name: "sv_projectName", label: t("Nombre del proyecto (sv_projectName)") },
              { name: "sv_projectDesc", label: t("Descripción (sv_projectDesc)") },
              {
                name: "locale",
                label: t("Idioma (locale)"),
                placeholder: "es-ES",
                mono: true,
              },
              {
                name: "load_server_icon",
                label: t("Icono (load_server_icon)"),
                placeholder: "icono.png",
                mono: true,
                hint: t("PNG de 96x96 dentro de la carpeta del servidor."),
              },
            ]}
          />

          <ServerSettingsCard
            cfgPath={server.cfgPath}
            icon={<Cpu className="size-5 text-amber-400" />}
            title={t("Motor y seguridad")}
            description={t("Cómo arranca FXServer. Estos cambios entran en el próximo reinicio del servidor.")}
            fields={[
              {
                name: "sv_enforceGameBuild",
                label: t("Build del juego (sv_enforceGameBuild)"),
                mono: true,
                placeholder: "3095",
                hint: t("El DLC que exige tu servidor. Cambiarlo puede romper recursos."),
              },
              {
                name: "sv_scriptHookAllowed",
                label: t("Permitir ScriptHook"),
                options: [
                  { value: "0", label: t("No (recomendado)") },
                  { value: "1", label: "Sí" },
                ],
                hint: t("Con esto en «Sí» cualquiera puede usar menús de trampas."),
              },
              {
                name: "sv_endpointprivacy",
                label: t("Ocultar IPs de jugadores"),
                options: [
                  { value: "true", label: t("Sí, ocultarlas") },
                  { value: "false", label: "No" },
                ],
              },
              {
                name: "sv_licenseKey",
                label: t("Clave de licencia (sv_licenseKey)"),
                mono: true,
                hint: t("La de keymaster.fivem.net. Sin ella el servidor no arranca."),
              },
              {
                name: "steam_webApiKey",
                label: t("Clave de Steam (steam_webApiKey)"),
                mono: true,
                hint: t("Opcional: sólo si quieres identificadores de Steam."),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <ServerSettingsCard
            cfgPath={server.cfgPath}
            icon={<Database className="size-5 text-blue-500" />}
            title={t("Conexión a base de datos")}
            description={t("La cadena que usa oxmysql para QBCore, ESX u ox_core.")}
            fields={[
              {
                name: "mysql_connection_string",
                label: t("Cadena de conexión (mysql_connection_string)"),
                mono: true,
                placeholder: "server=localhost;uid=root;password=;database=mi_bd",
              },
            ]}
          />

          <Card className="border-border/50 bg-background/50 backdrop-blur">
            <CardContent className="pt-6">
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="size-5 text-emerald-500" />
                  <div>
                    <p className="font-semibold">{t("Base de datos vinculada:")}{" "}<span className="font-mono text-primary">{server.database}</span></p>
                    <p className="text-xs text-muted-foreground">{t("El agente verifica las consultas SQL del driver oxmysql automáticamente.")}</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{t("Estado OK")}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent">
          <Card className="border-border/50 bg-background/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Sparkles className="size-5 text-emerald-500" />
                {t("Integración de Agente & Menú In-Game (F5)")}
              </CardTitle>
              <CardDescription>
                {t("Parámetros del proceso del agente de VXCore y el recurso in-game `vxcore`.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">{t("Puerto de API de Agente:")}</label>
                  <Input value="4000" disabled className="bg-muted/50 font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">{t("Tecla por defecto para Menú In-Game:")}</label>
                  <Input defaultValue="F5" className="bg-background font-mono text-xs" />
                </div>
              </div>
              {server.cfgPath && (
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs flex items-center justify-between">
                  <span>{t("Archivo de configuración detectado:")}{" "}<strong className="font-mono">{server.cfgPath}</strong></span>
                  <Badge className="bg-blue-500 text-white">Auto-detectado</Badge>
                </div>
              )}
              <InGameResourceStatus />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

type ActiveServer = NonNullable<ReturnType<typeof useServerContext>["activeServer"]>;

function generateCfgFromFields(server: ActiveServer): string {
  return `# VXCore Configuration - ${server.name}
endpoint_add_tcp "${server.ip || "0.0.0.0:30120"}"
endpoint_add_udp "${server.ip || "0.0.0.0:30120"}"

sv_hostname "${server.name}"
set sv_maxclients ${server.maxClients || 64}

# Core Resources
${(server.resources || []).map((r) => `ensure ${r.name}`).join("\n")}
`;
}
