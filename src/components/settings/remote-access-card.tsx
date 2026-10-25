"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Copy, ExternalLink, Globe, KeyRound, Loader2, RefreshCw, ShieldAlert, Trash2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { AGENT_URL } from "@/lib/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { t, msg, intlLocale } from "@/i18n";

type Phase = "off" | "starting" | "connected" | "error";

interface TunnelState {
  phase: Phase;
  hostname: string | null;
  detail: string;
  enabled: boolean;
  canEnable: boolean;
  blocker: string;
  blockerKey: "none" | "config" | "tunnel" | "discord" | "login";
  retryAt: string | null;
  reachable: boolean;
  credentials: "env" | "panel" | null;
}

const BADGE: Record<Phase, { text: string; className: string }> = {
  off: { text: msg("Desactivado"), className: "bg-muted/60 text-muted-foreground border-border/50" },
  starting: { text: msg("Conectando…"), className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  connected: { text: msg("En línea"), className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  error: { text: msg("Con problemas"), className: "bg-red-500/10 text-red-400 border-red-500/20" },
};

interface TunnelEvent {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export function RemoteAccessCard({ onFixDiscord }: { onFixDiscord?: () => void } = {}) {
  const [state, setState] = useState<TunnelState | null>(null);
  const [enablingLogin, setEnablingLogin] = useState(false);
  const [events, setEvents] = useState<TunnelEvent[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [hostname, setHostname] = useState("");
  const [credentialsJson, setCredentialsJson] = useState("");
  const [savingTunnel, setSavingTunnel] = useState(false);
  const [removingTunnel, setRemovingTunnel] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(
    () =>
      fetch(`${AGENT_URL}/api/tunnel/status`)
        .then((res) => res.json().catch(() => null))
        .then((data: { success?: boolean; tunnel: TunnelState; events?: TunnelEvent[] } | null) => {
          if (data?.success) {
            setState(data.tunnel);
            setEvents(data.events ?? []);
            setNow(Date.now());
          }
        })
        .catch(() => {}),
    []
  );

  const pollEveryMs = state?.phase === 'starting' ? 1000 : 5000;

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), pollEveryMs);
    return () => clearInterval(timer);
  }, [load, pollEveryMs]);

  useEffect(() => {
    if (!state?.retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state?.retryAt]);

  const countdown = state?.retryAt
    ? Math.max(0, Math.round((new Date(state.retryAt).getTime() - now) / 1000))
    : null;

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/tunnel/enabled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(data.error || t("No se pudo cambiar el acceso remoto."));
        return;
      }
      toast.success(
        enabled
          ? t("Publicando el panel… tarda unos segundos.")
          : t("Acceso remoto apagado. El enlace deja de responder.")
      );
      await load();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setSaving(false);
    }
  };

  const enableLogin = async () => {
    setEnablingLogin(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/discord/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireLogin: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(t("No se pudo activar el inicio de sesión"), { description: data.error });
        return;
      }
      toast.success(t("Inicio de sesión obligatorio activado. Ya puedes publicar el panel."));
      await load();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setEnablingLogin(false);
    }
  };

  const retryNow = async () => {
    setRetrying(true);
    try {
      await fetch(`${AGENT_URL}/api/tunnel/retry`, { method: "POST" });
      await load();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setRetrying(false);
    }
  };

  const saveTunnel = async () => {
    setSavingTunnel(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/tunnel/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname, credentials: credentialsJson }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(t("No se pudo guardar el túnel"), { description: data.message || data.error });
        return;
      }
      setHostname("");
      setCredentialsJson("");
      toast.success(data.message);
      await load();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setSavingTunnel(false);
    }
  };

  const removeTunnel = async () => {
    setRemovingTunnel(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/tunnel/credentials`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (data.success) toast.success(data.message);
      else toast.error(t("No se pudo quitar el túnel"), { description: data.message || data.error });
      await load();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setRemovingTunnel(false);
    }
  };

  if (!state) {
    return (
      <Card className="border-border/50 bg-background/50 backdrop-blur">
        <CardHeader className="flex flex-row items-center gap-3">
          <Loader2 className="size-5 text-primary animate-spin" />
          <div className="space-y-1">
            <div className="h-4 w-40 rounded bg-muted/50 animate-pulse" />
            <div className="h-3 w-64 rounded bg-muted/30 animate-pulse" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  const url = state.hostname ? `https://${state.hostname}` : null;
  const badge = BADGE[state.phase];

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="text-xl flex items-center gap-2">
              <Globe className="size-5 text-blue-400" />
              {t("Acceso remoto")}
              <Badge variant="outline" className={badge.className}>
                {t(badge.text)}
              </Badge>
            </CardTitle>
            <CardDescription>
              {t("Abre este panel desde cualquier sitio, con su propia dirección. No hace falta abrir puertos en el router.")}
            </CardDescription>
          </div>

          <Switch
            checked={state.enabled}
            disabled={saving || (!state.enabled && !state.canEnable)}
            onCheckedChange={(checked) => void toggle(checked)}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!state.canEnable && !state.enabled && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm flex items-start gap-3">
            <ShieldAlert className="size-5 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="font-semibold">{t("Todavía no se puede activar")}</p>
                <p className="text-amber-300/80">{state.blocker}</p>
              </div>

              {state.blockerKey === "login" && (
                <Button size="sm" disabled={enablingLogin} onClick={() => void enableLogin()}>
                  {enablingLogin ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ShieldAlert className="size-3.5" />
                  )}
                  {t("Activar inicio de sesión obligatorio")}
                </Button>
              )}

              {state.blockerKey === "tunnel" && (
                <div className="space-y-3 pt-1 text-foreground">
                  <p className="text-xs text-amber-300/80">
                    {t("Crea un túnel con cloudflared, enlázalo a tu dominio y pega aquí el contenido del fichero .json que genera.")}
                  </p>
                  <pre className="overflow-x-auto rounded-lg bg-background/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    {"cloudflared tunnel create vxcore\ncloudflared tunnel route dns vxcore panel.example.com"}
                  </pre>
                  <div className="space-y-1.5">
                    <Label htmlFor="tunnel-hostname">{t("Dominio")}</Label>
                    <Input
                      id="tunnel-hostname"
                      placeholder="panel.example.com"
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tunnel-credentials">{t("Credenciales del túnel")}</Label>
                    <Textarea
                      id="tunnel-credentials"
                      className="font-mono text-xs"
                      rows={4}
                      placeholder='{"AccountTag":"…","TunnelSecret":"…","TunnelID":"…"}'
                      value={credentialsJson}
                      onChange={(e) => setCredentialsJson(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={savingTunnel || !hostname.trim() || !credentialsJson.trim()}
                    onClick={() => void saveTunnel()}
                  >
                    {savingTunnel ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
                    {t("Guardar túnel")}
                  </Button>
                </div>
              )}

              {state.blockerKey === "discord" && onFixDiscord && (
                <Button size="sm" variant="outline" onClick={onFixDiscord}>
                  {t("Ir a Discord & Staff")}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <span>
            {t("Con el acceso remoto encendido tendrás que iniciar sesión con Discord")}{" "}
            <strong className="text-foreground">{t("también en este equipo")}</strong>{t(", aunque el interruptor de «exigir inicio de sesión» esté apagado. Publicar el panel retira la única razón por la que se podía entrar sin identificarse: que sólo se llegara desde aquí.")}
          </span>
        </div>

        {state.enabled && url && state.phase === "connected" && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
              <Wifi className="size-4" />
              {t("Tu panel está en:")}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-background/60 px-3 py-2 font-mono text-sm text-emerald-300">
                {url}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(url);
                  toast.success(t("Enlace copiado"));
                }}
              >
                <Copy className="size-4" />
              </Button>
              <Button variant="outline" size="sm" render={<a href={url} target="_blank" rel="noreferrer" />}>
                <ExternalLink className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-emerald-300/70">
              {t("Sólo entra quien tenga permiso en tu Discord. Conocer el enlace no da acceso.")}
            </p>

            {!state.reachable && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300/90">
                <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
                <span>{t(state.detail)}</span>
              </p>
            )}
          </div>
        )}

        {state.enabled && state.phase !== "connected" && (
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-sm flex items-start gap-3">
            {state.phase === "starting" || countdown !== null ? (
              <Loader2 className="size-5 shrink-0 mt-0.5 text-amber-400 animate-spin" />
            ) : (
              <WifiOff className="size-5 shrink-0 mt-0.5 text-red-400" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-muted-foreground">{t(state.detail)}</p>

              {countdown !== null && (
                <p className="text-xs text-amber-300/90">
                  {t("Reintentando en {Math}: {padStart}", { Math: Math.floor(countdown / 60), padStart: String(countdown % 60).padStart(2, "0") })}
                </p>
              )}

              <Button variant="outline" size="sm" disabled={retrying} onClick={() => void retryNow()}>
                {retrying ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                {t("Reintentar ahora")}
              </Button>
            </div>
          </div>
        )}

        {state.enabled && state.phase === "connected" && (
          <p className="text-xs text-muted-foreground">
            {t("Si apagas este equipo, el enlace deja de responder hasta que vuelvas a encenderlo.")}
          </p>
        )}

        {state.credentials === "panel" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={removingTunnel} onClick={() => void removeTunnel()}>
              {removingTunnel ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              {t("Quitar túnel")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("Borra las credenciales guardadas en este equipo para poder usar otro túnel.")}
            </p>
          </div>
        )}

        {state.enabled && (
          <div className="space-y-3 border-t border-border/40 pt-3">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {showDetail ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {t("Ver detalle técnico")}
              {events.some((e) => e.level === "error") && (
                <span className="ml-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
                  {events.filter((e) => e.level === "error").length}{" "}{t("error(es)")}
                </span>
              )}
            </button>

            {showDetail && (
              <>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-black/30 p-2 font-mono text-[11px] leading-relaxed">
                  {events.length === 0 ? (
                    <p className="text-muted-foreground/70">
                      {t("Todavía no hay nada registrado en esta sesión.")}
                    </p>
                  ) : (
                    events
                      .slice()
                      .reverse()
                      .map((event, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="shrink-0 select-none text-muted-foreground/40 tabular-nums">
                            {new Date(event.at).toLocaleTimeString(intlLocale(), { hour12: false })}
                          </span>
                          <span
                            className={
                              event.level === "error"
                                ? "text-red-400"
                                : event.level === "warn"
                                  ? "text-amber-300"
                                  : "text-muted-foreground"
                            }
                          >
                            {t(event.message)}
                          </span>
                        </div>
                      ))
                  )}
                </div>

              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
