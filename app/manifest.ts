import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SPD Field Sales",
    short_name: "SPD",
    description: "Internal field-sales workflow for agents, managers, and accounting.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#10233f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
