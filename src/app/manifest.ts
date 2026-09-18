import type { MetadataRoute } from "next";
import { DECK } from "@/data";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: DECK.title,
    short_name: DECK.title,
    description: DECK.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#171717",
    theme_color: "#171717",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
