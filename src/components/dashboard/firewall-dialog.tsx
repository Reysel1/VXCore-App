"use client";

import { useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useServerContext } from "@/context/server-context";
import { t } from "@/i18n";

export function FirewallPermissionDialog() {
  const { firewallRequest, allowFirewall, dismissFirewall } = useServerContext();
  const [allowing, setAllowing] = useState(false);

  const handleAllow = async () => {
    if (allowing) return;
    setAllowing(true);
    try {
      await allowFirewall();
    } finally {
      setAllowing(false);
    }
  };

  return (
    <Dialog
      open={!!firewallRequest}
      onOpenChange={(open) => {
        if (!open && !allowing) dismissFirewall();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <ShieldAlert className="size-5" />
          </div>
          <DialogTitle>{t("Permiso de Windows Firewall")}</DialogTitle>
          <DialogDescription>
            {t("Para que tu servidor FiveM funcione, Windows debe permitir que FXServer se comunique por la red. VXCore lo pedirá una sola vez: al confirmar aparecerá una ventana de Windows que debes aceptar con")}{" "}<strong className="text-foreground">«Sí»</strong>{" "}{t("— después el servidor arrancará solo y no volverá a preguntar. Si prefieres no darlo ahora, no pasa nada: lo único es que el servidor se queda parado.")}
          </DialogDescription>
        </DialogHeader>

        {firewallRequest && (
          <div className="break-all rounded-lg border border-border/50 bg-muted/20 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {firewallRequest.program}
          </div>
        )}

        <DialogFooter>
          <Button variant="destructive" onClick={dismissFirewall} disabled={allowing}>
            {t("Ahora no")}
          </Button>
          <Button onClick={handleAllow} disabled={allowing}>
            {allowing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {allowing ? t("Esperando confirmación de Windows…") : t("Permitir y arrancar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
