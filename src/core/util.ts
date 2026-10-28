// Pomocné funkce pro věrný přepis C++ aritmetiky.

/** Celočíselné dělení jako v C/C++ (zaokrouhlení k nule, i pro záporná čísla). */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b) | 0;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Hexadecimální číslo velkými písmeny doplněné nulami (jako printf "%0NX"). */
export function hex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, "0");
}
