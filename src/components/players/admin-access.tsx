"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
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
import { type AdminGroup, preferredIdentifier, usePrincipals } from "@/lib/principals";
import type { PlayerIdentity } from "@/lib/sanctions";
import { t } from "@/i18n";

export function AdminAccessDialog({
  open,
  onOpenChange,
  player,
  cfgPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: { name: string; identity?: PlayerIdentity } | null;
  cfgPath?: string;
}) {
  const { groups, groupOf, grant, revoke, loading } = usePrincipals(cfgPath);
  const [working, setWorking] = useState(false);

  if (!player) return null;

  const identifier = preferredIdentifier(player.identity);
  const current = groupOf(identifier);

  const apply = async (group: AdminGroup | null) => {
    if (!identifier) return;
    setWorking(true);
    const result = group ? await grant(identifier, group) : await revoke(identifier);
    setWorking(false);

    if (!result.success) {
      toast.error(t("No se pudo cambiar el permiso"), { description: result.error, duration: 8000 });
      return;
    }

    const what = group ? t("ahora es {group}", { group }) : t("ya no tiene permisos de administración");
    toast.success(`${player.name} ${what}`, {
      description: result.appliedLive
        ? t("Aplicado en el servidor sin reiniciar.")
        : t("Guardado en el server.cfg. Se aplicará al arrancar el servidor."),
      duration: 7000,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{t("Permisos de {name}", { name: player.name })}</span>
          </DialogTitle>
          <DialogDescription>
            {t("Dentro del juego, no en el panel. Para dar acceso a VXCore se usan las invitaciones de Colaboradores.")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3 py-2">
          {!identifier ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-200">
              {t("Este jugador no tiene ningún identificador con el que dar permisos. Sólo llegan de quien está conectado: haz que entre al servidor y vuelve a intentarlo.")}
            </p>
          ) : (
            <>
              <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">{t("Se le dará por")}</p>
                <p className="truncate font-mono text-[11px] text-foreground/90">{identifier}</p>
              </div>

              {loading ? (
                <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />{" "}{t("Leyendo el server.cfg…")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {groups.map((option) => {
                    const isCurrent = current === option.group;
                    return (
                      <button
                        key={option.group}
                        type="button"
                        disabled={working}
                        onClick={() => void apply(option.group)}
                        className={
                          "w-full rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 " +
                          (isCurrent
                            ? "border-primary bg-primary/15"
                            : "border-border/60 hover:border-border hover:bg-muted/40")
                        }
                      >
                        <span className="flex items-center justify-between text-xs font-medium">
                          {option.group}
                          {isCurrent && <span className="text-[10px] text-primary">{t("actual")}</span>}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{option.label}</span>
                      </button>
                    );
                  })}

                  {current && !groups.some((g) => g.group === current) && (
                    <p className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
                      {t("Hoy está en")}{" "}<span className="font-mono text-foreground/80">{t("group.{current}", { current })}</span>{t(", un grupo propio de tu servidor. Puedes quitárselo, pero para cambiarlo hay que editar el server.cfg.")}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="destructive" onClick={() => onOpenChange(false)} disabled={working}>
            {t("Cerrar")}
          </Button>
          {current && identifier && (
            <Button variant="destructive" onClick={() => void apply(null)} disabled={working}>
              {working ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldX className="size-3.5" />}
              {t("Quitar permisos")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
