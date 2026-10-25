"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AGENT_URL } from "@/lib/agent";
import {
  Download,
  Star,
  ShieldCheck,
  Search,
  Sparkles,
  CheckCircle2,
  Code,
  PackageCheck,
  Loader2,
  AlertTriangle,
  GitBranch,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useServerContext } from "@/context/server-context";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";
import { t, msg } from "@/i18n";

interface RepoMeta {
  stars: number | null;
  version: string | null;
  updatedAt: string | null;
  unavailable?: string;
}

interface StoreListing {
  url: string;
  price: string;
  image: string;
}

interface CatalogItem {
  name: string;
  repo: string | null;
  author: string;
  category: string;
  description: string;
  dependencies: string[];
  verified: boolean;
  installed: boolean;
  meta: RepoMeta;
  store?: StoreListing;
}

interface InstallOutcome {
  success: boolean;
  message: string;
  code?: string;
  files?: number;
  version?: string | null;
  ensureAdded?: boolean;
  missingDependencies?: string[];
}

const URANTIX_LOGO = "https://framerusercontent.com/images/bycwww03KrssBrayBvVjh7dZMo.png";

const CATEGORY_FILTERS: {
  value: string;
  label: string;
  matches: (c: string) => boolean;
  icon?: string;
}[] = [
  { value: "all", label: msg("Todos"), matches: () => true },
  { value: "core", label: msg("Core & Framework"), matches: (c) => c === "Core" || c === "Framework" },
  { value: "ui", label: msg("UI & HUD"), matches: (c) => c === "UI" },
  { value: "jobs", label: msg("Trabajos"), matches: (c) => c === "Trabajos" },
  { value: "systems", label: msg("Sistemas"), matches: (c) => c === "Sistemas" },
  { value: "urantix", label: "Urantix", matches: (c) => c === "Urantix", icon: URANTIX_LOGO },
];

function formatStars(stars: number | null) {
  if (stars === null) return "—";
  return stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars);
}

