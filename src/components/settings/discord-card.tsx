"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  MessageSquare,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Link2,
  Unlink,
  Copy,
  RefreshCw,
  ShieldCheck,
  Radio,
  Activity,
  KeyRound,
  Eye,
  ExternalLink,
} from "lucide-react";
import { AGENT_URL } from "@/lib/agent";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

import type { Section } from "@/lib/access";
import { RoleAccessDialog } from "@/components/settings/role-access-dialog";
import { useAuth } from "@/context/auth-context";
import { DiscordSetupWizard } from "@/components/settings/discord-setup-wizard";
import { t, msg } from "@/i18n";

type StaffLevel = "owner" | "admin" | "moderator";

interface GuildRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

interface PublicDiscordConfig {
  configured: boolean;
  clientId: string;
  guildId: string;
  roles: Record<StaffLevel, string[]>;
  roleSections: Record<string, Section[]>;
  owner: { id: string; username: string; globalName?: string; avatar?: string } | null;
  requireLogin: boolean;
  publicUrl: string;
  downloadUrl: string;
  statusChannelId: string;
  presenceEnabled: boolean;
  whitelistEnabled: boolean;
  whitelistRoles: string[];
  whitelistMessage: string;
  whitelistGuildId: string;
  whitelistStrict: boolean;
  whitelistReady: boolean;
  hasStatusMessage: boolean;
  hasClientSecret: boolean;
  hasBotToken: boolean;
  redirectUri: string;
  remoteRedirectUri: string | null;
  publicBaseUrl: string;
  lockedFields: string[];
  botInviteUrl: string | null;
}

interface WlGuild {
  name: string;
  icon?: string;
  roles: GuildRole[];
}

interface WlGuildResponse {
  guild: WlGuild | null;
  botInGuild: boolean;
  usingFallback: boolean;
  message?: string;
}

const LEVELS: { value: StaffLevel; label: string; hint: string }[] = [
  { value: "owner", label: msg("Dueño"), hint: msg("Control total, incluida esta configuración.") },
  { value: "admin", label: msg("Admin"), hint: msg("Arrancar, parar y editar el servidor.") },
  { value: "moderator", label: msg("Mod"), hint: msg("Ver el estado y moderar jugadores.") },
];

