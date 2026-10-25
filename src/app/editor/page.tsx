"use client";

import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  FileCode,
  Loader2,
  Save,
  Search,
  Sparkles,
  X,
  Check,
  Undo2,
  AlertTriangle,
  ShieldAlert,
  Radio,
  Settings2,
  ListTree,
  RefreshCcw,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Braces,
  ClipboardCheck,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { AGENT_URL } from "@/lib/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useServerContext } from "@/context/server-context";
import {
  loadEditorSnapshot,
  saveEditorSnapshot,
  type EditorSnapshot,
} from "@/lib/editor-session";
import {
  AgentReasoning,

  ApprovalCard,
  MessageScroller,
  PromptInput,

  StreamingResponse,
  sumUsage,
  TodoList,
  TokenUsage,
  ToolResult,
  ToolResultOutput,
  type MessagePreview,
  type PromptAction,
  type PromptModel,
  type TokenUsageValue,
} from "@/components/agents";
import {
  planItems,
  proposalSummary,
  ProposalReview,
  SUGGESTIONS,
  toolLanguage,
  toolTitle,
  type Proposal,
  type ToolRun,
} from "@/components/editor/agent-parts";
import {
  FileTree,
  DRAG_MIME,
  nodeDragProps,
  type DraggedNode,
} from "@/components/editor/file-tree";
import { CodeEditor, detectLanguage } from "@/components/editor/code-editor";
import { ControlesAgente, type Esfuerzo } from "@/components/editor/agent-controls";
import { GlobalSearch } from "@/components/editor/global-search";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePlayerActions, PlayerActionDef } from "@/lib/player-actions";
import { ActionsEditor } from "@/components/players/actions-editor";
import { toast } from "sonner";
import { t } from "@/i18n";

interface ResourceNode {
  name: string;
  category: string;
  fileCount: number;
  files: { path: string; editable: boolean }[];
}

interface OpenTab {
  resource: string;
  filePath: string;
  content: string;
  saved: string;
}

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thoughtSeconds?: number;
  proposal?: { file: string; newCode: string };
  images?: string[];
  attachments?: { name: string; kind: "file" | "image" | "selection" }[];
  tools?: ToolRun[];
  plan?: string[];
  soloPlan?: boolean;
  question?: { pregunta: string; opciones: string[]; cabecera?: string };
  answered?: string;
  proposals?: Proposal[];
  sources?: string[];
  usage?: TokenUsageValue;
  failed?: boolean;
  feedback?: "up" | "down" | null;
  askedWith?: string;
}

interface ChatAttachment {
  id: string;
  kind: "file" | "image" | "selection";
  name: string;
  content?: string;
  dataUrl?: string;
}

interface ChatSession {
  id: string;
  title: string;
  entries: ChatEntry[];
  attachments: ChatAttachment[];
}

