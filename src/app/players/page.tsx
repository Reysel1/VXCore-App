"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AGENT_URL } from "@/lib/agent";
import {
  Users,
  Search,
  UserX,
  Coins,
  CheckCircle2,
  RefreshCw,
  Wallet,
  Building2,
  Zap,
  Settings2,
  Camera,
  Loader2,
  Download,
  Ban,
  MessageSquareWarning,
  ShieldCheck,
  UserPlus
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useServerContext } from "@/context/server-context";
import { usePlayerActions, PlayerActionDef } from "@/lib/player-actions";
import { ActionsEditor } from "@/components/players/actions-editor";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerIdentityCard } from "@/components/players/player-identity";
import { PlayerHistory } from "@/components/players/player-history";
import { SanctionDialog } from "@/components/players/sanction-dialog";
import { AdminAccessDialog } from "@/components/players/admin-access";
import { useDiscordBotConfigured, useDiscordProfiles } from "@/lib/discord-profiles";
import { useAccess } from "@/lib/access";
import { PlayerScreenDialog } from "@/components/players/player-screen-dialog";
import { PlayerStats } from "@/components/players/player-stats";
import { PlayerConnection } from "@/components/players/player-connection";
import { PlayerRow } from "@/components/players/player-row";
import type { PlayerIdentity, SanctionType } from "@/lib/sanctions";
import { toast } from "sonner";
import { t } from "@/i18n";

interface Player {
  id: number | string;
  name: string;
  citizenid: string;
  license: string;
  discord?: string;
  ip?: string;
  ping?: number;
  job: string;
  jobGrade: string;
  gang?: string;
  cash: number;
  bank: number;
  crypto?: number;
  health: number;
  armor: number;
  coords?: { x: number; y: number; z: number };
  isOnline?: boolean;
  identity?: PlayerIdentity;
  sanctions?: { bans: number; warns: number; kicks: number };
}

function sinFichaDb(player: { citizenid?: string }): boolean {
  return String(player.citizenid || "").startsWith("LIVE-");
}

function licenciaCorta(license?: string): string {
  const text = String(license || "").replace(/^license2?:/, "");
  return text ? `${text.slice(0, 10)}…` : t("sin licencia");
}

interface InGameResource {
  installed: boolean;
  ensured: boolean;
  reporting: boolean;
  lastHeartbeat: string | null;
  ageMs: number | null;
  folder: string | null;
}

interface ConnectingPlayer {
  key: string;
  name: string;
  seconds: number;
}

