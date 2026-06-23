import type { Monster, SimulationResult, OptimizationTarget } from '../types';
import { MONSTER_NAMES, MONSTER_COLORS } from '../constants';

export class DataTable {
  private container: HTMLElement;
  private result: SimulationResult | null = null;
  private monsters: Monster[] = [];
  private pool: 'indoor' | 'outdoor' = 'indoor';
  private dataMode: 'count' | 'prob' = 'count';
  private targets: Map<string, number> = new Map();
  private activeEditCell: { cell: HTMLElement; monsterIdx: number; wave: number } | null = null;

  public onTargetsChanged?: (targets: OptimizationTarget[]) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** 更新表格数据 */
  update(
    result: SimulationResult,
    monsters: Monster[],
    pool: 'indoor' | 'outdoor',
    dataMode: 'count' | 'prob'
  ): void {
    this.result = result;
    this.monsters = monsters;
    this.pool = pool;
    this.dataMode = dataMode;
    this.commitEditSilent();
    this.render();
  }

  /** 切换数据模式 */
  setDataMode(mode: 'count' | 'prob'): void {
    this.dataMode = mode;
    this.commitEditSilent();
    this.render();
  }

  /** 获取数据源 */
  private getData(): number[][] {
    if (!this.result) return [];
    const isProb = this.dataMode === 'prob';
    if (isProb) {
      return this.pool === 'indoor' ? this.result.indoorSpawnProb : this.result.outdoorSpawnProb;
    }
    return this.pool === 'indoor' ? this.result.indoorExpected : this.result.outdoorExpected;
  }

  /** 获取显示值（百分比转换） */
  private formatValue(raw: number): number {
    return this.dataMode === 'prob' ? +(raw * 100).toFixed(1) : raw;
  }

  /** 获取目标值的显示文本 */
  private getDisplayValue(monsterIdx: number, wave: number, rawVal: number): string {
    const key = `${monsterIdx}-${wave}`;
    if (this.targets.has(key)) {
      return this.targets.get(key)!.toFixed(1);
    }
    return this.formatValue(rawVal).toFixed(1);
  }

  /** 判断单元格是否被修改 */
  private isModified(monsterIdx: number, wave: number, rawVal: number): boolean {
    const key = `${monsterIdx}-${wave}`;
    if (!this.targets.has(key)) return false;
    return Math.abs(this.targets.get(key)! - this.formatValue(rawVal)) > 0.001;
  }

