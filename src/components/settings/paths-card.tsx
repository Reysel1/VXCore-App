"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCode,
  FolderTree,
  HardDrive,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { AGENT_URL } from "@/lib/agent";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PathPicker } from "@/components/common/path-picker";
import { useServerContext } from "@/context/server-context";
import { toast } from "sonner";
import { t } from "@/i18n";

interface PathEntry {
  path: string;
  exists: boolean;
}

interface PathsResponse {
  scanRoots: PathEntry[];
  extraCfgs: PathEntry[];
  fxServerBin: PathEntry | null;
  defaults: PathEntry[];
  file: string;
}

function PathList({
  items,
  onChange,
  mode,
  extensions,
  placeholder,
  emptyHint,
}: {
  items: PathEntry[];
  onChange: (paths: string[]) => void;
  mode: "file" | "directory";
  extensions?: string[];
  placeholder: string;
  emptyHint: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (items.some((item) => item.path.toLowerCase() === trimmed.toLowerCase())) {
      toast.info(t("Esa ruta ya está en la lista."));
      setDraft("");
      return;
    }
    onChange([...items.map((item) => item.path), trimmed]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {emptyHint}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.path}
              className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5"
            >
              {item.exists ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={item.path}>
                {item.path}
              </span>
              {!item.exists && (
                <span className="shrink-0 text-[10px] text-amber-400">{t("no existe")}</span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange(items.filter((i) => i.path !== item.path).map((i) => i.path))}
                title={t("Quitar de la lista")}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(draft)}
          placeholder={placeholder}
          className="font-mono text-xs"
        />
        <PathPicker onSelect={add} mode={mode} extensions={extensions} compact />
        <Button variant="secondary" onClick={() => add(draft)} disabled={!draft.trim()}>
          <Plus className="size-4" />{" "}{t("Añadir")}
        </Button>
      </div>
    </div>
  );
}

export function PathsCard() {
  const { refreshServers } = useServerContext();
  const [paths, setPaths] = useState<PathsResponse | null>(null);
  const [fxBin, setFxBin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`${AGENT_URL}/api/paths`)
      .then((res) => res.json())
      .then((data: { success?: boolean; paths: PathsResponse }) => {
        if (data.success) {
          setPaths(data.paths);
          setFxBin(data.paths.fxServerBin?.path ?? "");
          setDirty(false);
        }
      })
      .catch(() => {
        toast.error(t("El agente VXCore no responde."));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const save = async () => {
    if (!paths) return;
    setSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/paths`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanRoots: paths.scanRoots.map((p) => p.path),
          extraCfgs: paths.extraCfgs.map((p) => p.path),
          fxServerBin: fxBin.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(t("No se pudieron guardar las rutas"), { description: data.error });
        return;
      }

      setPaths(data.paths);
      setFxBin(data.paths.fxServerBin?.path ?? "");
      setDirty(false);
      toast.success(t("Rutas guardadas"), { description: t("El descubrimiento ya las está usando.") });
      await refreshServers();
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<PathsResponse>) => {
    setPaths((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const asEntries = (list: string[], previous: PathEntry[]): PathEntry[] =>
    list.map((p) => previous.find((e) => e.path === p) ?? { path: p, exists: true });

  if (loading) {
    return (
      <Card className="border-border/50 bg-background/50 backdrop-blur">
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />{" "}{t("Cargando rutas…")}
        </CardContent>
      </Card>
    );
  }

  if (!paths) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="py-6 text-sm text-muted-foreground">
          {t("No se pudieron leer las rutas: el agente VXCore no responde.")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <FolderTree className="size-5 text-primary" />
          {t("Rutas del sistema")}
        </CardTitle>
        <CardDescription>
          {t("Dónde busca VXCore servidores en este equipo. Se guarda en")}{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{paths.file}</code>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t("Carpetas de servidor")}</h3>
            <Badge variant="secondary" className="text-[10px]">
              {t("se busca")}{" "}<code className="font-mono">server.cfg</code>{" "}{t("dentro")}
            </Badge>
          </div>
          <PathList
            items={paths.scanRoots}
            onChange={(list) => update({ scanRoots: asEntries(list, paths.scanRoots) })}
            mode="directory"
            placeholder="E:\servidores\mi-rp"
            emptyHint={t("Ninguna añadida. Se miran igualmente las ubicaciones habituales de FXServer.")}
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t("Ficheros .cfg sueltos")}</h3>
            <Badge variant="secondary" className="text-[10px]">
              {t("para los que no se llaman")}{" "}<code className="font-mono">server.cfg</code>
            </Badge>
          </div>
          <PathList
            items={paths.extraCfgs}
            onChange={(list) => update({ extraCfgs: asEntries(list, paths.extraCfgs) })}
            mode="file"
            extensions={["cfg"]}
            placeholder="E:\servidores\mi-rp\produccion.cfg"
            emptyHint={t("Ninguno. Sólo hace falta si tu configuración no se llama server.cfg.")}
          />
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="size-4 text-muted-foreground" />
            {t("Ejecutable de FXServer")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("Sólo si tus artifacts no están junto a la carpeta del servidor. Vacío = búsqueda automática.")}
          </p>
          <div className="flex gap-2">
            <Input
              value={fxBin}
              onChange={(e) => {
                setFxBin(e.target.value);
                setDirty(true);
              }}
              placeholder="C:\FXServer\server\FXServer.exe"
              className="font-mono text-xs"
            />
            <PathPicker
              value={fxBin}
              onSelect={(picked) => {
                setFxBin(picked);
                setDirty(true);
              }}
              mode="file"
              extensions={["exe", "cmd", "sh"]}
              title={t("Busca FXServer")}
              compact
            />
          </div>
          {paths.fxServerBin && !paths.fxServerBin.exists && (
            <p className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="size-3.5" />{" "}{t("La ruta guardada no existe en este equipo.")}
            </p>
          )}
        </section>

        {paths.defaults.length > 0 && (
          <section className="space-y-2 border-t border-border/50 pt-4">
            <h3 className="text-sm font-semibold">{t("Detectadas automáticamente")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("Ubicaciones convencionales que ya existen aquí. Se miran siempre, no hace falta añadirlas.")}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {paths.defaults.map((entry) => (
                <li
                  key={entry.path}
                  className="flex items-center gap-1.5 rounded border border-border/50 bg-muted/20 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                >
                  <FileCode className="size-3" />
                  {entry.path}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>

      <CardFooter className="justify-between">
        <span className="text-xs text-muted-foreground">
          {dirty ? t("Hay cambios sin guardar.") : t("Todo guardado.")}
        </span>
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("Guardar rutas")}
        </Button>
      </CardFooter>
    </Card>
  );
}
