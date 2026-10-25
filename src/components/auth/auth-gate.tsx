"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/context/auth-context";
import { t } from "@/i18n";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { needsLogin, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === "/acceso";
  const blocked = !loading && needsLogin && !isLoginPage;

  useEffect(() => {
    if (blocked) router.replace("/acceso");
  }, [blocked, router]);

  if (!blocked) return <>{children}</>;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("Este panel necesita que te identifiques…")}</p>
      </div>
    </div>
  );
}
