// Pohled do nodu (CNodeView) a mapa oblasti (CMapView).
import { image } from "../../assets";
import { IceState, NodeType } from "../../core/constants";
import type { Run, RunFx } from "../../core/matrix/run";
import { h } from "../dom";

/** Snímek z image listu jako dlaždice, která se škáluje s rodičem (procenta). */
function tile(name: string, index: number, cols: number, rows: number, extra = ""): HTMLDivElement {
  const col = index % cols, row = Math.floor(index / cols);
  const px = cols > 1 ? (col / (cols - 1)) * 100 : 0;
  const py = rows > 1 ? (row / (rows - 1)) * 100 : 0;
  return h("div", {
    class: `tile ${extra}`,
    style: `background-image:url(${image(name)});background-size:${cols * 100}% ${rows * 100}%;background-position:${px}% ${py}%`,
  });
}

const NODE_IMAGE: Record<NodeType, string> = {
  [NodeType.Cpu]: "NODE_CPU",
  [NodeType.Spu]: "NODE_SPU",
  [NodeType.Cop]: "NODE_COP",
  [NodeType.DataStore]: "NODE_DS",
  [NodeType.IO]: "NODE_IO",
  [NodeType.Junction]: "NODE_JUN",
  [NodeType.PortalIn]: "node_portal",
  [NodeType.PortalOut]: "node_portal",
};

/** Poloha buňky v procentech: mřížka 9×9 po 24 px s odsazením 12 px v okně 240 px. */
const cellPos = (x: number, y: number) => `left:${(12 + x * 24) / 2.4}%;top:${(12 + y * 24) / 2.4}%`;

/** il_misc: cíl, poškození, dotaz, alarm, bypass */
const MISC = { target: 0, damage: 1, query: 2, alert: 3, bypass: 4 } as const;

export function renderNodeView(run: Run, characterImage: number, fx: RunFx[], onPick: (iceId: number) => void): HTMLElement {
  const node = run.node;
  const s = run.s;
  const view = h("div", { class: "nodeview", role: "group", "aria-label": `Node ${node.name}` },
    h("img", { class: "nodeview-bg pixel", src: image(NODE_IMAGE[node.type]), alt: "" }),
  );
  // Spojení do sousedních nodů (čáry u okraje)
  const lines = [
    { d: 0, img: "line_ns", style: "left:44.58%;top:0;width:10.83%;height:5.42%" },
    { d: 1, img: "line_ew", style: "left:94.58%;top:44.58%;width:5.42%;height:10.83%" },
    { d: 2, img: "line_ns", style: "left:44.58%;top:94.58%;width:10.83%;height:5.42%" },
    { d: 3, img: "line_ew", style: "left:0;top:44.58%;width:5.42%;height:10.83%" },
  ];
  for (const l of lines) {
    if (node.adj[l.d] !== null) view.append(h("img", { class: "nodeview-line pixel", src: image(l.img), alt: "", style: l.style }));
  }
  // Hráč a návnady
  const me = tile("MISC_Characters", characterImage, 17, 1, "cell player");
  me.setAttribute("style", me.getAttribute("style") + ";" + cellPos(s.x, s.y));
  me.title = "You";
  view.append(me);
  for (const d of s.decoys) {
    const t = tile("MISC_Characters", characterImage, 17, 1, "cell decoy");
    t.setAttribute("style", t.getAttribute("style") + ";" + cellPos(d.x, d.y));
    t.title = "Decoy";
    view.append(t);
  }
  // ICE
  const fxFor = (id: number) => fx.filter((f) => "iceId" in f && f.iceId === id).map((f) => f.kind);
  for (const ice of run.currentIce()) {
    const hostile = (ice.state & IceState.MaskHostile) !== 0;
    const queried = run.hasQueried(ice);
    const btn = h("button", {
      class: `cell ice${hostile ? " hostile" : queried ? " queried" : ""}${ice.id === s.targetIceId ? " targeted" : ""}`,
      style: cellPos(ice.x, ice.y),
      title: `${ice.name}${hostile ? " (hostile)" : queried ? " (querying)" : ice.bypassed ? " (bypassed)" : ""}`,
      "aria-label": `Target ${ice.name}`,
      "aria-pressed": ice.id === s.targetIceId ? "true" : "false",
      onclick: () => onPick(ice.id),
    }, tile("il_ice", ice.image, 10, 8));
    if (ice.id === s.targetIceId) btn.append(tile("il_misc", MISC.target, 5, 1, "overlay"));
    for (const k of fxFor(ice.id)) {
      const idx = k === "damage" ? MISC.damage : k === "query" ? MISC.query : k === "alert" ? MISC.alert : k === "bypass" ? MISC.bypass : -1;
      if (idx >= 0) btn.append(tile("il_misc", idx, 5, 1, "overlay flash"));
    }
    view.append(btn);
  }
  if (fx.some((f) => f.kind === "playerHit")) {
    const t = tile("il_misc", MISC.damage, 5, 1, "cell overlay flash");
    t.setAttribute("style", t.getAttribute("style") + ";" + cellPos(s.x, s.y));
    view.append(t);
  }
  return view;
}

