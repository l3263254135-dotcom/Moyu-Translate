import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://l3263254135-dotcom.github.io",
  base: "/Moyu-Translate",
  output: "static",
  integrations: [react(), sitemap()],
  vite: {
    build: { target: "es2022" },
  },
});
