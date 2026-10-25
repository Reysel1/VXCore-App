"use client";

import { Plus, Trash2, Terminal, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { PlayerActionDef } from "@/lib/player-actions";
import { t } from "@/i18n";

export function ActionsEditor({
  actions,
  onChange,
}: {
  actions: PlayerActionDef[];
  onChange: (actions: PlayerActionDef[]) => void;
}) {
  const update = (index: number, patch: Partial<PlayerActionDef>) => {
    onChange(actions.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const remove = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([
      ...actions,
      {
        key: `action-${Date.now().toString(36)}`,
        label: t("Nueva acción"),
        kind: "command",
        command: "",
      },
    ]);
  };

  return (
    <div className="space-y-3">
      {actions.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("No hay acciones definidas todavía.")}</p>
      )}

      {actions.map((action, index) => (
        <div key={action.key} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Badge
                variant="outline"
                className={
                  action.kind === "event"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/25 gap-1"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 gap-1"
                }
              >
                {action.kind === "event" ? <Zap className="size-3" /> : <Terminal className="size-3" />}
                {action.kind === "event" ? t("Evento") : t("Comando")}
              </Badge>
              <Input
                value={action.label}
                onChange={(e) => update(index, { label: e.target.value })}
                className="h-7 text-xs font-medium"
                placeholder={t("Etiqueta del botón (ej: Revivir y curar)")}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-red-400"
              onClick={() => remove(index)}
              title={t("Quitar acción")}
              aria-label={t("Quitar acción")}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{t("Cómo se dispara")}</Label>
              <div className="flex rounded-md border border-border/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => update(index, { kind: "command" })}
                  className={`flex-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                    action.kind === "command" ? "bg-emerald-500/15 text-emerald-400" : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {t("Comando")}
                </button>
                <button
                  type="button"
                  onClick={() => update(index, { kind: "event" })}
                  className={`flex-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                    action.kind === "event" ? "bg-blue-500/15 text-blue-400" : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {t("Evento")}
                </button>
              </div>
            </div>

            {action.kind === "command" ? (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  {t("Comando · plantillas:")}{" "}{"{{id}}"} {"{{citizenid}}"} {"{{name}}"}
                </Label>
                <Input
                  value={action.command ?? ""}
                  onChange={(e) => update(index, { command: e.target.value })}
                  className="h-7 font-mono text-[11px]"
                  placeholder="revive {{id}}"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{t("Evento in-game (vxcore_event)")}</Label>
                <Input
                  value={action.event ?? ""}
                  onChange={(e) => update(index, { event: e.target.value })}
                  className="h-7 font-mono text-[11px]"
                  placeholder="hospital:client:Revive"
                />
              </div>
            )}
          </div>

          {action.kind === "event" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                {t("Payload JSON · usa")}{" "}{"{{source}}"} o {"{{id}}"}{" "}{t("para el jugador")}
              </Label>
              <Input
                value={action.payload ?? ""}
                onChange={(e) => update(index, { payload: e.target.value })}
                className="h-7 font-mono text-[11px]"
                placeholder='{"source":{{id}},"message":"Hola"}'
              />
            </div>
          )}

          {action.hint && <p className="text-[10px] text-muted-foreground/70">{action.hint}</p>}
        </div>
      ))}

      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={add}>
        <Plus className="size-3.5" />{" "}{t("Añadir acción")}
      </Button>
    </div>
  );
}
