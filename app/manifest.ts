import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENYLA — Orçamentos",
    short_name: "ENYLA",
    description: "KPIs e orçamentos de embalagens e caixas",
    start_url: "/mobile",
    display: "standalone",
    background_color: "#F2F2F7",
    theme_color: "#007AFF",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  }
}
