import type {
  GameDocument,
  Expedition,
  Archive,
  Board,
  Report,
  SeismicSurvey,
} from "../shared/types";
import { neighbors } from "../shared/geometry";
import { region } from "../features/terrain";
import {
  deriveAtten,
  lineCells,
  lineCost,
  SEISMIC_MAX_ENERGY,
  surveyKey,
} from "../features/seismic/lib/geometry";
import { initialGame } from "./gameReducer";
const key = "ruinfield-jdk025-v1";
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const int = (v: unknown, min = 0) =>
  typeof v === "number" && Number.isInteger(v) && v >= min;

/** 为本次功能升级前的旧存档补齐新字段（不影响既有局） */
function migrate(v: unknown): unknown {
  if (!obj(v) || !obj(v.expedition) || !obj(v.expedition.board)) return v;
  const e = v.expedition as Record<string, unknown>;
  const b = e.board as Record<string, unknown>;
  if (Array.isArray(b.cells))
    for (const c of b.cells)
      if (obj(c) && !int(c.atten))
        c.atten = deriveAtten(
          String(b.seed ?? ""),
          Number(c.id),
          ["moss", "stone", "water"].includes(String(c.terrain))
            ? (c.terrain as "moss" | "stone" | "water")
            : "stone",
        );
  const hadSurveys = Array.isArray(e.surveys);
  if (!hadSurveys) e.surveys = [];
  if (!int(e.seismicEnergy)) e.seismicEnergy = SEISMIC_MAX_ENERGY;
  // 旧版本不存在地震测线，残留的 seismic 日志不可能与真实读数对应，移除保持一致
  if (!hadSurveys && Array.isArray(e.actions))
    e.actions = e.actions.filter(
      (a) => !obj(a) || String(a.kind) !== "seismic",
    );
  return v;
}

function validBoard(v: unknown): v is Board {
  if (
    !obj(v) ||
    !["scout", "scholar", "legend"].includes(String(v.difficulty)) ||
    typeof v.seed !== "string" ||
    v.seed.length > 40 ||
    typeof v.generated !== "boolean" ||
    !Array.isArray(v.cells)
  )
    return false;
  const r = region(v.difficulty as Board["difficulty"]);
  if (
    v.width !== r.width ||
    v.height !== r.height ||
    v.mines !== r.mines ||
    v.cells.length !== r.width * r.height
  )
    return false;
  const cells = v.cells;
  if (
    !cells.every(
      (c, i) =>
        obj(c) &&
        c.id === i &&
        typeof c.mine === "boolean" &&
        int(c.adjacent) &&
        Number(c.adjacent) <= 8 &&
        typeof c.revealed === "boolean" &&
        ["none", "flag", "question"].includes(String(c.mark)) &&
        ["unknown", "safe", "danger"].includes(String(c.intel)) &&
        ["stone", "moss", "water"].includes(String(c.terrain)) &&
        [0, 1, 2].includes(Number(c.atten)) &&
        (c.relic === null ||
          ["sun", "vessel", "tablet"].includes(String(c.relic))) &&
        (!c.revealed || c.mark === "none") &&
        !(c.mine && c.relic),
    )
  )
    return false;
  const b = v as unknown as Board;
  if (!b.generated)
    return b.cells.every(
      (c) =>
        !c.mine &&
        !c.revealed &&
        c.adjacent === 0 &&
        c.intel === "unknown" &&
        c.relic === null &&
        c.atten === deriveAtten(b.seed, c.id, c.terrain),
    );
  if (
    b.cells.filter((c) => c.mine).length !== b.mines ||
    b.cells.filter((c) => c.relic).length !== 6
  )
    return false;
  return b.cells.every(
    (c) =>
      c.adjacent ===
        neighbors(c.id, b.width, b.height).filter((id) => b.cells[id].mine)
          .length &&
      (c.intel === "unknown" || c.intel === "danger" === c.mine) &&
      c.atten === deriveAtten(b.seed, c.id, c.terrain),
  );
}

/** 重算每条测线的路径、读数、耗电，确保存档没有被篡改或重复 */
function validSurveys(v: unknown, board: Board): v is SeismicSurvey[] {
  if (!Array.isArray(v) || v.length > 20) return false;
  const seen = new Set<string>();
  let spent = 0;
  for (let i = 0; i < v.length; i++) {
    const s = v[i];
    if (!obj(s) || s.id !== `S${i + 1}` || !Array.isArray(s.cells))
      return false;
    if (!Array.isArray(s.endpoints) || s.endpoints.length !== 2) return false;
    const [a, b2] = s.endpoints as number[];
    if (
      !int(a) ||
      !int(b2) ||
      a >= board.cells.length ||
      b2 >= board.cells.length
    )
      return false;
    const cells = lineCells(a, b2, board.width);
    if (
      cells.length !== s.cells.length ||
      cells.some((id, k) => id !== (s.cells as number[])[k])
    )
      return false;
    const key = surveyKey(cells);
    if (seen.has(key)) return false; // 不允许重复测线
    seen.add(key);
    let hazard = 0;
    let attenuation = 0;
    for (const id of cells) {
      const c = board.cells[id];
      if (c.mine) hazard++;
      attenuation += c.atten;
    }
    if (
      s.hazard !== hazard ||
      s.attenuation !== attenuation ||
      s.cost !== lineCost(cells) ||
      !int(s.second)
    )
      return false;
    spent += s.cost as number;
  }
  return spent <= SEISMIC_MAX_ENERGY;
}

