// Připraví dist/index.html pro publikaci jako artefakt na claude.ai:
// artefakt si stránku sám obalí do <!doctype html><head><body>, proto se posílá jen obsah
// (title na začátku, bez vlastního viewport meta – kostra artefaktu má vlastní s viewport-fit=cover).
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const head = src.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
const body = src.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
const title = head.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? "<title>Decker Remaster</title>";
const rest = head
  .replace(/<title>[\s\S]*?<\/title>/i, "")
  .replace(/<meta[^>]+charset[^>]*>/i, "")
  .replace(/<meta[^>]+name="viewport"[^>]*>/i, "");
const out = `${title}\n${rest.trim()}\n${body.trim()}\n`;
writeFileSync(new URL("../dist/decker-artifact.html", import.meta.url), out);
console.log(`dist/decker-artifact.html: ${(out.length / 1024).toFixed(0)} kB`);
