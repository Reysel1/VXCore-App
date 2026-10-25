"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Globe, Loader2, Monitor, Settings2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { AGENT_URL } from "@/lib/agent";
import { useAccess } from "@/lib/access";
import { useAuth } from "@/context/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

type Phase = "off" | "starting" | "connected" | "error";

interface TunnelState {
  phase: Phase;
  hostname: string | null;
  detail: string;
  enabled: boolean;
  canEnable: boolean;
  blocker: string;
  reachable: boolean;
}

const AJUSTES_ACCESO_REMOTO = "/settings?tab=system";

function isLoopback(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

export function WebVersionButton() {
  const { can } = useAccess();
  const { requireLogin } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tunnel, setTunnel] = useState<TunnelState | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [entorno, setEntorno] = useState<{ desktop: boolean; remoto: boolean; origin: string } | null>(null);

  const esDueno = can("remote.access");

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setEntorno({
        desktop: Boolean(window.fiveosDesktop?.isDesktop),
        remoto: !isLoopback(window.location.hostname),
        origin: window.location.origin,
      })
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const cargar = useCallback(async () => {
    if (!esDueno) return;
    setLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/tunnel/status`);
      const data = await res.json().catch(() => null);
      setTunnel(data?.success ? data.tunnel : null);
    } catch {
      setTunnel(null);
    } finally {
      setLoading(false);
    }
  }, [esDueno]);

  const abrir = () => {
    setOpen(true);
    void cargar();
  };

  if (!entorno || (!esDueno && !entorno.desktop)) return null;

  const enlace = tunnel?.phase === "connected" && tunnel.hostname ? `https://${tunnel.hostname}` : null;

  const copiar = async () => {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(t("No se pudo copiar el enlace."));
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={abrir}
        className="gap-1.5 border-sky-500/25 bg-sky-500/10 text-sky-400 hover:bg-sky-500/15 hover:text-sky-300"
        title={t("Abrir y controlar el panel desde un navegador")}
      >
        <Globe className="size-3.5" />
        {t("Versión web")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="size-4 text-sky-400" />
              {t("Versión web")}
            </DialogTitle>
            <DialogDescription>
              {t("Controla VXCore desde un navegador: el mismo panel, con tus servidores, la consola y los jugadores.")}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3 py-1">
            {entorno.remoto && (
              <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                {t("Ya estás en la versión web. Puedes copiar el enlace para abrirla en otro dispositivo.")}
              </p>
            )}

            <section className="space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-3">
              <header className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Smartphone className="size-4 text-sky-400" />
                  {t("Desde cualquier sitio")}
                </span>
                {esDueno && tunnel && <EstadoTunel tunnel={tunnel} />}
              </header>
              <p className="text-xs text-muted-foreground">
                {t("Desde el móvil u otro ordenador, esté donde esté. Se entra con Discord.")}
              </p>

              {!esDueno ? (
                <p className="text-xs text-muted-foreground">
                  {t("El enlace del acceso remoto lo gestiona el dueño del panel.")}
                </p>
              ) : loading && !tunnel ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />{" "}{t("Comprobando el acceso remoto…")}
                </p>
              ) : enlace ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-background px-2.5 py-1.5 font-mono text-xs">
                      {enlace}
                    </code>
                    <Button variant="outline" size="icon-sm" onClick={copiar} title={t("Copiar el enlace")}>
                      {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    </Button>
                  </div>
                  <Button
                    className="w-full"
                    render={<a href={enlace} target="_blank" rel="noreferrer" />}
                  >
                    <ExternalLink className="size-4" />
                    {t("Abrir la versión web")}
                  </Button>
                  {!tunnel?.reachable && (
                    <p className="text-[11px] text-muted-foreground">
                      {t("Si este equipo aún no la abre, prueba desde el móvil: un enlace recién creado puede tardar unos minutos en resolverse aquí.")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-foreground/90">
                    {!tunnel
                      ? t("No se pudo consultar el acceso remoto.")
                      : !tunnel.enabled && tunnel.canEnable
                        ? t("El acceso remoto está apagado. Enciéndelo para tener tu enlace.")
                        : !tunnel.canEnable
                          ? tunnel.blocker
                          : tunnel.detail}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      router.push(AJUSTES_ACCESO_REMOTO);
                    }}
                  >
                    <Settings2 className="size-3.5" />
                    {t("Configurar el acceso remoto")}
                  </Button>
                </div>
              )}
            </section>

            {entorno.desktop && (
              <section className="space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Monitor className="size-4 text-sky-400" />
                  {t("En este equipo")}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("Abre el panel en tu navegador en vez de en la ventana de la app. Funciona sin internet ni acceso remoto")}
                  {requireLogin ? t("; te pedirá iniciar sesión con Discord la primera vez.") : "."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  render={<a href={entorno.origin} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLink className="size-3.5" />
                  {t("Abrir en el navegador")}
                </Button>
              </section>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EstadoTunel({ tunnel }: { tunnel: TunnelState }) {
  const estilos: Record<Phase, { texto: string; clase: string }> = {
    off: { texto: t("Apagado"), clase: "border-border/60 text-muted-foreground" },
    starting: { texto: t("Conectando…"), clase: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
    connected: { texto: t("En línea"), clase: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
    error: { texto: t("Con problemas"), clase: "border-red-500/30 bg-red-500/10 text-red-400" },
  };
  const e = estilos[tunnel.phase] ?? estilos.off;
  return (
    <Badge variant="outline" className={cn("text-[10px]", e.clase)}>
      {e.texto}
    </Badge>
  );
}
