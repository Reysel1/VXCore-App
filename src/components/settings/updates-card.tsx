"use client";

import { useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCcw,
  Rocket,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useUpdater, updaterActions, isUpdatePending } from "@/lib/updater";
import { formatBytes } from "@/lib/utils";
import { t, msg } from "@/i18n";

const size = (bytes: number | undefined) => formatBytes(bytes, "");

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  idle: { text: msg("Sin comprobar"), className: "bg-muted/60 text-muted-foreground border-border/50" },
  checking: { text: msg("Buscando…"), className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  available: { text: msg("Actualización disponible"), className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  "not-available": { text: msg("Al día"), className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  downloading: { text: msg("Descargando…"), className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  downloaded: { text: msg("Lista para instalar"), className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  error: { text: msg("Error"), className: "bg-red-500/10 text-red-400 border-red-500/20" },
  dev: { text: msg("Modo desarrollo"), className: "bg-muted/60 text-muted-foreground border-border/50" },
};

export function UpdatesCard() {
  const snapshot = useUpdater();
  const state = snapshot.state;
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [feedInput, setFeedInput] = useState<string | null>(null);
  const [savingFeed, setSavingFeed] = useState(false);

  if (!mounted) {
    return (
      <Card className="border-border/50 bg-background/50 backdrop-blur">
        <CardHeader className="flex flex-row items-center gap-3">
          <Loader2 className="size-5 text-emerald-400 animate-spin" />
          <div className="space-y-1">
            <div className="h-4 w-40 rounded bg-muted/50 animate-pulse" />
            <div className="h-3 w-64 rounded bg-muted/30 animate-pulse" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  const isDesktop = typeof window !== "undefined" && !!window.fiveosDesktop?.updater;
  const badge = STATUS_LABEL[state?.status ?? "idle"];

  const handleCheck = async () => {
    await updaterActions.check();
  };

  const handleDownload = async () => {
    toast(t("Descargando actualización…"), { description: t("Puedes seguir usando la app mientras baja.") });
    await updaterActions.download();
  };

  const handleInstall = () => {
    toast(t("Instalando… la app se cerrará y volverá a abrirse sola."));
    setTimeout(() => updaterActions.install(), 600);
  };

  const handleSaveFeed = async () => {
    if (!(feedInput ?? "").trim()) return;
    setSavingFeed(true);
    try {
      await updaterActions.setFeedUrl((feedInput ?? "").trim());
      toast.success(t("Feed de actualizaciones guardado"));
    } catch {
      toast.error(t("No se pudo guardar el feed"));
    } finally {
      setSavingFeed(false);
    }
  };

  const progress = state?.progress;
  const availableVersion = state?.status === "available" || state?.status === "downloading" ? state?.info?.version : null;

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Rocket className="size-5 text-emerald-400" />
          {t("Actualizaciones del Sistema")}
          <Badge variant="outline" className={badge.className}>{t(badge.text)}</Badge>
        </CardTitle>
        <CardDescription>
          {t("VXCore se actualiza solo: comprueba el feed, descarga la versión nueva e instala en segundo plano, sin que tengas que descargar e instalar la app de nuevo.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold">{t("Versión instalada")}</p>
              <p className="text-xs text-muted-foreground">
                {t("Instala en segundo plano sin pedir permisos de administrador.")}
              </p>
            </div>
          </div>
          <div className="font-mono text-lg font-bold text-primary">
            v{state?.version ?? "—"}
          </div>
        </div>

        {isDesktop && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Wifi className="size-3.5" />{" "}{t("Servidor de actualizaciones (feed)")}
            </label>
            <div className="flex gap-2">
              <Input
                value={feedInput ?? state?.feedUrl ?? ""}
                onChange={(e) => setFeedInput(e.target.value)}
                placeholder="http://127.0.0.1:4000/updates"
                className="bg-[#0d0d0d] font-mono text-xs"
              />
              <Button
                variant="outline"
                onClick={handleSaveFeed}
                disabled={savingFeed || !(feedInput ?? "").trim()}
                className="shrink-0"
              >
                {savingFeed ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                {t("Guardar")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("El feed local del agente vale para la misma máquina. Para desplegar en otras, apunta a la URL donde publiques el instalador (por ejemplo, GitHub Releases).")}
            </p>
          </div>
        )}

        {isDesktop ? (
          <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
            {state?.status === "checking" && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 text-primary animate-spin" />
                {t("Buscando actualizaciones…")}
              </div>
            )}

            {state?.status === "not-available" && (
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="size-5 text-emerald-500" />
                <span>
                  {t("Estás al día con")}{" "}<strong className="font-mono">v{state.version}</strong>.
                </span>
              </div>
            )}

            {state?.status === "available" && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Download className="size-5 text-amber-400" />
                  <span className="text-sm">
                    {t("Nueva versión")}{" "}<strong className="font-mono">v{availableVersion}</strong>{" "}{t("disponible")}
                    {state.info?.path ? (
                      <span className="block text-xs text-muted-foreground">
                        {size((state.info.files as Array<{ size: number }> | undefined)?.[0]?.size)}
                      </span>
                    ) : null}
                  </span>
                </div>
                <Button onClick={handleDownload} className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30">
                  <Download className="mr-2 size-4" />{" "}{t("Descargar e instalar")}
                </Button>
              </div>
            )}

            {state?.status === "downloading" && progress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-blue-400">
                    <Loader2 className="size-3.5 animate-spin" />{" "}{t("Descargando actualización…")}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {progress.percent.toFixed(1)}% · {size(progress.transferred)}
                    {progress.total ? ` / ${size(progress.total)}` : ""}
                  </span>
                </div>
                <Progress value={progress.percent} className="h-2" />
              </div>
            )}

            {state?.status === "downloaded" && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="size-5 text-emerald-500" />
                  <span className="text-sm">
                    {t("Actualización")}{" "}<strong className="font-mono">v{state.info?.version}</strong>{" "}{t("descargada. Se instalará al cerrar la app, o ahora mismo:")}
                  </span>
                </div>
                <Button onClick={handleInstall} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Rocket className="mr-2 size-4" />{" "}{t("Reiniciar e instalar")}
                </Button>
              </div>
            )}

            {state?.status === "error" && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-sm text-red-400">
                  <AlertCircle className="size-5 shrink-0" />
                  <span className="break-all">{state.error || t("No se pudo comprobar actualizaciones.")}</span>
                </div>
                <Button variant="outline" onClick={handleCheck} className="shrink-0">
                  <RefreshCcw className="mr-2 size-4" />{" "}{t("Reintentar")}
                </Button>
              </div>
            )}

            {state?.status === "dev" && (
              <p className="text-sm text-muted-foreground">
                {t("En modo desarrollo el updater está desactivado. La versión instalada se comprueba al arrancar y desde aquí.")}
              </p>
            )}

            {state?.status === "idle" && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {t("Pulsa «Buscar actualizaciones» para comprobar si hay versión nueva.")}
                </span>
                <Button onClick={handleCheck}>
                  <RefreshCcw className="mr-2 size-4" />{" "}{t("Buscar actualizaciones")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-muted/10 p-4 text-sm text-muted-foreground space-y-2">
            {snapshot.checkingFeed ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 text-primary animate-spin" />{" "}{t("Consultando el feed del agente…")}
              </span>
            ) : snapshot.latestFeedVersion ? (
              <>
                <p className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  {t("Última versión publicada en el feed:")}{" "}<strong className="font-mono">v{snapshot.latestFeedVersion}</strong>
                </p>
                <p>
                  {t("La descarga e instalación se gestionan desde la app de escritorio (Ajustes → Sistema).")}
                </p>
              </>
            ) : (
              <p>{t("El feed del agente aún no tiene versiones publicadas.")}</p>
            )}
          </div>
        )}

        {isDesktop && isUpdatePending(snapshot) && (
          <p className="text-[11px] text-muted-foreground">
            {t("La barra lateral avisará mientras haya una actualización pendiente.")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
