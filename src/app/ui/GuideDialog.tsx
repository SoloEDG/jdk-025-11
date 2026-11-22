import { X, Pickaxe, Flag, ScanSearch, Waves } from "lucide-react";
export function GuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="dialog guide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <button
          autoFocus
          className="icon-button close"
          onClick={onClose}
          aria-label="关闭指南"
        >
          <X size={18} />
        </button>
        <span className="eyebrow">THE EXPLORER’S HANDBOOK</span>
        <h2 id="guide-title">读懂遗迹的低语。</h2>
        <div className="guide-step">
          <Pickaxe />
          <p>
            <strong>揭开石板</strong>
            点击探索安全格，数字表示周围八格里的危险总数。空白安全区会自动展开，首步和相邻八格始终安全。
          </p>
        </div>
        <div className="guide-step">
          <Flag />
          <p>
            <strong>标记与推断</strong>
            右键或标记模式循环旗标、疑问和清除。双击已揭数字且周围旗标数相等时展开其余格；错误旗标可能造成伤害。方向键移焦点，F标记，回车探索。
          </p>
        </div>
        <div className="guide-step">
          <Waves />
          <p>
            <strong>地震勘测（剖面测量）</strong>
            地震模式下在地图边缘（非角点、不同边）依次放置震源与接收器。每条测线只公布两个总量：沿线危险数与介质衰减，不泄露任何单格答案。测线可重叠交叉，重叠能缩小地下结构的可能范围；未被覆盖的位置始终保持未知。耗电按布置距离计算，草稿未发射不耗电，重测同一条剖面会被拒绝且不重复扣电。
          </p>
        </div>
        <div className="guide-step">
          <ScanSearch />
          <p>
            <strong>联合推断与推荐</strong>
            已揭数字、旗标、探针结论与全部测线读数会一起求解所有可行地下结构。存在多种结构时系统保留欠定，只报告所有结构的共同结论，并标注每条结论依赖哪些测线；“下一条推荐”按电量、距离与预期排除的不确定性排序，只用公开信息，从不偷看暗格真值。
          </p>
        </div>
        <p className="guide-foot">
          有三点生命。揭开全部安全格即可完成；也能提前撤离结算。每安全格10分、文物50分、全图奖励200分，触发陷阱扣30分、每道具扣15分，最低0分；地震勘测只耗仪器电量，不扣积分。自动存档保留整局，后台不计时。
        </p>
        <button className="primary" onClick={onClose}>
          开始我的探险
        </button>
      </section>
    </div>
  );
}

