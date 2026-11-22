import type {
  Analysis,
  AttenuationRange,
  Deduction,
  PublicBoard,
  SeismicSurvey,
} from "../../../shared/types";
import { neighbors } from "../../../shared/geometry";

/** 解数采样上限：超过即判定为欠定并截断，避免指数爆炸 */
export const MINE_SOLUTION_CAP = 300;
export const ATTEN_SOLUTION_CAP = 300;

interface CspVar {
  cell: number;
  max: 1 | 2;
}
interface CspConstraint {
  /** 变量在 vars 数组中的下标 */
  vars: number[];
  target: number;
  cells: number[];
  lines: string[];
}
interface CspBuild {
  vars: CspVar[];
  constraints: CspConstraint[];
  conflicts: { cells: number[]; lines: string[] };
}
interface CspSolution {
  values: number[];
}
interface CspResult {
  conflict: boolean;
  truncated: boolean;
  solutions: CspSolution[];
  /** 根节点传播即被固定的变量（截断时仍可作为可靠结论） */
  forced: Map<number, { value: number; cells: number[]; lines: string[] }>;
}

const isAssertedDanger = (b: PublicBoard, id: number) => {
  const c = b.cells[id];
  return c.exploded || c.intel === "danger" || c.mark === "flag";
};
const isUnknown = (b: PublicBoard, id: number) => {
  const c = b.cells[id];
  return !c.revealed && c.mark !== "flag" && c.intel === "unknown";
};

/**
 * 通用有限域 CSP：变量域为 {0..max} 的连续整数域，约束为线性求和。
 * 只允许把变量整体固定为单值，因此域始终是完整区间，min/max 区间校验即为充要条件。
 */
function solveCsp(
  vars: CspVar[],
  constraints: CspConstraint[],
  cap: number,
): CspResult {
  const n = vars.length;
  const forced = new Map<
    number,
    { value: number; cells: number[]; lines: string[] }
  >();

  // 根节点约束传播：固定点迭代，只做“全 0 / 全满”两种强制
  const domainMax = vars.map((v) => v.max);
  const fixed = new Array<number | null>(n).fill(null);
  const propagate = (): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of constraints) {
        let sum = c.target;
        const open: number[] = [];
        let maxOpen = 0;
        for (const vi of c.vars) {
          const v = fixed[vi];
          if (v === null) {
            open.push(vi);
            maxOpen += domainMax[vi];
          } else {
            sum -= v;
          }
        }
        if (sum < 0 || sum > maxOpen) return false;
        if (open.length === 0) continue;
        if (sum === 0 || sum === maxOpen) {
          const value = sum === 0 ? 0 : domainMax[open[0]];
          for (const vi of open) {
            if (fixed[vi] !== null) continue;
            fixed[vi] = value;
            forced.set(vi, {
              value,
              cells: [...new Set(c.cells)],
              lines: [...new Set(c.lines)],
            });
            changed = true;
          }
        }
      }
    }
    return true;
  };
  if (!propagate())
    return { conflict: true, truncated: false, solutions: [], forced };

  const solutions: CspSolution[] = [];
  let truncated = false;
  const current = fixed.slice();
  const degree = new Array<number>(n).fill(0);
  for (const c of constraints) for (const vi of c.vars) degree[vi]++;

  const feasible = (): boolean => {
    for (const c of constraints) {
      let sum = c.target;
      let maxOpen = 0;
      for (const vi of c.vars) {
        const v = current[vi];
        if (v === null) maxOpen += domainMax[vi];
        else sum -= v;
      }
      if (sum < 0 || sum > maxOpen) return false;
    }
    return true;
  };

  const backtrack = (): void => {
    if (solutions.length >= cap) {
      truncated = true;
      return;
    }
    if (!feasible()) return;
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (current[i] === null && (pick === -1 || degree[i] > degree[pick]))
        pick = i;
    }
    if (pick === -1) {
      solutions.push({ values: current.map((v) => v ?? 0) });
      return;
    }
    for (let value = 0; value <= domainMax[pick]; value++) {
      current[pick] = value;
      backtrack();
      if (truncated) return;
    }
    current[pick] = null;
  };
  backtrack();

  return { conflict: false, truncated, solutions, forced };
}

