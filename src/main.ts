import './styles.css';
import { buildLayout } from './ui/layout';
import { Controls } from './ui/controls';
import { CurveChart } from './ui/chart';
import { DragLayer } from './ui/drag-layer';
import { ParamPanel } from './ui/param-panel';
import { FileImport } from './ui/file-import';
import { DataTable } from './ui/data-table';
import { exportModifiedMonsterExcel } from './export/excel-export';
import { WorkerPool } from './workers/worker-pool';
import { Optimizer } from './optimizer/coordinate-descent';
import { loadExcelFiles } from './parser/excel-parser';
import type { MapConfig, Monster, OptimizationResult, OptimizationTarget } from './types';

// ============================================================
// 应用状态
// ============================================================
let maps: MapConfig[] = [];
let monsters: Monster[] = [];
let currentMapId: string = '';
let currentPool: 'indoor' | 'outdoor' = 'indoor';
let currentDataMode: 'count' | 'prob' = 'count';
let lastOptimizationResult: OptimizationResult | null = null;
/** 原始 monster.xlsx 的 ArrayBuffer，导出时直接修改 */
let originalMonsterBuffer: ArrayBuffer | null = null;
/** 原始 monster.xlsx 的文件名，用于保存对话框建议名 */
let originalMonsterFileName: string = 'monster.xlsx';
/** 应用前的怪物快照，用于导出时对比原值 */
let originalMonstersSnapshot: Monster[] | null = null;
let workerPool: WorkerPool | null = null;

// ============================================================
// 初始化 UI
// ============================================================
const { sidebar, chartContainer, dataTable: dataTableEl, paramPanel: paramPanelEl, fileInput } = buildLayout();

const controls = new Controls(sidebar, {
  onImport: () => fileImport.trigger(),
  onMapChange: async (mapId) => {
    currentMapId = mapId;
    await runSimulationAndRender();
  },
  onPoolChange: (pool) => {
    currentPool = pool;
    dataTable.setDataMode(currentDataMode);
    renderCurrentCurves();
  },
  onOptimize: runOptimization,
  onReset: resetAll,
  onExport: doExport,
  onDataModeChange: (mode) => {
    currentDataMode = mode;
    chart.setDataMode(mode);
    dragLayer.setDataMode(mode);
    dataTable.setDataMode(mode);
  },
});

const chart = new CurveChart(chartContainer);
const dragLayer = new DragLayer(chart.getChart());
const paramPanel = new ParamPanel(paramPanelEl);
const dataTable = new DataTable(dataTableEl);

paramPanel.onApply = async () => {
  if (!lastOptimizationResult || !workerPool) return;

  controls.setLocked(true);
  controls.setProgress(0, '应用优化参数...');

  try {
    // 保存修改前的快照（供导出对比原值）
    originalMonstersSnapshot = monsters.map(m => ({
      ...m,
      timeWeight: [...m.timeWeight],
      numWeight: [...m.numWeight],
    }));

    // 1. 将 time_weight 修改应用到 monsters
    for (const change of lastOptimizationResult.timeWeightChanges) {
      monsters[change.monsterIdx].timeWeight = change.newValues;
    }

    // 2. 将 gen_prob 修改应用到当前地图
    const mapCfg = maps.find(m => m.mapId === currentMapId);
    if (mapCfg) {
      for (const change of lastOptimizationResult.genProbChanges) {
        mapCfg.genProb[change.monsterIdx] = change.newValue;
      }
    }

    // 3. 重新初始化 Worker 池（使用修改后的参数）
    controls.setProgress(30, '重新初始化引擎...');
    await workerPool.init(maps, monsters);

    // 4. 重新模拟并渲染
    await runSimulationAndRender();

    controls.setProgress(null);
    controls.setLocked(false);
  } catch (err) {
    controls.setProgress(null);
    controls.setLocked(false);
    alert(`应用失败: ${(err as Error).message}`);
  }
};

// 表格编辑 → 同步到拖拽层
dataTable.onTargetsChanged = (tableTargets) => {
  // 将表格目标合并到拖拽层显示
  dragLayer.syncFromTable(tableTargets);
};

