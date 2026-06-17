export function buildLayout(): {
  sidebar: HTMLElement;
  chartContainer: HTMLElement;
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
        <main class="main-area">
          <div class="chart-container" id="chart-container"></div>
          <div class="param-panel" id="param-panel">
            <div class="param-panel-placeholder">拖拽曲线点后点击"优化参数"查看建议</div>
          </div>
        </main>
      </div>
    </div>
    <input type="file" id="file-input" accept=".xlsx" multiple style="display:none">
  `;

  return {
    sidebar: document.getElementById('sidebar')!,
    chartContainer: document.getElementById('chart-container')!,
    paramPanel: document.getElementById('param-panel')!,
    fileInput: document.getElementById('file-input') as HTMLInputElement,
  };
}