/** 危险格（0/1）联合 CSP：已揭数字 + 全局雷数 + 全部测线危险读数 */
function buildMineCsp(
  b: PublicBoard,
  surveys: SeismicSurvey[],
): CspBuild {
  const conflicts = { cells: [] as number[], lines: [] as string[] };
  const unknownCells = b.cells
    .filter((c) => isUnknown(b, c.id))
    .map((c) => c.id);
  const varIndex = new Map(unknownCells.map((id, i) => [id, i]));
  const constraints: CspConstraint[] = [];
  const fixedMine = (id: number): number | null => {
    const c = b.cells[id];
    if (c.revealed) return c.exploded ? 1 : 0;
    if (c.intel === "safe") return 0;
    if (isAssertedDanger(b, id)) return 1;
    return null;
  };

  const makeConstraint = (
    scope: number[],
    total: number,
    cells: number[],
    lines: string[],
  ) => {
    let target = total;
    const vars: number[] = [];
    for (const id of scope) {
      const f = fixedMine(id);
      if (f === null) {
        const vi = varIndex.get(id);
        if (vi !== undefined) vars.push(vi);
      } else {
        target -= f;
      }
    }
    if (target < 0 || target > vars.length) {
      conflicts.cells.push(...cells);
      conflicts.lines.push(...lines);
      return;
    }
    if (vars.length)
      constraints.push({ vars, target, cells, lines: [...new Set(lines)] });
  };

  // 已揭数字约束
  for (const c of b.cells) {
    if (c.adjacent === null) continue;
    makeConstraint(
      neighbors(c.id, b.width, b.height),
      c.adjacent,
      [c.id],
      [],
    );
  }
  // 全局剩余危险总量：需扣除已揭露的雷与所有被断言为危险的暗格
  const knownMines = b.cells.filter(
    (c) => c.exploded || (!c.revealed && isAssertedDanger(b, c.id)),
  ).length;
  makeConstraint(unknownCells, b.mines - knownMines, [], []);
  // 每条测线的危险读数
  for (const s of surveys)
    makeConstraint(s.cells, s.hazard, [], [s.id]);

  return {
    vars: unknownCells.map((cell) => ({ cell, max: 1 as const })),
    constraints,
    conflicts,
  };
}

/** 介质衰减（0/1/2）联合 CSP：只纳入测线覆盖的暗格，约束为各测线衰减读数 */
function buildAttenCsp(
  b: PublicBoard,
  surveys: SeismicSurvey[],
): CspBuild {
  const conflicts = { cells: [] as number[], lines: [] as string[] };
  const covered = new Set<number>();
  for (const s of surveys)
    for (const id of s.cells) if (!b.cells[id].revealed) covered.add(id);
  const unknownCells = [...covered];
  const varIndex = new Map(unknownCells.map((id, i) => [id, i]));
  const constraints: CspConstraint[] = [];
  for (const s of surveys) {
    let target = s.attenuation;
    const vars: number[] = [];
    for (const id of s.cells) {
      const pc = b.cells[id];
      if (pc.revealed) {
        target -= pc.atten ?? 0;
      } else {
        const vi = varIndex.get(id);
        if (vi !== undefined) vars.push(vi);
      }
    }
    const maxSum = vars.length * 2;
    if (target < 0 || target > maxSum) {
      conflicts.lines.push(s.id);
      continue;
    }
    if (vars.length)
      constraints.push({ vars, target, cells: [], lines: [s.id] });
  }
  return {
    vars: unknownCells.map((cell) => ({ cell, max: 2 as const })),
    constraints,
    conflicts,
  };
}

const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** 公开信息签名：缓存只依赖玩家可见数据，保证不会用真值污染推断 */
function publicSignature(b: PublicBoard, surveys: SeismicSurvey[]): string {
  const cells = b.cells
    .map(
      (c) =>
        `${c.id}:${c.revealed ? 1 : 0}${c.mark}${c.intel}${c.adjacent ?? "x"}${c.atten ?? "x"}${c.exploded ? 1 : 0}`,
    )
    .join("|");
  const lines = surveys
    .map((s) => `${s.id}:${s.cells.join(".")}=${s.hazard}/${s.attenuation}`)
    .join("|");
  return `${b.width}x${b.height}:${b.mines}#${cells}#${lines}`;
}
const cache = new Map<
  string,
  {
    analysis: Analysis;
    samples: { mines: Map<number, number> }[];
    truncated: boolean;
  }
>();
function solvePublic(board: PublicBoard, surveys: SeismicSurvey[]) {
  const sig = publicSignature(board, surveys);
  const hit = cache.get(sig);
  if (hit) return hit;
  const mine = buildMineCsp(board, surveys);
  const mineResult = solveCsp(
    mine.vars,
    mine.constraints,
    MINE_SOLUTION_CAP,
  );
  const samples = mineResult.solutions.map((s) => {
    const mines = new Map<number, number>();
    mine.vars.forEach((v, vi) => mines.set(v.cell, s.values[vi]));
    return { mines };
  });
  const entry = {
    analysis: buildAnalysis(board, surveys, mine, mineResult),
    samples,
    truncated: mineResult.truncated,
  };
  cache.set(sig, entry);
  if (cache.size > 12) cache.delete(cache.keys().next().value as string);
  return entry;
}

/** 供推荐器使用的危险格可行解采样：每个采样是 暗格 id → 是否危险（0/1） */
export function sampleMines(
  board: PublicBoard,
  surveys: SeismicSurvey[],
): { samples: { mines: Map<number, number> }[]; truncated: boolean } {
  const r = solvePublic(board, surveys);
  return { samples: r.samples, truncated: r.truncated };
}