// 拖拽修改 → 同步到表格
dragLayer.onTargetChanged = (dragTargets) => {
  dataTable.syncFromDragLayer(dragTargets);
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
    // 保存原始 monster.xlsx 的 ArrayBuffer 和文件名（导出时直接修改）
    originalMonsterBuffer = await monsterFile.arrayBuffer();
    originalMonsterFileName = monsterFile.name;

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

    // 更新表格
    dataTable.update(result, monsters, currentPool, currentDataMode);

    // 更新拖拽层
    dragLayer.initHandles(result, monsters, currentPool, mapCfg.genProb);

    controls.setProgress(null);
  } catch (err) {
    controls.setProgress(null);
    alert(`模拟失败: ${(err as Error).message}`);
  }
}

/** 渲染当前曲线（切换室内/室外/数据模式时） */
function renderCurrentCurves(): void {
  const { result } = chart.getCurrentData();
  if (!result) return;

  const mapCfg = maps.find(m => m.mapId === currentMapId);
  if (!mapCfg) return;

  chart.renderCurves(result, monsters, currentPool);
  dragLayer.initHandles(result, monsters, currentPool, mapCfg.genProb);

  // 表格数据跟随视图切换
  dataTable.update(result, monsters, currentPool, currentDataMode);
}

/** 合并拖拽层和表格的目标（拖拽优先） */
function mergeTargets(
  primary: OptimizationTarget[],
  secondary: OptimizationTarget[]
): OptimizationTarget[] {
  const merged = new Map<string, OptimizationTarget>();

  // 先插入次要来源（表格）
  for (const t of secondary) {
    const key = `${t.monsterIdx}-${t.pool}`;
    merged.set(key, { ...t, targets: [...t.targets] });
  }

  // 主要来源（拖拽）覆盖同波次
  for (const t of primary) {
    const key = `${t.monsterIdx}-${t.pool}`;
    if (merged.has(key)) {
      const existing = merged.get(key)!;
      const primaryWaves = new Set(t.targets.map(x => x.wave));
      const filtered = existing.targets.filter(x => !primaryWaves.has(x.wave));
      merged.set(key, { ...t, targets: [...filtered, ...t.targets] });
    } else {
      merged.set(key, { ...t, targets: [...t.targets] });
    }
  }

  return Array.from(merged.values());
}

/** 运行参数优化 */
async function runOptimization(): Promise<void> {
  if (!workerPool || !currentMapId) {
    alert('请先导入数据');
    return;
  }

  // 合并拖拽层和表格的目标值
  const dragTargets = dragLayer.getTargets();
  const tableTargets = dataTable.getTargets();
  const targets = mergeTargets(dragTargets, tableTargets);

  console.log('[优化] 拖拽目标:', dragTargets.length, '表格目标:', tableTargets.length, '合并后:', targets.length);
  for (const t of targets) {
    console.log(`  monsterIdx=${t.monsterIdx} pool=${t.pool} waves=[${t.targets.map(x => `w${x.wave}=${x.value.toFixed(1)}`).join(', ')}]`);
  }

  if (targets.length === 0) {
    alert('请先在表格中修改数值或拖拽曲线点设定目标值');
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
  dataTable.reset();
  lastOptimizationResult = null;
  originalMonstersSnapshot = null;
  paramPanel.reset();
  await runSimulationAndRender();
}

/** 导出 Excel — 弹出保存对话框，修改原始 monster.xlsx */
async function doExport(): Promise<void> {
  if (!lastOptimizationResult) {
    alert('请先运行优化，再导出结果');
    return;
  }

  if (!originalMonsterBuffer) {
    alert('原始 monster.xlsx 数据丢失，请重新导入');
    return;
  }

  try {
    const refMonsters = originalMonstersSnapshot ?? monsters;
    await exportModifiedMonsterExcel(originalMonsterBuffer, refMonsters, lastOptimizationResult, originalMonsterFileName);
  } catch (err) {
    alert(`导出失败: ${(err as Error).message}`);
  }
}
