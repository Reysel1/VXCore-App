"use client";

import React from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AGENT_URL } from "@/lib/agent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

export interface CfgField {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  type?: "text" | "number";
  options?: { value: string; label: string }[];
  mono?: boolean;
}

type FieldState = "idle" | "saving" | "saved" | "error";

function useCfgSettings(cfgPath: string | undefined) {
  const [values, setValues] = React.useState<Record<string, string> | null>(null);
  const saved = React.useRef<Record<string, string>>({});

  const [prevCfgPath, setPrevCfgPath] = React.useState(cfgPath);
  if (prevCfgPath !== cfgPath) {
    setPrevCfgPath(cfgPath);
    if (!cfgPath) setValues(null);
  }

  React.useEffect(() => {
    if (!cfgPath) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${AGENT_URL}/api/server/settings?cfgPath=${encodeURIComponent(cfgPath)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) {
          setValues({});
          return;
        }
        const next: Record<string, string> = {};
        for (const [name, reading] of Object.entries(data.settings as Record<string, { value: string | null }>)) {
          next[name] = reading.value ?? "";
        }
        setValues(next);
        saved.current = { ...next };
      } catch {
        if (!cancelled) setValues({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cfgPath]);

  const isOnDisk = React.useCallback((name: string, value: string) => saved.current[name] === value, []);
  const markOnDisk = React.useCallback((name: string, value: string) => {
    saved.current[name] = value;
  }, []);

  return [values, setValues, isOnDisk, markOnDisk] as const;
}

export function ServerSettingsCard({
  title,
  description,
  icon,
  fields,
  cfgPath,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  fields: CfgField[];
  cfgPath: string | undefined;
}) {
  const [states, setStates] = React.useState<Record<string, FieldState>>({});
  const [values, setValues, isOnDisk, markOnDisk] = useCfgSettings(cfgPath);

  const save = async (name: string, value: string) => {
    if (!cfgPath) return;
    if (isOnDisk(name, value)) return;

    setStates((s) => ({ ...s, [name]: "saving" }));
    try {
      const res = await fetch(`${AGENT_URL}/api/server/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfgPath, name, value }),
      });
      const data = await res.json();
      if (!data.success) {
        setStates((s) => ({ ...s, [name]: "error" }));
        toast.error(t("No se pudo guardar"), { description: data.error });
        return;
      }
      markOnDisk(name, value);
      setStates((s) => ({ ...s, [name]: "saved" }));
      setTimeout(() => setStates((s) => (s[name] === "saved" ? { ...s, [name]: "idle" } : s)), 2000);
    } catch {
      setStates((s) => ({ ...s, [name]: "error" }));
      toast.error(t("El agente VXCore no responde."));
    }
  };

  if (!cfgPath) return null;

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5 sm:grid-cols-2">
        {fields.map((field) => {
          const state = states[field.name] ?? "idle";
          const value = values?.[field.name] ?? "";

          return (
            <div key={field.name} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`cfg-${field.name}`} className="text-xs font-semibold text-muted-foreground">
                  {field.label}
                </Label>
                <span className="flex h-4 items-center text-[11px]">
                  {state === "saving" && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  {state === "saved" && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Check className="size-3.5" />{" "}{t("Guardado")}
                    </span>
                  )}
                  {state === "error" && (
                    <span className="flex items-center gap-1 text-red-400">
                      <TriangleAlert className="size-3.5" />{" "}{t("No se guardó")}
                    </span>
                  )}
                </span>
              </div>

              {values === null ? (
                <Skeleton className="h-9 w-full" />
              ) : field.options ? (
                <select
                  id={`cfg-${field.name}`}
                  value={value}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === "") return;
                    setValues((v) => ({ ...(v ?? {}), [field.name]: next }));
                    void save(field.name, next);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {!field.options.some((option) => option.value === value) && (
                    <option value="">{t("Sin definir en el cfg")}</option>
                  )}
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`cfg-${field.name}`}
                  type={field.type ?? "text"}
                  value={value}
                  placeholder={field.placeholder}
                  className={field.mono ? "font-mono text-xs" : undefined}
                  onChange={(e) => setValues((v) => ({ ...(v ?? {}), [field.name]: e.target.value }))}
                  onBlur={(e) => void save(field.name, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              )}

              {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
