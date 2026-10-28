// Přehrávání zvuků podle mapování z Decker.ini.
import { sounds } from "../assets";
import { DEFAULT_SOUND_FILES, SOUND_KEYS } from "../core/data/sounds";

let enabled = true;
try {
  enabled = localStorage.getItem("decker-remaster:sound") !== "off";
} catch {
  /* výchozí zapnuto */
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem("decker-remaster:sound", on ? "on" : "off");
  } catch {
    /* nic */
  }
}

/** Přehraje zvuk podle indexu SOUND_* (−1 = nic). */
export function playSound(id: number): void {
  if (!enabled || id < 0) return;
  const key = SOUND_KEYS[id];
  if (!key) return;
  const file = DEFAULT_SOUND_FILES[key];
  if (!file) return;
  const url = sounds[file.replace(/\.wav$/i, "")];
  if (!url) return;
  try {
    void new Audio(url).play().catch(() => undefined);
  } catch {
    /* prohlížeč přehrávání odmítl */
  }
}
