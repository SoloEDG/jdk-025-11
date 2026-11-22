import type { Expedition, SeismicSurvey } from "../../../shared/types";
import { logAction } from "../../../shared/initial";
import { coordinate } from "../../../shared/geometry";
import {
  isEdgePoint,
  lineCells,
  lineCost,
  surveyKey,
  SEISMIC_MAX_ENERGY,
} from "../lib/geometry";

export interface SeismicResult {
  expedition: Expedition;
  survey: SeismicSurvey | null;
  reason: string;
}

/** 校验并发射一条地震测线。任何失败路径都不修改状态、不扣电量。 */
export function fireSurvey(e: Expedition, draft: number[]): SeismicResult {
  const reject = (reason: string): SeismicResult => ({
    expedition: e,
    survey: null,
    reason,
  });
  if (e.paused || e.status !== "active" || !e.board.generated)
    return reject("地震仪只能在进行中的探险里布放。");
  if (draft.length < 2) return reject("请先在地图边缘选择震源与接收器两个点。");
  const [a, b] = draft;
  const { width, height } = e.board;
  if (
    !isEdgePoint(a, width, height) ||
    !isEdgePoint(b, width, height)
  )
    return reject("震源与接收器必须布置在地图边缘（四角除外）。");
  const cells = lineCells(a, b, width);
  const key = surveyKey(cells);
  // 重测：同一剖面已有读数，原读数继续有效，不重复耗电、不重复入账
  if (e.surveys.some((s) => surveyKey(s.cells) === key))
    return reject("这条剖面已经测过，读数沿用首次测量，不能重复发射。");
  const cost = lineCost(cells);
  if (cost > e.seismicEnergy)
    return reject(`地震仪电量不足：本测线需 ${cost} 格电，仅剩 ${e.seismicEnergy}。`);

  // 读数只汇总为两个总量，单格真值不进入存档
  let hazard = 0;
  let attenuation = 0;
  for (const id of cells) {
    const c = e.board.cells[id];
    if (c.mine) hazard++;
    attenuation += c.atten;
  }
  const survey: SeismicSurvey = {
    id: `S${e.surveys.length + 1}`,
    endpoints: [a, b],
    cells,
    hazard,
    attenuation,
    cost,
    second: e.elapsed,
  };
  const updated: Expedition = {
    ...e,
    mode: "reveal",
    seismicEnergy: e.seismicEnergy - cost,
    surveys: [...e.surveys, survey],
  };
  return {
    expedition: logAction(
      updated,
      "seismic",
      a,
      `测线 ${survey.id}（${coordinate(a, width)}→${coordinate(
        b,
        width,
      )}）：穿过 ${cells.length} 格，读数 危险 ${hazard} / 衰减 ${attenuation}，耗电 ${cost}。`,
    ),
    survey,
    reason: "",
  };
}

export { SEISMIC_MAX_ENERGY };
