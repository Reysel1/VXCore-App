"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, ArrowRight, AlertTriangle, Camera, Copy, UserSquare2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { AGENT_URL } from "@/lib/agent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlayerRow } from "@/components/players/player-row";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerScreenDialog } from "@/components/players/player-screen-dialog";
import { useAccess } from "@/lib/access";
import { t } from "@/i18n";

const REFRESH_MS = 5000;

const MAX_VISIBLE = 8;

interface OnlinePlayer {
  id: number | string;
  name?: string;
  ping?: number;
}

interface ConnectingPlayer {
  key: string;
  name: string;
  seconds: number;
}

export function OnlinePlayers() {
  const { can, canSee } = useAccess();
  const [players, setPlayers] = useState<OnlinePlayer[]>([]);
  const [connecting, setConnecting] = useState<ConnectingPlayer[]>([]);
  const [stale, setStale] = useState(false);
  const [down, setDown] = useState(false);
  const [screenPlayer, setScreenPlayer] = useState<{ source: number; name: string } | null>(null);

  const copiarId = useCallback(async (id: number | string) => {
    try {
      await navigator.clipboard.writeText(String(id));
      toast.success(t("Id {id} copiado", { id }));
    } catch {
      toast.error(t("El navegador no ha dejado copiar al portapapeles."));
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/server/online`);
      const data = await res.json();
      if (!data.success) return;

      setPlayers(Array.isArray(data.players) ? data.players : []);
      setConnecting(Array.isArray(data.connecting) ? data.connecting : []);
      setStale(Boolean(data.stale));
      setDown(false);
    } catch {
      setDown(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const visible = players.slice(0, MAX_VISIBLE);
  const resto = players.length - visible.length;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" />
          {t("En el servidor")}
          {players.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {players.length}
            </Badge>
          )}
        </CardTitle>

        {canSee("players") && (
          <Button
            render={<Link href="/players" />}
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-primary"
          >
            {t("Ver todo")}{" "}<ArrowRight className="size-3" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-2">
        {stale && !down && players.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-400">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            <span>{t("El recurso in-game lleva un rato sin dar señales: esta lista puede estar vieja.")}</span>
          </div>
        )}

        {connecting.map((c) => (
          <div
            key={c.key}
            className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 p-2 animate-in fade-in"
          >
            <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <span className="size-2.5 animate-pulse rounded-full bg-muted-foreground/40" />
              <UserPlus className="absolute size-3 text-muted-foreground/70" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground/90">{c.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {t("Conectándose…")}{" "}{c.seconds >= 3 && `(${c.seconds}s)`}
              </span>
            </span>
            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/40" />
          </div>
        ))}

        {down ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{t("El agente VXCore no responde.")}</p>
        ) : players.length === 0 && connecting.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t("No hay nadie dentro ahora mismo.")}
          </p>
        ) : players.length === 0 ? (
          <span className="block" />
        ) : (
          <>
            {visible.map((p) => {
              const nombre = p.name || t("Jugador {id}", { id: p.id });
              return (
                <DropdownMenu key={p.id}>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <PlayerRow
                          compact
                          interactive
                          name={nombre}
                          sessionId={p.id}
                          ping={p.ping}
                          avatar={<PlayerAvatar name={nombre} size={28} />}
                        />
                      </button>
                    }
                  />

                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="truncate text-xs">{nombre}</DropdownMenuLabel>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />

                    {canSee("players") && (
                      <DropdownMenuItem render={<Link href="/players" />}>
                        <UserSquare2 className="size-3.5" />{" "}{t("Ver ficha completa")}
                      </DropdownMenuItem>
                    )}

                    {can("players.screen") && (
                      <DropdownMenuItem
                        onClick={() => setScreenPlayer({ source: Number(p.id), name: nombre })}
                      >
                        <Camera className="size-3.5" />{" "}{t("Ver pantalla")}
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuItem onClick={() => void copiarId(p.id)}>
                      <Copy className="size-3.5" />{" "}{t("Copiar id de sesión")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
            {resto > 0 && (
              <p className="pt-1 text-center text-[11px] text-muted-foreground">
                {t("y {resto} más", { resto })}
              </p>
            )}
          </>
        )}
      </CardContent>

      <PlayerScreenDialog player={screenPlayer} onClose={() => setScreenPlayer(null)} />
    </Card>
  );
}
