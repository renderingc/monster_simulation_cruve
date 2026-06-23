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
    const { timeWeightChanges, genProbChanges, rmse, unreachableCount, unreachableReason } = optimized;

    console.log('[参数面板] timeWeight变更数:', timeWeightChanges.length, 'genProb变更数:', genProbChanges.length, 'RMSE:', rmse, '不可达:', unreachableCount);

    // 统计实际有变更的位
    let totalChangedPositions = 0;
    const changeRows: string[] = [];
    const unchangedRows: string[] = [];

    // time_weight 变更 — 逐位对比
    for (const change of timeWeightChanges) {
      const monster = originalMonsters[change.monsterIdx];
      const name = MONSTER_NAMES[monster.id] ?? monster.name;
      const orig = monster.timeWeight;
      const news = change.newValues;
      const maxLen = Math.max(orig.length, news.length);

      // 逐位对比，构建高亮标签
      const changedTags: string[] = [];
      const unchangedTags: string[] = [];

      for (let w = 0; w < maxLen; w++) {
        const o = orig[w] ?? 0;
        const n = news[w] ?? 0;
        const changed = Math.abs(o - n) > 0.001;

        if (changed) {
          totalChangedPositions++;
          changedTags.push(
            `<span class="tw-tag tw-tag-changed" title="第${w}波: ${o.toFixed(2)} → ${n.toFixed(2)}">W${w}:<b>${o.toFixed(2)}→${n.toFixed(2)}</b></span>`
          );
        } else {
          unchangedTags.push(
            `<span class="tw-tag" title="第${w}波: ${o.toFixed(2)}（未变）">W${w}:${o.toFixed(2)}</span>`
          );
        }
      }

      const hasAnyChange = changedTags.length > 0;

      if (hasAnyChange) {
        changeRows.push(`
          <tr class="row-changed">
            <td class="td-monster-name">${name}</td>
            <td>
              <div class="tw-position-list">
                ${[...changedTags, ...unchangedTags].join('\n')}
              </div>
            </td>
          </tr>
        `);
      } else {
        unchangedRows.push(`
          <tr>
            <td class="td-monster-name">${name}</td>
            <td style="color:#888;font-style:italic">无变更</td>
          </tr>
        `);
      }
    }

    // gen_prob 变更
    for (const change of genProbChanges) {
      const monster = originalMonsters[change.monsterIdx];
      const name = MONSTER_NAMES[monster.id] ?? monster.name;
      totalChangedPositions++;
      changeRows.push(`
        <tr class="row-changed">
          <td class="td-monster-name">${name}</td>
          <td><span class="tw-tag tw-tag-changed">gen_prob: ${change.newValue.toFixed(4)}</span></td>
        </tr>
      `);
    }

    const changedMonsterCount = changeRows.length;
    const unreachableHtml = unreachableCount > 0
      ? `<div class="unreachable-banner">⚠ ${unreachableReason}</div>`
      : '';

    if (timeWeightChanges.length === 0 && genProbChanges.length === 0) {
      this.container.innerHTML = `
        ${unreachableHtml}
        <div class="param-panel-placeholder" style="color:#e67e22">
          ⚠️ 优化完成，但无可修改参数。<br>
          <small>当前参数已达到目标值，或目标值为不可达（受 maxNum/genProb 限制）。</small>
        </div>`;
      return;
    }

    if (changedMonsterCount === 0) {
      this.container.innerHTML = `
        ${unreachableHtml}
        <div class="param-panel-header">
          <h3>参数优化建议</h3>
          <span class="rmse-badge">RMSE: ${rmse.toFixed(4)}</span>
        </div>
        <div class="param-panel-placeholder" style="color:#e67e22">
          ⚠️ 优化器未找到更优参数。${totalChangedPositions} 个位置已变更但与原值一致。
        </div>`;
      return;
    }

    let html = `
      ${unreachableHtml}
      <div class="param-panel-header">
        <h3>参数优化建议</h3>
        <span class="rmse-badge">RMSE: ${rmse.toFixed(4)}</span>
        <span class="change-count">${totalChangedPositions} 位修改</span>
        <button id="apply-btn" class="btn btn-success btn-sm">✓ 应用建议</button>
      </div>
      <div class="param-table-wrapper">
        <table class="param-table">
          <thead>
            <tr>
              <th style="width:80px">怪物</th>
              <th>变更详情（<span class="tw-tag tw-tag-changed" style="display:inline-block;padding:1px 4px;font-size:11px">高亮=已改</span>）</th>
            </tr>
          </thead>
          <tbody>
    `;

    html += changeRows.join('');

    if (unchangedRows.length > 0) {
      html += `
        <tr class="row-summary">
          <td colspan="2">${unchangedRows.length} 个怪物无变更（当前已最优）</td>
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
