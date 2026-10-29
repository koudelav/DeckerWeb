import { describe, expect, it } from "vitest";
import { Game } from "../src/core/game";
import { acceptContract, generateContracts } from "../src/core/contract";
import { ContractType, FileState, FileType, IceState, IceType, ProgramClass, StartBonus } from "../src/core/constants";
import { DumpCause, Run } from "../src/core/matrix/run";
import { NODE_GRIDS } from "../src/core/data/texts";

const opts = { name: "Bot", image: 0, ironMan: false, tooltips: false, bonus: StartBonus.Software };

function checkInvariants(run: Run) {
  const s = run.s;
  const sys = s.system;
  // seznam ICE v nodu odpovídá aktivním ICE v nodu
  const here = sys.iceList.filter((id) => sys.ice[id]!.nodeId === s.nodeId).sort();
  expect([...s.currentIce].sort()).toEqual(here);
  if (s.targetIceId !== null) expect(s.currentIce).toContain(s.targetIceId);
  for (const id of sys.iceList) {
    const ice = sys.ice[id]!;
    expect(sys.deadIce).not.toContain(id);
    expect(ice.health).toBeGreaterThan(0);
    expect(ice.x).toBeGreaterThanOrEqual(0);
    expect(ice.x).toBeLessThanOrEqual(8);
  }
  expect(new Set(sys.iceList).size).toBe(sys.iceList.length);
  expect(run.ch.health.deck).toBeLessThanOrEqual(20);
}

/** Jednoduchý bot: náhodně chodí, útočí na cíl, skenuje, stahuje, používá I/O. */
export function playBot(seed: number, maxTurns = 400, log?: string[], level = 0): Run {
  const g = Game.newGame(opts, seed);
  if (level > 0) {
    // silnější postava a těžší kontrakty
    const ch = g.character;
    ch.repLevel = level;
    ch.lifestyle = 4;
    for (const k of Object.keys(ch.skills) as (keyof typeof ch.skills)[]) ch.skills[k] = Math.ceil(level / 2) + 2;
    ch.chips.fill(Math.ceil(level / 2) + 2);
    ch.contracts = [];
    generateContracts(g, ch);
  }
  acceptContract(g, g.character, 0);
  const run = g.jackIn(false);
  let rnd = seed * 7919;
  const pick = (n: number) => (rnd = (rnd * 1103515245 + 12345) % 2147483648) % n;
  for (let t = 0; t < maxTurns && !run.ended; t++) {
    checkInvariants(run);
    const c = run.controls();
    const roll = pick(12);
    try {
      if (run.s.currentIce.length && roll < 4) {
        run.nextTarget();
        if (c.attack || run.controls().attack) run.attack();
        else run.wait();
      } else if (roll === 4 && c.scan) {
        run.runBest(ProgramClass.Scan, "Scan");
      } else if (roll === 5 && c.node.files) {
        if (run.accessFiles()) {
          const f = run.visibleFiles().find((x) => run.canFileOp(x, "get"));
          if (f && !run.transferInProgress) run.fileOperation("get", f.id);
          else run.wait();
        }
      } else if (roll === 6 && c.node.useIo) {
        run.useIO();
      } else if (roll === 7 && c.node.enterPortal) {
        run.enterPortal();
      } else if (roll === 8 && run.s.currentIce.length) {
        run.nextTarget();
        if (run.controls().deceive) run.runBest(ProgramClass.Deceive, "Deceive");
        else run.wait();
      } else {
        const dirs = [0, 1, 2, 3].filter((d) => c.move[d]) as (0 | 1 | 2 | 3)[];
        if (dirs.length) run.move(dirs[pick(dirs.length)]!);
        else run.wait();
      }
    } catch (e) {
      // akce odmítnutá pravidly (např. přetížení) – v pořádku, ale nesmí jít o chybu programu
      if (!(e instanceof Error) || /undefined|null|Cannot read/.test(e.message)) throw e;
      run.wait();
    }
    for (const m of run.drain().messages) log?.push(m.text);
  }
  if (!run.ended) run.disconnect();
  return run;
}