  private render(): void {
    if (!this.result) {
      this.container.innerHTML = '<div class="table-placeholder">请先导入数据</div>';
      return;
    }

    const data = this.getData();
    const eligible = this.monsters.filter(m => {
      if (this.pool === 'indoor') return m.bornPosType === 1 || m.bornPosType === 3;
      return m.bornPosType === 2 || m.bornPosType === 3;
    });
    const numWaves = this.result.numWaves;
    const numCols = numWaves + 1; // +1 for monster name column

    if (eligible.length === 0) {
      this.container.innerHTML = '<div class="table-placeholder">当前视图无可用怪物</div>';
      return;
    }

    // 使用 table-layout: fixed 并设置每列宽度，确保对齐
    const monsterColWidth = 90;
    const waveColWidth = 56;
    const totalWidth = monsterColWidth + numWaves * waveColWidth;

    let html = `<div class="data-table-wrapper"><table class="data-table" style="width:${totalWidth}px;table-layout:fixed"><colgroup><col style="width:${monsterColWidth}px">`;
    for (let wave = 0; wave < numWaves; wave++) {
      html += `<col style="width:${waveColWidth}px">`;
    }
    html += '</colgroup><thead><tr><th class="th-monster">怪物</th>';

    for (let wave = 0; wave < numWaves; wave++) {
      html += `<th class="th-wave">W${wave}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const monster of eligible) {
      const idx = monster.idx;
      const name = MONSTER_NAMES[monster.id] ?? monster.name;
      const color = MONSTER_COLORS[idx];
      html += `<tr><td class="td-monster" style="border-left:3px solid ${color}">${name}</td>`;

      for (let wave = 0; wave < numWaves; wave++) {
        const rawVal = data[wave][idx] ?? 0;
        const displayText = this.getDisplayValue(idx, wave, rawVal);
        const modified = this.isModified(idx, wave, rawVal);
        html += `<td class="td-cell${modified ? ' cell-modified' : ''}" 
                      data-monster="${idx}" data-wave="${wave}" 
                      data-raw="${rawVal}"
                      title="点击编辑目标值">${displayText}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    this.container.innerHTML = html;

    // 绑定点击事件
    this.container.querySelectorAll('.td-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startEdit(cell as HTMLElement);
      });
    });
  }

  /** 更新单个单元格（不重绘整个表格） */
  private updateCell(cell: HTMLElement, monsterIdx: number, wave: number, rawVal: number): void {
    const displayText = this.getDisplayValue(monsterIdx, wave, rawVal);
    const modified = this.isModified(monsterIdx, wave, rawVal);
    cell.classList.remove('cell-editing');
    cell.textContent = displayText;
    cell.title = '点击编辑目标值';
    if (modified) {
      cell.classList.add('cell-modified');
    } else {
      cell.classList.remove('cell-modified');
    }
  }

  /** 开始内联编辑 */
  private startEdit(cell: HTMLElement): void {
    // 如果正在编辑同一个单元格，忽略
    if (this.activeEditCell?.cell === cell) return;

    // 如果有其他单元格正在编辑，先清理（不提交，直接丢弃编辑内容）
    if (this.activeEditCell) {
      this.cancelEditInPlace();
    }

    const monsterIdx = parseInt(cell.dataset.monster!);
    const wave = parseInt(cell.dataset.wave!);
    const rawVal = parseFloat(cell.dataset.raw!);
    const monster = this.monsters[monsterIdx];
    if (!monster) return;

    const maxVal = this.dataMode === 'prob' ? 100 : monster.maxNum;
    const currentDisplay = this.getDisplayValue(monsterIdx, wave, rawVal);

    // 替换单元格内容为 input
    cell.innerHTML = '';
    cell.classList.add('cell-editing');

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(maxVal);
    input.step = this.dataMode === 'prob' ? '0.1' : '1';
    input.value = currentDisplay;
    input.className = 'cell-input';

    cell.appendChild(input);

    this.activeEditCell = { cell, monsterIdx, wave };

    // 回车提交
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelEdit();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.commitEdit();
        this.focusNextCell(cell);
      }
    });

    // 失焦时提交（延迟，避免与点击事件冲突）
    input.addEventListener('blur', () => {
      // 使用微任务延迟，让点击事件先处理
      requestAnimationFrame(() => {
        if (this.activeEditCell && this.activeEditCell.cell === cell) {
          this.commitEdit();
        }
      });
    });

    // 延迟聚焦（等待 DOM 更新）
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  /** 提交当前编辑 — 只更新当前单元格，不重绘整表 */
  private commitEdit(): void {
    if (!this.activeEditCell) return;

    const { cell, monsterIdx, wave } = this.activeEditCell;
    const input = cell.querySelector('.cell-input') as HTMLInputElement;
    const rawVal = parseFloat(cell.dataset.raw!);
    const monster = this.monsters[monsterIdx];
    const maxVal = this.dataMode === 'prob' ? 100 : (monster?.maxNum ?? 999);

    this.activeEditCell = null;

    if (input) {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        const clamped = Math.max(0, Math.min(maxVal, val));
        const originalDisplay = this.formatValue(rawVal);

        if (Math.abs(clamped - originalDisplay) < 0.001) {
          this.targets.delete(`${monsterIdx}-${wave}`);
        } else {
          this.targets.set(`${monsterIdx}-${wave}`, clamped);
        }
      }
    }

    // 只更新当前单元格，不重绘整个表格
    this.updateCell(cell, monsterIdx, wave, rawVal);

    if (this.onTargetsChanged) {
      this.onTargetsChanged(this.getTargets());
    }
  }

  /** 取消当前编辑 — 只恢复当前单元格 */
  private cancelEdit(): void {
    if (!this.activeEditCell) return;

    const { cell, monsterIdx, wave } = this.activeEditCell;
    const rawVal = parseFloat(cell.dataset.raw!);
    this.activeEditCell = null;
    this.updateCell(cell, monsterIdx, wave, rawVal);
  }

  /** 取消编辑但不更新 DOM（用于 render 前的清理） */
  private cancelEditInPlace(): void {
    this.activeEditCell = null;
  }

  /** 静默提交（不触发回调，用于 render 前） */
  private commitEditSilent(): void {
    if (!this.activeEditCell) return;

    const { cell, monsterIdx, wave } = this.activeEditCell;
    const input = cell.querySelector('.cell-input') as HTMLInputElement;
    const rawVal = parseFloat(cell.dataset.raw!);
    const monster = this.monsters[monsterIdx];
    const maxVal = this.dataMode === 'prob' ? 100 : (monster?.maxNum ?? 999);

    this.activeEditCell = null;

    if (input) {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        const clamped = Math.max(0, Math.min(maxVal, val));
        const originalDisplay = this.formatValue(rawVal);
        if (Math.abs(clamped - originalDisplay) < 0.001) {
          this.targets.delete(`${monsterIdx}-${wave}`);
        } else {
          this.targets.set(`${monsterIdx}-${wave}`, clamped);
        }
      }
    }
  }

  /** Tab 后聚焦下一个单元格 */
  private focusNextCell(currentCell: HTMLElement): void {
    const allCells = Array.from(this.container.querySelectorAll('.td-cell'));
    const idx = allCells.indexOf(currentCell);
    if (idx >= 0 && idx < allCells.length - 1) {
      const nextCell = allCells[idx + 1] as HTMLElement;
      nextCell.click();
    }
  }

  /** 获取所有目标 */
  getTargets(): OptimizationTarget[] {
    const groups = new Map<number, { wave: number; value: number }[]>();

    for (const [key, value] of this.targets) {
      const [monsterIdx, wave] = key.split('-').map(Number);
      if (!groups.has(monsterIdx)) groups.set(monsterIdx, []);
      groups.get(monsterIdx)!.push({ wave, value });
    }

    return Array.from(groups.entries()).map(([monsterIdx, targets]) => ({
      monsterIdx,
      pool: this.pool,
      dataMode: this.dataMode,
      targets,
    }));
  }

  /** 重置所有目标 */
  reset(): void {
    this.commitEditSilent();
    this.targets.clear();
    this.render();
  }

  /** 从拖拽层同步目标 */
  syncFromDragLayer(dragTargets: OptimizationTarget[]): void {
    this.commitEditSilent();
    this.targets.clear();
    for (const t of dragTargets) {
      if (t.pool !== this.pool) continue;
      for (const { wave, value } of t.targets) {
        const key = `${t.monsterIdx}-${wave}`;
        const data = this.getData();
        const rawVal = data[wave]?.[t.monsterIdx] ?? 0;
        const display = this.formatValue(rawVal);
        if (Math.abs(value - display) > 0.001) {
          this.targets.set(key, value);
        }
      }
    }
    this.render();
  }
}
