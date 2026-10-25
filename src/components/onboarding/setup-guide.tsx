"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  FolderInput,
  FolderSearch,
  Loader2,
  PlugZap,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { AGENT_URL } from "@/lib/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerContext } from "@/context/server-context";
import { PathPicker } from "@/components/common/path-picker";
import { CreateServerDialog } from "@/components/onboarding/create-server-dialog";
import { RequirementsGate } from "@/components/onboarding/requirements-gate";
import { TextReveal } from "@/components/motion/text-reveal";
import { TiltCard } from "@/components/motion/tilt-card";
import { parseServerCfg } from "@/lib/cfg-parser";
import { EASE_OUT } from "@/lib/ease";
import { msg, t } from "@/i18n";
import { cn } from "@/lib/utils";

interface Candidate {
  id: string;
  name?: string;
  ip?: string;
  maxClients?: number;
  cfgPath: string;
  serverDataPath: string;
  rawContent: string;
}

type Vista = "elegir" | "importar";

const PUNTOS_IMPORTAR = [
  msg("Detecta los server.cfg de este equipo"),
  msg("Tu servidor se queda tal cual está"),
  msg("Recursos, consola y jugadores al momento"),
];

const PUNTOS_CREAR = [
  msg("Recursos base de Cfx.re y server.cfg comentado"),
  msg("La versión de FXServer que elijas"),
  msg("VXCore ya instalado dentro"),
];

const PANEL = "rounded-2xl border border-white/10 bg-black/45 backdrop-blur-xl";

