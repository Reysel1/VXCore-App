"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  CornerLeftUp,
  FileCode,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
} from "lucide-react";
import { AGENT_URL } from "@/lib/agent";
import { parentDir } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";

interface FsEntry {
  name: string;
  path: string;
  directory: boolean;
  size?: number;
  modified?: string;
}

interface PathPickerProps {
  value?: string;
  onSelect: (path: string) => void;
  mode?: "file" | "directory";
  extensions?: string[];
  title?: string;
  description?: string;
  compact?: boolean;
  disabled?: boolean;
}

export function PathPicker({
  value,
  onSelect,
  mode = "file",
  extensions,
  title,
  description,
  compact = false,
  disabled = false,
}: PathPickerProps) {
  const [open, setOpen] = useState(false);
  const [cwd, setCwd] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [roots, setRoots] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const heading = title ?? (mode === "directory" ? t("Elige una carpeta") : t("Elige un fichero"));
  const extFilter = mode === "file" && extensions?.length ? extensions.join(",") : "";

  const browse = useCallback(
    async (target?: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (target) params.set("path", target);
        if (extFilter) params.set("ext", extFilter);

        const res = await fetch(`${AGENT_URL}/api/fs/list?${params}`);
        const data = await res.json();

        if (!data.success) {
          setError(data.error || t("No se pudo abrir esa carpeta."));
          return;
        }

        setCwd(data.path);
        setParent(data.parent);
        setEntries(data.entries ?? []);
        setChosen(mode === "directory" ? data.path : null);
      } catch {
        setError(t("El agente VXCore no responde."));
      } finally {
        setLoading(false);
      }
    },
    [mode, extFilter]
  );

  const startFrom = useRef(value);
  useEffect(() => {
    startFrom.current = value;
  }, [value]);

  useEffect(() => {
    if (!open) return;

    fetch(`${AGENT_URL}/api/fs/roots`)
      .then((res) => res.json())
      .then((data) => setRoots(data.success ? data.roots : []))
      .catch(() => setRoots([]));

    browse(parentDir(startFrom.current) || undefined);
  }, [open, browse]);

  const handleClick = async () => {
    const desktop = typeof window !== "undefined" ? window.fiveosDesktop : undefined;
    if (desktop?.pickPath) {
      const picked = await desktop.pickPath({
        mode,
        title: heading,
        defaultPath: parentDir(value) || undefined,
        filters:
          mode === "file" && extensions?.length
            ? [{ name: t("Configuración"), extensions }]
            : undefined,
      });
      if (picked) onSelect(picked);
      return;
    }

    setOpen(true);
  };

  const confirm = () => {
    if (!chosen) return;
    onSelect(chosen);
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon" : "default"}
        onClick={handleClick}
        disabled={disabled}
        title={heading}
        aria-label={heading}
        className="shrink-0"
      >
        <FolderOpen className="size-4" />
        {!compact && t("Examinar")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            <DialogDescription>
              {description ??
                (mode === "directory"
                  ? t("Navega hasta la carpeta y confírmala.")
                  : t("Navega hasta el fichero y selecciónalo."))}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5">
            {roots.map((root) => (
              <button
                key={root.path}
                type="button"
                onClick={() => browse(root.path)}
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs transition-colors hover:border-border hover:bg-muted/60"
              >
                <HardDrive className="size-3.5 text-muted-foreground" />
                {root.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => parent && browse(parent)}
              disabled={!parent || loading}
              title={t("Carpeta superior")}
            >
              <CornerLeftUp className="size-4" />
            </Button>
            <span className="min-w-0 flex-1 truncate rounded-md border border-border/50 bg-muted/20 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {cwd ?? "…"}
            </span>
          </div>

          <div className="h-72 max-h-[45svh] overflow-y-auto rounded-lg border border-border/50 bg-background/40">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="p-4 text-sm text-destructive">{error}</p>
            ) : entries.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {mode === "file"
                  ? t("Aquí no hay carpetas ni ficheros del tipo que buscas.")
                  : t("Esta carpeta no tiene subcarpetas.")}
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {entries.map((entry) => {
                  const selected = chosen === entry.path && !entry.directory;
                  return (
                    <li key={entry.path}>
                      <button
                        type="button"
                        onClick={() => {
                          if (entry.directory) browse(entry.path);
                          else setChosen(entry.path);
                        }}
                        className={
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors " +
                          (selected ? "bg-primary/15 text-primary" : "hover:bg-muted/50")
                        }
                      >
                        {entry.directory ? (
                          <Folder className="size-3.5 shrink-0 text-amber-400/80" />
                        ) : (
                          <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                        {entry.directory && (
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={confirm} disabled={!chosen}>
              {mode === "directory" ? t("Usar esta carpeta") : t("Seleccionar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