describe("run v Matrixu – bot", () => {
  it("100 runů bez chyb, invarianty drží, run skončí výsledkem", () => {
    const causes = new Map<DumpCause, number>();
    for (let seed = 1; seed <= 100; seed++) {
      const run = playBot(seed);
      expect(run.ended).toBe(true);
      const end = run.s.end!;
      causes.set(end.cause, (causes.get(end.cause) ?? 0) + 1);
      expect(run.ch.onRun).toBe(false);
      if (!end.death) expect(end.status).not.toBeNull();
    }
    // bot by měl zažít různé konce runu
    expect(causes.size).toBeGreaterThanOrEqual(2);
  });
  it("100 runů ve velkých systémech (obtížnost 10–20) bez chyb", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const run = playBot(seed, 400, undefined, 10 + (seed % 11));
      expect(run.ended).toBe(true);
    }
  });
});

describe("run – vstup a pohyb", () => {
  it("start: zdraví decku a mysli 20, hráč ve vstupním portálu, aktivní výchozí programy", () => {
    const g = Game.newGame(opts, 11);
    acceptContract(g, g.character, 0);
    const run = g.jackIn(false);
    expect(run.node.id).toBe(run.sys.portalOutNodeId);
    expect(g.character.onRun).toBe(true);
    expect(g.character.health.deck).toBe(20);
    expect(run.s.active.armor).toBe(g.character.defaults.armor);
    expect(run.s.active.hide).toBe(g.character.defaults.hide);
    expect(NODE_GRIDS[run.node.type]![run.s.y]![run.s.x]).toBe(0);
    expect(run.drain().messages[0]!.text).toMatch(/^Entering node /);
  });
  it("gateway bez hide zablokuje průchod a tah uplyne", () => {
    for (let seed = 1; seed < 200; seed++) {
      const g = Game.newGame(opts, seed);
      acceptContract(g, g.character, 0);
      const run = g.jackIn(false);
      run.s.active.hide = null;
      const gw = run.currentIce().find((i) => i.type === IceType.Gateway && run.node.adj[i.subType] !== null);
      if (!gw) continue;
      const before = run.s.runTime;
      run.move(gw.subType as 0 | 1 | 2 | 3);
      if (run.ended) continue;
      const out = run.drain().messages.map((m) => m.text);
      expect(out.some((t) => t.includes("blocks you passage"))).toBe(true);
      expect(run.s.runTime).toBe(before + 1);
      return;
    }
    throw new Error("nenalezen vhodný systém");
  });
});

describe("run – uložení uprostřed runu", () => {
  it("save/load v Matrixu pokračuje stejně", () => {
    const g = Game.newGame(opts, 21);
    acceptContract(g, g.character, 0);
    g.jackIn(false);
    g.run!.wait();
    const copy = Game.fromSave(JSON.parse(JSON.stringify(g.toSave())));
    expect(copy.run).not.toBeNull();
    for (let i = 0; i < 20 && !g.run!.ended; i++) {
      g.run!.wait();
      copy.run!.wait();
    }
    expect(copy.run!.s).toEqual(g.run!.s);
    expect(copy.character).toEqual(g.character);
  });
});

