"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  Code2,
  Download,
  FolderGit2,
  GitBranch,
  HardDriveDownload,
  Loader2,
  Play,
  RefreshCcw,
  ServerCog,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import { AGENT_URL } from "@/lib/agent";
import { useServerContext } from "@/context/server-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArtifactsPanel } from "@/components/development/artifacts-panel";
import { t, msg } from "@/i18n";

interface AiConfig {
  provider: string;
  model: string;
  baseUrl?: string;
  configured: boolean;
  keyHint?: string;
}

const PROVIDERS = [
  { value: "ollama", label: "Ollama", url: "http://127.0.0.1:11434/v1", model: "llama3.2", local: true },
  { value: "openai-compatible", label: msg("OpenAI compatible"), url: "https://api.openai.com/v1", model: "gpt-4o-mini", local: false },
  { value: "anthropic", label: "Anthropic", url: "", model: "claude-opus-5", local: false },
] as const;

export default function DevelopmentPage() {
  const { activeServer, agentOnline } = useServerContext();
  const [tab, setTab] = useState("overview");
  const [ai, setAi] = useState<AiConfig | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [artifact, setArtifact] = useState<{ status: string; detail: string; path?: string } | null>(null);
  const [workspace, setWorkspace] = useState(activeServer?.serverDataPath || "");

  const refresh = useCallback(
    () =>
      Promise.all([fetch(`${AGENT_URL}/api/ai/config`), fetch(`${AGENT_URL}/api/requirements`)])
        .then(async ([aiRes, reqRes]) => {
          const aiData = await aiRes.json().catch(() => ({}));
          if (aiData.success) setAi(aiData.config);
          const reqData = await reqRes.json().catch(() => ({}));
          const fx = Array.isArray(reqData.requirements) ? reqData.requirements.find((r: { id: string }) => r.id === "fxserver") : null;
          setArtifact(fx ? { status: fx.status, detail: fx.detail } : { status: "unknown", detail: t("No se pudo consultar el artifact.") });
        })
        .catch(() => {
          setArtifact({ status: "unknown", detail: t("El Agente VXCore no responde.") });
        })
        .finally(() => {
          setAiLoading(false);
        }),
    []
  );

  const load = useCallback(() => {
    setAiLoading(true);
    return refresh();
  }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  const [workspaceFor, setWorkspaceFor] = useState(activeServer?.serverDataPath);
  if (workspaceFor !== activeServer?.serverDataPath) {
    setWorkspaceFor(activeServer?.serverDataPath);
    if (activeServer?.serverDataPath) setWorkspace(activeServer.serverDataPath);
  }

  const artifactOk = artifact?.status === "ok";
  const aiProvider = PROVIDERS.find((provider) => provider.value === ai?.provider) || PROVIDERS[1];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Wrench className="size-4 text-primary" />{" "}{t("Workbench de desarrollo Cfx.re")}</div>
          <h1 className="text-3xl font-bold tracking-tight">{t("Desarrollo")}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">{t("Gestiona artifacts, recursos y asistentes de código desde el mismo entorno local de VXCore.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={agentOnline ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}>{agentOnline ? t("Agente conectado") : t("Agente desconectado")}</Badge>
          {activeServer && <Badge variant="outline" className="font-mono">{activeServer.name}</Badge>}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto bg-muted/50">
          <TabsTrigger value="overview" className="gap-2"><Wrench className="size-4" />{" "}{t("Resumen")}</TabsTrigger>
          <TabsTrigger value="artifacts" className="gap-2"><HardDriveDownload className="size-4" /> Artifacts</TabsTrigger>
          <TabsTrigger value="ai" className="gap-2"><Sparkles className="size-4" />{" "}{t("IA local")}</TabsTrigger>
          <TabsTrigger value="workspace" className="gap-2"><FolderGit2 className="size-4" />{" "}{t("Workspace")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatusCard icon={ServerCog} title={t("Servidor")} value={activeServer?.name || "Sin servidor"} detail={activeServer?.status === "online" ? t("En ejecución") : t("Detenido")} tone={activeServer?.status === "online" ? "green" : "amber"} />
            <StatusCard icon={HardDriveDownload} title={t("FXServer artifact")} value={artifactOk ? "Disponible" : "Pendiente"} detail={artifact?.detail || t("Consultando…")} tone={artifactOk ? "green" : "amber"} />
            <StatusCard icon={Bot} title={t("Asistente IA")} value={ai?.configured ? aiProvider.label : "Sin configurar"} detail={ai?.model || t("Configura un modelo")} tone={ai?.configured ? "green" : "amber"} />
            <StatusCard icon={Code2} title={t("Workspace")} value={activeServer?.resources.length ? `${activeServer.resources.length} recursos` : "Sin recursos"} detail={activeServer?.serverDataPath || t("Selecciona un servidor")} tone="blue" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><RocketIcon />{" "}{t("Acciones rápidas")}</CardTitle><CardDescription>{t("Los flujos habituales de una sesión de desarrollo.")}</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2"><QuickAction icon={HardDriveDownload} label={t("Gestionar artifacts")} onClick={() => setTab("artifacts")} /><QuickAction icon={Sparkles} label={t("Configurar IA local")} onClick={() => setTab("ai")} /><QuickAction icon={FolderGit2} label={t("Abrir workspace")} onClick={() => setTab("workspace")} /><QuickAction icon={TerminalSquare} label={t("Abrir consola")} href="/console" /></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-400" />{" "}{t("Entorno local")}</CardTitle><CardDescription>{t("Principios de seguridad de la workbench.")}</CardDescription></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>{t("El agente trabaja en loopback y el panel no accede directamente al disco ni a procesos.")}</p><p>{t("Las actualizaciones se preparan en staging y mantienen una copia de recuperación.")}</p><p>{t("Ollama puede ejecutarse completamente en local, sin enviar código a un proveedor externo.")}</p></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="artifacts" className="space-y-6">
          <ArtifactsPanel agentOnline={agentOnline} onChanged={load} />
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <AiWorkbenchCard config={ai} loading={aiLoading} onSaved={load} />
        </TabsContent>

        <TabsContent value="workspace" className="space-y-6">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><FolderGit2 className="size-5 text-blue-400" />{" "}{t("Workspace de recursos")}</CardTitle><CardDescription>{t("El espacio seleccionado por VXCore para editar, importar y probar recursos Cfx.re.")}</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"><div className="space-y-2"><Label>{t("Ruta del workspace")}</Label><Input value={workspace} onChange={(event) => setWorkspace(event.target.value)} placeholder={t("Selecciona un servidor para detectar su workspace")} className="font-mono text-xs" /></div><Button variant="outline" onClick={() => toast.info(t("La selección de carpeta se gestiona desde Ajustes → Rutas."))}><Settings2 className="mr-2 size-4" />{" "}{t("Configurar ruta")}</Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MiniInfo title={t("Recursos")} detail={t("{valor} detectados", { valor: activeServer?.resources.length || 0 })} /><MiniInfo title={t("Editor")} detail={t("Editar archivos Lua y manifest")} /><MiniInfo title="GitHub" detail={t("Importar recursos compatibles")} /><MiniInfo title={t("Logs")} detail={t("Validar cambios en vivo")} /></div><div className="flex flex-wrap gap-2"><Button render={<Link href="/editor" />}><Code2 className="mr-2 size-4" />{" "}{t("Abrir editor")}</Button><Button variant="outline" render={<Link href="/marketplace" />}><GitBranch className="mr-2 size-4" />{" "}{t("Marketplace / GitHub")}</Button><Button variant="outline" render={<Link href="/logs" />}><TerminalSquare className="mr-2 size-4" />{" "}{t("Ver logs")}</Button></div></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusCard({ icon: Icon, title, value, detail, tone }: { icon: typeof ServerCog; title: string; value: string; detail: string; tone: "green" | "amber" | "blue" }) {
  const tones = { green: "text-emerald-400", amber: "text-amber-400", blue: "text-blue-400" };
  return <Card><CardContent className="p-4"><Icon className={`mb-3 size-5 ${tones[tone]}`} /><p className="text-xs text-muted-foreground">{title}</p><p className="mt-1 truncate font-semibold" title={value}>{value}</p><p className="mt-1 truncate text-[11px] text-muted-foreground" title={detail}>{detail}</p></CardContent></Card>;
}

function QuickAction({ icon: Icon, label, onClick, href }: { icon: typeof Code2; label: string; onClick?: () => void; href?: string }) {
  return <Button variant="outline" className="justify-start" onClick={onClick} render={href ? <Link href={href} /> : undefined}><Icon className="mr-2 size-4" />{label}</Button>;
}
function MiniInfo({ title, detail }: { title: string; detail: string }) { return <div className="rounded-lg border border-border/50 bg-muted/20 p-3"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function RocketIcon() { return <Download className="size-5 text-emerald-400" />; }

function AiWorkbenchCard({ config, loading, onSaved }: { config: AiConfig | null; loading: boolean; onSaved: () => void }) {
  const [provider, setProvider] = useState(config?.provider || "ollama");
  const [model, setModel] = useState(config?.model || "llama3.2");
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl || "http://127.0.0.1:11434/v1");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const selected = PROVIDERS.find((item) => item.value === provider) || PROVIDERS[0];

  const [syncedConfig, setSyncedConfig] = useState<AiConfig | null>(null);
  if (syncedConfig !== config) {
    setSyncedConfig(config);
    if (config) {
      setProvider(config.provider); setModel(config.model); setBaseUrl(config.baseUrl || (config.provider === "ollama" ? PROVIDERS[0].url : PROVIDERS[1].url));
    }
  }

  const discover = async () => {
    setDiscovering(true);
    try {
      const root = provider === "ollama" ? baseUrl.replace(/\/v1\/?$/, "") : baseUrl;
      const response = await fetch(`${AGENT_URL}/api/ai/models?baseUrl=${encodeURIComponent(root)}&provider=${provider}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || t("No se pudieron detectar modelos."));
      setModels(Array.isArray(data.models) ? data.models : []);
      toast.success(t("{valor} modelos detectados", { valor: data.models?.length || 0 }));
    } catch (error) { toast.error(t("No se pudieron detectar modelos"), { description: error instanceof Error ? error.message : t("Comprueba que Ollama esté iniciado.") }); }
    finally { setDiscovering(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${AGENT_URL}/api/ai/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, model, baseUrl: baseUrl || undefined, apiKey: apiKey || undefined }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || t("El agente rechazó la configuración."));
      setApiKey(""); onSaved(); toast.success(t("Proveedor IA guardado"));
    } catch (error) { toast.error(t("No se pudo guardar"), { description: error instanceof Error ? error.message : t("Error desconocido") }); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try { const response = await fetch(`${AGENT_URL}/api/ai/test`, { method: "POST" }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || data.error || t("La prueba falló.")); toast.success(data.message || t("Conexión correcta")); }
    catch (error) { toast.error(t("La prueba falló"), { description: error instanceof Error ? error.message : t("Error desconocido") }); }
    finally { setTesting(false); }
  };

  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" />{" "}{t("Proveedores de IA y modelos locales")}</CardTitle><CardDescription>{t("Usa Ollama sin sacar tu código del equipo o conecta un proveedor remoto compatible con el asistente del editor.")}</CardDescription></CardHeader><CardContent className="space-y-5">{loading ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{" "}{t("Cargando configuración…")}</div> : <><div className="grid gap-2 md:grid-cols-3">{PROVIDERS.map((item) => <button key={item.value} type="button" onClick={() => { setProvider(item.value); setModel(item.model); setBaseUrl(item.url); }} className={`rounded-xl border p-3 text-left transition-colors ${provider === item.value ? "border-primary/50 bg-primary/10" : "border-border/50 bg-muted/10 hover:bg-muted/30"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{t(item.label)}</span>{item.local ? <Badge variant="outline" className="text-[10px] text-emerald-400">{t("Local")}</Badge> : <Badge variant="outline" className="text-[10px]">{t("Cloud")}</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{item.local ? t("Privacidad total y sin API key obligatoria.") : t("Proveedor externo configurable.")}</p></button>)}</div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>{t("Modelo")}</Label><div className="flex gap-2"><Input value={model} onChange={(event) => setModel(event.target.value)} className="font-mono text-xs" list="development-models" /><Button variant="outline" onClick={discover} disabled={discovering || !baseUrl} title={t("Detectar modelos")}>{discovering ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}</Button></div><datalist id="development-models">{models.map((item) => <option key={item} value={item} />)}</datalist></div><div className="space-y-2"><Label>{t("URL base")}</Label><Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} className="font-mono text-xs" /></div></div>{selected.local ? <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">{t("Ollama: inicia `ollama serve` y descarga un modelo con `ollama pull")}{" "}{model || "llama3.2"}{t("`. VXCore consultará sus modelos mediante `/api/tags`.")}</p> : <div className="space-y-2"><Label>{t("API key")}{" "}{config?.keyHint && <span className="font-normal text-muted-foreground">({config.keyHint})</span>}</Label><Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t("Deja vacío para conservar la guardada")} className="font-mono text-xs" /></div>}<div className="flex flex-wrap justify-between gap-2 border-t border-border/50 pt-4"><Button variant="outline" onClick={test} disabled={testing || !config?.configured}>{testing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}{" "}{t("Probar conexión")}</Button><Button onClick={save} disabled={saving}><CheckCircle2 className="mr-2 size-4" />{" "}{t("Guardar proveedor")}</Button></div></>}</CardContent></Card>;
}
