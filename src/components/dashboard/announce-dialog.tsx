"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  Info,
  Loader2,
  Megaphone,
  Play,
  TriangleAlert,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AGENT_URL } from "@/lib/agent";
import { reproducirSonidoAviso } from "@/lib/sonido-aviso";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { t, msg } from "@/i18n";

type Tipo = "info" | "success" | "warning" | "error";

const TIPOS: { value: Tipo; label: string; icon: LucideIcon; iconClass: string; chipClass: string }[] = [
  {
    value: "info",
    label: msg("Información"),
    icon: Info,
    iconClass: "text-sky-400 bg-sky-500/10",
    chipClass: "border-primary/40 bg-primary/10 text-primary",
  },
  {
    value: "success",
    label: msg("Buena noticia"),
    icon: Check,
    iconClass: "text-emerald-400 bg-emerald-500/10",
    chipClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  },
  {
    value: "warning",
    label: msg("Aviso"),
    icon: TriangleAlert,
    iconClass: "text-amber-400 bg-amber-500/10",
    chipClass: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  },
  {
    value: "error",
    label: msg("Urgente"),
    icon: AlertCircle,
    iconClass: "text-red-400 bg-red-500/10",
    chipClass: "border-destructive/40 bg-destructive/10 text-destructive",
  },
];

const DURACIONES = [5, 10, 20, 30];

const MAX_TITULO = 60;
const MAX_MENSAJE = 280;

const PLANTILLAS: { label: string; title: string; message: string; type: Tipo; duration: number }[] = [
  {
    label: msg("Reinicio en 5 min"),
    title: msg("Reinicio del servidor"),
    message: msg("El servidor se reinicia en 5 minutos. Guarda lo que estés haciendo y ponte en un sitio seguro."),
    type: "warning",
    duration: 20,
  },
  {
    label: msg("Reinicio en 1 min"),
    title: msg("Reinicio inminente"),
    message: msg("El servidor se reinicia en 1 minuto."),
    type: "error",
    duration: 20,
  },
  {
    label: msg("Evento"),
    title: msg("Evento"),
    message: msg("Empieza un evento en unos minutos. ¡Estad atentos!"),
    type: "info",
    duration: 10,
  },
];

export function AnnounceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<Tipo>("info");
  const [duration, setDuration] = useState(10);
  const [sound, setSound] = useState(true);
  const [sending, setSending] = useState(false);

  const tipo = TIPOS.find((t) => t.value === type) ?? TIPOS[0];
  const texto = message.trim();
  const canSend = texto.length > 0 && texto.length <= MAX_MENSAJE && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/server/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), message: texto, type, duration: duration * 1000, sound }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        toast.error(t("El anuncio no se ha enviado"), {
          description: data.error || t("El agente rechazó la orden."),
          duration: 9000,
        });
        return;
      }

      if (data.confirmed) {
        toast.success(t("Anuncio enviado"), { description: t("Ya está en la pantalla de todos los jugadores.") });
      } else {
        toast.warning(t("Anuncio enviado sin confirmación"), {
          description:
            t("La consola aceptó la orden, pero el juego no respondió a tiempo. Mira la consola por si el recurso vxcore dio algún error."),
          duration: 9000,
        });
      }
      setMessage("");
      setTitle("");
      onOpenChange(false);
    } catch {
      toast.error(t("El agente VXCore no responde."));
    } finally {
      setSending(false);
    }
  };

  const Icono = tipo.icon;

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-sky-400" />
            {t("Anuncio para todos")}
          </DialogTitle>
          <DialogDescription>
            {t("Aparece como notificación en la pantalla de cada jugador conectado.")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-1">
          <div className="flex flex-wrap gap-1.5">
            {PLANTILLAS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setTitle(t(p.title));
                  setMessage(t(p.message));
                  setType(p.type);
                  setDuration(p.duration);
                }}
                className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
              >
                {t(p.label)}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anuncio-titulo" className="text-xs">
              {t("Título")}{" "}<span className="font-normal text-muted-foreground">{t("(opcional)")}</span>
            </Label>
            <Input
              id="anuncio-titulo"
              value={title}
              maxLength={MAX_TITULO}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Anuncio")}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="anuncio-mensaje" className="text-xs">
                {t("Mensaje")}
              </Label>
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  message.length > MAX_MENSAJE - 20 ? "text-amber-400" : "text-muted-foreground"
                )}
              >
                {message.length}/{MAX_MENSAJE}
              </span>
            </div>
            <Textarea
              id="anuncio-mensaje"
              value={message}
              maxLength={MAX_MENSAJE}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={t("El servidor se reinicia en 5 minutos…")}
              rows={3}
              className="resize-none text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Tipo")}</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Tipo de anuncio")}>
                {TIPOS.map((tipo) => (
                  <button
                    key={tipo.value}
                    type="button"
                    role="radio"
                    aria-checked={type === tipo.value}
                    onClick={() => setType(tipo.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
                      type === tipo.value
                        ? tipo.chipClass
                        : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <tipo.icon className="size-3" />
                    {t(tipo.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("Duración")}</Label>
              <div className="flex gap-1" role="radiogroup" aria-label={t("Duración en pantalla")}>
                {DURACIONES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={duration === s}
                    onClick={() => setDuration(s)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] tabular-nums transition-colors",
                      duration === s
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {s} s
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <label htmlFor="anuncio-sonido" className="flex min-w-0 cursor-pointer items-center gap-2">
              {sound ? (
                <Volume2 className="size-4 shrink-0 text-sky-400" />
              ) : (
                <VolumeX className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="block text-xs font-medium">{t("Sonido al aparecer")}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {sound ? t("Suena un carillón a todos los jugadores.") : t("El anuncio aparece en silencio.")}
                </span>
              </span>
            </label>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => reproducirSonidoAviso(0.5)}
                title={t("Escuchar el sonido aquí")}
              >
                <Play className="size-3" />
                {t("Probar")}
              </Button>
              <Switch id="anuncio-sonido" checked={sound} onCheckedChange={setSound} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("Así lo verán en el juego")}</Label>
            <div className="flex justify-center rounded-xl bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.08),transparent_60%),linear-gradient(135deg,#1a1d24,#0f1115)] px-4 py-6">
              <div className="flex w-max max-w-full items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 border-r border-border px-2.5",
                    tipo.iconClass.split(" ").filter((c) => c.startsWith("bg-")).join(" ")
                  )}
                >
                  <Icono
                    className={cn(
                      "size-3.5 shrink-0",
                      tipo.iconClass.split(" ").filter((c) => c.startsWith("text-")).join(" ")
                    )}
                    strokeWidth={2.5}
                  />
                  <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-foreground">
                    {title.trim() || t("Anuncio")}
                  </span>
                </div>
                <p
                  className={cn(
                    "line-clamp-3 min-w-0 max-w-[340px] break-words px-2.5 py-1.5 text-[12.5px] font-semibold leading-snug",
                    texto ? "text-foreground" : "italic text-muted-foreground/60"
                  )}
                >
                  {texto || t("Escribe el mensaje…")}
                </p>
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t("Cancelar")}
          </Button>
          <Button onClick={send} disabled={!canSend} title={t("Enviar (Ctrl+Enter)")}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
            {sending ? t("Enviando…") : t("Enviar anuncio")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
