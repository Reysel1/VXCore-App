"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Panel] Error de render:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
      <div className="size-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <AlertTriangle className="size-8 text-red-400" />
      </div>
      <div className="space-y-1 max-w-md">
        <h2 className="text-xl font-bold">{t("Esta pantalla falló")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("No es tu culpa ni pierdes nada: el resto del panel sigue funcionando. Vuelve a intentarlo o navega a otra sección.")}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono pt-1">{error.digest}</p>
        )}
      </div>
      <Button onClick={reset} variant="outline">
        <RotateCcw className="mr-2 size-4" />{" "}{t("Reintentar")}
      </Button>
    </div>
  );
}
