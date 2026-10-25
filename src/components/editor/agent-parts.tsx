"use client";

import React, { useMemo } from "react";
import { Check, FileDown, PencilLine, X } from "lucide-react";
import { FileDiff } from "@/components/agents/file-diff";
import { ToolApproval } from "@/components/agents/tool-approval";
import type { TodoItem } from "@/components/agents/todo-list";
import { collapseContext, diffLines, toUnifiedDiff } from "@/lib/diff";
import { detectLanguage, type Lang } from "@/components/editor/code-editor";
import { formatBytes } from "@/lib/utils";
import { t, msg } from "@/i18n";

export interface ToolRun {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "success" | "error";
  output?: string;
  ms?: number;
}

export interface Proposal {
  id: string;
  file: string;
  newCode: string;
  summary?: string;
  decision?: "editor" | "saved" | "rejected";
}

export const SUGGESTIONS = [
  msg("¿Qué hace este fichero?"),
  msg("Busca errores"),
  msg("¿Quién escucha este evento?"),
  msg("Añade logs de depuración"),
];

export function toolTitle(run: ToolRun): string {
  const { ruta, texto, recurso, pasos } = run.input as Record<string, unknown>;
  if (typeof ruta === "string") return ruta;
  if (typeof texto === "string") return `"${texto}"${recurso ? ` en ${recurso}` : ""}`;
  if (Array.isArray(pasos)) return t("{length} pasos", { length: pasos.length });
  if (typeof recurso === "string") return recurso;
  return run.status === "running" ? t("ejecutando…") : t("listo");
}

export function toolLanguage(run: ToolRun): Lang {
  const ruta = (run.input as { ruta?: unknown }).ruta;
  if (run.name === "leer_fichero" && typeof ruta === "string") return detectLanguage(ruta);
  return "text";
}

export function planItems(steps: string[], finished: boolean, progressed = 0): TodoItem[] {
  const reached = finished ? steps.length : Math.min(progressed, steps.length - 1);

  return steps.map((step, index) => ({
    id: `step-${index}`,
    title: step,
    status: index < reached ? "completed" : index === reached ? "in-progress" : "pending",
  }));
}

export function proposalSummary(proposals: Proposal[]): string {
  const loaded = proposals.filter((p) => p.decision === "editor").length;
  const saved = proposals.filter((p) => p.decision === "saved").length;
  const rejected = proposals.filter((p) => p.decision === "rejected").length;

  const parts: string[] = [];
  if (saved) parts.push(`${saved} guardado(s) en el servidor`);
  if (loaded) parts.push(`${loaded} cargado(s) en el editor`);
  if (rejected) parts.push(`${rejected} descartado(s)`);
  return parts.length ? parts.join(" · ") : t("Sin decidir");
}

const DECISION_LABEL: Record<NonNullable<Proposal["decision"]>, string> = {
  editor: msg("Cargado en el editor"),
  saved: msg("Guardado en el servidor"),
  rejected: msg("Descartado"),
};

export function ProposalReview({
  proposal,
  original,
  gated,
  onLoad,
  onRequestSave,
  onApproveSave,
  onDenySave,
  onReject,
}: {
  proposal: Proposal;
  original: string;
  gated: boolean;
  onLoad: () => void;
  onRequestSave: () => void;
  onApproveSave: (always: boolean) => void;
  onDenySave: () => void;
  onReject: () => void;
}) {
  const language = detectLanguage(proposal.file);

  const diff = useMemo(() => {
    const full = diffLines(original, proposal.newCode);
    return { ...full, lines: collapseContext(full.lines) };
  }, [original, proposal.newCode]);

  const decided = Boolean(proposal.decision);

  return (
    <div className="space-y-1.5">
      <FileDiff
        file={proposal.file}
        lines={diff.lines}
        language={language === "manifest" ? "lua" : language}
        copyText={toUnifiedDiff(proposal.file, diff.lines)}
        actions={
          decided ? (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {proposal.decision === "rejected" ? (
                <X className="size-3" />
              ) : (
                <Check className="size-3 text-emerald-400" />
              )}
              {t(DECISION_LABEL[proposal.decision!])}
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={onLoad}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/85"
              >
                <PencilLine className="size-3" />
                {t("Cargar en el editor")}
              </button>
              <button
                type="button"
                onClick={onRequestSave}
                title={t("Escribe el fichero en el servidor, con copia de seguridad de la versión anterior")}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <FileDown className="size-3" />
                {t("Guardar en el servidor")}
              </button>
              <button
                type="button"
                onClick={onReject}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400"
              >
                <X className="size-3" />
                {t("Descartar")}
              </button>
            </>
          )
        }
      />

      {proposal.summary && !decided ? (
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">{proposal.summary}</p>
      ) : null}

      {gated ? (
        <ToolApproval
          tool={t("escribir {file}", { file: proposal.file })}
          title={t("¿Escribo esto en el servidor?")}
          description={t("Se sobrescribe el fichero en disco. El agente guarda antes una copia de la versión actual.")}
          defaultOpen
          parameters={[
            { name: "fichero", value: proposal.file },
            { name: t("tamaño"), value: formatBytes(new Blob([proposal.newCode]).size) },
            {
              name: "cambios",
              value: `+${diff.additions} / −${diff.deletions}`,
            },
          ]}
          onApprove={() => onApproveSave(false)}
          onAlwaysAllow={() => onApproveSave(true)}
          onDeny={onDenySave}
          approveLabel={t("Guardar")}
          alwaysLabel={t("Guardar sin preguntar")}
        />
      ) : null}
    </div>
  );
}
