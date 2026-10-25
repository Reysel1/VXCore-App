"use client";

import React, { useMemo, useState } from "react";
import { ChevronRight, FileCode, Folder, FolderOpen, Package } from "lucide-react";
import { t } from "@/i18n";

export interface TreeResource {
  name: string;
  category: string;
  fileCount: number;
  files: { path: string; editable: boolean }[];
}

interface DirNode {
  dirs: Map<string, DirNode>;
  files: string[];
}

export const DRAG_MIME = "application/vxcore-node";

export interface DraggedNode {
  resource: string;
  filePath?: string;
}

export function nodeDragProps(node: DraggedNode) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(node));
      e.dataTransfer.setData(
        "text/plain",
        node.filePath ? `${node.resource}/${node.filePath}` : node.resource
      );
      e.dataTransfer.effectAllowed = "copy";
      e.stopPropagation();
    },
  };
}

function emptyDir(): DirNode {
  return { dirs: new Map(), files: [] };
}

function buildTree(paths: string[]): DirNode {
  const root = emptyDir();

  for (const full of paths) {
    const parts = full.split("/");
    const fileName = parts.pop()!;

    let node = root;
    for (const part of parts) {
      if (!node.dirs.has(part)) node.dirs.set(part, emptyDir());
      node = node.dirs.get(part)!;
    }
    node.files.push(fileName);
  }

  return root;
}

function DirBranch({
  node,
  prefix,
  depth,
  openPaths,
  toggle,
  onOpenFile,
  activePath,
  resource,
}: {
  node: DirNode;
  prefix: string;
  depth: number;
  openPaths: Set<string>;
  toggle: (key: string) => void;
  onOpenFile: (filePath: string) => void;
  activePath: string | null;
  resource: string;
}) {
  const dirs = [...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b));
  const files = [...node.files].sort((a, b) => a.localeCompare(b));

  return (
    <>
      {dirs.map(([name, child]) => {
        const key = prefix ? `${prefix}/${name}` : name;
        const isOpen = openPaths.has(key);
        return (
          <div key={key}>
            <button
              type="button"
              onClick={() => toggle(key)}
              className="flex w-full items-center gap-1 rounded py-1 pr-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              <ChevronRight
                className={`size-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              {isOpen ? (
                <FolderOpen className="size-3.5 shrink-0 text-amber-400/80" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-amber-400/60" />
              )}
              <span className="truncate">{name}</span>
            </button>

            {isOpen && (
              <DirBranch
                node={child}
                prefix={key}
                depth={depth + 1}
                openPaths={openPaths}
                toggle={toggle}
                onOpenFile={onOpenFile}
                activePath={activePath}
                resource={resource}
              />
            )}
          </div>
        );
      })}

      {files.map((name) => {
        const full = prefix ? `${prefix}/${name}` : name;
        return (
          <button
            key={full}
            type="button"
            onClick={() => onOpenFile(full)}
            title={t("{full} — arrástralo al agente para dárselo de contexto", { full })}
            {...nodeDragProps({ resource, filePath: full })}
            className={
              "flex w-full cursor-grab items-center gap-1.5 rounded py-1 pr-2 text-left text-xs hover:bg-muted/50 active:cursor-grabbing " +
              (activePath === full ? "bg-muted/70 text-foreground" : "text-muted-foreground")
            }
            style={{ paddingLeft: `${depth * 12 + 22}px` }}
          >
            <FileCode className="size-3 shrink-0" />
            <span className="truncate">{name}</span>
          </button>
        );
      })}
    </>
  );
}

export function FileTree({
  resources,
  activeResource,
  activeFile,
  onOpenFile,
  forceExpand = false,
}: {
  resources: TreeResource[];
  activeResource: string | null;
  activeFile: string | null;
  onOpenFile: (resource: string, filePath: string) => void;
  forceExpand?: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const byCategory = useMemo(() => {
    const groups = new Map<string, TreeResource[]>();
    for (const resource of resources) {
      const category = resource.category || "root";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(resource);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [resources]);

  const trees = useMemo(() => {
    const map = new Map<string, DirNode>();
    for (const resource of resources) {
      map.set(resource.name, buildTree(resource.files.map((f) => f.path)));
    }
    return map;
  }, [resources]);

  const isOpen = (key: string) => forceExpand || open.has(key);

  return (
    <>
      {byCategory.map(([category, group]) => {
        const catKey = `cat:${category}`;
        const catOpen = isOpen(catKey);

        return (
          <div key={catKey}>
            <button
              type="button"
              onClick={() => toggle(catKey)}
              className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 hover:bg-muted/40"
            >
              <ChevronRight
                className={`size-3 shrink-0 transition-transform ${catOpen ? "rotate-90" : ""}`}
              />
              <span className="truncate">{category}</span>
              <span className="ml-auto font-normal normal-case">{group.length}</span>
            </button>

            {catOpen &&
              group.map((resource) => {
                const resKey = `res:${resource.name}`;
                const resOpen = isOpen(resKey);

                return (
                  <div key={resKey}>
                    <button
                      type="button"
                      onClick={() => toggle(resKey)}
                      title={t("{name} — arrástralo al agente para darle la lista de sus ficheros", { name: resource.name })}
                      {...nodeDragProps({ resource: resource.name })}
                      className={
                        "flex w-full cursor-grab items-center gap-1 rounded py-1 pl-4 pr-2 text-left text-xs hover:bg-muted/50 active:cursor-grabbing " +
                        (activeResource === resource.name ? "text-foreground" : "")
                      }
                    >
                      <ChevronRight
                        className={`size-3 shrink-0 transition-transform ${resOpen ? "rotate-90" : ""}`}
                      />
                      <Package className="size-3.5 shrink-0 text-primary/80" />
                      <span className="truncate font-medium">{resource.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {resource.fileCount}
                      </span>
                    </button>

                    {resOpen && (
                      <DirBranch
                        node={trees.get(resource.name) ?? emptyDir()}
                        prefix=""
                        depth={2}
                        openPaths={forceExpand ? ALL_OPEN : open}
                        toggle={toggle}
                        onOpenFile={(filePath) => onOpenFile(resource.name, filePath)}
                        activePath={activeResource === resource.name ? activeFile : null}
                        resource={resource.name}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </>
  );
}

const ALL_OPEN = new Proxy(new Set<string>(), {
  get(target, prop) {
    if (prop === "has") return () => true;
    return Reflect.get(target, prop);
  },
}) as Set<string>;
