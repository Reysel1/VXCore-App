"use client";

import React, { useEffect, useEffectEvent, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  ExternalLink,
  Gamepad2,
  KeyRound,
  Loader2,
  Puzzle,
  Sparkles,
} from "lucide-react";
import { connectAgentSocket } from "@/lib/agent-socket";
import { AGENT_URL, agentIsOnThisMachine } from "@/lib/agent";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PathPicker } from "@/components/common/path-picker";
import { cn } from "@/lib/utils";
import { t, msg } from "@/i18n";

type Game = "fivem" | "redm" | "open77";
type Build = "legacy" | "enhanced";

interface GameOption {
  id: Game;
  title: string;
  subtitle: string;
  image?: string;
}

const GAMES: GameOption[] = [
  { id: "fivem", title: "FiveM", subtitle: msg("GTA V"), image: "/fivem/fivem.png" },
  {
    id: "redm",
    title: "RedM",
    subtitle: msg("Red Dead Redemption 2"),
    image: "/fivem/redm.png",
  },
  {
    id: "open77",
    title: "Open77",
    subtitle: msg("Cyberpunk 2077"),
    image: "/fivem/open77.jpg",
  },
];

const OPEN77_HOST_URL = "https://open2077.net/host";

interface Open77Archive {
  path: string;
  name: string;
  size: number;
  downloadedAt: string;
}

interface Open77ArchiveCheck {
  success?: boolean;
  supported?: boolean;
  archive?: Open77Archive | null;
  downloadsDir?: string;
}

const OPEN77_WAIT_LIMIT_MS = 30 * 60 * 1000;

const DEFAULT_PORT: Record<Game, string> = { fivem: "30120", redm: "30120", open77: "11778" };

interface CreateDefaults {
  baseDir?: string;
  port?: number;
  maxSlots?: number;
  build?: "legacy" | "enhanced";
  installVcRedist?: boolean;
  downloadArtifacts?: boolean;
}

interface BuildOption {
  id: Build;
  title: string;
  subtitle: string;
  image: string;
  hint: string;
}

const BUILDS: BuildOption[] = [
  {
    id: "legacy",
    title: "Legacy",
    subtitle: "FXServer.exe",
    image: "/fivem/legacy.png",
    hint: msg("El binario de siempre: compatible con todo lo publicado hasta hoy."),
  },
  {
    id: "enhanced",
    title: msg("GTAV Enhanced"),
    subtitle: "cfx-server.exe",
    image: "/fivem/enhanced.png",
    hint: msg("Otro binario que carga el último gamebuild (The Kortz Center Heist). Los clientes deben entrar con la versión Enhanced."),
  },
];

interface FrameworkOption {
  id: "standalone" | "qbcore" | "esx";
  name: string;
  description: string;
  resourceCount: number;
  database: string | null;
  needsDatabase: boolean;
}

interface DbSetup {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

interface CreateServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentOnline: boolean;
  onCreated: (result: {
    cfgPath: string;
    serverDataPath?: string;
    game?: Game;
    serverId?: string;
  }) => Promise<void>;
}

