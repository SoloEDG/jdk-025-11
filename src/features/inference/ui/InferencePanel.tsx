import {
  ScanSearch,
  Lightbulb,
  TriangleAlert,
  ArrowUpRight,
  Waves,
} from "lucide-react";
import type { Analysis, Expedition } from "../../../shared/types";
import { coordinate } from "../../../shared/geometry";
import { inferenceSummary } from "../model/notes";
export function InferencePanel({
  analysis: a,
  expedition: e,
  showHints,
  onHints,
  onLocate,
}: {
  analysis: Analysis;
  expedition: Expedition;
  showHints: boolean;
  onHints: () => void;
  onLocate: (id: number) => void;
}) {
  const top = [...a.safe.slice(0, 2), ...a.danger.slice(0, 1)];
  return (
    <section className="inference-panel">
      <div className="panel-heading">
        <ScanSearch size={15} />
        <h2>推断笔记</h2>
        <span>LOGIC NOTES</span>
      </div>
      <div className={"logic-status " + (a.conflicts.length || a.lineConflicts.length ? "conflict" : "")}>
        <Lightbulb size={16} />
        <p>{inferenceSummary(a, e)}</p>
      </div>
      <div className="logic-counts">
        <div>
          <b>{String(a.safe.length).padStart(2, "0")}</b>
          <span>条件安全</span>
        </div>
        <div>
          <b>{String(a.danger.length).padStart(2, "0")}</b>
          <span>推断危险</span>
        </div>
        <div>
          <b>{String(a.surveyCount).padStart(2, "0")}</b>
          <span>测线读数</span>
        </div>
      </div>
      <button
        className={"outline-button " + (showHints ? "active" : "")}
        aria-pressed={showHints}
        onClick={onHints}
      >
        <ScanSearch size={13} />
        {showHints ? "隐藏推断高亮" : "在地图上高亮"}
      </button>
      <div className="deduction-list">
        {top.map((d) => (
          <button key={d.cell} onClick={() => onLocate(d.cell)}>
            <i className={d.kind} />
            <span>
              {coordinate(d.cell, e.board.width)} ·{" "}
              {d.kind === "safe" ? "可探索" : "需警惕"}
              {d.lines.length > 0 && (
                <em className="deduction-lines">
                  <Waves size={9} />
                  依赖 {d.lines.join("、")}
                </em>
              )}
            </span>
            <ArrowUpRight size={12} />
          </button>
        ))}
      </div>
      <p className="logic-caution">
        <TriangleAlert size={11} />
        推断以你的旗标与已公布测线为条件，联合求解全部可行结构；欠定时只取共同结论，不读取暗格答案。
      </p>
    </section>
  );
}
