"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, RefreshCcw, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { AGENT_URL } from "@/lib/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/lib/access";
import { useServerContext } from "@/context/server-context";
import { t } from "@/i18n";

interface InGameResource {
  installed: boolean;
  ensured: boolean;
  reporting: boolean;
  lastHeartbeat: string | null;
  ageMs: number | null;
  folder: string | null;
  installedVersion?: string | null;
  expectedVersion?: string | null;
  updateAvailable?: boolean;
}

export function InGameResourceStatus() {
  const { activeServer } = useServerContext();
  const serverDataPath = activeServer?.serverDataPath;
  const cfgPath = activeServer?.cfgPath;
  const { can, canSee } = useAccess();
  const puedeInstalar = can("server.ingame") && canSee("resources");

  const [state, setState] = useState<InGameResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [updating, setUpdating] = useState(false);

  const fetchState = useCallback(() => {
    const params = new URLSearchParams();
    if (serverDataPath) params.set("serverDataPath", serverDataPath);
    if (cfgPath) params.set("cfgPath", cfgPath);
    return fetch(`${AGENT_URL}/api/server/ingame-resource?${params.toString()}`)
      .then((res) => res.json())
      .then(
        (data: { success?: boolean; vxcore?: InGameResource }) => {
          setState(data.success ? (data.vxcore as InGameResource) : null);
        },
        () => {
          setState(null);
        }
      )
      .finally(() => {
        setLoading(false);
      });
  }, [serverDataPath, cfgPath]);

  const load = useCallback((refrescando = false) => {
    if (refrescando) setLoading(true);
    return fetchState();
  }, [fetchState]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const update = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/server/update-resource`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverDataPath, cfgPath }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          data.updated ? t("Recurso in-game actualizado") : t("Recurso in-game al día"),
          { description: data.message }
        );
        if (data.vxcore) setState(data.vxcore as InGameResource);
        else await load();
      } else {
        toast.error(t("No se pudo actualizar el recurso"), {
          description: data.error || data.message,
          duration: 8000,
        });
        await load();
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setUpdating(false);
    }
  };

  const install = async () => {
    setInstalling(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/server/install-resource`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverDataPath, cfgPath }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t("Recurso VXCore instalado"), {
          description: t("Reinicia el FXServer para que empiece a reportar."),
          duration: 10000,
        });
        await load();
      } else {
        toast.error(t("No se pudo instalar"), { description: data.error || data.message });
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setInstalling(false);
    }
  };

  if (loading && !state) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 p-4 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />{" "}{t("Comprobando el recurso in-game…")}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-xs text-muted-foreground">
        {t("No se pudo comprobar el recurso in-game: el agente no respondió.")}
      </div>
    );
  }

  const ok = state.reporting;
  const grave = !state.installed || !state.ensured;

  const tono = ok
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    : grave
      ? "border-red-500/20 bg-red-500/10 text-red-400"
      : "border-amber-500/20 bg-amber-500/10 text-amber-400";

  const Icono = ok ? CheckCircle2 : grave ? XCircle : TriangleAlert;

  const titulo = ok
    ? t("Recurso In-Game {folder} reportando desde el juego.", { folder: state.folder })
    : !state.installed
      ? t("El recurso In-Game no está instalado en este servidor.")
      : !state.ensured
        ? t("El recurso {folder} está en disco, pero el server.cfg no lo arranca.", { folder: state.folder })
        : state.lastHeartbeat
          ? t("El recurso está puesto, pero lleva rato sin reportar.")
          : t("El recurso está puesto, pero todavía no ha reportado.");

  const detalle = ok
    ? null
    : !state.installed
      ? t("Sin él no se ve quién está conectado y las sanciones no se aplican al entrar.")
      : !state.ensured
        ? t("Añade \"ensure {folder}\" a tu server.cfg y reinicia el FXServer.", { folder: state.folder })
        : t("Reinicia el FXServer: el motor sigue ejecutando los ficheros que cargó al arrancar.");

  return (
    <div className={`space-y-3 rounded-xl border p-4 text-xs ${tono}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icono className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{titulo}</p>
            {detalle && <p className="text-muted-foreground">{detalle}</p>}
          </div>
        </div>
        <Badge
          className={
            ok
              ? "shrink-0 bg-emerald-500 text-white"
              : grave
                ? "shrink-0 bg-red-500 text-white"
                : "shrink-0 bg-amber-500 text-white"
          }
        >
          {ok ? t("Activo") : grave ? t("Ausente") : t("Sin reportar")}
        </Badge>
      </div>

      {state.installed && (state.installedVersion || state.expectedVersion) && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="text-muted-foreground">
            {t("Versión instalada:")}{" "}
            <span className="font-mono text-foreground/80">
              {state.installedVersion ?? t("sin marcar")}
            </span>
          </span>
          {state.expectedVersion && (state.updateAvailable || !state.installedVersion) ? (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
              {t("Disponible: v{expectedVersion}", { expectedVersion: state.expectedVersion })}
            </Badge>
          ) : state.installedVersion && state.expectedVersion && !state.updateAvailable ? (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              {t("Al día (v{installedVersion})", { installedVersion: state.installedVersion })}
            </Badge>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void load(true)} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 size-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 size-3.5" />
          )}
          {t("Volver a comprobar")}
        </Button>
        {state.installed &&
          state.expectedVersion &&
          (state.updateAvailable || !state.installedVersion) &&
          puedeInstalar && (
            <Button size="sm" onClick={() => void update()} disabled={updating}>
              {updating ? (
                <Loader2 className="mr-2 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-3.5" />
              )}
              {t("Actualizar a v{expectedVersion}", { expectedVersion: state.expectedVersion })}
            </Button>
          )}
        {!state.installed && puedeInstalar && (
          <Button size="sm" onClick={() => void install()} disabled={installing || !activeServer}>
            {installing ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <Download className="mr-2 size-3.5" />
            )}
            {t("Instalar el recurso")}
          </Button>
        )}
      </div>
    </div>
  );
}
