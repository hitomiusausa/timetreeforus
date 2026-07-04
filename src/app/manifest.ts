import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TimeTree For Us",
    short_name: "TimeTree",
    description: "家族で予定を共有するためのWebカレンダー",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3fffc",
    theme_color: "#6BE6D7",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
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
