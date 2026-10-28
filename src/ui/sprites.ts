// Sprity z image listů originálu (pruhy ikon stejné velikosti).
import { image } from "../assets";
import { h } from "./dom";

export interface Strip {
  name: string;
  size: number;
  count: number;
  height?: number;
}

export const STRIPS = {
  characters: { name: "MISC_Characters", size: 24, count: 17 },
  items: { name: "ITEM_IL", size: 16, count: 3 },
  software: { name: "software_il", size: 16, count: 52 },
  ice: { name: "il_ice", size: 24, count: 80 },
} satisfies Record<string, Strip>;

/** Jeden snímek z pruhu ikon, zvětšený `scale`× s ostrými pixely. */
export function sprite(strip: Strip, index: number, scale = 2, title?: string): HTMLSpanElement {
  const url = image(strip.name);
  const s = strip.size * scale;
  // il_ice je mřížka 10 × 8, ostatní jsou vodorovné pruhy
  const perRow = strip.name === "il_ice" ? 10 : strip.count;
  const col = index % perRow, row = Math.floor(index / perRow);
  const rows = Math.ceil(strip.count / perRow);
  return h("span", {
    class: "sprite",
    role: title ? "img" : undefined,
    "aria-label": title,
    "aria-hidden": title ? undefined : "true",
    title,
    style: `width:${s}px;height:${s}px;background-image:url(${url});background-size:${perRow * s}px ${rows * s}px;background-position:-${col * s}px -${row * s}px`,
  });
}

export function pixelImg(name: string, scale: number, alt = ""): HTMLImageElement {
  const img = h("img", { src: image(name), alt, class: "pixel" });
  img.addEventListener("load", () => {
    img.style.width = `${img.naturalWidth * scale}px`;
  }, { once: true });
  return img;
}
