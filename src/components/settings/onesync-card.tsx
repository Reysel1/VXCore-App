"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Loader2, Network } from "lucide-react";
import { toast } from "sonner";
import { AGENT_URL } from "@/lib/agent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerContext } from "@/context/server-context";
import { t, msg } from "@/i18n";

type Mode = "on" | "legacy" | "off";

interface State {
  mode: Mode;
  commentedOnly: boolean;
}

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "on", label: msg("Activado"), hint: msg("Lo que quiere cualquier servidor de rol moderno.") },
  { value: "legacy", label: "Legacy", hint: msg("Sólo para recursos antiguos que aún lo piden.") },
  { value: "off", label: msg("Desactivado"), hint: msg("Tope de 32 jugadores y sin state bags.") },
];

export function OneSyncCard() {
  const { activeServer } = useServerContext();
  const cfgPath = activeServer?.cfgPath;

  const [state, setState] = React.useState<State | null>(null);
  const [loading, setLoading] = React.useState(Boolean(cfgPath));
  const [saving, setSaving] = React.useState<Mode | null>(null);

  const [prevCfgPath, setPrevCfgPath] = React.useState(cfgPath);
  if (prevCfgPath !== cfgPath) {
    setPrevCfgPath(cfgPath);
    if (!cfgPath) {
      setState(null);
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!cfgPath) return;
    let cancelled = false;
    fetch(`${AGENT_URL}/api/server/onesync?cfgPath=${encodeURIComponent(cfgPath)}`)
      .then((res) => res.json())
      .then(
        (data: State & { success?: boolean }) => {
          if (!cancelled) setState(data.success ? data : null);
        },
        () => {
          if (!cancelled) setState(null);
        }
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cfgPath]);

  const apply = async (mode: Mode) => {
    if (!cfgPath) return;
    setSaving(mode);
    try {
      const res = await fetch(`${AGENT_URL}/api/server/onesync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfgPath, mode }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setState(data);
      } else {
        toast.error(t("No se pudo cambiar OneSync"), { description: data.error });
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/50 bg-background/50 backdrop-blur">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("Leyendo el server.cfg...")}
        </CardContent>
      </Card>
    );
  }

  if (!state) return null;

  const off = state.mode === "off";

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Network className="size-5 text-primary" />
          OneSync
        </CardTitle>
        <CardDescription>
          {t("Se guarda en tu")}{" "}<code className="font-mono text-xs">server.cfg</code>{t(", que es donde lo busca todo el mundo y donde sigue valiendo aunque cambies de panel.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {state.commentedOnly && off && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div className="space-y-1">
              <p className="font-medium">{t("Tu servidor está arrancando sin OneSync.")}</p>
              <p className="text-muted-foreground">
                {t("Este cfg lo generó otro gestor de servidores, que deja la línea")}{" "}
                <code className="font-mono text-xs">set onesync on</code>{" "}{t("comentada y la inyecta él al lanzar el servidor. Arrancado desde VXCore esa línea no se ejecuta, así que OneSync queda apagado. Actívalo aquí y quedará escrito en el cfg de verdad.")}
              </p>
            </div>
          </div>
        )}

        {!off && (
          <p className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="size-4" />
            {t("Activo en modo")}{" "}<code className="font-mono text-xs">{state.mode}</code>.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((option) => {
            const current = state.mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={Boolean(saving)}
                onClick={() => apply(option.value)}
                className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                  current
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/50 bg-muted/20 hover:border-border"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {saving === option.value && <Loader2 className="size-3.5 animate-spin" />}
                  {t(option.label)}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t(option.hint)}</span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {t("El cambio entra en el próximo arranque: OneSync se fija al levantar el servidor y no se puede cambiar en caliente.")}
        </p>
      </CardContent>
    </Card>
  );
}
