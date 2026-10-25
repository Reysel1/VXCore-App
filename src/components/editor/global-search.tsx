"use client";

import React from "react";
import { CaseSensitive, FileCode, Loader2, Search, WholeWord, X } from "lucide-react";

import { AGENT_URL } from "@/lib/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nodeDragProps } from "@/components/editor/file-tree";
import { t } from "@/i18n";

export interface SearchHit {
  resource: string;
  file: string;
  line: number;
  column: number;
  text: string;
}

interface Result {
  matches: SearchHit[];
  truncated: boolean;
  filesScanned: number;
  filesTotal: number;
  ms: number;
}

function splitAtMatch(text: string, query: string, caseSensitive: boolean) {
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const at = haystack.indexOf(needle);
  if (at === -1) return { before: text, hit: "", after: "" };
  return {
    before: text.slice(0, at),
    hit: text.slice(at, at + query.length),
    after: text.slice(at + query.length),
  };
}

export function GlobalSearch({
  serverDataPath,
  onOpen,
}: {
  serverDataPath?: string;
  onOpen: (resource: string, file: string, line: number) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [wholeWord, setWholeWord] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [searched, setSearched] = React.useState("");

  const run = async () => {
    const needle = query.trim();
    if (needle.length < 2 || !serverDataPath) {
      setError(needle.length < 2 ? t("Escribe al menos dos caracteres.") : null);
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        serverDataPath,
        q: needle,
        caseSensitive: caseSensitive ? "1" : "0",
        wholeWord: wholeWord ? "1" : "0",
      });
      const res = await fetch(`${AGENT_URL}/api/resource/search?${params}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setResult(null);
        setError(data.error || t("El agente respondió {status}.", { status: res.status }));
        return;
      }

      setSearched(needle);
      setResult({
        matches: data.matches ?? [],
        truncated: Boolean(data.truncated),
        filesScanned: data.filesScanned ?? 0,
        filesTotal: data.filesTotal ?? 0,
        ms: data.ms ?? 0,
      });
    } catch {
      setResult(null);
      setError(t("El agente VXCore no responde."));
    } finally {
      setSearching(false);
    }
  };

  const grouped = React.useMemo(() => {
    const groups = new Map<string, { resource: string; file: string; hits: SearchHit[] }>();
    for (const hit of result?.matches ?? []) {
      const key = `${hit.resource}::${hit.file}`;
      const group = groups.get(key) ?? { resource: hit.resource, file: hit.file, hits: [] };
      group.hits.push(hit);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [result]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-border/50 p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
            placeholder={t("Buscar en todos los scripts")}
            className="h-8 pl-7 pr-7 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResult(null);
                setError(null);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t("Limpiar")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={caseSensitive ? "secondary" : "ghost"}
            className="h-7 px-2"
            title={t("Distinguir mayúsculas de minúsculas")}
            onClick={() => setCaseSensitive((v) => !v)}
          >
            <CaseSensitive className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={wholeWord ? "secondary" : "ghost"}
            className="h-7 px-2"
            title={t("Sólo la palabra completa")}
            onClick={() => setWholeWord((v) => !v)}
          >
            <WholeWord className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            className="ml-auto h-7 flex-1 text-xs"
            onClick={() => void run()}
            disabled={searching || !serverDataPath}
          >
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {t("Buscar")}
          </Button>
        </div>

        {result && !error && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">
              {result.matches.length === 0
                ? t("Sin coincidencias · {filesScanned} ficheros en {ms} ms", { filesScanned: result.filesScanned, ms: result.ms })
                : t("{length} en {length2} fichero(s) · {filesScanned} de {filesTotal} revisados · {ms} ms", { length: result.matches.length, length2: grouped.length, filesScanned: result.filesScanned, filesTotal: result.filesTotal, ms: result.ms })}
            </p>
            {result.truncated && (
              <p className="text-[10px] text-amber-400/80">
                {t("Búsqueda cortada. Afina el término o mira sólo el recurso que te interesa.")}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {error && (
          <p className="m-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-300">
            {error}
          </p>
        )}

        {!error && !result && !searching && (
          <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
            {t("Escribe un evento, una función o un texto y pulsa Enter. Se busca dentro de todos los recursos del servidor, no sólo del que tengas abierto.")}
          </p>
        )}

        {grouped.map((group) => (
          <div key={`${group.resource}::${group.file}`} className="mb-1">
            <div
              className="flex cursor-grab items-center gap-1.5 px-2 py-1 text-[11px] active:cursor-grabbing"
              title={t("{resource}/{file} — arrástralo al agente para dárselo de contexto", { resource: group.resource, file: group.file })}
              {...nodeDragProps({ resource: group.resource, filePath: group.file })}
            >
              <FileCode className="size-3.5 shrink-0 text-primary/70" />
              <span className="truncate font-medium">{group.file}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {group.hits.length}
              </span>
            </div>
            <p className="truncate px-2 pb-1 text-[10px] text-muted-foreground/70">
              {group.resource}
            </p>

            {group.hits.map((hit) => {
              const { before, hit: found, after } = splitAtMatch(hit.text, searched, caseSensitive);
              return (
                <button
                  key={`${hit.line}-${hit.column}`}
                  type="button"
                  onClick={() => onOpen(hit.resource, hit.file, hit.line)}
                  className="flex w-full items-start gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-muted/50"
                  title={`${group.resource}/${group.file}:${hit.line}`}
                >
                  <span className="shrink-0 pt-px font-mono text-[10px] tabular-nums text-muted-foreground/60">
                    {hit.line}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground">
                    {before.trimStart()}
                    <mark className="rounded-sm bg-amber-400/25 px-0.5 text-amber-200">{found}</mark>
                    {after}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
