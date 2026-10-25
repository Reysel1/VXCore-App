"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useServerContext } from "@/context/server-context";
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar";
import { SetupGuide } from "@/components/onboarding/setup-guide";
import { WelcomeFrame } from "@/components/welcome/welcome-frame";

const ALWAYS_ALLOWED = ["/servers", "/settings", "/acceso"];

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { loading, onboarding } = useServerContext();
  const pathname = usePathname();

  if (ALWAYS_ALLOWED.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <>
        <DesktopTitlebar />
        <div className="flex flex-1 items-center justify-center bg-background">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (onboarding) {
    return (
      <WelcomeFrame step="server">
        <SetupGuide />
      </WelcomeFrame>
    );
  }

  return <>{children}</>;
}
