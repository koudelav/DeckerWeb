/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Výstup je jedna samostatná HTML stránka (grafika a zvuky vložené jako data URI),
// aby šla publikovat jako artefakt bez dalších souborů.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    target: "es2022",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