// ---------------------------------------------------------------------------
// Mapa
// ---------------------------------------------------------------------------

const imgCache = new Map<string, HTMLImageElement>();
function img(name: string, onload: () => void): HTMLImageElement {
  let i = imgCache.get(name);
  if (!i) {
    i = new Image();
    i.src = image(name);
    imgCache.set(name, i);
  }
  if (!i.complete) i.addEventListener("load", onload, { once: true });
  return i;
}

export function renderMap(run: Run, big: boolean): HTMLElement {
  const sys = run.sys;
  const area = sys.areas[run.node.area]!;
  const g = big ? 32 : 16;
  const pad = 80;
  const canvas = h("canvas", {
    width: area.sizeX * g + pad * 2,
    height: area.sizeY * g + pad * 2,
    class: "map-canvas",
    role: "img",
    "aria-label": `Map of area ${area.number}`,
  });
  const wrap = h("div", { class: "map-wrap" }, canvas);
  const draw = () => {
    const c = canvas.getContext("2d");
    if (!c) return;
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#000";
    c.fillRect(0, 0, canvas.width, canvas.height);
    const nodesImg = img(big ? "Node_IL_32" : "Node_IL_16", draw);
    const specialImg = img(big ? "il_special_nodes_32" : "il_special_nodes_16", draw);
    const drawn = new Set<string>();
    for (const id of area.nodeIds) {
      const n = sys.nodes[id]!;
      if (!n.mapped) continue;
      const px = pad + n.x * g, py = pad + n.y * g;
      const cx = px + g / 2, cy = py + g / 2;
      for (let d = 0; d < 4; d++) {
        const a = n.adj[d];
        if (a === null || a === undefined) continue;
        const key = id < a ? `${id}-${a}` : `${a}-${id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        c.fillStyle = "#0000ff";
        if (d === 0) c.fillRect(cx - 2, cy - g, 4, g);
        if (d === 1) c.fillRect(cx, cy - 2, g, 4);
        if (d === 2) c.fillRect(cx - 2, cy, 4, g);
        if (d === 3) c.fillRect(cx - g, cy - 2, g, 4);
        c.fillStyle = "#008080";
        if (d === 0) c.fillRect(cx - 1, cy - g, 2, g);
        if (d === 1) c.fillRect(cx, cy - 1, g, 2);
        if (d === 2) c.fillRect(cx - 1, cy, 2, g);
        if (d === 3) c.fillRect(cx - g, cy - 1, g, 2);
      }
    }
    for (const id of area.nodeIds) {
      const n = sys.nodes[id]!;
      if (!n.mapped) continue;
      const px = pad + n.x * g, py = pad + n.y * g;
      if (n.specialImage === -1) {
        if (nodesImg.complete) c.drawImage(nodesImg, n.type * g, 0, g, g, px, py, g, g);
      } else if (specialImg.complete) {
        c.drawImage(specialImg, n.specialImage * g, 0, g, g, px, py, g, g);
      }
      if (n.id === run.s.nodeId) {
        c.strokeStyle = "#fff";
        c.lineWidth = 1;
        const cx = px + g / 2 + 0.5, cy = py + g / 2 + 0.5;
        c.beginPath();
        c.moveTo(cx, cy - 4);
        c.lineTo(cx, cy + 4);
        c.moveTo(cx - 4, cy);
        c.lineTo(cx + 4, cy);
        c.stroke();
      }
    }
  };
  draw();
  // Vycentrovat na aktuální node po vložení do stránky
  requestAnimationFrame(() => {
    const n = run.node;
    wrap.scrollLeft = pad + n.x * g + g / 2 - wrap.clientWidth / 2;
    wrap.scrollTop = pad + n.y * g + g / 2 - wrap.clientHeight / 2;
  });
  return wrap;
}
