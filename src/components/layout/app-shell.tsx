"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { FirewallPermissionDialog } from "@/components/dashboard/firewall-dialog";
import { FloatingConsole } from "@/components/dashboard/floating-console";
import { isPopoutPath } from "@/lib/popout";
import { MotionRoot, PageTransition } from "@/components/layout/motion";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isPopoutPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <MotionRoot>
      <OnboardingGate>
        <DesktopTitlebar />

        <div className="flex flex-1 min-h-0 w-full">
          <TooltipProvider delay={0}>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset className="flex flex-1 flex-col overflow-hidden bg-background min-w-0">
                <AppHeader />
                <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background/50 p-4 md:p-6 lg:p-8 min-h-0">
                  <PageTransition>{children}</PageTransition>
                </main>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
        </div>

        <FloatingConsole />
      </OnboardingGate>

      <FirewallPermissionDialog />
    </MotionRoot>
  );
}
