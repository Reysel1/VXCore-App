import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ServerProvider } from "@/context/server-context";
import { AuthProvider } from "@/context/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";
import { I18nProvider } from "@/i18n/provider";
import { LanguageGate } from "@/components/welcome/language-gate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const TITLE = "VXCore — Panel de control para servidores FiveM";
const DESCRIPTION =
  "Gestiona jugadores, consola, recursos, sanciones y base de datos de tu servidor de FiveM en tiempo real, desde el escritorio o el navegador.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · VXCore",
  },
  description: DESCRIPTION,
  applicationName: "VXCore",
  generator: "Next.js",
  category: "technology",
  keywords: [
    "FiveM",
    "FXServer",
    "panel de control",
    "servidor FiveM",
    "administración",
    "VXCore",
  ],
  authors: [{ name: "VXCore" }],
  creator: "VXCore",
  publisher: "VXCore",
  alternates: { canonical: "/" },

  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },

  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "VXCore",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },

  formatDetection: { telephone: false, email: false, address: false },

  appleWebApp: {
    capable: true,
    title: "VXCore",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#090a0c",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground">
        <I18nProvider>
        <AuthProvider>
          <LanguageGate>
            <AuthGate>
              <ServerProvider>
                <AppShell>{children}</AppShell>
              </ServerProvider>
            </AuthGate>
          </LanguageGate>
          <Toaster position="bottom-right" richColors closeButton />
        </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
