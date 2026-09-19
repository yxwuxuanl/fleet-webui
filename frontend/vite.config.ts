import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageVersion = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8")).version;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(packageVersion) },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  build: {
    outDir: path.resolve(rootDir, "../server/dist"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8080",
    },
  },
});
