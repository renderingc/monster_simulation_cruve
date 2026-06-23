export function buildLayout(): {
  sidebar: HTMLElement;
  chartContainer: HTMLElement;
  dataTable: HTMLElement;
  paramPanel: HTMLElement;
  fileInput: HTMLInputElement;
} {
  document.body.innerHTML = `
    <div class="app-layout">
      <header class="app-header">
        <h1>🎮 怪物生成曲线可视化编辑器</h1>
      </header>
      <div class="app-body">
        <aside class="sidebar" id="sidebar"></aside>
        <main class="main-area" id="main-area">
          <div class="chart-pane" id="chart-pane">
            <div class="chart-container" id="chart-container"></div>
          </div>
          <div class="split-bar" id="split-bar" title="拖拽调整上下比例"></div>
          <div class="bottom-pane" id="bottom-pane">
            <div class="data-table" id="data-table">
              <div class="table-placeholder">请先导入数据</div>
            </div>
            <div class="param-panel" id="param-panel">
              <div class="param-panel-placeholder">修改表格或拖拽曲线后点击"优化参数"查看建议</div>
            </div>
          </div>
        </main>
      </div>
    </div>
    <input type="file" id="file-input" accept=".xlsx" multiple style="display:none">
  `;

  // ==========================================
  // 可拖拽分屏逻辑
  // ==========================================
  const mainArea = document.getElementById('main-area')!;
  const chartPane = document.getElementById('chart-pane')!;
  const splitBar = document.getElementById('split-bar')!;
  const bottomPane = document.getElementById('bottom-pane')!;

  // 默认比例：图表 60%，底部 40%
  let splitRatio = 0.6;

  function applyRatio(ratio: number): void {
    const clamped = Math.max(0.2, Math.min(0.8, ratio));
    chartPane.style.flex = `0 0 ${clamped * 100}%`;
    bottomPane.style.flex = `0 0 ${(1 - clamped) * 100}%`;
  }

  applyRatio(splitRatio);

  let dragging = false;

  splitBar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    splitBar.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = mainArea.getBoundingClientRect();
    const y = e.clientY - rect.top;
    splitRatio = y / rect.height;
    applyRatio(splitRatio);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    splitBar.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // 窗口 resize 时保持比例
  window.addEventListener('resize', () => applyRatio(splitRatio));

  return {
    sidebar: document.getElementById('sidebar')!,
    chartContainer: document.getElementById('chart-container')!,
    dataTable: document.getElementById('data-table')!,
    paramPanel: document.getElementById('param-panel')!,
    fileInput: document.getElementById('file-input') as HTMLInputElement,
  };
}
