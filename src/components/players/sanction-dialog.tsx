"use client";

import { useState } from "react";
import { Ban, Loader2, MessageSquareWarning, UserMinus } from "lucide-react";
import { toast } from "sonner";

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
import {
  DURATIONS,
  SANCTION_COPY,
  type PlayerIdentity,
  type SanctionType,
  createSanction,
} from "@/lib/sanctions";
import { t } from "@/i18n";

const ICONS: Record<SanctionType, typeof Ban> = {
  ban: Ban,
  kick: UserMinus,
  warn: MessageSquareWarning,
};

const TONES: Record<SanctionType, string> = {
  ban: "bg-red-600 hover:bg-red-700 text-white",
  kick: "bg-orange-600 hover:bg-orange-700 text-white",
  warn: "bg-amber-500 hover:bg-amber-600 text-black",
};

export function SanctionDialog({
  open,
  onOpenChange,
  type,
  player,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: SanctionType;
  player: { name: string; identity?: PlayerIdentity; online?: boolean } | null;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!player) return null;

  const copy = SANCTION_COPY[type];
  const Icon = ICONS[type];

  const submit = async () => {
    const motivo = reason.trim();
    if (!motivo) {
      toast.error(t("Escribe el motivo"), {
        description: t("Es lo que verá esta persona y lo que leerá el staff en su historial."),
      });
      return;
    }

    setSaving(true);
    const result = await createSanction({
      type,
      playerName: player.name,
      identity: player.identity ?? {},
      reason: motivo,
      durationMinutes: type === "ban" ? minutes : 0,
    });
    setSaving(false);

    if (!result.success) {
      toast.error(t("No se pudo {accion}", { accion: t(copy.title).toLowerCase() }), {
        description: result.error,
        duration: 8000,
      });
      return;
    }

    const duracion =
      type === "ban"
        ? minutes === 0
          ? " " + t("de forma permanente")
          : " " + t("durante {duracion}", { duracion: t(DURATIONS.find((d) => d.minutes === minutes)?.label ?? "").toLowerCase() })
        : "";

    toast.success(`${player.name} ${t(copy.verb)}${duracion}`, { description: motivo });
    onOpenChange(false);
    onDone?.();
  };

  const identifiers = Object.entries(player.identity ?? {}).filter(
    ([key, value]) => key !== "tokens" && typeof value === "string" && value
  ).length;
  const tokens = player.identity?.tokens?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{t("{accion} a {nombre}", { accion: t(copy.title), nombre: player.name })}</span>
          </DialogTitle>
          <DialogDescription>{t(copy.hint)}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("Motivo")}</label>
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) void submit();
              }}
              placeholder={t("Qué ha pasado")}
              maxLength={500}
            />
          </div>

          {type === "ban" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("Duración")}</label>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d.minutes}
                    type="button"
                    onClick={() => setMinutes(d.minutes)}
                    className={
                      "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                      (minutes === d.minutes
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground")
                    }
                  >
                    {t(d.label)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
            {t("Se guardan")}{" "}<strong className="text-foreground/90">{identifiers}</strong>{" "}{t("identificador(es)")}
            {tokens > 0 && (
              <>
                {" "}y <strong className="text-foreground/90">{tokens}</strong>{" "}{t("token(s) de hardware")}
              </>
            )}
            . {tokens > 0
              ? t("Con los tokens, la sanción sigue valiendo aunque vuelva con otra cuenta.")
              : t("Sin tokens de hardware sólo se le reconoce por su cuenta; reinstalando podría volver.")}
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="destructive" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("Cancelar")}
          </Button>
          <Button className={TONES[type]} onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
            {t(copy.title)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
