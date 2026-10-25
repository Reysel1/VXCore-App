"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AGENT_URL } from "@/lib/agent";
import {
  Plus,
  Play,
  Trash2,
  Zap,
  Terminal,
  Webhook,
  Power,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Workflow,
  Activity,
  History,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useServerContext } from "@/context/server-context";
import { toast } from "sonner";
import { t, msg, intlLocale } from "@/i18n";

type Trigger =
  | { type: "interval"; everyMinutes: number }
  | { type: "daily"; at: string }
  | { type: "log_match"; pattern: string }
  | { type: "cpu_above"; percent: number; forSeconds: number }
  | { type: "ram_above"; percent: number; forSeconds: number }
  | { type: "server_offline" };

type NoticeLevel = "info" | "success" | "warning" | "error";

type Action =
  | { type: "notify"; title: string; message: string; level: NoticeLevel }
  | { type: "command"; command: string }
  | { type: "webhook"; url: string; message: string }
  | { type: "restart" }
  | { type: "start" }
  | { type: "stop" };

interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  actions: Action[];
  runCount: number;
  lastRunAt?: string;
  lastResult?: string;
  lastOk?: boolean;
}

interface RunResult {
  automationId: string;
  name: string;
  at: string;
  reason: string;
  success: boolean;
  results: { action: Action; success: boolean; message: string }[];
}

const TRIGGER_TEMPLATES: { label: string; hint: string; build: () => Trigger }[] = [
  { label: msg("Cada X minutos"), hint: msg("Reinicios periódicos, avisos recurrentes"), build: () => ({ type: "interval", everyMinutes: 240 }) },
  { label: msg("A una hora fija"), hint: msg("Reinicio nocturno diario"), build: () => ({ type: "daily", at: "05:00" }) },
  { label: msg("Texto en la consola"), hint: msg("Reacciona a errores o eventos del servidor"), build: () => ({ type: "log_match", pattern: "error" }) },
  { label: msg("CPU por encima de"), hint: msg("Avisa cuando el servidor se ahoga"), build: () => ({ type: "cpu_above", percent: 85, forSeconds: 60 }) },
  { label: msg("RAM por encima de"), hint: msg("Detecta fugas de memoria"), build: () => ({ type: "ram_above", percent: 90, forSeconds: 60 }) },
  { label: msg("El servidor se cae"), hint: msg("Levántalo solo o avisa al staff"), build: () => ({ type: "server_offline" }) },
];

const ACTION_TEMPLATES: { label: string; icon: typeof Terminal; build: () => Action }[] = [
  { label: msg("Aviso en pantalla"), icon: Megaphone, build: () => ({ type: "notify", title: t("Aviso del servidor"), message: t("Reinicio en 5 minutos"), level: "warning" }) },
  { label: msg("Comando de consola"), icon: Terminal, build: () => ({ type: "command", command: "refresh" }) },
  { label: msg("Webhook (Discord)"), icon: Webhook, build: () => ({ type: "webhook", url: "", message: "[{{hora}}] {{flujo}} en {{servidor}}: {{motivo}}" }) },
  { label: msg("Reiniciar servidor"), icon: Power, build: () => ({ type: "restart" }) },
  { label: msg("Arrancar servidor"), icon: Power, build: () => ({ type: "start" }) },
  { label: msg("Detener servidor"), icon: Power, build: () => ({ type: "stop" }) },
];

function describeTrigger(trigger: Trigger): string {
  switch (trigger.type) {
    case "interval": return t("Cada {everyMinutes} minutos", { everyMinutes: trigger.everyMinutes });
    case "daily": return t("Todos los días a las {at}", { at: trigger.at });
    case "log_match": return t("La consola contiene \"{pattern}\"", { pattern: trigger.pattern });
    case "cpu_above": return `CPU > ${trigger.percent}% durante ${trigger.forSeconds}s`;
    case "ram_above": return `RAM > ${trigger.percent}% durante ${trigger.forSeconds}s`;
    case "server_offline": return t("El servidor pasa a estar detenido");
  }
}