describe("run – vyhodnocení", () => {
  it("Steal: stažení cílového souboru = Complete, výplata a reputace", () => {
    for (let seed = 1; seed < 400; seed++) {
      const g = Game.newGame(opts, seed);
      const ch = g.character;
      const idx = ch.contracts.findIndex((c) => c.type === ContractType.Steal && c.flags === 0);
      if (idx < 0) continue;
      acceptContract(g, ch, idx);
      const run = g.jackIn(false);
      for (const n of run.sys.nodes) for (const f of n.files) if (f.type === FileType.Quest) f.state |= FileState.InDeck;
      const pay = ch.currentContract!.pay;
      const credits = ch.credits;
      run.disconnect();
      const end = run.s.end!;
      expect(end.status!.code).toBe(1);
      expect(end.pay).toBe(pay);
      expect(ch.credits).toBeGreaterThanOrEqual(credits + pay - 500); // případný nájem
      expect(ch.currentContract).toBeNull();
      expect(ch.repPoints).toBeGreaterThan(0);
      return;
    }
    throw new Error("nenalezen kontrakt Steal");
  });
  it("odpojení bez splnění = Incomplete, kontrakt zůstane (pokud nevyprší)", () => {
    const g = Game.newGame(opts, 33);
    const ch = g.character;
    const idx = ch.contracts.findIndex((c) => c.daysLeft > 1);
    if (idx < 0) return;
    acceptContract(g, ch, idx);
    const run = g.jackIn(false);
    run.disconnect();
    expect(run.s.end!.status!.code).toBe(0);
    expect(ch.currentContract).not.toBeNull();
  });
});

describe("run – ICE", () => {
  it("útok s jistým zásahem poškodí cíl", () => {
    for (let seed = 1; seed < 300; seed++) {
      const g = Game.newGame(opts, seed);
      acceptContract(g, g.character, 0);
      const run = g.jackIn(false);
      const ice = run.currentIce().find((i) => i.type !== IceType.Tapeworm);
      if (!ice) continue;
      run.setTarget(ice.id);
      // jistý zásah: postava s obrovským útokem
      g.character.skills.attack = 60;
      g.character.chips[0] = 60;
      g.character.chips[1] = 60;
      run.attack();
      const texts = run.drain().messages.map((m) => m.text);
      expect(texts.some((t) => /damage to|missed/.test(t))).toBe(true);
      expect(texts.some((t) => t.includes("damage to"))).toBe(true);
      return;
    }
    throw new Error("nenalezen node s ICE");
  });
  it("útok na ICE vyvolá nepřátelství ostatních ICE v nodu", () => {
    for (let seed = 1; seed < 300; seed++) {
      const g = Game.newGame(opts, seed);
      acceptContract(g, g.character, 0);
      const run = g.jackIn(false);
      if (run.s.currentIce.length < 2) continue;
      run.setTarget(run.s.currentIce[0]!);
      g.character.skills.attack = -40; // jistě mine, ICE přežije
      run.attack();
      if (run.ended) continue;
      expect(run.currentIce().some((i) => i.state & IceState.MaskHostile)).toBe(true);
      return;
    }
  });
});


describe("run – konec runu", () => {
  const start = (seed: number) => {
    const g = Game.newGame(opts, seed);
    acceptContract(g, g.character, 0);
    return { g, run: g.jackIn(false) };
  };
  it("smrtelné poškození mysli = smrt a konec hry", () => {
    const { g, run } = start(41);
    run.s.damageMental = 100;
    run.wait();
    expect(run.s.end!.death).toBe(true);
    expect(run.s.end!.gameOver).toBe(true);
    expect(g.character.onRun).toBe(false);
  });
  it("Bio Monitor s AutoDump zachrání život", () => {
    const { g, run } = start(42);
    g.character.hardware[4] = 2;
    run.s.damageMental = 100;
    run.wait();
    expect(run.s.end!.death).toBe(false);
    expect(run.s.end!.cause).toBe(DumpCause.Death);
    expect(g.character.health.physical).toBe(1);
    expect(run.s.end!.messages[0]).toMatch(/AutoDump/);
  });
  it("poškození decku pod 1 = dump, zbytek jde do fyzického zdraví", () => {
    const { g, run } = start(43);
    run.s.damageDeck = 25;
    run.wait();
    if (run.s.end!.cause === DumpCause.DeckDamage) expect(g.character.health.physical).toBe(15);
  });
  it("po červeném alarmu má korporace pohotovost a další run začne na žlutém", () => {
    const { g, run } = start(44);
    run.setAlert(null, 2);
    const corp = run.sys.corporation;
    run.disconnect();
    expect(g.character.systemAlerts[corp]).toBeGreaterThan(0);
  });
});
