import type {
  PublicBoard,
  SeismicRecommendation,
  SeismicSurvey,
} from "../../../shared/types";
import {
  edgePoints,
  lineCells,
  lineCost,
  onDifferentEdges,
  surveyKey,
} from "./geometry";

/** 候选测线评估上限与每候选的解采样上限，控制推荐计算耗时 */
const CANDIDATE_CAP = 96;
const SAMPLE_CAP = 240;
const RANK_LIMIT = 3;

interface Sample {
  mines: Map<number, number>;
}

/**
 * 下一条测线推荐。
 * 全部输入均为玩家可见信息（已揭数字、旗标/探针结论、已公布读数、全局雷数），
 * 用可行地下结构的均匀采样估计每条候选线的期望信息增益，
 * 再与电量、布置距离（耗电）综合排序；任何环节都不读取暗格真值。
 */
export function recommendSurvey(
  board: PublicBoard,
  surveys: SeismicSurvey[],
  energy: number,
  samples: Sample[],
  truncated: boolean,
): SeismicRecommendation[] {
  if (!samples.length) return [];
  const { width, height } = board;
  const edges = edgePoints(width, height);
  const existing = new Set(surveys.map((s) => surveyKey(s.cells)));
  const unknownCell = (id: number) =>
    !board.cells[id].revealed &&
    board.cells[id].mark !== "flag" &&
    board.cells[id].intel === "unknown";

  // 先穷举全部合法且电量可承担的候选，再做等距抽样，避免只偏向某一侧的边
  const allCandidates: { endpoints: [number, number]; cells: number[] }[] = [];
  const seenKeys = new Set<string>();
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if (!onDifferentEdges(a, b, width, height)) continue;
      const cells = lineCells(a, b, width);
      const key = surveyKey(cells);
      if (existing.has(key) || seenKeys.has(key)) continue;
      seenKeys.add(key);
      if (lineCost(cells) > energy) continue;
      allCandidates.push({ endpoints: [a, b], cells });
    }
  }
  const step = Math.max(1, Math.ceil(allCandidates.length / CANDIDATE_CAP));
  const picked = allCandidates.filter((_, i) => i % step === 0);

  const ranked: SeismicRecommendation[] = [];
  for (const { endpoints, cells } of picked) {
    const cost = lineCost(cells);
    // 对每个可行解计算该候选线会读到的危险总量（仅使用采样中的公开推断分布）
    const readings: number[] = [];
    for (const s of samples.slice(0, SAMPLE_CAP)) {
      let reading = 0;
      for (const id of cells) {
        const c = board.cells[id];
        if (c.exploded || c.intel === "danger" || c.mark === "flag")
          reading++;
        else if (!c.revealed && c.intel !== "safe")
          reading += s.mines.get(id) ?? 0;
      }
      readings.push(reading);
    }
    const distribution = new Map<number, number>();
    for (const r of readings)
      distribution.set(r, (distribution.get(r) ?? 0) + 1);
    // 期望信息增益：读数的香农熵（比特），读数越分散、越能区分可行结构
    const total = readings.length;
    let entropy = 0;
    for (const count of distribution.values()) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
    const unknownOnLine = cells.filter(unknownCell).length;
    const overlap = cells.filter(
      (id) =>
        unknownCell(id) && surveys.some((s) => s.cells.includes(id)),
    ).length;
    // 期望排除的不确定性：熵折算成“可能被确定的暗格”，并奖励覆盖新暗格
    const expectedGain =
      entropy * Math.min(unknownOnLine, 4) + (unknownOnLine - overlap) * 0.15;
    ranked.push({
      endpoints,
      cells,
      cost,
      expectedGain: Number(expectedGain.toFixed(2)),
      overlap,
      readingMin: Math.min(...readings),
      readingMax: Math.max(...readings),
      approximate: truncated,
    });
  }

  return ranked
    .sort(
      (p, q) =>
        q.expectedGain / q.cost - p.expectedGain / p.cost || p.cost - q.cost,
    )
    .slice(0, RANK_LIMIT);
}
