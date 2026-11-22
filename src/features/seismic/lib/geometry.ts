import { seedHash } from "../../../shared/random";

/** 地震仪初始电量（每局） */
export const SEISMIC_MAX_ENERGY = 24;
/** 一条测线最多参与求解/推荐的穿越格长度 */
export const MAX_LINE_CELLS = 20;

/** 边缘格：位于棋盘四条边上，但不包括四个角点（角点无法唯一指定一条边） */
export function edgePoints(width: number, height: number): number[] {
  const out: number[] = [];
  for (let x = 1; x < width - 1; x++) {
    out.push(x); // 上边
    out.push((height - 1) * width + x); // 下边
  }
  for (let y = 1; y < height - 1; y++) {
    out.push(y * width); // 左边
    out.push(y * width + width - 1); // 右边
  }
  return out;
}

export function isEdgePoint(id: number, width: number, height: number) {
  const x = id % width;
  const y = Math.floor(id / width);
  if (x === 0 || x === width - 1) return y > 0 && y < height - 1;
  if (y === 0 || y === height - 1) return x > 0 && x < width - 1;
  return false;
}

/** 两个边缘点是否位于不同的边（同一边的两点无法形成穿越剖面） */
export function onDifferentEdges(
  a: number,
  b: number,
  width: number,
  height: number,
): boolean {
  const side = (id: number) => {
    const x = id % width;
    const y = Math.floor(id / width);
    if (y === 0) return "N";
    if (y === height - 1) return "S";
    if (x === 0) return "W";
    return "E";
  };
  return side(a) !== side(b);
}

/**
 * Supercover 栅格化：返回中心连线穿过（含擦边、穿过角点）的全部格子，按顺序排列。
 * 采用以格中心为坐标的 DDA 步进；跨越网格边界时若同时跨过两条边界（穿角），
 * 两个对角格都会被计入，保证“擦边也算穿越”。
 */
export function lineCells(a: number, b: number, width: number): number[] {
  const ax = a % width;
  const ay = Math.floor(a / width);
  const bx = b % width;
  const by = Math.floor(b / width);
  const dx = bx - ax;
  const dy = by - ay;
  if (a === b) return [a];
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  // 从当前格中心走到下一条 x/y 网格边界的参数 t
  let tMaxX =
    dx === 0 ? Infinity : (stepX > 0 ? ax + 0.5 - ax : ax - 0.5 - ax) / dx;
  let tMaxY =
    dy === 0 ? Infinity : (stepY > 0 ? ay + 0.5 - ay : ay - 0.5 - ay) / dy;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const cells: number[] = [a];
  let x = ax;
  let y = ay;
  while (x !== bx || y !== by) {
    if (tMaxX < tMaxY) {
      x += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxX) {
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      // 恰好穿过网格角点：两个对角格都属于被穿越格
      cells.push(y * width + (x + stepX));
      x += stepX;
      y += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }
    cells.push(y * width + x);
  }
  return [...new Set(cells)];
}

/** 耗电量：基础布置费 + 每穿越一格的距离费 */
export function lineCost(cells: number[]): number {
  return 1 + Math.ceil(cells.length / 2);
}

/** 同一组穿越格即视为同一条测线（重测拦截依据），忽略端点顺序 */
export function surveyKey(cells: number[]): string {
  return [...cells].sort((a, b) => a - b).join(",");
}

/** 衰减等级由种子与格子确定性派生：石层多为 0，苔层偏 1，水层偏 2 */
export function deriveAtten(
  seed: string,
  id: number,
  terrain: "moss" | "stone" | "water",
): 0 | 1 | 2 {
  const roll = seedHash(`${seed}::atten::${id}`) % 100;
  if (terrain === "water") return roll < 55 ? 2 : roll < 90 ? 1 : 0;
  if (terrain === "moss") return roll < 20 ? 2 : roll < 65 ? 1 : 0;
  return roll < 8 ? 2 : roll < 32 ? 1 : 0;
}