function validExpedition(v: unknown): v is Expedition {
  if (
    !obj(v) ||
    !validBoard(v.board) ||
    typeof v.id !== "string" ||
    !["ready", "active", "won", "lost", "extracted"].includes(
      String(v.status),
    ) ||
    !["reveal", "mark", "probe", "flare", "seismic"].includes(String(v.mode)) ||
    !int(v.lives) ||
    Number(v.lives) > 3 ||
    typeof v.shield !== "boolean" ||
    typeof v.paused !== "boolean" ||
    !int(v.used) ||
    !int(v.mistakes) ||
    !int(v.elapsed) ||
    !int(v.nextAction, 1) ||
    !int(v.startedAt) ||
    !(
      v.selected === null ||
      (int(v.selected) && Number(v.selected) < v.board.cells.length)
    ) ||
    !obj(v.tools) ||
    !Array.isArray(v.actions) ||
    v.actions.length > 80 ||
    !int(v.seismicEnergy) ||
    Number(v.seismicEnergy) > SEISMIC_MAX_ENERGY ||
    !validSurveys(v.surveys, v.board)
  )
    return false;
  const board = v.board;
  const t = v.tools;
  if (
    !int(t.probe) ||
    Number(t.probe) > 2 ||
    !int(t.flare) ||
    Number(t.flare) > 1 ||
    !int(t.shield) ||
    Number(t.shield) > 1
  )
    return false;
  if (
    !v.actions.every(
      (a) =>
        obj(a) &&
        int(a.id, 1) &&
        Number(a.id) < Number(v.nextAction) &&
        [
          "reveal",
          "mark",
          "probe",
          "flare",
          "hit",
          "shield",
          "extract",
          "seismic",
        ].includes(String(a.kind)) &&
        (a.cell === null ||
          (int(a.cell) && Number(a.cell) < board.cells.length)) &&
        typeof a.message === "string" &&
        int(a.second),
    )
  )
    return false;
  const e = v as unknown as Expedition;
  const safe = e.board.cells.filter((c) => c.revealed && !c.mine).length;
  const energySpent = e.surveys.reduce((sum, s) => sum + s.cost, 0);
  const seismicFires = e.actions.filter((a) => a.kind === "seismic").length;
  return (
    (e.status === "ready") === !e.board.generated &&
    (e.status !== "won" || safe === e.board.cells.length - e.board.mines) &&
    (e.status !== "lost" || e.lives === 0) &&
    e.used === 4 - e.tools.probe - e.tools.flare - e.tools.shield &&
    e.seismicEnergy === SEISMIC_MAX_ENERGY - energySpent &&
    seismicFires === e.surveys.length // 每条测线恰好一条日志，无重复无丢失
  );
}
function validReport(v: unknown): v is Report {
  return (
    obj(v) &&
    typeof v.id === "string" &&
    typeof v.seed === "string" &&
    ["scout", "scholar", "legend"].includes(String(v.difficulty)) &&
    ["won", "lost", "extracted"].includes(String(v.outcome)) &&
    [
      "safe",
      "totalSafe",
      "score",
      "seconds",
      "used",
      "mistakes",
      "endedAt",
    ].every((k) => int(v[k])) &&
    Number(v.safe) <= Number(v.totalSafe) &&
    Array.isArray(v.relics) &&
    v.relics.every((r) => ["sun", "vessel", "tablet"].includes(String(r)))
  );
}
function validArchive(v: unknown): v is Archive {
  return (
    obj(v) &&
    Array.isArray(v.reports) &&
    v.reports.length <= 50 &&
    v.reports.every(validReport) &&
    new Set(v.reports.map((r) => r.id)).size === v.reports.length &&
    obj(v.discoveries) &&
    Object.entries(v.discoveries).every(
      ([id, n]) => ["sun", "vessel", "tablet"].includes(id) && int(n),
    ) &&
    int(v.totalScore)
  );
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialGame();
    const v = migrate(JSON.parse(raw));
    if (
      obj(v) &&
      v.version === 1 &&
      validExpedition(v.expedition) &&
      validArchive(v.archive)
    )
      return {
        doc: v as unknown as GameDocument,
        notice: "已恢复上次探险，地图、道具、测线读数与推断信息保持原样。",
      };
    return {
      ...initialGame(),
      notice: "存档格式或地图校验未通过，已保留原存档并开启临时探险。",
      recovery: true,
    };
  } catch {
    return {
      ...initialGame(),
      notice: "无法读取本地存档，本次仍可探索。",
      recovery: true,
    };
  }
}
export function saveGame(doc: GameDocument) {
  try {
    localStorage.setItem(key, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
