// Kostra aplikace: obrazovky, přepínání sekcí, provádění akcí, události z plynutí času, autosave.
import type { GameEvent, PassTimeResult } from "../core/character";
import { installReadyChip } from "../core/character";
import type { Game } from "../core/game";
import { AUTOSAVE_ID, deleteSlot, saveToSlot } from "../storage";
import { h } from "./dom";
import { confirmDialog, message } from "./modal";
import { renderHome } from "./views/home";
import { renderIntro } from "./views/intro";
import { renderNewCharacter } from "./views/newchar";
import { renderMatrixScreen } from "./matrix/screen";

export type View = "character" | "deck" | "contracts" | "shop" | "projects" | "rest" | "matrix" | "options";
export type Screen = "intro" | "newChar" | "home" | "matrix";

export interface App {
  screen: Screen;
  view: View;
  game: Game | null;
  /** Výběry a rozpracované formuláře jednotlivých sekcí (nepatří do savu). */
  ui: Record<string, unknown>;
  render(): void;
  go(screen: Screen): void;
  show(view: View): void;
  startGame(game: Game): void;
  /** Provede akci nad hrou: chybu ukáže jako hlášku, pak uloží a překreslí. */
  act(fn: () => void | string | Promise<void | string>): Promise<void>;
  /** Zobrazí události z plynutí času (nájem, nový týden, hotový čip…). Vrací false při konci hry. */
  handleTime(result: PassTimeResult): Promise<boolean>;
  /** Automatické uložení (po každé akci). */
  save(): void;
}

const root = () => document.querySelector<HTMLDivElement>("#app")!;

export function createApp(): App {
  const app: App = {
    screen: "intro",
    view: "character",
    game: null,
    ui: {},
    render() {
      const r = root();
      const scrollY = window.scrollY;
      const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.focus;
      r.replaceChildren(
        app.screen === "intro" ? renderIntro(app)
          : app.screen === "newChar" ? renderNewCharacter(app)
            : app.screen === "matrix" && app.game?.run ? renderMatrixScreen(app)
              : renderHome(app),
      );
      if (focusKey) r.querySelector<HTMLElement>(`[data-focus="${focusKey}"]`)?.focus();
      window.scrollTo({ top: scrollY });
    },
    go(screen) {
      app.screen = screen;
      app.render();
    },
    show(view) {
      app.view = view;
      app.render();
      root().querySelector<HTMLElement>(".view h1")?.focus({ preventScroll: true });
    },
    startGame(game) {
      app.game = game;
      app.ui = {};
      app.view = "character";
      app.screen = game.run ? "matrix" : "home";
      autosave(app);
      app.render();
    },
    async act(fn) {
      try {
        const msg = await fn();
        if (typeof msg === "string" && msg) await message(msg);
      } catch (e) {
        await message((e as Error).message);
      }
      autosave(app);
      app.render();
    },
    save() {
      autosave(app);
    },
    async handleTime(result) {
      for (const ev of result.events) await showEvent(app, ev);
      if (result.gameOver) {
        // Automatické uložení by vrátilo hru před krach – smaže se. Ruční savy zůstávají (jako v originálu).
        deleteSlot(AUTOSAVE_ID);
        app.game = null;
        app.go("intro");
        return false;
      }
      return true;
    },
  };
  return app;
}

async function showEvent(app: App, ev: GameEvent): Promise<void> {
  if (ev.kind === "chipReady") {
    const yes = await confirmDialog(ev.message, { title: "Chip complete", yes: "Install", no: "Discard" });
    await message(installReadyChip(app.game!.character, yes));
    return;
  }
  const titles: Partial<Record<GameEvent["kind"], string>> = {
    rent: "Rent", lifestyleDowngrade: "Rent", gameOver: "Game over", contractFailed: "Contract failed",
    newWeek: "New week", orderArrived: "Delivery",
  };
  await message(ev.message, titles[ev.kind] ?? "Decker");
}

function autosave(app: App): void {
  if (!app.game) return;
  try {
    saveToSlot(app.game, AUTOSAVE_ID);
  } catch {
    /* úložiště nedostupné – hra jede dál, upozornění je v Options */
  }
}

/** Tlačítko, které při stisku spustí akci přes app.act. */
export function actionButton(app: App, label: string, fn: () => void | string | Promise<void | string>, opts: { primary?: boolean; disabled?: boolean; title?: string; focus?: string } = {}): HTMLButtonElement {
  return h("button", {
    class: opts.primary ? "primary" : undefined,
    disabled: opts.disabled,
    title: opts.title,
    dataset: opts.focus ? { focus: opts.focus } : undefined,
    onclick: () => void app.act(fn),
  }, label);
}
