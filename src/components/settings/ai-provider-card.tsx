"use client";

import React, { useState, useEffect } from "react";
import { AGENT_URL } from "@/lib/agent";
import { Sparkles, Save, Loader2, CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { t, msg } from "@/i18n";

type Provider = "anthropic" | "openai-compatible" | "ollama";

interface PublicAiConfig {
  provider: Provider;
  model: string;
  baseUrl?: string;
  configured: boolean;
  keyHint?: string;
}

const PROVIDERS: { value: Provider; label: string; hint: string; defaultModel: string; needsBaseUrl: boolean }[] = [
  {
    value: "anthropic",
    label: msg("Claude (Anthropic)"),
    hint: msg("Mejor calidad generando Lua y razonando sobre el código del recurso."),
    defaultModel: "claude-opus-5",
    needsBaseUrl: false,
  },
  {
    value: "openai-compatible",
    label: msg("Compatible con OpenAI"),
    hint: msg("OpenAI, OpenRouter, LM Studio... cualquiera que exponga /chat/completions."),
    defaultModel: "gpt-4o-mini",
    needsBaseUrl: true,
  },
  {
    value: "ollama",
    label: msg("Ollama (local)"),
    hint: msg("Modelos locales sin API key: inicia `ollama serve` y descarga un modelo."),
    defaultModel: "llama3.2",
    needsBaseUrl: false,
  },
];

export function AiProviderCard() {
  const [config, setConfig] = useState<PublicAiConfig | null>(null);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState("claude-opus-5");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch(`${AGENT_URL}/api/ai/config`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return;
        setConfig(d.config);
        setProvider(d.config.provider);
        setModel(d.config.model);
        setBaseUrl(d.config.baseUrl || "");
      })
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, []);

  const selected = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];

  const handleProviderChange = (next: Provider) => {
    setProvider(next);
    const def = PROVIDERS.find((p) => p.value === next) ?? PROVIDERS[0];
    setModel(def.defaultModel);
    setBaseUrl(next === "openai-compatible" ? "https://api.openai.com/v1" : "");
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch(`${AGENT_URL}/api/ai/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, baseUrl: baseUrl || undefined, apiKey: apiKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t("El agente rechazó la configuración"));

      setConfig(data.config);
      setApiKey("");
      toast.success(t("Configuración de IA guardada"));
    } catch (err) {
      toast.error(t("No se pudo guardar"), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${AGENT_URL}/api/ai/test`, { method: "POST" });
      const data = await res.json();
      setTestResult({ success: Boolean(data.success), message: data.message });
    } catch {
      setTestResult({ success: false, message: t("El Agente VXCore no responde en el puerto 4000.") });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          {t("Agente IA")}
          {config?.configured ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
              {t("Configurado")}
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
              {t("Sin configurar")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t("El asistente del editor usa el proveedor que elijas aquí. La clave se guarda en el Agente VXCore, en tu máquina, y no se envía al panel.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="size-4 animate-spin" />{" "}{t("Cargando configuración...")}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-xs">{t("Proveedor")}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handleProviderChange(p.value)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      provider === p.value
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/50 hover:border-border bg-background/50"
                    }`}
                  >
                    <p className="text-sm font-medium">{t(p.label)}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(p.hint)}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">{t("Modelo")}</Label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} className="font-mono text-xs" />
              </div>

              {selected.needsBaseUrl && (
                <div className="space-y-2">
                  <Label className="text-xs">{t("URL base")}</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="font-mono text-xs"
                  />
                </div>
              )}
            </div>

            {provider !== "ollama" && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <KeyRound className="size-3" />{" "}{t("API key")}
                </Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={config?.keyHint ? t("Guardada ({keyHint}) — escribe una nueva para cambiarla", { keyHint: config.keyHint }) : t("Pega aquí tu API key")}
                  className="font-mono text-xs"
                />
              </div>
            )}

            {testResult && (
              <div
                className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                  testResult.success
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                )}
                <span>{t(testResult.message)}</span>
              </div>
            )}
          </>
        )}
      </CardContent>

      <CardFooter className="flex justify-between items-center border-t border-border/50 pt-4">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !config?.configured}>
          {testing ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
          {t("Probar conexión")}
        </Button>
        <Button onClick={handleSave} disabled={saving || loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          {t("Guardar")}
        </Button>
      </CardFooter>
    </Card>
  );
}
