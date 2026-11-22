import type { Analysis, Expedition } from "../../../shared/types";
export function inferenceSummary(a: Analysis, e: Expedition) {
  if (e.status === "ready") return "第一步始终安全，选择一块石板开始。";
  if (a.lineConflicts.length)
    return `测线 ${a.lineConflicts.join("、")} 的读数与其他线索冲突，请核对。`;
  if (a.conflicts.length) return "现有旗标与数字冲突，请先检查标记。";
  if (a.surveyCount) {
    const under =
      a.solutionCount === null
        ? "可行结构仍很多（超过求解上限），系统保持欠定，不杜撰唯一答案。"
        : a.solutionCount > 1
          ? `全部线索仍对应 ${a.solutionCount} 种地下结构，结论只取它们的共同部分。`
          : "全部线索已唯一确定地下结构。";
    if (a.safe.length || a.danger.length)
      return `${under} 当前可确定 ${a.safe.length} 安全、${a.danger.length} 危险。`;
    return under;
  }
  if (a.safe.length)
    return `找到 ${a.safe.length} 个条件安全格，请核对旗标后探索。`;
  if (a.danger.length)
    return `有 ${a.danger.length} 处可推断危险，建议先做标记。`;
  return "暂未找到直接结论，试试探针、地震测线或观察更多边界。";
}
