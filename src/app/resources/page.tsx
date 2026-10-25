"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Boxes,
  CheckCircle2,
  Cpu,
  HardDrive,
  Layers,
  Loader2,
  Package,
  Pause,
  Play,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { AGENT_URL, sendServerCommand } from "@/lib/agent";
import { formatBytes } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerContext, type ServerNode } from "@/context/server-context";
import { toast } from "sonner";
import { t, intlLocale } from "@/i18n";

interface DiskResource {
  name: string;
  category: string;
  groups?: string[];
  path?: string;
  status: "active" | "stopped";
  viaGroup?: string | null;
  hasManifest?: boolean;
  size?: number;
  files?: number;
}

interface DiskCategory {
  name: string;
  chain: string[];
  count: number;
  ambiguous: boolean;
  ensured: boolean;
}

const chainKey = (chain: string[]) => chain.join("/");

function categoriesFrom(list: DiskResource[], ensured: string[]): DiskCategory[] {
  const byChain = new Map<string, { name: string; chain: string[]; count: number }>();

  for (const resource of list) {
    const chain = resource.groups ?? [];
    for (let depth = 1; depth <= chain.length; depth++) {
      const slice = chain.slice(0, depth);
      const key = chainKey(slice).toLowerCase();
      const entry = byChain.get(key) ?? { name: slice[depth - 1], chain: slice, count: 0 };
      entry.count++;
      byChain.set(key, entry);
    }
  }

  const repeated = new Map<string, number>();
  for (const entry of byChain.values()) {
    const key = entry.name.toLowerCase();
    repeated.set(key, (repeated.get(key) ?? 0) + 1);
  }

  const ensuredLower = new Set(ensured.map((g) => g.toLowerCase()));
  return Array.from(byChain.values())
    .map((entry) => ({
      ...entry,
      ambiguous: (repeated.get(entry.name.toLowerCase()) ?? 0) > 1,
      ensured: ensuredLower.has(entry.name.toLowerCase()),
    }))
    .sort((a, b) => chainKey(a.chain).localeCompare(chainKey(b.chain), "es"));
}

