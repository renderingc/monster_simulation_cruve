import type { Monster, OptimizationResult } from '../types';
import { MONSTER_NAMES } from '../constants';

export class ParamPanel {
  private container: HTMLElement;
  public onApply?: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** 显示参数对比表格 */
  showComparison(originalMonsters: Monster[], optimized: OptimizationResult): void {
    const { timeWeightChanges, genProbChanges, rmse } = optimized;

    if (timeWeightChanges.length === 0 && genProbChanges.length === 0) {
      this.container.innerHTML = '<div class="param-panel-placeholder">无参数变更</div>';
      return;
    }

    let html = `
      <div class="param-panel-header">
        <h3>参数优化建议</h3>
        <span class="rmse-badge">RMSE: ${rmse.toFixed(4)}</span>
        <button id="apply-btn" class="btn btn-success btn-sm">✓ 应用建议</button>
      </div>
      <div class="param-table-wrapper">
        <table class="param-table">
          <thead>
            <tr>
              <th>怪物</th>
              <th>参数类型</th>
              <th>原值</th>
              <th>建议值</th>
            </tr>
          </thead>
          <tbody>
    `;

    // time_weight 变更
    for (const change of timeWeightChanges) {
      const monster = originalMonsters[change.monsterIdx];
      const name = MONSTER_NAMES[monster.id] ?? monster.name;
      const origStr = monster.timeWeight.map(v => v.toFixed(2)).join(' | ');
      const newStr = change.newValues.map(v => v.toFixed(2)).join(' | ');
      const isDiff = origStr !== newStr;

      html += `
        <tr class="${isDiff ? 'row-changed' : ''}">
          <td>${name}</td>
          <td>time_weight</td>
          <td class="value-cell">${origStr}</td>
          <td class="value-cell ${isDiff ? 'value-changed' : ''}">${newStr}</td>
        </tr>
      `;
    }

    // gen_prob 变更
    for (const change of genProbChanges) {
      const monster = originalMonsters[change.monsterIdx];
      const name = MONSTER_NAMES[monster.id] ?? monster.name;
      const origVal = monster.monsterWeight; // 注意：这里应该是 genProb，但 genProb 在 MapConfig 中
      // gen_prob 存储在 MapConfig 中，这里只显示变更量
      const isDiff = true;

      html += `
        <tr class="row-changed">
          <td>${name}</td>
          <td>gen_prob</td>
          <td class="value-cell">（见地图配置）</td>
          <td class="value-cell value-changed">${change.newValue.toFixed(4)}</td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    this.container.innerHTML = html;

    const applyBtn = this.container.querySelector('#apply-btn');
    if (applyBtn && this.onApply) {
      applyBtn.addEventListener('click', () => this.onApply!());
    }
  }

  /** 显示 RMSE 值 */
  showRMSE(rmse: number): void {
    const badge = this.container.querySelector('.rmse-badge');
    if (badge) badge.textContent = `RMSE: ${rmse.toFixed(4)}`;
  }

  /** 显示错误信息 */
  showError(message: string): void {
    this.container.innerHTML = `<div class="param-panel-error">❌ ${message}</div>`;
  }

  /** 显示加载状态 */
  showLoading(message: string = '优化中...'): void {
    this.container.innerHTML = `<div class="param-panel-placeholder">⏳ ${message}</div>`;
  }

  /** 重置面板 */
  reset(): void {
    this.container.innerHTML = '<div class="param-panel-placeholder">拖拽曲线点后点击"优化参数"查看建议</div>';
  }
}
