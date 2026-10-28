// Postava (CharDataDialog).
import {
  canIncreaseSkill, canUpgradeLifestyle, daysUntilRent, effectiveLevel, increaseSkill, lifestyleName,
  lifestyleUpgradeCost, monthlyCost, repCap, skillIncreaseCost, upgradeLifestyle,
} from "../../core/character";
import { repPointsForNextLevel } from "../../core/dice";
import { REP_LEVEL_NAMES } from "../../core/data/texts";
import type { SkillName } from "../../core/state";
import { actionButton, type App } from "../app";
import { credits, h, plural } from "../dom";
import { confirmDialog } from "../modal";
import { viewTitle } from "./home";

const SKILLS: { key: SkillName; label: string; use: string }[] = [
  { key: "attack", label: "Attack", use: "Hitting ICE with attack programs" },
  { key: "defense", label: "Defense", use: "Avoiding ICE attacks" },
  { key: "stealth", label: "Stealth", use: "Staying unnoticed, deceiving ICE" },
  { key: "analysis", label: "Analysis", use: "Scanning, analyzing, decrypting" },
  { key: "programming", label: "Programming", use: "Writing programs" },
  { key: "chipDesign", label: "Chip design", use: "Designing chips" },
];

export function renderCharacter(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const next = lifestyleUpgradeCost(g.cfg, ch);
  const nextRep = repPointsForNextLevel(g.cfg, ch.repLevel);
  const cap = repCap(g.cfg, ch);
  return h("section", null,
    viewTitle("Character", h("button", { class: "quiet", onclick: () => app.show("deck") }, "View cyberdeck")),
    h("div", { class: "columns" },
      h("div", { class: "panel" },
        h("h2", null, "Skills"),
        h("p", { class: "muted" }, `Raising a skill costs as many skill points as its current level. Available: ${ch.skillPoints}.`),
        h("table", { class: "table" },
          h("thead", null, h("tr", null, h("th", null, "Skill"), h("th", { class: "num" }, "Level"), h("th", null, "Used for"), h("th", null, ""))),
          h("tbody", null, SKILLS.map((s) => h("tr", null,
            h("th", { scope: "row" }, s.label),
            h("td", { class: "num big-num" }, ch.skills[s.key]),
            h("td", { class: "muted" }, s.use),
            h("td", { class: "act" }, actionButton(app, `Raise (${skillIncreaseCost(g.cfg, ch, s.key)})`, () => increaseSkill(g.cfg, ch, s.key), {
              disabled: !canIncreaseSkill(g.cfg, ch, s.key), focus: `skill-${s.key}`,
            })),
          ))),
        ),
        h("p", { class: "muted" }, `Effective level: ${effectiveLevel(ch)}`),
      ),
      h("div", { class: "panel" },
        h("h2", null, "Standing"),
        h("dl", { class: "facts" },
          h("dt", null, "Reputation"),
          h("dd", null, `${REP_LEVEL_NAMES[ch.repLevel]} (level ${ch.repLevel})`,
            h("div", { class: "muted" }, ch.repLevel >= cap
              ? `Your lifestyle caps reputation at level ${cap}. Move up to grow further.`
              : `${ch.repPoints} of ${nextRep} points to the next level`)),
          h("dt", null, "Health"),
          h("dd", null, `${Math.round((ch.health.physical / g.cfg.health.max) * 100)}%`),
          h("dt", null, "Lifestyle"),
          h("dd", null, lifestyleName(ch.lifestyle), h("div", { class: "muted" },
            `Rent ${credits(monthlyCost(g.cfg, ch.lifestyle))} a month, due in ${plural(daysUntilRent(ch), "day")}`)),
        ),
        next === null
          ? h("p", { class: "muted" }, "You live at the top already.")
          : h("div", { class: "upgrade" },
            h("p", null, `Move to ${lifestyleName(ch.lifestyle + 1)} for ${credits(next)}. Better gear in the shop, better paid contracts and a higher reputation cap.`),
            actionButton(app, "Upgrade lifestyle", async () => {
              if (!(await confirmDialog(`Pay ${credits(next)} to move to ${lifestyleName(ch.lifestyle + 1)}?`))) return;
              upgradeLifestyle(g, ch);
              return "Lifestyle upgraded. New contracts and shop items are now available.";
            }, { disabled: !canUpgradeLifestyle(g.cfg, ch), primary: true }),
          ),
      ),
    ),
  );
}