function fromRegistry(list: ServerNode["resources"] | undefined): DiskResource[] {
  return (list ?? []).map((entry) => ({
    name: entry.name,
    category: entry.type || "Script",
    status: entry.status,
  }));
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-foreground",
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function ResourcesPage() {
  const { activeServer, loading, fxUsage } = useServerContext();

  const initialQuery = useSearchParams().get("q") ?? "";

  const [resources, setResources] = useState<DiskResource[]>([]);
  const [categories, setCategories] = useState<DiskCategory[]>([]);
  const [ensuredGroups, setEnsuredGroups] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const cfgPath = activeServer?.cfgPath;
  const serverDataPath = activeServer?.serverDataPath;

  const [isScanning, setIsScanning] = useState(Boolean(cfgPath || serverDataPath));
  const [scannedFor, setScannedFor] = useState({ cfgPath, serverDataPath });
  if (scannedFor.cfgPath !== cfgPath || scannedFor.serverDataPath !== serverDataPath) {
    setScannedFor({ cfgPath, serverDataPath });
    if (cfgPath || serverDataPath) setIsScanning(true);
  }

  const activeRef = useRef(activeServer);
  useEffect(() => {
    activeRef.current = activeServer;
  }, [activeServer]);

  const fetchResources = useCallback(
    (withSize: boolean) => {
      if (!cfgPath && !serverDataPath) return Promise.resolve();
      return fetch(`${AGENT_URL}/api/server/resources-on-disk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverDataPath, cfgPath, withSize }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.resources) && data.resources.length > 0) {
            const ensured: string[] = data.ensuredGroups ?? [];
            setResources(data.resources ?? []);
            setEnsuredGroups(ensured);
            setCategories(
              Array.isArray(data.categories) && data.categories.length > 0
                ? data.categories
                : categoriesFrom(data.resources, ensured)
            );
          } else if (!withSize) {
            setResources(fromRegistry(activeRef.current?.resources));
            setCategories([]);
          }
        })
        .catch(() => {
          if (!withSize) {
            setResources(fromRegistry(activeRef.current?.resources));
            setCategories([]);
          }
        })
        .finally(() => {
          if (!withSize) setIsScanning(false);
        });
    },
    [cfgPath, serverDataPath]
  );

  const scan = useCallback(async () => {
    await fetchResources(false);
    await fetchResources(true);
  }, [fetchResources]);

  const reload = useCallback(() => {
    if (cfgPath || serverDataPath) setIsScanning(true);
    return scan();
  }, [cfgPath, serverDataPath, scan]);

  useEffect(() => {
    void scan();
  }, [scan]);

  const chips = useMemo(() => {
    const list = [{ key: "all", label: t("Todos"), title: t("Todos los recursos") }];

    if (resources.some((r) => (r.groups ?? []).length === 0)) {
      list.push({ key: "root", label: t("Raíz"), title: t("Recursos sueltos en resources/") });
    }

    for (const cat of categories) {
      list.push({
        key: chainKey(cat.chain),
        label: cat.ambiguous ? cat.chain.join(" › ") : cat.name,
        title: `resources/${cat.chain.map((g) => `[${g}]`).join("/")} · ${cat.count} recurso(s)`,
      });
    }

    return list;
  }, [categories, resources]);

  const selectedGroup = useMemo(
    () => categories.find((c) => chainKey(c.chain) === selectedCategory) ?? null,
    [categories, selectedCategory]
  );

  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return resources.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle)) return false;

      const chain = r.groups ?? [];
      if (selectedCategory === "root") return chain.length === 0;

      if (selectedGroup) {
        return selectedGroup.chain.every(
          (group, i) => group.toLowerCase() === chain[i]?.toLowerCase()
        );
      }

      return true;
    });
  }, [resources, searchQuery, selectedCategory, selectedGroup]);

  const totals = useMemo(
    () =>
      resources.reduce(
        (acc, r) => ({
          active: acc.active + (r.status === "active" ? 1 : 0),
          size: acc.size + (r.size ?? 0),
          files: acc.files + (r.files ?? 0),
        }),
        { active: 0, size: 0, files: 0 }
      ),
    [resources]
  );

  const applyChanges = async (
    changes: { name: string; action: "start" | "stop" }[],
    groups: { name: string; action: "start" | "stop" }[] = []
  ) => {
    if (changes.length === 0 && groups.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/server/bulk-resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfgPath, serverDataPath, resources: changes, groups }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(t("No se pudieron aplicar los cambios"), { description: data.error });
        return;
      }

      toast.success(data.message, {
        description: data.live
          ? undefined
          : t("El servidor está parado: los cambios entran en el próximo arranque."),
      });
      setSelection(new Set());
      await reload();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setBusy(false);
    }
  };

  const restartResource = async (name: string) => {
    const result = await sendServerCommand(`restart ${name}`);
    if (result.success) toast.success(t("{name} reiniciado.", { name }));
    else toast.error(t("No se pudo reiniciar"), { description: result.message });
  };

  const refreshAll = async () => {
    await sendServerCommand("refresh");
    await reload();
  };

  const toggleSelected = (name: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("Cargando recursos...")}</p>
      </div>
    );
  }

  if (!activeServer) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        <Package className="size-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {t("Añade o selecciona un servidor para ver sus recursos.")}
        </p>
        <Button render={<Link href="/servers" />}>{t("Ir a Servidores")}</Button>
      </div>
    );
  }

  const online = activeServer.status === "online";
  const selectedNames = Array.from(selection);

  return (
    <div className="mx-auto max-w-7xl flex-1 space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold tracking-tight">{t("Recursos del Servidor")}</h2>
            <Badge
              variant="outline"
              className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            >
              {t("{active} activos / {length}", { active: totals.active, length: resources.length })}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {t("Instalados en")}{" "}
            <span className="font-mono text-xs text-primary">{activeServer.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={isScanning} className="gap-1.5">
            <RotateCcw className={`size-3.5 ${isScanning ? "animate-spin" : ""}`} />
            {t("Recargar (refresh)")}
          </Button>
          <Button render={<Link href="/marketplace" />} className="bg-primary hover:bg-primary/90">
            {t("Explorar Recursos")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Cpu}
          label={t("CPU de FXServer")}
          value={fxUsage ? `${fxUsage.cpu.toFixed(1)} %` : online ? "…" : "—"}
          hint={online ? t("{valor} proceso(s)", { valor: fxUsage?.pids.length ?? 0 }) : t("Servidor detenido")}
          tone={fxUsage && fxUsage.cpu > 80 ? "text-amber-400" : "text-foreground"}
        />
        <StatTile
          icon={Activity}
          label={t("RAM de FXServer")}
          value={fxUsage ? formatBytes(fxUsage.memoryBytes) : online ? "…" : "—"}
          hint={fxUsage ? t("{toFixed} % de la máquina", { toFixed: fxUsage.memoryPercent.toFixed(1) }) : undefined}
        />
        <StatTile
          icon={HardDrive}
          label={t("Peso en disco")}
          value={formatBytes(totals.size)}
          hint={totals.files ? t("{cantidad} ficheros", { cantidad: totals.files.toLocaleString(intlLocale()) }) : undefined}
        />
        <StatTile
          icon={Boxes}
          label={t("Arrancan al iniciar")}
          value={`${totals.active}`}
          hint={
            ensuredGroups.length > 0
              ? t("incluye {grupos}", { grupos: ensuredGroups.map((g) => `[${g}]`).join(", ") })
              : t("declarados con ensure")
          }
        />
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Buscar recurso por nombre...")}
            className="bg-background/50 pl-9"
          />
        </div>

        <div className="flex w-full items-center gap-1.5 overflow-x-auto pb-1 sm:w-auto sm:pb-0">
          {chips.map((chip) => (
            <Button
              key={chip.key}
              variant={selectedCategory === chip.key ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(chip.key)}
              title={chip.title}
              className="h-8 whitespace-nowrap text-xs capitalize"
            >
              {chip.label}
            </Button>
          ))}
        </div>
      </div>

      {selectedGroup && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
          <Layers className="size-4 shrink-0 text-primary" />
          <span className="text-sm">
            {t("La categoría")}{" "}<code className="font-mono text-xs">[{selectedGroup.name}]</code>{" "}{t("( {count} recurso", { count: selectedGroup.count })}{selectedGroup.count === 1 ? "" : "s"}){" "}
            {selectedGroup.ensured ? (
              <span className="text-emerald-400">{t("arranca entera desde el cfg.")}</span>
            ) : (
              <span className="text-muted-foreground">
                {t("puede arrancar entera con una sola línea.")}
              </span>
            )}
            {selectedGroup.chain.length > 1 && (
              <span className="text-muted-foreground">
                {" "}{t("Está dentro de")}{" "}
                <code className="font-mono text-xs">
                  {selectedGroup.chain
                    .slice(0, -1)
                    .map((g) => `[${g}]`)
                    .join(" › ")}
                </code>
                .
              </span>
            )}
          </span>

          {selectedGroup.ambiguous && (
            <span className="w-full text-xs text-amber-400">
              {t("Hay más de una carpeta llamada")}{" "}
              <code className="font-mono">[{selectedGroup.name}]</code>{" "}{t("en este servidor. El motor no las distingue:")}{" "}<code className="font-mono">ensure [{selectedGroup.name}]</code>{" "}{t("las arranca todas.")}
            </span>
          )}

          <Button
            size="sm"
            variant={selectedGroup.ensured ? "outline" : "default"}
            disabled={busy}
            className="ml-auto"
            onClick={() =>
              applyChanges(
                [],
                [{ name: selectedGroup.name, action: selectedGroup.ensured ? "stop" : "start" }]
              )
            }
          >
            {selectedGroup.ensured ? t("Quitar ensure de la categoría") : t("Arrancar toda la categoría")}
          </Button>
        </div>
      )}

      {selectedNames.length > 0 && (
        <div className="sticky top-16 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 backdrop-blur">
          <span className="text-sm font-medium">
            {t("{length} recurso(s) seleccionado(s)", { length: selectedNames.length })}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => applyChanges(selectedNames.map((name) => ({ name, action: "start" })))}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              {t("Arrancar (ensure)")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => applyChanges(selectedNames.map((name) => ({ name, action: "stop" })))}
            >
              <Pause className="size-3.5" />{" "}{t("Detener")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection(new Set())}>
              <X className="size-3.5" />{" "}{t("Limpiar")}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full space-y-2 rounded-xl border border-dashed p-12 text-center text-muted-foreground">
            {isScanning ? (
              <>
                <Loader2 className="mx-auto size-8 animate-spin opacity-60" />
                <p className="text-sm">{t("Leyendo la carpeta resources…")}</p>
              </>
            ) : (
              <>
                <Package className="mx-auto size-10 stroke-[1.5] opacity-40" />
                <p className="text-base font-semibold">{t("No se encontraron recursos")}</p>
                <p className="text-xs">
                  {t("Comprueba la ruta de tu servidor o instala scripts desde el marketplace.")}
                </p>
              </>
            )}
          </div>
        ) : (
          filtered.map((res) => {
            const active = res.status === "active";
            const picked = selection.has(res.name);
            return (
              <Card
                key={res.path ?? res.name}
                className={
                  "overflow-hidden border-border/50 bg-card/40 backdrop-blur-sm transition-all " +
                  (picked ? "border-primary/60 ring-1 ring-primary/40" : "hover:border-border")
                }
              >
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div className="flex min-w-0 gap-2 pr-2">
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() => toggleSelected(res.name)}
                      aria-label={t("Seleccionar {name}", { name: res.name })}
                      className="mt-1 size-3.5 shrink-0 accent-[var(--primary)]"
                    />
                    <div className="min-w-0">
                      <CardTitle className="truncate font-mono text-base font-bold">
                        {res.name}
                      </CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] font-normal capitalize">
                          {res.category || t("Script")}
                        </Badge>
                        {active ? (
                          <Badge
                            variant="default"
                            className="border-emerald-500/20 bg-emerald-500/10 text-[10px] font-normal text-emerald-400"
                          >
                            {res.viaGroup ? t("Activo vía {viaGroup}", { viaGroup: res.viaGroup }) : t("Activo (ensure)")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-normal text-muted-foreground"
                          >
                            {t("Detenido")}
                          </Badge>
                        )}
                        {res.hasManifest === false && (
                          <span
                            className="text-[10px] text-amber-400"
                            title={t("Sin fxmanifest.lua: el motor no lo reconocerá como recurso")}
                          >
                            {t("sin manifest")}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex shrink-0 rounded-lg bg-muted/50 p-1">
                    <Button
                      onClick={() =>
                        applyChanges([{ name: res.name, action: active ? "stop" : "start" }])
                      }
                      disabled={busy}
                      variant="ghost"
                      size="icon-sm"
                      className={
                        active
                          ? "text-red-400 hover:bg-red-500/10 hover:text-red-500"
                          : "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-500"
                      }
                      title={active ? t("Detener recurso") : t("Arrancar recurso (ensure)")}
                    >
                      {active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </Button>
                    <Button
                      onClick={() => restartResource(res.name)}
                      disabled={!online}
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      title={online ? t("Reiniciar recurso") : t("El servidor está parado")}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                    <span className="truncate font-mono">
                      resources/
                      {(res.groups ?? []).map((g) => `[${g}]/`).join("")}
                      {res.name}
                    </span>
                    {res.size !== undefined && (
                      <span className="shrink-0 tabular-nums" title={t("{valor} ficheros", { valor: res.files ?? 0 })}>
                        {formatBytes(res.size)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {!online && resources.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5" />
          {t("El servidor está parado: los cambios se escriben en server.cfg y se aplican al arrancarlo.")}
        </p>
      )}
    </div>
  );
}
