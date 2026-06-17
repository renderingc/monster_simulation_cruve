import type { MapConfig } from '../types';
import { REGION_NAMES, DIFFICULTY_NAMES } from '../constants';

export interface ControlCallbacks {
  onMapChange: (mapId: string) => void;
  onPoolChange: (pool: 'indoor' | 'outdoor') => void;
  onImport: () => void;
  onOptimize: () => void;
  onReset: () => void;
  onExport: () => void;
}

export class Controls {
  private container: HTMLElement;
  private mapSelect!: HTMLSelectElement;
  private indoorTab!: HTMLButtonElement;
  private outdoorTab!: HTMLButtonElement;
  private optimizeBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private exportBtn!: HTMLButtonElement;
  private progressBar!: HTMLElement;
  private progressFill!: HTMLElement;
  private callbacks: ControlCallbacks;

  constructor(container: HTMLElement, callbacks: ControlCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="controls-panel">
        <div class="control-section">
          <h3>数据导入</h3>
          <button id="import-btn" class="btn btn-primary">📂 导入 Excel</button>
          <div id="import-status" class="import-status">未导入数据</div>
        </div>

        <div class="control-section">
          <h3>地图选择</h3>
          <select id="map-select" class="map-select" disabled>
            <option value="">-- 请先导入数据 --</option>
          </select>
        </div>

        <div class="control-section">
          <h3>视图切换</h3>
          <div class="tab-group">
            <button id="indoor-tab" class="tab-btn active">室内</button>
            <button id="outdoor-tab" class="tab-btn">室外</button>
          </div>
        </div>

        <div class="control-section">
          <h3>操作</h3>
          <button id="optimize-btn" class="btn btn-success" disabled>🔍 优化参数</button>
          <button id="reset-btn" class="btn btn-warning" disabled>↩ 重置</button>
          <button id="export-btn" class="btn btn-info" disabled>💾 导出 Excel</button>
        </div>

        <div class="control-section" id="progress-section" style="display:none">
          <div class="progress-label" id="progress-label">处理中...</div>
          <div class="progress-bar">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
        </div>
      </div>
    `;

    this.mapSelect = this.container.querySelector('#map-select')!;
    this.indoorTab = this.container.querySelector('#indoor-tab')!;
    this.outdoorTab = this.container.querySelector('#outdoor-tab')!;
    this.optimizeBtn = this.container.querySelector('#optimize-btn')!;
    this.resetBtn = this.container.querySelector('#reset-btn')!;
    this.exportBtn = this.container.querySelector('#export-btn')!;
    this.progressBar = this.container.querySelector('#progress-section')!;
    this.progressFill = this.container.querySelector('#progress-fill')!;

    this.container.querySelector('#import-btn')!.addEventListener('click', () => this.callbacks.onImport());
    this.mapSelect.addEventListener('change', () => this.callbacks.onMapChange(this.mapSelect.value));
    this.indoorTab.addEventListener('click', () => {
      this.setActiveTab('indoor');
      this.callbacks.onPoolChange('indoor');
    });
    this.outdoorTab.addEventListener('click', () => {
      this.setActiveTab('outdoor');
      this.callbacks.onPoolChange('outdoor');
    });
    this.optimizeBtn.addEventListener('click', () => this.callbacks.onOptimize());
    this.resetBtn.addEventListener('click', () => this.callbacks.onReset());
    this.exportBtn.addEventListener('click', () => this.callbacks.onExport());
  }

  /** 更新地图选择器 */
  updateMaps(maps: MapConfig[]): void {
    this.mapSelect.innerHTML = '';
    maps.forEach(m => {
      const option = document.createElement('option');
      option.value = m.mapId;
      const regionName = REGION_NAMES[m.regionId] ?? m.regionId;
      const diffName = DIFFICULTY_NAMES[m.difficulty] ?? m.difficulty;
      option.textContent = `${regionName} - ${diffName}`;
      this.mapSelect.appendChild(option);
    });
    this.mapSelect.disabled = false;
    this.optimizeBtn.disabled = false;
    this.resetBtn.disabled = false;
    this.exportBtn.disabled = false;
    const statusEl = this.container.querySelector('#import-status')!;
    statusEl.textContent = `已加载 ${maps.length} 张地图`;
    statusEl.className = 'import-status success';
  }

  /** 设置当前选中地图 */
  setSelectedMap(mapId: string): void {
    this.mapSelect.value = mapId;
  }

  /** 获取当前选中地图 ID */
  getSelectedMapId(): string {
    return this.mapSelect.value;
  }

  private setActiveTab(pool: 'indoor' | 'outdoor'): void {
    this.indoorTab.classList.toggle('active', pool === 'indoor');
    this.outdoorTab.classList.toggle('active', pool === 'outdoor');
  }

  /** 显示/隐藏进度条 */
  setProgress(percent: number | null, label?: string): void {
    if (percent === null) {
      this.progressBar.style.display = 'none';
    } else {
      this.progressBar.style.display = 'block';
      this.progressFill.style.width = `${percent}%`;
      if (label) {
        const labelEl = this.container.querySelector('#progress-label')!;
        labelEl.textContent = label;
      }
    }
  }

  /** 锁定/解锁所有操作按钮 */
  setLocked(locked: boolean): void {
    this.optimizeBtn.disabled = locked;
    this.resetBtn.disabled = locked;
    this.exportBtn.disabled = locked;
    this.mapSelect.disabled = locked;
  }
}
