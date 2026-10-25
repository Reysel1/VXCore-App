"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Play, Square, AlertTriangle, Camera, Gauge } from "lucide-react";

import { AGENT_URL } from "@/lib/agent";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { t, msg } from "@/i18n";

const RATES = [
  { ms: 1000, label: "1/s" },
  { ms: 2000, label: msg("1 cada 2s") },
  { ms: 5000, label: msg("1 cada 5s") },
] as const;

interface Props {
  player: { source: number; name: string } | null;
  onClose: () => void;
}

export function PlayerScreenDialog({ player, onClose }: Props) {
  const [frame, setFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState<number>(2000);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [count, setCount] = useState(0);

  const liveRef = useRef(false);
  const rateRef = useRef(rate);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  const grab = useCallback(async (source: number): Promise<boolean> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();

    try {
      const res = await fetch(`${AGENT_URL}/api/server/screen/${source}?quality=0.6`, {
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setError(data.error || t("No se pudo obtener la pantalla."));
        return false;
      }

      setFrame(data.image ?? null);
      setLastMs(Math.round(performance.now() - started));
      setCount((n) => n + 1);
      setError(null);
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
      setError(t("El agente VXCore no responde."));
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    liveRef.current = false;
    setLive(false);
    abortRef.current?.abort();
  }, []);

  const start = useCallback(
    async (source: number) => {
      if (liveRef.current) return;
      liveRef.current = true;
      setLive(true);
      setError(null);

      while (liveRef.current) {
        const ok = await grab(source);
        if (!ok) {
          liveRef.current = false;
          setLive(false);
          break;
        }
        await new Promise((r) => setTimeout(r, rateRef.current));
      }
    },
    [grab]
  );

  const once = useCallback(
    async (source: number) => {
      setBusy(true);
      setError(null);
      await grab(source);
      setBusy(false);
    },
    [grab]
  );

  useEffect(() => {
    return () => {
      liveRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  if (!player) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          stop();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Camera className="size-4 shrink-0" />
            <span className="truncate">{t("Pantalla de {name}", { name: player.name })}</span>
            {live && (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 border-red-500/30 bg-red-500/10 text-[10px] text-red-400"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                {t("EN DIRECTO")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {t("Se ve la pantalla del juego, no el escritorio del jugador. La cadencia depende de su máquina y su conexión.")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-black">
            {frame ? (
              <Image
                src={frame}
                alt={t("Pantalla de {name}", { name: player.name })}
                width={1280}
                height={720}
                unoptimized
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                {busy || live ? (
                  <>
                    <Loader2 className="size-6 animate-spin" />
                    {t("Pidiéndole la pantalla al jugador…")}
                  </>
                ) : (
                  <>
                    <Camera className="size-8 opacity-30" />
                    {t("Todavía no hay ninguna captura.")}
                  </>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Gauge className="size-3.5" />
              {lastMs !== null ? t("{lastMs} ms por fotograma", { lastMs }) : t("sin medir")}
            </span>
            <span>·</span>
            <span>{t("{count} capturas", { count })}</span>
            <span>·</span>
            <div className="flex items-center gap-1">
              {RATES.map((r) => (
                <Button
                  key={r.ms}
                  size="sm"
                  variant={rate === r.ms ? "default" : "outline"}
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setRate(r.ms)}
                >
                  {t(r.label)}
                </Button>
              ))}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            {t("Cerrar")}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={live || busy}
              onClick={() => void once(player.source)}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {t("Una captura")}
            </Button>
            {live ? (
              <Button onClick={stop}>
                <Square className="size-4" />{" "}{t("Parar")}
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void start(player.source)}>
                <Play className="size-4" />{" "}{t("Ver en directo")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