function FlowConnector({ onAdd }: { onAdd: (action: Action) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center py-1">
      <div className="h-3 w-px bg-border" />
      {open ? (
        <div className="flex flex-wrap justify-center gap-1 rounded-lg border border-border/60 bg-background p-1.5">
          {ACTION_TEMPLATES.map(({ label, icon: Icon, build }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                onAdd(build());
                setOpen(false);
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Icon className="size-3" /> {t(label)}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="size-3" />{" "}{t("Añadir acción")}
        </button>
      )}
      <div className="h-3 w-px bg-border" />
      <div className="size-2 rotate-45 border-b border-r border-border" />
    </div>
  );
}

const NOTICE_LEVELS: { value: NoticeLevel; label: string; dot: string }[] = [
  { value: "info", label: msg("Información"), dot: "bg-muted-foreground" },
  { value: "success", label: msg("Hecho"), dot: "bg-emerald-400" },
  { value: "warning", label: msg("Atención"), dot: "bg-amber-400" },
  { value: "error", label: msg("Problema"), dot: "bg-red-400" },
];

function describeAction(action: Action): string {
  switch (action.type) {
    case "notify": return t("Aviso en pantalla: {valor}", { valor: action.message || "(sin texto)" });
    case "command": return t("Ejecutar: {command}", { command: action.command });
    case "webhook": return t("Webhook → {valor}", { valor: action.url || "(sin URL)" });
    case "restart": return t("Reiniciar el servidor");
    case "start": return t("Arrancar el servidor");
    case "stop": return t("Detener el servidor");
  }
}

export default function AutomationsPage() {
  const { activeServer } = useServerContext();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [history, setHistory] = useState<RunResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentDown, setAgentDown] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Automation | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/automations`);
      const data = await res.json();
      if (data.success) {
        const automations: Automation[] = data.automations ?? [];

        setAutomations(automations);
        setHistory(data.history ?? []);
        setAgentDown(false);
        setSelectedId((prev) =>
          prev && automations.some((a) => a.id === prev) ? prev : automations[0]?.id ?? null
        );
      }
    } catch {
      setAgentDown(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    const interval = setInterval(load, 10000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [load]);

  const selected = automations.find((a) => a.id === selectedId) ?? null;

  const openEditor = (automation?: Automation) => {
    setDraft(
      automation
        ? JSON.parse(JSON.stringify(automation))
        : {
            id: "",
            name: t("Nuevo flujo"),
            enabled: true,
            trigger: { type: "interval", everyMinutes: 240 },
            actions: [{ type: "notify", title: t("Aviso del servidor"), message: t("Reinicio en 5 minutos"), level: "warning" }],
            runCount: 0,
          }
    );
    setEditorOpen(true);
  };

  const saveDraft = async () => {
    if (!draft) return;
    try {
      const res = await fetch(`${AGENT_URL}/api/automations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id || undefined,
          name: draft.name,
          trigger: draft.trigger,
          actions: draft.actions,
          enabled: draft.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t("El agente rechazó el flujo"));

      toast.success(t("Flujo \"{name}\" guardado", { name: draft.name }));
      setEditorOpen(false);
      setSelectedId(data.automation.id);
      load();
    } catch (err) {
      toast.error(t("No se pudo guardar el flujo"), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const toggleAutomation = async (automation: Automation) => {
    try {
      await fetch(`${AGENT_URL}/api/automations/${automation.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !automation.enabled }),
      });
      load();
    } catch {
      toast.error(t("No se pudo cambiar el estado del flujo"));
    }
  };

  const removeAutomation = async (automation: Automation) => {
    try {
      await fetch(`${AGENT_URL}/api/automations/${automation.id}`, { method: "DELETE" });
      toast.success(t("Flujo \"{name}\" eliminado", { name: automation.name }));
      load();
    } catch {
      toast.error(t("No se pudo eliminar el flujo"));
    }
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/automations/ai-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const data = await res.json();
      if (data.success && data.flow) {
        const flow = data.flow;
        setDraft({
          id: draft?.id || "",
          name: flow.name,
          enabled: true,
          trigger: flow.trigger,
          actions: (flow.actions || []).slice(0, 4),
          runCount: draft?.runCount ?? 0,
        });
        toast.success(t("Flujo generado con IA — revísalo antes de guardar"));
        setAiPrompt("");
      } else {
        toast.error(t("La IA no pudo generar el flujo"), { description: data.error, duration: 8000 });
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setAiGenerating(false);
    }
  };

  const updateAction = (index: number, patch: Partial<Action>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      actions: draft.actions.map((a, i) => (i === index ? ({ ...a, ...patch } as Action) : a)),
    });
  };

  const removeAction = (index: number) => {
    if (!draft) return;
    setDraft({ ...draft, actions: draft.actions.filter((_, i) => i !== index) });
  };

  const moveAction = (index: number, dir: -1 | 1) => {
    if (!draft) return;
    const target = index + dir;
    if (target < 0 || target >= draft.actions.length) return;
    const actions = [...draft.actions];
    [actions[index], actions[target]] = [actions[target], actions[index]];
    setDraft({ ...draft, actions });
  };

  const runNow = async (automation: Automation) => {
    setRunningId(automation.id);
    try {
      const res = await fetch(`${AGENT_URL}/api/automations/${automation.id}/run`, { method: "POST" });
      const data = await res.json();
      const run: RunResult | undefined = data.run;

      if (data.success) {
        toast.success(t("\"{name}\" ejecutado", { name: automation.name }), {
          description: run?.results.map((r) => r.message).join(" · "),
        });
      } else {
        toast.error(t("\"{name}\" falló", { name: automation.name }), {
          description: run?.results.filter((r) => !r.success).map((r) => r.message).join(" · ") || data.error,
          duration: 9000,
        });
      }
      load();
    } catch {
      toast.error(t("No se pudo contactar con el Agente VXCore"));
    } finally {
      setRunningId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="size-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm">{t("Cargando automatizaciones...")}</p>
      </div>
    );
  }

  if (agentDown) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="size-10 text-red-400" />
        <p className="text-muted-foreground text-sm max-w-md text-center">
          {t("El Agente VXCore no responde en el puerto 4000. Las automatizaciones se ejecutan en el agente, así que sin él no hay nada que mostrar.")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background rounded-xl border border-border/50 shadow-sm">
      <div className="w-72 border-r border-border/50 bg-muted/10 flex flex-col shrink-0">
        <div className="p-4 border-b border-border/50">
          <Button className="w-full justify-start shadow-none" size="sm" onClick={() => openEditor()}>
            <Plus className="mr-2 size-4" />{" "}{t("Nuevo Flujo")}
          </Button>
        </div>
        <ScrollArea className="flex-1 p-2">
          <div className="space-y-1">
            {automations.length === 0 && (
              <p className="text-xs text-muted-foreground p-3 leading-relaxed">
                {t("No hay ningún flujo todavía. Crea uno y el agente lo evaluará cada 10 segundos.")}
              </p>
            )}
            {automations.map((automation) => (
              <button
                key={automation.id}
                onClick={() => setSelectedId(automation.id)}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                  selectedId === automation.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`size-1.5 rounded-full shrink-0 ${
                      automation.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
                    }`}
                  />
                  <span className="font-medium text-sm truncate">{automation.name}</span>
                </div>
                <span className="text-[11px] opacity-70 block truncate pl-3.5">
                  {describeTrigger(automation.trigger)}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Workflow className="size-10 opacity-30" />
            <p className="text-sm">{t("Selecciona o crea un flujo.")}</p>
          </div>
        ) : (
          <>
            <div className="h-14 border-b border-border/50 flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Badge
                  variant="outline"
                  className={
                    selected.enabled
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"
                      : "bg-muted text-muted-foreground gap-1"
                  }
                >
                  <span className={`size-1.5 rounded-full ${selected.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                  {selected.enabled ? t("Activo") : t("Pausado")}
                </Badge>
                <h3 className="font-semibold text-sm truncate">{selected.name}</h3>
                <span className="text-xs text-muted-foreground truncate">
                  • {activeServer?.name || t("sin servidor")}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={selected.enabled} onCheckedChange={() => toggleAutomation(selected)} />
                <Button variant="outline" size="sm" className="h-8" onClick={() => runNow(selected)} disabled={runningId === selected.id}>
                  {runningId === selected.id ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Play className="mr-2 size-3.5" />}
                  {t("Ejecutar ahora")}
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => openEditor(selected)}>
                  {t("Editar")}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400" onClick={() => removeAutomation(selected)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-4 max-w-2xl">
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="size-4 text-primary" />{" "}{t("Disparador")}
                    </CardTitle>
                    <CardDescription className="text-xs">{describeTrigger(selected.trigger)}</CardDescription>
                  </CardHeader>
                </Card>

                {selected.actions.map((action, index) => (
                  <Card key={index} className="border-border/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="size-4 text-blue-400" />{" "}{t("Acción")}{" "}{index + 1}
                      </CardTitle>
                      <CardDescription className="text-xs font-mono break-all">{describeAction(action)}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}

                <Card className="border-border/50 bg-muted/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <History className="size-4" />{" "}{t("Historial")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <p className="text-muted-foreground">
                      {t("Ejecutado {runCount} vez(ces).", { runCount: selected.runCount })}
                      {selected.lastRunAt && t(" Última: {fecha}.", { fecha: new Date(selected.lastRunAt).toLocaleString(intlLocale()) })}
                    </p>
                    {selected.lastResult && (
                      <p className={selected.lastOk ? "text-emerald-400" : "text-red-400"}>{selected.lastResult}</p>
                    )}

                    <div className="pt-2 space-y-1.5">
                      {history
                        .filter((run) => run.automationId === selected.id)
                        .slice(0, 8)
                        .map((run, i) => (
                          <div key={i} className="flex items-start gap-2 border-t border-border/40 pt-1.5">
                            {run.success ? (
                              <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="size-3.5 text-red-400 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <p className="text-muted-foreground">
                                {new Date(run.at).toLocaleTimeString(intlLocale())} — {t(run.reason)}
                              </p>
                              <p className="text-[11px] opacity-70 break-words">
                                {run.results.map((r) => r.message).join(" · ")}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("Editar flujo") : t("Nuevo flujo")}</DialogTitle>
            <DialogDescription>
              {t("El agente evalúa los disparadores cada 10 segundos y ejecuta las acciones de verdad.")}
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <DialogBody className="space-y-4 py-2">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles className="size-3.5 text-primary" />
                  {t("Generar flujo con IA")}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && generateWithAI()}
                    placeholder={t("Ej: reinicia el servidor cada 6 horas y avisa en el chat…")}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={generateWithAI}
                    disabled={aiGenerating || !aiPrompt.trim()}
                  >
                    {aiGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t("Necesita un proveedor de IA en Ajustes → Agente IA. Lo que genere lo tendrás que revisar antes de guardar.")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Nombre del flujo")}</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 text-xs" />
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/10 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t("Flujo")}
                </p>

                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Zap className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{t("Disparador")}</p>
                      <p className="truncate text-xs font-medium">{describeTrigger(draft.trigger)}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TRIGGER_TEMPLATES.map((template) => {
                      const candidate = template.build();
                      const active = draft.trigger.type === candidate.type;
                      return (
                        <Button
                          key={template.label}
                          variant={active ? "default" : "outline"}
                          size="sm"
                          className="h-6 text-[11px]"
                          title={t(template.hint)}
                          onClick={() => setDraft({ ...draft, trigger: candidate })}
                        >
                          {t(template.label)}
                        </Button>
                      );
                    })}
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {draft.trigger.type === "interval" && (
                      <Input
                        type="number"
                        min={1}
                        value={draft.trigger.everyMinutes}
                        onChange={(e) => setDraft({ ...draft, trigger: { type: "interval", everyMinutes: Number(e.target.value) } })}
                        className="h-7 text-xs"
                        placeholder={t("Cada cuántos minutos")}
                      />
                    )}
                    {draft.trigger.type === "daily" && (
                      <Input
                        type="time"
                        value={draft.trigger.at}
                        onChange={(e) => setDraft({ ...draft, trigger: { type: "daily", at: e.target.value } })}
                        className="h-7 text-xs"
                      />
                    )}
                    {draft.trigger.type === "log_match" && (
                      <Input
                        value={draft.trigger.pattern}
                        onChange={(e) => setDraft({ ...draft, trigger: { type: "log_match", pattern: e.target.value } })}
                        className="h-7 text-xs font-mono"
                        placeholder={t("Texto o expresión regular (ej: error fatal)")}
                      />
                    )}
                    {(draft.trigger.type === "cpu_above" || draft.trigger.type === "ram_above") && (
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={draft.trigger.percent}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              trigger: { ...(draft.trigger as Extract<Trigger, { percent: number }>), percent: Number(e.target.value) },
                            })
                          }
                          className="h-7 text-xs"
                          placeholder="%"
                        />
                        <Input
                          type="number"
                          value={draft.trigger.forSeconds}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              trigger: { ...(draft.trigger as Extract<Trigger, { percent: number }>), forSeconds: Number(e.target.value) },
                            })
                          }
                          className="h-7 text-xs"
                          placeholder={t("segundos")}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {draft.actions.map((action, index) => (
                  <React.Fragment key={index}>
                    <FlowConnector
                      onAdd={(a) => {
                        const actions = [...draft.actions];
                        actions.splice(index, 0, a);
                        setDraft({ ...draft, actions });
                      }}
                    />
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
                          <Activity className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                            {t("Acción")}{" "}{index + 1}
                          </p>
                          <p className="truncate text-xs font-medium">{describeAction(action)}</p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-foreground"
                            onClick={() => moveAction(index, -1)}
                            disabled={index === 0}
                            title={t("Subir")}
                            aria-label={t("Subir acción")}
                          >
                            <ArrowUp className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-foreground"
                            onClick={() => moveAction(index, 1)}
                            disabled={index === draft.actions.length - 1}
                            title={t("Bajar")}
                            aria-label={t("Bajar acción")}
                          >
                            <ArrowDown className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-red-400"
                            onClick={() => removeAction(index)}
                            title={t("Quitar acción")}
                            aria-label={t("Quitar acción")}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        {action.type === "notify" && (
                          <>
                            <Input
                              value={action.title}
                              onChange={(e) => updateAction(index, { title: e.target.value })}
                              className="h-7 text-xs"
                              placeholder={t("Título (p. ej. Aviso del servidor)")}
                            />
                            <Textarea
                              value={action.message}
                              onChange={(e) => updateAction(index, { message: e.target.value })}
                              rows={2}
                              className="text-xs"
                              placeholder={t("Lo que verán todos los jugadores en pantalla")}
                            />
                            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("Tipo de aviso")}>
                              {NOTICE_LEVELS.map((level) => (
                                <Button
                                  key={level.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={action.level === level.value}
                                  variant={action.level === level.value ? "outline" : "ghost"}
                                  className={action.level === level.value ? "" : "text-muted-foreground"}
                                  size="xs"
                                  onClick={() => updateAction(index, { level: level.value })}
                                >
                                  <span className={`size-1.5 rounded-full ${level.dot}`} />
                                  {t(level.label)}
                                </Button>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {t("Lo ven todos los jugadores conectados, con los avisos del recurso VXCore. Marcadores:")}{" "}
                              {"{{servidor}} {{flujo}} {{hora}}"}
                            </p>
                          </>
                        )}

                        {action.type === "command" && (
                          <Input
                            value={action.command}
                            onChange={(e) => updateAction(index, { command: e.target.value })}
                            className="h-7 text-xs font-mono"
                            placeholder={t("say Hola / restart qb-core / refresh")}
                          />
                        )}

                        {action.type === "webhook" && (
                          <>
                            <Input
                              value={action.url}
                              onChange={(e) => updateAction(index, { url: e.target.value })}
                              className="h-7 text-xs font-mono"
                              placeholder="https://discord.com/api/webhooks/..."
                            />
                            <Textarea
                              value={action.message}
                              onChange={(e) => updateAction(index, { message: e.target.value })}
                              rows={2}
                              className="text-xs font-mono"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              {t("Marcadores:")}{" "}{"{{servidor}} {{motivo}} {{flujo}} {{cpu}} {{ram}} {{hora}}"}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                ))}

                <FlowConnector
                  onAdd={(a) => {
                    setDraft({ ...draft, actions: [...draft.actions, a] });
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: Boolean(v) })} />
                <Label className="text-xs">{t("Activo")}</Label>
              </div>
            </DialogBody>
          )}

          <DialogFooter>
            <Button variant="destructive" onClick={() => setEditorOpen(false)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={saveDraft} disabled={!draft?.name || !draft?.actions.length}>
              {t("Guardar flujo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
