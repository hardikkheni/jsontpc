import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    splitting: false,
    clean: true,
    outDir: "dist",
  },
  {
    entry: { index: "src/index.ts" },
    format: ["cjs"],
    dts: true,
    splitting: false,
    clean: false,
    outDir: "dist",
  },
]);
