import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VXCore — Panel de control para servidores FiveM",
    short_name: "VXCore",
    description:
      "Gestiona jugadores, consola, recursos, sanciones y base de datos de tu servidor de FiveM en tiempo real.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#090a0c",
    theme_color: "#090a0c",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/vertex/logo-mark.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/vertex/logo.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
