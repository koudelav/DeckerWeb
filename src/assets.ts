// Přístup ke grafice a zvukům převedeným z originálu (tools/convert_assets.py).
// Klíčem je původní název souboru bez přípony, např. "MATRIX_Main" nebo "il_ice".

const graphicsFiles = import.meta.glob<string>("../assets/graphics/*.png", { eager: true, query: "?url", import: "default" });
const resFiles = import.meta.glob<string>("../assets/res/*.png", { eager: true, query: "?url", import: "default" });
const soundFiles = import.meta.glob<string>("../assets/sound/*.wav", { eager: true, query: "?url", import: "default" });

function byName(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(files)) {
    const name = path.split("/").pop()!.replace(/\.[^.]+$/, "");
    out[name] = url;
  }
  return out;
}

export const graphics = byName(graphicsFiles);
export const res = byName(resFiles);
export const sounds = byName(soundFiles);

export function image(name: string): string {
  const url = graphics[name] ?? res[name];
  if (!url) throw new Error(`Neznámý obrázek: ${name}`);
  return url;
}
