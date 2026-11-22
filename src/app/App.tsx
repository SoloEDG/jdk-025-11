import { useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  Map,
  BookOpen,
  HelpCircle,
  Plus,
  Check,
  ArrowUpRight,
  Diamond,
  LogOut,
  X,
  Save,
} from "lucide-react";
import type { Difficulty } from "../shared/types";
import { isTerminal } from "../shared/initial";
import {
  RegionPanel,
  BoardView,
  publicBoard,
  region,
} from "../features/terrain";
import { ActionBar, ProgressStrip } from "../features/exploration";
import { analyze, InferencePanel } from "../features/inference";
import { ToolPanel } from "../features/tools";
import { ChroniclePanel, ResultPanel } from "../features/chronicle";
import {
  SeismicPanel,
  recommendSurvey,
  sampleMines,
  isEdgePoint,
  onDifferentEdges,
  lineCells,
  lineCost,
} from "../features/seismic";
import { useGame } from "./useGame";
import { GuideDialog } from "./ui/GuideDialog";
import { LaunchDialog } from "./ui/LaunchDialog";
export function App() {
  const { state, send, saved } = useGame();
  const e = state.doc.expedition;
  const [help, setHelp] = useState(false);
  const [launch, setLaunch] = useState<Difficulty | null>(null);
  const [extract, setExtract] = useState(false);
  const [hints, setHints] = useState(false);
  // 未发出的布放草稿只保存在组件本地：刷新或撤回即消失，不产生耗电与读数
  const [draft, setDraft] = useState<number[]>([]);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pub = useMemo(() => publicBoard(e.board), [e.board]);
  const analysis = useMemo(
    () => analyze(pub, e.surveys),
    [pub, e.surveys],
  );
  const recommendations = useMemo(() => {
    if (e.status !== "active" || e.paused || !e.board.generated) return [];
    const { samples, truncated } = sampleMines(pub, e.surveys);
    return recommendSurvey(
      pub,
      e.surveys,
      e.seismicEnergy,
      samples,
      truncated,
    );
  }, [pub, e.surveys, e.seismicEnergy, e.status, e.paused, e.board.generated]);
  const r = region(e.board.difficulty);
  const report = state.doc.archive.reports.find((v) => v.id === e.id);

  // 切出地震模式或开启新局时，清掉未发射草稿，保证刷新/撤回不留残状态
  useEffect(() => {
    if (e.mode !== "seismic") setDraft([]);
  }, [e.mode]);
  useEffect(() => {
    setDraft([]);
  }, [e.id]);

  const pickEdge = (id: number) => {
    if (e.mode !== "seismic" || !isEdgePoint(id, e.board.width, e.board.height))
      return;
    const current = draftRef.current;
    if (current.length === 0) {
      setDraft([id]);
      return;
    }
    if (current.length === 1 && current[0] === id) {
      setDraft([]);
      return;
    }
    if (
      current.length === 1 &&
      !onDifferentEdges(current[0], id, e.board.width, e.board.height)
    ) {
      // 同边重选：替换震源
      setDraft([id]);
      return;
    }
    if (current.length === 1) {
      const cells = lineCells(current[0], id, e.board.width);
      if (lineCost(cells) > e.seismicEnergy) {
        setDraft([id]); // 电量不足时保留单点，允许重新选择
        return;
      }
      setDraft([current[0], id]);
      return;
    }
    setDraft([id]); // 已有完整草稿时重新开始
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#">
          <span className="brand-mark">
            <Compass size={28} strokeWidth={1.2} />
          </span>
          <span>
            <strong>
              遗迹探勘<span>RUINFIELD</span>
            </strong>
            <small>在未知之中，寻找文明的回声。</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <a className="nav-active" href="#map">
            <Map size={14} />
            遗迹探索
          </a>
          <a href="#chronicle">
            <BookOpen size={14} />
            探险手记
          </a>
        </nav>
        <div className="header-end">
          <span className={"save-state " + (!saved ? "unsaved" : "")}>
            <Check size={11} />
            {saved ? "进度已保存" : "本地保存不可用"}
          </span>
          <button
            className="icon-button"
            aria-label="探险指南"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={18} />
          </button>
          <span className="avatar">勘</span>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              <span />
              ARCHAEOLOGICAL EXPEDITION / VOL. 025
            </span>
            <h1>
              未知之下，皆是故事<span>。</span>
            </h1>
            <p>循着数字的线索，揭开一座失落文明。</p>
          </div>
          <button
            className="new-expedition"
            onClick={() => setLaunch(e.board.difficulty)}
          >
            <Plus size={15} />
            新的探险
            <ArrowUpRight size={13} />
          </button>
        </div>
        <div className="workspace">
          <aside className="left-column">
            <RegionPanel expedition={e} onNew={setLaunch} />
            <div className="left-bottom">
              <span className="eyebrow">EXPEDITION SEED</span>
              <code>{e.board.seed}</code>
              <span className="seed-tip">同一种子，同一段未知。</span>
            </div>
          </aside>
          <div className="center-column" id="map">
            <ProgressStrip expedition={e} />
            <BoardView
              expedition={e}
              analysis={analysis}
              showHints={hints}
              draft={draft}
              onPick={pickEdge}
              send={send}
            />
            <ActionBar
              expedition={e}
              send={send}
              onExtract={() => setExtract(true)}
            />
            {report && (
              <ResultPanel
                report={report}
                onNew={() => setLaunch(e.board.difficulty)}
              />
            )}
            <div className="map-note">
              <Diamond size={14} />
              <p>
                {e.mode === "probe"
                  ? "探针已就绪，点击未探索且无旗标的石板，确认一格信息。"
                  : e.mode === "flare"
                    ? "火把已就绪，点击未探索石板；安全则揭开，危险则仅确认。"
                    : e.mode === "seismic"
                      ? "地震模式：在地图边缘依次选择震源与接收器，读数只给剖面总量，未覆盖格仍未知。"
                      : r.description}
                <span>
                  {e.mode === "reveal"
                    ? "谨慎的每一步，都会让故事更完整。"
                    : e.mode === "mark"
                      ? "旗标是你的判断，疑问保留未知；并不证明真实危险。"
                      : e.mode === "seismic"
                        ? "草稿不耗电也不入档；发射后读数自动保存，重测同线会被拒绝。"
                        : "使用后自动回到探索模式，取消可点击「探索」。"}
                </span>
              </p>
              <span className="note-mark">✦</span>
            </div>
            <div className="save-strip">
              <Save size={12} />
              <span>自动保存地图、道具、测线读数与发现 · 随时回来继续</span>
              <small>LOCAL FIELD JOURNAL</small>
            </div>
          </div>
          <aside className="right-column">
            <InferencePanel
              analysis={analysis}
              expedition={e}
              showHints={hints}
              onHints={() => setHints(!hints)}
              onLocate={(id) => {
                setHints(true);
                document.getElementById("tile-" + id)?.focus();
                document
                  .getElementById("tile-" + id)
                  ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }}
            />
            <SeismicPanel
              expedition={e}
              analysis={analysis}
              recommendations={recommendations}
              draft={draft}
              onDraft={setDraft}
              send={send}
            />
            <ToolPanel expedition={e} send={send} />
            <div id="chronicle">
              <ChroniclePanel archive={state.doc.archive} expedition={e} />
            </div>
          </aside>
        </div>
        <footer>
          <span>
            RUINFIELD EXPLORER’S SOCIETY <i /> EST. 2026
          </span>
          <span>
            让好奇指引方向，让理性守护每一步。
            <Compass size={13} />
          </span>
        </footer>
      </main>
      {state.notice && (
        <div className="notice" role="status" key={state.notice}>
          {state.notice}
        </div>
      )}
      {help && <GuideDialog onClose={() => setHelp(false)} />}{" "}
      {launch && (
        <LaunchDialog
          key={launch}
          difficulty={launch}
          ongoing={!isTerminal(e.status) && e.board.generated}
          onClose={() => setLaunch(null)}
          onConfirm={(difficulty, seed) => {
            send({ type: "new", difficulty, seed });
            setLaunch(null);
            setHints(false);
          }}
        />
      )}
      {extract && (
        <div className="modal-backdrop" onClick={() => setExtract(false)}>
          <section
            className="dialog extract-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="extract-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button close"
              aria-label="取消撤离"
              onClick={() => setExtract(false)}
            >
              <X size={18} />
            </button>
            <LogOut size={28} />
            <h2 id="extract-title">带着发现，平安归营。</h2>
            <p>
              撤离会结束本次探险，将已探索区域与文物计入档案。尚未探索的区域不会获得积分。
            </p>
            <div className="dialog-actions">
              <button
                autoFocus
                className="outline-button"
                onClick={() => setExtract(false)}
              >
                继续探索
              </button>
              <button
                className="primary"
                onClick={() => {
                  send({ type: "extract" });
                  setExtract(false);
                }}
              >
                确认撤离
                <ArrowUpRight size={14} />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
