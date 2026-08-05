import path from "node:path";
import process from "node:process";

import react from "@vitejs/plugin-react";
import { build } from "vite";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

await build({
  root: repositoryRoot,
  configFile: false,
  appType: "mpa",
  plugins: [react()],
  build: {
    outDir: path.join(repositoryRoot, "dist-book-builder"),
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: { input: path.join(repositoryRoot, "builder.html") },
  },
});

process.stdout.write("Publisher Review Studio client built in dist-book-builder.\n");
