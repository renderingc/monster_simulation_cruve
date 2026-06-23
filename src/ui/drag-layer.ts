import * as echarts from 'echarts';
import type { Monster, SimulationResult, OptimizationTarget } from '../types';
import { MONSTER_COLORS, MONSTER_NAMES } from '../constants';

interface DragHandle {
  monsterIdx: number;
  wave: number;
  originalValue: number;
  currentValue: number;
  isModified: boolean;
  isReachable: boolean;
}

export class DragLayer {
  private chart: echarts.ECharts;
  private handles: DragHandle[] = [];
  private monsters: Monster[] = [];
  private result: SimulationResult | null = null;
  private pool: 'indoor' | 'outdoor' = 'indoor';
  private genProb: number[] = [];
  private dataMode: 'count' | 'prob' = 'count';
  public onTargetChanged?: (targets: OptimizationTarget[]) => void;

  constructor(chart: echarts.ECharts) {
    this.chart = chart;
  }

  /** 设置显示模式，手柄数据同步切换 */
  setDataMode(mode: 'count' | 'prob'): void {
    this.dataMode = mode;
    if (this.result) {
      this.initHandles(this.result, this.monsters, this.pool, this.genProb);
    }
  }

  /**
   * 初始化拖拽手柄
   * @param result 模拟结果
   * @param monsters 怪物列表
   * @param pool 室内/室外
   * @param genProb 当前地图的 gen_prob
   */
  initHandles(
    result: SimulationResult,
    monsters: Monster[],
    pool: 'indoor' | 'outdoor',
    genProb: number[]
  ): void {
    this.result = result;
    this.monsters = monsters;
    this.pool = pool;
    this.genProb = genProb;
    this.handles = [];

    // 根据显示模式选择数据源
    const isProb = this.dataMode === 'prob';
    const data = isProb
      ? (pool === 'indoor' ? result.indoorSpawnProb : result.outdoorSpawnProb)
      : (pool === 'indoor' ? result.indoorExpected : result.outdoorExpected);

    for (const monster of monsters) {
      const idx = monster.idx;

      // 过滤不属于该池子的怪物
      if (pool === 'indoor' && monster.bornPosType !== 1 && monster.bornPosType !== 3) continue;
      if (pool === 'outdoor' && monster.bornPosType !== 2 && monster.bornPosType !== 3) continue;

      // genProb=0 的怪物不可生成，标记为不可达
      const isReachable = genProb[idx] > 0;

      for (let wave = 0; wave < result.numWaves; wave++) {
        const rawVal = data[wave][idx];
        const value = isProb ? rawVal * 100 : rawVal; // 概率模式转为百分比
        this.handles.push({
          monsterIdx: idx,
          wave,
          originalValue: value,
          currentValue: value,
          isModified: false,
          isReachable,
        });
      }
    }

    this.renderHandles();
  }

  /** 渲染所有拖拽手柄（使用 ECharts graphic 组件） */
  private renderHandles(): void {
    if (!this.result) return;

    const graphicElements: any[] = [];

    for (const handle of this.handles) {
      if (!handle.isReachable) continue; // 不可达的不显示手柄

      const pixelPos = this.chart.convertToPixel('grid', [handle.wave, handle.currentValue]);
      if (!pixelPos) continue;

      const color = handle.isModified ? '#ff4444' : MONSTER_COLORS[handle.monsterIdx];

      graphicElements.push({
        type: 'circle',
        id: `handle-${handle.monsterIdx}-${handle.wave}`,
        shape: { cx: pixelPos[0], cy: pixelPos[1], r: 6 },
        style: {
          fill: color,
          stroke: '#fff',
          lineWidth: 1.5,
          cursor: 'ns-resize',
        },
        draggable: 'vertical',
        ondrag: (e: any) => this.onDrag(handle, e),
        ondragend: (e: any) => this.onDragEnd(handle, e),
        onclick: () => this.onClickHandle(handle),
        z: 100,
      });
    }

    this.chart.setOption({ graphic: graphicElements });
  }