export function SetupGuide() {
  const { addServerFromConfig, agentOnline, refreshServers, setActiveServerId } = useServerContext();
  const reduce = useReducedMotion();

  const [vista, setVista] = useState<Vista>("elegir");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [scanning, setScanning] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  const [manualPath, setManualPath] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/server/discover`);
      const data = await res.json();
      setCandidates(data.success ? data.candidates : []);
    } catch {
      setCandidates([]);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!agentOnline) return;
    const id = setTimeout(() => void scan(), 0);
    return () => clearTimeout(id);
  }, [agentOnline, scan]);

  const buscando = agentOnline && scanning;

  const add = async (candidate: Candidate) => {
    setAdding(candidate.cfgPath);
    try {
      await addServerFromConfig(parseServerCfg(candidate.rawContent), candidate.cfgPath);
      toast.success(t("«{nombre}» añadido.", { nombre: candidate.name || t("Servidor") }));
      await refreshServers();
    } catch {
      toast.error(t("No se pudo añadir el servidor."));
    } finally {
      setAdding(null);
    }
  };

  const addManual = async () => {
    const cfgPath = manualPath.trim();
    setManualError(null);

    if (!cfgPath) return;
    if (!/\.cfg$/i.test(cfgPath)) {
      setManualError(t("La ruta tiene que apuntar a un fichero .cfg"));
      return;
    }

    setAdding(cfgPath);
    try {
      const res = await fetch(`${AGENT_URL}/api/server/read-cfg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfgPath }),
      });
      const data = await res.json();

      if (!data.success) {
        setManualError(data.error || t("No se pudo leer ese server.cfg"));
        return;
      }

      await addServerFromConfig(parseServerCfg(data.rawContent), cfgPath);
      toast.success(t("Servidor añadido."));
      await refreshServers();
    } catch {
      setManualError(t("El agente VXCore no responde."));
    } finally {
      setAdding(null);
    }
  };

  const detectados =
    candidates.length === 1
      ? t("1 detectado en este equipo")
      : t("{n} detectados en este equipo", { n: candidates.length });

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {vista === "elegir" ? (
          <motion.section
            key="elegir"
            initial={reduce ? false : { opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="flex flex-col items-center"
          >
            <TextReveal
              as="h1"
              text={t("¿Ya tienes un servidor?")}
              className="text-center text-4xl font-semibold tracking-[-0.04em] md:text-6xl"
            />
            <TextReveal
              as="p"
              text={t("VXCore se adapta a lo que tengas: trae tu servidor tal cual o te montamos uno nuevo en un par de minutos.")}
              className="mt-5 max-w-2xl text-balance text-center text-base text-muted-foreground md:text-lg"
              stagger={0.02}
              delay={0.25}
              blur={6}
              yOffset="30%"
            />

            {!agentOnline && <AgenteCaido className="mt-8" />}

            <div className="mt-12 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
              <OpcionServidor
                indice={0}
                icono={<FolderInput className="size-6" />}
                titulo={t("Importar mi servidor")}
                descripcion={t("Ya tengo un servidor de FiveM en este equipo y quiero gestionarlo desde VXCore.")}
                puntos={PUNTOS_IMPORTAR}
                accion={t("Importar")}
                insignia={
                  buscando ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="size-3 animate-spin" />
                      {t("Buscando…")}
                    </span>
                  ) : candidates.length > 0 ? (
                    detectados
                  ) : null
                }
                disabled={!agentOnline}
                onClick={() => setVista("importar")}
              />
              <OpcionServidor
                indice={1}
                icono={<Sparkles className="size-6" />}
                titulo={t("Crear uno nuevo")}
                descripcion={t("Empiezo desde cero. VXCore lo prepara todo y solo tengo que pegar mi clave de keymaster.")}
                puntos={PUNTOS_CREAR}
                accion={t("Crear servidor")}
                disabled={!agentOnline}
                onClick={() => setCreateOpen(true)}
              />
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="importar"
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="mx-auto w-full max-w-3xl"
          >
            <button
              type="button"
              onClick={() => setVista("elegir")}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              {t("Volver")}
            </button>

            <RequirementsGate ignore={["server-cfg"]}>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">{t("Importa tu servidor")}</h1>
            <p className="mt-2 text-muted-foreground">
              {t("Elige uno de los que hemos encontrado o indica dónde está su server.cfg.")}
            </p>

            {!agentOnline && <AgenteCaido className="mt-6" />}

            <div className={cn(PANEL, "mt-8 p-5")}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Search className="size-4 text-white" />
                  {t("Encontrados en este equipo")}
                </h2>
                {!buscando && agentOnline && (
                  <Button variant="ghost" size="sm" onClick={() => void scan()}>
                    {t("Volver a buscar")}
                  </Button>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {buscando && (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t("Buscando…")}
                  </div>
                )}

                {!buscando && candidates.length === 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-muted-foreground">
                    <FolderSearch className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {t("No hemos encontrado ninguno automáticamente. Es lo normal si tu servidor está en una carpeta propia — indícala abajo.")}
                    </span>
                  </div>
                )}

                {!buscando &&
                  candidates.map((candidate, i) => (
                    <motion.div
                      key={candidate.cfgPath}
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.05, ease: EASE_OUT }}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{candidate.name || t("Servidor FiveM")}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{candidate.cfgPath}</p>
                      </div>
                      {candidate.maxClients ? (
                        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                          {t("{n} plazas", { n: candidate.maxClients })}
                        </span>
                      ) : null}
                      <Button
                        size="sm"
                        onClick={() => void add(candidate)}
                        disabled={Boolean(adding)}
                        className="bg-white text-black hover:bg-white/90"
                      >
                        {adding === candidate.cfgPath ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Plus className="size-4" />
                        )}
                        {t("Añadir")}
                      </Button>
                    </motion.div>
                  ))}
              </div>
            </div>

            <div className={cn(PANEL, "mt-4 p-5")}>
              <Label htmlFor="setup-cfg-path" className="text-sm font-semibold">
                {t("O busca tu server.cfg")}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Ábrelo con el explorador, o pega la ruta completa si ya la tienes.")}
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  id="setup-cfg-path"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void addManual()}
                  placeholder="C:\Users\...\mi-servidor\server.cfg"
                  className="border-white/10 bg-black/40 font-mono text-xs"
                />
                <PathPicker
                  value={manualPath}
                  onSelect={setManualPath}
                  mode="file"
                  extensions={["cfg"]}
                  title={t("Busca tu server.cfg")}
                  description={t("Entra en la carpeta de tu servidor y selecciona el fichero server.cfg.")}
                />
                <Button
                  onClick={() => void addManual()}
                  disabled={!manualPath.trim() || Boolean(adding)}
                  className="bg-white text-black hover:bg-white/90"
                >
                  {adding === manualPath.trim() ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {t("Añadir")}
                </Button>
              </div>

              {manualError && (
                <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {manualError}
                </p>
              )}
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t("¿No lo encuentras?")}{" "}
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="font-medium text-white underline-offset-4 hover:underline"
              >
                {t("Crea uno nuevo")}
              </button>
            </p>
            </RequirementsGate>
          </motion.section>
        )}
      </AnimatePresence>

      <CreateServerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agentOnline={agentOnline}
        onCreated={async ({ cfgPath, serverDataPath, game, serverId }) => {
          if (game === "open77") {
            await refreshServers();
            if (serverId) setActiveServerId(serverId);
            toast.success(t("Servidor de Open77 añadido."), { description: serverDataPath });
            return;
          }
          const read = await fetch(`${AGENT_URL}/api/server/read-cfg`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cfgPath }),
          });
          const cfg = await read.json();
          if (cfg.success) {
            await addServerFromConfig(parseServerCfg(cfg.rawContent), cfgPath);
            await refreshServers();
          }

          toast.success(t("Servidor creado y añadido."), { description: serverDataPath });
        }}
      />
    </>
  );
}