export default function PlayersPage() {
  const { activeServer } = useServerContext();
  const [players, setPlayers] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [screenPlayer, setScreenPlayer] = useState<{ source: number; name: string } | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [ingame, setIngame] = useState<InGameResource | null>(null);
  const [connecting, setConnecting] = useState<ConnectingPlayer[]>([]);
  const [installing, setInstalling] = useState(false);

  const { can, canSee, reasonFor } = useAccess();
  const puedeSancionar = can("players.sanction") && canSee("sanctions");
  const motivoSancion = !can("players.sanction")
    ? reasonFor("players.sanction")
    : t("Tu acceso no incluye la sección de Sanciones.");
  const puedeInstalarRecurso = can("server.ingame") && canSee("resources");

  const [sanctionType, setSanctionType] = useState<SanctionType | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [isGiveMoneyOpen, setIsGiveMoneyOpen] = useState(false);
  const [giveMoneyAmount, setGiveMoneyAmount] = useState(5000);
  const [giveMoneyType, setGiveMoneyType] = useState<"cash" | "bank">("bank");

  const { actions: playerActions, save: savePlayerActions, trigger: triggerPlayerAction } = usePlayerActions();
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [actionsDraft, setActionsDraft] = useState<PlayerActionDef[]>([]);
  const [savingActions, setSavingActions] = useState(false);

  const openActionsConfig = () => {
    setActionsDraft(JSON.parse(JSON.stringify(playerActions)));
    setIsActionsOpen(true);
  };

  const saveActionsConfig = async () => {
    setSavingActions(true);
    const ok = await savePlayerActions(actionsDraft);
    setSavingActions(false);
    if (ok) {
      toast.success(t("Acciones guardadas. Se aplican al instante."));
      setIsActionsOpen(false);
    } else {
      toast.error(t("No se pudo guardar la configuración de acciones"));
    }
  };

  const installIngameResource = async () => {
    if (!activeServer) return;
    setInstalling(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/server/install-resource`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverDataPath: activeServer.serverDataPath,
          cfgPath: activeServer.cfgPath,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t("Recurso VXCore instalado"), {
          description: t("Reinicia el FXServer para que empiece a reportar quién está dentro."),
          duration: 10000,
        });
        await fetchLivePlayers();
      } else {
        toast.error(t("No se pudo instalar"), { description: data.error || data.message });
      }
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setInstalling(false);
    }
  };

  const ciego = ingame !== null && !ingame.reporting;

  const explicacionCeguera = !ingame
    ? ""
    : !ingame.installed
      ? t("El recurso VXCore in-game no está instalado en este servidor. Es quien manda la lista de conectados y quien aplica las sanciones al entrar: sin él, el servidor puede estar lleno y esta pantalla salir vacía.")
      : !ingame.ensured
        ? t("El recurso está en disco ({folder}), pero tu server.cfg no lo arranca. Añade \"ensure {folder}\" y reinicia el FXServer.", { folder: ingame.folder })
        : ingame.lastHeartbeat
          ? t("El recurso está instalado y declarado, pero lleva rato sin reportar. Si acabas de actualizar VXCore, reinicia el FXServer: el motor sigue ejecutando los ficheros que cargó al arrancar.")
          : t("El recurso está instalado y declarado, pero todavía no ha reportado. Reinicia el FXServer para que lo cargue.");

  const handlePlayerAction = async (actionKey: string) => {
    if (!selectedPlayer) return;
    const result = await triggerPlayerAction(actionKey, selectedPlayer);
    if (result.success) {
      setActionNotice(result.message || t("Acción enviada al servidor."));
      setTimeout(() => setActionNotice(null), 3500);
    } else {
      toast.error(t("La acción no llegó al servidor"), { description: result.error, duration: 8000 });
    }
  };

  const fetchLivePlayers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/server/live-players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: activeServer?.ip || "127.0.0.1",
          port: activeServer?.port || "30120",
        }),
      });
      const data = await res.json();
      setIngame((data.vxcore as InGameResource | undefined) ?? null);
      setConnecting(Array.isArray(data.connecting) ? (data.connecting as ConnectingPlayer[]) : []);
      if (data.success && Array.isArray(data.players)) {
        const connected = (data.players as Player[]).filter((p) => p.isOnline);

        setPlayers(connected);

        if (connected.length > 0) {
          setSelectedPlayer((prev) => {
            if (!prev) return connected[0];
            const stillExists = connected.find((p) => p.citizenid === prev.citizenid || p.id === prev.id);
            return stillExists || connected[0];
          });
        } else {
          setSelectedPlayer(null);
        }
      }
    } catch (err) {
      console.log("Error al cargar jugadores reales:", err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [activeServer]);

  useEffect(() => {
    const initial = setTimeout(fetchLivePlayers, 0);
    const interval = setInterval(fetchLivePlayers, 8000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchLivePlayers]);

  const discordProfiles = useDiscordProfiles(
    players.map((player) => player.identity?.discord ?? player.discord)
  );

  const discordBot = useDiscordBotConfigured();
  const faltaBotDiscord =
    discordBot === false && players.some((player) => player.identity?.discord ?? player.discord);

  const profileOf = (player: Player) => {
    const id = player.identity?.discord ?? player.discord;
    return id ? discordProfiles[id] : undefined;
  };

  const filteredPlayers = players.filter((p) => {
    const term = searchQuery.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.citizenid && p.citizenid.toLowerCase().includes(term)) ||
      (p.job && p.job.toLowerCase().includes(term)) ||
      (p.license && p.license.toLowerCase().includes(term)) ||
      String(p.id).includes(term)
    );
  });

  const afterSanction = () => {
    setHistoryKey((k) => k + 1);
    void fetchLivePlayers();
  };

  const handleGiveMoney = async () => {
    if (!selectedPlayer) return;
    try {
      const res = await fetch(`${AGENT_URL}/api/server/moderation/give-money`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          citizenid: selectedPlayer.citizenid,
          type: giveMoneyType,
          amount: giveMoneyAmount,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.success === false) {
        toast.error(t("No se pudo entregar el dinero"), {
          description: result.error || t("El agente respondió {status}.", { status: res.status }),
          duration: 8000,
        });
        setIsGiveMoneyOpen(false);
        return;
      }

      const added = Number(giveMoneyAmount);
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.citizenid === selectedPlayer.citizenid || p.id === selectedPlayer.id) {
            return {
              ...p,
              [giveMoneyType]: (p[giveMoneyType] || 0) + added,
            };
          }
          return p;
        })
      );

      setSelectedPlayer((prev) =>
        prev
          ? {
              ...prev,
              [giveMoneyType]: (prev[giveMoneyType] || 0) + added,
            }
          : null
      );

      setActionNotice(t("Añadidos ${added} ({giveMoneyType}) a {name}", { added: added.toLocaleString(), giveMoneyType, name: selectedPlayer.name }));
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err) {
      toast.error(t("No se pudo entregar el dinero"), { description: err instanceof Error ? err.message : String(err), duration: 8000 });
    }
    setIsGiveMoneyOpen(false);
  };

  const onlineCount = players.filter((p) => p.isOnline).length;

  const sinFicha = selectedPlayer ? sinFichaDb(selectedPlayer) : false;

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("Jugadores conectados")}</h1>
            {onlineCount > 0 ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                {t("{onlineCount} en línea", { onlineCount })}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                {t("Nadie conectado")}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {t("Quién está dentro de")}{" "}<span className="text-primary font-medium">{activeServer?.name || t("tu servidor FiveM")}</span>{" "}{t("ahora mismo, con su economía y su moderación en vivo.")}
          </p>
          {faltaBotDiscord && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("Las fotos y los nombres de Discord no salen porque el panel no tiene bot vinculado: se conecta en")}{" "}
              <Link href="/settings" className="text-primary underline-offset-2 hover:underline">
                {t("Ajustes → Discord")}
              </Link>
              .
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLivePlayers} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            {t("Actualizar")}
          </Button>

        </div>
      </div>

      {actionNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm flex items-center gap-2 shadow-sm animate-in fade-in">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Buscar por ID, nombre, citizenid o trabajo...")}
              className="pl-9 bg-background/50"
            />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
            {connecting.map((c) => (
              <div
                key={c.key}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 animate-in fade-in"
              >
                <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <span className="size-3 animate-pulse rounded-full bg-muted-foreground/40" />
                  <UserPlus className="absolute size-3.5 text-muted-foreground/70" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground/90">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("Conectándose… comprobando acceso")}{" "}{c.seconds >= 3 && `(${c.seconds}s)`}
                  </span>
                </span>
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/40" />
              </div>
            ))}

            {filteredPlayers.length === 0 && connecting.length === 0 ? (
              <div className="p-8 text-center border border-dashed rounded-xl text-muted-foreground space-y-2">
                <Users className="size-8 mx-auto stroke-[1.5] opacity-40" />
                <p className="text-sm font-medium">
                  {searchQuery
                    ? t("Nadie coincide con la búsqueda")
                    : ciego
                      ? t("VXCore no puede ver dentro del servidor")
                      : t("No hay nadie conectado")}
                </p>
                <p className="text-xs">
                  {searchQuery
                    ? t("Aquí sólo salen los jugadores que están dentro del servidor ahora mismo.")
                    : ciego
                      ? explicacionCeguera
                      : t("El servidor está en marcha y el recurso VXCore reporta desde dentro: ahora mismo no hay nadie jugando.")}
                </p>

                {!searchQuery && ciego && ingame && !ingame.installed && puedeInstalarRecurso && (
                  <Button
                    size="sm"
                    onClick={() => void installIngameResource()}
                    disabled={installing || !activeServer}
                    className="mt-1"
                  >
                    {installing ? (
                      <Loader2 className="mr-2 size-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-2 size-3.5" />
                    )}
                    {t("Instalar el recurso VXCore")}
                  </Button>
                )}
                <p className="text-xs">
                  {t("Para sancionar a alguien que no está conectado,")}{" "}
                  <Link href="/sanciones" className="text-primary underline-offset-2 hover:underline">
                    {t("búscalo en Sanciones")}
                  </Link>
                  {t(": ahí está la base de datos entera.")}
                </p>
              </div>
            ) : (
              filteredPlayers.map((player) => {
                const isSelected = selectedPlayer?.citizenid === player.citizenid || selectedPlayer?.id === player.id;
                return (
                  <PlayerRow
                    key={`${player.id}-${player.citizenid}`}
                    name={player.name}
                    sessionId={player.id}
                    ping={player.ping}
                    selected={isSelected}
                    onClick={() => setSelectedPlayer(player)}
                    avatar={
                      <div className="relative">
                        <PlayerAvatar name={player.name} profile={profileOf(player)} size={40} />
                        <span
                          className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-emerald-500 ring-1 ring-emerald-500/20"
                          title={t("En Juego")}
                        />
                      </div>
                    }
                    badges={
                      player.sanctions?.bans || player.sanctions?.warns ? (
                        <Badge
                          variant="outline"
                          className="h-4 border-amber-500/20 bg-amber-500/10 px-1.5 text-[10px] text-amber-400"
                          title={t("Tiene sanciones anteriores")}
                        >
                          {(player.sanctions?.bans ?? 0) + (player.sanctions?.warns ?? 0)}
                        </Badge>
                      ) : null
                    }
                    subtitle={
                      <>
                        <span
                          className={`truncate ${sinFichaDb(player) && !profileOf(player) ? "font-mono" : ""}`}
                        >
                          {profileOf(player)
                            ? profileOf(player)!.globalName || profileOf(player)!.username
                            : sinFichaDb(player)
                              ? licenciaCorta(player.license)
                              : `${player.job} (${player.jobGrade})`}
                        </span>
                        {!sinFichaDb(player) && (
                          <>
                            <span>•</span>
                            <span className="font-mono font-medium text-emerald-400">
                              ${(player.cash + player.bank).toLocaleString()}
                            </span>
                          </>
                        )}
                      </>
                    }
                  />
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-7">
          {selectedPlayer ? (
            <div className="space-y-4">
              <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-4 border-b border-border/40">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerAvatar
                        name={selectedPlayer.name}
                        profile={profileOf(selectedPlayer)}
                        size={52}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-xl font-bold truncate">{selectedPlayer.name}</CardTitle>
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                            {t("En Juego")}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs mt-1">
                          {profileOf(selectedPlayer) && (
                            <span className="text-foreground/80">
                              {profileOf(selectedPlayer)!.globalName || profileOf(selectedPlayer)!.username}
                              <span className="text-muted-foreground">{" "}{t("· Discord")}</span>
                              <span className="mx-1.5 text-muted-foreground">|</span>
                            </span>
                          )}
                          <span className="font-mono">
                            ID {selectedPlayer.id} ·{" "}
                            {sinFicha ? licenciaCorta(selectedPlayer.license) : selectedPlayer.citizenid}
                          </span>
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        onClick={openActionsConfig}
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        title={t("Configurar las acciones (revivir, curar…) con los eventos de tu framework")}
                      >
                        <Settings2 className="size-3.5 text-muted-foreground" />
                        {t("Acciones")}
                      </Button>
                      <Button
                        onClick={() => setIsGiveMoneyOpen(true)}
                        size="sm"
                        className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        <Coins className="size-3.5" />
                        {t("Dar Dinero")}
                      </Button>
                      {can("players.admin") && (
                        <Button
                          onClick={() => setIsAdminOpen(true)}
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                          title={t("Dar o quitar permisos de administración dentro del juego")}
                        >
                          <ShieldCheck className="size-3.5 text-sky-400" />
                          {t("Permisos")}
                        </Button>
                      )}

                      <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setSanctionType("warn")}
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        disabled={!puedeSancionar}
                        title={puedeSancionar ? t("Dejar constancia sin echarle") : motivoSancion ?? undefined}
                      >
                        <MessageSquareWarning className="size-3.5 text-amber-400" />
                        {t("Avisar")}
                      </Button>
                      <Button
                        onClick={() => setSanctionType("kick")}
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        disabled={!puedeSancionar || !selectedPlayer.isOnline}
                        title={
                          !puedeSancionar
                            ? motivoSancion ?? undefined
                            : !selectedPlayer.isOnline
                              ? t("Sólo se puede expulsar a quien está conectado.")
                              : t("Echarle de la partida")
                        }
                      >
                        <UserX className="size-3.5 text-orange-400" />
                        {t("Expulsar")}
                      </Button>
                      <Button
                        onClick={() => setSanctionType("ban")}
                        size="sm"
                        variant="destructive"
                        className="h-8 gap-1.5"
                        disabled={!puedeSancionar}
                        title={puedeSancionar ? t("Impedirle entrar") : motivoSancion ?? undefined}
                      >
                        <Ban className="size-3.5" />
                        {t("Banear")}
                      </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  <PlayerStats player={selectedPlayer} sinFicha={sinFicha} />

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                    {can("players.screen") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setScreenPlayer({ source: Number(selectedPlayer.id), name: selectedPlayer.name })}
                      >
                        <Camera className="size-3.5" />{" "}{t("Ver pantalla")}
                      </Button>
                    )}
                    {playerActions.length === 0 && (
                      <span className="text-xs text-muted-foreground py-1">
                        {t("Cargando acciones…")}
                      </span>
                    )}
                    {playerActions.map((action) => (
                      <Button
                        key={action.key}
                        onClick={() => handlePlayerAction(action.key)}
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        title={action.hint || t("Dispara: {valor}", { valor: action.command || action.event })}
                      >
                        <Zap className="size-3.5 text-primary" />
                        {action.label}
                      </Button>
                    ))}
                    {playerActions.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/70 self-center">
                        {t("Configúralas en el botón Acciones · el servidor debe estar corriendo")}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <PlayerIdentityCard identity={selectedPlayer.identity} />

                    <PlayerConnection
                      sessionId={selectedPlayer.id}
                      ping={selectedPlayer.ping}
                      ip={selectedPlayer.ip}
                    />
                  </div>

                  {canSee("sanctions") && (
                    <PlayerHistory
                      identity={selectedPlayer.identity}
                      refreshKey={historyKey}
                      canRevoke={puedeSancionar}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-dashed border-border/60 p-8 text-center text-muted-foreground">
              <p className="text-sm">
                {players.length === 0
                  ? t("En cuanto alguien entre al servidor aparecerá aquí, con su ficha y sus acciones en vivo.")
                  : t("Selecciona un jugador para ver sus datos en tiempo real y ejecutar acciones.")}
              </p>
            </Card>
          )}
        </div>
      </div>

      <PlayerScreenDialog player={screenPlayer} onClose={() => setScreenPlayer(null)} />

      <SanctionDialog
        key={sanctionType ?? "cerrado"}
        open={sanctionType !== null}
        onOpenChange={(open) => !open && setSanctionType(null)}
        type={sanctionType ?? "warn"}
        player={
          selectedPlayer
            ? {
                name: selectedPlayer.name,
                identity: selectedPlayer.identity,
                online: selectedPlayer.isOnline,
              }
            : null
        }
        onDone={afterSanction}
      />

      <AdminAccessDialog
        open={isAdminOpen}
        onOpenChange={setIsAdminOpen}
        player={selectedPlayer ? { name: selectedPlayer.name, identity: selectedPlayer.identity } : null}
        cfgPath={activeServer?.cfgPath}
      />

      <Dialog open={isGiveMoneyOpen} onOpenChange={setIsGiveMoneyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-500">
              <Coins className="size-5" />
              {t("Añadir Fondos a {name}", { name: selectedPlayer?.name })}
            </DialogTitle>
            <DialogDescription>
              {t("Añade dinero al efectivo o cuenta bancaria del jugador (sincronizado con memoria y MySQL).")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={giveMoneyType === "bank" ? "default" : "outline"}
                onClick={() => setGiveMoneyType("bank")}
                className="gap-2"
              >
                <Building2 className="size-4" />
                {t("Banco")}
              </Button>
              <Button
                type="button"
                variant={giveMoneyType === "cash" ? "default" : "outline"}
                onClick={() => setGiveMoneyType("cash")}
                className="gap-2"
              >
                <Wallet className="size-4" />
                {t("Efectivo")}
              </Button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">{t("Cantidad ($)")}</label>
              <Input
                type="number"
                value={giveMoneyAmount}
                onChange={(e) => setGiveMoneyAmount(Number(e.target.value))}
                min={1}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setIsGiveMoneyOpen(false)}>{t("Cancelar")}</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleGiveMoney}>
              {t("Otorgar Dinero")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isActionsOpen} onOpenChange={setIsActionsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Zap className="size-5" />
              {t("Acciones del Jugador")}
            </DialogTitle>
            <DialogDescription>
              {t("Cada botón del panel de jugador dispara un comando de consola o un evento in-game. En Editor → Eventos puedes descubrir el evento real de revivir de tu framework (QBCore, ESX…) y usarlo aquí.")}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="py-2">
            <ActionsEditor actions={actionsDraft} onChange={setActionsDraft} />
          </DialogBody>

          <DialogFooter className="gap-2">
            <Button variant="destructive" onClick={() => setIsActionsOpen(false)}>{t("Cancelar")}</Button>
            <Button onClick={saveActionsConfig} disabled={savingActions}>
              {savingActions ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Settings2 className="mr-2 size-4" />}
              {t("Guardar acciones")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
