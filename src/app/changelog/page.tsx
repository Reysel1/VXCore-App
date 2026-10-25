"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AGENT_URL } from "@/lib/agent";
import {
  GitBranch,
  RefreshCw,
  FileText,
  Save,
  GitCommitHorizontal,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  KeyRound,
  FolderGit2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { t, intlLocale } from "@/i18n";

interface GithubStatus {
  repo: string;
  branch: string;
  hasToken: boolean;
  tokenMasked: string;
}

interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export default function ChangelogPage() {
  const [status, setStatus] = useState<GithubStatus | null>(null);

  const [token, setToken] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [savingCfg, setSavingCfg] = useState(false);

  const [commits, setCommits] = useState<Commit[]>([]);
  const [fetchingCommits, setFetchingCommits] = useState(false);

  const [version, setVersion] = useState("0.2.1");
  const [content, setContent] = useState("");
  const [existingSha, setExistingSha] = useState<string | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commitUrl, setCommitUrl] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/github/status`);
      const data = await res.json();
      if (data.success) {
        setStatus(data.config);
        setRepo(data.config.repo ?? "");
        setBranch(data.config.branch || "main");
      }
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(loadStatus, 0);
    return () => clearTimeout(t);
  }, [loadStatus]);

  const connect = async () => {
    setSavingCfg(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/github/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, repo, branch }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data.config);
        setToken("");
        toast.success(t("GitHub conectado. Ya puedes leer los commits."));
      } else {
        toast.error(t("No se pudo conectar GitHub"), { description: data.error, duration: 8000 });
      }
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    } finally {
      setSavingCfg(false);
    }
  };

  const fetchCommits = async () => {
    setFetchingCommits(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/github/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 50 }),
      });
      const data = await res.json();
      if (data.success) {
        const commits = data.commits ?? [];
        setCommits(commits);
        toast.success(t("{length} commits leídos de {repo}", { length: commits.length, repo: status?.repo }));
      } else {
        toast.error(t("No se pudieron leer los commits"), { description: data.error, duration: 8000 });
      }
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    } finally {
      setFetchingCommits(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/github/changelog/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, count: 50 }),
      });
      const data = await res.json();
      if (data.success) {
        setContent(data.markdown ?? "");
        setCommits(data.commits || []);
        toast.success(t("Changelog generado desde los commits."));
      } else {
        toast.error(t("No se pudo generar"), { description: data.error, duration: 8000 });
      }
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    } finally {
      setGenerating(false);
    }
  };

  const loadChangelog = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/github/changelog`);
      const data = await res.json();
      if (data.success && data.content) {
        setContent(data.content ?? "");
        setExistingSha(data.sha);
        toast.success(t("CHANGELOG.md actual cargado del repo."));
      } else if (data.success) {
        setContent("");
        setExistingSha(undefined);
        toast.info(t("El repo no tiene CHANGELOG.md todavía: se creará al guardar."));
      } else {
        toast.error(t("No se pudo leer"), { description: data.error, duration: 8000 });
      }
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    }
  };

  const save = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/github/changelog/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, sha: existingSha }),
      });
      const data = await res.json();
      if (data.success) {
        setCommitUrl(data.commitUrl || null);
        if (typeof data.newSha === "string") setExistingSha(data.newSha);
        toast.success(t("CHANGELOG.md subido al repositorio con un commit."));
      } else {
        toast.error(t("No se pudo subir"), { description: data.error, duration: 10000 });
      }
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    } finally {
      setSaving(false);
    }
  };

  const connected = Boolean(status?.hasToken && status?.repo);

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("Changelog")}</h1>
            {connected ? (
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                {status?.repo}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                {t("Sin conectar")}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {t("Genera el changelog desde los")}{" "}<span className="text-primary font-medium">{t("commits de GitHub")}</span>{t(", edítalo y súbelo de vuelta al repositorio con un commit.")}
          </p>
        </div>
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="size-4 text-white" />
            {t("Conexión con GitHub")}
          </CardTitle>
          <CardDescription>
            {t("El token se guarda en el agente (nunca en el navegador). Necesita el scope")}{" "}
            <code className="text-xs bg-muted px-1 rounded">repo</code>{" "}{t("para leer commits y subir el changelog.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px_auto] gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <KeyRound className="size-3" />{" "}{t("Token (Personal Access Token)")}
              </label>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={status?.tokenMasked || "ghp_…"}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <FolderGit2 className="size-3" />{" "}{t("Repositorio")}
              </label>
              <Input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="tu-usuario/tu-repo"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">{t("Rama")}</label>
              <Input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={connect} disabled={savingCfg || (!token && !connected)} className="gap-2">
                {savingCfg ? <Loader2 className="size-4 animate-spin" /> : <GitBranch className="size-4" />}
                {connected ? t("Actualizar") : t("Conectar")}
              </Button>
            </div>
          </div>
          {!connected && (
            <p className="mt-3 text-xs text-muted-foreground/80 flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-400" />
              {t("Sin conexión solo puedes ver esta pantalla. Configura un token y el repositorio para generar el changelog.")}
            </p>
          )}
        </CardContent>
      </Card>

      {connected && (
        <Tabs defaultValue="editor" className="w-full space-y-4">
          <TabsList className="bg-muted/50 border border-border/50 p-1">
            <TabsTrigger value="editor" className="gap-2">
              <FileText className="size-4" />{" "}{t("Changelog")}
            </TabsTrigger>
            <TabsTrigger value="commits" className="gap-2">
              <GitCommitHorizontal className="size-4" />{" "}{t("Commits ({length})", { length: commits.length })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="space-y-4">
            <Card className="border-border/60 bg-card/50">
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-32">
                    <label className="text-[11px] font-semibold text-muted-foreground">{t("Versión")}</label>
                    <Input
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      className="h-8 font-mono text-xs"
                      placeholder="0.2.1"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchCommits} disabled={fetchingCommits} className="mt-5 gap-1.5">
                    {fetchingCommits ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    {t("Leer commits")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={loadChangelog} className="mt-5 gap-1.5">
                    <FileText className="size-3.5" />
                    {t("Cargar CHANGELOG.md")}
                  </Button>
                  <Button size="sm" onClick={generate} disabled={generating} className="mt-5 gap-1.5 bg-violet-600 hover:bg-violet-500 text-white">
                    {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {t("Generar desde commits")}
                  </Button>
                </div>

                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="font-mono text-xs min-h-[380px] bg-[#0d0d0d] border-border/50 leading-relaxed"
                  placeholder={t("# Changelog\n\n## [0.2.1] - 2026-08-06\n\nPulsa 'Generar desde commits' para crearlo automáticamente.")}
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {content ? t("{length} líneas", { length: content.split("\n").length }) : t("Vacío")}
                    {existingSha && t(" · el archivo ya existe en el repo")}
                  </span>
                  <div className="flex items-center gap-2">
                    {commitUrl && (
                      <a
                        href={commitUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="size-3" />{" "}{t("Último commit")}
                      </a>
                    )}
                    <Button
                      onClick={save}
                      disabled={saving || !content.trim()}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
                    >
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      {t("Subir a GitHub (commit)")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commits">
            <Card className="border-border/60 bg-card/50">
              <CardContent className="pt-4">
                {commits.length === 0 ? (
                  <div className="p-8 text-center border border-dashed rounded-xl text-muted-foreground space-y-2">
                    <GitCommitHorizontal className="size-8 mx-auto stroke-[1.5] opacity-40" />
                    <p className="text-sm font-medium">{t("Sin commits cargados")}</p>
                    <p className="text-xs">{t("Pulsa «Leer commits» para traer los últimos 50 de {repo}.", { repo: status?.repo })}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {commits.map((c) => (
                      <a
                        key={c.sha}
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 hover:bg-muted/40 transition-colors"
                      >
                        <span className="font-mono text-[10px] text-primary bg-primary/10 rounded px-1.5 py-0.5">
                          {c.sha}
                        </span>
                        <span className="flex-1 truncate text-sm">{c.message}</span>
                        <span className="hidden sm:block text-xs text-muted-foreground">{c.author}</span>
                        <span className="hidden md:block text-[11px] text-muted-foreground/70 tabular-nums">
                          {new Date(c.date).toLocaleDateString(intlLocale())}
                        </span>
                        <CheckCircle2 className="size-3.5 text-muted-foreground/40" />
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
