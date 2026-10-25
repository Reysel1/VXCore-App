"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AGENT_URL } from "@/lib/agent";
import {
  File,
  Search,
  Play,
  Save,
  Sparkles,
  Bot,
  User,
  Send,
  Check,
  Loader2,
  AlertTriangle,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useServerContext } from "@/context/server-context";
import { toast } from "sonner";
import Link from "next/link";
import { t } from "@/i18n";

interface ResourceFile {
  path: string;
  isDir: boolean;
  editable: boolean;
}

interface ChatMessage {
  role: "user" | "ai";
  content: string;
  diff?: { file: string; newCode: string };
  isError?: boolean;
}

export default function EditorPage({ params }: { params: Promise<{ resource: string }> }) {
  const unwrappedParams = React.use(params);
  const { activeServer } = useServerContext();
  const resourceName = decodeURIComponent(unwrappedParams?.resource || "");
  const serverDataPath = activeServer?.serverDataPath;

  const [files, setFiles] = useState<ResourceFile[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [fileFilter, setFileFilter] = useState("");

  const [activeFile, setActiveFile] = useState<string>("");
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [loadingFile, setLoadingFile] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [inputValue, setInputValue] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!resourceName || !serverDataPath) {
      const temporizador = setTimeout(() => {
        setLoadingTree(false);
        setLoadError(
          !serverDataPath
            ? t("No hay un servidor activo con ruta en disco, así que no se puede abrir el recurso.")
            : t("No se ha indicado ningún recurso.")
        );
      }, 0);
      return () => clearTimeout(temporizador);
    }

    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadingTree(true);
      setLoadError(null);

      try {
        const params = new URLSearchParams({ name: resourceName, serverDataPath });
        const res = await fetch(`${AGENT_URL}/api/resource/files?${params}`);
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.success) {
          setLoadError(data.error || t("No se pudo listar el recurso."));
          setFiles([]);
          return;
        }

        const files: ResourceFile[] = data.files ?? [];
        setFiles(files);
        const first = files.find((f) => f.editable);
        if (first) setActiveFile(first.path);
      } catch {
        if (!cancelled) setLoadError(t("El Agente VXCore no responde en el puerto 4000."));
      } finally {
        if (!cancelled) setLoadingTree(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resourceName, serverDataPath]);

  const loadFile = useCallback(
    async (filePath: string) => {
      if (!serverDataPath || fileContents[filePath] !== undefined) return;
      setLoadingFile(true);
      try {
        const params = new URLSearchParams({ name: resourceName, serverDataPath, filePath });
        const res = await fetch(`${AGENT_URL}/api/resource/file?${params}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setFileContents((prev) => ({ ...prev, [filePath]: data.content }));
        } else {
          toast.error(t("No se pudo abrir {filePath}", { filePath }), { description: data.error });
        }
      } catch {
        toast.error(t("El Agente VXCore no responde"));
      } finally {
        setLoadingFile(false);
      }
    },
    [resourceName, serverDataPath, fileContents]
  );

  useEffect(() => {
    if (!activeFile) return;
    const initial = setTimeout(() => loadFile(activeFile), 0);
    return () => clearTimeout(initial);
  }, [activeFile, loadFile]);

  useEffect(() => {
    fetch(`${AGENT_URL}/api/ai/config`)
      .then((r) => r.json())
      .then((d) => setAiConfigured(Boolean(d?.config?.configured)))
      .catch(() => setAiConfigured(false));
  }, []);

  const currentCode = fileContents[activeFile] ?? "";

  const handleSaveFile = async () => {
    if (!activeFile || !serverDataPath) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/resource/save-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceName, filePath: activeFile, content: currentCode, serverDataPath }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        toast.success(t("{activeFile} guardado", { activeFile }));
      } else {
        toast.error(t("No se pudo guardar"), { description: data.error });
      }
    } catch {
      toast.error(t("El Agente VXCore no responde"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestartResource = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/server/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `restart ${resourceName}` }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t("Reinicio de {resourceName} enviado a la consola", { resourceName }));
      } else {
        toast.error(t("No se pudo reiniciar el recurso"), { description: data.error });
      }
    } catch {
      toast.error(t("El Agente VXCore no responde"));
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isAiLoading) return;

    const userMsg = inputValue.trim();
    const history = messages
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role === "ai" ? ("assistant" as const) : ("user" as const), content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInputValue("");
    setIsAiLoading(true);

    try {
      const res = await fetch(`${AGENT_URL}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          resource: resourceName,
          activeFile,
          currentCode,
          files: files.filter((f) => !f.isDir).map((f) => f.path),
          history,
          serverContext: {
            framework: activeServer?.framework,
            database: activeServer?.database,
            name: activeServer?.name,
          },
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessages((prev) => [...prev, { role: "ai", content: data.reply, diff: data.diff }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: data.error || t("El proveedor de IA devolvió un error."), isError: true },
        ]);
        if (data.code === "NOT_CONFIGURED") setAiConfigured(false);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: t("No se pudo contactar con el Agente VXCore (puerto 4000)."), isError: true },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApplyDiff = async (diff: { file: string; newCode: string }) => {
    const target = diff.file || activeFile;
    setFileContents((prev) => ({ ...prev, [target]: diff.newCode }));
    setActiveFile(target);

    if (!serverDataPath) return;
    try {
      const res = await fetch(`${AGENT_URL}/api/resource/save-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceName, filePath: target, content: diff.newCode, serverDataPath }),
      });
      const data = await res.json();
      if (res.ok && data.success) toast.success(t("{target} actualizado y guardado", { target }));
      else toast.error(t("Cambio aplicado en el editor pero no guardado"), { description: data.error });
    } catch {
      toast.error(t("Cambio aplicado en el editor pero no guardado"));
    }
  };

  const visibleFiles = useMemo(() => {
    const needle = fileFilter.toLowerCase();
    return files.filter((f) => !f.isDir && (!needle || f.path.toLowerCase().includes(needle)));
  }, [files, fileFilter]);

  const lines = currentCode.split("\n");

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
        <AlertTriangle className="size-10 text-amber-400" />
        <p className="text-sm text-muted-foreground max-w-md">{loadError}</p>
        <Button render={<Link href="/resources" />} variant="outline">
          {t("Ver recursos instalados")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <div className="w-64 border-r border-border/50 flex flex-col bg-muted/10 shrink-0">
        <div className="p-3 border-b border-border/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate block">
            {resourceName}
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {files.filter((f) => !f.isDir).length}{" "}{t("ficheros en disco")}
          </span>
        </div>

        <div className="p-2 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2 top-1.5 size-3.5 text-muted-foreground" />
            <Input
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              placeholder={t("Buscar archivo...")}
              className="h-7 pl-7 text-xs bg-background/50 border-border/50"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 p-2">
          {loadingTree ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
              <Loader2 className="size-3.5 animate-spin" />{" "}{t("Leyendo el recurso...")}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 text-sm">
              {visibleFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => file.editable && setActiveFile(file.path)}
                  disabled={!file.editable}
                  title={file.editable ? file.path : t("{path} (no editable)", { path: file.path })}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-left ${
                    activeFile === file.path
                      ? "bg-primary/10 text-primary font-medium"
                      : file.editable
                        ? "hover:bg-muted/50 text-muted-foreground"
                        : "text-muted-foreground/40 cursor-not-allowed"
                  }`}
                >
                  <File className="size-3.5 shrink-0" />
                  <span className="truncate">{file.path}</span>
                </button>
              ))}
              {visibleFiles.length === 0 && (
                <p className="text-xs text-muted-foreground p-2">{t("Ningún fichero coincide.")}</p>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col bg-[#0d0d0d] min-w-0">
        <div className="flex items-center h-10 border-b border-border/20 bg-background/50 px-2 gap-1 overflow-x-auto shrink-0">
          {activeFile && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-border/20 rounded-md text-sm text-foreground/90">
              <File className="size-3.5 text-blue-400" />
              <span className="text-xs">{activeFile}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 pr-2">
            <Button
              onClick={handleSaveFile}
              disabled={isSaving || !activeFile}
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 bg-background/50"
            >
              {saveSuccess ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span className="text-emerald-500">{t("Guardado")}</span>
                </>
              ) : isSaving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{t("Guardando...")}</span>
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  <span>{t("Guardar")}</span>
                </>
              )}
            </Button>
            <Button
              onClick={handleRestartResource}
              size="sm"
              className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Play className="size-3.5" />
              {t("Reiniciar Recurso")}
            </Button>
          </div>
        </div>

        <div className="flex-1 relative font-mono text-sm flex overflow-hidden">
          {loadingFile && !currentCode ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="size-4 animate-spin" />{" "}{t("Cargando fichero...")}
            </div>
          ) : !activeFile ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
              {t("Selecciona un fichero del recurso.")}
            </div>
          ) : (
            <>
              <div className="text-muted-foreground/40 select-none flex flex-col items-end px-3 py-4 border-r border-border/20 bg-[#0a0a0a] min-w-[3rem] overflow-hidden">
                {lines.map((_, i) => (
                  <span key={i} className="leading-6 text-xs">
                    {i + 1}
                  </span>
                ))}
              </div>
              <textarea
                value={currentCode}
                onChange={(e) => setFileContents((prev) => ({ ...prev, [activeFile]: e.target.value }))}
                spellCheck={false}
                className="flex-1 bg-transparent text-foreground/90 p-4 font-mono text-xs leading-6 outline-none resize-none overflow-auto whitespace-pre"
              />
            </>
          )}
        </div>
      </div>

      <div className="w-80 border-l border-border/50 flex flex-col bg-background/50 shrink-0">
        <div className="p-3 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-medium">{t("Asistente IA")}</span>
          </div>
          <Badge variant="outline" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20">
            {activeServer?.framework || "FiveM"}
          </Badge>
        </div>

        {aiConfigured === false && (
          <div className="m-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs space-y-2">
            <p className="flex items-start gap-2">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>{t("No hay ningún proveedor de IA configurado.")}</span>
            </p>
            <Button render={<Link href="/settings" />} size="sm" variant="outline" className="h-7 text-xs w-full gap-1.5">
              <Settings className="size-3" />{" "}{t("Configurar en Ajustes")}
            </Button>
          </div>
        )}

        <ScrollArea className="flex-1 p-4">
          <div className="flex flex-col gap-6">
            {messages.length === 0 && aiConfigured && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("Pregúntale sobre")}{" "}<span className="font-mono">{resourceName}</span>{t(". Recibe los ficheros reales del recurso como contexto y puede proponer cambios que se aplican y guardan en disco.")}
              </p>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <Avatar className={`size-8 border border-border/50 ${msg.role === "user" ? "bg-muted" : "bg-primary/10"}`}>
                  <AvatarFallback>
                    {msg.role === "user" ? <User className="size-4" /> : <Bot className="size-4 text-primary" />}
                  </AvatarFallback>
                </Avatar>
                <div className={`flex-1 space-y-2 min-w-0 ${msg.role === "user" ? "flex flex-col items-end" : ""}`}>
                  <div className="text-xs text-muted-foreground font-medium">
                    {msg.role === "user" ? "Tú" : t("Asistente")}
                  </div>
                  <div
                    className={`text-sm border p-3 leading-relaxed whitespace-pre-wrap break-words ${
                      msg.isError
                        ? "bg-red-500/10 border-red-500/20 text-red-400 rounded-2xl rounded-tl-none"
                        : msg.role === "user"
                          ? "bg-primary/10 border-primary/20 text-foreground/90 rounded-2xl rounded-tr-none"
                          : "bg-muted/30 border-border/50 text-foreground/90 rounded-2xl rounded-tl-none"
                    }`}
                  >
                    {msg.content}

                    {msg.diff && (
                      <div className="rounded-md border border-border/50 bg-[#0d0d0d] overflow-hidden my-3">
                        <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground border-b border-border/50 flex items-center justify-between">
                          <span className="font-mono truncate">{msg.diff.file}</span>
                          <Badge variant="outline" className="text-[9px] h-4 shrink-0">
                            {t("Propuesta")}
                          </Badge>
                        </div>
                        <div className="p-3 text-xs font-mono text-left max-h-48 overflow-auto">
                          <div className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 border-l-2 border-emerald-500 whitespace-pre">
                            {msg.diff.newCode}
                          </div>
                        </div>
                        <div className="p-2 border-t border-border/50 bg-muted/20">
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20"
                            onClick={() => handleApplyDiff(msg.diff!)}
                          >
                            {t("Aplicar y guardar")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isAiLoading && (
              <div className="flex gap-3">
                <Avatar className="size-8 border border-border/50 bg-primary/10">
                  <AvatarFallback>
                    <Bot className="size-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-2xl rounded-tl-none border border-border/50">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>{t("Pensando...")}</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border/50 bg-background/50">
          <div className="flex items-center gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              disabled={isAiLoading}
              placeholder={t("Pregunta sobre {resourceName}...", { resourceName })}
              className="h-9 text-xs bg-background"
            />
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSendMessage} disabled={isAiLoading}>
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
