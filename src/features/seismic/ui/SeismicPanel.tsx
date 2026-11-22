import {
  Waves,
  BatteryCharging,
  Zap,
  X,
  Send,
  Lightbulb,
  Route,
  Sigma,
  CircleHelp,
} from "lucide-react";
import type {
  Analysis,
  Expedition,
  SeismicRecommendation,
} from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { coordinate } from "../../../shared/geometry";
import { lineCost, lineCells, SEISMIC_MAX_ENERGY } from "../lib/geometry";
import { MINE_SOLUTION_CAP } from "../lib/solver";

export function SeismicPanel({
  expedition: e,
  analysis,
  recommendations,
  draft,
  onDraft,
  send,
}: {
  expedition: Expedition;
  analysis: Analysis;
  recommendations: SeismicRecommendation[];
  draft: number[];
  onDraft: (cells: number[]) => void;
  send: (c: Command) => void;
}) {
  const { width } = e.board;
  const draftCells =
    draft.length === 2 ? lineCells(draft[0], draft[1], e.board.width) : draft;
  const previewCost = draft.length === 2 ? lineCost(draftCells) : 0;
  const ready = e.status === "active" && !e.paused && e.board.generated;

  return (
    <section className="seismic-panel">
      <div className="panel-heading">
        <Waves size={15} />
        <h2>地震勘测</h2>
        <span>SEISMIC PROFILES</span>
      </div>

      <div className="seismic-energy" title="地震仪电量，按测线布置距离耗电">
        <BatteryCharging size={16} />
        <div className="energy-bar">
          <i
            style={{
              width: `${(e.seismicEnergy / SEISMIC_MAX_ENERGY) * 100}%`,
            }}
          />
        </div>
        <b>
          {e.seismicEnergy}
          <small> / {SEISMIC_MAX_ENERGY}</small>
        </b>
      </div>

      <div className="seismic-draft">
        <div className="draft-head">
          <Route size={13} />
          <span>布放草稿（未发射不耗电、不存档）</span>
        </div>
        <div className="draft-points">
          {[0, 1].map((slot) => (
            <span key={slot} className={draft[slot] === undefined ? "empty" : ""}>
              {draft[slot] === undefined
                ? slot === 0
                  ? "选择震源（边缘）"
                  : "选择接收器（另一条边）"
                : coordinate(draft[slot], width)}
            </span>
          ))}
        </div>
        {draft.length === 2 && (
          <p className="draft-meta">
            穿越 <b>{draftCells.length}</b> 格 · 预计耗电{" "}
            <b>{previewCost}</b>
            {previewCost > e.seismicEnergy && <em>（电量不足）</em>}
          </p>
        )}
        <div className="draft-actions">
          <button
            className="primary"
            disabled={draft.length !== 2 || !ready || previewCost > e.seismicEnergy}
            onClick={() => {
              send({ type: "seismic", cells: draft });
              onDraft([]);
            }}
          >
            <Send size={13} />
            发射测线
          </button>
          <button
            className="outline-button"
            disabled={!draft.length}
            onClick={() => onDraft([])}
          >
            <X size={13} />
            撤回草稿
          </button>
        </div>
        {!ready && (
          <p className="seismic-hint">第一步探索后才可布放地震仪。</p>
        )}
      </div>

      <div className="seismic-under">
        <Sigma size={13} />
        <div>
          {analysis.lineConflicts.length ? (
            <strong className="under-bad">
              测线 {analysis.lineConflicts.join("、")} 读数冲突
            </strong>
          ) : analysis.solutionCount === null ? (
            <strong>
              可行地下结构超过 {MINE_SOLUTION_CAP} 种（求解截断）
              <small>系统保留欠定，不把任一结构画成唯一答案。</small>
            </strong>
          ) : analysis.solutionCount > 1 ? (
            <strong>
              仍有 {analysis.solutionCount} 种结构符合全部线索
              <small>
                已覆盖暗格 {analysis.coveredUnknown}/{analysis.totalUnknown}，未覆盖处仍未知。
              </small>
            </strong>
          ) : (
            <strong>
              线索已唯一锁定结构
              <small>所有暗格在全部可行解中取值一致。</small>
            </strong>
          )}
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="recommend-block">
          <div className="draft-head">
            <Lightbulb size={13} />
            <span>下一条推荐（仅依据公开线索）</span>
          </div>
          {recommendations.map((r, i) => (
            <button
              key={i}
              className="recommend-card"
              disabled={!ready || r.cost > e.seismicEnergy}
              onClick={() => onDraft([...r.endpoints])}
              title={
                r.approximate
                  ? "解空间已截断，增益为基于采样的近似估计"
                  : "期望信息增益基于全部可行解计算"
              }
            >
              <span className="rec-rank">#{i + 1}</span>
              <span className="rec-body">
                <strong>
                  {coordinate(r.endpoints[0], width)} →{" "}
                  {coordinate(r.endpoints[1], width)}
                  {r.approximate && <CircleHelp size={10} />}
                </strong>
                <small>
                  耗电 {r.cost} · 预期排除 {r.expectedGain} 单位不确定 · 重叠{" "}
                  {r.overlap} 格
                </small>
                <small>
                  该线危险读数可能落在 {r.readingMin}–{r.readingMax}
                </small>
              </span>
              <Zap size={13} />
            </button>
          ))}
        </div>
      )}

      <div className="survey-list">
        <div className="draft-head">
          <Waves size={13} />
          <span>已公布读数（{e.surveys.length}）</span>
        </div>
        {e.surveys.length === 0 ? (
          <p className="seismic-hint">
            测线读数只给沿线总量，不公开单格；重叠测线可交叉缩小结构范围。
          </p>
        ) : (
          e.surveys.map((s) => (
            <div
              key={s.id}
              className={
                "survey-card" +
                (analysis.lineConflicts.includes(s.id) ? " conflict" : "")
              }
            >
              <header>
                <b>{s.id}</b>
                <span>
                  {coordinate(s.endpoints[0], width)} →{" "}
                  {coordinate(s.endpoints[1], width)}
                </span>
                <em>−{s.cost} 电</em>
              </header>
              <div className="survey-readings">
                <span>
                  危险总量<strong>{s.hazard}</strong>
                </span>
                <span>
                  衰减总量<strong>{s.attenuation}</strong>
                </span>
                <span>
                  穿越<strong>{s.cells.length} 格</strong>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {analysis.attenuation.length > 0 && (
        <div className="atten-block">
          <div className="draft-head">
            <Sigma size={13} />
            <span>介质衰减可行域（测线交叉推断）</span>
          </div>
          <div className="atten-grid">
            {analysis.attenuation.slice(0, 6).map((a) => (
              <span key={a.cell}>
                {coordinate(a.cell, width)}
                <b>
                  {a.exact !== null
                    ? a.exact
                    : `${a.min}~${a.max}`}
                </b>
                <small>{a.lines.join("")}</small>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="seismic-foot">
        推荐与推断只用已揭数字、旗标和已公布读数，从不读取暗格真值；欠定结论会标注所依赖的测线。
      </p>
    </section>
  );
}