function roleColor(color: number): string | undefined {
  return color ? `#${color.toString(16).padStart(6, "0")}` : undefined;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function EnvBadge() {
  return (
    <Badge variant="outline" className="ml-1 align-middle text-[10px]">
      .env
    </Badge>
  );
}

export function DiscordCard() {
  const { login, user, level, refresh: refreshAuth } = useAuth();

  const [config, setConfig] = useState<PublicDiscordConfig | null>(null);
  const [guild, setGuild] = useState<{ name: string; icon?: string; roles: GuildRole[] } | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [guildError, setGuildError] = useState<string | null>(null);

  const [wlGuild, setWlGuild] = useState<WlGuild | null>(null);
  const [wlUsingFallback, setWlUsingFallback] = useState(false);
  const [wlError, setWlError] = useState<string | null>(null);
  const [wlChecking, setWlChecking] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [botToken, setBotToken] = useState("");
  const [guildId, setGuildId] = useState("");
  const [whitelistGuildId, setWhitelistGuildId] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [statusChannelId, setStatusChannelId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [credentialsRejected, setCredentialsRejected] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const isLocked = (field: string) => Boolean(config?.lockedFields?.includes(field));

  const checkCredentials = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/discord/credentials/check`);
      const data = await res.json();
      setCredentialsRejected(Boolean(data?.rejected));
    } catch {
      setCredentialsRejected(false);
    }
  }, []);

  const loadGuild = useCallback(async () => {
    setChecking(true);
    setGuildError(null);
    try {
      const res = await fetch(`${AGENT_URL}/api/discord/guild`);
      const data = await res.json();
      if (data.success) {
        setGuild(data.guild);
      } else {
        setGuild(null);
        setGuildError(data.error || t("No se pudo leer el gremio."));
      }
    } catch {
      setGuild(null);
      setGuildError(t("El agente VXCore no responde."));
    } finally {
      setChecking(false);
    }
  }, []);

  const loadWhitelistGuild = useCallback(async () => {
    setWlChecking(true);
    setWlError(null);
    try {
      const res = await fetch(`${AGENT_URL}/api/discord/whitelist/guild`);
      const data: (WlGuildResponse & { success: boolean; error?: string }) = await res.json();
      if (data.success) {
        setWlGuild(data.guild);
        setWlUsingFallback(data.usingFallback);
        if (!data.botInGuild) setWlError(data.message || t("El bot no está en ese servidor."));
      } else {
        setWlGuild(null);
        setWlError(data.error || t("No se pudo leer el servidor de la whitelist."));
      }
    } catch {
      setWlGuild(null);
      setWlError(t("El agente VXCore no responde."));
    } finally {
      setWlChecking(false);
    }
  }, []);

  const appliedConfig = useRef<PublicDiscordConfig | null>(null);

  const applyConfig = useCallback(
    (next: PublicDiscordConfig) => {
      const prev = appliedConfig.current;
      appliedConfig.current = next;
      setConfig(next);
      setClientId(next.clientId);
      setGuildId(next.guildId);
      setWhitelistGuildId(next.whitelistGuildId || "");
      setPublicUrl(next.publicUrl);
      setDownloadUrl(next.downloadUrl);
      setStatusChannelId(next.statusChannelId);
      setClientSecret("");
      setBotToken("");
      setCredentialsRejected(false);

      const botChanged = prev?.hasBotToken !== next.hasBotToken;
      if ((botChanged || prev?.guildId !== next.guildId) && next.hasBotToken && next.guildId) {
        void loadGuild();
      }
      if (
        (botChanged || prev?.whitelistGuildId !== next.whitelistGuildId || prev?.guildId !== next.guildId) &&
        next.hasBotToken &&
        (next.whitelistGuildId || next.guildId)
      ) {
        void loadWhitelistGuild();
      }
      if (prev?.configured !== next.configured && next.configured) {
        void checkCredentials();
      }
    },
    [loadGuild, loadWhitelistGuild, checkCredentials]
  );

  const loadConfig = useCallback(
    () =>
      fetch(`${AGENT_URL}/api/discord/config`)
        .then((res) => res.json())
        .then((data: { success?: boolean; config: PublicDiscordConfig }) => {
          if (data.success) applyConfig(data.config);
        })
        .catch(() => {
          toast.error(t("No se pudo leer la configuración de Discord del agente."));
        })
        .finally(() => {
          setLoading(false);
        }),
    [applyConfig]
  );

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const save = async (patch: Record<string, unknown>, quiet = false) => {
    setSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/discord/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(t("No se pudo guardar"), { description: data.error, duration: 12000 });
        return false;
      }

      applyConfig(data.config);
      if (!quiet) toast.success(t("Configuración de Discord guardada."));
      return true;
    } catch {
      toast.error(t("El agente VXCore no responde."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveCredentials = async () => {
    const ok = await save({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      botToken: botToken.trim(),
      guildId: guildId.trim(),
      whitelistGuildId: whitelistGuildId.trim(),
      publicUrl,
      downloadUrl,
      statusChannelId: statusChannelId.trim(),
    });
    if (ok) {
      loadGuild();
      loadWhitelistGuild();
    }
  };

  const publishNow = async () => {
    setPublishing(true);
    try {
      await save({ statusChannelId }, true);

      const res = await fetch(`${AGENT_URL}/api/discord/status/publish`, { method: "POST" });
      const data = await res.json();

      if (data.success) {
        const s = data.snapshot;
        toast.success(t("Estado publicado en Discord"), {
          description: `${s.name}: ${s.online ? t("en línea, {jugadores}/{maximo}", { jugadores: s.players, maximo: s.maxPlayers }) : t("desconectado")}`,
        });
        loadConfig();
      } else {
        toast.error(t("No se pudo publicar"), { description: data.error, duration: 9000 });
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setPublishing(false);
    }
  };

  const setRoleLevel = (roleId: string, next: StaffLevel | null) => {
    if (!config) return;

    const roles: Record<StaffLevel, string[]> = {
      owner: config.roles.owner.filter((id) => id !== roleId),
      admin: config.roles.admin.filter((id) => id !== roleId),
      moderator: config.roles.moderator.filter((id) => id !== roleId),
    };
    if (next) roles[next] = [...roles[next], roleId];

    save({ roles }, true);
  };

  const toggleWhitelistRole = (roleId: string) => {
    if (!config) return;
    const current = config.whitelistRoles || [];
    const next = current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId];
    save({ whitelistRoles: next }, true);
  };

  const toggleWhitelist = async (checked: boolean) => {
    const ok = await save({ whitelistEnabled: checked }, true);
    if (ok && checked && config && !config.whitelistReady) {
      toast.warning(t("Whitelist activa pero sin terminar de configurar"), {
        description:
          t("Hasta que el bot esté en el servidor de la whitelist y elijas al menos un rol, nadie podrá entrar. Completa la sección de abajo."),
        duration: 12000,
      });
    }
  };

  const saveRoleSections = (roleId: string, sections: Section[]) => {
    if (!config) return;

    const roleSections = { ...(config.roleSections || {}) };
    if (sections.length > 0) roleSections[roleId] = sections;
    else delete roleSections[roleId];

    save({ roleSections }, true);
    setEditingRoleId(null);
  };

  const sectionsOf = (roleId: string): Section[] => config?.roleSections?.[roleId] ?? [];

  const levelOf = (roleId: string): StaffLevel | null => {
    if (!config) return null;
    for (const { value } of LEVELS) {
      if (config.roles[value]?.includes(roleId)) return value;
    }
    return null;
  };

  const unlink = async () => {
    if (!confirm(t("Se borrarán las credenciales, la cuenta vinculada y todas las sesiones del staff. ¿Continuar?"))) {
      return;
    }
    try {
      const res = await fetch(`${AGENT_URL}/api/discord/unlink`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        applyConfig(data.config);
        setGuild(null);
        toast.success(t("Discord desvinculado."));
        refreshAuth();
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    }
  };

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t("{what} copiado.", { what })),
      () => toast.error(t("No se pudo copiar."))
    );
  };

  const localOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const publicBase = (config?.publicBaseUrl ?? "").replace(/\/+$/, "");
  const shareable = Boolean(publicBase) && !isLoopbackUrl(publicBase);
  const accessLink = `${shareable ? publicBase : localOrigin}/acceso`;

  if (loading) {
    return (
      <Card className="border-border/50 bg-background/50 backdrop-blur">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("Cargando la configuración de Discord...")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MessageSquare className="size-5 text-indigo-400" />
          Discord
          {config?.owner ? (
            <Badge variant="secondary" className="ml-1 gap-1">
              <CheckCircle2 className="size-3" />{" "}{t("Vinculado")}
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-1">
              {t("Sin vincular")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t("Conecta tu servidor de Discord para que VXCore sepa quién es staff a partir de los roles reales de tu comunidad, y reparte el acceso al panel con un enlace.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {config && (showGuide || !guild) && (
          <DiscordSetupWizard
            config={config}
            guildName={guild?.name}
            guildError={guildError}
            checking={checking}
            onVerify={loadGuild}
          />
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{t("Credenciales de la aplicación")}</h4>
            <Button variant="ghost" size="sm" onClick={() => setShowGuide((v) => !v)}>
              {showGuide ? t("Ocultar guía") : t("Ver guía paso a paso")}
            </Button>
          </div>

          {credentialsRejected && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium">{t("Discord ya no acepta estas credenciales")}</p>
                <p className="text-muted-foreground">
                  {t("Nadie podrá iniciar sesión en el panel hasta que se arreglen. Vuelve a copiar el Client Secret desde el portal de Discord (Applications › OAuth2) y guárdalo aquí; si ya no se puede ver, genera uno nuevo con «Reset Secret».")}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dc-client-id">
                {t("Client ID")}{" "}{isLocked("clientId") && <EnvBadge />}
              </Label>
              <Input
                id="dc-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={isLocked("clientId")}
                placeholder="1234567890123456789"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dc-client-secret">
                {t("Client Secret")}{" "}
                {isLocked("clientSecret") ? (
                  <EnvBadge />
                ) : (
                  config?.hasClientSecret && <span className="text-muted-foreground">{t("(guardado)")}</span>
                )}
              </Label>
              <Input
                id="dc-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                disabled={isLocked("clientSecret")}
                placeholder={config?.hasClientSecret ? t("•••••••• (déjalo vacío para no cambiarlo)") : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dc-guild">
                {t("ID del servidor de Discord")}{" "}{isLocked("guildId") && <EnvBadge />}
              </Label>
              <Input
                id="dc-guild"
                value={guildId}
                onChange={(e) => setGuildId(e.target.value)}
                disabled={isLocked("guildId")}
                placeholder={t("Clic derecho en tu servidor → Copiar ID")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dc-bot">
                {t("Token del bot")}{" "}
                {isLocked("botToken") ? (
                  <EnvBadge />
                ) : (
                  config?.hasBotToken && <span className="text-muted-foreground">{t("(guardado)")}</span>
                )}
              </Label>
              <Input
                id="dc-bot"
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                disabled={isLocked("botToken")}
                placeholder={config?.hasBotToken ? t("•••••••• (déjalo vacío para no cambiarlo)") : ""}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("El bot tiene que estar dentro de tu servidor: es lo que permite leer los nombres de los roles y comprobar quién los tiene.")}
          </p>

          <div className="space-y-1.5">
            <Label>{t("URI de redirección — pégala en OAuth2 → Redirects")}</Label>
            <div className="flex gap-2">
              <Input readOnly value={config?.redirectUri ?? ""} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(config?.redirectUri ?? "", "Redirect URI")}
                aria-label={t("Copiar URI de redirección")}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          {config?.remoteRedirectUri && (
            <div className="space-y-1.5">
              <Label>
                {t("Segunda URI de redirección — añádela también, es la del acceso remoto")}
              </Label>
              <div className="flex gap-2">
                <Input readOnly value={config.remoteRedirectUri} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(config.remoteRedirectUri ?? "", t("URI de redirección remota"))}
                  aria-label={t("Copiar la segunda URI de redirección")}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Sin esta, quien abra el panel desde fuera no podrá iniciar sesión: Discord lo devolvería a")}{" "}<code className="font-mono">localhost</code>{t(", que es su propio equipo.")}
              </p>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{t("Quién es staff")}</h4>
            <Button variant="ghost" size="sm" onClick={loadGuild} disabled={checking}>
              {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {t("Releer roles")}
            </Button>
          </div>

          {guildError && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <span>{guildError}</span>
            </div>
          )}

          {guild && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {guild.icon && (
                  <Image src={guild.icon} alt="" width={20} height={20} unoptimized className="size-5 rounded" />
                )}
                <span className="font-medium text-foreground">{guild.name}</span>
                <span>{t("· {length} roles", { length: guild.roles.length })}</span>
              </div>

              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-2">
                {guild.roles.map((role) => {
                  const current = levelOf(role.id);
                  return (
                    <div
                      key={role.id}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: roleColor(role.color) ?? "var(--muted-foreground)" }}
                        />
                        <span className="truncate">{role.name}</span>
                        {role.managed && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {t("bot")}
                          </Badge>
                        )}
                      </span>

                      <div className="flex shrink-0 items-center gap-1">
                        {LEVELS.map((lvl) => (
                          <Button
                            key={lvl.value}
                            size="sm"
                            variant={current === lvl.value ? "default" : "outline"}
                            className="h-7 px-2 text-xs"
                            title={t(lvl.hint)}
                            onClick={() => setRoleLevel(role.id, current === lvl.value ? null : lvl.value)}
                          >
                            {t(lvl.label)}
                          </Button>
                        ))}

                        {current && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="ml-1 size-7 text-muted-foreground hover:text-primary"
                            title={t("Ver y editar qué pantallas ve este rol")}
                            onClick={() => setEditingRoleId(role.id)}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        )}
                        {sectionsOf(role.id).length > 0 && (
                          <Badge
                            variant="outline"
                            className="ml-0.5 shrink-0 text-[10px]"
                            title={t("Este rol tiene el acceso recortado")}
                          >
                            {sectionsOf(role.id).length}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Pulsa un nivel para asignarlo; púlsalo otra vez para quitarlo. Los roles sin nivel no dan acceso al panel. Con el ojo se ve —y se recorta— qué pantallas le quedan.")}
              </p>
            </>
          )}

          {!guild && !guildError && (
            <p className="text-sm text-muted-foreground">
              {t("Guarda las credenciales para leer los roles de tu servidor.")}
            </p>
          )}
        </div>

        {(() => {
          const role = guild?.roles.find((r) => r.id === editingRoleId);
          const roleLevel = editingRoleId ? levelOf(editingRoleId) : null;
          if (!role || !roleLevel) return null;

          return (
            <RoleAccessDialog
              key={role.id}
              role={role}
              level={roleLevel}
              current={sectionsOf(role.id)}
              onClose={() => setEditingRoleId(null)}
              onSave={(sections) => saveRoleSections(role.id, sections)}
            />
          );
        })()}

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{t("Dar acceso a tu staff")}</h4>

          <div className="space-y-1.5">
            <Label htmlFor="dc-public">
              {t("Dirección de este agente vista desde fuera")}{" "}{isLocked("publicUrl") && <EnvBadge />}
            </Label>
            <Input
              id="dc-public"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              disabled={isLocked("publicUrl")}
              placeholder="https://panel.tucomunidad.com  ó  http://tu-ip-publica:4000"
            />
            <p className="text-xs text-muted-foreground">
              {t("Tu staff no está en esta máquina: para que puedan entrar, este agente tiene que ser alcanzable desde su red. Déjalo vacío si sólo lo vas a usar tú en local.")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dc-download">
              {t("Enlace de descarga de VXCore (opcional)")}{" "}{isLocked("downloadUrl") && <EnvBadge />}
            </Label>
            <Input
              id="dc-download"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              disabled={isLocked("downloadUrl")}
              placeholder="https://.../VXCore-Setup.exe"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("Enlace de acceso para el staff")}</Label>
            <div className="flex gap-2">
              <Input readOnly value={accessLink} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(accessLink, t("Enlace de acceso"))}
                aria-label={t("Copiar enlace de acceso")}
              >
                <Link2 className="size-4" />
              </Button>
            </div>
            {!shareable && (
              <p className="flex items-start gap-1.5 text-xs text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {t("Este enlace sólo abre en este ordenador. Para repartirlo, levanta el acceso remoto o escribe arriba la dirección pública del panel.")}
                </span>
              </p>
            )}
          </div>

        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <KeyRound className="size-4" />
                {t("Whitelist por rol de Discord")}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t("Sólo entran al servidor de FiveM quienes estén en el Discord de la whitelist y tengan alguno de los roles marcados. Hace falta que el recurso")}{" "}
                <code className="font-mono">vxcore</code>{" "}{t("esté activo.")}
              </p>
            </div>
            <Switch
              checked={config?.whitelistEnabled ?? false}
              disabled={!config?.hasBotToken}
              onCheckedChange={toggleWhitelist}
              aria-label={t("Activar whitelist")}
            />
          </div>

          {config?.whitelistEnabled && !config.whitelistReady && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
              <span>
                {t("La whitelist está")}{" "}<strong>{t("activa pero incompleta")}</strong>:{" "}
                {!config.hasBotToken && "falta el token del bot. "}
                {!(config.whitelistRoles?.length) && t("no hay ningún rol marcado. ")}
                {t("Mientras esté así")}{" "}<strong>{t("nadie puede entrar")}</strong>{" "}{t("al servidor. Completa lo que falta aquí abajo o apaga la whitelist.")}
              </span>
            </div>
          )}

          {config?.whitelistEnabled && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="dc-wl-guild">
                  {t("ID del servidor de la whitelist")}{" "}
                  <span className="font-normal text-muted-foreground">{t("(opcional)")}</span>
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="dc-wl-guild"
                    value={whitelistGuildId}
                    onChange={(e) => setWhitelistGuildId(e.target.value)}
                    onBlur={() => {
                      if (whitelistGuildId !== (config.whitelistGuildId || "")) {
                        save({ whitelistGuildId }, true);
                      }
                    }}
                    placeholder={
                      config.guildId
                        ? t("Vacío = el servidor de staff ({guildId})", { guildId: config.guildId })
                        : t("Clic derecho en el servidor → Copiar ID")
                    }
                    className="font-mono text-xs"
                  />
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => save({ whitelistGuildId }, true).then(loadWhitelistGuild)}
                      disabled={wlChecking}
                    >
                      {wlChecking ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      {t("Comprobar")}
                    </Button>
                    {config.botInviteUrl && (
                      <Button
                        variant="outline"
                        render={<a href={config.botInviteUrl} target="_blank" rel="noreferrer" />}
                      >
                        <ExternalLink className="size-4" />
                        {t("Invitar bot")}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("El bot debe estar invitado a este servidor: es el único que puede leer quién tiene el rol. Vale el mismo enlace de invitación que para el de staff.")}
                  {wlUsingFallback && t(" Ahora se está usando el servidor de staff.")}
                </p>
              </div>

              {wlError ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                  <span>{wlError}</span>
                </div>
              ) : wlGuild ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {wlGuild.icon && (
                      <Image src={wlGuild.icon} alt="" width={20} height={20} unoptimized className="size-5 rounded" />
                    )}
                    <span className="font-medium text-foreground">{wlGuild.name}</span>
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <CheckCircle2 className="size-3" />{" "}{t("bot dentro")}
                    </Badge>
                    <span>{t("· {length} roles", { length: wlGuild.roles.length })}</span>
                  </div>

                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-2">
                    {wlGuild.roles.map((role) => {
                      const allowed = config.whitelistRoles?.includes(role.id);
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => toggleWhitelistRole(role.id)}
                          className={
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
                            (allowed ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-muted/40")
                          }
                        >
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: roleColor(role.color) ?? "var(--muted-foreground)" }}
                          />
                          <span className="flex-1 truncate">{role.name}</span>
                          {allowed && <CheckCircle2 className="size-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("Pulsa «Comprobar» para leer los roles del servidor de la whitelist.")}
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="dc-wl-msg">{t("Mensaje al rechazar")}</Label>
                <Input
                  id="dc-wl-msg"
                  defaultValue={config.whitelistMessage}
                  onBlur={(e) => save({ whitelistMessage: e.target.value }, true)}
                  placeholder={t("Pide la whitelist en nuestro Discord: discord.gg/...")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("Es lo que verá quien no tenga acceso. Pon aquí el enlace para pedirla.")}
                </p>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-muted/20 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="dc-wl-strict" className="flex items-center gap-1.5">
                    <ShieldCheck className="size-4" />
                    {t("Bloquear si no se puede comprobar")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {config.whitelistStrict
                      ? t("Si Discord o el agente no responden, la entrada se cierra. Máxima seguridad: si el agente se cae, el servidor queda cerrado hasta que vuelva.")
                      : t("Si Discord o el agente no responden, se deja entrar. Un servidor que echa a todo el mundo porque el bot expiró es peor que uno que cuela a alguien durante una caída.")}
                  </p>
                </div>
                <Switch
                  id="dc-wl-strict"
                  checked={config.whitelistStrict}
                  onCheckedChange={(checked) => save({ whitelistStrict: checked }, true)}
                />
              </div>
            </>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{t("Estado del servidor en Discord")}</h4>

          <div className="space-y-1.5">
            <Label htmlFor="dc-status-channel">{t("Canal donde publicar el estado")}</Label>
            <div className="flex gap-2">
              <Input
                id="dc-status-channel"
                value={statusChannelId}
                onChange={(e) => setStatusChannelId(e.target.value)}
                placeholder={t("Clic derecho en el canal → Copiar ID")}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                onClick={publishNow}
                disabled={publishing || !statusChannelId.trim() || !config?.hasBotToken}
              >
                {publishing ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" />}
                {t("Publicar ahora")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Vertex mantiene")}{" "}<strong>{t("un solo mensaje")}</strong>{" "}{t("y lo edita cada minuto con el estado, los jugadores conectados y el tiempo en marcha. No inunda el canal.")}
              {config?.hasStatusMessage && t(" Ya hay un mensaje publicado.")}
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="dc-presence" className="flex items-center gap-1.5">
                <Activity className="size-4" />
                {t("Mostrarlo también en la presencia del bot")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("Vertex aparecerá como «Viendo 12/64 jugadores» en la lista de miembros. Necesita mantener una conexión abierta con Discord.")}
              </p>
            </div>
            <Switch
              id="dc-presence"
              checked={config?.presenceEnabled ?? false}
              disabled={!config?.hasBotToken}
              onCheckedChange={(checked) => save({ presenceEnabled: checked }, true)}
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="dc-require" className="flex items-center gap-1.5">
                <ShieldCheck className="size-4" />
                {t("Exigir inicio de sesión")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("Nadie usa el panel sin identificarse con Discord y tener un rol de staff. Necesita que hayas vinculado tu cuenta primero.")}
              </p>
            </div>
            <Switch
              id="dc-require"
              checked={config?.requireLogin ?? false}
              disabled={!config?.owner}
              onCheckedChange={(checked) => save({ requireLogin: checked }, true)}
            />
          </div>
        </div>

        {config?.owner ? (
          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-3">
            {config.owner.avatar ? (
              <Image src={config.owner.avatar} alt="" width={36} height={36} unoptimized className="size-9 rounded-full" />
            ) : (
              <div className="size-9 rounded-full bg-primary/20" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {config.owner.globalName || config.owner.username}
              </p>
              <p className="text-xs text-muted-foreground">{t("Dueño del panel")}</p>
            </div>
            {user && <Badge variant="secondary">{t("Tu sesión: {level}", { level })}</Badge>}
          </div>
        ) : (
          config?.configured && (
            <Button variant="outline" className="w-full" onClick={() => login()}>
              <Link2 className="size-4" />
              {t("Vincular mi cuenta de Discord")}
            </Button>
          )
        )}
      </CardContent>

      <CardFooter className="flex justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={unlink} disabled={!config?.clientId}>
          <Unlink className="size-4" />
          {t("Desvincular")}
        </Button>
        <Button onClick={saveCredentials} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("Guardar")}
        </Button>
      </CardFooter>
    </Card>
  );
}
