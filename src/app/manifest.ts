import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_TITLE } from "./layout";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: SITE_TITLE,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#171717",
    theme_color: "#171717",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/metadata/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/metadata/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