function OpcionServidor({
  indice,
  icono,
  titulo,
  descripcion,
  puntos,
  accion,
  insignia,
  disabled,
  onClick,
}: {
  indice: number;
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  puntos: string[];
  accion: string;
  insignia?: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.35 + indice * 0.1, ease: EASE_OUT }}
    >
      <TiltCard max={6} className="h-full rounded-3xl">
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "group relative flex h-full w-full flex-col rounded-3xl border border-white/10 bg-black/45 p-6 text-left outline-none backdrop-blur-xl transition-colors duration-300",
            "hover:border-white/50 hover:bg-white/[0.06]",
            "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-white/30 bg-white/10 text-white shadow-[0_0_30px_-10px_rgba(255,255,255,0.8)]">
              {icono}
            </span>
            {insignia && (
              <span className="rounded-full border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white">
                {insignia}
              </span>
            )}
          </div>

          <h2 className="mt-6 text-2xl font-semibold tracking-tight">{titulo}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{descripcion}</p>

          <ul className="mt-5 space-y-2">
            {puntos.map((punto) => (
              <li key={punto} className="flex items-center gap-2 text-sm text-foreground/85">
                <Check className="size-4 shrink-0 text-white" strokeWidth={2.5} />
                {t(punto)}
              </li>
            ))}
          </ul>

          <span className="mt-8 inline-flex items-center gap-2 self-start rounded-full bg-white/[0.06] px-4 py-2 text-sm font-medium ring-1 ring-white/10 transition-all duration-300 group-hover:bg-white group-hover:text-black group-hover:ring-white">
            {accion}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
        </button>
      </TiltCard>
    </motion.div>
  );
}

function AgenteCaido({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex w-full max-w-2xl items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 backdrop-blur-xl",
        className
      )}
    >
      <PlugZap className="mt-0.5 size-5 shrink-0 text-amber-400" />
      <div className="space-y-1 text-sm">
        <p className="font-medium">{t("El agente VXCore no responde")}</p>
        <p className="text-muted-foreground">
          {t("Es el proceso de VXCore que habla con tu servidor. Reinicia la aplicación y esta pantalla se actualizará sola.")}
        </p>
      </div>
    </div>
  );
}