export function CreateServerDialog({
  open,
  onOpenChange,
  agentOnline,
  onCreated,
}: CreateServerDialogProps) {
  const [game, setGame] = useState<Game>("fivem");
  const [build, setBuild] = useState<Build>("legacy");
  const [newDir, setNewDir] = useState("");
  const [newName, setNewName] = useState("");
  const [newSlots, setNewSlots] = useState("32");
  const [newPort, setNewPort] = useState("30120");
  const [newKey, setNewKey] = useState("");
  const [o77Key, setO77Key] = useState("");
  const [o77Visibility, setO77Visibility] = useState<"public" | "private">("public");
  const [o77Endpoint, setO77Endpoint] = useState("");
  const [o77Db, setO77Db] = useState("");
  const [o77Archive, setO77Archive] = useState<Open77Archive | null>(null);
  const [o77DownloadsDir, setO77DownloadsDir] = useState("");
  const [o77Unsupported, setO77Unsupported] = useState(false);
  const [o77Wait, setO77Wait] = useState<{ since: number; dir: string } | null>(null);
  const [o77Extracting, setO77Extracting] = useState(false);
  const [o77Extracted, setO77Extracted] = useState<{ from: string; dir: string } | null>(null);
  const [o77Error, setO77Error] = useState<string | null>(null);
  const [installVcRedist, setInstallVcRedist] = useState(true);
  const [downloadArtifacts, setDownloadArtifacts] = useState(true);

  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [framework, setFramework] = useState<FrameworkOption["id"] | null>(null);
  const [createDb, setCreateDb] = useState(true);
  const [db, setDb] = useState<DbSetup>({
    host: "127.0.0.1",
    port: "3306",
    user: "root",
    password: "",
    database: "",
  });
  const [dbTesting, setDbTesting] = useState(false);
  const frameworkLoaded = React.useRef(false);
  const [dbTest, setDbTest] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`${AGENT_URL}/api/config/create`)
      .then((res) => res.json())
      .then((data: { success?: boolean; create?: CreateDefaults }) => {
        if (cancelled || !data?.create) return;
        const create = data.create;
        setNewDir((prev) => (prev.trim() || !create.baseDir ? prev : create.baseDir));
        setNewSlots(String(create.maxSlots || 32));
        setNewPort(String(create.port || 30120));
        setBuild(create.build === "enhanced" ? "enhanced" : "legacy");
        if (typeof create.installVcRedist === "boolean") setInstallVcRedist(create.installVcRedist);
        if (typeof create.downloadArtifacts === "boolean") setDownloadArtifacts(create.downloadArtifacts);
      })
      .catch(() => {});

    fetch(`${AGENT_URL}/api/server/frameworks`)
      .then((res) => res.json())
      .then((data: { success?: boolean; frameworks?: FrameworkOption[] }) => {
        if (cancelled || !Array.isArray(data?.frameworks)) return;
        setFrameworks(data.frameworks);
        if (!frameworkLoaded.current) {
          frameworkLoaded.current = true;
          setFramework("standalone");
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedFramework = frameworks.find((f) => f.id === framework) ?? null;
  const isOpen77 = game === "open77";

  const chooseGame = (next: Game) => {
    setNewPort((prev) => (prev === DEFAULT_PORT[game] ? DEFAULT_PORT[next] : prev));
    setGame(next);
  };

  const chooseFramework = (next: FrameworkOption) => {
    setFramework(next.id);
    setDb((prev) => {
      const suggested = !prev.database.trim() || prev.database === selectedFramework?.database;
      return suggested ? { ...prev, database: next.database ?? "" } : prev;
    });
  };

  const testDb = async () => {
    setDbTesting(true);
    setDbTest(null);
    try {
      const res = await fetch(`${AGENT_URL}/api/db/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: db.host,
          port: Number(db.port) || 3306,
          user: db.user,
          password: db.password,
          database: "",
        }),
      });
      const data = await res.json();
      setDbTest({
        ok: Boolean(data.success),
        message: data.success
          ? t("Conexión correcta: MySQL {valor}", { valor: data.details?.version ?? "" })
          : data.message || t("No se pudo conectar."),
      });
    } catch {
      setDbTest({ ok: false, message: t("El agente VXCore no responde.") });
    } finally {
      setDbTesting(false);
    }
  };

  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const selectedGame = GAMES.find((g) => g.id === game) ?? GAMES[0];
  const selectedBuild = BUILDS.find((b) => b.id === build) ?? BUILDS[1];

  const close = () => {
    if (creating) return;
    onOpenChange(false);
    setCreateError(null);
    setCreateStep(null);
    setO77Wait(null);
    setO77Error(null);
  };

  const o77Detect = isOpen77 && !o77Unsupported && agentIsOnThisMachine();

  const extractOpen77 = async (archive: Open77Archive, targetDir: string) => {
    setO77Wait(null);
    setO77Extracting(true);
    setO77Error(null);
    try {
      const res = await fetch(`${AGENT_URL}/api/open77/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivePath: archive.path, targetDir: targetDir.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.success) {
        setO77Error(data.error || t("No se pudo descomprimir el servidor de Open77."));
        return;
      }
      setNewDir(data.serverDir);
      setO77Extracted({ from: archive.path, dir: data.serverDir });
    } catch {
      setO77Error(t("El agente VXCore no responde."));
    } finally {
      setO77Extracting(false);
    }
  };

  const onArchiveChecked = useEffectEvent((status: number, data: Open77ArchiveCheck) => {
    if (status === 403 || data.supported === false) {
      setO77Unsupported(true);
      setO77Wait(null);
      return;
    }
    if (!data.success) return;

    const archive = data.archive ?? null;
    setO77Archive(archive);
    setO77DownloadsDir(data.downloadsDir ?? "");
    if (!o77Wait) return;
    if (Date.now() - o77Wait.since > OPEN77_WAIT_LIMIT_MS) {
      setO77Wait(null);
      return;
    }
    if (!archive || Date.parse(archive.downloadedAt) < o77Wait.since - 10_000) return;
    if (newDir === o77Wait.dir) {
      void extractOpen77(archive, o77Wait.dir);
    } else {
      setO77Wait(null);
    }
  });

  useEffect(() => {
    if (!open || !o77Detect || !agentOnline) return;
    let stopped = false;
    const check = () =>
      fetch(`${AGENT_URL}/api/open77/archive`)
        .then(async (res) => ({ status: res.status, data: (await res.json()) as Open77ArchiveCheck }))
        .then(({ status, data }) => {
          if (!stopped) onArchiveChecked(status, data);
        })
        .catch(() => {});
    check();
    const timer = o77Wait ? setInterval(check, 3000) : undefined;
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [open, o77Detect, agentOnline, o77Wait]);

  const waitForOpen77Download = () => {
    setO77Error(null);
    setO77Wait({ since: Date.now(), dir: newDir });
  };

  const downloadOpen77 = () => {
    window.open(OPEN77_HOST_URL, "_blank", "noopener,noreferrer");
    waitForOpen77Download();
  };

  const o77Pending = o77Archive && o77Extracted?.from !== o77Archive.path ? o77Archive : null;

  const o77HostLink = (
    <a
      href={OPEN77_HOST_URL}
      target="_blank"
      rel="noreferrer noopener"
      onClick={o77Detect ? waitForOpen77Download : undefined}
      className="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline"
    >
      open2077.net/host <ExternalLink className="size-3" />
    </a>
  );

  const createOpen77 = async () => {
    if (!newDir.trim()) return setCreateError(t("Indica la carpeta donde descomprimiste el servidor de Open77."));
    if (!/^op77_live_[A-Za-z0-9_-]{8,}$/.test(o77Key.trim())) {
      return setCreateError(t("Pega tu clave de licencia de Open77 (empieza por op77_live_)."));
    }

    setCreating(true);
    setCreateStep(t("Preparando el servidor de Open77…"));
    try {
      const res = await fetch(`${AGENT_URL}/api/open77/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverDir: newDir.trim(),
          name: newName.trim(),
          port: Number(newPort) || 11778,
          maxPlayers: Number(newSlots) || 32,
          visibility: o77Visibility,
          publicEndpoint: o77Endpoint.trim(),
          licenseKey: o77Key.trim(),
          databaseConnection: o77Db.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setCreateError(data.error || data.message || t("No se pudo crear el servidor."));
        return;
      }
      await onCreated({
        cfgPath: data.server?.cfgPath,
        serverDataPath: data.server?.serverDataPath,
        game: "open77",
        serverId: data.server?.id,
      });
      setO77Key("");
      setO77Db("");
      setNewDir("");
      setNewName("");
      setO77Extracted(null);
      onOpenChange(false);
    } catch {
      setCreateError(t("El agente VXCore no responde."));
    } finally {
      setCreating(false);
      setCreateStep(null);
    }
  };

  const createServer = async () => {
    setCreateError(null);
    if (isOpen77) return createOpen77();

    if (!newDir.trim()) return setCreateError(t("Elige una carpeta vacía donde crear el servidor."));
    if (!newKey.trim()) return setCreateError(t("Pega tu clave de servidor de Cfx.re."));

    setCreating(true);
    setCreateStep(t("Empezando…"));

    const socket = connectAgentSocket({ transports: ["websocket", "polling"] });
    socket.on(
      "provision-progress",
      (event: { id: string; step: string }) => {
        if (event.id === "new-server" || event.id === "new-server-full") setCreateStep(event.step);
      }
    );

    try {
      const useFull = Boolean(framework && framework !== "standalone") || Boolean(framework && createDb && selectedFramework?.needsDatabase);
      const endpoint = useFull ? "/api/server/create-full" : "/api/server/create";
      const res = await fetch(`${AGENT_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetDir: newDir.trim(),
          hostname: newName.trim(),
          maxClients: Number(newSlots) || 32,
          port: Number(newPort) || 30120,
          licenseKey: newKey.trim(),
          game,
          build,
          autoInstall: { vcRedist: installVcRedist, artifacts: downloadArtifacts },
          framework: useFull ? framework : undefined,
          database: useFull ? db.database.trim() || undefined : undefined,
          importSql: useFull ? createDb : undefined,
          dbConfig:
            useFull && createDb && selectedFramework?.needsDatabase
              ? {
                  host: db.host.trim(),
                  port: Number(db.port) || 3306,
                  user: db.user.trim(),
                  password: db.password,
                }
              : undefined,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setCreateError(data.message || data.error || t("No se pudo crear el servidor."));
        return;
      }

      await onCreated({ cfgPath: data.cfgPath, serverDataPath: data.serverDataPath });
      onOpenChange(false);
    } catch {
      setCreateError(t("El agente VXCore no responde."));
    } finally {
      socket.close();
      setCreating(false);
      setCreateStep(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="size-5 text-primary" />
            {t("Crear servidor desde cero")}
          </DialogTitle>
          <DialogDescription>
            {isOpen77
              ? t("VXCore prepara tu servidor de Cyberpunk 2077: escribe el server.jsonc, guarda la clave de licencia aparte y lo arranca con RCON para ver estado, jugadores y consola.")
              : t("VXCore instala lo que falte —runtime de Visual C++, artifacts con sus DLLs, framework (QBCore, ESX o standalone) y su base de datos MySQL—, escribe el server.cfg y deja VXCore dentro. Solo necesitas la clave de keymaster.")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5 py-1">
          <div className="space-y-2">
            <Label className="text-base font-medium text-foreground">{t("Juego")}</Label>
            <div className="grid grid-cols-3 gap-3">
              {GAMES.map((option) => {
                const selected = game === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseGame(option.id)}
                    disabled={creating || o77Extracting}
                    aria-pressed={selected}
                    className={cn(
                      "group relative flex aspect-video flex-col justify-end overflow-hidden rounded-lg border text-left disabled:cursor-not-allowed disabled:opacity-60",
                      selected
                        ? "border-foreground/90 ring-2 ring-foreground/70"
                        : "border-border hover:border-foreground/40"
                    )}
                  >
                    {option.image ? (
                      <>
                        <Image
                          src={option.image}
                          alt={`${t(option.title)} — ${t(option.subtitle)}`}
                          width={640}
                          height={360}
                          unoptimized
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-zinc-700/50 via-zinc-900 to-black" />
                    )}
                    <span className="relative z-10 p-2.5">
                      <span className="block text-sm leading-tight font-semibold text-white">
                        {t(option.title)}
                      </span>
                      <span className="block truncate text-[11px] text-white/75">
                        {t(option.subtitle)}
                      </span>
                    </span>
                    {selected && (
                      <span className="absolute top-2 right-2 z-10 flex size-5 items-center justify-center rounded-full bg-white text-black shadow">
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {!isOpen77 && (
          <div className="space-y-2">
            <Label className="text-base font-medium text-foreground">{t("Framework")}</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {(frameworks.length > 0
                ? frameworks
                :
                  [
                    { id: "standalone" as const, name: "Standalone", description: "", resourceCount: 0, database: null, needsDatabase: false },
                    { id: "qbcore" as const, name: "QBCore", description: "", resourceCount: 0, database: "qbcore", needsDatabase: true },
                    { id: "esx" as const, name: "ESX Legacy", description: "", resourceCount: 0, database: "esx_legacy", needsDatabase: true },
                  ] as FrameworkOption[]
              ).map((option) => {
                const selected = framework === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseFramework(option)}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                      selected
                        ? "border-foreground/90 ring-2 ring-foreground/70 bg-muted/30"
                        : "border-border hover:border-foreground/40"
                    )}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <Puzzle className="size-4 shrink-0 text-primary" />
                      <span className="flex-1 truncate text-sm font-semibold">{option.name}</span>
                      {selected && <Check className="size-3.5 shrink-0" />}
                    </span>
                    {option.description && (
                      <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {t(option.description)}
                      </span>
                    )}
                    <span className="mt-auto text-[10px] text-muted-foreground">
                      {option.resourceCount > 0 ? t("{resourceCount} recursos", { resourceCount: option.resourceCount }) : ""}
                      {option.needsDatabase ? t(" · base de datos") : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {!isOpen77 && selectedFramework?.needsDatabase && (
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-1.5">
                    <Database className="size-4" />
                    {t("Base de datos de {name}", { name: selectedFramework.name })}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("VXCore crea la base en tu MySQL e importa las tablas del framework. Sin esto el servidor arranca con errores desde el primer minuto.")}
                  </p>
                </div>
                <Switch checked={createDb} onCheckedChange={(checked) => setCreateDb(Boolean(checked))} />
              </div>

              {createDb && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="create-db-host">{t("Servidor MySQL")}</Label>
                      <Input
                        id="create-db-host"
                        value={db.host}
                        onChange={(e) => setDb((prev) => ({ ...prev, host: e.target.value }))}
                        placeholder="127.0.0.1"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="create-db-port">{t("Puerto")}</Label>
                      <Input
                        id="create-db-port"
                        value={db.port}
                        onChange={(e) => setDb((prev) => ({ ...prev, port: e.target.value.replace(/\D/g, "") }))}
                        inputMode="numeric"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="create-db-user">{t("Usuario")}</Label>
                      <Input
                        id="create-db-user"
                        value={db.user}
                        onChange={(e) => setDb((prev) => ({ ...prev, user: e.target.value }))}
                        placeholder="root"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="create-db-pass">{t("Contraseña")}</Label>
                      <Input
                        id="create-db-pass"
                        type="password"
                        value={db.password}
                        onChange={(e) => setDb((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder={t("(vacía si no tiene)")}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label htmlFor="create-db-name">{t("Nombre de la base")}</Label>
                      <Input
                        id="create-db-name"
                        value={db.database}
                        onChange={(e) => setDb((prev) => ({ ...prev, database: e.target.value }))}
                        placeholder={selectedFramework.database ?? "fivem_db"}
                        className="font-mono text-xs"
                      />
                    </div>
                    <Button variant="outline" onClick={testDb} disabled={dbTesting || !db.user.trim()}>
                      {dbTesting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      {t("Probar conexión")}
                    </Button>
                  </div>
                  {dbTest && (
                    <p
                      className={cn(
                        "flex items-start gap-1.5 text-xs",
                        dbTest.ok ? "text-emerald-400" : "text-amber-400"
                      )}
                    >
                      {dbTest.ok ? <Check className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
                      {t(dbTest.message)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("Se conecta con esta cuenta para crear")}{" "}<code className="font-mono">{db.database || selectedFramework.database}</code>{" "}{t("e importar el SQL del framework. La contraseña no se guarda: sólo se usa durante la creación.")}
                  </p>
                </>
              )}
              {!createDb && (
                <p className="text-xs text-amber-400">
                  {t("Sin crear la base, el cfg apuntará a")}{" "}<code className="font-mono">{db.database || selectedFramework.database}</code>{t(": créala tú en tu hosting o MySQL antes de arrancar, o el framework fallará al conectar.")}
                </p>
              )}
            </div>
          )}

          {game === "fivem" && (
          <div className="space-y-2">
            <Label className="text-base font-medium text-foreground">{t("Versión del servidor")}</Label>
            <div className="grid grid-cols-2 gap-3">
              {BUILDS.map((option) => {
                const selected = build === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setBuild(option.id)}
                    aria-pressed={selected}
                    className={cn(
                      "group relative flex aspect-video flex-col justify-end overflow-hidden rounded-lg border text-left",
                      selected
                        ? "border-foreground/90 ring-2 ring-foreground/70"
                        : "border-border hover:border-foreground/40"
                    )}
                  >
                    <Image
                      src={option.image}
                      alt={t("FiveM para {title}", { title: option.title })}
                      width={640}
                      height={360}
                      unoptimized
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
                    <span className="relative z-10 p-2.5">
                      <span className="block text-sm leading-tight font-semibold text-white">
                        {t(option.title)}
                      </span>
                      <span className="block font-mono text-[11px] text-white/75">
                        {t(option.subtitle)}
                      </span>
                    </span>
                    {selected && (
                      <span className="absolute top-2 right-2 z-10 flex size-5 items-center justify-center rounded-full bg-white text-black shadow">
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{t(selectedBuild.hint)}</p>
          </div>
          )}

          {isOpen77 && (
            <div className="space-y-1 rounded-lg border border-yellow-400/30 bg-yellow-400/5 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{t("Antes de empezar")}</p>
              {o77Detect ? (
                <>
                  <p>
                    {t("El servidor dedicado se descarga de")} {o77HostLink}{" "}
                    {t("con una cuenta con acceso Alpha. El equipo no necesita tener Cyberpunk 2077 instalado.")}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1.5" aria-live="polite">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={downloadOpen77}
                      disabled={!agentOnline || creating || o77Extracting}
                    >
                      <Download className="size-4" />
                      {t("Descargar servidor")}
                    </Button>
                    {o77Extracting ? (
                      <span className="flex items-center gap-1.5 text-primary">
                        <Loader2 className="size-3.5 animate-spin" />
                        {t("Descomprimiendo {name}…", { name: o77Archive?.name ?? "" })}
                      </span>
                    ) : o77Wait ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="size-3.5 animate-spin" />
                        {t("Esperando el .zip en {dir}…", { dir: o77DownloadsDir || t("Descargas") })}
                      </span>
                    ) : o77Extracted && !o77Pending ? (
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <Check className="size-3.5" />
                        {t("Descomprimido en {dir}.", { dir: o77Extracted.dir })}
                      </span>
                    ) : null}
                    {o77Pending && !o77Extracting && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {t("{name} está en Descargas.", { name: o77Pending.name })}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => extractOpen77(o77Pending, newDir)}
                          disabled={creating}
                        >
                          {t("Descomprimir")}
                        </Button>
                      </span>
                    )}
                  </div>
                  {o77Error && (
                    <p className="flex items-start gap-1.5 text-destructive">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {o77Error}
                    </p>
                  )}
                  <p className="pt-0.5">
                    {t("Inicia sesión y baja el .zip de Windows: VXCore lo encuentra en Descargas y lo descomprime solo. Si ya lo tienes descomprimido, elige su carpeta abajo.")}
                  </p>
                </>
              ) : (
                <p>
                  {t("Descarga el servidor dedicado desde")} {o77HostLink}{" "}
                  {t("(necesita acceso Alpha) y descomprímelo en una carpeta. El equipo no necesita tener Cyberpunk 2077 instalado.")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="create-dir">
              {isOpen77 ? t("Carpeta del servidor (donde está Open77.Server.exe)") : t("Carpeta donde crearlo")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="create-dir"
                value={newDir}
                onChange={(e) => setNewDir(e.target.value)}
                placeholder="C:\Users\tu-usuario\Desktop\mi-servidor"
                className="font-mono text-xs"
                disabled={o77Extracting}
              />
              <PathPicker
                value={newDir}
                onSelect={setNewDir}
                disabled={o77Extracting}
                mode="directory"
                title={isOpen77 ? t("Carpeta del servidor de Open77") : t("Elige dónde crear el servidor")}
                description={
                  isOpen77
                    ? t("La carpeta donde descomprimiste el servidor dedicado: la que contiene Open77.Server.exe.")
                    : t("Una carpeta vacía. Si ya tiene un server.cfg dentro, no se toca nada.")
                }
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem]">
            <div className="space-y-1.5">
              <Label htmlFor="create-name">{t("Nombre del servidor")}</Label>
              <Input
                id="create-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={isOpen77 ? "Neon District RP" : t("Mi servidor de rol")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-slots">{t("Slots")}</Label>
              <Input
                id="create-slots"
                value={newSlots}
                onChange={(e) => setNewSlots(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-port">{t("Puerto")}</Label>
              <Input
                id="create-port"
                value={newPort}
                onChange={(e) => setNewPort(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="font-mono text-xs"
              />
            </div>
          </div>

          {isOpen77 && (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="o77-endpoint">{t("Dirección pública (opcional)")}</Label>
                  <Input
                    id="o77-endpoint"
                    value={o77Endpoint}
                    onChange={(e) => setO77Endpoint(e.target.value)}
                    placeholder={`play.tudominio.com:${newPort || 11778}`}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Visibilidad")}</Label>
                  <div className="flex gap-1">
                    {(["public", "private"] as const).map((v) => (
                      <Button
                        key={v}
                        type="button"
                        size="sm"
                        variant={o77Visibility === v ? "default" : "outline"}
                        className="flex-1"
                        onClick={() => setO77Visibility(v)}
                      >
                        {v === "public" ? t("Pública") : t("Privada")}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="-mt-3 text-xs text-muted-foreground">
                {t("Es la dirección que reciben los jugadores: tiene que ser accesible desde internet (abre el puerto UDP en tu router o VPS). Privada: inscrito pero fuera de la lista pública.")}
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="o77-key" className="flex items-center gap-1.5">
                  <KeyRound className="size-4" />
                  {t("Clave de licencia de Open77")}
                </Label>
                <Input
                  id="o77-key"
                  type="password"
                  autoComplete="off"
                  value={o77Key}
                  onChange={(e) => setO77Key(e.target.value)}
                  placeholder="op77_live_..."
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t("Créala en")}{" "}
                  <a
                    href="https://open2077.net/account/keys"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    open2077.net/account/keys
                  </a>{" "}
                  {t("(sólo se muestra una vez). VXCore la guarda fuera del server.jsonc y se la pasa al servidor al arrancar.")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="o77-db" className="flex items-center gap-1.5">
                  <Database className="size-4" />
                  {t("Base de datos MySQL/MariaDB (opcional)")}
                </Label>
                <Input
                  id="o77-db"
                  type="password"
                  autoComplete="off"
                  value={o77Db}
                  onChange={(e) => setO77Db(e.target.value)}
                  placeholder="Server=127.0.0.1;Port=3306;Database=open77;User ID=open77;Password=...;"
                  className="font-mono text-xs"
                />
              </div>
            </>
          )}

          {!isOpen77 && (
          <div className="space-y-2">
            <Label className="text-base font-medium text-foreground">{t("Instalación automática")}</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t("Instalar Visual C++ si falta")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("Windows pedirá permiso una vez. Sin este runtime FXServer no arranca, ni FiveM ni RedM.")}
                  </p>
                </div>
                <Switch
                  checked={installVcRedist}
                  onCheckedChange={(checked) => setInstallVcRedist(Boolean(checked))}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t("Descargar artifacts si falta el binario")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("~100 MB desde Cfx.re. Las DLLs del servidor viajan dentro de ese paquete.")}
                  </p>
                </div>
                <Switch
                  checked={downloadArtifacts}
                  onCheckedChange={(checked) => setDownloadArtifacts(Boolean(checked))}
                />
              </div>
            </div>
          </div>
          )}

          {!isOpen77 && (
          <div className="space-y-1.5">
            <Label htmlFor="create-key">{t("Clave de servidor de Cfx.re")}</Label>
            <Input
              id="create-key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="cfxk_..."
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t("Es gratis y tarda un minuto:")}{" "}
              <a
                href="https://keymaster.fivem.net"
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary underline-offset-4 hover:underline"
              >
                {t("keymaster.fivem.net")}
              </a>{" "}{t("→ New server key. Sirve igual para FiveM y RedM.")}
            </p>
          </div>
          )}

          {createStep && (
            <p className="flex items-center gap-2 text-sm text-primary">
              <Loader2 className="size-4 animate-spin" />
              {createStep}
            </p>
          )}

          {createError && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {createError}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="destructive" onClick={close} disabled={creating}>
            {t("Cancelar")}
          </Button>
          <Button onClick={createServer} disabled={creating || o77Extracting || !agentOnline}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {creating ? t("Creando…") : t("Crear servidor de {title}", { title: selectedGame.title })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
