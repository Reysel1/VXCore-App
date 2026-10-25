"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDriveDownload,
  Loader2,
  RefreshCcw,
  Search,
  Star,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AGENT_URL } from "@/lib/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { t, msg, intlLocale } from "@/i18n";

type Variant = "legacy" | "enhanced";
type Tag = "recommended" | "latest" | "critical" | "optional";

interface ArtifactBuild {
  build: string;
  date?: string;
  tags: Tag[];
}

interface Catalog {
  variant: Variant;
  builds: ArtifactBuild[];
  recommended?: string;
  latest?: string;
}

interface CurrentBinary {
  path: string;
  variant: Variant;
  build: string | null;
}

const TAGS: Record<Tag, { label: string; className: string; title: string }> = {
  recommended: {
    label: msg("Recomendado"),
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    title: msg("El que Cfx.re recomienda para servidores en producción."),
  },
  latest: {
    label: msg("Último"),
    className: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    title: msg("El más reciente publicado."),
  },
  critical: {
    label: msg("Mínimo"),
    className: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    title: msg("Cfx.re no deja arrancar builds más antiguos que éste."),
  },
  optional: {
    label: msg("Opcional"),
    className: "border-border text-muted-foreground",
    title: msg("Actualización que Cfx.re marca como opcional."),
  },
};

type ArtifactsResult =
  | { ok: true; catalog: Catalog; installed: string[]; current: CurrentBinary | null }
  | { ok: false; error: string };