export function analyzeSeismic(
  board: PublicBoard,
  surveys: SeismicSurvey[],
): Analysis {
  return solvePublic(board, surveys).analysis;
}

function buildAnalysis(
  board: PublicBoard,
  surveys: SeismicSurvey[],
  mine: CspBuild,
  mineResult: CspResult,
): Analysis {
  // 无解（非截断却 0 解）也视为线索冲突：读数或旗标之间互相矛盾
  const noSolution =
    !mineResult.conflict &&
    !mineResult.truncated &&
    mineResult.solutions.length === 0;
  const conflict =
    mineResult.conflict || mine.conflicts.lines.length > 0 || noSolution;
  const safe = new Map<number, Deduction>();
  const danger = new Map<number, Deduction>();
  const lineConflicts: string[] = [...mine.conflicts.lines];
  const cellConflicts: number[] = [...mine.conflicts.cells];
  if (noSolution) {
    for (const c of mine.constraints) lineConflicts.push(...c.lines);
    for (const c of mine.constraints) cellConflicts.push(...c.cells);
  }

  const putDeduction = (
    cell: number,
    value: number,
    cells: number[],
    lines: string[],
  ) => {
    const kind = value === 0 ? "safe" : "danger";
    const d: Deduction = {
      cell,
      kind,
      reasons: uniq(cells),
      lines: uniq(lines),
      text:
        lines.length > 0
          ? `由 ${lines.join("、")} 与已揭数字联合求解，所有可行地下结构在该格结论一致。`
          : "由已揭数字与全局危险总数联合求解，所有可行结构在该格结论一致。",
    };
    (kind === "safe" ? safe : danger).set(cell, d);
  };

  if (!conflict) {
    if (!mineResult.truncated && mineResult.solutions.length > 0) {
      // 未截断：枚举覆盖全部可行解，取值恒定即逻辑必然
      mine.vars.forEach((v, vi) => {
        const values = new Set(mineResult.solutions.map((s) => s.values[vi]));
        if (values.size === 1) {
          const involvedCells: number[] = [];
          const involvedLines: string[] = [];
          for (const c of mine.constraints)
            if (c.vars.includes(vi)) {
              involvedCells.push(...c.cells);
              involvedLines.push(...c.lines);
            }
          putDeduction(
            v.cell,
            [...values][0],
            involvedCells,
            involvedLines,
          );
        }
      });
    } else if (mineResult.truncated) {
      // 截断：仅采用根节点传播保证的结论，欠定部分保留
      for (const [vi, f] of mineResult.forced)
        putDeduction(mine.vars[vi].cell, f.value, f.cells, f.lines);
    }
  }

  // 探针/火把的直接确认不依赖任何测线
  for (const c of board.cells)
    if (!c.revealed && c.mark !== "flag" && c.intel !== "unknown") {
      const d: Deduction = {
        cell: c.id,
        kind: c.intel === "safe" ? "safe" : "danger",
        reasons: [],
        lines: [],
        text: "来自探针的直接确认，不消耗额外道具。",
      };
      (d.kind === "safe" ? safe : danger).set(c.id, d);
    }
  for (const id of safe.keys())
    if (danger.has(id)) cellConflicts.push(id);

  // 介质衰减推断（独立 CSP，不与危险格推断共用变量）
  const attenuation: AttenuationRange[] = [];
  let attenTruncated = false;
  if (surveys.length && !conflict) {
    const atten = buildAttenCsp(board, surveys);
    if (atten.conflicts.lines.length) {
      lineConflicts.push(...atten.conflicts.lines);
    } else {
      const r = solveCsp(atten.vars, atten.constraints, ATTEN_SOLUTION_CAP);
      attenTruncated = r.truncated;
      atten.vars.forEach((v, vi) => {
        const values = r.solutions.map((s) => s.values[vi]);
        const lines = uniq(
          atten.constraints
            .filter((c) => c.vars.includes(vi))
            .flatMap((c) => c.lines),
        );
        attenuation.push({
          cell: v.cell,
          exact:
            !r.truncated && new Set(values).size === 1
              ? ([...new Set(values)][0] as 0 | 1 | 2)
              : null,
          min: Math.min(...values),
          max: Math.max(...values),
          lines,
        });
      });
    }
  }

  const coveredUnknown = uniq(
    surveys.flatMap((s) => s.cells),
  ).filter((id) => isUnknown(board, id)).length;
  const totalUnknown = board.cells.filter((c) => isUnknown(board, c.id)).length;

  return {
    safe: conflict ? [] : [...safe.values()],
    danger: conflict ? [] : [...danger.values()],
    conflicts: uniq(cellConflicts),
    lineConflicts: uniq(lineConflicts),
    constraints: mine.constraints.length,
    surveyCount: surveys.length,
    coveredUnknown,
    totalUnknown,
    solutionCount: mineResult.truncated ? null : mineResult.solutions.length,
    truncated: mineResult.truncated || attenTruncated,
    attenuation,
  };
}