  /** 拖拽过程中实时更新手柄位置 */
  private onDrag(handle: DragHandle, e: any): void {
    const monster = this.monsters[handle.monsterIdx];
    if (!monster) return;

    // 从像素坐标反算数据值
    const dataPos = this.chart.convertFromPixel('grid', [e.offsetX, e.offsetY]);
    if (!dataPos) return;

    // 限制 Y 范围 [0, maxNum]
    const clampedValue = Math.max(0, Math.min(monster.maxNum, dataPos[1]));

    // 更新手柄位置（视觉反馈）
    const pixelPos = this.chart.convertToPixel('grid', [handle.wave, clampedValue]);
    if (pixelPos) {
      this.chart.setOption({
        graphic: [{
          id: `handle-${handle.monsterIdx}-${handle.wave}`,
          shape: { cx: pixelPos[0], cy: pixelPos[1] },
        }],
      });
    }
  }

  /** 松手后记录目标值 */
  private onDragEnd(handle: DragHandle, e: any): void {
    const monster = this.monsters[handle.monsterIdx];
    if (!monster) return;

    const dataPos = this.chart.convertFromPixel('grid', [e.offsetX, e.offsetY]);
    if (!dataPos) return;

    // 限制 Y 范围 [0, maxNum]
    const clampedValue = Math.max(0, Math.min(monster.maxNum, dataPos[1]));
    handle.currentValue = clampedValue;
    handle.isModified = true;

    // 更新手柄颜色为红色
    const pixelPos = this.chart.convertToPixel('grid', [handle.wave, clampedValue]);
    if (pixelPos) {
      this.chart.setOption({
        graphic: [{
          id: `handle-${handle.monsterIdx}-${handle.wave}`,
          shape: { cx: pixelPos[0], cy: pixelPos[1] },
          style: { fill: '#ff4444' },
        }],
      });
    }

    // 触发回调
    if (this.onTargetChanged) {
      this.onTargetChanged(this.getTargets());
    }
  }

  /** 点击手柄弹出输入框直接修改数值 */
  private onClickHandle(handle: DragHandle): void {
    const monster = this.monsters[handle.monsterIdx];
    if (!monster) return;

    const maxVal = this.dataMode === 'prob' ? 100 : monster.maxNum;
    const unit = this.dataMode === 'prob' ? '%' : '';
    const input = prompt(
      `${MONSTER_NAMES[monster.id] ?? monster.name} 第 ${handle.wave} 波\n当前值: ${handle.currentValue.toFixed(2)}${unit}\n请输入新值 (0~${maxVal}):`,
      handle.currentValue.toFixed(2)
    );

    if (input === null) return; // 用户取消

    const val = parseFloat(input);
    if (isNaN(val)) return;

    // 限制范围
    handle.currentValue = Math.max(0, Math.min(maxVal, val));
    handle.isModified = true;
    this.renderHandles();

    if (this.onTargetChanged) {
      this.onTargetChanged(this.getTargets());
    }
  }

  /** 获取所有已修改的目标点 */
  getTargets(): OptimizationTarget[] {
    const targetMap = new Map<string, OptimizationTarget>();

    for (const handle of this.handles) {
      if (!handle.isModified) continue;

      const key = `${handle.monsterIdx}-${this.pool}`;
      if (!targetMap.has(key)) {
        targetMap.set(key, {
          monsterIdx: handle.monsterIdx,
          pool: this.pool,
          targets: [],
        });
      }

      targetMap.get(key)!.targets.push({
        wave: handle.wave,
        value: handle.currentValue,
      });
    }

    return Array.from(targetMap.values());
  }

  /** 重置所有手柄到原始值 */
  resetTargets(): void {
    for (const handle of this.handles) {
      handle.currentValue = handle.originalValue;
      handle.isModified = false;
    }
    this.renderHandles();
  }

  /** 清除所有手柄 */
  clearHandles(): void {
    this.handles = [];
    this.chart.setOption({ graphic: [] });
  }
}