export default function MarketplacePage() {
  const { activeServer } = useServerContext();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [installedKnown, setInstalledKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [installing, setInstalling] = useState<CatalogItem | null>(null);
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null);

  const serverDataPath = activeServer?.serverDataPath;

  const fetchCatalog = useCallback(() => {
    const params = new URLSearchParams();
    if (serverDataPath) params.set("serverDataPath", serverDataPath);

    return fetch(`${AGENT_URL}/api/marketplace/catalog?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { success?: boolean; error?: string; items?: CatalogItem[]; installedKnown: boolean }) => {
        if (!data.success) throw new Error(data.error || t("Respuesta inesperada del agente"));

        setItems(data.items ?? []);
        setInstalledKnown(data.installedKnown);
      })
      .catch(() => {
        setLoadError(t("No se pudo cargar el catálogo: el Agente VXCore no responde en el puerto 4000."));
        setItems([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [serverDataPath]);

  const loadCatalog = () => {
    setLoading(true);
    setLoadError(null);
    void fetchCatalog();
  };

  const [catalogFor, setCatalogFor] = useState(serverDataPath);
  if (catalogFor !== serverDataPath) {
    setCatalogFor(serverDataPath);
    setLoading(true);
    setLoadError(null);
  }

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const handleInstall = async (item: CatalogItem, overwrite = false) => {
    if (!activeServer?.serverDataPath) {
      toast.error(t("Sin servidor de destino"), {
        description: t("Selecciona un servidor con una ruta de datos válida antes de instalar."),
      });
      return;
    }

    setInstalling(item);
    setOutcome(null);

    try {
      const res = await fetch(`${AGENT_URL}/api/marketplace/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: item.repo,
          name: item.name,
          serverDataPath: activeServer.serverDataPath,
          cfgPath: activeServer.cfgPath,
          dependencies: item.dependencies,
          overwrite,
        }),
      });

      const data: InstallOutcome = await res.json();
      setOutcome(data);

      if (data.success) {
        setItems((prev) => prev.map((i) => (i.name === item.name ? { ...i, installed: true } : i)));
        toast.success(t("{name} instalado", { name: item.name }), { description: t("{files} archivos descargados.", { files: data.files }) });
      } else {
        toast.error(t("No se pudo instalar {name}", { name: item.name }), { description: data.message, duration: 9000 });
      }
    } catch {
      const message = t("No se pudo contactar con el Agente VXCore (puerto 4000).");
      setOutcome({ success: false, message, code: "AGENT_UNREACHABLE" });
      toast.error(message);
    }
  };

  const activeFilter = CATEGORY_FILTERS.find((f) => f.value === selectedCategory) ?? CATEGORY_FILTERS[0];

  const filteredItems = items.filter((item) => {
    const term = searchQuery.toLowerCase();
    const matchesSearch =
      item.name.toLowerCase().includes(term) ||
      item.author.toLowerCase().includes(term) ||
      item.description.toLowerCase().includes(term);
    return activeFilter.matches(item.category) && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("Marketplace de Recursos")}</h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              <Sparkles className="size-3 mr-1" />
              {t("GitHub y partners")}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {activeServer?.serverDataPath ? (
              <>
                {t("Se descargan e instalan en")}{" "}
                <span className="font-mono text-xs text-primary">{activeServer.serverDataPath}\resources</span>
              </>
            ) : (
              t("Selecciona un servidor para poder instalar recursos.")
            )}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" onClick={loadCatalog} disabled={loading} title={t("Recargar catálogo")}>
            <RotateCcw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Buscar por nombre, autor o función...")}
              className="pl-8 bg-background/50"
            />
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {!installedKnown && !loadError && !loading && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{t("Sin una ruta de servidor no puedo saber qué tienes instalado ni instalar nada.")}</span>
        </div>
      )}

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
        <TabsList className="bg-muted/50 border border-border/50">
          {CATEGORY_FILTERS.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value} className="gap-1.5">
              {filter.icon && (
                <Image src={filter.icon} alt="" width={14} height={14} unoptimized className="rounded-[3px]" />
              )}
              {t(filter.label)}
              {filter.value === "all" ? ` (${items.length})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="size-8 text-primary animate-spin" />
          <p className="text-muted-foreground text-sm">{t("Consultando GitHub y tu carpeta de recursos...")}</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <Card
              key={item.name}
              className="flex flex-col justify-between border-border/50 bg-background/50 backdrop-blur hover:border-border transition-all"
            >
              {item.store && (
                <Image
                  src={item.store.image}
                  alt=""
                  width={640}
                  height={360}
                  unoptimized
                  className="aspect-video w-full object-cover"
                  loading="lazy"
                />
              )}

              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-lg flex items-center gap-1.5 font-bold">
                      <span className="truncate">{item.name}</span>
                      {item.verified && (
                        <span title={t("Repositorio verificado por VXCore")}>
                          <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs truncate">
                      {t("by")}{" "}<span className="font-mono text-foreground/80">{item.author}</span>
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-primary/5 text-xs shrink-0">
                    {t(item.category)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pb-4 flex-1 space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-3">{t(item.description)}</p>

                {item.dependencies.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground/80">
                    <span className="text-muted-foreground/60">{t("Deps:")}</span>
                    {item.dependencies.map((dep) => (
                      <span
                        key={dep}
                        className="font-mono bg-muted/40 px-1.5 py-0.5 rounded border border-border/40 text-[10px]"
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                )}

                {item.repo && (
                  <a
                    href={`https://github.com/${item.repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-muted-foreground/70 hover:text-primary flex items-center gap-1 font-mono w-fit"
                  >
                    <GitBranch className="size-3" /> {item.repo}
                  </a>
                )}
              </CardContent>

              <CardFooter className="flex justify-between items-center border-t border-border/50 pt-3 bg-muted/10">
                {item.store ? (
                  <>
                    <span className="text-sm font-semibold tabular-nums">{item.store.price}</span>
                    <Button
                      render={<a href={item.store.url} target="_blank" rel="noreferrer" />}
                      size="sm"
                      className="h-8 text-xs font-semibold gap-1.5"
                    >
                      <ExternalLink className="size-3.5" />{" "}{t("Ver en la tienda")}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div
                        className="flex items-center gap-1"
                        title={item.meta.unavailable || t("Estrellas en GitHub")}
                      >
                        <Star className="size-3.5 text-yellow-500 fill-yellow-500/20" />{" "}
                        {formatStars(item.meta.stars)}
                      </div>
                      {item.meta.version && (
                        <span className="font-mono text-[11px]">{item.meta.version}</span>
                      )}
                    </div>

                    {item.installed ? (
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="h-7 text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1 font-medium"
                        >
                          <CheckCircle2 className="size-3" />{" "}{t("En disco")}
                        </Badge>
                        <Button
                          render={<Link href={`/editor/${item.name}`} />}
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          title={t("Abrir en el editor")}
                        >
                          <Code className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleInstall(item)}
                        disabled={!installedKnown || installing?.name === item.name}
                        size="sm"
                        className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5"
                      >
                        <Download className="size-3.5" />{" "}{t("Instalar")}
                      </Button>
                    )}
                  </>
                )}
              </CardFooter>
            </Card>
          ))}

          {filteredItems.length === 0 && !loadError && (
            <div className="col-span-full p-12 text-center border border-dashed rounded-xl text-muted-foreground space-y-2">
              <Search className="size-10 mx-auto stroke-[1.5] opacity-40" />
              <p className="text-base font-semibold">{t("Ningún recurso coincide con la búsqueda")}</p>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={!!installing}
        onOpenChange={(open) => {
          if (!open) {
            setInstalling(null);
            setOutcome(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="size-5 text-primary" />
              {outcome ? (outcome.success ? t("Instalado") : t("Instalación fallida")) : t("Instalando {name}", { name: installing?.name })}
            </DialogTitle>
            <DialogDescription>
              {installing?.repo} → <span className="font-mono text-xs">resources/{installing?.name}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            {!outcome && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                {t("Descargando desde GitHub y extrayendo en disco...")}
              </div>
            )}

            {outcome && (
              <>
                <div
                  className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                    outcome.success
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/10 border-red-500/20 text-red-400"
                  }`}
                >
                  {outcome.success ? (
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  )}
                  <span>{t(outcome.message)}</span>
                </div>

                {outcome.success && (
                  <ul className="text-xs text-muted-foreground space-y-1 pl-1">
                    {outcome.version && <li>{t("Versión descargada: {version}", { version: outcome.version })}</li>}
                    <li>
                      {outcome.ensureAdded
                        ? t("Añadido `ensure` a tu server.cfg.")
                        : t("Ya estaba declarado en server.cfg, no se tocó.")}
                    </li>
                  </ul>
                )}

                {outcome.missingDependencies && outcome.missingDependencies.length > 0 && (
                  <div className="p-3 rounded-lg text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>
                      {t("Faltan dependencias en disco: {join}. Instálalas o el recurso fallará al arrancar.", { join: outcome.missingDependencies.join(", ") })}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            {outcome?.code === "ALREADY_INSTALLED" && installing && (
              <Button variant="outline" onClick={() => handleInstall(installing, true)}>
                {t("Sobrescribir")}
              </Button>
            )}
            <Button
              onClick={() => {
                setInstalling(null);
                setOutcome(null);
              }}
              disabled={!outcome}
            >
              {t("Cerrar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
