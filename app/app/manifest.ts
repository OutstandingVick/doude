import type { MetadataRoute } from "next";

export const THEME_COLOR = "#d7f26b";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Feasibility3D",
    short_name: "Feasibility3D",
    description: "Every spill found, measured and recorded.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f0",
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
