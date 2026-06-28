import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENYLA — Orçamentos",
    short_name: "ENYLA",
    description: "KPIs e orçamentos de embalagens e caixas",
    start_url: "/mobile",
    display: "standalone",
    background_color: "#F2F2F7",
    theme_color: "#5009c4",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }
}
