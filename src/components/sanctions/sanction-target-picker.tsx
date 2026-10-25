"use client";

import React from "react";
import { Ban, Database, Loader2, MessageSquareWarning, Search, UserMinus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { useServerContext } from "@/context/server-context";
import { useDiscordProfiles } from "@/lib/discord-profiles";
import {
  fetchSanctionablePlayers,
  type SanctionType,
  type SanctionablePlayer,
} from "@/lib/sanctions";
import { t, msg } from "@/i18n";

const ACTIONS: { type: SanctionType; label: string; icon: typeof Ban; className: string }[] = [
  {
    type: "warn",
    label: msg("Avisar"),
    icon: MessageSquareWarning,
    className: "text-muted-foreground hover:text-foreground",
  },
  {
    type: "kick",
    label: msg("Expulsar"),
    icon: UserMinus,
    className: "text-muted-foreground hover:text-foreground",
  },
  {
    type: "ban",
    label: msg("Banear"),
    icon: Ban,
    className: "text-red-400/90 hover:bg-red-500/10 hover:text-red-300",
  },
];

function sanctionsLabel(count: number): string {
  return count === 1 ? t("1 sanción") : t("{count} sanciones", { count });
}

export function SanctionTargetPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (player: SanctionablePlayer, type: SanctionType) => void;
}) {
  const { activeServerId } = useServerContext();
  const [query, setQuery] = React.useState("");

  const [loaded, setLoaded] = React.useState<{
    players: SanctionablePlayer[];
    error: string | null;
  } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void fetchSanctionablePlayers().then((result) => {
      if (!cancelled) setLoaded({ players: result.players, error: result.error ?? null });
    });

    return () => {
      cancelled = true;
    };
  }, [open, activeServerId]);

  const players = loaded?.players ?? null;
  const error = loaded?.error ?? null;

  const profiles = useDiscordProfiles((players ?? []).map((p) => p.identity.discord || p.discord));

  const term = query.trim().toLowerCase();
  const filtered = (players ?? []).filter((p) => {
    if (!term) return true;
    return (
      p.name.toLowerCase().includes(term) ||
      p.citizenid.toLowerCase().includes(term) ||
      p.license.toLowerCase().includes(term) ||
      String(p.id).includes(term)
    );
  });

  const onlineCount = (players ?? []).filter((p) => p.isOnline).length;
  const dbCount = (players?.length ?? 0) - onlineCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Sancionar a un jugador")}</DialogTitle>
          <DialogDescription>
            {t("Conectados ahora mismo y personajes guardados en la base de datos. No hace falta que la persona esté dentro para banearla.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Buscar por nombre, citizenid o licencia…")}
              className="pl-9"
            />
          </div>

          {players !== null && !error && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {onlineCount === 1 ? t("1 conectado") : t("{onlineCount} conectados", { onlineCount })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Database className="size-3" />
                {dbCount === 1 ? t("1 en la base de datos") : t("{dbCount} en la base de datos", { dbCount })}
              </span>
            </div>
          )}

          {players !== null && !error && dbCount === 0 && (
            <p className="text-[11px] text-muted-foreground/60">
              {t("Conecta el MySQL del servidor para alcanzar también a quien no está dentro.")}
            </p>
          )}
        </div>

        <DialogBody>
          <div className="space-y-1.5">
            {players === null ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("Leyendo jugadores…")}
              </div>
            ) : error ? (
              <p className="rounded-lg border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
                {error}
              </p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Users className="size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {query
                    ? t("Nadie coincide con la búsqueda.")
                    : t("No hay jugadores conectados ni personajes en la base de datos. Comprueba la conexión MySQL del servidor en Servidores.")}
                </p>
              </div>
            ) : (
              filtered.map((player) => {
                const discordId = player.identity.discord || player.discord;
                const profile = discordId ? profiles[discordId] : undefined;
                const previas =
                  (player.sanctions?.bans ?? 0) +
                  (player.sanctions?.warns ?? 0) +
                  (player.sanctions?.kicks ?? 0);

                const origen = player.isOnline ? t("En juego · ID {id}", { id: player.id }) : t("Base de datos");
                const referencia = player.isOnline
                  ? player.license
                    ? `${player.license.slice(0, 10)}…`
                    : "sin licencia"
                  : player.citizenid || `${player.license.slice(0, 10)}…` || "sin identificadores";

                return (
                  <div
                    key={player.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5 transition-colors hover:border-border/80 hover:bg-muted/30"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative">
                        <PlayerAvatar name={player.name} profile={profile} size={36} />
                        {player.isOnline && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-500"
                            title={t("Conectado")}
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{player.name}</span>
                          {previas > 0 && (
                            <span
                              className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400/90"
                              title={t("Sanciones anteriores en su historial")}
                            >
                              {sanctionsLabel(previas)}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {profile && (
                            <span className="text-foreground/70">
                              {profile.globalName || profile.username}
                              <span className="mx-1.5 text-muted-foreground/50">·</span>
                            </span>
                          )}
                          {origen}
                          <span className="mx-1.5 text-muted-foreground/50">·</span>
                          <span className="font-mono">{referencia}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      {ACTIONS.map((action) => {
                        const disabled = action.type === "kick" && !player.isOnline;
                        return (
                          <Button
                            key={action.type}
                            size="sm"
                            variant="ghost"
                            disabled={disabled}
                            title={
                              disabled ? t("Sólo se puede expulsar a quien está conectado.") : t(action.label)
                            }
                            className={`h-8 gap-1.5 px-2 text-xs font-normal ${action.className}`}
                            onClick={() => onPick(player, action.type)}
                          >
                            <action.icon className="size-3.5" />
                            <span className="hidden sm:inline">{t(action.label)}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