async function fetchArtifacts(which: Variant): Promise<ArtifactsResult> {
  try {
    const res = await fetch(`${AGENT_URL}/api/artifacts?variant=${which}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { ok: false, error: data.error || t("El agente no pudo consultar a Cfx.re.") };
    }
    return {
      ok: true,
      catalog: data.catalog,
      installed: Array.isArray(data.installed) ? data.installed : [],
      current: data.current ?? null,
    };
  } catch {
    return { ok: false, error: t("El agente VXCore no responde.") };
  }
}

function formatDate(raw?: string): string | null {
  if (!raw) return null;
  const date = new Date(`${raw.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(intlLocale(), { day: "numeric", month: "short", year: "numeric" });
}

export function ArtifactsPanel({
  agentOnline,
  onChanged,
}: {
  agentOnline: boolean;
  onChanged?: () => void;
}) {
  const [variant, setVariant] = useState<Variant>("legacy");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [current, setCurrent] = useState<CurrentBinary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ step: string; percent: number | null } | null>(null);
  const [targetDir, setTargetDir] = useState("");

  const apply = useCallback((result: ArtifactsResult) => {
    if (result.ok) {
      setError(null);
      setCatalog(result.catalog);
      setInstalled(result.installed);
      setCurrent(result.current);
    } else {
      setCatalog(null);
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async (which: Variant) => apply(await fetchArtifacts(which)), [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchArtifacts(variant).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [variant, apply]);

  const switchVariant = (next: Variant) => {
    if (next === variant) return;
    setFilter("");
    setLoading(true);
    setVariant(next);
  };

  const refresh = () => {
    setLoading(true);
    void load(variant);
  };

  useEffect(() => {
    if (!AGENT_URL) return;
    let socket: { on: (event: string, fn: (data: { id?: string; step?: string; percent?: number | null; done?: boolean }) => void) => void; disconnect: () => void } | null = null;
    let closed = false;
    void import("socket.io-client").then(({ io }) => {
      if (closed) return;
      socket = io(AGENT_URL);
      socket.on("provision-progress", (data) => {
        if (data.id !== "fxserver") return;
        setProgress({ step: data.step || t("Trabajando…"), percent: data.percent ?? null });
      });
    });
    return () => {
      closed = true;
      socket?.disconnect();
    };
  }, []);

  const install = async (build: string) => {
    setBusy(build);
    setProgress({ step: t("Preparando el build {build}…", { build }), percent: null });
    try {
      const res = await fetch(`${AGENT_URL}/api/requirements/install/fxserver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant, build, targetDir: targetDir.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || data.message || t("No se pudo instalar."));
      toast.success(t("Build {build} instalado", { build }), { description: t("VXCore arrancará tu servidor con este build.") });
      await load(variant);
      onChanged?.();
    } catch (err) {
      toast.error(t("No se pudo instalar el build {build}", { build }), {
        description: err instanceof Error ? err.message : t("Error desconocido"),
      });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const use = async (build: string) => {
    setBusy(build);
    try {
      const res = await fetch(`${AGENT_URL}/api/artifacts/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant, build }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || t("No se pudo cambiar de build."));
      toast.success(t("Ahora se arranca con el build {build}", { build }));
      await load(variant);
      onChanged?.();
    } catch (err) {
      toast.error(t("No se pudo cambiar de build"), {
        description: err instanceof Error ? err.message : t("Error desconocido"),
      });
    } finally {
      setBusy(null);
    }
  };

  const builds = useMemo(() => catalog?.builds ?? [], [catalog]);
  const visible = useMemo(() => {
    const needle = filter.trim();
    return needle ? builds.filter((b) => b.build.includes(needle)) : builds;
  }, [builds, filter]);

  const featured = useMemo(() => {
    const picks = [catalog?.recommended, catalog?.latest].filter((b, i, all): b is string => !!b && all.indexOf(b) === i);
    return picks
      .map((number) => builds.find((b) => b.build === number))
      .filter((b): b is ArtifactBuild => Boolean(b));
  }, [builds, catalog]);

  const inUse = (build: string) => current?.variant === variant && current.build === build;

  const actionFor = (entry: ArtifactBuild, size: "sm" | "xs" = "xs") => {
    if (inUse(entry.build)) {
      return (
        <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-400">
          <CheckCircle2 className="size-3" />{" "}{t("En uso")}
        </Badge>
      );
    }
    const working = busy === entry.build;
    const disabled = !agentOnline || busy !== null;
    if (installed.includes(entry.build)) {
      return (
        <Button size={size} variant="outline" disabled={disabled} onClick={() => use(entry.build)}>
          {working ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          {t("Usar")}
        </Button>
      );
    }
    return (
      <Button size={size} variant="outline" disabled={disabled} onClick={() => install(entry.build)}>
        {working ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        {t("Descargar")}
      </Button>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDriveDownload className="size-5 text-emerald-400" />{" "}{t("Artifacts de FXServer")}
        </CardTitle>
        <CardDescription>
          Todos los builds que publica Cfx.re. Cada uno se descarga en su carpeta y pasa a ser con el que
          VXCore arranca tu servidor; tus recursos, el cfg y la base de datos no se tocan.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5" role="tablist">
            {(
              [
                { value: "legacy", label: t("FiveM / RedM (Legacy)") },
                { value: "enhanced", label: t("GTAV Enhanced") },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={variant === option.value}
                onClick={() => switchVariant(option.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  variant === option.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(option.label)}
              </button>
            ))}
          </div>

          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
            <RefreshCcw className={cn("size-3.5", loading && "animate-spin")} />{" "}{t("Actualizar lista")}
          </Button>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs">
          <p className="text-muted-foreground">{t("Tu servidor arranca con")}</p>
          {current ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-foreground">
                {current.variant === "enhanced" ? t("GTAV Enhanced") : t("FXServer Legacy")}
                {current.build ? t(" · build {build}", { build: current.build }) : ""}
              </span>
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={current.path}>
                {current.path}
              </span>
            </p>
          ) : (
            <p className="mt-1 font-semibold text-amber-400">
              {t("Ningún binario encontrado: descarga un build para poder arrancar.")}
            </p>
          )}
        </div>

        {variant === "enhanced" && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <p className="leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{t("GTAV Enhanced todavía no descifra Asset Escrow")}</span>{" "}{t("y sólo admite el último gamebuild. Si tu servidor tiene recursos de escrow o fija un build de Legacy, VXCore lo arranca con Legacy aunque tengas Enhanced instalado. Cfx.re sólo publica el build vigente de Enhanced.")}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !catalog ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : catalog ? (
          <>
            {featured.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {featured.map((entry) => (
                  <div
                    key={entry.build}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/10 p-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <Star className="size-3.5 text-amber-400" />{" "}{t("Build {build}", { build: entry.build })}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {entry.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className={cn("text-[10px]", TAGS[tag].className)} title={t(TAGS[tag].title)}>
                            {t(TAGS[tag].label)}
                          </Badge>
                        ))}
                        {formatDate(entry.date) && (
                          <span className="text-[11px] text-muted-foreground">{formatDate(entry.date)}</span>
                        )}
                      </div>
                    </div>
                    {actionFor(entry, "sm")}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {t("Todos los builds")}{" "}<span className="text-muted-foreground">({builds.length})</span>
                </p>
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value.replace(/\D/g, ""))}
                    placeholder={t("Buscar build…")}
                    inputMode="numeric"
                    className="h-8 pl-8 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="max-h-96 divide-y divide-border/40 overflow-y-auto rounded-xl border border-border/50">
                {visible.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">{t("Ningún build coincide con «{filter}».", { filter })}</p>
                ) : (
                  visible.map((entry) => (
                    <div
                      key={entry.build}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-2",
                        inUse(entry.build) && "bg-emerald-500/5"
                      )}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="w-14 font-mono text-sm tabular-nums">{entry.build}</span>
                        <span className="w-24 text-[11px] text-muted-foreground">{formatDate(entry.date) ?? "—"}</span>
                        {entry.tags
                          .filter((tag) => !(tag === "optional" && entry.tags.includes("critical")))
                          .map((tag) => (
                            <Badge key={tag} variant="outline" className={cn("text-[10px]", TAGS[tag].className)} title={t(TAGS[tag].title)}>
                              {t(TAGS[tag].label)}
                            </Badge>
                          ))}
                        {installed.includes(entry.build) && !inUse(entry.build) && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {t("Descargado")}
                          </Badge>
                        )}
                      </div>
                      {actionFor(entry)}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="artifact-dir">{t("Carpeta de destino (opcional)")}</Label>
          <Input
            id="artifact-dir"
            value={targetDir}
            onChange={(event) => setTargetDir(event.target.value)}
            placeholder={t("Vacío = %LOCALAPPDATA%\\VXCore\\{valor}\\<build>", { valor: variant === "enhanced" ? "FXServer-Enhanced" : "FXServer" })}
            className="font-mono text-xs"
          />
        </div>

        {progress && (
          <div className="space-y-2 rounded-xl border border-border/50 bg-muted/10 p-4">
            <div className="flex justify-between gap-3 text-xs">
              <span>{t(progress.step)}</span>
              <span>{progress.percent === null ? t("En curso") : `${progress.percent}%`}</span>
            </div>
            <Progress value={progress.percent ?? 12} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