const newChatId = () => `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function cronometro(): () => number {
  const inicio = Date.now();
  return () => (Date.now() - inicio) / 1000;
}

const ESFUERZO_KEY = "vxcore:editor:esfuerzo";

function readEsfuerzo(): Esfuerzo | null {
  try {
    const guardado = localStorage.getItem(ESFUERZO_KEY);
    return guardado === "bajo" || guardado === "medio" || guardado === "alto" ? guardado : null;
  } catch {
    return null;
  }
}

const subscribeEsfuerzo = () => () => {};

function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return t("Chat");
  return clean.length > 26 ? `${clean.slice(0, 26)}…` : clean;
}

const tabId = (resource: string, filePath: string) => `${resource}::${filePath}`;

const PANELS_KEY = "vxcore_editor_panels";

interface PanelPrefs {
  explorer: boolean;
  agent: boolean;
}

const PANELS_DEFAULT = "{}";
const panelListeners = new Set<() => void>();

function readPanels(): string {
  try {
    return localStorage.getItem(PANELS_KEY) ?? PANELS_DEFAULT;
  } catch {
    return PANELS_DEFAULT;
  }
}

function writePanels(prefs: PanelPrefs): void {
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify(prefs));
  } catch {}
  panelListeners.forEach((notify) => notify());
}

function subscribePanels(notify: () => void): () => void {
  panelListeners.add(notify);
  return () => {
    panelListeners.delete(notify);
  };
}

function PanelToggle({
  side,
  open,
  label,
  onToggle,
}: {
  side: "left" | "right";
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  const Icon = side === "left"
    ? open ? PanelLeftClose : PanelLeftOpen
    : open ? PanelRightClose : PanelRightOpen;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onToggle}
            aria-label={open ? t("Ocultar {seccion}", { seccion: label }) : t("Mostrar {seccion}", { seccion: label })}
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side={side === "left" ? "right" : "left"}>
        {open ? t("Ocultar {label}", { label }) : t("Mostrar {label}", { label })}
      </TooltipContent>
    </Tooltip>
  );
}

function CollapsedRail({
  side,
  label,
  onOpen,
  icon: Icon,
}: {
  side: "left" | "right";
  label: string;
  onOpen: () => void;
  icon: React.ElementType;
}) {
  return (
    <aside className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border border-border/50 bg-background/50 py-2">
      <PanelToggle side={side} open={false} label={label} onToggle={onOpen} />
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={t("Mostrar {label}", { label })}
      >
        <Icon className="size-4 shrink-0" />
        <span className="rotate-180 text-[11px] tracking-wide [writing-mode:vertical-rl]">
          {label}
        </span>
      </button>
    </aside>
  );
}

export default function EditorPage() {
  const { activeServer } = useServerContext();
  const serverDataPath = activeServer?.serverDataPath;

  const [resources, setResources] = useState<ResourceNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [explorer, setExplorer] = useState<"arbol" | "buscar">("arbol");
  const panelsRaw = useSyncExternalStore(subscribePanels, readPanels, () => PANELS_DEFAULT);
  const panels = useMemo<PanelPrefs>(() => {
    try {
      const saved = JSON.parse(panelsRaw) as Partial<PanelPrefs>;
      return { explorer: saved.explorer !== false, agent: saved.agent !== false };
    } catch {
      return { explorer: true, agent: true };
    }
  }, [panelsRaw]);

  const explorerOpen = panels.explorer;
  const agentOpen = panels.agent;
  const setExplorerOpen = (open: boolean) => writePanels({ ...panels, explorer: open });
  const setAgentOpen = (open: boolean) => writePanels({ ...panels, agent: open });
  const [reveal, setReveal] = useState<{ line: number; nonce: number } | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>(() => [
    { id: "chat-1", title: t("Chat 1"), entries: [], attachments: [] },
  ]);
  const [activeChat, setActiveChat] = useState<string>("chat-1");
  const [prompt, setPrompt] = useState("");
  const esfuerzoGuardado = useSyncExternalStore(subscribeEsfuerzo, readEsfuerzo, () => null);
  const [esfuerzoElegido, setEsfuerzo] = useState<Esfuerzo | null>(null);
  const esfuerzo = esfuerzoElegido ?? esfuerzoGuardado ?? 'medio';

  const [modoPlan, setModoPlan] = useState(false);

  const cambiarEsfuerzo = (valor: Esfuerzo) => {
    setEsfuerzo(valor);
    try {
      window.localStorage.setItem(ESFUERZO_KEY, valor);
    } catch {}
  };

  const [streaming, setStreaming] = useState<{
    sessionId: string;
    thinking: string;
    reply: string;
    tools: ToolRun[];
    plan: string[];
    proposals: Proposal[];
    usage: TokenUsageValue | null;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const [saveGate, setSaveGate] = useState<Proposal | null>(null);
  const [alwaysSave, setAlwaysSave] = useState(false);

  const [aiModel, setAiModel] = useState<string>("");
  const [aiProvider, setAiProvider] = useState<string>("");
  const [aiBaseUrl, setAiBaseUrl] = useState<string>("");
  const [localModels, setLocalModels] = useState<string[]>([]);

  const snapshotKey = activeServer?.id ?? "";

  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  const restored = restoredFor === snapshotKey;

  if (snapshotKey && restoredFor !== snapshotKey) {
    setRestoredFor(snapshotKey);

    const snap = loadEditorSnapshot(snapshotKey);

    if (snap) {
      setTabs(
        snap.tabs.map((t) => ({
          resource: t.resource,
          filePath: t.filePath,
          content: t.content ?? "",
          saved: t.dirty ? "" : t.content ?? "",
        }))
      );
      setActiveTab(snap.activeTab);
      setExplorer(snap.explorer);
      setPrompt(snap.prompt);

      if (snap.sessions.length > 0) {
        setSessions(snap.sessions);
        setActiveChat(snap.activeChat ?? snap.sessions[0].id);
      }
    }
  }

  useEffect(() => {
    if (!restored || !snapshotKey) return;

    const timer = setTimeout(() => {
      const payload: Omit<EditorSnapshot, "version" | "savedAt"> = {
        tabs: tabs.map((t) => ({
          resource: t.resource,
          filePath: t.filePath,
          content: t.content,
          dirty: t.content !== t.saved,
        })),
        activeTab,
        sessions,
        activeChat,
        prompt,
        explorer,
      };
      saveEditorSnapshot(snapshotKey, payload);
    }, 500);

    return () => clearTimeout(timer);
  }, [restored, snapshotKey, tabs, activeTab, sessions, activeChat, prompt, explorer]);

  const session = sessions.find((s) => s.id === activeChat) ?? sessions[0];
  const chat = useMemo(() => session?.entries ?? [], [session]);

  const sessionUsage = useMemo(() => sumUsage(chat.map((entry) => entry.usage)), [chat]);

  const patchSession = useCallback((id: string, patch: (s: ChatSession) => ChatSession) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? patch(s) : s)));
  }, []);

  const setAttachments = useCallback(
    (updater: ChatAttachment[] | ((prev: ChatAttachment[]) => ChatAttachment[])) => {
      patchSession(activeChat, (s) => ({
        ...s,
        attachments: typeof updater === "function" ? updater(s.attachments) : updater,
      }));
    },
    [activeChat, patchSession]
  );

  const attachments = session?.attachments ?? [];

  const newChat = () => {
    const id = newChatId();
    setSessions((prev) => [
      ...prev,
      { id, title: t("Chat {valor}", { valor: prev.length + 1 }), entries: [], attachments: [] },
    ]);
    setActiveChat(id);
    setPrompt("");
  };

  const closeChat = (id: string) => {
    setSessions((prev) => {
      const rest = prev.filter((s) => s.id !== id);
      const next = rest.length ? rest : [{ id: newChatId(), title: t("Chat 1"), entries: [], attachments: [] }];
      if (id === activeChat) setActiveChat(next[next.length - 1].id);
      return next;
    });
  };
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = streaming !== null;

  interface ScannedEvent {
    name: string;
    usage: string[];
    count: number;
  }
  interface ScannedScript {
    script: string;
    events: ScannedEvent[];
  }
  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventsTab, setEventsTab] = useState<"scan" | "actions">("scan");
  const [scan, setScan] = useState<{ scripts: ScannedScript[]; total: number } | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSearch, setScanSearch] = useState("");
  const [scanScript, setScanScript] = useState<string>("all");
  const { actions: playerActions, save: savePlayerActions } = usePlayerActions();
  const [actionsDraft, setActionsDraft] = useState<PlayerActionDef[]>([]);
  const [savingActions, setSavingActions] = useState(false);

  const runScan = useCallback(async () => {
    setScanLoading(true);
    setScanError(null);
    try {
      const params = new URLSearchParams();
      if (serverDataPath) params.set("basePath", serverDataPath);
      const res = await fetch(`${AGENT_URL}/api/events/scan?${params.toString()}`);
      const data = await res.json();
      if (data.success) setScan(data);
      else setScanError(data.error || t("No se pudo escanear los recursos."));
    } catch {
      setScanError(t("El agente VXCore no responde."));
    } finally {
      setScanLoading(false);
    }
  }, [serverDataPath]);

  const openEventsDialog = () => {
    setActionsDraft(JSON.parse(JSON.stringify(playerActions)));
    setEventsOpen(true);
    if (eventsTab === "scan") runScan();
  };

  const saveActionsConfig = async () => {
    setSavingActions(true);
    const ok = await savePlayerActions(actionsDraft);
    setSavingActions(false);
    if (ok) toast.success(t("Acciones guardadas. Se aplican al instante."));
    else toast.error(t("No se pudo guardar la configuración de acciones"));
  };

  const loadTree = useCallback(async () => {
    if (!serverDataPath) {
      setLoadingTree(false);
      return;
    }

    setLoadingTree(true);
    setTreeError(null);
    try {
      const res = await fetch(
        `${AGENT_URL}/api/resource/tree?serverDataPath=${encodeURIComponent(serverDataPath)}`
      );
      const data = await res.json();
      if (data.success) setResources(data.resources ?? []);
      else setTreeError(data.error || t("No se pudieron leer los recursos."));
    } catch {
      setTreeError(t("El agente VXCore no responde."));
    } finally {
      setLoadingTree(false);
    }
  }, [serverDataPath]);

  useEffect(() => {
    const initial = setTimeout(loadTree, 0);
    return () => clearTimeout(initial);
  }, [loadTree]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return resources;

    return resources
      .map((r) => ({
        ...r,
        files: r.name.toLowerCase().includes(needle)
          ? r.files
          : r.files.filter((f) => f.path.toLowerCase().includes(needle)),
      }))
      .filter((r) => r.name.toLowerCase().includes(needle) || r.files.length > 0);
  }, [resources, filter]);

  const openFile = async (resource: string, filePath: string, line?: number) => {
    const id = tabId(resource, filePath);
    const jump = () => {
      if (line) setReveal({ line, nonce: Date.now() });
    };

    if (tabs.some((t) => tabId(t.resource, t.filePath) === id)) {
      setActiveTab(id);
      jump();
      return;
    }

    if (!serverDataPath) return;
    try {
      const params = new URLSearchParams({ name: resource, serverDataPath, filePath });
      const res = await fetch(`${AGENT_URL}/api/resource/file?${params}`);
      const data = await res.json();

      if (!data.success) {
        toast.error(t("No se pudo abrir"), { description: data.error });
        return;
      }

      setTabs((prev) => [...prev, { resource, filePath, content: data.content, saved: data.content }]);
      setActiveTab(id);
      jump();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    }
  };

  const tabIds = tabs.map((t) => tabId(t.resource, t.filePath)).join("|");
  const readPendingTabs = useEffectEvent(() => tabs.filter((t) => t.content === "" && t.saved === ""));
  useEffect(() => {
    if (!restored || !serverDataPath) return;

    const pending = readPendingTabs();
    if (pending.length === 0) return;

    let cancelled = false;

    (async () => {
      for (const tab of pending) {
        try {
          const params = new URLSearchParams({
            name: tab.resource,
            serverDataPath,
            filePath: tab.filePath,
          });
          const res = await fetch(`${AGENT_URL}/api/resource/file?${params}`);
          const data = await res.json();
          if (cancelled) return;

          setTabs((prev) =>
            prev.map((t) =>
              tabId(t.resource, t.filePath) === tabId(tab.resource, tab.filePath)
                ? { ...t, content: data.success ? data.content : t.content, saved: data.success ? data.content : t.saved }
                : t
            )
          );
        } catch {}
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restored, serverDataPath, tabIds]);

  const current = tabs.find((t) => tabId(t.resource, t.filePath) === activeTab) ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch(`${AGENT_URL}/api/ai/config`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.config) return;
        setAiModel(data.config.model ?? "");
        setAiProvider(data.config.provider ?? "");
        setAiBaseUrl(data.config.baseUrl ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (aiProvider !== "ollama") return;
    let cancelled = false;
    const query = new URLSearchParams({ provider: "ollama" });
    if (aiBaseUrl) query.set("baseUrl", aiBaseUrl);
    fetch(`${AGENT_URL}/api/ai/models?${query.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.models)) setLocalModels(data.models.map(String));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [aiProvider, aiBaseUrl]);

  const aiModels: PromptModel[] = useMemo(() => {
    if (aiProvider === "ollama") {
      const names = [...localModels];
      const latest = `${aiModel}:latest`;
      if (aiModel && !names.some((name) => name === aiModel || name === latest)) {
        names.unshift(aiModel);
      }
      return names.map((name) => ({
        id: name === latest ? aiModel : name,
        name,
        description: t("Local · Ollama"),
      }));
    }
    if (aiProvider !== "anthropic") return [];
    return [
      { id: "claude-opus-5", name: "Opus 5", description: t("El más capaz. Para cambios delicados.") },
      { id: "claude-sonnet-5", name: "Sonnet 5", description: t("Equilibrado. El del día a día.") },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Haiku 4.5",
        description: t("El más rápido y barato. Para preguntas cortas."),
      },
    ];
  }, [aiProvider, localModels, aiModel]);

  const changeModel = async (model: string) => {
    const previous = aiModel;
    setAiModel(model);
    try {
      const res = await fetch(`${AGENT_URL}/api/ai/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("Modelo cambiado a {modelo}", { modelo: aiModels.find((m) => m.id === model)?.name ?? model }));
    } catch {
      setAiModel(previous);
      toast.error(t("No se pudo cambiar el modelo."));
    }
  };

  const promptActions: PromptAction[] = useMemo(
    () => [
      {
        id: "file",
        label: t("Adjuntar fichero o imagen"),
        description: t("También puedes arrastrarlos aquí o pegar una captura"),
        icon: <Paperclip className="size-3.5" />,
      },
      {
        id: "selection",
        label: t("Añadir la selección del editor"),
        description: selection ? t("{length} caracteres", { length: selection.text.length }) : t("Selecciona código primero"),
        icon: <Braces className="size-3.5" />,
        disabled: !selection,
      },
      {
        id: "current",
        label: t("Añadir el fichero abierto"),
        description: current?.filePath ?? t("No hay ninguno abierto"),
        icon: <FileText className="size-3.5" />,
        disabled: !current,
      },
      {
        id: "clear",
        label: t("Quitar todo el contexto"),
        description: t("{length} adjunto(s)", { length: attachments.length }),
        icon: <X className="size-3.5" />,
        disabled: attachments.length === 0,
      },
    ],
    [selection, current, attachments.length]
  );

  const runPromptAction = (action: string) => {
    if (action === "file") fileInputRef.current?.click();
    else if (action === "selection") addSelectionToContext();
    else if (action === "clear") setAttachments([]);
    else if (action === "current" && current) {
      setAttachments((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "file",
          name: current.filePath,
          content: current.content,
        },
      ]);
      toast.info(t("Fichero añadido como contexto"));
    }
  };

  const railItems: MessagePreview[] = useMemo(
    () =>
      chat.map((entry, index) => ({
        id: `msg-${index}`,
        title: entry.content.trim().split("\n")[0] || (entry.role === "user" ? t("Adjuntos") : "…"),
        description: entry.proposals?.length
          ? t("{length} cambio(s) propuesto(s)", { length: entry.proposals.length })
          : undefined,
        role: entry.role,
      })),
    [chat]
  );
  const isDirty = current ? current.content !== current.saved : false;

  const updateContent = (value: string) => {
    if (!activeTab) return;
    setTabs((prev) =>
      prev.map((t) => (tabId(t.resource, t.filePath) === activeTab ? { ...t, content: value } : t))
    );
  };

  const closeTab = (id: string) => {
    const tab = tabs.find((t) => tabId(t.resource, t.filePath) === id);
    if (tab && tab.content !== tab.saved) {
      if (!confirm(t("\"{filePath}\" tiene cambios sin guardar. ¿Cerrar y perderlos?", { filePath: tab.filePath }))) return;
    }
    setTabs((prev) => prev.filter((t) => tabId(t.resource, t.filePath) !== id));
    if (activeTab === id) {
      const rest = tabs.filter((t) => tabId(t.resource, t.filePath) !== id);
      setActiveTab(rest.length ? tabId(rest[0].resource, rest[0].filePath) : null);
    }
  };

  const save = async () => {
    if (!current || !serverDataPath) return;

    setSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/resource/save-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceName: current.resource,
          filePath: current.filePath,
          content: current.content,
          serverDataPath,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(t("No se pudo guardar"), { description: data.error });
        return;
      }

      setTabs((prev) =>
        prev.map((t) =>
          tabId(t.resource, t.filePath) === activeTab ? { ...t, saved: t.content } : t
        )
      );
      toast.success(t("Guardado {filePath}", { filePath: current.filePath }), {
        description: data.backupPath ? t("Se guardó copia de la versión anterior.") : undefined,
      });
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (current && current.content !== current.saved) save();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setExplorer("buscar");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [chat, streaming]);

  const MAX_TEXT_BYTES = 120 * 1024;
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const readAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(t("No se pudo leer el archivo.")));
      reader.readAsText(file);
    });

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(t("No se pudo leer el archivo.")));
      reader.readAsDataURL(file);
    });

  const processFiles = async (fileList: FileList | File[]) => {
    for (const file of Array.from(fileList)) {
      const isImage = file.type.startsWith("image/");

      if (isImage) {
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(t("Imagen demasiado grande"), { description: t("{name} supera los 4 MB.", { name: file.name }) });
          continue;
        }
        try {
          const dataUrl = await readAsDataUrl(file);
          setAttachments((prev) => [...prev, { id: crypto.randomUUID(), kind: "image", name: file.name, dataUrl }]);
        } catch {
          toast.error(t("No se pudo leer"), { description: file.name });
        }
        continue;
      }

      if (file.size > MAX_TEXT_BYTES) {
        toast.error(t("Fichero demasiado grande"), { description: t("{name} supera los 120 KB.", { name: file.name }) });
        continue;
      }
      try {
        const content = await readAsText(file);
        setAttachments((prev) => [...prev, { id: crypto.randomUUID(), kind: "file", name: file.name, content }]);
      } catch {
        toast.error(t("No se pudo leer"), { description: file.name });
      }
    }
  };

  const alreadyAttached = (name: string) => attachments.some((a) => a.name === name);

  const attachNode = async (node: DraggedNode) => {
    if (!node.filePath) {
      const res = resources.find((r) => r.name === node.resource);
      if (!res) return;
      const name = `${res.name}/ (${res.fileCount} ficheros)`;
      if (alreadyAttached(name)) return;
      setAttachments((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "file",
          name,
          content: `Ficheros del recurso ${res.name}:\n${res.files.map((f) => f.path).join("\n")}`,
        },
      ]);
      toast.info(t("Recurso añadido como contexto"), { description: t("Índice de {name}.", { name: res.name }) });
      return;
    }

    const name = `${node.resource}/${node.filePath}`;
    if (alreadyAttached(name)) return;

    const abierto = tabs.find((t) => t.resource === node.resource && t.filePath === node.filePath);
    if (abierto) {
      setAttachments((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: "file", name, content: abierto.content },
      ]);
      toast.info(t("Fichero añadido como contexto"), {
        description:
          abierto.content !== abierto.saved
            ? t("Se manda como lo tienes en el editor, sin guardar.")
            : node.filePath,
      });
      return;
    }

    if (!serverDataPath) return;
    try {
      const params = new URLSearchParams({
        name: node.resource,
        serverDataPath,
        filePath: node.filePath,
      });
      const res = await fetch(`${AGENT_URL}/api/resource/file?${params}`);
      const data = await res.json();
      if (!data.success) {
        toast.error(t("No se pudo leer"), { description: data.error });
        return;
      }
      if (new Blob([data.content]).size > MAX_TEXT_BYTES) {
        toast.error(t("Fichero demasiado grande"), {
          description: t("{filePath} supera los 120 KB.", { filePath: node.filePath }),
        });
        return;
      }
      setAttachments((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: "file", name, content: data.content },
      ]);
      toast.info(t("Fichero añadido como contexto"), { description: node.filePath });
    } catch {
      toast.error(t("El agente VXCore no responde."));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (raw) {
      try {
        void attachNode(JSON.parse(raw) as DraggedNode);
      } catch {}
      return;
    }

    if (e.dataTransfer.files?.length) void processFiles(e.dataTransfer.files);
  };

  const PASTE_AS_CONTEXT_CHARS = 180;

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      e.preventDefault();
      void processFiles(images);
      return;
    }

    const text = e.clipboardData?.getData("text/plain") ?? "";
    const lineas = text.split("\n").length;
    if (!text.trim() || (lineas < 2 && text.length < PASTE_AS_CONTEXT_CHARS)) return;

    e.preventDefault();
    const name = t("pegado ({lineas} {valor})", { lineas, valor: lineas === 1 ? "línea" : "líneas" });
    setAttachments((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "selection", name, content: text },
    ]);
    toast.info(t("Pegado como contexto"), {
      description: t("Se enviará con tu próxima pregunta. Quítalo con la ✕ si no querías esto."),
    });
  };

  const addSelectionToContext = () => {
    if (!selection || !current) return;
    const line = (offset: number) => current.content.slice(0, offset).split("\n").length;
    setAttachments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: "selection",
        name: `${current.filePath}:${line(selection.start)}-${line(selection.end)}`,
        content: selection.text,
      },
    ]);
    setSelection(null);
    toast.info(t("Selección añadida como contexto"), {
      description: t("Se enviará con tu próxima pregunta."),
    });
  };

  const stopAnswer = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const ask = async (override?: string) => {
    const typed = (override ?? prompt).trim();
    if ((!typed && attachments.length === 0) || busy) return;

    const textAttachments = attachments.filter((a) => a.kind !== "image");
    const imageUrls = attachments.filter((a) => a.kind === "image").map((a) => a.dataUrl!);

    let fullMessage = typed || (imageUrls.length ? "Mira las imágenes adjuntas y responde." : "");
    if (textAttachments.length) {
      fullMessage +=
        "\n\n" +
        textAttachments
          .map((a) => {
            const lang = detectLanguage(a.name) === "manifest" ? "lua" : detectLanguage(a.name);
            return `[Adjunto: ${a.name}]\n\`\`\`${lang}\n${a.content ?? ""}\n\`\`\``;
          })
          .join("\n\n");
    }

    const userEntry: ChatEntry = {
      role: "user",
      content: typed,
      images: imageUrls,
      attachments: attachments.map((a) => ({ name: a.name, kind: a.kind })),
      askedWith: typed,
    };

    const sessionId = activeChat;
    const answerIn = (entry: ChatEntry) =>
      patchSession(sessionId, (s) => ({ ...s, entries: [...s.entries, entry] }));

    patchSession(sessionId, (s) => ({
      ...s,
      entries: [...s.entries, userEntry],
      attachments: [],
      title: s.entries.length === 0 ? titleFrom(typed || t("Adjuntos")) : s.title,
    }));
    setPrompt("");
    setSelection(null);
    const segundosPensando = cronometro();
    setStreaming({
      sessionId,
      thinking: "",
      reply: "",
      tools: [],
      plan: [],
      proposals: [],
      usage: null,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    const proposalId = () => `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const live: {
      tools: ToolRun[];
      plan: string[];
      proposals: Proposal[];
      reply: string;
      question?: { pregunta: string; opciones: string[]; cabecera?: string };
      usage?: TokenUsageValue;
    } = {
      tools: [],
      plan: [],
      proposals: [],
      reply: "",
    };
    const publish = () =>
      setStreaming((s) =>
        s
          ? { ...s, tools: [...live.tools], plan: [...live.plan], proposals: [...live.proposals] }
          : s
      );

    const isUsage = (value: unknown): value is TokenUsageValue =>
      typeof (value as TokenUsageValue | null)?.input === "number" &&
      typeof (value as TokenUsageValue | null)?.output === "number";

    try {
      const res = await fetch(`${AGENT_URL}/api/ai/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: fullMessage,
          images: imageUrls,
          resource: current?.resource,
          activeFile: current?.filePath,
          currentCode: current?.content,
          serverDataPath: activeServer?.serverDataPath,
          files: resources.find((r) => r.name === current?.resource)?.files.map((f) => f.path) ?? [],
          serverContext: {
            framework: activeServer?.framework,
            database: activeServer?.database,
            name: activeServer?.name,
          },
          history: chat.slice(-10).map((c) => ({ role: c.role, content: c.content })),
          esfuerzo,
          modo: modoPlan ? 'plan' : 'normal',
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        answerIn({
          role: "assistant",
          content:
            data.code === "NOT_CONFIGURED"
              ? t("No hay proveedor de IA configurado. Ponlo en Configuración → Agente IA.")
              : data.error || t("El agente respondió {status}.", { status: res.status }),
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalReply = "";
      let finalThinking = "";
      let finalDiff: { file: string; newCode: string } | undefined;
      let finalSources: string[] = [];
      let error: string | null = null;

      const consume = (chunk: string) => {
        let idx: number;
        while ((idx = chunk.indexOf("\n\n")) !== -1) {
          const block = chunk.slice(0, idx);
          chunk = chunk.slice(idx + 2);
          let event = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === "thinking") {
              setStreaming((s) => (s ? { ...s, thinking: s.thinking + (parsed.delta || "") } : s));
            } else if (event === "reply") {
              live.reply += parsed.delta || "";
              setStreaming((s) => (s ? { ...s, reply: s.reply + (parsed.delta || "") } : s));
            } else if (event === "tool") {
              live.tools.push({
                id: parsed.id,
                name: parsed.name,
                input: parsed.input ?? {},
                status: "running",
              });
              publish();
            } else if (event === "tool_result") {
              const run = live.tools.find((t) => t.id === parsed.id);
              if (run) {
                run.status = parsed.error ? "error" : "success";
                run.output = parsed.output;
                run.ms = parsed.ms;
              }
              publish();
            } else if (event === "plan") {
              live.plan = Array.isArray(parsed.steps) ? parsed.steps : [];
              publish();
            } else if (event === "question") {
              live.question = {
                pregunta: String(parsed.pregunta || ""),
                opciones: Array.isArray(parsed.opciones) ? parsed.opciones.map(String) : [],
                cabecera: parsed.cabecera ? String(parsed.cabecera) : undefined,
              };
            } else if (event === "proposal") {
              live.proposals.push({
                id: proposalId(),
                file: parsed.file,
                newCode: parsed.newCode,
                summary: parsed.summary,
              });
              publish();
            } else if (event === "usage") {
              if (isUsage(parsed)) {
                live.usage = parsed;
                setStreaming((s) => (s ? { ...s, usage: parsed } : s));
              }
            } else if (event === "done") {
              finalReply = parsed.reply || "";
              finalThinking = parsed.thinking || "";
              finalDiff = parsed.diff;
              finalSources = Array.isArray(parsed.sources) ? parsed.sources : [];
              if (isUsage(parsed.usage)) live.usage = parsed.usage;
            } else if (event === "error") {
              error = parsed.error || t("El proveedor devolvió un error.");
            }
          } catch {}
        }
        return chunk;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        buffer = consume(buffer);
      }
      buffer += decoder.decode();
      consume(buffer + "\n\n");

      if (finalDiff && !live.proposals.some((p) => p.file === finalDiff!.file)) {
        live.proposals.push({ id: proposalId(), ...finalDiff });
      }

      if (error) {
        answerIn({
          role: "assistant",
          content: error!,
          failed: true,
          tools: live.tools,
          usage: live.usage,
          askedWith: typed,
        });
      } else {
        answerIn({
          role: "assistant",
          content: finalReply,
          thinking: finalThinking || undefined,
          thoughtSeconds: finalThinking ? segundosPensando() : undefined,
          tools: live.tools.length ? live.tools : undefined,
          plan: live.plan.length ? live.plan : undefined,
          soloPlan: modoPlan || undefined,
          question: live.question,
          proposals: live.proposals.length ? live.proposals : undefined,
          sources: finalSources.length ? finalSources : undefined,
          usage: live.usage,
          askedWith: typed,
        });
      }
    } catch (err) {
      const cancelled = err instanceof DOMException && err.name === "AbortError";
      answerIn({
        role: "assistant",
        content: cancelled
          ? live.reply
            ? t("{reply}\n\n— Interrumpido —", { reply: live.reply })
            : t("— Interrumpido antes de empezar a responder —")
          : t("El agente VXCore no responde."),
        failed: !cancelled,
        tools: live.tools.length ? live.tools : undefined,
        plan: live.plan.length ? live.plan : undefined,
        proposals: live.proposals.length ? live.proposals : undefined,
        usage: live.usage,
        askedWith: typed,
      });
    } finally {
      abortRef.current = null;
      setStreaming(null);
    }
  };

  const markProposal = (id: string, decision: Proposal["decision"]) =>
    patchSession(activeChat, (s) => ({
      ...s,
      entries: s.entries.map((entry) =>
        entry.proposals?.some((p) => p.id === id)
          ? {
              ...entry,
              proposals: entry.proposals.map((p) => (p.id === id ? { ...p, decision } : p)),
            }
          : entry
      ),
    }));

  const applyProposal = async (proposal: { file: string; newCode: string }) => {
    const target = tabs.find((t) => t.filePath === proposal.file);

    if (target) {
      setActiveTab(tabId(target.resource, target.filePath));
      setTabs((prev) =>
        prev.map((t) => (t.filePath === proposal.file ? { ...t, content: proposal.newCode } : t))
      );
    } else if (current) {
      await openFile(current.resource, proposal.file);
      setTabs((prev) =>
        prev.map((t) => (t.filePath === proposal.file ? { ...t, content: proposal.newCode } : t))
      );
    }

    toast.info(t("Cambio cargado en el editor"), {
      description: t("Revísalo y pulsa Guardar si quieres escribirlo en el servidor."),
    });
  };

  const saveProposal = async (proposal: Proposal) => {
    if (!serverDataPath || !current) return;

    try {
      const res = await fetch(`${AGENT_URL}/api/resource/save-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceName: current.resource,
          filePath: proposal.file,
          content: proposal.newCode,
          serverDataPath,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(t("No se pudo guardar"), { description: data.error });
        return;
      }

      setTabs((prev) =>
        prev.map((t) =>
          t.filePath === proposal.file
            ? { ...t, content: proposal.newCode, saved: proposal.newCode }
            : t
        )
      );
      markProposal(proposal.id, "saved");
      toast.success(t("Guardado {file}", { file: proposal.file }), {
        description: data.backupPath ? t("Se guardó copia de la versión anterior.") : undefined,
      });
    } catch {
      toast.error(t("El agente VXCore no responde."));
    }
  };

  const currentContentOf = (file: string): string => {
    const tab = tabs.find((t) => t.filePath === file);
    if (tab) return tab.saved;
    return baselines[file] ?? "";
  };

  const [baselines, setBaselines] = useState<Record<string, string>>({});
  const requestedBaselines = useRef(new Set<string>());

  useEffect(() => {
    if (!serverDataPath) return;

    const wanted = new Set<string>();
    for (const entry of chat) {
      for (const proposal of entry.proposals ?? []) {
        if (tabs.some((t) => t.filePath === proposal.file)) continue;
        if (requestedBaselines.current.has(proposal.file)) continue;
        wanted.add(proposal.file);
      }
    }
    if (wanted.size === 0) return;

    const resource = current?.resource;
    if (!resource) return;

    for (const file of wanted) {
      requestedBaselines.current.add(file);
      const params = new URLSearchParams({ name: resource, serverDataPath, filePath: file });
      fetch(`${AGENT_URL}/api/resource/file?${params}`)
        .then((res) => res.json())
        .then((data) => {
          setBaselines((prev) => ({ ...prev, [file]: data.success ? data.content : "" }));
        })
        .catch(() => setBaselines((prev) => ({ ...prev, [file]: "" })));
    }
  }, [chat, tabs, serverDataPath, current?.resource]);

  if (!activeServer) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t("Selecciona un servidor para editar sus recursos.")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      {!explorerOpen && (
        <CollapsedRail
          side="left"
          label={t("Recursos")}
          icon={ListTree}
          onOpen={() => setExplorerOpen(true)}
        />
      )}

      <aside
        className={`flex shrink-0 flex-col rounded-lg border border-border/50 bg-background/50 transition-[width] ${
          explorerOpen ? (explorer === "buscar" ? "w-96" : "w-64") : "hidden"
        }`}
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-border/50 p-1">
          <button
            type="button"
            onClick={() => setExplorer("arbol")}
            className={
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] transition-colors " +
              (explorer === "arbol"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50")
            }
          >
            <ListTree className="size-3.5" />
            {t("Recursos")}
          </button>
          <button
            type="button"
            onClick={() => setExplorer("buscar")}
            className={
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] transition-colors " +
              (explorer === "buscar"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50")
            }
            title={t("Buscar una palabra en todos los scripts del servidor (Ctrl+Shift+F)")}
          >
            <Search className="size-3.5" />
            {t("Buscar")}
          </button>
          <PanelToggle
            side="left"
            open
            label={t("Recursos")}
            onToggle={() => setExplorerOpen(false)}
          />
        </div>

        {explorer === "buscar" ? (
          <GlobalSearch serverDataPath={serverDataPath} onOpen={openFile} />
        ) : (
          <>
        <div className="border-b border-border/50 p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("Filtrar recurso o fichero")}
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full justify-start gap-1.5 text-xs"
            onClick={openEventsDialog}
            title={t("Ver los eventos que registran tus recursos y configurar las acciones del jugador")}
          >
            <Radio className="size-3.5 text-primary" />
            {t("Eventos del servidor")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-1">
          {loadingTree && (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />{" "}{t("Leyendo recursos...")}
            </div>
          )}

          {treeError && (
            <div className="m-2 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <span>{treeError}</span>
            </div>
          )}

          {!loadingTree && (
            <FileTree
              resources={visible}
              activeResource={current?.resource ?? null}
              activeFile={current?.filePath ?? null}
              onOpenFile={openFile}
              forceExpand={Boolean(filter.trim())}
            />
          )}

          {!loadingTree && !treeError && visible.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">{t("Sin resultados.")}</p>
          )}
        </div>
          </>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-border/50 bg-background/50">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/50 p-1">
          {tabs.length === 0 && (
            <span className="px-2 py-1 text-xs text-muted-foreground">
              {t("Abre un fichero desde el explorador.")}
            </span>
          )}
          {tabs.map((tab) => {
            const id = tabId(tab.resource, tab.filePath);
            const dirty = tab.content !== tab.saved;
            return (
              <div
                key={id}
                {...nodeDragProps({ resource: tab.resource, filePath: tab.filePath })}
                title={t("{resource}/{filePath} — arrástralo al agente para dárselo de contexto", { resource: tab.resource, filePath: tab.filePath })}
                className={
                  "flex shrink-0 cursor-grab items-center gap-1.5 rounded px-2 py-1 text-xs active:cursor-grabbing " +
                  (activeTab === id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50")
                }
              >
                <button type="button" onClick={() => setActiveTab(id)} className="max-w-48 truncate">
                  {tab.filePath}
                </button>
                {dirty && <span className="size-1.5 rounded-full bg-amber-400" title={t("Sin guardar")} />}
                <button type="button" onClick={() => closeTab(id)} aria-label={t("Cerrar")}>
                  <X className="size-3 hover:text-foreground" />
                </button>
              </div>
            );
          })}
        </div>

        {current ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {current.resource}/{current.filePath}
              </span>
              <div className="flex items-center gap-2">
                {isDirty && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => updateContent(current.saved)}
                  >
                    <Undo2 className="size-3.5" />{" "}{t("Descartar")}
                  </Button>
                )}
                <Button size="sm" className="h-7 text-xs" onClick={save} disabled={!isDirty || saving}>
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  {t("Guardar")}
                </Button>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col">
              <CodeEditor
                value={current.content}
                language={detectLanguage(current.filePath)}
                onChange={updateContent}
                onSelect={setSelection}
                reveal={reveal}
              />
              {selection && (
                <button
                  type="button"
                  onClick={addSelectionToContext}
                  className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary shadow-sm backdrop-blur transition-colors hover:bg-primary/20"
                >
                  <Braces className="size-3.5" />
                  {t("Añadir al agente")}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("Ningún fichero abierto.")}
          </div>
        )}
      </section>

      <aside
        className={`relative w-96 shrink-0 flex-col rounded-lg border border-border/50 bg-background/50 ${
          agentOpen ? "flex" : "hidden"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <Paperclip className="size-4" />
              {t("Suelta para dárselo al agente")}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="text-sm font-medium">{t("Agente")}</span>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-amber-500 transition-colors hover:text-amber-400"
                  aria-label={t("Cómo trata el agente tu servidor en producción")}
                />
              }
            >
              <ShieldAlert className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {t("Esto es tu servidor en producción. El agente sólo carga los cambios en el editor: nada se escribe hasta que pulses Guardar, y siempre queda copia de la versión anterior.")}
            </TooltipContent>
          </Tooltip>

          {sessionUsage && (
            <TokenUsage
              usage={sessionUsage}
              label={t("Tokens de esta conversación")}
              className="ml-auto"
            />
          )}
          {current && (
            <Badge
              variant="secondary"
              className={`${sessionUsage ? "" : "ml-auto"} max-w-28 truncate text-[10px]`}
            >
              {current.filePath}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={`size-7 shrink-0 ${current || sessionUsage ? "" : "ml-auto"}`}
            onClick={newChat}
            title={t("Abrir otra conversación")}
          >
            <Plus className="size-4" />
          </Button>
          <PanelToggle side="right" open label={t("Agente")} onToggle={() => setAgentOpen(false)} />
        </div>

        {sessions.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border/50 px-1.5 py-1">
            {sessions.map((s) => {
              const active = s.id === activeChat;
              const trabajando = streaming?.sessionId === s.id;
              return (
                <div
                  key={s.id}
                  className={
                    "flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors " +
                    (active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50")
                  }
                >
                  <button
                    type="button"
                    onClick={() => setActiveChat(s.id)}
                    className="flex max-w-36 items-center gap-1.5 truncate"
                    title={s.title}
                  >
                    {trabajando && <Loader2 className="size-3 shrink-0 animate-spin text-primary" />}
                    <span className="truncate">{s.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => closeChat(s.id)}
                    aria-label={t("Cerrar {title}", { title: s.title })}
                    className="shrink-0 hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <MessageScroller
          busy={busy}
          navigation="rail"
          railItems={railItems}
          label={t("Conversación con el agente")}
          viewportClassName="px-3 py-3"
          contentClassName="gap-3"
        >
          {chat.length === 0 && !busy && (
            <div className="space-y-2 rounded-lg border border-dashed border-border/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <Sparkles className="size-3.5 text-primary" />
                {t("El agente puede mirar el recurso")}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("No sólo ve el fichero abierto: puede listar y leer los demás, y buscar un evento o un export por todos los recursos. Pídele que arregle algo y te propondrá el cambio con su diff, para que lo apruebes tú.")}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => ask(t(suggestion))}
                    disabled={!current}
                    className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors enabled:hover:border-border enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-50"
                  >
                    {t(suggestion)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chat.map((entry, index) => (
            <div key={index} data-message-id={`msg-${index}`} className="space-y-2">
              {entry.role === "user" ? (
                <div className="ml-6 space-y-2">
                  {entry.images && entry.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.images.map((url, i) => (
                        <Image
                          key={i}
                          src={url}
                          alt={t("adjunta")}
                          width={64}
                          height={64}
                          unoptimized
                          className="h-16 w-16 rounded-md border border-border/50 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {entry.attachments && entry.attachments.some((a) => a.kind !== "image") && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.attachments
                        .filter((a) => a.kind !== "image")
                        .map((a) => (
                          <span
                            key={a.name}
                            className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {a.kind === "selection" ? <Braces className="size-3" /> : <FileText className="size-3" />}
                            <span className="max-w-40 truncate">{a.name}</span>
                          </span>
                        ))}
                    </div>
                  )}
                  {entry.content && (
                    <div className="rounded-lg bg-primary/10 px-3 py-2 text-xs">{entry.content}</div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {entry.plan && entry.plan.length > 0 && (
                    <TodoList items={planItems(entry.plan, true)} defaultOpen={false} />
                  )}

                  {entry.thinking && (
                    <AgentReasoning thinking={entry.thinking} running={false} elapsedSeconds={entry.thoughtSeconds} />
                  )}

                  {entry.tools?.map((run, runIndex) => (
                    <ToolResult
                      key={`${run.id}-${runIndex}`}
                      tool={run.name}
                      title={toolTitle(run)}
                      status={run.status}
                      kind={run.name === "buscar_en_recursos" ? "terminal" : "request"}
                      meta={run.ms !== undefined ? `${run.ms} ms` : undefined}
                      copyText={run.output}
                      maxHeight={200}
                    >
                      <ToolResultOutput language={toolLanguage(run)}>
                        {run.output ?? ""}
                      </ToolResultOutput>
                    </ToolResult>
                  ))}

                  <StreamingResponse
                    status={entry.failed ? "error" : "complete"}
                    copyText={entry.content}
                    onRetry={entry.askedWith ? () => ask(entry.askedWith) : undefined}
                    feedback={entry.feedback ?? null}
                    onFeedbackChange={(value) =>
                      patchSession(activeChat, (s) => ({
                        ...s,
                        entries: s.entries.map((e, i) => (i === index ? { ...e, feedback: value } : e)),
                      }))
                    }
                    sources={(entry.sources ?? []).map((file) => ({
                      id: file,
                      title: file,
                      onOpen: current ? () => openFile(current.resource, file) : undefined,
                    }))}
                    meta={entry.usage ? <TokenUsage usage={entry.usage} /> : undefined}
                    className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                  >
                    {entry.content}
                  </StreamingResponse>

                  {entry.question && (
                    <ApprovalCard
                      title={entry.question.cabecera || t("Hace falta que decidas")}
                      description={entry.question.pregunta}
                      status={entry.answered ? "approved" : "pending"}
                      questions={
                        entry.answered
                          ? []
                          : [
                              {
                                id: "respuesta",
                                prompt: entry.question.pregunta,
                                type: "single",
                                options: entry.question.opciones.map((o) => ({ id: o, label: o })),
                              },
                            ]
                      }
                      onSubmit={(answers) => {
                        const elegida = String(answers.respuesta ?? "");
                        if (!elegida) return;
                        patchSession(activeChat, (sesion) => ({
                          ...sesion,
                          entries: sesion.entries.map((e, i) =>
                            i === index ? { ...e, answered: elegida } : e
                          ),
                        }));
                        void ask(elegida);
                      }}
                    />
                  )}

                  {entry.soloPlan && entry.plan && entry.plan.length > 0 && !entry.answered && (
                    <button
                      type="button"
                      onClick={() => {
                        setModoPlan(false);
                        patchSession(activeChat, (sesion) => ({
                          ...sesion,
                          entries: sesion.entries.map((e, i) =>
                            i === index ? { ...e, answered: t("Adelante") } : e
                          ),
                        }));
                        void ask(t("Adelante con el plan. Hazlo."));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/85"
                    >
                      <ClipboardCheck className="size-3.5" />
                      {t("Ejecutar el plan")}
                    </button>
                  )}

                  {entry.proposals && entry.proposals.length > 0 && (
                    <div className="space-y-2">
                      {entry.proposals.length > 1 && (
                        <ApprovalCard
                          title={t("{length} ficheros con cambios", { length: entry.proposals.length })}
                          description={t("Puedes decidir sobre todos a la vez o uno a uno, más abajo.")}
                          status={
                            entry.proposals.every((p) => p.decision)
                              ? entry.proposals.every((p) => p.decision === "rejected")
                                ? "rejected"
                                : "approved"
                              : "pending"
                          }
                          approveLabel={t("Cargar todos en el editor")}
                          changesLabel={t("Pedir otra versión")}
                          rejectLabel={t("Descartar todos")}
                          onApprove={async () => {
                            for (const proposal of entry.proposals!) {
                              await applyProposal(proposal);
                              markProposal(proposal.id, "editor");
                            }
                          }}
                          onRequestChanges={() =>
                            ask(t("Revisa esa propuesta: no me convence. Explica primero qué harías distinto."))
                          }
                          onReject={() =>
                            entry.proposals!.forEach((p) => markProposal(p.id, "rejected"))
                          }
                          result={proposalSummary(entry.proposals)}
                        />
                      )}

                      {entry.proposals.map((proposal) => (
                        <ProposalReview
                          key={proposal.id}
                          proposal={proposal}
                          original={currentContentOf(proposal.file)}
                          gated={saveGate?.id === proposal.id}
                          onLoad={async () => {
                            await applyProposal(proposal);
                            markProposal(proposal.id, "editor");
                          }}
                          onRequestSave={() =>
                            alwaysSave ? saveProposal(proposal) : setSaveGate(proposal)
                          }
                          onApproveSave={async (always) => {
                            if (always) setAlwaysSave(true);
                            setSaveGate(null);
                            await saveProposal(proposal);
                          }}
                          onDenySave={() => setSaveGate(null)}
                          onReject={() => markProposal(proposal.id, "rejected")}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {streaming && streaming.sessionId === activeChat && (
            <div data-message-id="msg-live" className="space-y-2">
              {streaming.plan.length > 0 && (
                <TodoList items={planItems(streaming.plan, false, streaming.tools.length)} />
              )}

              <div className="flex items-start gap-2">
                <AgentReasoning thinking={streaming.thinking} running className="min-w-0 flex-1" />
                {streaming.usage && <TokenUsage usage={streaming.usage} live />}
              </div>

              {streaming.tools.map((run, runIndex) => (
                <ToolResult
                  key={`${run.id}-${runIndex}`}
                  tool={run.name}
                  title={toolTitle(run)}
                  status={run.status}
                  kind={run.name === "buscar_en_recursos" ? "terminal" : "request"}
                  meta={run.ms !== undefined ? `${run.ms} ms` : undefined}
                  maxHeight={180}
                >
                  <ToolResultOutput language={toolLanguage(run)}>
                    {run.output ?? "…"}
                  </ToolResultOutput>
                </ToolResult>
              ))}

              {streaming.reply && (
                <StreamingResponse
                  status="streaming"
                  className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                >
                  {streaming.reply}
                </StreamingResponse>
              )}

            </div>
          )}

          <div ref={chatEndRef} />
        </MessageScroller>

        <div className="border-t border-border/50 p-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) processFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <PromptInput
            value={prompt}
            onValueChange={setPrompt}
            onSubmit={() => ask()}
            loading={busy}
            onStop={stopAnswer}
            disabled={!activeServer}
            placeholder={
              current ? t("Pregunta sobre {filePath}…", { filePath: current.filePath }) : t("Abre un fichero para empezar")
            }
            models={aiModels}
            model={aiModel}
            onModelChange={changeModel}
            actions={promptActions}
            onAction={runPromptAction}
            leadingAction={
              <ControlesAgente
                esfuerzo={esfuerzo}
                onEsfuerzo={cambiarEsfuerzo}
                modoPlan={modoPlan}
                onModoPlan={setModoPlan}
                disabled={busy}
              />
            }
            header={
              attachments.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {attachments.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex max-w-56 items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {a.kind === "image" ? (
                        <ImageIcon className="size-3 shrink-0" />
                      ) : a.kind === "selection" ? (
                        <Braces className="size-3 shrink-0" />
                      ) : (
                        <FileText className="size-3 shrink-0" />
                      )}
                      <span className="truncate">{a.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        className="shrink-0 hover:text-foreground"
                        aria-label={t("Quitar {name}", { name: a.name })}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null
            }
          />
        </div>
      </aside>

      {!agentOpen && (
        <CollapsedRail
          side="right"
          label={t("Agente")}
          icon={Sparkles}
          onOpen={() => setAgentOpen(true)}
        />
      )}

      <Dialog open={eventsOpen} onOpenChange={setEventsOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="size-5 text-primary" />
              {t("Eventos del Servidor")}
            </DialogTitle>
            <DialogDescription>
              {t("Descubre qué eventos registra cada recurso (ahí está el de revivir de tu framework) y configura las acciones del panel de jugadores.")}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={eventsTab}
            onValueChange={(v) => {
              setEventsTab(v as "scan" | "actions");
              if (v === "scan" && !scan) runScan();
            }}
            className="flex flex-col min-h-0 flex-1"
          >
            <TabsList className="w-fit">
              <TabsTrigger value="scan" className="gap-1.5">
                <ListTree className="size-3.5" />{" "}{t("Eventos en recursos")}
              </TabsTrigger>
              <TabsTrigger value="actions" className="gap-1.5">
                <Settings2 className="size-3.5" />{" "}{t("Acciones del jugador")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="scan" className="flex flex-col min-h-0 flex-1 gap-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={scanSearch}
                    onChange={(e) => setScanSearch(e.target.value)}
                    placeholder={t("Buscar evento…")}
                    className="h-8 pl-7 text-xs"
                  />
                </div>
                <select
                  value={scanScript}
                  onChange={(e) => setScanScript(e.target.value)}
                  className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-muted-foreground"
                  aria-label={t("Filtrar por recurso")}
                >
                  <option value="all">{t("Todos los recursos")}</option>
                  {scan?.scripts.map((s) => (
                    <option key={s.script} value={s.script}>{s.script}</option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={runScan}
                  disabled={scanLoading}
                  title={t("Volver a escanear los recursos")}
                >
                  <RefreshCcw className={`size-3.5 ${scanLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/50 bg-muted/10 p-2 space-y-3">
                {scanLoading && (
                  <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />{" "}{t("Escaneando recursos…")}
                  </p>
                )}
                {scanError && (
                  <p className="p-3 text-xs text-red-400">{scanError}</p>
                )}
                {!scanLoading && !scanError && !scan && (
                  <p className="p-3 text-xs text-muted-foreground">{t("Pulsa el botón de refrescar para escanear.")}</p>
                )}
                {!scanLoading && scan && scan.scripts.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">
                    {t("No se encontraron eventos. Revisa que serverDataPath apunte a la carpeta de recursos.")}
                  </p>
                )}

                {scan?.scripts
                  .filter((s) => scanScript === "all" || s.script === scanScript)
                  .map((s) => {
                    const filtered = s.events.filter((e) =>
                      e.name.toLowerCase().includes(scanSearch.toLowerCase())
                    );
                    if (filtered.length === 0) return null;
                    return (
                      <div key={s.script}>
                        <p className="flex items-center gap-2 px-1 pb-1 text-[11px] font-semibold text-foreground/80">
                          <FileCode className="size-3 text-primary" />
                          {s.script}
                          <span className="text-muted-foreground/60 font-normal">({filtered.length})</span>
                        </p>
                        <div className="space-y-0.5">
                          {filtered.map((e) => (
                            <div
                              key={e.name}
                              className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-2 py-1"
                            >
                              <span className="truncate font-mono text-[11px]" title={e.name}>
                                {e.name}
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                {e.usage.map((u) => (
                                  <Badge
                                    key={u}
                                    variant="outline"
                                    className={
                                      u === "register"
                                        ? "bg-blue-500/10 text-blue-400 border-blue-500/25 text-[9px] h-4"
                                        : u === "handler"
                                          ? "bg-purple-500/10 text-purple-400 border-purple-500/25 text-[9px] h-4"
                                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 text-[9px] h-4"
                                    }
                                  >
                                    {u}
                                  </Badge>
                                ))}
                                <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                                  ×{e.count}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </TabsContent>

            <TabsContent value="actions" className="min-h-0 overflow-y-auto pr-1">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {t("Los botones del panel de Jugadores se actualizan al instante.")}
                </p>
                <Button size="sm" onClick={saveActionsConfig} disabled={savingActions}>
                  {savingActions ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Check className="mr-2 size-3.5" />}
                  {t("Guardar")}
                </Button>
              </div>
              <ActionsEditor actions={actionsDraft} onChange={setActionsDraft} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
