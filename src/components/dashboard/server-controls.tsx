"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Play,
  Square,
  RotateCw,
  Loader2,
  CalendarClock,
  Plus,
  Trash2,
  Power,
} from "lucide-react";
import { AGENT_URL } from "@/lib/agent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useServerContext } from "@/context/server-context";
import { toast } from "sonner";
import { ConsoleTerminal } from "@/components/dashboard/console-terminal";
import { t, intlLocale } from "@/i18n";

interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: string; at?: string; everyMinutes?: number };
  actions: { type: string }[];
  lastRunAt?: string;
  lastResult?: string;
  lastOk?: boolean;
  runCount: number;
}

export function ServerControls() {
  const { activeServer, toggleServerPower, restartServer } = useServerContext();
  const [busy, setBusy] = useState<null | "power" | "restart">(null);

  const online = activeServer?.status === "online";
  const managed = Boolean(activeServer?.managed);

  const runPower = async () => {
    if (!activeServer) return;
    setBusy("power");
    const result = await toggleServerPower(activeServer.id);
    setBusy(null);
    if (result.success) toast.success(result.message);
    else if (!result.handled)
      toast.error(t("No se pudo completar"), { description: result.message, duration: 8000 });
  };

  const runRestart = async () => {
    if (!activeServer) return;
    setBusy("restart");
    const result = await restartServer(activeServer.id);
    setBusy(null);
    if (result.success) toast.success(result.message);
    else if (!result.handled)
      toast.error(t("No se pudo reiniciar"), { description: result.message, duration: 8000 });
  };

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardContent className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={
              "flex size-11 shrink-0 items-center justify-center rounded-xl " +
              (online ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground")
            }
          >
            <Power className="size-5" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold">
                {activeServer?.name ?? t("Sin servidor")}
              </h3>
              <Badge
                variant={online ? "default" : "secondary"}
                className={online ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15" : ""}
              >
                {online ? t("En línea") : t("Detenido")}
              </Badge>
              {online && !managed && <Badge variant="outline">{t("Externo")}</Badge>}
            </div>

            <p className="mt-0.5 text-sm text-muted-foreground">
              {online ? (
                <>
                  {t("{players} jugadores", { players: activeServer?.players })}
                  {activeServer?.uptime && activeServer.uptime !== t("Detenido") && (
                    <> · {activeServer.uptime}</>
                  )}
                  {!managed && t(" · lo arrancó otra herramienta, no se puede parar desde aquí")}
                </>
              ) : (
                t("Listo para arrancar.")
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            size="lg"
            variant={online ? "outline" : "default"}
            onClick={runPower}
            disabled={!activeServer || busy !== null || (online && !managed)}
            title={online && !managed ? t("Sólo se puede detener lo que arrancó VXCore") : undefined}
          >
            {busy === "power" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : online ? (
              <Square className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
            {online ? t("Detener") : t("Arrancar")}
          </Button>

          <Button size="lg" variant="outline" onClick={runRestart} disabled={!activeServer || busy !== null}>
            {busy === "restart" ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
            {t("Reiniciar")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuickConsole() {
  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardContent className="p-3">
        <ConsoleTerminal />
      </CardContent>
    </Card>
  );
}

export function ScheduledRestarts() {
  const [items, setItems] = useState<Automation[]>([]);
  const [time, setTime] = useState("06:00");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/automations`);
      const data = await res.json();
      const all: Automation[] = data.automations || data.items || [];
      setItems(all.filter((a) => a.trigger?.type === "daily" && a.actions?.some((x) => x.type === "restart")));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const add = async () => {
    if (!/^\d{2}:\d{2}$/.test(time)) {
      toast.error(t("La hora debe tener el formato HH:MM."));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/automations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Reinicio diario a las ${time}`,
          trigger: { type: "daily", at: time },
          actions: [{ type: "restart" }],
          enabled: true,
        }),
      });
      const data = await res.json();
      if (data.success === false) {
        toast.error(t("No se pudo programar"), { description: data.error });
      } else {
        toast.success(t("Reinicio programado a las {time}.", { time }));
        load();
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string) => {
    await fetch(`${AGENT_URL}/api/automations/${id}/toggle`, { method: "POST" }).catch(() => {});
    load();
  };

  const remove = async (id: string) => {
    await fetch(`${AGENT_URL}/api/automations/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  const runNow = async (id: string) => {
    try {
      const res = await fetch(`${AGENT_URL}/api/automations/${id}/run`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(t("Reinicio ejecutado ahora"), {
          description: (data.run?.results as { message: string }[] | undefined)
            ?.map((r) => r.message)
            .join(" · "),
        });
      } else {
        toast.error(t("El reinicio falló"), { description: data.error, duration: 8000 });
      }
      load();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    }
  };

  const nextFire = (at: string) => {
    const [hh, mm] = at.split(":").map(Number);
    const now = new Date();
    const next = new Date();
    next.setHours(hh, mm, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const sameDay = next.toDateString() === now.toDateString();
    return t("{valor} a las {at}", { valor: sameDay ? "Hoy" : "Mañana", at });
  };

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-primary" />
          {t("Reinicios programados")}
        </CardTitle>
        <CardDescription>
          {t("A la hora indicada, el agente detiene el servidor y lo vuelve a arrancar.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-32"
            aria-label={t("Hora del reinicio")}
          />
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t("Programar")}
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No hay ningún reinicio programado.")}</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-2.5"
              >
                <Badge variant="secondary" className="font-mono shrink-0">
                  {item.trigger.at}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.enabled ? (
                      <span className="text-emerald-400">{nextFire(item.trigger.at!)}</span>
                    ) : (
                      <span>{t("Pausado")}</span>
                    )}
                    {item.lastRunAt && (
                      <span className="block">
                        {t("Última: {fecha}", { fecha: new Date(item.lastRunAt).toLocaleString(intlLocale()) })}
                        {item.lastResult && ` · ${item.lastResult}`}
                      </span>
                    )}
                    {item.runCount === 0 && !item.lastRunAt && <span className="block">{t("Todavía no se ha ejecutado")}</span>}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => runNow(item.id)}
                  title={t("Probar el reinicio ahora mismo")}
                >
                  <Play className="mr-1.5 size-3" />
                  {t("Probar")}
                </Button>
                <Switch
                  checked={item.enabled}
                  onCheckedChange={() => toggle(item.id)}
                  aria-label={t("Activar o desactivar")}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(item.id)}
                  aria-label={t("Eliminar")}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
