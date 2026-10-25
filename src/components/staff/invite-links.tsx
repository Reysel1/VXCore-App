"use client";

import React from "react";
import Image from "next/image";
import { Copy, Link2, Loader2, ShieldCheck, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { AGENT_URL } from "@/lib/agent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { t, msg, intlLocale } from "@/i18n";

type Level = "admin" | "moderator";

interface Invite {
  id: string;
  level: Level;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number;
  uses: number;
  revoked: boolean;
  active: boolean;
}

interface Member {
  userId: string;
  username: string;
  avatar?: string;
  level: Level;
  inviteId: string;
  joinedAt: string;
}

const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: "admin", label: msg("Administración"), hint: msg("Todo menos repartir accesos y la licencia.") },
  { value: "moderator", label: msg("Moderación"), hint: msg("Ver el estado y moderar jugadores.") },
];

const LEVEL_LABEL: Record<Level, string> = {
  admin: msg("Administración"),
  moderator: msg("Moderación"),
};

export function InviteLinks() {
  const INVITE_SECTIONS: { key: string; label: string }[] = [
    { key: "dashboard", label: t("Dashboard") },
    { key: "servers", label: t("Servidores") },
    { key: "players", label: t("Jugadores") },
    { key: "sanctions", label: t("Sanciones") },
    { key: "resources", label: t("Recursos") },
    { key: "marketplace", label: t("Marketplace") },
    { key: "automations", label: t("Automatizaciones") },
    { key: "console", label: t("Consola") },
    { key: "database", label: t("Base de datos") },
    { key: "editor", label: t("Editor") },
    { key: "logs", label: t("Logs") },
    { key: "settings", label: t("Ajustes") },
    { key: "changelog", label: t("Changelog") },
    { key: "staff", label: t("Colaboradores") },
    { key: "board", label: t("Tablero") },
  ];

  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [denied, setDenied] = React.useState(false);

  const [level, setLevel] = React.useState<Level>("moderator");
  const [label, setLabel] = React.useState("");
  const [days, setDays] = React.useState("7");
  const [maxUses, setMaxUses] = React.useState("1");
  const [sections, setSections] = React.useState<string[]>([]);
  const [welcome, setWelcome] = React.useState("");

  const toggleSection = (key: string) =>
    setSections((current) =>
      current.includes(key) ? current.filter((s) => s !== key) : [...current, key]
    );

  const [fresh, setFresh] = React.useState<string | null>(null);

  const load = React.useCallback(
    () =>
      fetch(`${AGENT_URL}/api/invites`)
        .then(async (res) => {
          if (res.status === 403) {
            setDenied(true);
            return;
          }
          const data: { success?: boolean; invites?: Invite[]; members?: Member[] } = await res.json();
          if (data.success) {
            setInvites(data.invites ?? []);
            setMembers(data.members ?? []);
          }
        })
        .catch(() => {})
        .finally(() => {
          setLoading(false);
        }),
    []
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setFresh(null);
    try {
      const res = await fetch(`${AGENT_URL}/api/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          label: label.trim(),
          expiresInDays: Number(days) || 0,
          maxUses: Number(maxUses) || 0,
          sections,
          welcome: welcome.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(t("No se pudo crear la invitación"), { description: data.error });
        return;
      }

      setFresh(data.url);
      setLabel("");
      void navigator.clipboard.writeText(data.url).catch(() => {});
      toast.success(t("Invitación creada y copiada al portapapeles."));
      await load();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setCreating(false);
    }
  };

  const removeInvite = async (id: string) => {
    const res = await fetch(`${AGENT_URL}/api/invites/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("Invitación borrada. Quien entró por ella pierde el acceso."));
      await load();
    } else toast.error(t("No se pudo borrar."));
  };

  const removeMember = async (userId: string, username: string) => {
    const res = await fetch(`${AGENT_URL}/api/invites/members/${userId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("{username} ya no tiene acceso.", { username }));
      await load();
    } else toast.error(t("No se pudo quitar el acceso."));
  };

  if (denied) return null;

  if (loading) {
    return (
      <Card className="border-border/50 bg-background/50 backdrop-blur">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("Cargando invitaciones...")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Link2 className="size-5 text-primary" />
          {t("Invitar con un enlace")}
        </CardTitle>
        <CardDescription>
          {t("Da acceso al panel a quien quieras, con el permiso que tú elijas, sin tener que crearle un rol en tu Discord.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {LEVELS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLevel(option.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  level === option.value
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/50 bg-background/40 hover:border-border"
                }`}
              >
                <span className="text-sm font-medium">{t(option.label)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t(option.hint)}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem]">
            <div className="space-y-1.5">
              <Label htmlFor="inv-label">{t("Para quién (opcional)")}</Label>
              <Input
                id="inv-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("Dev de UrantixMaps")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-days">{t("Caduca (días)")}</Label>
              <Input
                id="inv-days"
                value={days}
                onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="0 = nunca"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-uses">{t("Usos")}</Label>
              <Input
                id="inv-uses"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder={t("0 = sin límite")}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold">{t("Qué verá en el panel")}</Label>
              <button
                type="button"
                onClick={() => setSections([])}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              >
                {sections.length === 0 ? t("Lo verá todo") : t("Quitar límites")}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {INVITE_SECTIONS.map((item) => {
                const on = sections.includes(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleSection(item.key)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      on
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border/50 bg-background/50 text-muted-foreground hover:border-border"
                    }`}
                  >
                    {t(item.label)}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("Sin marcar nada verá todo lo que su nivel permita. Esto ordena su panel; los permisos de verdad los sigue aplicando el agente en cada petición.")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-welcome">{t("Nota de bienvenida (opcional)")}</Label>
            <Input
              id="inv-welcome"
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              placeholder={t("Échale un ojo al recurso de mapas, gracias!")}
            />
          </div>

          <Button onClick={create} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            {t("Crear enlace")}
          </Button>

          {fresh && (
            <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-medium text-primary">
                {t("Cópialo ahora: por seguridad no se puede volver a ver.")}
              </p>
              <div className="flex gap-2">
                <Input readOnly value={fresh} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    void navigator.clipboard.writeText(fresh);
                    toast.success(t("Copiado"));
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {invites.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">{t("Enlaces creados")}</h4>
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-3"
              >
                <Badge variant="outline" className="shrink-0">
                  {t(LEVEL_LABEL[invite.level])}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {invite.label || <span className="text-muted-foreground">{t("Sin descripción")}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {invite.uses}
                  {invite.maxUses > 0 ? `/${invite.maxUses}` : ""}{" "}{t("uso(s)")}
                  {invite.expiresAt &&
                    t(" · caduca {fecha}", { fecha: new Date(invite.expiresAt).toLocaleDateString(intlLocale()) })}
                </span>
                {!invite.active && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {t("caducado")}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t("Borrar el enlace y echar a quien entró por él")}
                  onClick={() => void removeInvite(invite.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {members.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <ShieldCheck className="size-4 text-emerald-400" />
              {t("Con acceso por invitación")}
            </h4>
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-3"
              >
                {member.avatar ? (
                  <Image src={member.avatar} alt="" width={28} height={28} unoptimized className="size-7 rounded-full" />
                ) : (
                  <div className="size-7 rounded-full bg-primary/20" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {member.username}
                </span>
                <Badge variant="outline" className="shrink-0">
                  {t(LEVEL_LABEL[member.level])}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t("Quitarle el acceso")}
                  onClick={() => void removeMember(member.userId, member.username)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <UserMinus className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
