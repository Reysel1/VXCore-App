"use client";

import React from "react";
import {
  AlertTriangle,
  Ban,
  Fingerprint,
  Gavel,
  Loader2,
  LogOut,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { AGENT_URL } from "@/lib/agent";
import { CopyButton } from "@/components/common/copy-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { SanctionDialog } from "@/components/players/sanction-dialog";
import { SanctionTargetPicker } from "@/components/sanctions/sanction-target-picker";
import { useDiscordProfiles } from "@/lib/discord-profiles";
import { useAccess } from "@/lib/access";
import type { SanctionablePlayer } from "@/lib/sanctions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t, msg, intlLocale } from "@/i18n";

type SanctionType = "ban" | "warn" | "kick";

interface PlayerIdentity {
  license?: string;
  license2?: string;
  steam?: string;
  discord?: string;
  xbl?: string;
  live?: string;
  fivem?: string;
  ip?: string;
  tokens?: string[];
}

interface Sanction {
  id: string;
  type: SanctionType;
  playerName: string;
  identity: PlayerIdentity;
  reason: string;
  byName: string;
  byUserId: string | null;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  revokedBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

const TYPE_META: Record<SanctionType, { label: string; plural: string; icon: React.ElementType; className: string }> = {
  ban: { label: msg("Ban"), plural: msg("Bans"), icon: Ban, className: "bg-red-500/10 text-red-400 border-red-500/20" },
  warn: { label: msg("Aviso"), plural: msg("Avisos"), icon: AlertTriangle, className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  kick: { label: msg("Expulsión"), plural: msg("Expulsiones"), icon: LogOut, className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
};

const ID_LABELS: { key: keyof PlayerIdentity; label: string }[] = [
  { key: "license", label: msg("Licencia") },
  { key: "license2", label: msg("Licencia 2") },
  { key: "steam", label: "Steam" },
  { key: "discord", label: "Discord" },
  { key: "fivem", label: "FiveM" },
  { key: "xbl", label: "Xbox Live" },
  { key: "live", label: msg("Microsoft") },
  { key: "ip", label: "IP" },
];

function IdRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:gap-2">
      <span className="shrink-0 text-muted-foreground sm:w-24 sm:pt-1.5">{label}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {values.map((value) => (
          <div key={value} className="flex min-w-0 items-center gap-1">
            <code
              title={value}
              className="min-w-0 flex-1 truncate rounded bg-black/30 px-2 py-1 font-mono"
            >
              {value}
            </code>
            <CopyButton value={value} label={label} />
          </div>
        ))}
      </div>
    </div>
  );
}

function isActive(s: Sanction): boolean {
  if (s.revoked) return false;
  if (s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

function whenText(iso: string): string {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: "short", timeStyle: "short" });
}

function remainingText(s: Sanction): string {
  if (s.revoked) return t("Levantada");
  if (!s.expiresAt) return t("Permanente");
  const ms = new Date(s.expiresAt).getTime() - Date.now();
  if (ms <= 0) return t("Cumplida");
  const horas = Math.floor(ms / 3600000);
  if (horas < 1) return t("{Math} min", { Math: Math.max(1, Math.round(ms / 60000)) });
  if (horas < 48) return `${horas} h`;
  return t("{Math} días", { Math: Math.floor(horas / 24) });
}

export default function SancionesPage() {
  const [sanctions, setSanctions] = React.useState<Sanction[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [detail, setDetail] = React.useState<Sanction | null>(null);
  const [revoking, setRevoking] = React.useState<Sanction | null>(null);
  const [revokeReason, setRevokeReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const { can, reasonFor } = useAccess();
  const puedeSancionar = can("players.sanction");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [target, setTarget] = React.useState<{
    player: SanctionablePlayer;
    type: SanctionType;
  } | null>(null);

  const load = React.useCallback(
    () =>
      fetch(`${AGENT_URL}/api/sanctions`)
        .then((res) => res.json())
        .then((data: { success?: boolean; sanctions: Sanction[] }) => {
          setSanctions(data.success ? data.sanctions : []);
        })
        .catch(() => {
          setSanctions([]);
        }),
    []
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/sanctions/${revoking.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: revokeReason }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t("Sanción levantada"));
        setRevoking(null);
        setRevokeReason("");
        await load();
      } else {
        toast.error(t("No se pudo levantar"), { description: data.error });
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: Sanction) => {
    setBusy(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/sanctions/${s.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(t("Borrada del historial"));
        setDetail(null);
        await load();
      } else {
        toast.error(t("No se pudo borrar"), { description: data.error });
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setBusy(false);
    }
  };

  const filtered = (type: SanctionType | "all") => {
    const list = (sanctions ?? []).filter((s) => (type === "all" ? true : s.type === type));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.playerName.toLowerCase().includes(q) ||
        s.reason.toLowerCase().includes(q) ||
        s.byName.toLowerCase().includes(q) ||
        Object.values(s.identity).some((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? "")).toLowerCase().includes(q))
    );
  };

  const profiles = useDiscordProfiles((sanctions ?? []).map((s) => s.identity.discord));

  const counts = {
    ban: (sanctions ?? []).filter((s) => s.type === "ban" && isActive(s)).length,
    warn: (sanctions ?? []).filter((s) => s.type === "warn" && !s.revoked).length,
    kick: (sanctions ?? []).filter((s) => s.type === "kick").length,
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Gavel className="size-7 text-primary" />
            {t("Sanciones")}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {t("Bans, avisos y expulsiones. Los bans se aplican al conectar: el sancionado no llega a entrar.")}
          </p>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Buscar por nombre, motivo, staff o identificador…")}
              className="pl-9"
            />
          </div>

          <Button
            onClick={() => setPickerOpen(true)}
            disabled={!puedeSancionar}
            title={puedeSancionar ? t("Buscar en la base de datos y sancionar") : reasonFor("players.sanction") ?? undefined}
            className="gap-2"
          >
            <UserPlus className="size-4" />
            {t("Sancionar jugador")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(["ban", "warn", "kick"] as const).map((type) => {
          const meta = TYPE_META[type];
          const Icon = meta.icon;
          return (
            <Card key={type} className="border-border/50 bg-background/50 backdrop-blur">
              <CardContent className="flex items-center gap-3 py-5 sm:px-6">
                <div className={`flex size-10 items-center justify-center rounded-lg border ${meta.className}`}>
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {sanctions === null ? "—" : counts[type]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {type === "ban" ? t("Bans vigentes") : type === "warn" ? t("Avisos activos") : t("Expulsiones")}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="ban" className="space-y-4">
        <TabsList className="w-full max-w-full justify-start overflow-x-auto bg-muted/50 border border-border/50 p-1">
          <TabsTrigger value="ban" className="gap-2"><Ban className="size-4" />{" "}{t("Bans")}</TabsTrigger>
          <TabsTrigger value="warn" className="gap-2"><AlertTriangle className="size-4" />{" "}{t("Avisos")}</TabsTrigger>
          <TabsTrigger value="kick" className="gap-2"><LogOut className="size-4" />{" "}{t("Expulsiones")}</TabsTrigger>
          <TabsTrigger value="all" className="gap-2"><Gavel className="size-4" />{" "}{t("Todo")}</TabsTrigger>
        </TabsList>

        {(["ban", "warn", "kick", "all"] as const).map((type) => (
          <TabsContent key={type} value={type}>
            <Card className="border-border/50 bg-background/50 backdrop-blur">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-lg">
                  {type === "all" ? t("Historial completo") : t(TYPE_META[type as SanctionType].plural)}
                </CardTitle>
                <CardDescription>
                  {type === "ban"
                    ? t("Levantar un ban no lo borra: queda en el historial con quién lo levantó y por qué.")
                    : type === "warn"
                      ? t("Un aviso queda registrado y se ve junto al jugador, pero no le impide entrar.")
                      : type === "kick"
                        ? t("Expulsiones puntuales. No impiden volver a conectar.")
                        : t("Todo lo que se ha aplicado, del más reciente al más antiguo.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {sanctions === null ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : filtered(type).length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <ShieldCheck className="size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      {query ? t("Nada que coincida con la búsqueda.") : t("Todavía no hay nada aquí. Buena señal.")}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("Jugador")}</TableHead>
                          {type === "all" && <TableHead>{t("Tipo")}</TableHead>}
                          <TableHead>{t("Motivo")}</TableHead>
                          <TableHead>{t("Puesta por")}</TableHead>
                          <TableHead>{t("Cuándo")}</TableHead>
                          <TableHead>{t("Estado")}</TableHead>
                          <TableHead className="text-right">{t("Acciones")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered(type).map((s) => {
                          const meta = TYPE_META[s.type];
                          const activa = isActive(s);
                          return (
                            <TableRow key={s.id} className="cursor-pointer" onClick={() => setDetail(s)}>
                              <TableCell className="font-medium">
                                <span className="flex items-center gap-2.5">
                                  <PlayerAvatar
                                    name={s.playerName}
                                    profile={s.identity.discord ? profiles[s.identity.discord] : undefined}
                                    size={28}
                                  />
                                  <span className="truncate">{s.playerName}</span>
                                </span>
                              </TableCell>
                              {type === "all" && (
                                <TableCell>
                                  <Badge variant="outline" className={meta.className}>{t(meta.label)}</Badge>
                                </TableCell>
                              )}
                              <TableCell className="max-w-[22ch] truncate text-muted-foreground">{t(s.reason)}</TableCell>
                              <TableCell className="text-muted-foreground">{s.byName}</TableCell>
                              <TableCell className="whitespace-nowrap text-muted-foreground">{whenText(s.createdAt)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    s.revoked
                                      ? "bg-muted/60 text-muted-foreground border-border/50"
                                      : activa
                                        ? meta.className
                                        : "bg-muted/60 text-muted-foreground border-border/50"
                                  }
                                >
                                  {remainingText(s)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {activa && s.type !== "kick" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRevoking(s);
                                    }}
                                  >
                                    <RotateCcw className="size-3.5" />
                                    {t("Levantar")}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {target === null && (
        <SanctionTargetPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={(player, type) => {
            setPickerOpen(false);
            setTarget({ player, type });
          }}
        />
      )}

      <SanctionDialog
        key={target ? `${target.player.key}-${target.type}` : "cerrado"}
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        type={target?.type ?? "warn"}
        player={
          target
            ? {
                name: target.player.name,
                identity: target.player.identity,
                online: target.player.isOnline,
              }
            : null
        }
        onDone={() => {
          setTarget(null);
          void load();
        }}
      />

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline" className={TYPE_META[detail.type].className}>
                    {t(TYPE_META[detail.type].label)}
                  </Badge>
                  {detail.playerName}
                </DialogTitle>
                <DialogDescription>
                  {t("Puesta por {byName} el {whenText} · referencia", { byName: detail.byName, whenText: whenText(detail.createdAt) })}{" "}
                  <code className="font-mono text-xs">{detail.id}</code>
                </DialogDescription>
              </DialogHeader>

              <DialogBody>
                <div className="space-y-4">
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">{t("Motivo")}</p>
                    <p className="mt-1 text-sm">{t(detail.reason)}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                      <p className="text-xs font-semibold text-muted-foreground">{t("Duración")}</p>
                      <p className="mt-1 text-sm">
                        {detail.expiresAt ? t("Hasta el {whenText}", { whenText: whenText(detail.expiresAt) }) : t("Permanente")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                      <p className="text-xs font-semibold text-muted-foreground">{t("Estado")}</p>
                      <p className="mt-1 text-sm">{remainingText(detail)}</p>
                    </div>
                  </div>

                  {detail.revoked && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <p className="text-xs font-semibold text-emerald-400">{t("Levantada")}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("Por {revokedBy} el", { revokedBy: detail.revokedBy })}{" "}{detail.revokedAt ? whenText(detail.revokedAt) : "—"}
                        {detail.revokeReason ? ` · ${detail.revokeReason}` : ""}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Fingerprint className="size-3.5" />
                      {t("Identificadores guardados")}
                    </p>
                    <div className="space-y-1.5">
                      {ID_LABELS.filter((row) => detail.identity[row.key]).map((row) => (
                        <IdRow
                          key={row.key}
                          label={t(row.label)}
                          values={[String(detail.identity[row.key])]}
                        />
                      ))}
                      {(detail.identity.tokens ?? []).length > 0 && (
                        <IdRow label={t("Hardware")} values={detail.identity.tokens ?? []} />
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {t("Un ban acierta si coincide cualquiera de estos, salvo la IP: banear por IP castigaría a quien comparta conexión con el sancionado.")}
                    </p>
                  </div>
                </div>
              </DialogBody>

              <DialogFooter className="gap-2 sm:justify-between">
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(detail)}>
                  <Trash2 className="size-3.5" />
                  {t("Borrar del historial")}
                </Button>
                {isActive(detail) && detail.type !== "kick" && (
                  <Button variant="outline" onClick={() => { setRevoking(detail); setDetail(null); }}>
                    <RotateCcw className="size-4" />
                    {t("Levantar sanción")}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Levantar la sanción")}</DialogTitle>
            <DialogDescription>
              {t("{playerName} podrá volver a entrar. Queda registrado quién la levanta y por qué.", { playerName: revoking?.playerName })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-levantar">{t("Motivo (opcional)")}</Label>
            <Input
              id="motivo-levantar"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder={t("Apelación aceptada, error del staff…")}
            />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setRevoking(null)}>{t("Cancelar")}</Button>
            <Button onClick={() => void revoke()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {t("Levantar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
