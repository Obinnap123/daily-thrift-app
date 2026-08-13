import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Davchuks Daily Thrift",
    short_name: "Davchuks",
    description:
      "Manage daily thrift collections, customer savings, payouts, and operational records.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "any",
    background_color: "#f4f7f5",
    theme_color: "#047857",
    categories: ["finance", "business", "productivity"],
    lang: "en-NG",
    dir: "ltr",
    prefer_related_applications: false,
    launch_handler: {
      client_mode: "focus-existing",
    },
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
