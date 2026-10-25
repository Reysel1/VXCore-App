"use client";

import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { connectAgentSocket } from "@/lib/agent-socket";
import { toast } from "sonner";
import { AGENT_URL } from "@/lib/agent";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { msg, t } from "@/i18n";

type RequirementStatus = "ok" | "missing" | "unknown";

interface Requirement {
  id: string;
  label: string;
  status: RequirementStatus;
  required: boolean;
  detail: string;
  fix?: { label: string; url?: string; hint?: string };
}

interface RequirementsResponse {
  success: boolean;
  requirements: Requirement[];
  blocking: boolean;
}

const INSTALLABLE: Record<string, { endpoint: string; label: string; note: string }> = {
  vcredist: {
    endpoint: "vcredist",
    label: msg("Instalar ahora"),
    note: msg("Windows pedirá permiso una vez. Tarda un par de minutos."),
  },
  fxserver: {
    endpoint: "fxserver",
    label: msg("Descargar e instalar"),
    note: msg("Se baja el build recomendado por Cfx.re (~90 MB): el mismo sirve para FiveM y RedM, y se deja configurado."),
  },
};

function RequirementRow({
  requirement,
  busy,
  progress,
  onInstall,
}: {
  requirement: Requirement;
  busy: boolean;
  progress: { step: string; percent: number | null } | null;
  onInstall: (requirement: Requirement) => void;
}) {
  const ok = requirement.status === "ok";
  const installable = !ok ? INSTALLABLE[requirement.id] : undefined;

  return (
    <div className="flex items-start gap-3 border-b border-border/40 py-4 last:border-0">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
      ) : (
        <AlertTriangle
          className={`mt-0.5 size-5 shrink-0 ${
            requirement.required ? "text-amber-500" : "text-muted-foreground"
          }`}
        />
      )}

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{requirement.label}</p>
          {!requirement.required && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {t("opcional")}
            </span>
          )}
        </div>

        <p
          className={`break-words text-xs ${
            ok ? "font-mono text-muted-foreground" : "text-muted-foreground"
          }`}
        >
          {requirement.detail}
        </p>

        {requirement.fix?.hint && (
          <p className="text-xs text-muted-foreground/80">{requirement.fix.hint}</p>
        )}

        {installable && !busy && (
          <p className="text-xs text-muted-foreground/80">{t(installable.note)}</p>
        )}

        {busy && progress && (
          <div className="space-y-1 pt-1">
            <p className="text-xs text-primary">{progress.step}</p>
            {progress.percent !== null && (
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {installable && (
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={busy}
          onClick={() => onInstall(requirement)}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {busy ? t("Instalando…") : t(installable.label)}
        </Button>
      )}

      {!ok && !installable && requirement.fix?.url && (
        <a
          href={requirement.fix.url}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 gap-1.5")}
        >
          {requirement.fix.label}
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}

export function RequirementsGate({
  children,
  ignore = [],
}: {
  children: React.ReactNode;
  ignore?: string[];
}) {
  const [data, setData] = React.useState<RequirementsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [checking, setChecking] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [installing, setInstalling] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{ step: string; percent: number | null } | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${AGENT_URL}/api/requirements`);
      const json = (await res.json()) as RequirementsResponse;
      setData(json.success && Array.isArray(json.requirements) ? json : null);
    } catch {
      setData(null);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function recheck() {
    setChecking(true);
    await load();
    setChecking(false);
  }

  async function install(requirement: Requirement) {
    const target = INSTALLABLE[requirement.id];
    if (!target) return;

    setInstalling(requirement.id);
    setProgress({ step: t("Empezando…"), percent: null });

    const socket = connectAgentSocket({ transports: ["websocket", "polling"] });
    socket.on("provision-progress", (event: { id: string; step: string; percent: number | null }) => {
      if (event.id === requirement.id) setProgress({ step: event.step, percent: event.percent });
    });

    try {
      const res = await fetch(`${AGENT_URL}/api/requirements/install/${target.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));

      if (json.success) toast.success(json.message || t("{requisito} instalado.", { requisito: requirement.label }));
      else if (json.cancelled) toast.info(json.message || t("No se instaló nada."));
      else toast.error(t("No se pudo instalar"), { description: json.message || json.error });
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      socket.close();
      setInstalling(null);
      setProgress(null);
      await load();
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const requirements = data ? data.requirements.filter((r) => !ignore.includes(r.id)) : [];
  const missing = requirements.filter((r) => r.required && r.status === "missing").length;

  if (!data || missing === 0 || dismissed) return <>{children}</>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
          <ShieldCheck className="size-7 text-amber-400" />
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">
          {missing === 1 ? t("Falta una cosa") : t("Faltan {n} cosas", { n: missing })}
        </h1>
        <p className="text-balance text-muted-foreground">
          {t("VXCore no necesita que instales Node ni nada del estilo — ya va todo dentro. Esto es lo que sí hace falta en tu equipo.")}
        </p>
      </div>

      <Card className="rounded-2xl border-white/10 bg-black/45 backdrop-blur-xl">
        <CardContent className="py-1">
          {requirements.map((requirement) => (
            <RequirementRow
              key={requirement.id}
              requirement={requirement}
              busy={installing === requirement.id}
              progress={installing === requirement.id ? progress : null}
              onInstall={install}
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => void recheck()}
          disabled={checking}
        >
          <RefreshCw className={`size-4 ${checking ? "animate-spin" : ""}`} />
          {t("Volver a comprobar")}
        </Button>

        <Button variant="ghost" className="gap-1.5" onClick={() => setDismissed(true)}>
          {t("Continuar de todos modos")}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
