export type Difficulty = "scout" | "scholar" | "legend";
export type Mode = "reveal" | "mark" | "probe" | "flare" | "seismic";
export type Status = "ready" | "active" | "won" | "lost" | "extracted";
export type Mark = "none" | "flag" | "question";
export type RelicId = "sun" | "vessel" | "tablet";
export interface Cell {
  id: number;
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  mark: Mark;
  intel: "unknown" | "safe" | "danger";
  relic: RelicId | null;
  terrain: "moss" | "stone" | "water";
  /** 介质衰减等级 0/1/2，地图生成时确定；未揭格的取值不对玩家公开 */
  atten: 0 | 1 | 2;
}
export interface Board {
  width: number;
  height: number;
  mines: number;
  seed: string;
  difficulty: Difficulty;
  generated: boolean;
  cells: Cell[];
}
/**
 * 一条已发射的地震测线。
 * 读数只保存沿线总量，绝不保存单格答案；cells 为公开的穿越路径。
 */
export interface SeismicSurvey {
  /** 测线编号 S1、S2…… */
  id: string;
  endpoints: [number, number];
  /** 按穿越顺序排列的格子 id */
  cells: number[];
  /** 读数一：沿线危险格总量 */
  hazard: number;
  /** 读数二：沿线介质衰减总量 */
  attenuation: number;
  /** 本次发射耗电量，由布置距离决定 */
  cost: number;
  second: number;
}
export interface ActionEntry {
  id: number;
  kind:
    | "reveal"
    | "mark"
    | "probe"
    | "flare"
    | "hit"
    | "shield"
    | "extract"
    | "seismic";
  cell: number | null;
  message: string;
  second: number;
}
export interface Expedition {
  id: string;
  board: Board;
  status: Status;
  mode: Mode;
  lives: number;
  shield: boolean;
  tools: { probe: number; flare: number; shield: number };
  used: number;
  mistakes: number;
  elapsed: number;
  paused: boolean;
  actions: ActionEntry[];
  nextAction: number;
  selected: number | null;
  startedAt: number;
  /** 已公布读数的地震测线，按发射顺序排列 */
  surveys: SeismicSurvey[];
  /** 地震仪剩余电量 */
  seismicEnergy: number;
}
export interface Report {
  id: string;
  seed: string;
  difficulty: Difficulty;
  outcome: Status;
  safe: number;
  totalSafe: number;
  relics: RelicId[];
  score: number;
  seconds: number;
  used: number;
  mistakes: number;
  endedAt: number;
}
export interface Archive {
  reports: Report[];
  discoveries: Partial<Record<RelicId, number>>;
  totalScore: number;
}
export interface GameDocument {
  version: 1;
  expedition: Expedition;
  archive: Archive;
}
export interface PublicCell {
  id: number;
  revealed: boolean;
  mark: Mark;
  adjacent: number | null;
  intel: Cell["intel"];
  exploded: boolean;
  /** 仅已揭格公开介质衰减，暗格为 null，避免泄露单格真值 */
  atten: number | null;
}
export interface PublicBoard {
  width: number;
  height: number;
  mines: number;
  cells: PublicCell[];
}
export interface Deduction {
  cell: number;
  kind: "safe" | "danger";
  /** 支撑结论的已揭数字格 */
  reasons: number[];
  /** 支撑结论的测线编号；空数组表示结论不依赖测线 */
  lines: string[];
  text: string;
}
/** 单个暗格的介质衰减可行域（仅统计测线覆盖的格子） */
export interface AttenuationRange {
  cell: number;
  /** 所有可行解中取值恒定时给出确定值 */
  exact: 0 | 1 | 2 | null;
  min: number;
  max: number;
  lines: string[];
}
export interface Analysis {
  safe: Deduction[];
  danger: Deduction[];
  conflicts: number[];
  /** 读数互相矛盾或与已揭数字冲突的测线编号 */
  lineConflicts: string[];
  constraints: number;
  surveyCount: number;
  /** 至少被一条测线覆盖的暗格数 */
  coveredUnknown: number;
  totalUnknown: number;
  /** 可行解总数；截断时为 null，表示实际解数更多、系统仍处欠定 */
  solutionCount: number | null;
  truncated: boolean;
  attenuation: AttenuationRange[];
}
/** 下一条测线推荐，全部基于公开信息计算 */
export interface SeismicRecommendation {
  endpoints: [number, number];
  cells: number[];
  cost: number;
  /** 期望新增可确定（安全或危险）的暗格数 */
  expectedGain: number;
  /** 与已有测线重叠的暗格数 */
  overlap: number;
  /** 当前可行解下该线可能读到的危险总量区间 */
  readingMin: number;
  readingMax: number;
  approximate: boolean;
}
export interface Workspace {
  doc: GameDocument;
  notice: string;
}
