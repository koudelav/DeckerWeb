// Seedovatelný generátor náhodných čísel.
//
// Originál používal srand()/rand() z C knihovny. Tady je sfc32 se stavem, který jde uložit
// do savu: po načtení hry pokračuje stejná posloupnost hodů. Stejný seed => stejný svět,
// což se hodí pro testy a ladění.

export type RngState = [number, number, number, number];

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | RngState = Date.now()) {
    if (Array.isArray(seed)) {
      [this.a, this.b, this.c, this.d] = seed.map((v) => v >>> 0) as RngState;
    } else {
      // splitmix32 pro rozprostření jednoho čísla do 4 slov stavu
      let s = seed >>> 0;
      const next = () => {
        s = (s + 0x9e3779b9) >>> 0;
        let z = s;
        z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
        z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
        return (z ^ (z >>> 16)) >>> 0;
      };
      this.a = next();
      this.b = next();
      this.c = next();
      this.d = next();
      for (let i = 0; i < 12; i++) this.nextUint32();
    }
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  nextUint32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  /** Global.cpp Random(nMax): celé číslo 0..max-1. */
  random(max: number): number {
    if (max <= 0) throw new Error(`random(${max}): max musí být > 0`);
    return Math.floor((this.nextUint32() / 4294967296) * max);
  }

  /** Global.cpp Random2(nCount, nMax): součet `count` hodů random(max). */
  random2(count: number, max: number): number {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += this.random(max);
    return sum;
  }

  /** Global.cpp ChooseRot(): +1 (po směru hodin) nebo -1. */
  chooseRot(): 1 | -1 {
    return this.random(2) === 1 ? 1 : -1;
  }
}
