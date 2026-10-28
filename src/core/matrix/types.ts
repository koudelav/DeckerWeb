// Datové struktury systému v Matrixu (CSystem, CArea, CNode, CIce, CDSFile).
// Odkazy jsou přes id (index v system.nodes / system.ice), aby šel systém uložit do JSON.

import type { Alert, Dir, FileType, IceType, NodeType, TargetObject } from "../constants";

export interface DSFile {
  id: number;
  name: string;
  type: FileType;
  /** Hodnota v kreditech; u programů a zdrojáků rating. */
  value: number;
  /** Obsah: index do tabulky obsahu / cílový objekt / třída programu nebo čipu. */
  contents: number;
  /** FileState.* */
  state: number;
  /** Tapeworm, který soubor hlídá (id ICE). */
  tapewormId: number | null;
  /** Velikost v MP. */
  size: number;
}

export interface MNode {
  id: number;
  /** Index oblasti v system.areas. */
  area: number;
  name: string;
  type: NodeType;
  subType: number;
  cluster: number;
  /** Číslo nodu v názvu (originál m_nNodeNumber). */
  number: number;
  /** Sousedé N, E, S, W (id nodu nebo null). */
  adj: [number | null, number | null, number | null, number | null];
  x: number;
  y: number;
  files: DSFile[];
  smokeLevel: number;
  silenceLevel: number;
  activated: boolean;
  mapped: boolean;
  specialImage: number;
}

export interface Area {
  number: number;
  nodeIds: number[];
  spuId: number;
  portalInId: number | null;
  portalOutId: number;
  iceIoNodeId: number;
  highSpeedIoNodeId: number | null;
  sizeX: number;
  sizeY: number;
}

export interface Ice {
  id: number;
  name: string;
  type: IceType;
  /** Gateway: směr; Attack: AttackSubtype bity; Trace: TraceSubtype; Tapeworm: TapewormSubtype. */
  subType: number;
  rating: number;
  image: number;
  response: boolean;
  homeNodeId: number;
  /** Soubor hlídaný tapewormem (id souboru). */
  fileId: number | null;

  health: number;
  slowLevel: number;
  skippedLastTurn: boolean;
  confusionLevel: number;
  weakenLevel: number;
  virusLevel: number;
  analyzed: number;

  nodeId: number;
  x: number;
  y: number;

  /** IceState.* */
  state: number;
  bypassed: boolean;
  wasAccessed: boolean;
  targetNodeId: number | null;
  lastDir: Dir;
}

export interface MatrixSystem {
  corporation: number;
  /** Bezpečnostní rating = velikost systému z kontraktu. */
  rating: number;
  alert: Alert;
  areas: Area[];
  nodes: MNode[];
  ice: Ice[];
  /** Id zničených ICE (originál m_olDeadIceList). */
  deadIce: number[];
  cpuNodeId: number;
  portalOutNodeId: number;
  turnsUntilCrash: number;
  externalAlarmsDeactivated: boolean;
  backdoor: boolean;
  iceReactivateTime: number;
  passcodeAccessed: boolean;
  /** Cíl kontraktu (pro texty souborů). */
  targetObject: TargetObject;
  nextFileId: number;
}
