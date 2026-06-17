import './styles.css';
import { buildLayout } from './ui/layout';
import { Controls } from './ui/controls';
import { CurveChart } from './ui/chart';
import { DragLayer } from './ui/drag-layer';
import { ParamPanel } from './ui/param-panel';
import { FileImport } from './ui/file-import';
import { exportModifiedExcel } from './export/excel-export';
import { WorkerPool } from './workers/worker-pool';
import { Optimizer } from './optimizer/coordinate-descent';
import { loadExcelFiles } from './parser/excel-parser';
import type { MapConfig, Monster, OptimizationResult } from './types';

// ============================================================
// 应用状态
// ============================================================
let maps: MapConfig[] = [];
let monsters: Monster[] = [];
let currentMapId: string = '';
let currentPool: 'indoor' | 'outdoor' = 'indoor';
let lastOptimizationResult: OptimizationResult | null = null;
let workerPool: WorkerPool | null = null;

// ============================================================
// 初始化 UI
// ============================================================
const { sidebar, chartContainer, paramPanel: paramPanelEl, fileInput } = buildLayout();

const controls = new Controls(sidebar, {
  onImport: () => fileImport.trigger(),
  onMapChange: async (mapId) => {
    currentMapId = mapId;
    await runSimulationAndRender();
  },
  onPoolChange: (pool) => {
    currentPool = pool;
    renderCurrentCurves();
  },
  onOptimize: runOptimization,
  onReset: resetAll,
  onExport: doExport,
});

const chart = new CurveChart(chartContainer);
const dragLayer = new DragLayer(chart.getChart());
const paramPanel = new ParamPanel(paramPanelEl);

paramPanel.onApply = async () => {
  if (!lastOptimizationResult) return;
  await runSimulationAndRender();
};

const fileImport = new FileImport(fileInput, {
  onFilesSelected: async (mapFile, monsterFile) => {
    await handleFilesImported(mapFile, monsterFile);
  },
  onError: (msg) => {
    alert(`导入错误: ${msg}`);
  },
});

// ============================================================
// 核心流程
// ============================================================

/** 处理文件导入 */
async function handleFilesImported(mapFile: File, monsterFile: File): Promise<void> {
  controls.setLocked(true);
  controls.setProgress(10, '解析 Excel...');

  try {
    const result = await loadExcelFiles(mapFile, monsterFile);
    maps = result.maps;
    monsters = result.monsters;

    if (maps.length === 0) {
      throw new Error('未找到有效地图数据');
    }

    controls.updateMaps(maps);
    currentMapId = maps[0].mapId;
    controls.setSelectedMap(currentMapId);

    controls.setProgress(30, '初始化模拟引擎...');

    // 初始化 Worker 池
    workerPool = new WorkerPool(4);
    workerPool.onProgress = (p) => controls.setProgress(30 + p * 0.6, '运行模拟...');
    await workerPool.init(maps, monsters);

    controls.setProgress(90, '渲染曲线...');
    await runSimulationAndRender();

    controls.setProgress(null);
    controls.setLocked(false);
  } catch (err) {
    controls.setProgress(null);
    controls.setLocked(false);
    alert(`导入失败: ${(err as Error).message}`);
  }
}

/** 运行模拟并渲染曲线 */
async function runSimulationAndRender(): Promise<void> {
  if (!workerPool || !currentMapId) return;

  try {
    controls.setProgress(50, '运行模拟...');
    const result = await workerPool.simulate(currentMapId, 10000, 42);
    controls.setProgress(90, '渲染曲线...');

    chart.renderCurves(result, monsters, currentPool);

    const mapCfg = maps.find(m => m.mapId === currentMapId)!;
    dragLayer.initHandles(result, monsters, currentPool, mapCfg.genProb);
    dragLayer.onTargetChanged = () => {
      // 目标点变化时不自动优化，等用户点击"优化"按钮
    };

    controls.setProgress(null);
  } catch (err) {
    controls.setProgress(null);
    alert(`模拟失败: ${(err as Error).message}`);
  }
}

/** 渲染当前曲线（切换室内/室外时） */
function renderCurrentCurves(): void {
  const { result } = chart.getCurrentData();
  if (!result) return;

  const mapCfg = maps.find(m => m.mapId === currentMapId);
  if (!mapCfg) return;

  chart.renderCurves(result, monsters, currentPool);
  dragLayer.initHandles(result, monsters, currentPool, mapCfg.genProb);
}

/** 运行参数优化 */
async function runOptimization(): Promise<void> {
  if (!workerPool || !currentMapId) {
    alert('请先导入数据');
    return;
  }

  const targets = dragLayer.getTargets();
  if (targets.length === 0) {
    alert('请先拖拽曲线点设定目标值');
    return;
  }

  controls.setLocked(true);
  paramPanel.showLoading('优化中，请稍候...');
  controls.setProgress(0, '初始化优化器...');

  try {
    const mapCfg = maps.find(m => m.mapId === currentMapId)!;
    const optimizer = new Optimizer(workerPool, mapCfg, monsters);

    const result = await optimizer.optimize(targets, (p) => {
      controls.setProgress(p, `优化中 ${p}%...`);
    });

    lastOptimizationResult = result;
    paramPanel.showComparison(monsters, result);

    controls.setProgress(null);
    controls.setLocked(false);
  } catch (err) {
    controls.setProgress(null);
    controls.setLocked(false);
    paramPanel.showError(`优化失败: ${(err as Error).message}`);
  }
}

/** 重置所有修改 */
async function resetAll(): Promise<void> {
  dragLayer.resetTargets();
  lastOptimizationResult = null;
  paramPanel.reset();
  await runSimulationAndRender();
}

/** 导出 Excel */
function doExport(): void {
  if (!lastOptimizationResult) {
    alert('请先运行优化，再导出结果');
    return;
  }

  const mapCfg = maps.find(m => m.mapId === currentMapId);
  if (!mapCfg) return;

  try {
    exportModifiedExcel(monsters, lastOptimizationResult, mapCfg);
  } catch (err) {
    alert(`导出失败: ${(err as Error).message}`);
  }
}
